/**
 * buildFallContext – assembles a complete, structured Fallakte string for use in AI prompts.
 *
 * Fetches from DB:
 *   - Kassenbescheid (bescheiddatum, betrag, kasse_analyse / Handlungsempfehlung)
 *   - Linked Arztrechnungen (GOÄ-Analyse, Einsparpotenzial, Flags)
 *   - Full Kommunikationsverlauf (outgoing + incoming, chronological)
 *
 * The returned string is injected as {{fallkontext}} into every downstream AI prompt.
 */
import { getSupabaseAdmin } from './supabase-admin'
import { buildBenchmarkContext } from './benchmark-context'
import { searchPkvPrecedents } from './legal-search'
import { getOmbudsmannContext } from './ombudsmann-context'

export async function buildFallContext(kassenabrechnungenId: string): Promise<string> {
  const admin = getSupabaseAdmin()

  // ── Fetch all data in parallel ──────────────────────────────────────────────
  const [kasseRes, vorgaengeRes, kommRes] = await Promise.all([
    admin
      .from('kassenabrechnungen')
      .select('user_id, bescheiddatum, referenznummer, betrag_eingereicht, betrag_erstattet, betrag_abgelehnt, kasse_analyse')
      .eq('id', kassenabrechnungenId)
      .single(),
    admin
      .from('vorgaenge')
      .select('arzt_name, rechnungsdatum, betrag_gesamt, goae_positionen, claude_analyse')
      .eq('kassenabrechnung_id', kassenabrechnungenId),
    admin
      .from('widerspruch_kommunikationen')
      .select('richtung, kommunikationspartner, typ, datum, betreff, inhalt, ki_analyse')
      .eq('kassenabrechnungen_id', kassenabrechnungenId)
      .order('datum', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  // ── Load tarif_profile for VG citations ────────────────────────────────────
  const userId = kasseRes.data?.user_id
  let tarifProfilJson: Record<string, unknown> | null = null
  if (userId) {
    try {
      const { data: tp } = await admin
        .from('tarif_profile')
        .select('profil_json, versicherung, tarif_name, avb_version')
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('analyse_status', 'completed')
        .maybeSingle()
      tarifProfilJson = (tp?.profil_json as Record<string, unknown>) ?? null
    } catch { /* table not yet available */ }
  }

  const kasse      = kasseRes.data
  const vorgaenge  = vorgaengeRes.data ?? []
  const komms      = kommRes.data ?? []
  const kasseAnalyse = kasse?.kasse_analyse as Record<string, unknown> | null

  const lines: string[] = ['═══════════════════════════════════════════════════════', '  VOLLSTÄNDIGE FALLAKTE', '═══════════════════════════════════════════════════════', '']

  // ── Section 1: Arztrechnung(en) ─────────────────────────────────────────────
  if (vorgaenge.length > 0) {
    for (const v of vorgaenge) {
      const analyse = v.claude_analyse as Record<string, unknown> | null
      lines.push('──────────────────────────────────────────────────────')
      lines.push('ARZTRECHNUNG')
      lines.push('──────────────────────────────────────────────────────')
      lines.push(`Arzt:            ${v.arzt_name ?? 'Unbekannt'}`)
      lines.push(`Rechnungsdatum:  ${v.rechnungsdatum ?? '–'}`)
      lines.push(`Betrag gesamt:   ${v.betrag_gesamt?.toFixed(2) ?? '–'} €`)
      if (analyse?.zusammenfassung) {
        lines.push(`KI-Analyse:      ${analyse.zusammenfassung}`)
      }
      if (analyse?.einsparpotenzial) {
        lines.push(`Einsparpotenzial: ${analyse.einsparpotenzial} €`)
      }
      const flags: string[] = []
      if (analyse?.flagFaktorUeberSchwellenwert) flags.push('Faktor über Schwellenwert')
      if (analyse?.flagFehlendeBegrundung)        flags.push('Fehlende §12-Begründung')
      if (flags.length > 0) lines.push(`⚠ Flags:         ${flags.join(', ')}`)

      // GOÄ-Positionen (top 10 max for brevity)
      const positionen = (v.goae_positionen as Array<{ ziffer: string; bezeichnung?: string; betrag?: number; faktor?: number }> | null) ?? []
      if (positionen.length > 0) {
        lines.push('Abgerechnete Positionen:')
        for (const p of positionen.slice(0, 10)) {
          lines.push(`  GOÄ ${p.ziffer}  ${p.bezeichnung ?? ''}  ${p.betrag != null ? p.betrag.toFixed(2) + ' €' : ''}  ${p.faktor != null ? 'Faktor ' + p.faktor + '×' : ''}`.trimEnd())
        }
        if (positionen.length > 10) lines.push(`  … (${positionen.length - 10} weitere Positionen)`)
      }
      lines.push('')
    }
  }

  // ── Section 2: Kassenbescheid ───────────────────────────────────────────────
  lines.push('──────────────────────────────────────────────────────')
  lines.push('AXA-KASSENBESCHEID')
  lines.push('──────────────────────────────────────────────────────')
  lines.push(`Bescheiddatum:   ${kasse?.bescheiddatum ?? '–'}`)
  lines.push(`Referenznummer:  ${kasse?.referenznummer ?? '–'}`)
  lines.push(`Eingereicht:     ${kasse?.betrag_eingereicht?.toFixed(2) ?? '–'} €`)
  lines.push(`Erstattet:       ${kasse?.betrag_erstattet?.toFixed(2) ?? '–'} €`)
  lines.push(`Abgelehnt:       ${kasse?.betrag_abgelehnt?.toFixed(2) ?? '–'} €`)

  const ablehnungsgruende = (kasseAnalyse?.ablehnungsgruende as string[] | null) ?? []
  if (ablehnungsgruende.length > 0) {
    lines.push('Ablehnungsgründe der Kasse:')
    for (const g of ablehnungsgruende) lines.push(`  - ${g}`)
  }

  if (kasseAnalyse?.widerspruchEmpfohlen != null) {
    lines.push(`Widerspruch empfohlen: ${kasseAnalyse.widerspruchEmpfohlen ? 'JA' : 'NEIN'}`)
  }
  if (kasseAnalyse?.widerspruchErfolgswahrscheinlichkeit != null) {
    lines.push(`KI-Erfolgschance:  ${kasseAnalyse.widerspruchErfolgswahrscheinlichkeit}%`)
  }
  if (kasseAnalyse?.widerspruchBegruendung) {
    lines.push(`KI-Handlungsempfehlung: ${kasseAnalyse.widerspruchBegruendung}`)
  }
  if (kasseAnalyse?.naechsteSchritte) {
    const schritte = kasseAnalyse.naechsteSchritte as string[]
    lines.push('KI-Nächste Schritte:')
    schritte.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`))
  }
  lines.push('')

  // ── Section 3: Kommunikationsverlauf ────────────────────────────────────────
  if (komms.length > 0) {
    lines.push('──────────────────────────────────────────────────────')
    lines.push(`KOMMUNIKATIONSVERLAUF (${komms.length} Einträge, chronologisch)`)
    lines.push('──────────────────────────────────────────────────────')
    for (const k of komms) {
      const dir     = k.richtung === 'ausgehend' ? '→ GESENDET AN' : '← ERHALTEN VON'
      const partner = k.kommunikationspartner === 'kasse' ? 'AXA' : 'Arzt/Praxis'
      lines.push(`[${k.datum}] ${dir} ${partner} | Typ: ${k.typ}`)
      if (k.betreff) lines.push(`Betreff: ${k.betreff}`)
      lines.push(k.inhalt)
      if (k.ki_analyse) lines.push(`→ KI-Analyse: ${k.ki_analyse}`)
      lines.push('')
    }
  } else {
    lines.push('Kommunikationsverlauf: Noch keine Kommunikation geführt.')
    lines.push('')
  }

  // ── Section 4: Vertragsgrundlage mit VG-Zitaten ────────────────────────────
  if (tarifProfilJson) {
    lines.push('──────────────────────────────────────────────────────')
    lines.push('VERTRAGSGRUNDLAGE (aus AVB — für präzise Zitierung im Widerspruchsbrief)')
    lines.push('──────────────────────────────────────────────────────')
    lines.push('⚡ Diese Quellen MÜSSEN im Widerspruchsbrief mit exakter VG-Nummer + Seite zitiert werden.')
    lines.push('')

    const sb = tarifProfilJson.selbstbehalt as Record<string, unknown> | undefined
    if (sb) {
      lines.push(`SELBSTBEHALT: ${sb.prozent ?? '?'}% Eigenanteil, max. ${sb.jahresmaximum_eur ?? '?'} EUR/Jahr`)
      if (Array.isArray(sb.ausnahmen_kein_selbstbehalt) && sb.ausnahmen_kein_selbstbehalt.length > 0) {
        lines.push(`Ausnahmen (kein Selbstbehalt): ${(sb.ausnahmen_kein_selbstbehalt as string[]).join(', ')}`)
      }
      if (sb.quelle) lines.push(`Quelle: ${sb.quelle}`)
      lines.push('')
    }

    const gl = tarifProfilJson.gesundheitslotse as Record<string, unknown> | undefined
    if (gl) {
      lines.push(`GESUNDHEITSLOTSE: mit Lotse ${gl.mit_lotse_pct ?? '?'}%, ohne Lotse ${gl.ohne_lotse_pct ?? '?'}%`)
      if (gl.quelle) lines.push(`Quelle: ${gl.quelle}`)
      lines.push('')
    }

    const es = tarifProfilJson.erstattungssaetze as Record<string, unknown> | undefined
    if (es) {
      const erstattungsZeilen: string[] = []
      if (es.arzt_mit_lotse_pct != null)        erstattungsZeilen.push(`Arzt (mit Lotse): ${es.arzt_mit_lotse_pct}%`)
      if (es.arzt_ohne_lotse_pct != null)       erstattungsZeilen.push(`Arzt (ohne Lotse): ${es.arzt_ohne_lotse_pct}%`)
      if (es.heilmittel_bis_grenze_pct != null) erstattungsZeilen.push(`Heilmittel: ${es.heilmittel_bis_grenze_pct}% (bis ${es.heilmittel_jahresgrenze_eur ?? '?'} EUR/Jahr)`)
      if (es.psychotherapie_pct != null)        erstattungsZeilen.push(`Psychotherapie: ${es.psychotherapie_pct}%`)
      if (es.heilpraktiker_pct != null)         erstattungsZeilen.push(`Heilpraktiker: ${es.heilpraktiker_pct}% (max. ${es.heilpraktiker_jahresmax_eur ?? '?'} EUR/Jahr)`)
      if (es.arzneimittel_generikum_pct != null) erstattungsZeilen.push(`Arzneimittel Generikum: ${es.arzneimittel_generikum_pct}%`)
      if (erstattungsZeilen.length > 0) {
        lines.push('ERSTATTUNGSSÄTZE (laut Vertrag):')
        erstattungsZeilen.forEach(z => lines.push(`  • ${z}`))
        lines.push('')
      }
    }

    const klauseln = tarifProfilJson.sonderklauseln as Array<Record<string, unknown>> | undefined
    if (Array.isArray(klauseln) && klauseln.length > 0) {
      const kritisch = klauseln.filter(k => k.risiko === 'KRITISCH' || k.risiko === 'HOCH')
      if (kritisch.length > 0) {
        lines.push('SONDERKLAUSELN (KRITISCH/HOCH — zu beachten):')
        kritisch.forEach(k => {
          lines.push(`  [${k.risiko}] ${k.id ?? ''} — ${k.bezeichnung ?? ''}`)
          if (k.wortlaut) lines.push(`  Vertragstext: "${String(k.wortlaut).slice(0, 300)}"`)
          if (k.quelle)   lines.push(`  Quelle: ${k.quelle}`)
          if (k.rechtliche_angreifbarkeit) lines.push(`  Rechtlich: ${k.rechtliche_angreifbarkeit}`)
        })
        lines.push('')
      }
    }
  }

  // ── Section 5: Marktvergleich (tarif_benchmarks) ───────────────────────────
  try {
    const benchmarkBlock = await buildBenchmarkContext(ablehnungsgruende)
    if (benchmarkBlock) {
      lines.push(benchmarkBlock)
    }
  } catch { /* Benchmark-Tabelle noch nicht verfügbar */ }

  // ── Section 6: Relevante Rechtsprechung (BGH pkv_urteile) ─────────────────
  if (ablehnungsgruende.length > 0) {
    try {
      const legalBlock = await searchPkvPrecedents(ablehnungsgruende)
      if (legalBlock) {
        lines.push(legalBlock)
      }
    } catch { /* Tabelle noch nicht verfügbar — kein Fehler */ }
  }

  // ── Section 7: Ombudsmann-Kalibrierung (Erfolgsquoten 2025) ────────────────
  // Gibt der KI empirische Daten darüber, wie häufig welche Beschwerdekategorien
  // beim Ombudsmann eingehen und wie die Einigungsquote liegt (33,1 %).
  // Erlaubt präzisere Erfolgschancen-Einschätzungen im Widerspruchsbrief.
  if (ablehnungsgruende.length > 0) {
    try {
      // Einfaches Kategorie-Mapping analog zu legal-search.ts
      const text = ablehnungsgruende.join(' ').toLowerCase()
      const kategorien: string[] = []
      if (/beitrag|prämie|erhöhung|anpassung/.test(text))           kategorien.push('beitragsanpassung')
      if (/notwendig|heilbehandlung|therapie|medizinisch|alternativ/.test(text)) kategorien.push('medizinische_notwendigkeit')
      if (/goä|goa|faktor|analog|ziffer|schwellenwert|abrechnung/.test(text))    kategorien.push('goae')
      if (/ausschluss|klausel|vorerkrankung|nicht versichert/.test(text))        kategorien.push('ausschlussklausel')
      if (kategorien.length === 0) kategorien.push('medizinische_notwendigkeit')

      const ombBlock = await getOmbudsmannContext(kategorien)
      if (ombBlock) lines.push(ombBlock)
    } catch { /* Tabelle noch nicht verfügbar — kein Fehler */ }
  }

  lines.push('═══════════════════════════════════════════════════════')
  return lines.join('\n')
}
