// ビジュアルエディタのブロック定義。
// エディタにはホームページの<style>がまるごと読み込まれるため、
// 同じクラスを使えば見た目は自動的に既存デザインと揃う。

function registerYatsumoriBlocks(editor) {
  const bm = editor.BlockManager;
  const CAT = "8つ森レンタル";
  const CAT2 = "汎用パーツ";

  // ── 8つ森レンタル用ブロック ──

  bm.add("block-hero", {
    label: "ヒーロー<br>（見出し＋写真）",
    category: CAT,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="1"/><path d="M2 17l5-5 4 4 3-3 5 5"/></svg>`,
    content: `
      <section class="hero">
        <img class="hero-photo" src="../assets/img/hero-ski.jpg" alt="蔵王の雪山">
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <h1 class="hero-title">見出しテキスト<br>2行目</h1>
          <p class="hero-text">サブテキスト</p>
          <p class="hero-desc">説明文をここに入力します。</p>
        </div>
      </section>`,
  });

  bm.add("block-booking-card", {
    label: "予約カード",
    category: CAT,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    content: `
      <div class="booking-card">
        <p class="booking-card-title">かんたんWEB予約</p>
        <div class="booking-steps">
          <div class="booking-step"><div class="booking-step-icon">📅</div><div class="booking-step-label">日付を選ぶ</div></div>
          <span class="booking-step-chevron">&gt;</span>
          <div class="booking-step"><div class="booking-step-icon">👤</div><div class="booking-step-label">人数を入力</div></div>
          <span class="booking-step-chevron">&gt;</span>
          <div class="booking-step"><div class="booking-step-icon">✓</div><div class="booking-step-label">完了！</div></div>
        </div>
        <a class="btn btn-primary" href="../reserve.html">📅 今すぐ予約する</a>
        <a class="btn btn-secondary" href="../reserve-lookup.html">予約の確認・変更はこちら</a>
      </div>`,
  });

  bm.add("block-badges", {
    label: "特徴バッジ<br>（4つ）",
    category: CAT,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>`,
    content: `
      <div class="badges">
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
      </div>`,
  });

  bm.add("block-service-card", {
    label: "サービスカード<br>（1枚）",
    category: CAT,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
    content: `
      <a class="content-card" style="background-image:url('../assets/img/catalog.jpg')" href="#">
        <h3 class="content-card-title">タイトル</h3>
        <p class="content-card-desc">説明文</p>
        <span class="pill-btn">詳しく見る &gt;</span>
      </a>`,
  });

  bm.add("block-recommend-card", {
    label: "おすすめ情報<br>（1枚）",
    category: CAT,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    content: `
      <a class="recommend-card" href="#">
        <img class="recommend-photo" src="../assets/img/onsen.jpg" alt="">
        <p class="recommend-title">タイトル</p>
        <p class="recommend-sub">説明文</p>
      </a>`,
  });

  bm.add("block-review-card", {
    label: "お客様の声<br>（1枚）",
    category: CAT,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
    content: `
      <div class="review-card">
        <div class="review-avatar"></div>
        <p class="review-text">レビュー本文をここに入力</p>
        <span class="review-stars">★★★★★</span>
      </div>`,
  });

  bm.add("block-footer", {
    label: "フッター<br>（店舗情報）",
    category: CAT,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>`,
    content: `
      <footer class="footer-bar">
        <div class="footer-top">
          <img class="footer-photo" src="../assets/img/shop-thumb.jpg" alt="">
          <div class="footer-info">
            <div class="footer-info-row">📍 住所をここに入力</div>
            <div class="footer-info-row">🕒 営業時間をここに入力</div>
            <div class="footer-info-row">📞 電話番号をここに入力</div>
          </div>
        </div>
        <div class="footer-actions">
          <a class="footer-action-btn" href="#">📷 Instagramを見る</a>
          <a class="footer-action-btn" href="#">📍 アクセス</a>
        </div>
      </footer>`,
  });

  // ── 汎用パーツ ──

  bm.add("block-text", {
    label: "テキスト",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h16M4 18h12"/></svg>`,
    content: {
      type: "text",
      content: "ここにテキストを入力してください。ダブルクリックで編集できます。",
      style: { padding: "12px", "font-size": "15px", "line-height": "1.7" },
      editable: true,
    },
  });

  bm.add("block-heading", {
    label: "見出し",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h4m0 0v12m0-6h8m0 0V6m0 6v6m0-12h4"/></svg>`,
    content: {
      tagName: "h2",
      type: "text",
      content: "見出しテキスト",
      style: { "font-size": "28px", "font-weight": "700", "margin": "16px 0 8px", "color": "#1a2040" },
      editable: true,
    },
  });

  bm.add("block-image", {
    label: "画像",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
    content: {
      type: "image",
      style: {
        width: "100%",
        "max-width": "100%",
        height: "auto",
        display: "block",
      },
      resizable: {
        handles: "e,se,s,sw,w",
        minDim: 40,
        updateTarget(el, rect) {
          el.style.width = rect.w + "px";
        },
      },
      editable: true,
    },
  });

  bm.add("block-button", {
    label: "ボタン",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="8" width="18" height="8" rx="4"/></svg>`,
    content: `<a href="#" style="display:inline-block;background:#1a2f6e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">ボタンテキスト</a>`,
  });

  bm.add("block-divider", {
    label: "区切り線",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16"/></svg>`,
    content: `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">`,
  });

  bm.add("block-spacer", {
    label: "余白",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14" stroke-dasharray="3 2"/></svg>`,
    content: `<div style="height:40px;"></div>`,
  });

  bm.add("block-columns-2", {
    label: "2カラム",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="9" height="16" rx="1"/><rect x="13" y="4" width="9" height="16" rx="1"/></svg>`,
    content: `
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="flex:1;padding:16px;background:#f9fafb;border-radius:8px;">
          <p>左カラムのテキスト</p>
        </div>
        <div style="flex:1;padding:16px;background:#f9fafb;border-radius:8px;">
          <p>右カラムのテキスト</p>
        </div>
      </div>`,
  });

  bm.add("block-columns-3", {
    label: "3カラム",
    category: CAT2,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="6" height="16" rx="1"/><rect x="9" y="4" width="6" height="16" rx="1"/><rect x="16" y="4" width="6" height="16" rx="1"/></svg>`,
    content: `
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="flex:1;padding:14px;background:#f9fafb;border-radius:8px;"><p>カラム1</p></div>
        <div style="flex:1;padding:14px;background:#f9fafb;border-radius:8px;"><p>カラム2</p></div>
        <div style="flex:1;padding:14px;background:#f9fafb;border-radius:8px;"><p>カラム3</p></div>
      </div>`,
  });
}
