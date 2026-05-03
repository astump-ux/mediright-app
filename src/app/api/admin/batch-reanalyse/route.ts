/**
 * POST /api/admin/batch-reanalyse
 *
 * Analysiert alle Kassenbescheide eines Users mit dem aktuellen Prompt neu
 * und triggert ggf. eine AVB-Neu-Analyse wenn goae_ausschluesse fehlen.
 *
 * Auth: x-internal-secret Header ODER eingeloggter Admin-User.
 * Body: { userId: string }  ← welcher User neu analysiert werden soll
 *
 * Was es tut:
 *  1. Alle kassenabrechnungen des Users mit pdf_storage_path laden
 *  2. Für jede: PDF aus Storage → analyzeKassePdf() → kasse_analyse updaten
 *     Bestehende matchedVorgangId-Links bleiben erhalten (kein Re-Matching)
 *     Flache Betrags-Spalten werden ebenfalls aktualisiert
 *  3. tarif_profil prüfen: fehlt goae_ausschluesse? → AVB-Route intern callen
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { analyzeKassePdf } from '@/lib/goae-analyzer'
import { callAiWithPdf } from '@/lib/ai-client'
import { searchPkvPrecedentsByZiffer } from '@/lib/legal-search'
import { logKiUsage } from '@/lib/ki-usage'

export const maxDuration = 300

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mediright-app.vercel.app'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function hasInternalSecret(req: NextRequest): boolean {
  return INTERNAL_SECRET !== '' && req.headers.get('x-internal-secret') === INTERNAL_SECRET
}

async function getAdminUserId(req: NextRequest): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    // Accept any authenticated user calling for their own re-analysis
    return user.id
  } catch {
    return null
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()

  // Determine target userId
  let targetUserId: string | null = null

  if (hasInternalSecret(req)) {
    const body = await req.json().catch(() => ({}))
    targetUserId = body.userId ?? null
    if (!targetUserId) {
      return NextResponse.json({ error: 'userId required in body' }, { status: 400 })
    }
  } else {
    // Fallback: logged-in user re-analyzes their own data
    targetUserId = await getAdminUserId(req)
    if (!targetUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Fetch PKV name once (used for all kasse analyses)
  const { data: profile } = await admin
    .from('profiles')
    .select('pkv_name')
    .eq('id', targetUserId)
    .single()
  const pkvName = (profile as { pkv_name?: string | null } | null)?.pkv_name ?? null

  const report: {
    kassenbescheide: {
      id: string
      status: 'ok' | 'error'
      error?: string
      enrichment?: 'ran' | 'skipped_no_pdf' | 'skipped_no_bs' | 'failed'
      enrichment_error?: string
      tarif_klauseln_count?: number
      rechtsprechung_gefunden?: boolean
    }[]
    avb: { status: string; error?: string }
  } = {
    kassenbescheide: [],
    avb: { status: 'skipped' },
  }

  // ── 1. Kassenbescheide neu analysieren ───────────────────────────────────

  const { data: kasseList } = await admin
    .from('kassenabrechnungen')
    .select('id, user_id, pdf_storage_path, kasse_analyse')
    .eq('user_id', targetUserId)
    .not('pdf_storage_path', 'is', null)
    .order('created_at', { ascending: false })

  for (const kasse of kasseList ?? []) {
    try {
      // Download PDF from storage
      const { data: fileData, error: dlError } = await admin.storage
        .from('rechnungen')
        .download(kasse.pdf_storage_path as string)

      if (dlError || !fileData) {
        throw new Error(`Storage-Download fehlgeschlagen: ${dlError?.message}`)
      }

      const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

      // Re-analyse mit aktuellem Prompt (enthält jetzt ablehnungsbegruendung)
      const analyse = await analyzeKassePdf(pdfBuffer, pkvName)

      logKiUsage({
        callType: 'kasse_analyse',
        model: 'claude-sonnet-4-6',
        inputTokens: 0,
        outputTokens: 0,
        userId: targetUserId,
      }).catch(() => {})

      // Bestehende matchedVorgangId-Links + ablehnungsbegruendung aus alten Daten übernehmen.
      // matchedVorgangId: Verknüpfungen zu Vorgängen nicht überschreiben.
      // ablehnungsbegruendung: wurde durch Begründungsschreiben (neu-analysieren) gesetzt
      //   und muss nach Neuanalyse wieder eingesetzt werden — sie steckt nicht im Haupt-PDF.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingAnalyse = kasse.kasse_analyse as Record<string, any> | null
      const matchMap       = new Map<string, string>()   // arztName → matchedVorgangId
      const begruendungMap = new Map<string, string>()   // goaeZiffer → ablehnungsbegruendung

      for (const r of existingAnalyse?.rechnungen ?? []) {
        if (r.matchedVorgangId && r.arztName) {
          matchMap.set(r.arztName, r.matchedVorgangId)
        }
        for (const pos of r.positionen ?? []) {
          const ziffer = String(pos.goaeZiffer ?? pos.ziffer ?? '')
          if (ziffer && pos.ablehnungsbegruendung) {
            begruendungMap.set(ziffer, pos.ablehnungsbegruendung)
          }
        }
      }

      for (const r of analyse.rechnungen ?? []) {
        const linked = matchMap.get(r.arztName ?? '')
        if (linked) (r as unknown as Record<string, unknown>).matchedVorgangId = linked

        for (const pos of r.positionen ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const posAny = pos as any
          const ziffer = String(posAny.goaeZiffer ?? posAny.ziffer ?? '')
          const begruendung = begruendungMap.get(ziffer)
          if (begruendung) posAny.ablehnungsbegruendung = begruendung
        }
      }

      // Felder aus Begründungsschreiben (neu-analysieren) zurückübertragen.
      // Erkennungsmerkmal: existingAnalyse.neuAnalysiertAm ist gesetzt.
      // Diese Felder kommen NIE aus dem Haupt-PDF — nur aus dem separat hochgeladenen
      // Begründungsschreiben. Sie würden sonst bei jeder Neuanalyse verloren gehen.
      const hatBegruendungsschreiben = Boolean(existingAnalyse?.neuAnalysiertAm)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analyseAny = analyse as any

      if (existingAnalyse?.neuAnalysePdfPath) {
        analyseAny.neuAnalysePdfPath = existingAnalyse.neuAnalysePdfPath
      }
      if (existingAnalyse?.neuAnalysiertAm) {
        analyseAny.neuAnalysiertAm = existingAnalyse.neuAnalysiertAm
      }
      // Begründungsschreiben liegt bereits in Storage → verbesserte Anreicherung laufen lassen.
      // Das neue Prompt enthält jetzt Tarif-Klauseln + BGH-Urteile, also neu durchführen
      // statt nur die alten (schwächeren) Felder zu kopieren.
      // Track enrichment status for response
      let enrichmentStatus: 'ran' | 'skipped_no_pdf' | 'skipped_no_bs' | 'failed' =
        hatBegruendungsschreiben ? 'skipped_no_pdf' : 'skipped_no_bs'
      let enrichmentError: string | undefined
      let tarifKlauselnCount = 0
      let rechtsprechungGefunden = false

      if (hatBegruendungsschreiben && existingAnalyse?.neuAnalysePdfPath) {
        try {
          const { data: bsFile } = await admin.storage
            .from('rechnungen')
            .download(existingAnalyse.neuAnalysePdfPath as string)

          if (bsFile) {
            const bsPdfBuffer = Buffer.from(await bsFile.arrayBuffer())

            // Abgelehnte Ziffern aus neu analysierter Hauptbescheid-Analyse sammeln
            const abgelehnteZiffern: string[] = []
            for (const r of analyse.rechnungen ?? []) {
              for (const pos of r.positionen ?? []) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const posAny3 = pos as any
                if (posAny3.status === 'abgelehnt' || posAny3.status === 'gekuerzt') {
                  const z = String(posAny3.goaeZiffer ?? posAny3.ziffer ?? '')
                  if (z && !abgelehnteZiffern.includes(z)) abgelehnteZiffern.push(z)
                }
              }
            }

            // Tarif-Klauseln laden
            let tarifAusschluesse = ''
            const { data: tp } = await admin
              .from('tarif_profile')
              .select('profil_json')
              .eq('user_id', targetUserId)
              .eq('is_active', true)
              .maybeSingle()
            const ausschluesse = (tp?.profil_json as Record<string, unknown> | null)
              ?.goae_ausschluesse as Array<Record<string, unknown>> | undefined
            if (ausschluesse?.length) {
              const relevante = ausschluesse.filter(a => {
                const zl = a.ziffern_liste as string[] | undefined
                if (zl?.some(z => abgelehnteZiffern.includes(z))) return true
                const zp = a.ziffer_pattern as string | undefined
                if (zp) { try { return abgelehnteZiffern.some(z => new RegExp(zp).test(z)) } catch { return false } }
                return false
              })
              if (relevante.length) {
                tarifAusschluesse = relevante.map(a =>
                  `- ${a.bezeichnung ?? ''}: ${a.klausel ?? ''}\n  Einschränkung: ${a.einschraenkung ?? ''}\n  Angreifbar wenn: ${a.angreifbar_wenn ?? '—'}`
                ).join('\n')
                tarifKlauselnCount = relevante.length
              }
            }

            // BGH/OLG-Urteile laden
            let rechtsprechung = ''
            if (abgelehnteZiffern.length) {
              rechtsprechung = await searchPkvPrecedentsByZiffer(abgelehnteZiffern, 5).catch(() => '')
              rechtsprechungGefunden = rechtsprechung.length > 50
            }

            // Positionen-Liste für Prompt
            const positionenListe = []
            for (const r of analyse.rechnungen ?? []) {
              for (const pos of r.positionen ?? []) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const posAny4 = pos as any
                if (posAny4.status === 'abgelehnt' || posAny4.status === 'gekuerzt') {
                  const kuerzung = ((posAny4.betragEingereicht ?? 0) - (posAny4.betragErstattet ?? 0)).toFixed(2)
                  positionenListe.push(
                    `GOÄ ${posAny4.goaeZiffer ?? posAny4.ziffer ?? '?'}: ${posAny4.leistung ?? posAny4.bezeichnung ?? ''} (${posAny4.status}, Kürzung: ${kuerzung} €)`
                  )
                }
              }
            }

            const tarifBlock = tarifAusschluesse ? `\n## Relevante Vertragsklauseln\n${tarifAusschluesse}` : ''
            const rechtsBlock = rechtsprechung ? `\n## Relevante Rechtsprechung\n${rechtsprechung}` : ''

            const enrichPrompt = `Lies das beigefügte AXA-Begründungsschreiben zur Ablehnung.

## Abgelehnte / gekürzte Positionen
${positionenListe.map(p => `- ${p}`).join('\n') || '(keine)'}
${tarifBlock}${rechtsBlock}

## Deine Aufgabe
1. Extrahiere die konkreten Ablehnungsbegründungen pro GOÄ-Ziffer aus dem Begründungsschreiben.
2. Prüfe jede Ablehnung gegen die Vertragsklauseln: Ist sie vertragskonform oder angreifbar?
3. Prüfe ob BGH/OLG-Urteile die Versichertenposition stützen.
4. Erstelle eine positions-scharfe "zusammenfassung" die klar benennt welche Ablehnungen angreifbar sind (Klausel + BGH) und welche nicht.
5. Setze "widerspruchErfolgswahrscheinlichkeit" basierend auf der Analyse (nicht pauschal).

JSON-Ausgabe (kein Text davor/danach):
{
  "ablehnungsgruende": ["Konkrete Ablehnung GOÄ ZZZ: [Grund] — max 25 Wörter"],
  "zusammenfassung": "Positions-scharfe Analyse: welche Ablehnungen sind angreifbar und warum.",
  "widerspruchEmpfohlen": true,
  "widerspruchErklaerung": "Konkreter Grund: Klausel oder Urteil nennen.",
  "widerspruchErfolgswahrscheinlichkeit": 70,
  "naechsteSchritte": ["Schritt 1 konkret", "Schritt 2 konkret", "Schritt 3 konkret"],
  "positionUpdates": [
    { "goaeZiffer": "3561", "ablehnungsbegruendung": "Exakte Begründung aus AXA-Schreiben." }
  ]
}`

            const { text: raw } = await callAiWithPdf({
              model: 'claude-sonnet-4-6',
              systemPrompt: 'Du bist ein PKV-Experte. Antworte ausschließlich mit einem JSON-Objekt.',
              userPrompt: enrichPrompt,
              pdfBase64: bsPdfBuffer.toString('base64'),
              maxTokens: 5000,
            })

            logKiUsage({ callType: 'kasse_analyse', model: 'claude-sonnet-4-6', inputTokens: 0, outputTokens: 0, userId: targetUserId }).catch(() => {})

            // JSON extrahieren
            const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()
            const m = stripped.match(/\{[\s\S]*\}/)
            if (m) {
              const delta = JSON.parse(m[0]) as Record<string, unknown>
              if (Array.isArray(delta.ablehnungsgruende) && (delta.ablehnungsgruende as unknown[]).length > 0) analyseAny.ablehnungsgruende = delta.ablehnungsgruende
              if (delta.zusammenfassung)       analyseAny.zusammenfassung      = delta.zusammenfassung
              if (delta.widerspruchErklaerung) analyseAny.widerspruchErklaerung = delta.widerspruchErklaerung
              if (typeof delta.widerspruchEmpfohlen === 'boolean') analyseAny.widerspruchEmpfohlen = delta.widerspruchEmpfohlen
              if (typeof delta.widerspruchErfolgswahrscheinlichkeit === 'number') analyseAny.widerspruchErfolgswahrscheinlichkeit = delta.widerspruchErfolgswahrscheinlichkeit
              if (Array.isArray(delta.naechsteSchritte) && (delta.naechsteSchritte as unknown[]).length > 0) analyseAny.naechsteSchritte = delta.naechsteSchritte
              // Per-Position ablehnungsbegruendung
              if (Array.isArray(delta.positionUpdates)) {
                const updateMap = new Map((delta.positionUpdates as Array<{goaeZiffer: string; ablehnungsbegruendung: string}>).map(u => [String(u.goaeZiffer), u.ablehnungsbegruendung]))
                for (const r of analyse.rechnungen ?? []) {
                  for (const pos of r.positionen ?? []) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const posAny2 = pos as any
                    const ziffer = String(posAny2.goaeZiffer ?? posAny2.ziffer ?? '')
                    if (updateMap.has(ziffer)) posAny2.ablehnungsbegruendung = updateMap.get(ziffer)
                  }
                }
              }
              enrichmentStatus = 'ran'
            }
          }
        } catch (enrichErr) {
          console.error(`[batch-reanalyse] Begründungsschreiben-Anreicherung fehlgeschlagen:`, enrichErr)
          enrichmentStatus = 'failed'
          enrichmentError = String(enrichErr)
          // Fallback: alte Felder übernehmen wie bisher
          if (Array.isArray(existingAnalyse?.ablehnungsgruende) && existingAnalyse.ablehnungsgruende.length > 0) analyseAny.ablehnungsgruende = existingAnalyse.ablehnungsgruende
          if (existingAnalyse?.zusammenfassung) analyseAny.zusammenfassung = existingAnalyse.zusammenfassung
          if (existingAnalyse?.widerspruchErklaerung) analyseAny.widerspruchErklaerung = existingAnalyse.widerspruchErklaerung
          if (typeof existingAnalyse?.widerspruchErfolgswahrscheinlichkeit === 'number') analyseAny.widerspruchErfolgswahrscheinlichkeit = existingAnalyse.widerspruchErfolgswahrscheinlichkeit
          if (Array.isArray(existingAnalyse?.naechsteSchritte) && existingAnalyse.naechsteSchritte.length > 0) analyseAny.naechsteSchritte = existingAnalyse.naechsteSchritte
        }
      } else if (hatBegruendungsschreiben) {
        // PDF-Pfad fehlt aber Analyse war schon angereichert — alte Felder behalten
        if (Array.isArray(existingAnalyse?.ablehnungsgruende) && existingAnalyse.ablehnungsgruende.length > 0) analyseAny.ablehnungsgruende = existingAnalyse.ablehnungsgruende
        if (existingAnalyse?.zusammenfassung) analyseAny.zusammenfassung = existingAnalyse.zusammenfassung
        if (existingAnalyse?.widerspruchErklaerung) analyseAny.widerspruchErklaerung = existingAnalyse.widerspruchErklaerung
        if (typeof existingAnalyse?.widerspruchErfolgswahrscheinlichkeit === 'number') analyseAny.widerspruchErfolgswahrscheinlichkeit = existingAnalyse.widerspruchErfolgswahrscheinlichkeit
        if (Array.isArray(existingAnalyse?.naechsteSchritte) && existingAnalyse.naechsteSchritte.length > 0) analyseAny.naechsteSchritte = existingAnalyse.naechsteSchritte
      }

      // Einsparpotenzial-Split neu berechnen
      let betragWiderspruchKasse = 0
      let betragKorrekturArzt    = 0
      for (const r of analyse.rechnungen ?? []) {
        for (const pos of r.positionen ?? []) {
          const kuerzung = (pos.betragEingereicht ?? 0) - (pos.betragErstattet ?? 0)
          if (kuerzung <= 0) continue
          if (pos.aktionstyp === 'widerspruch_kasse')   betragWiderspruchKasse += kuerzung
          else if (pos.aktionstyp === 'korrektur_arzt') betragKorrekturArzt    += kuerzung
          else if (pos.status === 'abgelehnt')          betragWiderspruchKasse += kuerzung
          else if (pos.status === 'gekuerzt')           betragKorrekturArzt    += kuerzung
        }
      }

      const { error: updateError } = await admin
        .from('kassenabrechnungen')
        .update({
          kasse_analyse:            analyse,
          betrag_eingereicht:       analyse.betragEingereicht  ?? 0,
          betrag_erstattet:         analyse.betragErstattet    ?? 0,
          betrag_abgelehnt:         analyse.betragAbgelehnt    ?? 0,
          widerspruch_empfohlen:    analyse.widerspruchEmpfohlen ?? false,
          betrag_widerspruch_kasse: Math.round(betragWiderspruchKasse * 100) / 100,
          betrag_korrektur_arzt:    Math.round(betragKorrekturArzt    * 100) / 100,
        })
        .eq('id', kasse.id)

      if (updateError) throw new Error(`DB-Update fehlgeschlagen: ${updateError.message}`)

      report.kassenbescheide.push({
        id: kasse.id as string,
        status: 'ok',
        enrichment: enrichmentStatus,
        ...(enrichmentError ? { enrichment_error: enrichmentError } : {}),
        tarif_klauseln_count: tarifKlauselnCount,
        rechtsprechung_gefunden: rechtsprechungGefunden,
      })
    } catch (err) {
      console.error(`[batch-reanalyse] kasse ${kasse.id} fehlgeschlagen:`, err)
      report.kassenbescheide.push({
        id: kasse.id as string,
        status: 'error',
        error: String(err),
      })
    }
  }

  // ── 2. AVB neu analysieren wenn goae_ausschluesse fehlen ─────────────────

  try {
    const { data: tarifProfile } = await admin
      .from('tarif_profile')
      .select('id, profil_json')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!tarifProfile) {
      report.avb = { status: 'kein_tarif_profil' }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pj = tarifProfile.profil_json as Record<string, any> | null
      const hasAusschluesse =
        Array.isArray(pj?.goae_ausschluesse) && pj.goae_ausschluesse.length > 0

      if (hasAusschluesse) {
        report.avb = { status: 'aktuell' }
      } else {
        // Neuestes AVB-Dokument für dieses Profil suchen
        const { data: avbDok } = await admin
          .from('avb_dokumente')
          .select('id')
          .eq('tarif_profile_id', tarifProfile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!avbDok) {
          report.avb = { status: 'kein_avb_dokument' }
        } else {
          // AVB-Analyse-Route intern anstoßen
          const avbRes = await fetch(`${APP_URL}/api/analyse/avb`, {
            method: 'POST',
            headers: {
              'Content-Type':    'application/json',
              'x-internal-secret': INTERNAL_SECRET,
            },
            body: JSON.stringify({
              tarif_profile_id: tarifProfile.id,
              dokument_id:      avbDok.id,
              user_id:          targetUserId,
            }),
          })

          if (avbRes.ok) {
            report.avb = { status: 'ok' }
          } else {
            const errText = await avbRes.text().catch(() => '')
            report.avb = { status: 'error', error: `HTTP ${avbRes.status}: ${errText.slice(0, 200)}` }
          }
        }
      }
    }
  } catch (err) {
    report.avb = { status: 'error', error: String(err) }
  }

  const okCount  = report.kassenbescheide.filter(r => r.status === 'ok').length
  const errCount = report.kassenbescheide.filter(r => r.status === 'error').length

  return NextResponse.json({
    success: errCount === 0,
    summary: {
      kassenbescheide_gesamt: report.kassenbescheide.length,
      kassenbescheide_ok:     okCount,
      kassenbescheide_fehler: errCount,
      avb:                    report.avb.status,
    },
    details: report,
  })
}
