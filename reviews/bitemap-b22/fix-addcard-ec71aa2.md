# ec71aa2：行程模式點地圖圖釘叫不出加站卡

模擬器在 ec71aa2 看到：行程模式點收藏圖釘、搜尋結果圖釘都叫不出加站卡，只有點搜尋清單的列才出卡。浮層有「點收藏加站」和「加站卡浮著 549–770/874 面板118+722」。

## 原因（一組查原因、一組反方驗證）
- 卡片有建出來。中段面板 361 高，卡片 221 被 overlay 的隱含 ZStack 置中，所以落在 549–770（數字完全對得上）。置中不會讓卡片消失，只是浮著。
- 看不到是因為一出來就被清掉。只有點地圖會這樣，點清單的列不會，所以清掉它的是只有點地圖才會走的路。最可能是 MapKit 晚到的點擊選取送 nil 進 Map 的 selection setter，接著 pins.select(nil) → SelWatcher → picked(nil) 清掉 cand，這條路沒有 mark。次要是 blankTap 晚醒（會有「點空白 收加站卡」）。
- 反證：首頁點圖釘也會移鏡頭，大卡卻沒被關，所以「鏡頭移走」不足以單獨解釋。行程模式多了三樣東西：Map 的 TapGesture 用 .all、同一座標插了沒有 tag 的「新的第 N 站」Annotation、淡化圖釘縮到 0.65 倍。哪一個觸發還沒證實，修法都擋得住。

## 修法
a. TripPanel core 的 overlay 裡明寫 `ZStack(alignment: .bottom)`，面板和加站卡都貼底；fitCoords 假設卡片貼底的算法也因此成立。
b. PinState 加 `@ObservationIgnored var tapAt: CFTimeInterval = 0`，tap() 第一行設 `tapAt = CACurrentMediaTime()`。Map selection setter 在擋泡泡和站號那行後面加：
```swift
if trip.on {
    let dt = CACurrentMediaTime() - pins.tapAt
    // 點空白交給 blankTap；MapKit 點圖釘後會晚一步送 nil，不能拿來收加站卡
    // 手指剛點過圖釘 0.6 秒內，MapKit 晚到、而且跟目前不同的選取也不聽
    if id == nil || (dt < 0.6 && id != pins.sel) {
        Perf.shared.mark("地圖選取略過 \(id ?? "nil") \(Int(dt * 1000))ms"); return
    }
}
```
不要寫成「行程模式一律不聽」：淡化圖釘縮到 0.65 倍後，按鈕的範圍變小，但 MapKit 的框還是 44×51，點到框內、按鈕外要靠 MapKit 的選取開卡；VoiceOver 也可能走這條。
c. blankTap 進 Task 前取 t0，醒來後 `guard trip.pickAt < t0 - 0.22 else { Perf.shared.mark("點空白略過"); return }`。zoom() 開頭加 `if trip.on { trip.pickAt = CACurrentMediaTime() }`，行程裡點泡泡才不會被當成點空白。
d. 診斷：MapTab.swift:213 的 onChange 改看 trip.cand?.id，從有變 nil 時記「加站卡關掉 距點 Nms」；picked() 的 nil 分支也記一筆。

## 模擬器驗收
1. 中段、最低段、最高段、新建空行程，各點收藏圖釘；搜尋時點 HitPin。每次都要出卡、貼底，2 秒內不能出現「加站卡關掉」。出現「地圖選取略過 nil」就證實是 MapKit 那條。
2. 點淡化圖釘的上緣、HitPin 圖示上下各 15pt：要跟 ec71aa2 一樣開卡。
3. 點空白：先收卡（記「點空白 收加站卡」），再點一次收搜尋。
4. 卡片開著時點另一根：換卡。再點同一根：不動。✕ 或往下拖關卡後再點同一根：重新出卡。
5. 行程裡點泡泡：放大，不收卡，不出現「點空白」。點站號：收卡、飛到那站。
6. 長按圖釘選「加進行程」：出卡。
7. 按「完成」回首頁：不冒出大卡；點圖釘出大卡、點空白收大卡照舊。
8. VoiceOver 在行程模式對收藏圖釘和 HitPin 連點兩下要出卡，首頁要出大卡。
9. 地圖框好後，加站卡那根圖釘和「新的第 N 站」牌子在卡片上方看得到。
