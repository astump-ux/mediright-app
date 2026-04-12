import type { DashboardData } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export default function KPIGrid({ data }: { data: DashboardData }) {
  const year        = data.currentYear ?? new Date().getFullYear()
  const count       = data.vorgangCount ?? data.vorgaenge.length
  const eCount        = data.einsparpotenzialCount ?? 0
  const kasseName     = data.user.kasse || "PKV"
  const kassePot      = data.widerspruchPotenzialKasse ?? 0
  const arztGOÄPot    = data.einsparpotenzial ?? 0
  const arztKassePot  = data.korrekturArztPotenzial ?? 0
  const arztPot       = Math.max(arztGOÄPot, arztKassePot)
  const totalPot      = kassePot + arztPot

  // Erstattungsquote color
  const quoteColor = data.erstattungsquote >= 80 ? "#22c55e"
    : data.erstattungsquote >= 60 ? "#f59e0b"
    : "#ef4444"

  return (
    <div className="mb-5">
      {/* Row 1: 4 KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* Gesundheitsausgaben */}
        <div className="rounded-2xl shadow-sm px-6 py-5" style={{ background: "white" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
            Gesundheitsausgaben {year}
          </div>
          <div className="text-3xl mb-1 leading-none italic"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
            € {fmt(data.jahresausgaben)}
          </div>
          <div className="text-xs" style={{ color: "#64748b" }}>
            {count} abgerechnete Vorgang{count !== 1 ? "‍e" : ""}
          </div>
        </div>

        {/* Eigenanteil */}
        <div className="rounded-2xl shadow-sm px-6 py-5" style={{ background: "white" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
            Ihr Eigenanteil netto
          </div>
          <div className="text-3xl mb-1 leading-none italic"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
            € {fmt(data.eigenanteil)}
          </div>
          <div className="text-xs" style={{ color: "#64748b" }}>
            Abgelehnte Leistungen + Selbstbehalt
          </div>
        </div>

        {/* Erstattungsquote */}
        <div className="rounded-2xl shadow-sm px-6 py-5" style={{ background: "white" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
            Erstattungsquote {kasseName}
          </div>
          <div className="text-3xl mb-1 leading-none italic"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: data.erstattungsquote > 0 ? quoteColor : "var(--navy)" }}>
            {data.erstattungsquote} %
          </div>
          <div className="text-xs" style={{ color: "#64748b" }}>
            {data.erstattungsquote === 0
              ? "Noch kein Kassenbescheid eingereicht"
              : "von eingereichten Leistungen erstattet"}
          </div>
        </div>

        {/* Einsparpotenzial — dark card, split */}
        <div className="rounded-2xl shadow-sm px-6 py-5" style={{ background: "var(--navy)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            Einsparpotenzial identifiziert
          </div>
          <div className="text-3xl mb-2 leading-none italic"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--mint)" }}>
            € {fmt(totalPot)}
          </div>

          {/* Split breakdown */}
          <div className="flex flex-col gap-1">
            {kassePot > 0 && (
              <div className="flex items-center justify-between text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                <span>🛡️ {kasseName} Widerspruch</span>
                <span className="font-bold" style={{ color: "var(--mint)" }}>€ {fmt(kassePot)}</span>
              </div>
            )}
            {arztPot > 0 && (
              <div className="flex items-center justify-between text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                <span>🩺 {arztKassePot > arztGOÄPot ? "Ärzte Korrektur" : "Ärzte GOÄ"}</span>
                <span className="font-bold" style={{ color: "rgba(255,255,255,0.75)" }}>€ {fmt(arztPot)}</span>
              </div>
            )}
            {totalPot === 0 && eCount === 0 && (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Keine Auffälligkeiten
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
