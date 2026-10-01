-- Public invite pages use the token-filtered server route. Direct table reads
-- must never expose other clients' email addresses or invitation tokens.
alter policy "Anyone can read invite by token" on public.client_invites
  to authenticated
  using (email in (select p.email from public.profiles p where p.id = (select auth.uid())));
alter policy "Anyone can read invite by token" on public.client_invites
  rename to "client_read_own_invites";
alter policy "Coach manages own invites" on public.client_invites
  to authenticated;

-- Reuse form RLS: own coach forms, original invitations, and later client
-- assignments. Keep the existing coach write predicate unchanged.
alter policy "Clients can read questions" on public.onboarding_questions
  to authenticated
  using (form_id in (select f.id from public.onboarding_forms f));
alter policy "Clients can read questions" on public.onboarding_questions
  rename to "read_accessible_form_questions";
alter policy "Coach manages own questions" on public.onboarding_questions
  to authenticated;
