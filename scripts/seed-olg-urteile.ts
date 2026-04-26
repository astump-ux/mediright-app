/**
 * scripts/seed-olg-urteile.ts  v5
 *
 * Fixes gegenüber v4:
 *  - Rate Limiting: 300ms Delay zwischen API-Calls (verhindert 429)
 *  - Content-Fetch: List-Endpoint liefert leeren content → Detail-Endpoint /cases/{slug}/ nötig
 *  - Batch-Strategie: Erst alle Kandidaten sammeln, dann selektiv Detail abrufen
 *  - Debug-Logging: zeigt content-Länge + PKV-Check-Ergebnis
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
const DRY_RUN       = process.env.DRY_RUN === 'true'
const MAX_CASES     = parseInt(process.env.MAX_CASES ?? '30')
const BASE_URL      = 'https://de.openlegaldata.io/api'

// Delay zwischen API-Requests: verhindert 429 Rate Limiting
const API_DELAY_MS = 400

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

interface OldCourt {
  id:   number
  name: string
  slug: string
}

interface CaseListItem {
  id:          number
  slug:        string
  file_number: string
  date:        string
  court:       OldCourt | number
  // content ist im List-Endpoint oft leer oder fehlt
  content?:    string
  summary?:    string
}

interface CaseDetail extends CaseListItem {
  content: string
}

// ─── API Helper ──────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function apiFetch(path: string): Promise<any> {
  await sleep(API_DELAY_MS)
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'mediright-seed/1.0' }
    })
    if (!res.ok) {
      console.warn(`  API ${res.status}: ${url}`)
      if (res.status === 429) await sleep(3000) // extra backoff bei Rate Limit
      return null
    }
    return res.json()
  } catch (e) {
    console.warn(`  Fetch-Fehler: ${url}`, e)
    return null
  }
}

function getCourtName(court: OldCourt | number): string {
  if (typeof court === 'object' && court?.name) return court.name
  return `Gericht#${court}`
}

function isOlgCourt(c: OldCourt): boolean {
  const name = (c.name ?? '').toLowerCase()
  const slug = (c.slug ?? '').toLowerCase()
  return name.includes('oberlandesgericht') || slug.startsWith('olg-')
}

// ─── Court Discovery ─────────────────────────────────────────────────────────

async function getOlgCourts(): Promise<OldCourt[]> {
  console.log('Lade OLG-Gerichte (name__icontains)...')
  const courts: OldCourt[] = []
  let url: string | null = '/courts/?name__icontains=Oberlandesgericht&limit=100'

  while (url) {
    const data = await apiFetch(url)
    if (!data) break
    courts.push(...(data.results ?? []))
    url = data.next ?? null
  }

  const olg = courts.filter(isOlgCourt)
  console.log(`  ${olg.length} OLG-Gerichte gefunden (von ${courts.length} gesamt)`)
  return olg
}

// ─── Case Fetch + Detail ─────────────────────────────────────────────────────

async function getCasesForCourt(courtId: number): Promise<CaseListItem[]> {
  const data = await apiFetch(`/cases/?court_id=${courtId}&limit=5&ordering=-date`)
  return data?.results ?? []
}

async function getCaseDetail(slug: string): Promise<CaseDetail | null> {
  const data = await apiFetch(`/cases/${slug}/`)
  return data ?? null
}

// ─── PKV Filter ──────────────────────────────────────────────────────────────

function isPkvRelevant(text: string): boolean {
  if (!text || text.length < 50) return false
  const t = text.toLowerCase()
  // Breiter gefasst als v4 — deckt mehr Randthemen ab
  return /krankenversicherung|private.*versicherung|pkv|goä|goa|heilbehandlung|erstattung.*behandlung|versicherungsnehmer|medizinisch|therapie|behandlungskosten|arzthonorar|krankheitskosten|versicherungsleistung/.test(t)
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
  console.log(`=== OLG-Urteile Seed v5 === DRY_RUN=${DRY_RUN} MAX=${MAX_CASES}`)

  const { data: existingData } = await supabase.from('pkv_urteile').select('aktenzeichen')
  const existing = new Set((existingData ?? []).map((r: any) => r.aktenzeichen))
  console.log(`Bereits in DB: ${existing.size} Urteile`)

  const courts = await getOlgCourts()
  if (!courts.length) {
    console.error('Keine OLG-Gerichte gefunden — Abbruch.')
    process.exit(1)
  }

  const seen     = new Set<string>()
  const toInsert: object[] = []

  // Gerichte mischen für Abwechslung
  const shuffled = courts.sort(() => Math.random() - 0.5)
  let candidatesChecked = 0

  for (const court of shuffled) {
    if (toInsert.length >= MAX_CASES) break

    const listItems = await getCasesForCourt(court.id)
    if (!listItems.length) continue

    for (const item of listItems) {
      if (toInsert.length >= MAX_CASES) break

      const az = `${court.name} ${item.file_number ?? ''}`.trim()
      if (seen.has(az) || existing.has(az)) continue
      seen.add(az)
      candidatesChecked++

      // List-Endpoint hat oft leeren content → Detail holen
      let text = item.content ?? item.summary ?? ''
      if (text.length < 200 && item.slug) {
        const detail = await getCaseDetail(item.slug)
        text = detail?.content ?? detail?.summary ?? text
      }

      const textLen = text.replace(/<[^>]+>/g, '').trim().length
      const pkv = isPkvRelevant(text)
      console.log(`  ${az} (${item.date}) — ${textLen} Zeichen — PKV: ${pkv}`)

      if (!pkv) continue

      const kategorie = classifyKategorie(text)
      const extracted = await extractWithClaude(az, text, kategorie)
      if (!extracted) { console.log(`    ↳ Claude: Irrelevant`); continue }

      toInsert.push({
        aktenzeichen:  az,
        datum:         item.date,
        gericht:       court.name,
        senat:         '',
        kategorie,
        schlagwoerter: extractSchlagwoerter(text),
        leitsatz:      extracted.leitsatz,
        relevanz_pkv:  extracted.relevanz_pkv,
        quelle_url:    `https://de.openlegaldata.io/case/${item.slug}/`,
        verified:      false,
      })
      console.log(`    ✓ gespeichert als ${kategorie}`)
    }
  }

  console.log(`\n─── Ergebnis: ${toInsert.length} neue Urteile (${candidatesChecked} geprüft) ───`)

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
