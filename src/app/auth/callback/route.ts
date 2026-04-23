/**
 * GET /auth/callback
 *
 * Handles the OAuth / Magic Link redirect from Supabase.
 * After exchanging the code for a session:
 *   - New users (onboarding_completed = false / no profile) → /onboarding
 *   - Returning users                                       → /dashboard
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code   = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] session exchange failed:', error.message)
      return NextResponse.redirect(`${origin}/login?error=auth`)
    }

    // ── Detect new vs. returning user ─────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const admin = getSupabaseAdmin()
      const { data: profile } = await admin
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

      // No profile row OR onboarding not yet completed → wizard
      if (!profile || profile.onboarding_completed === false) {
        // Make sure the row exists so the wizard can PATCH it
        await admin
          .from('profiles')
          .upsert(
            { id: user.id, onboarding_completed: false },
            { onConflict: 'id', ignoreDuplicates: true }
          )
        return NextResponse.redirect(`${origin}/onboarding`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
