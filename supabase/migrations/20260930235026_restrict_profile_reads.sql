-- Full account records belong to the account holder and their assigned coach.
-- Community names are projected separately by the authenticated server route.
-- Reuse the existing definer membership check to avoid profiles/clients RLS recursion.
alter policy profiles_select on public.profiles
  to authenticated
  using (id = (select auth.uid()) or public.is_my_client(id));
