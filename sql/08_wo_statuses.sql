-- ============================================================
-- Bronze Direct — expanded work-order lifecycle + time tracking
-- Statuses: new → assigned → accepted → travelling → on_site
--           (paused / waiting_parts) → completed → invoiced / cancelled
-- Run once in Supabase SQL Editor.
-- ============================================================

-- 1) Drop the old status constraint FIRST (so we can migrate to new values)
alter table public.work_orders drop constraint if exists work_orders_status_check;

-- 2) Migrate existing status values to the new vocabulary
update public.work_orders set status = 'assigned'  where status = 'scheduled';
update public.work_orders set status = 'on_site'    where status = 'in_progress';
update public.work_orders set status = 'completed'  where status = 'done';

-- 3) Add the new status constraint
alter table public.work_orders
  add constraint work_orders_status_check check (status in (
    'new','assigned','accepted','travelling','on_site',
    'paused','waiting_parts','completed','invoiced','cancelled'
  ));

-- 4) Estimated hours
alter table public.work_orders
  add column if not exists estimated_hours numeric(6,2);

-- 5) Time tracking (clock in / out — multiple sessions per job)
create table if not exists public.work_order_time_logs (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  technician_id uuid references public.profiles(id) on delete set null,
  clock_in      timestamptz not null default now(),
  clock_out     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_timelogs_wo on public.work_order_time_logs(work_order_id);
alter table public.work_order_time_logs enable row level security;
drop policy if exists wo_timelogs_staff on public.work_order_time_logs;
create policy wo_timelogs_staff on public.work_order_time_logs
  for all using (is_staff()) with check (is_staff());
