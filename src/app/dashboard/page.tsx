import { getDashboardData } from "@/lib/dashboard-queries";
import { mockDashboard } from "@/lib/mockData";
import KPIGrid from "@/components/dashboard/KPIGrid";
import PrognoseBar from "@/components/dashboard/PrognoseBar";
import ArztSection from "@/components/dashboard/ArztSection";
import KasseSection from "@/components/dashboard/KasseSection";
import GesundheitsSection from "@/components/dashboard/GesundheitsSection";
import ChronikSection from "@/components/dashboard/ChronikSection";
import VorgaengeTable from "@/components/dashboard/VorgaengeTable";
import UpsellBand from "@/components/dashboard/UpsellBand";
import EmptyState from "@/components/dashboard/EmptyState";

export default async function DashboardPage() {
  // Fetch real data; fall back to mock in development if not logged in
  let data = await getDashboardData();
  const isDemo = !data;
  if (!data) data = mockDashboard;

  const currentYear = new Date().getFullYear();

  return (
    <>
      {/* Demo banner */}
      {isDemo && (
        <div style={{
          background: 'linear-gradient(90deg, #fef3c7, #fde68a)',
          borderRadius: 10,
          padding: '10px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: '#92400e',
        }}>
          <span>👀</span>
          <span>
            <strong>Demo-Modus</strong> — Diese Ansicht zeigt Beispieldaten.
            Senden Sie Ihre erste Rechnung per WhatsApp, um echte Daten zu sehen.
          </span>
        </div>
      )}

      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl" style={{
          fontFamily: "'DM Serif Display', Georgia, serif",
          color: "var(--navy)"
        }}>
          {isDemo ? 'Ihr Gesundheitsüberblick' : `Hallo, ${data.user.name.split(' ')[0]}`}{' '}
          <span style={{ color: "var(--mint-dark)" }}>{currentYear}</span>
        </h1>
      </div>

      {/* No real data yet: show empty state below KPIs */}
      {!isDemo && data.vorgaenge.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <KPIGrid data={data} />
          <PrognoseBar data={data} />
          <ArztSection aerzte={data.aerzte} />
          <KasseSection stats={data.kasse} />
          <GesundheitsSection data={data} />
          <ChronikSection data={data} />
          <VorgaengeTable vorgaenge={data.vorgaenge} limit={4} />
          <UpsellBand data={data} />
        </>
      )}
    </>
  );
}
