# Schema

The actual DDL lives in [`supabase/migrations/`](../supabase/migrations) (applied in filename order) and the movement library content in [`supabase/seed/001_movement_library.sql`](../supabase/seed/001_movement_library.sql). This document is the rationale layer — *why* the schema is shaped the way it is — not a copy of the SQL. If this doc and the migrations ever disagree, the migrations win; fix this doc to match.

Full design version with diagrams: https://claude.ai/code/artifact/5e2e6669-9cb4-4024-9720-e0e01bec2d13 (private link, not guaranteed to stay in sync — this file is the source of truth for anyone without access to it).

## Conventions

- **Content vs. user data.** `exercises`, `recipes`, `ingredients` etc. are content — authored once, read by every signed-in user, never written from the client. Integer/slug keys, RLS is read-only. Anything scoped to a person gets `uuid` keys and full RLS.
- **UUIDs on anything the client can write.** An offline client creates a grocery item or logs a set with no network, then syncs later. Sequences can't do that without a collision.
- **Three layers, never collapsed.** A *template* (what the generator produced) → a *prescription* (what a session says to do) → a *log* (what actually happened) are separate rows. Merge them and you can't answer "am I progressing?" six weeks later.
- **Store canonical, display friendly.** Mass in grams, nutrition per 100g, every generated plan carries the `seed` and `generator_version` that produced it. Conversion happens at render time, never in storage.

## Domain map

| Cluster | Tables | Kind |
|---|---|---|
| Identity | `profiles`, `body_metrics`, `intake_responses`, `user_targets` | per-user |
| Movement library | `movement_patterns`, `exercises`, `progression_edges`, `equipment`, `exercise_equipment`, `user_equipment`, `body_regions`, `exercise_contraindications`, `user_limitations` | content + per-user |
| Training | `workout_plans`, `plan_sessions`, `plan_items`, `workout_logs`, `set_logs`, `user_exercise_levels` | per-user |
| Food & recipes | `aisles`, `units`, `ingredients`, `ingredient_units`, `allergens`, `ingredient_allergens`, `diet_tags`, `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_meal_slots`, `recipe_diet_tags` + 4 user-preference tables | content + per-user |
| Planning & shopping | `meal_plans`, `meal_plan_entries`, `user_recipe_feedback`, `grocery_lists`, `grocery_items` | per-user |

The two spines (training, nutrition) meet only at `profiles`/`user_targets`, which is what lets them be built and shipped independently.

## Section notes

**Identity (`0002_identity.sql`).** Questionnaire answers are stored twice on purpose: raw answers in `intake_responses` as append-only versioned JSONB (the questionnaire will be rewritten many times; append-only means an improved generator can re-run against everyone's original answers), and the *derived* typed projection in `user_targets` that the generators actually query. `sex_at_birth` exists purely as a physiological input to BMR estimation (see [intake.md](intake.md)) — keep it separate from anything user-facing, allow `unspecified`.

**Movement library (`0003_movement_library.sql`).** The real IP of the app. Modelled as `(pattern_id, level)` for the generator to walk, plus an explicit `progression_edges` table for branches — a single `next_exercise_id` column can't express a fork (e.g. full push-up → either archer or pseudo-planche track). `metric_type` (`reps` / `time_seconds` / `distance_m`) exists because isometrics (planks, hangs, L-sits) and holds don't have reps — assume reps everywhere and roughly a third of the library breaks. `distance_min_m`/`distance_max_m` cover handstand-walk-style exercises (added after the original draft shipped `distance_m` as an allowed `metric_type` with no columns to back it — a real bug, fixed before the seed data needed it).

**Training (`0004_training.sql`).** `plan_sessions.day_index` is an **order within the block, not a weekday** — missed sessions slide the block rather than sticking to a calendar (decided 2026-08-27). Every date shown in the UI derives from `workout_logs.performed_at`, never from `starts_on` + arithmetic. `week_type` (`build`/`peak`/`deload`) drives the week-4 branch in the generator — see [generator.md](generator.md#6-week-to-week). `set_logs.exercise_id` is denormalised from `plan_items` deliberately: people substitute mid-session, and the log has to record what actually happened.

**Food reference (`0005_food_reference.sql`).** Recipe ingredients are structured references (`{ingredient_id, quantity, unit_id}`), never free text — the moment an ingredient is the string `"2 cloves garlic"`, grocery aggregation is dead. `ingredient_units` holds exact volume→mass overrides (1 cup flour ≠ 1 cup water); `density_g_per_ml` is the fallback. Allergens attach to **ingredients**, never recipes — tag sesame oil once, every recipe using it is correctly flagged forever; hand-tagging 300 recipes gets it wrong, and that's the one bug here that can put someone in hospital. `is_pantry_staple` keeps grocery lists from opening with salt and olive oil every week.

**Recipes (`0006_recipes.sql`).** Per-serving macros are computed from `recipe_ingredients` then denormalised onto `recipes` — recompute on save, treat the stored value as a single-writer cache. The meal planner evaluates hundreds of candidates per generation; joining and summing every time is the difference between an instant regenerate and a spinner. Diet tags (vegetarian, vegan…) are hand-tagged, not derived — inference gets stock/broth wrong too often.

**Meal plans (`0007_meal_plans.sql`).** `meal_plan_entries.is_locked` survives a "regenerate week" — pin the three dinners that worked, reroll the rest. `leftover_of_id` is a self-reference letting one cook serve two entries (Sunday's chilli, eaten again Tuesday). `user_recipe_feedback` does three jobs in one row: `never` is a hard exclude, `loved` raises selection weight, `last_served_on` is the variety cooldown.

**Grocery (`0008_grocery.sql`).** Its own table, not a view — must stay editable and checkable with zero network once generated. `aisle_id` is copied onto each item (not joined through `ingredients`) so the list sorts correctly straight from the offline cache with no joins — exactly the situation in the produce aisle. `source_entry_ids` answers "why is this on my list?" and lets skipping a meal subtract the right amounts instead of forcing a full regenerate.

**RLS (`0009_rls.sql`).** Because the SPA talks to Postgres directly, RLS *is* the authorisation layer — there's no server to forget a `where user_id =` clause in. Child tables (`plan_items`, `set_logs`, `meal_plan_entries`, `grocery_items`) reach up to their parent's `user_id` via `exists (...)` rather than duplicating the column.

## Offline sync rules

These aren't columns you'll find called out elsewhere, so they're listed here explicitly:

- **`updated_at` on everything syncable**, via trigger not application code. Delta sync is `where updated_at > :last_sync`.
- **`deleted_at`, never a hard `DELETE`**, on anything the client caches. A hard delete is invisible to a delta sync — the row just stops appearing, and the client keeps showing it forever. The single most common offline-sync bug, and it costs one column to avoid.
- **Content tables never ship in the app bundle.** They sync down to IndexedDB (see [`src/lib/db.ts`](../src/lib/db.ts)) on first run. Bundling them means an App Store review cycle to fix a recipe typo.
- **Client-generated UUIDs** let a grocery check-off or a logged set happen in airplane mode and reconcile later. Last-write-wins on `updated_at` is fine here — no shared documents, so genuine conflicts are rare and low-stakes.

## Open questions

| Question | Status |
|---|---|
| Missed sessions | **Decided 2026-08-27: the block slides.** See `plan_sessions.day_index` note above. |
| Recipe corpus size | ~200 recipes is the floor for a year of non-repeating dinners; below ~80 the variety cooldown fights the macro constraints. See the `calisthenics-recipe-corpus` memory. |
| Snacks in the plan | Real recipes vs. a flexible calorie allowance — affects whether a snack slot always needs its own recipe once selected. Still open. |
| Multiple grocery lists per plan | Schema already allows it (`grocery_lists.meal_plan_id`); UI hasn't decided whether to expose it. |

**Deliberately absent from v1:** food logging, barcode scanning, wearable/HealthKit sync, social features, user-submitted recipes, self-hosted exercise video. None of these constrain the schema above.
