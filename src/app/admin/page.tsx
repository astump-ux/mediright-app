'use client'

import { useEffect, useState, useCallback } from 'react'
import Header from '@/components/layout/Header'

interface SelectOption { value: string; label: string }
interface Setting {
  id: string
  key: string
  value: string
  label: string
  description: string | null
  category: string
  input_type: 'textarea' | 'text' | 'number' | 'select'
  select_options: SelectOption[] | null
  updated_at: string
}

// ── Token Usage Types ─────────────────────────────────────────────────────────
interface UsageDayEntry   { input: number; output: number; total: number; calls: number; costUsd: number }
interface UsageModelEntry extends UsageDayEntry { model: string }
type UsagePeriod = 'tag' | 'woche' | 'monat'

function aggregateByPeriod(byDay: Record<string, UsageDayEntry>, period: UsagePeriod, n: number) {
  const today = new Date(); today.setHours(0,0,0,0)
  const buckets: { label: string; data: UsageDayEntry }[] = []

  if (period === 'tag') {
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
      buckets.push({ label, data: byDay[key] ?? { input: 0, output: 0, total: 0, calls: 0, costUsd: 0 } })
    }
  } else if (period === 'woche') {
    for (let w = n - 1; w >= 0; w--) {
      const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - w * 7 - today.getDay() + 1)
      const agg: UsageDayEntry = { input: 0, output: 0, total: 0, calls: 0, costUsd: 0 }
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart); day.setDate(weekStart.getDate() + d)
        const key = day.toISOString().slice(0, 10)
        const e = byDay[key]; if (!e) continue
        agg.input += e.input; agg.output += e.output; agg.total += e.total; agg.calls += e.calls; agg.costUsd += e.costUsd
      }
      const label = `KW ${weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`
      buckets.push({ label, data: agg })
    }
  } else {
    for (let m = n - 1; m >= 0; m--) {
      const mo = new Date(today.getFullYear(), today.getMonth() - m, 1)
      const agg: UsageDayEntry = { input: 0, output: 0, total: 0, calls: 0, costUsd: 0 }
      const daysInMonth = new Date(mo.getFullYear(), mo.getMonth() + 1, 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${mo.getFullYear()}-${String(mo.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        const e = byDay[key]; if (!e) continue
        agg.input += e.input; agg.output += e.output; agg.total += e.total; agg.calls += e.calls; agg.costUsd += e.costUsd
      }
      buckets.push({ label: mo.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }), data: agg })
    }
  }
  return buckets
}

function fmtCost(usd: number) { return `$${usd.toFixed(4)}` }
function fmtTokens(n: number) { return n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n) }

// Provider badge colours
const PROVIDER_STYLE: Record<string, { bg: string; color: string }> = {
  anthropic: { bg: '#f1f5f9', color: '#0f172a' },
  google:    { bg: '#e8f5e9', color: '#1b5e20' },
}
function modelProvider(m: string) { return m.startsWith('gemini-') ? 'google' : 'anthropic' }
function modelShortLabel(m: string) {
  if (m === 'claude-sonnet-4-6')         return 'Sonnet 4.6'
  if (m === 'claude-haiku-4-5-20251001') return 'Haiku 4.5'
  if (m === 'gemini-3-flash-preview')    return 'Gemini 3 Flash'
  if (m === 'gemini-3.1-pro-preview')   return 'Gemini 3.1 Pro'
  return m
}

function TokenUsageSection() {
  const [byDay,   setByDay]   = useState<Record<string, UsageDayEntry>>({})
  const [byModel, setByModel] = useState<Record<string, UsageModelEntry>>({})
  const [period, setPeriod]   = useState<UsagePeriod>('tag')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/ki-usage')
      .then(r => r.json())
      .then(d => { setByDay(d.byDay ?? {}); setByModel(d.byModel ?? {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const periodConfig: { key: UsagePeriod; label: string; n: number }[] = [
    { key: 'tag',   label: 'Täglich (30 Tage)', n: 30 },
    { key: 'woche', label: 'Wöchentlich (12 Wo.)', n: 12 },
    { key: 'monat', label: 'Monatlich (6 Mo.)', n: 6 },
  ]
  const { n } = periodConfig.find(p => p.key === period)!
  const buckets = aggregateByPeriod(byDay, period, n)
  const maxTotal = Math.max(...buckets.map(b => b.data.total), 1)
  const grandTotal = buckets.reduce((a, b) => ({ ...a, total: a.total + b.data.total, calls: a.calls + b.data.calls, costUsd: a.costUsd + b.data.costUsd }), { total: 0, calls: 0, costUsd: 0 } as UsageDayEntry)

  // All-time summary
  const allTime = Object.values(byDay).reduce((a, b) => ({ ...a, total: a.total + b.total, calls: a.calls + b.calls, costUsd: a.costUsd + b.costUsd }), { total: 0, calls: 0, costUsd: 0 } as UsageDayEntry)
  const today = new Date().toISOString().slice(0, 10)
  const todayData = byDay[today] ?? { total: 0, calls: 0, costUsd: 0 }
  // This month
  const thisMonthPrefix = new Date().toISOString().slice(0, 7)
  const thisMonth = Object.entries(byDay).filter(([k]) => k.startsWith(thisMonthPrefix)).reduce((a, [, b]) => ({ total: a.total + b.total, calls: a.calls + b.calls, costUsd: a.costUsd + b.costUsd }), { total: 0, calls: 0, costUsd: 0 })

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '2px solid #e2e8f0' }}>
        <span style={{ fontSize: 20 }}>📊</span>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: navy, margin: 0 }}>Token-Verbrauch & Kosten</h2>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Heute', tokens: todayData.total, calls: todayData.calls, cost: todayData.costUsd },
          { label: 'Diesen Monat', tokens: thisMonth.total, calls: thisMonth.calls, cost: thisMonth.costUsd },
          { label: 'Gesamt (90 Tage)', tokens: allTime.total, calls: allTime.calls, cost: allTime.costUsd },
        ].map(card => (
          <div key={card.label} style={{ background: 'white', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1.5px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: navy, marginBottom: 2 }}>{fmtTokens(card.tokens)}</div>
            <div style={{ fontSize: 12, color: slate }}>Tokens · {card.calls} Aufrufe</div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: mint }}>{fmtCost(card.cost)}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: 'white', borderRadius: 12, padding: '20px 20px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1.5px solid #e2e8f0' }}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {periodConfig.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: period === p.key ? navy : '#f1f5f9',
                color: period === p.key ? 'white' : slate }}>
              {p.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: slate, fontSize: 13 }}>Lädt…</p>
        ) : (
          <>
            {/* Bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === 'tag' ? 3 : 6, height: 90, marginBottom: 6 }}>
              {buckets.map((b, i) => {
                const h = Math.round((b.data.total / maxTotal) * 82)
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                    title={`${b.label}: ${fmtTokens(b.data.total)} Tokens · ${fmtCost(b.data.costUsd)}`}>
                    <div style={{ width: '100%', height: h || 2, background: b.data.total > 0 ? mint : '#e2e8f0', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                  </div>
                )
              })}
            </div>
            {/* X-axis labels — show only every Nth */}
            <div style={{ display: 'flex', gap: period === 'tag' ? 3 : 6, marginBottom: 12 }}>
              {buckets.map((b, i) => {
                const showEvery = period === 'tag' ? 5 : 1
                return (
                  <div key={i} style={{ flex: 1, fontSize: 9, color: '#94a3b8', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {i % showEvery === 0 ? b.label : ''}
                  </div>
                )
              })}
            </div>

            {/* Period summary */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: slate }}>Tokens: </span>
                <span style={{ fontWeight: 700, color: navy }}>{fmtTokens(grandTotal.total)}</span>
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: slate }}>KI-Aufrufe: </span>
                <span style={{ fontWeight: 700, color: navy }}>{grandTotal.calls}</span>
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: slate }}>Kosten: </span>
                <span style={{ fontWeight: 700, color: mint }}>{fmtCost(grandTotal.costUsd)}</span>
              </div>
            </div>

            {/* Model breakdown table */}
            {Object.keys(byModel).length > 0 && (
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Aufschlüsselung nach Modell (90 Tage)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.values(byModel).sort((a, b) => b.costUsd - a.costUsd).map(m => {
                    const prov = modelProvider(m.model)
                    const style = PROVIDER_STYLE[prov]
                    return (
                      <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: style.bg, color: style.color, border: '1px solid #e2e8f0' }}>
                          {prov === 'google' ? 'Google' : 'Anthropic'}
                        </span>
                        <span style={{ flex: 1, fontWeight: 600, color: navy }}>{modelShortLabel(m.model)}</span>
                        <span style={{ color: slate }}>{fmtTokens(m.total)} Tok</span>
                        <span style={{ color: slate }}>·</span>
                        <span style={{ color: slate }}>{m.calls} Aufrufe</span>
                        <span style={{ color: slate }}>·</span>
                        <span style={{ fontWeight: 700, color: mint }}>{fmtCost(m.costUsd)}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
                  Sonnet $3/$15 · Haiku $0.80/$4 · Gemini 2.5 Flash $0.15/$0.60 · Gemini 2.5 Pro $1.25/$10 pro MTok (in/out)
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Admin page shows only model selectors and operational config.
// KI-Prompts and WhatsApp texts are managed under /system (admin-only).
// Deprecated and hidden categories are excluded.
const ADMIN_CATEGORIES = ['konfiguration']

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  konfiguration: { label: 'Konfiguration', icon: '⚙️' },
}

const navy = '#0f172a'
const navyMid = '#1e293b'
const mint = '#10b981'
const mintDark = '#059669'
const slate = '#64748b'

export default function AdminPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/settings')
    if (res.ok) {
      const data: Setting[] = await res.json()
      setSettings(data)
      const initial: Record<string, string> = {}
      data.forEach(s => { initial[s.key] = s.value })
      setEdits(initial)
    } else {
      setError('Einstellungen konnten nicht geladen werden.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  async function saveSetting(key: string) {
    setSaving(p => ({ ...p, [key]: true }))
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: edits[key] }),
    })
    setSaving(p => ({ ...p, [key]: false }))
    if (res.ok) {
      setSaved(p => ({ ...p, [key]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [key]: false })), 2000)
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value: edits[key], updated_at: new Date().toISOString() } : s))
    }
  }

  function isDirty(key: string) {
    const orig = settings.find(s => s.key === key)?.value ?? ''
    return edits[key] !== orig
  }

  const grouped = settings.reduce<Record<string, Setting[]>>((acc, s) => {
    ;(acc[s.category] ??= []).push(s)
    return acc
  }, {})

  if (loading) return (
    <>
      <Header />
      <main style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <p style={{ color: slate }}>Lädt…</p>
      </main>
    </>
  )

  return (
    <>
      <Header />
      <main style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, color: navy, marginBottom: 6, fontWeight: 400 }}>
            Admin — Einstellungen
          </h1>
          <p style={{ color: slate, fontSize: 14 }}>
            KI-Modelle und Betriebsparameter verwalten. KI-Prompts und WhatsApp-Texte sind unter{' '}
            <a href="/system" style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>System</a> editierbar.
          </p>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 24, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Token usage */}
        <TokenUsageSection />

        {/* Settings by category — only whitelisted admin categories */}
        {Object.entries(grouped)
          .filter(([category]) => ADMIN_CATEGORIES.includes(category))
          .map(([category, items]) => {
          const meta = CATEGORY_LABELS[category] ?? { label: category, icon: '📋' }
          return (
            <div key={category} style={{ marginBottom: 40 }}>
              {/* Category header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '2px solid #e2e8f0' }}>
                <span style={{ fontSize: 20 }}>{meta.icon}</span>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: navy, margin: 0 }}>{meta.label}</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {items.map(setting => (
                  <div key={setting.key} style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: isDirty(setting.key) ? `1.5px solid ${mint}` : '1.5px solid transparent' }}>

                    {/* Setting header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: navy, fontSize: 14 }}>{setting.label}</div>
                        {setting.description && (
                          <div style={{ color: slate, fontSize: 12, marginTop: 2 }}>{setting.description}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {new Date(setting.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 20, fontFamily: 'monospace' }}>
                          {setting.key}
                        </span>
                      </div>
                    </div>

                    {/* Input */}
                    {setting.input_type === 'select' ? (
                      <select
                        value={edits[setting.key] ?? ''}
                        onChange={e => setEdits(p => ({ ...p, [setting.key]: e.target.value }))}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '10px 12px', border: '1.5px solid #e2e8f0',
                          borderRadius: 8, fontSize: 14, color: navy,
                          background: '#f8fafc', outline: 'none', cursor: 'pointer',
                        }}
                      >
                        {(setting.select_options ?? []).map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : setting.input_type === 'textarea' ? (
                      <textarea
                        value={edits[setting.key] ?? ''}
                        onChange={e => setEdits(p => ({ ...p, [setting.key]: e.target.value }))}
                        rows={setting.key.includes('prompt') ? 14 : 5}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '10px 12px', border: '1.5px solid #e2e8f0',
                          borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                          fontFamily: setting.key.includes('prompt') ? 'monospace' : "'DM Sans', system-ui, sans-serif",
                          color: navy, background: '#f8fafc', resize: 'vertical', outline: 'none',
                        }}
                      />
                    ) : (
                      <input
                        type={setting.input_type}
                        value={edits[setting.key] ?? ''}
                        onChange={e => setEdits(p => ({ ...p, [setting.key]: e.target.value }))}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '10px 12px', border: '1.5px solid #e2e8f0',
                          borderRadius: 8, fontSize: 14, color: navy,
                          background: '#f8fafc', outline: 'none',
                        }}
                      />
                    )}

                    {/* Save button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8, alignItems: 'center' }}>
                      {isDirty(setting.key) && (
                        <button
                          onClick={() => setEdits(p => ({ ...p, [setting.key]: settings.find(s => s.key === setting.key)?.value ?? '' }))}
                          style={{ fontSize: 13, color: slate, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px' }}
                        >
                          Zurücksetzen
                        </button>
                      )}
                      <button
                        onClick={() => saveSetting(setting.key)}
                        disabled={!isDirty(setting.key) || saving[setting.key]}
                        style={{
                          padding: '8px 18px', borderRadius: 8, border: 'none', cursor: isDirty(setting.key) ? 'pointer' : 'not-allowed',
                          background: saved[setting.key] ? '#d1fae5' : isDirty(setting.key) ? mintDark : '#e2e8f0',
                          color: saved[setting.key] ? '#065f46' : isDirty(setting.key) ? 'white' : '#94a3b8',
                          fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
                        }}
                      >
                        {saving[setting.key] ? 'Speichert…' : saved[setting.key] ? '✓ Gespeichert' : 'Speichern'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </main>
    </>
  )
}
