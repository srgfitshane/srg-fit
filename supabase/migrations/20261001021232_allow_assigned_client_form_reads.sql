-- Invitations and later check-ins are separate assignment paths. Allow clients
-- to read form metadata for their own assignments without expanding write access.
create policy "client_read_assigned_forms"
on public.onboarding_forms
for select
to authenticated
using (
  id in (
    select a.form_id
    from public.client_form_assignments a
    join public.clients c on c.id = a.client_id
    where c.profile_id = (select auth.uid())
  )
);
