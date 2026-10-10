# 課堂錄音（第一版原型）

規劃與功能說明：[docs/plans/class-recorder.md](../../docs/plans/class-recorder.md)

## 現在就想試

1. 打開 https://gop9632.github.io/open-apps/apps/class-recorder/ （手機可以「加入主畫面」）
2. 左下「⚙️ 設定」填 OpenAI API key（只存在這個瀏覽器）
3. 左邊「＋」建一個課程，按「開始新錄音」

也可以下載 `index.html`，用電腦的 Chrome 直接打開。

## 用 Mac 上的 whisper.cpp 免費轉寫（選用）

```
whisper-server -m ~/Library/Application\ Support/WhisprFlowDev/models/ggml-large-v3-turbo-q5_0.bin --host 127.0.0.1 --port 8080
```

設定裡轉寫引擎選「我 Mac 上的 whisper.cpp」。這條路還沒在真機上測過，連不上時告訴我。

## 檔案

- `index.html`：整個 app，沒有建置步驟
- `manifest.json`、`icon.svg`、`sw.js`：放上網站後可加到手機主畫面、離線打開
