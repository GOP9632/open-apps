// 美食收藏：給 IG Reels 連結，回傳可以直接播放的 mp4 網址（App 店家頁自動播放用）
// IG 的影片網址幾天就失效，所以不存，每次播放前來拿一次新的
// 部署：npx supabase functions deploy reel-video

const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 只讓登入的使用者用（跟 extract 一樣）
async function signedIn(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const auth = req.headers.get("Authorization") ?? "";
  if (!url) return true;
  if (!auth) return false;
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  return r.ok;
}

// embed 頁裡的 JSON 被跳脫了好幾層：\\\/ 是 /、\\u0026 是 &
function unescape(s: string) {
  return s.replace(/\\+\//g, "/").replace(/\\+u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export async function reelVideo(link: string) {
  const m = link.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/);
  if (!m) return { video: null };
  const get = async (u: string) => { const r = await fetch(u, { headers: { "User-Agent": BOT_UA } }); return r.ok ? await r.text() : ""; };
  // embed 頁比較小，先試；有版權音樂的 Reels embed 不給影片（copyright_blocked），改看 Reels 本頁的 video_versions
  const v = (await get(`https://www.instagram.com/reel/${m[1]}/embed/captioned/`)).match(/video_url\\*":\\*"(.*?)\\*"/) ??
    (await get(`https://www.instagram.com/reel/${m[1]}/`)).match(/"video_versions":\[\{[^}]*?"url":"(.*?)"/);
  return { video: v ? unescape(v[1]) : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await signedIn(req))) return Response.json({ error: "請先登入" }, { status: 401, headers: cors });
    const { url } = await req.json();
    return Response.json(await reelVideo(String(url ?? "")), { headers: cors });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 400, headers: cors });
  }
});
