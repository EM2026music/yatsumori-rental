-- ============================================================
-- 08: 予約ウィザード対応（期間レンタル・大人/子供・1人ずつの情報）
-- 実行方法: SupabaseダッシュボードのSQL Editorに全文貼り付けて実行
-- 既存の予約(単日・サイズ指定式)はそのまま残る。新フローは *_v2 を使う。
-- ============================================================

-- 1) 予約テーブルに期間と人数内訳を追加
alter table public.reservations
  add column if not exists return_date date,          -- 返却日（NULL=従来の単日予約）
  add column if not exists adults   integer,          -- 大人人数
  add column if not exists children integer;          -- 子供人数（小学生まで）

-- 2) メンバー（予約者1人ずつ）テーブル
create table if not exists public.reservation_members (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  member_no      integer not null,                    -- 1,2,3...
  height_cm      integer not null check (height_cm between 80 and 220),
  shoe_cm        numeric(4,1) not null check (shoe_cm between 14 and 33),
  board_type     text not null check (board_type in ('ski','snowboard')),
  is_child       boolean not null default false,      -- 小学生まで=true（子供料金）
  created_at     timestamptz not null default now()
);
create index if not exists idx_res_members_res on public.reservation_members (reservation_id);

alter table public.reservation_members enable row level security;
create policy "admin full access reservation members" on public.reservation_members
  for all to authenticated using (true) with check (true);
-- anonにはポリシーを作らない＝RPC経由のみ（reservationsと同じ方針）

-- 3) 期間の空き状況（カテゴリ単位の残数。板はスタッフが身長から選ぶ運用のため
--    サイズ単位でなくカテゴリ合計本数で在庫管理する）
create or replace function public.get_availability_v2(p_start date, p_end date)
returns table (category text, remaining integer)
language plpgsql security definer set search_path = public as $$
declare v_day date;
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'INVALID_DATES' using errcode = 'P0001';
  end if;
  return query
  with days as (select generate_series(p_start, p_end, interval '1 day')::date d),
  stock as (
    select e.category cat, sum(e.total_quantity)::int total
    from equipment_items e where e.is_active group by e.category
  ),
  booked as (
    select m.board_type cat, dd.d, count(*)::int used
    from reservation_members m
    join reservations r on r.id = m.reservation_id
    cross join lateral (select generate_series(r.rental_date, coalesce(r.return_date, r.rental_date), interval '1 day')::date d) dd
    where r.status in ('pending','confirmed') and dd.d between p_start and p_end
    group by m.board_type, dd.d
  )
  select s.cat, (s.total - coalesce(max(b.used), 0))::int
  from stock s
  left join booked b on b.cat = s.cat
  where s.cat in ('ski','snowboard')
  group by s.cat, s.total;
end; $$;
grant execute on function public.get_availability_v2(date, date) to anon, authenticated;

-- 4) 予約作成v2（期間・メンバー配列）。advisoryロックで直列化して二重予約を防ぐ。
--    p_members例: [{"height_cm":170,"shoe_cm":26.5,"board_type":"ski","is_child":false}, ...]
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

  -- 予約処理を直列化（小規模店舗なので全体ロックで十分・レースなし）
  perform pg_advisory_xact_lock(hashtext('yatsumori_reservation'));

  -- カテゴリごとに期間内の全日について残数チェック
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
    insert into reservation_members (reservation_id, member_no, height_cm, shoe_cm, board_type, is_child)
    values (v_id, v_no, (v_m->>'height_cm')::int, (v_m->>'shoe_cm')::numeric, v_m->>'board_type',
            coalesce((v_m->>'is_child')::boolean, false));
  end loop;

  return query select v_id, v_code;
end; $$;
grant execute on function public.create_reservation_v2(date,date,text,text,text,integer,integer,jsonb,text) to anon, authenticated;

-- 5) 予約照会v2（メンバーと期間も返す）
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
        'board_type', m.board_type, 'is_child', m.is_child) order by m.member_no)
      from reservation_members m where m.reservation_id = r.id), '[]'::jsonb))
  into v
  from reservations r
  where r.reservation_code = upper(trim(p_code)) and r.customer_phone = trim(p_phone);
  return v; -- 見つからなければ NULL（どちらが違うかは教えない）
end; $$;
grant execute on function public.lookup_reservation_v2(text, text) to anon, authenticated;
