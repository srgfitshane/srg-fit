-- SRG Fit Program Templates Seed
-- Exercise IDs used:
-- SQ  31076278  Back Squat - Barbell
-- BP  e1a37ab5  Barbell Bench Press
-- DL  4e705f2f  Conventional Deadlift
-- RDL f2949a1c  Romanian Deadlift - Barbell
-- ROW 18bafc3d  Bent Over Row - Barbell
-- OHP 368ddbad  Standing Military Press - Barbell
-- IBB 7df3587d  Incline Bench Press - Barbell
-- IDB 951f96bc  Incline Dumbbell Bench Press
-- CU  9c8be6e1  Chin Up
-- LPD 685844bb  Lat Pulldown - Cable
-- SRC 4f075636  Seated Row - Cable
-- GBS a0e1fa2c  Goblet Squat
-- GRL 70d83c07  Goblet Reverse Lunge - Dumbbell
-- DBP 40048d16  Dumbbell Bench Press
-- BHT 3e3ea2ca  Bodyweight Hip Thrust
-- PLK 22d74e49  Plank Shoulder Taps
-- TDP 35a85813  Triceps Dip
-- PNR 8d261271  Pendlay Row - Barbell
-- FSQ 168e22f1  Front Squat - Barbell
-- RLD a00d289d  Rear Lunge - Dumbbell

DO $$
DECLARE
  coach uuid := '133f93d0-2399-4542-bc57-db4de8b98d79';
  -- Program IDs
  p_ss   uuid := gen_random_uuid();
  p_5x5  uuid := gen_random_uuid();
  p_gzcl uuid := gen_random_uuid();
  p_3dfb uuid := gen_random_uuid();
  -- SS blocks (Workout A and B per week, 4 weeks = 8 blocks)
  ss_w1a uuid:=gen_random_uuid(); ss_w1b uuid:=gen_random_uuid();
  ss_w2a uuid:=gen_random_uuid(); ss_w2b uuid:=gen_random_uuid();
  ss_w3a uuid:=gen_random_uuid(); ss_w3b uuid:=gen_random_uuid();
  ss_w4a uuid:=gen_random_uuid(); ss_w4b uuid:=gen_random_uuid();
  -- 5x5 blocks
  fx_w1a uuid:=gen_random_uuid(); fx_w1b uuid:=gen_random_uuid();
  fx_w2a uuid:=gen_random_uuid(); fx_w2b uuid:=gen_random_uuid();
  fx_w3a uuid:=gen_random_uuid(); fx_w3b uuid:=gen_random_uuid();
  fx_w4a uuid:=gen_random_uuid(); fx_w4b uuid:=gen_random_uuid();
  -- GZCL blocks (4 days/week)
  gz_w1d1 uuid:=gen_random_uuid(); gz_w1d2 uuid:=gen_random_uuid();
  gz_w1d3 uuid:=gen_random_uuid(); gz_w1d4 uuid:=gen_random_uuid();
  gz_w2d1 uuid:=gen_random_uuid(); gz_w2d2 uuid:=gen_random_uuid();
  gz_w2d3 uuid:=gen_random_uuid(); gz_w2d4 uuid:=gen_random_uuid();
  gz_w3d1 uuid:=gen_random_uuid(); gz_w3d2 uuid:=gen_random_uuid();
  gz_w3d3 uuid:=gen_random_uuid(); gz_w3d4 uuid:=gen_random_uuid();
  gz_w4d1 uuid:=gen_random_uuid(); gz_w4d2 uuid:=gen_random_uuid();
  gz_w4d3 uuid:=gen_random_uuid(); gz_w4d4 uuid:=gen_random_uuid();
  -- 3-Day Full Body blocks
  fb_w1d1 uuid:=gen_random_uuid(); fb_w1d2 uuid:=gen_random_uuid(); fb_w1d3 uuid:=gen_random_uuid();
  fb_w2d1 uuid:=gen_random_uuid(); fb_w2d2 uuid:=gen_random_uuid(); fb_w2d3 uuid:=gen_random_uuid();
  fb_w3d1 uuid:=gen_random_uuid(); fb_w3d2 uuid:=gen_random_uuid(); fb_w3d3 uuid:=gen_random_uuid();
  fb_w4d1 uuid:=gen_random_uuid(); fb_w4d2 uuid:=gen_random_uuid(); fb_w4d3 uuid:=gen_random_uuid();
BEGIN
-- PROGRAMS
INSERT INTO programs (id,coach_id,client_id,name,description,is_template,difficulty,duration_weeks,goal,program_type_tags,active) VALUES
  (p_ss,  coach,null,'Starting Strength',
   'Mark Rippetoe''s classic novice barbell program. 3 days/week alternating Workout A (Squat/Bench/Deadlift) and B (Squat/Press/Row). Add weight every session — the simplest and most proven beginner strength program.',
   true,'Beginner',4,'Build Strength',ARRAY['strength','barbell','beginner'],false),
  (p_5x5, coach,null,'StrongLifts 5x5',
   '5 sets of 5 reps on the big barbell lifts. Workout A: Squat/Bench/Row. Workout B: Squat/OHP/Deadlift. 3 days/week alternating. Add weight each session. Simple, effective, proven.',
   true,'Beginner',4,'Build Strength',ARRAY['strength','barbell','beginner'],false),
  (p_gzcl,coach,null,'GZCL Method',
   'Cody Lefever''s tier-based program. T1: heavy low-rep main lifts. T2: moderate weight hypertrophy compounds. T3: high-rep accessories. 4 days/week upper/lower structure. Great intermediate strength builder.',
   true,'Intermediate',4,'Build Strength',ARRAY['strength','intermediate','upper-lower','powerlifting'],false),
  (p_3dfb,coach,null,'3-Day Full Body Beginner',
   'A well-rounded beginner program hitting every major muscle group 3x per week. Compound movements first, accessories second. Perfect first program for clients new to structured training.',
   true,'Beginner',4,'General Health & Fitness',ARRAY['full-body','beginner','general'],false);

-- ── STARTING STRENGTH BLOCKS ──────────────────────────────────────────
-- Pattern: W1=A/B, W2=B/A, W3=A/B, W4=B/A (Friday omitted — 2 sessions shown, coach schedules 3rd)
INSERT INTO workout_blocks (id,program_id,name,day_label,day_of_week,week_number,order_index,description,workout_type,estimated_duration_mins,difficulty,is_template) VALUES
  (ss_w1a,p_ss,'Workout A','Monday',   'Monday',   1,1,'Squat + Bench + Deadlift','strength',45,'Beginner',true),
  (ss_w1b,p_ss,'Workout B','Wednesday','Wednesday',1,2,'Squat + Press + Row','strength',45,'Beginner',true),
  (ss_w2a,p_ss,'Workout B','Monday',   'Monday',   2,1,'Squat + Press + Row','strength',45,'Beginner',true),
  (ss_w2b,p_ss,'Workout A','Wednesday','Wednesday',2,2,'Squat + Bench + Deadlift','strength',45,'Beginner',true),
  (ss_w3a,p_ss,'Workout A','Monday',   'Monday',   3,1,'Squat + Bench + Deadlift','strength',45,'Beginner',true),
  (ss_w3b,p_ss,'Workout B','Wednesday','Wednesday',3,2,'Squat + Press + Row','strength',45,'Beginner',true),
  (ss_w4a,p_ss,'Workout B','Monday',   'Monday',   4,1,'Squat + Press + Row','strength',45,'Beginner',true),
  (ss_w4b,p_ss,'Workout A','Wednesday','Wednesday',4,2,'Squat + Bench + Deadlift','strength',45,'Beginner',true);

-- SS Workout A: Squat 3x5 / Bench 3x5 / Deadlift 1x5
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (ss_w1a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Start light. Prioritize depth and bar position.',1,'Add 2.5kg each session'),
  (ss_w1a,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Full ROM. Bar touches chest each rep.',2,'Add 2.5kg each session'),
  (ss_w1a,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'One heavy work set. Drive the floor away.',3,'Add 5kg each session'),
  (ss_w2b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Heavier than last A session.',1,'Add 2.5kg each session'),
  (ss_w2b,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Controlled descent, explosive press.',2,'Add 2.5kg each session'),
  (ss_w2b,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'One heavy work set.',3,'Add 5kg each session'),
  (ss_w3a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Depth first, then load.',1,'Add 2.5kg each session'),
  (ss_w3a,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Keep the arch, retract scapula.',2,'Add 2.5kg each session'),
  (ss_w3a,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'One heavy work set.',3,'Add 5kg each session'),
  (ss_w4b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Week 4 — push the weight.',1,'Add 2.5kg each session'),
  (ss_w4b,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Bar over mid-foot at all times.',2,'Add 2.5kg each session'),
  (ss_w4b,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'One heavy work set.',3,'Add 5kg each session');

-- SS Workout B: Squat 3x5 / OHP 3x5 / Row 3x5
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (ss_w1b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Same squat, heavier than last session.',1,'Add 2.5kg each session'),
  (ss_w1b,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'Press from collar bone. Full lockout overhead.',2,'Add 2.5kg each session'),
  (ss_w1b,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Bar to lower chest. Stay horizontal.',3,'Add 2.5kg each session'),
  (ss_w2a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Progress from last session.',1,'Add 2.5kg each session'),
  (ss_w2a,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'Brace hard, vertical bar path.',2,'Add 2.5kg each session'),
  (ss_w2a,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Elbows back and up.',3,'Add 2.5kg each session'),
  (ss_w3b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Depth + load.',1,'Add 2.5kg each session'),
  (ss_w3b,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'No forward lean — keep it strict.',2,'Add 2.5kg each session'),
  (ss_w3b,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Pull elbows to ceiling.',3,'Add 2.5kg each session'),
  (ss_w4a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Final week — execute.',1,'Add 2.5kg each session'),
  (ss_w4a,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'Full lockout every rep.',2,'Add 2.5kg each session'),
  (ss_w4a,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Stay flat. Pull hard.',3,'Add 2.5kg each session');

-- ── STRONGLIFTS 5x5 BLOCKS ────────────────────────────────────────────
-- Workout A: Squat 5x5 / Bench 5x5 / Row 5x5
-- Workout B: Squat 5x5 / OHP 5x5 / Deadlift 1x5
INSERT INTO workout_blocks (id,program_id,name,day_label,day_of_week,week_number,order_index,description,workout_type,estimated_duration_mins,difficulty,is_template) VALUES
  (fx_w1a,p_5x5,'Workout A','Monday',   'Monday',   1,1,'Squat 5x5 / Bench 5x5 / Row 5x5','strength',55,'Beginner',true),
  (fx_w1b,p_5x5,'Workout B','Wednesday','Wednesday',1,2,'Squat 5x5 / OHP 5x5 / Deadlift 1x5','strength',55,'Beginner',true),
  (fx_w2a,p_5x5,'Workout B','Monday',   'Monday',   2,1,'Squat 5x5 / OHP 5x5 / Deadlift 1x5','strength',55,'Beginner',true),
  (fx_w2b,p_5x5,'Workout A','Wednesday','Wednesday',2,2,'Squat 5x5 / Bench 5x5 / Row 5x5','strength',55,'Beginner',true),
  (fx_w3a,p_5x5,'Workout A','Monday',   'Monday',   3,1,'Squat 5x5 / Bench 5x5 / Row 5x5','strength',55,'Beginner',true),
  (fx_w3b,p_5x5,'Workout B','Wednesday','Wednesday',3,2,'Squat 5x5 / OHP 5x5 / Deadlift 1x5','strength',55,'Beginner',true),
  (fx_w4a,p_5x5,'Workout B','Monday',   'Monday',   4,1,'Squat 5x5 / OHP 5x5 / Deadlift 1x5','strength',55,'Beginner',true),
  (fx_w4b,p_5x5,'Workout A','Wednesday','Wednesday',4,2,'Squat 5x5 / Bench 5x5 / Row 5x5','strength',55,'Beginner',true);

-- 5x5 Workout A
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (fx_w1a,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'5 sets across at same weight. Depth every rep.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w1a,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'5',180,'Controlled down, drive up. Touch and go.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w1a,'18bafc3d-1819-49f6-8741-f28eba800bc9',5,'5',180,'Pendlay-style: bar to floor between reps.',3,'Add 2.5kg when all 5x5 complete'),
  (fx_w2b,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'Heavier than last A. Same depth standard.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w2b,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'5',180,'5 work sets. Stay tight.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w2b,'18bafc3d-1819-49f6-8741-f28eba800bc9',5,'5',180,'Hip hinge. Bar close to body.',3,'Add 2.5kg when all 5x5 complete'),
  (fx_w3a,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'5 across. Push the weight.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w3a,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'5',180,'All 5 sets same weight.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w3a,'18bafc3d-1819-49f6-8741-f28eba800bc9',5,'5',180,'5 hard sets.',3,'Add 2.5kg when all 5x5 complete'),
  (fx_w4b,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'Week 4 — heaviest yet.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w4b,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'5',180,'Consistent depth and tempo.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w4b,'18bafc3d-1819-49f6-8741-f28eba800bc9',5,'5',180,'Drive elbows to ceiling.',3,'Add 2.5kg when all 5x5 complete');

-- 5x5 Workout B
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (fx_w1b,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'5 across. Same weight all sets.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w1b,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'5',180,'Strict press. No leg drive.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w1b,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'One max effort work set. Reset each rep.',3,'Add 5kg when successful'),
  (fx_w2a,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'Heavier than last B session.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w2a,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'5',180,'Full lockout, don''t short the top.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w2a,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'Deadlift: drive the floor away.',3,'Add 5kg when successful'),
  (fx_w3b,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'5 sets, 5 reps, same weight.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w3b,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'5',180,'Bar travels in straight line.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w3b,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'One heavy set.',3,'Add 5kg when successful'),
  (fx_w4a,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'5',180,'Final week. Max effort.',1,'Add 2.5kg when all 5x5 complete'),
  (fx_w4a,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'5',180,'Brace, press, lockout.',2,'Add 2.5kg when all 5x5 complete'),
  (fx_w4a,'4e705f2f-589b-4929-805a-99703a2da21d',1,'5',180,'Heaviest deadlift of the block.',3,'Add 5kg when successful');

-- ── GZCL METHOD BLOCKS ────────────────────────────────────────────────
-- Day 1: T1 Squat / T2 Press / T3 Accessories
-- Day 2: T1 Bench / T2 Row / T3 Accessories  
-- Day 3: T1 Deadlift / T2 Front Squat / T3 Accessories
-- Day 4: T1 OHP / T2 RDL / T3 Accessories
-- Progression: add weight weekly to T1, T2 varies, T3 add reps first
INSERT INTO workout_blocks (id,program_id,name,day_label,day_of_week,week_number,order_index,description,workout_type,estimated_duration_mins,difficulty,is_template) VALUES
  (gz_w1d1,p_gzcl,'Day 1 — Squat Focus',  'Monday',   'Monday',   1,1,'T1 Squat / T2 Incline Bench / T3 Lat Pulldown + Lunge','strength',65,'Intermediate',true),
  (gz_w1d2,p_gzcl,'Day 2 — Bench Focus',  'Tuesday',  'Tuesday',  1,2,'T1 Bench / T2 Row / T3 RDL + Tricep Dip','strength',65,'Intermediate',true),
  (gz_w1d3,p_gzcl,'Day 3 — Deadlift Focus','Thursday', 'Thursday', 1,3,'T1 Deadlift / T2 Front Squat / T3 Chin Up + Lunge','strength',65,'Intermediate',true),
  (gz_w1d4,p_gzcl,'Day 4 — Press Focus',  'Friday',   'Friday',   1,4,'T1 OHP / T2 RDL / T3 Seated Row + Goblet Squat','strength',65,'Intermediate',true),
  (gz_w2d1,p_gzcl,'Day 1 — Squat Focus',  'Monday',   'Monday',   2,1,'T1 Squat / T2 Incline Bench / T3 accessories','strength',65,'Intermediate',true),
  (gz_w2d2,p_gzcl,'Day 2 — Bench Focus',  'Tuesday',  'Tuesday',  2,2,'T1 Bench / T2 Row / T3 accessories','strength',65,'Intermediate',true),
  (gz_w2d3,p_gzcl,'Day 3 — Deadlift Focus','Thursday', 'Thursday', 2,3,'T1 Deadlift / T2 Front Squat / T3 accessories','strength',65,'Intermediate',true),
  (gz_w2d4,p_gzcl,'Day 4 — Press Focus',  'Friday',   'Friday',   2,4,'T1 OHP / T2 RDL / T3 accessories','strength',65,'Intermediate',true),
  (gz_w3d1,p_gzcl,'Day 1 — Squat Focus',  'Monday',   'Monday',   3,1,'T1 Squat / T2 Incline Bench / T3 accessories','strength',65,'Intermediate',true),
  (gz_w3d2,p_gzcl,'Day 2 — Bench Focus',  'Tuesday',  'Tuesday',  3,2,'T1 Bench / T2 Row / T3 accessories','strength',65,'Intermediate',true),
  (gz_w3d3,p_gzcl,'Day 3 — Deadlift Focus','Thursday', 'Thursday', 3,3,'T1 Deadlift / T2 Front Squat / T3 accessories','strength',65,'Intermediate',true),
  (gz_w3d4,p_gzcl,'Day 4 — Press Focus',  'Friday',   'Friday',   3,4,'T1 OHP / T2 RDL / T3 accessories','strength',65,'Intermediate',true),
  (gz_w4d1,p_gzcl,'Day 1 — Squat Focus',  'Monday',   'Monday',   4,1,'T1 Squat / T2 Incline Bench / T3 accessories','strength',65,'Intermediate',true),
  (gz_w4d2,p_gzcl,'Day 2 — Bench Focus',  'Tuesday',  'Tuesday',  4,2,'T1 Bench / T2 Row / T3 accessories','strength',65,'Intermediate',true),
  (gz_w4d3,p_gzcl,'Day 3 — Deadlift Focus','Thursday', 'Thursday', 4,3,'T1 Deadlift / T2 Front Squat / T3 accessories','strength',65,'Intermediate',true),
  (gz_w4d4,p_gzcl,'Day 4 — Press Focus',  'Friday',   'Friday',   4,4,'T1 OHP / T2 RDL / T3 accessories','strength',65,'Intermediate',true);

-- GZCL exercises — all 4 weeks use same structure, weight increases each week
-- Day 1: T1 Squat 5x3+ / T2 Incline Bench 4x8 / T3 Lat Pulldown 3x15 + Lunge 3x12
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (gz_w1d1,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'3',240,'T1: Heavy. Work up to top set of 3+. AMRAP the last set.',1,'Add 2.5-5kg each week'),
  (gz_w1d1,'7df3587d-2020-485e-99cc-bc879e00af25',4,'8',120,'T2: Moderate weight. Controlled tempo. RPE 7-8.',2,'Add 2.5kg when all reps complete'),
  (gz_w1d1,'685844bb-336f-4d7b-b197-410c183638cd',3,'15',60,'T3: High rep. Chase the pump. Short rest.',3,'Add reps before weight'),
  (gz_w1d1,'70d83c07-76d9-445d-a46e-0dfbfe17175a',3,'12',60,'T3: Control the knee. Drive through the heel.',4,'Add reps before weight'),
  (gz_w2d1,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'3',240,'T1: Heavier than week 1. AMRAP last set.',1,'Add 2.5-5kg each week'),
  (gz_w2d1,'7df3587d-2020-485e-99cc-bc879e00af25',4,'8',120,'T2: Add weight if week 1 felt easy.',2,'Add 2.5kg when all reps complete'),
  (gz_w2d1,'685844bb-336f-4d7b-b197-410c183638cd',3,'15',60,'T3: Full stretch at bottom.',3,'Add reps before weight'),
  (gz_w2d1,'70d83c07-76d9-445d-a46e-0dfbfe17175a',3,'12',60,'T3: Same weight or more reps.',4,'Add reps before weight'),
  (gz_w3d1,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'3',240,'T1: Week 3 — push hard on AMRAP.',1,'Add 2.5-5kg each week'),
  (gz_w3d1,'7df3587d-2020-485e-99cc-bc879e00af25',4,'8',120,'T2: RPE should be 8 now.',2,'Add 2.5kg when all reps complete'),
  (gz_w3d1,'685844bb-336f-4d7b-b197-410c183638cd',3,'15',60,'T3: Controlled. Feel the lats.',3,'Add reps before weight'),
  (gz_w3d1,'70d83c07-76d9-445d-a46e-0dfbfe17175a',3,'12',60,'T3: Step length stays consistent.',4,'Add reps before weight'),
  (gz_w4d1,'31076278-40d7-466d-aa94-0fd7342a0bd2',5,'3',240,'T1: Week 4 — heaviest squat. AMRAP for max.',1,'Add 2.5-5kg each week'),
  (gz_w4d1,'7df3587d-2020-485e-99cc-bc879e00af25',4,'8',120,'T2: Heaviest T2 of the block.',2,'Add 2.5kg when all reps complete'),
  (gz_w4d1,'685844bb-336f-4d7b-b197-410c183638cd',3,'15',60,'T3: Squeeze at the top.',3,'Add reps before weight'),
  (gz_w4d1,'70d83c07-76d9-445d-a46e-0dfbfe17175a',3,'12',60,'T3: Final week. Push the pace.',4,'Add reps before weight');

-- Day 2: T1 Bench 5x3+ / T2 Bent Over Row 4x8 / T3 RDL 3x12 + Tricep Dip 3x12
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (gz_w1d2,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'3',240,'T1: Work to heavy triple. AMRAP last set.',1,'Add 2.5kg each week'),
  (gz_w1d2,'18bafc3d-1819-49f6-8741-f28eba800bc9',4,'8',120,'T2: Chest to bar. Horizontal torso.',2,'Add 2.5kg when all reps complete'),
  (gz_w1d2,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'12',90,'T3: Feel the hamstrings load. Slow eccentric.',3,'Add reps before weight'),
  (gz_w1d2,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'12',60,'T3: Full ROM. Chest to bar level.',4,'Add reps before weight'),
  (gz_w2d2,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'3',240,'T1: Heavier than week 1.',1,'Add 2.5kg each week'),
  (gz_w2d2,'18bafc3d-1819-49f6-8741-f28eba800bc9',4,'8',120,'T2: Bar path stays straight.',2,'Add 2.5kg when all reps complete'),
  (gz_w2d2,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'12',90,'T3: Hips hinge back, not down.',3,'Add reps before weight'),
  (gz_w2d2,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'12',60,'T3: Lock out at top.',4,'Add reps before weight'),
  (gz_w3d2,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'3',240,'T1: AMRAP on final set.',1,'Add 2.5kg each week'),
  (gz_w3d2,'18bafc3d-1819-49f6-8741-f28eba800bc9',4,'8',120,'T2: Pull hard.',2,'Add 2.5kg when all reps complete'),
  (gz_w3d2,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'12',90,'T3: Squeeze glutes at top.',3,'Add reps before weight'),
  (gz_w3d2,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'12',60,'T3: Chest stays up.',4,'Add reps before weight'),
  (gz_w4d2,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',5,'3',240,'T1: Week 4 — max effort AMRAP.',1,'Add 2.5kg each week'),
  (gz_w4d2,'18bafc3d-1819-49f6-8741-f28eba800bc9',4,'8',120,'T2: Heaviest row of block.',2,'Add 2.5kg when all reps complete'),
  (gz_w4d2,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'12',90,'T3: Controlled stretch.',3,'Add reps before weight'),
  (gz_w4d2,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'12',60,'T3: Drive through full ROM.',4,'Add reps before weight');

-- Day 3: T1 Deadlift 5x3+ / T2 Front Squat 4x6 / T3 Chin Up 3x8 + Lunge 3x12
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (gz_w1d3,'4e705f2f-589b-4929-805a-99703a2da21d',5,'3',300,'T1: Heavy deadlift. Reset each rep. AMRAP last set.',1,'Add 5kg each week'),
  (gz_w1d3,'168e22f1-1c8e-4b68-8d93-086de34a28d5',4,'6',150,'T2: Front squat builds quad strength and position.',2,'Add 2.5kg when all reps complete'),
  (gz_w1d3,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'8',90,'T3: Full dead hang. Chest to bar.',3,'Add reps before weight'),
  (gz_w1d3,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'12',60,'T3: Step back. Front knee stays over toe.',4,'Add reps before weight'),
  (gz_w2d3,'4e705f2f-589b-4929-805a-99703a2da21d',5,'3',300,'T1: Heavier than week 1.',1,'Add 5kg each week'),
  (gz_w2d3,'168e22f1-1c8e-4b68-8d93-086de34a28d5',4,'6',150,'T2: Elbows up. Upright torso.',2,'Add 2.5kg when all reps complete'),
  (gz_w2d3,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'8',90,'T3: Control the descent.',3,'Add reps before weight'),
  (gz_w2d3,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'12',60,'T3: Drive through front heel.',4,'Add reps before weight'),
  (gz_w3d3,'4e705f2f-589b-4929-805a-99703a2da21d',5,'3',300,'T1: Push for AMRAP PR.',1,'Add 5kg each week'),
  (gz_w3d3,'168e22f1-1c8e-4b68-8d93-086de34a28d5',4,'6',150,'T2: Front squat: no buttwink.',2,'Add 2.5kg when all reps complete'),
  (gz_w3d3,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'8',90,'T3: Full extension at top.',3,'Add reps before weight'),
  (gz_w3d3,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'12',60,'T3: Consistent stride.',4,'Add reps before weight'),
  (gz_w4d3,'4e705f2f-589b-4929-805a-99703a2da21d',5,'3',300,'T1: Week 4 — max effort deadlift.',1,'Add 5kg each week'),
  (gz_w4d3,'168e22f1-1c8e-4b68-8d93-086de34a28d5',4,'6',150,'T2: Heaviest front squat of block.',2,'Add 2.5kg when all reps complete'),
  (gz_w4d3,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'8',90,'T3: Add weight if 8 feels easy.',3,'Add reps before weight'),
  (gz_w4d3,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'12',60,'T3: Final week. Controlled reps.',4,'Add reps before weight');

-- Day 4: T1 OHP 5x3+ / T2 RDL 4x8 / T3 Seated Row 3x15 + Goblet Squat 3x15
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (gz_w1d4,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'3',240,'T1: Strict press. No leg drive. AMRAP last set.',1,'Add 2.5kg each week'),
  (gz_w1d4,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',4,'8',120,'T2: Slow eccentric. Feel the hamstrings.',2,'Add 2.5kg when all reps complete'),
  (gz_w1d4,'4f075636-31e2-4538-a437-adccc16ae512',3,'15',60,'T3: Elbows drive back. Chest tall.',3,'Add reps before weight'),
  (gz_w1d4,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'15',60,'T3: Heels down. Elbows inside knees.',4,'Add reps before weight'),
  (gz_w2d4,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'3',240,'T1: Add weight. Push the AMRAP.',1,'Add 2.5kg each week'),
  (gz_w2d4,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',4,'8',120,'T2: Hip hinge. No rounding.',2,'Add 2.5kg when all reps complete'),
  (gz_w2d4,'4f075636-31e2-4538-a437-adccc16ae512',3,'15',60,'T3: Full ROM.',3,'Add reps before weight'),
  (gz_w2d4,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'15',60,'T3: Sit in the bottom.',4,'Add reps before weight'),
  (gz_w3d4,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'3',240,'T1: Brace hard. Drive up.',1,'Add 2.5kg each week'),
  (gz_w3d4,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',4,'8',120,'T2: Load the hamstrings well.',2,'Add 2.5kg when all reps complete'),
  (gz_w3d4,'4f075636-31e2-4538-a437-adccc16ae512',3,'15',60,'T3: Feel the mid back.',3,'Add reps before weight'),
  (gz_w3d4,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'15',60,'T3: Goblet squat: chest stays tall.',4,'Add reps before weight'),
  (gz_w4d4,'368ddbad-0684-4fd2-9d90-1296909b0f73',5,'3',240,'T1: Week 4 — max press. AMRAP PR attempt.',1,'Add 2.5kg each week'),
  (gz_w4d4,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',4,'8',120,'T2: Heaviest RDL of block.',2,'Add 2.5kg when all reps complete'),
  (gz_w4d4,'4f075636-31e2-4538-a437-adccc16ae512',3,'15',60,'T3: Controlled. Squeeze at finish.',3,'Add reps before weight'),
  (gz_w4d4,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'15',60,'T3: Final week. No grinding.',4,'Add reps before weight');

-- ── 3-DAY FULL BODY BEGINNER BLOCKS ──────────────────────────────────
-- Day A: Squat / DB Bench / Lat Pulldown / Hip Thrust / Plank
-- Day B: Goblet Squat / Incline DB Press / Seated Row / RDL / Tricep Dip
-- Day C: Deadlift / OHP / Chin Up / Lunge / Plank
-- Rotate Mon/Wed/Fri: W1=A/B/C, W2=C/A/B, W3=B/C/A, W4=A/B/C
INSERT INTO workout_blocks (id,program_id,name,day_label,day_of_week,week_number,order_index,description,workout_type,estimated_duration_mins,difficulty,is_template) VALUES
  (fb_w1d1,p_3dfb,'Day A','Monday',   'Monday',   1,1,'Squat / DB Bench / Lat Pulldown / Hip Thrust / Plank','strength',55,'Beginner',true),
  (fb_w1d2,p_3dfb,'Day B','Wednesday','Wednesday',1,2,'Goblet Squat / Incline Press / Seated Row / RDL / Dip','strength',55,'Beginner',true),
  (fb_w1d3,p_3dfb,'Day C','Friday',   'Friday',   1,3,'Deadlift / OHP / Chin Up / Lunge / Plank','strength',55,'Beginner',true),
  (fb_w2d1,p_3dfb,'Day C','Monday',   'Monday',   2,1,'Deadlift / OHP / Chin Up / Lunge / Plank','strength',55,'Beginner',true),
  (fb_w2d2,p_3dfb,'Day A','Wednesday','Wednesday',2,2,'Squat / DB Bench / Lat Pulldown / Hip Thrust / Plank','strength',55,'Beginner',true),
  (fb_w2d3,p_3dfb,'Day B','Friday',   'Friday',   2,3,'Goblet Squat / Incline Press / Seated Row / RDL / Dip','strength',55,'Beginner',true),
  (fb_w3d1,p_3dfb,'Day B','Monday',   'Monday',   3,1,'Goblet Squat / Incline Press / Seated Row / RDL / Dip','strength',55,'Beginner',true),
  (fb_w3d2,p_3dfb,'Day C','Wednesday','Wednesday',3,2,'Deadlift / OHP / Chin Up / Lunge / Plank','strength',55,'Beginner',true),
  (fb_w3d3,p_3dfb,'Day A','Friday',   'Friday',   3,3,'Squat / DB Bench / Lat Pulldown / Hip Thrust / Plank','strength',55,'Beginner',true),
  (fb_w4d1,p_3dfb,'Day A','Monday',   'Monday',   4,1,'Squat / DB Bench / Lat Pulldown / Hip Thrust / Plank','strength',55,'Beginner',true),
  (fb_w4d2,p_3dfb,'Day B','Wednesday','Wednesday',4,2,'Goblet Squat / Incline Press / Seated Row / RDL / Dip','strength',55,'Beginner',true),
  (fb_w4d3,p_3dfb,'Day C','Friday',   'Friday',   4,3,'Deadlift / OHP / Chin Up / Lunge / Plank','strength',55,'Beginner',true);

-- Day A exercises (weeks 1,2,3,4)
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  -- W1 Day A
  (fb_w1d1,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'8',120,'Focus on depth. Control the descent.',1,'Add 2.5kg when all reps complete'),
  (fb_w1d1,'40048d16-2ad5-47cc-b4a3-f2196cc1d089',3,'10',90,'Neutral grip. Full ROM. Touch chest.',2,'Add 2.5kg when all reps complete'),
  (fb_w1d1,'685844bb-336f-4d7b-b197-410c183638cd',3,'12',75,'Pull elbows down. Squeeze the lats.',3,'Add weight when 12 reps easy'),
  (fb_w1d1,'3e3ea2ca-7873-4a16-a85c-785854e5eeb5',3,'15',60,'Drive hips up. Squeeze glutes at top.',4,'Add reps, then add weight'),
  (fb_w1d1,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'30 sec',45,'Slow taps. Hips stay level.',5,'Increase time each week'),
  -- W2 Day A (same structure, note heavier)
  (fb_w2d2,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'8',120,'Week 2 — add weight.',1,'Add 2.5kg when all reps complete'),
  (fb_w2d2,'40048d16-2ad5-47cc-b4a3-f2196cc1d089',3,'10',90,'Control the negative.',2,'Add 2.5kg when all reps complete'),
  (fb_w2d2,'685844bb-336f-4d7b-b197-410c183638cd',3,'12',75,'Full stretch at bottom.',3,'Add weight when 12 reps easy'),
  (fb_w2d2,'3e3ea2ca-7873-4a16-a85c-785854e5eeb5',3,'15',60,'Squeeze and hold 1 sec at top.',4,'Add reps, then add weight'),
  (fb_w2d2,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'35 sec',45,'Increase time from last session.',5,'Increase time each week'),
  -- W3 Day A
  (fb_w3d3,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'8',120,'Heavier than week 2.',1,'Add 2.5kg when all reps complete'),
  (fb_w3d3,'40048d16-2ad5-47cc-b4a3-f2196cc1d089',3,'10',90,'Explode up, slow down.',2,'Add 2.5kg when all reps complete'),
  (fb_w3d3,'685844bb-336f-4d7b-b197-410c183638cd',3,'12',75,'Lat stretch at top.',3,'Add weight when 12 reps easy'),
  (fb_w3d3,'3e3ea2ca-7873-4a16-a85c-785854e5eeb5',3,'15',60,'Full hip extension.',4,'Add reps, then add weight'),
  (fb_w3d3,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'40 sec',45,'Push the plank duration.',5,'Increase time each week'),
  -- W4 Day A
  (fb_w4d1,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'8',120,'Week 4 — heaviest squat of block.',1,'Add 2.5kg when all reps complete'),
  (fb_w4d1,'40048d16-2ad5-47cc-b4a3-f2196cc1d089',3,'10',90,'All 3 sets same weight.',2,'Add 2.5kg when all reps complete'),
  (fb_w4d1,'685844bb-336f-4d7b-b197-410c183638cd',3,'12',75,'Add weight if last week was easy.',3,'Add weight when 12 reps easy'),
  (fb_w4d1,'3e3ea2ca-7873-4a16-a85c-785854e5eeb5',3,'15',60,'Drive hips through full range.',4,'Add reps, then add weight'),
  (fb_w4d1,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'45 sec',45,'45 seconds — hold it.',5,'Increase time each week');

-- Day B exercises (Goblet Squat / Incline DB Press / Seated Row / RDL / Dip)
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (fb_w1d2,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'12',90,'Heels down. Elbows chase knees.',1,'Add weight when 12 easy'),
  (fb_w1d2,'951f96bc-be65-4a32-a725-31b6c68e6857',3,'10',90,'15-30 degree incline. Neutral grip.',2,'Add 2.5kg when all reps complete'),
  (fb_w1d2,'4f075636-31e2-4538-a437-adccc16ae512',3,'12',75,'Elbows drive back. Tall chest.',3,'Add weight when 12 easy'),
  (fb_w1d2,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'10',90,'Hinge. Feel hamstrings load.',4,'Add 2.5kg when all reps complete'),
  (fb_w1d2,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'10',60,'Chest to bar level. Lock out at top.',5,'Add reps, then weight'),
  (fb_w2d3,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'12',90,'Add weight from week 1.',1,'Add weight when 12 easy'),
  (fb_w2d3,'951f96bc-be65-4a32-a725-31b6c68e6857',3,'10',90,'Full ROM. Touch chest.',2,'Add 2.5kg when all reps complete'),
  (fb_w2d3,'4f075636-31e2-4538-a437-adccc16ae512',3,'12',75,'Pull with elbows, not hands.',3,'Add weight when 12 easy'),
  (fb_w2d3,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'10',90,'Slow eccentric — 3 seconds down.',4,'Add 2.5kg when all reps complete'),
  (fb_w2d3,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'10',60,'Try to add a rep vs week 1.',5,'Add reps, then weight'),
  (fb_w3d1,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'12',90,'Heavier. Sit in the hole.',1,'Add weight when 12 easy'),
  (fb_w3d1,'951f96bc-be65-4a32-a725-31b6c68e6857',3,'10',90,'Control the negative.',2,'Add 2.5kg when all reps complete'),
  (fb_w3d1,'4f075636-31e2-4538-a437-adccc16ae512',3,'12',75,'Squeeze mid-back at finish.',3,'Add weight when 12 easy'),
  (fb_w3d1,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'10',90,'Neutral spine throughout.',4,'Add 2.5kg when all reps complete'),
  (fb_w3d1,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'10',60,'Week 3 — add weight if 10 feels light.',5,'Add reps, then weight'),
  (fb_w4d2,'a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28',3,'12',90,'Week 4 — heavy goblet.',1,'Add weight when 12 easy'),
  (fb_w4d2,'951f96bc-be65-4a32-a725-31b6c68e6857',3,'10',90,'Heaviest incline press of block.',2,'Add 2.5kg when all reps complete'),
  (fb_w4d2,'4f075636-31e2-4538-a437-adccc16ae512',3,'12',75,'Max weight for 12.',3,'Add weight when 12 easy'),
  (fb_w4d2,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',3,'10',90,'Heaviest RDL of block.',4,'Add 2.5kg when all reps complete'),
  (fb_w4d2,'35a85813-6c78-47b2-b433-16088bf68fd4',3,'10',60,'Add weight or reps.',5,'Add reps, then weight');

-- Day C exercises (Deadlift / OHP / Chin Up / Lunge / Plank)
INSERT INTO block_exercises (block_id,exercise_id,sets,reps,rest_seconds,notes,order_index,progression_note) VALUES
  (fb_w1d3,'4e705f2f-589b-4929-805a-99703a2da21d',3,'6',150,'Hip hinge. Bar drags up the leg.',1,'Add 5kg when all reps complete'),
  (fb_w1d3,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'8',120,'Strict. No momentum. Start light.',2,'Add 2.5kg when all reps complete'),
  (fb_w1d3,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'6',90,'Dead hang start. Chest to bar.',3,'Add reps each week'),
  (fb_w1d3,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'10',75,'Step back. Front knee tracks toe.',4,'Add weight when 10 easy'),
  (fb_w1d3,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'30 sec',45,'Slow taps. Stay square.',5,'Increase time each week'),
  (fb_w2d1,'4e705f2f-589b-4929-805a-99703a2da21d',3,'6',150,'Heavier than week 1.',1,'Add 5kg when all reps complete'),
  (fb_w2d1,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'8',120,'Brace. Vertical bar path.',2,'Add 2.5kg when all reps complete'),
  (fb_w2d1,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'6',90,'Try for 7 if 6 felt easy.',3,'Add reps each week'),
  (fb_w2d1,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'10',75,'Drive through front heel.',4,'Add weight when 10 easy'),
  (fb_w2d1,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'35 sec',45,'35 second hold.',5,'Increase time each week'),
  (fb_w3d2,'4e705f2f-589b-4929-805a-99703a2da21d',3,'6',150,'Add weight again.',1,'Add 5kg when all reps complete'),
  (fb_w3d2,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'8',120,'Lock out fully at top.',2,'Add 2.5kg when all reps complete'),
  (fb_w3d2,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'6',90,'Week 3 — push for 8.',3,'Add reps each week'),
  (fb_w3d2,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'10',75,'Add weight if last week felt easy.',4,'Add weight when 10 easy'),
  (fb_w3d2,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'40 sec',45,'40 seconds.',5,'Increase time each week'),
  (fb_w4d3,'4e705f2f-589b-4929-805a-99703a2da21d',3,'6',150,'Week 4 — heaviest deadlift.',1,'Add 5kg when all reps complete'),
  (fb_w4d3,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'8',120,'Heaviest press of block.',2,'Add 2.5kg when all reps complete'),
  (fb_w4d3,'9c8be6e1-b8ed-447d-9da3-148dea67f6ae',3,'6',90,'Max reps. Go for broke.',3,'Add reps each week'),
  (fb_w4d3,'a00d289d-a4ff-46e9-958f-7e456d8975c7',3,'10',75,'Heaviest lunge of block.',4,'Add weight when 10 easy'),
  (fb_w4d3,'22d74e49-e28b-46d5-824c-9033f31ab5eb',3,'45 sec',45,'45 second plank — finish strong.',5,'Increase time each week');

END $$;
