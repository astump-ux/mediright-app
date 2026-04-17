/**
 * POST /api/upload/arztrechnung
 *
 * Authenticated in-app upload for Arztrechnungen.
 * Flow: receive PDF → store in Supabase Storage → analyze with Claude → create/update vorgaenge
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { analyzeRechnungPdf } from '@/lib/goae-analyzer'
import { matchVorgangToKasse } from '@/lib/matching'
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

  // ── Upload PDF to Supabase Storage ─────────────────────────────────────────
  const fileName = `${user.id}/arzt_${Date.now()}_${randomUUID().slice(0, 8)}.pdf`
  const { error: uploadError } = await admin.storage
    .from('rechnungen')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error('[upload/arztrechnung] Storage upload failed:', uploadError.message)
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // ── Create placeholder vorgaenge entry ─────────────────────────────────────
  const { data: vorgang, error: insertErr } = await admin
    .from('vorgaenge')
    .insert({
      user_id: user.id,
      pdf_storage_path: fileName,
      status: 'eingereicht',
    })
    .select('id')
    .single()

  if (insertErr || !vorgang) {
    return NextResponse.json({ error: `Vorgang insert failed: ${insertErr?.message}` }, { status: 500 })
  }

  const vorgangId = vorgang.id

  try {
    // ── Fetch user PKV name for tariff context injection ─────────────────────
    let pkvName: string | null = null
    try {
      const { data: p } = await admin.from('profiles').select('pkv_name').eq('id', user.id).single()
      pkvName = (p as { pkv_name?: string | null } | null)?.pkv_name ?? null
    } catch { /* profiles table may not have pkv_name yet */ }

    // ── Analyze with Claude ──────────────────────────────────────────────────
    const analyse = await analyzeRechnungPdf(pdfBuffer, pkvName)

    // ── Update vorgaenge ─────────────────────────────────────────────────────
    await admin.from('vorgaenge').update({
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

    // ── Upsert Arzt record ───────────────────────────────────────────────────
    if (analyse.arztName) {
      const { data: arzt } = await admin
        .from('aerzte')
        .upsert(
          { user_id: user.id, name: analyse.arztName, fachgebiet: analyse.arztFachgebiet },
          { onConflict: 'user_id,name', ignoreDuplicates: false }
        )
        .select('id')
        .single()
      if (arzt) {
        await admin.from('vorgaenge').update({ arzt_id: arzt.id }).eq('id', vorgangId)
      }
    }

    // ── Try to match to an open Kassenbescheid ───────────────────────────────
    await matchVorgangToKasse(vorgangId, user.id, analyse.arztName, analyse.rechnungsdatum, analyse.betragGesamt)

    return NextResponse.json({
      success: true,
      vorgangId,
      arztName:      analyse.arztName,
      betragGesamt:  analyse.betragGesamt,
      einsparpotenzial: analyse.einsparpotenzial,
      flagFaktorUeberSchwellenwert: analyse.flagFaktorUeberSchwellenwert,
      flagFehlendeBegrundung: analyse.flagFehlendeBegrundung,
      zusammenfassung: analyse.zusammenfassung,
      positionen: analyse.goaePositionen.length,
    })
  } catch (err) {
    console.error('[upload/arztrechnung] Analysis error:', err)
    // Keep the vorgang but mark as needing review
    await admin.from('vorgaenge').update({
      status: 'pruefen',
      updated_at: new Date().toISOString(),
    }).eq('id', vorgangId)

    return NextResponse.json(
      { error: `Analyse fehlgeschlagen: ${String(err)}`, vorgangId },
      { status: 500 }
    )
  }
}
