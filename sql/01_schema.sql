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
