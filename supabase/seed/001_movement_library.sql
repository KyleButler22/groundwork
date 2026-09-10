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
  ('squat_box',             'Assisted squat',         (select id from movement_patterns where slug = 'squat'), 1.0, 'reps',  8, 15, false, 'Sit back toward any low, stable surface — a step, a low wall, a sturdy chair. Stand tall each rep.'),
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
--
-- Every ladder's FLOOR rung is deliberately equipment-free EXCEPT
-- vertical_pull's (dead_hang needs a pull_up_bar). That's intentional, not
-- an oversight caught late: squatting toward some low surface and rowing
-- against some sturdy edge are both close enough to universal that they
-- aren't modelled as equipment at all (see squat_box / row_incline_standing
-- below — neither has an exercise_equipment row). Pulling against your own
-- bodyweight genuinely has no equivalent "use anything" floor — it needs an
-- elevated bar-like object to hang from. Recommending a cheap doorway
-- pull-up bar during equipment onboarding is the accepted resolution, the
-- same way real calisthenics programs are upfront about that one purchase
-- — not a gap to silently work around with fabricated, unvetted exercise
-- content. See docs/generator.md and the calisthenics-app memory.
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

-- ── how-to instructions ──────────────────────────────────────────────────
-- Labeled-step "how to do it" text for the exercise detail page (see
-- src/lib/exerciseHowTo.ts + src/views/ExerciseView.vue), shown alongside
-- the one-line `cues`. Newline-separated "Label: detail" lines, the last
-- always a cautionary "Common mistake:" line (parseMovementLibrarySeed's
-- assertSeedShape enforces both). No semicolons and no "--" in the text:
-- conservative hygiene — the parser and verify-sql.mjs both handle the
-- update block fine now, but these characters broke the positional-column
-- design this replaced, and verify-movement-graph.mjs still strips "--"
-- naively. Migration 0011_exercise_how_to.sql carries a byte-identical
-- copy of every statement below for the live DB; once 0011 has been
-- applied, a later how_to change ships as a NEW migration, not an edit
-- here + 0011. Ordered by exercise id (the seed's insert order): reps
-- rungs, then holds, then distance.
update exercises set how_to =
'Setup: Stand a bit more than arm''s length from a wall and put your hands flat on it at shoulder height, a little wider than your shoulders.
Movement: Keep a straight line from head to heels and bend your elbows to bring your chest toward the wall, then push back to the start.
Common mistake: Letting your hips sag toward the wall or your head poke forward instead of moving as one plank.'
where slug = 'pushup_wall';

update exercises set how_to =
'Setup: Put your hands on a sturdy waist-height surface — a countertop, a railing, the back of a heavy couch — a little wider than your shoulders, and walk your feet back so your body is one straight line.
Movement: Bend your elbows to bring your chest to the edge, then push back up. The higher the surface, the easier it is.
Common mistake: Letting your hips pike up or sag down instead of holding one line from head to heels.'
where slug = 'pushup_incline';

update exercises set how_to =
'Setup: Get into a push-up position, then drop your knees to the floor with your ankles crossed and lifted. Your body is a straight line from knees to head.
Movement: Lower your chest toward the floor with your elbows about 45 degrees from your ribs, then push back up.
Common mistake: Sitting your hips back toward your heels, which turns it into a stretch instead of a push.'
where slug = 'pushup_knee';

update exercises set how_to =
'Setup: Hands flat on the floor a little wider than your shoulders, body in a straight line from head to heels, weight on your toes.
Movement: Lower until your chest is about a fist''s height off the floor, elbows roughly 45 degrees from your ribs, then push back up.
Common mistake: Hips sagging toward the floor, or elbows flaring straight out to the sides.'
where slug = 'pushup_full';

update exercises set how_to =
'Setup: From a push-up position, slide your hands together under your chest so your thumbs and index fingers form a triangle.
Movement: Lower your chest to your hands with your elbows tracking back along your sides, then push back up. This shifts the work onto your triceps.
Common mistake: Letting your elbows flare out wide, which strains the shoulders and defeats the point.'
where slug = 'pushup_diamond';

update exercises set how_to =
'Setup: Push-up position with your feet up on a bench or step and your hands on the floor, body in one straight line.
Movement: Lower your chest toward the floor and push back up. The higher your feet, the more the work shifts to your shoulders and upper chest.
Common mistake: Your hips dropping so your lower back arches — brace your stomach to hold the line.'
where slug = 'pushup_decline';

update exercises set how_to =
'Setup: Push-up position with your hands much wider than your shoulders, body straight.
Movement: Bend one arm to lower toward that hand while the other arm stays straight and slides out along the floor. Push back to the middle, then repeat toward the other side.
Common mistake: The straight arm bending to help — keep it long so the working arm does the work.'
where slug = 'pushup_archer';

update exercises set how_to =
'Setup: Push-up position but with your hands beside your hips instead of your shoulders, fingers pointing out to the sides. Push the floor away so your upper back rounds slightly.
Movement: Lean forward until your shoulders are past your fingertips, then bend your elbows to lower, holding that forward lean the whole time.
Common mistake: Letting your hips pike up to escape the lean — the forward weight shift is the entire exercise.'
where slug = 'pushup_pseudo_planche';

update exercises set how_to =
'Setup: Push-up position with your feet spread wide for a stable base and one hand behind your back or resting lightly on a low block.
Movement: Lower under control on the single arm, keeping your hips and shoulders square to the floor, then push back up.
Common mistake: Twisting your torso toward the working arm — the wider your feet, the easier it is to stay square.'
where slug = 'pushup_one_arm_progression';

update exercises set how_to =
'Setup: From a push-up position, walk your feet in toward your hands and lift your hips high so your body makes an upside-down V, head between your arms.
Movement: Bend your elbows to lower the top of your head toward the floor just in front of your hands, then press back up.
Common mistake: Bending at the waist instead of the elbows, so your head drops straight down and nothing presses.'
where slug = 'pike_pushup_floor';

update exercises set how_to =
'Setup: Set up a pike push-up with your feet on a box or step, which lets you stack your hips higher over your shoulders.
Movement: Lower the top of your head toward the floor and press back up. The more vertical your torso, the more this works like a handstand push-up.
Common mistake: Your feet creeping forward off the box as you tire — reset your position between reps.'
where slug = 'pike_pushup_elevated';

update exercises set how_to =
'Setup: Kick up to a handstand with your back to the wall, hands a few inches out from it, arms straight.
Lower: Bend your elbows and lower for a slow 4-5 count until the top of your head lightly touches the floor.
At the bottom: Come out of it — step or roll down and reset for the next rep rather than pressing back up.
Common mistake: Dropping fast once your arms tire instead of fighting the whole way down.'
where slug = 'hspu_wall_negative';

update exercises set how_to =
'Setup: Kick up to a handstand with your back to the wall, hands a few inches out, arms straight, legs together.
Movement: Lower under control until the top of your head touches the floor, then press straight back up to locked arms.
Common mistake: Arching your lower back to drive the press — keep your ribs down and your body tall.'
where slug = 'hspu_wall_full';

update exercises set how_to =
'Setup: Kick up to a back-to-wall handstand with your hands on two low blocks or parallettes, so your head can pass below your hands.
Movement: Lower until your head is below the level of your hands, only as far as you can control, then press back up.
Common mistake: Going deeper than your strength allows and collapsing — add range a little at a time.'
where slug = 'hspu_wall_deficit';

update exercises set how_to =
'Setup: Kick up to a freestanding handstand in open space, or start against a wall and take your feet off once you feel balanced.
Movement: Once steady, bend your elbows a small amount and press back up, using your fingertips to hold the balance.
Common mistake: Expecting fast progress — balance, not strength, is the limiter here, so most of the work is holding position.'
where slug = 'hspu_freestanding_progression';

update exercises set how_to =
'Setup: Loop a resistance band over the bar and put one knee or foot in it. Hang with a grip a little wider than your shoulders, arms straight.
Movement: Pull your elbows down and back until your chin clears the bar, then lower all the way down. The band helps most at the bottom.
Common mistake: Letting the band fling you up so you skip the hardest part — pull with intent the whole way.'
where slug = 'pullup_band_assisted';

update exercises set how_to =
'Setup: Jump or step up so your chin starts above the bar, elbows bent, chest close to it.
Lower: Lower yourself as slowly as you can, aiming for a 4-5 count, until your arms are completely straight.
Common mistake: Dropping quickly near the bottom, which is exactly the range you are trying to build.'
where slug = 'pullup_negative';

update exercises set how_to =
'Setup: Hang from a bar with your hands a little wider than your shoulders, palms facing away, arms fully straight.
Movement: Pull your shoulder blades down, then drive your elbows toward your ribs until your chin clears the bar. Lower all the way back to a dead hang under control.
Common mistake: Kicking or swinging to get up, or stopping short of straight arms at the bottom.'
where slug = 'pullup_full';

update exercises set how_to =
'Setup: Hang from the bar with an underhand grip (palms toward you) about shoulder-width, arms straight.
Movement: Pull your elbows down to your sides until your chin clears the bar, then lower all the way back down. The underhand grip brings in more biceps.
Common mistake: Swinging your knees up for momentum instead of pulling with your back and arms.'
where slug = 'chinup';

update exercises set how_to =
'Setup: Hang from the bar with a wide overhand grip, arms straight.
Movement: Pull up toward one hand while the other arm stays straight and slides along the bar, bringing your chin over the working hand. Lower, then repeat toward the other side.
Common mistake: The straight arm bending to help — keep it long so one side does the work.'
where slug = 'pullup_archer';

update exercises set how_to =
'Setup: Hang from the bar and raise your straight legs in front of you until they are parallel to the floor, holding that L shape.
Movement: Keeping your legs up the whole time, pull until your chin clears the bar, then lower to straight arms.
Common mistake: Letting your legs drop as you pull — hold the L for every rep or it is just a pull-up.'
where slug = 'pullup_l_sit';

update exercises set how_to =
'Setup: Add load with a dip belt, a weighted vest, or a dumbbell held between your feet. Hang from an overhand grip, arms straight.
Movement: Do a strict pull-up — full hang to chin over the bar — with the added weight, then lower under control.
Common mistake: Cutting the range short at the top or bottom because of the load — drop the weight before you drop the standard.'
where slug = 'pullup_weighted';

update exercises set how_to =
'Setup: Grip the bar with one hand. Hold that wrist or forearm with your other hand, or grip a band hung from the bar, for as much help as you need.
Movement: Pull up as high as you can on the one arm, then lower as slowly as possible to a dead hang. The slow lowering is where the strength is built.
Common mistake: Chasing a full rep too early instead of putting the time into controlled negatives.'
where slug = 'pullup_one_arm_progression';

update exercises set how_to =
'Setup: Hold the edge of a sturdy table or a waist-height bar with both hands and walk your feet forward so you lean back on straight arms, body in one line.
Movement: Pull your chest toward your hands, squeezing your shoulder blades together, then lower back to straight arms. Walk your feet further forward to make it harder.
Common mistake: Bending at the hips or shrugging your shoulders instead of pulling your chest straight in.'
where slug = 'row_incline_standing';

update exercises set how_to =
'Setup: Set a bar at about waist height. Lie under it and grip it a little wider than your shoulders, body straight from heels to head, hanging from straight arms.
Movement: Pull your chest to the bar, keeping your body rigid, then lower under control to straight arms.
Common mistake: Letting your hips sag so only your chest moves — everything from your heels up should travel as one piece.'
where slug = 'row_inverted_high';

update exercises set how_to =
'Setup: Lower the bar to about hip height. Get under it with a grip a little wider than your shoulders, body straight, hanging from straight arms.
Movement: Pull your chest to the bar and lower back down. The lower the bar, the more horizontal you are and the harder it is.
Common mistake: Your hips dropping first — squeeze your glutes and stomach so your body stays a plank.'
where slug = 'row_inverted_low';

update exercises set how_to =
'Setup: Set up a low inverted row, then put your heels on a box or bench so your body is fully horizontal under the bar.
Movement: Pull your chest to the bar and lower under control, holding the flat-plank shape the whole time.
Common mistake: Your feet sliding off the box as you tire, or your hips piking up toward the bar.'
where slug = 'row_inverted_feet_elevated';

update exercises set how_to =
'Setup: Hang under a pair of rings or a bar with a wide grip, body straight and close to horizontal.
Movement: Pull to one side so that arm bends fully while the other stays straight out to the side. Return to the middle and repeat toward the other side.
Common mistake: Rotating your shoulders and hips toward the working arm instead of keeping your chest facing up.'
where slug = 'row_archer';

update exercises set how_to =
'Setup: Hold a single ring with one hand, feet together on the floor in front of you, body leaning back on a straight arm.
Movement: Pull your chest toward the ring with the one arm, resisting the twist, then lower back to a straight arm. Walk your feet forward to make it harder.
Common mistake: Letting your body rotate open toward the free side — feet together and a tight core keep you square.'
where slug = 'row_one_arm_progression';

update exercises set how_to =
'Setup: Stand in front of a chair, bench, or low step, feet about shoulder-width, toes turned out slightly.
Movement: Push your hips back and sit down to lightly touch the surface, then stand all the way up tall. A higher surface makes it easier.
Common mistake: Flopping down onto the seat and bouncing up — lower under control and stand up fully each rep.'
where slug = 'squat_box';

update exercises set how_to =
'Setup: Stand with your feet about shoulder-width apart, toes turned out slightly, arms out in front for balance.
Movement: Push your hips back and bend your knees to lower until your thighs are at least parallel to the floor, then drive back up. Let your knees travel out over your toes.
Common mistake: Your heels lifting or your knees caving inward — keep your whole foot down and push your knees out.'
where slug = 'squat_bodyweight';

update exercises set how_to =
'Setup: Step one foot forward and one foot back into a long stride, back heel lifted, torso upright.
Movement: Bend both knees to drop straight down until your back knee nearly touches the floor and your front shin is roughly vertical, then push back up. Finish all reps, then switch legs.
Common mistake: Leaning forward over the front leg — keep your chest tall and travel straight down.'
where slug = 'squat_split';

update exercises set how_to =
'Setup: Stand a stride''s length in front of a bench and rest the top of one foot on it behind you, most of your weight on the front leg.
Movement: Bend the front knee to lower until that thigh is about parallel to the floor, then push back up through the front foot.
Common mistake: Standing too close to the bench, so the front knee shoots far past the toes and takes the load.'
where slug = 'squat_bulgarian';

update exercises set how_to =
'Setup: Stand on one foot next to a doorframe, pole, or hanging band, holding it lightly with one or both hands. Hold your other leg straight out in front.
Movement: Push your hips back and lower all the way down on the standing leg, using the support only for balance, then stand back up.
Common mistake: Hauling yourself up by pulling hard on the support — let your leg do the work and use your hand only to stay upright.'
where slug = 'squat_pistol_assisted';

update exercises set how_to =
'Setup: Stand on one foot with the other leg held straight out in front of you and your arms reached forward as a counterweight.
Movement: Push your hips back and bend the standing knee to lower all the way down, keeping the free leg off the floor, then stand straight back up.
Common mistake: The raised heel dropping to the floor for balance, or the standing knee caving inward as you sink.'
where slug = 'squat_pistol';

update exercises set how_to =
'Setup: Hold a light dumbbell, plate, or kettlebell at your chest. Stand on one foot with the other leg held straight out in front.
Movement: Lower all the way down on the standing leg, keeping the weight close to your chest as a counterbalance, then stand straight back up.
Common mistake: Adding weight before your bodyweight pistol is smooth — the extra load magnifies every wobble.'
where slug = 'squat_pistol_weighted';

update exercises set how_to =
'Setup: Lie on your back with your knees bent and feet flat on the floor, close enough that your fingertips brush your heels.
Movement: Push through your heels to lift your hips until your body is a straight line from knees to shoulders, squeeze your glutes hard at the top, then lower.
Common mistake: Arching your lower back to get higher instead of driving the height from your glutes.'
where slug = 'glute_bridge';

update exercises set how_to =
'Setup: Lie on your back set up for a glute bridge, then straighten one leg or hug that knee to your chest.
Movement: Push through the heel of the planted foot to lift your hips, keeping them level side to side, then lower. Finish all reps, then switch.
Common mistake: The hip on the free-leg side dropping as you lift — keep your belt line level the whole time.'
where slug = 'glute_bridge_single_leg';

update exercises set how_to =
'Setup: Sit on the floor with your upper back against the edge of a bench or couch, knees bent, feet flat about hip-width.
Movement: Drive through your heels to lift your hips until your body is flat from knees to shoulders, chin tucked, then lower under control.
Common mistake: Overarching your back and flaring your ribs at the top instead of finishing with a hard glute squeeze and a level torso.'
where slug = 'hip_thrust';

update exercises set how_to =
'Setup: Stand on one leg with a soft bend in that knee, hands at your sides or reaching down in front.
Movement: Hinge forward from the hip with a flat back, letting the free leg float straight out behind you as a counterweight, until your torso is near parallel to the floor, then stand back up.
Common mistake: Rounding your back or letting your hips rotate open — keep your back flat and both hip bones pointing down.'
where slug = 'rdl_single_leg';

update exercises set how_to =
'Setup: Kneel tall on something padded with your feet anchored under a heavy object or held down by a partner.
Lower: Keep a straight line from knees to head and lower your torso toward the floor as slowly as you can, resisting the whole way with your hamstrings.
At the bottom: Let yourself drop into a push-up position to catch the fall, then push off the floor and pull yourself back to the top.
Common mistake: Folding at the hips instead of lowering as one rigid line from knees to head.'
where slug = 'nordic_curl_negative';

update exercises set how_to =
'Setup: Kneel tall on a pad with your feet anchored under a heavy object or held by a partner, body straight from knees to head.
Movement: Lower slowly under control toward the floor, then — before your hands need to catch you — reverse and pull yourself back up to kneeling using only your hamstrings.
Common mistake: Attempting the way up before you can lower with full control — build the lowering half first.'
where slug = 'nordic_curl_full';

update exercises set how_to =
'Setup: Lie on your back with your arms reaching straight up at the ceiling and your hips and knees bent 90 degrees, shins parallel to the floor.
Movement: Press your lower back flat into the floor. Slowly straighten one arm overhead and the opposite leg toward the floor, stop just short of touching, then return and switch sides.
Common mistake: Your lower back lifting off the floor as the leg lowers — shorten the reach until you can keep it pinned.'
where slug = 'dead_bug';

update exercises set how_to =
'Setup: Hang from a bar with a shoulder-width overhand grip, arms straight, legs together.
Movement: Without swinging, curl your knees up toward your chest, rounding your lower back slightly at the top, then lower under control.
Common mistake: Kicking your legs up with momentum and swinging back — pause at the bottom to kill the swing.'
where slug = 'hanging_knee_raise';

update exercises set how_to =
'Setup: Hang from a bar with straight arms and straight legs, body still.
Movement: Keeping your legs straight, raise them until they are at least parallel to the floor, then lower slowly all the way back down.
Common mistake: Bending your knees or swinging to get the legs up — slower and lower beats higher with a kip.'
where slug = 'hanging_leg_raise';

update exercises set how_to =
'Setup: Lie on a bench and reach back to grip it firmly behind your head. Bring your hips and legs up so your whole body points at the ceiling, resting on your upper back and shoulders.
Lower: Keeping your body dead straight and rigid, lower it as one piece toward the bench as slowly as you can, then reset from the bottom.
Common mistake: Bending at the hips so your legs lead the way down — the whole body should move as a single plank.'
where slug = 'dragon_flag_negative';

update exercises set how_to =
'Setup: Place your hands on the floor a stride in front of a wall — close enough to catch you, far enough that a good kick-up will not hit it.
Movement: Kick one leg up and push off the other, trying to float both legs to vertical and balance for a moment before coming down. Count every attempt, not just the clean ones.
Common mistake: Kicking too hard so you crash into the wall, or too soft so you never reach vertical — adjust the effort each try.'
where slug = 'handstand_kickup_drill';

update exercises set how_to =
'Setup: Kick up into a handstand with either your chest or your back to a wall, hands about a hand''s length from it, arms locked straight.
Hold: Push tall through your shoulders and stack your ribs over your hips instead of letting your back arch. Look at the floor between your hands.
Common mistake: Sinking into your shoulders so your head drops between your arms — press the floor away the whole time.'
where slug = 'handstand_hold_wall';

update exercises set how_to =
'Setup: Hang from a bar with a shoulder-width overhand grip, arms fully straight, feet off the floor.
Hold: Relax into a full hang, then pull your shoulder blades down and back — like sliding them into your back pockets — without bending your elbows. Alternate relaxing and pulling.
Common mistake: Shrugging your shoulders up toward your ears instead of pulling them down.'
where slug = 'dead_hang';

update exercises set how_to =
'Setup: Rest on your forearms with your elbows under your shoulders and your knees on the floor, ankles lifted.
Hold: Squeeze your glutes and brace your stomach so your body is a straight line from your head to your knees. Breathe normally.
Common mistake: Hips sagging toward the floor or piking up — hold the line from head to knees.'
where slug = 'plank_knee';

update exercises set how_to =
'Setup: Rest on your forearms with your elbows under your shoulders and your legs straight out behind you, up on your toes.
Hold: Squeeze your glutes and brace your stomach so your body is one straight line from head to heels. Breathe normally.
Common mistake: Hips creeping up into a pike, or sagging toward the floor, instead of holding the line.'
where slug = 'plank_full';

update exercises set how_to =
'Setup: Lie on your back, press your lower back flat into the floor, and bend your knees over your hips.
Hold: Lift your head and shoulders off the floor and float your feet a few inches up, keeping your lower back glued down. Reach your arms toward your knees.
Common mistake: Your lower back arching into a gap — raise your feet higher or tuck your knees more until it stays flat.'
where slug = 'hollow_hold_bent';

update exercises set how_to =
'Setup: Lie on your back with your lower back pressed flat, then extend your legs straight and reach your arms overhead so your body makes a long, shallow dish.
Hold: Lift your shoulders and your heels a few inches off the floor and hold the dish shape, lower back still flat.
Common mistake: Letting your lower back arch as your legs lower — raise your feet the moment a gap appears.'
where slug = 'hollow_hold_full';

update exercises set how_to =
'Setup: Sit with your legs straight in front of you and place your hands on parallettes, low blocks, or the floor beside your hips.
Hold: Press down hard to lift your whole body — hips and heels — off the floor, holding your straight legs out parallel to the ground.
Common mistake: Bent knees or dropping heels — if you cannot hold the legs at parallel yet, start with one knee bent or your feet on a low block.'
where slug = 'l_sit';

update exercises set how_to =
'Setup: Face a wall on your hands and feet, then walk your feet up the wall and your hands in toward it until your chest is close to the wall and your body is vertical.
Hold: Push tall through your shoulders, squeeze your legs together and point your toes, and keep your ribs down.
Common mistake: Hands so far from the wall that your back arches hard — walk them in until you can hold a straight line.'
where slug = 'handstand_wall_chest';

update exercises set how_to =
'Setup: Get on your hands and knees facing away from the wall, feet against the baseboard, hands about a foot from the wall.
Getting up: Walk your feet up the wall while stepping your hands back toward it, until your hips stack over your shoulders and your chest is near the wall.
Hold: Push hard through your shoulders, squeeze your legs together, and look at the floor between your hands.
Common mistake: Keeping your hands too far from the wall, which bends your body into a banana instead of a straight line.'
where slug = 'handstand_wall_back';

update exercises set how_to =
'Getting up: Kick up to a handstand with your back to the wall, heels resting on it, arms straight and shoulders pushed tall.
Balance: Shift your weight onto one arm and briefly lift the other hand off the floor, then set it back down. Alternate hands — each tap trains the corrections a freestanding handstand needs.
Common mistake: Rushing the taps and falling out — small, slow weight shifts build more than frantic ones.'
where slug = 'handstand_wall_one_hand_tap';

update exercises set how_to =
'Getting up: In open space, kick up to a handstand and find the balance point where you are tipping neither toward your fingers nor your heels.
Hold: Keep your arms locked and your body tight, and make small corrections by pressing through your fingertips when you fall forward or the heels of your hands when you fall back.
Common mistake: Trying to save every wobble with your whole body — the fingers and wrists do almost all of the balancing.'
where slug = 'handstand_freestanding_hold';

update exercises set how_to =
'Getting up: Kick up to a freestanding handstand and settle into your balance point with locked arms and a tight body.
Hold: Keep making small fingertip and wrist corrections and simply stay up longer. At this stage it is balance stamina, not strength, that runs out first.
Common mistake: Holding your breath — breathe shallowly and steadily so you can last the full time.'
where slug = 'handstand_freestanding_extended';

update exercises set how_to =
'Getting up: Kick up to a freestanding handstand and tip your weight very slightly past your hands so you begin to fall forward.
Movement: Take small, quick steps with your hands to chase that falling weight, keeping your legs together and your eyes on the floor just ahead of your fingers.
Common mistake: Big reaching steps that break your straight line — many tiny steps keep you stacked and moving.'
where slug = 'handstand_walk';
