-- Migration 029: tarif_profile + avb_dokumente
-- Stores per-user PKV contract analysis (JSON) and uploaded AVB PDFs.
-- Analysis is performed by Claude Vision on upload; results land here
-- and are used to power precise Kassenbescheid analysis + Widerspruch generation.

-- ─────────────────────────────────────────────
-- 1. tarif_profile
--    One row per user per tariff. A user may have multiple tariffs
--    (e.g. switched providers), but typically just one active one.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tarif_profile (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tariff identity
  versicherung     TEXT NOT NULL,                  -- e.g. "AXA", "Allianz"
  tarif_name       TEXT NOT NULL,                  -- e.g. "ActiveMe-U"
  avb_version      TEXT,                           -- e.g. "VG100 (Stand 01.01.2026)"
  versicherungsnummer TEXT,                        -- e.g. "000919707K"

  -- Full structured analysis as JSON (schema: tarif_profil.json)
  profil_json      JSONB NOT NULL DEFAULT '{}',

  -- Source document references (array of {bezeichnung, typ, seiten_im_pdf})
  quelldokumente   JSONB NOT NULL DEFAULT '[]',

  -- Status tracking
  analyse_status   TEXT NOT NULL DEFAULT 'pending'
                   CHECK (analyse_status IN ('pending', 'analyzing', 'completed', 'failed')),
  analyse_datum    TIMESTAMPTZ,
  fehler_meldung   TEXT,                           -- populated on failure

  is_active        BOOLEAN NOT NULL DEFAULT TRUE,  -- current tariff vs. historical
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active tariff per user at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS tarif_profile_one_active_per_user
  ON public.tarif_profile (user_id)
  WHERE is_active = TRUE;

-- RLS
ALTER TABLE public.tarif_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own tarif_profile"
  ON public.tarif_profile FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.tarif_profile IS
  'Per-user PKV tariff analysis. profil_json holds the full structured '
  'extraction from AVB documents (coverage rates, limits, clauses, escalation paths).';

-- ─────────────────────────────────────────────
-- 2. avb_dokumente
--    Tracks uploaded PDF files (stored in Supabase Storage bucket "avb-dokumente").
--    Multiple documents can belong to one tarif_profile (e.g. Versicherungsschein
--    + Vertragsbedingungen are separate files but one analysis).
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.avb_dokumente (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tarif_profile_id  UUID REFERENCES public.tarif_profile(id) ON DELETE SET NULL,

  dateiname_original TEXT NOT NULL,               -- original filename from upload
  storage_path       TEXT NOT NULL,               -- path inside Supabase Storage bucket
  dateityp           TEXT NOT NULL DEFAULT 'avb'
                     CHECK (dateityp IN ('avb', 'versicherungsschein', 'sonstiges')),

  seiten             INTEGER,                     -- page count (filled after upload)
  groesse_bytes      BIGINT,                      -- file size

  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.avb_dokumente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own avb_dokumente"
  ON public.avb_dokumente FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.avb_dokumente IS
  'Uploaded AVB/Versicherungsschein PDFs. Storage path references the '
  'private "avb-dokumente" Supabase Storage bucket.';

-- ─────────────────────────────────────────────
-- 3. updated_at trigger for tarif_profile
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarif_profile_updated_at ON public.tarif_profile;
CREATE TRIGGER tarif_profile_updated_at
  BEFORE UPDATE ON public.tarif_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 4. profiles table: add pkv_name + tarif columns
--    These are quick-access fields (denormalized from tarif_profile)
--    so the onboarding + dashboard don't need a join just to show basics.
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pkv_name   TEXT,    -- e.g. "AXA"
  ADD COLUMN IF NOT EXISTS pkv_tarif  TEXT,    -- e.g. "ActiveMe-U"
  ADD COLUMN IF NOT EXISTS pkv_selbstbehalt_eur INTEGER; -- e.g. 500

COMMENT ON COLUMN public.profiles.pkv_name IS
  'Short name of the PKV insurer. Denormalized from tarif_profile for fast access.';
COMMENT ON COLUMN public.profiles.pkv_tarif IS
  'Tariff name. Denormalized from tarif_profile.';
COMMENT ON COLUMN public.profiles.pkv_selbstbehalt_eur IS
  'Annual deductible cap in EUR. Denormalized from tarif_profile.profil_json.';
