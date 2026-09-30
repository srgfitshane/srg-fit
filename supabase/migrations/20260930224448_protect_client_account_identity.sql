-- RLS limits rows, not columns. Keep client check-in/theme writes while
-- preventing reassignment, billing impersonation, or self-reactivation.
create or replace function public.protect_client_account_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.profile_id is distinct from old.profile_id
    or new.coach_id is distinct from old.coach_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.subscription_id is distinct from old.subscription_id then
    raise exception 'Client identity fields require trusted server access' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and id = old.coach_id and role = 'coach'
  ) and (
    to_jsonb(new) - array['theme_preference', 'last_checkin_at', 'last_active_at', 'onboarding_completed', 'onboarding_completed_at']
    is distinct from
    to_jsonb(old) - array['theme_preference', 'last_checkin_at', 'last_active_at', 'onboarding_completed', 'onboarding_completed_at']
  ) then
    raise exception 'Client coaching fields require coach or server access' using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.protect_client_account_identity() from public, anon, authenticated;
create trigger protect_client_account_identity
before update on public.clients
for each row execute function public.protect_client_account_identity();

-- Possessing an auth ID does not make a user a coach.
drop policy "Coach can do everything with clients" on public.clients;
create policy "Coach can do everything with clients" on public.clients
for all to authenticated
using (coach_id = (select auth.uid()) and exists (
  select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'
))
with check (coach_id = (select auth.uid()) and exists (
  select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'
));

revoke truncate, references, trigger on public.clients from anon, authenticated;
