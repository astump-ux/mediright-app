/**
 * scripts/seed-openjur.ts  v2
 *
 * Scrapt openJur.de nach PKV-relevanten OLG-Urteilen.
 * DEBUG_HTML=true zeigt HTML-Rohstruktur für Diagnose.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
const DRY_RUN       = process.env.DRY_RUN === 'true'
const MAX_CASES     = parseInt(process.env.MAX_CASES ?? '20')
const DEBUG_HTML    = process.env.DEBUG_HTML === 'true'

const BASE  = 'https://openjur.de'
const DELAY = 1500

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

const SEARCH_QUERIES = [
  'private Krankenversicherung Erstattung',
  'Krankenversicherung medizinisch notwendig',
  'Krankenversicherung GOÄ Faktor',
  'Krankenversicherung Beitragsanpassung',
  'Krankenversicherung Leistungsausschluss',
]

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchHtml(url: string): Promise<string | null> {
  await sleep(DELAY)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'mediright-research-bot/1.0 (non-commercial; contact: stump23@gmail.com)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      }
    })
    if (!res.ok) { console.warn(`  HTTP ${res.status}: ${url}`); return null }
    return res.text()
  } catch (e: any) {
    console.warn(`  Fetch-Fehler ${url}: ${e.message}`)
    return null
  }
}

interface SearchHit { id: string; url: string; gericht: string; datum: string; az: string; title: string }

function parseSearchResults(html: string, query: string): SearchHit[] {
  const allLinks = [...html.matchAll(/href="\/u\/(\d+)\.html"/g)]
  console.log(`  Gesamt /u/-Links auf Seite: ${allLinks.length}`)

  if (DEBUG_HTML) {
    console.log('\n=== DEBUG HTML (erste 5000 Zeichen) ===')
    console.log(html.slice(0, 5000))
    console.log('=== END ===\n')
    if (allLinks.length > 0) {
      console.log('=== DEBUG: Erste 2 Link-Kontexte (bereinigt) ===')
      allLinks.slice(0, 2).forEach(m => {
        const ctx = html.slice(Math.max(0, m.index! - 400), Math.min(html.length, m.index! + 800))
        console.log(`\n--- /u/${m[1]}.html ---`)
        console.log(ctx.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600))
      })
      console.log('=== END ===\n')
    }
  }

  if (allLinks.length === 0) return []

  const hits: SearchHit[] = []
  const seenIds = new Set<string>()

  for (const m of allLinks) {
    const id = m[1]
    if (seenIds.has(id)) continue
    seenIds.add(id)

    const start   = Math.max(0, m.index! - 400)
    const end     = Math.min(html.length, m.index! + 800)
    const ctxRaw  = html.slice(start, end)
    const ctxText = ctxRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    // OLG-Erkennung — breite Patterns
    const olg = ctxText.match(
      /((?:Ober|Hanseatisches|Thüringer|Saarländisches|Brandenburgisches|Pfälzisches|Schleswig-Holsteinisches)\s+)?(?:Oberlandesgericht)\s+[\wäöüÄÖÜß\-]+/i
    ) || ctxText.match(/\bOLG\s+[\wäöüÄÖÜß\-]+/i)

    if (!olg) continue

    const datumM = ctxText.match(/(\d{2}\.\d{2}\.\d{4})/)
    const azM    = ctxText.match(/([IVX\d][\w\-]*\s*[UW]\s+\d+\/\d{2,4})/i)
    const titleM = ctxRaw.match(/<a[^>]*href="\/u\/\d+\.html"[^>]*>([^<]{5,150})<\/a>/i)

    hits.push({
      id, url: `${BASE}/u/${id}.html`,
      gericht: olg[0].trim(),
      datum:   datumM?.[1] ?? '',
      az:      azM?.[1]?.replace(/\s+/g, ' ').trim() ?? '',
      title:   titleM?.[1]?.trim() ?? `Urteil ${id}`,
    })
  }
  return hits
}

interface CaseData { gericht: string; datum: string; az: string; volltext: string }

function parseCasePage(html: string, fallback: SearchHit): CaseData {
  let raw = ''
  for (const p of [
    /<div[^>]+id=["']urteil["'][^>]*>([\s\S]+?)<\/div>\s*<\/div>/i,
    /<div[^>]+class=["'][^"']*urteil[^"']*["'][^>]*>([\s\S]+?)<\/div>\s*(?:<\/div>|<footer)/i,
    /<article[^>]*>([\s\S]+?)<\/article>/i,
    /<main[^>]*>([\s\S]+?)<\/main>/i,
  ]) {
    const m = html.match(p)
    if (m && m[1].length > raw.length) raw = m[1]
  }
  if (!raw) raw = html.match(/<body[^>]*>([\s\S]+?)<\/body>/i)?.[1] ?? html

  const volltext = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const plain  = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const gM = plain.match(/((?:Ober|Hanseatisches\s+|Thüringer\s+|Saarländisches\s+|Brandenburgisches\s+|Pfälzisches\s+|Schleswig-Holsteinisches\s+)?Oberlandesgericht\s+[\wäöüÄÖÜß\-]+)/i)
  const dM = plain.match(/(\d{2}\.\d{2}\.\d{4})/)
  const aM = plain.match(/([IVX\d][\w\-]*\s*[UW]\s+\d+\/\d{2,4})/i)

  return {
    gericht:  gM?.[1]?.trim() ?? fallback.gericht,
    datum:    dM?.[1]?.trim() ?? fallback.datum,
    az:       aM?.[1]?.replace(/\s+/g, ' ').trim() ?? fallback.az,
    volltext,
  }
}

function isPkvRelevant(t: string) {
  return t.length > 200 && /krankenversicherung|pkv|goä|goa|heilbehandlung|krankheitskosten|arzthonorar|versicherungsleistung|versicherungsnehmer/.test(t.toLowerCase())
}

function classifyKategorie(t: string): string {
  const l = t.toLowerCase()
  if (/beitragsanpassung|prämienerhöhung|§\s*203/.test(l)) return 'beitragsanpassung'
  if (/goä|goa|faktor|analogziffer/.test(l))               return 'goae'
  if (/ausschluss|klausel|vorerkrankung/.test(l))           return 'ausschlussklausel'
  if (/medizinisch|heilbehandlung|notwendig|therapie/.test(l)) return 'medizinische_notwendigkeit'
  return 'allgemein'
}

function extractSchlagwoerter(t: string): string[] {
  const l = t.toLowerCase()
  const tags: string[] = []
  if (/medizinisch notwendig/.test(l)) tags.push('medizinisch notwendig')
  if (/beweislast/.test(l))           tags.push('Beweislast')
  if (/goä|goa/.test(l))              tags.push('GOÄ')
  if (/analogziffer/.test(l))         tags.push('Analogziffer')
  if (/ausschluss/.test(l))           tags.push('Leistungsausschluss')
  if (/heilbehandlung/.test(l))       tags.push('Heilbehandlung')
  if (/beitragsanpassung/.test(l))    tags.push('Beitragsanpassung')
  if (/vorerkrankung/.test(l))        tags.push('Vorerkrankung')
  if (/faktor/.test(l))               tags.push('GOÄ-Faktor')
  if (/wahlleistung|chefarzt/.test(l)) tags.push('Wahlleistung')
  return tags.length ? tags : ['PKV', 'Krankenversicherung']
}

function formatDatum(s: string): string {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || new Date().toISOString().slice(0, 10))
}

async function extractWithClaude(az: string, text: string, kat: string) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    messages: [{ role: 'user', content: `Analysiere dieses OLG-Urteil zur privaten Krankenversicherung.
Az: ${az} | Kategorie: ${kat}

Text:
${text.slice(0, 6000)}

Antworte NUR wenn echter PKV-Streitfall.
Format:
LEITSATZ: [2-4 Sätze Kernaussage]
PKV_RELEVANZ: [2-3 Sätze Bedeutung für Widerspruch]

Sonst: IRRELEVANT` }]
  }).catch(e => { console.warn('  Claude:', e.message); return null })

  if (!msg) return null
  const out = (msg.content[0] as { text: string }).text.trim()
  if (out.startsWith('IRRELEVANT')) return null
  const lm = out.match(/LEITSATZ:\s*([\s\S]+?)(?=PKV_RELEVANZ:|$)/i)
  const rm = out.match(/PKV_RELEVANZ:\s*([\s\S]+?)$/i)
  return (lm && rm) ? { leitsatz: lm[1].trim(), relevanz_pkv: rm[1].trim() } : null
}

async function main() {
  console.log(`=== openJur OLG-Seed v2 === DRY_RUN=${DRY_RUN} MAX=${MAX_CASES} DEBUG=${DEBUG_HTML}`)

  const { data: ex } = await supabase.from('pkv_urteile').select('aktenzeichen, quelle_url')
  const existingAz   = new Set((ex ?? []).map((r: any) => r.aktenzeichen))
  const existingUrls = new Set((ex ?? []).map((r: any) => r.quelle_url))
  console.log(`Bereits in DB: ${existingAz.size} Urteile`)

  const seen: Set<string> = new Set()
  const toInsert: object[] = []

  for (const query of SEARCH_QUERIES) {
    if (toInsert.length >= MAX_CASES) break
    console.log(`\nSuche: "${query}"`)
    const html = await fetchHtml(`${BASE}/suche/?q=${encodeURIComponent(query)}&sort=relevanz`)
    if (!html) continue

    const hits = parseSearchResults(html, query)
    console.log(`  ${hits.length} OLG-Treffer nach Filter`)
    hits.slice(0, 3).forEach(h => console.log(`    • ${h.gericht} | ${h.az} | ${h.datum}`))

    for (const hit of hits) {
      if (toInsert.length >= MAX_CASES) break
      if (existingUrls.has(hit.url)) continue

      const ch = await fetchHtml(hit.url)
      if (!ch) continue
      const d  = parseCasePage(ch, hit)
      const az = d.az || hit.az || `${d.gericht} (${d.datum})`
      if (seen.has(az) || existingAz.has(az)) continue
      seen.add(az)

      const pkv = isPkvRelevant(d.volltext)
      console.log(`  → ${az} — ${d.volltext.length} Zeichen — PKV: ${pkv}`)
      if (!pkv) continue

      const kat = classifyKategorie(d.volltext)
      const ext = await extractWithClaude(az, d.volltext, kat)
      if (!ext) { console.log('    ↳ IRRELEVANT'); continue }

      toInsert.push({
        aktenzeichen: az, datum: formatDatum(d.datum),
        gericht: d.gericht, senat: '', kategorie: kat,
        schlagwoerter: extractSchlagwoerter(d.volltext),
        leitsatz: ext.leitsatz, relevanz_pkv: ext.relevanz_pkv,
        quelle_url: hit.url, verified: false,
      })
      console.log(`    ✓ ${kat}`)
    }
  }

  console.log(`\n─── Ergebnis: ${toInsert.length} neue Urteile ───`)
  if (DRY_RUN || !toInsert.length) { console.log(DRY_RUN ? 'DRY RUN' : 'Nichts Neues.'); return }

  const { error } = await supabase.from('pkv_urteile')
    .upsert(toInsert, { onConflict: 'aktenzeichen', ignoreDuplicates: true })
  if (error) { console.error('Supabase:', error); process.exit(1) }
  console.log(`✅ ${toInsert.length} Urteile gespeichert (verified=false)`)
}

main().catch(e => { console.error(e); process.exit(1) })
