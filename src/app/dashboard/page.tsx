import { mockDashboard } from "@/lib/mockData";
import KPIGrid from "@/components/dashboard/KPIGrid";
import PrognoseBar from "@/components/dashboard/PrognoseBar";
import ArztSection from "@/components/dashboard/ArztSection";
import KasseSection from "@/components/dashboard/KasseSection";
import GesundheitsSection from "@/components/dashboard/GesundheitsSection";
import ChronikSection from "@/components/dashboard/ChronikSection";
import VorgaengeTable from "@/components/dashboard/VorgaengeTable";
import UpsellBand from "@/components/dashboard/UpsellBand";

export default function DashboardPage() {
  const data = mockDashboard;

  return (
    <>
      {/* Greeting */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          Ihr Gesundheitsüberblick <span style={{ color: "var(--mint-dark)" }}>2025</span>
        </h1>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "🛡️ AXA ActiveMed-U" },
            { label: "📅 7 Vorgänge · Jan–Apr 2025", blue: true },
            { label: "💬 Via WhatsApp eingereicht" },
          ].map((p) => (
            <span
              key={p.label}
              className="text-xs font-medium px-3.5 py-1.5 rounded-full shadow-sm"
              style={{
                background: p.blue ? "var(--blue-light)" : "white",
                color: p.blue ? "#1d4ed8" : "#475569",
              }}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>

      <KPIGrid data={data} />
      <PrognoseBar data={data} />
      <ArztSection aerzte={data.aerzte} />
      <KasseSection stats={data.kasse} />
      <GesundheitsSection data={data} />
      <ChronikSection vorgaenge={data.vorgaenge} />
      <VorgaengeTable vorgaenge={data.vorgaenge} limit={4} />
      <UpsellBand data={data} />
    </>
  );
}
