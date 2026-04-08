import { createServerSupabaseClient } from '@/lib/supabase-server'
import VorgaengeTable from '@/components/dashboard/VorgaengeTable'
import type { Vorgang } from '@/types'

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function RechnungenPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  let vorgaenge: Vorgang[] = []

  if (user) {
    const { data } = await supabase
      .from('vorgaenge')
      .select(`id, rechnungsdatum, betrag_gesamt, betrag_erstattet, einsparpotenzial,
               status, max_faktor, flag_fehlende_begruendung, flag_faktor_ueber_schwellenwert,
               goae_positionen, aerzte ( name, fachgebiet )`)
      .eq('user_id', user.id)
      .order('rechnungsdatum', { ascending: false })

    if (data) {
      type ArztRow = { name: string; fachgebiet: string | null }
      vorgaenge = data.map((v) => {
        const arzt = (v.aerzte as unknown) as ArztRow | null
        const flagged = v.flag_fehlende_begruendung || v.flag_faktor_ueber_schwellenwert
        const goae = (v.goae_positionen as Array<{ ziffer: string }> | null) ?? []
        return {
          id: v.id,
          datum: formatDate(v.rechnungsdatum),
          arzt: arzt?.name ?? 'Unbekannt',
          fachrichtung: arzt?.fachgebiet ?? 'Sonstige',
          betrag: v.betrag_gesamt ?? 0,
          einsparpotenzial: v.einsparpotenzial ?? undefined,
          status: (v.status as Vorgang['status']) ?? 'offen',
          faktor: v.max_faktor ?? undefined,
          flagged: flagged ?? false,
          flagReason: v.flag_fehlende_begruendung
            ? `Faktor ${v.max_faktor}× ohne §12-Begründung`
            : v.flag_faktor_ueber_schwellenwert
            ? `Faktor ${v.max_faktor}× über Schwellenwert`
            : undefined,
          goaZiffern: goae.slice(0, 4).map((p) => `GOÄ ${p.ziffer}`),
        }
      })
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: 'var(--navy)' }}>
          Alle Rechnungen & Vorgänge
        </h1>
        <a
          href="https://wa.me/14155238886"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2"
          style={{ background: '#25D366', color: 'white', textDecoration: 'none' }}
        >
          💬 Neue Rechnung via WhatsApp
        </a>
      </div>

      {vorgaenge.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'white', borderRadius: 16, color: '#64748b'
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📄</div>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Noch keine Rechnungen vorhanden.</p>
          <p style={{ fontSize: 14 }}>Leiten Sie Ihre erste Rechnung per WhatsApp an <strong>+1 415 523 8886</strong> weiter.</p>
        </div>
      ) : (
        <VorgaengeTable vorgaenge={vorgaenge} />
      )}
    </>
  )
}
