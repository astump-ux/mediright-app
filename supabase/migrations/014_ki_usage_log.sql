-- Migration 014: Token usage logging for all AI calls

CREATE TABLE IF NOT EXISTS ki_usage_log (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now() NOT NULL,
  call_type     text        NOT NULL,  -- 'goae_analyse' | 'kasse_analyse' | 'widerspruch_analyse'
  model         text        NOT NULL,
  input_tokens  integer     NOT NULL DEFAULT 0,
  output_tokens integer     NOT NULL DEFAULT 0,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ki_usage_log_created_at_idx ON ki_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ki_usage_log_user_id_idx    ON ki_usage_log (user_id);

-- RLS: only admins / service role can read; inserts happen via service role
ALTER TABLE ki_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON ki_usage_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
