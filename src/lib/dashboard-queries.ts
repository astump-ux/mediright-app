import { createServerSupabaseClient } from './supabase-server'
import type { DashboardData, Vorgang, Arzt, KasseStats, FachgruppeStats, VorsorgeItem, EigenanteilBreakdown, WiderspruchVerfahren } from '@/types'

// Icons/colors for Fachgebiete
const FACH_META: Record<string, { icon: string; farbe: string }> = {
  'Innere Medizin':    { icon: '❤️',  farbe: '#fca5a5' },
  'Kardiologie':       { icon: '💓',  farbe: '#fca5a5' },
  'Labordiagnostik':   { icon: '🔬',  farbe: '#c4b5fd' },
  'Dermatologie':      { icon: '🧬',  farbe: '#93c5fd' },
  'Augenheilkunde':    { icon: '👁️',  farbe: '#6ee7b7' },
  'Orthopädie':        { icon: '🦴',  farbe: '#fde68a' },
  'Neurologie':        { icon: '🧠',  farbe: '#a5b4fc' },
  'Psychiatrie':       { icon: '🧠',  farbe: '#a5b4fc' },
  'Gynäkologie':       { icon: '🌸',  farbe: '#f9a8d4' },
  'Urologie':          { icon: '💊',  farbe: '#e2e8f0' },
  'Radiologie':        { icon: '📡',  farbe: '#bfdbfe' },
  'Allgemeinmedizin':  { icon: '🏥',  farbe: '#bbf7d0' },
  'Zahnarzt':          { icon: '🦷',  farbe: '#e0f2fe' },
}

function fachMeta(fach: string | null) {
  if (!fach) return { icon: '💊', farbe: '#e2e8f0' }
  return FACH_META[fach] ?? { icon: '💊', farbe: '#e2e8f0' }
}

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMonYY(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function vorsorgeStatus(naechstesDatum: string | null): VorsorgeItem['status'] {
  if (!naechstesDatum) return 'unbekannt'
  const now = new Date()
  const next = new Date(naechstesDatum)
  const diffDays = Math.floor((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'faellig'
  if (diffDays <= 90) return 'bald'
  return 'ok'
}

/**
 * AXA ActiveMe-U Vorsorge-Leistungen (hardcoded fallback)
 *
 * No separate DB table is needed — these templates are matched against the
 * user's existing vorgaenge (by Fachgebiet) to derive the last visit date
 * and calculate when the next check-up is due.  If you ever add a
 * "vorsorge_leistungen" table the queries below will use that instead.
 */
const AXA_VORSORGE_TEMPLATES = [
  { id: 'v1', name: 'Internist Jahres-Check',     icon: '❤️', fachgebiet: 'Innere Medizin',   empfIntervallMonate: 12, axaLeistung: true },
  { id: 'v2', name: 'Labor-Basisprofil',           icon: '🔬', fachgebiet: 'Labordiagnostik',  empfIntervallMonate: 12, axaLeistung: true },
  { id: 'v3', name: 'Dermatologie Hautscreening',  icon: '🧬', fachgebiet: 'Dermatologie',     empfIntervallMonate: 24, axaLeistung: true },
  { id: 'v4', name: 'Augenarzt Sehtest',           icon: '👁️', fachgebiet: 'Augenheilkunde',   empfIntervallMonate: 24, axaLeistung: true },
  { id: 'v5', name: 'Zahnarzt Prophylaxe',         icon: '🦷', fachgebiet: 'Zahnarzt',         empfIntervallMonate: 6,  axaLeistung: true },
  { id: 'v6', name: 'Gynäkologische Vorsorge',     icon: '🌸', fachgebiet: 'Gynäkologie',      empfIntervallMonate: 12, axaLeistung: true },
]

export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`
  const yearEnd   = `${currentYear}-12-31`

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, versicherung, tarif, pkv_name, pkv_tarif')
    .eq('id', user.id)
    .single()

  // Fetch vorgaenge for current year
  const { data: rawVorgaenge, error } = await supabase
    .from('vorgaenge')
    .select(`
      id, rechnungsdatum, rechnungsnummer, betrag_gesamt, betrag_erstattet, betrag_abgelehnt,
      max_faktor, flag_faktor_ueber_schwellenwert, flag_fehlende_begruendung,
      einsparpotenzial, status, kassenabrechnung_id, goae_positionen,
      aerzte ( id, name, fachgebiet )
    `)
    .eq('user_id', user.id)
    .gte('rechnungsdatum', yearStart)
    .lte('rechnungsdatum', yearEnd)
    .order('rechnungsdatum', { ascending: false })

  if (error) {
    console.error('getDashboardData error:', error)
    return null
  }

  if (!rawVorgaenge || rawVorgaenge.length === 0) return null

  // Fetch kassenabrechnungen for current year (source of truth for insurance metrics)
  // Includes the new split columns betrag_widerspruch_kasse + betrag_korrektur_arzt
  // (added in migration 009; defaults to 0 if not yet populated)
  const { data: rawKasse } = await supabase
    .from('kassenabrechnungen')
    .select('id, referenznummer, betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, selbstbehalt_abgezogen, bescheiddatum, widerspruch_empfohlen, widerspruch_status, arzt_reklamation_status, kasse_analyse, betrag_widerspruch_kasse, betrag_korrektur_arzt')
    .eq('user_id', user.id)
    .gte('bescheiddatum', yearStart)
    .lte('bescheiddatum', yearEnd)

  // Also fetch all vorgaenge fachgebiete for vorsorge matching (all time)
  const { data: allVorgaenge } = await supabase
    .from('vorgaenge')
    .select('rechnungsdatum, aerzte ( fachgebiet )')
    .eq('user_id', user.id)
    .not('rechnungsdatum', 'is', null)
    .order('rechnungsdatum', { ascending: false })

  // ── Map Vorgänge ─────────────────────────────────────────────────
  type ArztRow = { id: string; name: string; fachgebiet: string | null }
  const vorgaenge: Vorgang[] = rawVorgaenge.map((v) => {
    const arzt = (v.aerzte as unknown) as ArztRow | null
    const goaePositionen = (v.goae_positionen as Array<{ ziffer: string }> | null) ?? []
    const flagged = v.flag_faktor_ueber_schwellenwert || v.flag_fehlende_begruendung

    let flagReason: string | undefined
    if (v.flag_fehlende_begruendung) flagReason = `Faktor ${v.max_faktor}× ohne §12-Begründung`
    else if (v.flag_faktor_ueber_schwellenwert) flagReason = `Faktor ${v.max_faktor}× über 2,3-fach Schwellenwert`

    return {
      id: v.id,
      datum: formatDate(v.rechnungsdatum),
      arzt: arzt?.name ?? 'Unbekannt',
      fachrichtung: arzt?.fachgebiet ?? 'Sonstige',
      betrag: v.betrag_gesamt ?? 0,
      einsparpotenzial: v.einsparpotenzial ?? undefined,
      status: (v.status as Vorgang['status']) ?? 'offen',
      goaZiffern: goaePositionen.slice(0, 4).map((p) => `GOÄ ${p.ziffer}`),
      faktor: v.max_faktor ?? undefined,
      flagged: flagged ?? false,
      flagReason,
    }
  })

  // ── Build vorgangId → arztId map for kasse matching ──────────────
  // We use matchedVorgangId from kasse_analyse.rechnungen to link
  // kassenbescheid data to Arzt entries reliably (avoids name mismatches).
  const vorgangToArzt = new Map<string, ArztRow>() // vorgangId → arzt
  for (const v of rawVorgaenge) {
    const arzt = (v.aerzte as unknown) as ArztRow | null
    if (arzt?.id) vorgangToArzt.set(v.id, arzt)
  }

  // arztId → { eingereicht, erstattet, abgelehnt }
  const arztKasseMap = new Map<string, { eingereicht: number; erstattet: number; abgelehnt: number }>()

  for (const k of rawKasse ?? []) {
    type KasseRechnungGruppe = {
      matchedVorgangId?: string
      arztName?: string
      betragEingereicht?: number
      betragErstattet?: number
      betragAbgelehnt?: number
    }
    const ka = k.kasse_analyse as { rechnungen?: KasseRechnungGruppe[] } | null
    if (!ka?.rechnungen) continue

    for (const gruppe of ka.rechnungen) {
      // Primary: match via matchedVorgangId
      let arztId: string | undefined
      if (gruppe.matchedVorgangId) {
        arztId = vorgangToArzt.get(gruppe.matchedVorgangId)?.id
      }
      // Fallback: fuzzy name match across all known ärzte
      if (!arztId && gruppe.arztName) {
        const needle = gruppe.arztName.toLowerCase()
        for (const arzt of vorgangToArzt.values()) {
          if (arzt.name.toLowerCase().includes(needle) || needle.includes(arzt.name.toLowerCase().split(' ').pop() ?? '')) {
            arztId = arzt.id
            break
          }
        }
      }
      if (!arztId) continue

      const existing = arztKasseMap.get(arztId) ?? { eingereicht: 0, erstattet: 0, abgelehnt: 0 }
      arztKasseMap.set(arztId, {
        eingereicht: existing.eingereicht + (gruppe.betragEingereicht ?? 0),
        erstattet:   existing.erstattet   + (gruppe.betragErstattet   ?? 0),
        abgelehnt:   existing.abgelehnt   + (gruppe.betragAbgelehnt   ?? 0),
      })
    }
  }

  // ── Aggregate Ärzte ──────────────────────────────────────────────
  const arztMap = new Map<string, { id: string; name: string; fachgebiet: string | null; vorgaenge: typeof rawVorgaenge }>()
  for (const v of rawVorgaenge) {
    const a = (v.aerzte as unknown) as ArztRow | null
    if (!a) continue
    if (!arztMap.has(a.id)) arztMap.set(a.id, { ...a, vorgaenge: [] })
    arztMap.get(a.id)!.vorgaenge.push(v)
  }

  const aerzte: Arzt[] = Array.from(arztMap.values()).map((a) => {
    const faktoren = a.vorgaenge
      .filter((v) => v.max_faktor != null && v.rechnungsdatum != null)
      .sort((x, y) => (x.rechnungsdatum! < y.rechnungsdatum! ? -1 : 1))
    const faktorVerlauf = faktoren.map((v) => ({ datum: formatMonYY(v.rechnungsdatum!), faktor: v.max_faktor! }))
    const avgFaktor = faktoren.length > 0
      ? Math.round((faktoren.reduce((s, v) => s + (v.max_faktor ?? 0), 0) / faktoren.length) * 10) / 10
      : 1.0
    const gesamtBetrag = a.vorgaenge.reduce((s, v) => s + (v.betrag_gesamt ?? 0), 0)
    const flagged = a.vorgaenge.some((v) => v.flag_fehlende_begruendung || v.flag_faktor_ueber_schwellenwert)
    const alerts: string[] = []
    if (flagged) {
      const maxFak = Math.max(...a.vorgaenge.map((v) => v.max_faktor ?? 0))
      if (maxFak > 2.3) alerts.push(`Faktor bis ${maxFak}× — §12-Begründung prüfen`)
    }
    const kasseData = arztKasseMap.get(a.id)
    return {
      id: a.id,
      name: a.name,
      fachrichtung: a.fachgebiet ?? 'Sonstige',
      ort: '',
      besuche: a.vorgaenge.length,
      gesamtBetrag: Math.round(gesamtBetrag),
      avgFaktor,
      flagged,
      faktorVerlauf,
      alerts,
      erstattetVonKasse:    kasseData ? Math.round(kasseData.erstattet)   : undefined,
      abgelehntVonKasse:    kasseData ? Math.round(kasseData.abgelehnt)   : undefined,
      eingereichtBeiKasse:  kasseData ? Math.round(kasseData.eingereicht) : undefined,
    }
  }).sort((a, b) => b.gesamtBetrag - a.gesamtBetrag)

  // ── KPI Aggregates from kassenabrechnungen ────────────────────────
  const kasseList = rawKasse ?? []
  const totalErstattetKasse    = kasseList.reduce((s, k) => s + (k.betrag_erstattet       ?? 0), 0)
  const totalAbgelehntKasse    = kasseList.reduce((s, k) => s + (k.betrag_abgelehnt       ?? 0), 0)
  const totalSelbstbehalt      = kasseList.reduce((s, k) => s + (k.selbstbehalt_abgezogen ?? 0), 0)
  const totalEingereichtKasse  = kasseList.reduce((s, k) => s + (k.betrag_eingereicht     ?? 0), 0)

  // Fix #1 — Erstattungsquote WITHOUT Selbstbehalt:
  // Denominator = what the insurance was actually asked to decide on (= eingereicht - selbstbehalt)
  // This gives the "pure" reimbursement rate, showing how much of the eligible amount was paid.
  const eligibleBetrag = totalEingereichtKasse - totalSelbstbehalt
  const erstattungsquote = eligibleBetrag > 0
    ? Math.round((totalErstattetKasse / eligibleBetrag) * 100)
    : 0

  // Fix #2 — Widerspruchspotenzial from new split columns (migration 009)
  // betrag_widerspruch_kasse = positions where AXA appeal is recommended (aktionstyp='widerspruch_kasse')
  // betrag_korrektur_arzt    = positions where doctor correction is needed (aktionstyp='korrektur_arzt')
  // Fallback: if new columns are zero (rows predating migration 009), use totalAbgelehntKasse
  const totalWiderspruchKasse = kasseList.reduce((s, k) => s + ((k as { betrag_widerspruch_kasse?: number }).betrag_widerspruch_kasse ?? 0), 0)
  const totalKorrekturArzt    = kasseList.reduce((s, k) => s + ((k as { betrag_korrektur_arzt?: number }).betrag_korrektur_arzt    ?? 0), 0)
  // Include both tracks (Kassenwiderspruch + Arztkorrektur) for full actionable amount
  const totalActionable       = totalWiderspruchKasse + totalKorrekturArzt
  const widerspruchPotenzial  = totalActionable > 0 ? Math.round(totalActionable) : Math.round(totalAbgelehntKasse)
  const korrekturArztPotenzial = Math.round(totalKorrekturArzt)

  const jahresausgaben = Math.round(rawVorgaenge.reduce((s, v) => s + (v.betrag_gesamt ?? 0), 0))

  // Fix #3 — Jahresprognose based on last invoice date
  // Find the latest rechnungsdatum in current year, extrapolate from Jan → that month
  const sortedDates = rawVorgaenge
    .filter(v => v.rechnungsdatum)
    .map(v => v.rechnungsdatum!)
    .sort()
  const latestDateStr = sortedDates.at(-1)
  const elapsedMonths = latestDateStr
    ? new Date(latestDateStr).getMonth() + 1  // getMonth() is 0-based; Jan=1 elapsed month
    : 1
  const prognose = Math.round((jahresausgaben / elapsedMonths) * 12)
  const monthsWithData = elapsedMonths

  // Stille Kürzungen = positions with status 'gekuerzt' in kasse_analyse
  let stilleKuerzungTotal = 0
  let stilleKuerzungCount = 0
  const stilleKuerzungByFach = new Map<string, { betrag: number; vorgaenge: number }>()
  for (const k of kasseList) {
    const ka = k.kasse_analyse as { rechnungen?: Array<{ arztName?: string; arztFachgebiet?: string; positionen?: Array<{ status: string; betragEingereicht: number; betragErstattet: number }> }> } | null
    if (!ka?.rechnungen) continue
    for (const gruppe of ka.rechnungen) {
      for (const pos of gruppe.positionen ?? []) {
        if (pos.status === 'gekuerzt') {
          const kuerzung = (pos.betragEingereicht ?? 0) - (pos.betragErstattet ?? 0)
          if (kuerzung > 0) {
            stilleKuerzungTotal += kuerzung
            stilleKuerzungCount++
            const fach = gruppe.arztFachgebiet ?? gruppe.arztName ?? 'Sonstige'
            const ex = stilleKuerzungByFach.get(fach) ?? { betrag: 0, vorgaenge: 0 }
            stilleKuerzungByFach.set(fach, { betrag: ex.betrag + kuerzung, vorgaenge: ex.vorgaenge + 1 })
          }
        }
      }
    }
  }
  // Capture the real (kasse_analyse-based) stille Kürzungen BEFORE the fallback.
  // The fallback uses GOÄ einsparpotenzial, which double-counts with betrag_abgelehnt
  // in the eigenanteilBreakdown — so we only use the real amount there.
  const realSilentKuerzungTotal = stilleKuerzungTotal

  // Fallback to GOÄ einsparpotenzial if no gekuerzt positions found
  const einsparpotenzial = Math.round(rawVorgaenge.reduce((s, v) => s + (v.einsparpotenzial ?? 0), 0))
  if (stilleKuerzungTotal === 0 && einsparpotenzial > 0) {
    stilleKuerzungTotal = einsparpotenzial
    const kuerzungMap = new Map<string, { betrag: number; vorgaenge: number }>()
    for (const v of rawVorgaenge) {
      if (!v.einsparpotenzial || v.einsparpotenzial <= 0) continue
      const fach = ((v.aerzte as unknown) as { fachgebiet?: string } | null)?.fachgebiet ?? 'Sonstige'
      const ex = kuerzungMap.get(fach) ?? { betrag: 0, vorgaenge: 0 }
      kuerzungMap.set(fach, { betrag: ex.betrag + v.einsparpotenzial, vorgaenge: ex.vorgaenge + 1 })
      stilleKuerzungCount++
    }
    for (const [k, v] of kuerzungMap) stilleKuerzungByFach.set(k, v)
  }
  const stilleKuerzungen = Array.from(stilleKuerzungByFach.entries())
    .map(([kategorie, { betrag, vorgaenge }]) => ({ kategorie, betrag: Math.round(betrag), vorgaenge }))
    .sort((a, b) => b.betrag - a.betrag)
    .slice(0, 5)

  const einsparpotenzialCount = rawVorgaenge.filter(v => (v.einsparpotenzial ?? 0) > 0).length
  // GOÄ-based einsparpotenzial (Arzt-side) — add korrekturArztPotenzial from kasse if GOÄ is 0
  const einsparpotenzialArzt = einsparpotenzial > 0 ? einsparpotenzial : korrekturArztPotenzial

  // Eigenanteil breakdown
  const offeneRechnungen = jahresausgaben - totalEingereichtKasse > 0
    ? Math.round(jahresausgaben - totalEingereichtKasse)
    : 0
  const eigenanteilBreakdown: EigenanteilBreakdown = {
    abgelehnt:        Math.round(totalAbgelehntKasse),
    // Use only real kasse_analyse-sourced Kürzungen, not the einsparpotenzial fallback.
    // The fallback amount is already included in totalAbgelehntKasse → would double-count.
    stilleKuerzungen: Math.round(realSilentKuerzungTotal),
    selbstbehalt:     Math.round(totalSelbstbehalt),
    offeneRechnungen,
  }
  const eigenanteil = kasseList.length > 0
    ? Math.round(totalAbgelehntKasse + totalSelbstbehalt)
    : Math.round(jahresausgaben)

  // Fix #5 — Ablehnungsrate: build monthly data points for current year
  // Group kassenabrechnungen by month to show trend within the year
  const ablehnungsrateByMonth = new Map<string, { eingereicht: number; abgelehnt: number }>()
  for (const k of kasseList) {
    if (!k.bescheiddatum) continue
    const monthKey = k.bescheiddatum.substring(0, 7) // "YYYY-MM"
    const ex = ablehnungsrateByMonth.get(monthKey) ?? { eingereicht: 0, abgelehnt: 0 }
    ablehnungsrateByMonth.set(monthKey, {
      eingereicht: ex.eingereicht + (k.betrag_eingereicht ?? 0),
      abgelehnt:   ex.abgelehnt   + (k.betrag_abgelehnt   ?? 0),
    })
  }
  // Convert to sorted array of rates (%)
  const monthlyRates = Array.from(ablehnungsrateByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { eingereicht, abgelehnt }]) =>
      eingereicht > 0 ? Math.round((abgelehnt / eingereicht) * 100) : 0
    )
  // Need at least 2 points for a chart line; if only 1 real point, use [0, realRate]
  const ablehnungsrateReal = Math.round(
    totalEingereichtKasse > 0 ? (totalAbgelehntKasse / totalEingereichtKasse) * 100 : 0
  )
  const ablehnungsrate: number[] = monthlyRates.length >= 2
    ? monthlyRates
    : monthlyRates.length === 1
    ? [0, monthlyRates[0]]  // start at 0, show the one real data point
    : [0, ablehnungsrateReal] // fallback when no bescheiddatum data

  const kasseName = (profile as { pkv_name?: string })?.pkv_name ?? profile?.versicherung ?? 'AXA'

  // ── Fachgruppen-Benchmark: group aerzte by fachrichtung, compute Ablehnungsquote ──
  const fachMap2 = new Map<string, { vorgaenge: number; eingereicht: number; abgelehnt: number }>()
  for (const a of aerzte) {
    if (!a.eingereichtBeiKasse || a.eingereichtBeiKasse === 0) continue
    const key = a.fachrichtung ?? 'Sonstige'
    const existing = fachMap2.get(key) ?? { vorgaenge: 0, eingereicht: 0, abgelehnt: 0 }
    fachMap2.set(key, {
      vorgaenge:   existing.vorgaenge   + a.besuche,
      eingereicht: existing.eingereicht + (a.eingereichtBeiKasse ?? 0),
      abgelehnt:   existing.abgelehnt   + (a.abgelehntVonKasse   ?? 0),
    })
  }
  const fachgruppenStats: FachgruppeStats[] = Array.from(fachMap2.entries())
    .map(([fach, d]) => ({
      fach,
      vorgaenge:       d.vorgaenge,
      eingereicht:     Math.round(d.eingereicht),
      abgelehnt:       Math.round(d.abgelehnt),
      ablehnungsquote: d.eingereicht > 0 ? Math.round((d.abgelehnt / d.eingereicht) * 100) : 0,
    }))
    .sort((a, b) => b.eingereicht - a.eingereicht) // highest volume first

  // Active widerspruch check: any kassenbescheid where an appeal is currently running
  const laufendItems = kasseList.filter(k =>
    ['erstellt', 'gesendet', 'beantwortet'].includes((k as { widerspruch_status?: string | null }).widerspruch_status ?? '')
  )
  const widerspruchLaufend = laufendItems.length > 0
    ? {
        betrag: Math.round(laufendItems.reduce((s, k) => {
          const ke = k as { betrag_widerspruch_kasse?: number; betrag_korrektur_arzt?: number }
          return s + (ke.betrag_widerspruch_kasse ?? 0) + (ke.betrag_korrektur_arzt ?? 0)
        }, 0)),
        count: laufendItems.length,
      }
    : undefined

  const kasse: KasseStats = {
    erstattungsquote,
    erstattungsquoteAvg: 89,
    ablehnungsrate,
    ablehnungsrateReal,
    stilleKuerzungTotal: Math.round(stilleKuerzungTotal),
    stilleKuerzungCount,
    stilleKuerzungen,
    totalAbgelehnt: Math.round(totalAbgelehntKasse),
    totalSelbstbehalt: Math.round(totalSelbstbehalt),
    widerspruchPotenzial: Math.round(widerspruchPotenzial),
    widerspruchLaufend,
    kasseName,
    fachgruppenStats,
  }

  // Ausgaben nach Fach
  const fachMap = new Map<string, number>()
  for (const v of rawVorgaenge) {
    const fach = ((v.aerzte as unknown) as { fachgebiet?: string } | null)?.fachgebiet ?? 'Weitere'
    fachMap.set(fach, (fachMap.get(fach) ?? 0) + (v.betrag_gesamt ?? 0))
  }
  const ausgabenNachFach = Array.from(fachMap.entries())
    .map(([fach, betrag]) => ({ fach, betrag: Math.round(betrag), ...fachMeta(fach) }))
    .sort((a, b) => b.betrag - a.betrag)
    .slice(0, 5)

  // ── Vorsorge ──────────────────────────────────────────────────────
  // Priority order:
  //   1. user_vorsorge_config (per-user, seeded by /api/vorsorge/init)
  //   2. AXA_VORSORGE_TEMPLATES (hardcoded fallback for AXA ActiveMe-U)
  //
  // If user_vorsorge_config has no entries yet, trigger async seeding so
  // the next dashboard load will have proper data.
  let vorsorgeTemplates = AXA_VORSORGE_TEMPLATES
  try {
    const { data: userConfig, count } = await supabase
      .from('user_vorsorge_config')
      .select('id, name, icon, fachgebiet, empf_intervall_monate, axa_leistung', { count: 'exact' })
      .eq('user_id', user.id)
    if (userConfig && userConfig.length > 0) {
      vorsorgeTemplates = userConfig.map(t => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        fachgebiet: t.fachgebiet,
        empfIntervallMonate: t.empf_intervall_monate,
        axaLeistung: t.axa_leistung ?? true,
      }))
    } else if (count === 0) {
      // No config yet — trigger background seeding (fire-and-forget, no await)
      // The next dashboard load will pick up the seeded data
      fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediright-app.vercel.app'}/api/vorsorge/init`, {
        method: 'POST',
        headers: { 'Cookie': `sb-access-token=placeholder` }, // auth handled server-side
        body: JSON.stringify({}),
      }).catch(() => {/* ignore */})
    }
  } catch { /* user_vorsorge_config table not yet created (pre-migration 010) */ }

  // Build fachgebiet → last date map from ALL vorgaenge (not just current year)
  const lastDateByFach = new Map<string, string>()
  for (const v of allVorgaenge ?? []) {
    const fach = ((v.aerzte as unknown) as { fachgebiet?: string } | null)?.fachgebiet
    if (!fach || !v.rechnungsdatum) continue
    if (!lastDateByFach.has(fach) || v.rechnungsdatum > lastDateByFach.get(fach)!) {
      lastDateByFach.set(fach, v.rechnungsdatum)
    }
  }

  const vorsorgeLeistungen: VorsorgeItem[] = vorsorgeTemplates.map(t => {
    const letzteDatum = lastDateByFach.get(t.fachgebiet) ?? null
    const naechstesDatum = letzteDatum ? addMonths(letzteDatum, t.empfIntervallMonate) : null
    return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      fachgebiet: t.fachgebiet,
      empfIntervallMonate: t.empfIntervallMonate,
      letzteDatum,
      naechstesDatum,
      status: letzteDatum ? vorsorgeStatus(naechstesDatum) : 'unbekannt',
      axaLeistung: t.axaLeistung,
    }
  }).sort((a, b) => {
    const order = { faellig: 0, bald: 1, unbekannt: 2, ok: 3 }
    return order[a.status] - order[b.status]
  })

  // ── Per-case Widerspruch progress for SavingsProgress block ─────────
  // Include cases that have any actionable amount or an active procedure status.
  type KasseExtended = {
    id: string
    referenznummer: string | null
    bescheiddatum: string | null
    widerspruch_status: string | null
    arzt_reklamation_status: string | null
    betrag_widerspruch_kasse: number | null
    betrag_korrektur_arzt: number | null
    kasse_analyse: { rechnungen?: Array<{ arztName?: string }> } | null
  }

  const ACTIVE_KASSE_STATI = ['erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt']

  const widerspruchVerfahren: WiderspruchVerfahren[] = (kasseList as unknown as KasseExtended[])
    .filter(k => {
      const kStatus = k.widerspruch_status ?? 'keiner'
      const aStatus = k.arzt_reklamation_status ?? 'keiner'
      const hasPotential = (k.betrag_widerspruch_kasse ?? 0) > 0 || (k.betrag_korrektur_arzt ?? 0) > 0
      return (ACTIVE_KASSE_STATI.includes(kStatus) || aStatus === 'gesendet') && hasPotential
    })
    .map(k => {
      const rechnungen = k.kasse_analyse?.rechnungen ?? []
      const arztNames = Array.from(
        new Set(rechnungen.map((r: { arztName?: string }) => r.arztName).filter((n): n is string => !!n))
      )
      return {
        kasseId:      k.id,
        bescheiddatum: k.bescheiddatum ?? null,
        referenznummer: k.referenznummer ?? null,
        arztNames,
        betragKasse:  Math.round((k.betrag_widerspruch_kasse ?? 0) * 100) / 100,
        kasseStatus:  k.widerspruch_status ?? 'keiner',
        betragArzt:   Math.round((k.betrag_korrektur_arzt ?? 0) * 100) / 100,
        arztStatus:   k.arzt_reklamation_status ?? 'keiner',
      }
    })
    .sort((a, b) => (b.bescheiddatum ?? '').localeCompare(a.bescheiddatum ?? ''))

  return {
    user: {
      name: profile?.full_name ?? user.email?.split('@')[0] ?? 'Nutzer',
      tarif: (profile as { pkv_tarif?: string })?.pkv_tarif ?? profile?.tarif ?? '–',
      kasse: kasseName,
    },
    currentYear,
    vorgangCount: vorgaenge.length,
    einsparpotenzialCount,
    jahresausgaben,
    eigenanteil,
    eigenanteilBreakdown,
    erstattungsquote,
    einsparpotenzial: einsparpotenzialArzt,
    widerspruchPotenzialKasse: widerspruchPotenzial,
    korrekturArztPotenzial,
    widerspruchVerfahren,
    prognose,
    monthsWithData,
    vorgaenge,
    aerzte,
    kasse,
    ausgabenNachFach,
    vorsorgeLeistungen,
  }
}
