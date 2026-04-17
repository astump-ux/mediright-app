import type { Arzt } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

// ── GOÄ Faktor Ampel ──────────────────────────────────────────────────────────
function faktorAmpel(faktor: number): {
  color: string; bg: string; border: string; label: string; hinweis: string
} {
  if (faktor <= 2.3) return {
    color: "#059669", bg: "#d1fae5", border: "#6ee7b7",
    label: "✓ Regelfall",
    hinweis: "",
  }
  if (faktor <= 3.5) return {
    color: "#d97706", bg: "#fef3c7", border: "#fde68a",
    label: "⚠ Begründungspflichtig",
    hinweis: "Faktor über 2,3× — laut §12 GOÄ muss der Arzt schriftlich begründen. Fehlt die Begründung, kann Ihre Kasse ablehnen.",
  }
  return {
    color: "#b91c1c", bg: "#fee2e2", border: "#fca5a5",
    label: "🔴 Höchstsatz",
    hinweis: "Faktor über 3,5× — nur in Ausnahmefällen zulässig. Sehr hohe Wahrscheinlichkeit einer Ablehnung durch Ihre Kasse.",
  }
}

function FaktorBadge({ faktor }: { faktor: number }) {
  const amp = faktorAmpel(faktor)
  return (
    <span
      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: amp.bg, border: `1px solid ${amp.border}`, color: amp.color }}
      title={amp.hinweis || "Abrechnungssatz im Regelbereich"}
    >
      {faktor}× — {amp.label}
    </span>
  )
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
  const amp = arzt.avgFaktor > 0 ? faktorAmpel(arzt.avgFaktor) : null
  const hasKasseBescheid = (arzt.eingereichtBeiKasse ?? 0) > 0
  return (
    <Card variant={variant} className="mb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-bold text-base" style={{ color: "var(--navy)" }}>
            {arzt.name}
          </div>
          <div className="text-sm text-slate-500">
            {arzt.fachrichtung}{arzt.ort ? ` · ${arzt.ort}` : ""} · {arzt.besuche} Besuch{arzt.besuche !== 1 ? "e" : ""}
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

      {/* Kassenbescheid summary */}
      <KasseBescheidMini arzt={arzt} />

      {/* Factor hint — only shown when no Kassenbescheid yet and factor is elevated */}
      {amp && amp.hinweis && !hasKasseBescheid && (
        <div className="rounded-lg px-3 py-2.5 mb-3 text-xs" style={{ background: amp.bg, border: `1px solid ${amp.border}`, color: amp.color }}>
          {amp.hinweis}
        </div>
      )}

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
          🩺 Meine Ärzte — Abrechnungsübersicht
        </h2>
        {flagCount > 0 && <SectionBadge label={`${flagCount} Auffälligkeit${flagCount > 1 ? "en" : ""}`} variant="amber" />}
      </div>
      {aerzte.map((a) => <ArztCard key={a.id} arzt={a} />)}
    </section>
  );
}
