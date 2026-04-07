-- MediRight Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ictuodzsvehxjxkvqrul/sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- USERS (extends Supabase auth.users)
-- =============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  versicherung text default 'AXA',
  tarif text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- ÄRZTE
-- =============================================
create table public.aerzte (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  fachgebiet text,
  adresse text,
  created_at timestamptz default now()
);
alter table public.aerzte enable row level security;
create policy "Users manage own aerzte" on public.aerzte
  for all using (auth.uid() = user_id);

-- =============================================
-- VORGÄNGE (Rechnungen)
-- =============================================
create table public.vorgaenge (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  arzt_id uuid references public.aerzte(id) on delete set null,

  -- Rechnung
  rechnungsdatum date,
  rechnungsnummer text,
  betrag_gesamt numeric(10,2),

  -- GOÄ Analyse
  goae_positionen jsonb,          -- [{ziffer, bezeichnung, faktor, betrag}]
  max_faktor numeric(4,2),
  flag_faktor_ueber_schwellenwert boolean default false,
  flag_fehlende_begruendung boolean default false,

  -- Erstattung
  eingereicht_am date,
  erstattet_am date,
  betrag_erstattet numeric(10,2),
  betrag_abgelehnt numeric(10,2),
  ablehnungsgrund text,

  -- Status
  status text check (status in ('offen','eingereicht','erstattet','abgelehnt','pruefen')) default 'offen',

  -- Dokumente
  pdf_storage_path text,          -- Supabase Storage path

  -- KI-Analyse
  claude_analyse jsonb,           -- Raw Claude API response
  einsparpotenzial numeric(10,2),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.vorgaenge enable row level security;
create policy "Users manage own vorgaenge" on public.vorgaenge
  for all using (auth.uid() = user_id);

-- =============================================
-- KASSE STATS (aggregiert, gecacht)
-- =============================================
create table public.kasse_stats (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  year int not null,
  month int,

  ablehnungsrate numeric(5,2),
  stille_kuerzung numeric(10,2),
  erstattungsquote numeric(5,2),

  updated_at timestamptz default now(),
  unique(user_id, year, month)
);
alter table public.kasse_stats enable row level security;
create policy "Users manage own kasse_stats" on public.kasse_stats
  for all using (auth.uid() = user_id);

-- =============================================
-- STORAGE BUCKET für PDFs
-- =============================================
insert into storage.buckets (id, name, public) values ('rechnungen', 'rechnungen', false);
create policy "Users upload own rechnungen" on storage.objects
  for insert with check (bucket_id = 'rechnungen' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users read own rechnungen" on storage.objects
  for select using (bucket_id = 'rechnungen' and auth.uid()::text = (storage.foldername(name))[1]);
