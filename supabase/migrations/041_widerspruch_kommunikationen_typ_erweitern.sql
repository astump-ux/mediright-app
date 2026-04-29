-- Migration 041: Neue typ-Werte für widerspruch_kommunikationen
--
-- Fügt 'gesendet' und 'ki_entwurf' zur typ-CHECK-Constraint hinzu:
--   gesendet   — vom User selbst gesendete Kommunikation (ausgehend, manuell erfasst)
--   ki_entwurf — on-demand KI-generierter Handlungsempfehlungs-Entwurf

ALTER TABLE widerspruch_kommunikationen
  DROP CONSTRAINT IF EXISTS widerspruch_kommunikationen_typ_check;

ALTER TABLE widerspruch_kommunikationen
  ADD CONSTRAINT widerspruch_kommunikationen_typ_check
  CHECK (typ IN (
    'widerspruch',    -- initial appeal letter
    'nachfrage',      -- follow-up question
    'stellungnahme',  -- formal statement / position
    'antwort',        -- incoming reply
    'eskalation',     -- escalation (Ombudsmann, Gericht)
    'sonstiges',
    'gesendet',       -- outgoing comm manually recorded by user
    'ki_entwurf'      -- on-demand AI-generated action recommendation
  ));
