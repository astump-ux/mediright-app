-- Migration 004: Kassenabrechnung fields on vorgaenge
-- Run in Supabase SQL Editor

alter table public.vorgaenge
  add column if not exists kasse_pdf_storage_path text,
  add column if not exists kasse_analyse jsonb,
  add column if not exists kasse_eingegangen_am date,
  add column if not exists kasse_referenznummer text;

-- Seed: Kasse analysis prompt in app_settings
insert into public.app_settings (key, label, description, category, input_type, value)
values (
  'kasse_analyse_prompt',
  'Kassenabrechnung Analyse Prompt',
  'Prompt für die KI-Analyse von AXA Erstattungsbescheiden.',
  'prompts',
  'textarea',
  'Du bist ein Experte für private Krankenversicherung (PKV) in Deutschland, insbesondere für AXA-Tarife.

Analysiere diesen Erstattungsbescheid der Krankenversicherung präzise.

Extrahiere:
1. Alle erstatteten Positionen (GOÄ-Ziffer, Betrag eingereicht, Betrag erstattet)
2. Alle abgelehnten/gekürzten Positionen mit Begründung
3. Ablehnungsgründe kategorisieren: Analogziffer / Ausschluss / Faktorkürzung / IGeL / Sonstiges
4. Gesamterstattungsquote berechnen
5. Widerspruchspotenzial: Positionen wo Ablehnung anfechtbar erscheint

Antworte NUR als valides JSON:
{
  "referenznummer": "Bescheidnummer oder null",
  "bescheiddatum": "YYYY-MM-DD oder null",
  "betragEingereicht": 0.00,
  "betragErstattet": 0.00,
  "betragAbgelehnt": 0.00,
  "erstattungsquote": 0,
  "positionen": [
    {
      "ziffer": "1",
      "bezeichnung": "Bezeichnung",
      "betragEingereicht": 10.00,
      "betragErstattet": 10.00,
      "status": "erstattet",
      "ablehnungsgrund": null
    }
  ],
  "ablehnungsgruende": ["Grund 1", "Grund 2"],
  "widerspruchEmpfohlen": true,
  "widerspruchBegruendung": "Begründung warum Widerspruch sinnvoll wäre oder null",
  "zusammenfassung": "Kurze Zusammenfassung auf Deutsch",
  "whatsappNachricht": "Kurze WhatsApp-Nachricht (max 3 Sätze) für den Patienten"
}'
)
on conflict (key) do nothing;
