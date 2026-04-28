'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Design tokens ─────────────────────────────────────────────────────────────
const navy  = '#0f172a'
const slate = '#64748b'
const mint  = '#10b981'
const mintL = '#ecfdf5'
const blue  = '#3b82f6'
const amber = '#f59e0b'
const red   = '#ef4444'

interface Props {
  credits: number
  existingName: string
}

export default function OnboardingWizard({ credits, existingName }: Props) {
  const router = useRouter()
  const [step, setStep]     = useState<1 | 2 | 3 | 4>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Step 2 form state
  const [fullName,      setFullName]      = useState(existingName)
  const [pkvName,       setPkvName]       = useState('')
  const [pkvTarif,      setPkvTarif]      = useState('')
  const [phoneWhatsapp, setPhoneWhatsapp] = useState('')

  // Step 3 AVB upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile,   setSelectedFile]   = useState<File | null>(null)
  const [uploadStatus,   setUploadStatus]   = useState<'idle' | 'uploading' | 'analyzing' | 'completed' | 'failed'>('idle')
  const [analyseMessage, setAnalyseMessage] = useState('')
  const [pollingTimer,   setPollingTimer]   = useState<ReturnType<typeof setInterval> | null>(null)

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

  async function handleAvbUpload() {
    if (!selectedFile) return
    setUploadStatus('uploading')
    setAnalyseMessage('')

    try {
      // ── Step 1: API reserviert Storage-Pfad + DB-Einträge, gibt Signed Upload URL zurück
      // (kein Datei-Payload → kein Vercel 4.5 MB Limit)
      const prepRes = await fetch('/api/upload/avb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName:   selectedFile.name,
          fileSize:   selectedFile.size,
          dateityp:   'avb',
        }),
      })
      if (!prepRes.ok) {
        const d = await prepRes.json().catch(() => ({}))
        throw new Error(d.error ?? 'Vorbereitung fehlgeschlagen')
      }
      const { signedUrl, token, storagePath, tarif_profile_id, dokument_id } = await prepRes.json()

      // ── Step 2: Datei direkt vom Browser zu Supabase Storage (bypasses Vercel komplett)
      const { getSupabaseClient } = await import('@/lib/supabase')
      const sb = getSupabaseClient()
      const { error: uploadErr } = await sb.storage
        .from('avb-dokumente')
        .uploadToSignedUrl(storagePath, token, selectedFile, { contentType: 'application/pdf' })
      if (uploadErr) throw new Error(uploadErr.message)

      // ── Step 3: KI-Analyse starten
      const res = await fetch('/api/upload/avb/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarif_profile_id, dokument_id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Analyse-Start fehlgeschlagen')
      }

      setUploadStatus('analyzing')
      setAnalyseMessage('Dokument wird von KI analysiert…')

      // Poll tarif-profile until completed or failed (max 3 min)
      let attempts = 0
      const MAX_ATTEMPTS = 36 // 36 × 5s = 3 min
      const timer = setInterval(async () => {
        attempts++
        try {
          const poll = await fetch('/api/tarif-profile')
          const data = await poll.json()
          const status = data?.profile?.analyse_status

          if (status === 'completed') {
            clearInterval(timer)
            setPollingTimer(null)
            setUploadStatus('completed')
            const versicherung = data?.profile?.versicherung || ''
            const tarif = data?.profile?.tarif_name || ''
            setAnalyseMessage(
              versicherung
                ? `Tarif erkannt: ${versicherung}${tarif ? ' · ' + tarif : ''}`
                : 'Analyse abgeschlossen'
            )
          } else if (status === 'failed') {
            clearInterval(timer)
            setPollingTimer(null)
            setUploadStatus('failed')
            setAnalyseMessage(data?.profile?.fehler_meldung ?? 'Analyse fehlgeschlagen')
          } else if (attempts >= MAX_ATTEMPTS) {
            clearInterval(timer)
            setPollingTimer(null)
            setUploadStatus('failed')
            setAnalyseMessage('Zeitüberschreitung — bitte später erneut versuchen')
          }
        } catch {
          // network blip — keep polling
        }
      }, 5000)
      setPollingTimer(timer)

    } catch (e) {
      setUploadStatus('failed')
      setAnalyseMessage(String(e))
    }
  }

  function handleSkipAvb() {
    if (pollingTimer) clearInterval(pollingTimer)
    setStep(4)
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

        {/* Progress dots — 4 steps */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {([1, 2, 3, 4] as const).map(s => (
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
                  Los geht&apos;s →
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Profil ─────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div style={{ background: navy, padding: '28px 32px 24px' }}>
                <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Schritt 2 von 4
                </div>
                <h2 style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
                  Dein Profil einrichten
                </h2>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                  Damit wir Rechnungen &amp; Bescheide korrekt zuordnen können.
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

          {/* ── Step 3: AVB-Upload ─────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div style={{ background: navy, padding: '28px 32px 24px' }}>
                <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Schritt 3 von 4
                </div>
                <h2 style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
                  Versicherungsvertrag hochladen
                </h2>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                  Wir lesen deine AVB automatisch aus — für präzisere Analysen &amp; Widersprüche.
                </p>
              </div>

              <div style={{ padding: '28px 32px' }}>

                {/* Info box */}
                <div style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 20,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}>
                  <div style={{ fontSize: 22, flexShrink: 0 }}>💡</div>
                  <div style={{ fontSize: 12, color: slate, lineHeight: 1.6 }}>
                    Lade deine <strong>Allgemeinen Versicherungsbedingungen (AVB)</strong> oder deinen{' '}
                    <strong>Versicherungsschein</strong> als PDF hoch. MediRight extrahiert automatisch
                    Selbstbehalt, Erstattungssätze und Sonderklauseln — und nutzt diese Daten bei
                    jeder Kassenbescheid-Analyse.
                  </div>
                </div>

                {/* Upload area */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0] ?? null
                    setSelectedFile(f)
                    setUploadStatus('idle')
                    setAnalyseMessage('')
                  }}
                />

                {uploadStatus === 'idle' && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${selectedFile ? mint : '#cbd5e1'}`,
                      borderRadius: 14,
                      padding: '32px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: selectedFile ? mintL : '#f8fafc',
                      transition: 'all 0.2s',
                      marginBottom: 16,
                    }}
                    onMouseEnter={e => { if (!selectedFile) (e.currentTarget as HTMLDivElement).style.borderColor = mint }}
                    onMouseLeave={e => { if (!selectedFile) (e.currentTarget as HTMLDivElement).style.borderColor = '#cbd5e1' }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                    {selectedFile ? (
                      <>
                        <div style={{ fontWeight: 700, color: navy, fontSize: 14, marginBottom: 4 }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ fontSize: 12, color: slate }}>
                          {(selectedFile.size / 1024 / 1024).toFixed(1)} MB · PDF
                        </div>
                        <div style={{ fontSize: 11, color: mint, marginTop: 6 }}>Andere Datei wählen</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, color: navy, fontSize: 14, marginBottom: 4 }}>
                          PDF hier ablegen oder klicken
                        </div>
                        <div style={{ fontSize: 12, color: slate }}>AVB oder Versicherungsschein · max. 50 MB</div>
                      </>
                    )}
                  </div>
                )}

                {/* Uploading / Analyzing states */}
                {(uploadStatus === 'uploading' || uploadStatus === 'analyzing') && (
                  <div style={{
                    border: `1.5px solid ${blue}`,
                    borderRadius: 14,
                    padding: '24px 20px',
                    textAlign: 'center',
                    background: '#eff6ff',
                    marginBottom: 16,
                  }}>
                    <ProgressSpinner />
                    <div style={{ fontWeight: 700, color: navy, fontSize: 14, marginTop: 12, marginBottom: 4 }}>
                      {uploadStatus === 'uploading' ? 'Dokument wird hochgeladen…' : 'KI analysiert dein Dokument'}
                    </div>
                    <div style={{ fontSize: 12, color: slate }}>
                      {uploadStatus === 'uploading'
                        ? 'Einen Moment…'
                        : 'Das dauert ca. 30–60 Sekunden'}
                    </div>
                    {analyseMessage && (
                      <div style={{ fontSize: 12, color: blue, marginTop: 8 }}>{analyseMessage}</div>
                    )}
                  </div>
                )}

                {/* Completed */}
                {uploadStatus === 'completed' && (
                  <div style={{
                    border: `1.5px solid ${mint}`,
                    borderRadius: 14,
                    padding: '20px',
                    background: mintL,
                    display: 'flex',
                    gap: 14,
                    alignItems: 'center',
                    marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 32, flexShrink: 0 }}>✅</div>
                    <div>
                      <div style={{ fontWeight: 700, color: navy, fontSize: 14, marginBottom: 2 }}>
                        Analyse abgeschlossen!
                      </div>
                      <div style={{ fontSize: 12, color: slate }}>{analyseMessage}</div>
                    </div>
                  </div>
                )}

                {/* Failed */}
                {uploadStatus === 'failed' && (
                  <div style={{
                    border: `1.5px solid ${red}`,
                    borderRadius: 14,
                    padding: '16px',
                    background: '#fef2f2',
                    marginBottom: 16,
                  }}>
                    <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13, marginBottom: 4 }}>
                      Upload fehlgeschlagen
                    </div>
                    <div style={{ fontSize: 12, color: '#b91c1c' }}>{analyseMessage}</div>
                    <button
                      onClick={() => { setUploadStatus('idle'); setSelectedFile(null); setAnalyseMessage('') }}
                      style={{
                        marginTop: 10, padding: '8px 14px', borderRadius: 8,
                        border: 'none', background: red, color: 'white',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Erneut versuchen
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {uploadStatus === 'idle' && selectedFile && (
                    <button
                      onClick={handleAvbUpload}
                      style={{
                        width: '100%',
                        padding: '14px 0',
                        borderRadius: 12,
                        border: 'none',
                        background: `linear-gradient(135deg, ${mint} 0%, #059669 100%)`,
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: 'pointer',
                      }}
                    >
                      Jetzt analysieren →
                    </button>
                  )}

                  {uploadStatus === 'completed' && (
                    <button
                      onClick={() => setStep(4)}
                      style={{
                        width: '100%',
                        padding: '14px 0',
                        borderRadius: 12,
                        border: 'none',
                        background: `linear-gradient(135deg, ${mint} 0%, #059669 100%)`,
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: 'pointer',
                      }}
                    >
                      Weiter →
                    </button>
                  )}

                  {/* Skip — always shown except while uploading/analyzing */}
                  {uploadStatus !== 'uploading' && uploadStatus !== 'analyzing' && (
                    <button
                      onClick={handleSkipAvb}
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
                      {uploadStatus === 'completed' ? 'Überspringen' : 'Jetzt überspringen — später hochladen'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Step 4: Bereit! ────────────────────────────────────────── */}
          {step === 4 && (
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

function ProgressSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: 36,
        height: 36,
        border: `3px solid ${blue}33`,
        borderTop: `3px solid ${blue}`,
        borderRadius: '50%',
        animation: 'spin 0.9s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

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
