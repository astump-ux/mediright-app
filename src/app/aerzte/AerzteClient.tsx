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
  unit: '%' | '×' | '€'
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
  benchmarkAblehnung: BenchmarkData | null
  benchmarkKasse: BenchmarkData | null
  benchmarkFaktor: BenchmarkData | null
  benchmarkKosten: BenchmarkData | null
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

// ── Besuchshistorie Tabelle (replaces SVG Verlauf chart) ─────────────────────
function BesuchshistorieTabelle({ verlauf }: { verlauf: VerlaufPunkt[] }) {
  if (verlauf.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: '1px solid #e2e8f0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {['Besuch', '€ Rechnung', '€ Erstattet', '€ Abgelehnt', 'Ablehnungsquote'].map(h => (
              <th key={h} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-left" style={{ color: '#64748b' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verlauf.map((v, i) => {
            const q = v.ablehnungsquote
            const qColor = q === null ? '#94a3b8' : q === 0 ? '#059669' : q <= 20 ? '#059669' : q <= 40 ? '#d97706' : '#b91c1c'
            const qBg    = q === null ? '#f8fafc' : q === 0 ? '#d1fae5' : q <= 20 ? '#d1fae5' : q <= 40 ? '#fef3c7' : '#fee2e2'
            return (
              <tr key={i} style={{ borderBottom: i < verlauf.length - 1 ? '1px solid #f1f5f9' : undefined }}>
                <td className="px-3 py-2.5 font-medium" style={{ color: '#374151' }}>{v.datum}</td>
                <td className="px-3 py-2.5 font-semibold" style={{ color: '#0f172a' }}>€ {fmt(v.betrag)}</td>
                <td className="px-3 py-2.5" style={{ color: v.erstattet != null ? '#059669' : '#94a3b8' }}>
                  {v.erstattet != null ? `€ ${fmt(v.erstattet)}` : '—'}
                </td>
                <td className="px-3 py-2.5" style={{ color: v.abgelehnt != null && v.abgelehnt > 0 ? '#b91c1c' : '#94a3b8' }}>
                  {v.abgelehnt != null && v.abgelehnt > 0 ? `€ ${fmt(v.abgelehnt)}` : '—'}
                </td>
                <td className="px-3 py-2.5">
                  {q !== null ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: qBg, color: qColor }}>
                      {q}%
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#94a3b8' }}>
                      Kein Bescheid
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Benchmark Bar ─────────────────────────────────────────────────────────────
function BenchmarkBar({ label, thisArzt, vergleichswert, quelle, unit, alwaysShow }: {
  label: string; thisArzt: number; vergleichswert: number
  quelle: string; unit: '%' | '×' | '€'; alwaysShow?: boolean
}) {
  const maxVal  = Math.max(thisArzt, vergleichswert, unit === '%' ? 30 : unit === '×' ? 3 : 100) * 1.3
  const thisW   = Math.round((thisArzt / maxVal) * 100)
  const benchW  = Math.round((vergleichswert / maxVal) * 100)
  const diff    = thisArzt - vergleichswert
  // For %, high diff = bad. For × and €, high diff = potentially concerning too.
  const relDiff = vergleichswert > 0 ? (diff / vergleichswert) * 100 : 0
  const isHigh  = unit === '%' ? diff > 10 : relDiff > 20
  const isSlightly = unit === '%' ? (diff > 0 && diff <= 10) : (relDiff > 0 && relDiff <= 20)
  const thisColor = isHigh ? '#ef4444' : isSlightly ? '#f59e0b' : '#10b981'

  const fmtVal = (v: number) =>
    unit === '%' ? `${v.toFixed(1)}%`
    : unit === '×' ? `${v.toFixed(1)}×`
    : `€ ${fmt(Math.round(v))}`

  const diffLabel = unit === '%'
    ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} pp ${diff > 0 ? '▲' : '▼'}`
    : `${diff > 0 ? '+' : ''}${fmtVal(diff)} ${diff > 0 ? '▲' : '▼'}`

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold" style={{ color: '#475569' }}>{label}</span>
        {diff !== 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: isHigh ? '#fee2e2' : isSlightly ? '#fef3c7' : '#d1fae5',
              color: isHigh ? '#b91c1c' : isSlightly ? '#92400e' : '#065f46',
            }}
          >
            {diffLabel}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="text-[10px] w-24 text-right flex-shrink-0" style={{ color: '#64748b' }}>Dieser Arzt</div>
          <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
            <div
              className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-1.5"
              style={{ width: `${Math.max(thisW, 8)}%`, background: thisColor }}
            >
              <span className="text-[9px] text-white font-bold whitespace-nowrap">{fmtVal(thisArzt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] w-24 text-right flex-shrink-0" style={{ color: '#94a3b8' }}>Benchmark</div>
          <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
            <div
              className="h-full rounded-full flex items-center justify-end pr-1.5"
              style={{ width: `${Math.max(benchW, 8)}%`, background: '#94a3b8' }}
            >
              <span className="text-[9px] text-white font-bold whitespace-nowrap">{fmtVal(vergleichswert)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="text-[9px] mt-1" style={{ color: '#cbd5e1' }}>Quelle: {quelle}</div>
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
  const benchAvg = arzt.benchmarkAblehnung?.vergleichswert

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

      {/* ── Besuchshistorie ── */}
      <div>
        <SectionLabel>Besuchshistorie</SectionLabel>
        <BesuchshistorieTabelle verlauf={arzt.verlauf} />
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
      {(arzt.benchmarkAblehnung || arzt.benchmarkKasse || arzt.benchmarkFaktor || arzt.benchmarkKosten) && (
        <div>
          <SectionLabel>Benchmark-Vergleich</SectionLabel>
          <div className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>

            {/* Ablehnungsquoten */}
            {(arzt.benchmarkAblehnung || arzt.benchmarkKasse) && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>
                  Ablehnungsquote
                </div>
                {arzt.benchmarkAblehnung && (
                  <BenchmarkBar
                    label={`Fachgruppe: ${arzt.fachrichtung}`}
                    thisArzt={arzt.benchmarkAblehnung.thisArzt}
                    vergleichswert={arzt.benchmarkAblehnung.vergleichswert}
                    quelle={arzt.benchmarkAblehnung.quelle}
                    unit="%"
                  />
                )}
                {arzt.benchmarkKasse && (
                  <BenchmarkBar
                    label={`${kasseName} gesamt`}
                    thisArzt={arzt.benchmarkKasse.thisArzt}
                    vergleichswert={arzt.benchmarkKasse.vergleichswert}
                    quelle={arzt.benchmarkKasse.quelle}
                    unit="%"
                  />
                )}
                <p className="text-[10px] mb-4" style={{ color: '#94a3b8' }}>
                  Abweichungen über +10 pp bei gleichzeitig unauffälligem GOÄ-Faktor deuten auf systematische Ablehnung hin — ein starkes Widerspruchsargument.
                </p>
              </>
            )}

            {/* Abrechnungsverhalten */}
            {(arzt.benchmarkFaktor || arzt.benchmarkKosten) && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3 mt-1" style={{ color: '#94a3b8' }}>
                  Abrechnungsverhalten
                </div>
                {arzt.benchmarkFaktor && (
                  <BenchmarkBar
                    label={arzt.benchmarkFaktor.label}
                    thisArzt={arzt.benchmarkFaktor.thisArzt}
                    vergleichswert={arzt.benchmarkFaktor.vergleichswert}
                    quelle={arzt.benchmarkFaktor.quelle}
                    unit="×"
                  />
                )}
                {arzt.benchmarkKosten && (
                  <BenchmarkBar
                    label={arzt.benchmarkKosten.label}
                    thisArzt={arzt.benchmarkKosten.thisArzt}
                    vergleichswert={arzt.benchmarkKosten.vergleichswert}
                    quelle={arzt.benchmarkKosten.quelle}
                    unit="€"
                  />
                )}
                <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                  Hoher Faktor + hohe Kosten je Besuch erhöhen das Ablehnungsrisiko, können aber durch schriftliche §12-GOÄ-Begründung gerechtfertigt sein.
                </p>
              </>
            )}

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
  const benchAvg = arzt.benchmarkAblehnung?.vergleichswert
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
export default function AerzteClient({ aerzte, kasseName, isDemo = false }: {
  aerzte: ArztAkteData[]
  kasseName: string
  isDemo?: boolean
}) {
  return (
    <>
      {/* Demo banner */}
      {isDemo && (
        <div style={{
          background: 'linear-gradient(90deg, #fef3c7, #fde68a)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#92400e',
        }}>
          <span>👀</span>
          <span>
            <strong>Demo-Modus</strong> — Diese Ansicht zeigt Beispieldaten.
            Ärzte werden automatisch aus Ihren hochgeladenen Rechnungen erkannt.
          </span>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, color: '#0f172a', fontWeight: 400, margin: 0 }}
          >
            Ärzteakte
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {isDemo ? 'Beispielansicht · GOÄ-Muster · Abrechnungsverlauf · Benchmark-Vergleich je Arzt' : 'GOÄ-Muster · Abrechnungsverlauf · Benchmark-Vergleich je Arzt'}
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
