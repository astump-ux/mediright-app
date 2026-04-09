'use client'

import { useEffect, useState, useCallback } from 'react'
import Header from '@/components/layout/Header'

interface Setting {
  id: string
  key: string
  value: string
  label: string
  description: string | null
  category: string
  input_type: 'textarea' | 'text' | 'number'
  updated_at: string
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  prompts:      { label: 'KI-Prompts',        icon: '🤖' },
  nachrichten:  { label: 'WhatsApp Texte',     icon: '💬' },
  konfiguration:{ label: 'Konfiguration',      icon: '⚙️' },
  general:      { label: 'Allgemein',          icon: '📋' },
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
            Prompts, WhatsApp-Texte und Konfigurationswerte verwalten. Änderungen sind sofort aktiv.
          </p>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 24, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Settings by category */}
        {Object.entries(grouped).map(([category, items]) => {
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
                    {setting.input_type === 'textarea' ? (
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
