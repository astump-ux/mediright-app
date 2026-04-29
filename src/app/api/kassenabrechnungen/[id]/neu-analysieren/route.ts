/**
 * POST /api/kassenabrechnungen/[id]/neu-analysieren
 *
 * Lädt ein weiteres Dokument hoch (z.B. AXA-Begründungsschreiben) und
 * REICHERT die bestehende Analyse damit an — ohne die korrekt extrahierten
 * Finanzdaten der Erstanalyse zu überschreiben.
 *
 * Strategie: "Enrich, don't replace"
 *   1. Bestehende kasse_analyse aus DB laden (hat korrekte Beträge)
 *   2. Nur das neue PDF + bestehende Analyse-JSON an Claude schicken
 *   3. Claude ergänzt Ablehnungsgründe, Widerspruchsbegründung etc.
 *   4. Finanzielle Felder werden von Claude NICHT verändert
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { matchKasseToVorgaenge } from '@/lib/matching'
import { checkAndDeductAnalysisCredit } from '@/lib/credits'
import { callAiWithPdf } from '@/lib/ai-client'
import { logKiUsage } from '@/lib/ki-usage'
import { randomUUID } from 'crypto'

export const maxDuration = 120

const ENRICH_SYSTEM_PROMPT = `Du bist ein PKV-Experte und Rechtsberater für Kassenstreitigkeiten (AXA ActiveMe-U).

Du erhältst:
1. Ein neues AXA-Dokument (z.B. Begründungsschreiben, detaillierte Ablehnung) — als PDF
2. Eine bereits erstellte JSON-Analyse der Leistungsabrechnung

DEINE AUFGABE:
Reichere die bestehende Analyse mit Informationen aus dem neuen Dokument an.

ABSOLUT WICHTIG — Diese Felder NIEMALS verändern:
- betragEingereicht, betragErstattet, betragAbgelehnt (Gesamtbeträge)
- Für jede Position in rechnungen[].positionen[]: betragEingereicht, betragErstattet, faktor, status, aktionstyp
- bescheiddatum, referenznummer, erstattungsquote

NUR DIESE Felder verbessern:
- ablehnungsgruende: Ergänze/präzisiere mit konkreten Formulierungen aus dem neuen Dokument
- widerspruchBegruendung: Stärke die Argumentation mit Details aus dem Begründungsschreiben
- zusammenfassung: Aktualisiere mit vollständigem Bild (beide Dokumente)
- widerspruchErklaerung: Verbessere falls vorhanden
- naechsteSchritte: Aktualisiere falls nötig
- Für jede Position: ablehnungsbegruendung (falls das neue Dok konkrete Begründung liefert)

Antworte NUR mit dem vollständigen aktualisierten JSON — exakt gleiche Struktur wie die Eingabe, kein Text davor oder danach.`

function buildEnrichUserPrompt(existingAnalyse: Record<string, unknown>): string {
  return `Hier ist die bestehende Analyse der Leistungsabrechnung als JSON:

\`\`\`json
${JSON.stringify(existingAnalyse, null, 2)}
\`\`\`

Das obige PDF-Dokument ist ein ergänzendes AXA-Schreiben (Begründung / Ablehnung).
Reichere die bestehende Analyse damit an. Behalte ALLE Beträge exakt wie angegeben.
Antworte nur mit dem vollständigen aktualisierten JSON.`
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
    return NextResponse.json({ error: 'Noch keine Erstanalyse vorhanden. Bitte zuerst den Kassenbescheid hochladen.' }, { status: 400 })
  }

  // ── Credit gate ───────────────────────────────────────────────────────────
  const creditCheck = await checkAndDeductAnalysisCredit(user.id, 'kasse_analyse', { source: 'neu_analysieren' })
  if (!creditCheck.allowed) {
    return NextResponse.json(
      { error: 'no_credits', message: 'Keine Analyse-Credits verfügbar.' },
      { status: 402 }
    )
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
    .catch(() => { /* non-critical if storage fails */ })

  // ── Modell laden ──────────────────────────────────────────────────────────
  const { data: modelRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'kasse_analyse_model')
    .single()
  const model = modelRow?.value || 'claude-sonnet-4-6'

  try {
    // ── Anreicherungs-Analyse: neues PDF + bestehende JSON ─────────────────
    const existingAnalyse = kasse.kasse_analyse as Record<string, unknown>
    const userPrompt = buildEnrichUserPrompt(existingAnalyse)

    const { text: raw, usage } = await callAiWithPdf({
      model,
      systemPrompt: ENRICH_SYSTEM_PROMPT,
      userPrompt,
      pdfBase64: newPdfBuffer.toString('base64'),
      maxTokens: 8192,
    })

    logKiUsage({ callType: 'kasse_analyse', model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, userId: user.id }).catch(() => {})

    // JSON aus Antwort extrahieren
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Keine JSON-Antwort von KI')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = JSON.parse(jsonMatch[0]) as Record<string, any>

    // Sicherheitsnetz: finanzielle Felder aus Originalanalyse wiederherstellen
    // (falls Claude sie trotz Anweisung verändert hat)
    const FINANCIAL_FIELDS = ['betragEingereicht', 'betragErstattet', 'betragAbgelehnt', 'erstattungsquote', 'bescheiddatum', 'referenznummer'] as const
    for (const field of FINANCIAL_FIELDS) {
      if (existingAnalyse[field] !== undefined) {
        enriched[field] = existingAnalyse[field]
      }
    }

    // Positionen-Beträge aus Original wiederherstellen
    if (Array.isArray(existingAnalyse.rechnungen) && Array.isArray(enriched.rechnungen)) {
      for (let ri = 0; ri < existingAnalyse.rechnungen.length; ri++) {
        const origRechnung = existingAnalyse.rechnungen[ri] as Record<string, unknown>
        const enrichRechnung = enriched.rechnungen[ri] as Record<string, unknown> | undefined
        if (!enrichRechnung) continue

        const origPositionen = (origRechnung.positionen ?? []) as Array<Record<string, unknown>>
        const enrichPositionen = (enrichRechnung.positionen ?? []) as Array<Record<string, unknown>>

        for (let pi = 0; pi < origPositionen.length; pi++) {
          const orig = origPositionen[pi]
          const enrich = enrichPositionen[pi] as Record<string, unknown> | undefined
          if (!enrich) continue
          // Beträge + Status + Aktionstyp aus Original erzwingen
          const PROTECTED = ['betragEingereicht', 'betragErstattet', 'faktor', 'status', 'aktionstyp', 'goaeZiffer'] as const
          for (const f of PROTECTED) {
            if (orig[f] !== undefined) enrich[f] = orig[f]
          }
        }
      }
    }

    // ── Einsparpotenzial-Split aus enriched Daten ─────────────────────────
    let betragWiderspruchKasse = 0
    let betragKorrekturArzt    = 0
    for (const gruppe of (enriched.rechnungen ?? []) as Array<{ positionen?: Array<Record<string, unknown>> }>) {
      for (const pos of gruppe.positionen ?? []) {
        const kuerzung = ((pos.betragEingereicht as number) ?? 0) - ((pos.betragErstattet as number) ?? 0)
        if (kuerzung <= 0) continue
        if (pos.aktionstyp === 'widerspruch_kasse')   betragWiderspruchKasse += kuerzung
        else if (pos.aktionstyp === 'korrektur_arzt') betragKorrekturArzt    += kuerzung
        else if (pos.status === 'abgelehnt')          betragWiderspruchKasse += kuerzung
        else if (pos.status === 'gekuerzt')           betragKorrekturArzt    += kuerzung
      }
    }

    // ── Kassenabrechnungen updaten ─────────────────────────────────────────
    await admin
      .from('kassenabrechnungen')
      .update({
        kasse_analyse:             enriched,
        betrag_widerspruch_kasse:  Math.round(betragWiderspruchKasse * 100) / 100,
        betrag_korrektur_arzt:     Math.round(betragKorrekturArzt    * 100) / 100,
      })
      .eq('id', id)

    // ── Matching neu ausführen ─────────────────────────────────────────────
    const updatedRechnungen = await matchKasseToVorgaenge(id, user.id, enriched.rechnungen ?? [])
    await admin
      .from('kassenabrechnungen')
      .update({ kasse_analyse: { ...enriched, rechnungen: updatedRechnungen } })
      .eq('id', id)

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[neu-analysieren] Fehler:', err)
    return NextResponse.json({ error: `Analyse fehlgeschlagen: ${String(err)}` }, { status: 500 })
  }
}
