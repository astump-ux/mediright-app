import type { Vorgang } from "@/types";
import Card from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import Link from "next/link";

const fachIcon: Record<string, string> = {
  "Innere Medizin": "❤️",
  "Labordiagnostik": "🔬",
  "Dermatologie": "🧬",
  "Augenheilkunde": "👁️",
};

export default function VorgaengeTable({ vorgaenge, limit }: { vorgaenge: Vorgang[]; limit?: number }) {
  const shown = limit ? vorgaenge.slice(0, limit) : vorgaenge;
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl flex items-center gap-2.5" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          🕐 Letzte Vorgänge
        </h2>
        <Link href="/rechnungen" className="text-sm font-semibold no-underline" style={{ color: "var(--mint-dark)" }}>
          Alle anzeigen →
        </Link>
      </div>

      <Card>
        {shown.map((v) => (
          <div
            key={v.id}
            className="grid gap-x-4 items-center py-3.5 border-b border-slate-100 last:border-0"
            style={{ gridTemplateColumns: "36px 1fr auto auto" }}
          >
            {/* Icon */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: v.flagged ? "#fff8f8" : "#f0fdf4" }}
            >
              {v.flagged ? "⚠️" : fachIcon[v.fachrichtung] ?? "📄"}
            </div>

            {/* Info */}
            <div>
              <div className="font-semibold text-sm" style={{ color: "var(--navy)" }}>{v.arzt}</div>
              <div className="text-xs text-slate-400">
                {v.datum} · {v.goaZiffern?.join(", ")}
                {v.flagReason && <span className="ml-1 text-amber-700"> · {v.flagReason}</span>}
              </div>
            </div>

            {/* Status */}
            <StatusBadge status={v.status} />

            {/* Amount */}
            <div className="text-right">
              <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>
                € {v.betrag.toFixed(2).replace(".", ",")}
              </div>
              {v.einsparpotenzial && (
                <div className="text-[11px] font-semibold" style={{ color: "var(--mint-dark)" }}>
                  € {v.einsparpotenzial.toFixed(2).replace(".", ",")} anfechtbar
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}
