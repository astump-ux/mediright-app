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
