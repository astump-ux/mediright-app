/**
 * /onboarding
 *
 * 3-step wizard for new users:
 *   Step 1 – Willkommen  : Feature overview, "Los geht's" CTA
 *   Step 2 – Dein Profil : full_name*, pkv_name*, pkv_tarif, phone_whatsapp
 *   Step 3 – Bereit!     : Credits shown, two upload CTAs
 *
 * Redirects to /dashboard if already completed onboarding.
 */
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import OnboardingWizard from './OnboardingWizard'

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('onboarding_completed, full_name, credits')
    .eq('id', user.id)
    .single()

  // Already done — skip to dashboard
  if (profile?.onboarding_completed === true) {
    redirect('/dashboard')
  }

  return (
    <OnboardingWizard
      credits={profile?.credits ?? 0}
      existingName={profile?.full_name ?? ''}
    />
  )
}
