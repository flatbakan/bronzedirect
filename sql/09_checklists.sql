-- ============================================================
-- Bronze Direct — Checklists on work orders
-- Reusable templates (admin) + per-work-order checklist items.
-- Run once in Supabase SQL Editor.
-- ============================================================

-- Templates (items stored as an ordered text array for easy editing)
create table if not exists public.checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  wo_type    text,                       -- optional: suggested for this work-order type
  items      text[] not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.checklist_templates enable row level security;
drop policy if exists checklist_templates_read on public.checklist_templates;
create policy checklist_templates_read on public.checklist_templates
  for select using (is_staff());
drop policy if exists checklist_templates_write on public.checklist_templates;
create policy checklist_templates_write on public.checklist_templates
  for all using (is_admin()) with check (is_admin());

-- Per-work-order checklist items
create table if not exists public.work_order_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  label         text not null,
  position      int not null default 0,
  is_done       boolean not null default false,
  checked_by    uuid references public.profiles(id) on delete set null,
  checked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_checklist_wo on public.work_order_checklist_items(work_order_id, position);
alter table public.work_order_checklist_items enable row level security;
drop policy if exists wo_checklist_staff on public.work_order_checklist_items;
create policy wo_checklist_staff on public.work_order_checklist_items
  for all using (is_staff()) with check (is_staff());
