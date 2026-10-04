/* ============================================================
   8つ森レンタル — 3言語切替（日本語 / English / 繁體中文）
   ------------------------------------------------------------
   ■ 仕組み
   ページに書かれている「日本語のテキスト」を辞書で置き換える方式。
   HTMLを3つ書く（料金ページのdata-langblock方式）のではなくJSで差し替えるので、
   ・公開版(site_pages)がページの中身を丸ごと差し替えるトップでも効く
   ・予約ウィザードのようにJSで後から作られる部分にも効く（MutationObserverで追従）

   ■ 選んだ言語の保存
   localStorage("yatsumori:lang") に保存 → ページを移動しても維持。
   URLに ?lang=en / ?lang=zh を付けても指定できる（宿に置くQRカード等で使える）。

   ■ 地雷まわりの配慮
   ・元の日本語は WeakMap に控えてあるので「日本語」に戻せば必ず元通り。
   ・編集エディタの中（iframe）では何もしない。英語表示のまま保存されると
     公開データが英語で固定されてしまうため。
   ・[data-langblock] があるページ（料金）はブロックを出し分け、
     ブロックの外（見出しバー等）だけテキスト置換する（ブロック内は二重翻訳しない）。
   ============================================================ */
(function () {
  "use strict";

  // 編集エディタのiframe内では動かさない（英語のまま公開保存される事故を防ぐ）
  if (window.__YATSUMORI_EDITOR__ || window.self !== window.top) return;

  var LS_KEY = "yatsumori:lang";
  var LANGS = { ja: 1, en: 1, zh: 1 };
  var HTML_LANG = { ja: "ja", en: "en", zh: "zh-Hant" };
  var LABEL = {
    full: { ja: "日本語", en: "English", zh: "繁體中文" },
    short: { ja: "日", en: "EN", zh: "繁" }
  };

  /* ------------------------------------------------------------------
     辞書：完全一致（正規化＝前後の空白を落とし、連続空白を1つにしたもの）
     "日本語": ["English", "繁體中文"]
  ------------------------------------------------------------------ */
  var D = {
    /* ── ヘッダー・ナビ・共通 ── */
    "ホーム": ["Home", "首頁"],
    "初心者ガイド": ["Beginner's Guide", "新手指南"],
    "レンタル": ["Rentals", "租借"],
    "レンタル料金": ["Prices", "租借費用"],
    "板カタログ": ["Board Catalog", "雪板目錄"],
    "ギャラリー": ["Gallery", "相簿"],
    "ワクシング": ["Waxing", "打蠟"],
    "ワクシングサービス": ["Waxing Service", "打蠟服務"],
    "アクセス": ["Access", "交通方式"],
    "店舗へのアクセス": ["Getting Here", "前往店舖"],
    "予約する": ["Book Now", "立即預約"],
    "WEB予約はこちら": ["Book online", "線上預約"],
    "WEB予約": ["Online Booking", "線上預約"],
    "メニュー": ["Menu", "選單"],
    "PC版サイトを見る": ["View desktop site", "查看電腦版網站"],
    "よくある質問": ["FAQ", "常見問題"],
    "よくあるご質問": ["FAQ", "常見問題"],
    "お問い合わせ": ["Contact us", "聯絡我們"],
    "プライバシーポリシー": ["Privacy Policy", "隱私權政策"],
    "最新情報はInstagramでチェック！ @8mori_rental": ["Follow us on Instagram @8mori_rental", "最新消息請看 Instagram @8mori_rental"],
    "最新情報はInstagramでチェック！ @yatsumorirental": ["Follow us on Instagram @yatsumorirental", "最新消息請看 Instagram @yatsumorirental"],

    /* ── ヒーロー ── */
    "蔵王の雪をもっと自由に。": ["Enjoy Zao's snow, your way.", "更自由地享受藏王的雪。"],
    "手ぶらでOK！最高の1日を。": ["Come empty-handed for the best day out.", "空手前來，享受最棒的一天！"],
    "蔵王の雪をもっと自由に。手ぶらでOK！": ["Enjoy Zao's snow, your way — come empty-handed!", "更自由地享受藏王的雪，空手前來即可！"],
    "8つ森レンタルは、宮城蔵王・遠刈田温泉の": ["Yatsumori Rental — a ski & snowboard rental shop", "8つ森租借位於宮城藏王・遠刈田溫泉，"],
    "8つ森レンタルは、蔵王・遠刈田温泉の": ["Yatsumori Rental — a ski & snowboard rental shop", "8つ森租借位於藏王・遠刈田溫泉，"],
    "スキー・スノーボードレンタル専門店です。": ["in Togatta Onsen, Zao, Miyagi.", "是雙板滑雪與單板滑雪器材的租借專門店。"],

    /* ── 予約カード（トップ） ── */
    "かんたんWEB予約": ["Easy Online Booking", "線上預約超簡單"],
    "日付を選ぶ": ["Pick dates", "選日期"],
    "人数を入力": ["Enter guests", "填人數"],
    "完了！": ["Done!", "完成！"],
    "今すぐ予約する": ["Book now", "立即預約"],
    "予約の確認・変更はこちら": ["Check or change a booking", "查詢・修改預約"],
    "予約の確認・変更": ["Check / change booking", "查詢・修改預約"],

    /* ── バッジ ── */
    "手ぶらでOK": ["Come empty-handed", "空手前來即可"],
    "小物も充実‼": ["Accessories too‼", "配件也齊全‼"],
    "ウェアも充実": ["Clothing available", "雪衣也很齊全"],
    "板は": ["Skis & boards", "雪板"],
    "ワクシング済み‼": ["freshly waxed‼", "已打蠟‼"],
    "温泉街の中に立地‼": ["Right in the onsen town‼", "就在溫泉街內‼"],
    "事前準備で": ["Plan ahead,", "事先準備"],
    "混雑回避": ["beat the crowds", "避開人潮"],
    "前日貸し出しOK‼": ["Pick up the day before‼", "可前一天領取‼"],
    "男女別": ["Separate", "男女分開"],
    "更衣室完備": ["changing rooms", "更衣室完備"],
    "ロッカー有": ["Lockers available", "附置物櫃"],
    "更衣室完備・ロッカー有": ["changing rooms & lockers", "更衣室・置物櫃完備"],
    "WEB予約で": ["Book online for", "線上預約"],
    "スムーズ受取": ["smooth pickup", "領取更順暢"],
    "高品質な板": ["Quality boards", "高品質雪板"],
    "メンテナンス済み": ["fully maintained", "已完成保養"],
    "温泉街すぐそば": ["Next to the onsen town", "緊鄰溫泉街"],
    "帰りに温泉も！": ["Soak on the way back!", "回程還能泡溫泉！"],

    /* ── サービスカード ── */
    "初心者〜上級者まで": ["From beginner to expert", "從初學者到高手"],
    "豊富なラインナップ": ["A wide lineup", "品項豐富"],
    "一覧を見る": ["View all", "查看列表"],
    "はじめての方も安心！": ["Perfect for first-timers!", "第一次也能安心！"],
    "蔵王を楽しむコツをご紹介": ["Tips for enjoying Zao", "介紹暢玩藏王的訣竅"],
    "詳しく見る": ["Learn more", "詳細內容"],
    "わかりやすい料金プラン": ["Simple, clear pricing", "簡單易懂的價格方案"],
    "料金表を見る": ["See prices", "查看價目表"],
    "滑りが変わる！": ["Feel the difference!", "滑行感受大不同！"],
    "板をベストコンディションに": ["Get your skis or snowboard in top shape", "讓雪板保持最佳狀態"],

    /* ── おすすめ情報 ── */
    "蔵王をもっと楽しもう！": ["Make the most of Zao!", "把藏王玩得更盡興！"],
    "おすすめ情報": ["Things to do", "推薦資訊"],
    "もっと見る": ["See more", "看更多"],
    "遠刈田温泉ガイド": ["Togatta Onsen Guide", "遠刈田溫泉指南"],
    "スキーの後は温泉でリラックス": ["Relax in a hot spring after skiing", "滑雪後泡溫泉放鬆"],
    "周辺グルメ情報": ["Where to Eat", "周邊美食"],
    "おすすめランチ・カフェ": ["Recommended lunch & cafés", "推薦午餐與咖啡廳"],
    "蔵王のスキー場情報": ["Zao Ski Resorts", "藏王滑雪場資訊"],
    "ゲレンデ・積雪・天気をチェック": ["Slopes, snow depth & weather", "查看雪道・積雪・天氣"],
    "やつもりん": ["Yatsumorin", "Yatsumorin"],
    "やつもりん（公式キャラ）": ["Yatsumorin (our mascot)", "Yatsumorin（官方吉祥物）"],
    "8つ森レンタルの公式キャラを見る": ["Meet our official mascot", "認識我們的官方吉祥物"],
    "八つ森レンタルの公式キャラを見る": ["Meet our official mascot", "認識我們的官方吉祥物"],
    "お客様の声": ["Reviews", "顧客評價"],
    "初心者でしたが丁寧に教えてもらえて安心でした！": ["I'm a beginner and they explained everything — I felt completely at ease!", "我是初學者，店家很仔細地說明，非常安心！"],
    "板の種類が多くて、ぴったりの板を選んでもらえました！": ["Great selection — they picked the perfect board for me!", "雪板種類很多，幫我挑到最合適的一塊！"],
    "温泉街のすぐそばで便利！また利用したいです。": ["Right by the onsen town, so convenient. I'll be back!", "就在溫泉街旁邊很方便！下次還會再來。"],

    /* ── 店舗情報 ── */
    "宮城県刈田郡蔵王町遠刈田温泉中町16": ["16 Nakamachi, Togatta Onsen, Zao-machi, Katta-gun, Miyagi", "宮城縣刈田郡藏王町遠刈田溫泉中町16"],
    "〒989-0912 宮城県刈田郡蔵王町遠刈田温泉中町16": ["989-0912　16 Nakamachi, Togatta Onsen, Zao-machi, Katta-gun, Miyagi", "〒989-0912 宮城縣刈田郡藏王町遠刈田溫泉中町16"],
    "営業時間 8:00〜17:00（不定休）": ["Open 8:00–17:00 (days off vary)", "營業時間 8:00〜17:00（不定期公休）"],
    "営業時間 8:30〜18:00（不定休）": ["Open 8:30–18:00 (irregular holidays)", "營業時間 8:30〜18:00（不定休）"],
    "営業時間": ["Opening hours", "營業時間"],
    "8:00〜17:00（不定休） 070-2472-3633": ["8:00–17:00 (days off vary) 070-2472-3633", "8:00〜17:00（不定期公休） 070-2472-3633"],
    // 予約ページ下部のフッター（🕒…📞… の1行。先頭の絵文字は自動で残る）
    "8:00〜17:00（不定休） 📞 070-2472-3633": ["8:00–17:00 (days off vary) 📞 070-2472-3633", "8:00〜17:00（不定期公休） 📞 070-2472-3633"],
    "8:00〜17:00（不定休）": ["8:00–17:00 (days off vary)", "8:00〜17:00（不定期公休）"],
    "詳しいアクセスを見る": ["Directions", "詳細交通資訊"],
    "店名": ["Shop", "店名"],
    "住所": ["Address", "地址"],
    "電話": ["Phone", "電話"],
    "駐車場": ["Parking", "停車場"],
    "あり": ["Available", "有"],
    "お支払い": ["Payment", "付款方式"],
    "現金のみ（クレジット・電子決済は不可）": ["Cash only (no credit cards or e-payments)", "僅收現金（不接受信用卡與電子支付）"],
    "店舗情報": ["Shop Information", "店舖資訊"],
    "蔵王・遠刈田温泉の温泉街にあるスキー・スノーボードレンタル店です。手ぶらでお越しいただけます。": ["A ski & snowboard rental shop in the Togatta Onsen hot-spring town of Zao. Come empty-handed.", "位於藏王・遠刈田溫泉街的雙板滑雪與單板滑雪器材租借店。空手前來即可。"],
    "お車でお越しの方へ": ["Coming by car", "開車前來的旅客"],
    "遠刈田温泉の温泉街にございます。東北自動車道の白石IC・村田ICなどからお越しいただけます。": [
      "We're in the Togatta Onsen town. Take the Tohoku Expressway and exit at Shiroishi IC or Murata IC.",
      "本店位於遠刈田溫泉街。可由東北自動車道的白石IC・村田IC前來。"],
    // ↓ 太字<b>で文が3つに割れている箇所（分割されたまま訳がつながるようにしてある）
    "正確な経路は、カーナビやGoogleマップに": ["For directions, enter ", "路線請將"],
    "上記の住所または電話番号": ["the address or phone number above", "上述地址或電話"],
    "を入力してご確認いただくのが確実です。駐車場をご用意しています。": [
      " into your car navigation or Google Maps. Parking is available.",
      "輸入車用導航或 Google 地圖確認最為準確。本店備有停車場。"],
    "道具は、ご利用日の": ["Equipment can be picked up from ", "器材可於使用日"],
    "前日午後2時から": ["2:00 PM the day before", "前一天下午2點起"],
    "お渡しが可能です（宿泊の方は前夜に受け取ると朝がスムーズです）。": [
      ". Staying nearby? Picking it up the night before makes your morning easy.",
      "領取（住宿的旅客前一晚先領取，隔天早上會更順利）。"],
    "Googleマップで開く": ["Open in Google Maps", "用 Google 地圖開啟"],
    "お電話でお問い合わせ": ["Call us", "以電話洽詢"],
    "道具は、ご利用日の前日午後2時からお渡しが可能です（宿泊の方は前夜に受け取ると朝がスムーズです）。": [
      "Equipment can be picked up from 2:00 PM the day before. Staying nearby? Picking up the night before makes your morning easy.",
      "器材可於使用日前一天下午2點起領取（住宿的旅客前一晚先領取，隔天早上會更順利）。"],
    "場所が分からない場合は、お気軽にお電話ください。": ["Can't find us? Just give us a call.", "找不到位置時，歡迎隨時來電。"],
    "WEBで予約する": ["Book online", "線上預約"],

    /* ── 予約ウィザード：進捗・見出し ── */
    "日程": ["Dates", "日期"],
    "利用者": ["Guests", "使用者"],
    "代表者": ["Contact", "代表人"],
    "確認": ["Confirm", "確認"],
    "ご利用期間": ["Rental period", "租借期間"],
    "必須": ["Required", "必填"],
    "日帰りの場合は開始日と返却日を同じ日にしてください。": ["For a single-day rental, set the same date for both.", "若為當天來回，請將開始日與歸還日設為同一天。"],
    "予約しておくと当日スムーズ！": ["Booking ahead makes pickup quick!", "事先預約，當天更順利！"],
    "マンガで見る": ["See the comic", "看漫畫說明"],
    "前日の午後2時から受け取りたい": ["I'd like to pick up from 2 PM the day before", "想在前一天下午2點起領取"],
    "（任意）": ["(optional)", "（選填）"],
    "宿泊先などで前日に受け取っておくと、当日は朝からそのままゲレンデへ向かえます。満数の場合はご希望に添えないことがあります。": [
      "Pick up the day before and head straight to the slopes in the morning. Not always possible when we're fully booked.",
      "前一天先領取，隔天早上就能直接前往雪場。器材已滿時可能無法配合。"],
    "ご利用人数": ["Number of guests", "使用人數"],
    "大人": ["Adults", "成人"],
    "中学生以上": ["Junior high and above", "國中生以上"],
    "子供": ["Children", "兒童"],
    "小学生まで（子供料金）": ["Elementary school and under (child rate)", "小學生以下（兒童費率）"],
    "次へ（利用者の情報）": ["Next: guest details", "下一步（使用者資訊）"],
    "空き状況を確認中...": ["Checking availability...", "確認空檔中..."],
    "この期間の空き状況：スキー": ["Available for the selected dates — Skis", "此期間可租借數量：雙板滑雪"],
    "この期間（前日受け取り込み）の空き状況：スキー": ["Available for the selected dates (including day-before pickup) — Skis", "此期間（含前一天領取）可租借數量：雙板滑雪"],
    "本 ／ スノーボード": ["left ／ Snowboard", "支 ／ 單板滑雪"],
    "本": ["left", "支"],

    /* ── 予約ウィザード：利用者カード ── */
    "複数人で予約するときのコツ": ["Tips for group bookings", "多人預約的小訣竅"],
    "予約で入力してほしいこと": ["What we need from you", "預約時需要填寫的內容"],
    "お名前・ニックネーム": ["Name or nickname", "姓名・暱稱"],
    "（任意・借りた方が分かるように）": ["(optional — so we know whose gear is whose)", "（選填・方便辨識器材是誰的）"],
    "身長 (cm)": ["Height (cm)", "身高 (cm)"],
    "靴のサイズ (cm)": ["Shoe size (cm)", "鞋子尺寸 (cm)"],
    "選択してください": ["Please select", "請選擇"],
    "身長・靴のサイズは何に使うの？": ["What are height and shoe size for?", "身高與鞋子尺寸做什麼用？"],
    "性別・年齢": ["Gender & age", "性別・年齡"],
    "（任意・分かる範囲でOK）": ["(optional)", "（選填）"],
    "性別": ["Gender", "性別"],
    "男性": ["Male", "男性"],
    "女性": ["Female", "女性"],
    "年齢": ["Age", "年齡"],
    "年齢・性別は何に使うの？": ["What are age and gender for?", "年齡與性別做什麼用？"],
    "レンタル内容": ["What to rent", "租借內容"],
    "ご利用の用具": ["Equipment", "使用器材"],
    "スキー": ["Ski", "雙板滑雪"],
    "スノーボード": ["Snowboard", "單板滑雪"],
    "レンタルしない": ["Not renting", "不租借"],
    "持ち込み・単品のみ": ["own gear / single items", "自備・僅租單品"],
    "どっちにするか迷ったら": ["Not sure which to choose?", "不知道要選哪個？"],
    "レンタルセット": ["Rental set", "租借組合"],
    "まずはここをお選びください": ["choose one first", "請先選擇這裡"],
    "滑走セット": ["Riding Set", "滑行組"],
    "板・ブーツ・ストック": ["skis or a snowboard, boots, and poles for skis", "雪板・雪靴・雪杖"],
    "フルセット": ["Full Set", "全套組"],
    "フルセット（ウェア付き）": ["Full Set (with clothing)", "全套組（含雪衣）"],
    "滑走＋ウェア上下": ["riding set + jacket & pants", "滑行組＋雪衣上下"],
    "セットなし（単品のみ）": ["No set (single items only)", "不選套組（僅單品）"],
    "板のレンタルなし": ["No skis or snowboard rental", "不租借雪板"],
    "板・ブーツ・ストックはレンタルされません。下の「追加レンタル」からウェアやヘルメット等の単品をお選びください（1つ以上必須）。": ["Skis, snowboards, boots and poles are not included. Please choose at least one single item (jacket, pants, helmet, etc.) under \"Add-ons\" below.", "不含雪板・雪靴・雪杖。請於下方「追加租借」選擇雪衣或安全帽等單品（至少1項）。"],
    "スタンス（前にする足）": ["Stance (front foot)", "站姿（前腳）"],
    "レギュラー": ["Regular", "正腳（Regular）"],
    "（左足が前）": ["(left foot forward)", "（左腳在前）"],
    "グーフィー": ["Goofy", "反腳（Goofy）"],
    "（右足が前）": ["(right foot forward)", "（右腳在前）"],
    "わからない": ["Not sure", "不清楚"],
    "スタンス未定": ["Stance TBD", "站姿未定"],
    "スタンスがわからないときは": ["Not sure about your stance?", "不知道自己的站姿？"],
    "追加レンタル": ["Add-ons", "追加租借"],
    "（任意・1日ごと）": ["(optional, per day)", "（選填・以天計費）"],
    "ウェア（上）": ["Jacket", "雪衣（上）"],
    "ウェア（下）": ["Pants", "雪衣（下）"],
    "ヘルメット": ["Helmet", "安全帽"],
    "ゴーグル": ["Goggles", "護目鏡"],
    "ソリ": ["Sled", "雪橇"],
    "スノーシュー": ["Snowshoes", "雪鞋"],
    "キッズ用ハーネス": ["Kids' harness", "兒童安全吊帶"],
    "追加レンタルを選択してください": ["Please choose an add-on", "請選擇追加租借"],
    "セットを選択してください": ["Please choose a set", "請選擇套組"],
    "大人料金": ["Adult rate", "成人費率"],
    "子供料金": ["Child rate", "兒童費率"],
    "お支払い目安（現金）": ["Estimated total (cash)", "預估金額（現金）"],
    "来店時に現金でお支払いください": ["Please pay in cash at the shop", "請於到店時以現金支付"],
    "戻る": ["Back", "上一步"],
    "次へ（代表者の入力）": ["Next: your details", "下一步（代表人資訊）"],

    /* ── 予約ウィザード：代表者・確認・完了 ── */
    "代表者情報": ["Your details", "代表人資訊"],
    "代表者のお名前": ["Full name", "代表人姓名"],
    "電話番号": ["Phone number", "電話號碼"],
    "当日つながるお電話番号をご入力ください。予約の確認・変更にも使います。": [
      "Please give a number we can reach you on that day. It's also used to look up your booking.",
      "請填寫當天可聯絡的電話號碼，查詢・修改預約時也會用到。"],
    "メール・ご要望": ["Email & requests", "電子郵件・需求"],
    "メールアドレス": ["Email address", "電子郵件"],
    "ご入力いただくと確認メールをお送りします。": ["Enter one and we'll send a confirmation email.", "填寫後我們會寄送確認信。"],
    "ご要望など": ["Requests", "其他需求"],
    "入力内容を確認する": ["Review your booking", "確認輸入內容"],
    "ご利用日程": ["Dates", "使用日程"],
    "期間": ["Period", "期間"],
    "人数": ["Guests", "人數"],
    "ご利用者": ["Guests", "使用者"],
    "お名前": ["Name", "姓名"],
    "メール": ["Email", "電子郵件"],
    "（未入力）": ["(not entered)", "（未填寫）"],
    "ご要望": ["Requests", "需求"],
    "前日受け取り": ["Day-before pickup", "前一天領取"],
    "用具": ["Equipment", "器材"],
    "お支払いは当日ご来店時に現金でお願いします（クレジット・電子決済は現在ご利用いただけません）。": [
      "Please pay in cash when you arrive (credit cards and e-payments are not accepted).",
      "請於到店時以現金支付（目前不接受信用卡與電子支付）。"],
    "ご利用日前日の午後2時からお渡しも可能です。": ["Pickup from 2 PM the day before is also possible.", "亦可於使用日前一天下午2點起領取。"],
    "この内容で予約する": ["Confirm booking", "以此內容預約"],
    "送信中...": ["Sending...", "傳送中..."],
    "ご予約を受け付けました": ["Your booking is confirmed", "已收到您的預約"],
    "当日は営業時間内にご来店ください。前日午後2時からのお渡しも可能です。": [
      "Please come during opening hours. Pickup from 2 PM the day before is also possible.",
      "請於營業時間內到店。也可在前一天下午2點起領取。"],
    "予約番号": ["Booking number", "預約編號"],
    "番号をコピー": ["Copy number", "複製編號"],
    "コピーしました ✓": ["Copied ✓", "已複製 ✓"],
    "この画面をスクリーンショットで保存してください。": ["Please save a screenshot of this screen.", "請將此畫面截圖保存。"],
    "予約番号は、予約の確認・変更・キャンセルのときに必要です。": [
      "You'll need this number to check, change or cancel your booking.",
      "查詢・修改・取消預約時需要此編號。"],
    "トップへ戻る": ["Back to top page", "回到首頁"],
    "予約を確認する": ["Check my booking", "查詢預約"],
    "ご入力のメールアドレスにも確認メールをお送りします。": ["A confirmation email will also be sent to the address you entered.", "我們也會寄送確認信到您填寫的電子郵件。"],
    "当日の受け取りの流れ": ["How pickup works", "當天領取流程"],
    "服装・持ち物のチェック": ["What to wear and bring", "服裝・攜帶物品確認"],
    "やつもりんのマンガを全話読む": ["Read all of Yatsumorin's comics", "閱讀 Yatsumorin 的全部漫畫"],
    "タップで閉じる": ["Tap to close", "點一下關閉"],
    "閉じる": ["Close", "關閉"],

    /* ── エラー・確認ダイアログ ── */
    "ご利用期間（開始日と返却日）を選択してください。": ["Please select your rental period (start and return dates).", "請選擇租借期間（開始日與歸還日）。"],
    "返却日は開始日と同じか、あとの日付にしてください。": ["The return date must be the same as or after the start date.", "歸還日請設為開始日當天或之後。"],
    "前日受け取りをご希望の場合、開始日は明日以降にしてください（前日がすでに今日か過去になっています）。": [
      "For day-before pickup, the start date must be tomorrow or later.",
      "若希望前一天領取，開始日請設為明天以後。"],
    "代表者のお名前を入力してください。": ["Please enter the contact person's name.", "請輸入代表人姓名。"],
    "当日つながる電話番号を正しく入力してください。": ["Please enter a valid phone number we can reach on the day.", "請正確輸入當天可聯絡的電話號碼。"],
    "ブーツ": ["Boots", "雪靴"],
    "ご希望の期間・用具は満数になりました。日程を変えるか、お電話（070-2472-3633）でご相談ください。": [
      "The equipment you selected is fully booked for those dates. Please try other dates or call us at 070-2472-3633.",
      "您所選期間的器材已滿。請更改日期，或來電 070-2472-3633 洽詢。"],
    "前日は休業日のため、前日受け取りはご利用いただけません。当日受け取りでご予約いただくか、お電話でご相談ください。": [
      "We are closed the day before, so day-before pickup is not available. Please book for same-day pickup or call us.",
      "前一天為公休日，無法提供前一天領取。請改為當天領取，或來電洽詢。"],
    "前日受け取りができない日程です（前日がすでに過去の日付になっています）。開始日を1日後にずらしてください。": [
      "Day-before pickup is not possible for these dates (the day before is already in the past). Please move the start date one day later.",
      "此日程無法前一天領取（前一天已是過去日期）。請將開始日往後移一天。"],
    "期間内に休業日が含まれています。別の日をお選びください。": ["Your period includes a day we are closed. Please choose other dates.", "期間內包含公休日。請選擇其他日期。"],
    "過去の日付は予約できません。": ["Past dates cannot be booked.", "無法預約過去的日期。"],
    "利用日の指定が正しくありません。開始日と返却日をご確認ください。": ["The dates are invalid. Please check the start and return dates.", "使用日期不正確。請確認開始日與歸還日。"],
    "レンタル期間が長すぎます。30日以内でお選びください。": ["The rental period is too long. Please choose 30 days or less.", "租借期間過長。請選擇30天以內。"],
    "お名前と、当日つながる電話番号（10桁以上）をご入力ください。": ["Please enter your name and a phone number (10+ digits) we can reach on the day.", "請輸入姓名與當天可聯絡的電話號碼（10碼以上）。"],
    "人数と、入力された利用者の数が一致していません。": ["The number of guests does not match the details entered.", "人數與填寫的使用者人數不一致。"],
    "利用者の情報をご確認ください。": ["Please check the guest details.", "請確認使用者資訊。"],
    "数量の指定が正しくありません。": ["The quantity is invalid.", "數量指定不正確。"],
    "入力内容を確認してください。": ["Please check your entries.", "請確認輸入內容。"],
    "選択した用具は現在ご利用いただけません。": ["The selected equipment is not available right now.", "所選器材目前無法使用。"],
    "この予約はすでにキャンセル済みです。": ["This booking has already been cancelled.", "這筆預約已經取消。"],
    "通信エラーが発生しました。時間をおいて再度お試しください。": ["A connection error occurred. Please try again in a moment.", "發生連線錯誤。請稍後再試。"],
    "編集モードのため送信は無効です": ["Submitting is disabled in edit mode", "編輯模式下無法送出"],
    "編集モードのためキャンセル操作は無効です": ["Cancelling is disabled in edit mode", "編輯模式下無法取消"],
    "この予約をキャンセルします。よろしいですか？": ["Cancel this booking. Are you sure?", "將取消這筆預約，確定嗎？"],

    /* ── 予約の確認・変更ページ ── */
    "ご予約の確認・変更はこちらから": ["Check or change your booking", "查詢・修改您的預約"],
    "ご予約時の予約番号と電話番号を入力してください。": ["Enter the booking number and phone number you used.", "請輸入預約時的預約編號與電話號碼。"],
    "別の予約を確認": ["Check another booking", "查詢其他預約"],
    "予約をキャンセル": ["Cancel booking", "取消預約"],
    "※ 日付や用具の変更をご希望の場合は、一度キャンセルして取り直すか、お電話（070-2472-3633）でご相談ください。": [
      "* To change dates or equipment, please cancel and book again, or call us at 070-2472-3633.",
      "※ 如需變更日期或器材，請先取消後重新預約，或來電 070-2472-3633 洽詢。"],
    "予約番号と電話番号を入力してください。": ["Please enter your booking number and phone number.", "請輸入預約編號與電話號碼。"],
    "確認中...": ["Checking...", "查詢中..."],
    "予約が見つかりませんでした。予約番号と電話番号をご確認ください。": [
      "Booking not found. Please check the booking number and phone number.",
      "找不到預約。請確認預約編號與電話號碼。"],
    "処理中...": ["Processing...", "處理中..."],
    "予約受付中": ["Received", "已受理"],
    "予約確定": ["Confirmed", "已確認"],
    "キャンセル済み": ["Cancelled", "已取消"],
    "希望する": ["Yes", "希望"],

    /* ── 予約なし版（simple/）で使う文言 ── */
    "ご予約・お問い合わせ": ["Reservations & Enquiries", "預約・洽詢"],
    "お電話でご予約ください": ["Please call us to book", "請來電預約"],
    "タップで発信できます": ["Tap to call", "可點擊撥號"],
    "電話で予約する": ["Call to book", "來電預約"],
    "電話で予約する（070-2472-3633）": ["Call to book (070-2472-3633)", "來電預約（070-2472-3633）"],
    "レンタル料金を見る": ["See rental prices", "查看租借費用"],
    "お電話でのご予約": ["Book by phone", "電話預約"],
    "お電話でご予約": ["Call to book", "來電預約"],
    "電話で問い合わせる": ["Call us", "來電洽詢"],
    "InstagramのDMでも受け付けています": ["We also take enquiries by Instagram DM", "也可透過 Instagram 私訊洽詢"],
    "ご予約はお電話で承っております。ご利用日・人数・身長・靴のサイズをお伝えください。": [
      "Bookings are taken by phone. Please tell us your dates, number of people, height and shoe size.",
      "本店以電話受理預約。請告知使用日期、人數、身高與鞋子尺寸。"],
    "受付時間 8:00〜17:00（不定休）": ["Phone hours 8:00–17:00 (days off vary)", "受理時間 8:00〜17:00（不定期公休）"],

    /* ── トップ・共通（2026-10 追加分） ── */
    "8つ森レンタル": ["Yatsumori Rental", "8つ森租借"],
    "8つ森レンタル 店舗写真": ["Yatsumori Rental shop", "8つ森租借店舖照片"],
    "店舗写真": ["Our shop", "店舖照片"],
    "電話で予約": ["Call to book", "來電預約"],
    "蔵王の雪山でスキーを持つ人": ["A skier on the snowy slopes of Zao", "在藏王雪山上拿著滑雪板的人"],
    "蔵王の雪山": ["The snowy mountains of Zao", "藏王雪山"],
    "InstagramのDMで予約": ["Book via Instagram DM", "Instagram DM 預約"],
    "InstagramのDMで問い合わせる": ["Ask via Instagram DM", "透過 Instagram 私訊洽詢"],
    "メルキュール宮城蔵王リゾート＆スパ 外観": ["Mercure Miyagi Zao Resort & Spa (exterior)", "美居宮城藏王度假村＆水療中心 外觀"],
    "お得な宿泊パックはこちら！": ["Great-value stay packages", "超值住宿方案看這裡！"],
    "宿泊とレンタルがセットのプラン": ["Hotel stay + rental plans", "住宿＋租借的套裝方案"],
    "準備中": ["Coming soon", "即將推出"],
    "やつもりん（準備中）": ["Yatsumorin (coming soon)", "Yatsumorin（即將推出）"],
    "宮城県刈田郡蔵王町遠刈田温泉仲町16": ["16 Nakamachi, Togatta Onsen, Zao-machi, Katta-gun, Miyagi", "宮城縣刈田郡藏王町遠刈田溫泉仲町16"],
    "〒989-0912 宮城県刈田郡蔵王町遠刈田温泉仲町16": ["989-0912　16 Nakamachi, Togatta Onsen, Zao-machi, Katta-gun, Miyagi", "〒989-0912 宮城縣刈田郡藏王町遠刈田溫泉仲町16"],
    "8つ森レンタルの地図": ["Map of Yatsumori Rental", "8つ森租借地圖"],
    "Googleマップで8つ森レンタルを開く": ["Open Yatsumori Rental in Google Maps", "用 Google 地圖開啟8つ森租借"],
    "山田 太郎": ["e.g. Taro Yamada", "例：王小明"],
    "ウェアも借りたい / 板の長さの希望 等": ["e.g. I'd also like a jacket and pants / preferred ski or snowboard length", "例：也想租雪衣／希望的雪板長度等"],

    /* ── ワクシング ── */
    "8つ森レンタルのワクシングサービスで、快適な滑りをサポートします！": ["Our waxing service keeps your ride smooth!", "8つ森租借的打蠟服務，讓您滑得更順暢！"],
    "基本的に、板は（最新モデルも含む）、ワクシング無しでは滑りません。": ["Without wax, skis and snowboards simply don't glide — even the latest models.", "基本上，雪板（包含最新款）不打蠟就滑不動。"],
    "板が滑ることは、初心者・上級者問わず大前提です。": ["Equipment that glides well is the starting point for everyone, beginner or expert.", "不論初學者或高手，雪板能順利滑行都是基本前提。"],
    "初心者の場合": ["For beginners", "初學者的情況"],
    "最初は、緩やかな傾斜で練習します。": ["Beginners start out practicing on gentle slopes.", "一開始會在平緩的坡道上練習。"],
    "その際、ワクシングのない板は全く滑りません。": ["On those slopes, unwaxed skis or a snowboard won't move at all.", "這時，沒有打蠟的雪板完全滑不動。"],
    "この状態、初心者には一見「怖くない」ように思えますが、スピードも出ない＝安心して練習できる、緩やかな斜面での練習が意味を失ってしまいます。": ["That might seem less scary at first, but gentle slopes are there so you can practice safely at low speed — if your equipment doesn't glide, that practice loses its point.", "對初學者來說這乍看「不可怕」，但平緩坡道本來就是為了在低速下安心練習——雪板滑不動的話，練習就失去意義了。"],
    "中・上級者の場合": ["For intermediate & advanced riders", "中・高階者的情況"],
    "ご説明するまでもないでしょう、": ["No need to explain — ", "應該不用多說了，"],
    "しかし、しっかりワクシングされた板を使ったことがない場合、新しい発見が有るはずです。": ["but if you've never used properly waxed skis or a snowboard, you're in for a pleasant surprise.", "但如果您從未用過確實打蠟的雪板，一定會有新發現。"],
    "当店では、滑る場所や雪質、気温、滑り方、板の状態などを事前にお伺いし、その内容をもとに施工方法や使用するワックスを変えています。": ["We ask in advance where you'll ski or snowboard, the snow conditions, temperature, your style and the condition of your equipment, and adjust our method and wax to match.", "本店會事先詢問您的滑行地點、雪質、氣溫、滑法與雪板狀態，並依此調整施工方式與使用的蠟。"],
    "お客様一人ひとりに合わせて施工内容を変える、フルサービスのワクシングを行っている店舗は決して多くありません。": ["Few shops offer full-service waxing tailored to each customer like this.", "能依每位顧客調整施工內容、提供全套打蠟服務的店家並不多。"],
    "本格的な仕上がりを、できるだけ手頃な価格で。": ["Professional results at the most reasonable price we can offer.", "以盡量實惠的價格，提供專業的成品。"],
    "板が持つ本来の滑りを、ぜひ一度体感してください。": ["Come feel how your skis or snowboard are really meant to glide.", "請務必親身體驗雪板原本應有的滑行感。"],
    "なお、多くの工程と時間を必要とするため、事前のお持ち込みをおすすめしています。": ["Because the work involves many steps and takes time, we recommend dropping your skis or snowboard off in advance.", "由於需要許多工序與時間，建議您事先將雪板送來。"],
    "ワクシング作業の様子": ["Waxing in progress", "打蠟作業情形"],
    "サービス内容": ["Services", "服務內容"],
    "シーズン初めにおすすめ": ["Best at the start of the season", "推薦於季初使用"],
    "フルバージョン": ["Full Version", "完整版"],
    "円": [" yen", "日圓"],
    "施工時間 1日〜 ※1": ["Turnaround: 1 day+ *1", "施工時間 1天起 ※1"],
    "シーズン前・初滑走前の下地作りに最適なフル施工です。滑走性能とワックスの持ちを最大限に引き出します。詳しくは": ["A full treatment that builds the perfect base before the season or your first ride, maximizing glide and wax durability. Details ", "最適合季前・首次滑行前打底的完整施工，能將滑行性能與蠟的持久度發揮到極致。詳情請見"],
    "こちら": ["here", "這裡"],
    "当店でフル施工済みの板が対象": ["For skis and snowboards that have had our full treatment", "限已在本店完成完整施工的雪板"],
    "レギュラーバージョン": ["Regular Version", "標準版"],
    "施工時間 半日〜 ※1": ["Turnaround: half a day+ *1", "施工時間 半天起 ※1"],
    "定期メンテナンス向けのワクシングです。滑走性能を維持したい方におすすめです。": ["Waxing for regular maintenance — ideal if you want to keep your skis or snowboard gliding well.", "適合定期保養的打蠟，推薦給想維持滑行性能的人。"],
    "クイックバージョン": ["Quick Version", "快速版"],
    "施工時間 30分〜 ※1": ["Turnaround: 30 min+ *1", "施工時間 30分鐘起 ※1"],
    "「今から滑りたい」「時間がない」という方向けの簡易ワクシング。最低限の滑走性能を素早く整えます。": ["A quick wax for when you want to ride right now or are short on time. Gets you basic glide, fast.", "為「現在就想滑」「沒有時間」的人提供的簡易打蠟，快速調整出基本的滑行性能。"],
    "※1 施工時間は、板の状態・混雑状況により前後いたします。": ["*1 Turnaround may vary with the condition of your skis or snowboard and how busy we are.", "※1 施工時間會依雪板狀態與擁擠程度而有所不同。"],
    "※ エッジ研磨は行っておりませんので、ご了承ください。": ["* Please note that we do not offer edge sharpening.", "※ 本店不提供邊刃研磨服務，敬請見諒。"],
    "ワクシングとは": ["What is waxing?", "什麼是打蠟"],
    "スキー・スノーボードは、新品を含めワクシングなしでは滑走性能が出にくいだけでなく、ソール（滑走面）が乾燥・劣化しやすくなります。": ["Without waxing, skis and snowboards — even new ones — don't glide well, and the base dries out and wears faster.", "雙板滑雪與單板滑雪器材（包含新品）若未打蠟，不僅較難發揮滑行性能，板底（滑行面）也容易乾燥、劣化。"],
    "ワクシングを行うことで、こんな効果があります。": ["Waxing gives you:", "打蠟可以帶來以下效果。"],
    "よく滑る": ["Better glide", "滑得更順"],
    "疲れにくい": ["Less fatigue", "不易疲累"],
    "板が長持ち": ["Longer equipment life", "雪板更耐用"],
    "特に、次のような方には": ["We especially recommend the ", "特別推薦以下情況的人使用"],
    "がおすすめです。": [" if any of these apply:", "："],
    "買ってから一度もワクシングしていない": ["You haven't waxed your equipment since buying it", "買來後從未打過蠟"],
    "購入時にワクシングをしてもらって以来、一度もメンテナンスをしていない": ["It hasn't been maintained since it was waxed at purchase", "購買時打過蠟之後就從未保養"],
    "簡易ワックスしか使ったことがない": ["You've only ever used quick/spray wax", "只用過簡易蠟"],
    "今シーズン初めて滑る": ["It's your first ride of the season", "本季第一次滑"],
    "ご利用方法": ["How to use the service", "使用方式"],
    "店舗へ直接ご来店いただき、お渡しする申込書にご記入ください。": ["Come to the shop and fill in the application form we give you.", "請直接到店，填寫我們提供的申請表。"],
    "宅配便等を用いての事前持ち込みも可能です。": ["You can also send your skis or snowboard ahead by courier.", "也可以透過宅配等方式事先寄送。"],
    "※ 事前にお電話いただき、板の状態とご希望をお伺いいたします。": ["* Please call us first so we can hear about your skis or snowboard and what you'd like.", "※ 請事先來電，我們會詢問雪板狀態與您的需求。"],
    "詳しくは、お電話もしくはInstagramのDMでお問い合わせください。": ["For details, call us or send a DM on Instagram.", "詳情請來電或透過 Instagram 私訊洽詢。"],
    "電話で問い合わせる（070-2472-3633）": ["Call us (070-2472-3633)", "來電洽詢（070-2472-3633）"],

    /* ── よくあるご質問 ── */
    "レンタルについて、お客様からよくいただくご質問をまとめました。": ["Here are the questions we're asked most about rentals.", "整理了顧客常問的租借相關問題。"],
    "ここにないことは、お気軽にお電話（070-2472-3633）またはInstagramのDMでお問い合わせください。": ["For anything not covered here, feel free to call (070-2472-3633) or DM us on Instagram.", "若有未列出的問題，歡迎來電（070-2472-3633）或透過 Instagram 私訊洽詢。"],
    "フルセット・滑走セットについて": ["Full Set & Riding Set", "關於全套組・滑行組"],
    "レンタルのフルセットには何が含まれますか？": ["What's included in the Full Set?", "租借的全套組包含哪些？"],
    "フルセットの内容は以下の通りです。": ["The Full Set includes:", "全套組內容如下。"],
    "パスケース": ["Pass holder", "票卡夾"],
    "ウェア（上下）": ["Jacket & pants", "雪衣（上下）"],
    "板": ["Skis or snowboard", "雪板"],
    "ストック（スキーの場合）": ["Poles (for skis)", "雪杖（雙板滑雪時）"],
    "これで必要なものが全て揃うので、手ぶらでも安心してご来店いただけます！": ["That's everything you need, so you can come empty-handed!", "需要的東西全都齊全，空手前來也很安心！"],
    "滑走セットには何が含まれますか？": ["What's included in the Riding Set?", "滑行組包含哪些？"],
    "滑走セットは、滑るために必要な基本アイテムが揃います。": ["The Riding Set has the basic items you need to ride.", "滑行組備齊了滑雪所需的基本用品。"],
    "ニット帽やゴーグル、手袋などの小物販売もございます。": ["We also sell beanies, goggles, gloves and other accessories.", "店內也有販售毛帽、護目鏡、手套等小物。"],
    "板のサイズについて": ["Ski & snowboard sizes", "關於雪板尺寸"],
    "板のサイズはどう選べばいいですか？": ["How do I choose the right ski or snowboard size?", "雪板尺寸要怎麼選？"],
    "お客様の身長・滑るスタイルを考慮し、スタッフが最適な板をお選びしますのでご安心ください！お好みの長さがあれば対応いたします。": ["Our staff will choose skis or a snowboard to suit your height and style. If you have a preferred length, just let us know.", "工作人員會依您的身高與滑行風格挑選最合適的雪板，請放心！若有偏好的長度也可配合。"],
    "ブーツのサイズと靴下について": ["Boot size & socks", "關於雪靴尺寸與襪子"],
    "ブーツのサイズはどう選べばいいですか？": ["How do I choose a boot size?", "雪靴尺寸要怎麼選？"],
    "普段履きの靴のサイズで大丈夫です！当店では幅広いサイズのブーツを揃えていますので、フィット感が合うかどうか試着時に確認できます。また、スタッフが最適なサイズをお選びしますのでご安心ください。": ["Your usual shoe size is fine! We stock a wide range of boot sizes, so you can check the fit when you try them on. Our staff will also help you find the right size.", "平常穿的鞋子尺寸就可以！本店備有多種尺寸的雪靴，試穿時可確認合不合腳。工作人員也會協助挑選最合適的尺寸，請放心。"],
    "厚手の靴下を履く場合は、0.5cm大きめのサイズでもOKです。": ["If you wear thick socks, going 0.5 cm larger is fine.", "若穿厚襪，可選大0.5cm的尺寸。"],
    "スキーブーツは普段の靴より少しタイトに感じることがありますが、フィット感が重要です。": ["Ski boots may feel a little tighter than everyday shoes, but a snug fit is what matters.", "滑雪靴可能比平常的鞋子稍緊，但合腳最重要。"],
    "靴下はどんなものがオススメですか？": ["What kind of socks should I wear?", "推薦穿什麼樣的襪子？"],
    "ハイソックス（膝下までの長さの靴下）がオススメです！理由は以下の通りです。": ["We recommend knee-high socks! Here's why:", "推薦穿長筒襪（長度到膝蓋下方的襪子）！理由如下。"],
    "長めの靴下は脱ぎ履きの際に脱げることがないため安心です。": ["Long socks won't slip off when you put boots on or take them off.", "長襪在穿脫雪靴時不會脫落，很安心。"],
    "ショートソックス＋レギンスやスキニーですと、それぞれの足首部分の厚みが重なり、血流を止めて痛みや不快感につながることがあります。": ["Short socks with leggings or skinny pants bunch up at the ankle, which can restrict blood flow and cause pain or discomfort.", "短襪搭配內搭褲或緊身褲時，腳踝處的厚度會重疊，可能阻礙血液循環，造成疼痛或不適。"],
    "足首からふくらはぎまでしっかりカバーできるため、温かいです。": ["They cover you from ankle to calf, so they keep you warm.", "能完整包覆腳踝到小腿，很保暖。"],
    "注意！": ["Note!", "注意！"],
    "もこもこの靴下は避けてください。ブーツの中で滑りが悪くなり、履きにくくなることがあります。": ["Avoid fluffy socks — they don't slide well inside the boot and make boots hard to put on.", "請避免穿毛茸茸的襪子，在雪靴裡不好滑動，會很難穿。"],
    "ワンポイント：ブーツは必ず試着をおすすめします。フィット感を確認することが重要です！": ["Tip: always try your boots on — checking the fit is what matters most!", "小提醒：建議一定要試穿雪靴，確認合腳程度很重要！"],
    "ご予約・お支払いについて": ["Booking & payment", "關於預約・付款"],
    "予約は必要ですか？": ["Do I need to book?", "需要預約嗎？"],
    "事前予約なしでもレンタル可能です。ただし、混雑時は在庫に限りがありますので、お電話またはInstagramのDMでのご予約がおすすめです！特にお子様サイズは数に限りがあります。": ["You can rent without booking. But stock is limited when it's busy, so we recommend booking ahead by phone or Instagram DM! Children's sizes are especially limited.", "不預約也可以租借。不過擁擠時庫存有限，建議事先來電或透過 Instagram 私訊預約！尤其兒童尺寸數量有限。"],
    "事前予約なしでもレンタル可能です。ただし、混雑時は在庫に限りがありますので、WEB予約またはお電話でのご予約がおすすめです！特にお子様サイズは数に限りがあります。": ["You can rent without booking. But stock is limited when it's busy, so we recommend booking ahead! Children's sizes are especially limited.", "不預約也可以租借。不過擁擠時庫存有限，建議事先預約！尤其兒童尺寸數量有限。"],
    "お支払い・お渡しについて": ["Payment & pickup", "關於付款・領取"],
    "お支払いは": ["Payment is ", "付款方式為"],
    "現金のみ": ["cash only", "僅限現金"],
    "です（クレジットカード・電子決済は現在ご利用いただけません）。": [" (credit cards and e-payments are not accepted at this time).", "（目前不接受信用卡與電子支付）。"],
    "ご利用日の": ["Equipment can be picked up from ", "器材可於使用日"],
    "、道具のお渡しが可能です。宿泊のお客様は前夜に受け取っておくと、朝そのままゲレンデへ向かえます。": [". If you're staying nearby, pick up the night before and head straight to the slopes in the morning.", "領取。住宿的旅客前一晚先領取，隔天早上就能直接前往雪場。"],
    "営業時間は": ["We're open ", "營業時間為"],
    "（不定休）です。お電話：070-2472-3633": [" (days off vary). Phone: 070-2472-3633", "（不定期公休）。電話：070-2472-3633"],
    "もっと詳しく知りたい方は": ["Want to know more? See ", "想了解更多，請看"],
    "やつもりんのマンガでわかる予約ガイド": ["Yatsumorin's comic booking guide", "Yatsumorin 漫畫預約指南"],

    /* ── 初心者ガイド ── */
    "はじめての方へ": ["For first-timers", "給第一次的您"],
    "スキー・スノーボードが初めてでも大丈夫！8つ森レンタルの看板娘「やつもりん」が、レンタルの流れと準備のコツをご案内します。": ["First time skiing or snowboarding? No problem! Yatsumorin, our shop mascot, walks you through renting and getting ready.", "第一次體驗雙板滑雪或單板滑雪也沒問題！8つ森租借的吉祥物「Yatsumorin」將為您介紹租借流程與準備訣竅。"],
    "やつもりんの予約案内マンガ": ["Yatsumorin's booking comic", "Yatsumorin 的預約導覽漫畫"],
    "看板娘やつもりんが、ご予約のコツを漫画でご案内します。読みたい話を選んでください。": ["Our mascot Yatsumorin explains booking tips in comic form. Choose an episode.", "看板娘 Yatsumorin 用漫畫介紹預約訣竅。請選擇想看的一話。"],
    "看板娘やつもりんが、WEB予約のコツを漫画でご案内します。読みたい話を選んでください。": ["Our mascot Yatsumorin explains booking tips in comic form. Choose an episode.", "看板娘 Yatsumorin 用漫畫介紹預約訣竅。請選擇想看的一話。"],
    "読みたい話を選ぶ": ["Choose an episode", "選擇想看的一話"],
    "次の話へ ▸": ["Next episode ▸", "下一話 ▸"],
    "前の話へ": ["Previous episode", "上一話"],
    "最終話までありがとう！": ["Thanks for reading to the end!", "謝謝你看到最後一話！"],
    "レンタル当日の流れ": ["Your rental day, step by step", "租借當天的流程"],
    "ご来店・受付": ["Arrive & check in", "到店・報到"],
    "ご予約の方は代表者のお名前をお伝えください。前日午後2時からのお渡しも可能です。": ["If you've booked, give us the name the booking is under. Pickup from 2 PM the day before is also possible.", "已預約的客人請告知代表人姓名。也可在前一天下午2點起領取。"],
    "WEB予約された方は代表者のお名前をお伝えください。前日午後2時からのお渡しも可能です。": ["If you've booked, give us the name the booking is under. Pickup from 2 PM the day before is also possible.", "已預約的客人請告知代表人姓名。也可在前一天下午2點起領取。"],
    "サイズ合わせ": ["Sizing", "尺寸調整"],
    "身長を見てスタッフが板をお選びします。ブーツは普段の靴のサイズを目安に、試着でフィット感を確認します。": ["Staff choose skis or a snowboard based on your height. For boots, we start from your usual shoe size and check the fit as you try them on.", "工作人員會依身高挑選雪板。雪靴以平常的鞋子尺寸為參考，試穿確認合腳程度。"],
    "ゲレンデへ！": ["Hit the slopes!", "前往雪場！"],
    "道具が揃ったら、いよいよ雪山へ。手ぶらでOK、身軽に楽しめます。": ["Once you're geared up, off to the mountain. Nothing to bring — travel light and have fun.", "器材備齊後，就出發前往雪山。空手前來即可，輕鬆暢玩。"],
    "帰りに温泉": ["Onsen on the way back", "回程泡溫泉"],
    "お店は遠刈田温泉のすぐそば。滑ったあとは温泉で温まって帰るのがおすすめです。": ["We're right by Togatta Onsen. Warm up in a hot spring before heading home.", "本店就在遠刈田溫泉旁。滑完雪後推薦泡個溫泉暖暖身再回家。"],
    "返却": ["Return", "歸還"],
    "営業時間内に道具をご返却ください。お支払いは現金のみです。": ["Please return the equipment during opening hours. Payment is cash only.", "請於營業時間內歸還器材。付款僅限現金。"],
    "服装・持ち物のコツ": ["What to wear & bring", "服裝・攜帶物品的訣竅"],
    "靴下はハイソックスがおすすめ": ["Knee-high socks are best", "襪子推薦穿長筒襪"],
    "膝下までの長い靴下だと、脱ぎ履きの際に脱げず安心です。": ["Socks up to the knee won't slip off when you put boots on or take them off.", "長到膝下的襪子在穿脫時不會脫落，很安心。"],
    "足首の厚みが重ならないので血流を妨げず、痛くなりにくいです。": ["Nothing bunches up at the ankle, so circulation isn't restricted and your feet are less likely to hurt.", "腳踝處的厚度不會重疊，不會阻礙血液循環，比較不會痛。"],
    "もこもこの靴下はNG": ["No fluffy socks", "不要穿毛茸茸的襪子"],
    "。ブーツの中で滑りが悪くなり、履きにくくなります。": [" — they make boots hard to slide into.", "，在雪靴裡不好滑動，會很難穿。"],
    "自分で用意すると良いもの": ["Good things to bring yourself", "建議自行準備的物品"],
    "ニット帽・グローブ・ネックウォーマー（セットには含まれません。店頭でも販売しています）": ["Beanie, gloves, neck warmer (not included in sets; also sold in the shop)", "毛帽・手套・圍脖（不含在套組內，店內也有販售）"],
    "インナー（動きやすく、汗をかいても冷えにくいもの）": ["Base layers (easy to move in, and warm even when you sweat)", "內層衣物（方便活動、流汗也不易著涼的）"],
    "日焼け止め（雪面の照り返しは強いです）": ["Sunscreen (the glare off the snow is strong)", "防曬乳（雪面的反射很強）"],
    "板やブーツのサイズは心配いりません": ["Don't worry about ski, snowboard or boot sizes", "不用擔心雪板或雪靴的尺寸"],
    "スタッフが身長・滑り方に合わせて最適な板を選びます。": ["Staff choose skis or a snowboard to suit your height and style.", "工作人員會依您的身高與滑法挑選最合適的雪板。"],
    "ブーツは普段の靴のサイズでOK。試着で確認できます。": ["Your usual shoe size works for boots — you can check when you try them on.", "雪靴選平常的鞋子尺寸即可，試穿時可以確認。"],
    "わからないことは、お気軽にお電話（070-2472-3633）または": ["Questions? Call us (070-2472-3633) or see the ", "有不清楚的地方，歡迎來電（070-2472-3633）或參考"],
    "をご覧ください。": [".", "。"],

    /* ── 初心者ガイド：マンガ各話（画像は言語別：manga-N-en/zh.jpg） ── */
    "第1話 予約でスムーズ": ["Ep. 1: Book ahead, go smoothly", "第1話 預約更順利"],
    "第1話：予約しておくと当日スムーズ！": ["Episode 1: Book ahead for a smooth day!", "第1話：事先預約，當天更順利！"],
    "やつもりんの予約案内マンガ 第1話 予約でスムーズ": ["Yatsumorin's booking comic, Ep. 1: Book ahead, go smoothly", "Yatsumorin 的預約導覽漫畫 第1話 預約更順利"],
    "第2話 伝えてほしいこと": ["Ep. 2: What to tell us", "第2話 希望您告訴我們的事"],
    "第2話：予約で伝えてほしいこと、まとめたよ！": ["Episode 2: Here's what to tell us when you book!", "第2話：整理了預約時希望您告訴我們的事！"],
    "やつもりんの予約案内マンガ 第2話 伝えてほしいこと": ["Yatsumorin's booking comic, Ep. 2: What to tell us", "Yatsumorin 的預約導覽漫畫 第2話 希望您告訴我們的事"],
    "第3話 スキー？スノボ？": ["Ep. 3: Ski or snowboard?", "第3話 雙板滑雪？單板滑雪？"],
    "第3話：スキー？スノーボード？迷ったらチェック！": ["Episode 3: Ski or snowboard? Check here if you're unsure!", "第3話：雙板滑雪？單板滑雪？猶豫時看這裡！"],
    "やつもりんの予約案内マンガ 第3話 スキー？スノボ？": ["Yatsumorin's booking comic, Ep. 3: Ski or snowboard?", "Yatsumorin 的預約導覽漫畫 第3話 雙板滑雪？單板滑雪？"],
    "第4話 身長・靴のサイズ": ["Ep. 4: Height & shoe size", "第4話 身高・鞋子尺寸"],
    "第4話：身長・靴のサイズは何に使うの？": ["Episode 4: What are height and shoe size for?", "第4話：身高與鞋子尺寸做什麼用？"],
    "やつもりんの予約案内マンガ 第4話 身長・靴のサイズ": ["Yatsumorin's booking comic, Ep. 4: Height & shoe size", "Yatsumorin 的預約導覽漫畫 第4話 身高・鞋子尺寸"],
    "第5話 年齢・性別": ["Ep. 5: Age & gender", "第5話 年齡・性別"],
    "第5話：年齢・性別は何に使うの？": ["Episode 5: What are age and gender for?", "第5話：年齡與性別做什麼用？"],
    "やつもりんの予約案内マンガ 第5話 年齢・性別": ["Yatsumorin's booking comic, Ep. 5: Age & gender", "Yatsumorin 的預約導覽漫畫 第5話 年齡・性別"],
    "第6話 開放値って何？": ["Ep. 6: What's the DIN setting?", "第6話 什麼是釋放值（DIN值）？"],
    "第6話：開放値って何？（転倒時に板が外れる仕組み）": ["Episode 6: What's the DIN setting? (how skis release when you fall)", "第6話：什麼是釋放值（DIN值）？（跌倒時雪板脫離雪靴的機制）"],
    "やつもりんの予約案内マンガ 第6話 開放値って何？": ["Yatsumorin's booking comic, Ep. 6: What's the DIN setting?", "Yatsumorin 的預約導覽漫畫 第6話 什麼是釋放值（DIN值）？"],
    "第7話 スタンス": ["Ep. 7: Stance", "第7話 站姿"],
    "第7話：スタンスって何？": ["Episode 7: What's a stance?", "第7話：什麼是站姿？"],
    "やつもりんの予約案内マンガ 第7話 スタンス": ["Yatsumorin's booking comic, Ep. 7: Stance", "Yatsumorin 的預約導覽漫畫 第7話 站姿"],
    "第8話 家族・グループ予約": ["Ep. 8: Family & group bookings", "第8話 家庭・團體預約"],
    "第8話：家族・グループで予約するとき": ["Episode 8: Booking for a family or group", "第8話：家庭・團體預約時"],
    "やつもりんの予約案内マンガ 第8話 家族・グループ予約": ["Yatsumorin's booking comic, Ep. 8: Family & group bookings", "Yatsumorin 的預約導覽漫畫 第8話 家庭・團體預約"],
    "第9話 服装・持ち物": ["Ep. 9: What to wear & bring", "第9話 服裝・攜帶物品"],
    "第9話：当日の服装・持ち物は？": ["Episode 9: What to wear and bring on the day", "第9話：當天的服裝・攜帶物品？"],
    "やつもりんの予約案内マンガ 第9話 服装・持ち物": ["Yatsumorin's booking comic, Ep. 9: What to wear & bring", "Yatsumorin 的預約導覽漫畫 第9話 服裝・攜帶物品"],
    "第10話 受け取りの流れ": ["Ep. 10: How pickup works", "第10話 領取流程"],
    "第10話：予約から受け取りまでの流れ": ["Episode 10: From booking to pickup", "第10話：從預約到領取的流程"],
    "やつもりんの予約案内マンガ 第10話 受け取りの流れ": ["Yatsumorin's booking comic, Ep. 10: How pickup works", "Yatsumorin 的預約導覽漫畫 第10話 領取流程"],

    /* ── ギャラリー ── */
    "8つ森レンタルの店内・レンタル道具・ゲレンデの様子をご紹介します。写真をタップすると大きく表示できます。": ["A look inside our shop, our rental gear and the slopes. Tap a photo to enlarge it.", "介紹8つ森租借的店內、租借器材與雪場情景。點擊照片可放大。"],
    "拡大画像": ["Enlarged image", "放大圖片"],

    /* ── 遠刈田温泉ガイド ── */
    "提携ホテル：メルキュール宮城蔵王リゾート＆スパ": ["Partner hotel: Mercure Miyagi Zao Resort & Spa", "合作飯店：美居宮城藏王度假村＆水療中心"],
    "8つ森レンタル × メルキュール宮城蔵王リゾート＆スパ 提携プラン": ["Yatsumori Rental × Mercure Miyagi Zao Resort & Spa partner plan", "8つ森租借 × 美居宮城藏王度假村＆水療中心 合作方案"],
    "【フルセット】手ぶらでOK！スキー・スノーボード レンタル付きプラン": ["[Full Set] Come empty-handed! Stay plan with ski/snowboard rental", "【全套組】空手前來OK！附雙板滑雪・單板滑雪器材租借的住宿方案"],
    "＜夕朝食付＞": [" (dinner & breakfast included)", "＜附晚餐・早餐＞"],
    "お泊まりとレンタルがセットになったプランです。下の予約サイトからそのままお申し込みいただけます。料金・空室状況は各サイトでご確認ください。": ["A plan that combines your stay and your rental. Book directly through the sites below; check prices and availability on each site.", "住宿與租借合一的方案。可直接從下方的訂房網站申請。價格與空房狀況請至各網站確認。"],
    "じゃらんで見る": ["View on Jalan", "在 Jalan 查看"],
    "楽天トラベルで見る": ["View on Rakuten Travel", "在樂天旅遊查看"],
    "一休.comで見る": ["View on Ikyu.com", "在一休.com查看"],
    "※ご予約は12月24日分より可能です。": ["*Bookings are available for stays from December 24.", "※可預約12月24日起的住宿。"],
    "えぼしリゾート・リフトチケット販売予定": ["Eboshi Resort lift tickets — sales planned", "預計販售 Eboshi 度假村纜車票"],
    "滑ったあとは、温泉で。": ["After the slopes, a hot spring.", "滑完雪後，就泡溫泉。"],
    "遠刈田温泉": ["Togatta Onsen", "遠刈田溫泉"],
    "遠刈田（とおがった）温泉は、蔵王の麓にひろがる歴史ある温泉地。スキーやスノーボードで冷えて疲れた体を、あたたかい湯でゆっくりほぐせます。8つ森レンタルは、その温泉街のすぐそば。滑って、温まって、また来たくなる一日をどうぞ。": ["Togatta Onsen is a historic hot-spring town at the foot of Zao. Let warm water soothe a body chilled and tired from skiing or snowboarding. Yatsumori Rental is right by the onsen town — ride, warm up, and enjoy a day that makes you want to come back.", "遠刈田（Togatta）溫泉是位於藏王山麓、歷史悠久的溫泉地。體驗雙板滑雪或單板滑雪後，可以泡個溫泉，放鬆冰冷疲憊的身體。8つ森租借就在溫泉街旁。滑雪、暖身，度過讓人想再來的一天。"],
    "温泉街の楽しみ方": ["Enjoying the onsen town", "溫泉街的玩法"],
    "遠刈田温泉は、湯めぐりや食べ歩き、お土産探しも楽しい温泉街です。共同浴場や足湯もあり、散策するだけでも温泉地の風情を感じられます。ゲレンデ帰りに立ち寄って、体の芯まであたたまってからお帰りください。": ["Togatta Onsen is great for bath-hopping, snacking and souvenir shopping. With public baths and foot baths, just strolling around gives you the feel of a hot-spring town. Stop by on your way back from the slopes and warm up to the core before heading home.", "遠刈田溫泉是能享受泡湯巡禮、邊走邊吃、挑選伴手禮的溫泉街。有公共浴場與足湯，光是散步就能感受溫泉地的風情。從雪場回程時順道去泡個湯，讓身體暖到核心再回家吧。"],
    "8つ森レンタルのおすすめプラン": ["Our suggested day plan", "8つ森租借推薦行程"],
    "朝、道具を受け取る": ["Morning: pick up your gear", "早上：領取器材"],
    "前日午後2時からの受け取りもOK。宿泊の方は前夜に受け取ると朝がスムーズです。": ["Pickup from 2 PM the day before is fine too. If you're staying nearby, picking up the night before makes your morning easy.", "也可以在前一天下午2點起領取。住宿的旅客前一晚先領取，早上會更順利。"],
    "ゲレンデで思いきり滑る": ["Ride to your heart's content", "在雪場盡情滑雪"],
    "手ぶらでOK。近くのスキー場で一日たっぷり楽しめます。": ["Come empty-handed and enjoy a full day at a nearby ski resort.", "空手前來即可，在附近的滑雪場盡情玩一整天。"],
    "夕方、温泉であたたまる": ["Evening: warm up in a hot spring", "傍晚：泡溫泉暖身"],
    "冷えた体を温泉でリセット。疲れの取れ方が変わります。": ["Reset your chilled body in the hot spring — you'll feel the difference.", "用溫泉讓冰冷的身體重新充電，消除疲勞的感受大不同。"],
    "道具を返却して帰宅": ["Return the gear and head home", "歸還器材後回家"],
    "営業時間内にご返却ください。身軽に帰れます。": ["Return it during opening hours and travel home light.", "請於營業時間內歸還，輕鬆回家。"],
    "メルキュール宮城蔵王リゾート＆スパ 公式サイトを見る": ["Visit the Mercure Miyagi Zao Resort & Spa website", "查看美居宮城藏王度假村＆水療中心官網"],

    /* ── プライバシーポリシー ── */
    "8つ森レンタル（以下「当店」）は、お客様の個人情報を適切に取り扱います。": ["Yatsumori Rental (\"we\") handles your personal information with care.", "8つ森租借（以下稱「本店」）會妥善處理顧客的個人資料。"],
    "1. 取得する情報": ["1. Information we collect", "1. 取得的資訊"],
    "ご予約の際に、お名前・電話番号・メールアドレス（任意）・ご利用日・ご利用者の身長や靴のサイズなど、レンタルに必要な情報をお預かりします。": ["When you book, we collect the information needed for your rental, such as your name, phone number, email address (optional), rental dates, and each guest's height and shoe size.", "預約時，我們會取得租借所需的資訊，如姓名、電話號碼、電子郵件（選填）、使用日期、使用者的身高與鞋子尺寸等。"],
    "WEB予約の際に、お名前・電話番号・メールアドレス（任意）・ご利用日・ご利用者の身長や靴のサイズなど、レンタルに必要な情報をお預かりします。": ["When you book online, we collect the information needed for your rental, such as your name, phone number, email address (optional), rental dates, and each guest's height and shoe size.", "線上預約時，我們會取得租借所需的資訊，如姓名、電話號碼、電子郵件（選填）、使用日期、使用者的身高與鞋子尺寸等。"],
    "2. 利用目的": ["2. How we use it", "2. 使用目的"],
    "お預かりした情報は、次の目的にのみ利用します。": ["We use this information only for the following purposes:", "取得的資訊僅用於以下目的。"],
    "ご予約の受付・確認・ご連絡": ["Receiving and confirming bookings, and contacting you about them", "受理・確認預約及聯絡"],
    "レンタル用具のご準備": ["Preparing rental equipment", "準備租借器材"],
    "お問い合わせへの対応": ["Responding to enquiries", "回覆洽詢"],
    "3. 第三者への提供": ["3. Sharing with third parties", "3. 提供給第三方"],
    "法令に基づく場合を除き、お客様の同意なく個人情報を第三者に提供することはありません。": ["Except where required by law, we never share your personal information with third parties without your consent.", "除依法令規定外，未經顧客同意，不會將個人資料提供給第三方。"],
    "4. 情報の管理": ["4. Data management", "4. 資訊管理"],
    "お客様の情報は、予約管理システム（Supabase）上で適切に管理し、業務上必要な範囲でのみ取り扱います。": ["Your information is stored securely in our booking system (Supabase) and handled only as needed for our business.", "顧客資訊會在預約管理系統（Supabase）上妥善管理，僅在業務必要範圍內處理。"],
    "5. お問い合わせ": ["5. Contact", "5. 洽詢"],
    "個人情報の取り扱いに関するお問い合わせは、お電話（070-2472-3633）までお願いいたします。": ["For questions about how we handle personal information, please call us at 070-2472-3633.", "有關個人資料處理的洽詢，請來電 070-2472-3633。"],
    "※ 本ポリシーの内容は、店舗の運用に合わせて見直すことがあります。": ["* This policy may be revised to reflect how the shop operates.", "※ 本政策內容可能會依店舖營運狀況進行調整。"],

    /* ── 周辺グルメ ── */
    "滑ったあとの、お楽しみ。": ["A treat after a day on the slopes.", "滑雪後的樂趣。"],
    "周辺グルメ": ["Local food", "周邊美食"],
    "たっぷり滑ったあとは、おいしいごはんで一息。蔵王・遠刈田温泉のまわりには、地元で愛される味がいろいろあります。ここでは蔵王エリアの代表的な名物をご紹介します。": ["After a long day of riding, take a break with some good food. The area around Zao and Togatta Onsen has plenty of local favorites — here are some of Zao's best-known specialties.", "盡情滑雪後，就用美食歇口氣吧。藏王・遠刈田溫泉周邊有許多在地人喜愛的美味。這裡介紹藏王地區的代表性名產。"],
    "蔵王エリアの名物": ["Zao specialties", "藏王地區名產"],
    "ジンギスカン": ["Jingisukan (grilled lamb)", "成吉思汗烤羊肉"],
    "蔵王といえばこれ。冷えた体に、あつあつのお肉と野菜がしみわたります。": ["Zao's signature dish. Sizzling lamb and vegetables warm you right through.", "說到藏王就是這個。熱騰騰的肉與蔬菜，暖透冰冷的身體。"],
    "蔵王のチーズ・乳製品": ["Zao cheese & dairy", "藏王起司・乳製品"],
    "酪農がさかんな蔵王。チーズやソフトクリーム、ヨーグルトはおみやげにも人気です。": ["Zao is dairy country — its cheese, soft-serve and yogurt are popular souvenirs.", "藏王酪農業興盛，起司、霜淇淋、優格都是很受歡迎的伴手禮。"],
    "そば・温かい麺類": ["Soba & hot noodles", "蕎麥麵・熱麵類"],
    "寒い季節にうれしい、あたたかい一杯。地元のそば処もあります。": ["A warm bowl is just what you want in the cold season. There are local soba shops too.", "寒冷季節最讓人開心的熱騰騰一碗，也有在地的蕎麥麵店。"],
    "温泉まんじゅう・甘味": ["Onsen buns & sweets", "溫泉饅頭・甜點"],
    "温泉街の食べ歩きに。散策のおともにぴったりです。": ["Perfect for snacking as you stroll the onsen town.", "適合在溫泉街邊走邊吃，是散步的好夥伴。"],
    "※ 具体的なおすすめのお店・営業時間は、季節により変わります。スタッフおすすめのお店は、ご来店時にお気軽にお尋ねください。": ["* Shops and opening hours change with the season. Ask our staff for their favorites when you visit.", "※ 具體推薦店家與營業時間會依季節而異。來店時歡迎詢問工作人員推薦的店家。"],

    /* ── 蔵王のスキー場情報 ── */
    "お店から近いゲレンデ": ["Slopes near the shop", "離本店近的雪場"],
    "蔵王のスキー場": ["Ski resorts in Zao", "藏王的滑雪場"],
    "8つ森レンタルは、宮城側の蔵王・遠刈田温泉にあります。周辺には初心者から楽しめるゲレンデがあり、手ぶらでレンタルしてそのままゲレンデへ向かえます。代表的なスキー場を、お店から近い順にご紹介します。": ["Yatsumori Rental is in Togatta Onsen, on the Miyagi side of Zao. There are slopes nearby that even beginners can enjoy — rent empty-handed and head straight out. Here are the main ski resorts, closest first.", "8つ森租借位於宮城縣側的藏王・遠刈田溫泉。周邊有初學者也能享受的雪場，空手租借後就能直接前往。以下依離本店的距離由近到遠介紹代表性的滑雪場。"],
    "みやぎ蔵王えぼしリゾート": ["Miyagi Zao Eboshi Resort", "宮城藏王 Eboshi 度假村"],
    "お店から車で約15分": ["About 15 min by car from the shop", "距本店車程約15分鐘"],
    "お店から車で約20分": ["About 20 min by car from the shop", "距本店車程約20分鐘"],
    "お店から車で約1時間20分": ["About 1 hr 20 min by car from the shop", "距本店車程約1小時20分鐘"],
    "遠刈田温泉から近い、宮城蔵王を代表するスキー場のひとつ。初心者向けの緩やかなコースから中上級コースまで幅広く楽しめます。ファミリーやはじめての方にもおすすめです。": ["One of Miyagi Zao's leading ski resorts, close to Togatta Onsen. Courses range from gentle beginner runs to intermediate and advanced. Recommended for families and first-timers.", "離遠刈田溫泉很近，是宮城藏王代表性的滑雪場之一。從適合初學者的平緩雪道到中高級雪道都能盡情享受。推薦給家庭與第一次滑雪的人。"],
    "みやぎ蔵王すみかわスノーパーク": ["Miyagi Zao Sumikawa Snow Park", "宮城藏王 Sumikawa 雪上樂園"],
    "蔵王エコーライン沿いにあるスキー場。良質な雪と自然の中で滑走を楽しめます。雪上車で行く樹氷観賞なども知られています。": ["A ski area along the Zao Echo Line, where you can ride on quality snow surrounded by nature. It's also known for snowcat tours to see the \"snow monsters\" (frost-covered trees).", "位於藏王 Echo Line 沿線的滑雪場，能在優質的雪與大自然中滑行。搭乘雪上車觀賞樹冰的行程也很有名。"],
    "みやぎ蔵王白石スキー場": ["Miyagi Zao Shiroishi Ski Resort", "宮城藏王白石滑雪場"],
    "白石市側にあるスキー場。ゲレンデが見渡しやすく、お子さま連れでもお互いの姿を確認しながら滑れます。はじめてのスキー・スノーボードの練習にも、ご家族でゆったり過ごす一日にもおすすめです。": ["A ski area on the Shiroishi City side. The slopes are easy to see across, so families with kids can keep an eye on each other while riding. Great for first-time practice or a relaxed family day.", "位於白石市側的滑雪場。雪場視野開闊，帶小孩也能邊滑邊看到彼此。推薦給第一次練習雙板滑雪・單板滑雪的人，以及想悠閒度過一天的家庭。"],
    "蔵王温泉スキー場": ["Zao Onsen Ski Resort", "藏王溫泉滑雪場"],
    "山形県側にあるスキー場。初心者向けから上級者向けまでコースが広いエリアに点在し、ふもとには蔵王温泉の温泉街が広がっています。冬の「樹氷」が見られることでも知られています。お店からは車で1時間以上かかるので、時間に余裕のある日にどうぞ。": ["A ski resort on the Yamagata side, with courses for every level spread over a wide area and the Zao Onsen hot-spring town at its base. It's famous for its winter \"snow monsters\" (juhyo). It's over an hour's drive from the shop, so go on a day with time to spare.", "位於山形縣側的滑雪場。從初級到高級的雪道分布在廣大的區域，山腳下是藏王溫泉的溫泉街。也以冬季可欣賞「樹冰」聞名。距本店車程超過1小時，請在時間充裕的日子前往。"],
    "※ リフトの運行状況・積雪・料金・営業時間は、天候やシーズンにより変わります。おでかけ前に": ["* Lift operations, snow depth, prices and hours change with the weather and season. Before you go, be sure to check ", "※ 纜車營運狀況・積雪・價格・營業時間會依天候與季節而異。出發前請務必確認"],
    "各スキー場の公式サイトや最新情報": ["each resort's official website and latest updates", "各滑雪場的官網與最新資訊"],
    "を必ずご確認ください。": [".", "。"],
    "※ お店からの所要時間は通常の道路状況での": ["* Travel times from the shop are ", "※ 距本店的所需時間是一般道路狀況下的"],
    "目安": ["estimates", "參考值"],
    "です。積雪や凍結のときは、時間に余裕をもっておでかけください。": [" under normal road conditions. Allow extra time when roads are snowy or icy.", "。積雪或結冰時，請預留充裕時間出門。"],
    "※ 山形県側の蔵王温泉スキー場へ向かう蔵王エコーラインは": ["* The Zao Echo Line road to Zao Onsen Ski Resort on the Yamagata side is ", "※ 通往山形縣側藏王溫泉滑雪場的藏王 Echo Line"],
    "冬季通行止め": ["closed in winter", "冬季封閉"],
    "のため、冬は迂回路での移動になります。": [", so in winter you'll need to take a detour.", "，冬季需繞道前往。"],
    "※ どのゲレンデに行くか迷ったら、レベルや目的に合わせてスタッフがご案内します。お気軽にご相談ください。": ["* Not sure which slopes to choose? Our staff can recommend one to suit your level and plans — just ask.", "※ 不知道要去哪個雪場時，工作人員會依您的程度與目的為您介紹，歡迎詢問。"]
  };

  /* ------------------------------------------------------------------
     ルール：数字などが混ざる動的テキスト（完全一致では拾えないもの）
  ------------------------------------------------------------------ */
  var RULES = [
    { re: /^お子様 (\d+)人目$/, en: "Child #$1", zh: "兒童 第$1位" },
    { re: /^大人 (\d+)人目$/, en: "Adult #$1", zh: "成人 第$1位" },
    { re: /^この方の料金（(.+)日間・大人）$/, en: "Price for this guest ($1 days, adult)", zh: "此人費用（$1天・成人）" },
    { re: /^この方の料金（(.+)日間・子供）$/, en: "Price for this guest ($1 days, child)", zh: "此人費用（$1天・兒童）" },
    { re: /^(\d{4}-\d{2}-\d{2})（日帰り）$/, en: "$1 (day trip)", zh: "$1（當天來回）" },
    { re: /^(\d{4}-\d{2}-\d{2}) 〜 (\d{4}-\d{2}-\d{2})（(\d+)日間）$/, en: "$1 – $2 ($3 days)", zh: "$1 〜 $2（$3天）" },
    { re: /^希望する（(.+) 午後2時〜）$/, en: "Yes (from 2 PM on $1)", zh: "希望（$1 下午2點〜）" },
    { re: /^利用者(\d+)（大人）$/, en: "Guest $1 (adult)", zh: "使用者$1（成人）" },
    { re: /^利用者(\d+)（お子様）$/, en: "Guest $1 (child)", zh: "使用者$1（兒童）" },
    { re: /^第(\d+)話 コマ(\d+)$/, en: "Episode $1, panel $2", zh: "第$1話 第$2格" },
    { re: /^8つ森レンタル 店内・道具・ゲレンデの様子 (\d+)$/, en: "Yatsumori Rental — shop, gear & slopes $1", zh: "8つ森租借 店內・器材・雪場情景 $1" }
  ];

  /* ------------------------------------------------------------------
     用語：複数の語が1つのテキストに混ざる場合の部分置換
     （例「165cm / 25.0cm / スキー / 滑走セット ・ 」「追加: ヘルメット・ゴーグル / 男性 / 30歳」）
     ※ 文章（。、！？を含むもの）には使わない＝訳し漏れが混ざった変な文にならないように
  ------------------------------------------------------------------ */
  var TERMS = [
    [/お子様 (\d+)人目/g, "Child #$1", "兒童 第$1位"],
    [/大人 (\d+)人目/g, "Adult #$1", "成人 第$1位"],
    [/(\d+)人目/g, "#$1", "第$1位"],
    [/(\d+)日間/g, "$1 days", "$1天"],
    [/(\d+)名/g, "$1", "$1位"],
    [/(\d+)歳/g, "$1 yrs", "$1歲"],
    [/日帰り/g, "day trip", "當天來回"],
    [/追加:/g, "Add-ons:", "追加："],
    [/フルセット（ウェア付き）/g, "Full Set (with clothing)", "全套組（含雪衣）"],
    [/セットなし（単品のみ）/g, "No set", "不選套組"],
    [/滑走セット/g, "Riding Set", "滑行組"],
    [/フルセット/g, "Full Set", "全套組"],
    [/板のレンタルなし/g, "No board", "不租雪板"],
    [/スノーボード/g, "Snowboard", "單板滑雪"],
    [/スキー/g, "Ski", "雙板滑雪"],
    [/キッズ用ハーネス/g, "Kids' harness", "兒童安全吊帶"],
    [/スノーシュー/g, "Snowshoes", "雪鞋"],
    [/ヘルメット/g, "Helmet", "安全帽"],
    [/ゴーグル/g, "Goggles", "護目鏡"],
    [/ウェア（上）/g, "Jacket", "雪衣（上）"],
    [/ウェア（下）/g, "Pants", "雪衣（下）"],
    [/ソリ/g, "Sled", "雪橇"],
    [/スタンス未定/g, "Stance TBD", "站姿未定"],
    [/レギュラー/g, "Regular", "正腳（Regular）"],
    [/グーフィー/g, "Goofy", "反腳（Goofy）"],
    [/男性/g, "Male", "男性"],
    [/女性/g, "Female", "女性"],
    [/大人/g, "Adults", "成人"],
    [/子供/g, "Children", "兒童"],
    [/ 様/g, "", ""]
  ];

  /* ------------------------------------------------------------------
     エンジン
  ------------------------------------------------------------------ */
  var JP = /[\u3041-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;   // ひらがな・カタカナ・漢字
  var KANA = /[\u3041-\u309F\u30A0-\u30FA\u30FC-\u30FF]/; // かなだけ（中国語には無い＝訳し残りの判定用）
  var SENT = /[\u3002\u3001\uFF01\uFF1F]/;                  // 。、！？＝文章判定（用語置換を避ける）
  // 先頭の絵文字・記号と、末尾の記号（›／など）は訳さずにそのまま付け直す
  var PRE = /^([\s\u3000\u00A0\u2190-\u2BFF\u3030\uFE0F\uD800-\uDFFF\uFF3C\\\u30FB\u25C6\u25A0\u25CF\u25B6]+)/;
  var SUF = /([\s\u3000\u00A0\u203A\u00BB\u2192\uFF1E>\uFF0F\/]+)$/;

  var origText = new WeakMap();   // テキストノード → 元の日本語
  var origAttr = new WeakMap();   // 要素 → {属性名: 元の日本語}
  var cur = "ja";
  var applying = false;
  var scheduled = false;

  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }

  // 日本語文字列 ja を lang に訳す。訳せなければ null
  function tr(ja, lang) {
    if (lang === "ja") return null;
    var k = norm(ja);
    if (!k || !JP.test(k)) return null;
    var idx = lang === "en" ? 0 : 1;

    var hit = D[k];
    if (hit && hit[idx]) return hit[idx];

    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(k)) {
        var rep = lang === "en" ? RULES[i].en : RULES[i].zh;
        if (rep) return k.replace(RULES[i].re, rep);
      }
    }

    // 先頭・末尾の記号を外して再挑戦（例「📍 住所」「一覧を見る ›」）
    var pre = "", suf = "", core = k, m;
    m = core.match(PRE); if (m) { pre = m[1]; core = core.slice(pre.length); }
    m = core.match(SUF); if (m) { suf = m[1]; core = core.slice(0, core.length - suf.length); }
    if (core !== k && core) {
      var inner = tr(core, lang);
      if (inner) return pre + inner + suf;
    }

    // 用語の部分置換（短い・文章でないものだけ）
    // 例：「165cm / 25.0cm / スキー / 滑走セット ・ 」「追加: ヘルメット・ゴーグル / 男性 / 30歳」
    if (core.length <= 60 && !SENT.test(core)) {
      var out = core, changed = false;
      for (var j = 0; j < TERMS.length; j++) {
        var t = TERMS[j], next = out.replace(t[0], lang === "en" ? t[1] : t[2]);
        if (next !== out) { out = next; changed = true; }
      }
      // 訳し残りが混ざった変な文にしない（英語＝日本語が残っていないこと／
      // 中国語＝かなが残っていないこと。中国語は漢字が残っても読めるので許容）
      var rest = out.replace(/[ー・（）]/g, "");
      var dirty = lang === "en" ? JP.test(rest) : KANA.test(rest);
      if (changed && !dirty) return pre + out + suf;
    }
    return null;
  }

  // 前後の空白を保ったまま置き換える（インライン要素の間隔を壊さないため）
  function keepPad(raw, translated) {
    var m = String(raw).match(/^(\s*)[\s\S]*?(\s*)$/);
    return (m ? m[1] : "") + translated + (m ? m[2] : "");
  }

  var SKIP_TAG = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, SVG: 1 };
  function skipped(el) {
    while (el && el.nodeType === 1) {
      if (SKIP_TAG[String(el.nodeName).toUpperCase()]) return true;
      if (el.hasAttribute("data-no-i18n") || el.hasAttribute("data-langblock")) return true;
      el = el.parentElement;
    }
    return false;
  }

  function translateTexts(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n, list = [];
    while ((n = w.nextNode())) list.push(n);
    for (var i = 0; i < list.length; i++) {
      n = list[i];
      var raw = origText.has(n) ? origText.get(n) : n.nodeValue;
      if (!JP.test(raw)) continue;
      if (skipped(n.parentElement)) continue;
      if (cur === "ja") { if (origText.has(n)) n.nodeValue = raw; continue; }
      var t = tr(raw, cur);
      if (t) { if (!origText.has(n)) origText.set(n, raw); n.nodeValue = keepPad(raw, t); }
    }
  }

  var I18N_ATTRS = ["placeholder", "title", "alt", "aria-label"];
  function translateAttrs(root) {
    var sel = "[placeholder],[title],[alt],[aria-label]";
    var els = [];
    if (root.nodeType === 1 && root.matches && root.matches(sel)) els.push(root);
    if (root.querySelectorAll) els = els.concat(Array.prototype.slice.call(root.querySelectorAll(sel)));
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (skipped(el)) continue;
      var store = origAttr.get(el) || {};
      for (var j = 0; j < I18N_ATTRS.length; j++) {
        var a = I18N_ATTRS[j];
        if (!el.hasAttribute(a)) continue;
        // ページ側のJSが属性を書き換えていたら（訳した値と違う）、控えを捨てて新しい日本語を元にする
        if ((a in store) && el.getAttribute(a) !== store["\u0000" + a]) delete store[a];
        var raw = (a in store) ? store[a] : el.getAttribute(a);
        if (!JP.test(raw)) continue;
        if (cur === "ja") { if (a in store) el.setAttribute(a, raw); continue; }
        var t = tr(raw, cur);
        if (t) { store[a] = raw; store["\u0000" + a] = t; origAttr.set(el, store); el.setAttribute(a, t); }
      }
    }
  }

  // 料金ページのような [data-langblock] があるページは、ブロックの出し分けだけ行う
  function toggleLangBlocks() {
    var blocks = document.querySelectorAll("[data-langblock]");
    if (!blocks.length) return false;
    for (var i = 0; i < blocks.length; i++) {
      blocks[i].style.display = (blocks[i].getAttribute("data-langblock") === cur) ? "" : "none";
    }
    var btns = document.querySelectorAll("#lang-switch button[data-lang]");
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.toggle("active", btns[j].getAttribute("data-lang") === cur);
    }
    return true;
  }

  /* ---------------- 切替ボタン ---------------- */
  function injectCss() {
    if (document.getElementById("yr-lang-css")) return;
    var s = document.createElement("style");
    s.id = "yr-lang-css";
    s.textContent =
      ".yr-lang{display:inline-flex;gap:3px;background:#fff;border:1.5px solid #dde2e8;border-radius:999px;padding:3px;box-shadow:0 2px 8px rgba(20,40,60,.10);flex:0 0 auto;z-index:50}" +
      ".yr-lang button{border:0;background:transparent;border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;font-weight:800;color:#6b7785;cursor:pointer;line-height:1.25;white-space:nowrap}" +
      ".yr-lang button.active{background:#15314f;color:#fff}" +
      ".yr-lang.compact button{padding:5px 8px;font-size:11.5px}" +
      ".yr-lang.block{display:flex;width:100%;margin:0 0 16px;border-radius:999px}" +
      ".yr-lang.block button{flex:1;padding:9px 0;font-size:13px}";
    (document.head || document.documentElement).appendChild(s);
  }

  function buildSwitch(compact, block) {
    var d = document.createElement("div");
    d.className = "yr-lang" + (compact ? " compact" : "") + (block ? " block" : "");
    d.id = "yr-lang";
    d.setAttribute("data-no-i18n", "1");
    ["ja", "en", "zh"].forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-yr-lang", l);
      b.textContent = compact ? LABEL.short[l] : LABEL.full[l];
      d.appendChild(b);
    });
    return d;
  }

  // ページの作りに合わせて置き場所を決める
  function ensureSwitch() {
    if (document.getElementById("lang-switch")) return;      // 料金ページは元からある
    var exist = document.getElementById("yr-lang");
    if (exist && document.contains(exist)) { markActive(); return; }
    injectCss();

    var header = document.querySelector(".site-header");      // トップ（PC / スマホ）
    if (header) {
      var page = document.querySelector(".page");
      var compact = !!(page && page.offsetWidth && page.offsetWidth < 520);
      var sw = buildSwitch(compact, false);
      var anchor = header.querySelector(".header-cta-btn") || header.querySelector(".menu-btn");
      if (anchor) header.insertBefore(sw, anchor); else header.appendChild(sw);
      markActive();
      return;
    }
    var container = document.querySelector(".container");     // 予約・案内ページ
    if (container) {
      container.insertBefore(buildSwitch(false, true), container.firstChild);
      markActive();
      return;
    }
    var root = document.getElementById("page-root") || document.body;
    if (root) { root.insertBefore(buildSwitch(false, true), root.firstChild); markActive(); }
  }

  function markActive() {
    var btns = document.querySelectorAll("#yr-lang button[data-yr-lang]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-yr-lang") === cur);
    }
  }

  /* ---------------- 適用 ---------------- */
  function apply() {
    if (applying) return;
    applying = true;
    try {
      document.documentElement.setAttribute("lang", HTML_LANG[cur] || "ja");
      ensureSwitch();
      // [data-langblock] のページ（料金）はブロック外（見出しバー等）だけ訳す。ブロック内はskipped()で除外される
      toggleLangBlocks();
      if (document.body) {
        translateTexts(document.body);
        translateAttrs(document.body);
      }
      markActive();
    } catch (e) {
      if (window.console) console.warn("[i18n]", e);
    } finally {
      if (observer) observer.takeRecords();
      applying = false;
    }
  }

  function schedule() {
    if (scheduled || applying) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; apply(); }, 50);
  }

  function setLang(lang, save) {
    if (!LANGS[lang]) lang = "ja";
    cur = lang;
    if (save !== false) { try { localStorage.setItem(LS_KEY, lang); } catch (_) {} }
    // 言語別の画像（初心者ガイドのマンガ等）を差し替えるページ向けの合図。訳の適用より先に出す
    try { document.dispatchEvent(new CustomEvent("yr:langchange", { detail: { lang: cur } })); } catch (_) {}
    apply();
  }

  /* ---------------- 起動 ---------------- */
  var q = (location.search.match(/[?&]lang=(ja|en|zh)\b/) || [])[1];
  var saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch (_) {}
  cur = LANGS[q] ? q : (LANGS[saved] ? saved : "ja");
  if (q) { try { localStorage.setItem(LS_KEY, q); } catch (_) {} }

  // 切替ボタンのクリック（documentへの委譲＝公開版で中身が差し替わっても効く）
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-yr-lang],#lang-switch button[data-lang]") : null;
    if (!b) return;
    var l = b.getAttribute("data-yr-lang") || b.getAttribute("data-lang");
    if (!LANGS[l]) return;
    setLang(l);
    if (b.getAttribute("data-lang")) window.scrollTo(0, 0);   // 料金ページは従来どおり先頭へ
  });

  // 後から作られる要素（予約ウィザードのカード等・公開版の差し替え）に追従
  var observer = null;
  if (window.MutationObserver) {
    observer = new MutationObserver(function () { if (!applying) schedule(); });
  }
  function start() {
    apply();
    if (observer && document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // ページ側のJS（alert/confirmなど、DOMに出ない文言）から使えるように公開
  window.yrT = function (ja) { return (cur === "ja" ? null : tr(ja, cur)) || ja; };
  window.yrLang = function () { return cur; };
  window.yrSetLang = setLang;
})();
