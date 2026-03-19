-- ============================================
-- SRG Fit Migration 007: daily_checkins habit columns
-- Adds sleep, steps, and water tracking to daily_checkins
-- so coach can see trends alongside mood/stress/energy.
-- Run in Supabase SQL Editor
-- ============================================

alter table daily_checkins
  add column if not exists sleep_hours  numeric(4,1),
  add column if not exists steps        int,
  add column if not exists water_oz     int;

-- Optional: index for coach trend queries per client over time
create index if not exists idx_daily_checkins_coach_trend
  on daily_checkins (client_id, checkin_date desc);

comment on column daily_checkins.sleep_hours is 'Hours of sleep logged via Sleep habit';
comment on column daily_checkins.steps       is 'Daily steps logged via Steps habit';
comment on column daily_checkins.water_oz    is 'Water intake in oz logged via Water habit';
