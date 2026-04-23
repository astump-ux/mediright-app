'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const navy  = '#0f172a'
const dark  = '#1e293b'
const muted = '#94a3b8'
const mint  = '#10b981'
const mintD = '#059669'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [sent,     setSent]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [error,    setError]    = useState('')

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setLoading(false) }
    else        { setSent(true);           setLoading(false) }
  }

  async function handleGoogle() {
    setGLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setGLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: navy, padding: '20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        background: dark, borderRadius: 18, padding: '48px 40px',
        width: '100%', maxWidth: 420, boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>

        {/* Logo */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: `linear-gradient(135deg, ${mint}, ${mintD})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 24, color: 'white', fontWeight: 400 }}>
              MediRight
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>Ihr PKV-Optimierungsdashboard</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 60, height: 60, margin: '0 auto 20px', borderRadius: '50%',
              background: 'rgba(16,185,129,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke={mint} strokeWidth="1.5"/>
                <path d="M22 6l-10 7L2 6" stroke={mint} strokeWidth="1.5"/>
              </svg>
            </div>
            <h2 style={{ color: 'white', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Link gesendet!</h2>
            <p style={{ color: muted, fontSize: 14, lineHeight: 1.7 }}>
              Wir haben einen Magic Link an<br/>
              <strong style={{ color: '#e2e8f0' }}>{email}</strong><br/>
              gesendet. Klicken Sie auf den Link, um sich anzumelden.
            </p>
            <button onClick={() => setSent(false)}
              style={{ marginTop: 24, color: mint, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
              ← Andere E-Mail verwenden
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ color: 'white', fontSize: 20, fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>
              Anmelden · Registrieren
            </h2>
            <p style={{ color: muted, fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
              Neu hier? Einfach anmelden — Ihr Konto wird automatisch angelegt.
            </p>

            {/* Google button */}
            <button onClick={handleGoogle} disabled={gLoading} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 16px', background: 'white', border: 'none', borderRadius: 10,
              color: '#1e293b', fontWeight: 600, fontSize: 15,
              cursor: gLoading ? 'not-allowed' : 'pointer', opacity: gLoading ? 0.7 : 1,
              marginBottom: 8, transition: 'opacity 0.15s',
            }}>
              {gLoading ? <span style={{ fontSize: 14, color: '#64748b' }}>Weiterleitung…</span> : (
                <>
                  <svg width="20" height="20" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Mit Google anmelden
                </>
              )}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#334155' }}/>
              <span style={{ color: '#475569', fontSize: 12 }}>oder per E-Mail</span>
              <div style={{ flex: 1, height: 1, background: '#334155' }}/>
            </div>

            {/* Magic Link form */}
            <form onSubmit={handleMagicLink}>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ color: muted, fontSize: 13, fontWeight: 500 }}>E-Mail-Adresse</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="max@beispiel.de" required
                  style={{
                    display: 'block', width: '100%', marginTop: 8, padding: '11px 16px',
                    background: navy, border: '1.5px solid #334155', borderRadius: 10,
                    color: 'white', fontSize: 15, outline: 'none', boxSizing: 'border-box',
                  }}/>
              </label>

              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '12px',
                background: loading ? '#334155' : `linear-gradient(135deg, ${mint}, ${mintD})`,
                color: 'white', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              }}>
                {loading ? 'Wird gesendet…' : '✉️ Magic Link senden →'}
              </button>
            </form>

            <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 20 }}>
              Mit der Anmeldung stimmen Sie unseren Nutzungsbedingungen zu.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
