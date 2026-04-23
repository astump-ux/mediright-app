/**
 * POST /api/onboarding/complete
 *
 * Saves the user's profile data from the onboarding wizard and marks
 * onboarding as complete. Called by the final step of /onboarding.
 *
 * Body (all optional except completing the wizard):
 *   { full_name, pkv_name, pkv_tarif, phone_whatsapp }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { full_name, pkv_name, pkv_tarif, phone_whatsapp } = body as Record<string, string>

  const admin = getSupabaseAdmin()

  // Build update payload — only include non-empty values
  const updates: Record<string, unknown> = {
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  }
  if (full_name?.trim())       updates.full_name       = full_name.trim()
  if (pkv_name?.trim())        updates.pkv_name        = pkv_name.trim()
  if (pkv_tarif?.trim())       updates.pkv_tarif       = pkv_tarif.trim()
  if (phone_whatsapp?.trim())  updates.phone_whatsapp  = phone_whatsapp.replace(/\s+/g, '')

  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/complete] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
