import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Helper: get authenticated user from session cookie
async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Fields available after migration 021 (geschlecht)
const ALLOWED_FIELDS_BASE = [
  'full_name',
  'phone_whatsapp',
  'pkv_name',
  'pkv_nummer',
  'pkv_tarif',
  'pkv_seit',
  'benachrichtigung_whatsapp',
]
const ALLOWED_FIELDS_021 = [...ALLOWED_FIELDS_BASE, 'geschlecht']

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try with geschlecht (requires migration 021); fall back gracefully if column doesn't exist
  let { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('full_name, phone_whatsapp, pkv_name, pkv_nummer, pkv_tarif, pkv_seit, benachrichtigung_whatsapp, geschlecht')
    .eq('id', user.id)
    .single()

  if (error?.message?.includes('geschlecht')) {
    // Migration 021 not yet run — retry without geschlecht column
    ;({ data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('full_name, phone_whatsapp, pkv_name, pkv_nummer, pkv_tarif, pkv_seit, benachrichtigung_whatsapp')
      .eq('id', user.id)
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data, email: user.email })
}

export async function PATCH(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Build updates from whitelisted fields (include geschlecht if present)
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS_021) {
    if (key in body) updates[key] = body[key]
  }

  const { error } = await getSupabaseAdmin()
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error?.message?.includes('geschlecht')) {
    // Migration 021 not yet run — retry without geschlecht
    const safeUpdates: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS_BASE) {
      if (key in updates) safeUpdates[key] = updates[key]
    }
    const { error: error2 } = await getSupabaseAdmin()
      .from('profiles')
      .update(safeUpdates)
      .eq('id', user.id)
    if (error2) return NextResponse.json({ error: error2.message }, { status: 500 })
    return NextResponse.json({ success: true, note: 'geschlecht skipped — migration 021 pending' })
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
