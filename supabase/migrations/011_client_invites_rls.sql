alter table if exists client_invites enable row level security;

drop policy if exists "Coach can read own invites" on client_invites;
create policy "Coach can read own invites"
  on client_invites for select
  using (coach_id = auth.uid());

drop policy if exists "Coach can insert own invites" on client_invites;
create policy "Coach can insert own invites"
  on client_invites for insert
  with check (coach_id = auth.uid());

drop policy if exists "Coach can update own invites" on client_invites;
create policy "Coach can update own invites"
  on client_invites for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());
