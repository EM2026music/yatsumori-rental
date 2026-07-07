-- ============================================================
-- 11: 予約者ごとに「追加レンタル（単品）」を追加
-- 実行方法: SupabaseダッシュボードのSQL Editorに全文貼り付けて実行
-- addons は文字列の配列(jsonb)。例 ["helmet","goggle"]。任意（空配列可）。
-- 値: helmet / goggle / sled / snowshoe / harness（料金はフロント側で計算）
-- 既存予約は [] のまま。何度実行してもOK（冪等）。
-- ============================================================

-- 1) 列を追加
alter table public.reservation_members
  add column if not exists addons jsonb not null default '[]'::jsonb;

-- 2) 予約作成v2を更新（メンバーjsonbから addons も保存）。署名は不変。
create or replace function public.create_reservation_v2(
  p_start date, p_end date,
  p_name text, p_phone text, p_email text,
  p_adults integer, p_children integer,
  p_members jsonb, p_notes text default null
)
returns table (reservation_id uuid, reservation_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_code text; v_m jsonb; v_no integer := 0;
  v_cat text; v_need integer; v_total integer; v_used integer; v_day date;
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

  perform pg_advisory_xact_lock(hashtext('yatsumori_reservation'));

  for v_cat, v_need in
    select m->>'board_type', count(*) from jsonb_array_elements(p_members) m group by m->>'board_type'
  loop
    if v_cat not in ('ski','snowboard') then raise exception 'INVALID_BOARD_TYPE' using errcode='P0001'; end if;
    select coalesce(sum(total_quantity),0) into v_total from equipment_items where is_active and category = v_cat;
    for v_day in select generate_series(p_start, p_end, interval '1 day')::date loop
      select count(*) into v_used
      from reservation_members m join reservations r on r.id = m.reservation_id
      where r.status in ('pending','confirmed') and m.board_type = v_cat
        and v_day between r.rental_date and coalesce(r.return_date, r.rental_date);
      if v_used + v_need > v_total then
        raise exception 'OUT_OF_STOCK:%:%', v_cat, v_day using errcode='P0001';
      end if;
    end loop;
  end loop;

  v_code := 'YR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into reservations (reservation_code, rental_date, return_date, customer_name, customer_phone,
    customer_email, party_size, adults, children, notes, status)
  values (v_code, p_start, p_end, trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email,'')),''),
    jsonb_array_length(p_members), coalesce(p_adults,0), coalesce(p_children,0), p_notes, 'pending')
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
grant execute on function public.create_reservation_v2(date,date,text,text,text,integer,integer,jsonb,text) to anon, authenticated;

-- 3) 予約照会v2も addons を返す
create or replace function public.lookup_reservation_v2(p_code text, p_phone text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'reservation_code', r.reservation_code, 'status', r.status,
    'rental_date', r.rental_date, 'return_date', coalesce(r.return_date, r.rental_date),
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
  return v;
end; $$;
grant execute on function public.lookup_reservation_v2(text, text) to anon, authenticated;
