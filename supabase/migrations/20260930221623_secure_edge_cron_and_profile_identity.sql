-- Apply before deploying the guarded Edge Functions. Existing jobs keep their
-- schedules and active state; Vault supplies the credential only at run time.
do $migration$
begin
  if not exists (select 1 from vault.secrets where name = 'edge_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'edge_cron_secret',
      'Credential for SRG Fit scheduled Edge Function requests'
    );
  end if;
end;
$migration$;

create or replace function public.verify_edge_cron_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select candidate is not null
    and length(candidate) = 64
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'edge_cron_secret'
        and extensions.digest(decrypted_secret, 'sha256') = extensions.digest(candidate, 'sha256')
    );
$function$;

revoke all on function public.verify_edge_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_edge_cron_secret(text) to service_role;

do $migration$
declare
  target record;
  job_id bigint;
begin
  for target in select * from (values
    ('send-community-digest', 'send-community-digest'),
    ('send-daily-recap', 'send-daily-recap'),
    ('send-weekly-checkins', 'send-weekly-checkins'),
    ('weekly-digest-monday', 'send-weekly-digest'),
    ('check-program-endings', 'check-program-endings'),
    ('send-workout-reminders', 'send-workout-reminders')
  ) as jobs(job_name, function_name)
  loop
    select jobid into job_id from cron.job where jobname = target.job_name;
    if job_id is null then
      raise exception 'Expected scheduled job % is missing', target.job_name;
    end if;
    perform cron.alter_job(job_id, command := format($command$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $command$, 'https://bmlfoiohsehkntytadgo.supabase.co/functions/v1/' || target.function_name));
  end loop;
end;
$migration$;

-- A user can edit raw_user_meta_data. Signup must never derive privileges from it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'client');
  return new;
end;
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Keep normal self-service name/avatar editing. Identity and billing ownership
-- can only be changed by trusted server/database roles, regardless of RLS policy.
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
    and (
      new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.email is distinct from old.email
      or new.stripe_customer_id is distinct from old.stripe_customer_id
    ) then
    raise exception 'Profile identity fields require trusted server access' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.protect_profile_identity() from public, anon, authenticated;
drop trigger if exists protect_profile_identity on public.profiles;
create trigger protect_profile_identity
before update on public.profiles
for each row execute function public.protect_profile_identity();

-- TRUNCATE bypasses RLS; client roles never need it (or trigger creation).
revoke insert, delete, truncate, references, trigger on public.profiles from anon, authenticated;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
