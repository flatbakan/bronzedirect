-- ============================================================
-- Bronze Direct — asset category (sunbeds vs spray booths vs other)
-- Lets non-sunbed assets (e.g. Versa Spa spray-tan booth) skip bulb fields.
-- Run once in Supabase SQL Editor.
-- ============================================================
alter table public.equipment
  add column if not exists category text not null default 'sunbed'
    check (category in ('sunbed', 'spray_booth', 'other'));
