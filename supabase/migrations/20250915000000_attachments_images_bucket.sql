-- Attachments images bucket: create/update with desired settings + RLS policies
-- This migration is flat under supabase/migrations so it runs with `supabase db reset`
-- Idempotent: safe to run multiple times

-- Bucket settings to match Studio screenshot:
-- - private bucket (public = false)
-- - file size limit = 10 MB
-- - allowed mime types = image/png, image/jpeg, image/webp

-- Upsert bucket so settings are enforced even if bucket already exists
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

-- Note: RLS on storage.objects is managed by the Storage extension and is
-- typically already enabled. Avoid toggling it here to prevent ownership errors.

-- Policies scoped to this bucket. Create only if missing.
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
