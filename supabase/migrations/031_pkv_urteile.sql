-- Migration 031: pkv_urteile — kuratierte BGH-Urteile für PKV-Widersprüche
--
-- Enthält verifizierte BGH IV. Zivilsenat Entscheidungen zu PKV-Streitfällen.
-- Quellen: bundesgerichtshof.de (Pressemitteilungen) + dejure.org
-- Stand: April 2026 | Kategorien: beitragsanpassung, medizinische_notwendigkeit, goae, ausschlussklausel

CREATE TABLE IF NOT EXISTS pkv_urteile (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gericht         text NOT NULL DEFAULT 'BGH',
  senat           text NOT NULL DEFAULT 'IV. Zivilsenat',
  aktenzeichen    text NOT NULL UNIQUE,
  datum           date NOT NULL,
  kategorie       text NOT NULL CHECK (kategorie IN (
                    'beitragsanpassung',
                    'medizinische_notwendigkeit',
                    'goae',
                    'ausschlussklausel',
                    'allgemein'
                  )),
  -- Schlagwörter für Matching gegen Ablehnungsgründe (Array für einfachen Vergleich)
  schlagwoerter   text[] NOT NULL DEFAULT '{}',
  leitsatz        text NOT NULL,
  relevanz_pkv    text NOT NULL,
  quelle_url      text,
  verified        boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index für Kategorie-Suche
CREATE INDEX IF NOT EXISTS pkv_urteile_kategorie_idx ON pkv_urteile (kategorie);
CREATE INDEX IF NOT EXISTS pkv_urteile_datum_idx ON pkv_urteile (datum DESC);

-- RLS: Alle authentifizierten User dürfen lesen (read-only)
ALTER TABLE pkv_urteile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pkv_urteile_read_all"
  ON pkv_urteile FOR SELECT
  TO authenticated
  USING (true);

-- Service-Role darf alles (für Admin-Seeding)
CREATE POLICY "pkv_urteile_admin_all"
  ON pkv_urteile FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- SEED: Verifizierte BGH IV ZR PKV-Urteile (Stand: April 2026)
-- ============================================================

INSERT INTO pkv_urteile
  (aktenzeichen, datum, kategorie, schlagwoerter, leitsatz, relevanz_pkv, quelle_url)
VALUES

-- ── BEITRAGSANPASSUNG ────────────────────────────────────────────────────────

(
  'IV ZR 255/17',
  '2018-12-19',
  'beitragsanpassung',
  ARRAY['beitragsanpassung', 'prämienanpassung', 'beitragserhöhung', 'treuhänder', 'begründung'],
  'Eine PKV-Beitragsanpassung gemäß § 203 Abs. 2 VVG ist nur wirksam, wenn die Begründungsmitteilung nach § 203 Abs. 5 VVG den auslösenden Faktor (Versicherungsleistungen oder Sterbewahrscheinlichkeit) ausdrücklich benennt. Die Unabhängigkeit des Treuhänders ist gerichtlich nicht nachprüfbar, sofern seine Bestellung ordnungsgemäß erfolgte.',
  'Formell unwirksame Beitragsanpassungen (fehlende oder unzureichende Begründung des auslösenden Faktors) können vom Versicherungsnehmer zurückgefordert werden. Prüfpunkt: Enthält das AXA-Schreiben zur Prämienanpassung die konkreten auslösenden Faktoren?',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=19.12.2018&Aktenzeichen=IV+ZR+255/17'
),

(
  'IV ZR 294/19',
  '2020-12-16',
  'beitragsanpassung',
  ARRAY['beitragsanpassung', 'prämienanpassung', 'begründungspflicht', 'auslösender faktor'],
  'Eine Prämienanpassung in der PKV ist formell unwirksam, wenn die Begründungsmitteilung nicht konkret angibt, welche Berechnungsgrundlage (Versicherungsleistungen, Sterbewahrscheinlichkeit) den gesetzlichen Schwellenwert überschritten und die Anpassung ausgelöst hat.',
  'Stärkt die Position des Versicherungsnehmers bei Beitragserhöhungen: Allgemeine Hinweise auf "gestiegene Kosten" genügen nicht. Versicherer muss die Auslöser spezifisch benennen — fehlt dies, ist die Erhöhung angreifbar.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=16.12.2020&Aktenzeichen=IV+ZR+294/19'
),

(
  'IV ZR 314/19',
  '2020-12-16',
  'beitragsanpassung',
  ARRAY['beitragsanpassung', 'prämienanpassung', 'begründungspflicht', 'mb/kk'],
  'Ergänzend zu IV ZR 294/19 entschieden: Die Begründungsanforderungen gelten auch für Beitragsanpassungen nach den MB/KK-Bedingungen. Fehlende Begründung führt zur formellen Unwirksamkeit der Prämienerhöhung.',
  'Parallel-Urteil zu IV ZR 294/19; beide zusammen bilden den maßgeblichen BGH-Maßstab für PKV-Beitragsanpassungen ab 2020. Bei Widerspruch gegen Prämienerhöhungen sind beide Aktenzeichen zu nennen.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=16.12.2020&Aktenzeichen=IV+ZR+314/19'
),

(
  'IV ZR 113/20',
  '2021-11-17',
  'beitragsanpassung',
  ARRAY['beitragsanpassung', 'verjährung', 'rückforderung', 'prämienanpassung'],
  'Rückforderungsansprüche des Versicherungsnehmers wegen unwirksamer PKV-Beitragsanpassungen unterliegen der regelmäßigen Verjährungsfrist von 3 Jahren (§ 195 BGB). Die Frist beginnt mit Kenntnis der Unwirksamkeit, frühestens mit der BGH-Entscheidung vom 16.12.2020.',
  'Versicherungsnehmer können überzahlte Prämien aus unwirksamen Anpassungen zurückfordern — für Anpassungen ab ca. 2017/2018 besteht oft noch kein Verjährungshindernis. Relevant wenn AXA frühere Beitragserhöhungen nicht korrekt begründet hatte.',
  'https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2021/2021214.html'
),

(
  'IV ZR 253/20',
  '2022-06-22',
  'beitragsanpassung',
  ARRAY['beitragsanpassung', 'mb/kk', '§ 8b', 'wirksamkeit', 'anpassungsklausel'],
  '§ 8b Abs. 1 MB/KK ist als Rechtsgrundlage für PKV-Beitragsanpassungen wirksam, sofern die weiteren formellen Voraussetzungen (insb. Begründungspflicht nach § 203 Abs. 5 VVG) eingehalten werden.',
  'Stärkt die Position der Versicherer: Allein die Klausel § 8b MB/KK anzugreifen genügt nicht. Widerspruch muss sich auf konkrete Begründungsmängel der jeweiligen Anpassungsmitteilung stützen.',
  'https://kanzlei-johannsen.de/beitragsanpassung-in-der-privaten-krankenversicherung-bundesgerichtshof-bestaetigt-wirksamkeit/'
),

(
  'IV ZR 177/22',
  '2023-09-27',
  'beitragsanpassung',
  ARRAY['beitragsanpassung', 'auskunftsanspruch', 'treu und glauben', 'frühere anpassungen'],
  'PKV-Versicherte können unter dem Gesichtspunkt von Treu und Glauben (§ 242 BGB) einen Auskunftsanspruch über frühere Beitragsanpassungen gegen ihren Versicherer haben, wenn sie begründete Unklarheit über Bestand und Umfang ihrer Rückforderungsansprüche haben.',
  'Wichtig für Fälle mit Verdacht auf vergangene formell unwirksame Anpassungen: AXA kann verpflichtet sein, alle historischen Beitragsanpassungen mit Begründungen offenzulegen. Einsatz: Wenn Versicherungsnehmer die Anpassungshistorie nicht kennt.',
  'https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2023/2023164.html'
),

(
  'IV ZR 68/22',
  '2024-03-20',
  'beitragsanpassung',
  ARRAY['beitragsanpassung', 'limitierung', 'prämienanpassung', 'begrenzungsmaßnahmen'],
  'BGH konkretisiert die Anforderungen an Limitierungsmaßnahmen bei PKV-Beitragsanpassungen. Versicherer müssen Limitierungsrabatte nachvollziehbar ausweisen und dürfen diese nicht verdeckt anrechnen.',
  'Neueste BGH-Linie zur Beitragsanpassung: Selbst wenn formell korrekt begründet, müssen Limitierungsmaßnahmen transparent sein. Relevant bei Anpassungen die durch Rabatte "verschleiert" wurden.',
  'https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2024/2024067.html'
),

-- ── MEDIZINISCHE NOTWENDIGKEIT ────────────────────────────────────────────────

(
  'IV ZR 133/95',
  '1996-07-10',
  'medizinische_notwendigkeit',
  ARRAY['medizinische notwendigkeit', 'heilbehandlung', 'beweislast', 'nachweis'],
  'Medizinische Notwendigkeit einer Heilbehandlung ist objektiv nach dem anerkannten Stand der medizinischen Wissenschaft zum Zeitpunkt der Behandlung zu beurteilen. Der Versicherungsnehmer trägt die Beweislast für die medizinische Notwendigkeit.',
  'Grundlagenprinzip: PKV muss erstatten wenn Behandlung nach objektivem medizinischen Erkenntnisstand notwendig war — unabhängig vom Behandlungsergebnis. Bei Ablehnung wegen "nicht medizinisch notwendig" muss AXA konkret begründen, warum der objektive Maßstab nicht erfüllt ist.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=10.07.1996&Aktenzeichen=IV+ZR+133/95'
),

(
  'IV ZR 131/05',
  '2006-02-08',
  'medizinische_notwendigkeit',
  ARRAY['medizinische notwendigkeit', 'heilbehandlung', 'objektiver maßstab', 'ex ante'],
  'Der Begriff "medizinisch notwendige Heilbehandlung" in PKV-Bedingungen ist nach einem objektiven Maßstab auszulegen: Maßgebend ist, ob ein verständiger, auf das betreffende Fachgebiet spezialisierter Arzt die Behandlung zum Behandlungszeitpunkt (ex ante) als medizinisch notwendig eingestuft hätte.',
  'Entscheidend für Widersprüche: AXA kann nicht auf ein "schlechtes Ergebnis" oder "Therapiealternativen" verweisen — ausschlaggebend ist allein die ex-ante-Sicht eines Facharztes. Ärztliche Stellungnahme sollte explizit den ex-ante-Standard ansprechen.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=08.02.2006&Aktenzeichen=IV+ZR+131/05'
),

(
  'IV ZR 533/15',
  '2017-03-29',
  'medizinische_notwendigkeit',
  ARRAY['medizinische notwendigkeit', 'alternativbehandlung', 'augen-op', 'laser', 'brille', 'hilfsmittel'],
  'Das Vorhandensein einer alternativen Behandlung (z.B. Brille statt Augen-Laser-OP) schließt die medizinische Notwendigkeit einer operativen Maßnahme nicht aus, wenn die Alternative lediglich substituierend wirkt ohne die Grunderkrankung zu beseitigen.',
  'Hochrelevant bei Operationen mit konservativer Alternative: AXA darf Erstattung einer Augen-OP, Gelenkoperation etc. nicht allein mit dem Verweis auf eine Brillen-/Konservativbehandlung verweigern. Verallgemeinerbares Prinzip: Symptombehandlung ≠ Heilung der Ursache.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=29.03.2017&Aktenzeichen=IV+ZR+533/15'
),

-- ── GOÄ ──────────────────────────────────────────────────────────────────────

(
  'IV ZR 36/20',
  '2021-04-14',
  'goae',
  ARRAY['goä', 'goä-ziffer', 'erstattung', 'abrechnung', 'krankenhaus', 'wahlleistung'],
  'BGH zur Erstattungspflicht des PKV-Versicherers bei GOÄ-gemäßen Krankenhausabrechnungen; präzisiert Umfang der Leistungspflicht bei stationärer Behandlung und Wahlleistungen.',
  'Relevant bei Ablehnung von Krankenhausrechnungen oder Chefarzt-Wahlleistungen: PKV muss GOÄ-konforme Abrechnungen erstatten soweit sie dem versicherten Leistungsumfang entsprechen.',
  'https://dejure.org/dienste/vernetzung/rechtsprechung?Gericht=BGH&Datum=14.04.2021&Aktenzeichen=IV+ZR+36/20'
)

ON CONFLICT (aktenzeichen) DO UPDATE SET
  leitsatz     = EXCLUDED.leitsatz,
  relevanz_pkv = EXCLUDED.relevanz_pkv,
  quelle_url   = EXCLUDED.quelle_url,
  verified     = EXCLUDED.verified;
