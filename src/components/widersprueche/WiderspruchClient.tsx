'use client'

import { useState } from 'react'
import type { WiderspruchFall, WiderspruchKommunikation } from '@/app/widersprueche/page'

// ── Design tokens ─────────────────────────────────────────────────────────────
const navy    = '#0f172a'
const slate   = '#64748b'
const mint    = '#10b981'
const mintL   = '#ecfdf5'
const amber   = '#f59e0b'
const amberL  = '#fffbeb'
const red     = '#ef4444'
const blue    = '#3b82f6'
const blueL   = '#eff6ff'
const grey    = '#f1f5f9'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  erstellt:    { label: 'Erstellt',          bg: grey,  color: slate },
  gesendet:    { label: '📨 Gesendet',       bg: blueL, color: '#1d4ed8' },
  beantwortet: { label: '💬 Beantwortet',    bg: amberL, color: '#92400e' },
  erfolgreich: { label: '✓ Erfolgreich',     bg: mintL, color: '#065f46' },
  abgelehnt:   { label: '✗ Endabgelehnt',   bg: '#fef2f2', color: '#991b1b' },
}

const DRINGLICHKEIT_COLOR: Record<string, string> = {
  hoch: red, mittel: amber, niedrig: mint,
}

// ── KommunikationModal — paste incoming letter + AI analysis ──────────────────
function KommunikationModal({
  fall,
  onClose,
  onAdded,
}: {
  fall: WiderspruchFall
  onClose: () => void
  onAdded: (komm: WiderspruchKommunikation) => void
}) {
  const [partner, setPartner] = useState<'kasse' | 'arzt'>('kasse')
  const [inhalt, setInhalt] = useState('')
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WiderspruchKommunikation | null>(null)
  const [naechsterSchritt, setNaechsterSchritt] = useState<string | null>(null)
  const [showReply, setShowReply] = useState(false)
  const [editBetreff, setEditBetreff] = useState('')
  const [editBody, setEditBody] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleAnalyse() {
    if (!inhalt.trim()) return
    setLoading(true)
    try {
      // 1. Save the incoming communication
      const postRes = await fetch('/api/widerspruch-kommunikationen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kassenabrechnungen_id: fall.id,
          richtung: 'eingehend',
          kommunikationspartner: partner,
          typ: 'antwort',
          datum,
          inhalt,
        }),
      })
      const saved = await postRes.json()
      if (!postRes.ok) throw new Error(saved.error)

      // 2. Trigger AI analysis
      const analyseRes = await fetch(`/api/widerspruch-kommunikationen/${saved.id}/analyse`, {
        method: 'POST',
      })
      const analysed = await analyseRes.json()
      if (!analyseRes.ok) throw new Error(analysed.error)

      setResult(analysed)
      setNaechsterSchritt(analysed.naechster_schritt_erklaerung ?? null)
      setEditBetreff(analysed.ki_vorschlag_betreff ?? '')
      setEditBody(analysed.ki_vorschlag_inhalt ?? '')
      onAdded(analysed)
    } catch (e) {
      alert('Fehler: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  function openGmail() {
    const s = encodeURIComponent(editBetreff)
    const b = encodeURIComponent(editBody)
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${s}&body=${b}`, '_blank')
  }

  function openOutlook() {
    const s = encodeURIComponent(editBetreff)
    const b = encodeURIComponent(editBody)
    window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${s}&body=${b}`, '_blank')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div style={{ background: navy, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>📥 Antwort eingegangen</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Text einfügen → KI analysiert und schlägt nächsten Schritt vor</div>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 24, flex: 1 }}>
          {!result ? (
            <>
              {/* Step 1: Who sent it? */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
                  Absender
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['kasse', 'arzt'] as const).map(p => (
                    <button key={p} onClick={() => setPartner(p)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${partner === p ? blue : '#e2e8f0'}`, background: partner === p ? blueL : 'white', color: partner === p ? '#1d4ed8' : slate, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      {p === 'kasse' ? '🏥 Von AXA' : '🩺 Vom Arzt'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Datum des Schreibens
                </label>
                <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: navy }} />
              </div>

              {/* Paste area */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Inhalt des Schreibens (einfügen)
                </label>
                <textarea
                  value={inhalt}
                  onChange={e => setInhalt(e.target.value)}
                  placeholder="Hier den vollständigen Text des eingegangenen Schreibens einfügen..."
                  rows={12}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: navy, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>

              <button onClick={handleAnalyse} disabled={!inhalt.trim() || loading}
                style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: navy, color: 'white', fontWeight: 700, fontSize: 14, cursor: inhalt.trim() && !loading ? 'pointer' : 'not-allowed', opacity: inhalt.trim() && !loading ? 1 : 0.5 }}>
                {loading ? '🤖 KI analysiert…' : '🤖 Analysieren & nächsten Schritt vorschlagen'}
              </button>
            </>
          ) : (
            <>
              {/* AI Analysis result */}
              <div style={{ background: blueL, borderRadius: 12, padding: 16, marginBottom: 20, borderLeft: `4px solid ${blue}` }}>
                <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13, marginBottom: 8 }}>🤖 KI-Analyse des Schreibens</div>
                <p style={{ color: '#1e40af', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{result.ki_analyse}</p>
                {naechsterSchritt && (
                  <p style={{ color: '#1e40af', fontSize: 13, lineHeight: 1.6, margin: '10px 0 0', fontWeight: 600 }}>
                    → {naechsterSchritt}
                  </p>
                )}
                {result.ki_dringlichkeit && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'white', color: DRINGLICHKEIT_COLOR[result.ki_dringlichkeit] }}>
                      Dringlichkeit: {result.ki_dringlichkeit}
                    </span>
                    {result.ki_naechste_frist && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'white', color: red }}>
                        📅 Frist: {new Date(result.ki_naechste_frist).toLocaleDateString('de-DE')}
                      </span>
                    )}
                    {result.ki_naechster_empfaenger && result.ki_naechster_empfaenger !== 'keiner' && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'white', color: navy }}>
                        Nächste Aktion an: {result.ki_naechster_empfaenger === 'kasse' ? 'AXA' : 'Arzt'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Suggested reply */}
              {result.ki_vorschlag_inhalt && (
                <div>
                  <div style={{ fontWeight: 700, color: navy, fontSize: 13, marginBottom: 12 }}>
                    ✉️ Vorgeschlagener nächster Brief
                    <button onClick={() => setShowReply(r => !r)}
                      style={{ marginLeft: 10, fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: slate, cursor: 'pointer' }}>
                      {showReply ? 'Einklappen' : 'Bearbeiten & senden'}
                    </button>
                  </div>

                  {showReply && (
                    <div style={{ border: `2px solid ${amber}`, borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ background: amberL, padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                        An: {result.ki_naechster_empfaenger === 'kasse' ? 'AXA Krankenversicherung' : 'Behandelnde/r Arzt/Ärztin'}
                      </div>
                      <div style={{ padding: 16, background: 'white' }}>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Betreff</label>
                          <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: navy, boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>E-Mail-Text</label>
                          <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={14}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={handleCopy}
                            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: copied ? mintL : grey, color: copied ? '#065f46' : navy }}>
                            {copied ? '✓ Kopiert!' : '📋 Text kopieren'}
                          </button>
                          <button onClick={openGmail}
                            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: blueL, color: '#1d4ed8' }}>
                            In Gmail öffnen
                          </button>
                          <button onClick={openOutlook}
                            style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: blueL, color: '#0078d4' }}>
                            In Outlook öffnen
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Timeline entry ────────────────────────────────────────────────────────────
function TimelineEntry({ k, isLast }: { k: WiderspruchKommunikation; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isOutgoing = k.richtung === 'ausgehend'
  const dotColor = isOutgoing ? blue : k.ki_dringlichkeit === 'hoch' ? red : amber

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {/* Timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 4 }} />
        {!isLast && <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isOutgoing ? blue : amber }}>
            {isOutgoing ? '📤 Du →' : '📥 Eingehend ←'}
            {' '}{k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'}
          </span>
          <span style={{ fontSize: 11, color: slate }}>
            {new Date(k.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
          {k.ki_dringlichkeit && !isOutgoing && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: '#fef2f2', color: DRINGLICHKEIT_COLOR[k.ki_dringlichkeit] }}>
              {k.ki_dringlichkeit}
            </span>
          )}
          {k.ki_naechste_frist && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: '#fef2f2', color: red }}>
              📅 Frist {new Date(k.ki_naechste_frist).toLocaleDateString('de-DE')}
            </span>
          )}
        </div>

        {k.betreff && (
          <div style={{ fontSize: 12, fontWeight: 600, color: navy, marginBottom: 4 }}>{k.betreff}</div>
        )}

        {/* KI analysis for incoming */}
        {!isOutgoing && k.ki_analyse && (
          <div style={{ background: blueL, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1e40af', marginBottom: 6, lineHeight: 1.5 }}>
            🤖 {k.ki_analyse}
          </div>
        )}

        {/* Toggle full text */}
        <button onClick={() => setExpanded(e => !e)}
          style={{ fontSize: 11, color: slate, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
          {expanded ? '▲ Einklappen' : '▼ Volltext anzeigen'}
        </button>
        {expanded && (
          <div style={{ marginTop: 8, padding: '10px 14px', background: grey, borderRadius: 8, fontSize: 12, color: navy, lineHeight: 1.7, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
            {k.inhalt}
          </div>
        )}
      </div>
    </div>
  )
}

// ── WiderspruchCard ───────────────────────────────────────────────────────────
function WiderspruchCard({ fall }: { fall: WiderspruchFall }) {
  const [open, setOpen] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [kommunikationen, setKommunikationen] = useState<WiderspruchKommunikation[]>(fall.kommunikationen)

  const cfg = STATUS_CONFIG[fall.widerspruch_status] ?? STATUS_CONFIG.erstellt
  const ablehnungsgruende = (fall.kasse_analyse?.ablehnungsgruende as string[] | null) ?? []
  const bescheiddatum = fall.bescheiddatum
    ? new Date(fall.bescheiddatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  const latestIncoming = [...kommunikationen].reverse().find(k => k.richtung === 'eingehend')
  const hasOpenAction = latestIncoming && !latestIncoming.ki_vorschlag_inhalt === false

  return (
    <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', borderLeft: `4px solid ${cfg.color}` }}>
      {/* Card header */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: navy, fontSize: 15 }}>
            {fall.arztName ?? 'Arzt unbekannt'}
          </div>
          <div style={{ color: slate, fontSize: 12, marginTop: 3 }}>
            Bescheid {bescheiddatum}
            {fall.referenznummer && ` · Ref. ${fall.referenznummer}`}
          </div>
          {ablehnungsgruende.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              {ablehnungsgruende.slice(0, 2).join(' · ')}{ablehnungsgruende.length > 2 ? ` +${ablehnungsgruende.length - 2}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: red }}>{fall.betrag_abgelehnt.toFixed(2)} € abgelehnt</div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
          </div>
          <button onClick={() => setOpen(o => !o)}
            style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: slate, padding: 4 }}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px' }}>
          {/* Timeline */}
          {kommunikationen.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              {kommunikationen.map((k, i) => (
                <TimelineEntry key={k.id} k={k} isLast={i === kommunikationen.length - 1} />
              ))}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16, padding: '12px 0' }}>
              Noch keine Kommunikationseinträge. Der erste Widerspruchsbrief wird hier erscheinen sobald er als gesendet markiert wurde.
            </div>
          )}

          {/* CTA */}
          {fall.widerspruch_status !== 'erfolgreich' && fall.widerspruch_status !== 'abgelehnt' && (
            <button onClick={() => setShowModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: `2px solid ${amber}`, background: amberL, color: '#92400e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              📥 Antwort eingegangen — KI-Analyse starten
            </button>
          )}
          {hasOpenAction && latestIncoming?.ki_naechster_empfaenger && latestIncoming.ki_naechster_empfaenger !== 'keiner' && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
              ↳ Empfohlene nächste Aktion an: {latestIncoming.ki_naechster_empfaenger === 'kasse' ? 'AXA' : 'Arzt'}
            </div>
          )}
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
