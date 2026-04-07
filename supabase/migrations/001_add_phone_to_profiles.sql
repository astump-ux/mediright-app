-- Migration 001: Add WhatsApp phone to profiles
-- Run in Supabase SQL Editor

alter table public.profiles
  add column if not exists phone_whatsapp text unique;

-- Index for fast webhook lookup
create index if not exists profiles_phone_whatsapp_idx
  on public.profiles(phone_whatsapp);

-- Allow service role to look up profiles by phone (for webhook)
-- (service role bypasses RLS by default, no policy needed)
