# 滑順第 5 輪（perf-round1e）第一份：疊在一起的圖釘

依 72ac06e 的 M9、M10、M13 量測寫的修法。每題一位設計、兩位反方從不同角度推翻、一位照反方修訂；下面是修訂後的版本，數字都回原始 Console 核對過。

這份先交兩題，都只碰選取和分群：
- **T1 點一下選了兩間**：換掉 a5eef80 那段「點完圖釘 0.6 秒內一律不聽」。
- **T2 兩根單獨圖釘疊在一起**：把 G9c 已定案的「單根也參與合併」做全。

下一份會一起交：T3（選店時 80 多根圖釘全部重算）、T4（降落、平移停下時重建看不到的清單）、T6（推頁、返回時 Root、地圖、收藏頁全部重算）。T5（大卡包 Equatable）不上：s2b 省兩次大卡重算加起來不到 1ms，沒過 perf-round1d 第 6 節的門檻。

## 先看這裡

- **都不用問 Anthony。** T1 是修 bug。T2 是已定案的 G9c 規格（單根也參與合併、跟 Apple 地圖一樣），看得出的差別只有「疊在一起的兩根變成一顆 2」。
  - T2 設計者列了兩點要問他，我判斷不用問。第一，判斷疊不疊用方框還是圓：用方框。現在泡泡吃單根就是用方框，MapKit 的預設碰撞也是方框，跟「跟 Apple 地圖一樣」一致。第二，行程模式裡相距不到約 30m 的兩間，放大後還是「+2」：同一格的兩間現在就這樣，不是這次帶出來的，這次不做，之後再看要不要處理。
- **T1 和 T2 互相影響的地方。** 加了 T2 以後，全台畫面嘉義那兩根會合成「2」，T1 的 sim A（s1b）就做不出來了。所以 **T1 的 sim A、C 三組都要加 -noPinPair**，讓那兩根照舊疊著。T2 的量測照它自己寫的，不用加 T1 的開關。
- **跟還沒交的 T3 的關係。** T3 也會改 PinState（select() 改盒子）。T1 在 PinState 加的是 mapLate、mapSync、syncFor、syncAt，位置在 tap() 後面，跟 T3 不重疊；T3 交的時候會照這份做完的樣子寫。
- **位置以程式原文為準。** T1 的行號是 08292cf 的；T2 的行號是 72ac06e 的。我已經用 584e384 核對過：每段「原文」在 584e384 都只出現一次（`guard let r = store.mapRegion ?? shownRegion` 有兩處，要的是 recluster 裡那一處），插入點的前後文也都在。
- 開關都只在模擬器和開發版讀得到（Flag 在 Perf.swift）。不加任何參數時就是新的行為。


## T1 點一下選了兩間（換掉 a5eef80 的 0.6 秒擋法）

（第 12 點風險「要讓疊在一起的單根也合成泡泡，得先問 Anthony」已經作廢：那就是 G9c 已定案的規格，由 T2 做。T1 的 sim A、C 要加 -noPinPair 才看得到疊著的兩根。）


**摘要**

s1b 點一下選了兩間。FoodPin 的按鈕先選了手指底下那根，34–46ms 後 MapKit 經 Map(selection:) 的 set 又選了疊著的另一根（72ac06e:MapTab.swift:111，行程模式外沒擋；推論先送 nil）。
分支頭 a5eef80 已經在同一處加了「點完圖釘 0.6 秒內一律不聽」，推論已經擋掉第二筆，但也會吞掉 0.6 秒內真的點空白、點影子，擋了之後也沒讓 MapKit 對回。最終修法把它換成 PinState.mapLate：點完圖釘 0.8 秒內、手指沒有再按在地圖上時，MapKit 送來的 nil 或另一根才不聽，並讓地圖重畫一次，把選取對回按鈕那根。
預期效果分兩部分看：
- 對 72ac06e：s1b 重算從「圖釘 169・地圖 1・大卡 4・附近面板 4」降到約「圖釘 85・地圖 0–1・大卡 2–3・附近面板 2–3」，「點圖釘 N ms」從中位 71 降到約 40–65（推論，約快 20ms）。
- 對分支頭：重算差不多；差別是點空白關得掉卡，選中那根畫在上面。

**看得出的差別**

有看得出的差別，全部屬於修 bug，照原則不用先問 Anthony，回報時一句帶過就好。

對 72ac06e（M9 量的版本）：
- 兩根疊在一起時（全台畫面嘉義那兩根）：現在約 40ms 後會換成另一根，15 次都選到沒按的那間，大卡、店名、鏡頭也中途換店。修好後選中的是按下那根，鏡頭只移一次。
- 兩根單獨但靠得近的圖釘（MapKit 判斷點到的範圍比畫出來的大，:832）：如果 MapKit 晚送的是另一根，現在會被換掉，修好後不會。

對分支頭（a5eef80，也就是 Anthony 下一版會拿到的行為）：
- 點完圖釘 0.6 秒內點地圖空白：分支頭不會關卡，因為 MapKit 的 nil 被擋掉了；修好後會關。
- 點完圖釘 0.6 秒內，點另一根只有 MapKit 接得到的地方（影子、名牌、圖釘正下方）：分支頭沒反應，修好後換成那根。
- 點完圖釘後 0.6–0.8 秒才送到、手指也沒再按地圖的 nil 或另一根：分支頭會聽（關卡或換店），修好後不聽。
- 對回（推論）：選中那根會畫在變淡的旁邊那根上面。分支頭可能是旁邊那根蓋在上面，一直到鏡頭停下、地圖重畫，sim A(5) 會確認。

刻意的取捨：疊在一起時，連點重疊處不會輪流選到下面那根，要點它露出來的部分或先放大。72ac06e 其實也做不到，因為第一下就跳到另一根了。

以下看不出差別：單獨圖釘的一般點選、長按選單、抽一間、卡片列、行程模式。

建議回報 Anthony 的一句：「兩根圖釘疊在一起時，現在選到的是你按的那根（以前會跳到另一根）；點完圖釘馬上點地圖空白也關得掉卡。」

**對照開關**

-mapSel06：這是照 Anthony 原則「恢復成現在的行為」的開關。加了就走分支頭 a5eef80 那段：點完圖釘 0.6 秒內，MapKit 送來跟目前不同的選取（含 nil）一律不聽，不看手指有沒有再按，也不對回。略過記號後面會多「（0.6 秒）」，分得出是哪一道擋的。

-mapSelAll：恢復 72ac06e。行程模式外 MapKit 送什麼就 pins.select 什麼，也不對回。用來對照 M9 的數字，並證實第二筆的來源（配合分支頭現成的「地圖選取 <id>」和「sel A → B」記號）。

-noMapResync（只供量測）：照新的擋法，但不請地圖對回。在 s1b 用不到，結果跟 -mapSel06 一樣；留給打字、點空白等其他情況單獨看對回的效果。

三個開關都只有模擬器和開發版讀得到（Flag 在 Perf.swift）。

**改法**（每段照「原文」找位置；原文是「無」的照「位置」插入）

### T1-1　Perf.swift

**位置**：72ac06e:Perf.swift:22（分支頭 08292cf 同一行）`    @ObservationIgnored private var touchUp: CFTimeInterval = 0`，上一行 :21 是 `@ObservationIgnored private var touchDown: CFTimeInterval = 0`

**改成**：
```swift
    // 手指最後一次按下的時間、位置（視窗座標）。不只量測用：地圖靠它分 MapKit 送來的選取是不是新的一次點擊（PinState.mapLate）。
    // TouchClock 一直裝著（FoodMapApp.swift 裡 Root 的 .task），touched() 在 guard on 之前就記，正式版、沒開浮層也有值：TouchClock 不能改成只在量測時裝
    @ObservationIgnored private(set) var lastDownAt: CGPoint = .zero
    var lastDown: CFTimeInterval { touchDown }
```

**理由**：mapLate 要知道點完圖釘按鈕之後，手指有沒有再按下、按在哪裡，才分得出是 MapKit 晚到的回音，還是新的一次點擊（點空白、影子、名牌）。touchDown 是 private，所以加一個唯讀的 lastDown；位置另外存在 lastDownAt。兩個讀的都是 @ObservationIgnored 的值，不會讓任何畫面多一個觀察依賴。分支頭的 Perf.swift 這幾行跟 72ac06e 一樣，分支頭只在 :213 多一行 printChanges。

### T1-2　Perf.swift

**位置**：72ac06e:Perf.swift:48-50（分支頭同行號）：`func touched(_ down: Bool) {` 開始的三行

**原文**：
```swift
    func touched(_ down: Bool) {
        let t = CACurrentMediaTime()
        if down { touchDown = t } else { touchUp = t }
```

**改成**：
```swift
    func touched(_ down: Bool, at p: CGPoint? = nil) {
        let t = CACurrentMediaTime()
        if down { touchDown = t; if let p { lastDownAt = p } } else { touchUp = t }
```

**理由**：按下時連位置一起記。新參數有預設值，所以另外兩處 `touched(false)`（:159、:165）不用改；放開時不動位置。量測用的 touchDown、touchUp 和印出來的字都沒變。

### T1-3　Perf.swift

**位置**：72ac06e:Perf.swift:152-156（分支頭同行號）：TouchClock 的 `override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent) {`

**原文**：
```swift
    override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent) {
        MainActor.assumeIsolated {
            Perf.shared.touched(true)
        }
    }
```

**改成**：
```swift
    override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent) {
        MainActor.assumeIsolated {
            // 連按下的位置（視窗座標）一起記：地圖分手指按在地圖上，還是按在面板、大卡、搜尋列上（PinState.mapLate）
            Perf.shared.touched(true, at: t.first?.location(in: nil))
        }
    }
```

**理由**：位置在 assumeIsolated 的區塊裡面取，跟原本一樣在主執行緒上，不管 SDK 把 UIGestureRecognizer 標成哪種隔離都編得過。location(in: nil) 回傳視窗座標，跟 SwiftUI 的 .global、MapPanel.top、TripMode.mapTop 是同一套座標（全螢幕視窗）。不用 t.first?.view 判斷是不是按在 MKMapView 裡，因為 72ac06e:SwipeBack.swift:31 寫著「SwiftUI 畫的東西 hitTest 常常直接穿過去打到底下的地圖」，按在面板上時 view 也可能是地圖。

### T1-4　MapTab.swift

**位置**：72ac06e:MapTab.swift:82（分支頭 08292cf:83）`        let _ = pins.cleared`，下一行是 `let gname = store.mapGroupName`

**改成**：
```swift
        let _ = pins.mapSync   // 不聽 MapKit 晚到的選取之後重畫一次，地圖才會把 sel 再設給 MapKit（跟上一行 cleared 同一個道理，見 PinState.mapLate）
```

**理由**：不聽 MapKit 的選取之後，MapKit 自己記的是另一根（或什麼都沒選），pins.sel 卻是按鈕那根。讓 MapTab 重畫一次，Map 會照 get 把 sel 設回 MapKit，做法跟 :1798-1799 的 cleared 一樣（推論非 nil 也會照 get 重設）。加了 -mapSelAll、-mapSel06 或 -noMapResync 時 mapSync 不會變，這一行沒有作用。

### T1-5　MapTab.swift

**位置**：分支頭 08292cf:MapTab.swift:112-117（a5eef80 加的那段，在 a5eef80 裡是 :111-116）：從 `} else if CACurrentMediaTime() - pins.tapAt < 0.6, id != pins.sel {` 到它的 `return` 和右括號為止，下一行 :118 是 `pins.select(id)`。72ac06e 沒有這段，對應位置是 72ac06e:MapTab.swift:110 的 `}`，也就是 :111 `pins.select(id)` 的上一行

**原文**：
```swift
                    } else if CACurrentMediaTime() - pins.tapAt < 0.6, id != pins.sel {
                        // 一般地圖也一樣：手指剛點過圖釘按鈕，MapKit 等完「是不是點兩下」才用手指的位置找圖釘，
                        // 那時地圖已經開始移（收鍵盤、飛過去），會找到旁邊那根或空白：一下選兩間、選了又被 nil 取消。按鈕選的為準
                        Perf.shared.mark("地圖選取略過 \(id.map { String($0.prefix(8)) } ?? "nil") \(Int((CACurrentMediaTime() - pins.tapAt) * 1000))ms")
                        return
                    }
```

**改成**：
```swift
                    } else if pins.mapLate(id) {
                        // 一般地圖：手指剛點過圖釘按鈕，MapKit 晚一步送來的 nil 或另一根不聽（疊在一起的兩根會一下選兩間；
                        // 打字時點圖釘，MapKit 等完「是不是點兩下」才送 nil 和旁邊那根）。手指又按在地圖上就照聽。判斷和對照開關見 PinState.mapLate
                        return
                    }
```

**理由**：第二筆選取唯一可能的來源，就是這個 set 的一般地圖分支。分支頭 a5eef80 那段（純 0.6 秒，不看手指有沒有再按，也不對回）換成 mapLate；加 -mapSel06 時，mapLate 會照原樣做一次，對照得回來。行程模式照舊走 if trip.on 那段（72ac06e:94-110，分支頭 :96-111）。泡泡和站號的 id 在前面就 return 了（72ac06e:91，分支頭 :93），走不到這裡。分支頭 :92 的「地圖選取 <id>」記號照留，mapLate 不再印同樣的字。如果是在 72ac06e 上改，就把 :110 那個 `}`（`if trip.on {` 的右括號，下一行是 :111 `pins.select(id)`）換成這五行。

### T1-6　MapTab.swift

**位置**：72ac06e:MapTab.swift:1873-1878 PinState.tap（`func tap(_ id: String) {` … `if sel == id { again += 1 } else { select(id) }`），加在 :1878 那個右括號之後、前面空一行；分支頭 08292cf 是 :1913-1918。原本接在後面的是 `func fx(_ id: String) -> PinFX {`

**改成**：
```swift
    // 一般地圖（行程模式在 MapTab 的 Map(selection:) 裡另有擋法）：MapKit 自己送來的選取要不要不聽，回傳 true 就不聽。
    // 手指點了圖釘按鈕之後，MapKit 會晚一步自己再選一次：疊在一起的兩根約 40ms 後送來另一根（M9 s1b 15 次都這樣）；
    // 打字時點圖釘，MapKit 等完「是不是點兩下」才送 nil 和旁邊那根（a5eef80）。以按鈕選的為準：手指按下時壓扁、震動的就是那根。
    // 點完圖釘 0.8 秒內、手指沒有再按在地圖上（面板、大卡、搜尋列不算），送來 nil 或另一根就不聽；
    // 手指又按在地圖上（點空白、影子、名牌、圖釘按鈕外的範圍）一律照聽。
    // 對照：-mapSelAll 一律照聽（＝72ac06e）；-mapSel06 照 a5eef80（點完圖釘 0.6 秒內跟目前不同的一律不聽、不對回）；
    // -noMapResync 照樣不聽，但不請地圖對回（量測用）
    @ObservationIgnored private var syncFor: CFTimeInterval = -1   // 為哪一下點擊（tapAt）請地圖對回過：同一下只對一次，不會來回
    @ObservationIgnored private var syncAt: CFTimeInterval = 0     // 請地圖對回的時間：對回時 MapKit 再送來的 nil 也不聽
    private(set) var mapSync = 0                                   // MapTab 看這個：不聽之後重畫一次，地圖把 sel 再設給 MapKit
    func mapLate(_ id: String?) -> Bool {
        if Flag.on("-mapSelAll") { return false }
        let from = tapAt                                           // 從手指最後點圖釘按鈕的時間算
        let now = CACurrentMediaTime()
        let dt = now - from
        let tag = id.map { String($0.prefix(8)) } ?? "nil"
        let ms = dt < 10 ? "\(Int(dt * 1000))ms" : "-"
        if Flag.on("-mapSel06") {
            guard dt < 0.6, id != sel else { return false }
            Perf.shared.mark("地圖選取略過 \(tag) \(ms)（0.6 秒）")
            return true
        }
        if id == sel { return false }                              // 同一根：select 本來就會略過
        if now - max(from, syncAt) >= 0.8 {
            if dt < 2 { Perf.shared.note("地圖選取照聽 \(tag) \(ms) 過了 0.8 秒") }
            return false
        }
        // 點完圖釘之後，手指有沒有再按在地圖看得到的那塊：搜尋列下緣到面板上緣。
        // 面板在最高段不算；還沒量到面板上緣（0）就只看搜尋列
        let p = Perf.shared.lastDownAt
        let mp = MapPanel.shared
        let belowBar = p.y > TripMode.shared.mapTop
        let aboveSheet = mp.top <= 0 || p.y < mp.top
        let onMap = mp.stage != .high && belowBar && aboveSheet
        let pressed = Perf.shared.lastDown > from
        if pressed && onMap {
            Perf.shared.note("地圖選取照聽 \(tag) \(ms) 新的按下 y=\(Int(p.y))")
            return false
        }
        var s = "地圖選取略過 \(tag) \(ms)"
        if pressed { s += " 按在地圖外 y=\(Int(p.y)) 面板上緣 \(Int(mp.top))" }
        Perf.shared.mark(s)
        // MapKit 自己記的選取跟 sel 不一樣了：下一輪讓 MapTab 重畫一次，地圖把 sel 再設回 MapKit（同一下點擊只做一次）
        if syncFor != from, !Flag.on("-noMapResync") {
            syncFor = from
            syncAt = now
            let cur = sel.map { String($0.prefix(8)) } ?? "nil"
            Perf.shared.note("地圖選取對回 \(cur)")
            Task { @MainActor in self.mapSync += 1 }
        }
        return true
    }
```

**理由**：判斷放在 PinState 裡，因為 tapAt 和 sel 都在這裡。重點如下。
(1) nil 要一起擋。不然 MapKit 換根時先送的 nil 會把大卡關掉，接著另一根又被擋，結果什麼都沒選。
(2) 點完圖釘之後，手指又按在地圖看得到的那塊（搜尋列下緣到面板上緣），才算新的點擊，照聽。按在大卡、面板上不算，免得 MapKit 晚到的 nil 在手指底下把卡關掉。
(3) 時間窗 0.8 秒，理由見診斷第 6 點；對回時用 syncAt 稍微延長。
(4) 同一根直接照聽，select 本來就會略過。
(5) 對回放進 Task，不在 MapKit 的回呼裡改被觀察的值；syncFor 讓同一下點擊只對回一次。
(6) 記號：略過用 mark，跟行程模式和 a5eef80 一樣，下一次 tick 會印 ms；照聽、對回用 note。字串用 var 加 if 拼，布林拆成幾個 let，避開 465709d 那種型別檢查太慢的問題。區域變數叫 pressed，不叫 again，因為 PinState 已經有 again 屬性。
(7) `let from = tapAt` 單獨一行。如果 sim B 證實程式選取也會被換掉，只要改這一行（見 risks 第 9 點）。

**模擬器量法**

量法照 perf-round1d 第 5 節：Release＋-Wl,-no_deduplicate、-perfOverlay，每次 terminate 再 launch，「清單掛上 首頁」之後 2.5 秒才動手。在分支頭（08292cf 或更新）加上這個修法再建置。分支頭現成的記號會一起用到：「地圖選取 <id>」（MapKit 每送一次就印，08292cf:92）和「sel A → B」（:1939）。

A. s1b：冷開，全台畫面點嘉義兩根重疊那一帶，位置跟 M9 一樣，點之前先截圖記下位置。
三組輪流跑「不加 → -mapSelAll → -mapSel06」，共 5 輪 15 次。每次要報三樣：select 開始到 +1.0 秒的原始 Console；最後選中哪間（福芳臺菜 6a0b5b6b、松山土窯羊肉 78992479）；錄影，或在點下後 +0.15、+0.4、+1.0、+2.0 秒各截一張。

(1) 證實來源（看 -mapSelAll 組）：應該跟 M9 一樣有兩筆「點圖釘」。推論第二筆前面會看到「地圖選取 nil」「sel <第一間> → nil」「地圖選取 <另一間>」「sel nil → <另一間>」。
- 如果只有「地圖選取 <另一間>」和「sel <第一間> → <另一間>」，沒有 nil：表示 MapKit 沒先送 nil，中間那筆地圖重算另有原因，可以加 -printChanges 看 MapTab 是哪個狀態變了。請把那幾行報給我。
- 如果第二筆前面完全沒有「地圖選取」：診斷錯了，停下來報給我。

(2) 修好的樣子
不加組：只有一筆「點圖釘」「選中」「移地圖」，選中的是按下那根，對照截圖看手指底下、壓扁的是哪根。「sel」只能有一行，不能出現「照聽」。接下來大致依序出現（中間可能夾著掉幀行）：
- 「地圖選取 nil」
- 「地圖選取略過 nil NNms」
- 「地圖選取對回 <選中那間>」
- 「地圖選取 <另一間>」
- 「地圖選取略過 <另一間> NNms」
- 一行「地圖重算」，是對回造成的，可能出現在掉幀行之後。
- 之後可能還有「地圖選取 nil」加「地圖選取略過 nil …」（地圖放掉另一根時送的），以及「地圖選取 <選中那間>」（同一根，不會有略過）。這些都正常。
如果「地圖選取對回」之後 50ms 內沒有「地圖重算」，表示 MapTab 沒有跟著 mapSync 重畫，請報給我。
-mapSel06 組：一樣只有一筆，略過那兩行後面帶「（0.6 秒）」，沒有「對回」，也沒有地圖重算。

(3) 重算次數（看對上 select 開始的那筆掉幀）
- -mapSelAll：約「圖釘 169・地圖 1・大卡 3–4・附近面板 3–4（附近列 0–1）」。如果 (1) 沒看到 nil，地圖可能是 2。
- -mapSel06：約「圖釘 85・大卡 2–3・附近面板 2–3」，沒有地圖。
- 不加：跟 -mapSel06 一樣，另外有「地圖 0–1」。對回那次重畫可能算到下一次沒掉幀的 tick，那就看不到。

(4) 時間：主要報「點圖釘 N ms」。72ac06e 是 65–82（中位 71），A 換 B 是 50–53。推論 -mapSelAll 維持 65–82，-mapSel06 約 40–60，不加約 40–65（對回那次重畫排在 tick 前面的話，會多幾 ms）。
另外報三個數字：那筆長幀幾 ms；緊接著長幀的那筆掉幀（開始時間等於長幀結束）有沒有；select 開始到 +300ms 的掉幀合計，相鄰和不相鄰分開數。
推論：相鄰那筆（72ac06e 15 次有 6 次）多半會不見；長幀 100 那種（地圖重算早於長幀結束，72ac06e 有 4/15）可能少一幀；其他長幀幾乎不變；鏡頭在移那段的掉幀不受影響（A 換 B 只選一次也有）。時間只報，不拿來擋。

(5) 對回要不要留：比不加組和 -mapSel06 組的錄影。
- -mapSel06 在任一時間點看到變淡的另一根蓋在選中那根（放大、有照片、有店名）上面，而不加組沒有：留著。
- 兩組看起來一樣：再看 (6) 裡 -mapSel06 的「1 秒後點空白」。如果也能關，就把對回拿掉（刪 MapTab 的 `let _ = pins.mapSync`，以及 PinState 的 mapSync、syncFor、syncAt 和 mapLate 最後的對回段），並告訴我；如果關不了，就留著。

(6) 點空白（另外跑，不算在上面 15 次裡）
- 不加 2 次：選店 1 秒後點地圖空白，大卡要關。Console 要有「地圖選取 nil」和「地圖選取照聽 nil 1xxxms 過了 0.8 秒」，不能有略過。
- 不加 2 次：選店後 0.2–0.3 秒就點空白，大卡要關。Console 要有「地圖選取照聽 nil NNNms 新的按下 y=…」。
- -mapSel06 跑 1 秒後點 2 次、0.2–0.3 秒後點 2 次，記下有沒有關。推論 0.2–0.3 秒那種不會關，這是分支頭現在的問題。

B. 程式選取會不會也被 MapKit 換掉（分辨推論 (a) 和 (b)）
不加參數，冷開全台畫面，不點圖釘，直接按 🎲。-drawWin 6a0b5b6b-9f02-4988-8147-4bd745e49c40 跑兩次，-drawWin 78992479-7341-49f8-9035-822553be66fd 跑兩次。看「抽一間（抽中）」之後 1 秒內，有沒有「地圖選取 <另一間>」、「sel <抽中那間> → …」或第二筆「選中」。
- 沒有：照現在的修法。
- 有：表示程式選取也會被 MapKit 換掉，照 risks 第 9 點的備案改，並把那幾行報給我。

C. A 換 B 回歸（台北市區，大卡開著直接點另一根單獨圖釘），不加跑 5 次：
- 每次只有一筆點圖釘，不能出現「略過」「照聽」「對回」，也不能有地圖重算。
- 重算維持「圖釘 80・大卡 1・附近面板 1」，「點圖釘 N ms」維持在 50–53 上下。

判定：這是修 bug。A(1) 對得上，A(2)(3)(6)、B、C 和回歸清單都過，就可以上。時間只報，不拿來擋。

**回歸**

1. 疊在一起的圖釘（全台畫面嘉義那兩根），不加參數，冷開點 5 次（sim A 的不加組就算）：
   - 每次只選一間，而且是按下那根；大卡和鏡頭不會中途換店。
   - 選好之後再點同一根：要重新置中、放光圈，不關卡。
   - 再點另一根露出來的部分：要換成那根。
2. 點空白關卡：選店 1 秒後點、選店後 0.2–0.3 秒內點，都要關（sim A(6)）。
3. 點完圖釘 0.3–0.5 秒內點大卡照片：要進店家頁，不能關卡或換店。0.3–0.5 秒內點大卡的 ✕：要關。這段時間 Console 如果有 MapKit 送來的東西，應該是「地圖選取略過 … 按在地圖外 y=… 面板上緣 …」。
4. 只有 MapKit 接得到的地方：
   - 沒選時點圖釘影子、圖釘正下方約 20pt：要開卡。
   - 選了 A 之後 0.5 秒內點 B 的影子：要換成 B，Console 有「地圖選取照聽 … 新的按下」。
   - 點選中那根的店名：行為跟現在一樣。
5. 單獨的圖釘：
   - 沒選時點一根；A 換 B（sim C）；快速連點兩根不同的。最後選中的都是最後按的那根。
   - 兩根單獨但靠得近（中心相距 40–60pt）各點 3 次：選中的是按的那根。
6. 打字時點圖釘（a5eef80 修的情況）：首頁搜尋框打字、鍵盤開著時點一根圖釘，做 5 次。
   - 鍵盤收起，大卡要開著，不能被取消。
   - Console 應該看到 a5eef80 量到的「地圖選取 nil」「地圖選取 <別間>」，後面接「地圖選取略過 …」（不帶「（0.6 秒）」），不能有「照聽 … 新的按下」。
   - 打字時點泡泡、長按圖釘，也要先收鍵盤（3a839aa 的行為）。
7. 點完圖釘 0.3 秒內開始拖地圖：面板會降到最低段；放開後把面板拉回中段，要看得到同一間的大卡。如果大卡不見了，Console 會有「地圖選取照聽 nil … 新的按下」，請報給我（risks 第 4 點）。
8. 長按圖釘開選單：加進行程、導航、看店家都試；放開不算點一下；選單關掉後點空白照常關卡。
9. 🎲 抽一間：-drawWin、跳到一半再按一次直接出結果、大卡上的「再抽一次」、點回抽過的歷史、轉盤、抽 3 間的選中。每一種都只選一次，選中的是抽到的那間。
10. 卡片列：大卡 ✕ 關掉後，卡片列捲到那間；再點同一根要重新打開；關卡後手指捲卡片列，圖釘要跳一下、地圖跟著移（focus）。
11. 篩選把選中的店篩掉，大卡要收起；換看群組的收藏，選取要取消。
12. 點泡泡放大，拆開後點拆出來的圖釘；點拆不開的泡泡，要只列那幾間。
13. 行程模式（這條路沒改，只是確認）：選著店時進行程；行程裡點收藏和搜尋結果要開加站卡；點空白要收加站卡；按「完成」離開後不能殘留大卡。
14. 兩指縮放、放開時手指在圖釘上，不能選到（moving）；拖完地圖馬上點圖釘，要選得到。
15. VoiceOver：點兩下圖釘開卡，換一根，再用 ✕ 關卡。
16. 店家頁推進去再返回：大卡和選中的圖釘維持原樣。
17. 對照開關：
   - -mapSelAll：s1b 要回到兩筆「點圖釘」。
   - -mapSel06：s1b 只有一筆，略過帶「（0.6 秒）」；選店後 0.2–0.3 秒點空白不會關，這是分支頭現在的行為。

**風險**

1. 對回（mapSync）有沒有效是推論。根據只有 :1798-1799 cleared 的註解，說 MapTab 重畫時地圖才會照 get 重設選取；值不是 nil 時會不會也重設，沒有直接證據。如果沒效，MapKit 會一直記著另一根，直到下次 MapTab 重畫。sim A(5) 用 -mapSel06 的錄影對照，決定留不留。

2. 對回會比分支頭多一次 MapTab 重畫，次數跟 72ac06e 一樣。這次重畫因為放在 Task 裡，可能排在掉幀那次 tick 之前，也可能排在之後。成本看 sim A(4)：不加組的「點圖釘 N ms」對 -mapSel06。

3. 這道擋靠 TouchClock 一直裝著（FoodMapApp.swift:67、:73：開 App 時裝一次，1 秒後再裝一次）。如果沒裝上，或以後改成只在量測時裝，lastDown 會一直是 0，永遠不算「新的按下」，擋法就退化成單純的 0.8 秒時間窗（跟分支頭一樣，只是更長）：點完圖釘 0.8 秒內點空白、點影子都會被吞掉。Perf.swift 那行的註解已經寫明不能改。

4. 點完圖釘後馬上拖地圖：拖曳的按下在地圖上，算新的按下。這時如果 MapKit 還有晚到的 nil，會照聽，選取被取消；72ac06e 也一樣，分支頭會擋。回歸第 7 項會看。

5. 「按在地圖上」靠 MapPanel.top 和 TripMode.mapTop 判斷：
   - 加 -holdTop 時，選著店、停在中段不更新 top（:1598），大卡上半部會被當成地圖，只影響那個量測開關。
   - 浮在面板上緣的「行程」「定位」兩顆按鈕算在地圖上，無害。
   - 如果 top 沒跟上（例如面板正在換段），點完圖釘 0.8 秒內點在面板上緣附近的空白，可能被擋一次，再點一次就好。

6. 多根手指：TouchClock 在第一根手指放開時就設成 .failed（Perf.swift:160）。如果另一根手指一直擱在螢幕上，之後新的按下記不到，點完圖釘 0.8 秒內點空白會被擋一次。這次不改，理由見 changelog。

7. 時間窗 0.8 秒：如果 MapKit 比 0.8 秒還晚才送，那一筆會照聽，回到 72ac06e 的行為。Console 會印「地圖選取照聽 … 過了 0.8 秒」，看到了再調。

8. 時間窗內 MapKit 沒經過手指送來的 nil（例如選著的那根被拿掉）也會被擋。我們自己的程式已經會取消選取：篩選是 72ac06e:276（分支頭 :284），換群組是 :484，✕ 是 :1407。如果還有哪條路是靠 MapKit 的 nil 關卡，就會變成關不掉，回歸第 9–11 項會碰到。

9. 推論 (b) 成立的話（MapKit 對程式選取也會換根），抽一間、轉盤、抽過的歷史選中疊著的那根時，也會被換成另一根；這個修法只從點圖釘算，擋不到。sim B 會量。如果證實，備案如下：
   - PinState 加一行 `@ObservationIgnored private var ownAt: CFTimeInterval = 0   // 最後一次選中某根的時間（按鈕、抽一間、MapKit 都算）`
   - select(_:) 的 `guard sel != id else { return }` 後面加 `if id != nil { ownAt = CACurrentMediaTime() }`
   - mapLate 的 `let from = tapAt` 改成 `let from = max(tapAt, ownAt)`
   其他不用動。

10. VoiceOver 開著時，系統不把觸控交給 App，TouchClock 收不到按下。不過 VoiceOver 開圖釘走的是按鈕的動作，不經過 MapKit 的選取，推論影響很小，回歸第 15 項確認。

11. 編譯：
   - touched 的新參數有預設值，原本的 touched(false) 不用改。
   - lastDownAt 是 @ObservationIgnored private(set)，PinState 讀得到。
   - mapLate 讀的 MapPanel.shared、TripMode.shared 都是 @MainActor，PinState 也是 @MainActor。
   - `if let p` 簡寫要 Swift 5.7 以上，Xcode 16 沒問題。
   - Task { @MainActor in self.mapSync += 1 } 裡的 self 是 @MainActor 類別，可以安全跨 Task。
   - 記號字串和布林都拆開寫，避免 465709d 那種型別檢查太慢；只跑 swiftc -parse 抓不到這種問題，要等 Mac 建置確認。

12. 疊在一起時，連點重疊處不會輪流選到下面那根，這是刻意的取捨。根本的做法是讓重排把疊在一起的兩根單獨圖釘也合成泡泡（:917 附近現在刻意不合），但那會改外觀，要先問 Anthony。

## T2 兩根單獨圖釘疊在一起（G9c 做全）

（「看得出的差別」第 4 點和最後一段原本寫要問 Anthony，判斷見開頭「先看這裡」：用方框、行程模式那段這次不做，都不用問。）


**摘要**

72ac06e 的 recluster 只讓泡泡吃旁邊的東西（MapTab.swift:921 `guard items[i].count >= 2`）。兩根單獨的圖釘如果落在不同格子、畫面上又疊在一起，從頭到尾沒有人拿它們互比，所以全台鏡頭裡嘉義那兩根每次開 App 都疊著。修法是讓單根也進合併迴圈：兩根都是單根時照畫出來的圓比（行程模式縮成 0.65 倍，群組地圖有 owner 的連小頭像一起算），只要有一邊是泡泡就照現在的 box() 比，兩種都外擴 3。另外補上兩個會讓新規則失效的時機：離開行程 60ms 後照原大小重新分一次群，教學第一步圈的那根不進格子。對照開關是 -noPinPair，量測開關是 -clusterCheck 和 -clusterBench。這個修法不是為了省時間：推論每次地圖停下，合併迴圈約多 0.1–0.3ms（這個帳號約 170 間）。看得出的差別是嘉義那兩根變成一顆「2」，也不會再點一下就選中兩間。

**看得出的差別**

有看得出的差別。第 1–3、5–7、9 點是已經定案的 G9c 規格（「單根也參與合併、合併後重新比對、跟 Apple 地圖一樣」）或它的直接結果；第 8 點是修 bug。照原則，這些都不用另外問 Anthony。第 4 點（用方框還是用圓判斷）和最後一段（行程模式拆不開）要問他。照實寫如下：
(1) 地圖停下來後，兩根單根的圓（44 圓的外切正方形，外擴 3）碰到了，就合成一顆泡泡。泡泡上的數字是根數，畫在兩間座標的平均點上。因為泡泡畫在中心，位置會比原本兩根圖釘的圓頭低約 29pt。合的時候，兩根先飛進去淡掉，0.33 秒後泡泡彈出來；放大拆開時，圖釘從泡泡的位置飛回去。動畫跟現在泡泡吃掉單根完全一樣。
(2) 全台鏡頭嘉義那兩根（福芳臺菜、松山土窯羊肉）會變成一顆「2」。點它會放大，兩間相距約 19km，一放大就分開。合起來的這一對不會再點一下就選中兩間。但如果兩根沒有合起來、MapKit 的點擊框卻重疊（例如正上下相距 47–51pt，尖角伸進下面那根的圓頂），還是可能一次選兩間，這由選取那一題處理。
(3) 一串互相疊到的單根會合成一顆 N。新合出來的泡泡比兩根圖釘寬，位置也偏下，如果因此碰到旁邊的泡泡，會再合成更大的一顆（例如 2 碰到 5 變成 7）。這就是規格說的「合併後重新比對」。
(4) 判斷用的是方框，不是圓。斜對角的兩根，即使兩個圓之間還空著最多約 21pt，只要 |dx| 和 |dy| 都小於 47 也會合起來。現在泡泡吃單根用的就是這條規則，MapKit 的 MKAnnotationView 預設碰撞也是方框（.rectangle）。如果 Anthony 只要兩個圓真的碰到才合，要問他的就是這一句，改法見 risks 一.1。
(5) 行程模式照畫出來的小圓（0.65 倍）判斷，小圓碰到才合成灰色「+2」。進行程後鏡頭框好、停下來時，原本在一般模式合成「2」、變淡後不再碰到的兩根，會從泡泡裡飛出來。
(6) 離開行程：按「完成」約 0.06 秒後，在行程裡因為縮小而沒合、長回原大小後會疊到的單根，會飛進去，約 0.4 秒後變成一顆「2」，跟圖釘長回原大小同時進行；鏡頭不動。72ac06e 沒有這一步，因為那時單根本來就不互比，疊著也不管。
(7) 群組地圖：有 owner 的單根連右上角的小頭像一起算，所以合的距離比一般模式多幾 pt；沒有 owner 的店（不畫頭像）照圓本身算。
(8) 教學第一步（修 bug）：圈起來的那根不再被合進泡泡。進第一步時，如果它在泡泡裡，會飛出來單獨畫；離開第一步後，再照規則合回去。72ac06e 遇到兩間在同一格時，會圈到泡泡旁邊的空地。
(9) 合進新「2」的店，卡片列停在它的時候，地圖上的圖釘不會跳（泡泡裡的店現在就是這樣，:1021）。抽一間時會輪流跳的圖釘，也只從還看得到的單根挑（:556），所以跳的根數可能變少。
(10) 畫面外（國外、別的城市）疊到的單根也會合起來。這看不到，但活著的 FoodPin 會變少，選店那一幀的「圖釘 N」跟著變少，會影響 M9 的量測（見 sim I）。
其他都不變：泡泡的樣子、點泡泡怎麼放大、怎麼選圖釘、各個時機。
不在這次修法裡、之後要問 Anthony 的一件事：行程模式沒有「這裡有 N 間」（:1005 `if !trip.on`）。推論：兩間相距不到約 24–32m 時，點「+2」放大後還是「+2」，再點也一樣，只能兩指再放大，或用行程搜尋（搜到的照常大小、不會被合）。兩間在同一格時現在就已經是這樣，這次只是多了跨格的情況。要不要讓行程模式拆不開時放大到 0.001（G9c 第 4 段那個下限）？這會是看得出的差別，要問他，這次不做。

**對照開關**

-noPinPair：加了這個參數就恢復成 72ac06e 的行為，三件事一起退回：(1) 只有泡泡會吃旁邊的，兩根疊在一起的單根照舊不合；(2) 教學第一步圈的那根照舊會被合進泡泡，coachStep 變的時候只量位置、不重新分群；(3) 離開行程時不重新分群。這時嘉義那兩根又會疊在一起，M9 s1b「點一下選兩間」的場景也能重現。跟 72ac06e 比，加了 -noPinPair 之後只多兩件事：建 dr 陣列（O(n)），以及 Perf 開著時每次分群多印一行「分群」記號。
另外有兩個純量測開關，都要先開 -perfOverlay（Perf 開著）才有作用，也都不改分群結果：
- -clusterCheck：在「分群」記號後面加「框重疊 泡泡 a・單根 b」，以及「單根合：甲＋乙、…」。照證明，不加 -noPinPair 時框重疊一定是 0/0，這只是程式的自我檢查，不是畫面驗收。加了 -noPinPair 時，「單根」那一項大於 0，就是這次要修的地方。逐對檢查是 O(n²)，只在截圖那幾輪加。
- -clusterBench：同一份輸入先跑一次 72ac06e 的舊迴圈並計時，跑完還原，記號後面加「舊迴圈 Z ms」，可以跟「合併迴圈 Y ms」成對比較。那一次分群會多做一份工，量掉幀的那幾輪不要加。

**改法**（每段照「原文」找位置；原文是「無」的照「位置」插入）

### T2-1　MapTab.swift

**位置**：72ac06e:278，`                .onChange(of: store.coachStep) { pinFrame(proxy) }`（上一行 :277 是 `.onChange(of: list.map(\.id))` 的右括號 `                }`，下一行 :279 是註解「選到一根圖釘：地圖移過去、放光圈…」）

**原文**：
```swift
                .onChange(of: store.coachStep) { pinFrame(proxy) }
```

**改成**：
```swift
                // 教學第一步圈的那根不合進泡泡：進、出第一步都重新分群（-noPinPair 照舊只量位置）
                .onChange(of: store.coachStep) { old, now in
                    pinFrame(proxy)
                    if old == .pin || now == .pin, !Flag.on("-noPinPair") { recluster(proxy) }
                }
```

**理由**：這一項配合第 4、5 項：教學第一步一開始，那根會從泡泡裡拆出來，單獨畫出來，教學圈的就是它；離開第一步時（進下一步或按略過），它照規則合回去。只有進入或離開 .pin 時才重算，其他步驟不多做事。冷開時如果正在播落下動畫，recluster 會自己等播完（:872-878）。`store.coachStep == .pin` 這種寫法 :1080 已經用過。加了 -noPinPair 時只跑 pinFrame，跟 72ac06e 一樣。

### T2-2　MapTab.swift

**位置**：72ac06e:309-313，從 `                .onChange(of: "\(trip.on)|\(foundIds.sorted().joined(separator: ","))", initial: true) {` 到它的右括號 `                }`（上面 :307-308 是註解「行程模式：其他收藏縮小變淡…」「地圖上的圖釘不會跟著 MapTab 重畫…」，下一行 :314 是 MapReader 的右括號 `            }`）

**原文**：
```swift
                .onChange(of: "\(trip.on)|\(foundIds.sorted().joined(separator: ","))", initial: true) {
                    quiet.hush()
                    pins.dimAll = trip.on
                    pins.bright = foundIds
                }
```

**改成**：
```swift
                .onChange(of: "\(trip.on)|\(foundIds.sorted().joined(separator: ","))", initial: true) {
                    quiet.hush()
                    // 離開行程：圖釘從 0.65 倍長回原大小，單根對單根要照原大小重比（離開時鏡頭不動、名單也可能沒變，不會自己重新分群）。
                    // 晚 60ms 再做，按「完成」那一幀不多做事；-noPinPair 照舊不重算
                    let leaving: Bool = pins.dimAll && !trip.on
                    pins.dimAll = trip.on
                    pins.bright = foundIds
                    if leaving, !Flag.on("-noPinPair") {
                        Task { try? await Task.sleep(for: .milliseconds(60)); if !trip.on { recluster(proxy) } }
                    }
                }
```

**理由**：第 6 項的 dr 在行程模式照 0.65 倍判斷，離開行程時要照原大小再判斷一次，不然中心相距 31.6 到 47pt 的兩根會疊著，一直到下次鏡頭停下。`pins.dimAll` 只有這裡會寫（PinState 在 :1815），onChange 跑的時候它還是舊值，所以 `pins.dimAll && !trip.on` 就是「剛離開行程」；initial 那一次 dimAll 是 false，不會觸發。晚 60ms 是為了不在按「完成」那一幀多做事。60ms 內又進了行程，就由 `if !trip.on` 擋掉。寫在 MapReader 裡面，proxy 才拿得到；:234 已經有同樣的 `Task { ...; recluster(proxy) }` 寫法。加了 -noPinPair 不重算，跟 72ac06e 一樣。

### T2-3　MapTab.swift

**位置**：72ac06e:881，recluster 裡 `        guard let r = store.mapRegion ?? shownRegion else { return }`（上一行 :880 是註解「格子釘在地圖上（不是螢幕上）……」，下一行 :882 是 `        let cell = pow(2, ceil(log2(...`）

**改成**：
```swift
        let t0 = CACurrentMediaTime()     // 量測：下面「分群」記號用（從這裡算到合併迴圈結束）
```

**理由**：這是第 6 項「分群 X ms」的起點。它包含 :887 起每間店的 proxy.convert、分格、排序、加總，這些不管加不加 -noPinPair 都一樣要做；合併迴圈另外用 t1、t2 量。這一行不改行為。

### T2-4　MapTab.swift

**位置**：72ac06e:886，`        let keep: Set<String> = trip.on && trip.searchOn ? Set(trip.search.found.map(\.id)) : []`（上一行 :885 是註解「行程模式搜到的收藏不合進泡泡（要看得到）」，下一行 :887 是 `        for p in currentList {`）

**改成**：
```swift
        // 教學第一步圈的那根不合進泡泡（圈的是它的座標，合進去就圈到空地）；-noPinPair 照舊
        let coachId: String? = !Flag.on("-noPinPair") && store.coachStep == .pin ? store.coachPlace?.id : nil
```

**理由**：教學第一步要圈的那間店（Store.swift:88 `var coachPlace: Place?`，Coach.swift:26 的 coachStep）。recluster 不在 body 裡，這裡讀 store 不會多掛 Observation 依賴。加了 -noPinPair 時 coachId 是 nil，第 5 項的條件永遠成立，跟 72ac06e 一樣。

### T2-5　MapTab.swift

**位置**：72ac06e:889，`            guard p.id != pins.sel, p.id != pins.extra, !keep.contains(p.id) else { continue }`（上一行 :888 是 `if let pt = proxy.convert(...) { pts[p.id] = pt }`）

**原文**：
```swift
            guard p.id != pins.sel, p.id != pins.extra, !keep.contains(p.id) else { continue }
```

**改成**：
```swift
            guard p.id != pins.sel, p.id != pins.extra, !keep.contains(p.id), p.id != coachId else { continue }
```

**理由**：教學那根跟選中的、extra 一樣不進格子，也不是障礙。它的螢幕點還是會記進 pts（上一行），所以拆出來時從泡泡飛回自己位置的動畫照舊。String 和 String? 可以直接比，`p.id != pins.extra` 就是這樣寫的。

### T2-6　MapTab.swift

**位置**：72ac06e:918-926，從 `        var i = 0` 到 while 迴圈的右括號 `        }`（上一行 :917 是 box() 的右括號 `        }`，下一行 :927 是 `        let groups = items.filter { $0.count >= 2 }`）。:908-917 的 box() 註解和函式一個字都不動

**原文**：
```swift
        var i = 0
        while i < items.count {
            // 只有泡泡會吃掉旁邊的（兩根單獨的圖釘靠近不合，交給格子）；吃了一個就重新量一次
            guard items[i].count >= 2, let a = box(i)?.insetBy(dx: -3, dy: -3),
                  let j = items.indices.first(where: { $0 != i && box($0).map { a.intersects($0) } == true }) else { i += 1; continue }
            items[i] += items[j]; sum[i].x += sum[j].x; sum[i].y += sum[j].y; cnt[i] += cnt[j]
            items.remove(at: j); sum.remove(at: j); cnt.remove(at: j)
            if j < i { i -= 1 }
        }
```

**改成**：
```swift
        // 量測（-clusterBench）：同一份輸入先照 72ac06e 的舊迴圈跑一次、計時，跑完還原，分群結果不受影響。
        // 這次分群會多做一次舊迴圈，量掉幀的那幾輪不要加
        var oldMs: Double = -1
        if Perf.shared.on && Flag.on("-clusterBench") {
            let keepItems = items, keepSum = sum, keepCnt = cnt
            let b0 = CACurrentMediaTime()
            var q = 0
            while q < items.count {
                guard items[q].count >= 2, let a = box(q)?.insetBy(dx: -3, dy: -3),
                      let j = items.indices.first(where: { $0 != q && box($0).map { a.intersects($0) } == true }) else { q += 1; continue }
                items[q] += items[j]; sum[q].x += sum[j].x; sum[q].y += sum[j].y; cnt[q] += cnt[j]
                items.remove(at: j); sum.remove(at: j); cnt.remove(at: j)
                if j < q { q -= 1 }
            }
            oldMs = (CACurrentMediaTime() - b0) * 1000
            items = keepItems; sum = keepSum; cnt = keepCnt
        }
        let t1 = CACurrentMediaTime()     // 量測：合併迴圈從這裡算（含下面 dr 的準備）
        // 單根對單根比的框：圖釘畫出來的圓（44 的圓在座標點上面，底部尖角 7）。行程模式其他收藏縮成 0.65 倍
        // （以底部尖端為準縮，跟 FoodPin 的 scaleEffect 一樣）；群組地圖有 owner 的店右上角多一個小頭像（往右多 6、往上多 4），
        // 沒有 owner 的不畫頭像就不算。只有單根有，合成泡泡後清成 nil
        let ps: CGFloat = trip.on ? 0.65 : 1
        let grp: Bool = store.mapGroupName != nil
        var dr: [CGRect?] = items.indices.map { (k: Int) -> CGRect? in
            guard items[k].count == 1, cnt[k] == 1 else { return nil }
            let f: CGFloat = grp && items[k][0].owner != nil ? 1 : 0
            let c: CGPoint = sum[k]
            let w: CGFloat = (44 + 6 * f) * ps
            let h: CGFloat = (44 + 4 * f) * ps
            return CGRect(x: c.x - 22 * ps, y: c.y - (51 + 4 * f) * ps, width: w, height: h)
        }
        // 量測對照 -noPinPair：恢復成只有泡泡會吃，兩根疊在一起的單根照舊不合
        let pairs: Bool = !Flag.on("-noPinPair")
        let n0: Int = items.count
        let logPairs: Bool = Perf.shared.on && Flag.on("-clusterCheck")
        var pairNames: [String] = []      // 量測（-clusterCheck）：單根對單根合起來的是哪兩間
        var i = 0
        while i < items.count {
            // 泡泡吃掉疊到的；兩根疊在一起的單根也合成一顆（跟 Apple 地圖一樣）。吃了一個就重新量一次。
            // 比法：兩個都是單根照畫出來的圓（dr），有泡泡的照 box()，都外擴 3。照固定順序比完才往下，結束時任兩個都不疊
            let d: CGRect? = pairs ? dr[i]?.insetBy(dx: -3, dy: -3) : nil
            guard items[i].count >= 2 || d != nil, let a = box(i)?.insetBy(dx: -3, dy: -3),
                  let j = items.indices.first(where: { (k: Int) -> Bool in
                      if k == i { return false }
                      if let s = d, let o = dr[k] { return s.intersects(o) }
                      guard let bk = box(k) else { return false }
                      return a.intersects(bk)
                  }) else { i += 1; continue }
            if logPairs, dr[i] != nil, dr[j] != nil, let x = items[i].first, let y = items[j].first {
                pairNames.append(x.name + "＋" + y.name)
            }
            items[i] += items[j]; sum[i].x += sum[j].x; sum[i].y += sum[j].y; cnt[i] += cnt[j]
            dr[i] = nil
            items.remove(at: j); sum.remove(at: j); cnt.remove(at: j); dr.remove(at: j)
            if j < i { i -= 1 }
        }
        let t2 = CACurrentMediaTime()
        // 量測（-perfOverlay）：分群花多久（合併迴圈另外算）、這時的經度寬、幾格合成幾個。加 -clusterCheck 再數結束時框還重疊的對數
        // （跟迴圈同一條規則：兩根單根照 dr、有泡泡的照 box()），並列出單根對單根合起來的是哪幾對。
        // 「框重疊」照證明一定是 0，只用來抓程式寫錯（dr 和 items 沒對齊之類）；畫面上有沒有疊要看截圖
        if Perf.shared.on {
            let ms: Double = (t2 - t0) * 1000
            let loopMs: Double = (t2 - t1) * 1000
            var tail = ""
            if Flag.on("-clusterCheck") {
                var bp = 0, pp = 0
                for x in items.indices {
                    for y in items.indices where y > x {
                        if let p = dr[x], let q = dr[y] {
                            if p.insetBy(dx: -3, dy: -3).intersects(q) { pp += 1 }
                        } else if let p = box(x), let q = box(y), p.insetBy(dx: -3, dy: -3).intersects(q) {
                            bp += 1
                        }
                    }
                }
                tail = "，框重疊 泡泡 \(bp)・單根 \(pp)"
                if !pairNames.isEmpty { tail += "，單根合：" + pairNames.joined(separator: "、") }
            }
            let nb: Int = items.filter { $0.count >= 2 }.count
            let head: String = String(format: "分群 %.2f ms（合併迴圈 %.3f ms），經度寬 %.4f，%ld 格合成 %ld 個（泡泡 %ld），合併 %ld 次",
                                      ms, loopMs, r.span.longitudeDelta, n0, items.count, nb, n0 - items.count)
            let old: String = oldMs >= 0 ? String(format: "，舊迴圈 %.3f ms", oldMs) : ""
            let mode: String = pairs ? "" : "（-noPinPair）"
            Perf.shared.note(head + old + tail + mode)
        }
```

**理由**：這一段改了下面幾件事：(1) 單根也可以當吃的那一方。(2) 兩個都是單根時改用 dr 比。dr 在一般模式、不是群組地圖時，跟 box() 的單根框一模一樣；行程模式縮成 0.65 倍，因為變淡的圖釘只畫 28.6pt（:2030）；群組地圖只有那根自己有 owner 時才把小頭像算進去（:115 `p.owner.map`、:2082 `Avatar(...size: 20).offset(x: 6, y: -4)`）。(3) 只要有一邊是泡泡就照舊用 box()，所以泡泡吃東西的規則一點都沒變。(4) 量測：t1、t2 把合併迴圈單獨計時；-clusterBench 用同一份輸入先跑一次舊迴圈再還原，得到成對的數字；-clusterCheck 會列出框還重疊的對數和「單根合：」名單；記號裡另外印這時的經度寬，給 sim D 用。closure 裡的變數名稱用 o、bk，不去蓋掉外層的 r，因為記號要印 r.span。

證明。先定義 R(x,y)：兩個都是單根（dr 都不是 nil）時，看 dr[x] 外擴 3 有沒有碰到 dr[y]；否則看 box(x) 外擴 3 有沒有碰到 box(y)。R 只看兩個項目自己的內容（店、點的加總、個數、單根那間有沒有 owner），跟它們排第幾無關。R 也是對稱的：「A 外擴 3 碰到 B」和「B 外擴 3 碰到 A」是同一組不等式（a0−3<b1 等同 a0<b1+3，四條都一樣）。
(a) 一定會結束。令 Φ = 2×items.count − i。合併一次，count 少 1、i 最多少 1，所以 Φ 至少少 1；沒合併時 i 加 1，Φ 也少 1。迴圈條件保證 i ≤ count，所以 Φ ≥ 0。迴圈最多跑 2n−1 圈（n＝一開始的格子數），合併最多 n−1 次。
(b) 結束時任兩個都不疊。迴圈裡只有 items[i] 會被改。i 往後走一格（沒找到疊到的）叫做「通過」。j<i 時 i−1 只是讓 i 繼續指著同一個項目，所以通過的項目 index 永遠小於 i，內容不會再變；不過它們還是可能在之後 j<i 時被吃掉（移除）。結束時 i＝count，每個留下來的都剛好通過一次。任取兩個留下的 X、Y，設 Y 比較晚通過。Y 通過那一刻，X 已經通過、還在，而且已經是最後的樣子；Y 通過代表那時 R(Y,X) 不成立。之後兩個都不再變，再加上對稱，R(X,Y) 也不成立。
(c) 順序固定。items 照 :897 的 order 排，dr 照同一個順序建，first(where:) 一定拿 index 最小的。每一步只看座標，跟字典順序、第幾次開 App 都無關。平移時格子不變、所有點一起平移，R 的結果不變，所以拖走再拖回來是同一個結果（剛好落在門檻上、差 1e-9pt 量級的除外）。
(d) 跟 72ac06e 的關係。order 是家數多的先，所以泡泡全部排在單根前面。迴圈只改 items[i]，所以輪到第一根單根時，它後面全是原封不動的單根。在那之前兩版每一步都一樣：泡泡的 d 是 nil，比法逐字相同。之後 72ac06e 全部跳過，新版只會再合。所以新版是在 72ac06e 的結果上再往上合：藏起來的店只多不少，FoodPin 只少不多，合併次數不會比 72ac06e 少；嘉義那一對讓全台鏡頭至少多 1 次。
(e) 加 -noPinPair 時，d 一律是 nil，guard 退回 `items[i].count >= 2`，closure 退回「box(k) 跟 a 比」，跟 :921-922 等價；dr 只是在記帳。另外，一根留到最後的單根（例如被點選前畫面上看得到的那根）從沒當過 j，自己通過時也沒合到別人；把它從輸入拿掉，其他項目每一步拿到的 j 都不變。所以「點圖釘後鏡頭停下，:956 的 guard 直接 return、地圖 +0」照舊成立。

離線驗證：照這段改寫了 Python 原型 /tmp/claude-0/-home-user-open-apps/df746e45-2da6-58f3-97a4-9c3f2d7d6dbc/scratchpad/g9d/sim3.py（照 72ac06e 的分格、排序、box()，每根各自看 owner）。400 組隨機資料（20–300 間，6 種縮放，含行程模式和群組地圖、七成有 owner）結束時，R 成立的對數都是 0，圈數都不超過 n＋3；打亂輸入順序、整體平移之後，結果都跟原本相同。這只是模型，不能取代模擬器。整段程式套到 72ac06e 副本後的樣子在 /tmp/claude-0/-home-user-open-apps/df746e45-2da6-58f3-97a4-9c3f2d7d6dbc/scratchpad/g9final/MapTab_patched.swift。

**模擬器量法**

共通設定：照 perf-round1d 第 5 節，Release 加 -Wl,-no_deduplicate，iPhone 17 模擬器，60Hz，加 -perfOverlay。每次先 terminate 再 launch，等「清單掛上 首頁」之後 2.5 秒才動手。截圖用 `xcrun simctl io booted screenshot`。每次分群都會印一行「分群 X ms（合併迴圈 Y ms），經度寬 W，N 格合成 M 個（泡泡 K），合併 C 次」，後面可能再接「，舊迴圈 Z ms」「，框重疊 泡泡 a・單根 b，單根合：…」「（-noPinPair）」。開關的用法：-clusterCheck 只在截圖那幾輪加；-clusterBench 只在 H1 加；量掉幀的那幾輪兩個都不加。
重要：「框重疊」是程式的自我檢查，不是驗收。照證明，不加 -noPinPair 時它一定是 0/0；不是 0/0 代表程式寫錯，請回報給我。畫面有沒有疊一律看截圖：截圖上疊了就算失敗，即使記號是 0/0 也一樣。泡泡實際畫出來的寬度、行程「+N」實際只有 30pt、aside() 推開之後的位置、尖角，這些 box() 都沒算到，只有截圖看得到。

A. 全台（M13-1 那個鏡頭）重開：「不加」和「-noPinPair」交錯，各 5 次，共 10 次開 App，都加 -clusterCheck。每次開好後不要動，截一張，記下最後一行「分群」。
- 兩組的「N 格」要一樣，因為是同一個冷開鏡頭。不一樣代表鏡頭不同，那一次作廢重來。
- -noPinPair 組：截圖要跟 M13-1 一樣，嘉義兩根疊著；記號是「框重疊 泡泡 0・單根 ≥1」。這也順便確認 M9 冷開的鏡頭就是 M13-1 的鏡頭。
- 不加組：嘉義只剩一顆「2」，5 張截圖的泡泡成員、數字、顏色、圖示完全一樣。記號是「框重疊 泡泡 0・單根 0」，而且有「單根合：福芳臺菜＋松山土窯羊肉」；兩個名字的先後照 index 排，5 次要一樣。如果「單根合」還列了別的店，那是畫面外也合了，請把整份名單抄給我。
- 合併次數：不加組至少要比 -noPinPair 組多 1（證明 (d)），個數也相應少。
- 分群 ms：全台的格子很少，推論兩組都在 0.5ms 以下，合併迴圈在 0.05ms 以下。這項只報不判。

B. 北部（桃園到基隆一個畫面，經度寬約 1.0）、台北市區（大安信義，經度寬約 0.15）、M9 A換B 的縮放（緯度寬 0.07）：每種縮放各截一張，不加和 -noPinPair 各一次，都加 -clusterCheck。
- 驗收看截圖：放大來看，圓和圓、圓和泡泡、泡泡和泡泡之間都要有空隙。
- 允許的例外：正上方那根的尖角碰到下面那根的圓頂（4pt 以內，會被南邊那根蓋住）；選中的那根（放大 1.35 倍加店名牌）、抽中被篩掉的店（extra）旁邊被壓到。這些不是障礙，跟現在一樣。
- 每張回報「N 格合成 M 個（泡泡 K）」、合併次數、「單根合」名單，以及兩組的合併次數差。

C. 拖走拖回：B 的三種縮放各做一次。把地圖往旁邊拖三分之一，停 1 秒，再拖回來，重複 3 次。每次停下都截圖並記下「分群」。合成幾個、泡泡幾顆、「單根合」名單、截圖都要一樣；停下 0.33 秒後也不能自己換樣子（M13 (5)）。

D. 點新的「2」。挑店對時用度數，不要只看公尺：:1002 的 tight 是經、緯兩個方向分開跟 0.0005° 比。
- D1：全台點嘉義那顆「2」。Console 要出現「點泡泡 2 間」，不能有「泡泡列出」，也不能再有兩筆「點圖釘」。放大後，兩根從泡泡的位置飛回自己的位置。
- D2：從資料（Supabase food.places 的 lat、lng）在台北市區找兩對收藏。
 (i) Δlat 和 Δlng 都小於 0.0005° 的一對（例如相距 20–35m）：縮到它們合成「2」再點。第一次點就要出現「泡泡列出 2 間」，卡片列寫「這裡有 2 間・擠在同一處」。放大後可能還是「2」，也可能拆開，兩種都算對。點其中一張卡片要出現「拆泡泡」，那根和光圈一起冒出來。
 (ii) 有一個方向 ≥0.0005°、另一個方向很小的一對（例如東西向 60m，在台北約 0.00059° 經度）：第一次點不能出現「泡泡列出」。推論放大後的比例約 1.0–1.33pt/m，60m 就是 60–80pt，應該會拆開。如果放大後還是「2」，再點一次要出現「泡泡列出 2 間」（again 那條路）。
 每一對都回報 Δlat、Δlng、放大後那一行「分群」裡的經度寬，以及放大後有沒有拆開。
- D3（選做，結果給選取那一題，不算這題的失敗）：不加參數時，找一對正上下排列、相距約 48–50pt、沒有合起來的單根。手指點在上面那根的尖角和下面那根的圓頂重疊的那一條上，看會不會出現兩筆「點圖釘」。

E. 行程模式：開一個 3 站以上的行程，縮到看得到所有站。不加和 -noPinPair 各截一張，都加 -clusterCheck。
- 驗收看截圖：兩張的差別只能是「變淡的小圓真的碰到了」的那幾根變成灰色「+2」。站號旁邊要特別放大看，因為 aside() 是在合併之後才把泡泡推開（:930-947），log 看不到推開後的位置。
- 點一顆「+2」：地圖放大，加站卡不收。記下那兩間的 Δlat、Δlng，以及放大後是不是還是「+2」。這項只回報給我，不算失敗。
- 離開行程：用一個當天沒有收藏站的行程（新行程，或當天只有搜尋點）。先在行程裡縮放到有兩根變淡圖釘的中心相距約 35–45pt（變淡時不會合、原大小會疊），停 1 秒，再按「完成」。不加：「離開行程」之後約 60ms 會有一行「分群」，那兩根在約 0.4 秒內飛進去變成「2」，1 秒後截圖不能疊。-noPinPair：「離開行程」之後沒有「分群」，那兩根以原大小疊著，一直到下次拖地圖才會變。再用一個當天有收藏站的行程試一次：不加時會有兩行「分群」（名單變了一次、60ms 後又一次），泡泡在約 0.4 秒內換上，不能閃。

F. 群組地圖（圖釘有小頭像）：台北市區縮放截一張，加 -clusterCheck。小頭像不能壓到旁邊單根的圓。

G. 減少動態：打開後縮小，讓兩根合成「2」：要 0.2 秒滑進去淡掉，泡泡不彈；放大拆開時，圖釘直接出現，不飛。

H. 效能
- H1 合併迴圈（成對量，不受鏡頭影響）：加 -clusterBench，不加 -clusterCheck，也不加 -noPinPair。固定步驟：冷開 → 等 2.5 秒，記全台那一行 → 點「61」（zoom() 的目標只看那 61 間的座標，每次都一樣）→ 停下後記一行 → 兩指放大到台北市區（經度寬約 0.15），停下記一行 → 再放大到街道（經度寬約 0.01，幾乎每間一格），停下記一行。重開 5 次。每一行同時有「合併迴圈 Y ms」（新版）和「舊迴圈 Z ms」（同一份輸入跑 72ac06e 的迴圈）。每種縮放報 Y−Z 的中位數、「N 格」，以及這個帳號實際有幾間（推論約 170 間，不要寫 300 間）。
 判準：Y−Z 的中位數要小於 1ms。推論台北市區多 0.1–0.3ms，街道多 0.1–0.2ms。如果 Y 的中位數超過 2ms，把 N 和 ms 報給我，那時再改用「框先算好」：加 `var bx: [CGRect?] = items.indices.map { box($0) }`，迴圈裡的 box(i)、box(k) 換成 bx[i]、bx[k]，合併後做 `bx[i] = box(i)` 和 `bx.remove(at: j)`，行為不變。注意：舊迴圈先跑、新迴圈後跑，快取對新迴圈稍微有利，差距在微秒級。
- H2 停下那一幀（這個修法自己的 A/B，只報不判）：不加 -clusterBench，也不加 -clusterCheck。路徑：冷開 → 等 2.5 秒 → 🎲（-drawWin Mercer Brunch）→ 等鏡頭停 → 按 ✕ → 等 1 秒 → 把地圖往左拖約 100pt 後放開。推論：從冷開鏡頭（24.16,121.17，緯度寬 2.31）到 Mercer Brunch 不算遠（緯度差約 0.9，門檻是 0.6×2.31≈1.39），會走 :719 的 0.55 秒平移，兩組都停在同一個 aim() 目標，不受嘉義變泡泡影響。不加和 -noPinPair 交錯，各量 5 次。每次報：🎲 停下那一幀、放開後停下那一幀的「掉幀 N ms」和「重算 …圖釘 N…」，那時的「分群」行（合併迴圈和 N 格），以及後面有沒有「泡泡換上」。比較中位數，而且只有兩組「圖釘 N」一樣時才直接比毫秒。如果差超過 1 幀，請分開回報合併迴圈的差（H1 推論小於 1ms）、「圖釘 N」的差、「泡泡換上」有沒有出現，讓我判斷是迴圈慢、合的根數不同，還是雜訊。另外注意：-drawWin 跳的 7 根是從沒藏起來的圖釘裡挑的（:556-558），兩組跳的圖釘會不同；這段發生在 select 之前，不影響放開後那一幀。這條路徑沒有 72ac06e 的舊數字，這次量到的就是新基準。

I. M9／M10 量測（跟 72ac06e 或其他修法比的時候）：
- s1b → s2b → M10 降落、M10 小幅平移、M9 A換B，一律加 -noPinPair。不要改點別根，例如「61」左邊那根（約在桃園）：點它之後，鏡頭中心離 Mercer Brunch 太近，s2b 不會遠飛（:697 的 far 門檻），M10 降落那一筆就量不到。也不要照新行為去點嘉義的「2」：那會走 zoom()、沒有大卡，s2b 會從放大後的鏡頭起飛，降落時的範圍和「附近 66 間」都會變。
- 不加參數時，這個修法會讓活著的 FoodPin 變少（畫面外的也會合，證明 (d)），所以 s1b、s2b、A換B 選店那一幀的「圖釘 N」會變少，時間可能跟著變短。這是根數變了，不是別題修好的。不加參數的數字一定要附上「圖釘 N」；N 跟對照組不同，就不能直接比毫秒。
- s2b 用 -drawWin 時，跳哪幾根會隨合併改變（canHop 不含藏起來的），所以 s2b 要跟 72ac06e 比也要加 -noPinPair。
- 另一題（一次選兩間）要重現，也要加 -noPinPair。
- A換B 開始前，先確認 ED’s Diner 和白寶奶奶港式菠蘿包還是單根。加了 -noPinPair 時，這點跟 72ac06e 一樣。

**回歸**

1. 縮小時，圖釘先飛進泡泡、淡掉，0.33 秒後泡泡彈出；放大時，拆出來的圖釘從泡泡的位置飛回去（setMerge、flyFrom）。單根合成的新「2」也要一樣。縮小放手後 330ms 內馬上放大，不能有圖釘卡在透明或偏掉的位置。
2. 冷開時，落下動畫播完才合泡泡（pins.dropping 那段沒動）。
3. 點圖釘不重算：在台北市區點一根旁邊有泡泡的單根，鏡頭停下後「地圖」body 次數 +0，泡泡不跳，跟 -noPinPair 一樣。選中一根之後再縮到北部，它不會被併進泡泡。
4. 抽一間抽中「2」或其他泡泡裡的店：要出現「拆泡泡」，那根和光圈同一刻出現。轉盤、抽 3 間、從「抽過」點回去，各試一次。抽中被篩掉的店（extra）照樣畫出來，而且不被合。
5. 卡片列停在某間時，泡泡裡的店（包括新「2」裡的）圖釘不跳，看得到的單根照樣跳一下。抽一間時，輪流跳的只從看得到的單根挑。
6. 點拆不開的泡泡：出現「這裡有 N 間」，按 ✕ 會退出，拖地圖也會退出；換群組、進出行程都會清掉。
7. 篩選、搜尋字改變（名單變了）時重新分群；換看誰的收藏時，重新框地圖、重新分群。
8. 行程模式：點變淡的收藏會開加站卡；行程搜到的（keep）照常大小，不被合；站號旁邊的「+N」照舊推開；點「+N」不會收掉加站卡和搜尋。進行程、鏡頭框好之後，原本合成「2」、變淡後不再碰到的兩根會拆開。
9. 離開行程：當天沒有收藏站的行程，按「完成」約 0.06 秒後，疊到的單根飛進去變成「2」，鏡頭不動。當天有收藏站的行程，泡泡在約 0.4 秒內換上，不閃。按「完成」後 60ms 內又進行程，不能重新分群（Console 不會有「分群」）。出發中按「結束」、走到最後一站自動結束，結果也要一樣。
10. 減少動態：合併時淡掉，拆開時不飛。
11. VoiceOver 讀新的「2」，要讀成「2 間店，點了放大」（:2354）。
12. 教學第一步（新帳號、兩間收藏靠得很近，同一格和跨格兩種都試）：圈起來的那根圖釘要單獨畫出來、看得到，點了能進下一步；進下一步後，那根照規則合回去（飛進泡泡）。第一步按「略過」也要合回去。加 -noPinPair 時要跟 72ac06e 一樣。
13. 取消選取（大卡按 ✕）之後拖一下地圖，剛才那根要照新規則跟旁邊的單根合起來（M10 小幅平移那筆「泡泡換上」就是這件事）。

**風險**

一、第 (2) 題逐項檢查
1. 判斷用方框：照題目指定的 box() 寫法，斜對角、兩個圓之間還空著最多約 21pt 的兩根也會合（|dx|、|dy| 都小於 47 就合）。如果 Anthony 只要兩個圓真的碰到才合，就把新迴圈和 -clusterCheck 裡「兩根都是單根」的那一行換成比圓心距：`if let s = d, let o = dr[k] { return hypot(s.midX - o.midX, s.midY - o.midY) < o.width + 3 }`（群組地圖小頭像的寬度會讓這個門檻多 6×0.65 到 6 pt，這版先不管）。證明一樣成立，因為這個條件也只看兩根自己、而且對稱。
2. 點泡泡 zoom()（:990 起）：程式不用改。推論放大後約 1.0–1.33pt/m：經度範圍 0.003° 約 303m，鋪在 402pt 上；aim() 會依中段面板拉高緯度範圍（:746），比例會再小一點。一般模式兩根單根要兩個方向都小於 47pt 才合，換算約 35–47m，比 tight 的 0.0005°（經度約 50m、緯度約 55m）小。所以放大後還是「2」的，一定符合 tight，會走「這裡有 N 間」，使用者從卡片列點得到。前提是比例 ≥0.93pt/m。比這更小，或是群組地圖小頭像讓門檻變成 53pt 時，第二次點會走 again，一樣會列出。
3. 行程模式沒有列出這條路（:1005 `if !trip.on`）：兩間相距小於約 24–32m（變淡圓的門檻是 31.6pt）時，點「+2」放大後還是「+2」，再點也一樣。這次不做，要問 Anthony（見 visible）。
4. 選中的那根和 extra：不進格子，也不是障礙，跟現在一樣。證明 (e) 說明拿掉一根留到最後的單根，其他都不變，所以「點圖釘時地圖 +0」照舊成立。被選中、放大 1.35 倍的那根和店名牌可能碰到隔壁，這是已知限制，跟現在一樣。取消選取不會觸發重新分群，那根要等下一次鏡頭停下才重新參與，中間可能跟旁邊的單根疊著；同一格的兩根現在也是這樣。
5. 行程模式：keep、站號、搜尋圖示、extraFound 都不在名單裡，也不是障礙。aside() 在合併之後才把泡泡推到離站號 50pt（:930-947），推完不再比對。反例：一顆泡泡中心離站號 40pt，被推到 50pt，剛好落在一根單根上，畫面就會疊，但記號是推開前算的，所以還是 0/0。這是現有行為，新的「+2」只是讓被推的對象多一點，所以 sim E 要看截圖。
6. 群組地圖：小頭像只在兩根都是單根時算進去；泡泡對單根照舊用 box()，所以小頭像可能碰到泡泡最多約 3pt，跟現在一樣。尖角不在框裡：正上方那根的尖角可能伸進下面那根的圓頂，最多 4pt，會被南邊那根蓋住。
7. 減少動態、setMerge、flyFrom：這些路徑都沒動，合成「2」的兩根照現在單根被泡泡吃的方式飛進去或淡掉。有一個現有的情況：新泡泡吃掉舊泡泡時，舊泡泡會先消失 0.33 秒，新的才出現；以前兩顆泡泡合併時就是這樣。
8. 連鎖合併：在街道縮放的密集區，泡泡會比現在多一些、大一些，這是規格「合併後重新比對」的結果。
9. 離開行程那次重算：(a) 當天有收藏站時名單也會變，:272 先跑一次，60ms 後再跑一次。第二次會在 :967 取消、重設 0.33 秒的計時，所以泡泡大約晚 60ms 換上（推論，regress 9 會驗）。(b) 60ms 內又進行程，由 `if !trip.on` 擋掉。(c) 進行程不另外重算：一般模式照 47 合的結果，到 0.65 倍下只會「多合」，不會疊；行程框好鏡頭停下後，才照 0.65 重分。
10. 教學：教學那根不進格子、也不是障礙，旁邊的單根可能壓到它，跟 72ac06e 跨格時一樣。只在進入或離開 .pin 時重算。冷開教學時如果正在播落下動畫，recluster 會等播完。

二、第 (3) 題效能
- n0 是整份收藏的非空格子數（:887 `for p in currentList`，不只畫面內的）。推論這個帳號約 170 間：s1b 的「圖釘 169」是兩次選取、各約 85 根，再加上全台泡泡的 61＋6＋16。300 間是上限情境。
- 迴圈最多跑 2n0−1 圈，每圈 items.indices.first 最多比 n0−1 個，所以最差約 2n0² 次比對：170 間約 5.8 萬次，300 間約 18 萬次。remove(at:) 每次合併要搬 4 個陣列（多了 dr），最多 n0−1 次，可以忽略。
- 單價（推論）：兩根單根比一次（dr），是一次陣列讀取加一次相交，約 3–5ns。碰到泡泡要算 box()，把家數轉成字串（小字串不配置記憶體，但還是要轉換），約 30–60ns。
- 理論最差（每一次比對都要算泡泡的 box）：170 間約 1.7–3.5ms，300 間約 5–11ms（推論）。這需要大量泡泡和單根同時互相碰到，實際資料遇不到。原稿寫 1–2ms 是低估。
- 原型（sim3.py，模型分布，不是真資料）：170 間、台北市區 106 格時，新版約 4.2 千次單根對單根，加上 6.3 千次含泡泡的比對（其中 3.5 千次要算泡泡的 box）；舊版是 3.5 千次（其中 1.1 千次算泡泡的 box）。街道縮放 170 格全是單根，新版 2.87 萬次單根對單根，舊版 0 次。推論每次停下多 0.1–0.3ms。300 間時，台北市區多 0.2–0.5ms，街道約 9 萬次，約 0.3–0.45ms。
- 不建議先用格子鄰居篩一遍，原因有三：合併後中心會移動，框最寬到 73pt（群組地圖 79pt），鄰居範圍不是固定的；要保留「index 最小的先吃」才能維持固定順序；省下來的不到 1ms，寫錯的風險比省的多。真的量到合併迴圈中位數超過 2ms，先做 sim H1 的「框先算好」，行為不變。

三、量測
1. 整串 M9/M10 跟別的版本比都要加 -noPinPair（見 sim I）。不加參數時「圖釘 N」只會變少（證明 (d)），選店那一幀可能因此變快，不能算到別題的頭上。
2. -clusterBench 先跑舊迴圈、後跑新迴圈，快取對新迴圈稍微有利（微秒級）。加了它的那一次分群會多做一份工，量掉幀的那幾輪不能加。
3. 「框重疊」記號照證明一定是 0/0，只能抓程式寫錯，畫面驗收靠截圖。
4. 嘉義合起來之後，那一對不會再一次選兩間，但「一次選兩間」本身還要靠選取那一題處理：:111 是 MapKit 晚到的選取，點擊範圍是 44×51（:2073-2088 加 `.contentShape(.rect)`），比 box() 的 44 圓大。所以正上下排列、47 ≤ |dy| < 51 的兩根不會合，點擊框卻會重疊最多 4pt。

四、其他
1. 浮點誤差：剛好落在門檻上（差 1e-9pt 量級）的兩根，拖一下結果可能不同，實際上碰不到。地圖有傾斜（pitch）時，平移不是單純的位移，(c) 的「拖走拖回一樣」不保證，這跟現在一樣。
2. 型別檢查風險：closure 都寫了明確的參數和回傳型別，CGRect 的長算式也拆開了；記號字串分成 head、old、tail、mode 四段，各自標了型別才接起來。萬一 Mac 上還是報「unable to type-check」，就把 first(where:) 的 closure 抽成區域函式 `func hit(_ k: Int) -> Bool`。`old == .pin` 這種 Optional 跟隱式成員比較的寫法，:1080 已經用過。
3. 這版沒做 G9c 規格的其他部分：BubbleBox 實測寬度、fixed[] 障礙、aside 推完再比。
