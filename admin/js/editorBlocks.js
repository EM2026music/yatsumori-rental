// ビジュアルエディタのブロック定義。
// 各ブロックのHTMLは現在のホームページのセクションと同じクラス名・構造を
// そのまま使う（エディタにはホームページの<style>がまるごと読み込まれるため、
// 同じクラスを使えば見た目は自動的に既存デザインと揃う）。

function registerYatsumoriBlocks(editor) {
  const bm = editor.BlockManager;
  const CAT = "8つ森レンタル";

  bm.add("block-hero", {
    label: "ヒーロー（見出し＋写真）",
    category: CAT,
    content: `
      <section class="hero">
        <img class="hero-photo" src="assets/img/hero-ski.jpg" alt="蔵王の雪山">
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
        <a class="btn btn-primary" href="reserve.html">📅 今すぐ予約する</a>
        <a class="btn btn-secondary" href="reserve-lookup.html">予約の確認・変更はこちら</a>
      </div>`,
  });

  bm.add("block-badges", {
    label: "特徴バッジ（4つ）",
    category: CAT,
    content: `
      <div class="badges">
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
        <div class="badge"><div class="badge-icon">✓</div><div class="badge-title">タイトル</div><div class="badge-sub">サブテキスト</div></div>
      </div>`,
  });

  bm.add("block-service-card", {
    label: "サービスカード（1枚）",
    category: CAT,
    content: `
      <a class="content-card" style="background-image:url('assets/img/catalog.jpg')" href="#">
        <h3 class="content-card-title">タイトル</h3>
        <p class="content-card-desc">説明文</p>
        <span class="pill-btn">詳しく見る &gt;</span>
      </a>`,
  });

  bm.add("block-recommend-card", {
    label: "おすすめ情報カード（1枚）",
    category: CAT,
    content: `
      <a class="recommend-card" href="#">
        <img class="recommend-photo" src="assets/img/onsen.jpg" alt="">
        <p class="recommend-title">タイトル</p>
        <p class="recommend-sub">説明文</p>
      </a>`,
  });

  bm.add("block-review-card", {
    label: "お客様の声カード（1枚）",
    category: CAT,
    content: `
      <div class="review-card">
        <div class="review-avatar"></div>
        <p class="review-text">レビュー本文をここに入力</p>
        <span class="review-stars">★★★★★</span>
      </div>`,
  });

  bm.add("block-footer", {
    label: "フッター（店舗情報）",
    category: CAT,
    content: `
      <footer class="footer-bar hide-desktop">
        <div class="footer-top">
          <img class="footer-photo" src="assets/img/shop-thumb.jpg" alt="">
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
}
