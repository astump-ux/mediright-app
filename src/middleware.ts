/**
 * Next.js Middleware
 *
 * Responsibilities:
 * 1. Refresh Supabase session cookies on every request (required for SSR auth)
 * 2. Redirect unauthenticated users to /login when accessing protected routes
 * 3. Redirect already-logged-in users away from /login to /dashboard
 *
 * The onboarding redirect (new user → /onboarding) is handled in
 * /auth/callback so we avoid a DB round-trip on every request here.
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that are accessible without authentication
const PUBLIC_ROUTES = ['/', '/login', '/auth', '/pricing', '/demos', '/impressum', '/datenschutz', '/agb', '/kontakt']

// Routes that are always public (static assets, API routes handled separately)
function isPublic(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return true          // API routes handle auth internally
  if (pathname.startsWith('/_next/')) return true        // Next.js internals
  if (pathname.startsWith('/favicon')) return true
  return PUBLIC_ROUTES.some(p => p === '/' ? pathname === '/' : pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create a mutable response so we can set refreshed session cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies to both request and response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — this is the critical part that keeps the JWT alive
  const { data: { user } } = await supabase.auth.getUser()

  // ── Redirect logged-in users away from /login ────────────────────────────
  if (user && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Redirect unauthenticated users to /login ─────────────────────────────
  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  // Run on all routes except static files
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
