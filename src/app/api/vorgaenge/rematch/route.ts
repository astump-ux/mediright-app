import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { matchVorgangToKasse } from '@/lib/matching'

/**
 * POST /api/vorgaenge/rematch
 *
 * Re-runs fuzzy matching for all analysed Arztrechnungen that have
 * no kassenabrechnung_id yet.  Useful after matching-logic improvements
 * or when a Kassenbescheid was uploaded before the corresponding Arztrechnung.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // All analysed, still-unmatched vorgaenge for this user
  const { data: vorgaenge, error } = await getSupabaseAdmin()
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
      message: 'Keine unverknüpften Rechnungen gefunden.',
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
    // Check whether this vorgang got matched
    const { data: check } = await getSupabaseAdmin()
      .from('vorgaenge')
      .select('kassenabrechnung_id')
      .eq('id', v.id)
      .single()
    if (check?.kassenabrechnung_id) matched++
  }

  const total = vorgaenge.length
  const message = matched > 0
    ? `${matched} von ${total} Rechnung${total !== 1 ? 'en' : ''} erfolgreich einem Kassenbescheid zugeordnet.`
    : 'Keine neuen Zuordnungen gefunden — Kassenbescheid noch nicht hochgeladen?'

  console.log(`[rematch] Result: ${matched}/${total} matched`)
  return NextResponse.json({ matched, total, message })
}
