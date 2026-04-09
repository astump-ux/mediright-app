-- Migration 005: User settings / PKV profile fields
-- Run in Supabase SQL Editor

alter table public.profiles
  add column if not exists full_name                  text,
  add column if not exists pkv_name                   text,
  add column if not exists pkv_nummer                 text,
  add column if not exists pkv_tarif                  text,
  add column if not exists pkv_seit                   date,
  add column if not exists benachrichtigung_whatsapp  boolean default true;

-- RLS policies (drop first to avoid duplicate errors)
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can read own profile"   on public.profiles;

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);
