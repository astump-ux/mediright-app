/**
 * POST /api/vorsorge/init
 *
 * Researches the user's PKV tariff and seeds their personal
 * user_vorsorge_config table with covered preventive care items.
 *
 * Called automatically on first dashboard load if no config exists yet,
 * or manually when the user changes their tariff in Settings.
 *
 * Flow:
 *  1. Load user profile (tarif, versicherung)
 *  2. Check if user_vorsorge_config already has entries → skip if yes (unless force=true)
 *  3. Call Claude with the tariff name and ask it to list covered check-ups
 *  4. Upsert results into user_vorsorge_config
 *  5. Return the generated list
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const FACH_ICONS: Record<string, string> = {
  'Innere Medizin':   '❤️',
  'Kardiologie':      '💓',
  'Labordiagnostik':  '🔬',
  'Dermatologie':     '🧬',
  'Augenheilkunde':   '👁️',
  'Orthopädie':       '🦴',
  'Neurologie':       '🧠',
  'Psychiatrie':      '🧠',
  'Gynäkologie':      '🌸',
  'Urologie':         '💊',
  'HNO':              '👂',
  'Radiologie':       '📡',
  'Allgemeinmedizin': '🏥',
  'Zahnarzt':         '🦷',
}

// Hardcoded fallback for AXA ActiveMe-U
const AXA_ACTIVEME_U_FALLBACK = [
  { name: 'Internist Jahres-Check',    icon: '❤️', fachgebiet: 'Innere Medizin',   empf_intervall_monate: 12, axa_leistung: true },
  { name: 'Labor-Basisprofil',         icon: '🔬', fachgebiet: 'Labordiagnostik',  empf_intervall_monate: 12, axa_leistung: true },
  { name: 'Dermatologie Hautscreening',icon: '🧬', fachgebiet: 'Dermatologie',     empf_intervall_monate: 24, axa_leistung: true },
  { name: 'Augenarzt Sehtest',         icon: '👁️', fachgebiet: 'Augenheilkunde',   empf_intervall_monate: 24, axa_leistung: true },
  { name: 'Zahnarzt Prophylaxe',       icon: '🦷', fachgebiet: 'Zahnarzt',         empf_intervall_monate: 6,  axa_leistung: true },
  { name: 'Gynäkologische Vorsorge',   icon: '🌸', fachgebiet: 'Gynäkologie',      empf_intervall_monate: 12, axa_leistung: true },
]

interface VorsorgeTemplate {
  name: string
  icon: string
  fachgebiet: string
  empf_intervall_monate: number
  axa_leistung: boolean
}

async function researchTarifVorsorge(
  kasseName: string,
  tarifName: string
): Promise<VorsorgeTemplate[]> {
  // Use known AXA ActiveMe-U benefits directly (avoid API call for known tariff)
  const isAxaActiveMe = kasseName.toLowerCase().includes('axa') &&
    (tarifName.toLowerCase().includes('active') || tarifName.toLowerCase().includes('med'))
  if (isAxaActiveMe) return AXA_ACTIVEME_U_FALLBACK

  // For unknown tariffs, ask Claude
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: `Du bist ein Experte für deutsche private Krankenversicherungen (PKV).
Antworte AUSSCHLIESSLICH als valides JSON-Array, ohne Markdown oder Erklärungen.`,
      messages: [{
        role: 'user',
        content: `Welche Vorsorge-Leistungen und Check-ups übernimmt die PKV "${kasseName}" Tarif "${tarifName}" typischerweise?
Gib NUR dieses JSON-Array zurück (kein anderer Text):
[
  {
    "name": "Bezeichnung der Vorsorge",
    "fachgebiet": "Exaktes deutsches Fachgebiet (z.B. Innere Medizin, Dermatologie, Augenheilkunde, Zahnarzt, Gynäkologie, Labordiagnostik, Orthopädie, HNO)",
    "empf_intervall_monate": 12,
    "axa_leistung": true
  }
]
Gib maximal 8 der wichtigsten Vorsorge-Leistungen zurück.
empf_intervall_monate = empfohlenes Untersuchungsintervall in Monaten (6, 12, 24 oder 36).
axa_leistung = true wenn die Leistung im Tarif enthalten ist.`
      }]
    })
    const rawText = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const parsed = JSON.parse(rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim())
    return (parsed as VorsorgeTemplate[]).map(t => ({
      ...t,
      icon: FACH_ICONS[t.fachgebiet] ?? '💊',
    }))
  } catch (err) {
    console.error('[vorsorge/init] Claude research failed, using AXA fallback:', err)
    return AXA_ACTIVEME_U_FALLBACK
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const force = body.force === true  // force=true re-seeds even if config exists

  // Load profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('versicherung, tarif, pkv_name, pkv_tarif')
    .eq('id', user.id)
    .single()

  const kasseName = (profile as { pkv_name?: string })?.pkv_name ?? profile?.versicherung ?? 'AXA'
  const tarifName = (profile as { pkv_tarif?: string })?.pkv_tarif ?? profile?.tarif ?? 'ActiveMed-U'

  // Check if already seeded
  if (!force) {
    const { count } = await supabase
      .from('user_vorsorge_config')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ message: 'already_seeded', count })
    }
  }

  // Research tariff benefits
  const templates = await researchTarifVorsorge(kasseName, tarifName)

  // Upsert into user_vorsorge_config
  const rows = templates.map(t => ({
    user_id:               user.id,
    tarif_name:            `${kasseName} ${tarifName}`.trim(),
    name:                  t.name,
    icon:                  t.icon,
    fachgebiet:            t.fachgebiet,
    empf_intervall_monate: t.empf_intervall_monate,
    axa_leistung:          t.axa_leistung,
    quelle:                'ai_research',
  }))

  const { error } = await supabase
    .from('user_vorsorge_config')
    .upsert(rows, { onConflict: 'user_id,fachgebiet' })

  if (error) {
    console.error('[vorsorge/init] upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, seeded: rows.length, templates })
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_vorsorge_config')
    .select('*')
    .eq('user_id', user.id)
    .order('empf_intervall_monate')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}
