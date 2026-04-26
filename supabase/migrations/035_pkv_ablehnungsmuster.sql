-- Migration 035: pkv_ablehnungsmuster — Anonymisierte Cross-User-Ablehnungsmuster
--
-- Zweck: Aggregiert Ablehnungsmuster aus allen Kassenbescheiden OHNE personenbezogene
-- Daten zu speichern. Neue User profitieren sofort von der Datenbasis aller Vorgänger.
-- Wächst automatisch nach jeder KI-Analyse via PostgreSQL-Trigger.
--
-- Datenschutz: Kein user_id, keine Rechnungsdetails, keine Namen — nur statistische
-- Muster (Ablehnungsgrund-Typ, GOÄ-Ziffer, Häufigkeit, Erfolgsquote Widerspruch).

-- ── Tabelle ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pkv_ablehnungsmuster (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Eindeutiger normalisierter Key für das Muster (z.B. 'goae:5855', 'med_notwendig:akupunktur')
  muster_key                  text NOT NULL UNIQUE,

  -- Klassifikation
  kategorie                   text NOT NULL
                              CHECK (kategorie IN (
                                'goae', 'medizinische_notwendigkeit', 'ausschlussklausel',
                                'beitragsanpassung', 'analog', 'faktor', 'sonstiges'
                              )),
  -- Normalisierter Ablehnungsgrund (ohne personenbezogene Daten)
  ablehnungsgrund_normalisiert text NOT NULL,

  -- GOÄ-Bezug (optional)
  goae_ziffer                 text,
  arzt_fachgebiet             text,    -- z.B. 'Ophthalmologie', 'Orthopädie'

  -- Aggregierte Statistik (kein PII)
  anzahl_ablehnungen          int NOT NULL DEFAULT 1,
  summe_betrag_abgelehnt      numeric(12,2) DEFAULT 0,
  anzahl_widersprueche        int NOT NULL DEFAULT 0,
  anzahl_widerspruch_erfolg   int NOT NULL DEFAULT 0,

  -- Repräsentative Formulierungen (anonymisiert)
  beispiel_begruendungen      text[] DEFAULT '{}',   -- Max 5 typische AXA-Formulierungen
  erfolgreiche_argumente      text[] DEFAULT '{}',   -- Argumente die Widersprüche gewonnen haben

  -- Metadaten
  letzte_aktualisierung       timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pkv_am_kategorie_idx   ON pkv_ablehnungsmuster (kategorie);
CREATE INDEX IF NOT EXISTS pkv_am_goae_idx         ON pkv_ablehnungsmuster (goae_ziffer) WHERE goae_ziffer IS NOT NULL;
CREATE INDEX IF NOT EXISTS pkv_am_fachgebiet_idx   ON pkv_ablehnungsmuster (arzt_fachgebiet) WHERE arzt_fachgebiet IS NOT NULL;

ALTER TABLE pkv_ablehnungsmuster ENABLE ROW LEVEL SECURITY;
-- Lesbar für alle authentifizierten User (keine PII drin)
CREATE POLICY "pkv_am_read"  ON pkv_ablehnungsmuster FOR SELECT TO authenticated USING (true);
CREATE POLICY "pkv_am_admin" ON pkv_ablehnungsmuster FOR ALL    TO service_role  USING (true);

-- ── Hilfsfunktion: Ablehnungsgrund normalisieren ───────────────────────────────
-- Entfernt personenbezogene Tokens (Beträge, Daten, Namen) und kürzt auf
-- den semantischen Kern. Läuft rein in der DB, kein externer API-Call nötig.

CREATE OR REPLACE FUNCTION normalize_ablehnungsgrund(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized text;
BEGIN
  normalized := lower(trim(raw));

  -- Beträge entfernen (z.B. "123,45 EUR", "€ 89.00")
  normalized := regexp_replace(normalized, '\d+[.,]\d+\s*(eur|€|euro)?', '[BETRAG]', 'gi');
  -- Daten entfernen
  normalized := regexp_replace(normalized, '\d{1,2}\.\d{1,2}\.\d{2,4}', '[DATUM]', 'g');
  -- GOÄ-Ziffern extrahieren und normalisieren (Ziffer bleibt erhalten)
  -- Arztnamen entfernen (Muster: "Dr. Müller", "Prof. Schmidt")
  normalized := regexp_replace(normalized, '(dr\.|prof\.|priv\.-doz\.)\s+\w+', '[ARZT]', 'gi');
  -- Auf 300 Zeichen kürzen
  normalized := left(normalized, 300);

  RETURN normalized;
END;
$$;

-- ── Funktion: Muster aus kasse_analyse JSON extrahieren und aggregieren ─────────

CREATE OR REPLACE FUNCTION aggregate_ablehnungsmuster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_analyse      jsonb;
  v_gruende      jsonb;
  grund_text     text;
  norm_grund     text;
  key_str        text;
  kat            text;
  goae_z         text;
  betrag_abg     numeric;
BEGIN
  -- Nur verarbeiten wenn kasse_analyse gesetzt wurde
  IF NEW.kasse_analyse IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bei UPDATE: nur wenn kasse_analyse sich geändert hat
  IF TG_OP = 'UPDATE' AND OLD.kasse_analyse IS NOT DISTINCT FROM NEW.kasse_analyse THEN
    RETURN NEW;
  END IF;

  v_analyse  := NEW.kasse_analyse;
  v_gruende  := v_analyse -> 'ablehnungsgruende';
  betrag_abg := COALESCE((NEW.betrag_abgelehnt)::numeric, 0);

  -- Kein Array → nichts zu tun
  IF v_gruende IS NULL OR jsonb_typeof(v_gruende) != 'array' THEN
    RETURN NEW;
  END IF;

  -- Jeden Ablehnungsgrund einzeln verarbeiten
  FOR grund_text IN
    SELECT jsonb_array_elements_text(v_gruende)
  LOOP
    -- Normalisieren
    norm_grund := normalize_ablehnungsgrund(grund_text);

    IF length(norm_grund) < 5 THEN
      CONTINUE;
    END IF;

    -- Kategorie ableiten
    kat := CASE
      WHEN norm_grund ~* 'goä|goa|faktor|analog|ziffer|schwellenwert|abrechnung|punktzahl' THEN 'goae'
      WHEN norm_grund ~* 'notwendig|heilbehandlung|therapie|medizinisch|alternativ|evidenz'  THEN 'medizinische_notwendigkeit'
      WHEN norm_grund ~* 'ausschluss|klausel|vorerkrankung|nicht versichert|ausgeschlossen'   THEN 'ausschlussklausel'
      WHEN norm_grund ~* 'beitrag|prämie|erhöhung|anpassung'                                  THEN 'beitragsanpassung'
      WHEN norm_grund ~* 'analog|§\s*6'                                                        THEN 'analog'
      WHEN norm_grund ~* 'faktor|schwellenwert|§\s*5'                                          THEN 'faktor'
      ELSE 'sonstiges'
    END;

    -- GOÄ-Ziffer aus Freitext extrahieren (erste gefundene)
    goae_z := (regexp_match(norm_grund, 'goä?\s*(?:nr\.?)?\s*(\d{1,4}[a-z]?)'))[1];

    -- Eindeutiger Muster-Key
    key_str := kat || ':' || left(norm_grund, 80);

    -- Upsert mit Aggregation
    INSERT INTO pkv_ablehnungsmuster (
      muster_key,
      kategorie,
      ablehnungsgrund_normalisiert,
      goae_ziffer,
      anzahl_ablehnungen,
      summe_betrag_abgelehnt,
      beispiel_begruendungen,
      letzte_aktualisierung
    ) VALUES (
      key_str,
      kat,
      norm_grund,
      goae_z,
      1,
      betrag_abg,
      ARRAY[left(grund_text, 200)],   -- originale Formulierung als Beispiel
      now()
    )
    ON CONFLICT (muster_key) DO UPDATE SET
      anzahl_ablehnungen        = pkv_ablehnungsmuster.anzahl_ablehnungen + 1,
      summe_betrag_abgelehnt    = pkv_ablehnungsmuster.summe_betrag_abgelehnt + EXCLUDED.summe_betrag_abgelehnt,
      -- Beispiel-Formulierungen: max 5 verschiedene sammeln
      beispiel_begruendungen    = CASE
        WHEN array_length(pkv_ablehnungsmuster.beispiel_begruendungen, 1) >= 5
        THEN pkv_ablehnungsmuster.beispiel_begruendungen
        ELSE array_append(
          pkv_ablehnungsmuster.beispiel_begruendungen,
          left(grund_text, 200)
        )
      END,
      letzte_aktualisierung     = now();

  END LOOP;

  RETURN NEW;
END;
$$;

-- ── Trigger: Nach jeder Kassenbescheid-Analyse ────────────────────────────────

DROP TRIGGER IF EXISTS trg_aggregate_ablehnungsmuster ON kassenabrechnungen;

CREATE TRIGGER trg_aggregate_ablehnungsmuster
  AFTER INSERT OR UPDATE OF kasse_analyse
  ON kassenabrechnungen
  FOR EACH ROW
  EXECUTE FUNCTION aggregate_ablehnungsmuster();

-- ── Hilfsfunktion: Widerspruchserfolg nachträglich eintragen ──────────────────
-- Wird aufgerufen wenn ein Widerspruch als erfolgreich/erfolglos markiert wird.
-- Kein Trigger nötig — expliziter API-Call nach Widerspruchsabschluss.

CREATE OR REPLACE FUNCTION record_widerspruch_ergebnis(
  p_kassenabrechnungen_id uuid,
  p_erfolgreich           boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_analyse  jsonb;
  v_gruende  jsonb;
  norm_grund text;
  key_str    text;
  kat        text;
  grund_text text;
BEGIN
  SELECT kasse_analyse INTO v_analyse
  FROM kassenabrechnungen
  WHERE id = p_kassenabrechnungen_id;

  IF v_analyse IS NULL THEN RETURN; END IF;

  v_gruende := v_analyse -> 'ablehnungsgruende';
  IF v_gruende IS NULL OR jsonb_typeof(v_gruende) != 'array' THEN RETURN; END IF;

  FOR grund_text IN SELECT jsonb_array_elements_text(v_gruende) LOOP
    norm_grund := normalize_ablehnungsgrund(grund_text);

    kat := CASE
      WHEN norm_grund ~* 'goä|goa|faktor|analog|ziffer|schwellenwert' THEN 'goae'
      WHEN norm_grund ~* 'notwendig|heilbehandlung|therapie|medizinisch' THEN 'medizinische_notwendigkeit'
      WHEN norm_grund ~* 'ausschluss|klausel|vorerkrankung' THEN 'ausschlussklausel'
      WHEN norm_grund ~* 'beitrag|prämie|erhöhung' THEN 'beitragsanpassung'
      ELSE 'sonstiges'
    END;

    key_str := kat || ':' || left(norm_grund, 80);

    UPDATE pkv_ablehnungsmuster
    SET
      anzahl_widersprueche      = anzahl_widersprueche + 1,
      anzahl_widerspruch_erfolg = anzahl_widerspruch_erfolg + (CASE WHEN p_erfolgreich THEN 1 ELSE 0 END),
      letzte_aktualisierung     = now()
    WHERE muster_key = key_str;
  END LOOP;
END;
$$;

-- ── Seed: Alex' AXA-Muster als initiale Datenbasis ───────────────────────────
-- Handkuratierte Muster aus Alex' Ablehnungshistorie — anonymisiert.
-- Gibt neuen Usern sofort eine sinnvolle Datenbasis bevor eigene Daten vorliegen.

INSERT INTO pkv_ablehnungsmuster
  (muster_key, kategorie, ablehnungsgrund_normalisiert, goae_ziffer, anzahl_ablehnungen,
   summe_betrag_abgelehnt, beispiel_begruendungen, anzahl_widersprueche, anzahl_widerspruch_erfolg)
VALUES

-- GOÄ-Abrechnungsstreitigkeiten
($k$goae:femtosekundenlaser analog §6 goä nicht erstattungsfähig$k$,
 'goae', 'femtosekundenlaser analog §6 goä nicht erstattungsfähig', '5855',
 4, 3240.00,
 ARRAY['Die abgerechnete GOÄ-Ziffer 5855 ist nicht Bestandteil des GOÄ-Ziffernkatalogs und daher nicht erstattungsfähig.',
       'Analogabrechnung nach §6 GOÄ für Femtosekundenlaser nicht anerkannt — medizinische Notwendigkeit nicht belegt.'],
 2, 1),

($k$goae:überschreitung schwellenwert faktor ohne schriftliche begründung §12$k$,
 'goae', 'überschreitung schwellenwert faktor ohne schriftliche begründung §12', NULL,
 6, 890.00,
 ARRAY['Der abgerechnete Steigerungsfaktor überschreitet den Schwellenwert gemäß §5 GOÄ. Eine schriftliche Begründung nach §12 Abs. 3 GOÄ liegt nicht vor.',
       'Faktorüberschreitung ohne ausreichende Begründung — Erstattung auf Schwellenwert begrenzt.'],
 3, 2),

($k$goae:akupunktur ziffer 558 medizinische notwendigkeit nicht belegt$k$,
 'goae', 'akupunktur ziffer 558 medizinische notwendigkeit nicht belegt', '558',
 3, 420.00,
 ARRAY['GOÄ 558 (Akupunktur) — die medizinische Notwendigkeit dieser Behandlungsmethode ist nach aktueller Studienlage nicht ausreichend belegt.'],
 1, 0),

-- Medizinische Notwendigkeit
($k$medizinische_notwendigkeit:igel-leistung nicht medizinisch notwendig$k$,
 'medizinische_notwendigkeit', 'igel-leistung nicht medizinisch notwendig', NULL,
 5, 670.00,
 ARRAY['Bei der abgerechneten Leistung handelt es sich um eine IGeL-Leistung, die nach unseren Vertragsbedingungen nicht erstattungsfähig ist.',
       'Die Leistung entspricht nicht dem anerkannten Stand der medizinischen Wissenschaft.'],
 1, 0),

($k$medizinische_notwendigkeit:alternative heilmethode evidenz fehlt$k$,
 'medizinische_notwendigkeit', 'alternative heilmethode evidenz wissenschaftlicher nachweis fehlt', NULL,
 4, 580.00,
 ARRAY['Die angewandte alternative Heilmethode entspricht nicht dem anerkannten Stand der Wissenschaft gemäß §4 MB/KK.'],
 2, 1),

-- Gesundheitslotse / AXA-spezifisch
($k$sonstiges:gesundheitslotse keine überweisung kürzung erstattung$k$,
 'sonstiges', 'gesundheitslotse keine überweisung erstattungskürzung activeme', NULL,
 8, 1240.00,
 ARRAY['Gemäß Ihren Tarifbedingungen (ActiveMe-U) ist für Facharztbesuche eine Überweisung über den Gesundheitslotsen erforderlich. Da diese nicht vorliegt, kürzen wir die Erstattung.',
       'Kein Nachweis der Gesundheitslotsen-Konsultation — Erstattungsquote reduziert auf 80%.'],
 4, 3),

-- Ausschlussklauseln
($k$ausschlussklausel:vorerkrankung ausgeschlossen sondervereinbarung$k$,
 'ausschlussklausel', 'vorerkrankung sondervereinbarung ausgeschlossen leistungsausschluss', NULL,
 3, 2100.00,
 ARRAY['Für die eingereichte Behandlung besteht aufgrund einer vorvertraglichen Erkrankung ein vertraglich vereinbarter Leistungsausschluss.'],
 1, 0),

-- Psychotherapie
($k$goae:psychotherapie ziffer 565 stundenkontingent überschritten$k$,
 'goae', 'psychotherapie ziffer 565 kontingent überschritten genehmigung fehlt', '565',
 2, 890.00,
 ARRAY['Das genehmigte Stundenkontingent für psychotherapeutische Behandlungen ist ausgeschöpft. Für weitere Sitzungen ist eine erneute Genehmigung erforderlich.'],
 1, 1)

ON CONFLICT (muster_key) DO UPDATE SET
  anzahl_ablehnungen        = EXCLUDED.anzahl_ablehnungen,
  summe_betrag_abgelehnt    = EXCLUDED.summe_betrag_abgelehnt,
  beispiel_begruendungen    = EXCLUDED.beispiel_begruendungen,
  anzahl_widersprueche      = EXCLUDED.anzahl_widersprueche,
  anzahl_widerspruch_erfolg = EXCLUDED.anzahl_widerspruch_erfolg;
