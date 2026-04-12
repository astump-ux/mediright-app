import { createServerSupabaseClient } from './supabase-server'
import type { DashboardData, Vorgang, Arzt, KasseStats } from '@/types'

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

// ─────────────────────────────────────────────────────────────────
// Main query: fetch all Vorgänge + Ärzte for the current user
// ─────────────────────────────────────────────────────────────────
export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`
  const yearEnd   = `${currentYear}-12-31`

  // Fetch profile (try pkv_name first, fall back to versicherung for backward compat)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, versicherung, tarif, pkv_name, pkv_tarif')
    .eq('id', user.id)
    .single()

  // Fetch vorgaenge for current year with aerzte join
  const { data: rawVorgaenge, error } = await supabase
    .from('vorgaenge')
    .select(`
      id,
      rechnungsdatum,
      rechnungsnummer,
      betrag_gesamt,
      betrag_erstattet,
      betrag_abgelehnt,
      max_faktor,
      flag_faktor_ueber_schwellenwert,
      flag_fehlende_begruendung,
      einsparpotenzial,
      status,
      kassenabrechnung_id,
      goae_positionen,
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

  // Fetch kassenabrechnungen for current year (source of truth for erstattet/abgelehnt)
  const { data: rawKasse } = await supabase
    .from('kassenabrechnungen')
    .select('betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, selbstbehalt_abgezogen, bescheiddatum')
    .eq('user_id', user.id)
    .gte('bescheiddatum', yearStart)
    .lte('bescheiddatum', yearEnd)

  // Return null if user has no data → triggers empty state
  if (!rawVorgaenge || rawVorgaenge.length === 0) return null

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

  // ── Aggregate Ärzte ──────────────────────────────────────────────
  const arztMap = new Map<string, {
    id: string; name: string; fachgebiet: string | null
    vorgaenge: typeof rawVorgaenge
  }>()

  for (const v of rawVorgaenge) {
    const a = (v.aerzte as unknown) as ArztRow | null
    if (!a) continue
    if (!arztMap.has(a.id)) {
      arztMap.set(a.id, { ...a, vorgaenge: [] })
    }
    arztMap.get(a.id)!.vorgaenge.push(v)
  }

  const aerzte: Arzt[] = Array.from(arztMap.values()).map((a) => {
    const faktoren = a.vorgaenge
      .filter((v) => v.max_faktor != null && v.rechnungsdatum != null)
      .sort((x, y) => (x.rechnungsdatum! < y.rechnungsdatum! ? -1 : 1))

    const faktorVerlauf = faktoren.map((v) => ({
      datum: formatMonYY(v.rechnungsdatum!),
      faktor: v.max_faktor!,
    }))

    const avgFaktor = faktoren.length > 0
      ? Math.round((faktoren.reduce((s, v) => s + (v.max_faktor ?? 0), 0) / faktoren.length) * 10) / 10
      : 1.0

    const gesamtBetrag = a.vorgaenge.reduce((s, v) => s + (v.betrag_gesamt ?? 0), 0)
    const flagged = a.vorgaenge.some((v) => v.flag_fehlende_begruendung || v.flag_faktor_ueber_schwellenwert)

    const alerts: string[] = []
    if (flagged) {
      const maxFak = Math.max(...a.vorgaenge.map((v) => v.max_faktor ?? 0))
      if (maxFak > 2.3) {
        alerts.push(`Faktor bis ${maxFak}× — §12-Begründung prüfen`)
      }
    }

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
    }
  }).sort((a, b) => b.gesamtBetrag - a.gesamtBetrag)

  // ── KPI Aggregates ────────────────────────────────────────────────
  // Jahresausgaben: sum of all Arztrechnung amounts (vorgaenge with real arzt data)
  const jahresausgaben = Math.round(
    rawVorgaenge.reduce((s, v) => s + (v.betrag_gesamt ?? 0), 0)
  )

  // Use kassenabrechnungen as source of truth for insurance metrics
  const kasseList = rawKasse ?? []
  const totalErstattetKasse = kasseList.reduce((s, k) => s + (k.betrag_erstattet ?? 0), 0)
  const totalAbgelehntKasse = kasseList.reduce((s, k) => s + (k.betrag_abgelehnt ?? 0), 0)
  const totalSelbstbehalt   = kasseList.reduce((s, k) => s + (k.selbstbehalt_abgezogen ?? 0), 0)
  const totalEingereichtKasse = kasseList.reduce((s, k) => s + (k.betrag_eingereicht ?? 0), 0)

  // Erstattungsquote from actual kassenabrechnungen (not vorgaenge.betrag_erstattet which may be 0)
  const erstattungsquote = totalEingereichtKasse > 0
    ? Math.round((totalErstattetKasse / totalEingereichtKasse) * 100)
    : 0

  // Eigenanteil = what user actually paid: rejected + deductible + invoices not yet submitted
  const eigenanteil = kasseList.length > 0
    ? Math.round(totalAbgelehntKasse + totalSelbstbehalt)
    : Math.round(jahresausgaben)   // no kassenbescheide yet → full amount is eigenanteil

  const einsparpotenzial = Math.round(
    rawVorgaenge.reduce((s, v) => s + (v.einsparpotenzial ?? 0), 0)
  )
  // Count vorgaenge with einsparpotenzial > 0 (for KPI display)
  const einsparpotenzialCount = rawVorgaenge.filter(v => (v.einsparpotenzial ?? 0) > 0).length

  // Prognose = linear extrapolation based on months with data
  const months = new Set(rawVorgaenge.map((v) => v.rechnungsdatum?.substring(0, 7))).size || 1
  const prognose = Math.round((jahresausgaben / months) * 12)

  // ── Kasse Stats ───────────────────────────────────────────────────
  const total = rawVorgaenge.length
  const abgelehnt = rawVorgaenge.filter((v) => v.status === 'abgelehnt').length
  const ablehnungsrate = total > 0 ? Math.round((abgelehnt / total) * 100) : 0
  const stilleKuerzungTotal = Math.round(
    rawVorgaenge.reduce((s, v) => s + (v.einsparpotenzial ?? 0), 0)
  )

  // Group Stille Kürzungen by Fachgebiet
  const kuerzungMap = new Map<string, { betrag: number; vorgaenge: number }>()
  for (const v of rawVorgaenge) {
    if (!v.einsparpotenzial || v.einsparpotenzial <= 0) continue
    const fach = ((v.aerzte as unknown) as { fachgebiet?: string } | null)?.fachgebiet ?? 'Sonstige'
    const existing = kuerzungMap.get(fach) ?? { betrag: 0, vorgaenge: 0 }
    kuerzungMap.set(fach, {
      betrag: existing.betrag + v.einsparpotenzial,
      vorgaenge: existing.vorgaenge + 1,
    })
  }
  const stilleKuerzungen = Array.from(kuerzungMap.entries())
    .map(([kategorie, { betrag, vorgaenge }]) => ({
      kategorie,
      betrag: Math.round(betrag),
      vorgaenge,
    }))
    .sort((a, b) => b.betrag - a.betrag)
    .slice(0, 5)

  const kasse: KasseStats = {
    erstattungsquote,
    erstattungsquoteAvg: 89, // benchmark — static for now
    ablehnungsrate: [ablehnungsrate], // single data point; grows over time
    stilleKuerzungTotal,
    stilleKuerzungen,
  }

  // ── Ausgaben nach Fach ────────────────────────────────────────────
  const fachMap = new Map<string, number>()
  for (const v of rawVorgaenge) {
    const fach = ((v.aerzte as unknown) as { fachgebiet?: string } | null)?.fachgebiet ?? 'Weitere'
    fachMap.set(fach, (fachMap.get(fach) ?? 0) + (v.betrag_gesamt ?? 0))
  }
  const ausgabenNachFach = Array.from(fachMap.entries())
    .map(([fach, betrag]) => ({ fach, betrag: Math.round(betrag), ...fachMeta(fach) }))
    .sort((a, b) => b.betrag - a.betrag)
    .slice(0, 5)

  // ── Assemble ──────────────────────────────────────────────────────
  return {
    user: {
      name: profile?.full_name ?? user.email?.split('@')[0] ?? 'Nutzer',
      tarif: (profile as { pkv_tarif?: string })?.pkv_tarif ?? profile?.tarif ?? '–',
      kasse: (profile as { pkv_name?: string })?.pkv_name ?? profile?.versicherung ?? 'AXA',
    },
    currentYear,
    vorgangCount: vorgaenge.length,
    einsparpotenzialCount,
    jahresausgaben,
    eigenanteil,
    erstattungsquote,
    einsparpotenzial,
    prognose,
    vorgaenge,
    aerzte,
    kasse,
    ausgabenNachFach,
  }
}
