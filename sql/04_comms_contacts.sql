-- ============================================================
-- Bronze Direct — Announcements, work-order comments, customer contacts
-- Run once in Supabase SQL Editor (after 01_schema.sql).
-- ============================================================

-- ---------- Announcements (admin → all staff) ----------
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,
  is_pinned  boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_announcements_created on public.announcements(created_at desc);
alter table public.announcements enable row level security;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select using (is_staff());
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
  for all using (is_admin()) with check (is_admin());

-- Read receipts (to show unread badge)
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);
alter table public.announcement_reads enable row level security;

drop policy if exists announcement_reads_own on public.announcement_reads;
create policy announcement_reads_own on public.announcement_reads
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- Work-order comments (thread per job) ----------
create table if not exists public.work_order_comments (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_comments_wo on public.work_order_comments(work_order_id, created_at);
alter table public.work_order_comments enable row level security;

drop policy if exists wo_comments_staff on public.work_order_comments;
create policy wo_comments_staff on public.work_order_comments
  for all using (is_staff()) with check (is_staff());

-- ---------- Customer contacts (multiple per customer) ----------
create table if not exists public.customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name        text not null,
  role        text,
  phone       text,
  email       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_customer_contacts_customer on public.customer_contacts(customer_id);
alter table public.customer_contacts enable row level security;

drop policy if exists customer_contacts_staff on public.customer_contacts;
create policy customer_contacts_staff on public.customer_contacts
  for all using (is_staff()) with check (is_staff());
