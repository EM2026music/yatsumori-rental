// 予約まわりの共有ロジック。reserve.html と reserve-lookup.html の両方から使う。
// 実際のアクセス制御はすべてSupabase側（RLS + security definer関数）が担うので、
// ここはそのRPCを呼ぶ薄いラッパーに徹する。

const CATEGORY_LABEL = {
  ski: "スキー",
  snowboard: "スノーボード",
  boots: "ブーツ",
};

// 指定日付で在庫の残っているサイズ一覧を取得する。
// 戻り値: [{ equipment_item_id, category, size_label, remaining }, ...]
async function fetchAvailability(dateStr) {
  const { data, error } = await sb.rpc("get_availability", { p_date: dateStr });
  if (error) throw error;
  return data || [];
}

// 予約を作成する。items は [{ equipment_item_id, quantity }, ...]。
// 成功時: { reservation_id, reservation_code }
async function createReservation({ rentalDate, name, phone, email, partySize, items, notes }) {
  const { data, error } = await sb.rpc("create_reservation", {
    p_rental_date: rentalDate,
    p_customer_name: name,
    p_customer_phone: phone,
    p_customer_email: email || null,
    p_party_size: partySize,
    p_items: items,
    p_notes: notes || null,
  });
  if (error) throw error;
  // returns table なので配列で返る。先頭行を取り出す。
  return Array.isArray(data) ? data[0] : data;
}

// ===== v2（期間レンタル・大人/子供・1人ずつの情報）=====

// 期間の空き状況（カテゴリ単位の残数）。戻り値: { ski: n, snowboard: n }
async function fetchAvailabilityV2(startStr, endStr) {
  const { data, error } = await sb.rpc("get_availability_v2", { p_start: startStr, p_end: endStr });
  if (error) throw error;
  const out = { ski: 0, snowboard: 0 };
  (data || []).forEach((r) => { out[r.category] = r.remaining; });
  return out;
}

// 予約作成v2。members は [{ height_cm, shoe_cm, board_type, is_child }, ...]。
// 成功時: { reservation_id, reservation_code }
async function createReservationV2({ start, end, name, phone, email, adults, children, members, notes }) {
  const { data, error } = await sb.rpc("create_reservation_v2", {
    p_start: start,
    p_end: end,
    p_name: name,
    p_phone: phone,
    p_email: email || null,
    p_adults: adults,
    p_children: children,
    p_members: members,
    p_notes: notes || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// 予約照会v2（メンバー・期間つき）。一致が無ければ null。
async function lookupReservationV2(code, phone) {
  const { data, error } = await sb.rpc("lookup_reservation_v2", {
    p_code: code,
    p_phone: phone,
  });
  if (error) throw error;
  return data || null; // jsonb を返す（見つからなければ null）
}

// 予約を検索する（コード＋電話番号）。一致が無ければ null。
async function lookupReservation(code, phone) {
  const { data, error } = await sb.rpc("lookup_reservation", {
    p_reservation_code: code,
    p_customer_phone: phone,
  });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0];
}

// 予約をキャンセルする（コード＋電話番号を再検証）。
async function cancelReservation(code, phone) {
  const { data, error } = await sb.rpc("cancel_reservation", {
    p_reservation_code: code,
    p_customer_phone: phone,
  });
  if (error) throw error;
  return data;
}

// Supabaseのエラーメッセージ（RPC関数がraiseした文字列）を
// 日本語のわかりやすい文言に変換する。
function translateError(error) {
  const msg = (error && (error.message || error.hint || "")) || "";
  if (msg.includes("OUT_OF_STOCK")) return "ご希望の期間・用具は満数になりました。日程を変えるか、お電話（070-2472-3633）でご相談ください。";
  if (msg.includes("SHOP_CLOSED_ON_DATE")) return "期間内に休業日が含まれています。別の日をお選びください。";
  if (msg.includes("DATE_IN_PAST")) return "過去の日付は予約できません。";
  if (msg.includes("INVALID_DATES")) return "利用日の指定が正しくありません。開始日と返却日をご確認ください。";
  if (msg.includes("PERIOD_TOO_LONG")) return "レンタル期間が長すぎます。30日以内でお選びください。";
  if (msg.includes("INVALID_CONTACT")) return "お名前と、当日つながる電話番号（10桁以上）をご入力ください。";
  if (msg.includes("MEMBER_COUNT_MISMATCH")) return "人数と、入力された利用者の数が一致していません。";
  if (msg.includes("INVALID_MEMBERS") || msg.includes("INVALID_BOARD_TYPE")) return "利用者の情報をご確認ください。";
  if (msg.includes("INVALID_QUANTITY")) return "数量の指定が正しくありません。";
  if (msg.includes("INVALID_INPUT")) return "入力内容を確認してください。";
  if (msg.includes("EQUIPMENT_NOT_FOUND") || msg.includes("EQUIPMENT_INACTIVE"))
    return "選択した用具は現在ご利用いただけません。";
  if (msg.includes("ALREADY_CANCELLED")) return "この予約はすでにキャンセル済みです。";
  if (msg.includes("NOT_FOUND")) return "予約が見つかりませんでした。予約番号と電話番号をご確認ください。";
  return "通信エラーが発生しました。時間をおいて再度お試しください。";
}

// 今日の日付を YYYY-MM-DD 文字列で返す（ローカルタイム）。
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// YYYY-MM-DD に日数を足した文字列を返す。
function addDaysStr(baseStr, days) {
  const d = new Date(baseStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
