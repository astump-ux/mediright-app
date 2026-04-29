/**
 * /meine-faelle — Primary case-centric view.
 *
 * Combines Kassenabrechnungen + Widersprüche + Rechnungen into one unified
 * "Meine Fälle" dossier page. Each Kassenbescheid is the primary object;
 * linked Arztrechnungen and Widerspruch-Kommunikationen are nested within it.
 */
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import Header from '@/components/layout/Header'
import FaelleDossierClient from '@/components/meine-faelle/FaelleDossierClient'
import type { KasseRechnungGruppe } from '@/lib/goae-analyzer'
import { mockWiderspruchFaelle } from '@/lib/mockData'

export const dynamic = 'force-dynamic'

// ── Unified FallDossier type — superset of KasseBescheid + WiderspruchFall ───

export interface FallKommunikation {
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

export interface FallVorgang {
  id: string
  arzt_name: string | null
  rechnungsdatum: string | null
  rechnungsnummer: string | null
  betrag_gesamt: number | null
  kasse_match_status: string | null
  pdf_storage_path: string | null
  goae_analyse: Record<string, unknown> | null
}

export interface FallDossier {
  id: string
  bescheiddatum: string | null
  referenznummer: string | null
  betrag_eingereicht: number
  betrag_erstattet: number
  betrag_abgelehnt: number
  widerspruch_empfohlen: boolean
  widerspruch_status: string
  arzt_reklamation_status: string
  widerspruch_gesendet_am: string | null
  betrag_widerspruch_kasse: number | null
  betrag_korrektur_arzt: number | null
  selbstbehalt_abgezogen: number | null
  selbstbehalt_verbleibend: number | null
  selbstbehalt_jahresgrenze: number | null
  kasse_analyse: Record<string, unknown> | null
  rechnungen: KasseRechnungGruppe[]
  pdf_storage_path: string | null
  vorgaenge: FallVorgang[]
  kommunikationen: FallKommunikation[]
}

export interface UnverarbeitetVorgang {
  id: string
  arzt_name: string | null
  rechnungsdatum: string | null
  betrag_gesamt: number | null
  pdf_storage_path: string | null
  status: string | null
}

export default async function MeineFaellePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = getSupabaseAdmin()

  // ── 1. Fetch all kassenabrechnungen ─────────────────────────────────────────
  const { data: kassenRaw } = await admin
    .from('kassenabrechnungen')
    .select('id, bescheiddatum, referenznummer, betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, widerspruch_empfohlen, widerspruch_status, arzt_reklamation_status, widerspruch_gesendet_am, betrag_widerspruch_kasse, betrag_korrektur_arzt, selbstbehalt_abgezogen, selbstbehalt_verbleibend, selbstbehalt_jahresgrenze, kasse_analyse, pdf_storage_path')
    .eq('user_id', user.id)
    .order('bescheiddatum', { ascending: false })

  // Auto-promote 'keiner' records that have rejections (same logic as /widersprueche)
  const pendingPromotion = (kassenRaw ?? []).filter(
    k => k.widerspruch_status === 'keiner' && k.kasse_analyse != null && k.betrag_abgelehnt > 0
  )
  if (pendingPromotion.length > 0) {
    await admin
      .from('kassenabrechnungen')
      .update({ widerspruch_status: 'erstellt' })
      .in('id', pendingPromotion.map(k => k.id))
    for (const k of pendingPromotion) {
      (k as Record<string, unknown>).widerspruch_status = 'erstellt'
    }
  }

  const kasseIds = (kassenRaw ?? []).map(k => k.id)

  // ── 2. Fetch all linked vorgaenge ───────────────────────────────────────────
  const { data: vorgaengeRaw } = await admin
    .from('vorgaenge')
    .select('id, arzt_name, rechnungsdatum, rechnungsnummer, betrag_gesamt, kasse_match_status, kassenabrechnung_id, pdf_storage_path, status, claude_analyse')
    .eq('user_id', user.id)
    .order('rechnungsdatum', { ascending: false })

  const vorgaengeByKasse = new Map<string, FallVorgang[]>()
  const unverarbeitet: UnverarbeitetVorgang[] = []

  for (const v of vorgaengeRaw ?? []) {
    if (v.kassenabrechnung_id) {
      const list = vorgaengeByKasse.get(v.kassenabrechnung_id) ?? []
      list.push({
        id: v.id,
        arzt_name: v.arzt_name,
        rechnungsdatum: v.rechnungsdatum,
        rechnungsnummer: v.rechnungsnummer,
        betrag_gesamt: v.betrag_gesamt,
        kasse_match_status: v.kasse_match_status,
        pdf_storage_path: v.pdf_storage_path,
        goae_analyse: (v.claude_analyse as Record<string, unknown> | null) ?? null,
      })
      vorgaengeByKasse.set(v.kassenabrechnung_id, list)
    } else if (v.pdf_storage_path) {
      unverarbeitet.push({
        id: v.id,
        arzt_name: v.arzt_name,
        rechnungsdatum: v.rechnungsdatum,
        betrag_gesamt: v.betrag_gesamt,
        pdf_storage_path: v.pdf_storage_path,
        status: v.status,
      })
    }
  }

  // ── 3. Fetch all widerspruch_kommunikationen ────────────────────────────────
  const kommunikationenRaw = kasseIds.length > 0
    ? (await admin
        .from('widerspruch_kommunikationen')
        .select('*')
        .in('kassenabrechnungen_id', kasseIds)
        .eq('user_id', user.id)
        .order('datum', { ascending: true })
        .order('created_at', { ascending: true })
      ).data ?? []
    : []

  const kommunikationenByKasse = new Map<string, FallKommunikation[]>()
  for (const k of kommunikationenRaw) {
    const list = kommunikationenByKasse.get(k.kassenabrechnungen_id) ?? []
    list.push(k as FallKommunikation)
    kommunikationenByKasse.set(k.kassenabrechnungen_id, list)
  }

  // ── 4. Assemble FallDossier objects ─────────────────────────────────────────
  const faelle: FallDossier[] = (kassenRaw ?? []).map(k => ({
    id: k.id,
    bescheiddatum: k.bescheiddatum,
    referenznummer: k.referenznummer,
    betrag_eingereicht: k.betrag_eingereicht ?? 0,
    betrag_erstattet: k.betrag_erstattet ?? 0,
    betrag_abgelehnt: k.betrag_abgelehnt ?? 0,
    widerspruch_empfohlen: k.widerspruch_empfohlen ?? false,
    widerspruch_status: k.widerspruch_status ?? 'keiner',
    arzt_reklamation_status: (k.arzt_reklamation_status as string | null) ?? 'keiner',
    widerspruch_gesendet_am: k.widerspruch_gesendet_am ?? null,
    betrag_widerspruch_kasse: k.betrag_widerspruch_kasse ?? null,
    betrag_korrektur_arzt: k.betrag_korrektur_arzt ?? null,
    selbstbehalt_abgezogen: k.selbstbehalt_abgezogen ?? null,
    selbstbehalt_verbleibend: k.selbstbehalt_verbleibend ?? null,
    selbstbehalt_jahresgrenze: k.selbstbehalt_jahresgrenze ?? null,
    kasse_analyse: k.kasse_analyse as Record<string, unknown> | null,
    rechnungen: ((k.kasse_analyse as Record<string, unknown> | null)?.rechnungen ?? []) as KasseRechnungGruppe[],
    pdf_storage_path: k.pdf_storage_path ?? null,
    vorgaenge: vorgaengeByKasse.get(k.id) ?? [],
    kommunikationen: kommunikationenByKasse.get(k.id) ?? [],
  }))

  const isDemo = faelle.length === 0 && unverarbeitet.length === 0

  // Demo mode: cast mockWiderspruchFaelle to FallDossier[] (compatible shape)
  const displayFaelle = isDemo
    ? (mockWiderspruchFaelle as unknown as FallDossier[])
    : faelle

  return (
    <>
      <Header />
      <main className="max-w-[1100px] mx-auto px-6 py-8 w-full">
        <FaelleDossierClient
          faelle={displayFaelle}
          unverarbeitet={isDemo ? [] : unverarbeitet}
          isDemo={isDemo}
        />
      </main>
    </>
  )
}
