/**
 * POST /api/kassenabrechnungen/[id]/neu-analysieren
 *
 * Zwei-Stufen-Analyse für ein zweites AXA-Dokument:
 * 1. Fakten-Extraktion (~15s): Ablehnungsgründe + Positions-Begründungen aus neuem PDF
 * 2. Widerspruchsbrief-Generierung (~25s): neuer Entwurf auf Basis der aktualisierten Fakten
 * Gesamt ~40s, maxDuration=120s gibt genug Puffer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { callAiWithPdf } from '@/lib/ai-client'
import { logKiUsage } from '@/lib/ki-usage'
import { searchPkvPrecedentsByZiffer } from '@/lib/legal-search'
import { randomUUID } from 'crypto'

export const maxDuration = 120

/** Extrahiert JSON aus einer KI-Antwort — toleriert Markdown-Fences und führenden Text */
function extractJson(raw: string): string | null {
  // Markdown-Fences entfernen: ```json ... ``` oder ``` ... ```
  const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()
  const m = stripped.match(/\{[\s\S]*\}/)
  return m ? m[0] : null
}

const ENRICH_SYSTEM_PROMPT = `Du bist ein PKV-Experte für AXA Kassenstreitigkeiten und GOÄ-Abrechnungsrecht.
Du analysierst konkrete Ablehnungsbegründungen gegen Tarif-Klauseln und Rechtsprechung.
Antworte ausschließlich mit einem JSON-Objekt, ohne einleitenden Text oder Markdown.`

interface EnrichContext {
  tarifAusschluesse: string   // GOÄ-Ausschluss-Klauseln aus dem Versicherungsvertrag
  rechtsprechung: string       // Relevante BGH/OLG-Urteile zu den abgelehnten Ziffern
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEnrichPrompt(existingAnalyse: Record<string, any>, ctx: EnrichContext): string {
  const positionen: string[] = []
  for (const rechnung of existingAnalyse.rechnungen ?? []) {
    for (const pos of rechnung.positionen ?? []) {
      if (pos.status === 'abgelehnt' || pos.status === 'gekuerzt') {
        positionen.push(
          `GOÄ ${pos.goaeZiffer ?? pos.ziffer ?? '?'}: ${pos.leistung ?? pos.bezeichnung ?? ''} ` +
          `(${pos.status}, Kürzung: ${((pos.betragEingereicht ?? 0) - (pos.betragErstattet ?? 0)).toFixed(2)} €)`
        )
      }
    }
  }

  const tarifBlock = ctx.tarifAusschluesse
    ? `\n## Relevante Vertragsklauseln (Tarif-Ausschlüsse)\n${ctx.tarifAusschluesse}`
    : ''

  const rechtsBlock = ctx.rechtsprechung
    ? `\n## Relevante Rechtsprechung (BGH/OLG)\n${ctx.rechtsprechung}`
    : ''

  return `Lies das beigefügte AXA-Dokument (Begründungsschreiben zur Ablehnung).

## Abgelehnte / gekürzte Positionen aus dem Kassenbescheid
${positionen.map(p => `- ${p}`).join('\n') || '(keine)'}
${tarifBlock}${rechtsBlock}

## Deine Aufgabe
1. Extrahiere die konkreten Ablehnungsbegründungen pro GOÄ-Ziffer aus dem Begründungsschreiben.
2. Prüfe jede Ablehnung gegen die Vertragsklauseln: Ist die Ablehnung vertragskonform oder angreifbar?
3. Prüfe ob BGH/OLG-Urteile die Versichertenposition stützen.
4. Erstelle eine präzise "zusammenfassung" die klar benennt:
   - Welche Positionen mit welcher Begründung abgelehnt wurden
   - Welche davon angreifbar sind (und warum: Klausel greift nicht / BGH-Urteil)
   - Welche Positionen eher nicht erfolgreich anfechtbar sind
5. Setze "widerspruchErfolgswahrscheinlichkeit" basierend auf Klausel-Analyse + Rechtsprechung (nicht pauschal).

WICHTIG: "zusammenfassung" darf 3-4 Sätze sein wenn nötig. Konkret, nicht generisch — echte Ziffern und Gründe nennen.

JSON-Ausgabe (exakt diese Felder, kein Text davor/danach):
{
  "ablehnungsgruende": ["Konkrete Ablehnung GOÄ ZZZ: [Grund aus Schreiben] — max 25 Wörter"],
  "zusammenfassung": "Positions-scharfe Analyse: Welche Ablehnungen sind angreifbar und warum (Klausel/BGH), welche nicht.",
  "widerspruchEmpfohlen": true,
  "widerspruchErklaerung": "Konkreter Grund warum Widerspruch Erfolg hat — Klausel oder Urteil nennen.",
  "widerspruchErfolgswahrscheinlichkeit": 70,
  "naechsteSchritte": ["Schritt 1 konkret", "Schritt 2 konkret", "Schritt 3 konkret"],
  "positionUpdates": [
    { "goaeZiffer": "3561", "ablehnungsbegruendung": "Exakte Begründung aus AXA-Schreiben, max 2 Sätze." }
  ]
}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // ── Ownership-Check + bestehende Analyse laden ────────────────────────────
  const { data: kasse } = await admin
    .from('kassenabrechnungen')
    .select('id, user_id, kasse_analyse')
    .eq('id', id)
    .maybeSingle()

  if (!kasse) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  if (kasse.user_id !== user.id) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  if (!kasse.kasse_analyse) {
    return NextResponse.json({ error: 'Noch keine Erstanalyse vorhanden.' }, { status: 400 })
  }

  // ── Neues PDF aus Form-Data ───────────────────────────────────────────────
  let formData: FormData
  try { formData = await request.formData() }
  catch { return NextResponse.json({ error: 'Ungültige Formulardaten' }, { status: 400 }) }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Keine Datei übermittelt' }, { status: 400 })
  }
  if (!file.type.includes('pdf') && !(file as File).name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Nur PDF-Dateien' }, { status: 400 })
  }

  const newPdfBuffer = Buffer.from(await file.arrayBuffer())
  if (newPdfBuffer.length === 0) return NextResponse.json({ error: 'Leere Datei' }, { status: 400 })

  // ── Neues PDF in Storage speichern ────────────────────────────────────────
  const newFileName = `${user.id}/kasse_zusatz_${Date.now()}_${randomUUID().slice(0, 8)}.pdf`
  await admin.storage
    .from('rechnungen')
    .upload(newFileName, newPdfBuffer, { contentType: 'application/pdf', upsert: false })
    .catch(() => {})

  // ── Tarif-Klauseln + BGH-Urteile für abgelehnte Ziffern laden ───────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingAnalyse = kasse.kasse_analyse as Record<string, any>

  // Abgelehnte GOÄ-Ziffern sammeln
  const abgelehnteZiffern: string[] = []
  for (const rechnung of existingAnalyse.rechnungen ?? []) {
    for (const pos of rechnung.positionen ?? []) {
      if (pos.status === 'abgelehnt' || pos.status === 'gekuerzt') {
        const z = String(pos.goaeZiffer ?? pos.ziffer ?? '')
        if (z && !abgelehnteZiffern.includes(z)) abgelehnteZiffern.push(z)
      }
    }
  }

  // Tarif-Klauseln für abgelehnte Ziffern aus tarif_profile laden
  let tarifAusschluesse = ''
  try {
    const { data: tp } = await admin
      .from('tarif_profile')
      .select('profil_json')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ausschluesse = (tp?.profil_json as any)?.goae_ausschluesse as any[] | undefined
    if (ausschluesse?.length) {
      const relevante = ausschluesse.filter((a: { ziffern_liste?: string[]; ziffer_pattern?: string }) => {
        if (a.ziffern_liste?.some((z: string) => abgelehnteZiffern.includes(z))) return true
        if (a.ziffer_pattern) {
          try { return abgelehnteZiffern.some(z => new RegExp(a.ziffer_pattern as string).test(z)) }
          catch { return false }
        }
        return false
      })
      if (relevante.length) {
        tarifAusschluesse = relevante.map((a: {
          bezeichnung?: string; klausel?: string; einschraenkung?: string; angreifbar_wenn?: string
        }) =>
          `- ${a.bezeichnung ?? ''}: ${a.klausel ?? ''}\n  Einschränkung: ${a.einschraenkung ?? ''}\n  Angreifbar wenn: ${a.angreifbar_wenn ?? '—'}`
        ).join('\n')
      }
    }
  } catch { /* tarif_profile optional */ }

  // BGH/OLG-Urteile für abgelehnte Ziffern laden
  let rechtsprechung = ''
  try {
    if (abgelehnteZiffern.length) {
      rechtsprechung = await searchPkvPrecedentsByZiffer(abgelehnteZiffern, 5)
    }
  } catch { /* Rechtsprechung optional */ }

  // ── Sonnet für qualitativ hochwertige Analyse (gerichtsfeste Argumente) ──
  const model = 'claude-sonnet-4-6'

  try {
    const enrichPrompt = buildEnrichPrompt(existingAnalyse, { tarifAusschluesse, rechtsprechung })

    // ── Delta-Anfrage mit Assistant-Prefill → Claude MUSS mit { antworten ──
    const { text: raw, usage } = await callAiWithPdf({
      model,
      systemPrompt: ENRICH_SYSTEM_PROMPT,
      userPrompt: enrichPrompt,
      pdfBase64: newPdfBuffer.toString('base64'),
      maxTokens: 5000,
    })

    logKiUsage({ callType: 'kasse_analyse', model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, userId: user.id }).catch(() => {})

    const jsonStr = extractJson(raw)
    if (!jsonStr) throw new Error(`Keine JSON-Antwort von KI (Rohtext: ${raw.slice(0, 200)})`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delta = JSON.parse(jsonStr) as Record<string, any>

    // ── Delta in bestehende Analyse mergen ────────────────────────────────
    // Nur Fakten aus dem neuen Dokument übernehmen.
    // Widerspruchsbrief bleibt erhalten / wird per ki-entwurf neu generiert.
    const merged = { ...existingAnalyse }

    // Always replace ablehnungsgruende — even if delta has 0 entries (means PDF
    // contained no new reasons; preserve existing ones in that case).
    if (Array.isArray(delta.ablehnungsgruende) && delta.ablehnungsgruende.length > 0) {
      merged.ablehnungsgruende = delta.ablehnungsgruende
    }
    if (delta.zusammenfassung)       merged.zusammenfassung      = delta.zusammenfassung
    if (delta.widerspruchErklaerung) merged.widerspruchErklaerung = delta.widerspruchErklaerung

    // Handlungsempfehlung fields — update from Begründungsschreiben
    if (typeof delta.widerspruchEmpfohlen === 'boolean') merged.widerspruchEmpfohlen = delta.widerspruchEmpfohlen
    if (typeof delta.widerspruchErfolgswahrscheinlichkeit === 'number') {
      merged.widerspruchErfolgswahrscheinlichkeit = delta.widerspruchErfolgswahrscheinlichkeit
    }
    if (Array.isArray(delta.naechsteSchritte) && delta.naechsteSchritte.length > 0) {
      merged.naechsteSchritte = delta.naechsteSchritte
    }

    // Persist the path of the new PDF so the case header can link to it
    merged.neuAnalysePdfPath = newFileName

    // Timestamp so UI can prove freshness after reload
    merged.neuAnalysiertAm = new Date().toISOString()

    // Per-Position ablehnungsbegruendung updaten
    if (Array.isArray(delta.positionUpdates) && delta.positionUpdates.length > 0) {
      const updateMap = new Map(
        delta.positionUpdates.map((u: { goaeZiffer: string; ablehnungsbegruendung: string }) =>
          [String(u.goaeZiffer), u.ablehnungsbegruendung]
        )
      )
      for (const rechnung of merged.rechnungen ?? []) {
        for (const pos of rechnung.positionen ?? []) {
          const ziffer = String(pos.goaeZiffer ?? pos.ziffer ?? '')
          if (updateMap.has(ziffer)) {
            pos.ablehnungsbegruendung = updateMap.get(ziffer)
          }
        }
      }
    }

    // ── Speichern ─────────────────────────────────────────────────────────
    const { error: updateError, data: updateData } = await admin
      .from('kassenabrechnungen')
      .update({ kasse_analyse: merged })
      .eq('id', id)
      .select('id, kasse_analyse')
      .maybeSingle()

    if (updateError) throw new Error(`DB-Update fehlgeschlagen: ${updateError.message}`)

    // Return the full updated analyse so the client can update React state
    // without needing a page reload at all
    const updatedAnalyse = (updateData?.kasse_analyse as Record<string, unknown> | null) ?? merged
    const savedGruende = updatedAnalyse?.ablehnungsgruende
    const gruendeCount = Array.isArray(savedGruende) ? savedGruende.length : 0

    // Return positionUpdates so the UI can show per-position ablehnungsbegruendung inline
    const positionUpdatesForClient = Array.isArray(delta.positionUpdates)
      ? delta.positionUpdates as { goaeZiffer: string; ablehnungsbegruendung: string }[]
      : []

    return NextResponse.json({
      success: true,
      ablehnungsgruendeCount: gruendeCount,
      ablehnungsgruende: Array.isArray(savedGruende) ? savedGruende : [],
      positionUpdates: positionUpdatesForClient,
      neuAnalysiertAm: merged.neuAnalysiertAm,
      // Handlungsempfehlung fields for live UI update
      widerspruchEmpfohlen:                merged.widerspruchEmpfohlen ?? null,
      widerspruchErklaerung:               merged.widerspruchErklaerung ?? null,
      widerspruchErfolgswahrscheinlichkeit: merged.widerspruchErfolgswahrscheinlichkeit ?? null,
      naechsteSchritte:                    merged.naechsteSchritte ?? null,
      zusammenfassung:                     merged.zusammenfassung ?? null,
    })

  } catch (err) {
    console.error('[neu-analysieren] Fehler:', err)
    return NextResponse.json({ error: `Analyse fehlgeschlagen: ${String(err)}` }, { status: 500 })
  }
}
