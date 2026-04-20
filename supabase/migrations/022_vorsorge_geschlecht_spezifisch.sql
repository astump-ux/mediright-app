-- Migration 022: Add geschlecht_spezifisch and hinweis to user_vorsorge_config
-- Allows gender-specific items to be filtered per user (e.g. Mammographie only for female)
-- Also adds hinweis for tooltip/context text in VorsorgeCard
-- Run in Supabase SQL Editor after migration 021

ALTER TABLE user_vorsorge_config
  ADD COLUMN IF NOT EXISTS geschlecht_spezifisch text
  CHECK (geschlecht_spezifisch IN ('male', 'female'));

ALTER TABLE user_vorsorge_config
  ADD COLUMN IF NOT EXISTS hinweis text;
