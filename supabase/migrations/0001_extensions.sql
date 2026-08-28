-- Groundwork schema — migration 0001
-- Extensions only. Supabase Postgres ships pgcrypto disabled by default in
-- some templates; gen_random_uuid() throughout the schema depends on it.

create extension if not exists pgcrypto;
