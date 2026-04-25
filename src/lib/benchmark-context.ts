/**
 * benchmark-context.ts
 *
 * Lädt alle 5 abgeschlossenen tarif_benchmarks aus Supabase und erzeugt
 * einen strukturierten Marktvergleichs-Block für KI-Prompts.
 *
 * Kernfrage: Ist eine AXA-Ablehnung branchenüblich (alle anderen Versicherer
 * haben dieselbe Einschränkung) oder AXA-spezifisch (und damit anfechtbarer)?
 */
import { getSupabaseAdmin } from './supabase-admin'

type JsonObj = Record<string, unknown>

/**
 * Gibt einen formatierten Marktvergleichs-Block zurück, der direkt
 * in den Fallkontext-String eingefügt werden kann.
 *
 * @param ablehnungsgruende  Aus dem Kassenbescheid extrahierte Ablehnungsgründe
 */
export async function buildBenchmarkContext(ablehnungsgruende: string[] = []): Promise<string> {
  const admin = getSupabaseAdmin()

  const { data: benchmarks, error } = await admin
    .from('tarif_benchmarks')
    .select('versicherer, tarif_name, profil_json')
    .eq('analyse_status', 'completed')
    .order('versicherer')

  if (error || !benchmarks?.length) return ''

  const lines: string[] = [
    '──────────────────────────────────────────────────────',
    'MARKTVERGLEICH — 5 führende PKV-Vollversicherungs-Tarife',
    '──────────────────────────────────────────────────────',
    '⚡ ANWEISUNG: Prüfe jeden AXA-Ablehnungsgrund gegen diese Marktdaten.',
    '   Wenn eine Einschränkung bei AXA NICHT bei den anderen Versicherern',
    '   vorkommt → markiere dies als "AXA-spezifisch" → höhere Widerspruchs-',
    '   erfolgswahrscheinlichkeit. Wenn sie branchenüblich ist → ehrlich kommunizieren.',
    '',
  ]

  // ── 1. Erstattungssatz-Vergleich ────────────────────────────────────────────
  lines.push('ERSTATTUNGSSÄTZE IM MARKTVERGLEICH:')
  for (const b of benchmarks) {
    const p = b.profil_json as JsonObj | null
    if (!p) continue
    const es = p.erstattungssaetze as JsonObj | undefined
    const sb = p.selbstbehalt as JsonObj | undefined
    const gl = p.gesundheitslotse as JsonObj | undefined

    lines.push(`  ${b.versicherer} (${b.tarif_name}):`)
    if (gl?.mit_lotse_pct != null)
      lines.push(`    Lotse: ${gl.mit_lotse_pct}% (mit) / ${gl.ohne_lotse_pct ?? '?'}% (ohne)`)
    if (es?.arzt_mit_lotse_pct != null)
      lines.push(`    Arzt: ${es.arzt_mit_lotse_pct}% (mit Lotse) / ${es.arzt_ohne_lotse_pct ?? '?'}% (ohne Lotse)`)
    if (es?.heilmittel_bis_grenze_pct != null)
      lines.push(`    Heilmittel: ${es.heilmittel_bis_grenze_pct}% bis ${es.heilmittel_jahresgrenze_eur ?? '?'} EUR/Jahr`)
    if (es?.psychotherapie_pct != null)
      lines.push(`    Psychotherapie: ${es.psychotherapie_pct}%`)
    if (es?.heilpraktiker_pct != null)
      lines.push(`    Heilpraktiker: ${es.heilpraktiker_pct}% (max. ${es.heilpraktiker_jahresmax_eur ?? '?'} EUR/Jahr)`)
    if (es?.arzneimittel_generikum_pct != null)
      lines.push(`    Arzneimittel Generikum: ${es.arzneimittel_generikum_pct}%`)
    if (sb?.prozent != null)
      lines.push(`    Selbstbehalt: ${sb.prozent}% (max. ${sb.jahresmaximum_eur ?? '?'} EUR/Jahr)`)
    const goae = p.goae_regelung as JsonObj | undefined
    if (goae?.max_erstattbarer_faktor != null)
      lines.push(`    GOÄ-Faktor max.: ${goae.max_erstattbarer_faktor}×`)
  }
  lines.push('')

  // ── 2. Sonderklauseln-Vergleich (nur KRITISCH/HOCH) ─────────────────────────
  const allKritisch: Array<{ versicherer: string; klausel: JsonObj }> = []
  for (const b of benchmarks) {
    const p = b.profil_json as JsonObj | null
    if (!p) continue
    const klauseln = p.sonderklauseln as JsonObj[] | undefined
    if (!Array.isArray(klauseln)) continue
    for (const k of klauseln) {
      if (k.risiko === 'KRITISCH' || k.risiko === 'HOCH') {
        allKritisch.push({ versicherer: b.versicherer, klausel: k })
      }
    }
  }

  if (allKritisch.length > 0) {
    lines.push('SONDERKLAUSELN (KRITISCH/HOCH) IM MARKTVERGLEICH:')
    lines.push('Hinweis: Prüfe ob der AXA-Ablehnungsgrund einer dieser Klauseln entspricht.')
    lines.push('Wenn die Klausel NUR bei AXA vorkommt → höhere Anfechtbarkeit.')
    lines.push('')
    for (const { versicherer, klausel: k } of allKritisch) {
      lines.push(`  [${versicherer} | ${k.risiko}] ${k.bezeichnung ?? ''}`)
      if (k.wortlaut) lines.push(`    Vertragstext: "${String(k.wortlaut).slice(0, 200)}"`)
      if (k.rechtliche_angreifbarkeit) lines.push(`    Rechtlich: ${k.rechtliche_angreifbarkeit}`)
    }
    lines.push('')
  }

  // ── 3. Kontext-Hinweis zu den Ablehnungsgründen ─────────────────────────────
  if (ablehnungsgruende.length > 0) {
    lines.push(`AXA-ABLEHNUNGSGRÜNDE IN DIESEM FALL (gegen Markt abzugleichen):`)
    ablehnungsgruende.forEach((g, i) => lines.push(`  ${i + 1}. ${g}`))
    lines.push('')
    lines.push('→ Prüfe für jeden dieser Gründe: Gibt es eine entsprechende Klausel')
    lines.push('  in den obigen Benchmark-Profilen? Bei welchen Versicherern, bei welchen nicht?')
    lines.push('')
  }

  return lines.join('\n')
}
