# Groundwork

A calisthenics + nutrition planning app. Answer a questionnaire once; get a personalised bodyweight training plan and weekly meal plans that regenerate on demand and collapse into a grocery checklist.

Design docs (the actual specs — read these before changing behaviour, not just this README):

- [`docs/schema.md`](docs/schema.md) — the data model and why it's shaped this way
- [`docs/intake.md`](docs/intake.md) — questionnaire → calorie target → macro split → ladder placement
- [`docs/generator.md`](docs/generator.md) — the workout generator and promotion engine
- [`docs/mealgen.md`](docs/mealgen.md) — the meal plan generator (not yet implemented)

See [`TASKS.md`](TASKS.md) for current status and what's next — that file is the living plan; this README doesn't try to also be one.

## Why this stack

Built as a plain SPA with mobile in mind from day one, so a Capacitor port to iOS/Android later is a packaging step, not a rewrite. The constraints that keep that door open:

- **No SSR, ever.** Static build output only.
- **One API client** ([`src/lib/supabase.ts`](src/lib/supabase.ts)) — never call `fetch` against a relative path elsewhere. Inside a Capacitor webview the origin is `capacitor://localhost`, so a relative URL silently breaks on-device.
- **One storage wrapper** ([`src/lib/storage.ts`](src/lib/storage.ts)) — swaps to Capacitor Preferences later without touching call sites.
- **IndexedDB via Dexie** ([`src/lib/db.ts`](src/lib/db.ts)) as the client-side cache, not SQLite — works identically in a browser tab and a Capacitor webview.
- **Both plan generators are deterministic pure functions**, not LLM calls — same seed always produces the same plan, no network required, "regenerate" costs nothing. See `docs/generator.md` and `docs/mealgen.md`.

| Layer | Choice |
|---|---|
| Frontend | Vue 3 + Vite (SPA), Vue Router, Pinia |
| Styling | Tailwind v4 (CSS-first config, see `src/style.css`) |
| Offline | `vite-plugin-pwa`, IndexedDB (Dexie) |
| Backend | Supabase (Postgres + Auth + Row-Level Security) |
| Mobile (later) | Capacitor — same codebase, native build |

## Getting started

```bash
npm install
npm run dev
```

Runs against a placeholder Supabase client until you configure a real project (see below) — the UI shell renders, but any Supabase call will fail. That's intentional: `src/lib/supabase.ts` warns loudly in the console rather than crashing the app at boot.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in your project's URL (no `/rest/v1/` suffix — just the bare `https://<ref>.supabase.co` origin) and its **publishable key** (Project Settings → API). Supabase's newer projects split this page into a `sb_publishable_...` key (safe client-side, RLS-protected — this is the one you want) and a `sb_secret_...` key (server-only, bypasses RLS entirely — never put this in a `VITE_*` var, it ships straight into the client bundle). Older projects instead show a JWT-format `anon` key, which works the same way.
3. Run every file in [`supabase/migrations/`](supabase/migrations) against it, in order.
4. Run every file in [`supabase/seed/`](supabase/seed) once, after the migrations, **in numeric order** (`001_movement_library.sql` through `016_recipes_yogurt.sql` — the recipe files depend on `002_food_reference.sql`'s ingredients/aisles/units existing first). None of them are idempotent by design — a second run should fail loudly on the unique slug constraints, not silently duplicate content.

   **Use the CLI, not the SQL Editor's paste box, for both of the above.** These files are large and comment-heavy with real em-dashes/accented characters in both comments and actual string literals (recipe instructions, exercise cues); pasting them into Supabase Studio's SQL editor has reliably mangled non-ASCII characters and silently truncated anything past a couple hundred lines, in ways that produce confusing, unrelated-looking syntax errors rather than an obvious "your paste got cut off." The CLI reads the file's bytes straight off disk and sends them over the Management API, sidestepping the browser/clipboard entirely:
   ```bash
   npx supabase login   # or: set SUPABASE_ACCESS_TOKEN to a token from
                         # supabase.com/dashboard/account/tokens — required
                         # anyway for non-interactive shells (CI, agents)
   npx supabase link --project-ref <ref>
   npx supabase db query --linked --file supabase/migrations/0001_extensions.sql
   # ...repeat in numeric order for every migration, then every seed file
   ```
   A single `supabase db push` (once linked) also works for the migrations specifically, since those are tracked; the seed files aren't part of that mechanism and need `db query --file` regardless.
5. Optional but recommended once the project exists: regenerate `src/types/database.ts` for real Supabase typing —
   ```bash
   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
   ```
   Until then, application code should import types from [`src/types/domain.ts`](src/types/domain.ts) (hand-authored, matches the migrations) rather than the Supabase-generated type.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `vue-tsc`, no emit |
| `npm run test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with coverage (configured for `src/generators/**`) |
| `npm run verify:sql` | Static-checks every migration and seed file — see below |
| `npm run verify` | typecheck + verify:sql + test, in that order |

### Why `verify:sql` exists

There's no local Postgres in this dev environment, so `scripts/verify-sql.mjs` and `scripts/verify-movement-graph.mjs` substitute for actually running the SQL: every `references` target resolves, every RLS-enabled table has a policy, every check-constraint value used in the seed data is legal, every slug a seed file looks up was actually inserted, and the movement library forms clean, gap-free, non-branching progression chains (60 exercises, 52 edges, verified counts). It's a linter, not a database — run the real thing (`supabase db reset` or equivalent) once a project exists, and keep running `npm run verify:sql` after any migration/seed edit in the meantime.

## Project structure

```
src/
  components/nav/   BottomNav — bottom tabs, not top nav (see docs/schema.md stack rationale)
  generators/       workout/, meal/ — pure functions, not yet implemented (see TASKS.md)
  lib/              supabase client, storage wrapper, Dexie cache — the mobile-forward layer
  stores/           Pinia stores (session/auth so far)
  types/            domain.ts (hand-authored, source of truth for app code),
                     database.ts (placeholder for `supabase gen types`)
  views/            one per bottom-nav tab, currently placeholders
supabase/
  migrations/       numbered, applied in order — the actual schema
  seed/             content data (movement library so far)
scripts/            SQL verification (see above) + placeholder icon generation
docs/               the specs — read before implementing
```
