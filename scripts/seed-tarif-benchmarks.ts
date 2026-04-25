/**
 * seed-tarif-benchmarks.ts
 *
 * Admin-Skript: Fetcht AVB-PDFs der führenden PKV-Versicherer,
 * analysiert sie mit Claude Vision und speichert die tarif_profil.json
 * direkt in die Supabase-Tabelle tarif_benchmarks.
 *
 * Ausführen:
 *   npx tsx scripts/seed-tarif-benchmarks.ts
 *
 * Benötigt in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually (no dotenv dependency needed)
import { readFileSync } from 'fs'
try {
  const env = readFileSync('.env.local', 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* ignore if not found */ }

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY!
const MAX_PAGES       = 50   // Claude PDF-Limit
const MODEL           = 'claude-opus-4-6'

if (!SUPABASE_URL || !SERVICE_ROLE || !ANTHROPIC_KEY) {
  console.error('❌  Fehlende Env-Variablen: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase  = createClient(SUPABASE_URL, SERVICE_ROLE)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ── Extraktions-Prompt (identisch mit /api/analyse/avb) ──────────────────────

function buildPrompt(dateiname: string, versicherer: string): string {
  return `Du bist ein spezialisierter PKV-Vertragsanalyst. Analysiere dieses AVB-Dokument (${dateiname}) des Versicherers "${versicherer}" und extrahiere ALLE versicherungsrelevanten Daten.

Gib das Ergebnis als gültiges JSON zurück – NICHTS außer dem JSON-Objekt, keine Erklärungen.

Das JSON muss exakt diesem Schema entsprechen:

{
  "versicherung": "Name der Versicherungsgesellschaft",
  "tarif_name": "Tarifname",
  "avb_version": "Version/Stand der AVB (z.B. MB/KK 2009, Stand 10/2025)",
  "versicherungsnummer": null,
  "monatsbeitrag_eur": null,
  "gesundheitslotse": {
    "mit_lotse_pct": 100,
    "ohne_lotse_pct": 80,
    "quelle": "z.B. VG100, Seite 5, § 4"
  },
  "selbstbehalt": {
    "prozent": 20,
    "jahresmaximum_eur": 2000,
    "ausnahmen_kein_selbstbehalt": ["Vorsorgeuntersuchungen", "Mutterschaft", "Kinderheilkunde"],
    "quelle": "z.B. VG100, Seite 8, § 6"
  },
  "erstattungssaetze": {
    "arzt_mit_lotse_pct": 100,
    "arzt_ohne_lotse_pct": 80,
    "heilmittel_bis_grenze_pct": 80,
    "heilmittel_jahresgrenze_eur": 2000,
    "psychotherapie_pct": 80,
    "heilpraktiker_pct": 60,
    "heilpraktiker_jahresmax_eur": 1000,
    "arzneimittel_generikum_pct": 80,
    "quelle": "z.B. VG100, Seiten 4-9"
  },
  "stationaer": {
    "zimmer": "Einbettzimmer | Zweibettzimmer | Mehrbettzimmer",
    "chefarzt": true,
    "krankenhaus_typ": "alle zugelassenen | nur Vertragskliniken",
    "quelle": "z.B. VG100, Seite 6"
  },
  "goae_regelung": {
    "max_erstattbarer_faktor": 3.5,
    "ueber_faktor_moeglich": false,
    "ueber_faktor_begruendung_erforderlich": true,
    "quelle": "z.B. VG100, Seite 4"
  },
  "sonderklauseln": [
    {
      "id": "LE/01",
      "bezeichnung": "Kurze Bezeichnung des Ausschlusses/der Klausel",
      "wortlaut": "Vollständiger Wortlaut aus dem Dokument",
      "risiko": "KRITISCH | HOCH | MITTEL | NIEDRIG",
      "rechtliche_angreifbarkeit": "Einschätzung ob die Klausel anfechtbar ist",
      "quelle": "z.B. VG100, Seite 12"
    }
  ],
  "wichtige_hinweise": ["Liste besonderer Punkte die für den Versicherten relevant sind"]
}

Wichtige Anweisungen:
- Zitiere exakte Seitenzahlen und Paragraph-/Abschnittsnummern bei jedem quelle-Feld
- Bei Sonderklauseln: vollständigen Wortlaut des Vertragstextes angeben
- Wenn eine Information nicht im Dokument steht: null verwenden, nicht raten
- Besonders achten auf: Leistungsausschlüsse, Sondervereinbarungen, Selbstbehalt-Ausnahmen
- Dies ist ein REFERENZ-TARIF (kein individueller Vertrag) — versicherungsnummer und monatsbeitrag_eur immer null`
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

async function fetchPdf(url: string): Promise<Buffer> {
  console.log(`  ↓ Lade PDF: ${url}`)
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MediRight-Admin/1.0)',
      'Accept': 'application/pdf,*/*',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} beim Laden von ${url}`)
  const arrayBuffer = await response.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)
  console.log(`  ✓ PDF geladen (${(buf.length / 1024).toFixed(0)} KB)`)
  return buf
}

/**
 * Bereinigt Claude-JSON für JSON.parse():
 * 1. Unescapte Steuerzeichen in String-Werten escapen (Newlines, Tabs, etc.)
 * 2. Trailing Commas vor } und ] entfernen
 */
function sanitizeJsonString(raw: string): string {
  // Pass 1: Zeichen-für-Zeichen — Steuerzeichen in Strings escapen
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]

    if (escaped) {
      result += char
      escaped = false
      continue
    }

    if (char === '\\' && inString) {
      result += char
      escaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      result += char
      continue
    }

    // Innerhalb von Strings: Steuerzeichen escapen
    if (inString) {
      if (char === '\n') { result += '\\n'; continue }
      if (char === '\r') { result += '\\r'; continue }
      if (char === '\t') { result += '\\t'; continue }
      if (char.charCodeAt(0) < 0x20) continue // andere Steuerzeichen entfernen
    }

    result += char
  }

  // Pass 2: Trailing Commas entfernen (,  } oder ,  ])
  result = result.replace(/,(\s*[}\]])/g, '$1')

  return result
}

async function analyzePdf(
  pdfBuffer: Buffer,
  versicherer: string,
  tarifName: string,
  avbUrl: string
): Promise<Record<string, unknown>> {
  const pdfBase64     = pdfBuffer.toString('base64')
  const dateiname     = avbUrl.split('/').pop() ?? tarifName
  const prompt        = buildPrompt(dateiname, versicherer)

  console.log(`  🤖 Analysiere mit Claude (${MODEL})…`)

  const content: ContentBlockParam[] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    } as ContentBlockParam,
    { type: 'text', text: prompt },
  ]

  const messages: MessageParam[] = [{ role: 'user', content }]

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages,
  })

  const rawText = response.content
    .filter(c => c.type === 'text')
    .map(c => (c as { type: 'text'; text: string }).text)
    .join('')

  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ??
                    rawText.match(/(\{[\s\S]*\})/)

  if (!jsonMatch) throw new Error('Kein JSON in Claude-Antwort')

  const rawJson = jsonMatch[1] ?? jsonMatch[0]
  const sanitized = sanitizeJsonString(rawJson)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(sanitized) as Record<string, unknown>
  } catch (e) {
    // Zeige JSON-Kontext rund um die Fehlerposition
    const posMatch = e instanceof Error ? e.message.match(/position (\d+)/) : null
    const pos = posMatch ? parseInt(posMatch[1]) : 0
    const start = Math.max(0, pos - 120)
    const end = Math.min(sanitized.length, pos + 120)
    console.error(`  JSON-Parse-Fehler bei Position ${pos}:`)
    console.error('  ...', sanitized.slice(start, end), '...')
    throw new Error(`JSON-Parse fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
  }
  console.log(`  ✓ Analyse abgeschlossen (${response.usage.input_tokens} → ${response.usage.output_tokens} Tokens)`)
  return parsed
}

// ── Hauptprozess ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Starte Tarif-Benchmark-Seed\n')

  // Lade alle pending Einträge aus Supabase
  const { data: benchmarks, error } = await supabase
    .from('tarif_benchmarks')
    .select('id, versicherer, tarif_name, avb_url')
    .eq('analyse_status', 'pending')
    .order('versicherer')

  if (error) { console.error('❌ Supabase-Fehler:', error.message); process.exit(1) }
  if (!benchmarks?.length) { console.log('ℹ️  Keine pending Einträge gefunden.'); return }

  console.log(`📋 ${benchmarks.length} Versicherer zu verarbeiten:\n`)
  benchmarks.forEach(b => console.log(`   • ${b.versicherer}: ${b.tarif_name}`))
  console.log()

  let ok = 0, fail = 0

  for (const bench of benchmarks) {
    console.log(`\n━━━ ${bench.versicherer} — ${bench.tarif_name} ━━━`)

    // Auf "analyzing" setzen
    await supabase
      .from('tarif_benchmarks')
      .update({ analyse_status: 'analyzing' })
      .eq('id', bench.id)

    try {
      // PDF laden
      const pdfBuffer = await fetchPdf(bench.avb_url)

      // Analysieren
      const profilJson = await analyzePdf(pdfBuffer, bench.versicherer, bench.tarif_name, bench.avb_url)

      // Versionsstempel aus JSON lesen falls vorhanden
      const avbVersion = (profilJson.avb_version as string | null) ?? null

      // In Supabase speichern
      const { error: updateErr } = await supabase
        .from('tarif_benchmarks')
        .update({
          profil_json:    profilJson,
          avb_version:    avbVersion,
          analyse_status: 'completed',
          analysiert_am:  new Date().toISOString(),
        })
        .eq('id', bench.id)

      if (updateErr) throw new Error(`Supabase update: ${updateErr.message}`)

      console.log(`  ✅ ${bench.versicherer} erfolgreich gespeichert`)
      ok++

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ❌ ${bench.versicherer} fehlgeschlagen: ${msg}`)

      await supabase
        .from('tarif_benchmarks')
        .update({ analyse_status: 'failed' })
        .eq('id', bench.id)

      fail++
    }

    // Kurze Pause zwischen den API-Calls
    if (benchmarks.indexOf(bench) < benchmarks.length - 1) {
      console.log('  ⏳ Warte 3s…')
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`✅ Fertig: ${ok} erfolgreich, ${fail} fehlgeschlagen`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(err => {
  console.error('Fataler Fehler:', err)
  process.exit(1)
})
