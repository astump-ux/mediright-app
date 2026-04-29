'use client'
/**
 * FaelleDossierClient — unified "Meine Fälle" view.
 *
 * Replaces three separate pages (Rechnungen / Kassenabrechnungen / Widersprüche)
 * with one case-centric dossier. Each Kassenbescheid is the primary object;
 * Arztrechnungen and the Widerspruch-Thread are tabs within each dossier card.
 *
 * UX principles applied:
 *  1. Aktion nah am Kontext — all actions inside the card they relate to
 *  2. Zero Classification Upload — AI decides the type, user only confirms
 *  3. Progressive Disclosure — tabs reveal detail on demand
 *  4. Inline Reveal, not Modal — thread actions appear in-place at end of thread
 */

import { useState, useRef, useCallback, lazy, Suspense, type ComponentProps } from 'react'
import type { FallDossier, FallKommunikation, UnverarbeitetVorgang } from '@/app/meine-faelle/page'
import type { KassePosition, KasseAnalyseResult, KasseRechnungGruppe } from '@/lib/goae-analyzer'
import { WIDERSPRUCH_STATUS_CFG } from '@/components/ui/WiderspruchStatus'
import HandlungsempfehlungPanel from '@/components/ui/HandlungsempfehlungPanel'

const AnalyseModal = lazy(() => import('@/components/rechnungen/AnalyseModal'))

// ── Design tokens ──────────────────────────────────────────────────────────────
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

const STATUS_CFG = WIDERSPRUCH_STATUS_CFG as Record<string, {
  label: string; bg: string; color: string; border: string; icon: string
}>

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toFixed(2).replace('.', ',') + ' €'
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateShort(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function quoteColor(q: number) {
  if (q >= 90) return mint
  if (q >= 70) return amber
  return red
}

// ── Widerspruchsbrief generator (adapted from WiderspruchClient) ───────────────
type RawPos  = { ziffer?: string; bezeichnung?: string; betragEingereicht?: number; betragErstattet?: number; ablehnungsgrund?: string | null; status?: string; aktionstyp?: string | null }
type RawRech = { arztName?: string | null; positionen?: RawPos[] }

function generateBrief(fall: FallDossier, userName: string): { betreff: string; body: string } {
  const analyse = fall.kasse_analyse
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const ref = fall.referenznummer ?? '[Ihre Referenznummer]'
  const begruendung = (analyse?.widerspruchBegruendung as string | null) ?? 'Die Ablehnung ist aus meiner Sicht nicht gerechtfertigt.'
  const rechnungen = ((analyse?.rechnungen ?? []) as RawRech[])
  const kassePos = rechnungen.flatMap(g =>
    (g.positionen ?? []).filter(p => (p.status === 'abgelehnt' || p.status === 'gekuerzt') && p.aktionstyp !== 'korrektur_arzt')
  )
  const betrag = kassePos.reduce((s, p) => s + (p.betragEingereicht ?? 0) - (p.betragErstattet ?? 0), 0)
  const abgelehntFmt = (betrag > 0 ? betrag : fall.betrag_abgelehnt).toFixed(2)
  const betreff = `Widerspruch gegen Ihren Bescheid vom ${fmtDateShort(fall.bescheiddatum)}, Az. ${ref}`
  const body = `${userName}\n\n${heute}\n\nAXA Krankenversicherung AG\n\n` +
    `Betreff: ${betreff}\n\n` +
    `Sehr geehrte Damen und Herren,\n\n` +
    `hiermit lege ich Widerspruch gegen Ihren Bescheid vom ${fmtDateShort(fall.bescheiddatum)} ` +
    `(Aktenzeichen: ${ref}) ein, mit dem Sie Leistungen in Höhe von ${abgelehntFmt} € abgelehnt haben.\n\n` +
    `${begruendung}\n\n` +
    `Ich bitte Sie, den Bescheid zu überprüfen und mir die abgelehnten Leistungen in Höhe von ` +
    `${abgelehntFmt} € zu erstatten.\n\n` +
    `Mit freundlichen Grüßen\n${userName}`
  return { betreff, body }
}

function generateArztBrief(fall: FallDossier, userName: string): { betreff: string; body: string } {
  const analyse = fall.kasse_analyse
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const rechnungen = ((analyse?.rechnungen ?? []) as RawRech[])
  const arztPosAll = rechnungen.flatMap(g =>
    (g.positionen ?? [])
      .filter(p => p.aktionstyp === 'korrektur_arzt' && (p.status === 'abgelehnt' || p.status === 'gekuerzt'))
      .map(p => ({ ...p, arztName: g.arztName }))
  )
  const arztName = arztPosAll[0]?.arztName ?? '[Arztname]'
  const betrag = arztPosAll.reduce((s, p) => s + (p.betragEingereicht ?? 0) - (p.betragErstattet ?? 0), 0)
  const posListe = arztPosAll.map(p =>
    `- GOÄ ${p.ziffer}: ${p.bezeichnung} (${(p.betragEingereicht ?? 0).toFixed(2).replace('.', ',')} €)\n  Ablehnung: ${p.ablehnungsgrund ?? 'keine Begründung'}`
  ).join('\n')
  const betreff = `Bitte um Prüfung / Korrektur Ihrer Rechnung`
  const body =
    `${userName}\n\n${heute}\n\n${arztName}\n\n` +
    `Betreff: ${betreff}\n\n` +
    `Sehr geehrte Damen und Herren,\n\n` +
    `meine Krankenversicherung AXA hat in ihrer Leistungsabrechnung vom ${fmtDateShort(fall.bescheiddatum)} ` +
    `folgende Position(en) aus Ihrer Rechnung nicht anerkannt:\n\n` +
    `${posListe}\n\n` +
    `Nicht erstattet: ${betrag.toFixed(2).replace('.', ',')} €\n\n` +
    `Ich bitte Sie, die abgelehnten Positionen zu prüfen und mir mitzuteilen, ob eine Rechnungskorrektur ` +
    `möglich ist oder Sie eine ärztliche Begründung zur medizinischen Notwendigkeit bereitstellen können, ` +
    `die ich für einen Widerspruch bei der AXA nutzen kann.\n\n` +
    `Mit freundlichen Grüßen\n${userName}`
  return { betreff, body }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SUMMARY BAR ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function SummaryBar({ faelle }: { faelle: FallDossier[] }) {
  const totalAbgelehnt = faelle.reduce((s, f) => s + f.betrag_abgelehnt, 0)
  const totalEingereicht = faelle.reduce((s, f) => s + f.betrag_eingereicht, 0)
  const totalErstattet = faelle.reduce((s, f) => s + f.betrag_erstattet, 0)
  const avgQuote = totalEingereicht > 0 ? (totalErstattet / totalEingereicht) * 100 : 0
  const offeneFaelle = faelle.filter(f => ['erstellt', 'gesendet', 'beantwortet'].includes(f.widerspruch_status)).length
  const aktiveWidersprueche = faelle.filter(f => f.kommunikationen.length > 0).length

  const items = [
    { label: 'Abgelehnt gesamt', value: fmt(totalAbgelehnt), color: totalAbgelehnt > 0 ? red : slate },
    { label: 'Offene Fälle', value: String(offeneFaelle), color: offeneFaelle > 0 ? amber : slate },
    { label: 'Aktive Widersprüche', value: String(aktiveWidersprueche), color: aktiveWidersprueche > 0 ? blue : slate },
    { label: 'Ø Erstattung', value: avgQuote.toFixed(0) + ' %', color: quoteColor(avgQuote) },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
      {items.map(item => (
        <div key={item.label} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: slate, marginBottom: 4 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: item.color, fontFamily: "'DM Serif Display', Georgia, serif" }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SMART UPLOAD ZONE ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function SmartUploadZone({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<{ type: string; message: string } | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/upload/smart', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Unbekannter Fehler')
      setResult(data)
      setTimeout(() => { setResult(null); onSuccess() }, 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? blue : '#bae6fd'}`,
          background: dragging ? '#eff6ff' : '#f0f9ff',
          borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: loading ? 'wait' : 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 4 }}>{loading ? '⏳' : '📄'}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>
          {loading ? 'KI analysiert…' : 'Dokument hochladen oder reinziehen'}
        </div>
        <div style={{ fontSize: 11, color: slate, marginTop: 3 }}>
          {loading ? 'Bitte warten — dauert ca. 20–40 Sekunden'
            : 'KI erkennt automatisch ob Arztrechnung oder Kassenbescheid und ordnet zu'}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
          {[
            { icon: '🏥', label: 'Arztrechnung', sub: '→ matched zu offenem Fall' },
            { icon: '📋', label: 'Kassenbescheid', sub: '→ neuer Fall / Update' },
            { icon: '✉️', label: 'Kasse-Antwort', sub: '→ Thread wird ergänzt' },
          ].map(chip => (
            <div key={chip.label} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px', minWidth: 120 }}>
              <div style={{ fontSize: 14 }}>{chip.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>{chip.label}</div>
              <div style={{ fontSize: 10, color: '#4ade80' }}>{chip.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {result && (
        <div style={{ marginTop: 8, padding: '8px 14px', background: mintL, border: `1.5px solid ${mint}`, borderRadius: 8, fontSize: 12, color: '#065f46', fontWeight: 600 }}>
          ✅ {result.message}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, padding: '8px 14px', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
          ❌ {error}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── TAB 1: BESCHEID & ABLEHNUNGEN ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function BescheidTab({ fall, onSwitchToRechnungen, onSwitchToWiderspruch }: {
  fall: FallDossier
  onSwitchToRechnungen: () => void
  onSwitchToWiderspruch: () => void
}) {
  const [neuAnalyseLoading, setNeuAnalyseLoading] = useState(false)
  const [neuAnalyseError, setNeuAnalyseError]     = useState<string | null>(null)
  const [neuAnalysePdfName, setNeuAnalysePdfName] = useState<string | null>(null)
  const neuAnalyseRef = useRef<HTMLInputElement>(null)

  async function handleNeuAnalyse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNeuAnalysePdfName(file.name)
    setNeuAnalyseLoading(true); setNeuAnalyseError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/kassenabrechnungen/${fall.id}/neu-analysieren`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Fehler')
      // Seite neu laden damit die aktualisierte Analyse sichtbar wird
      window.location.reload()
    } catch (err) {
      setNeuAnalyseError(err instanceof Error ? err.message : String(err))
      setNeuAnalyseLoading(false)
    } finally {
      if (neuAnalyseRef.current) neuAnalyseRef.current.value = ''
    }
  }

  const analyse = fall.kasse_analyse
  const ablehnungsgruende: string[] = (analyse?.ablehnungsgruende as string[] | null) ?? []
  const rechnungen = (analyse?.rechnungen ?? []) as Array<{
    arztName?: string | null
    positionen?: KassePosition[]
  }>
  const abgelehntePositionen = rechnungen.flatMap(r =>
    (r.positionen ?? [])
      .filter(p => p.status === 'abgelehnt' || p.status === 'gekuerzt')
      .map(p => ({ ...p, arztName: r.arztName }))
  )

  const arztSent = fall.arzt_reklamation_status === 'gesendet'
  const hasArztAction = rechnungen.some(r =>
    (r.positionen ?? []).some(p => p.aktionstyp === 'korrektur_arzt' && (p.status === 'abgelehnt' || p.status === 'gekuerzt'))
  )
  const hasKasseWiderspruch = rechnungen.some(r =>
    (r.positionen ?? []).some(p => p.aktionstyp === 'widerspruch_kasse' && (p.status === 'abgelehnt' || p.status === 'gekuerzt'))
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Einsparpotenzial-Banner — wenn Arztrechnungen GOÄ-Analyse haben */}
      {(() => {
        const totalEinspar = fall.vorgaenge.reduce((sum, v) => {
          const ep = (v.goae_analyse?.einsparpotenzial as number | null) ?? 0
          return sum + ep
        }, 0)
        if (totalEinspar <= 0) return null
        return (
          <div style={{
            display: 'flex', gap: 10, padding: '11px 14px',
            background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 9,
            fontSize: 12, color: '#14532d', alignItems: 'center',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
            <div style={{ flex: 1, lineHeight: 1.5 }}>
              <strong>Einsparpotenzial erkannt:</strong> Die GOÄ-Analyse der verknüpften Rechnungen zeigt
              ein Einsparpotenzial von <strong>{totalEinspar.toFixed(2).replace('.', ',')} €</strong> —
              z.B. durch Widerspruch oder Korrektur beim Arzt.
            </div>
            <button onClick={onSwitchToRechnungen} style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: '#16a34a', color: 'white', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
            }}>
              Rechnungen prüfen →
            </button>
          </div>
        )
      })()}

      {/* Vorläufig-Banner — wenn noch keine Arztrechnungen verknüpft */}
      {analyse && fall.vorgaenge.length === 0 && (
        <div style={{
          display: 'flex', gap: 10, padding: '11px 14px',
          background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 9,
          fontSize: 12, color: '#78350f', alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <div style={{ lineHeight: 1.5 }}>
            <strong>Vorläufige Analyse</strong> — Noch keine Arztrechnungen verknüpft.
            Die KI hat den Kassenbescheid ausgewertet, aber ohne die Originalrechnungen können
            GOÄ-Positionen und medizinische Begründungen nicht geprüft werden.
            Die Handlungsempfehlung wird präziser, sobald Sie die Rechnungen hochladen.{' '}
            <button onClick={onSwitchToRechnungen} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#b45309', fontWeight: 700, fontSize: 12, padding: 0,
              textDecoration: 'underline',
            }}>
              Rechnungen jetzt hochladen →
            </button>
          </div>
        </div>
      )}

      {/* KI-Handlungsempfehlung */}
      {analyse && (
        <HandlungsempfehlungPanel
          analyse={analyse as Parameters<typeof HandlungsempfehlungPanel>[0]['analyse']}
          widerspruchStatus={fall.widerspruch_status}
          arztSent={arztSent}
          hasArztAction={hasArztAction}
          defaultOpen={true}
        />
      )}

      {/* Prominente Aktions-CTAs */}
      {(hasKasseWiderspruch || hasArztAction) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {hasKasseWiderspruch && (
            <button
              onClick={onSwitchToWiderspruch}
              style={{
                flex: 1, minWidth: 200, padding: '11px 18px', borderRadius: 9,
                border: 'none', cursor: 'pointer',
                background: blue, color: 'white',
                fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <span>📝</span> Widerspruch bei AXA einlegen →
            </button>
          )}
          {hasArztAction && (
            <button
              onClick={onSwitchToWiderspruch}
              style={{
                flex: 1, minWidth: 200, padding: '11px 18px', borderRadius: 9,
                border: 'none', cursor: 'pointer',
                background: orange, color: 'white',
                fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <span>🩺</span> Arzt um Rechnungskorrektur bitten →
            </button>
          )}
        </div>
      )}

      {/* Ablehnungsgründe */}
      {ablehnungsgruende.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: slate, marginBottom: 8 }}>
            Ablehnungsgründe AXA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ablehnungsgruende.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#7f1d1d', alignItems: 'flex-start', padding: '6px 10px', background: '#fef2f2', borderRadius: 7 }}>
                <span style={{ color: red, flexShrink: 0, marginTop: 1 }}>✗</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Positions table */}
      {abgelehntePositionen.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: slate, marginBottom: 8 }}>
            Abgelehnte / Gekürzte Positionen
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: grey }}>
                  {['GOÄ', 'Leistung', 'Arzt', 'Eingereicht', 'Erstattet', 'Differenz', 'Status', 'Aktion'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: slate, whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abgelehntePositionen.map((p, i) => {
                  const diff = (p.betragEingereicht ?? 0) - (p.betragErstattet ?? 0)
                  const isKasse = p.aktionstyp !== 'korrektur_arzt'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, color: navy }}>{p.ziffer ?? '—'}</td>
                      <td style={{ padding: '6px 10px', color: navy, maxWidth: 200 }}>{p.bezeichnung ?? '—'}</td>
                      <td style={{ padding: '6px 10px', color: slate, whiteSpace: 'nowrap' }}>{(p as { arztName?: string | null }).arztName ?? '—'}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: navy, whiteSpace: 'nowrap' }}>{fmt(p.betragEingereicht)}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: mint, whiteSpace: 'nowrap' }}>{fmt(p.betragErstattet)}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, color: diff > 0 ? red : slate, whiteSpace: 'nowrap' }}>{diff > 0 ? `−${fmt(diff)}` : '—'}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                          background: p.status === 'abgelehnt' ? '#fef2f2' : '#fffbeb',
                          color: p.status === 'abgelehnt' ? red : amber }}>
                          {p.status === 'abgelehnt' ? 'Abgelehnt' : 'Gekürzt'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                          background: isKasse ? blueL : '#fff7ed',
                          color: isKasse ? '#1d4ed8' : '#9a3412' }}>
                          {isKasse ? '→ Widerspruch AXA' : '→ Korrektur Arzt'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!analyse && (
        <div style={{ textAlign: 'center', padding: 24, color: slate, fontSize: 13 }}>
          Noch keine KI-Analyse vorhanden. Bitte Kassenbescheid hochladen.
        </div>
      )}

      {/* ── Weiteres Dokument hinzufügen ────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 4 }}>
        <input ref={neuAnalyseRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleNeuAnalyse} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => neuAnalyseRef.current?.click()}
            disabled={neuAnalyseLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1.5px dashed #c4b5fd', background: '#f5f3ff', color: '#6d28d9',
              fontWeight: 700, fontSize: 12, cursor: neuAnalyseLoading ? 'wait' : 'pointer',
              opacity: neuAnalyseLoading ? 0.7 : 1,
            }}
          >
            {neuAnalyseLoading
              ? '⏳ Analyse läuft…'
              : '📎 Weiteres Dokument hinzufügen & Analyse aktualisieren'}
          </button>
          {neuAnalysePdfName && !neuAnalyseLoading && (
            <span style={{ fontSize: 11, color: slate }}>{neuAnalysePdfName}</span>
          )}
        </div>
        {neuAnalyseLoading && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#6d28d9' }}>
            KI liest beide Dokumente gemeinsam — das kann 30–60 Sekunden dauern…
          </div>
        )}
        {neuAnalyseError && (
          <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 11, color: '#991b1b' }}>
            {neuAnalyseError}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
          Hast du mehrere AXA-Dokumente zum gleichen Bescheid (z.B. Leistungsabrechnung + Begründungsschreiben)?
          Lade das zweite Dokument hier hoch — die KI analysiert dann beide gemeinsam und aktualisiert die Handlungsempfehlung.
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── TAB 2: RECHNUNGEN ──────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function RechnungenTab({ fall, onUploaded }: { fall: FallDossier; onUploaded: () => void }) {
  const vorgaenge = fall.vorgaenge
  const [uploading, setUploading]   = useState(false)
  const [uploadErr, setUploadErr]   = useState<string | null>(null)
  const [uploadOk, setUploadOk]     = useState(false)
  const [analyseVorgangId, setAnalyseVorgangId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Build kassenbescheid summary from fall data for AnalyseModal
  const kassenbescheid = {
    id: fall.id,
    bescheiddatum: fall.bescheiddatum,
    referenznummer: fall.referenznummer,
    betragErstattet: fall.betrag_erstattet,
    betragAbgelehnt: fall.betrag_abgelehnt,
    widerspruchEmpfohlen: fall.widerspruch_empfohlen,
    widerspruchStatus: fall.widerspruch_status,
  }

  async function handleFile(file: File) {
    setUploading(true); setUploadErr(null); setUploadOk(false)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/upload/smart', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Fehler')
      setUploadOk(true)
      setTimeout(() => { onUploaded() }, 2500)
    } catch(e) { setUploadErr(String(e)) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  if (vorgaenge.length === 0) {
    return (
      <div>
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

        {/* Primary CTA */}
        <div style={{
          border: `2px dashed #7dd3fc`, background: '#f0f9ff', borderRadius: 10,
          padding: '20px 24px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>
            📄 Arztrechnungen zu diesem Bescheid hochladen
          </div>
          <div style={{ fontSize: 12, color: slate, marginBottom: 14, lineHeight: 1.5 }}>
            Laden Sie die Originalrechnungen hoch, die AXA mit diesem Bescheid abgerechnet hat.
            Die KI erkennt automatisch welche Rechnungen dazugehören und verknüpft sie.
            Danach wird die Handlungsempfehlung deutlich präziser — inkl. GOÄ-Positionsprüfung
            und spezifischer Widerspruchsargumente.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => !uploading && fileRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', cursor: uploading ? 'wait' : 'pointer',
                background: '#0369a1', color: 'white', fontWeight: 700, fontSize: 13,
              }}
            >
              {uploading ? '⏳ KI analysiert…' : '📤 Rechnung hochladen'}
            </button>
            <div style={{ fontSize: 11, color: slate, display: 'flex', alignItems: 'center' }}>
              PDF · KI ordnet automatisch zu
            </div>
          </div>
          {uploadOk && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#065f46', fontWeight: 600 }}>
              ✅ Rechnung hochgeladen — Seite wird aktualisiert…
            </div>
          )}
          {uploadErr && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
              ❌ {uploadErr}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: slate, textAlign: 'center' }}>
          Keine Rechnung zur Hand?{' '}
          <a href="/rechnungen" style={{ color: blue, fontWeight: 600 }}>Alle Rechnungen anzeigen</a>
        </div>
      </div>
    )
  }
  // find the active vorgang for modal
  const activeVorgang = analyseVorgangId ? vorgaenge.find(v => v.id === analyseVorgangId) ?? null : null
  const activeKasseGruppe: KasseRechnungGruppe | null = activeVorgang
    ? (fall.rechnungen.find(r => r.matchedVorgangId === activeVorgang.id) ?? null)
    : null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {vorgaenge.map(v => {
          const einsparpotenzial = (v.goae_analyse?.einsparpotenzial as number | null) ?? 0
          return (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: grey, borderRadius: 9, fontSize: 12, border: '1px solid #e2e8f0' }}>
              <span style={{ color: slate, fontSize: 16 }}>🩺</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: navy }}>{v.arzt_name ?? 'Arzt unbekannt'}</div>
                {v.rechnungsnummer && <div style={{ fontSize: 10, color: slate }}>Rg-Nr: {v.rechnungsnummer}</div>}
              </div>
              {v.rechnungsdatum && <span style={{ color: slate, fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(v.rechnungsdatum)}</span>}
              {v.betrag_gesamt != null && (
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: navy, whiteSpace: 'nowrap' }}>{fmt(v.betrag_gesamt)}</span>
              )}
              {v.kasse_match_status && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#dcfce7', color: '#15803d' }}>
                  ✓ gematcht
                </span>
              )}
              {v.goae_analyse && (
                <button
                  onClick={() => setAnalyseVorgangId(v.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #86efac', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  💡 Analyse
                  {einsparpotenzial > 0 && (
                    <span style={{ background: '#16a34a', color: 'white', padding: '1px 5px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                      {einsparpotenzial.toFixed(0)} €
                    </span>
                  )}
                </button>
              )}
              {v.pdf_storage_path && !v.goae_analyse && (
                <a href={`/rechnungen`}
                  style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: '#f1f5f9', color: slate, textDecoration: 'none', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  → Details
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* AnalyseModal — lazy-loaded, only when a vorgang is selected */}
      {activeVorgang?.goae_analyse && (
        <Suspense fallback={null}>
          <AnalyseModal
            type="rechnung"
            data={activeVorgang.goae_analyse as unknown as ComponentProps<typeof AnalyseModal>['data']}
            kasseGruppe={activeKasseGruppe}
            kasseAnalyseNew={fall.kasse_analyse as KasseAnalyseResult | null}
            kassenbescheid={kassenbescheid}
            onClose={() => setAnalyseVorgangId(null)}
          />
        </Suspense>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── TAB 3: WIDERSPRUCH-THREAD (INLINE, KEIN MODAL) ───────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function WiderspruchBriefNode({
  fall, userName, onStatusChange,
}: {
  fall: FallDossier
  userName: string
  onStatusChange: (status: string) => void
}) {
  const [showBrief, setShowBrief] = useState(false)
  const [copied, setCopied]       = useState(false)
  const { betreff, body }         = generateBrief(fall, userName)
  const [editBetreff, setEditBetreff] = useState(betreff)
  const [editBody, setEditBody]       = useState(body)
  const [localStatus, setLocalStatus] = useState(fall.widerspruch_status)

  const isSent = ['gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt'].includes(localStatus)

  async function toggleStatus() {
    const next = isSent ? 'erstellt' : 'gesendet'
    try {
      const res = await fetch(`/api/kassenabrechnungen/${fall.id}/widerspruch-status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) { setLocalStatus(next); onStatusChange(next) }
    } catch { /* non-critical */ }
  }

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: blue, border: '2px solid white', boxShadow: `0 0 0 2px ${blue}`, marginTop: 4, zIndex: 1 }} />
        <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: blue }}>📤 Du → AXA</span>
          {fall.bescheiddatum && <span style={{ fontSize: 11, color: slate }}>{fmtDate(fall.bescheiddatum)}</span>}
          <button onClick={toggleStatus} style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', border: 'none',
            background: isSent ? mintL : blueL, color: isSent ? '#065f46' : '#1d4ed8',
          }}>
            {isSent ? '✅ Gesendet' : '📋 Entwurf'} ✎
          </button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 6 }}>Widerspruchsbrief an AXA</div>
        <button onClick={() => setShowBrief(v => !v)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: showBrief ? navy : 'white', color: showBrief ? 'white' : slate, cursor: 'pointer', marginBottom: 8 }}>
          {showBrief ? '▲ Brief schließen' : '▼ Brief anzeigen'}
        </button>
        {showBrief && (
          <div style={{ border: `2px solid ${isSent ? '#86efac' : blue}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: isSent ? mintL : blueL, padding: '8px 14px', fontSize: 11, fontWeight: 700, color: isSent ? '#065f46' : '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>An: AXA Krankenversicherung AG</span>
              {isSent && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>🔒 Gesendet — schreibgeschützt</span>}
            </div>
            <div style={{ padding: 12, background: isSent ? '#f0fdf4' : 'white' }}>
              <input value={editBetreff} onChange={e => !isSent && setEditBetreff(e.target.value)}
                disabled={isSent}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${isSent ? '#86efac' : '#e2e8f0'}`, fontSize: 12, color: isSent ? '#374151' : navy, marginBottom: 8, boxSizing: 'border-box', background: isSent ? '#f0fdf4' : 'white', cursor: isSent ? 'not-allowed' : 'text' }} />
              <textarea value={editBody} onChange={e => !isSent && setEditBody(e.target.value)} rows={12}
                disabled={isSent}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${isSent ? '#86efac' : '#e2e8f0'}`, fontSize: 11, color: isSent ? '#374151' : navy, lineHeight: 1.6, fontFamily: 'monospace', resize: isSent ? 'none' : 'vertical', boxSizing: 'border-box', marginBottom: 10, background: isSent ? '#f0fdf4' : 'white', cursor: isSent ? 'not-allowed' : 'text' }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={async () => { await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: copied ? mintL : grey, color: copied ? '#065f46' : navy }}>
                  {copied ? '✓ Kopiert' : '📋 Kopieren'}
                </button>
                <button onClick={() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: blueL, color: '#1d4ed8' }}>
                  In Gmail öffnen
                </button>
                <button onClick={() => window.open(`mailto:?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`)}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: grey, color: navy }}>
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

function ArztBriefNode({ fall, userName }: { fall: FallDossier; userName: string }) {
  const [showBrief, setShowBrief] = useState(false)
  const [copied, setCopied]       = useState(false)
  const { betreff, body }         = generateArztBrief(fall, userName)
  const [editBetreff, setEditBetreff] = useState(betreff)
  const [editBody, setEditBody]       = useState(body)
  const [arztSent, setArztSent]       = useState(fall.arzt_reklamation_status === 'gesendet')

  async function toggleArztStatus() {
    const next = arztSent ? 'erstellt' : 'gesendet'
    try {
      const res = await fetch(`/api/kassenabrechnungen/${fall.id}/widerspruch-status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arzt_status: next }),
      })
      if (res.ok) setArztSent(!arztSent)
    } catch { /* non-critical */ }
  }

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: orange, border: '2px solid white', boxShadow: `0 0 0 2px ${orange}`, marginTop: 4, zIndex: 1 }} />
        <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: orange }}>🩺 Du → Arzt</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
            Anfrage: Rechnungskorrektur
          </span>
          <button onClick={toggleArztStatus} style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', border: 'none',
            background: arztSent ? '#fff7ed' : '#f1f5f9', color: arztSent ? '#c2410c' : slate,
          }}>
            {arztSent ? '✅ Gesendet' : '📋 Entwurf'} ✎
          </button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: navy, marginBottom: 6 }}>Brief an den behandelnden Arzt</div>
        <button onClick={() => setShowBrief(v => !v)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: showBrief ? orange : 'white', color: showBrief ? 'white' : slate, cursor: 'pointer', marginBottom: 8 }}>
          {showBrief ? '▲ Brief schließen' : '▼ Brief anzeigen'}
        </button>
        {showBrief && (
          <div style={{ border: `2px solid ${arztSent ? '#86efac' : orange}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: arztSent ? mintL : '#fff7ed', padding: '8px 14px', fontSize: 11, fontWeight: 700, color: arztSent ? '#065f46' : '#c2410c', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>An: Behandelnder Arzt / Rechnungssteller</span>
              {arztSent && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>🔒 Gesendet — schreibgeschützt</span>}
            </div>
            <div style={{ padding: 12, background: arztSent ? '#f0fdf4' : 'white' }}>
              <input value={editBetreff} onChange={e => !arztSent && setEditBetreff(e.target.value)}
                disabled={arztSent}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${arztSent ? '#86efac' : '#e2e8f0'}`, fontSize: 12, color: arztSent ? '#374151' : navy, marginBottom: 8, boxSizing: 'border-box', background: arztSent ? '#f0fdf4' : 'white', cursor: arztSent ? 'not-allowed' : 'text' }} />
              <textarea value={editBody} onChange={e => !arztSent && setEditBody(e.target.value)} rows={12}
                disabled={arztSent}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${arztSent ? '#86efac' : '#e2e8f0'}`, fontSize: 11, color: arztSent ? '#374151' : navy, lineHeight: 1.6, fontFamily: 'monospace', resize: arztSent ? 'none' : 'vertical', boxSizing: 'border-box', marginBottom: 10, background: arztSent ? '#f0fdf4' : 'white', cursor: arztSent ? 'not-allowed' : 'text' }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={async () => { await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: copied ? '#fff7ed' : grey, color: copied ? '#c2410c' : navy }}>
                  {copied ? '✓ Kopiert' : '📋 Kopieren'}
                </button>
                <button onClick={() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, '_blank')}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#fff7ed', color: '#c2410c' }}>
                  In Gmail öffnen
                </button>
                <button onClick={() => window.open(`mailto:?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`)}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: grey, color: navy }}>
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

function ThreadEntry({
  k, isLast, onDeleted,
}: {
  k: FallKommunikation
  isLast: boolean
  onDeleted: (id: string) => void
}) {
  const [showText, setShowText]   = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [editBetreff, setEditBetreff] = useState(k.ki_vorschlag_betreff ?? '')
  const [editBody, setEditBody]       = useState(k.ki_vorschlag_inhalt ?? '')
  const [copied, setCopied]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const isOutgoing  = k.richtung === 'ausgehend'
  const isKiEntwurf = k.typ === 'ki_entwurf'
  const dotColor    = isKiEntwurf ? '#7c3aed' : isOutgoing ? blue : k.ki_dringlichkeit === 'hoch' ? red : k.ki_dringlichkeit === 'mittel' ? amber : orange

  async function handleDelete() {
    if (!confirm('Nachricht wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/widerspruch-kommunikationen/${k.id}`, { method: 'DELETE' })
      if (res.ok) onDeleted(k.id)
      else console.error('[ThreadEntry] Delete fehlgeschlagen', await res.text())
    } catch { /* non-critical */ } finally { setDeleting(false) }
  }

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: dotColor, border: '2px solid white', boxShadow: `0 0 0 2px ${dotColor}`, marginTop: 4, zIndex: 1 }} />
        {!isLast && <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isKiEntwurf ? '#7c3aed' : isOutgoing ? blue : amber }}>
            {isKiEntwurf
              ? `🤖 KI-Entwurf → ${k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'}`
              : isOutgoing
              ? `📤 Du → ${k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'}`
              : `📥 ${k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt'} → Du`}
          </span>
          <span style={{ fontSize: 11, color: slate }}>{fmtDate(k.datum)}</span>
          {k.ki_dringlichkeit && (!isOutgoing || isKiEntwurf) && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef2f2', color: k.ki_dringlichkeit === 'hoch' ? red : amber }}>
              Dringlichkeit: {k.ki_dringlichkeit}
            </span>
          )}
          {k.ki_naechste_frist && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef2f2', color: red }}>
              📅 Frist: {fmtDate(k.ki_naechste_frist)}
            </span>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Nachricht löschen"
            style={{
              marginLeft: 'auto', padding: '2px 7px', borderRadius: 6, border: '1px solid #fca5a5',
              background: deleting ? '#fef2f2' : 'white', color: deleting ? '#9ca3af' : '#ef4444',
              cursor: deleting ? 'wait' : 'pointer', fontSize: 12, lineHeight: 1,
            }}
          >
            {deleting ? '…' : '🗑'}
          </button>
        </div>
        {k.betreff && <div style={{ fontSize: 12, fontWeight: 600, color: navy, marginBottom: 5 }}>{k.betreff}</div>}
        {(!isOutgoing || isKiEntwurf) && k.ki_analyse && (
          <div style={{ background: isKiEntwurf ? '#f5f3ff' : blueL, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: isKiEntwurf ? '#6d28d9' : '#1e40af', marginBottom: 8, lineHeight: 1.55 }}>
            🤖 {k.ki_analyse}
          </div>
        )}
        <button onClick={() => setShowText(v => !v)} style={{ fontSize: 11, color: slate, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', marginBottom: 6 }}>
          {showText ? '▲ Text einklappen' : '▼ Volltext anzeigen'}
        </button>
        {showText && (
          <div style={{ marginTop: 4, padding: '10px 14px', background: grey, borderRadius: 8, fontSize: 11, color: navy, lineHeight: 1.7, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', marginBottom: 8 }}>
            {k.inhalt}
          </div>
        )}
        {(!isOutgoing || isKiEntwurf) && k.ki_vorschlag_inhalt && (
          <div>
            <button onClick={() => setShowReply(v => !v)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${isKiEntwurf ? '#7c3aed' : amber}`, background: showReply ? (isKiEntwurf ? '#f5f3ff' : amberL) : 'white', color: isKiEntwurf ? '#6d28d9' : '#92400e', cursor: 'pointer', marginBottom: 6 }}>
              {showReply ? '▲ Entwurf schließen' : (isKiEntwurf ? '📝 KI-Entwurf öffnen' : '✉️ KI-Antwortvorlage öffnen')}
            </button>
            {showReply && (
              <div style={{ border: `2px solid ${amber}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: amberL, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                  An: {k.ki_naechster_empfaenger === 'kasse' ? 'AXA Krankenversicherung' : 'Behandelnde/r Arzt/Ärztin'}
                </div>
                <div style={{ padding: 12 }}>
                  <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, color: navy, marginBottom: 8, boxSizing: 'border-box' }} />
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={10}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, color: navy, lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={async () => { await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                      style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: copied ? mintL : grey, color: copied ? '#065f46' : navy }}>
                      {copied ? '✓ Kopiert' : '📋 Kopieren'}
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
        )}
      </div>
    </div>
  )
}

// ── Inline communication form (replaces modal) ─────────────────────────────────
function InlineKommunikationForm({
  fallId, onAdded, onClose,
}: {
  fallId: string
  onAdded: (k: FallKommunikation) => void
  onClose: () => void
}) {
  const [richtung, setRichtung] = useState<'eingehend' | 'ausgehend'>('eingehend')
  const [partner, setPartner] = useState<'kasse' | 'arzt'>('kasse')
  const [inhalt, setInhalt]   = useState('')
  const [betreff, setBetreff] = useState('')
  const [datum, setDatum]     = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfFilename, setPdfFilename] = useState<string | null>(null)
  const [pdfError, setPdfError]       = useState<string | null>(null)
  const [analyseError, setAnalyseError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfLoading(true); setPdfError(null); setPdfFilename(file.name)
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 30_000)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload/kommunikation-pdf', { method: 'POST', body: fd, signal: controller.signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim PDF-Upload')
      setInhalt(data.text)
    } catch (err) {
      setPdfError(err instanceof Error && err.name === 'AbortError' ? 'Timeout – bitte erneut versuchen' : String(err))
      setPdfFilename(null)
    } finally {
      clearTimeout(tid); setPdfLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSubmit() {
    if (!inhalt.trim()) return
    setLoading(true); setAnalyseError(null)
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 60_000)
    try {
      const res = await fetch('/api/widerspruch-kommunikationen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kassenabrechnungen_id: fallId,
          richtung,
          kommunikationspartner: partner,
          typ: richtung === 'ausgehend' ? 'gesendet' : 'antwort',
          datum, betreff, inhalt,
        }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Fehler')
      onAdded(data as FallKommunikation)
      onClose()
    } catch (err) {
      setAnalyseError(err instanceof Error && err.name === 'AbortError' ? 'Timeout – bitte erneut versuchen' : String(err))
    } finally {
      clearTimeout(tid); setLoading(false)
    }
  }

  return (
    <div style={{ border: `2px solid ${richtung === 'ausgehend' ? blue : amber}`, borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ background: richtung === 'ausgehend' ? blueL : amberL, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: richtung === 'ausgehend' ? '#1d4ed8' : '#92400e' }}>
          {richtung === 'ausgehend' ? '📤 Gesendete Kommunikation erfassen' : '📥 Eingegangene Kommunikation erfassen'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: slate, fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: 14, background: 'white' }}>
        {/* Richtung toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['eingehend', 'ausgehend'] as const).map(r => (
            <button key={r} onClick={() => setRichtung(r)} style={{
              flex: 1, padding: '6px 0', borderRadius: 7, border: `1.5px solid ${richtung === r ? (r === 'ausgehend' ? blue : amber) : '#e2e8f0'}`,
              background: richtung === r ? (r === 'ausgehend' ? blueL : amberL) : 'white',
              color: richtung === r ? (r === 'ausgehend' ? '#1d4ed8' : '#92400e') : slate,
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}>
              {r === 'eingehend' ? '📥 Eingegangen (von AXA/Arzt)' : '📤 Gesendet (von mir)'}
            </button>
          ))}
        </div>
        {/* Partner toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['kasse', 'arzt'] as const).map(p => (
            <button key={p} onClick={() => setPartner(p)} style={{
              flex: 1, padding: '6px 0', borderRadius: 7, border: `1.5px solid ${partner === p ? blue : '#e2e8f0'}`,
              background: partner === p ? blueL : 'white', color: partner === p ? '#1d4ed8' : slate,
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}>
              {p === 'kasse'
                ? (richtung === 'ausgehend' ? '📋 An AXA' : '📋 Von AXA')
                : (richtung === 'ausgehend' ? '🩺 An Arzt' : '🩺 Vom Arzt')}
            </button>
          ))}
        </div>

        {/* PDF upload */}
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <button onClick={() => fileRef.current?.click()} disabled={pdfLoading}
            style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 7, border: '1.5px dashed #7dd3fc', background: '#f0f9ff', color: '#0369a1', cursor: 'pointer' }}>
            {pdfLoading ? '⏳ Lese PDF…' : '📎 PDF hochladen'}
          </button>
          {pdfFilename && <span style={{ fontSize: 11, color: mint, fontWeight: 600 }}>✓ {pdfFilename}</span>}
          {pdfError && <span style={{ fontSize: 11, color: red }}>{pdfError}</span>}
        </div>

        {/* Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input value={datum} onChange={e => setDatum(e.target.value)} type="date"
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, color: navy }} />
          <input value={betreff} onChange={e => setBetreff(e.target.value)} placeholder="Betreff (optional)"
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, color: navy }} />
        </div>
        <textarea value={inhalt} onChange={e => setInhalt(e.target.value)}
          placeholder={richtung === 'ausgehend'
            ? 'Inhalt des gesendeten Schreibens — oder oben PDF hochladen'
            : 'Inhalt der eingegangenen Antwort — oder oben PDF hochladen damit KI den Text extrahiert'}
          rows={6}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, color: navy, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />

        {analyseError && (
          <div style={{ marginBottom: 10, padding: '7px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 11, color: '#991b1b' }}>
            {analyseError}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading || !inhalt.trim()}
          style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer',
            background: loading ? '#e2e8f0' : (richtung === 'ausgehend' ? blue : amber), color: loading ? slate : 'white' }}>
          {loading
            ? '⏳ Wird gespeichert…'
            : richtung === 'ausgehend'
            ? '📤 Gesendete Kommunikation erfassen'
            : '🤖 Erfassen & KI analysieren'}
        </button>
      </div>
    </div>
  )
}

function WiderspruchThreadTab({
  fall, userName, widerspruchStatus, onWiderspruchStatusChange,
}: {
  fall: FallDossier
  userName: string
  widerspruchStatus: string
  onWiderspruchStatusChange: (s: string) => void
}) {
  const [lokalKommunikationen, setLokalKommunikationen] = useState<FallKommunikation[]>(fall.kommunikationen)
  const [showInlineForm, setShowInlineForm]   = useState(false)
  const [kiEntwurfLoading, setKiEntwurfLoading] = useState(false)
  const [kiEntwurfError, setKiEntwurfError]     = useState<string | null>(null)

  async function handleKiEntwurf() {
    setKiEntwurfLoading(true); setKiEntwurfError(null)
    try {
      const res = await fetch(`/api/kassenabrechnungen/${fall.id}/ki-entwurf`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'KI-Entwurf fehlgeschlagen')
      setLokalKommunikationen(prev => [...prev, data as FallKommunikation])
    } catch (err) {
      setKiEntwurfError(err instanceof Error ? err.message : String(err))
    } finally {
      setKiEntwurfLoading(false)
    }
  }

  const hasWiderspruch = widerspruchStatus !== 'keiner'
  const allEntries = lokalKommunikationen

  // Detect whether an Arzt-Korrektur brief is needed
  const rechnungen = ((fall.kasse_analyse?.rechnungen ?? []) as Array<{ arztName?: string | null; positionen?: KassePosition[] }>)
  const hasArztAction = rechnungen.some(r =>
    (r.positionen ?? []).some(p => (p as { aktionstyp?: string | null; status?: string }).aktionstyp === 'korrektur_arzt' &&
      (['abgelehnt', 'gekuerzt'].includes((p as { status?: string }).status ?? '')))
  )

  return (
    <div>
      {!hasWiderspruch && (
        <div style={{ textAlign: 'center', padding: 24, color: slate, fontSize: 13 }}>
          Noch kein Widerspruch gestartet. Der Widerspruchsbrief wird automatisch generiert sobald der Bescheid analysiert ist.
        </div>
      )}
      {hasWiderspruch && (
        <div style={{ position: 'relative' }}>
          {/* AXA Widerspruchsbrief */}
          <WiderspruchBriefNode fall={{ ...fall, widerspruch_status: widerspruchStatus }} userName={userName} onStatusChange={onWiderspruchStatusChange} />

          {/* Arzt-Korrekturbrief — wenn Positionen mit aktionstyp=korrektur_arzt vorhanden */}
          {hasArztAction && <ArztBriefNode fall={fall} userName={userName} />}

          {/* Thread entries */}
          {allEntries.map((k, i) => (
            <ThreadEntry
              key={k.id}
              k={k}
              isLast={i === allEntries.length - 1 && !showInlineForm}
              onDeleted={id => setLokalKommunikationen(prev => prev.filter(e => e.id !== id))}
            />
          ))}

          {/* Inline form — appears at thread end, no modal */}
          {showInlineForm ? (
            <InlineKommunikationForm
              fallId={fall.id}
              onAdded={k => {
                setLokalKommunikationen(prev => [...prev, k])
                setShowInlineForm(false)
              }}
              onClose={() => setShowInlineForm(false)}
            />
          ) : (
            <div style={{ paddingLeft: 38, marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setShowInlineForm(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: '1.5px dashed #7dd3fc', background: '#f0f9ff', color: '#0369a1',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}>
                  <span>📨</span> Kommunikation hinzufügen
                </button>
                <button onClick={handleKiEntwurf} disabled={kiEntwurfLoading} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: '1.5px dashed #c4b5fd', background: '#f5f3ff', color: '#6d28d9',
                  fontWeight: 700, fontSize: 12, cursor: kiEntwurfLoading ? 'wait' : 'pointer',
                  opacity: kiEntwurfLoading ? 0.7 : 1,
                }}>
                  {kiEntwurfLoading ? '⏳ KI analysiert…' : '🤖 Neue KI-Handlungsempfehlung'}
                </button>
              </div>
              {kiEntwurfError && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 11, color: '#991b1b' }}>
                  {kiEntwurfError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── FALL DOSSIER CARD ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function FallDossierCard({
  fall, userName,
}: {
  fall: FallDossier
  userName: string
}) {
  const [activeTab, setActiveTab] = useState<'bescheid' | 'rechnungen' | 'widerspruch'>('bescheid')
  const [expanded, setExpanded]   = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  // Lifted from WiderspruchThreadTab so tab-switches don't reset it
  const [localWStatus, setLocalWStatus] = useState(fall.widerspruch_status)

  async function openKassenbescheidPdf() {
    if (!fall.pdf_storage_path) return
    setPdfLoading(true)
    try {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const sb = getSupabaseClient()
      const { data } = await sb.storage.from('rechnungen').createSignedUrl(fall.pdf_storage_path, 300)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    } catch { /* ignore */ } finally { setPdfLoading(false) }
  }

  const status = localWStatus
  const statusCfg = STATUS_CFG[status]
  const quote = fall.betrag_eingereicht > 0 ? (fall.betrag_erstattet / fall.betrag_eingereicht) * 100 : 0
  const hasKomm = fall.kommunikationen.length > 0

  return (
    <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 14, background: 'white' }}>
      {/* ── Card Header ── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ background: '#f8fafc', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: expanded ? '1px solid #e2e8f0' : 'none' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: navy }}>
              {fall.referenznummer ? `AXA ${fall.referenznummer}` : 'AXA Bescheid'}
              {fall.bescheiddatum && <span style={{ fontWeight: 400, color: slate, fontSize: 12, marginLeft: 6 }}>{fmtDate(fall.bescheiddatum)}</span>}
            </span>
            {statusCfg && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: statusCfg.bg, color: statusCfg.color, border: `1.5px solid ${statusCfg.border}` }}>
                {statusCfg.icon} {statusCfg.label}
              </span>
            )}
            {hasKomm && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: amberL, color: '#b45309' }}>
                💬 {fall.kommunikationen.length} Nachricht{fall.kommunikationen.length !== 1 ? 'en' : ''}
              </span>
            )}
            {fall.pdf_storage_path && (
              <button
                onClick={e => { e.stopPropagation(); openKassenbescheidPdf() }}
                disabled={pdfLoading}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                  background: '#f1f5f9', color: slate, border: '1px solid #e2e8f0',
                  cursor: pdfLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
                title="Kassenbescheid-PDF öffnen"
              >
                {pdfLoading ? '⏳' : '📄'} Bescheid-PDF
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: slate, marginTop: 3 }}>
            {fall.vorgaenge.length > 0 && `${fall.vorgaenge.length} Rechnung${fall.vorgaenge.length !== 1 ? 'en' : ''}`}
            {fall.vorgaenge.length > 0 && fall.vorgaenge[0]?.arzt_name && ` · ${fall.vorgaenge.map(v => v.arzt_name).filter(Boolean).join(', ')}`}
          </div>
        </div>

        {/* Amounts */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: slate, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Eingereicht</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: navy, fontFamily: "'DM Serif Display', Georgia, serif" }}>{fmt(fall.betrag_eingereicht)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: slate, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Erstattet</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: mint, fontFamily: "'DM Serif Display', Georgia, serif" }}>{fmt(fall.betrag_erstattet)}</div>
          </div>
          {fall.betrag_abgelehnt > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: slate, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Abgelehnt</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: red, fontFamily: "'DM Serif Display', Georgia, serif" }}>{fmt(fall.betrag_abgelehnt)}</div>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: slate, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quote</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: quoteColor(quote), fontFamily: "'DM Serif Display', Georgia, serif" }}>{quote.toFixed(0)} %</div>
          </div>
          <div style={{ color: slate, fontSize: 14, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      {expanded && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
            {([
              { key: 'bescheid',    label: 'Bescheid & Ablehnungen' },
              { key: 'rechnungen', label: `Rechnungen (${fall.vorgaenge.length})` },
              { key: 'widerspruch', label: `Widerspruch-Thread${fall.kommunikationen.length > 0 ? ` (${fall.kommunikationen.length})` : ''}` },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '9px 16px', fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab.key ? `2px solid ${blue}` : '2px solid transparent',
                color: activeTab === tab.key ? blue : slate,
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <div style={{ padding: '16px', background: 'white' }}>
            {activeTab === 'bescheid' && <BescheidTab fall={fall} onSwitchToRechnungen={() => setActiveTab('rechnungen')} onSwitchToWiderspruch={() => setActiveTab('widerspruch')} />}
            {activeTab === 'rechnungen' && <RechnungenTab fall={fall} onUploaded={() => window.location.reload()} />}
            {activeTab === 'widerspruch' && <WiderspruchThreadTab fall={fall} userName={userName} widerspruchStatus={localWStatus} onWiderspruchStatusChange={setLocalWStatus} />}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── UNVERARBEITET SECTION ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function UnverarbeitetSection({ vorgaenge }: { vorgaenge: UnverarbeitetVorgang[] }) {
  if (vorgaenge.length === 0) return null
  const [expanded, setExpanded] = useState(false)
  const [rematchLoading, setRematchLoading] = useState(false)
  const [rematchMsg, setRematchMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  async function handleRematch(e: React.MouseEvent) {
    e.stopPropagation()
    setRematchLoading(true)
    setRematchMsg(null)
    try {
      const res  = await fetch('/api/vorgaenge/rematch', { method: 'POST' })
      const data = await res.json() as { matched: number; message: string }
      setRematchMsg({ ok: data.matched > 0, text: data.message })
      if (data.matched > 0) setTimeout(() => window.location.reload(), 1800)
    } catch {
      setRematchMsg({ ok: false, text: 'Fehler beim Rematch — bitte erneut versuchen.' })
    } finally {
      setRematchLoading(false)
    }
  }

  return (
    <div style={{ border: '1.5px solid #fde68a', borderRadius: 12, overflow: 'hidden', marginBottom: 14, background: '#fffbeb' }}>
      <div onClick={() => setExpanded(v => !v)} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <span style={{ fontSize: 14 }}>📂</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#78350f' }}>
            Unverarbeitet — {vorgaenge.length} Rechnung{vorgaenge.length !== 1 ? 'en' : ''} ohne Kassenbescheid
          </span>
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>Noch kein Kassenbescheid hochgeladen — oder Zuordnung noch ausstehend</div>
        </div>
        <button
          onClick={handleRematch}
          disabled={rematchLoading}
          title="Zuordnung erneut prüfen"
          style={{
            flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 7,
            border: '1.5px solid #fbbf24', background: rematchLoading ? '#fffbeb' : '#fef9c3',
            color: '#78350f', cursor: rematchLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {rematchLoading ? '⏳ Prüfe…' : '🔄 Zuordnung prüfen'}
        </button>
        <span style={{ color: '#b45309', fontSize: 14 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {rematchMsg && (
        <div style={{
          margin: '0 16px 10px', padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
          background: rematchMsg.ok ? '#f0fdf4' : '#fef2f2',
          color:      rematchMsg.ok ? '#065f46'  : '#991b1b',
          border: `1px solid ${rematchMsg.ok ? '#86efac' : '#fca5a5'}`,
        }}>
          {rematchMsg.ok ? '✅' : 'ℹ️'} {rematchMsg.text}
        </div>
      )}
      {expanded && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {vorgaenge.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'white', borderRadius: 8, fontSize: 12, border: '1px solid #fde68a' }}>
              <span>🩺</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: navy }}>{v.arzt_name ?? 'Arzt unbekannt'}</div>
                {v.rechnungsdatum && <div style={{ fontSize: 10, color: slate }}>{fmtDate(v.rechnungsdatum)}</div>}
              </div>
              {v.betrag_gesamt != null && <span style={{ fontFamily: 'monospace', fontWeight: 700, color: navy }}>{fmt(v.betrag_gesamt)}</span>}
              <a href="/rechnungen" style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: '#f1f5f9', color: slate, textDecoration: 'none', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                → Details
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export default function FaelleDossierClient({
  faelle,
  unverarbeitet,
  isDemo,
}: {
  faelle: FallDossier[]
  unverarbeitet: UnverarbeitetVorgang[]
  isDemo?: boolean
}) {
  const [refreshKey, setRefreshKey] = useState(0)
  // User name fetched once from profile (same pattern as WiderspruchClient)
  const [userName, setUserName] = useState('[Ihr vollständiger Name]')

  // Fetch user name once
  const fetchedRef = useRef(false)
  if (!fetchedRef.current) {
    fetchedRef.current = true
    if (typeof window !== 'undefined') {
      import('@/lib/supabase').then(({ getSupabaseClient }) => {
        const sb = getSupabaseClient()
        sb.auth.getUser().then(({ data: { user } }) => {
          if (!user) return
          sb.from('profiles').select('full_name').eq('id', user.id).single().then(({ data }) => {
            if (data?.full_name) setUserName(data.full_name)
            else if (user.email) {
              const readable = user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              setUserName(readable)
            }
          })
        })
      })
    }
  }

  const handleUploadSuccess = useCallback(() => {
    // Trigger a page reload to pick up new data from server component
    window.location.reload()
  }, [])

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, color: navy, fontWeight: 400, margin: 0 }}>
            Meine Fälle
          </h1>
          <p style={{ color: slate, fontSize: 13, marginTop: 4 }}>
            {isDemo
              ? 'Kassenbescheide, Arztrechnungen & Widersprüche auf einen Blick'
              : `${faelle.length} Fall${faelle.length !== 1 ? 'ä' : ''}lle · Kassenbescheide, Arztrechnungen & Widersprüche auf einen Blick`}
          </p>
        </div>
      </div>

      {/* Summary bar — real data only */}
      {!isDemo && faelle.length > 0 && <SummaryBar faelle={faelle} />}

      {/* ── SMART UPLOAD — always visible, primary CTA in demo mode ──────────── */}
      <div style={isDemo ? {
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        borderRadius: 14,
        padding: '24px 24px 20px',
        marginBottom: 28,
        boxShadow: '0 4px 24px rgba(15,23,42,0.18)',
      } : { marginBottom: 24 }}>
        {isDemo && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 6 }}>
              📤 Ihren ersten Kassenbescheid hochladen
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              Laden Sie einfach ein beliebiges PKV-Dokument hoch — KI erkennt automatisch den Typ
              und legt Ihren ersten echten Fall an. Die Beispieldaten unten verschwinden dann.
            </div>
          </div>
        )}
        <SmartUploadZone onSuccess={handleUploadSuccess} />
      </div>

      {/* ── DEMO SECTION ─────────────────────────────────────────────────────── */}
      {isDemo && (
        <>
          {/* Separator with "Beispieldaten" label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#94a3b8', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 20,
              padding: '4px 14px', whiteSpace: 'nowrap',
            }}>
              Beispieldaten — nicht Ihre echten Daten
            </div>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          </div>

          {/* Demo cards wrapped with muted visual treatment */}
          <div style={{ opacity: 0.72, pointerEvents: 'none', userSelect: 'none' }}>
            {faelle.map(fall => (
              <FallDossierCard key={fall.id} fall={fall} userName={userName} />
            ))}
          </div>
        </>
      )}

      {/* ── REAL DATA ────────────────────────────────────────────────────────── */}
      {!isDemo && (
        <>
          {faelle.map(fall => (
            <FallDossierCard key={fall.id} fall={fall} userName={userName} />
          ))}
          <UnverarbeitetSection vorgaenge={unverarbeitet} />
          {faelle.length === 0 && unverarbeitet.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: slate }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: navy, marginBottom: 8 }}>Noch keine Fälle</div>
              <div style={{ fontSize: 13 }}>Laden Sie oben Ihren ersten Kassenbescheid oder eine Arztrechnung hoch.</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
