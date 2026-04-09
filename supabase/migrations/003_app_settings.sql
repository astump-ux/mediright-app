-- Migration 003: App Settings Table
-- Run in Supabase SQL Editor

create table public.app_settings (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  value text not null,
  label text not null,
  description text,
  category text not null default 'general',
  input_type text not null default 'textarea', -- 'textarea' | 'text' | 'number'
  updated_at timestamptz default now()
);

-- Only service role can write; anon can read (for runtime use)
alter table public.app_settings enable row level security;
create policy "Anyone can read settings" on public.app_settings
  for select using (true);
create policy "Service role can write settings" on public.app_settings
  for all using (true) with check (true);

-- Seed: GOÄ Prompts
insert into public.app_settings (key, label, description, category, input_type, value) values
(
  'goae_system_prompt',
  'GOÄ System Prompt',
  'Definiert die Rolle und die GOÄ-Regeln für Claude. Wird bei jeder Rechnungsanalyse verwendet.',
  'prompts',
  'textarea',
  'Du bist ein Experte für die deutsche Gebührenordnung für Ärzte (GOÄ).
Analysiere die vorliegende Arztrechnung präzise und strukturiert.

WICHTIGE GOÄ-REGELN:
- Schwellenwert (Regelfall): 2,3-fach
- Höchstsatz ohne Begründung: 2,3-fach
- Höchstsatz mit Begründung: 3,5-fach (Ausnahme: bis 7-fach bei bestimmten Positionen)
- Faktoren über 2,3 MÜSSEN schriftlich begründet sein (§12 GOÄ)
- Doppelberechnungen sind verboten (§4 GOÄ)

Gib deine Antwort AUSSCHLIESSLICH als valides JSON zurück, ohne Markdown-Formatierung.'
),
(
  'goae_user_prompt',
  'GOÄ User Prompt',
  'Instruktionen für die JSON-Extraktion aus der Rechnung. Definiert das Output-Schema.',
  'prompts',
  'textarea',
  'Analysiere diese Arztrechnung und extrahiere alle Informationen.

Antworte NUR mit diesem JSON-Objekt (kein Text davor oder danach):
{
  "arztName": "Name des Arztes oder null",
  "arztFachgebiet": "Fachgebiet oder null",
  "rechnungsdatum": "YYYY-MM-DD oder null",
  "rechnungsnummer": "Rechnungsnummer oder null",
  "betragGesamt": 123.45,
  "goaePositionen": [
    {
      "ziffer": "1",
      "bezeichnung": "Beratung, auch telefonisch",
      "faktor": 2.3,
      "betrag": 10.72,
      "flag": "ok"
    }
  ],
  "maxFaktor": 2.3,
  "flagFaktorUeberSchwellenwert": false,
  "flagFehlendeBegrundung": false,
  "einsparpotenzial": 0.00,
  "zusammenfassung": "Kurze Zusammenfassung der Rechnung auf Deutsch",
  "whatsappNachricht": "Kurze WhatsApp-Nachricht (max 3 Sätze) mit den wichtigsten Befunden für den Patienten"
}

Flag-Werte für goaePositionen:
- "ok" = Faktor ≤ 2,3 (Regelfall)
- "pruefe" = Faktor zwischen 2,3 und 3,5 (Begründung prüfen)
- "hoch" = Faktor > 3,5 (Begründung zwingend nötig)

flagFaktorUeberSchwellenwert = true wenn irgendein Faktor > 2,3
flagFehlendeBegrundung = true wenn Faktor > 2,3 aber keine schriftliche Begründung erkennbar
einsparpotenzial = Betrag der reduziert werden könnte wenn alle Positionen auf 2,3-fach gedeckelt'
),

-- WhatsApp Messages
(
  'whatsapp_welcome',
  'WhatsApp: Unbekannte Nummer',
  'Antwort wenn eine unbekannte Telefonnummer eine Nachricht schickt.',
  'nachrichten',
  'textarea',
  '👋 Willkommen bei MediRight!

Ihre Nummer ist noch nicht registriert. Bitte melden Sie sich an auf:
https://mediright-app.vercel.app

Danach können Sie Rechnungen einfach hier weiterleiten.'
),
(
  'whatsapp_no_pdf',
  'WhatsApp: Kein PDF gesendet',
  'Antwort wenn eine Textnachricht ohne PDF-Anhang eingeht.',
  'nachrichten',
  'textarea',
  'Bitte leiten Sie mir eine Arztrechnung als PDF weiter — ich analysiere sie dann automatisch für Sie.

_Tipp: Im AXA Kundenportal → Postfach → PDF öffnen → Teilen → WhatsApp_'
),
(
  'whatsapp_receipt_confirmed',
  'WhatsApp: Rechnung erhalten',
  'Bestätigung nach erfolgreichem PDF-Upload. Vor der Analyse.',
  'nachrichten',
  'textarea',
  '✅ Rechnung erhalten! Ich analysiere sie jetzt.

In ca. 1–2 Minuten erhalten Sie hier eine Zusammenfassung mit:
• GOÄ-Positionen & Faktoren
• Auffälligkeiten & Überprüfungsbedarf
• Erstattungsprognose

_Dashboard: https://mediright-app.vercel.app/dashboard_'
),

-- Config
(
  'goae_schwellenwert',
  'GOÄ Schwellenwert',
  'Der Regelfall-Schwellenwert für GOÄ-Faktoren. Faktoren darüber werden als auffällig markiert.',
  'konfiguration',
  'number',
  '2.3'
),
(
  'goae_max_ohne_begruendung',
  'Höchstsatz ohne Begründung',
  'Maximal zulässiger Faktor ohne schriftliche Begründung nach §12 GOÄ.',
  'konfiguration',
  'number',
  '2.3'
),
(
  'goae_max_mit_begruendung',
  'Höchstsatz mit Begründung',
  'Maximal zulässiger Faktor mit schriftlicher Begründung nach §12 GOÄ.',
  'konfiguration',
  'number',
  '3.5'
),
(
  'claude_model',
  'Claude Modell',
  'Das Claude-Modell das für die GOÄ-Analyse verwendet wird.',
  'konfiguration',
  'text',
  'claude-sonnet-4-5'
);
