# open-apps 規範

## 網頁 app

- 輸入框（input、select、textarea）字體一律 16px 以上，包含加了 class 或 inline style 的。iPhone／iPad 的 Safari 遇到小於 16px 的輸入框，點下去會自動放大，而且不會縮回來。寫法參考 `apps/food-map/index.html` 開頭的 CSS：
  ```css
  button,select,input,textarea{font:inherit;color:inherit}
  select,input,textarea{font-size:16px}
  ```
  不要用 `maximum-scale=1` 或 `user-scalable=no` 擋縮放，那會讓使用者沒辦法自己放大。
- 交付前用 Playwright 的 iPhone 裝置模擬檢查每個輸入框的 computed font-size 都 ≥ 16px。
