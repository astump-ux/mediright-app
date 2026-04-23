import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung – MediRight',
  description: 'Datenschutzerklärung der MediRight-Plattform gemäß DSGVO.',
}

export default function DatenschutzPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <header style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: '1.5rem', color: '#0f172a', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            MediRight<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginBottom: 2 }}></span>
          </Link>
          <Link href="/" style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'none' }}>← Zurück zur Startseite</Link>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px' }}>

        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#10b981', marginBottom: 12 }}>Rechtliches</div>
          <h1 style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', color: '#0f172a', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px' }}>Datenschutzerklärung</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', lineHeight: 1.7 }}>Zuletzt aktualisiert: April 2025 · Gemäß DSGVO (EU) 2016/679</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

          <Section title="1. Verantwortlicher">
            <p>SMART work labs GmbH<br />
            Subbelrather Str. 297<br />
            50825 Köln<br />
            Deutschland</p>
            <p style={{ marginTop: 12 }}>Geschäftsführer: Alexander Stump<br />
            E-Mail: <a href="mailto:astump@mediright.com" style={{ color: '#10b981', textDecoration: 'none' }}>astump@mediright.com</a></p>
          </Section>

          <Section title="2. Welche Daten wir verarbeiten">
            <p>Bei der Nutzung von MediRight verarbeiten wir folgende personenbezogene Daten:</p>
            <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><strong>Accountdaten:</strong> E-Mail-Adresse, Name (bei Google-Login: wie von Google übermittelt)</li>
              <li><strong>Profildaten:</strong> Name der Krankenversicherung, Tarif, optionale WhatsApp-Nummer</li>
              <li><strong>Hochgeladene Dokumente:</strong> Arztabrechnungen und Kassenbescheide (PDFs), die Sie zur Analyse einreichen</li>
              <li><strong>Analyseergebnisse:</strong> Extrahierte GOÄ-Positionen, Erstattungsbeträge, generierte Widerspruchsbriefe</li>
              <li><strong>Zahlungsdaten:</strong> Werden ausschließlich über Stripe verarbeitet; wir speichern keine Kreditkartendaten</li>
              <li><strong>Nutzungsdaten:</strong> Technische Logs, IP-Adressen (anonymisiert), Zeitstempel</li>
            </ul>
          </Section>

          <Section title="3. Zweck der Verarbeitung">
            <p>Wir verarbeiten Ihre Daten ausschließlich zu folgenden Zwecken:</p>
            <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Bereitstellung und Betrieb der MediRight-Plattform</li>
              <li>Automatische Analyse von Arztabrechnungen und Kassenbescheiden mittels KI</li>
              <li>Generierung von Widerspruchsbriefen und Handlungsempfehlungen</li>
              <li>Abwicklung von Zahlungen und Verwaltung von Analyse-Credits</li>
              <li>Versand von Benachrichtigungen zu Analyseergebnissen (WhatsApp oder E-Mail)</li>
              <li>Verbesserung und Weiterentwicklung unserer Dienste (anonymisiert)</li>
            </ul>
            <p style={{ marginTop: 12 }}>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</p>
          </Section>

          <Section title="4. Hosting & Infrastruktur">
            <p><strong>Vercel Inc.</strong> (Hosting & Deployment)<br />
            440 N Barranca Ave #4133, Covina, CA 91723, USA<br />
            Die Plattform wird auf Vercel-Servern betrieben. Vercel ist nach dem EU-US Data Privacy Framework zertifiziert. Weitere Informationen: <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>vercel.com/legal/privacy-policy</a></p>
            <p style={{ marginTop: 16 }}><strong>Supabase Inc.</strong> (Datenbank & Authentifizierung)<br />
            970 Toa Payoh North, Singapur<br />
            Nutzer-Accounts, Profildaten und Analyseergebnisse werden in einer Supabase-Datenbank gespeichert. Weitere Informationen: <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>supabase.com/privacy</a></p>
          </Section>

          <Section title="5. KI-Verarbeitung (Anthropic)">
            <p>Zur Analyse von Dokumenten nutzt MediRight die KI-Dienste von <strong>Anthropic PBC</strong> (San Francisco, USA). Hochgeladene PDFs sowie extrahierte Textinhalte werden zur Verarbeitung an die Anthropic API übermittelt.</p>
            <p style={{ marginTop: 12 }}>Anthropic verarbeitet diese Daten ausschließlich zur Erbringung des API-Dienstes und nutzt sie nicht zum Training von Modellen (API-Nutzungsbedingungen Stand 2024). Weitere Informationen: <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>anthropic.com/privacy</a></p>
            <p style={{ marginTop: 12 }}>Bitte laden Sie <strong>keine Dokumente hoch, die für die Analyse nicht erforderliche sensible Drittdaten</strong> (z. B. vollständige Sozialversicherungsnummern oder Bankverbindungen) enthalten.</p>
          </Section>

          <Section title="6. Zahlungsverarbeitung (Stripe)">
            <p>Zahlungen werden über <strong>Stripe Payments Europe, Ltd.</strong> (1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland) abgewickelt.</p>
            <p style={{ marginTop: 12 }}>Wir erhalten von Stripe lediglich eine Bestätigung über den Zahlungseingang sowie eine anonyme Kunden-ID. Kreditkartendaten werden ausschließlich bei Stripe gespeichert und verarbeitet. Weitere Informationen: <a href="https://stripe.com/de/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>stripe.com/de/privacy</a></p>
          </Section>

          <Section title="7. Google OAuth (Login)">
            <p>Sie können sich optional mit Ihrem Google-Account anmelden. In diesem Fall übermittelt Google Name und E-Mail-Adresse an MediRight. Wir speichern keine weiteren Google-Daten. Weitere Informationen zur Datenverarbeitung durch Google: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>policies.google.com/privacy</a></p>
          </Section>

          <Section title="8. WhatsApp">
            <p>Wenn Sie die optionale WhatsApp-Funktion nutzen (Dokumente per WhatsApp einsenden oder Ergebnisse per WhatsApp empfangen), werden Ihre Nachrichten über die WhatsApp Business API (Meta Platforms Ireland Ltd.) verarbeitet. WhatsApp-Nachrichten unterliegen den Datenschutzrichtlinien von Meta.</p>
            <p style={{ marginTop: 12 }}>Die Nutzung der WhatsApp-Funktion ist freiwillig und kann jederzeit in den Einstellungen deaktiviert werden.</p>
          </Section>

          <Section title="9. Cookies & lokale Speicherung">
            <p>MediRight verwendet ausschließlich technisch notwendige Cookies zur Aufrechterhaltung Ihrer Sitzung (Session-Cookies von Supabase). Es werden keine Tracking-Cookies oder Cookies zu Werbezwecken eingesetzt.</p>
            <p style={{ marginTop: 12 }}>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am Betrieb der Plattform).</p>
          </Section>

          <Section title="10. Speicherdauer">
            <p>Wir speichern Ihre Daten so lange, wie Ihr Account aktiv ist oder wie es für die Bereitstellung des Dienstes erforderlich ist. Nach Kündigung Ihres Accounts werden alle personenbezogenen Daten innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen (z. B. steuerrechtliche Aufbewahrungsfristen von 10 Jahren für Rechnungsbelege).</p>
          </Section>

          <Section title="11. Ihre Rechte (Art. 15–22 DSGVO)">
            <p>Sie haben jederzeit das Recht auf:</p>
            <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><strong>Auskunft</strong> über die zu Ihrer Person gespeicherten Daten (Art. 15 DSGVO)</li>
              <li><strong>Berichtigung</strong> unrichtiger Daten (Art. 16 DSGVO)</li>
              <li><strong>Löschung</strong> Ihrer Daten (Art. 17 DSGVO) — über die Einstellungen oder per E-Mail</li>
              <li><strong>Einschränkung</strong> der Verarbeitung (Art. 18 DSGVO)</li>
              <li><strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO)</li>
              <li><strong>Widerspruch</strong> gegen die Verarbeitung (Art. 21 DSGVO)</li>
            </ul>
            <p style={{ marginTop: 12 }}>Zur Ausübung Ihrer Rechte wenden Sie sich bitte per E-Mail an: <a href="mailto:astump@mediright.com" style={{ color: '#10b981', textDecoration: 'none' }}>astump@mediright.com</a></p>
          </Section>

          <Section title="12. Beschwerderecht">
            <p>Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Zuständig für die SMART work labs GmbH ist:</p>
            <p style={{ marginTop: 12 }}>
              Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen<br />
              Kavalleriestraße 2–4<br />
              40213 Düsseldorf<br />
              <a href="https://www.ldi.nrw.de" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>www.ldi.nrw.de</a>
            </p>
          </Section>

          <Section title="13. Änderungen dieser Datenschutzerklärung">
            <p>Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf zu aktualisieren. Die jeweils aktuelle Version ist stets unter <a href="https://mediright.ai/datenschutz" style={{ color: '#10b981', textDecoration: 'none' }}>mediright.ai/datenschutz</a> abrufbar. Bei wesentlichen Änderungen informieren wir Sie per E-Mail.</p>
          </Section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: 64, paddingTop: 32, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/impressum" style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'none' }}>Impressum</Link>
          <Link href="/agb" style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'none' }}>AGB</Link>
          <Link href="/" style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'none' }}>Startseite</Link>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: '3px solid #10b981', paddingLeft: 24 }}>
      <h2 style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: '1.25rem', fontWeight: 400, color: '#0f172a', marginBottom: 12 }}>{title}</h2>
      <div style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  )
}
