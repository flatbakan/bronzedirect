-- ============================================================
-- Bronze Direct — one-off import: Kwik Tan · Dartford salon
-- 10 sunbeds from "DARTFORD KWIK TAN ANNUAL INSPECTION 2026.xlsx"
-- Idempotent: creates customer/location if missing, skips beds already present
-- (matched on location + name). Run once in Supabase SQL Editor.
-- ============================================================
do $$
declare
  cid uuid;
  lid uuid;
begin
  -- Customer: Kwik Tan
  select id into cid from public.customers where name = 'Kwik Tan' limit 1;
  if cid is null then
    insert into public.customers (name) values ('Kwik Tan') returning id into cid;
  end if;

  -- Location: Dartford
  select id into lid from public.locations where customer_id = cid and name = 'Dartford' limit 1;
  if lid is null then
    insert into public.locations (customer_id, name, city)
    values (cid, 'Dartford', 'Dartford') returning id into lid;
  end if;

  -- Sunbeds
  insert into public.equipment
    (customer_id, location_id, category, status, brand, name, type, model, serial_number, notes)
  select cid, lid, 'sunbed', 'in_service', 'megaSun',
         v.name, v.model, v.model, nullif(v.serial, ''),
         'Imported from Dartford annual inspection 08/10/2026'
  from (values
    ('Room 1 — Power Tower',  'Power Tower',  '0418-0253'),
    ('Room 2 — Power Tower',  'Power Tower',  '0418-0252'),
    ('Room 3 — Power Tower',  'Power Tower',  '0418-0251'),
    ('Room 4 — Power Tower',  'Power Tower',  '0418-0250'),
    ('Room 5 — iXtreme Plus', 'iXtreme Plus', 'XXL58e024021MW001Fcd'),
    ('Room 6 — iXtreme Plus', 'iXtreme Plus', 'XXL58e024022MW001Fcd'),
    ('Room 7 — P9S',          'P9S',          '01046775'),
    ('Room 8 — P9S',          'P9S',          ''),
    ('Room 9 — K11',          'K11',          'KBL01354447'),
    ('Room 10 — K11',         'K11',          'KBL01354373')
  ) as v(name, model, serial)
  where not exists (
    select 1 from public.equipment e where e.location_id = lid and e.name = v.name
  );

  raise notice 'Kwik Tan / Dartford import complete (customer %, location %).', cid, lid;
end $$;
