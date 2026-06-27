-- ============================================================
-- 03_functions.sql — 予約関連のRPC関数
-- 01_schema.sql, 02_rls_policies.sql の後に実行する
-- ============================================================

-- ------------------------------------------------------------
-- create_reservation — 二重予約防止の核心
-- ------------------------------------------------------------
-- p_items の例: [{"equipment_item_id":"<uuid>","quantity":2}, ...]
create or replace function public.create_reservation(
  p_rental_date     date,
  p_customer_name   text,
  p_customer_phone  text,
  p_customer_email  text,
  p_party_size      integer,
  p_items           jsonb,
  p_notes           text default null
)
returns table (reservation_id uuid, reservation_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item            jsonb;
  v_equipment_id    uuid;
  v_qty             integer;
  v_already_booked  integer;
  v_total_qty       integer;
  v_is_active       boolean;
  v_reservation_id  uuid;
  v_code            text;
  v_is_closed       boolean;
begin
  if p_rental_date is null or p_party_size is null or p_party_size <= 0
     or p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_rental_date < current_date then
    raise exception 'DATE_IN_PAST' using errcode = 'P0001';
  end if;

  select exists(select 1 from public.closed_dates where closed_date = p_rental_date)
    into v_is_closed;
  if v_is_closed then
    raise exception 'SHOP_CLOSED_ON_DATE' using errcode = 'P0001';
  end if;

  -- equipment_item_id の昇順で1件ずつロック→チェックする。
  -- 順序を固定することで複数アイテムを含む予約同士のデッドロックを防ぐ。
  -- FOR UPDATE は「同じ在庫行を取り合う」相手だけをブロックするので、
  -- 別サイズ同士の予約は並行して通る。
  for v_item in
    select * from jsonb_array_elements(p_items) order by (value ->> 'equipment_item_id')
  loop
    v_equipment_id := (v_item ->> 'equipment_item_id')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select total_quantity, is_active
      into v_total_qty, v_is_active
      from public.equipment_items
      where id = v_equipment_id
      for update;

    if v_total_qty is null then
      raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if not v_is_active then
      raise exception 'EQUIPMENT_INACTIVE' using errcode = 'P0001';
    end if;

    -- cancelled の予約は在庫を消費しない
    select coalesce(sum(ri.quantity), 0)
      into v_already_booked
      from public.reservation_items ri
      join public.reservations r on r.id = ri.reservation_id
      where ri.equipment_item_id = v_equipment_id
        and r.rental_date = p_rental_date
        and r.status in ('pending', 'confirmed');

    if v_already_booked + v_qty > v_total_qty then
      raise exception 'OUT_OF_STOCK:%', v_equipment_id using errcode = 'P0001';
    end if;
  end loop;

  -- ここまでで全アイテムの行ロックを保持したまま在庫確認が完了している。
  -- 他のトランザクションがこの間に割り込むことはできないので安全に挿入できる。
  v_code := 'YR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.reservations (
    reservation_code, rental_date, customer_name,
    customer_phone, customer_email, party_size, notes, status
  ) values (
    v_code, p_rental_date, p_customer_name,
    p_customer_phone, p_customer_email, p_party_size, p_notes, 'pending'
  )
  returning id into v_reservation_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.reservation_items (reservation_id, equipment_item_id, quantity)
    values (
      v_reservation_id,
      (v_item ->> 'equipment_item_id')::uuid,
      (v_item ->> 'quantity')::integer
    );
  end loop;

  return query select v_reservation_id, v_code;
end;
$$;

grant execute on function public.create_reservation(date, text, text, text, integer, jsonb, text)
  to anon, authenticated;

-- ------------------------------------------------------------
-- get_availability — 指定日付で在庫が残っているサイズだけを返す
-- ------------------------------------------------------------
-- security definer が必須: reservation_items/reservations は匿名SELECT
-- 不可のため、invoker モードではこの集計クエリ自体が失敗する。
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
    (ei.total_quantity - coalesce(sum(ri.quantity), 0))::integer as remaining
  from public.equipment_items ei
  left join public.reservation_items ri on ri.equipment_item_id = ei.id
  left join public.reservations r
    on r.id = ri.reservation_id
    and r.rental_date = p_date
    and r.status in ('pending', 'confirmed')
  where ei.is_active = true
  group by ei.id, ei.category, ei.size_label, ei.total_quantity
  having ei.total_quantity - coalesce(sum(ri.quantity), 0) > 0
  order by ei.category, ei.size_label;
end;
$$;

grant execute on function public.get_availability(date) to anon, authenticated;

-- ------------------------------------------------------------
-- lookup_reservation — 予約の確認（コード＋電話番号が一致した1件のみ）
-- ------------------------------------------------------------
create or replace function public.lookup_reservation(
  p_reservation_code text,
  p_customer_phone   text
)
returns table (
  reservation_id    uuid,
  reservation_code  text,
  rental_date       date,
  customer_name     text,
  party_size        integer,
  status            public.reservation_status,
  items             jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    r.id,
    r.reservation_code,
    r.rental_date,
    r.customer_name,
    r.party_size,
    r.status,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category', ei.category,
          'size_label', ei.size_label,
          'quantity', ri.quantity
        )
      ) filter (where ri.id is not null),
      '[]'::jsonb
    )
  from public.reservations r
  left join public.reservation_items ri on ri.reservation_id = r.id
  left join public.equipment_items ei on ei.id = ri.equipment_item_id
  where r.reservation_code = upper(trim(p_reservation_code))
    and r.customer_phone = trim(p_customer_phone)
  group by r.id, r.reservation_code, r.rental_date, r.customer_name, r.party_size, r.status;
end;
$$;

grant execute on function public.lookup_reservation(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- cancel_reservation — コード＋電話番号を再検証してからキャンセル
-- ------------------------------------------------------------
-- 内部IDを直接渡させない設計にすることで、他人の予約を推測キャンセル
-- できないようにしている。
create or replace function public.cancel_reservation(
  p_reservation_code text,
  p_customer_phone   text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_status public.reservation_status;
begin
  select id, status into v_id, v_status
    from public.reservations
    where reservation_code = upper(trim(p_reservation_code))
      and customer_phone = trim(p_customer_phone)
    for update;

  if v_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED' using errcode = 'P0001';
  end if;

  update public.reservations
    set status = 'cancelled', cancelled_at = now()
    where id = v_id;

  return true;
end;
$$;

grant execute on function public.cancel_reservation(text, text) to anon, authenticated;
