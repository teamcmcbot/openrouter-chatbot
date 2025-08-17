-- =============================================================================
-- STORAGE POLICIES (Supabase Storage)
-- =============================================================================
-- This file defines bucket-scoped RLS policies for Storage. RLS on storage.objects
-- is managed by Supabase and typically enabled by default. We add idempotent
-- DO blocks to create per-bucket policies for `attachments-images`.

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
        AND owner = auth.uid()
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
        AND owner = auth.uid()
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
        AND owner = auth.uid()
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
        AND owner = auth.uid()
      )
      WITH CHECK (
        bucket_id = 'attachments-images'
        AND owner = auth.uid()
      );
  END IF;
END$$;
