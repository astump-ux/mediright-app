-- Migration 009: Split Einsparpotenzial into Kasse vs. Arzt
-- Run in Supabase SQL Editor
--
-- Background:
--   kasse_analyse.rechnungen[].positionen[].aktionstyp now carries
--   "widerspruch_kasse" | "korrektur_arzt" | null per position.
--   We materialise the aggregated amounts as regular columns so that
--   dashboard queries stay fast and don't need to traverse JSONB.

-- ── kassenabrechnungen: add split columns ─────────────────────────────────────
alter table public.kassenabrechnungen
  -- Amount where a formal appeal to the insurance is recommended
  add column if not exists betrag_widerspruch_kasse numeric(10,2) default 0,
  -- Amount where the doctor should be asked to correct / re-issue the invoice
  add column if not exists betrag_korrektur_arzt    numeric(10,2) default 0;

-- ── Backfill from existing kasse_analyse JSONB ───────────────────────────────
-- For each kassenabrechnungen row that already has kasse_analyse data,
-- iterate the positionen and sum up by aktionstyp.
-- Rows without aktionstyp (older analyses) default to:
--   abgelehnt → widerspruch_kasse (conservative assumption)
--   gekuerzt  → korrektur_arzt   (conservative assumption)
do $$
declare
  ka_row record;
  pos    jsonb;
  gruppe jsonb;
  betrag_wk numeric := 0;
  betrag_ka numeric := 0;
  eingestellt numeric;
  erstattet   numeric;
  kuerzung    numeric;
  atyp        text;
begin
  for ka_row in
    select id, kasse_analyse
    from public.kassenabrechnungen
    where kasse_analyse is not null
      and (betrag_widerspruch_kasse = 0 or betrag_widerspruch_kasse is null)
  loop
    betrag_wk := 0;
    betrag_ka := 0;

    for gruppe in select jsonb_array_elements(ka_row.kasse_analyse->'rechnungen')
    loop
      for pos in select jsonb_array_elements(gruppe->'positionen')
      loop
        eingestellt := coalesce((pos->>'betragEingereicht')::numeric, 0);
        erstattet   := coalesce((pos->>'betragErstattet')::numeric, 0);
        kuerzung    := greatest(eingestellt - erstattet, 0);
        atyp        := pos->>'aktionstyp';

        if kuerzung > 0 then
          if atyp = 'widerspruch_kasse' then
            betrag_wk := betrag_wk + kuerzung;
          elsif atyp = 'korrektur_arzt' then
            betrag_ka := betrag_ka + kuerzung;
          elsif pos->>'status' = 'abgelehnt' then
            -- Old data without aktionstyp: assume abgelehnt = kasse-side
            betrag_wk := betrag_wk + kuerzung;
          elsif pos->>'status' = 'gekuerzt' then
            -- Old data without aktionstyp: assume gekuerzt = arzt-side
            betrag_ka := betrag_ka + kuerzung;
          end if;
        end if;
      end loop;
    end loop;

    update public.kassenabrechnungen
    set betrag_widerspruch_kasse = round(betrag_wk, 2),
        betrag_korrektur_arzt    = round(betrag_ka, 2)
    where id = ka_row.id;
  end loop;
end $$;

-- ── vorgaenge: split einsparpotenzial ────────────────────────────────────────
-- The existing einsparpotenzial column on vorgaenge is GOÄ-based (arzt-side).
-- We rename the concept: add an explicit einsparpotenzial_arzt alias and
-- a new einsparpotenzial_kasse column (filled via kassenabrechnung matching).
alter table public.vorgaenge
  add column if not exists einsparpotenzial_kasse numeric(10,2) default 0;

-- Note: vorgaenge.einsparpotenzial already represents the GOÄ/arzt potential.
-- einsparpotenzial_kasse will be populated by the analyze-kasse route when
-- positionen with aktionstyp="widerspruch_kasse" are matched to this vorgang.
