-- ============================================================
-- Bronze Direct — Grunnskema (áfangi 1: Þjónusta)
-- Keyrist í Supabase SQL Editor. Einn leigjandi (innra kerfi).
-- ============================================================

-- ---------- Hjálparföll (öryggi / hlutverk) ----------

-- Ath.: föllin eru plpgsql svo þau vísi í public.profiles við keyrslu (ekki við stofnun),
-- þar sem þau eru skilgreind á undan töflunni.

-- Er innskráður aðili virkur starfsmaður?
create or replace function public.is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true
  );
end;
$$;

-- Hlutverk innskráðs aðila ('admin' / 'technician' / 'office' / null)
create or replace function public.my_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare r text;
begin
  select p.role into r from public.profiles p where p.id = auth.uid();
  return r;
end;
$$;

-- Er admin eða super admin?
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (p.role = 'admin' or p.is_super_admin = true)
  );
end;
$$;

-- ---------- Starfsfólk ----------

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'technician'
                  check (role in ('admin','technician','office')),
  is_super_admin boolean not null default false,
  is_active     boolean not null default true,
  full_name     text,
  phone         text,
  email         text,
  avatar_path   text,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Sjálfvirk stofnun profils þegar notandi nýskráir sig
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reglur: allir virkir starfsmenn sjá starfsfólk; hver breytir sínu; admin breytir öllum.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (is_staff());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (is_admin()) with check (is_admin());

-- ---------- Fyrirtækisstillingar (Bronze Direct sjálft) ----------

create table if not exists public.company_settings (
  id           int primary key default 1 check (id = 1),
  company_name text default 'Bronze Direct',
  kennitala    text,
  address      text,
  postal_code  text,
  city         text,
  phone        text,
  email        text,
  logo_path    text,
  updated_at   timestamptz not null default now()
);
insert into public.company_settings (id) values (1) on conflict do nothing;
alter table public.company_settings enable row level security;

drop policy if exists company_settings_read on public.company_settings;
create policy company_settings_read on public.company_settings
  for select using (is_staff());
drop policy if exists company_settings_write on public.company_settings;
create policy company_settings_write on public.company_settings
  for all using (is_admin()) with check (is_admin());

-- ---------- Viðskiptavinir (sólbaðsstofur) ----------

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kennitala  text,
  phone      text,
  email      text,
  contact_name text,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;

drop policy if exists customers_staff on public.customers;
create policy customers_staff on public.customers
  for all using (is_staff()) with check (is_staff());

-- ---------- Starfsstöðvar (margar per viðskiptavin) ----------

create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  name         text,
  address      text,
  postal_code  text,
  city         text,
  access_notes text,          -- lyklaboð, hvar bekkir standa, o.þ.h.
  created_at   timestamptz not null default now()
);
create index if not exists idx_locations_customer on public.locations(customer_id);
alter table public.locations enable row level security;

drop policy if exists locations_staff on public.locations;
create policy locations_staff on public.locations
  for all using (is_staff()) with check (is_staff());

-- ---------- Vörur (léttur grunnur; heildsala byggð ofan á seinna) ----------

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  sku         text unique,
  name        text not null,
  category    text not null default 'part'
                check (category in ('bed','bulb','part','accessory')),
  brand       text,
  description text,
  cost_price  numeric(12,2),
  sale_price  numeric(12,2),
  unit        text default 'stk',
  stock_qty   numeric(12,2) default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.products enable row level security;

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select using (is_staff());
drop policy if exists products_write on public.products;
create policy products_write on public.products
  for all using (is_admin()) with check (is_admin());

-- ---------- Tæki (ljósabekkir hjá viðskiptavinum) ----------

create table if not exists public.equipment (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers(id) on delete cascade,
  location_id        uuid references public.locations(id) on delete set null,
  model              text,
  brand              text,
  serial_number      text,
  install_date       date,
  status             text not null default 'in_service'
                        check (status in ('in_service','needs_service','removed')),
  bulb_type          text,          -- t.d. perutegund/lengd
  bulb_count         int,           -- fjöldi líkamspera
  facial_bulb_count  int,           -- fjöldi andlitspera
  current_bulb_hours numeric(10,1) default 0,  -- áætl. klst frá síðustu peruskiptum
  notes              text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_equipment_customer on public.equipment(customer_id);
create index if not exists idx_equipment_location on public.equipment(location_id);
alter table public.equipment enable row level security;

drop policy if exists equipment_staff on public.equipment;
create policy equipment_staff on public.equipment
  for all using (is_staff()) with check (is_staff());

-- ---------- Peruskipti (saga per bekk) ----------

create table if not exists public.bulb_changes (
  id             uuid primary key default gen_random_uuid(),
  equipment_id   uuid not null references public.equipment(id) on delete cascade,
  changed_at     date not null default current_date,
  changed_by     uuid references public.profiles(id) on delete set null,
  bulb_product_id uuid references public.products(id) on delete set null,
  quantity       int,
  hours_at_change numeric(10,1),   -- klst á bekk þegar skipt var
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_bulb_changes_equipment on public.bulb_changes(equipment_id);
alter table public.bulb_changes enable row level security;

drop policy if exists bulb_changes_staff on public.bulb_changes;
create policy bulb_changes_staff on public.bulb_changes
  for all using (is_staff()) with check (is_staff());

-- ---------- Verkbeiðnir ----------

create sequence if not exists public.work_order_seq;

create table if not exists public.work_orders (
  id           uuid primary key default gen_random_uuid(),
  number       int not null default nextval('public.work_order_seq'),
  customer_id  uuid not null references public.customers(id) on delete restrict,
  location_id  uuid references public.locations(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  type         text not null default 'repair'
                 check (type in ('install','repair','bulb_change','maintenance','inspection','other')),
  status       text not null default 'new'
                 check (status in ('new','scheduled','in_progress','done','invoiced','cancelled')),
  priority     text not null default 'normal'
                 check (priority in ('low','normal','high','urgent')),
  title        text,
  description  text,
  resolution   text,
  scheduled_at timestamptz,
  assigned_to  uuid references public.profiles(id) on delete set null,
  labor_hours  numeric(6,2),
  signature_path text,
  signed_name  text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_wo_customer on public.work_orders(customer_id);
create index if not exists idx_wo_assigned on public.work_orders(assigned_to);
create index if not exists idx_wo_status on public.work_orders(status);
create index if not exists idx_wo_scheduled on public.work_orders(scheduled_at);
alter table public.work_orders enable row level security;

-- Allir starfsmenn sjá og vinna með verkbeiðnir (lítið teymi, sameiginlegt yfirlit).
drop policy if exists work_orders_staff on public.work_orders;
create policy work_orders_staff on public.work_orders
  for all using (is_staff()) with check (is_staff());

-- ---------- Varahlutir/perur notaðir í verk ----------

create table if not exists public.work_order_parts (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  description   text,
  quantity      numeric(12,2) not null default 1,
  unit_price    numeric(12,2),
  created_at    timestamptz not null default now()
);
create index if not exists idx_wop_wo on public.work_order_parts(work_order_id);
alter table public.work_order_parts enable row level security;

drop policy if exists wop_staff on public.work_order_parts;
create policy wop_staff on public.work_order_parts
  for all using (is_staff()) with check (is_staff());

-- ---------- Myndir á verk ----------

create table if not exists public.work_order_photos (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_wophoto_wo on public.work_order_photos(work_order_id);
alter table public.work_order_photos enable row level security;

drop policy if exists wophoto_staff on public.work_order_photos;
create policy wophoto_staff on public.work_order_photos
  for all using (is_staff()) with check (is_staff());

-- ---------- Reikningar / tilboð (úr verkbeiðnum) ----------

create sequence if not exists public.invoice_seq;

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        int not null default nextval('public.invoice_seq'),
  kind          text not null default 'invoice' check (kind in ('quote','invoice')),
  customer_id   uuid not null references public.customers(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete set null,
  status        text not null default 'draft'
                  check (status in ('draft','sent','paid','cancelled')),
  issue_date    date not null default current_date,
  due_date      date,
  vat_rate      numeric(5,2) not null default 24,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_invoice_customer on public.invoices(customer_id);
alter table public.invoices enable row level security;

-- Admin/office gera reikninga; allir starfsmenn mega skoða.
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices
  for select using (is_staff());
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all using (is_admin() or my_role() = 'office')
  with check (is_admin() or my_role() = 'office');

create table if not exists public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_invline_invoice on public.invoice_lines(invoice_id);
alter table public.invoice_lines enable row level security;

drop policy if exists invoice_lines_read on public.invoice_lines;
create policy invoice_lines_read on public.invoice_lines
  for select using (is_staff());
drop policy if exists invoice_lines_write on public.invoice_lines;
create policy invoice_lines_write on public.invoice_lines
  for all using (is_admin() or my_role() = 'office')
  with check (is_admin() or my_role() = 'office');

-- ============================================================
-- EFTIR fyrstu nýskráningu: gerðu sjálfan þig að admin + super admin:
--   update public.profiles
--     set role = 'admin', is_super_admin = true
--     where email = 'NETFANGIÐ_ÞITT';
-- ============================================================
