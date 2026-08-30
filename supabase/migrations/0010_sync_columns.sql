-- Groundwork schema — migration 0010: sync columns
-- See docs/schema.md "Offline sync rules": `updated_at` on everything
-- syncable, via trigger not application code — delta/merge sync reads it to
-- decide which side of a conflict wins. Every OTHER table already has the
-- column, but nothing anywhere had a trigger yet: `updated_at default now()`
-- alone only ever fires at INSERT, never bumps on UPDATE. `deleted_at` is
-- deliberately not touched here — it already exists exactly where the app's
-- own logic does real removals (workout_logs, grocery_lists, grocery_items);
-- nothing else in the current codebase ever hard-deletes a row.

alter table user_targets add column updated_at timestamptz not null default now();
alter table workout_plans add column updated_at timestamptz not null default now();
alter table set_logs add column updated_at timestamptz not null default now();
alter table meal_plan_entries add column updated_at timestamptz not null default now();

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Every client-writable table that carries an updated_at column, including
-- the 4 just added above. Deliberately NOT applied to plan_sessions/
-- plan_items (generated once, never updated after — see docs/schema.md
-- section 3), intake_responses (append-only by design, own comment says
-- so), body_metrics (no updated_at, nothing in the app writes it yet), or
-- any content table (never client-writable at all).
create trigger set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger set_updated_at before update on user_targets
  for each row execute function set_updated_at();
create trigger set_updated_at before update on workout_plans
  for each row execute function set_updated_at();
create trigger set_updated_at before update on workout_logs
  for each row execute function set_updated_at();
create trigger set_updated_at before update on set_logs
  for each row execute function set_updated_at();
create trigger set_updated_at before update on user_exercise_levels
  for each row execute function set_updated_at();
create trigger set_updated_at before update on meal_plans
  for each row execute function set_updated_at();
create trigger set_updated_at before update on meal_plan_entries
  for each row execute function set_updated_at();
create trigger set_updated_at before update on user_recipe_feedback
  for each row execute function set_updated_at();
create trigger set_updated_at before update on grocery_lists
  for each row execute function set_updated_at();
create trigger set_updated_at before update on grocery_items
  for each row execute function set_updated_at();
