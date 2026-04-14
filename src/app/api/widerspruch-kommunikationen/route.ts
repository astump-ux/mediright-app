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

  // Verify ownership
  const { data: kasse } = await getSupabaseAdmin()
    .from('kassenabrechnungen')
    .select('id')
    .eq('id', kassenabrechnungen_id)
    .eq('user_id', user.id)
    .single()

  if (!kasse) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
