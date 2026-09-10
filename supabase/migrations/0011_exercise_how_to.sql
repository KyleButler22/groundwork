-- Groundwork schema — migration 0011: exercise how_to instructions
-- Adds the labeled-step "how to do it" text shown on the exercise detail
-- page (src/views/ExerciseView.vue) alongside the one-line `cues`. The
-- update block below is a byte-identical copy of the "how-to instructions"
-- block in supabase/seed/001_movement_library.sql at the time this
-- migration was written (the seed isn't applied to the live DB; db reset
-- would wipe real user data). Once this has run, it's a historical record:
-- a later how_to change ships as a new migration, not an edit here. See
-- docs/superpowers/specs/2026-09-10-exercise-how-to-design.md.
--
-- Content table, no RLS/trigger change: `exercises` is already
-- `to authenticated using (is_active)` (0009_rls.sql) and read-only from
-- the client; nothing here is user data. Adding a nullable column with no
-- default is a metadata-only change (no table rewrite).

alter table exercises add column how_to text;

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
