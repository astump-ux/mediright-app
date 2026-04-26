-- Migration 034: goae_positionen — Kuratierte GOÄ-Streitfall-Datenbank
--
-- Quelle: GOÄ 1982 (zuletzt geändert 1996), Bundesärzteblatt-Kommentar,
--         PKV-Rechtsprechung, Ombudsmann-Fallberichte (Stand: April 2026)
--
-- Enthält NICHT alle 2.500 Positionen — nur die ~80 für PKV-Streitfälle
-- relevantesten Ziffern: häufig abgelehnte, hoch umstrittene und
-- analogberechnete Positionen.
--
-- Faktorstufen (§5 GOÄ):
--   Normalleistungen: Einfach = 1.0x | Schwellenwert = 2.3x | Max = 3.5x
--   Technische L.:   Einfach = 1.0x | Schwellenwert = 1.8x | Max = 2.5x
--   Laborleistungen: Einfach = 1.0x | Schwellenwert = 1.15x | Max = 1.3x
--
-- Punktwert GOÄ: 0.0582873 EUR (Arzt), 0.072917 EUR (Labor M I)
-- Formel Honorar: Punktzahl × Punktwert × Faktor

CREATE TABLE IF NOT EXISTS goae_positionen (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ziffer              text NOT NULL UNIQUE,   -- z.B. "1", "5", "34", "5855"
  kurzbezeichnung     text NOT NULL,
  leistungsbeschreibung text,
  abschnitt           text,                   -- A, B, C, D, E, F, G, H, K, L, M, O
  punktzahl           numeric(10,2),
  faktortyp           text NOT NULL           -- 'normal' | 'technisch' | 'labor'
                      CHECK (faktortyp IN ('normal','technisch','labor')),
  schwellenwert       numeric(4,2) NOT NULL,  -- 2.3 / 1.8 / 1.15
  hoechstsatz         numeric(4,2) NOT NULL,  -- 3.5 / 2.5 / 1.3
  -- PKV-spezifisch
  analog_ziffer       text,                   -- falls Analogabrechnung nach §6 GOÄ
  begruendungspflicht boolean NOT NULL DEFAULT false, -- §12 Abs.3 bei Überschreitung
  pkv_streitpotenzial text NOT NULL           -- 'hoch' | 'mittel' | 'niedrig'
                      CHECK (pkv_streitpotenzial IN ('hoch','mittel','niedrig')),
  typische_ablehnung  text,                   -- Typischer AXA/PKV-Ablehnungsgrund
  ki_hinweis          text,                   -- Handlungsempfehlung für die KI
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goae_pos_ziffer_idx ON goae_positionen (ziffer);
CREATE INDEX IF NOT EXISTS goae_pos_streit_idx ON goae_positionen (pkv_streitpotenzial);
CREATE INDEX IF NOT EXISTS goae_pos_abschnitt_idx ON goae_positionen (abschnitt);

ALTER TABLE goae_positionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goae_pos_read" ON goae_positionen FOR SELECT TO authenticated USING (true);
CREATE POLICY "goae_pos_admin" ON goae_positionen FOR ALL TO service_role USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Häufig strittige GOÄ-Positionen
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO goae_positionen
  (ziffer, kurzbezeichnung, leistungsbeschreibung, abschnitt, punktzahl, faktortyp,
   schwellenwert, hoechstsatz, analog_ziffer, begruendungspflicht,
   pkv_streitpotenzial, typische_ablehnung, ki_hinweis)
VALUES

-- ── ABSCHNITT A: Beratung und Untersuchung ───────────────────────────────────

('1', 'Beratung', 'Beratung, auch mittels Fernsprecher', 'A', 80, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten abgelehnt; Faktor >2.3x gelegentlich ohne Begruendung beanstandet',
 'Standard-Beratungsziffer. Haeufig kumuliert mit GOAe 5 oder 6. PKV akzeptiert i.d.R. problemlos.'),

('2', 'Schriftliche Auskunft', 'Schriftliche Auskunft oder Gutachten', 'A', 150, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten Streitthema',
 'Fuer aerztliche Stellungnahmen an PKV relevant. PKV kann Gutachten anfordern.'),

('3', 'Eingehende Beratung', 'Eingehende Beratung (mind. 10 Min.), auch Fernsprecher', 'A', 150, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Streit um Zeitnachweis bei telefonischer Beratung',
 'Zeitdauer (mind. 10 Min.) muss dokumentiert sein. Bei Ablehnung: Arzt-Dokumentation anfordern.'),

('4', 'Dringende Beratung', 'Dringende Beratung außerhalb der Sprechstunde', 'A', 200, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten abgelehnt',
 'Ausserhalb der Sprechstunde; Zeitnachweis sinnvoll.'),

('5', 'Symptombezogene Untersuchung', 'Symptombezogene Untersuchung', 'A', 180, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten abgelehnt; Faktor-Streit moeglich',
 'Haeufig abgerechnete Basisziffer. Kumulationsverbot mit GOAe 6 im selben Quartal beachten.'),

('6', 'Vollstaendige Untersuchung', 'Vollstaendige koerperliche Untersuchung (ein Organsystem)', 'A', 430, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'PKV prueft Kumulierung mit GOAe 5; Faktor >2.3x ohne Begruendung',
 'Nur einmal pro Quartal je Organsystem abrechenbar. Haeufiger Ablehnungsgrund: Doppelabrechnung mit GOAe 5.'),

('7', 'Untersuchung mehrerer Organsysteme', 'Vollstaendige koerperliche Untersuchung mehrerer Organsysteme', 'A', 760, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'PKV prueft ob tatsaechlich mehrere Organsysteme untersucht wurden',
 'Erfordert Dokumentation der untersuchten Organsysteme. Aufwendigere Alternative zu GOAe 6.'),

('8', 'Untersuchung eines Neugeborenen', 'Untersuchung eines Neugeborenen', 'A', 510, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten Streitthema',
 'Spezialziffer Paediatrie. I.d.R. unproblematisch.'),

('15', 'Einleitung intensiver Massnahmen', 'Einleitung intensiver Behandlungsmassnahmen bei lebensbedrohlichen Erkrankungen', 'A', 280, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten Streitthema', NULL),

('22', 'Chemotherapie-Einleitung', 'Planung und Einleitung einer Chemotherapie', 'A', 400, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten abgelehnt', NULL),

('26', 'Telefonische Beratung (Facharzt)', 'Erörterung (mind. 10 Min.) mit Arzt bzgl. Befunderhebung', 'A', 150, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Zeitnachweis gelegentlich beanstandet', NULL),

('34', 'Eroerterung', 'Erörterung der Auswirkungen einer Erkrankung (mind. 20 Min.)', 'A', 350, 'normal', 2.3, 3.5,
 NULL, true, 'mittel',
 'PKV beanstandet fehlende Zeitdokumentation oder Kumulierung mit GOAe 3',
 'Zeitminimum 20 Minuten zwingend dokumentieren. Nicht mit GOAe 3 an gleichem Tag kumulierbar.'),

-- ── ABSCHNITT A: Zuschlaege ──────────────────────────────────────────────────

('A', 'Zuschlag fuer fruehere Behandlung', 'Zuschlag fuer Behandlung zwischen 20-22 Uhr oder 6-8 Uhr', 'B', 330, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten Streitthema; Zeitnachweis wichtig', NULL),

('B', 'Nachtzuschlag', 'Zuschlag fuer Behandlung zwischen 22-6 Uhr', 'B', 660, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Zeitnachweis muss vorliegen', NULL),

-- ── ABSCHNITT C: Narkoseleistungen ──────────────────────────────────────────

('451', 'Narkose bis 30 Min.', 'Inhalationsnarkose bis 30 Minuten Narkosedauer', 'C', 700, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'Selten Streitthema', NULL),

('462', 'Narkose bis 2 Std.', 'Inhalationsnarkose bis 2 Stunden Narkosedauer', 'C', 1750, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'Selten Streitthema', NULL),

-- ── ABSCHNITT E: Physikalisch-medizinische Leistungen ───────────────────────

('505', 'Massage einer Koerperregion', 'Massage einer Koerperregion (mind. 5 Min.)', 'E', 100, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('506', 'Massage mehrerer Koerperregionen', 'Massage mehrerer Koerperregionen', 'E', 120, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('514', 'Krankengymnastik', 'Krankengymnastik als Einzel-Behandlung (mind. 20 Min.)', 'E', 230, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('523', 'Krankengymnastik im Bewegungsbad', 'Krankengymnastik im Bewegungsbad als Einzel-Behandlung', 'E', 350, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'Selten Streitthema', NULL),

('558', 'Akupunktur', 'Akupunktur-Behandlung (mind. 20 Min.)', 'E', 300, 'normal', 2.3, 3.5,
 NULL, false, 'hoch',
 'PKV lehnt haeufig ab: nicht anerkannte Methode, nicht Teil des Leistungskatalogs',
 'Akupunktur: PKV-Erstattung haeufig ausgeschlossen oder eingeschraenkt. AVB pruefen: enthaelt Tarif explizit Akupunktur? BGH IV ZR 131/05: Med. Notwendigkeit ex-ante massgebend. Wenn Arzt-Dokumentation vorliegt: Widerspruch lohnt sich.'),

('565', 'Psychotherapeutische Behandlung', 'Psychotherapeutische Behandlung (mind. 50 Min.)', 'F', 1750, 'normal', 2.3, 3.5,
 NULL, true, 'hoch',
 'Haeufige Ablehnung: Genehmigungsvorbehalt, Richtlinien-Psychotherapie vs. aerztliche PT',
 'Oft Vorgenehmigung der PKV erforderlich. Haeufiger Streitpunkt: aerztliche PT (GOAe 565) vs. Richtlinien-PT. Ohne Genehmigung: Widerspruch mit Begruendung warum Notfall/keine Genehmigungsmoeglichkeit bestand.'),

-- ── ABSCHNITT G: Neurologie/Psychiatrie ────────────────────────────────────

('801', 'Psychiatrische Behandlung', 'Psychiatrische Behandlung (mind. 20 Min.)', 'F', 630, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'Streit um Zeitdokumentation und Kumulierung mit anderen Ziffern', NULL),

-- ── ABSCHNITT H: Augenheilkunde ─────────────────────────────────────────────

('1375', 'Kataraktoperation', 'Operation des grauen Stars (Kataraktextraktion)', 'H', 4000, 'normal', 2.3, 3.5,
 NULL, false, 'hoch',
 'Kumulierung mit Analogziffer 5855 (Femtosekundenlaser) strittig',
 'BGH III ZR 350/20: Femtosekundenlaser-Zusatz (GOAe 5855-Analog) nicht neben GOAe 1375 abrechenbar. Nur GOAe 441 erstattungsfaehig. Pruefen ob Arzt GOAe 441 korrekt berechnet hat.'),

('441', 'Laserchirurgie Auge', 'Laserchirurgie in der Augenheilkunde (Zuschlag)', 'H', 800, 'technisch', 1.8, 2.5,
 NULL, false, 'mittel',
 'PKV lehnt ab wenn gleichzeitig GOAe 5855 berechnet wird',
 'Korrekte Alternative zur Analogabrechnung bei Femtosekundenlaser. PKV MUSS GOAe 441 erstatten wenn GOAe 1375 anerkannt. Strikt pruefen ob AXA GOAe 441 mitabgelehnt hat.'),

('5855', 'Intraokulare Eingriffe (Analog)', 'Analog: Intraokulare Eingriffe (GOAe Nr. 5855)', 'H', 5000, 'technisch', 1.8, 2.5,
 '5855', false, 'hoch',
 'PKV lehnt Analogabrechnung 5855 bei Femtosekundenlaser ab (BGH III ZR 350/20)',
 'BGH-Urteil III ZR 350/20 (14.10.2021): Femtosekundenlaser bei Katarakt ist KEINE eigenstaendige Leistung. Analog GOAe 5855 ist unzulaessig. Nur GOAe 1375 + 441 abrechenbar. AXA hat Recht bei dieser Ablehnung.'),

('1345', 'Strabismus-Operation', 'Operation des Schielens', 'H', 3800, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'Selten Streitthema', NULL),

-- ── Radiologie/Bildgebung ─────────────────────────────────────────────────

('5000', 'Roentgen (1 Ebene)', 'Roentgenaufnahme des Skeletts, 1 Ebene', 'O', 250, 'technisch', 1.8, 2.5,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('5035', 'CT Kopf', 'Computerтомographie (CT) des Schaedels', 'O', 2300, 'technisch', 1.8, 2.5,
 NULL, false, 'niedrig', 'Selten Streitthema', NULL),

('5700', 'MRT Kopf', 'MRT des Schaedels', 'O', 4000, 'technisch', 1.8, 2.5,
 NULL, false, 'mittel',
 'Medizinische Notwendigkeit gelegentlich bestritten (Kopfschmerzen ohne Befund)',
 'Bei MRT-Ablehnung: ex-ante Beurteilung des Facharztes entscheidend (BGH IV ZR 131/05). Arzt-Dokumentation warum MRT indiziert war, beifuegen.'),

('5721', 'MRT Wirbelsaeule', 'MRT der Wirbelsaeule', 'O', 4500, 'technisch', 1.8, 2.5,
 NULL, false, 'mittel',
 'Medizinische Notwendigkeit gelegentlich bestritten bei unspezifischen Rueckenschmerzen',
 'PKV prueft ob konservative Vorbehandlung ausreichend war. Facharzt-Dokumentation + Vorbefunde beifuegen.'),

-- ── ABSCHNITT K: Chirurgie/Orthopaedie ───────────────────────────────────────

('2000', 'Wundnaht', 'Wundnaht (Haut und Unterhaut)', 'L', 370, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig', 'Selten Streitthema', NULL),

('2100', 'Arthroskopie', 'Arthroskopie diagnostisch', 'L', 2000, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'Medizinische Notwendigkeit gelegentlich bestritten (erst konservative Therapie erfordern)',
 'PKV prueft ob konservative Therapie ausgeschoepft war. Dokumentation der Vorbehandlung entscheidend.'),

('2190', 'Kniespiegelung', 'Arthroskopische Knieoperation', 'L', 3500, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'Alternative Behandlung (Physiotherapie) gelegentlich als ausreichend angesehen',
 'BGH IV ZR 533/15: Existenz einer Konservativoption schliesst med. Notwendigkeit OP nicht aus wenn diese nur Symptome behandelt.'),

('2382', 'Hueftgelenkersatz (Implant.)', 'Implantation einer Huftgelenkendoprothese', 'L', 8000, 'normal', 2.3, 3.5,
 NULL, false, 'hoch',
 'Kosten des Implantats oft Streitpunkt; Hersteller-Preis vs. GOAe-Sachkosten',
 'BGH IV ZR 278/01: PKV darf nicht allein wegen Kosten ablehnen. Teurere Implantate erstattungsfaehig wenn med. notwendig. AXA muss Beweislast tragen.'),

-- ── ABSCHNITT M: Laborleistungen ─────────────────────────────────────────────
-- Labor: Schwellenwert 1.15x, Max 1.3x (wesentlich enger!)

('3500', 'Blutbild (klein)', 'Kleines Blutbild (Hb, Hkt, Erythro, Leuko)', 'M', 40, 'labor', 1.15, 1.3,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('3501', 'Differentialblutbild', 'Differentialblutbild', 'M', 60, 'labor', 1.15, 1.3,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('3511', 'Blutbild (gross)', 'Grosses Blutbild (inkl. Differentialblutbild)', 'M', 90, 'labor', 1.15, 1.3,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('3530', 'CRP', 'C-reaktives Protein (CRP)', 'M', 70, 'labor', 1.15, 1.3,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('3550', 'TSH', 'Thyreoidea-stimulierendes Hormon (TSH)', 'M', 120, 'labor', 1.15, 1.3,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('3563', 'Vitamin D', '25-OH-Vitamin D3', 'M', 140, 'labor', 1.15, 1.3,
 NULL, false, 'mittel',
 'Haeufige PKV-Ablehnung: Vitamin D als IGeL-Leistung oder nicht med. notwendig',
 'PKV lehnt Vitamin-D-Bestimmung gelegentlich als nicht erstattungspflichtig ab. Widerspruch: aerztliche Indikation dokumentieren (Mangel, Risikogruppe, Knochen-Erkrankung).'),

('3592', 'PSA', 'Prostataspezifisches Antigen (PSA)', 'M', 130, 'labor', 1.15, 1.3,
 NULL, false, 'mittel',
 'Als IGeL eingestuft wenn nur Screening ohne Symptome',
 'PSA-Screening ohne Symptome oft als IGeL abgelehnt. Bei symptomatischen Indikationen (Beschwerden, Kontrolle) erstattungsfaehig.'),

('3748', 'Allergie-Test', 'Allergiologische Stufendiagnostik', 'M', 300, 'labor', 1.15, 1.3,
 NULL, false, 'mittel',
 'Umfang und Notwendigkeit gelegentlich bestritten', NULL),

-- ── ABSCHNITT Haematologie/Immunologie ───────────────────────────────────────

('3683', 'Antinukleaere Antikoerper (ANA)', 'Bestimmung antinukleaerer Antikoerper', 'M', 200, 'labor', 1.15, 1.3,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch bei klin. Indikation', NULL),

-- ── Hautarzt/Dermatologie ─────────────────────────────────────────────────

('2440', 'Exzision Haut', 'Exzision einer Hautveraenderung (bis 1 cm)', 'L', 480, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'Kosmetische vs. medizinische Indikation',
 'PKV prueft ob Eingriff medizinisch (Karzinom-Verdacht) oder kosmetisch. Histologischer Befund als Nachweis beifuegen.'),

('2442', 'Exzision grosse Hautlaesion', 'Exzision einer Hautveraenderung (ueber 1 cm)', 'L', 740, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'Kosmetische vs. medizinische Indikation',
 'Wie GOAe 2440 — Histologie-Befund entscheidend.'),

-- ── IGeL-nahe / oft strittige Leistungen ─────────────────────────────────────

('70', 'Kardiologisches Langzeit-EKG', 'Auswertung eines Langzeit-EKG ueber mind. 18 Std.', 'A', 530, 'normal', 2.3, 3.5,
 NULL, false, 'niedrig',
 'Selten abgelehnt bei kardiologischer Indikation', NULL),

('651', 'Stressechokardiographie', 'Echokardiographische Untersuchung unter Belastung', 'C', 1540, 'technisch', 1.8, 2.5,
 NULL, false, 'mittel',
 'Medizinische Notwendigkeit gelegentlich bestritten',
 'Indikation muss dokumentiert sein. Vorliegende KHK-Risikofaktoren sind Grundlage.'),

('800', 'EEG', 'Elektroenzephalographie (EEG)', 'G', 780, 'technisch', 1.8, 2.5,
 NULL, false, 'niedrig', 'I.d.R. unproblematisch', NULL),

('829', 'Neuropsychologische Testung', 'Neuropsychologische Untersuchung', 'G', 1150, 'normal', 2.3, 3.5,
 NULL, false, 'mittel',
 'Umfang und Indikation gelegentlich bestritten', NULL),

-- ── Steuerungsmittel Gesundheitslotse ────────────────────────────────────────

('3', 'Zusatzziffer Lotse AXA', 'Behandlung ohne Gesundheitslotsen-Ueberweisung', 'A', 0, 'normal', 1.0, 1.0,
 NULL, false, 'hoch',
 'AXA kuerzt Erstattung wenn Gesundheitslotsen-Pflicht nicht erfuellt',
 'AXA ActiveMe-U: Ohne Gesundheitslotsen-Ueberweisung sinkt Erstattungsquote (z.B. von 100% auf 80%). Pruefen ob Lotsen-Anforderung eingehalten wurde. Ausnahmen: Notfall, Augenarzt, Zahnarzt, direkt beim Internist.'),

-- ── Hoch strittige Analogabrechnungen ────────────────────────────────────────

('2701A', 'Neuraltherapie (Analog)', 'Neuraltherapie — Analogabrechnung nach §6 GOAe', 'E', 370, 'normal', 2.3, 3.5,
 '2701', false, 'hoch',
 'PKV lehnt Analogabrechnungen gelegentlich als nicht GOAe-konform ab',
 'Analogabrechnungen nach §6 Abs.2 GOAe muessen gleichwertige Leistung benennen. PKV kann Unzulaessigkeit der Analogziffer beanstanden. Facharzt-Begruendung pflicht.'),

('266A', 'Stresstherapie (Analog)', 'Biofeedback/Stresstherapie — Analogabrechnung', 'E', 400, 'normal', 2.3, 3.5,
 '266', false, 'hoch',
 'PKV lehnt haeufig ab: fehlende Anerkennung als Heilbehandlung',
 'Biofeedback/Stresstherapie als Analogziffer strittig. Dokumentation der Diagnose und Begruendung der Gleichwertigkeit erforderlich.'),

-- ── Faktorueberschreitungen (systematisch) ───────────────────────────────────

('FAKTOR_NORMAL', 'Faktor >2.3x Normalleistung', 'Abrechnung oberhalb des Schwellenwertes 2.3x', 'X', 0, 'normal', 2.3, 3.5,
 NULL, true, 'hoch',
 'PKV beanstandet Faktor >2.3x ohne schriftliche Begruendung (§12 Abs.3 GOAe)',
 'Pflicht: Bei Ueberschreitung des Schwellenwertes (2.3x bei Normalleistungen) MUSS Arzt schriftlich begruenden (§12 Abs.3 GOAe). Fehlt diese Begruendung: Kuerzeung auf 2.3x durch PKV berechtigt. Wenn Begruendung vorhanden: vollstaendige Erstattung verlangen.'),

('FAKTOR_TECH', 'Faktor >1.8x Technische Leistung', 'Abrechnung oberhalb des Schwellenwertes 1.8x', 'X', 0, 'technisch', 1.8, 2.5,
 NULL, true, 'hoch',
 'PKV beanstandet Faktor >1.8x ohne schriftliche Begruendung bei techn. Leistungen',
 'Technische Leistungen (Radiologie, Labor, Anaesthesie): Schwellenwert 1.8x. Begruendung bei Ueberschreitung genauso Pflicht wie bei normalen Leistungen.'),

-- ── IGEL-Leistungen (typisch abgelehnt) ─────────────────────────────────────

('IGEL_VORSORGE', 'Individuelle Gesundheitsleistung (IGeL)', 'Nicht im GKV-Katalog — typische IGeL-Leistungen', 'X', 0, 'normal', 2.3, 3.5,
 NULL, false, 'hoch',
 'PKV lehnt als reines Screening ohne Krankheitswert ab',
 'IGeL-typische Ablehnungsgruende: kein Krankheitswert, Praevention statt Behandlung, im Tarif nicht versichert. Widerspruch: nachweisen dass Krankheitsverdacht bestand (nicht nur Vorsorge). Befunde, Symptome, Risikofaktoren dokumentieren.'),

-- ── Laborleistungen extern (strittig) ────────────────────────────────────────

('LABOR_EXTERN', 'Fremdlaborkosten', 'Kosten eines externen Labors das direkt beim Patienten abrechnet', 'M', 0, 'labor', 1.15, 1.3,
 NULL, false, 'hoch',
 'PKV lehnt externe Laborrechnung ab wenn Arzt bereits eigene Laborziffer berechnet hat',
 'Haeufiger Streitfall: Labor rechnet direkt mit Patient ab, gleichzeitig berechnet Arzt eigene Laborziffern. PKV prueft Doppelabrechnung. Beide Rechnungen einreichen und Unterschied der Leistungen erklaeren.')

ON CONFLICT (ziffer) DO UPDATE SET
  kurzbezeichnung    = EXCLUDED.kurzbezeichnung,
  pkv_streitpotenzial = EXCLUDED.pkv_streitpotenzial,
  typische_ablehnung = EXCLUDED.typische_ablehnung,
  ki_hinweis         = EXCLUDED.ki_hinweis;
