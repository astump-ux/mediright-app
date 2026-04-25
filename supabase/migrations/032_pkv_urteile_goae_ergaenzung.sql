-- Migration 032: pkv_urteile — Ergänzung GOÄ + spezielle Behandlungen
--
-- Neue verifizierte BGH-Urteile zu GOÄ-Abrechnungsstreitigkeiten,
-- Übermaßbehandlung, Hilfsmitteln und Fertilitätsbehandlungen.
-- Quellen: bundesgerichtshof.de, dejure.org, versicherungsbote.de
-- Stand: April 2026

INSERT INTO pkv_urteile
  (aktenzeichen, datum, gericht, senat, kategorie, schlagwoerter, leitsatz, relevanz_pkv, quelle_url)
VALUES

-- ── GOÄ / Übermaßbehandlung ───────────────────────────────────────────────────

(
  'IV ZR 278/01',
  '2003-03-12',
  'BGH',
  'IV. Zivilsenat',
  'goae',
  ARRAY['übermaßbehandlung', 'kostengründe', 'implantat', 'beweislast', 'teure behandlung', 'kostenargument'],
  'PKV-Versicherer darf Leistungen nicht allein aus Kostengründen ablehnen oder kürzen. Will der Versicherer wegen "Übermaßbehandlung" kürzen, muss er im Einzelnen beweisen, dass eine konkrete Behandlungsmaßnahme medizinisch nicht notwendig war. Auch teurere Behandlungen (z.B. Implantate statt konventioneller Versorgung) sind erstattungsfähig, wenn sie medizinisch notwendig sind.',
  'Schlüsselurteil gegen AXA-Ablehnungen auf Basis von Kosten: Wenn AXA eine Leistung als "unverhältnismäßig teuer" oder "Übermaßbehandlung" ablehnt, trägt AXA die vollständige Beweislast dafür, dass die einzelne Maßnahme nicht notwendig war. Das Kostenargument allein genügt nicht. Gilt insbesondere für teure Implantate, hochwertige Prothesen und innovative Therapien.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=12.03.2003&Aktenzeichen=IV+ZR+278/01'
),

-- ── GOÄ Analogziffer / Femtosekundenlaser ────────────────────────────────────

(
  'III ZR 350/20',
  '2021-10-14',
  'BGH',
  'III. Zivilsenat',
  'goae',
  ARRAY['femtosekundenlaser', 'kataraktoperation', 'analogziffer', 'goä 5855', 'nr. 441', 'laserchirurgie', 'analogabrechnung', 'modifikation'],
  'Der Einsatz des Femtosekundenlasers bei einer Kataraktoperation (Grauer Star) ist lediglich eine Modifikation der konventionellen Operation nach GOÄ Nr. 1375, keine eigenständige neue Behandlungsmethode. Die analoge Abrechnung nach GOÄ Nr. 5855 ("intraokuläre Eingriffe") ist daher unzulässig. Erstattungsfähig ist nur der Zuschlag GOÄ Nr. 441 (Laserchirurgie in der Augenheilkunde).',
  'Praktische Bedeutung bei Augen-OP-Rechnungen: PKV-Ablehnung der GOÄ 5855-Analogabrechnung kann berechtigt sein. Gegenangriff: Wenn Arzt GOÄ Nr. 441 abgerechnet hat, MUSS die PKV diesen Zuschlag erstatten. Prüfen ob AXA auch Nr. 441 abgelehnt hat — das wäre rechtswidrig. Hinweis: III ZR = Arzt-Patienten-Verhältnis, aber PKV-Erstattungspflicht folgt GOÄ-Konformität.',
  'https://www.christmann-law.de/neuigkeiten-mainmenu-66/1234-keine-extragebuehr-fuer-femtosekundenlasereinsatz-bei-operation-des-grauen-stars-bgh-14-10-2021.html'
),

-- ── Hilfsmittel ──────────────────────────────────────────────────────────────

(
  'IV ZR 419/13',
  '2015-04-22',
  'BGH',
  'IV. Zivilsenat',
  'medizinische_notwendigkeit',
  ARRAY['hilfsmittel', 'hörgerät', 'beweislast', 'leistungseinschränkung', 'hilfsmittelversorgung'],
  'Leistungseinschränkungen in PKV-Bedingungen erstrecken sich nicht automatisch auf alle Hilfsmittel. Will der Versicherer die Erstattung von Hilfsmitteln verweigern, muss er konkret beweisen, dass die jeweilige Maßnahme medizinisch nicht notwendig war. Maßstab ist der Marktpreis für vergleichbare Hilfsmittel.',
  'Relevant bei AXA-Ablehnungen von Hörgeräten, Rollstühlen, Orthesen, Prothesen oder anderen Hilfsmitteln: AXA muss konkret beweisen, dass das gewählte Hilfsmittel medizinisch nicht notwendig oder überdimensioniert war. Ablehnungen mit allgemeinen Hinweisen auf "Wirtschaftlichkeit" sind unzureichend.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=22.04.2015&Aktenzeichen=IV+ZR+419/13'
),

-- ── Fertilitätsbehandlung / IVF ───────────────────────────────────────────────

(
  'IV ZR 323/18',
  '2019-12-04',
  'BGH',
  'IV. Zivilsenat',
  'medizinische_notwendigkeit',
  ARRAY['ivf', 'icsi', 'in-vitro-fertilisation', 'künstliche befruchtung', 'fertilitätsbehandlung', 'alter', 'erfolgswahrscheinlichkeit', 'kryptozoospermie'],
  'PKV muss Kosten für IVF/ICSI-Behandlungszyklen erstatten, solange eine Erfolgswahrscheinlichkeit von mindestens 15% besteht. Das Alter der Frau allein ist kein ausreichender Ablehnungsgrund. Erst wenn die Erfolgswahrscheinlichkeit signifikant unter 15% absinkt, entfällt die Erstattungspflicht. Der Versicherer muss das konkret nachweisen.',
  'Direkt anwendbar bei AXA-Ablehnungen von IVF/ICSI: Ablehnung allein wegen "fortgeschrittenem Alter der Patientin" ist rechtswidrig. AXA muss konkret belegen, dass die Erfolgswahrscheinlichkeit unter 15% liegt — pauschal ablehnen geht nicht. Mehrere Behandlungszyklen können erstattungsfähig sein.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=04.12.2019&Aktenzeichen=IV+ZR+323/18'
)

ON CONFLICT (aktenzeichen) DO UPDATE SET
  leitsatz     = EXCLUDED.leitsatz,
  relevanz_pkv = EXCLUDED.relevanz_pkv,
  quelle_url   = EXCLUDED.quelle_url;
