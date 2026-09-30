-- Read-only RLS checks under the designated client and coach, with rollback.
-- Assertions only: never emit other clients' private profile values.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aba0fe07-3690-460b-a35a-cb4e33d3665d';
do $test$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'Client can read profiles other than their own';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Client cannot read own full profile';
  end if;
  if (select count(*) from public.clients) <> 1 then
    raise exception 'Client record access changed';
  end if;
  perform count(*) from public.community_posts;
  perform count(*) from public.community_replies;
end;
$test$;

set local request.jwt.claim.sub = '133f93d0-2399-4542-bc57-db4de8b98d79';
do $test$
begin
  if exists (
    select 1 from public.clients c left join public.profiles p on p.id = c.profile_id
    where c.coach_id = auth.uid() and c.profile_id is not null and p.id is null
  ) then raise exception 'Coach cannot read an assigned client profile'; end if;
  if exists (
    select 1 from public.profiles p where p.id <> auth.uid() and not public.is_my_client(p.id)
  ) then raise exception 'Coach can read an unassigned profile'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Coach cannot read own role';
  end if;
end;
$test$;

set local request.jwt.claim.sub = '';
do $test$
begin
  if exists (select 1 from public.profiles) then raise exception 'Missing identity can read profiles'; end if;
end;
$test$;
set local role anon;
do $test$
begin
  begin
    perform count(*) from public.profiles;
    raise exception 'Anonymous profile query was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;
select true as profile_privacy_checks_passed;
rollback;
