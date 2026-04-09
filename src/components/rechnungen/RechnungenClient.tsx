'use client'

import { useState } from 'react'
import AnalyseModal from './AnalyseModal'

const navy = '#0f172a'
const mint = '#10b981'
const mintLight = '#d1fae5'
const amber = '#f59e0b'
const amberLight = '#fef3c7'
const red = '#ef4444'
const redLight = '#fee2e2'
const slate = '#64748b'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  erstattet: { bg: mintLight, color: '#065f46', label: 'Erstattet' },
  abgelehnt: { bg: redLight, color: '#991b1b', label: 'Abgelehnt' },
  pruefen:   { bg: amberLight, color: '#92400e', label: 'Prüfen' },
  offen:     { bg: '#f1f5f9', color: slate, label: 'Offen' },
}

interface VorgangRow {
  id: string
  datum: string
  arzt: string
  fachrichtung: string
  betrag: number
  betragErstattet?: number
  einsparpotenzial?: number
  status: string
  flagged?: boolean
  flagReason?: string
  faktor?: number
  goaZiffern?: string[]
  hasPdf: boolean
  hasKassePdf: boolean
  claudeAnalyse?: Record<string, unknown> | null
  kasseAnalyse?: Record<string, unknown> | null
}

async function getSignedUrl(vorgangId: string, type: 'pdf' | 'kasse-pdf'): Promise<string | null> {
  const res = await fetch(`/api/vorgaenge/${vorgangId}/${type}`)
  if (!res.ok) return null
  const { url } = await res.json()
  return url
}

function ActionBtn({ label, icon, onClick, disabled, variant = 'default' }: {
  label: string; icon: string; onClick: () => void; disabled?: boolean; variant?: 'default' | 'mint' | 'blue' | 'amber'
}) {
  const colors = {
    default: { bg: '#f1f5f9', color: slate },
    mint:    { bg: mintLight, color: '#059669' },
    blue:    { bg: '#eff6ff', color: '#1d4ed8' },
    amber:   { bg: amberLight, color: '#92400e' },
  }
  const c = colors[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
        borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#f1f5f9' : c.bg, color: disabled ? '#cbd5e1' : c.color,
        fontSize: 12, fontWeight: 600, transition: 'opacity 0.15s',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export default function RechnungenClient({ vorgaenge }: { vorgaenge: VorgangRow[] }) {
  const [modal, setModal] = useState<{ type: 'rechnung' | 'kasse'; data: Record<string, unknown> } | null>(null)
  const [downloading, setDownloading] = useState<string>('')

  async function handleDownload(id: string, type: 'pdf' | 'kasse-pdf') {
    setDownloading(`${id}-${type}`)
    const url = await getSignedUrl(id, type)
    setDownloading('')
    if (url) {
      window.open(url, '_blank')
    } else {
      alert('PDF konnte nicht geladen werden.')
    }
  }

  if (vorgaenge.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: 16, color: slate }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>📄</div>
      <p style={{ fontSize: 16, marginBottom: 8 }}>Noch keine Rechnungen vorhanden.</p>
      <p style={{ fontSize: 14 }}>Leiten Sie Ihre erste Rechnung per WhatsApp an <strong>+1 415 523 8886</strong> weiter.</p>
    </div>
  )

  return (
    <>
      {modal && (
        <AnalyseModal
          type={modal.type}
          data={modal.data}
          onClose={() => setModal(null)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {vorgaenge.map(v => {
          const s = STATUS_STYLES[v.status] ?? STATUS_STYLES.offen
          const isDownloading = downloading.startsWith(v.id)

          return (
            <div key={v.id} style={{
              background: 'white', borderRadius: 14, padding: '16px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
              borderLeft: v.flagged ? `4px solid ${red}` : `4px solid transparent`,
            }}>
              {/* Row 1: Main info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, color: navy, fontSize: 15 }}>{v.arzt}</div>
                  <div style={{ color: slate, fontSize: 13, marginTop: 2 }}>
                    {v.fachrichtung} · {v.datum}
                    {v.faktor && <span style={{ marginLeft: 8, color: (v.faktor > 2.3) ? red : slate }}>Faktor {v.faktor}×</span>}
                  </div>
                  {v.flagReason && (
                    <div style={{ fontSize: 12, color: red, marginTop: 3 }}>⚠ {v.flagReason}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 17, color: navy }}>{v.betrag.toFixed(2)} €</div>
                  {v.betragErstattet != null && (
                    <div style={{ fontSize: 12, color: mint, fontWeight: 600 }}>↳ {v.betragErstattet.toFixed(2)} € erstattet</div>
                  )}
                  {(v.einsparpotenzial ?? 0) > 0 && (
                    <div style={{ fontSize: 12, color: amber }}>💡 {v.einsparpotenzial!.toFixed(2)} € Potenzial</div>
                  )}
                </div>
              </div>

              {/* GOÄ Ziffern */}
              {(v.goaZiffern ?? []).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {v.goaZiffern!.map(z => (
                    <span key={z} style={{ background: '#f1f5f9', color: slate, fontSize: 11, padding: '2px 8px', borderRadius: 20, fontFamily: 'monospace' }}>{z}</span>
                  ))}
                </div>
              )}

              {/* Row 2: Status + Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                {/* Status */}
                <span style={{ background: s.bg, color: s.color, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                  {s.label}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {/* Arztrechnung */}
                  <ActionBtn
                    icon="⬇" label="Rechnung PDF"
                    disabled={!v.hasPdf || isDownloading}
                    variant="mint"
                    onClick={() => handleDownload(v.id, 'pdf')}
                  />
                  {v.claudeAnalyse && (
                    <ActionBtn
                      icon="🔬" label="GOÄ-Analyse"
                      variant="blue"
                      onClick={() => setModal({ type: 'rechnung', data: v.claudeAnalyse! })}
                    />
                  )}

                  {/* Divider */}
                  <span style={{ width: 1, background: '#e2e8f0', margin: '0 4px' }} />

                  {/* Kassenabrechnung */}
                  {v.hasKassePdf ? (
                    <>
                      <ActionBtn
                        icon="⬇" label="Kassenabrechnung"
                        disabled={isDownloading}
                        variant="amber"
                        onClick={() => handleDownload(v.id, 'kasse-pdf')}
                      />
                      {v.kasseAnalyse && (
                        <ActionBtn
                          icon="🏥" label="Kassen-Analyse"
                          variant="amber"
                          onClick={() => setModal({ type: 'kasse', data: v.kasseAnalyse! })}
                        />
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: '#94a3b8', padding: '5px 0' }}>
                      Kassenabrechnung: WhatsApp mit „KK" + PDF
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
