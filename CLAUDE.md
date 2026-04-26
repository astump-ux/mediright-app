@AGENTS.md

# MediRight — Architekturdokumentation & Source of Truth

> Letzte Aktualisierung: 2026-04-26
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

## 4. Datenbank-Schema (35 Migrationen)

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
| `pkv_urteile` | Kuratierte BGH/OLG-Urteile (Migrations 031–032) |
| `pkv_ombudsmann_statistik` | Ombudsmann-Statistik 2025: Einigungsquote 33,1%, Kategorien |
| `goae_positionen` | ~80 kuratierte GOÄ-Streitfall-Ziffern (034) + 908 Vollseeding aus Bundesärztekammer-PDF (037) |
| `pkv_ablehnungsmuster` | Anonymisierte Cross-User-Muster, wächst via DB-Trigger automatisch |
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
| `/api/kassenabrechnungen/[id]/widerspruch-status` | GET | Aktueller Status |
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
| 4 | BGH/OLG-Urteile | `pkv_urteile` | ✅ ~15 Urteile, Migrations 031–032 | 6 |
| — | AVB-Vertragsanalyse (User) | `tarif_profile` | ✅ Upload + Claude-Analyse im Onboarding | 4 |
| — | Tarif-Benchmarks (5 Versicherer) | `tarif_benchmarks` | ✅ Debeka/DKV/Allianz/Signal Iduna/Barmenia | 5 |

**Nächste offene Quelle:** OLG-Urteile (Source #4 ursprünglich geplant) — Recherche noch ausstehend.

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

## 10. Widerspruch-Status-Maschine

```
keiner → erstellt → gesendet → beantwortet → akzeptiert
                                            → abgelehnt
```

Parallel läuft `arzt_reklamation_status` für Direktreklamationen beim Arzt (unabhängiger Track).

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

- ~~**GOÄ-Vollseeding:**~~ ✅ Migration 037 erledigt — 908 Positionen via pdfplumber-Parser aus Bundesärztekammer-PDF, Faktortyp-Ableitung aus Ziffernbereichen (Labor 3500-4999, Technisch 5000-5999)
- ~~**Widerspruch-Outcome-Tracking:**~~ ✅ Erledigt in Migration 036 — DB-Trigger feuert automatisch bei Status → 'akzeptiert'/'abgelehnt'
- **OLG-Urteile (Source #4):** Noch nicht recherchiert/geseedet
- **UpsellBand Task #22:** Credit-aware 5-state Redesign noch in_progress

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
