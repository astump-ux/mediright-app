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
import { searchPkvPrecedents, searchPkvPrecedentsByZiffer } from './legal-search'
import { getOmbudsmannContext } from './ombudsmann-context'
import { getGoaeContext } from './goae-context'
import { getRejectionPatternContext } from './rejection-pattern-context'

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
    lines.push('Ablehnungsgründe der Kasse (Zusammenfassung):')
    for (const g of ablehnungsgruende) lines.push(`  - ${g}`)
  }

  // ── Per-Position Breakdown (Phase 1: ziffer-scharfe Ablehnungsanalyse) ──────
  // This is the critical enrichment: each rejected/reduced position with its specific
  // AXA reasoning, aktionstyp, and estimated success probability — the AI uses this
  // to generate per-position arguments in the Widerspruchsbrief instead of generic text.
  type RawKassePos = {
    ziffer?: string; bezeichnung?: string; betragEingereicht?: number; betragErstattet?: number
    status?: string; ablehnungsgrund?: string | null; ablehnungsbegruendung?: string | null
    aktionstyp?: string | null; widerspruchWahrscheinlichkeit?: number | null; confidence?: number | null
  }
  const kasseRechnungen = (kasseAnalyse?.rechnungen as Array<{ arztName?: string | null; positionen?: RawKassePos[] }> | null) ?? []
  const abgelehntePositionen: Array<{ arzt: string; pos: RawKassePos }> = []
  for (const rechnung of kasseRechnungen) {
    for (const pos of rechnung.positionen ?? []) {
      if (pos.status === 'abgelehnt' || pos.status === 'gekuerzt') {
        abgelehntePositionen.push({ arzt: rechnung.arztName ?? 'Unbekannt', pos })
      }
    }
  }

  if (abgelehntePositionen.length > 0) {
    lines.push('')
    lines.push('⚡ ABGELEHNTE POSITIONEN — ZIFFERNSCHARFE ANALYSE (für Widerspruchsbrief verwenden):')
    lines.push('─────────────────────────────────────────────────────────')
    for (const { arzt, pos } of abgelehntePositionen) {
      const ziffer      = pos.ziffer ?? '?'
      const bezeichnung = pos.bezeichnung ?? ''
      const eingereicht = pos.betragEingereicht != null ? `${pos.betragEingereicht.toFixed(2)} €` : '?'
      const erstattet   = pos.betragErstattet != null   ? `${pos.betragErstattet.toFixed(2)} €`   : '?'
      const status      = pos.status === 'abgelehnt' ? '✗ ABGELEHNT' : '⚠ GEKÜRZT'
      const aktion      = pos.aktionstyp === 'widerspruch_kasse' ? '→ Widerspruch bei Kasse'
                        : pos.aktionstyp === 'korrektur_arzt'    ? '→ Korrektur beim Arzt'
                        : '→ Aktion unklar'
      const prob        = pos.widerspruchWahrscheinlichkeit != null ? `Erfolgschance: ${pos.widerspruchWahrscheinlichkeit}%` : ''

      lines.push(`GOÄ ${ziffer} | ${bezeichnung} | Arzt: ${arzt}`)
      lines.push(`  Status: ${status} | Eingereicht: ${eingereicht} | Erstattet: ${erstattet}`)
      lines.push(`  Aktion: ${aktion}${prob ? ' | ' + prob : ''}`)
      if (pos.ablehnungsgrund) {
        lines.push(`  AXA-Ablehnungsgrund: "${pos.ablehnungsgrund}"`)
      }
      if (pos.ablehnungsbegruendung) {
        lines.push(`  AXA-Begründung (detailliert): "${pos.ablehnungsbegruendung}"`)
      }
      lines.push('')
    }
    lines.push('─────────────────────────────────────────────────────────')
    lines.push('⚡ ANWEISUNG: Generiere für JEDE oben aufgeführte Position einen eigenen Absatz im')
    lines.push('   Widerspruchsbrief. Zitiere AXA\'s eigene Begründung und konterargumentiere spezifisch.')
    lines.push('')
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

    // ── Phase 2: GOÄ-Ziffer × Vertragsklausel-Cross-Reference ─────────────────
    // goae_ausschluesse links specific GOÄ codes to contract clauses that restrict them.
    // Cross-reference with abgelehnte Positionen to surface contract-based arguments.
    type GoaeAusschluss = {
      ziffer_pattern?: string; ziffern_liste?: string[]; bezeichnung?: string
      klausel?: string; erstattungsrate_pct?: number; einschraenkung?: string
      angreifbar_wenn?: string; quelle?: string
    }
    const goaeAusschluesse = tarifProfilJson.goae_ausschluesse as GoaeAusschluss[] | undefined
    if (Array.isArray(goaeAusschluesse) && goaeAusschluesse.length > 0 && abgelehntePositionen.length > 0) {
      const abgelehnteZiffern = new Set(abgelehntePositionen.map(({ pos }) => String(pos.ziffer ?? '')))
      const treffer: Array<{ ausschluss: GoaeAusschluss; matchedZiffer: string }> = []

      for (const ausschluss of goaeAusschluesse) {
        const ziffernListe = ausschluss.ziffern_liste ?? []
        for (const z of ziffernListe) {
          if (abgelehnteZiffern.has(String(z))) {
            treffer.push({ ausschluss, matchedZiffer: String(z) })
            break
          }
        }
        // Also check ziffer_pattern as range (e.g. "725-728")
        if (ausschluss.ziffer_pattern && treffer.every(t => t.ausschluss !== ausschluss)) {
          const rangeMatch = ausschluss.ziffer_pattern.match(/^(\d+)-(\d+)$/)
          if (rangeMatch) {
            const [lo, hi] = [parseInt(rangeMatch[1]), parseInt(rangeMatch[2])]
            for (const z of abgelehnteZiffern) {
              const n = parseInt(z)
              if (!isNaN(n) && n >= lo && n <= hi) {
                treffer.push({ ausschluss, matchedZiffer: z })
                break
              }
            }
          }
        }
      }

      if (treffer.length > 0) {
        lines.push('VERTRAGSBASIERTE ZIFFERN-PRÜFUNG (Phase 2 — Ausschlüsse vs. abgelehnte Positionen):')
        lines.push('⚡ Diese abgelehnten GOÄ-Ziffern sind direkt durch Vertragsklauseln betroffen:')
        for (const { ausschluss, matchedZiffer } of treffer) {
          const erstattung = ausschluss.erstattungsrate_pct != null
            ? `Erstattung laut Vertrag: ${ausschluss.erstattungsrate_pct}%`
            : ''
          lines.push(`  GOÄ ${matchedZiffer} (${ausschluss.bezeichnung ?? ''}) → ${ausschluss.klausel ?? '?'}`)
          if (erstattung)                lines.push(`    ${erstattung}`)
          if (ausschluss.einschraenkung) lines.push(`    Einschränkung: ${ausschluss.einschraenkung}`)
          if (ausschluss.angreifbar_wenn) lines.push(`    ⚡ Angreifbar wenn: ${ausschluss.angreifbar_wenn}`)
          if (ausschluss.quelle)         lines.push(`    Quelle: ${ausschluss.quelle}`)
        }
        lines.push('⚡ ANWEISUNG: Nutze die obigen Vertragsklauseln als Grundlage für die rechtliche Argumentation.')
        lines.push('   Wenn "Angreifbar wenn" zutrifft, argumentiere explizit gegen den Ausschluss.')
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

  // ── Section 6: Relevante Rechtsprechung ────────────────────────────────────
  // Two-axis search: (a) by rejection category (existing) + (b) by specific GOÄ ziffern (Phase 3)
  // This ensures we find both general PKV case law AND position-specific BGH/OLG precedents.
  const zifferSearchTargets = abgelehntePositionen
    .filter(({ pos }) => pos.aktionstyp === 'widerspruch_kasse')
    .map(({ pos }) => String(pos.ziffer ?? ''))
    .filter(Boolean)

  await Promise.all([
    ablehnungsgruende.length > 0
      ? searchPkvPrecedents(ablehnungsgruende)
          .then(block => { if (block) lines.push(block) })
          .catch(() => {})
      : Promise.resolve(),

    zifferSearchTargets.length > 0
      ? searchPkvPrecedentsByZiffer(zifferSearchTargets)
          .then(block => { if (block) lines.push(block) })
          .catch(() => {})
      : Promise.resolve(),
  ])

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

  // ── Section 8: GOÄ-Positionsdaten (goae_positionen) ───────────────────────
  // Reichert die Fallakte mit konkreten GOÄ-Daten an: Faktortyp, Schwellenwert,
  // Höchstsatz, §12-Begründungspflicht und typische PKV-Ablehnungsgründe.
  // Aktiviert wenn GOÄ-Ziffern in der Rechnung oder Ablehnungstext erkennbar sind.
  try {
    // Sammle explizite Ziffern aus den strukturierten Rechnungsdaten + abgelehnten Positionen
    const explicitZiffern: string[] = []
    for (const v of vorgaenge) {
      const positionen = (v.goae_positionen as Array<{ ziffer: string }> | null) ?? []
      for (const p of positionen) {
        if (p.ziffer) explicitZiffern.push(String(p.ziffer))
      }
    }
    // Also include abgelehnte Ziffern from kasse_analyse for targeted GOÄ reference lookup
    for (const { pos } of abgelehntePositionen) {
      if (pos.ziffer) explicitZiffern.push(String(pos.ziffer))
    }

    // Rechnungstext + Ablehnungstext für Ziffer-Erkennung aus Freitext
    const rechnungsText = vorgaenge.map(v => {
      const a = v.claude_analyse as Record<string, unknown> | null
      return [v.arzt_name ?? '', a?.zusammenfassung ?? ''].join(' ')
    }).join(' ')
    const ablehnungsText = ablehnungsgruende.join(' ')

    const goaeBlock = await getGoaeContext(rechnungsText, ablehnungsText, explicitZiffern)
    if (goaeBlock) lines.push(goaeBlock)
  } catch { /* goae_positionen Tabelle noch nicht verfügbar — kein Fehler */ }

  // ── Section 9: Ablehnungsmuster — Per-User-History + Cross-User-Community ──
  // Zweistufig:
  //   (a) Hat dieser User ähnliche Ablehnungen schon erlebt? Was war das Ergebnis?
  //   (b) Wie häufig tritt dieses Muster community-weit auf? Wie ist die Erfolgsquote?
  // Neue User ohne eigene History profitieren sofort von den Community-Daten.
  if (kasse?.user_id && ablehnungsgruende.length > 0) {
    try {
      const patternBlock = await getRejectionPatternContext(
        kasse.user_id,
        kassenabrechnungenId,
        ablehnungsgruende
      )
      if (patternBlock) lines.push(patternBlock)
    } catch { /* pkv_ablehnungsmuster Tabelle noch nicht verfügbar — kein Fehler */ }
  }

  lines.push('═══════════════════════════════════════════════════════')
  return lines.join('\n')
}
