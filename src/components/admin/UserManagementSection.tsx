'use client'

import { useEffect, useState, useCallback } from 'react'

const navy  = '#0f172a'
const mint  = '#10b981'
const mintDark = '#059669'
const slate = '#64748b'

interface AdminUser {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
  last_sign_in_at: string | null
  balance: number
  free_analyses_used: number
  subscription_status: string
  subscription_expires_at: string | null
  stripe_customer_id: string | null
  analyses_run: number
}

function PlanBadge({ user }: { user: AdminUser }) {
  if (user.subscription_status === 'pro') {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
        background: '#d1fae5', color: '#065f46' }}>PRO</span>
    )
  }
  if (user.balance > 0) {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
        background: '#eff6ff', color: '#1e40af' }}>{user.balance} Credits</span>
    )
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
      background: '#f1f5f9', color: slate }}>Free</span>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function UserRow({ user, onUpdated }: { user: AdminUser; onUpdated: () => void }) {
  const [expanded, setExpanded]   = useState(false)
  const [credits, setCredits]     = useState('')
  const [reason, setReason]       = useState('admin_grant')
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')

  async function addCredits() {
    const n = parseInt(credits)
    if (!n || n <= 0) { setMsg('Ungültige Anzahl'); return }
    setSaving(true); setMsg('')
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_credits', amount: n, reason }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) { setMsg(`✓ ${n} Credits gutgeschrieben. Neues Guthaben: ${data.new_balance}`); setCredits(''); onUpdated() }
    else setMsg(`Fehler: ${data.error}`)
  }

  async function togglePro() {
    const newStatus = user.subscription_status === 'pro' ? 'free' : 'pro'
    setSaving(true); setMsg('')
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_subscription', subscription_status: newStatus }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) { setMsg(`✓ Status geändert zu: ${newStatus.toUpperCase()}`); onUpdated() }
    else setMsg(`Fehler: ${data.error}`)
  }

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
          background: expanded ? '#f8fafc' : 'white' }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'white' }}
      >
        <td style={{ padding: '12px 16px', fontSize: 13, color: navy, fontWeight: 600 }}>
          <div>{user.email}</div>
          {user.full_name && <div style={{ fontSize: 11, color: slate, fontWeight: 400 }}>{user.full_name}</div>}
        </td>
        <td style={{ padding: '12px 16px' }}><PlanBadge user={user} /></td>
        <td style={{ padding: '12px 16px', fontSize: 12, color: slate, textAlign: 'center' }}>{user.analyses_run}</td>
        <td style={{ padding: '12px 16px', fontSize: 12, color: slate }}>{fmtDate(user.last_sign_in_at)}</td>
        <td style={{ padding: '12px 16px', fontSize: 12, color: slate }}>{fmtDate(user.created_at)}</td>
        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 16, color: slate }}>
          {expanded ? '▲' : '▼'}
        </td>
      </tr>

      {expanded && (
        <tr style={{ background: '#f8fafc' }}>
          <td colSpan={6} style={{ padding: '0 16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 16 }}>

              {/* Credits gutschreiben */}
              <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: navy, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Credits gutschreiben</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="number" min="1" max="100"
                    value={credits}
                    onChange={e => setCredits(e.target.value)}
                    placeholder="Anzahl"
                    style={{ width: 80, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: navy }}
                  />
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: navy, background: 'white' }}
                  >
                    <option value="admin_grant">Admin-Gutschrift</option>
                    <option value="support_compensation">Support-Ausgleich</option>
                    <option value="beta_bonus">Beta-Bonus</option>
                    <option value="referral">Empfehlung</option>
                  </select>
                  <button
                    onClick={addCredits}
                    disabled={saving || !credits}
                    style={{ padding: '8px 16px', background: saving ? '#e2e8f0' : mintDark, color: 'white',
                      border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
                  >
                    {saving ? '…' : '+ Credits'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: slate }}>Aktuelles Guthaben: <strong style={{ color: navy }}>{user.balance} Credits</strong></div>
              </div>

              {/* Abo-Status */}
              <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: navy, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abonnement</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <PlanBadge user={user} />
                  {user.subscription_expires_at && (
                    <span style={{ fontSize: 11, color: slate }}>bis {fmtDate(user.subscription_expires_at)}</span>
                  )}
                  <button
                    onClick={togglePro}
                    disabled={saving}
                    style={{
                      marginLeft: 'auto', padding: '7px 14px', border: 'none', borderRadius: 8,
                      fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                      background: user.subscription_status === 'pro' ? '#fee2e2' : '#d1fae5',
                      color: user.subscription_status === 'pro' ? '#dc2626' : '#065f46',
                    }}
                  >
                    {user.subscription_status === 'pro' ? 'Pro deaktivieren' : 'Pro aktivieren'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: slate }}>
                  {user.stripe_customer_id
                    ? <>Stripe: <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{user.stripe_customer_id}</span></>
                    : 'Kein Stripe-Konto verknüpft'}
                </div>
              </div>
            </div>

            {/* Feedback message */}
            {msg && (
              <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('✓') ? '#065f46' : '#dc2626',
                background: msg.startsWith('✓') ? '#d1fae5' : '#fee2e2',
                padding: '8px 12px', borderRadius: 8 }}>
                {msg}
              </div>
            )}

            {/* Meta */}
            <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', display: 'flex', gap: 16 }}>
              <span>ID: <span style={{ fontFamily: 'monospace' }}>{user.id.slice(0, 8)}…</span></span>
              <span>Registriert: {fmtDate(user.created_at)}</span>
              <span>Free-Analysen genutzt: {user.free_analyses_used}</span>
              {user.role === 'admin' && <span style={{ color: '#92400e', fontWeight: 700 }}>⚙ Admin</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function UserManagementSection() {
  const [users, setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const stats = {
    total: users.length,
    pro:   users.filter(u => u.subscription_status === 'pro').length,
    withCredits: users.filter(u => u.balance > 0).length,
    activeThisWeek: users.filter(u => {
      if (!u.last_sign_in_at) return false
      return Date.now() - new Date(u.last_sign_in_at).getTime() < 7 * 24 * 60 * 60 * 1000
    }).length,
  }

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '2px solid #e2e8f0' }}>
        <span style={{ fontSize: 20 }}>👥</span>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: navy, margin: 0 }}>Nutzerverwaltung</h2>
        <span style={{ fontSize: 12, color: slate, marginLeft: 4 }}>{users.length} Nutzer gesamt</span>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Gesamt',         value: stats.total,          color: navy },
          { label: 'Pro-Abos',       value: stats.pro,            color: mintDark },
          { label: 'Mit Credits',    value: stats.withCredits,    color: '#1d4ed8' },
          { label: 'Aktiv (7 Tage)', value: stats.activeThisWeek, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: slate, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Nutzer suchen (E-Mail oder Name)…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', border: '1.5px solid #e2e8f0',
          borderRadius: 10, fontSize: 13, color: navy, background: 'white', marginBottom: 12, outline: 'none' }}
      />

      {/* Table */}
      <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: '24px 20px', color: slate, fontSize: 13, margin: 0 }}>Lädt Nutzerdaten…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                {['E-Mail / Name', 'Plan', 'Analysen', 'Zuletzt aktiv', 'Registriert', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: slate,
                    textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Analysen' ? 'center' : 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px 20px', color: slate, fontSize: 13, textAlign: 'center' }}>
                  Keine Nutzer gefunden.
                </td></tr>
              ) : (
                filtered.map(u => <UserRow key={u.id} user={u} onUpdated={load} />)
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
