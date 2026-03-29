create table if not exists client_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  coach_id uuid not null references profiles(id) on delete cascade,
  activity_date date not null default current_date,
  activity_type text not null,
  title text,
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  distance_value numeric(6,2) check (distance_value is null or distance_value >= 0),
  distance_unit text,
  intensity text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists client_activities_updated_at on client_activities;
create trigger client_activities_updated_at
  before update on client_activities
  for each row execute function set_updated_at();

alter table client_activities enable row level security;

drop policy if exists "Client can manage own activities" on client_activities;
create policy "Client can manage own activities"
  on client_activities for all
  using (
    client_id in (
      select id from clients where profile_id = auth.uid()
    )
  );

drop policy if exists "Coach can read client activities" on client_activities;
create policy "Coach can read client activities"
  on client_activities for select
  using (
    client_id in (
      select id from clients where coach_id = auth.uid()
    )
  );

create index if not exists idx_client_activities_client_date
  on client_activities (client_id, activity_date desc, created_at desc);

create index if not exists idx_client_activities_coach_date
  on client_activities (coach_id, activity_date desc, created_at desc);
