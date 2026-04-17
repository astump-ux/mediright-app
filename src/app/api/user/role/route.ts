/**
 * GET /api/user/role
 * Returns the current authenticated user's role ('user' | 'admin').
 * Used by Header and protected pages to gate admin-only features.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ role: 'user' })

  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ role: (data as { role?: string } | null)?.role ?? 'user' })
}
