# 美食收藏 iPhone 版（SwiftUI）

原生 SwiftUI 版的美食收藏，手感比網頁版順。網頁版（`apps/food-map`）照樣保留，兩邊是同一份資料。

- 資料是同一個 Supabase（food schema），登入用網頁版的同一個帳號。可以新增、編輯、建群組、一起滑卡，網頁版和 App 改的東西會互相同步。
- 收藏頁：搜尋、分類、想去／去過；右上角＋貼連結或店名，雲端 AI 找店家直接存好（跟 IG 分享捷徑同一個功能），也可以自己填。長按卡片改狀態或刪除。
- 店家頁：從卡片放大展開；自己的店可以改想去／去過、星等、分享到群組、編輯、刪除。
- 地圖：Apple 地圖＋下方卡片。
- 群組：建立／加入（邀請碼）、邀請朋友、分享店家、開一輪滑卡（地區、分類、時段、預算、張數），全員都想吃就跳出配對成功。
- 「我的」頁面會顯示打開 App 到看到卡片花了多久，可以跟網頁版比較。

## 在 Mac 上跑

需要完整的 Xcode 16 以上（只有指令列工具不夠）。

```sh
cd apps/food-map-ios
open FoodMap.xcodeproj   # 選 iPhone 模擬器，按 ▶︎
```

或用指令列：`xcodebuild -project FoodMap.xcodeproj -scheme FoodMap -destination 'platform=iOS Simulator,name=iPhone 16' build`

## 裝到自己的 iPhone（免費，不用付 99 美元）

1. 在 Xcode 的「Settings › Accounts」登入你的 Apple ID。
2. 在 FoodMap target 的「Signing & Capabilities」把 Team 選成你的 Personal Team。
3. 用線把 iPhone 接上 Mac，在上方選你的 iPhone，然後按 ▶︎。
4. 第一次打開時，到 iPhone 的「設定 › 一般 › VPN 與裝置管理」信任你的 Apple ID。

用免費帳號裝的 App 每 7 天要用 Xcode 重新裝一次。付 99 美元之後可以用 TestFlight 給朋友裝，或上架 App Store。
