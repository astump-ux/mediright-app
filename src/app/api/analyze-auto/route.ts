/**
 * /api/analyze-auto
 *
 * Unified background job triggered by the WhatsApp webhook.
 * Steps:
 *   1. Download PDF from storage
 *   2. Classify: arztrechnung or kassenabrechnung
 *   3. Run the appropriate analysis pipeline
 *   4. Update Vorgang in DB
 *   5. Send WhatsApp result message
 *
 * Keeping classify + analyse in the same function avoids double cold-starts
 * and gives us a single place to handle timeouts / retries.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { classifyPdf, analyzeRechnungPdf, analyzeKassePdf } from '@/lib/goae-analyzer'
import twilio from 'twilio'

// Vercel: allow up to 60 s on Pro, 10 s on Hobby (soft hint)
export const maxDuration = 60

function validateInternalSecret(req: NextRequest): boolean {
  return req.headers.get('x-internal-secret') === process.env.INTERNAL_API_SECRET
}

async function sendWhatsApp(to: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER
  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[analyze-auto] Twilio not configured, skipping WhatsApp reply')
    return
  }
  const client = twilio(accountSid, authToken)
  await client.messages.create({
    from: `whatsapp:${fromNumber}`,
    to:   `whatsapp:${to}`,
    body: message,
  })
}

/** Safely parse JSON that Claude might wrap in ```json ... ``` */
function safeParseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(cleaned) as T
}

export async function POST(request: NextRequest) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { vorgangId, userId, phone } = await request.json()
  console.log('[analyze-auto] START vorgangId:', vorgangId, '| userId:', userId)

  if (!vorgangId || !userId) {
    return NextResponse.json({ error: 'Missing vorgangId or userId' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[analyze-auto] ANTHROPIC_API_KEY is not set')
    if (phone) await sendWhatsApp(phone,
      `⚠️ Konfigurationsfehler: ANTHROPIC_API_KEY fehlt.\nBitte Administrator kontaktieren.`)
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  // ── 1. Fetch Vorgang ───────────────────────────────────────────────────────
  const { data: vorgang, error: fetchError } = await supabaseAdmin
    .from('vorgaenge')
    .select('id, pdf_storage_path')
    .eq('id', vorgangId)
    .single()

  if (fetchError || !vorgang?.pdf_storage_path) {
    const msg = `Vorgang not found: ${fetchError?.message}`
    console.error('[analyze-auto]', msg)
    if (phone) await sendWhatsApp(phone,
      `❌ Interner Fehler (Vorgang nicht gefunden). Bitte Dokument erneut senden.`)
    return NextResponse.json({ error: msg }, { status: 404 })
  }

  // ── 2. Download PDF ────────────────────────────────────────────────────────
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('rechnungen')
    .download(vorgang.pdf_storage_path)

  if (downloadError || !fileData) {
    const msg = `Storage download failed: ${downloadError?.message}`
    console.error('[analyze-auto]', msg)
    if (phone) await sendWhatsApp(phone,
      `❌ PDF konnte nicht geladen werden. Bitte erneut senden.`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const pdfBuffer = Buffer.from(await fileData.arrayBuffer())
  console.log('[analyze-auto] PDF size:', pdfBuffer.length, 'bytes')

  // ── 3. Load user's PKV name for better classification accuracy ─────────────
  let pkvName: string | null = null
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('pkv_name')
      .eq('id', userId)
      .single()
    pkvName = profile?.pkv_name ?? null
  } catch { /* migration 005 not yet applied — continue without */ }

  // ── 4. Classify document ───────────────────────────────────────────────────
  console.log('[analyze-auto] Classifying... pkv_name:', pkvName)
  const docType = await classifyPdf(pdfBuffer, pkvName)
  console.log('[analyze-auto] Classification:', docType)

  // ── 5. Analyse ────────────────────────────────────────────────────────────
  try {
    if (docType === 'kassenabrechnung') {
      await handleKasse(vorgangId, userId, phone, pdfBuffer)
    } else {
      await handleArztrechnung(vorgangId, userId, phone, pdfBuffer)
    }
    return NextResponse.json({ success: true, vorgangId, docType })

  } catch (err) {
    const errMsg = String(err)
    console.error('[analyze-auto] Analysis failed:', errMsg)

    await supabaseAdmin
      .from('vorgaenge')
      .update({ status: 'pruefen', updated_at: new Date().toISOString() })
      .eq('id', vorgangId)

    if (phone) {
      await sendWhatsApp(phone,
        `⚠️ Analyse fehlgeschlagen.\n\n` +
        `Mögliche Ursache: Das PDF ist möglicherweise geschützt, leer, oder das Format wird nicht unterstützt.\n\n` +
        `Bitte prüfen Sie das Dokument manuell:\nhttps://mediright-app.vercel.app/rechnungen`
      )
    }
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

// ── Arztrechnung Pipeline ──────────────────────────────────────────────────────
async function handleArztrechnung(
  vorgangId: string,
  userId: string,
  phone: string | undefined,
  pdfBuffer: Buffer
) {
  const analyse = await analyzeRechnungPdf(pdfBuffer)
  console.log('[analyze-auto] GOÄ analyse done, arzt:', analyse.arztName)

  await supabaseAdmin
    .from('vorgaenge')
    .update({
      rechnungsdatum:               analyse.rechnungsdatum,
      rechnungsnummer:              analyse.rechnungsnummer,
      betrag_gesamt:                analyse.betragGesamt,
      goae_positionen:              analyse.goaePositionen,
      max_faktor:                   analyse.maxFaktor,
      flag_faktor_ueber_schwellenwert: analyse.flagFaktorUeberSchwellenwert,
      flag_fehlende_begruendung:    analyse.flagFehlendeBegrundung,
      einsparpotenzial:             analyse.einsparpotenzial,
      claude_analyse:               analyse,
      status:                       'pruefen',
      updated_at:                   new Date().toISOString(),
    })
    .eq('id', vorgangId)

  // Upsert Arzt record
  if (analyse.arztName) {
    const { data: arzt } = await supabaseAdmin
      .from('aerzte')
      .upsert(
        { user_id: userId, name: analyse.arztName, fachgebiet: analyse.arztFachgebiet },
        { onConflict: 'user_id,name', ignoreDuplicates: false }
      )
      .select('id')
      .single()

    if (arzt) {
      await supabaseAdmin.from('vorgaenge').update({ arzt_id: arzt.id }).eq('id', vorgangId)
    }
  }

  if (phone) {
    const lines = [
      `🧾 *Arztrechnung analysiert*`,
      ``,
      analyse.arztName
        ? `👨‍⚕️ *${analyse.arztName}*${analyse.arztFachgebiet ? ` · ${analyse.arztFachgebiet}` : ''}`
        : null,
      `💶 Betrag: *${analyse.betragGesamt.toFixed(2)} €*`,
      analyse.flagFaktorUeberSchwellenwert ? `⚠️ Faktor über 2,3× Schwellenwert` : null,
      analyse.flagFehlendeBegrundung ? `❗ Begründung fehlt (§12 GOÄ)` : null,
      analyse.einsparpotenzial > 0
        ? `💡 Einsparpotenzial: *${analyse.einsparpotenzial.toFixed(2)} €*`
        : null,
      ``,
      `📊 Details: https://mediright-app.vercel.app/rechnungen`,
    ].filter((l): l is string => l !== null)

    await sendWhatsApp(phone, lines.join('\n'))
  }
}

// ── Kassenabrechnung Pipeline ──────────────────────────────────────────────────
async function handleKasse(
  vorgangId: string,
  userId: string,
  phone: string | undefined,
  pdfBuffer: Buffer
) {
  // Check if this vorgang already has an Arztrechnung; if not, look for one
  const { data: thisVorgang } = await supabaseAdmin
    .from('vorgaenge')
    .select('pdf_storage_path, kasse_pdf_storage_path')
    .eq('id', vorgangId)
    .single()

  // If the PDF was stored as pdf_storage_path (default), move it to kasse_pdf_storage_path
  // and find/attach to the most recent Arztrechnung vorgang
  if (thisVorgang?.pdf_storage_path && !thisVorgang.kasse_pdf_storage_path) {
    // Find most recent open vorgang with an Arztrechnung (no Kassenbescheid yet)
    const { data: targetVorgang } = await supabaseAdmin
      .from('vorgaenge')
      .select('id')
      .eq('user_id', userId)
      .neq('id', vorgangId)
      .is('kasse_pdf_storage_path', null)
      .not('pdf_storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (targetVorgang) {
      // Attach kasse PDF to the existing Arztrechnung vorgang
      await supabaseAdmin
        .from('vorgaenge')
        .update({
          kasse_pdf_storage_path: thisVorgang.pdf_storage_path,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetVorgang.id)

      // Remove the placeholder vorgang we created
      await supabaseAdmin.from('vorgaenge').delete().eq('id', vorgangId)

      // Analyse the kasse PDF on the correct vorgang
      const analyse = await analyzeKassePdf(pdfBuffer)
      await saveKasseAnalyse(targetVorgang.id, analyse)
      if (phone) await sendKasseSummary(phone, analyse)
      return
    }

    // No Arztrechnung found → keep current vorgang, convert it to a kasse-only record
    await supabaseAdmin
      .from('vorgaenge')
      .update({
        kasse_pdf_storage_path: thisVorgang.pdf_storage_path,
        pdf_storage_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vorgangId)
  }

  const analyse = await analyzeKassePdf(pdfBuffer)
  await saveKasseAnalyse(vorgangId, analyse)
  if (phone) await sendKasseSummary(phone, analyse)
}

async function saveKasseAnalyse(vorgangId: string, analyse: Awaited<ReturnType<typeof analyzeKassePdf>>) {
  await supabaseAdmin
    .from('vorgaenge')
    .update({
      kasse_analyse:       analyse,
      betrag_erstattet:    analyse.betragErstattet,
      betrag_abgelehnt:    analyse.betragAbgelehnt,
      kasse_referenznummer: analyse.referenznummer,
      kasse_eingegangen_am: analyse.bescheiddatum,
      status:              analyse.betragAbgelehnt > 0 ? 'pruefen' : 'erstattet',
      updated_at:          new Date().toISOString(),
    })
    .eq('id', vorgangId)
}

async function sendKasseSummary(phone: string, analyse: Awaited<ReturnType<typeof analyzeKassePdf>>) {
  const quote = analyse.erstattungsquote?.toFixed(0) ?? '?'
  const lines = [
    `🏥 *Kassenbescheid analysiert*`,
    ``,
    `💶 Eingereicht: *${analyse.betragEingereicht?.toFixed(2)} €*`,
    `✅ Erstattet: *${analyse.betragErstattet?.toFixed(2)} €* (${quote}%)`,
    analyse.betragAbgelehnt > 0
      ? `❌ Abgelehnt: *${analyse.betragAbgelehnt?.toFixed(2)} €*`
      : null,
    ``,
    analyse.zusammenfassung,
    analyse.widerspruchEmpfohlen
      ? `\n⚡ *Widerspruch empfohlen!*\n${analyse.widerspruchBegruendung ?? ''}`
      : null,
    ``,
    `📊 Details: https://mediright-app.vercel.app/rechnungen`,
  ].filter((l): l is string => l !== null)

  await sendWhatsApp(phone, lines.join('\n'))
}
