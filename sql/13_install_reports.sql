-- ============================================================
-- Bronze Direct — Installation Reports (KBL FOR0901-06), attached to an asset
-- All field values live in `data` (jsonb); signatures in storage.
-- Run once in Supabase SQL Editor.
-- ============================================================
create table if not exists public.installation_reports (
  id                      uuid primary key default gen_random_uuid(),
  equipment_id            uuid not null references public.equipment(id) on delete cascade,
  status                  text not null default 'draft' check (status in ('draft', 'completed')),
  data                    jsonb not null default '{}'::jsonb,
  technician_signature_path text,
  client_signature_path     text,
  technician_signed_at    date,
  client_signed_at        date,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_install_reports_equipment on public.installation_reports(equipment_id);
alter table public.installation_reports enable row level security;
drop policy if exists install_reports_staff on public.installation_reports;
create policy install_reports_staff on public.installation_reports
  for all using (is_staff()) with check (is_staff());
