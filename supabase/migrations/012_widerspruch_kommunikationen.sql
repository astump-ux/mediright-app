-- Migration 012: Widerspruch Kommunikations-Thread
-- Tracks all back-and-forth communication for each active Widerspruch

CREATE TABLE IF NOT EXISTS public.widerspruch_kommunikationen (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kassenabrechnungen_id     UUID NOT NULL REFERENCES public.kassenabrechnungen(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Direction + partner
  richtung                  TEXT NOT NULL CHECK (richtung IN ('ausgehend', 'eingehend')),
  kommunikationspartner     TEXT NOT NULL CHECK (kommunikationspartner IN ('kasse', 'arzt')),
  typ                       TEXT NOT NULL CHECK (typ IN (
    'widerspruch',      -- initial appeal letter
    'nachfrage',        -- follow-up question
    'stellungnahme',    -- formal statement / position
    'antwort',          -- incoming reply
    'eskalation',       -- escalation (Ombudsmann, Gericht)
    'sonstiges'
  )),

  datum                     DATE NOT NULL DEFAULT CURRENT_DATE,
  betreff                   TEXT,
  inhalt                    TEXT NOT NULL,

  -- AI fields (populated after analyse)
  ki_analyse                TEXT,           -- Summary of what the incoming letter says
  ki_vorschlag_betreff      TEXT,           -- Suggested reply subject
  ki_vorschlag_inhalt       TEXT,           -- Suggested reply body
  ki_naechster_empfaenger   TEXT CHECK (ki_naechster_empfaenger IN ('kasse', 'arzt', 'keiner')),
  ki_dringlichkeit          TEXT CHECK (ki_dringlichkeit IN ('hoch', 'mittel', 'niedrig')),
  ki_naechste_frist         DATE,           -- Deadline if mentioned in incoming letter

  created_at                TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.widerspruch_kommunikationen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own widerspruch_kommunikationen"
  ON public.widerspruch_kommunikationen FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_widerspruch_komm_kassenabrechnungen_id
  ON public.widerspruch_kommunikationen (kassenabrechnungen_id, datum ASC);

CREATE INDEX IF NOT EXISTS idx_widerspruch_komm_user_id
  ON public.widerspruch_kommunikationen (user_id, created_at DESC);
