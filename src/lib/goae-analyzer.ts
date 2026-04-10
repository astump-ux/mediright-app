import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabase-admin'

export interface GoaePosition {
  ziffer: string
  bezeichnung: string
  faktor: number
  betrag: number
  flag?: 'ok' | 'pruefe' | 'hoch'
}

export interface AnalyseResult {
  arztName: string | null
  arztFachgebiet: string | null
  rechnungsdatum: string | null
  rechnungsnummer: string | null
  betragGesamt: number
  goaePositionen: GoaePosition[]
  maxFaktor: number
  flagFaktorUeberSchwellenwert: boolean
  flagFehlendeBegrundung: boolean
  einsparpotenzial: number
  zusammenfassung: string
  whatsappNachricht: string
}

// Hardcoded fallbacks — used if DB is unavailable
const DEFAULT_SYSTEM_PROMPT = `Du bist ein Experte für die deutsche Gebührenordnung für Ärzte (GOÄ).
Analysiere die vorliegende Arztrechnung präzise und strukturiert.

WICHTIGE GOÄ-REGELN:
- Schwellenwert (Regelfall): 2,3-fach
- Höchstsatz ohne Begründung: 2,3-fach
- Höchstsatz mit Begründung: 3,5-fach (Ausnahme: bis 7-fach bei bestimmten Positionen)
- Faktoren über 2,3 MÜSSEN schriftlich begründet sein (§12 GOÄ)
- Doppelberechnungen sind verboten (§4 GOÄ)

Gib deine Antwort AUSSCHLIESSLICH als valides JSON zurück, ohne Markdown-Formatierung.`

const DEFAULT_USER_PROMPT = `Analysiere diese Arztrechnung und extrahiere alle Informationen.

Antworte NUR mit diesem JSON-Objekt (kein Text davor oder danach):
{
  "arztName": "Name des Arztes oder null",
  "arztFachgebiet": "Fachgebiet oder null",
  "rechnungsdatum": "YYYY-MM-DD oder null",
  "rechnungsnummer": "Rechnungsnummer oder null",
  "betragGesamt": 123.45,
  "goaePositionen": [
    {
      "ziffer": "1",
      "bezeichnung": "Beratung, auch telefonisch",
      "faktor": 2.3,
      "betrag": 10.72,
      "flag": "ok"
    }
  ],
  "maxFaktor": 2.3,
  "flagFaktorUeberSchwellenwert": false,
  "flagFehlendeBegrundung": false,
  "einsparpotenzial": 0.00,
  "zusammenfassung": "Kurze Zusammenfassung der Rechnung auf Deutsch",
  "whatsappNachricht": "Kurze WhatsApp-Nachricht (max 3 Sätze) mit den wichtigsten Befunden für den Patienten"
}

Flag-Werte für goaePositionen:
- "ok" = Faktor ≤ 2,3 (Regelfall)
- "pruefe" = Faktor zwischen 2,3 und 3,5 (Begründung prüfen)
- "hoch" = Faktor > 3,5 (Begründung zwingend nötig)

flagFaktorUeberSchwellenwert = true wenn irgendein Faktor > 2,3
flagFehlendeBegrundung = true wenn Faktor > 2,3 aber keine schriftliche Begründung erkennbar
einsparpotenzial = Betrag der reduziert werden könnte wenn alle Positionen auf 2,3-fach gedeckelt`

// Fetch a setting from DB with fallback
async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single()
    return data?.value ?? fallback
  } catch {
    return fallback
  }
}

export async function analyzeRechnungPdf(pdfBuffer: Buffer): Promise<AnalyseResult> {
  // Load prompts and config from DB (with hardcoded fallbacks)
  const [systemPrompt, userPrompt, model] = await Promise.all([
    getSetting('goae_system_prompt', DEFAULT_SYSTEM_PROMPT),
    getSetting('goae_user_prompt', DEFAULT_USER_PROMPT),
    getSetting('claude_model', 'claude-sonnet-4-5'),
  ])

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const base64Pdf = pdfBuffer.toString('base64')

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonText = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(jsonText) as AnalyseResult
}

// Fetch a WhatsApp message template from DB
export async function getWhatsAppTemplate(key: string, fallback: string): Promise<string> {
  return getSetting(key, fallback)
}

// ── PDF Auto-Classification ───────────────────────────────────────────────────

export type DocumentType = 'kassenabrechnung' | 'arztrechnung'

/**
 * Classifies a PDF as either a Kassenabrechnung (insurance reimbursement notice)
 * or an Arztrechnung (medical invoice) using a lightweight Claude call.
 *
 * @param pdfBuffer  Raw PDF bytes
 * @param pkvName    User's insurance company name (e.g. "AXA") — improves accuracy
 */
export async function classifyPdf(
  pdfBuffer: Buffer,
  pkvName?: string | null
): Promise<DocumentType> {
  try {
    const model = await getSetting('claude_model', 'claude-sonnet-4-5')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const base64Pdf = pdfBuffer.toString('base64')

    const insuranceHint = pkvName
      ? `Die Krankenversicherung des Nutzers heißt: "${pkvName}".`
      : 'Die Versicherungsgesellschaft des Nutzers ist nicht bekannt.'

    const response = await client.messages.create({
      model,
      max_tokens: 10,
      system: `Du klassifizierst deutsche medizinische Dokumente. ${insuranceHint}
Antworte NUR mit einem einzigen Wort: "kassenabrechnung" oder "arztrechnung".
- kassenabrechnung = Erstattungsbescheid / Abrechnungsübersicht einer privaten Krankenversicherung (PKV)
- arztrechnung = Rechnung eines Arztes, Labors, Krankenhauses oder sonstigen Leistungserbringers`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
            },
            { type: 'text', text: 'Was ist das für ein Dokument? Antworte nur mit: kassenabrechnung oder arztrechnung' },
          ],
        },
      ],
    })

    const answer = response.content[0].type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : ''

    return answer.includes('kasse') ? 'kassenabrechnung' : 'arztrechnung'
  } catch (err) {
    console.error('[classifyPdf] Error — defaulting to arztrechnung:', err)
    return 'arztrechnung'
  }
}

// ── Kassenabrechnung Analysis ─────────────────────────────────────────────────

export interface KassePosition {
  ziffer: string
  bezeichnung: string
  betragEingereicht: number
  betragErstattet: number
  status: 'erstattet' | 'gekuerzt' | 'abgelehnt'
  ablehnungsgrund?: string | null
}

/**
 * One invoice/provider block within a Kassenbescheid.
 * A single Kassenbescheid often covers multiple Arztrechnungen.
 * matchedVorgangId is populated by the matching engine (not by Claude).
 */
export interface KasseRechnungGruppe {
  arztName: string | null
  arztFachgebiet: string | null
  rechnungsnummer: string | null
  rechnungsdatum: string | null      // YYYY-MM-DD
  betragEingereicht: number
  betragErstattet: number
  betragAbgelehnt: number
  positionen: KassePosition[]
  matchedVorgangId?: string | null   // set by matching.ts, not Claude
}

export interface KasseAnalyseResult {
  referenznummer: string | null
  bescheiddatum: string | null
  betragEingereicht: number
  betragErstattet: number
  betragAbgelehnt: number
  erstattungsquote: number
  /** Rechnungen grouped by provider — key field for matching */
  rechnungen: KasseRechnungGruppe[]
  /** All positions flat (for backward-compat display in modals) */
  positionen: KassePosition[]
  ablehnungsgruende: string[]
  widerspruchEmpfohlen: boolean
  widerspruchBegruendung: string | null
  zusammenfassung: string
}

const DEFAULT_KASSE_SYSTEM_PROMPT = `Du bist ein Experte für deutsche private Krankenversicherungen (PKV), insbesondere für die Analyse von Erstattungsbescheiden der AXA Krankenversicherung.
Analysiere den vorliegenden Erstattungsbescheid präzise und strukturiert.

WICHTIGE REGELN:
- Gruppiere Positionen nach Arzt/Leistungserbringer und Rechnung
- Prüfe ob alle eingereichten Positionen erstattet wurden
- Identifiziere Kürzungen und ihre Begründungen
- Bewerte ob ein Widerspruch sinnvoll ist
- Erstattungsquote = betragErstattet / betragEingereicht * 100

Gib deine Antwort AUSSCHLIESSLICH als valides JSON zurück, ohne Markdown-Formatierung.`

const DEFAULT_KASSE_USER_PROMPT = `Analysiere diesen PKV-Erstattungsbescheid vollständig.

Antworte NUR mit diesem JSON-Objekt (kein Text davor oder danach):
{
  "referenznummer": "Referenz-/Schadennummer oder null",
  "bescheiddatum": "YYYY-MM-DD oder null",
  "betragEingereicht": 123.45,
  "betragErstattet": 100.00,
  "betragAbgelehnt": 23.45,
  "erstattungsquote": 81.3,
  "rechnungen": [
    {
      "arztName": "Name des Arztes/Leistungserbringers oder null",
      "arztFachgebiet": "Fachgebiet oder null",
      "rechnungsnummer": "Rechnungsnummer oder null",
      "rechnungsdatum": "YYYY-MM-DD oder null",
      "betragEingereicht": 50.00,
      "betragErstattet": 45.00,
      "betragAbgelehnt": 5.00,
      "positionen": [
        {
          "ziffer": "1",
          "bezeichnung": "Beratung",
          "betragEingereicht": 10.72,
          "betragErstattet": 10.72,
          "status": "erstattet",
          "ablehnungsgrund": null
        }
      ]
    }
  ],
  "positionen": [
    {
      "ziffer": "1",
      "bezeichnung": "Beratung (Dr. Müller)",
      "betragEingereicht": 10.72,
      "betragErstattet": 10.72,
      "status": "erstattet",
      "ablehnungsgrund": null
    }
  ],
  "ablehnungsgruende": ["Liste aller Ablehnungsgründe als Strings"],
  "widerspruchEmpfohlen": false,
  "widerspruchBegruendung": "Begründung oder null",
  "zusammenfassung": "Kurze Zusammenfassung (2-3 Sätze)"
}

WICHTIG: "rechnungen" MUSS alle Leistungserbringer/Rechnungen als separate Objekte enthalten.
Wenn der Bescheid Positionen verschiedener Ärzte enthält, erstelle für jeden Arzt eine eigene Gruppe.
Status-Werte: "erstattet" | "gekuerzt" | "abgelehnt"`

export async function analyzeKassePdf(pdfBuffer: Buffer): Promise<KasseAnalyseResult> {
  const [systemPrompt, userPrompt, model] = await Promise.all([
    getSetting('kasse_analyse_prompt', DEFAULT_KASSE_SYSTEM_PROMPT),
    getSetting('kasse_analyse_user_prompt', DEFAULT_KASSE_USER_PROMPT),
    getSetting('claude_model', 'claude-sonnet-4-5'),
  ])

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const base64Pdf = pdfBuffer.toString('base64')

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonText = rawText.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim()
  const result = JSON.parse(jsonText) as KasseAnalyseResult

  // Ensure rechnungen array exists (backward compat if Claude omits it)
  if (!result.rechnungen) result.rechnungen = []
  if (!result.positionen) result.positionen = []

  return result
}
