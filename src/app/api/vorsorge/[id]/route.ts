/**
 * PATCH /api/vorsorge/[id]
 *
 * Updates the manually-entered last examination date for a Vorsorge item.
 * Body: { letzte_untersuchung_datum: "YYYY-MM-DD" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { letzte_untersuchung_datum } = body as { letzte_untersuchung_datum?: string }

  if (!letzte_untersuchung_datum) {
    return NextResponse.json({ error: 'letzte_untersuchung_datum required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_vorsorge_config')
    .update({ letzte_untersuchung_datum })
    .eq('id', id)
    .eq('user_id', user.id)  // ensure ownership

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
