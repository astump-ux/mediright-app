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
  alter_ab?: number | null
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

  // Load profile before Claude call — need age + insurer name for the prompt
  const { data: profile } = await supabase
    .from('profiles')
    .select('pkv_name, pkv_tarif, versicherung, tarif, geburtsdatum, geschlecht')
    .eq('id', user.id)
    .single()

  const kasseName = (profile as { pkv_name?: string })?.pkv_name ?? profile?.versicherung ?? ''
  const tarifName = (profile as { pkv_tarif?: string })?.pkv_tarif ?? profile?.tarif ?? ''

  // Compute age for age-aware extraction
  const geburtsdatumRaw = (profile as { geburtsdatum?: string | null })?.geburtsdatum ?? null
  let userAge: number | null = null
  if (geburtsdatumRaw) {
    const today = new Date()
    const dob   = new Date(geburtsdatumRaw)
    let age = today.getFullYear() - dob.getFullYear()
    if (today.getMonth() < dob.getMonth() ||
       (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--
    userAge = age
  }
  const userGeschlecht = (profile as { geschlecht?: string | null })?.geschlecht ?? null

  // Build age/gender context string for the prompt
  const ageContext = userAge !== null
    ? `Der Nutzer ist ${userAge} Jahre alt.`
    : 'Das Alter des Nutzers ist nicht bekannt — extrahiere Leistungen für Erwachsene ab 18.'
  const genderContext = userGeschlecht === 'male'
    ? 'Der Nutzer ist männlich.'
    : userGeschlecht === 'female'
    ? 'Die Nutzerin ist weiblich.'
    : 'Das Geschlecht ist nicht bekannt — schließe beide geschlechtsspezifischen Leistungen ein.'

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

Nutzerkontext: ${ageContext} ${genderContext}

WICHTIGE FILTERREGELN — strikte Einhaltung erforderlich:
- AUSSCHLIESSEN: Alle Kinder- und Jugendvorsorge (U1–U9, U10, J1, J2, Schuluntersuchungen, pädiatrische Vorsorge, Neugeborenen-Screening, Zahnärztliche Frühuntersuchungen für Kinder)
- AUSSCHLIESSEN: Leistungen die erst ab einem Alter relevant werden, das der Nutzer noch nicht erreicht hat
- AUSSCHLIESSEN: Leistungen die ausschließlich für das andere Geschlecht gelten (wenn Geschlecht bekannt)
- EINSCHLIESSEN: Nur Vorsorge/Früherkennung für Erwachsene die für diesen Nutzer jetzt oder in Zukunft relevant sind

Gib NUR dieses JSON-Array zurück (kein anderer Text):
[
  {
    "name": "Bezeichnung der Vorsorge",
    "fachgebiet": "Exaktes deutsches Fachgebiet (Innere Medizin | Dermatologie | Zahnarzt | Gynäkologie | Gastroenterologie | Urologie | Radiologie | Augenheilkunde | Orthopädie | HNO | Labordiagnostik | Allgemeinmedizin)",
    "empf_intervall_monate": 12,
    "axa_leistung": true,
    "geschlecht_spezifisch": null,
    "alter_ab": null,
    "hinweis": "Kurze Erklärung wann/wie oft (max. 80 Zeichen)"
  }
]
Weitere Regeln:
- empf_intervall_monate = Intervall in Monaten (6, 12, 24, 36 oder 60)
- geschlecht_spezifisch = "male" | "female" | null
- alter_ab = Mindestalter als Zahl (z.B. 35, 45, 50) oder null wenn ab Geburt/Volljährigkeit
- Maximal 10 der wichtigsten altersrelevanten Vorsorge-Leistungen`,
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

  const allRows = templates.map((t: ExtractedItem) => ({
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

  // Deduplicate by fachgebiet — unique constraint (user_id, fachgebiet) requires this.
  // If Claude returns two items for the same Fachgebiet, keep the last (usually more specific).
  const seen = new Map<string, typeof allRows[0]>()
  for (const row of allRows) seen.set(row.fachgebiet, row)
  const rows = Array.from(seen.values())

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
