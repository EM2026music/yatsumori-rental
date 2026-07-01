-- ============================================================
-- 07b_storage_retry.sql — site-assets バケット作成（再実行安全版）
-- 既存のポリシーがあれば一旦消してから作り直すので、何度実行してもOK
-- ============================================================

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "public can read site-assets" on storage.objects;
drop policy if exists "admin can upload site-assets" on storage.objects;
drop policy if exists "admin can update site-assets" on storage.objects;
drop policy if exists "admin can delete site-assets" on storage.objects;

create policy "public can read site-assets" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'site-assets');

create policy "admin can upload site-assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets');

create policy "admin can update site-assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-assets');

create policy "admin can delete site-assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets');
