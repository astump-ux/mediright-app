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

export interface WiderspruchFall {
  id: string
  bescheiddatum: string | null
  referenznummer: string | null
  betrag_abgelehnt: number
  widerspruch_status: string
  widerspruch_gesendet_am: string | null
  kasse_analyse: Record<string, unknown> | null
  arztName: string | null
  rechnungsdatum: string | null
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

  const { data: kassenabrechnungen, error: kasseErr } = await getSupabaseAdmin()
    .from('kassenabrechnungen')
    .select('id, bescheiddatum, referenznummer, betrag_abgelehnt, widerspruch_status, widerspruch_gesendet_am, kasse_analyse')
    .eq('user_id', user.id)
    .in('widerspruch_status', ['erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt'])
    .order('created_at', { ascending: false })

 // Empty state (no active Widerspruchsverfahren)
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

  const { data: vorgaenge } = await getSupabaseAdmin()
    .from('vorgaenge')
    .select('kassenabrechnung_id, arzt_name, rechnungsdatum, aerzte(name)')
    .in('kassenabrechnung_id', kasseIds)
    .eq('user_id', user.id)

  const { data: kommunikationen } = await getSupabaseAdmin()
    .from('widerspruch_kommunikationen')
    .select('*')
    .in('kassenabrechnungen_id', kasseIds)
    .eq('user_id', user.id)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true })

  const faelle: WiderspruchFall[] = kassenabrechnungen.map(k => {
    const linked = vorgaenge?.find(v => v.kassenabrechnung_id === k.id)
    const arztRow = linked?.aerzte as unknown as { name: string }[] | { name: string } | null
    const arzt = Array.isArray(arztRow) ? (arztRow[0] ?? null) : arztRow
    return {
      id: k.id,
      bescheiddatum: k.bescheiddatum,
      referenznummer: k.referenznummer,
      betrag_abgelehnt: k.betrag_abgelehnt ?? 0,
      widerspruch_status: k.widerspruch_status,
      widerspruch_gesendet_am: k.widerspruch_gesendet_am,
      kasse_analyse: k.kasse_analyse as Record<string, unknown> | null,
      arztName: arzt?.name ?? linked?.arzt_name ?? null,
      rechnungsdatum: linked?.rechnungsdatum ?? null,
      kommunikationen: (kommunikationen ?? []).filter(km => km.kassenabrechnungen_id === k.id) as WiderspruchKommunikation[],
    }
  })

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
