# Tasks

The living plan. Update this file as things land instead of maintaining a separate planning document — a standalone plan for a solo project goes stale the moment code exists; this doesn't, because it sits next to the code it describes.

Conventions: `[x]` done, `[ ]` not started, `[~]` in progress. Newest-first within "Done".

## Done (2026-08-27)

- [x] Vite + Vue 3 + TypeScript SPA scaffold, no SSR, path alias `@/*`
- [x] Tailwind v4 (CSS-first tokens in `src/style.css`), light/dark via `prefers-color-scheme` + `[data-theme]` override
- [x] `vite-plugin-pwa` wired up, manifest icons real (placeholder art, see below)
- [x] Vue Router (history mode) + Pinia, bottom-nav shell (`BottomNav.vue`) with safe-area insets and 44px tap targets
- [x] `src/lib/supabase.ts` — single client module, placeholder-URL fallback so a missing `.env.local` warns instead of white-screening
- [x] `src/lib/storage.ts` — swappable storage wrapper
- [x] `src/lib/db.ts` — Dexie cache, movement/training tables only (food domain deferred, see below)
- [x] `src/types/domain.ts` — hand-authored types matching the migrations
- [x] Full schema as 9 numbered migrations (`supabase/migrations/`), 40 tables, RLS on all of them
- [x] Movement library seed data: 8 patterns, 60 exercises, 52 progression edges, equipment/injury gating — `supabase/seed/001_movement_library.sql`
- [x] Static SQL verification (`scripts/verify-sql.mjs`, `scripts/verify-movement-graph.mjs`) since there's no local Postgres to test against directly
- [x] Vitest + Vue Test Utils wired up with real smoke tests (`storage.spec.ts`, `BottomNav.spec.ts`)
- [x] `docs/*.md` — schema, intake, generator, and meal-generator specs, self-contained (not dependent on the private artifact links they were drafted as)
- [x] Verified in-browser: builds clean, typechecks clean, dark mode tokens apply, routes resolve on hard navigation, no horizontal overflow at 375px

## Done (2026-08-28)

- [x] **Workout generator** (`src/generators/workout/`) — full pipeline implemented as pure, deterministic TypeScript: `splits.ts` (day-count → split → templates), `selectExercise.ts` (equipment/injury gating, walks `progression_edges`), `prescription.ts` (goal × exercise rep/hold intersection), `timeBudget.ts` (reserve-then-distribute), `supersets.ts`, `weekPlan.ts` (4-week creep + deload/peak branch), `promotion.ts` (double-progression engine), `validate.ts` (all 8 invariants from `docs/generator.md` §9), `generatePlan.ts` (orchestrator with the §9 fallback). Barrel export at `src/generators/workout/index.ts`.
- [x] 133 tests across 13 files (94% statement coverage on `src/generators/**`) — small hand-built fixture (`__fixtures__/testLibrary.ts`) for fast exact-value unit tests per module, plus `generatePlan.integration.spec.ts` running the real orchestrator against the actual 60-exercise seed (parsed by `__fixtures__/loadRealSeed.ts`, a test-only loader — not the production data path).
- [x] Four real bugs caught by that testing and fixed, all documented inline and in `docs/generator.md`/`docs/intake.md`: an `rng.ts` hash-collision bug caught before it shipped; two of eight ladder floors (squat, horizontal_pull) wrongly required equipment with nothing to regress to, fixed in the seed; the `'skill'` goal's low-rep prescription was wrongly applied to every pattern instead of just the skill slot; a peak-volume week's known, accepted budget overage wasn't reconciled between `weekPlan.ts` and `validate.ts`, causing the validator to flag a trade-off already decided elsewhere.
- [x] **Known, accepted content gap** (not a bug): `vertical_pull`'s floor exercise (`dead_hang`) is the one ladder floor that genuinely needs equipment — a pull-up bar — with no bodyweight-only entry point. Documented in the seed file, `docs/generator.md`, and here. Resolution: recommend a cheap doorway pull-up bar during equipment onboarding, same as real calisthenics programs do — not fabricated, unvetted exercise content invented under time pressure.

## Done (2026-08-28, continued) — intake flow

- [x] **Full 8-step intake flow, working end to end**: `src/lib/intake/` (energy.ts, macros.ts, safetyGates.ts, placement.ts, units.ts — all pure, all tested against the doc's worked example numbers), `src/stores/intake.ts`, 8 step components under `src/components/intake/`, wired through `generatePlan()` → Dexie → best-effort Supabase write → Dashboard/Workouts rendering. Manually driven in-browser start to finish; goal screen reproduces the doc's exact numbers (1930/2780/2380/2480/2480 kcal) live from real form input, and week 1→3→4 rep/set/peak progression renders correctly for a real generated plan.
- [x] **Movement library now loads client-side with no Supabase project**: `src/lib/devContentSeed.ts` + `src/generators/__fixtures__/parseMovementLibrarySeed.ts` (extracted from the test-only loader so both share one parser) seed Dexie from the actual seed SQL via a dev-only dynamic import, verified to add zero bytes to the production bundle (dead-code-eliminated behind `import.meta.env.DEV`).
- [x] **Real bug found via this UI work, fixed**: `parseMovementLibrarySeed` set `name = slug` for every content type (patterns, equipment, body regions, exercises) instead of capturing the actual name column — invisible to every prior test (none asserted on display-name content) until something actually rendered names on screen. Fixed with a regression test.
- [x] `src/lib/materializePlan.ts` — remaps `generatePlan()`'s synthetic "draft-" ids to real UUIDs before persisting; this is the first real caller of the contract that function's own header comment calls for.
- [x] Diet tags and allergens (step 7) use a documented placeholder reference list (`src/lib/intake/referenceData.ts`) — those tables aren't seeded yet (that's recipe-corpus work). Raw answers still land safely in `intake_responses.answers`; only the projection into `user_diet_tags`/`user_allergens` is deferred.

## Done (2026-08-28, continued) — recipe corpus

- [x] **200 recipes across 14 protein/base families, 30 cuisines** (`supabase/seed/002_food_reference.sql` + `00[3-9]_recipes_*.sql`/`01[0-6]_recipes_*.sql`). 150 ingredients, `is_pantry_staple` split so cuisine variety (dried spices/sauces, shelf-stable) is nearly free against the grocery-overlap objective, which only weighs perishables.
- [x] **Generate-from-source pipeline, not hand-written SQL**: `scripts/recipe-data/*.mjs` (14 family files, plain JS) are the source of truth; `npm run gen:recipes` (`scripts/generate-recipes.mjs`) computes real per-serving macros from each recipe's structured ingredients (`scripts/lib/ingredientIndex.mjs`, smoke-tested against hand-computed values) and emits the SQL — because hand-typing both an ingredient list and its derived macro cache for 200 recipes would drift.
- [x] Verification chain extended: `verify-food-reference.mjs` (macro consistency via a fiber-adjusted Atwater formula — a naive 4/4/9 formula wrongly flagged ~30 correct dried-spice/leafy-green values), `verify-recipes.mjs` (every recipe's stored macros cross-checked against independent recomputation, 200/200 match; scans step text against a garnish watchlist for ingredients mentioned but not structured — caught 2 real instances), `verify-corpus-overlap.mjs` (re-runs the overlap simulation against the REAL corpus, not synthetic data).
- [x] **Measured the overlap claim honestly**: real corpus delivers a 24% reduction in distinct non-staple ingredients for 7 dinners (22.7 → 17.1), not the 39% the synthetic model in the `calisthenics-recipe-corpus` memory predicted — because the real corpus's random baseline is already better (universal aromatics like onion/garlic appear in nearly every recipe), leaving less room for deliberate optimization to improve on. Still a real, useful reduction; reported as measured, not restated as the higher modeled figure.
- [x] Diet tags and allergens are now seeded for real — `src/lib/intake/referenceData.ts`'s placeholder list is superseded (see Next).

## Done (2026-08-28, continued) — meal plan generator

- [x] **Meal plan generator** (`src/generators/meal/`) — full pipeline implemented per `docs/mealgen.md`, mirroring the workout generator's shape: `filter.ts` (hard constraints + the §1 relaxation ladder), `grid.ts` (active-slot selection, dinner leftover planning), `allocate.ts` (§3 per-slot macro split), `scoring.ts` (§4-5 macroFit/overlapValue/recency/preference/variety floor), `assemble.ts` (§6 greedy fill + serving scale), `repair.ts` (§7 tolerance repair), `validate.ts` (post-hoc invariant checks), `library.ts` (`MealLibrary` index, mirrors `MovementLibrary`), `generateMealPlan.ts` (orchestrator plus `regenerateWeek`/`swapOneMeal` from §9). Barrel export at `src/generators/meal/index.ts`.
- [x] Food-domain types added to `src/types/domain.ts` (Aisle/Unit/Ingredient/IngredientUnit/Allergen/DietTag/Recipe/RecipeIngredient/RecipeStep/RecipeMealSlot/RecipeDietTag/MealPlan/MealPlanEntry/UserRecipeFeedback + the per-user preference join rows); Dexie bumped to `version(2)` in `db.ts` with the matching stores (grocery tables deliberately still deferred to a future v3 — that feature isn't built).
- [x] `devContentSeed.ts` extended to seed food-reference + recipes the same way it already seeds the movement library — gated independently per content domain (`ensureMovementLibrarySeeded`/`ensureFoodAndRecipesSeeded`) rather than one shared gate, so an existing dev install that already had the movement library seeded still picks up the newer food/recipe tables instead of silently skipping them.
- [x] **New portable SQL-seed parsers**, not a second hand-maintained content copy: `src/generators/__fixtures__/sqlParse.ts` (typed port of `scripts/lib/sqlParse.mjs`'s column-aware, quote/paren-safe row parser — needed because the food-reference seed uses different `insert into ingredients (...)` column lists in different blocks, which a fixed-position regex would misread), `parseFoodReferenceSeed.ts`, `parseRecipeSeed.ts`, and the test-only `loadRealFoodSeed.ts` — the same file→parser split as `loadRealSeed.ts`/`parseMovementLibrarySeed.ts`, so `devContentSeed.ts` (browser) and the integration test run the identical parsing logic.
- [x] `src/generators/workout/rng.ts` moved to `src/generators/shared/rng.ts` — the deterministic-seeding primitive both generators need, with nothing workout-specific in it.
- [x] 102 new tests (`npm test` total now 293), ~96% statement coverage on `src/generators/meal/**`: hand-built fixture (`__fixtures__/testMealLibrary.ts`, deliberately uneven ingredient counts to exercise the variety-floor relaxation path) for fast exact-value unit tests, plus `generateMealPlan.integration.spec.ts` running the real orchestrator (and `regenerateWeek`/`swapOneMeal`) against the actual 200-recipe corpus.
- [x] **Judgment calls the doc left unspecified, recorded in `docs/mealgen.md` rather than silently decided**: the scoring weights (only the variety floor had a tuned number), scoring against the best-achievable serving scale rather than a recipe's raw macros, `mealsPerDay` above 4 clamped with a warning (the schema only has 4 slot values per day), cook-time ceiling scoped to dinner+lunch with weekends always exempt, breakfast rotation fixed at 3.
- [x] **Real bug caught before it shipped, via a test failure, not user report**: the first `MealPlanEntry.servings` design doubled a fresh dinner's stored value when it had a leftover (to represent "the whole cooked batch"). This made a day's own macro total wrong on its OWN cooked night — summing `servings × kcalPerServing` for a repair check would have counted both nights' calories as eaten on the first one. Redefined `servings` to always mean "eaten in this entry" before repair.ts was even written, once the conflict became clear while designing it.
- [x] **Known limitation, documented rather than silently wrong**: `swapOneMeal` on a fresh dinner that has a leftover elsewhere in the week does not propagate the swap to that leftover — it still serves the old recipe, with an explicit warning surfaced. Not yet fixed.
- [x] Confirmed via production build + a bundle grep that none of the seed-parsing/food-reference/recipe content leaks into the shipped JS, same check as the recipe corpus milestone.

## Done (2026-08-29) — grocery list generation

- [x] **Grocery list generation** (`docs/mealgen.md` §8), implementing all 7 steps: `src/generators/meal/groceryList.ts` (the pipeline: fresh-cook entries → scale by batch cooked → resolve grams → sum by ingredient → drop pantry/staples → friendliest display unit → sort by aisle) and `unitResolution.ts` (a typed client-side port of `scripts/lib/ingredientIndex.mjs`'s gram-resolution logic — mass/volume/count/override, same priority order). `GroceryList`/`GroceryItem` types added to `domain.ts`; Dexie bumped to `version(3)`.
- [x] **Real finding during implementation, recorded in `docs/mealgen.md` rather than left implicit**: with `MealPlanEntry.servings` always meaning "eaten in this entry" (the correction made while building the meal generator), summing every entry's ingredients independently — leftovers included — turns out to produce the exact same TOTAL MASS as correctly excluding leftovers and folding their servings into the parent's scale (the arithmetic is associative). Step 1 ("take fresh-cook entries only") therefore isn't preventing quantity inflation the way the doc originally framed it — it's protecting `sourceEntryIds` ATTRIBUTION (which meal caused the shopping trip), which still matters for a "why do I need this" explanation, just not for the reason first assumed.
- [x] 24 new tests (317 total): `unitResolution.spec.ts` (mass/volume/count/override resolution, hand-built objects), `groceryList.spec.ts` (pantry-staple exclusion, user-pantry exclusion, leftover attribution, aisle sort, display-unit selection), plus 3 tests in `generateMealPlan.integration.spec.ts` against the real 200-recipe corpus — including one asserting ZERO gram-resolution warnings across a full real week, which is real cross-implementation evidence this TS port agrees with the Node-side authoring logic, not just that neither happens to crash.
- [x] Confirmed via production build + bundle grep that none of this leaks into the shipped JS either; bundle size essentially unchanged (pure logic, no new content).

## Next

- [ ] Wire `MealsView.vue`/`GroceryView.vue` (currently placeholders) to call `generateMealPlan()`/`buildGroceryList()` → Dexie, mirroring how `IntakeView.vue` already wires the workout generator. This is the first UI consumer of the whole meal-generation side of the app.
- [ ] Fix `swapOneMeal`'s known limitation (propagate a swap to its leftover).
- [ ] Wire `StepKitchen.vue` (intake step 7) to read real `diet_tags`/`allergens` from Dexie instead of the hardcoded list in `src/lib/intake/referenceData.ts`.
- [ ] Consider adding an intake question for cooking-skill ceiling (`recipes.difficulty`) — `generateMealPlan`'s `skillCeiling` input currently always defaults to 3 (no filtering) since nothing asks the question yet.
- [ ] **Real Supabase → Dexie content sync**, replacing `devContentSeed.ts`'s dev-only fallback — see that file's own TODO. Also unblocks profile/auth (`IntakeView.vue` currently falls back to a hardcoded `'local-dev-user'` id when nobody's signed in).
- [ ] Auth UI (sign in / sign up) — nothing exists yet; every write today is scoped to whatever `session.session?.user.id` happens to be, or the local-dev fallback.
- [ ] The placement rep-tests (step 5) are unit-tested but not yet driven through a full manual browser pass — the E2E verification so far used the "skip" path. Worth a manual run through the branching questions specifically.
- [ ] Consider a live USDA FoodData Central verification pass on the 150 seeded ingredients — current macro values are standard/well-established figures from training knowledge, not individually looked up live (see `002_food_reference.sql`'s header comment for the reasoning). Not currently a known problem, just an open follow-up.
- [ ] Replace the placeholder icons (`scripts/generate-placeholder-icons.mjs`, `public/favicon.svg`) with real app icon design.

## Later / explicitly deferred

- Capacitor wrap for iOS/Android (the codebase is built to make this a packaging step — see README "Why this stack" — but there's no reason to do it before the web app actually works end to end)
- Push notifications
- Native health integration (HealthKit / Google Fit)
- Food logging, barcode scanning, social features, user-submitted recipes — see `docs/schema.md` "deliberately absent from v1"

## Notes for whoever (or whichever agent) picks this up next

- Read `docs/*.md` before touching schema, intake, or either generator — they carry the reasoning, not just the shape, and several non-obvious decisions (goal asked last, variety floor of 2, the block sliding on missed sessions, isometrics needing their own metric type, `MealPlanEntry.servings` always meaning "eaten in this entry" even for a fresh dinner with a leftover) will look like bugs if you don't know why they're there.
- The Claude memory files `calisthenics-app*` and `calisthenics-recipe-corpus` (if you have access to them) carry the same context and a few things `docs/` doesn't — notably the recipe corpus sizing rationale.
- `npm run verify` before committing anything that touches `supabase/` or `src/generators/`.
