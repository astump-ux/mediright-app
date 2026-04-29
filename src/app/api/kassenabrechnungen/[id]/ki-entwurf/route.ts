/**
 * POST /api/kassenabrechnungen/[id]/ki-entwurf
 *
 * Erzeugt on-demand eine neue KI-Handlungsempfehlung + Kommunikationsentwurf
 * basierend auf dem vollständigen Fallkontext zum aktuellen Zeitpunkt.
 * Das Ergebnis wird als neuer widerspruch_kommunikationen-Eintrag
 * (typ: 'ki_entwurf', richtung: 'ausgehend') gespeichert und zurückgegeben.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildFallContext } from '@/lib/fall-context'
import { logKiUsage } from '@/lib/ki-usage'
import { callAiText } from '@/lib/ai-client'

export const maxDuration = 120

const KI_ENTWURF_PROMPT = `Du bist ein PKV-Experte und Rechtsberater für Kassenstreitigkeiten (AXA ActiveMe-U).

{{fallkontext}}

AUFGABE:
Analysiere die aktuelle Situation in diesem Fall anhand des vollständigen Fallkontexts oben.
Berücksichtige insbesondere:
- Den bisherigen Kommunikationsverlauf im Thread (was wurde bereits geschrieben/empfangen?)
- Den aktuellen Verfahrensstand (welcher Status liegt vor, was fehlt noch?)
- Offene Fristen oder Reaktionsbedarfe

1. Bewerte den aktuellen Stand präzise (max. 3 Sätze, Laiensprache).
2. Bestimme den wichtigsten nächsten Schritt: an AXA schreiben, Arzt kontaktieren oder abwarten?
3. Erstelle einen vollständigen, professionellen Entwurf für das nächste Schreiben.

⚡ PFLICHT — VG-ZITIERUNG:
Wenn die Fallakte einen "VERTRAGSGRUNDLAGE"-Block enthält, MÜSSEN die relevanten VG-Nummern und Seitenangaben
wörtlich im Brieftext zitiert werden. Format: "gemäß VG100, Seite X, Abschnitt Y" oder "laut § X der AVB (VG100, S. Y)".
Ohne diese Zitate ist der Widerspruchsbrief rechtlich schwächer — immer konkret belegen.

Antworte NUR mit diesem JSON (kein Text davor oder danach):
{
  "ki_analyse": "Aktuelle Lageeinschätzung (max. 3 Sätze, Laiensprache, bezieht sich auf konkreten Stand und bisherigen Thread)",
  "naechster_schritt_erklaerung": "Was jetzt zu tun ist und warum (1-2 Sätze)",
  "ki_vorschlag_betreff": "Betreff für das nächste Schreiben",
  "ki_vorschlag_inhalt": "Vollständiger Brieftext (förmlich, professionell, auf Deutsch, nutzt Fakten aus Fallakte + VG-Zitate)",
  "ki_naechster_empfaenger": "kasse | arzt | keiner",
  "ki_dringlichkeit": "hoch | mittel | niedrig",
  "ki_naechste_frist": "YYYY-MM-DD wenn eine Frist besteht, sonst null"
}`

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: kassenabrechnungen_id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // Ownership-Prüfung
  const { data: kasse, error: kasseErr } = await admin
    .from('kassenabrechnungen')
    .select('id, user_id, kasse_analyse')
    .eq('id', kassenabrechnungen_id)
    .maybeSingle()

  if (kasseErr) {
    console.error('[ki-entwurf] DB-Fehler:', kasseErr.message)
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }
  if (!kasse) return NextResponse.json({ error: 'Kassenbescheid nicht gefunden' }, { status: 404 })
  if (kasse.user_id !== user.id) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  // ── Vollständigen Fallkontext aufbauen ────────────────────────────────────
  const fallkontext = await buildFallContext(kassenabrechnungen_id)

  // ── Modell aus DB laden (gleiche Einstellung wie Widerspruch-Analyse) ─────
  const { data: modelRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'widerspruch_analyse_model')
    .single()

  const model = modelRow?.value || 'claude-sonnet-4-6'
  const prompt = KI_ENTWURF_PROMPT.replace('{{fallkontext}}', fallkontext)

  let result: {
    ki_analyse: string
    naechster_schritt_erklaerung: string
    ki_vorschlag_betreff: string
    ki_vorschlag_inhalt: string
    ki_naechster_empfaenger: 'kasse' | 'arzt' | 'keiner'
    ki_dringlichkeit: 'hoch' | 'mittel' | 'niedrig'
    ki_naechste_frist: string | null
  }

  try {
    const { text: raw, usage } = await callAiText({ model, prompt, maxTokens: 2048 })
    logKiUsage({ callType: 'ki_entwurf', model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, userId: user.id }).catch(() => {})

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Keine JSON-Antwort von KI')
    result = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[ki-entwurf] KI-Fehler:', e)
    return NextResponse.json({ error: `KI-Fehler: ${String(e)}` }, { status: 500 })
  }

  // ── Neuen Eintrag in widerspruch_kommunikationen speichern ────────────────
  const empfaenger = result.ki_naechster_empfaenger === 'arzt' ? 'arzt' : 'kasse'

  const { data: newEntry, error: insertError } = await admin
    .from('widerspruch_kommunikationen')
    .insert({
      kassenabrechnungen_id,
      user_id: user.id,
      richtung: 'ausgehend',
      kommunikationspartner: empfaenger,
      typ: 'ki_entwurf',
      datum: new Date().toISOString().split('T')[0],
      betreff: result.ki_vorschlag_betreff,
      inhalt: result.naechster_schritt_erklaerung,
      ki_analyse: result.ki_analyse,
      ki_vorschlag_betreff: result.ki_vorschlag_betreff,
      ki_vorschlag_inhalt: result.ki_vorschlag_inhalt,
      ki_naechster_empfaenger: result.ki_naechster_empfaenger,
      ki_dringlichkeit: result.ki_dringlichkeit,
      ki_naechste_frist: result.ki_naechste_frist ?? null,
    })
    .select()
    .single()

  if (insertError) {
    console.error('[ki-entwurf] Insert-Fehler:', insertError)
    return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json(newEntry, { status: 201 })
}
