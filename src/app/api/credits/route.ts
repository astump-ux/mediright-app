/**
 * GET /api/credits
 * Returns the authenticated user's current credit status.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUserCreditStatus } from '@/lib/credits'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const status = await getUserCreditStatus(user.id)
  return NextResponse.json(status)
}
