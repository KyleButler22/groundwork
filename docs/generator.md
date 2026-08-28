# Workout Generator

How a split, a set of ladder positions, and a session length become four weeks of prescribed training — and how the promotion engine keeps it honest after every logged workout. No code implements this yet — this is the spec for `src/generators/workout/`.

Full design version: https://claude.ai/code/artifact/b712217c-b713-43d1-ae4e-0c7b9c0e384b (private link — this file is the source of truth if it's unreachable).

Generation is a **pure function**: same inputs and seed produce the same plan, every time, no network call. That's what makes it free to re-run, testable against fixtures, and usable on a phone in a basement gym.

```
generatePlan(targets, levels, equipment, limitations, seed) → plan
  // targets     ← user_targets      (goal, days_per_week, session_minutes)
  // levels      ← user_exercise_levels (current rung on each ladder)
  // equipment   ← user_equipment
  // limitations ← user_limitations  (flagged joints)
```

Pipeline: **Split → Slots → Fill → Budget → Validate.**

## 1. Choosing the split

`days_per_week` decides the split outright — it shouldn't be a user choice; offering one mostly produces people picking a 6-day split they abandon in a fortnight.

Calisthenics-specific principle: **frequency beats per-session volume.** Bodyweight movements are skill-adjacent and improve with more frequent, fresher practice — every split below hits each pattern at least twice a week, none is a bodybuilder-style one-muscle-a-day arrangement.

| Days | Split | `split_type` | Notes |
|---|---|---|---|
| 1–3 | Full body, repeated | `full_body` | One template reused every day — see §6 on why identical sessions across the week are correct, not a bug |
| 4 | Upper/Lower/Upper/Lower | `upper_lower` | 2× each pattern |
| 5 | Upper/Lower/Upper/Lower/Upper | `upper_lower` | **Implemented as an extra Upper day, not a distinct 5-template hybrid.** `split_type` only has three values (`0004_training.sql`); a genuine Upper/Lower/Push/Pull/Legs hybrid doesn't fit any of them cleanly, so this was simplified during implementation (`splits.ts`) rather than left as a dangling fourth split type |
| 6 | Push/Pull/Legs ×2 | `push_pull_legs` | Only offer if `session_minutes` is low — six long days is a trap |

No 7-day option, ever. A rest day is part of the programme. Enforced in `chooseSplit()` itself (clamped to 1-6), not just left to the UI to never offer 7.

## 2. Slot templates

A session is a fixed, ordered list of **slots** — each declaring a movement pattern, whether it's required, and a priority for when time runs short. The generator fills slots; it doesn't invent structure. This is what keeps sessions coherent and makes templates testable as data, independent of the generator.

```js
// Upper day, 4-day split. Order is performance order; priority is what
// survives a short session.
{
  slots: [
    { pattern: 'skill',           required: false, priority: 1, onlyIf: 'goal==skill' },
    { pattern: 'vertical_pull',   required: true,  priority: 2 },
    { pattern: 'horizontal_push', required: true,  priority: 3 },
    { pattern: 'horizontal_pull', required: false, priority: 5 },
    { pattern: 'vertical_push',   required: false, priority: 6 },
    { pattern: 'accessory',       required: false, priority: 7 },
    { pattern: 'core',            required: true,  priority: 4 },
  ]
}
```

`core` sits last in performance order but 4th in priority — different axes. Conflating them is exactly how core work quietly disappears from short sessions (see §3).

The `'skill'` and `'accessory'` names above are illustrative. The actual templates (`splits.ts`) reference real `movement_patterns` slugs from the seed data — `skill_handstand` for skill, and no `'accessory'` slot at all, since no such pattern exists to fill it from.

```
selectExercise(slot, levels, equipment, limitations, rng):
  ex = levels[slot.pattern].exercise_id       // current rung

  // walk down until performable with what they own
  while (!canPerform(ex, equipment))
    ex = regressionOf(ex) ?? return null

  // injuries: try sideways before down. Wrist pain doesn't mean no
  // pushing, it means fists or parallettes.
  if (contraindicated(ex, limitations))
    ex = lateralOf(ex, rng) ?? regressionOf(ex) ?? return null

  return ex
```

## 3. The time budget

Session length is a hard constraint most generators ignore, producing a "30 minute" session that takes fifty. Estimate every prescription's cost and spend against a budget.

```
work   = reps × 3s              // or target_seconds for an isometric
cost   = sets × work + (sets − 1) × rest + 30s transition
usable = session_minutes × 60 − 360s warm-up − 180s buffer
```

**Why greedy filling is wrong.** Walking slots in priority order and taking what fits looks reasonable — but at a 30-minute budget (1,260s usable) against the template above:

```
vertical_pull    462s  kept  (798s left)
horizontal_push  420s  kept  (378s left)
horizontal_pull  420s  DROPPED — too big
vertical_push    282s  kept  (96s left)
accessory        252s  DROPPED
core             270s  DROPPED  ← required slot, silently cut
```

A lower-priority optional slot ate the budget a *required* slot needed. The user gets a "short session" that dropped a required movement pattern with no indication.

**Fix: reserve, then distribute.** Reserve the minimum viable cost (2 sets) for every required slot first. Spend what remains upgrading reserved slots toward their full prescription, in priority order, before adding any optional slot.

```
pass 1  reserve minimums for required slots     536s   (724s left)
pass 2  upgrade vertical_pull    2→4 sets       +276s
        upgrade horizontal_push  2→4 sets       +240s
        upgrade core             2→3 sets       +100s
        optional slots: none fit in 108s left

result  3 exercises, 28.2 min of 30 — core survives
```

At muscle-gain rest intervals, 30 minutes only fits three exercises — not a modelling bug, that's what 120s rests actually cost, and the strongest argument for supersets (§5) when the budget is tight.

## 4. Prescription

Sets/reps/rest come from the goal, but must be **intersected** with what the exercise itself supports — skip this and you get "one-arm push-up, 4×15".

```
rep_min = max(goal.rep_min, exercise.rep_min)
rep_max = min(goal.rep_max, exercise.rep_max)
// empty intersection → regress one rung and retry
```

| Goal | Sets | Reps | Rest | Emphasis |
|---|---|---|---|---|
| fat_loss | 3–4 | 10–15 | 45–60s | Density; supersets by default |
| muscle_gain | 4 | 6–12 | 90–150s | Straight sets, progression first |
| recomp | 3–4 | 8–12 | 75–90s | Balanced |
| maintain | 3 | 8–12 | 90s | Balanced, lower volume |
| skill | 2–3 | low | 120–180s | Quality over fatigue |

For isometrics, the same intersection applies to `hold_min_s`/`hold_max_s` instead — `metric_type` on the exercise decides which pair to read.

## 5. Supersets

Pairing two non-competing exercises lets one rest while the other works, roughly halving dead time. Apply when the goal is `fat_loss`, or whenever the budget is tight enough that a required slot would otherwise be cut.

```
Pairing rules — all must hold:
1. Patterns are antagonistic or unrelated   (push+pull, upper+core)
2. Neither is the session's skill slot      (skill work is never rushed)
3. Neither is level 7+                      (hard progressions need full rest)
4. Combined equipment is co-locatable       (no room-crossing pairs)
```

Paired items share `plan_items.superset_group`; cost becomes `sets × (workA + workB + rest) + 30` — one shared rest instead of two independent ones. Rule 3 matters: near the top of a ladder (archer pull-ups, one-arm work), incomplete rest means failed reps, not a faster session.

## 6. Week to week

Within a 4-week block the exercises stay put; progression comes from volume and rep-range creep. **Changing the exercise is the promotion engine's job** (§7) and runs on its own schedule, not the calendar.

| Week | Sets | Reps | Purpose |
|---|---|---|---|
| 1 | base | bottom of range | Establish form and a baseline |
| 2 | base | middle | Same work, more of it |
| 3 | base+1 | middle | Peak volume for the block |
| 4 | conditional | conditional | Deload or peak — see below |

Week 4 branches, gated rather than automatic:

```
weekType(4) = (anyPatternAtLevel >= 5 || weeksTrainedTotal >= 8)
                ? 'deload'
                : 'peak'
```

`plan_sessions.week_type` (`build`/`peak`/`deload`) stores this. The promotion engine (§7) ignores deload weeks entirely when counting consecutive successes.

## 7. The promotion engine

Smaller than the generator itself, and it's what makes the app adaptive rather than a one-time generator. Runs after every completed workout; reads `set_logs`; updates `user_exercise_levels`.

Model: **double progression** — climb the rep range at a fixed difficulty, and once every set clears the top of the range, change the exercise instead of adding more reps.

```js
onWorkoutLogged(log):
  for pattern in patternsTrained(log):
    if weekTypeOf(log) == 'deload': continue   // deloads never count

    sets = setLogsFor(log, pattern)
    state = levels[pattern]

    if every(sets, s => s.reps >= s.target_rep_max)
      state.consecutive_success += 1
      state.consecutive_failure  = 0
    else if any(sets, s => s.reps < s.target_rep_min)
      state.consecutive_failure += 1
      state.consecutive_success  = 0
    else
      state.consecutive_success  = 0          // in range: hold

    if state.consecutive_success >= 2: promote(state)
    if state.consecutive_failure >= 3: regress(state)
```

**Thresholds are asymmetric on purpose.** Two sessions to promote, three to regress:
- Fast promotion corrects the intake's deliberately conservative placement (one rung below tested level) — the engine needs to climb quickly to find the true level within a fortnight, not bore someone for a month.
- Slow regression protects morale — going backwards feels like failure, and one bad session (poor sleep, a long day) isn't evidence of anything.

**Choosing a branch:** where a rung has multiple outgoing progression edges, pick by goal — `skill` takes the skill branch, everything else takes strength. (No ladder in the current seed data actually branches yet — see [`supabase/seed/001_movement_library.sql`](../supabase/seed/001_movement_library.sql) header comment. This logic has nothing to exercise until branch content is authored.)

**Top of the ladder:** when an exercise has no outgoing edge, promotion has nowhere to go. Don't silently stall — switch that pattern to load progression (reps beyond range, then `added_weight_kg`, both already columns on `set_logs`). The failure mode to avoid: a user plateaus for six weeks while the app cheerfully prescribes the same thing and says nothing.

## 8. Determinism

Very little here is actually random — ladder position determines most choices. Randomness enters only in picking between equivalent accessories, lateral variations, and ordering within a slot group.

**Seed per decision, not from a stream:**

```
// wrong — a stream. Changing slot 2's logic shifts every draw after it.
rng = mulberry32(seed); rng(); rng(); rng();

// right — coordinates. Each decision is independent and stable.
rngFor(week, day, slot) = mulberry32(hash(seed, week, day, slot))
```

With a stream, adding a slot to week 1 silently rewrites every exercise in weeks 2–4 — regression tests become worthless and "why did my Thursday change?" becomes unanswerable. Store `generator_version` alongside `seed` on the plan; never mutate a released version's behaviour, bump it instead.

## 9. Validation

Assert before persisting — a generator that *can* emit a broken plan eventually will.

- Every session fits its time budget, warm-up and buffer included — except week 3 and a 'peak' week 4, which §6 already allows to exceed it by one set's worth without re-running allocation. `validate.ts` skips this check for exactly those weeks rather than flagging a trade-off made deliberately elsewhere in the generator.
- Every required slot is filled in every session.
- No exercise appears twice in one session.
- No contraindicated exercise for any flagged region.
- Every exercise's equipment requirement is satisfied by `user_equipment`.
- Weekly hard sets per pattern land between 8 and 25.
- Each pattern hits its split's target frequency.
- At least one full rest day per week.

On failure: log the violation with the seed, fall back to the plainest full-body template that satisfies the constraints. A conservative plan beats a broken one; the logged seed makes the failure reproducible offline.

## Open questions

| Question | Status |
|---|---|
| Missed sessions | **Decided 2026-08-27: the block slides.** Ends when the sessions are done, not when the calendar says. See `docs/schema.md` → `plan_sessions.day_index`. |
| Warm-up generation | Currently a fixed 360s allowance, not generated. A pattern-specific warm-up (fixed mapping from the day's patterns) would be better and cheap. |
| Skill slot without a skill goal | Handstand work is the most-requested calisthenics skill — worth offering as opt-in even for a fat-loss goal? |
| Regression floor | **Resolved in `promotion.ts`**: three failures at level 1 emits a `regression_floor_reached` event and resets the counter, holding the exercise in place. Reduced volume or a form-check prompt in response to that event is still a UI concern, not yet built. |
