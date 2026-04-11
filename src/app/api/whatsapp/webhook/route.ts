import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase-admin'

const MessagingResponse = twilio.twiml.MessagingResponse

function validateTwilioSignature(request: NextRequest, body: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false
  const signature = request.headers.get('x-twilio-signature') || ''
  const url = `https://${request.headers.get('host')}/api/whatsapp/webhook`
  const params: Record<string, string> = {}
  new URLSearchParams(body).forEach((value, key) => { params[key] = value })
  return twilio.validateRequest(authToken, signature, url, params)
}

async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!response.ok) throw new Error(`Failed to download media: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function twimlReply(message: string): NextResponse {
  const twiml = new MessagingResponse()
  twiml.message(message)
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()

  if (process.env.NODE_ENV === 'production') {
    const valid = validateTwilioSignature(request, body)
    console.log('[webhook] Twilio signature valid:', valid)
  }

  const params = new URLSearchParams(body)
  const from = params.get('From') || ''
  const numMedia = parseInt(params.get('NumMedia') || '0')
  const mediaUrl = params.get('MediaUrl0') || ''
  const mediaType = params.get('MediaContentType0') || ''
  const phone = from.replace('whatsapp:', '')
  const host = request.headers.get('host')!

  console.log('[webhook] From:', from, '| NumMedia:', numMedia, '| MediaType:', mediaType)

  // ── 1. Look up user by phone (only guaranteed base columns) ──────────────
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('phone_whatsapp', phone)
    .single()

  if (profileError || !profile) {
    console.error('[webhook] Profile not found for phone:', phone, profileError?.message)
    return twimlReply(
      `👋 Willkommen bei MediRight!\n\nIhre Nummer ist noch nicht registriert.\n` +
      `Bitte melden Sie sich an: https://mediright-app.vercel.app`
    )
  }

  // ── 2. Check for PDF attachment ───────────────────────────────────────────
  if (numMedia === 0 || !mediaUrl) {
    return twimlReply(
      `Hallo${profile.full_name ? ` ${profile.full_name}` : ''}! 👋\n\n` +
      `Bitte leiten Sie mir eine Arztrechnung oder einen Kassenbescheid als *PDF* weiter.\n\n` +
      `_Tipp: AXA Kundenportal → Postfach → PDF → Teilen → WhatsApp_`
    )
  }

  if (!mediaType.includes('pdf') && !mediaType.includes('octet-stream')) {
    return twimlReply(
      `⚠️ Dateityp "${mediaType}" wird nicht unterstützt.\n` +
      `Bitte senden Sie das Dokument als *PDF-Datei*.`
    )
  }

  // ── 3. Download PDF from Twilio ───────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await downloadTwilioMedia(mediaUrl)
    console.log('[webhook] PDF downloaded, size:', pdfBuffer.length, 'bytes')
  } catch (err) {
    console.error('[webhook] PDF download error:', err)
    return twimlReply(`❌ Fehler beim Herunterladen. Bitte nochmal versuchen.`)
  }

  // ── 4. Upload to Supabase Storage ─────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${profile.id}/${timestamp}.pdf`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('rechnungen')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error('[webhook] Upload error:', uploadError)
    return twimlReply(`❌ Fehler beim Speichern. Bitte später nochmal versuchen.`)
  }

  // ── 5. Create Vorgang (type unknown — analyze-auto will classify & route) ──
  const { data: vorgang, error: vorgangError } = await supabaseAdmin
    .from('vorgaenge')
    .insert({
      user_id: profile.id,
      pdf_storage_path: fileName,
      status: 'offen',
      rechnungsdatum: new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single()

  if (vorgangError || !vorgang) {
    console.error('[webhook] Vorgang create error:', vorgangError)
    return twimlReply(`❌ Datenbankfehler. Bitte später nochmal versuchen.`)
  }

  // ── 6. Trigger auto-analyze (background, keep function alive via waitUntil) ─
  waitUntil(
    fetch(`https://${host}/api/analyze-auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET!,
      },
      body: JSON.stringify({ vorgangId: vorgang.id, userId: profile.id, phone }),
    }).catch(err => console.error('[webhook] analyze-auto trigger error:', err))
  )

  // ── 7. Immediate confirmation to user ─────────────────────────────────────
  return twimlReply(
    `✅ Dokument erhalten!\n\n` +
    `Ich erkenne den Dokumenttyp automatisch und analysiere es.\n` +
    `In ca. 1–2 Minuten erhalten Sie hier die Zusammenfassung.\n\n` +
    `_Dashboard: https://mediright-app.vercel.app/rechnungen_`
  )
}
