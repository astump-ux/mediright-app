"use client";
import { useState } from "react";
import type { KasseBescheid, UnmatchedVorgang } from "@/app/kassenabrechnung/page";
import type { KasseRechnungGruppe, KasseAnalyseResult, KassePosition } from "@/lib/goae-analyzer";

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

  const currentYear = new Date().getFullYear().toString();
  const currentYearBescheide = kasseBescheide.filter(k => k.bescheiddatum?.startsWith(currentYear));
  const latestWithSelbstbehalt = currentYearBescheide.find(k => k.selbstbehalt_verbleibend != null);
  const selbstbehaltVerbleibend  = latestWithSelbstbehalt?.selbstbehalt_verbleibend ?? null;
  const selbstbehaltJahresgrenze = latestWithSelbstbehalt?.selbstbehalt_jahresgrenze ?? null;
  const selbstbehaltGenutzt = selbstbehaltJahresgrenze != null && selbstbehaltVerbleibend != null
    ? selbstbehaltJahresgrenze - selbstbehaltVerbleibend
    : kasseBescheide
        .filter(k => k.bescheiddatum?.startsWith(currentYear))
        .reduce((s, k) => s + (k.selbstbehalt_abgezogen ?? 0), 0);

  const kpis = [
    { label: "Gesamt eingereicht",    value: fmt(totalEingereicht), accent: "var(--navy)" },
    { label: "Gesamt erstattet",      value: fmt(totalErstattet),   accent: "#22c55e" },
    { label: "Gesamt abgelehnt",      value: fmt(totalAbgelehnt),   accent: totalAbgelehnt > 0 ? "#ef4444" : "var(--text-muted)" },
    { label: "Ø Erstattungsquote",    value: avgQuote.toFixed(0) + " %", accent: quoteColor(avgQuote) },
    { label: "Offene Kassenpositionen", value: String(unmatchedKasse), accent: unmatchedKasse > 0 ? "#f59e0b" : "#22c55e" },
    { label: "Rechnungen ohne Kasse", value: String(unmatched.length), accent: unmatched.length > 0 ? "#f59e0b" : "#22c55e" },
  ];

  return (
    <div className="flex flex-col gap-4 mb-8">
      {(selbstbehaltVerbleibend != null || selbstbehaltGenutzt > 0) && (
        <SelbstbehaltBanner
          verbleibend={selbstbehaltVerbleibend}
          jahresgrenze={selbstbehaltJahresgrenze}
          genutzt={selbstbehaltGenutzt}
          year={currentYear}
        />
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl px-5 py-4" style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{k.label}</p>
            <p className="text-2xl font-bold" style={{ color: k.accent, fontFamily: "'DM Serif Display', Georgia, serif" }}>{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Selbstbehalt banner ───────────────────────────────────────────────────────

function SelbstbehaltBanner({ verbleibend, jahresgrenze, genutzt, year }: {
  verbleibend: number | null; jahresgrenze: number | null; genutzt: number; year: string;
}) {
  const progress = jahresgrenze && jahresgrenze > 0 ? Math.min(100, (genutzt / jahresgrenze) * 100) : null;
  return (
    <div className="rounded-2xl px-6 py-5" style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <p className="text-sm font-semibold" style={{ color: "var(--navy)" }}>Selbstbehalt {year}</p>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Laut letztem Bescheid</p>
      </div>
      <div className="flex items-end gap-6">
        <div>
          <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Bereits abgezogen</p>
          <p className="text-2xl font-bold" style={{ color: "#f59e0b", fontFamily: "'DM Serif Display', Georgia, serif" }}>{fmt(genutzt)}</p>
        </div>
        {verbleibend != null && (
          <div>
            <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Noch verbleibend</p>
            <p className="text-2xl font-bold" style={{ color: verbleibend === 0 ? "#22c55e" : "var(--navy)", fontFamily: "'DM Serif Display', Georgia, serif" }}>{fmt(verbleibend)}</p>
          </div>
        )}
        {jahresgrenze != null && (
          <div>
            <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Jahresgrenze</p>
            <p className="text-xl font-semibold" style={{ color: "var(--text-muted)" }}>{fmt(jahresgrenze)}</p>
          </div>
        )}
        {progress != null && (
          <div className="flex-1 min-w-[120px]">
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              <span>Verbrauch</span><span>{progress.toFixed(0)} %</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: progress >= 100 ? "#22c55e" : progress >= 60 ? "#f59e0b" : "#3b82f6" }} />
            </div>
            {progress >= 100 && <p className="text-xs mt-1 font-semibold" style={{ color: "#22c55e" }}>✓ Jahres-Selbstbehalt erreicht</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rejected positions detail panel ──────────────────────────────────────────

function AblehnungsPanel({ kasse }: { kasse: KasseBescheid }) {
  const analyse = kasse.kasse_analyse as KasseAnalyseResult | null;

  // Collect all abgelehnte/gekürzte positions across all rechnungen
  const abgelehnte: Array<{ arztName: string; pos: KassePosition }> = [];
  for (const gruppe of kasse.rechnungen) {
    for (const pos of gruppe.positionen ?? []) {
      if (pos.status === "abgelehnt" || pos.status === "gekuerzt") {
        abgelehnte.push({ arztName: gruppe.arztName ?? "Unbekannt", pos });
      }
    }
  }

  const ablehnungsgruende = analyse?.ablehnungsgruende ?? [];
  const widerspruch       = analyse?.widerspruchEmpfohlen ?? false;
  const begruendung       = analyse?.widerspruchBegruendung ?? null;
  const erfolg            = analyse?.widerspruchErfolgswahrscheinlichkeit ?? null;
  const schritte          = analyse?.naechsteSchritte ?? null;

  if (abgelehnte.length === 0 && ablehnungsgruende.length === 0) return null;

  const erfolgColor = erfolg == null ? "#64748b" : erfolg >= 70 ? "#22c55e" : erfolg >= 40 ? "#f59e0b" : "#ef4444";
  const erfolgBg    = erfolg == null ? "#f1f5f9" : erfolg >= 70 ? "#dcfce7" : erfolg >= 40 ? "#fef3c7" : "#fee2e2";

  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1.5px solid #fecaca" }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center gap-2" style={{ background: "#fff1f2" }}>
        <span>❌</span>
        <span className="text-sm font-semibold" style={{ color: "#991b1b" }}>
          Abgelehnte & Gekürzte Positionen
        </span>
        <span className="ml-auto text-xs font-mono" style={{ color: "#ef4444" }}>
          −{fmt(kasse.betrag_abgelehnt)}
        </span>
      </div>

      {/* Positions table */}
      {abgelehnte.length > 0 && (
        <table className="w-full text-sm border-t" style={{ borderColor: "#fecaca" }}>
          <thead>
            <tr style={{ background: "#fef2f2" }}>
              <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#991b1b" }}>Ziffer</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#991b1b" }}>Bezeichnung / Arzt</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#991b1b" }}>Eingereicht</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#991b1b" }}>Erstattet</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "#991b1b" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {abgelehnte.map(({ arztName, pos }, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "#fecaca", background: i % 2 === 0 ? "white" : "#fff5f5" }}>
                <td className="px-5 py-2.5 font-mono text-xs font-semibold" style={{ color: "#991b1b" }}>{pos.ziffer}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-xs" style={{ color: "#1e293b" }}>{pos.bezeichnung}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>{arztName}</div>
                  {pos.ablehnungsgrund && (
                    <div className="text-xs mt-1 italic" style={{ color: "#dc2626" }}>
                      → {pos.ablehnungsgrund}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: "#475569" }}>{fmt(pos.betragEingereicht)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold" style={{ color: pos.betragErstattet > 0 ? "#f59e0b" : "#ef4444" }}>
                  {fmt(pos.betragErstattet)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {pos.status === "abgelehnt"
                    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: "#fee2e2", color: "#991b1b" }}>✗ Abgelehnt</span>
                    : <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: "#fef3c7", color: "#92400e" }}>⚠ Gekürzt</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Ablehnungsgründe */}
      {ablehnungsgruende.length > 0 && (
        <div className="px-5 py-4 border-t" style={{ borderColor: "#fecaca", background: "#fff8f8" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#991b1b" }}>Ablehnungsgründe der Kasse</p>
          <div className="flex flex-col gap-1.5">
            {ablehnungsgruende.map((g, i) => (
              <div key={i} className="flex gap-2 items-start text-xs" style={{ color: "#475569" }}>
                <span style={{ color: "#ef4444", flexShrink: 0 }}>•</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Widerspruchs-Analyse */}
      {widerspruch && (
        <div className="border-t" style={{ borderColor: "#fecaca" }}>
          <div className="px-5 py-4" style={{ background: "#fffbeb" }}>
            {/* Headline + Erfolgsquote */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <p className="text-sm font-semibold" style={{ color: "#92400e" }}>Widerspruch empfohlen</p>
              </div>
              {erfolg != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "#92400e" }}>Erfolgswahrscheinlichkeit</span>
                  <span className="text-sm font-bold px-3 py-0.5 rounded-xl" style={{ background: erfolgBg, color: erfolgColor }}>
                    {erfolg} %
                  </span>
                </div>
              )}
            </div>

            {/* Begründung */}
            {begruendung && (
              <p className="text-sm mb-4" style={{ color: "#78350f", lineHeight: 1.6 }}>{begruendung}</p>
            )}

            {/* Nächste Schritte */}
            {schritte && schritte.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#92400e" }}>
                  Empfohlene nächste Schritte
                </p>
                <div className="flex flex-col gap-2">
                  {schritte.map((s, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#f59e0b", color: "white" }}>
                        {i + 1}
                      </span>
                      <p className="text-sm" style={{ color: "#78350f", lineHeight: 1.5 }}>{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single Kassenbescheid card ─────────────────────────────────────────────────

function KasseBescheidCard({ kasse }: { kasse: KasseBescheid }) {
  const [open, setOpen] = useState(true);
  const quote = kasse.betrag_eingereicht > 0
    ? (kasse.betrag_erstattet / kasse.betrag_eingereicht) * 100
    : 0;

  const allGruppen: Array<{
    gruppe: KasseRechnungGruppe | null;
    vorgang: KasseBescheid["vorgaenge"][0] | null;
    status: "matched" | "unmatched-kasse" | "linked-vorgang";
  }> = [];

  const linkedVorgangIds = new Set(kasse.vorgaenge.map((v) => v.id));

  for (const g of kasse.rechnungen) {
    const matchedVorgang = kasse.vorgaenge.find((v) => v.id === g.matchedVorgangId) ?? null;
    allGruppen.push({ gruppe: g, vorgang: matchedVorgang, status: matchedVorgang ? "matched" : "unmatched-kasse" });
    if (matchedVorgang) linkedVorgangIds.delete(matchedVorgang.id);
  }
  for (const v of kasse.vorgaenge) {
    if (linkedVorgangIds.has(v.id)) {
      allGruppen.push({ gruppe: null, vorgang: v, status: "linked-vorgang" });
    }
  }

  return (
    <div className="rounded-2xl mb-5 overflow-hidden" style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}>
      {/* Header */}
      <button className="w-full flex items-center justify-between px-6 py-4 text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-4">
          <span className="text-xl">🏥</span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              Bescheid {fmtDate(kasse.bescheiddatum)}
              {kasse.referenznummer && (
                <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>Ref. {kasse.referenznummer}</span>
              )}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Eingereicht: {fmt(kasse.betrag_eingereicht)} · Erstattet: {fmt(kasse.betrag_erstattet)}
              {kasse.betrag_abgelehnt > 0 && <span style={{ color: "#ef4444" }}> · Abgelehnt: {fmt(kasse.betrag_abgelehnt)}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {kasse.widerspruch_empfohlen && (
            <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: "#fef3c7", color: "#92400e" }}>⚡ Widerspruch</span>
          )}
          <span className="text-sm font-bold px-3 py-1 rounded-xl" style={{ background: `${quoteColor(quote)}15`, color: quoteColor(quote) }}>
            {quote.toFixed(0)} %
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
          {allGruppen.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Keine Positionen extrahiert.</p>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1.5px solid var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--bg-subtle)" }}>
                    <th className="px-5 py-2 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Arzt / Leistungserbringer</th>
                    <th className="px-4 py-2 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rechnungsdatum</th>
                    <th className="px-4 py-2 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Eingereicht</th>
                    <th className="px-4 py-2 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Erstattet</th>
                    <th className="px-4 py-2 text-center font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Arztrechnung</th>
                  </tr>
                </thead>
                <tbody>
                  {allGruppen.map((row, i) => {
                    const arztName   = row.gruppe?.arztName ?? row.vorgang?.arzt_name ?? "—";
                    const datum      = row.gruppe?.rechnungsdatum ?? row.vorgang?.rechnungsdatum;
                    const eingereicht = row.gruppe?.betragEingereicht ?? row.vorgang?.betrag_gesamt;
                    const erstattet  = row.gruppe?.betragErstattet;
                    const abgelehnt  = row.gruppe?.betragAbgelehnt ?? 0;
                    const matched    = row.status === "matched" || row.status === "linked-vorgang";
                    return (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-subtle)" }}>
                        <td className="px-5 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                          {arztName}
                          {row.gruppe?.arztFachgebiet && <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>· {row.gruppe.arztFachgebiet}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(datum)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "var(--text-primary)" }}>{fmt(eingereicht)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          <span style={{ color: erstattet != null && eingereicht != null && erstattet < eingereicht ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                            {erstattet != null ? fmt(erstattet) : "—"}
                          </span>
                          {abgelehnt > 0 && (
                            <div className="text-xs mt-0.5" style={{ color: "#ef4444" }}>−{fmt(abgelehnt)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {matched
                            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: "#dcfce7", color: "#166534" }}>✓ zugeordnet</span>
                            : <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: "#fef9c3", color: "#854d0e" }}>⚠ nicht gefunden</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2" style={{ borderColor: "var(--border)" }}>
                    <td colSpan={2} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Gesamt eingereicht / erstattet
                    </td>
                    <td className="px-4 py-2 text-right font-bold font-mono text-sm" style={{ color: "var(--navy)" }}>{fmt(kasse.betrag_eingereicht)}</td>
                    <td className="px-4 py-2 text-right font-bold font-mono text-sm" style={{ color: quoteColor(quote) }}>{fmt(kasse.betrag_erstattet)}</td>
                    <td />
                  </tr>
                  {kasse.selbstbehalt_abgezogen != null && kasse.selbstbehalt_abgezogen > 0 && (
                    <tr style={{ background: "#fffbeb" }}>
                      <td colSpan={2} className="px-5 py-2 text-xs font-semibold" style={{ color: "#92400e" }}>🛡️ Selbstbehalt abgezogen</td>
                      <td className="px-4 py-2 text-right font-mono text-xs font-semibold" style={{ color: "#92400e" }}>−{fmt(kasse.selbstbehalt_abgezogen)}</td>
                      <td colSpan={2} className="px-4 py-2 text-xs" style={{ color: "#92400e" }}>
                        {kasse.selbstbehalt_verbleibend != null ? `Noch verbleibend: ${fmt(kasse.selbstbehalt_verbleibend)}` : ""}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}

          {/* Ablehnungsanalyse — shown when there are rejected items */}
          {kasse.betrag_abgelehnt > 0 && <AblehnungsPanel kasse={kasse} />}
        </div>
      )}
    </div>
  );
}

// ── Unmatched Arztrechnungen section ──────────────────────────────────────────

function UnmatchedSection({ vorgaenge }: { vorgaenge: UnmatchedVorgang[] }) {
  if (vorgaenge.length === 0) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1.5px solid #fde68a" }}>
      <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: "#fde68a", background: "#fffbeb" }}>
        <span>🕐</span>
        <h2 className="text-sm font-semibold" style={{ color: "#92400e" }}>Arztrechnungen ohne Kassenbescheid ({vorgaenge.length})</h2>
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
            <tr key={v.id} className="border-t" style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-subtle)" }}>
              <td className="px-6 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{v.arzt_name ?? "—"}</td>
              <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(v.rechnungsdatum)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "var(--text-primary)" }}>{fmt(v.betrag_gesamt)}</td>
              <td className="px-4 py-3 text-center">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: "#fef9c3", color: "#854d0e" }}>ausstehend</span>
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
      <div className="rounded-2xl px-8 py-16 text-center" style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}>
        <p className="text-4xl mb-4">🏥</p>
        <p className="font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>Noch keine Kassenabrechnungen</p>
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
      {kasseBescheide.map((k) => <KasseBescheidCard key={k.id} kasse={k} />)}
      <UnmatchedSection vorgaenge={unmatchedVorgaenge} />
    </div>
  );
}
