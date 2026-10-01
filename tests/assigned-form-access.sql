-- Read-only live regression checks using the approved dogfooding account.
-- Run as the database administrator; all role/claim changes are rolled back.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aba0fe07-3690-460b-a35a-cb4e33d3665d","role":"authenticated"}';
do $$
begin
  if not exists (
    select 1 from public.client_form_assignments a
    join public.onboarding_forms f on f.id = a.form_id
    where a.id = 'f4d12231-d7f0-4a0e-accf-73e30117c90f'
  ) then
    raise exception 'Client cannot read the assigned check-in form';
  end if;
  if exists (
    select 1 from public.onboarding_forms f
    where not exists (
      select 1 from public.client_form_assignments a
      join public.clients c on c.id = a.client_id
      where a.form_id = f.id and c.profile_id = auth.uid()
    ) and not exists (
      select 1 from public.client_invites i
      join public.profiles p on p.email = i.email
      where i.onboarding_form_id = f.id and p.id = auth.uid()
    ) and f.coach_id is distinct from auth.uid()
  ) then
    raise exception 'Client can read forms outside their assignments or invitations';
  end if;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.onboarding_forms) then
    raise exception 'Unassigned account can read forms';
  end if;
end $$;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  if exists (select 1 from public.onboarding_forms) then
    raise exception 'Anonymous visitor can read forms';
  end if;
exception when insufficient_privilege then
  -- The existing invitation policy references profiles, which anon cannot read.
  -- Permission denial is also a valid fail-closed result; do not grant access.
  null;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';
do $$
begin
  if not exists (select 1 from public.onboarding_forms where id = 'f091202e-1f81-4b93-ab92-f2f060cc0e22') then
    raise exception 'Coach can no longer read their check-in form';
  end if;
end $$;
select 'assigned form access checks passed' as result;
rollback;
