-- ============================================================
-- Bronze Direct — Asset-centric upgrade
-- Equipment becomes the central "Asset": number, type, warranty, archive,
-- plus asset-level photos and documents.
-- Run once in Supabase SQL Editor.
-- ============================================================

-- ---- Asset fields on equipment ----
create sequence if not exists public.asset_seq;

alter table public.equipment
  add column if not exists name           text,
  add column if not exists asset_no       int,
  add column if not exists type           text,
  add column if not exists warranty_until date,
  add column if not exists archived       boolean not null default false;

-- Backfill asset numbers for existing rows, then make it the default
update public.equipment set asset_no = nextval('public.asset_seq') where asset_no is null;
alter table public.equipment alter column asset_no set default nextval('public.asset_seq');

-- ---- Asset photos (nameplate, install pics, etc.) ----
create table if not exists public.asset_photos (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid not null references public.equipment(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_asset_photos_eq on public.asset_photos(equipment_id);
alter table public.asset_photos enable row level security;
drop policy if exists asset_photos_staff on public.asset_photos;
create policy asset_photos_staff on public.asset_photos
  for all using (is_staff()) with check (is_staff());

-- ---- Documents (manuals, wiring diagrams, certificates…) ----
create table if not exists public.asset_documents (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid references public.equipment(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  title         text not null,
  doc_type      text,
  storage_path  text not null,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_asset_docs_eq on public.asset_documents(equipment_id);
alter table public.asset_documents enable row level security;
drop policy if exists asset_docs_staff on public.asset_documents;
create policy asset_docs_staff on public.asset_documents
  for all using (is_staff()) with check (is_staff());
