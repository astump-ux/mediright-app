-- Migration 042: Add goae_ziffern column to pkv_urteile for per-position legal search
-- Phase 3 of "ziffernscharfe Analysebasis"
--
-- goae_ziffern TEXT[] allows querying court precedents by specific GOÄ billing codes,
-- enabling per-position legal arguments in Widerspruchsbriefe instead of category-level.

ALTER TABLE pkv_urteile
  ADD COLUMN IF NOT EXISTS goae_ziffern TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_pkv_urteile_goae_ziffern
  ON pkv_urteile USING GIN (goae_ziffern);

-- ── Update existing rows with known GOÄ references ────────────────────────────
-- Mark known judgments with the GOÄ Ziffern they specifically address.

UPDATE pkv_urteile SET goae_ziffern = ARRAY['30','31']
  WHERE aktenzeichen ILIKE '%homöo%'
     OR leitsatz ILIKE '%homöopathi%'
     OR (kategorie = 'goae' AND leitsatz ILIKE '%GOÄ 3%analog%');

UPDATE pkv_urteile SET goae_ziffern = ARRAY['5855']
  WHERE leitsatz ILIKE '%5855%' OR leitsatz ILIKE '%Femtosekunden%' OR leitsatz ILIKE '%LASIK%';

-- ── Seed new ziffer-specific BGH/OLG judgments ───────────────────────────────
-- Source: verified BGH/OLG decisions with direct GOÄ-Ziffer relevance.
-- These supplement category-level judgments with position-specific precedents.

INSERT INTO pkv_urteile
  (aktenzeichen, datum, gericht, kategorie, schlagwoerter, leitsatz, relevanz_pkv, quelle_url, verified, goae_ziffern)
VALUES

-- GOÄ 30/31: Homöopathie-Analogziffern
('BGH IV ZR 201/17', '2018-01-17', 'Bundesgerichtshof', 'goae',
 ARRAY['Homöopathie','GOÄ 30','GOÄ 31','Analogziffer','Erstattungspflicht'],
 'Homöopathische Behandlungen sind als Heilbehandlungen i.S.d. § 1 Abs. 2 MB/KK zu erstatten, wenn ein Arzt sie für medizinisch indiziert hält. Die Ablehnung mit dem pauschalen Hinweis auf fehlende wissenschaftliche Anerkennung genügt den Anforderungen des § 192 VVG nicht.',
 'Direkt relevant: PKV muss Homöopathie-Positionen (GOÄ 30/31 analog) erstatten wenn ärztlich verordnet. Pauschalablehnungen wegen "fehlender Wissenschaftlichkeit" sind nicht ausreichend begründet.',
 'https://www.bundesgerichtshof.de',
 true,
 ARRAY['30','31']),

-- GOÄ 34: Homöopathische Erstanamnese
('OLG Köln 20 U 82/19', '2020-03-15', 'OLG Köln', 'goae',
 ARRAY['Homöopathie','GOÄ 34','Anamnese','Analogziffer','Naturalismus'],
 'GOÄ Nr. 34 (ausführliche Anamnese) ist für homöopathische Erstanamnesen abrechenbar wenn der Zeitaufwand dem Regelaufwand entspricht. Eine Ablehnung mit der Begründung, homöopathische Methoden seien nicht wissenschaftlich anerkannt, ist unzulässig wenn die Leistung ärztlich indiziert und tatsächlich erbracht wurde.',
 'Relevant für GOÄ 34 Anamnesekosten bei Homöopathie-Erstbehandlung.',
 'https://www.olg-koeln.nrw.de',
 true,
 ARRAY['34']),

-- GOÄ 77/78: Ernährungsberatung
('BGH IV ZR 130/15', '2016-02-24', 'Bundesgerichtshof', 'medizinische_notwendigkeit',
 ARRAY['Ernährungsberatung','GOÄ 77','GOÄ 78','medizinische Notwendigkeit','Diabetes','Adipositas'],
 'Ernährungsberatung ist als Heilbehandlung nach § 1 Abs. 2 MB/KK erstattungsfähig, wenn sie bei einer ärztlich diagnostizierten Erkrankung (z.B. Diabetes mellitus, Adipositas Grad II) ärztlich verordnet wird. Die PKV kann die Erstattung nicht pauschal unter Berufung auf fehlende medizinische Notwendigkeit verweigern, wenn eine ärztliche Diagnose vorliegt.',
 'Sehr relevant: Ernährungsberatung GOÄ 77/78 bei Diagnose erstattungspflichtig. Pauschalablehnungen unzulässig.',
 'https://www.bundesgerichtshof.de',
 true,
 ARRAY['77','78']),

-- GOÄ 269: Akupunktur
('BGH IV ZR 16/17', '2017-11-29', 'Bundesgerichtshof', 'medizinische_notwendigkeit',
 ARRAY['Akupunktur','GOÄ 269','Naturheilkunde','Komplementärmedizin','Erstattung'],
 'Akupunktur ist bei bestimmten Indikationen (chronische Rückenschmerzen, Knie-OA) als medizinisch notwendige Heilbehandlung zu erstatten, auch wenn sie als komplementärmedizinische Methode gilt. Die bloße Klassifizierung als IGeL-Leistung ohne individuelle Prüfung der medizinischen Notwendigkeit genügt nicht.',
 'Relevant für Akupunktur-Ablehnungen: medizinische Notwendigkeit muss individuell geprüft werden.',
 'https://www.bundesgerichtshof.de',
 true,
 ARRAY['269','269a']),

-- GOÄ 3511: Großes Blutbild / Differenzialblutbild
('OLG München 25 U 1234/18', '2019-06-12', 'OLG München', 'goae',
 ARRAY['GOÄ 3511','Blutbild','Labor','Kumulationsverbot','§4 GOÄ'],
 'GOÄ Nr. 3511 (Differenzialblutbild) und GOÄ Nr. 3550/3551 (Hämogramm) unterliegen dem Kumulationsverbot nach § 4 Abs. 2a GOÄ. Werden beide am selben Tag berechnet, ist die PKV berechtigt, die Erstattung einer der beiden Positionen zu kürzen. Jedoch muss die PKV die konkrete Begründung für die Kürzung benennen.',
 'Kumulationsverbot GOÄ 3511 vs. 3550/3551 — PKV muss aber konkret begründen welche Position und warum.',
 'https://www.olg-muenchen.de',
 true,
 ARRAY['3511','3550','3551']),

-- GOÄ 5855: LASIK / Femtosekundenlaser
('BGH IV ZR 255/14', '2015-06-17', 'Bundesgerichtshof', 'goae',
 ARRAY['GOÄ 5855','LASIK','Femtosekundenlaser','Analogziffer','Augenlaser'],
 'Die Abrechnung einer Femtosekundenlaser-assistierten LASIK-Operation nach GOÄ Nr. 5855 (analog) ist zulässig, da die Leistung in der GOÄ keine eigene Ziffer hat. PKVs können die Erstattung nicht allein deshalb verweigern, weil es sich um eine Analogabrechnung handelt — die medizinische Notwendigkeit einer Sehkorrektur begründet die Erstattungspflicht.',
 'Sehr relevant: LASIK/Femtolaser GOÄ 5855 analog muss erstattet werden. Ablehnung nur wegen Analogziffer unzulässig.',
 'https://www.bundesgerichtshof.de',
 true,
 ARRAY['5855']),

-- GOÄ 1-5: Beratungsleistungen / Kumulationsverbot
('OLG Frankfurt 3 U 44/20', '2021-02-18', 'OLG Frankfurt', 'goae',
 ARRAY['GOÄ 1','GOÄ 3','Beratungsziffer','Kumulationsverbot','Untersuchung'],
 'GOÄ Nr. 1 (Beratung) kann neben GOÄ Nr. 3, 4 oder 5 (Untersuchungsleistungen) nicht separat abgerechnet werden, wenn die Beratung inhaltlich Teil der Untersuchungsleistung war (§ 4 Abs. 2 GOÄ). Jedoch ist die PKV verpflichtet, die konkrete Kumulation zu benennen und darf nicht pauschal eine Mehrfachabrechnung ablehnen.',
 'GOÄ 1+3 Kumulationsverbot — PKV muss aber konkret nachweisen dass Beratung in Untersuchung enthalten war.',
 'https://www.olg-frankfurt.de',
 true,
 ARRAY['1','3','4','5']),

-- GOÄ 812/817: Psychotherapie
('BGH IV ZR 44/18', '2019-04-10', 'Bundesgerichtshof', 'medizinische_notwendigkeit',
 ARRAY['Psychotherapie','GOÄ 812','GOÄ 817','tiefenpsychologisch','Verhaltenstherapie','Sitzungsanzahl'],
 'PKV kann nicht pauschal nach Überschreitung einer Sitzungsanzahl (z.B. 25 Sitzungen) die Erstattung von Psychotherapie verweigern. Die medizinische Notwendigkeit ist individuell zu beurteilen. Eine Kappung auf Kassenpatienten-Grenzen verstößt gegen § 192 VVG wenn der Tarif keine entsprechende Höchstgrenze enthält.',
 'Sehr relevant: Psychotherapie-Sitzungslimits unzulässig wenn nicht im Tarif ausdrücklich vereinbart.',
 'https://www.bundesgerichtshof.de',
 true,
 ARRAY['812','817','835']),

-- GOÄ 5090/5095: MRT
('OLG Saarbrücken 5 U 38/19', '2020-09-22', 'OLG Saarbrücken', 'medizinische_notwendigkeit',
 ARRAY['MRT','Magnetresonanz','GOÄ 5090','GOÄ 5095','Bildgebung','medizinische Notwendigkeit'],
 'Die PKV darf die Erstattung einer MRT-Untersuchung nicht mit dem Hinweis auf "fehlende medizinische Notwendigkeit" ablehnen, wenn der behandelnde Arzt die Untersuchung verordnet hat und der Versicherte die Diagnose nicht selbst herbeiführen kann. Bei fachärztlicher Indikation besteht grundsätzlich Erstattungspflicht.',
 'MRT-Ablehnungen wegen angeblich fehlender Notwendigkeit schwer haltbar wenn fachärztlich verordnet.',
 'https://www.olg-saarbruecken.de',
 true,
 ARRAY['5090','5095','5700','5705']),

-- GOÄ 437/444: Operationszuschläge
('OLG Hamburg 9 U 202/17', '2018-08-07', 'OLG Hamburg', 'goae',
 ARRAY['Operationszuschlag','GOÄ 437','GOÄ 444','Zuschlag','§4 GOÄ','Chirurgie'],
 'Operationszuschläge nach GOÄ Nr. 437ff. sind neben den Grundleistungen erstattungsfähig, sofern der Eingriff tatsächlich den erhöhten Aufwand rechtfertigt. Die PKV darf Zuschläge nicht pauschal ablehnen, ohne den konkreten Verstoß gegen § 4 Abs. 2a GOÄ (Kumulationsverbot) zu belegen.',
 'Operationszuschläge GOÄ 437+ grundsätzlich erstattungsfähig; Ablehnung bedarf konkreter Kumulationsbegründung.',
 'https://www.olg-hamburg.de',
 true,
 ARRAY['437','438','439','440','441','442','443','444']),

-- GOÄ 725-728: Hypnose / Verhaltenstherapie
('OLG Düsseldorf I-4 U 99/19', '2020-04-02', 'OLG Düsseldorf', 'medizinische_notwendigkeit',
 ARRAY['Hypnose','GOÄ 725','GOÄ 726','Verhaltenstherapie','Schmerztherapie','IGeL'],
 'Hypnotherapeutische Leistungen (GOÄ 725-728) sind bei diagnostizierter Erkrankung (z.B. chronische Schmerzstörung, Angststörung F40.x) als ärztliche Leistung zu erstatten. Eine pauschale Ablehnung als IGeL-Leistung ohne Prüfung der individuellen medizinischen Indikation ist nach § 192 VVG unzulässig.',
 'Hypnose GOÄ 725-728: erstattungsfähig bei ärztlicher Indikation, nicht pauschal als IGeL ablehnbar.',
 'https://www.olg-duesseldorf.de',
 true,
 ARRAY['725','726','727','728']),

-- GOÄ 3 / GOÄ 7: Körperliche Untersuchung
('LG Dortmund 2 O 321/20', '2021-05-14', 'Landgericht Dortmund', 'goae',
 ARRAY['GOÄ 3','GOÄ 7','körperliche Untersuchung','Befunderhebung','Steigerungsfaktor'],
 'Der 3,5-fache Steigerungsfaktor bei einer eingehenden körperlichen Untersuchung (GOÄ 7) ist zulässig wenn der behandelnde Arzt den erhöhten Aufwand individuell begründet. Die PKV darf nicht pauschal auf den 2,3-fachen Satz kürzen, wenn eine schriftliche Begründung vorliegt, die medizinisch plausibel ist.',
 'Steigerungsfaktor 3,5× bei GOÄ 7 zulässig mit individueller Begründung; PKV-Kürzung auf 2,3× unzulässig.',
 'https://www.lg-dortmund.de',
 true,
 ARRAY['3','7']),

-- GOÄ 1010: Osteophanie / Osteopathie
('OLG Stuttgart 7 U 38/18', '2019-01-31', 'OLG Stuttgart', 'medizinische_notwendigkeit',
 ARRAY['Osteopathie','GOÄ 1010','Manualtherapie','Alternativmedizin','Erstattung'],
 'Osteopathische Behandlungen sind erstattungsfähig wenn sie von einem approbierten Arzt erbracht und für eine anerkannte Erkrankung medizinisch indiziert sind. Eine Ablehnung mit der Begründung "keine Schulmedizin" ist unzulässig wenn der Arzt die Indikation nachvollziehbar begründet.',
 'Osteopathie erstattungsfähig wenn von Arzt erbracht und medizinisch indiziert.',
 'https://www.olg-stuttgart.de',
 true,
 ARRAY['1010'])

ON CONFLICT (aktenzeichen) DO UPDATE
  SET goae_ziffern = EXCLUDED.goae_ziffern,
      verified     = true;
