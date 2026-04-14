import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch the communication entry
  const { data: komm } = await getSupabaseAdmin()
    .from('widerspruch_kommunikationen')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!komm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch the full thread for this Kassenbescheid (for context)
  const { data: thread } = await getSupabaseAdmin()
    .from('widerspruch_kommunikationen')
    .select('richtung, kommunikationspartner, typ, datum, betreff, inhalt')
    .eq('kassenabrechnungen_id', komm.kassenabrechnungen_id)
    .eq('user_id', user.id)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true })

  // Fetch Kassenbescheid context
  const { data: kasse } = await getSupabaseAdmin()
    .from('kassenabrechnungen')
    .select('kasse_analyse, bescheiddatum, betrag_abgelehnt, referenznummer')
    .eq('id', komm.kassenabrechnungen_id)
    .single()

  const kasseAnalyse = kasse?.kasse_analyse as Record<string, unknown> | null

  // Build thread summary for AI context
  const threadSummary = (thread ?? []).map(t => {
    const dir = t.richtung === 'ausgehend' ? '→ GESENDET AN' : '← ERHALTEN VON'
    const partner = t.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'
    return `[${t.datum}] ${dir} ${partner} (${t.typ}):\nBetreff: ${t.betreff ?? '–'}\n${t.inhalt}`
  }).join('\n\n---\n\n')

  const ablehnungsgruende = (kasseAnalyse?.ablehnungsgruende as string[] | null)?.join(', ') ?? 'unbekannt'
  const betragAbgelehnt = kasse?.betrag_abgelehnt ?? 0

  const prompt = `Du bist ein PKV-Experte und Rechtsberater für Kassenstreitigkeiten (AXA ActiveMe-U).

KONTEXT DES WIDERSPRUCHSVERFAHRENS:
- AXA Bescheid vom: ${kasse?.bescheiddatum ?? 'unbekannt'}
- Referenznummer: ${kasse?.referenznummer ?? 'unbekannt'}
- Betrag abgelehnt: ${betragAbgelehnt.toFixed(2)} €
- Ablehnungsgründe: ${ablehnungsgruende}

BISHERIGER KOMMUNIKATIONSVERLAUF:
${threadSummary}

AKTUELLES EINGEHENDES SCHREIBEN (${komm.kommunikationspartner === 'kasse' ? 'von AXA' : 'vom Arzt'}):
${komm.inhalt}

AUFGABE:
1. Analysiere das eingegangene Schreiben präzise und kurz (max. 3 Sätze)
2. Bewerte die aktuelle Lage: Welche Handlungsoptionen bestehen?
3. Erstelle einen konkreten Vorschlag für den nächsten Kommunikationsschritt

Antworte NUR mit diesem JSON (kein Text davor oder danach):
{
  "ki_analyse": "Kurze Analyse was das Schreiben bedeutet (max. 3 Sätze, Laiensprache)",
  "naechster_schritt_erklaerung": "Was jetzt zu tun ist und warum (1-2 Sätze)",
  "ki_vorschlag_betreff": "Betreff für Antwortschreiben",
  "ki_vorschlag_inhalt": "Vollständiger Brieftext für Antwort (förmlich, professionell, auf Deutsch)",
  "ki_naechster_empfaenger": "kasse | arzt | keiner",
  "ki_dringlichkeit": "hoch | mittel | niedrig",
  "ki_naechste_frist": "YYYY-MM-DD wenn eine Frist genannt wurde, sonst null"
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = JSON.parse(jsonMatch[0])

    // Save AI results to DB
    const { data: updated } = await getSupabaseAdmin()
      .from('widerspruch_kommunikationen')
      .update({
        ki_analyse: result.ki_analyse,
        ki_vorschlag_betreff: result.ki_vorschlag_betreff,
        ki_vorschlag_inhalt: result.ki_vorschlag_inhalt,
        ki_naechster_empfaenger: result.ki_naechster_empfaenger,
        ki_dringlichkeit: result.ki_dringlichkeit,
        ki_naechste_frist: result.ki_naechste_frist ?? null,
      })
      .eq('id', id)
      .select()
      .single()

    return NextResponse.json({
      ...updated,
      naechster_schritt_erklaerung: result.naechster_schritt_erklaerung,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
