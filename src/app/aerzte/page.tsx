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
  matchedVorgangId?: string
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
  aerzte: unknown       // ArztRow via FK
  kassenabrechnung_id: string | null
  kassenabrechnungen: unknown  // KassenabrechRow via FK
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

  // ── 2. All Vorgänge with linked Arzt + Kassenbescheid ─────────────────────
  const { data: rawVorgaenge } = await admin
    .from('vorgaenge')
    .select(`
      id, rechnungsdatum, betrag_gesamt, max_faktor, status,
      flag_fehlende_begruendung, flag_faktor_ueber_schwellenwert,
      einsparpotenzial, goae_positionen, kassenabrechnung_id,
      aerzte ( id, name, fachgebiet ),
      kassenabrechnungen (
        id, bescheiddatum,
        betrag_eingereicht, betrag_erstattet, betrag_abgelehnt,
        widerspruch_status, arzt_reklamation_status, kasse_analyse
      )
    `)
    .eq('user_id', user.id)
    .order('rechnungsdatum', { ascending: true })

  const vorgaenge = (rawVorgaenge ?? []) as VorgangRow[]

  // ── 3. Benchmark reference data ───────────────────────────────────────────
  const { data: fachBenchmarks } = await admin
    .from('fachgruppen_benchmarks')
    .select('fachgruppe, ablehnungsquote_avg, stichprobe_beschreibung')

  const { data: kasseBenchmarkRow } = await admin
    .from('kassen_benchmarks')
    .select('ablehnungsquote_avg, stichprobe_beschreibung')
    .ilike('kassen_name', `%${kasseName.split(' ')[0]}%`)
    .single()

  const fachBenchMap = new Map<string, { avg: number; quelle: string }>(
    (fachBenchmarks ?? []).map(b => [b.fachgruppe, { avg: Number(b.ablehnungsquote_avg), quelle: b.stichprobe_beschreibung ?? '' }])
  )
  const kasseAvg   = kasseBenchmarkRow ? Number(kasseBenchmarkRow.ablehnungsquote_avg) : null
  const kasseQuelle = kasseBenchmarkRow?.stichprobe_beschreibung ?? ''

  // ── 4. Group Vorgänge by Arzt ─────────────────────────────────────────────
  type ArztAgg = {
    arzt: ArztRow
    vorgaenge: VorgangRow[]
  }
  const arztMap = new Map<string, ArztAgg>()
  for (const v of vorgaenge) {
    const arzt = (v.aerzte as unknown) as ArztRow | null
    if (!arzt?.id) continue
    if (!arztMap.has(arzt.id)) arztMap.set(arzt.id, { arzt, vorgaenge: [] })
    arztMap.get(arzt.id)!.vorgaenge.push(v)
  }

  // ── 5. Build ArztAkteData per Arzt ────────────────────────────────────────
  const aerzte: ArztAkteData[] = Array.from(arztMap.values()).map(({ arzt, vorgaenge: avs }) => {
    const fach = arzt.fachgebiet ?? 'Sonstige'

    // ── Totals ──
    const gesamtBetrag     = avs.reduce((s, v) => s + (v.betrag_gesamt ?? 0), 0)
    const eingereichtTotal = avs.reduce((s, v) => {
      const k = (v.kassenabrechnungen as unknown) as KassenabrechRow | null
      if (!k) return s
      const ka = k.kasse_analyse
      if (!ka?.rechnungen) return s
      const gruppe = ka.rechnungen.find(r => r.matchedVorgangId === v.id)
      return s + (gruppe?.betragEingereicht ?? 0)
    }, 0)
    const erstattetTotal = avs.reduce((s, v) => {
      const k = (v.kassenabrechnungen as unknown) as KassenabrechRow | null
      if (!k) return s
      const ka = k.kasse_analyse
      const gruppe = ka?.rechnungen?.find(r => r.matchedVorgangId === v.id)
      return s + (gruppe?.betragErstattet ?? 0)
    }, 0)
    const abgelehntTotal = avs.reduce((s, v) => {
      const k = (v.kassenabrechnungen as unknown) as KassenabrechRow | null
      if (!k) return s
      const ka = k.kasse_analyse
      const gruppe = ka?.rechnungen?.find(r => r.matchedVorgangId === v.id)
      return s + (gruppe?.betragAbgelehnt ?? 0)
    }, 0)

    const hatKassenbescheid = eingereichtTotal > 0
    const ablehnungsquote   = eingereichtTotal > 0
      ? Math.round((abgelehntTotal / eingereichtTotal) * 100)
      : 0

    // ── Verlauf per Besuch ──
    const verlauf: VerlaufPunkt[] = avs.map(v => {
      const k   = (v.kassenabrechnungen as unknown) as KassenabrechRow | null
      const ka  = k?.kasse_analyse ?? null
      const grp = ka?.rechnungen?.find(r => r.matchedVorgangId === v.id) ?? null
      const eingereicht = grp?.betragEingereicht ?? null
      const erstattet   = grp?.betragErstattet   ?? null
      const abgelehnt   = grp?.betragAbgelehnt   ?? null
      const quote = eingereicht && eingereicht > 0
        ? Math.round(((abgelehnt ?? 0) / eingereicht) * 100)
        : null
      return {
        datum:          fmtMonYY(v.rechnungsdatum),
        betrag:         v.betrag_gesamt ?? 0,
        erstattet:      erstattet,
        abgelehnt:      abgelehnt,
        ablehnungsquote: quote,
        hasBescheid:    !!k,
      }
    })

    // ── GOÄ Muster — aggregate codes across all visits ──
    // zifferKey → { haeufigkeit, faktoren[], betraege[], rejectedCount, totalWithBescheid }
    type ZiffAgg = {
      ziffer: string; bezeichnung: string; risiko: 'ok' | 'pruefe' | 'hoch'
      haeufigkeit: number; faktoren: number[]
      rejectedCount: number; totalWithBescheid: number
    }
    const ziffMap = new Map<string, ZiffAgg>()

    for (const v of avs) {
      const positionen = v.goae_positionen ?? []
      const k  = (v.kassenabrechnungen as unknown) as KassenabrechRow | null
      const ka = k?.kasse_analyse ?? null
      const grp = ka?.rechnungen?.find(r => r.matchedVorgangId === v.id) ?? null

      for (const pos of positionen) {
        const key = pos.ziffer
        if (!ziffMap.has(key)) {
          const risiko: 'ok' | 'pruefe' | 'hoch' =
            pos.axaRisiko === 'hoch' ? 'hoch'
            : (pos.flag === 'hoch' || pos.flag === 'pruefe') ? pos.flag
            : 'ok'
          ziffMap.set(key, {
            ziffer: key,
            bezeichnung: pos.bezeichnung ?? `GOÄ ${key}`,
            risiko,
            haeufigkeit: 0, faktoren: [],
            rejectedCount: 0, totalWithBescheid: 0,
          })
        }
        const agg = ziffMap.get(key)!
        agg.haeufigkeit++
        if (pos.faktor) agg.faktoren.push(pos.faktor)

        // Match against kassenbescheid positionen for rejection data
        if (grp?.positionen) {
          const kassPos = grp.positionen.find(kp => kp.ziffer === key)
          if (kassPos) {
            agg.totalWithBescheid++
            if (kassPos.status === 'abgelehnt' || kassPos.status === 'gekuerzt') {
              agg.rejectedCount++
            }
          }
        }
      }
    }

    const goaMuster: GoaMusterItem[] = Array.from(ziffMap.values())
      .map(z => ({
        ziffer:            z.ziffer,
        bezeichnung:       z.bezeichnung,
        haeufigkeit:       z.haeufigkeit,
        avgFaktor:         z.faktoren.length > 0
          ? Math.round((z.faktoren.reduce((s, f) => s + f, 0) / z.faktoren.length) * 10) / 10
          : 1.0,
        axaAblehnungsrate: z.totalWithBescheid > 0
          ? Math.round((z.rejectedCount / z.totalWithBescheid) * 100)
          : null,
        risiko: z.risiko,
      }))
      .sort((a, b) => b.haeufigkeit - a.haeufigkeit)
      .slice(0, 8)   // top 8 codes

    // ── Benchmarks ──
    const fachBench = fachBenchMap.get(fach) ?? fachBenchMap.get('Sonstige') ?? null
    const benchmarkFachgruppe = fachBench ? {
      thisArzt:       ablehnungsquote,
      vergleichswert: fachBench.avg,
      label:          `Ø ${fach} (PKV, kassenübergreifend)`,
      quelle:         fachBench.quelle,
    } : null

    const benchmarkKasse = (kasseAvg !== null && hatKassenbescheid) ? {
      thisArzt:       ablehnungsquote,
      vergleichswert: kasseAvg,
      label:          `Ø alle Ärzte bei ${kasseName}`,
      quelle:         kasseQuelle,
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
    for (const v of avs) {
      const k = (v.kassenabrechnungen as unknown) as KassenabrechRow | null
      if (!k) continue
      if (k.widerspruch_status === 'erstellt') {
        offeneAktionen.push({
          typ: 'widerspruch_offen',
          label: `Kassenwiderspruch erstellt, noch nicht gesendet`,
          href: '/widersprueche',
          prioritaet: 'hoch',
        })
        break
      }
      if (k.arzt_reklamation_status === 'erstellt') {
        offeneAktionen.push({
          typ: 'arzt_reklamation',
          label: `Arztreklamation erstellt, noch nicht gesendet`,
          href: '/widersprueche',
          prioritaet: 'hoch',
        })
        break
      }
    }

    const flagged = avs.some(v => v.flag_fehlende_begruendung || v.flag_faktor_ueber_schwellenwert)

    const daten    = avs.map(v => v.rechnungsdatum).filter(Boolean) as string[]
    const sortiert = [...daten].sort()

    return {
      id:                arzt.id,
      name:              arzt.name,
      fachrichtung:      fach,
      ersterBesuch:      fmtDE(sortiert[0] ?? null),
      letzterBesuch:     fmtDE(sortiert[sortiert.length - 1] ?? null),
      besuche:           avs.length,
      gesamtBetrag:      Math.round(gesamtBetrag),
      eingereichtBeiKasse: Math.round(eingereichtTotal),
      erstattetVonKasse:   Math.round(erstattetTotal),
      abgelehntVonKasse:   Math.round(abgelehntTotal),
      ablehnungsquote,
      hatKassenbescheid,
      verlauf,
      goaMuster,
      benchmarkFachgruppe,
      benchmarkKasse,
      offeneAktionen,
      flagged,
    }
  }).sort((a, b) => {
    // Flagged first, then by Gesamtbetrag desc
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
