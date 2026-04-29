/**
 * POST /api/kassenabrechnungen/[id]/neu-analysieren
 *
 * Lädt ein weiteres Dokument hoch (z.B. AXA-Begründungsschreiben) und
 * reichert die bestehende Analyse damit an — Delta-Strategie:
 * Claude gibt NUR die geänderten Felder zurück (klein, nie abgeschnitten),
 * der Server merged sie in die bestehende Analyse.
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

const ENRICH_SYSTEM_PROMPT = `Du bist ein PKV-Experte für AXA ActiveMe-U Kassenstreitigkeiten.

Du erhältst:
1. Ein AXA-Begründungsschreiben / Ablehnungsdetail als PDF
2. Eine Kurzübersicht der bereits analysierten Positionen aus der Leistungsabrechnung

AUFGABE: Lies das PDF-Dokument und gib NUR die verbesserten/ergänzten Felder zurück.

Antworte NUR mit diesem JSON (kein Text davor oder danach):
{
  "ablehnungsgruende": ["Konkrete Formulierung aus AXA-Schreiben 1", "..."],
  "zusammenfassung": "Aktualisierte Zusammenfassung mit Infos aus dem Begründungsschreiben (2-3 Sätze)",
  "widerspruchBegruendung": "Verbesserter Widerspruchstext der konkrete AXA-Formulierungen aufgreift und widerlegt",
  "widerspruchErklaerung": "Kurze Laien-Erklärung was die AXA-Ablehnung bedeutet (optional, leer lassen wenn nicht nötig)",
  "positionUpdates": [
    { "goaeZiffer": "4312", "ablehnungsbegruendung": "Konkrete Begründung aus dem Schreiben für diese Position" }
  ]
}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSlimContext(existingAnalyse: Record<string, any>): string {
  // Nur minimaler Kontext — keine Beträge, nur GOÄ-Ziffern + Status + aktuelle Ablehnungsgründe
  const positionen: string[] = []
  for (const rechnung of existingAnalyse.rechnungen ?? []) {
    for (const pos of rechnung.positionen ?? []) {
      if (pos.status === 'abgelehnt' || pos.status === 'gekuerzt') {
        positionen.push(`GOÄ ${pos.goaeZiffer ?? pos.ziffer ?? '?'}: ${pos.leistung ?? pos.bezeichnung ?? ''} (${pos.status})`)
      }
    }
  }
  const aktuelleGruende = (existingAnalyse.ablehnungsgruende as string[] | null)?.join('\n- ') ?? 'keine'

  return `Aktuell bekannte Ablehnungsgründe (aus Leistungsabrechnung):
- ${aktuelleGruende}

Abgelehnte/gekürzte Positionen:
${positionen.map(p => `- ${p}`).join('\n')}

Bitte ergänze/präzisiere basierend auf dem AXA-Begründungsschreiben oben.`
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

  // ── Credit gate ───────────────────────────────────────────────────────────
  const creditCheck = await checkAndDeductAnalysisCredit(user.id, 'kasse_analyse', { source: 'neu_analysieren' })
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'no_credits', message: 'Keine Analyse-Credits verfügbar.' }, { status: 402 })
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

  // ── Modell laden ──────────────────────────────────────────────────────────
  const { data: modelRow } = await admin
    .from('app_settings').select('value').eq('key', 'kasse_analyse_model').single()
  const model = modelRow?.value || 'claude-sonnet-4-6'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingAnalyse = kasse.kasse_analyse as Record<string, any>
    const slimContext = buildSlimContext(existingAnalyse)

    // ── Delta-Anfrage: kleiner Output, nie abgeschnitten ──────────────────
    const { text: raw, usage } = await callAiWithPdf({
      model,
      systemPrompt: ENRICH_SYSTEM_PROMPT,
      userPrompt: slimContext,
      pdfBase64: newPdfBuffer.toString('base64'),
      maxTokens: 3000,   // Delta ist klein — 3000 reichen immer
    })

    logKiUsage({ callType: 'kasse_analyse', model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, userId: user.id }).catch(() => {})

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Keine JSON-Antwort von KI')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delta = JSON.parse(jsonMatch[0]) as Record<string, any>

    // ── Delta in bestehende Analyse mergen ────────────────────────────────
    const merged = { ...existingAnalyse }

    if (delta.ablehnungsgruende?.length)  merged.ablehnungsgruende  = delta.ablehnungsgruende
    if (delta.zusammenfassung)            merged.zusammenfassung    = delta.zusammenfassung
    if (delta.widerspruchBegruendung)     merged.widerspruchBegruendung = delta.widerspruchBegruendung
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

    // ── Kassenabrechnungen updaten ─────────────────────────────────────────
    await admin.from('kassenabrechnungen').update({ kasse_analyse: merged }).eq('id', id)

    // ── Matching neu ausführen ─────────────────────────────────────────────
    const updatedRechnungen = await matchKasseToVorgaenge(id, user.id, merged.rechnungen ?? [])
    await admin
      .from('kassenabrechnungen')
      .update({ kasse_analyse: { ...merged, rechnungen: updatedRechnungen } })
      .eq('id', id)

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[neu-analysieren] Fehler:', err)
    return NextResponse.json({ error: `Analyse fehlgeschlagen: ${String(err)}` }, { status: 500 })
  }
}
