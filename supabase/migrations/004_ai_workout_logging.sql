-- ============================================
-- SRG Fit Migration 004: AI Insights + Workout Logging
-- Run this in Supabase SQL Editor
-- ============================================

-- AI INSIGHTS TABLE
create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references profiles(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  type text not null,
  title text,
  content jsonb not null default '{}',
  source_data jsonb default '{}',
  priority text default 'normal',
  read boolean default false,
  actioned boolean default false,
  action_taken text,
  created_at timestamptz default now()
);

-- WORKOUT SESSIONS
create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  program_id uuid references programs(id) on delete set null,
  block_id uuid references workout_blocks(id) on delete set null,
  coach_id uuid references profiles(id) on delete set null,
  date date not null default current_date,
  status text default 'in_progress',
  duration_minutes int,
  overall_rpe int,
  energy_level int,
  notes text,
  coach_notes text,
  location text,
  ai_analyzed boolean default false,
  ai_flags jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- EXERCISE LOGS
create table if not exists exercise_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references workout_sessions(id) on delete cascade,
  block_exercise_id uuid references block_exercises(id) on delete set null,
  exercise_id uuid references exercises(id) on delete set null,
  set_number int not null,
  reps_performed int,
  weight_used numeric(8,2),
  weight_unit text default 'lbs',
  rpe_actual numeric(4,1),
  completed boolean default true,
  skipped boolean default false,
  skip_reason text,
  swap_exercise_id uuid references exercises(id) on delete set null,
  swap_reason text,
  notes text,
  vs_programmed jsonb default '{}',
  created_at timestamptz default now()
);

-- PROGRESSION SNAPSHOTS
create table if not exists progression_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  week_start date not null,
  avg_weight numeric(8,2),
  max_weight numeric(8,2),
  total_volume numeric(10,2),
  avg_rpe numeric(4,1),
  sessions_performed int default 0,
  sets_completed int default 0,
  trend text,
  weight_change_pct numeric(6,2),
  volume_change_pct numeric(6,2),
  created_at timestamptz default now(),
  unique(client_id, exercise_id, week_start)
);

-- RLS
alter table ai_insights enable row level security;
alter table workout_sessions enable row level security;
alter table exercise_logs enable row level security;
alter table progression_snapshots enable row level security;

create policy "Coach can manage own ai insights" on ai_insights for all using (coach_id = auth.uid());
create policy "Coach can manage client sessions" on workout_sessions for all using (coach_id = auth.uid());
create policy "Client can manage own sessions" on workout_sessions for all using (client_id in (select id from clients where profile_id = auth.uid()));
create policy "Coach can manage exercise logs" on exercise_logs for all using (session_id in (select id from workout_sessions where coach_id = auth.uid()));
create policy "Client can manage own exercise logs" on exercise_logs for all using (session_id in (select id from workout_sessions where client_id in (select id from clients where profile_id = auth.uid())));
create policy "Coach can view client progression" on progression_snapshots for all using (client_id in (select id from clients where coach_id = auth.uid()));
create policy "Client can view own progression" on progression_snapshots for select using (client_id in (select id from clients where profile_id = auth.uid()));

-- Indexes
create index if not exists idx_ai_insights_coach_unread on ai_insights(coach_id, read) where read = false;
create index if not exists idx_ai_insights_client on ai_insights(client_id, created_at desc);
create index if not exists idx_workout_sessions_client_date on workout_sessions(client_id, date desc);
create index if not exists idx_exercise_logs_session on exercise_logs(session_id);
create index if not exists idx_progression_client_exercise on progression_snapshots(client_id, exercise_id, week_start desc);

-- Catch-up columns (safe to re-run)
alter table programs add column if not exists is_template boolean default false;
alter table programs add column if not exists template_id uuid references programs(id) on delete set null;
alter table programs add column if not exists description text;
alter table programs add column if not exists goal text;
alter table programs add column if not exists duration_weeks int;
alter table exercises add column if not exists video_url text;
alter table exercises add column if not exists movement_pattern text;
alter table exercises add column if not exists swap_tags text[];
alter table workout_blocks add column if not exists group_types jsonb default '{}';
alter table block_exercises add column if not exists progression_note text;
