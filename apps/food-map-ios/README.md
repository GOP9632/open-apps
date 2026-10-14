# 美食收藏 Swift 試用版

用原生 SwiftUI 把美食收藏做一次，用來實際比較手感，看是不是真的比網頁版好。網頁版（`apps/food-map`）完全沒動，會繼續用。

- 資料是同一個 Supabase（food schema），登入用網頁版的同一個帳號。這個試用版只讀資料，不會修改。
- 包含：收藏頁（搜尋、分類、想去／去過）、店家頁（從卡片放大展開）、地圖（Apple 地圖＋下方卡片）、滑卡手感測試（用自己的收藏滑，不存檔）。
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
