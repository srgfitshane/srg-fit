-- Read-only regression checks; impersonated claims never persist.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"133f93d0-2399-4542-bc57-db4de8b98d79","role":"authenticated"}';

do $$
declare
  first_page jsonb := public.get_coach_exercise_library();
  second_page jsonb := public.get_coach_exercise_library(p_offset => 25);
  q text;
  muscle text;
  pattern text;
  video text;
  detail text;
  actual jsonb;
  expected integer;
  params jsonb;
begin
  if jsonb_array_length(first_page->'items') <> least(25, (first_page->>'total')::integer)
    or (first_page->>'total')::integer <> (select count(*) from public.exercises)
    or first_page->'stats' <> second_page->'stats' then
    raise exception 'Page bounds, count or global stats failed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(first_page->'items') a
    join jsonb_array_elements(second_page->'items') b on a->>'id' = b->>'id'
  ) or first_page->'items' <> public.get_coach_exercise_library()->'items' then
    raise exception 'Pages overlap or ordering is unstable';
  end if;
  if first_page->'stats' <> (
    select jsonb_build_object('total', count(*),
      'withVideo', count(*) filter (where video_url is not null and video_url <> ''),
      'withMuscles', count(*) filter (where cardinality(muscles) > 0),
      'withPattern', count(*) filter (where movement_pattern is not null and movement_pattern <> ''),
      'withCues', count(*) filter (where cues is not null and cues <> ''))
    from public.exercises
  ) then raise exception 'Library stats mismatch'; end if;

  foreach q in array array['', 'quad', 'BACK', '%', '_', 'no-such-exercise-qa-76a921'] loop
    foreach video in array array['all', 'has', 'missing'] loop
      foreach detail in array array['all', 'missing'] loop
        actual := public.get_coach_exercise_library(p_search => q, p_video => video, p_detail => detail);
        select count(*) into expected from public.exercises e
        where (q = '' or position(lower(q) in lower(coalesce(e.name, ''))) > 0
          or position(lower(q) in lower(coalesce(array_to_string(e.muscles, ' ', ''), ''))) > 0)
          and (video = 'all' or (video = 'has' and coalesce(e.video_url, '') <> '')
            or (video = 'missing' and coalesce(e.video_url, '') = ''))
          and (detail = 'all' or coalesce(cardinality(e.muscles), 0) = 0
            or coalesce(e.movement_pattern, '') = '' or coalesce(e.description, '') = '');
        if (actual->>'total')::integer <> expected
          or jsonb_array_length(actual->'items') <> least(25, expected)
          or actual->'stats' <> first_page->'stats' then
          raise exception 'Search/video/detail mismatch';
        end if;
      end loop;
    end loop;
  end loop;
  foreach muscle in array array['all', 'Quads', 'Chest', 'Back'] loop
    foreach pattern in array array['all', 'squat', 'push', 'pull'] loop
      actual := public.get_coach_exercise_library(p_muscle => muscle, p_pattern => pattern);
      select count(*) into expected from public.exercises e
      where (muscle = 'all' or muscle = any(e.muscles) or e.equipment = muscle)
        and (pattern = 'all' or e.movement_pattern = pattern);
      if (actual->>'total')::integer <> expected then raise exception 'Muscle/pattern mismatch'; end if;
    end loop;
  end loop;
  if jsonb_array_length(public.get_coach_exercise_library(p_offset => 2147483647)->'items') <> 0
    or jsonb_array_length(public.get_coach_exercise_library(p_limit => 50)->'items') > 50 then
    raise exception 'Offset/limit bounds failed';
  end if;
  foreach params in array array[
    '{"p_limit":0}', '{"p_limit":51}', '{"p_offset":-1}', '{"p_video":"invalid"}',
    '{"p_detail":"invalid"}', '{"p_limit":null}', '{"p_search":null}', '{"p_muscle":null}'
  ]::jsonb[] loop
    begin
      perform public.get_coach_exercise_library(
        p_search => case when params ? 'p_search' then params->>'p_search' else '' end,
        p_muscle => case when params ? 'p_muscle' then params->>'p_muscle' else 'all' end,
        p_video => coalesce(params->>'p_video', 'all'),
        p_detail => coalesce(params->>'p_detail', 'all'),
        p_offset => coalesce((params->>'p_offset')::integer, 0),
        p_limit => case when params ? 'p_limit' then (params->>'p_limit')::integer else 25 end
      );
      raise exception 'Invalid input accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
end;
$$;

set local request.jwt.claims = '{"sub":"aba0fe07-3690-460b-a35a-cb4e33d3665d","role":"authenticated"}';
do $$ begin
  begin
    perform public.get_coach_exercise_library();
    raise exception 'Client gained coach library access';
  exception when insufficient_privilege then null;
  end;
end; $$;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  begin
    perform public.get_coach_exercise_library();
    raise exception 'Anonymous gained coach library access';
  exception when insufficient_privilege then null;
  end;
end; $$;
select 'exercise library: paging, 52 filter combinations, stats, validation and role checks passed' as result;
rollback;
