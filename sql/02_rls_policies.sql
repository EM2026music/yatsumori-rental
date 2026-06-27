-- ============================================================
-- 02_rls_policies.sql — Row Level Security
-- 01_schema.sql の後に実行する
-- ============================================================

alter table public.equipment_items   enable row level security;
alter table public.closed_dates      enable row level security;
alter table public.business_settings enable row level security;
alter table public.reservations      enable row level security;
alter table public.reservation_items enable row level security;

-- ---------- equipment_items ----------
-- 公開: 有効なサイズの一覧だけ読める（予約フォームのサイズ選択用）
create policy "public can read active equipment" on public.equipment_items
  for select to anon, authenticated
  using (is_active = true);

-- 管理者: 全操作可
create policy "admin full access equipment" on public.equipment_items
  for all to authenticated
  using (true) with check (true);

-- ---------- closed_dates ----------
create policy "public can read closed dates" on public.closed_dates
  for select to anon, authenticated using (true);

create policy "admin full access closed dates" on public.closed_dates
  for all to authenticated using (true) with check (true);

-- ---------- business_settings ----------
create policy "public can read business settings" on public.business_settings
  for select to anon, authenticated using (true);

create policy "admin full access business settings" on public.business_settings
  for all to authenticated using (true) with check (true);

-- ---------- reservations ----------
-- 匿名ユーザー向けの select/insert/update ポリシーは意図的に作らない。
-- 公開からの読み書きは create_reservation / lookup_reservation /
-- cancel_reservation (すべて security definer) を経由する以外に道を作らない。
-- これにより `supabase.from('reservations').select()` を直接叩いても
-- 他人の予約情報は一切返らないことを保証する。
create policy "admin full access reservations" on public.reservations
  for all to authenticated using (true) with check (true);

-- ---------- reservation_items ----------
create policy "admin full access reservation_items" on public.reservation_items
  for all to authenticated using (true) with check (true);
