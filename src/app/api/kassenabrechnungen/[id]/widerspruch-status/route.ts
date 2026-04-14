import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const VALID_STATUSES = ['keiner', 'erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  // RLS on kassenabrechnungen ensures user can only update their own rows.
  // We just verify the row exists for this user before updating.
  const { data: ka } = await supabase
    .from('kassenabrechnungen')
    .select('id')
    .eq('id', id)
    .single()

  if (!ka) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = { widerspruch_status: status }
  if (status === 'gesendet') {
    updates.widerspruch_gesendet_am = new Date().toISOString()
  }

  const { error: updateErr } = await supabase
    .from('kassenabrechnungen')
    .update(updates)
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, status })
}
