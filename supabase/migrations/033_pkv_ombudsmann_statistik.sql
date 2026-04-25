-- Migration 033: pkv_ombudsmann_statistik — Ombudsmann Tätigkeitsbericht 2025
--
-- Quelle: PKV-Ombudsmann Tätigkeitsbericht 2025
--         https://www.pkv-ombudsmann.de/w/files/pdf/taetigkeitsbericht2025.pdf
-- Stand: April 2026 (Berichtsjahr 2025)
--
-- Zweck: Kalibrierungsdaten für die KI — wie häufig scheitern welche
--        Beschwerdekategorien, und wie hoch ist die Einigungsquote beim Ombudsmann?
--        Ergänzt die BGH-Urteile-Tabelle um empirische Erfolgswahrscheinlichkeiten.

-- ── Tabelle ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pkv_ombudsmann_statistik (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  berichtsjahr        integer NOT NULL,
  -- Kategorie entspricht pkv_urteile.kategorie für einfaches Joining
  kategorie           text NOT NULL,
  -- Beschreibender Label für die Kategorie (Deutsch)
  kategorie_label     text NOT NULL,
  -- Anteil dieser Kategorie an allen KV-Vollversicherungs-Beschwerden
  anteil_beschwerden  numeric(5,2),   -- z. B. 15.10 = 15,1 %
  -- Fallzahl in der Krankheitskostenvollversicherung
  fallzahl_kv         integer,
  -- Davon: ambulant / stationär / zahnärztlich (JSON für Flexibilität)
  fallzahl_detail     jsonb DEFAULT '{}',
  -- Einigungsquote beim Ombudsmann (aus Gesamtstatistik; kategoriespezifisch
  --   nur wenn explizit ausgewiesen, sonst NULL = Gesamtquote verwenden)
  einigungsquote      numeric(5,2),   -- z. B. 33.10 = 33,1 %
  -- Freitext-Hinweise für die KI (Kontext, warum Kategorie besonders ist)
  ki_hinweis          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pkv_omb_statistik_jahr_idx ON pkv_ombudsmann_statistik (berichtsjahr);
CREATE INDEX IF NOT EXISTS pkv_omb_statistik_kat_idx  ON pkv_ombudsmann_statistik (kategorie);

-- RLS: alle eingeloggten User dürfen lesen
ALTER TABLE pkv_ombudsmann_statistik ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pkv_omb_stat_read"
  ON pkv_ombudsmann_statistik FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "pkv_omb_stat_admin"
  ON pkv_ombudsmann_statistik FOR ALL
  TO service_role
  USING (true);

-- ── Seed: Berichtsjahr 2025 ─────────────────────────────────────────────────
--
-- Gesamtstatistik 2025 (Krankheitskostenvollversicherung):
--   Anträge gesamt:        9.755  (davon KV-Vollversicherung: 5.065 = 63,8 %)
--   Schlichtungsverfahren abgeschlossen: 5.435
--   → Einigung erzielt:    1.797 / 33,1 %
--   → Keine Schlichtung:   3.074 / 56,5 %
--   → Verfahrenseinstellung: 564 / 10,4 %
--
-- Themenschwerpunkte Krankheitskostenvollversicherung (5.065 Anträge = 100 %):
--   1. Medizinische Notwendigkeit  764 / 15,1 %  (ambulant 561, stat. 145, zahn. 58)
--   2. Gebührenstreitigkeiten GOÄ  723 / 14,3 %  (ambulant 302, stat.  75, zahn. 346)
--   3. Arznei/Heil/Hilfsmittel     702 / 13,9 %
--   4. Vertragsauslegung / AVB      571 / 11,3 %  (ambulant 351, stat. 123, zahn.  97)
--   5. [Sonstige Kategorien]        ~305 / 7,6 %  + ~309 / 6,1 % + 31,7 % Sonstige

INSERT INTO pkv_ombudsmann_statistik
  (berichtsjahr, kategorie, kategorie_label, anteil_beschwerden, fallzahl_kv,
   fallzahl_detail, einigungsquote, ki_hinweis)
VALUES

-- Gesamtstatistik als Referenzzeile
(2025, 'allgemein', 'Gesamtstatistik KV-Vollversicherung', NULL, 5065,
 '{"angenommen_gesamt": 7944, "vollversicherung": 5065, "zusatzversicherung": 1820, "pflege": 1059}'::jsonb,
 33.10,
 'Gesamteinigungsquote beim PKV-Ombudsmann 2025: 33,1 % (1.797 von 5.435 abgeschlossenen Verfahren). Jeder dritte Fall endet mit einer Einigung zugunsten des Versicherten. Ablehnungsquote (Schlichtung scheitert): 56,5 %. Verfahrensdauer: ø 65 Tage. Antragsvolumen 2025 stark gestiegen: 9.755 Anträge (+41 % gegenüber 2024).'),

-- 1. Medizinische Notwendigkeit — häufigste Beschwerdekategorie
(2025, 'medizinische_notwendigkeit', 'Medizinische Notwendigkeit (Heilbehandlung)', 15.10, 764,
 '{"ambulant": 561, "stationaer": 145, "zahnaerztlich": 58}'::jsonb,
 NULL,  -- kategoriespezifische Quote nicht separat ausgewiesen → Gesamtquote 33,1 % gilt
 'Häufigste Beschwerdekategorie 2025 (15,1 %, 764 Fälle). Versicherer lehnen Erstattung ab, weil medizinische Notwendigkeit bestritten wird. Schwerpunkt ambulant (73 % der Fälle in dieser Kategorie). Bei Widerspruch: Ex-ante-Maßstab (BGH IV ZR 131/05) betonen und Facharzt-Stellungnahme beifügen.'),

-- 2. GOÄ/GOZ Gebührenstreitigkeiten
(2025, 'goae', 'Gebührenstreitigkeiten (GOÄ / GOZ)', 14.30, 723,
 '{"ambulant": 302, "stationaer": 75, "zahnaerztlich": 346}'::jsonb,
 NULL,
 'Zweithäufigste Beschwerdekategorie 2025 (14,3 %, 723 Fälle). Besonderheit: Zahnärztliche GOZ-Streitigkeiten dominieren (48 %), weit vor ambulanten GOÄ-Streitigkeiten (42 %). Häufigste Streitpunkte: Analogziffern, Steigerungsfaktoren >2,3× (Begründungspflicht §12 GOÄ), Mehrfachansatz von Ziffern. KI-Hinweis: Bei GOÄ-Ablehnung immer prüfen, ob Arzt §12 Abs.3 Begründungspflicht erfüllt hat.'),

-- 3. Arznei-, Heil- und Hilfsmittel
(2025, 'medizinische_notwendigkeit', 'Arznei-, Heil- und Hilfsmittel', 13.90, 702,
 '{}'::jsonb,
 NULL,
 'Dritthäufigste Beschwerdekategorie 2025 (13,9 %, 702 Fälle). Versicherer lehnen Hilfsmittel (Hörgeräte, Orthesen, Prothesen) oder Arzneimittel als nicht erstattungspflichtig ab. Rechtslage: BGH IV ZR 419/13 — Beweislast beim Versicherer für "nicht medizinisch notwendig". Wirtschaftlichkeitsargument allein reicht nicht.'),

-- 4. Vertragsauslegung / AVB
(2025, 'ausschlussklausel', 'Vertragsauslegung / Versicherungsbedingungen', 11.30, 571,
 '{"ambulant": 351, "stationaer": 123, "zahnaerztlich": 97}'::jsonb,
 NULL,
 'Vierthäufigste Beschwerdekategorie 2025 (11,3 %, 571 Fälle). Streit über Auslegung von AVB-Klauseln — oft Vorerkrankungsausschlüsse, Wartezeiten, Leistungsausschlüsse. KI-Hinweis: Unklare Klauseln sind nach §305c Abs.2 BGB zugunsten des Versicherungsnehmers auszulegen (contra-proferentem-Regel).'),

-- Beitragsanpassung (nicht in Top-4, aber relevant für separates Beschwerdefeld)
(2025, 'beitragsanpassung', 'Beitragsanpassung (§203 VVG)', NULL, NULL,
 '{}'::jsonb,
 NULL,
 'Beitragsanpassungsbeschwerden nicht gesondert unter Top-5 der KV-Vollversicherung ausgewiesen, aber regelmäßiges Thema. Rechtslage: BGH IV ZR 255/17, IV ZR 294/19, IV ZR 314/19 — formelle Unwirksamkeit bei fehlender Begründung des auslösenden Faktors. Ombudsmann-Verfahren bei BAP-Streitigkeiten oft erfolgreich, da Versicherer Begründungsmängel häufig einräumen.');

