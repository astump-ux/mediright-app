/**
 * POST /api/legal/test-exit-pass
 *
 * TEMPORÄRE Test-Route — prüft ob Exit-Pass + Notification funktionieren.
 * Absicherung: Header x-test-secret muss stimmen.
 *
 * curl -X POST https://<vercel-url>/api/legal/test-exit-pass \
 *   -H "x-test-secret: mediright-test-2026" \
 *   -H "Content-Type: application/json" \
 *   -d '{"ablehnungsgruende": ["Beitragsanpassung ungültig keine aktuarielle Bestätigung"]}'
 */
import { NextRequest, NextResponse } from 'next/server'
import { searchPkvPrecedents } from '@/lib/legal-search'
import { sendExitPassAlert } from '@/lib/notifications'

const TEST_SECRET = 'mediright-test-2026'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-test-secret') !== TEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body              = await req.json().catch(() => ({}))
  const forceEmail        = body.force_email === true
  const ablehnungsgruende: string[] = body.ablehnungsgruende ?? [
    'Beitragsanpassung ungültig keine aktuarielle Bestätigung § 203 VVG Treuhänder-Mangel'
  ]

  const resendKeySet = !!process.env.RESEND_API_KEY
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? '(nicht gesetzt)'
  const startedAt    = new Date().toISOString()

  // Modus A: force_email=true → sendet Test-Email direkt, unabhängig von DB
  if (forceEmail) {
    let emailError: string | null = null
    try {
      await sendExitPassAlert({
        ablehnungsgruende,
        searchTerms:     'TEST: private Krankenversicherung Beitragsanpassung',
        verifiedCount:   0,
        liveResultCount: 2,
        kategorie:       'beitragsanpassung',
        timestamp:       startedAt,
        userEmail:       'test@mediright.de',
      })
    } catch (e: any) {
      emailError = e?.message ?? String(e)
    }
    return NextResponse.json({
      mode:              'force_email',
      RESEND_API_KEY_set: resendKeySet,
      NEXT_PUBLIC_APP_URL: appUrl,
      email_attempted:   true,
      email_error:       emailError,
      note:              resendKeySet
        ? 'Email wurde versucht zu senden — bitte Postfach astump@dl-remote.com prüfen'
        : 'RESEND_API_KEY fehlt — Email konnte nicht gesendet werden. Bitte in Vercel setzen.',
    })
  }

  // Modus B: normaler Flow über searchPkvPrecedents
  let output = ''
  let error:  string | null = null
  try {
    output = await searchPkvPrecedents(ablehnungsgruende)
  } catch (e: any) {
    error = e?.message ?? String(e)
  }

  return NextResponse.json({
    mode:            'normal',
    status:          error ? 'error' : 'ok',
    env: {
      RESEND_API_KEY_set:  resendKeySet,
      NEXT_PUBLIC_APP_URL: appUrl,
    },
    input: { ablehnungsgruende },
    started_at:           startedAt,
    finished_at:          new Date().toISOString(),
    exit_pass_triggered:  output.includes('ERWEITERTE RECHERCHE AKTIV'),
    live_results_found:   output.includes('LIVE-RECHERCHE'),
    verified_found:       output.includes('RELEVANTE RECHTSPRECHUNG'),
    output_preview:       output.slice(0, 800) || '(leer)',
    error,
  }, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
