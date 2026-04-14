import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VALID_STATUSES = ['keiner', 'erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth via user client (cookie-based)
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { status } = body as { status?: string }

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  // Use admin client for the write — verify ownership via user_id column
  const admin = getSupabaseAdmin()

  const { data: ka, error: lookupErr } = await admin
    .from('kassenabrechnungen')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (lookupErr || !ka) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (ka.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates: Record<string, unknown> = { widerspruch_status: status }
  if (status === 'gesendet') {
    updates.widerspruch_gesendet_am = new Date().toISOString()
  }

  const { error: updateErr } = await admin
    .from('kassenabrechnungen')
    .update(updates)
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, status })
}
