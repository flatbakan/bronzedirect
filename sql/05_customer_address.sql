-- ============================================================
-- Bronze Direct — billing address on customers (for invoices).
-- Run once in Supabase SQL Editor.
-- ============================================================
alter table public.customers
  add column if not exists address     text,
  add column if not exists postal_code text,
  add column if not exists city        text;
