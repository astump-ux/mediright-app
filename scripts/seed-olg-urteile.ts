/**
 * scripts/seed-olg-urteile.ts  v2
 *
 * Fixes v1: API 400 wegen falschem court-Parameter + zu langen Queries.
 * Lösung: court-Filter entfernt, stattdessen nach OLG im court.name filtern.
 * Kürzere, einzelne Suchbegriffe statt Phrasen.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
const DRY_RUN       = process.env.DRY_RUN === 'true'
const MAX_CASES     = parseInt(process.env.MAX_CASES ?? '30')

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// Kurze, einzelne Stichwörter — OpenLegalData mag keine langen Phrasen
const QUERIES = [
  'Krankenversicherung medizinisch notwendig',
  'PKV Erstattung Heilbehandlung',
  'Krankenversicherung GOÄ Faktor',
  'PKV Ausschlussklausel Leistung',
  'Krankenversicherung Beweislast',
  'PKV Analogziffer',
  'private Krankenversicherung Ablehnung',
]

function isOlg(courtName: string): boolean {
  return /oberlandesgericht|^OLG /i.test(courtName)
}

function classifyKategorie(text: string): string {
  const t = text.toLowerCase()
  if (/beitragsanpassung|prämienerhöhung|§\s*203\s*vvg/.test(t)) return 'beitragsanpassung'
  if (/goä|goa|faktor|analogziffer|analog|abrechnungs/.test(t))   return 'goae'
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
  if (/analogziffer|analog/.test(t))       tags.push('Analogziffer')
  if (/ausschluss/.test(t))               tags.push('Leistungsausschluss')
  if (/heilbehandlung/.test(t))            tags.push('Heilbehandlung')
  if (/beitragsanpassung/.test(t))         tags.push('Beitragsanpassung')
  if (/vorerkrankung/.test(t))             tags.push('Vorerkrankung')
  if (/faktor/.test(t))                   tags.push('GOÄ-Faktor')
  if (/physiotherapie|heilmittel/.test(t)) tags.push('Physiotherapie')
  if (/wahlleistung|chefarzt/.test(t))     tags.push('Wahlleistung')
  return tags.length ? tags : ['PKV', 'Krankenversicherung']
}

async function extractWithClaude(
  aktenzeichen: string,
  rawText: string,
  kategorie: string
): Promise<{ leitsatz: string; relevanz_pkv: string } | null> {
  const excerpt = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000)

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Du analysierst ein deutsches OLG-Urteil zur privaten Krankenversicherung (PKV).
Aktenzeichen: ${aktenzeichen} | Kategorie: ${kategorie}

Urteilstext (Auszug):
${excerpt}

Antworte NUR wenn es ein echtes PKV-Streitfall-Urteil ist (Erstattung, GOÄ, medizinische Notwendigkeit, Ausschlussklausel).
Format:
LEITSATZ: [2-4 Sätze, juristisch präzise Kernaussage]
PKV_RELEVANZ: [2-3 Sätze, praktische Anwendung für Versicherte im Widerspruchsverfahren]

Falls kein PKV-Streitfall: antworte nur IRRELEVANT`
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

async function fetchCases(query: string, offset = 0): Promise<{ results: any[]; count: number }> {
  // Kein court-Filter — wird im Script gefiltert
  const params = new URLSearchParams({ q: query, limit: '10', offset: String(offset) })
  const url = `https://de.openlegaldata.io/api/cases/?${params}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'mediright-seed/1.0' }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`  API ${res.status} — ${body.slice(0, 200)}`)
    return { results: [], count: 0 }
  }
  const data = await res.json()
  return { results: data.results ?? [], count: data.count ?? 0 }
}

async function getExistingAktenzeichen(): Promise<Set<string>> {
  const { data } = await supabase.from('pkv_urteile').select('aktenzeichen')
  return new Set((data ?? []).map((r: any) => r.aktenzeichen))
}

async function main() {
  console.log(`=== OLG-Urteile Seed v2 === DRY_RUN=${DRY_RUN} MAX=${MAX_CASES}`)

  const existing = await getExistingAktenzeichen()
  console.log(`Bereits in DB: ${existing.size} Urteile`)

  const seen     = new Set<string>()
  const toInsert: object[] = []

  for (const query of QUERIES) {
    if (toInsert.length >= MAX_CASES) break
    console.log(`\nQuery: "${query}"`)

    const { results, count } = await fetchCases(query)
    console.log(`  ${results.length} Treffer (von ${count} gesamt)`)

    for (const c of results) {
      if (toInsert.length >= MAX_CASES) break

      const courtName: string = c.court?.name ?? ''
      if (!isOlg(courtName)) {
        // Kein OLG — überspringen (z.B. LG, AG, BGH)
        continue
      }

      const az = `${courtName} ${c.file_number ?? ''}`.trim()
      if (seen.has(az) || existing.has(az)) continue
      seen.add(az)

      console.log(`  → ${az} (${c.date}) [${courtName}]`)

      const fullText = c.content ?? c.description ?? ''
      const kategorie = classifyKategorie(fullText)
      const schlagwoerter = extractSchlagwoerter(fullText)

      const extracted = await extractWithClaude(az, fullText, kategorie)
      if (!extracted) {
        console.log(`    ↳ Irrelevant`)
        continue
      }

      toInsert.push({
        aktenzeichen:  az,
        datum:         c.date,
        gericht:       courtName,
        senat:         '',
        kategorie,
        schlagwoerter,
        leitsatz:      extracted.leitsatz,
        relevanz_pkv:  extracted.relevanz_pkv,
        quelle_url:    `https://de.openlegaldata.io/case/${c.slug}/`,
        verified:      false,
      })
      console.log(`    ✓ (${kategorie})`)
    }
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

  console.log(`✅ ${toInsert.length} neue Urteile gespeichert (verified=false)`)
}

main().catch(e => { console.error(e); process.exit(1) })
