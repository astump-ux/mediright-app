import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

export const config = { api: { bodyParser: false } }

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const BUCKET = 'avb-dokumente'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Ungültige Formulardaten' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const dateityp = (formData.get('dateityp') as string) || 'avb'

  if (!file) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Nur PDF-Dateien erlaubt' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Datei zu groß (max. 50 MB)' }, { status: 400 })
  }
  if (!['avb', 'versicherungsschein', 'sonstiges'].includes(dateityp)) {
    return NextResponse.json({ error: 'Ungültiger Dateityp' }, { status: 400 })
  }

  // Build storage path: {user_id}/{timestamp}_{filename}
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${user.id}/${timestamp}_${safeName}`

  // Upload to Supabase Storage
  const fileBuffer = await file.arrayBuffer()
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (storageError) {
    console.error('[upload/avb] Storage error:', storageError)
    return NextResponse.json({ error: 'Upload fehlgeschlagen', detail: storageError.message }, { status: 500 })
  }

  // Create tarif_profile row (status: pending) if none active yet
  let tarif_profile_id: string | null = null

  const { data: existing } = await supabase
    .from('tarif_profile')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    // Re-use existing profile — document will be linked to it, analysis will update it
    tarif_profile_id = existing.id
    await supabase
      .from('tarif_profile')
      .update({ analyse_status: 'pending', fehler_meldung: null })
      .eq('id', existing.id)
  } else {
    // Create fresh profile row
    const { data: newProfile, error: profileError } = await supabase
      .from('tarif_profile')
      .insert({
        user_id: user.id,
        versicherung: '',      // filled by analysis
        tarif_name: '',        // filled by analysis
        profil_json: {},
        quelldokumente: [],
        analyse_status: 'pending',
        is_active: true,
      })
      .select('id')
      .single()

    if (profileError || !newProfile) {
      console.error('[upload/avb] Profile insert error:', profileError)
      // Clean up storage on failure
      await supabase.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: 'Profil konnte nicht angelegt werden' }, { status: 500 })
    }
    tarif_profile_id = newProfile.id
  }

  // Insert avb_dokumente row
  const { data: dokument, error: dokError } = await supabase
    .from('avb_dokumente')
    .insert({
      user_id: user.id,
      tarif_profile_id,
      dateiname_original: file.name,
      storage_path: storagePath,
      dateityp,
      groesse_bytes: file.size,
    })
    .select('id')
    .single()

  if (dokError || !dokument) {
    console.error('[upload/avb] Dokument insert error:', dokError)
    return NextResponse.json({ error: 'Dokument-Eintrag fehlgeschlagen' }, { status: 500 })
  }

  // Trigger async analysis (fire-and-forget via internal fetch)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  fetch(`${baseUrl}/api/analyse/avb`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
    },
    body: JSON.stringify({
      tarif_profile_id,
      dokument_id: dokument.id,
      user_id: user.id,
    }),
  }).catch(err => console.error('[upload/avb] Async analyse trigger failed:', err))

  return NextResponse.json({
    success: true,
    tarif_profile_id,
    dokument_id: dokument.id,
    storage_path: storagePath,
    message: 'PDF hochgeladen. Analyse läuft im Hintergrund.',
  })
}
