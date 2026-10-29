# 第 2 輪第 6 批　P3：行程模式

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 11 項：U70 沒權限時按定位鈕沒反應，剛允許時又落入 .userLocation 跟隨模式、U78 最高段點一站，第一下只有輕震和外框，要點第二下才展開、U79 最低段點地圖上的號碼，站卡那排不會捲到那站，之後拉起清單才突然跳、U80 拖站卡換順序時不會自動捲，拖不到畫面外的位置、U81 搜尋時把面板往上拉，搜尋框和結果框疊在清單上、U82 搜尋飯店或空檔推薦開著時，點任何收藏都被固定插在最前面或那兩站中間、U83 「✨ 排順序」和「出發」一樣是實心大按鈕，主次不分、U85 「開新行程」都叫「新行程」，清單裡出現好幾個同名、U117 行程模式點空白處要等 180ms 才收加站卡、U128 出發時的「好吃嗎？」點錯星星就直接改成去過並存檔，沒有復原、U129 「我的行程」第一次打開先閃「還沒有行程」，讀不到時也一直顯示空狀態

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是逐批檢查時找到的：同一批或跨批有兩項以上改到同一段程式、照字面依序套會打架的地方，以及跟 V11、perf-round1b 重疊的地方。這一節的行號是 acd4471 的。
各項內文的寫法跟這裡衝突時照這裡。

### 合1　U82、U28

**位置**：TripPanel.swift:678-686（candAt）、TripPanel.swift:869（add() 裡的 `if mode.slot != nil { mode.clearSearch() }`）

**問題**：第 5 批的 U28 會把 candAt 和 add 搬進 TripMode（變成 TripMode.candAt 和 addCand）。TripPanel 只留一層轉呼叫 `mode.candAt(order, c)`，原本的 add() 整個刪掉。等到第 6 批做 U82 時，它要改的 :666（acd4471 :680）和 :858（acd4471 :869）都已經不在 TripPanel 了。照 U82 (1) 把 slotFits 加在 TripPanel、改 TripPanel 的 candAt，改到的只是那層轉呼叫，它本來就沒有 slot 判斷。真正算位置的 TripMode.candAt 還是只要有 slot 就套，bug 根本沒修到。(2) 要改的那行也已經搬進 addCand，在 TripPanel 裡找不到。U82 的注意完全沒提到 U28。

**合併做法**：

三處都改在 TripMode。slotFits 放在 TripMode 的 candAt 前面，因為已經在 TripMode 裡，`mode.search` 直接寫成 `search`：
```swift
// 空檔推薦、搜尋飯店當起點：只有那次搜尋找到的才固定位置，其他照順路算
func slotFits(_ c: TripCand, _ s: AddSlot) -> Bool {
    switch s {
    case .end: return true
    case .first: return c.hit?.stay == true
    case .between: return search.found.contains { $0.id == c.id } || search.hits.contains { $0.id == c.id }
    }
}
```
TripMode.candAt 的 `if let s = slot {` 改成 `if let s = slot, slotFits(c, s) {`。addCand 的 `if slot != nil { clearSearch() }` 改成 `if let s = slot, slotFits(c, s) { clearSearch() }`。TripPanel 不用加 slotFits，那層轉呼叫也不用動。U82 (3) 改的是 TripTop.swift:296，不受影響。U28 從店家頁加站（`TripCand(place:)` 開的新卡）一樣會經過 slotFits，搜尋飯店開著時從店家頁加餐廳也會照順路算，行為是對的。

### 合2　U83、U36

**位置**：TripPanel.swift:305-307（排順序的 buttonStyle、disabled、opacity）、Theme.swift:13-28（ChunkyStyle）

**問題**：第 4 批的 U36 會先做。它把 ChunkyStyle 整段換掉，停用時會自己 saturation 0.2、opacity 0.5，同時刪掉 :307 的 `.opacity(canSort ? 1 : 0.5)`。這樣一來，U83 寫的「ChunkyStyle 的 fg 是寫死的，.disabled 不會自己變淡」到那時已經不成立。如果照 U83 再傳 `fg: canSort ? 深紫 : Color.ink.opacity(0.35)`，停用時灰字 0.35 還會再乘上 ChunkyStyle 的 0.5 和去飽和，淡紫底在米色背景上也再淡一半，幾乎看不出是一顆按鈕。U83 自己的驗收要求「還看得出是一顆按鈕」，U36 的驗收要求「排順序只淡一次」，兩邊都會過不了。另外 U83 要刪的 :303（acd4471 :307）也已經被 U36 刪掉了。

**合併做法**：

U83 接在 U36 後面做時，fg 不要再依 canSort 切換，停用的樣子交給 ChunkyStyle 處理：
```swift
            .buttonStyle(ChunkyStyle(color: Color.sprPurple.mix(with: .bg, by: 0.85),
                                     edge: Color.sprPurple.mix(with: .bg, by: 0.6),
                                     fg: Color.sprPurple.mix(with: .black, by: 0.2),
                                     radius: 18))
            .disabled(!canSort)
```
:307 不用再刪。U83 的驗收「只有 1 站的那天是淡紫底灰字」改成「整顆淡一次、偏灰，還看得出是按鈕」。如果模擬器上太淡，就讓 ChunkyStyle 多一個參數來調停用時的透明度，不要在呼叫端再疊一層變淡。

### 合3　U78、U19、V11

**位置**：TripPanel.swift:508-517（block() 裡的 StopCard 呼叫）

**問題**：U78 要人把 508-517「整段換成」它的版本，結尾寫的是 `}, hold: AnyGesture(reorder(t, s, k: k).map { _ in () }))`。它的注意只交代了怎麼跟 V11 合（加 guard、改用 rowHold），卻沒提到第 5 批的 U19。U19 在同一個 StopCard 呼叫的 `hold:` 後面接了 `moveUp:`、`moveDown:`，那是 VoiceOver 的往前移、往後移。做第 6 批時這兩個參數已經在程式裡，照 U78 整段貼上會把它們刪掉。StopCard 的這兩個參數預設是 nil，所以照樣編得過、不會報錯，VoiceOver 的動作就這樣默默不見。

**合併做法**：

不要整段貼，只在 tap 閉包裡 V11 那行 guard 的後面插入最高段的那個 if，其他照目前的程式。三項合起來是這樣：
```swift
                StopCard(stop: s, n: i + 1, row: row, open: expanded == s.id, me: store.me, hot: mode.hot == s.id, tap: {
                    // 長按拿起又放開，不算點一下
                    guard drag.id == nil, CACurrentMediaTime() - held.endedAt > 0.4 else { return }
                    // 最高段地圖只露 8pt，飛過去看不到：第一下就展開。地圖照樣對準這站，面板拉低時鏡頭已經在那
                    if mode.level == .high && expanded != s.id {
                        mode.tap(s.id)
                        expandStop(s.id)
                        return
                    }
                    // 第一下：地圖飛到這站；同一站再點一下才展開
                    if mode.hot == s.id {
                        Haptic.light()
                        if expanded == s.id { withAnimation(.snappy) { expanded = nil } } else { expandStop(s.id) }
                    } else {
                        mode.tap(s.id)
                        if expanded != nil { withAnimation(.snappy) { expanded = nil } }
                    }
                }, hold: rowHold(t, s, k: k)
                , moveUp: k > 0 ? { nudge(t, s, by: -1) } : nil,
                moveDown: last ? nil : { nudge(t, s, by: 1) })
```
做完之後重跑 U19 的 VoiceOver 驗收（中段每張站卡都有往前移、往後移）。

### 合4　U70、U61

**位置**：TripPanel.swift:1139-1141（startGo 的 else）、TripPanel.swift:1161（follow() 的 guard）、TripPanel.swift:912（fit() 出發中直接 return）

**問題**：U70 說 startGo 沒有位置時不用設 .userLocation，因為 follow() 拿到第一筆位置就會移鏡頭。可是 follow() 在 :1161 先擋了 `guard !pos.positionedByUser, …`，而 fit() 出發中會在 :912 直接 return。只要出發前使用者拖過地圖（排行程時幾乎一定會拖），positionedByUser 就一直是 true，第一筆位置進來也不會移，鏡頭就停在原地。原本的 .userLocation 會順便把這個旗標清掉，U70 拿掉之後就沒人清了。第 5 批的 U61 把這行改成 `guard !pos.positionedByUser, followBox.centered.map(...) ?? true`，一樣有這個問題。而且 U61 的「跟著我」要等鏡頭動過才會亮，出發後如果使用者沒碰地圖，連按鈕都看不到。U70 的驗收 (4) 只測了「允許定位時出發」，那時 store.here 通常已經有值，走的是上面那個分支，所以測不出來。

**合併做法**：

在 follow() 裡讓第一筆位置不受 positionedByUser 擋。接在 U61 後面的寫法，把 :1161 那行換成：
```swift
                // 出發時還沒有位置（U70 不再設 .userLocation）：第一筆位置一定移過去，出發前拖過地圖也一樣
                let first = followBox.centered == nil
                guard first || !pos.positionedByUser, followBox.centered.map({ $0.distance(from: l) >= 40 }) ?? true else { continue }
```
出發時 centered 就等於 here，只有出發那一刻沒有位置時才會是 nil，所以有位置的情況行為不變。U70 的驗收要補一條：在還沒拿到位置的情況下（剛到設定打開定位、回來馬上出發），先拖一下地圖再按出發，拿到位置時鏡頭要移過去。

### 合5　U70、U18、perf-round1b

**位置**：MapTab.swift:416-419（拿第一筆位置的 .task）、MapPanel.swift:38-42（CamQuiet）

**問題**：第 4 批的 U18 會在同一個 liveUpdates 拿到第一筆位置時呼叫 centerIfEmpty()，新帳號沒有收藏時框 3 公里。U70 又加了 `.onChange(of: store.here)`，wantHere 時用 centerOn 移到街道範圍（1200 公尺）。新帳號第一次按定位鈕、再按允許的時候，兩邊都會跑：centerIfEmpty 先開一個 0.5 秒的動畫，下一輪 onChange 再開 centerOn 的動畫把它蓋掉，鏡頭會先往 3 公里走一下，接著又改去 1200 公尺。之後 store.loading 變 false 時，U18 的 onChange 還可能再呼叫一次 centerIfEmpty。兩項的注意都沒提到對方。至於 CamQuiet，perf-round1b 加 flyStart、leg2，U18 加 touched、centered，U70 加 wantHere，名字都不一樣，照加就好。

**合併做法**：

使用者按了定位鈕就以定位鈕為準。U18 的 centerIfEmpty 的 guard 多擋一個 `!quiet.wantHere`。U70 的 onChange 移完鏡頭後設 `quiet.centered = true`：
```swift
// U18 的 centerIfEmpty 開頭
guard !fitted, !quiet.centered, !quiet.touched, !quiet.wantHere, footY > 0, !store.loading, bounds == nil,
      store.mine.isEmpty, store.mapGroup == nil, let h = store.here else { return }

// U70 的 (4)
.onChange(of: store.here) { _, h in
    guard quiet.wantHere, let h else { return }
    quiet.wantHere = false
    quiet.centered = true      // 已經對準過目前位置，U18 的 centerIfEmpty 不要再拉去 3 公里
    centerOn(h)
}
```
liveUpdates 裡是先寫 store.here、同一輪呼叫 centerIfEmpty，onChange 要等下一輪才跑，所以那時 wantHere 還是 true，centerIfEmpty 會被擋掉，最後只會移一次。

### 合6　U81、U20、U21

**位置**：TripPanel.swift:24、:411-412（sheetDrag 裡設 pullList）、TripPanel.swift:136、:144

**問題**：U81 讓結果框靠 pullList 淡出。它寫的是「pullList 只在最低段往上拉過 40 或往下拉過 20 時改一次」，驗收也寫「在最低段往下拉一點再放手，結果框會短暫淡出又回來，這是預期的」。可是第 5 批的 U20 會先把 sheetDrag 改成 pullChanged，只剩往上拉過 40 才設 pullList，往下拉完全不會動到它。所以做到 U81 時，往下拉結果框不會淡出，模擬器照 U81 的驗收跑會回報不符。程式本身不用改，這樣的行為反而比較好。

**合併做法**：

U81 的程式照寫。驗收那句改成「在最低段往下拉一點再放手，結果框一直在，不會閃」。U21 的 PanelPan 也會呼叫 pullChanged，所以在站卡或排順序那排往上推過 40pt 時，結果框一樣會淡出，驗收可以順便加這一條。

### 合7　U129、U04

**位置**：FoodMapApp.swift:53-56

**問題**：U129 (1) 說要「在 :55 `await store.sync()` 前面加」，但 :55 是 `await LaterDelete.flush(store)?.value`，sync 其實在 :56。如果照行號放在 :55 前面，load_trips 會比補送刪除先跑。重開 App 時 hiddenTrips、hiddenStops 都是空的，還沒送出去的刪除會被伺服器那份讀回來，刪掉的行程或站又冒出來，這正是 :54 那行註解要防的事。

**合併做法**：

放在 :55 和 :56 中間，補送完刪除再開始讀，但還是跟 sync 並行：
```swift
                .task {
                    // 上次刪了、還沒送出就被關掉的：先補送完再同步（不然同步回來那筆又出現）
                    await LaterDelete.flush(store)?.value
                    Task { await TripStore.shared.load() }   // 行程跟收藏同步並行；要等補送完刪除再讀
                    await store.sync()
```
第 1 批的 U04 在 :56 的 sync 後面加 takePendingJoin，跟這裡是同一個 .task 的不同行，可以一起進。

### 合8　U70、U79、U80、U81、U117、U83

**位置**：round2/batch6.md 各項的「注意」

**問題**：有好幾項把別批的項目寫成「同批」。U70 說同批 U71、U72，它們其實在第 7 批。U79 和 U81 說同批 U22，U117 說同批 U55，這兩項都在第 5 批。U80 寫「同一批：U19、U21」，它們也在第 5 批，反倒把真正同批的 U83 寫成「另一批」。照總表的順序，第 5 批會先做完，所以做第 6 批的時候這些項目早就在程式裡了，不是要一起合。U78、U79、U80 引用的 acd4471 TripPanel 行號，也會因為 V11 和第 5 批的 U19、U21、U22、U28、U61 而移位。

**合併做法**：

寫 Swift 的人遇到這幾句「同批」，請理解成「前面那批已經做好了」；實際怎麼合，以這份清單上面幾條為準。TripPanel 的行號一律照修法裡引用的程式碼去搜尋，不要直接跳行號。

### 行號更正（acd4471）

- U129：FoodMapApp.swift:55 寫成 `await store.sync()`，要在它前面加預讀。正確：FoodMapApp.swift:56 才是 `await store.sync()`；:55 是 `await LaterDelete.flush(store)?.value`。預讀要加在 :55 和 :56 中間
- U70：MapPanel.swift:37-41 指 CamQuiet。正確：MapPanel.swift:38-42（:37 是「不是 @Observable」那行註解，:42 是 CamQuiet 的右大括號；perf-round1b 和 U18 寫的 38-42 才對）
- U128：FoodMapApp.swift:132 指訊息條上只呼叫 act.run() 的按鈕。正確：FoodMapApp.swift:133（:132 是 `if let act {`）

## 各項

### U70（P3・錯誤）沒權限時按定位鈕沒反應，剛允許時又落入 .userLocation 跟隨模式

**畫面**：地圖首頁右邊的定位鈕；行程出發時沒有位置

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：loc.location 和 store.here 都是 nil 時 fallback 設 .userLocation，會一直跟著走，直到使用者拖地圖，那段期間很耗電（量過 31% CPU）。拒絕定位的人按了沒反應；面板副標雖然有提示，按鈕本身沒回饋。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MapTab.swift:314-327 的定位鈕：loc.location 和 store.here 都是 nil 時，322-324 行還是設 pos = .userLocation(fallback: pos)，沒權限的人按了沒有任何回饋。TripPanel.swift:1121-1130 的 startGo 也一樣，沒有位置時在 1129 行設 .userLocation。MapTab.swift:389-392 的 .task 會在拿到第一筆位置時寫 store.here 然後停掉，TripPanel.swift:1141-1155 的 follow() 出發後也會在拿到第一筆位置時把鏡頭移過去（centered 一開始是 nil），所以兩邊的 .userLocation 其實都不需要。

**修法**：

(1) 等位置的旗標放在不觀察的 CamQuiet（MapPanel.swift:37-41）裡，按定位鈕不會讓整頁 MapTab 重算：在 CamQuiet 加 `var wantHere = false`。
(2) 把 MapTab.swift:318-321 移鏡頭那三行抽成 `private func centerOn(_ l: CLLocation)`（內容不變）。
(3) MapTab.swift:315-325 的按鈕動作改成：
```swift
Haptic.light()
if let l = loc.location ?? store.here {
    centerOn(l)
} else if loc.authorizationStatus == .denied || loc.authorizationStatus == .restricted {
    store.say("定位沒開，到設定打開才能看你在哪", action: ("去設定", {
        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
    }))
} else {
    if loc.authorizationStatus == .notDetermined { loc.requestWhenInUseAuthorization() }
    quiet.wantHere = true
    store.say("找位置中…")
}
```
不移鏡頭、不再設 .userLocation。
(4) 在 MapTab.swift:389 的 .task 旁邊加：
```swift
.onChange(of: store.here) { _, h in
    guard quiet.wantHere, let h else { return }
    quiet.wantHere = false
    centerOn(h)
}
```
MapTab.swift:73 本來就讀 store.here，這個 onChange 不會多出新的重算。使用者剛去設定打開定位再回來時，389-392 那個 liveUpdates 還在等，拿到位置就會寫 store.here，這裡就會移一次。
(5) TripPanel.swift:1128-1130 的 else 分支改成不移鏡頭，交給 follow() 拿到第一筆位置時移：
```swift
} else if [.denied, .restricted].contains(CLLocationManager().authorizationStatus) {
    store.say("定位沒開，出發後看不到你在哪", action: ("去設定", {
        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
    }))
}
```
其他情況什麼都不做，follow() 會在拿到位置後用 goRegion 移過去。

**模擬器驗收**：(1) 設定裡把 Bitemap 的定位改成「永不」，回地圖按定位鈕：出現「定位沒開，到設定打開才能看你在哪」和「去設定」，地圖不動；按「去設定」會打開 Bitemap 的設定頁。(2) 改回「使用 App 期間」再回來按定位鈕：鏡頭移到你的位置一次，之後在模擬器用 Features > Location > City Run 走動，地圖不跟著動、PerfHUD 的 CPU 不會一直維持在 30% 上下。(3) 重灌 App 第一次打開時拒絕權限，馬上按定位鈕也要出現同樣訊息。(4) 定位「永不」時在行程按「出發」：出現「定位沒開，出發後看不到你在哪」，鏡頭不亂跑；允許定位時出發，鏡頭移到你的位置。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊（那份只改 Map 的 selection setter、blankTap、zoom 和 TripPanel core 的 overlay）。跟同批 U71、U72 都改 MapTab.swift，但在不同函式，可以分開套。

### U78（P3・體驗）最高段點一站，第一下只有輕震和外框，要點第二下才展開

**畫面**：行程模式・面板最高段清單

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：第一下規則是讓地圖飛過去，但最高段地圖只露 8pt，使用者只看到一圈 2.5pt 的彩框。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：TripPanel.swift:508-517 的 StopCard tap 閉包，a45ce70 到 acd4471 都沒動：mode.hot != s.id 時只做 mode.tap(s.id)（TripMode.swift:134-138，輕震、hot、fly += 1），要再點一次才 expandStop。最高段面板高度還是 heights() 的 h - 8（TripPanel.swift:204-208），地圖只露 8pt，第一下飛過去根本看不到。expandStop 在 TripPanel.swift:532-538。

**修法**：

TripPanel.swift:508-517 整段換成下面這樣，只在 tap 閉包最前面多一段最高段的處理，其他照原本：
```swift
                StopCard(stop: s, n: i + 1, row: row, open: expanded == s.id, me: store.me, hot: mode.hot == s.id, tap: {
                    // 最高段地圖只露 8pt，飛過去看不到：第一下就展開。地圖照樣對準這站，面板拉低時鏡頭已經在那
                    if mode.level == .high && expanded != s.id {
                        mode.tap(s.id)
                        expandStop(s.id)
                        return
                    }
                    // 第一下：地圖飛到這站；同一站再點一下才展開
                    if mode.hot == s.id {
                        Haptic.light()
                        if expanded == s.id { withAnimation(.snappy) { expanded = nil } } else { expandStop(s.id) }
                    } else {
                        mode.tap(s.id)
                        if expanded != nil { withAnimation(.snappy) { expanded = nil } }
                    }
                }, hold: AnyGesture(reorder(t, s, k: k).map { _ in () }))
```
用 mode.tap(s.id) 而不是只寫 hot、fly，這樣有輕震，跟其他段一樣。mode.tap 讓 fly 加一，TripPanel.swift:174 會 flyTo 這站，鏡頭在面板後面先對好。expandStop 在最高段不會再改 level（TripPanel.swift:535 有判斷），所以 TripPanel.swift:169-173 的 onChange(of: mode.level) 不會多跑一次框地圖；之後把面板拉回中段，那個 onChange 看到 expanded 有值會 flyTo 這站。已經展開的那站再點一下，會走下面原本的分支收起來。中段、低段維持點兩下。不要改成先降到中間段再飛。

**模擬器驗收**：(1) 行程面板拉到最高段，點一張沒選中的站，確認第一下就展開而且有輕震，清單捲到那站。(2) 再點同一張，確認收起來。(3) 展開 A 站時點 B 站，確認 B 展開、A 收起。(4) 拉回中間段，確認地圖已經對準剛剛展開的那站。(5) 中間段點一張沒選中的站，確認還是第一下飛過去、第二下才展開。(6) 如果 V11 一起進：最高段長按站卡拿起再放開，0.4 秒內不會被當成點一下而展開。

**注意**：跟 fix-v11-acd4471.md 改的是同一段（TripPanel.swift:508-517），要合。V11 在 tap 閉包最前面加 `guard drag.id == nil, CACurrentMediaTime() - held.endedAt > 0.4 else { return }`，並把 `hold:` 改成 `hold: rowHold(t, s, k: k)`。合起來的順序是：V11 那行 guard 放最前面，接著這裡的最高段 if，再來是原本的 hot 判斷，最後 `}, hold: rowHold(t, s, k: k))`。這樣長按拿起放開後不會被當成點一下，也不會在最高段誤展開。跟 perf-round1b.md 沒有重疊。跟同批 U79：expandStop 會設 mode.scrollTo，直的清單在 TripPanel.swift:262-266 吃掉它；mode.tap 讓 hot、fly 變，U79 新版的站卡捲動看的是 hot 和 fly，最高段時站卡那排沒掛著不會動，等面板回到最低段時用 initial 那次捲到這站，兩項一起進沒有衝突。跟 U81：U81 讓搜尋開著時最高段矮一點，這裡只看 mode.level == .high，不受影響。

### U79（P3・體驗）最低段點地圖上的號碼，站卡那排不會捲到那站，之後拉起清單才突然跳（部分已修，下面只寫剩下的）

**畫面**：行程模式・最低段

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：最低段的橫向站卡沒有 ScrollViewReader，第 3 站以後在畫面外。scrollTo 一直留著，拉到中間段時才觸發，0.35 秒後清單自己捲走。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：主要的問題已經被 a45ce70 修好。點地圖上的號碼走 MapTab.swift:680-685 的 tapMark，裡面 trip.tap(id) 會設 hot；最低段站卡那排在 TripPanel.swift:621 包了 ScrollViewReader，TripPanel.swift:632 有 .id(s.id)，TripPanel.swift:650-653 看 mode.hot 變了就在 80ms 後捲到那站置中。直的清單一直掛著（TripPanel.swift:228-270，最低段時 opacity 0），TripPanel.swift:262-266 的 onChange(of: mode.scrollTo) 在最低段就把 scrollTo 吃掉、在看不見的清單裡捲好，所以拉到中間段時清單已經停在那站，不會再突然跳。還沒處理的有兩個小地方：第一，站卡那排是 TripPanel.swift:271-275 的 `if strip` 裡面的，面板升到中段再降回最低段時整排重建，TripPanel.swift:650 的 onChange 沒有 initial，所以會停在第 1 張，不是正在看的那站。第二，同一個號碼再點一次 hot 沒變，onChange 不會跑，使用者先手動把站卡捲走再點同一個號碼，那排不會捲回來。

**修法**：

原本用 cardAt 加 scrollPosition 的修法不用做了，a45ce70 已經改成看 hot 捲，比較簡單，沿用它。只要把 TripPanel.swift:649-653 這段：
```swift
        // 正在看的那站（剛加的、地圖上點的號碼）捲到看得到的地方；等新加的那張排好再捲
        .onChange(of: mode.hot) { _, id in
            guard let id, drag.id == nil else { return }
            Task { try? await Task.sleep(for: .milliseconds(80)); withAnimation(.snappy) { sp.scrollTo(id, anchor: .center) } }
        }
```
換成：
```swift
        // 正在看的那站（剛加的、地圖上點的號碼，同一個號碼再點一次也算）捲到看得到的地方；等新加的那張排好再捲。
        // 站卡那排重新出現（從中段降回最低段）時也直接停在那站，不會回到第 1 張
        .onChange(of: "\(mode.hot ?? "")|\(mode.fly)", initial: true) { old, now in
            guard let id = mode.hot, drag.id == nil else { return }
            let first = old == now   // initial 那次：剛出現，不用動畫
            Task { try? await Task.sleep(for: .milliseconds(80)); withAnimation(first ? nil : .snappy) { sp.scrollTo(id, anchor: .center) } }
        }
```
fly 是 TripMode.tap（TripMode.swift:134-138）每次都加一，同一個號碼再點也會變；add() 只設 hot 不動 fly，兩個合成一個字串，同一輪兩個都變也只跑一次。TripPanel 本來就在 TripPanel.swift:174 讀 mode.fly，多讀一次不會多出重畫。initial 那次延後 80ms 才捲，站卡那排是 0.25 秒淡入（TripPanel.swift:274、284），跳的那一下大多被淡入蓋掉。附帶的行為：在最低段點一張露一半的小卡，那排會把它捲到中間，這個可以接受。scrollTo 一個已經被刪掉的 id 什麼都不會做，不用另外判斷。TripPanel.swift:262-266 不要改，直的清單繼續自己吃 scrollTo。

**模擬器驗收**：(1) 行程面板在最低段，這天有 5 站以上，點地圖上第 5 站的號碼，確認站卡那排捲到第 5 站並置中，那張是選中的樣子。(2) 用手指把站卡那排捲回第 1 張，再點一次第 5 站的號碼，確認又捲回第 5 站。(3) 拉到中間段，確認清單停在第 5 站附近，放手後不會自己再跳。(4) 中間段點第 6 站，再降回最低段，確認站卡那排一出現就停在第 6 站。(5) 最低段開搜尋加一站，確認站卡那排捲到剛加的那站。(6) 長按站卡左右拖換順序，確認拖的時候那排不會被拉走。

**注意**：跟 fix-v11-acd4471.md：V11 第 3 點可能把 MiniStop 的 `.gesture(reorderX(...))`（TripPanel.swift:636）和 reorderX（TripPanel.swift:660-674）換成 RowHold，跟這裡改的 649-653 在同一個 cards() 裡但不同行，可以一起進；換成 RowHold 以後 begin() 一樣會設 drag.id，這裡的 `drag.id == nil` 判斷照樣有效。跟 perf-round1b.md 沒有重疊。跟同批 U22：U22 原本的第 (3) 段就是這個 onChange，已由 a45ce70 做好，U22 不再改它，這裡的新版本照樣讓加完一站捲到新站；U22 把加站後升到中段那行刪掉，站卡那排才看得到捲動，兩項要一起看手感。跟同批 U78：U78 最高段第一下就 mode.tap 加展開，站卡那排沒掛著，等回到最低段時 initial 那次會捲到那站，順序對得上。

### U80（P3・體驗）拖站卡換順序時不會自動捲，拖不到畫面外的位置

**畫面**：行程模式・中間段清單、最低段站卡

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：拿起站卡後清單 scrollDisabled，也沒有拖到邊緣自動捲。把第 1 站移到第 7 站要放下、捲、再拿起好幾次。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：兩個 ScrollView 都還是只有 .scrollDisabled(drag.id != nil)（TripPanel.swift:243 直的，ScrollView 本身在 230；648 橫的，ScrollView 在 622），沒有拖到邊緣自動捲。拖曳位移在 552（直，reorder() 的 onChanged 545-556）和 668（橫，reorderX() 的 onChanged 664-672）只寫 g.translation；換位置靠 RowDrag.target／targetX（1367、1387），用的是拿起時凍結的 mode.geo.rows／cards（521、633 只有 drag.id == nil 才更新，而且量的是 .global）。a45ce70 在 548 加了「正在拉面板時不拿起」，也給 cards() 包了 ScrollViewReader（621）和 hot 自動捲（650-653，拖曳中不跑），都沒有加拖曳中的自動捲。原本自動換算的行號有幾個沒換到（LiftOffset、clearDrag、scrollDisabled、atTop、reorderX 那幾處），下面的修法已經全部改成 acd4471 的。

**修法**：

(1) 拿到底下的 UIScrollView。
直的清單已經掛了 ListPullDown（TripPanel.swift:237，box 是 pull）。PanelLift.swift:35-40 的 PullBox 加一行 `weak var scroll: UIScrollView?`。Coordinator.attach（PanelLift.swift:120）的第一行、在 121 行 `guard scroll !== s` 前面加 `box?.scroll = s`。要放在 guard 前面，因為第一次 attach 可能在 updateUIView（67 行）設 box 之前發生，之後同一個 scroll view 再 attach 會在 guard 就 return，放後面的話 box.scroll 可能永遠是 nil。detach（133-144）在 143 行 `scroll = nil` 前面加 `if let s = scroll, box?.scroll === s { box?.scroll = nil }`。
橫的站卡沒有 ListPullDown，不要拿 ListPullDown(on: false) 湊（它的 pan 回呼會在每次往下拖時記「清單沒接手」）。PanelLift.swift 檔尾加一個只找 UIScrollView 的小 representable，直接用現成的 Finder：
```swift
// 只找外層的 UIScrollView 存進 box（最低段站卡那排拖到邊緣自動捲用）
struct ScrollFinder: UIViewRepresentable {
    let box: PullBox
    func makeUIView(context: Context) -> ListPullDown.Finder {
        let v = ListPullDown.Finder()
        v.isUserInteractionEnabled = false
        v.name = "站卡"
        v.found = { [weak box] s in box?.scroll = s }
        return v
    }
    func updateUIView(_ v: ListPullDown.Finder, context: Context) {}
}
```
TripPanel 加 `@State private var stripBox = PullBox()`，cards() 646 行 `.padding(.horizontal, 14).padding(.vertical, 4)` 後面加 `.background(ScrollFinder(box: stripBox))`。不要用 @State 的 ScrollPosition 每幀推，每幀改它會讓整個面板每幀重算。

(2) 量清單看得到的範圍。RowGeo（TripPanel.swift:1405-1410）加 `var list: CGRect = .zero` 和 `var strip: CGRect = .zero`。243 行 `.scrollDisabled(drag.id != nil)` 後面加 `.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { mode.geo.list = $0 }`；648 行後面同樣加，寫 `mode.geo.strip = $0`。RowGeo 是 TripMode 上 @ObservationIgnored 的 class（TripMode.swift:58），寫進去不會重畫。排順序／出發那排（278）在 ZStack 外面，量到的下緣本來就不含它，不用另外扣。

(3) 站的位置改用清單內容的座標量。234 行 VStack 的右大括號後面、235 行 `.padding` 前面加 `.coordinateSpace(.named("tripRows"))`，521 行改成 `$0.frame(in: .named("tripRows"))`。645 行 HStack 的右大括號後面、646 行 `.padding` 前面加 `.coordinateSpace(.named("tripCards"))`，633 行改成 `$0.frame(in: .named("tripCards"))`。原因是拖曳中不更新位置，自動捲過再放下以後，沒被換到的列不會再觸發 onGeometryChange，mode.geo 會停在捲之前的螢幕位置，馬上拿起下一站就算錯。用內容座標，捲動不會改到位置，RowDrag.target／targetX（1367、1387）都不用動。geo.rows、geo.cards 只有 target／targetX 和 begin 的高度寬度在用（549、666），沒有別處讀。chips（TripTop.swift:230）照舊用 global，overDay（560-568）比的是手指的螢幕位置。

(4) 自動捲本身。1410 行 RowGeo 後面加一個不觀察的小物件：
```swift
// 拖一站到清單邊緣的自動捲：每幀在變，不放進 @State 的 drag（不然整個面板每幀重畫）
@MainActor final class EdgeScroll {
    var scrolled: CGFloat = 0          // 這次拖曳自動捲了多少（直的是 y、橫的是 x）
    var finger: CGPoint = .zero        // 手指的螢幕位置
    var task: Task<Void, Never>?
}
```
TripPanel 加 `@State private var edge = EdgeScroll()`，再加兩個函式：
```swift
    // 拖一站時手指停在清單上下緣（最低段是左右緣）：清單自己捲，越靠邊越快。每 16ms 一步，只改 dragY 和 drag.to
    private func edgeFollow(_ t: Trip, _ p: CGPoint, x: Bool) {
        edge.finger = p
        guard edge.task == nil else { return }
        edge.task = Task { @MainActor in
            while !Task.isCancelled, drag.id != nil {
                edgeStep(t, x: x)
                try? await Task.sleep(for: .milliseconds(16))
            }
        }
    }

    private func edgeStep(_ t: Trip, x: Bool) {
        guard let s = (x ? stripBox : pull).scroll else { return }
        let r = x ? mode.geo.strip : mode.geo.list
        let p = edge.finger, zone: CGFloat = 56
        // 拖出上緣（要去上面的「第 N 天」換天）：不捲
        guard r.height > 0, p.y >= r.minY else { return }
        let at = x ? p.x : p.y, lo = x ? r.minX : r.minY, hi = x ? r.maxX : r.maxY
        let into: CGFloat = at < lo + zone ? -(lo + zone - at) : at > hi - zone ? at - (hi - zone) : 0
        guard into != 0 else { return }
        let step = (into < 0 ? -1 : 1) * (2 + 8 * min(1, abs(into) / zone))
        let base = trips.stops(t.id, day: min(mode.day, t.days))
        if x {
            let a = -s.adjustedContentInset.left
            let b = max(a, s.contentSize.width - s.bounds.width + s.adjustedContentInset.right)
            let nx = min(b, max(a, s.contentOffset.x + step))
            let moved = nx - s.contentOffset.x
            guard moved != 0 else { return }
            s.contentOffset.x = nx
            edge.scrolled += moved
            dragY.y += moved
            let to = drag.targetX(mode.geo, base: base, dx: dragY.y)
            if to != drag.to { drag.to = to; Haptic.tick() }
        } else {
            let a = -s.adjustedContentInset.top
            let b = max(a, s.contentSize.height - s.bounds.height + s.adjustedContentInset.bottom)
            let ny = min(b, max(a, s.contentOffset.y + step))
            let moved = ny - s.contentOffset.y
            guard moved != 0 else { return }
            s.contentOffset.y = ny
            edge.scrolled += moved
            dragY.y += moved
            let to = drag.target(mode.geo, base: base, dy: dragY.y)
            if to != drag.to { drag.to = to; Haptic.tick() }
        }
    }
```
手指在清單下緣以下（拖曳中隱藏的排順序那排上，317 行 opacity 0）算最深，用最快的速度。迴圈只在 clearDrag 裡收掉，迴圈自己不把 task 設回 nil，免得舊迴圈收尾時蓋掉下一次拖曳的 task。

接到拖曳上：reorder() 552 行改成 `dragY.y = g.translation.height + edge.scrolled`，555 行 `overDay(t, g.location)` 後面加 `edgeFollow(t, g.location, x: false)`。reorderX() 668 行改成 `dragY.y = g.translation.width + edge.scrolled`，671 行後面加 `edgeFollow(t, g.location, x: true)`。begin() 573 行改成 `dragY.y = 0; edge.scrolled = 0`。

(5) 被拖那列的位移要是「手指位移加自動捲的量」。被拖那列在捲動內容裡，內容往上捲了 S，那列在螢幕上也跟著上移 S，offset 要是 dy + S 才會留在手指下。上面直接把 scrolled 加進 dragY.y，LiftOffset（523、638）和 target／targetX 吃同一個值，兩邊都對，不用另外算。原修法說「被拖那列的 offset 仍用 dy」是錯的，已經改掉。

(6) clearDrag（579-581）的 580 行改成：
```swift
        drag = RowDrag(); dragY.y = 0; edge.task?.cancel(); edge.task = nil; edge.scrolled = 0; mode.moving = false; mode.geo.gaps = [:]
```

(7) 保留 243、648 的 scrollDisabled。程式改 contentOffset 不受 isScrollEnabled 影響，也不會讓 onScrollPhaseChange 變成 interacting，所以 247-261 的「拉過頭降一段」不會被觸發（它本來也擋了 drag.id == nil 和 listTouch）；ListPullDown 的 pan 在 scrollDisabled 時不會動。推到頂要卡在 -adjustedContentInset.top，不能推成負的，不然 244 行的 atTop 會亂。

(8) scrolled 不要放進 RowDrag（@State drag），放進去每幀都會改 drag，整個面板每幀重畫。

**模擬器驗收**：用 8 站的測試行程，面板在中段。長按第 1 站拿起，拖到清單下緣停住不動，確認清單自己往下捲、越靠邊越快，被拖的那張一直在手指下，捲到能放在第 7 站，放下後順序正確、號碼和地圖路線跟著換。放下後馬上長按另一站往下移一格，確認它是跟正下方那站交換（檢查自動捲後位置沒有用到舊的量測）。再拿起一站拖到清單上緣，確認往上捲，捲到頂就停，面板不會降段、清單不會被推成負的。拖出清單上緣到「第 2 天」膠囊，確認一出清單就停捲、膠囊亮起、放下換天。最低段的橫向站卡拖到右緣，確認站卡那排往右捲，左緣往左捲。拖曳被系統取消（拖到一半按 Home 或來電）之後清單不會繼續自己捲。整段過程看量測浮層的「行程面板」重畫次數（TripPanel.swift:56），只在換位置時加一，不會每幀加。

**注意**：跟 fix-v11-acd4471.md（RowHold）重疊最多，照下面合：(a) v11 把 reorder()（540-558）整個換成 rowHold()，本項對 552、555 的修改改放在 rowHold 的 moved 閉包裡：`dragY.y = d.height + edge.scrolled`，`overDay(t, p)` 後面加 `edgeFollow(t, p, x: false)`。v11 的 ended 叫 drop(t)，drop 會叫 clearDrag，所以被系統取消時自動捲也會停。(b) v11 第 3 點如果把 MiniStop 也換成 RowHold，668、671 的修改同樣搬進那個 moved：`dragY.y = d.width + edge.scrolled`、`edgeFollow(t, p, x: true)`。(c) v11 的 TouchSpy 也改 ListPullDown.Coordinator 的 attach 和 detach：TouchSpy 換掉 126 行的 Perf mark、在 detach 最前面拿掉 spy；本項在 attach 第一行加 `box?.scroll = s`、在 143 行前加清掉 box.scroll，兩邊都加，互不影響。(d) v11 說 RowHold 成立時清單的 pan 會被 UIKit 判失敗，跟本項用程式改 contentOffset 不衝突。跟 perf-round1b.md：附錄 S56 那幾項（block 讀 drag、影子、scaleEffect 順序）還沒做，本項遵守同一個原則，每幀只改 dragY 和不觀察的 edge，drag.to 只在換位置時改，不會把每幀重畫加回來。同一批：U19 改 drop() 的 594-613，本項改 begin() 573 和 clearDrag() 580，行不重疊。U21 也在 PanelLift.swift 檔尾加 PanelPan，並把 271-275 的站卡改成最低段一直掛著，本項的 ScrollFinder 掛在 cards() 裡面，兩邊都可以照加。U83（另一批）會改 actions（298-319），本項不改它，只是量清單下緣時不用扣這排；U83 改樣式時要保留 317 行拖曳中隱藏的 opacity。

### U81（P3・畫面）搜尋時把面板往上拉，搜尋框和結果框疊在清單上

**畫面**：行程模式・🔍 展開時把面板拉到中間或最高段

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：TripFind 和結果框（約 372pt）畫在面板層的 overlay 上。面板拉到最高段時蓋住清單上方，連面板把手都被蓋，拉不回來。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：a45ce70 到 acd4471 只把加站卡那塊包成 ZStack(alignment: .bottom)（TripPanel.swift:106-127），搜尋這塊沒動。TripPanel.swift:128-142 還是把 TripFind 和 TripResults 畫在 overlay(alignment: .top)，結果框的條件在 TripPanel.swift:136 是 `mode.cand == nil && !mode.folded`，沒有看面板段數；TripPanel.swift:144 的 animation value 也一樣。TripPanel.swift:204-208 的 heights() 最高段還是 h - 8，搜尋時把面板拉到最高，面板頂端會跑到 TripFind（TripTop.swift:241，112pt）底下，把手被蓋住。fit() 搜尋那條在 TripPanel.swift:923 用 `mode.folded ? 12 : TripResults.height(mode) + 8` 決定上面要讓多少，也沒看段數。

**修法**：

(1) 面板離開最低段時結果框淡出。TripPanel.swift:136 改成：
```swift
                    if mode.cand == nil && !mode.folded && mode.level == .low && !pullList {
```
TripPanel.swift:144 改成同一個條件：
```swift
        .animation(.snappy(duration: 0.22), value: mode.searchOn && mode.cand == nil && !mode.folded && mode.level == .low && !pullList)
```
不要去讀拉的量 lift.y，在 content 裡讀它會讓整個面板每幀重算。pullList（TripPanel.swift:24）只在最低段往上拉過 40 或往下拉過 20 時改一次（TripPanel.swift:411-412），放手停好時 settleSheet 把它設回 false（TripPanel.swift:458），剛好代表面板開始離開最低段；panel() 在 TripPanel.swift:222 本來就讀它，content 多讀一次不會多出重畫。

(2) 搜尋開著時最高段不要高過搜尋框。TripPanel.swift:204-208 改成：
```swift
    private func heights() -> (low: CGFloat, mid: CGFloat, high: CGFloat) {
        // 最低：把手 20＋站卡 74＋排順序／出發 56。搜尋開著時最高只到搜尋框和分類那排下面，把手才拉得到
        let h = max(size.height, 500)
        let top: CGFloat = mode.searchOn && !mode.going ? TripFind.height + 8 : 8
        return (150, h * 0.5, h - top)
    }
```

(3) 框地圖時不要幫已經淡出的結果框留空白。TripPanel.swift:923 改成：
```swift
            let top = (mode.folded || mode.level != .low) ? 12 : TripResults.height(mode) + 8
```
面板停到中段或最高段時，TripPanel.swift:169-173 會重框地圖，這時結果框已經淡出，不改的話地圖上面會多留兩三百點的空白。

(4) 面板升高時不要 clearSearch，使用者打的字要留著；拉回最低段結果框就回來。這點現在的程式本來就是這樣，不用加東西，只是不要順手加收搜尋。

**模擬器驗收**：行程模式按 🔍 打「咖啡」，結果框出來後把面板從最低段往上拉，拉過一點點結果框就淡出，地圖上的結果圖釘還在。停在中段，確認地圖重框時上面沒有留一大塊空白。再拉到最高段，確認面板頂端在搜尋框和分類那排下面，把手看得到也拉得動。拉回最低段，結果框回來，搜尋框裡的「咖啡」還在。在最低段往下拉一點再放手，結果框會短暫淡出又回來，這是預期的。最後按 ✕ 收搜尋，再把面板拉到最高段，確認最高段回到原本的高度。

**注意**：fix-addcard-ec71aa2.md 已經進了 acd4471（TripPanel.swift:106-127 的 ZStack），這裡改的 136、144 緊接在後面，行號已經對過 acd4471，不用再管。跟 fix-v11-acd4471.md：V11 改 TripPanel.swift:158、241、504、508-517、540-556，跟這裡的 136、144、204-208、923 都不同行，沒有衝突。跟 perf-round1b.md 沒有重疊。跟同批 U22：U22 在 TripPanel.swift:189 的 resultKey onChange 加 folded 判斷、在 155 改 fitKey 的 onChange、加 nudge，這裡改 923 和 heights()，不同行可以一起套；nudge 用 settledHeight()，這裡只改最高段，最低段加站不受影響。heights() 改了以後，TripPanel.swift:116 加站卡開著時面板往下藏的 offset 也跟著用新的 settledHeight，沒有問題。跟同批 U78：U78 只看 mode.level == .high，搜尋時最高段變矮不影響它。

### U82（P3・錯誤）搜尋飯店或空檔推薦開著時，點任何收藏都被固定插在最前面或那兩站中間

**畫面**：行程模式・起點選單「🔍 搜尋飯店…」或空檔推薦之後點地圖圖釘

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：mode.slot 要等加了一站或關掉搜尋才清，cancelCand 也不清。這段時間 candAt() 對任何候選都套 slot，餐廳會被排到住宿前面。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：TripPanel.swift:664-671 的 candAt() 還是只要 mode.slot 有值就一律套 TripInsert.at，不管候選是什麼。slot 只在 clearSearch（TripMode.swift:116-120）和加站後 :858 清，cancelCand（:838-841）不清。TripTop.swift:292-300 換分類 chip 時只改 filter、cand、folded，沒動 slot。所以「搜尋飯店」開著時點地圖上的餐廳，加站卡會寫「加在最前面」（:832）。

**修法**：

（1）TripPanel.swift:664 前面加：
```swift
// 空檔推薦、搜尋飯店當起點：只有那次搜尋找到的才固定位置，其他照順路算
private func slotFits(_ c: TripCand, _ s: AddSlot) -> Bool {
    switch s {
    case .end: return true
    case .first: return c.hit?.stay == true
    case .between: return mode.search.found.contains { $0.id == c.id } || mode.search.hits.contains { $0.id == c.id }
    }
}
```
:666 改成 `if let s = mode.slot, slotFits(c, s) {`。原本寫的「或分類是住宿的收藏」拿掉，收藏都是吃的（TripAdd.swift:25 的註解），沒有住宿分類。
（2）新程式碼要多改一處：add() 的 :858 `if mode.slot != nil { mode.clearSearch() }` 改成 `if let s = mode.slot, slotFits(c, s) { mode.clearSearch() }`。不然搜尋飯店時順手加了一間餐廳，飯店搜尋也會被關掉。
（3）TripTop.swift:296 那行後面加 `if mode.slot == .first, mode.filter != .stay { mode.slot = nil; mode.seg = nil }`（AddSlot 是 Equatable，可以直接比）。原本寫「切到非 .stay 就清 slot」會誤傷空檔推薦：空檔推薦的 slot 是 .between、分類是 🧭 順路，使用者改點 ☕ 咖啡還是想把咖啡店塞進那個空檔，所以 .between 不清，靠 slotFits 只讓結果裡的店套空檔。

**模擬器驗收**：起點選單按「🔍 搜尋飯店…」，不點結果，改點地圖上一根收藏的餐廳，確認加站卡寫的是順路算出來的位置（不是「加在最前面」），加進去以後飯店搜尋還開著。再點一間飯店結果，確認寫「加在最前面」，加完搜尋收起來。搜尋飯店時把分類從 🏨 住宿換成 ☕ 咖啡，點一間咖啡結果，確認不是加在最前面。空檔推薦開著時點結果裡的店，確認寫「插在第 N、N+1 站中間」；改點 ☕ 咖啡再點結果，還是插在那個空檔；點結果以外的收藏圖釘，確認照順路算。

**注意**：跟 fix-addcard-ec71aa2.md 沒有衝突：那份改的是點圖釘時 selection setter 會不會把 cand 清掉，U82 改的是 cand 出來後算插在哪，兩邊互不影響。fix-addcard 的驗收第 1 項（搜尋時點 HitPin 要出卡）和這項可以一起測。跟 U81 都在搜尋流程，但改的檔案位置不重疊。

### U83（P3・畫面）「✨ 排順序」和「出發」一樣是實心大按鈕，主次不分

**畫面**：行程模式・面板最下面一排

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：示意圖 2 的排順序是淡紫次要鈕，實作卻是 sprPurple 實心白字，和橘色出發一樣醒目又緊鄰，容易誤按。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：TripPanel.swift:298-304 的「✨ 排順序」還是 `ChunkyStyle(color: .sprPurple, edge: Color.sprPurple.mix(with: .black, by: 0.25), radius: 18)` 實心紫底白字，停用時 :303 整顆 opacity 0.5；旁邊 :305-310 的出發是預設橘色 ChunkyStyle，兩顆一樣醒目。a1b57b1 到 ec71aa2 只是行號從 :261 移到 :301，樣式沒改。

**修法**：

TripPanel.swift:301 改成：
```swift
.buttonStyle(ChunkyStyle(color: Color.sprPurple.mix(with: .bg, by: 0.85),
                         edge: Color.sprPurple.mix(with: .bg, by: 0.6),
                         fg: canSort ? Color.sprPurple.mix(with: .black, by: 0.2) : Color.ink.opacity(0.35),
                         radius: 18))
```
刪掉 :303 的 `.opacity(canSort ? 1 : 0.5)`。ChunkyStyle（Theme.swift:13-28）的 fg 是寫死的，.disabled 不會自己變淡，所以停用的灰字要像上面一樣用 canSort 判斷傳進去。底色和邊要用不透明的 mix，不要用 opacity，不然底下那層實心影子（Theme.swift:24）會透出來。兩顆維持等寬，出發（:305-310）不動。:313 拖曳中把整排藏起來的 opacity 要留著。

**模擬器驗收**：打開有 3 站以上的測試行程，截面板最下面那排：排順序是淡紫底、深紫字、下面有淡紫邊，出發還是橘色實心。按一下排順序，確認按下去會往下沉、放開彈回。換到只有 1 站的那天，確認排順序是淡紫底灰字、按了沒反應，而且還看得出是一顆按鈕。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟 U80 同一區（actions，:294-315），U80 不改這排，只要 U83 保留 :313 的拖曳隱藏就好。

### U85（P3・體驗）「開新行程」都叫「新行程」，清單裡出現好幾個同名

**畫面**：加到哪個行程？sheet 最下面「開新行程」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：addToNew() 固定用「新行程」、沒日期，多按幾次就有好幾個一模一樣的「新行程・沒排日期・1 站」。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Trip.swift:608-611 的 addToNew() 還是固定 `create(title: "新行程", date: nil, ...)`。TripChooser.swift:58-61 沒日期的行程 meta 還是只寫「沒排日期・N 站」，同名的分不出來。toast 的「復原」已經有了（Trip.swift:635，3dd40e3 還改成停 6 秒），這部分不用動。

**修法**：

（1）Trip.swift:608-611 改成：
```swift
func addToNew(_ p: Place, store: Store) {
    let c = normCity(p.city)
    let base = c.isEmpty ? "新行程" : "\(c)的行程"
    let used = Set(trips.map(\.title))
    var name = base, k = 2
    while used.contains(name) { name = "\(base) \(k)"; k += 1 }
    let t = create(title: name, date: nil, group: nil, store: store)
    add(p, to: t, made: true, store: store)
}
```
不要用 p.area，它會帶「 · 區名」（Models.swift:33）。
（2）toast 不用改：Trip.swift:635 已經有「復原」，也能點開行程，改名留給行程設定。
（3）TripChooser.swift:61 改成沒日期時列前兩站店名：
```swift
if t.start == nil, n > 0 {
    let names = trips.stops(t.id).sorted { ($0.day, $0.pos) < ($1.day, $1.pos) }.prefix(2).map(\.name)
    meta.append(names.joined(separator: "、") + (n > 2 ? " 等 \(n) 站" : ""))
} else {
    meta.append(n == 0 ? "還沒有站" : "\(n) 站")
}
```
trips.stops(_:)（Trip.swift:329）沒排序，所以要自己照天和 pos 排。這行有 lineLimit(1)，店名長會被截在尾巴，可以接受。

**模擬器驗收**：用測試帳號，在同一個城市的兩間測試店各按一次加進行程，選開新行程，確認兩個行程分別叫「台北的行程」和「台北的行程 2」。再打開加到哪個行程，確認這兩個沒日期的行程下面寫的是各自的店名。找一間沒有縣市的店開新行程，確認叫「新行程」。按 toast 的復原，確認行程和站一起不見。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。TripForm 的預設名稱（TripsList.swift:307，沒排日期時也是「新行程」）有同樣的撞名問題，要不要一起改可以順便問；它跟 U84 改的 TripForm 背景是同一個 struct 的不同行，不衝突。

### U117（P3・滑順）行程模式點空白處要等 180ms 才收加站卡（部分已修，下面只寫剩下的）

**畫面**：行程模式點地圖空白處收加站卡（主要）；卡片列停住、點站號捲清單（次要）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：Anthony 的標準是按下那一幀就動。180ms 是為了防誤收，因為 FoodPin 和 HitPin 的 action 不設 pickAt，pickAt 要到 SelWatcher → picked() 才設，所以不能直接縮成兩次 Task.yield。卡片列 250ms 和站號 0.35 秒是次要項。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：acd4471 改了一部分基礎，但點空白還是不會當場收。MapTab.swift:178-181 已經換成 SpatialTapGesture，記下手指位置（pins.touch）再呼叫 blankTap(near:)；MapTab.swift:687-699 的 blankTap 用點下去的時間 t0 判斷（`trip.pickAt < t0 - 0.22`，fix-addcard 的 (c)），zoom() 在 :849 也會設 pickAt；Map selection setter（:88-104）在行程模式略過 nil，收卡只剩 blankTap 這條路。可是 blankTap 一律先睡：手指在圖釘附近（pinNear，:703-713）睡 650ms，其他地方睡 180ms，沒有任何一條路是按下那一幀就收，靠近圖釘時反而比原本更久。pinNear 只拿到 list（:180），沒有算 extraFound（搜尋時被篩選篩掉、補畫出來的收藏）、站號和泡泡。FoodPin（MapTab.swift:1682-1685）和 HitPin（MapTab.swift:152）的 action 只做 pins.tap（:1574 設 tapAt），pickAt 還是要等 SelWatcher 進 picked()（:546）才設。次要的兩項也還在：卡片列停住 250ms 在 MapTab.swift:1191-1196，站號捲清單 0.35 秒在 TripPanel.swift:262-266。

**修法**：

做法是在 acd4471 的 blankTap 前面多一條快路：手指附近完全沒有點得到的東西（收藏、搜尋結果、站號、泡泡），而且這次點擊沒有先按到圖釘按鈕，就當場收；其他情況照 acd4471 現在的 180ms／650ms 走。653c8d1 調好的 650ms 和 pinNear 都不動。
(1) MapTab.swift:178-181 改成（多傳 extraFound，pinNear 和新的判斷都看得到補畫的收藏）：
```swift
                .simultaneousGesture(SpatialTapGesture(coordinateSpace: .global).onEnded { v in
                    pins.touch = (v.location, CACurrentMediaTime())
                    blankTap(at: v.location, hits: hits, list: list + extraFound)
                }, including: trip.on ? .all : .subviews)
```
(2) MapTab.swift:687-699 的 blankTap 換成：
```swift
    // 點地圖空白處：附近什麼都點不到就當場收；靠近圖釘、站號、泡泡時等一下看是不是其實點到了（圖釘的點擊可能晚一點才到）
    private func blankTap(at p: CGPoint, hits: [MapHit], list: [Place]) {
        guard trip.on else { return }
        let t0 = CACurrentMediaTime()
        // 圖釘按鈕的動作可能比這裡先跑：這次點擊已經按到圖釘就不算點空白
        if !tappableNear(p, hits: hits, list: list), pins.tapAt < t0 - 0.22, trip.pickAt < t0 - 0.22 {
            Perf.shared.mark("點空白 當場收")
            trip.blank()
            return
        }
        let near = pinNear(p, hits: hits, list: list)
        Task {
            // 點在圖釘附近：MapKit 的選取要等 0.3 到 0.55 秒（看是不是點兩下）才到，多等一下再判斷，不然會先把卡、搜尋收掉
            try? await Task.sleep(for: .milliseconds(near ? 650 : 180))
            // 點下去前後 0.22 秒內點過圖釘就不算點空白，用點下去當下的時間算
            guard trip.pickAt < t0 - 0.22 else { Perf.shared.mark("點空白略過"); return }
            trip.blank()
        }
    }
```
(3) 在 pinNear（:703-713）後面加新的判斷。原修法寫的「座標 28pt 內」會漏掉圖釘上半部；這裡每種東西用自己的框，而且故意抓寬，靠近東西時多等 180ms 沒關係，誤收卡才是問題：
```swift
    // 行程模式：手指附近有沒有任何點得到的東西。沒有才能當場收
    private func tappableNear(_ p: CGPoint, hits: [MapHit], list: [Place]) -> Bool {
        guard let f = pins.locate else { return true }   // 還不能換算座標：當成靠近，照舊等
        func inBox(_ c: CLLocationCoordinate2D, _ r: CGRect) -> Bool {
            guard let q = f(c) else { return false }
            return r.offsetBy(dx: q.x, dy: q.y).contains(p)
        }
        let pin = CGRect(x: -40, y: -80, width: 80, height: 120)    // 收藏：選中放大時圓頂約在座標上面 70，MapKit 的框到下面 33
        let hitBox = CGRect(x: -68, y: -30, width: 136, height: 84) // 搜尋結果：圓心在座標點，名字在下面最寬 120，選中放大 1.3 倍
        let round = CGRect(x: -40, y: -40, width: 80, height: 80)   // 站號 40（放大 52）、泡泡至少 46
        if list.contains(where: { x in
            guard let la = x.lat, let lo = x.lng else { return false }
            return inBox(.init(latitude: la, longitude: lo), pin)
        }) { return true }
        if hits.contains(where: { inBox($0.coord, hitBox) }) { return true }
        if trip.marks.contains(where: { inBox($0.coord, round) }) { return true }
        return clusters.contains { inBox(.init(latitude: $0.lat, longitude: $0.lng), round) }
    }
```
「新的第 N 站」牌子是 allowsHitTesting(false)，不用算進去。站號和泡泡要算進去，因為它們的按鈕（tapMark、zoom）跟這個手勢誰先跑不一定；如果手勢先跑而且當場收，點站號會連搜尋一起收掉（trip.blank() 在沒有加站卡時會收搜尋，TripMode.swift:123-131）。
次要備註：卡片列可以用自訂 ScrollTargetBehavior 在 updateTarget 提前 focus（MapTab.swift:1191-1196），不過 focus 在 :867 已經擋掉行程模式，這段只影響首頁。TripPanel.swift:265 的 scrollTo 可以只在 level 有改變時才等 0.35 秒，沒換段就直接捲。

**模擬器驗收**：行程模式開著加站卡，中段和最低段各做一輪。1. 點離所有圖釘、站號、泡泡都很遠的空白處 20 次：浮層要出現「點空白 當場收」，卡片在放開那一幀就開始收，不能出現「點空白略過」。2. 點收藏圖釘的圓頂、尖角、淡化圖釘的上緣、選中那根的上緣、HitPin 的圓和名字的左右兩端，各 10 次：不能出現「點空白 當場收」，加站卡不閃、照樣換卡（或同一根不動）。3. 點收藏圖釘正下方 20pt 到 30pt：照 653c8d1 的行為等 650ms，MapKit 晚到的選取能開卡，不能先收卡。4. 點泡泡旁邊 20pt 和站號旁邊 20pt：要走 180ms 那條（不出現「當場收」），點泡泡照樣放大不收卡，點站號照樣收卡飛過去、搜尋不被收掉。5. 搜尋時把篩選設成會篩掉某間收藏，點那根補畫出來的收藏：照樣開卡，不出現「當場收」。6. 沒開加站卡、搜尋開著時點遠處空白：搜尋當場收起、面板回中段。fix-addcard-ec71aa2.md 驗收第 3、5 條（點空白先收卡再收搜尋、點泡泡放大不收卡、點站號收卡飛過去）一起重跑。

**注意**：fix-addcard-ec71aa2.md 的 (b)(c) 已經在 acd4471 裡（setter 略過 nil、t0 判斷、zoom 設 pickAt），原本「要等 fix-addcard 合進去才套」的順序問題已經不存在，這裡的程式是直接疊在 acd4471 上寫的。653c8d1 的 pinNear 和 650ms 原封保留，只多傳 extraFound。跟 fix-v11-acd4471.md（RowHold）沒有重疊，那份只動 TripPanel 的清單手勢。perf-round1b.md 開頭就說不碰 blankTap 和 selection setter，沒有衝突。同一批的 U55 也改 MapTab body，但它改 :138-170 和 :235-243、SelWatcher，跟這裡的 :178-181、:687-713 不重疊；U55 把 HitPin 的 on 參數拿掉，這裡沒有用到 HitPin，不受影響。

### U128（P3・體驗）出發時的「好吃嗎？」點錯星星就直接改成去過並存檔，沒有復原

**畫面**：行程模式 → 出發 → RateCard／DoneCard 的星星

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：點星星就呼叫 rated()：status 改 been、寫入評分、存到伺服器，再跳訊息條，但訊息條沒有復原，這站還被記成問過。這會改到收藏本身的資料。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：TripPanel.swift:1268-1274 的 rated() 跟 a1b57b1 一樣：TripAsked.add、status 改 been、寫評分、Task 存檔、say 只有文字沒有 action，接著把 rate 設 nil。RateCard（TripPanel.swift:1276-1287）和 DoneCard（TripPanel.swift:1085-1086）都走這個 rated()。TripGo.swift:21-30 的 TripAsked 還是只有 has 和 add，沒有 remove。現有的復原寫法在 Trip.swift:540-545（刪一站），會在 closure 裡自己設 store.toast = nil，因為 FoodMapApp.swift:132 的按鈕只呼叫 act.run()，不會自己收訊息條。

**修法**：

(1) TripGo.swift:29 後面（add 之後）補：
```swift
static func remove(_ id: String) {
    var l = UserDefaults.standard.stringArray(forKey: key) ?? []
    l.removeAll { $0 == id }
    UserDefaults.standard.set(l, forKey: key)
}
```
(2) TripPanel.swift:1268-1274 的 rated() 改成：
```swift
private func rated(_ id: String, _ p: Place, _ n: Int) {
    TripAsked.add(id)
    var x = p; x.status = "been"; x.rating = n
    let saving = Task { [x] in await store.save(x) }
    store.say("記下來了：\(p.name) \(n) 顆星", icon: .check, action: ("復原", {
        store.toast = nil
        TripAsked.remove(id)
        // 等第一次存完再存回原樣，兩個 PATCH 才不會順序顛倒、最後又變成去過
        Task { _ = await saving.value; await store.save(p) }
        // 還在出發中才把評分卡叫回來；已經按「好」結束就不要留著，不然下次出發會冒出來
        if mode.going { withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { rate = id } }
    }))
    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { rate = nil }
}
```
跟原本修法的差別有三點，原本的寫法在 ec71aa2 上會出問題：第一，closure 要自己 `store.toast = nil`，不然按了復原訊息條還留著。第二，復原的存檔要等第一次存檔完成，兩個 Task 同時送 PATCH 時伺服器收到的順序不保證，可能最後又寫成去過。第三，rate = id 只在 mode.going 時設；endGo()（TripPanel.swift:1133-1137）會把 rate 清成 nil，如果使用者先按「好」再按復原，無條件設 rate 會讓這張評分卡卡在狀態裡，下次出發一開始就冒出來。DoneCard 不用另外處理：它也呼叫同一個 rated()，而且 DoneCard 的 last 是從 rate 算出來的（TripPanel.swift:1084），rate 設回 id 時星星會自己回到卡片上。仍然不要改成延遲 0.8 秒才存。

**模擬器驗收**：用測試帳號的測試行程（兩站以上，都是自己收藏、狀態是想去的測試店）。A（DoneCard）：出發後每站按「到了」，最後一站出現全部到完的卡片，點 2 星，訊息條出現「復原」，按下去：訊息條收掉、卡片上的星星重新出現、那間店在收藏頁回到想去且沒有評分；等 3 秒後下拉收藏頁同步，確認伺服器那份也是想去。B（RateCard）：第一站按到了、再按第二站的到了，底下跳出第一站的評分卡，點 3 星後按復原，評分卡要重新出現可以改點。C：在 A 點完星星後先按「好」結束出發，再按訊息條的復原：店要回到想去，但再出發一次時不能一開始就冒出評分卡。D：復原後關掉 App 重開，那站還會再問一次（TripAsked 已移除）。

**注意**：跟 fix-addcard-ec71aa2.md 沒有功能上的重疊，但兩邊都改 TripPanel.swift：fix-addcard 的 (a) 改 core 的 overlay，套用後這裡寫的 TripPanel.swift 行號會往下移幾行，請以函式名 rated()、goBottom()、goMods() 找位置。跟 U131 有重疊：U131 要在同一個 DoneCard 的 ZStack（TripPanel.swift:1081-1091）加 isModal 和 escape，escape 要做的事跟「好」一樣（TripAsked.add 加 endGo），兩項一起改時注意保持一致。

### U129（P3・體驗）「我的行程」第一次打開先閃「還沒有行程」，讀不到時也一直顯示空狀態

**畫面**：登出再登入或重裝後，第一次按「行程」→ 我的行程

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：TripsList 只看 all.isEmpty，不看 trips.loaded。登出時 reset() 清掉快取，下次登入要等 load_trips 回來，這段先顯示空狀態。沒有快取又離線時，會一直騙使用者說沒有行程。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：TripsList.swift:28 還是 `if all.isEmpty { empty }`，沒看 trips.loaded。Trip.swift:290 只有 loaded，沒有失敗狀態；Trip.swift:386-388 讀取失敗只 print。Store.swift:425 登出時 TripStore.shared.reset()（Trip.swift:314-318）清掉快取和 loaded。全專案只有在用到時才 load（TripsList.swift:48、MapTab.swift:469、PinMenu.swift:49-50、PlaceDetail.swift:55、:239、TripPanel.swift:61-91），登入後或啟動時沒有預先讀。

**修法**：

(1) 預讀：FoodMapApp.swift:53 的 .task 是掛在 `if store.loggedIn` 裡的主畫面上，每次登入成功和已登入啟動都會跑，所以在 :55 `await store.sync()` 前面加一行 `Task { await TripStore.shared.load() }`，跟同步並行，不要放在 sync 之後等。(2) Trip.swift:290 後面加 `var failed = false`。loadNow() 在 Trip.swift:385 改成 `loaded = true; failed = false`，Trip.swift:386-388 的 catch 加 `failed = true`。Trip.swift:362 的 `guard Supa.session != nil else { return }` 和 :368 的「讀的途中自己又改了」提早 return 都不算失敗，不要設 failed。reset()（Trip.swift:315）一起把 failed 設回 false。(3) TripsList.swift:28 改成三種情況：
```swift
if all.isEmpty {
    if trips.loaded { empty }
    else if trips.failed { offline }   // 「連不上網路，下拉重試」，下拉就是 :49 現有的 refreshable
    else { ForEach(0..<2, id: \.self) { _ in skeleton } }
}
```
skeleton 用跟 TripCard 一樣外框的骨架卡（上面 120pt 的縮圖塊，下面標題和小字兩行），加 `.redacted(reason: .placeholder)` 和 `.allowsHitTesting(false)`；資料到了列表那邊用 `.transition(.opacity)` 換掉。注意 loadNow 的 :368 提早 return 時 loaded 不會變 true，骨架會一直留到下一次 load 成功，send() 存完後本來就會再讀一次，所以通常會自己好；如果模擬器看到骨架卡住，就在 TripsList 的 .task 讀完後判斷一次 `if !trips.loaded { await trips.load(fresh: true) }`。

**模擬器驗收**：A：測試帳號在「我的」登出，再登入，一進地圖馬上按「行程」打開我的行程：要先看到骨架卡，接著換成真的行程卡，全程不能出現「還沒有行程」。B：登入後等 3 秒再打開：因為有預讀，應該直接看到行程，不經過骨架。C：真的沒有行程的測試帳號：骨架之後出現「還沒有行程」。D：登出再登入後，把模擬器的網路關掉（Network Link Conditioner 設 100% Loss）再打開我的行程：要出現「連不上網路，下拉重試」，恢復網路後下拉要載入成功。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟同批其他項目沒有重疊；U128 也改 TripGo／TripPanel，但不碰 TripStore。
