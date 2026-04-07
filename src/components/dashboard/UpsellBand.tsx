import type { DashboardData } from "@/types";

export default function UpsellBand({ data }: { data: DashboardData }) {
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
          € {data.einsparpotenzial} warten auf Ihren Widerspruch.
        </h3>
        <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
          In 3 Vorgängen haben wir anfechtbare Positionen identifiziert. Mit Premium erstellen wir die rechtssicheren Widerspruchsschreiben — fertig zum Versand.
        </p>
        <ul className="flex flex-col gap-1.5">
          {[
            "Widerspruchsbrief gegen AXA-Ablehnung (Labor)",
            "§12 GOÄ-Beanstandung an Dr. Hartmann",
            "Automatische Fristenüberwachung (Verjährung 3 Jahre)",
            "Vollständige Benchmark-Daten unbegrenzt",
          ].map((item) => (
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
            € {data.einsparpotenzial}
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
