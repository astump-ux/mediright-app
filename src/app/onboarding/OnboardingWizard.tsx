'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Design tokens ─────────────────────────────────────────────────────────────
const navy  = '#0f172a'
const slate = '#64748b'
const mint  = '#10b981'
const mintL = '#ecfdf5'
const blue  = '#3b82f6'
const blueL = '#eff6ff'
const amber = '#f59e0b'
const red   = '#ef4444'

interface Props {
  credits: number
  existingName: string
}

export default function OnboardingWizard({ credits, existingName }: Props) {
  const router = useRouter()
  const [step, setStep]     = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Step 2 form state
  const [fullName,      setFullName]      = useState(existingName)
  const [pkvName,       setPkvName]       = useState('')
  const [pkvTarif,      setPkvTarif]      = useState('')
  const [phoneWhatsapp, setPhoneWhatsapp] = useState('')

  async function handleSaveProfile() {
    if (!fullName.trim()) { setError('Bitte gib deinen Namen ein.'); return }
    if (!pkvName.trim())  { setError('Bitte gib den Namen deiner Krankenversicherung ein.'); return }
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:      fullName.trim(),
          pkv_name:       pkvName.trim(),
          pkv_tarif:      pkvTarif.trim(),
          phone_whatsapp: phoneWhatsapp.trim(),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Unbekannter Fehler')
      }
      setStep(3)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {([1, 2, 3] as const).map(s => (
            <div key={s} style={{
              width: s === step ? 28 : 10,
              height: 10,
              borderRadius: 5,
              background: s === step ? mint : s < step ? mint + '99' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: 'white',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
        }}>

          {/* ── Step 1: Willkommen ─────────────────────────────────────── */}
          {step === 1 && (
            <>
              {/* Hero */}
              <div style={{ background: navy, padding: '36px 32px 28px', textAlign: 'center' }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🏥</div>
                <h1 style={{ color: 'white', fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>
                  Willkommen bei MediRight
                </h1>
                <p style={{ color: '#94a3b8', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                  Dein persönlicher PKV-Assistent — damit du bei jeder Rechnung & jedem Kassenbescheid
                  das Maximum zurückbekommst.
                </p>
              </div>

              {/* Features */}
              <div style={{ padding: '28px 32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
                  <Feature
                    icon="🔍"
                    title="GOÄ-Analyse in Sekunden"
                    desc="Wir prüfen jede Arztrechnung auf überhöhte Faktoren, fehlende Begründungen und Auffälligkeiten."
                  />
                  <Feature
                    icon="💶"
                    title="Mehr Erstattung von der Kasse"
                    desc="Kassenbescheide werden automatisch auf Ablehnungen geprüft — inkl. Widerspruchsbrief-Entwurf."
                  />
                  <Feature
                    icon="⚡"
                    title="Widerspruch auf Knopfdruck"
                    desc="KI-generierte Musterbriefe, die rechtlich fundiert und individuell auf deine Situation abgestimmt sind."
                  />
                  <Feature
                    icon="📁"
                    title="Alles an einem Ort"
                    desc="Alle Rechnungen, Bescheide und Widersprüche übersichtlich verwaltet — nie wieder Papierchaos."
                  />
                </div>

                <button
                  onClick={() => setStep(2)}
                  style={{
                    width: '100%',
                    padding: '15px 0',
                    borderRadius: 12,
                    border: 'none',
                    background: `linear-gradient(135deg, ${mint} 0%, #059669 100%)`,
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  Los geht's →
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Profil ─────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div style={{ background: navy, padding: '28px 32px 24px' }}>
                <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Schritt 2 von 3
                </div>
                <h2 style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
                  Dein Profil einrichten
                </h2>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                  Damit wir Rechnungen & Bescheide korrekt zuordnen können.
                </p>
              </div>

              <div style={{ padding: '28px 32px' }}>
                {error && (
                  <div style={{ background: '#fef2f2', border: `1.5px solid ${red}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20, color: '#991b1b', fontSize: 13, fontWeight: 500 }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                  <Field
                    label="Dein vollständiger Name *"
                    placeholder="Max Mustermann"
                    value={fullName}
                    onChange={setFullName}
                  />
                  <Field
                    label="Krankenversicherung *"
                    placeholder="z.B. AXA, Allianz, DKV …"
                    value={pkvName}
                    onChange={setPkvName}
                  />
                  <Field
                    label="Tarif (optional)"
                    placeholder="z.B. ActiveMe-U, MedBest …"
                    value={pkvTarif}
                    onChange={setPkvTarif}
                  />
                  <Field
                    label="WhatsApp-Nummer (optional)"
                    placeholder="+49 151 …"
                    value={phoneWhatsapp}
                    onChange={setPhoneWhatsapp}
                    type="tel"
                    hint="Für automatischen Dokumenteneingang per WhatsApp"
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => { setError(''); setStep(1) }}
                    disabled={saving}
                    style={{
                      padding: '13px 20px',
                      borderRadius: 12,
                      border: '1.5px solid #e2e8f0',
                      background: 'white',
                      color: slate,
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    ← Zurück
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '13px 0',
                      borderRadius: 12,
                      border: 'none',
                      background: saving ? '#e2e8f0' : navy,
                      color: saving ? slate : 'white',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {saving ? 'Wird gespeichert…' : 'Weiter →'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Step 3: Bereit! ────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div style={{ background: navy, padding: '36px 32px 28px', textAlign: 'center' }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
                <h2 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>
                  Alles bereit!
                </h2>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  Dein Konto ist eingerichtet. Lade jetzt deine erste Rechnung hoch.
                </p>
              </div>

              <div style={{ padding: '28px 32px' }}>
                {/* Credits pill */}
                <div style={{
                  background: credits > 0 ? mintL : '#fffbeb',
                  border: `1.5px solid ${credits > 0 ? mint : amber}`,
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 24,
                }}>
                  <div style={{ fontSize: 28 }}>{credits > 0 ? '⚡' : '💡'}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: navy, fontSize: 14 }}>
                      {credits > 0
                        ? `${credits} Analyse-Credit${credits !== 1 ? 's' : ''} verfügbar`
                        : 'Demnächst Credits kaufen'}
                    </div>
                    <div style={{ fontSize: 12, color: slate, marginTop: 2 }}>
                      {credits > 0
                        ? 'Arztrechnung hochladen ist kostenlos · Kassenbescheid-Analyse verbraucht 1 Credit'
                        : 'Arztrechnungen analysieren ist immer kostenlos'}
                    </div>
                  </div>
                </div>

                {/* Upload CTAs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  <CtaButton
                    icon="📄"
                    title="Arztrechnung hochladen"
                    subtitle="Kostenlos · GOÄ-Analyse in Sekunden"
                    color={navy}
                    onClick={() => router.push('/dashboard?upload=arztrechnung')}
                  />
                  <CtaButton
                    icon="🏥"
                    title="Kassenbescheid hochladen"
                    subtitle={credits > 0 ? '1 Credit · Erstattungs- & Widerspruchsanalyse' : '1 Credit erforderlich'}
                    color={credits > 0 ? blue : slate}
                    onClick={() => router.push('/dashboard?upload=kassenbescheid')}
                  />
                </div>

                <button
                  onClick={() => router.push('/dashboard')}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 12,
                    border: '1.5px solid #e2e8f0',
                    background: 'white',
                    color: slate,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Erstmal zum Dashboard →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 20 }}>
          MediRight · Deine Daten werden sicher und vertraulich behandelt
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: mintL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 700, color: navy, fontSize: 14, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: slate, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  )
}

function Field({
  label, placeholder, value, onChange, type = 'text', hint,
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string; hint?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: navy, marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '11px 14px',
          borderRadius: 10,
          border: '1.5px solid #e2e8f0',
          fontSize: 14,
          color: navy,
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = mint }}
        onBlur={e   => { e.currentTarget.style.borderColor = '#e2e8f0' }}
      />
      {hint && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}

function CtaButton({
  icon, title, subtitle, color, onClick,
}: {
  icon: string; title: string; subtitle: string; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '14px 18px',
        borderRadius: 12,
        border: 'none',
        background: color,
        color: 'white',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        textAlign: 'left',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      <span style={{ fontSize: 26, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{subtitle}</div>
      </div>
      <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: 16 }}>→</span>
    </button>
  )
}
