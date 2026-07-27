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

  // ナビ再配線＋ページ固有の自己修復（catalogのギャラリー描画など）をまとめて実行
  function runRebind() {
    rebindNavToggle();
    if (typeof window.__yatsumoriRebind === "function") { try { window.__yatsumoriRebind(); } catch (e) {} }
  }

  async function applyPublishedContent() {
    try {
      const { data, error } = await withTimeout(
        sb.from("site_pages").select("html, css").eq("page_key", PAGE_KEY).maybeSingle(),
        4000
      );
      if (error || !data || !data.html) return; // フォールバックのまま（各ページが自前でrebindする設計は維持）

      const root = document.getElementById("page-root");
      if (!root) return;

      // スマホ幅では、エディタで760px固定にキャンバス化された公開版を使わない。
      // （静的HTMLはレスポンシブなので、そのまま表示した方がスマホで正しく収まる。
      //  該当ページ＝pricing/beginner-guide/catalog/waxing 等、絶対配置＋760px保存版）
      const isNarrow = window.matchMedia("(max-width: 760px)").matches;
      const isFixedWide =
        /width:\s*7[0-9]{2}px/.test(data.html) ||
        /width:\s*7[0-9]{2}px/.test(data.css || "") ||
        /position:\s*absolute/.test(data.html);
      if (isNarrow && isFixedWide) {
        // 公開版は差し込まず静的HTMLのまま。ただしrebind（catalogのギャラリー描画等）は実行
        runRebind();
        return;
      }

      root.innerHTML = data.html;

      if (data.css) {
        const styleEl = document.createElement("style");
        styleEl.id = "published-css";
        styleEl.textContent = data.css;
        document.head.appendChild(styleEl); // 既存スタイルの後ろに追加（既存を消さない）
      }

      runRebind();
    } catch (e) {
      // タイムアウト・通信エラー等：何もしない＝静的HTMLのまま表示され続ける
    } finally {
      // エディタ側が「差し替えチェック完了」を検知するためのフラグ
      window.__yatsumoriPageReady = true;
    }
  }

  applyPublishedContent();
})();
