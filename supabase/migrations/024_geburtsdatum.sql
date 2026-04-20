-- Migration 024: Add geburtsdatum (date of birth) to profiles
-- Used for age-based Vorsorge filtering (e.g. Hautkrebs ab 35, Darmkrebs ab 50, Prostata ab 45)
-- Run in Supabase SQL Editor after migration 023

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS geburtsdatum date;
