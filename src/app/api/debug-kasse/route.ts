import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// TEMPORARY DEBUG ROUTE — remove after debugging
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // Fetch all kassenabrechnungen with kasse_analyse
  const { data, error } = await admin
    .from('kassenabrechnungen')
    .select('id, bescheiddatum, kasse_analyse')
    .eq('user_id', user.id)
    .order('bescheiddatum', { ascending: false })

  if (error) return NextResponse.json({ error }, { status: 500 })

  // Return raw kasse_analyse per Kassenbescheid
  const result = (data ?? []).map(k => ({
    id:           k.id,
    bescheiddatum: k.bescheiddatum,
    rechnungen:   (k.kasse_analyse as any)?.rechnungen ?? [],
    positionen:   (k.kasse_analyse as any)?.positionen ?? [],
  }))

  return NextResponse.json(result, { status: 200 })
}
