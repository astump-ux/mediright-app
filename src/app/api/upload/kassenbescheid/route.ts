/**
 * POST /api/upload/kassenbescheid
 *
 * Authenticated in-app upload for AXA Kassenbescheide.
 * Flow: receive PDF → store in Supabase Storage → analyze with Claude → create kassenabrechnungen
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { analyzeKassePdf } from '@/lib/goae-analyzer'
import { matchKasseToVorgaenge } from '@/lib/matching'
import { checkAndDeductAnalysisCredit } from '@/lib/credits'
import { randomUUID } from 'crypto'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse multipart form data ──────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!file.type.includes('pdf') && !(file as File).name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer())
  if (pdfBuffer.length === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // ── Credit gate — check BEFORE uploading to storage ────────────────────────
  // Kassenbescheid KI-Analyse (legal reasoning + Widerspruchsbrief) costs 1 credit.
  const creditCheck = await checkAndDeductAnalysisCredit(user.id, 'kasse_analyse', { source: 'in_app_upload' })
  if (!creditCheck.allowed) {
    console.log('[upload/kassenbescheid] credit gate blocked for user:', user.id)
    return NextResponse.json(
      {
        error: 'no_credits',
        message: 'Keine Analyse-Credits verfügbar. Bitte kaufe Credits, um Kassenbescheide analysieren zu lassen.',
      },
      { status: 402 }
    )
  }

  // ── Fetch user PKV name for context injection ──────────────────────────────
  let pkvName: string | null = null
  try {
    const { data: p } = await admin.from('profiles').select('pkv_name').eq('id', user.id).single()
    pkvName = (p as { pkv_name?: string | null } | null)?.pkv_name ?? null
  } catch { /* profiles table may not have pkv_name yet */ }

  // ── Upload PDF to Supabase Storage ─────────────────────────────────────────
  const fileName = `${user.id}/kasse_${Date.now()}_${randomUUID().slice(0, 8)}.pdf`
  const { error: uploadError } = await admin.storage
    .from('rechnungen')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error('[upload/kassenbescheid] Storage upload failed:', uploadError.message)
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
  }

  try {
    // ── Analyze with Claude ──────────────────────────────────────────────────
    const analyse = await analyzeKassePdf(pdfBuffer, pkvName)

    // ── Compute Einsparpotenzial split ───────────────────────────────────────
    let betragWiderspruchKasse = 0
    let betragKorrekturArzt    = 0
    for (const gruppe of analyse.rechnungen ?? []) {
      for (const pos of gruppe.positionen ?? []) {
        const kuerzung = (pos.betragEingereicht ?? 0) - (pos.betragErstattet ?? 0)
        if (kuerzung <= 0) continue
        if (pos.aktionstyp === 'widerspruch_kasse')      betragWiderspruchKasse += kuerzung
        else if (pos.aktionstyp === 'korrektur_arzt')    betragKorrekturArzt    += kuerzung
        else if (pos.status === 'abgelehnt')             betragWiderspruchKasse += kuerzung
        else if (pos.status === 'gekuerzt')              betragKorrekturArzt    += kuerzung
      }
    }

    // ── Create kassenabrechnungen record ─────────────────────────────────────
    const { data: kasseRecord, error: kasseErr } = await admin
      .from('kassenabrechnungen')
      .insert({
        user_id:                    user.id,
        pdf_storage_path:           fileName,
        kasse_analyse:              analyse,
        bescheiddatum:              analyse.bescheiddatum,
        referenznummer:             analyse.referenznummer,
        betrag_eingereicht:         analyse.betragEingereicht ?? 0,
        betrag_erstattet:           analyse.betragErstattet   ?? 0,
        betrag_abgelehnt:           analyse.betragAbgelehnt   ?? 0,
        widerspruch_empfohlen:      analyse.widerspruchEmpfohlen ?? false,
        selbstbehalt_abgezogen:     analyse.selbstbehaltAbgezogen   ?? null,
        selbstbehalt_verbleibend:   analyse.selbstbehaltVerbleibend ?? null,
        selbstbehalt_jahresgrenze:  analyse.selbstbehaltJahresgrenze ?? null,
        betrag_widerspruch_kasse:   Math.round(betragWiderspruchKasse * 100) / 100,
        betrag_korrektur_arzt:      Math.round(betragKorrekturArzt    * 100) / 100,
      })
      .select('id')
      .single()

    if (kasseErr || !kasseRecord) {
      throw new Error(`kassenabrechnungen insert failed: ${kasseErr?.message}`)
    }

    // ── Fuzzy-match rechnungen → existing vorgaenge ──────────────────────────
    const updatedRechnungen = await matchKasseToVorgaenge(
      kasseRecord.id,
      user.id,
      analyse.rechnungen ?? []
    )

    // Persist updated rechnungen (with matchedVorgangId) back into kasse_analyse
    await admin
      .from('kassenabrechnungen')
      .update({ kasse_analyse: { ...analyse, rechnungen: updatedRechnungen } })
      .eq('id', kasseRecord.id)

    const matchedCount = updatedRechnungen.filter(r => r.matchedVorgangId).length

    return NextResponse.json({
      success: true,
      kassenbescheidId: kasseRecord.id,
      bescheiddatum:    analyse.bescheiddatum,
      referenznummer:   analyse.referenznummer,
      betragEingereicht: analyse.betragEingereicht,
      betragErstattet:   analyse.betragErstattet,
      betragAbgelehnt:   analyse.betragAbgelehnt,
      erstattungsquote:  analyse.erstattungsquote,
      widerspruchEmpfohlen: analyse.widerspruchEmpfohlen,
      matchedRechnungen: matchedCount,
      totalRechnungen:   updatedRechnungen.length,
      zusammenfassung:   analyse.zusammenfassung,
    })
  } catch (err) {
    console.error('[upload/kassenbescheid] Analysis error:', err)
    return NextResponse.json(
      { error: `Analyse fehlgeschlagen: ${String(err)}` },
      { status: 500 }
    )
  }
}
