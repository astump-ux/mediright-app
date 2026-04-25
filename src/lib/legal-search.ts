/**
 * legal-search.ts
 *
 * Suche nach relevanten BGH-Urteilen zu PKV-Streitfällen.
 *
 * Quelle: Supabase-Tabelle `pkv_urteile` — kuratierte, verifizierte Entscheidungen
 * des BGH IV. Zivilsenats (Stand: April 2026).
 *
 * Hintergrund: OpenLegalData (de.openlegaldata.io) enthält keine BGH IV ZR-Urteile
 * und sortiert Suchergebnisse nach Datum statt Relevanz → unbrauchbar für PKV-Zwecke.
 * Die Supabase-Tabelle bietet verifizierte Urteile mit PKV-spezifischer Aufbereitung.
 *
 * Kategorie-Mapping:
 *   beitragsanpassung      → § 203 VVG Prämienerhöhungs-Streitigkeiten
 *   medizinische_notwendigkeit → Erstattungsstreitigkeiten wegen Notwendigkeitszweifeln
 *   goae                   → GOÄ-Abrechnungs- und Faktor-Streitigkeiten
 *   ausschlussklausel      → Klauselauslegung, Vorerkrankungsausschlüsse
 *   allgemein              → übergreifende PKV-Grundsatzurteile
 */

import { getSupabaseAdmin } from './supabase-admin'

interface PkvUrteil {
  aktenzeichen:   string
  datum:          string
  kategorie:      string
  schlagwoerter:  string[]
  leitsatz:       string
  relevanz_pkv:   string
  quelle_url:     string | null
}

/**
 * Ordnet Ablehnungsgründe den pkv_urteile-Kategorien zu.
 * Gibt alle relevanten Kategorien zurück (ohne Duplikate).
 */
function mapAblehnungsgruendeToKategorien(ablehnungsgruende: string[]): string[] {
  const text = ablehnungsgruende.join(' ').toLowerCase()
  const kategorien = new Set<string>()

  if (/beitrag|prämie|erhöhung|anpassung|beitragsanpassung|prämienanpassung/.test(text)) {
    kategorien.add('beitragsanpassung')
  }
  if (/notwendig|heilbehandlung|behandlung|therapie|medizinisch|indiziert|alternativ/.test(text)) {
    kategorien.add('medizinische_notwendigkeit')
  }
  if (/goä|goa|faktor|analogziffer|analog|ziffer|schwellenwert|abrechnung|abrechnungs|femtosekundenlaser|implantat|übermaß/.test(text)) {
    kategorien.add('goae')
  }
  if (/ausschluss|klausel|vorerkrankung|ausgeschlossen|nicht versichert|nicht erstattet/.test(text)) {
    kategorien.add('ausschlussklausel')
  }
  // Spezifische Behandlungsthemen → immer medizinische_notwendigkeit
  if (/ivf|icsi|befruchtung|fertilit|hilfsmittel|hörgerät|prothese|orthese|rollstuhl|implantat|laser|operation|\bop\b/.test(text)) {
    kategorien.add('medizinische_notwendigkeit')
  }

  // Wenn kein spezifischer Treffer → allgemein + medizinische_notwendigkeit (häufigster Streitpunkt)
  if (kategorien.size === 0) {
    kategorien.add('medizinische_notwendigkeit')
    kategorien.add('allgemein')
  }

  return Array.from(kategorien)
}

/**
 * Sucht nach PKV-relevanten Urteilen für gegebene Ablehnungsgründe.
 * Gibt einen formatierten Block für den Fallkontext zurück.
 * Gibt leeren String zurück wenn keine Treffer (fail-silent).
 */
export async function searchPkvPrecedents(
  ablehnungsgruende: string[],
  limit = 4
): Promise<string> {
  if (!ablehnungsgruende.length) return ''

  try {
    const admin = getSupabaseAdmin()
    const kategorien = mapAblehnungsgruendeToKategorien(ablehnungsgruende)

    const { data: urteile, error } = await admin
      .from('pkv_urteile')
      .select('aktenzeichen, datum, kategorie, leitsatz, relevanz_pkv, quelle_url')
      .in('kategorie', kategorien)
      .eq('verified', true)
      .order('datum', { ascending: false })
      .limit(limit)

    if (error || !urteile?.length) return ''

    return formatUrteilBlock(urteile as PkvUrteil[])
  } catch {
    return ''
  }
}

/**
 * Direktsuche für /api/legal/search Route.
 * Sucht über Schlagwörter, Aktenzeichen oder Kategorie.
 */
export async function searchLegalCases(
  query: string,
  pageSize = 10
): Promise<{ count: number; cases: PkvUrteil[] }> {
  try {
    const admin = getSupabaseAdmin()
    const q = query.toLowerCase().trim()

    // Versuche erst Aktenzeichen-Match (z.B. "IV ZR 255/17")
    const azPattern = /iv\s+zr\s+[\d/]+/i.test(q)

    let dbQuery = admin
      .from('pkv_urteile')
      .select('aktenzeichen, datum, kategorie, schlagwoerter, leitsatz, relevanz_pkv, quelle_url', { count: 'exact' })

    if (azPattern) {
      dbQuery = dbQuery.ilike('aktenzeichen', `%${q}%`)
    } else {
      // Kategorie-Mapping nutzen
      const kategorien = mapAblehnungsgruendeToKategorien([query])
      dbQuery = dbQuery.in('kategorie', kategorien)
    }

    const { data, count, error } = await dbQuery
      .order('datum', { ascending: false })
      .limit(pageSize)

    if (error) return { count: 0, cases: [] }

    return {
      count: count ?? 0,
      cases: (data ?? []) as PkvUrteil[],
    }
  } catch {
    return { count: 0, cases: [] }
  }
}

/**
 * Formatiert Urteile als lesbaren Block für den Fallkontext.
 */
function formatUrteilBlock(urteile: PkvUrteil[]): string {
  if (!urteile.length) return ''

  const lines: string[] = [
    '──────────────────────────────────────────────────────',
    'RELEVANTE BGH-RECHTSPRECHUNG (verifizierte Urteile, IV. Zivilsenat)',
    '──────────────────────────────────────────────────────',
    '⚡ Diese Urteile sind geprüft und PKV-relevant. Bitte im Widerspruchsbrief',
    '   mit vollem Aktenzeichen + Datum zitieren:',
    '   Format: "BGH, Urt. v. [Datum], Az. [Aktenzeichen]"',
    '',
  ]

  for (const u of urteile) {
    const datumFormatiert = new Date(u.datum).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
    lines.push(`  ▸ BGH, ${datumFormatiert} — Az. ${u.aktenzeichen}`)
    lines.push(`    Kernaussage: ${u.leitsatz.slice(0, 200)}${u.leitsatz.length > 200 ? '…' : ''}`)
    lines.push(`    PKV-Relevanz: ${u.relevanz_pkv.slice(0, 200)}${u.relevanz_pkv.length > 200 ? '…' : ''}`)
    if (u.quelle_url) lines.push(`    Quelle: ${u.quelle_url}`)
    lines.push('')
  }

  return lines.join('\n')
}
