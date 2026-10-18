// 美食收藏：從連結、貼文文字或截圖抓出店家（extract 和 quick-add 共用）
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const TEXT_MODEL = Deno.env.get("GROQ_TEXT_MODEL") ?? "openai/gpt-oss-120b";
const VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_BASE = Deno.env.get("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1";
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const PROMPT = `你是美食收藏助理。從使用者給的社群貼文、網頁文字或截圖，找出裡面介紹的「實體店家」（餐廳、咖啡廳、麵包店、甜點店、小吃、酒吧、飲料店等）。
只回 JSON：{"places":[{"name":"店名（不含分店）","branch":"分店名，沒有就空字串","address":"完整地址，沒寫就空字串","city":"縣市，用簡短寫法：台北、新北、桃園、台中、台南、高雄、新竹…；國外寫城市名；不知道就空字串","district":"行政區，例如大安區；不知道就空字串","category":"cafe|restaurant|bakery|dessert|snack|brunch|bar|drink|other 選一個","cuisine":"料理類型，例如日式拉麵、義式、韓式烤肉，可空白","price":每人預算 1(200元以下) 2(200-500) 3(500-1000) 4(1000以上)，看不出來填 null,"meals":["適合時段，從 breakfast lunch tea dinner night 選，可多選"],"hours":"營業時間原文，沒有就空字串","note":"一句話說這家賣什麼、哪裡好吃","dishes":["貼文推薦或說好吃的菜色／品項，照貼文的叫法，最多 6 個，沒提到就空陣列"],"tags":["最多 4 個短標籤，例如 不限時、有插座、寵物友善、要訂位"]}]}
規則：
- 一篇貼文介紹多間店就列多間；完全沒有店家就回 {"places":[]}。
- 店名從 📍、🏠、店名：、@帳號、地點標記等線索判斷，不要把 hashtag 或網紅名字當店名。
- 地址照原文，臺改成台。
- 只用文字裡有的資訊，不要自己編地址或菜色。`;

function decode(s: string) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function meta(html: string, key: string) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decode(m[1]) : "";
}

// 從 start 的 { 開始，取出完整的一段 JSON 物件
function jsonAt(s: string, start: number) {
  let depth = 0, inStr = false;
  for (let i = start; i < s.length && i < start + 20000; i++) {
    const c = s[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

async function get(url: string, ua = BOT_UA) {
  const r = await fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8" }, redirect: "follow" });
  return { status: r.status, url: r.url, html: r.ok ? await r.text() : "" };
}

// Instagram：og:description 是「xx likes, xx comments - 帳號 on 日期: "貼文"」，頁面 JSON 裡有地點標記
async function instagram(url: string) {
  const m = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
  if (!m) throw new Error("看不懂這個 Instagram 連結");
  const kind = m[1] === "reels" ? "reel" : m[1];
  const page = await get(`https://www.instagram.com/${kind}/${m[2]}/`);
  let caption = "", author = "";
  // 格式：「3,595 likes, 64 comments - 帳號 on（或「於」）日期 : "貼文"」，按讚數可能沒有
  const desc = meta(page.html, "og:description") || meta(page.html, "description");
  const q = desc.indexOf(': "');
  if (q > 0) {
    caption = desc.slice(q + 3).replace(/"\.?\s*$/, "");
    author = (desc.slice(0, q).match(/([\w.]+)\s+(?:on|於)\s/) || [])[1] ?? "";
  } else caption = desc;
  let location: Record<string, unknown> | null = null;
  const li = page.html.indexOf('"location":{"__typename"');
  if (li >= 0) location = jsonAt(page.html, li + 11);
  if (!caption) {
    const e = await get(`https://www.instagram.com/p/${m[2]}/embed/captioned/`);
    const cm = e.html.match(/class="Caption">([\s\S]*?)<div class="CaptionComments/);
    if (cm) caption = decode(cm[1].replace(/<br\s*\/?>/g, "\n").replace(/<a class="CaptionUsername"[^>]*>([^<]*)<\/a>/, "").replace(/<[^>]+>/g, "")).trim();
  }
  // og:image 是 IG 合成的預覽圖，Reels 會印一顆播放鍵上去；/media/ 會轉到同一張的原圖，沒有播放鍵
  return { caption, author, location, thumb: `https://www.instagram.com/p/${m[2]}/media/?size=l`, thumbAlt: meta(page.html, "og:image") };
}

async function tiktok(url: string) {
  const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  const j = r.ok ? await r.json() : {};
  return { caption: j.title ?? "", author: j.author_name ?? "", location: null, thumb: j.thumbnail_url ?? "" };
}

// Google 地圖連結：短網址轉成完整網址後，從網址拿店名和座標
async function googleMaps(url: string) {
  const page = await get(url, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36");
  const final = page.url || url;
  let name = decodeURIComponent((final.match(/\/place\/([^/@?]+)/) || [])[1] ?? "").replace(/\+/g, " ");
  const c = final.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || final.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || final.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  // 一般瀏覽器拿到的 og:image 是靜態地圖；用連結預覽的 UA 才會拿到店家照片和「店名 · 地址」
  const card = await get(final, "facebookexternalhit/1.1");
  const pic = meta(card.html, "og:image");
  const thumb = /googleusercontent\.com/.test(pic) ? pic.replace(/=w\d+-h\d+/, "=w1080-h1080") : "";
  const title = meta(card.html, "og:title") || meta(page.html, "og:title"), d = meta(page.html, "og:description");
  // iPhone 分享的連結常常是 ?q=…&ftid=…，網址裡沒有 /place/店名，改用預覽標題「店名 · 地址」
  if (!name && title && title !== "Google Maps") name = title.split(" · ")[0];
  return { name, lat: c ? +c[1] : null, lng: c ? +c[2] : null, caption: [name, title, d].filter(Boolean).join("\n"), final, thumb };
}

async function webpage(url: string) {
  const page = await get(url);
  const text = page.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const caption = [meta(page.html, "og:title"), meta(page.html, "og:description"), decode(text).slice(0, 6000)].filter(Boolean).join("\n");
  return { caption, author: meta(page.html, "og:site_name"), location: null, thumb: meta(page.html, "og:image") };
}

// 貼文封面：IG 的圖片網址過幾天就失效，所以抓下來交給 app 存到自己的 Storage
async function inlineImage(url: string) {
  if (!url) return "";
  try {
    const r = await fetch(url, { headers: { "User-Agent": BOT_UA } });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return "";
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.length > 3_000_000) return "";
    let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return `data:${type.split(";")[0]};base64,${btoa(bin)}`;
  } catch { return ""; }
}

async function groq(messages: unknown[], model: string) {
  if (!GROQ_KEY) throw new Error("伺服器還沒設定 GROQ_API_KEY");
  const r = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2, response_format: { type: "json_object" } }),
  });
  if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: r.status });
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content).places ?? [];
}

// Groq 的看圖模型常常下架換新，預設的不在了就從模型清單裡找一個看得懂圖的
let visionModel = VISION_MODEL;
async function groqVision(messages: unknown[]) {
  try { return await groq(messages, visionModel); } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
  const r = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${GROQ_KEY}` } });
  const ids: string[] = r.ok ? (await r.json()).data.map((m: { id: string }) => m.id) : [];
  const picks = ids.filter((id) => /vision|-vl|vl-|scout|maverick|llama-4|gemma-3|pixtral|kimi-k2\.5|qwen3\.[5-9]/i.test(id) && id !== visionModel);
  const errs: string[] = [];
  for (const id of picks) {
    try { const out = await groq(messages, id); visionModel = id; return out; } catch (e) { errs.push(`${id}: ${(e as Error).message.slice(0, 120)}`); }
  }
  throw new Error(`Groq 目前找不到能看圖的模型（可用：${ids.join(", ") || "讀不到清單"}；${errs.join(" / ")}）。請改貼貼文文字。`);
}

export async function extract(body: { url?: string; text?: string; image?: string }) {
  const src: Record<string, unknown> = { url: body.url ?? "" };
  let text = body.text ?? "";
  let places: Record<string, unknown>[] = [];
  if (body.url) {
    const u = body.url.trim();
    if (/instagram\.com/.test(u)) Object.assign(src, await instagram(u));
    else if (/tiktok\.com/.test(u)) Object.assign(src, await tiktok(u));
    else if (/maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\./.test(u)) {
      const g = await googleMaps(u);
      Object.assign(src, { caption: g.caption, url: g.final, thumb: g.thumb });
      if (g.name) places = [{ name: g.name, lat: g.lat, lng: g.lng }];
    } else Object.assign(src, await webpage(u));
    const loc = src.location as Record<string, unknown> | null;
    text = [src.author ? `發文者：@${src.author}` : "", loc?.name ? `地點標記：${loc.name}${loc.address ? `（${loc.address}）` : ""}` : "", String(src.caption ?? ""), text].filter(Boolean).join("\n");
  }
  if (body.image) {
    places = await groqVision([{ role: "user", content: [{ type: "text", text: PROMPT + (text ? `\n\n補充文字：\n${text}` : "") }, { type: "image_url", image_url: { url: body.image } }] }]);
  } else if (text.trim()) {
    const ai = await groq([{ role: "system", content: PROMPT }, { role: "user", content: text.slice(0, 12000) }], TEXT_MODEL);
    // Google 地圖連結已經有準確的座標，AI 只用來補分類等資訊
    places = places.length ? places.map((p, i) => ({ ...(ai[i] ?? {}), ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== "")) })) : ai;
  }
  // IG 的地點標記帶座標，套到唯一（或同名）的店
  const loc = src.location as Record<string, unknown> | null;
  if (loc?.name && !places.length) places = [{ name: loc.name, category: "restaurant" }];
  if (loc?.lat && loc?.lng) {
    const hit = places.length === 1 ? places[0] : places.find((p) => String(loc.name ?? "").includes(String(p.name)));
    if (hit && hit.lat == null) Object.assign(hit, { lat: loc.lat, lng: loc.lng, address: hit.address || loc.address || "" });
  }
  let thumb = String(src.thumb ?? "");
  let thumbData = await inlineImage(thumb);
  if (!thumbData && src.thumbAlt) thumbData = await inlineImage(thumb = String(src.thumbAlt));
  return { source: { url: src.url, author: src.author ?? "", caption: String(src.caption ?? "").slice(0, 3000), thumb, thumbData }, places };
}
