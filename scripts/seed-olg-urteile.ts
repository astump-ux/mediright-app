/**
 * scripts/seed-olg-urteile.ts  v4
 *
 * Strategie: Zuverlässige Court-Discovery durch mehrere Fallbacks.
 * Das Problem: /courts/?level_of_appeal=OLG liefert 0 Ergebnisse (Parameter
 * wird von der API ignoriert oder hat andere Werte als erwartet).
 *
 * Fallback-Kaskade:
 *  1. /courts/?level_of_appeal=OLG (original attempt)
 *  2. /courts/?name__icontains=Oberlandesgericht (Django ORM filter)
 *  3. /courts/ paginiert abrufen, client-seitig auf OLG filtern
 *  4. Direkte Case-Suche via /cases/?court__name__icontains=Oberlandesgericht
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
const DRY_RUN       = process.env.DRY_RUN === 'true'
const MAX_CASES     = parseInt(process.env.MAX_CASES ?? '30')
const BASE_URL      = 'https://de.openlegaldata.io/api'

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

interface OldCourt {
  id:              number
  name:            string
  slug:            string
  level_of_appeal?: string
  jurisdiction?:   string
}

interface OldCase {
  id:          number
  slug:        string
  file_number: string
  date:        string
  court:       OldCourt | number
  content:     string
}

// ─── API Helper ──────────────────────────────────────────────────────────────

async function apiFetch(path: string): Promise<any> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'mediright-seed/1.0' }
  })
  if (!res.ok) {
    console.warn(`  API ${res.status}: ${url}`)
    return null
  }
  return res.json()
}

function isOlgCourt(court: OldCourt): boolean {
  const name = (court.name ?? '').toLowerCase()
  const slug = (court.slug ?? '').toLowerCase()
  const loa  = (court.level_of_appeal ?? '').toLowerCase()
  return name.includes('oberlandesgericht') ||
         name.includes(' olg ') ||
         slug.startsWith('olg-') ||
         loa === 'olg' || loa === 'oberlandesgericht'
}

// ─── Court Discovery (4 Strategien) ─────────────────────────────────────────

async function tryLevelFilter(): Promise<OldCourt[]> {
  const data = await apiFetch('/courts/?level_of_appeal=OLG&limit=100')
  const results = data?.results ?? []
  console.log(`    level_of_appeal=OLG → ${results.length} Courts`)
  return results
}

async function tryNameFilter(): Promise<OldCourt[]> {
  const data = await apiFetch('/courts/?name__icontains=Oberlandesgericht&limit=100')
  const results = data?.results ?? []
  console.log(`    name__icontains=Oberlandesgericht → ${results.length} Courts`)
  return results
}

async function tryAllCourtsClientFilter(): Promise<OldCourt[]> {
  const courts: OldCourt[] = []
  let url: string | null = '/courts/?limit=100'
  let pages = 0

  while (url && pages < 20) {
    const data = await apiFetch(url)
    if (!data) break
    courts.push(...(data.results ?? []))
    url = data.next ?? null
    pages++
  }

  const olg = courts.filter(isOlgCourt)
  console.log(`    Alle Courts (${courts.length}) client-seitig gefiltert → ${olg.length} OLGs`)
  return olg
}

async function getOlgCourts(): Promise<OldCourt[]> {
  console.log('Suche OLG-Gerichte (mehrere Strategien)...')

  // Strategie 1
  let courts = await tryLevelFilter()
  if (courts.length) return courts

  // Strategie 2
  courts = await tryNameFilter()
  if (courts.length) return courts

  // Strategie 3: Alles laden + client-seitig filtern
  courts = await tryAllCourtsClientFilter()
  return courts
}

// ─── Case Fetch ──────────────────────────────────────────────────────────────

async function getCasesForCourt(courtId: number): Promise<OldCase[]> {
  const data = await apiFetch(`/cases/?court_id=${courtId}&limit=10&ordering=-date`)
  return data?.results ?? []
}

async function getCasesDirect(): Promise<OldCase[]> {
  // Fallback: Fälle direkt nach Gerichtsname filtern
  console.log('  Court-Discovery gescheitert — versuche direkten Case-Filter...')
  const data = await apiFetch(
    '/cases/?court__name__icontains=Oberlandesgericht&limit=30&ordering=-date'
  )
  if (data?.results?.length) {
    console.log(`  Direkte Case-Suche: ${data.results.length} Treffer`)
    return data.results
  }
  // Letzter Versuch: aktuellste Fälle aller Art, OLG-Filter nachher
  const data2 = await apiFetch('/cases/?limit=100&ordering=-date')
  const results = (data2?.results ?? []) as OldCase[]
  const olg = results.filter(c => {
    const court = c.court as OldCourt
    return court && isOlgCourt(court)
  })
  console.log(`  Neueste 100 Cases: ${olg.length} davon OLG`)
  return olg
}

// ─── Klassifizierung ─────────────────────────────────────────────────────────

function isPkvRelevant(text: string): boolean {
  const t = text.toLowerCase()
  return /krankenversicherung|pkv|goä|goa|heilbehandlung|erstattung|versicherungsnehmer|medizinisch notwendig|therapie|behandlungskosten/.test(t)
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
  if (/medizinisch notwendig/.test(t))     tags.push('medizinisch notwendig')
  if (/beweislast/.test(t))               tags.push('Beweislast')
  if (/goä|goa/.test(t))                  tags.push('GOÄ')
  if (/analogziffer/.test(t))             tags.push('Analogziffer')
  if (/ausschluss/.test(t))               tags.push('Leistungsausschluss')
  if (/heilbehandlung/.test(t))           tags.push('Heilbehandlung')
  if (/beitragsanpassung/.test(t))        tags.push('Beitragsanpassung')
  if (/vorerkrankung/.test(t))            tags.push('Vorerkrankung')
  if (/faktor/.test(t))                   tags.push('GOÄ-Faktor')
  if (/physiotherapie|heilmittel/.test(t)) tags.push('Physiotherapie')
  if (/wahlleistung|chefarzt/.test(t))    tags.push('Wahlleistung')
  return tags.length ? tags : ['PKV', 'Krankenversicherung']
}

function getCourtName(court: OldCourt | number): string {
  if (typeof court === 'object') return court.name ?? 'Unbekanntes Gericht'
  return `Gericht #${court}`
}

function getCaseSlug(c: OldCase): string {
  return c.slug ?? String(c.id)
}

// ─── Claude Extraction ───────────────────────────────────────────────────────

async function extractWithClaude(
  az: string, text: string, kategorie: string
): Promise<{ leitsatz: string; relevanz_pkv: string } | null> {
  const excerpt = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000)
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Analysiere dieses OLG-Urteil zur privaten Krankenversicherung.
Az: ${az} | Kategorie: ${kategorie}

Text:
${excerpt}

Nur antworten wenn echter PKV-Streitfall (Erstattung, GOÄ, med. Notwendigkeit, Ausschlussklausel).
Format:
LEITSATZ: [2-4 Sätze juristische Kernaussage]
PKV_RELEVANZ: [2-3 Sätze praktische Anwendung im Widerspruchsverfahren]

Sonst: IRRELEVANT`
    }]
  }).catch(() => null)

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
  console.log(`=== OLG-Urteile Seed v4 === DRY_RUN=${DRY_RUN} MAX=${MAX_CASES}`)

  const { data: existingData } = await supabase.from('pkv_urteile').select('aktenzeichen')
  const existing = new Set((existingData ?? []).map((r: any) => r.aktenzeichen))
  console.log(`Bereits in DB: ${existing.size} Urteile`)

  const courts = await getOlgCourts()
  console.log(`→ ${courts.length} OLG-Gerichte gefunden`)

  const seen     = new Set<string>()
  const toInsert: object[] = []
  let allCases: OldCase[]  = []

  if (courts.length === 0) {
    // Letzter Fallback: direkte Case-Abfrage
    allCases = await getCasesDirect()
  } else {
    // Court-basiert: Fälle je Gericht laden
    const shuffled = courts.sort(() => Math.random() - 0.5)
    for (const court of shuffled) {
      if (toInsert.length >= MAX_CASES) break
      const cases = await getCasesForCourt(court.id)
      // court-Objekt rückbinden (API liefert manchmal nur ID)
      allCases.push(...cases.map(c => ({ ...c, court })))
    }
  }

  console.log(`\nVerarbeite ${allCases.length} Kandidaten...`)

  for (const c of allCases) {
    if (toInsert.length >= MAX_CASES) break

    const courtName = getCourtName(c.court)
    const az = `${courtName} ${c.file_number ?? ''}`.trim()
    if (seen.has(az) || existing.has(az)) continue
    seen.add(az)

    const text = c.content ?? ''
    if (!isPkvRelevant(text)) continue

    console.log(`  → ${az} (${c.date}) — PKV-relevant`)

    const kategorie = classifyKategorie(text)
    const extracted = await extractWithClaude(az, text, kategorie)
    if (!extracted) { console.log(`    ↳ Claude: Irrelevant`); continue }

    toInsert.push({
      aktenzeichen:  az,
      datum:         c.date,
      gericht:       courtName,
      senat:         '',
      kategorie,
      schlagwoerter: extractSchlagwoerter(text),
      leitsatz:      extracted.leitsatz,
      relevanz_pkv:  extracted.relevanz_pkv,
      quelle_url:    `https://de.openlegaldata.io/case/${getCaseSlug(c)}/`,
      verified:      false,
    })
    console.log(`    ✓ ${kategorie}`)
  }

  console.log(`\n─── Ergebnis: ${toInsert.length} neue Urteile ───`)

  if (DRY_RUN || !toInsert.length) {
    if (DRY_RUN) console.log('DRY RUN — kein Write')
    else         console.log('Keine neuen PKV-relevanten Urteile gefunden.')
    return
  }

  const { error } = await supabase
    .from('pkv_urteile')
    .upsert(toInsert, { onConflict: 'aktenzeichen', ignoreDuplicates: true })

  if (error) { console.error('Supabase-Fehler:', error); process.exit(1) }
  console.log(`✅ ${toInsert.length} Urteile gespeichert (verified=false — bitte prüfen)`)
}

main().catch(e => { console.error(e); process.exit(1) })
