import type { DashboardData } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

export default function GesundheitsSection({ data }: { data: DashboardData }) {
  const maxBetrag = Math.max(...data.ausgabenNachFach.map((a) => a.betrag));
  const gesamt = data.ausgabenNachFach.reduce((s, a) => s + a.betrag, 0);
  const year = data.currentYear ?? new Date().getFullYear();
  const months = data.monthsWithData ?? 0;
  const bd = data.eigenanteilBreakdown;

  // Build breakdown rows from real data
  const breakdownRows = bd ? [
    bd.abgelehnt > 0   ? { label: "Abgelehnte Positionen",  betrag: bd.abgelehnt,        dot: "#ef4444", red: true  } : null,
    bd.stilleKuerzungen > 0 ? { label: "Weitere Ablehnungen", betrag: bd.stilleKuerzungen, dot: "#f59e0b", red: true } : null,
    bd.selbstbehalt > 0 ? { label: "Selbstbehalt (Tarif)",  betrag: bd.selbstbehalt,     dot: "#94a3b8", red: false } : null,
    bd.offeneRechnungen > 0 ? { label: "Offene Rechnungen", betrag: bd.offeneRechnungen, dot: "#e2e8f0", red: false } : null,
  ].filter(Boolean) as { label: string; betrag: number; dot: string; red: boolean }[]
  : [
    { label: "Eigenanteil gesamt", betrag: data.eigenanteil, dot: "#ef4444", red: true },
  ];

  const periodLabel = months > 0 ? `Jan–${["", "Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][months]} ${year}` : `${year}`;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl flex items-center gap-2.5" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          📊 Persönliches Gesundheitscontrolling
        </h2>
        <SectionBadge label={periodLabel} variant="gray" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Ausgaben nach Fach */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
            🩺 Ausgaben nach Facharztgruppe
          </p>
          <div>
            {data.ausgabenNachFach.map((a) => (
              <div key={a.fach} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: `${a.farbe}40` }}
                >
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: "var(--navy)" }}>{a.fach}</div>
                  <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(a.betrag / maxBetrag) * 100}%`, background: a.farbe }}
                    />
                  </div>
                </div>
                <div className="font-bold text-sm text-right flex-shrink-0" style={{ color: "var(--navy)" }}>
                  € {a.betrag.toLocaleString("de-DE")}
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 mt-1 border-t-2 font-bold text-sm" style={{ borderColor: "var(--navy)", color: "var(--navy)" }}>
              <span>Gesamt {year}</span>
              <span>€ {gesamt.toLocaleString("de-DE")}</span>
            </div>
          </div>
        </Card>

        {/* Eigenanteil Breakdown */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
            💰 Ihr tatsächlicher Eigenanteil
          </p>
          <div>
            {breakdownRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: row.dot }} />
                  {row.label}
                </span>
                <span className="font-bold" style={{ color: row.red ? "#b91c1c" : "var(--navy)" }}>
                  € {row.betrag.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 mt-2 border-t-2 font-bold" style={{ borderColor: "var(--navy)", color: "var(--navy)" }}>
              <span className="text-sm">Ihr Eigenanteil netto</span>
              <span className="text-xl italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                € {data.eigenanteil.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Jahresvergleich */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
              📅 Jahresvergleich Eigenanteil
            </p>
            <div className="flex items-end gap-2 h-16">
              {[
                { year: `${year - 3}`, val: 98,  h: 20, bg: "#e2e8f0" },
                { year: `${year - 2}`, val: 141, h: 29, bg: "#cbd5e1" },
                { year: `${year - 1}`, val: 224, h: 46, bg: "#fef3c7" },
                { year: `${year}`,     val: data.eigenanteil, h: 57, bg: "#fee2e2", dashed: true, delta: "+39%" },
              ].map((b) => (
                <div key={b.year} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold" style={{ color: b.dashed ? "#b91c1c" : "#64748b" }}>
                    € {b.val}{b.dashed ? "*" : ""}
                  </span>
                  <div
                    className="w-full rounded-t-sm relative"
                    style={{
                      height: b.h,
                      background: b.bg,
                      border: b.dashed ? "2px dashed #fca5a5" : "none",
                      borderBottom: "none",
                    }}
                  >
                    {b.delta && (
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-500 whitespace-nowrap">
                        ↑ {b.delta}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px]" style={{ color: b.dashed ? "#b91c1c" : "#94a3b8" }}>{b.year}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">* hochgerechnet auf Basis Jan–{["","Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][months] ?? "aktuell"}</p>
          </div>
        </Card>
      </div>
    </section>
  );
}
