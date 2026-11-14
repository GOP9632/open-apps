# Gray Room 3D 明信片

商用英文課的個人作業：替中壢的 Gray Room 灰房間（畫畫咖啡廳）做的 marketing postcard。實體明信片背面有 QR code，掃了會打開這一頁。

網址：https://gop9632.github.io/open-apps/grayroom/

- `index.html`：頁面本身。卡片是九層紙片疊成的立體房間：拖動可以 360 度旋轉（背面是店家資訊），點一下會潑上顏色，也可以把圖層拉開、一層一層看。
- `scene.js`：每一層的插圖（SVG），網頁和實體明信片共用。
- `qr.js`：QR code 的圖形資料，只有輸出實體明信片時會載入。
- `fonts/`：Fraunces、Inter（SIL Open Font License）。

實體明信片是同一頁的靜態畫面：`?print=front` 和 `?print=back`。

這是學生作業，不是 Gray Room 的官方廣告。它不是 app，所以沒有放進 `apps.json`，也沒有「回入口」按鈕。
