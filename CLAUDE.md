# open-apps 規範

## 網頁 app

- 輸入框（input、select、textarea）字體一律 16px 以上，包含加了 class 或 inline style 的。iPhone／iPad 的 Safari 遇到小於 16px 的輸入框，點下去會自動放大，而且不會縮回來。寫法參考 `apps/food-map/index.html` 開頭的 CSS：
  ```css
  button,select,input,textarea{font:inherit;color:inherit}
  select,input,textarea{font-size:16px}
  ```
  不要用 `maximum-scale=1` 或 `user-scalable=no` 擋縮放，那會讓使用者沒辦法自己放大。
- 每個網頁 app 的頁首都要有「回入口」按鈕：`<head>` 引入 `apps/portal-home.js`，頁首放 `<a class="portal-home" href="https://anthony-apps.netlify.app/">`，做法見 README。
- 交付前用 Playwright 的 iPhone 裝置模擬檢查每個輸入框的 computed font-size 都 ≥ 16px。

## 入口網站

- 入口網站 https://anthony-apps.netlify.app 的清單來自 `apps.json`。做了新 app，同一個 PR 就要把它加進 `apps.json`，不用等人提醒。
- 入口網站直接讀 GitHub Pages 上的 `apps.json`，PR 合併後幾分鐘內就會出現（GitHub Pages 有 10 分鐘快取）。合併後要打開入口網站確認看得到新 app。
- 只有改 `index.html`（入口網站本身的版面）才需要重新部署 Netlify：在 Anthony 的 Mac 上跑 `./deploy-home.sh`。
