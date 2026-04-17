'use client'
import { useState, useEffect } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import type { WiderspruchFall, WiderspruchKommunikation, WiderspruchVorgang } from '@/app/widersprueche/page'

// ── Design tokens ─────────────────────────────────────────────────────────────
const navy   = '#0f172a'
const slate  = '#64748b'
const mint   = '#10b981'
const mintL  = '#ecfdf5'
const amber  = '#f59e0b'
const amberL = '#fffbeb'
const red    = '#ef4444'
const blue   = '#3b82f6'
const blueL  = '#eff6ff'
const grey   = '#f1f5f9'
const orange = '#fb923c'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; accent: string; icon: string }> = {
  erstellt:    { icon: '📝', label: 'Entwurf',          bg: grey,       color: slate,     accent: '#cbd5e1' },
  gesendet:    { icon: '📨', label: 'Gesendet',          bg: blueL,      color: '#1d4ed8', accent: blue },
  beantwortet: { icon: '💬', label: 'Beantwortet',       bg: amberL,     color: '#92400e', accent: amber },
  erfolgreich: { icon: '✅', label: 'Erfolgreich',        bg: mintL,      color: '#065f46', accent: mint },
  abgelehnt:   { icon: '❌', label: 'Endabgelehnt',      bg: '#fef2f2',  color: '#991b1b', accent: red },
}

const DRINGLICHKEIT_COLOR: Record<string, string> = {
  hoch: red, mittel: amber, niedrig: mint,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toFixed(2).replace('.', ',') + ' €'
}

function useUserFullName(): string {
  const [name, setName] = useState('[Ihr vollständiger Name]')
  useEffect(() => {
    getSupabaseClient()
      .from('profiles').select('full_name').single()
      .then(({ data }) => { if (data?.full_name) setName(data.full_name) })
  }, [])
  return name
}

// ── Widerspruchsbrief regenerator ─────────────────────────────────────────────
// Regenerates the appeal letter from stored kasse_analyse JSONB data.
// Note: the user may have edited the final letter before sending.
type RawPosition = {
  ziffer?: string
  bezeichnung?: string
  betragEingereicht?: number
  betragErstattet?: number
  ablehnungsgrund?: string | null
  status?: string
  aktionstyp?: string | null
}
type RawRechnung = { arztName?: string | null; positionen?: RawPosition[] }

function generateWiderspruchBrief(fall: WiderspruchFall, userName: string): { betreff: string; body: string } {
  const analyse = fall.kasse_analyse
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const bescheidDatum = fmtDateShort(fall.bescheiddatum)
  const ref = fall.referenznummer ?? '[Ihre Referenznummer]'
  const begruendung = (analyse?.widerspruchBegruendung as string | null)
    ?? 'Die Ablehnung ist aus meiner Sicht nicht gerechtfertigt.'

  const rechnungen = ((analyse?.rechnungen ?? []) as RawRechnung[])
  const kassePos = rechnungen.flatMap(g =>
    (g.positionen ?? []).filter(p =>
      (p.status === 'abgelehnt' || p.status === 'gekuerzt') &&
      p.aktionstyp !== 'korrektur_arzt'
    )
  )
  const betragKasse = kassePos.reduce((s, p) => s + (p.betragEingereicht ?? 0) - (p.betragErstattet ?? 0), 0)
  const abgelehnt = betragKasse > 0 ? betragKasse.toFixed(2) : fall.betrag_abgelehnt.toFixed(2)

  const posListe = kassePos.length > 0
    ? kassePos.map(p =>
        `  - Ziffer ${p.ziffer ?? '?'} "${p.bezeichnung ?? '?'}": ${(p.betragEingereicht ?? 0).toFixed(2)} € eingereicht, ${(p.betragErstattet ?? 0).toFixed(2)} € erstattet\n    Ablehnungsgrund: ${p.ablehnungsgrund ?? 'nicht angegeben'}`
      ).join('\n')
    : '  [Betroffene Positionen]'

  const betreff = `Widerspruch gegen Leistungsbescheid vom ${bescheidDatum} – Referenz ${ref}`
  const body = `AXA Krankenversicherung AG\nKundenservice / Leistungsabteilung\n[Adresse aus Versicherungsschein]

${heute}

Betreff: ${betreff}
Versicherungsnehmer: ${userName}
Versicherungsnummer: [Ihre Versicherungsnummer]

Sehr geehrte Damen und Herren,

hiermit lege ich fristgerecht Widerspruch gegen Ihren Leistungsbescheid vom ${bescheidDatum} (Referenz: ${ref}) ein.

Sie haben Leistungen in Höhe von ${abgelehnt} € nicht erstattet. Ich bin der Auffassung, dass diese Entscheidung nicht gerechtfertigt ist und bitte Sie um eine erneute Prüfung.

Betroffene Positionen:
${posListe}

Begründung meines Widerspruchs:
${begruendung}

Ich bitte Sie daher, Ihre Entscheidung zu überprüfen und mir den abgelehnten Betrag von ${abgelehnt} € vollständig zu erstatten. Sollten Sie an Ihrer Entscheidung festhalten, behalte ich mir vor, die Ombudsstelle für private Kranken- und Pflegeversicherung (www.pkv-ombudsmann.de) einzuschalten.

Bitte bestätigen Sie den Eingang dieses Widerspruchs schriftlich.

Mit freundlichen Grüßen,
${userName}`

  return { betreff, body }
}

// ── Arztreklamation brief generator ──────────────────────────────────────────
// Generates the doctor-correction / attest-request letter from kasse_analyse JSONB.
function generateArztBrief(fall: WiderspruchFall, userName: string): { betreff: string; body: string } {
  const analyse = fall.kasse_analyse
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const rechnungen = ((analyse?.rechnungen ?? []) as RawRechnung[])
  const naechsteSchritte = (analyse?.naechsteSchritte as string[] | null) ?? []

  const korrekturPos = rechnungen.flatMap(g =>
    (g.positionen ?? [])
      .filter(p => p.aktionstyp === 'korrektur_arzt')
      .map(p => ({ arztName: g.arztName ?? null, p }))
  )
  const attestPos = rechnungen.flatMap(g =>
    (g.positionen ?? [])
      .filter(p => p.aktionstyp !== 'korrektur_arzt' && (p.status === 'abgelehnt' || p.status === 'gekuerzt'))
      .map(p => ({ arztName: g.arztName ?? null, p }))
  )

  const hasKorrektur = korrekturPos.length > 0
  const hasArztSchritte = naechsteSchritte.some(s => {
    const l = s.toLowerCase()
    return l.includes('arzt') || l.includes('attest') || l.includes('anfordern') || l.includes('stellungnahme')
  })
  const hasAttest = attestPos.length > 0 && hasArztSchritte

  const arztName =
    korrekturPos[0]?.arztName ??
    attestPos[0]?.arztName ??
    fall.vorgaenge[0]?.arzt_name ??
    '[Arztpraxis]'

  const betreff = hasKorrektur && hasAttest
    ? 'Klärungsbedarf zu Ihrer Abrechnung – Rechnungskorrektur und ärztliche Bestätigung erbeten'
    : hasKorrektur
    ? 'Bitte um Rechnungskorrektur – Ihre Abrechnung'
    : 'Bitte um ärztliche Bestätigung zur Notwendigkeit der Behandlung'

  let body = `${arztName}\n[Adresse der Praxis – bitte eintragen]\n\n${heute}\n\nBetreff: ${betreff}\n\nSehr geehrte Damen und Herren,\n\nnach Prüfung meiner Abrechnung durch meine private Krankenversicherung (AXA) wende ich mich mit folgendem Klärungsbedarf an Sie:\n\n`

  let sec = 1

  if (hasKorrektur) {
    body += `${hasAttest ? sec + '. ' : ''}BITTE UM RECHNUNGSKORREKTUR\n\n`
    body += `Folgende Position(en) wurden von AXA abgelehnt, da die abgerechnete GOÄ-Ziffer nicht anerkannt wird:\n\n`
    body += korrekturPos.map(({ p }) =>
      `  - GOÄ Ziff. ${p.ziffer ?? '?'} "${p.bezeichnung ?? '?'}": ${(p.betragEingereicht ?? 0).toFixed(2)} € eingereicht\n    Ablehnungsgrund: ${p.ablehnungsgrund ?? 'Ziffer nicht anerkannt'}`
    ).join('\n')
    body += `\n\nIch bitte Sie, die korrekte GOÄ-Ziffer für die tatsächlich erbrachte Leistung zu verwenden und mir eine entsprechend korrigierte Rechnung zuzusenden.\n\n`
    sec++
  }

  if (hasAttest) {
    body += `${hasKorrektur ? sec + '. ' : ''}BITTE UM ÄRZTLICHE BESTÄTIGUNG\n\n`
    body += `Für folgende Leistungen hat AXA die medizinische Notwendigkeit bestritten:\n\n`
    body += attestPos.map(({ p }) =>
      `  - GOÄ Ziff. ${p.ziffer ?? '?'} "${p.bezeichnung ?? '?'}": ${(p.betragEingereicht ?? 0).toFixed(2)} €\n    Ablehnungsgrund: ${p.ablehnungsgrund ?? 'Medizinische Notwendigkeit nicht belegt'}`
    ).join('\n')
    body += `\n\nDas Attest / die Stellungnahme sollte beinhalten:\n  - Diagnose (möglichst mit ICD-10-Code)\n  - Medizinische Begründung und Behandlungsziel\n  - Indikation für die konkrete Behandlung\n\n`
  }

  body += `Für Ihre Unterstützung bedanke ich mich herzlich.\n\nMit freundlichen Grüßen,\n${userName}`
  return { betreff, body }
}

// ── Ziel-Bar (shows € goal for both procedure tracks) ────────────────────────
function ZielBar({ fall }: { fall: WiderspruchFall }) {
  const rechnungen = ((fall.kasse_analyse?.rechnungen ?? []) as RawRechnung[])

  // Compute amounts from kasse_analyse positions as fallback
  const kassePosBetrag = rechnungen
    .flatMap(g => (g.positionen ?? []).filter(p =>
      (p.status === 'abgelehnt' || p.status === 'gekuerzt') && p.aktionstyp !== 'korrektur_arzt'
    ))
    .reduce((s, p) => s + (p.betragEingereicht ?? 0) - (p.betragErstattet ?? 0), 0)

  const arztPosBetrag = rechnungen
    .flatMap(g => (g.positionen ?? []).filter(p => p.aktionstyp === 'korrektur_arzt'))
    .reduce((s, p) => s + (p.betragEingereicht ?? 0) - (p.betragErstattet ?? 0), 0)

  const kasseZiel = (fall.betrag_widerspruch_kasse != null && fall.betrag_widerspruch_kasse > 0)
    ? fall.betrag_widerspruch_kasse
    : kassePosBetrag > 0 ? kassePosBetrag : null

  const arztZiel = (fall.betrag_korrektur_arzt != null && fall.betrag_korrektur_arzt > 0)
    ? fall.betrag_korrektur_arzt
    : arztPosBetrag > 0 ? arztPosBetrag : null

  if (!kasseZiel && !arztZiel) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        Ziel:
      </span>
      {kasseZiel != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: blueL, border: `1.5px solid ${blue}` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: blue, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8' }}>Kassenwiderspruch</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace' }}>{fmt(kasseZiel)}</span>
        </div>
      )}
      {arztZiel != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#fff7ed', border: `1.5px solid ${orange}` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: orange, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9a3412' }}>Arztreklamation</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#9a3412', fontFamily: 'monospace' }}>{fmt(arztZiel)}</span>
        </div>
      )}
      {kasseZiel != null && arztZiel != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: mintL, border: `1.5px solid ${mint}` }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#065f46' }}>Gesamt</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#065f46', fontFamily: 'monospace' }}>{fmt(kasseZiel + arztZiel)}</span>
        </div>
      )}
    </div>
  )
}

// ── Collapsible section helper ─────────────────────────────────────────────────
function Section({
  icon, title, badge, defaultOpen = true, accent = '#e2e8f0', children,
}: {
  icon: string; title: string; badge?: string; defaultOpen?: boolean
  accent?: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${accent}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', background: open ? '#fafafa' : 'white',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          borderBottom: open ? `1px solid ${accent}` : 'none',
        }}
      >
        <span>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 12, color: navy, flex: 1 }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: accent + '30', color: slate }}>
            {badge}
          </span>
        )}
        <span style={{ fontSize: 10, color: slate, marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  )
}

// ── PDF link button ────────────────────────────────────────────────────────────
function PdfLinkButton({ kasseId }: { kasseId: string }) {
  const [loading, setLoading] = useState(false)
  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/kassenabrechnungen/${kasseId}/pdf-url`)
      const { url } = await res.json()
      if (url) window.open(url, '_blank')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }
  return (
    <button onClick={handleClick} disabled={loading}
      style={{
        fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8,
        border: '1px solid #93c5fd', background: blueL, color: '#1d4ed8',
        cursor: loading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
      }}>
      {loading ? '…' : '📎 PDF öffnen'}
    </button>
  )
}

// ── Ablehnungsbescheid section ────────────────────────────────────────────────
function AblehnungsbescheidSection({ fall }: { fall: WiderspruchFall }) {
  const analyse = fall.kasse_analyse
  const rechnungen = ((analyse?.rechnungen ?? []) as RawRechnung[])
  const alleAbgelehnte = rechnungen.flatMap(g =>
    (g.positionen ?? []).filter(p => p.status === 'abgelehnt' || p.status === 'gekuerzt')
      .map(p => ({ arztName: g.arztName, p }))
  )
  const ablehnungsgruende = (analyse?.ablehnungsgruende as string[] | null) ?? []
  const quote = fall.betrag_eingereicht > 0
    ? ((fall.betrag_erstattet / fall.betrag_eingereicht) * 100).toFixed(0)
    : null

  return (
    <Section icon="📄" title="Ablehnungsbescheid" accent="#fca5a5" defaultOpen={true}>
      {/* Summary row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Bescheid vom</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: navy }}>{fmtDate(fall.bescheiddatum)}</div>
          {fall.referenznummer && (
            <div style={{ fontSize: 11, color: slate, marginTop: 1 }}>Ref. {fall.referenznummer}</div>
          )}
        </div>
        <div style={{ minWidth: 100 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Eingereicht</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: navy }}>{fmt(fall.betrag_eingereicht)}</div>
        </div>
        <div style={{ minWidth: 100 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Erstattet</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: mint }}>{fmt(fall.betrag_erstattet)}</div>
          {quote && <div style={{ fontSize: 10, color: slate }}>({quote}%)</div>}
        </div>
        <div style={{ minWidth: 100 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Abgelehnt</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: red }}>{fmt(fall.betrag_abgelehnt)}</div>
        </div>
        {fall.pdf_storage_path && (
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <PdfLinkButton kasseId={fall.id} />
          </div>
        )}
      </div>

      {/* Abgelehnte Positionen */}
      {alleAbgelehnte.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Abgelehnte / Gekürzte Positionen ({alleAbgelehnte.length})
          </div>
          <div style={{ border: '1px solid #fecaca', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#fef2f2' }}>
                  <th style={{ padding: '5px 10px', textAlign: 'left', color: '#991b1b', fontWeight: 600 }}>Ziffer</th>
                  <th style={{ padding: '5px 10px', textAlign: 'left', color: '#991b1b', fontWeight: 600 }}>Bezeichnung / Grund</th>
                  <th style={{ padding: '5px 10px', textAlign: 'right', color: '#991b1b', fontWeight: 600 }}>Eingereicht</th>
                  <th style={{ padding: '5px 10px', textAlign: 'right', color: '#991b1b', fontWeight: 600 }}>Erstattet</th>
                  <th style={{ padding: '5px 10px', textAlign: 'center', color: '#991b1b', fontWeight: 600 }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {alleAbgelehnte.map(({ arztName, p }, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #fecaca', background: i % 2 === 0 ? 'white' : '#fff5f5' }}>
                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#991b1b' }}>{p.ziffer}</td>
                    <td style={{ padding: '5px 10px' }}>
                      <div style={{ color: navy, fontWeight: 500 }}>{p.bezeichnung}</div>
                      {arztName && <div style={{ color: slate, fontSize: 10, marginTop: 1 }}>{arztName}</div>}
                      {p.ablehnungsgrund && (
                        <div style={{ color: red, fontStyle: 'italic', fontSize: 10, marginTop: 2 }}>→ {p.ablehnungsgrund}</div>
                      )}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: slate }}>{fmt(p.betragEingereicht)}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: (p.betragErstattet ?? 0) > 0 ? amber : red }}>
                      {fmt(p.betragErstattet)}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                      {p.aktionstyp === 'korrektur_arzt'
                        ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>Korrektur</span>
                        : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: amberL, color: '#92400e', border: '1px solid #fcd34d' }}>Widerspruch</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ablehnungsgründe */}
      {ablehnungsgruende.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
            Ablehnungsgründe AXA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ablehnungsgruende.map((g, i) => (
              <div key={i} style={{ fontSize: 11, color: '#7f1d1d', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ color: red, flexShrink: 0 }}>✗</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Rechnungen section ────────────────────────────────────────────────────────
function RechnungenSection({ vorgaenge }: { vorgaenge: WiderspruchVorgang[] }) {
  if (vorgaenge.length === 0) return null
  return (
    <Section icon="🧾" title={`Zugehörige Rechnungen`} badge={`${vorgaenge.length}`} accent="#e2e8f0" defaultOpen={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {vorgaenge.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 12 }}>
            <span style={{ color: slate }}>🩺</span>
            <span style={{ fontWeight: 600, color: navy, flex: 1 }}>{v.arzt_name ?? 'Arzt unbekannt'}</span>
            {v.rechnungsdatum && <span style={{ color: slate, fontSize: 11 }}>{fmtDate(v.rechnungsdatum)}</span>}
            {v.betrag_gesamt != null && (
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: navy }}>{fmt(v.betrag_gesamt)}</span>
            )}
            <a
              href="/rechnungen"
              style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: slate, textDecoration: 'none', border: '1px solid #e2e8f0' }}
            >
              → Rechnungen
            </a>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── KI-Analyse section ────────────────────────────────────────────────────────
function KiAnalyseSection({ fall }: { fall: WiderspruchFall }) {
  const analyse = fall.kasse_analyse
  const widerspruchEmpfohlen  = analyse?.widerspruchEmpfohlen as boolean | null
  const erklaerung            = analyse?.widerspruchErklaerung as string | null
  const erfolg                = analyse?.widerspruchErfolgswahrscheinlichkeit as number | null
  const schritte              = analyse?.naechsteSchritte as string[] | null
  const zusammenfassung       = analyse?.zusammenfassung as string | null

  if (!widerspruchEmpfohlen && !erklaerung && erfolg == null) return null

  const erfolgColor = erfolg == null ? slate : erfolg >= 70 ? '#22c55e' : erfolg >= 40 ? amber : red

  return (
    <Section icon="🤖" title="KI-Analyse & Handlungsempfehlung" accent="#fcd34d" defaultOpen={true}>
      {/* Summary */}
      {zusammenfassung && (
        <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
          {zusammenfassung}
        </div>
      )}

      {/* Erfolgschance */}
      {erfolg != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'white', borderRadius: 10, padding: '6px 14px', border: `1.5px solid ${erfolgColor}` }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: erfolgColor, lineHeight: 1 }}>{erfolg}%</div>
            <div style={{ fontSize: 10, color: slate, marginTop: 1 }}>Erfolgschance</div>
          </div>
          {erklaerung && (
            <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6, margin: 0, flex: 1 }}>{erklaerung}</p>
          )}
        </div>
      )}
      {!erfolg && erklaerung && (
        <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6, margin: '0 0 10px' }}>{erklaerung}</p>
      )}

      {/* Nächste Schritte */}
      {schritte && schritte.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Nächste Schritte
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {schritte.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: amber, color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Timeline: Widerspruch-Brief node ──────────────────────────────────────────
function WiderspruchBriefNode({ fall, userName }: { fall: WiderspruchFall; userName: string }) {
  const [showBrief, setShowBrief] = useState(false)
  const [copied, setCopied]       = useState(false)
  const { betreff, body }         = generateWiderspruchBrief(fall, userName)
  const [editBetreff, setEditBetreff] = useState(betreff)
  const [editBody, setEditBody]       = useState(body)

  const sentDate = fall.widerspruch_gesendet_am ?? fall.bescheiddatum
  const cfg = STATUS_CONFIG['gesendet']

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {/* Timeline dot + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: blue, border: '2px solid white', boxShadow: `0 0 0 2px ${blue}`, flexShrink: 0, marginTop: 4, zIndex: 1 }} />
        <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: blue }}>📤 Du → AXA</span>
          {sentDate && <span style={{ fontSize: 11, color: slate }}>{fmtDate(sentDate)}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 6 }}>Widerspruchsbrief an AXA</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setShowBrief(v => !v)}
            style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: showBrief ? navy : 'white', color: showBrief ? 'white' : slate, cursor: 'pointer' }}>
            {showBrief ? '▲ Brief schließen' : '▼ Brief anzeigen'}
          </button>
          <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Vorlage des gesendeten Widerspruchs</span>
        </div>

        {showBrief && (
          <div style={{ border: `2px solid ${blue}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: blueL, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13 }}>📧 Widerspruchsbrief</span>
              <span style={{ fontSize: 11, color: '#1d4ed8' }}>— Text kann angepasst werden</span>
            </div>
            <div style={{ padding: 14, background: 'white' }}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 }}>Betreff</label>
                <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, color: navy, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 }}>Brieftext</label>
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={14}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={async () => {
                  await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`)
                  setCopied(true); setTimeout(() => setCopied(false), 2000)
                }}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: copied ? mintL : grey, color: copied ? '#065f46' : navy }}>
                  {copied ? '✓ Kopiert' : '📋 Text kopieren'}
                </button>
                <button onClick={() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: blueL, color: '#1d4ed8' }}>
                  In Gmail öffnen
                </button>
                <button onClick={() => window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#e8f4fd', color: '#0078d4' }}>
                  In Outlook öffnen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Timeline: Arztreklamation-Brief node ─────────────────────────────────────
function ArztReklamationsBriefNode({ fall, userName }: { fall: WiderspruchFall; userName: string }) {
  const [showBrief, setShowBrief] = useState(false)
  const [copied, setCopied]       = useState(false)
  const { betreff, body }         = generateArztBrief(fall, userName)
  const [editBetreff, setEditBetreff] = useState(betreff)
  const [editBody, setEditBody]       = useState(body)

  const orangeL      = '#fff7ed'
  const orangeAccent = '#9a3412'

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {/* Timeline dot + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: orange, border: '2px solid white', boxShadow: `0 0 0 2px ${orange}`, flexShrink: 0, marginTop: 4, zIndex: 1 }} />
        <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: orange }}>📤 Du → Arzt</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: orangeL, color: orangeAccent, border: `1px solid #fed7aa` }}>
            📋 Entwurf
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 6 }}>Reklamationsschreiben an Arztpraxis</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setShowBrief(v => !v)}
            style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: showBrief ? orange : 'white', color: showBrief ? 'white' : slate, cursor: 'pointer' }}>
            {showBrief ? '▲ Brief schließen' : '▼ Brief anzeigen'}
          </button>
          <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Vorlage für Arztreklamation / Attest-Anfrage</span>
        </div>

        {showBrief && (
          <div style={{ border: `2px solid ${orange}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: orangeL, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid #fed7aa` }}>
              <span style={{ fontWeight: 700, color: orangeAccent, fontSize: 13 }}>📧 Reklamationsbrief an Arztpraxis</span>
              <span style={{ fontSize: 11, color: orangeAccent }}>— Text kann angepasst werden</span>
            </div>
            <div style={{ padding: 14, background: 'white' }}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 }}>Betreff</label>
                <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, color: navy, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 }}>Brieftext</label>
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={14}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={async () => {
                  await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`)
                  setCopied(true); setTimeout(() => setCopied(false), 2000)
                }}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: copied ? mintL : grey, color: copied ? '#065f46' : navy }}>
                  {copied ? '✓ Kopiert' : '📋 Text kopieren'}
                </button>
                <button onClick={() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: blueL, color: '#1d4ed8' }}>
                  In Gmail öffnen
                </button>
                <button onClick={() => window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#e8f4fd', color: '#0078d4' }}>
                  In Outlook öffnen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Timeline: single communication entry ──────────────────────────────────────
function TimelineEntry({
  k, isLast, onReplyDraft,
}: {
  k: WiderspruchKommunikation
  isLast: boolean
  onReplyDraft?: (komm: WiderspruchKommunikation) => void
}) {
  const [showText, setShowText]   = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [editBetreff, setEditBetreff] = useState(k.ki_vorschlag_betreff ?? '')
  const [editBody, setEditBody]       = useState(k.ki_vorschlag_inhalt ?? '')
  const [copied, setCopied]           = useState(false)
  const [archived, setArchived]       = useState(false)

  const isOutgoing = k.richtung === 'ausgehend'
  const dotColor   = isOutgoing ? blue : k.ki_dringlichkeit === 'hoch' ? red : k.ki_dringlichkeit === 'mittel' ? amber : orange

  async function logReplyAndOpen(fn: () => void) {
    fn()
    if (archived || !k.ki_vorschlag_inhalt) return
    try {
      await fetch('/api/widerspruch-kommunikationen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kassenabrechnungen_id: k.kassenabrechnungen_id,
          richtung: 'ausgehend',
          kommunikationspartner: k.ki_naechster_empfaenger === 'arzt' ? 'arzt' : 'kasse',
          typ: 'antwort',
          datum: new Date().toISOString().split('T')[0],
          betreff: editBetreff,
          inhalt: editBody,
        }),
      })
      setArchived(true)
      onReplyDraft?.({ ...k, richtung: 'ausgehend', betreff: editBetreff, inhalt: editBody })
    } catch { /* non-critical */ }
  }

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: dotColor, border: '2px solid white', boxShadow: `0 0 0 2px ${dotColor}`, flexShrink: 0, marginTop: 4, zIndex: 1 }} />
        {!isLast && <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />}
      </div>

      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
        {/* Entry header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isOutgoing ? blue : amber }}>
            {isOutgoing
              ? `📤 Du → ${k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'}`
              : `📥 ${k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'} → Du`}
          </span>
          <span style={{ fontSize: 11, color: slate }}>{fmtDate(k.datum)}</span>
          {k.ki_dringlichkeit && !isOutgoing && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef2f2', color: DRINGLICHKEIT_COLOR[k.ki_dringlichkeit] }}>
              Dringlichkeit: {k.ki_dringlichkeit}
            </span>
          )}
          {k.ki_naechste_frist && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef2f2', color: red }}>
              📅 Frist: {fmtDate(k.ki_naechste_frist)}
            </span>
          )}
        </div>

        {/* Subject */}
        {k.betreff && (
          <div style={{ fontSize: 12, fontWeight: 600, color: navy, marginBottom: 5 }}>{k.betreff}</div>
        )}

        {/* KI analysis (incoming only) */}
        {!isOutgoing && k.ki_analyse && (
          <div style={{ background: blueL, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1e40af', marginBottom: 8, lineHeight: 1.55 }}>
            🤖 {k.ki_analyse}
          </div>
        )}

        {/* Show/hide full text */}
        <button onClick={() => setShowText(v => !v)}
          style={{ fontSize: 11, color: slate, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', marginBottom: 6 }}>
          {showText ? '▲ Text einklappen' : '▼ Volltext anzeigen'}
        </button>
        {showText && (
          <div style={{ marginTop: 4, padding: '10px 14px', background: grey, borderRadius: 8, fontSize: 11, color: navy, lineHeight: 1.7, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', marginBottom: 8 }}>
            {k.inhalt}
          </div>
        )}

        {/* AI-suggested reply (incoming + has suggestion) */}
        {!isOutgoing && k.ki_vorschlag_inhalt && (
          <div>
            <button onClick={() => setShowReply(v => !v)}
              style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${amber}`, background: showReply ? amberL : 'white', color: '#92400e', cursor: 'pointer', marginBottom: 6 }}>
              {showReply ? '▲ Antwortvorlage schließen' : '✉️ KI-Antwortvorlage öffnen'}
            </button>
            {showReply && (
              <div style={{ border: `2px solid ${amber}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: amberL, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                  An: {k.ki_naechster_empfaenger === 'kasse' ? 'AXA Krankenversicherung' : 'Behandelnde/r Arzt/Ärztin'}
                </div>
                <div style={{ padding: 12 }}>
                  <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
                    placeholder="Betreff"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, color: navy, marginBottom: 8, boxSizing: 'border-box' }} />
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={12}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={async () => { await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`); setCopied(true); setTimeout(() => setCopied(false), 2000); logReplyAndOpen(() => {}) }}
                      style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: copied ? mintL : grey, color: copied ? '#065f46' : navy }}>
                      {copied ? '✓ Kopiert' : '📋 Kopieren'}
                    </button>
                    <button onClick={() => logReplyAndOpen(() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank'))}
                      style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: blueL, color: '#1d4ed8' }}>
                      In Gmail öffnen
                    </button>
                    <button onClick={() => logReplyAndOpen(() => window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank'))}
                      style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#e8f4fd', color: '#0078d4' }}>
                      In Outlook öffnen
                    </button>
                    {archived && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46', background: mintL, padding: '4px 10px', borderRadius: 20 }}>✓ Archiviert</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── KommunikationModal ────────────────────────────────────────────────────────
function KommunikationModal({
  fall, onClose, onAdded,
}: {
  fall: WiderspruchFall
  onClose: () => void
  onAdded: (komm: WiderspruchKommunikation) => void
}) {
  const [partner, setPartner] = useState<'kasse' | 'arzt'>('kasse')
  const [inhalt, setInhalt]   = useState('')
  const [betreff, setBetreff] = useState('')
  const [datum, setDatum]     = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<WiderspruchKommunikation | null>(null)
  const [naechsterSchritt, setNaechsterSchritt] = useState<string | null>(null)

  async function handleAnalyse() {
    if (!inhalt.trim()) return
    setLoading(true)
    try {
      const postRes = await fetch('/api/widerspruch-kommunikationen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kassenabrechnungen_id: fall.id,
          richtung: 'eingehend',
          kommunikationspartner: partner,
          typ: 'antwort',
          datum,
          betreff: betreff || null,
          inhalt,
        }),
      })
      const saved = await postRes.json()
      if (!postRes.ok) throw new Error(saved.error)
      const analyseRes = await fetch(`/api/widerspruch-kommunikationen/${saved.id}/analyse`, { method: 'POST' })
      const analysed = await analyseRes.json()
      if (!analyseRes.ok) throw new Error(analysed.error)
      setResult(analysed)
      setNaechsterSchritt(analysed.naechster_schritt_erklaerung ?? null)
      onAdded(analysed)
    } catch (e) {
      alert('Fehler: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}>
        <div style={{ background: navy, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>📥 Neue Kommunikation erfassen</div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>Schreiben einfügen → KI analysiert und schlägt Antwort vor</div>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 30, height: 30, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 22, flex: 1 }}>
          {!result ? (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Absender</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['kasse', 'arzt'] as const).map(p => (
                    <button key={p} onClick={() => setPartner(p)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: `2px solid ${partner === p ? blue : '#e2e8f0'}`, background: partner === p ? blueL : 'white', color: partner === p ? '#1d4ed8' : slate, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      {p === 'kasse' ? '🏥 Von AXA' : '🩺 Vom Arzt'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Datum</label>
                  <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, color: navy }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Betreff (optional)</label>
                  <input value={betreff} onChange={e => setBetreff(e.target.value)} placeholder="Betreff des Schreibens…"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, color: navy, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Inhalt des Schreibens</label>
                <textarea value={inhalt} onChange={e => setInhalt(e.target.value)}
                  placeholder="Vollständigen Text des eingegangenen Schreibens hier einfügen…"
                  rows={11}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 11, color: navy, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }} />
              </div>
              <button onClick={handleAnalyse} disabled={!inhalt.trim() || loading}
                style={{ width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', background: !inhalt.trim() || loading ? '#e2e8f0' : navy, color: !inhalt.trim() || loading ? slate : 'white', fontWeight: 700, fontSize: 13, cursor: inhalt.trim() && !loading ? 'pointer' : 'not-allowed' }}>
                {loading ? '🤖 KI analysiert…' : '🤖 Analysieren & nächsten Schritt vorschlagen'}
              </button>
            </>
          ) : (
            <>
              <div style={{ background: blueL, borderRadius: 12, padding: 16, marginBottom: 16, borderLeft: `4px solid ${blue}` }}>
                <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13, marginBottom: 8 }}>🤖 KI-Analyse</div>
                <p style={{ color: '#1e40af', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{result.ki_analyse}</p>
                {naechsterSchritt && (
                  <p style={{ color: '#1e40af', fontSize: 12, lineHeight: 1.6, margin: '8px 0 0', fontWeight: 600 }}>→ {naechsterSchritt}</p>
                )}
                {result.ki_dringlichkeit && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'white', color: DRINGLICHKEIT_COLOR[result.ki_dringlichkeit] }}>
                      Dringlichkeit: {result.ki_dringlichkeit}
                    </span>
                    {result.ki_naechste_frist && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'white', color: red }}>
                        📅 Frist: {fmtDate(result.ki_naechste_frist)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                <button onClick={onClose}
                  style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: navy, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  ✓ Schließen — Antwortvorlage in der Timeline
                </button>
                <div style={{ fontSize: 11, color: slate, marginTop: 8 }}>Die KI-Antwortvorlage erscheint jetzt im Verfahrens-Verlauf.</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── WiderspruchCard ───────────────────────────────────────────────────────────
function WiderspruchCard({ fall }: { fall: WiderspruchFall }) {
  const [open, setOpen]           = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [kommunikationen, setKommunikationen] = useState<WiderspruchKommunikation[]>(fall.kommunikationen)
  const userName = useUserFullName()

  const cfg     = STATUS_CONFIG[fall.widerspruch_status] ?? STATUS_CONFIG.erstellt
  const isClosed = fall.widerspruch_status === 'erfolgreich' || fall.widerspruch_status === 'abgelehnt'

  // Derive display name(s) for the card header
  const arztNames = fall.vorgaenge
    .map(v => v.arzt_name)
    .filter((n): n is string => !!n)
  const arztDisplay = arztNames.length > 0
    ? arztNames.slice(0, 2).join(' · ') + (arztNames.length > 2 ? ` +${arztNames.length - 2}` : '')
    : 'Arzt unbekannt'

  const latestIncoming = [...kommunikationen].reverse().find(k => k.richtung === 'eingehend')

  // Determine whether an Arztreklamation track exists
  const arztTrackPositionen = ((fall.kasse_analyse?.rechnungen ?? []) as RawRechnung[])
    .flatMap(g => (g.positionen ?? []).filter(p => p.aktionstyp === 'korrektur_arzt'))
  const hasArztTrack =
    (fall.betrag_korrektur_arzt != null && fall.betrag_korrektur_arzt > 0) ||
    arztTrackPositionen.length > 0

  return (
    <div style={{
      background: 'white', borderRadius: 16,
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
      overflow: 'hidden',
      borderLeft: `5px solid ${cfg.accent}`,
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: navy, fontSize: 15, marginBottom: 2 }}>{arztDisplay}</div>
          <div style={{ color: slate, fontSize: 12 }}>
            Bescheid {fmtDate(fall.bescheiddatum)}
            {fall.referenznummer && <span style={{ color: '#94a3b8' }}> · Ref. {fall.referenznummer}</span>}
          </div>
          {/* Timeline of key dates */}
          <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
            {fall.widerspruch_gesendet_am && (
              <span style={{ fontSize: 10, color: blue }}>📤 Gesendet: {fmtDateShort(fall.widerspruch_gesendet_am)}</span>
            )}
            {kommunikationen.filter(k => k.richtung === 'eingehend').length > 0 && (
              <span style={{ fontSize: 10, color: amber }}>
                📥 Letzte Antwort: {fmtDateShort([...kommunikationen].reverse().find(k => k.richtung === 'eingehend')?.datum)}
              </span>
            )}
            {latestIncoming?.ki_naechste_frist && (
              <span style={{ fontSize: 10, color: red, fontWeight: 700 }}>
                📅 Frist: {fmtDateShort(latestIncoming.ki_naechste_frist)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: red }}>{fmt(fall.betrag_abgelehnt)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.accent}30` }}>
              {cfg.icon} {cfg.label}
            </span>
            <button onClick={() => setOpen(o => !o)}
              style={{ background: grey, border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: slate, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {open ? '▲' : '▼'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Card body ── */}
      {open && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px 20px' }}>

          {/* Context sections */}
          <AblehnungsbescheidSection fall={fall} />
          <RechnungenSection vorgaenge={fall.vorgaenge} />
          <KiAnalyseSection fall={fall} />

          {/* ── Verfahrens-Verlauf (Timeline) ── */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                Verfahrens-Verlauf
              </span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>

            {/* Goal bar: shows € targets for each active track */}
            <ZielBar fall={fall} />

            {/* Widerspruch sent node (always first — blue track, to AXA) */}
            <WiderspruchBriefNode fall={fall} userName={userName} />

            {/* Arztreklamation node (orange track, to doctor) — only if relevant */}
            {hasArztTrack && (
              <ArztReklamationsBriefNode fall={fall} userName={userName} />
            )}

            {/* Subsequent communications */}
            {kommunikationen.map((k, i) => (
              <TimelineEntry
                key={k.id}
                k={k}
                isLast={i === kommunikationen.length - 1 && isClosed}
                onReplyDraft={komm => setKommunikationen(prev => [...prev, komm])}
              />
            ))}

            {/* Final status node for closed cases */}
            {isClosed && (
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: fall.widerspruch_status === 'erfolgreich' ? mint : red, border: '2px solid white', boxShadow: `0 0 0 2px ${fall.widerspruch_status === 'erfolgreich' ? mint : red}`, flexShrink: 0, marginTop: 4 }} />
                </div>
                <div style={{ paddingBottom: 0, paddingTop: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: fall.widerspruch_status === 'erfolgreich' ? '#065f46' : '#991b1b' }}>
                    {fall.widerspruch_status === 'erfolgreich' ? '✅ Verfahren erfolgreich abgeschlossen' : '❌ Widerspruch endgültig abgelehnt'}
                  </span>
                </div>
              </div>
            )}

            {/* CTA: Add new incoming communication */}
            {!isClosed && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => setShowModal(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '9px 18px', borderRadius: 10,
                    border: `1.5px solid ${amber}`,
                    background: amberL, color: '#92400e',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}>
                  📥 Neue Antwort eingangen — KI analysieren
                </button>
                {latestIncoming?.ki_naechster_empfaenger && latestIncoming.ki_naechster_empfaenger !== 'keiner' && (
                  <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                    ↳ Nächste Aktion: {latestIncoming.ki_naechster_empfaenger === 'kasse' ? 'An AXA schreiben' : 'Arzt kontaktieren'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <KommunikationModal
          fall={fall}
          onClose={() => setShowModal(false)}
          onAdded={komm => setKommunikationen(prev => [...prev, komm])}
        />
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function WiderspruchClient({ faelle }: { faelle: WiderspruchFall[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {faelle.map(f => (
        <WiderspruchCard key={f.id} fall={f} />
      ))}
    </div>
  )
}
