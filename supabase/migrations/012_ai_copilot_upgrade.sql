-- AI copilot hardening: align schema with current runtime, add provenance,
-- coach-assist outputs, feedback hooks, and dedupe support.

alter table if exists ai_insights
  alter column confidence drop default;

alter table if exists ai_insights
  alter column confidence type numeric(4,3)
  using (
    case
      when confidence is null then 0.500
      when confidence in ('low', 'Low') then 0.300
      when confidence in ('medium', 'Medium', 'normal', 'Normal') then 0.550
      when confidence in ('high', 'High') then 0.800
      when confidence ~ '^[0-9]+(\.[0-9]+)?$' then least(greatest(confidence::numeric, 0), 1)
      else 0.500
    end
  );

alter table if exists ai_insights
  alter column confidence set default 0.500,
  add column if not exists source_refs jsonb default '{}'::jsonb,
  add column if not exists coach_draft jsonb default '{}'::jsonb,
  add column if not exists generation_meta jsonb default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists surfaced_at timestamptz default now(),
  add column if not exists surfaced_count integer default 1,
  add column if not exists coach_feedback text,
  add column if not exists feedback_note text;

update ai_insights
set
  source_refs = coalesce(source_refs, '{}'::jsonb),
  coach_draft = coalesce(coach_draft, '{}'::jsonb),
  generation_meta = coalesce(generation_meta, '{}'::jsonb),
  surfaced_at = coalesce(surfaced_at, generated_at, created_at, now()),
  surfaced_count = coalesce(surfaced_count, 1),
  dedupe_key = coalesce(
    dedupe_key,
    concat_ws(':', coach_id::text, client_id::text, coalesce(category, 'uncategorized'), coalesce(severity, 'normal'))
  );

create index if not exists idx_ai_insights_dedupe_key
  on ai_insights(dedupe_key, generated_at desc);

create index if not exists idx_ai_insights_feedback
  on ai_insights(coach_id, coach_feedback, generated_at desc);
