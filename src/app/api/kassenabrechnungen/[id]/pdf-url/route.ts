import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/** GET /api/kassenabrechnungen/[id]/pdf-url
 *  Returns a short-lived signed URL for the Kassenbescheid PDF.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // Verify ownership and fetch storage path
  const { data, error } = await admin
    .from('kassenabrechnungen')
    .select('pdf_storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data?.pdf_storage_path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: signed, error: signErr } = await admin.storage
    .from('rechnungen')
    .createSignedUrl(data.pdf_storage_path, 300) // 5-minute TTL

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not create signed URL' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
