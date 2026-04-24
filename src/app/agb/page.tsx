import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'AGB – MediRight',
  description: 'Allgemeine Geschäftsbedingungen der MediRight-Plattform, betrieben von SMART work labs GmbH.',
}

const Section = ({ num, title, children }: { num: string; title: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 48 }}>
    <h2 style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: '1.35rem', color: '#0f172a', fontWeight: 400, margin: '0 0 16px', display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span style={{ fontSize: '0.8rem', fontFamily: 'inherit', color: '#10b981', fontWeight: 400, minWidth: 28 }}>§{num}</span>
      {title}
    </h2>
    <div style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.8 }}>{children}</div>
  </section>
)

const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: '0 0 12px' }}>{children}</p>
)

const Ul = ({ children }: { children: React.ReactNode }) => (
  <ul style={{ margin: '8px 0 12px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ul>
)

const Li = ({ children }: { children: React.ReactNode }) => (
  <li style={{ color: '#475569' }}>{children}</li>
)

export default function AgbPage() {
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
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#10b981', marginBottom: 12 }}>Rechtliches</div>
          <h1 style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', color: '#0f172a', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px' }}>Allgemeine Geschäftsbedingungen</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', lineHeight: 1.7 }}>Stand: April 2026 · SMART work labs GmbH</p>
        </div>

        {/* Hinweisbox */}
        <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '20px 24px', marginBottom: 48 }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem', lineHeight: 1.7 }}>
            <strong>Wichtiger Hinweis:</strong> MediRight ist ein digitales Analyse-Werkzeug und ersetzt keine Rechts- oder Steuerberatung. Die von der KI erzeugten Ergebnisse sind unverbindliche Hinweise. Für verbindliche rechtliche Einschätzungen wenden Sie sich an einen Rechtsanwalt oder einen auf PKV spezialisierten Berater.
          </p>
        </div>

        <Section num="1" title="Geltungsbereich">
          <P>Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB") gelten für alle Verträge zwischen der SMART work labs GmbH, Subbelrather Str. 297, 50825 Köln (nachfolgend „Anbieter") und Verbrauchern sowie Unternehmern (nachfolgend „Nutzer") über die Nutzung der Online-Plattform MediRight unter mediright.ai (nachfolgend „Plattform").</P>
          <P>Abweichende Bedingungen des Nutzers werden nicht anerkannt, sofern der Anbieter ihrer Geltung nicht ausdrücklich schriftlich zugestimmt hat.</P>
        </Section>

        <Section num="2" title="Leistungsbeschreibung">
          <P>MediRight stellt eine KI-gestützte Analyse-Plattform für private Krankenversicherungs-Angelegenheiten zur Verfügung. Die Leistungen umfassen im Wesentlichen:</P>
          <Ul>
            <Li>Automatisierte Analyse von Arztrechnungen nach GOÄ (Gebührenordnung für Ärzte)</Li>
            <Li>Prüfung von GOÄ-Ziffern, Steigerungsfaktoren und Rechnungspositionen</Li>
            <Li>Analyse von Ablehnungsbescheiden privater Krankenversicherungen</Li>
            <Li>Erstellung von Widerspruchsbrief-Entwürfen</Li>
            <Li>Bereitstellung von Benchmarking-Daten zu Ärzten und Fachrichtungen</Li>
          </Ul>
          <P>Die Analyse-Ergebnisse werden durch automatisierte KI-Systeme erzeugt und stellen keine Rechtsberatung im Sinne des Rechtsdienstleistungsgesetzes (RDG) dar. Der Anbieter übernimmt keine Gewähr für die Vollständigkeit, Richtigkeit oder Aktualität der erzeugten Inhalte.</P>
          <P>Der Anbieter behält sich vor, den Funktionsumfang der Plattform jederzeit zu erweitern, einzuschränken oder anzupassen, sofern dies dem Nutzer zumutbar ist und die vertraglichen Hauptleistungen nicht wesentlich beeinträchtigt werden.</P>
        </Section>

        <Section num="3" title="Registrierung & Nutzerkonto">
          <P>Die Nutzung kostenpflichtiger Funktionen setzt eine Registrierung voraus. Der Nutzer hat bei der Registrierung zutreffende und vollständige Angaben zu machen und diese aktuell zu halten.</P>
          <P>Zugangsdaten sind vertraulich zu behandeln. Der Nutzer ist verpflichtet, den Anbieter unverzüglich zu informieren, wenn Anhaltspunkte für einen Missbrauch des Nutzerkontos bestehen.</P>
          <P>Pro Person ist grundsätzlich nur ein Nutzerkonto zulässig. Eine Weitergabe von Zugangsdaten an Dritte ist nicht gestattet.</P>
          <P>Der Anbieter behält sich das Recht vor, Nutzerkonten bei Verstoß gegen diese AGB oder bei missbräuchlicher Nutzung ohne vorherige Ankündigung zu sperren oder zu löschen.</P>
        </Section>

        <Section num="4" title="Credits & Abonnement">
          <P><strong>Kostenlose Leistungen:</strong> Die Analyse von Arztrechnungen (GOÄ-Prüfung) steht registrierten Nutzern dauerhaft kostenlos zur Verfügung.</P>
          <P><strong>Credit-Pakete:</strong> Kostenpflichtige Funktionen (insb. Kassenbescheid-Analyse und Widerspruchsbriefe) werden über ein Credit-System abgerechnet. Credits werden als Prepaid-Pakete erworben (Starter: 3 Credits, Plus: 10 Credits). Ein Credit wird beim Start einer kostenpflichtigen Analyse verbraucht.</P>
          <P><strong>Pro Jahresabo:</strong> Das Pro-Abonnement zu einem Jahrespreis von € 34,99 (inkl. MwSt.) ermöglicht die unbegrenzte Nutzung aller kostenpflichtigen Funktionen für die Vertragslaufzeit von 12 Monaten.</P>
          <Ul>
            <Li>Das Abonnement verlängert sich automatisch um weitere 12 Monate, sofern es nicht spätestens 30 Tage vor Ablauf gekündigt wird.</Li>
            <Li>Die Kündigung kann jederzeit über die Kontoeinstellungen oder per E-Mail an info@mediright.com erfolgen.</Li>
          </Ul>
          <P>Alle Preise verstehen sich inkl. der gesetzlichen Mehrwertsteuer. Der Anbieter behält sich Preisänderungen vor und informiert bestehende Abonnenten mindestens 30 Tage vor Inkrafttreten per E-Mail.</P>
        </Section>

        <Section num="5" title="Zahlung">
          <P>Die Zahlung erfolgt über die vom Anbieter bereitgestellten Zahlungsmethoden (derzeit: Kreditkarte, SEPA-Lastschrift via Stripe). Mit Abschluss des Kaufvorgangs erteilt der Nutzer die Zustimmung zur sofortigen Abbuchung des fälligen Betrags.</P>
          <P>Bei fehlgeschlagenem Zahlungseingang behält sich der Anbieter vor, den Zugang zu kostenpflichtigen Funktionen bis zum Ausgleich der offenen Forderung zu sperren.</P>
        </Section>

        <Section num="6" title="Widerrufsrecht">
          <P><strong>Widerrufsrecht für Verbraucher:</strong> Verbraucher haben das Recht, diesen Vertrag binnen 14 Tagen ohne Angabe von Gründen zu widerrufen. Die Widerrufsfrist beträgt 14 Tage ab Vertragsschluss.</P>
          <P>Zur Ausübung des Widerrufsrechts ist eine eindeutige Erklärung per E-Mail an info@mediright.com erforderlich.</P>
          <P><strong>Erlöschen des Widerrufsrechts bei digitalen Inhalten:</strong> Das Widerrufsrecht erlischt vorzeitig, wenn der Nutzer ausdrücklich zugestimmt hat, dass mit der Ausführung des Vertrags vor Ablauf der Widerrufsfrist begonnen wird, und seine Kenntnis davon bestätigt hat, dass er durch diese Zustimmung mit Beginn der Ausführung des Vertrags sein Widerrufsrecht verliert. Dies gilt insbesondere für den sofortigen Einsatz von Credits nach dem Kauf.</P>
        </Section>

        <Section num="7" title="KI-Hinweis & Haftungsausschluss">
          <P>Die Plattform nutzt KI-gestützte Sprachmodelle zur Analyse von Dokumenten. Der Nutzer erkennt an, dass:</P>
          <Ul>
            <Li>KI-generierte Analysen und Widerspruchsbrief-Entwürfe unverbindliche Hilfsmittel sind und keine anwaltliche Beratung ersetzen.</Li>
            <Li>Die Ergebnisse auf Basis der hochgeladenen Dokumente erzeugt werden und von der Qualität und Vollständigkeit dieser Dokumente abhängen.</Li>
            <Li>Keine Garantie für den Erfolg eines Widerspruchs oder einer Einspruchseinlegung übernommen werden kann.</Li>
            <Li>Der Nutzer eigenverantwortlich entscheidet, ob und wie er die erzeugten Inhalte einsetzt.</Li>
          </Ul>
          <P>Der Anbieter haftet nicht für Schäden, die aus der Nutzung oder Nicht-Nutzung der bereitgestellten KI-Analysen entstehen, sofern diese nicht auf Vorsatz oder grober Fahrlässigkeit des Anbieters beruhen.</P>
        </Section>

        <Section num="8" title="Haftungsbeschränkung">
          <P>Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie nach dem Produkthaftungsgesetz und bei schuldhafter Verletzung von Leben, Körper oder Gesundheit.</P>
          <P>Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.</P>
          <P>Die vorstehenden Haftungsbeschränkungen gelten auch zugunsten der Mitarbeiter, Vertreter und Erfüllungsgehilfen des Anbieters.</P>
        </Section>

        <Section num="9" title="Datenschutz & Datensicherheit">
          <P>Der Anbieter verarbeitet personenbezogene Daten und insbesondere Gesundheitsdaten ausschließlich zur Erbringung der vereinbarten Leistungen und gemäß der geltenden Datenschutzgrundverordnung (DSGVO). Näheres regelt die <Link href="/datenschutz" style={{ color: '#10b981', textDecoration: 'none' }}>Datenschutzerklärung</Link>.</P>
          <P>Hochgeladene Dokumente (Arztrechnungen, Kassenbescheide) werden verschlüsselt gespeichert und nicht an Dritte weitergegeben. Sie werden ausschließlich zur Erbringung der beauftragten Analyse-Leistungen verarbeitet.</P>
          <P>Der Nutzer ist verpflichtet, nur Dokumente hochzuladen, für deren Verarbeitung er berechtigt ist.</P>
        </Section>

        <Section num="10" title="Nutzungsrechte & geistiges Eigentum">
          <P>Der Anbieter räumt dem Nutzer für die Dauer des Vertragsverhältnisses ein einfaches, nicht übertragbares Recht zur Nutzung der Plattform für eigene Zwecke ein.</P>
          <P>Alle Rechte an der Plattform, dem zugrundeliegenden Code, den Datenbanken und den von der KI erzeugten Analyseergebnissen verbleiben beim Anbieter, soweit gesetzlich nichts anderes gilt.</P>
          <P>Eine kommerzielle Weiterverwertung der Plattform oder der erzeugten Inhalte ohne ausdrückliche Genehmigung des Anbieters ist nicht gestattet.</P>
        </Section>

        <Section num="11" title="Laufzeit & Kündigung">
          <P><strong>Kostenloses Konto:</strong> Kann jederzeit ohne Frist gelöscht werden. Die Löschung erfolgt über die Kontoeinstellungen oder per E-Mail an info@mediright.com.</P>
          <P><strong>Credit-Pakete:</strong> Einmalig erworbene Credits haben keine Verfallsdaten. Eine ordentliche Kündigung ist nicht erforderlich, da es sich um Einmalkäufe handelt. Nicht verwendete Credits werden bei Kontolöschung nicht erstattet.</P>
          <P><strong>Pro Jahresabo:</strong> Läuft für 12 Monate ab Kaufdatum. Kündigung spätestens 30 Tage vor Verlängerung per E-Mail an info@mediright.com oder über die Kontoeinstellungen. Bei Kündigung steht das Abonnement bis zum Ende der bezahlten Laufzeit zur Verfügung.</P>
          <P>Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund für den Anbieter liegt insbesondere vor bei wesentlichem Verstoß des Nutzers gegen diese AGB.</P>
        </Section>

        <Section num="12" title="Verfügbarkeit & Wartung">
          <P>Der Anbieter strebt eine Verfügbarkeit der Plattform von 99 % im Jahresdurchschnitt an, ausgenommen Wartungszeiten und Störungen außerhalb des Einflussbereichs des Anbieters. Ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht.</P>
          <P>Geplante Wartungsarbeiten werden, soweit möglich, außerhalb der Hauptnutzungszeiten durchgeführt und rechtzeitig angekündigt.</P>
        </Section>

        <Section num="13" title="Änderungen der AGB">
          <P>Der Anbieter behält sich das Recht vor, diese AGB mit einer Ankündigungsfrist von mindestens 30 Tagen zu ändern. Die Änderungen werden dem Nutzer per E-Mail mitgeteilt.</P>
          <P>Widerspricht der Nutzer den Änderungen nicht innerhalb von 30 Tagen nach Zugang der Mitteilung, gelten die geänderten AGB als angenommen. Auf dieses Widerspruchsrecht und die Folgen des Schweigens wird der Anbieter in der Änderungsmitteilung gesondert hinweisen.</P>
          <P>Im Falle eines Widerspruchs ist der Anbieter berechtigt, das Vertragsverhältnis zum Zeitpunkt des Inkrafttretens der Änderungen zu kündigen.</P>
        </Section>

        <Section num="14" title="Schlussbestimmungen">
          <P>Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG). Für Verbraucher mit gewöhnlichem Aufenthalt in der EU gilt ergänzend das Verbraucherrecht des jeweiligen Aufenthaltslandes, soweit dieses zwingende Schutzvorschriften enthält.</P>
          <P>Erfüllungsort für alle Leistungen ist der Sitz des Anbieters in Köln.</P>
          <P>Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</P>
          <P>Informationen zur Online-Streitbeilegung der EU-Kommission: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981' }}>ec.europa.eu/consumers/odr</a>. Der Anbieter ist nicht zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle verpflichtet und nimmt hieran nicht teil.</P>
        </Section>

        {/* Footer nav */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 32, marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[['Impressum', '/impressum'], ['Datenschutz', '/datenschutz'], ['Kontakt', '/kontakt']].map(([label, href]) => (
            <Link key={href} href={href} style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>

      </main>
    </div>
  )
}
