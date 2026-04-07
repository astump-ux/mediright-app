'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        background: '#1e293b',
        borderRadius: 16,
        padding: '48px 40px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: 22,
              color: 'white',
              fontWeight: 400,
            }}>MediRight</span>
          </div>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>
            Ihr PKV-Optimierungs­dashboard
          </p>
        </div>

        {!sent ? (
          <>
            <h2 style={{
              color: 'white',
              fontSize: 20,
              fontWeight: 600,
              marginBottom: 8,
              textAlign: 'center',
            }}>
              Anmelden
            </h2>
            <p style={{
              color: '#94a3b8',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 28,
            }}>
              Wir senden Ihnen einen Magic Link — kein Passwort nötig.
            </p>

            <form onSubmit={handleLogin}>
              <label style={{ display: 'block', marginBottom: 20 }}>
                <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>
                  E-Mail-Adresse
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="max@beispiel.de"
                  required
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 8,
                    padding: '12px 16px',
                    background: '#0f172a',
                    border: '1.5px solid #334155',
                    borderRadius: 10,
                    color: 'white',
                    fontSize: 15,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              {error && (
                <div style={{
                  background: '#fee2e2',
                  color: '#dc2626',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: loading ? '#334155' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Wird gesendet…' : 'Magic Link senden →'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56,
              height: 56,
              background: 'rgba(16,185,129,0.15)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
                  stroke="#10b981" strokeWidth="1.5"/>
                <path d="M22 6l-10 7L2 6" stroke="#10b981" strokeWidth="1.5"/>
              </svg>
            </div>
            <h2 style={{ color: 'white', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Link gesendet!
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
              Wir haben einen Magic Link an<br />
              <strong style={{ color: '#e2e8f0' }}>{email}</strong><br />
              gesendet. Klicken Sie auf den Link, um sich anzumelden.
            </p>
            <button
              onClick={() => setSent(false)}
              style={{
                marginTop: 24,
                color: '#10b981',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              ← Andere E-Mail verwenden
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
