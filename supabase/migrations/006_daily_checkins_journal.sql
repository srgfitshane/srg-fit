-- ============================================
-- SRG Fit Migration 006: Daily Check-ins + Journal
-- Run in Supabase SQL Editor
-- ============================================

-- ── DAILY CHECK-INS ─────────────────────────────────────────────────────────
-- Stores the 3-slider mental health snapshot from the Home tab.
-- One row per client per day (upsert on conflict).

create table if not exists daily_checkins (
  id             uuid        primary key default gen_random_uuid(),
  client_id      uuid        not null references clients(id) on delete cascade,
  checkin_date   date        not null default current_date,
  stress_score   int         check (stress_score between 1 and 10),
  mood_score     int         check (mood_score between 1 and 10),
  energy_score   int         check (energy_score between 1 and 10),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (client_id, checkin_date)
);

-- ── JOURNAL ENTRIES ──────────────────────────────────────────────────────────
-- One entry per client per day. is_private controls coach visibility.

create table if not exists journal_entries (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references clients(id) on delete cascade,
  entry_date   date        not null default current_date,
  body         text        not null,
  is_private   boolean     not null default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (client_id, entry_date)
);

-- ── UPDATED_AT TRIGGERS ──────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_checkins_updated_at on daily_checkins;
create trigger daily_checkins_updated_at
  before update on daily_checkins
  for each row execute function set_updated_at();

drop trigger if exists journal_entries_updated_at on journal_entries;
create trigger journal_entries_updated_at
  before update on journal_entries
  for each row execute function set_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table daily_checkins  enable row level security;
alter table journal_entries enable row level security;

-- Daily check-ins: client owns their own rows; coach can read all their clients
create policy "Client can manage own daily checkins"
  on daily_checkins for all
  using (client_id in (
    select id from clients where profile_id = auth.uid()
  ));

create policy "Coach can read client daily checkins"
  on daily_checkins for select
  using (client_id in (
    select id from clients where coach_id = auth.uid()
  ));

-- Journal: client owns their own rows
create policy "Client can manage own journal"
  on journal_entries for all
  using (client_id in (
    select id from clients where profile_id = auth.uid()
  ));

-- Coach can only read entries the client has explicitly made visible
create policy "Coach can read non-private journal entries"
  on journal_entries for select
  using (
    is_private = false
    and client_id in (
      select id from clients where coach_id = auth.uid()
    )
  );

-- ── INDEXES ──────────────────────────────────────────────────────────────────

create index if not exists idx_daily_checkins_client_date
  on daily_checkins (client_id, checkin_date desc);

create index if not exists idx_journal_entries_client_date
  on journal_entries (client_id, entry_date desc);

-- Coach aggregate view: only visible entries, sorted by date
create index if not exists idx_journal_visible_coach
  on journal_entries (client_id, is_private, entry_date desc)
  where is_private = false;
