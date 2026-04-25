/**
 * legal-search.ts
 *
 * Anbindung an die OpenLegalData API (https://de.openlegaldata.io/api/)
 * für die Suche nach relevanten BGH/OLG-Urteilen zu PKV-Streitfällen.
 *
 * Die Urteile werden als Kontext-Block in den Fallkontext eingefügt,
 * damit das KI-Modell konkrete Rechtsprechung in Widerspruchsbriefen zitieren kann.
 *
 * API-Dokumentation: https://de.openlegaldata.io/pages/api/
 * Keine Authentifizierung erforderlich für Lesezugriff.
 */

const API_BASE = 'https://de.openlegaldata.io/api'
const USER_AGENT = 'MediRight-PKV-Agent/1.0 (stump23@gmail.com)'
const DEFAULT_TIMEOUT_MS = 8_000

interface OldpCourt {
  name: string
  jurisdiction?: string
  level_of_appeal?: string
}

interface OldpCase {
  id: number
  slug: string
  date: string
  court: OldpCourt
  file_number: string
  type?: string
  ecli?: string
}

interface OldpSearchResponse {
  count: number
  results: OldpCase[]
}

/**
 * Sucht nach PKV-relevanten Urteilen für einen gegebenen Ablehnungsgrund.
 * Gibt leeren String zurück wenn die API nicht erreichbar ist (fail-silent).
 */
export async function searchPkvPrecedents(
  ablehnungsgruende: string[],
  limit = 4
): Promise<string> {
  if (!ablehnungsgruende.length) return ''

  // Wichtigsten Ablehnungsgrund als Suchanker verwenden
  const hauptgrund = ablehnungsgruende[0].slice(0, 100)
  const queries = buildSearchQueries(hauptgrund)

  const allResults: OldpCase[] = []

  for (const query of queries) {
    const found = await fetchCases(query, Math.ceil(limit / queries.length))
    allResults.push(...found)
    if (allResults.length >= limit) break
  }

  if (!allResults.length) return ''

  // Deduplizieren (nach ID)
  const seen = new Set<number>()
  const unique = allResults.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  }).slice(0, limit)

  return formatCasesBlock(unique)
}

/**
 * Baut mehrere Such-Queries für einen Ablehnungsgrund auf.
 * Zuerst sehr spezifisch (PKV + Kernbegriff), dann breiter.
 */
function buildSearchQueries(ablehnungsgrund: string): string[] {
  // Extrahiere die wichtigsten Schlüsselwörter
  const keywords = ablehnungsgrund
    .replace(/[^a-zA-ZäöüÄÖÜß\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 3)
    .join(' ')

  return [
    `private Krankenversicherung Erstattung ${keywords}`,
    `PKV medizinische Notwendigkeit ${keywords}`,
    `private Krankenversicherung ${keywords}`,
  ].filter(q => q.trim().length > 10)
}

async function fetchCases(query: string, limit: number): Promise<OldpCase[]> {
  try {
    const url = new URL(`${API_BASE}/cases/`)
    url.searchParams.set('search', query)
    url.searchParams.set('page_size', String(Math.min(limit, 5)))
    // Nur BGH — court__slug=bgh funktioniert; court__level_of_appeal wird ignoriert
    // ACHTUNG: API sortiert nach Datum, nicht Relevanz → Ergebnisse immer manuell prüfen
    url.searchParams.set('court__slug', 'bgh')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) return []

    const data = await res.json() as OldpSearchResponse
    return data.results ?? []
  } catch {
    // Netzwerkfehler, Timeout etc. → still silently
    return []
  }
}

/**
 * Formatiert Urteile als lesbaren Block für den Fallkontext.
 */
function formatCasesBlock(cases: OldpCase[]): string {
  if (!cases.length) return ''

  const lines: string[] = [
    '──────────────────────────────────────────────────────',
    'RECHTSPRECHUNGS-HINWEISE (OpenLegalData — BGH, Stand: automatische Suche)',
    '──────────────────────────────────────────────────────',
    '⚠️  WICHTIG: Diese Urteile wurden automatisch gefunden und sind NICHT nach Relevanz',
    '   sortiert. Bitte NUR zitieren wenn du den Inhalt des Urteils geprüft hast.',
    '   Die Suchergebnisse enthalten möglicherweise thematisch unpassende Entscheidungen.',
    '   Zitierformat wenn passend: "[Gericht], Az. [Aktenzeichen], [Datum]"',
    '',
  ]

  for (const c of cases) {
    const court = c.court?.name ?? 'Gericht unbekannt'
    const az = c.file_number ?? '–'
    const date = c.date ?? '–'
    const url = `https://de.openlegaldata.io/case/${c.slug ?? c.id}/`
    lines.push(`  • [${date}] ${court} — Az. ${az}`)
    lines.push(`    ${url}`)
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Direkte Suche nach Aktenzeichen oder freiem Begriff (für /api/legal/search Route).
 */
export async function searchLegalCases(
  query: string,
  pageSize = 10
): Promise<{ count: number; cases: OldpCase[] }> {
  try {
    const url = new URL(`${API_BASE}/cases/`)
    url.searchParams.set('search', query)
    url.searchParams.set('page_size', String(pageSize))

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
    })

    if (!res.ok) return { count: 0, cases: [] }

    const data = await res.json() as OldpSearchResponse
    return { count: data.count ?? 0, cases: data.results ?? [] }
  } catch {
    return { count: 0, cases: [] }
  }
}
