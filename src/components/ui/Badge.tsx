import type { Status } from "@/types";

const statusConfig: Record<Status, { label: string; bg: string; color: string }> = {
  erstattet:  { label: "Erstattet",  bg: "#d1fae5", color: "#059669" },
  abgelehnt:  { label: "Abgelehnt",  bg: "#fee2e2", color: "#b91c1c" },
  pruefen:    { label: "⚡ KI-Hinweis", bg: "#fef3c7", color: "#92400e" },
  offen:      { label: "Offen",      bg: "#f1f5f9", color: "#475569" },
};

export function StatusBadge({ status }: { status: Status }) {
  const cfg = statusConfig[status];
  return (
    <span
      className="inline-flex items-center text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

export function SectionBadge({
  label,
  variant = "gray",
}: {
  label: string;
  variant?: "red" | "amber" | "green" | "gray";
}) {
  const map = {
    red:   { bg: "#fee2e2", color: "#b91c1c" },
    amber: { bg: "#fef3c7", color: "#92400e" },
    green: { bg: "#d1fae5", color: "#059669" },
    gray:  { bg: "#f1f5f9", color: "#475569" },
  };
  const s = map[variant];
  return (
    <span
      className="text-[11px] font-bold uppercase tracking-wide px-3 py-1 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      {label}
    </span>
  );
}

export function FaktorBadge({ faktor }: { faktor: number }) {
  const warn = faktor > 2.3;
  const err  = faktor >= 3.5;
  const bg    = err ? "#fee2e2" : warn ? "#fef3c7" : "#d1fae5";
  const color = err ? "#991b1b" : warn ? "#92400e" : "#059669";
  return (
    <span
      className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: bg, color }}
    >
      {faktor.toFixed(1)}×
    </span>
  );
}
