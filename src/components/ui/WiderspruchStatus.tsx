'use client'
// ── Single source of truth for Widerspruch + Arztreklamation status ───────────
// Import these constants and components everywhere instead of defining inline.

export const WIDERSPRUCH_STATUS_CFG: Record<string, {
  icon: string; label: string; bg: string; color: string; border: string
}> = {
  erstellt:    { icon: '📝', label: 'Entwurf',                   bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  gesendet:    { icon: '📨', label: 'Widerspruch gesendet',       bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  beantwortet: { icon: '💬', label: 'AXA hat geantwortet',        bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  erfolgreich: { icon: '✅', label: 'Widerspruch erfolgreich',    bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
  abgelehnt:   { icon: '❌', label: 'Widerspruch endabgelehnt',   bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
}

/** Statuses that count as "active" (i.e. action has been submitted) */
export const WIDERSPRUCH_ACTIVE_STATUSES = ['gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt']

/** Pill badge for the current Kassenwiderspruch status */
export function KassenwiderspruchBadge({ status }: { status: string }) {
  const cfg = WIDERSPRUCH_STATUS_CFG[status]
  if (!cfg) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}`,
    }}>
      {cfg.icon} Kassenwiderspruch: {cfg.label}
    </span>
  )
}

/** Pill badge for Arztreklamation status */
export function ArztreklamationBadge({ sent }: { sent: boolean }) {
  if (!sent) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
      background: '#fff7ed', color: '#9a3412', border: '1.5px solid #fb923c',
    }}>
      🩺 Arztreklamation: Gesendet
    </span>
  )
}
