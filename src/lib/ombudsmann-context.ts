/**
 * ombudsmann-context.ts
 *
 * Lädt PKV-Ombudsmann-Statistiken aus der Supabase-Tabelle und erzeugt
 * einen formatierten Kontext-Block für KI-Analysen und Widerspruch-Generierung.
 *
 * Quelle: pkv_ombudsmann_statistik — befüllt aus Tätigkeitsbericht 2025
 *         (PKV-Ombudsmann, Stand: April 2026)
 *
 * Kernaussage für KI: Die Ombudsmann-Einigungsquote liegt bei 33,1 % —
 * d.h. in jedem dritten Verfahren erzielt der Versicherte eine Einigung.
 * Das ist eine wichtige Kalibrierungszahl für Widerspruchsempfehlungen.
 */

import { getSupabaseAdmin } from './supabase-admin'

interface OmbudsmannStat {
  kategorie:           string
  kategorie_label:     string
  anteil_beschwerden:  number | null
  fallzahl_kv:         number | null
  einigungsquote:      number | null
  ki_hinweis:          string
}

/**
 * Lädt Ombudsmann-Statistiken für die gegebenen Kategorien.
 * Gibt immer auch die Gesamtstatistik (allgemein) zurück.
 * Fail-silent: leerer String bei Fehler.
 */
export async function getOmbudsmannContext(
  kategorien: string[]
): Promise<string> {
  try {
    const admin = getSupabaseAdmin()
    const searchKats = [...new Set([...kategorien, 'allgemein'])]

    const { data, error } = await admin
      .from('pkv_ombudsmann_statistik')
      .select('kategorie, kategorie_label, anteil_beschwerden, fallzahl_kv, einigungsquote, ki_hinweis')
      .in('kategorie', searchKats)
      .eq('berichtsjahr', 2025)
      .order('anteil_beschwerden', { ascending: false })

    if (error || !data?.length) return ''

    return formatOmbudsmannBlock(data as OmbudsmannStat[])
  } catch {
    return ''
  }
}

function formatOmbudsmannBlock(stats: OmbudsmannStat[]): string {
  // Gesamtstatistik zuerst
  const gesamt = stats.find(s => s.kategorie === 'allgemein' && s.einigungsquote)
  const kategorien = stats.filter(s => !(s.kategorie === 'allgemein' && s.einigungsquote))

  const lines: string[] = [
    '──────────────────────────────────────────────────────',
    'OMBUDSMANN-STATISTIK 2025 (Kalibrierungsdaten)',
    '──────────────────────────────────────────────────────',
  ]

  if (gesamt) {
    lines.push(`⚖️  Gesamte Einigungsquote beim PKV-Ombudsmann: ${gesamt.einigungsquote}%`)
    lines.push(`   (Berichtsjahr 2025, ${gesamt.fallzahl_kv?.toLocaleString('de-DE')} KV-Vollversicherungs-Anträge)`)
    lines.push('')
  }

  for (const s of kategorien) {
    if (s.kategorie === 'allgemein') continue
    const anteil = s.anteil_beschwerden ? ` | ${s.anteil_beschwerden}% aller Beschwerden` : ''
    const fallzahl = s.fallzahl_kv ? ` | ${s.fallzahl_kv} Fälle` : ''
    lines.push(`  ▸ ${s.kategorie_label}${anteil}${fallzahl}`)
    if (s.ki_hinweis) {
      lines.push(`    ${s.ki_hinweis.slice(0, 250)}${s.ki_hinweis.length > 250 ? '…' : ''}`)
    }
    lines.push('')
  }

  lines.push('   → Tipp: Ombudsmann-Verfahren kostenfrei, ø 65 Tage Bearbeitungszeit.')
  lines.push('     Ombudsmann-Schlichtung als nächster Schritt nach erfolglosem Widerspruch.')

  return lines.join('\n')
}
