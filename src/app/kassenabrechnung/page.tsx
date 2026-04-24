import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import Header from '@/components/layout/Header'
import KasseUebersicht from '@/components/kassenabrechnung/KasseUebersicht'
import UploadButton from '@/components/upload/UploadButton'
import type { KasseRechnungGruppe } from '@/lib/goae-analyzer'
import { mockKasseBescheide } from '@/lib/mockData'

export const dynamic = 'force-dynamic'

export interface KasseBescheid {
  id: string
  bescheiddatum: string | null
  referenznummer: string | null
  betrag_eingereicht: number
  betrag_erstattet: number
  betrag_abgelehnt: number
  widerspruch_empfohlen: boolean
  widerspruch_status: string | null
  arzt_reklamation_status: string | null
  selbstbehalt_abgezogen: number | null
  selbstbehalt_verbleibend: number | null
  selbstbehalt_jahresgrenze: number | null
  pdf_storage_path: string | null
  kasse_analyse: Record<string, unknown> | null
  rechnungen: KasseRechnungGruppe[]
  vorgaenge: {
    id: string
    arzt_name: string | null
    rechnungsdatum: string | null
    rechnungsnummer: string | null
    betrag_gesamt: number | null
    kasse_match_status: string | null
    pdf_storage_path: string | null
  }[]
}

export interface UnmatchedVorgang {
  id: string
  arzt_name: string | null
  rechnungsdatum: string | null
  betrag_gesamt: number | null
  pdf_storage_path: string | null
  status: string | null
}

export interface PendingVorgang {
  id: string
  arzt_name: string | null
  rechnungsdatum: string | null
  pdf_storage_path: string
}

export default async function KassenPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = getSupabaseAdmin()

  const { data: kassenRaw } = await admin
    .from('kassenabrechnungen')
    .select('id, bescheiddatum, referenznummer, betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, widerspruch_empfohlen, widerspruch_status, arzt_reklamation_status, selbstbehalt_abgezogen, selbstbehalt_verbleibend, selbstbehalt_jahresgrenze, pdf_storage_path, kasse_analyse')
    .eq('user_id', user.id)
    .order('bescheiddatum', { ascending: false })

  const { data: vorgaengeRaw } = await admin
    .from('vorgaenge')
    .select('id, arzt_name, rechnungsdatum, rechnungsnummer, betrag_gesamt, kasse_match_status, kassenabrechnung_id, pdf_storage_path, status, analyse_status')
    .eq('user_id', user.id)
    .not('pdf_storage_path', 'is', null)
    .order('rechnungsdatum', { ascending: false })

  const vorgaenge = vorgaengeRaw ?? []
  const vorgangByKasse = new Map<string, typeof vorgaenge>()
  const unmatchedVorgaenge: UnmatchedVorgang[] = []
  const pendingVorgaenge: PendingVorgang[] = []

  for (const v of vorgaenge) {
    // Kassenbescheid PDFs blocked by missing credits — show separate CTA card
    if (v.analyse_status === 'pending_credits' && !v.kassenabrechnung_id) {
      pendingVorgaenge.push({
        id: v.id,
        arzt_name: v.arzt_name,
        rechnungsdatum: v.rechnungsdatum,
        pdf_storage_path: v.pdf_storage_path!,
      })
      continue
    }
    if (v.kassenabrechnung_id) {
      const list = vorgangByKasse.get(v.kassenabrechnung_id) ?? []
      list.push(v)
      vorgangByKasse.set(v.kassenabrechnung_id, list)
    } else {
      unmatchedVorgaenge.push({
        id: v.id,
        arzt_name: v.arzt_name,
        rechnungsdatum: v.rechnungsdatum,
        betrag_gesamt: v.betrag_gesamt,
        pdf_storage_path: v.pdf_storage_path,
        status: v.status,
      })
    }
  }

  const kasseBescheide: KasseBescheid[] = (kassenRaw ?? []).map(k => ({
    id: k.id,
    bescheiddatum: k.bescheiddatum,
    referenznummer: k.referenznummer,
    betrag_eingereicht: k.betrag_eingereicht,
    betrag_erstattet: k.betrag_erstattet,
    betrag_abgelehnt: k.betrag_abgelehnt,
    widerspruch_empfohlen:      k.widerspruch_empfohlen,
    widerspruch_status:         k.widerspruch_status ?? null,
    arzt_reklamation_status:    (k.arzt_reklamation_status as string | null) ?? 'keiner',
    selbstbehalt_abgezogen:    k.selbstbehalt_abgezogen    ?? null,
    selbstbehalt_verbleibend:  k.selbstbehalt_verbleibend  ?? null,
    selbstbehalt_jahresgrenze: k.selbstbehalt_jahresgrenze ?? null,
    pdf_storage_path: k.pdf_storage_path,
    kasse_analyse: k.kasse_analyse as Record<string, unknown> | null,
    rechnungen: (k.kasse_analyse?.rechnungen ?? []) as KasseRechnungGruppe[],
    vorgaenge: (vorgangByKasse.get(k.id) ?? []).map(v => ({
      id: v.id,
      arzt_name: v.arzt_name,
      rechnungsdatum: v.rechnungsdatum,
      rechnungsnummer: v.rechnungsnummer,
      betrag_gesamt: v.betrag_gesamt,
      kasse_match_status: v.kasse_match_status,
      pdf_storage_path: v.pdf_storage_path,
    })),
  }))

  const isDemo = kasseBescheide.length === 0 && unmatchedVorgaenge.length === 0 && pendingVorgaenge.length === 0
  const displayBescheide = isDemo ? mockKasseBescheide : kasseBescheide

  return (
    <>
      <Header />
      <main className="max-w-[1100px] mx-auto px-6 py-8 w-full">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-3xl mb-1" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: 'var(--navy)' }}>
              Kassenabrechnungen
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isDemo ? 'Beispielansicht · Laden Sie Ihren ersten Kassenbescheid hoch' : 'Erstattungsbescheide & zugeordnete Arztrechnungen'}
            </p>
          </div>
          <UploadButton type="kassenbescheid" />
        </div>
        <KasseUebersicht kasseBescheide={displayBescheide} unmatchedVorgaenge={unmatchedVorgaenge} pendingVorgaenge={pendingVorgaenge} isDemo={isDemo} />
      </main>
    </>
  )
}
