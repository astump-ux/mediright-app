-- Migration 038: OLG-Urteile — PKV-Rechtsprechung der Oberlandesgerichte
--
-- Ergänzt die BGH-Urteile aus Migrations 031+032 um die wichtigsten OLG-Entscheidungen.
-- OLG-Urteile sind persuasiv (nicht bindend wie BGH), aber werden von Versicherern
-- und Gerichten ernst genommen, insbesondere bei GOÄ-Streitigkeiten und
-- medizinischer Notwendigkeit.
--
-- Quellen: dejure.org, iurado.de, lexika.de, jusmeum.de (April 2026)
-- Kategorien: medizinische_notwendigkeit | goae | ausschlussklausel | allgemein
-- Alle Aktenzeichen über Web-Recherche verifiziert.

INSERT INTO pkv_urteile
  (aktenzeichen, datum, gericht, senat, kategorie, schlagwoerter, leitsatz, relevanz_pkv, quelle_url)
VALUES

-- ── MEDIZINISCHE NOTWENDIGKEIT ───────────────────────────────────────────────

(
  'OLG Braunschweig 11 U 122/18',
  '2020-09-16',
  'OLG Braunschweig',
  '11. Zivilsenat',
  'medizinische_notwendigkeit',
  ARRAY['medizinisch notwendig','Heilbehandlung','Diagnosehierarchie','Stufenschema'],
  'Die medizinische Notwendigkeit einer Heilbehandlung ist gegeben, wenn eine wissenschaftlich anerkannte Behandlungsmethode zur Verfügung steht und angewandt wird, die geeignet ist, die Krankheit zu heilen, zu lindern oder ihrer Verschlimmerung entgegenzuwirken. Ein stufenweises Diagnoseschema (erst Basisdiagnostik, dann Spezialdiagnostik) ist für die PKV-Leistungspflicht nicht erforderlich.',
  'Stärkt Versicherungsnehmer erheblich: PKV kann Leistung nicht mit dem Argument verweigern, der Arzt hätte zunächst günstigere Methoden versuchen müssen, bevor er auf teurere Diagnostik zurückgreift. Die Wahl der Methode liegt beim Arzt.',
  'https://www.iurado.de/?p=urteile&site=iurado&id=4349'
),

(
  'OLG Karlsruhe 12 U 127/12',
  '2013-06-27',
  'OLG Karlsruhe',
  '12. Zivilsenat',
  'medizinische_notwendigkeit',
  ARRAY['medizinisch notwendig','Erstuntersuchung','Heilbehandlung','Diagnose','Versicherungsfall'],
  'Die erste ärztliche Empfehlung und Durchführung medizinisch notwendiger Maßnahmen gehört zur Primärrisikoumschreibung des Tarifs. Eine Heilbehandlung beginnt mit der ersten Inanspruchnahme ärztlicher Tätigkeit, wobei auch die erste auf die Erkennung des Leidens gerichtete ärztliche Untersuchung als Heilbehandlung gilt — unabhängig davon, ob sofort eine endgültige Diagnose gestellt werden kann.',
  'Relevant wenn PKV die Erstattung einer Diagnose-Untersuchung ablehnt mit dem Argument, es liege noch keine gesicherte Diagnose vor. OLG Karlsruhe stellt klar: Schon die diagnostische Abklärung ist Heilbehandlung.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=OLG+Karlsruhe&Datum=27.06.2013&Aktenzeichen=12+U+127/12'
),

(
  'OLG Nürnberg 8 U 1311/20',
  '2020-09-17',
  'OLG Nürnberg',
  '8. Zivilsenat',
  'medizinische_notwendigkeit',
  ARRAY['medizinisch notwendig','Physiotherapie','Heilmittel','Feststellungsklage','wiederkehrend'],
  'Bei regelmäßig wiederkehrenden medizinisch notwendigen physiotherapeutischen Behandlungsmaßnahmen kann der Versicherungsnehmer eine Feststellungsklage erheben, die die zukünftige Erstattungspflicht des PKV-Versicherers klärt. Der Versicherer kann sich nicht auf eine Einzelfallbeurteilung zurückziehen, wenn ein chronisches Krankheitsbild dauerhaft diese Leistungen erfordert.',
  'Wichtig für chronische Erkrankungen, die dauerhaft Physiotherapie oder Heilmittel benötigen. Versicherter kann Erstattungspflicht präventiv gerichtlich feststellen lassen, statt jedes Mal einzeln klagen zu müssen.',
  NULL
),

-- ── GOÄ / ANALOGZIFFERN ──────────────────────────────────────────────────────

(
  'OLG Naumburg 4 U 28/16',
  '2019-05-09',
  'OLG Naumburg',
  '4. Zivilsenat',
  'goae',
  ARRAY['Femtosekundenlaser','Kataraktoperation','GOÄ 1375','Analogziffer','§ 6 GOÄ','§ 4 GOÄ','besondere Ausführung'],
  'Der Einsatz des Femtosekundenlasers bei einer Kataraktoperation stellt keine eigenständige Leistung im Sinne von § 6 Abs. 2 GOÄ dar, sondern eine besondere Ausführung der Katarakt-OP nach GOÄ 1375 (§ 4 Abs. 2a GOÄ). Eine Analogabrechnung als eigenständige Leistung scheidet daher aus. Zulässig ist allenfalls ein Laserzuschlag nach GOÄ 441.',
  'PKV muss Katarakt-OPs mit Femtolaser nicht als eigenständige Analogleistung erstatten. Abrechenbar ist nur GOÄ 1375 plus ggf. GOÄ 441 (Laserzuschlag). Relevant für alle Streitigkeiten bei Augenlaser-Operationen.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=OLG+Naumburg&Datum=09.05.2019&Aktenzeichen=4+U+28/16'
),

(
  'OLG Düsseldorf I-4 U 162/18',
  '2020-08-28',
  'OLG Düsseldorf',
  '4. Zivilsenat',
  'goae',
  ARRAY['Femtosekundenlaser','Kataraktoperation','GOÄ 1375','Analogziffer','Erstattung'],
  'Bestätigt die Rechtsprechungslinie des OLG Naumburg (4 U 28/16): Der Einsatz des Femtosekundenlasers bei Katarakt-OPs begründet keinen Anspruch auf Erstattung einer analogen GOÄ-Position als eigenständige Leistung. Die PKV schuldet Erstattung nach GOÄ 1375 sowie den zutreffenden Zuschlagsziffern, nicht jedoch einer frei gewählten Analogziffer für den Laser.',
  'Zweite OLG-Instanz zur Femtolaser-Problematik. Gemeinsam mit OLG Naumburg bildet dieses Urteil die herrschende OLG-Linie, die der BGH mit Urteilen vom 14.10.2021 bestätigt hat.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Text=4+U+162/18'
),

(
  'OLG Koblenz 10 U 1328/03',
  '2004-03-19',
  'OLG Koblenz',
  '10. Zivilsenat',
  'medizinische_notwendigkeit',
  ARRAY['Heilpraktiker','medizinisch notwendig','physikalische Therapie','innere Medizin','Versicherungsfall'],
  'Die medizinische Notwendigkeit einer Heilbehandlung durch Heilpraktiker ist nach denselben Maßstäben wie bei Ärzten zu beurteilen. Entscheidend ist, ob die Behandlung nach medizinisch-wissenschaftlichen Erkenntnissen geeignet war, Krankheitssymptome zu lindern oder die Krankheit zu behandeln. Die fehlende kassenärztliche Anerkennung einer Methode schließt die medizinische Notwendigkeit für die PKV nicht aus.',
  'Stärkt Erstattungsansprüche bei Heilpraktiker-Behandlungen. PKV kann Erstattung nicht allein damit verweigern, dass die Methode nicht von der GKV anerkannt wird — maßgeblich ist die medizinisch-wissenschaftliche Eignung.',
  'https://www.jusmeum.de/urteil/olg_koblenz/9409bf11c554771ccac13ae9a3ee11ac64d8ff2eadb6a6ad257e3221a55aaf09'
),

-- ── AUSSCHLUSSKLAUSELN / AGB ──────────────────────────────────────────────────

(
  'OLG Hamm 6 U 214/15',
  '2016-12-12',
  'OLG Hamm',
  '6. Zivilsenat',
  'ausschlussklausel',
  ARRAY['Leistungsausschluss','AGB','Transparenzgebot','§ 307 BGB','Klausel','Versicherungsbedingungen'],
  'Leistungsausschlussklauseln in privaten Krankenversicherungsverträgen müssen für einen durchschnittlichen Versicherungsnehmer klar und verständlich formuliert sein (Transparenzgebot, § 307 Abs. 1 S. 2 BGB). Unklare oder mehrdeutige Ausschlussklauseln gehen zu Lasten des Versicherers. Der Versicherer muss zweifelsfrei nachweisen, dass die Voraussetzungen des Leistungsausschlusses erfüllt sind.',
  'Direkt anwendbar wenn AXA sich auf eine unklar formulierte Klausel (z. B. LE/3-Sondervereinbarung) beruft. Unklare Klauseln → Auslegung zugunsten des Versicherungsnehmers, Beweislast beim Versicherer.',
  'https://nrwe.justiz.nrw.de/olgs/hamm/j2016/6_U_214_15_Urteil_20161212.html'
),

(
  'OLG Saarbrücken 5 U 89/18',
  '2019-06-26',
  'OLG Saarbrücken',
  '5. Zivilsenat',
  'ausschlussklausel',
  ARRAY['Risikoausschluss','Vorerkrankung','Beweislast','Versicherer','Leistungsfreiheit'],
  'Bei Berufung des Versicherers auf einen vereinbarten Risikoausschluss (z. B. wegen Vorerkrankung) trägt der Versicherer die vollständige Darlegungs- und Beweislast dafür, dass der Ausschlusstatbestand erfüllt ist. Ein Beweismaß von "überwiegender Wahrscheinlichkeit" reicht nicht aus — der Versicherer muss den Vollbeweis führen.',
  'Wenn AXA eine Leistung unter Berufung auf einen Vorerkrankungs- oder sonstigen Ausschluss verweigert: Versicherer muss dies vollständig beweisen. Zweifel gehen zu Lasten des Versicherers.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Text=BeckRS+2019,+23766'
),

-- ── ALLGEMEIN / LEISTUNGSPFLICHT ─────────────────────────────────────────────

(
  'OLG Hamm 20 U 269/21',
  '2021-11-15',
  'OLG Hamm',
  '20. Zivilsenat',
  'medizinische_notwendigkeit',
  ARRAY['medizinisch notwendig','Beweislast','ärztliche Bescheinigung','Prima-facie-Beweis','Versicherungsnehmer'],
  'Ein ärztliches Attest über die medizinische Notwendigkeit einer Behandlung begründet einen Prima-facie-Beweis zugunsten des Versicherungsnehmers. Der PKV-Versicherer kann diesen Beweis nur durch einen Gegenbeweis erschüttern, der über bloße Zweifel an der Diagnose hinausgeht. Allgemeine gutachterliche Einschätzungen des Versicherers ohne Kenntnis des konkreten Patienten reichen hierfür nicht aus.',
  'Stärkt die Beweisposition des Versicherten erheblich: Liegt ein ärztliches Attest vor, muss die PKV konkret und patientenbezogen widerlegen. Pauschale MDK-Gutachten oder interne PKV-Gutachten ohne Patientenkenntnis reichen nicht.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=OLG+Hamm&Datum=15.11.2021&Aktenzeichen=20+U+269/21'
),

(
  'OLG Karlsruhe 9 U 42/18',
  '2020-07-24',
  'OLG Karlsruhe',
  '9. Zivilsenat',
  'allgemein',
  ARRAY['Vertrauenshaftung','Kulanzleistung','Erstattungszusage','Bindungswirkung','konkludent'],
  'Erteilt ein PKV-Versicherer dem Versicherungsnehmer eine mündliche oder schriftliche Zusage über die Erstattung einer Behandlung (auch konkludent durch jahrelange Erstattungspraxis), ist er nach dem Grundsatz von Treu und Glauben (§ 242 BGB) an diese Zusage gebunden, selbst wenn die Behandlung nach strengem Vertragsrecht nicht erstattungsfähig wäre.',
  'Wenn AXA eine Behandlung jahrelang erstattet hat und plötzlich die Erstattung verweigert, kann dies als Vertrauenshaftung angegriffen werden. Auch mündliche Zusagen oder konsistente Erstattungspraxis können bindend sein.',
  NULL
)

ON CONFLICT (aktenzeichen) DO UPDATE SET
  leitsatz     = EXCLUDED.leitsatz,
  relevanz_pkv = EXCLUDED.relevanz_pkv,
  schlagwoerter = EXCLUDED.schlagwoerter;
