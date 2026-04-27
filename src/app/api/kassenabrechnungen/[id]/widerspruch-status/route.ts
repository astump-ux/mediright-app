/**
 * PATCH /api/kassenabrechnungen/[id]/widerspruch-status
 *
 * Body variants:
 *   { "status": "gesendet" }                    → updates widerspruch_status (Kassenwiderspruch track)
 *   { "arzt_status": "gesendet" }               → updates arzt_reklamation_status (Arztreklamation track)
 *   { "status": "gesendet", "arzt_status": "gesendet" }  → updates both at once
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const VALID_KASSE = ['keiner', 'erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt']
const VALID_ARZT  = ['keiner', 'erstellt', 'gesendet']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { status, arzt_status } = body as { status?: string; arzt_status?: string }

  if (!status && !arzt_status)
    return NextResponse.json({ error: 'Provide status or arzt_status' }, { status: 400 })
  if (status && !VALID_KASSE.includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  if (arzt_status && !VALID_ARZT.includes(arzt_status))
    return NextResponse.json({ error: 'Invalid arzt_status' }, { status: 400 })

  const admin = getSupabaseAdmin()

  // Two-step ownership check (same pattern as widerspruch-kommunikationen POST)
  const { data: kasse, error: lookupErr } = await admin
    .from('kassenabrechnungen').select('id, user_id, widerspruch_status').eq('id', id).maybeSingle()

  if (lookupErr) {
    console.error('[widerspruch-status PATCH] lookup error:', lookupErr.message, { id })
    return NextResponse.json({ error: 'DB lookup error' }, { status: 500 })
  }
  if (!kasse) {
    console.error('[widerspruch-status PATCH] record not found:', { id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (kasse.user_id !== user.id) {
    console.error('[widerspruch-status PATCH] ownership mismatch:', { stored: kasse.user_id, requesting: user.id, id })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const update: Record<string, string> = {}
  if (status)      update.widerspruch_status      = status
  if (arzt_status) update.arzt_reklamation_status = arzt_status

  const { error: updateErr } = await admin
    .from('kassenabrechnungen').update(update).eq('id', id)

  if (updateErr) {
    console.error('[widerspruch-status PATCH] update error:', updateErr.message, { id, update })
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  console.log('[widerspruch-status PATCH] success:', { id, update, prev: kasse.widerspruch_status })
  return NextResponse.json({ widerspruch_status: status, arzt_reklamation_status: arzt_status })
}
