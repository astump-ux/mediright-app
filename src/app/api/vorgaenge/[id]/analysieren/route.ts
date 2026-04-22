/**
 * POST /api/vorgaenge/[id]/analysieren
 *
 * Re-triggers the full analyse-auto pipeline for a Kassenbescheid vorgang
 * whose analysis was previously blocked due to insufficient credits
 * (analyse_status = 'pending_credits').
 *
 * Returns:
 *   200  { success: true }          — pipeline kicked off
 *   400  { error: 'not_pending' }   — vorgang is not in pending_credits state
 *   402  { error: 'no_credits' }    — still no credits available
 *   404                             — vorgang not found / wrong user
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  // Verify ownership + pending state
  const { data: vorgang } = await admin
    .from('vorgaenge')
    .select('id, analyse_status, pdf_storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!vorgang?.pdf_storage_path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (vorgang.analyse_status !== 'pending_credits') {
    return NextResponse.json(
      { error: 'not_pending', message: 'Vorgang ist nicht im Status pending_credits.' },
      { status: 400 }
    )
  }

  // Kick off the full pipeline — credit check happens inside analyze-auto.
  // We fire-and-forget (no await) so the response returns immediately,
  // allowing the UI to poll / refresh. The user will see the result
  // once the page reloads.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediright.vercel.app').replace(/\/$/, '')
  const secret = process.env.INTERNAL_API_SECRET ?? ''

  // Use waitUntil-style: call synchronously so we can return the credit error
  const res = await fetch(`${appUrl}/api/analyze-auto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ vorgangId: id, userId: user.id }),
  })

  if (res.status === 402) {
    return NextResponse.json(
      { error: 'no_credits', message: 'Keine Analyse-Credits verfügbar. Bitte Credits kaufen.' },
      { status: 402 }
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[vorgaenge/analysieren] pipeline error:', res.status, body)
    return NextResponse.json({ error: 'pipeline_error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
