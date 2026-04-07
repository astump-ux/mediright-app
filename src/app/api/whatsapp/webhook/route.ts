import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase-admin'

const MessagingResponse = twilio.twiml.MessagingResponse

// Validate that the request actually comes from Twilio
function validateTwilioSignature(request: NextRequest, body: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false

  const signature = request.headers.get('x-twilio-signature') || ''
  const url = `https://${request.headers.get('host')}/api/whatsapp/webhook`

  // Parse body as URLSearchParams for validation
  const params: Record<string, string> = {}
  new URLSearchParams(body).forEach((value, key) => { params[key] = value })

  return twilio.validateRequest(authToken, signature, url, params)
}

// Download PDF from Twilio media URL (requires Basic Auth)
async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// TwiML helper — send WhatsApp reply
function twimlReply(message: string): NextResponse {
  const twiml = new MessagingResponse()
  twiml.message(message)
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()

  // Validate Twilio signature (skip in development)
  if (process.env.NODE_ENV === 'production') {
    if (!validateTwilioSignature(request, body)) {
      return new NextResponse('Unauthorized', { status: 403 })
    }
  }

  const params = new URLSearchParams(body)
  const from = params.get('From') || ''           // whatsapp:+49...
  const numMedia = parseInt(params.get('NumMedia') || '0')
  const mediaUrl = params.get('MediaUrl0') || ''
  const mediaType = params.get('MediaContentType0') || ''
  const messageBody = params.get('Body') || ''

  // Normalize phone number (remove whatsapp: prefix)
  const phone = from.replace('whatsapp:', '')

  // ── 1. Look up user by phone ──────────────────────────────────────────────
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('phone_whatsapp', phone)
    .single()

  if (profileError || !profile) {
    return twimlReply(
      `👋 Willkommen bei MediRight!\n\nIhre Nummer ist noch nicht registriert. ` +
      `Bitte melden Sie sich an auf:\nhttps://mediright-app.vercel.app\n\n` +
      `Danach können Sie Rechnungen einfach hier weiterleiten.`
    )
  }

  // ── 2. Check for PDF attachment ───────────────────────────────────────────
  if (numMedia === 0 || !mediaUrl) {
    return twimlReply(
      `Hallo${profile.full_name ? ` ${profile.full_name}` : ''}! 👋\n\n` +
      `Bitte leiten Sie mir eine Arztrechnung als PDF weiter — ` +
      `ich analysiere sie dann automatisch für Sie.\n\n` +
      `_Tipp: Im AXA Kundenportal → Postfach → PDF öffnen → Teilen → WhatsApp_`
    )
  }

  if (!mediaType.includes('pdf') && !mediaType.includes('octet-stream')) {
    return twimlReply(
      `⚠️ Ich habe eine Datei vom Typ "${mediaType}" erhalten.\n\n` +
      `Bitte senden Sie die Rechnung als *PDF-Datei*. ` +
      `Fotos oder andere Formate kann ich noch nicht verarbeiten.`
    )
  }

  // ── 3. Download PDF ───────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await downloadTwilioMedia(mediaUrl)
  } catch (err) {
    console.error('PDF download error:', err)
    return twimlReply(
      `❌ Beim Herunterladen der Datei ist ein Fehler aufgetreten. ` +
      `Bitte versuchen Sie es nochmal.`
    )
  }

  // ── 4. Upload to Supabase Storage ─────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${profile.id}/${timestamp}.pdf`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('rechnungen')
    .upload(fileName, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return twimlReply(
      `❌ Beim Speichern der Datei ist ein Fehler aufgetreten. ` +
      `Bitte versuchen Sie es später nochmal.`
    )
  }

  // ── 5. Create Vorgang record ──────────────────────────────────────────────
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
    console.error('Vorgang create error:', vorgangError)
    return twimlReply(`❌ Datenbankfehler. Bitte versuchen Sie es später nochmal.`)
  }

  // ── 6. Trigger analysis asynchronously ───────────────────────────────────
  // Fire-and-forget: don't await so Twilio gets a fast response
  const analyzeUrl = `https://${request.headers.get('host')}/api/analyze`
  fetch(analyzeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
    body: JSON.stringify({ vorgangId: vorgang.id, userId: profile.id, phone }),
  }).catch(err => console.error('Analyze trigger error:', err))

  // ── 7. Confirm receipt ────────────────────────────────────────────────────
  return twimlReply(
    `✅ Rechnung erhalten! Ich analysiere sie jetzt.\n\n` +
    `In ca. 1–2 Minuten erhalten Sie hier eine Zusammenfassung mit:\n` +
    `• GOÄ-Positionen & Faktoren\n` +
    `• Auffälligkeiten & Überprüfungsbedarf\n` +
    `• Erstattungsprognose\n\n` +
    `_Dashboard: https://mediright-app.vercel.app/dashboard_`
  )
}
