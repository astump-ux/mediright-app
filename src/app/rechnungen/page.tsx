import { mockDashboard } from "@/lib/mockData";
import VorgaengeTable from "@/components/dashboard/VorgaengeTable";

export default function RechnungenPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          Alle Rechnungen & Vorgänge
        </h1>
        <button
          className="text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2"
          style={{ background: "var(--mint)", color: "white" }}
        >
          💬 Neue Rechnung via WhatsApp
        </button>
      </div>
      <VorgaengeTable vorgaenge={mockDashboard.vorgaenge} />
    </>
  );
}
