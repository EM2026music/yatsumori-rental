// Supabaseプロジェクトの接続情報。この2つの値だけがこのファイルの役割。
// anon keyは公開用の鍵なので、ここに直接書いてGitHub Pagesで公開しても問題ない
// （実際のアクセス制御はSupabase側のRow Level Securityで行っている）。
//
// Supabaseダッシュボード → Project Settings → API から取得して、
// 下記2つの値を実際の値に置き換えてください。
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
