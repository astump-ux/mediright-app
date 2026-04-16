-- Migration 015: Per-analysis model selection settings

-- Add select_options column to app_settings for dropdown choices
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS select_options jsonb DEFAULT NULL;

-- Update input_type check constraint to allow 'select'
-- (drop old constraint if it exists, recreate with new values)
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_input_type_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_input_type_check
  CHECK (input_type IN ('textarea', 'text', 'number', 'select'));

-- Insert model selection settings
INSERT INTO app_settings (key, value, label, description, category, input_type, select_options)
VALUES
(
  'goae_analyse_model',
  'claude-sonnet-4-6',
  'Modell: Arztrechnung (GOÄ)',
  'KI-Modell für die Analyse von Arztrechnungen und GOÄ-Positionen.',
  'konfiguration',
  'select',
  '[
    {"value": "claude-sonnet-4-6",         "label": "Claude Sonnet 4.6 — empfohlen"},
    {"value": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5 — schnell & günstig"},
    {"value": "gemini-2.5-flash",          "label": "Gemini 2.5 Flash — Google, schnell"},
    {"value": "gemini-2.5-pro",            "label": "Gemini 2.5 Pro — Google, leistungsstark"}
  ]'::jsonb
),
(
  'kasse_analyse_model',
  'claude-sonnet-4-6',
  'Modell: Kassenbescheid-Analyse',
  'KI-Modell für die Analyse von AXA-Erstattungsbescheiden.',
  'konfiguration',
  'select',
  '[
    {"value": "claude-sonnet-4-6",         "label": "Claude Sonnet 4.6 — empfohlen"},
    {"value": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5 — schnell & günstig"},
    {"value": "gemini-2.5-flash",          "label": "Gemini 2.5 Flash — Google, schnell"},
    {"value": "gemini-2.5-pro",            "label": "Gemini 2.5 Pro — Google, leistungsstark"}
  ]'::jsonb
),
(
  'widerspruch_analyse_model',
  'claude-sonnet-4-6',
  'Modell: Widerspruchs-Analyse',
  'KI-Modell für die Analyse eingehender Schreiben im Widerspruchsverfahren.',
  'konfiguration',
  'select',
  '[
    {"value": "claude-sonnet-4-6",         "label": "Claude Sonnet 4.6 — empfohlen"},
    {"value": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5 — schnell & günstig"},
    {"value": "gemini-2.5-flash",          "label": "Gemini 2.5 Flash — Google, schnell"},
    {"value": "gemini-2.5-pro",            "label": "Gemini 2.5 Pro — Google, leistungsstark"}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
