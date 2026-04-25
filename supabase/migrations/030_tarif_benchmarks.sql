-- Migration 030: tarif_benchmarks
-- Admin-seitige Benchmark-Tarif-Profile der führenden PKV-Versicherer
-- Kein user_id — systemweite Referenzdaten für alle Nutzer

create table if not exists tarif_benchmarks (
  id              uuid primary key default gen_random_uuid(),
  versicherer     text not null,           -- z.B. "DKV", "Allianz", "Debeka"
  tarif_name      text not null,           -- z.B. "BestMed Komfort"
  tarif_typ       text not null default 'vollversicherung',
  avb_version     text,                    -- Versionsstempel des PDFs
  avb_url         text,                    -- Quell-URL des PDFs
  profil_json     jsonb,                   -- strukturiertes Tarif-Profil (gleiches Schema wie tarif_profile)
  analyse_status  text not null default 'pending',  -- pending | completed | failed
  analysiert_am   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (versicherer, tarif_name)
);

-- RLS: nur service_role darf schreiben, alle authentifizierten Nutzer dürfen lesen
alter table tarif_benchmarks enable row level security;

create policy "Authentifizierte Nutzer können Benchmarks lesen"
  on tarif_benchmarks for select
  to authenticated
  using (true);

-- Seed: Placeholder-Einträge für die 5 Leitversicherer
insert into tarif_benchmarks (versicherer, tarif_name, avb_url, analyse_status) values
  ('Debeka',       'BKV Unisex (MB/KK 2009)',           'https://www.debeka.de/content/dam/de/webauftritt/vertragsgrundlagen/krankenversicherung-unisex-tarife/BKV1.pdf', 'pending'),
  ('DKV',          'BestMed Komfort',                    'https://sites.dkv.com/dkv-com/pdf/B502.pdf',                                                                      'pending'),
  ('Allianz',      'MeinGesundheitsschutz Plus 70',      'https://www.online-pkv.de/wp-content/uploads/2024/03/avb_allianz_Versicherungsbedingungen_Tarif_MeinGesundheitsschutz_Plus70_GSP70.pdf', 'pending'),
  ('Signal Iduna', 'KOMFORT-SI (2025)',                  'https://www.online-pkv.de/wp-content/uploads/2025/09/AVB_Signal_Iduna_1395201_Okt25_KOMFORT-SI.pdf',             'pending'),
  ('Barmenia',     'Krankheitskostenversicherung K4602', 'https://media.barmenia.de/media/global_media/dokumente/dokumentencenter/bk/bedingungen_2/K4602.pdf',             'pending')
on conflict (versicherer, tarif_name) do nothing;
