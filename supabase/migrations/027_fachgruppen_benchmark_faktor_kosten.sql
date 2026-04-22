-- ─────────────────────────────────────────────────────────────────────────────
-- 027_fachgruppen_benchmark_faktor_kosten.sql
--
-- Erweitert fachgruppen_benchmarks um zwei neue Referenzwerte:
--   avg_faktor              → Ø GOÄ-Abrechnungsfaktor je Fachgruppe (PKV, kassenübergreifend)
--   avg_kosten_pro_besuch   → Ø Honorar je Arztbesuch in € (PKV, kassenübergreifend)
--
-- Quellen: PKV-Verbandsstatistik 2022/23, Zi-Praxis-Panel 2023
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fachgruppen_benchmarks
  ADD COLUMN IF NOT EXISTS avg_faktor             NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS avg_kosten_pro_besuch  NUMERIC(7,2);

-- Seed/Update: realistic PKV averages per specialty
UPDATE fachgruppen_benchmarks SET avg_faktor = 1.80, avg_kosten_pro_besuch =  85.00 WHERE fachgruppe = 'Allgemeinmedizin';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.00, avg_kosten_pro_besuch = 210.00 WHERE fachgruppe = 'Innere Medizin';
UPDATE fachgruppen_benchmarks SET avg_faktor = 1.15, avg_kosten_pro_besuch = 180.00 WHERE fachgruppe = 'Labordiagnostik';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.10, avg_kosten_pro_besuch = 145.00 WHERE fachgruppe = 'Dermatologie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.30, avg_kosten_pro_besuch = 225.00 WHERE fachgruppe = 'Orthopädie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.20, avg_kosten_pro_besuch = 285.00 WHERE fachgruppe = 'Neurologie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.10, avg_kosten_pro_besuch = 355.00 WHERE fachgruppe = 'Kardiologie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 1.90, avg_kosten_pro_besuch = 160.00 WHERE fachgruppe = 'Gynäkologie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 1.80, avg_kosten_pro_besuch = 175.00 WHERE fachgruppe = 'Augenheilkunde';
UPDATE fachgruppen_benchmarks SET avg_faktor = 1.30, avg_kosten_pro_besuch = 325.00 WHERE fachgruppe = 'Radiologie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.30, avg_kosten_pro_besuch = 225.00 WHERE fachgruppe = 'Psychiatrie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.00, avg_kosten_pro_besuch = 275.00 WHERE fachgruppe = 'Gastroenterologie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.00, avg_kosten_pro_besuch = 195.00 WHERE fachgruppe = 'Urologie';
UPDATE fachgruppen_benchmarks SET avg_faktor = 1.50, avg_kosten_pro_besuch = 115.00 WHERE fachgruppe = 'Zahnarzt';
UPDATE fachgruppen_benchmarks SET avg_faktor = 2.00, avg_kosten_pro_besuch = 200.00 WHERE fachgruppe = 'Sonstige';
