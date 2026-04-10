-- Migration 007: Denormalize arzt_name onto vorgaenge for fast matching
-- Run in Supabase SQL Editor

alter table public.vorgaenge
  add column if not exists arzt_name text;

-- Backfill from aerzte table via arzt_id
update public.vorgaenge v
set arzt_name = a.name
from public.aerzte a
where v.arzt_id = a.id
  and v.arzt_name is null;

-- Also backfill from claude_analyse JSONB if arzt_id is missing
update public.vorgaenge
set arzt_name = claude_analyse->>'arztName'
where arzt_name is null
  and claude_analyse->>'arztName' is not null;

-- Index for matching queries
create index if not exists vorgaenge_arzt_name_idx
  on public.vorgaenge(user_id, arzt_name);
