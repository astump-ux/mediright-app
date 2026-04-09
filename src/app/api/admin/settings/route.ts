import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET — fetch all settings
export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from('app_settings')
    .select('*')
    .order('category')
    .order('label')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — update a single setting by key
export async function PATCH(request: NextRequest) {
  // Auth check
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key, value } = await request.json()
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('app_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
