import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function assertAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = getSupabaseAdmin()
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

// PATCH — grant credits OR toggle Pro subscription
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const body = await request.json() as {
    action: 'add_credits' | 'set_subscription'
    amount?: number
    reason?: string
    subscription_status?: 'free' | 'pro'
    subscription_expires_at?: string | null
  }

  const admin = getSupabaseAdmin()

  if (body.action === 'add_credits') {
    const amount = Number(body.amount)
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    const { data, error } = await admin.rpc('increment_user_credits', {
      p_user_id: id,
      p_amount:  amount,
      p_reason:  body.reason ?? 'admin_grant',
      p_metadata: { granted_by: caller.id, note: body.reason ?? 'admin_grant' },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, new_balance: data })
  }

  if (body.action === 'set_subscription') {
    const status = body.subscription_status
    if (status !== 'free' && status !== 'pro') {
      return NextResponse.json({ error: 'Invalid subscription_status' }, { status: 400 })
    }

    const expires = status === 'pro'
      ? (body.subscription_expires_at ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString())
      : null

    const { error } = await admin
      .from('user_credits')
      .update({ subscription_status: status, subscription_expires_at: expires, updated_at: new Date().toISOString() })
      .eq('user_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, subscription_status: status, subscription_expires_at: expires })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
