import type { KasseStats } from "@/types";
import Card from "@/components/ui/Card";
import { SectionBadge } from "@/components/ui/Badge";

// PKV industry average Ablehnungsquote by Fachgebiet (%)
const FACH_BENCHMARK: Record<string, number> = {
  'allgemeinmedizin':   5,
  'hausarzt':           5,
  'innere medizin':     8,
  'internist':          8,
  'labor':             15,
  'radiologie':         6,
  'orthopädie':        10,
  'chirurgie':          5,
  'dermatologie':       7,
  'hno':                6,
  'gynäkologie':        6,
  'neurologie':         9,
  'augenheilkunde':     5,
  'urologie':           7,
  'kardiologie':        8,
  'gastroenterologie':  9,
  'psychiatrie':       12,
  'psychotherapie':    14,
  'zahnmedizin':       18,
  'physiotherapie':    11,
  'default':            8,
}

function normalizeFach(fach: string): string {
  return fach.toLowerCase().trim()
    .replace(/dr\.\s*/g, '')
    .replace(/\s+/g, ' ')
}

function BenchmarkRow({ label, sub, youPct, avgPct, youVal, avgVal, variant }: {
  label: string; sub: string;
  youPct: number; avgPct: number;
  youVal: string; avgVal: string;
  variant: "good" | "warn" | "bad";
}) {
  const fillColor = variant === "good" ? "var(--mint)" : variant === "warn" ? "var(--amber)" : "var(--red)";
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 items-center py-3 border-b border-slate-100 last:border-0">
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--navy)" }}>{label}</div>
        <div className="text-xs text-slate-400">{sub}</div>
        <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full rounded-full bg-slate-200" style={{ width: `${avgPct}%` }} />
          <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${youPct}%`, background: fillColor }} />
        </div>
        <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
          <span>Sie: <strong>{youVal}</strong></span>
          <span>Ø: <strong>{avgVal}</strong></span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-bold text-base" style={{ color: variant === "good" ? "var(--mint-dark)" : variant === "warn" ? "#b45309" : "#b91c1c" }}>{youVal}</div>
        <div className="text-xs text-slate-400">{avgVal}</div>
      </div>
    </div>
  );
}

export default function KasseSection({ stats }: { stats: KasseStats }) {
  const kasseName      = stats.kasseName || "PKV"
  const totalAbgelehnt = stats.totalAbgelehnt ?? stats.stilleKuerzungTotal ?? 0
  const widerspruchPot = stats.widerspruchPotenzial ?? 0
  const isAboveAvg     = (stats.ablehnungsrateReal ?? 0) > 8
  const hasRejections  = totalAbgelehnt > 0

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl flex items-center gap-2.5" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
          🛡️ Ihr Versicherer — {kasseName} im Check
        </h2>
        {isAboveAvg
          ? <SectionBadge label="Ablehnungsrate über Durchschnitt" variant="red" />
          : <SectionBadge label="Rate im Normbereich" variant="green" />
        }
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* ── Abgelehnte Positionen ────────────────────────────────────────── */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
            ❌ Abgelehnte Positionen
          </p>

          {hasRejections ? (
            <>
              {/* Main amount */}
              <div className="flex items-end gap-2 mb-4">
                <div
                  className="text-3xl italic leading-none"
                  style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "#b91c1c" }}
                >
                  € {totalAbgelehnt.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-slate-400 mb-1">nicht erstattet</div>
              </div>

              {/* Breakdown by category if available */}
              {stats.stilleKuerzungen && stats.stilleKuerzungen.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {stats.stilleKuerzungen.map((k) => (
                    <div key={k.kategorie} className="rounded-lg p-2.5 text-center" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{k.kategorie}</div>
                      <div className="font-bold text-sm" style={{ color: "#b91c1c" }}>
                        € {k.betrag.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-slate-500">{k.vorgaenge} Vorgang{k.vorgaenge !== 1 ? "änge" : ""}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Appeal potential & CTAs */}
              <div className="rounded-lg px-3 py-2.5" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                {widerspruchPot > 0 ? (
                  <>
                    <p className="text-xs font-bold mb-1" style={{ color: "#7f1d1d" }}>
                      💡 Bis zu € {widerspruchPot.toLocaleString("de-DE", { maximumFractionDigits: 0 })} anfechtbar
                    </p>
                    <p className="text-[11px] mb-2" style={{ color: "#991b1b" }}>
                      Widerspruch innerhalb von 4 Wochen nach Bescheiddatum einlegen.
                    </p>
                  </>
                ) : (
                  <p className="text-xs mb-2" style={{ color: "#991b1b" }}>
                    Details und Ablehnungsgründe in der Kassenabrechnung.
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <a
                    href="/kassenabrechnung"
                    className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                    style={{ background: "#b91c1c", color: "white" }}
                  >
                    Kassenabrechnung öffnen →
                  </a>
                  {widerspruchPot > 0 && (
                    <a
                      href="/widersprueche"
                      className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                      style={{ background: "white", color: "#b91c1c", border: "1px solid #fca5a5" }}
                    >
                      Widerspruch erstellen
                    </a>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* No rejections */
            <div className="rounded-lg px-3 py-4 text-center" style={{ background: "#f0fdf4", border: "1px solid #6ee7b7" }}>
              <div className="text-2xl mb-2">✓</div>
              <div className="text-sm font-bold" style={{ color: "#065f46" }}>Keine Ablehnungen</div>
              <div className="text-xs text-slate-400 mt-1">
                {kasseName} hat bisher alle Positionen erstattet.
              </div>
            </div>
          )}

          {/* Erstattungsquote footer */}
          {stats.erstattungsquote > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Erstattungsquote gesamt</span>
              <span className="font-bold text-sm" style={{ color: stats.erstattungsquote >= stats.erstattungsquoteAvg ? "#059669" : "#b45309" }}>
                {stats.erstattungsquote}%
              </span>
            </div>
          )}
        </Card>

        {/* ── Benchmark Vergleich ───────────────────────────────────────────── */}
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            👥 Sie im Vergleich — {kasseName} Kunden
          </p>
          <p className="text-[10px] text-slate-400 mb-3">
            Ablehnungsquote je Fachgebiet vs. PKV-Durchschnitt (anonymisierte Referenzwerte)
          </p>

          {/* Erstattungsquote overall */}
          <BenchmarkRow
            label="Erstattungsquote gesamt"
            sub="Anteil der erstatteten Rechnungsbeträge"
            youPct={stats.erstattungsquote}
            avgPct={stats.erstattungsquoteAvg}
            youVal={`${stats.erstattungsquote}%`}
            avgVal={`Ø ${stats.erstattungsquoteAvg}%`}
            variant={stats.erstattungsquote >= stats.erstattungsquoteAvg ? "good" : "warn"}
          />

          {/* Per-Fachgruppe breakdown */}
          {stats.fachgruppenStats.length > 0
            ? stats.fachgruppenStats.map((fg) => {
                const bench = FACH_BENCHMARK[normalizeFach(fg.fach)] ?? FACH_BENCHMARK['default']
                const variant: "good" | "warn" | "bad" =
                  fg.ablehnungsquote <= bench ? "good"
                  : fg.ablehnungsquote <= bench * 1.75 ? "warn"
                  : "bad"
                const youPctBar = Math.min(100, Math.round((fg.ablehnungsquote / (bench * 2 || 1)) * 50))
                const avgPctBar = Math.min(100, Math.round((bench / (bench * 2 || 1)) * 50))
                return (
                  <BenchmarkRow
                    key={fg.fach}
                    label={`${fg.fach} — Ablehnungsquote`}
                    sub={`${fg.vorgaenge} Vorgang${fg.vorgaenge !== 1 ? "änge" : ""} · € ${fg.eingereicht.toLocaleString("de-DE")} eingereicht`}
                    youPct={youPctBar}
                    avgPct={avgPctBar}
                    youVal={fg.ablehnungsquote === 0 ? "0%" : `${fg.ablehnungsquote}%`}
                    avgVal={`Ø PKV: ${bench}%`}
                    variant={variant}
                  />
                )
              })
            : (
              <div className="text-xs text-slate-400 py-2 text-center">
                Noch keine Kassenbescheide zum Vergleich vorhanden
              </div>
            )
          }
        </Card>
      </div>
    </section>
  );
}
