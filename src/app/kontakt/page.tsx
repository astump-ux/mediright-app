import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Kontakt – MediRight',
  description: 'Kontaktieren Sie das MediRight-Team bei Fragen zur Plattform oder Ihrem Konto.',
}

export default function KontaktPage() {
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

        <div style={{ marginBottom: 56 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#10b981', marginBottom: 12 }}>Kontakt</div>
          <h1 style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', color: '#0f172a', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px' }}>Wir helfen gerne.</h1>
          <p style={{ color: '#64748b', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 540 }}>
            Bei Fragen zur Plattform, zu Ihrer Abrechnung oder zu einem Analyseergebnis — schreiben Sie uns einfach.
          </p>
        </div>

        {/* Contact card */}
        <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '40px 40px', marginBottom: 40 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>E-Mail</div>
              <a
                href="mailto:info@mediright.com"
                style={{ fontSize: '1.1rem', color: '#10b981', textDecoration: 'none', fontWeight: 600 }}
              >
                info@mediright.com
              </a>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 6, lineHeight: 1.6 }}>
                Wir antworten in der Regel innerhalb von 1–2 Werktagen.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Anschrift</div>
              <p style={{ color: '#334155', fontSize: '0.95rem', lineHeight: 1.8, margin: 0 }}>
                SMART work labs GmbH<br />
                Subbelrather Str. 297<br />
                50825 Köln
              </p>
            </div>

          </div>
        </div>

        {/* FAQ hints */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: '1.3rem', color: '#0f172a', fontWeight: 400, margin: '0 0 24px' }}>Häufige Themen</h2>

          {[
            {
              q: 'Mein Analyseergebnis scheint falsch.',
              a: 'Bitte senden Sie uns die Rechnungsnummer oder einen Screenshot (ohne sensible Patientendaten) — wir prüfen den Fall manuell und verbessern das Modell.',
            },
            {
              q: 'Ich möchte mein Konto oder Abo kündigen.',
              a: 'Das Pro-Jahresabo kann jederzeit in den Kontoeinstellungen oder per E-Mail gekündigt werden. Es läuft dann bis zum Ende der bezahlten Laufzeit weiter.',
            },
            {
              q: 'Ich habe eine Frage zu einer Rechnung oder einem Credit-Kauf.',
              a: 'Schreiben Sie uns mit Ihrer registrierten E-Mail-Adresse und dem Datum des Kaufs — wir klären das schnell.',
            },
            {
              q: 'Datenschutz & Löschung meiner Daten.',
              a: 'Alle Rechte (Auskunft, Löschung, Einschränkung) können jederzeit per E-Mail geltend gemacht werden. Mehr dazu in unserer Datenschutzerklärung.',
            },
          ].map(({ q, a }) => (
            <div key={q} style={{ borderBottom: '1px solid #f1f5f9', padding: '20px 0' }}>
              <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem', margin: '0 0 8px' }}>{q}</p>
              <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>

        {/* Footer nav */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 32, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[['Impressum', '/impressum'], ['Datenschutz', '/datenschutz'], ['AGB', '/agb']].map(([label, href]) => (
            <Link key={href} href={href} style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>

      </main>
    </div>
  )
}
