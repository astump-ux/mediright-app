import type { KasseStats } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

// PKV industry average Ablehnungsquote by Fachgebiet (%)
// Source: anonymised PKV market estimates — used as benchmark only
const FACH_BENCHMARK: Record<string, number> = {
  'allgemeinmedizin':   5,
  'hausarzt':           5,
  'innere medizin':     8,
  'internist':          8,
  'labor':             15,
  'radiologie':         6,
  'orthopädie':        10,
  'chirurgie':          5,
  'dermatologie':       7,
  'hno':                6,
  'gynäkologie':        6,
  'neurologie':         9,
  'augenheilkunde':     5,
  'urologie':           7,
  'kardiologie':        8,
  'gastroenterologie':  9,
  'psychiatrie':       12,
  'psychotherapie':    14,
  'zahnmedizin':       18,
  'physiotherapie':    11,
  'default':            8,
}

function normalizeFach(fach: string): string {
  return fach.toLowerCase().trim()
    .replace(/dr\.\s*/g, '')
    .replace(/\s+/g, ' ')
}

function MiniLineChart({ data, rateReal }: { data: number[]; rateReal: number }) {
  // Need at least 2 points for a meaningful line; data is guaranteed to have >= 2
  const pts = data.length >= 2 ? data : [0, rateReal];
  const maxVal = Math.max(...pts, 20); // at least 20 for y-axis scale
  const w = 280, h = 80;

  const points = pts.map((v, i) => {
    const x = pts.length > 1
      ? (i / (pts.length - 1)) * (w - 20) + 10
      : w / 2;
    const y = h - (v / maxVal) * (h - 12) - 6;
    return `${x},${y}`;
  });
  const last = points[points.length - 1].split(",");
  const avgY = h - (8 / maxVal) * (h - 12) - 6;

  // Build x-axis labels from number of data points
  const monate = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  const now = new Date();
  const labels = pts.map((_, i) => {
    // Walk backwards from current month
    const offset = pts.length - 1 - i;
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${monate[d.getMonth()]}`;
  });

  return (
    <div className="my-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
        {/* avg benchmark line */}
        <line x1="0" y1={avgY} x2={w} y2={avgY} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x={w - 2} y={avgY - 3} fontSize="8" fill="#94a3b8" textAnchor="end">Ø 8%</text>
        {/* area fill */}
        <polygon
          points={`${points.join(" ")} ${w - 10},${h} 10,${h}`}
          fill="rgba(239,68,68,0.08)"
        />
        {/* line */}
        <polyline points={points.join(" ")} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* dots */}
        {points.map((p, i) => {
          const [x, y] = p.split(",");
          const isLast = i === points.length - 1;
          return <circle key={i} cx={x} cy={y} r={isLast ? 4.5 : 3} fill="#ef4444" stroke={isLast ? "white" : "none"} strokeWidth={isLast ? 1.5 : 0} />;
        })}
        {/* last value label */}
        <text x={last[0]} y={Number(last[1]) - 8} fontSize="9" fontWeight="700" fill="#b91c1c" textAnchor="middle">
          {pts[pts.length - 1]}%
        </text>
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function BenchmarkRow({ label, sub, youPct, avgPct, youVal, avgVal, variant }: {
  label: string; sub: string;
  youPct: number; avgPct: number;
  youVal: string; avgVal: string;
  variant: "good" | "warn" | "bad";
}) {
  const fillColor = variant === "good" ? "var(--mint)" : variant === "warn" ? "var(--amber)" : "var(--red)";
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 items-center py-3 border-b border-slate-100 last:border-0">
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--navy)" }}>{label}</div>
        <div className="text-xs text-slate-400">{sub}</div>
        <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full rounded-full bg-slate-200" style={{ width: `${avgPct}%` }} />
          <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${youPct}%`, background: fillColor }} />
        </div>
        <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
          <span>Sie: <strong>{youVal}</strong></span>
          <span>Ø: <strong>{avgVal}</strong></span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-bold text-base" style={{ color: variant === "good" ? "var(--mint-dark)" : variant === "warn" ? "#b45309" : "#b91c1c" }}>{youVal}</div>
        <div className="text-xs text-slate-400">{avgVal}</div>
      </div>
    </div>
  );
}

export default function KasseSection({ stats }: { stats: KasseStats }) {
  const kasseName = stats.kasseName || "PKV"
  const realRate  = stats.ablehnungsrateReal ?? (stats.ablehnungsrate[stats.ablehnungsrate.length - 1] ?? 0)
  const kuerzCount = stats.stilleKuerzungCount ?? 0
  const isAboveAvg = realRate > 8

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl flex items-center gap-2.5" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          🛡️ Ihr Versicherer — {kasseName} im Check
        </h2>
        {isAboveAvg
          ? <SectionBadge label="Ihre Rate über Durchschnitt" variant="red" />
          : <SectionBadge label="Rate im Normbereich" variant="green" />
        }
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Ablehnungsrate */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            📉 Ihre persönliche Ablehnungsrate
          </p>
          <MiniLineChart data={stats.ablehnungsrate} rateReal={realRate} />
          {isAboveAvg ? (
            <>
              <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>
                <div className="flex gap-2 mb-2">
                  <span>🔺</span>
                  <span>
                    <strong>Ablehnungsrate aktuell {realRate}%</strong> — über dem {kasseName}-Durchschnitt (Ø 8%). {stats.ablehnungsrate.length > 1 ? "Trend steigend." : ""}
                  </span>
                </div>
                {/* Guided solution path */}
                <div className="rounded-md p-2.5 mt-1" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid #fca5a5" }}>
                  <p className="text-[11px] font-bold mb-2" style={{ color: "#7c2d12" }}>Was können Sie tun?</p>
                  <div className="flex flex-col gap-1.5">
                    {[
                      "Prüfen Sie die konkreten Ablehnungsgründe unter 'Kassenabrechnung'",
                      "Nutzen Sie unsere Widerspruchs-Vorlage für anfechtbare Positionen",
                      "Frist beachten: Widerspruch innerhalb von 4 Wochen nach Bescheid",
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]" style={{ color: "#7c2d12" }}>
                        <span className="font-bold flex-shrink-0">{i + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <a
                      href="/kassenabrechnung"
                      className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                      style={{ background: "#b91c1c", color: "white" }}
                    >
                      Ablehnungen prüfen →
                    </a>
                    <a
                      href="/widersprueche"
                      className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                      style={{ background: "white", color: "#b91c1c", border: "1px solid #fca5a5" }}
                    >
                      Widerspruch erstellen
                    </a>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg px-3 py-2.5 text-sm flex gap-2" style={{ background: "#f0fdf4", border: "1px solid #6ee7b7", color: "#065f46" }}>
              <span>✓</span>
              <span>
                <strong>Ablehnungsrate {realRate}%</strong> — im Normbereich (Ø {kasseName}: 8%)
              </span>
            </div>
          )}
        </Card>

        {/* Benchmark */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            👥 Sie im Vergleich — {kasseName} Kunden
          </p>
          <p className="text-[10px] text-slate-400 mb-3">Ablehnungsquote je Fachgebiet vs. PKV-Durchschnitt (anonymisierte Referenzwerte)</p>

          {/* Erstattungsquote overall — always shown */}
          <BenchmarkRow
            label="Erstattungsquote gesamt"
            sub="Anteil der erstatteten Rechnungsbeträge"
            youPct={stats.erstattungsquote}
            avgPct={stats.erstattungsquoteAvg}
            youVal={`${stats.erstattungsquote}%`}
            avgVal={`Ø ${stats.erstattungsquoteAvg}%`}
            variant={stats.erstattungsquote >= stats.erstattungsquoteAvg ? "good" : "warn"}
          />

          {/* Dynamic per-Fachgruppe: Ablehnungsquote Sie vs. Benchmark */}
          {stats.fachgruppenStats.length > 0
            ? stats.fachgruppenStats.map((fg) => {
                const bench = FACH_BENCHMARK[normalizeFach(fg.fach)] ?? FACH_BENCHMARK['default']
                const variant: "good" | "warn" | "bad" =
                  fg.ablehnungsquote <= bench ? "good"
                  : fg.ablehnungsquote <= bench * 1.75 ? "warn"
                  : "bad"
                // bar: user's rate relative to bench*2 (cap at 100)
                const youPctBar = Math.min(100, Math.round((fg.ablehnungsquote / (bench * 2 || 1)) * 50))
                const avgPctBar = Math.min(100, Math.round((bench / (bench * 2 || 1)) * 50))
                return (
                  <BenchmarkRow
                    key={fg.fach}
                    label={`${fg.fach} — Ablehnungsquote`}
                    sub={`${fg.vorgaenge} Vorgang${fg.vorgaenge !== 1 ? "änge" : ""} · € ${fg.eingereicht.toLocaleString("de-DE")} eingereicht`}
                    youPct={youPctBar}
                    avgPct={avgPctBar}
                    youVal={fg.ablehnungsquote === 0 ? "0%" : `${fg.ablehnungsquote}%`}
                    avgVal={`Ø PKV: ${bench}%`}
                    variant={variant}
                  />
                )
              })
            : (
              <div className="text-xs text-slate-400 py-2 text-center">
                Noch keine Kassenbescheide zum Vergleich vorhanden
              </div>
            )
          }
        </Card>
      </div>

      {/* Stille Kürzung */}
      {stats.stilleKuerzungTotal > 0 && (
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
            👁️ Die stille Kürzung — kumuliert seit Ihrer ersten Einreichung
          </p>
          <div className="flex items-center gap-4 p-4 rounded-xl mb-4" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
            <div className="text-3xl italic flex-shrink-0" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "#b45309" }}>
              € {stats.stilleKuerzungTotal}
            </div>
            <div className="text-sm" style={{ color: "#92400e" }}>
              <strong className="block text-[#7c2d12] mb-0.5">Weniger erstattet als gesetzlich zulässig — ohne formelle Ablehnung</strong>
              {kasseName} hat in {kuerzCount > 0 ? kuerzCount : stats.stilleKuerzungen.reduce((s, k) => s + k.vorgaenge, 0)} Vorgängen Erstattungen still gekürzt: nicht abgelehnt, aber weniger überwiesen als lt. Tarif zulässig.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {stats.stilleKuerzungen.map((k) => (
              <div key={k.kategorie} className="bg-slate-50 rounded-xl p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{k.kategorie}</div>
                <div className="text-xl italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "#b45309" }}>€ {k.betrag}</div>
                <div className="text-xs text-slate-500">{k.vorgaenge} Vorgänge</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
