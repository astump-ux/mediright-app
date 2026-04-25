/**
 * GET /api/legal/search?q=<suchbegriff>&limit=<anzahl>
 *
 * Suche in der pkv_urteile-Tabelle — gibt verifizierte BGH-Entscheidungen
 * zu PKV-Streitfragen zurück.
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

  const result = await searchLegalCases(q, limit)

  return NextResponse.json({
    query: q,
    count: result.count,
    urteile: result.cases.map(u => ({
      aktenzeichen: u.aktenzeichen,
      datum:        u.datum,
      kategorie:    u.kategorie,
      leitsatz:     u.leitsatz,
      relevanz_pkv: u.relevanz_pkv,
      quelle_url:   u.quelle_url,
    })),
  })
}
