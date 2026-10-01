-- Keep reactions inside the conversation/community that the caller can read.
-- Referenced table SELECT policies remain the source of truth; no RLS bypass.
alter policy "Users can add/remove own reactions" on public.message_reactions
  to authenticated
  using (user_id = (select auth.uid()) and message_id in (select id from public.messages))
  with check (user_id = (select auth.uid()) and message_id in (select id from public.messages));

alter policy "Users can view reactions on their messages" on public.message_reactions
  to authenticated
  using (message_id in (select id from public.messages));

alter policy "all_manage_own_reactions" on public.community_reactions
  to authenticated
  using (user_id = (select auth.uid()) and post_id in (select id from public.community_posts))
  with check (user_id = (select auth.uid()) and post_id in (select id from public.community_posts));

-- All three already have authenticated SELECT policies and enabled RLS.
-- Existing subscription handlers otherwise never receive their changes.
alter publication supabase_realtime add table
  public.community_posts, public.community_replies, public.community_reactions;
