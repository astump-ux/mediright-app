/**
 * PATCH /api/kassenabrechnungen/[id]/widerspruch-starten
 *
 * Marks a Kassenbescheid as an active Widerspruchsfall (status = 'erstellt')
 * the moment the user first opens a CTA panel (Arzt or Kasse).
 * Only transitions from 'keiner' → 'erstellt'; never downgrades an active case.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  // Verify ownership and read current status + kasse_analyse
  const { data: kasse } = await admin
    .from('kassenabrechnungen')
    .select('id, widerspruch_status, kasse_analyse')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!kasse) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Guard: KI-Analyse must exist before a Widerspruch can be opened.
  // If kasse_analyse is null the user has no credits and the analysis never ran.
  if (!kasse.kasse_analyse) {
    return NextResponse.json(
      { error: 'no_analyse', message: 'Bitte erst Analyse durchführen (1 Credit erforderlich).' },
      { status: 402 }
    )
  }

  // Only transition from 'keiner' → 'erstellt'
  if (kasse.widerspruch_status === 'keiner') {
    await admin
      .from('kassenabrechnungen')
      .update({ widerspruch_status: 'erstellt' })
      .eq('id', id)
    return NextResponse.json({ widerspruch_status: 'erstellt' })
  }

  // Already active — return current status unchanged
  return NextResponse.json({ widerspruch_status: kasse.widerspruch_status })
}
