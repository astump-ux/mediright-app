import { ReactNode } from "react";

type CardVariant = "default" | "flagged" | "flagged-red" | "ok" | "dark";

const variantStyles: Record<CardVariant, string> = {
  default:      "bg-white border border-slate-100",
  flagged:      "bg-white border-l-4 border-l-amber-400 border border-slate-100",
  "flagged-red":"bg-white border-l-4 border-l-red-400 border border-slate-100",
  ok:           "bg-white border-l-4 border-l-emerald-400 border border-slate-100",
  dark:         "border border-transparent",
};

export default function Card({
  children,
  variant = "default",
  className = "",
  style,
}: {
  children: ReactNode;
  variant?: CardVariant;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl shadow-sm p-6 ${variantStyles[variant]} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
