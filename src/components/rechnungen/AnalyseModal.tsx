'use client'

import { useState } from 'react'
import type { KasseRechnungGruppe, KasseAnalyseResult } from '@/lib/goae-analyzer'

const navy = '#0f172a'
const mint = '#10b981'
const mintLight = '#d1fae5'
const amber = '#f59e0b'
const amberLight = '#fef3c7'
const red = '#ef4444'
const redLight = '#fee2e2'
const blue = '#3b82f6'
const blueLight = '#eff6ff'
const slate = '#64748b'

// ── Plain-language translations for technical Ablehnungsgründe ──────────────
const LAIENSATZ: Array<{ match: string; erklaerung: string }> = [
  { match: 'analogziffer',           erklaerung: 'Diese Leistung hat in der GOÄ keinen eigenen Abrechnungscode. Der Arzt hat sie deshalb "analog" über eine ähnliche Ziffer abgerechnet. Die Kasse bestreitet hier, dass genau diese Analogziffer für die erbrachte Leistung zulässig ist — nicht dass die Leistung generell nicht existiert.' },
  { match: '§ 4 abs',               erklaerung: 'Mehrere Leistungen wurden gleichzeitig abgerechnet — laut Kasse darf nur eine davon bezahlt werden (sog. "Zielleistungsprinzip").' },
  { match: 'zielleistung',           erklaerung: 'Diese Position ist aus Sicht der Kasse in einer anderen Leistung "enthalten" und wird deshalb nicht separat erstattet.' },
  { match: 'schwellenwert',          erklaerung: 'Der abgerechnete Faktor liegt über dem Standardsatz (2,3×). Ohne schriftliche Begründung des Arztes darf die Kasse kürzen.' },
  { match: 'nicht erstattungsfähig', erklaerung: 'Die Kasse stuft diese Leistung als nicht durch Ihren Tarif abgedeckt ein — das können Sie anfechten.' },
  { match: 'überschreitung',         erklaerung: 'Der abgerechnete Betrag liegt über dem von der Kasse akzeptierten Höchstbetrag.' },
  { match: 'nicht tariflich',        erklaerung: 'Die Kasse sagt, Ihr Tarif deckt diese Leistung nicht ab. Lohnt sich zu prüfen, ob das wirklich stimmt.' },
  { match: 'fehlende begründung',    erklaerung: 'Der Arzt hat keinen schriftlichen Nachweis für den erhöhten Faktor mitgeliefert — das ist laut §12 GOÄ Pflicht.' },
  { match: 'doppelberechnung',       erklaerung: 'Diese Leistung wurde laut Kasse in der gleichen Sitzung bereits mit einer anderen Ziffer abgerechnet.' },
  { match: 'igel',                   erklaerung: 'Diese Leistung gilt als individuelle Gesundheitsleistung (IGeL) und wird von der PKV nicht immer erstattet.' },
]

function laiensatzFor(text: string): string | null {
  const lower = text.toLowerCase()
  for (const entry of LAIENSATZ) {
    if (lower.includes(entry.match)) return entry.erklaerung
  }
  return null
}

// ── Shared sub-components ────────────────────────────────────────────────────

function KpiBox({ label, value, warn, good, sub }: { label: string; value: string; warn?: boolean; good?: boolean; sub?: string }) {
  const bg = good ? mintLight : warn ? amberLight : '#f8fafc'
  const color = good ? '#065f46' : warn ? '#92400e' : navy
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: slate, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: slate, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function FlagBadge({ flag }: { flag?: string }) {
  if (!flag || flag === 'ok') return (
    <span style={{ background: mintLight, color: '#065f46', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>✓ OK</span>
  )
  if (flag === 'pruefe') return (
    <span style={{ background: amberLight, color: '#92400e', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⚠ Prüfen</span>
  )
  return (
    <span style={{ background: redLight, color: '#991b1b', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>🔴 Hoch</span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'erstattet') return <span style={{ background: mintLight, color: '#065f46', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>✓ Erstattet</span>
  if (status === 'gekuerzt')  return <span style={{ background: amberLight, color: '#92400e', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⚠ Gekürzt</span>
  return <span style={{ background: redLight, color: '#991b1b', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>✗ Abgelehnt</span>
}

/** Inline Ablehnungsgrund with plain-language toggle */
function AblehnungsgrundRow({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const erklaerung = laiensatzFor(text)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', fontSize: 13, color: '#475569', borderTop: '1px solid #fecaca' }}>
      <span style={{ color: red, flexShrink: 0, marginTop: 1 }}>✗</span>
      <div style={{ flex: 1 }}>
        <span>{text}</span>
        {erklaerung && (
          <>
            {' '}
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ fontSize: 11, color: blue, background: blueLight, border: 'none', borderRadius: 10, padding: '1px 7px', cursor: 'pointer', fontWeight: 600 }}
            >
              {expanded ? '▲ ausblenden' : '💬 Was heißt das?'}
            </button>
            {expanded && (
              <div style={{ marginTop: 6, padding: '8px 12px', background: blueLight, borderRadius: 8, fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
                {erklaerung}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Numbered section divider */
function SectionHeader({ num, title, sub, accent }: { num: number; title: string; sub: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
        background: accent, color: 'white', fontWeight: 700, fontSize: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{num}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: navy }}>{title}</div>
        <div style={{ fontSize: 12, color: slate }}>{sub}</div>
      </div>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface GoaePosition {
  ziffer: string
  bezeichnung: string
  faktor: number
  betrag: number
  flag?: 'ok' | 'pruefe' | 'hoch'
}

interface KassePosition {
  ziffer: string
  bezeichnung: string
  betragEingereicht: number
  betragErstattet: number
  status: 'erstattet' | 'gekuerzt' | 'abgelehnt'
  ablehnungsgrund?: string | null
}

interface GoaeAnalyse {
  arztName?: string
  arztFachgebiet?: string
  rechnungsdatum?: string
  betragGesamt?: number
  goaePositionen?: GoaePosition[]
  maxFaktor?: number
  flagFaktorUeberSchwellenwert?: boolean
  flagFehlendeBegrundung?: boolean
  einsparpotenzial?: number
  zusammenfassung?: string
}

interface KasseAnalyse {
  referenznummer?: string
  bescheiddatum?: string
  betragEingereicht?: number
  betragErstattet?: number
  betragAbgelehnt?: number
  erstattungsquote?: number
  positionen?: KassePosition[]
  ablehnungsgruende?: string[]
  widerspruchEmpfohlen?: boolean
  widerspruchBegruendung?: string
  widerspruchErfolgswahrscheinlichkeit?: number | null
  naechsteSchritte?: string[] | null
  zusammenfassung?: string
}

interface KassenbescheidSummary {
  id: string
  bescheiddatum: string | null
  referenznummer: string | null
  betragErstattet: number | null
  betragAbgelehnt: number | null
  widerspruchEmpfohlen: boolean
  widerspruchStatus?: string
}

interface AnalyseModalProps {
  type: 'rechnung' | 'kasse'
  data: GoaeAnalyse | KasseAnalyse
  kasseGruppe?: KasseRechnungGruppe | null
  kasseAnalyseNew?: KasseAnalyseResult | null
  kassenbescheid?: KassenbescheidSummary | null
  onClose: () => void
}

// ── Widerspruch letter generator (template-based, no API call) ───────────────

const AXA_PLACEHOLDER_ADDRESS = `AXA Krankenversicherung AG\nKundenservice / Leistungsabteilung\n[⚠️ PLATZHALTER: Adresse aus Ihrem Versicherungsschein eintragen!]`

function generateWiderspruchLetter({
  bescheid,
  gruppe,
  analyse,
}: {
  bescheid: KassenbescheidSummary | null | undefined
  gruppe: KasseRechnungGruppe | null | undefined
  analyse: KasseAnalyseResult | null | undefined
}): { betreff: string; body: string } {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const bescheidDatum = bescheid?.bescheiddatum
    ? new Date(bescheid.bescheiddatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '[Datum des Bescheids]'
  const ref = bescheid?.referenznummer ?? '[Ihre Referenznummer]'
  const abgelehnt = (gruppe?.betragAbgelehnt ?? bescheid?.betragAbgelehnt ?? 0).toFixed(2)
  const abgelehntePos = gruppe?.positionen?.filter(p => p.status === 'abgelehnt' || p.status === 'gekuerzt') ?? []
  const begruendung = analyse?.widerspruchBegruendung ?? 'Die Ablehnung ist aus meiner Sicht nicht gerechtfertigt.'

  const posListe = abgelehntePos.length > 0
    ? abgelehntePos.map(p =>
        `  - Ziffer ${p.ziffer} "${p.bezeichnung}": ${p.betragEingereicht?.toFixed(2) ?? '?'} € eingereicht, ${p.betragErstattet?.toFixed(2) ?? '0.00'} € erstattet`
      ).join('\n')
    : '  [Bitte betroffene Positionen eintragen]'

  const betreff = `Widerspruch gegen Leistungsbescheid vom ${bescheidDatum} – Referenz ${ref}`

  const body = `${AXA_PLACEHOLDER_ADDRESS}

${heute}

Betreff: ${betreff}
Versicherungsnehmer: [Ihr vollständiger Name]
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

[Ihr vollständiger Name]
[Ihre Adresse]
[Telefon / E-Mail]`

  return { betreff, body }
}

function WiderspruchPanel({
  bescheid,
  gruppe,
  analyse,
  kassenbescheidId,
}: {
  bescheid: KassenbescheidSummary | null | undefined
  gruppe: KasseRechnungGruppe | null | undefined
  analyse: KasseAnalyseResult | null | undefined
  kassenbescheidId?: string
}) {
  const [copied, setCopied] = useState(false)
  const [markedSent, setMarkedSent] = useState(false)
  const [sending, setSending] = useState(false)

  const { betreff, body } = generateWiderspruchLetter({ bescheid, gruppe, analyse })
  const [editableBetreff, setEditableBetreff] = useState(betreff)
  const [editableBody, setEditableBody] = useState(body)

  const fullText = `Betreff: ${editableBetreff}\n\n${editableBody}`

  async function handleCopy() {
    await navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleGmail() {
    const subject = encodeURIComponent(editableBetreff)
    const body = encodeURIComponent(editableBody)
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank')
  }

  function handleMailto() {
    const subject = encodeURIComponent(editableBetreff)
    // mailto body has ~2000 char limit in most clients — use Gmail button for full text
    const shortBody = encodeURIComponent(editableBody.slice(0, 1800) + (editableBody.length > 1800 ? '\n\n[Bitte vollständigen Text aus Zwischenablage einfügen]' : ''))
    window.location.href = `mailto:?subject=${subject}&body=${shortBody}`
  }

  async function handleMarkSent() {
    if (!kassenbescheidId) { setMarkedSent(true); return }
    setSending(true)
    try {
      await fetch(`/api/kassenabrechnungen/${kassenbescheidId}/widerspruch-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'gesendet' }),
      })
      setMarkedSent(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ marginTop: 16, border: `2px solid ${amber}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Panel header */}
      <div style={{ background: amberLight, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>📧 Widerspruch per E-Mail</span>
        <span style={{ fontSize: 12, color: '#92400e' }}>— Text bearbeiten, dann kopieren oder direkt öffnen</span>
      </div>

      {/* AXA address placeholder warning */}
      <div style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <div style={{ fontSize: 12, color: '#9a3412' }}>
          <strong>Empfängeradresse ist ein PLATZHALTER.</strong> Bitte die korrekte AXA-Adresse aus Ihrem Versicherungsschein eintragen, bevor Sie die E-Mail absenden. Ebenso: Name, Versicherungsnummer und Adresse ergänzen.
        </div>
      </div>

      <div style={{ padding: 16, background: 'white' }}>
        {/* Betreff */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Betreff
          </label>
          <input
            value={editableBetreff}
            onChange={e => setEditableBetreff(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: navy, boxSizing: 'border-box' }}
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            E-Mail-Text
          </label>
          <textarea
            value={editableBody}
            onChange={e => setEditableBody(e.target.value)}
            rows={16}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleCopy}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: copied ? mintLight : '#f1f5f9', color: copied ? '#065f46' : navy, transition: 'all 0.2s' }}
          >
            {copied ? '✓ Kopiert!' : '📋 Text kopieren'}
          </button>
          <button
            onClick={handleGmail}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
              <path d="M0 5.457v13.909c0 .904.732 1.636 1.636 1.636h3.819V11.73L12 16.64l6.545-4.91v9.273h3.819A1.636 1.636 0 0 0 24 19.366V5.457c0-2.023-2.309-3.178-3.927-1.964L18.545 4.64 12 9.548 5.455 4.64 3.927 3.493C2.309 2.28 0 3.434 0 5.457z" fill="#4285F4" opacity="0"/>
            </svg>
            In Gmail öffnen
          </button>
          <button
            onClick={handleMailto}
            title="Öffnet Standard-E-Mail-Programm (Outlook, Apple Mail etc.)"
            style={{ fontSize: 12, fontWeight: 500, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white', color: '#64748b' }}
          >
            Anderes Programm
          </button>
          <div style={{ flex: 1 }} />
          {!markedSent ? (
            <button
              onClick={handleMarkSent}
              disabled={sending}
              style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: `1px solid ${amber}`, cursor: sending ? 'wait' : 'pointer', background: 'white', color: '#92400e' }}
            >
              {sending ? '…' : '✓ Als gesendet markieren'}
            </button>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46', padding: '7px 0' }}>✓ Als gesendet markiert</span>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
          💡 "In Gmail öffnen" startet Gmail im Browser mit vollständig vorausgefülltem Text. "Anderes Programm" öffnet Outlook, Apple Mail etc. (nur bei kurzen Texten vollständig).
        </div>
      </div>
    </div>
  )
}

// ── Kassenbescheid section (used inside GOÄ modal as Section 2) ──────────────

function KassenbescheidSection({
  gruppe,
  analyse,
  bescheid,
}: {
  gruppe: KasseRechnungGruppe | null | undefined
  analyse: KasseAnalyseResult | null | undefined
  bescheid: KassenbescheidSummary | null | undefined
}) {
  const [showWiderspruchPanel, setShowWiderspruchPanel] = useState(false)

  const erstattet = gruppe?.betragErstattet ?? bescheid?.betragErstattet ?? 0
  const abgelehnt = gruppe?.betragAbgelehnt ?? bescheid?.betragAbgelehnt ?? 0
  const eingereicht = gruppe?.betragEingereicht ?? 0
  const datum = bescheid?.bescheiddatum
    ? new Date(bescheid.bescheiddatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const abgelehntePos = gruppe?.positionen?.filter(p => p.status === 'abgelehnt' || p.status === 'gekuerzt') ?? []
  const erfolg = analyse?.widerspruchErfolgswahrscheinlichkeit ?? null
  const schritte = analyse?.naechsteSchritte ?? null
  const widerspruch = analyse?.widerspruchEmpfohlen ?? bescheid?.widerspruchEmpfohlen ?? false
  const begruendung = analyse?.widerspruchBegruendung ?? null

  // Determine action type from positions: widerspruch_kasse (appeal insurance) vs korrektur_arzt (fix with doctor)
  const hasKasseAction = abgelehntePos.some(p => (p as {aktionstyp?: string}).aktionstyp === 'widerspruch_kasse' || (p as {aktionstyp?: string}).aktionstyp == null)
  const hasArztAction  = abgelehntePos.some(p => (p as {aktionstyp?: string}).aktionstyp === 'korrektur_arzt')

  const erfolgColor = erfolg == null ? slate : erfolg >= 70 ? '#22c55e' : erfolg >= 40 ? amber : red
  const erfolgBg    = erfolg == null ? '#f1f5f9' : erfolg >= 70 ? mintLight : erfolg >= 40 ? amberLight : redLight

  return (
    <div>
      {datum && (
        <div style={{ fontSize: 12, color: slate, marginBottom: 12 }}>
          🏥 Bescheid vom {datum}
          {bescheid?.referenznummer && <span style={{ marginLeft: 8 }}>· Ref. {bescheid.referenznummer}</span>}
        </div>
      )}

      {/* Abgelehnte Positionen */}
      {abgelehntePos.length > 0 && (
        <div style={{ border: `1px solid #fecaca`, borderRadius: 10, overflow: 'visible', marginBottom: 14 }}>
          <div style={{ background: '#fff1f2', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#991b1b' }}>
            ❌ Abgelehnte / Gekürzte Positionen
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#fef2f2' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#991b1b', fontWeight: 600 }}>Ziffer</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#991b1b', fontWeight: 600 }}>Bezeichnung</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', color: '#991b1b', fontWeight: 600 }}>Eingereicht</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', color: '#991b1b', fontWeight: 600 }}>Erstattet</th>
                <th style={{ padding: '6px 10px', textAlign: 'center', color: '#991b1b', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {abgelehntePos.map((pos, i) => (
                <AbgelehnteRow key={i} pos={pos} even={i % 2 === 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Widerspruchsanalyse */}
      {widerspruch && (
        <div style={{ background: amberLight, border: `1px solid ${amber}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>⚡ Handlungsempfehlung</div>
            {erfolg != null && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: erfolgBg, color: erfolgColor }}>
                {erfolg} % Erfolgsaussicht
              </span>
            )}
          </div>
          {begruendung && (
            <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6, marginBottom: 12 }}>{begruendung}</p>
          )}
          {schritte && schritte.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Nächste Schritte
              </div>
              {schritte.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 5 }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: amber, color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          )}
          {/* Split CTAs based on aktionstyp */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasKasseAction && (
              <button
                onClick={() => setShowWiderspruchPanel(v => !v)}
                style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, background: showWiderspruchPanel ? '#92400e' : '#b45309', color: 'white', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {showWiderspruchPanel ? '▲ E-Mail schließen' : '⚖️ Widerspruch per E-Mail erstellen'}
              </button>
            )}
            {hasArztAction && (
              <span
                style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, background: 'white', color: '#92400e', border: `1px solid ${amber}`, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Kontaktieren Sie Ihre Arztpraxis und bitten Sie um eine korrigierte Rechnung oder eine schriftliche Begründung für den abgerechneten Faktor.">
                🩺 Arzt um Korrektur bitten
              </span>
            )}
          </div>
          {hasArztAction && (
            <div style={{ fontSize: 11, color: '#92400e', marginTop: 8, fontStyle: 'italic' }}>
              💬 Kontaktieren Sie die Praxis und bitten Sie um eine korrigierte Rechnung oder eine schriftliche Begründung für den erhöhten Faktor (§12 Abs. 3 GOÄ).
            </div>
          )}
        </div>
      )}

      {/* No rejection = all good */}
      {abgelehnt === 0 && abgelehntePos.length === 0 && !widerspruch && (
        <div style={{ background: mintLight, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#065f46' }}>
          ✓ Kasse hat alles erstattet — kein Handlungsbedarf.
        </div>
      )}

      {/* Widerspruch E-Mail Panel — inline, toggled by CTA */}
      {showWiderspruchPanel && (
        <WiderspruchPanel
          bescheid={bescheid}
          gruppe={gruppe}
          analyse={analyse}
          kassenbescheidId={bescheid?.id}
        />
      )}
    </div>
  )
}

/** Extracted to avoid useState-in-loop (hooks in map) */
function AbgelehnteRow({ pos, even }: { pos: KassePosition; even: boolean }) {
  const [showErkl, setShowErkl] = useState(false)
  const erklaerung = pos.ablehnungsgrund ? laiensatzFor(pos.ablehnungsgrund) : null
  return (
    <tr style={{ borderTop: '1px solid #fecaca', background: even ? 'white' : '#fff5f5' }}>
      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#991b1b', fontWeight: 600 }}>{pos.ziffer}</td>
      <td style={{ padding: '6px 10px', color: '#334155' }}>
        {pos.bezeichnung}
        {pos.ablehnungsgrund && (
          <div style={{ fontSize: 11, marginTop: 3 }}>
            <span style={{ color: red, fontStyle: 'italic' }}>→ {pos.ablehnungsgrund}</span>
            {erklaerung && (
              <>
                {' '}
                <button onClick={() => setShowErkl(e => !e)}
                  style={{ fontSize: 10, color: blue, background: blueLight, border: 'none', borderRadius: 8, padding: '1px 6px', cursor: 'pointer', fontWeight: 600 }}>
                  {showErkl ? '▲' : '💬'}
                </button>
                {showErkl && (
                  <div style={{ marginTop: 4, padding: '6px 10px', background: blueLight, borderRadius: 6, color: '#1e40af', lineHeight: 1.5 }}>
                    {erklaerung}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </td>
      <td style={{ padding: '6px 10px', textAlign: 'right', color: slate }}>{pos.betragEingereicht?.toFixed(2)} €</td>
      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: pos.betragErstattet > 0 ? amber : red }}>
        {pos.betragErstattet?.toFixed(2)} €
      </td>
      <td style={{ padding: '6px 10px', textAlign: 'center' }}><StatusBadge status={pos.status} /></td>
    </tr>
  )
}

/** Same pattern for Kasse standalone modal positionen rows */
function KassePositionRow({ pos, even }: { pos: KassePosition; even: boolean }) {
  const [showErkl, setShowErkl] = useState(false)
  const erklaerung = pos.ablehnungsgrund ? laiensatzFor(pos.ablehnungsgrund) : null
  return (
    <tr style={{ borderTop: '1px solid #f1f5f9', background: even ? 'white' : '#fafafa' }}>
      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: navy }}>{pos.ziffer}</td>
      <td style={{ padding: '8px 12px', color: '#334155' }}>
        {pos.bezeichnung}
        {pos.ablehnungsgrund && (
          <div style={{ fontSize: 11, marginTop: 3 }}>
            <span style={{ color: red, fontStyle: 'italic' }}>→ {pos.ablehnungsgrund}</span>
            {erklaerung && (
              <>
                {' '}
                <button onClick={() => setShowErkl(e => !e)}
                  style={{ fontSize: 10, color: blue, background: blueLight, border: 'none', borderRadius: 8, padding: '1px 6px', cursor: 'pointer', fontWeight: 600 }}>
                  {showErkl ? '▲' : '💬'}
                </button>
                {showErkl && (
                  <div style={{ marginTop: 4, padding: '6px 10px', background: blueLight, borderRadius: 6, color: '#1e40af', lineHeight: 1.5 }}>
                    {erklaerung}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', color: navy }}>{pos.betragEingereicht?.toFixed(2)} €</td>
      <td style={{ padding: '8px 12px', textAlign: 'right', color: mint, fontWeight: 600 }}>{pos.betragErstattet?.toFixed(2)} €</td>
      <td style={{ padding: '8px 12px', textAlign: 'center' }}><StatusBadge status={pos.status} /></td>
    </tr>
  )
}

// ── Main Modal ───────────────────────────────────────────────────────────────

export default function AnalyseModal({ type, data, kasseGruppe, kasseAnalyseNew, kassenbescheid, onClose }: AnalyseModalProps) {
  const isRechnung = type === 'rechnung'
  const rData = data as GoaeAnalyse
  const kData = data as KasseAnalyse

  const goaePotenzial   = rData.einsparpotenzial ?? 0
  const kassePotenzial  = kasseGruppe?.betragAbgelehnt ?? kassenbescheid?.betragAbgelehnt ?? 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isRechnung ? navy : '#1e3a5f' }}>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>
              {isRechnung ? '💡 Sparpotenzial-Analyse' : '🏥 Kassenbescheid-Analyse'}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>
              {isRechnung
                ? `${rData.arztName ?? 'Unbekannt'} · ${rData.arztFachgebiet ?? ''}`
                : `Referenz: ${kData.referenznummer ?? '–'} · ${kData.bescheiddatum ?? ''}`}
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" }}>

          {/* Zusammenfassung */}
          {(isRechnung ? rData.zusammenfassung : kData.zusammenfassung) && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', marginBottom: 8, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
              {isRechnung ? rData.zusammenfassung : kData.zusammenfassung}
            </div>
          )}

          {/* ═══════ RECHNUNG MODAL — two-section layout ══════════════════ */}
          {isRechnung && (
            <>
              {/* ── Section 1: Ist die Rechnung korrekt? (Arzt) ── */}
              <SectionHeader
                num={1}
                title="Ist die Rechnung korrekt?"
                sub="GOÄ-Prüfung: Faktoren, Ziffern-Logik, Begründungspflicht"
                accent={navy}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <KpiBox label="Rechnungsbetrag" value={`${rData.betragGesamt?.toFixed(2) ?? '–'} €`} />
                <KpiBox
                  label="Max. Faktor"
                  value={`${rData.maxFaktor ?? '–'}×`}
                  warn={rData.flagFaktorUeberSchwellenwert}
                  sub={rData.maxFaktor && rData.maxFaktor > 2.3 ? '§12 GOÄ — Begründung prüfen' : undefined}
                />
                <KpiBox
                  label="Korrektur-Potenzial (Arzt)"
                  value={goaePotenzial > 0 ? `${goaePotenzial.toFixed(2)} €` : '–'}
                  warn={goaePotenzial > 0}
                  sub={goaePotenzial > 0 ? 'Arzt hat zu hoch abgerechnet' : 'Keine GOÄ-Beanstandung'}
                />
              </div>

              {(rData.flagFehlendeBegrundung || rData.flagFaktorUeberSchwellenwert) && (
                <div style={{ background: redLight, border: `1px solid ${red}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
                  {rData.flagFehlendeBegrundung && (
                    <div>
                      ⚠ Faktor über 2,3× ohne schriftliche Begründung — der Arzt muss das nachliefern (§12 Abs. 3 GOÄ).
                      <span style={{ display: 'block', fontSize: 12, color: '#7f1d1d', marginTop: 3 }}>
                        👉 Fordern Sie die Begründung beim Arzt an. Ohne sie kann die Kasse kürzen.
                      </span>
                    </div>
                  )}
                  {rData.flagFaktorUeberSchwellenwert && !rData.flagFehlendeBegrundung && (
                    <div>⚠ Faktor über dem 2,3-fachen Schwellenwert — nur mit schriftlicher Begründung zulässig.</div>
                  )}
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 8 }}>
                GOÄ-Positionen ({rData.goaePositionen?.length ?? 0})
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: slate, fontWeight: 600, width: 70 }}>Ziffer</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: slate, fontWeight: 600 }}>Bezeichnung</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Faktor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Betrag</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: slate, fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rData.goaePositionen ?? []).map((pos, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: navy }}>{pos.ziffer}</td>
                        <td style={{ padding: '8px 12px', color: '#334155' }}>{pos.bezeichnung}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: (pos.faktor ?? 0) > 2.3 ? red : navy }}>{pos.faktor}×</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: navy }}>{pos.betrag?.toFixed(2)} €</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}><FlagBadge flag={pos.flag} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Section 2: Muss die Kasse zahlen? ── */}
              <SectionHeader
                num={2}
                title="Muss die Kasse zahlen?"
                sub="Erstattungs-Check: Was hat AXA erstattet, was abgelehnt — und warum?"
                accent="#b45309"
              />

              {/* Widerspruch-Potenzial KPI — only when there is rejection */}
              {kassePotenzial > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <KpiBox label="Eingereicht bei Kasse" value={`${kasseGruppe?.betragEingereicht?.toFixed(2) ?? '–'} €`} />
                  <KpiBox label="Erstattet" value={`${(kasseGruppe?.betragErstattet ?? kassenbescheid?.betragErstattet ?? 0).toFixed(2)} €`} good />
                  <KpiBox
                    label="Widerspruch-Potenzial (Kasse)"
                    value={`${kassePotenzial.toFixed(2)} €`}
                    warn
                    sub="Kann angefochten werden"
                  />
                </div>
              )}

              {(kassenbescheid || kasseGruppe)
                ? <KassenbescheidSection gruppe={kasseGruppe} analyse={kasseAnalyseNew} bescheid={kassenbescheid} />
                : (
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '20px', fontSize: 13, color: slate, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📬</div>
                    <div style={{ fontWeight: 600, color: navy, marginBottom: 4 }}>Kassenbescheid noch nicht vorhanden</div>
                    <div style={{ fontSize: 12 }}>Sobald Sie den Bescheid einreichen, erscheint hier die automatische Analyse.</div>
                    <a href="/kassenabrechnung" style={{ display: 'inline-block', marginTop: 12, fontSize: 12, fontWeight: 600, color: blue, textDecoration: 'none' }}>
                      → Kassenbescheid einreichen
                    </a>
                  </div>
                )
              }
            </>
          )}

          {/* ═══════ KASSE MODAL — standalone Kassenbescheid view ════════ */}
          {!isRechnung && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <KpiBox label="Eingereicht" value={`${kData.betragEingereicht?.toFixed(2) ?? '–'} €`} />
                <KpiBox label="Erstattet" value={`${kData.betragErstattet?.toFixed(2) ?? '–'} €`} good />
                <KpiBox
                  label="Abgelehnt / Offen"
                  value={`${kData.betragAbgelehnt?.toFixed(2) ?? '–'} €`}
                  warn={(kData.betragAbgelehnt ?? 0) > 0}
                  sub={(kData.betragAbgelehnt ?? 0) > 0 ? '→ Widerspruch möglich' : undefined}
                />
              </div>

              {kData.widerspruchEmpfohlen && (
                <div style={{ background: amberLight, border: `1px solid ${amber}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 4 }}>
                    ⚡ Widerspruch empfohlen
                    {kData.widerspruchErfolgswahrscheinlichkeit != null && (
                      <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: kData.widerspruchErfolgswahrscheinlichkeit >= 70 ? mintLight : kData.widerspruchErfolgswahrscheinlichkeit >= 40 ? amberLight : redLight,
                        color: kData.widerspruchErfolgswahrscheinlichkeit >= 70 ? '#065f46' : kData.widerspruchErfolgswahrscheinlichkeit >= 40 ? '#92400e' : '#991b1b',
                      }}>
                        {kData.widerspruchErfolgswahrscheinlichkeit} % Erfolg
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{kData.widerspruchBegruendung}</div>
                  {kData.naechsteSchritte && kData.naechsteSchritte.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', marginBottom: 6 }}>Nächste Schritte</div>
                      {kData.naechsteSchritte.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#78350f', marginBottom: 4 }}>
                          <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: amber, color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                          <span style={{ lineHeight: 1.5 }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 8 }}>
                Positionen ({kData.positionen?.length ?? 0})
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: slate, fontWeight: 600, width: 70 }}>Ziffer</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: slate, fontWeight: 600 }}>Bezeichnung</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Eingereicht</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Erstattet</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: slate, fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kData.positionen ?? []).map((pos, i) => (
                      <KassePositionRow key={i} pos={pos} even={i % 2 === 0} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Ablehnungsgründe deliberately omitted — already shown inline per Position via 💬 tooltip */}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
