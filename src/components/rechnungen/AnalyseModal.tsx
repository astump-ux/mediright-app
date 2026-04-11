'use client'

import type { KasseRechnungGruppe, KasseAnalyseResult } from '@/lib/goae-analyzer'

const navy = '#0f172a'
const mint = '#10b981'
const mintLight = '#d1fae5'
const amber = '#f59e0b'
const amberLight = '#fef3c7'
const red = '#ef4444'
const redLight = '#fee2e2'
const slate = '#64748b'

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
}

interface AnalyseModalProps {
  type: 'rechnung' | 'kasse'
  data: GoaeAnalyse | KasseAnalyse
  kasseGruppe?: KasseRechnungGruppe | null
  kasseAnalyseNew?: KasseAnalyseResult | null
  kassenbescheid?: KassenbescheidSummary | null
  onClose: () => void
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
  if (status === 'gekuerzt') return <span style={{ background: amberLight, color: '#92400e', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⚠ Gekürzt</span>
  return <span style={{ background: redLight, color: '#991b1b', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>✗ Abgelehnt</span>
}

// ── Kassenbescheid section inside GOÄ modal ───────────────────────────────────

function KassenbescheidSection({
  gruppe,
  analyse,
  bescheid,
}: {
  gruppe: KasseRechnungGruppe | null | undefined
  analyse: KasseAnalyseResult | null | undefined
  bescheid: KassenbescheidSummary | null | undefined
}) {
  if (!bescheid && !gruppe) return null

  const erstattet = gruppe?.betragErstattet ?? bescheid?.betragErstattet ?? 0
  const abgelehnt = gruppe?.betragAbgelehnt ?? bescheid?.betragAbgelehnt ?? 0
  const eingereicht = gruppe?.betragEingereicht ?? 0
  const datum = bescheid?.bescheiddatum
    ? new Date(bescheid.bescheiddatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null
  const quote = eingereicht > 0 ? (erstattet / eingereicht) * 100 : null

  const abgelehntePos = gruppe?.positionen?.filter(p => p.status === 'abgelehnt' || p.status === 'gekuerzt') ?? []
  const erfolg = analyse?.widerspruchErfolgswahrscheinlichkeit ?? null
  const schritte = analyse?.naechsteSchritte ?? null
  const widerspruch = analyse?.widerspruchEmpfohlen ?? bescheid?.widerspruchEmpfohlen ?? false
  const begruendung = analyse?.widerspruchBegruendung ?? null

  const erfolgColor = erfolg == null ? slate : erfolg >= 70 ? '#22c55e' : erfolg >= 40 ? amber : red
  const erfolgBg    = erfolg == null ? '#f1f5f9' : erfolg >= 70 ? mintLight : erfolg >= 40 ? amberLight : redLight

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header */}
      <div style={{ fontSize: 13, fontWeight: 700, color: navy, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🏥</span> Kassenbescheid zu dieser Rechnung
        {datum && <span style={{ fontSize: 12, fontWeight: 400, color: slate }}>· {datum}</span>}
        {bescheid?.referenznummer && <span style={{ fontSize: 11, color: slate }}>Ref. {bescheid.referenznummer}</span>}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        <KpiBox label="Eingereicht" value={eingereicht > 0 ? `${eingereicht.toFixed(2)} €` : '—'} />
        <KpiBox label="Erstattet" value={`${erstattet.toFixed(2)} €`} good={erstattet > 0} />
        <KpiBox
          label={quote != null ? `Abgelehnt (${quote.toFixed(0)} % Quote)` : 'Abgelehnt'}
          value={abgelehnt > 0 ? `${abgelehnt.toFixed(2)} €` : '—'}
          warn={abgelehnt > 0}
        />
      </div>

      {/* Abgelehnte Positionen */}
      {abgelehntePos.length > 0 && (
        <div style={{ border: `1px solid #fecaca`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
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
                <tr key={i} style={{ borderTop: '1px solid #fecaca', background: i % 2 === 0 ? 'white' : '#fff5f5' }}>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#991b1b', fontWeight: 600 }}>{pos.ziffer}</td>
                  <td style={{ padding: '6px 10px', color: '#334155' }}>
                    {pos.bezeichnung}
                    {pos.ablehnungsgrund && (
                      <div style={{ fontSize: 11, color: red, marginTop: 2, fontStyle: 'italic' }}>→ {pos.ablehnungsgrund}</div>
                    )}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: slate }}>{pos.betragEingereicht?.toFixed(2)} €</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: pos.betragErstattet > 0 ? amber : red }}>
                    {pos.betragErstattet?.toFixed(2)} €
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'center' }}><StatusBadge status={pos.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ablehnungsgründe */}
      {(analyse?.ablehnungsgruende ?? []).length > 0 && (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>Ablehnungsgründe der Kasse</div>
          {analyse!.ablehnungsgruende!.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: '#475569', marginBottom: 4 }}>
              <span style={{ color: red }}>•</span><span>{g}</span>
            </div>
          ))}
        </div>
      )}

      {/* Widerspruchsanalyse */}
      {widerspruch && (
        <div style={{ background: amberLight, border: `1px solid ${amber}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>⚡ Widerspruch empfohlen</div>
            {erfolg != null && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: erfolgBg, color: erfolgColor }}>
                {erfolg} % Erfolg
              </span>
            )}
          </div>
          {begruendung && (
            <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6, marginBottom: schritte ? 10 : 0 }}>{begruendung}</p>
          )}
          {schritte && schritte.length > 0 && (
            <div>
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
        </div>
      )}
    </div>
  )
}

export default function AnalyseModal({ type, data, kasseGruppe, kasseAnalyseNew, kassenbescheid, onClose }: AnalyseModalProps) {
  const isRechnung = type === 'rechnung'
  const rData = data as GoaeAnalyse
  const kData = data as KasseAnalyse

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
              {isRechnung ? '🔬 GOÄ-Analyse' : '🏥 Kassenabrechnung-Analyse'}
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
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
              {isRechnung ? rData.zusammenfassung : kData.zusammenfassung}
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            {isRechnung ? (
              <>
                <KpiBox label="Gesamtbetrag" value={`${rData.betragGesamt?.toFixed(2) ?? '–'} €`} />
                <KpiBox label="Max. Faktor" value={`${rData.maxFaktor ?? '–'}×`} warn={rData.flagFaktorUeberSchwellenwert} />
                <KpiBox label="Einsparpotenzial" value={`${rData.einsparpotenzial?.toFixed(2) ?? '0.00'} €`} warn={(rData.einsparpotenzial ?? 0) > 0} />
              </>
            ) : (
              <>
                <KpiBox label="Eingereicht" value={`${kData.betragEingereicht?.toFixed(2) ?? '–'} €`} />
                <KpiBox label="Erstattet" value={`${kData.betragErstattet?.toFixed(2) ?? '–'} €`} good />
                <KpiBox label="Abgelehnt" value={`${kData.betragAbgelehnt?.toFixed(2) ?? '–'} €`} warn={(kData.betragAbgelehnt ?? 0) > 0} />
              </>
            )}
          </div>

          {/* Widerspruchsempfehlung (Kasse modal only) */}
          {!isRechnung && kData.widerspruchEmpfohlen && (
            <div style={{ background: amberLight, border: `1px solid ${amber}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 4 }}>
                ⚡ Widerspruch empfohlen
                {kData.widerspruchErfolgswahrscheinlichkeit != null && (
                  <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: kData.widerspruchErfolgswahrscheinlichkeit >= 70 ? mintLight : kData.widerspruchErfolgswahrscheinlichkeit >= 40 ? amberLight : redLight,
                    color: kData.widerspruchErfolgswahrscheinlichkeit >= 70 ? '#065f46' : kData.widerspruchErfolgswahrscheinlichkeit >= 40 ? '#92400e' : '#991b1b'
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

          {/* Flags (Rechnung only) */}
          {isRechnung && (rData.flagFehlendeBegrundung || rData.flagFaktorUeberSchwellenwert) && (
            <div style={{ background: redLight, border: `1px solid ${red}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#991b1b' }}>
              {rData.flagFehlendeBegrundung && <div>⚠ Faktor über 2,3× ohne schriftliche Begründung (§12 GOÄ)</div>}
              {rData.flagFaktorUeberSchwellenwert && !rData.flagFehlendeBegrundung && <div>⚠ Faktor über 2,3-fach Schwellenwert</div>}
            </div>
          )}

          {/* Positionen table */}
          <div style={{ fontSize: 13, fontWeight: 700, color: navy, marginBottom: 10 }}>
            {isRechnung ? `GOÄ-Positionen (${rData.goaePositionen?.length ?? 0})` : `Positionen (${kData.positionen?.length ?? 0})`}
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: slate, fontWeight: 600, width: 70 }}>Ziffer</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: slate, fontWeight: 600 }}>Bezeichnung</th>
                  {isRechnung ? (
                    <>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Faktor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Betrag</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: slate, fontWeight: 600 }}>Status</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Eingereicht</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: slate, fontWeight: 600 }}>Erstattet</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: slate, fontWeight: 600 }}>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {isRechnung
                  ? (rData.goaePositionen ?? []).map((pos, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: navy }}>{pos.ziffer}</td>
                      <td style={{ padding: '8px 12px', color: '#334155' }}>{pos.bezeichnung}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: (pos.faktor ?? 0) > 2.3 ? red : navy }}>{pos.faktor}×</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: navy }}>{pos.betrag?.toFixed(2)} €</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}><FlagBadge flag={pos.flag} /></td>
                    </tr>
                  ))
                  : (kData.positionen ?? []).map((pos, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: navy }}>{pos.ziffer}</td>
                      <td style={{ padding: '8px 12px', color: '#334155' }}>
                        {pos.bezeichnung}
                        {pos.ablehnungsgrund && <div style={{ fontSize: 11, color: red, marginTop: 2 }}>{pos.ablehnungsgrund}</div>}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: navy }}>{pos.betragEingereicht?.toFixed(2)} €</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: mint, fontWeight: 600 }}>{pos.betragErstattet?.toFixed(2)} €</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}><StatusBadge status={pos.status} /></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* Ablehnungsgründe (Kasse modal only) */}
          {!isRechnung && (kData.ablehnungsgruende ?? []).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: navy, marginBottom: 8 }}>Ablehnungsgründe</div>
              {kData.ablehnungsgruende!.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', fontSize: 13, color: '#475569', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ color: red, flexShrink: 0 }}>✗</span>
                  <span>{g}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Kassenbescheid section (GOÄ modal only) ── */}
          {isRechnung && (kassenbescheid || kasseGruppe) && (
            <>
              <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0 20px' }} />
              <KassenbescheidSection
                gruppe={kasseGruppe}
                analyse={kasseAnalyseNew}
                bescheid={kassenbescheid}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiBox({ label, value, warn, good }: { label: string; value: string; warn?: boolean; good?: boolean }) {
  const bg = good ? mintLight : warn ? amberLight : '#f8fafc'
  const color = good ? '#065f46' : warn ? '#92400e' : navy
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: slate, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
