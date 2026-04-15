'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type UploadType = 'arztrechnung' | 'kassenbescheid'

type Phase = 'idle' | 'uploading' | 'analysing' | 'success' | 'error'

interface ArztResult {
  arztName?: string
  betragGesamt?: number
  einsparpotenzial?: number
  flagFaktorUeberSchwellenwert?: boolean
  flagFehlendeBegrundung?: boolean
  zusammenfassung?: string
  positionen?: number
}

interface KasseResult {
  bescheiddatum?: string
  referenznummer?: string
  betragEingereicht?: number
  betragErstattet?: number
  betragAbgelehnt?: number
  erstattungsquote?: number
  widerspruchEmpfohlen?: boolean
  matchedRechnungen?: number
  totalRechnungen?: number
  zusammenfassung?: string
}

type AnalysisResult = ArztResult & KasseResult & { error?: string }

const navy  = '#0f172a'
const slate = '#64748b'
const mint  = '#10b981'
const mintL = '#ecfdf5'
const red   = '#ef4444'
const redL  = '#fef2f2'
const amber = '#f59e0b'
const blue  = '#3b82f6'
const blueL = '#eff6ff'

function formatEur(n?: number) {
  if (n == null) return '–'
  return n.toFixed(2) + ' €'
}

interface Props {
  type: UploadType
  onClose: () => void
}

export default function UploadModal({ type, onClose }: Props) {
  const router = useRouter()
  const [phase, setPhase]     = useState<Phase>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [file, setFile]       = useState<File | null>(null)
  const [drag, setDrag]       = useState(false)
  const [result, setResult]   = useState<AnalysisResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isArzt  = type === 'arztrechnung'
  const title   = isArzt ? '📄 Arztrechnung hochladen' : '🏥 Kassenbescheid hochladen'
  const endpoint = isArzt ? '/api/upload/arztrechnung' : '/api/upload/kassenbescheid'

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      alert('Bitte nur PDF-Dateien hochladen.')
      return
    }
    setFile(f)
    setFileName(f.name)
    setPhase('idle')
    setResult(null)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  async function handleUpload() {
    if (!file) return
    setPhase('uploading')
    setResult(null)

    const fd = new FormData()
    fd.append('file', file)

    try {
      // Short delay to show "Uploading" before switching to "Analysing"
      const controller = new AbortController()
      const timeoutId = setTimeout(() => setPhase('analysing'), 1500)

      const res = await fetch(endpoint, { method: 'POST', body: fd, signal: controller.signal })
      clearTimeout(timeoutId)

      const data: AnalysisResult = await res.json()

      if (!res.ok || data.error) {
        setResult(data)
        setPhase('error')
      } else {
        setResult(data)
        setPhase('success')
        // Refresh server data without full navigation
        router.refresh()
      }
    } catch (e) {
      setResult({ error: String(e) })
      setPhase('error')
    }
  }

  function reset() {
    setFile(null)
    setFileName(null)
    setPhase('idle')
    setResult(null)
  }

  const isLoading = phase === 'uploading' || phase === 'analysing'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget && !isLoading) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 560, boxShadow: '0 32px 80px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: navy, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>{title}</div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 3 }}>
              {isArzt
                ? 'PDF hochladen → KI analysiert GOÄ-Positionen automatisch'
                : 'PDF hochladen → KI analysiert Erstattungen & Widerspruchspotenzial'}
            </div>
          </div>
          {!isLoading && (
            <button onClick={onClose} style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          )}
        </div>

        <div style={{ padding: 24 }}>
          {/* ── Success state ──────────────────────────────────────────────── */}
          {phase === 'success' && result && (
            <>
              <div style={{ background: mintL, borderRadius: 12, padding: 20, borderLeft: `4px solid ${mint}`, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: '#065f46', fontSize: 15, marginBottom: 12 }}>
                  ✅ {isArzt ? 'Rechnung analysiert' : 'Kassenbescheid analysiert'}
                </div>

                {isArzt ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.arztName && <Row label="Arzt" value={result.arztName} />}
                    <Row label="Gesamtbetrag" value={formatEur(result.betragGesamt)} />
                    <Row label="GOÄ-Positionen" value={String(result.positionen ?? '–')} />
                    {(result.einsparpotenzial ?? 0) > 0 && (
                      <Row label="⚡ Einsparpotenzial" value={formatEur(result.einsparpotenzial)} highlight="amber" />
                    )}
                    {result.flagFaktorUeberSchwellenwert && (
                      <Row label="⚠️ Faktor über 2,3×" value="Begründung prüfen" highlight="red" />
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.bescheiddatum && <Row label="Bescheid vom" value={result.bescheiddatum} />}
                    {result.referenznummer && <Row label="Referenz" value={result.referenznummer} />}
                    <Row label="Eingereicht" value={formatEur(result.betragEingereicht)} />
                    <Row label="Erstattet" value={formatEur(result.betragErstattet)} />
                    {(result.betragAbgelehnt ?? 0) > 0 && (
                      <Row label="❌ Abgelehnt" value={formatEur(result.betragAbgelehnt)} highlight="red" />
                    )}
                    {result.widerspruchEmpfohlen && (
                      <Row label="⚡ Widerspruch" value="Empfohlen" highlight="amber" />
                    )}
                    {(result.totalRechnungen ?? 0) > 0 && (
                      <Row
                        label="Zuordnung"
                        value={`${result.matchedRechnungen}/${result.totalRechnungen} Rechnungen gematcht`}
                      />
                    )}
                  </div>
                )}

                {result.zusammenfassung && (
                  <p style={{ fontSize: 12, color: '#065f46', marginTop: 12, lineHeight: 1.6, margin: '12px 0 0' }}>
                    {result.zusammenfassung}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { reset(); onClose() }}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: navy, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                >
                  Fertig — Ansicht aktualisiert ✓
                </button>
                <button
                  onClick={reset}
                  style={{ padding: '11px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: 'white', color: slate, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Weiteres hochladen
                </button>
              </div>
            </>
          )}

          {/* ── Error state ───────────────────────────────────────────────── */}
          {phase === 'error' && (
            <>
              <div style={{ background: redL, borderRadius: 12, padding: 16, borderLeft: `4px solid ${red}`, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 14, marginBottom: 6 }}>Fehler bei der Analyse</div>
                <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0, lineHeight: 1.5 }}>
                  {result?.error ?? 'Unbekannter Fehler'}
                </p>
              </div>
              <button
                onClick={reset}
                style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: '#f1f5f9', color: navy, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Erneut versuchen
              </button>
            </>
          )}

          {/* ── Loading state ─────────────────────────────────────────────── */}
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Spinner />
              <div style={{ fontWeight: 700, color: navy, fontSize: 15, marginTop: 16 }}>
                {phase === 'uploading' ? 'PDF wird hochgeladen…' : '🤖 Claude analysiert das Dokument…'}
              </div>
              <div style={{ color: slate, fontSize: 13, marginTop: 8 }}>
                {phase === 'uploading'
                  ? 'Datei wird sicher übertragen'
                  : isArzt
                    ? 'GOÄ-Ziffern, Faktoren und Auffälligkeiten werden geprüft'
                    : 'Erstattungen, Ablehnungsgründe und Widerspruchspotenzial werden ermittelt'}
              </div>
            </div>
          )}

          {/* ── Idle / file select state ──────────────────────────────────── */}
          {(phase === 'idle') && (
            <>
              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${drag ? blue : '#cbd5e1'}`,
                  borderRadius: 14,
                  padding: '32px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: drag ? blueL : '#f8fafc',
                  transition: 'all 0.15s',
                  marginBottom: 16,
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
                <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
                {fileName ? (
                  <>
                    <div style={{ fontWeight: 700, color: navy, fontSize: 14, marginBottom: 4 }}>{fileName}</div>
                    <div style={{ fontSize: 12, color: mint, fontWeight: 600 }}>✓ Datei ausgewählt — bereit zum Upload</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, color: navy, fontSize: 14, marginBottom: 4 }}>PDF hier ablegen</div>
                    <div style={{ fontSize: 13, color: slate }}>oder klicken zum Auswählen</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Nur PDF-Dateien · Max. 10 MB</div>
                  </>
                )}
              </div>

              {/* Upload button */}
              <button
                onClick={handleUpload}
                disabled={!file}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
                  background: file ? navy : '#e2e8f0',
                  color: file ? 'white' : slate,
                  fontWeight: 700, fontSize: 14,
                  cursor: file ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >
                {file ? `📤 Hochladen & analysieren` : 'Zuerst PDF auswählen'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function Row({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'amber' }) {
  const color = highlight === 'red' ? red : highlight === 'amber' ? amber : slate
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 12 }}>
      <span style={{ color: slate }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 44, height: 44, margin: '0 auto',
      border: '4px solid #e2e8f0',
      borderTopColor: blue,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
