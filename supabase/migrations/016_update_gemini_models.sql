-- Migration 016: Update Gemini model options to new preview versions

-- Update select_options for all three model settings
UPDATE app_settings
SET select_options = '[
  {"value": "claude-sonnet-4-6",         "label": "Claude Sonnet 4.6 — empfohlen"},
  {"value": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5 — schnell & günstig"},
  {"value": "gemini-3-flash-preview",    "label": "Gemini 3 Flash — Google, schnell"},
  {"value": "gemini-3.1-pro-preview",    "label": "Gemini 3.1 Pro — Google, leistungsstark"}
]'::jsonb
WHERE key IN ('goae_analyse_model', 'kasse_analyse_model', 'widerspruch_analyse_model');

-- Reset any existing Gemini 2.5 selections to the new defaults
UPDATE app_settings
SET value = 'gemini-3-flash-preview'
WHERE key IN ('goae_analyse_model', 'kasse_analyse_model', 'widerspruch_analyse_model')
  AND value = 'gemini-2.5-flash';

UPDATE app_settings
SET value = 'gemini-3.1-pro-preview'
WHERE key IN ('goae_analyse_model', 'kasse_analyse_model', 'widerspruch_analyse_model')
  AND value = 'gemini-2.5-pro';
