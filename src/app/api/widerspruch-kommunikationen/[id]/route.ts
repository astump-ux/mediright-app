/**
 * DELETE /api/widerspruch-kommunikationen/[id]
 *
 * Löscht eine einzelne Kommunikationsnachricht aus dem Widerspruch-Thread.
 * Ownership wird via RLS sichergestellt (User-Client prüft ob der Datensatz
 * dem eingeloggten User gehört, Admin-Client führt das Delete durch).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID fehlt' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership prüfen via User-Client (RLS)
  const { data: existing, error: fetchError } = await supabase
    .from('widerspruch_kommunikationen')
    .select('id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Nicht gefunden oder kein Zugriff' }, { status: 404 })
  }

  // Delete via Admin-Client
  const admin = getSupabaseAdmin()
  const { error: deleteError } = await admin
    .from('widerspruch_kommunikationen')
    .delete()
    .eq('id', id)

  if (deleteError) {
    console.error('[widerspruch-kommunikationen DELETE]', deleteError)
    return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
