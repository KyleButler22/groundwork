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

## Next

- [ ] **Workout generator** (`src/generators/workout/`) — implement `docs/generator.md` as pure TypeScript functions: split selection, slot-filling, the reserve-then-distribute time budget, the promotion engine, per-decision seeding (`hash(seed, week, day, slot)`, not a stream). Test against the seeded movement library — the graph-shape guarantees `verify-movement-graph.mjs` checks (one entry, one ceiling, no gaps) are exactly what the generator gets to assume.
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
