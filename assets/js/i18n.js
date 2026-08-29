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
   ・[data-langblock] があるページ（料金）はブロックの出し分けだけを行い、
     テキスト置換はしない（英語ブロックを二重翻訳しないため）。
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
    "8つ森レンタルは、宮城蔵王・遠刈田温泉の": ["Yatsumori Rental — a ski & snowboard rental shop", "8つ森 Rental 位於宮城藏王・遠刈田溫泉，"],
    "8つ森レンタルは、蔵王・遠刈田温泉の": ["Yatsumori Rental — a ski & snowboard rental shop", "8つ森 Rental 位於藏王・遠刈田溫泉，"],
    "スキー・スノーボードレンタル専門店です。": ["in Togatta Onsen, Zao, Miyagi.", "是滑雪・單板器材的出租專門店。"],

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
    "板は": ["Boards are", "雪板"],
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
    "板をベストコンディションに": ["Get your board in top shape", "讓雪板保持最佳狀態"],

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
    "営業時間 8:00〜17:00（不定休）": ["Open 8:00–17:00 (irregular holidays)", "營業時間 8:00〜17:00（不定休）"],
    "営業時間 8:30〜18:00（不定休）": ["Open 8:30–18:00 (irregular holidays)", "營業時間 8:30〜18:00（不定休）"],
    "営業時間": ["Opening hours", "營業時間"],
    "8:00〜17:00（不定休） 070-2472-3633": ["8:00–17:00 (irregular holidays) 070-2472-3633", "8:00〜17:00（不定休） 070-2472-3633"],
    // 予約ページ下部のフッター（🕒…📞… の1行。先頭の絵文字は自動で残る）
    "8:00〜17:00（不定休） 📞 070-2472-3633": ["8:00–17:00 (irregular holidays) 📞 070-2472-3633", "8:00〜17:00（不定休） 📞 070-2472-3633"],
    "8:00〜17:00（不定休）": ["8:00–17:00 (irregular holidays)", "8:00〜17:00（不定休）"],
    "詳しいアクセスを見る": ["Directions", "詳細交通資訊"],
    "店名": ["Shop", "店名"],
    "住所": ["Address", "地址"],
    "電話": ["Phone", "電話"],
    "駐車場": ["Parking", "停車場"],
    "あり": ["Available", "有"],
    "お支払い": ["Payment", "付款方式"],
    "現金のみ（クレジット・電子決済は不可）": ["Cash only (no credit cards or e-payments)", "僅收現金（不接受信用卡與電子支付）"],
    "店舗情報": ["Shop Information", "店舖資訊"],
    "蔵王・遠刈田温泉の温泉街にあるスキー・スノーボードレンタル店です。手ぶらでお越しいただけます。": [
      "A ski & snowboard rental shop in the Togatta Onsen hot-spring town of Zao. Come empty-handed.",
      "位於藏王・遠刈田溫泉溫泉街的滑雪・單板器材出租店。空手前來即可。"],
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
    "この期間の空き状況：スキー": ["Available now — Ski", "此期間空檔：雙板滑雪"],
    "この期間（前日受け取り込み）の空き状況：スキー": ["Available now (incl. day-before pickup) — Ski", "此期間（含前一天領取）空檔：雙板滑雪"],
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
    "板・ブーツ・ストック": ["board, boots, poles", "雪板・雪靴・雪杖"],
    "フルセット": ["Full Set", "全套組"],
    "フルセット（ウェア付き）": ["Full Set (with clothing)", "全套組（含雪衣）"],
    "滑走＋ウェア上下": ["riding set + jacket & pants", "滑行組＋雪衣上下"],
    "セットなし（単品のみ）": ["No set (single items only)", "不選套組（僅單品）"],
    "板のレンタルなし": ["No board rental", "不租借雪板"],
    "板・ブーツ・ストックはレンタルされません。下の「追加レンタル」からウェアやヘルメット等の単品をお選びください（1つ以上必須）。": [
      "Board, boots and poles are not included. Please choose at least one single item (clothing, helmet, etc.) under \"Add-ons\" below.",
      "不含雪板・雪靴・雪杖。請於下方「追加租借」選擇雪衣或安全帽等單品（至少1項）。"],
    "スタンス（前にする足）": ["Stance (front foot)", "站姿（前腳）"],
    "レギュラー": ["Regular", "Regular"],
    "（左足が前）": ["(left foot forward)", "（左腳在前）"],
    "グーフィー": ["Goofy", "Goofy"],
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
    "受付時間 8:00〜17:00（不定休）": ["Phone hours 8:00–17:00 (irregular holidays)", "受理時間 8:00〜17:00（不定休）"]
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
    { re: /^利用者(\d+)（お子様）$/, en: "Guest $1 (child)", zh: "使用者$1（兒童）" }
    // ※「第N話：〜」は訳さない：マンガの中身が日本語なので、題名だけ英語にすると余計に分かりにくい
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
    [/レギュラー/g, "Regular", "Regular"],
    [/グーフィー/g, "Goofy", "Goofy"],
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
        var raw = (a in store) ? store[a] : el.getAttribute(a);
        if (!JP.test(raw)) continue;
        if (cur === "ja") { if (a in store) el.setAttribute(a, raw); continue; }
        var t = tr(raw, cur);
        if (t) { store[a] = raw; origAttr.set(el, store); el.setAttribute(a, t); }
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
      if (!toggleLangBlocks() && document.body) {
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
