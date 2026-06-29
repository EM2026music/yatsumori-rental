-- ============================================================
-- 8つ森レンタル セットアップSQL（まとめて1回実行する用）
-- 中身: スキーマ → RLS → 関数 → サンプル在庫
-- （メール通知 04 はResend設定後に別途実行）
-- ============================================================

-- ============================================================
-- 01_schema.sql — 8つ森レンタル 予約システム コアスキーマ
-- Supabase の SQL Editor に貼って実行する
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- equipment_items ----------
-- カテゴリ×サイズごとの在庫1行（例: ski / 160cm / 5本）
create table public.equipment_items (
  id              uuid primary key default gen_random_uuid(),
  category        text not null check (category in ('ski', 'snowboard', 'boots')),
  size_label      text not null,
  total_quantity  integer not null check (total_quantity >= 0),
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (category, size_label)
);

-- ---------- closed_dates ----------
-- 不定休のため固定曜日休みではなく個別の休業日を登録する
create table public.closed_dates (
  closed_date  date primary key,
  reason       text,
  created_at   timestamptz not null default now()
);

-- ---------- business_settings ----------
-- 営業時間・予約可能な先行日数の設定（単一行）
create table public.business_settings (
  id                smallint primary key default 1 check (id = 1),
  open_time         time not null default '08:30',
  close_time        time not null default '18:00',
  max_advance_days  integer not null default 90,
  updated_at        timestamptz not null default now()
);
insert into public.business_settings (id) values (1);

-- ---------- reservations ----------
create type public.reservation_status as enum ('pending', 'confirmed', 'cancelled');

create table public.reservations (
  id                uuid primary key default gen_random_uuid(),
  reservation_code  text not null unique,           -- 'YR-XXXXXX'
  rental_date       date not null,                  -- v1は単日レンタルのみ
  customer_name     text not null,
  customer_phone    text not null,
  customer_email    text,
  party_size        integer not null check (party_size > 0),
  status            public.reservation_status not null default 'pending',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  cancelled_at      timestamptz
);

create index idx_reservations_date on public.reservations (rental_date);
create index idx_reservations_lookup on public.reservations (reservation_code, customer_phone);

-- ---------- reservation_items ----------
-- どの予約がどのサイズを何個押さえているか
create table public.reservation_items (
  id                 uuid primary key default gen_random_uuid(),
  reservation_id     uuid not null references public.reservations (id) on delete cascade,
  equipment_item_id  uuid not null references public.equipment_items (id),
  quantity           integer not null check (quantity > 0),
  created_at         timestamptz not null default now()
);

create index idx_reservation_items_reservation on public.reservation_items (reservation_id);
create index idx_reservation_items_equipment on public.reservation_items (equipment_item_id);

-- ---------- updated_at 自動更新 ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_equipment_items_updated_at
  before update on public.equipment_items
  for each row execute function public.set_updated_at();

create trigger trg_reservations_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

create trigger trg_business_settings_updated_at
  before update on public.business_settings
  for each row execute function public.set_updated_at();

-- ---------- 管理者について ----------
-- 専用のadminテーブルは作らない。Supabase Auth (auth.users) に
-- ダッシュボードから手動で追加したユーザー = スタッフ、という前提。
-- 公開signupフォームはどこにも作らない。


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


-- ============================================================
-- 05_seed_data.sql — 在庫データの投入テンプレート
--
-- これはサンプルです。実際の店舗の在庫（サイズと本数）が分かったら
-- この内容を実数に置き換えてSQL Editorで実行してください。
-- ============================================================

insert into public.equipment_items (category, size_label, total_quantity) values
  ('ski', '140cm', 3),
  ('ski', '150cm', 5),
  ('ski', '160cm', 6),
  ('ski', '170cm', 4),
  ('snowboard', '140cm', 3),
  ('snowboard', '150cm', 5),
  ('snowboard', '155cm', 4),
  ('boots', '24.0cm', 4),
  ('boots', '25.0cm', 5),
  ('boots', '26.0cm', 5),
  ('boots', '27.0cm', 4),
  ('boots', '28.0cm', 3)
on conflict (category, size_label) do nothing;
