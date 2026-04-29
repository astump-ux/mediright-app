@AGENTS.md

# MediRight — Architekturdokumentation & Source of Truth

> Letzte Aktualisierung: 2026-04-29 (Matching-Fix, FaelleDossier UX, fall-context vollständig dokumentiert)
> Diese Datei wird nach jedem Sprint aktualisiert. Sie ist die primäre Referenz für KI-Assistenten und Entwickler.

---

## 1. Projekt-Übersicht

**MediRight** ist eine Next.js 16 App für Privatpatienten (PKV) die:
- Arzt- und Kassenbescheid-PDFs per KI analysiert (Claude + Gemini)
- GOÄ-Abrechnungen auf Fehler, Faktorüberschreitungen und Ablehnungsrisiken prüft
- KI-generierte Widerspruchsbriefe gegen AXA-Ablehnungen erstellt
- Über WhatsApp (Twilio) automatisch Analyseergebnisse versendet
- Ein Credit-basiertes Bezahlmodell über Stripe implementiert

**Primary User:** Alex Stump, AXA ActiveMe-U Tarif — der Use Case und alle Seed-Daten beziehen sich auf diesen Tarif.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres + Storage + Auth) · Vercel (Hosting) · Anthropic Claude + Google Gemini · Stripe · Twilio WhatsApp

---

## 2. Kern-Architekturentscheidungen

### 2.1 Duale KI-Pipeline (Rule Engine → KI-Fallback)
Arztrechnung-PDFs durchlaufen zunächst `goae-rule-engine.ts` (deterministisch, kein API-Call).
Nur wenn Confidence < 0.70 wird auf Claude Haiku als Fallback escaliert.
**Warum:** Kostenreduktion. Einfache Rechnungen brauchen keine KI.

### 2.2 fall-context.ts als zentrales Gehirn
Alle KI-Prompts für Widersprüche erhalten denselben strukturierten Kontext aus `buildFallContext()`.
9 Sections, alle fail-silent (geben `''` zurück bei Fehler → kein Break der Pipeline).
**Warum:** Konsistenz. Jede neue Trainingsdatenquelle wird als Section ergänzt, ohne andere Routen anzufassen.

**Vollständige Section-Übersicht (verifiziert 2026-04-29):**
| Section | Datenquelle | Inhalt |
|---|---|---|
| 1 | `vorgaenge` (JOIN kassenabrechnungen) | Arztrechnungen + GOÄ-Positionen, Einsparpotenzial, Flags |
| 2 | `kassenabrechnungen.kasse_analyse` | Kassenbescheid, Ablehnungsgründe, Handlungsempfehlung, Beträge |
| 3 | `widerspruch_kommunikationen` | **Vollständiger Kommunikationsverlauf** chronologisch — Richtung (ein/ausgehend), Kommunikationspartner (Kasse/Arzt), Typ, Datum, Betreff, Inhalt, KI-Analyse. Deckt alle Widerspruchsbriefe, Arzt-Korrekturbriefe, Kasseantworten und Arztantworten ab. |
| 4 | `tarif_profile` | Vertragsgrundlage / AVB-Analyse des Users (VG-Paragraphen-Zitate) |
| 5 | `tarif_benchmarks` | Marktvergleich (5 PKV-Versicherer: Debeka, DKV, Allianz, Signal Iduna, Barmenia) |
| 6 | `pkv_urteile` | BGH + OLG Urteile (~22 Entscheidungen) |
| 7 | `pkv_ombudsmann_statistik` | Ombudsmann-Statistik (Einigungsquote 33,1%) |
| 8 | `goae_positionen` | GOÄ-Positionsdaten (908 Ziffern aus Bundesärztekammer-PDF) |
| 9 | `kassenabrechnungen` + `pkv_ablehnungsmuster` | Ablehnungsmuster: User-History + Cross-User-Statistiken |

### 2.3 Zweistufige Ablehnungsmuster — per-User UND cross-User
**Stufe 1 — Per-User-History:** Vollständig in `kassenabrechnungen` (user_id, kasse_analyse JSONB,
betrag_abgelehnt, bescheiddatum). Keine separate Tabelle nötig — die Information ist bereits
strukturiert vorhanden. `rejection-pattern-context.ts` queried diese direkt.
**Stufe 2 — Cross-User-Muster:** `pkv_ablehnungsmuster` ohne user_id — nur aggregierte Statistiken.
DB-Trigger schreibt automatisch nach jeder Kassenbescheid-Analyse.
**Warum:** Neue User ohne eigene History profitieren sofort von Community-Daten (Stufe 2).
User mit History bekommen zusätzlich ihre eigenen Fälle als Kontext (Stufe 1). DSGVO-konform.

### 2.4 Widerspruch-Ergebnis-Tracking vollautomatisch (Migration 036)
`record_widerspruch_ergebnis()` wird via DB-Trigger `trg_widerspruch_outcome` automatisch
aufgerufen sobald `widerspruch_status` auf `'akzeptiert'` oder `'abgelehnt'` wechselt.
Kein App-Code nötig — die DB pflegt die Erfolgsquote in `pkv_ablehnungsmuster` selbst.

### 2.5 Tariff Intelligence Base (Migrations 018, 039)
`tariff_exclusions` speichert tarifspezifische Ablehnungsmuster aus echten AXA-Bescheiden.
Wird in `goae-analyzer.ts` via `fetchTariffContext()` in den System-Prompt injiziert — nur bei
confidence `'haeufig'` oder `'bestaetigt'`, max. 20 Einträge. Fail-silent: leerer String bei Fehler.
**Warum:** GOÄ-Pre-Analyse ohne Tarif-Wissen ist blind. Mit den Mustern erkennt Haiku
tarifspezifische Ablehnungsrisiken bevor der Kassenbescheid überhaupt eintrifft.
Phase 2 (Auto-Extraktion aus jedem neuen Bescheid → upsert) ist als TODO in `analyze-kasse/route.ts` markiert.

### 2.8 Fuzzy-Matching Arztrechnung ↔ Kassenbescheid (matching.ts)
`matchVorgangToKasse()` versucht nach jeder Analyse, eine Arztrechnung einem Kassenbescheid zuzuordnen.
`matchScore()` gewichtet: Arztname 50% · Datum 30% · Betrag 20%. Threshold: 0.45.

**Short-circuit 1:** Identischer Arztname + exakt gleicher Betrag → sofortiger Match.
**Short-circuit 2:** Arztname-Similarity ≥ 0.90 + kein Rechnungsdatum im Kassenbescheid → Score = max(score, 0.55).
Hintergrund: AXA-Kassenbescheide enthalten oft nur "Beh-Jahr" statt exakter Rechnungsdaten.

**Stale `matchedVorgangId` Purge:** `POST /api/vorgaenge/rematch` räumt veraltete Referenzen auf
(Kassenbescheid-Gruppen, die auf gelöschte/nicht-mehr-existierende Vorgänge zeigen) bevor
es das Matching erneut versucht. Ohne Purge blockieren diese Referenzen neue Matches.

**Debug-Endpoint:** `GET /api/debug/matching` gibt alle matchScores für ungematchte Vorgänge
× alle Kassenbescheid-Gruppen zurück (nur Development — vor Prod-Hardening entfernen).

### 2.7 Meine Fälle — Dossier-Pattern (UX-Redesign April 2026)
Kassenbescheid ist das primäre UI-Objekt. `/meine-faelle` vereint drei vorherige Seiten
(Rechnungen, Kassenabrechnungen, Widersprüche) in einer dossier-artigen Ansicht.
Jede `FallDossierCard` hat 3 Tabs: Bescheid-Details, verknüpfte Rechnungen, Widerspruch-Thread.
**InlineKommunikationForm** ersetzt das vorherige Modal — Antworten werden inline am Thread-Ende
aufgedeckt (GitHub Issues / Linear Pattern: Aktion erscheint kontextuell dort, wo der User liest).
`/api/upload/smart` delegiert an kassenbescheid oder arztrechnung Handler basierend auf `classifyPdf()`.
**Warum:** User denkt in "Fällen" (Behandlung → Erstattung → Widerspruch), nicht in Feature-Silos.
Die 3-Query-Architektur (kassenabrechnungen + vorgaenge + kommunikationen) bleibt flach ohne JOINs.

### 2.6 Widerspruch-Status — RLS-Pattern für PATCH-Routen
Ownership-Checks in Mutationsrouten (z. B. `/api/kassenabrechnungen/[id]/widerspruch-status`)
nutzen den **User-Supabase-Client** für den Lookup (Postgres RLS erzwingt `auth.uid() = user_id`),
den **Admin-Client** nur für den Write (Service Role umgeht RLS-Write-Policies).
**Warum:** Manueller UUID-Vergleich `kasse.user_id !== user.id` ist fehleranfällig
(Formatunterschiede zwischen Auth-Context und DB-Spalte). RLS ist robuster und vertrauenswürdiger.

---

## 3. Datenfluss

### 3.1 Arztrechnung-Pipeline (WhatsApp oder Upload)
```
PDF empfangen (WhatsApp webhook / POST /api/upload/arztrechnung)
  → Credit-Check (checkAndDeductAnalysisCredit)
  → classifyPdf() — Arztrechnung oder Kassenbescheid?
  → analyzeRechnungRuleBased() — deterministisch, Confidence 0–1
      IF confidence >= 0.70 → Ergebnis direkt verwenden
      ELSE → analyzeRechnungPdf() mit Claude Haiku
  → UPDATE vorgaenge (goae_positionen JSON, claude_analyse, flags)
  → matchVorgangToKasse() — offene Kassenabrechnungen verknüpfen
  → WhatsApp-Notification an User
```

### 3.2 Kassenbescheid-Pipeline (WhatsApp oder Upload)
```
PDF empfangen (WhatsApp webhook / POST /api/upload/kassenbescheid)
  → Credit-Check
  → classifyPdf()
  → analyzeKassePdf() — immer KI (zu komplex für Rule Engine)
      → buildTarifProfilContext() — AVB-Daten des Users einbinden
      → Extraktion: ablehnungsgruende[], betragAbgelehnt, rechnungen[]
  → INSERT kassenabrechnungen (inkl. kasse_analyse JSONB)
  → Trigger aggregate_ablehnungsmuster() feuert automatisch
  → matchKasseToVorgaenge() — verknüpft mit vorhandenen Arztrechungen
  → WhatsApp-Notification
```

### 3.3 Widerspruch-Generierung
```
User öffnet Kassenbescheid → PATCH /api/kassenabrechnungen/[id]/widerspruch-starten
  → Status: 'keiner' → 'erstellt'
  → buildFallContext(kassenabrechnungenId)
      Section 1: Arztrechnung(en) + GOÄ-Positionen
      Section 2: Kassenbescheid + Ablehnungsgründe
      Section 3: Kommunikationsverlauf
      Section 4: Vertragsgrundlage (AVB-Analyse des Users)
      Section 5: Marktvergleich (tarif_benchmarks, 5 PKV-Versicherer)
      Section 6: BGH-Urteile (pkv_urteile)
      Section 7: Ombudsmann-Statistik (Einigungsquote 33,1%)
      Section 8: GOÄ-Positionsdaten (goae_positionen)
      Section 9: Ablehnungsmuster (User-History + Community)
  → Claude generiert Widerspruchsbrief mit {{fallkontext}}
  → INSERT widerspruch_kommunikationen
```

---

## 4. Datenbank-Schema (39 Migrationen)

### Kern-Tabellen
| Tabelle | Zweck |
|---|---|
| `profiles` | User-Profil: PKV-Name, Tarif, Geschlecht, Geburtsdatum, WhatsApp, Selbstbehalt |
| `vorgaenge` | Einzelne Arztbesuche/Rechnungen: GOÄ-Positionen (JSONB), KI-Analyse, Flags |
| `kassenabrechnungen` | AXA-Kassenbescheide: Beträge, kasse_analyse (JSONB), Widerspruch-Status |
| `widerspruch_kommunikationen` | Thread aller Widerspruchskorrespondenz (ein/ausgehend) |
| `aerzte` | Ärztekartei pro User (unique: user_id + name) |
| `user_settings` | Per-User-Einstellungen |
| `app_settings` | Admin-Einstellungen: KI-Modell, Prompts (editierbar) |

### Vorsorge / Gesundheitsmanagement
| Tabelle | Zweck |
|---|---|
| `user_vorsorge_config` | Welche Vorsorgeuntersuchungen für diesen User relevant sind |

### Credits & Abrechnung
| Tabelle | Zweck |
|---|---|
| `user_credits` | Aktuelles Guthaben + Subscription-Status (free/pro) |
| `credit_transactions` | Jede Gutschrift / Abbuchung mit Grund |
| `ki_usage_log` | Token-Verbrauch pro KI-Aufruf (Kosten-Tracking) |

### Trainingsdaten / Wissensbasis (kein PII)
| Tabelle | Zweck |
|---|---|
| `tarif_benchmarks` | AVB-Analyse von 5 PKV-Versicherern (Debeka, DKV, Allianz, Signal Iduna, Barmenia) |
| `tarif_profile` | Per-User AVB-Analyse (JSON) nach Versicherungsschein-Upload |
| `avb_dokumente` | Hochgeladene AVB-PDFs (Supabase Storage) |
| `pkv_urteile` | BGH-Urteile (Migrations 031–032) + 10 OLG-Urteile (Migration 038) |
| `pkv_ombudsmann_statistik` | Ombudsmann-Statistik 2025: Einigungsquote 33,1%, Kategorien |
| `goae_positionen` | ~80 kuratierte GOÄ-Streitfall-Ziffern (034) + 908 Vollseeding aus Bundesärztekammer-PDF (037) |
| `pkv_ablehnungsmuster` | Anonymisierte Cross-User-Muster, wächst via DB-Trigger automatisch |
| `tariff_exclusions` | Tarifspezifische Ablehnungsmuster aus echten Bescheiden (Migrations 018+039); in GOÄ-Analyse-Prompt injiziert |
| `chat_messages` | In-App-Chat-History |

### Rollen & System
| Tabelle | Zweck |
|---|---|
| `roles` | user / admin |

---

## 5. Services (src/lib/)

| Datei | Funktion |
|---|---|
| `fall-context.ts` | `buildFallContext()` — 9-Section Kontext-Assembler für alle KI-Prompts |
| `goae-analyzer.ts` | `analyzeRechnungPdf()`, `analyzeKassePdf()`, `classifyPdf()`, `buildTarifProfilContext()` |
| `goae-rule-engine.ts` | Deterministischer GOÄ-Parser (Regex + Regeln, kein API-Call), Confidence-Scoring |
| `goae-context.ts` | GOÄ-Ziffer-Lookup aus `goae_positionen` für fall-context Section 8 |
| `benchmark-context.ts` | Tarif-Vergleich aus `tarif_benchmarks` für fall-context Section 5 |
| `legal-search.ts` | BGH-Urteile aus `pkv_urteile` für fall-context Section 6 |
| `ombudsmann-context.ts` | Ombudsmann-Statistiken für fall-context Section 7 |
| `rejection-pattern-context.ts` | User-History + Cross-User-Muster für fall-context Section 9 |
| `matching.ts` | Fuzzy-Matching Arztrechnung ↔ Kassenbescheid |
| `ai-client.ts` | Abstraktion Claude + Gemini (gleiche Schnittstelle) |
| `credits.ts` | Credit-Check, Abbuchung, Pro-Subscription |
| `stripe.ts` | Checkout-Sessions, Webhook-Handler, Preisstruktur |
| `dashboard-queries.ts` | Aggregierte Dashboard-Abfragen |
| `mockData.ts` | Demo-Modus-Daten für alle 4 Hauptseiten |
| `supabase-admin.ts` | Service-Role-Client (serverseitig) |
| `supabase-server.ts` | User-Session-Client (SSR) |
| `ki-usage.ts` | Token-Logging |

---

## 6. API-Routen

### Upload & Analyse
| Route | Methode | Zweck |
|---|---|---|
| `/api/upload/smart` | POST | Zero-Classification: classifyPdf() → delegiert an kassenbescheid oder arztrechnung |
| `/api/upload/arztrechnung` | POST | PDF → Supabase Storage → Rule Engine → KI-Fallback → vorgaenge |
| `/api/upload/kassenbescheid` | POST | PDF → Storage → KI-Analyse → kassenabrechnungen → Matching |
| `/api/upload/avb` | POST | AVB-PDF → Storage (für Tarif-Analyse) |
| `/api/analyse/avb` | POST | Claude analysiert AVB → tarif_profile JSON |
| `/api/analyze-auto` | POST | Unified background job (WhatsApp-Trigger): classify → analyse → match → notify |
| `/api/analyze-kasse` | POST | Interner Job für Kassenbescheid-Analyse (Twilio-Trigger) |
| `/api/vorgaenge/[id]/analysieren` | POST | Nachträgliche KI-Analyse eines Vorgangs |

### Widerspruch
| Route | Methode | Zweck |
|---|---|---|
| `/api/kassenabrechnungen/[id]/widerspruch-starten` | PATCH | Status 'keiner' → 'erstellt' |
| `/api/kassenabrechnungen/[id]/widerspruch-status` | PATCH | `widerspruch_status` und/oder `arzt_reklamation_status` setzen. Body: `{ status?, arzt_status? }`. Ownership via RLS (User-Client Lookup, Admin-Client Write) |
| `/api/widerspruch-kommunikationen` | POST | Neuen Widerspruchsbrief erstellen (inkl. buildFallContext) |
| `/api/widerspruch-kommunikationen/[id]/analyse` | POST | Antwort der Kasse analysieren |

### Nutzerdaten
| Route | Methode | Zweck |
|---|---|---|
| `/api/settings` | GET/PATCH | User-Settings inkl. PKV-Profil |
| `/api/tarif-profile` | GET | AVB-Analyse des Users abrufen |
| `/api/vorsorge/*` | GET/PATCH/POST | Vorsorge-Konfiguration |
| `/api/credits` | GET | Aktueller Credit-Stand |

### Bezahlung
| Route | Methode | Zweck |
|---|---|---|
| `/api/stripe/checkout` | POST | Checkout-Session erstellen |
| `/api/stripe/webhook` | POST | Stripe-Events → Credits gutschreiben / Pro aktivieren |

### Matching / Debug
| Route | Methode | Zweck |
|---|---|---|
| `/api/vorgaenge/rematch` | POST | Stale matchedVorgangId-Refs purgen + Matching für alle ungematchten Vorgänge erneut ausführen |
| `/api/debug/matching` | GET | Raw matchScores für alle ungematchten Vorgänge × Kassenbescheid-Gruppen (nur Dev) |

### Admin
| Route | Methode | Zweck |
|---|---|---|
| `/api/admin/users` | GET | Alle User mit Credit-Status |
| `/api/admin/users/[id]` | PATCH | User-Credits/Rolle anpassen |
| `/api/admin/ki-usage` | GET | Token-Verbrauch-Übersicht |
| `/api/admin/seed-benchmarks` | POST | Tarif-Benchmarks neu seeden |
| `/api/admin/settings` | GET/PATCH | App-weite Einstellungen (Modell, Prompts) |

### WhatsApp
| Route | Methode | Zweck |
|---|---|---|
| `/api/whatsapp/webhook` | POST | Twilio-Webhook: PDF-Eingang → analyze-auto |

---

## 7. Trainingsdaten-Quellen (fall-context Sections 5–9)

| # | Quelle | Tabelle | Status | Section |
|---|---|---|---|---|
| 1 | PKV-Ombudsmann Jahresbericht 2025 | `pkv_ombudsmann_statistik` | ✅ Fertig, 6 Kategorien | 7 |
| 2a | GOÄ Streitfall-Ziffern (kuratiert) | `goae_positionen` | ✅ ~80 Ziffern | 8 |
| 2b | GOÄ Vollständig (908 Positionen) | `goae_positionen` | ✅ Migration 037 — Bundesärztekammer-PDF geparsed | 8 |
| 3 | Anonymisierte Ablehnungsmuster | `pkv_ablehnungsmuster` | ✅ Trigger aktiv, 8 Seed-Muster | 9 |
| 3 | Per-User Ablehnungshistorie | `kassenabrechnungen` | ✅ Query in rejection-pattern-context | 9 |
| 4a | BGH-Urteile | `pkv_urteile` | ✅ ~12 Urteile, Migrations 031–032 | 6 |
| 4b | OLG-Urteile | `pkv_urteile` | ✅ 10 Urteile, Migration 038 — 4 Kategorien, 7 Gerichte | 6 |
| — | AVB-Vertragsanalyse (User) | `tarif_profile` | ✅ Upload + Claude-Analyse im Onboarding | 4 |
| — | Tarif-Benchmarks (5 Versicherer) | `tarif_benchmarks` | ✅ Debeka/DKV/Allianz/Signal Iduna/Barmenia | 5 |
| 5 | Tarifspezifische Ablehnungsmuster | `tariff_exclusions` | ✅ Migrations 018+039 — 22 AXA-Muster aus echten Bescheiden; in GOÄ-System-Prompt injiziert | GOÄ-Prompt |

**Alle geplanten Trainingsquellen abgeschlossen.** Erweiterung möglich z. B. um neue `tariff_exclusions`-Einträge nach jedem Kassenbescheid, Amtsgerichts-Urteile, oder neue BGH-Entscheidungen.

---

## 8. Pricing & Credits

| Paket | Preis | Credits | Pro-Credit |
|---|---|---|---|
| 3 Credits | 7,99 € | 3 | 2,66 € |
| 10 Credits | 24,99 € | 10 | 2,49 € |
| Pro Annual | via Stripe | unbegrenzt | — |

1 Credit = 1 vollständige KI-Analyse (Arztrechnung oder Kassenbescheid).
Widerspruch-Generierung ist Credit-frei (nutzt bereits analysierte Daten).
Free Tier: konfigurierbar über `app_settings`.

---

## 9. WhatsApp-Integration

User schickt ein PDF an die Twilio-WhatsApp-Nummer.
→ `/api/whatsapp/webhook` empfängt, verifiziert Twilio-Signatur.
→ PDF wird heruntergeladen, `classifyPdf()` bestimmt Typ.
→ `/api/analyze-auto` übernimmt die komplette Pipeline.
→ Ergebnis als WhatsApp-Nachricht zurück (max 3 Sätze, aus `goae-analyzer.ts` `whatsappNachricht`).

Twilio-Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`

---

## 10. Widerspruch-Status-Maschinen

### Kassenwiderspruch (`widerspruch_status` — Migration 011)
```
keiner → erstellt → gesendet → beantwortet → akzeptiert
                                            → abgelehnt
```

### Arztreklamation (`arzt_reklamation_status` — Migration 017)
```
keiner → erstellt → gesendet
```
Unabhängiger Track für Direktreklamationen beim Arzt (z. B. fehlerhafte GOÄ-Berechnung).
Beide Tracks werden via `PATCH /api/kassenabrechnungen/[id]/widerspruch-status` gesetzt.

**Auto-Promotion auf Seite `widersprueche/page.tsx` (Server Component):**
- Datensätze mit `widerspruch_status = 'keiner'` + `kasse_analyse IS NOT NULL` + `betrag_abgelehnt > 0`
  werden beim Seitenaufruf automatisch zu `'erstellt'` befördert.
- Verhindert dass reale Fälle fälschlicherweise als Demo erkannt werden.
- `isDemo = kassenabrechnungen.length === 0` (true nur wenn überhaupt keine Datensätze).

---

## 11. KI-Modelle (konfigurierbar im Admin-Panel)

| Zweck | Standard-Modell |
|---|---|
| Arztrechnung-Analyse | Claude Haiku 4.5 (Fallback nach Rule Engine) |
| Kassenbescheid-Analyse | Claude Sonnet 4.6 |
| Widerspruch-Generierung | Claude Sonnet 4.6 |
| AVB-Analyse | Claude Sonnet 4.6 |
| Alternativ verfügbar | Gemini 2.0 Flash / Pro |

Modell pro Analyse-Typ in `app_settings` editierbar (Admin-Panel).

---

## 12. GitHub Actions / Workflows

| Workflow | Trigger | Zweck |
|---|---|---|
| `deploy.yml` | Push auf main | Vercel-Deploy (auto) |
| `seed-benchmarks.yml` | manuell | Tarif-Benchmarks neu seeden |
| `seed-goae-positionen.yml` | manuell | GOÄ-Vollseeding (via Migration 037 ersetzt; Workflow als Fallback behalten) |

---

## 13. Bekannte Lücken & offene TODOs

- ~~**GOÄ-Vollseeding:**~~ ✅ Migration 037 erledigt — 908 Positionen via pdfplumber-Parser aus Bundesärztekammer-PDF
- ~~**Widerspruch-Outcome-Tracking:**~~ ✅ Erledigt in Migration 036 — DB-Trigger feuert automatisch bei Status → 'akzeptiert'/'abgelehnt'
- ~~**OLG-Urteile (Source #4):**~~ ✅ Migration 038 erledigt — 10 Urteile aus 7 Gerichten
- ~~**Tariff Intelligence Base Phase 1:**~~ ✅ Erledigt — Migrations 018+039, `fetchTariffContext()` in `goae-analyzer.ts`, 22 AXA-Muster aus echten Bescheiden
- **Tariff Intelligence Base Phase 2:** Auto-Extraktion nach jeder Kassenbescheid-Analyse → upsert in `tariff_exclusions`. TODO in `analyze-kasse/route.ts` Section 5 markiert.
- **UpsellBand Task #22:** Credit-aware 5-state Redesign noch in_progress
- ~~**UX Redesign: Meine Fälle:**~~ ✅ Dossier-Pattern implementiert — `/meine-faelle`, `FaelleDossierClient`, `/api/upload/smart`. Nav auf Dashboard + Meine Fälle + Ärzte reduziert.
- **WiderspruchClient UI-Verbesserungen (Sprint April 2026):**
  - ✅ Modal-Hängeproblem behoben (AbortController Timeouts: 60s Analyse / 30s Upload, `finally` resettet immer Loading-State)
  - ✅ Demo-Modus-Erkennung korrigiert (`isDemo = length === 0`, Auto-Promotion auf Server)
  - ✅ "Nächste Aktion"-Hint unterdrückt wenn User bereits auf letzte Kasse-Antwort reagiert hat (`hasOutgoingAfterLatestIncoming`)
  - ✅ Toggle-Buttons prüfen `res.ok` bevor `setLocalStatus()` (verhindert optimistic-UI-Bug bei 404/500)
- **Meine Fälle UX-Sprint (April 2026):**
  - ✅ Status-Toggle für Widerspruch-Status persistent über Tab-Wechsel (State in FallDossierCard)
  - ✅ Prominente CTA-Buttons in Bescheid-Tab → direkt zum Widerspruch-Thread
  - ✅ ArztBriefNode mit eigenem Status-Toggle + Outlook-Button im Widerspruch-Thread
  - ✅ "In Outlook öffnen" Button auf allen Briefentwürfen
  - ✅ Read-only Mode für gesendete Briefe (disabled Felder + 🔒 Banner)
- **Matching-Sprint (April 2026):**
  - ✅ Short-circuit 2 für AXA-Kassenbescheide ohne Rechnungsdatum
  - ✅ MATCH_THRESHOLD auf 0.45 gesenkt
  - ✅ POST /api/vorgaenge/rematch mit Purge-Mechanismus für stale Refs
  - ✅ GET /api/debug/matching für Diagnose (Dev only — vor Prod entfernen!)
- **fall-context.ts Vollständigkeit (April 2026):**
  - ✅ Section 3 enthält alle widerspruch_kommunikationen chronologisch inkl. gesendete Briefe, Arzt-Korrekturbriefe, und alle eingegangenen Antworten

---

## 14. Umgebungsvariablen (Pflicht)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY      # für Gemini-Fallback
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_CREDITS_3
STRIPE_PRICE_CREDITS_10
STRIPE_PRICE_PRO_ANNUAL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER
INTERNAL_API_SECRET                # für interne Route-zu-Route Calls
```

---

## 15. Update-Protokoll

| Datum | Änderung |
|---|---|
| 2026-04-26 | Initiale CLAUDE.md erstellt (Migrations 001–035, alle Services, Routen, Trainingsdaten) |
| 2026-04-26 | Migration 033: pkv_ombudsmann_statistik (Training Source #1) |
| 2026-04-26 | Migration 034: goae_positionen + goae-context.ts (Training Source #2) |
| 2026-04-26 | Migration 035: pkv_ablehnungsmuster + Trigger + rejection-pattern-context.ts (Training Source #3) |
| 2026-04-26 | Migration 036: trg_widerspruch_outcome — Outcome-Tracking vollautomatisch via DB-Trigger |
| 2026-04-26 | Migration 037: GOÄ-Vollseeding — 908 Positionen aus Bundesärztekammer-PDF (Training Source #2b ✅) |
| 2026-04-26 | Migration 038: OLG-Urteile — 10 Entscheidungen aus 7 Gerichten (Training Source #4b ✅) — alle Trainingsquellen abgeschlossen |
| 2026-04-26 | Migration 018: `tariff_exclusions` Tabelle + initialer AXA-Seed — 11 Muster aus echten Bescheiden (GOÄ 31, 30, 30a, Labor, Mahnkosten, Tarif-Strukturregeln) |
| 2026-04-27 | Migration 017: `arzt_reklamation_status` Spalte in kassenabrechnungen — unabhängiger Track für Arzt-Direktreklamationen |
| 2026-04-27 | Migration 039: tariff_exclusions Update — 11 neue Muster aus AXA-MDK-Bescheid H25778 (GOÄ 3561, 75, A3744, A3767, A3891, 4062, 4134, 4135, 4140, Stufendiagnostik, Erregerserologie) |
| 2026-04-27 | `goae-analyzer.ts`: `fetchTariffContext()` injiziert tariff_exclusions in GOÄ-System-Prompt (confidence haeufig/bestaetigt, max 20 Einträge, fail-silent) |
| 2026-04-27 | WiderspruchClient: Modal-Hang fix (AbortController + finally-Reset), Demo-Modus-Fix (isDemo = length===0 + Server-Auto-Promotion), hasOutgoingAfterLatestIncoming für "Nächste Aktion"-Suppression, res.ok-Check auf allen Toggle-Buttons |
| 2026-04-28 | API fix: `widerspruch-status` PATCH — Ownership-Check via RLS (User-Client Lookup statt manueller UUID-Vergleich, Admin-Client nur für Write). Commit 982635f |
| 2026-04-28 | UX Redesign: "Meine Fälle" Dossier-Pattern — `/meine-faelle` (Server) + `FaelleDossierClient` (Client, ~960 Zeilen) mit SummaryBar, SmartUploadZone, 3-Tab-FallDossierCard, InlineKommunikationForm (Modal-Ersatz). `/api/upload/smart`: classifyPdf() → delegate. Header: Meine Fälle als primary Nav. Commit 1b0b104 |
| 2026-04-28 | feat(analyse/avb): Benchmark-Cache für AVB-Analyse — Haiku Quick-ID → tariff_benchmarks Lookup → bei Treffer kein Opus-Call (Ergebnis in Sekunden statt Minuten); bei Miss: Opus-Vollanalyse + Auto-Upsert in tariff_benchmarks für künftige User. Commit a1a63d0 |
| 2026-04-28 | fix(onboarding): Vercel 4.5 MB Limit für AVB-Uploads umgangen — 3-Schritt Client-Direct-Upload: (1) POST /api/upload/avb [JSON only] → signed URL + DB-Reservierung, (2) Browser → Supabase Storage direkt via uploadToSignedUrl(), (3) POST /api/upload/avb/complete → triggert async Analyse. Neue Route: /api/upload/avb/complete. Unterstützt bis 100 MB. Commit 26e9f6a |
| 2026-04-29 | fix(matching): Short-circuit 2 in matchScore() — AXA-Kassenbescheide ohne Rechnungsdatum (nur "Beh-Jahr") matchen jetzt bei Arztname-Similarity ≥ 0.90. Threshold 0.50 → 0.45 gesenkt. |
| 2026-04-29 | feat(matching): POST /api/vorgaenge/rematch — purgt stale matchedVorgangId-Referenzen (blockierende verwaiste Vorgänge) + re-run Matching. "🔄 Zuordnung prüfen" Button in UnverarbeitetSection. |
| 2026-04-29 | feat(debug): GET /api/debug/matching — raw matchScore-Matrix für alle ungematchten Vorgänge × Kassenbescheid-Gruppen (nur Dev). |
| 2026-04-29 | feat(faelle): FaelleDossierClient — WiderspruchBriefNode + ArztBriefNode: Briefe werden read-only (disabled Felder, grünes "🔒 Gesendet — schreibgeschützt" Banner, mintfarbener Hintergrund) sobald Status = 'gesendet'. Verhindert versehentliche Änderungen nach dem Absenden. |
| 2026-04-29 | feat(faelle): FaelleDossierClient — Status-Toggle für Widerspruch jetzt persistent über Tab-Wechsel hinweg (State in FallDossierCard gehoben statt in WiderspruchThreadTab). |
| 2026-04-29 | feat(faelle): Prominente CTA-Buttons in BescheidTab (blau "Widerspruch bei AXA", orange "Arzt um Korrektur bitten") + ArztBriefNode im Widerspruch-Thread mit eigenem Status-Toggle + Outlook-Button. |
| 2026-04-29 | docs(CLAUDE.md): fall-context.ts 9 Sections vollständig dokumentiert; Matching-Architektur (Section 2.8); neue API-Routen /rematch + /debug/matching ergänzt. |
