-- =============================================================================
-- STORAGE POLICIES (Supabase Storage)
-- =============================================================================
-- This file defines bucket-scoped RLS policies for Storage. RLS on storage.objects
-- is managed by Supabase and typically enabled by default. We add idempotent
-- DO blocks to create per-bucket policies for `attachments-images`.

-- -----------------------------------------------------------------------------
-- Buckets: canonical configuration for `attachments-images`
-- -----------------------------------------------------------------------------
-- Create or update the bucket with desired settings so a fresh clone has it.
-- - private bucket (public = false)
-- - file size limit = 10 MB
-- - allowed mime types = image/png, image/jpeg, image/webp
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments-images',
  'attachments-images',
  false,
  10 * 1024 * 1024, -- 10 MB in bytes
  ARRAY['image/png','image/jpeg','image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Read own objects in attachments-images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'attachments-images: read own'
  ) THEN
    CREATE POLICY "attachments-images: read own"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'attachments-images'
        AND owner = (select auth.uid())
      );
  END IF;
END$$;

-- Insert own objects into attachments-images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'attachments-images: insert own'
  ) THEN
    CREATE POLICY "attachments-images: insert own"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'attachments-images'
        AND owner = (select auth.uid())
      );
  END IF;
END$$;

-- Delete own objects in attachments-images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'attachments-images: delete own'
  ) THEN
    CREATE POLICY "attachments-images: delete own"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'attachments-images'
        AND owner = (select auth.uid())
      );
  END IF;
END$$;

-- Update (rename/move) own objects in attachments-images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'attachments-images: update own'
  ) THEN
    CREATE POLICY "attachments-images: update own"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'attachments-images'
        AND owner = (select auth.uid())
      )
      WITH CHECK (
        bucket_id = 'attachments-images'
        AND owner = (select auth.uid())
      );
  END IF;
END$$;
