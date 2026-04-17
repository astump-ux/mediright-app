"use client"
import type { DashboardData, WiderspruchVerfahren } from "@/types"

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// ── Status config ───────────────────────────────────────────────────────────────
const KASSE_STATUS: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  keiner:      { icon: "📋", label: "Entwurf",     bg: "#f1f5f9", color: "#64748b" },
  erstellt:    { icon: "📋", label: "Entwurf",     bg: "#f1f5f9", color: "#64748b" },
  gesendet:    { icon: "📤", label: "Gesendet",    bg: "#eff6ff", color: "#1d4ed8" },
  beantwortet: { icon: "💬", label: "Beantwortet", bg: "#fffbeb", color: "#92400e" },
  erfolgreich: { icon: "✅", label: "Erfolg",      bg: "#ecfdf5", color: "#065f46" },
  abgelehnt:   { icon: "❌", label: "Abgelehnt",   bg: "#fef2f2", color: "#991b1b" },
}
const ARZT_STATUS: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  keiner:   { icon: "📋", label: "Entwurf",  bg: "#fff7ed", color: "#9a3412" },
  erstellt: { icon: "📋", label: "Entwurf",  bg: "#fff7ed", color: "#9a3412" },
  gesendet: { icon: "✅", label: "Gesendet", bg: "#ecfdf5", color: "#065f46" },
}

function StatusBadge({ cfg }: { cfg: { label: string; bg: string; color: string; icon: string } }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 700, padding: "2px 8px",
      borderRadius: 20, background: cfg.bg, color: cfg.color,
      whiteSpace: "nowrap",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ── Single case card ────────────────────────────────────────────────────────────
function VerfahrenCard({ v, isLast }: { v: WiderspruchVerfahren; isLast: boolean }) {
  const hasKasse = v.betragKasse > 0
  const hasArzt  = v.betragArzt  > 0
  const total    = v.betragKasse + v.betragArzt

  const kasseCfg = KASSE_STATUS[v.kasseStatus] ?? KASSE_STATUS.keiner
  const arztCfg  = ARZT_STATUS[v.arztStatus]   ?? ARZT_STATUS.keiner

  const allDone = (v.kasseStatus === "erfolgreich" || v.kasseStatus === "abgelehnt" || !hasKasse) &&
                  (v.arztStatus  === "gesendet"    || !hasArzt)

  return (
    <div style={{
      padding: "12px 20px",
      borderBottom: isLast ? "none" : "1px solid #fde68a",
      background: allDone ? "#fafaf9" : "white",
    }}>
      {/* Case header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>
          {v.arztNames.length > 0 ? v.arztNames.join(" · ") : "Unbekannter Arzt"}
        </span>
        <span style={{ fontSize: 10, color: "#b45309" }}>
          · Bescheid {fmtDate(v.bescheiddatum)}
          {v.referenznummer ? ` · ${v.referenznummer}` : ""}
        </span>
        <span style={{
          marginLeft: "auto", fontSize: 13, fontWeight: 800,
          color: "#b45309", fontFamily: "'DM Serif Display', Georgia, serif",
          fontStyle: "italic",
        }}>
          € {fmt(total)}
        </span>
      </div>

      {/* Tracks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Kassenwiderspruch */}
        {hasKasse && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", background: "#3b82f6",
              display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: "#475569", flex: 1, minWidth: 0 }}>
              Kassenwiderspruch
            </span>
            <StatusBadge cfg={kasseCfg} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>
              {fmt(v.betragKasse)} €
            </span>
          </div>
        )}

        {/* Arztreklamation */}
        {hasArzt && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", background: "#fb923c",
              display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: "#475569", flex: 1, minWidth: 0 }}>
              Arztreklamation
            </span>
            <StatusBadge cfg={arztCfg} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>
              {fmt(v.betragArzt)} €
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SavingsProgress({ data }: { data: DashboardData }) {
  const verfahren  = data.widerspruchVerfahren ?? []
  const kassePot   = data.widerspruchPotenzialKasse ?? 0
  const arztPot    = data.korrekturArztPotenzial ?? 0
  const totalPot   = kassePot + arztPot
  const kasseName  = data.user.kasse || "PKV"

  // ── State A: No cases and no potential → hide ──────────────────────────────
  if (verfahren.length === 0 && totalPot === 0) return null

  // ── State B: Potential identified but no case started yet ─────────────────
  if (verfahren.length === 0 && totalPot > 0) {
    return (
      <div
        className="rounded-2xl mb-7 overflow-hidden"
        style={{ border: "2px solid #fde68a", background: "linear-gradient(135deg, #fffbeb 0%, #fef9f0 100%)" }}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
              💡
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: "#92400e" }}>Einsparpotenzial identifiziert</p>
              <p className="text-xs" style={{ color: "#b45309" }}>
                {kassePot > 0 && `${kasseName}: ${fmt(kassePot)} €`}
                {kassePot > 0 && arztPot > 0 && " · "}
                {arztPot > 0 && `Arztreklamation: ${fmt(arztPot)} €`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right">
              <div className="text-2xl italic leading-none"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "#b45309" }}>
                € {fmt(totalPot)}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "#d97706" }}>anfechtbar</div>
            </div>
            <a href="/widersprueche"
              className="text-xs font-bold px-3 py-2 rounded-lg no-underline flex-shrink-0"
              style={{ background: "#f59e0b", color: "white" }}>
              → Verfahren starten
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── State C: One or more active cases ─────────────────────────────────────
  const activeVerfahren   = verfahren.filter(v =>
    !["erfolgreich", "abgelehnt"].includes(v.kasseStatus) || v.arztStatus !== "gesendet"
  )
  const closedVerfahren   = verfahren.filter(v =>
    ["erfolgreich", "abgelehnt"].includes(v.kasseStatus) && (v.arztStatus === "gesendet" || v.betragArzt === 0)
  )
  const totalActive  = activeVerfahren.reduce((s, v) => s + v.betragKasse + v.betragArzt, 0)
  const totalRecovered = closedVerfahren
    .filter(v => v.kasseStatus === "erfolgreich")
    .reduce((s, v) => s + v.betragKasse + v.betragArzt, 0)

  const showVerfahren = activeVerfahren.length > 0 ? activeVerfahren : verfahren.slice(0, 3)

  return (
    <div
      className="rounded-2xl mb-7 overflow-hidden"
      style={{ border: "2px solid #fde68a", background: "linear-gradient(135deg, #fffbeb 0%, #fef9f0 100%)" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-100 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
            style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
            ⚖️
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: "#92400e" }}>
              {activeVerfahren.length > 0
                ? `${activeVerfahren.length} laufende${activeVerfahren.length > 1 ? " Verfahren" : "s Verfahren"}`
                : "Abgeschlossene Verfahren"}
            </p>
            <p className="text-xs" style={{ color: "#b45309" }}>
              {activeVerfahren.length > 0
                ? "Kassen­widerspruch & Arzt­reklamation im Überblick"
                : `${closedVerfahren.length} Verfahren abgeschlossen`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Summary chips */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {totalActive > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: "#fef3c7", border: "1px solid #fde68a" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e" }}>offen</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#b45309", fontFamily: "'DM Serif Display', Georgia, serif", fontStyle: "italic" }}>
                  € {fmt(totalActive)}
                </span>
              </div>
            )}
            {totalRecovered > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: "#ecfdf5", border: "1px solid #6ee7b7" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#065f46" }}>zurückerstattet</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#065f46", fontFamily: "'DM Serif Display', Georgia, serif", fontStyle: "italic" }}>
                  € {fmt(totalRecovered)}
                </span>
              </div>
            )}
          </div>
          <a href="/widersprueche"
            className="text-xs font-bold px-3 py-2 rounded-lg no-underline flex-shrink-0"
            style={{ background: "#92400e", color: "white" }}>
            → Alle Verfahren
          </a>
        </div>
      </div>

      {/* ── Per-case rows ── */}
      <div style={{ background: "white" }}>
        {showVerfahren.map((v, i) => (
          <VerfahrenCard key={v.kasseId} v={v} isLast={i === showVerfahren.length - 1} />
        ))}
      </div>

      {/* ── Overflow hint if more cases exist ── */}
      {verfahren.length > showVerfahren.length && (
        <div style={{ padding: "8px 20px", background: "#fffbeb", borderTop: "1px solid #fde68a", textAlign: "center" }}>
          <a href="/widersprueche" style={{ fontSize: 11, fontWeight: 700, color: "#b45309", textDecoration: "none" }}>
            + {verfahren.length - showVerfahren.length} weitere Verfahren →
          </a>
        </div>
      )}
    </div>
  )
}
