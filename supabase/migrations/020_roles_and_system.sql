-- ── Migration 020: User Roles + Chat Model + System Settings ─────────────────
-- 1. Add role column to profiles (user | admin)
-- 2. Grant admin to stump23@gmail.com
-- 3. Add chat_model setting to konfiguration
-- 4. Move obsolete config settings to 'deprecated' category (hidden from UI)

-- 1. Role column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin'));

-- 2. Grant admin to stump23@gmail.com
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'stump23@gmail.com'
);

-- 3. Add chat_model to app_settings (Konfiguration section)
INSERT INTO app_settings (key, value, label, description, category, input_type, select_options)
VALUES (
  'chat_model',
  'claude-sonnet-4-6',
  'Modell: Chat-Assistent',
  'KI-Modell für den interaktiven PKV-Chat-Assistenten.',
  'konfiguration',
  'select',
  '[
    {"value": "claude-sonnet-4-6",         "label": "Claude Sonnet 4.6 — empfohlen"},
    {"value": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5 — schnell & günstig"},
    {"value": "claude-opus-4-6",           "label": "Claude Opus 4.6 — maximal leistungsstark"}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 4. Move obsolete settings out of UI visibility
--    (goae_schwellenwert, goae_max_*, claude_model — no longer configurable by users)
UPDATE public.app_settings
SET category = 'deprecated'
WHERE key IN (
  'goae_schwellenwert',
  'goae_max_ohne_begruendung',
  'goae_max_mit_begruendung',
  'claude_model'
);

-- 5. RLS: users can only read their own role
--    (profiles table already has user-scoped policies; role column inherits them)
