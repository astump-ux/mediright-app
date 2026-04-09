import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: vorgang } = await getSupabaseAdmin()
    .from('vorgaenge')
    .select('kasse_pdf_storage_path, user_id')
    .eq('id', id)
    .single()

  if (!vorgang || vorgang.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!vorgang.kasse_pdf_storage_path) {
    return NextResponse.json({ error: 'No Kassenabrechnung available' }, { status: 404 })
  }

  const { data, error } = await getSupabaseAdmin()
    .storage
    .from('rechnungen')
    .createSignedUrl(vorgang.kasse_pdf_storage_path, 60)

  if (error || !data) {
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
