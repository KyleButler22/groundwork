-- Groundwork seed — movement library
-- Content data: authored once, read by every user, never written from the
-- client (see docs/schema.md conventions + RLS in 0009_rls.sql).
--
-- 8 movement patterns, 60 exercises, 52 progression edges. Every ladder
-- here is currently LINEAR (one exercise per level, one progression edge
-- to the next). The schema supports branching — see progression_edges and
-- docs/generator.md "choosing a branch" — but no ladder branches yet. Add
-- branches (e.g. a planche track vs a one-arm track after horizontal_push
-- level 4) as a follow-up once that content is designed; until then the
-- workout generator's branch-selection logic has nothing to branch on.
--
-- Run after all files in supabase/migrations/. Idempotency: none — this is
-- meant to run once against a fresh database. Re-running will violate the
-- unique constraints on every slug column, which is the correct behaviour
-- (better a loud error than silently duplicated content).

-- ── movement patterns ─────────────────────────────────────────────────────
insert into movement_patterns (slug, name, category, sort_order) values
  ('horizontal_push', 'Horizontal Push', 'push', 1),
  ('vertical_push',   'Vertical Push',   'push', 2),
  ('vertical_pull',   'Vertical Pull',   'pull', 3),
  ('horizontal_pull',  'Horizontal Pull', 'pull', 4),
  ('squat',           'Squat',           'legs', 5),
  ('hinge',           'Hinge',           'legs', 6),
  ('core',            'Core',            'core', 7),
  ('skill_handstand', 'Handstand',       'skill', 8);

-- ── equipment ──────────────────────────────────────────────────────────────
insert into equipment (slug, name) values
  ('pull_up_bar',     'Pull-up bar'),
  ('rings',           'Gymnastic rings'),
  ('parallettes',     'Parallettes'),
  ('resistance_band', 'Resistance band'),
  ('bench_or_chair',  'Sturdy bench or chair'),
  ('box_or_step',     'Box or step');

-- ── body regions (for injury gating — see docs/intake.md step 06) ─────────
insert into body_regions (slug, name) values
  ('wrist',      'Wrist'),
  ('shoulder',   'Shoulder'),
  ('elbow',      'Elbow'),
  ('lower_back', 'Lower back'),
  ('knee',       'Knee'),
  ('neck',       'Neck');

-- ── exercises: reps-based (metric_type = 'reps') ───────────────────────────
insert into exercises (slug, name, pattern_id, level, metric_type, rep_min, rep_max, is_unilateral, cues)
values
  -- horizontal_push (9 rungs)
  ('pushup_wall',    'Wall push-up',    (select id from movement_patterns where slug = 'horizontal_push'), 1.0, 'reps',  8, 15, false, 'Stand back far enough that your body forms a straight line at the bottom.'),
  ('pushup_incline', 'Incline push-up', (select id from movement_patterns where slug = 'horizontal_push'), 2.0, 'reps',  6, 12, false, 'Hands elevated on a bench or step. Keep hips in line with shoulders.'),
  ('pushup_knee',    'Knee push-up',    (select id from movement_patterns where slug = 'horizontal_push'), 3.0, 'reps',  6, 12, false, 'Hips stay in line with your knees and shoulders — no sagging.'),
  ('pushup_full',    'Push-up',         (select id from movement_patterns where slug = 'horizontal_push'), 4.0, 'reps',  6, 12, false, 'Chest to within a fist of the floor, elbows at roughly 45 degrees.'),
  ('pushup_diamond', 'Diamond push-up', (select id from movement_patterns where slug = 'horizontal_push'), 5.0, 'reps',  6, 12, false, 'Thumbs and index fingers touching. Elbows track back, not out.'),
  ('pushup_decline', 'Decline push-up', (select id from movement_patterns where slug = 'horizontal_push'), 6.0, 'reps',  6, 12, false, 'Feet elevated on a bench. Brace your core so the hips don''t drop.'),
  ('pushup_archer',  'Archer push-up',  (select id from movement_patterns where slug = 'horizontal_push'), 7.0, 'reps',  4,  8, true,  'Shift weight to one side, keep the other arm long and straight.'),
  ('pushup_pseudo_planche', 'Pseudo-planche push-up', (select id from movement_patterns where slug = 'horizontal_push'), 8.0, 'reps', 4, 8, false, 'Hands by your hips, lean forward until shoulders pass your fingertips.'),
  ('pushup_one_arm_progression', 'One-arm push-up progression', (select id from movement_patterns where slug = 'horizontal_push'), 9.0, 'reps', 3, 6, true, 'Feet wide for a tripod base. Lower under control, no twisting the torso.'),

  -- vertical_push (7 rungs — level 3 is the hold-type wall handstand, inserted below)
  ('pike_pushup_floor',    'Pike push-up',          (select id from movement_patterns where slug = 'vertical_push'), 1.0, 'reps', 6, 12, false, 'Hips high, walk feet toward hands until your torso is near vertical.'),
  ('pike_pushup_elevated', 'Elevated pike push-up', (select id from movement_patterns where slug = 'vertical_push'), 2.0, 'reps', 6, 12, false, 'Feet on a box — the more vertical your torso, the more shoulder-specific.'),
  ('hspu_wall_negative',   'Wall handstand push-up negative', (select id from movement_patterns where slug = 'vertical_push'), 4.0, 'reps', 3, 6, false, 'Kick up to the wall, lower for a slow 4-5 count, then step down and reset.'),
  ('hspu_wall_full',       'Wall handstand push-up', (select id from movement_patterns where slug = 'vertical_push'), 5.0, 'reps', 4, 8, false, 'Head to floor at the bottom, press back up without arching the lower back.'),
  ('hspu_wall_deficit',    'Deficit wall handstand push-up', (select id from movement_patterns where slug = 'vertical_push'), 6.0, 'reps', 4, 8, false, 'Hands on blocks or parallettes for extra range — go only as deep as control allows.'),
  ('hspu_freestanding_progression', 'Freestanding handstand push-up progression', (select id from movement_patterns where slug = 'vertical_push'), 7.0, 'reps', 2, 5, false, 'Away from the wall. Expect this to take a long time — balance is the limiter, not strength.'),

  -- vertical_pull (9 rungs — level 1 is the hold-type dead hang, inserted below)
  ('pullup_band_assisted', 'Band-assisted pull-up', (select id from movement_patterns where slug = 'vertical_pull'), 2.0, 'reps', 6, 12, false, 'Band under a knee or foot. Pull elbows down and back, chin clears the bar.'),
  ('pullup_negative',      'Negative pull-up',      (select id from movement_patterns where slug = 'vertical_pull'), 3.0, 'reps', 4,  8, false, 'Jump or step to the top, then lower for a slow 4-5 count.'),
  ('pullup_full',          'Pull-up',               (select id from movement_patterns where slug = 'vertical_pull'), 4.0, 'reps', 4, 10, false, 'Full hang at the bottom, chin clears the bar at the top, no kipping.'),
  ('chinup',                'Chin-up',                (select id from movement_patterns where slug = 'vertical_pull'), 5.0, 'reps', 6, 12, false, 'Underhand grip. A useful variation once strict pull-ups are solid.'),
  ('pullup_archer',        'Archer pull-up',        (select id from movement_patterns where slug = 'vertical_pull'), 6.0, 'reps', 3,  6, true,  'Pull toward one hand, the other arm stays long along the bar.'),
  ('pullup_l_sit',         'L-sit pull-up',         (select id from movement_patterns where slug = 'vertical_pull'), 7.0, 'reps', 4,  8, false, 'Hold an L-sit (legs straight, parallel to the floor) for every rep.'),
  ('pullup_weighted',      'Weighted pull-up',      (select id from movement_patterns where slug = 'vertical_pull'), 8.0, 'reps', 4,  8, false, 'Added load via a dip belt or weighted vest — see added_weight_kg on the log.'),
  ('pullup_one_arm_progression', 'One-arm pull-up progression', (select id from movement_patterns where slug = 'vertical_pull'), 9.0, 'reps', 2, 5, true, 'Band- or partner-assisted. The lowering (negative) phase is where progress happens.'),

  -- horizontal_pull (6 rungs)
  ('row_incline_standing',      'Standing incline row',       (select id from movement_patterns where slug = 'horizontal_pull'), 1.0, 'reps', 8, 15, false, 'Hold a sturdy table edge, walk feet forward to reduce the angle as you improve.'),
  ('row_inverted_high',         'Inverted row, high bar',     (select id from movement_patterns where slug = 'horizontal_pull'), 2.0, 'reps', 6, 12, false, 'Bar around waist height, body straight, pull chest to the bar.'),
  ('row_inverted_low',          'Inverted row, low bar',      (select id from movement_patterns where slug = 'horizontal_pull'), 3.0, 'reps', 6, 12, false, 'Lower bar height increases the load — keep the body rigid, no hip sag.'),
  ('row_inverted_feet_elevated', 'Feet-elevated inverted row', (select id from movement_patterns where slug = 'horizontal_pull'), 4.0, 'reps', 6, 12, false, 'Feet on a box. More horizontal body position means more load on the pull.'),
  ('row_archer',                'Archer row',                 (select id from movement_patterns where slug = 'horizontal_pull'), 5.0, 'reps', 4,  8, true,  'On rings — pull to one side, the other arm stays extended.'),
  ('row_one_arm_progression',   'One-arm row progression',    (select id from movement_patterns where slug = 'horizontal_pull'), 6.0, 'reps', 4,  8, true,  'On rings, feet together for a harder anti-rotation demand.'),

  -- squat (7 rungs)
  ('squat_box',             'Box squat',              (select id from movement_patterns where slug = 'squat'), 1.0, 'reps',  8, 15, false, 'Sit back to the box under control, don''t drop onto it. Stand tall each rep.'),
  ('squat_bodyweight',      'Bodyweight squat',       (select id from movement_patterns where slug = 'squat'), 2.0, 'reps', 10, 20, false, 'Knees track over toes, thighs at least parallel to the floor.'),
  ('squat_split',           'Split squat',            (select id from movement_patterns where slug = 'squat'), 3.0, 'reps',  8, 15, true,  'Rear foot flat or on the ball, front shin roughly vertical at the bottom.'),
  ('squat_bulgarian',       'Bulgarian split squat',  (select id from movement_patterns where slug = 'squat'), 4.0, 'reps',  8, 15, true,  'Rear foot elevated on a bench. Most of the work is in the front leg.'),
  ('squat_pistol_assisted', 'Assisted pistol squat',  (select id from movement_patterns where slug = 'squat'), 5.0, 'reps',  5, 10, true,  'Hold a doorframe or band for balance, focus on depth and control first.'),
  ('squat_pistol',          'Pistol squat',           (select id from movement_patterns where slug = 'squat'), 6.0, 'reps',  4,  8, true,  'Free leg stays straight and off the floor for the whole rep.'),
  ('squat_pistol_weighted', 'Weighted pistol squat',  (select id from movement_patterns where slug = 'squat'), 7.0, 'reps',  4,  8, true,  'Hold a light weight at the chest once bodyweight pistols are easy.'),

  -- hinge (6 rungs)
  ('glute_bridge',            'Glute bridge',             (select id from movement_patterns where slug = 'hinge'), 1.0, 'reps', 10, 20, false, 'Squeeze the glutes hard at the top, avoid arching through the lower back.'),
  ('glute_bridge_single_leg', 'Single-leg glute bridge',  (select id from movement_patterns where slug = 'hinge'), 2.0, 'reps',  8, 15, true,  'Hips stay level — don''t let the free-leg side drop.'),
  ('hip_thrust',              'Hip thrust',               (select id from movement_patterns where slug = 'hinge'), 3.0, 'reps',  8, 15, false, 'Shoulders on a bench, drive through the heels to full hip extension.'),
  ('rdl_single_leg',          'Single-leg RDL',           (select id from movement_patterns where slug = 'hinge'), 4.0, 'reps',  6, 12, true,  'Hinge at the hip, back flat, reach toward the floor as the free leg rises.'),
  ('nordic_curl_negative',    'Nordic curl negative',     (select id from movement_patterns where slug = 'hinge'), 5.0, 'reps',  4,  8, false, 'Ankles anchored, lower as slowly as you can control, hands ready to catch you.'),
  ('nordic_curl_full',        'Nordic curl',              (select id from movement_patterns where slug = 'hinge'), 6.0, 'reps',  3,  6, false, 'Pull yourself back up from the bottom using the hamstrings — very advanced.'),

  -- core: reps-based rungs
  ('dead_bug',              'Dead bug',              (select id from movement_patterns where slug = 'core'), 1.0, 'reps', 8, 15, false, 'Lower back stays pressed into the floor the entire time.'),
  ('hanging_knee_raise',    'Hanging knee raise',    (select id from movement_patterns where slug = 'core'), 6.0, 'reps', 6, 12, false, 'Hang from a bar, raise knees toward the chest without swinging.'),
  ('hanging_leg_raise',     'Hanging leg raise',     (select id from movement_patterns where slug = 'core'), 7.0, 'reps', 6, 12, false, 'Legs straight, raise to at least parallel with control, lower slowly.'),
  ('dragon_flag_negative',  'Dragon flag negative',  (select id from movement_patterns where slug = 'core'), 9.0, 'reps', 3,  6, false, 'Hold a bench behind your head, lower your body as one straight, rigid line.'),

  -- skill_handstand: reps-based rung
  ('handstand_kickup_drill', 'Freestanding kick-up practice', (select id from movement_patterns where slug = 'skill_handstand'), 4.0, 'reps', 5, 10, false, 'Kick up toward a wall you don''t touch. Counted as attempts, not clean reps.');

-- ── exercises: hold-based (metric_type = 'time_seconds') ───────────────────
insert into exercises (slug, name, pattern_id, level, metric_type, hold_min_s, hold_max_s, is_unilateral, cues)
values
  ('handstand_hold_wall', 'Wall handstand hold', (select id from movement_patterns where slug = 'vertical_push'), 3.0, 'time_seconds', 20, 45, false, 'Chest or back to the wall. Push the floor away, ribs stacked over hips.'),
  ('dead_hang',           'Dead hang / scapular pull', (select id from movement_patterns where slug = 'vertical_pull'), 1.0, 'time_seconds', 15, 40, false, 'Full hang, then pull shoulder blades down and back without bending the elbows.'),
  ('plank_knee',          'Knee plank',           (select id from movement_patterns where slug = 'core'), 2.0, 'time_seconds', 20, 40, false, 'Knees down, forearms under shoulders, straight line from head to knees.'),
  ('plank_full',          'Plank',                (select id from movement_patterns where slug = 'core'), 3.0, 'time_seconds', 30, 75, false, 'Straight line head to heels. Squeeze glutes to stop the hips sagging.'),
  ('hollow_hold_bent',    'Hollow hold, bent knee', (select id from movement_patterns where slug = 'core'), 4.0, 'time_seconds', 20, 40, false, 'Lower back pressed to the floor, shoulders and knees lifted slightly.'),
  ('hollow_hold_full',    'Hollow hold',          (select id from movement_patterns where slug = 'core'), 5.0, 'time_seconds', 20, 45, false, 'Legs extended, arms overhead. Hold the shape, don''t let the back arch.'),
  ('l_sit',               'L-sit',                (select id from movement_patterns where slug = 'core'), 8.0, 'time_seconds', 10, 30, false, 'On parallettes or the floor, legs straight and parallel to the ground.'),
  ('handstand_wall_chest', 'Chest-to-wall handstand hold', (select id from movement_patterns where slug = 'skill_handstand'), 1.0, 'time_seconds', 20, 40, false, 'Walk feet up the wall to vertical. This builds the pressing shape safely.'),
  ('handstand_wall_back', 'Back-to-wall handstand hold', (select id from movement_patterns where slug = 'skill_handstand'), 2.0, 'time_seconds', 30, 60, false, 'Kick up with heels to the wall — closer to a real freestanding line than chest-to-wall.'),
  ('handstand_wall_one_hand_tap', 'Wall handstand, hand-tap drill', (select id from movement_patterns where slug = 'skill_handstand'), 3.0, 'time_seconds', 20, 40, false, 'Back to wall, briefly tap one hand off the floor and replace it. Builds balance.'),
  ('handstand_freestanding_hold', 'Freestanding handstand hold', (select id from movement_patterns where slug = 'skill_handstand'), 5.0, 'time_seconds', 5, 15, false, 'Away from the wall. Small finger and wrist adjustments do the balancing.'),
  ('handstand_freestanding_extended', 'Freestanding handstand hold, extended', (select id from movement_patterns where slug = 'skill_handstand'), 6.0, 'time_seconds', 15, 30, false, 'Same shape, longer hold — this is mostly a balance-endurance problem now.');

-- ── exercises: distance-based (metric_type = 'distance_m') ─────────────────
insert into exercises (slug, name, pattern_id, level, metric_type, distance_min_m, distance_max_m, is_unilateral, cues)
values
  ('handstand_walk', 'Handstand walk', (select id from movement_patterns where slug = 'skill_handstand'), 7.0, 'distance_m', 2.0, 6.0, false, 'Small steps, eyes on the floor a hand''s width in front of your fingertips.');

-- ── progression edges: one linear chain per pattern (52 edges) ─────────────
insert into progression_edges (from_exercise_id, to_exercise_id, kind) values
  -- horizontal_push
  ((select id from exercises where slug = 'pushup_wall'), (select id from exercises where slug = 'pushup_incline'), 'progression'),
  ((select id from exercises where slug = 'pushup_incline'), (select id from exercises where slug = 'pushup_knee'), 'progression'),
  ((select id from exercises where slug = 'pushup_knee'), (select id from exercises where slug = 'pushup_full'), 'progression'),
  ((select id from exercises where slug = 'pushup_full'), (select id from exercises where slug = 'pushup_diamond'), 'progression'),
  ((select id from exercises where slug = 'pushup_diamond'), (select id from exercises where slug = 'pushup_decline'), 'progression'),
  ((select id from exercises where slug = 'pushup_decline'), (select id from exercises where slug = 'pushup_archer'), 'progression'),
  ((select id from exercises where slug = 'pushup_archer'), (select id from exercises where slug = 'pushup_pseudo_planche'), 'progression'),
  ((select id from exercises where slug = 'pushup_pseudo_planche'), (select id from exercises where slug = 'pushup_one_arm_progression'), 'progression'),
  -- vertical_push
  ((select id from exercises where slug = 'pike_pushup_floor'), (select id from exercises where slug = 'pike_pushup_elevated'), 'progression'),
  ((select id from exercises where slug = 'pike_pushup_elevated'), (select id from exercises where slug = 'handstand_hold_wall'), 'progression'),
  ((select id from exercises where slug = 'handstand_hold_wall'), (select id from exercises where slug = 'hspu_wall_negative'), 'progression'),
  ((select id from exercises where slug = 'hspu_wall_negative'), (select id from exercises where slug = 'hspu_wall_full'), 'progression'),
  ((select id from exercises where slug = 'hspu_wall_full'), (select id from exercises where slug = 'hspu_wall_deficit'), 'progression'),
  ((select id from exercises where slug = 'hspu_wall_deficit'), (select id from exercises where slug = 'hspu_freestanding_progression'), 'progression'),
  -- vertical_pull
  ((select id from exercises where slug = 'dead_hang'), (select id from exercises where slug = 'pullup_band_assisted'), 'progression'),
  ((select id from exercises where slug = 'pullup_band_assisted'), (select id from exercises where slug = 'pullup_negative'), 'progression'),
  ((select id from exercises where slug = 'pullup_negative'), (select id from exercises where slug = 'pullup_full'), 'progression'),
  ((select id from exercises where slug = 'pullup_full'), (select id from exercises where slug = 'chinup'), 'progression'),
  ((select id from exercises where slug = 'chinup'), (select id from exercises where slug = 'pullup_archer'), 'progression'),
  ((select id from exercises where slug = 'pullup_archer'), (select id from exercises where slug = 'pullup_l_sit'), 'progression'),
  ((select id from exercises where slug = 'pullup_l_sit'), (select id from exercises where slug = 'pullup_weighted'), 'progression'),
  ((select id from exercises where slug = 'pullup_weighted'), (select id from exercises where slug = 'pullup_one_arm_progression'), 'progression'),
  -- horizontal_pull
  ((select id from exercises where slug = 'row_incline_standing'), (select id from exercises where slug = 'row_inverted_high'), 'progression'),
  ((select id from exercises where slug = 'row_inverted_high'), (select id from exercises where slug = 'row_inverted_low'), 'progression'),
  ((select id from exercises where slug = 'row_inverted_low'), (select id from exercises where slug = 'row_inverted_feet_elevated'), 'progression'),
  ((select id from exercises where slug = 'row_inverted_feet_elevated'), (select id from exercises where slug = 'row_archer'), 'progression'),
  ((select id from exercises where slug = 'row_archer'), (select id from exercises where slug = 'row_one_arm_progression'), 'progression'),
  -- squat
  ((select id from exercises where slug = 'squat_box'), (select id from exercises where slug = 'squat_bodyweight'), 'progression'),
  ((select id from exercises where slug = 'squat_bodyweight'), (select id from exercises where slug = 'squat_split'), 'progression'),
  ((select id from exercises where slug = 'squat_split'), (select id from exercises where slug = 'squat_bulgarian'), 'progression'),
  ((select id from exercises where slug = 'squat_bulgarian'), (select id from exercises where slug = 'squat_pistol_assisted'), 'progression'),
  ((select id from exercises where slug = 'squat_pistol_assisted'), (select id from exercises where slug = 'squat_pistol'), 'progression'),
  ((select id from exercises where slug = 'squat_pistol'), (select id from exercises where slug = 'squat_pistol_weighted'), 'progression'),
  -- hinge
  ((select id from exercises where slug = 'glute_bridge'), (select id from exercises where slug = 'glute_bridge_single_leg'), 'progression'),
  ((select id from exercises where slug = 'glute_bridge_single_leg'), (select id from exercises where slug = 'hip_thrust'), 'progression'),
  ((select id from exercises where slug = 'hip_thrust'), (select id from exercises where slug = 'rdl_single_leg'), 'progression'),
  ((select id from exercises where slug = 'rdl_single_leg'), (select id from exercises where slug = 'nordic_curl_negative'), 'progression'),
  ((select id from exercises where slug = 'nordic_curl_negative'), (select id from exercises where slug = 'nordic_curl_full'), 'progression'),
  -- core
  ((select id from exercises where slug = 'dead_bug'), (select id from exercises where slug = 'plank_knee'), 'progression'),
  ((select id from exercises where slug = 'plank_knee'), (select id from exercises where slug = 'plank_full'), 'progression'),
  ((select id from exercises where slug = 'plank_full'), (select id from exercises where slug = 'hollow_hold_bent'), 'progression'),
  ((select id from exercises where slug = 'hollow_hold_bent'), (select id from exercises where slug = 'hollow_hold_full'), 'progression'),
  ((select id from exercises where slug = 'hollow_hold_full'), (select id from exercises where slug = 'hanging_knee_raise'), 'progression'),
  ((select id from exercises where slug = 'hanging_knee_raise'), (select id from exercises where slug = 'hanging_leg_raise'), 'progression'),
  ((select id from exercises where slug = 'hanging_leg_raise'), (select id from exercises where slug = 'l_sit'), 'progression'),
  ((select id from exercises where slug = 'l_sit'), (select id from exercises where slug = 'dragon_flag_negative'), 'progression'),
  -- skill_handstand
  ((select id from exercises where slug = 'handstand_wall_chest'), (select id from exercises where slug = 'handstand_wall_back'), 'progression'),
  ((select id from exercises where slug = 'handstand_wall_back'), (select id from exercises where slug = 'handstand_wall_one_hand_tap'), 'progression'),
  ((select id from exercises where slug = 'handstand_wall_one_hand_tap'), (select id from exercises where slug = 'handstand_kickup_drill'), 'progression'),
  ((select id from exercises where slug = 'handstand_kickup_drill'), (select id from exercises where slug = 'handstand_freestanding_hold'), 'progression'),
  ((select id from exercises where slug = 'handstand_freestanding_hold'), (select id from exercises where slug = 'handstand_freestanding_extended'), 'progression'),
  ((select id from exercises where slug = 'handstand_freestanding_extended'), (select id from exercises where slug = 'handstand_walk'), 'progression');

-- ── exercise equipment requirements ─────────────────────────────────────────
-- Default alternative_group 0 means "all listed rows are required". A
-- shared non-zero group means "any one of this group satisfies the slot".
insert into exercise_equipment (exercise_id, equipment_id, alternative_group) values
  ((select id from exercises where slug = 'pushup_incline'), (select id from equipment where slug = 'bench_or_chair'), 0),
  ((select id from exercises where slug = 'pushup_decline'), (select id from equipment where slug = 'bench_or_chair'), 0),
  ((select id from exercises where slug = 'pushup_pseudo_planche'), (select id from equipment where slug = 'parallettes'), 1),
  ((select id from exercises where slug = 'pushup_pseudo_planche'), (select id from equipment where slug = 'rings'), 1),
  ((select id from exercises where slug = 'pike_pushup_elevated'), (select id from equipment where slug = 'box_or_step'), 0),

  ((select id from exercises where slug = 'dead_hang'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_band_assisted'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_band_assisted'), (select id from equipment where slug = 'resistance_band'), 0),
  ((select id from exercises where slug = 'pullup_negative'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_full'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'chinup'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_archer'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_l_sit'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_weighted'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_one_arm_progression'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'pullup_one_arm_progression'), (select id from equipment where slug = 'resistance_band'), 0),

  ((select id from exercises where slug = 'row_incline_standing'), (select id from equipment where slug = 'bench_or_chair'), 0),
  ((select id from exercises where slug = 'row_inverted_high'), (select id from equipment where slug = 'pull_up_bar'), 1),
  ((select id from exercises where slug = 'row_inverted_high'), (select id from equipment where slug = 'rings'), 1),
  ((select id from exercises where slug = 'row_inverted_high'), (select id from equipment where slug = 'bench_or_chair'), 1),
  ((select id from exercises where slug = 'row_inverted_low'), (select id from equipment where slug = 'pull_up_bar'), 1),
  ((select id from exercises where slug = 'row_inverted_low'), (select id from equipment where slug = 'rings'), 1),
  ((select id from exercises where slug = 'row_inverted_low'), (select id from equipment where slug = 'bench_or_chair'), 1),
  ((select id from exercises where slug = 'row_inverted_feet_elevated'), (select id from equipment where slug = 'pull_up_bar'), 1),
  ((select id from exercises where slug = 'row_inverted_feet_elevated'), (select id from equipment where slug = 'rings'), 1),
  ((select id from exercises where slug = 'row_inverted_feet_elevated'), (select id from equipment where slug = 'bench_or_chair'), 1),
  ((select id from exercises where slug = 'row_archer'), (select id from equipment where slug = 'rings'), 0),
  ((select id from exercises where slug = 'row_one_arm_progression'), (select id from equipment where slug = 'rings'), 0),

  ((select id from exercises where slug = 'squat_box'), (select id from equipment where slug = 'box_or_step'), 0),
  ((select id from exercises where slug = 'squat_bulgarian'), (select id from equipment where slug = 'bench_or_chair'), 0),

  ((select id from exercises where slug = 'hip_thrust'), (select id from equipment where slug = 'bench_or_chair'), 0),

  ((select id from exercises where slug = 'hanging_knee_raise'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'hanging_leg_raise'), (select id from equipment where slug = 'pull_up_bar'), 0),
  ((select id from exercises where slug = 'l_sit'), (select id from equipment where slug = 'parallettes'), 1),
  ((select id from exercises where slug = 'l_sit'), (select id from equipment where slug = 'pull_up_bar'), 1),
  ((select id from exercises where slug = 'dragon_flag_negative'), (select id from equipment where slug = 'bench_or_chair'), 0);

-- ── exercise contraindications ──────────────────────────────────────────────
-- Hard-excluded from selection for a flagged region — never just a warning.
-- See docs/generator.md "selectExercise" and docs/intake.md safety gates.
insert into exercise_contraindications (exercise_id, region_id, severity) values
  -- wrist: everything loading a hyperextended wrist under bodyweight
  ((select id from exercises where slug = 'pushup_knee'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pushup_full'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pushup_diamond'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pushup_decline'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pushup_archer'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pushup_pseudo_planche'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pushup_one_arm_progression'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pike_pushup_floor'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'pike_pushup_elevated'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_hold_wall'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'hspu_wall_negative'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'hspu_wall_full'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'hspu_wall_deficit'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'hspu_freestanding_progression'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_wall_chest'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_wall_back'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_wall_one_hand_tap'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_kickup_drill'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_freestanding_hold'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_freestanding_extended'), (select id from body_regions where slug = 'wrist'), 'avoid'),
  ((select id from exercises where slug = 'handstand_walk'), (select id from body_regions where slug = 'wrist'), 'avoid'),

  -- shoulder: advanced overhead pressing and heavily loaded pulling
  ((select id from exercises where slug = 'hspu_wall_deficit'), (select id from body_regions where slug = 'shoulder'), 'avoid'),
  ((select id from exercises where slug = 'hspu_freestanding_progression'), (select id from body_regions where slug = 'shoulder'), 'avoid'),
  ((select id from exercises where slug = 'hspu_wall_full'), (select id from body_regions where slug = 'shoulder'), 'caution'),
  ((select id from exercises where slug = 'pullup_weighted'), (select id from body_regions where slug = 'shoulder'), 'caution'),
  ((select id from exercises where slug = 'pushup_pseudo_planche'), (select id from body_regions where slug = 'shoulder'), 'caution'),

  -- elbow: locked-out extension under load, supinated hangs
  ((select id from exercises where slug = 'pushup_diamond'), (select id from body_regions where slug = 'elbow'), 'caution'),
  ((select id from exercises where slug = 'pushup_archer'), (select id from body_regions where slug = 'elbow'), 'caution'),
  ((select id from exercises where slug = 'pushup_one_arm_progression'), (select id from body_regions where slug = 'elbow'), 'caution'),
  ((select id from exercises where slug = 'chinup'), (select id from body_regions where slug = 'elbow'), 'caution'),

  -- lower_back: spinal loading under fatigue
  ((select id from exercises where slug = 'nordic_curl_full'), (select id from body_regions where slug = 'lower_back'), 'caution'),
  ((select id from exercises where slug = 'dragon_flag_negative'), (select id from body_regions where slug = 'lower_back'), 'caution'),
  ((select id from exercises where slug = 'squat_pistol_weighted'), (select id from body_regions where slug = 'lower_back'), 'caution'),

  -- knee: deep unilateral flexion under full bodyweight
  ((select id from exercises where slug = 'squat_pistol_assisted'), (select id from body_regions where slug = 'knee'), 'caution'),
  ((select id from exercises where slug = 'squat_pistol'), (select id from body_regions where slug = 'knee'), 'caution'),
  ((select id from exercises where slug = 'squat_pistol_weighted'), (select id from body_regions where slug = 'knee'), 'caution'),
  ((select id from exercises where slug = 'squat_bulgarian'), (select id from body_regions where slug = 'knee'), 'caution');
