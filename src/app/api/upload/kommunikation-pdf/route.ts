/**
 * POST /api/upload/kommunikation-pdf
 *
 * Leichtgewichtiger PDF-Text-Extraktor für den Kommunikationserfassungs-Modal.
 * Kein Storage, keine Credits — gibt nur den extrahierten Klartext zurück,
 * damit der User ihn im Textarea prüfen/bearbeiten kann, bevor die KI-Analyse
 * über /api/widerspruch-kommunikationen läuft.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const maxDuration = 60

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
    return NextResponse.json({ error: 'Ungültige Formulardaten' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Keine Datei übermittelt' }, { status: 400 })
  }
  if (!file.type.includes('pdf') && !(file as File).name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Nur PDF-Dateien werden unterstützt' }, { status: 400 })
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer())
  if (pdfBuffer.length === 0) {
    return NextResponse.json({ error: 'Leere Datei' }, { status: 400 })
  }

  // ── PDF-Text extrahieren ───────────────────────────────────────────────────
  let extractedText: string
  try {
    // Dynamic import vermeidet Next.js-Build-Probleme mit pdf-parse's Test-Loader
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
      buf: Buffer
    ) => Promise<{ text: string; numpages: number }>
    const data = await pdfParse(pdfBuffer)
    extractedText = data.text?.trim() ?? ''
  } catch (e) {
    console.error('[kommunikation-pdf] pdf-parse Fehler:', e)
    return NextResponse.json({ error: 'PDF konnte nicht gelesen werden. Bitte Text manuell einfügen.' }, { status: 422 })
  }

  if (!extractedText) {
    // ── OCR-Fallback: Claude Vision für gescannte PDFs ─────────────────────
    console.log('[kommunikation-pdf] Kein Text via pdf-parse — versuche Claude OCR-Fallback')
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const base64Pdf = pdfBuffer.toString('base64')
      const ocrResponse = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf,
              },
            } as { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } },
            {
              type: 'text',
              text: 'Extrahiere den vollständigen Text aus diesem Dokument. Gib nur den reinen Text zurück, ohne Kommentare oder Formatierungshinweise. Behalte die Absatzstruktur bei.',
            },
          ],
        }],
      })
      const ocrText = ocrResponse.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('\n')
        .trim()
      if (ocrText) {
        const cleaned = ocrText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
        console.log('[kommunikation-pdf] OCR-Fallback erfolgreich, Länge:', cleaned.length)
        return NextResponse.json({ text: cleaned, ocr: true })
      }
    } catch (ocrErr) {
      console.error('[kommunikation-pdf] Claude OCR-Fallback fehlgeschlagen:', ocrErr)
    }
    return NextResponse.json(
      { error: 'PDF enthält keinen extrahierbaren Text (möglicherweise gescannt). Bitte Text manuell einfügen.' },
      { status: 422 }
    )
  }

  // ── Basis-Bereinigung: mehrfache Leerzeilen zusammenführen ────────────────
  const cleaned = extractedText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return NextResponse.json({ text: cleaned })
}
