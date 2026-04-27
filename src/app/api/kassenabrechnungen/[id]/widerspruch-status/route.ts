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

  // Ownership check via RLS — use the USER client so Postgres RLS enforces access.
  // This is more reliable than a manual user_id comparison, which can fail when
  // the UUID is stored in a slightly different format or under a different auth context.
  const { data: owned, error: lookupErr } = await supabase
    .from('kassenabrechnungen')
    .select('id, widerspruch_status')
    .eq('id', id)
    .maybeSingle()

  if (lookupErr) {
    console.error('[widerspruch-status PATCH] lookup error:', lookupErr.message, { id, userId: user.id })
    return NextResponse.json({ error: 'DB lookup error' }, { status: 500 })
  }
  if (!owned) {
    console.error('[widerspruch-status PATCH] not found or not owned:', { id, userId: user.id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Use admin client for the actual write (service role bypasses RLS write policies)
  const admin = getSupabaseAdmin()
  const update: Record<string, string> = {}
  if (status)      update.widerspruch_status      = status
  if (arzt_status) update.arzt_reklamation_status = arzt_status

  const { error: updateErr } = await admin
    .from('kassenabrechnungen').update(update).eq('id', id)

  if (updateErr) {
    console.error('[widerspruch-status PATCH] update error:', updateErr.message, { id, update })
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  console.log('[widerspruch-status PATCH] success:', { id, update, prev: owned.widerspruch_status })
  return NextResponse.json({ widerspruch_status: status, arzt_reklamation_status: arzt_status })
}
