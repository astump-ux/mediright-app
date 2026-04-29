/**
 * POST /api/kassenabrechnungen/[id]/neu-analysieren
 *
 * Lädt ein weiteres PDF-Dokument (z.B. AXA-Begründungsschreiben) hoch und
 * re-analysiert den Fall mit ALLEN vorliegenden Dokumenten gemeinsam.
 *
 * Flow:
 *   1. Neues PDF aus Form-Data lesen
 *   2. Original-PDF aus Supabase Storage laden
 *   3. analyzeKasseMultiplePdfs([original, neu]) aufrufen
 *   4. kassenabrechnungen-Record mit neuer Analyse aktualisieren
 *   5. Matching neu ausführen
 *   6. Redirect → Seite neu laden
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { analyzeKasseMultiplePdfs, analyzeKassePdf } from '@/lib/goae-analyzer'
import { matchKasseToVorgaenge } from '@/lib/matching'
import { checkAndDeductAnalysisCredit } from '@/lib/credits'
import { randomUUID } from 'crypto'

export const maxDuration = 120

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // ── Ownership-Check ───────────────────────────────────────────────────────
  const { data: kasse } = await admin
    .from('kassenabrechnungen')
    .select('id, user_id, pdf_storage_path')
    .eq('id', id)
    .maybeSingle()

  if (!kasse) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  if (kasse.user_id !== user.id) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  // ── Credit gate ───────────────────────────────────────────────────────────
  const creditCheck = await checkAndDeductAnalysisCredit(user.id, 'kasse_analyse', { source: 'neu_analysieren' })
  if (!creditCheck.allowed) {
    return NextResponse.json(
      { error: 'no_credits', message: 'Keine Analyse-Credits verfügbar.' },
      { status: 402 }
    )
  }

  // ── Neues PDF aus Form-Data ───────────────────────────────────────────────
  let formData: FormData
  try { formData = await request.formData() }
  catch { return NextResponse.json({ error: 'Ungültige Formulardaten' }, { status: 400 }) }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Keine Datei übermittelt' }, { status: 400 })
  }
  if (!file.type.includes('pdf') && !(file as File).name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Nur PDF-Dateien' }, { status: 400 })
  }

  const newPdfBuffer = Buffer.from(await file.arrayBuffer())
  if (newPdfBuffer.length === 0) return NextResponse.json({ error: 'Leere Datei' }, { status: 400 })

  // ── Neues PDF in Storage speichern ────────────────────────────────────────
  const newFileName = `${user.id}/kasse_zusatz_${Date.now()}_${randomUUID().slice(0, 8)}.pdf`
  await admin.storage
    .from('rechnungen')
    .upload(newFileName, newPdfBuffer, { contentType: 'application/pdf', upsert: false })

  // ── Profil + Tarif laden ──────────────────────────────────────────────────
  let pkvName: string | null = null
  let tarifProfil: Record<string, unknown> | null = null
  try {
    const [{ data: profile }, { data: tp }] = await Promise.all([
      admin.from('profiles').select('pkv_name').eq('id', user.id).single(),
      admin.from('tarif_profile').select('profil_json').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single(),
    ])
    pkvName    = (profile as { pkv_name?: string | null } | null)?.pkv_name ?? null
    tarifProfil = (tp as { profil_json?: Record<string, unknown> | null } | null)?.profil_json ?? null
  } catch { /* non-critical */ }

  try {
    // ── Original-PDF aus Storage laden (falls vorhanden) ──────────────────
    let pdfBuffers: Buffer[]

    if (kasse.pdf_storage_path) {
      const { data: originalBlob } = await admin.storage
        .from('rechnungen')
        .download(kasse.pdf_storage_path)

      if (originalBlob) {
        const originalBuffer = Buffer.from(await originalBlob.arrayBuffer())
        // Beide Dokumente gemeinsam analysieren
        pdfBuffers = [originalBuffer, newPdfBuffer]
      } else {
        // Original nicht mehr vorhanden — nur neues Dokument
        pdfBuffers = [newPdfBuffer]
      }
    } else {
      pdfBuffers = [newPdfBuffer]
    }

    // ── Analyse ───────────────────────────────────────────────────────────
    const analyse = pdfBuffers.length > 1
      ? await analyzeKasseMultiplePdfs(pdfBuffers, pkvName, tarifProfil)
      : await analyzeKassePdf(pdfBuffers[0], pkvName, tarifProfil)

    // ── Einsparpotenzial-Split ─────────────────────────────────────────────
    let betragWiderspruchKasse = 0
    let betragKorrekturArzt    = 0
    for (const gruppe of analyse.rechnungen ?? []) {
      for (const pos of gruppe.positionen ?? []) {
        const kuerzung = (pos.betragEingereicht ?? 0) - (pos.betragErstattet ?? 0)
        if (kuerzung <= 0) continue
        if (pos.aktionstyp === 'widerspruch_kasse')   betragWiderspruchKasse += kuerzung
        else if (pos.aktionstyp === 'korrektur_arzt') betragKorrekturArzt    += kuerzung
        else if (pos.status === 'abgelehnt')          betragWiderspruchKasse += kuerzung
        else if (pos.status === 'gekuerzt')           betragKorrekturArzt    += kuerzung
      }
    }

    // ── Kassenabrechnungen updaten ─────────────────────────────────────────
    await admin
      .from('kassenabrechnungen')
      .update({
        kasse_analyse:             analyse,
        bescheiddatum:             analyse.bescheiddatum,
        referenznummer:            analyse.referenznummer,
        betrag_eingereicht:        analyse.betragEingereicht ?? 0,
        betrag_erstattet:          analyse.betragErstattet   ?? 0,
        betrag_abgelehnt:          analyse.betragAbgelehnt   ?? 0,
        widerspruch_empfohlen:     analyse.widerspruchEmpfohlen ?? false,
        selbstbehalt_abgezogen:    analyse.selbstbehaltAbgezogen   ?? null,
        selbstbehalt_verbleibend:  analyse.selbstbehaltVerbleibend ?? null,
        selbstbehalt_jahresgrenze: analyse.selbstbehaltJahresgrenze ?? null,
        betrag_widerspruch_kasse:  Math.round(betragWiderspruchKasse * 100) / 100,
        betrag_korrektur_arzt:     Math.round(betragKorrekturArzt    * 100) / 100,
      })
      .eq('id', id)

    // ── Matching neu ausführen ─────────────────────────────────────────────
    const updatedRechnungen = await matchKasseToVorgaenge(id, user.id, analyse.rechnungen ?? [])
    await admin
      .from('kassenabrechnungen')
      .update({ kasse_analyse: { ...analyse, rechnungen: updatedRechnungen } })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      docsAnalyzed: pdfBuffers.length,
      bescheiddatum: analyse.bescheiddatum,
      betragAbgelehnt: analyse.betragAbgelehnt,
      widerspruchEmpfohlen: analyse.widerspruchEmpfohlen,
    })
  } catch (err) {
    console.error('[neu-analysieren] Fehler:', err)
    return NextResponse.json({ error: `Analyse fehlgeschlagen: ${String(err)}` }, { status: 500 })
  }
}
