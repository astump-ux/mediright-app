import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildFallContext } from '@/lib/fall-context'
import { logKiUsage } from '@/lib/ki-usage'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// ── Fallback prompts ──────────────────────────────────────────────────────────
// Use {{fallkontext}} for the complete structured Fallakte.
// Individual vars {{bescheiddatum}}, {{referenznummer}}, {{betrag_abgelehnt}},
// {{ablehnungsgruende}}, {{thread}} remain available for custom DB prompts.

const FALLBACK_KASSE_PROMPT = `Du bist ein PKV-Experte und Rechtsberater für Kassenstreitigkeiten (AXA ActiveMe-U).

{{fallkontext}}

AKTUELLES EINGEHENDES SCHREIBEN VON AXA:
{{inhalt}}

AUFGABE:
1. Analysiere das AXA-Schreiben präzise (max. 3 Sätze, Laiensprache). Beziehe dich konkret auf die Ablehnungsgründe und die bisherige Kommunikation aus der Fallakte.
2. Bewerte die Lage: Welche Handlungsoptionen bestehen noch? Hat sich etwas geändert?
3. Erstelle einen vollständigen, professionellen Antwortentwurf an AXA — inhaltlich präzise, auf die konkreten Punkte der Fallakte eingehend.

Antworte NUR mit diesem JSON (kein Text davor oder danach):
{
  "ki_analyse": "Kurze Analyse was das AXA-Schreiben bedeutet (max. 3 Sätze, Laiensprache)",
  "naechster_schritt_erklaerung": "Was jetzt zu tun ist und warum (1-2 Sätze)",
  "ki_vorschlag_betreff": "Betreff für Antwortschreiben",
  "ki_vorschlag_inhalt": "Vollständiger Brieftext für Antwort (förmlich, professionell, auf Deutsch, bezieht sich auf konkrete Fakten aus der Fallakte)",
  "ki_naechster_empfaenger": "kasse | arzt | keiner",
  "ki_dringlichkeit": "hoch | mittel | niedrig",
  "ki_naechste_frist": "YYYY-MM-DD wenn eine Frist genannt wurde, sonst null"
}`

const FALLBACK_ARZT_PROMPT = `Du bist ein PKV-Experte und Berater für Kassenstreitigkeiten (AXA ActiveMe-U).

{{fallkontext}}

AKTUELLES EINGEHENDES SCHREIBEN VON ARZT/PRAXIS:
{{inhalt}}

AUFGABE:
1. Analysiere das Arztschreiben / die ärztliche Stellungnahme präzise (max. 3 Sätze). Prüfe: Adressiert es die konkreten AXA-Ablehnungsgründe aus der Fallakte direkt?
2. Was fehlt noch für einen erfolgreichen Widerspruch bei AXA? Was ist der nächste Schritt?
3. Erstelle einen vollständigen Entwurf für den nächsten Brief — entweder zurück an den Arzt (falls Ergänzung nötig) oder an AXA (falls die Stellungnahme ausreicht).

Antworte NUR mit diesem JSON (kein Text davor oder danach):
{
  "ki_analyse": "Analyse der ärztlichen Stellungnahme (max. 3 Sätze, Laiensprache, konkrete Bezüge auf Ablehnungsgründe)",
  "naechster_schritt_erklaerung": "Was jetzt zu tun ist und warum (1-2 Sätze)",
  "ki_vorschlag_betreff": "Betreff für nächstes Schreiben",
  "ki_vorschlag_inhalt": "Vollständiger Brieftext (förmlich, professionell, auf Deutsch, nutzt Inhalte aus Fallakte und Arztschreiben)",
  "ki_naechster_empfaenger": "kasse | arzt | keiner",
  "ki_dringlichkeit": "hoch | mittel | niedrig",
  "ki_naechste_frist": "YYYY-MM-DD wenn eine Frist genannt wurde, sonst null"
}`

function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  // Fetch the communication entry
  const { data: komm } = await admin
    .from('widerspruch_kommunikationen')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!komm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Build full Fallakte context ───────────────────────────────────────────
  const fallkontext = await buildFallContext(komm.kassenabrechnungen_id)

  // ── Also build legacy vars for backward-compat with custom DB prompts ─────
  const { data: kasse } = await admin
    .from('kassenabrechnungen')
    .select('kasse_analyse, bescheiddatum, betrag_abgelehnt, referenznummer')
    .eq('id', komm.kassenabrechnungen_id)
    .single()

  const kasseAnalyse = kasse?.kasse_analyse as Record<string, unknown> | null
  const ablehnungsgruende = (kasseAnalyse?.ablehnungsgruende as string[] | null)?.join(', ') ?? 'unbekannt'
  const betragAbgelehnt   = kasse?.betrag_abgelehnt ?? 0

  // Legacy thread summary (still used by custom DB prompts via {{thread}})
  const { data: thread } = await admin
    .from('widerspruch_kommunikationen')
    .select('richtung, kommunikationspartner, typ, datum, betreff, inhalt')
    .eq('kassenabrechnungen_id', komm.kassenabrechnungen_id)
    .eq('user_id', user.id)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true })

  const threadSummary = (thread ?? []).map(t => {
    const dir     = t.richtung === 'ausgehend' ? '→ GESENDET AN' : '← ERHALTEN VON'
    const partner = t.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'
    return `[${t.datum}] ${dir} ${partner} (${t.typ}):\nBetreff: ${t.betreff ?? '–'}\n${t.inhalt}`
  }).join('\n\n---\n\n')

  // ── Load prompt from DB (or fall back to hardcoded) ──────────────────────
  const isArzt    = komm.kommunikationspartner === 'arzt'
  const promptKey = isArzt ? 'ki_widerspruch_arzt_prompt' : 'ki_widerspruch_kasse_prompt'
  const fallback  = isArzt ? FALLBACK_ARZT_PROMPT : FALLBACK_KASSE_PROMPT

  const { data: settingRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', promptKey)
    .single()

  const promptTemplate = (settingRow?.value && settingRow.value.trim()) ? settingRow.value : fallback

  const prompt = fillPlaceholders(promptTemplate, {
    fallkontext,
    bescheiddatum:    kasse?.bescheiddatum ?? 'unbekannt',
    referenznummer:   kasse?.referenznummer ?? 'unbekannt',
    betrag_abgelehnt: betragAbgelehnt.toFixed(2),
    ablehnungsgruende,
    thread:           threadSummary,
    inhalt:           komm.inhalt,
  })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    logKiUsage({ callType: 'widerspruch_analyse', model: 'claude-sonnet-4-6', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, userId: user.id }).catch(() => {})
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = JSON.parse(jsonMatch[0])

    // Save AI results to DB
    const { data: updated } = await admin
      .from('widerspruch_kommunikationen')
      .update({
        ki_analyse:              result.ki_analyse,
        ki_vorschlag_betreff:    result.ki_vorschlag_betreff,
        ki_vorschlag_inhalt:     result.ki_vorschlag_inhalt,
        ki_naechster_empfaenger: result.ki_naechster_empfaenger,
        ki_dringlichkeit:        result.ki_dringlichkeit,
        ki_naechste_frist:       result.ki_naechste_frist ?? null,
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
