/**
 * POST /api/vorsorge/upload
 *
 * Accepts a PDF file (multipart/form-data, field name "pdf"),
 * sends it to Claude for analysis, and seeds user_vorsorge_config
 * with the extracted Vorsorge items (full replace, not merge).
 *
 * Used by the Settings page "Vorsorge-Unterlagen" section.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const FACH_ICONS: Record<string, string> = {
  'Innere Medizin':    '❤️',
  'Kardiologie':       '💓',
  'Labordiagnostik':   '🔬',
  'Dermatologie':      '🧬',
  'Augenheilkunde':    '👁️',
  'Orthopädie':        '🦴',
  'Neurologie':        '🧠',
  'Gynäkologie':       '🌸',
  'Urologie':          '💊',
  'Radiologie':        '📡',
  'Allgemeinmedizin':  '🏥',
  'Zahnarzt':          '🦷',
  'Gastroenterologie': '🔬',
  'HNO':               '👂',
}

interface ExtractedItem {
  name: string
  fachgebiet: string
  empf_intervall_monate: number
  axa_leistung?: boolean
  geschlecht_spezifisch?: 'male' | 'female' | null
  hinweis?: string | null
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse multipart form data
  let file: File | null = null
  try {
    const formData = await req.formData()
    file = formData.get('pdf') as File | null
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF too large (max 10 MB)' }, { status: 400 })
  }

  // Convert PDF to base64
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // Analyse with Claude (document API)
  let templates: ExtractedItem[] = []
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: `Du bist ein Experte für deutsche private Krankenversicherungen (PKV).
Antworte AUSSCHLIESSLICH als valides JSON-Array, ohne Markdown oder Erklärungen.`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          } as Anthropic.Messages.DocumentBlockParam,
          {
            type: 'text',
            text: `Analysiere dieses PKV-Leistungsverzeichnis oder Vorsorge-Dokument.
Extrahiere alle Vorsorgeuntersuchungen und präventiven Leistungen als JSON-Array.
Gib NUR dieses JSON-Array zurück (kein anderer Text):
[
  {
    "name": "Bezeichnung der Vorsorge",
    "fachgebiet": "Exaktes deutsches Fachgebiet (Innere Medizin | Dermatologie | Zahnarzt | Gynäkologie | Gastroenterologie | Urologie | Radiologie | Augenheilkunde | Orthopädie | HNO | Labordiagnostik | Allgemeinmedizin)",
    "empf_intervall_monate": 12,
    "axa_leistung": true,
    "geschlecht_spezifisch": null,
    "hinweis": "Kurze Erklärung wann/wie oft (max. 80 Zeichen)"
  }
]
Wichtige Regeln:
- empf_intervall_monate = Untersuchungsintervall in Monaten (6, 12, 24, 36 oder 60)
- axa_leistung = true wenn die Leistung im Dokument aufgeführt ist
- geschlecht_spezifisch = "male" wenn nur Männer, "female" wenn nur Frauen, null für alle
- Maximal 10 der wichtigsten Vorsorge-Leistungen
- Nur Prävention/Früherkennung — keine Behandlungen`,
          },
        ],
      }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    templates = JSON.parse(cleaned) as ExtractedItem[]
  } catch (err) {
    console.error('[vorsorge/upload] Claude analysis failed:', err)
    return NextResponse.json({ error: 'PDF-Analyse fehlgeschlagen. Bitte erneut versuchen.' }, { status: 500 })
  }

  if (!Array.isArray(templates) || templates.length === 0) {
    return NextResponse.json({ error: 'Keine Vorsorge-Leistungen im PDF gefunden.' }, { status: 422 })
  }

  // Load insurer name for tarif_name label
  const { data: profile } = await supabase
    .from('profiles')
    .select('pkv_name, pkv_tarif, versicherung, tarif')
    .eq('id', user.id)
    .single()

  const kasseName = (profile as { pkv_name?: string })?.pkv_name ?? profile?.versicherung ?? ''
  const tarifName = (profile as { pkv_tarif?: string })?.pkv_tarif ?? profile?.tarif ?? ''

  const rows = templates.map((t: ExtractedItem) => ({
    user_id:                user.id,
    tarif_name:             `${kasseName} ${tarifName}`.trim() || 'Aus PDF',
    name:                   t.name,
    icon:                   FACH_ICONS[t.fachgebiet] ?? '💊',
    fachgebiet:             t.fachgebiet,
    empf_intervall_monate:  t.empf_intervall_monate,
    axa_leistung:           t.axa_leistung ?? true,
    geschlecht_spezifisch:  t.geschlecht_spezifisch ?? null,
    hinweis:                t.hinweis ?? null,
    quelle:                 'pdf_upload',
  }))

  // Full replace: delete existing rows, insert fresh
  const { error: delError } = await supabase
    .from('user_vorsorge_config')
    .delete()
    .eq('user_id', user.id)

  if (delError) {
    console.error('[vorsorge/upload] delete error:', delError)
    return NextResponse.json({ error: delError.message }, { status: 500 })
  }

  const { error: insertError } = await supabase
    .from('user_vorsorge_config')
    .insert(rows)

  if (insertError) {
    console.error('[vorsorge/upload] insert error:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, seeded: rows.length, items: templates.map(t => t.name) })
}
