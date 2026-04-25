/**
 * GET /api/legal/search?q=<suchbegriff>&limit=<anzahl>
 *
 * Proxy für OpenLegalData-Suche — ermöglicht Rechtsprechungs-Recherche
 * direkt aus der MediRight-App heraus (zukünftige UI-Integration).
 *
 * Nur für eingeloggte Nutzer zugänglich.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { searchLegalCases } from '@/lib/legal-search'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q     = req.nextUrl.searchParams.get('q') ?? ''
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10', 10), 25)

  if (!q.trim()) {
    return NextResponse.json({ error: 'Suchbegriff fehlt (?q=...)' }, { status: 400 })
  }

  const result = await searchLegalCases(`PKV Krankenversicherung ${q}`, limit)

  return NextResponse.json({
    query: q,
    count: result.count,
    cases: result.cases.map(c => ({
      id:          c.id,
      date:        c.date,
      court:       c.court?.name ?? '–',
      file_number: c.file_number ?? '–',
      url:         `https://de.openlegaldata.io/case/${c.slug ?? c.id}/`,
    })),
  })
}
