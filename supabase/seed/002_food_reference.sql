-- Groundwork seed — food reference (aisles, units, ingredients, allergens, diet tags)
-- Content data: authored once, read by every user (see docs/schema.md conventions).
--
-- THE RULE THAT MAKES CUISINE VARIETY NEARLY FREE FOR THE GROCERY LIST:
-- is_pantry_staple = true for anything SHELF-STABLE (dried spices, bottled
-- sauces, oils, vinegars, baking staples, bulk dry grains) — the stuff
-- that differentiates an Indian dish from a Mexican dish from a Chinese
-- dish, bought in bulk, rarely the reason for a grocery trip.
-- is_pantry_staple = false for anything PERISHABLE (proteins, fresh
-- produce, dairy, fresh herbs, bread/tortillas/naan) — bought weekly, and
-- exactly what the meal generator's overlap objective (docs/mealgen.md
-- §5) should be minimising across a week's recipes.
-- This is why the 14 recipe families (see the per-family seed files) can
-- each span 3-4 cuisines without hurting the grocery list: the shared
-- anchor is the perishable protein/produce; the cuisine identity lives
-- almost entirely in the staple layer, which the scoring function ignores.
--
-- Ingredient macros are standard, well-established USDA-typical values
-- for whole/generic foods (chicken breast, olive oil, white rice, etc.) —
-- not looked up live against FoodData Central per ingredient, which would
-- cost hundreds of tool calls for numbers that are already extremely
-- stable and well-documented. fdc_id is left null throughout; a live
-- verification pass against FDC is a reasonable follow-up (see TASKS.md)
-- but not a blocker for shipping a nutritionally-reasonable v1.
--
-- Run after 0001-0009 migrations and 001_movement_library.sql.

-- ── aisles ───────────────────────────────────────────────────────────────
insert into aisles (slug, name, sort_order) values
  ('produce',        'Produce',                 1),
  ('meat_seafood',   'Meat & Seafood',          2),
  ('dairy_eggs',     'Dairy & Eggs',            3),
  ('bakery',         'Bakery',                  4),
  ('dry_goods',      'Rice, Pasta & Grains',    5),
  ('canned_goods',   'Canned & Jarred Goods',   6),
  ('condiments',     'Condiments & Sauces',     7),
  ('spices',         'Spices & Seasonings',     8),
  ('baking',         'Baking',                  9),
  ('frozen',         'Frozen',                 10),
  ('other',          'Other',                  11);

-- ── units ────────────────────────────────────────────────────────────────
-- base_factor: grams for mass, millilitres for volume, 1 for count (count
-- units always need an ingredient_units override or grams_per_each — see
-- below — since "1 clove" has no universal weight the way 1 kg always does).
insert into units (slug, name, dimension, base_factor) values
  ('g',      'gram',        'mass',   1),
  ('kg',     'kilogram',    'mass',   1000),
  ('oz',     'ounce',       'mass',   28.3495),
  ('lb',     'pound',       'mass',   453.592),
  ('ml',     'millilitre',  'volume', 1),
  ('l',      'litre',       'volume', 1000),
  ('tsp',    'teaspoon',    'volume', 4.92892),
  ('tbsp',   'tablespoon',  'volume', 14.7868),
  ('cup',    'cup',         'volume', 236.588),
  ('fl_oz',  'fluid ounce', 'volume', 29.5735),
  ('each',   'each',        'count',  1),
  ('clove',  'clove',       'count',  1),
  ('slice',  'slice',       'count',  1),
  ('can',    'can',         'count',  1);

-- ── allergens (the 9 FDA major allergens — FASTER Act) ──────────────────
insert into allergens (slug, name) values
  ('milk',       'Milk'),
  ('eggs',       'Eggs'),
  ('fish',       'Fish'),
  ('shellfish',  'Shellfish'),
  ('tree_nuts',  'Tree nuts'),
  ('peanuts',    'Peanuts'),
  ('wheat',      'Wheat'),
  ('soy',        'Soy'),
  ('sesame',     'Sesame');

-- ── diet tags ────────────────────────────────────────────────────────────
insert into diet_tags (slug, name) values
  ('vegetarian',  'Vegetarian'),
  ('vegan',       'Vegan'),
  ('pescatarian', 'Pescatarian'),
  ('gluten_free', 'Gluten-free'),
  ('dairy_free',  'Dairy-free'),
  ('low_carb',    'Low-carb'),
  ('paleo',       'Paleo'),
  ('high_protein','High-protein');

-- ══════════════════════════════════════════════════════════════════════
-- INGREDIENTS — pantry staples first (shelf-stable, is_pantry_staple=true)
-- ══════════════════════════════════════════════════════════════════════

-- Oils, vinegars, condiments, sauces
insert into ingredients (slug, name, aisle_id, density_g_per_ml, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('olive_oil',        'Olive oil',              (select id from aisles where slug='condiments'), 0.916, 884, 0,   0,   100, 0,   true),
  ('vegetable_oil',    'Vegetable oil',          (select id from aisles where slug='condiments'), 0.920, 884, 0,   0,   100, 0,   true),
  ('sesame_oil',       'Sesame oil',             (select id from aisles where slug='condiments'), 0.920, 884, 0,   0,   100, 0,   true),
  ('soy_sauce',        'Soy sauce',              (select id from aisles where slug='condiments'), 1.030,  53, 8.1, 4.9, 0.6, 0.8, true),
  ('rice_vinegar',     'Rice vinegar',           (select id from aisles where slug='condiments'), 1.010,  18, 0,   0.3, 0,   0,   true),
  ('balsamic_vinegar', 'Balsamic vinegar',       (select id from aisles where slug='condiments'), 1.060,  88, 0.5, 17,  0,   0,   true),
  ('dijon_mustard',    'Dijon mustard',          (select id from aisles where slug='condiments'), 1.040, 66,  4.4, 5.3, 3.3, 3.3, true),
  ('honey',            'Honey',                  (select id from aisles where slug='condiments'), 1.420, 304, 0.3, 82,  0,   0.2, true),
  ('maple_syrup',      'Maple syrup',            (select id from aisles where slug='condiments'), 1.320, 260, 0,   67,  0,   0,   true),
  ('worcestershire_sauce','Worcestershire sauce',(select id from aisles where slug='condiments'), 1.100, 78,  0,   19,  0,   0,   true),
  ('hot_sauce',        'Hot sauce',              (select id from aisles where slug='condiments'), 1.000, 12,  0.5, 2.3, 0.4, 0.5, true),
  ('fish_sauce',       'Fish sauce',             (select id from aisles where slug='condiments'), 1.150,  35, 5.1, 3.6, 0,   0,   true),
  ('hoisin_sauce',     'Hoisin sauce',           (select id from aisles where slug='condiments'), 1.150, 220, 2.4, 44,  3.4, 1.3, true),
  ('oyster_sauce',     'Oyster sauce',           (select id from aisles where slug='condiments'), 1.200, 51,  1.4, 11,  0.3, 0.3, true),
  ('salsa',            'Salsa',                  (select id from aisles where slug='condiments'), 1.020, 36,  1.6, 7.6, 0.3, 1.8, true),
  ('tahini',           'Tahini',                 (select id from aisles where slug='condiments'), 0.960, 595, 17,  21,  54,  9.3, true),
  ('curry_paste',      'Red curry paste',        (select id from aisles where slug='condiments'), 1.100, 100, 2,   14,  4,   2,   true),
  ('tomato_paste',     'Tomato paste',           (select id from aisles where slug='canned_goods'),1.070, 82,  4.3, 19,  0.5, 4.1, true),
  ('peanut_butter',    'Peanut butter',          (select id from aisles where slug='condiments'), 1.090, 588, 25,  20,  50,  6,   true),
  ('bbq_sauce',        'BBQ sauce',              (select id from aisles where slug='condiments'), 1.130, 172, 0.7, 42,  0.4, 0.6, true),
  ('ranch_dressing',   'Ranch dressing',         (select id from aisles where slug='condiments'), 1.010, 430, 1,   6,   45,  0,   true),
  ('mayonnaise',       'Mayonnaise',             (select id from aisles where slug='condiments'), 0.910, 680, 1,   1,   75,  0,   true);

-- Shelf-stable canned/jarred staples (broth, olives, chiles — bought
-- occasionally in bulk and long-lived once in the pantry, same reasoning
-- as the bottled sauces above)
insert into ingredients (slug, name, aisle_id, density_g_per_ml, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('chicken_broth',    'Chicken broth',          (select id from aisles where slug='canned_goods'), 1.005,  4, 0.6, 0.3, 0.1, 0,   true),
  ('vegetable_broth',  'Vegetable broth',        (select id from aisles where slug='canned_goods'), 1.005,  3, 0.2, 0.6, 0,   0,   true),
  ('kalamata_olives',  'Kalamata olives',        (select id from aisles where slug='canned_goods'), 0.900, 115, 1,   6,   11,  3.2, true),
  ('green_chiles_canned','Canned diced green chiles',(select id from aisles where slug='canned_goods'),1.000, 20, 0.9, 4.7, 0.2, 1.1, true);

-- Dried spices & seasonings (this is the "cuisine identity" layer).
-- density_g_per_ml lets a recipe say "1 tsp cumin" naturally: ~0.45 g/ml
-- for fine ground powders (1 tsp ~= 2.2g, matching common spice-jar
-- labels), ~0.2 g/ml for flaky dried leaves (oregano, basil, thyme,
-- rosemary, red pepper flakes, italian seasoning — 1 tsp ~= 1g, much
-- lighter than a powder at the same volume because of the leaf structure).
insert into ingredients (slug, name, aisle_id, density_g_per_ml, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('salt',              'Salt',                    (select id from aisles where slug='spices'), 1.20, 0,   0,   0,   0,   0,   true),
  ('black_pepper',      'Black pepper',            (select id from aisles where slug='spices'), 0.45, 251, 10,  64,  3.3, 25,  true),
  ('garlic_powder',     'Garlic powder',           (select id from aisles where slug='spices'), 0.45, 331, 17,  73,  0.7, 9,   true),
  ('onion_powder',      'Onion powder',            (select id from aisles where slug='spices'), 0.45, 341, 10,  79,  1,   15,  true),
  ('cumin',             'Ground cumin',            (select id from aisles where slug='spices'), 0.45, 375, 18,  44,  22,  11,  true),
  ('chili_powder',      'Chili powder',            (select id from aisles where slug='spices'), 0.45, 282, 13,  50,  14,  35,  true),
  ('paprika',           'Paprika',                 (select id from aisles where slug='spices'), 0.45, 282, 14,  54,  13,  35,  true),
  ('smoked_paprika',    'Smoked paprika',          (select id from aisles where slug='spices'), 0.45, 282, 14,  54,  13,  35,  true),
  ('cayenne_pepper',    'Cayenne pepper',          (select id from aisles where slug='spices'), 0.45, 318, 12,  57,  17,  27,  true),
  ('garam_masala',      'Garam masala',            (select id from aisles where slug='spices'), 0.45, 379, 15,  55,  15,  22,  true),
  ('turmeric',          'Ground turmeric',         (select id from aisles where slug='spices'), 0.45, 354, 8,   65,  10,  21,  true),
  ('curry_powder',      'Curry powder',            (select id from aisles where slug='spices'), 0.45, 325, 14,  56,  14,  34,  true),
  ('coriander_ground',  'Ground coriander',        (select id from aisles where slug='spices'), 0.45, 298, 12,  55,  18,  42,  true),
  ('cinnamon',          'Ground cinnamon',         (select id from aisles where slug='spices'), 0.45, 247, 4,   81,  1.2, 53,  true),
  ('oregano_dried',     'Dried oregano',           (select id from aisles where slug='spices'), 0.20, 265, 9,   69,  4.3, 43,  true),
  ('basil_dried',       'Dried basil',             (select id from aisles where slug='spices'), 0.20, 233, 23,  48,  4,   38,  true),
  ('thyme_dried',       'Dried thyme',             (select id from aisles where slug='spices'), 0.20, 276, 9.1, 64,  7.4, 37,  true),
  ('rosemary_dried',    'Dried rosemary',          (select id from aisles where slug='spices'), 0.20, 331, 4.9, 64,  15,  43,  true),
  ('italian_seasoning', 'Italian seasoning',       (select id from aisles where slug='spices'), 0.20, 259, 10,  56,  6,   33,  true),
  ('red_pepper_flakes', 'Red pepper flakes',       (select id from aisles where slug='spices'), 0.20, 318, 12,  57,  17,  27,  true),
  ('bay_leaf',          'Bay leaves',              (select id from aisles where slug='spices'), 0.15, 313, 7.6, 75,  8.4, 26,  true),
  ('cardamom',          'Ground cardamom',         (select id from aisles where slug='spices'), 0.45, 311, 11,  68,  6.7, 28,  true),
  ('taco_seasoning',    'Taco seasoning',          (select id from aisles where slug='spices'), 0.45, 270, 8,   58,  4,   16,  true),
  ('everything_bagel_seasoning','Everything bagel seasoning',(select id from aisles where slug='spices'), 0.45, 450, 15, 20, 35, 10, true),
  ('five_spice',        'Chinese five-spice',      (select id from aisles where slug='spices'), 0.45, 345, 10,  67,  6,   30,  true),
  ('za_atar',           'Za''atar',                (select id from aisles where slug='spices'), 0.35, 380, 12,  40,  22,  20,  true);

-- Baking / bulk dry staples
insert into ingredients (slug, name, aisle_id, density_g_per_ml, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('all_purpose_flour', 'All-purpose flour', (select id from aisles where slug='baking'),    0.529, 364, 10,  76,  1,   2.7, true),
  ('cornstarch',        'Cornstarch',        (select id from aisles where slug='baking'),    0.541, 381, 0.3, 91,  0.1, 0.9, true),
  ('baking_powder',     'Baking powder',     (select id from aisles where slug='baking'),    0.900,  53, 0,   28,  0,   0.2, true),
  ('baking_soda',       'Baking soda',       (select id from aisles where slug='baking'),    0.900,   0, 0,   0,   0,   0,   true),
  ('vanilla_extract',   'Vanilla extract',   (select id from aisles where slug='baking'),    0.879, 288, 0.1, 13,  0.1, 0,   true),
  ('brown_sugar',       'Brown sugar',       (select id from aisles where slug='baking'),    0.930, 380, 0,   98,  0,   0,   true),
  ('white_sugar',       'White sugar',       (select id from aisles where slug='baking'),    0.845, 387, 0,   100, 0,   0,   true),
  ('panko_breadcrumbs', 'Panko breadcrumbs', (select id from aisles where slug='baking'),    0.220, 370, 12,  73,  3,   3,   true),
  ('cocoa_powder',      'Cocoa powder',      (select id from aisles where slug='baking'),    0.412, 228, 20,  58,  14,  33,  true),
  ('chia_seeds',        'Chia seeds',        (select id from aisles where slug='baking'),    0.680, 486, 17,  42,  31,  34,  true),
  ('walnuts',           'Walnuts',           (select id from aisles where slug='baking'),    0.450, 654, 15,  14,  65,  6.7, true),
  ('almonds',           'Almonds',           (select id from aisles where slug='baking'),    0.550, 579, 21,  22,  50,  12,  true),
  ('peanuts_roasted',   'Roasted peanuts',   (select id from aisles where slug='baking'),    0.600, 585, 24,  21,  50,  8.4, true),
  ('sesame_seeds',      'Sesame seeds',      (select id from aisles where slug='baking'),    0.580, 573, 18,  23,  50,  12,  true),
  ('rolled_oats',       'Rolled oats',       (select id from aisles where slug='dry_goods'), 0.340, 379, 13,  67,  6.5, 10,  true),
  ('white_rice',        'White rice',        (select id from aisles where slug='dry_goods'), 0.850, 130, 2.7, 28,  0.3, 0.4, true),
  ('brown_rice',        'Brown rice',        (select id from aisles where slug='dry_goods'), 0.800, 123, 2.7, 26,  1,   1.6, true),
  ('quinoa',            'Quinoa',            (select id from aisles where slug='dry_goods'), 0.700, 120, 4.4, 21,  1.9, 2.8, true),
  ('pasta_penne',       'Penne pasta',       (select id from aisles where slug='dry_goods'), 0.750, 131, 5,   25,  1.1, 1.8, true),
  ('spaghetti',         'Spaghetti',         (select id from aisles where slug='dry_goods'), 0.750, 131, 5,   25,  1.1, 1.8, true),
  ('rice_noodles',      'Rice noodles',      (select id from aisles where slug='dry_goods'), 0.700, 109, 0.9, 25,  0.2, 1,   true),
  ('couscous',          'Couscous',          (select id from aisles where slug='dry_goods'), 0.700, 112, 3.8, 23,  0.2, 1.4, true);

-- ══════════════════════════════════════════════════════════════════════
-- INGREDIENTS — perishables (proteins, produce, dairy, fresh bread)
-- ══════════════════════════════════════════════════════════════════════

-- Proteins & legumes (family anchors)
insert into ingredients (slug, name, aisle_id, grams_per_each, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('chicken_thigh',     'Boneless chicken thigh',  (select id from aisles where slug='meat_seafood'), 120, 209, 26,  0,   11,  0,   false),
  ('chicken_breast',    'Boneless chicken breast', (select id from aisles where slug='meat_seafood'), 175, 165, 31,  0,   3.6, 0,   false),
  ('ground_beef',       'Ground beef, 90/10',      (select id from aisles where slug='meat_seafood'), null,176, 20,  0,   10,  0,   false),
  ('beef_sirloin',      'Sirloin steak',           (select id from aisles where slug='meat_seafood'), null,183, 27,  0,   7.7, 0,   false),
  ('beef_flank_steak',  'Flank steak',             (select id from aisles where slug='meat_seafood'), null,192, 27,  0,   8.6, 0,   false),
  ('ground_turkey',     'Ground turkey, 93/7',     (select id from aisles where slug='meat_seafood'), null,150, 20,  0,   7.5, 0,   false),
  ('turkey_breast',     'Turkey breast cutlet',    (select id from aisles where slug='meat_seafood'), 150, 135, 30,  0,   1,   0,   false),
  ('pork_chop',         'Boneless pork chop',      (select id from aisles where slug='meat_seafood'), 150, 231, 25,  0,   14,  0,   false),
  ('pork_tenderloin',   'Pork tenderloin',         (select id from aisles where slug='meat_seafood'), null,143, 26,  0,   3.5, 0,   false),
  ('ground_pork',       'Ground pork',             (select id from aisles where slug='meat_seafood'), null,263, 17,  0,   21,  0,   false),
  ('salmon_fillet',     'Salmon fillet',           (select id from aisles where slug='meat_seafood'), 170, 208, 20,  0,   13,  0,   false),
  ('cod_fillet',        'Cod fillet',              (select id from aisles where slug='meat_seafood'), 170,  82, 18,  0,   0.7, 0,   false),
  ('tilapia_fillet',    'Tilapia fillet',          (select id from aisles where slug='meat_seafood'), 140,  96, 20,  0,   1.7, 0,   false),
  ('shrimp',            'Shrimp, peeled',          (select id from aisles where slug='meat_seafood'), null, 99, 24,  0.2, 0.3, 0,   false),
  ('tofu_firm',         'Firm tofu',               (select id from aisles where slug='dairy_eggs'),   null, 76, 8,   1.9, 4.8, 0.3, false),
  ('tempeh',            'Tempeh',                  (select id from aisles where slug='dairy_eggs'),   null,193, 19,  9.4, 11,  9,   false),
  ('egg',               'Egg',                     (select id from aisles where slug='dairy_eggs'),   50, 143, 13,  0.7, 9.5, 0,   false),
  ('greek_yogurt',      'Plain Greek yogurt',      (select id from aisles where slug='dairy_eggs'),   null, 59, 10,  3.6, 0.4, 0,   false),
  ('cottage_cheese',    'Cottage cheese',          (select id from aisles where slug='dairy_eggs'),   null, 98, 11,  3.4, 4.3, 0,   false),
  ('chickpeas_canned',  'Canned chickpeas',        (select id from aisles where slug='canned_goods'), null,164, 8.9, 27,  2.6, 7.6, false),
  ('lentils_dry',       'Dry lentils',             (select id from aisles where slug='dry_goods'),    null,353, 25,  60,  1.1, 11,  false),
  ('black_beans_canned','Canned black beans',      (select id from aisles where slug='canned_goods'), null,132, 8.9, 24,  0.5, 8.7, false),
  ('pinto_beans_canned','Canned pinto beans',      (select id from aisles where slug='canned_goods'), null,143, 9,   26,  0.6, 8,   false);

-- Produce
insert into ingredients (slug, name, aisle_id, grams_per_each, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('onion',            'Yellow onion',       (select id from aisles where slug='produce'), 150, 40,  1.1, 9.3, 0.1, 1.7, false),
  ('red_onion',        'Red onion',          (select id from aisles where slug='produce'), 150, 40,  1.1, 9.3, 0.1, 1.7, false),
  ('garlic',           'Garlic',             (select id from aisles where slug='produce'), null,149, 6.4, 33,  0.5, 2.1, false),
  ('ginger',           'Fresh ginger',       (select id from aisles where slug='produce'), null, 80, 1.8, 18,  0.8, 2,   false),
  ('bell_pepper_red',  'Red bell pepper',    (select id from aisles where slug='produce'), 150, 31,  1,   6,   0.3, 2.1, false),
  ('bell_pepper_green','Green bell pepper',  (select id from aisles where slug='produce'), 150, 20,  0.9, 4.6, 0.2, 1.7, false),
  ('tomato',           'Tomato',             (select id from aisles where slug='produce'), 125, 18,  0.9, 3.9, 0.2, 1.2, false),
  ('cherry_tomatoes',  'Cherry tomatoes',    (select id from aisles where slug='produce'), 17,  18,  0.9, 3.9, 0.2, 1.2, false),
  ('tomato_canned_diced','Canned diced tomatoes',(select id from aisles where slug='canned_goods'), null, 18, 0.9, 4.3, 0.1, 1.2, false),
  ('spinach',          'Fresh spinach',      (select id from aisles where slug='produce'), null, 23,  2.9, 3.6, 0.4, 2.2, false),
  ('kale',             'Fresh kale',         (select id from aisles where slug='produce'), null, 49,  4.3, 8.8, 0.9, 3.6, false),
  ('broccoli',         'Broccoli',           (select id from aisles where slug='produce'), null, 34,  2.8, 6.6, 0.4, 2.6, false),
  ('cauliflower',      'Cauliflower',        (select id from aisles where slug='produce'), null, 25,  1.9, 5,   0.3, 2,   false),
  ('carrot',           'Carrot',             (select id from aisles where slug='produce'), 60,  41,  0.9, 10,  0.2, 2.8, false),
  ('celery',           'Celery',             (select id from aisles where slug='produce'), 40,  16,  0.7, 3,   0.2, 1.6, false),
  ('zucchini',         'Zucchini',           (select id from aisles where slug='produce'), 200, 17,  1.2, 3.1, 0.3, 1,   false),
  ('cucumber',         'Cucumber',           (select id from aisles where slug='produce'), 300, 16,  0.7, 3.6, 0.1, 0.5, false),
  ('lettuce_romaine',  'Romaine lettuce',    (select id from aisles where slug='produce'), null, 17,  1.2, 3.3, 0.3, 2.1, false),
  ('cabbage',          'Cabbage',            (select id from aisles where slug='produce'), null, 25,  1.3, 5.8, 0.1, 2.5, false),
  ('sweet_potato',     'Sweet potato',       (select id from aisles where slug='produce'), 150, 86,  1.6, 20,  0.1, 3,   false),
  ('potato',           'Potato',             (select id from aisles where slug='produce'), 170, 77,  2,   17,  0.1, 2.2, false),
  ('mushroom',         'Cremini mushrooms',  (select id from aisles where slug='produce'), null, 22,  3.1, 3.3, 0.3, 1,   false),
  ('jalapeno',         'Jalapeño',           (select id from aisles where slug='produce'), 14,  29,  0.9, 6.5, 0.4, 2.8, false),
  ('lime',             'Lime',               (select id from aisles where slug='produce'), 67,  30,  0.7, 11,  0.2, 2.8, false),
  ('lemon',            'Lemon',              (select id from aisles where slug='produce'), 84,  29,  1.1, 9.3, 0.3, 2.8, false),
  ('cilantro',         'Fresh cilantro',     (select id from aisles where slug='produce'), null, 23,  2.1, 3.7, 0.5, 2.8, false),
  ('parsley',          'Fresh parsley',      (select id from aisles where slug='produce'), null, 36,  3,   6.3, 0.8, 3.3, false),
  ('basil_fresh',      'Fresh basil',        (select id from aisles where slug='produce'), null, 23,  3.2, 2.7, 0.6, 1.6, false),
  ('green_onion',      'Green onion',        (select id from aisles where slug='produce'), 15,  32,  1.8, 7.3, 0.2, 2.6, false),
  ('avocado',          'Avocado',            (select id from aisles where slug='produce'), 200, 160, 2,   9,   15,  7,   false),
  ('corn',             'Corn kernels',       (select id from aisles where slug='frozen'),  null, 96,  3.4, 21,  1.5, 2.4, false),
  ('peas',             'Green peas',         (select id from aisles where slug='frozen'),  null, 81,  5.4, 14,  0.4, 5.7, false),
  ('green_beans',      'Green beans',        (select id from aisles where slug='produce'), null, 31,  1.8, 7,   0.2, 3.4, false),
  ('asparagus',        'Asparagus',          (select id from aisles where slug='produce'), null, 20,  2.2, 3.9, 0.1, 2.1, false);

-- Dairy, cheese, and specialty perishables
insert into ingredients (slug, name, aisle_id, density_g_per_ml, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('milk',              'Milk, 2%',          (select id from aisles where slug='dairy_eggs'), 1.030,  50, 3.4, 4.9, 2,   0,   false),
  ('butter',             'Butter',           (select id from aisles where slug='dairy_eggs'), 0.911, 717, 0.9, 0.1, 81,  0,   false),
  ('cheddar_cheese',     'Cheddar cheese',   (select id from aisles where slug='dairy_eggs'), null,  403, 25,  1.3, 33,  0,   false),
  ('parmesan_cheese',    'Parmesan cheese',  (select id from aisles where slug='dairy_eggs'), null,  431, 38,  4.1, 29,  0,   false),
  ('mozzarella_cheese',  'Mozzarella cheese',(select id from aisles where slug='dairy_eggs'), null,  300, 22,  2.2, 22,  0,   false),
  ('feta_cheese',        'Feta cheese',      (select id from aisles where slug='dairy_eggs'), null,  264, 14,  4.1, 21,  0,   false),
  ('sour_cream',         'Sour cream',       (select id from aisles where slug='dairy_eggs'), 0.960, 198, 2.4, 4.6, 19,  0,   false),
  ('cream_cheese',       'Cream cheese',     (select id from aisles where slug='dairy_eggs'), null,  342, 6,   4,   34,  0,   false),
  ('heavy_cream',        'Heavy cream',      (select id from aisles where slug='dairy_eggs'), 0.994, 340, 2.1, 2.8, 36,  0,   false),
  ('coconut_milk',       'Canned coconut milk',(select id from aisles where slug='canned_goods'),0.960,230, 2.3, 5.5, 24,  2.2, false);

-- Bread products (perishable, not "bulk pantry" the way dry rice/pasta is)
insert into ingredients (slug, name, aisle_id, grams_per_each, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, is_pantry_staple)
values
  ('tortilla_flour', 'Flour tortilla', (select id from aisles where slug='bakery'), 45, 300, 8,   50,  7,   3,   false),
  ('tortilla_corn',  'Corn tortilla',  (select id from aisles where slug='bakery'), 24, 218, 5.7, 45,  2.9, 6.3, false),
  ('bread_sandwich', 'Sandwich bread', (select id from aisles where slug='bakery'), 28, 265, 9,   49,  3.3, 2.7, false),
  ('naan',           'Naan bread',     (select id from aisles where slug='bakery'), 90, 310, 9,   50,  7,   2,   false),
  ('pita_bread',     'Pita bread',     (select id from aisles where slug='bakery'), 60, 275, 9.1, 55,  1.2, 2.2, false);

-- ── ingredient unit overrides ────────────────────────────────────────────
-- Only for COUNT units, which have no universal weight the way volume
-- (via density) does. "Exact overrides beat density" — docs/schema.md.
insert into ingredient_units (ingredient_id, unit_id, grams) values
  ((select id from ingredients where slug='garlic'), (select id from units where slug='clove'), 3),
  ((select id from ingredients where slug='ginger'), (select id from units where slug='tbsp'), 6),
  ((select id from ingredients where slug='chickpeas_canned'),  (select id from units where slug='can'), 425),
  ((select id from ingredients where slug='black_beans_canned'),(select id from units where slug='can'), 425),
  ((select id from ingredients where slug='pinto_beans_canned'),(select id from units where slug='can'), 425),
  ((select id from ingredients where slug='tomato_canned_diced'),(select id from units where slug='can'), 411),
  ((select id from ingredients where slug='coconut_milk'), (select id from units where slug='can'), 400),
  ((select id from ingredients where slug='tomato_paste'), (select id from units where slug='tbsp'), 16),
  ((select id from ingredients where slug='parmesan_cheese'), (select id from units where slug='cup'), 100),
  ((select id from ingredients where slug='cheddar_cheese'),  (select id from units where slug='cup'), 113),
  ((select id from ingredients where slug='mozzarella_cheese'),(select id from units where slug='cup'), 113),
  ((select id from ingredients where slug='feta_cheese'), (select id from units where slug='cup'), 150),
  ((select id from ingredients where slug='tofu_firm'), (select id from units where slug='oz'), 28.35),
  ((select id from ingredients where slug='ground_beef'), (select id from units where slug='lb'), 453.592),
  ((select id from ingredients where slug='ground_turkey'), (select id from units where slug='lb'), 453.592),
  ((select id from ingredients where slug='ground_pork'), (select id from units where slug='lb'), 453.592),
  ((select id from ingredients where slug='shrimp'), (select id from units where slug='lb'), 453.592),
  ((select id from ingredients where slug='bay_leaf'), (select id from units where slug='each'), 0.1),
  ((select id from ingredients where slug='cabbage'), (select id from units where slug='each'), 900),
  ((select id from ingredients where slug='corn'), (select id from units where slug='cup'), 154),
  ((select id from ingredients where slug='peas'), (select id from units where slug='cup'), 145),
  ((select id from ingredients where slug='green_beans'), (select id from units where slug='cup'), 100),
  ((select id from ingredients where slug='asparagus'), (select id from units where slug='each'), 20),
  ((select id from ingredients where slug='mushroom'), (select id from units where slug='cup'), 70),
  ((select id from ingredients where slug='spinach'), (select id from units where slug='cup'), 30),
  ((select id from ingredients where slug='kale'), (select id from units where slug='cup'), 20),
  ((select id from ingredients where slug='cilantro'), (select id from units where slug='cup'), 16),
  ((select id from ingredients where slug='parsley'), (select id from units where slug='cup'), 15),
  ((select id from ingredients where slug='basil_fresh'), (select id from units where slug='cup'), 21),
  ((select id from ingredients where slug='cauliflower'), (select id from units where slug='cup'), 100),
  ((select id from ingredients where slug='broccoli'), (select id from units where slug='cup'), 91),
  ((select id from ingredients where slug='greek_yogurt'), (select id from units where slug='cup'), 245),
  ((select id from ingredients where slug='cottage_cheese'), (select id from units where slug='cup'), 226),
  ((select id from ingredients where slug='cream_cheese'), (select id from units where slug='tbsp'), 14.5),
  ((select id from ingredients where slug='lentils_dry'), (select id from units where slug='cup'), 192),
  ((select id from ingredients where slug='lettuce_romaine'), (select id from units where slug='cup'), 47),
  ((select id from ingredients where slug='chicken_broth'), (select id from units where slug='can'), 411),
  ((select id from ingredients where slug='vegetable_broth'), (select id from units where slug='can'), 411),
  ((select id from ingredients where slug='green_chiles_canned'), (select id from units where slug='can'), 113),
  ((select id from ingredients where slug='kalamata_olives'), (select id from units where slug='cup'), 134),
  ((select id from ingredients where slug='cherry_tomatoes'), (select id from units where slug='cup'), 150),
  ((select id from ingredients where slug='cilantro'), (select id from units where slug='tbsp'), 1),
  ((select id from ingredients where slug='parsley'), (select id from units where slug='tbsp'), 1),
  ((select id from ingredients where slug='basil_fresh'), (select id from units where slug='tbsp'), 1.5),
  ((select id from ingredients where slug='ginger'), (select id from units where slug='tsp'), 2),
  ((select id from ingredients where slug='cheddar_cheese'), (select id from units where slug='slice'), 21),
  ((select id from ingredients where slug='mozzarella_cheese'), (select id from units where slug='slice'), 28),
  ((select id from ingredients where slug='lettuce_romaine'), (select id from units where slug='each'), 12);

-- ── allergen derivations ─────────────────────────────────────────────────
-- Attached to INGREDIENTS only — every recipe using an allergen ingredient
-- is correctly flagged automatically. Never hand-tag a recipe (docs/schema.md).
insert into ingredient_allergens (ingredient_id, allergen_id) values
  ((select id from ingredients where slug='milk'),             (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='butter'),           (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='cheddar_cheese'),   (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='parmesan_cheese'),  (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='mozzarella_cheese'),(select id from allergens where slug='milk')),
  ((select id from ingredients where slug='feta_cheese'),      (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='sour_cream'),       (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='cream_cheese'),     (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='heavy_cream'),      (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='greek_yogurt'),     (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='cottage_cheese'),   (select id from allergens where slug='milk')),
  ((select id from ingredients where slug='egg'),              (select id from allergens where slug='eggs')),
  ((select id from ingredients where slug='salmon_fillet'),    (select id from allergens where slug='fish')),
  ((select id from ingredients where slug='cod_fillet'),       (select id from allergens where slug='fish')),
  ((select id from ingredients where slug='tilapia_fillet'),   (select id from allergens where slug='fish')),
  ((select id from ingredients where slug='fish_sauce'),       (select id from allergens where slug='fish')),
  ((select id from ingredients where slug='shrimp'),           (select id from allergens where slug='shellfish')),
  ((select id from ingredients where slug='oyster_sauce'),     (select id from allergens where slug='shellfish')),
  ((select id from ingredients where slug='walnuts'),          (select id from allergens where slug='tree_nuts')),
  ((select id from ingredients where slug='almonds'),          (select id from allergens where slug='tree_nuts')),
  ((select id from ingredients where slug='peanuts_roasted'),  (select id from allergens where slug='peanuts')),
  ((select id from ingredients where slug='peanut_butter'),    (select id from allergens where slug='peanuts')),
  ((select id from ingredients where slug='all_purpose_flour'),(select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='panko_breadcrumbs'),(select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='spaghetti'),        (select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='pasta_penne'),      (select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='couscous'),         (select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='tortilla_flour'),   (select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='bread_sandwich'),   (select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='naan'),             (select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='pita_bread'),       (select id from allergens where slug='wheat')),
  ((select id from ingredients where slug='soy_sauce'),        (select id from allergens where slug='soy')),
  ((select id from ingredients where slug='hoisin_sauce'),     (select id from allergens where slug='soy')),
  ((select id from ingredients where slug='tofu_firm'),        (select id from allergens where slug='soy')),
  ((select id from ingredients where slug='tempeh'),           (select id from allergens where slug='soy')),
  ((select id from ingredients where slug='sesame_oil'),       (select id from allergens where slug='sesame')),
  ((select id from ingredients where slug='sesame_seeds'),     (select id from allergens where slug='sesame')),
  ((select id from ingredients where slug='tahini'),           (select id from allergens where slug='sesame')),
  ((select id from ingredients where slug='mayonnaise'),       (select id from allergens where slug='eggs')),
  ((select id from ingredients where slug='ranch_dressing'),   (select id from allergens where slug='milk'));
