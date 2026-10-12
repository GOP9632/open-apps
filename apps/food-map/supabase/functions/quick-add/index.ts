// 美食收藏：iPhone 分享捷徑在背景直接收藏，不用打開 app
// 捷徑送 {key: 收藏碼, input: 分享進來的連結或文字}，回一行文字給捷徑當通知
// 部署：npx supabase functions deploy quick-add --no-verify-jwt（收藏碼就是驗證）

import { createClient } from "npm:@supabase/supabase-js@2";
import { extract } from "../_shared/extract.ts";

const CATS = ["cafe", "restaurant", "bakery", "dessert", "snack", "brunch", "bar", "drink", "other"];
const MEALS = ["breakfast", "lunch", "tea", "dinner", "night"];
const CITY_RE = /(台北|臺北|新北|基隆|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)[市縣]?/;

type Place = Record<string, any>;

function admin() {
  let key = "";
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? ""; } catch { /* 沒有新版 key */ }
  key ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { db: { schema: "food" }, auth: { persistSession: false } });
}

// ---------- 和 app.js 一樣的整理規則 ----------
const normCity = (c: unknown) => String(c || "").replace(/^臺/, "台").replace(/[市縣]$/, "").replace("連江", "馬祖").trim();
function parseAddr(addr: string) {
  const a = (addr || "").replace(/臺/g, "台");
  const m = a.match(CITY_RE);
  const city = m ? normCity(m[1]) : "";
  const d = m ? a.slice(m.index! + m[0].length).match(/^([^\d\s路街段巷號]{1,3}?[區鄉鎮市])/) : null;
  return { city, district: d ? d[1] : "" };
}
const cleanDishes = (a: unknown) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x || "").trim()).filter((x) => x && x.length <= 30))].slice(0, 8);
const nk = (s: unknown) => String(s || "").toLowerCase().normalize("NFKC").replace(/[\s\-_.,，。、・·'’"「」『』()（）【】\[\]|｜/&＆!！?？~～:：#＃@]+/g, "").replace(/(本店|總店|旗艦店)$/, "");

// 封面存到自己的 Storage（IG 圖片網址過幾天就失效）
async function storePhoto(sb: ReturnType<typeof admin>, uid: string, data: string) {
  const m = data.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return "";
  const bin = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
  const path = `${uid}/${crypto.randomUUID()}.${m[2] === "jpeg" ? "jpg" : m[2]}`;
  const { error } = await sb.storage.from("food-photos").upload(path, bin, { contentType: m[1], cacheControl: "31536000" });
  return error ? "" : sb.storage.from("food-photos").getPublicUrl(path).data.publicUrl;
}

export async function quickAdd(key: string, input: string) {
  const sb = admin();
  if (!/^[0-9a-f]{64}$/.test(key)) return "收藏碼不對，請到美食收藏「我的」重新加入分享捷徑";
  const { data: k } = await sb.from("quick_keys").select("user_id").eq("key", key).maybeSingle();
  if (!k) return "收藏碼已失效，請到美食收藏「我的」重新加入分享捷徑";
  const uid = k.user_id as string;

  const text = String(input || "").trim();
  if (!text) return "沒有收到連結，請從 IG 貼文按分享再選這個捷徑";
  const url = (text.match(/https?:\/\/\S+/) || [])[0];
  const rest = url ? text.replace(url, "").trim() : text;
  const minePromise = sb.from("places").select("name,branch,city").eq("owner", uid).then((x) => x); // 和抓店家同時跑
  const r = await extract({ url, text: rest.length > 15 ? rest : "" });
  const src = r.source ?? {};
  const found = (r.places as Place[]).map((p) => ({
    ...p, name: String(p.name || "").trim(),
    city: normCity(p.city) || parseAddr(p.address || "").city, district: p.district || parseAddr(p.address || "").district,
  })).filter((p) => p.name);
  if (!found.length) return "這篇貼文沒找到店家，可以打開美食收藏貼上店名";

  const { data: mine } = await minePromise;
  const have = new Set((mine ?? []).map((p) => nk(p.name + (p.branch || "")) + "|" + normCity(p.city)));
  const saved: string[] = [], dup: string[] = [];
  const ids: string[] = [];
  for (const c of found) {
    if (have.has(nk(c.name + (c.branch || "")) + "|" + normCity(c.city))) { dup.push(c.name); continue; }
    const row = {
      owner: uid, name: c.name, branch: c.branch || "", address: c.address || "", city: c.city || "", district: c.district || "",
      lat: c.lat ?? null, lng: c.lng ?? null, approx: !!c.approx, category: CATS.includes(c.category) ? c.category : "restaurant",
      cuisine: c.cuisine || "", price: [1, 2, 3, 4].includes(+c.price) ? +c.price : null, meals: (c.meals || []).filter((m: string) => MEALS.includes(m)),
      hours: c.hours || "", status: "want", note: c.note || "", tags: (c.tags || []).slice(0, 6), dishes: cleanDishes(c.dishes),
      source_url: src.url || url || "", source_text: String(src.caption || rest || "").slice(0, 2000),
    };
    const { data: ins, error } = await sb.from("places").insert(row).select("id").single();
    if (error) throw error;
    ids.push(ins.id);
    saved.push(c.name);
    have.add(nk(c.name + (c.branch || "")) + "|" + normCity(c.city));
  }
  // 先回通知，封面在背景存（座標由 app 打開時補，伺服器打 Nominatim 常被擋）
  if (ids.length && src.thumbData) {
    const later = storePhoto(sb, uid, src.thumbData).then((url) => url && sb.from("places").update({ photo: url }).in("id", ids)).catch(console.error);
    (globalThis as any).EdgeRuntime?.waitUntil(later);
  }
  return [saved.length ? `已收藏：${saved.join("、")}` : "", dup.length ? `之前收藏過：${dup.join("、")}` : ""].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("美食收藏分享捷徑", { status: 405 });
  const text = (s: string) => new Response(s, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  try {
    const body = await req.json().catch(() => ({}));
    return text(await quickAdd(String(body.key ?? "").trim().toLowerCase(), String(body.input ?? "")));
  } catch (e) {
    console.error(e);
    return text(`收藏失敗：${String((e as Error).message ?? e).slice(0, 120)}`);
  }
});
