import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth check
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the storage path (verify ownership)
  const { data: vorgang } = await getSupabaseAdmin()
    .from('vorgaenge')
    .select('pdf_storage_path, user_id')
    .eq('id', id)
    .single()

  if (!vorgang || vorgang.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!vorgang.pdf_storage_path) {
    return NextResponse.json({ error: 'No PDF available' }, { status: 404 })
  }

  // Generate signed URL (valid for 60 seconds)
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from('rechnungen')
    .createSignedUrl(vorgang.pdf_storage_path, 60)

  if (error || !data) {
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
