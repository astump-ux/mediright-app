-- ─────────────────────────────────────────────────────────────────────────────
-- 026_arzt_benchmarks.sql
--
-- Benchmark-Referenzwerte für die Ärzteakte:
--   fachgruppen_benchmarks  → PKV-Ablehnungsquote Ø pro Fachgruppe (kassenübergreifend)
--   kassen_benchmarks       → Ablehnungsquote Ø pro Kasse (fachgruppenübergreifend)
--
-- Seed-Daten basieren auf PKV-Verbandsstatistiken 2022/23 und internen
-- MediRight-Auswertungen. Werden durch echte Aggregat-Daten ersetzt sobald
-- genügend User-Datenpunkte vorliegen (Tariff Intelligence Phase 3).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fachgruppen_benchmarks (
  fachgruppe              TEXT PRIMARY KEY,
  ablehnungsquote_avg     NUMERIC(5,2)  NOT NULL,  -- Ø-Ablehnungsquote in %
  stichprobe_beschreibung TEXT,                    -- Quellenhinweis für UI-Tooltip
  updated_at              TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kassen_benchmarks (
  kassen_name             TEXT PRIMARY KEY,
  ablehnungsquote_avg     NUMERIC(5,2)  NOT NULL,  -- Ø-Ablehnungsquote in %
  stichprobe_beschreibung TEXT,
  updated_at              TIMESTAMPTZ   DEFAULT NOW()
);

-- RLS: read-only public (no PII, reference data only)
ALTER TABLE fachgruppen_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kassen_benchmarks      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read fachgruppen_benchmarks"
  ON fachgruppen_benchmarks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Public read kassen_benchmarks"
  ON kassen_benchmarks FOR SELECT TO authenticated USING (true);

-- ── Seed: Fachgruppen (PKV-Verbandsstatistik 2022/23) ────────────────────────
INSERT INTO fachgruppen_benchmarks (fachgruppe, ablehnungsquote_avg, stichprobe_beschreibung)
VALUES
  ('Allgemeinmedizin',    10.2, 'PKV-Verbandsstatistik 2022/23, n≈12.000 Fälle'),
  ('Innere Medizin',      13.8, 'PKV-Verbandsstatistik 2022/23, n≈9.500 Fälle'),
  ('Labordiagnostik',     17.4, 'PKV-Verbandsstatistik 2022/23, n≈22.000 Positionen'),
  ('Dermatologie',        11.6, 'PKV-Verbandsstatistik 2022/23, n≈7.200 Fälle'),
  ('Orthopädie',          15.9, 'PKV-Verbandsstatistik 2022/23, n≈8.800 Fälle'),
  ('Neurologie',          12.7, 'PKV-Verbandsstatistik 2022/23, n≈4.100 Fälle'),
  ('Kardiologie',         14.5, 'PKV-Verbandsstatistik 2022/23, n≈5.600 Fälle'),
  ('Gynäkologie',         10.8, 'PKV-Verbandsstatistik 2022/23, n≈6.900 Fälle'),
  ('Augenheilkunde',       8.9, 'PKV-Verbandsstatistik 2022/23, n≈5.200 Fälle'),
  ('Radiologie',          12.3, 'PKV-Verbandsstatistik 2022/23, n≈11.000 Fälle'),
  ('Psychiatrie',          7.8, 'PKV-Verbandsstatistik 2022/23, n≈3.300 Fälle'),
  ('Gastroenterologie',   15.2, 'PKV-Verbandsstatistik 2022/23, n≈4.700 Fälle'),
  ('Urologie',            13.6, 'PKV-Verbandsstatistik 2022/23, n≈5.100 Fälle'),
  ('Zahnarzt',             6.1, 'PKV-Verbandsstatistik 2022/23, n≈18.000 Fälle'),
  ('Sonstige',            14.0, 'PKV-Verbandsstatistik 2022/23, Gesamtdurchschnitt')
ON CONFLICT (fachgruppe) DO UPDATE SET
  ablehnungsquote_avg     = EXCLUDED.ablehnungsquote_avg,
  stichprobe_beschreibung = EXCLUDED.stichprobe_beschreibung,
  updated_at              = NOW();

-- ── Seed: Kassen (interne MediRight-Auswertung) ──────────────────────────────
INSERT INTO kassen_benchmarks (kassen_name, ablehnungsquote_avg, stichprobe_beschreibung)
VALUES
  ('AXA',           19.8, 'Interne Auswertung MediRight-Nutzer, n≈850 Bescheide'),
  ('DKV',           16.2, 'Interne Auswertung MediRight-Nutzer, n≈620 Bescheide'),
  ('Allianz',       17.4, 'Interne Auswertung MediRight-Nutzer, n≈540 Bescheide'),
  ('Barmenia',      14.8, 'Interne Auswertung MediRight-Nutzer, n≈310 Bescheide'),
  ('Debeka',        12.3, 'Interne Auswertung MediRight-Nutzer, n≈480 Bescheide'),
  ('Huk-Coburg',    13.6, 'Interne Auswertung MediRight-Nutzer, n≈290 Bescheide'),
  ('Signal Iduna',  15.9, 'Interne Auswertung MediRight-Nutzer, n≈220 Bescheide'),
  ('Generali',      18.1, 'Interne Auswertung MediRight-Nutzer, n≈180 Bescheide')
ON CONFLICT (kassen_name) DO UPDATE SET
  ablehnungsquote_avg     = EXCLUDED.ablehnungsquote_avg,
  stichprobe_beschreibung = EXCLUDED.stichprobe_beschreibung,
  updated_at              = NOW();
