-- Create storage buckets (run in Supabase SQL editor)
-- uploads: private user file storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads', 'uploads', false,
  20971520,  -- 20MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'text/plain'
  ]
) ON CONFLICT (id) DO NOTHING;

-- invoices: public bucket for generated invoice files
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- business-assets: public bucket for logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', true)
ON CONFLICT (id) DO NOTHING;

-- greetings: public bucket for voice greeting recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('greetings', 'greetings', true)
ON CONFLICT (id) DO NOTHING;

-- ── Storage policies for uploads bucket ──────────────────────────
-- (Skip if already created by 001_initial.sql)
DO $$ BEGIN
  CREATE POLICY "Service role can upload files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'uploads');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can read files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'uploads');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Storage policies for business-assets bucket ───────────────────
DO $$ BEGIN
  CREATE POLICY "Users can upload business assets"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'business-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Business assets are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Storage policies for invoices bucket ─────────────────────────
DO $$ BEGIN
  CREATE POLICY "Invoices are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'invoices');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Storage policies for greetings bucket ────────────────────────
DO $$ BEGIN
  CREATE POLICY "Greetings are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'greetings');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
