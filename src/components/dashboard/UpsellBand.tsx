import type { DashboardData } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export default function UpsellBand({ data }: { data: DashboardData }) {
  const kassePot = data.widerspruchPotenzialKasse ?? 0
  const arztPot  = data.einsparpotenzial ?? 0
  const totalPot = kassePot + arztPot
  const kasseName = data.user.kasse || "PKV"
  const eCount   = data.einsparpotenzialCount ?? 0

  const items = [
    kassePot > 0 && `Widerspruchsbrief gegen ${kasseName}-Ablehnung`,
    arztPot  > 0 && `§12 GOÄ-Beanstandung an Ihren Arzt`,
    "Automatische Fristenüberwachung (Verjährung 3 Jahre)",
    "Vollständige Benchmark-Daten unbegrenzt",
  ].filter(Boolean) as string[];

  return (
    <div
      className="mt-9 rounded-2xl p-8 flex items-center justify-between gap-6 flex-wrap"
      style={{ background: "var(--navy)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--mint)" }}>
          🔓 MediRight Premium
        </p>
        <h3 className="text-2xl text-white mb-2 italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
          € {fmt(totalPot)} warten auf Ihre Schritte.
        </h3>
        <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
          {eCount > 0
            ? `In ${eCount} Vorgängen haben wir anfechtbare Positionen identifiziert. Mit Premium erstellen wir die rechtssicheren Schreiben — fertig zum Versand.`
            : "Mit Premium erstellen wir rechtssichere Widerspruchsschreiben und GOÄ-Beanstandungen — fertig zum Versand."}
        </p>

        {/* Split breakdown */}
        {(kassePot > 0 || arztPot > 0) && (
          <div className="flex gap-4 mb-4">
            {kassePot > 0 && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  🛡️ {kasseName} Widerspruch
                </div>
                <div className="font-bold text-lg italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--mint)" }}>
                  € {fmt(kassePot)}
                </div>
              </div>
            )}
            {arztPot > 0 && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  🩺 Ärzte GOÄ
                </div>
                <div className="font-bold text-lg italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "rgba(255,255,255,0.8)" }}>
                  € {fmt(arztPot)}
                </div>
              </div>
            )}
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item} className="text-sm flex items-start gap-2" style={{ color: "rgba(255,255,255,0.7)" }}>
              <span style={{ color: "var(--mint)", flexShrink: 0 }}>✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <div className="text-center">
          <div className="text-4xl italic" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--mint)" }}>
            € {fmt(totalPot)}
          </div>
          <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>potenzielle Rückerstattung</div>
        </div>
        <button
          className="flex items-center gap-2 font-bold text-sm text-white px-7 py-3.5 rounded-full"
          style={{ background: "var(--mint)" }}
        >
          ✍️ Widersprüche jetzt starten
        </button>
        <button
          className="text-sm font-semibold px-7 py-3 rounded-full border"
          style={{ color: "rgba(255,255,255,0.6)", borderColor: "rgba(255,255,255,0.15)", background: "transparent" }}
        >
          👁️ Beispiel-Widerspruch ansehen
        </button>
      </div>
    </div>
  );
}
