"use client"
import { useState } from "react";
import type { DashboardData, Vorgang, VorsorgeItem } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

const statusDot: Record<string, string> = {
  erstattet: "var(--mint)",
  abgelehnt: "#ef4444",
  pruefen: "#f59e0b",
  offen: "#94a3b8",
};

const statusLabel: Record<string, string> = {
  erstattet: "Erstattet",
  abgelehnt: "Abgelehnt",
  pruefen: "In Prüfung",
  offen: "Offen",
};

// Verified Vorsorge/Leistungen pages per PKV insurer (researched April 2026)
// tariffLinks: lowercase tariff name substring → tariff-specific URL override
const PKV_VORSORGE_LINKS: Record<string, {
  url: string;
  label: string;
  tariffLinks?: Record<string, string>
}> = {
  'AXA': {
    url: 'https://www.axa.de/pk/gesundheit/a/vorsorge-untersuchungen',
    label: 'AXA Vorsorgeuntersuchungen',
    tariffLinks: {
      'activeme': 'https://www.axa.de/pk/gesundheit/p/activeme',
      'active':   'https://www.axa.de/pk/gesundheit/p/activeme',
    },
  },
  'Allianz': {
    url: 'https://www.allianz.de/gesundheit/private-krankenversicherung/vorsorgeuntersuchungen-kosten/',
    label: 'Allianz Vorsorgeuntersuchungen',
  },
  'DKV': {
    url: 'https://www.dkv.com/gesundheit-vorsorge-erwachsene-7688.html',
    label: 'DKV Gesundheitsvorsorge',
  },
  'Debeka': {
    url: 'https://www.debeka.de/service/progesundheit/progesundheit-vorsorge/ambulante-vorsorgeuntersuchungen.html',
    label: 'Debeka Vorsorgeuntersuchungen',
  },
  'Hallesche': {
    url: 'https://www.hallesche.de/privatkunden/private-krankenversicherung/angestellte-und-selbststaendige',
    label: 'Hallesche PKV Vorsorge',
  },
  'Barmenia': {
    url: 'https://www.barmenia.de/deu/bde_privat/bde_service/bde_gesundheitsservice/uebersicht.xhtml',
    label: 'Barmenia Gesundheitsservice',
  },
  'Continentale': {
    url: 'https://www.continentale.de/privatkunden/krankenversicherung/pkv',
    label: 'Continentale PKV Leistungen',
  },
  'Signal Iduna': {
    url: 'https://www.signal-iduna.de/krankenversicherung/private-krankenversicherung/',
    label: 'Signal Iduna PKV Leistungen',
  },
  'HUK-Coburg': {
    url: 'https://www.huk.de/produkte/krankenversicherung/private-krankenversicherung.html',
    label: 'HUK-Coburg PKV Leistungen',
  },
  'Gothaer': {
    url: 'https://www.gothaer.de/krankenversicherung/private-krankenversicherung/',
    label: 'Gothaer PKV Leistungen',
  },
}

/**
 * Returns the best Vorsorge URL for the given insurer + tariff combination.
 * Checks tariff-specific overrides first (e.g. AXA ActiveMe → ActiveMe page).
 */
function getVorsorgeLink(pkvName: string, tarif: string): { url: string; label: string } | null {
  const entry = PKV_VORSORGE_LINKS[pkvName]
  if (!entry) return null
  if (entry.tariffLinks && tarif) {
    const tarifLower = tarif.toLowerCase()
    for (const [key, url] of Object.entries(entry.tariffLinks)) {
      if (tarifLower.includes(key)) return { url, label: entry.label }
    }
  }
  return { url: entry.url, label: entry.label }
}

function formatDate(iso: string | null): string {
  if (!iso) return "–"
  const d = new Date(iso)
  const monate = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"]
  return `${monate[d.getMonth()]} ${d.getFullYear()}`
}

function addMonthsClient(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function vorsorgeStatusClient(naechstesDatum: string | null): VorsorgeItem['status'] {
  if (!naechstesDatum) return 'unbekannt'
  const now = new Date()
  const next = new Date(naechstesDatum)
  const diffDays = Math.floor((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'faellig'
  if (diffDays <= 90) return 'bald'
  return 'ok'
}

function VorsorgeCard({ item }: { item: VorsorgeItem }) {
  const [letzteDatum, setLetzteDatum] = useState<string | null>(item.letzteDatum)
  const [naechstesDatum, setNaechstesDatum] = useState<string | null>(item.naechstesDatum)
  const [status, setStatus] = useState<VorsorgeItem['status']>(item.status)
  const [editing, setEditing] = useState(false)
  const [dateInput, setDateInput] = useState(item.letzteDatum ?? "")
  const [saving, setSaving] = useState(false)

  const styles = {
    faellig:   { bg: "#fff8f8", border: "#fca5a5", badgeBg: "#fee2e2", badgeColor: "#b91c1c" },
    bald:      { bg: "#fffbeb", border: "#fde68a", badgeBg: "#fef3c7", badgeColor: "#92400e" },
    ok:        { bg: "#f0fdf4", border: "#6ee7b7", badgeBg: "#d1fae5", badgeColor: "#059669" },
    unbekannt: { bg: "#f8fafc", border: "#e2e8f0", badgeBg: "#f1f5f9", badgeColor: "#64748b" },
  }[status] ?? { bg: "#f8fafc", border: "#e2e8f0", badgeBg: "#f1f5f9", badgeColor: "#64748b" };

  async function saveDate() {
    if (!dateInput) return
    setSaving(true)
    try {
      await fetch(`/api/vorsorge/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letzte_untersuchung_datum: dateInput }),
      })
      const newNaechstes = addMonthsClient(dateInput, item.empfIntervallMonate)
      setLetzteDatum(dateInput)
      setNaechstesDatum(newNaechstes)
      setStatus(vorsorgeStatusClient(newNaechstes))
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
      {/* Icon + name */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-lg leading-none mb-1">{item.icon}</div>
          <div className="text-xs font-bold leading-tight" style={{ color: "var(--navy)", overflowWrap: "break-word" }}>{item.name}</div>
        </div>
        {/* Inline-Edit trigger */}
        <button
          onClick={() => { setEditing(e => !e); setDateInput(letzteDatum ?? ""); }}
          title="Letzten Termin manuell eintragen"
          className="text-[11px] rounded-lg px-1.5 py-0.5 flex-shrink-0"
          style={{ background: "rgba(0,0,0,0.04)", color: "#94a3b8", border: "none", cursor: "pointer" }}
        >
          ✏️
        </button>
      </div>

      {/* Detail rows */}
      <div className="flex flex-col gap-0.5 mb-2">
        <div className="text-[10px]" style={{ color: "#64748b" }}>
          <span className="font-semibold">Intervall:</span> alle {item.empfIntervallMonate} Monate
        </div>
        <div className="text-[10px]" style={{ color: "#64748b" }}>
          <span className="font-semibold">Letzter:</span>{" "}
          {letzteDatum ? formatDate(letzteDatum) : <span className="italic">nicht erfasst</span>}
        </div>
        <div className="text-[10px]" style={{ color: "#64748b" }}>
          <span className="font-semibold">Nächster:</span>{" "}
          {naechstesDatum ? formatDate(naechstesDatum) : "–"}
        </div>
      </div>

      {/* Inline date edit */}
      {editing && (
        <div className="mb-2 flex gap-1 items-center">
          <input
            type="date"
            value={dateInput}
            onChange={e => setDateInput(e.target.value)}
            className="text-[10px] rounded-lg px-2 py-1 flex-1"
            style={{ border: "1.5px solid var(--border)", fontFamily: "inherit", background: "white" }}
          />
          <button
            onClick={saveDate}
            disabled={saving || !dateInput}
            className="text-[10px] font-bold rounded-lg px-2 py-1"
            style={{ background: "var(--navy)", color: "white", border: "none", cursor: saving ? "wait" : "pointer" }}
          >
            {saving ? "…" : "✓"}
          </button>
        </div>
      )}

      {/* Status badge */}
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: styles.badgeBg, color: styles.badgeColor }}>
        {status === "faellig" ? "Jetzt fällig"
         : status === "ok" ? `${formatDate(naechstesDatum)} ✓`
         : status === "bald" ? `${formatDate(naechstesDatum)}`
         : "Datum unbekannt"}
      </span>
    </div>
  );
}

function VorgangRow({ v }: { v: Vorgang }) {
  return (
    <a
      href={`/rechnungen#vorgang-${v.id}`}
      className="grid grid-cols-[56px_1fr_auto] gap-x-3 items-start py-3 border-b border-slate-100 last:border-0 no-underline group"
      style={{ color: "inherit" }}
    >
      <div className="text-[11px] font-bold text-slate-400 text-center leading-tight">
        {v.datum.split(".").slice(0, 2).join(".")}
        <br />
        {v.datum.split(".")[2]}
      </div>
      <div>
        <div className="font-bold text-sm group-hover:underline" style={{ color: "var(--navy)" }}>
          {v.arzt}
        </div>
        <div className="text-xs text-slate-500 mb-2">{v.fachrichtung}</div>
        <div className="flex flex-wrap gap-1">
          {v.goaZiffern?.map((z) => (
            <span key={z} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: v.flagged ? "#fef3c7" : "#f1f5f9", color: v.flagged ? "#92400e" : "#64748b" }}>
              {z}
            </span>
          ))}
          {v.faktor && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: v.faktor > 2.3 ? "#fef3c7" : "#d1fae5", color: v.faktor > 2.3 ? "#92400e" : "#059669" }}>
              Faktor {v.faktor}×{v.faktor > 2.3 ? " ⚠️" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>€ {v.betrag.toFixed(2).replace(".", ",")}</div>
        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: statusDot[v.status] }} />
          <span className="text-[10px] text-slate-400">{statusLabel[v.status] ?? v.status}</span>
        </div>
      </div>
    </a>
  );
}

export default function ChronikSection({ data }: { data: DashboardData }) {
  const { vorgaenge, vorsorgeLeistungen, currentYear } = data;
  const year = currentYear ?? new Date().getFullYear();
  const pkvName = data.user.pkvName ?? data.user.kasse ?? ""
  const tarif   = data.user.tarif ?? ""
  // Custom link (set by user in Settings → Vorsorge-Unterlagen) takes priority
  const vorsorgeLink = data.user.vorsorgeCustomLink
    ? { url: data.user.vorsorgeCustomLink, label: `${pkvName || 'Vorsorge'} Leistungen` }
    : getVorsorgeLink(pkvName, tarif)

  // Default open — users should see their history immediately
  const [sectionOpen, setSectionOpen] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

  const byYear = vorgaenge.reduce<Record<string, Vorgang[]>>((acc, v) => {
    const y = v.datum.split(".")[2];
    if (!acc[y]) acc[y] = [];
    acc[y].push(v);
    return acc;
  }, {});

  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
  const mostRecentYear = years[0];
  const olderYears = years.slice(1);

  const toggleYear = (y: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y); else next.add(y);
      return next;
    });
  };

  // Sort vorsorge: faellig first, then bald, then ok, then unbekannt
  const vorsorgeSorted = [...(vorsorgeLeistungen ?? [])].sort((a, b) => {
    const order = { faellig: 0, bald: 1, ok: 2, unbekannt: 3 };
    return order[a.status] - order[b.status];
  });

  const urgentVorsorge = vorsorgeSorted.filter(v => v.status === "faellig" || v.status === "bald");

  return (
    <section className="mt-8">
      {/* Collapsible header */}
      <button
        onClick={() => setSectionOpen(o => !o)}
        className="w-full flex items-center justify-between mb-4 group"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <h2 className="text-xl flex items-center gap-2.5" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          📋 Meine Gesundheitschronik
          <span className="text-sm font-normal text-slate-400 ml-1" style={{ fontFamily: "inherit" }}>
            {sectionOpen ? "▲" : "▼"}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {urgentVorsorge.length > 0 && (
            <SectionBadge label={`${urgentVorsorge.length} Vorsorge fällig`} variant="amber" />
          )}
          <SectionBadge label={`${vorgaenge.length} Vorgänge`} variant="gray" />
        </div>
      </button>

      {sectionOpen && (
        <div className="grid grid-cols-2 gap-4 items-start">
          {/* Timeline — each row links to /rechnungen#vorgang-{id} */}
          <Card>
            <p className="text-xs text-slate-500 flex items-center gap-2 mb-4">
              <span className="text-blue-500">ℹ️</span>
              Klick auf einen Eintrag öffnet die jeweilige Rechnung. Neutrale Übersicht ohne medizinische Bewertung.
            </p>

            {/* Most recent year — always shown when section open */}
            {mostRecentYear && (
              <div>
                <div className="flex items-center gap-3 my-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{mostRecentYear}</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                {byYear[mostRecentYear].map((v) => <VorgangRow key={v.id} v={v} />)}
              </div>
            )}

            {/* Older years — collapsed by default */}
            {olderYears.length > 0 && (
              <div className="mt-2">
                {olderYears.map((y) => (
                  <div key={y}>
                    <button
                      onClick={(e) => { e.preventDefault(); toggleYear(y); }}
                      className="w-full flex items-center gap-3 my-3"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{y}</span>
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                        {expandedYears.has(y) ? "▲ einklappen" : `▼ ${byYear[y].length} Vorgänge`}
                      </span>
                    </button>
                    {expandedYears.has(y) && byYear[y].map((v) => <VorgangRow key={v.id} v={v} />)}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Vorsorge-Erinnerungen */}
          <Card>
            {/* Header */}
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              📅 Vorsorge-Erinnerungen
            </p>
            <p className="text-[10px] text-slate-400 mb-4">
              ✏️ = letzten Termin manuell eintragen
            </p>

            {vorsorgeSorted.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {vorsorgeSorted.map((item) => (
                  <VorsorgeCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400 text-center py-4">
                Noch keine Vorsorgeleistungen erfasst
              </div>
            )}

            {/* Settings hint */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[10px] text-slate-400">
                📋 Vorsorge-PDF oder Link zu Ihren Leistungsbedingungen hinterlegen →{" "}
                <a href="/settings" style={{ color: "var(--mint-dark)", textDecoration: "underline" }}>
                  Einstellungen
                </a>
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Collapsed preview — show urgent vorsorge even when closed */}
      {!sectionOpen && urgentVorsorge.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer"
          style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
          onClick={() => setSectionOpen(true)}
        >
          <span>📅</span>
          <div className="flex-1 text-sm" style={{ color: "#92400e" }}>
            <strong>{urgentVorsorge.length} Vorsorgeleistung{urgentVorsorge.length > 1 ? "en" : ""} fällig:</strong>{" "}
            {urgentVorsorge.map(v => v.name).join(", ")}
          </div>
          <span className="text-xs text-amber-600">Chronik öffnen →</span>
        </div>
      )}
    </section>
  );
}
