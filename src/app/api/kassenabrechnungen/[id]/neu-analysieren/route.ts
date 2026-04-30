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
import { callAiWithPdf, callAiText } from '@/lib/ai-client'
import { logKiUsage } from '@/lib/ki-usage'
import { randomUUID } from 'crypto'

export const maxDuration = 120

/** Extrahiert JSON aus einer KI-Antwort — toleriert Markdown-Fences und führenden Text */
function extractJson(raw: string): string | null {
  // Markdown-Fences entfernen: ```json ... ``` oder ``` ... ```
  const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()
  const m = stripped.match(/\{[\s\S]*\}/)
  return m ? m[0] : null
}

const ENRICH_SYSTEM_PROMPT = `Du bist ein PKV-Experte für AXA ActiveMe-U Kassenstreitigkeiten.
Antworte ausschließlich mit einem JSON-Objekt, ohne einleitenden Text oder Markdown.`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEnrichPrompt(existingAnalyse: Record<string, any>): string {
  const positionen: string[] = []
  for (const rechnung of existingAnalyse.rechnungen ?? []) {
    for (const pos of rechnung.positionen ?? []) {
      if (pos.status === 'abgelehnt' || pos.status === 'gekuerzt') {
        positionen.push(`GOÄ ${pos.goaeZiffer ?? pos.ziffer ?? '?'}: ${pos.leistung ?? pos.bezeichnung ?? ''} (${pos.status})`)
      }
    }
  }
  const aktuelleGruende = (existingAnalyse.ablehnungsgruende as string[] | null)?.join('\n- ') ?? 'keine'

  return `Lies das beigefügte AXA-Dokument und extrahiere die Ablehnungsgründe.

Abgelehnte / gekürzte Positionen:
${positionen.map(p => `- ${p}`).join('\n') || '(keine)'}

WICHTIG: Halte alle Texte kurz (max. 1 Satz pro Feld).

JSON-Ausgabe (nur diese Felder, keine weiteren):
{
  "ablehnungsgruende": ["Grund 1 — max 20 Wörter", "Grund 2 — max 20 Wörter"],
  "zusammenfassung": "Max 2 Sätze.",
  "widerspruchErklaerung": "Max 1 Satz.",
  "positionUpdates": [
    { "goaeZiffer": "3561", "ablehnungsbegruendung": "Max 1 Satz aus AXA-Schreiben" }
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

  // ── Sonnet für qualitativ hochwertige Analyse (gerichtsfeste Argumente) ──
  const model = 'claude-sonnet-4-6'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingAnalyse = kasse.kasse_analyse as Record<string, any>
    const enrichPrompt = buildEnrichPrompt(existingAnalyse)

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

    if (delta.ablehnungsgruende?.length)  merged.ablehnungsgruende  = delta.ablehnungsgruende
    if (delta.zusammenfassung)            merged.zusammenfassung    = delta.zusammenfassung
    if (delta.widerspruchErklaerung)      merged.widerspruchErklaerung  = delta.widerspruchErklaerung

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

    // ── Stufe 1 speichern ─────────────────────────────────────────────────
    await admin.from('kassenabrechnungen').update({ kasse_analyse: merged }).eq('id', id)

    // ── Stufe 2: Widerspruchsbrief neu generieren ─────────────────────────
    // Auf Basis der jetzt aktualisierten Fakten einen präzisen Widerspruch schreiben.
    const ablehnungsgruende = (merged.ablehnungsgruende as string[] ?? []).map((g: string) => `- ${g}`).join('\n')
    const positionen2: string[] = []
    for (const rechnung of merged.rechnungen ?? []) {
      for (const pos of (rechnung.positionen ?? []) as Array<Record<string, unknown>>) {
        if (pos.status === 'abgelehnt' || pos.status === 'gekuerzt') {
          const begruendung = pos.ablehnungsbegruendung ? ` — AXA: "${pos.ablehnungsbegruendung}"` : ''
          positionen2.push(`GOÄ ${pos.goaeZiffer ?? pos.ziffer ?? '?'}: ${pos.leistung ?? pos.bezeichnung ?? ''}${begruendung}`)
        }
      }
    }

    const widerspruchPrompt = `Du bist ein PKV-Anwalt der für den Versicherten einen schriftlichen Widerspruch verfasst.

AXA Ablehnungsgründe:
${ablehnungsgruende || '(keine expliziten Gründe)'}

Abgelehnte/gekürzte GOÄ-Positionen:
${positionen2.map(p => `- ${p}`).join('\n') || '(keine)'}

Schreibe einen vollständigen, juristisch fundierten Widerspruchsbrief der:
- Jeden AXA-Ablehnungsgrund konkret widerlegt
- GOÄ-konforme Argumente für jede abgelehnte Position liefert
- Auf BGH-Rechtsprechung zu PKV-Ablehnungen verweist wo relevant
- Professionell und sachlich formuliert ist

Antworte NUR mit dem Brieftext, ohne JSON, ohne Erklärungen.`

    try {
      const { text: widerspruchText, usage: u2 } = await callAiText({
        model,
        prompt: widerspruchPrompt,
        maxTokens: 4000,
      })
      logKiUsage({ callType: 'kasse_analyse', model, inputTokens: u2.inputTokens, outputTokens: u2.outputTokens, userId: user.id }).catch(() => {})

      if (widerspruchText.length > 100) {
        merged.widerspruchBegruendung = widerspruchText
        await admin.from('kassenabrechnungen').update({ kasse_analyse: merged }).eq('id', id)
      }
    } catch (wErr) {
      // Stufe 2 Fehler sind nicht kritisch — Fakten wurden bereits in Stufe 1 gespeichert
      console.error('[neu-analysieren] Widerspruch-Generierung fehlgeschlagen:', wErr)
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[neu-analysieren] Fehler:', err)
    return NextResponse.json({ error: `Analyse fehlgeschlagen: ${String(err)}` }, { status: 500 })
  }
}
