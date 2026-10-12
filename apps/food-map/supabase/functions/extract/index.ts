// 美食收藏：從連結、貼文文字或截圖抓出店家
// 部署：npx supabase functions deploy extract（會一起帶上 _shared/extract.ts）
// 再到 Edge Functions → Secrets 加 GROQ_API_KEY（console.groq.com/keys 免費申請）

import { extract } from "../_shared/extract.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 只讓登入的使用者用，免得 Groq 額度被別人用掉
async function signedIn(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const auth = req.headers.get("Authorization") ?? "";
  if (!url) return true; // 本機測試
  if (!auth) return false;
  // 用 app 送來的 publishable key 問 Supabase 這個登入是不是真的（舊的 anon key 可能已停用）
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await signedIn(req))) return Response.json({ error: "請先登入" }, { status: 401, headers: cors });
    const out = await extract(await req.json());
    return Response.json(out, { headers: cors });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 400, headers: cors });
  }
});
