import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

// Called after the browser has successfully uploaded the AVB file directly to
// Supabase Storage via the signed URL from /api/upload/avb.
// This route kicks off the async AI analysis.

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: { tarif_profile_id?: string; dokument_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const { tarif_profile_id, dokument_id } = body
  if (!tarif_profile_id || !dokument_id) {
    return NextResponse.json({ error: 'tarif_profile_id und dokument_id erforderlich' }, { status: 400 })
  }

  // Fire-and-forget: trigger async AI analysis
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  fetch(`${baseUrl}/api/analyse/avb`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
    },
    body: JSON.stringify({
      tarif_profile_id,
      dokument_id,
      user_id: user.id,
    }),
  }).catch(err => console.error('[upload/avb/complete] Async analyse trigger failed:', err))

  return NextResponse.json({
    success: true,
    message: 'Analyse gestartet.',
  })
}
