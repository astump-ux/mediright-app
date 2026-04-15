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

function confidenceLabel(c: number | null | undefined): string | null {
  if (c == null) return null;
  if (c >= 70) return "hoch";
  if (c >= 40) return "mittel";
  return "niedrig";
}

// ── Widerspruch status config ─────────────────────────────────────────────────
const WIDERSPRUCH_STATUS_CFG: Record<string, { icon: string; label: string; bg: string; color: string; border: string }> = {
  erstellt:    { icon: "📝", label: "Widerspruch erstellt",         bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" },
  gesendet:    { icon: "📨", label: "Widerspruch gesendet — läuft", bg: "#eff6ff", color: "#1d4ed8", border: "#93c5fd" },
  beantwortet: { icon: "💬", label: "AXA hat geantwortet",          bg: "#fffbeb", color: "#92400e", border: "#fcd34d" },
  erfolgreich: { icon: "✅", label: "Widerspruch erfolgreich",       bg: "#ecfdf5", color: "#065f46", border: "#6ee7b7" },
  abgelehnt:   { icon: "❌", label: "Widerspruch endabgelehnt",      bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" },
};
const WIDERSPRUCH_ACTIVE = ["gesendet", "beantwortet", "erfolgreich", "abgelehnt"];

// ── KPI header ────────────────────────────────────────────────────────────────

function KPIBar({ kasseBescheide, unmatched }: { kasseBescheide: KasseBescheid[]; unmatched: UnmatchedVorgang[] }) {
  const totalEingereicht = kasseBescheide.reduce((s, k) => s + (k.betrag_eingereicht ?? 0), 0);
  const totalErstattet   = kasseBescheide.reduce((s, k) => s + (k.betrag_erstattet  ?? 0), 0);
  const totalAbgelehnt   = kasseBescheide.reduce((s, k) => s + (k.betrag_abgelehnt  ?? 0), 0);
  const avgQuote = totalEingereicht > 0 ? (totalErstattet / totalEingereicht) * 100 : 0;
  const unmatchedKasse = kasseBescheide.reduce(
    (s, k) => s + (k.rechnungen?.filter(r => !r.matchedVorgangId).length ?? 0), 0
  );
  const currentYear = new Date().getFullYear().toString();
  const currentYearBescheide = kasseBescheide.filter(k => k.bescheiddatum?.startsWith(currentYear));
  const latestWithSelbstbehalt = currentYearBescheide.find(k => k.selbstbehalt_verbleibend != null);
  const selbstbehaltVerbleibend  = latestWithSelbstbehalt?.selbstbehalt_verbleibend ?? null;
  const selbstbehaltJahresgrenze = latestWithSelbstbehalt?.selbstbehalt_jahresgrenze ?? null;
  const selbstbehaltGenutzt = selbstbehaltJahresgrenze != null && selbstbehaltVerbleibend != null
    ? selbstbehaltJahresgrenze - selbstbehaltVerbleibend
    : kasseBescheide.filter(k => k.bescheiddatum?.startsWith(currentYear)).reduce((s, k) => s + (k.selbstbehalt_abgezogen ?? 0), 0);

  const kpis = [
    { label: "Gesamt eingereicht",     value: fmt(totalEingereicht), accent: "var(--navy)" },
    { label: "Gesamt erstattet",        value: fmt(totalErstattet),   accent: "#22c55e" },
    { label: "Gesamt abgelehnt",        value: fmt(totalAbgelehnt),   accent: totalAbgelehnt > 0 ? "#ef4444" : "var(--text-muted)" },
    { label: "Ø Erstattungsquote",      value: avgQuote.toFixed(0) + " %", accent: quoteColor(avgQuote) },
    { label: "Offene Kassenpositionen", value: String(unmatchedKasse), accent: unmatchedKasse > 0 ? "#f59e0b" : "#22c55e" },
    { label: "Rechnungen ohne Kasse",   value: String(unmatched.length), accent: unmatched.length > 0 ? "#f59e0b" : "#22c55e" },
  ];

  return (
    <div className="flex flex-col gap-4 mb-8">
      {(selbstbehaltVerbleibend != null || selbstbehaltGenutzt > 0) && (
        <SelbstbehaltBanner verbleibend={selbstbehaltVerbleibend} jahresgrenze={selbstbehaltJahresgrenze} genutzt={selbstbehaltGenutzt} year={currentYear} />
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

// ── AblehnungsPanel ───────────────────────────────────────────────────────────

// ── Widerspruch letter generator ─────────────────────────────────────────────
function generateWiderspruchLetterKasse(kasse: KasseBescheid, analyse: KasseAnalyseResult | null) {
  const heute = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const bescheidDatum = kasse.bescheiddatum
    ? new Date(kasse.bescheiddatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "[Datum des Bescheids]";
  const ref = kasse.referenznummer ?? "[Ihre Referenznummer]";
  const abgelehnt = kasse.betrag_abgelehnt.toFixed(2);
  const begruendung = analyse?.widerspruchBegruendung ?? "Die Ablehnung ist aus meiner Sicht nicht gerechtfertigt.";
  const allPos = kasse.rechnungen.flatMap(g => (g.positionen ?? []).filter(p => p.status === "abgelehnt" || p.status === "gekuerzt"));
  const posListe = allPos.length > 0
    ? allPos.map(p => `  - Ziffer ${p.ziffer} "${p.bezeichnung}": ${(p.betragEingereicht ?? 0).toFixed(2)} € eingereicht, ${(p.betragErstattet ?? 0).toFixed(2)} € erstattet`).join("\n")
    : "  [Bitte betroffene Positionen eintragen]";
  const betreff = `Widerspruch gegen Leistungsbescheid vom ${bescheidDatum} – Referenz ${ref}`;
  const body = `AXA Krankenversicherung AG\nKundenservice / Leistungsabteilung\n[⚠️ PLATZHALTER: Adresse aus Ihrem Versicherungsschein eintragen!]

${heute}

Betreff: ${betreff}
Versicherungsnehmer: [Ihr vollständiger Name]
Versicherungsnummer: [Ihre Versicherungsnummer]

Sehr geehrte Damen und Herren,

hiermit lege ich fristgerecht Widerspruch gegen Ihren Leistungsbescheid vom ${bescheidDatum} (Referenz: ${ref}) ein.

Sie haben Leistungen in Höhe von ${abgelehnt} € nicht erstattet. Ich bin der Auffassung, dass diese Entscheidung nicht gerechtfertigt ist und bitte Sie um eine erneute Prüfung.

Betroffene Positionen:
${posListe}

Begründung meines Widerspruchs:
${begruendung}

Ich bitte Sie daher, Ihre Entscheidung zu überprüfen und mir den abgelehnten Betrag von ${abgelehnt} € vollständig zu erstatten. Sollten Sie an Ihrer Entscheidung festhalten, behalte ich mir vor, die Ombudsstelle für private Kranken- und Pflegeversicherung (www.pkv-ombudsmann.de) einzuschalten.

Bitte bestätigen Sie den Eingang dieses Widerspruchs schriftlich.

Mit freundlichen Grüßen,
[Ihr vollständiger Name]
[Ihre Adresse]
[Telefon / E-Mail]`;
  return { betreff, body };
}

// ── Arzt-Korrektur letter generator ──────────────────────────────────────────
function generateArztKorrekturLetterKasse(kasse: KasseBescheid) {
  const heute = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const korrekturPos = kasse.rechnungen.flatMap(g =>
    (g.positionen ?? [])
      .filter(p => (p as {aktionstyp?: string}).aktionstyp === "korrektur_arzt")
      .map(p => ({ arztName: g.arztName, pos: p }))
  );
  const arztName = korrekturPos[0]?.arztName ?? kasse.vorgaenge[0]?.arzt_name ?? "[Arztpraxis]";
  const posListe = korrekturPos.length > 0
    ? korrekturPos.map(({ pos: p }) => `  - GOÄ Ziff. ${p.ziffer} "${p.bezeichnung}": Faktor ${p.faktor}×, ${(p.betragEingereicht ?? 0).toFixed(2)} € eingereicht`).join("\n")
    : "  [Bitte betroffene Positionen eintragen]";
  const betreff = `Bitte um Rechnungskorrektur – Ihre Abrechnung`;
  const body = `${arztName}\n[Adresse der Praxis – bitte eintragen]

${heute}

Betreff: ${betreff}

Sehr geehrte Damen und Herren,

ich wende mich bezüglich Ihrer Abrechnung an Sie. Meine private Krankenversicherung (AXA) hat folgende Positionen nicht erstattet und hat darauf hingewiesen, dass eine Korrektur der Rechnung oder eine ergänzende Begründung erforderlich ist:

Betroffene Positionen:
${posListe}

Ich bitte Sie daher, entweder:
1. Eine korrigierte Rechnung auszustellen, oder
2. Mir eine schriftliche Begründung für den erhöhten Abrechnungsfaktor gemäß § 12 Abs. 3 GOÄ zuzusenden, die ich zur Erstattung bei meiner Versicherung einreichen kann.

Mit freundlichen Grüßen,
[Ihr vollständiger Name]
[Ihre Adresse]
[Telefon / E-Mail]`;
  return { betreff, body };
}

// ── Email panel ───────────────────────────────────────────────────────────────
function EmailPanel({ title, betreff: initBetreff, body: initBody, borderColor, headerBg, headerColor, warning }: {
  title: string; betreff: string; body: string;
  borderColor: string; headerBg: string; headerColor: string; warning?: string;
}) {
  const [editBetreff, setEditBetreff] = useState(initBetreff);
  const [editBody, setEditBody]       = useState(initBody);
  const [copied, setCopied]           = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(`Betreff: ${editBetreff}\n\n${editBody}`);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ border: `2px solid ${borderColor}` }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: headerBg }}>
        <span className="font-bold text-sm" style={{ color: headerColor }}>{title}</span>
        <span className="text-xs" style={{ color: headerColor }}>— Text bearbeiten, dann kopieren oder öffnen</span>
      </div>
      {warning && (
        <div className="px-4 py-2 flex gap-2 items-start" style={{ background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
          <span className="text-base flex-shrink-0">⚠️</span>
          <p className="text-xs" style={{ color: "#9a3412" }}>{warning}</p>
        </div>
      )}
      <div className="p-4 bg-white">
        <div className="mb-2.5">
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#64748b" }}>Betreff</label>
          <input value={editBetreff} onChange={e => setEditBetreff(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: "1px solid #e2e8f0", color: "#0f172a", boxSizing: "border-box" as const }} />
        </div>
        <div className="mb-3.5">
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#64748b" }}>E-Mail / Brief-Text</label>
          <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={14}
            className="w-full px-3 py-2.5 rounded-lg text-xs" style={{ border: "1px solid #e2e8f0", color: "#0f172a", lineHeight: 1.6, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" as const }} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={handleCopy}
            className="text-sm font-bold px-4 py-2 rounded-lg border-none cursor-pointer"
            style={{ background: copied ? "#ecfdf5" : "#f1f5f9", color: copied ? "#065f46" : "#0f172a" }}>
            {copied ? "✓ Kopiert!" : "📋 Text kopieren"}
          </button>
          <button onClick={() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, "_blank")}
            className="text-sm font-bold px-4 py-2 rounded-lg border-none cursor-pointer" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
            In Gmail öffnen
          </button>
          <button onClick={() => window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`, "_blank")}
            className="text-sm font-bold px-4 py-2 rounded-lg border-none cursor-pointer" style={{ background: "#e8f4fd", color: "#0078d4" }}>
            In Outlook öffnen
          </button>
          <button onClick={() => { const a = document.createElement("a"); a.href = `mailto:?subject=${encodeURIComponent(editBetreff)}&body=${encodeURIComponent(editBody)}`; a.click(); }}
            className="text-xs px-3 py-2 rounded-lg cursor-pointer" style={{ border: "1px solid #e2e8f0", background: "white", color: "#64748b" }}>
            Anderes Programm
          </button>
        </div>
        <p className="text-xs mt-2.5" style={{ color: "#94a3b8" }}>💡 Gmail &amp; Outlook öffnen im Browser, "Anderes Programm" öffnet deinen Mail-Client.</p>
      </div>
    </div>
  );
}

function AblehnungsPanel({ kasse }: { kasse: KasseBescheid }) {
  const [showPositionen, setShowPositionen] = useState(true);
  const [showSchritte, setShowSchritte]     = useState(true);
  const [showWiderspruchPanel, setShowWiderspruchPanel] = useState(false);
  const [showArztPanel, setShowArztPanel]               = useState(false);

  const analyse = kasse.kasse_analyse as KasseAnalyseResult | null;
  const widerspruchStatus = kasse.widerspruch_status ?? null;
  const widerspruchActive = WIDERSPRUCH_ACTIVE.includes(widerspruchStatus ?? "");
  const statusCfg = widerspruchStatus ? WIDERSPRUCH_STATUS_CFG[widerspruchStatus] : null;

  const abgelehnte: Array<{ arztName: string; pos: KassePosition }> = [];
  for (const gruppe of kasse.rechnungen) {
    for (const pos of gruppe.positionen ?? []) {
      if (pos.status === "abgelehnt" || pos.status === "gekuerzt") {
        abgelehnte.push({ arztName: gruppe.arztName ?? "Unbekannt", pos });
      }
    }
  }

  const hasKasseAction = abgelehnte.some(a => {
    const at = (a.pos as {aktionstyp?: string}).aktionstyp;
    return at === "widerspruch_kasse" || at == null;
  });
  const hasArztAction  = abgelehnte.some(a => (a.pos as {aktionstyp?: string}).aktionstyp === "korrektur_arzt");

  const ablehnungsgruende = analyse?.ablehnungsgruende ?? [];
  const widerspruch       = analyse?.widerspruchEmpfohlen ?? false;
  const begruendung       = analyse?.widerspruchBegruendung ?? null;
  const erfolg            = analyse?.widerspruchErfolgswahrscheinlichkeit ?? null;
  const schritte          = analyse?.naechsteSchritte ?? null;

  if (abgelehnte.length === 0 && ablehnungsgruende.length === 0) return null;

  const erfolgColor = erfolg == null ? "#64748b" : erfolg >= 70 ? "#22c55e" : erfolg >= 40 ? "#f59e0b" : "#ef4444";

  // Aggregate confidence from positions
  const confValues = abgelehnte
    .map(a => (a.pos as { widerspruchWahrscheinlichkeit?: number | null; confidence?: number | null }).confidence)
    .filter((c): c is number => c != null);
  const avgConf   = confValues.length > 0 ? confValues.reduce((s, c) => s + c, 0) / confValues.length : null;
  const confLabel = confidenceLabel(avgConf);
  const confColor = confLabel === "hoch" ? "#065f46" : confLabel === "mittel" ? "#92400e" : "#64748b";
  const confBg    = confLabel === "hoch" ? "#dcfce7"  : confLabel === "mittel" ? "#fef3c7"  : "#f1f5f9";

  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1.5px solid #fecaca" }}>

      {/* ── Widerspruch status banner ── */}
      {widerspruchActive && statusCfg && (
        <div className="px-5 py-3 flex items-center justify-between gap-3"
          style={{ background: statusCfg.bg, borderBottom: `1.5px solid ${statusCfg.border}` }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 20 }}>{statusCfg.icon}</span>
            <div>
              <p className="text-sm font-bold" style={{ color: statusCfg.color }}>{statusCfg.label}</p>
              <p className="text-xs" style={{ color: statusCfg.color, opacity: 0.75 }}>Alle Details im Widerspruchs-Tab</p>
            </div>
          </div>
          <a href="/widersprueche"
            className="text-xs font-bold px-4 py-2 rounded-lg no-underline flex-shrink-0"
            style={{ background: statusCfg.color, color: "white" }}>
            → Zum Verfahren
          </a>
        </div>
      )}

      {/* ── Abgelehnte Positionen (collapsible) ── */}
      <div
        className="px-5 py-3 flex items-center gap-2 cursor-pointer select-none"
        style={{ background: "#fff1f2" }}
        onClick={() => setShowPositionen(v => !v)}
      >
        <span>❌</span>
        <span className="text-sm font-semibold flex-1" style={{ color: "#991b1b" }}>
          Abgelehnte &amp; Gekürzte Positionen ({abgelehnte.length})
        </span>
        <span className="text-xs font-mono" style={{ color: "#ef4444" }}>−{fmt(kasse.betrag_abgelehnt)}</span>
        <span className="text-xs ml-2" style={{ color: "#ef4444", opacity: 0.6 }}>{showPositionen ? "▲ einklappen" : "▼ ausklappen"}</span>
      </div>

      {showPositionen && abgelehnte.length > 0 && (
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
            {abgelehnte.map(({ arztName, pos }, i) => {
              const posExt = pos as { widerspruchWahrscheinlichkeit?: number | null; confidence?: number | null };
              const p = posExt.widerspruchWahrscheinlichkeit;
              const pColor = p != null ? (p >= 50 ? "#92400e" : p >= 20 ? "#854d0e" : "#64748b") : "";
              const pBg    = p != null ? (p >= 50 ? "#fef3c7" : p >= 20 ? "#fef9c3" : "#f1f5f9")  : "";
              const pIcon  = p != null ? (p >= 50 ? "⚡" : p >= 20 ? "⚠️" : "✗") : "";
              return (
                <tr key={i} className="border-t" style={{ borderColor: "#fecaca", background: i % 2 === 0 ? "white" : "#fff5f5" }}>
                  <td className="px-5 py-2.5 font-mono text-xs font-semibold" style={{ color: "#991b1b" }}>{pos.ziffer}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-xs" style={{ color: "#1e293b" }}>{pos.bezeichnung}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>{arztName}</div>
                    {pos.ablehnungsgrund && (
                      <div className="text-xs mt-1 italic" style={{ color: "#dc2626" }}>→ {pos.ablehnungsgrund}</div>
                    )}
                    {p != null && (
                      <span className="inline-flex items-center gap-1 mt-1.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: pBg, color: pColor }}>
                          {pIcon} {p}% Erfolgschance
                        </span>
                      </span>
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
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── Handlungsempfehlung (nur wenn Widerspruch empfohlen UND noch nicht aktiv) ── */}
      {widerspruch && !widerspruchActive && (
        <div className="border-t" style={{ borderColor: "#fecaca" }}>
          <div className="px-5 py-4" style={{ background: "#fffbeb" }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <p className="text-sm font-semibold" style={{ color: "#92400e" }}>Handlungsempfehlung</p>
              </div>
              {erfolg != null && (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "white", border: "1px solid #fcd34d" }}>
                  <div className="text-right">
                    <div className="font-extrabold leading-none" style={{ fontSize: 22, color: erfolgColor }}>{erfolg}%</div>
                    <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>Erfolgschance</div>
                  </div>
                  {confLabel && (
                    <div className="pl-2 border-l" style={{ borderColor: "#e2e8f0" }}>
                      <div className="text-xs mb-1" style={{ color: "#64748b" }}>KI-Konfidenz</div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: confBg, color: confColor }}>{confLabel}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {begruendung && (
              <p className="text-sm mb-4" style={{ color: "#78350f", lineHeight: 1.6 }}>{begruendung}</p>
            )}

            {schritte && schritte.length > 0 && (
              <div>
                <div
                  className="flex items-center justify-between cursor-pointer select-none mb-2"
                  onClick={() => setShowSchritte(v => !v)}
                >
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#92400e" }}>
                    Nächste Schritte ({schritte.length})
                  </p>
                  <span className="text-xs" style={{ color: "#92400e", opacity: 0.6 }}>{showSchritte ? "▲" : "▼"}</span>
                </div>
                {showSchritte && (
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
                )}
              </div>
            )}

            {/* ── CTAs ── */}
            <div className="flex flex-wrap gap-2 mt-4">
              {hasKasseAction && (
                <button
                  onClick={() => { setShowWiderspruchPanel(v => !v); setShowArztPanel(false); }}
                  className="text-xs font-bold px-3.5 py-2 rounded-lg border-none cursor-pointer"
                  style={{ background: showWiderspruchPanel ? "#92400e" : "#b45309", color: "white" }}>
                  {showWiderspruchPanel ? "▲ E-Mail schließen" : "⚖️ Widerspruch per E-Mail erstellen"}
                </button>
              )}
              {hasArztAction && (
                <button
                  onClick={() => { setShowArztPanel(v => !v); setShowWiderspruchPanel(false); }}
                  className="text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer"
                  style={{ background: showArztPanel ? "#9a3412" : "white", color: showArztPanel ? "white" : "#92400e", border: "1px solid #f59e0b" }}>
                  {showArztPanel ? "▲ Schreiben schließen" : "🩺 Arzt um Korrektur bitten"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Email panels ── */}
      {showWiderspruchPanel && (() => {
        const { betreff, body } = generateWiderspruchLetterKasse(kasse, analyse);
        return (
          <EmailPanel
            title="📧 Widerspruch per E-Mail"
            betreff={betreff} body={body}
            borderColor="#f59e0b" headerBg="#fffbeb" headerColor="#92400e"
            warning="Empfängeradresse ist ein PLATZHALTER. Bitte die korrekte AXA-Adresse aus Ihrem Versicherungsschein eintragen, bevor Sie die E-Mail absenden."
          />
        );
      })()}
      {showArztPanel && (() => {
        const { betreff, body } = generateArztKorrekturLetterKasse(kasse);
        return (
          <EmailPanel
            title="🩺 Schreiben an Arztpraxis"
            betreff={betreff} body={body}
            borderColor="#fb923c" headerBg="#fff7ed" headerColor="#9a3412"
            warning="Bitte die Adresse der Praxis vor dem Versenden eintragen."
          />
        );
      })()}
    </div>
  );
}

// ── Single Kassenbescheid card ─────────────────────────────────────────────────

function KasseBescheidCard({ kasse }: { kasse: KasseBescheid }) {
  const [open, setOpen] = useState(true);
  const quote = kasse.betrag_eingereicht > 0
    ? (kasse.betrag_erstattet / kasse.betrag_eingereicht) * 100
    : 0;

  const widerspruchStatus = kasse.widerspruch_status ?? null;
  const widerspruchActive = WIDERSPRUCH_ACTIVE.includes(widerspruchStatus ?? "");
  const statusCfg = widerspruchStatus ? WIDERSPRUCH_STATUS_CFG[widerspruchStatus] : null;

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
          {/* Widerspruch status badge */}
          {widerspruchActive && statusCfg ? (
            <span className="text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}>
              {statusCfg.icon} {widerspruchStatus === "gesendet" ? "Widerspruch läuft" : statusCfg.label}
            </span>
          ) : kasse.widerspruch_empfohlen ? (
            <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: "#fef3c7", color: "#92400e" }}>⚡ Widerspruch empfohlen</span>
          ) : null}
          {/* Erstattungsquote — clearly labelled */}
          <span className="text-xs font-bold px-3 py-1 rounded-xl" title="Erstattungsquote"
            style={{ background: `${quoteColor(quote)}15`, color: quoteColor(quote) }}>
            {quote.toFixed(0)}% erstattet
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
                    const arztName    = row.gruppe?.arztName ?? row.vorgang?.arzt_name ?? "—";
                    const datum       = row.gruppe?.rechnungsdatum ?? row.vorgang?.rechnungsdatum;
                    const eingereicht = row.gruppe?.betragEingereicht ?? row.vorgang?.betrag_gesamt;
                    const erstattet   = row.gruppe?.betragErstattet;
                    const abgelehnt   = row.gruppe?.betragAbgelehnt ?? 0;
                    const matched     = row.status === "matched" || row.status === "linked-vorgang";
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
          {kasse.betrag_abgelehnt > 0 && <AblehnungsPanel kasse={kasse} />}
        </div>
      )}
    </div>
  );
}

// ── Unmatched Arztrechnungen ───────────────────────────────────────────────────

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
