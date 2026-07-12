-- ============================================================
-- 12: 前日受け取り＋セットなし（単品のみ）対応
-- 実行方法: SupabaseダッシュボードのSQL Editorに全文貼り付けて実行
-- 何度実行してもOK（冪等）。
--
-- 変更点:
--  A) reservations.eve_pickup 列（前日受け取り希望）。希望した予約は
--     開始日の前日も在庫を消費する（前日に道具を渡すため）。
--  B) reservation_members.board_type に 'none' を許可（板を借りない人＝
--     セットなしで単品だけの人。在庫チェックの対象外にする）。
--  C) RPC 3本を更新:
--     - get_availability_v2(p_start, p_end, p_eve): 前日込みの残数
--     - create_reservation_v2(..., p_eve_pickup): 前日込みの在庫チェック
--       ＋前日が休業日なら EVE_CLOSED、開始が当日なら EVE_IN_PAST
--     - lookup_reservation_v2: eve_pickup も返す
--  ※旧シグネチャは drop してから作り直す（同名2引数/9引数が残ると
--    デフォルト引数と曖昧になり PostgREST が解決できなくなるため）。
--    旧フロントの呼び出し（引数少なめ）はデフォルト値で今まで通り動く。
-- ============================================================

-- A) 前日受け取り列
alter table public.reservations
  add column if not exists eve_pickup boolean not null default false;

-- B) board_type に 'none' を許可
alter table public.reservation_members
  drop constraint if exists reservation_members_board_type_check;
alter table public.reservation_members
  add constraint reservation_members_board_type_check
  check (board_type in ('ski','snowboard','none'));

-- C-1) 期間の空き状況（前日受け取り込み）
drop function if exists public.get_availability_v2(date, date);
create or replace function public.get_availability_v2(p_start date, p_end date, p_eve boolean default false)
returns table (category text, remaining integer)
language plpgsql security definer set search_path = public as $$
declare v_from date;
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'INVALID_DATES' using errcode = 'P0001';
  end if;
  v_from := case when coalesce(p_eve,false) then p_start - 1 else p_start end;
  return query
  with days as (select generate_series(v_from, p_end, interval '1 day')::date d),
  stock as (
    select e.category cat, sum(e.total_quantity)::int total
    from equipment_items e where e.is_active group by e.category
  ),
  booked as (
    -- 各予約の占有期間＝(前日受け取りなら開始前日から)〜返却日
    select m.board_type cat, dd.d, count(*)::int used
    from reservation_members m
    join reservations r on r.id = m.reservation_id
    cross join lateral (select generate_series(
        r.rental_date - case when r.eve_pickup then 1 else 0 end,
        coalesce(r.return_date, r.rental_date), interval '1 day')::date d) dd
    where r.status in ('pending','confirmed')
      and m.board_type in ('ski','snowboard')
      and dd.d between v_from and p_end
    group by m.board_type, dd.d
  )
  select s.cat, (s.total - coalesce(max(b.used), 0))::int
  from stock s
  left join booked b on b.cat = s.cat
  where s.cat in ('ski','snowboard')
  group by s.cat, s.total;
end; $$;
grant execute on function public.get_availability_v2(date, date, boolean) to anon, authenticated;

-- C-2) 予約作成v2（前日受け取り＋セットなし対応）
drop function if exists public.create_reservation_v2(date,date,text,text,text,integer,integer,jsonb,text);
create or replace function public.create_reservation_v2(
  p_start date, p_end date,
  p_name text, p_phone text, p_email text,
  p_adults integer, p_children integer,
  p_members jsonb, p_notes text default null,
  p_eve_pickup boolean default false
)
returns table (reservation_id uuid, reservation_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_code text; v_m jsonb; v_no integer := 0;
  v_cat text; v_need integer; v_total integer; v_used integer; v_day date;
  v_from date;
begin
  if p_start is null or p_end is null or p_end < p_start then raise exception 'INVALID_DATES' using errcode='P0001'; end if;
  if p_start < current_date then raise exception 'DATE_IN_PAST' using errcode='P0001'; end if;
  if (p_end - p_start) > 30 then raise exception 'PERIOD_TOO_LONG' using errcode='P0001'; end if;
  if p_name is null or length(trim(p_name)) = 0 or p_phone is null or length(trim(p_phone)) < 10 then
    raise exception 'INVALID_CONTACT' using errcode='P0001'; end if;
  if p_members is null or jsonb_array_length(p_members) = 0 or jsonb_array_length(p_members) > 20 then
    raise exception 'INVALID_MEMBERS' using errcode='P0001'; end if;
  if coalesce(p_adults,0) + coalesce(p_children,0) <> jsonb_array_length(p_members) then
    raise exception 'MEMBER_COUNT_MISMATCH' using errcode='P0001'; end if;
  if exists (select 1 from closed_dates where closed_date between p_start and p_end) then
    raise exception 'SHOP_CLOSED_ON_DATE' using errcode='P0001'; end if;

  -- 前日受け取りの追加チェック
  if coalesce(p_eve_pickup,false) then
    if p_start - 1 < current_date then raise exception 'EVE_IN_PAST' using errcode='P0001'; end if;
    if exists (select 1 from closed_dates where closed_date = p_start - 1) then
      raise exception 'EVE_CLOSED' using errcode='P0001'; end if;
  end if;
  v_from := case when coalesce(p_eve_pickup,false) then p_start - 1 else p_start end;

  -- 予約処理を直列化（小規模店舗なので全体ロックで十分・レースなし）
  perform pg_advisory_xact_lock(hashtext('yatsumori_reservation'));

  -- カテゴリごとに（前日込みの）全日について残数チェック。
  -- board_type='none'（板を借りない・単品のみの人）は在庫チェック対象外。
  for v_cat, v_need in
    select m->>'board_type', count(*) from jsonb_array_elements(p_members) m group by m->>'board_type'
  loop
    if v_cat not in ('ski','snowboard','none') then raise exception 'INVALID_BOARD_TYPE' using errcode='P0001'; end if;
    if v_cat = 'none' then continue; end if;
    select coalesce(sum(total_quantity),0) into v_total from equipment_items where is_active and category = v_cat;
    for v_day in select generate_series(v_from, p_end, interval '1 day')::date loop
      select count(*) into v_used
      from reservation_members m join reservations r on r.id = m.reservation_id
      where r.status in ('pending','confirmed') and m.board_type = v_cat
        and v_day between (r.rental_date - case when r.eve_pickup then 1 else 0 end)
                      and coalesce(r.return_date, r.rental_date);
      if v_used + v_need > v_total then
        raise exception 'OUT_OF_STOCK:%:%', v_cat, v_day using errcode='P0001';
      end if;
    end loop;
  end loop;

  v_code := 'YR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into reservations (reservation_code, rental_date, return_date, customer_name, customer_phone,
    customer_email, party_size, adults, children, notes, status, eve_pickup)
  values (v_code, p_start, p_end, trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email,'')),''),
    jsonb_array_length(p_members), coalesce(p_adults,0), coalesce(p_children,0), p_notes, 'pending',
    coalesce(p_eve_pickup,false))
  returning id into v_id;

  for v_m in select * from jsonb_array_elements(p_members) loop
    v_no := v_no + 1;
    insert into reservation_members (reservation_id, member_no, height_cm, shoe_cm, board_type, is_child,
            age, gender, stance, nickname, set_type, addons)
    values (v_id, v_no, (v_m->>'height_cm')::int, (v_m->>'shoe_cm')::numeric, v_m->>'board_type',
            coalesce((v_m->>'is_child')::boolean, false),
            nullif(v_m->>'age','')::int,
            nullif(v_m->>'gender',''),
            nullif(v_m->>'stance',''),
            nullif(trim(coalesce(v_m->>'nickname','')),''),
            nullif(v_m->>'set_type',''),
            case when jsonb_typeof(v_m->'addons') = 'array' then v_m->'addons' else '[]'::jsonb end);
  end loop;

  return query select v_id, v_code;
end; $$;
grant execute on function public.create_reservation_v2(date,date,text,text,text,integer,integer,jsonb,text,boolean) to anon, authenticated;

-- C-3) 予約照会v2（eve_pickup も返す）
create or replace function public.lookup_reservation_v2(p_code text, p_phone text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'reservation_code', r.reservation_code, 'status', r.status,
    'rental_date', r.rental_date, 'return_date', coalesce(r.return_date, r.rental_date),
    'eve_pickup', coalesce(r.eve_pickup, false),
    'customer_name', r.customer_name, 'adults', r.adults, 'children', r.children,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'member_no', m.member_no, 'height_cm', m.height_cm, 'shoe_cm', m.shoe_cm,
        'board_type', m.board_type, 'is_child', m.is_child,
        'age', m.age, 'gender', m.gender, 'stance', m.stance,
        'nickname', m.nickname, 'set_type', m.set_type,
        'addons', coalesce(m.addons, '[]'::jsonb)) order by m.member_no)
      from reservation_members m where m.reservation_id = r.id), '[]'::jsonb))
  into v
  from reservations r
  where r.reservation_code = upper(trim(p_code)) and r.customer_phone = trim(p_phone);
  return v; -- 見つからなければ NULL（どちらが違うかは教えない）
end; $$;
grant execute on function public.lookup_reservation_v2(text, text) to anon, authenticated;
