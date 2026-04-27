import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/widerspruch-kommunikationen?kassenabrechnungen_id=xxx
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const kasseId = req.nextUrl.searchParams.get('kassenabrechnungen_id')
  if (!kasseId) return NextResponse.json({ error: 'Missing kassenabrechnungen_id' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('widerspruch_kommunikationen')
    .select('*')
    .eq('kassenabrechnungen_id', kasseId)
    .eq('user_id', user.id)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/widerspruch-kommunikationen
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    kassenabrechnungen_id,
    richtung,
    kommunikationspartner,
    typ,
    datum,
    betreff,
    inhalt,
  } = body

  if (!kassenabrechnungen_id || !richtung || !kommunikationspartner || !typ || !inhalt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify ownership — look up by ID first, then check user_id explicitly.
  // This two-step approach gives better error messages for debugging and handles
  // edge cases where the admin-inserted record's user_id might be stored differently.
  const { data: kasse, error: kasseErr } = await getSupabaseAdmin()
    .from('kassenabrechnungen')
    .select('id, user_id')
    .eq('id', kassenabrechnungen_id)
    .maybeSingle()

  if (kasseErr) {
    console.error('[widerspruch-kommunikationen POST] DB error:', kasseErr.message, { kassenabrechnungen_id })
    return NextResponse.json({ error: 'Datenbankfehler beim Laden des Vorgangs' }, { status: 500 })
  }
  if (!kasse) {
    console.error('[widerspruch-kommunikationen POST] kassenabrechnungen not found:', { kassenabrechnungen_id })
    return NextResponse.json({ error: 'Kassenbescheid nicht gefunden' }, { status: 404 })
  }
  if (kasse.user_id !== user.id) {
    console.error('[widerspruch-kommunikationen POST] user_id mismatch:', { stored: kasse.user_id, requesting: user.id })
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Vorgang' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('widerspruch_kommunikationen')
    .insert({
      kassenabrechnungen_id,
      user_id: user.id,
      richtung,
      kommunikationspartner,
      typ,
      datum: datum ?? new Date().toISOString().split('T')[0],
      betreff,
      inhalt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update kassenabrechnungen widerspruch_status based on richtung
  if (richtung === 'eingehend') {
    await getSupabaseAdmin()
      .from('kassenabrechnungen')
      .update({ widerspruch_status: 'beantwortet' })
      .eq('id', kassenabrechnungen_id)
      .eq('widerspruch_status', 'gesendet') // only downgrade if currently 'gesendet'
  }

  return NextResponse.json(data, { status: 201 })
}
