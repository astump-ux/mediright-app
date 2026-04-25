import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

// GET /api/tarif-profile
// Returns the active tarif_profile for the logged-in user,
// including linked avb_dokumente.
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('tarif_profile')
    .select(`
      id,
      versicherung,
      tarif_name,
      avb_version,
      versicherungsnummer,
      profil_json,
      quelldokumente,
      analyse_status,
      analyse_datum,
      fehler_meldung,
      is_active,
      created_at,
      avb_dokumente (
        id,
        dateiname_original,
        dateityp,
        seiten,
        groesse_bytes,
        uploaded_at
      )
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[tarif-profile GET] DB error:', error)
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json({ profile: null, has_profile: false })
  }

  // Extract key summary fields from profil_json for convenience
  const json = profile.profil_json as Record<string, unknown> | null
  const summary = json ? {
    selbstbehalt_pct: (json.selbstbehalt as { prozent?: number } | undefined)?.prozent ?? null,
    selbstbehalt_max_eur: (json.selbstbehalt as { jahresmaximum_eur?: number } | undefined)?.jahresmaximum_eur ?? null,
    selbstbehalt_ausnahmen: (json.selbstbehalt as { ausnahmen_kein_selbstbehalt?: string[] } | undefined)?.ausnahmen_kein_selbstbehalt ?? [],
    mit_lotse_pct: (json.gesundheitslotse as { mit_lotse_pct?: number } | undefined)?.mit_lotse_pct ?? null,
    ohne_lotse_pct: (json.gesundheitslotse as { ohne_lotse_pct?: number } | undefined)?.ohne_lotse_pct ?? null,
    sonderklauseln_kritisch: Array.isArray(json.sonderklauseln)
      ? (json.sonderklauseln as Array<{ risiko?: string; id?: string; bezeichnung?: string }>)
          .filter(k => k.risiko === 'KRITISCH' || k.risiko === 'HOCH')
          .map(k => ({ id: k.id, bezeichnung: k.bezeichnung, risiko: k.risiko }))
      : [],
    wichtige_hinweise: (json.wichtige_hinweise as string[]) ?? [],
  } : null

  return NextResponse.json({
    has_profile: true,
    profile: {
      ...profile,
      summary,
    },
  })
}
