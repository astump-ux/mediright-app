/**
 * scripts/seed-olg-urteile.ts  v3
 *
 * Strategie: Keine Volltextsuche (funktioniert ohne Auth-Token nicht zuverlässig).
 * Stattdessen:
 *  1. /api/courts/?level_of_appeal=OLG → alle OLG-Court-IDs laden
 *  2. /api/cases/?court_id=X → aktuelle Fälle je Gericht
 *  3. Claude: PKV-Relevanz prüfen + Leitsatz extrahieren
 *  4. Supabase upsert (verified=false)
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
  level_of_appeal: string
  jurisdiction:    string
}

interface OldCase {
  id:          number
  slug:        string
  file_number: string
  date:        string
  court:       OldCourt
  content:     string
}

// ─── API-Hilfsfunktionen ──────────────────────────────────────────────────────

async function apiFetch(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'mediright-seed/1.0' }
  })
  if (!res.ok) {
    console.warn(`  API ${res.status}: ${BASE_URL}${path}`)
    return null
  }
  return res.json()
}

async function getOlgCourtIds(): Promise<OldCourt[]> {
  const courts: OldCourt[] = []
  let url = `/courts/?level_of_appeal=OLG&limit=100`

  while (url) {
    const data = await apiFetch(url)
    if (!data) break
    courts.push(...(data.results ?? []))
    // Nächste Seite: absolute URL → relativer Pfad
    if (data.next) {
      url = data.next.replace(BASE_URL, '')
    } else {
      break
    }
  }
  console.log(`  ${courts.length} OLG-Gerichte gefunden`)
  return courts
}

async function getCasesForCourt(courtId: number, offset = 0): Promise<OldCase[]> {
  const data = await apiFetch(`/cases/?court_id=${courtId}&limit=10&offset=${offset}`)
  return data?.results ?? []
}

// ─── Klassifizierung ──────────────────────────────────────────────────────────

function isPkvRelevant(text: string): boolean {
  const t = text.toLowerCase()
  return /krankenversicherung|pkv|goä|goa|heilbehandlung|erstattung|versicherungsnehmer|medizinisch|therapie|behandlung/.test(t)
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
  if (/heilbehandlung/.test(t))            tags.push('Heilbehandlung')
  if (/beitragsanpassung/.test(t))         tags.push('Beitragsanpassung')
  if (/vorerkrankung/.test(t))             tags.push('Vorerkrankung')
  if (/faktor/.test(t))                   tags.push('GOÄ-Faktor')
  if (/physiotherapie|heilmittel/.test(t)) tags.push('Physiotherapie')
  if (/wahlleistung|chefarzt/.test(t))     tags.push('Wahlleistung')
  return tags.length ? tags : ['PKV', 'Krankenversicherung']
}

// ─── Claude: Leitsatz extrahieren ────────────────────────────────────────────

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

// ─── Vorhandene AZ laden ──────────────────────────────────────────────────────

async function getExisting(): Promise<Set<string>> {
  const { data } = await supabase.from('pkv_urteile').select('aktenzeichen')
  return new Set((data ?? []).map((r: any) => r.aktenzeichen))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== OLG-Urteile Seed v3 === DRY_RUN=${DRY_RUN} MAX=${MAX_CASES}`)

  const existing = await getExisting()
  console.log(`Bereits in DB: ${existing.size} Urteile`)

  console.log('\nLade OLG-Gerichte...')
  const courts = await getOlgCourtIds()

  if (!courts.length) {
    // Fallback: bekannte OLG-Court-IDs (Hamm, Köln, Frankfurt, München, Karlsruhe)
    console.warn('Keine Courts gefunden — nutze Fallback-IDs')
    // Ohne API-Zugriff können wir IDs nicht vorab kennen, daher exit
    console.error('Court-Discovery fehlgeschlagen. Bitte API-Zugang prüfen.')
    process.exit(1)
  }

  const seen     = new Set<string>()
  const toInsert: object[] = []

  // Mische Gerichte zufällig durch für Vielfalt
  const shuffled = courts.sort(() => Math.random() - 0.5)

  for (const court of shuffled) {
    if (toInsert.length >= MAX_CASES) break
    console.log(`\nGericht: ${court.name} (id=${court.id})`)

    const cases = await getCasesForCourt(court.id)
    let found = 0

    for (const c of cases) {
      if (toInsert.length >= MAX_CASES) break

      const az = `${court.name} ${c.file_number ?? ''}`.trim()
      if (seen.has(az) || existing.has(az)) continue
      seen.add(az)

      const text = c.content ?? ''

      // Schnell-Filter: PKV-relevante Begriffe im Text?
      if (!isPkvRelevant(text)) continue

      console.log(`  → ${az} (${c.date}) — PKV-relevant`)
      found++

      const kategorie = classifyKategorie(text)
      const extracted = await extractWithClaude(az, text, kategorie)

      if (!extracted) {
        console.log(`    ↳ Claude: Irrelevant`)
        continue
      }

      toInsert.push({
        aktenzeichen:  az,
        datum:         c.date,
        gericht:       court.name,
        senat:         '',
        kategorie,
        schlagwoerter: extractSchlagwoerter(text),
        leitsatz:      extracted.leitsatz,
        relevanz_pkv:  extracted.relevanz_pkv,
        quelle_url:    `https://de.openlegaldata.io/case/${c.slug}/`,
        verified:      false,
      })
      console.log(`    ✓ ${kategorie}`)
    }

    if (found === 0) console.log(`  (keine PKV-relevanten Treffer)`)
  }

  console.log(`\n─── Ergebnis: ${toInsert.length} neue Urteile ───`)

  if (DRY_RUN || !toInsert.length) {
    if (DRY_RUN) console.log('DRY RUN — kein Write')
    else console.log('Keine neuen Urteile.')
    return
  }

  const { error } = await supabase
    .from('pkv_urteile')
    .upsert(toInsert, { onConflict: 'aktenzeichen', ignoreDuplicates: true })

  if (error) { console.error('Supabase-Fehler:', error); process.exit(1) }
  console.log(`✅ ${toInsert.length} Urteile gespeichert (verified=false — bitte prüfen)`)
}

main().catch(e => { console.error(e); process.exit(1) })
