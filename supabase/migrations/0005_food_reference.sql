-- Groundwork schema — migration 0005: food reference
-- See docs/schema.md section 4. Recipe ingredients are structured references
-- resolving to grams here — never free text. This is what makes grocery
-- aggregation possible at all.

create table aisles (
  id         smallserial primary key,
  slug       text unique not null,
  name       text not null,
  sort_order smallint not null
);

create table units (
  id          smallserial primary key,
  slug        text unique not null,
  name        text not null,
  dimension   text not null check (dimension in ('mass', 'volume', 'count')),
  base_factor numeric(12, 6) not null
);

create table ingredients (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  aisle_id         smallint not null references aisles,
  density_g_per_ml numeric(6, 3),
  grams_per_each   numeric(8, 2),
  kcal_per_100g    numeric(7, 2) not null,
  protein_per_100g numeric(6, 2) not null,
  carb_per_100g    numeric(6, 2) not null,
  fat_per_100g     numeric(6, 2) not null,
  fiber_per_100g   numeric(6, 2),
  fdc_id           int,
  is_pantry_staple boolean not null default false,
  is_active        boolean not null default true
);

-- Exact overrides beat density. 1 cup flour = 120 g, 1 clove garlic = 3 g.
create table ingredient_units (
  ingredient_id uuid not null references ingredients on delete cascade,
  unit_id       smallint not null references units,
  grams         numeric(8, 2) not null,
  primary key (ingredient_id, unit_id)
);

create table allergens (
  id   smallserial primary key,
  slug text unique not null,
  name text not null
);

-- Allergens live on INGREDIENTS. Recipe allergens are derived, never
-- hand-tagged — see docs/schema.md section 4 for why.
create table ingredient_allergens (
  ingredient_id uuid not null references ingredients on delete cascade,
  allergen_id   smallint not null references allergens,
  primary key (ingredient_id, allergen_id)
);

create index on ingredients (aisle_id) where is_active;
