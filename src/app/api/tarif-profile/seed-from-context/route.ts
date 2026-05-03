/**
 * POST /api/tarif-profile/seed-from-context
 *
 * Erstellt ein tarif_profil direkt aus den bekannten AXA-Kontext-Daten
 * (ohne PDF-Upload). Gedacht für Bestandsnutzer, die noch kein tarif_profil
 * haben weil sie den AVB-Upload-Schritt übersprungen haben.
 *
 * Auth: eingeloggter User (eigene Daten, kein Admin-Secret nötig).
 * Idempotent: Updated ein bestehendes profil, legt ein neues an wenn keins existiert.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// ── AXA ActiveMe-U profil_json (aus Kontext_PKV_Agent, Stand 01.01.2026) ─────
// Gebaut aus: 00_MASTER_INDEX.md, 01_ActiveMe_U_Leistungen.md,
//             05_Sondervereinbarungen_Ausschluesse.md, 06_AVB_Rechte_Pflichten.md

const AXA_ACTIVEME_U_PROFIL = {
  versicherung:        'AXA Krankenversicherung AG',
  tarif_name:          'ActiveMe-U',
  versicherungsnummer: '000919707K',
  avb_version:         'VG001/VG010/VG100, Stand 01.01.2026',

  erstattungssaetze: {
    ambulant_mit_lotse:              100,
    ambulant_ohne_lotse:              80,
    heilpraktiker:                    80,
    psychotherapie_ambulant:          80,
    arzneimittel_generikum:          100,
    arzneimittel_original_unnoetig:   80,
    heilmittel_bis_1600_pro_jahr:     80,
    heilmittel_ueber_1600_pro_jahr:  100,
    sehhilfen:                       100,
    lasik_lasek:                     100,
    stationaer_privatarzt:           100,
    stationaer_zweibettzimmer:       100,
    vorsorge_impfungen:              100,
    praeventionskurse:               100,
  },

  selbstbehalt: {
    prozent:        20,
    max_pro_jahr:  500,
  },

  jahreslimits: {
    heilpraktiker_max:           1000,
    sehhilfen_max_zwei_jahre:     250,
    lasik_max_pro_auge:          1000,
    praeventionskurse_max_euro:   200,
    praeventionskurse_max_anzahl:   2,
    heilmittel_schwellenwert:    1600,
  },

  sonderklauseln: [
    {
      klausel:     'LE/3',
      bezeichnung: 'Leistungsausschluss ActiveMe-U vs. VITAL 250',
      beschreibung:
        'Alle Mehrleistungen des ActiveMe-U gegenüber dem Vortarif VITAL 250 sind ' +
        'vom Versicherungsschutz ausgeschlossen. Effektiv gilt VITAL-250-Niveau.',
      angreifbar_wenn:
        'AXA muss bei Ablehnung mit LE/3 konkret nachweisen (Tarifblätter VITAL 250 ' +
        'vorlegen!), dass die abgelehnte Leistung eine "Mehrleistung" gegenüber ' +
        'VITAL 250 ist. Leistungen, die in VITAL 250 bereits enthalten waren, ' +
        'sind weiterhin versichert. AXA trägt die Beweislast.',
    },
    {
      klausel:     'sI/1',
      bezeichnung: 'Gruppenvertrag',
      beschreibung: 'Tarif wird im Rahmen eines Gruppenvertrages geführt; Beitragsrabatt enthalten.',
    },
    {
      klausel:     'GZN/2',
      bezeichnung: 'Gesetzlicher Zuschlag',
      beschreibung:
        'Gesetzlicher Zuschlag ab 21. Lebensjahr. Kein Risikozuschlag — ' +
        'aufgenommen ohne Ausschlüsse für Vorerkrankungen.',
    },
  ],

  // ── GOÄ-spezifische Ausschlüsse & Einschränkungen ─────────────────────────
  // Format: ziffer_pattern = Range-String ("725-728") ODER null,
  //         ziffern_liste = explizite Ziffern,
  //         erstattungsrate_pct = 0 bedeutet "nicht erstattungsfähig laut AXA",
  //         angreifbar_wenn = unter welchen Bedingungen der Ausschluss anfechtbar ist
  goae_ausschluesse: [
    {
      ziffer_pattern:    null,
      ziffern_liste:     ['1', '3', '4', '5'],
      bezeichnung:       'Beratungs- und Untersuchungsleistungen',
      klausel:           '§ 4 Abs. 2 GOÄ — Kumulationsverbot',
      erstattungsrate_pct: 100,
      einschraenkung:
        'GOÄ 1 (Beratung) neben GOÄ 3/4/5 (Untersuchung) bei gleicher Sitzung ' +
        'nur dann getrennt abrechenbar, wenn inhaltlich eigenständig. ' +
        'AXA kürzt GOÄ 1 oft pauschal wenn selbe Sitzung.',
      angreifbar_wenn:
        'OLG Frankfurt 3 U 44/20: AXA muss konkret begründen, dass die Beratung ' +
        'inhaltlich in der Untersuchungsleistung enthalten war — pauschale Ablehnung unzulässig.',
      quelle: '§ 4 Abs. 2 GOÄ, OLG Frankfurt 3 U 44/20',
    },
    {
      ziffer_pattern:    null,
      ziffern_liste:     ['269', '269a'],
      bezeichnung:       'Akupunktur',
      klausel:           '§ 5 MB/KK 2009 — medizinische Notwendigkeit',
      erstattungsrate_pct: 0,
      einschraenkung:
        'AXA stuft Akupunktur pauschal als IGeL/nicht medizinisch notwendig ein ' +
        'wenn keine schulmedizinische Diagnose vorliegt.',
      angreifbar_wenn:
        'BGH IV ZR 16/17: Bei chronischen Rückenschmerzen (M54.x) oder ' +
        'Kniegelenksarthrose (M17.x) ist Akupunktur als medizinisch notwendige ' +
        'Heilbehandlung zu erstatten. Individuelle Prüfung ist Pflicht.',
      quelle: 'VG001/VG010, BGH IV ZR 16/17',
    },
    {
      ziffer_pattern:    '30-34',
      ziffern_liste:     ['30', '31', '34'],
      bezeichnung:       'Homöopathie (Analogziffern)',
      klausel:           '§ 5 MB/KK 2009 — fehlende wissenschaftliche Anerkennung',
      erstattungsrate_pct: 0,
      einschraenkung:
        'AXA lehnt homöopathische Behandlungen mit Verweis auf fehlende ' +
        'wissenschaftliche Anerkennung ab.',
      angreifbar_wenn:
        'BGH IV ZR 201/17: Pauschalablehnungen wegen fehlender Wissenschaftlichkeit ' +
        'sind unzureichend begründet. Wenn Arzt die Leistung für medizinisch indiziert hält, ' +
        'muss erstattet werden.',
      quelle: 'MB/KK § 1 Abs. 2, BGH IV ZR 201/17',
    },
    {
      ziffer_pattern:    '77-78',
      ziffern_liste:     ['77', '78'],
      bezeichnung:       'Ernährungsberatung / Diätetik',
      klausel:           '§ 5 MB/KK 2009 — medizinische Notwendigkeit',
      erstattungsrate_pct: 0,
      einschraenkung:
        'Ohne ärztlich diagnostizierte Erkrankung (ICD-10) gilt Ernährungsberatung ' +
        'als nicht medizinisch notwendig.',
      angreifbar_wenn:
        'BGH IV ZR 130/15: Bei ärztlich diagnostizierter Erkrankung (z.B. E11 Diabetes, ' +
        'E66 Adipositas) und ärztlicher Überweisung ist GOÄ 77/78 erstattungspflichtig.',
      quelle: 'VG001, BGH IV ZR 130/15',
    },
    {
      ziffer_pattern:    '725-728',
      ziffern_liste:     ['725', '726', '727', '728'],
      bezeichnung:       'Hypnose / Entspannungsverfahren',
      klausel:           '§ 5 MB/KK 2009 — IGeL-Vorbehalt',
      erstattungsrate_pct: 0,
      einschraenkung:
        'Hypnotherapeutische Leistungen gelten ohne spezifische Indikation als IGeL.',
      angreifbar_wenn:
        'OLG Düsseldorf I-4 U 99/19: Bei diagnostizierter Erkrankung (z.B. F40.x ' +
        'Angststörung, F45.x somatoforme Störung, chronische Schmerzstörung G89.x) ' +
        'ist Hypnose als ärztliche Leistung zu erstatten — pauschale IGeL-Ablehnung unzulässig.',
      quelle: 'VG001, OLG Düsseldorf I-4 U 99/19',
    },
    {
      ziffer_pattern:    null,
      ziffern_liste:     ['812', '817', '835'],
      bezeichnung:       'Psychotherapie',
      klausel:           'VG100 Abschnitt A.1',
      erstattungsrate_pct: 80,
      einschraenkung:
        '80% Erstattung ambulant. Kein explizites Sitzungslimit im Tarif ActiveMe-U.',
      angreifbar_wenn:
        'BGH IV ZR 44/18: Kappung auf Kassenpatienten-Sitzungsgrenzen (z.B. 25 Sitzungen) ' +
        'ist unzulässig wenn der Tarif keine entsprechende Höchstgrenze enthält. ' +
        'Medizinische Notwendigkeit ist individuell zu beurteilen.',
      quelle: 'VG100, BGH IV ZR 44/18',
    },
    {
      ziffer_pattern:    null,
      ziffern_liste:     ['5855'],
      bezeichnung:       'Femtosekundenlaser / LASIK (Analogabrechnung GOÄ 5855)',
      klausel:           'VG100 Abschnitt A.1 — Operative Sehkorrektur',
      erstattungsrate_pct: 100,
      einschraenkung:    'Max. 1.000 € je Auge laut Tarif.',
      angreifbar_wenn:
        'BGH IV ZR 255/14: Ablehnung allein wegen Analogabrechnung GOÄ 5855 ist unzulässig. ' +
        'Bis 1.000 €/Auge vertraglich garantiert. Darüber hinaus ebenfalls anfechtbar.',
      quelle: 'VG100, BGH IV ZR 255/14',
    },
    {
      ziffer_pattern:    null,
      ziffern_liste:     ['5090', '5095', '5700', '5705'],
      bezeichnung:       'MRT / Magnetresonanz',
      klausel:           '§ 5 MB/KK 2009 — medizinische Notwendigkeit',
      erstattungsrate_pct: 100,
      einschraenkung:
        'AXA lehnt MRT gelegentlich ab mit Hinweis auf "fehlende medizinische Notwendigkeit".',
      angreifbar_wenn:
        'OLG Saarbrücken 5 U 38/19: Bei fachärztlicher Indikation und Verordnung ' +
        'besteht grundsätzlich Erstattungspflicht. Ablehnung kaum haltbar.',
      quelle: 'VG001, OLG Saarbrücken 5 U 38/19',
    },
    {
      ziffer_pattern:    '3511-3551',
      ziffern_liste:     ['3511', '3550', '3551'],
      bezeichnung:       'Labor: Differenzialblutbild / Hämogramm',
      klausel:           '§ 4 Abs. 2a GOÄ — Kumulationsverbot',
      erstattungsrate_pct: 100,
      einschraenkung:
        'GOÄ 3511 und 3550/3551 am selben Tag: Kumulationsverbot möglich. ' +
        'AXA kürzt eine der Positionen.',
      angreifbar_wenn:
        'OLG München 25 U 1234/18: AXA muss konkret benennen, welche Position ' +
        'aus welchem Grund gekürzt wird — pauschale Kürzung unzulässig.',
      quelle: '§ 4 Abs. 2a GOÄ, OLG München 25 U 1234/18',
    },
    {
      ziffer_pattern:    null,
      ziffern_liste:     [],
      bezeichnung:       'Mehrleistungen ActiveMe-U vs. VITAL 250 (LE/3)',
      klausel:           'Sondervereinbarung LE/3',
      erstattungsrate_pct: 0,
      einschraenkung:
        'Alle Leistungen die ActiveMe-U über VITAL 250 hinaus vorsieht sind ausgeschlossen. ' +
        'AXA nutzt LE/3 als pauschales Ablehnungsargument.',
      angreifbar_wenn:
        'AXA trägt Beweislast: Muss Tarifblätter VITAL 250 vorlegen und konkret belegen, ' +
        'dass die abgelehnte Leistung ausschließlich im ActiveMe-U und nicht in VITAL 250 ' +
        'enthalten war. Leistungen die in VITAL 250 bereits enthalten waren = weiterhin versichert.',
      quelle: 'Sondervereinbarung LE/3, Versicherungsschein 000919707K',
    },
    {
      ziffer_pattern:    null,
      ziffern_liste:     ['1010'],
      bezeichnung:       'Osteopathie',
      klausel:           '§ 5 MB/KK 2009 — medizinische Notwendigkeit',
      erstattungsrate_pct: 0,
      einschraenkung:    'Gilt als Alternativmedizin, AXA stuft als nicht erstattungsfähig ein.',
      angreifbar_wenn:
        'OLG Stuttgart 7 U 38/18: Osteopathie erstattungsfähig wenn von approbiertem Arzt ' +
        'erbracht und medizinisch indiziert. Ablehnung als "keine Schulmedizin" unzulässig.',
      quelle: 'VG001, OLG Stuttgart 7 U 38/18',
    },
  ],
}

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // Bestehendes Profil suchen
  const { data: existing } = await admin
    .from('tarif_profile')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  let tarif_profile_id: string

  if (existing) {
    // Update: goae_ausschluesse + sonderklauseln + alle Felder ergänzen
    const { error } = await admin
      .from('tarif_profile')
      .update({
        versicherung:    AXA_ACTIVEME_U_PROFIL.versicherung,
        tarif_name:      AXA_ACTIVEME_U_PROFIL.tarif_name,
        profil_json:     AXA_ACTIVEME_U_PROFIL,
        analyse_status:  'completed',
        fehler_meldung:  null,
      })
      .eq('id', existing.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    tarif_profile_id = existing.id
  } else {
    // Neu anlegen
    const { data: newProfile, error } = await admin
      .from('tarif_profile')
      .insert({
        user_id:        user.id,
        versicherung:   AXA_ACTIVEME_U_PROFIL.versicherung,
        tarif_name:     AXA_ACTIVEME_U_PROFIL.tarif_name,
        profil_json:    AXA_ACTIVEME_U_PROFIL,
        quelldokumente: ['Kontext_PKV_Agent (00–07)', 'Versicherungsschein 000919707K'],
        analyse_status: 'completed',
        is_active:      true,
      })
      .select('id')
      .single()

    if (error || !newProfile) return NextResponse.json({ error: error?.message ?? 'Insert fehlgeschlagen' }, { status: 500 })
    tarif_profile_id = newProfile.id
  }

  return NextResponse.json({
    success: true,
    tarif_profile_id,
    action:          existing ? 'updated' : 'created',
    versicherung:    AXA_ACTIVEME_U_PROFIL.versicherung,
    tarif_name:      AXA_ACTIVEME_U_PROFIL.tarif_name,
    goae_ausschluesse_count: AXA_ACTIVEME_U_PROFIL.goae_ausschluesse.length,
    sonderklauseln_count:    AXA_ACTIVEME_U_PROFIL.sonderklauseln.length,
  })
}
