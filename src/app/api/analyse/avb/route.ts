import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

// Internal-only route — called by /api/upload/avb/complete, not directly by the browser.
// Guard with a shared secret to prevent external abuse.
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''
const BUCKET = 'avb-dokumente'
const MAX_PAGES = 50

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  // Verify internal secret
  const secret = req.headers.get('x-internal-secret')
  if (INTERNAL_SECRET && secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { tarif_profile_id, dokument_id, user_id } = body

  if (!tarif_profile_id || !dokument_id || !user_id) {
    return NextResponse.json({ error: 'Fehlende Parameter' }, { status: 400 })
  }

  const supabase = await createClient()
  const admin = getSupabaseAdmin()

  // Mark as analyzing
  await supabase
    .from('tarif_profile')
    .update({ analyse_status: 'analyzing' })
    .eq('id', tarif_profile_id)

  try {
    // Load document metadata
    const { data: dok } = await supabase
      .from('avb_dokumente')
      .select('storage_path, dateiname_original, dateityp')
      .eq('id', dokument_id)
      .single()

    if (!dok) throw new Error('Dokument nicht gefunden')

    // Download PDF from Supabase Storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(dok.storage_path)

    if (dlError || !fileData) throw new Error(`Download fehlgeschlagen: ${dlError?.message}`)

    const pdfBuffer = await fileData.arrayBuffer()
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

    // ── Step 1: Quick-ID via Haiku (günstig, ~2-3s) ──────────────────────────
    // Nur Versicherung + Tarifname extrahieren, um den Benchmark-Cache zu prüfen.
    // Haiku bekommt das komplette PDF (Claude liest PDF nativ), aber der Prompt
    // ist minimal → schnelle Antwort, niedrige Kosten.
    let quickVersicherung = ''
    let quickTarifName = ''

    try {
      const quickRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            } as { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } },
            {
              type: 'text',
              text: 'Antworte NUR mit einem JSON-Objekt, nichts sonst:\n{"versicherung": "Name der Versicherungsgesellschaft", "tarif_name": "Tarifname"}\nWenn du dir nicht sicher bist, setze null.',
            },
          ],
        }],
      })

      const quickText = quickRes.content
        .filter(c => c.type === 'text')
        .map(c => (c as { type: 'text'; text: string }).text)
        .join('')

      const jsonMatch = quickText.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        const q = JSON.parse(jsonMatch[0])
        quickVersicherung = (q.versicherung || '').trim().toLowerCase()
        quickTarifName    = (q.tarif_name   || '').trim().toLowerCase()
      }
    } catch {
      // Quick-ID fehlgeschlagen → kein Problem, wir analysieren vollständig
      console.warn('[analyse/avb] Quick-ID fehlgeschlagen, fahre mit Vollanalyse fort')
    }

    // ── Step 2: Benchmark Cache Lookup ───────────────────────────────────────
    // Prüft ob wir das Tarif-Profil schon für einen anderen User analysiert haben.
    // tariff_benchmarks ist systemweit (kein user_id) → kein DSGVO-Problem.
    let benchmarkHit: {
      id: string
      versicherer: string
      tarif_name: string
      avb_version: string | null
      profil_json: Record<string, unknown>
    } | null = null

    if (quickVersicherung) {
      const { data: candidates } = await admin
        .from('tariff_benchmarks')
        .select('id, versicherer, tarif_name, avb_version, profil_json')
        .eq('analyse_status', 'completed')
        .ilike('versicherer', `%${quickVersicherung}%`)

      if (candidates?.length) {
        // Wenn wir einen Tarif-Namen haben, versuchen wir einen genaueren Match.
        // Sonst nehmen wir den ersten Treffer des Versicherers.
        const exactMatch = quickTarifName
          ? candidates.find(b =>
              b.tarif_name.toLowerCase().includes(quickTarifName) ||
              quickTarifName.includes(b.tarif_name.toLowerCase())
            )
          : null

        benchmarkHit = (exactMatch ?? candidates[0]) as typeof benchmarkHit
      }
    }

    // ── Step 3a: Benchmark-Treffer → sofort fertig, kein Opus-Call nötig ────
    if (benchmarkHit?.profil_json) {
      console.log(`[analyse/avb] Benchmark-Treffer: ${benchmarkHit.versicherer} · ${benchmarkHit.tarif_name}`)

      const profil = benchmarkHit.profil_json
      const selbstbehalt = (profil.selbstbehalt as { jahresmaximum_eur?: number } | undefined)?.jahresmaximum_eur

      const quelldokumente = [{
        dateiname:     dok.dateiname_original,
        dateityp:      dok.dateityp,
        storage_path:  dok.storage_path,
        analysiert_am: new Date().toISOString(),
      }]

      await supabase
        .from('tarif_profile')
        .update({
          versicherung:    benchmarkHit.versicherer,
          tarif_name:      benchmarkHit.tarif_name,
          avb_version:     benchmarkHit.avb_version || null,
          versicherungsnummer: null,
          // Benchmark-JSON übernehmen; _quelle markiert die Herkunft für zukünftige Logik
          profil_json: {
            ...profil,
            _quelle:       'benchmark',
            _benchmark_id: benchmarkHit.id,
          },
          quelldokumente,
          analyse_status:  'completed',
          analyse_datum:   new Date().toISOString(),
          fehler_meldung:  null,
        })
        .eq('id', tarif_profile_id)

      await supabase
        .from('profiles')
        .update({
          pkv_name:              benchmarkHit.versicherer,
          pkv_tarif:             benchmarkHit.tarif_name,
          pkv_selbstbehalt_eur:  selbstbehalt ?? null,
        })
        .eq('id', user_id)

      return NextResponse.json({
        success: true,
        tarif_profile_id,
        versicherung:          benchmarkHit.versicherer,
        tarif_name:            benchmarkHit.tarif_name,
        source:                'benchmark',
        sonderklauseln_gefunden: Array.isArray(profil.sonderklauseln)
          ? (profil.sonderklauseln as unknown[]).length
          : 0,
      })
    }

    // ── Step 3b: Kein Benchmark-Treffer → vollständige Claude Opus Analyse ──
    console.log(`[analyse/avb] Kein Benchmark-Treffer für "${quickVersicherung}" · "${quickTarifName}" — Vollanalyse startet`)

    const estimatedPages = Math.min(
      Math.ceil(pdfBuffer.byteLength / (300 * 1024)),
      MAX_PAGES
    )

    const extractionPrompt = `Du bist ein spezialisierter PKV-Vertragsanalyst. Analysiere dieses Versicherungsdokument (${dok.dateiname_original}, ca. ${estimatedPages} Seiten) und extrahiere ALLE versicherungsrelevanten Daten.

Gib das Ergebnis als gültiges JSON zurück – NICHTS sonst außer dem JSON-Objekt, keine Erklärungen davor oder danach.

Das JSON muss exakt diesem Schema entsprechen:

{
  "versicherung": "Name der Versicherungsgesellschaft",
  "tarif_name": "Tarifname",
  "avb_version": "Version/Stand der AVB",
  "versicherungsnummer": "Versicherungsnummer falls vorhanden, sonst null",
  "monatsbeitrag_eur": null,
  "gesundheitslotse": {
    "mit_lotse_pct": 100,
    "ohne_lotse_pct": 80,
    "lotsen_definition": ["Liste der anerkannten Lotsen"],
    "quelle": "VG-Nummer, Abschnitt, Seite"
  },
  "selbstbehalt": {
    "prozent": 20,
    "jahresmaximum_eur": 500,
    "ausnahmen_kein_selbstbehalt": ["Liste der Leistungen die NICHT zum Selbstbehalt zählen"],
    "quelle": "VG-Nummer, Abschnitt, Seite"
  },
  "erstattungssaetze": {
    "arzt_mit_lotse_pct": 100,
    "arzt_ohne_lotse_pct": 80,
    "arzneimittel_generikum_pct": 100,
    "arzneimittel_original_pct": 80,
    "heilmittel_bis_grenze_pct": 80,
    "heilmittel_jahresgrenze_eur": 1600,
    "heilmittel_ueber_grenze_pct": 100,
    "heilpraktiker_pct": 80,
    "heilpraktiker_jahresmax_eur": 1000,
    "psychotherapie_pct": 80,
    "vorsorge_impfungen_pct": 100,
    "praevention_pct": 100,
    "praevention_max_eur": 200,
    "sehhilfen_pct": 100,
    "sehhilfen_limit_eur_2jahre": 250,
    "lasik_pct": 100,
    "lasik_limit_eur_pro_auge": 1000,
    "stationaer_vollstationaer_pct": 100,
    "stationaer_privatarzt": true,
    "stationaer_zweibettzimmer_pct": 100,
    "rehabilitation_pct": 100,
    "rehabilitation_frequenz": "einmal in X Jahren"
  },
  "goae_regelung": {
    "regelsteigerungssatz_arzt": 2.3,
    "regelsteigerungssatz_labor": 1.15,
    "begruendungspflicht_ab_faktor": 2.3,
    "kommentar": "Beschreibung der GOÄ-Regelung laut Vertrag"
  },
  "sonderklauseln": [
    {
      "id": "Kürzel z.B. LE/3",
      "bezeichnung": "Beschreibung",
      "wortlaut": "Exakter Vertragstext",
      "risiko": "KRITISCH / HOCH / MITTEL / NIEDRIG",
      "quelle": "Seite/Abschnitt",
      "rechtliche_angreifbarkeit": "Kurze Einschätzung"
    }
  ],
  "quelldokumente_gefunden": [
    {
      "bezeichnung": "z.B. VG100",
      "typ": "Beschreibung",
      "seiten": "z.B. 37-44"
    }
  ],
  "wichtige_hinweise": ["Liste besonderer Punkte die für den Versicherten relevant sind"]
}

Wichtige Anweisungen:
- Zitiere exakte Seitenzahlen und Paragraph-/Abschnittsnummern bei jedem Feld (quelle-Felder)
- Bei Sonderklauseln: vollständigen Wortlaut des Vertragstextes angeben
- Wenn eine Information nicht im Dokument steht: null verwenden, nicht raten
- Besonders achten auf: Leistungsausschlüsse, Sondervereinbarungen (LE/X, sI/X), Selbstbehalt-Ausnahmen
- Selbstbehalt-Ausnahmen sind besonders wichtig – welche Leistungen zählen NICHT zur Jahresobergrenze?`

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            } as { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } },
            {
              type: 'text',
              text: extractionPrompt,
            },
          ],
        },
      ],
    })

    const rawText = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('')

    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) throw new Error('Kein gültiges JSON in Claude-Antwort')

    let extractedJson: Record<string, unknown>
    try {
      extractedJson = JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch {
      throw new Error('JSON konnte nicht geparst werden')
    }

    const quelldokumente = [
      {
        dateiname: dok.dateiname_original,
        dateityp: dok.dateityp,
        storage_path: dok.storage_path,
        analysiert_am: new Date().toISOString(),
      },
      ...((extractedJson.quelldokumente_gefunden as unknown[]) || []),
    ]

    await supabase
      .from('tarif_profile')
      .update({
        versicherung: (extractedJson.versicherung as string) || '',
        tarif_name: (extractedJson.tarif_name as string) || '',
        avb_version: (extractedJson.avb_version as string) || null,
        versicherungsnummer: (extractedJson.versicherungsnummer as string) || null,
        profil_json: extractedJson,
        quelldokumente,
        analyse_status: 'completed',
        analyse_datum: new Date().toISOString(),
        fehler_meldung: null,
      })
      .eq('id', tarif_profile_id)

    await supabase
      .from('avb_dokumente')
      .update({ tarif_profile_id })
      .eq('id', dokument_id)

    const selbstbehalt = (extractedJson.selbstbehalt as { jahresmaximum_eur?: number } | undefined)?.jahresmaximum_eur
    await supabase
      .from('profiles')
      .update({
        pkv_name: (extractedJson.versicherung as string) || null,
        pkv_tarif: (extractedJson.tarif_name as string) || null,
        pkv_selbstbehalt_eur: selbstbehalt ?? null,
      })
      .eq('id', user_id)

    // ── Bonus: Neue Analyse als Benchmark speichern (falls noch kein Eintrag) ─
    // So profitieren künftige User mit demselben Tarif vom Cache.
    const newVersicherung = (extractedJson.versicherung as string) || ''
    const newTarifName    = (extractedJson.tarif_name    as string) || ''
    if (newVersicherung && newTarifName) {
      await admin
        .from('tariff_benchmarks')
        .upsert({
          versicherer:    newVersicherung,
          tarif_name:     newTarifName,
          avb_version:    (extractedJson.avb_version as string) || null,
          profil_json:    extractedJson,
          analyse_status: 'completed',
          analysiert_am:  new Date().toISOString(),
        }, { onConflict: 'versicherer,tarif_name', ignoreDuplicates: false })
        .select()
    }

    return NextResponse.json({
      success: true,
      tarif_profile_id,
      versicherung: extractedJson.versicherung,
      tarif_name: extractedJson.tarif_name,
      source: 'full_analysis',
      sonderklauseln_gefunden: Array.isArray(extractedJson.sonderklauseln)
        ? (extractedJson.sonderklauseln as unknown[]).length
        : 0,
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analyse/avb] Fehler:', message)

    await supabase
      .from('tarif_profile')
      .update({
        analyse_status: 'failed',
        fehler_meldung: message,
      })
      .eq('id', tarif_profile_id)

    return NextResponse.json({ error: 'Analyse fehlgeschlagen', detail: message }, { status: 500 })
  }
}
