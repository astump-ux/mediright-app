import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import AerzteClient from './AerzteClient'
import type { ArztAkteData, GoaMusterItem, VerlaufPunkt, OffeneAktion } from './AerzteClient'

export const dynamic = 'force-dynamic'

// ── Types for raw DB rows ─────────────────────────────────────────────────────
type ArztRow        = { id: string; name: string; fachgebiet: string | null }
type GoaePositionRaw = {
  ziffer: string; bezeichnung?: string; faktor?: number; betrag?: number
  flag?: 'ok' | 'pruefe' | 'hoch'; axaRisiko?: 'hoch' | 'mittel' | null
}
type KassePositionRaw = {
  ziffer?: string; bezeichnung?: string
  betragEingereicht?: number; betragErstattet?: number; betragAbgelehnt?: number
  status?: 'erstattet' | 'gekuerzt' | 'abgelehnt'
}
type KasseRechnungRaw = {
  matchedVorgangId?: string | null
  arztName?: string | null
  betragEingereicht?: number; betragErstattet?: number; betragAbgelehnt?: number
  positionen?: KassePositionRaw[]
}
type KasseAnalyseRaw = { rechnungen?: KasseRechnungRaw[] }
type KassenabrechRow = {
  id: string; bescheiddatum: string | null
  betrag_eingereicht: number | null; betrag_erstattet: number | null; betrag_abgelehnt: number | null
  widerspruch_status: string | null; arzt_reklamation_status: string | null
  kasse_analyse: KasseAnalyseRaw | null
}
type VorgangRow = {
  id: string; rechnungsdatum: string | null; betrag_gesamt: number | null
  max_faktor: number | null; status: string | null
  flag_fehlende_begruendung: boolean | null; flag_faktor_ueber_schwellenwert: boolean | null
  einsparpotenzial: number | null
  goae_positionen: GoaePositionRaw[] | null
  aerzte: unknown
  kassenabrechnung_id: string | null
  // kassenabrechnungen joined only for widerspruch_status / arzt_reklamation_status
  kassenabrechnungen: unknown
}

function fmtMonYY(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
}
function fmtDE(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function AerztePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <p style={{ padding: 24, color: '#64748b' }}>Bitte einloggen.</p>

  const admin = getSupabaseAdmin()

  // ── 1. User profile (for kasse name) ──────────────────────────────────────
  const { data: profile } = await admin
    .from('profiles')
    .select('versicherung')
    .eq('id', user.id)
    .single()
  const kasseName: string = (profile?.versicherung as string | null) ?? 'PKV'

  // ── 2. All Vorgänge (with arzt + kasse status for actions) ───────────────
  const { data: rawVorgaenge } = await admin
    .from('vorgaenge')
    .select(`
      id, rechnungsdatum, betrag_gesamt, max_faktor, status,
      flag_fehlende_begruendung, flag_faktor_ueber_schwellenwert,
      einsparpotenzial, goae_positionen, kassenabrechnung_id,
      aerzte ( id, name, fachgebiet ),
      kassenabrechnungen ( id, widerspruch_status, arzt_reklamation_status )
    `)
    .eq('user_id', user.id)
    .order('rechnungsdatum', { ascending: true })

  const vorgaenge = (rawVorgaenge ?? []) as VorgangRow[]

  // ── 3. ALL Kassenabrechnungen separately — source of truth for €-Daten ───
  // Same approach as dashboard-queries.ts: query independently, not via FK join,
  // so we can apply matchedVorgangId + fuzzy-name fallback reliably.
  const { data: rawKasse } = await admin
    .from('kassenabrechnungen')
    .select('id, bescheiddatum, betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, widerspruch_status, arzt_reklamation_status, kasse_analyse')
    .eq('user_id', user.id)
    .order('bescheiddatum', { ascending: true })

  // ── 4. Benchmark reference data ───────────────────────────────────────────
  const { data: fachBenchmarks } = await admin
    .from('fachgruppen_benchmarks')
    .select('fachgruppe, ablehnungsquote_avg, avg_faktor, avg_kosten_pro_besuch, stichprobe_beschreibung')

  const { data: kasseBenchmarkRow } = await admin
    .from('kassen_benchmarks')
    .select('ablehnungsquote_avg, stichprobe_beschreibung')
    .ilike('kassen_name', `%${kasseName.split(' ')[0]}%`)
    .single()

  const fachBenchMap = new Map<string, {
    avgAblehnung: number; avgFaktor: number | null; avgKosten: number | null; quelle: string
  }>(
    (fachBenchmarks ?? []).map(b => [b.fachgruppe, {
      avgAblehnung: Number(b.ablehnungsquote_avg),
      avgFaktor:    b.avg_faktor            != null ? Number(b.avg_faktor)            : null,
      avgKosten:    b.avg_kosten_pro_besuch != null ? Number(b.avg_kosten_pro_besuch) : null,
      quelle:       b.stichprobe_beschreibung ?? '',
    }])
  )
  const kasseAvg    = kasseBenchmarkRow ? Number(kasseBenchmarkRow.ablehnungsquote_avg) : null
  const kasseQuelle = kasseBenchmarkRow?.stichprobe_beschreibung ?? ''

  // ── 5. Build lookup maps from Vorgänge ────────────────────────────────────
  // vorgangId → ArztRow
  const vorgangToArzt = new Map<string, ArztRow>()
  for (const v of vorgaenge) {
    const a = (v.aerzte as unknown) as ArztRow | null
    if (a?.id) vorgangToArzt.set(v.id, a)
  }

  // ── 6. Walk all Kassenabrechnungen → build per-arzt AND per-vorgang maps ──
  // Uses the same matchedVorgangId → fuzzy-name fallback as dashboard-queries.ts
  type KasseAgg = { eingereicht: number; erstattet: number; abgelehnt: number }
  const arztKasseMap    = new Map<string, KasseAgg>()   // arztId → totals
  const vorgangKasseMap = new Map<string, KasseAgg & {  // vorgangId → this-visit slice
    bescheiddatum: string | null
    positionen: KassePositionRaw[]
  }>()

  for (const k of rawKasse ?? []) {
    const ka = k.kasse_analyse as KasseAnalyseRaw | null
    if (!ka?.rechnungen) continue

    for (const gruppe of ka.rechnungen) {
      // ── Resolve arztId ──────────────────────────────────────────────
      let arztId: string | undefined
      let resolvedVorgangId: string | undefined

      if (gruppe.matchedVorgangId) {
        resolvedVorgangId = gruppe.matchedVorgangId
        arztId = vorgangToArzt.get(gruppe.matchedVorgangId)?.id
      }
      // Fuzzy name fallback (same logic as dashboard-queries.ts)
      if (!arztId && gruppe.arztName) {
        const needle = gruppe.arztName.toLowerCase()
        for (const [vid, arzt] of vorgangToArzt.entries()) {
          const hayName = arzt.name.toLowerCase()
          if (hayName.includes(needle) || needle.includes(hayName.split(' ').pop() ?? '')) {
            arztId = arzt.id
            resolvedVorgangId = vid
            break
          }
        }
      }
      if (!arztId) continue

      const amounts: KasseAgg = {
        eingereicht: gruppe.betragEingereicht ?? 0,
        erstattet:   gruppe.betragErstattet   ?? 0,
        abgelehnt:   gruppe.betragAbgelehnt   ?? 0,
      }

      // Accumulate arzt totals
      const existing = arztKasseMap.get(arztId) ?? { eingereicht: 0, erstattet: 0, abgelehnt: 0 }
      arztKasseMap.set(arztId, {
        eingereicht: existing.eingereicht + amounts.eingereicht,
        erstattet:   existing.erstattet   + amounts.erstattet,
        abgelehnt:   existing.abgelehnt   + amounts.abgelehnt,
      })

      // Per-vorgang slice (for Verlauf chart + GOÄ rejection matching)
      if (resolvedVorgangId) {
        vorgangKasseMap.set(resolvedVorgangId, {
          ...amounts,
          bescheiddatum: k.bescheiddatum,
          positionen:    gruppe.positionen ?? [],
        })
      }
    }
  }

  // ── 7. Group Vorgänge by Arzt ─────────────────────────────────────────────
  type ArztAgg = { arzt: ArztRow; vorgaenge: VorgangRow[] }
  const arztMap = new Map<string, ArztAgg>()
  for (const v of vorgaenge) {
    const a = (v.aerzte as unknown) as ArztRow | null
    if (!a?.id) continue
    if (!arztMap.has(a.id)) arztMap.set(a.id, { arzt: a, vorgaenge: [] })
    arztMap.get(a.id)!.vorgaenge.push(v)
  }

  // ── 8. Build ArztAkteData per Arzt ────────────────────────────────────────
  const aerzte: ArztAkteData[] = Array.from(arztMap.values()).map(({ arzt, vorgaenge: avs }) => {
    const fach = arzt.fachgebiet ?? 'Sonstige'

    // ── Totals (from arztKasseMap — reliable, fuzzy-fallback included) ──
    const gesamtBetrag   = avs.reduce((s, v) => s + (v.betrag_gesamt ?? 0), 0)
    const kasseData      = arztKasseMap.get(arzt.id)
    const eingereichtTotal = kasseData?.eingereicht ?? 0
    const erstattetTotal   = kasseData?.erstattet   ?? 0
    const abgelehntTotal   = kasseData?.abgelehnt   ?? 0

    const hatKassenbescheid = eingereichtTotal > 0
    const ablehnungsquote   = eingereichtTotal > 0
      ? Math.round((abgelehntTotal / eingereichtTotal) * 100)
      : 0

    // ── Verlauf per Besuch (from vorgangKasseMap) ──
    const verlauf: VerlaufPunkt[] = avs.map(v => {
      const slice = vorgangKasseMap.get(v.id) ?? null
      const eingereicht = slice?.eingereicht ?? null
      const erstattet   = slice?.erstattet   ?? null
      const abgelehnt   = slice?.abgelehnt   ?? null
      const quote = eingereicht && eingereicht > 0
        ? Math.round(((abgelehnt ?? 0) / eingereicht) * 100)
        : null
      return {
        datum:           fmtMonYY(v.rechnungsdatum),
        betrag:          v.betrag_gesamt ?? 0,
        erstattet,
        abgelehnt,
        ablehnungsquote: quote,
        hasBescheid:     !!slice,
      }
    })

    // ── GOÄ Muster — aggregate across all visits, with rejection data ──
    type ZiffAgg = {
      ziffer: string; bezeichnung: string; risiko: 'ok' | 'pruefe' | 'hoch'
      haeufigkeit: number; faktoren: number[]
      rejectedCount: number; totalWithBescheid: number
    }
    const ziffMap = new Map<string, ZiffAgg>()

    for (const v of avs) {
      const positionen = v.goae_positionen ?? []
      const kassSlice  = vorgangKasseMap.get(v.id) ?? null

      for (const pos of positionen) {
        if (!ziffMap.has(pos.ziffer)) {
          const risiko: 'ok' | 'pruefe' | 'hoch' =
            pos.axaRisiko === 'hoch' ? 'hoch'
            : (pos.flag === 'hoch' || pos.flag === 'pruefe') ? pos.flag
            : 'ok'
          ziffMap.set(pos.ziffer, {
            ziffer: pos.ziffer, bezeichnung: pos.bezeichnung ?? `GOÄ ${pos.ziffer}`,
            risiko, haeufigkeit: 0, faktoren: [],
            rejectedCount: 0, totalWithBescheid: 0,
          })
        }
        const agg = ziffMap.get(pos.ziffer)!
        agg.haeufigkeit++
        if (pos.faktor) agg.faktoren.push(pos.faktor)

        if (kassSlice?.positionen) {
          const kassPos = kassSlice.positionen.find(kp => kp.ziffer === pos.ziffer)
          if (kassPos) {
            agg.totalWithBescheid++
            if (kassPos.status === 'abgelehnt' || kassPos.status === 'gekuerzt') agg.rejectedCount++
          }
        }
      }
    }

    const goaMuster: GoaMusterItem[] = Array.from(ziffMap.values())
      .map(z => ({
        ziffer:       z.ziffer,
        bezeichnung:  z.bezeichnung,
        haeufigkeit:  z.haeufigkeit,
        avgFaktor:    z.faktoren.length > 0
          ? Math.round((z.faktoren.reduce((s, f) => s + f, 0) / z.faktoren.length) * 10) / 10
          : 1.0,
        axaAblehnungsrate: z.totalWithBescheid > 0
          ? Math.round((z.rejectedCount / z.totalWithBescheid) * 100)
          : null,
        risiko: z.risiko,
      }))
      .sort((a, b) => b.haeufigkeit - a.haeufigkeit)
      .slice(0, 8)

    // ── Benchmarks ──
    const fachBench = fachBenchMap.get(fach) ?? fachBenchMap.get('Sonstige') ?? null

    // Ø GOÄ-Faktor aus Vorgängen (max_faktor je Besuch)
    const faktoren = avs.map(v => v.max_faktor).filter((f): f is number => f != null)
    const avgFaktorArzt = faktoren.length > 0
      ? Math.round((faktoren.reduce((s, f) => s + f, 0) / faktoren.length) * 10) / 10
      : null

    // Kosten je Besuch
    const kostenProBesuchArzt = avs.length > 0 ? Math.round(gesamtBetrag / avs.length) : null

    const benchmarkAblehnung = fachBench ? {
      thisArzt:       ablehnungsquote,
      vergleichswert: fachBench.avgAblehnung,
      label:          `Ø ${fach} (PKV, kassenübergreifend)`,
      quelle:         fachBench.quelle,
      unit:           '%' as const,
    } : null
    const benchmarkKasse = (kasseAvg !== null && hatKassenbescheid) ? {
      thisArzt:       ablehnungsquote,
      vergleichswert: kasseAvg,
      label:          `Ø alle Ärzte bei ${kasseName}`,
      quelle:         kasseQuelle,
      unit:           '%' as const,
    } : null
    const benchmarkFaktor = (fachBench?.avgFaktor != null && avgFaktorArzt != null) ? {
      thisArzt:       avgFaktorArzt,
      vergleichswert: fachBench.avgFaktor,
      label:          `Ø GOÄ-Faktor ${fach} (PKV)`,
      quelle:         fachBench.quelle,
      unit:           '×' as const,
    } : null
    const benchmarkKosten = (fachBench?.avgKosten != null && kostenProBesuchArzt != null) ? {
      thisArzt:       kostenProBesuchArzt,
      vergleichswert: fachBench.avgKosten,
      label:          `Ø Kosten je Besuch ${fach} (PKV)`,
      quelle:         fachBench.quelle,
      unit:           '€' as const,
    } : null

    // ── Offene Aktionen ──
    const offeneAktionen: OffeneAktion[] = []
    const ohneKassenbescheid = avs.filter(v => !v.kassenabrechnung_id).length
    if (ohneKassenbescheid > 0) {
      offeneAktionen.push({
        typ: 'rechnung_ohne_bescheid',
        label: `${ohneKassenbescheid} Rechnung${ohneKassenbescheid > 1 ? 'en' : ''} noch nicht bei Kasse eingereicht`,
        href: '/kassenabrechnungen',
        prioritaet: 'mittel',
      })
    }
    for (const v of avs) {
      if (v.flag_fehlende_begruendung || v.flag_faktor_ueber_schwellenwert) {
        offeneAktionen.push({
          typ: 'rechnung_flagged',
          label: `GOÄ-Auffälligkeit: Rechnung vom ${fmtDE(v.rechnungsdatum)} (Faktor ${v.max_faktor}×)`,
          href: '/rechnungen',
          prioritaet: 'hoch',
        })
      }
    }
    // Check widerspruch/reklamation status from the joined kassenabrechnungen
    const widerspruchOffen = avs.some(v => {
      const k = (v.kassenabrechnungen as { widerspruch_status?: string | null } | null)
      return k?.widerspruch_status === 'erstellt'
    })
    if (widerspruchOffen) {
      offeneAktionen.push({ typ: 'widerspruch_offen', label: 'Kassenwiderspruch erstellt, noch nicht gesendet', href: '/widersprueche', prioritaet: 'hoch' })
    }
    const reklamationOffen = avs.some(v => {
      const k = (v.kassenabrechnungen as { arzt_reklamation_status?: string | null } | null)
      return k?.arzt_reklamation_status === 'erstellt'
    })
    if (reklamationOffen) {
      offeneAktionen.push({ typ: 'arzt_reklamation', label: 'Arztreklamation erstellt, noch nicht gesendet', href: '/widersprueche', prioritaet: 'hoch' })
    }

    const flagged  = avs.some(v => v.flag_fehlende_begruendung || v.flag_faktor_ueber_schwellenwert)
    const daten    = avs.map(v => v.rechnungsdatum).filter(Boolean) as string[]
    const sortiert = [...daten].sort()

    return {
      id:                  arzt.id,
      name:                arzt.name,
      fachrichtung:        fach,
      ersterBesuch:        fmtDE(sortiert[0] ?? null),
      letzterBesuch:       fmtDE(sortiert[sortiert.length - 1] ?? null),
      besuche:             avs.length,
      gesamtBetrag:        Math.round(gesamtBetrag),
      eingereichtBeiKasse: Math.round(eingereichtTotal),
      erstattetVonKasse:   Math.round(erstattetTotal),
      abgelehntVonKasse:   Math.round(abgelehntTotal),
      ablehnungsquote,
      hatKassenbescheid,
      verlauf,
      goaMuster,
      benchmarkAblehnung,
      benchmarkKasse,
      benchmarkFaktor,
      benchmarkKosten,
      offeneAktionen,
      flagged,
    }
  }).sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1
    return b.gesamtBetrag - a.gesamtBetrag
  })

  return (
    <AerzteClient
      aerzte={aerzte}
      kasseName={kasseName}
    />
  )
}
