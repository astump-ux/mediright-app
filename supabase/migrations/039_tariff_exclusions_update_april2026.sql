-- ── Tariff Intelligence Base Update — April 2026 ─────────────────────────────
-- Neue Ablehnungsmuster aus AXA Medizinischem Beratungsdienst 27.04.2026 (H25778)
-- MDK hat alle 6 Rechnungen geprüft: Herrero (774,98€), Wisplinghoff (5 Rechnungen)
-- Gesamtablehnung: 981,36 EUR (131,38 + 191,71 + 595,90 + 62,37)
-- Diese Muster sind jetzt offiziell durch AXA-MDK bestätigt.

-- ── GOÄ-Positionen aus Herrero-Rechnung ──────────────────────────────────────

-- GOÄ 3561 (HbA1c): abgelehnt ohne Diabetes-Nachweis
INSERT INTO tariff_exclusions
  (tariff, goae_ziffer, rejection_type, rejection_reason, leistung, confidence, occurrence_count, source)
VALUES (
  'AXA', '3561',
  'med_notwendigkeit',
  'AXA lehnt HbA1c (GOÄ 3561) ab wenn kein erhöhter Nüchternblutzucker oder Diabetes mellitus dokumentiert ist. Keine Erstattung als Screeninguntersuchung ohne spezifische Indikation. Gegenargument: Wenn Diabetes-Verdacht durch andere Laborwerte besteht, Diagnose explizit auf Rechnung dokumentieren lassen.',
  'HbA1c-Bestimmung (GOÄ 3561)',
  'haeufig', 1, 'manuell'
),

-- GOÄ 30 (Analog Naturheilkunde): Schriftliche Anamnese + Repertorisation Pflicht
(
  'AXA', '30',
  'dokumentation_ausstehend',
  'AXA erkennt GOÄ 30 auch bei analoger Abrechnung als naturheilkundliche integrativ-medizinische Erstanamnese nur an, wenn schriftliche Anamnese und Repertorisation vorgelegt wird. Ohne Nachweis wird auf GOÄ 3 (Beratungsgespräch) reduziert. Strategie: Behandler muss schriftliche Anamnese + Repertorisation nachreichen.',
  'Naturheilkundliche Erstanamnese (analog GOÄ 30)',
  'haeufig', 2, 'manuell'
),

-- GOÄ 75 (Schriftlicher Befundbericht): Teil der Beratungsleistung
(
  'AXA', '75',
  'analog_nicht_anerkannt',
  'AXA lehnt GOÄ 75 (schriftlicher Befundbericht) als eigenständige Position ab. Begründung: Befundberichte sind laut AXA Teil der bereits abgegoltenen Beratungsleistung und nicht separat abrechenbar. Gegenargument nur bei nachweisbarem eigenständigem Aufwand (externes Gutachten, gerichtlich angefordert).',
  'Schriftlicher Befundbericht (GOÄ 75)',
  'haeufig', 1, 'manuell'
),

-- ── Labor-Ablehnungen (Wisplinghoff / Stufendiagnostik) ──────────────────────

-- GOÄ A3744 (Antioxidativer/Oxidativer Status): grundsätzlich keine Indikation
(
  'AXA', 'A3744',
  'med_notwendigkeit',
  'AXA lehnt Bestimmung von antioxidativem und oxidativem Status (GOÄ A3744) grundsätzlich ab. Begründung MDK: keine validen Labormarker zur Feststellung von oxidativem/nitrosativem Stress bzw. Mitochondrienaktivität verfügbar — Untersuchungen daher nicht therapierelevant aussagefähig und nicht medizinisch indiziert. Kein Widerspruchspotenzial.',
  'Antioxidativer/Oxidativer Status (GOÄ A3744)',
  'bestaetigt', 2, 'manuell'
),

-- GOÄ A3767 (IFN-gamma): keine therapeutischen Konsequenzen
(
  'AXA', 'A3767',
  'med_notwendigkeit',
  'AXA lehnt IFN-gamma-Bestimmung (GOÄ A3767) ab. MDK-Begründung: keine therapeutischen Konsequenzen, die nicht ohne diese Untersuchung hätten durchgeführt werden können. Position ist nur erstattungsfähig wenn konkrete Therapieentscheidung direkt davon abhängt (z.B. Immuntherapie-Monitoring).',
  'IFN-gamma (GOÄ A3767)',
  'haeufig', 1, 'manuell'
),

-- GOÄ A3891 (Mastzelltryptase): nur mit spezifischer Indikation
(
  'AXA', 'A3891',
  'med_notwendigkeit',
  'AXA lehnt Mastzelltryptase (GOÄ A3891) ab wenn keine spezifische klinische Indikation besteht (z.B. Verdacht auf Mastozytose, Anaphylaxie-Abklärung). Wiederholte Bestimmung wird ebenfalls abgelehnt. Gegenargument: Klinische Symptomatik (Flush, Urtikaria, Anaphylaxie) muss explizit dokumentiert sein.',
  'Mastzelltryptase (GOÄ A3891)',
  'haeufig', 2, 'manuell'
),

-- GOÄ 4062 (Holotranscobalamin / DAO): unterschiedliche Ablehnungsgründe
(
  'AXA', '4062',
  'med_notwendigkeit',
  'AXA lehnt Holotranscobalamin (GOÄ 4062 als HoloTC) ab wenn keine Auffälligkeiten im Basislabor vorliegen. DAO-Bestimmung (GOÄ 4062 als DAO) nur erstattungsfähig vor oder nach histaminfreier Diät — ohne diesen Kontext keine Indikation. Diagnose und Therapiekontext müssen explizit auf Anforderungsschein dokumentiert sein.',
  'Holotranscobalamin / DAO (GOÄ 4062)',
  'haeufig', 2, 'manuell'
),

-- GOÄ 4134/4135 (Selen, Zink): Spurenelemente nur mit Verdachtsdiagnose
(
  'AXA', '4134',
  'med_notwendigkeit',
  'AXA lehnt Selen (GOÄ 4134) und Zink (GOÄ 4135) ohne spezifische Verdachtsdiagnose ab. Auch wenn Immunglobulinbestimmung auffällig ist, reicht das laut AXA-MDK nicht als Indikation für Spurenelement-Bestimmung. Gegenargument: expliziter klinischer Mangelzustand oder Resorptionsstörung muss dokumentiert sein.',
  'Selen-Bestimmung (GOÄ 4134)',
  'haeufig', 1, 'manuell'
),
(
  'AXA', '4135',
  'med_notwendigkeit',
  'AXA lehnt Zink (GOÄ 4135) ohne spezifische Verdachtsdiagnose ab (Mangel-/Resorptionsstörung). Gleiche Logik wie Selen (4134).',
  'Zink-Bestimmung (GOÄ 4135)',
  'haeufig', 1, 'manuell'
),

-- GOÄ 4140 (Folsäure): nur bei Basislabor-Auffälligkeiten
(
  'AXA', '4140',
  'med_notwendigkeit',
  'AXA lehnt Folsäure-Bestimmung (GOÄ 4140) ab wenn keine Auffälligkeiten im Basislabor vorliegen die eine Folsäure-Bestimmung nahelegen (z.B. Makrozytose, Anämie).',
  'Folsäure (GOÄ 4140)',
  'haeufig', 1, 'manuell'
),

-- Stufendiagnostik-Prinzip: allgemeines Ablehnungsmuster
(
  'AXA', NULL,
  'med_notwendigkeit',
  'AXA-MDK lehnt Laboruntersuchungen ab wenn keine Stufendiagnostik eingehalten wird: d.h. spezialisierte/teure Tests (Erregerserologie, Virusantikörper) werden abgelehnt wenn nicht zuvor ein auffälliges Basislabor vorliegt das diese Untersuchung begründet. Strategie: Anforderungsschein muss Vorbefunde und klinische Verdachtsdiagnose enthalten.',
  'Laboruntersuchungen ohne Stufendiagnostik',
  'bestaetigt', 3, 'manuell'
),

-- Erregerserologie ohne klinische Symptomatik: Campylobacter, Chlamydien, Helicobacter etc.
(
  'AXA', NULL,
  'med_notwendigkeit',
  'AXA lehnt Erregerserologie (Campylobacter, Chlamydien, Helicobacter, Dengue, EBV, CMV) ab wenn keine klinische Symptomatik vorliegt die diese Erreger nahelegt und keine Stufendiagnostik eingehalten wurde. Helicobacter-IgG im Blut wird grundsätzlich abgelehnt: zeigt nur Kontakt, keine therapiebedürftige Erkrankung. Empfehlung: Anforderung nur bei konkreter klinischer Indikation mit expliziter Diagnose.',
  'Erregerserologie ohne klinische Indikation (Campylobacter, Helicobacter, Dengue, EBV, CMV)',
  'bestaetigt', 4, 'manuell'
);

-- ── Occurrence Count-Update für bereits bekannte Muster ──────────────────────
-- GOÄ 30 analog: tritt jetzt zum zweiten bestätigten Mal auf
UPDATE tariff_exclusions
SET occurrence_count = 2,
    confidence = 'haeufig',
    updated_at = now()
WHERE tariff = 'AXA'
  AND goae_ziffer = '30'
  AND rejection_type = 'analog_nicht_anerkannt';
