/**
 * scripts/seed-olg-urteile.ts
 *
 * Holt PKV-relevante OLG-Urteile von de.openlegaldata.io,
 * extrahiert Leitsatz + PKV-Relevanz via Claude API,
 * und upserted in Supabase pkv_urteile.
 *
 * Läuft als GitHub Action — nicht aus der lokalen Sandbox.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY!
const DRY_RUN         = process.env.DRY_RUN === 'true'
const MAX_CASES       = parseInt(process.env.MAX_CASES ?? '30')

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ─── OpenLegalData Typen ──────────────────────────────────────────────────────

interface OldCase {
  id:         number
  slug:       string
  file_number: string          // Aktenzeichen
  date:       string           // ISO date
  court:      { name: string; jurisdiction: string; level_of_appeal: string }
  content:    string           // Volltext (HTML/Text)
}

interface OldResponse {
  count:   number
  results: OldCase[]
}

// ─── Suchanfragen ─────────────────────────────────────────────────────────────

const QUERIES = [
  'private Krankenversicherung medizinisch notwendig',
  'PKV GOÄ Faktor Erstattung Abrechnung',
  'Krankenversicherung Ausschlussklausel Leistungsablehnung',
  'PKV Analogziffer Erstattung Heilbehandlung',
  'private Krankenversicherung Beweislast Versicherungsnehmer',
]

// Gerichte: nur OLG + BGH IV ZR (neue Entscheidungen)
const COURT_FILTER = 'OLG'

// ─── Kategorie-Klassifizierung (lokal, vor Claude-Call) ──────────────────────

function classifyKategorie(text: string): string {
  const t = text.toLowerCase()
  if (/beitragsanpassung|prämienerhöhung|§\s*203\s*vvg/.test(t))   return 'beitragsanpassung'
  if (/goä|goa|faktor|analogziffer|analog|abrechnungs/.test(t))      return 'goae'
  if (/ausschluss|klausel|vorerkrankung|risikoausschluss/.test(t))   return 'ausschlussklausel'
  if (/medizinisch|heilbehandlung|notwendig|therapie/.test(t))       return 'medizinische_notwendigkeit'
  return 'allgemein'
}

function extractSchlagwoerter(text: string): string[] {
  const t = text.toLowerCase()
  const tags: string[] = []
  if (/medizinisch notwendig/.test(t))   tags.push('medizinisch notwendig')
  if (/beweislast/.test(t))              tags.push('Beweislast')
  if (/goä|goa/.test(t))                tags.push('GOÄ')
  if (/analogziffer|analog/.test(t))     tags.push('Analogziffer')
  if (/ausschluss/.test(t))             tags.push('Leistungsausschluss')
  if (/heilbehandlung/.test(t))          tags.push('Heilbehandlung')
  if (/beitragsanpassung/.test(t))       tags.push('Beitragsanpassung')
  if (/vorerkrankung/.test(t))           tags.push('Vorerkrankung')
  if (/faktor/.test(t))                  tags.push('GOÄ-Faktor')
  if (/physiotherapie|heilmittel/.test(t)) tags.push('Physiotherapie')
  if (/wahlleistung|chefarzt/.test(t))   tags.push('Wahlleistung')
  return tags.length ? tags : ['PKV', 'Krankenversicherung']
}

// ─── Claude: Leitsatz + PKV-Relevanz extrahieren ─────────────────────────────

async function extractWithClaude(
  aktenzeichen: string,
  rawText: string,
  kategorie: string
): Promise<{ leitsatz: string; relevanz_pkv: string } | null> {
  // Kürze Volltext auf 6000 Zeichen für den Prompt
  const excerpt = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000)

  const prompt = `Du analysierst ein deutsches Gerichtsurteil zu privaten Krankenversicherungen (PKV).
Aktenzeichen: ${aktenzeichen}
Kategorie: ${kategorie}

Urteilstext (Auszug):
${excerpt}

Extrahiere bitte:
1. LEITSATZ: Ein präziser, 2-4 Sätze langer Leitsatz der Kernaussage. Neutral-juristisch formuliert.
2. PKV_RELEVANZ: 2-3 Sätze, wie dieses Urteil konkret für PKV-Versicherte anwendbar ist, die gegen eine Ablehnung vorgehen. Praktisch und handlungsorientiert.

Antworte im Format:
LEITSATZ: [Text]
PKV_RELEVANZ: [Text]

Falls der Text kein PKV-relevantes Urteil enthält, antworte nur: IRRELEVANT`

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    })
    const out = (msg.content[0] as { text: string }).text.trim()
    if (out.startsWith('IRRELEVANT')) return null

    const leitsatzMatch   = out.match(/LEITSATZ:\s*([\s\S]+?)(?=PKV_RELEVANZ:|$)/i)
    const relevanzMatch   = out.match(/PKV_RELEVANZ:\s*([\s\S]+?)$/i)

    if (!leitsatzMatch || !relevanzMatch) return null

    return {
      leitsatz:    leitsatzMatch[1].trim(),
      relevanz_pkv: relevanzMatch[1].trim(),
    }
  } catch (e) {
    console.error(`  Claude-Fehler für ${aktenzeichen}:`, e)
    return null
  }
}

// ─── OpenLegalData: Urteile abrufen ──────────────────────────────────────────

async function fetchCases(query: string, page = 1): Promise<OldCase[]> {
  const params = new URLSearchParams({
    q:       query,
    court:   COURT_FILTER,
    limit:   '10',
    offset:  String((page - 1) * 10),
  })
  const url = `https://de.openlegaldata.io/api/cases/?${params}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'mediright-seed/1.0' }
  })
  if (!res.ok) {
    console.warn(`  API ${res.status} für Query: ${query}`)
    return []
  }
  const data: OldResponse = await res.json()
  return data.results ?? []
}

// ─── Bereits vorhandene Aktenzeichen aus Supabase laden ──────────────────────

async function getExistingAktenzeichen(): Promise<Set<string>> {
  const { data } = await supabase.from('pkv_urteile').select('aktenzeichen')
  return new Set((data ?? []).map((r: { aktenzeichen: string }) => r.aktenzeichen))
}

// ─── Hauptprogramm ───────────────────────────────────────────────────────────

async function main() {
  console.log('=== OLG-Urteile Seed-Script ===')
  console.log(`DRY_RUN=${DRY_RUN}, MAX_CASES=${MAX_CASES}`)

  const existing  = await getExistingAktenzeichen()
  console.log(`Bereits in DB: ${existing.size} Urteile`)

  const seen      = new Set<string>()
  const toInsert: object[] = []

  for (const query of QUERIES) {
    if (toInsert.length >= MAX_CASES) break
    console.log(`\nQuery: "${query}"`)

    const cases = await fetchCases(query)
    console.log(`  ${cases.length} Treffer`)

    for (const c of cases) {
      if (toInsert.length >= MAX_CASES) break

      const az = `${c.court?.name ?? 'OLG'} ${c.file_number}`.trim()
      if (seen.has(az) || existing.has(az)) continue
      seen.add(az)

      // Nur OLG-Ebene (kein LG, AG, VG)
      if (!c.court?.name?.startsWith('OLG') && !c.court?.name?.includes('Oberlandesgericht')) continue

      console.log(`  → ${az} (${c.date})`)

      const kategorie = classifyKategorie(c.content ?? '')
      const schlagwoerter = extractSchlagwoerter(c.content ?? '')

      // Claude-Extraktion
      const extracted = await extractWithClaude(az, c.content ?? '', kategorie)
      if (!extracted) {
        console.log(`    ↳ Irrelevant (Claude-Filter)`)
        continue
      }

      toInsert.push({
        aktenzeichen: az,
        datum:        c.date,
        gericht:      c.court.name,
        senat:        '',
        kategorie,
        schlagwoerter,
        leitsatz:     extracted.leitsatz,
        relevanz_pkv: extracted.relevanz_pkv,
        quelle_url:   `https://de.openlegaldata.io/case/${c.slug}/`,
        verified:     false,  // Manuell zu prüfen
      })
      console.log(`    ✓ Extrahiert (${kategorie})`)
    }
  }

  console.log(`\n─── Ergebnis: ${toInsert.length} neue Urteile ───`)

  if (DRY_RUN) {
    console.log('DRY RUN — kein Supabase-Upsert')
    console.log(JSON.stringify(toInsert.slice(0, 2), null, 2))
    return
  }

  if (!toInsert.length) {
    console.log('Keine neuen Urteile — fertig.')
    return
  }

  const { error } = await supabase
    .from('pkv_urteile')
    .upsert(toInsert, { onConflict: 'aktenzeichen', ignoreDuplicates: true })

  if (error) {
    console.error('Supabase-Fehler:', error)
    process.exit(1)
  }

  console.log(`✅ ${toInsert.length} Urteile in Supabase gespeichert (verified=false)`)
  console.log('Bitte manuell in Supabase prüfen und verified=true setzen.')
}

main().catch(e => { console.error(e); process.exit(1) })
