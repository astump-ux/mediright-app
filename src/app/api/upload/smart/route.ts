/**
 * POST /api/upload/smart
 *
 * Zero-classification upload endpoint for "Meine Fälle" smart upload zone.
 * User uploads ANY PKV-related PDF — this endpoint classifies it first (using
 * a lightweight Claude call) and then delegates to the correct handler.
 *
 * Response shape:
 *   { type: 'kassenbescheid' | 'arztrechnung', ...handler-specific fields }
 *
 * On classification error the default is 'arztrechnung' (fail-safe, same as classifyPdf).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { classifyPdf } from '@/lib/goae-analyzer'

export const maxDuration = 90   // classification + handler analysis

export async function POST(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse multipart form data ──────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!file.type.includes('pdf') && !(file as File).name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer())
  if (pdfBuffer.length === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }

  // ── Fetch user PKV name for classification hint ────────────────────────────
  const admin = getSupabaseAdmin()
  let pkvName: string | null = null
  try {
    const { data: p } = await admin.from('profiles').select('pkv_name').eq('id', user.id).single()
    pkvName = (p as { pkv_name?: string | null } | null)?.pkv_name ?? null
  } catch { /* profiles table may not have pkv_name yet */ }

  // ── Classify the PDF ───────────────────────────────────────────────────────
  const docType = await classifyPdf(pdfBuffer, pkvName)

  // ── Delegate to the appropriate internal handler via fetch ─────────────────
  // We re-POST to the specialized endpoint so all the existing logic (credit
  // gates, GOÄ analysis, matching) runs exactly once without duplication.
  const origin = request.nextUrl.origin
  const targetPath = docType === 'kassenabrechnung'
    ? '/api/upload/kassenbescheid'
    : '/api/upload/arztrechnung'

  // Forward the original file in a new FormData envelope
  const forwardForm = new FormData()
  forwardForm.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), (file as File).name ?? 'upload.pdf')

  // Forward auth cookies so the inner route can authenticate the same user
  const cookieHeader = request.headers.get('cookie') ?? ''

  const inner = await fetch(`${origin}${targetPath}`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
    body: forwardForm,
  })

  const innerJson = await inner.json().catch(() => ({ error: 'Handler returned non-JSON' }))

  // Augment the response with the detected document type
  return NextResponse.json(
    { type: docType, ...innerJson },
    { status: inner.status }
  )
}
