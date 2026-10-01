-- Synthetic exercise only; no client data, storage objects, or durable writes.
begin;
select set_config('srg_fit_test.exercise_id', gen_random_uuid()::text, true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';
insert into public.exercises (id, coach_id, name, difficulty)
values (current_setting('srg_fit_test.exercise_id')::uuid, auth.uid(), 'Synthetic save verification', 'Intermediate');
do $$
declare affected integer;
begin
  update public.exercises set cues = 'Synthetic cue'
  where id = current_setting('srg_fit_test.exercise_id')::uuid and coach_id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Coach save did not affect exactly one exercise'; end if;
  if not exists (select 1 from public.exercises where id = current_setting('srg_fit_test.exercise_id')::uuid and cues = 'Synthetic cue') then
    raise exception 'Coach cannot confirm the saved exercise';
  end if;
end $$;
set local request.jwt.claims = '{"sub":"aba0fe07-3690-460b-a35a-cb4e33d3665d","role":"authenticated"}';
do $$
declare affected integer;
begin
  update public.exercises set cues = 'Must not persist'
  where id = current_setting('srg_fit_test.exercise_id')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Client modified a coach-owned exercise'; end if;
end $$;
select 'coach save confirmed; client edit blocked; rollback follows' as result;
rollback;
