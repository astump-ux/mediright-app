/**
 * goae-context.ts
 *
 * Enriches fall-context with relevant GOÄ position data from goae_positionen table.
 * Called when GOÄ billing disputes are detected in AXA rejection reasons.
 *
 * Fail-silent: always returns '' on error so it never breaks the main pipeline.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface GoaePosition {
  ziffer: string
  kurzbezeichnung: string
  faktortyp: string
  schwellenwert: number
  hoechstsatz: number
  analog_ziffer: string | null
  begruendungspflicht: boolean
  pkv_streitpotenzial: string
  typische_ablehnung: string | null
  ki_hinweis: string | null
}

/**
 * Extract GOÄ Ziffern mentioned in billing or rejection text.
 * Looks for patterns like "GOÄ 5", "Ziffer 5855", "Nr. 34", "§6 GOÄ", etc.
 */
function extractZiffernFromText(text: string): string[] {
  const found = new Set<string>()

  // Match "GOÄ 5", "GOÄ-Nr. 34", "Ziffer 5855", "Nr. 565", "Ziff. 1"
  const patterns = [
    /GOÄ[\s\-]*(?:Nr\.?|Ziff(?:er)?\.?)?\s*(\d{1,4}[a-z]?)/gi,
    /Ziff(?:er)?\.?\s*(\d{1,4}[a-z]?)/gi,
    /Nr\.?\s*(\d{1,4}[a-z]?)/gi,
    /\bPos(?:ition)?\.?\s*(\d{1,4}[a-z]?)/gi,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const ziffer = match[1].trim()
      // Filter out implausibly small numbers (e.g. "§6" should not match as Ziffer 6)
      // GOÄ Ziffern range from 1 to 5855; avoid matching years, amounts, etc.
      const num = parseInt(ziffer)
      if (!isNaN(num) && num >= 1 && num <= 5999) {
        found.add(ziffer)
      }
    }
  }

  return Array.from(found)
}

/**
 * Format a single GOÄ position into a concise context block.
 */
function formatPosition(pos: GoaePosition): string {
  const lines: string[] = []

  const analogNote = pos.analog_ziffer ? ` (analog nach §6 GOÄ, Basis: Nr. ${pos.analog_ziffer})` : ''
  lines.push(`GOÄ Nr. ${pos.ziffer} – ${pos.kurzbezeichnung}${analogNote}`)

  const schwelle = pos.schwellenwert.toFixed(2).replace('.', ',')
  const hoechst = pos.hoechstsatz.toFixed(2).replace('.', ',')
  const typ = pos.faktortyp === 'normal' ? 'Normalleistung' :
              pos.faktortyp === 'technisch' ? 'Technische Leistung' : 'Laborleistung'
  lines.push(`  Typ: ${typ} | Schwellenwert: ${schwelle}x | Höchstsatz: ${hoechst}x`)

  if (pos.begruendungspflicht) {
    lines.push(`  ⚠ §12 Abs.3 GOÄ: Schriftliche Begründungspflicht bei Überschreitung des Schwellenwerts`)
  }

  if (pos.typische_ablehnung) {
    lines.push(`  Typischer PKV-Ablehnungsgrund: ${pos.typische_ablehnung}`)
  }

  if (pos.ki_hinweis) {
    lines.push(`  Handlungsempfehlung: ${pos.ki_hinweis}`)
  }

  return lines.join('\n')
}

/**
 * Build GOÄ context block for the AI.
 *
 * @param rechnungsText  Full text of the doctor's invoice (for Ziffer extraction)
 * @param ablehnungsText Full text of AXA's rejection (for Ziffer extraction)
 * @param explicitZiffern Optional: Ziffern already known/parsed from structured data
 * @returns Formatted context string, or '' if nothing relevant found or on error
 */
export async function getGoaeContext(
  rechnungsText: string,
  ablehnungsText: string,
  explicitZiffern: string[] = []
): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Combine all text sources for Ziffer extraction
    const combinedText = `${rechnungsText} ${ablehnungsText}`
    const detectedZiffern = extractZiffernFromText(combinedText)

    // Merge with explicitly provided Ziffern, deduplicate
    const allZiffern = Array.from(new Set([...explicitZiffern, ...detectedZiffern]))

    if (allZiffern.length === 0) {
      return ''
    }

    // Query positions for detected Ziffern, sorted by dispute potential
    const { data: positions, error } = await supabase
      .from('goae_positionen')
      .select(`
        ziffer,
        kurzbezeichnung,
        faktortyp,
        schwellenwert,
        hoechstsatz,
        analog_ziffer,
        begruendungspflicht,
        pkv_streitpotenzial,
        typische_ablehnung,
        ki_hinweis
      `)
      .in('ziffer', allZiffern)
      .order('pkv_streitpotenzial', { ascending: true }) // 'hoch' sorts before 'mittel', 'niedrig'

    if (error || !positions || positions.length === 0) {
      return ''
    }

    // Also fetch meta-rows with general factor info if GOÄ billing dispute suspected
    const isGoaeDispute = /faktor|schwellenwert|analog|begründung|§\s*5|§\s*6|§\s*12/i.test(ablehnungsText)
    let metaRows: GoaePosition[] = []

    if (isGoaeDispute) {
      const { data: meta } = await supabase
        .from('goae_positionen')
        .select('ziffer, kurzbezeichnung, faktortyp, schwellenwert, hoechstsatz, analog_ziffer, begruendungspflicht, pkv_streitpotenzial, typische_ablehnung, ki_hinweis')
        .in('ziffer', ['FAKTOR_NORMAL', 'FAKTOR_TECH'])

      if (meta) metaRows = meta
    }

    const allPositions = [...(metaRows ?? []), ...positions]

    // Cap at 8 positions to keep context manageable
    const capped = allPositions.slice(0, 8)

    const lines: string[] = [
      '--- GOÄ-Positionsdaten (relevante Ziffern) ---',
    ]

    for (const pos of capped) {
      lines.push(formatPosition(pos as GoaePosition))
    }

    // Add a general note about unrecognized Ziffern
    const unrecognized = allZiffern.filter(z => !positions.some(p => p.ziffer === z))
    if (unrecognized.length > 0) {
      lines.push(
        `Hinweis: GOÄ-Ziffern ${unrecognized.join(', ')} wurden in der Rechnung erkannt,` +
        ` befinden sich aber nicht in der kuratieren Streitfall-Datenbank (ggf. unkritisch).`
      )
    }

    lines.push('---')

    return lines.join('\n')
  } catch {
    // Fail-silent: never break the main pipeline
    return ''
  }
}
