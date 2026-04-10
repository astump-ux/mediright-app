-- Migration 008: Selbstbehalt fields on kassenabrechnungen
-- Run in Supabase SQL Editor

alter table public.kassenabrechnungen
  -- Betrag der in DIESER Abrechnung als Selbstbehalt abgezogen wurde
  add column if not exists selbstbehalt_abgezogen    numeric(10,2),
  -- Verbleibender Selbstbehalt für das laufende Jahr (laut Bescheid)
  add column if not exists selbstbehalt_verbleibend  numeric(10,2),
  -- Jahres-Selbstbehalt-Grenze laut Vertrag (laut Bescheid, optional)
  add column if not exists selbstbehalt_jahresgrenze numeric(10,2);

-- Backfill from existing kasse_analyse JSONB where available
update public.kassenabrechnungen
set
  selbstbehalt_abgezogen   = (kasse_analyse->>'selbstbehaltAbgezogen')::numeric,
  selbstbehalt_verbleibend = (kasse_analyse->>'selbstbehaltVerbleibend')::numeric,
  selbstbehalt_jahresgrenze = (kasse_analyse->>'selbstbehaltJahresgrenze')::numeric
where kasse_analyse is not null;
