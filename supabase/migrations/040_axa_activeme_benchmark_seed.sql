-- Migration 040: AXA ActiveMe-U Benchmark Seed
-- Speist das bereits vollständig analysierte AXA ActiveMe-U Tarif-Profil
-- in tarif_benchmarks ein. Zukünftige AXA-User erhalten die Analyse
-- sofort aus dem Cache (kein Opus-Call nötig).
-- Persönliche Daten wurden entfernt (Versicherungsnr., Name, Beitrag).

insert into tarif_benchmarks (
  versicherer,
  tarif_name,
  tarif_typ,
  avb_version,
  avb_url,
  profil_json,
  analyse_status,
  analysiert_am
) values (
  'AXA Krankenversicherung AG',
  'ActiveMe-U',
  'vollversicherung',
  'VG100 (gültig ab 01.01.2025, Beitragsstand 01.01.2026)',
  'https://www.axa.de/privatkunden/gesundheit/private-krankenversicherung',
  $json${"versicherung": "AXA Krankenversicherung AG", "tarif_name": "ActiveMe-U", "avb_version": "VG100 (gültig ab 01.01.2025, Beitragsstand 01.01.2026)", "versicherungsnummer": null, "gesundheitslotse": {"mit_lotse_pct": 100, "ohne_lotse_pct": 80, "lotsen_definition": ["Internist ohne Schwerpunktspezialisierung", "Facharzt für Gynäkologie", "Augenarzt (Augenheilkunde)", "Kinder- und Jugendmedizin (Kinderarzt)", "Notarzt oder Betriebsarzt", "Arzt über AXA-Telefonservice oder digitalen Service"], "quelle": "VG100, Seite 1 von 8 (PDF-Seite 37), Abschnitt A.(1)"}, "selbstbehalt": {"prozent": 20, "jahresmaximum_eur": 500, "ausnahmen_kein_selbstbehalt": ["Vorsorgeuntersuchungen nach gesetzlich eingeführten Programmen (A.1)", "Schutzimpfungen (A.1)", "Psychotherapie (A.1)", "Heilmittel – Physio, Logo, Ergo etc. (A.1)", "Digitale Gesundheitsanwendungen / DiGA (A.1)", "Stationäre Entziehungsmaßnahmen (A.2)", "Betreuungspauschale bei Kindererkrankung (A.3)"], "quelle": "VG100, Seite 5 von 8 (PDF-Seite 41), Abschnitt B"}, "erstattungssaetze": {"arzt_mit_lotse_pct": 100, "arzt_ohne_lotse_pct": 80, "arzneimittel_generikum_pct": 100, "arzneimittel_original_pct": 80, "heilmittel_bis_grenze_pct": 80, "heilmittel_jahresgrenze_eur": 1600, "heilmittel_ueber_grenze_pct": 100, "heilpraktiker_pct": 80, "heilpraktiker_jahresmax_eur": 1000, "psychotherapie_pct": 80, "vorsorge_impfungen_pct": 100, "praevention_pct": 100, "praevention_max_eur": 200, "praevention_max_kurse_pro_jahr": 2, "sehhilfen_pct": 100, "sehhilfen_limit_eur_2jahre": 250, "lasik_pct": 100, "lasik_limit_eur_pro_auge": 1000, "stationaer_vollstationaer_pct": 100, "stationaer_privatarzt": true, "stationaer_zweibettzimmer_pct": 100, "rehabilitation_pct": 100, "rehabilitation_frequenz": "Einmal in 4 Versicherungsjahren"}, "goae_regelung": {"regelsteigerungssatz_arzt": 2.3, "regelsteigerungssatz_zahnarzt": 1.8, "regelsteigerungssatz_labor": 1.15, "begruendungspflicht_ab_faktor": 2.3, "kommentar": "AXA erstattet preislich angemessene Leistungen gemäß GOÄ. Höherer Faktor möglich wenn Arzt auf Rechnung schriftlich begründet (§ 5 Abs. 2 GOÄ). AXA trägt Beweislast bei Kürzung (BGH IV ZR 357/15)."}, "sonderklauseln": [{"id": "LE/3", "bezeichnung": "Leistungsausschluss: Mehrleistungen ActiveMe-U gegenüber VITAL 250", "wortlaut": "Die im Tarif ACTIVE ME-U vorgesehenen Mehrleistungen im Verhältnis zum Tarif/zu den Tarifen VITAL 250 sind insgesamt vom Versicherungsschutz ausgeschlossen.", "risiko": "KRITISCH", "quelle": "Versicherungsschein Seite 3", "rechtliche_angreifbarkeit": "Klausel verweist auf nicht ausgehändigte externe Dokumente (VITAL-250-Tarifblätter). AXA trägt volle Beweislast für den Mehrleistungsstatus. Möglicher Verstoß gegen Transparenzgebot § 307 BGB + § 305c BGB."}, {"id": "sI/1", "bezeichnung": "Gruppenvertrag", "wortlaut": "Der Tarif wird im Rahmen eines Gruppenvertrages geführt.", "risiko": "MITTEL", "quelle": "Versicherungsschein Seite 2", "rechtliche_angreifbarkeit": "Bei Beendigung des Gruppenvertrags: Übergangsrecht § 204 VVG – Wechsel in Einzelvertrag ohne neue Gesundheitsprüfung möglich."}], "quelldokumente_gefunden": [{"bezeichnung": "VG001", "typ": "AVB/KK – MB/KK 2009 + TB 2012", "seiten": "1-12"}, {"bezeichnung": "VG010", "typ": "Allgemeine Tarifbedingungen ActiveMe-U Basis", "seiten": "13-36"}, {"bezeichnung": "VG100", "typ": "Tarifbedingungen ActiveMe-U – Kernleistungen (8 Seiten)", "seiten": "37-44"}, {"bezeichnung": "VG596", "typ": "Heilmittelliste – Preisverzeichnis (3 Seiten)", "seiten": "78-80"}], "wichtige_hinweise": ["Selbstbehalt 20% mit Jahresmax. 500 EUR – Heilmittel, Psychotherapie, DiGA und Vorsorge sind AUSGENOMMEN", "Lotse-Pflicht: Ohne Gesundheitslotse nur 80% statt 100% Erstattung", "LE/3-Klausel: Mehrleistungen gegenüber VITAL 250 ausgeschlossen – AXA trägt Beweislast", "GOÄ-Beweislast liegt bei AXA bei Kürzungen (BGH IV ZR 357/15)", "Haushaltshilfe: OHNE vorherige schriftliche Zusage von AXA kein Anspruch", "Rehabilitation: einmal in 4 Versicherungsjahren, 100% inkl. Chefarzt + Zweibettzimmer", "Ausland außerhalb EWR: max. 6 Monate (ohne Sondervereinbarung)", "Psychotherapie Wartezeit: 8 Monate (Ausnahme: Unfälle)"], "_quelle": "manual_seed", "_analyst": "Claude PKV-Agent, OCR-Analyse Originaldokumente (2026-04-25)"}$json$::jsonb,
  'completed',
  now()
)
on conflict (versicherer, tarif_name) do update set
  profil_json    = excluded.profil_json,
  avb_version    = excluded.avb_version,
  analyse_status = 'completed',
  analysiert_am  = now(),
  updated_at     = now();
