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
// Fields available after migration 023 (vorsorge_link_custom)
const ALLOWED_FIELDS_023 = [...ALLOWED_FIELDS_021, 'vorsorge_link_custom']

// Columns added in each migration — for graceful progressive fallback
const MIGRATION_COLUMNS: Record<string, string[]> = {
  '021': ['geschlecht'],
  '023': ['vorsorge_link_custom'],
}

function stripUnknownColumns(updates: Record<string, unknown>, errorMsg: string): Record<string, unknown> {
  const stripped = { ...updates }
  for (const cols of Object.values(MIGRATION_COLUMNS)) {
    for (const col of cols) {
      if (errorMsg.includes(col)) delete stripped[col]
    }
  }
  return stripped
}

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try with all columns; progressively fall back if a migration hasn't run yet
  const fullSelect = 'full_name, phone_whatsapp, pkv_name, pkv_nummer, pkv_tarif, pkv_seit, benachrichtigung_whatsapp, geschlecht, vorsorge_link_custom'
  let { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select(fullSelect)
    .eq('id', user.id)
    .single()

  // Fallback: strip unknown column from select if migration is pending
  if (error?.message) {
    const unknownCol = Object.values(MIGRATION_COLUMNS).flat().find(c => error!.message.includes(c))
    if (unknownCol) {
      const fallbackSelect = fullSelect.split(', ').filter(c => c !== unknownCol).join(', ')
      ;({ data, error } = await getSupabaseAdmin()
        .from('profiles')
        .select(fallbackSelect)
        .eq('id', user.id)
        .single())
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data, email: user.email })
}

export async function PATCH(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Build updates from whitelisted fields (all migrations)
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS_023) {
    if (key in body) updates[key] = body[key]
  }

  const { error } = await getSupabaseAdmin()
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error?.message) {
    const unknownCol = Object.values(MIGRATION_COLUMNS).flat().find(c => error.message.includes(c))
    if (unknownCol) {
      // Retry without columns from pending migrations
      const safeUpdates = stripUnknownColumns(updates, error.message)
      const { error: error2 } = await getSupabaseAdmin()
        .from('profiles')
        .update(safeUpdates)
        .eq('id', user.id)
      if (error2) return NextResponse.json({ error: error2.message }, { status: 500 })
      return NextResponse.json({ success: true, note: `${unknownCol} skipped — migration pending` })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
