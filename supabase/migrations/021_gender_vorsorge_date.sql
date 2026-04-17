-- Migration 021: Add geschlecht to profiles + letzte_untersuchung_datum to user_vorsorge_config
-- Run in Supabase SQL Editor

-- 1. Add geschlecht column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS geschlecht text
  CHECK (geschlecht IN ('male', 'female', 'diverse'));

-- 2. Add manual date override column to user_vorsorge_config
--    letzte_untersuchung_datum: user-entered date (overrides date computed from vorgaenge)
ALTER TABLE user_vorsorge_config
  ADD COLUMN IF NOT EXISTS letzte_untersuchung_datum date;
