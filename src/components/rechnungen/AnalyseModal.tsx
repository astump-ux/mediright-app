'use client'
import { useState, useEffect } from 'react'
import type { KasseRechnungGruppe, KasseAnalyseResult } from '@/lib/goae-analyzer'
import { getSupabaseClient } from '@/lib/supabase'

function useUserFullName(): string {
  const [name, setName] = useState('[Ihr vollständiger Name]')
  useEffect(() => {
    getSupabaseClient()
      .from('profiles').select('full_name').single()
      .then(({ data }) => { if (data?.full_name) setName(data.full_name) })
  }, [])
  return name
}
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
  aktionstyp?: 'widerspruch_kasse' | 'korrektur_arzt' | null
  widerspruchWahrscheinlichkeit?: number | null
  confidence?: number | null
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
// ── Confidence label helper ───────────────────────────────────────────────────
function confidenceLabel(c: number | null | undefined): string | null {
  if (c == null) return null
  if (c >= 70) return 'hoch'
  if (c >= 40) return 'mittel'
  return 'niedrig'
}
// ── Widerspruch letter generator ─────────────────────────────────────────────
const AXA_PLACEHOLDER_ADDRESS = `AXA Krankenversicherung AG\nKundenservice / Leistungsabteilung\n[⚠️ PLATZHALTER: Adresse aus Ihrem Versicherungsschein eintragen!]`
function generateWiderspruchLetter({
  bescheid, gruppe, analyse, userName = '[Ihr vollständiger Name]',
}: {
  bescheid: KassenbescheidSummary | null | undefined
  gruppe: KasseRechnungGruppe | null | undefined
  analyse: KasseAnalyseResult | null | undefined
  userName?: string
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
function WiderspruchPanel({
  bescheid, gruppe, analyse, kassenbescheidId, userName,
}: {
  bescheid: KassenbescheidSummary | null | undefined
  gruppe: KasseRechnungGruppe | null | undefined
  analyse: KasseAnalyseResult | null | undefined
  kassenbescheidId?: string
  userName?: string
}) {
  const [copied, setCopied] = useState(false)
  const [markedSent, setMarkedSent] = useState(false)
  const [sending, setSending] = useState(false)
  const { betreff, body } = generateWiderspruchLetter({ bescheid, gruppe, analyse, userName })
  const [editableBetreff, setEditableBetreff] = useState(betreff)
  const [editableBody, setEditableBody] = useState(body)
  async function patchStatus(status: 'gesendet' | 'erstellt') {
    if (!kassenbescheidId) return
    const res = await fetch(`/api/kassenabrechnungen/${kassenbescheidId}/widerspruch-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[widerspruch-status PATCH]', res.status, err)
    }
  }
  async function handleCopy() {
    await navigator.clipboard.writeText(`Betreff: ${editableBetreff}\n\n${editableBody}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  async function handleGmail() {
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editableBetreff)}&body=${encodeURIComponent(editableBody)}`, '_blank')
    setMarkedSent(true)
    await patchStatus('gesendet')
  }
  async function handleOutlook() {
    window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(editableBetreff)}&body=${encodeURIComponent(editableBody)}`, '_blank')
    setMarkedSent(true)
    await patchStatus('gesendet')
  }
  async function handleMailto() {
    const a = document.createElement('a')
    a.href = `mailto:?subject=${encodeURIComponent(editableBetreff)}&body=${encodeURIComponent(editableBody)}`
    a.click()
    setMarkedSent(true)
    await patchStatus('gesendet')
  }
  async function handleUndoSent() {
    setSending(true)
    try { await patchStatus('erstellt'); setMarkedSent(false) }
    finally { setSending(false) }
  }
  return (
    <div style={{ marginTop: 16, border: `2px solid ${amber}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: amberLight, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>📧 Widerspruch per E-Mail</span>
        <span style={{ fontSize: 12, color: '#92400e' }}>— Text bearbeiten, dann kopieren oder direkt öffnen</span>
      </div>
      <div style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <div style={{ fontSize: 12, color: '#9a3412' }}>
          <strong>Empfängeradresse ist ein PLATZHALTER.</strong> Bitte die korrekte AXA-Adresse aus Ihrem Versicherungsschein eintragen, bevor Sie die E-Mail absenden.
        </div>
      </div>
      <div style={{ padding: 16, background: 'white' }}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Betreff</label>
          <input value={editableBetreff} onChange={e => setEditableBetreff(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: navy, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>E-Mail-Text</label>
          <textarea value={editableBody} onChange={e => setEditableBody(e.target.value)} rows={16}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleCopy}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: copied ? mintLight : '#f1f5f9', color: copied ? '#065f46' : navy }}>
            {copied ? '✓ Kopiert!' : '📋 Text kopieren'}
          </button>
          <button onClick={handleGmail}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#eff6ff', color: '#1d4ed8' }}>
            In Gmail öffnen
          </button>
          <button onClick={handleOutlook}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#eff6ff', color: '#0078d4' }}>
            In Outlook öffnen
          </button>
          <button onClick={handleMailto}
            style={{ fontSize: 12, fontWeight: 500, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white', color: '#64748b' }}>
            Anderes Programm
          </button>
          <div style={{ flex: 1 }} />
          {!markedSent ? (
            <button onClick={async () => { setSending(true); try { await patchStatus('gesendet'); setMarkedSent(true) } finally { setSending(false) } }} disabled={sending}
              style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: `1px solid ${amber}`, cursor: sending ? 'wait' : 'pointer', background: 'white', color: '#92400e' }}>
              {sending ? '…' : '✓ Als gesendet markieren'}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>✓ Als gesendet markiert</span>
              <button onClick={handleUndoSent} disabled={sending}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: sending ? 'wait' : 'pointer', background: 'white', color: '#94a3b8' }}>
                {sending ? '…' : 'Rückgängig'}
              </button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
          💡 Gmail &amp; Outlook öffnen im Browser, "Anderes Programm" öffnet deinen konfigurierten Mail-Client (Apple Mail, Thunderbird etc.).
        </div>
      </div>
    </div>
  )
}
// ── Arzt-Korrektur letter generator ──────────────────────────────────────────
function generateArztKorrekturLetter({
  arztName, korrekturPos, rechnungsdatum, userName = '[Ihr vollständiger Name]',
}: {
  arztName: string | null | undefined
  korrekturPos: KassePosition[]
  rechnungsdatum?: string | null
  userName?: string
}): { betreff: string; body: string } {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const datum = rechnungsdatum
    ? new Date(rechnungsdatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '[Rechnungsdatum]'
  const arzt = arztName ?? '[Arztpraxis]'
  const posListe = korrekturPos.length > 0
    ? korrekturPos.map(p =>
        `  - GOÄ Ziff. ${p.ziffer} "${p.bezeichnung}": ${(p.betragEingereicht ?? 0).toFixed(2)} € eingereicht`
      ).join('\n')
    : '  [Bitte betroffene Positionen eintragen]'
  const betreff = `Bitte um Rechnungskorrektur – Rechnung vom ${datum}`
  const body = `${arzt}
[Adresse der Praxis – bitte eintragen]

${heute}

Betreff: ${betreff}

Sehr geehrte Damen und Herren,

ich wende mich bezüglich Ihrer Rechnung vom ${datum} an Sie. Meine private Krankenversicherung (AXA) hat folgende Positionen nicht erstattet und hat darauf hingewiesen, dass eine Korrektur der Rechnung oder eine ergänzende Begründung erforderlich ist:

Betroffene Positionen:
${posListe}

Ich bitte Sie daher, entweder:
1. Eine korrigierte Rechnung auszustellen, oder
2. Mir eine schriftliche Begründung für den erhöhten Abrechnungsfaktor gemäß § 12 Abs. 3 GOÄ zuzusenden, die ich zur Erstattung bei meiner Versicherung einreichen kann.

Für Rückfragen stehe ich Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen,
${userName}`
  return { betreff, body }
}

function ArztKorrekturPanel({
  arztName, korrekturPos, rechnungsdatum, userName,
}: {
  arztName: string | null | undefined
  korrekturPos: KassePosition[]
  rechnungsdatum?: string | null
  userName?: string
}) {
  const { betreff, body } = generateArztKorrekturLetter({ arztName, korrekturPos, rechnungsdatum, userName })
  const [editBetreff, setEditBetreff] = useState(betreff)
  const [editBody, setEditBody]       = useState(body)
  const [copied, setCopied]           = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  function handleGmail() {
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')
  }
  function handleOutlook() {
    window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')
  }
  function handleMailto() {
    const a = document.createElement('a')
    a.href = `mailto:?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`
    a.click()
  }
  return (
    <div style={{ marginTop: 16, border: `2px solid #fb923c`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: '#fff7ed', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#9a3412', fontSize: 14 }}>🩺 Schreiben an Arztpraxis</span>
        <span style={{ fontSize: 12, color: '#9a3412' }}>— Text bearbeiten, dann kopieren oder öffnen</span>
      </div>
      <div style={{ padding: 16, background: 'white' }}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Betreff</label>
          <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: navy, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Brief-Text</label>
          <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={16}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleCopy}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: copied ? mintLight : '#f1f5f9', color: copied ? '#065f46' : navy }}>
            {copied ? '✓ Kopiert!' : '📋 Text kopieren'}
          </button>
          <button onClick={handleGmail}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#eff6ff', color: '#1d4ed8' }}>
            In Gmail öffnen
          </button>
          <button onClick={handleOutlook}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#e8f4fd', color: '#0078d4' }}>
            In Outlook öffnen
          </button>
          <button onClick={handleMailto}
            style={{ fontSize: 12, fontWeight: 500, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white', color: '#64748b' }}>
            Anderes Programm
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
          💡 Bitte die Adresse der Praxis vor dem Versenden eintragen.
        </div>
      </div>
    </div>
  )
}
// ── Kassenbescheid section ────────────────────────────────────────────────────
function KassenbescheidSection({
  gruppe, analyse, bescheid,
}: {
  gruppe: KasseRechnungGruppe | null | undefined
  analyse: KasseAnalyseResult | null | undefined
  bescheid: KassenbescheidSummary | null | undefined
}) {
  const [showWiderspruchPanel, setShowWiderspruchPanel] = useState(false)
  const [showArztPanel, setShowArztPanel]               = useState(false)
  const [showPositionen, setShowPositionen]             = useState(true)
  const [showSchritte, setShowSchritte]                 = useState(true)
  const userName = useUserFullName()

  const erstattet  = gruppe?.betragErstattet ?? bescheid?.betragErstattet ?? 0
  const abgelehnt  = gruppe?.betragAbgelehnt ?? bescheid?.betragAbgelehnt ?? 0
  const datum      = bescheid?.bescheiddatum
    ? new Date(bescheid.bescheiddatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null
  const abgelehntePos   = gruppe?.positionen?.filter(p => p.status === 'abgelehnt' || p.status === 'gekuerzt') ?? []
  const erfolg          = analyse?.widerspruchErfolgswahrscheinlichkeit ?? null
  const schritte        = analyse?.naechsteSchritte ?? null
  const widerspruch     = analyse?.widerspruchEmpfohlen ?? bescheid?.widerspruchEmpfohlen ?? false
  const begruendung     = analyse?.widerspruchBegruendung ?? null
  const hasKasseAction  = abgelehntePos.some(p => (p as {aktionstyp?: string}).aktionstyp === 'widerspruch_kasse' || (p as {aktionstyp?: string}).aktionstyp == null)
  const hasArztAction   = abgelehntePos.some(p => (p as {aktionstyp?: string}).aktionstyp === 'korrektur_arzt')

  const erfolgColor = erfolg == null ? slate : erfolg >= 70 ? '#22c55e' : erfolg >= 40 ? amber : red
  const erfolgBg    = erfolg == null ? '#f1f5f9' : erfolg >= 70 ? mintLight : erfolg >= 40 ? amberLight : redLight

  // ── Active Widerspruch status ──────────────────────────────────────────────
  const widerspruchStatus = bescheid?.widerspruchStatus
  const widerspruchActive = ['gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt'].includes(widerspruchStatus ?? '')
  const statusIcon: Record<string, string> = {
    gesendet:    '📨',
    beantwortet: '💬',
    erfolgreich: '✅',
    abgelehnt:   '❌',
  }
  const statusLabel: Record<string, string> = {
    gesendet:    'Widerspruch gesendet — läuft',
    beantwortet: 'AXA hat geantwortet — Aktion nötig',
    erfolgreich: 'Widerspruch erfolgreich',
    abgelehnt:   'Widerspruch endabgelehnt',
  }
  const statusColor: Record<string, { bg: string; color: string; border: string }> = {
    gesendet:    { bg: blueLight,  color: '#1d4ed8', border: '#93c5fd' },
    beantwortet: { bg: amberLight, color: '#92400e', border: '#fcd34d' },
    erfolgreich: { bg: mintLight,  color: '#065f46', border: '#6ee7b7' },
    abgelehnt:   { bg: redLight,   color: '#991b1b', border: '#fca5a5' },
  }

  return (
    <div>
      {/* ── Widerspruch status banner (when active) ── */}
      {widerspruchActive && widerspruchStatus && (
        <div style={{
          background: statusColor[widerspruchStatus].bg,
          border: `1.5px solid ${statusColor[widerspruchStatus].border}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{statusIcon[widerspruchStatus]}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: statusColor[widerspruchStatus].color }}>
                {statusLabel[widerspruchStatus]}
              </div>
              <div style={{ fontSize: 11, color: statusColor[widerspruchStatus].color, opacity: 0.8, marginTop: 1 }}>
                Alle Details und Kommunikation im Widerspruchs-Tab
              </div>
            </div>
          </div>
          <a
            href="/widersprueche"
            style={{
              fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 8,
              background: statusColor[widerspruchStatus].color, color: 'white',
              textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            → Zum Verfahren
          </a>
        </div>
      )}

      {datum && (
        <div style={{ fontSize: 12, color: slate, marginBottom: 12 }}>
          🏥 Bescheid vom {datum}
          {bescheid?.referenznummer && <span style={{ marginLeft: 8 }}>· Ref. {bescheid.referenznummer}</span>}
        </div>
      )}

      {/* ── Abgelehnte Positionen (collapsible) ── */}
      {abgelehntePos.length > 0 && (
        <div style={{ border: `1px solid #fecaca`, borderRadius: 10, overflow: 'visible', marginBottom: 14 }}>
          <div
            onClick={() => setShowPositionen(v => !v)}
            style={{ background: '#fff1f2', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
          >
            <span>❌ Abgelehnte &amp; Gekürzte Positionen ({abgelehntePos.length})</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{showPositionen ? '▲ einklappen' : '▼ ausklappen'}</span>
          </div>
          {showPositionen && (
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
          )}
        </div>
      )}

      {/* ── Handlungsempfehlung ── */}
      {widerspruch && abgelehnt > 0 && (
        <div style={{ background: amberLight, border: `1px solid ${amber}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>⚡ Handlungsempfehlung</div>
            {/* ── Probability + Confidence display ── */}
            {erfolg != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'white', borderRadius: 10, padding: '6px 12px', border: `1px solid ${erfolgColor}22` }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: erfolgColor, lineHeight: 1 }}>{erfolg}%</div>
                  <div style={{ fontSize: 10, color: slate, marginTop: 2 }}>Erfolgschance</div>
                </div>
                {(() => {
                  // Derive aggregate confidence from positions
                  const avgConf = abgelehntePos.length > 0
                    ? abgelehntePos.reduce((s, p) => s + ((p as {confidence?: number | null}).confidence ?? 60), 0) / abgelehntePos.length
                    : null
                  const label = confidenceLabel(avgConf)
                  const confColor = label === 'hoch' ? '#065f46' : label === 'mittel' ? '#92400e' : slate
                  const confBg   = label === 'hoch' ? mintLight : label === 'mittel' ? amberLight : '#f1f5f9'
                  return label ? (
                    <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 10 }}>
                      <div style={{ fontSize: 10, color: slate, marginBottom: 3 }}>KI-Konfidenz</div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: confBg, color: confColor }}>
                        {label}
                      </span>
                    </div>
                  ) : null
                })()}
              </div>
            )}
          </div>
          {begruendung && (
            <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6, marginBottom: 12 }}>{begruendung}</p>
          )}
          {/* ── Nächste Schritte (collapsible) ── */}
          {schritte && schritte.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div
                onClick={() => setShowSchritte(v => !v)}
                style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: showSchritte ? 6 : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
              >
                <span>Nächste Schritte ({schritte.length})</span>
                <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.7 }}>{showSchritte ? '▲' : '▼'}</span>
              </div>
              {showSchritte && schritte.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 5 }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: amber, color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          )}
          {/* CTAs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasKasseAction && !widerspruchActive && (
              <button onClick={() => setShowWiderspruchPanel(v => !v)}
                style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, background: showWiderspruchPanel ? '#92400e' : '#b45309', color: 'white', border: 'none', cursor: 'pointer' }}>
                {showWiderspruchPanel ? '▲ Schließen' : '⚖️ Widerspruch erstellen'}
              </button>
            )}
            {hasArztAction && !widerspruchActive && (
              <button onClick={() => setShowArztPanel(v => !v)}
                style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, background: showArztPanel ? '#9a3412' : 'white', color: showArztPanel ? 'white' : '#92400e', border: `1px solid ${amber}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {showArztPanel ? '▲ Schreiben schließen' : '🩺 Arzt um Korrektur bitten'}
              </button>
            )}
          </div>
        </div>
      )}

      {abgelehnt === 0 && abgelehntePos.length === 0 && !widerspruch && (
        <div style={{ background: mintLight, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#065f46' }}>
          ✓ Kasse hat alles erstattet — kein Handlungsbedarf.
        </div>
      )}

      {showWiderspruchPanel && (
        <WiderspruchPanel bescheid={bescheid} gruppe={gruppe} analyse={analyse} kassenbescheidId={bescheid?.id} userName={userName} />
      )}
      {showArztPanel && (
        <ArztKorrekturPanel
          arztName={gruppe?.arztName}
          korrekturPos={abgelehntePos.filter(p => (p as {aktionstyp?: string}).aktionstyp === 'korrektur_arzt')}
          rechnungsdatum={bescheid?.bescheiddatum}
          userName={userName}
        />
      )}
    </div>
  )
}
/** Probability pill per position — probability + confidence as label */
function ProbabilityPill({ wahrscheinlichkeit, confidence }: { wahrscheinlichkeit?: number | null; confidence?: number | null }) {
  if (wahrscheinlichkeit == null) return null
  const bg    = wahrscheinlichkeit >= 50 ? amberLight : wahrscheinlichkeit >= 20 ? '#fef9c3' : '#f1f5f9'
  const color = wahrscheinlichkeit >= 50 ? '#92400e'  : wahrscheinlichkeit >= 20 ? '#854d0e' : '#64748b'
  const label = wahrscheinlichkeit >= 50 ? '⚡'       : wahrscheinlichkeit >= 20 ? '⚠️'      : '✗'
  const confLabel = confidenceLabel(confidence)
  const confColor = confLabel === 'hoch' ? '#065f46' : confLabel === 'mittel' ? '#92400e' : slate
  const confBg    = confLabel === 'hoch' ? mintLight  : confLabel === 'mittel' ? amberLight : '#f1f5f9'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color }}
        title="Geschätzte Widerspruchs-Erfolgschance (KI-Prognose)">
        {label} {wahrscheinlichkeit}% Erfolgschance
      </span>
      {confLabel && (
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: confBg, color: confColor }}
          title="Wie verlässlich ist diese KI-Prognose?">
          Konfidenz {confLabel}
        </span>
      )}
    </span>
  )
}
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
        {pos.aktionstyp === 'widerspruch_kasse' && (
          <div style={{ marginTop: 4 }}>
            <ProbabilityPill wahrscheinlichkeit={pos.widerspruchWahrscheinlichkeit} confidence={pos.confidence} />
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
        {(pos.widerspruchWahrscheinlichkeit != null || pos.confidence != null) && (
          <div style={{ marginTop: 4 }}>
            <ProbabilityPill wahrscheinlichkeit={pos.widerspruchWahrscheinlichkeit} confidence={pos.confidence} />
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
  const goaePotenzial  = rData.einsparpotenzial ?? 0
  const kassePotenzial = kasseGruppe?.betragAbgelehnt ?? kassenbescheid?.betragAbgelehnt ?? 0
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
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
        <div style={{ overflowY: 'auto', padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          {(isRechnung ? rData.zusammenfassung : kData.zusammenfassung) && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', marginBottom: 8, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
              {isRechnung ? rData.zusammenfassung : kData.zusammenfassung}
            </div>
          )}
          {isRechnung && (
            <>
              <SectionHeader num={1} title="Ist die Rechnung korrekt?" sub="GOÄ-Prüfung: Faktoren, Ziffern-Logik, Begründungspflicht" accent={navy} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <KpiBox label="Rechnungsbetrag" value={`${rData.betragGesamt?.toFixed(2) ?? '–'} €`} />
                <KpiBox label="Max. Faktor" value={`${rData.maxFaktor ?? '–'}×`} warn={rData.flagFaktorUeberSchwellenwert} sub={rData.maxFaktor && rData.maxFaktor > 2.3 ? '§12 GOÄ — Begründung prüfen' : undefined} />
                <KpiBox label="Korrektur-Potenzial (Arzt)" value={goaePotenzial > 0 ? `${goaePotenzial.toFixed(2)} €` : '–'} warn={goaePotenzial > 0} sub={goaePotenzial > 0 ? 'Arzt hat zu hoch abgerechnet' : 'Keine GOÄ-Beanstandung'} />
              </div>
              {(rData.flagFehlendeBegrundung || rData.flagFaktorUeberSchwellenwert) && (
                <div style={{ background: redLight, border: `1px solid ${red}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
                  {rData.flagFehlendeBegrundung && (
                    <div>⚠ Faktor über 2,3× ohne schriftliche Begründung — der Arzt muss das nachliefern (§12 Abs. 3 GOÄ).
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
              <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 8 }}>GOÄ-Positionen ({rData.goaePositionen?.length ?? 0})</div>
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
              <SectionHeader num={2} title="Muss die Kasse zahlen?" sub="Erstattungs-Check: Was hat AXA erstattet, was abgelehnt — und warum?" accent="#b45309" />
              {kassePotenzial > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <KpiBox label="Eingereicht bei Kasse" value={`${kasseGruppe?.betragEingereicht?.toFixed(2) ?? '–'} €`} />
                  <KpiBox label="Erstattet" value={`${(kasseGruppe?.betragErstattet ?? kassenbescheid?.betragErstattet ?? 0).toFixed(2)} €`} good />
                  <KpiBox label="Widerspruch-Potenzial (Kasse)" value={`${kassePotenzial.toFixed(2)} €`} warn sub="Kann angefochten werden" />
                </div>
              )}
              {(kassenbescheid || kasseGruppe)
                ? <KassenbescheidSection gruppe={kasseGruppe} analyse={kasseAnalyseNew} bescheid={kassenbescheid} />
                : (
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '20px', fontSize: 13, color: slate, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📬</div>
                    <div style={{ fontWeight: 600, color: navy, marginBottom: 4 }}>Kassenbescheid noch nicht vorhanden</div>
                    <div style={{ fontSize: 12 }}>Sobald Sie den Bescheid einreichen, erscheint hier die automatische Analyse.</div>
                  </div>
                )
              }
            </>
          )}
          {!isRechnung && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <KpiBox label="Eingereicht" value={`${kData.betragEingereicht?.toFixed(2) ?? '–'} €`} />
                <KpiBox label="Erstattet" value={`${kData.betragErstattet?.toFixed(2) ?? '–'} €`} good />
                <KpiBox label="Abgelehnt / Offen" value={`${kData.betragAbgelehnt?.toFixed(2) ?? '–'} €`} warn={(kData.betragAbgelehnt ?? 0) > 0} sub={(kData.betragAbgelehnt ?? 0) > 0 ? '→ Widerspruch möglich' : undefined} />
              </div>
              {kData.widerspruchEmpfohlen && (
                <div style={{ background: amberLight, border: `1px solid ${amber}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                    ⚡ Widerspruch empfohlen
                    {kData.widerspruchErfolgswahrscheinlichkeit != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', borderRadius: 8, padding: '4px 10px', border: '1px solid #fcd34d' }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: kData.widerspruchErfolgswahrscheinlichkeit >= 70 ? '#22c55e' : kData.widerspruchErfolgswahrscheinlichkeit >= 40 ? amber : red, lineHeight: 1 }}>
                          {kData.widerspruchErfolgswahrscheinlichkeit}%
                        </span>
                        <span style={{ fontSize: 10, color: slate }}>Erfolgschance</span>
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
              <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 8 }}>Positionen ({kData.positionen?.length ?? 0})</div>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
