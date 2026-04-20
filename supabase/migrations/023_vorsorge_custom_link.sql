-- Migration 023: Add vorsorge_link_custom to profiles
-- Allows users to store a custom link to their insurer's Vorsorge page
-- This overrides the hardcoded PKV_VORSORGE_LINKS in ChronikSection
-- Run in Supabase SQL Editor after migration 022

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vorsorge_link_custom text;
