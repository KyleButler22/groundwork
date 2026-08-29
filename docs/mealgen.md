# Meal Plan Generator

Selecting a week of meals from the recipe corpus that hits macro targets, respects every hard constraint, stays varied enough to enjoy, and still fits on one page of shopping.

Full design version: https://claude.ai/code/artifact/a8d9c20e-4edb-406b-a2f7-9f2316728c70 (private link — this file is the source of truth if it's unreachable).

**Implemented (2026-08-28)** in `src/generators/meal/` — pure TS, mirroring `src/generators/workout/`'s shape: one file per pipeline stage (`filter.ts`, `grid.ts`, `allocate.ts`, `scoring.ts`, `assemble.ts`, `repair.ts`, `validate.ts`), a `MealLibrary` index (`library.ts`) mirroring the workout generator's `MovementLibrary`, and `generateMealPlan.ts` as the orchestrator plus the `regenerateWeek`/`swapOneMeal` entry points from §9. 102 tests (unit fixtures in `__fixtures__/testMealLibrary.ts`, integration tests against the real 200-recipe corpus in `generateMealPlan.integration.spec.ts`), ~96% statement coverage. Grocery-list generation (§8 below) is NOT built yet — see TASKS.md.

**Where this doc left real numbers unspecified, the code had to choose some — recorded here so they read as decisions, not omissions:**

- **Scoring weights** (§4's formula names five terms but gives no magnitudes — only the §5 variety floor was ever a tuned, measured number). `scoring.ts`'s `DEFAULT_WEIGHTS`: macro 1.0 (dominant), overlap 0.3, preference 0.2, recency 0.5, repeat 1.0. A documented judgment call, same status as the workout generator's own timing constants — not derived from a simulation the way the variety floor was.
- **Serving-scale scoring**: a candidate's macroFit is scored against its BEST ACHIEVABLE macros after applying the same 0.75–1.5x clamp assembly would actually use (`scoring.ts`'s `bestAchievableScale`), not its raw per-serving numbers — otherwise scoring would rank a recipe worse than what actually gets served.
- **`servings` means "eaten in this entry," always** — including a fresh dinner that also spawns a leftover, whose own `servings` is one night's portion, not the doubled batch. The total batch actually cooked (needed for §8's grocery derivation) is a small derived sum (`entry.servings + Σ leftover children's servings`) computed once, when that feature is built — not a field this generator stores directly. Chosen over doubling the fresh entry's own field because it keeps every entry's macro contribution independently readable (a repair pass summing a day's entries needs no special-casing for which one has a leftover).
- **Cook-time ceiling scope**: applied to dinner and lunch only (the two "cooked" meals), never to breakfast/snack; weekends are always exempt, using the single ceiling value intake actually collects (see `assemble.ts`'s `withinCookTimeCeiling`) — the "two ceilings" open question below is still open, this just uses what exists today per the doc's own Sunday-roast example.
- **`mealsPerDay` beyond 4 is clamped, with a warning** — `meal_plan_entries`'s `unique (meal_plan_id, serve_on, slot)` only has 4 slot values to work with, so a second snack has nowhere to go without a schema change. Below 4, the highest-share slots survive first (dinner, then lunch, then breakfast) — a rule derived from §3's own share ranking, not a hand-picked case per count.
- **Breakfast rotation size is fixed at 3** (the top of the doc's "2-3" range) — chosen since more rotation variety is free once repeats are exempt from the within-week penalty anyway.
- **Leftover placement** picks a valid parent day 1-3 days back via a seeded shuffle, since nothing in the schema/intake has a "day marked busy" concept yet for the doc's stated preference.
- **Household scaling**: resolves the "leaning toward" open question below — targets are computed for the primary user, and every slot's chosen servings are `scale × household_size`.

Below, §1-§7 describe the implemented pipeline as designed; §8 (grocery list) and §9 (regenerate/swap) describe what the code targets — §9 is implemented, §8 is not yet.

## The shape of the problem

A multi-objective constrained selection problem, harder than the workout generator. Some constraints are absolute (an allergen is never a trade-off); the rest are objectives that actively fight each other:

- **Macro accuracy** pulls toward a narrow band of recipes that fit the targets.
- **Variety** pulls toward breadth, directly against macro accuracy.
- **Ingredient overlap** pulls toward repetition, directly against variety.
- **Preference** pulls toward whatever's rated `loved`, against all three.

Solved exactly, this is multi-dimensional knapsack — NP-hard. What's needed is a heuristic that lands close, runs in well under 200ms on a mid-range phone, and is deterministic (same seed → same week).

Pipeline: **Filter → Grid → Allocate → Assemble → Repair.**

## 1. Filter

Hard constraints, run once to produce the legal candidate pool — binary, no scoring:

```js
candidates = recipes.filter(r =>
  !hasAllergen(r, userAllergens)          // derived from ingredients
  && satisfiesDiet(r, userDietTags)
  && !hasDislikedIngredient(r, userDislikes)
  && r.difficulty <= skillCeiling
  && feedback[r.id]?.rating !== 'never'
  && !exclusions.has(r.id)
)
```

`cook_time_ceiling` is deliberately **not** here — cook time is a per-slot constraint, not global. A 25-minute weeknight ceiling shouldn't block a 70-minute Sunday roast from being offered on Sunday. Filtering it globally is a common, quietly destructive mistake that strips the best recipes out of the corpus.

**When the pool is too thin:** detect before assembly (want ~3× the recipes needed, for real selection freedom) and relax in a fixed order:

1. Drop the exclusion set (repeating last week is the cheapest thing to give up).
2. Widen the cook-time ceiling, weeknights first.
3. Relax the difficulty cap.
4. Ignore soft dislikes — and say so on screen.

**Never relaxed, at any step:** allergens, diet tags. If the pool is still unusable after step 4, generate a shorter week and say plainly the corpus doesn't have enough matching recipes yet — never quietly serve something unsafe.

## 2. The grid

7 days × `meals_per_day` slots — but not every slot needs its own recipe.

**Leftovers are a feature.** A 4-serving dinner for a household of 2 produces a second meal for free. Plan this in from the start (target ~60% fresh cooks / 40% leftovers across dinner slots, tunable) rather than treating it as the user's problem — halves cooking load and shortens the shopping list. Placement: a leftover sits 1–3 days after its parent cook (food safety), preferentially on a day marked busy. Schema: `meal_plan_entries.leftover_of_id`.

**Breakfast is not like the others.** Most people rotate 2–3 breakfasts happily. Forcing 7 distinct breakfasts inflates the shopping list, adds unwanted decisions, and is a common reason meal planners get abandoned. Default to 2–3 rotating breakfast recipes, exempt from the within-week repeat penalty.

## 3. Macro allocation

Split daily targets across slots *before* selecting anything — turns one hard problem (hit 1,930 kcal across 4 meals) into four easy ones.

| Slot | Share | kcal | Protein |
|---|---|---|---|
| breakfast | 25% | 482 | 45g |
| lunch | 30% | 579 | 54g |
| dinner | 35% | 676 | 63g |
| snack | 10% | 193 | 18g |
| **Day** | **100%** | **1,930** | **180g** |

(Figures from the intake doc's worked example.) These are defaults, not laws — someone training in the morning may want more around the session — but a fixed allocation is what makes per-slot scoring meaningful at all.

## 4. Scoring

Every legal candidate is scored for a given slot against the week's state so far:

```
score(recipe, slot, state) =
    w_macro   × macroFit(recipe, slot.target)
  + w_overlap × overlapValue(recipe, state.planned)
  + w_pref    × preference(recipe, feedback)
  − w_recent  × recency(recipe, feedback.last_served_on)
  − w_repeat  × withinWeekRepeat(recipe, state)
```

**macroFit** — normalised distance from target, protein weighted double (hardest macro to hit, matters most to the outcome; calories are easy to correct later with a serving tweak):

```
d = 0.5 × |kcal − t.kcal| / t.kcal + 1.0 × |protein − t.protein| / t.protein
macroFit = max(0, 1 − d)
```

**overlapValue** — weighted by what an ingredient costs to buy, not just counted. Sharing a bunch of coriander across three recipes matters (can't buy a third of a bunch, the rest rots); sharing salt doesn't:

```
shared = recipe.ingredients ∩ state.planned
value  = Σ (1 − is_pantry_staple) over shared ÷ |recipe.ingredients|
```

**recency** — exponential decay from `last_served_on`, ~3-week time constant: `exp(-days / 21)`. One field on `user_recipe_feedback` covers exclusion, preference, and this cooldown at once.

## 5. Overlap vs. variety — measured, not guessed

These objectives directly oppose each other, and the weighting between them is the single most consequential tuning decision in the generator. Simulated rather than guessed: a 200-recipe corpus over 120 non-staple ingredients with a realistic long-tail frequency (onion/chicken everywhere, saffron almost nowhere), 6–10 ingredients per recipe, selecting 7 dinners, counting distinct non-staple ingredients bought — averaged over 400 seeded trials.

The variety guard is a floor: every recipe added must bring at least N ingredients not already in the week.

| Variety floor | Distinct ingredients to buy | vs. random | Reads as |
|---|---|---|---|
| (random, no overlap goal) | 39.1 | — | unconstrained |
| 0 | 23.3 | 40% fewer | repetitive |
| 1 | 23.3 | 40% fewer | tight |
| **2** | **23.8** | **39% fewer** | **balanced** ← use this |
| 3 | 27.3 | 30% fewer | varied |
| 4 | 32.7 | 16% fewer | very varied |
| 5 | 38.3 | 2% fewer | near-random |

**Finding: the curve is flat from floor 0 to floor 2, then falls off a cliff.** Floor 2 captures essentially the entire overlap benefit while still guaranteeing every meal brings something new; floor 3 gives up 9 points of savings for one extra novel ingredient per recipe. **Set the variety floor at 2.**

Two caveats: this models dinners only (where overlap matters most) — adding breakfast/lunch dilutes the effect. And the result only materialises if the corpus actually clusters ingredients — see the corpus-authoring note in the `calisthenics-recipe-corpus` memory (build in ~10–15 ingredient families, not 200 independent recipes spanning every cuisine).

**Re-measured against the real 200-recipe corpus once it existed** (`scripts/verify-corpus-overlap.mjs`, 2026-08-28): the actual reduction is **24%** (22.7 → 17.1 distinct ingredients for 7 dinners), not the 39% modeled above. The real corpus's random baseline is already better than the synthetic model assumed — universal aromatics (onion, garlic) appear in nearly every recipe regardless of family, which helps *even random* selection and leaves less headroom for deliberate optimisation to improve on. Still a real, meaningful reduction; the synthetic figure was directionally right (clustering helps) but should not be quoted as the expected number — use 24% as the honest baseline for what this app's actual corpus delivers.

## 6. Assembly

Greedy fill, but **order** is what makes it work:

```
dinners → lunches → breakfasts → snacks last
// Dinners carry the biggest macro share and the tightest cook-time
// constraint. Snacks go last precisely because they're the flex — a
// snack can absorb whatever macro gap the rest of the day left behind.
```

**Serving scale is the quiet superpower.** You almost never find a recipe landing exactly on a slot target — scale servings instead of searching harder. Converts a discrete selection problem into a near-continuous one; does more for accuracy than any clever search.

```
target 676 kcal, best candidate 540 kcal/serving
scale = 676 / 540 = 1.25 servings → 675 kcal (−0.1%)
```

Clamp to **0.75–1.5×** — beyond that, portions stop being believable and it's really an admission the corpus lacks a recipe for this slot. `meal_plan_entries.servings` is `numeric(4,2)` for exactly this.

Same determinism rule as the workout generator: derive each decision from `hash(seed, day, slot)`, never a sequential stream.

## 7. Repair

Greedy assembly drifts. After the grid is full, check each day against tolerance (**±7% kcal, ±10% protein**) and fix what's outside it, cheapest intervention first:

1. Re-scale servings on the day's least-constrained slot (free, invisible, fixes most drift).
2. Swap the snack (small, low-stakes, exists to absorb error).
3. Swap the lunch (bigger, still less disruptive than touching dinner).
4. Accept and flag as approximate rather than looping.

**Cap iterations at 3.** Repair must terminate — an unbounded loop on a phone turns "regenerate" into a spinner that never resolves. A day 9% off target is fine and unnoticed; a generator that hangs is not fine and is noticed by everyone.

## 8. The grocery list

Derived from the plan, then independent (a table, not a view — people edit it).

```
1. take fresh-cook entries only        // leftovers contribute nothing
2. scale each recipe_ingredient by the batch actually cooked
3. resolve to grams via ingredient_units, falling back to density
4. sum by ingredient_id
5. subtract user_pantry, drop is_pantry_staple
6. convert to the friendliest display unit
7. group by aisle.sort_order
```

**Step 1 is the one that bites.** A leftover entry must contribute zero ingredients — its food was already bought for the parent cook. Summing across all entries double-counts every leftover and inflates the list with numbers that still look plausible — exactly the kind of bug that ships. Related: shop for what you *cook*, not what you eat — a 4-serving recipe for a household of 2 still means buying 4 servings of ingredients.

Deliberately simple for v1: **no rounding to purchasable pack sizes.** Modelling "you can't buy 137g of chicken" needs a per-region product database — large effort, modest benefit. Display what the recipes need; people round in the shop, as they already do.

## 9. Regeneration

Two distinct actions — conflating them is a real UX failure (rerolling a whole week because one dinner looked unappealing loses the meals that worked):

| Action | Seed | Exclusions | Scope |
|---|---|---|---|
| Regenerate week | `hash(seed, ++regen_count)` | all current unlocked recipes | Unlocked slots only; `is_locked` entries untouched |
| Swap one meal | `hash(seed, day, slot, n)` | just that recipe | Re-score that slot, repair only that day |

Both cost nothing — no network, no model call, no server — which is the entire payoff of deterministic generation, since the regenerate button will get hammered. Every rejection is also signal: write `user_recipe_feedback` on a swap; a recipe swapped away twice should probably stop appearing.

## Failure modes to detect before assembly, not during

- **Infeasible targets** — high protein + vegan + a 20-minute ceiling may have no solution in a 200-recipe corpus. Check whether the pool's macro distribution can even span the target before trying; say so honestly.
- **Thin pool** — fewer than 3× the needed recipes triggers the relaxation ladder (§1), with the user told what was relaxed.
- **Repair non-convergence** — capped at 3 passes, then accept and flag.

## Open questions

| Question | Status |
|---|---|
| Slot shares | Still fixed 25/30/35/10 (rescaled proportionally when fewer than 4 slots are active — `allocate.ts`). Shifting toward the training window is still open; nothing in intake captures a training time-of-day to shift toward yet. |
| Household portions | **Resolved, implemented**: plan for the primary user, scale quantities by `household_size` — every slot's servings are `scale × household_size` (`assemble.ts`). |
| Weekend cook time | **Partially resolved**: weekends are fully exempt from the single ceiling intake collects (`assemble.ts`'s `withinCookTimeCeiling`), which honours the doc's own Sunday-roast example without needing a new field. A genuinely separate, user-set weekend ceiling is still open. |
| Leftover ratio | Still a fixed 40% default (`grid.ts`'s `DEFAULT_LEFTOVER_RATIO`), overridable per call but not yet exposed as a user preference in intake. |
| Snack as recipe | Resolved by construction: snacks ARE planned recipes (recipe_meal_slots includes 'snack'), so repair's snack-swap lever (step 2) is available as designed. |
| Swap propagating to a leftover | **New, found during implementation**: `swapOneMeal` on a fresh dinner that has a leftover elsewhere in the week does not update that leftover — it still serves the old recipe. Called out with an explicit warning rather than silently wrong; not yet fixed (see TASKS.md). |
