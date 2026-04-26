/**
 * scripts/seed-openjur.ts
 *
 * Scrapt openJur.de nach PKV-relevanten OLG-Urteilen und speichert
 * verifizierte Kerninformationen via Claude Haiku in Supabase.
 *
 * Aufruf:
 *   MAX_CASES=20 DRY_RUN=false npx tsx scripts/seed-openjur.ts
 *   DEBUG_HTML=true npx tsx scripts/seed-openjur.ts   ← erste Run zum Prüfen der Struktur
 *
 * Wichtig: openJur ToS erlauben nicht-kommerzielles Crawling bei vernünftigem
 * Tempo. Wir nutzen 1-2s Delays zwischen Requests.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
const DRY_RUN       = process.env.DRY_RUN === 'true'
const MAX_CASES     = parseInt(process.env.MAX_CASES ?? '20')
const DEBUG_HTML    = process.env.DEBUG_HTML === 'true'

const BASE = 'https://openjur.de'
const DELAY = 1200  // ms zwischen Requests — höflich gegenüber openJur

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ─── PKV-Suchbegriffe: gezielte Queries für häufigste Streitthemen ────────────
const SEARCH_QUERIES = [
  'private Krankenversicherung Erstattung',
  'private Krankenversicherung medizinisch notwendig',
  'Krankenversicherung GOÄ Faktor',
  'Krankenversicherung Beitragsanpassung § 203',
  'Krankenversicherung Leistungsausschluss Vorerkrankung',
]

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchHtml(url: string): Promise<string | null> {
  await sleep(DELAY)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'mediright-research-bot/1.0 (non-commercial; contact: stump23@gmail.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
      }
    })
    if (!res.ok) {
      console.warn(`  HTTP ${res.status}: ${url}`)
      return null
    }
    return res.text()
  } catch (e) {
    console.warn(`  Fetch-Fehler: ${url}:`, e)
    return null
  }
}

// ─── HTML-Parsing: Suche ─────────────────────────────────────────────────────

interface SearchHit {
  url:    string
  title:  string
  gericht: string
  datum:  string
  az:     string
}

function parseSearchResults(html: string, query: string): SearchHit[] {
  if (DEBUG_HTML) {
    console.log(`\n=== DEBUG HTML (erste 3000 Zeichen, Query: "${query}") ===`)
    console.log(html.slice(0, 3000))
    console.log('=== END DEBUG ===\n')
  }

  const hits: SearchHit[] = []

  // Strategie 1: Links mit /u/NNNNNN.html Muster — das ist das openJur-Urteilsformat
  const linkPattern = /href="(\/u\/(\d+)\.html)"/g
  const seenIds = new Set<string>()
  let m: RegExpExecArray | null

  while ((m = linkPattern.exec(html)) !== null) {
    const path = m[1]
    const id = m[2]
    if (seenIds.has(id)) continue
    seenIds.add(id)

    // Kontext um den Link (500 Zeichen) für Metadaten
    const start = Math.max(0, m.index - 100)
    const end   = Math.min(html.length, m.index + 500)
    const ctx   = html.slice(start, end)

    // Gericht aus Kontext extrahieren
    const gerichtM = ctx.match(/Oberlandesgericht\s+\w+|OLG\s+\w+/i)
    if (!gerichtM) continue  // Kein OLG → überspringen

    // Datum (TT.MM.JJJJ)
    const datumM = ctx.match(/(\d{2}\.\d{2}\.\d{4})/)
    // Aktenzeichen (typisch: Zahl U Zahl/Zahl oder ähnlich)
    const azM = ctx.match(/(\d+\s+U\s+\d+\/\d{2,4}|\d+\s+W\s+\d+\/\d{2,4})/i)
    // Titel: Text in <a>
    const titleM = ctx.match(/<a[^>]*href="\/u\/\d+\.html"[^>]*>([^<]+)<\/a>/)

    hits.push({
      url:    `${BASE}${path}`,
      title:  titleM?.[1]?.trim() ?? `Urteil ${id}`,
      gericht: gerichtM[0],
      datum:  datumM ? datumM[1] : '',
      az:     azM ? azM[1].replace(/\s+/g, ' ').trim() : '',
    })
  }

  return hits
}

// ─── HTML-Parsing: Urteilsseite ───────────────────────────────────────────────

interface CaseData {
  gericht:  string
  datum:    string
  az:       string
  volltext: string
}

function parseCasePage(html: string, fallback: SearchHit): CaseData {
  if (DEBUG_HTML) {
    console.log('\n=== DEBUG CASE HTML (erste 4000 Zeichen) ===')
    console.log(html.slice(0, 4000))
    console.log('=== END DEBUG ===\n')
  }

  // Volltext: openJur nutzt typischerweise <div id="urteil"> oder <div class="urteilstext">
  // Mehrere Patterns probieren
  let volltext = ''

  const patterns = [
    /<div[^>]+id="urteil"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]+class="[^"]*urteil[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div)/i,
    /<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div)/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ]

  for (const p of patterns) {
    const m = html.match(p)
    if (m && m[1].length > 500) {
      volltext = m[1]
      break
    }
  }

  // Fallback: Alles zwischen <body> nehmen
  if (!volltext) {
    const bodyM = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    volltext = bodyM?.[1] ?? html
  }

  // HTML-Tags entfernen, Whitespace normalisieren
  const text = volltext
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Metadaten aus der Seite extrahieren
  const gerichtM = html.match(/(?:Gericht|Court)[:\s]*([^<\n]{5,60})(?:<|$)/i)
                 || html.match(/(Oberlandesgericht\s+\w+)/i)
  const datumM   = html.match(/(?:Datum|Date)[:\s]*(\d{2}\.\d{2}\.\d{4})/i)
                 || html.match(/(\d{2}\.\d{2}\.\d{4})/)
  const azM      = html.match(/(?:Aktenzeichen|Az\.?)[:\s]*([A-Z0-9 /\-]+(?:\/\d{2,4}))/i)
                 || html.match(/(\d+\s+[UW]\s+\d+\/\d{2,4})/i)

  return {
    gericht:  gerichtM?.[1]?.trim() ?? fallback.gericht,
    datum:    datumM?.[1]?.trim()   ?? fallback.datum,
    az:       azM?.[1]?.trim()      ?? fallback.az,
    volltext: text,
  }
}

// ─── Klassifizierung ─────────────────────────────────────────────────────────

function isPkvRelevant(text: string): boolean {
  if (!text || text.length < 200) return false
  const t = text.toLowerCase()
  return /krankenversicherung|pkv|goä|goa|heilbehandlung|krankheitskosten|arzthonorar|versicherungsleistung|versicherungsnehmer/.test(t)
}

function classifyKategorie(text: string): string {
  const t = text.toLowerCase()
  if (/beitragsanpassung|prämienerhöhung|§\s*203\s*vvg/.test(t)) return 'beitragsanpassung'
  if (/goä|goa|faktor|analogziffer|analog/.test(t))               return 'goae'
  if (/ausschluss|klausel|vorerkrankung|risikoausschluss/.test(t)) return 'ausschlussklausel'
  if (/medizinisch|heilbehandlung|notwendig|therapie/.test(t))     return 'medizinische_notwendigkeit'
  return 'allgemein'
}

function extractSchlagwoerter(text: string): string[] {
  const t = text.toLowerCase()
  const tags: string[] = []
  if (/medizinisch notwendig/.test(t))      tags.push('medizinisch notwendig')
  if (/beweislast/.test(t))                tags.push('Beweislast')
  if (/goä|goa/.test(t))                   tags.push('GOÄ')
  if (/analogziffer/.test(t))              tags.push('Analogziffer')
  if (/leistungsausschluss|ausschluss/.test(t)) tags.push('Leistungsausschluss')
  if (/heilbehandlung/.test(t))            tags.push('Heilbehandlung')
  if (/beitragsanpassung/.test(t))         tags.push('Beitragsanpassung')
  if (/vorerkrankung/.test(t))             tags.push('Vorerkrankung')
  if (/faktor/.test(t))                    tags.push('GOÄ-Faktor')
  if (/wahlleistung|chefarzt/.test(t))     tags.push('Wahlleistung')
  return tags.length ? tags : ['PKV', 'Krankenversicherung']
}

function formatDatum(datumStr: string): string {
  // TT.MM.JJJJ → JJJJ-MM-TT
  const m = datumStr.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return datumStr
  return `${m[3]}-${m[2]}-${m[1]}`
}

// ─── Claude: Leitsatz + Relevanz extrahieren ─────────────────────────────────

async function extractWithClaude(
  az: string, text: string, kategorie: string
): Promise<{ leitsatz: string; relevanz_pkv: string } | null> {
  const excerpt = text.slice(0, 6000)
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: `Analysiere dieses OLG-Urteil zur privaten Krankenversicherung.
Az: ${az} | Kategorie: ${kategorie}

Text:
${excerpt}

Antworte NUR wenn echter PKV-Streitfall (Erstattung, GOÄ, medizinische Notwendigkeit, Ausschlussklausel, Beitragsanpassung).

Format:
LEITSATZ: [2-4 Sätze — juristische Kernaussage des Urteils]
PKV_RELEVANZ: [2-3 Sätze — praktische Bedeutung für PKV-Widerspruchsverfahren]

Sonst: IRRELEVANT`
    }]
  }).catch(e => { console.warn('  Claude-Fehler:', e.message); return null })

  if (!msg) return null
  const out = (msg.content[0] as { text: string }).text.trim()
  if (out.startsWith('IRRELEVANT')) return null

  const lm = out.match(/LEITSATZ:\s*([\s\S]+?)(?=PKV_RELEVANZ:|$)/i)
  const rm = out.match(/PKV_RELEVANZ:\s*([\s\S]+?)$/i)
  if (!lm || !rm) return null
  return { leitsatz: lm[1].trim(), relevanz_pkv: rm[1].trim() }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== openJur OLG-Seed === DRY_RUN=${DRY_RUN} MAX=${MAX_CASES} DEBUG=${DEBUG_HTML}`)

  const { data: existingData } = await supabase.from('pkv_urteile').select('aktenzeichen, quelle_url')
  const existingAz   = new Set((existingData ?? []).map((r: any) => r.aktenzeichen))
  const existingUrls = new Set((existingData ?? []).map((r: any) => r.quelle_url))
  console.log(`Bereits in DB: ${existingAz.size} Urteile`)

  const seen     = new Set<string>()
  const toInsert: object[] = []

  for (const query of SEARCH_QUERIES) {
    if (toInsert.length >= MAX_CASES) break

    const searchUrl = `${BASE}/suche/?q=${encodeURIComponent(query)}&sort=relevanz`
    console.log(`\nSuche: "${query}"`)
    console.log(`  → ${searchUrl}`)

    const html = await fetchHtml(searchUrl)
    if (!html) { console.warn('  Keine Antwort'); continue }

    const hits = parseSearchResults(html, query)
    console.log(`  ${hits.length} OLG-Treffer gefunden`)

    // Debug: Erste 3 Treffer anzeigen
    if (hits.length > 0) {
      console.log('  Beispiel-Treffer:')
      hits.slice(0, 3).forEach(h => console.log(`    - ${h.gericht} | ${h.datum} | ${h.az} | ${h.url}`))
    }

    for (const hit of hits) {
      if (toInsert.length >= MAX_CASES) break
      if (existingUrls.has(hit.url)) { console.log(`  (bereits in DB: ${hit.url})`); continue }

      // Urteilsseite laden
      const caseHtml = await fetchHtml(hit.url)
      if (!caseHtml) continue

      const caseData = parseCasePage(caseHtml, hit)
      const az = caseData.az || `${caseData.gericht} (${caseData.datum})`

      if (seen.has(az) || existingAz.has(az)) continue
      seen.add(az)

      const textLen = caseData.volltext.length
      console.log(`  → ${az} — ${textLen} Zeichen`)

      if (!isPkvRelevant(caseData.volltext)) {
        console.log(`    ↳ PKV-Filter: nicht relevant`)
        continue
      }

      const kategorie = classifyKategorie(caseData.volltext)
      const extracted = await extractWithClaude(az, caseData.volltext, kategorie)
      if (!extracted) { console.log(`    ↳ Claude: IRRELEVANT`); continue }

      toInsert.push({
        aktenzeichen:  az,
        datum:         formatDatum(caseData.datum) || new Date().toISOString().slice(0, 10),
        gericht:       caseData.gericht,
        senat:         '',
        kategorie,
        schlagwoerter: extractSchlagwoerter(caseData.volltext),
        leitsatz:      extracted.leitsatz,
        relevanz_pkv:  extracted.relevanz_pkv,
        quelle_url:    hit.url,
        verified:      false,
      })
      console.log(`    ✓ ${kategorie} — gespeichert`)
    }
  }

  console.log(`\n─── Ergebnis: ${toInsert.length} neue Urteile ───`)

  if (DRY_RUN || !toInsert.length) {
    if (DRY_RUN)       console.log('DRY RUN — kein Supabase-Write')
    else               console.log('Keine neuen PKV-Urteile gefunden.')
    return
  }

  const { error } = await supabase
    .from('pkv_urteile')
    .upsert(toInsert, { onConflict: 'aktenzeichen', ignoreDuplicates: true })

  if (error) { console.error('Supabase-Fehler:', error); process.exit(1) }
  console.log(`✅ ${toInsert.length} Urteile in DB (verified=false — bitte prüfen)`)
}

main().catch(e => { console.error(e); process.exit(1) })
