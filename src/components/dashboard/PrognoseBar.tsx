import type { DashboardData } from "@/types";

export default function PrognoseBar({ data }: { data: DashboardData }) {
  return (
    <div
      className="rounded-2xl px-6 py-4 mb-7 flex items-center justify-between gap-4 flex-wrap"
      style={{ background: "linear-gradient(135deg, #1e293b 0%, #1a2744 100%)" }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
          style={{
            background: "rgba(16,185,129,0.15)",
            border: "1px solid rgba(16,185,129,0.25)",
            color: "var(--mint)",
          }}
        >
          📈
        </div>
        <div>
          <p className="font-semibold text-white text-sm">Jahresprognose 2025</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
            Auf Basis Ihrer bisherigen 4 Monate: bis Dezember voraussichtlich
          </p>
        </div>
      </div>
      <div className="text-right">
        <div
          className="text-2xl italic leading-none"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--mint)" }}
        >
          € {data.prognose.toLocaleString("de-DE")}
        </div>
        <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          Gesamtausgaben bis Dez. 2025
        </div>
      </div>
    </div>
  );
}
