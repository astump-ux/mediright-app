-- Migration 002: Unique constraint on aerzte (user_id, name)
-- Needed for upsert in analyze API route

alter table public.aerzte
  add constraint aerzte_user_id_name_unique unique (user_id, name);
