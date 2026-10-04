-- Synthetic entries only, on Shane's approved test profile. Always rolls back.
BEGIN;
INSERT INTO public.journal_entries (id, client_id, entry_date, content, is_private) VALUES
('00000000-0000-4000-8000-000000000701', 'aba0fe07-3690-460b-a35a-cb4e33d3665d', '2077-01-01', 'Synthetic private probe', true),
('00000000-0000-4000-8000-000000000702', 'aba0fe07-3690-460b-a35a-cb4e33d3665d', '2077-01-02', 'Synthetic shared probe', false),
('00000000-0000-4000-8000-000000000703', '133f93d0-2399-4542-bc57-db4de8b98d79', '2077-01-03', 'Synthetic other-owner probe', true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aba0fe07-3690-460b-a35a-cb4e33d3665d","role":"authenticated"}';
DO $$
DECLARE saved_id uuid;
BEGIN
  IF (SELECT count(*) FROM public.journal_entries WHERE id IN ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000702')) <> 2 THEN
    RAISE EXCEPTION 'Owner cannot read own private/shared entries';
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id='00000000-0000-4000-8000-000000000703') THEN
    RAISE EXCEPTION 'Client can read another owner';
  END IF;
  INSERT INTO public.journal_entries (client_id, entry_date, content, is_private)
  VALUES (auth.uid(), '2077-01-01', 'Synthetic updated draft', true)
  ON CONFLICT (client_id, entry_date) DO UPDATE SET content=EXCLUDED.content, is_private=EXCLUDED.is_private
  RETURNING id INTO saved_id;
  IF saved_id <> '00000000-0000-4000-8000-000000000701' THEN RAISE EXCEPTION 'Owner upsert not confirmed'; END IF;
  INSERT INTO public.journal_entries (client_id, entry_date, content, is_private)
  VALUES (auth.uid(), '2077-01-05', 'Synthetic new owner entry', true)
  RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'Owner insert not confirmed'; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id='00000000-0000-4000-8000-000000000701') THEN RAISE EXCEPTION 'Private entry visible to coach'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id='00000000-0000-4000-8000-000000000702') THEN RAISE EXCEPTION 'Shared entry hidden from assigned coach'; END IF;
  UPDATE public.journal_entries SET content='Unauthorized' WHERE id='00000000-0000-4000-8000-000000000702';
  IF FOUND THEN RAISE EXCEPTION 'Coach can change client journal'; END IF;
  BEGIN
    INSERT INTO public.journal_entries (client_id, entry_date, content) VALUES ('aba0fe07-3690-460b-a35a-cb4e33d3665d', '2077-01-04', 'Unauthorized');
    RAISE EXCEPTION 'Coach can create client journal';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"aba0fe07-3690-460b-a35a-cb4e33d3665d","role":"authenticated"}';
UPDATE public.journal_entries SET is_private=true WHERE id='00000000-0000-4000-8000-000000000702';
UPDATE public.journal_entries SET is_private=false WHERE id='00000000-0000-4000-8000-000000000701';
SET LOCAL request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id='00000000-0000-4000-8000-000000000702') THEN RAISE EXCEPTION 'Privacy toggle did not hide entry'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id='00000000-0000-4000-8000-000000000701') THEN RAISE EXCEPTION 'Sharing toggle did not expose entry'; END IF;
END $$;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id IN ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000702')) THEN RAISE EXCEPTION 'Anonymous journal access'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT true AS journal_owner_writes_and_privacy_checks_passed;
ROLLBACK;
