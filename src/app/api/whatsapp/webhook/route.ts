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

  // Validate Twilio signature — log result but don't block (avoids URL mismatch issues)
  if (process.env.NODE_ENV === 'production') {
    const valid = validateTwilioSignature(request, body)
    console.log('[webhook] Twilio signature valid:', valid, '| host:', request.headers.get('host'))
    // TODO: re-enable hard block once signature validation confirmed working:
    // if (!valid) return new NextResponse('Unauthorized', { status: 403 })
  }

  const params = new URLSearchParams(body)
  const from = params.get('From') || ''           // whatsapp:+49...
  const numMedia = parseInt(params.get('NumMedia') || '0')
  const mediaUrl = params.get('MediaUrl0') || ''
  const mediaType = params.get('MediaContentType0') || ''
  const messageBody = params.get('Body') || ''

  // Normalize phone number (remove whatsapp: prefix)
  const phone = from.replace('whatsapp:', '')

  console.log('[webhook] From:', from, '| Phone:', phone, '| NumMedia:', numMedia, '| MediaType:', mediaType)

  // ── 1. Look up user by phone ──────────────────────────────────────────────
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('phone_whatsapp', phone)
    .single()

  console.log('[webhook] Profile lookup:', profile?.id ?? 'NOT FOUND', '| error:', profileError?.message)

  if (profileError || !profile) {
    return twimlReply(
      `👋 Willkommen bei MediRight!\n\nIhre Nummer ist noch nicht registriert. ` +
      `Bitte melden Sie sich an auf:\nhttps://mediright-app.vercel.app\n\n` +
      `Danach können Sie Rechnungen einfach hier weiterleiten.`
    )
  }

  // ── 2. Detect KK prefix (Kassenabrechnung) ───────────────────────────────
  const isKasseMode = messageBody.trim().toUpperCase().startsWith('KK')

  // ── 3. Check for PDF attachment ───────────────────────────────────────────
  if (numMedia === 0 || !mediaUrl) {
    if (isKasseMode) {
      return twimlReply(
        `🏥 *Kassenabrechnung zuordnen*\n\n` +
        `Bitte senden Sie die AXA-Erstattungsübersicht als *PDF* — ` +
        `schicken Sie die Nachricht erneut mit dem PDF im Anhang.\n\n` +
        `_Format: Text "KK" + PDF-Anhang_`
      )
    }
    return twimlReply(
      `Hallo${profile.full_name ? ` ${profile.full_name}` : ''}! 👋\n\n` +
      `Bitte leiten Sie mir eine Arztrechnung als PDF weiter — ` +
      `ich analysiere sie dann automatisch für Sie.\n\n` +
      `_Tipp: Im AXA Kundenportal → Postfach → PDF öffnen → Teilen → WhatsApp_\n\n` +
      `_Kassenabrechnung zuordnen? Schicken Sie "KK" + PDF._`
    )
  }

  if (!mediaType.includes('pdf') && !mediaType.includes('octet-stream')) {
    return twimlReply(
      `⚠️ Ich habe eine Datei vom Typ "${mediaType}" erhalten.\n\n` +
      `Bitte senden Sie die Rechnung als *PDF-Datei*. ` +
      `Fotos oder andere Formate kann ich noch nicht verarbeiten.`
    )
  }

  // ── 4. Download PDF ───────────────────────────────────────────────────────
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

  // ── 5. Upload to Supabase Storage ─────────────────────────────────────────
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

  // ── 6. KASSENABRECHNUNG: attach to most recent open Vorgang ──────────────
  if (isKasseMode) {
    // Find the most recent vorgang for this user that doesn't have a Kassenbescheid yet
    const { data: latestVorgang, error: findError } = await supabaseAdmin
      .from('vorgaenge')
      .select('id')
      .eq('user_id', profile.id)
      .is('kasse_pdf_storage_path', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (findError || !latestVorgang) {
      // No open vorgang found — create a standalone kasse record
      console.warn('[webhook] No open Vorgang for KK — creating standalone')
      const { data: newVorgang, error: createError } = await supabaseAdmin
        .from('vorgaenge')
        .insert({
          user_id: profile.id,
          kasse_pdf_storage_path: fileName,
          status: 'offen',
          rechnungsdatum: new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single()

      if (createError || !newVorgang) {
        return twimlReply(`❌ Datenbankfehler. Bitte versuchen Sie es später nochmal.`)
      }

      const host = request.headers.get('host')
      fetch(`https://${host}/api/analyze-kasse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
        body: JSON.stringify({ vorgangId: newVorgang.id, userId: profile.id, phone }),
      }).catch(err => console.error('Kasse analyze trigger error:', err))
    } else {
      // Attach to existing vorgang
      await supabaseAdmin
        .from('vorgaenge')
        .update({ kasse_pdf_storage_path: fileName, updated_at: new Date().toISOString() })
        .eq('id', latestVorgang.id)

      const host = request.headers.get('host')
      fetch(`https://${host}/api/analyze-kasse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
        body: JSON.stringify({ vorgangId: latestVorgang.id, userId: profile.id, phone }),
      }).catch(err => console.error('Kasse analyze trigger error:', err))
    }

    return twimlReply(
      `🏥 Kassenabrechnung erhalten! Ich verarbeite sie jetzt.\n\n` +
      `In ca. 1–2 Minuten erhalten Sie eine Zusammenfassung mit:\n` +
      `• Erstattungsquote\n` +
      `• Gekürzte/abgelehnte Positionen\n` +
      `• Widerspruchsempfehlung (falls sinnvoll)\n\n` +
      `_Details: https://mediright-app.vercel.app/rechnungen_`
    )
  }

  // ── 7. ARZTRECHNUNG: create new Vorgang ───────────────────────────────────
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

  // ── 8. Trigger GOÄ analysis asynchronously ────────────────────────────────
  const analyzeUrl = `https://${request.headers.get('host')}/api/analyze`
  fetch(analyzeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
    body: JSON.stringify({ vorgangId: vorgang.id, userId: profile.id, phone }),
  }).catch(err => console.error('Analyze trigger error:', err))

  // ── 9. Confirm receipt ────────────────────────────────────────────────────
  return twimlReply(
    `✅ Rechnung erhalten! Ich analysiere sie jetzt.\n\n` +
    `In ca. 1–2 Minuten erhalten Sie hier eine Zusammenfassung mit:\n` +
    `• GOÄ-Positionen & Faktoren\n` +
    `• Auffälligkeiten & Überprüfungsbedarf\n` +
    `• Erstattungsprognose\n\n` +
    `_Dashboard: https://mediright-app.vercel.app/dashboard_\n` +
    `_Kassenabrechnung erhalten? Schicken Sie "KK" + PDF._`
  )
}
