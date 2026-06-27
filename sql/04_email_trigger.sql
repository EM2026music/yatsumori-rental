-- ============================================================
-- 04_email_trigger.sql — 予約作成/キャンセル時のメール通知
--
-- 事前準備（このファイルを実行する前に）:
--   1. Database → Extensions で pg_net を有効化
--   2. Resend (https://resend.com) でアカウント作成し、送信用ドメインを
--      DNSで認証してAPIキーを発行する
--   3. SQL Editor で以下を実行してAPIキーをVaultに保管する:
--        select vault.create_secret('re_実際のAPIキー', 'resend_api_key');
--
-- 下記2箇所の [[ ]] 部分は実際の値に置き換えてから実行すること:
--   [[SHOP_NOTIFICATION_EMAIL]] … 新規予約通知を受け取る店舗側メールアドレス
--   [[SENDING_DOMAIN]]          … Resendで認証済みの送信元ドメイン
-- ============================================================

create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 予約作成時: 顧客への確認メール + 店舗への通知メール
-- ------------------------------------------------------------
create or replace function public.notify_reservation_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_key     text;
  v_items_html  text;
  v_shop_email  text := '[[SHOP_NOTIFICATION_EMAIL]]';
  v_from        text := '8つ森レンタル <reservations@[[SENDING_DOMAIN]]>';
begin
  select decrypted_secret into v_api_key
    from vault.decrypted_secrets
    where name = 'resend_api_key';

  -- キー未設定なら何もせず終了する（メールが無くても予約自体は成立させる）
  if v_api_key is null then
    return new;
  end if;

  select coalesce(string_agg(
    format('%s %s × %s', ei.category, ei.size_label, ri.quantity), '<br>'
  ), '')
  into v_items_html
  from public.reservation_items ri
  join public.equipment_items ei on ei.id = ri.equipment_item_id
  where ri.reservation_id = new.id;

  -- 顧客への確認メール（メール未入力なら送らない）
  if new.customer_email is not null then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_api_key
      ),
      body := jsonb_build_object(
        'from', v_from,
        'to', new.customer_email,
        'subject', '【8つ森レンタル】ご予約を受け付けました (' || new.reservation_code || ')',
        'html', format(
          'ご予約ありがとうございます。<br>予約番号: <b>%s</b><br>日付: %s<br>お名前: %s 様<br>人数: %s名<br><br>%s<br><br>当日は営業時間内にご来店ください。',
          new.reservation_code, new.rental_date, new.customer_name, new.party_size, v_items_html
        )
      )
    );
  end if;

  -- 店舗への新規予約通知
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_api_key
    ),
    body := jsonb_build_object(
      'from', v_from,
      'to', v_shop_email,
      'subject', '【新規予約】' || new.rental_date || ' ' || new.customer_name || '様',
      'html', format(
        '新規予約が入りました。<br>予約番号: %s<br>日付: %s<br>お名前: %s 様<br>電話: %s<br>人数: %s名<br><br>%s',
        new.reservation_code, new.rental_date, new.customer_name, new.customer_phone, new.party_size, v_items_html
      )
    )
  );

  return new;
end;
$$;

create trigger trg_notify_reservation_created
  after insert on public.reservations
  for each row execute function public.notify_reservation_created();

-- ------------------------------------------------------------
-- キャンセル時: 顧客へのキャンセル確認メール
-- ------------------------------------------------------------
create or replace function public.notify_reservation_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_key text;
  v_from    text := '8つ森レンタル <reservations@[[SENDING_DOMAIN]]>';
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select decrypted_secret into v_api_key
      from vault.decrypted_secrets where name = 'resend_api_key';

    if v_api_key is not null and new.customer_email is not null then
      perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_api_key
        ),
        body := jsonb_build_object(
          'from', v_from,
          'to', new.customer_email,
          'subject', '【8つ森レンタル】ご予約をキャンセルしました (' || new.reservation_code || ')',
          'html', format('予約番号 %s のご予約をキャンセルしました。', new.reservation_code)
        )
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_notify_reservation_cancelled
  after update on public.reservations
  for each row execute function public.notify_reservation_cancelled();

-- 備考: net.http_post はトランザクションのコミット後に非同期で発火するため、
-- メールAPIの成否は予約データの保存とは無関係（メール障害が予約を
-- ロールバックすることは無い）。送信ログは以下で確認できる:
--   select * from net._http_response order by created desc limit 20;
