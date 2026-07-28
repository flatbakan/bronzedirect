-- ============================================================
-- Bronze Direct — Preventive maintenance plans (per asset, recurring)
-- Run once in Supabase SQL Editor.
-- ============================================================

create table if not exists public.maintenance_plans (
  id                    uuid primary key default gen_random_uuid(),
  equipment_id          uuid not null references public.equipment(id) on delete cascade,
  title                 text not null,          -- e.g. "6-month service"
  description           text,
  interval_days         int not null default 180,
  checklist_template_id uuid references public.checklist_templates(id) on delete set null,
  assigned_to           uuid references public.profiles(id) on delete set null,
  priority              text not null default 'normal'
                          check (priority in ('low','normal','high','urgent')),
  last_done_date        date,
  next_due_date         date not null default current_date,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);
create index if not exists idx_maint_equipment on public.maintenance_plans(equipment_id);
create index if not exists idx_maint_due on public.maintenance_plans(next_due_date) where is_active;
alter table public.maintenance_plans enable row level security;

drop policy if exists maintenance_plans_staff on public.maintenance_plans;
create policy maintenance_plans_staff on public.maintenance_plans
  for all using (is_staff()) with check (is_staff());
