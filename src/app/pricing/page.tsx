'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CreditStatus } from '@/lib/credits'
import { CREDIT_PACKS, PRO_SUBSCRIPTION } from '@/lib/stripe'

// ── Design tokens ────────────────────────────────────────────────────────────
const navy   = '#0f172a'
const slate  = '#64748b'
const mint   = '#10b981'
const mintL  = '#ecfdf5'
const amber  = '#f59e0b'
const amberL = '#fffbeb'
const blue   = '#1d4ed8'
const blueL  = '#eff6ff'
const red    = '#dc2626'

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €'
}

// ── Buy button (triggers Stripe Checkout) ────────────────────────────────────
function BuyButton({
  type, packId, label, style, disabled,
}: {
  type: 'credits' | 'pro'
  packId?: string
  label: string
  style?: React.CSSProperties
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading || disabled) return
    setLoading(true)
    try {
      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, packId }),
      })
      const { url, error } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        alert(error ?? 'Checkout konnte nicht gestartet werden.')
        setLoading(false)
      }
    } catch {
      alert('Netzwerkfehler. Bitte erneut versuchen.')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || disabled}
      style={{
        width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
        fontSize: 13, fontWeight: 700, cursor: loading || disabled ? 'not-allowed' : 'pointer',
        opacity: loading || disabled ? 0.7 : 1, transition: 'opacity 0.15s',
        ...style,
      }}
    >
      {loading ? '⏳ Weiterleitung…' : label}
    </button>
  )
}

// ── Credit Pack Card ─────────────────────────────────────────────────────────
function CreditPackCard({ pack, isPro }: { pack: typeof CREDIT_PACKS[number]; isPro: boolean }) {
  return (
    <div style={{
      background: 'white', borderRadius: 16, overflow: 'hidden',
      border: pack.popular ? `2px solid ${blue}` : '1.5px solid #e2e8f0',
      position: 'relative',
      boxShadow: pack.popular ? '0 4px 24px rgba(29,78,216,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {pack.popular && (
        <div style={{
          background: blue, color: 'white', fontSize: 10, fontWeight: 700,
          textAlign: 'center', padding: '4px 0', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Beliebtestes Paket
        </div>
      )}
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: navy, marginBottom: 4 }}>{pack.name}</div>
        <div style={{ fontSize: 11, color: slate, marginBottom: 14 }}>{pack.description}</div>

        {/* Credit count */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: navy, lineHeight: 1 }}>{pack.credits}</span>
          <span style={{ fontSize: 14, color: slate }}>Analysen</span>
        </div>

        {/* Price */}
        <div style={{ fontSize: 22, fontWeight: 700, color: pack.popular ? blue : navy, marginBottom: 2 }}>
          {fmt(pack.priceEur)}
        </div>
        <div style={{ fontSize: 11, color: slate, marginBottom: 16 }}>
          {fmt(pack.perCredit)} pro Analyse · Credits verfallen nicht
        </div>

        <BuyButton
          type="credits"
          packId={pack.id}
          label={isPro ? 'Credits kaufen (als PRO)' : 'Jetzt kaufen'}
          disabled={false}
          style={{
            background: pack.popular ? blue : navy,
            color: 'white',
          }}
        />
      </div>
    </div>
  )
}

// ── Main Pricing Page ────────────────────────────────────────────────────────
export default function PricingPage() {
  const [credits, setCredits]     = useState<CreditStatus | null>(null)
  const [loading, setLoading]     = useState(true)
  const searchParams              = useSearchParams()
  const purchaseResult            = searchParams.get('purchase')

  useEffect(() => {
    fetch('/api/credits')
      .then(r => r.json())
      .then(d => { setCredits(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const isPro = credits?.isPro ?? false

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Success / cancel banners */}
        {purchaseResult === 'success' && (
          <div style={{
            marginBottom: 28, padding: '14px 18px', borderRadius: 12,
            background: mintL, border: '1.5px solid #6ee7b7',
            color: '#065f46', fontSize: 13, fontWeight: 600, display: 'flex', gap: 10,
          }}>
            ✅ Vielen Dank für deinen Kauf! Deine Credits wurden gutgeschrieben.
          </div>
        )}
        {purchaseResult === 'cancelled' && (
          <div style={{
            marginBottom: 28, padding: '14px 18px', borderRadius: 12,
            background: '#fff7ed', border: '1.5px solid #fed7aa',
            color: '#9a3412', fontSize: 13, fontWeight: 600, display: 'flex', gap: 10,
          }}>
            ℹ️ Kauf abgebrochen. Deine Credits bleiben unverändert.
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: 36, color: navy, margin: '0 0 12px', lineHeight: 1.2,
          }}>
            Zahle nur, wenn du Geld zurückbekommst.
          </h1>
          <p style={{ fontSize: 15, color: slate, maxWidth: 560, margin: '0 auto' }}>
            1 Analyse-Credit = 1 vollständige Rechnungsprüfung inkl. GOÄ-Check und Widerspruchsbrief.
            Credits verfallen nie.
          </p>
        </div>

        {/* Current status banner */}
        {!loading && credits && (
          <div style={{
            marginBottom: 32, padding: '16px 20px', borderRadius: 14,
            background: isPro ? mintL : amberL,
            border: `1.5px solid ${isPro ? '#6ee7b7' : '#fcd34d'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: isPro ? '#065f46' : '#92400e', marginBottom: 2 }}>
                {isPro ? '✅ PRO-Mitglied' : '🆓 Free-Tarif'}
              </div>
              {isPro ? (
                <div style={{ fontSize: 12, color: '#065f46' }}>
                  Unbegrenzte Analysen aktiv
                  {credits.subscriptionExpiresAt && (
                    <> · Verlängerung: {new Date(credits.subscriptionExpiresAt).toLocaleDateString('de-DE')}</>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#92400e' }}>
                  {credits.freeRemaining > 0
                    ? `${credits.freeRemaining} kostenlose Analyse${credits.freeRemaining > 1 ? 'n' : ''} verbleibend`
                    : 'Kostenlose Analysen aufgebraucht'
                  }
                  {credits.balance > 0 && <> · ${credits.balance} gekaufte Credit${credits.balance > 1 ? 's' : ''}</>}
                </div>
              )}
            </div>
            {!isPro && credits.balance + credits.freeRemaining <= 1 && (
              <div style={{
                fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                background: red, color: 'white',
              }}>
                ⚠ Credits fast aufgebraucht
              </div>
            )}
          </div>
        )}

        {/* ── Free tier description ── */}
        <div style={{
          marginBottom: 40, padding: '20px 24px', borderRadius: 14,
          background: 'white', border: '1.5px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: '#f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
            }}>🆓</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: navy }}>Gratis — immer kostenlos</div>
              <div style={{ fontSize: 12, color: slate }}>Kein Abo, keine Kreditkarte erforderlich</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
            {[
              '✓ Unbegrenzt Dokumente hochladen & speichern',
              '✓ Automatische Klassifizierung (Arzt, Datum, Betrag)',
              '✓ Erstattungs-Tracker & Dashboard',
              '✓ 2 vollständige KI-Analysen (Lifetime)',
            ].map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: '#334155', padding: '3px 0' }}>{f}</div>
            ))}
          </div>
        </div>

        {/* ── PRO Annual ── */}
        <div style={{
          marginBottom: 40, padding: '24px', borderRadius: 16,
          background: `linear-gradient(135deg, ${navy} 0%, #1e293b 100%)`,
          color: 'white', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 200, height: 200,
            borderRadius: '50%', background: 'rgba(16,185,129,0.08)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <span style={{
                  fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em',
                  fontFamily: "'DM Serif Display', Georgia, serif",
                }}>
                  MediRight PRO
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: mint, color: 'white', letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  Empfohlen
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
                  {fmt(PRO_SUBSCRIPTION.priceEur)}
                </span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>/Jahr</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                = {fmt(PRO_SUBSCRIPTION.perMonth)}/Monat · Einmalige Jahreszahlung
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 20 }}>
                {PRO_SUBSCRIPTION.features.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', display: 'flex', gap: 8 }}>
                    <span style={{ color: mint, flexShrink: 0 }}>✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flexShrink: 0, width: 200 }}>
              <div style={{
                padding: '14px 16px', borderRadius: 12, marginBottom: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6,
              }}>
                💡 <strong style={{ color: 'white' }}>Bereits 1 erfolgreicher Widerspruch</strong> (meist €50–200) rechnet sich das Jahresabo mehrfach.
              </div>
              {isPro ? (
                <div style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, textAlign: 'center',
                  background: mintL, color: '#065f46', fontSize: 13, fontWeight: 700,
                }}>
                  ✅ Aktiv bis {credits?.subscriptionExpiresAt
                    ? new Date(credits.subscriptionExpiresAt).toLocaleDateString('de-DE')
                    : '–'}
                </div>
              ) : (
                <BuyButton
                  type="pro"
                  label="PRO Jahresabo starten"
                  style={{ background: mint, color: 'white' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Credit Packs ── */}
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: navy, margin: '0 0 6px' }}>
            Pay-per-Use: Credit-Pakete
          </h2>
          <p style={{ fontSize: 13, color: slate, margin: '0 0 20px' }}>
            Kein Abo. Credits verfallen nicht. Ideal für gelegentliche Nutzung.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 16,
          }}>
            {CREDIT_PACKS.map(pack => (
              <CreditPackCard key={pack.id} pack={pack} isPro={isPro} />
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div style={{ marginTop: 48, padding: '24px', borderRadius: 16, background: 'white', border: '1.5px solid #e2e8f0' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: navy, margin: '0 0 16px' }}>Häufige Fragen</h3>
          {[
            { q: 'Was ist ein Analyse-Credit?', a: '1 Credit deckt eine vollständige Prüfung einer Arztrechnung oder eines Kassenbescheids ab — inkl. GOÄ-Check, Kumulationsverbote, Analogziffern und dem fertigen Widerspruchs- oder Korrekturbrief.' },
            { q: 'Verfallen Credits?', a: 'Nein. Einmal gekaufte Credits verfallen nicht und bleiben dauerhaft auf deinem Konto.' },
            { q: 'Was passiert wenn ich kein Credit mehr habe?', a: 'Dokumente werden weiterhin gespeichert und klassifiziert. Die KI-Analyse wird erst ausgeführt, sobald du neue Credits kaufst.' },
            { q: 'Kann ich PRO kündigen?', a: 'Ja, jederzeit. Das Abo läuft bis zum Ende des bezahlten Jahreszeitraums und verlängert sich nicht automatisch ohne erneute Bestätigung.' },
          ].map(({ q, a }, i) => (
            <div key={i} style={{ marginBottom: i < 3 ? 14 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: navy, marginBottom: 3 }}>{q}</div>
              <div style={{ fontSize: 12, color: slate, lineHeight: 1.6 }}>{a}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
