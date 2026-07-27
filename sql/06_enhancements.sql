-- ============================================================
-- Bronze Direct — enhancements: bulb life, labour rate, job due date
-- Run once in Supabase SQL Editor.
-- ============================================================

-- Per-equipment bulb life override (hours). Falls back to company default.
alter table public.equipment
  add column if not exists bulb_life_hours numeric(10,1);

-- Company-wide defaults
alter table public.company_settings
  add column if not exists default_bulb_life_hours numeric(10,1) default 800,
  add column if not exists labor_rate numeric(12,2);

-- Due date on work orders (SLA / must-be-done-by)
alter table public.work_orders
  add column if not exists due_date date;

-- (invoices.due_date already exists from 01_schema.sql)
