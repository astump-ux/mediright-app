/**
 * GET /api/debug/matching
 *
 * Returns a full picture of what matchVorgangToKasse sees for the current user:
 * - all analysed, unmatched vorgaenge
 * - all kassenabrechnungen (last 6 months) with their rechnungen[] groups
 * - matchScore for every (vorgang, gruppe) pair
 *
 * DEVELOPMENT ONLY — remove before production hardening.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { matchScore } from '@/lib/matching'
import type { KasseRechnungGruppe } from '@/lib/goae-analyzer'
import type { VorgangMatchRow } from '@/lib/matching'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // All vorgaenge — matched and unmatched — for full picture
  const { data: vorgaenge } = await admin
    .from('vorgaenge')
    .select('id, arzt_name, rechnungsdatum, rechnungsnummer, betrag_gesamt, kassenabrechnung_id, kasse_match_status, status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // All kassenabrechnungen (last 6 months)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const { data: kassenabrechnungen } = await admin
    .from('kassenabrechnungen')
    .select('id, created_at, kasse_analyse')
    .eq('user_id', user.id)
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: false })

  // Compute matchScores for all unmatched vorgaenge × all kassenbescheid groups
  const unmatchedVorgaenge = (vorgaenge ?? []).filter(v => !v.kassenabrechnung_id && v.arzt_name)
  const scores: Record<string, unknown>[] = []

  for (const v of unmatchedVorgaenge) {
    const vRow: VorgangMatchRow = {
      id: v.id,
      arzt_name: v.arzt_name,
      rechnungsdatum: v.rechnungsdatum,
      betrag_gesamt: v.betrag_gesamt,
      kassenabrechnung_id: v.kassenabrechnung_id,
      kasse_match_status: v.kasse_match_status,
    }
    for (const kasse of kassenabrechnungen ?? []) {
      const rechnungen: KasseRechnungGruppe[] = kasse.kasse_analyse?.rechnungen ?? []
      for (let idx = 0; idx < rechnungen.length; idx++) {
        const gruppe = rechnungen[idx]
        const score = matchScore(vRow, gruppe)
        scores.push({
          vorgang_id:      v.id,
          vorgang_arzt:    v.arzt_name,
          vorgang_datum:   v.rechnungsdatum,
          vorgang_betrag:  v.betrag_gesamt,
          kasse_id:        kasse.id,
          gruppe_idx:      idx,
          gruppe_arzt:     gruppe.arztName,
          gruppe_datum:    gruppe.rechnungsdatum,
          gruppe_betrag:   gruppe.betragEingereicht,
          gruppe_matched:  gruppe.matchedVorgangId ?? null,
          score:           Math.round(score * 1000) / 1000,
          threshold_ok:    score > 0.45,
        })
      }
    }
  }

  return NextResponse.json({
    user_id: user.id,
    vorgaenge: vorgaenge ?? [],
    kassenabrechnungen: (kassenabrechnungen ?? []).map(k => ({
      id: k.id,
      created_at: k.created_at,
      rechnungen_count: (k.kasse_analyse?.rechnungen as unknown[])?.length ?? 0,
      rechnungen: k.kasse_analyse?.rechnungen ?? [],
    })),
    scores_unmatched: scores,
    threshold: 0.45,
  })
}
