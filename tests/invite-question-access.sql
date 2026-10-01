-- Counts and assertions only. All claim changes and test writes roll back.
begin;
-- The approved dogfooding account has no original invite. Create isolated
-- invitation-only and inaccessible forms so positive checks are not vacuous.
select set_config('srg_fit_test.invited_form', gen_random_uuid()::text, true);
select set_config('srg_fit_test.other_form', gen_random_uuid()::text, true);
insert into public.onboarding_forms (id, coach_id, title)
values
  (current_setting('srg_fit_test.invited_form')::uuid, '133f93d0-2399-4542-bc57-db4de8b98d79', 'Synthetic invitation access test'),
  (current_setting('srg_fit_test.other_form')::uuid, '133f93d0-2399-4542-bc57-db4de8b98d79', 'Synthetic unassigned access test');
insert into public.onboarding_questions (form_id, label)
values
  (current_setting('srg_fit_test.invited_form')::uuid, 'Synthetic invited question'),
  (current_setting('srg_fit_test.other_form')::uuid, 'Synthetic unassigned question');
insert into public.client_invites (coach_id, email, token, onboarding_form_id, expires_at, status)
select '133f93d0-2399-4542-bc57-db4de8b98d79', p.email, gen_random_uuid()::text,
  current_setting('srg_fit_test.invited_form')::uuid, now() + interval '1 day', 'pending'
from public.profiles p where p.id='aba0fe07-3690-460b-a35a-cb4e33d3665d';
select set_config('srg_fit_test.questions', (select count(*)::text from public.onboarding_questions where form_id='f091202e-1f81-4b93-ab92-f2f060cc0e22'), true);
select set_config('srg_fit_test.coach_invites', (select count(*)::text from public.client_invites where coach_id='133f93d0-2399-4542-bc57-db4de8b98d79'), true);
select set_config('srg_fit_test.own_invites', (select count(*)::text from public.client_invites i join public.profiles p on p.email=i.email where p.id='aba0fe07-3690-460b-a35a-cb4e33d3665d'), true);
select set_config('srg_fit_test.invited_questions', (select count(*)::text from public.onboarding_questions q where q.form_id in (select i.onboarding_form_id from public.client_invites i join public.profiles p on p.email=i.email where p.id='aba0fe07-3690-460b-a35a-cb4e33d3665d')), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"aba0fe07-3690-460b-a35a-cb4e33d3665d","role":"authenticated"}';
do $$
declare affected integer;
begin
  if not exists (select 1 from public.onboarding_questions where form_id=current_setting('srg_fit_test.invited_form')::uuid)
    or exists (select 1 from public.onboarding_questions where form_id=current_setting('srg_fit_test.other_form')::uuid) then
    raise exception 'Invitation-only question access is incorrect';
  end if;
  if (select count(*) from public.onboarding_questions where form_id='f091202e-1f81-4b93-ab92-f2f060cc0e22') <> current_setting('srg_fit_test.questions')::integer
    or current_setting('srg_fit_test.questions')::integer = 0 then
    raise exception 'Assigned client lost check-in questions';
  end if;
  if exists (select 1 from public.onboarding_questions q where not exists (select 1 from public.onboarding_forms f where f.id=q.form_id)) then
    raise exception 'Client can read questions for an inaccessible form';
  end if;
  if (select count(*) from public.client_invites) <> current_setting('srg_fit_test.own_invites')::integer then
    raise exception 'Client invitation scope is incorrect';
  end if;
  if (select count(*) from public.onboarding_questions q where q.form_id in (select onboarding_form_id from public.client_invites)) <> current_setting('srg_fit_test.invited_questions')::integer then
    raise exception 'Original invited form questions are inaccessible';
  end if;
  update public.onboarding_questions set label=label where form_id='f091202e-1f81-4b93-ab92-f2f060cc0e22';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Client can edit template questions'; end if;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.client_invites) or exists (select 1 from public.onboarding_questions) then
    raise exception 'Unassigned account can read invitations or questions';
  end if;
end $$;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  if exists (select 1 from public.client_invites) or exists (select 1 from public.onboarding_questions) then
    raise exception 'Anonymous visitor can read invitations or questions';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';
do $$
declare affected integer;
begin
  if (select count(*) from public.client_invites) <> current_setting('srg_fit_test.coach_invites')::integer then
    raise exception 'Coach lost invitation history';
  end if;
  update public.onboarding_questions set label=label where form_id='f091202e-1f81-4b93-ab92-f2f060cc0e22';
  get diagnostics affected = row_count;
  if affected <> current_setting('srg_fit_test.questions')::integer then raise exception 'Coach cannot edit their form questions'; end if;
end $$;
select 'client/coach invitation and question access passed; outsiders blocked' as result;
rollback;
