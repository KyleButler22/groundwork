# Questionnaire → Plan

How the 8-step intake becomes a calorie target, a macro split, and a starting rung on every progression ladder. No code implements this yet — this document is the spec to build the intake flow and the target-computation function against.

Full design version: https://claude.ai/code/artifact/a3f3f0b6-81cc-4c47-98db-739f40ed75fc (private link — this file is the source of truth if it's unreachable).

## Why goal is asked last

Until maintenance calories are known, every goal is an abstraction. "Lose weight" is a mood; "1,930 kcal/day, about 0.5 kg a week" is a decision. Asking last means the final step can show real numbers derived from everything already answered — the choice becomes informed, not aspirational. It also avoids anchoring: someone who picks a goal on screen one spends the rest of the questionnaire answering as the person who already decided that.

Consequence: the questionnaire must validate progressively, not all at once at the end — nobody should reach the goal screen only to be sent back for a missing height.

## The eight steps

Each step writes to `intake_responses.answers` (raw JSONB). The "derives" column is what gets projected into `user_targets` and the per-user tables once the last step submits.

| # | Step | Asks | Derives |
|---|---|---|---|
| 1 | About you | Birth year, sex at birth, height, current weight | `profiles` (birth_year, sex_at_birth, height_cm), `body_metrics` |
| 2 | Your day | Activity outside of exercise (4 options, desk-bound → physical labour) — deliberately *not* exercise frequency, which is step 3 | `user_targets.activity_factor` |
| 3 | Your week | Realistic training days/session length ("a normal week, not your best week") | `user_targets.days_per_week`, `session_minutes` |
| 4 | What you have | Equipment multi-select with pictures (people don't know what a parallette is called) | `user_equipment` |
| 5 | Where you're starting | 5 branching rep tests, one per movement pattern. Skippable, conservative fallback | `user_exercise_levels` (one row per pattern) |
| 6 | Anything hurting | Injury/pain by region, plus pregnancy and doctor-flagged conditions | `user_limitations`, gates exercise selection |
| 7 | Your kitchen | Diet pattern, allergies, hard dislikes, weeknight cook-time ceiling, household size, meals/day | `user_diet_tags`, `user_allergens`, `user_disliked_ingredients`, `profiles.household_size` |
| 8 | **What you want** | Goals shown as outcomes with real numbers, computed from steps 1–7. Fat loss reveals a live rate control | `user_targets.goal`, `kcal_target`, `protein_g`/`fat_g`/`carb_g` |

If the questionnaire needs to be shorter: steps 2 and 3 merge cleanly; step 5 can drop to 3 tests at some cost in placement accuracy. Eight steps is already near the edge of what people will finish.

## Energy math

**BMR — Mifflin-St Jeor** (current standard; beats Harris-Benedict on modern populations):

```
BMR = 10 × weight_kg + 6.25 × height_cm − 5 × age + s
  where s = +5 (male) · −161 (female) · −78 (unspecified, midpoint)
```

**TDEE — activity and training as separate terms.** The familiar single 1.2/1.375/1.55/1.725 multiplier is unreliable (people self-select a rung too high) and bundles training into the same number as daily life. Split them:

```
base     = BMR × neat_factor          (non-training activity only)
training = (days_per_week × session_minutes × 7 kcal/min) / 7
TDEE     = base + training
```

| `neat_factor` | Answer | Roughly |
|---|---|---|
| 1.20 | Desk job, little walking | < 4,000 steps |
| 1.30 | Desk job, some walking | 4,000–8,000 steps |
| 1.45 | On your feet most of the day | retail, teaching, nursing |
| 1.60 | Physical labour | trades, warehouse |

**Worked example** (carried through this whole doc): 34, 178 cm, 82 kg, male, desk job with some walking, 4×/week at 45 min:

```
BMR      = 10(82) + 6.25(178) − 5(34) + 5 = 1,768 kcal
base     = 1,768 × 1.30                  = 2,298 kcal
training = (4 × 45 × 7) / 7              =   180 kcal
TDEE                                     = 2,478 kcal  → call it 2,480
```

Every equation here carries roughly ±10–15% individual error. Round to the nearest 10, call it an estimate in the UI copy, and correct it from real weight data after a fortnight (see [Staying accurate](#staying-accurate) below) — an app that adapts from a rough start beats one that's confidently wrong forever.

## The goal screen

Rendered for the worked example above (maintenance 2,480 kcal):

| Goal | kcal/day | Rate |
|---|---|---|
| Lose fat | 1,930 | ~0.5 kg/week (rate is user-adjustable: 0.25/0.5/0.75 kg/week, live-updates the number, refuses to go below the floor) |
| Build muscle | 2,780 | Slow, controlled gain |
| Recomposition | 2,380 | Near maintenance, protein high — suits beginners best |
| Maintain | 2,480 | — |
| Chase a skill | 2,480 | Eating flat; training changes shape instead |

```
goal → kcal_target:
  fat_loss    → TDEE − (rate_kg_per_week × 7700) / 7      (default 0.5 kg/wk)
  muscle_gain → TDEE + 300
  recomp      → TDEE − 100
  maintain    → TDEE
  skill       → TDEE

always, after the above:
  kcal_target = max(kcal_target, BMR, 1500 male / 1200 female)
```

The floor is not decoration — it belongs in the generator, not just the UI, so it can't be routed around. Show a rate option as greyed out with "below your safe minimum" rather than silently clamping.

## Macros

Resolve in order: protein first (the one that changes body composition outcomes), then a fat floor, then carbohydrate absorbs whatever's left (the one people can flex without harm).

```
1. protein_g = ref_weight_kg × { 2.2 cut · 2.0 gain · 2.0 maintain }
2. fat_g     = max(0.27 × kcal_target / 9, ref_weight_kg × 0.8)
3. carb_g    = (kcal_target − 4×protein_g − 9×fat_g) / 4
```

**Worked example** (fat loss, 1,930 kcal, 82 kg): protein 180g (720 kcal), fat 66g (594 kcal — the 0.8 g/kg floor binds here, since 27% would only give 58g), carbs 154g (616 kcal). Sums to 1,930.

Use a **reference weight**, not scale weight, for the protein calculation — 2.2 g/kg of scale weight gives someone at 140 kg an unreachable 308g target. Where body fat % is known, use lean mass; otherwise cap `ref_weight_kg` at the weight corresponding to a BMI of 27 for their height.

## Ladder placement

The most interesting problem in the intake, and the one most apps get lazily wrong with a single "beginner/intermediate/advanced" question applied to everything. That fails because people are wildly uneven — 30 push-ups and 0 pull-ups is typical, not unusual, and one level across both ladders guarantees one is pointless and the other impossible.

**Test, don't ask.** Five short branching max-rep tests, one per movement pattern (so nobody has to type a zero):

| Pattern | Anchor test | Buckets → entry exercise |
|---|---|---|
| Horizontal push | Max push-ups | 0 knee → wall push-up · 1–8 knee → incline · 9+knee/0–2 full → knee push-up · 3–8 full → full push-up · 9–15 → decline/diamond · 16–25 → archer · 26+ → pseudo-planche |
| Vertical pull | Max pull-ups, falling back to dead hang | no bar → row/band · 0 pull-ups & hang <15s → dead hang · hang 15–30s → inverted row (high) · hang 30s+ → inverted row (low)/negatives · 1–3 → pull-up · 4–8 → pull-up + volume · 9–14 → archer/L-sit pull-up · 15+ → weighted/one-arm |
| Legs (squat) | Bodyweight squats | 0–10 → box squat · 11–25 → bodyweight squat · 26–40 → split squat · 41+ → Bulgarian split squat |
| Core | Plank hold | <20s → knee plank · 20–45s → plank · 46–75s → hollow hold · 76s+ → hanging raise/L-sit |
| Vertical push | Wall handstand hold | can't hold → incline pike · <20s → pike push-up · 20–45s → elevated pike · 45s+ → wall HSPU |

**Then apply three corrections, in order:**

```js
// 1. Bias down. Self-reported reps are inflated. Starting a rung too easy
//    costs a week; too hard costs an injury and a user. Promotion climbs
//    fast, so let it.
level = max(1, table_lookup(test_result) - 1)

// 2. Gate on equipment. Walk down progression edges until performable.
while (!can_perform(exercise, user_equipment))
  exercise = regression_of(exercise)

// 3. Gate on limitations. Substitute laterally before regressing — wrist
//    pain doesn't mean no pushing, it means fists or parallettes.
if (contraindicated(exercise, user_limitations))
  exercise = lateral_of(exercise) ?? regression_of(exercise)
```

Skipping the tests is fine and shouldn't be punished — fall back to one experience question, place everything at level 2 (safe for almost everyone, self-corrects within two weeks).

**This table predates the finalized 8-pattern seed and needed adapting during implementation** (`src/lib/intake/placement.ts`):
- Only 5 of the 8 real patterns have a table above. `horizontal_pull`, `hinge`, and `skill_handstand` were never given one — they use the same level-2 fallback as a skipped test, rather than inventing untested tables under time pressure.
- The vertical pull row above references "inverted row", which is a `horizontal_pull` exercise in the finalized seed, not a rung on the `vertical_pull` ladder. Re-mapped to stay entirely within vertical_pull's own 9 rungs using the same hang-duration/pull-up-count signal — see `verticalPullLevel()`.
- The core and vertical-push rows are re-pointed at those ladders' actual rung names (`plank_knee`/`plank_full`/`hollow_hold_bent`/`hanging_knee_raise`; `pike_pushup_floor`/`pike_pushup_elevated`/`handstand_hold_wall`/`hspu_wall_negative`) rather than the generic descriptions above, to keep bucket→rung mapping internally consistent with each ladder's real difficulty ordering.

**Framing matters.** "How many push-ups can you do?" reads as judgment and gets inflated answers. "So we can start you in the right place — how many push-ups can you do with good form before your hips sag?" gets honest ones and teaches a form cue on the way past.

## Goal → training shape

The goal changes session assembly, not just calories:

| Goal | Sets × reps | Rest | Structure |
|---|---|---|---|
| fat_loss | 3–4 × 10–15 | 45–60s | Paired supersets for density, optional conditioning finisher |
| muscle_gain | 4 × 6–12 | 90–150s | Straight sets, progression prioritised over volume |
| recomp | 3–4 × 8–12 | 75–90s | Balanced |
| maintain | 3 × 8–12 | 90s | Balanced, lower volume |
| skill | 2–3 × low | 120–180s | Skill practice first, while fresh, then reduced strength work |

The `skill` row is non-negotiable, not just a preference: skill work has to come before fatigue, because a handstand practised tired teaches a worse handstand.

**The `skill` row describes skill practice itself, not the whole session.** A first implementation applied its low rep count to every pattern in a skill-goal session — squats, pushes, core — and found via testing that almost nothing overlaps a normal exercise's 6-15+ rep range at 3-6 reps, so every non-skill slot failed to resolve. Supporting work under a `skill` goal uses `maintain`'s numbers instead; only the skill slot itself gets the low-rep, long-rest treatment. See `effectivePrescriptionGoal()` in `generatePlan.ts`.

## Safety gates

Run before generation; can refuse to produce a plan. Belong in the generator, not the UI.

- **Under 16** — no deficit at all. Restrict to `maintain` with an explanation, or decline and refer out.
- **Pregnant or <12 weeks postpartum** — out of scope for v1. Refer out plainly.
- **BMI < 18.5 with a fat-loss goal** — block the deficit, offer maintenance/gain.
- **Rapid-loss requests** — cap the rate control at 1% of bodyweight/week regardless of what's requested.
- **Flagged joints** — exclude contraindicated exercises outright. A warning label is not a safety feature.
- **A short, non-clinical eating-disorder screen** before the goal step (2–3 questions). If it flags: quietly withhold the aggressive rate options and the daily calorie display, don't refuse service, don't tell anyone they were flagged.
- **Disclaimer**, once, in plain language, at intake — not buried in a terms link. General fitness guidance, not medical advice.

## Staying accurate

Real data beats the intake's estimate within a fortnight. Using it is the single highest-value nutrition feature in the app — it's what separates a calculator from a coach.

**Recompute `user_targets` when:** weight moves >2.5 kg from the value targets were computed against; the goal or rate control changes; `days_per_week`/`session_minutes` changes; or every 4 weeks against the trend.

```
trend = 14-day moving average of body_metrics.weight_kg

if weekly_change > −0.2% of bodyweight → kcal_target −= 150   (losing too slowly)
if weekly_change < −1.0% of bodyweight → kcal_target += 150   (too fast / unsustainable)
// floors always reapply afterwards
```

Use a moving average, never a single weigh-in — day-to-day scale weight swings a kilo on water alone, and reacting to that noise destroys trust in the number. `user_targets.intake_response_id` keeps every recomputation traceable to the answers it came from.

## Open questions

- Rep tests for someone with zero equipment (the pull test assumes a bar) — a table-row fallback works but places less precisely.
- Whether the goal is changeable mid-plan — leaning toward: changing it archives the current plan and generates a new one rather than mutating one in flight.
- Unit handling: store metric always, ask in whichever units the user picked at step 1. Imperial units are an input-layer concern only and should never reach the database.
