/**
 * Fuzzy matching between Arztrechnungen (vorgaenge) and Kassenbescheid positions
 * (kassenabrechnungen.analyse.rechnungen).
 *
 * Match score 0–1, threshold 0.5 to accept.
 */

import { getSupabaseAdmin } from './supabase-admin'
import type { KasseRechnungGruppe } from './goae-analyzer'

export interface VorgangMatchRow {
  id: string
  arzt_name: string | null
  rechnungsdatum: string | null
  betrag_gesamt: number | null
  kassenabrechnung_id: string | null
  kasse_match_status: string | null
}

// ── String similarity (word overlap) ─────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/dr\.?\s*/g, '')
    .replace(/prof\.?\s*/g, '')
    .replace(/[^a-zäöüß0-9\s]/g, '')
    .trim()
}

function wordOverlap(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1.0
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const wa = new Set(na.split(/\s+/).filter(w => w.length > 2))
  const wb = new Set(nb.split(/\s+/).filter(w => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return 0
  let common = 0
  for (const w of wa) if (wb.has(w)) common++
  return common / Math.max(wa.size, wb.size)
}

// ── Date proximity ─────────────────────────────────────────────────────────────

function dateDiff(a: string | null, b: string | null): number {
  if (!a || !b) return 999
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (isNaN(da) || isNaN(db)) return 999
  return Math.abs(da - db) / (1000 * 60 * 60 * 24)
}

// ── Amount similarity ──────────────────────────────────────────────────────────

function amountSim(a: number | null, b: number | null): number {
  if (!a || !b || a === 0 || b === 0) return 0.5 // neutral if unknown
  const ratio = Math.min(a, b) / Math.max(a, b)
  return ratio // 1.0 = identical, 0.9 = within 10%, etc.
}

// ── Combined match score ───────────────────────────────────────────────────────

export function matchScore(
  vorgang: VorgangMatchRow,
  gruppe: KasseRechnungGruppe
): number {
  let score = 0

  // Arzt name — weight 50%
  // Note: Kassenbescheid and Arztrechnung often use different name formats
  // (e.g. "Dr. Müller" vs "Gemeinschaftspraxis Müller & Partner"), so name
  // similarity can be low even for the same doctor. Date + amount are more
  // reliable signals for the same invoice.
  const nameSim = wordOverlap(vorgang.arzt_name ?? '', gruppe.arztName ?? '')
  score += nameSim * 0.5

  // Date proximity — weight 30%
  const days = dateDiff(vorgang.rechnungsdatum, gruppe.rechnungsdatum)
  if (days <= 7)        score += 0.30
  else if (days <= 30)  score += 0.22
  else if (days <= 60)  score += 0.14
  else if (days <= 90)  score += 0.07

  // Amount similarity — weight 20%
  const aSim = amountSim(vorgang.betrag_gesamt, gruppe.betragEingereicht)
  score += aSim * 0.2

  // Short-circuit: wenn Betrag sehr nah (≥95%) UND Datum ≤14 Tage → immer matchen,
  // auch wenn Arztnamen unterschiedlich formatiert sind (häufigster Realfall).
  if (aSim >= 0.95 && days <= 14) score = Math.max(score, 0.60)

  return score
}

// Threshold deliberately below 0.50 so that a perfect date+amount match (0.50)
// always succeeds even when name similarity is zero.
export const MATCH_THRESHOLD = 0.45

// ── Run matching for a new Kassenabrechnung ────────────────────────────────────

/**
 * After a Kassenabrechnung is analysed, try to match its rechnungen[] groups
 * to existing vorgaenge for the user.
 * Returns the updated rechnungen array with matchedVorgangId populated.
 */
export async function matchKasseToVorgaenge(
  kasseId: string,
  userId: string,
  rechnungen: KasseRechnungGruppe[]
): Promise<KasseRechnungGruppe[]> {
  if (rechnungen.length === 0) return rechnungen

  // Load analysed Arztrechnung vorgaenge for this user:
  // - must have arzt_name (= has been analysed, not a placeholder)
  // - must have status != 'offen' (= analysis completed)
  // - skip vorgaenge already matched to a different kasse
  const { data: vorgaenge } = await getSupabaseAdmin()
    .from('vorgaenge')
    .select('id, arzt_name, rechnungsdatum, betrag_gesamt, kassenabrechnung_id, kasse_match_status')
    .eq('user_id', userId)
    .not('arzt_name', 'is', null)   // only analysed Arztrechnungen
    .neq('status', 'offen')         // exclude placeholders

  console.log('[matching] Candidate vorgaenge for kasse', kasseId, ':', vorgaenge?.length ?? 0)
  if (!vorgaenge?.length) return rechnungen

  // Greedy matching: highest score first, each vorgang matched at most once
  const updated = rechnungen.map(g => ({ ...g }))
  const usedVorgangIds = new Set<string>()

  // Sort groups so we process highest-confidence matches first
  const indexedGroups = updated.map((g, i) => ({ g, i }))

  for (const { g, i } of indexedGroups) {
    let bestScore = MATCH_THRESHOLD
    let bestVorgang: VorgangMatchRow | null = null

    for (const v of vorgaenge) {
      if (usedVorgangIds.has(v.id)) continue
      // Skip vorgaenge already matched to a DIFFERENT kassenabrechnung
      if (v.kassenabrechnung_id && v.kassenabrechnung_id !== kasseId) continue

      const score = matchScore(v as VorgangMatchRow, g)
      if (score > bestScore) {
        bestScore = score
        bestVorgang = v as VorgangMatchRow
      }
    }

    if (bestVorgang) {
      updated[i].matchedVorgangId = bestVorgang.id
      usedVorgangIds.add(bestVorgang.id)
      console.log(
        `[matching] Matched gruppe "${g.arztName}" → vorgang ${bestVorgang.id} (score ${bestScore.toFixed(2)})`
      )
    } else {
      updated[i].matchedVorgangId = null
      console.log(`[matching] No match for gruppe "${g.arztName}" (best score < ${MATCH_THRESHOLD})`)
    }
  }

  // Persist matches: update vorgaenge with kassenabrechnung_id + status
  const matchUpdates = updated
    .filter(g => g.matchedVorgangId)
    .map(g =>
      getSupabaseAdmin()
        .from('vorgaenge')
        .update({
          kassenabrechnung_id: kasseId,
          kasse_match_status: 'matched',
          updated_at: new Date().toISOString(),
        })
        .eq('id', g.matchedVorgangId!)
    )

  await Promise.all(matchUpdates)
  return updated
}

// ── Run matching for a new Arztrechnung ───────────────────────────────────────

/**
 * After an Arztrechnung is analysed, check if any existing Kassenbescheid
 * has an unmatched position that fits this vorgang.
 */
export async function matchVorgangToKasse(
  vorgangId: string,
  userId: string,
  arztName: string | null,
  rechnungsdatum: string | null,
  betragGesamt: number | null
): Promise<void> {
  const vorgang: VorgangMatchRow = {
    id: vorgangId,
    arzt_name: arztName,
    rechnungsdatum,
    betrag_gesamt: betragGesamt,
    kassenabrechnung_id: null,
    kasse_match_status: null,
  }

  // Load recent kassenabrechnungen for this user (last 6 months)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: kassenabrechnungen } = await getSupabaseAdmin()
    .from('kassenabrechnungen')
    .select('id, kasse_analyse')
    .eq('user_id', userId)
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: false })

  console.log('[matching] matchVorgangToKasse: arzt=', arztName, 'datum=', rechnungsdatum, 'betrag=', betragGesamt)
  console.log('[matching] Open kassenabrechnungen to check:', kassenabrechnungen?.length ?? 0)

  if (!kassenabrechnungen?.length) return

  let bestScore = MATCH_THRESHOLD
  let bestKasseId: string | null = null
  let bestGruppeIdx: number = -1

  for (const kasse of kassenabrechnungen) {
    const rechnungen: KasseRechnungGruppe[] = kasse.kasse_analyse?.rechnungen ?? []
    console.log(`[matching]   kasse ${kasse.id}: ${rechnungen.length} rechnungen groups`)
    rechnungen.forEach((gruppe, idx) => {
      if (gruppe.matchedVorgangId) return // already matched
      const score = matchScore(vorgang, gruppe)
      console.log(`[matching]     gruppe[${idx}] "${gruppe.arztName}" datum=${gruppe.rechnungsdatum} betrag=${gruppe.betragEingereicht} → score ${score.toFixed(3)}`)
      if (score > bestScore) {
        bestScore = score
        bestKasseId = kasse.id
        bestGruppeIdx = idx
      }
    })
  }

  if (!bestKasseId || bestGruppeIdx < 0) {
    console.log(`[matching] Arztrechnung ${vorgangId}: no open kasse position found (threshold ${MATCH_THRESHOLD})`)
    return
  }

  console.log(`[matching] Arztrechnung ${vorgangId} → kasse ${bestKasseId} gruppe ${bestGruppeIdx} (score ${bestScore.toFixed(2)})`)

  // Update the kassenabrechnung's kasse_analyse JSON with the new matchedVorgangId
  const { data: kasseRecord } = await getSupabaseAdmin()
    .from('kassenabrechnungen')
    .select('kasse_analyse')
    .eq('id', bestKasseId)
    .single()

  if (kasseRecord?.kasse_analyse) {
    const updatedAnalyse = { ...kasseRecord.kasse_analyse }
    if (Array.isArray(updatedAnalyse.rechnungen)) {
      updatedAnalyse.rechnungen[bestGruppeIdx] = {
        ...updatedAnalyse.rechnungen[bestGruppeIdx],
        matchedVorgangId: vorgangId,
      }
    }
    await getSupabaseAdmin()
      .from('kassenabrechnungen')
      .update({ kasse_analyse: updatedAnalyse, updated_at: new Date().toISOString() })
      .eq('id', bestKasseId)
  }

  // Link vorgang to kassenabrechnung
  await getSupabaseAdmin()
    .from('vorgaenge')
    .update({
      kassenabrechnung_id: bestKasseId,
      kasse_match_status: 'matched',
      updated_at: new Date().toISOString(),
    })
    .eq('id', vorgangId)
}
