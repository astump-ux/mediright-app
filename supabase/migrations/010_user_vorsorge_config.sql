-- Migration 010: Per-user Vorsorge configuration
-- Run in Supabase SQL Editor
--
-- Purpose:
--   Store tariff-specific preventive care items per user.
--   Populated once on first dashboard load (or when the user changes their tariff)
--   via the /api/vorsorge/init endpoint which uses Claude to research the tariff.
--
--   The dashboard-queries.ts will prefer this table over the hardcoded
--   AXA_VORSORGE_TEMPLATES fallback.

create table if not exists public.user_vorsorge_config (
  id                    uuid default gen_random_uuid() primary key,
  user_id               uuid references auth.users(id) on delete cascade not null,
  -- Which tariff this config is for (e.g. "AXA ActiveMed-U")
  tarif_name            text not null,
  -- Template fields (one row per check-up type)
  name                  text not null,          -- "Internist Jahres-Check"
  icon                  text not null default '💊',
  fachgebiet            text not null,          -- matches aerzte.fachgebiet
  empf_intervall_monate int  not null,          -- recommended interval in months
  axa_leistung          boolean default true,   -- whether covered by tariff
  -- Source tracking
  quelle                text default 'ai_research', -- 'ai_research' | 'manual' | 'hardcoded'
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table public.user_vorsorge_config enable row level security;

create policy "Users manage own vorsorge config"
  on public.user_vorsorge_config for all
  using (auth.uid() = user_id);

create index if not exists user_vorsorge_config_user_id_idx
  on public.user_vorsorge_config(user_id);

-- Unique: one entry per user + fachgebiet (no duplicate check-up types per user)
create unique index if not exists user_vorsorge_config_user_fach_idx
  on public.user_vorsorge_config(user_id, fachgebiet);

-- ── Seed AXA ActiveMe-U defaults for existing users ──────────────────────────
-- This inserts the known AXA ActiveMe-U benefit templates for any existing
-- user whose profile.tarif or profile.pkv_tarif matches AXA ActiveMe-U variants.
-- (Safe to run multiple times thanks to ON CONFLICT DO NOTHING.)
insert into public.user_vorsorge_config
  (user_id, tarif_name, name, icon, fachgebiet, empf_intervall_monate, axa_leistung, quelle)
select
  p.id as user_id,
  coalesce(p.pkv_tarif, p.tarif, 'AXA ActiveMed-U') as tarif_name,
  t.name, t.icon, t.fachgebiet, t.empf_intervall_monate, t.axa_leistung, 'hardcoded'
from public.profiles p
cross join (values
  ('Internist Jahres-Check',    '❤️',  'Innere Medizin',   12, true),
  ('Labor-Basisprofil',         '🔬', 'Labordiagnostik',  12, true),
  ('Dermatologie Hautscreening','🧬', 'Dermatologie',     24, true),
  ('Augenarzt Sehtest',         '👁️',  'Augenheilkunde',   24, true),
  ('Zahnarzt Prophylaxe',       '🦷', 'Zahnarzt',          6, true),
  ('Gynäkologische Vorsorge',   '🌸', 'Gynäkologie',      12, true)
) as t(name, icon, fachgebiet, empf_intervall_monate, axa_leistung)
where coalesce(p.versicherung, '') ilike '%axa%'
   or coalesce(p.pkv_name, '') ilike '%axa%'
   or coalesce(p.pkv_tarif, '') ilike '%active%'
on conflict (user_id, fachgebiet) do nothing;
