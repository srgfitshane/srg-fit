-- ============================================================
-- SRG FIT — Program Template Seeds
-- 4 programs: Starting Strength, 5x5, GZCL, 3-Day Full Body
-- Each: 4 weeks, blocks per workout day, exercises loaded
-- Coach ID: 133f93d0-2399-4542-bc57-db4de8b98d79
-- ============================================================

-- Exercise ID constants (aliases for readability in comments):
-- SQ  = 31076278-40d7-466d-aa94-0fd7342a0bd2  Back Squat - Barbell
-- BP  = e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1  Barbell Bench Press
-- RDL = f2949a1c-478b-4bb9-88d2-5bf729cb14f3  Romanian Deadlift - Barbell
-- SDL = 04b6e392-c6c8-4e29-a2b8-a089210d3ebc  Stiff Leg Deadlift - Barbell
-- ROW = 18bafc3d-1819-49f6-8741-f28eba800bc9  Bent Over Row - Barbell
-- OHP = 368ddbad-0684-4fd2-9d90-1296909b0f73  Standing Military Press - Barbell
-- CU  = 9c8be6e1-b8ed-447d-9da3-148dea67f6ae  Chin Up
-- LPD = 685844bb-336f-4d7b-b197-410c183638cd  Lat Pulldown - Cable
-- IBB = 7df3587d-2020-485e-99cc-bc879e00af25  Incline Bench Press - Barbell
-- DBP = 40048d16-2ad5-47cc-b4a3-f2196cc1d089  Dumbbell Bench Press
-- GBS = a0e1fa2c-154e-4ac6-b9d2-8248ff0bbd28  Goblet Squat
-- GRL = 70d83c07-76d9-445d-a46e-0dfbfe17175a  Goblet Reverse Lunge - Dumbbell
-- SRC = 4f075636-31e2-4538-a437-adccc16ae512  Seated Row - Cable
-- PLK = 22d74e49-e28b-46d5-824c-9033f31ab5eb  Plank Shoulder Taps
-- FSQ = 168e22f1-1c8e-4b68-8d93-086de34a28d5  Front Squat - Barbell
-- PNR = 8d261271-fbc4-4148-b05b-b0a45aeb6167  Pendlay Row - Barbell
-- IDB = 951f96bc-be65-4a32-a725-31b6c68e6857  Incline Dumbbell Bench Press
-- RLD = a00d289d-a4ff-46e9-958f-7e456d8975c7  Rear Lunge - Dumbbell
-- TDP = 35a85813-6c78-47b2-b433-16088bf68fd4  Triceps Dip
-- BHT = 3e3ea2ca-7873-4a16-a85c-785854e5eeb5  Bodyweight Hip Thrust
-- BDK = 413eaca3-0d06-4b87-aee0-c55e62472d21  Bench Dip - Knees Bent

DO $$
DECLARE
  coach uuid := '133f93d0-2399-4542-bc57-db4de8b98d79'::uuid;

  -- Program IDs
  p_ss   uuid := gen_random_uuid();
  p_5x5  uuid := gen_random_uuid();
  p_gzcl uuid := gen_random_uuid();
  p_3dfb uuid := gen_random_uuid();

  -- Block IDs — Starting Strength (A/B alternating x4 weeks = 8 blocks each)
  -- Week 1
  ss_w1a uuid := gen_random_uuid(); ss_w1b uuid := gen_random_uuid();
  -- Week 2
  ss_w2a uuid := gen_random_uuid(); ss_w2b uuid := gen_random_uuid();
  -- Week 3
  ss_w3a uuid := gen_random_uuid(); ss_w3b uuid := gen_random_uuid();
  -- Week 4
  ss_w4a uuid := gen_random_uuid(); ss_w4b uuid := gen_random_uuid();

  -- Block IDs — 5x5 (Workout A / B x4 weeks)
  fx_w1a uuid := gen_random_uuid(); fx_w1b uuid := gen_random_uuid();
  fx_w2a uuid := gen_random_uuid(); fx_w2b uuid := gen_random_uuid();
  fx_w3a uuid := gen_random_uuid(); fx_w3b uuid := gen_random_uuid();
  fx_w4a uuid := gen_random_uuid(); fx_w4b uuid := gen_random_uuid();

  -- Block IDs — GZCL (4 days/week T1/T2/T3 x4 weeks = 16 blocks)
  gz_w1d1 uuid:=gen_random_uuid(); gz_w1d2 uuid:=gen_random_uuid();
  gz_w1d3 uuid:=gen_random_uuid(); gz_w1d4 uuid:=gen_random_uuid();
  gz_w2d1 uuid:=gen_random_uuid(); gz_w2d2 uuid:=gen_random_uuid();
  gz_w2d3 uuid:=gen_random_uuid(); gz_w2d4 uuid:=gen_random_uuid();
  gz_w3d1 uuid:=gen_random_uuid(); gz_w3d2 uuid:=gen_random_uuid();
  gz_w3d3 uuid:=gen_random_uuid(); gz_w3d4 uuid:=gen_random_uuid();
  gz_w4d1 uuid:=gen_random_uuid(); gz_w4d2 uuid:=gen_random_uuid();
  gz_w4d3 uuid:=gen_random_uuid(); gz_w4d4 uuid:=gen_random_uuid();

  -- Block IDs — 3-Day Full Body (3 days x4 weeks = 12 blocks)
  fb_w1d1 uuid:=gen_random_uuid(); fb_w1d2 uuid:=gen_random_uuid(); fb_w1d3 uuid:=gen_random_uuid();
  fb_w2d1 uuid:=gen_random_uuid(); fb_w2d2 uuid:=gen_random_uuid(); fb_w2d3 uuid:=gen_random_uuid();
  fb_w3d1 uuid:=gen_random_uuid(); fb_w3d2 uuid:=gen_random_uuid(); fb_w3d3 uuid:=gen_random_uuid();
  fb_w4d1 uuid:=gen_random_uuid(); fb_w4d2 uuid:=gen_random_uuid(); fb_w4d3 uuid:=gen_random_uuid();

BEGIN

-- ============================================================
-- PROGRAMS
-- ============================================================
INSERT INTO programs (id, coach_id, client_id, name, description, is_template, difficulty, duration_weeks, goal, program_type_tags, active) VALUES
  (p_ss,   coach, null, 'Starting Strength',
   'The classic Mark Rippetoe novice program. Three days per week, alternating Workout A (Squat, Bench, Deadlift) and Workout B (Squat, Press, Row). Add weight every session.',
   true, 'Beginner', 4, 'Build Strength', ARRAY['strength','barbell','beginner'], false),

  (p_5x5,  coach, null, 'StrongLifts 5x5',
   'Five sets of five reps on the big compound lifts. Workout A: Squat, Bench, Row. Workout B: Squat, OHP, Deadlift. Linear progression — add 2.5kg each session.',
   true, 'Beginner', 4, 'Build Strength', ARRAY['strength','barbell','beginner'], false),

  (p_gzcl, coach, null, 'GZCL Method',
   'Tier-based training by Cody Lefever. T1: heavy low-rep competition lifts. T2: moderate weight hypertrophy work. T3: high-rep accessory. 4 days per week upper/lower split.',
   true, 'Intermediate', 4, 'Build Strength', ARRAY['strength','powerlifting','intermediate','upper-lower'], false),

  (p_3dfb, coach, null, '3-Day Full Body Beginner',
   'A well-rounded 3-day full body program for beginners. Hits every major muscle group each session with a mix of compound and accessory work. Perfect starting point.',
   true, 'Beginner', 4, 'General Health & Fitness', ARRAY['full-body','beginner','general'], false);


-- ============================================================
-- STARTING STRENGTH BLOCKS (A/B alternating, Mon/Wed/Fri)
-- Week 1: A(Mon) B(Wed) A(Fri)
-- Week 2: B(Mon) A(Wed) B(Fri)
-- Week 3: A(Mon) B(Wed) A(Fri)
-- Week 4: B(Mon) A(Wed) B(Fri)
-- ============================================================
INSERT INTO workout_blocks (id, program_id, name, day_label, day_of_week, week_number, order_index, description, workout_type, estimated_duration_mins, difficulty, is_template) VALUES
  -- Week 1
  (ss_w1a, p_ss, 'Workout A', 'Monday',    'Monday',    1, 1, 'Squat + Bench + Deadlift. Add weight each session.', 'strength', 45, 'Beginner', true),
  (ss_w1b, p_ss, 'Workout B', 'Wednesday',  'Wednesday', 1, 2, 'Squat + OHP + Row. Alternate with Workout A.', 'strength', 45, 'Beginner', true),
  -- Week 2 (B/A/B)
  (ss_w2a, p_ss, 'Workout B', 'Monday',    'Monday',    2, 1, 'Squat + OHP + Row.', 'strength', 45, 'Beginner', true),
  (ss_w2b, p_ss, 'Workout A', 'Wednesday',  'Wednesday', 2, 2, 'Squat + Bench + Deadlift.', 'strength', 45, 'Beginner', true),
  -- Week 3 (A/B/A)
  (ss_w3a, p_ss, 'Workout A', 'Monday',    'Monday',    3, 1, 'Squat + Bench + Deadlift.', 'strength', 45, 'Beginner', true),
  (ss_w3b, p_ss, 'Workout B', 'Wednesday',  'Wednesday', 3, 2, 'Squat + OHP + Row.', 'strength', 45, 'Beginner', true),
  -- Week 4 (B/A/B)
  (ss_w4a, p_ss, 'Workout B', 'Monday',    'Monday',    4, 1, 'Squat + OHP + Row.', 'strength', 45, 'Beginner', true),
  (ss_w4b, p_ss, 'Workout A', 'Wednesday',  'Wednesday', 4, 2, 'Squat + Bench + Deadlift.', 'strength', 45, 'Beginner', true);

-- Starting Strength Exercises
-- Workout A: Squat 3x5, Bench 3x5, RDL 1x5
INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, notes, order_index, progression_note) VALUES
  (ss_w1a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Start light. Focus on depth and bar position.', 1, 'Add 2.5kg each session'),
  (ss_w1a,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Tuck elbows slightly. Full ROM.', 2, 'Add 2.5kg each session'),
  (ss_w1a,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',1,'5',180,'Heavy single set. Push it.', 3, 'Add 5kg each session'),
  -- Workout A repeats for weeks 2,3,4
  (ss_w2b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Heavier than last week.', 1, 'Add 2.5kg each session'),
  (ss_w2b,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Drive chest up, stay tight.', 2, 'Add 2.5kg each session'),
  (ss_w2b,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',1,'5',180,'One heavy work set.', 3, 'Add 5kg each session'),
  (ss_w3a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Depth first, then load.', 1, 'Add 2.5kg each session'),
  (ss_w3a,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Control the descent.', 2, 'Add 2.5kg each session'),
  (ss_w3a,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',1,'5',180,'One heavy work set.', 3, 'Add 5kg each session'),
  (ss_w4b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Week 4 — push the weight.', 1, 'Add 2.5kg each session'),
  (ss_w4b,'e1a37ab5-3fd4-46a4-9b6c-2d9a66e969f1',3,'5',180,'Bar over mid-foot.', 2, 'Add 2.5kg each session'),
  (ss_w4b,'f2949a1c-478b-4bb9-88d2-5bf729cb14f3',1,'5',180,'One heavy work set.', 3, 'Add 5kg each session');

-- Workout B: Squat 3x5, OHP 3x5, Bent Over Row 3x5
INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, notes, order_index, progression_note) VALUES
  (ss_w1b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Same squat, different day.', 1, 'Add 2.5kg each session'),
  (ss_w1b,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'Press from shoulders. Lock out overhead.', 2, 'Add 2.5kg each session'),
  (ss_w1b,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Chest to bar. Controlled eccentric.', 3, 'Add 2.5kg each session'),
  (ss_w2a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Progress from last session.', 1, 'Add 2.5kg each session'),
  (ss_w2a,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'Brace hard. Drive the bar straight up.', 2, 'Add 2.5kg each session'),
  (ss_w2a,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Hinge hard at the hip.', 3, 'Add 2.5kg each session'),
  (ss_w3b,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Depth + load.', 1, 'Add 2.5kg each session'),
  (ss_w3b,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'Vertical bar path.', 2, 'Add 2.5kg each session'),
  (ss_w3b,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Pull elbows back and up.', 3, 'Add 2.5kg each session'),
  (ss_w4a,'31076278-40d7-466d-aa94-0fd7342a0bd2',3,'5',180,'Heaviest week — execute.', 1, 'Add 2.5kg each session'),
  (ss_w4a,'368ddbad-0684-4fd2-9d90-1296909b0f73',3,'5',180,'Full lockout each rep.', 2, 'Add 2.5kg each session'),
  (ss_w4a,'18bafc3d-1819-49f6-8741-f28eba800bc9',3,'5',180,'Stay horizontal.', 3, 'Add 2.5kg each session');

