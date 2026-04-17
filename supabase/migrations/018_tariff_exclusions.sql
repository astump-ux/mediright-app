-- ── Tariff Intelligence Base ─────────────────────────────────────────────────
-- Phase 1: shared knowledge base of tariff-specific rejection patterns.
-- Populated manually (source='manuell') from Alex's AXA Bescheide, auto-grown
-- via ki_extraktion after each Kassenbescheid analysis (Phase 2).
-- Phase 3: pgvector cross-user anonymized sharing.

CREATE TABLE IF NOT EXISTS tariff_exclusions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff          text        NOT NULL,            -- e.g. 'AXA', 'AXA_ActiveMe_U'
  goae_ziffer     text,                            -- GOÄ position, e.g. '31', '30a', null for structural rules
  rejection_type  text        CHECK (rejection_type IN (
                                'analog_nicht_anerkannt',  -- Analogberechnung abgelehnt
                                'med_notwendigkeit',       -- keine med. Notwendigkeit
                                'tarif_ausschluss',        -- Vertragsausschluss / Sondervereinbarung
                                'faktor',                  -- GOÄ-Faktor-Kürzung
                                'dokumentation_ausstehend' -- Unterlagen angefordert
                              )),
  rejection_reason text,                           -- human-readable reason (German)
  leistung        text,                            -- plain-language name of the service
  confidence      text        NOT NULL DEFAULT 'einzelfall'
                              CHECK (confidence IN ('einzelfall', 'haeufig', 'bestaetigt')),
  occurrence_count int        NOT NULL DEFAULT 1,
  source          text        CHECK (source IN ('manuell', 'ki_extraktion', 'tarif_wissen')),
  is_shared       bool        NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tariff_exclusions_tariff_idx ON tariff_exclusions (tariff);
CREATE INDEX IF NOT EXISTS tariff_exclusions_goae_idx   ON tariff_exclusions (goae_ziffer)
  WHERE goae_ziffer IS NOT NULL;

-- ── Seed: AXA ActiveMe-U known rejection patterns ────────────────────────────
-- Derived from actual AXA Bescheide (2026-02-23, 2026-02-24, 2026-03-26,
-- 2026-04-01) and AXA Tarifbedingungen (VG100, LE/3 Sondervereinbarung).
-- confidence='bestaetigt' = explicit contract rule or seen 3+ times
-- confidence='haeufig'    = confirmed in >=1 Bescheid, well documented

INSERT INTO tariff_exclusions
  (tariff, goae_ziffer, rejection_type, rejection_reason, leistung, confidence, occurrence_count, source)
VALUES

-- ── Confirmed from actual AXA Bescheide ───────────────────────────────────

-- GOÄ 31 analog: seen in Bescheid F69655 (26.03.2026), anschliessend abgelehnt in H25778 (01.04.2026)
(
  'AXA', '31',
  'analog_nicht_anerkannt',
  'AXA erkennt GOÄ 31 nur für die homöopathische Folgeanamnese an. Wird die Ziffer für andere Anamneseerhebungen analog berechnet, lehnt AXA ab und ersetzt durch GOÄ 1 (Beratung) zum Höchstsatz. Begründung: Für Anamneseerhebungen gibt es in der GOÄ eigene Ziffern (1, 3, 34).',
  'Anamnese (analog GOÄ 31)',
  'haeufig', 2, 'manuell'
),

-- Ernährungsberatung ohne med. Notwendigkeit: Bescheid F69655 (26.03.2026)
(
  'AXA', NULL,
  'med_notwendigkeit',
  'AXA lehnt Ernährungsberatung ab, wenn keine medizinische Notwendigkeit explizit dokumentiert ist. Erstattungsfähig nur wenn ärztlich verordnet und auf eine ICD-kodierte Diagnose zurückzuführen (z.B. E11 Diabetes, E66 Adipositas). Widerspruch mit ärztlicher Stellungnahme hat gute Aussichten.',
  'Ernährungsberatung / Ernährungstherapie',
  'haeufig', 1, 'manuell'
),

-- GOÄ 30a Patientenschulung: Bescheid H25778 (01.04.2026) — verlangt Schulungsdokumentation + Diagnose
(
  'AXA', '30a',
  'dokumentation_ausstehend',
  'AXA fordert für GOÄ 30a (strukturierte Patientenschulung) die vollständige Dokumentation der Schulung sowie die genaue ICD-Diagnose. Ohne diese Unterlagen wird die Position zurückgestellt (vorläufig abgelehnt). Nach Einreichung erneute Prüfung.',
  'Strukturierte Patientenschulung (GOÄ 30a)',
  'haeufig', 1, 'manuell'
),

-- GOÄ 30 analog: gleiche Logik wie GOÄ 31, gut dokumentiert im AXA GOÄ-Ratgeber
(
  'AXA', '30',
  'analog_nicht_anerkannt',
  'AXA erkennt GOÄ 30 (homöopathische Erstanamnese) analog nur für die Erstanamnese bei chronischen Schmerzkranken im Rahmen einer schmerztherapeutischen Behandlung durch qualifizierte Ärzte an. In allen anderen Fällen Ablehnung der Analogberechnung.',
  'Anamnese (analog GOÄ 30)',
  'haeufig', 1, 'manuell'
),

-- Labor Dokumentationsanforderung: Bescheid I054460 (23.02.2026 + 24.02.2026)
-- AXA hat systematisch alle 5 Wisplinghoff-Rechnungen (gesamt ~2.844 EUR) initial abgelehnt
-- mit identischer Begründung: Befund- und Behandlungsbericht erforderlich
(
  'AXA', NULL,
  'dokumentation_ausstehend',
  'AXA fordert für komplexe Laborleistungen standardmäßig: Befund- und Behandlungsbericht mit Anamnese und Untersuchungsergebnissen, Eigen- und Fremdlaborbefunde sowie Berichte zu bildgebenden Verfahren (MRT, Ultraschall). Ohne diese Unterlagen werden Laborabrechnungen zurückgestellt. Muster: tritt systematisch bei ersten Einreichungen größerer Laborpakete auf.',
  'Laboruntersuchungen (erweiterte Diagnostik)',
  'bestaetigt', 5, 'manuell'
),

-- Mahnungskosten: explizit ausgeschlossen (AXA Brief 01.04.2026)
(
  'AXA', NULL,
  'tarif_ausschluss',
  'Mahnungskosten sind laut AXA ausdrücklich nicht im Versicherungsschutz eingeschlossen. Einmalige Kulanzerstattung möglich, aber kein Rechtsanspruch. Empfehlung: Mahngebühren separat einreichen und auf Kulanz hinweisen.',
  'Mahnungskosten / Mahngebühren',
  'bestaetigt', 1, 'manuell'
),

-- ── Strukturelle Tarifregeln (AXA ActiveMe-U / VG100) ─────────────────────

-- GOÄ Faktor >2,3 ohne Begründung (§12 GOÄ)
(
  'AXA', NULL,
  'faktor',
  'AXA kürzt Rechnungsbeträge auf den 2,3-fachen Satz, wenn für Faktoren zwischen 2,3× und 3,5× keine schriftliche Begründung auf der Rechnung steht (§12 Abs. 3 GOÄ). Ohne Begründung: 2,3-fach ist der Regelfall. Mit Begründung: bis 3,5-fach anerkannt.',
  'GOÄ-Faktor über 2,3× ohne §12-Begründung',
  'bestaetigt', 1, 'tarif_wissen'
),

-- Ohne Gesundheitslotsen: 80% statt 100%
(
  'AXA', NULL,
  'tarif_ausschluss',
  'Ohne Gesundheitslotsen-Überweisung erstattet AXA ActiveMe-U nur 80% statt 100%. Gesundheitslotsen sind: Allgemeinmediziner, Internisten ohne Schwerpunkt, Gynäkologen, Augenärzte, Kinderärzte, Notärzte, AXA-Telefonservice. Direktgang zum Facharzt ohne Überweisung führt automatisch zu 80%-Erstattung.',
  'Direktgang Facharzt ohne Gesundheitslotsen-Überweisung',
  'bestaetigt', 1, 'tarif_wissen'
),

-- LE/3 Sondervereinbarung: Mehrleistungen ActiveMe-U vs VITAL 250 ausgeschlossen
(
  'AXA', NULL,
  'tarif_ausschluss',
  'Sondervereinbarung LE/3: Die Mehrleistungen von ActiveMe-U gegenüber dem Vorgängertarif VITAL 250 sind vom Versicherungsschutz ausgeschlossen. AXA kann Leistungen ablehnen, wenn diese über das VITAL-250-Niveau hinausgehen. Strategie: AXA muss konkret belegen dass die Leistung eine Mehrleistung gegenüber VITAL 250 ist. VITAL-250-Tarifblätter bei AXA anfordern.',
  'Mehrleistungen ActiveMe-U vs. VITAL 250 (LE/3)',
  'bestaetigt', 1, 'tarif_wissen'
),

-- Heilpraktiker Jahresgrenze 1.000 EUR
(
  'AXA', NULL,
  'tarif_ausschluss',
  'Heilpraktikerleistungen werden von AXA ActiveMe-U auf max. 1.000 EUR pro Versicherungsjahr begrenzt. Überschreitungen werden nicht erstattet. Erstattungssatz 80%.',
  'Heilpraktiker — Jahresgrenze 1.000 EUR / 80%',
  'bestaetigt', 1, 'tarif_wissen'
),

-- Sehhilfen Zweijahres-Grenze 250 EUR
(
  'AXA', NULL,
  'tarif_ausschluss',
  'Sehhilfen (Brille, Kontaktlinsen) werden von AXA auf max. 250 EUR für jeweils zwei aufeinanderfolgende Versicherungsjahre begrenzt. Erstattung 100% bis zur Grenze, danach kein Anspruch.',
  'Sehhilfen — Zweijahres-Grenze 250 EUR',
  'bestaetigt', 1, 'tarif_wissen'
);
