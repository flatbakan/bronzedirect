-- ============================================================
-- Bronze Direct — selectable currency (GBP / EUR) in company settings
-- Run once in Supabase SQL Editor.
-- ============================================================
alter table public.company_settings
  add column if not exists currency text not null default 'GBP'
    check (currency in ('GBP', 'EUR'));
