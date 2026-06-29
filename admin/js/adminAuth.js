// 全admin画面で共有するセッション管理。
//
// 重要: このリダイレクトはUX上の便宜であり、実セキュリティ境界ではない。
// admin配下のHTMLはGitHub Pages上で誰でも閲覧できる。本当の防御はSupabase側の
// RLS（reservations等はauthenticatedロールにしかアクセスを許可していない）。
// 未ログインでこのページを直接開いても、データ取得クエリは空/403になる。

async function requireAdminSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = "login.html";
}

// admin共通ヘッダー/ナビをページに描画するヘルパー
function renderAdminChrome(activeKey) {
  const items = [
    { key: "index", label: "ダッシュボード", href: "index.html" },
    { key: "reservations", label: "予約一覧", href: "reservations.html" },
    { key: "inventory", label: "在庫管理", href: "inventory.html" },
    { key: "closed", label: "休業日", href: "closed-dates.html" },
  ];
  const nav = items.map((it) =>
    `<a href="${it.href}" class="${it.key === activeKey ? "active" : ""}">${it.label}</a>`
  ).join("");

  const headerEl = document.getElementById("admin-header");
  if (headerEl) {
    headerEl.innerHTML = `
      <div class="admin-badge">🔒 管理者専用ページ（スタッフ以外は操作しないでください）</div>
      <div class="subpage-header" style="justify-content:space-between">
        <span class="subpage-title">8つ森レンタル 管理</span>
        <button class="btn-sm" onclick="signOut()">ログアウト</button>
      </div>
      <nav class="admin-nav">${nav}</nav>`;
  }
}
