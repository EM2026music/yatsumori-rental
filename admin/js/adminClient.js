// 管理画面用のSupabaseクライアント。接続情報は公開フロント側と同じ
// （anon keyは公開鍵なので問題ない）。実データの保護はRLSが担う。
//
// ../assets/js/supabaseClient.js と同じ値を入れること。
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
