"use client";
import { useState } from "react";
import type { KasseBescheid, UnmatchedVorgang } from "@/app/kassenabrechnung/page";
import type { KasseRechnungGruppe } from "@/lib/goae-analyzer";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2).replace(".", ",") + " €";
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("de-DE");
}

function quoteColor(q: number): string {
  if (q >= 95) return "#22c55e";
  if (q >= 75) return "#f59e0b";
  return "#ef4444";
}

// ── KPI header ────────────────────────────────────────────────────────────────

function KPIBar({ kasseBescheide, unmatched }: { kasseBescheide: KasseBescheid[]; unmatched: UnmatchedVorgang[] }) {
  const totalEingereicht = kasseBescheide.reduce((s, k) => s + (k.betrag_eingereicht ?? 0), 0);
  const totalErstattet   = kasseBescheide.reduce((s, k) => s + (k.betrag_erstattet  ?? 0), 0);
  const totalAbgelehnt   = kasseBescheide.reduce((s, k) => s + (k.betrag_abgelehnt  ?? 0), 0);
  const avgQuote = totalEingereicht > 0 ? (totalErstattet / totalEingereicht) * 100 : 0;
  const unmatchedKasse   = kasseBescheide.reduce(
    (s, k) => s + (k.rechnungen?.filter(r => !r.matchedVorgangId).length ?? 0), 0
  );

  const kpis = [
    { label: "Gesamt eingereicht",   value: fmt(totalEingereicht), accent: "var(--navy)" },
    { label: "Gesamt erstattet",     value: fmt(totalErstattet),   accent: "#22c55e" },
    { label: "Gesamt abgelehnt",     value: fmt(totalAbgelehnt),   accent: totalAbgelehnt > 0 ? "#ef4444" : "var(--text-muted)" },
    { label: "Ø Erstattungsquote",   value: avgQuote.toFixed(0) + " %", accent: quoteColor(avgQuote) },
    { label: "Offene Kassenpositionen", value: String(unmatchedKasse), accent: unmatchedKasse > 0 ? "#f59e0b" : "#22c55e" },
    { label: "Rechnungen ohne Kasse", value: String(unmatched.length), accent: unmatched.length > 0 ? "#f59e0b" : "#22c55e" },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 mb-8" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
      {kpis.map((k) => (
        <div
          key={k.label}
          className="rounded-2xl px-5 py-4"
          style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            {k.label}
          </p>
          <p className="text-2xl font-bold" style={{ color: k.accent, fontFamily: "'DM Serif Display', Georgia, serif" }}>
            {k.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Single Kassenbescheid card ─────────────────────────────────────────────────

function KasseBescheidCard({ kasse }: { kasse: KasseBescheid }) {
  const [open, setOpen] = useState(true);
  const quote = kasse.betrag_eingereicht > 0
    ? (kasse.betrag_erstattet / kasse.betrag_eingereicht) * 100
    : 0;

  // Matched rechnungen grouped: from rechnungen[] (kasse groups) ∪ linked vorgaenge
  const allGruppen: Array<{
    gruppe: KasseRechnungGruppe | null;
    vorgang: KasseBescheid["vorgaenge"][0] | null;
    status: "matched" | "unmatched-kasse" | "linked-vorgang";
  }> = [];

  const linkedVorgangIds = new Set(kasse.vorgaenge.map((v) => v.id));

  // 1. Kasse rechnungen groups
  for (const g of kasse.rechnungen) {
    const matchedVorgang = kasse.vorgaenge.find((v) => v.id === g.matchedVorgangId) ?? null;
    allGruppen.push({
      gruppe: g,
      vorgang: matchedVorgang,
      status: matchedVorgang ? "matched" : "unmatched-kasse",
    });
    if (matchedVorgang) linkedVorgangIds.delete(matchedVorgang.id);
  }

  // 2. Vorgaenge linked via FK but not in rechnungen groups
  for (const v of kasse.vorgaenge) {
    if (linkedVorgangIds.has(v.id)) {
      allGruppen.push({ gruppe: null, vorgang: v, status: "linked-vorgang" });
    }
  }

  return (
    <div
      className="rounded-2xl mb-5 overflow-hidden"
      style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-4">
          <span className="text-xl">🏥</span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              Bescheid {fmtDate(kasse.bescheiddatum)}
              {kasse.referenznummer && (
                <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                  Ref. {kasse.referenznummer}
                </span>
              )}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Eingereicht: {fmt(kasse.betrag_eingereicht)} · Erstattet: {fmt(kasse.betrag_erstattet)}
              {kasse.betrag_abgelehnt > 0 && (
                <span style={{ color: "#ef4444" }}> · Abgelehnt: {fmt(kasse.betrag_abgelehnt)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {kasse.widerspruch_empfohlen && (
            <span
              className="text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ background: "#fef3c7", color: "#92400e" }}
            >
              ⚡ Widerspruch
            </span>
          )}
          <span
            className="text-sm font-bold px-3 py-1 rounded-xl"
            style={{ background: `${quoteColor(quote)}15`, color: quoteColor(quote) }}
          >
            {quote.toFixed(0)} %
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          {allGruppen.length === 0 ? (
            <p className="px-6 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              Keine Positionen extrahiert.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-subtle)" }}>
                  <th className="px-6 py-2 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Arzt / Leistungserbringer</th>
                  <th className="px-4 py-2 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rechnungsdatum</th>
                  <th className="px-4 py-2 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Eingereicht</th>
                  <th className="px-4 py-2 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Erstattet</th>
                  <th className="px-4 py-2 text-center font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Arztrechnung</th>
                </tr>
              </thead>
              <tbody>
                {allGruppen.map((row, i) => {
                  const arztName = row.gruppe?.arztName ?? row.vorgang?.arzt_name ?? "—";
                  const datum = row.gruppe?.rechnungsdatum ?? row.vorgang?.rechnungsdatum;
                  const eingereicht = row.gruppe?.betragEingereicht ?? row.vorgang?.betrag_gesamt;
                  const erstattet = row.gruppe?.betragErstattet;
                  const matched = row.status === "matched" || row.status === "linked-vorgang";

                  return (
                    <tr
                      key={i}
                      className="border-t"
                      style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-subtle)" }}
                    >
                      <td className="px-6 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                        {arztName}
                        {row.gruppe?.arztFachgebiet && (
                          <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                            · {row.gruppe.arztFachgebiet}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                        {fmtDate(datum)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                        {fmt(eingereicht)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: erstattet != null && eingereicht != null && erstattet < eingereicht ? "#ef4444" : "#22c55e" }}>
                        {erstattet != null ? fmt(erstattet) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {matched ? (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                            style={{ background: "#dcfce7", color: "#166534" }}
                          >
                            ✓ zugeordnet
                          </span>
                        ) : (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                            style={{ background: "#fef9c3", color: "#854d0e" }}
                          >
                            ⚠ nicht gefunden
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: "var(--border)" }}>
                  <td colSpan={2} className="px-6 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Gesamt
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-sm" style={{ color: "var(--navy)" }}>
                    {fmt(kasse.betrag_eingereicht)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-sm" style={{ color: quoteColor(quote) }}>
                    {fmt(kasse.betrag_erstattet)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Unmatched Arztrechnungen section ──────────────────────────────────────────

function UnmatchedSection({ vorgaenge }: { vorgaenge: UnmatchedVorgang[] }) {
  if (vorgaenge.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--card)", border: "1.5px solid #fde68a" }}
    >
      <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: "#fde68a", background: "#fffbeb" }}>
        <span>🕐</span>
        <h2 className="text-sm font-semibold" style={{ color: "#92400e" }}>
          Arztrechnungen ohne Kassenbescheid ({vorgaenge.length})
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--bg-subtle)" }}>
            <th className="px-6 py-2 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Arzt</th>
            <th className="px-4 py-2 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rechnungsdatum</th>
            <th className="px-4 py-2 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Betrag</th>
            <th className="px-4 py-2 text-center font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {vorgaenge.map((v, i) => (
            <tr
              key={v.id}
              className="border-t"
              style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-subtle)" }}
            >
              <td className="px-6 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                {v.arzt_name ?? "—"}
              </td>
              <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                {fmtDate(v.rechnungsdatum)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                {fmt(v.betrag_gesamt)}
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                  style={{ background: "#fef9c3", color: "#854d0e" }}
                >
                  ausstehend
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function KasseUebersicht({
  kasseBescheide,
  unmatchedVorgaenge,
}: {
  kasseBescheide: KasseBescheid[];
  unmatchedVorgaenge: UnmatchedVorgang[];
}) {
  if (kasseBescheide.length === 0 && unmatchedVorgaenge.length === 0) {
    return (
      <div
        className="rounded-2xl px-8 py-16 text-center"
        style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
      >
        <p className="text-4xl mb-4">🏥</p>
        <p className="font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>
          Noch keine Kassenabrechnungen
        </p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Schicken Sie einen AXA-Erstattungsbescheid als PDF via WhatsApp —<br />
          er wird automatisch erkannt und den passenden Arztrechnungen zugeordnet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <KPIBar kasseBescheide={kasseBescheide} unmatched={unmatchedVorgaenge} />
      {kasseBescheide.map((k) => (
        <KasseBescheidCard key={k.id} kasse={k} />
      ))}
      <UnmatchedSection vorgaenge={unmatchedVorgaenge} />
    </div>
  );
}
