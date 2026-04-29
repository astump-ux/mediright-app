import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { matchVorgangToKasse } from '@/lib/matching'
import type { KasseRechnungGruppe } from '@/lib/goae-analyzer'

/**
 * POST /api/vorgaenge/rematch
 *
 * Step 1 — Purge stale matchedVorgangId references from all kassenbescheid
 *           rechnungen groups where the referenced vorgang no longer exists
 *           for this user.  This unblocks slots that were "taken" by deleted
 *           or orphaned vorgaenge.
 *
 * Step 2 — Re-run matchVorgangToKasse for all analysed vorgaenge that still
 *           have no kassenabrechnung_id.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // ── Step 1: Clear stale matchedVorgangId references ──────────────────────
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: kassenabrechnungen } = await admin
    .from('kassenabrechnungen')
    .select('id, kasse_analyse')
    .eq('user_id', user.id)
    .gte('created_at', sixMonthsAgo.toISOString())

  // Collect all referenced vorgangIds across all kassenbescheid groups
  const referencedIds = new Set<string>()
  for (const kasse of kassenabrechnungen ?? []) {
    const rechnungen: KasseRechnungGruppe[] = kasse.kasse_analyse?.rechnungen ?? []
    for (const gruppe of rechnungen) {
      if (gruppe.matchedVorgangId) referencedIds.add(gruppe.matchedVorgangId)
    }
  }

  // Find which of those still exist for this user
  const existingIds = new Set<string>()
  if (referencedIds.size > 0) {
    const { data: existing } = await admin
      .from('vorgaenge')
      .select('id')
      .eq('user_id', user.id)
      .in('id', [...referencedIds])
    for (const r of existing ?? []) existingIds.add(r.id)
  }

  // For each kassenbescheid, null out stale references and persist
  let purged = 0
  for (const kasse of kassenabrechnungen ?? []) {
    const rechnungen: KasseRechnungGruppe[] = kasse.kasse_analyse?.rechnungen ?? []
    let dirty = false
    const cleaned = rechnungen.map(gruppe => {
      if (gruppe.matchedVorgangId && !existingIds.has(gruppe.matchedVorgangId)) {
        console.log(`[rematch] Purging stale matchedVorgangId ${gruppe.matchedVorgangId} from kasse ${kasse.id}`)
        dirty = true
        purged++
        return { ...gruppe, matchedVorgangId: null }
      }
      return gruppe
    })
    if (dirty) {
      await admin
        .from('kassenabrechnungen')
        .update({
          kasse_analyse: { ...kasse.kasse_analyse, rechnungen: cleaned },
          updated_at: new Date().toISOString(),
        })
        .eq('id', kasse.id)
    }
  }

  console.log(`[rematch] Purged ${purged} stale reference(s)`)

  // ── Step 2: Re-run matching for all still-unmatched vorgaenge ────────────
  const { data: vorgaenge, error } = await admin
    .from('vorgaenge')
    .select('id, arzt_name, rechnungsdatum, betrag_gesamt')
    .eq('user_id', user.id)
    .is('kassenabrechnung_id', null)
    .not('arzt_name', 'is', null)
    .neq('status', 'offen')

  if (error) {
    console.error('[rematch] DB error:', error)
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  if (!vorgaenge?.length) {
    return NextResponse.json({
      matched: 0,
      total: 0,
      purged,
      message: purged > 0
        ? `${purged} veraltete Referenz(en) bereinigt, aber keine unverknüpften Rechnungen gefunden.`
        : 'Keine unverknüpften Rechnungen gefunden.',
    })
  }

  console.log(`[rematch] Checking ${vorgaenge.length} unmatched vorgaenge for user ${user.id}`)

  let matched = 0
  for (const v of vorgaenge) {
    await matchVorgangToKasse(
      v.id,
      user.id,
      v.arzt_name as string | null,
      v.rechnungsdatum as string | null,
      v.betrag_gesamt as number | null,
    )
    const { data: check } = await admin
      .from('vorgaenge')
      .select('kassenabrechnung_id')
      .eq('id', v.id)
      .single()
    if (check?.kassenabrechnung_id) matched++
  }

  const total = vorgaenge.length
  const message = matched > 0
    ? `${matched} von ${total} Rechnung${total !== 1 ? 'en' : ''} erfolgreich einem Kassenbescheid zugeordnet.`
    : 'Keine neuen Zuordnungen — Kassenbescheid noch nicht hochgeladen?'

  console.log(`[rematch] Result: ${matched}/${total} matched, ${purged} purged`)
  return NextResponse.json({ matched, total, purged, message })
}
