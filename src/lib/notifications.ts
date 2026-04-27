/**
 * notifications.ts
 *
 * Leichtgewichtige Notification-Layer für MediRight.
 * Nutzt Resend REST-API direkt per fetch() — kein npm-Paket nötig.
 *
 * Aktuell implementiert:
 *   sendExitPassAlert()   → Email an Admin wenn Exit-Pass ausgelöst wird
 *   userExitPassHint()    → Formatierten Hinweis-Block für User-Kontext
 *
 * Setup: RESEND_API_KEY in Vercel Environment Variables setzen.
 * Free-Tier: 100 Emails/Tag, 3.000/Monat — ausreichend für MVP-Phase.
 */

const RESEND_API_KEY   = process.env.RESEND_API_KEY
const ADMIN_EMAIL      = 'astump@dl-remote.com'
// Resend-verifizierte Absender-Domain nutzen.
// Solange mediright.de noch nicht in Resend verifiziert ist → onboarding@resend.dev (sofort nutzbar)
// Sobald mediright.de verifiziert: auf 'MediRight System <system@mediright.de>' umstellen.
const FROM_EMAIL       = 'MediRight System <onboarding@resend.dev>'
const APP_BASE_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediright.de'

export interface ExitPassContext {
  userId?:           string
  userEmail?:        string
  ablehnungsgruende: string[]
  searchTerms:       string
  verifiedCount:     number
  liveResultCount:   number
  kategorie:         string
  timestamp:         string
}

// ─── Admin-Alert ──────────────────────────────────────────────────────────────

/**
 * Sendet eine Debug-Email an den Admin wenn der Exit-Pass greift.
 * Fail-silent — darf den Haupt-Flow nie blockieren.
 */
export async function sendExitPassAlert(ctx: ExitPassContext): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('[notifications] RESEND_API_KEY nicht gesetzt — kein Alert gesendet')
    return
  }

  const adminUrl = `${APP_BASE_URL}/admin`
  const subject  =
    `⚡ Exit-Pass: Dünne Urteils-Basis für "${ctx.searchTerms}" ` +
    `(${ctx.verifiedCount} verifiziert, ${ctx.liveResultCount} live)`

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><style>
  body { font-family: system-ui, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; }
  .header { background: #0f172a; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0; }
  .body   { background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; }
  .footer { background: #e2e8f0; padding: 12px 24px; border-radius: 0 0 8px 8px; font-size: 12px; color: #64748b; }
  .badge-warn { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
  .badge-ok   { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
  .metric     { display: inline-block; background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 6px 6px 6px 0; }
  .metric strong { display: block; font-size: 24px; color: #0f172a; }
  .metric span   { font-size: 12px; color: #64748b; }
  pre { background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 13px; overflow-x: auto; }
  a.btn { display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px; }
</style></head>
<body>
<div class="header">
  <strong>MediRight — Exit-Pass ausgelöst</strong>
  <span class="badge-warn" style="margin-left:12px;">Recherche-Lücke</span>
</div>
<div class="body">
  <p>Der Widerspruchs-Assistent hat für diesen Fall zu wenig verifizierte Urteile gefunden
  und automatisch eine Live-Recherche angestoßen. Der User bekommt einen Hinweis zur
  laufenden Prüfung.</p>

  <div>
    <div class="metric">
      <strong>${ctx.verifiedCount}</strong>
      <span>Verifizierte Urteile</span>
    </div>
    <div class="metric">
      <strong>${ctx.liveResultCount}</strong>
      <span>Live-Treffer (ungeprüft)</span>
    </div>
    <div class="metric">
      <strong>${ctx.kategorie}</strong>
      <span>Kategorie</span>
    </div>
  </div>

  <h3>Suchkontext</h3>
  <pre>${ctx.ablehnungsgruende.map(a => `• ${a}`).join('\n')}</pre>
  <p><strong>Suchbegriffe:</strong> ${ctx.searchTerms}</p>

  ${ctx.userId ? `<p><strong>User:</strong> ${ctx.userEmail ?? ctx.userId}</p>` : ''}

  <p><strong>Zeitpunkt:</strong> ${new Date(ctx.timestamp).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })} Uhr</p>

  <h3>Handlungsoptionen</h3>
  <ol>
    <li>Im Admin-Panel die Live-Treffer prüfen und ggf. als <code>verified=true</code> markieren</li>
    <li>Fehlende Urteile manuell als SQL-Migration ergänzen</li>
    <li>User direkt kontaktieren wenn Fall besonders komplex ist</li>
  </ol>

  <a class="btn" href="${adminUrl}">→ Admin-Panel öffnen</a>
</div>
<div class="footer">
  MediRight Automatisches Alert-System · ${ctx.timestamp}
</div>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [ADMIN_EMAIL],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString())
      console.warn(`[notifications] Resend-Fehler ${res.status}: ${err}`)
    } else {
      console.log(`[notifications] Admin-Alert gesendet an ${ADMIN_EMAIL}`)
    }
  } catch (e: any) {
    console.warn(`[notifications] Alert fehlgeschlagen: ${e.message}`)
  }
}

// ─── User-Hinweis (in Fall-Kontext) ──────────────────────────────────────────

/**
 * Gibt einen formatierten Block zurück, der dem User im Widerspruchs-Output
 * signalisiert dass eine erweiterte Prüfung läuft.
 * Ehrlich formuliert: automatische Recherche wurde angestoßen (kein falsches
 * Versprechen eines "menschlichen Experten").
 */
export function userExitPassHint(searchTerms: string): string {
  return [
    '──────────────────────────────────────────────────────',
    'HINWEIS: ERWEITERTE RECHERCHE AKTIV',
    '──────────────────────────────────────────────────────',
    `Für Ihr spezifisches Anliegen ("${searchTerms}") ist unsere`,
    'kuratierte Urteils-Datenbank noch im Aufbau.',
    '',
    'Wir haben automatisch eine erweiterte Recherche angestoßen.',
    'Die Ergebnisse werden geprüft und für zukünftige Fälle ergänzt.',
    '',
    '→ Die KI-Analyse und der Widerspruchsbrief wurden auf Basis der',
    '  verfügbaren Informationen erstellt. Bei komplexen Einzelfällen',
    '  empfehlen wir zusätzlich die Rücksprache mit einem Fachanwalt',
    '  für Versicherungsrecht.',
    '──────────────────────────────────────────────────────',
  ].join('\n')
}
