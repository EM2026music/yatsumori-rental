// 公開ページの「差し替えローダー」。
//
// 仕組み:
//   1. 静的HTML（index.html本体）がそのまま最初に表示される（フォールバック）。
//   2. Supabaseに保存済みの内容(site_pages)があれば、それで #page-root の中身を置き換える。
//   3. 保存が無い・通信エラー・タイムアウトの場合は何もしない＝静的HTMLのまま。
//
// これにより「エディタで一度も保存していない状態」では本番サイトの見た目は
// 一切変わらない（ゼロリグレッション）。

(function () {
  const PAGE_KEY = window.YATSUMORI_PAGE_KEY;
  if (!PAGE_KEY || typeof sb === "undefined") return;

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms)),
    ]);
  }

  function rebindNavToggle() {
    const btn = document.getElementById("menu-btn");
    const nav = document.getElementById("global-nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", () => nav.classList.toggle("open"));
  }

  async function applyPublishedContent() {
    try {
      const { data, error } = await withTimeout(
        sb.from("site_pages").select("html, css").eq("page_key", PAGE_KEY).maybeSingle(),
        4000
      );
      if (error || !data || !data.html) return; // フォールバックのまま

      const root = document.getElementById("page-root");
      if (!root) return;
      root.innerHTML = data.html;

      if (data.css) {
        const styleEl = document.createElement("style");
        styleEl.id = "published-css";
        styleEl.textContent = data.css;
        document.head.appendChild(styleEl); // 既存スタイルの後ろに追加（既存を消さない）
      }

      rebindNavToggle();
      if (typeof window.__yatsumoriRebind === "function") { try { window.__yatsumoriRebind(); } catch (e) {} }
    } catch (e) {
      // タイムアウト・通信エラー等：何もしない＝静的HTMLのまま表示され続ける
    } finally {
      // エディタ側が「差し替えチェック完了」を検知するためのフラグ
      window.__yatsumoriPageReady = true;
    }
  }

  applyPublishedContent();
})();
