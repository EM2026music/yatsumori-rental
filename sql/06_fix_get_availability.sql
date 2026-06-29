-- ============================================================
-- 06_fix_get_availability.sql
-- 在庫表示バグの修正（キャンセル済み/別日の予約まで在庫を消費していた問題）
-- Supabaseの SQL Editor に貼って実行するだけでOK（既存関数を上書き）
-- ============================================================

create or replace function public.get_availability(p_date date)
returns table (
  equipment_item_id uuid,
  category          text,
  size_label        text,
  remaining         integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    ei.id,
    ei.category,
    ei.size_label,
    (ei.total_quantity - coalesce((
      select sum(ri.quantity)
      from public.reservation_items ri
      join public.reservations r on r.id = ri.reservation_id
      where ri.equipment_item_id = ei.id
        and r.rental_date = p_date
        and r.status in ('pending', 'confirmed')
    ), 0))::integer
  from public.equipment_items ei
  where ei.is_active = true
    and (ei.total_quantity - coalesce((
      select sum(ri.quantity)
      from public.reservation_items ri
      join public.reservations r on r.id = ri.reservation_id
      where ri.equipment_item_id = ei.id
        and r.rental_date = p_date
        and r.status in ('pending', 'confirmed')
    ), 0)) > 0
  order by ei.category, ei.size_label;
end;
$$;

grant execute on function public.get_availability(date) to anon, authenticated;

-- 後始末（任意）：総点検で作ったテスト予約を消す場合は以下も実行
-- delete from public.reservations where customer_name in ('テスト太郎','ブラウザテスト','総点検テスト','Test A','Test B');
