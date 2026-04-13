"use client"
import type { DashboardData } from "@/types"

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 })
}

interface Stage {
  label: string
  sublabel: string
  amount: number
  color: string
  icon: string
  done: boolean
  active: boolean
  ctaLabel?: string
  ctaHref?: string
}

export default function SavingsProgress({ data }: { data: DashboardData }) {
  const kassePot  = data.widerspruchPotenzialKasse ?? 0
  const arztPot   = data.einsparpotenzial ?? 0
  const totalPot  = kassePot + arztPot
  const kasseName = data.user.kasse || "PKV"

  if (totalPot === 0) return null

  // Pipeline stages
  const stages: Stage[] = [
    {
      label:    "Einsparpotenzial identifiziert",
      sublabel: `${kassePot > 0 ? `${kasseName}: ${fmt(kassePot)} €` : ""}${kassePot > 0 && arztPot > 0 ? " · " : ""}${arztPot > 0 ? `Ärzte: ${fmt(arztPot)} €` : ""}`,
      amount:   totalPot,
      color:    "#f59e0b",
      icon:     "🔍",
      done:     false,
      active:   true,
      ctaLabel: "Widerspruch prüfen →",
      ctaHref:  "/widersprueche",
    },
    {
      label:    "Widerspruch / Korrektur eingeleitet",
      sublabel: "Schreiben erstellt und versendet",
      amount:   0,
      color:    "#3b82f6",
      icon:     "📝",
      done:     false,
      active:   false,
    },
    {
      label:    "Erstattung erhalten",
      sublabel: "Von Kasse oder Arzt zurückerstattet",
      amount:   0,
      color:    "#22c55e",
      icon:     "✅",
      done:     false,
      active:   false,
    },
  ]

  const activeIndex = stages.findIndex(s => s.active)

  return (
    <div
      className="rounded-2xl mb-7 overflow-hidden"
      style={{ border: "2px solid #fde68a", background: "linear-gradient(135deg, #fffbeb 0%, #fef9f0 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-100">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
            style={{ background: "#fef3c7", border: "1px solid #fde68a" }}
          >
            💡
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: "#92400e" }}>
              Ihr Einsparpotenzial dieses Jahr
            </p>
            <p className="text-xs" style={{ color: "#b45309" }}>
              Jede dieser Positionen ist anfechtbar — wir führen Sie durch den Prozess
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="text-3xl italic leading-none"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "#b45309" }}
          >
            € {fmt(totalPot)}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "#d97706" }}>identifiziert</div>
        </div>
      </div>

      {/* Progress pipeline */}
      <div className="px-6 py-5">
        <div className="flex items-start gap-0 relative">
          {/* Connector lines */}
          <div
            className="absolute top-5 left-5 right-5 h-0.5"
            style={{ background: "linear-gradient(90deg, #fde68a 33%, #e2e8f0 33%)" }}
          />

          {stages.map((stage, i) => {
            const isActive = i === activeIndex
            const isDone   = stage.done
            return (
              <div key={i} className="flex-1 flex flex-col items-center relative z-10 px-2">
                {/* Circle */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-3 flex-shrink-0 shadow-sm"
                  style={{
                    background: isDone ? "#d1fae5" : isActive ? "#fef3c7" : "#f1f5f9",
                    border: `2px solid ${isDone ? "#22c55e" : isActive ? "#f59e0b" : "#e2e8f0"}`,
                    color: isDone ? "#065f46" : isActive ? "#92400e" : "#94a3b8",
                  }}
                >
                  {isDone ? "✓" : isActive ? stage.icon : stage.icon}
                </div>

                <div className="text-center">
                  <div
                    className="text-xs font-bold mb-0.5"
                    style={{ color: isDone ? "#065f46" : isActive ? "#92400e" : "#94a3b8" }}
                  >
                    {stage.label}
                  </div>
                  <div className="text-[10px]" style={{ color: isDone ? "#6ee7b7" : isActive ? "#b45309" : "#cbd5e1" }}>
                    {isActive && stage.amount > 0 ? `€ ${fmt(stage.amount)}` : stage.sublabel}
                  </div>

                  {/* CTA button on active stage */}
                  {isActive && stage.ctaLabel && (
                    <a
                      href={stage.ctaHref ?? "#"}
                      className="inline-block mt-2 text-[11px] font-bold px-3 py-1 rounded-full"
                      style={{ background: "#f59e0b", color: "white" }}
                    >
                      {stage.ctaLabel}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Split breakdown row */}
      {kassePot > 0 && arztPot > 0 && (
        <div className="flex border-t border-amber-100">
          <div className="flex-1 px-6 py-3 flex items-center gap-2.5 border-r border-amber-100">
            <span className="text-sm">🛡️</span>
            <div className="flex-1">
              <div className="text-[11px] font-bold" style={{ color: "#92400e" }}>Widerspruch bei {kasseName}</div>
              <div className="text-[10px]" style={{ color: "#b45309" }}>Formaler Einspruch gegen Ablehnung</div>
            </div>
            <div className="font-bold text-sm" style={{ color: "#b45309" }}>€ {fmt(kassePot)}</div>
          </div>
          <div className="flex-1 px-6 py-3 flex items-center gap-2.5">
            <span className="text-sm">🩺</span>
            <div className="flex-1">
              <div className="text-[11px] font-bold" style={{ color: "#78350f" }}>Korrektur beim Arzt</div>
              <div className="text-[10px]" style={{ color: "#b45309" }}>Änderungsbitte an Arzt / Labor</div>
            </div>
            <div className="font-bold text-sm" style={{ color: "#78350f" }}>€ {fmt(arztPot)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
