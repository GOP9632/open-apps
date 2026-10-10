# 課堂錄音（第一版原型）

使用說明（有截圖）：https://gop9632.github.io/open-apps/apps/class-recorder/guide/

規劃與功能說明：[docs/plans/class-recorder.md](../../docs/plans/class-recorder.md)

## 現在就想試

1. 打開 https://gop9632.github.io/open-apps/apps/class-recorder/ （手機可以「加入主畫面」）
2. 左下「⚙️ 設定」填 Gemini API key（到 https://aistudio.google.com/apikey 免費申請，只存在這個瀏覽器）
3. 左邊「＋」建一個課程，按「開始錄音」
4. 想讓 AI 問答免費：設定裡填 Groq API key（https://console.groq.com/keys），「AI 問答用」選 Groq

## 看起來像 Otter 的地方

- 首頁依日期分組，每段錄音一張卡片，附 AI 概述預覽；上方搜尋可以找標題、逐字稿、筆記
- 錄音頁：摘要／逐字稿分頁，右邊 AI 問答，底下固定播放列（倒退、快轉 5 秒、變速）
- AI 筆記：概述、待辦（可打勾、可自己加）、大綱（點時間跳去聽）、名詞解釋、複習問題
- 關鍵字：點一下會在逐字稿標出所有出現的地方
- 畫重點：選取逐字稿文字，按「🖍 畫重點」；可以只看重點
- 說話者頭像和講話比例，點名字可以改名
- 快捷鍵：空白鍵播放／暫停，← → 倒退／快轉 5 秒；錄音時空白鍵＝標記重點

也可以下載 `index.html`，用電腦的 Chrome 直接打開。

## 用 Mac 上的 whisper.cpp 免費轉寫（選用）

```
whisper-server -m ~/Library/Application\ Support/WhisprFlowDev/models/ggml-large-v3-turbo-q5_0.bin --host 127.0.0.1 --port 8080
```

設定裡轉寫引擎選「我 Mac 上的 whisper.cpp」。這條路還沒在真機上測過，連不上時告訴我。

## 檔案

- `index.html`：整個 app，沒有建置步驟
- `manifest.json`、`icon.svg`、`sw.js`：放上網站後可加到手機主畫面、離線打開
