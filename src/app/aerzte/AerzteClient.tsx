'use client'

import { useState } from 'react'
import Link from 'next/link'

// ── Types (exported so page.tsx can use them) ─────────────────────────────────
export interface GoaMusterItem {
  ziffer: string
  bezeichnung: string
  haeufigkeit: number
  avgFaktor: number
  axaAblehnungsrate: number | null
  risiko: 'ok' | 'pruefe' | 'hoch'
}
export interface VerlaufPunkt {
  datum: string
  betrag: number
  erstattet: number | null
  abgelehnt: number | null
  ablehnungsquote: number | null
  hasBescheid: boolean
}
export interface OffeneAktion {
  typ: string
  label: string
  href: string
  prioritaet: 'hoch' | 'mittel' | 'niedrig'
}
export interface BenchmarkData {
  thisArzt: number
  vergleichswert: number
  label: string
  quelle: string
}
export interface ArztAkteData {
  id: string
  name: string
  fachrichtung: string
  ersterBesuch: string
  letzterBesuch: string
  besuche: number
  gesamtBetrag: number
  eingereichtBeiKasse: number
  erstattetVonKasse: number
  abgelehntVonKasse: number
  ablehnungsquote: number
  hatKassenbescheid: boolean
  verlauf: VerlaufPunkt[]
  goaMuster: GoaMusterItem[]
  benchmarkFachgruppe: BenchmarkData | null
  benchmarkKasse: BenchmarkData | null
  offeneAktionen: OffeneAktion[]
  flagged: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 })
}
function ablehnungsColor(q: number, benchmarkAvg?: number): string {
  const threshold = benchmarkAvg ?? 15
  if (q === 0) return '#059669'
  if (q <= threshold) return '#059669'
  if (q <= threshold + 10) return '#d97706'
  return '#b91c1c'
}
function ablehnungsBg(q: number, benchmarkAvg?: number): string {
  const threshold = benchmarkAvg ?? 15
  if (q === 0) return '#d1fae5'
  if (q <= threshold) return '#d1fae5'
  if (q <= threshold + 10) return '#fef3c7'
  return '#fee2e2'
}

// ── FACH_META for icons ───────────────────────────────────────────────────────
const FACH_ICON: Record<string, string> = {
  'Innere Medizin': '❤️', 'Kardiologie': '💓', 'Labordiagnostik': '🔬',
  'Dermatologie': '🧬', 'Augenheilkunde': '👁️', 'Orthopädie': '🦴',
  'Neurologie': '🧠', 'Psychiatrie': '🧠', 'Gynäkologie': '🌸',
  'Urologie': '💊', 'Radiologie': '📡', 'Allgemeinmedizin': '🏥',
  'Zahnarzt': '🦷', 'Gastroenterologie': '🔬',
}

// ── Verlauf Chart (SVG mini) ──────────────────────────────────────────────────
function VerlaufChart({ verlauf }: { verlauf: VerlaufPunkt[] }) {
  const withBescheid = verlauf.filter(v => v.hasBescheid && v.ablehnungsquote !== null)

  if (withBescheid.length === 0) {
    return (
      <div
        className="rounded-xl p-4 text-center text-xs"
        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8' }}
      >
        Verlauf wird aktiv sobald Kassenbescheide vorliegen
      </div>
    )
  }

  const W = 400; const H = 80; const PAD = 20
  const maxQ = Math.max(100, ...withBescheid.map(v => v.ablehnungsquote!))
  const xs = withBescheid.map((_, i) =>
    withBescheid.length === 1 ? W / 2 : PAD + (i / (withBescheid.length - 1)) * (W - PAD * 2)
  )
  const ys = withBescheid.map(v =>
    H - PAD - ((v.ablehnungsquote! / maxQ) * (H - PAD * 2))
  )

  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ')

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>
          Ablehnungsquote je Besuch
        </span>
        <span className="text-[10px]" style={{ color: '#94a3b8' }}>
          {verlauf.filter(v => !v.hasBescheid).length > 0
            ? `${verlauf.filter(v => !v.hasBescheid).length} ohne Bescheid`
            : ''}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        {/* Gridlines */}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 80 }} preserveAspectRatio="none">
          {[20, 40, 60].map(pct => {
            const y = H - PAD - ((pct / maxQ) * (H - PAD * 2))
            return (
              <g key={pct}>
                <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
              </g>
            )
          })}
          {/* Line */}
          {withBescheid.length > 1 && (
            <path d={pathD} fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
          )}
          {/* Dots */}
          {withBescheid.map((v, i) => {
            const q = v.ablehnungsquote!
            const col = q === 0 ? '#10b981' : q <= 20 ? '#10b981' : q <= 40 ? '#f59e0b' : '#ef4444'
            return (
              <g key={i}>
                <circle cx={xs[i]} cy={ys[i]} r="5" fill={col} />
                <circle cx={xs[i]} cy={ys[i]} r="8" fill={col} fillOpacity="0.15" />
              </g>
            )
          })}
        </svg>
        {/* X-axis labels */}
        <div className="flex px-4 pb-2" style={{ marginTop: -4 }}>
          {withBescheid.map((v, i) => (
            <div
              key={i}
              className="text-[10px] text-center"
              style={{
                flex: 1,
                color: '#94a3b8',
                textAlign: withBescheid.length === 1 ? 'center' : i === 0 ? 'left' : i === withBescheid.length - 1 ? 'right' : 'center'
              }}
            >
              {v.datum}
            </div>
          ))}
        </div>
        {/* Single point annotation */}
        {withBescheid.length === 1 && (
          <div className="text-center pb-2 text-[10px]" style={{ color: '#94a3b8' }}>
            Erster Bescheid · Verlauf entsteht nach weiteren Besuchen
          </div>
        )}
      </div>
    </div>
  )
}

// ── Benchmark Bar ─────────────────────────────────────────────────────────────
function BenchmarkBar({ label, thisArzt, vergleichswert, quelle, hatBescheid }: {
  label: string; thisArzt: number; vergleichswert: number; quelle: string; hatBescheid: boolean
}) {
  const maxVal  = Math.max(thisArzt, vergleichswert, 30) * 1.3
  const thisW   = Math.round((thisArzt / maxVal) * 100)
  const benchW  = Math.round((vergleichswert / maxVal) * 100)
  const diff    = thisArzt - vergleichswert
  const isHigh  = diff > 10
  const isSlightly = diff > 0 && diff <= 10
  const thisColor = isHigh ? '#ef4444' : isSlightly ? '#f59e0b' : '#10b981'

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold" style={{ color: '#475569' }}>{label}</span>
        {hatBescheid && diff !== 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: isHigh ? '#fee2e2' : isSlightly ? '#fef3c7' : '#d1fae5',
              color: isHigh ? '#b91c1c' : isSlightly ? '#92400e' : '#065f46',
            }}
          >
            {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} pp {diff > 0 ? '▲' : '▼'}
          </span>
        )}
      </div>

      {hatBescheid ? (
        <div className="space-y-1.5">
          {/* This doctor */}
          <div className="flex items-center gap-2">
            <div className="text-[10px] w-24 text-right flex-shrink-0" style={{ color: '#64748b' }}>Dieser Arzt</div>
            <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
              <div
                className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-1.5"
                style={{ width: `${thisW}%`, background: thisColor }}
              >
                <span className="text-[9px] text-white font-bold">{thisArzt}%</span>
              </div>
            </div>
          </div>
          {/* Benchmark */}
          <div className="flex items-center gap-2">
            <div className="text-[10px] w-24 text-right flex-shrink-0" style={{ color: '#94a3b8' }}>Benchmark</div>
            <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
              <div
                className="h-full rounded-full flex items-center justify-end pr-1.5"
                style={{ width: `${benchW}%`, background: '#94a3b8' }}
              >
                <span className="text-[9px] text-white font-bold">{vergleichswert.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
          style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#94a3b8' }}
        >
          <span>⏳</span>
          <span>Benchmark wird aktiv sobald ein Kassenbescheid für diesen Arzt vorliegt</span>
        </div>
      )}

      {hatBescheid && (
        <div className="text-[9px] mt-1" style={{ color: '#cbd5e1' }}>Quelle: {quelle}</div>
      )}
    </div>
  )
}

// ── GOÄ Muster Tabelle ───────────────────────────────────────────────────────
function GoaMusterTabelle({ muster }: { muster: GoaMusterItem[] }) {
  if (muster.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: '1px solid #e2e8f0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>GOÄ</th>
            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Leistung</th>
            <th className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Häufigkeit</th>
            <th className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Ø Faktor</th>
            <th className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>AXA Ablehnung</th>
          </tr>
        </thead>
        <tbody>
          {muster.map((item, i) => {
            const risikoColor = item.risiko === 'hoch' ? '#b91c1c' : item.risiko === 'pruefe' ? '#d97706' : '#059669'
            const risikoIcon  = item.risiko === 'hoch' ? '🔴' : item.risiko === 'pruefe' ? '🟡' : '🟢'
            const ablehnColor = item.axaAblehnungsrate === null ? '#94a3b8'
              : item.axaAblehnungsrate > 50 ? '#b91c1c'
              : item.axaAblehnungsrate > 20 ? '#d97706'
              : '#059669'

            return (
              <tr
                key={item.ziffer}
                style={{
                  borderBottom: i < muster.length - 1 ? '1px solid #f1f5f9' : undefined,
                  background: item.risiko === 'hoch' ? 'rgba(254,242,242,0.4)' : undefined,
                }}
              >
                <td className="px-3 py-2">
                  <span
                    className="font-mono font-bold text-[11px] px-2 py-0.5 rounded"
                    style={{ background: '#f1f5f9', color: risikoColor }}
                  >
                    {item.ziffer} {risikoIcon}
                  </span>
                </td>
                <td className="px-3 py-2" style={{ color: '#374151', maxWidth: 180 }}>
                  <span className="truncate block" title={item.bezeichnung}>{item.bezeichnung}</span>
                </td>
                <td className="px-3 py-2 text-center font-semibold" style={{ color: '#0f172a' }}>
                  {item.haeufigkeit}×
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className="font-bold text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      background: item.avgFaktor > 3.5 ? '#fee2e2' : item.avgFaktor > 2.3 ? '#fef3c7' : '#d1fae5',
                      color: item.avgFaktor > 3.5 ? '#b91c1c' : item.avgFaktor > 2.3 ? '#92400e' : '#065f46',
                    }}
                  >
                    {item.avgFaktor}×
                  </span>
                </td>
                <td className="px-3 py-2 text-center font-bold text-[11px]" style={{ color: ablehnColor }}>
                  {item.axaAblehnungsrate === null ? '—' : `${item.axaAblehnungsrate}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Aktionszentrum ─────────────────────────────────────────────────────────────
function Aktionszentrum({ aktionen }: { aktionen: OffeneAktion[] }) {
  if (aktionen.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}
      >
        <span>✅</span>
        <span className="font-medium">Keine offenen Aktionen für diesen Arzt</span>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {aktionen.map((a, i) => (
        <Link
          key={i}
          href={a.href}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all hover:opacity-90"
          style={{
            background: a.prioritaet === 'hoch' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${a.prioritaet === 'hoch' ? '#fca5a5' : '#fde68a'}`,
            color: a.prioritaet === 'hoch' ? '#b91c1c' : '#92400e',
            textDecoration: 'none',
          }}
        >
          <span className="flex-shrink-0">{a.prioritaet === 'hoch' ? '⚠️' : '⏰'}</span>
          <span className="flex-1">{a.label}</span>
          <span style={{ color: 'rgba(0,0,0,0.3)' }}>→</span>
        </Link>
      ))}
    </div>
  )
}

// ── Ärzteakte (expanded detail) ───────────────────────────────────────────────
function ArztAkte({ arzt, kasseName }: { arzt: ArztAkteData; kasseName: string }) {
  const benchAvg = arzt.benchmarkFachgruppe?.vergleichswert

  return (
    <div className="mt-4 space-y-5">
      {/* ── KPI Strip ── */}
      <div
        className="grid gap-0 overflow-hidden rounded-xl"
        style={{ border: '1px solid #e2e8f0', gridTemplateColumns: 'repeat(4, 1fr)' }}
      >
        {[
          { label: 'Besuche', value: `${arzt.besuche}×`, sub: `seit ${arzt.ersterBesuch}` },
          { label: 'Gesamt eingereicht', value: arzt.hatKassenbescheid ? `€ ${fmt(arzt.eingereichtBeiKasse)}` : `€ ${fmt(arzt.gesamtBetrag)}`, sub: arzt.hatKassenbescheid ? 'bei Kasse' : 'Rechnungssumme' },
          { label: 'Erstattet', value: arzt.hatKassenbescheid ? `€ ${fmt(arzt.erstattetVonKasse)}` : '—', sub: arzt.hatKassenbescheid ? 'durch Kasse' : 'Kein Bescheid' },
          {
            label: 'Ablehnungsquote',
            value: arzt.hatKassenbescheid ? `${arzt.ablehnungsquote}%` : '—',
            sub: arzt.hatKassenbescheid && benchAvg ? `Ø ${arzt.fachrichtung}: ${benchAvg?.toFixed(1)}%` : 'Kein Bescheid',
            valueColor: arzt.hatKassenbescheid ? ablehnungsColor(arzt.ablehnungsquote, benchAvg) : '#94a3b8',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="px-4 py-3 text-center"
            style={{
              borderRight: i < 3 ? '1px solid #e2e8f0' : undefined,
              background: i % 2 === 0 ? '#ffffff' : '#fafafa',
            }}
          >
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{kpi.label}</div>
            <div
              className="font-bold text-base italic"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: (kpi as { valueColor?: string }).valueColor ?? '#0f172a' }}
            >
              {kpi.value}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: '#cbd5e1' }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Verlauf ── */}
      <div>
        <SectionLabel>Verlauf</SectionLabel>
        <VerlaufChart verlauf={arzt.verlauf} />
      </div>

      {/* ── GOÄ Muster ── */}
      {arzt.goaMuster.length > 0 && (
        <div>
          <SectionLabel>GOÄ-Muster</SectionLabel>
          <GoaMusterTabelle muster={arzt.goaMuster} />
          <div className="text-[10px] mt-1.5 flex gap-3" style={{ color: '#94a3b8' }}>
            <span>🟢 Regelfall (≤2,3×)</span>
            <span>🟡 Begründungspflichtig (&gt;2,3×)</span>
            <span>🔴 Hochrisiko (&gt;3,5× oder AXA-Risiko)</span>
          </div>
        </div>
      )}

      {/* ── Benchmarks ── */}
      {(arzt.benchmarkFachgruppe || arzt.benchmarkKasse) && (
        <div>
          <SectionLabel>Ablehnungsquote Vergleich</SectionLabel>
          <div className="rounded-xl p-4 space-y-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            {arzt.benchmarkFachgruppe && (
              <BenchmarkBar
                label={`Fachgruppe: ${arzt.fachrichtung}`}
                thisArzt={arzt.benchmarkFachgruppe.thisArzt}
                vergleichswert={arzt.benchmarkFachgruppe.vergleichswert}
                quelle={arzt.benchmarkFachgruppe.quelle}
                hatBescheid={arzt.hatKassenbescheid}
              />
            )}
            {arzt.benchmarkKasse && (
              <BenchmarkBar
                label={`${kasseName} gesamt`}
                thisArzt={arzt.benchmarkKasse.thisArzt}
                vergleichswert={arzt.benchmarkKasse.vergleichswert}
                quelle={arzt.benchmarkKasse.quelle}
                hatBescheid={arzt.hatKassenbescheid}
              />
            )}
            <p className="text-[10px] pt-1" style={{ color: '#94a3b8' }}>
              Abweichungen über +10 pp sind ein Hinweis auf systematische Ablehnung,
              die unabhängig vom Abrechnungsverhalten des Arztes sein kann — und damit
              ein starkes Widerspruchsargument.
            </p>
          </div>
        </div>
      )}

      {/* ── Offene Aktionen ── */}
      <div>
        <SectionLabel>Offene Aktionen</SectionLabel>
        <Aktionszentrum aktionen={arzt.offeneAktionen} />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>
      {children}
    </div>
  )
}

// ── Arzt Card (collapsed + expanded) ─────────────────────────────────────────
function ArztCard({ arzt, defaultOpen, kasseName }: {
  arzt: ArztAkteData; defaultOpen: boolean; kasseName: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const icon  = FACH_ICON[arzt.fachrichtung] ?? '💊'
  const benchAvg = arzt.benchmarkFachgruppe?.vergleichswert
  const qColor = ablehnungsColor(arzt.ablehnungsquote, benchAvg)
  const qBg    = ablehnungsBg(arzt.ablehnungsquote, benchAvg)

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{ border: `1px solid ${arzt.flagged ? '#fca5a5' : '#e2e8f0'}`, background: '#ffffff' }}
    >
      {/* ── Collapsed header (always visible) ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4 flex items-center gap-4"
        style={{ background: arzt.flagged ? '#fff5f5' : '#ffffff', cursor: 'pointer', border: 'none' }}
      >
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: '#f1f5f9' }}
        >
          {icon}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base leading-tight" style={{ color: '#0f172a' }}>
            {arzt.name}
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: '#64748b' }}>
            <span>{arzt.fachrichtung}</span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span>{arzt.besuche} Besuch{arzt.besuche !== 1 ? 'e' : ''}</span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span>Letzter Besuch: {arzt.letzterBesuch}</span>
          </div>
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {arzt.flagged && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
              ⚠ GOÄ-Auffälligkeit
            </span>
          )}
          {arzt.hatKassenbescheid ? (
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: qBg, color: qColor }}
            >
              {arzt.ablehnungsquote === 0 ? '✓ 0%' : `${arzt.ablehnungsquote}%`} Ablehnung
            </span>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
              Kein Bescheid
            </span>
          )}
          {/* Total */}
          <div className="text-right hidden sm:block">
            <div
              className="text-lg italic leading-tight"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: '#0f172a' }}
            >
              € {fmt(arzt.gesamtBetrag)}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: '#94a3b8' }}>Gesamt</div>
          </div>
          {/* Expand arrow */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs transition-transform duration-200 flex-shrink-0"
            style={{ background: '#f1f5f9', color: '#64748b', transform: open ? 'rotate(180deg)' : undefined }}
          >
            ▾
          </div>
        </div>
      </button>

      {/* ── Expanded Ärzteakte ── */}
      {open && (
        <div className="px-5 pb-6 pt-1" style={{ borderTop: '1px solid #f1f5f9' }}>
          <ArztAkte arzt={arzt} kasseName={kasseName} />
        </div>
      )}
    </div>
  )
}

// ── Ghost card for "add doctor" ────────────────────────────────────────────────
function GhostCard() {
  return (
    <Link
      href="/rechnungen"
      className="rounded-2xl flex flex-col items-center justify-center py-8 gap-2 transition-all hover:opacity-80"
      style={{
        border: '2px dashed #cbd5e1', background: '#fafafa', textDecoration: 'none',
        minHeight: 80,
      }}
    >
      <div className="text-2xl" style={{ opacity: 0.4 }}>➕</div>
      <div className="text-sm font-semibold" style={{ color: '#94a3b8' }}>Weitere Arztrechnung hochladen</div>
      <div className="text-[11px]" style={{ color: '#cbd5e1' }}>Neue Ärzteakte wird automatisch angelegt</div>
    </Link>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div
      className="rounded-2xl p-10 text-center"
      style={{ border: '2px dashed #cbd5e1', background: '#fafafa' }}
    >
      <div className="text-4xl mb-3">🩺</div>
      <h3 className="text-lg font-bold mb-2" style={{ color: '#0f172a', fontFamily: "'DM Serif Display', Georgia, serif" }}>
        Noch keine Ärzte erfasst
      </h3>
      <p className="text-sm mb-5" style={{ color: '#64748b', maxWidth: 320, margin: '0 auto 20px' }}>
        Laden Sie Ihre erste Arztrechnung hoch — die Ärzteakte mit GOÄ-Muster, Verlauf und Benchmarks wird automatisch angelegt.
      </p>
      <Link
        href="/rechnungen"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white text-sm"
        style={{ background: 'var(--mint)', textDecoration: 'none' }}
      >
        📤 Erste Rechnung hochladen
      </Link>
    </div>
  )
}

// ── Page-level KPI Strip ──────────────────────────────────────────────────────
function PageKpiStrip({ aerzte, kasseName }: { aerzte: ArztAkteData[]; kasseName: string }) {
  const totalEingereicht  = aerzte.reduce((s, a) => s + a.eingereichtBeiKasse, 0)
  const totalAbgelehnt    = aerzte.reduce((s, a) => s + a.abgelehntVonKasse, 0)
  const avgAblehnung      = totalEingereicht > 0
    ? Math.round((totalAbgelehnt / totalEingereicht) * 100)
    : null
  const mitBescheid       = aerzte.filter(a => a.hatKassenbescheid).length
  const offeneAktionen    = aerzte.reduce((s, a) => s + a.offeneAktionen.length, 0)

  const kpis = [
    { label: 'Ärzte',                value: `${aerzte.length}`, sub: `${mitBescheid} mit Kassenbescheid` },
    { label: 'Eingereicht gesamt',   value: totalEingereicht > 0 ? `€ ${fmt(totalEingereicht)}` : '—', sub: `bei ${kasseName}` },
    { label: 'Ø Ablehnungsquote',    value: avgAblehnung !== null ? `${avgAblehnung}%` : '—', sub: 'über alle Ärzte', valueColor: avgAblehnung != null ? ablehnungsColor(avgAblehnung) : '#94a3b8' },
    { label: 'Offene Aktionen',      value: `${offeneAktionen}`, sub: offeneAktionen > 0 ? 'Handlungsbedarf' : 'Alles erledigt', valueColor: offeneAktionen > 0 ? '#d97706' : '#059669' },
  ]

  return (
    <div
      className="rounded-2xl overflow-hidden mb-6"
      style={{ background: 'var(--navy)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}
    >
      {kpis.map((kpi, i) => (
        <div
          key={i}
          className="px-5 py-4 text-center"
          style={{ borderRight: i < 3 ? '1px solid rgba(255,255,255,0.08)' : undefined }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {kpi.label}
          </div>
          <div
            className="text-2xl italic font-normal"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: (kpi as { valueColor?: string }).valueColor ?? 'var(--mint)' }}
          >
            {kpi.value}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{kpi.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── Priority Banner ───────────────────────────────────────────────────────────
function PrioritaetsBanner({ aerzte }: { aerzte: ArztAkteData[] }) {
  const mitAktionen = aerzte.filter(a => a.offeneAktionen.length > 0)
  if (mitAktionen.length === 0) return null

  const hochCount = aerzte
    .flatMap(a => a.offeneAktionen)
    .filter(a => a.prioritaet === 'hoch').length

  return (
    <div
      className="rounded-xl px-5 py-3 mb-5 flex items-center gap-3"
      style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
    >
      <span className="text-lg">⚠️</span>
      <div className="flex-1">
        <span className="font-bold text-sm" style={{ color: '#92400e' }}>
          {mitAktionen.length} {mitAktionen.length === 1 ? 'Arzt braucht' : 'Ärzte brauchen'} Ihre Aufmerksamkeit
        </span>
        {hochCount > 0 && (
          <span className="text-xs ml-2" style={{ color: '#b45309' }}>
            · {hochCount} Aktion{hochCount > 1 ? 'en' : ''} hoher Priorität
          </span>
        )}
      </div>
      <div className="text-xs flex gap-2 flex-wrap">
        {mitAktionen.slice(0, 3).map(a => (
          <span
            key={a.id}
            className="px-2 py-0.5 rounded-full font-medium"
            style={{ background: '#fef3c7', color: '#78350f' }}
          >
            {a.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AerzteClient({ aerzte, kasseName }: {
  aerzte: ArztAkteData[]
  kasseName: string
}) {
  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, color: '#0f172a', fontWeight: 400, margin: 0 }}
          >
            Ärzteakte
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            GOÄ-Muster · Abrechnungsverlauf · Benchmark-Vergleich je Arzt
          </p>
        </div>
        <Link
          href="/rechnungen"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--mint)', textDecoration: 'none' }}
        >
          + Rechnung hochladen
        </Link>
      </div>

      {/* Global KPI strip */}
      {aerzte.length > 0 && <PageKpiStrip aerzte={aerzte} kasseName={kasseName} />}

      {/* Priority banner */}
      <PrioritaetsBanner aerzte={aerzte} />

      {/* Doctor cards */}
      {aerzte.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {aerzte.map((arzt, i) => (
            <ArztCard
              key={arzt.id}
              arzt={arzt}
              kasseName={kasseName}
              defaultOpen={aerzte.length === 1 || arzt.flagged || i === 0}
            />
          ))}
          <GhostCard />
        </div>
      )}
    </>
  )
}
