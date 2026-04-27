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

const TEST_SECRET = 'mediright-test-2026'

export async function POST(req: NextRequest) {
  // Simple auth guard
  if (req.headers.get('x-test-secret') !== TEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const ablehnungsgruende: string[] = body.ablehnungsgruende ?? [
    'Beitragsanpassung ungültig keine aktuarielle Bestätigung § 203 VVG Treuhänder-Mangel'
  ]

  const resendKeySet = !!process.env.RESEND_API_KEY
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? '(nicht gesetzt)'
  const startedAt    = new Date().toISOString()

  let output = ''
  let error:  string | null = null

  try {
    output = await searchPkvPrecedents(ablehnungsgruende)
  } catch (e: any) {
    error = e?.message ?? String(e)
  }

  return NextResponse.json({
    status:          error ? 'error' : 'ok',
    env: {
      RESEND_API_KEY_set:    resendKeySet,
      NEXT_PUBLIC_APP_URL:   appUrl,
    },
    input: { ablehnungsgruende },
    started_at:      startedAt,
    finished_at:     new Date().toISOString(),
    exit_pass_triggered: output.includes('ERWEITERTE RECHERCHE AKTIV'),
    live_results_found:  output.includes('LIVE-RECHERCHE'),
    verified_found:      output.includes('RELEVANTE RECHTSPRECHUNG'),
    output_preview:      output.slice(0, 800) || '(leer)',
    error,
  }, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
