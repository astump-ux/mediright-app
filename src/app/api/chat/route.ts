/**
 * POST /api/chat
 *
 * MediRight AI assistant endpoint.
 * Builds a rich system prompt from the authenticated user's current data:
 *   - profile (name, tariff, insurer)
 *   - recent Vorgänge (last 6 months)
 *   - Kassenabrechnungen (current year) with kasse_analyse
 *   - active Widerspruchsverfahren
 *   - known tariff exclusion patterns (tariff_exclusions)
 *
 * Designed for Option 3A → 3B upgrade path:
 *   messages are stored to chat_messages table.
 *   History retrieval (3B) only requires fetching prior messages and
 *   prepending them to the Claude messages array.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Context builder ───────────────────────────────────────────────────────────

async function buildSystemPrompt(userId: string): Promise<string> {
  const admin = getSupabaseAdmin()
  const now   = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0]
  const currentYear  = now.getFullYear()

  // Parallel fetch everything
  const [profileRes, vorgaengeRes, kasseRes, exclusionsRes] = await Promise.all([
    admin.from('profiles').select('full_name, pkv_name, pkv_tarif').eq('id', userId).single(),
    admin.from('vorgaenge')
      .select('id, arzt_name, fachrichtung, rechnungsdatum, betrag_gesamt, einsparpotenzial, status, kasse_match_status, kassenabrechnung_id')
      .eq('user_id', userId)
      .gte('rechnungsdatum', sixMonthsAgo)
      .order('rechnungsdatum', { ascending: false })
      .limit(30),
    admin.from('kassenabrechnungen')
      .select('id, bescheiddatum, referenznummer, betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, erstattungsquote, widerspruch_status, arzt_reklamation_status, betrag_widerspruch_kasse, betrag_korrektur_arzt, kasse_analyse')
      .eq('user_id', userId)
      .gte('bescheiddatum', `${currentYear}-01-01`)
      .order('bescheiddatum', { ascending: false })
      .limit(10),
    admin.from('tariff_exclusions')
      .select('goae_ziffer, leistung, rejection_type, rejection_reason, confidence')
      .in('confidence', ['haeufig', 'bestaetigt'])
      .order('occurrence_count', { ascending: false })
      .limit(12),
  ])

  const profile    = profileRes.data
  const vorgaenge  = vorgaengeRes.data  ?? []
  const kasseListe = kasseRes.data       ?? []
  const exclusions = exclusionsRes.data  ?? []

  const name    = profile?.full_name ?? 'dem Nutzer'
  const pkvName = profile?.pkv_name  ?? 'PKV'

  // ── Format Vorgänge ───────────────────────────────────────────────────────
  const formatVorgang = (v: Record<string, unknown>) => {
    const datum  = v.rechnungsdatum as string | null ?? '?'
    const arzt   = v.arzt_name as string | null ?? 'Unbekannt'
    const betrag = typeof v.betrag_gesamt === 'number' ? `${(v.betrag_gesamt as number).toFixed(2)} €` : '?'
    const status = v.status as string ?? '?'
    const esp    = typeof v.einsparpotenzial === 'number' && (v.einsparpotenzial as number) > 0
      ? ` | Einsparpotenzial: ${(v.einsparpotenzial as number).toFixed(2)} €` : ''
    const kasse  = v.kassenabrechnung_id ? ' | Kassenbescheid vorhanden' : ' | Kassenbescheid ausstehend'
    return `  • ${datum} | ${arzt} | ${betrag} | Status: ${status}${esp}${kasse}`
  }

  // ── Format Kassenbescheide ────────────────────────────────────────────────
  const formatKasse = (k: Record<string, unknown>) => {
    const datum   = k.bescheiddatum as string | null ?? '?'
    const ref     = k.referenznummer as string | null ? ` (${k.referenznummer})` : ''
    const eingereicht = typeof k.betrag_eingereicht === 'number' ? `${(k.betrag_eingereicht as number).toFixed(2)} €` : '?'
    const erstattet   = typeof k.betrag_erstattet   === 'number' ? `${(k.betrag_erstattet as number).toFixed(2)} €`   : '?'
    const abgelehnt   = typeof k.betrag_abgelehnt   === 'number' ? `${(k.betrag_abgelehnt as number).toFixed(2)} €`   : '?'
    const quote       = typeof k.erstattungsquote   === 'number' ? `${(k.erstattungsquote as number).toFixed(0)}%`     : '?'
    const wStatus = k.widerspruch_status as string ?? 'keiner'
    const aStatus = k.arzt_reklamation_status as string ?? 'keiner'
    const wBetrag = typeof k.betrag_widerspruch_kasse === 'number' && (k.betrag_widerspruch_kasse as number) > 0
      ? ` | Widerspruch: ${(k.betrag_widerspruch_kasse as number).toFixed(2)} € (${wStatus})` : ''
    const aBetrag = typeof k.betrag_korrektur_arzt === 'number' && (k.betrag_korrektur_arzt as number) > 0
      ? ` | Arztkorrektur: ${(k.betrag_korrektur_arzt as number).toFixed(2)} € (${aStatus})` : ''

    // Extract rejection reasons from kasse_analyse if present
    let ablehnungen = ''
    const analyse = k.kasse_analyse as Record<string, unknown> | null
    if (analyse?.ablehnungsgruende && Array.isArray(analyse.ablehnungsgruende) && analyse.ablehnungsgruende.length > 0) {
      ablehnungen = `\n    Ablehnungsgründe: ${(analyse.ablehnungsgruende as string[]).join('; ')}`
    }

    return `  • ${datum}${ref} | Eingereicht: ${eingereicht} | Erstattet: ${erstattet} (${quote}) | Abgelehnt: ${abgelehnt}${wBetrag}${aBetrag}${ablehnungen}`
  }

  // ── Format Tariff Exclusions ──────────────────────────────────────────────
  const formatExclusion = (e: Record<string, unknown>) => {
    const ziffer  = e.goae_ziffer ? `GOÄ ${e.goae_ziffer}: ` : ''
    const leist   = e.leistung as string | null ?? ''
    const conf    = e.confidence === 'bestaetigt' ? '✓' : '~'
    return `  ${conf} ${ziffer}${leist}`
  }

  const vorgaengeOffen  = vorgaenge.filter(v => (v.status as string) !== 'erstattet')
  const vorgaengeGesamt = vorgaenge.length
  const espGesamt       = vorgaenge.reduce((s, v) => s + ((v.einsparpotenzial as number) ?? 0), 0)
  const kasseOffen      = kasseListe.filter(k => (k.widerspruch_status as string ?? 'keiner') !== 'erfolgreich')

  return `Du bist der persönliche PKV-Assistent von ${name} in der App MediRight.

VERSICHERUNGSKONTEXT:
- Krankenversicherung: ${pkvName}
- Heute: ${now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}

AKTUELLE SITUATION (letzte 6 Monate):
- ${vorgaengeGesamt} Vorgänge insgesamt, davon ${vorgaengeOffen.length} noch nicht vollständig erstattet
- Gesamtes identifiziertes Einsparpotenzial: ${espGesamt.toFixed(2)} €
- ${kasseOffen.length} offene / aktive Kassenbescheide

VORGÄNGE (neueste zuerst):
${vorgaenge.length > 0 ? vorgaenge.map(v => formatVorgang(v as Record<string, unknown>)).join('\n') : '  Keine Vorgänge im Zeitraum.'}

KASSENBESCHEIDE ${currentYear}:
${kasseListe.length > 0 ? kasseListe.map(k => formatKasse(k as Record<string, unknown>)).join('\n') : '  Keine Kassenbescheide in diesem Jahr.'}

BEKANNTE ${pkvName.toUpperCase()}-ABLEHNUNGSMUSTER:
${exclusions.length > 0 ? exclusions.map(e => formatExclusion(e as Record<string, unknown>)).join('\n') : '  Keine Muster hinterlegt.'}

DEINE ROLLE:
- Beantworte Fragen zu Rechnungen, Bescheiden, Widersprüchen und Erstattungen präzise
- Erkläre Ablehnungsgründe in einfacher Sprache (kein Juristenjargon)
- Gib konkrete Handlungsempfehlungen (z.B. "Widerspruch einlegen bis [Datum]")
- Weise proaktiv auf Fristen und Handlungsbedarf hin
- Antworte auf Deutsch, kurz und klar
- Du darfst keine Änderungen in der App vornehmen — nur beraten und erklären`
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await request.json() as { message?: string }
  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  try {
    // Build fresh context for every message (Option 3A: no history)
    const systemPrompt = await buildSystemPrompt(user.id)

    // Call Claude
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages: [
        { role: 'user', content: message.trim() },
      ],
    })

    const assistantText = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    // Store both messages for future Option 3B history (fire-and-forget)
    void admin.from('chat_messages').insert([
      { user_id: user.id, role: 'user',      content: message.trim() },
      { user_id: user.id, role: 'assistant', content: assistantText  },
    ])

    return NextResponse.json({ reply: assistantText })

  } catch (err) {
    console.error('[/api/chat] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
