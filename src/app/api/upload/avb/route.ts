import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// This route no longer accepts a file body — it only accepts JSON metadata.
// The actual file is uploaded directly from the browser to Supabase Storage
// via a signed upload URL, bypassing Vercel's 4.5 MB request body limit.

const MAX_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB (client-side guard only)
const BUCKET = 'avb-dokumente'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Parse JSON body (no file — just metadata)
  let body: { fileName?: string; fileSize?: number; dateityp?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const { fileName, fileSize, dateityp = 'avb' } = body

  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'fileName fehlt' }, { status: 400 })
  }
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Nur PDF-Dateien erlaubt' }, { status: 400 })
  }
  if (fileSize && fileSize > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Datei zu groß (max. 100 MB)' }, { status: 400 })
  }
  if (!['avb', 'versicherungsschein', 'sonstiges'].includes(dateityp)) {
    return NextResponse.json({ error: 'Ungültiger Dateityp' }, { status: 400 })
  }

  // Build storage path: {user_id}/{timestamp}_{filename}
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${user.id}/${timestamp}_${safeName}`

  // Admin client needed to create signed upload URL
  const admin = getSupabaseAdmin()

  // Create signed upload URL (browser will upload directly to this)
  const { data: signedData, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedError || !signedData) {
    console.error('[upload/avb] Signed URL error:', signedError)
    return NextResponse.json({ error: 'Signed Upload URL konnte nicht erstellt werden' }, { status: 500 })
  }

  // Create or reuse tarif_profile row (status: pending)
  let tarif_profile_id: string | null = null

  const { data: existing } = await admin
    .from('tarif_profile')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    tarif_profile_id = existing.id
    await admin
      .from('tarif_profile')
      .update({ analyse_status: 'pending', fehler_meldung: null })
      .eq('id', existing.id)
  } else {
    const { data: newProfile, error: profileError } = await admin
      .from('tarif_profile')
      .insert({
        user_id: user.id,
        versicherung: '',
        tarif_name: '',
        profil_json: {},
        quelldokumente: [],
        analyse_status: 'pending',
        is_active: true,
      })
      .select('id')
      .single()

    if (profileError || !newProfile) {
      console.error('[upload/avb] Profile insert error:', profileError)
      return NextResponse.json({ error: 'Profil konnte nicht angelegt werden' }, { status: 500 })
    }
    tarif_profile_id = newProfile.id
  }

  // Insert avb_dokumente row (file not yet uploaded, but path is reserved)
  const { data: dokument, error: dokError } = await admin
    .from('avb_dokumente')
    .insert({
      user_id: user.id,
      tarif_profile_id,
      dateiname_original: fileName,
      storage_path: storagePath,
      dateityp,
      groesse_bytes: fileSize ?? 0,
    })
    .select('id')
    .single()

  if (dokError || !dokument) {
    console.error('[upload/avb] Dokument insert error:', dokError)
    return NextResponse.json({ error: 'Dokument-Eintrag fehlgeschlagen' }, { status: 500 })
  }

  // Return signed upload URL + IDs for the client to use
  return NextResponse.json({
    signedUrl:        signedData.signedUrl,
    token:            signedData.token,
    storagePath,
    tarif_profile_id,
    dokument_id:      dokument.id,
    message:          'Bereit zum Upload. Bitte Datei direkt zu Supabase hochladen.',
  })
}
