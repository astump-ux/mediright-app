/**
 * legal-search.ts
 *
 * Zweistufige Urteils-Suche mit automatischem Exit-Pass.
 *
 * Stufe 1 — Supabase (verifiziert, schnell)
 * Stufe 2 — Live-Recherche via rechtsprechung-im-internet.de (Fallback)
 *
 * Exit-Pass-Logik:
 *   Wenn Stufe 1 < CONFIDENCE_THRESHOLD (2) Treffer → automatisch Live-Recherche.
 *   Live-Treffer werden als verified=false in Supabase gespeichert.
 */

import { getSupabaseAdmin } from './supabase-admin'

const CONFIDENCE_THRESHOLD  = 2      // Min. verifizierte Urteile vor Exit-Pass
const LIVE_TIMEOUT_MS       = 6000   // Max. Wartezeit für Live-Recherche

interface PkvUrteil {
  aktenzeichen:  string
  datum:         string
  kategorie:     string
  schlagwoerter: string[]
  leitsatz:      string
  relevanz_pkv:  string
  quelle_url:    string | null
}

interface LiveResult {
  aktenzeichen: string
  gericht:      string
  datum:        string
  snippet:      string
  url:          string
}

// ─── Kategorie-Mapping ────────────────────────────────────────────────────────

function mapAblehnungsgruendeToKategorien(ablehnungsgruende: string[]): string[] {
  const text = ablehnungsgruende.join(' ').toLowerCase()
  const kategorien = new Set<string>()

  if (/beitrag|prämie|erhöhung|anpassung|beitragsanpassung|prämienanpassung/.test(text))
    kategorien.add('beitragsanpassung')
  if (/notwendig|heilbehandlung|behandlung|therapie|medizinisch|indiziert|alternativ/.test(text))
    kategorien.add('medizinische_notwendigkeit')
  if (/goä|goa|faktor|analogziffer|analog|ziffer|schwellenwert|abrechnung|femtosekundenlaser|implantat|übermaß/.test(text))
    kategorien.add('goae')
  if (/ausschluss|klausel|vorerkrankung|ausgeschlossen|nicht versichert|nicht erstattet/.test(text))
    kategorien.add('ausschlussklausel')
  if (/ivf|icsi|befruchtung|fertilit|hilfsmittel|hörgerät|prothese|orthese|rollstuhl|implantat|laser|operation|\bop\b/.test(text))
    kategorien.add('medizinische_notwendigkeit')

  if (kategorien.size === 0) {
    kategorien.add('medizinische_notwendigkeit')
    kategorien.add('allgemein')
  }
  return Array.from(kategorien)
}

function buildSearchTerms(ablehnungsgruende: string[]): string {
  const text = ablehnungsgruende.join(' ').toLowerCase()
  const terms = ['private Krankenversicherung']
  if (/goä|goa|faktor|analogziffer/.test(text))       terms.push('GOÄ')
  if (/beitragsanpassung|prämienerhöhung/.test(text)) terms.push('Beitragsanpassung')
  if (/notwendig|heilbehandlung/.test(text))          terms.push('medizinisch notwendig')
  if (/ausschluss|vorerkrankung/.test(text))          terms.push('Leistungsausschluss')
  if (/ivf|icsi|befruchtung/.test(text))              terms.push('IVF Erstattung')
  if (/implantat|prothese|orthese/.test(text))        terms.push('Hilfsmittel')
  if (/wahlleistung|chefarzt/.test(text))             terms.push('Wahlleistung')
  return terms.slice(0, 3).join(' ')
}

// ─── Stufe 1: Supabase ────────────────────────────────────────────────────────

async function searchSupabase(kategorien: string[], limit: number): Promise<PkvUrteil[]> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('pkv_urteile')
    .select('aktenzeichen, datum, kategorie, schlagwoerter, leitsatz, relevanz_pkv, quelle_url')
    .in('kategorie', kategorien)
    .eq('verified', true)
    .order('datum', { ascending: false })
    .limit(limit)
  if (error || !data?.length) return []
  return data as PkvUrteil[]
}

// ─── Stufe 2: Live-Recherche (Exit-Pass) ──────────────────────────────────────

async function liveResearchRii(searchTerms: string): Promise<LiveResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS)

  try {
    // rechtsprechung-im-internet.de: offizielles BMJV-Portal, kein CAPTCHA
    const url =
      `https://www.rechtsprechung-im-internet.de/rii-search/rii/search` +
      `?request.query=${encodeURIComponent(searchTerms)}` +
      `&request.pageSize=10` +
      `&request.courts[]=bgh` +
      `&request.courts[]=olg`

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'mediright-pkv-agent/1.0 (non-commercial)',
        'Accept': 'application/json, text/html;q=0.9',
        'Accept-Language': 'de-DE,de;q=0.9',
      }
    })
    clearTimeout(timer)
    if (!res.ok) return []

    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      return parseRiiJson(await res.json())
    }
    return parseRiiHtml(await res.text())
  } catch {
    clearTimeout(timer)
    return []
  }
}

function parseRiiJson(json: any): LiveResult[] {
  const items = json?.results ?? json?.hits ?? json?.documents ?? []
  return items
    .map((item: any) => ({
      aktenzeichen: item.fileNumber ?? item.aktenzeichen ?? item.reference ?? '',
      gericht:      item.court?.name ?? item.gericht ?? '',
      datum:        item.date ?? item.datum ?? '',
      snippet:      (item.abstract ?? item.leitsatz ?? item.text ?? '').slice(0, 300),
      url:          item.url ?? item.link ?? '',
    }))
    .filter((r: LiveResult) => r.aktenzeichen && r.snippet)
}

function parseRiiHtml(html: string): LiveResult[] {
  const results: LiveResult[] = []
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const azPat = /([A-Z]+(?:\s+IV)?\s+[IVXivx]*\s*[UWZRuzwr]{1,3}\s+\d+\/\d{2,4})/g
  let m: RegExpExecArray | null

  while ((m = azPat.exec(plain)) !== null) {
    const az   = m[1].trim()
    const ctx  = plain.slice(Math.max(0, m.index - 50), Math.min(plain.length, m.index + 400))
    const dM   = ctx.match(/(\d{2}\.\d{2}\.\d{4})/)
    const snip = ctx.replace(az, '').trim().slice(0, 300)
    if (az && snip.length > 30) {
      results.push({
        aktenzeichen: az,
        gericht:      az.startsWith('BGH') ? 'Bundesgerichtshof' : 'OLG',
        datum:        dM?.[1] ?? '',
        snippet:      snip,
        url:          'https://www.rechtsprechung-im-internet.de',
      })
    }
    if (results.length >= 5) break
  }
  return results
}

function formatDatum(s: string): string {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s
}

async function persistLiveResults(results: LiveResult[], kategorie: string): Promise<void> {
  if (!results.length) return
  try {
    const admin = getSupabaseAdmin()
    const rows  = results.map(r => ({
      aktenzeichen:  r.aktenzeichen,
      datum:         r.datum ? formatDatum(r.datum) : new Date().toISOString().slice(0, 10),
      gericht:       r.gericht,
      senat:         '',
      kategorie,
      schlagwoerter: ['Live-Recherche', 'nicht verifiziert'],
      leitsatz:      r.snippet.slice(0, 500),
      relevanz_pkv:  'Automatisch gefunden — bitte manuell prüfen und verifizieren.',
      quelle_url:    r.url || null,
      verified:      false,
    }))
    await admin
      .from('pkv_urteile')
      .upsert(rows, { onConflict: 'aktenzeichen', ignoreDuplicates: true })
  } catch { /* fail-silent */ }
}

// ─── Öffentliche Exports ──────────────────────────────────────────────────────

/**
 * Zweistufige PKV-Urteils-Suche mit Exit-Pass.
 * Gibt formatierten Kontext-Block für Widerspruchs-KI zurück.
 */
export async function searchPkvPrecedents(
  ablehnungsgruende: string[],
  limit = 4
): Promise<string> {
  if (!ablehnungsgruende.length) return ''

  try {
    const kategorien = mapAblehnungsgruendeToKategorien(ablehnungsgruende)

    // Stufe 1: Supabase
    const verified = await searchSupabase(kategorien, limit)

    if (verified.length >= CONFIDENCE_THRESHOLD) {
      return formatVerifiedBlock(verified)
    }

    // Exit-Pass: Live-Recherche
    const searchTerms = buildSearchTerms(ablehnungsgruende)
    console.log(
      `[legal-search] Exit-Pass: ${verified.length}/${CONFIDENCE_THRESHOLD} verifizierte Urteile ` +
      `→ Live-Recherche für "${searchTerms}"`
    )

    const liveResults = await liveResearchRii(searchTerms)

    // Async persistieren (nicht awaiten)
    if (liveResults.length > 0) {
      persistLiveResults(liveResults, kategorien[0]).catch(() => {})
    }

    const blocks: string[] = []
    if (verified.length > 0)   blocks.push(formatVerifiedBlock(verified))
    if (liveResults.length > 0) blocks.push(formatLiveBlock(liveResults, searchTerms))

    return blocks.join('\n')
  } catch {
    return ''
  }
}

/**
 * Direktsuche für /api/legal/search Route.
 */
export async function searchLegalCases(
  query: string,
  pageSize = 10
): Promise<{ count: number; cases: PkvUrteil[] }> {
  try {
    const admin = getSupabaseAdmin()
    const q = query.toLowerCase().trim()
    const azPattern = /iv\s+zr\s+[\d/]+/i.test(q)

    let dbQuery = admin
      .from('pkv_urteile')
      .select('aktenzeichen, datum, kategorie, schlagwoerter, leitsatz, relevanz_pkv, quelle_url', { count: 'exact' })

    dbQuery = azPattern
      ? dbQuery.ilike('aktenzeichen', `%${q}%`)
      : dbQuery.in('kategorie', mapAblehnungsgruendeToKategorien([query]))

    const { data, count, error } = await dbQuery
      .order('datum', { ascending: false })
      .limit(pageSize)

    if (error) return { count: 0, cases: [] }
    return { count: count ?? 0, cases: (data ?? []) as PkvUrteil[] }
  } catch {
    return { count: 0, cases: [] }
  }
}

// ─── Formatter ────────────────────────────────────────────────────────────────

function formatVerifiedBlock(urteile: PkvUrteil[]): string {
  const lines = [
    '──────────────────────────────────────────────────────',
    'RELEVANTE RECHTSPRECHUNG (verifizierte Urteile)',
    '──────────────────────────────────────────────────────',
    '⚡ Diese Urteile sind geprüft und PKV-relevant.',
    '   Im Widerspruchsbrief zitieren als:',
    '   "[Gericht], Urt. v. [Datum], Az. [Aktenzeichen]"',
    '',
  ]
  for (const u of urteile) {
    const datum = new Date(u.datum).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
    lines.push(`  ▸ Az. ${u.aktenzeichen} (${datum})`)
    lines.push(`    Kernaussage: ${u.leitsatz.slice(0, 200)}${u.leitsatz.length > 200 ? '…' : ''}`)
    lines.push(`    PKV-Relevanz: ${u.relevanz_pkv.slice(0, 200)}${u.relevanz_pkv.length > 200 ? '…' : ''}`)
    if (u.quelle_url) lines.push(`    Quelle: ${u.quelle_url}`)
    lines.push('')
  }
  return lines.join('\n')
}

function formatLiveBlock(results: LiveResult[], searchTerms: string): string {
  const lines = [
    '──────────────────────────────────────────────────────',
    `LIVE-RECHERCHE: Zusätzliche Urteile zu "${searchTerms}"`,
    '⚠️  Automatisch gefunden — NICHT manuell verifiziert.',
    '   Vor Zitierung im Widerspruch Volltext prüfen!',
    '──────────────────────────────────────────────────────',
    '',
  ]
  for (const r of results.slice(0, 4)) {
    lines.push(
      `  ▸ Az. ${r.aktenzeichen}` +
      (r.gericht ? ` (${r.gericht})` : '') +
      (r.datum   ? ` — ${r.datum}`   : '')
    )
    lines.push(`    Auszug: ${r.snippet.slice(0, 250)}${r.snippet.length > 250 ? '…' : ''}`)
    if (r.url) lines.push(`    Quelle: ${r.url}`)
    lines.push('')
  }
  lines.push('💡 In pkv_urteile gespeichert (verified=false) — im Admin prüfbar.')
  return lines.join('\n')
}
