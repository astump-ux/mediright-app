"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { CreditStatus } from "@/lib/credits";
import { getSupabaseClient } from "@/lib/supabase";

const navItems = [
  { href: "/dashboard",        label: "Dashboard" },
  { href: "/rechnungen",       label: "Rechnungen" },
  { href: "/kassenabrechnung", label: "Kassenabrechnungen" },
  { href: "/widersprueche",    label: "Widersprüche" },
  { href: "/aerzte",           label: "Ärzte" },
];

export default function Header() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  // Fetch user role once on mount
  useEffect(() => {
    fetch('/api/user/role')
      .then(r => r.json())
      .then(d => setIsAdmin(d.role === 'admin'))
      .catch(() => {})
  }, [])

  // Fetch credit status once on mount
  useEffect(() => {
    fetch('/api/credits')
      .then(r => r.json())
      .then(d => setCredits(d as CreditStatus))
      .catch(() => {})
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on navigation
  useEffect(() => { setOpen(false); }, [pathname]);

  const userMenuItems = [
    { href: "/pricing",  label: "Credits & Abo",   icon: "⚡" },
    { href: "/settings", label: "Einstellungen",   icon: "⚙️" },
    { href: "/admin",    label: "Admin",            icon: "🛠" },
    ...(isAdmin ? [{ href: "/system", label: "System", icon: "🔧" }] : []),
  ];

  // Credit badge helpers
  const creditBadge = (() => {
    if (!credits) return null
    if (credits.isPro) return { label: 'PRO', bg: 'var(--mint)', color: '#0f172a' }
    const total = credits.balance + credits.freeRemaining
    if (total === 0) return { label: '0 Credits', bg: '#fee2e2', color: '#991b1b' }
    if (total <= 1) return { label: `${total} Credit`, bg: '#fef3c7', color: '#92400e' }
    return { label: `${total} Credits`, bg: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }
  })()

  const isUserPageActive =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/system");

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

        {/* Main nav */}
        <nav className="flex gap-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
                style={{
                  color:      active ? "white" : "rgba(255,255,255,0.5)",
                  background: active ? "rgba(255,255,255,0.1)" : "transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Credit badge */}
        {creditBadge && (
          <Link
            href="/pricing"
            className="no-underline"
            style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: creditBadge.bg, color: creditBadge.color,
              border: credits?.isPro ? 'none' : '1px solid rgba(255,255,255,0.15)',
              transition: 'opacity 0.15s',
            }}
            title="Credits & Abo verwalten"
          >
            {creditBadge.label}
          </Link>
        )}

        {/* Avatar dropdown */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center justify-center text-xs font-bold text-white rounded-full transition-all"
            style={{
              width: 34, height: 34,
              background: isUserPageActive || open
                ? "var(--mint)"
                : "var(--mint-dark)",
              border: open ? "2px solid rgba(255,255,255,0.4)" : "2px solid transparent",
              cursor: "pointer",
            }}
            aria-label="Benutzermenü"
          >
            AS
          </button>

          {open && (
            <div
              className="absolute right-0 mt-2 rounded-xl overflow-hidden"
              style={{
                top: "100%",
                minWidth: 180,
                background: "white",
                boxShadow: "0 8px 32px rgba(15,23,42,0.18)",
                border: "1px solid #e2e8f0",
                zIndex: 100,
              }}
            >
              {userMenuItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-semibold no-underline transition-colors"
                    style={{
                      color:      active ? "#0f172a" : "#475569",
                      background: active ? "#f1f5f9" : "transparent",
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "#f8fafc";
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {active && (
                      <span
                        className="ml-auto w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--mint)" }}
                      />
                    )}
                  </Link>
                );
              })}

              {/* Admin badge */}
              {isAdmin && (
                <div style={{
                  borderTop: "1px solid #f1f5f9",
                  padding: "6px 16px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                    background: "#fef3c7", color: "#92400e",
                    padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
                  }}>Admin</span>
                </div>
              )}

              {/* Logout */}
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold w-full transition-colors"
                  style={{ color: "#ef4444", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fff1f1"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span>↩</span>
                  <span>Abmelden</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
