"use client"
import { useState } from "react"

export default function FloatingCTA() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2"
      style={{ pointerEvents: "none" }}
    >
      {/* Expanded options */}
      {expanded && (
        <div
          className="flex flex-col gap-2 mb-1"
          style={{ pointerEvents: "auto" }}
        >
          <a
            href="/rechnungen"
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg text-sm font-bold text-white whitespace-nowrap"
            style={{ background: "var(--navy)", backdropFilter: "blur(8px)" }}
          >
            📄 Arztrechnung einreichen
          </a>
          <a
            href="/kassenabrechnung"
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg text-sm font-bold text-white whitespace-nowrap"
            style={{ background: "#4f46e5", backdropFilter: "blur(8px)" }}
          >
            🏥 Kassenbescheid hochladen
          </a>
          <a
            href="/widersprueche"
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg text-sm font-bold text-white whitespace-nowrap"
            style={{ background: "#b45309", backdropFilter: "blur(8px)" }}
          >
            ✍️ Widerspruch erstellen
          </a>
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-xl font-bold text-white transition-transform"
        style={{
          background: expanded ? "#64748b" : "var(--mint)",
          pointerEvents: "auto",
          transform: expanded ? "rotate(45deg)" : "none",
          transition: "all 0.2s ease",
        }}
        aria-label="Dokument einreichen"
      >
        {expanded ? "✕" : "+"}
      </button>
      {!expanded && (
        <span
          className="text-[10px] font-bold text-center"
          style={{ color: "var(--mint-dark)", pointerEvents: "none", marginTop: -4 }}
        >
          Einreichen
        </span>
      )}
    </div>
  )
}
