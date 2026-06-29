-- Add language and duration columns to calls_log
ALTER TABLE public.calls_log ADD COLUMN IF NOT EXISTS language text DEFAULT 'af';
ALTER TABLE public.calls_log ADD COLUMN IF NOT EXISTS duration integer;

-- Allow service role to insert without user_id check (Twilio webhooks use service role)
-- Note: user_id stays NOT NULL for user-initiated calls; service-role inserts always pass it.

-- Per-turn conversation history within a call
CREATE TABLE IF NOT EXISTS public.call_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid    text        NOT NULL,
  user_id     uuid        REFERENCES auth.users ON DELETE SET NULL,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_conv_sid_time
  ON public.call_conversations (call_sid, created_at ASC);

ALTER TABLE public.call_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own call conversations"
  ON public.call_conversations FOR SELECT
  USING (auth.uid() = user_id);

-- call-audio storage bucket (public — Twilio must be able to fetch the audio URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-audio', 'call-audio', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "call-audio publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'call-audio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
