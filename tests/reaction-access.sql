-- Isolated synthetic rows only. ROLLBACK prevents messages, posts and realtime
-- events from being delivered; no notification functions or real content used.
begin;
insert into public.messages(id,sender_id,recipient_id,body,message_type) values
  ('00000000-0000-4000-8000-000000000201','133f93d0-2399-4542-bc57-db4de8b98d79','aba0fe07-3690-460b-a35a-cb4e33d3665d','Synthetic reaction probe','text'),
  ('00000000-0000-4000-8000-000000000202','133f93d0-2399-4542-bc57-db4de8b98d79','133f93d0-2399-4542-bc57-db4de8b98d79','Synthetic inaccessible message','text');
insert into public.community_posts(id,coach_id,author_id,author_role,body) values
  ('00000000-0000-4000-8000-000000000203','133f93d0-2399-4542-bc57-db4de8b98d79','133f93d0-2399-4542-bc57-db4de8b98d79','coach','Synthetic reaction probe'),
  ('00000000-0000-4000-8000-000000000204','aba0fe07-3690-460b-a35a-cb4e33d3665d','aba0fe07-3690-460b-a35a-cb4e33d3665d','client','Synthetic different community scope');
set local role authenticated;
set local request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';
insert into public.message_reactions(message_id,user_id,emoji) values
  ('00000000-0000-4000-8000-000000000201','133f93d0-2399-4542-bc57-db4de8b98d79','probe');
insert into public.community_reactions(post_id,user_id,emoji) values
  ('00000000-0000-4000-8000-000000000203','133f93d0-2399-4542-bc57-db4de8b98d79','probe');
do $$ begin
  if exists(select 1 from public.community_posts where id='00000000-0000-4000-8000-000000000204') then
    raise exception 'The inaccessible community probe is visible';
  end if;
  begin
    insert into public.community_reactions(post_id,user_id,emoji) values
      ('00000000-0000-4000-8000-000000000204','133f93d0-2399-4542-bc57-db4de8b98d79','probe');
    raise exception 'Could react to an inaccessible community post';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.community_reactions set post_id='00000000-0000-4000-8000-000000000204'
      where post_id='00000000-0000-4000-8000-000000000203' and user_id='133f93d0-2399-4542-bc57-db4de8b98d79';
    raise exception 'Could retarget a reaction to an inaccessible community';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claims = '{"sub":"aba0fe07-3690-460b-a35a-cb4e33d3665d","role":"authenticated"}';
insert into public.message_reactions(message_id,user_id,emoji) values
  ('00000000-0000-4000-8000-000000000201','aba0fe07-3690-460b-a35a-cb4e33d3665d','probe');
insert into public.community_reactions(post_id,user_id,emoji) values
  ('00000000-0000-4000-8000-000000000203','aba0fe07-3690-460b-a35a-cb4e33d3665d','probe');
do $$ declare affected integer; begin
  if (select count(*) from public.message_reactions where message_id='00000000-0000-4000-8000-000000000201')<>2
    or (select count(*) from public.community_reactions where post_id='00000000-0000-4000-8000-000000000203')<>2 then
    raise exception 'Client cannot read both participants reactions';
  end if;
  begin
    insert into public.message_reactions(message_id,user_id,emoji) values
      ('00000000-0000-4000-8000-000000000201','aba0fe07-3690-460b-a35a-cb4e33d3665d','probe');
    raise exception 'Duplicate reaction accepted';
  exception when unique_violation then null;
  end;
  if exists(select 1 from public.messages where id='00000000-0000-4000-8000-000000000202') then
    raise exception 'Client saw unrelated synthetic message';
  end if;
  begin
    insert into public.message_reactions(message_id,user_id,emoji) values
      ('00000000-0000-4000-8000-000000000202','aba0fe07-3690-460b-a35a-cb4e33d3665d','probe');
    raise exception 'Client could react to an unreadable message';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.message_reactions set message_id='00000000-0000-4000-8000-000000000202'
      where message_id='00000000-0000-4000-8000-000000000201' and user_id='aba0fe07-3690-460b-a35a-cb4e33d3665d';
    raise exception 'Client could retarget a reaction to an unreadable message';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.message_reactions(message_id,user_id,emoji) values
      ('00000000-0000-4000-8000-000000000201','133f93d0-2399-4542-bc57-db4de8b98d79','impersonated');
    raise exception 'Client could impersonate a coach reaction';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.community_reactions(post_id,user_id,emoji) values
      ('00000000-0000-4000-8000-000000000203','133f93d0-2399-4542-bc57-db4de8b98d79','impersonated');
    raise exception 'Client could impersonate a coach community reaction';
  exception when insufficient_privilege then null;
  end;
  delete from public.message_reactions where message_id='00000000-0000-4000-8000-000000000201' and user_id='133f93d0-2399-4542-bc57-db4de8b98d79';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Client removed coach message reaction'; end if;
  delete from public.community_reactions where post_id='00000000-0000-4000-8000-000000000203' and user_id='133f93d0-2399-4542-bc57-db4de8b98d79';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Client removed coach community reaction'; end if;
  delete from public.message_reactions where message_id='00000000-0000-4000-8000-000000000201' and user_id='aba0fe07-3690-460b-a35a-cb4e33d3665d';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Client could not remove own message reaction'; end if;
  delete from public.community_reactions where post_id='00000000-0000-4000-8000-000000000203' and user_id='aba0fe07-3690-460b-a35a-cb4e33d3665d';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Client could not remove own community reaction'; end if;
end $$;
set local request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';
do $$ declare affected integer; begin
  delete from public.message_reactions where message_id='00000000-0000-4000-8000-000000000201' and user_id='133f93d0-2399-4542-bc57-db4de8b98d79';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Coach could not remove own message reaction'; end if;
  delete from public.community_reactions where post_id='00000000-0000-4000-8000-000000000203' and user_id='133f93d0-2399-4542-bc57-db4de8b98d79';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Coach could not remove own community reaction'; end if;
end $$;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  begin
    insert into public.message_reactions(message_id,user_id,emoji) values
      ('00000000-0000-4000-8000-000000000201','133f93d0-2399-4542-bc57-db4de8b98d79','anon');
    raise exception 'Anonymous message reaction accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.community_reactions(post_id,user_id,emoji) values
      ('00000000-0000-4000-8000-000000000203','133f93d0-2399-4542-bc57-db4de8b98d79','anon');
    raise exception 'Anonymous community reaction accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
      and tablename in ('community_posts','community_replies','community_reactions','messages','message_reactions'))<>5 then
    raise exception 'A required messaging/community realtime table is missing';
  end if;
end $$;
select 'Reaction ownership, unreadable-target denial, impersonation denial, confirmed removal and realtime publication checks passed' as result;
rollback;
