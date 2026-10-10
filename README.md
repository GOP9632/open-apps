# open-apps

把常用的付費軟體做成自己和朋友能用的開源版本。每個 App 一個資料夾，全部是網頁版，打開連結就能用。

| App | 對標 | 狀態 | 連結 |
|---|---|---|---|
| [課堂錄音](apps/class-recorder/) | Otter、Notta、Plaud | 第一版原型 | https://gop9632.github.io/open-apps/apps/class-recorder/ |

規劃文件放在 `docs/plans/`。

## 首頁

所有 App 的入口：https://anthony-apps.netlify.app （GitHub Pages 上的 https://gop9632.github.io/open-apps/ 也是同一頁）

新增 App 時，只要在 `apps.json` 加一筆：網頁版填 `"type": "web"` 和 `url`；要自己裝的填 `"type": "local"` 和 `steps`（安裝步驟）。改完執行 `./deploy-home.sh` 更新 Netlify。
