import type { Vorgang } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

const statusDot: Record<string, string> = {
  erstattet: "var(--mint)",
  abgelehnt: "#ef4444",
  pruefen: "#f59e0b",
  offen: "#94a3b8",
};

export default function ChronikSection({ vorgaenge }: { vorgaenge: Vorgang[] }) {
  const byYear = vorgaenge.reduce<Record<string, Vorgang[]>>((acc, v) => {
    const year = v.datum.split(".")[2];
    if (!acc[year]) acc[year] = [];
    acc[year].push(v);
    return acc;
  }, {});

  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl flex items-center gap-2.5" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          📋 Meine Gesundheitschronik
        </h2>
        <SectionBadge label={`${vorgaenge.length} Vorgänge`} variant="gray" />
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        {/* Timeline */}
        <Card>
          <p className="text-xs text-slate-500 flex items-center gap-2 mb-4">
            <span className="text-blue-500">ℹ️</span>
            Neutrale Übersicht auf Basis Ihrer Rechnungen — ohne medizinische Bewertung.
          </p>

          {years.map((year) => (
            <div key={year}>
              {/* Year divider */}
              <div className="flex items-center gap-3 my-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{year}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {byYear[year].map((v) => (
                <div key={v.id} className="grid grid-cols-[56px_1fr_auto] gap-x-3 items-start py-3 border-b border-slate-100 last:border-0">
                  <div className="text-[11px] font-bold text-slate-400 text-center leading-tight">
                    {v.datum.split(".").slice(0, 2).join(".")}
                    <br />
                    {v.datum.split(".")[2]}
                  </div>
                  <div>
                    <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>{v.arzt}</div>
                    <div className="text-xs text-slate-500 mb-2">{v.fachrichtung}</div>
                    <div className="flex flex-wrap gap-1">
                      {v.goaZiffern?.map((z) => (
                        <span key={z} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: v.flagged ? "#fef3c7" : "#f1f5f9", color: v.flagged ? "#92400e" : "#64748b" }}>
                          {z}
                        </span>
                      ))}
                      {v.faktor && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: v.faktor > 2.3 ? "#fef3c7" : "#d1fae5", color: v.faktor > 2.3 ? "#92400e" : "#059669" }}>
                          Faktor {v.faktor}×{v.faktor > 2.3 ? " ⚠️" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>€ {v.betrag.toFixed(2).replace(".", ",")}</div>
                    <div className="mt-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: statusDot[v.status] }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Card>

        {/* Vorsorge + Arztstatistik */}
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              📅 Vorsorge-Erinnerungen
            </p>
            <p className="text-[10px] text-slate-400 mb-4">Basierend auf Ihren Leistungsziffern — keine medizinische Bewertung</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "🫀", name: "Internist Folge-Check", info: "Letzter: Mär '25 · Empf.: 6 Monate", badge: "Fällig Sep 2025", variant: "due" },
                { icon: "🔬", name: "Labor-Kontrolle", info: "Letzter: Mär '25 · Empf.: 12 Monate", badge: "Fällig Mär 2026", variant: "soon" },
                { icon: "👁️", name: "Augenarzt", info: "Letzter: Jan '25 · Empf.: 24 Monate", badge: "Jan 2027 ✓", variant: "ok" },
              ].map((v) => {
                const styles = {
                  due:  { bg: "#fff8f8", border: "#fca5a5", badgeBg: "#fee2e2", badgeColor: "#b91c1c" },
                  soon: { bg: "#fffbeb", border: "#fde68a", badgeBg: "#fef3c7", badgeColor: "#92400e" },
                  ok:   { bg: "#f0fdf4", border: "#6ee7b7", badgeBg: "#d1fae5", badgeColor: "#059669" },
                }[v.variant as "due" | "soon" | "ok"];
                return (
                  <div key={v.name} className="rounded-xl p-3" style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
                    <div className="text-lg mb-1">{v.icon}</div>
                    <div className="text-xs font-bold mb-1" style={{ color: "var(--navy)" }}>{v.name}</div>
                    <div className="text-[10px] text-slate-500 mb-2">{v.info}</div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: styles.badgeBg, color: styles.badgeColor }}>
                      {v.badge}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
              🏆 Ihre Arzt-Statistik
            </p>
            <div className="flex flex-col gap-2">
              {[
                { name: "Dr. Hartmann", sub: "4 Besuche · Innere Medizin", val: "Ø 2,9×", warn: true },
                { name: "Dr. Schulz", sub: "2 Besuche · Dermatologie", val: "Ø 2,2×", warn: false },
                { name: "Labor Müller", sub: "3 Einreichungen · Labor", val: "38% Ablehnung", warn: true },
              ].map((a) => (
                <div key={a.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div>
                    <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>{a.name}</div>
                    <div className="text-xs text-slate-400">{a.sub}</div>
                  </div>
                  <div className="font-bold text-sm" style={{ color: a.warn ? "#b91c1c" : "var(--mint-dark)" }}>{a.val}</div>
                </div>
              ))}
            </div>

            {/* Share card teaser */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold" style={{ color: "var(--navy)" }}>
                  🔗 Mein Gesundheitsjahr 2025
                </div>
                <div className="text-xs text-slate-500">Jahresübersicht als PDF oder Share-Card</div>
              </div>
              <button
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: "var(--purple-light)", color: "var(--purple)" }}
              >
                📤 Export
              </button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
