import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import RechnungenClient from '@/components/rechnungen/RechnungenClient'
import type { KasseRechnungGruppe, KasseAnalyseResult } from '@/lib/goae-analyzer'

export const dynamic = 'force-dynamic'

export default async function RechnungenPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  let vorgaenge: Parameters<typeof RechnungenClient>[0]['vorgaenge'] = []

  if (user) {
    const { data } = await getSupabaseAdmin()
      .from('vorgaenge')
      .select(`
        id, rechnungsdatum, betrag_gesamt, betrag_erstattet, betrag_abgelehnt,
        einsparpotenzial, status, max_faktor, arzt_name,
        flag_fehlende_begruendung, flag_faktor_ueber_schwellenwert,
        goae_positionen, claude_analyse,
        kasse_pdf_storage_path, kasse_analyse,
        kassenabrechnung_id,
        kassenabrechnungen ( id, bescheiddatum, referenznummer, betrag_erstattet, betrag_abgelehnt, widerspruch_empfohlen, widerspruch_status, kasse_analyse ),
        aerzte ( name, fachgebiet )
      `)
      .eq('user_id', user.id)
      .order('rechnungsdatum', { ascending: false })

    if (data) {
      type ArztRow = { name: string; fachgebiet: string | null }
      type KasseRow = {
        id: string
        bescheiddatum: string | null
        referenznummer: string | null
        betrag_erstattet: number | null
        betrag_abgelehnt: number | null
        widerspruch_empfohlen: boolean
        widerspruch_status: string | null
        kasse_analyse: Record<string, unknown> | null
      }

      vorgaenge = data.map(v => {
        const arzt = (v.aerzte as unknown) as ArztRow | null
        const flagged = !!(v.flag_fehlende_begruendung || v.flag_faktor_ueber_schwellenwert)
        const goae = (v.goae_positionen as Array<{ ziffer: string }> | null) ?? []

        // Kassenbescheid via FK join (new architecture)
        const kassenabrechnung = (v.kassenabrechnungen as unknown) as KasseRow | null

        // Find the matched rechnungsgruppe for THIS vorgang within the Kassenbescheid
        let kasseGruppe: KasseRechnungGruppe | null = null
        let kasseAnalyseNew: KasseAnalyseResult | null = null
        if (kassenabrechnung?.kasse_analyse) {
          const ka = kassenabrechnung.kasse_analyse as unknown as KasseAnalyseResult
          kasseAnalyseNew = ka
          kasseGruppe = ka.rechnungen?.find(r => r.matchedVorgangId === v.id) ?? null
        }

        return {
          id: v.id,
          datum: v.rechnungsdatum
            ? new Date(v.rechnungsdatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '–',
          arzt: arzt?.name ?? v.arzt_name ?? 'Unbekannt',
          fachrichtung: arzt?.fachgebiet ?? 'Sonstige',
          betrag: v.betrag_gesamt ?? 0,
          betragErstattet: v.betrag_erstattet ?? undefined,
          einsparpotenzial: v.einsparpotenzial ?? undefined,
          status: v.status ?? 'offen',
          flagged,
          flagReason: v.flag_fehlende_begruendung
            ? `Faktor ${v.max_faktor}× ohne §12-Begründung`
            : v.flag_faktor_ueber_schwellenwert
            ? `Faktor ${v.max_faktor}× über Schwellenwert`
            : undefined,
          faktor: v.max_faktor ?? undefined,
          goaZiffern: goae.slice(0, 5).map(p => `GOÄ ${p.ziffer}`),
          hasPdf: true,
          hasKassePdf: !!v.kasse_pdf_storage_path,
          claudeAnalyse: v.claude_analyse as Record<string, unknown> | null,
          kasseAnalyse: v.kasse_analyse as Record<string, unknown> | null,
          // New: linked Kassenbescheid data
          kassenbescheid: kassenabrechnung ? {
            id: kassenabrechnung.id,
            bescheiddatum: kassenabrechnung.bescheiddatum,
            referenznummer: kassenabrechnung.referenznummer,
            betragErstattet: kassenabrechnung.betrag_erstattet,
            betragAbgelehnt: kassenabrechnung.betrag_abgelehnt,
            widerspruchEmpfohlen: kassenabrechnung.widerspruch_empfohlen,
            widerspruchStatus: kassenabrechnung.widerspruch_status ?? 'keiner',
          } : null,
          kasseGruppe,
          kasseAnalyseNew,
        }
      })
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, color: '#0f172a', fontWeight: 400, margin: 0 }}>
            Rechnungen & Vorgänge
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {vorgaenge.length} Vorgang{vorgaenge.length !== 1 ? '‍e' : ''} · PDF-Download & KI-Analyse verfügbar
          </p>
        </div>
        <a
          href="https://wa.me/14155238886"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', background: '#25D366', color: 'white',
            borderRadius: 10, fontWeight: 600, fontSize: 13, textDecoration: 'none',
          }}
        >
          💬 Neue Rechnung einreichen
        </a>
      </div>

      <RechnungenClient vorgaenge={vorgaenge} />
    </>
  )
}
