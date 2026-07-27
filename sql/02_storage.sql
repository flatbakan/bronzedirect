-- ============================================================
-- Bronze Direct — Storage reglur fyrir 'bronze' bucket
-- Keyrist EFTIR að bucket 'bronze' hefur verið stofnaður (Dashboard → Storage → New bucket,
-- nafn: bronze, Private). Myndir/undirskriftir eru einka — sóttar með signed URLs.
-- ============================================================

drop policy if exists "bronze_read" on storage.objects;
create policy "bronze_read" on storage.objects
  for select using (bucket_id = 'bronze' and public.is_staff());

drop policy if exists "bronze_insert" on storage.objects;
create policy "bronze_insert" on storage.objects
  for insert with check (bucket_id = 'bronze' and public.is_staff());

drop policy if exists "bronze_update" on storage.objects;
create policy "bronze_update" on storage.objects
  for update using (bucket_id = 'bronze' and public.is_staff())
  with check (bucket_id = 'bronze' and public.is_staff());

drop policy if exists "bronze_delete" on storage.objects;
create policy "bronze_delete" on storage.objects
  for delete using (bucket_id = 'bronze' and public.is_staff());
