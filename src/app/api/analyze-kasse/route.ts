import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { analyzeKassePdf } from '@/lib/goae-analyzer'
import twilio from 'twilio'

function validateInternalSecret(request: NextRequest): boolean {
  const secret = request.headers.get('x-internal-secret')
  return secret === process.env.INTERNAL_API_SECRET
}

async function sendWhatsApp(to: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER
  if (!accountSid || !authToken || !fromNumber) return
  const client = twilio(accountSid, authToken)
  await client.messages.create({
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${to}`,
    body: message,
  })
}

export async function POST(request: NextRequest) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { vorgangId, userId, phone } = await request.json()
  if (!vorgangId || !userId) {
    return NextResponse.json({ error: 'Missing vorgangId or userId' }, { status: 400 })
  }

  try {
    // ── 1. Fetch kasse_pdf_storage_path ───────────────────────────────────────
    const { data: vorgang, error: fetchError } = await supabaseAdmin
      .from('vorgaenge')
      .select('id, kasse_pdf_storage_path')
      .eq('id', vorgangId)
      .single()

    if (fetchError || !vorgang?.kasse_pdf_storage_path) {
      throw new Error(`Vorgang or kasse PDF not found: ${fetchError?.message}`)
    }

    // ── 2. Download PDF from Supabase Storage ─────────────────────────────────
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('rechnungen')
      .download(vorgang.kasse_pdf_storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Storage download failed: ${downloadError?.message}`)
    }

    const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

    // ── 3. Analyse with Claude ────────────────────────────────────────────────
    const analyse = await analyzeKassePdf(pdfBuffer)

    // ── 4. Update Vorgang ─────────────────────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('vorgaenge')
      .update({
        kasse_analyse: analyse,
        betrag_erstattet: analyse.betragErstattet,
        betrag_abgelehnt: analyse.betragAbgelehnt,
        kasse_referenznummer: analyse.referenznummer,
        kasse_eingegangen_am: analyse.bescheiddatum,
        status: analyse.betragAbgelehnt > 0 ? 'pruefen' : 'erstattet',
        updated_at: new Date().toISOString(),
      })
      .eq('id', vorgangId)

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`)
    }

    // ── 5. [PHASE 2] Extract rejection patterns → tariff_exclusions ──────────
    // TODO: After each successful analyse, extract patterns and upsert into tariff_exclusions:
    //   for each position in analyse.rechnungen[].positionen where status='abgelehnt'|'gekuerzt':
    //     upsert { tariff, goae_ziffer, rejection_type, rejection_reason, source:'ki_extraktion' }
    //     increment occurrence_count; escalate confidence: 1-2→'einzelfall', 3-5→'haeufig', 6+→'bestaetigt'
    // See: /sessions/kind-beautiful-galileo/mnt/.auto-memory/project_tariff_intelligence.md
    // ─────────────────────────────────────────────────────────────────────────

    // ── 6. Send WhatsApp summary ──────────────────────────────────────────────
    if (phone) {
      const quote = analyse.erstattungsquote?.toFixed(0) ?? '?'
      const widerspruch = analyse.widerspruchEmpfohlen
        ? `\n\n⚡ *Widerspruch empfohlen!*\n${analyse.widerspruchBegruendung ?? ''}`
        : ''

      const message =
        `🏥 *Kassenabrechnung analysiert*\n\n` +
        `💶 Eingereicht: *${analyse.betragEingereicht?.toFixed(2)} €*\n` +
        `✅ Erstattet: *${analyse.betragErstattet?.toFixed(2)} €* (${quote}%)\n` +
        (analyse.betragAbgelehnt > 0 ? `❌ Abgelehnt: *${analyse.betragAbgelehnt?.toFixed(2)} €*\n` : '') +
        `\n${analyse.zusammenfassung}` +
        widerspruch +
        `\n\n📊 Details: https://mediright-app.vercel.app/rechnungen`

      await sendWhatsApp(phone, message)
    }

    return NextResponse.json({ success: true, vorgangId })

  } catch (err) {
    console.error('Kasse analysis error:', err)

    if (phone) {
      await sendWhatsApp(
        phone,
        `⚠️ Bei der Analyse des Kassenbescheids ist ein Fehler aufgetreten. ` +
        `Bitte prüfen Sie den Bescheid manuell im Dashboard:\n` +
        `https://mediright-app.vercel.app/rechnungen`
      )
    }

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
