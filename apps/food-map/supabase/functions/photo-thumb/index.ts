// 美食收藏：幫一張已經在 Storage 裡的封面做小圖（網頁版上傳完、補舊照片時呼叫）
// 送 {path: "使用者id/照片id.jpg", fixCache?: true}，回 {thumb: 小圖網址}
// 只會處理 food-photos 裡已經存在的照片，做過的直接回網址，所以不用登入也不怕被亂叫
// 部署：npx supabase functions deploy photo-thumb --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import { BUCKET, fixCache, makeThumb, PATH_RE, thumbPath } from "../_shared/thumb.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function admin() {
  let key = "";
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? ""; } catch { /* 沒有新版 key */ }
  key ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });
}

async function exists(sb: ReturnType<typeof admin>, path: string) {
  const [dir, file] = path.split("/");
  const { data } = await sb.storage.from(BUCKET).list(dir, { search: file, limit: 1 });
  return (data ?? []).some((o: { name: string }) => o.name === file);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const path = String(body.path ?? "").replace(/^.*\/food-photos\//, "");
    if (!PATH_RE.test(path)) return json({ error: "路徑不對" }, 400);
    const sb = admin();
    if (!(await exists(sb, path))) return json({ error: "找不到這張照片" }, 404);
    const bytes = body.fixCache ? await fixCache(sb, path) : undefined;
    if (!body.fixCache && await exists(sb, thumbPath(path))) {
      return json({ thumb: sb.storage.from(BUCKET).getPublicUrl(thumbPath(path)).data.publicUrl, created: false });
    }
    return json({ thumb: await makeThumb(sb, path, bytes), created: true });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e).slice(0, 200) }, 500);
  }
});
