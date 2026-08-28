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

## Next

- [ ] **Intake flow** (`IntakeView.vue` + a form-state store) — the 8 steps from `docs/intake.md`, goal asked last, progressive validation. The energy-math and macro functions (BMR/TDEE/goal→kcal/macro split) are pure and worth writing and testing independently of the UI.
- [ ] **Recipe corpus** — ~200 recipes, authored in ingredient families (not spread across every cuisine) so the overlap objective in `docs/mealgen.md` has something real to work with. See the `calisthenics-recipe-corpus` memory for the full authoring rules (structured ingredients only, allergens derived from ingredients not hand-tagged on recipes, macros verified against USDA FoodData Central).
- [ ] **Meal plan generator** (`src/generators/meal/`) — implement `docs/mealgen.md` once the corpus exists in a seedable form. Needs the food-domain tables added to `src/types/domain.ts` and a Dexie `version(2)` bump in `db.ts`.
- [ ] Wire `IntakeView` → generator → Supabase write → Dexie cache, end to end, for one real user.
- [ ] Replace the placeholder icons (`scripts/generate-placeholder-icons.mjs`, `public/favicon.svg`) with real app icon design.

## Later / explicitly deferred

- Capacitor wrap for iOS/Android (the codebase is built to make this a packaging step — see README "Why this stack" — but there's no reason to do it before the web app actually works end to end)
- Push notifications
- Native health integration (HealthKit / Google Fit)
- Food logging, barcode scanning, social features, user-submitted recipes — see `docs/schema.md` "deliberately absent from v1"

## Notes for whoever (or whichever agent) picks this up next

- Read `docs/*.md` before touching schema, intake, or either generator — they carry the reasoning, not just the shape, and several non-obvious decisions (goal asked last, variety floor of 2, the block sliding on missed sessions, isometrics needing their own metric type) will look like bugs if you don't know why they're there.
- The Claude memory files `calisthenics-app*` and `calisthenics-recipe-corpus` (if you have access to them) carry the same context and a few things `docs/` doesn't — notably the recipe corpus sizing rationale.
- `npm run verify` before committing anything that touches `supabase/` or `src/generators/`.
