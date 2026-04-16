/**
 * PATCH /api/kassenabrechnungen/[id]/widerspruch-status
 * Updates widerspruch_status to any valid value.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const VALID = ['keiner', 'erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = await req.json()
  if (!VALID.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: kasse } = await admin
    .from('kassenabrechnungen').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!kasse) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await admin.from('kassenabrechnungen').update({ widerspruch_status: status }).eq('id', id)
  return NextResponse.json({ widerspruch_status: status })
}
