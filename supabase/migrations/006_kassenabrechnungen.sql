-- Migration 006: Separate kassenabrechnungen table + matching fields
-- Run in Supabase SQL Editor

-- ── New table: kassenabrechnungen ─────────────────────────────────────────────
create table if not exists public.kassenabrechnungen (
  id                    uuid default gen_random_uuid() primary key,
  user_id               uuid references auth.users(id) on delete cascade not null,
  pdf_storage_path      text,
  kasse_analyse         jsonb,        -- full KasseAnalyseResult incl. rechnungen[]
  bescheiddatum         date,
  referenznummer        text,
  betrag_eingereicht    numeric(10,2) default 0,
  betrag_erstattet      numeric(10,2) default 0,
  betrag_abgelehnt      numeric(10,2) default 0,
  widerspruch_empfohlen boolean default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table public.kassenabrechnungen enable row level security;

create policy "Users manage own kassenabrechnungen"
  on public.kassenabrechnungen for all
  using (auth.uid() = user_id);

create index if not exists kassenabrechnungen_user_id_idx
  on public.kassenabrechnungen(user_id, created_at desc);

-- ── vorgaenge: add matching fields ───────────────────────────────────────────
alter table public.vorgaenge
  add column if not exists kassenabrechnung_id uuid references public.kassenabrechnungen(id),
  add column if not exists kasse_match_status  text default 'unmatched',
  add column if not exists betrag_erstattet    numeric(10,2),
  add column if not exists betrag_abgelehnt    numeric(10,2);

create index if not exists vorgaenge_kassenabrechnung_id_idx
  on public.vorgaenge(kassenabrechnung_id);

-- ── Backfill: promote embedded kasse data to kassenabrechnungen ───────────────
do $$
declare
  v record;
  new_kasse_id uuid;
begin
  for v in
    select id, user_id, kasse_pdf_storage_path, kasse_analyse,
           kasse_eingegangen_am, kasse_referenznummer,
           betrag_erstattet, betrag_abgelehnt
    from public.vorgaenge
    where kasse_pdf_storage_path is not null
      and kassenabrechnung_id is null
  loop
    insert into public.kassenabrechnungen (
      user_id, pdf_storage_path, kasse_analyse,
      bescheiddatum, referenznummer,
      betrag_eingereicht, betrag_erstattet, betrag_abgelehnt,
      widerspruch_empfohlen
    )
    values (
      v.user_id,
      v.kasse_pdf_storage_path,
      v.kasse_analyse,
      v.kasse_eingegangen_am,
      v.kasse_referenznummer,
      coalesce((v.kasse_analyse->>'betragEingereicht')::numeric, 0),
      coalesce(v.betrag_erstattet, 0),
      coalesce(v.betrag_abgelehnt, 0),
      coalesce((v.kasse_analyse->>'widerspruchEmpfohlen')::boolean, false)
    )
    returning id into new_kasse_id;

    update public.vorgaenge
    set kassenabrechnung_id = new_kasse_id,
        kasse_match_status  = 'matched'
    where id = v.id;
  end loop;
end $$;
