'use client'
import { useState } from 'react'
import type { WiderspruchFall, WiderspruchKommunikation } from '@/app/widersprueche/page'

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

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; accent: string }> = {
  erstellt:    { label: 'Entwurf',         bg: grey,       color: slate,     accent: '#cbd5e1' },
  gesendet:    { label: '📨 Gesendet',      bg: blueL,      color: '#1d4ed8', accent: blue },
  beantwortet: { label: '💬 Beantwortet',   bg: amberL,     color: '#92400e', accent: amber },
  erfolgreich: { label: '✓ Erfolgreich',    bg: mintL,      color: '#065f46', accent: mint },
  abgelehnt:   { label: '✗ Endabgelehnt',  bg: '#fef2f2',  color: '#991b1b', accent: red },
}

const DRINGLICHKEIT_COLOR: Record<string, string> = {
  hoch: red, mittel: amber, niedrig: mint,
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
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
  const [datum, setDatum]     = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<WiderspruchKommunikation | null>(null)
  const [naechsterSchritt, setNaechsterSchritt] = useState<string | null>(null)
  const [showReply, setShowReply] = useState(false)
  const [editBetreff, setEditBetreff] = useState('')
  const [editBody, setEditBody]       = useState('')
  const [copied, setCopied]           = useState(false)

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
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')
  }
  function openOutlook() {
    window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')
  }
  async function handleCopy() {
    await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}>
        <div style={{ background: navy, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>📥 Antwort eingegangen</div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 3 }}>Text einfügen → KI analysiert und schlägt nächsten Schritt vor</div>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 24, flex: 1 }}>
          {!result ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Absender</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['kasse', 'arzt'] as const).map(p => (
                    <button key={p} onClick={() => setPartner(p)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${partner === p ? blue : '#e2e8f0'}`, background: partner === p ? blueL : 'white', color: partner === p ? '#1d4ed8' : slate, fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {p === 'kasse' ? '🏥 Von AXA' : '🩺 Vom Arzt'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Datum des Schreibens</label>
                <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: navy }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: slate, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Inhalt des Schreibens</label>
                <textarea value={inhalt} onChange={e => setInhalt(e.target.value)}
                  placeholder="Vollständigen Text des eingegangenen Schreibens hier einfügen…"
                  rows={12}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, color: navy, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }} />
              </div>
              <button onClick={handleAnalyse} disabled={!inhalt.trim() || loading}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: !inhalt.trim() || loading ? '#e2e8f0' : navy, color: !inhalt.trim() || loading ? slate : 'white', fontWeight: 700, fontSize: 14, cursor: inhalt.trim() && !loading ? 'pointer' : 'not-allowed' }}>
                {loading ? '🤖 KI analysiert…' : '🤖 Analysieren & nächsten Schritt vorschlagen'}
              </button>
            </>
          ) : (
            <>
              <div style={{ background: blueL, borderRadius: 12, padding: 16, marginBottom: 20, borderLeft: `4px solid ${blue}` }}>
                <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13, marginBottom: 8 }}>🤖 KI-Analyse</div>
                <p style={{ color: '#1e40af', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{result.ki_analyse}</p>
                {naechsterSchritt && (
                  <p style={{ color: '#1e40af', fontSize: 13, lineHeight: 1.6, margin: '10px 0 0', fontWeight: 600 }}>→ {naechsterSchritt}</p>
                )}
                {result.ki_dringlichkeit && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'white', color: DRINGLICHKEIT_COLOR[result.ki_dringlichkeit] }}>
                      Dringlichkeit: {result.ki_dringlichkeit}
                    </span>
                    {result.ki_naechste_frist && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'white', color: red }}>
                        📅 Frist: {formatDate(result.ki_naechste_frist)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {result.ki_vorschlag_inhalt && (
                <div>
                  <div style={{ fontWeight: 700, color: navy, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    ✉️ Vorgeschlagener nächster Brief
                    <button onClick={() => setShowReply(r => !r)}
                      style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0', background: 'white', color: slate, cursor: 'pointer' }}>
                      {showReply ? 'Einklappen' : 'Bearbeiten & senden'}
                    </button>
                  </div>
                  {showReply && (
                    <div style={{ border: `2px solid ${amber}`, borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ background: amberL, padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                        An: {result.ki_naechster_empfaenger === 'kasse' ? 'AXA Krankenversicherung' : 'Behandelnde/r Arzt/Ärztin'}
                      </div>
                      <div style={{ padding: 16 }}>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Betreff</label>
                          <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: navy, boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>E-Mail-Text</label>
                          <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={14}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={handleCopy}
                            style={{ fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: copied ? mintL : grey, color: copied ? '#065f46' : navy }}>
                            {copied ? '✓ Kopiert' : '📋 Kopieren'}
                          </button>
                          <button onClick={openGmail}
                            style={{ fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: blueL, color: '#1d4ed8' }}>
                            In Gmail öffnen
                          </button>
                          <button onClick={openOutlook}
                            style={{ fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#e8f4fd', color: '#0078d4' }}>
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

// ── Synthetic "sent" placeholder entry ────────────────────────────────────────
function SentPlaceholder({ fall }: { fall: WiderspruchFall }) {
  const dateStr = fall.widerspruch_gesendet_am
    ? formatDate(fall.widerspruch_gesendet_am)
    : fall.bescheiddatum
    ? formatDate(fall.bescheiddatum)
    : null

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: blue, flexShrink: 0, marginTop: 4 }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: blue }}>📤 Du → AXA</span>
          {dateStr && <span style={{ fontSize: 11, color: slate }}>{dateStr}</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 6 }}>Widerspruchsbrief</div>
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          border: '1.5px dashed #93c5fd',
          background: '#f8fafc',
          fontSize: 12,
          color: '#64748b',
          lineHeight: 1.5,
        }}>
          Brief wurde per E-Mail versandt. Der genaue Inhalt wird beim nächsten Widerspruch automatisch hier archiviert.
        </div>
      </div>
    </div>
  )
}

// ── Timeline entry ─────────────────────────────────────────────────────────────
function TimelineEntry({ k, isLast }: { k: WiderspruchKommunikation; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isOutgoing = k.richtung === 'ausgehend'
  const dotColor   = isOutgoing ? blue : k.ki_dringlichkeit === 'hoch' ? red : amber

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 4 }} />
        {!isLast && <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isOutgoing ? blue : amber }}>
            {isOutgoing ? '📤 Du →' : '📥 Eingehend ←'} {k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'}
          </span>
          <span style={{ fontSize: 11, color: slate }}>{formatDate(k.datum)}</span>
          {k.ki_dringlichkeit && !isOutgoing && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef2f2', color: DRINGLICHKEIT_COLOR[k.ki_dringlichkeit] }}>
              {k.ki_dringlichkeit}
            </span>
          )}
          {k.ki_naechste_frist && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef2f2', color: red }}>
              📅 Frist {formatDate(k.ki_naechste_frist)}
            </span>
          )}
        </div>
        {k.betreff && (
          <div style={{ fontSize: 12, fontWeight: 600, color: navy, marginBottom: 5 }}>{k.betreff}</div>
        )}
        {!isOutgoing && k.ki_analyse && (
          <div style={{ background: blueL, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1e40af', marginBottom: 6, lineHeight: 1.55 }}>
            🤖 {k.ki_analyse}
          </div>
        )}
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
  const [open, setOpen]           = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [kommunikationen, setKommunikationen] = useState<WiderspruchKommunikation[]>(fall.kommunikationen)

  const cfg             = STATUS_CONFIG[fall.widerspruch_status] ?? STATUS_CONFIG.erstellt
  const ablehnungsgruende = (fall.kasse_analyse?.ablehnungsgruende as string[] | null) ?? []
  const bescheiddatum   = fall.bescheiddatum ? formatDate(fall.bescheiddatum) : '—'
  const isClosed        = fall.widerspruch_status === 'erfolgreich' || fall.widerspruch_status === 'abgelehnt'

  // Show synthetic placeholder when sent but no komunikation logged yet
  const showSentPlaceholder = kommunikationen.length === 0
    && ['gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt'].includes(fall.widerspruch_status)

  const latestIncoming  = [...kommunikationen].reverse().find(k => k.richtung === 'eingehend')

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
      overflow: 'hidden',
      borderLeft: `4px solid ${cfg.accent}`,
    }}>
      {/* ── Card header ──────────────────────────────────────── */}
      <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: navy, fontSize: 15, marginBottom: 3 }}>
            {fall.arztName ?? 'Arzt unbekannt'}
          </div>
          <div style={{ color: slate, fontSize: 12 }}>
            Bescheid {bescheiddatum}
            {fall.referenznummer && <span style={{ color: '#94a3b8' }}> · Ref. {fall.referenznummer}</span>}
          </div>
          {ablehnungsgruende.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5, lineHeight: 1.4 }}>
              {ablehnungsgruende.slice(0, 2).join(' · ')}
              {ablehnungsgruende.length > 2 && ` +${ablehnungsgruende.length - 2} weitere`}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: red, letterSpacing: '-0.5px' }}>
            {fall.betrag_abgelehnt.toFixed(2)} € abgelehnt
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
              background: cfg.bg, color: cfg.color,
              border: `1px solid ${cfg.accent}20`,
            }}>
              {cfg.label}
            </span>
            <button onClick={() => setOpen(o => !o)}
              style={{ background: grey, border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: slate, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {open ? '▲' : '▼'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Expanded body ─────────────────────────────────────── */}
      {open && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '20px 20px 16px' }}>

          {/* Timeline */}
          <div style={{ marginBottom: 16 }}>
            {showSentPlaceholder && <SentPlaceholder fall={fall} />}
            {kommunikationen.map((k, i) => (
              <TimelineEntry key={k.id} k={k} isLast={i === kommunikationen.length - 1} />
            ))}
          </div>

          {/* CTA */}
          {!isClosed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setShowModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 18px', borderRadius: 10,
                  border: `1.5px solid ${amber}`,
                  background: amberL, color: '#92400e',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}>
                📥 Antwort eingegangen — KI-Analyse starten
              </button>
              {latestIncoming?.ki_naechster_empfaenger && latestIncoming.ki_naechster_empfaenger !== 'keiner' && (
                <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                  ↳ Nächste Aktion an: {latestIncoming.ki_naechster_empfaenger === 'kasse' ? 'AXA' : 'Arzt'}
                </span>
              )}
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
