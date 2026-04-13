import type { Arzt } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

// ── GOÄ Ampel helpers ─────────────────────────────────────────────────────────
function faktorAmpel(faktor: number): {
  color: string; bg: string; border: string; label: string; erklärung: string
} {
  if (faktor <= 1.8) return {
    color: "#059669", bg: "#d1fae5", border: "#6ee7b7",
    label: "✓ Standard",
    erklärung: "Unterdurchschnittlicher Abrechnungssatz — keine Auffälligkeit.",
  }
  if (faktor <= 2.3) return {
    color: "#0284c7", bg: "#e0f2fe", border: "#7dd3fc",
    label: "✓ Regelfall",
    erklärung: "Normaler Abrechnungssatz. Die PKV erstattet in der Regel problemlos.",
  }
  if (faktor <= 3.5) return {
    color: "#d97706", bg: "#fef3c7", border: "#fde68a",
    label: "⚠ Begründungspflichtig",
    erklärung: `Faktor über dem Schwellenwert (2,3×). Der Arzt MUSS laut §12 GOÄ\neine schriftliche Begründung geben. Ohne diese kann Ihre Kasse kürzen.`,
  }
  return {
    color: "#b91c1c", bg: "#fee2e2", border: "#fca5a5",
    label: "🔴 Höchstsatz",
    erklärung: `Faktor über 3,5× — nur in Ausnahmefällen zulässig. Sehr hohe\nWahrscheinlichkeit einer Kürzung oder Ablehnung durch Ihre Kasse.`,
  }
}

function FaktorBadge({ faktor }: { faktor: number }) {
  const amp = faktorAmpel(faktor)
  return (
    <span
      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: amp.bg, border: `1px solid ${amp.border}`, color: amp.color }}
      title={amp.erklärung}
    >
      {faktor}× — {amp.label}
    </span>
  )
}

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
          const amp = faktorAmpel(v.faktor)
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[11px] font-bold" style={{ color: amp.color }}>
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
                  style={{ height: `${pct}%`, background: amp.bg, border: `1px solid ${amp.border}`, borderBottom: "none" }}
                />
              </div>
              <span className="text-[10px] text-slate-400">{v.datum}</span>
            </div>
          );
        })}
      </div>
      {/* Legend with plain language */}
      <div className="mt-3 rounded-lg p-3 text-[11px]" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        <div className="flex items-start gap-2 mb-1.5">
          <span className="inline-block w-4 h-3 rounded-sm mt-0.5 flex-shrink-0" style={{ background: "#d1fae5", border: "1px solid #6ee7b7" }} />
          <span style={{ color: "#374151" }}><strong style={{ color: "#059669" }}>bis 2,3×</strong> — Von Ihrer Kasse problemlos erstattbar (Regelfall §12 GOÄ)</span>
        </div>
        <div className="flex items-start gap-2 mb-1.5">
          <span className="inline-block w-4 h-3 rounded-sm mt-0.5 flex-shrink-0" style={{ background: "#fef3c7", border: "1px solid #fde68a" }} />
          <span style={{ color: "#374151" }}><strong style={{ color: "#d97706" }}>2,3× – 3,5×</strong> — Erhöhter Satz, erfordert schriftliche Begründung. Ohne diese kann Ihre Kasse kürzen.</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="inline-block w-4 h-3 rounded-sm mt-0.5 flex-shrink-0" style={{ background: "#fee2e2", border: "1px solid #fca5a5" }} />
          <span style={{ color: "#374151" }}><strong style={{ color: "#b91c1c" }}>über 3,5×</strong> — Ausnahmefall. Sehr wahrscheinlich kürzt Ihre Kasse diesen Betrag.</span>
        </div>
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
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-bold text-base" style={{ color: "var(--navy)" }}>
            {arzt.name}
          </div>
          <div className="text-sm text-slate-500">
            {arzt.fachrichtung}{arzt.ort ? ` · ${arzt.ort}` : ""} · {arzt.besuche} Besuche
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            {arzt.flagged ? (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                ↑ Auffälliger Faktor
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                ✓ Unauffällig
              </span>
            )}
            {arzt.avgFaktor > 0 && <FaktorBadge faktor={arzt.avgFaktor} />}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="text-2xl italic leading-none"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}
          >
            € {arzt.gesamtBetrag.toLocaleString("de-DE")}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Gesamt</div>
        </div>
      </div>

      {/* Kassenbescheid mini-panel */}
      <KasseBescheidMini arzt={arzt} />

      {/* Faktor chart */}
      {arzt.faktorVerlauf.length > 0 && <FaktorChart verlauf={arzt.faktorVerlauf} />}

      {/* Alerts with action */}
      {arzt.alerts.map((alert, i) => (
        <div key={i} className="rounded-lg px-4 py-3 mb-2" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div className="text-sm flex gap-3" style={{ color: "#92400e" }}>
            <span className="flex-shrink-0">⚠️</span>
            <span>{alert}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <a
              href="/widersprueche"
              className="text-[11px] font-bold px-3 py-1 rounded-full"
              style={{ background: "#fde68a", color: "#78350f" }}
            >
              GOÄ-Beanstandung erstellen →
            </a>
          </div>
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
