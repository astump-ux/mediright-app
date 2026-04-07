import { mockDashboard } from "@/lib/mockData";
import ArztSection from "@/components/dashboard/ArztSection";

export default function AerztePage() {
  return (
    <>
      <h1 className="text-2xl mb-6" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
        Meine Ärzte
      </h1>
      <ArztSection aerzte={mockDashboard.aerzte} />
    </>
  );
}
