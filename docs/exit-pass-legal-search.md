# Exit-Pass & Legal Search — Architektur-Dokumentation

> **Stand:** April 2026  
> **Betrifft:** `src/lib/legal-search.ts`, `src/lib/notifications.ts`

---

## Überblick

Die PKV-Widerspruchs-KI stützt sich auf eine **zweistufige Urteilssuche** mit automatischem Exit-Pass-Mechanismus. Ziel ist es, dem User stets eine fundierte Rechtsgrundlage zu liefern — auch wenn die lokale Datenbank für ein spezielles Thema noch dünn besetzt ist.

```
User-Anfrage
     │
     ▼
┌─────────────────────────┐
│  Stufe 1: Supabase      │  ← verifizierte Urteile (verified=true)
│  pkv_urteile            │
└────────────┬────────────┘
             │
     ≥ 2 Treffer?
     │           │
    JA           NEIN
     │           │
     ▼           ▼
Formatierter  EXIT-PASS ausgelöst
Output        │
              ├─▶ Live-Recherche (rechtsprechung-im-internet.de)
              ├─▶ Admin-Alert per E-Mail (parallel, fire-and-forget)
              └─▶ User-Hinweis im Output ("erweiterte Recherche")
```

---

## Confidence-Threshold

| Konstante              | Wert    | Bedeutung                                              |
|------------------------|---------|--------------------------------------------------------|
| `CONFIDENCE_THRESHOLD` | `2`     | Mindestanzahl verifizierter Urteile vor Exit-Pass      |
| `LIVE_TIMEOUT_MS`      | `6000`  | Max. Wartezeit für Live-Recherche (6 Sekunden)         |

Liegt die Supabase-Trefferzahl **unter dem Threshold**, triggert der Exit-Pass automatisch — ohne dass der User etwas tun muss.

---

## Stufe 1 — Supabase (verifizierte Urteile)

```typescript
// src/lib/legal-search.ts
const verified = await searchSupabase(kategorien, limit)

if (verified.length >= CONFIDENCE_THRESHOLD) {
  return formatVerifiedBlock(verified)   // ← normaler Pfad
}
// sonst: Exit-Pass →
```

Die Abfrage filtert auf `verified = true` und sortiert nach Datum (neueste zuerst). Kategorien werden automatisch aus den Ablehnungsgründen gemappt (`medizinische_notwendigkeit`, `goae`, `beitragsanpassung`, `ausschlussklausel`, `allgemein`).

---

## Exit-Pass — Live-Recherche

### Quelle: rechtsprechung-im-internet.de

Das offizielle BMJV-Portal für BGH- und OLG-Entscheidungen. Kein CAPTCHA, kein Login erforderlich.

```
GET https://www.rechtsprechung-im-internet.de/rii-search/rii/search
  ?request.query=<searchTerms>
  &request.pageSize=10
  &request.courts[]=bgh
  &request.courts[]=olg
```

**Suchbegriffe** werden automatisch aus den Ablehnungsgründen generiert:
- Immer: `"private Krankenversicherung"`
- Bei GOÄ-Bezug: `+ "GOÄ"`
- Bei Beitragsanpassung: `+ "Beitragsanpassung"`
- Bei med. Notwendigkeit: `+ "medizinisch notwendig"`
- usw. (max. 3 Terme)

### Ergebnis-Parsing

Die Funktion `liveResearchRii()` versucht zuerst JSON-Parsing, fällt bei HTML-Antwort auf Regex-Parsing zurück (Aktenzeichen-Extraktion + Kontext-Snippet).

### Speicherung in Supabase

Live-Treffer werden sofort als **`verified = false`** in `pkv_urteile` persistiert:

```json
{
  "verified": false,
  "schlagwoerter": ["Live-Recherche", "nicht verifiziert"],
  "relevanz_pkv": "Automatisch gefunden — bitte manuell prüfen und verifizieren."
}
```

→ Im Admin-Panel sichtbar und für manuelle Kuratierung vorgemerkt.

---

## Parallele Benachrichtigungen

Alle Notifications laufen **parallel zur Live-Recherche** via `Promise.all` — kein Added Latency für den User:

```typescript
const [liveResults] = await Promise.all([
  liveResearchRii(searchTerms),          // Stufe 2
  sendExitPassAlert({ ... }).catch(() => {}),  // Admin-Alert (fire-and-forget)
])
```

Nach Abschluss wird ein **zweiter Alert** mit der korrekten Live-Treffer-Zahl gesendet (async, fire-and-forget).

### Admin-E-Mail (`sendExitPassAlert`)

**An:** `astump@dl-remote.com`  
**Von:** `mediright@mediright.de`  
**Via:** Resend REST API

Inhalt der E-Mail:
- Anzahl verifizierter vs. live gefundener Urteile
- Ablehnungsgründe aus dem aktuellen Fall
- Suchabfrage (searchTerms)
- PKV-Kategorie
- Timestamp
- Link zu `/admin` für manuelle Nachkuratierung

### User-Hinweis im Output (`userExitPassHint`)

Ein ehrlicher, nicht-alarmierender Hinweis im Antwort-Block:

```
ℹ️  Für diese spezifische Fragestellung läuft eine erweiterte Recherche.
    Wir haben unsere verifizierten Quellen ergänzt und weitere Urteile
    zu "private Krankenversicherung GOÄ" einbezogen.
    Bitte prüfe alle gefundenen Urteile vor dem Zitieren im Widerspruch.
```

---

## Output-Struktur (Exit-Pass-Pfad)

```
[userExitPassHint]
[formatVerifiedBlock — falls verified > 0]
[formatLiveBlock — falls liveResults > 0]
```

Verifizierte Urteile sind mit ⚡ gekennzeichnet, Live-Treffer mit ⚠️ und dem expliziten Hinweis "NICHT manuell verifiziert — Volltext prüfen vor Zitierung".

---

## Setup — Umgebungsvariablen

### Vercel (Production + Preview)

| Variable              | Wert                        | Beschreibung                          |
|-----------------------|-----------------------------|---------------------------------------|
| `RESEND_API_KEY`      | `re_xxxxxxxxxxxx`           | Resend API Key (aus Resend Dashboard) |
| `NEXT_PUBLIC_APP_URL` | `https://mediright.vercel.app` | Basis-URL für Admin-Link in E-Mail |

### Resend-Konfiguration

1. Account anlegen: [resend.com](https://resend.com)
2. Sender-Domain `mediright.de` verifizieren (DNS TXT + MX Records)
3. API Key erstellen → in Vercel eintragen

### Lokale Entwicklung (`.env.local`)

```bash
RESEND_API_KEY=re_test_xxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Fail-Safe-Design

Der gesamte Exit-Pass ist so gebaut, dass **kein Fehler den User blockiert**:

- `sendExitPassAlert(...).catch(() => {})` — E-Mail-Fehler werden geschluckt
- `persistLiveResults(...).catch(() => {})` — DB-Fehler werden geschluckt
- `liveResearchRii()` gibt bei Timeout oder HTTP-Fehler `[]` zurück
- Fällt alles aus → User bekommt nur die verifizierten Supabase-Urteile (oder leeren String)

---

## Kategorien-Mapping

| Ablehnungsgrund-Schlagwort                        | Kategorie                    |
|---------------------------------------------------|------------------------------|
| beitrag, prämie, erhöhung, anpassung              | `beitragsanpassung`          |
| goä, goa, faktor, analogziffer, schwellenwert     | `goae`                       |
| ausschluss, klausel, vorerkrankung                | `ausschlussklausel`          |
| notwendig, heilbehandlung, therapie, medizinisch  | `medizinische_notwendigkeit` |
| ivf, implantat, laser, prothese, hilfsmittel      | `medizinische_notwendigkeit` |
| (kein Match)                                      | `medizinische_notwendigkeit` + `allgemein` |

---

## Qualitäts-Loop

```
Exit-Pass-Alert ──▶ Alex prüft Admin-Panel
                         │
                    Urteile manuell
                    verifizieren
                    (verified = false → true)
                         │
                    Nächster ähnlicher
                    Fall → Supabase-Treffer
                    ohne Exit-Pass
```

Jeder Exit-Pass-Trigger ist ein Signal, dass eine Lücke in der Wissensbasis existiert. Die E-Mail dient als Qualitätssignal für die Kuratierung.

---

## Verwandte Dateien

| Datei                          | Funktion                                          |
|--------------------------------|---------------------------------------------------|
| `src/lib/legal-search.ts`      | Zweistufige Suche + Exit-Pass-Logik               |
| `src/lib/notifications.ts`     | Resend-Alert + User-Hint-Funktion                 |
| `src/lib/supabase-admin.ts`    | Admin-Client für `pkv_urteile` Upsert             |
| `scripts/seed-olg-urteile.ts`  | Einmalig-Seeding (deprecated, OpenLegalData-Daten fehlerhaft) |
| `scripts/seed-openjur.ts`      | Einmalig-Seeding (deprecated, CAPTCHA-blockiert)  |

---

*Dokumentation generiert im Rahmen des MediRight PKV-Widerspruchs-Agenten-Projekts.*
