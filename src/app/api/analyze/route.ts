import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { analyzeRechnungPdf } from '@/lib/goae-analyzer'
import twilio from 'twilio'

// Validate internal secret to prevent unauthorized calls
function validateInternalSecret(request: NextRequest): boolean {
  const secret = request.headers.get('x-internal-secret')
  return secret === process.env.INTERNAL_API_SECRET
}

// Send WhatsApp message via Twilio
async function sendWhatsApp(to: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('Twilio not configured, skipping WhatsApp reply')
    return
  }

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${to}`,
    body: message,
  })
}

// Format analysis result as WhatsApp message
function formatWhatsAppSummary(analyse: Awaited<ReturnType<typeof analyzeRechnungPdf>>): string {
  const lines: string[] = []

  lines.push(`🔍 *Analyse abgeschlossen*`)
  lines.push(``)

  if (analyse.arztName) {
    lines.push(`👨‍⚕️ *${analyse.arztName}*${analyse.arztFachgebiet ? ` · ${analyse.arztFachgebiet}` : ''}`)
  }

  lines.push(`💶 Gesamtbetrag: *${analyse.betragGesamt.toFixed(2)} €*`)

  if (analyse.flagFaktorUeberSchwellenwert) {
    lines.push(`⚠️ Faktor über 2,3-fach Schwellenwert gefunden`)
  }

  if (analyse.flagFehlendeBegrundung) {
    lines.push(`❗ Begründung fehlt für erhöhten Faktor (§12 GOÄ)`)
  }

  if (analyse.einsparpotenzial > 0) {
    lines.push(`💡 Einsparpotenzial: *${analyse.einsparpotenzial.toFixed(2)} €*`)
  }

  lines.push(``)
  lines.push(`📋 *GOÄ-Positionen (${analyse.goaePositionen.length}):*`)

  for (const pos of analyse.goaePositionen.slice(0, 5)) {
    const icon = pos.flag === 'hoch' ? '🔴' : pos.flag === 'pruefe' ? '🟡' : '🟢'
    lines.push(`${icon} Ziff. ${pos.ziffer} · ${pos.faktor}x · ${pos.betrag.toFixed(2)} €`)
  }

  if (analyse.goaePositionen.length > 5) {
    lines.push(`_... und ${analyse.goaePositionen.length - 5} weitere Positionen_`)
  }

  lines.push(``)
  lines.push(`📊 Details im Dashboard:`)
  lines.push(`https://mediright-app.vercel.app/dashboard`)

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  // Validate internal call
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { vorgangId, userId, phone } = await request.json()

  if (!vorgangId || !userId) {
    return NextResponse.json({ error: 'Missing vorgangId or userId' }, { status: 400 })
  }

  try {
    // ── 1. Fetch Vorgang record ────────────────────────────────────────────
    const { data: vorgang, error: fetchError } = await supabaseAdmin
      .from('vorgaenge')
      .select('id, pdf_storage_path, status')
      .eq('id', vorgangId)
      .single()

    if (fetchError || !vorgang) {
      throw new Error(`Vorgang not found: ${fetchError?.message}`)
    }

    // ── 2. Download PDF from Supabase Storage ─────────────────────────────
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('rechnungen')
      .download(vorgang.pdf_storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Storage download failed: ${downloadError?.message}`)
    }

    const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

    // ── 3. Analyse with Claude ─────────────────────────────────────────────
    const analyse = await analyzeRechnungPdf(pdfBuffer)

    // ── 4. Update Vorgang in DB ───────────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('vorgaenge')
      .update({
        arzt_id: null, // TODO: match/create Arzt record
        rechnungsdatum: analyse.rechnungsdatum,
        rechnungsnummer: analyse.rechnungsnummer,
        betrag_gesamt: analyse.betragGesamt,
        goae_positionen: analyse.goaePositionen,
        max_faktor: analyse.maxFaktor,
        flag_faktor_ueber_schwellenwert: analyse.flagFaktorUeberSchwellenwert,
        flag_fehlende_begruendung: analyse.flagFehlendeBegrundung,
        einsparpotenzial: analyse.einsparpotenzial,
        claude_analyse: analyse,
        status: 'pruefen',
        updated_at: new Date().toISOString(),
      })
      .eq('id', vorgangId)

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`)
    }

    // ── 5. Upsert Arzt record (if name known) ─────────────────────────────
    if (analyse.arztName) {
      const { data: arzt } = await supabaseAdmin
        .from('aerzte')
        .upsert({
          user_id: userId,
          name: analyse.arztName,
          fachgebiet: analyse.arztFachgebiet,
        }, { onConflict: 'user_id,name', ignoreDuplicates: false })
        .select('id')
        .single()

      if (arzt) {
        await supabaseAdmin
          .from('vorgaenge')
          .update({ arzt_id: arzt.id })
          .eq('id', vorgangId)
      }
    }

    // ── 6. Send WhatsApp reply ────────────────────────────────────────────
    if (phone) {
      const message = formatWhatsAppSummary(analyse)
      await sendWhatsApp(phone, message)
    }

    return NextResponse.json({ success: true, vorgangId })

  } catch (err) {
    console.error('Analysis error:', err)

    // Update status to flag error
    await supabaseAdmin
      .from('vorgaenge')
      .update({ status: 'pruefen', updated_at: new Date().toISOString() })
      .eq('id', vorgangId)

    // Notify user via WhatsApp
    if (phone) {
      await sendWhatsApp(
        phone,
        `⚠️ Bei der Analyse ist ein Fehler aufgetreten. ` +
        `Bitte überprüfen Sie die Rechnung manuell im Dashboard:\n` +
        `https://mediright-app.vercel.app/dashboard`
      )
    }

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
