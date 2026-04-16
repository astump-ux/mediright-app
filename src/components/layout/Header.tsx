"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard",         label: "Dashboard" },
  { href: "/rechnungen",        label: "Rechnungen" },
  { href: "/kassenabrechnung",  label: "Kassenabrechnungen" },
  { href: "/widersprueche",     label: "Widersprüche" },
  { href: "/aerzte",            label: "Ärzte" },
  { href: "/admin",             label: "⚙️ Admin" },
  { href: "/settings",          label: "👤 Einstellungen" },
];

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50" style={{ background: "var(--navy)" }}>
      <div className="max-w-[1100px] mx-auto px-6 h-[60px] flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 no-underline">
          <span
            className="text-white text-xl"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: "-0.01em" }}
          >
            MediRight
          </span>
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: "var(--mint)" }}
          />
        </Link>

        {/* Nav */}
        <nav className="flex gap-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
                style={{
                  color: active ? "white" : "rgba(255,255,255,0.5)",
                  background: active ? "rgba(255,255,255,0.1)" : "transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          <span>Alexander S.</span>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "var(--mint-dark)" }}
          >
            AS
          </div>
        </div>
      </div>
    </header>
  );
}
