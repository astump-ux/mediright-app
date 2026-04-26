/**
 * rejection-pattern-context.ts
 *
 * Training Source #3: Anonymisierte Ablehnungsmuster aus der Community
 * + persönliche Ablehnungshistorie des aktuellen Users.
 *
 * Zweistufig:
 *   1. Per-User-History  — Was wurde diesem User schon mal abgelehnt?
 *                          Hat ein Widerspruch damals funktioniert?
 *   2. Cross-User-Muster — Wie häufig kommt dieses Muster bei allen Usern vor?
 *                          Wie ist die Widerspruchs-Erfolgsquote?
 *
 * Neue User ohne eigene History profitieren sofort von Stufe 2.
 * Fail-silent: gibt '' zurück bei jedem Fehler.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface AblehnungsMuster {
  muster_key: string
  kategorie: string
  ablehnungsgrund_normalisiert: string
  goae_ziffer: string | null
  anzahl_ablehnungen: number
  summe_betrag_abgelehnt: number
  anzahl_widersprueche: number
  anzahl_widerspruch_erfolg: number
  beispiel_begruendungen: string[]
  erfolgreiche_argumente: string[]
}

interface UserHistoryItem {
  bescheiddatum: string | null
  betrag_abgelehnt: number | null
  kasse_analyse: Record<string, unknown> | null
}

/**
 * Leitet relevante Kategorien aus Ablehnungsgründen ab — identisch zu fall-context.ts.
 */
function extractKategorien(ablehnungsgruende: string[]): string[] {
  const text = ablehnungsgruende.join(' ').toLowerCase()
  const kategorien: string[] = []
  if (/goä|goa|faktor|analog|ziffer|schwellenwert|abrechnung/.test(text)) kategorien.push('goae', 'analog', 'faktor')
  if (/notwendig|heilbehandlung|therapie|medizinisch|alternativ|evidenz/.test(text))  kategorien.push('medizinische_notwendigkeit')
  if (/ausschluss|klausel|vorerkrankung|nicht versichert/.test(text))                 kategorien.push('ausschlussklausel')
  if (/beitrag|prämie|erhöhung|anpassung/.test(text))                                 kategorien.push('beitragsanpassung')
  if (kategorien.length === 0) kategorien.push('sonstiges', 'medizinische_notwendigkeit')
  return [...new Set(kategorien)]
}

/**
 * Formatiert Cross-User-Muster als lesbaren Kontext-Block.
 */
function formatCrossUserMuster(muster: AblehnungsMuster[]): string {
  if (muster.length === 0) return ''

  const lines: string[] = ['--- Community-Ablehnungsmuster (anonymisiert, alle User) ---']

  for (const m of muster) {
    const erfolgsquote = m.anzahl_widersprueche > 0
      ? Math.round((m.anzahl_widerspruch_erfolg / m.anzahl_widersprueche) * 100)
      : null

    const zifferHinweis = m.goae_ziffer ? ` (GOÄ ${m.goae_ziffer})` : ''
    lines.push(`Muster${zifferHinweis}: ${m.ablehnungsgrund_normalisiert.slice(0, 120)}`)
    lines.push(`  Häufigkeit: ${m.anzahl_ablehnungen}× abgelehnt | Ø Betrag: ${m.anzahl_ablehnungen > 0 ? (m.summe_betrag_abgelehnt / m.anzahl_ablehnungen).toFixed(0) : '–'} €`)

    if (erfolgsquote !== null) {
      lines.push(`  Widersprüche: ${m.anzahl_widersprueche} eingereicht → ${m.anzahl_widerspruch_erfolg} erfolgreich (${erfolgsquote}% Erfolgsquote)`)
    } else {
      lines.push(`  Widersprüche: noch keine Daten`)
    }

    if (m.beispiel_begruendungen?.length > 0) {
      lines.push(`  Typische AXA-Formulierung: "${m.beispiel_begruendungen[0].slice(0, 150)}"`)
    }
    if (m.erfolgreiche_argumente?.length > 0) {
      lines.push(`  Bewährtes Gegenargument: ${m.erfolgreiche_argumente[0].slice(0, 150)}`)
    }
  }

  lines.push('---')
  return lines.join('\n')
}

/**
 * Formatiert die persönliche Ablehnungshistorie des Users.
 */
function formatUserHistory(history: UserHistoryItem[], ablehnungsgruende: string[]): string {
  if (history.length === 0) return ''

  // Filtere auf Bescheide mit ähnlichen Ablehnungsgründen
  const keywords = ablehnungsgruende
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 8)

  const relevante = history.filter(h => {
    const analyseText = JSON.stringify(h.kasse_analyse ?? {}).toLowerCase()
    return keywords.some(kw => analyseText.includes(kw))
  })

  if (relevante.length === 0) return ''

  const lines: string[] = [`--- Eigene Ablehnungshistorie (${relevante.length} ähnliche Fälle) ---`]

  for (const item of relevante.slice(0, 4)) {
    const analyse = item.kasse_analyse as Record<string, unknown> | null
    const gruende = (analyse?.ablehnungsgruende as string[] | null) ?? []
    const empfehlung = analyse?.widerspruchEmpfohlen as boolean | null
    const chance = analyse?.widerspruchErfolgswahrscheinlichkeit as number | null

    lines.push(`Bescheid vom ${item.bescheiddatum ?? '–'}: ${item.betrag_abgelehnt?.toFixed(2) ?? '–'} € abgelehnt`)
    if (gruende.length > 0) {
      lines.push(`  Damaliger Ablehnungsgrund: ${gruende[0].slice(0, 120)}`)
    }
    if (empfehlung != null) {
      lines.push(`  KI-Empfehlung damals: ${empfehlung ? 'Widerspruch empfohlen' : 'Kein Widerspruch empfohlen'}${chance != null ? ` (${chance}% Chance)` : ''}`)
    }
  }

  lines.push('---')
  return lines.join('\n')
}

/**
 * Hauptfunktion: Baut den Ablehnungsmuster-Kontext-Block.
 *
 * @param userId           ID des aktuellen Users (für persönliche History)
 * @param kassenabrId      ID der aktuellen Kassenabrechnung (wird ausgeschlossen)
 * @param ablehnungsgruende Erkannte Ablehnungsgründe aus der Kassenbescheid-Analyse
 */
export async function getRejectionPatternContext(
  userId: string,
  kassenabrId: string,
  ablehnungsgruende: string[]
): Promise<string> {
  if (ablehnungsgruende.length === 0) return ''

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const kategorien = extractKategorien(ablehnungsgruende)

    // Beide Queries parallel
    const [crossUserResult, userHistoryResult] = await Promise.all([

      // 1. Cross-User-Muster nach Kategorie, sortiert nach Häufigkeit
      supabase
        .from('pkv_ablehnungsmuster')
        .select(`
          muster_key, kategorie, ablehnungsgrund_normalisiert, goae_ziffer,
          anzahl_ablehnungen, summe_betrag_abgelehnt,
          anzahl_widersprueche, anzahl_widerspruch_erfolg,
          beispiel_begruendungen, erfolgreiche_argumente
        `)
        .in('kategorie', kategorien)
        .order('anzahl_ablehnungen', { ascending: false })
        .limit(5),

      // 2. Eigene History: letzte 24 Monate, selbe User-ID, nicht der aktuelle Bescheid
      supabase
        .from('kassenabrechnungen')
        .select('bescheiddatum, betrag_abgelehnt, kasse_analyse')
        .eq('user_id', userId)
        .neq('id', kassenabrId)
        .not('kasse_analyse', 'is', null)
        .gte('bescheiddatum', new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('bescheiddatum', { ascending: false })
        .limit(20),
    ])

    const crossUserMuster  = (crossUserResult.data  ?? []) as AblehnungsMuster[]
    const userHistory      = (userHistoryResult.data ?? []) as UserHistoryItem[]

    const crossUserBlock = formatCrossUserMuster(crossUserMuster)
    const userHistBlock  = formatUserHistory(userHistory, ablehnungsgruende)

    const parts = [userHistBlock, crossUserBlock].filter(Boolean)
    return parts.join('\n')

  } catch {
    return ''
  }
}
