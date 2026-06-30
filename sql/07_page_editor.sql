-- ============================================================
-- 07_page_editor.sql — ビジュアルページエディタ用スキーマ
-- 01_schema.sql, 02_rls_policies.sql の後に実行する
-- （これは追加分のみ。00_setup_all.sqlとは別に単独で実行すること）
-- ============================================================

-- ---------- site_pages ----------
-- 公開中のページ内容（page_keyごとに1行。v1は 'home' のみ使用）
create table public.site_pages (
  page_key      text primary key,
  html          text not null,
  css           text not null,
  project_data  jsonb not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id)
);

create trigger trg_site_pages_updated_at
  before update on public.site_pages
  for each row execute function public.set_updated_at();

-- ---------- site_page_versions ----------
-- 「保存して公開」のたびに残す履歴（復元用）
create table public.site_page_versions (
  id            uuid primary key default gen_random_uuid(),
  page_key      text not null,
  html          text not null,
  css           text not null,
  project_data  jsonb not null,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id)
);

create index idx_site_page_versions_page_key
  on public.site_page_versions (page_key, created_at desc);

-- ---------- RLS ----------
alter table public.site_pages         enable row level security;
alter table public.site_page_versions enable row level security;

-- 公開ページは誰でも閲覧可（公開サイトの読み込みスクリプトが使う）
create policy "public can read site pages" on public.site_pages
  for select to anon, authenticated
  using (true);

-- 編集・保存はログイン済みスタッフのみ
create policy "admin full access site pages" on public.site_pages
  for all to authenticated
  using (true) with check (true);

-- 履歴は匿名からは一切見えない・触れない（管理者のみ）
create policy "admin full access site page versions" on public.site_page_versions
  for all to authenticated
  using (true) with check (true);

-- ---------- 画像アップロード用ストレージ ----------
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

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
