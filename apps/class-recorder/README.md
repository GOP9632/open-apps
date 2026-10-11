# 課堂錄音（第一版原型）

使用說明（有截圖）：https://gop9632.github.io/open-apps/apps/class-recorder/guide/

規劃與功能說明：[docs/plans/class-recorder.md](../../docs/plans/class-recorder.md)

## 現在就想試

1. 打開 https://gop9632.github.io/open-apps/apps/class-recorder/ （手機可以「加入主畫面」）
2. 左下「🔑 登入」建帳號（和美食收藏同一組），不用申請任何 API key
3. 左邊「＋」建一個課程，按「開始錄音」
4. 想用自己的 key：設定 →「AI 怎麼用」選「用我自己的 API key」

## 看起來像 Otter 的地方

- 首頁依日期分組，每段錄音一張卡片，附 AI 概述預覽；上方搜尋可以找標題、逐字稿、筆記
- 錄音頁：摘要／逐字稿分頁，右邊 AI 問答，底下固定播放列（倒退、快轉 5 秒、變速）
- AI 筆記：概述、待辦（可打勾、可自己加）、大綱（點時間跳去聽）、名詞解釋、複習問題
- 關鍵字：點一下會在逐字稿標出所有出現的地方
- 畫重點：選取逐字稿文字，按「🖍 畫重點」；可以只看重點
- 說話者頭像和講話比例，點名字可以改名
- 快捷鍵：空白鍵播放／暫停，← → 倒退／快轉 5 秒；錄音時空白鍵＝標記重點

也可以下載 `index.html`，用電腦的 Chrome 直接打開。

## 免費雲端（登入、同步、免 key）怎麼架

和美食收藏共用同一個 Supabase 專案，資料放在獨立的 `recorder` schema。只要做一次：

1. Supabase → SQL Editor → 貼上 `supabase/schema.sql` 整份 → Run
2. Project Settings → Data API → Exposed schemas 加上 `recorder` → Save
3. Edge Functions → Deploy a new function → 名稱 `recorder-ai` → 貼上 `supabase/functions/recorder-ai/index.ts` → Deploy，然後把 **Verify JWT** 關掉（函式自己會檢查登入）
4. Edge Functions → Secrets：
   - `GROQ_API_KEY`：美食收藏已經設過，不用再設。只有它的話，轉寫用 Groq Whisper，**分不出老師和學生**
   - `GEMINI_API_KEY`（建議）：用「沒綁帳單」的 Google 帳號到 https://aistudio.google.com/apikey 產生，有它才分得出講者。不要用綁了預付帳單的那把
   - 選填：`DAILY_AUDIO_MIN`（每人每天轉寫分鐘，預設 120）、`DAILY_AI_CALLS`（每人每天筆記加問答次數，預設 60）、`GLOBAL_AUDIO_MIN`（全部人每天總分鐘，預設 480）

`config.js` 只放網址和 publishable key（本來就是公開的），不要放 secret key。

## 用 Mac 上的 whisper.cpp 免費轉寫（選用）

```
whisper-server -m ~/Library/Application\ Support/WhisprFlowDev/models/ggml-large-v3-turbo-q5_0.bin --host 127.0.0.1 --port 8080
```

設定裡轉寫引擎選「我 Mac 上的 whisper.cpp」。這條路還沒在真機上測過，連不上時告訴我。

## 檔案

- `index.html`：整個 app，沒有建置步驟
- `config.js`：Supabase 網址和 publishable key
- `supabase/`：資料表（`schema.sql`）和雲端 AI 函式（`functions/recorder-ai`）
- `manifest.json`、`icon.svg`、`sw.js`：放上網站後可加到手機主畫面、離線打開
