/**
 * Rule-based GOÄ invoice parser.
 *
 * Pipeline:
 *   1. Extract plain text from PDF (pdf-parse, pure JS — works on Vercel)
 *   2. Parse GOÄ positions via multi-pattern regex
 *   3. Score extraction confidence (0–1)
 *   4. Apply deterministic risk rules (same logic as the AI prompt)
 *   5. Return AnalyseResult + confidence score
 *
 * Caller uses this result directly if confidence >= CONFIDENCE_THRESHOLD (0.70),
 * otherwise falls back to Haiku.
 */

import type { AnalyseResult, GoaePosition } from './goae-analyzer'

// ── Confidence threshold ───────────────────────────────────────────────────────
export const CONFIDENCE_THRESHOLD = 0.70

// ── Known AXA risk ziffern (from goae-analyzer DEFAULT_SYSTEM_PROMPT) ─────────
const AXA_RISIKO_HOCH  = new Set(['30', '31', '725', '726', '727', '728'])
const AXA_RISIKO_MITTEL = new Set(['77', '78'])

const RISIKO_HINWEISE: Record<string, string> = {
  '30':  'Homöopathische Anamnese — AXA lehnt häufig ab (IGeL-Verdacht)',
  '31':  'Homöopathische Folgeanamnese — analog abgerechnet, AXA erkennt Analogziffer oft nicht an',
  '77':  'Ernährungsberatung — erstattungsfähig nur bei ärztlicher Diagnose (z.B. Diabetes)',
  '78':  'Ernährungsberatung (GOÄ 78) — erstattungsfähig nur mit medizinischer Begründung',
  '725': 'Hypnose — AXA erstattet nur bei anerkannter Indikation',
  '726': 'Hypnose (Gruppe) — AXA erstattet nur bei anerkannter Indikation',
  '727': 'Hypnose — häufig als IGeL eingestuft',
  '728': 'Hypnose — häufig als IGeL eingestuft',
}

// ── Kumulationsverbote pairs [ziffer_a, ziffer_b, erklärung] ──────────────────
const KUMULATIONS_VERBOTE: [string, string, string][] = [
  ['1', '3',    'GOÄ 1 neben GOÄ 3 am selben Tag unzulässig (§4 GOÄ)'],
  ['1', '4',    'GOÄ 1 neben GOÄ 4 am selben Tag unzulässig (§4 GOÄ)'],
  ['1', '5',    'GOÄ 1 neben GOÄ 5 am selben Tag unzulässig (§4 GOÄ)'],
  ['5', '6',    'GOÄ 5 schließt GOÄ 6 aus (Teiluntersuchung enthalten)'],
  ['5', '7',    'GOÄ 5 schließt GOÄ 7 aus (Teiluntersuchung enthalten)'],
  ['5', '8',    'GOÄ 5 schließt GOÄ 8 aus (Teiluntersuchung enthalten)'],
  ['26', '27',  'GOÄ 26 und GOÄ 27 nicht gleichzeitig abrechenbar'],
  ['45', '46',  'GOÄ 45 und GOÄ 46 schließen sich gegenseitig aus'],
  ['3511', '3550', 'Großes Blutbild (3511) schließt GOÄ 3550 aus'],
  ['3511', '3551', 'Großes Blutbild (3511) schließt GOÄ 3551 aus'],
]

// ── German number parsing ──────────────────────────────────────────────────────
function parseDE(s: string): number {
  // "1.234,56" → 1234.56  |  "44,01" → 44.01  |  "2,3" → 2.3
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned)
}

// ── PDF text extraction ────────────────────────────────────────────────────────
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import avoids Next.js build issues with pdf-parse's test file loader
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
    const data = await pdfParse(buffer)
    return data.text ?? ''
  } catch {
    return ''
  }
}

// ── GOÄ position parser ────────────────────────────────────────────────────────
interface RawPosition {
  ziffer:      string
  bezeichnung: string
  faktor:      number
  betrag:      number
  lineText:    string
}

function parseGoaePositionen(text: string): RawPosition[] {
  const positions: RawPosition[] = []
  const seen = new Set<string>()

  // Normalise whitespace & line breaks
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    // ── Pattern A: GOÄ/GOA/Nr prefix followed by ziffer
    // e.g. "GOÄ 31  Homöopathische Folgeanamnese   2,30  44,01"
    const patA = /^(?:GOÄ|GOA|Geb(?:ühr)?(?:\.|\/)?(?:Nr\.?|Ziff\.?)?\s*)(\d{1,4}[A-Z]?)\s{1,}(.+?)\s{2,}(\d[,.]?\d{0,3})\s{1,}(\d{1,5}[,.]\d{2})/i
    const mA = patA.exec(line)
    if (mA) {
      const ziffer = mA[1].trim()
      const faktor = parseDE(mA[3])
      const betrag = parseDE(mA[4])
      if (faktor >= 0.5 && faktor <= 10 && betrag > 0 && !seen.has(ziffer)) {
        seen.add(ziffer)
        positions.push({ ziffer, bezeichnung: mA[2].trim(), faktor, betrag, lineText: line })
        continue
      }
    }

    // ── Pattern B: Bare ziffer at start of line (table row without GOÄ prefix)
    // e.g. "31  Homöopathische Folgeanamnese   2,3   44,01 €"
    const patB = /^(\d{1,4}[A-Z]?)\s{2,}(.+?)\s{2,}(\d[,.]?\d{0,3})\s{1,}(\d{1,5}[,.]\d{2})\s*(?:€|EUR)?/
    const mB = patB.exec(line)
    if (mB) {
      const ziffer = mB[1].trim()
      const faktor = parseDE(mB[3])
      const betrag = parseDE(mB[4])
      // Sanity: ziffer should not be year (2024,2025,2026) or date fragment
      const zifferNum = parseInt(ziffer)
      if (faktor >= 0.5 && faktor <= 10 && betrag > 0 &&
          zifferNum >= 1 && zifferNum <= 9999 &&
          !(zifferNum >= 2000 && zifferNum <= 2030) && // exclude years
          !seen.has(ziffer)) {
        seen.add(ziffer)
        positions.push({ ziffer, bezeichnung: mB[2].trim(), faktor, betrag, lineText: line })
        continue
      }
    }

    // ── Pattern C: "fach" notation — "2,3-fach" or "2,30fach"
    // Some invoices write factor separately: "31  Homöopathie   2,30-fach   44,01"
    const patC = /^(?:GOÄ\s*)?(\d{1,4}[A-Z]?)\s{1,}(.+?)\s{1,}(\d[,.]\d{1,3})\s*[-–]?\s*fach\s{1,}(\d{1,5}[,.]\d{2})/i
    const mC = patC.exec(line)
    if (mC) {
      const ziffer = mC[1].trim()
      const faktor = parseDE(mC[3])
      const betrag = parseDE(mC[4])
      if (faktor >= 0.5 && faktor <= 10 && betrag > 0 && !seen.has(ziffer)) {
        seen.add(ziffer)
        positions.push({ ziffer, bezeichnung: mC[2].trim(), faktor, betrag, lineText: line })
      }
    }
  }

  return positions
}

// ── Extract invoice metadata from text ────────────────────────────────────────
function extractMetadata(text: string): {
  arztName: string | null
  arztFachgebiet: string | null
  rechnungsdatum: string | null
  rechnungsnummer: string | null
  betragGesamt: number
} {
  // Rechnungsdatum: "Datum: 15.03.2026" or "Rechnung vom 15.03.2026"
  const datumM = /(?:Rechnungsdatum|Rechnung\s+vom|Datum)[:\s]+(\d{2})[.\-/](\d{2})[.\-/](\d{4})/i.exec(text)
  const rechnungsdatum = datumM
    ? `${datumM[3]}-${datumM[2]}-${datumM[1]}`
    : null

  // Rechnungsnummer
  const rnrM = /(?:Rechnungs?(?:nummer|nr\.?)|Nr\.)[:\s#]+([A-Z0-9\-/]+)/i.exec(text)
  const rechnungsnummer = rnrM ? rnrM[1].trim() : null

  // Gesamtbetrag — look for "Gesamtbetrag", "Endbetrag", "Gesamt", "Summe"
  const totalM = /(?:Gesamt(?:betrag)?|Endbetrag|Rechnungsbetrag|Summe)[:\s]+(\d{1,5}[,.]\d{2})\s*(?:€|EUR)?/i.exec(text)
  const betragGesamt = totalM ? parseDE(totalM[1]) : 0

  // Arzt name — first line that looks like "Dr. med. Firstname Lastname" or "Dr. Lastname"
  const arztM = /\b((?:Dr\.?\s*(?:med\.?\s*|rer\.?\s*nat\.?\s*)?|Prof\.?\s*(?:Dr\.?\s*)?)?[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/m.exec(text)
  const arztName = arztM ? arztM[1].trim() : null

  return { arztName, arztFachgebiet: null, rechnungsdatum, rechnungsnummer, betragGesamt }
}

// ── Confidence scoring ────────────────────────────────────────────────────────
function scoreConfidence(positions: RawPosition[], betragGesamt: number): number {
  if (positions.length === 0) return 0

  let score = 0

  // Base score from number of positions found
  score += Math.min(positions.length * 0.15, 0.45)

  // All factors in valid GOÄ range?
  const validFactors = positions.every(p => p.faktor >= 1.0 && p.faktor <= 7.0)
  if (validFactors) score += 0.15

  // All amounts positive?
  const validAmounts = positions.every(p => p.betrag > 0)
  if (validAmounts) score += 0.10

  // Sum of positions close to Gesamtbetrag (within 5%)?
  if (betragGesamt > 0) {
    const posSum = positions.reduce((s, p) => s + p.betrag, 0)
    const ratio  = Math.abs(posSum - betragGesamt) / betragGesamt
    if (ratio < 0.05) score += 0.30
    else if (ratio < 0.15) score += 0.15
  }

  return Math.min(score, 1.0)
}

// ── Risk rule engine ──────────────────────────────────────────────────────────
function applyRiskRules(rawPositions: RawPosition[]): GoaePosition[] {
  const zifferSet = new Set(rawPositions.map(p => p.ziffer))

  return rawPositions.map(raw => {
    const faktor = raw.faktor

    // ── Faktor flag ──
    const flag: 'ok' | 'pruefe' | 'hoch' =
      faktor > 3.5 ? 'hoch' :
      faktor > 2.3 ? 'pruefe' : 'ok'

    // ── Analogziffer detection ──
    const analogKeywords = /analog|entsprechend|\bA\b/i
    const analog = analogKeywords.test(raw.bezeichnung) ||
                   analogKeywords.test(raw.ziffer) ||
                   /[A-Z]$/.test(raw.ziffer)

    // ── Begründungsqualität ──
    const begruendungsqualitaet: GoaePosition['begruendungsqualitaet'] =
      faktor > 2.3 ? 'fehlend' : null
    // (Rule engine can't read the justification text — always 'fehlend' when >2.3×)

    // ── AXA Risiko ──
    let axaRisiko: 'hoch' | 'mittel' | null = null
    let risikohinweis: string | null = null
    if (AXA_RISIKO_HOCH.has(raw.ziffer)) {
      axaRisiko = 'hoch'
      risikohinweis = RISIKO_HINWEISE[raw.ziffer] ?? null
    } else if (AXA_RISIKO_MITTEL.has(raw.ziffer)) {
      axaRisiko = 'mittel'
      risikohinweis = RISIKO_HINWEISE[raw.ziffer] ?? null
    } else if (analog) {
      axaRisiko = 'mittel'
      risikohinweis = 'Analogziffer — PKV kann Erstattung ablehnen wenn keine passende Originalziffer existiert'
    }

    // ── Kumulationsverbote ──
    let kumulationsrisiko = false
    let kumulationskonflikt: string | null = null
    for (const [a, b, erkl] of KUMULATIONS_VERBOTE) {
      if ((raw.ziffer === a && zifferSet.has(b)) || (raw.ziffer === b && zifferSet.has(a))) {
        kumulationsrisiko = true
        kumulationskonflikt = raw.ziffer === a ? `GOÄ ${b}` : `GOÄ ${a}`
        if (!risikohinweis) risikohinweis = erkl
        break
      }
    }

    return {
      ziffer:               raw.ziffer,
      bezeichnung:          raw.bezeichnung,
      faktor:               raw.faktor,
      betrag:               raw.betrag,
      flag,
      analog,
      kumulationsrisiko,
      kumulationskonflikt,
      begruendungsqualitaet,
      fachgebietAbweichung: false, // can't determine without AI
      axaRisiko,
      risikohinweis,
    }
  })
}

// ── Build AnalyseResult from parsed data ──────────────────────────────────────
function buildAnalyseResult(
  positions: GoaePosition[],
  meta: ReturnType<typeof extractMetadata>
): AnalyseResult {
  const maxFaktor = positions.length > 0
    ? Math.max(...positions.map(p => p.faktor))
    : 1.0

  const flagFaktorUeberSchwellenwert = maxFaktor > 2.3
  const flagFehlendeBegrundung       = positions.some(p => p.faktor > 2.3)

  // Einsparpotenzial: difference if all factors capped at 2.3×
  const einsparpotenzial = positions.reduce((sum, p) => {
    if (p.faktor > 2.3) {
      const capped = p.betrag * (2.3 / p.faktor)
      return sum + (p.betrag - capped)
    }
    return sum
  }, 0)

  const risiken = positions.filter(p => p.flag !== 'ok' || p.axaRisiko || p.kumulationsrisiko)

  const zusammenfassung = risiken.length > 0
    ? `Automatisch geprüft: ${positions.length} GOÄ-Position${positions.length !== 1 ? 'en' : ''} gefunden. ` +
      `${risiken.length} Position${risiken.length !== 1 ? 'en' : ''} mit Auffälligkeiten (Faktor, AXA-Risiko oder Kumulationsverbot).`
    : `Automatisch geprüft: ${positions.length} GOÄ-Position${positions.length !== 1 ? 'en' : ''} — keine offensichtlichen Auffälligkeiten.`

  return {
    arztName:                    meta.arztName,
    arztFachgebiet:              meta.arztFachgebiet,
    rechnungsdatum:              meta.rechnungsdatum,
    rechnungsnummer:             meta.rechnungsnummer,
    betragGesamt:                meta.betragGesamt || positions.reduce((s, p) => s + p.betrag, 0),
    goaePositionen:              positions,
    maxFaktor,
    flagFaktorUeberSchwellenwert,
    flagFehlendeBegrundung,
    einsparpotenzial:            Math.round(einsparpotenzial * 100) / 100,
    flagRechnungUnvollstaendig:  !meta.rechnungsdatum || !meta.arztName,
    fehlendePflichtangaben:      [
      ...(!meta.rechnungsdatum ? ['Rechnungsdatum nicht erkannt'] : []),
      ...(!meta.arztName       ? ['Arztname nicht erkannt']       : []),
    ],
    zusammenfassung,
    whatsappNachricht: zusammenfassung,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export interface RuleEngineResult {
  result:     AnalyseResult
  confidence: number
  method:     'rule_engine'
}

export async function analyzeRechnungRuleBased(
  pdfBuffer: Buffer
): Promise<RuleEngineResult | null> {
  const text = await extractPdfText(pdfBuffer)
  if (!text || text.trim().length < 50) {
    // PDF is likely scanned/image-based — can't extract text
    return null
  }

  const rawPositions = parseGoaePositionen(text)
  const meta         = extractMetadata(text)
  const confidence   = scoreConfidence(rawPositions, meta.betragGesamt)

  if (rawPositions.length === 0) return null

  const positions = applyRiskRules(rawPositions)
  const result    = buildAnalyseResult(positions, meta)

  return { result, confidence, method: 'rule_engine' }
}
