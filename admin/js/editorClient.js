// ビジュアルエディタの保存/読込ロジック。
// 既存の sb クライアント（adminClient.js で生成済み）をそのまま使う
// （新たに createClient しない＝ supabase 変数名衝突バグを構造的に回避）。

// 編集対象のページキー（エディタのページ切替で変わる）
let PAGE_KEY = "home";
function setEditorPageKey(key) { PAGE_KEY = key; }

// 公開中の内容を取得（無ければ null）
async function loadPublishedPage() {
  const { data, error } = await sb
    .from("site_pages")
    .select("html, css, project_data, updated_at")
    .eq("page_key", PAGE_KEY)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 保存して公開する：site_pagesをupsert＋site_page_versionsに履歴追加
async function publishPage({ html, css, projectData }) {
  const { data: { session } } = await sb.auth.getSession();
  const uid = session?.user?.id || null;

  const { error: upsertError } = await sb.from("site_pages").upsert({
    page_key: PAGE_KEY,
    html,
    css,
    project_data: projectData,
    updated_by: uid,
  });
  if (upsertError) throw upsertError;

  const { error: versionError } = await sb.from("site_page_versions").insert({
    page_key: PAGE_KEY,
    html,
    css,
    project_data: projectData,
    created_by: uid,
  });
  if (versionError) throw versionError;
}

// 履歴一覧（最新20件）
async function listVersions() {
  const { data, error } = await sb
    .from("site_page_versions")
    .select("id, created_at")
    .eq("page_key", PAGE_KEY)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
}

// 特定バージョンの中身を取得
async function getVersion(versionId) {
  const { data, error } = await sb
    .from("site_page_versions")
    .select("html, css, project_data, created_at")
    .eq("id", versionId)
    .single();
  if (error) throw error;
  return data;
}

// 画像アップロード（Supabase Storage）→ 公開URLを返す
async function uploadSiteAsset(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `home/${Date.now()}-${safeName}`;
  const { error } = await sb.storage.from("site-assets").upload(path, file);
  if (error) throw error;
  const { data } = sb.storage.from("site-assets").getPublicUrl(path);
  return data.publicUrl;
}

// 初回（まだ一度も保存していない）の種データ：本物のindex.htmlを取得して
// <style>の中身と#page-rootの中身を抜き出す。CSSを二重管理しないための仕組み。
async function loadSeedFromLiveSite() {
  const res = await fetch("../index.html?seed=" + Date.now());
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "text/html");
  const styleEl = doc.querySelector("style");
  const rootEl = doc.getElementById("page-root");
  return {
    html: rootEl ? rootEl.innerHTML : "",
    css: styleEl ? styleEl.textContent : "",
  };
}
