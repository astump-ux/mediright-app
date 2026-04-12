import type { DashboardData } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export default function KPIGrid({ data }: { data: DashboardData }) {
  const year        = data.currentYear ?? new Date().getFullYear()
  const count       = data.vorgangCount ?? data.vorgaenge.length
  const eCount      = data.einsparpotenzialCount ?? 0
  const kasseName   = data.user.kasse || "PKV"

  // Erstattungsquote color
  const quoteColor = data.erstattungsquote >= 80 ? "#22c55e"
    : data.erstattungsquote >= 60 ? "#f59e0b"
    : "#ef4444"

  const cards = [
    {
      label: `Gesundheitsausgaben ${year}`,
      value: `€ ${fmt(data.jahresausgaben)}`,
      sub: `${count} abgerechnete Vorgang${count !== 1 ? '‍e' : ''}`,
      dark: false,
    },
    {
      label: "Ihr Eigenanteil netto",
      value: `€ ${fmt(data.eigenanteil)}`,
      sub: "Abgelehnte Leistungen + Selbstbehalt",
      dark: false,
    },
    {
      label: `Erstattungsquote ${kasseName}`,
      value: `${data.erstattungsquote} %`,
      sub: data.erstattungsquote === 0
        ? "Noch kein Kassenbescheid eingereicht"
        : `von eingereichten Leistungen erstattet`,
      accent: data.erstattungsquote > 0 ? quoteColor : undefined,
      dark: false,
    },
    {
      label: "Einsparpotenzial identifiziert",
      value: `€ ${fmt(data.einsparpotenzial)}`,
      sub: eCount > 0
        ? `in ${eCount} anfechtbare${eCount !== 1 ? 'n' : 'r'} Position${eCount !== 1 ? 'en' : ''}`
        : "Keine Auffälligkeiten",
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
              color: c.dark ? "var(--mint)" : (c.accent ?? "var(--navy)"),
            }}
          >
            {c.value}
          </div>
          <div
            className="text-xs"
            style={{ color: c.dark ? "rgba(255,255,255,0.4)" : "#64748b" }}
          >
            {c.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
