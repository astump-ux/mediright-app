-- Migration 005: User settings / PKV profile fields
-- Run in Supabase SQL Editor

alter table public.profiles
  add column if not exists full_name       text,
  add column if not exists pkv_name        text,        -- e.g. "AXA"
  add column if not exists pkv_nummer      text,        -- Versicherungsnummer / Mitgliedsnummer
  add column if not exists pkv_tarif       text,        -- Tarif, e.g. "ActiveMe-U"
  add column if not exists pkv_seit        date,        -- Versichert seit
  add column if not exists benachrichtigung_whatsapp boolean default true;

-- RLS: users can read/update their own row
-- (Supabase creates a default row on signup via trigger — add if missing)
create policy if not exists "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy if not exists "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);
