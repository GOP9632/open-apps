# Gray Room 3D 明信片

商用英文課的個人作業：替中壢的 Gray Room 灰房間（畫畫咖啡廳）做的 marketing postcard。實體明信片背面有 QR code，掃了會打開這一頁。

網址：https://gop9632.github.io/open-apps/grayroom/

- `index.html`：頁面本身。最上面是一張薄薄的立體明信片，兩旁是超大的標題：窗框裡是十層紙片疊成的房間，拖動可以 360 度旋轉（背面是店家資訊），也可以把圖層拉開、一層一層看。一開始整個畫面是灰的，點一下，顏色會從畫布一路淹到整個網頁。往下捲，鏡頭會穿過窗框走進房間，用四個滿版場景加整面色塊講故事（你來畫、不限時、咖啡在旁邊、作品帶回家），最後退出來、把卡片翻到背面；再往下是店家介紹、菜單和交通資訊。
- `scene.js`：每一層的插圖（SVG），網頁和實體明信片共用。
- `qr.js`：QR code 的圖形資料，只有輸出實體明信片時會載入。
- `photos/`：Anthony 在店門口自己拍的三張照片（店面、門口的紅色招牌、櫥窗裡的畫），已轉成 sRGB 並拿掉拍攝資訊。`stamp.jpg` 是背面郵票用的店面裁切，其餘三張用在網頁的店家介紹區，進入畫面時會從灰階變成彩色。
- `tools/`：把卡片上的英文字轉成輪廓的小工具（見下面「卡片上的字」）。
- `fonts/`：Fraunces、Inter（SIL Open Font License）。

實體明信片是同一頁的靜態畫面：`?print=front` 和 `?print=back`。正面加 `&state=color` 是全彩版（不加是灰色房間、只有拱窗有顏色）。交出去的印刷檔是全彩、A6（105×148mm）：卡片本身是 100×148，A6 是左右各多留 2.5mm 的紙，所以印刷畫面的紙張底色會畫到卡片邊界外面，截圖時以卡片為中心往外取 105×148（出血版再各加 3mm）。測試時可以加 `?intro=0` 跳過開場。

## 卡片上的字

卡片上的英文字（標題、招牌、印章、郵戳）在網頁上是用輪廓（SVG path）畫的，不是 SVG 文字。原因是 Chrome 在卡片轉動或縮放時，只要滑鼠在頁面上或正在捲動，就會每一格重排卡片底下所有的 SVG 文字，連帶重畫整組圖層，畫面會卡。輪廓放在 `scene.js` 的 `TX` 區塊和 `index.html` 的郵戳裡；中文那一行是一般的 HTML 文字。輸出實體明信片時（`?print=`）用的還是真正的文字。

要改字的話，改 `scene.js` 裡對應的 `<text>`（郵戳在 `tools/postmark-text.html`），然後重新產生輪廓：

```
cd grayroom && python3 -m http.server 8000 &
node tools/collect.js      # 需要 Playwright
python3 tools/gen.py       # 需要 fonttools、uharfbuzz、brotli
```

`?txt=1` 可以讓頁面改用真正的文字，方便比對。

菜單價格取自 2025 年的網路評論，正式使用前要再跟店家確認。

這是學生作業，不是 Gray Room 的官方廣告。它不是 app，所以沒有放進 `apps.json`，也沒有「回入口」按鈕。
