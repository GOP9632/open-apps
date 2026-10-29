# 卡頓根因與修法 J1–J6（多代理診斷＋反方驗證，2026-10-29）

基準：Swift 分支 5b5355c（行號以該版為準，改之前在 HEAD 重新定位）。

## J1

**把握度**：整體把握：中等。
- 有把握的部分（中高）：第 1 條的機制。分支最新版的 TripPanel.swift 211–245、287 行，我已確認 if/else 還在；它只在「離開最低段」時發生、每次都重現，這兩點都對得上。第 4 條也有把握：5b5355c 已經做了拖曳只重畫高度層、SeenBox、equatable，這是直接從 commit 內容核對的。
- 還不確定的部分：
(1) 「按下後約 0.7 秒才動」目前沒有任何證據指向程式。最低段只有 20pt 的把手能拉，也可能是錄影的手法，或觸控穿過去打到地圖。步驟 0 的量測結果可能讓第 1 條降級成「只解釋放手那一頓（幾十～一百多 ms）」。
(2) 原始量測是在 a1b57b1 做的，5b5355c 那時還沒有。5b5355c 的 commit 註解寫明它就是在修「拉面板 15–20fps」，所以 J1 的「整段 15–20fps」有一部分可能已經修好，必須在分支最新版重新量。
(3) 第 2 條裡 recluster、afterFit、MapKit 本身各佔多少，只能靠 -perfNoPanelFit A/B 拆開。模擬器上 MapKit 鏡頭動畫可能就是尾巴掉幀的主要來源，這部分 SwiftUI 修不到。
(4) 第 3 條能不能解釋「中間→最高第一次慢、第二次正常」，要看第一次是不是真的拉過頂端；另一個可能是新露出的列第一次 rasterize（文字、陰影）。
(5) 第 253 行 `.animation(.snappy 0.25, value: strip)` 是否把低→中的 spring 換成 snappy，還沒驗證。這會影響時間軸的推算，但不影響要怎麼修。
(6) 清單一直留著以後，回到中間段時捲動位置會保留，這是行為改變，要先問使用者能不能接受。

**摘要**：J1（最低段往上拖：按下約 0.7 秒才動、之後約 1.2 秒只有 15–20fps）。整理後，在分支最新版（5b5355c，build 22 之後那一版）上仍然存在、而且懷疑者沒推翻的根因，按影響排序如下：
(1) 放手那一刻要整份重建直的清單。TripPanel.swift panel() 第 211–245 行是 `if strip { cards } else { ScrollViewReader{ScrollView{rows}} }`，head() 第 287 行是 `if !strip { startChip }`。從最低段往上拉的過程中 pullDown 一直是 false，strip 一直是 true；放手時 sheetDrag.onEnded 在同一個 withAnimation 裡寫 mode.level=.mid，strip 才變 false。結果 UIScrollView、每站的 SwipeToDelete+StopCard+LegRow、startChip 的 Menu 全部在放手後第一個 update 裡才建出來，同一個 update 還有 onChange(mode.level) 觸發 fit。NearbySheet 早就用 highUsed 解決過同一種問題（MapTab.swift 864、899–905、954–959），TripPanel 沒有照做。
(2) 換段後地圖停好時的連鎖反應：fit 用 0.5 秒動畫移鏡頭，鏡頭停好時 recluster 寫入 hidden/clusters，330ms 後再寫一次，pins.flyFrom/mergeTo 也會寫，每次都讓 MapTab 整個重算、所有 FoodPin 重算。afterFit 量到偏差超過 4% 或 6pt 時，會再做 0.3 秒修正，接著再跑一輪。shownRegion 的重算和 TripPanel 被 $pos 拖著重算，5b5355c 已經修好（SeenBox、`.equatable()`）。
(3) 拉過最高段時 size 會和面板高度互相放大，每一輪都觸發 fit（TripPanel.swift 99–112 的 ZStack、131 行量 size、onChange(size)）。這條只解釋「中間→最高第一次慢」，不是 J1 的主因。
(4) gapCount 在 body 裡算，屬於小項，而且只有站與站之間空檔 ≥60 分鐘才會算。
重要前提：指定的 diff 範圍包含 5b5355c，它已經做了「拖曳只重畫高度那層（Lift/LiftHeight）」、「行程模式下鏡頭停好不發布 shownRegion（SeenBox）」、「TripPanel.equatable()」。兩位診斷者的 PanelPull、F2、F5 跟它重複，不要再做。「按下後 0.7 秒才動」目前還沒證明是程式造成的：最低段只有 20pt 高的把手（head() 第 284–286 行，strip 時高 20）掛了 sheetDrag，按在站卡上往上拖，面板本來就不會動。所以第一步是先在分支最新版上重新量，把這段延遲拆開看。

### 根因
- 【1，影響最大，信心中高】放手那一刻才建整份直的清單。TripPanel.swift（分支最新版）panel() 第 210 行：`let strip = mode.level == .low && !pullDown`；211–245 行用 if/else 二選一（站卡 或 ScrollViewReader+ScrollView+rows）；head() 287–294 行的 startChip 也是 `if !strip`。往上拉時 pullDown 只會在往下拉超過 20pt 時變 true，所以整個拉的過程中 strip 都是 true，清單根本不存在。放手後 sheetDrag.onEnded 的 `withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { mode.level = pick; lift.y = 0; pullDown = false }` 讓 strip 變 false，同一個 update 要做這些事：建 UIScrollView、N 組 SwipeToDelete+StopCard（PhotoView、Avatar）、N−1 個 LegRow（每個 3 顆按鈕）、startChip 的 Menu（UIKit 選單），還有每列的 onGeometryChange、onScrollGeometryChange、onScrollPhaseChange。同一個 update 裡還有 onChange(mode.level) → fit → fitCoords 用 withAnimation 寫 pos；如果有訊息條，onChange(settledHeight) 寫 mode.panelH 也會讓 Root 重算。spring 的第一幀要等這些全部做完才出得來。中間→最高不會這樣，因為兩段都是 strip=false，清單一直掛著。懷疑者的修正：每項本身大約幾十 ms，單靠這條撐不出 0.7 秒；fit 本身很便宜；PhotoView 一開始就有快取的圖可以先畫，不是卡點；gapCount 有條件才會算。
- 【2，影響中等，信心中等】放手後 0.5～1.2 秒，地圖停好時的連鎖反應。onChange(mode.level)（TripPanel.swift 151–155）→ fit → fitCoords 第 870 行 `withAnimation(.easeInOut(duration: 0.5)) { pos = .region(r) }`，MapKit 鏡頭動畫和面板 spring 同時跑。鏡頭停好時進 MapTab.swift 162–169 的 onMapCameraChange(end)，5b5355c 之後還剩三件事：(a) 第 168 行 recluster()（591–665），行程模式下 aside() 會依螢幕距離把泡泡推開，縮放一變 moved 幾乎一定是 true，於是寫 hidden、clusters（MapTab 的 @State）→ MapTab.body 整個重算（store.shown 篩選、Map content 裡所有 Annotation 重新比對），330ms 後的 Task 再寫一次 → 再重算一次；pins.flyFrom、pins.mergeTo 一寫，每根 FoodPin 都重算。(b) 第 164 行 afterFit（TripPanel.swift 875–894），量到 rho 偏差超過 4% 或中心偏超過 6pt，就再做 `withAnimation(.snappy(duration: 0.3))` 修正，停好後 (a) 再跑一輪。這是 build 22（3cd81f9／a1b57b1）新加的。(c) 模擬器上 MapKit 鏡頭動畫本身就很吃 CPU，跟 SwiftUI 這邊無關。三件事各佔多少，要用 A/B 量才知道。shownRegion 讓 MapTab 重算、$pos Binding 讓 TripPanel 跟著重算，這兩件在 5b5355c 已經修掉（SeenBox publish:!trip.on、`TripPanel(...).equatable()`）。
- 【3，只影響「中間→最高第一次慢」，信心中低】拉過頭時 size 會互相放大。core 是 `ZStack(alignment: .bottom){ Color.clear; panel }`（TripPanel.swift 99–112）。LiftHeight 的上限 hi+30 = size.height+22，比容器還高，ZStack 就被撐大；131 行 `.onGeometryChange(for: CGSize.self){$0.size}` 寫回 size → heights() 變大 → 上限又變大。在最高段只要再往上拉超過 8pt 就會一直長；在中間段，手指拉超過容器高的一半，會長到大約 2×pull。每長一輪都會觸發 onChange(size)（146–148 行）→ fit(animated:false) 寫 pos → 鏡頭停好 → recluster 和 afterFit。可以解釋「第一次拉過頭所以慢、第二次沒拉過頭所以正常」，但還沒有證據證明第一次真的拉過頭。
- 【4，小項】gapCount（TripPanel.swift 418–419 呼叫，928 行定義）在 body 裡用整份 store.places 逐間比對路線上每一段。只有某站有固定時間、而且跟前一站之間空出 60 分鐘以上才會算；沒有固定時間的行程完全不會跑到。清單改成一直掛著以後，這段在每次 TripPanel.body 重算時都會執行，所以要順手移出 body。
- 【還沒證明，必須先量】按下後 0.7 秒才開始動。最低段 head() 只有 20pt 高的把手掛了 sheetDrag（283–298 行）；站卡那排和「排順序／出發」往上拖，面板不會動。錄影時手指（滑鼠）如果先落在站卡上，或在模擬器上先按住再移動，這 0.7 秒就是操作本身的時間。另外，觸控也可能穿過面板打到 MKMapView（SwipeBack.swift:34 的註解提過這種現象）。如果錄影看到慢拖時手指在動、面板卻沒跟著變高，原因就在手勢或觸控區域，不是第 1 條。

### 修法步驟
【步驟 0：先換基準、先量，不寫修正】所有修改都做在 origin/claude/project-thread-bai8ub 最新版上（已經包含 5b5355c 的 Lift/LiftHeight/LiftOffset、SeenBox、TripPanel.equatable()、Perf.count）。不要再加 PanelPull、PanelFrame，也不要再改 MapTab 第 166 行的 shownRegion，這些都已經做了。在 5b5355c 上用 Release 模擬器（iPhone 17）加 -perfOverlay 重新量一次 J1。暫時加四個 Perf.shared.mark 或 signpost：sheetDrag 第一次 onChanged 記「拉面板開始」，同時記 `CACurrentMediaTime() - 按下時間`；onEnded 的 withAnimation 前記「放開」；fitCoords 開頭記「fit」；MapTab onMapCameraChange(end) 記「鏡頭停」。目的是把 0.7 秒拆成三種情況：(a) 第一次 onChanged 就晚了 → 手勢或觸控問題，看步驟 6；(b) 拉的過程面板有跟手、放開那一幀很長 → 步驟 1；(c) 放開後的尾巴 → 步驟 2、3。

【步驟 1：清單出現過就留著，照 NearbySheet 的 highUsed 做法】TripPanel.swift：(1) 新增 `@State private var rowsUsed = false`。(2) panel() 211–245 行的 if/else 改成疊在一起：
```swift
ZStack(alignment: .top) {
    if strip { cards(t, base: base, order: order, plan: plan).transition(.opacity) }
    if !strip || rowsUsed {
        ScrollViewReader { sp in /* 原本 216–243 行整段不動 */ }
            .opacity(strip ? 0 : 1)
            .allowsHitTesting(!strip)
            .accessibilityHidden(strip)
            .onAppear { rowsUsed = true }
    }
}
.frame(height: strip ? 74 : nil, alignment: .top)
.frame(maxHeight: strip ? 74 : .infinity, alignment: .top)
.clipped()
```
第 253 行的 `.animation(.snappy(duration: 0.25), value: strip)` 保留，所以仍然是交叉淡入淡出。(3) head() 287–294 行的 `if !strip { HStack{ startChip … } }` 改成一直掛著：HStack 後面接 `.frame(height: strip ? 0 : nil, alignment: .top).clipped().opacity(strip ? 0 : 1).allowsHitTesting(!strip).accessibilityHidden(strip)`，原本的 `.transition(.opacity)` 拿掉。(4) 行程直接從最低段打開時的預先建好：在 content(t) 加一個 `.task(id: tid)`，裡面先 `try? await Task.sleep(for: .seconds(1.5))`，再 `while pulling || drag.id != nil || mode.cand != nil { try? await Task.sleep(for: .milliseconds(300)) }`，最後 `if !Task.isCancelled, !rowsUsed { rowsUsed = true }`。手勢還沒結束就一直等，不要在拖到一半時建清單。TripMode.open 預設是 .mid，大部分情況一打開清單就建好了。(5) 這步一定要在有 Lift 的版本上做（步驟 0）。在 a1b57b1 上單獨做，拖曳時每幀寫 pull 會連藏起來的 rows 一起重算，會更慢。

【步驟 1 的附帶處理】(a) 藏起來的 ScrollViewReader 上的 `.onChange(of: mode.scrollTo, initial: true)` 在最低段也會把 scrollTo 吃掉。改成 `guard let id, !strip else { return }`，再加 `.onChange(of: strip) { _, s in if !s, let id = mode.scrollTo { mode.scrollTo = nil; withAnimation(.snappy) { sp.scrollTo(id, anchor: .top) } } }`，保留「出現時捲過去」的行為。(b) 清單一直留著，回到中間段時會停在上次捲到的位置，不會再回到頂端，這是行為改變。如果使用者要的是每次回到頂端，就在 onChange(of: strip) 變 false 時 `sp.scrollTo(第一站 id, anchor: .top)`，不要帶動畫。改之前先問使用者。(c) 藏起來的 rows 裡，被拖的那列已經改用 LiftOffset(dragY)，最低段換順序時只有 drag.to 改變才會重算。

【步驟 2：把 gapCount 移出 body】TripPanel.swift：新增 `@State private var gaps: [String: Int] = [:]`。block() 第 419 行改成 `gapHint(row.wait, count: gaps[s.id] ?? 0)`。在 content(t) 加 `.onChange(of: gapKey(t, order, legs), initial: true) { gaps = 計算結果 }`，只算 row.wait >= 60 的那幾段，計算本身照搬 928 行的 gapCount。gapKey 至少要包含：這天各站 id 和 pos、每段有沒有路線（legs 的 line != nil）、store.places.count，以及 store.places 裡 been 的數量或其他會影響 gapCount 篩選的欄位。開工前先讀 928 行，確認它篩選用了哪些欄位，全部放進 key，避免數字過時。

【步驟 3：減輕地圖停好時的第二輪。先量，有效才做】(a) A/B 量地圖這邊佔多少：比照 ce77932 的 `#if targetEnvironment(simulator)` 加啟動參數 -perfNoPanelFit，讓 TripPanel.swift 151–155 的 onChange(mode.level) 直接 return，同一個 J1 動作量兩次，差值就是 fit 連鎖的份量，量完拿掉。(b) 讓 afterFit 少修：在 fitCoords（846–895 行）算 r 之前，先把 MapKit 依畫面比例調整的量算進去。算 `ptPerLng = k * cos(mid * .pi / 180)`（k 是每度緯度的點數），`needW = lngR * 1.4 * ptPerLng`；如果 needW > 地圖可用寬（Self.mapWidth 或 mode.mapRect 的寬），令 `z = needW / 地圖寬`、`k = k / z`，再用新的 k 算 full 和 center。afterFit 保留當保險。(c) recluster（MapTab.swift 591–665）：用 Perf.count 量 MapTab.body 在一次換段裡跑幾次；如果超過 2 次，把 moved 的判斷從經緯度差 1e-5 改成螢幕距離差超過 2pt（用 proxy.convert 比新舊泡泡位置），避免縮放時算出來幾乎一樣的位置也被當成「移動」而重寫 clusters。不要改泡泡合併的動畫和 330ms 的時間。(d) 不要延後 fit 或鏡頭動畫的開始（D2 提的 Task.sleep 16ms 不採用）。

【步驟 4：修 size 互相放大，對應中間→最高第一次慢】TripPanel.swift 99–112：把 `let core = ZStack(alignment: .bottom) { Color.clear.allowsHitTesting(false); if mode.going {…} else if let c = mode.cand {…} else { panel(…) } }` 改成 `let core = Color.clear.allowsHitTesting(false).overlay(alignment: .bottom) { if mode.going {…} else if let c = mode.cand {…} else { panel(…) } }`。三個分支原樣搬進去，包含 .id(c.id)、.transition、goBottom 的 onGeometryChange；後面接的 `.overlay(alignment: .top)` 和兩個 `.animation(..., value: mode.searchOn…)` 保持不變。overlay 不會改變 Color.clear 的大小，131 行的 size 和 132 行的 top0 就固定是容器大小，拉過頭的 30pt 只會往上畫出去，不會再觸發 onChange(size) → fit。改完要確認：拉過頭時面板蓋到 TripTop 的那段（最多約 22pt）不會吃掉標題列的觸控、視覺上可以接受；加站卡的進出、出發畫面、gone 畫面的 transition 都還正常。

【步驟 5（選做）】SwipeBack.swift 第 74、77 行 swipeBackBlocked 的 rect 從 @State 改成 class 盒子，例如 `@State private var box = RectBox()`（final class，裡面放 `var r: CGRect?`，不加 @Observable），避免面板上緣移動時每幀多一次 update pass。效益很小，排在最後。

【步驟 6（看步驟 0 的結果再決定）】如果錄影顯示 0.7 秒是因為第一次 onChanged 晚到（手指落在站卡上，或觸控穿過去打到地圖）：只是測試手法的問題就改測法，從 20pt 的把手開始拖。如果要讓最低段更好抓，把 head() 把手那塊的觸控區往上加大，例如 `.contentShape(.rect.inset(by: -8))`，或把 Capsule 那條的高度從 20 改到 28，再把 cards 往上移同樣的量。不要把 sheetDrag 掛到站卡那排上，會跟橫向捲動和 reorderX 長按換順序互搶手勢。

### 不要動
- 三段高度（低 150／中 h*0.5／高 h−8）、往上拉 60pt 至少換一段、甩的判斷、`.spring(response: 0.38, dampingFraction: 0.82)` 都不要動；拉過頭可以多出 30pt 的彈性範圍也要保留。
- 站卡和直的清單之間的 0.25 秒 snappy 交叉淡入淡出要保留，只把「插入、移除 view」換成「opacity 切換」。第 253 行的 `.animation(.snappy(duration: 0.25), value: strip)` 可能把低→中的 spring 換成了 snappy，這是使用者現在看到的手感，修效能時不要順便改；要改得先問使用者。
- 換段後地圖用 0.5 秒框住這天的站、停好後 afterFit 的修正，都是使用者要的行為：不要拿掉，也不要延後開始（不採用 D2 用 Task.sleep 16ms 延後 fit）。使用者的標準是按下那一幀就要開始動。
- 不要重做 5b5355c 已經做好的東西：PanelPull/PanelFrame（已經有 Lift/LiftHeight）、MapTab 第 166 行的 shownRegion 守門（已經有 SeenBox）、TripPanel 的 Equatable。也不要在 a1b57b1 上單獨做「清單一直掛著」，沒有 Lift 會更慢。
- 已知的坑：Map Annotation 的內容不會跟著 MapTab 重畫，圖釘外觀要從 PinState 這類 @Observable 讀，不要為了減少重算改成從 MapTab 傳參數。不要改 Map 的 safe area 或大小，會讓整張地圖重排約 0.5 秒；面板、標題列必須留在地圖上面另一層（MapTab 211–219 的 Color.clear.overlay），步驟 4 只改 TripPanel 裡面的 core。TripMode.shared、MapPanel.shared、TripStore.shared 是 @Observable 單例，在 body 裡多讀一個屬性就多一個依賴，不要在 body 裡讀每幀會變的值（例如 mode.geo、lift.y）。
- 藏起來的清單一定要加 allowsHitTesting(false) 和 accessibilityHidden。長按換順序、拖到「第 N 天」、清單捲到頂再往下拉降一段、mode.scrollTo，都要留在同一個 ScrollView 上。
- 不要用 maximum-scale 或 user-scalable 之類的方式處理任何縮放問題（專案規範）。

### 模擬器驗證
環境：Mac 上 Release 模擬器（iPhone 17），啟動參數加 -perfOverlay，螢幕錄影算幀間隔，≥25ms 算掉幀。改前改後都在 5b5355c 基準、同一個行程（至少 5 站、其中一段有 ≥60 分鐘的空檔，才會跑到 gapCount）、同一個縮放下比較。

1. 改前基準（步驟 0）：從最低段 20pt 的把手開始往上拉。慢拖到中間 2 次、短甩 2 次，都放手到中間段。記下以下數據：按下到面板第一次變高的幀數、「放開」到 spring 第一幀的間隔、放開後 1.2 秒內 ≥25ms 的幀數，以及 Perf HUD 上「行程面板」「MapTab」的重算次數。同時看影片：慢拖時面板有沒有跟著手指變高、地圖有沒有跟著平移（如果有，就是觸控穿過去打到地圖，走步驟 6）。

2. 步驟 1、2 的驗收：
- 放開那一幀和下一幀的間隔 <25ms，spring 在放開後第一幀就開始動。
- Perf HUD 上，放開後不再出現新建的 StopCard、LegRow；在 DEBUG 版用 `Self._printChanges()` 確認。
- 從最低段再拉一次，結果一樣，也就是第二次以後都正常。
- 拖的過程中「行程面板」每次拖曳最多只重算 1 次（跨過 −20 那條線時）。

3. 步驟 3 的驗收：用 -perfNoPanelFit A/B 量出地圖連鎖的份量。改完後，放開後 0–1.2 秒 ≥25ms 的幀數，要接近「關掉 fit」那一版。afterFit 真的修正時印一行，最低→中間連做 5 次，修正次數應該從大多數降到 0–1 次。一次換段裡 MapTab.body 的重算次數 ≤2。

4. 步驟 4 的驗收：中間→最高慢拖，故意拉過頂端 50pt、停 1 秒。暫時在 131 行的 action 裡 print(size)，size 不應該再變；fit 不再一直出現；面板不會往下滑出螢幕；第一次和第二次的幀率一樣（每幀 <25ms）。

5. 總驗收（使用者標準）：最低→中間連拖 5 次（慢拖、短甩、拉到螢幕上方各至少 1 次），手指一動面板當幀就跟著變高，放手那一幀 spring 就開始，整段沒有 ≥25ms 的幀。模擬器上的絕對值偏高，所以重點看跟改前同條件比，掉幀數接近 0。

6. 回歸測試：
- 最低段放手後站卡淡出、清單淡入；中間段往下拉回最低段時，清單淡出、站卡淡入。
- 最低段長按站卡左右拖換順序，量幀率，不能比改前慢。
- 清單捲到頂再往下拉會降一段；在中間段長按一站換順序、拖到「第 N 天」。
- 在地圖上點站號（tapMark）後拉到中間，清單會捲到那站。
- 點收藏跳出加站卡，再關掉；出發、結束出發。
- 加站後訊息條要貼在新的面板高度上面。
- 開著 VoiceOver，最低段念不到藏起來的清單和 startChip。
- 中間段回來時的捲動位置，照使用者決定的行為。

---

## J2

**把握度**：整體把握度偏低到中，因為 3×143–192ms 的直接原因還沒有被任何一方證實。
確定的：retarget 的門檻 bug（數學驗證過，會在手指沒動或微動時換位，觸發 MapTab 重算）；PerfHUD 只量到下一個 tick 的盲點；拿起那一刻 MapTab、Map、Annotation 都不會失效，地圖也不會重排（已逐行核對）。
不確定的：(1) 那 3 幀是主執行緒（TripTop/dayDrops 新建、gapHint 重排、onGeometryChange）、render server，還是可變幀率錄影的假長幀，要靠第 0 步的掉幀計數器、逐格確認和 Instruments Hitches 判斷。(2) build 20 卡不卡還沒測，這決定要做第 2 步還是第 3 步。(3) branch HEAD（5b5355c）已經改了拖動架構，J2 在 HEAD 上可能不一樣，甚至已經消失。(4) 長按按下時的 gapCount 成本有多大、會不會被誤算成拿起，還沒量。
第 1、4 步不管 J2 結論如何都有價值，風險低。第 2、3、5 步要先看第 0 步的結果再做，不要一次全上。

**摘要**：J2（行程面板長按拿起那一刻，連續 3 幀 143–192ms）的主因還沒定案。兩位診斷者提的主因，懷疑者都在量級上推翻了：整塊陰影和群組透明度每幀很貴、手勢遮罩切換、retarget 誤判讓 MapTab 重算，三條都解釋不了「拖動順、只有拿起卡、每次都卡」。逐行核對後成立的有三件事。(1) 拿起時 begin()（TripPanel.swift L475-481）在一個 withAnimation(.snappy(0.2)) 交易裡同時翻轉約 10 處依賴 drag.id 的結構：LegRow 透明度 L401、gapHint 移除 L408 造成清單重排、actions 淡出 L273-274、整塊 scale 加 shadow L433-436、scrollDisabled L215、手勢遮罩 L292/L415。接著 L168 的 onChange 把 mode.moving 設成 true，TripTop 新建 dayDrops（TripTop.swift L31-39）。這一刻 MapTab、Map、Annotation 都不會失效，地圖的 safe area 和大小也不變。這是拿起和拖動唯一的差別，是剩下的嫌疑範圍，但哪一項貴要靠 Instruments 和 build 20 對照來分。(2) RowDrag.retarget（L1210-1220）真的有 bug：換到下一列的條件是 dy > (r.h−h)/2，等高時往下動一點點就換位，下一列比較矮時手指不動也換位。換位會改 pubKey，寫入 mode.segs/marks，MapTab 跟著重算。該修，但不是 J2 主因。(3) 量測有盲點：PerfHUD 的「拿起一站 9–10ms」只量到下一個 display link tick；simctl 錄影是可變幀率，長按靜止的那段可能被錄成假的長幀；長按「按下」那一刻 holding 變 true，會跑 gapCount，那個成本也可能被算進拿起。計畫是先分流確認，再照結果做對應的改法。retarget 不管結論如何都先修。

### 根因
- 【1．待分流的主嫌：拿起交易一次翻轉一整批結構，build 22 又多加了一段】TripPanel.swift（a1b57b1）的 begin() 在 L480 用 withAnimation(.snappy(duration:0.2)) 寫 drag = RowDrag(id, from:k, to:k, h)。to==from，所以 preview（L1204-1209）原樣回傳，pubKey 不變，L130-134 不會寫 mode.segs/marks/summary。MapTab、Map、MarkView/FoodPin 這一輪都不會失效（已用 grep 確認：MapTab 不讀 moving/overDay/drag）。真正改變的只有 TripPanel 的結構，而且全部在 0.2 秒的 snappy 交易裡：每列 LegRow 變成 opacity 0.25（L401→L1466/1505）；gapHint 被拿掉（L408，條件 drag.id == nil），下面每一列往上移，每列的 onGeometryChange（L432）每幀都會跑；actions 淡出（L273-274）；被拖那整塊 scaleEffect 1.03，加上套在複合 view 上的 .shadow radius 12（L434-435）；.scrollDisabled 翻轉（L215）；head 的手勢遮罩（L292）和每列 SwipeToDelete 的遮罩（L415→TripsList.swift L364）也翻轉。接著 L168 的 onChange 在同一個交易裡寫 mode.moving=true（TripMode 單例），只有 TripTop 讀它：TripTop body 重算，overlay 新建 dayDrops（LazyVGrid，每顆 chip 都有 shadow 和 onGeometryChange，TripTop.swift L208-227），整個 TripTop 子樹也進入 L39 的 .snappy 動畫。git diff dbb5155..a1b57b1 確認，mode.moving、dayDrops、L168 的 onChange、L292 的遮罩是 build 22 新加的；scale、陰影、透明度、gapHint 移除、scrollDisabled、retarget 在 build 20 就有。為什麼只在拿起時發生：這些寫入只在 drag.id 從 nil 變成有值的那一刻發生，拖動中 drag.id 不變、只改 dy。懷疑者的修正：拖動中 LegRow 一直保持 0.25 透明、陰影也一直在，所以『群組透明度或離屏陰影本身很貴』解釋不了拿起和拖動的差別。拿起獨有的只有幾項：scale 和陰影透明度正在變（要重新點陣化）、gapHint 移除造成的重排動畫、dayDrops 新建、遮罩翻轉。在 Mac GPU 上，這些照理都到不了每幀 170ms。所以這條只能當『待 Instruments 和 build 20 對照分流的嫌疑範圍』，不能直接當結論。
- 【2．確定存在的 bug，不是 J2 主因：retarget 手指沒動也會換位，連帶 MapTab 重算】TripPanel.swift L1210-1220 的 retarget 用 mid = r.midY - h（k>from）和 center = f.midY + dy 比較，換到下一列的條件等於 dy > (r.h − h)/2。結果：兩列等高時，往下動 1/3pt 就換位；下一列比較矮時（收藏卡約 76pt，下一站是景點或住宿的虛線卡約 67pt），dy=0 就換位；被拖那列帶著 gapHint 時，h 是含 gapHint 的舊高度，一定誤判。第 0 站沒有 LegRow，不會中。retargetX（L1224-1233）是同一個公式。中了就是 to 改變，接著 drag.preview（L90）、legs/plan 重算，pubKey 改變，L130-134 寫 mode.segs/marks/summary，MapTab 整個 body 重算（store.shown、Nearby、隱藏的 NearbySheet），Map 內容重比對（MapPolyline 的 id 改變，MarkView 換號碼），還會多一下 Haptic.tick。另外 geo.rows 在拖曳中不更新（L432 只在 drag.id==nil 時寫），gapHint 被拿掉後高度就不對了，shift(k) 讓位的量也是錯的。懷疑者的判斷：拖動中每次跨列也走同一條路，使用者卻說拖動順，所以這條路一次的成本不到 150ms；而且模擬器滑鼠完全不動時 g==nil（L459），retarget 根本不會跑，跟『兩次一樣、每次都卡』對不上。結論：該修（手感和正確性），但不是那 3 幀的主因。branch HEAD（5b5355c 改名為 target()）沿用同一個公式，bug 還在。
- 【3．量測盲點：現有數字不足以定位】(a) Perf.swift L39-43 的 mark 只記時間，L58-73 在下一個 CADisplayLink tick 就結算並清掉 pending，所以「拿起一站 9–10ms」只代表第一個 tick 沒被擋，第 2、3 幀和之後的 commit/render 都看不到。(b) xcrun simctl io recordVideo 是可變幀率：畫面沒變就不出幀。長按的 0.35 秒、拿起後滑鼠靜止的那段，都可能被算成假的長幀，必須逐格確認那 3 幀之間卡片確實在變。(c) Perf 本來就有「掉幀（2 秒內）」計數器（L57-63，CADisplayLink 在主執行緒），兩位診斷者都沒用。(d) 長按「按下」那一刻 .updating($holding)（L454）讓 holding 變 true，body 在 L139/L166 讀它，所以 TripPanel 會重算。這時 drag.id==nil，每個空檔都會跑一次 gapCount（L912-921：所有收藏對整條路線折線算距離）。這發生在拿起前 0.35 秒，畫面不變、錄影上看不出來，可能被誤算成拿起那一刻。(e) 兩位給的行號都是 a1b57b1 的。branch HEAD（bc0bc20，含 5b5355c）已經把拖動改成 dragY/Lift、retarget 改名 target、TripPanel 加了 .equatable()。修法要在 HEAD 上重新定位，J2 也要先在 HEAD 上重測。
- 【已排除，不用再查】Map 的 safe area、邊距、大小（MapTab L146-147：headY 有 L236 的 !trip.on 擋著，footY 有 setFoot L529-532 擋著；dayDrops 在 overlay 裡，不改 TripTop 高度），所以不會發生已知的 0.5 秒地圖重排。fit 和鏡頭（fitKey、needKey 用的是 base，不是 order）、router.need、照片 .task(id:) 都不會在拿起時觸發。gapCount 只在 drag.id==nil 時算（按下和放下時會算，拿起時不會）。手勢遮罩切換讓 UIKit 重新仲裁『地圖每根 Annotation』這條不成立：annotation 不在面板觸控的 hit-test 鏈上，而且量級只有微秒到毫秒。

### 修法步驟
第 0 步（必做，先在 branch HEAD bc0bc20 上做，所有行號都要在 HEAD 重新定位）：先分流，確定卡在哪一層再改。(a) Release、iPhone 17、-perfOverlay，先在 HEAD 重測 J2：5b5355c 已經讓拖動只重畫移動那層，J2 可能已經變了。(b) 拿起時看 HUD 的「掉幀（2 秒內）」計數器：跳 +2 到 +3 表示主執行緒被擋；錄影卡但計數器沒變，表示是 render server 或錄影的假象。(c) 錄影逐格看那 3 個長間隔前後：被拖的卡片是否確實在放大的半途（真的掉幀），還是同一張畫面（可變幀率的假長幀）。(d) 同一個行程、同一個動作在 build 20（dbb5155）上做：build 20 不卡，嫌疑就收斂到 build 22 新加的 mode.moving→dayDrops、L168 的 onChange、L292 的遮罩；build 20 也卡，就是舊結構（scale/shadow、gapHint 重排）。(e) Instruments 的 SwiftUI 模板加 Hitches 和 Time Profiler，看那 0.5 秒主執行緒在跑 TripTop.body/LazyVGrid、TripPanel.body/gapCount、layout/onGeometryChange，還是主執行緒閒著但 Hitches 標成 commit/render。(f) Time Profiler 也看按下（touch-down）那一刻的 gapCount：如果 0.35 秒前那一下就很長，請準備一個沒有固定時間的行程對照。依照 (d)(e) 的結果，決定做第 2、3、4 步中的哪一步。

第 1 步（不管 J2 結論如何都先修，獨立一個 commit）：修 retarget/retargetX（a1b57b1 是 TripPanel.swift L1210-1233；HEAD 是 RowDrag.target(...)，約 L1233-1239）。改成用被拖那列的邊緣去碰鄰列的中線，dy=0 時一定得到 t==from：
```swift
@MainActor mutating func retarget(_ geo: RowGeo, base: [TripStop]) {
    guard let id, let f = geo.rows[id] else { return }
    var t = from
    for (k, s) in base.enumerated() where s.id != id {
        guard let r = geo.rows[s.id] else { continue }
        if k > from, f.maxY + dy > r.midY { t += 1 }   // 往下：下緣越過下一列中線
        if k < from, f.minY + dy < r.midY { t -= 1 }   // 往上：上緣越過上一列中線
    }
    if t != to { to = t; Haptic.tick() }
}
```
retargetX 用 minX、maxX、midX 照同樣方式改。gapHint 讓高度過期的問題（h 和 geo.rows 都包含拿起時被拿掉的 gapHint，shift(k) 讓位的量會錯）：在 gapHint 上加 .onGeometryChange 把它的高度記進 mode.geo（@ObservationIgnored，不會觸發重算），例如 geo.gaps[s.id]。begin() 傳入的 h 改成 rows[s.id].height − (gaps[s.id] ?? 0)；retarget 和 shift 用的 r.midY 扣掉『這列以上所有被拿掉的 gapHint 高度總和』。如果時間不夠，這部分可以晚點做，但要在 PR 說明裡寫成已知問題。

第 2 步（第 0 步顯示 build 20 不卡，或 Time Profiler 在 TripTop/dayDrops 上）：讓「第 N 天」那排一直掛著，只切換透明度，不要每次拿起都新建。TripTop.swift L31-39：把 `if mode.moving, let t, t.days > 1` 改成 `if let t, t.days > 1`，dayDrops(t) 後面加 `.opacity(mode.moving ? 1 : 0).accessibilityHidden(!mode.moving)`（dayDrops 本身已經有 allowsHitTesting(false)）。保留 L39 的 .animation(.snappy(duration: 0.2), value: mode.moving)，淡入照舊。因為 chips 一直掛著，它們的位置平時就量好了：TripPanel begin() 裡的 `mode.geo.chips = [:]` 拿掉。但 onGeometryChange 只會新增或覆寫，不會刪除，所以要補兩件事：在 TripTop 加 `.onChange(of: "\(t?.id ?? "")|\(t?.days ?? 0)") { mode.geo.chips = [:] }`（換行程或改天數時清掉，dayDrops 會自己重新量）；TripPanel 的 overDay(_:)（a1b57b1 L466-472）只接受 `t.days > 1 && (1...t.days).contains(key)` 的 key，避免把站拖到不存在的天數。另外，在 begin() 裡直接寫 `mode.moving = true`，放在同一個 withAnimation 交易裡；L168 的 .onChange(of: drag.id != nil) 刪掉。凡是清掉 drag 的地方都改成呼叫新的 `private func clearDrag()`，裡面寫 `drag = RowDrag(); mode.moving = false`：L139（fitTick）、L485（guard 失敗）、L490 和 L507 的 withAnimation 區塊裡（放在同一個交易內，淡出動畫才不會變）。

第 3 步（第 0 步顯示主執行緒在 TripPanel 的 layout/onGeometryChange，或 render/commit 很長，而且 build 20 也卡）：縮小拿起動畫交易的範圍，外觀不變。(a) begin() 拿掉外層的 withAnimation，改成直接賦值。不要用 Transaction(disablesAnimations = true)：那會連下面的 .animation(value:) 一起擋掉，拿起就會變成瞬間跳過去。(b) block() 的 L434-435 改成用 iOS 17 限定範圍的寫法，只讓 scale 和陰影跟著動畫，不影響 offset 和版面：`.offset(...).animation(dragging ? .snappy(duration: 0.2) : .snappy(duration: 0.28)) { $0.scaleEffect(dragging ? 1.03 : 1).shadow(color: .black.opacity(dragging ? 0.18 : 0), radius: 12, y: 6) }`。放下時用 0.28，跟 drop() 的 snappy(0.28) 一致，歸位才不會錯位。不要在 scaleEffect 後面掛 `.animation(_, value: dragging)`，那會蓋過放下時整個 block 的歸位動畫。(c) LegRow 的 `.opacity(hidden ? 0.25 : 1)`（a1b57b1 L1505）改成 `.animation(hidden ? .snappy(duration: 0.2) : .snappy(duration: 0.28)) { $0.opacity(hidden ? 0.25 : 1) }`。(d) actions（L273-274）本來就有自己的 .animation，保留。(e) gapHint（L408）的收合原本跟著交易一起做動畫：給它加 `.transition(.opacity)`，再在 rows 的 VStack 加 `.animation(.snappy(duration: 0.2), value: drag.id == nil)`，保留『下面各列往上補』的 0.2 秒動畫。做完要錄影比對，確認拿起的外觀跟改之前逐格一致。如果 Instruments 指出 gapHint 重排正是瓶頸，再和使用者討論是否改成『保留空間只淡出』。那會在拖曳中留下約 48pt 空白，是外觀上的改變，要使用者同意；而且要先做第 4 步的快取，不然 gapCount 會在每次重算時都跑。

第 4 步（降低按下和放下那一刻的成本，第 0 步看到 gapCount 很重時一定要做）：gapCount（a1b57b1 L912-921）加 @ObservationIgnored 快取，例如 `[String: Int]`。key 至少包含 prev.id、s.id、TripMath.mode(t, s)、router 這段是否已經有路線（router.legs[key] != nil）、store.places 的版本。store 如果沒有版本號，就加一個 @ObservationIgnored 的 placesRev，在 places 的 didSet 裡加 1；收藏的 status 改變也會觸發 didSet，『去過』的狀態就會正確更新。命中快取時直接回傳，不再算距離。

第 5 步（只有第 0 步的 Instruments 明確顯示 render/離屏陰影是瓶頸才做）：把被拖那塊的陰影改畫在形狀上，不再對整塊複合 view 算陰影。只對收藏卡（實心背景）這樣做：在 StopCard 背景的 RoundedRectangle(cornerRadius: 20) 上加 `.shadow(color: .black.opacity(lifted ? 0.18 : 0), radius: 12, y: 6)`，lifted 由 block() 傳入 dragging。景點和住宿卡的背景是半透明的 Color.panel.opacity(0.6) 加虛線（L1375-1378），形狀陰影會從半透明底透出一團灰。這兩種卡要先在背景下面墊一層不透明的 RoundedRectangle 再加陰影，或維持原本的做法。原本的陰影包住 LegRow 加卡片，改完只包卡片，形狀不同，改之前先截圖給使用者確認。

### 不要動
- 不要改掉使用者要的拿起動畫：長按 0.35 秒、Haptic.medium、放大 1.03、陰影浮起、0.2 秒 snappy，從按下那一幀就開始動。其他列一樣淡到 0.25，排順序／出發一樣淡出，「第 N 天」一樣 0.2 秒淡入。放下一樣用 snappy 0.28，拖到「第 N 天」放開一樣換天，拖動中地圖號碼和路線一樣跟著換。
- 不要用 Transaction(disablesAnimations = true) 包 begin()。它會擋掉所有 .animation(value:)，拿起會變成瞬間跳過去。
- 不要在 scaleEffect 後面掛整個子樹的 `.animation(_, value: dragging)`，它會蓋過放下時 0.28 的歸位。要用限定範圍的 `.animation(_:body:)`。
- 不要把手勢遮罩固定成 .all（TripPanel L292、TripsList.swift L364）。SwipeToDelete 在展開時用 .subviews，是為了不讓左滑搶走停留時間的 Slider（TripPanel L414 的註解）。這條嫌疑已經被推翻，改了只有風險。
- 不要讓 gapHint 一直掛著、每次重算都跑 gapCount（沒有快取時會讓拖動變卡），也不要沒問使用者就改成拖曳中留白。
- 不要刪掉 begin() 的 mode.geo.chips = [:]，除非同時做了第 2 步的換行程/改天數清除，以及 overDay 的天數範圍檢查。
- 不要動 Map 的 safeAreaPadding、大小、.ignoresSafeArea()，也不要讓 TripTop 或 dayDrops 改變 safeAreaInset 的高度（已知的坑：會讓整張地圖重排約 0.5 秒）。dayDrops 要留在 overlay 裡。
- 圖釘外觀繼續從 @Observable 的 PinState 讀，不要改成從 MapTab 的狀態傳進 Annotation。TripMode、MapPanel、TripStore 是 @Observable 單例：新寫入的屬性要確認只有該讀的 view 會讀它。
- 不要直接照 a1b57b1 的行號改。修正要做在 branch HEAD（bc0bc20，含 5b5355c 的 Lift/target/.equatable）上。
- 驗證用的 print 或開關不要留在提交裡。

### 模擬器驗證
環境：Mac、Release、iPhone 17 模擬器，啟動參數 -perfOverlay。測試行程：同一天至少 5 站，包含『收藏店後面接景點或住宿』、兩站等高相鄰、一站有固定時間會出現「空出…」提示；行程至少 2 天。另外準備一個單天行程。面板分別放在一半和全開。
錄影：`xcrun simctl io booted recordVideo --codec=h264 j2.mp4`，用 `ffprobe -v error -select_streams v -show_entries frame=pts_time -of csv=p=0 j2.mp4` 取每幀時間，相鄰相減。≥25ms 的間隔要逐格確認前後畫面確實不同，才算掉幀（錄影是可變幀率，靜止的那段不算）。同時看 HUD 的「掉幀（2 秒內）」計數器。

修好的標準：
1) 長按滿 0.35 秒後的第一個新畫面，卡片已經開始放大、陰影開始出現（不能延遲才開始）。從那一幀起 0.6 秒內，沒有任何 ≥25ms 的真實掉幀（原本是連續 3 幀 143–192ms），HUD 掉幀計數器不增加。放開那一刻前後 0.6 秒也一樣。
2) 第 1 站、中間等高站、『後面接景點的收藏站』、有「空出」提示的站、最後一站，各做兩次都通過。單天和多天、一半和全開都要測。最低段的橫排站卡（retargetX）也要測。
3) 第 1 步的行為：拿起後不動或只輕微抖動，號碼和地圖路線都不變，沒有 tick 震動。往下拖到被拖那列的下緣越過下一列中線才換位，換位那幀 <25ms，tick 一次，地圖號碼跟著換。往上拖對稱。gapHint 那站拿起後，讓位的位置正確，不會重疊或留縫。
4) 多天行程：拿起時「第 N 天」一樣 0.2 秒淡入，拖到上面會放大、tick，放開後一樣換天並出現「移到第 N 天」。換到只有 1 天的行程、或把天數改少後再拖，不會出現看不見的天數目標。
5) 面板拉動、左滑刪除（含展開時拉停留滑桿不會被當成左滑）、清單捲動、系統取消手勢（下拉通知中心）時列放回原位，都跟改之前一樣。
6) 拿同一個錄影腳本跑 build 20、a1b57b1、HEAD 和修正版，把每個版本的幀間隔放進 PR 說明。Instruments 的 Hitches 在拿起那 0.5 秒內不再有 hitch。

---

## J3

**把握度**：整體：主因的機制高（約 85%），程式碼都逐行確認過：1227 沒有 @ObservationIgnored、1366 讀整個字典、657／661 兩次寫入、放大時 `to` 一定是空的；縮小卡、放大不卡、兩次都卡這三點都對得上。不確定的地方：(1) 150ms 落在放手那幀還是 +330ms 換泡泡那幀，目前是推論，修之前要用 signpost 確認。不過兩幀都有 mergeTo 廣播，主修法都會壓低。(2) 單根 FoodPin 做一次沒有變化的重算要多少成本，取決於 MapKit 的 SwiftUI annotation 會不會因此重新量 size、重排 MKAnnotationView，所以 150ms 有多少來自廣播要量了才知道，預期大部分是。(3) 後面幾幀 35–52ms 有一部分是飛行 spring、泡泡建立和彈出、MapKit 建 annotation view 的每幀成本，主修法只能消掉第二次廣播那一塊，信心中等，可能還要做第 3 步。(4) 縮小後新進畫面的小泡泡「建了馬上丟」有沒有落在 150ms 那幀，還沒驗證。

**摘要**：J3（台北收藏密集處雙指縮小放手後，1 幀 150ms＋幾幀 35–52ms，放大不會）的主因可信度高：PinState.mergeTo 是被觀察的整個字典（MapTab.swift:1227），每根 FoodPin.body 都讀它（1366）。縮小跨過 2 倍時，recluster 會在放手那幀寫 `pins.mergeTo = to`（657），+330ms 再寫一次 `pins.mergeTo = [:]`（661）。兩次寫入都讓畫面上全部 N 根圖釘（各自一個 hosting view）重算 body、重新排版，真正要飛的只有 k 根。放大不卡的原因：格子是 2 的冪次而且一層包一層，放大時 `to` 一定是空的，走 651–652 一次換完，不會碰 mergeTo。主修法是把 mergeTo 拆成每根圖釘一個 @Observable 小盒子（PinMerge），寫入時只有 k 根失效，動畫完全不變。順便補一個既有 bug：649 行 cancel 之後沒清 mergeTo，會讓圖釘卡在透明或偏移的位置。還不確定兩件事：150ms 是落在放手那幀還是 +330ms 換泡泡那幀，要用 signpost 對時間軸；後面那幾幀 35–52ms 有一部分是飛行和泡泡彈出時每幀都要付的成本，主修法不一定能全部消掉。附近面板白算、proxy.convert、aside() 經懷疑者確認都很小，或兩個方向都有，不放進 J3 主修。

### 根因
- 【主因，高】PinState.mergeTo 每寫一次，所有圖釘都要重算。MapTab.swift:1227 `var mergeTo: [String: CGSize] = [:]` 沒有 @ObservationIgnored；FoodPin.body 第 1366 行 `let merge = on ? nil : pins.mergeTo[place.id]` 讓每根 FoodPin 都觀察整個 mergeTo 屬性（Observation 只追到屬性，不追到 key）。整個專案只有 657、661、1366 三處用到 mergeTo。時間點：放手後鏡頭停下，onMapCameraChange 的結束回呼（160–166）同步呼叫 recluster。縮小跨過 2 倍時 cell 變成 2 倍（602），原本單獨顯示的圖釘被併進大格，`to` 不是空的，走 653–662：657 行 `pins.mergeTo = to`，畫面上 N 根 FoodPin 的 hosting view 同一幀全部重算 body＋layout（Button＋PinPress＋LongPress＋background／overlay＋3 個 .animation），實際上只有 k 根要動。330ms 後的 Task（661）寫 `pins.mergeTo = [:]`，剩下的 N−k 根又全部重算一次。縮小後看到的範圍約是原本的 4 倍，所以這時 N 正好最大。放大時格子會拆開，`to` 一定是空的（651–652），mergeTo 一次都沒寫過，這解釋了只有縮小會卡、兩次都卡（兩次都跨過了 2 倍）。
- 【既有 bug，修主因時一定要一起處理，高】recluster 第 649 行 `clusterTask?.cancel()` 之後，如果走 `to.isEmpty` 那條（651），或 595 行 dropping 那條，mergeTo 不會被清掉。例如縮小後 330ms 內又放大，或同步回來的資料讓 182 行 `onChange(of: list.map(\.id))` 觸發 recluster，上一輪要合併的圖釘就會一直停在偏移位置、透明度 0。改成盒子後如果沒補，這個 bug 會更持久，因為盒子會留著，圖釘重新建立時還是透明的。
- 【加重，中，時間軸未確認】後面幾幀 35–52ms 是連續好幾幀，不是一個 tick 造成的，所以有一部分是每幀都要付的成本：0–330ms 這段 k 根圖釘各自在 hosting view 跑 offset／opacity spring（1412–1414）；+330ms 那一幀拿掉 k 個 Annotation、新建 m 顆 ClusterBubble 的 hosting view，加上第二次 mergeTo 廣播（第一條）；之後 m 顆泡泡同時跑 onAppear 彈出 spring（約 1720–1723）；縮小時 MapKit 還要替多出來的 3/4 範圍分批建 annotation view。其中新進畫面的舊小泡泡，可能在放手那幀就被 656 行的 clusters.filter 拿掉，等於建了馬上丟。主修法只能消掉這裡面的第二次廣播。
- 【小，兩個方向都有，不是 J3 差異的來源】放手那幀 163 行 `shownRegion = c.region`，加上 recluster 寫 hidden／clusters（@State，25–26），MapTab body 會整個重算：Nearby 排序（763–795）、NearbySheet、ForEach(list.filter{!hidden})（79）全部 diff 一次。+330ms 那次 Nearby 是白算。recluster 對全部收藏做 proxy.convert（606–608）。aside() 在非行程模式 marks 是空的，617 行就 return，與 J3 無關。放大時也全部會跑，卻不卡，可見只有幾 ms。

### 修法步驟
第 0 步，先量時間軸再改（臨時程式碼，不 commit）：a1b57b1 已經有 `Perf.signposter`（Perf.swift:11），但沒有 Perf.count。在 MapTab.swift recluster 的 653–662 分支裡，657 行前後包 `let s = Perf.signposter.beginInterval("recluster-merge")`／`endInterval`；Task 裡 661 那一行前後包 `"cluster-swap"`。FoodPin.body 開頭加一個計數，例如 `let _ = PinCount.bump()`（`enum PinCount { @MainActor static var n = 0; static func bump() { n += 1 } }`）。recluster 開頭和 Task swap 結束時，用 os_log 印出 n 和差值。用 Instruments（SwiftUI＋os_signpost＋Time Profiler）錄一次縮小，確認 150ms 那幀是落在 recluster-merge 還是 cluster-swap 的區間，並記下改之前每波的 FoodPin body 次數（預期約 N 和 N−k）。

第 1 步，主修，只改 MapTab.swift。在 PinState（1218 行起）附近新增 `@MainActor @Observable final class PinMerge { var to: CGSize? }`。PinState 刪掉 1227 行的 `var mergeTo`，改成：`@ObservationIgnored private var mergeBoxes: [String: PinMerge] = [:]`、`@ObservationIgnored private var merging: Set<String> = []`、`func mergeBox(_ id: String) -> PinMerge { if let b = mergeBoxes[id] { return b }; let b = PinMerge(); mergeBoxes[id] = b; return b }`、`func setMerge(_ to: [String: CGSize]) { for id in merging where to[id] == nil { mergeBoxes[id]?.to = nil }; for (id, v) in to { let b = mergeBox(id); if b.to != v { b.to = v } }; merging = Set(to.keys) }`。mergeBoxes 一定要維持 @ObservationIgnored，不然又會變成全體廣播。

第 1 步（續）：FoodPin 加一個 stored property `let mb: PinMerge`，在 init（約 1351 行）裡寫 `self.mb = pins.mergeBox(place.id)`。body 第 1366 行改成 `let merge = on ? nil : mb.to`。1412–1414 行的 offset、opacity、`.animation(value: merge)` 一個字都不動。recluster 第 657 行改成 `pins.setMerge(to)`，第 661 行改成 `pins.setMerge([:])`。改完 grep 確認已經沒有任何 `mergeTo`。

第 2 步，一定要做，補 cancel 漏清：recluster 第 649 行 `clusterTask?.cancel()` 之後的 `if to.isEmpty {` 分支（651）裡加 `pins.setMerge([:])`，放在 `hidden = nextHidden; clusters = next` 前面或同一行。第 595 行 dropping 分支的 cancel 後面也加 `pins.setMerge([:])`。這樣上一輪被取消時，飛到一半的圖釘會用同一個 spring 回到原位、恢復不透明。653 那條路不用另外處理，setMerge(to) 本身就會清掉上一輪留下的。

第 3 步，選做，依第 0 步的結果決定：如果改完以後 cluster-swap 區間仍然有 ≥35ms 的幀，再查 ClusterBubble（約 1690–1726）的建立和彈出成本，以及 656 行讓舊泡泡在放手那幀先消失的問題。把 656 行改成第一階段不動 clusters、讓舊泡泡留到 330ms 再一起換，會改到外觀（同時也修掉成員有 0.33 秒看不到的空白），要先問 Anthony。.shadow 移到 Capsule 背景會讓數字和 emoji 少了陰影，不能說外觀不變；要試的話先用 `.compositingGroup()` 比對外觀，而且要有 Instruments 證據才做。

第 4 步，順手、低風險，可以另開一個 PR：`pins.hops`（1223，每根 FoodPin 都在 1369 讀）是同樣的全體廣播寫法，focus()（684）和抽一間（321、416）每 +1 一次，所有圖釘都會重算。照第 1 步的方式改成每根一個小盒子（例如 `PinHop { var n = 0 }`），讀的時候在 FoodPin 抓自己的盒子，`.onChange(of: hop)` 的行為不變。這不是 J3 的成因，如果要和 J3 一起量，修完 J3 再做，以免混在一起。

不建議綁進 J3 的：把 5b5355c 的 SeenBox／NearbyHost 移植過來。那是一個大 commit，只挑一部分移植容易衝突；NearbyHost 的 == 也會讓閉包抓到的 gname、dropKey 不更新。對 J3 的效益很小（兩個方向都有，而且寫 hidden／clusters 時 MapTab 照樣會重算）。另外，只轉 from／to 要用的 id 再做 proxy.convert（606–608）沒有風險，但效益是噪音等級，要做可以放在最後。

### 不要動
不能動的：(1) 合併的飛行動畫。要併進泡泡的圖釘一樣用 to 位移、淡出，用同一個 spring（response 0.35、damping 0.85；減少動態時 easeOut 0.2），330ms（減少動態時 200ms）後才換成泡泡，泡泡照樣彈出（約 1720–1723 不動）。不要縮短、不要拿掉，也不要改成直接換。(2) 放大時拆出來的圖釘從泡泡飛回原位：flyFrom 已經是 @ObservationIgnored，不要動。(3) 選到的那根、抽中但被篩掉的那根（extra）、行程模式搜到的（keep）都不合併。(4) 放手那幀就要開始飛，k 根的 spring 要在那一幀起跑，不能為了省這一幀延後到下一個 runloop 或加 debounce，這違反使用者的「按下那一幀就開始動」標準。(5) 不要把被併掉的圖釘留在地圖上設成 opacity 0 來省掉建立 view 的成本：MapKit 照樣要替它們排版，還有點擊判定的問題。(6) 已知的坑：Annotation 內容不會跟著 MapTab 重畫，圖釘外觀一定要從 @Observable 讀（盒子就是這麼做的，不要改成從 MapTab 傳值進去）；不要改 Map 的 safe area 或大小（整張地圖會重排約 0.5 秒）；PinState 的 mergeBoxes／merging 一定要 @ObservationIgnored。TripMode.shared、MapPanel.shared、TripStore.shared 都是 @Observable 單例，不要在 recluster 裡多寫它們。(7) 656 行「舊泡泡留到 330ms」和移動 .shadow 都會改到外觀，沒有 Anthony 同意不要做。

### 模擬器驗證
環境：Mac，Release 設定，iPhone 17 模擬器；同時開 `xcrun simctl io booted recordVideo` 錄影，照原本的方法算幀間隔，≥25ms 算掉幀。手勢：地圖拉到台北大安、信義這類收藏密集的地方，放大到大部分是單根圖釘；用 Option+拖曳雙指縮小約 2.5–3 倍（一定要跨過 2 的冪次）再放手，重複 3 次。改之前先照 fix 第 0 步錄好基準：FoodPin body 計數兩波各約 N 和 N−k，並用 signpost 確定 150ms 那幀落在哪個區間。修好的標準：(a) 計數：recluster-merge 和 cluster-swap 兩波都只跳約 k（被合併的根數），不再是約 N。這是主修有沒有生效最可靠的指標。(b) 錄影：放手那幀從約 150ms 降到 <25ms（如果第 0 步證明 150ms 在 cluster-swap，就改看那一幀），而且放手那一幀圖釘就開始往泡泡飛。(c) 後面 35–52ms 那幾幀應該明顯減少；但飛行和泡泡彈出每幀的成本還在，不一定全部 <25ms。如果還有，用 Instruments 看是 ClusterBubble 建立還是 MapKit 建 annotation view，再決定要不要做第 3 步，不能直接算修失敗。回歸檢查：放大照樣 0 掉幀，拆出來的圖釘從泡泡飛回；縮小時圖釘先飛進泡泡、淡掉，0.33 秒後泡泡出現並彈一下；先選一根圖釘再縮小，它不會被併進泡泡；開「減少動態」再縮小一次，0.2 秒淡出；縮小放手後 330ms 內馬上放大，以及縮小時剛好觸發同步（list 改變），兩種情況都要確認沒有圖釘卡在透明或偏移的位置（這是驗證第 2 步）；行程模式縮小一次，泡泡推開站號、灰色 +N 都正常。

---

## J4

**把握度**：中等。有把握的部分：settle 鏈在行程模式做的是浪費的重工作（shownRegion 讓 MapTab、NearbySheet、TripPanel 重算），afterFit 只看緯度導致只平移的修正和第二次 settle，settle #1 用未修正的鏡頭拆泡泡、大量建 annotation 加 spring。這些都已逐行核對 build 22 的原始碼（MapTab.swift 160–166、592–665，TripPanel.swift 830–878，TripMode.swift 62），修法也不改使用者看到的行為。

不確定的地方：(1) 時間點對不上。照程式算 settle 鏈在 0.7–1.5 秒內結束，量到的是約 3 秒，可能是模擬器延遲，也可能真兇是算路回來（候選 A）、trips.load 寫入（候選 B）或 MapKit 圖磚繪製（候選 C），所以步驟 0 的 signpost 是必要的，不能跳過。(2) 步驟 2 不會減少拆圖釘和 arrive spring 的總工作量，只是讓它在最後的鏡頭上做一次。如果重幀主要來自這段，J4 會縮短但不一定完全消失。(3) 步驟 1 要用的地圖寬度（MapTab.mapWidth）是否等於實際框鏡頭的寬度，要實測 rho 確認。(4) 行程模式下 MapTab 重算時，MapPolyline 會不會讓 MKMapView 重新加 overlay，原始碼看不出來，要用 Instruments 確認。(5) .move(edge:.bottom) transition 期間 top0 量錯，可能是 afterFit 要修正的另一個原因，步驟 0 的 log 會看得到。

**摘要**：J4（進行程後約 3 秒連續 5–6 幀 100–195ms）的主嫌，是鏡頭停好時的回呼（MapTab.swift 160–166）。這個回呼在行程模式一樣做全套重工作，而 fitCoords 第一次框不準，afterFit 會再動一次鏡頭，所以整套跑兩輪。每輪的內容：第 163 行寫入 shownRegion（fit 不會設 selfMoved），讓 MapTab 整個 body 重算，包括 store.shown 篩選、Map 內容 diff、第 73 行重算 Nearby（篩選加距離排序）、只是 opacity 0 卻還掛著的 NearbySheet（MapCard 和照片重建），以及拿到新 Binding 快照的 TripPanel.content（stops 排序、TripMath.legs、TripCalc.plan，有 60 分以上空檔時還有 gapCount）。第 165 行在 settle #1 用「修正前」的鏡頭 recluster：從總覽拉近時泡泡大量拆開，同一幀新增幾十個 FoodPin annotation，每個各自跑 0.35 秒的 arrive spring，又剛好和 afterFit 的 0.3 秒 snappy 修正動畫疊在一起。afterFit 的修正幾乎都是「只平移」：TripPanel.swift 846 的 k 只用緯度帶算，東西向是限制時 MapKit 會再縮小（rho<1），中點偏離 winCenter 超過 6pt。離開行程時鏡頭不動，沒有 settle，所以順。

已被推翻的說法有兩個。一是 PinState.mergeTo 讓全部圖釘重畫是主因：從總覽拉近時，新的泡泡群一定是舊群的子集，to 為空，走 653 行直接寫入，不碰 mergeTo，也沒有 330ms 的第二次寫入。二是 settle #2 一定重組泡泡：只平移時 aside 換算回來的值不變，在 638 行的 guard 就 return 了。

還沒解釋的是時間點：照程式算，這串應該在點下後 0.7–1.5 秒結束，量到的卻是約 3 秒。所以修正前要先打 signpost，對照另外三個候選：trips.load 的伺服器回應、TripRouter 算路回來、MapKit 新縮放層的圖磚和標籤繪製（render hitch，改 App 程式碼消不掉）。

### 根因
- 【根因 1，影響最大，成立】行程模式下每次鏡頭停好，都在 MapTab.swift 163 寫 shownRegion = c.region，因為框圖的 fit 不會設 selfMoved（只有 519、689 會設）。body 第 68、73 行讀它，所以 MapTab 整個重算：store.shown、withExtra、pins.track、Map 內所有 Annotation 和 2×segs 條 MapPolyline 的 diff、Nearby（篩選整份收藏再用 CLLocation 排序）。NearbySheet（249–317）在行程模式只是 opacity 0、高 0，還掛在畫面上，又因為拿到新的 AnyView 和新的 Nearby 一定重算，鏡頭從總覽縮進行程區時名單幾乎全換，LazyHStack 的 MapCard／PhotoView 會重建（highUsed 時 NearRow 也會）。TripPanel(tid:pos:$pos)（214 行，build 22 沒有 .equatable()）跟著拿到新 Binding，content(t) 整個重算（stops 篩選排序、TripMath.legs、TripCalc.plan；有 ≥60 分空檔的列，409 行還會跑 gapCount，等於全部收藏 × 每段最多 300 點）。這些在行程模式下使用者都看不到，純屬浪費，而且每個 settle 跑一次。
- 【根因 2，放大器，成立】afterFit 讓 settle 鏈跑兩輪。TripPanel.swift 846 的 `k = band/latR` 只看緯度，經度只給 lngR*1.4。東西向的行程或比較窄的螢幕，經度才是限制，MapKit 為了放下兩個 span 會再縮小（rho<1），站的中點偏離 winCenter 約 (winCenter−畫面中線)×(1−rho)，常超過 6pt。於是 afterFit（859–878）在 settle #1 裡（MapTab.swift 162）用 snappy 0.3 秒發出只平移的修正（z=max(1,rho)=1），一定還會有 settle #2，根因 1 又跑一輪。a1b57b1 把 afterFit 搬進 onEnd，修正動畫的起點因此和 settle #1 的重工作落在同一幀。南北向的行程 rho≈1，可能不會修正，要用 log 確認。
- 【根因 3，成立，這一段可能最重】settle #1 時 recluster（MapTab.swift 592–665）用的是還沒修正的鏡頭。從總覽拉近時，604 行的格子會跨好幾個 2 倍，泡泡大量拆開，653 行同一幀寫入 hidden／clusters。ForEach(list.filter{!hidden})（79–85）一次新增幾十個 FoodPin Annotation，每個要建 MKAnnotationView 加 hosting view，onAppear 的 arrive() 還各跑 0.35 秒的 fly spring（1445 行）。幾十個 hosting view 同時逐幀動畫，又和 afterFit 的修正動畫重疊，比較可能是「連續好幾幀都慢」的來源。這份工作是使用者要的動畫，不能拿掉，只能讓它只做一次、而且在最後的鏡頭上做。另外，進行程那一幀 tripHidden 把站從 list 拿掉，172 行的 onChange(of: list.map(\.id)) 會先在總覽縮放下 recluster 一次，GonePin 要等 settle #1 的 MapTab 重算才會拿掉，這也會疊進 settle #1。
- 【待排除候選 A，機制成立，是否發生未證實】TripRouter 算路回來。TripPanel.swift 171 逐段送 MKDirections，每段間隔 150ms。TripRouter.swift 72（大眾運輸失敗時是 82）在 withAnimation(.easeInOut 0.35) 裡寫 legs（單一個 Dictionary，所有讀它的 view 都會失效），TripPanel 的 pubKey（130–134）重寫 mode.segs／marks／summary，MapTab 重算。TripTop 的 routeKey（82–90，裡面有 routed 數）變了，44–48 在主執行緒同步跑 measure（store.places × 每段最多 300 點），寫 search.near 後 TripTop 再重算一次。只有某段路沒有快取（legs.json 沒有，或起點是目前位置、步行或開車失敗只記在記憶體）才會發生，時間落在 1–3 秒，很符合「約 3 秒」。
- 【待排除候選 B，未證實】TripPanel.swift 52–53 的 .task(id: tid) { await trips.load() }：每次進行程都打一次伺服器，回來大約 1–3 秒。如果資料真的不一樣（例如 updated_at 變了），會在 withAnimation(.easeOut 0.3) 裡寫 trips／stops（Trip.swift 359–363），MapTab（tripHidden）、TripPanel、TripTop（routeKey 變了會再跑 measure）全部重算；place_id 有變還會觸發 172 行的 recluster。
- 【待排除候選 C，未證實，可能修不到】MapKit 自己的圖磚和道路標籤繪製。從總覽拉近、鏡頭停好後 1–2 秒，會載入並繪製新縮放層，錄影算到的幀間隔也包含 render server 卡住的時間。「進卡出順」同樣符合這個假說。如果 Instruments 判定是 render hitch 而不是 commit hitch，改 App 程式碼消不掉。

### 修法步驟
步驟 0（先做，不改行為）打 signpost 找出約 3 秒那幾幀前面是什麼事件。用 Perf.signposter.emitEvent("j4", ...) 打在以下位置：MapTab.swift 160 onEnd 開頭（"settle"）；162 afterFit 執行後（附 rho、yMid−winCenter、有沒有修正）；recluster 653 行和 655 行真的寫入時（附新增和移除的 annotation 數）；TripRouter.swift 72、82 寫 legs 時；TripTop.swift 47 measure 前後（beginInterval/endInterval）；Trip.swift 359–363 trips.load 真的寫入時；TripPanel.fitCoords 開頭（附 top0、barBottom、mapTop、mapBottom，順便查 .move(edge:.bottom) transition 期間 top0 是否量到移動中的位置）。用 Instruments 的 Points of Interest 加 Animation Hitches（加 SwiftUI 模板）錄 Release 模擬器，分清楚每個重幀是 commit hitch 還是 render hitch，以及它接在哪個事件後面。下面的步驟 1–3 不管結果如何都值得做；步驟 4 只在對應的 signpost 證實時才做。

步驟 1（讓 afterFit 平常不必修正，消掉第二輪 settle）。在 TripPanel.swift fitCoords（835–852）把經度限制算進 k：先把 `let mid = (lats.max()! + lats.min()!) / 2` 移到算 k 之前，加上 `let w = Double(MapTab.mapWidth)`（必須是地圖實際框鏡頭的寬度）、`let kLng = w / (lngR * 1.4) / cos(mid * .pi / 180)`，再把 `let k = Double(band) / latR` 改成 `let k = min(Double(band) / latR, kLng)`。後面的 full、center、winCenter，以及 afterFit 閉包裡的 rho = kAct / k，全部沿用這個 k。span 的 longitudeDelta 照舊用 lngR*1.4。afterFit 留著當保險，處理 rho>1（點圖釘那條 1.37 倍的路）和其他偏差。

步驟 2（afterFit 決定修正時，這次 settle 不做重工作）。TripMode.swift 62 改成 `@ObservationIgnored var afterFit: (() -> Bool)?`。TripPanel.swift 859–878 閉包裡每個 `guard ... else { return }` 改成 `return false`，結尾什麼都沒做的 guard（872）也是 false，877 的 withAnimation 之後 `return true`。MapTab.swift 160–166 改成：先 `trip.toScreen = ...`，接著 `store.mapRegion = c.region`（一定要在 return 之前，每次都更新），然後 `if let f = trip.afterFit { trip.afterFit = nil; if f() { scheduleSettleFallback(proxy); return } }`，最後才是原本的 shownRegion 和 recluster。scheduleSettleFallback 是保險：在 MapTab 加一個 @State 的 `settleTask: Task<Void, Never>?`，修正時啟動 `Task { try? await Task.sleep(for: .milliseconds(600)); guard !Task.isCancelled else { return }; recluster(proxy) }`；onEnd 一開頭先 `settleTask?.cancel()`。這樣即使修正沒有再觸發 onEnd（r2 幾乎沒動、被別的 pos 打斷），泡泡也不會停在總覽縮放下算出的狀態。

步驟 3（行程模式不寫 shownRegion，也不重建看不到的 NearbySheet）。優先 cherry-pick 5b5355c 的 SeenBox(publish: !trip.on) 和 NearbyHost，讓 settle 時不重建 MapTab、行程模式時不更新附近，連帶 TripPanel 不會因為新的 Binding 快照而重算。沒辦法 cherry-pick 的話，就手寫同樣的結構：把 shownRegion 和 Nearby 的計算移到一個只包住 NearbySheet 的子 view（NearbyHost），由一個 @Observable 小盒子（SeenBox）存目前範圍；onEnd 只在 `!trip.on` 時寫入盒子，MapTab body 不再讀 shownRegion（recluster、drawCtx、focus、picked 改讀 store.mapRegion）。離開行程時讓 NearbyHost 自己在 trip.on 變成 false 時用 store.mapRegion 補算。不要用「MapTab 外層加 .onChange(of: trip.on) 寫 shownRegion」的做法，那會在離開那一幀之後多一次 MapTab 重算，正好撞上 NearbySheet 淡入，離開行程可能變卡。同時把 MapTab.swift 214 改成 `TripPanel(tid: tid, pos: $pos).equatable()`，加上 `extension TripPanel: Equatable { nonisolated static func == (a: Self, b: Self) -> Bool { a.tid == b.tid } }`。TripPanel 需要的資料都是自己從 @Observable 讀的，閉包裡讀 pos 走的是 Binding 的 location，afterFit 不受影響。

步驟 4a（只有 signpost 證實算路回來時有重幀才做）。不要拿掉 withAnimation，也不要整批延後發布。改法：TripTop.swift 44 的 `.task(id: routeKey(t))` 開頭加 `try? await Task.sleep(for: .milliseconds(300)); guard !Task.isCancelled else { return }`。.task(id:) 換 key 時會自動取消前一個，所以每 150ms 回來一段的連續更新只會在最後跑一次 measure。如果 measure 本身超過 16ms，再把計算（places × 路線點的 RouteNear.meters）搬到 `Task.detached` 傳值型別進去，算完回 MainActor 才寫 search.near。

步驟 4b（只有 signpost 證實 trips.load 在約 3 秒寫入時才做）。在 Trip.swift 359–363 寫入 trips／stops 前比對內容，只有站或欄位真的變了才寫（例如比 updated_at 加 stops 的 id、順序、place_id），寫入時保留原本的 withAnimation。

步驟 4c（只有 Instruments 判定約 3 秒的重幀是 render hitch、而且前面沒有 App 事件時）：這是 MapKit 圖磚和標籤繪製，App 端沒有不改行為的修法。回報時把它標成「量測噪音或 MapKit 本身」，對照組照下面 sim_check 第 3 點做，不要為了它改程式碼。

### 不要動
不要改的行為：按下「行程」那一幀面板從下方彈出、TripTop 淡入、鏡頭開始 0.5 秒 easeInOut 框圖；從店家頁進行程時飛到那站；框圖結果要讓最北的圖釘在 🔍／膠囊那排下面，最南的站號在面板上方；afterFit 保險要留著（點圖釘那條 1.37 倍的路要靠它）；泡泡拆開時的飛出動畫（arrive 0.35 秒 spring）、合起來時先飛過去 0.33 秒後換成泡泡、站號旁泡泡推開 50pt；其他收藏縮小變淡（dimAll）；路線從虛線變實線，時間和摘要 0.35 秒的 numericText 轉場（TripRouter 的 withAnimation 不能拿掉，也不要改成整批跑完才發布，限流時會晚好幾秒才看到路線）。

已知的坑：不要為了行程模式改 Map 的 safe area、padding 或 frame 大小（整張地圖重排約 0.5 秒）；圖釘外觀一定要從 PinState 這類 @Observable 讀，不能靠 MapTab 重畫傳值（Annotation 內容不會跟著重畫）；TripMode.shared／MapPanel.shared／TripStore.shared 是 @Observable 單例，新加只給閉包用的欄位要標 @ObservationIgnored，不然會變成新的全域失效來源。

不建議做的修法（懷疑者已推翻或效益接近零）：fitGain 學習 rho（不同行程形狀會學錯，而且只改 full 不改 k 和 center，會更偏）；把 recluster 637 行的 moved 改成比螢幕座標（只平移時本來就是 false，縮放變了照樣會重寫）；為 J4 做 PinFX／拆 mergeTo（J4 從總覽拉近時走不到 mergeTo，可以留給別的問題）。也不要用 maximum-scale 之類的方式擋縮放，不要把 shownRegion 的補算放在 MapTab 外層的 onChange(of: trip.on)。

### 模擬器驗證
Mac 上用 Release 模擬器（iPhone 17），改前改後條件相同：
1) 主要重現：App 剛啟動、地圖是框住全部收藏的總覽，按右下「行程」，連續錄三次，算點下後 0–4 秒的幀間隔。合格標準：按下那一幀面板就開始彈、鏡頭在同一或下一幀開始動；0–4 秒內沒有連續 ≥25ms 的幀，最多只允許鏡頭停好那一幀出現一個。
2) signpost 檢查（步驟 0 打的點）：改完後每次進行程應該只看到一次 settle，接著 recluster 寫入一次。afterFit 在東西向行程的 rho 應該介於 0.96–1.04，而且「修正」事件不出現；如果還出現，afterFit=true 那次 onEnd 後面不能有 recluster，要等下一次 settle（或 600ms 保險）才有。行程模式下 Nearby 或 NearbySheet 的重算次數為 0。SwiftUI 模板裡，settle 時 MapTab.body 和 TripPanel.content 不應再出現。
3) 對照組，判斷剩下的重幀是誰：(a) 先手動把地圖拉到行程那區（泡泡已拆開）再按「行程」，如果 A 卡、B 不卡，就是 recluster 拆圖釘那段，確認它只在最後的 settle 跑一次；(b) 從 `xcrun simctl get_app_container booted <bundle id> data` 找到 Library/Caches/legs.json，比較刪掉再開和保留兩種情況，只有刪掉才卡就做步驟 4a；(c) 在一般地圖用泡泡 zoom() 或定位鈕做同樣幅度的拉近，如果停好後 1–2 秒也有一樣的連續重幀，而且 Animation Hitches 顯示是 render hitch，就是 MapKit 圖磚繪製，不算 App 的問題。
4) 框圖形狀回歸：東西向拉長、南北向、只有一站、沒有站（框目前位置）四種行程，最北圖釘不能被 🔍 那排蓋住、最南站號不能被面板蓋住；在行程模式點一根收藏圖釘，加站卡框圖正確，必要時 afterFit 仍修正一次。
5) 其他回歸：按「完成」離開行程，錄影不能有 ≥25ms 的幀，「附近 N 間」的名單和數字符合目前範圍；一般地圖縮放跨過泡泡門檻時，拆開、合起來的飛行動畫還在；路線虛線變實線和摘要轉場還在。

---

## J5

**把握度**：整體中高。主因（if/else 讓 panel 在關閉那一幀從零重建）把握高：程式結構很明確，兩位診斷者和懷疑者都確認，也是唯一能解釋開順、關卡不對稱的成因；我也確認了 HEAD 的 TripPanel.swift 101-111 還是同樣的 if/else。focus() 連鎖把握中等：程式路徑已經確認（HEAD MapTab.swift 993-998 的 .task(id: scrolled) 和 681 的 focus），但要先在一般地圖滑過卡片列才會觸發，量測時這個條件可能有、也可能沒有。不確定的地方：(1) J5 是在 a1b57b1 量的，HEAD 的 5b5355c 已經修掉拖曳每幀重算和 TripPanel 被 diff 3 次，87ms 在 HEAD 上可能已經變小，剩多少要重量才知道；(2) panel 一直掛著之後，打開加站卡那幾幀要 diff 整個 panel，有可能讓原本順的打開變重，一定要量；(3) MapTab 兩輪和 FoodPin×N 在 HEAD 上還剩多少成本，要用 Perf.shared.count 確認後才決定步驟 5、6 要不要做；(4) HEAD 的 LiftOffset 在關卡時會不會讓淡出中的卡片往上彈，是從程式推出來的，要在模擬器實際看；(5) 步驟 2 裡新卡的 cardLift 要怎麼歸零，要選一種寫法再驗證；(6) 模擬器的絕對數值有偏差，只有前後相對變化可信。

**摘要**：J5（行程模式往下拖關掉加站卡，放手後一幀 87ms、開頭 0.4 秒約 30fps）的主因：TripPanel.content 的 core ZStack 用 if/else 在加站卡和行程面板之間二選一。打開加站卡時 panel 整棵被拿掉，關卡時 mode.cand = nil 讓分支換回 panel，放手那一幀就要從零建出整塊面板：ScrollView、非 Lazy VStack 裡每站的 LegRow／SwipeToDelete／StopCard／PhotoView、Menu、ChunkyStyle 按鈕，還有中文字第一次排版。打開時只建一張小卡，所以開順、關卡，兩邊不對稱。同一幀還疊著開關都有的共同成本：MapTab 因為 cand、cleared、preview 被改而重算兩輪，FoodPin×N 讀 pins.sel 一起跑 0.25 秒透明度動畫，隱藏的 NearbySheet 把 PickedCard 換回卡片列。另外有一個只在關閉時發生、兩位診斷者都漏掉的連鎖：新建的卡片列帶 .task(id: scrolled)，250ms 後會呼叫 focus()，讓 pins.hops 加 1（所有 FoodPin 重算、一根圖釘跳一下），還可能讓地圖平移 0.45 秒。「地圖重新框住這天的站」不是原因，fit() 在關卡時不會跑。重要前提：分支在 a1b57b1 之後的 5b5355c 已經把拖曳每幀重算（cardPull 改成 Lift/LiftOffset）和 TripPanel 少了 .equatable() 這兩點修掉了，但 if/else 拆掉 panel 的寫法在 HEAD（bc0bc20）仍在（TripPanel.swift 101-111）。所以修正要在 HEAD 上做，並先用 HEAD 的 build 重量一次 J5 當基準。

### 根因
- 【主因，關閉才有，就是 87ms 那一幀】TripPanel.swift core ZStack（a1b57b1 是 95-107 行；HEAD 是 101-111 行）寫成 `if mode.going {…} else if let c = mode.cand { addCard… } else { panel(…).transition(.move(edge: .bottom)) }`。往下拖放手時，onEnded（HEAD 697-700）呼叫 cancelCand()（HEAD 737-740），在 withAnimation(.spring(0.35)) 裡寫 mode.cand = nil，下一次更新（就是放手後第一幀）分支換回 panel，panel 拿到新的 identity，從零重建：head/startChip（Menu，又跑一次 trips.stops filter 和 TripMath.origin）、ScrollViewReader＋新的 UIScrollView、rows() 的非 Lazy VStack 裡每站一個 block（LegRow 帶交通方式按鈕加 PressStyle、gapHint、SwipeToDelete（DragGesture 加 onGeometryChange）、StopCard（store.place 線性搜尋、NumberDonut、PhotoView 查 NSCache，每張還開一個 .task）），level 是 low 時建的是 cards()；最後是 actions 的 ChunkyStyle 按鈕和所有中文字第一次排版。打開時 panel 只是被移除，靠 transition 凍結著播完，只需要建一張小卡，所以開順、關卡。在 a1b57b1，MapTab 用的是 `TripPanel(tid:pos:$pos)`，沒有 .equatable()，關卡那一幀 TripPanel.body 會跑大約 3 次，把剛建好的 panel diff 3 次；HEAD 的 MapTab 217 行已經加了 .equatable()，這個倍數在 HEAD 已經消失，但從零重建本身還在。註：每列 .onGeometryChange 寫進 mode.geo.rows 不會引發重算（geo 是 @ObservationIgnored 的 RowGeo），不是成本來源。
- 【只在關閉時發生、兩位診斷者都漏掉的 250ms 後連鎖】行程模式下 NearbySheet 只是 opacity 0 加 frame 高度 0，仍然掛著。關卡時 pins.select(nil) 讓 sel 變 nil，NearbySheet.body 裡 `let picked = pins.sel.flatMap…`（a1b57b1 834 行，HEAD 879 行）把 PickedCard 換回 titleRow 加新建的橫向 ScrollView/LazyHStack/MapCard。這個新 ScrollView 帶著 `.task(id: scrolled)`（HEAD MapTab.swift 993-998），只要使用者先前在一般地圖滑過卡片列（scrolled 不是 nil），而且 scrolled 不等於 skip（行程模式走的是 pins.select(nil)，不會設 skip），250ms 後就會呼叫 focus(id)（HEAD 681-693）。focus 會做三件事：用 currentList 再篩一次；`pins.hops[id] += 1`，hops 字典被觀察，所有 FoodPin 重算，那根圖釘在行程模式裡跳一下；那間不在畫面中央時，在 withAnimation(.smooth(0.45)) 裡寫 pos，地圖平移 0.45 秒，接著 recluster，MapTab 再重算。打開時這個 ScrollView 是被拿掉，不會觸發，所以是關閉才有的成本，時間點落在開頭 0.4 秒內。使用者感覺到的「地圖重新框住」很可能就是這個平移。另外 midH 的 spring(0.45) 只有在 MapPanel.shared.stage == .mid 時才會讓這塊看不見的區域每幀重新排版。
- 【開關都有的共同底成本，疊在同一幀和之後 0.25-0.6 秒】cand=nil 先讓 MapTab 重算第 1 輪：body 讀了 trip.cand（a1b57b1 123、129、136 行）和 .onChange(of: trip.cand?.id)（199 行）。接著 onChange 裡的 pins.select(nil) 讓 cleared += 1（HEAD 1364 行），MapTab 讀了 pins.cleared（HEAD 74 行）；TripPanel 的 onChange(candKey)→placeCand（HEAD 590 起）又清掉 preview、previewN。這兩件事合起來讓 MapTab 跑第 2 輪：store.shown、tripHidden 的 filter/sort、pins.arm/track、約 76 個 Annotation 的 diff。FoodPin 讀 pins.sel（HEAD 1433 行 faded），N 根各自重算，各跑 0.25 秒的 .snappy 透明度動畫（行程模式下是 0.5↔0.6）。打開時同樣是兩輪（placeCand 也會寫 preview 和 pos），所以這是對稱成本，不是開關不對稱的來源，但它先吃掉關閉那一幀的一大塊預算。HEAD 的 5b5355c 已經讓 Nearby 只在可見區域變時才重算，這部分在 HEAD 上可能已經變輕，要用 Perf.shared.count 確認。
- 【a1b57b1 有、HEAD 已修，不要重做】拖曳期間 cardPull 是 TripPanel 的 @State（a1b57b1 30 行），onChanged 每幀寫它，TripPanel.body 整個重跑（stops、TripMath.legs、TripCalc.plan、所有 onChange key、TripInsert.best）。5b5355c 已經改成 @Observable 的 Lift 加 LiftOffset（PanelLift.swift，TripPanel.swift HEAD 23、694-700 行）。HEAD 上還有一個殘留風險：onEnded 在 cancelCand() 之後一律執行 `withAnimation { cardLift.y = 0 }`，而 LiftOffset 自己透過 Observation 讀 lift.y，正在播 removal transition 的卡片可能被更新、往上彈。a1b57b1 沒有這個問題，HEAD 要實際看。

### 修法步驟
0. 基準：所有修改都在 origin/claude/project-thread-bai8ub 的 HEAD（bc0bc20）上做，不要在 a1b57b1 上做。先用 HEAD 的 Release build 在 iPhone 17 模擬器重量一次 J5，記下：當天站數、行程面板停在 low/mid/high、MapPanel.shared.stage（進行程模式前下面那塊停在哪一段）、進行程前有沒有在一般地圖滑過卡片列。後面每次量測都用同一組條件。

1.（主修，TripPanel.swift HEAD 101-111 的 core ZStack）加站卡開著時不要拿掉 panel，改成一直掛著，用 offset 藏到螢幕下面，加站卡疊在上面。going 分支照原樣，把 `else if let c = mode.cand {…} else { panel… }` 改成：
```swift
} else {
    let carding = mode.cand != nil
    panel(t, d: d, base: base, order: order, legs: legs, plan: plan)
        .offset(y: carding ? panelHeight() + 60 : 0)   // 用 +60 不用 +40：陰影半徑 14，底部 safe area 34
        .allowsHitTesting(!carding)
        .accessibilityHidden(carding)
        .transition(.move(edge: .bottom))               // 出發中切回來時照舊
    if let c = mode.cand {
        addCard(t, c, order: order)
            .id(c.id)
            .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
    }
}
```
cancelCand、picked、add、TripMode.blank 原本就包在 withAnimation(spring) 裡，offset 的變化會吃到同一個 transaction，所以面板從下面滑上來的曲線和時間都不變。放手那一幀只剩改一個 offset 值，不用重建 StopCard、LegRow、ScrollView。panelHeight() 在 HEAD 200 行已經有。另外要確認 panel 和加站卡在 ZStack 裡的順序（卡在上層），以及藏起來的 panel 不會影響 core 的大小（core 有 Color.clear，onChange(of: size) 不該被觸發，量的時候順便確認）。

2.（TripPanel.swift HEAD 697-700，加站卡手勢 onEnded）只有在沒有關卡時才回彈，避免正在淡出的卡片被 LiftOffset 更新、往上彈：
```swift
.onEnded { v in
    if cardLift.y > 80 || v.predictedEndTranslation.height > 200 { cancelCand() }
    else { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { cardLift.y = 0 } }
}
```
下一張卡要從 0 開始：在 cancelCand() 裡寫完 cand=nil 之後，用 `var tr = Transaction(); tr.disablesAnimations = true; withTransaction(tr) { cardLift.y = 0 }` 不帶動畫歸零也不行，因為被移除的卡還讀著它。比較穩的做法是在 addCard 的 `.onAppear` 裡（新卡有新的 .id(c.id)）先把 cardLift.y 設回 0，或把 cardLift 改成跟著 c.id 換新（例如 `.onChange(of: mode.cand?.id) { cardLift = Lift() }`，但只有在新值不是 nil 時才換）。改完要確認卡片停在放手的位置原地淡出。

3.（MapTab.swift HEAD 681，focus(_:)）函式開頭加 `guard !TripMode.shared.on else { return }`。行程模式下這塊卡片列本來就看不見，這樣隱藏的 NearbySheet 在關卡後 250ms 就不會讓 pins.hops 加 1（全部 FoodPin 重算、圖釘跳一下），也不會平移地圖。一般地圖的行為完全不變。

4.（MapTab.swift HEAD 879，NearbySheet.body）改成 `let picked = TripMode.shared.on ? nil : pins.sel.flatMap { id in list.first { $0.id == id } }`。行程模式下不再跟著選取建 PickedCard，或拆掉它、重建卡片列，也不會跑 midH 的 spring。這一步一定要和第 3 步一起做：不然從一般地圖選著某間時直接進行程，隱藏的 sheet 會換成新的卡片列，250ms 後就 focus。離開行程時如果 sel 還在，PickedCard 會出現，這要在模擬器看是否自然。

5.（量完 1-4 後才決定，可選）如果 Perf.shared.count 顯示關卡那一刻「地圖」還是算 2 輪，而且幀還超過 25ms，才考慮讓 cand=nil、pins.select(nil)、preview=nil 併成同一次更新。不要用 cand 的 didSet 一律觸發：TripMode.close() 和 startSearch() 也會寫 cand = nil，會讓離開行程和開始搜尋多出同步取消選取和一輪 MapTab。如果要做，只在 cancelCand() 和 TripMode.blank 這兩個「使用者關卡」的路徑，在同一個 withAnimation 裡一起寫 `mode.preview = nil; mode.previewN = nil; PinState 的 select(nil)`，並保留 MapTab onChange、SelWatcher、placeCand 原本的 guard 當保險。cleared 機制不能拿掉（Map 要靠它真的放掉選取）。

6.（不建議在 J5 裡做，要先問 Anthony）FoodPin 的 faded（HEAD 1433）在行程模式下的 0.5↔0.6 透明度動畫是開關對稱的成本，改它會改視覺，對開關不對稱的問題幫助有限。前面幾步量完還掉幀，再拿給 Anthony 看要不要改。

7. 交付前要跟 Anthony 說明兩個看得到的差別：(a) 開關加站卡後，面板清單的捲動位置和展開的那站會保留，不再回到頂端；(b) 按「加進行程」後，新的那一列會用 block 自己的 transition 長出來，同時面板滑上來，現在是整塊一起出現。不想要 (b) 的話，add() 那次插入可以用 Transaction 關掉 row 的 transition。

### 不要動
- 不要改掉使用者要的動畫：打開時加站卡從下面滑入並淡入、面板往下滑走；關閉時卡片原地淡出（removal: .opacity），面板用同一個 spring(0.35, 0.85) 從下面滑上來；拖卡時 minimumDistance 8、只往下跟手、超過 80pt 或預測超過 200pt 就關，否則用 spring(0.3, 0.85) 彈回。放手那一幀就要開始動，不能為了省工作把動畫延後或拆兩段。
- 不要用 if/else 或 `if !carding` 把 panel 拿掉再插回來，也不要用 .opacity(0) 加 .frame(height: 0) 去壓 panel 的大小：要收起來而不是拿掉，而且不能改 core 或 Map 的大小和 safe area（已知的坑：改 Map 的 safe area 或大小會讓整張地圖重排約 0.5 秒；行程模式下 headY、footY、mapRect 是凍結的，不要動）。
- 不要重做 5b5355c 已經做過的事（Lift/LiftOffset、TripPanel.equatable()、NearbyHost equatable），也不要把 cardLift 搬回 TripPanel 的 @State。
- 不要拿掉 pins.cleared 機制（Map 要靠它真的放掉選取，見 MapTab 裡的註解），也不要拿掉 SelWatcher 和 MapTab onChange(of: trip.cand?.id) 這兩道保險。
- 不要在 TripMode.cand 的 didSet 裡無條件取消選取，那會影響 close()、startSearch() 等路徑。
- 不要改 fit()、fitKey、fitCoords 的框鏡頭邏輯：關卡時本來就不框，打開時的框鏡頭（前一站、這間、下一站）要維持。
- Map Annotation 內容不會跟著 MapTab 重畫，圖釘外觀還是要從 PinState 讀，不要改成從 MapTab 傳參數。
- 不要動 going（出發中）分支和 goBottom/goCard。
- 不要用 maximum-scale 或關掉動畫來掩蓋問題；FoodPin 的透明度視覺沒問過 Anthony 前不要改。

### 模擬器驗證
都在 Mac 上用 HEAD（bc0bc20）加修改後的 Release build，iPhone 17 模擬器，同一份資料、同一個行程，當天至少 5 站而且有照片。分別在行程面板停 mid 和停 low 時量，並記下 MapPanel.stage。用 `xcrun simctl io booted recordVideo --codec h264` 錄影算幀間隔，≥25ms 算掉幀，每種情況 5 次取中位數，只看前後的相對變化。
1) 先量 HEAD 未修改的基準 J5（87ms 那一幀在 HEAD 可能已經變小，但要有數字），再依序套「步驟 1＋2」量一次、「再加 3＋4」量一次，才知道各自的貢獻。可以加模擬器專用的啟動參數（例如 -keepPanel、-noTripPicked）當開關，用同一個 build 做 A/B。
2) 修好的標準（關閉）：往下拖約 150pt 放手，放手後的第一幀卡片就開始淡出、面板就開始往上滑（不能晚一幀以上）；放手後 0.6 秒內沒有 ≥25ms 的幀（原本有 87ms 那一幀），開頭 0.4 秒回到穩定 60 或 120fps；拖曳中每幀 <25ms。
3) 打開也要量，不能變差：點收藏圖釘開卡，按下的那一幀就開始滑入，0.6 秒內沒有 ≥25ms 的幀。panel 一直掛著之後，打開那幾幀要 diff 整個 panel，這是主要風險。
4) 計數確認（-perfOverlay 的 HUD，Perf.shared.count）：在 cancelCand 開頭暫時加 `Perf.shared.mark("關加站卡")`，再暫時在 StopCard、LegRow、FoodPin 加 count。關卡那一刻預期：「行程面板」1 次，而且 StopCard、LegRow 不再整批重建（count 不跟站數一起跳）；「附近面板」在行程模式下不再因為關卡重算；放手後 250ms 沒有 focus（在 focus 開頭暫時加 mark 確認不再出現）。拖曳中「行程面板」應該是 0 次。「從放手到第一幀」的 mark 時間 ≤16ms，最好是一幀（120Hz 約 8ms）。
5) 主因的便宜佐證：同一個行程 0 站、3 站、8 站的三天各做 J5。修改前放手那一幀應該跟著站數變長；修改後應該跟站數無關。
6) 行為回歸（每項都要點過）：拖不到 80pt 放回會彈回；快速往下甩會關；關卡時卡片停在放手位置淡出，不會往上彈；✕、點地圖空白都會關；「加進行程」後面板升到 mid 並捲到新的那站；「看這站」會換天並飛過去；搜尋中點結果開卡再拖關，TripResults 會回來；卡片開著時點另一根圖針會換卡；關卡後再點同一根圖釘能重新打開（cleared 機制還在）；卡片開著時換天、按出發；面板在 low/mid/high 三段各開關一次，高度要維持原段；藏起來的面板點不到，VoiceOver 也讀不到；先在一般地圖滑過卡片列再進行程，開關加站卡，放手後 0.6 秒內沒有圖釘跳、地圖也不平移；離開行程後，一般地圖點圖釘的大卡片和卡片列滑動停下後的 focus 都正常；從一般地圖選著某間直接進行程，不能有圖釘跳或地圖平移。

---

## J6

**把握度**：整體信心中高。
• 放手 1–2 幀掉幀的部分（根因 1 加根因 2 的競態）信心高。時間點的推論和兩位診斷者、懷疑者都一致：dragging 變回 false 之後的第一輪，report() 就寫 mp.top 或 footY。原始碼（a1b57b1 1022–1051，bc0bc20 917、945、1085、1096）已經核對過。
• 不確定的地方：(1) 57–167ms 那一幀落在哪一格。如果在 R、R+1，就是第一次建清單；如果在升到頂附近，或同一次啟動出現不只一次，就還有沒找到的原因。這要靠修正步驟 5 逐格確認，所以這部分信心只有中等。(2) 往上甩到 high 時的放手掉幀，目前只能歸給 NearbySheet.body 加 tall 翻轉的底噪，Lift 之後還剩多少要實測。(3) holdUntil 0.45 秒是用 spring 參數估的，如果實測鏡頭動畫和量測重疊，可能要再調。(4) 非 settle 路徑的 scheduleReport 用 Task.yield，可能還在同一個 frame commit 前就跑，拖地圖降到最低段那條路徑可能仍會在同一幀重算 NearbyHost，不過這不在 J6 的範圍。(5) 預建的等待條件只能減少、不能完全避免和使用者操作撞在一起（例如使用者剛好在 1.5 秒後開始拖地圖），預建那一次本身仍是一筆 57–167ms 等級的同步建立。

**摘要**：J6（地圖首頁面板快甩，放手時掉 1–2 幀、第一次到最高段 1 幀 57–167ms）的根因有兩條。(1) 放手那一輪，onGeometryChange 裡的 report() 寫了 mp.top，或用舊值寫了 footY。MapTab.body 在第 73 行用 seen() 讀 MapPanel.shared.top，所以整頁 MapTab、Nearby 排序、Map 全部 Annotation 比對都塞進動畫的第一幀重算。兩個量測回呼的先後順序（probe.top 和 probe.foot 各自觸發 report）會先寫舊值、再寫回正確值，讓「回到同一個中段高度」這種本來不用付成本的放手也要多算一次。(2) 直的附近清單（high：ScrollView、LazyVStack、約 7 列 NearRow）是在第一次 settle 到 .high 的那一輪才當場建立。tall 用的是 model 終點值，所以清單在放手那一幀翻成 true 並同步建好，下一輪 onAppear 寫 highUsed 再讓 body 多跑一次。分支最新 bc0bc20（含 5b5355c）已經有 NearbyHost/SeenBox（mp.top 改變不再重算 MapTab）、Lift（拖曳時只重畫套高度那層）、tallPull、閒置 1.5 秒預建，但 report() 還留在放手幀的兩個幾何回呼裡（bc0bc20 MapTab.swift 917、945、1085、1096–1100），NearRow 也還是 px 200（1164）。修正計畫以 bc0bc20 為底：把 report() 合併、延到彈簧停好再跑；預建要等地圖也閒下來；NearRow 照片和 MapCard 共用快取。settle 和所有動畫參數都不動，面板一樣在放手那一幀開始動。57–167ms 那一幀到底落在放手幀還是升到頂附近，靜態分析定不下來，要先逐格標記確認。

### 根因
- 【影響最大／放手 1–2 幀 33–48ms】放手那一輪就寫 mp.top，整頁 MapTab 重算。a1b57b1 的 MapTab.swift settle（1022–1037）先把 mp.dragging 設成 false，再在 withAnimation 裡改 mp.stage 和 pull。版面直接用終點值結算，面板外框的 onGeometryChange（872–876）和按鈕列的 onGeometryChange（903）在這一輪都會觸發，各自呼叫 report()（1047–1051）。停在 .low 或 .mid、而且上緣和上次差超過 0.5 時，1050 會寫 mp.top（@Observable，MapPanel.swift 12）。MapTab.body 第 73 行呼叫 seen()，seen() 在 537 行讀 MapPanel.shared.top，所以整個 body 跟著重跑：store.shown 過濾（58）、withExtra（61）、pins.arm/track 建 Set（68、70）、Nearby 每間店建 CLLocation 再排序（767–792）、Map 內容每根 Annotation/FoodPin 重建後讓 MapKit 比對（78–143）、onChange(of: list.map(\.id))（180）、194 行拼字串、兩個 safeAreaInset 和 AnyView top 重建（249–308）、兩個 overlay（316–325）。接著 NearbySheet 拿到新的 near，body 再跑一次，highUsed 之後藏著的 LazyVStack 也要換一批 NearRow/PhotoView。為什麼剛好在這一幀：拖曳時 report() 被 guard !mp.dragging 擋掉，放手是 dragging 變回 false 之後的第一個時機。停到 .high 不走這條路（1050 有 mp.stage != .high 擋著，setFoot 只在 .mid 動），所以往上甩到 high 那幾次的放手掉幀要用第 4 點解釋。分支 bc0bc20 已用 NearbyHost/SeenBox 讓 mp.top 改變時只重算 host 和 NearbySheet，但 report() 還在放手幀的回呼裡（bc0bc20 917、945），所以放手幀仍要多算一次 NearbyHost、Nearby 排序和 NearbySheet。
- 【放大器，讓第 1 點的覆蓋範圍變大】probe.top 和 probe.foot 由兩個不同的 onGeometryChange 各自更新、各自立刻呼叫 report()（a1b57b1 872–876、903；bc0bc20 917、945）。report() 同時用 probe.foot（foot → setFoot 529–533 → @State footY → Map .safeAreaPadding(.bottom) 147）和 probe.top（mp.top）。先跑的那個回呼一定讀到另一邊停在最後拖曳位置的舊值，於是 footY 或 mp.top 先被寫成舊值，同一批回呼裡再被寫回正確值。懷疑者修正了兩位診斷者的說法：onGeometryChange 的 action 是同一次 update 結束後成批執行的，中間不會插進 layout，所以 Map 的 safeAreaPadding 不會「改過去再改回來」造成兩次 MKMapView 重排，也不會額外觸發 onMapCameraChange 和 recluster。80ms 後那次 report()（1036）在兩種順序下都是空跑。這個競態真正的代價是：就算最終值和原本一樣（例如從高回到同一個中段高度），舊值寫入還是會把 MapTab（footY 是 @State）或依賴 mp.top 的 view 標成 dirty，白算一次。結果第 1 點從「上緣有變的放手」擴大成「所有停在 low/mid 的放手」都要付成本。
- 【第一次到最高段的 57–167ms 大幀（時間點待確認）】直的附近清單第一次是同步建立的。a1b57b1：height（830）= target(mp.stage)+pull，用的是 model 終點值不是插值，所以 tall（838）在 settle 把 stage 改成 .high 的那一輪就變 true。快甩通常拉不過 (midT+highT)/2（iPhone 17 約要從中段往上拉 210pt 以上），所以拖曳中不會先建。highUsed 還是 false 時，`if tall || highUsed`（857–864）就在放手那一輪插入 high（962–994）：UIScrollView、LazyVStack、約 7–8 列 NearRow（1092–1118，每列有 NavigationLink、PressStyle、PhotoView、.task、store.distance、.candy 陰影），再加第二份 titleRow/DiceChip/PanelDrag/SwipeBackBlocked、onScrollGeometryChange、onScrollPhaseChange，以及 0.18 秒淡入淡出開頭。下一輪 onAppear 寫 highUsed=true（863），NearbySheet.body 再跑一次。第一次建這種 view 型別樹時 metadata 和 attribute graph 都是冷的。懷疑者的保留意見：(a) 這筆成本付在放手幀 R，不是升到頂那一幀（R+15～R+20）。如果錄影上大幀真的在升到頂附近，清單建立解釋不了，照片回寫（解碼在 PhotoLoader actor，主執行緒每列只寫一次 img）也不太可能湊出 57–167ms，那就還有別的原因。(b) highUsed 是 @State，同一次啟動只會建一次。如果 6 次裡出現不只一次 ≥57ms，就是另一個原因。NearRow 用 px 200（a1b57b1 1098／bc0bc20 1164），MapCard 用 px 300（1566／1632），快取 key 不同，每列都要再解一次碼，第一次可能先用 anySize 拿到大張圖頂著。這是小的加重因素。分支 bc0bc20 已在 955 行加了閒置 1.5 秒預建，但只擋得住拖面板（while mp.dragging），擋不住拖地圖、圖釘落下和「附近 N 間」的數字動畫。
- 【每次放手都有的底噪，解釋往上甩到 high 時為什麼也會掉 1 幀】a1b57b1 的 drag()（1016–1019）每幀寫 @State pull，height 在 NearbySheet.body 開頭就被讀，所以每個拖曳幀和放手幀都要整塊重算（mid 的 LazyHStack/MapCard、兩份 titleRow/DiceChip，highUsed 之後還有藏著的 LazyVStack）。放手那一輪 tall 翻轉，`.animation(.easeOut(0.18), value: tall)` 套在整個 ZStack 上，mid 和 high 的 opacity、allowsHitTesting、accessibilityHidden 在同一個 transaction 一起改。分支 bc0bc20 的 Lift/LiftHeight 和 tallPull 已經把拖曳幀的成本縮到只剩套高度那層，放手幀仍會跑 1–2 次 NearbySheet.body。這一點信心中等，要用 Perf 計數確認。SwipeBackBlocked 每幀寫 @State rect（SwipeBack.swift 77）不會讓 body 重跑，只是字典寫入。store.panelTop（910–912）只有畫面上有 toast 時才讓 Root overlay 重算（FoodMapApp.swift 112–137）。兩者都是小項。

### 修法步驟
0. 底稿：以 origin/claude/project-thread-bai8ub 最新的 bc0bc20 為底。它已經包含 5b5355c 的 NearbyHost/SeenBox、Lift/LiftHeight、tallPull、閒置預建，下面的行號都是 bc0bc20 的 MapTab.swift。如果一定要從 a1b57b1 改，就先把 5b5355c 整包搬過來，不要只搬一半：SeenBox 要連 peek/shown 一起搬，MapTab.body 只能讀 seenBox.peek（第 20、71 行），不能讀 seenBox.shown；NearbyHost 的 content closure 要在 host 的 body 裡展開，不要在 MapTab.body 先把 gname、missing 這類值算好再傳進去，不然 `.equatable()`（== 只比 total、headY、mapRect、list）會把它們擋成過期值。

1. 【放手幀不再跑 report()，把兩次量測合併成一次，等彈簧停好再寫（處理根因 1、2）】(a) 在 PanelProbe（1132）加兩個欄位：`var task: Task<Void, Never>?` 和 `var holdUntil: CFTimeInterval = 0`。(b) 在 NearbySheet 加 `private func scheduleReport() { probe.task?.cancel(); let wait = max(0, probe.holdUntil - CACurrentMediaTime()); probe.task = Task { @MainActor in if wait > 0 { try? await Task.sleep(for: .seconds(wait)) } else { await Task.yield() }; guard !Task.isCancelled else { return }; report() } }`。(c) 917 行（面板外框的回呼）和 945 行（按鈕列的回呼）的 `report()` 都改成 `scheduleReport()`。probe.top、probe.foot、bottomY 照舊在回呼裡同步更新，因為它們不被觀察，不會觸發重畫。(d) settle 裡 1085 行的 `Task { …80ms…; report() }` 改成 `probe.holdUntil = CACurrentMediaTime() + 0.45; scheduleReport()`（0.45 秒大約是 spring(response 0.38, damping 0.82) 在視覺上停下來的時間）。(e) drag() 開頭加 `probe.task?.cancel()`，手指再按下時就取消還沒跑的量測。(f) settle 的 withAnimation 本體（mp.stage、lift.y=0、tallPull=nil）一字不動。這樣做的效果：放手後 0.45 秒內，兩個回呼每觸發一次就把 task 重排一次，最後只在彈簧停好、兩個 probe 值都是新的時候跑一次 report()。footY、mp.top 不會再被寫成舊值又改回來，放手幀也不會有 MapTab 或 NearbyHost 重算。非 settle 的路徑（拖地圖時 MapPanel.go(.low)、點圖釘時 midH 改變、鍵盤、行程模式回來）不用動 holdUntil，仍然在下一輪就量，時間點和現在一樣，不會漏量。這比診斷者1的 .task(id:) 寫法安全，因為 id 沒列到的改變一樣會被量到。

2. 【確認 MapTab.body 不讀 MapPanel.top（處理根因 1 的放大成本）】bc0bc20 已經做好：seen() 移到 NearbyHost.visible（約 790 行），MapTab.body 只讀 seenBox.peek（@ObservationIgnored）。這一步只要檢查，不用改：在 MapTab.body 開頭用 `let _ = Perf.shared.count("地圖頁")`（5b5355c 已有 Perf HUD），確認改 mp.top 時這個計數不會增加。

3. 【預建直清單要等整個地圖首頁都閒下來（處理根因 3）】改 955–959 的 .task：(a) 把等待條件從只看 `mp.dragging` 擴大成「面板沒在拖、圖釘落下和『附近 N 間』數字動畫結束（counted == nil）、地圖鏡頭停了」，例如 `while mp.dragging || counted != nil || CACurrentMediaTime() < mp.calmUntil { try? await Task.sleep(for: .milliseconds(300)) }`。如果地圖手勢有現成的旗標（例如 onMapCameraChange(.continuous) 期間），也一起放進條件裡。(b) 保留 `if tall || highUsed`（899）當保底，冷啟動 1.5 秒內就甩的情況還是會當場建。(c) 不要把 high 抽成只比 id/group/subtitle 的 Equatable 子 view（懷疑者指出改店名、換照片、切換去過或想去時清單會不更新）。如果要做 Equatable，就比完整的 [Place]。

4. 【NearRow 照片和 MapCard 共用快取（根因 3 的小加重因素）】NearRow 1164 行的 `PhotoView(place: place, px: 200)` 改成 `px: 300`，和 MapCard（1632）用同一個快取 key。顯示大小還是 64×64pt（@3x 是 192px），畫質不變，第一次顯示時不用再解一次碼，也不會先用 anySize 拿大圖頂著。可選：在第 3 步預建完成之後，用 `for p in near.places.prefix(12) { if let u = p.photoURL { _ = await PhotoLoader.shared.load(u, 300) } }` 先把照片熱好（呼叫的函式名稱以 Photo.swift 實際的 API 為準）。

5. 【先量再改：釘死 57–167ms 那一幀的位置】改第 3、4 步之前，先在 settle 打 `Perf.signposter.emitEvent("release")`，在 high 的 onAppear（905）、NearbySheet.body、NearbyHost.body、MapTab.body、setFoot 真的寫入的地方、report() 真的寫 mp.top 的地方都打點，帶 CACurrentMediaTime()。逐格對照錄影：大幀如果在 R 或 R+1，就是根因 3，第 3 步能解。如果在 R+15～R+20（升到頂附近），或同一次啟動出現不只一次 ≥57ms，就還有沒找到的原因，這時要開 Instruments 的 Time Profiler 加 SwiftUI 模板，看那一幀主執行緒在做什麼，不要先套第 3 步就當作修好。

6. 【小項，可選】SwipeBack.swift 74 行的 `@State rect` 改成放在一個不被觀察的 final class box 裡，拖曳時每幀少一次 graph 寫入。store.panelTop（952 附近的 onChange）維持現狀，不要延後。

### 不要動
• settle 不能改。它必須在放手那一幀用 withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) 同步改 mp.stage、lift.y、tallPull，面板才會在放手那一幀開始動。不要把 stage 寫入延後、不要用 DispatchQueue 晚一拍，也不要為了省成本換成比較短或比較硬的動畫。
• 其他動畫參數也照舊：清單和卡片列 0.18 秒淡入淡出、大卡片 spring(0.45, 0.68)、「附近 N 間」的 numericText 數字滾動、按鈕快到頂時淡掉（fade）、換段輕震。三段高度、甩一下跳段、拉超過 60pt 至少換一段（settle 選段邏輯）、清單捲到頂再往下拉會降一段，這些都不能動。
• store.panelTop 不能延到停好之後才寫（診斷者2 修法 4 的那一項要拿掉）。toast 要在 stage 改變那一輪就跟著面板上緣移動，延後的話 toast 會先被面板蓋住再跳上去。
• 不要讓 MapTab.body 重新讀 MapPanel.shared.top 或 seenBox.shown。已知的坑：Map Annotation 內容不會跟著 MapTab 重畫，圖釘外觀要繼續從 PinState 讀，不要為了「讓圖釘更新」把狀態搬回 MapTab。
• 不要在拖曳中或放手幀改 Map 的 safeAreaPadding 或大小。已知的坑：整張地圖重排大約 0.5 秒。footY 維持「只在停在中段而且值真的變了才寫」。
• 不要把 high 改成只比 id/group/subtitle 的 Equatable，會讓清單顯示舊資料。
• 不要拿掉 highUsed「出現過就留著」的設計，也不要拿掉 `if tall || highUsed` 這個保底。
• 不要用 maximum-scale 或關掉縮放之類的手段（這是網頁的規範，iOS 端不適用，但同樣不要為了效能拿掉使用者可以做的操作）。
• MapPanel、TripMode、TripStore 都是 @Observable 單例。不要在 body 裡新增對它們被追蹤屬性的讀取。新增的計時欄位（task、holdUntil）要放在 PanelProbe 這種不被觀察的 class 裡，或標成 @ObservationIgnored。

### 模擬器驗證
環境：Mac 上用 Release 設定跑 iPhone 17 模擬器，和 J6 用同一套錄影算幀間隔的方法，≥25ms 算掉幀。冷啟動後在地圖首頁等 3 秒。
1) 改之前先釘位置（各錄 6 次）：照修正步驟 5 打點，把放手幀標成 R，逐格記錄掉幀落在 R、R+1，還是 R+15～R+20。另外在 report() 裡 print probe.foot 和 probe.top−topH−10，放手那一輪兩個值不一樣，就證實了回呼先後的競態。
2) 改完之後的劇本：① 冷啟動等 3 秒，中→高快甩（第一次到最高段）；② 高→中、中→低、低→中、低→高、高→低各快甩 3 次（照 J6 共 6 次的順序再加做）；③ 點一根圖釘讓大卡片撐高中段，再中→高→中各甩一次；④ 有 toast 時（例如刪一間店）甩面板；⑤ 拖地圖讓面板自己降到最低段；⑥ 冷啟動 1 秒內就甩到高（最壞情況，只記錄數字，不算失敗）。
3) 通過標準：①～⑤ 放手前後各 3 幀、升到頂附近、以及放手後約 0.45 秒那次 report，都沒有 ≥25ms 的幀；整段不能再出現 57–167ms 的大幀。逐格看錄影，放手後的第一幀面板就有位移（使用者標準：按下那一幀就開始動）。拖曳中每幀 <25ms，不能因為預建清單或 px 改動而變慢。
4) 計數（Perf HUD 或 signpost）：每次放手後 0–100ms 內，MapTab.body 0 次、NearbyHost.body 0 次、NearbySheet.body ≤2 次。放手後 ≥400ms，report() 最多真的寫 1 次 mp.top，而且只有在上緣真的變了的時候；這次寫入只讓 NearbyHost 和 NearbySheet 各重算 1 次，MapTab.body 還是 0 次。footY 只在停到中段而且高度真的變了才寫，最多 1 次；正常甩動完全不寫，地圖不會出現約 0.5 秒的重排。high 的 onAppear 出現在啟動後約 1.5 秒以上、地圖和數字動畫都停了之後，不在甩動的時候。
5) 回歸檢查：甩完 0.5 秒內點附近的圖釘，鏡頭會把它置中在卡片列上方那塊的中間；從 low、high 回到 mid 之後，「附近 N 間」的數字和可見範圍一致，停好約 0.45 秒後數字會滾動；toast 貼著面板上緣跟著移動，不會延遲；拖地圖時面板降到最低段，附近清單一樣會更新；點圖釘、大卡片撐高中段時，鏡頭動畫（0.55 秒 smooth 或 0.8 秒 flight）中途不能卡；進出行程模式，地圖邊距不變；改店名或換照片後，直清單和卡片列會顯示新資料。

---

