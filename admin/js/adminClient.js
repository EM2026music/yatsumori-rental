// 管理画面用のSupabaseクライアント。接続情報は公開フロント側と同じ
// （anon keyは公開鍵なので問題ない）。実データの保護はRLSが担う。
//
// ../assets/js/supabaseClient.js と同じ値を入れること。
const SUPABASE_URL = "https://kmefuzynadoayvcmknxp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qSB76QVuA7oBt2uWtgcZUQ_tHfq_94R";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
