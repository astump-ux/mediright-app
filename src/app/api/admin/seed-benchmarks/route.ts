/**
 * POST /api/admin/seed-benchmarks
 *
 * Verarbeitet EINEN pending tarif_benchmark Eintrag pro Aufruf.
 * Geschützt durch x-internal-secret Header.
 *
 * Aufruf (curl):
 *   curl -X POST https://deine-app.vercel.app/api/admin/seed-benchmarks \
 *     -H "x-internal-secret: DEIN_SECRET" | jq
 *
 * GET /api/admin/seed-benchmarks — gibt Status-Übersicht zurück (kein Secret nötig für Status)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''
const MODEL           = 'claude-opus-4-6'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Status-Abruf (GET) ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('tarif_benchmarks')
      .select('versicherer, tarif_name, analyse_status, analysiert_am')
      .order('versicherer')

    if (error) return NextResponse.json({ error: error.message, hint: 'Migration noch nicht ausgeführt?' }, { status: 500 })
    return NextResponse.json({ benchmarks: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── Seed: einen Eintrag verarbeiten (POST) ────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const secret = req.headers.get('x-internal-secret')
  if (INTERNAL_SECRET && secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  // Nächsten pending Eintrag holen
  const { data: bench } = await admin
    .from('tarif_benchmarks')
    .select('id, versicherer, tarif_name, avb_url')
    .eq('analyse_status', 'pending')
    .order('versicherer')
    .limit(1)
    .single()

  if (!bench) {
    // Prüfen ob noch failed gibt
    const { data: failed } = await admin
      .from('tarif_benchmarks')
      .select('versicherer, tarif_name')
      .eq('analyse_status', 'failed')

    return NextResponse.json({
      done: true,
      message: 'Alle Einträge verarbeitet',
      failed: failed ?? [],
    })
  }

  // Auf "analyzing" setzen
  await admin
    .from('tarif_benchmarks')
    .update({ analyse_status: 'analyzing' })
    .eq('id', bench.id)

  try {
    // ── PDF laden ─────────────────────────────────────────────────────────────
    const pdfRes = await fetch(bench.avb_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MediRight-Admin/1.0)',
        'Accept': 'application/pdf,*/*',
      },
    })
    if (!pdfRes.ok) throw new Error(`PDF-Download fehlgeschlagen: HTTP ${pdfRes.status}`)
    const pdfBuffer  = await pdfRes.arrayBuffer()
    const pdfBase64  = Buffer.from(pdfBuffer).toString('base64')
    const dateiname  = bench.avb_url.split('/').pop() ?? bench.tarif_name

    // ── Claude Vision Analyse ─────────────────────────────────────────────────
    const prompt = buildExtractionPrompt(dateiname, bench.versicherer)

    const content: ContentBlockParam[] = [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
      } as ContentBlockParam,
      { type: 'text', text: prompt },
    ]
    const messages: MessageParam[] = [{ role: 'user', content }]

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages,
    })

    const rawText = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('')

    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ??
                      rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) throw new Error('Kein JSON in Claude-Antwort')

    const profilJson = JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as Record<string, unknown>
    const avbVersion = (profilJson.avb_version as string | null) ?? null

    // ── In Supabase speichern ─────────────────────────────────────────────────
    await admin
      .from('tarif_benchmarks')
      .update({
        profil_json:    profilJson,
        avb_version:    avbVersion,
        analyse_status: 'completed',
        analysiert_am:  new Date().toISOString(),
      })
      .eq('id', bench.id)

    // Wie viele sind noch pending?
    const { count: remaining } = await admin
      .from('tarif_benchmarks')
      .select('*', { count: 'exact', head: true })
      .eq('analyse_status', 'pending')

    return NextResponse.json({
      done:           false,
      processed:      { versicherer: bench.versicherer, tarif_name: bench.tarif_name },
      avb_version:    avbVersion,
      tokens_used:    response.usage.input_tokens + response.usage.output_tokens,
      pending_remaining: remaining ?? 0,
      message:        remaining
        ? `✅ ${bench.versicherer} fertig — noch ${remaining} ausstehend. Bitte erneut aufrufen.`
        : '✅ Letzter Versicherer fertig!',
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from('tarif_benchmarks')
      .update({ analyse_status: 'failed' })
      .eq('id', bench.id)

    return NextResponse.json({
      error:   'Analyse fehlgeschlagen',
      detail:  message,
      versicherer: bench.versicherer,
    }, { status: 500 })
  }
}

// ── Extraktions-Prompt ────────────────────────────────────────────────────────

function buildExtractionPrompt(dateiname: string, versicherer: string): string {
  return `Du bist ein spezialisierter PKV-Vertragsanalyst. Analysiere dieses AVB-Dokument (${dateiname}) des Versicherers "${versicherer}" und extrahiere ALLE versicherungsrelevanten Daten.

Gib das Ergebnis als gültiges JSON zurück – NICHTS außer dem JSON-Objekt, keine Erklärungen.

{
  "versicherung": "Name der Versicherungsgesellschaft",
  "tarif_name": "Tarifname",
  "avb_version": "Version/Stand der AVB",
  "versicherungsnummer": null,
  "monatsbeitrag_eur": null,
  "gesundheitslotse": {
    "mit_lotse_pct": 100,
    "ohne_lotse_pct": 80,
    "quelle": "z.B. § 4, Seite 5"
  },
  "selbstbehalt": {
    "prozent": 20,
    "jahresmaximum_eur": 2000,
    "ausnahmen_kein_selbstbehalt": ["Vorsorgeuntersuchungen"],
    "quelle": "z.B. § 6, Seite 8"
  },
  "erstattungssaetze": {
    "arzt_mit_lotse_pct": 100,
    "arzt_ohne_lotse_pct": 80,
    "heilmittel_bis_grenze_pct": 80,
    "heilmittel_jahresgrenze_eur": 2000,
    "psychotherapie_pct": 80,
    "heilpraktiker_pct": 60,
    "heilpraktiker_jahresmax_eur": 1000,
    "arzneimittel_generikum_pct": 80,
    "quelle": "Seiten 4-9"
  },
  "stationaer": {
    "zimmer": "Einbettzimmer | Zweibettzimmer | Mehrbettzimmer",
    "chefarzt": true,
    "krankenhaus_typ": "alle zugelassenen | nur Vertragskliniken",
    "quelle": "§ X, Seite Y"
  },
  "goae_regelung": {
    "max_erstattbarer_faktor": 3.5,
    "ueber_faktor_moeglich": false,
    "ueber_faktor_begruendung_erforderlich": true,
    "quelle": "§ X, Seite Y"
  },
  "sonderklauseln": [
    {
      "id": "LE/01",
      "bezeichnung": "Kurze Bezeichnung",
      "wortlaut": "Vollständiger Vertragstext",
      "risiko": "KRITISCH | HOCH | MITTEL | NIEDRIG",
      "rechtliche_angreifbarkeit": "Einschätzung",
      "quelle": "Seite X"
    }
  ],
  "wichtige_hinweise": ["Besondere Punkte für den Versicherten"]
}

Regeln:
- Exakte Seitenzahlen/Paragraphen bei jedem quelle-Feld
- Bei Sonderklauseln: vollständigen Wortlaut angeben
- Fehlende Infos: null (nicht raten)
- versicherungsnummer und monatsbeitrag_eur immer null (Referenz-Tarif)`
}
