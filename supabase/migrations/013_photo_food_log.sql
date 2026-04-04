-- Migration 013: Photo food log
-- Adds photo_url column, updates source check constraint,
-- and adds storage INSERT policy for workout-reviews bucket.
-- Applied manually via Supabase MCP on 2026-04-03 — captured here for version control.

-- 1. Add photo_url column to food_entries
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS photo_url text;

-- 2. Update source check constraint to include 'photo'
ALTER TABLE food_entries DROP CONSTRAINT IF EXISTS food_entries_source_check;
ALTER TABLE food_entries ADD CONSTRAINT food_entries_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'barcode'::text, 'search'::text, 'template'::text, 'photo'::text]));

-- 3. Allow authenticated users to upload to the workout-reviews storage bucket
-- (bucket is public for reads; this policy enables writes)
CREATE POLICY IF NOT EXISTS "authenticated_upload_workout_reviews"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'workout-reviews');
