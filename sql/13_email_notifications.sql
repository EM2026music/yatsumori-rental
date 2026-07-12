-- ============================================================
-- 13: 予約作成/キャンセル時のメール通知（ウィザード予約対応版）
--
-- 旧 sql/04_email_trigger.sql は古い予約形式（reservation_items）向けで
-- 今の予約フォーム（期間・利用者ごとの情報・前日受け取り・単品のみ）に
-- 対応していないため、reservation_members ベースで作り直したもの。
-- 04は実行不要（このファイルだけでOK）。何度実行してもOK（冪等）。
--
-- 【重要・このリポジトリはGitHubに公開されているため】
-- 通知を受け取るメールアドレスは、このSQLファイルには一切書き込まない。
-- 実行前に、SQL Editorで以下を1回だけ実行してVaultに保管すること
-- （これは実行してもgitには残らない・Supabase側にのみ保存される）:
--
--   select vault.create_secret('店に通知したいメールアドレス', 'shop_notification_email');
--
-- 事前準備:
--   1. Database → Extensions で pg_net を有効化（このファイルでも実行する）
--   2. Resend (https://resend.com) でアカウント作成（無料枠でOK）
--   3. SQL Editorで、APIキーとお店の通知先メールアドレスをVaultに保管:
--        select vault.create_secret('re_実際のAPIキー', 'resend_api_key');
--        select vault.create_secret('通知を受け取りたいメールアドレス', 'shop_notification_email');
--
-- 【送信元について・独自ドメイン未設定の間の練習モード】
-- 独自ドメインを認証していない間、Resendは "onboarding@resend.dev" からの
-- 送信のみ許可し、かつ送り先は「Resendアカウント作成時のメールアドレス」
-- 宛てにしか届かない（他の宛先は失敗する＝これはResend側の仕様）。
-- つまり練習中は、予約フォームのメール欄にも自分と同じアドレスを入れて
-- テストすると、お客様宛て確認メール・店舗宛て通知メールの両方が届く。
-- 将来、独自ドメインをResendで認証したら v_from の値を変えるだけでよい
-- （その他のコードは変更不要）。
-- ============================================================

create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 利用者一覧をメール本文用のHTMLに整形する共通関数
-- ------------------------------------------------------------
create or replace function public._format_members_html(p_reservation_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(string_agg(
    format(
      '%s. %s%s ／ 身長%scm・靴%scm ／ %s%s%s',
      m.member_no,
      case when m.is_child then '子供' else '大人' end,
      case when m.nickname is not null then '（' || m.nickname || '）' else '' end,
      m.height_cm, m.shoe_cm,
      case m.board_type
        when 'ski' then 'スキー' when 'snowboard' then 'スノーボード' else '板レンタルなし' end,
      case when m.set_type = 'gliding' then '・滑走セット'
           when m.set_type = 'full' then '・フルセット'
           when m.set_type = 'none' then '・セットなし' else '' end,
      case when m.addons is not null and jsonb_array_length(m.addons) > 0
           then '・追加(' || (select string_agg(a::text, '・') from jsonb_array_elements_text(m.addons) a) || ')'
           else '' end
    ), '<br>' order by m.member_no)
  , '')
  from public.reservation_members m
  where m.reservation_id = p_reservation_id;
$$;

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
  v_api_key    text;
  v_shop_email text;
  v_members    text;
  v_period     text;
  v_eve        text;
  v_from       text := '8つ森レンタル <onboarding@resend.dev>';
begin
  select decrypted_secret into v_api_key from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into v_shop_email from vault.decrypted_secrets where name = 'shop_notification_email';

  -- キー未設定なら何もせず終了する（メールが無くても予約自体は成立させる）
  if v_api_key is null then
    return new;
  end if;

  v_period := to_char(new.rental_date, 'YYYY/MM/DD') ||
    case when new.return_date is not null and new.return_date <> new.rental_date
      then ' 〜 ' || to_char(new.return_date, 'YYYY/MM/DD') else '（日帰り）' end;
  v_eve := case when new.eve_pickup then '<br>前日受け取り: 希望する（前日午後2時〜）' else '' end;
  v_members := public._format_members_html(new.id);

  -- 顧客への確認メール（メール未入力なら送らない）
  if new.customer_email is not null then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_api_key),
      body := jsonb_build_object(
        'from', v_from,
        'to', new.customer_email,
        'subject', '【8つ森レンタル】ご予約を受け付けました (' || new.reservation_code || ')',
        'html', format(
          'ご予約ありがとうございます。<br><br>予約番号: <b>%s</b><br>ご利用期間: %s%s<br>お名前: %s 様<br>人数: 大人%s名%s<br><br>【ご利用者】<br>%s<br><br>お支払いは当日ご来店時に現金でお願いします。<br>営業時間 8:00〜17:00（不定休）／お電話 070-2472-3633',
          new.reservation_code, v_period, v_eve, new.customer_name,
          coalesce(new.adults, new.party_size), case when coalesce(new.children,0) > 0 then ' / 子供' || new.children || '名' else '' end,
          v_members
        )
      )
    );
  end if;

  -- 店舗への新規予約通知
  if v_shop_email is not null then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_api_key),
      body := jsonb_build_object(
        'from', v_from,
        'to', v_shop_email,
        'subject', '【新規予約】' || v_period || ' ' || new.customer_name || '様',
        'html', format(
          '新規予約が入りました。<br><br>予約番号: %s<br>ご利用期間: %s%s<br>お名前: %s 様<br>電話: %s<br>メール: %s<br>人数: 大人%s名%s<br>ご要望: %s<br><br>【ご利用者】<br>%s',
          new.reservation_code, v_period, v_eve, new.customer_name, new.customer_phone,
          coalesce(new.customer_email, '（未入力）'),
          coalesce(new.adults, new.party_size), case when coalesce(new.children,0) > 0 then ' / 子供' || new.children || '名' else '' end,
          coalesce(new.notes, '（なし）'),
          v_members
        )
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_reservation_created on public.reservations;
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
  v_from    text := '8つ森レンタル <onboarding@resend.dev>';
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select decrypted_secret into v_api_key from vault.decrypted_secrets where name = 'resend_api_key';

    if v_api_key is not null and new.customer_email is not null then
      perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_api_key),
        body := jsonb_build_object(
          'from', v_from,
          'to', new.customer_email,
          'subject', '【8つ森レンタル】ご予約をキャンセルしました (' || new.reservation_code || ')',
          'html', format('予約番号 %s のご予約をキャンセルしました。またのご利用をお待ちしております。', new.reservation_code)
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_reservation_cancelled on public.reservations;
create trigger trg_notify_reservation_cancelled
  after update on public.reservations
  for each row execute function public.notify_reservation_cancelled();

-- 備考: net.http_post はトランザクションのコミット後に非同期で発火するため、
-- メールAPIの成否は予約データの保存とは無関係（メール障害が予約を
-- ロールバックすることは無い）。送信ログは以下で確認できる:
--   select * from net._http_response order by created desc limit 20;
