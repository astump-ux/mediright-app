import Header from '@/components/layout/Header'
import SettingsClient from '@/components/settings/SettingsClient'

export default function SettingsPage() {
  return (
    <>
      <Header />
      <main className="max-w-[720px] mx-auto px-6 py-10 w-full">
        <h1
          className="text-3xl mb-1"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: 'var(--navy)' }}
        >
          Einstellungen
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Persönliche Daten & PKV-Profil
        </p>
        <SettingsClient />
      </main>
    </>
  )
}
