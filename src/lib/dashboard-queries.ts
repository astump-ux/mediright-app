import { createServerSupabaseClient } from './supabase-server'
import type { DashboardData, Vorgang, Arzt, KasseStats, VorsorgeItem, EigenanteilBreakdown } from '@/types'

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

// AXA ActiveMe-U known preventive care benefits
// Will be replaced by DB data once migration 009 is applied
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
  const { data: rawKasse } = await supabase
    .from('kassenabrechnungen')
    .select('id, betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, selbstbehalt_abgezogen, bescheiddatum, widerspruch_empfohlen, kasse_analyse')
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

  // ── Build per-Arzt kassenbescheid data ────────────────────────────
  // Map: arztName (lowercase) → { eingereicht, erstattet, abgelehnt }
  const arztKasseMap = new Map<string, { eingereicht: number; erstattet: number; abgelehnt: number }>()

  for (const k of rawKasse ?? []) {
    const ka = k.kasse_analyse as { rechnungen?: Array<{ arztName?: string; betragEingereicht?: number; betragErstattet?: number; betragAbgelehnt?: number }> } | null
    if (!ka?.rechnungen) continue
    for (const gruppe of ka.rechnungen) {
      if (!gruppe.arztName) continue
      const key = gruppe.arztName.toLowerCase()
      const existing = arztKasseMap.get(key) ?? { eingereicht: 0, erstattet: 0, abgelehnt: 0 }
      arztKasseMap.set(key, {
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
    const kasseData = arztKasseMap.get(a.name.toLowerCase())
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
  const totalErstattetKasse    = kasseList.reduce((s, k) => s + (k.betrag_erstattet   ?? 0), 0)
  const totalAbgelehntKasse    = kasseList.reduce((s, k) => s + (k.betrag_abgelehnt   ?? 0), 0)
  const totalSelbstbehalt      = kasseList.reduce((s, k) => s + (k.selbstbehalt_abgezogen ?? 0), 0)
  const totalEingereichtKasse  = kasseList.reduce((s, k) => s + (k.betrag_eingereicht  ?? 0), 0)
  const widerspruchPotenzial   = kasseList
    .filter(k => k.widerspruch_empfohlen)
    .reduce((s, k) => s + (k.betrag_abgelehnt ?? 0), 0)

  const erstattungsquote = totalEingereichtKasse > 0
    ? Math.round((totalErstattetKasse / totalEingereichtKasse) * 100)
    : 0

  const jahresausgaben = Math.round(rawVorgaenge.reduce((s, v) => s + (v.betrag_gesamt ?? 0), 0))

  // Stille Kürzungen = positions with status 'gekuerzt' (quiet reduction, no formal rejection)
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
  // Fallback: if no gekuerzt positions found, use einsparpotenzial from vorgaenge
  const einsparpotenzial = Math.round(rawVorgaenge.reduce((s, v) => s + (v.einsparpotenzial ?? 0), 0))
  if (stilleKuerzungTotal === 0 && einsparpotenzial > 0) {
    stilleKuerzungTotal = einsparpotenzial
    // Group by fachgebiet from vorgaenge
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

  // Eigenanteil breakdown
  const offeneRechnungen = jahresausgaben - totalEingereichtKasse > 0
    ? Math.round(jahresausgaben - totalEingereichtKasse)
    : 0
  const eigenanteilBreakdown: EigenanteilBreakdown = {
    abgelehnt:        Math.round(totalAbgelehntKasse),
    stilleKuerzungen: Math.round(stilleKuerzungTotal),
    selbstbehalt:     Math.round(totalSelbstbehalt),
    offeneRechnungen,
  }
  const eigenanteil = kasseList.length > 0
    ? Math.round(totalAbgelehntKasse + totalSelbstbehalt)
    : Math.round(jahresausgaben)

  // Prognose
  const months = new Set(rawVorgaenge.map(v => v.rechnungsdatum?.substring(0, 7))).size || 1
  const prognose = Math.round((jahresausgaben / months) * 12)

  // Ablehnungsrate
  const abgelehntVorgaenge = rawVorgaenge.filter(v => v.status === 'abgelehnt').length
  const ablehnungsrateReal = rawVorgaenge.length > 0
    ? Math.round((abgelehntVorgaenge / rawVorgaenge.length) * 100)
    : 0

  const kasseName = (profile as { pkv_name?: string })?.pkv_name ?? profile?.versicherung ?? 'AXA'

  const kasse: KasseStats = {
    erstattungsquote,
    erstattungsquoteAvg: 89,
    ablehnungsrate: [ablehnungsrateReal],
    ablehnungsrateReal,
    stilleKuerzungTotal: Math.round(stilleKuerzungTotal),
    stilleKuerzungCount,
    stilleKuerzungen,
    totalAbgelehnt: Math.round(totalAbgelehntKasse),
    totalSelbstbehalt: Math.round(totalSelbstbehalt),
    widerspruchPotenzial: Math.round(widerspruchPotenzial),
    kasseName,
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
  // Try to fetch user-specific vorsorge templates from DB, fall back to AXA defaults
  let vorsorgeTemplates = AXA_VORSORGE_TEMPLATES
  try {
    const { data: dbTemplates } = await supabase
      .from('vorsorge_leistungen')
      .select('*')
      .or(`tarif_name.eq.${((profile as { pkv_tarif?: string })?.pkv_tarif ?? 'AXA_ACTIVEME_U').toUpperCase().replace(/ /g, '_')},tarif_name.eq.AXA_ACTIVEME_U`)
    if (dbTemplates && dbTemplates.length > 0) {
      vorsorgeTemplates = dbTemplates.map(t => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        fachgebiet: t.fachgebiet,
        empfIntervallMonate: t.empf_intervall_monate,
        axaLeistung: t.axa_leistung ?? true,
      }))
    }
  } catch { /* table may not exist yet */ }

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
    einsparpotenzial,
    widerspruchPotenzialKasse: Math.round(widerspruchPotenzial),
    prognose,
    monthsWithData: months,
    vorgaenge,
    aerzte,
    kasse,
    ausgabenNachFach,
    vorsorgeLeistungen,
  }
}
