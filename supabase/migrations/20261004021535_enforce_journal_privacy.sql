-- "Private" must be enforced by RLS, not just filtered in the coach UI.
-- The owner's existing ALL policy continues to allow their own entries.
ALTER POLICY "Coach can read client journal entries"
ON public.journal_entries TO authenticated
USING (
  is_private = false
  AND client_id IN (
    SELECT profile_id FROM public.clients
    WHERE coach_id = (SELECT auth.uid())
  )
);
