# Bitemap build 22 驗收：第 1 輪補充 2（看 034e6b5 的模擬器結果之後）

給寫 Swift 的人。行號一律是 034e6b5。每一項都經過一位調查員查原因、一位反方驗證員重讀程式碼挑錯，下面用的是驗證員修正後的版本；驗證員說「照調查員原文」的地方，原文也附在後面。

## 這一份做什麼、照什麼順序

六項都可以放進同一個 build。所有診斷 print 一律用 `#if DEBUG` 包起來，驗收過了再拿掉。

1. **N1 加到最後後搜尋結果又跳出來**：原因確定。add() 整段換掉（收掉搜尋、面板升到一半、捲到新站）。
2. **N23 新行程的加站卡浮在中下方**：(a) 原因確定（Apple 文件寫明 overlay 裡多個 view 會被包成置中的 ZStack），在 overlay 裡明寫 `ZStack(alignment: .bottom)`。(b)「地圖拉近但沒出卡」原因還沒證實：blankTap 改用點下去當下的時間，這個改法跟原本等價，先上；MapKit 選取 setter 的 0.8 秒略過先不要加，等 log 證實再說。
3. **B8 從站卡中間往下拉，面板不動**：站卡上的 SwiftUI 手勢讓清單的 pan 開不了。主修是把長按拿起改成 UIKit 長按（RowHold），rows 外面包一層 VStack，只掛一個 ListPullDown，這也順手修掉空白那天會掛兩個、bounces 被還原成 false 的 bug。為了一輪就能分辨是哪個手勢擋住，請加一個 DEBUG 啟動參數 `-b8NoSwipe`，讓 SwipeToDelete 變成 `enabled: false`。模擬器先不帶參數跑 V1，沒過再帶 `-b8NoSwipe` 跑一次。RowHold 的 API 名稱編不過時，先用臨時方案 `.simultaneousGesture(hold)` 加 freeze 出版本（見 B8 修法第 1、4 點）。
4. **G9c 全台縮小時泡泡互疊**：recluster 換成新的合併演算法（照真正的泡泡寬度判斷是否重疊，單根圖釘也參與，合併後重新比對），另外加 BubbleBox。行為會變：街道縮放時，兩根近到會疊在一起的單根圖釘會合成「2」，這跟 Apple 地圖的做法一樣。zoom 的下限 0.003 要不要改成 0.001，看模擬器實測（G9c 修法第 4 段）。
5. **F1 點圖釘地圖沒移動**：原因還沒證實，先加診斷 log，同時上修法第 1–3、5 步，以及第 4 步裡 :554-577 那一段。修法的設計是：不管證實的是哪個假設，鏡頭最後都會停到 pos，手指碰過地圖就不搶。第 4 步裡 :546 影片預載那一段，以及第 6、7 步（ReelCache），先不要做，等效能補充 `perf-round1b.md` 一起決定，避免同一段改兩次。
6. **G2a 三次 ✕ 沒有靜音**：程式碼沒有錯，是測法讓計數到不了 3（同一條膠囊上連點只算一次）。產品程式不用改，只加 [clip] DEBUG print；模擬器改用下面附的 shell 步驟重測。

## 模擬器要測的（摘要，細節在各項的「驗修好」）

- N1：至少 3 站的測試行程，打字搜尋，點一個最佳插入位置不在最後的結果，按「加到最後」。搜尋要收掉、面板升到一半、新站捲到最上面、地圖框整天。回歸 (a)–(g) 都要測，(c)「搜尋開著時點收藏圖釘加站，搜尋會收掉」是新行為。
- N23：新建「N23測試」行程，在最低、中段、最高三段各點一次圖釘，「卡」那行 maxY 要等於「底」。冷啟動後第一次點圖釘做 5 次，每次都要出卡。拿有站的行程做對照組。測完把 N23測試左滑刪掉，等 6.5 秒訊息條收起來才算刪掉。
- B8：V1–V11 加 V8b。V1 測從站卡每個位置往下拉，V3 測長按拿起、拖、被系統取消。
- G9c：全台、北部、台北市三種縮放，截圖加 log，overlap 都要是 0。平移 5 次，泡泡不能跳。點泡泡要拆開。點圖釘時「地圖」body 次數要 +0。
- F1：第 0 步的點法各 5 次，最重要的對照組是「抽一間抽中畫面內（近）的店」，另外再點泡泡 5 次。修好之後，遠的抽一間飛行要照舊（A1 已經過了，不能退步）。
- G2a：用啟動參數歸零，App 在背景時才 pbcopy，每一輪只按一次 ✕，要在 8 秒內按。第 3 輪出現 toast，第 4 輪膠囊不出現。冷啟動後還是靜音。

## N1 搜尋結果按「加到最後」後，結果清單又跳出來蓋住地圖上半

### 原因（反方驗證後）
（跟調查員相同，補行號）在 034e6b5 的 TripPanel.swift add() 裡：:803 只在空檔推薦（slot != nil）時 clearSearch()，打字搜尋或分類搜尋加完站後 q 或 filter 還在，所以 searchOn 仍是 true（TripMode.swift:67）。:805 把 cand 設成 nil，:129 `if mode.cand == nil { TripResults() }` 讓搜尋結果小清單在 TripFind 下面重新出現，大約從標題列下面 376pt 高，蓋住地圖上半。:807 被 `!mode.searchOn` 擋住，面板停在 .low 的 strip，:809 的 scrollTo 作用在看不見的清單上。:148 fitKey 和 :182 resultKey 觸發的 fit() 都走 searchOn 那支（:845），鏡頭框的是結果，不是整天。fe3e591 的 :771、:775 已經一樣，所以這是第一版就有的問題，不是 5048a9e 造成的。

### 修法（驗證員修正版）
TripPanel.swift add()（034e6b5 :788-810）整段換成下面這樣。跟調查員版本唯一的差別是 `expanded = nil` 只在 level 從 .low 升到 .mid 時才做，因為只有這時 :162 onChange(level) 會 flyTo(expanded)，跟框整天搶鏡頭。面板原本就在 .mid 或 .high 時，展開的那站照舊不動，收藏圖釘加站的既有行為不變。

```swift
    private func add(_ t: Trip, _ c: TripCand, order: [TripStop], at i: Int) {
        let d = min(mode.day, t.days)
        var s: TripStop
        if let p = c.place { s = trips.makeStop(t.id, day: d, place: p) }
        else if let h = c.hit { s = trips.makeStop(t.id, day: d, hit: h) }
        else { return }
        s.pos = TripInsert.pos(order, at: i)
        Haptic.success()
        Perf.shared.mark("加站")
        trips.insert(s, store: store)
        store.say("加到第 \(i + 1) 站", icon: .check, action: ("復原", {
            TripStore.shared.remove(s, dropTrip: false, store: store)
            store.toast = nil
        }))
        // 加好了：搜尋（打字搜、分類、空檔推薦）一起收掉，跟 ✕、點地圖空白一樣，結果圖釘淡掉；
        // 面板回到清單並捲到新的那站。地圖框整天交給 fitKey／level／resultKey 的 onChange（三個算出同一塊）
        let closeSearch = mode.searchOn || mode.slot != nil
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            if closeSearch { mode.clearSearch() }
            mode.cand = nil
            mode.hot = s.id
            if mode.level == .low {
                // 最低段時清單看不到；展開著的那站收起來，不然 level 的 onChange 會飛去那站，跟框整天搶鏡頭
                expanded = nil
                mode.level = .mid
            }
        }
        mode.scrollTo = s.id
    }
```

其他檔案都不用改。TripTop.swift:59 的 onChange(searchOn) 因為 level 已經是 .mid，guard 會擋掉，不會重複動畫。復原時不要回到搜尋，維持現狀。

### 先證實原因、再驗修好（調查員原文）
先證實原因（034e6b5，還沒修，只加 print/mark，驗完拿掉）：
1. 在 add() 的 `Perf.shared.mark("加站")` 後面加：
```swift
print("N1 加站前 searchOn=\(mode.searchOn) finding=\(mode.finding) typing=\(mode.typing) q=\(mode.q) filter=\(String(describing: mode.filter)) slot=\(mode.slot != nil) level=\(mode.level)")
```
   在 `mode.scrollTo = s.id` 後面加：
```swift
Task { @MainActor in
    try? await Task.sleep(for: .seconds(0.6))
    let m = TripMode.shared
    print("N1 加站後0.6s searchOn=\(m.searchOn) level=\(m.level) cand=\(m.cand == nil ? "nil" : "有") hits=\(m.search.hits.count) found=\(m.search.found.count)")
    Perf.shared.mark("N1 後 s=\(m.searchOn) lv=\(m.level)")
}
```
   :130 改成 `TripResults().onAppear { print("N1 結果清單出現 level=\(mode.level)"); Perf.shared.mark("N1 結果出現") }.transition(...)`。
   fit() 第一行（guard 之前）加 `print("N1 fit searchOn=\(mode.searchOn) cand=\(mode.cand != nil) stops=\(base.count)")`。
2. 打開 Perf 浮層：「我的」最下面的版本號連點 5 下。用一個至少 3 站的測試行程。
3. 按 🔍，點搜尋框，打一個字（例如「咖啡」），點一個落在兩站中間的結果。「加到最後」只有在最佳插入位置不是最後(:715)時才會出現，所以不要挑剛好在最後一站附近的。出現加站卡以後按「加到最後」。
4. 怎麼判讀：如果 console 依序出現 `N1 加站前 searchOn=true ... slot=false level=low`、`N1 結果清單出現 level=low`、`N1 加站後0.6s searchOn=true level=low cand=nil`，而且有好幾行 `N1 fit searchOn=true`（框結果），原因就確認了。這時截圖，搜尋框下面那張圓角卡片、每列右邊有 ⊕ 的就是 TripResults；面板是最低段的站卡橫排。如果看到 level=high，或沒有「結果清單出現」，就是別的原因，停下來回報，不要套修法。

驗證修好了（套用 fix 的 add()，print 先留著）：
5. 重做第 3 步。應該看到：`加站前 searchOn=true`，接著有 2-3 行 `N1 fit searchOn=false cand=false stops=N+1`，是同一刻的 fitKey、level、resultKey，之後沒有 searchOn=true 的 fit。不應該出現「N1 結果清單出現」。0.6 秒後印 `searchOn=false level=mid cand=nil hits=0 found=0`。
   畫面：TripFind 和結果清單淡掉；🔍 鈕變回白底；深色結果圖釘消失，搜到的收藏圖釘變回淡的；面板升到一半，顯示直清單，約 0.35 秒後新站捲到最上面；地圖用 0.5 秒框住整天，含新的號碼。浮層上「框地圖修正」最多一次。toast「加到第 N 站」貼在一半高的面板上面。
6. 按 toast 的「復原」：新站消失，地圖重新框整天，面板留在一半，搜尋不會再開。
7. 回歸測試：
   (a) 用大按鈕「加進行程（第 N 站）」加，結果跟第 5 步一樣。
   (b) 搜尋沒開、面板在最低段時點收藏圖釘加站：面板到一半、捲到新站，跟以前一樣。
   (c) 搜尋開著時點地圖上的收藏圖釘加站：搜尋收掉、面板到一半（新行為）。
   (d) 空檔推薦（清單裡兩站中間的提示），加一間：搜尋收掉、面板到一半（跟以前一樣）。
   (e) 先點清單裡某站兩下展開，再開搜尋、加站：展開那站收起來，鏡頭框整天，不會飛到展開那站。
   (f) 搜尋框的 ✕ 和點地圖空白處還是會收起搜尋、面板回到一半。
   (g) 分類膠囊（順路）不打字，點結果加站：一樣收掉。
8. 驗完拿掉所有 N1 print、mark，再用模擬器建置一次確認可以編譯。

### 驗證員補的測試
1. 先證實原因時，加站前用 Perf 浮層或 print 確認 `searchOn=true slot=false level=low`，加站後應該出現「N1 結果清單出現 level=low」，而且 fit 的 print 是 searchOn=true。只要看到 level=high，或沒有出現結果清單，就停下來回報，不要套修法。
2. 修好後：fit 的 print 在同一刻有 3 行 `searchOn=false cand=false stops=N+1`，之後 1 秒內不能再出現 searchOn=true 的 fit，浮層上「框地圖修正」最多 1 次。截圖確認 TripFind 和結果框都不見了、面板在一半、新站捲到最上面、toast 貼在一半高的面板上面。
3. 回歸測試（這次修法新增的）：(a) 面板在 .mid，點清單某站展開，再點地圖上的收藏圖釘加站：展開的那站要維持展開（scoped 版本的重點），鏡頭框整天，捲到新站。(b) 面板在 .low，先展開過某站再加站：那站收起來，鏡頭框整天，不會飛到展開那站。(c) 搜尋開著時點收藏圖釘加站：搜尋收掉，面板到一半，這是新行為，要讓 Anthony 知道。(d) 空檔推薦加站、選住宿當起點：跟以前一樣收掉搜尋。(e) 搜尋框的 ✕ 和點地圖空白處照舊。(f) 加站卡往下拖關掉（不加）：搜尋跟結果框要留著，這條不經過 add()，確認沒被改到。
4. 已通過的項目重跑一次確認：首頁清單往下拉 B1–B7、抽一間飛遠、行程框整天只動 1 次（換天、刪站）、拖站換順序、起點選單。這些都不經過 add()，預期不受影響。
5. 拿掉所有 N1 的 print 和 mark，再用模擬器建置一次（Swift 5 模式）確認可以編譯。

## N23 新建或空行程第一次點收藏圖釘：加站卡浮在中下方；或地圖拉近卻沒出卡

### 原因（反方驗證後）
(a) 確定（程式碼加 Apple 文件）：faae950 把 core 改成 `Color.clear.overlay(alignment: .bottom) { panel; addCard }`（TripPanel.swift:103-118，034e6b5）。overlay 有多個子 view 時會包成隱含的 ZStack，alignment 只決定整疊放在哪，疊裡面每個 view 都置中。panel 的版面高度由 LiftHeight 的 frame 固定成 settledHeight()（PanelLift.swift:18），offset 不改版面高度，所以在中段和最高段，比較矮的加站卡會被擺在面板高度的中間。中段的卡片下緣約離底 67pt（推估），下面露出地圖。新行程最先看到，是因為 TripMode.open 一律把 level 設成 .mid（TripMode.swift:84）；從搜尋點結果開卡時是最低段，卡片比面板高，所以貼底。有站的行程在中段點圖釘也會發生，跟空行程無關。

(b) 沒有證實。「地圖拉近」代表 placeCand 已經跑過（cand 有值）；「卡片沒出現」最可能是 cand 開卡後很快又被清成 nil，而 cand 變 nil 時沒有任何地方會重新框地圖，鏡頭就停在拉近的狀態。清掉 cand 的路依可能性排：
① (b2) blankTap（MapTab.swift:646-653）的 Task 在主執行緒卡住時晚醒，`now − pickAt > 0.4` 成立，呼叫 TripMode.blank()（TripMode.swift:122-125）。
② (b1) MapKit 自己的選取比較晚到，送出 nil 或別的 id，經過 setter（MapTab.swift:84-87）→ pins.select → SelWatcher → picked(nil)（MapTab.swift:520-522）。但首頁點圖釘也會馬上移動鏡頭，卻沒有被關卡，這是反證。
③ 點到的其實是泡泡（zoom，MapTab.swift:751）。
三者都要靠 log 分辨。

### 修法（驗證員修正版）
━━ (a) 照調查員的版本：TripPanel.swift:103-120 在 overlay 裡明寫 ZStack(alignment: .bottom)（Apple 文件建議的做法） ━━
```swift
let core = Color.clear.allowsHitTesting(false).overlay(alignment: .bottom) {
    // overlay 的 alignment 只決定整疊放哪；疊裡面多個 view 預設置中（Apple 文件）。
    // 面板（中段約 361）比加站卡（約 227）高時，卡會被擺在面板高度的中間。明寫貼底；
    // 最低段關卡、卡片淡出時，面板也不會被置中往上浮
    ZStack(alignment: .bottom) {
        if mode.going {
            goBottom(order)
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { goBot = $0 }
        } else {
            // 加站卡開著時面板不拿掉，滑到下面藏著：關卡時不用整塊重建（站卡、清單、選單）
            panel(t, d: d, base: base, order: order, legs: legs, plan: plan)
                .offset(y: carding ? settledHeight() + 60 : 0)
                .allowsHitTesting(!carding)
                .accessibilityHidden(carding)
                .transition(.move(edge: .bottom))
            if let c = mode.cand {
                addCard(t, c, order: order)
                    .id(c.id)
                    .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
            }
        }
    }
}
.overlay(alignment: .top) { /* 原樣 */ }
```

━━ (b) 先上這一個（跟原本的判斷等價，風險低）：MapTab.swift:646-653 ━━
```swift
private func blankTap() {
    guard trip.on else { return }
    let t0 = CACurrentMediaTime()
    Task {
        try? await Task.sleep(for: .milliseconds(180))
        // 跟原本一樣：點下去前後 0.22 秒內點過圖釘就不算點空白，但用點下去當下的時間算。
        // 開第一張加站卡時主執行緒卡住、這個 Task 晚醒，也不會把剛開的卡當成點空白關掉
        guard trip.pickAt < t0 - 0.22 else { return }
        trip.blank()
    }
}
```

━━ (b) 等 log 證實是 (b1)（出現「地圖選取 set=nil」，而且離開卡不到 0.8 秒、接著 cand X→nil）才加：MapTab.swift:84-87 ━━
```swift
Map(position: $pos, selection: Binding(get: { pins.sel }, set: { id in
    if let id, (id.contains(",") && !id.hasPrefix("hit:")) || trip.marks.contains(where: { $0.id == id }) { return }
    // 行程模式：點圖釘一律由 FoodPin／HitPin 的按鈕呼叫 pins.tap。MapKit 自己晚到的選取（等「是不是點兩下」）
    // 在剛點過圖釘 0.8 秒內不聽，免得把剛開的加站卡關掉／換掉。
    // 注意：MapTab 不追蹤 pins.sel，略過後 MapKit 內部的選取可能跟 pins.sel 不同步（無害：之後點圖釘都走按鈕）
    if trip.on, id != pins.sel, CACurrentMediaTime() - trip.pickAt < 0.8 {
        Perf.shared.mark("地圖選取略過 \(id ?? "nil")")
        return
    }
    pins.select(id)
})) {
```
選做：MapTab.swift:518 的 trip.on 分支開頭加 `guard !trip.going else { return }`。

### 先證實原因、再驗修好（調查員原文）
注意：第三節第 1 步的「setter 的修改」先不要套，等第二節的 log 證實 (b1) 才加。

只讀，不 checkout、不 push。在 Swift thread 的工作副本暫時加 print，驗完全部拿掉。測試行程名稱用「N23測試」。

━━ 一、先證實 (a) 的原因（修之前） ━━
1. 在 TripPanel.swift:734 的 onGeometryChange 前面加：
```swift
.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
    let line = "[N23] 卡 y=\(Int(r.minY))–\(Int(r.maxY)) 底=\(Int(top0 + size.height)) level=\(mode.level) settled=\(Int(settledHeight())) size=\(Int(size.height)) lift=\(Int(cardLift.y))"
    print(line); Perf.shared.mark(line)
}
```
   在 TripPanel.swift:57 的 `.task(id: tid)` 開頭加：
```swift
print("[N23] 面板 tid=\(tid) size=\(size) placed=\(placed) cardH=\(cardH) cardLift=\(cardLift.y) lift=\(lift.y) going=\(mode.going)")
```
   在 70 行 gone 的 VStack 加 `.onAppear { print("[N23] gone tid=\(tid) loaded=\(trips.loaded)") }`。
2. 在 iPhone 17 模擬器用 -perfOverlay 執行：
   - 首頁按右邊「行程」。如果直接進了上次的行程，按膠囊選「換行程」。
   - 在「我的行程」按 ＋，名稱填「N23測試」，按建立。
   - 面板在中段時點一根收藏圖釘，截圖。
3. 判讀：
   - 預測修之前 maxY 約等於「底 − (settled − 卡高)/2」，也就是比「底」少約 67。這就證實原因是置中。
   - 如果 maxY 等於「底」，代表置中的推論不成立，要回報整段 log。
   - 確認沒有出現 gone 那行；面板那行如果是從首頁進來，size 應該是 (0,0)、placed=false。
4. 關掉卡片，做兩組對照：
   - 面板拉到最低再點：預測 maxY 等於「底」，卡片貼底。
   - 面板拉到最高再點：預測卡片在畫面中間。
   - 打開一個有站的行程，在中段點圖釘：預測也會浮，證明跟空行程無關。
5. 確認換行程時 @State 會沿用：在行程 A 開卡後往下拖關掉，再用「換行程」進 N23測試。預測面板那行印出的 size 不是 0、placed=true、cardLift 大於 0。這是預期行為，不是 bug。

━━ 二、先證實 (b) 的原因（修之前） ━━
1. 加 print：
   - MapTab.swift:84 setter 開頭：`print("[N23] 地圖選取 set=\(id ?? "nil") sel=\(pins.sel ?? "nil") dt=\(CACurrentMediaTime() - trip.pickAt)"); Perf.shared.mark("地圖選取 \(id ?? "nil")")`
   - MapTab.swift:521 if 裡面：`Perf.shared.mark("picked(nil) 收卡")`
   - MapTab.swift:650 guard 前面：`print("[N23] blankTap dt=\(CACurrentMediaTime() - trip.pickAt)")`
   - TripMode.swift:123 if 裡面：`Perf.shared.mark("點空白收卡")`
   - MapTab.swift:752 zoom 開頭：`Perf.shared.mark("點泡泡")`
   - TripPanel.swift:178 的 onChange 改成 `{ o, id in print("[N23] cand \(o ?? "nil")→\(id ?? "nil") t=\(CACurrentMediaTime())"); if id != nil, cardLift.y != 0 { cardLift = Lift() } }`
   - TripPanel.swift:640 加 `print("[N23] placeCand going=\(mode.going) span r.at=\(r.at)")`
2. 操作：
   - 按「完成」回首頁，把地圖縮遠到看得到整個台北市。
   - 從「我的行程」點 N23測試（0 站）。
   - 進去後馬上點一根離畫面中心遠的收藏圖釘。
3. 判讀：
   - 「點收藏加站」→ cand nil→X →（約 0.3 秒內）地圖選取 set=nil 或別的 id → picked(nil) 收卡 → cand X→nil：是 (b1)。
   - 出現「點空白收卡」，而且 blankTap dt 大於 0.4：是 (b2)。
   - 只有「點泡泡」：點到的是泡泡。
   - placeCand going=true：是出發狀態殘留。
   - log 裡 cand 一直是 X、沒有被清掉，卡片卻看不到：回報「卡」那行的 y 和整段 log，表示上面的推論都不成立。

━━ 三、驗證修好了 ━━
1. 套用 fix 的 ZStack(alignment: .bottom)，以及 setter 和 blankTap 的修改，保留 print。
2. (a)：新建行程，在最低、中段、最高三段各點一次圖釘。「卡」那行的 maxY 每次都要等於「底」（誤差 1pt 以內），截圖卡片下面不能露出地圖。另外用有站的行程，在中段點一次。
3. (b)：照「二」的步驟重做 5 次，每次都要出卡，log 裡不能出現 cand X→nil（除非你自己按 ✕）。如果出現「地圖選取略過」，表示擋到了原本會誤關的那次。
4. 回歸，每項都要點過：
   - 點地圖空白處會收卡，再點一次會收起搜尋、面板回到一半。
   - 卡片開著時點另一根，會換卡。
   - 關卡後再點同一根，會重新打開。
   - 往下拖超過 80pt 會關卡，不到 80pt 會彈回。
   - 按「加進行程」後面板回到清單，並捲到新的那站。
   - 搜尋時點結果開卡，面板在最低、卡片貼底，關卡後結果列表會回來。
   - 出發和結束出發正常；出發畫面的 goBottom 也貼底。
   - 首頁一般地圖：點圖釘出大卡、點泡泡放大、點空白收大卡都正常（setter 只在 trip.on 時才擋）。
5. 清掉測試資料：「我的行程」裡把 N23測試往左滑刪掉，等訊息條收起來約 6.5 秒才會真的刪，不要按復原。最後把所有 [N23] print 和臨時 mark 拿掉。

### 驗證員補的測試
1. (a) 判讀：調查員給的「卡 y=」print 可以直接用。修之前在中段，maxY 應該約等於「底 − (settled − 卡高)/2」。另外拍一張截圖，看加站卡的「新的第 N 站」牌子和圖釘是不是被卡片蓋住（fitCoords 把卡片當成貼底來算）。修好後再看一次，牌子要露在卡片上面。
2. (a) 回歸：面板在最低段時開卡再按 ✕，卡片淡出的 0.2 到 0.3 秒內，面板要從底部升回來，不能先往上浮約 38pt 再掉下去。修之前可以拿這個做對照，證實置中的推論。
3. (b2) 的直接證據：在 blankTap 的 Task 醒來後加 `print("[N23] blankTap 晚醒=\(CACurrentMediaTime() - t0 - 0.18) dt=\(CACurrentMediaTime() - trip.pickAt)")`，t0 在進 Task 前取。晚醒大於 0.22，而且接著出現「點空白收卡」，就是 (b2)。
4. (b1) 的反證：在首頁一般地圖點一根離畫面中心遠的圖釘（會平移或先拉遠），看 log 有沒有出現「地圖選取 set=nil」。首頁從來沒出現過的話，(b1) 就不太可能是原因，setter 的修法不要上。
5. (b) 對照組：冷啟動 App 後，用「有站的行程」第一次點圖釘，看會不會也閃一下就消失。會的話代表跟空行程無關，比較像 (b2) 的「第一張卡卡頓」。在 Perf 浮層看開卡那一幀的主執行緒時間。
6. (b) 在 picked() 的 trip.on 分支，`guard let id else {` 裡面加 `Perf.shared.mark("picked nil dt=\(CACurrentMediaTime() - trip.pickAt)")`。注意要在 pickAt 被覆寫之前算：先存 `let prev = trip.pickAt`，再設 pickAt。這樣看得出 nil 是在開卡後多久送來的。
7. 修好後的回歸還要補：
   - 卡片開著時，0.3 到 0.8 秒內點空白處要能收卡。這條走 blankTap；如果加了 setter 的修法，MapKit 送來的 nil 會被略過。
   - 搜尋結果的 HitPin 連點兩根，要能換卡。
   - 首頁抽一間飛遠、首頁清單往下拉 B1–B7：這些路都沒動到，各點一次就好。
8. 測試行程「N23測試」測完往左滑刪掉，等約 6.5 秒、訊息條收起來才算真的刪除。所有 [N23] print 和臨時 mark 都要拿掉。

## B8 行程直清單在頂端，從站卡中間往下拉，面板不動

### 原因（反方驗證後）
從站卡中間往下拉時，清單 UIScrollView 的 pan 沒開始（或開始了但沒拉到過頭）。這一點從程式碼推得出來：
- TripPanel.swift:234-248 的備案不經過 Finder，只要 pan 正常開始、拉約 100pt 就一定會降一段。它沒觸發，ListPullDown 也沒有新的 log。
- 從面板左右各 14pt 的邊拉可以，那裡沒有任何手勢。

擋住 pan 的是站卡上的 SwiftUI 手勢，嫌疑有兩個（推測，要拆除實驗確認）：
- (a) StopCard 那排的 `.gesture(hold)`（TripPanel.swift:1467；hold 是 :494-509 的 LongPress(0.35).sequenced(before: Drag(minimumDistance: 0))）。在 iOS 18 以後的實作裡，它在手指移動時沒有及時失敗，pan 一直等它。
- (b) SwipeToDelete 的 `.simultaneousGesture(DragGesture(minimumDistance: 18), including: .all)`（TripsList.swift:347）在 18pt 成立，把還在等的 pan 擋掉。
- 首頁的對照分辨不了 (a) 和 (b)。hold 從建置 18（e1de2a6）就在，所以如果從站卡上連捲都捲不動，是很久以前就有的問題。

y=35 那筆是更早某次手勢留下的。掛兩次是空白那天或 stops 還沒載好時，rows 的 TupleView 讓 `.background(ListPullDown)` 套了兩次。這還造成另一個潛在 bug：兩個 coordinator 會同時接手，settleSheet 被叫兩次，從最高可能一口氣降兩段；而且 bounces 最後被還原成 false，那個 scroll view 之後不回彈。

TripPanel 用 .equatable()（只比 tid），而且沒有 .id(tid)，所以換行程時 @State 會沿用。這點確認了，但跟 B8 無關。

### 修法（驗證員修正版，以這份為準）
【步驟 0：先用最小的拆除實驗證實（不改邏輯，每一步之後重做 S1，看能不能從站卡中間往下拉）】
- 0a：TripPanel.swift:1467 的 `.gesture(hold)` 暫時改成 `.simultaneousGesture(hold)`。
  - 能接手：原因是 hold，照下面的主修法做。
- 0b：0a 不行的話，把 hold 還原，把 :457 的 SwipeToDelete 改成 `enabled: false`。
  - 能接手：原因是 SwipeToDelete，做備案 B（HSwipe，記得加 `.swipeBackBlocked()`）。
- 兩個都要拿掉才行：兩個都做。

【診斷碼（修正版，DEBUG 用，放 PanelLift.swift）】
檔案開頭加：
```swift
import UIKit.UIGestureRecognizerSubclass
```

Coordinator 裡加：
```swift
        private var spy: TouchSpy?
        private var minY: CGFloat = 0
        nonisolated static func tag(_ o: AnyObject) -> String { String(UInt(bitPattern: ObjectIdentifier(o).hashValue) % 10000) }
```

attach 的 `Perf.shared.mark("清單掛上")` 換成：
```swift
            let f = s.convert(s.bounds, to: nil)
            Perf.shared.mark("清單掛上 c=\(Self.tag(self)) sv=\(Self.tag(s)) f=\(Int(f.minY))-\(Int(f.maxY)) ch=\(Int(s.contentSize.height)) bh=\(Int(s.bounds.height))")
            #if DEBUG
            let sp = TouchSpy.on(s); s.addGestureRecognizer(sp); spy = sp
            #endif
```

detach 最前面加：
```swift
            if let sp = spy { sp.view?.removeGestureRecognizer(sp); spy = nil }
```

pan 的改法照調查員原本的寫法：.began 記「pan開始」並記 minY；.ended 時沒接手要記「pan結束沒接手 st= yMin= dy=」。

TouchSpy 本體（照 TouchClock 的寫法）：
```swift
final class TouchSpy: UIGestureRecognizer, UIGestureRecognizerDelegate {
    weak var scroll: UIScrollView?
    private var p0: CGPoint = .zero
    private var done = false

    static func on(_ s: UIScrollView) -> TouchSpy {
        let g = TouchSpy(target: nil, action: nil)
        g.scroll = s
        g.cancelsTouchesInView = false; g.delaysTouchesBegan = false; g.delaysTouchesEnded = false
        g.delegate = g
        return g
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { true }

    override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent) {
        MainActor.assumeIsolated {
            guard let s = scroll, let u = t.first else { return }
            p0 = u.location(in: nil); done = false
            var chain: [String] = []
            var v = u.view
            while let x = v, chain.count < 10 {
                chain.append(String(describing: type(of: x)))
                if x === s { break }
                v = x.superview
            }
            let f = s.convert(s.bounds, to: nil)
            let msg = "觸 x=\(Int(p0.x)) y=\(Int(p0.y)) sv=\(ListPullDown.Coordinator.tag(s)) off=\(Int(s.contentOffset.y)) ch=\(Int(s.contentSize.height)) bh=\(Int(s.bounds.height)) f=\(Int(f.minY))-\(Int(f.maxY))"
            Perf.shared.mark(msg)
            print("[B8] " + msg + " hit=" + chain.joined(separator: " < "))
        }
    }

    override func touchesMoved(_ t: Set<UITouch>, with e: UIEvent) {
        MainActor.assumeIsolated {
            guard !done, let s = scroll, let u = t.first else { return }
            let dy = u.location(in: nil).y - p0.y
            guard abs(dy) > 25 else { return }
            done = true
            let rs = (u.gestureRecognizers ?? []).filter { $0 !== self }.map { r -> String in
                let vn = r.view.map { String(describing: type(of: $0)) } ?? "nil"
                return "\(type(of: r))@\(vn)#\(r.state.rawValue)"
            }
            Perf.shared.mark("動25 pan=\(s.panGestureRecognizer.state.rawValue) off=\(Int(s.contentOffset.y))")
            print("[B8] 動25 pan=\(s.panGestureRecognizer.state.rawValue) 收到這指的手勢：" + rs.joined(separator: ", "))
        }
        state = .failed
    }

    override func touchesEnded(_ t: Set<UITouch>, with e: UIEvent) { state = .failed }
    override func touchesCancelled(_ t: Set<UITouch>, with e: UIEvent) { state = .failed }
    override func reset() { done = false }
}
```
判讀方式照調查員原本的寫法（觸／動25 pan=0／pan開始／pan結束沒接手 yMin）。

【主修法（照調查員的寫法，加上以下修正）】
1. 新檔 RowHold.swift、StopCard 的 `hold: RowHold?`＋RowHoldIf、TripPanel 的 `@State private var held = RowHeld()`、tap 開頭的 guard、rowHold(_:_:k:)、fitTick 改成 `!held.on && !holding`：照原樣。
   - 編不過（CoordinateSpaceConverter 或 converter 的名稱不對）時，先用 0a 的 `.simultaneousGesture(hold)` 出版本，在 begin() 第一行同步停掉清單的 pan（見下面第 4 點）。
2. rows 包一層 VStack，只掛一個 ListPullDown：要做。它同時修掉空白那天的兩個問題：兩個 coordinator 讓 settleSheet 被叫兩次、從最高一口氣降兩段，以及 bounces 最後被還原成 false。
   ```swift
                    ScrollView {
                        VStack(spacing: 0) {
                            rows(t, d: d, base: base, order: order, legs: legs, plan: plan)
                        }
                        .padding(.horizontal, 14).padding(.top, 2).padding(.bottom, 16)
                        .background(ListPullDown(on: drag.id == nil,
                                                 changed: { up in guard drag.id == nil else { return }; lift.y = up },
                                                 ended: { up in guard drag.id == nil else { lift.y = 0; return }; settleSheet(up) }))
                    }
   ```
   空白那天的提示會往上移大約 8 到 26pt，屬於預期內的變化。
3. listTop 錨點（scrollTo 第一站捲到 0）可以不做。offset 2 時往下拉，同一個手勢經過 0 就會接手，功能不受影響。要做也安全，因為 add() 先 insert 再設 scrollTo，base 已經包含新的那站。
4. 只有走臨時方案（simultaneousGesture）時才需要：讓 ListPullDown.Coordinator 公開 `func freeze(_ f: Bool) { scroll?.panGestureRecognizer.isEnabled = !f }`，並把 coordinator 交給 TripPanel（例如用 TripMode 上的 weak 參照）。begin() 同步叫 freeze(true)，clearDrag() 叫 freeze(false)，不用等 scrollDisabled 下一次 render 才生效。主修法 RowHold 不需要這一步。
5. 驗收跑 V1–V10，另外補兩項：
   - V8b：空白那天從最高往下拉只降一段，放手後清單仍然會回彈。
   - V11：S3 從站卡中間上下捲（確認修法之前這是不是一直都壞的）。

### 調查員原文的修法（驗證員說「照原樣」的部分在這裡；scrollTo 頂端錨點 listTop 可以不做）
建議的修法：把站卡長按換順序改成 UIKit 的 UILongPressGestureRecognizer，透過 iOS 18 的 UIGestureRecognizerRepresentable 掛上（專案 IPHONEOS_DEPLOYMENT_TARGET=18.0，可以用）。
- 長按成立前，手指移動超過 10pt 長按就失敗，清單的 pan 照常開始，往下拉就能由 ListPullDown 接手。
- 長按成立的那一刻，UIKit 會讓還在 possible 的清單 pan 失敗，拖曳時清單不會跟著捲。這是同步的，不靠 scrollDisabled 下一次更新才生效；scrollDisabled 留著當第二道保險。
- 被系統取消時一定會收到 .cancelled，不用再靠 @GestureState。
- 另外順便修兩件事：rows 的修飾改成只掛一次（不會有兩個 ListPullDown），以及 scrollTo 第一站時捲到真正的頂端（0，不是 2）。
- 這個 API 在雲端只能用 swiftc -parse 檢查語法，名稱要在 Xcode 確認：CoordinateSpaceConverter、context.converter.location(in: .global)。

【1. 新檔 FoodMap/RowHold.swift】（型別名已 grep，沒有撞名）
```swift
import SwiftUI
import UIKit

// 長按 0.35 秒拿起一站、接著拖。用 UIKit 的長按：iOS 18 起在 ScrollView 裡用 SwiftUI 的
// .gesture(LongPress.sequenced(before: Drag(minimumDistance: 0)))，清單的 pan 會開不了
// （從站卡上捲不動，往下拉也交不給面板）。
// 拿起前手指移動超過 10pt 長按就失敗，清單照常捲／接手；拿起那一刻 UIKit 讓清單的 pan 失敗（不會邊拖邊捲）。
// 被系統取消也一定有 .cancelled，不用 @GestureState 收尾。
struct RowHold: UIGestureRecognizerRepresentable {
    var duration: TimeInterval = 0.35
    var began: (CGPoint) -> Void = { _ in }              // 拿起：手指位置（global）
    var moved: (CGSize, CGPoint) -> Void = { _, _ in }   // 拿起後的位移、手指位置（global）
    var ended: (Bool) -> Void = { _ in }                 // true 放開、false 被取消

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let g = UILongPressGestureRecognizer()
        g.minimumPressDuration = duration
        g.allowableMovement = 10
        g.delegate = context.coordinator
        return g
    }

    func updateUIGestureRecognizer(_ g: UILongPressGestureRecognizer, context: Context) {
        g.minimumPressDuration = duration
    }

    func handleUIGestureRecognizerAction(_ g: UILongPressGestureRecognizer, context: Context) {
        let p = context.converter.location(in: .global)
        switch g.state {
        case .began:
            context.coordinator.start = p
            began(p)
        case .changed:
            let s = context.coordinator.start
            moved(CGSize(width: p.x - s.x, height: p.y - s.y), p)
        case .ended: ended(true)
        case .cancelled, .failed: ended(false)
        default: break
        }
    }

    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var start: CGPoint = .zero
        // 不跟別的手勢同時：拿起時還在 possible 的清單 pan 會被 UIKit 判失敗
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { false }
    }
}

// 拿起中／剛放下（不是 @Observable，改它不會讓面板重畫）
@MainActor final class RowHeld {
    var on = false
    var endedAt: CFTimeInterval = 0
}

// 有給 hold 才掛長按（預設不掛）
struct RowHoldIf: ViewModifier {
    let hold: RowHold?
    @ViewBuilder func body(content: Content) -> some View {
        if let hold { content.gesture(hold) } else { content }
    }
}
```

【2. TripPanel.swift StopCard】
- 第 1425 行改成：
```swift
    var hold: RowHold? = nil
```
- 第 1467 行 `.gesture(hold)` 改成：
```swift
            .modifier(RowHoldIf(hold: hold))
```
`.onTapGesture(perform: tap)` 照舊放在它前面。

【3. TripPanel.swift 面板本體】
(a) 第 39 行附近加：
```swift
    @State private var held = RowHeld()
```

(b) 第 151 行改成：
```swift
            if !held.on && !holding && drag.id != nil { clearDrag(); mode.overDay = nil }
```

(c) block() 第 461-470 行，StopCard 的 tap 開頭加 guard，hold 改成 rowHold：
```swift
                StopCard(stop: s, n: i + 1, row: row, open: expanded == s.id, me: store.me, hot: mode.hot == s.id, tap: {
                    // 長按拿起又放開，不算點一下
                    guard drag.id == nil, CACurrentMediaTime() - held.endedAt > 0.4 else { return }
                    // 第一下：地圖飛到這站；同一站再點一下才展開
                    if mode.hot == s.id {
                        Haptic.light()
                        if expanded == s.id { withAnimation(.snappy) { expanded = nil } } else { expandStop(s.id) }
                    } else {
                        mode.tap(s.id)
                        if expanded != nil { withAnimation(.snappy) { expanded = nil } }
                    }
                }, hold: rowHold(t, s, k: k))
```

(d) 第 493-509 行，把 reorder() 整段換成：
```swift
    // 長按 0.35 秒拿起來，拖到別的位置放開；拖到上面的「第 N 天」放開就換天（UIKit 長按，見 RowHold.swift）
    private func rowHold(_ t: Trip, _ s: TripStop, k: Int) -> RowHold {
        RowHold(began: { _ in
            held.on = true
            if drag.id == nil { begin(s, k: k, size: (mode.geo.rows[s.id]?.height ?? 80) - (mode.geo.gaps[s.id] ?? 0)) }
        }, moved: { d, p in
            guard drag.id == s.id else { return }
            // 位移只寫進 dragY（只有被拖的那列跟著動）；插到哪變了才改 drag
            dragY.y = d.height
            let to = drag.target(mode.geo, base: trips.stops(t.id, day: min(mode.day, t.days)), dy: dragY.y)
            if to != drag.to { drag.to = to; Haptic.tick() }
            overDay(t, p)
        }, ended: { _ in
            held.on = false
            held.endedAt = CACurrentMediaTime()
            if drag.id != nil { drop(t) }   // 放開或被取消都放下（跟原本 onChange(of: holding) 一樣）
        })
    }
```
- `.onChange(of: holding)`（第 180 行）和 `@GestureState holding` 留著，最低段的 reorderX 還在用。
- 最低段橫排 reorderX（:603-617）這次不改。如果驗證時橫向也捲不動，同一招套用：取 d.width、targetX。

(e) 第 222-253 行：rows 只掛一次 ListPullDown，並在最上面放一個頂端錨點。
```swift
                ScrollViewReader { sp in
                    ScrollView {
                        // 包一層：rows 是 if＋VStack 兩塊，直接加修飾會每塊各掛一個 ListPullDown（空白那天掛兩次）
                        VStack(spacing: 0) {
                            // 捲到第一站＝捲到真正的頂端（contentOffset 0）：錨點放在 padding 外面
                            Color.clear.frame(height: 0).id(Self.listTop)
                            VStack(spacing: 0) {
                                rows(t, d: d, base: base, order: order, legs: legs, plan: plan)
                            }
                            .padding(.horizontal, 14).padding(.top, 2).padding(.bottom, 16)
                        }
                        // 捲到頂再往下拉：面板跟著手指往下（清單不回彈），放開照面板的規則停段；拖站換順序時不接手
                        .background(ListPullDown(on: drag.id == nil,
                                                 changed: { up in guard drag.id == nil else { return }; lift.y = up },
                                                 ended: { up in guard drag.id == nil else { lift.y = 0; return }; settleSheet(up) }))
                    }
                    .scrollDisabled(drag.id != nil)
                    // …onScrollGeometryChange／onScrollPhaseChange 原樣保留…
                    .onChange(of: mode.scrollTo, initial: true) { _, id in
                        guard let id else { return }
                        mode.scrollTo = nil
                        let target = id == base.first?.id ? Self.listTop : id
                        Task { try? await Task.sleep(for: .seconds(0.35)); withAnimation(.snappy) { sp.scrollTo(target, anchor: .top) } }
                    }
                }
```

(f) 在 TripPanel 裡加：
```swift
    private static let listTop = "trip-list-top"
```

【4. PanelLift.swift】
這一步只加 log，接手邏輯不改，見 sim_check。現在的接手條件 `contentOffset.y <= top + 0.5` 已經包含回彈（offset < top），保留即可。

【備案 B：只有在診斷顯示 SwipeToDelete 也會擋 pan 時才做】
把 TripsList.swift:347 的 SwiftUI DragGesture 換成 UIKit 的 pan：在 gestureRecognizerShouldBegin 裡只放行「往左、而且橫向速度大於縱向 1.3 倍」，直的手勢會立刻失敗，交給清單。
```swift
struct HSwipe: UIGestureRecognizerRepresentable {
    var changed: (CGFloat) -> Void
    var ended: (CGFloat, CGFloat) -> Void   // dx, 速度 x
    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }
    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let g = UIPanGestureRecognizer(); g.delegate = context.coordinator; return g
    }
    func handleUIGestureRecognizerAction(_ g: UIPanGestureRecognizer, context: Context) {
        let dx = g.translation(in: g.view).x
        switch g.state {
        case .began, .changed: changed(dx)
        case .ended, .cancelled: ended(dx, g.state == .ended ? g.velocity(in: g.view).x : 0)
        default: break
        }
    }
    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            guard let p = g as? UIPanGestureRecognizer else { return true }
            let v = p.velocity(in: p.view); return v.x < 0 && abs(v.x) > abs(v.y) * 1.3
        }
    }
}
```
SwipeToDelete 裡用 `.gesture(HSwipe(...))` 取代 simultaneousGesture。enabled 為 false 時不掛，寫法同 RowHoldIf。刪除判斷照舊：`-dx > w*0.4 || dx + vx*0.2 < -w`。

### 診斷和驗收步驟（調查員原文；TouchSpy 要用上面驗證員修正版的寫法）
【A. 先證實原因：只加診斷，其他不改，DEBUG 才編】

1) 在 PanelLift.swift 的 Coordinator 裡加：
```swift
        private var spy: TouchSpy?
        private var minY: CGFloat = 0
        static func tag(_ o: AnyObject) -> String { String(UInt(bitPattern: ObjectIdentifier(o).hashValue) % 10000) }
```

2) attach 裡 `Perf.shared.mark("清單掛上")` 換成：
```swift
            let f = s.convert(s.bounds, to: nil)
            Perf.shared.mark("清單掛上 c=\(Self.tag(self)) sv=\(Self.tag(s)) f=\(Int(f.minY))-\(Int(f.maxY)) ch=\(Int(s.contentSize.height)) bh=\(Int(s.bounds.height))")
            #if DEBUG
            let sp = TouchSpy(s); s.addGestureRecognizer(sp); spy = sp
            #endif
```

3) detach 最前面加：
```swift
            if let sp = spy { sp.view?.removeGestureRecognizer(sp); spy = nil }
```

4) pan 裡：
- `if g.state == .began { told = false }` 改成：
```swift
                if g.state == .began {
                    told = false; minY = s.contentOffset.y
                    Perf.shared.mark("pan開始 sv=\(Self.tag(s)) y=\(Int(s.contentOffset.y))/\(Int(top)) ch=\(Int(s.contentSize.height)) bh=\(Int(s.bounds.height)) en=\(s.isScrollEnabled)")
                }
                minY = min(minY, s.contentOffset.y)
```
- `.ended/.cancelled/.failed` 的 `guard handing else { return }` 改成：
```swift
                guard handing else {
                    Perf.shared.mark("pan結束沒接手 st=\(g.state.rawValue) yMin=\(Int(minY)) dy=\(Int(dy))")
                    return
                }
```

5) 同檔加一個被動的觀察手勢 TouchSpy。它跟所有手勢同時存在、永遠不會成立，不擋任何手勢：
```swift
final class TouchSpy: UIGestureRecognizer, UIGestureRecognizerDelegate {
    weak var scroll: UIScrollView?
    private var p0: CGPoint = .zero
    private var done = false
    init(_ s: UIScrollView) {
        super.init(target: nil, action: nil)
        scroll = s; cancelsTouchesInView = false; delaysTouchesBegan = false; delaysTouchesEnded = false; delegate = self
    }
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { true }
    override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent) {
        guard let s = scroll, let u = t.first else { return }
        p0 = u.location(in: nil); done = false
        var chain: [String] = []; var v = u.view
        while let x = v, chain.count < 10 { chain.append(String(describing: type(of: x))); if x === s { break }; v = x.superview }
        let f = s.convert(s.bounds, to: nil)
        Perf.shared.mark("觸 x=\(Int(p0.x)) y=\(Int(p0.y)) sv=\(ListPullDown.Coordinator.tag(s)) off=\(Int(s.contentOffset.y)) ch=\(Int(s.contentSize.height)) bh=\(Int(s.bounds.height)) f=\(Int(f.minY))-\(Int(f.maxY))")
        print("[B8] 觸 hit=\(chain.joined(separator: " < "))")
    }
    override func touchesMoved(_ t: Set<UITouch>, with e: UIEvent) {
        guard !done, let s = scroll, let u = t.first, abs(u.location(in: nil).y - p0.y) > 25 else { return }
        done = true
        let rs = (u.gestureRecognizers ?? []).filter { $0 !== self }
            .map { "\(type(of: $0))@\(type(of: $0.view!))#\($0.state.rawValue)" }
        Perf.shared.mark("動25 pan=\(s.panGestureRecognizer.state.rawValue) off=\(Int(s.contentOffset.y))")
        print("[B8] 動25 pan=\(s.panGestureRecognizer.state.rawValue) 收到這指的手勢：\(rs.joined(separator: ", "))")
        state = .failed
    }
    override func touchesEnded(_ t: Set<UITouch>, with e: UIEvent) { state = .failed }
    override func touchesCancelled(_ t: Set<UITouch>, with e: UIEvent) { state = .failed }
    override func reset() { done = false }
}
```
state 的數值：0 possible、1 began、2 changed、3 ended、4 cancelled、5 failed。

【操作步驟】
行程有 3 站以上，面板在一半，清單在頂端。

S1. 從站卡中間（店名上，x 約 200）快速往下拉約 100pt 再放手。
S2. 同樣的動作，改從 LegRow（兩站之間的交通那行左半邊）拉，再從「之前說可以的 x≈90」拉。浮層上的「觸 x=」會是實際的 pt 座標。
S3. 拉到最高段，清單要比可視區長。從站卡中間往上滑，看能不能捲。
S4. 對照實驗：
- 暫時拿掉 TripPanel.swift:1467 的 `.gesture(hold)`，重做 S1。
- 還是不行的話，把 hold 加回去，改把 :457 的 SwipeToDelete 設成 `enabled: false`，再做 S1。
- 還是不行，再拿掉 :1466 的 `.onTapGesture`。

【一次判讀】
- 有「觸 …」，但「動25 pan=0」，而且沒有「pan開始」：清單的 pan 被別的手勢擋住，原因確認。
  - console 的「收到這指的手勢」列出的 SwiftUI 手勢類別：狀態是 1/2 的就是吃掉手指的那個；狀態一直是 0 的，表示 pan 在等它失敗。
  - S4 哪一步拿掉之後就好了，就是哪一個手勢。預期是拿掉 `.gesture(hold)` 那一步。
  - S3 同樣是 pan=0，表示從站卡上連捲都捲不動，同一個原因，同一個修法。
- 「動25 pan=1 或 2」，而且有「pan開始 y=0/0」，卻沒有「清單接手」：問題在接手邏輯，看 on 和 v 的值（不太可能）。
- 「pan開始 y=35」接著「pan結束沒接手 yMin=…」：
  - yMin > 0：放手前沒有捲回頂端，回答 (2) 的 (a)。
  - yMin ≤ 0 卻沒接手：當時 velocity ≤ 0，或者 offset 被 scrollTo 動畫搶走。
- 連「觸」都沒有：手指根本沒落到這個 UIScrollView。把觸點 y 和「清單掛上」的 f=minY-maxY 比，看是不是被上面別的圖層蓋住。
- 「清單掛上」的判讀：
  - 兩筆 sv 相同、c 不同：兩個 ListPullDown（空白那天或 stops 還沒載好時 TupleView 套了兩次）。
  - sv 不同：捲動區被換過。f 和觸點在同一個範圍、ch/bh 對得上看得到的清單的那一筆，就是對的那份。

【B. 修好後的驗證】（修法套上之後，TouchSpy 先留著，最後一起拿掉）
- V1：在頂端，從站卡任何位置往下拉都要接手，浮層出現「pan開始 y=0/0 → 清單接手」，面板 1:1 跟手，放手照規則停段（mid→low、high→mid）。測這些位置：號碼、照片、店名、右邊時間、LegRow、卡片之間、面板左右邊。
- V2：清單捲在中間時往下拉，同一個手勢回到頂端後接手（「清單接手」在同一個手勢裡）。從站卡中間上下捲都正常（「動25 pan=1 或 2」）。
- V3：按住不動 0.35 秒，會震一下並記「拿起一站」。上下拖時清單不捲，插入位置的震動回饋正常。拖到「第 N 天」放開會換天。拖到一半被系統取消（例如模擬器拉下通知中心），站會放回原位，不會卡在半路。
- V4：點一下，第一下地圖飛過去，同一站再點一下展開。長按拿起後放開，不會被當成點一下而展開。
- V5：左滑刪除照常（明顯橫向才算）。展開時不能左滑。往右滑回上一頁的判斷不受影響。
- V6：從起點那列和把手往下拉面板照常。首頁 NearbySheet 的 B1–B7 重跑一次。
- V7：加站或點第一站號碼之後，清單捲到頂端是 y=0，馬上往下拉就接手，不會出現「沒接手 y=2」。
- V8：進一個空白那天的行程，「清單掛上」只有一筆。
- V9：最低段橫向站卡左右捲和長按左右換位置都還正常（reorderX 這次沒改）。如果橫向也捲不動，把 RowHold 套到 MiniStop 上。
- V10：全部通過後，刪掉 TouchSpy 和多出來的 mark，保留「清單接手」。

### 驗證員補的測試
1. 先做步驟 0 的拆除實驗：0a 改成 simultaneousGesture(hold)，0b 把 SwipeToDelete 設成 enabled:false，看是哪一個擋住 pan。
2. TouchSpy 的 console：
   - 「動25 pan=0」，而且收到這指的手勢裡有 SwiftUI 的 recognizer 狀態是 0（possible）一直不變：pan 在等它失敗。
   - 有狀態 1/2 的 SwiftUI recognizer（例如 SwipeToDelete 的 drag 在 18pt 成立）：那個就是吃掉手指的手勢。
3. 空白那天的行程：
   - 「清單掛上」有兩筆，sv 相同、c 不同，就證實是 TupleView 套了兩次。
   - 修法之前，從最高往下拉一次，看會不會直接降到最低（settleSheet 被叫兩次）；放手後再往下拉，清單還會不會回彈（bounces 被還原成 false）。
4. 換成 RowHold 之後：
   - 按住 0.35 秒拿起後立刻上下拖，浮層不能出現「清單接手」，清單也不能先捲幾 pt。
   - 拿起後放開，不能被當成點一下而展開。
   - 拖到一半拉下通知中心，站要放回原位（.cancelled 會走 ended(false)→drop）。
5. 最低段橫向站卡（reorderX 一樣是 sequenced）：從卡片上左右捲能不能捲。不能的話 RowHold 也套到 MiniStop，位移改取 d.width、用 targetX。
6. 模擬器 Xcode 編譯：確認 RowHold 的 CoordinateSpaceConverter、context.converter.location(in: .global) 能過，TouchSpy 在 Swift 5 模式沒有 actor 隔離錯誤。

### 風險（調查員）
- 建議修法（UIKit RowHold）的風險：
  - UIGestureRecognizerRepresentable 是 iOS 18.0 起的 API。CoordinateSpaceConverter、context.converter.location(in: .global) 這些名稱雲端只能用 parse 檢查，要在 Xcode 確認能編譯。
  - SwiftUI 內部手勢的 delegate 如果回傳「可以同時」，拿起後 tap 或 SwipeToDelete 可能還會收到這根手指。已加兩道保險：tap 開頭的 held.endedAt guard，以及 SwipeToDelete 在 drag.id 不是 nil 時只吃 subviews。
  - 開發者論壇有人回報這個做法不會在按下時鎖住捲動，但我們這裡還沒實測，所以要跑 V1、V2。
  - 回報串裡 Apple 沒有正式說明，iOS 26.x 之後行為可能再改。
- `.background(ListPullDown)` 改包一層 VStack：空白那天原本兩塊各自有 padding.top 2，現在只有外層一次，版面差 2pt。
- 加的頂端錨點是 0 高的 Color.clear，不影響版面。
- reorderX（橫排）這次沒改，可能有同樣的問題，由 V9 檢查。
- TouchSpy 是被動觀察用，不會成立，理論上不影響行為。為了保險只在 DEBUG 編譯，驗收完刪掉。
- 「x≈90 可以」和「y=35 那筆從哪來」都還是推測，要看診斷結果才能確定，不要先依這兩點改程式。

## F1 點圖釘地圖沒移動

### 原因（反方驗證後）
程式碼可以確定的（034e6b5）：
(1) 點圖釘一定走 picked() 的近路（MapTab.swift:577，0.55 秒平移、不改縮放）。看得到的圖釘離中心最多 0.5×span，達不到 far 的 0.6 門檻。抽一間抽到畫面外的店才會走 :562-575 的兩段飛行。
(2) 選中後，首頁沒有別的程式碼會寫 pos，也不會改 Map 的 safeAreaPadding（:156-157）。G8d 之後，選中只改 midH 和 midTop。
(3) ReelCache 和 Supa 是 @MainActor，5048a9e 只把 warm 延到 850ms（:546）。主執行緒上最重的是 Reel.swift:185-193 的 player()，以及 :173 的 replaceCurrentItem；JSON 解碼只是小頭。

還沒證實（推測），要用 sim_check 分：
H-MK：MapKit 的點擊選取（.tag(p.id)，:92）晚約 0.3 秒才送來，蓋掉了正在跑的平移。反證：MapKit 也會選取泡泡（G8b、ac36167），同樣晚 0.3 秒送來，但點泡泡的 zoom() 目前正常。所以只有在「binding 已經先選中這根」這個差別真的有影響時，H-MK 才成立。
H-SAME：MapKit 中斷了動畫，卻沒把 binding 改成 positionedByUser。之後任何「再寫一次同樣的 .region(to)」都不會動。
H-HIT：點擊被 ClipCapsule（FoodMapApp.swift:165-169，面板上緣 +8）或訊息條吃掉。如果 s1 的 sample 裡有 ReelCache.warm，就可以排除這條，因為那代表 picked 跑了、選取也維持了 850ms。
H-STALE：store.mapRegion 只在 onEnd（:179）更新，鏡頭還在動時點下去，cur 是舊的。
決定性的對照組是「抽一間抽中畫面內（近）的店」：它走同一條近路，但沒有 MapKit 點擊。

### 先加的診斷 log（跟修法同一個 build，DEBUG 才印，驗完拿掉）
=== 第 0 步：先證實原因（暫時的 print，全部加 F1 前綴，驗完拿掉）===
a) FoodPin Button（:1583 前）：`print("F1 BTN \(place.id) t=\(CACurrentMediaTime())")`
b) Map selection setter（:84 的 set 閉包第一行）：`print("F1 MKSEL \(id ?? "nil") t=\(CACurrentMediaTime())")`
c) picked() 算完 to 之後：
```swift
quiet.dbg = CACurrentMediaTime()
let cy: CGFloat = cur.flatMap { proxy.convert($0.center, to: .global)?.y } ?? -1
print("F1 PICK \(id) far=\(far) curLat=\(cur?.center.latitude ?? 0) curSpan=\(cur?.span.latitudeDelta ?? 0) toLat=\(to.center.latitude) toLng=\(to.center.longitude) byUser=\(pos.positionedByUser) centerY=\(cy) midY=\(mapRect.midY) safeMid=\((headY + footY) / 2) t=\(quiet.dbg)")
```
d) continuous 回呼：`if CACurrentMediaTime() - quiet.dbg < 2 { print("F1 CAM \(c.region.center.latitude),\(c.region.center.longitude) span=\(c.region.span.latitudeDelta) byUser=\(pos.positionedByUser) t=\(CACurrentMediaTime())") }`
e) onEnd 開頭：`print("F1 END \(c.region.center.latitude),\(c.region.center.longitude) span=\(c.region.span.latitudeDelta) byUser=\(pos.positionedByUser) pos=\(pos.region?.center.latitude ?? 0) t=\(CACurrentMediaTime())")`
f) Reel.swift:172 前：`print("F1 WARM player t=\(CACurrentMediaTime())")`

操作：HUD 開著（-perfOverlay），地圖放大到街道級，面板在中段。依序點：搜尋列正下方的圖釘、面板上緣上方的圖釘、左右邊緣 x<30 的圖釘，各 5 次；再從台灣全景點一根落單的圖釘 5 次；再點一顆遠處的泡泡、放大後點新出現的圖釘 5 次。最後抽一間抽中遠的店 3 次當對照組。另外做一組：剪貼簿有連結、ClipCapsule 出現時，點膠囊正後方的圖釘。

判讀：
- 沒有 BTN、也沒有 PICK，HUD 沒有「點圖釘」：H-HIT，點擊被 ClipCapsule 或訊息條吃掉。這是版面問題，不是鏡頭問題，另外處理。
- 有 PICK，但 |toLat−curLat| < 0.15×curSpan：圖釘本來就在中間附近，本來就幾乎不用動。如果 curLat 和前一筆 CAM 差很多，就是 H-STALE（修法第 3、5 步的 quiet.live）。
- 有 PICK，CAM 開始往 to 走，約 0.25–0.35 秒時出現一行 MKSEL（id 相同或 nil），接著 CAM 停住或往回走，END 不在 to，byUser 變成 true：H-MK。抽一間的那組不會出現 MKSEL。
- 有 PICK，之後完全沒有 CAM：pos 寫了但沒套用。比對 END 的 pos= 和 toLat，回報給評審。
- CAM 和 END 都到了 to，但按 ✕ 之後 1 秒內 HUD 出現「卡片列移地圖」，地圖被拉回去：H-PULL（修法第 8 步）。
- 順便看 PICK 的 centerY 是接近 midY（約 437）還是 safeMid（(180+630)/2 = 405），這能確定 c.region 是整張地圖還是扣掉 safe area 的範圍。如果是 safeMid，邊緣的圖釘可能會被判成 far。也比對 END 的 span 和 PICK 的 curSpan：兩者應該相等，不相等表示每點一次縮放都會跟著變。
- ReelCache：在 sample 或 Time Profiler 的 Main Thread 看，修好前會有 Supa.reelVideo、JSONDecoder、ReelCache.player 的樣本。[reel] reel-video 那行的 main=true 表示解碼在主執行緒。

補充（驗證員）：
第 0 步要加或修正的地方：
a) PICK 那行在寫 pos 之前加 `same=\(pos == .region(to))`、`live=\(quiet.live?.center.latitude ?? 0)`。如果 same=true，就是 H-SAME，Map 收到同樣的值所以不動。
b) 第 0 步 d 用到 c.region 時，continuous 回呼的參數要從 `_` 改成 `c`，閉包裡原本的 `c` 改名成 c2，不然會撞名或編譯失敗。
c) 加對照組「抽一間抽中畫面內（近）的店」5 次，這組最重要。
   - 抽一間近的也不動：不是 H-MK，是近路本身或 H-SAME；看 same= 和 CAM。
   - 抽一間近的會動、點圖釘不動：H-MK 才成立，接著看 MKSEL 的時間點。
d) 加對照組「點泡泡」5 次：MKSEL 應該在 0.3 秒左右送來一個帶逗號的 id，而且 zoom 會走完。如果這組也被打斷，代表 MapKit 的點擊會打斷所有 pos 動畫，不只是圖釘。
e) 確認題目那份 sample 是不是 s1 錄的。如果 s1 的 sample 有 ReelCache.warm，就表示 picked 跑了、選取也維持了 850ms，H-HIT 可以排除，不用再測膠囊那組。
f) PICK 的 centerY 接近 437 而且 END 的 span 約是 PICK curSpan 的 1.9 倍：c.region 是整張地圖，而 MapKit 會把 region 塞進 safe area。這樣每點一次就拉遠一次，是另一個 bug，要另外回報。

### 修法
（長算式都拆成有型別的 let；不改 safe area，不在 body 裡多讀任何 state）

=== 1. MapPanel.swift ===
檔案開頭加 `import MapKit`。CamQuiet（:38-42）換成下面這段（class 本身維持非隔離，只有 settled 標 @MainActor）：
```swift
// 鏡頭是自己移的（點圖釘、框收藏、邊距變了）：這段時間內的鏡頭變動不算「手指拖地圖」
// 不是 @Observable：每幀的鏡頭回呼讀它，不會讓 MapTab 重算
final class CamQuiet {
    var until: CFTimeInterval = 0
    var flyTo: (lat: Double, lng: Double)?      // 飛去遠的店的終點（停在那裡時在量測浮層記一筆「飛完」）
    var live: MKCoordinateRegion?               // 每幀的鏡頭範圍（store.mapRegion 要停下才更新）
    var lastMove: CFTimeInterval = 0            // 最後一次鏡頭在動的時間
    func hush(_ s: Double = 1.0) { until = max(until, CACurrentMediaTime() + s) }
    // 鏡頭停了（0.15 秒沒動、沒有還沒降落的飛行）才回來；最多等 max 秒
    @MainActor func settled(max: Double = 2) async {
        let end: CFTimeInterval = CACurrentMediaTime() + max
        while CACurrentMediaTime() < end {
            let still: Bool = CACurrentMediaTime() - lastMove > 0.15
            if still && flyTo == nil { return }
            try? await Task.sleep(for: .milliseconds(100))
        }
    }
}
```

=== 2. Perf.swift:19 ===
`@ObservationIgnored private var touchDown` 改成 `@ObservationIgnored private(set) var touchDown`。

=== 3. MapTab.swift:160 continuous 回呼 ===
```swift
.onMapCameraChange(frequency: .continuous) { c in
    quiet.live = c.region
    let now = CACurrentMediaTime()
    quiet.lastMove = now
    if !trip.on, pos.positionedByUser, now > quiet.until, now > MapPanel.shared.calmUntil, !MapPanel.shared.dragging {
        MapPanel.shared.go(.low)
    }
    dot.refresh()
    pinFrame(proxy)
    if let c2 = spot.coord, Date() < spot.until { spot.at = proxy.convert(c2, to: .global) }
}
```
onEnd（:170-193）不動。

=== 4. MapTab.swift picked()：:546 換成 ===
（:546 這一段先不做，維持現狀，等 perf-round1b.md；下面 :554-577 那段要做）
```swift
        // 影片預載：時間點不變（0.85 秒後、還選著才載）；播放器等鏡頭停了才建
        Task {
            try? await Task.sleep(for: .milliseconds(850))
            guard pins.sel == p.id else { return }
            ReelCache.warm(p) { [quiet] in await quiet.settled() }
        }
```
:554-577 換成：
```swift
        selfMoved = true
        // 飛行中不用每幀的範圍（span 是拉遠的）；其他時候用每幀的（store.mapRegion 要停下才更新）
        let liveNow: MKCoordinateRegion? = quiet.flyTo == nil ? quiet.live : nil
        let cur: MKCoordinateRegion? = liveNow ?? store.mapRegion ?? shownRegion
        let span = cur?.span ?? MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
        let far = cur.map { abs(c.latitude - $0.center.latitude) > $0.span.latitudeDelta * 0.6 || abs(c.longitude - $0.center.longitude) > $0.span.longitudeDelta * 0.6 } ?? false
        let to = aim(MKCoordinateRegion(center: c, span: span), grow: false)
        flyTask?.cancel(); quiet.flyTo = nil
        let t0: CFTimeInterval = CACurrentMediaTime()
        if far && !reduce, let from = cur?.center {
            let dLat = abs(from.latitude - to.center.latitude), dLng = abs(from.longitude - to.center.longitude)
            let out = MKCoordinateRegion(center: .init(latitude: (from.latitude + to.center.latitude) / 2, longitude: (from.longitude + to.center.longitude) / 2),
                                         span: .init(latitudeDelta: min(max(span.latitudeDelta * 1.6, dLat * 1.3), 8), longitudeDelta: min(max(span.longitudeDelta * 1.6, dLng * 1.3), 8)))
            quiet.flyTo = (to.center.latitude, to.center.longitude)
            withAnimation(.easeIn(duration: 0.32)) { pos = .region(out) }
            flyTask = Task {
                try? await Task.sleep(for: .milliseconds(300))
                // 換了別間、手指真的拖了地圖：不降落（定位、泡泡會直接取消這個 Task）
                guard !Task.isCancelled, pins.sel == id, !userMoved(since: t0) else { quiet.flyTo = nil; return }
                selfMoved = true
                withAnimation(.easeOut(duration: 0.5)) { pos = .region(to) }
                await recheck(id, to, t0, after: 500)
            }
        } else {
            withAnimation(.smooth(duration: 0.55)) { pos = .region(to) }
            flyTask = Task { await recheck(id, to, t0, after: 550) }
        }
```
picked() 後面新增兩個函式：
```swift
    // 手指真的拖了地圖：MapKit 標成使用者移的，而且 pick 之後手指碰過螢幕（只碰面板、或只有 MapKit 自己接管，都不算）
    private func userMoved(since t0: CFTimeInterval) -> Bool {
        pos.positionedByUser && Perf.shared.touchDown > t0
    }

    // 動畫時間過了、鏡頭停了還不在 to（被 MapKit 打斷或帶走）、也不是手指拖的：補寫一次。
    // 補寫的值要跟上次不一樣（span 乘 1.0001）：pos 沒被 MapKit 改掉時，寫同一個值 Map 不會動
    private func recheck(_ id: String, _ to: MKCoordinateRegion, _ t0: CFTimeInterval, after ms: Int) async {
        try? await Task.sleep(for: .milliseconds(ms + 150))
        guard !Task.isCancelled else { return }
        await quiet.settled(max: 1.2)
        guard !Task.isCancelled, pins.sel == id, !trip.on, !userMoved(since: t0), let r = quiet.live else { return }
        let dLat: Double = abs(r.center.latitude - to.center.latitude)
        let dLng: Double = abs(r.center.longitude - to.center.longitude)
        let okLat: Bool = dLat < to.span.latitudeDelta * 0.15
        let okLng: Bool = dLng < to.span.longitudeDelta * 0.15
        if okLat && okLng { return }
        Perf.shared.mark("鏡頭補移")
        selfMoved = true
        quiet.hush()
        let span2 = MKCoordinateSpan(latitudeDelta: to.span.latitudeDelta * 1.0001, longitudeDelta: to.span.longitudeDelta * 1.0001)
        let again = MKCoordinateRegion(center: to.center, span: span2)
        withAnimation(.smooth(duration: 0.45)) { pos = .region(again) }
    }
```
（遠路如果沒降落在 15% 以內，flyTo 不會被清掉，settled 最多等 1.2 秒，接著補移。補移停下後，onEnd 照舊記「飛完」。）

=== 5. 別的鏡頭動作接手時取消 flyTask ===
- 定位鈕（:317 `Haptic.light()` 下一行）：`flyTask?.cancel(); quiet.flyTo = nil`
- zoom()（:752 `Haptic.light()` 下一行）：`flyTask?.cancel(); quiet.flyTo = nil`
（focus()、換群組時的 fit() 都會先讓 sel 變成 nil，recheck 的 `pins.sel == id` 就擋住了；行程模式由 `!trip.on` 擋住。）

=== 6. Reel.swift:166-175 warm ===
（這一步先不做，等 perf-round1b.md 一起決定影片預載怎麼移出主執行緒）
```swift
    static func warm(_ p: Place, settle: (@MainActor () async -> Void)? = nil) {
        guard !NetPath.shared.costly else { return }
        guard maybeVideo(p), let src = p.source_url, !ready.contains(where: { $0.src == src }) else { return }
        Task {
            guard let u = await url(src) else { return }
            // AVPlayer 在主執行緒建：地圖還在動就等它停（最多 2 秒）
            if let settle { await settle() }
            guard !ready.contains(where: { $0.src == src }) else { return }
            ready.append((src, u, player(u)))
            if ready.count > 2 { ready.removeFirst().player.replaceCurrentItem(with: nil) }
        }
    }
```
卡片的 PressStyle { ReelCache.warm(p) } 不傳 settle，行為不變。

=== 7.（選做，效益小）Supa.swift ===
（同上，先不做）
:7-8 改成 `nonisolated static let url = ...`、`nonisolated static let key = ...`。:265 reelVideo 前面加 `nonisolated`，`let s = try await fresh()` 照舊。print 那行加上 `main=\(pthread_main_np() != 0)` 驗證用。如果編譯器不接受 nonisolated static let，就整步不做，不影響第 1-6 步。

=== 8. 只有 sim_check 證實 H-PULL 才做 ===
同調查員第 8 步（PickedCard close :1066-1069 加 near.places 檢查，加 closedAt 0.8 秒窗口）。

=== 9. 只有 H-MK 證實、而且補移看起來會頓一下時才做，要先問 Anthony ===
同調查員第 9 步（拿掉 FoodPin 的 .tag，改由自己處理點空白處取消）。

### 驗修好
=== 驗修好（套修法 1–7）===
1. 上面每個點法都做 5 次：0.55 秒平移，圖釘停在搜尋列下方、大卡上方；HUD 有「點圖釘」。如果出現「鏡頭補移」，表示 MapKit 確實把鏡頭帶走、補移有接住，記下次數；次數多或看起來會頓，就評估修法第 9 步。最後一筆 END 要在 to 的 0.15×span 以內。
2. 台灣全景點落單的圖釘：維持現在的縮放，平移到那根（spec 寫的是「不改縮放」）。點圖釘不會觸發飛行，這是設計，不是 bug；要不要改成飛過去要問 Anthony。
3. 遠的抽一間照舊：拉遠、降落，HUD 有「飛完」。飛行中手指拖地圖不會降落；飛行中按定位鈕會停在定位，沒有「飛完」；飛行中點另一根，只會飛到新的那根。
4. ✕ 關大卡：1 秒內沒有「卡片列移地圖」，地圖不會被拉回去（修法第 8 步有做才驗）。
5. 影片（第 6、7 步先不做，這一項等 perf-round1b.md 的版本再驗）：[reel] reel-video 那行是 main=false；F1 WARM player 的時間要晚於最後一筆 F1 CAM 至少 150ms，而且在「飛完」之後。sample 的 Main Thread 在選中後 0–2 秒內沒有 Supa、JSONDecoder 的樣本，ReelCache.player 只出現在鏡頭停下之後。點進店家頁仍然顯示「[reel] 用先緩衝好的播放器」。
6. 回歸：geo 那行維持「地圖 0,0 402×874・框 180–630」；減少動態時直接平移；行程模式點收藏時鏡頭完全不動（quiet.aim 有 !trip.on 擋住）；長按圖釘的選單照常出現。

驗證員補的項目：
1. recheck 要印一行 `F1 RECHECK ok=… byUser=…`。正常平移時 ok=true、沒有「鏡頭補移」。連點 A、B 兩根（0.3 秒內）時，也不能出現「鏡頭補移」，舊修法在這裡會誤觸。
2. 遠的抽一間：拉遠那段飛行中用手指碰一下大卡或面板，還是要降落；只有真的拖地圖才不降落。
3. 平移中按定位：停在定位，0.7–2 秒後不會被補移拉回那根圖釘。點泡泡也一樣。
4. 進店家頁很快的話（2 秒內），log 要確認沒有同一支影片建兩個播放器。也就是「[reel] 用先緩衝好的播放器」沒出現時，warm 不能再晚 append 一個。真的發生就在 warm 的 settle 之後加 `guard store 不在店家頁` 或接受。
5. 回歸：geo 那行維持「地圖 0,0 402×874・框 180–630」。點圖釘後 HUD「重畫 地圖」不增加。剪貼簿膠囊的位置和文字不變（本修法沒動 Onboard/FoodMapApp）。首頁清單往下拉、點泡泡、定位照常。

## G2a 剪貼簿膠囊按三次 ✕ 沒有靜音

### 原因（反方驗證後）
計數本身沒有 bug（Onboard.swift:65-72、:121-131、:139-141，FoodMapApp.swift:59、:166、:193）。

每次複製只會出現一條膠囊。要再出現，必須同時符合兩點：剪貼簿重新寫入過（changeCount ≠ seen，見 :80-81、:104-105），而且 App 從背景回到 .active（或冷啟動）。

在同一條膠囊上連點 ✕，或 App 一直開在前景時換剪貼簿，最多只算 1 次，skips 到不了 3，所以 toast 不會出現。這是根據程式碼推出來的結論。要用 [clip] log 證實：如果只看到一行 `skip before=0`，就是這個原因。如果看到 `skip before=2` 卻沒有 toast，就要翻案，回頭查 toast overlay。

### 修法和測法
不用改產品程式。保留調查員的 B（只加 DEBUG print）。C 是可選的，要等 Anthony 決定。下面只修正測法：清狀態、到期測試都改用啟動參數，不用 simctl spawn defaults。

```sh
BID=io.github.gop9632.foodmap
# 0) 歸零並冷啟動（NSArgumentDomain 會蓋過 App 自己 domain 的值，ClipWatch.shared 初始化時讀到 0）
xcrun simctl terminate booted $BID
xcrun simctl launch --console-pty booted $BID -clipSkips 0 -clipMuteUntil 0   # 或用 Xcode 跑，在 Scheme > Arguments 加這兩組參數，看 [clip] log
# 等首頁出來（已登入、教學跑完、沒開通知小卡、不在行程模式、沒開 sheet）

# 每一輪（第 i 輪）：
xcrun simctl openurl booted https://example.com           # App 進背景（也可以按 Cmd+Shift+H）
echo "https://www.instagram.com/reel/TEST$i/" | xcrun simctl pbcopy booted   # App 在背景時才 pbcopy，changeCount 才會在 App 不在前景時改變
# 點模擬器上的 Bitemap 圖示回到 App（或執行 xcrun simctl launch booted $BID，不要加 --terminate-running-process）
# 膠囊出現後，8 秒內按 ✕ 一次，只按一次，等膠囊收掉
```

預期（看 log）：
- 第 1 輪：`check n=A seen=…` → `show n=A` → `skip before=0`，沒有 toast。
- 第 2 輪：`skip before=1`，沒有 toast。
- 第 3 輪：`skip before=2`，出現 toast「兩週內不再問；要收藏按右上「＋」」，在地圖首頁貼著面板上緣，2.6 秒後收起。
- 第 4 輪：`check … mute=true`，膠囊不出現。

持久化：`xcrun simctl terminate booted $BID`，然後不帶參數 `xcrun simctl launch booted $BID`，再跑一輪（TEST5）。log 應該是 `mute=true`，膠囊不出現。這就證明 clipMuteUntil 有寫進 App 自己的 UserDefaults。不要用 Xcode 的停止鍵關 App，要先切到背景，或用 simctl terminate。

到期：terminate 後執行 `xcrun simctl launch booted $BID -clipMuteUntil 1`，跑一輪（TEST6），膠囊會再出現。

歸零：用 `-clipSkips 0 -clipMuteUntil 0` 啟動。按 ✕ 兩輪，第 3 輪改按膠囊上的「貼上」（不是新增視窗裡的貼上），log 是 `pasted -> reset`。之後再 ✕ 兩輪都不會出現 toast，第 3 次才會出現。

8 秒不算：其中一輪不碰膠囊。log 是 `auto-hide`，skips 不變。

不要做的事：
- App 在前景時 pbcopy。
- 只靠 Mac 剪貼簿同步換內容。
- 在同一條膠囊上連點 ✕。
這三種都只會算 0 或 1 次。

如果真的要用 defaults 直接改檔：先 terminate，再改 `$(xcrun simctl get_app_container booted $BID data)/Library/Preferences/$BID.plist`（用 plutil -remove / -replace）。不過 cfprefsd 可能有快取，比啟動參數不可靠，不建議。

### DEBUG log（Onboard.swift，只印不改行為）
在 Onboard.swift 這幾個地方暫時加 print：
1) check() 第一行（:78 之後）：
`#if DEBUG
print("[clip] check n=\(UIPasteboard.general.changeCount) seen=\(seen) mute=\(Date().timeIntervalSince1970 < muteUntil) skips=\(skips)")
#endif`
2) show() 開頭（:104）：`print("[clip] show n=\(n)")`
3) skip() 開頭（:122 之前）：`print("[clip] skip before=\(skips)")`
4) pasted() 開頭（:140 之前）：`print("[clip] pasted -> reset")`
5) hide Task 收起前（:116 dismiss() 之前）：`print("[clip] auto-hide")`

判讀：
- 照原本的測法重做一次。如果 log 只有一行 `[clip] skip before=0`，之後沒有新的 `check`，或者 check 印出的 n 等於 seen，就證實是測法問題：膠囊沒有重新出現，或同一條膠囊上的連點沒有打到它。
- 如果連點 5 次卻有多行 skip（before=0,1,2…），代表移除中的膠囊還接收點擊。那第 3 行就應該出現 toast；如果 toast 沒出現，再往 toast overlay 查。
- 如果看到 `[clip] skip before=1`，接著冷啟動後的 check 印出 skips=0，代表 UserDefaults 沒寫進去（例如 Xcode 停止 App 是直接殺掉，最近一次寫入來不及存）。這是推測，可能性很低。用 `xcrun simctl spawn booted defaults read io.github.gop9632.foodmap clipSkips` 對照。
- 如果按 ✕ 後膠囊有收掉，卻沒有任何 `[clip] skip` 那一行，代表 ✕ 的 action 沒觸發，膠囊是被 8 秒倒數收掉的（log 會有 auto-hide）。這時要懷疑父層 `.simultaneousGesture(DragGesture(minimumDistance: 0))`（Onboard.swift:206-208）吃掉了 Button。這是推測，同樣寫法的 toast「復原」按鈕可以按，所以可能性低。

驗證員補的判讀：
1. 先用調查員的 [clip] print，照原本的測法重做一次，看 log 屬於哪一種：
   - 只有一行 `skip before=0`：測法問題，確認。
   - 有好幾行 skip，或出現 `skip before=2` 卻沒有 toast：翻案，改查 FoodMapApp.swift:109 起的 toast overlay，以及 store.toast 是不是在同一個 runloop 被別處清掉（Trip.swift:453/543/637、TripPanel.swift:800/973、Store.swift:1006）。
   - 膠囊收掉了卻沒有 skip 那一行、只有 `auto-hide`：代表 ✕ 被 :206 的 simultaneousGesture 吃掉了。
2. 在 check() 的 print 也印 `ProcessInfo.processInfo.arguments`，確認啟動參數有帶進去。
3. 驗完確認 Perf HUD 的 App／MapTab 重算次數，和加 print 之前一樣。print 不會碰被觀察的屬性，應該不會變。

## G9c 全台縮小時泡泡互疊

### 原因（反方驗證後）
同意調查員的原因 1-7，行號都是 034e6b5 的 MapTab.swift。前三項直接從程式碼看得出來：
- :689 用 46pt 圓距判斷，但 ClusterBubble（:1909-1916）是 padding 9 加 emoji 加數字、minWidth 46 的膠囊，有 emoji 就一定比 46 寬。兩位數泡泡左右相鄰、中心距在 46 到約 60 之間時不會合併，邊緣就疊在一起。寬度是推估，要用 onGeometryChange 實測。
- :679 只拿 count ≥ 2 的格子，單根圖釘不參與比對。
- :685-694 只往後比，合併後中心移動了，沒有跟前面的組重比。

還有兩點：
- Dictionary 順序不固定，屬於推測，用 order 雜湊證實。
- aside() 推開後沒有再比；sel、extra、keep 沒有被當成障礙。

### 修法
只改 MapTab.swift。(1)(2) 跟調查員的版本一樣，(3) 有兩處修正，(4) 是新增的、要看實測決定。

(1) BubbleBox 放在 PinCluster（約 :1883）上面，照調查員原文，不變：
```swift
@MainActor enum BubbleBox {
    static let h: CGFloat = 46
    static let gap: CGFloat = 4
    private static var cache: [String: CGFloat] = [:]
    static func width(_ n: Int, _ emoji: String) -> CGFloat {
        let k = "\(n)|\(emoji)"
        if let w = cache[k] { return w }
        let numFont = UIFont.systemFont(ofSize: 17, weight: .black)
        let num: CGFloat = ceil(("\(n)" as NSString).size(withAttributes: [.font: numFont]).width)
        var emo: CGFloat = 0
        if !emoji.isEmpty {
            let emoFont = UIFont.systemFont(ofSize: 15)
            emo = ceil((emoji as NSString).size(withAttributes: [.font: emoFont]).width) + 2
        }
        let raw: CGFloat = 9 + emo + num + 9 + 2
        let w: CGFloat = max(46, raw)
        cache[k] = w
        return w
    }
}
```

(2) ClusterBubble 非 small 分支照調查員原文：`.padding(.horizontal, 9).frame(minWidth: 46, minHeight: 46)` 換成 `.frame(width: BubbleBox.width(c.ids.count, c.emoji), height: BubbleBox.h)`，數字 Text 加上 `.lineLimit(1).minimumScaleFactor(0.7)`。overlay、shadow、contentShape 都不動。

(3) recluster 從 :666 `guard let r` 到 :716 `let nextHidden` 整段換掉。跟調查員版本的差別只有兩處：一是選到的那根改用 1 倍 pinBox 當障礙，不加放大框和店名牌；二是長算式拆開。
```swift
        guard let r = store.mapRegion ?? shownRegion else { return }
        let cell = pow(2, ceil(log2(max(r.span.longitudeDelta / Double(Self.mapWidth) * 44, 1e-7))))
        let small: Bool = trip.on
        let pinScale: CGFloat = small ? 0.65 : 1
        let avatarW: CGFloat = store.mapGroupName == nil ? 0 : 6
        let gap: CGFloat = BubbleBox.gap
        func pinBox(_ pt: CGPoint, _ s: CGFloat) -> CGRect {
            let w: CGFloat = 44 * s
            let h: CGFloat = 51 * s
            return CGRect(x: pt.x - w / 2, y: pt.y - h, width: w + avatarW * s, height: h)
        }
        var pts: [String: CGPoint] = [:]
        var mercY: [String: Double] = [:]
        var cells: [String: [Place]] = [:]
        var fixed: [CGRect] = []
        let keep: Set<String> = trip.on && trip.searchOn ? Set(trip.search.found.map(\.id)) : []
        for p in currentList {
            guard let pt = proxy.convert(CLLocationCoordinate2D(latitude: p.lat!, longitude: p.lng!), to: .local) else { continue }
            pts[p.id] = pt
            // 選到的、抽中被篩掉的、行程搜到的：不合進泡泡，泡泡要讓開。
            // 選到的只用一般大小的框（它本來就是沒疊到別人的單根），點圖釘時泡泡就不會跟著動、地圖也不會重算
            if p.id == pins.sel || p.id == pins.extra || keep.contains(p.id) {
                let full: Bool = p.id == pins.sel || keep.contains(p.id)
                fixed.append(pinBox(pt, full ? 1 : pinScale))
                continue
            }
            let y: Double = log(tan(.pi / 4 + p.lat! * .pi / 360)) * 180 / .pi
            mercY[p.id] = y
            let cx: Int = Int((p.lng! / cell).rounded(.down))
            let cy: Int = Int((y / cell).rounded(.down))
            cells["\(cx),\(cy)", default: []].append(p)
        }
        if trip.on {
            for m in trip.marks {
                guard let pt = proxy.convert(m.coord, to: .local) else { continue }
                let s: CGFloat = trip.hot == m.id ? 52 : 44
                fixed.append(CGRect(x: pt.x - s / 2, y: pt.y - s / 2, width: s, height: s))
            }
        }
        func topCats(_ g: [Place]) -> [Cat] {
            let by: [String: [Place]] = Dictionary(grouping: g, by: \.cat.key)
            let keys: [String] = by.keys.sorted { (a: String, b: String) -> Bool in
                let ca: Int = by[a]!.count
                let cb: Int = by[b]!.count
                if ca != cb { return ca > cb }
                let ia: Int = Cat.order.firstIndex(of: a) ?? 99
                let ib: Int = Cat.order.firstIndex(of: b) ?? 99
                return ia != ib ? ia < ib : a < b
            }
            return keys.prefix(2).map { by[$0]![0].cat }
        }
        struct Node {
            var ps: [Place]
            var sx: CGFloat, sy: CGFloat
            var lng: Double, my: Double
            var key: String
            var c: CGPoint = .zero
            var box: CGRect = .zero
            var cats: [Cat] = []
            var emoji = ""
        }
        func shove(_ b: CGRect, _ o: CGRect) -> CGRect {
            let g2: CGFloat = gap + 0.5
            let right: CGFloat = o.maxX + g2 - b.minX
            let left: CGFloat = b.maxX - (o.minX - g2)
            let down: CGFloat = o.maxY + g2 - b.minY
            let up: CGFloat = b.maxY - (o.minY - g2)
            let m: CGFloat = min(min(right, left), min(down, up))
            if m == right { return b.offsetBy(dx: right, dy: 0) }
            if m == left { return b.offsetBy(dx: -left, dy: 0) }
            if m == down { return b.offsetBy(dx: 0, dy: down) }
            return b.offsetBy(dx: 0, dy: -up)
        }
        func shape(_ n: inout Node) {
            let k = CGFloat(n.ps.count)
            let mid = CGPoint(x: n.sx / k, y: n.sy / k)
            guard n.ps.count >= 2 else { n.c = mid; n.box = pinBox(mid, pinScale); return }
            n.cats = topCats(n.ps)
            n.emoji = n.cats.first?.emoji ?? ""
            let w: CGFloat = small ? 44 : BubbleBox.width(n.ps.count, n.emoji)
            let h: CGFloat = small ? 44 : BubbleBox.h
            var b = CGRect(x: mid.x - w / 2, y: mid.y - h / 2, width: w, height: h)
            for _ in 0..<3 {
                guard let o = fixed.first(where: { $0.insetBy(dx: -gap, dy: -gap).intersects(b) }) else { break }
                b = shove(b, o)
            }
            n.c = CGPoint(x: b.midX, y: b.midY)
            n.box = b
        }
        var seeds: [Node] = []
        for (key, g) in cells {
            var n = Node(ps: g, sx: 0, sy: 0, lng: 0, my: 0, key: key)
            for p in g {
                let pt: CGPoint = pts[p.id]!
                n.sx += pt.x; n.sy += pt.y; n.lng += p.lng!; n.my += mercY[p.id]!
            }
            shape(&n)
            seeds.append(n)
        }
        seeds.sort { (a: Node, b: Node) -> Bool in
            if a.ps.count != b.ps.count { return a.ps.count > b.ps.count }
            return a.key < b.key
        }
        var nodes: [Node?] = seeds
        var work: [Int] = Array(nodes.indices.reversed())
        while let i = work.popLast() {
            guard var a = nodes[i] else { continue }
            let ra: CGRect = a.box.insetBy(dx: -gap, dy: -gap)
            var best = -1
            var bestD = CGFloat.greatestFiniteMagnitude
            for j in nodes.indices where j != i {
                guard let b = nodes[j], ra.intersects(b.box) else { continue }
                let d: CGFloat = hypot(a.c.x - b.c.x, a.c.y - b.c.y)
                if d < bestD { bestD = d; best = j }
            }
            guard best >= 0, let b = nodes[best] else { continue }
            a.ps += b.ps; a.sx += b.sx; a.sy += b.sy; a.lng += b.lng; a.my += b.my
            a.key = min(a.key, b.key)
            shape(&a)
            nodes[i] = a
            nodes[best] = nil
            work.append(i)
        }
        let groups: [Node] = nodes.compactMap { $0 }.filter { $0.ps.count >= 2 }
        let next = groups.map { n -> PinCluster in
            let k: Double = Double(n.ps.count)
            let kc: CGFloat = CGFloat(n.ps.count)
            let mid = CGPoint(x: n.sx / kc, y: n.sy / kc)
            let yy: Double = n.my / k
            let rad: Double = 2 * atan(exp(yy * .pi / 180)) - .pi / 2
            var la: Double = rad * 180 / .pi
            var ln: Double = n.lng / k
            let off: CGFloat = hypot(n.c.x - mid.x, n.c.y - mid.y)
            if off > 0.5, let c = proxy.convert(n.c, from: .local) {
                la = c.latitude; ln = c.longitude
            }
            let cats: [Color] = n.cats.map(\.color)
            let colors: [Color] = cats.count > 1 ? cats : [cats[0], cats[0].opacity(0.75)]
            return PinCluster(id: n.ps.map(\.id).sorted().joined(separator: ","), ids: n.ps.map(\.id),
                              lat: la, lng: ln, colors: colors, emoji: n.emoji)
        }.sorted { $0.id < $1.id }
        let nextHidden = Set(groups.flatMap { $0.ps.map(\.id) })
```
:717 之後（moved、guard、from/to 動畫）都不動。舊的 ctr()、while 合併迴圈、aside() 全部刪掉。

(4) 依實測決定要不要改。先在模擬器找兩間相距 20-40m 的店，縮到它們合成「2」，點泡泡。放大後還是「2」的話，把 zoom() 裡 `max(0.003, ...)` 的兩個 0.003 改成 0.001。改完再點一次，確認泡泡會拆成兩根圖釘。

模擬器驗證照調查員的 A、B，修正以下幾項：
- A1 只看 w、h，不看 mid，以最後一筆為準。
- A2 刪掉 zip 那一行。
- B6 改成：選一根圖釘，看 Perf 的「地圖」body 次數跟修改前一樣，泡泡沒有跳動。選到的頭和店名牌碰到隔壁泡泡算已知限制，跟現在一樣。
- 新增 B9：點泡泡時，相距 20-40m 的兩間會拆開（見第 4 段）。

### 模擬器先證實原因、再驗修好
A. 先證實原因（在 034e6b5 上加暫時程式碼，驗完拿掉）

1) ClusterBubble 非 small 分支的 `.contentShape(.capsule)` 後面加：
   `.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { print("G9c-bubble n=\(c.ids.count) w=\($0.width) h=\($0.height) mid=\(Int($0.midX)),\(Int($0.midY))") }`

2) recluster 的 :716 `let nextHidden` 後面加：
```swift
#if DEBUG
do {
    let nf = UIFont.systemFont(ofSize: 17, weight: .black), ef = UIFont.systemFont(ofSize: 15)
    var rs: [(Bool, CGRect, CGPoint)] = []
    for (g, c) in zip(groups, next.map { $0 }) where true { _ = c }
    for g in groups {
        guard let m = ctr(g) else { continue }
        let em = Dictionary(grouping: g, by: \.cat.key).sorted { $0.value.count > $1.value.count }.first?.value[0].cat.emoji ?? ""
        let w: CGFloat = max(46, 18 + ceil(("\(g.count)" as NSString).size(withAttributes: [.font: nf]).width) + ceil((em as NSString).size(withAttributes: [.font: ef]).width) + 2)
        rs.append((true, CGRect(x: m.x - w/2, y: m.y - 23, width: w, height: 46), m))
    }
    for p in currentList where !nextHidden.contains(p.id) { if let pt = pts[p.id] { rs.append((false, CGRect(x: pt.x - 22, y: pt.y - 51, width: 44, height: 51), pt)) } }
    let scr = CGRect(x: 0, y: 0, width: Self.mapWidth, height: 900)
    let v = rs.filter { $0.1.intersects(scr) }
    var bb = 0, bp = 0, pp = 0, bbNear = 0
    for x in v.indices { for y in v.indices where y > x && v[x].1.intersects(v[y].1) {
        if v[x].0 && v[y].0 { bb += 1; if hypot(v[x].2.x - v[y].2.x, v[x].2.y - v[y].2.y) < 46 { bbNear += 1 } }
        else if v[x].0 || v[y].0 { bp += 1 } else { pp += 1 }
    } }
    print("G9c-before lngΔ=\(r.span.longitudeDelta) cell=\(cell) groups=\(groups.count) bb=\(bb) bb<46=\(bbNear) bp=\(bp) pp=\(pp) order=\(cells.keys.joined(separator: ";").hashValue) ids=\(next.map(\.id).joined(separator: "|").hashValue)")
}
#endif
```
   （zip 那一行沒有作用，可以刪掉。）

3) 執行方式：在 iPhone 17 / iOS 26.5 上 build 後，用 `xcrun simctl launch --console-pty booted io.github.gop9632.foodmap -perfOverlay` 看 print。用 Anthony 的帳號（t01 上有 19+42+7+16 那些收藏）。Option+拖曳把地圖縮到全台（經度跨度約 3.5），停下來看 log。接著左右各拖約 20pt 停下，重複 5 次，每次縮放都不變。

4) 判讀：
   - 如果 G9c-bubble 的 w 是：一位數 ≥ 50、兩位數約 58-62、三位數約 70，而且 G9c-before 的 bb>0 但 bb<46=0，就證實原因 1（膠囊比 46 寬，圓距門檻不夠）。
   - 如果 bb<46>0，就證實原因 3（合併後中心移動，沒跟前面的組重比）。
   - 如果 bp>0，就證實原因 2（單根圖釘沒有參與）。
   - 如果五次平移中 order 雜湊會變（格子 key 相同，只是順序不同），就證實原因 4。ids 雜湊也跟著變而且有泡泡跳動，代表順序真的影響了結果。
   - 只有 order 變、ids 不變：原因 4 存在，但這次的資料沒觸發。
   - 開行程、有泡泡被推開時看 bb 和 bp，可以看出原因 5。

B. 驗修好（套用修法後，recluster 結尾 `let nextHidden` 後面加 DEBUG print，驗完可以留著或刪掉）
```swift
#if DEBUG
let alive: [Node] = nodes.compactMap { $0 }
var bad = 0
for x in alive.indices { for y in alive.indices where y > x && alive[x].box.intersects(alive[y].box) { bad += 1 } }
print("G9c-after lngΔ=\(r.span.longitudeDelta) seeds=\(seeds.count) items=\(alive.count) bubbles=\(groups.count) fixed=\(fixed.count) overlap=\(bad) ids=\(next.map(\.id).joined(separator: "|").hashValue)")
#endif
```
另外在 `guard let r` 前記 `let t0 = CACurrentMediaTime()`，print 裡加上 `ms=\((CACurrentMediaTime()-t0)*1000)`。

1) 三種縮放，每種停下後截圖：
   - 全台：經度跨度約 3.5，`xcrun simctl io booted screenshot g9c-1-全台.png`
   - 北部（桃園到基隆）：跨度約 1.0，存成 g9c-2-北部.png
   - 台北市（大安、信義一帶，t14 那個範圍）：跨度約 0.15，存成 g9c-3-台北市.png

2) 通過條件：
   - 每張截圖對應的 G9c-after 都是 overlap=0。
   - 截圖放大檢查：任兩顆泡泡之間、泡泡和單根圖釘之間至少有一點空隙，每顆泡泡的數字和 emoji 都完整，沒有被裁掉或縮小（兩位數、三位數要特別看）。
   - ms：debug build 預期在台北市縮放、300 間時 <5ms，全台 <1ms。如果超過 10ms，把 seeds 和 items 的數字回報給我。

3) 平移穩定：每種縮放都左右拖約 30pt 再停，重複 5 次。ids 雜湊都要一樣，畫面上的泡泡不能重新合併或跳動。

4) 點泡泡：在全台點最大的那顆，放大後框住的圖釘數要等於泡泡上的數字。

5) 行程模式：開一個有 3 站以上的行程，縮到看得到全部站，「+N」泡泡不能蓋到站號。log 的 fixed 要大於等於站數，overlap=0。

6) 選一根圖釘再縮到北部：選到的那根和它的店名牌不能被泡泡蓋住。

7) 群組地圖（有小頭像）在台北市縮放重看一次：overlap=0。

8) 回歸測試：落下動畫播完才合泡泡；圖釘飛進和飛出泡泡的動畫照舊；點圖釘時不重算泡泡（Perf 的「地圖」body 次數跟修改前一樣）。

另外，離線模擬（Python 原型，泡泡寬度用估計值，見 reviews/bitemap-b22/g9c-sim.py）：300 間、北部縮放時，舊演算法平均有 2 次泡泡對泡泡、5.65 次泡泡對單根、1 次單根對單根的重疊；新演算法在三種縮放、100 和 300 間的情況下重疊都是 0。這只是模型，不能取代模擬器驗證。

驗證員補的項目：
1) 確認點圖釘不重算：用 `-perfOverlay` 開 Perf，在台北市縮放點一根旁邊有泡泡的單根圖釘，鏡頭停下後「地圖」body 次數只能 +0。照調查員原版（選到的用 1.35 倍框加店名牌）的話，這裡會 +1，泡泡也會跳一下。
2) 點泡泡拆開：找兩間相距 20-40m 的收藏，縮到它們合成「2」，點泡泡，放大後要變成兩根圖釘。如果還是「2」，就套用第 4 段把 zoom 下限改成 0.001。
3) 寬度實測：A1 的 onGeometryChange 印出的最後一筆 w，跟 BubbleBox.width 算出來的值差距要在 2pt 內。一位數、兩位數、三位數各看一次，數字不能被 minimumScaleFactor 縮小。
4) 取消選取再平移一次，泡泡位置不能變。
5) 回歸測試：
   - 抽一間抽到遠處的店，兩段飛行完成，降落後的 recluster 不能讓泡泡蓋住抽中的那根。抽中的是 sel 或 extra，會當成障礙。
   - 首頁清單往下拉、定位、剪貼簿膠囊：這次沒有碰到相關程式碼，每項各操作一次確認行為沒變。
