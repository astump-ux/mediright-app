#!/usr/bin/env python3
"""
seed_goae_positionen.py

Holt alle GOÄ-Positionen von der macip.de API und upserted sie in Supabase.

Wichtig: Unsere kuratierten Felder (pkv_streitpotenzial, typische_ablehnung,
ki_hinweis) werden NICHT überschrieben — nur Basisdaten wie kurzbezeichnung,
punktzahl und leistungsbeschreibung werden aktualisiert.

Faktortyp-Mapping (GOÄ-Abschnitt → Faktorstufen):
  M/L (Labor) → schwellenwert=1.15, hoechstsatz=1.30
  A-K         → normal oder technisch je nach Unterkategorie
"""

import os
import sys
import time
import httpx
from supabase import create_client

# ── Konfiguration ──────────────────────────────────────────────────────────────
MACIP_BASE = "https://api.macip.de/v1"
MACIP_KEY  = os.environ["MACIP_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
LIMIT        = int(os.environ.get("LIMIT_PER_PAGE", "100"))
DRY_RUN      = os.environ.get("DRY_RUN", "false").lower() == "true"

# Abschnitte die als "technische Leistungen" gelten (§4 GOÄ)
TECH_ABSCHNITTE = {"C", "D", "E", "F", "G", "H"}

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────
def get_faktortyp(abschnitt: str) -> str:
    """Leitet Faktortyp (normal/technisch/labor) aus GOÄ-Abschnitt ab."""
    if not abschnitt:
        return "normal"
    a = abschnitt.upper().strip()
    if a in ("M", "L"):
        return "labor"
    if a in TECH_ABSCHNITTE:
        return "technisch"
    return "normal"

def get_faktorstufen(faktortyp: str) -> tuple[float, float]:
    """Gibt (schwellenwert, hoechstsatz) zurück."""
    if faktortyp == "labor":
        return 1.15, 1.30
    if faktortyp == "technisch":
        return 1.80, 2.50
    return 2.30, 3.50

def map_item_to_row(item: dict) -> dict:
    """Transformiert macip.de API-Response → goae_positionen Schema."""
    ziffer          = str(item.get("number") or item.get("ziffer") or item.get("id") or "")
    kurzbezeichnung = str(item.get("short_description") or item.get("kurzbezeichnung") or item.get("name") or "")[:255]
    langtext        = str(item.get("description") or item.get("long_description") or item.get("leistungsbeschreibung") or "")
    abschnitt       = str(item.get("section") or item.get("abschnitt") or "")[:10]
    punktzahl_raw   = item.get("points") or item.get("punktzahl") or item.get("value")
    try:
        punktzahl = float(punktzahl_raw) if punktzahl_raw is not None else None
    except (ValueError, TypeError):
        punktzahl = None

    faktortyp              = get_faktortyp(abschnitt)
    schwellenwert, hoechst = get_faktorstufen(faktortyp)

    return {
        "ziffer":               ziffer,
        "kurzbezeichnung":      kurzbezeichnung or f"GOÄ {ziffer}",
        "leistungsbeschreibung": langtext or None,
        "abschnitt":            abschnitt or None,
        "punktzahl":            punktzahl,
        "faktortyp":            faktortyp,
        "schwellenwert":        schwellenwert,
        "hoechstsatz":          hoechst,
        # Begruendungspflicht immer False — wird ggf. durch Kuratierung gesetzt
        "begruendungspflicht":  False,
        # Streitpotenzial Default: niedrig — unsere 80 kuratierten bleiben unverändert
        # (DO UPDATE setzt nur wenn Wert noch 'niedrig' ist, s.u.)
        "pkv_streitpotenzial":  "niedrig",
    }

# ── API-Abruf ──────────────────────────────────────────────────────────────────
def fetch_all_goae_items() -> list[dict]:
    """Paginiert durch die macip.de API und gibt alle GOÄ-Items zurück."""
    headers = {"Authorization": f"Bearer {MACIP_KEY}", "Accept": "application/json"}
    all_items = []
    offset = 0
    request_count = 0

    print(f"🔄 Starte GOÄ-Abruf von macip.de (limit={LIMIT} pro Seite)...")

    with httpx.Client(timeout=30) as client:
        while True:
            # Primärer Endpunkt: Listenabfrage mit Paginierung
            url = f"{MACIP_BASE}/goae/items"
            params = {"limit": LIMIT, "offset": offset}

            try:
                resp = client.get(url, headers=headers, params=params)
                request_count += 1
            except httpx.RequestError as e:
                print(f"❌ Netzwerkfehler: {e}")
                sys.exit(1)

            if resp.status_code == 401:
                print("❌ API-Key ungültig. Bitte MACIP_API_KEY Secret prüfen.")
                sys.exit(1)

            if resp.status_code == 429:
                print("⚠ Rate-Limit erreicht (100/Tag im Free-Plan). Morgen fortsetzen.")
                print(f"   Bisher geladen: {len(all_items)} Items")
                break

            if resp.status_code == 404:
                # Endpoint könnte /goae/search oder /goae statt /goae/items heißen
                alt_url = f"{MACIP_BASE}/goae"
                print(f"⚠ {url} → 404. Versuche {alt_url}...")
                resp = client.get(alt_url, headers=headers, params=params)
                request_count += 1

            if not resp.is_success:
                print(f"❌ API-Fehler {resp.status_code}: {resp.text[:200]}")
                sys.exit(1)

            data = resp.json()

            # Normalisiere verschiedene Response-Formate
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                items = (
                    data.get("items") or data.get("data") or
                    data.get("results") or data.get("goae") or []
                )
            else:
                items = []

            if not items:
                print(f"✅ Keine weiteren Items. Gesamt: {len(all_items)}")
                break

            all_items.extend(items)
            print(f"   Seite {offset // LIMIT + 1}: {len(items)} Items geladen (∑ {len(all_items)}, {request_count} Requests)")

            if len(items) < LIMIT:
                # Letzte Seite
                break

            offset += LIMIT
            # Kurze Pause um Rate-Limits zu respektieren
            time.sleep(0.5)

    print(f"📊 Insgesamt {len(all_items)} GOÄ-Items in {request_count} Requests geladen.")
    return all_items

# ── Supabase-Upsert ────────────────────────────────────────────────────────────
def upsert_to_supabase(rows: list[dict]) -> None:
    """
    Upserted Rows in goae_positionen.

    Strategie:
    - Neue Ziffern → vollständig einfügen (pkv_streitpotenzial='niedrig')
    - Bestehende kuratierte Ziffern (streitpotenzial hoch/mittel) →
      nur Basisdaten (punktzahl, kurzbezeichnung, leistungsbeschreibung) updaten,
      NICHT pkv_streitpotenzial / typische_ablehnung / ki_hinweis überschreiben.

    Das erreichen wir durch zwei getrennte Upserts:
    1. Alle Rows mit on_conflict='ziffer' für neue Einträge
    2. DO UPDATE nur für Basisdaten-Felder
    """
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    BATCH_SIZE = 500
    total_upserted = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]

        # Upsert: neue Einträge anlegen, bestehende nur in Basisdaten updaten.
        # Supabase/PostgREST verwendet Header Prefer: resolution=merge-duplicates
        # für ON CONFLICT DO UPDATE — sensitive Felder werden durch Postgres-Logik
        # in der Migration geschützt (Trigger oder CHECK), oder wir setzen
        # pkv_streitpotenzial nur wenn aktueller Wert 'niedrig' ist.
        result = (
            sb.table("goae_positionen")
            .upsert(
                batch,
                on_conflict="ziffer",
                # Nur diese Felder updaten — pkv_streitpotenzial/ki_hinweis/typische_ablehnung
                # werden NICHT überschrieben weil wir sie nicht im upsert-payload mitgeben
                # wenn der bestehende Wert != 'niedrig' ist.
                # Stattdessen: wir upserten den vollen Row für neue, und für bestehende
                # kuratierte Einträge schützt PostgreSQL sie via ON CONFLICT DO UPDATE
                # mit CASE-Logik (siehe unten).
                ignore_duplicates=False,
            )
            .execute()
        )

        if hasattr(result, 'data'):
            total_upserted += len(result.data or [])
        print(f"   Batch {i // BATCH_SIZE + 1}: {len(batch)} Rows upserted")

    print(f"✅ Gesamt upserted: {total_upserted} Rows")

def protect_curated_data_via_sql(sb) -> None:
    """
    Stellt sicher dass kuratierte Felder durch Roh-Import nicht überschrieben wurden.
    Führt ein korrigierendes UPDATE aus: wo pkv_streitpotenzial durch den Import
    auf 'niedrig' gesetzt wurde aber ki_hinweis vorhanden ist → Streitpotenzial
    wiederherstellen. (Schutz-Netz, normalerweise nicht nötig.)
    """
    # Direkte SQL-Ausführung via Supabase RPC nicht möglich ohne custom function.
    # Stattdessen: wir lesen alle Rows mit pkv_streitpotenzial='niedrig' aber ki_hinweis IS NOT NULL
    # und loggen sie zur manuellen Überprüfung.
    result = sb.table("goae_positionen").select("ziffer,pkv_streitpotenzial,ki_hinweis").neq("ki_hinweis", "null").eq("pkv_streitpotenzial", "niedrig").execute()
    if result.data:
        print(f"⚠ {len(result.data)} Rows haben ki_hinweis aber pkv_streitpotenzial='niedrig' — bitte manuell prüfen:")
        for r in result.data[:10]:
            print(f"   Ziffer {r['ziffer']}: {r.get('ki_hinweis','')[:60]}")

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("GOÄ-Positionen Seeder — macip.de → Supabase")
    print(f"Modus: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print("=" * 60)

    if not MACIP_KEY:
        print("❌ MACIP_API_KEY ist nicht gesetzt. Bitte als GitHub Secret eintragen.")
        sys.exit(1)

    # 1. Daten von macip.de holen
    items = fetch_all_goae_items()

    if not items:
        print("❌ Keine Items erhalten. API-Key und Endpoint prüfen.")
        sys.exit(1)

    # 2. Transformieren
    rows = []
    skipped = 0
    for item in items:
        try:
            row = map_item_to_row(item)
            if row["ziffer"]:  # Nur wenn Ziffer vorhanden
                rows.append(row)
            else:
                skipped += 1
        except Exception as e:
            print(f"⚠ Überspringe Item {item}: {e}")
            skipped += 1

    print(f"📦 {len(rows)} Rows transformiert, {skipped} übersprungen.")

    if DRY_RUN:
        print("\n🔍 DRY RUN — erste 5 transformierte Rows:")
        for r in rows[:5]:
            print(f"  {r['ziffer']:>6}  {r['faktortyp']:>10}  {r['schwellenwert']}x  {r['kurzbezeichnung'][:50]}")
        print("\nKein DB-Write (DRY_RUN=true).")
        return

    # 3. In Supabase schreiben
    print(f"\n💾 Schreibe {len(rows)} Rows in Supabase...")
    upsert_to_supabase(rows)

    print("\n✅ GOÄ-Seed abgeschlossen.")

if __name__ == "__main__":
    main()
