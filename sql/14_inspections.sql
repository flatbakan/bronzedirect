-- ============================================================
-- Bronze Direct — Annual Inspections (per asset, template by unit type)
-- Field values live in `data` (jsonb). Run once in Supabase SQL Editor.
-- ============================================================
create table if not exists public.inspections (
  id                 uuid primary key default gen_random_uuid(),
  equipment_id       uuid not null references public.equipment(id) on delete cascade,
  template           text not null,            -- power_tower | ixtreme | p9s | k11
  status             text not null default 'draft' check (status in ('draft', 'completed')),
  inspection_date    date,
  data               jsonb not null default '{}'::jsonb,
  signature_path     text,
  signed_at          date,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_inspections_equipment on public.inspections(equipment_id);
alter table public.inspections enable row level security;
drop policy if exists inspections_staff on public.inspections;
create policy inspections_staff on public.inspections
  for all using (is_staff()) with check (is_staff());
