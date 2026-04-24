import { NextResponse } from 'next/server'
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

export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = getSupabaseAdmin()

  // 1. All auth users
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const userIds = authData.users.map(u => u.id)

  // 2. Profiles
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .in('id', userIds)

  // 3. Credits
  const { data: credits } = await admin
    .from('user_credits')
    .select('user_id, balance, free_analyses_used, subscription_status, subscription_expires_at, stripe_customer_id, updated_at')
    .in('user_id', userIds)

  // 4. Usage counts (analyses run) — count credit_transactions with negative amount
  const { data: usageCounts } = await admin
    .from('credit_transactions')
    .select('user_id')
    .in('user_id', userIds)
    .lt('amount', 0)

  const usageByUser: Record<string, number> = {}
  ;(usageCounts ?? []).forEach(r => {
    usageByUser[r.user_id] = (usageByUser[r.user_id] ?? 0) + 1
  })

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  const creditMap  = Object.fromEntries((credits ?? []).map(c => [c.user_id, c]))

  const users = authData.users.map(u => ({
    id:                    u.id,
    email:                 u.email ?? '',
    full_name:             profileMap[u.id]?.full_name ?? '',
    role:                  profileMap[u.id]?.role ?? 'user',
    created_at:            u.created_at,
    last_sign_in_at:       u.last_sign_in_at ?? null,
    balance:               creditMap[u.id]?.balance ?? 0,
    free_analyses_used:    creditMap[u.id]?.free_analyses_used ?? 0,
    subscription_status:   creditMap[u.id]?.subscription_status ?? 'free',
    subscription_expires_at: creditMap[u.id]?.subscription_expires_at ?? null,
    stripe_customer_id:    creditMap[u.id]?.stripe_customer_id ?? null,
    analyses_run:          usageByUser[u.id] ?? 0,
  }))

  // Sort: most recently signed in first
  users.sort((a, b) => {
    const ta = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
    const tb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
    return tb - ta
  })

  return NextResponse.json(users)
}
