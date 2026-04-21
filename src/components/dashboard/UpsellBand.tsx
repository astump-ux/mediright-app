'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DashboardData } from "@/types"

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 })
}

interface CreditStatus {
  balance: number
  freeRemaining: number
  isPro: boolean
  proExpiresAt: string | null
}

// ── 5-state CTA panel ────────────────────────────────────────────────────────
function CtaPanel({ credits, totalPot, kasseName }: {
  credits: CreditStatus | null
  totalPot: number
  kasseName: string
}) {
  if (!credits) {
    // Loading skeleton
    return (
      <div className="flex flex-col items-center gap-3 flex-shrink-0 animate-pulse">
        <div className="rounded-xl px-6 py-4 w-56 h-20" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="rounded-full w-48 h-11" style={{ background: 'rgba(255,255,255,0.12)' }} />
      </div>
    )
  }

  const { balance, freeRemaining, isPro } = credits

  // ── State 4: PRO active ──
  if (isPro) {
    return (
      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <div
          className="rounded-xl px-5 py-3 text-center w-52"
          style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)' }}
        >
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#10b981' }}>
            ✅ PRO Aktiv
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Unbegrenzte Analysen
          </div>
        </div>
        <Link
          href="/widersprueche"
          className="flex items-center gap-2 font-bold text-sm text-white px-7 py-3.5 rounded-full"
          style={{ background: 'var(--mint)' }}
        >
          ✍️ Widersprüche starten
        </Link>
      </div>
    )
  }

  // ── State 1: No credits left ──
  if (freeRemaining === 0 && balance === 0) {
    return (
      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <div
          className="rounded-xl px-5 py-3 text-center w-56"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)' }}
        >
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#ef4444' }}>
            ⚠ Keine Credits mehr
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Analysen pausiert
          </div>
        </div>
        <Link
          href="/pricing"
          className="flex items-center gap-2 font-bold text-sm text-white px-7 py-3.5 rounded-full"
          style={{ background: '#ef4444' }}
        >
          ⚡ Jetzt Credits kaufen
        </Link>
        {totalPot > 0 && (
          <div className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
            € {fmt(totalPot)} potenzielle Rückerstattung warten
          </div>
        )}
      </div>
    )
  }

  // ── State 2: 1 credit left ──
  if (freeRemaining === 0 && balance === 1) {
    return (
      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <div
          className="rounded-xl px-5 py-3 text-center w-56"
          style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)' }}
        >
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#f59e0b' }}>
            ⚠ Noch 1 Credit verbleibend
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Fast aufgebraucht
          </div>
        </div>
        <Link
          href="/widersprueche"
          className="flex items-center gap-2 font-bold text-sm text-white px-7 py-3.5 rounded-full"
          style={{ background: 'var(--mint)' }}
        >
          ✍️ Widersprüche starten
        </Link>
        <Link
          href="/pricing"
          className="text-xs font-semibold"
          style={{ color: '#f59e0b' }}
        >
          Credits nachkaufen →
        </Link>
      </div>
    )
  }

  // ── State 3: Free analyses remaining ──
  if (freeRemaining > 0 && balance === 0) {
    return (
      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <div
          className="rounded-xl px-5 py-3 text-center w-56"
          style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#10b981' }}>
            ✅ {freeRemaining} kostenlose {freeRemaining === 1 ? 'Analyse' : 'Analysen'} verbleibend
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Danach: Credits ab €7.99
          </div>
        </div>
        <Link
          href="/widersprueche"
          className="flex items-center gap-2 font-bold text-sm text-white px-7 py-3.5 rounded-full"
          style={{ background: 'var(--mint)' }}
        >
          ✍️ Widersprüche starten
        </Link>
        <Link
          href="/pricing"
          className="text-xs font-semibold"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          Preise ansehen →
        </Link>
      </div>
    )
  }

  // ── State 5: Enough credits (≥ 2) ──
  return (
    <div className="flex flex-col items-center gap-3 flex-shrink-0">
      {totalPot > 0 && (
        <div className="text-center">
          <div className="text-4xl italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: 'var(--mint)' }}>
            € {fmt(totalPot)}
          </div>
          <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            potenzielle Rückerstattung
          </div>
        </div>
      )}
      <div
        className="rounded-full px-4 py-1.5 text-xs font-bold"
        style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}
      >
        ⚡ {balance} {balance === 1 ? 'Credit' : 'Credits'} verfügbar
      </div>
      <Link
        href="/widersprueche"
        className="flex items-center gap-2 font-bold text-sm text-white px-7 py-3.5 rounded-full"
        style={{ background: 'var(--mint)' }}
      >
        ✍️ Widersprüche jetzt starten
      </Link>
      <Link
        href="/pricing"
        className="text-xs font-semibold px-7 py-3 rounded-full border"
        style={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.15)' }}
      >
        👁️ Beispiel-Widerspruch ansehen
      </Link>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UpsellBand({ data }: { data: DashboardData }) {
  const [credits, setCredits] = useState<CreditStatus | null>(null)

  useEffect(() => {
    fetch('/api/credits')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCredits(d) })
      .catch(() => {/* silently ignore */})
  }, [])

  const kassePot    = data.widerspruchPotenzialKasse ?? 0
  const arztGOÄPot  = data.einsparpotenzial ?? 0
  const arztKassePot = data.korrekturArztPotenzial ?? 0
  const arztPot     = Math.max(arztGOÄPot, arztKassePot)
  const totalPot    = kassePot + arztPot
  const kasseName   = data.user.kasse || "PKV"
  const eCount      = data.einsparpotenzialCount ?? 0

  const items = [
    kassePot > 0 && `Widerspruchsbrief gegen ${kasseName}-Ablehnung`,
    arztPot  > 0 && (arztKassePot > arztGOÄPot ? `Korrektur-/Änderungsbitte an Arzt/Labor` : `§12 GOÄ-Beanstandung an Ihren Arzt`),
    "Automatische Fristenüberwachung (Verjährung 3 Jahre)",
    "Vollständige Benchmark-Daten unbegrenzt",
  ].filter(Boolean) as string[]

  return (
    <div
      className="mt-9 rounded-2xl p-8 flex items-center justify-between gap-6 flex-wrap"
      style={{ background: "var(--navy)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--mint)" }}>
          🔓 MediRight Premium
        </p>
        <h3 className="text-2xl text-white mb-2 italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
          {totalPot > 0
            ? `€ ${fmt(totalPot)} warten auf Ihre Schritte.`
            : "Ihre Unterlagen werden laufend geprüft."}
        </h3>
        <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
          {eCount > 0
            ? `In ${eCount} Vorgängen haben wir anfechtbare Positionen identifiziert. Erstellen Sie die rechtssicheren Schreiben — fertig zum Versand.`
            : "Rechtssichere Widerspruchsschreiben und GOÄ-Beanstandungen — fertig zum Versand."}
        </p>

        {/* Breakdown chips */}
        {(kassePot > 0 || arztPot > 0) && (
          <div className="flex gap-4 mb-4">
            {kassePot > 0 && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  🛡️ {kasseName} Widerspruch
                </div>
                <div className="font-bold text-lg italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--mint)" }}>
                  € {fmt(kassePot)}
                </div>
              </div>
            )}
            {arztPot > 0 && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  🩺 {arztKassePot > arztGOÄPot ? "Ärzte Korrektur" : "Ärzte GOÄ"}
                </div>
                <div className="font-bold text-lg italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "rgba(255,255,255,0.8)" }}>
                  € {fmt(arztPot)}
                </div>
              </div>
            )}
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item} className="text-sm flex items-start gap-2" style={{ color: "rgba(255,255,255,0.7)" }}>
              <span style={{ color: "var(--mint)", flexShrink: 0 }}>✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <CtaPanel credits={credits} totalPot={totalPot} kasseName={kasseName} />
    </div>
  )
}
