-- Read-only coach library paging. Invoker security preserves exercise/profile RLS.
create or replace function public.get_coach_exercise_library(
  p_search text default '',
  p_muscle text default 'all',
  p_pattern text default 'all',
  p_video text default 'all',
  p_detail text default 'all',
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'coach'
  ) then
    raise exception 'Coach access required' using errcode = '42501';
  end if;

  if p_search is null or p_muscle is null or p_pattern is null
    or p_video is null or p_detail is null or p_offset is null or p_limit is null
    or p_offset < 0 or p_limit < 1 or p_limit > 50 or length(p_search) > 200
    or p_video not in ('all', 'has', 'missing') or p_detail not in ('all', 'missing') then
    raise exception 'Invalid exercise library filters or page' using errcode = '22023';
  end if;

  with library as materialized (
    select id, name, muscles, secondary_muscles, equipment, equipment_list,
      difficulty, movement_pattern, modifiers, is_timed, default_duration_seconds,
      tags, description, cues, video_url, video_url_female, image_url, thumbnail_url, coach_id
    from public.exercises
  ), matches as materialized (
    select * from library
    where (p_search = '' or strpos(lower(coalesce(name, '')), lower(p_search)) > 0
      or strpos(lower(coalesce(array_to_string(muscles, ' ', ''), '')), lower(p_search)) > 0)
      and (p_muscle = 'all' or p_muscle = any(muscles) or equipment = p_muscle)
      and (p_pattern = 'all' or movement_pattern = p_pattern)
      and (p_video = 'all'
        or (p_video = 'has' and coalesce(video_url, '') <> '')
        or (p_video = 'missing' and coalesce(video_url, '') = ''))
      and (p_detail = 'all' or cardinality(coalesce(muscles, '{}'::text[])) = 0
        or coalesce(movement_pattern, '') = '' or coalesce(description, '') = '')
  ), page as (
    select * from matches order by name, id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.name, p.id) from page p), '[]'::jsonb),
    'total', (select count(*) from matches),
    'stats', (select jsonb_build_object(
      'total', count(*),
      'withVideo', count(*) filter (where coalesce(video_url, '') <> ''),
      'withMuscles', count(*) filter (where cardinality(muscles) > 0),
      'withPattern', count(*) filter (where coalesce(movement_pattern, '') <> ''),
      'withCues', count(*) filter (where coalesce(cues, '') <> '')
    ) from library)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_coach_exercise_library(text, text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_coach_exercise_library(text, text, text, text, text, integer, integer)
  to authenticated;
