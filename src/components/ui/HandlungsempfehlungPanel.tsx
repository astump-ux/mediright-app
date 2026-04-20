'use client'
import { useState } from 'react'
import { WIDERSPRUCH_ACTIVE_STATUSES } from './WiderspruchStatus'

// ── Design tokens (matches app palette) ──────────────────────────────────────
const amber  = '#f59e0b'
const amberL = '#fffbeb'
const slate  = '#64748b'

interface AnalyseInput {
  widerspruchEmpfohlen?:                boolean | null
  widerspruchErklaerung?:               string  | null
  widerspruchErfolgswahrscheinlichkeit?: number  | null
  naechsteSchritte?:                    string[] | null
  zusammenfassung?:                     string  | null
}

interface HandlungsempfehlungPanelProps {
  analyse:           AnalyseInput | null | undefined
  /** Current Kassenwiderspruch status (null = none started yet) */
  widerspruchStatus?: string | null
  /** Whether the Arztreklamation letter has been sent */
  arztSent?:          boolean
  /** Whether there are korrektur_arzt positions (i.e. an arzt action IS required) */
  hasArztAction?:     boolean
  /** Open by default? (default: true) */
  defaultOpen?:       boolean
}

/**
 * Unified, collapsible Handlungsempfehlung panel.
 *
 * Renders consistently across Rechnungen, Kassenabrechnungen, and Widersprüche.
 * Collapses into a "✓ Alle Maßnahmen eingeleitet" confirmation once all
 * recommended actions (Kassenwiderspruch + Arztreklamation) have been sent.
 */
export default function HandlungsempfehlungPanel({
  analyse,
  widerspruchStatus,
  arztSent    = false,
  hasArztAction = false,
  defaultOpen = true,
}: HandlungsempfehlungPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  const erklaerung       = analyse?.widerspruchErklaerung ?? null
  const erfolg           = analyse?.widerspruchErfolgswahrscheinlichkeit ?? null
  const schritte         = analyse?.naechsteSchritte ?? null
  const zusammenfassung  = analyse?.zusammenfassung ?? null
  const widerspruchEmpf  = analyse?.widerspruchEmpfohlen ?? false

  // Nothing to show
  if (!widerspruchEmpf && !erklaerung && erfolg == null) return null

  // ── "All done" detection ──────────────────────────────────────────────────
  const widerspruchDone = !!widerspruchStatus && WIDERSPRUCH_ACTIVE_STATUSES.includes(widerspruchStatus)
  const arztDone        = !hasArztAction || arztSent
  const allDone         = widerspruchDone && arztDone

  if (allDone) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10,
        background: '#f0fdf4', border: '1.5px solid #86efac',
        fontSize: 12, color: '#15803d', fontWeight: 600,
      }}>
        <span style={{ fontSize: 16 }}>✅</span>
        Alle Maßnahmen eingeleitet — kein weiterer Handlungsbedarf.
      </div>
    )
  }

  // ── Erfolgschance color ───────────────────────────────────────────────────
  const erfolgColor = erfolg == null ? slate
    : erfolg >= 70 ? '#22c55e'
    : erfolg >= 40 ? amber
    : '#ef4444'

  return (
    <div style={{ background: amberL, border: `1.5px solid #fcd34d`, borderRadius: 10, overflow: 'hidden' }}>

      {/* Header — always visible, click to collapse */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>⚡</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Handlungsempfehlung</span>
          {erfolg != null && !open && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
              background: `${erfolgColor}18`, color: erfolgColor,
            }}>
              {erfolg}% Erfolgschance
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#92400e', opacity: 0.6 }}>
          {open ? '▲ einklappen' : '▼ ausklappen'}
        </span>
      </div>

      {/* Body — collapsible */}
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid #fde68a` }}>

          {/* Summary */}
          {zusammenfassung && (
            <div style={{
              fontSize: 12, color: '#334155', lineHeight: 1.6,
              padding: '8px 10px', background: 'white', borderRadius: 8,
              margin: '10px 0',
            }}>
              {zusammenfassung}
            </div>
          )}

          {/* Erfolgschance + Erklärung */}
          {(erfolg != null || erklaerung) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '10px 0' }}>
              {erfolg != null && (
                <div style={{
                  flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: 'white', borderRadius: 10, padding: '6px 14px',
                  border: `1.5px solid ${erfolgColor}`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: erfolgColor, lineHeight: 1 }}>{erfolg}%</div>
                  <div style={{ fontSize: 10, color: slate, marginTop: 2 }}>Erfolgschance</div>
                </div>
              )}
              {erklaerung && (
                <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6, margin: 0, flex: 1 }}>{erklaerung}</p>
              )}
            </div>
          )}

          {/* Nächste Schritte */}
          {schritte && schritte.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#92400e',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
              }}>
                Nächste Schritte
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {schritte.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                      background: amber, color: 'white', fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
