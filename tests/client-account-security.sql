-- Production-safe regression check: uses only Shane's designated test account
-- and rolls back every write. Run with the Supabase SQL connector as postgres.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aba0fe07-3690-460b-a35a-cb4e33d3665d';
do $test$
declare
  affected integer;
begin
  begin
    update public.clients set coach_id = profile_id
    where id = 'd4b20a0d-d1de-4b91-83ca-6acfd4f6d82d';
    raise exception 'Client reassignment was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.clients set stripe_customer_id = 'cus_security_test'
    where id = 'd4b20a0d-d1de-4b91-83ca-6acfd4f6d82d';
    raise exception 'Client billing impersonation was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.clients set active = not active
    where id = 'd4b20a0d-d1de-4b91-83ca-6acfd4f6d82d';
    raise exception 'Client account status editing was allowed';
  exception when insufficient_privilege then null;
  end;
  update public.clients set theme_preference = theme_preference,
    last_checkin_at = last_checkin_at
  where id = 'd4b20a0d-d1de-4b91-83ca-6acfd4f6d82d';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Client self-service update failed'; end if;
end;
$test$;

set local request.jwt.claim.sub = '133f93d0-2399-4542-bc57-db4de8b98d79';
do $test$
declare affected integer;
begin
  update public.clients set active = active, coach_notes = coach_notes
  where id = 'd4b20a0d-d1de-4b91-83ca-6acfd4f6d82d';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Coach management update failed'; end if;
end;
$test$;
reset role;
select true as client_identity_guard_checks_passed;
rollback;
