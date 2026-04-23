import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Impressum – MediRight',
  description: 'Impressum der MediRight-Plattform, betrieben von SMART work labs GmbH.',
}

export default function ImpressumPage() {
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
          <h1 style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', color: '#0f172a', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px' }}>Impressum</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', lineHeight: 1.7 }}>Angaben gemäß § 5 TMG</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

          <Section title="Anbieter">
            <p>SMART work labs GmbH<br />
            Subbelrather Str. 297<br />
            50825 Köln<br />
            Deutschland</p>
          </Section>

          <Section title="Vertreten durch">
            <p>Geschäftsführer: Alexander Stump</p>
          </Section>

          <Section title="Kontakt">
            <p>E-Mail: <a href="mailto:astump@mediright.com" style={{ color: '#10b981', textDecoration: 'none' }}>astump@mediright.com</a></p>
          </Section>

          <Section title="Handelsregister">
            <p>Amtsgericht Köln<br />
            HRB 103471</p>
          </Section>

          <Section title="Umsatzsteuer-ID">
            <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG:<br />
            DE336459632</p>
          </Section>

          <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
            <p>Alexander Stump<br />
            SMART work labs GmbH<br />
            Subbelrather Str. 297<br />
            50825 Köln</p>
          </Section>

          <Section title="Haftungsausschluss">
            <p>Die Inhalte dieser Plattform wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.</p>
            <p style={{ marginTop: 12 }}>MediRight ist kein Rechtsanwalt, kein Arzt und kein Versicherungsberater. Die von MediRight bereitgestellten Analysen, Hinweise und Musterbriefe dienen ausschließlich der Information und Unterstützung. Sie ersetzen keine rechtliche, medizinische oder versicherungsrechtliche Beratung im Einzelfall. Die Nutzung der Plattform erfolgt auf eigene Verantwortung.</p>
          </Section>

          <Section title="Hinweis zu KI-generierten Inhalten">
            <p>MediRight verwendet Technologien der künstlichen Intelligenz zur Analyse von Dokumenten und zur Generierung von Textentwürfen (u. a. Widerspruchsbriefe). Diese Inhalte wurden maschinell erstellt und nicht im Einzelfall juristisch geprüft. Sie stellen keine Rechtsberatung dar.</p>
          </Section>

          <Section title="Streitschlichtung">
            <p>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:<br />
            <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>https://ec.europa.eu/consumers/odr/</a></p>
            <p style={{ marginTop: 12 }}>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
          </Section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: 64, paddingTop: 32, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/datenschutz" style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'none' }}>Datenschutzerklärung</Link>
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
