# 滑順第 4 輪（perf-round1d）：選店那一幀、降落清單、進店家頁，和泡泡分群

對照 Swift 最新的 282008e（a10704d 量測 build ＋ 4bdb647 ＋ 282008e）。行號都是 282008e 的；a10704d 之後只有 Reel.swift 的 stop()（:122 以後多 4 行）和 MapTab.swift 的 ClusterBubble（:2105 以後多 2 行）有移動，這份用到的行都在它們前面。

三個重幀（選店那一幀、降落時附近清單、第一次進店家頁）各做了一輪「主執行緒在做什麼」的分析，每一份再由反方逐條推翻過；這份文件本身也再經過兩個反方（程式、判斷）檢查，更正都已經寫進來。結論是：證據還不夠直接下修法，大部分要先出一個只加計數和對照開關的 build 量清楚；現在就能做、而且看不出差別的只有第 2 節那幾項。

## 0. 結論一覽

| 項 | 判定 | 在哪 |
|---|---|---|
| 泡泡合併照固定順序 | 現在做（錯誤修正，畫面不變） | 2.1 |
| 泡泡圖示、顏色一樣多時照分類順序 | 現在做（錯誤修正，畫面不變） | 2.2 |
| PinBurst 只追到光圈畫完 | 現在做 | 2.3 |
| CLLocationManager 不要每次重建 | 現在做 | 2.4 |
| 計數 build（含 -noHighPrebuild、-holdTop 兩個對照開關） | 現在做（只加量測） | 3 |
| 🎲 圖的大小照 UIKit 的字級算 | 現在做（-emojiImg 才有作用） | 4 |
| 藏著的最高段清單包成 Equatable | 量完再說（取代 F2） | 6 |
| F1 圖釘各看自己的盒子 | 量完再說 | 6 |
| F3 選著店時面板上緣不變 | 量完，成立才問 Anthony | 6、8 |
| MapNav 推頁時 MapTab 不重算 | 量完照判定直接做，程式在 6 | 6 |
| 照第幾列認列、大卡包 Equatable | 量完再說 | 6 |
| 泡泡：這輪跟畫面一樣時取消上一輪的合併 | M13 看到才做 | 6 |
| 4.E 降落清單晚 0.6 秒 | 前面都做完還重，才問 Anthony | 6、8 |
| F4 預建大卡、PhotoView 不畫 emoji（兩種）、藏著的標題不滾動、店家頁 LazyVStack、TabPages 整個拆 | 不做 | 7 |

## 1. 282008e 模擬器結果判讀

- **4bdb647 聲音三項全過**。「stop 設聲音類別」只在開過喇叭再離開時出現，G 結案。冷的第一次進店家頁這次是 201ms（上版三次 251、127、99，中位 127）；一次的數字落在舊範圍裡，看不出快慢，等 M11 冷的 5 次再看。
- **282008e 泡泡數字不折行過**。
- **emoji 對照第 2 輪**（不加 vs -emojiImg all）：兩位數泡泡、最大泡泡 86、選中松山彈跳 4 幀、行程模式變淡、減少動態骰子，五組都一樣。**最大字級的 🎲 不過**：換圖版比原本小（約 70 對 80 px），修法在第 4 節。
- **兩版共同的大字問題**（最大字級時「抽一間」的字超出橘色膠囊、地圖卡片分類那行只剩 🥐 和「…」）：就是第 10 批的 U122（整個 App 沒有字級上限，固定高度的膠囊、卡片會爆框）。截圖已經證實，照第 10 批做。
- **新發現：泡泡分群不固定，不是 MapKit 的差異。** 「兩位數泡泡」那張左右兩半的地名在同一個像素（基隆市、新竹市、花蓮市、嘉義市），鏡頭一樣，可是左邊是 62，右邊是 61 加新竹一根單獨的圖釘。左右是不加和 -emojiImg all 各開一次 App；recluster 不讀 emoji，所以可以比。原因在 MapTab.swift:836 `Array(cells.values)` 拿字典的順序當合併順序。Swift 的字典順序不固定：每次開 App 有隨機種子，每建一張新的雜湊表（或字典長大換表）還會拿表的記憶體位址當種子，所以不只每次開 App，同一次開 App 裡每次 recluster 都可能換順序。下面的合併是「泡泡吃掉壓到的東西、吃完重新量中心」，誰先吃結果就不一樣（推論：左邊那顆在中心還偏西時先吃到新竹那根，右邊先吃了別的、中心往東移，就碰不到了）。recluster 的其他輸入（pins.sel、extra、keep、pts、格子大小）在同一個鏡頭下都一樣，已經逐一查過。
- **泡泡顏色也是同一類（推論）。** 最大泡泡 86 兩次開的漸層不一樣。MapTab.swift:876 照家數排前兩名分類，一樣多時沿用 `Dictionary(grouping:)` 的順序，它每次也是新表。同一個 🍜 時第一色照程式一定是餐廳的橘，兩次的差別應該在第二色（咖啡藍或飲料綠，橘到藍的漸層看起來偏紅），兩類是不是剛好一樣多由 M13 確認。兩根店的小泡泡如果是一間餐廳一間咖啡，連圖示都會換。

## 2. 現在就做（畫面和時機都不變）

### 2.1 泡泡合併照固定順序

MapTab.swift:836：
```swift
        var items: [[Place]] = Array(cells.values)
```
換成：
```swift
        // 字典的順序不固定：每次開 App 換種子，同一次開 App 裡每建一個新字典（或字典長大換表）也會換。
        // 下面的合併是照順序吃的，不先排好，同一個畫面會合成不一樣的泡泡。大的先吃，一樣大照格子位置
        let order: [String] = cells.keys.sorted { a, b in
            let na = cells[a]?.count ?? 0, nb = cells[b]?.count ?? 0
            return na != nb ? na > nb : a < b
        }
        var items: [[Place]] = order.compactMap { cells[$0] }
```
下面 :837-861 的 sum、cnt、box() 和合併迴圈都不用動。:883 的 `}.sorted { $0.id < $1.id }` 和 :887 的 guard 也不用動，泡泡的 id 本來就是排過的店 id 串起來（:879）。排出來的順序本來就是現在隨機順序可能出現的其中一種；合併迴圈結束時「沒有泡泡壓到任何東西」的保證跟順序無關。

### 2.2 泡泡圖示和顏色：一樣多時照分類順序

MapTab.swift:876：
```swift
            let top = Dictionary(grouping: g, by: \.cat.key).sorted { $0.value.count > $1.value.count }.prefix(2)
```
換成：
```swift
            // 一樣多時照分類固定的順序（Cat.order）：字典順序不固定，不排的話泡泡的圖示和顏色會換
            let top = Dictionary(grouping: g, by: \.cat.key).sorted { a, b in
                if a.value.count != b.value.count { return a.value.count > b.value.count }
                return (Cat.order.firstIndex(of: a.key) ?? Cat.order.count) < (Cat.order.firstIndex(of: b.key) ?? Cat.order.count)
            }.prefix(2)
```
:877 以後照舊。

### 2.3 PinBurst 只追到光圈畫完

picked() 在 MapTab.swift:656 把 `spot.until` 設成 0.9 秒，這段時間裡 :193 每一幀鏡頭回呼都改 `spot.at`，PinBurst（:1913 讀 spot.at）連 GeometryReader 每幀重跑。光圈的 keyframe 只有 0.7 秒（:1936），光圈本身在 0.65 秒就透明了，糖粒在 0.7 秒歸零。遠飛時（:669-683，第二段 0.3 秒後才開始、再跑 0.5 秒）鏡頭在 0.7 秒之後還在動，0.75 到 0.9 秒這段每幀都白做；近的平移（:685，0.55 秒）那時已經停了，省不到，所以不要拿 s1b 的數字驗這項。

MapTab.swift:656 改成：
```swift
            spot.until = Date().addingTimeInterval(0.75)   // 光圈 0.7 秒畫完（PinBurst 的 keyframe），之後不用再追著地圖更新位置
```

### 2.4 CLLocationManager 不要每次重建

推頁、返回、訊息條出現或消失、換分頁時 Root 都會重算，FoodMapApp.swift:41-44 每次都重新呼叫 MapTab()，MapTab.swift:12 的 `@State private var loc = CLLocationManager()` 就會每次 new 一個再丟掉（@State 只留第一次的，但初始值每次都會算）。其他 @State 都是小物件，只有這個不是。

MapTab.swift:12 改成：
```swift
    @State private var loc = LocMgr.shared
```
MapTab 結構後面（:1029 的右括號之後）加：
```swift
// MapTab 每次被重新建構（Root 重算）時不要再 new 一個 CLLocationManager：整個 App 共用一個
@MainActor enum LocMgr { static let shared = CLLocationManager() }
```
寫法跟 MapTab.swift:47 的 `@State private var trip = TripMode.shared` 同一種。loc 只在 :403、:468 讀 location、:467 要權限，沒有設 delegate，整個 App 只有一個 MapTab，共用沒有差別。

## 3. 計數 build（只加量測，沒開浮層、沒加參數時看不出差別）

### 3.1 掉幀那行接上這一幀裡各畫面重算幾次

計數要從上一次 tick 真正跑完的時間算起，不能從 `last`（vsync 時間）算：主執行緒卡住時 tick 比它的 timestamp 晚跑，連續兩筆掉幀時上一筆的尾巴會兩行都算到。

Perf.swift:29（`@ObservationIgnored private var shownAt…`）下面加：
```swift
    @ObservationIgnored private var tickedAt: CFTimeInterval = 0   // 上一次 tick 真正跑完的時間（l.timestamp 是 vsync，主執行緒卡住時比 tick 真正跑的時候早）
```
Perf.swift:88：
```swift
            print(String(format: "[perf] 掉幀 %.0f ms（%.3f 到 %.3f）", (now - last) * 1000, last, now))
```
換成：
```swift
            // 這一幀裡各畫面重算了幾次（body 開頭有 count 的才算），從上一次 tick 跑完算起
            let since = tickedAt
            let n = bodies.compactMap { (k, v) -> String? in
                let c = v.filter { $0 >= since }.count
                return c > 0 ? "\(k) \(c)" : nil
            }.sorted().joined(separator: "・")
            print(String(format: "[perf] 掉幀 %.0f ms（%.3f 到 %.3f）", (now - last) * 1000, last, now) + (n.isEmpty ? "" : "　重算 " + n))
```
tick() 最後（:120 `for p in ps { … }` 的右括號之後、:121 tick 的右括號之前）加：
```swift
        tickedAt = CACurrentMediaTime()
```

### 3.2 新的計數

每一行都放在那個 body 的第一行：
- FoodPin.body（MapTab.swift:1756 的 `var body: some View {` 下面）：`let _ = Perf.shared.count("圖釘")`
- PickedCard.body（:1493 下面）：`let _ = Perf.shared.count("大卡")`
- NearRow.body（:1455 下面）：`let _ = Perf.shared.count("附近列")`。NearRow 只用在藏著的最高段清單（:1301）。注意：near 內容沒變時 SwiftUI 不會跑 NearRow.body，所以「附近列」大於 0 表示清單內容真的換了，不是清單被重比。
- MapCard.body（:1966 下面）：`let _ = Perf.shared.count("卡片")`

現有的「地圖」「附近面板」「App」「店家頁」也會一起出現在掉幀那行。

### 3.3 附近清單算幾 ms

NearbyHost.body 的 MapTab.swift:1063：
```swift
        content(Nearby(list: list, here: store.here, region: visible, total: total))
```
換成：
```swift
        let t0 = CACurrentMediaTime()
        let n = Nearby(list: list, here: store.here, region: visible, total: total)
        let _ = Perf.shared.note(String(format: "附近算 %.2f ms，%ld 間", (CACurrentMediaTime() - t0) * 1000, n.places.count))
        content(n)
```
:1061、:1062 的 signpost 和「附近重算」留著。

### 3.4 select 的時間錨點

現在只知道「掉幀開始」和「點圖釘」「抽一間（抽中）」記號，中間差最多一幀，判斷不了 select 之前 SwiftUI 先做了多少。
- PinState.tap，MapTab.swift:1655 的 guard 下一行加：`Perf.shared.note("select 開始（點圖釘）")`
- 抽中，MapTab.swift:547 的 `pins.select(win.id)` 前一行加：`Perf.shared.note("select 開始（抽中）")`

### 3.5 兩個對照開關（不加參數照舊）

- **-noHighPrebuild**（藏著的最高段清單在選店那一幀佔多少，就是第 6 節 Equatable 最多能省的量）：MapTab.swift:1234 換成
```swift
            if !Task.isCancelled, !highUsed, !Flag.on("-noHighPrebuild") { highUsed = true }
```
  加了這個參數，最高段清單只有真的拉到最高段才建（:1181 的 onAppear），所以量的時候中途不要拉到最高段。
- **-holdTop**（F3 對照：選著店、停在中段時不更新面板上緣，看選店那幾幀省多少）：MapTab.swift:1393 換成
```swift
        // 量測用 -holdTop（F3 對照，不加參數照舊）：選著店、停在中段時不更新面板上緣
        let hold = Flag.on("-holdTop") && mp.stage == .mid && pins.sel != nil
        if mp.stage != .high, !hold, probe.top > 0, abs(mp.top - probe.top) > 0.5 { mp.top = probe.top }
```
  report() 是 NearbySheet 的方法，pins 是它的屬性；關卡時 sel 先變成 nil，下一次 report 就會補上正確的上緣。

### 3.6 推頁時誰在重算

- MapTab.swift:62 下面加：`let _ = Perf.shared.note("地圖重算")`
- FoodMapApp.swift:36 下面加：`let _ = Perf.shared.note("App 重算")`
- PlaceDetail.swift:21 下面加：`let _ = Perf.shared.note("店家頁重算")`
- MapTab.swift:306 改成兩行（地圖的 global frame 在推頁、返回時有沒有變；有變的話 MapTab 會因為 mapRect 重算）：
```swift
                mapRect = r; trip.mapBottom = footY > 0 ? footY : r.maxY
                Perf.shared.note("地圖範圍變了 x=\(Int(r.minX)) y=\(Int(r.minY)) w=\(Int(r.width)) h=\(Int(r.height))")
```

### 3.7 推頁之後那幾幀的其他工作

- Reel.swift:59 的 `start(p)` 前一行加：`Perf.shared.note("影片 start")`
- Reel.swift:70 的 `print("[reel] 開始播放")` 下一行加：`Perf.shared.note("影片開始播")`（:71 接著就把 player 放上去，第一次建 PlayerLayer）
- PlaceDetail.swift:419 換成（熱的第二次進同一間會走快取，沒有截圖記號，要分得出來）：
```swift
        if let c = Self.cache.object(forKey: key as NSString) { Perf.shared.note("小地圖用快取"); withAnimation(.easeOut(duration: 0.2)) { img = c }; return }
```
- PlaceDetail.swift:425 的 `let o = MKMapSnapshotter.Options()` 前一行加：`Perf.shared.note("小地圖開始截圖")`
- PlaceDetail.swift:432 的 withAnimation 前一行加：`Perf.shared.note("小地圖截圖到")`
- Reel.swift:56 換成（背景設聲音類別花多久，確認 25ms 搬到背景了）：
```swift
            await Task.detached {
                let t = CACurrentMediaTime()
                try? AVAudioSession.sharedInstance().setCategory(.ambient)
                if Flag.on("-perfOverlay") { print("[reel] 背景設聲音類別 \(Int((CACurrentMediaTime() - t) * 1000)) ms，在主執行緒：\(pthread_main_np() != 0)") }
            }.value
```
Flag 沒有綁 actor（Perf.swift:192 的 enum Flag 沒有 @MainActor），Reel.swift:201-206 的 Task.detached 已經在背景用過 pthread_main_np（:204）。

## 4. 🎲 圖的大小照 UIKit 的字級算（-emojiImg 才有作用）

DiceChip 的字型是 `.subheadline`，🎲 圖的大小卻是 `@ScaledMetric(relativeTo: .subheadline) var dice = 15`（Draw.swift:191），預熱用 `UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 15)`（MapTab.swift:284）。最大字級時圖比字小一截。ImageRenderer 畫的是固定 pt 數、scale 是 displayScale、padding 左右對稱，這幾個都排除了；圖能出現代表兩邊算出來的 key 一樣。所以最可能的原因是 UIFontMetrics 和 ScaledMetric 的縮放曲線在輔助使用的大字級跟字型本身的 pt 數對不上（推論，外面也有人量到同樣的偏差，建議改用 preferredFont 的 pointSize）。改成直接問 UIKit「這個字級的 subheadline 是幾 pt」，DiceChip 和預熱用同一個函式，而且都從 SwiftUI 環境拿字級。

MapTab.swift 的 EmojiArt（:2203 起）裡加：
```swift
    // DiceChip 的字型是 .subheadline：同一個字級下 UIKit 的 subheadline 是幾 pt，🎲 就畫幾 pt
    static func diceSize(_ d: DynamicTypeSize) -> CGFloat {
        UIFont.preferredFont(forTextStyle: .subheadline,
                             compatibleWith: UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(d))).pointSize
    }
```
Draw.swift:191：
```swift
    @ScaledMetric(relativeTo: .subheadline) private var dice: CGFloat = 15
```
換成：
```swift
    @Environment(\.dynamicTypeSize) private var dts
    // 🎲 圖跟旁邊「抽一間」的字一樣大：直接問 UIKit 這個字級的 subheadline 幾 pt（@ScaledMetric 在最大字級時比字小）
    private var dice: CGFloat { EmojiArt.diceSize(dts) }
```
:235 的 `.onChange(of: dice)` 不用動。

MapTab.swift:23 下面加 `@Environment(\.dynamicTypeSize) private var dts`，:284 換成：
```swift
                    list.append(("🎲", EmojiArt.diceSize(dts), .dice))
                    if Flag.on("-perfOverlay") { print("[emoji] 🎲 舊算法 \(UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 15)) pt，新算法 \(EmojiArt.diceSize(dts)) pt，字級 \(dts)") }
```

**跟第 10 批的關係**：第 10 批合8 給 MapTab.swift:284 的改法（`let cat = min(UIApplication.shared.preferredContentSizeCategory, .extraExtraExtraLarge)` 加上 `UIFontMetrics…scaledValue(for: 15, compatibleWith:)`）作廢，不要做；照它做的話預熱的 key 會變回 UIFontMetrics 的值，跟 DiceChip 查的對不上，🎲 會永遠退回文字。U122 只在 Root 加 `.dynamicTypeSize(...DynamicTypeSize.xxxLarge)`，MapTab 和 DiceChip 讀到的 dts 都會被夾住，:284 保持 `EmojiArt.diceSize(dts)`。第 10 批重寫時我會一起改。

驗收（M14）：都要加 -perfOverlay。(1) 預設字級、xxxLarge、最大字級（AX5）三種，各重開 App，-emojiImg dice 和不加參數各截 DiceChip，🎲 寬度要一樣（差 2 px 以內），Console 要有「預熱完成」，報那行「舊算法、新算法」的數字。(2) 不重開：App 開著，從設定把字級從預設拉到 AX5 再切回 App，Console 在「預熱完成」之後要多一行「[emoji] 畫 🎲 dice」（這行才是 :235 的 onChange 補畫的），DiceChip 的 🎲 要是圖、寬度跟文字版差 2 px 以內。如果新算法在 AX5 還是比字小，把數字報給我，我再找原因。

## 5. 量測（計數 build 做好之後）

做法照 m126：模擬器 Release 加 -Wl,-no_deduplicate，-perfOverlay，每次 terminate 再 launch，先不計地遠飛一次，等「清單掛上 首頁」後 2.5 秒才動手。每組 5 次，有對照開關的就跟不加參數交錯跑。數字一律看 Console：掉幀那行（含新的「重算」次數）和記號，不看浮層。報的時候每一次都附上原始的幾行 Console（從 select 開始或手指放開，到之後 1 秒），不只報中位數，我要對時間。

- **M9 選店那一幀**：
  - s1b 冷（全台畫面點嘉義那根）和 s2b（關卡後 -drawWin Mercer Brunch 按 🎲），各跑三組交錯：不加、-noHighPrebuild、-holdTop（都不要拉到最高段）。
  - A 換 B：台北市區、畫面上 20 根以上單獨圖釘的縮放，大卡開著，直接點同一畫面另一根單獨的圖釘，不加參數 5 次。
  - 每次點之前截一張畫面，報畫面上單獨圖釘的根數（2.1 之後分群固定，跟 a10704d 的場景可能不同）。
  - 報：對上「點圖釘」或「抽一間（抽中）」記號的那筆掉幀和它的重算次數；「select 開始」到那筆掉幀開始、到記號各差幾 ms；select 之後 1 秒內每一行「附近重算」「附近算」的時間，各落在哪一筆掉幀裡。
- **M9b A 重量**：s1b 冷，不加和 -emojiImg all 交錯各 5 次（要在這個 build 上重量，不要拿 a10704d 的 M1 數字比）。
- **M10 降落**：s2b。報：對上「飛完」記號的那筆掉幀和重算次數（特別是附近列、大卡、附近面板）、那次的「附近算 N ms，M 間」。另外一組小幅平移：s2b 降落後按 ✕ 關大卡，等 1 秒，把地圖往旁邊拖四分之一畫面停下，報那次「附近重算」附近的掉幀和重算次數。
- **M11 進店家頁**：照 M8（松山土窯羊肉、Wi-Fi），冷的第一次和熱的各 5 次，從大卡的「店家頁」進；再從收藏頁卡片進同一間，冷熱各 5 次。報：手指放開到「進店家頁」之間和之後 600ms 內的每一行掉幀（含重算次數）和記號（地圖重算、地圖範圍變了、App 重算、店家頁重算、影片 start、影片開始播、小地圖用快取、小地圖開始截圖、小地圖截圖到、背景設聲音類別）；返回那一下也一樣報到「返回」記號後 300ms。
- **M11b B 補量**：-reelNow，Wi-Fi，點松山土窯羊肉後 300ms 內按大卡的「店家頁」，冷熱各 3 次。報推頁那幾筆掉幀（含重算次數），還有「建播放器」「重複建的，丟掉」的行數，跟 M11 不加的同一組比。
- **M12 推頁取樣（M11 之後，熱的還有 50ms 以上才做）**：熱的推頁 5 次，每次按「店家頁」前約 0.5 秒開 `sample $(pgrep -x FoodMap) 4 1 -mayDie -file x.txt`，冷的也 5 次。用 sampletree --all 列主執行緒冷熱各自最多的前 15 個函式，另外數 MapTab.body、MKAnnotationContainerView 的狀態更新、UIHostingController 的 init、UINavigationController 的 push、CTFontDrawGlyphs、UIImage systemName 這幾支各有幾個樣本。
- **M13 泡泡**：
  - (0) 修之前的對照（模擬器上還是 282008e 的 build 時，裝新 build 之前先做）：不加參數，terminate 再 launch 5 次，截同一個全台鏡頭（跟「emoji對照2_兩位數泡泡」一樣）；同一次開 App 裡把地圖往旁邊拖三分之一再拖回來 3 次，每次停下都截。預期至少有一次不一樣。
  - (1) 新 build：同一個全台鏡頭，terminate 再 launch 5 次，泡泡的成員、數字、顏色、圖示每次都要一樣。
  - (2) 同一個縮放拖三分之一、停 1 秒、拖回來，重複 3 次，每次停下都截，泡泡的成員、數字、顏色都不能變。這條在 282008e 本來就可能不過，是這次修正的回歸檢查。
  - (3) 北部（桃園到基隆一個畫面）和台北市區兩種縮放各截一張：任何單獨的圖釘都不能壓在泡泡上，泡泡跟泡泡也不能疊。
  - (4) 點一顆泡泡，地圖放大、泡泡拆開，拆出來的圖釘位置對。
  - (5) 拖完停下 0.33 秒後，泡泡有沒有又自己換成別的樣子（看第 6 節最後一條要不要做）。
  - (1) 到 (4) 也是 G9c 還沒驗的部分。
- **M14 🎲**：見第 4 節。

## 6. 量完之後的候選（照判定規則決定）

所有門檻的「1 幀」是 17ms，「3 幀」是 42ms 以上（模擬器 60Hz，3 幀量到的是 48 到 57，不要拿 50 當邊界）。

### 選店那一幀（看 M9）

- **藏著的最高段清單包成 Equatable（取代 F2）**：選店那一串裡 NearbySheet 的 body 至少跑三次（pins.sel 一次；大卡換上後 :1169 改 midH，:1186、:1176 讀它一次；面板上緣變了經 NearbyHost 一次），每次都把開 App 1.5 秒後就藏著建好的整份最高段清單（:1285-1324）重比一遍。把 high 抽成自己的子 view、遵守 Equatable、掛 .equatable()，sel、midH 那兩次能跳過它；面板上緣那次只有看得到的範圍變小時沒有店進出才跳得過。外觀和時機不變的前提是 == 要比整份 Place，不能只比 id，不然停在最高段進店家頁按「去過」再返回，那一列會停在「♥ 想去」：
```swift
    // 藏著的最高段清單：內容（整份 Place，不只 id）、標題、版面都沒變才跳過
    nonisolated static func == (a: Self, b: Self) -> Bool {
        a.near.places == b.near.places && a.near.title == b.near.title && a.near.subtitle == b.near.subtitle
            && a.near.short == b.near.short && a.near.lead == b.near.lead
            && a.counted == b.counted && a.group == b.group && a.dice == b.dice
            && a.height == b.height && a.tall == b.tall && a.ceiling == b.ceiling
    }
```
  （寫法照 NearbyHost 的 :1056；欄位會是 near、counted、group、dice、height、tall、ceiling，閉包不比。完整的子 view 等量完我再寫。）**判定**：M9 的 -noHighPrebuild 那組，對上記號那筆掉幀的中位比不加低 1 幀以上，就做；沒有就不做。「附近列」「附近面板」只當旁證：「附近列」大於 0 表示 near 內容變了，那一次 Equatable 跳不過。回歸要加一條：停在最高段，從清單進店家頁，按「去過」再返回，那一列要馬上變「✓ 去過」。F2（PickSlot）只拿掉三次裡的一次，不做。
- **F1 圖釘各看自己的盒子**：現在每根 FoodPin 的 body 都讀 pins.sel（:1757、:1760），選店時畫面上每根單獨的圖釘都整根重算。改成每根的 PinFX 自己存選中與否，加一個只在「沒選」和「有選」之間切換的 hasSel，變淡那兩行抽成小 modifier；FoodPin.init（:1753）照舊讀 pins.sel，不要動（它可能就是 Map 收到選取的路徑之一）。從沒選到有選時 hasSel 也會切換，每根的變淡照樣全部重跑，F1 主要省的是 A 換 B。**判定**：用 M9 的 A 換 B（台北市區）。那筆的「圖釘」次數接近畫面上的根數，我就寫程式並附 -oldPinSel 對照，A 換 B 交錯各 5 次，中位比 -oldPinSel 低 1 幀以上才上。s1b 冷只報不判。
- **F3 選著店時面板上緣不變**：大卡比卡片列高約 30pt，選店時 report()（:1393）改 MapPanel.top，NearbyHost 讀到後整份附近重算，這時清單和數字都藏著。-holdTop 就是修正版（只在中段擋；原版連最低段也擋，會留下錯的上緣）。看得出的差別：選著店時拉到最高段，清單範圍是選店前的上緣以上，多一條約 30pt 的地圖。**判定**：「附近重算」落在含「select 開始」的那筆掉幀或下一筆裡，而且 -holdTop 那組這兩筆合計的中位比不加低 1 幀以上，才錄影問 Anthony；不然就拿掉。
- **A（emoji 換圖）**：s1b 冷 -emojiImg all 5 次 83–90（中位 88），5 次都沒有 117。不加參數的基準分兩群：M1 那輪 5 次中位 117，M4 冷 5 次中位 96，M3 合計 30 次中位 94、117 佔 8 次。所以確定的效果是最慢的那種（117ms，7 幀）不再出現，中位約少 6 到 8ms；降落和抽中那一幀沒有效果。第 4 節過了、M9b 重量過以後，跟 B 一起問 Anthony（第 8 節）。

### 降落（看 M10）

- **照第幾列認列（rows-by-position）**：嘉義換台北時藏著清單的列 id 全換，LazyVStack 全部拆掉重建。改成照第幾列認，列沿用、只換內容（照片那格要 .id(place.id)）。風險是小幅平移時插入點以下每列的照片格都重建。**判定**：降落那筆「附近列」6 以上、「附近算」2ms 以下，才寫程式，附 -nearRowsById 對照，而且 M10 的小幅平移組不能變差。門檻是比 -nearRowsById 低 1 幀以上。-landDeferList 時降落那筆 5 次裡 4 次沒有掉幀，表示沒有清單工作時 MapKit 自己在 25ms 以內；改完還在 33 以上，就表示列重建以外還有別的，把那幾行報給我。
- **大卡包 Equatable（picked-slot）**：降落那筆「大卡」2 次以上才試，量不到 1 幀以上的差就不上（多一層 == 以後容易漏欄位）。
- **4.E 降落清單晚 0.6 秒**：m126 M2 量到降落那筆從 54 變 0（5 次裡 4 次沒有掉幀），但同一份工作在 0.6 秒後的「降落後補做」出現（中位 33，最多 60），整段最長沒降（61 對 62），是搬走不是拿掉。看得出的差別有兩個：降落後 0.6 秒內按 ✕，卡片列先是舊地區、而且不會停在剛抽中那間；0.6 秒內拉到最高段，會先看到舊清單再整份換掉。**判定**：上面幾項做完，降落那筆中位還在 3 幀以上，而且用 -landDeferList 重量時「降落後補做」那筆中位在 2 幀以下（33ms 以下），才錄這兩個情境問 Anthony；問的時候寫明卡頓是搬到 0.6 秒後、會變小多少。

### 進店家頁（看 M11、M12）

- **MapNav 推頁時 MapTab 不重算**：MapTab.swift:81 在 body 裡建 `$store.mapPath`，推論 MapTab 的 body 因此依賴 mapPath，每次推頁、返回整段重跑（篩店、整張地圖的圖釘比對、NearbyHost 比對清單）。**判定**：M11 從大卡進的那組，放開到「進店家頁」之間、或返回時有「地圖重算」，而且前面沒有「地圖範圍變了」，就直接做下面的改法，不用再等我。如果「地圖範圍變了」也出現，先不要做，把那幾行報給我，要先處理 :305。

  MapTab.swift:81 的 `        NavigationStack(path: $store.mapPath) {` 改成 `        MapNav {`，:443 的右括號和後面的 sheet、confirmationDialog 都不動（:440-442 的 toolbarVisibility、navigationDestination、tripDestinations 掛在 ZStack 上，仍在 NavigationStack 裡面）。:1029（MapTab 結構的右括號）後面加：
```swift
// 地圖分頁的 NavigationStack：只有這一小層建 $store.mapPath（推論：建 Binding 時會讀一次 mapPath，SwiftUI 就記下依賴），
// 推店家頁、返回時只有這層重算，MapTab 本身（篩選、整張地圖的圖釘、面板）不用跟著重算。想法跟 ListTab 的 DepthReport 一樣
private struct MapNav<Content: View>: View {
    @Environment(Store.self) private var store
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        let _ = Perf.shared.note("地圖導覽重算")
        @Bindable var store = store
        NavigationStack(path: $store.mapPath) { content }
    }
}
```
  對照開關：MapTab.swift:63 後面加 `        let _ = Flag.on("-mapPathRead") ? store.mapPath.count : 0`（加這個參數就跟現在一樣依賴 mapPath）。**驗收**：M11 從大卡進的那組，不加參數時推頁、返回那幾筆掉幀裡沒有「地圖重算」，也沒有「圖釘」「附近面板」計數和「附近重算」記號，只有「地圖導覽重算」；-mapPathRead 那組照舊有。不加參數還是有「地圖重算」，就把 MapNav 改回 NavigationStack，報那幾行（重算不是 mapPath 造成的）。「地圖重算」沒了但「圖釘」「附近面板」還在，也報給我（推論：存起來的 content 裡的閉包被比對成不相等）。回歸：地圖推店家頁再返回、從左邊滑回、長按圖釘選「看店家」、教學帶進店家頁、店家頁按「在行程裡」、群組頁清 mapPath，分頁列藏起來和出現的動畫都照舊。
- **冷的推頁還剩的那塊**：M11 裡進店家頁之後 600ms 內如果有 50ms 以上的掉幀，跟「影片 start」「影片開始播」「小地圖開始截圖」對得上，我再分析（改時機的要問 Anthony，只是少做事的直接做）。

### 泡泡（看 M13 (5)）

- **這一輪算出來跟畫面一樣時，取消上一輪還在等的合併**：:887 的 guard 在「這一輪跟現在畫面一樣」時直接 return，但沒有取消上一輪還在等 0.33 秒的 clusterTask（:910），上一輪的結果如果已經過時，0.33 秒後畫面還是會換成它（推論，很少發生）。2.1 之後只剩鏡頭真的變了的情況。M13 (5) 看到「停下 0.33 秒後又自己換樣子」才做，我再寫完整程式（要連 :898 取消後、:914 換上後都把 clusterTask 設回 nil，不然每次停下都會多叫一次 setMerge）。

## 7. 不做（反方都同意）

- **F4 開 App 閒下來先藏著建一次大卡**：M4 平移距離對齊後，冷 96、熱 79（熱只有 3 次），差的約 17ms 就是第一次的成本，也是 F4 最多能省的（約 1 幀）。perf-round1c 定的條件是冷的「放開後第一幀」常常超過 100ms，M3 量到 1–2ms，不成立。而且是改時機，還會讓 NearbySheet 多跑兩次。
- **PhotoView 一開始有照片就不畫 emoji**（降落、推頁兩份分析各提一次）：-noEmoji 拿掉所有分類 emoji，降落那筆還是 54，省不到；推頁那份推論不到 1ms，而且換分店時 @State 沿用會讓照片淡入那 0.2 秒露出沒有 emoji 的底色。
- **藏著的標題換數字時不滾動**：opacity 0 的地方大概本來就不畫，量不出來，又是外觀邊角。
- **店家頁改 LazyVStack**：小螢幕上必點的彈出、小地圖的截圖會變成捲到才開始，是改時機，省不到 3ms。
- **TabPages（把 Root 的四個分頁整個拆出去）**：會跟第 3 批 U50、第 4 批 U31 打架，省的不到 1ms；唯一比較貴的 CLLocationManager 用 2.4 處理。

## 8. 要問 Anthony 的一包（現在的狀態）

- **B 選圖釘就預載影片**：M5 量過降落沒變差（-reelNow 飛完 33、48、47，中位 47；不加 54），也沒有重複建播放器。M11b 推頁沒變差再問。代價照 perf-round1c 5.B 寫上：Wi-Fi 下快速連點，每一間都會打一次 reel-video；雲端被擋時手機會自己去抓 IG。我建議做。
- **A emoji 畫成圖**：第 4 節、M14 過了，M9b 重量過以後問，附五組對照圖。效果照實寫：選店那一幀最慢的那種（7 幀）不再出現，中位約少 6 到 8ms；降落和抽中那一幀沒差。
- **F3、4.E**：只有量測說需要才問，見第 6 節。

coordinator 說 A 要跟選店那一幀一起問：M9、M9b、M11b 回來、第 4 節過了，我把 A、B（和 F3 如果成立）整理成一張卡給 coordinator。
