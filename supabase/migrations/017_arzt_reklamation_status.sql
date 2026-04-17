-- Add independent status tracking for the Arztreklamation track.
-- Kassenwiderspruch and Arztreklamation are two separate procedure tracks;
-- each needs its own persistent sent-status so they can be managed independently.

ALTER TABLE kassenabrechnungen
  ADD COLUMN IF NOT EXISTS arzt_reklamation_status text
    CHECK (arzt_reklamation_status IN ('keiner', 'erstellt', 'gesendet'))
    DEFAULT 'keiner';

-- Back-fill: any case that already has korrektur_arzt positions in kasse_analyse
-- gets 'erstellt' so the draft node is immediately visible for existing data.
UPDATE kassenabrechnungen
SET arzt_reklamation_status = 'erstellt'
WHERE arzt_reklamation_status = 'keiner'
  AND widerspruch_status IN ('erstellt', 'gesendet', 'beantwortet', 'erfolgreich', 'abgelehnt')
  AND kasse_analyse IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(kasse_analyse->'rechnungen') AS r,
         jsonb_array_elements(r->'positionen') AS p
    WHERE p->>'aktionstyp' = 'korrektur_arzt'
  );
