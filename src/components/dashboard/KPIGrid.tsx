import type { DashboardData } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export default function KPIGrid({ data }: { data: DashboardData }) {
  const cards = [
    {
      label: "Gesundheitsausgaben 2025",
      value: `€ ${fmt(data.jahresausgaben)}`,
      sub: "7 abgerechnete Vorgänge",
      delta: "+18% vs. 2024",
      deltaUp: true,
      dark: false,
    },
    {
      label: "Ihr Eigenanteil netto",
      value: `€ ${fmt(data.eigenanteil)}`,
      sub: "nach Erstattung & Selbstbehalt",
      dark: false,
    },
    {
      label: "Erstattungsquote AXA",
      value: `${data.erstattungsquote} %`,
      sub: `Ø andere AXA-Kunden: ${data.kasse.erstattungsquoteAvg}%`,
      delta: `−${data.kasse.erstattungsquoteAvg - data.erstattungsquote} Pkte`,
      deltaUp: true,
      dark: false,
    },
    {
      label: "Einsparpotenzial identifiziert",
      value: `€ ${fmt(data.einsparpotenzial)}`,
      sub: "in 3 anfechtbaren Positionen",
      dark: true,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-5">
      {cards.map((c, i) => (
        <div
          key={i}
          className="rounded-2xl shadow-sm px-6 py-5"
          style={{ background: c.dark ? "var(--navy)" : "white" }}
        >
          <div
            className="text-[11px] font-bold uppercase tracking-widest mb-2"
            style={{ color: c.dark ? "rgba(255,255,255,0.45)" : "#94a3b8" }}
          >
            {c.label}
          </div>
          <div
            className="text-3xl mb-1 leading-none italic"
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              color: c.dark ? "var(--mint)" : "var(--navy)",
            }}
          >
            {c.value}
          </div>
          <div
            className="text-xs flex items-center gap-2 flex-wrap"
            style={{ color: c.dark ? "rgba(255,255,255,0.4)" : "#64748b" }}
          >
            {c.sub}
            {c.delta && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#fee2e2", color: "#b91c1c" }}
              >
                {c.delta}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
