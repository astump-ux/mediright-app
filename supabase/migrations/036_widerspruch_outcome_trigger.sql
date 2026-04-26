-- Migration 036: Automatisches Widerspruch-Outcome-Tracking
--
-- Feuert record_widerspruch_ergebnis() automatisch wenn widerspruch_status
-- auf 'akzeptiert' oder 'abgelehnt' wechselt.
--
-- Voraussetzung: record_widerspruch_ergebnis() aus Migration 035 muss existieren.
-- Idempotent: DROP IF EXISTS vor CREATE.

CREATE OR REPLACE FUNCTION trigger_widerspruch_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Nur reagieren wenn Status sich auf ein finales Ergebnis ändert
  IF NEW.widerspruch_status NOT IN ('akzeptiert', 'abgelehnt') THEN
    RETURN NEW;
  END IF;

  -- Nur bei echtem Statuswechsel (nicht bei Neu-Setzen des gleichen Werts)
  IF OLD.widerspruch_status IS NOT DISTINCT FROM NEW.widerspruch_status THEN
    RETURN NEW;
  END IF;

  -- record_widerspruch_ergebnis aufrufen — erfolgreich wenn 'akzeptiert'
  PERFORM record_widerspruch_ergebnis(
    NEW.id,
    NEW.widerspruch_status = 'akzeptiert'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_widerspruch_outcome ON kassenabrechnungen;

CREATE TRIGGER trg_widerspruch_outcome
  AFTER UPDATE OF widerspruch_status
  ON kassenabrechnungen
  FOR EACH ROW
  EXECUTE FUNCTION trigger_widerspruch_outcome();
