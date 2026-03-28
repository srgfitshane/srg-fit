-- Production readiness: coach AI triage, invite management, and workout swap/skip metadata

alter table if exists ai_insights
  add column if not exists generated_at timestamptz default now(),
  add column if not exists is_saved boolean default false,
  add column if not exists is_dismissed boolean default false,
  add column if not exists is_reviewed boolean default false,
  add column if not exists reviewed_at timestamptz,
  add column if not exists snoozed_until timestamptz,
  add column if not exists acted_on_at timestamptz,
  add column if not exists action_status text default 'unread',
  add column if not exists confidence text default 'medium',
  add column if not exists severity text default 'normal',
  add column if not exists category text default 'adherence',
  add column if not exists evidence jsonb default '[]'::jsonb,
  add column if not exists recommendation jsonb default '{}'::jsonb,
  add column if not exists follow_up jsonb default '{}'::jsonb;

update ai_insights
set
  generated_at = coalesce(generated_at, created_at, now()),
  is_saved = coalesce(is_saved, false),
  is_dismissed = coalesce(is_dismissed, false),
  is_reviewed = coalesce(is_reviewed, actioned, false),
  action_status = coalesce(action_status, case when read then 'read' else 'unread' end),
  confidence = coalesce(confidence, 'medium'),
  severity = coalesce(severity, case when priority in ('urgent', 'high') then priority else 'normal' end),
  category = coalesce(category, 'adherence')
where true;

create index if not exists idx_ai_insights_coach_status on ai_insights(coach_id, action_status, generated_at desc);
create index if not exists idx_ai_insights_triage on ai_insights(coach_id, category, severity, generated_at desc);

create table if not exists client_invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  email text not null,
  full_name text,
  message text,
  onboarding_form_id uuid,
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table if exists client_invites
  add column if not exists profile_id uuid references profiles(id) on delete set null,
  add column if not exists onboarding_form_id uuid,
  add column if not exists message text;

create unique index if not exists idx_client_invites_token on client_invites(token);
create index if not exists idx_client_invites_coach_status on client_invites(coach_id, status, created_at desc);

alter table if exists session_exercises
  add column if not exists original_exercise_id uuid references exercises(id) on delete set null,
  add column if not exists original_exercise_name text,
  add column if not exists swap_exercise_id uuid references exercises(id) on delete set null,
  add column if not exists swap_reason text,
  add column if not exists swap_note text,
  add column if not exists swapped_at timestamptz,
  add column if not exists skipped boolean default false,
  add column if not exists skip_reason text,
  add column if not exists skip_note text,
  add column if not exists skipped_at timestamptz;

create index if not exists idx_session_exercises_swap_skip on session_exercises(session_id, swapped_at, skipped_at);
