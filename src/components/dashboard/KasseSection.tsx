import type { KasseStats } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

function MiniLineChart({ data }: { data: number[] }) {
  const max = 20;
  const w = 280, h = 80;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 20) + 10;
    const y = h - (v / max) * (h - 12) - 6;
    return `${x},${y}`;
  });
  const last = points[points.length - 1].split(",");
  const avgY = h - (8 / max) * (h - 12) - 6;

  return (
    <div className="my-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
        {/* avg line */}
        <line x1="0" y1={avgY} x2={w} y2={avgY} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x={w - 2} y={avgY - 3} fontSize="8" fill="#94a3b8" textAnchor="end">Ø</text>
        {/* area */}
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
          {data[data.length - 1]}%
        </text>
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        {["Q1 '24", "Q2 '24", "Q3 '24", "Q4 '24", "Q1 '25"].map((l) => (
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
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl flex items-center gap-2.5" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          🛡️ Ihr Versicherer — AXA im Check
        </h2>
        <SectionBadge label="Ihre Rate unter Durchschnitt" variant="red" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Ablehnungsrate */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            📉 Ihre persönliche Ablehnungsrate
          </p>
          <MiniLineChart data={stats.ablehnungsrate} />
          <div className="rounded-lg px-3 py-2.5 text-sm flex gap-2" style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>
            <span>🔺</span>
            <span><strong>Ablehnungsrate steigt:</strong> von 7% (Q1 2024) auf 14% (Q1 2025) — doppelt so hoch wie Ø AXA (8%)</span>
          </div>
        </Card>

        {/* Benchmark */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            👥 Sie im Vergleich — AXA ActiveMed Kunden
          </p>
          <p className="text-[10px] text-slate-400 mb-3">Basierend auf anonymisierten Daten ähnlicher Tarife (n=847)</p>
          <BenchmarkRow
            label="Erstattungsquote gesamt"
            sub="Anteil der erstatteten Rechnungsbeträge"
            youPct={stats.erstattungsquote}
            avgPct={stats.erstattungsquoteAvg}
            youVal={`${stats.erstattungsquote}%`}
            avgVal={`Ø ${stats.erstattungsquoteAvg}%`}
            variant="warn"
          />
          <BenchmarkRow
            label="Internist — Ø Faktor Ihrer Rechnungen"
            sub="GOÄ-Abrechnungsfaktor Innere Medizin"
            youPct={70}
            avgPct={43}
            youVal="3,5×"
            avgVal="Ø 2,1×"
            variant="bad"
          />
          <BenchmarkRow
            label="Labor — Analogziffer-Ablehnungsrate"
            sub="Anteil abgelehnter Analogpositionen"
            youPct={38}
            avgPct={22}
            youVal="38%"
            avgVal="Ø PKV: 22%"
            variant="warn"
          />
        </Card>
      </div>

      {/* Stille Kürzung */}
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
            AXA hat in 5 Vorgängen Erstattungen still gekürzt: nicht abgelehnt, aber weniger überwiesen als lt. Tarif zulässig.
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
    </section>
  );
}
