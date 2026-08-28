-- Groundwork schema — migration 0009: row-level security
-- See docs/schema.md section 8. The SPA talks to Postgres directly, so RLS
-- *is* the authorisation layer — there is no server to forget a
-- `where user_id = ...` clause in.

-- ── profiles: special case, pk IS the auth.users id ──────────────────────
alter table profiles enable row level security;
create policy owner_all on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- ── directly user-owned tables (have a user_id column) ───────────────────
alter table body_metrics enable row level security;
create policy owner_all on body_metrics for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table intake_responses enable row level security;
create policy owner_all on intake_responses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_targets enable row level security;
create policy owner_all on user_targets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_equipment enable row level security;
create policy owner_all on user_equipment for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_limitations enable row level security;
create policy owner_all on user_limitations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table workout_plans enable row level security;
create policy owner_all on workout_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table workout_logs enable row level security;
create policy owner_all on workout_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_exercise_levels enable row level security;
create policy owner_all on user_exercise_levels for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_allergens enable row level security;
create policy owner_all on user_allergens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_diet_tags enable row level security;
create policy owner_all on user_diet_tags for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_disliked_ingredients enable row level security;
create policy owner_all on user_disliked_ingredients for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_pantry enable row level security;
create policy owner_all on user_pantry for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table meal_plans enable row level security;
create policy owner_all on meal_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_recipe_feedback enable row level security;
create policy owner_all on user_recipe_feedback for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table grocery_lists enable row level security;
create policy owner_all on grocery_lists for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── child tables: reach up to the parent rather than duplicating user_id ──
alter table plan_sessions enable row level security;
create policy owner_all on plan_sessions for all using (
  exists (
    select 1 from workout_plans p
    where p.id = plan_sessions.plan_id and p.user_id = auth.uid()
  )
);

alter table plan_items enable row level security;
create policy owner_all on plan_items for all using (
  exists (
    select 1 from plan_sessions s
    join workout_plans p on p.id = s.plan_id
    where s.id = plan_items.session_id and p.user_id = auth.uid()
  )
);

alter table set_logs enable row level security;
create policy owner_all on set_logs for all using (
  exists (
    select 1 from workout_logs w
    where w.id = set_logs.workout_log_id and w.user_id = auth.uid()
  )
);

alter table meal_plan_entries enable row level security;
create policy owner_all on meal_plan_entries for all using (
  exists (
    select 1 from meal_plans m
    where m.id = meal_plan_entries.meal_plan_id and m.user_id = auth.uid()
  )
);

alter table grocery_items enable row level security;
create policy owner_all on grocery_items for all using (
  exists (
    select 1 from grocery_lists l
    where l.id = grocery_items.list_id and l.user_id = auth.uid()
  )
);

-- ── content tables: readable by anyone signed in, written only by the ────
-- ── service role (migrations / an authoring tool), never by the client ───
alter table movement_patterns enable row level security;
create policy read_all on movement_patterns for select to authenticated using (true);

alter table exercises enable row level security;
create policy read_all on exercises for select to authenticated using (is_active);

alter table progression_edges enable row level security;
create policy read_all on progression_edges for select to authenticated using (true);

alter table equipment enable row level security;
create policy read_all on equipment for select to authenticated using (true);

alter table exercise_equipment enable row level security;
create policy read_all on exercise_equipment for select to authenticated using (true);

alter table body_regions enable row level security;
create policy read_all on body_regions for select to authenticated using (true);

alter table exercise_contraindications enable row level security;
create policy read_all on exercise_contraindications for select to authenticated using (true);

alter table aisles enable row level security;
create policy read_all on aisles for select to authenticated using (true);

alter table units enable row level security;
create policy read_all on units for select to authenticated using (true);

alter table ingredients enable row level security;
create policy read_all on ingredients for select to authenticated using (is_active);

alter table ingredient_units enable row level security;
create policy read_all on ingredient_units for select to authenticated using (true);

alter table allergens enable row level security;
create policy read_all on allergens for select to authenticated using (true);

alter table ingredient_allergens enable row level security;
create policy read_all on ingredient_allergens for select to authenticated using (true);

alter table recipes enable row level security;
create policy read_all on recipes for select to authenticated using (is_active);

alter table recipe_ingredients enable row level security;
create policy read_all on recipe_ingredients for select to authenticated using (true);

alter table recipe_steps enable row level security;
create policy read_all on recipe_steps for select to authenticated using (true);

alter table recipe_meal_slots enable row level security;
create policy read_all on recipe_meal_slots for select to authenticated using (true);

alter table diet_tags enable row level security;
create policy read_all on diet_tags for select to authenticated using (true);

alter table recipe_diet_tags enable row level security;
create policy read_all on recipe_diet_tags for select to authenticated using (true);
