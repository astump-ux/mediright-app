/**
 * /api/analyze-auto
 *
 * Unified background job: classify → analyse → match → notify.
 *
 * Arztrechnung pipeline:
 *   1. Classify PDF
 *   2. GOÄ analysis
 *   3. Update vorgaenge
 *   4. Check open kassenabrechnungen for a matching position
 *   5. Send WhatsApp result
 *
 * Kassenabrechnung pipeline:
 *   1. Classify PDF
 *   2. Kasse analysis (with rechnungen[] groups)
 *   3. Create kassenabrechnungen record
 *   4. Fuzzy-match rechnungen[] → existing vorgaenge
 *   5. Remove placeholder vorgang
 *   6. Send WhatsApp result
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { classifyPdf, analyzeRechnungPdf, analyzeKassePdf } from '@/lib/goae-analyzer'
import { matchKasseToVorgaenge, matchVorgangToKasse } from '@/lib/matching'
import twilio from 'twilio'

export const maxDuration = 60

function validateInternalSecret(req: NextRequest): boolean {
  return req.headers.get('x-internal-secret') === process.env.INTERNAL_API_SECRET
}

async function sendWhatsApp(to: string, message: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_WHATSAPP_NUMBER: from } = process.env
  if (!sid || !token || !from) return
  const client = twilio(sid, token)
  await client.messages.create({ from: `whatsapp:${from}`, to: `whatsapp:${to}`, body: message })
}

function safeJson<T>(raw: string): T {
  return JSON.parse(
    raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
  ) as T
}
void safeJson // used indirectly via analyzeKassePdf

export async function POST(request: NextRequest) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { vorgangId, userId, phone } = await request.json()
  console.log('[analyze-auto] START vorgangId:', vorgangId)

  if (!vorgangId || !userId) {
    return NextResponse.json({ error: 'Missing vorgangId or userId' }, { status: 400 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    if (phone) await sendWhatsApp(phone, `⚠️ Konfigurationsfehler: ANTHROPIC_API_KEY fehlt.`)
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  // ── 1. Fetch vorgang ───────────────────────────────────────────────────────
  const { data: vorgang } = await supabaseAdmin
    .from('vorgaenge')
    .select('id, pdf_storage_path')
    .eq('id', vorgangId)
    .single()

  if (!vorgang?.pdf_storage_path) {
    if (phone) await sendWhatsApp(phone, `❌ Vorgang nicht gefunden. Bitte Dokument erneut senden.`)
    return NextResponse.json({ error: 'Vorgang not found' }, { status: 404 })
  }

  // ── 2. Download PDF ────────────────────────────────────────────────────────
  const { data: fileData, error: dlErr } = await supabaseAdmin.storage
    .from('rechnungen')
    .download(vorgang.pdf_storage_path)

  if (dlErr || !fileData) {
    if (phone) await sendWhatsApp(phone, `❌ PDF konnte nicht geladen werden. Bitte erneut senden.`)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }

  const pdfBuffer = Buffer.from(await fileData.arrayBuffer())
  console.log('[analyze-auto] PDF size:', pdfBuffer.length, 'bytes')

  // ── 3. Load user PKV name ──────────────────────────────────────────────────
  let pkvName: string | null = null
  try {
    const { data: p } = await supabaseAdmin.from('profiles').select('pkv_name').eq('id', userId).single()
    pkvName = p?.pkv_name ?? null
  } catch { /* migration 005 not applied yet */ }

  // ── 4. Classify ────────────────────────────────────────────────────────────
  const docType = await classifyPdf(pdfBuffer, pkvName)
  console.log('[analyze-auto] docType:', docType)

  // ── 5. Route ───────────────────────────────────────────────────────────────
  try {
    if (docType === 'kassenabrechnung') {
      await runKassePipeline(vorgangId, userId, phone, pdfBuffer, vorgang.pdf_storage_path)
    } else {
      await runArztPipeline(vorgangId, userId, phone, pdfBuffer)
    }
    return NextResponse.json({ success: true, vorgangId, docType })
  } catch (err) {
    const errStr = String(err)
    const errDetail = err instanceof Error ? err.message : errStr
    console.error('[analyze-auto] pipeline error:', errDetail, err)

    await supabaseAdmin
      .from('vorgaenge')
      .update({ status: 'pruefen', updated_at: new Date().toISOString() })
      .eq('id', vorgangId)

    if (phone) {
      // Send actual error reason so user/developer can diagnose
      const hint = errDetail.toLowerCase().includes('json')
        ? 'Claude hat kein gültiges JSON zurückgegeben.'
        : errDetail.toLowerCase().includes('timeout') || errDetail.toLowerCase().includes('deadline')
        ? 'Zeitüberschreitung — bitte erneut senden.'
        : errDetail.toLowerCase().includes('content') || errDetail.toLowerCase().includes('block')
        ? 'Das PDF-Format wird nicht unterstützt (z.B. gescanntes Bild ohne Text).'
        : `Fehler: ${errDetail.slice(0, 120)}`

      await sendWhatsApp(
        phone,
        `⚠️ *Analyse fehlgeschlagen*\n\n${hint}\n\n` +
        `Bitte laden Sie das Dokument erneut hoch oder prüfen Sie es manuell:\n` +
        `https://mediright-app.vercel.app/rechnungen`
      )
    }
    return NextResponse.json({ error: errDetail }, { status: 500 })
  }
}

// ── Arztrechnung pipeline ──────────────────────────────────────────────────────
async function runArztPipeline(
  vorgangId: string,
  userId: string,
  phone: string | undefined,
  pdfBuffer: Buffer
) {
  const analyse = await analyzeRechnungPdf(pdfBuffer)
  console.log('[analyze-auto] GOÄ done, arzt:', analyse.arztName)

  // Write arzt_name directly onto vorgaenge (denormalized) so matching can use it
  await supabaseAdmin.from('vorgaenge').update({
    arzt_name:                        analyse.arztName ?? null,
    rechnungsdatum:                   analyse.rechnungsdatum,
    rechnungsnummer:                  analyse.rechnungsnummer,
    betrag_gesamt:                    analyse.betragGesamt,
    goae_positionen:                  analyse.goaePositionen,
    max_faktor:                       analyse.maxFaktor,
    flag_faktor_ueber_schwellenwert:  analyse.flagFaktorUeberSchwellenwert,
    flag_fehlende_begruendung:        analyse.flagFehlendeBegrundung,
    einsparpotenzial:                 analyse.einsparpotenzial,
    claude_analyse:                   analyse,
    status:                           'pruefen',
    updated_at:                       new Date().toISOString(),
  }).eq('id', vorgangId)

  // Upsert Arzt record + link back via arzt_id
  let arztId: string | null = null
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
      arztId = arzt.id
      await supabaseAdmin.from('vorgaenge').update({ arzt_id: arztId }).eq('id', vorgangId)
    }
  }

  // ── Check for matching open kasse position ────────────────────────────────
  console.log('[analyze-auto] Checking for matching kasse position...')
  await matchVorgangToKasse(vorgangId, userId, analyse.arztName, analyse.rechnungsdatum, analyse.betragGesamt)

  // Re-fetch to see if a match was found
  const { data: updated } = await supabaseAdmin
    .from('vorgaenge')
    .select('kassenabrechnung_id, kasse_match_status')
    .eq('id', vorgangId)
    .single()

  const kasseMatched = updated?.kassenabrechnung_id != null

  // ── WhatsApp notification ─────────────────────────────────────────────────
  if (phone) {
    const lines: string[] = [
      `🧾 *Arztrechnung analysiert*`,
      ``,
      analyse.arztName
        ? `👨‍⚕️ *${analyse.arztName}*${analyse.arztFachgebiet ? ` · ${analyse.arztFachgebiet}` : ''}`
        : '',
      `💶 Betrag: *${analyse.betragGesamt.toFixed(2)} €*`,
    ]
    if (analyse.flagFaktorUeberSchwellenwert) lines.push(`⚠️ Faktor über 2,3× Schwellenwert`)
    if (analyse.flagFehlendeBegrundung)       lines.push(`❗ Begründung fehlt (§12 GOÄ)`)
    if (analyse.einsparpotenzial > 0)
      lines.push(`💡 Einsparpotenzial: *${analyse.einsparpotenzial.toFixed(2)} €*`)
    lines.push(``)
    if (kasseMatched) {
      lines.push(`✅ *Kassenbescheid vorhanden* — Erstattung bereits erfasst.`)
    } else {
      lines.push(`🕐 Kein offener Kassenbescheid gefunden — Rechnung ausstehend.`)
    }
    lines.push(``)
    lines.push(`📊 https://mediright-app.vercel.app/rechnungen`)
    await sendWhatsApp(phone, lines.filter(Boolean).join('\n'))
  }
}

// ── Kassenabrechnung pipeline ──────────────────────────────────────────────────
async function runKassePipeline(
  vorgangId: string,
  userId: string,
  phone: string | undefined,
  pdfBuffer: Buffer,
  pdfStoragePath: string
) {
  const analyse = await analyzeKassePdf(pdfBuffer)
  console.log('[analyze-auto] Kasse done, rechnungen:', analyse.rechnungen?.length ?? 0)

  // ── Compute split Einsparpotenzial from aktionstyp per position ─────────────
  // Iterate all positions across all rechnungen to sum up by who should act.
  let betragWiderspruchKasse = 0
  let betragKorrekturArzt    = 0
  for (const gruppe of analyse.rechnungen ?? []) {
    for (const pos of gruppe.positionen ?? []) {
      const kuerzung = (pos.betragEingereicht ?? 0) - (pos.betragErstattet ?? 0)
      if (kuerzung <= 0) continue
      if (pos.aktionstyp === 'widerspruch_kasse') betragWiderspruchKasse += kuerzung
      else if (pos.aktionstyp === 'korrektur_arzt') betragKorrekturArzt += kuerzung
      else if (pos.status === 'abgelehnt') betragWiderspruchKasse += kuerzung  // fallback
      else if (pos.status === 'gekuerzt')  betragKorrekturArzt    += kuerzung  // fallback
    }
  }

  // ── Create kassenabrechnungen record ───────────────────────────────────────
  const { data: kasseRecord, error: kasseErr } = await supabaseAdmin
    .from('kassenabrechnungen')
    .insert({
      user_id: userId,
      pdf_storage_path: pdfStoragePath,
      kasse_analyse: analyse,
      bescheiddatum: analyse.bescheiddatum,
      referenznummer: analyse.referenznummer,
      betrag_eingereicht:        analyse.betragEingereicht ?? 0,
      betrag_erstattet:          analyse.betragErstattet ?? 0,
      betrag_abgelehnt:          analyse.betragAbgelehnt ?? 0,
      widerspruch_empfohlen:     analyse.widerspruchEmpfohlen ?? false,
      selbstbehalt_abgezogen:    analyse.selbstbehaltAbgezogen   ?? null,
      selbstbehalt_verbleibend:  analyse.selbstbehaltVerbleibend ?? null,
      selbstbehalt_jahresgrenze: analyse.selbstbehaltJahresgrenze ?? null,
      betrag_widerspruch_kasse:  Math.round(betragWiderspruchKasse * 100) / 100,
      betrag_korrektur_arzt:     Math.round(betragKorrekturArzt    * 100) / 100,
    })
    .select('id')
    .single()

  if (kasseErr || !kasseRecord) {
    throw new Error(`kassenabrechnung insert failed: ${kasseErr?.message}`)
  }

  // ── Fuzzy-match rechnungen → vorgaenge ────────────────────────────────────
  const updatedRechnungen = await matchKasseToVorgaenge(
    kasseRecord.id,
    userId,
    analyse.rechnungen ?? []
  )

  // Persist updated rechnungen (with matchedVorgangId) back into kasse_analyse
  await supabaseAdmin
    .from('kassenabrechnungen')
    .update({ kasse_analyse: { ...analyse, rechnungen: updatedRechnungen } })
    .eq('id', kasseRecord.id)

  // ── Remove placeholder vorgang (was only a carrier for the PDF) ───────────
  await supabaseAdmin.from('vorgaenge').delete().eq('id', vorgangId)

  // ── WhatsApp notification ─────────────────────────────────────────────────
  if (phone) {
    const quote = analyse.erstattungsquote?.toFixed(0) ?? '?'
    const matchedCount = updatedRechnungen.filter(r => r.matchedVorgangId).length
    const unmatchedCount = updatedRechnungen.length - matchedCount

    const lines = [
      `🏥 *Kassenbescheid analysiert*`,
      ``,
      `💶 Eingereicht: *${analyse.betragEingereicht?.toFixed(2)} €*`,
      `✅ Erstattet: *${analyse.betragErstattet?.toFixed(2)} €* (${quote}%)`,
      analyse.betragAbgelehnt > 0
        ? `❌ Abgelehnt: *${analyse.betragAbgelehnt?.toFixed(2)} €*`
        : null,
      ``,
      updatedRechnungen.length > 0
        ? `🔗 ${matchedCount}/${updatedRechnungen.length} Arztrechnungen automatisch zugeordnet`
        : null,
      unmatchedCount > 0
        ? `⚠️ ${unmatchedCount} Position(en) ohne Arztrechnung — bitte prüfen`
        : null,
      ``,
      analyse.zusammenfassung,
      analyse.widerspruchEmpfohlen && betragWiderspruchKasse > 0
        ? `\n⚡ *Widerspruch bei AXA empfohlen:* ${betragWiderspruchKasse.toFixed(2)} €\n${analyse.widerspruchBegruendung ?? ''}`
        : null,
      betragKorrekturArzt > 0
        ? `📝 *Korrektur bei Arzt/Labor prüfen:* ${betragKorrekturArzt.toFixed(2)} €`
        : null,
      ``,
      `📊 https://mediright-app.vercel.app/kassenabrechnung`,
    ].filter((l): l is string => l !== null)

    await sendWhatsApp(phone, lines.join('\n'))
  }
}
