import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { classifyPdf } from '@/lib/goae-analyzer'

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

function triggerAnalysis(host: string, endpoint: string, payload: object) {
  fetch(`https://${host}/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET!,
    },
    body: JSON.stringify(payload),
  }).catch(err => console.error(`[${endpoint}] trigger error:`, err))
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

  // ── 1. Look up user by phone ──────────────────────────────────────────────
  // Use only guaranteed base columns; extended PKV fields are loaded separately
  // so the webhook still works before Migration 005 is applied.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('phone_whatsapp', phone)
    .single()

  if (profileError || !profile) {
    console.error('[webhook] Profile lookup failed:', profileError?.message, '| phone:', phone)
    return twimlReply(
      `👋 Willkommen bei MediRight!\n\nIhre Nummer ist noch nicht registriert. ` +
      `Bitte melden Sie sich an auf:\nhttps://mediright-app.vercel.app\n\n` +
      `Danach können Sie Rechnungen einfach hier weiterleiten.`
    )
  }

  // Load extended PKV fields if Migration 005 has been applied (fail-safe)
  let pkvName: string | null = null
  let notificationsEnabled = true
  try {
    const { data: ext } = await supabaseAdmin
      .from('profiles')
      .select('pkv_name, benachrichtigung_whatsapp')
      .eq('id', profile.id)
      .single()
    if (ext) {
      pkvName = ext.pkv_name ?? null
      notificationsEnabled = ext.benachrichtigung_whatsapp !== false
    }
  } catch {
    // Migration 005 not yet applied — continue without PKV context
    console.warn('[webhook] Extended profile fields not available yet')
  }

  // ── 2. Check for PDF attachment ───────────────────────────────────────────
  if (numMedia === 0 || !mediaUrl) {
    return twimlReply(
      `Hallo${profile.full_name ? ` ${profile.full_name}` : ''}! 👋\n\n` +
      `Bitte leiten Sie mir eine Arztrechnung oder einen Kassenbescheid als *PDF* weiter — ` +
      `ich erkenne den Dokumenttyp automatisch und analysiere ihn für Sie.\n\n` +
      `_Tipp: AXA Kundenportal → Postfach → PDF → Teilen → WhatsApp_`
    )
  }

  if (!mediaType.includes('pdf') && !mediaType.includes('octet-stream')) {
    return twimlReply(
      `⚠️ Dateityp "${mediaType}" wird nicht unterstützt.\n\n` +
      `Bitte senden Sie das Dokument als *PDF-Datei*.`
    )
  }

  // ── 3. Download PDF ───────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await downloadTwilioMedia(mediaUrl)
  } catch (err) {
    console.error('PDF download error:', err)
    return twimlReply(`❌ Fehler beim Herunterladen. Bitte nochmal versuchen.`)
  }

  // ── 4. Auto-classify document type ───────────────────────────────────────
  console.log('[webhook] Classifying PDF for user:', profile.id, '| pkv:', pkvName)
  const docType = await classifyPdf(pdfBuffer, pkvName)
  console.log('[webhook] Classification result:', docType)

  // ── 5. Upload to Supabase Storage ─────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${profile.id}/${timestamp}.pdf`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('rechnungen')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return twimlReply(`❌ Fehler beim Speichern. Bitte später nochmal versuchen.`)
  }

  // ── 6. Route by document type ─────────────────────────────────────────────
  const notifyPhone = notificationsEnabled ? phone : undefined

  if (docType === 'kassenabrechnung') {
    // Attach to most recent vorgang that has no Kassenbescheid yet
    const { data: latestVorgang } = await supabaseAdmin
      .from('vorgaenge')
      .select('id')
      .eq('user_id', profile.id)
      .is('kasse_pdf_storage_path', null)
      .not('pdf_storage_path', 'is', null)   // must have an Arztrechnung
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestVorgang) {
      await supabaseAdmin
        .from('vorgaenge')
        .update({ kasse_pdf_storage_path: fileName, updated_at: new Date().toISOString() })
        .eq('id', latestVorgang.id)

      triggerAnalysis(host, 'analyze-kasse', {
        vorgangId: latestVorgang.id,
        userId: profile.id,
        phone: notifyPhone,
      })
    } else {
      // No open Arztrechnung → create standalone kasse entry
      const { data: newVorgang } = await supabaseAdmin
        .from('vorgaenge')
        .insert({
          user_id: profile.id,
          kasse_pdf_storage_path: fileName,
          status: 'offen',
          rechnungsdatum: new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single()

      if (newVorgang) {
        triggerAnalysis(host, 'analyze-kasse', {
          vorgangId: newVorgang.id,
          userId: profile.id,
          phone: notifyPhone,
        })
      }
    }

    return twimlReply(
      `🏥 *Kassenbescheid erkannt!*\n\n` +
      `${pkvName ? `Dokument von ${pkvName} identifiziert. ` : ''}` +
      `Ich analysiere ihn jetzt und prüfe:\n` +
      `• Erstattungsquote & Kürzungen\n` +
      `• Abgelehnte Positionen\n` +
      `• Ob ein Widerspruch sinnvoll ist\n\n` +
      `In ca. 1–2 Min. erhalten Sie hier die Zusammenfassung.\n` +
      `_Details: https://mediright-app.vercel.app/rechnungen_`
    )
  }

  // ── ARZTRECHNUNG: create new Vorgang ──────────────────────────────────────
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
    return twimlReply(`❌ Datenbankfehler. Bitte später nochmal versuchen.`)
  }

  triggerAnalysis(host, 'analyze', {
    vorgangId: vorgang.id,
    userId: profile.id,
    phone: notifyPhone,
  })

  return twimlReply(
    `🧾 *Arztrechnung erkannt!*\n\n` +
    `Ich analysiere sie jetzt. In ca. 1–2 Min. erhalten Sie:\n` +
    `• GOÄ-Positionen & Faktoren\n` +
    `• Auffälligkeiten & Überprüfungsbedarf\n` +
    `• Einsparpotenzial\n\n` +
    `_Dashboard: https://mediright-app.vercel.app/dashboard_`
  )
}
