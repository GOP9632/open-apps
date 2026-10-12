// 課堂錄音：雲端 AI（轉寫、AI 筆記、問答），讓朋友不用自己申請 API key
// 部署：Supabase 後台 → Edge Functions → Deploy a new function → 名稱填 recorder-ai → 整份貼上 → Deploy
// Secrets（Edge Functions → Secrets）：
//   GROQ_API_KEY    必填（美食收藏已經設過就不用再設）。沒有 Gemini 時用它轉寫（不分講者）和問答
//   GEMINI_API_KEY  建議填，要用「沒綁帳單」的 Google 專案產生的免費 key。有它才分得出老師和學生；當天免費次數用完會自動改用 Groq
//   選填：GEMINI_MODEL、GROQ_CHAT_MODEL、DAILY_AUDIO_MIN（每人每天可轉寫幾分鐘，預設 120）、
//        DAILY_AI_CALLS（每人每天 AI 筆記加問答幾次，預設 60）、GLOBAL_AUDIO_MIN（全部人加起來每天幾分鐘，預設 480）

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
const GEMINI_BASE = Deno.env.get("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = Deno.env.get("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1";
const GROQ_CHAT_MODEL = Deno.env.get("GROQ_CHAT_MODEL") ?? "openai/gpt-oss-120b";
const GROQ_WHISPER_MODEL = Deno.env.get("GROQ_WHISPER_MODEL") ?? "whisper-large-v3-turbo";
const num = (k: string, d: number) => Number(Deno.env.get(k) ?? "") || d;
const LIMITS = { audioMin: num("DAILY_AUDIO_MIN", 120), calls: num("DAILY_AI_CALLS", 60), globalAudioMin: num("GLOBAL_AUDIO_MIN", 480) };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
class HttpError extends Error { constructor(public status: number, msg: string, public daily = false) { super(msg); } }

// 用登入者自己的身分呼叫資料庫（確認登入、查額度、記用量），不需要 service key
async function rpc(req: Request, fn: string, args: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { Authorization: req.headers.get("Authorization") ?? "", apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "", "Content-Type": "application/json", "Content-Profile": "recorder" },
    body: JSON.stringify(args),
  });
  if (r.status === 401 || r.status === 403) throw new HttpError(401, "請先登入");
  if (!r.ok) throw new HttpError(500, `資料庫錯誤 ${r.status}：${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const quota = (req: Request, audioSec: number, calls: number) =>
  rpc(req, "quota", { p_audio_sec: Math.ceil(audioSec), p_calls: calls, p_max_audio_sec: LIMITS.audioMin * 60, p_max_calls: LIMITS.calls, p_global_audio_sec: LIMITS.globalAudioMin * 60 });
async function needQuota(req: Request, audioSec: number, calls: number) {
  const q = await quota(req, audioSec, calls);
  if (q?.reason === "login") throw new HttpError(401, "請先登入");
  if (!q?.ok) {
    const msg = { audio: `今天的免費轉寫額度（${LIMITS.audioMin} 分鐘）用完了，明天再試，或到設定改用自己的 API key。`, calls: `今天的 AI 筆記和問答額度（${LIMITS.calls} 次）用完了，明天再試，或到設定改用自己的 API key。`, global: "今天大家的免費額度都用完了，明天再試，或到設定改用自己的 API key。" }[q?.reason as string] ?? "額度用完了";
    throw new HttpError(402, msg);
  }
}

const backends = () => ({
  transcribe: GEMINI_KEY ? "gemini" : GROQ_KEY ? "groq" : "",
  notes: GEMINI_KEY ? "gemini" : GROQ_KEY ? "groq" : "",
  chat: GROQ_KEY ? "groq" : GEMINI_KEY ? "gemini" : "",
});

async function upstreamError(r: Response, who: string) {
  const full = await r.text(), t = full.slice(0, 300);
  // 429 分兩種：每分鐘次數（等一下就好）和每天次數（今天用完了）；看不出是哪種就當作今天用完
  if (r.status === 429) return new HttpError(429, `${who} 免費額度暫時用完，稍等一下再試。`, !/PerMinute/i.test(full));
  return new HttpError(502, `${who} 錯誤 ${r.status}：${t}`);
}

async function gemini(parts: unknown[], schema?: unknown, fast = false) {
  const body: Record<string, unknown> = { contents: [{ parts }] };
  const cfg: Record<string, unknown> = {};
  if (schema) Object.assign(cfg, { responseMimeType: "application/json", responseSchema: schema });
  // 逐字轉寫不需要深度思考，調低回得快很多；舊型號不認得這個設定就拿掉再送一次
  if (fast) cfg.thinkingConfig = { thinkingLevel: "low" };
  if (Object.keys(cfg).length) body.generationConfig = cfg;
  const send = () => fetch(`${GEMINI_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY }, body: JSON.stringify(body),
  });
  let r = await send();
  if (r.status === 400 && fast && /thinking/i.test(await r.clone().text())) { delete cfg.thinkingConfig; r = await send(); }
  if (!r.ok) throw await upstreamError(r, "Gemini");
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
}

async function groqChat(prompt: string) {
  const r = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GROQ_CHAT_MODEL, messages: [{ role: "user", content: prompt }], reasoning_effort: "low", max_completion_tokens: 4000 }),
  });
  if (!r.ok) throw await upstreamError(r, "Groq");
  return (await r.json()).choices?.[0]?.message?.content ?? "";
}

// 免費方案每次只有 2 秒 CPU，用簡單迴圈解碼比較快
function b64ToBytes(b64: string) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
// 16 kHz 單聲道 16-bit WAV：每秒 32000 bytes
const wavSeconds = (b64: string) => Math.max(1, (b64.length * 3 / 4 - 44) / 32000);

type Seg = { start: number; end: number; text: string; label?: string | null };
type TBody = { audio: string; glossary?: string[]; teacherSample?: string; language?: string };
// 免費 Gemini 每天次數有限，當天用完就改用 Groq 繼續轉，只是不分講者。
// 只是每分鐘次數滿了就回 429，讓網頁等一下再送，保留分講者
async function transcribe(body: TBody) {
  if (GEMINI_KEY) {
    try { return await transcribeGemini(body); } catch (e) { if (!(GROQ_KEY && e instanceof HttpError && e.status === 429 && e.daily)) throw e; }
  }
  return await transcribeGroq(body);
}

async function transcribeGemini(body: TBody): Promise<{ segments: Seg[]; engine: string }> {
  const words = (body.glossary ?? []).map(String).filter(Boolean).slice(0, 60);
  {
    let instr = "請把上課錄音逐字轉寫成台灣繁體中文，英文詞保留英文原文、不要翻譯，不要摘要或省略。用台灣慣用詞（例如迴歸、變異數、程式、影片）。依說話者與句子切段，每段給 start、end（相對於這段錄音開頭的秒數）、speaker、text。";
    instr += body.teacherSample ? "第一段音檔是老師的聲音樣本，只用來辨認誰是老師，不要轉寫。上課錄音裡老師的 speaker 一律寫「老師」，其他人寫「學生A」「學生B」依此類推。" : "speaker 用「A」「B」「C」區分不同的人。";
    if (words.length) instr += "可能出現的專有名詞：" + words.join("、") + "。";
    const parts: unknown[] = [{ text: instr }];
    if (body.teacherSample) parts.push({ inline_data: { mime_type: "audio/wav", data: body.teacherSample } }, { text: "以下是要轉寫的上課錄音：" });
    parts.push({ inline_data: { mime_type: "audio/wav", data: body.audio } });
    const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { start: { type: "NUMBER" }, end: { type: "NUMBER" }, speaker: { type: "STRING" }, text: { type: "STRING" } }, required: ["start", "end", "speaker", "text"] } };
    const txt = await gemini(parts, schema, true);
    let arr: { start: number; end: number; speaker?: string; text: string }[];
    try { arr = JSON.parse(txt); } catch { throw new HttpError(502, "Gemini 回傳的格式看不懂：" + txt.slice(0, 200)); }
    return { engine: "gemini", segments: arr.map((x) => ({ start: +x.start || 0, end: +x.end || +x.start || 0, text: x.text, label: x.speaker || null })) };
  }
}

async function transcribeGroq(body: TBody): Promise<{ segments: Seg[]; engine: string }> {
  const words = (body.glossary ?? []).map(String).filter(Boolean).slice(0, 60);
  const f = new FormData();
  f.append("file", new Blob([b64ToBytes(body.audio)], { type: "audio/wav" }), "chunk.wav");
  f.append("model", GROQ_WHISPER_MODEL);
  f.append("response_format", "verbose_json");
  if (body.language) f.append("language", body.language);
  if (words.length) f.append("prompt", "以下是一堂台灣大學課程的逐字稿，中英夾雜。" + words.slice(0, 40).join("、"));
  const r = await fetch(`${GROQ_BASE}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: f });
  if (!r.ok) throw await upstreamError(r, "Groq");
  const j = await r.json();
  const segs: Seg[] = j.segments ? j.segments.map((s: Seg) => ({ start: s.start, end: s.end, text: s.text })) : [{ start: 0, end: 0, text: j.text }];
  return { engine: "groq", segments: segs };
}

async function llm(body: { kind?: string; prompt: string; schema?: unknown; groqPrompt?: string }) {
  const b = backends()[body.kind === "notes" ? "notes" : "chat"];
  if (b === "gemini") {
    try { return { text: await gemini([{ text: body.prompt }], body.schema), backend: b }; } catch (e) { if (!(GROQ_KEY && e instanceof HttpError && e.status === 429)) throw e; }
  }
  return { text: await groqChat(String(b === "gemini" && body.groqPrompt || body.prompt).slice(0, 60000)), backend: "groq" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    if (!GEMINI_KEY && !GROQ_KEY) throw new HttpError(503, "雲端 AI 還沒設定好（缺 GEMINI_API_KEY 或 GROQ_API_KEY）。");
    if (body.task === "status") {
      const q = await quota(req, 0, 0);
      if (q?.reason === "login") throw new HttpError(401, "請先登入");
      return Response.json({ ...backends(), speakers: !!GEMINI_KEY, limits: LIMITS, used: { audioMin: Math.round(q.audio_sec / 60), calls: q.ai_calls } }, { headers: cors });
    }
    if (body.task === "transcribe") {
      if (typeof body.audio !== "string" || !body.audio) throw new HttpError(400, "沒有收到音檔");
      const sec = wavSeconds(body.audio);
      await needQuota(req, sec, 0);
      const out = await transcribe(body);
      await rpc(req, "add_usage", { p_audio_sec: Math.ceil(sec), p_calls: 0 });
      return Response.json(out, { headers: cors });
    }
    if (body.task === "llm") {
      if (typeof body.prompt !== "string" || !body.prompt) throw new HttpError(400, "沒有問題");
      await needQuota(req, 0, 1);
      const out = await llm(body);
      await rpc(req, "add_usage", { p_audio_sec: 0, p_calls: 1 });
      return Response.json(out, { headers: cors });
    }
    throw new HttpError(400, "不認得的工作");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json({ error: String((e as Error).message ?? e) }, { status, headers: cors });
  }
});
