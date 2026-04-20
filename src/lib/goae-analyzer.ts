import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabase-admin'
import { logKiUsage } from './ki-usage'
import { callAiWithPdf } from './ai-client'

export interface GoaePosition {
  ziffer: string
  bezeichnung: string
  faktor: number
  betrag: number
  /** Faktor-Ampel: 'ok' ≤2.3×, 'pruefe' 2.3–3.5×, 'hoch' >3.5× */
  flag?: 'ok' | 'pruefe' | 'hoch'
  /** True wenn die Position analog zu einer anderen GOÄ-Ziffer abgerechnet wird (§6 Abs.2 GOÄ) */
  analog?: boolean
  /** True wenn diese Ziffer mit einer anderen Position auf dieser Rechnung kumuliert und das laut GOÄ verboten ist */
  kumulationsrisiko?: boolean
  /** Welche andere Ziffer den Konflikt verursacht, z.B. "GOÄ 3" */
  kumulationskonflikt?: string | null
  /** Qualität der schriftlichen Begründung wenn Faktor > 2,3×. Null wenn Faktor ≤ 2,3× */
  begruendungsqualitaet?: 'ausreichend' | 'generisch' | 'fehlend' | null
  /** True wenn diese Leistung typischerweise außerhalb des Fachgebiets des abrechnenden Arztes liegt */
  fachgebietAbweichung?: boolean
  /**
   * Bekanntes PKV-Ablehnungsrisiko für diese Ziffer:
   * 'hoch'  = häufig abgelehnt (IGeL-Verdacht, oft nicht erstattungsfähig)
   * 'mittel' = gelegentlich strittig, abhängig von Diagnose/Begründung
   * null    = kein besonderes Risiko bekannt
   */
  axaRisiko?: 'hoch' | 'mittel' | null
  /** Kurzer Hinweis für den User warum diese Position riskant ist (max 1 Satz) */
  risikohinweis?: string | null
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
  /** True wenn formale Pflichtangaben nach §12 GOÄ fehlen (Datum, Arztname, Ziffernbezeichnung etc.) */
  flagRechnungUnvollstaendig?: boolean
  /** Liste der fehlenden Pflichtangaben */
  fehlendePflichtangaben?: string[]
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

KUMULATIONSVERBOTE (§4 GOÄ) — prüfe jede Kombination:
- GOÄ 1 (kurze Beratung) neben GOÄ 3, 4 oder 5 (Untersuchungen) am selben Tag ist unzulässig — GOÄ 1 ist in Untersuchungsziffern enthalten
- GOÄ 5 (ausführliche Untersuchung) schließt GOÄ 6, 7, 8 (Teiluntersuchungen) aus
- GOÄ 26 (EKG) und GOÄ 27 (Langzeit-EKG) nicht gleichzeitig abrechenbar
- GOÄ 45 und GOÄ 46 schließen sich gegenseitig aus
- Labor: GOÄ 3511 (großes Blutbild) schließt GOÄ 3550+3551 aus
- Operative Zuschläge (GOÄ 440–449) nicht zusätzlich zu Grundleistung wenn bereits enthalten
- Allgemein: Leistungen die methodisch in einer anderen enthalten sind, dürfen nicht addiert werden

ANALOGZIFFERN (§6 Abs.2 GOÄ):
- Erkennung: Ziffer enthält "analog", "A", oder die Bezeichnung enthält "entsprechend" / "analog"
- Analogziffern sind grundsätzlich Risikoposition — viele PKVs lehnen ab wenn keine passende Originalziffer existiert
- Immer axaRisiko mindestens "mittel" setzen

BEGRÜNDUNGSQUALITÄT bei Faktor > 2,3×:
- "ausreichend": Individuelle, nachvollziehbare medizinische Begründung für den erhöhten Aufwand
- "generisch": Floskeln wie "auf Wunsch", "besonderer Aufwand", "schwieriger Patient" ohne Substanz — PKVs akzeptieren das NICHT
- "fehlend": Kein Begründungstext erkennbar

FORMALE VOLLSTÄNDIGKEIT (§12 GOÄ Pflichtangaben):
Prüfe ob vorhanden: Datum der Leistungserbringung, Name+Anschrift des Arztes, Rechnungsdatum, Rechnungsnummer,
GOÄ-Ziffern mit Bezeichnung, Faktor je Position. Fehlt etwas → flagRechnungUnvollstaendig = true.

BEKANNTE PKV-RISIKOPOSITION EN (axaRisiko):
- 'hoch': IGeL-typische Leistungen (Akupunktur ohne Indikation, ästhetische Behandlungen, Reisemedizin-Impfberatung ohne Reise, Homöopathie-Ziffern GOÄ 30/31, GOÄ 725–728 Hypnose ohne Indikation)
- 'mittel': Ernährungsberatung (GOÄ 77/78), Psychosomatik-Ziffern ohne psychiatrische Diagnose, Analogziffern generell, Positionen ohne direkte Diagnose-Referenz

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
      "flag": "ok",
      "analog": false,
      "kumulationsrisiko": false,
      "kumulationskonflikt": null,
      "begruendungsqualitaet": null,
      "fachgebietAbweichung": false,
      "axaRisiko": null,
      "risikohinweis": null
    }
  ],
  "maxFaktor": 2.3,
  "flagFaktorUeberSchwellenwert": false,
  "flagFehlendeBegrundung": false,
  "einsparpotenzial": 0.00,
  "flagRechnungUnvollstaendig": false,
  "fehlendePflichtangaben": [],
  "zusammenfassung": "Kurze Zusammenfassung der Rechnung auf Deutsch",
  "whatsappNachricht": "Kurze WhatsApp-Nachricht (max 3 Sätze) mit den wichtigsten Befunden für den Patienten"
}

Feldbeschreibungen für goaePositionen:
- flag: "ok" (Faktor ≤2,3), "pruefe" (2,3–3,5), "hoch" (>3,5)
- analog: true wenn als Analogziffer abgerechnet (enthält "analog", "A" oder entsprechenden Hinweis)
- kumulationsrisiko: true wenn diese Ziffer mit einer anderen Position auf DIESER Rechnung ein GOÄ-Kumulationsverbot verletzt
- kumulationskonflikt: die kolliderende Ziffer als String (z.B. "GOÄ 3") oder null
- begruendungsqualitaet: nur befüllen wenn Faktor > 2,3×: "ausreichend" | "generisch" | "fehlend". Sonst null.
- fachgebietAbweichung: true wenn die Leistung typischerweise nicht zum Fachgebiet des abrechnenden Arztes gehört
- axaRisiko: "hoch" (IGeL, homöopathisch, ästhetisch, häufig abgelehnt) | "mittel" (streitig, diagnoseabhängig) | null
- risikohinweis: max 1 Satz Erklärung warum diese Position riskant ist (nur wenn axaRisiko oder kumulationsrisiko gesetzt). Null sonst.

flagFaktorUeberSchwellenwert = true wenn irgendein Faktor > 2,3
flagFehlendeBegrundung = true wenn Faktor > 2,3 aber keine schriftliche Begründung auf der Rechnung erkennbar
einsparpotenzial = Betrag der reduziert werden könnte wenn alle Positionen auf 2,3-fach gedeckelt
flagRechnungUnvollstaendig = true wenn §12 GOÄ Pflichtangaben fehlen (Leistungsdatum, Arztdaten, Ziffernbezeichnung, etc.)
fehlendePflichtangaben = Liste der fehlenden Felder als Strings, z.B. ["Leistungsdatum fehlt", "Arztadresse unvollständig"]`

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

/**
 * Robustly extract JSON from Claude's response.
 * Handles: ```json blocks, leading/trailing text, and finds the first { ... } block.
 */
function extractJson<T>(raw: string): T {
  // 1. Strip markdown code fences
  let text = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // 2. Try direct parse first
  try {
    return JSON.parse(text) as T
  } catch { /* fall through */ }

  // 3. Find the outermost { ... } block (Claude sometimes adds explanatory text)
  const firstBrace = text.indexOf('{')
  const lastBrace  = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T
    } catch { /* fall through */ }
  }

  // 4. Nothing worked — throw with the raw response for debugging
  throw new Error(`JSON parse failed. Raw response (first 500 chars): ${raw.slice(0, 500)}`)
}

// ── Tariff Intelligence Base ──────────────────────────────────────────────────

interface TariffExclusion {
  goae_ziffer: string | null
  rejection_type: string | null
  rejection_reason: string | null
  leistung: string | null
  confidence: string
  occurrence_count: number
}

/**
 * Fetches known rejection patterns for the given PKV tariff from tariff_exclusions.
 * Returns a formatted prompt block, or '' if nothing found / table doesn't exist yet.
 */
async function fetchTariffContext(pkvName: string | null | undefined): Promise<string> {
  if (!pkvName) return ''
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('tariff_exclusions')
      .select('goae_ziffer, rejection_type, rejection_reason, leistung, confidence, occurrence_count')
      .eq('tariff', pkvName)
      .in('confidence', ['haeufig', 'bestaetigt'])
      .order('occurrence_count', { ascending: false })
      .limit(20)

    if (error || !data || data.length === 0) return ''

    const lines = (data as TariffExclusion[]).map(e => {
      const ziffer = e.goae_ziffer ? `GOÄ ${e.goae_ziffer}: ` : ''
      const conf   = e.confidence === 'bestaetigt' ? '✓ bestätigt' : '~ häufig'
      return `- ${conf} | ${ziffer}${e.leistung ?? ''}: ${e.rejection_reason ?? ''}`
    })

    return `\n\nBEKANNTE ABLEHNUNGSMUSTER FÜR ${pkvName} (Tariff Intelligence Base):\n` +
           `Die folgenden Muster wurden in echten Bescheiden beobachtet und sind besonders präzise zu prüfen:\n` +
           lines.join('\n')
  } catch {
    return ''
  }
}

export async function analyzeRechnungPdf(pdfBuffer: Buffer, pkvName?: string | null): Promise<AnalyseResult> {
  const [baseSystemPrompt, userPrompt, model] = await Promise.all([
    getSetting('goae_system_prompt', DEFAULT_SYSTEM_PROMPT),
    getSetting('goae_user_prompt', DEFAULT_USER_PROMPT),
    getSetting('goae_analyse_model', 'claude-sonnet-4-6'),
  ])

  const tariffContext = await fetchTariffContext(pkvName)
  const systemPrompt = tariffContext
    ? baseSystemPrompt + tariffContext
    : baseSystemPrompt

  const { text, usage } = await callAiWithPdf({
    model, systemPrompt, userPrompt,
    pdfBase64: pdfBuffer.toString('base64'),
    maxTokens: 4096,
  })
  logKiUsage({ callType: 'goae_analyse', model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {})
  return extractJson<AnalyseResult>(text)
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
  /**
   * Who should act on this position (only relevant for gekuerzt/abgelehnt):
   * - "widerspruch_kasse"  → formal appeal to the insurance company
   * - "korrektur_arzt"    → ask the doctor to correct/re-issue the invoice
   * - null                → position is fine or no clear action
   */
  aktionstyp?: 'widerspruch_kasse' | 'korrektur_arzt' | null
  /**
   * Estimated probability (0–100) that a Widerspruch on this specific position would succeed.
   * Only relevant when aktionstyp === 'widerspruch_kasse'. Null for erstattet/korrektur_arzt.
   */
  widerspruchWahrscheinlichkeit?: number | null
  /**
   * Confidence (0–100) of the AI in its assessment for this position.
   * High = clear-cut case, low = ambiguous/context-dependent.
   */
  confidence?: number | null
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
  /** Selbstbehalt abgezogen in DIESER Abrechnung */
  selbstbehaltAbgezogen: number | null
  /** Verbleibender Selbstbehalt für das laufende Kalenderjahr (laut Bescheid) */
  selbstbehaltVerbleibend: number | null
  /** Jahres-Selbstbehalt-Grenze laut Vertrag (laut Bescheid, falls angegeben) */
  selbstbehaltJahresgrenze: number | null
  /** Rechnungen grouped by provider — key field for matching */
  rechnungen: KasseRechnungGruppe[]
  /** All positions flat (for backward-compat display in modals) */
  positionen: KassePosition[]
  ablehnungsgruende: string[]
  widerspruchEmpfohlen: boolean
  /** 2–3 sentence plain-language explanation FOR THE USER: what was rejected and why appealing makes sense */
  widerspruchErklaerung: string | null
  /** Ready-to-use 1st-person letter paragraph TO AXA — used verbatim in the Widerspruch letter */
  widerspruchBegruendung: string | null
  /** Estimated success probability for appeal 0–100, null if no appeal recommended */
  widerspruchErfolgswahrscheinlichkeit: number | null
  /** Step-by-step recommended actions for the patient */
  naechsteSchritte: string[] | null
  zusammenfassung: string
}

const DEFAULT_KASSE_SYSTEM_PROMPT = `Du bist ein Experte für deutsche private Krankenversicherungen (PKV), insbesondere für die Analyse von Erstattungsbescheiden der AXA Krankenversicherung.
Analysiere den vorliegenden Erstattungsbescheid präzise und strukturiert.

WICHTIGE REGELN:
- Gruppiere Positionen nach Arzt/Leistungserbringer und Rechnung
- Prüfe ob alle eingereichten Positionen erstattet wurden
- Identifiziere Kürzungen und ihre Begründungen im Detail

⚡ PFLICHT — POSITIONEN AUS ANMERKUNGEN:
AXA-Bescheide enthalten auf der Rückseite "Anmerkungen" (Anmerkung 1, Anmerkung 2, etc.).
Jede einzelne Anmerkung mit einem eigenen Ablehnungsbetrag MUSS als SEPARATE Position in
rechnungen[].positionen erscheinen. NIEMALS mehrere Anmerkungen zu einer Position zusammenfassen.
Beispiel: Hat ein Arzt 2 Anmerkungen (GOÄ 31 abgelehnt + Ernährungsberatung abgelehnt),
dann MÜSSEN 2 separate Positionen im Array stehen — eine pro Anmerkung.
Für voll erstattete Rechnungen ohne Anmerkungen: eine Position mit status "erstattet".

- Bewerte ob ein Widerspruch sinnvoll ist und schätze die Erfolgswahrscheinlichkeit realistisch ein:
  * 70–90 %: Formale Fehler der Kasse (falsche GOÄ-Anwendung, fehlende Begründung der Ablehnung)
  * 50–70 %: Streitige Leistungspositionen (z.B. IGeL-Abgrenzung, medizinische Notwendigkeit)
  * 20–50 %: Vertragliche Ausschlüsse, klare Tarifbedingungen
  * < 20 %: Eindeutige Vertragsausschlüsse oder bereits rechtskräftig entschieden
- Erstattungsquote = betragErstattet / betragEingereicht * 100
- Selbstbehalt: Viele PKV-Verträge haben einen jährlichen Selbstbehalt.
  Suche nach Begriffen wie "Selbstbehalt", "Eigenanteil", "Jahresselbstbehalt",
  "verbleibender Selbstbehalt", "noch verbleibend" — diese Beträge sind explizit
  auf dem Bescheid ausgewiesen und MÜSSEN extrahiert werden.
- Nächste Schritte: Gib konkrete, handlungsorientierte Empfehlungen für den Versicherten.

ZWEI VERSCHIEDENE TEXTFELDER — nicht verwechseln:
- widerspruchErklaerung: 2–3 Sätze in LAIENSPRACHE für den Versicherten — erklärt WAS abgelehnt wurde
  und WARUM ein Widerspruch Sinn macht. Kein Juristenjargon. Kein "Ich beantrage...".
  Beispiel: "AXA hat die Ernährungsberatung (40,22 €) abgelehnt, weil sie keine medizinische
  Notwendigkeit erkennt. Das ist anfechtbar: Wenn eine ärztliche Diagnose vorliegt, gilt
  Ernährungstherapie als Heilbehandlung. Ein Widerspruch hat gute Chancen."
- widerspruchBegruendung: Fertiger Briefabsatz in ICH-FORM direkt an AXA — wird wörtlich ins
  Widerspruchsschreiben eingefügt. Beginnt mit "Ich beantrage..." oder "Hiermit widerspreche ich...".
  KEIN analytischer Ton, KEINE "Fordern Sie..."-Formulierungen. Wenn kein Widerspruch sinnvoll: null.

AKTIONSTYP PRO POSITION (für gekürzte oder abgelehnte Positionen):
Jede Position mit status "gekuerzt" oder "abgelehnt" MUSS ein aktionstyp-Feld erhalten:
- "widerspruch_kasse": Die Ablehnung/Kürzung ist anfechtbar bei der Versicherung, z.B.:
    * Falsche GOÄ-Auslegung der Kasse
    * Fehlende oder unzureichende Begründung der Ablehnung
    * Position ist medizinisch indiziert und tarif-konform
    * Kasse hat gegen § 192 VVG verstoßen
- "korrektur_arzt": Das Problem liegt in der Arztrechnung selbst, z.B.:
    * GOÄ-Ziffer falsch angewandt oder nicht abrechenbar
    * Faktor über 2,3× ohne §12 GOÄ-Begründung
    * Doppelabrechnung (§ 4 GOÄ-Verstoß)
    * Analogziffer nicht korrekt begründet
    * Rechnung formal fehlerhaft (falsche Nummer, fehlendes Datum etc.)
Für "erstattet"-Positionen: aktionstyp = null.

WIDERSPRUCHSWAHRSCHEINLICHKEIT + CONFIDENCE PRO POSITION:
Für jede Position mit aktionstyp "widerspruch_kasse" MUSS ein widerspruchWahrscheinlichkeit-Wert (0–100) gesetzt werden:
  * 70–90: Formaler Fehler der Kasse (falsche GOÄ-Anwendung, fehlende Begründung)
  * 50–70: Streitig (medizinische Notwendigkeit unklar, IGeL-Abgrenzung)
  * 20–50: Vertragliche Ausschlüsse, aber Ermessensspielraum vorhanden
  * < 20: Eindeutiger Vertragsausschluss, kaum Erfolgsaussicht
Für alle anderen Positionen: widerspruchWahrscheinlichkeit = null.

Für JEDE Position MUSS ein confidence-Wert (0–100) gesetzt werden:
  * 85–100: Eindeutiger Fall, klare Rechtslage
  * 65–85: Wahrscheinliche Einschätzung, geringe Ambiguität
  * 40–65: Ambiguität vorhanden, abhängig von weiteren Unterlagen
  * < 40: Sehr unsicher, nur mit vollständiger Akte beurteilbar

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
          "ziffer": "31 analog",
          "bezeichnung": "Homöopathische Folgeanamnese (analog berechnet)",
          "betragEingereicht": 44.01,
          "betragErstattet": 10.72,
          "status": "gekuerzt",
          "ablehnungsgrund": "Analogziffer GOÄ 31 nicht anerkannt — nur für homöopathische Folgeanamnese zulässig. AXA erstattete stattdessen GOÄ 1 (Beratung) zum Höchstsatz.",
          "aktionstyp": "korrektur_arzt",
          "widerspruchWahrscheinlichkeit": null,
          "confidence": 88
        },
        {
          "ziffer": "diverse",
          "bezeichnung": "Ernährungsberatung",
          "betragEingereicht": 40.22,
          "betragErstattet": 0.00,
          "status": "abgelehnt",
          "ablehnungsgrund": "Keine medizinische Notwendigkeit erkennbar bzw. keine medizinisch notwendige Heilbehandlung",
          "aktionstyp": "widerspruch_kasse",
          "widerspruchWahrscheinlichkeit": 65,
          "confidence": 72
        }
      ]
    }
  ],
  "selbstbehaltAbgezogen": 31.89,
  "selbstbehaltVerbleibend": 50.00,
  "selbstbehaltJahresgrenze": 500.00,
  "ablehnungsgruende": ["Liste aller Ablehnungsgründe als Strings"],
  "widerspruchEmpfohlen": true,
  "widerspruchErklaerung": "AXA hat die Ernährungsberatung (40,22 €) abgelehnt, weil sie keine medizinische Notwendigkeit erkennt. Das ist anfechtbar: Liegt eine ärztliche Diagnose vor (z.B. Diabetes, Adipositas), gilt Ernährungstherapie als Heilbehandlung und ist erstattungsfähig. Ein Widerspruch hat gute Erfolgsaussichten.",
  "widerspruchBegruendung": "Ich beantrage die vollständige Erstattung der Ernährungsberatung in Höhe von 40,22 EUR. Die Behandlung war medizinisch notwendig gemäß § 1 Abs. 2 MB/KK, da sie ärztlich verordnet und auf eine dokumentierte Diagnose zurückzuführen ist. Ernährungstherapie ist bei entsprechender Indikation eine anerkannte Heilbehandlung. Ihre pauschale Ablehnung wegen fehlender medizinischer Notwendigkeit ist nicht ausreichend begründet im Sinne des § 192 VVG. Ich fordere Sie daher auf, die Erstattung zu gewähren.",
  "widerspruchErfolgswahrscheinlichkeit": 65,
  "naechsteSchritte": [
    "Innerhalb von 4 Wochen schriftlichen Widerspruch einlegen (Frist beachten!)",
    "Ablehnungsschreiben der Kasse vollständig anfordern (§ 192 VVG)",
    "Ärztliche Stellungnahme zur medizinischen Notwendigkeit einholen"
  ],
  "zusammenfassung": "Kurze Zusammenfassung (2-3 Sätze)"
}

WICHTIG:
- "rechnungen" MUSS alle Leistungserbringer/Rechnungen als separate Objekte enthalten.
  Wenn der Bescheid Positionen verschiedener Ärzte enthält, erstelle für jeden Arzt eine eigene Gruppe.
- "selbstbehaltAbgezogen": Betrag des Selbstbehalts der in DIESER Abrechnung abgezogen wurde.
  Null wenn kein Selbstbehalt abgezogen wurde.
- "selbstbehaltVerbleibend": Der auf dem Bescheid ausgewiesene verbleibende Selbstbehalt
  für das laufende Kalenderjahr. Null wenn nicht angegeben.
- "selbstbehaltJahresgrenze": Der Jahres-Selbstbehalt-Gesamtbetrag laut Vertrag.
  Null wenn nicht angegeben.
- Status-Werte für positionen: "erstattet" | "gekuerzt" | "abgelehnt"
- aktionstyp für gekuerzt/abgelehnt: "widerspruch_kasse" | "korrektur_arzt" (null für erstattet)
- widerspruchWahrscheinlichkeit: 0–100 nur wenn aktionstyp="widerspruch_kasse", sonst null
- confidence: 0–100 für JEDE Position (Sicherheit der KI-Einschätzung)`

// This rule is always appended to whatever system prompt is active (DB override or default),
// to guarantee widerspruchBegruendung is always written as a direct 1st-person argument.
const WIDERSPRUCH_FORMAT_ENFORCEMENT = `

⚡ ABSOLUTE PFLICHT – widerspruchBegruendung:
Dieses Feld ist ein fertiger, direkter Briefabsatz an AXA — KEINE Erklärung für den Versicherten.
Schreibe AUSSCHLIESSLICH in der Ich-Form als würde der Versicherte direkt an AXA schreiben:
  RICHTIG: "Ich beantrage die vollständige Erstattung von X EUR. Die Ablehnung widerspricht § 192 VVG, da die Behandlung medizinisch notwendig war und ärztlich verordnet wurde."
  FALSCH: "Ein Widerspruch ist aussichtsreich. Fordern Sie eine Begründung an. Legen Sie vor..."
  FALSCH: "Die Ablehnung sollte angefochten werden. Der Arzt sollte eine Stellungnahme einreichen."
Starte den Text IMMER mit "Ich beantrage" oder "Gegen Ihre Ablehnung" oder "Hiermit widerspreche ich".
Verwende NIEMALS: "Fordern Sie", "legen Sie vor", "sollte", "empfehle", "aussichtsreich", "könnte".`

export async function analyzeKassePdf(pdfBuffer: Buffer, pkvName?: string | null): Promise<KasseAnalyseResult> {
  const [baseSystemPrompt, userPrompt, model] = await Promise.all([
    getSetting('kasse_analyse_prompt', DEFAULT_KASSE_SYSTEM_PROMPT),
    getSetting('kasse_analyse_user_prompt', DEFAULT_KASSE_USER_PROMPT),
    getSetting('kasse_analyse_model', 'claude-sonnet-4-6'),
  ])

  const tariffContext = await fetchTariffContext(pkvName)

  // Always enforce 1st-person format for widerspruchBegruendung,
  // even if an older DB-stored prompt overrides the default.
  // Tariff context is injected between base prompt and widerspruch enforcement.
  const systemPrompt = baseSystemPrompt + tariffContext + WIDERSPRUCH_FORMAT_ENFORCEMENT

  const { text, usage } = await callAiWithPdf({
    model, systemPrompt, userPrompt,
    pdfBase64: pdfBuffer.toString('base64'),
    maxTokens: 8192,
  })
  logKiUsage({ callType: 'kasse_analyse', model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {})
  const result = extractJson<KasseAnalyseResult>(text)

  // Ensure all fields exist with safe defaults (backward compat)
  if (result.selbstbehaltAbgezogen                 === undefined) result.selbstbehaltAbgezogen                 = null
  if (result.selbstbehaltVerbleibend               === undefined) result.selbstbehaltVerbleibend               = null
  if (result.selbstbehaltJahresgrenze              === undefined) result.selbstbehaltJahresgrenze              = null
  if (result.widerspruchErfolgswahrscheinlichkeit  === undefined) result.widerspruchErfolgswahrscheinlichkeit  = null
  if (result.naechsteSchritte                      === undefined) result.naechsteSchritte                      = null
  if (result.widerspruchErklaerung                 === undefined) result.widerspruchErklaerung                 = null

  // Ensure rechnungen array exists (backward compat if Claude omits it)
  if (!result.rechnungen) result.rechnungen = []
  if (!result.positionen) result.positionen = []

  return result
}
