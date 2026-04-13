-- Migration 011: Widerspruch status tracking on kassenabrechnungen
-- Tracks whether a formal appeal (Widerspruch) has been filed for a Kassenbescheid

ALTER TABLE kassenabrechnungen
  ADD COLUMN IF NOT EXISTS widerspruch_status TEXT DEFAULT 'keiner'
    CHECK (widerspruch_status IN ('keiner','erstellt','gesendet','beantwortet','erfolgreich','abgelehnt')),
  ADD COLUMN IF NOT EXISTS widerspruch_gesendet_am TIMESTAMPTZ;

-- Index for dashboard queries (e.g. count open Widersprüche)
CREATE INDEX IF NOT EXISTS idx_kassenabrechnungen_widerspruch_status
  ON kassenabrechnungen (widerspruch_status)
  WHERE widerspruch_status != 'keiner';
