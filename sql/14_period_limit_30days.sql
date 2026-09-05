-- ============================================================
-- 14: レンタル期間の上限を「開始日・返却日を含めて最大30日間」に統一
-- 実行方法: SupabaseダッシュボードのSQL Editorに全文貼り付けて実行
-- 何度実行してもOK（冪等）。
--
-- 背景:
--   画面の日数は開始日・返却日を含む数え方（reserve.html の rentalDays()）。
--   これまでのサーバー判定は (p_end - p_start) > 30 だったため、
--   例）12/1〜12/31 は差が30日で通過してしまい、実際には31日間貸せていた。
--   案内文（booking.js の PERIOD_TOO_LONG）は「30日以内」と表示している。
--
-- 変更:
--   (p_end - p_start) > 30  →  > 29
--   これで 12/1〜12/30（30日間）まで許可、12/1〜12/31（31日間）は PERIOD_TOO_LONG。
--
-- 対象は create_reservation_v2 の1本のみ。
--   ※08〜11の同名関数は12で上書き済みのため、本番に効いているのは12の版だけ。
--   ※シグネチャは12と完全に同一なので drop 不要（create or replace で置き換わる）。
--     引数: (date,date,text,text,text,integer,integer,jsonb,text,boolean)
--   ※関数の中身は12から丸ごとコピーし、上限の数字だけを変えている。
-- ============================================================

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
  if (p_end - p_start) > 29 then raise exception 'PERIOD_TOO_LONG' using errcode='P0001'; end if;
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
