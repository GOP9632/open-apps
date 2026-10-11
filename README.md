# open-apps

把常用的付費軟體做成自己和朋友能用的開源版本。每個 App 一個資料夾。大部分是網頁版，打開連結就能用；需要動到電腦檔案的（例如 Mop）是 Mac App，要自己編譯。

| App | 對標 | 狀態 | 連結 |
|---|---|---|---|
| [課堂錄音](apps/class-recorder/) | Otter、Notta、Plaud | 第一版原型 | https://gop9632.github.io/open-apps/apps/class-recorder/ |
| [美食收藏](apps/food-map/) | Yaay | 第一版 | https://gop9632.github.io/open-apps/apps/food-map/ |
| [Mop](apps/mac-cleaner/) | CleanMyMac、DaisyDisk | 第一版 | Mac App，見資料夾說明 |
| [隨手修](apps/photo-editor/) | 美圖秀秀、醒圖 | 第一版 | https://gop9632.github.io/open-apps/apps/photo-editor/ |

規劃文件放在 `docs/plans/`。

## 首頁

所有 App 的入口：https://anthony-apps.netlify.app （GitHub Pages 上的 https://gop9632.github.io/open-apps/ 也是同一頁）

新增 App 時，只要在 `apps.json` 加一筆：網頁版填 `"type": "web"` 和 `url`；要自己裝的填 `"type": "local"` 和 `steps`（安裝步驟）。改完執行 `./deploy-home.sh` 更新 Netlify。
