import type { Arzt } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

function FaktorChart({ verlauf }: { verlauf: { datum: string; faktor: number }[] }) {
  const max = 4.0;
  const threshold = 2.3;
  const thresholdPct = (threshold / max) * 100;

  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
        Faktor-Entwicklung über Ihre Besuche
      </p>
      <div className="flex items-end gap-3 h-16">
        {verlauf.map((v, i) => {
          const pct = (v.faktor / max) * 100;
          const warn = v.faktor > threshold;
          const err = v.faktor >= 3.5;
          const bg = err ? "#fca5a5" : warn ? "#fde68a" : "#d1fae5";
          const textColor = err ? "#b91c1c" : warn ? "#92400e" : "#059669";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[11px] font-bold" style={{ color: textColor }}>
                {v.faktor}×
              </span>
              <div className="w-full relative" style={{ height: 48 }}>
                {/* threshold line */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-slate-400"
                  style={{ bottom: `${thresholdPct}%` }}
                />
                {/* bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t"
                  style={{ height: `${pct}%`, background: bg }}
                />
              </div>
              <span className="text-[10px] text-slate-400">{v.datum}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-5 border-t border-dashed border-slate-400" />
          Schwellenwert 2,3× (§12 GOÄ)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-200" />
          Über Schwellenwert ohne Begründung
        </span>
      </div>
    </div>
  );
}

function KasseBescheidMini({ arzt }: { arzt: Arzt }) {
  const eingereicht = arzt.eingereichtBeiKasse ?? 0
  const erstattet   = arzt.erstattetVonKasse ?? 0
  const abgelehnt   = arzt.abgelehntVonKasse ?? 0
  if (eingereicht === 0) return null
  const quote = eingereicht > 0 ? Math.round((erstattet / eingereicht) * 100) : 0

  return (
    <div className="mt-3 mb-4 rounded-xl overflow-hidden border border-slate-100">
      <div className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 bg-slate-50 text-slate-400">
        🛡️ Kassenbescheid
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        <div className="px-3 py-2.5 text-center">
          <div className="text-[10px] text-slate-400 mb-0.5">Eingereicht</div>
          <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>
            € {eingereicht.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className="text-[10px] text-slate-400 mb-0.5">Erstattet</div>
          <div className="font-bold text-sm" style={{ color: "#059669" }}>
            € {erstattet.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className="text-[10px] text-slate-400 mb-0.5">Abgelehnt</div>
          <div className="font-bold text-sm" style={{ color: abgelehnt > 0 ? "#b91c1c" : "#64748b" }}>
            {abgelehnt > 0 ? `€ ${abgelehnt.toLocaleString("de-DE", { maximumFractionDigits: 0 })}` : "—"}
          </div>
        </div>
      </div>
      <div className="px-3 py-2 bg-slate-50 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${quote}%`,
              background: quote >= 80 ? "#22c55e" : quote >= 60 ? "#f59e0b" : "#ef4444"
            }}
          />
        </div>
        <span className="text-[10px] font-bold" style={{ color: quote >= 80 ? "#059669" : quote >= 60 ? "#92400e" : "#b91c1c" }}>
          {quote}% erstattet
        </span>
      </div>
    </div>
  )
}

function ArztCard({ arzt }: { arzt: Arzt }) {
  const variant = arzt.flagged ? "flagged" : "ok";
  return (
    <Card variant={variant} className="mb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-bold text-base" style={{ color: "var(--navy)" }}>
            {arzt.name}
          </div>
          <div className="text-sm text-slate-500">
            {arzt.fachrichtung} · {arzt.ort} · {arzt.besuche} Besuche
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            {arzt.flagged ? (
              <>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  ↑ Faktor steigt
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  §12 GOÄ-Verstöße
                </span>
              </>
            ) : (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                ✓ Unauffällig
              </span>
            )}
            {arzt.avgFaktor > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Ø Faktor {arzt.avgFaktor}×
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="text-2xl italic leading-none"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}
          >
            € {arzt.gesamtBetrag.toLocaleString("de-DE")}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
            Gesamt
          </div>
        </div>
      </div>

      {/* Kassenbescheid mini-panel */}
      <KasseBescheidMini arzt={arzt} />

      {/* Faktor chart */}
      {arzt.faktorVerlauf.length > 0 && <FaktorChart verlauf={arzt.faktorVerlauf} />}

      {/* Alerts */}
      {arzt.alerts.map((alert, i) => (
        <div
          key={i}
          className="rounded-lg px-4 py-3 mb-2 text-sm flex gap-3"
          style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}
        >
          <span className="flex-shrink-0">⚠️</span>
          <span>{alert}</span>
        </div>
      ))}
    </Card>
  );
}

export default function ArztSection({ aerzte }: { aerzte: Arzt[] }) {
  const flagCount = aerzte.filter((a) => a.flagged).length;
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xl flex items-center gap-2.5"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}
        >
          🩺 Meine Ärzte — Abrechnungsverhalten
        </h2>
        {flagCount > 0 && <SectionBadge label={`${flagCount} Auffälligkeit${flagCount > 1 ? "en" : ""}`} variant="amber" />}
      </div>
      {aerzte.map((a) => <ArztCard key={a.id} arzt={a} />)}
    </section>
  );
}
