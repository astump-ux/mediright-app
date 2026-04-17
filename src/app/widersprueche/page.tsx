import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import WiderspruchClient from '@/components/widersprueche/WiderspruchClient'

export const dynamic = 'force-dynamic'

export interface WiderspruchKommunikation {
  id: string
  kassenabrechnungen_id: string
  richtung: 'ausgehend' | 'eingehend'
  kommunikationspartner: 'kasse' | 'arzt'
  typ: string
  datum: string
  betreff: string | null
  inhalt: string
  ki_analyse: string | null
  ki_vorschlag_betreff: string | null
  ki_vorschlag_inhalt: string | null
  ki_naechster_empfaenger: 'kasse' | 'arzt' | 'keiner' | null
  ki_dringlichkeit: 'hoch' | 'mittel' | 'niedrig' | null
  ki_naechste_frist: string | null
  created_at: string
}

export interface WiderspruchVorgang {
  id: string
  arzt_name: string | null
  rechnungsdatum: string | null
  betrag_gesamt: number | null
}

export interface WiderspruchFall {
  id: string
  bescheiddatum: string | null
  referenznummer: string | null
  betrag_eingereicht: number
  betrag_erstattet: number
  betrag_abgelehnt: number
  betrag_widerspruch_kasse: number | null   // appeal amount (kasse-track)
  betrag_korrektur_arzt: number | null      // invoice correction amount (arzt-track)
  widerspruch_status: string
  arzt_reklamation_status: string           // independent status for Arztreklamation track
  widerspruch_gesendet_am: string | null
  kasse_analyse: Record<string, unknown> | null
  pdf_storage_path: string | null
  vorgaenge: WiderspruchVorgang[]
  kommunikationen: WiderspruchKommunikation[]
}

export default async function WiderspruchPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
        Bitte einloggen.
      </div>
    )
  }

  const { data: kassenabrechnungen } = await getSupabaseAdmin()
    .from('kassenabrechnungen')
    .select('id, bescheiddatum, referenznummer, betrag_abgelehnt, betrag_eingereicht, betrag_erstattet, betrag_widerspruch_kasse, betrag_korrektur_arzt, widerspruch_status, arzt_reklamation_status, widerspruch_gesendet_am, kasse_analyse, pdf_storage_path')
    .eq('user_id', user.id)
    .in('widerspruch_status', ['erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt'])
    .order('created_at', { ascending: false })

  // Empty state
  if (!kassenabrechnungen?.length) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, color: '#0f172a', fontWeight: 400, margin: '0 0 8px' }}>
          Widerspruchsverfahren
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4, marginBottom: 32 }}>
          KI-gestützte Kommunikationsbegleitung
        </p>
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#94a3b8', fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          Keine aktiven Widerspruchsverfahren
        </div>
      </div>
    )
  }

  const kasseIds = kassenabrechnungen.map(k => k.id)

  // Fetch ALL linked vorgaenge (may be multiple per kassenbescheid)
  const { data: vorgaenge } = await getSupabaseAdmin()
    .from('vorgaenge')
    .select('id, kassenabrechnung_id, arzt_name, rechnungsdatum, betrag_gesamt, aerzte(name)')
    .in('kassenabrechnung_id', kasseIds)
    .eq('user_id', user.id)
    .order('rechnungsdatum', { ascending: true })

  const { data: kommunikationen } = await getSupabaseAdmin()
    .from('widerspruch_kommunikationen')
    .select('*')
    .in('kassenabrechnungen_id', kasseIds)
    .eq('user_id', user.id)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true })

  // Group vorgaenge by kassenbescheid id
  const vorgaengeByKasse: Record<string, WiderspruchVorgang[]> = {}
  for (const v of vorgaenge ?? []) {
    const kid = v.kassenabrechnung_id
    if (!kid) continue
    if (!vorgaengeByKasse[kid]) vorgaengeByKasse[kid] = []
    const arztRow = v.aerzte as unknown as { name: string }[] | { name: string } | null
    const arzt = Array.isArray(arztRow) ? (arztRow[0] ?? null) : arztRow
    vorgaengeByKasse[kid].push({
      id: v.id,
      arzt_name: arzt?.name ?? v.arzt_name ?? null,
      rechnungsdatum: v.rechnungsdatum ?? null,
      betrag_gesamt: v.betrag_gesamt ?? null,
    })
  }

  const faelle: WiderspruchFall[] = kassenabrechnungen.map(k => ({
    id: k.id,
    bescheiddatum: k.bescheiddatum ?? null,
    referenznummer: k.referenznummer ?? null,
    betrag_eingereicht: k.betrag_eingereicht ?? 0,
    betrag_erstattet: k.betrag_erstattet ?? 0,
    betrag_abgelehnt: k.betrag_abgelehnt ?? 0,
    betrag_widerspruch_kasse: k.betrag_widerspruch_kasse ?? null,
    betrag_korrektur_arzt: k.betrag_korrektur_arzt ?? null,
    widerspruch_status: k.widerspruch_status,
    arzt_reklamation_status: (k.arzt_reklamation_status as string | null) ?? 'keiner',
    widerspruch_gesendet_am: k.widerspruch_gesendet_am ?? null,
    kasse_analyse: k.kasse_analyse as Record<string, unknown> | null,
    pdf_storage_path: k.pdf_storage_path ?? null,
    vorgaenge: vorgaengeByKasse[k.id] ?? [],
    kommunikationen: (kommunikationen ?? []).filter(km => km.kassenabrechnungen_id === k.id) as WiderspruchKommunikation[],
  }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, color: '#0f172a', fontWeight: 400, margin: 0 }}>
            Widerspruchsverfahren
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {faelle.length} aktive{faelle.length !== 1 ? ' Verfahren' : 's Verfahren'} · KI-gestützte Kommunikationsbegleitung
          </p>
        </div>
      </div>
      <WiderspruchClient faelle={faelle} />
    </div>
  )
}
