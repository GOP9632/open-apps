# 第 2 輪第 7 批　P3：地圖首頁、抽一間、店家頁

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 16 項：U48 轉盤停下 0.4 秒就切走，揭曉那一刻被剪掉、U71 抽一間跳動的圖釘一半落在面板或搜尋列底下，有震動卻看不到跳、U72 選著一根圖釘時點泡泡，放大後新圖釘全是半透明、U73 卡片列換卡時用寫死的比例判斷要不要平移，圖釘可能停在搜尋列或右側按鈕底下（分支已改，待驗收）、U74 拉過最高或最低段時直接停死，沒有橡皮筋阻力、U75 「N 間還沒有地址」的數字和打開後的清單對不上、U76 地圖首頁的剪貼簿膠囊位置寫死 104，壓到分類 chips 下緣、U77 卡片列和大卡本體上下撥都不會動面板，能拉的只有頂部一行、U88 「▶ 看影片」和分類膠囊沒跟著照片視差移動（有爭議，低優先）、U89 Google 地圖來源的店，照片上也寫「看貼文」、U90 小地圖點了會開 Google 地圖，但看不出來，也沒有按鈕語意、U102 抽一間設定的「怎麼抽」放在最下面，半高時看不到、U132 按「抽！」時面板還在往下收，前幾根跳動的圖釘被面板壓暗或擋住、U134 「分享」要等 1200px 大圖下載完才跳選單，網路慢時按了沒反應、U136 K4：訊息條蓋到「N 間還沒有地址」膠囊、U137 K5：自己畫的藍點拖地圖時可能和地圖錯開

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是逐批檢查時找到的：同一批或跨批有兩項以上改到同一段程式、照字面依序套會打架的地方，以及跟 V11、perf-round1b 重疊的地方。這一節的行號是 acd4471 的。
各項內文的寫法跟這裡衝突時照這裡。

### 合1　U75、U76、U136

**位置**：MapTab.swift:300（missing）、:317-324（「N 間還沒有地址」那顆 Button）、:972-983（NearbyHost）；FoodMapApp.swift:118；Onboard.swift:183

**問題**：三項改的是同一顆按鈕，處理的也是同一個重疊（剪貼簿膠囊蓋住地址膠囊），卻給了三種互相矛盾的答案。U75 的注意說要不要讓剪貼簿膠囊往上讓由 Anthony 決定；U76 的修法是剪貼簿膠囊出現時把地址膠囊淡掉、不能點；U136 的修法是讓訊息條和剪貼簿膠囊一起往上讓，而且明寫「用讓開，不要淡掉」。如果照寫法依序全套，U136 會把剪貼簿膠囊推到地址膠囊上方，U76 的 modifier 又同時把地址膠囊淡成 0。opacity 不會改變大小，所以 U136 的 onGeometryChange 照樣量到 36pt，結果是剪貼簿膠囊浮在一塊空白上面，下面那顆看不到也點不到。另外 U75 在 Button 的 action 裡用 MapTab body 的區域變數 noAddrList，可是 NearbyHost 是 .equatable()，只加 missing 這個 Int 去比的話，數量一樣、內容不一樣（例如換分類 chip 剛好同樣 3 間）時閉包不會重跑，按下去拿到的是舊的那份 id。

**合併做法**：

照 U136 做，U76 的修法（ClipWatch 淡出 modifier）整段不要做，U76 只留它的模擬器驗收 (1) 到 (4)，(5) 改成「剪貼簿膠囊顯示時在地址膠囊上方，地址膠囊點得到」。U75 注意裡「由 Anthony 決定」那句作廢，U136 的注意已經寫了要讓 Anthony 知道。順序是 U75 先改 missing、Button 和 NearbyHost，再套 U136。NearbyHost 比 id 陣列，不要只比數量。合併後的寫法：
```swift
// MapTab body，:66 下面（U75）
let noAddrList = all.filter { ($0.lat == nil || $0.lng == nil) && (store.mapGroup == nil || store.isMine($0)) }
// :299 建 NearbyHost 時多傳 missing: noAddrList.map(\.id)
// NearbyHost 加 let missing: [String]，== 加 && a.missing == b.missing（id 一變閉包就重跑，閉包裡讀 noAddrList 才不會是舊的）
if !noAddrList.isEmpty {
    Button { noAddrIds = noAddrList.map(\.id); noAddr = true } label: {
        Label("\(noAddrList.count) 間還沒有地址", systemImage: "mappin.slash")
            // 樣式照舊
    }
    .buttonStyle(PressStyle())
    // U136：量這顆的高度，訊息條、剪貼簿膠囊疊到它上面
    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if abs(store.panelChipH - h) > 0.5 { store.panelChipH = h } }
    .onDisappear { store.panelChipH = 0 }
}
```
FoodMapApp.swift:118 和 Onboard.swift:183 照 U136 把 onMap 分支換成 store.mapFloatPad。第 5 批 U23 會先把 :118 改寫成多一個 onGo 分支，到時只換 onMap 那一段。

### 合2　U75、U100（batch8）、U84（batch10）

**位置**：MapTab.swift:1902-1928（NoAddressSheet，:1908 是 let list）

**問題**：U75 第 (4) 點把 :1908 的 let list 改成 ids.compactMap，再在 sheet 上加 onChange(of: editing == nil && list.isEmpty) 讓補完就自己關。第 8 批 U100 第 (3) 點會把 NoAddressSheet 的 NavigationStack 內容整段換掉，給的新程式碼裡沒有這個 onChange，還寫「:1907 的 let list = ... 不動」。第 7 批先做，照 U100 的片段整段貼上的話，U75 的自動關閉會被刪掉；如果有人把 let list 照 a1b57b1 的樣子還原，數字和清單又會對不上。U75 的注意只寫了樣式要一起排，沒提這兩點。

**合併做法**：

做 U100 時保留 U75 已經改好的 `let list = ids.compactMap { store.place($0) }.filter { $0.lat == nil || $0.lng == nil }` 和 `let ids: [String]`，onChange 掛在 U100 新內容最外層、`.sheet(item: $editing)` 後面：
```swift
    .sheet(item: $editing) { EditSheet(place: $0) }
    // U75：補完最後一間、編輯視窗也關了才自己收
    .onChange(of: editing == nil && list.isEmpty) { _, done in if done { dismiss() } }
}
```
第 10 批 U84 說 NoAddressSheet「照 U75 的修法」，實際的樣式程式在 U100，三項合起來就是上面這版。

### 合3　U71、perf-round1b

**位置**：MapTab.swift:457（guard let win）、:462-463（shown、hoppers）

**問題**：perf-round1b 2.3 的量測 build 會先把 :457 換成看 -drawWin 的 win，把 :463 換成 canHop 加「有 -drawWin 時固定取照 id 排的前 7 根」。U71 第 (2) 點要把 :462-463 整段換掉，自己的程式裡沒有 wins，也把 shown 收進只在不到 3 根時才算的補位分支。照總表順序先做量測 build 再做 U71，U71 一套上去就把 -drawWin 的固定跳釘刪掉，之後再用 -drawWin 量抽一間，A/B 兩邊跳的圖釘不一樣，E3 的比較就不成立。U71 的注意只寫了跟 fix-addcard 和 U72 的關係，沒提 perf-round1b。

**合併做法**：

U71 在量測 build 之後做，第 (2) 點用下面這版取代原本兩行，perf 加的 wins 留著用（:457 那段 perf 的寫法不動）：
```swift
let usable = pool.filter { $0.id != win.id && $0.id != pins.sel && !hidden.contains($0.id) }
let seen = usable.filter(onScreen)
// 量測用 -drawWin：跳的固定成看得到的前 7 根（照 id 排），A/B 兩邊一樣；平常照舊隨機 6 到 8 根
var hoppers = wins.isEmpty ? Array(seen.shuffled().prefix(Int.random(in: 6...8))) : Array(seen.sorted { $0.id < $1.id }.prefix(7))
if hoppers.count < 3 {
    let have = Set(hoppers.map(\.id))
    let shown = shownRegion.map { r in usable.filter { p in
        guard let la = p.lat, let lo = p.lng else { return false }
        return abs(la - r.center.latitude) <= r.span.latitudeDelta / 2 && abs(lo - r.center.longitude) <= r.span.longitudeDelta / 2
    } } ?? usable
    let more = shown.filter { !have.contains($0.id) }
    hoppers += wins.isEmpty ? Array(more.shuffled().prefix(6 - hoppers.count)) : Array(more.sorted { $0.id < $1.id }.prefix(6 - hoppers.count))
}
```
bottom 和 onScreen 照 U71 原文放在這段前面。量測紀錄要註明 U71 前後跳的是不同一組圖釘，前後的數字不能直接比。

### 合4　U132、U71、U102

**位置**：MapTab.swift:428-484（draw()，:301 把 draw 傳給 NearbySheet）；Draw.swift:251 起（DrawPanel，:271、:310-314、:351-354）

**問題**：U132 的注意寫「同一批其他項目也沒有碰 draw() 或 DrawPanel」，這句不對：U71 改 draw() 的 :429 和 :462-463，U102 改 DrawPanel 的 :271 到 :314 和 :371。U132 選 (a) 的話，它在 hoppers 後面插 order、把 :471 的 for p in hoppers 改成 for p in order，跟 U71 說的「跳動迴圈不用改，for p in hoppers 照舊」改到同一行。另外 (a) 把簽名改成 draw(fromPanel: Bool = false)，:301 的 `draw: draw` 會變成 (Bool) -> Void 的函式參考，預設參數不會讓它變回 () -> Void，編不過。U102 先刪 5 行、插 1 行，U132 引用的「抽！」按鈕會從 :351-354 往上移 4 行。

**合併做法**：

先做 U71，再做 U132。U132 照它自己的建議先做 (b)，(b) 只改 sheet 的 onDismiss 和 go，不碰 draw() 本體，跟 U71 不打架。之後如果換成 (a)：order 插在 U71 那段 hoppers 算完之後，迴圈改 for p in order；U71 已經只挑螢幕上看得到的，(a) 裡的 p.lat! 不會遇到 nil。簽名不要直接改，改成包一層：
```swift
private func draw() { draw(fromPanel: false) }
private func draw(fromPanel: Bool) { ... 原本的內容 ... }
```
:386 的 go 用 `{ draw(fromPanel: true) }`。U102 和 U132 的「抽！」按鈕用程式片段找位置，不要照行號。

### 合5　U132、perf-round1b

**位置**：Draw.swift:351-354（「抽！」按鈕）

**問題**：perf-round1b 2.3 要在 Draw.swift:353 的 go() 前面加 Perf.shared.mark("抽一間：面板")，U132 第 3 點要在同一個按鈕閉包的 dismiss() 前面加 Haptic.light()，改的是同一個閉包。更大的問題是 perf-round1b 的 E4 寫「不管結果都不延後 draw」，而且 E4 要量的就是「收 sheet 和 draw 擠在同一幀」；U132 (b) 正好是等面板收完才 draw。U132 的注意完全沒提 perf-round1b，總表第 4 節也沒把這個矛盾講出來。如果先做 U132 再跑 E4，面板那次跟 🎲 那次就分不出差別，E4 量不到東西。

**合併做法**：

E4 一定要在 U132 之前、用量測 build 跑完。perf-round1b 說的「不延後」是指不要為了效能延後，U132 (b) 是體驗上的取捨，照 U132 讓 Anthony 看錄影決定，兩邊不用互相擋。合併後的按鈕：
```swift
Button {
    Haptic.light()                        // U132：手指離開那一刻有回饋
    dismiss()
    Perf.shared.mark("抽一間：面板")       // perf-round1b：記按下的時間
    go()                                  // U132 (b)：只設 pendingDraw，面板收完 onDismiss 才 draw()
} label: { ... }
```
做了 (b) 之後，「抽一間：面板」到「抽一間（開始）」中間會多出收面板的那段時間，這是預期的，不是變慢。

### 合6　U71、U73

**位置**：MapTab.swift:866-881（focus()，:873-874）；MapTab.swift:462-463（U71 的 onScreen）

**問題**：U71 說抽一間的跳釘要「跟 focus() 同一套」判斷看不看得到，但 U73 會在 focus() 多排除右下行程、定位那排按鈕後面的範圍，U71 的 onScreen 沒有這段，左右邊界也是 24 而不是 30。兩項都做完以後，卡片列換卡會避開按鈕，抽一間跳的圖釘卻還是可能落在定位按鈕後面，跳了看不到，正是 U71 要修的問題。

**合併做法**：

兩項一起做時抽成一個共用的判斷，focus() 和 draw() 都呼叫它：
```swift
// 圖釘尖端在不在看得到的那塊：搜尋列下面、面板上面、左右沒出界，也不在右下行程、定位那排後面
private func pinVisible(_ pt: CGPoint, bottom: CGFloat) -> Bool {
    let underButtons = pt.x > Self.mapWidth - 80 && pt.y > bottom - 130
    return pt.y > headY + 50 && pt.y < bottom - 20 && pt.x > 30 && pt.x < Self.mapWidth - 30 && !underButtons
}
```
focus() 的 guard 改成 `guard !pinVisible(pt, bottom: bottom) else { return }`；U71 的 onScreen 裡最後那行改成 `return pinVisible(pt, bottom: bottom)`。

### 合7　U77、U14（batch2）

**位置**：MapTab.swift:1402 起（PickedCard，:1418 DrawHistory、:1433 .modifier(grip)、:1473 .candy(22)）、:1164（PickedCard 呼叫）

**問題**：第 2 批 U14 (b) 會先把 :1418 的 DrawHistory 搬到 :1433 `.modifier(grip)` 後面，padding 改成 .bottom，還特別說不要在橫捲的 DrawHistory 上加 grip。U77 第 (2) 點要在「MapTab.swift:1338（ec71aa2）的 DrawHistory」掛同時手勢，那一行在 U14 之後已經不在那裡。U77 的注意沒提 U14。另外 U77 寫的 `var bodyPull: AnyGesture<Void>?` 加 `.simultaneousGesture(bodyPull)` 編不過：simultaneousGesture 不收 Optional，cardPull 的值型別是 DragGesture.Value，也不能直接包成 AnyGesture<Void>。

**合併做法**：

U14 先做，U77 掛在 DrawHistory 搬過去的新位置。U77 加的是有方向鎖的同時手勢，不是排他的 grip，跟 U14 擔心的「橫捲和往下拉搶手勢」不衝突。PickedCard 只有 :1164 一個呼叫的地方，bodyPull 直接用非 Optional：
```swift
// PickedCard，放在 let close 前面
var bodyPull: AnyGesture<DragGesture.Value>
...
.modifier(grip)
// U14 搬下來的「抽過」那排；U77：上下撥也能拉面板
if draw != nil { DrawHistory(tap: pickHistory).padding(.bottom, -2).simultaneousGesture(bodyPull) }
...
.candy(22)
.simultaneousGesture(bodyPull)
```
NearbySheet 在 :1164 多傳 `bodyPull: AnyGesture(cardPull)`（參數要放在 grip 後面、尾隨的 close 前面）。

### 合8　U88、U89、U02（batch1）、U123（batch10）

**位置**：PlaceDetail.swift:93-120（照片和兩顆膠囊）；Reel.swift:20-35（喇叭）

**問題**：U88 最後建議「把分類膠囊改到 .topTrailing，或在 player 存在時往上讓 44pt」，處理的是喇叭和分類膠囊疊在右下。這件事第 1 批 U02（P1，最先做）已經處理了，做法是分類膠囊留在右下、把喇叭搬到它正上方（Reel.swift:35 改成 trailing 11、bottom 48），還明講不要搬到右上，因為往上捲時右上會鑽到「更多」鈕和 TopShade 底下。U02 做完再照 U88 的建議做：搬到右上會被「更多」蓋住；往上讓 44pt 的話分類膠囊會佔到底部往上 58 到 88pt，剛好撞到 U02 擺好的喇叭（48 到 86pt）。U88、U89 的注意都沒提 U02。另外第 10 批 U123 (5) 要改「PlaceDetail.swift:115 的 .foregroundStyle(.white)」，U88 做完那行會搬進新的 catChip(place)，行號就對不到了。

**合併做法**：

U88 照搬膠囊進 Stretchy 的部分做，最後那段「改到 .topTrailing 或往上讓 44pt」的建議拿掉，catChip 維持 .bottomTrailing、padding(14)、allowsHitTesting(false)，跟 U02 的假設一致。膠囊和喇叭都在 Stretchy 裡，會一起縮放和位移，U02 的對齊照樣成立。U88 的模擬器驗收「靜音鈕沒有被分類膠囊擋住」保留，當作 U02 的回歸測試。U89 照原本說的，在 U88 搬好的 sourceChip 裡改。做 U123 (5) 時，到 catChip(place) 裡找 `.foregroundStyle(.white)` 改成 place.cat.fg。

### 合9　U137、U54（batch4）

**位置**：MapTab.swift:2050-2074（MyDot）、:2076-2088（MyDotLayer）

**問題**：第 4 批 U54 會在 MyDot 後面（acd4471 的 :2074 之後）插一個 DotTracker，剛好夾在 MyDot 和 MyDotLayer 中間。第 4 批比第 7 批先做，到 U137 第 3 點寫「MyDotLayer（:2076-2088）整個刪掉」的時候，那個行號範圍蓋到的是 U54 的 DotTracker。照行號刪會把藍點追蹤一起刪掉，U54 修好的換分頁重算也會跟著退回去。U137 的注意沒提 U54。

**合併做法**：

U137 第 3 點照名字刪 `private struct MyDotLayer` 整個 struct，不要照行號刪；DotTracker 留著，它呼叫的 MyDot.shared.track() 也留著（U137 只刪 track() 裡的 refresh()）。U137 代價 (丙) 說 Map content 讀 dot.coord 會讓 MapTab 每走 10 公尺重算一次，量 PerfHUD 時要在 U54 已經進去的版本上比，不要拿 acd4471 當基準，不然換分頁省下來的次數會把走路多出來的次數蓋掉。

### 行號更正（acd4471）

- U136：「MapTab.swift:298 的 .buttonStyle(PressStyle()) 後面加量高度」（標 ec71aa2）。ec71aa2 的 298 是收掉 `if missing > 0 {` 的右括號，照行號接 modifier 會接在 if 後面，編不過。正確：ec71aa2 MapTab.swift:297，換算成 acd4471 是 MapTab.swift:324（.buttonStyle(PressStyle())）
- U74：「ceiling = headY + 8（MapTab.swift:271）」（標 ec71aa2），ec71aa2 的 271 是 NearbyHost 上面的註解。正確：ec71aa2 MapTab.swift:275，換算成 acd4471 是 MapTab.swift:302（ceiling: headY + 8, top: AnyView(）
- U75：「MapTab.swift:271 建 NearbyHost 時傳 missing」和「NearbyHost（MapTab.swift:893）加 let missing」「MapTab.swift:903-905 只比 total、headY、mapRect、list」（標 ec71aa2）。正確：建 NearbyHost 在 ec71aa2 :272，換算成 acd4471 是 MapTab.swift:299；struct NearbyHost 在 ec71aa2 :892，acd4471 是 MapTab.swift:972；== 在 ec71aa2 :901-903，acd4471 是 MapTab.swift:981-983
- U76：「外面又包了 .equatable()（MapTab.swift:336）」（標 ec71aa2）。正確：ec71aa2 MapTab.swift:335，換算成 acd4471 是 MapTab.swift:362
- U77：「最高段沒店時的空白（1157）」掛著 grip、「ListPullDown 只處理最高段直的清單（MapTab.swift:1153）」（標 ec71aa2）。正確：沒店時空白的 .modifier(grip) 在 ec71aa2 :1138，acd4471 是 MapTab.swift:1218；ListPullDown 在 ec71aa2 :1148，acd4471 是 MapTab.swift:1228

## 各項

### U48（P3・體驗）轉盤停下 0.4 秒就切走，揭曉那一刻被剪掉

**畫面**：抽一間 → 轉盤停下來

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：轉 2.5 秒才停，finish() 只等 400ms 就 pick。糖粒、格子放大、店名大多沒播完就消失。地圖之後會接 PickedCard，收藏頁會推進店家頁，所以結果不是看不到，是揭曉太趕。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Draw.swift:759-768 的 finish() 還是只等 400ms 就 pick(p)，從 a1b57b1 到 ec71aa2 沒改。另外這個等待用的 Task 沒有存起來，656 的 onDisappear 只取消 run。等待中如果點遮罩（DrawStage 在 Draw.swift:394-395 呼叫 close()），轉盤關掉了，Task 還是會 pick(p)：收藏頁照樣推進店家頁（ListTab.swift:104-107），地圖照樣 choose(p)（MapTab.swift:348-351）。等待拉長到 1.1 秒後，這個空檔會更大。651-653 本來就會在 won 有值時把下面的字換成店名（17 heavy、contentTransition(.opacity)），636 的中間按鈕也已經換成 🎉。

**修法**：

1. DrawWheel 加 `@State private var leaving: Task<Void, Never>?` 和 `@State private var gone = false`。

2. finish()（759-768）改成：
```swift
private func finish() {
    let p = places[index]
    won = p.id
    Haptic.success()
    if !reduce { burst += 1 }
    // 讓糖粒、格子放大和店名播完再走；急的人點中間或點旁邊可以提前
    leaving = Task { @MainActor in
        try? await Task.sleep(for: .milliseconds(reduce ? 400 : 1150))
        if !Task.isCancelled { go(p) }
    }
}
// 只走一次：倒數到了、點中間、點旁邊，誰先到都一樣
private func go(_ p: Place) {
    guard !gone else { return }
    gone = true
    leaving?.cancel()
    pick(p)
}
private func goNow() { if let w = won, let p = places.first(where: { $0.id == w }) { go(p) } }
```
3. 656 的 onDisappear 改成 `{ run?.cancel(); leaving?.cancel() }`。原修法沒提到這點，但 ec71aa2 的等待 Task 關掉後還會 pick，等待拉長之後一定要補。

4. 635 的中間按鈕改成 `Button { won == nil ? spinRandom() : goNow() }`，641 的 accessibilityLabel 跟著換成 `won == nil ? "轉轉盤" : "去這間"`。

5. 點遮罩提前前進：遮罩在 DrawStage（394-395），只會 close()。做法是在 DrawWheel 最外層包一層 ZStack，揭曉後才鋪一層透明的點擊區，蓋在 DrawStage 的遮罩上面：
```swift
ZStack {
    if won != nil {
        Color.clear.contentShape(.rect).ignoresSafeArea().onTapGesture { goNow() }
    }
    VStack(spacing: 18) { ... 原本 628-654 ... }
}
```
揭曉前沒有這一層，點遮罩照舊是關掉、不選。

6. 下面的字（651-653）換成：
```swift
Group {
    if let w = won, let name = places.first(where: { $0.id == w })?.name {
        Text("🎉 " + name).font(.system(size: 22, weight: .heavy))
            .lineLimit(1).minimumScaleFactor(0.7)
            .transition(.scale(scale: 0.6).combined(with: .opacity))
    } else {
        Text("拖著轉，或點中間").font(.system(size: 17, weight: .heavy)).transition(.opacity)
    }
}
.foregroundStyle(.white)
.animation(.spring(response: 0.35, dampingFraction: 0.6), value: won)
```
「再轉一次」要先問 Anthony，這次不做。

**模擬器驗收**：在收藏頁按 🎲 抽一間，選轉盤，點中間轉一次：停下後店名帶 🎉 放大淡入，糖粒播完（約 1.1 秒）才推進店家頁。再轉一次，停下後馬上點中間，要立刻前進。再轉一次，停下後馬上點轉盤外面的暗處，也要立刻前進，而且只推一次店家頁（返回後堆疊裡沒有第二頁）。轉的途中點暗處：轉盤關掉、不推店家頁，等 2 秒也不會冒出來。地圖頁同樣測一次，停下後要接 PickedCard。打開「減少動態效果」時，等待仍是 0.4 秒。

**注意**：跟 U46、U47 改的是同一個 DrawWheel。U46 的 start() 收尾時呼叫 finish()；656 的 onDisappear 要同時取消 run（U46）和 leaving（U48）。U46 第 4 點在 spinRandom 加的 `spin == nil` guard，跟這裡第 4 點的按鈕分流不衝突。跟 fix-addcard-ec71aa2.md 無關。

### U71（P3・體驗）抽一間跳動的圖釘一半落在面板或搜尋列底下，有震動卻看不到跳

**畫面**：地圖首頁：🎲 抽一間（一間模式）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：hoppers 從整張全螢幕的 shownRegion 挑，上方被搜尋列蓋、下方被面板蓋。面板在最高段時按 🎲 不會降，幾乎全看不到。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MapTab.swift:401-457 的 draw() 還是先呼叫 MapPanel.shared.atLeastMid()（402 行，最高段時什麼都不做），跳動的圖釘在 MapTab.swift:435-436 從整張全螢幕的 shownRegion 挑，沒有扣掉上面的搜尋列和下面的面板。原本修法說的 seen() 已經不在 MapTab 裡了（可見範圍改由 MapTab.swift:910-918 的 NearbyHost.visible 算），所以原本「seen() 加 bottom 參數」那一步要改寫。現在 MapTab 已經有 pins.locate（MapTab.swift:202，座標換螢幕位置），focus()（MapTab.swift:787-794）就是用它判斷圖釘有沒有在搜尋列和面板之間，抽一間可以用同一套。

**修法**：

(1) MapTab.swift:402 換成：
```swift
let mp = MapPanel.shared
let was = mp.stage
// 最高段時清單蓋住整張地圖，先降到中段，跳的圖釘才看得到
if was == .high { mp.go(.mid) } else { mp.atLeastMid() }
```
(2) MapTab.swift:435-436 換成用螢幕位置挑（跟 focus() 同一套）：
```swift
// 跳的圖釘要落在搜尋列和面板之間：原本在中段用停好的上緣（含大卡），原本在最低段或最高段的會停到中段，用算好的中段上緣
let bottom = was == .mid && mp.top > headY + 50 ? mp.top : (mp.midTop > headY + 50 ? mp.midTop : footY)
func onScreen(_ p: Place) -> Bool {
    guard let la = p.lat, let lo = p.lng, let pt = pins.locate?(.init(latitude: la, longitude: lo)) else { return false }
    return pt.y > headY + 50 && pt.y < bottom - 10 && pt.x > 24 && pt.x < Self.mapWidth - 24
}
let usable = pool.filter { $0.id != win.id && $0.id != pins.sel && !hidden.contains($0.id) }
var hoppers = Array(usable.filter(onScreen).shuffled().prefix(Int.random(in: 6...8)))
// 看得到的不到 3 根：用整個畫面範圍補到 6 根（總比不跳好）
if hoppers.count < 3 {
    let have = Set(hoppers.map(\.id))
    let shown = shownRegion.map { r in usable.filter { p in
        guard let la = p.lat, let lo = p.lng else { return false }
        return abs(la - r.center.latitude) <= r.span.latitudeDelta / 2 && abs(lo - r.center.longitude) <= r.span.longitudeDelta / 2
    } } ?? usable
    hoppers += shown.filter { !have.contains($0.id) }.shuffled().prefix(6 - hoppers.count)
}
```
下面 437 行開始的 guard 和跳動迴圈不用改（for p in hoppers 照舊）。這裡順便把原本 435 行的 $0.lat! 強制解包換成安全寫法。
(3) 抽獎池 drawCtx()（MapTab.swift:502-512）先不動。

**模擬器驗收**：在首頁中間段、最低段、最高段各按一次 🎲（一間模式，關掉減少動態），錄影確認：跳動的圖釘全部落在搜尋列下面、面板上面；最高段按下時面板先降到中段再開始跳；最後選中的那根出大卡。另外把地圖拉到只剩兩三根圖釘看得到的範圍再按，確認還是有圖釘在跳（補到 6 根），不會沒跳就直接選中。開著大卡時按 🎲 也測一次，跳的圖釘要在大卡上面。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊（🎲 只在首頁，行程模式藏起來）。跟 U72 都在 MapTab.swift，但 U71 改 draw()、U72 改 zoom()，互不影響。

### U72（P3・體驗）選著一根圖釘時點泡泡，放大後新圖釘全是半透明（部分已修，下面只寫剩下的）

**畫面**：地圖首頁：大卡開著時點旁邊的泡泡

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：zoom() 不會取消選取，pins.sel 還在，拆出來的圖釘都是 50% 透明，下面還是舊的大卡，看起來像沒反應。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：MapTab.swift:847-861 的 zoom() 在 acd4471 開頭多了 :848-849 的 `if trip.on { trip.pickAt = CACurrentMediaTime() }`（fix-addcard (c)，行程模式點泡泡不算點空白），但首頁還是沒有取消選取，後面只有 Haptic.light()（:850）、mark、quiet.hush()、atLeastMid()（:853）。setter 在 :85 忽略泡泡的 id，所以大卡開著時點泡泡，pins.sel 還是舊的那根，:1678 的 faded = pins.sel != nil && !on && !hopping 讓拆出來的圖釘全部半透明，下面也還是舊的大卡（:1077）。

**修法**：

fix-addcard (c) 那一半已經在 acd4471，只剩首頁取消選取。MapTab.swift:848-849 現在是：
```swift
        // 行程裡點泡泡放大：不是點空白（不收加站卡、不收搜尋）
        if trip.on { trip.pickAt = CACurrentMediaTime() }
```
換成：
```swift
        // 行程裡點泡泡放大：不是點空白（不收加站卡、不收搜尋）。
        // 首頁大卡開著時點泡泡：先取消選取，大卡淡出和鏡頭移動同一幀開始，拆出來的圖釘不會半透明。行程模式不清，不然加站卡會被關掉
        if trip.on { trip.pickAt = CACurrentMediaTime() } else { pins.select(nil) }
```
不要另外寫一個 if，兩個條件剛好互補，合成一行。pins.select(nil)（:1595-1602）在首頁會讓 SelWatcher 用 nil 呼叫 picked()，走 :571-574 的 guard，id 是 nil 只會 return，不會移鏡頭；也會順便取消還在跳的抽一間（:1598）和抽中但被篩掉的 extra 圖釘，這是想要的。cleared 加一讓 MapTab 跟 :857 的 withAnimation 改 pos 同一輪重算，不會多一幀。:855 的 `guard !ps.isEmpty` 在這行後面，泡泡裡的店剛好都不在 currentList 時會變成只取消選取、不放大，泡泡是從 currentList 做出來的，實際上碰不到。

**模擬器驗收**：首頁點一根圖釘出大卡，再點旁邊的泡泡：大卡淡出、鏡頭放大，拆出來的圖釘都不透明，面板回到卡片列（至少中段）。抽一間正在跳的時候點泡泡：停止跳、不再選中。沒選圖釘時點泡泡照舊放大。行程模式加站卡開著時點泡泡：放大，加站卡不能被關掉；量測浮層可以出現「點空白略過」，不能出現「點空白 收加站卡」或「picked nil 收加站卡」。

**注意**：fix-addcard (c) 已經在 acd4471 的 :849，這項就是把那行改成 if/else，不會變成兩個分開的 if。setter（:84-106）在首頁點泡泡時 MapKit 送的是泡泡 id，:85 就擋掉了，不會把剛清掉的 sel 設回去；行程模式那段（:88-104）不受影響。fix-v11-acd4471.md（RowHold）只改 TripPanel，不重疊。perf-round1b.md 明寫不碰 zoom()，它在 recluster 和泡泡換上那幾處加的 Perf 記號在別的函式，不衝突。同一批 U13 也呼叫 pins.select(nil)，但在 :415 的 onChange，不同位置。

### U73（P3・錯誤）卡片列換卡時用寫死的比例判斷要不要平移，圖釘可能停在搜尋列或右側按鈕底下（分支已改，待驗收）（部分已修，下面只寫剩下的）

**畫面**：地圖首頁中間段：左右滑卡片列

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：focus() 用 dy > 0.38 || dy < −0.12 判斷，是 build 20 的版面。dy 在 +0.29～+0.38 的店被搜尋列蓋住，右下的行程、定位按鈕區也不會平移。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MapTab.swift:786-801 的 focus() 已經是 7fc2143／6691fad 的版本：787 只在 pins.sel == nil && !trip.on 時動，793 下緣用 MapPanel.shared.top（沒量到才用 footY），794 判斷上緣 headY+50、下緣面板上緣 −20、左右各 30pt，798-800 用 aim(…, grow: false) 平移。MapPanel.top 只在 report()（MapTab.swift:1235）停好、非最高段時更新，量到的是動畫終點，不會拿到半路的值，所以原本「動畫途中不準就改 footY」那條不用做。還沒處理的是右下那排按鈕：行程（44×50）和定位（44×44）浮在面板上緣再往上 10pt（MapTab.swift:302-332、1056-1065），整排大約佔右邊 16～60pt、面板上緣往上 10～114pt。794 的右邊界只留 30pt，所以圖釘尖端落在 x 介於 W−78 到 W−30、y 介於面板上緣 −130 到 −20 的店，換卡時還是被這兩顆蓋住，地圖不會動。

**修法**：

上緣、下緣、左右邊界和只在沒選圖釘、不在行程時才平移，ec71aa2 都做好了，這部分只要驗收。剩下右下按鈕區，改 MapTab.swift:793-794：
```swift
let bottom = MapPanel.shared.top > 0 ? MapPanel.shared.top : footY
// 右下「行程」「定位」兩顆浮在面板上緣再上去 10pt（寬 44、右邊距 16，兩顆連間距約 104 高）。
// 圖釘的錨點在尖端、身體往上約 40pt，所以範圍抓寬一點
let underButtons = pt.x > Self.mapWidth - 80 && pt.y > bottom - 130
guard pt.y < headY + 50 || pt.y > bottom - 20 || pt.x < 30 || pt.x > Self.mapWidth - 30 || underButtons else { return }
```
平移目標 798-800 不用改：aim 會把那間放到經度中心，自然離開右邊那排。「找店中…」膠囊出現時按鈕那排會再高 46pt，那是短暫狀態，可以不管。

**模擬器驗收**：地圖停中間段。(1) 把卡片列滑到一間圖釘在搜尋列、分類 chips 底下的店，確認地圖平移，圖釘落在搜尋列和面板之間，浮層記一筆「卡片列移地圖」。(2) 先把地圖拖到讓某間的圖釘正好在右下「定位」按鈕後面，再把卡片列滑到那間，確認地圖會平移，圖釘露出來。(3) 滑到一間本來就在畫面中間的店，確認地圖不動、只有圖釘跳一下。(4) 點一根圖釘出大卡、或進行程模式後，確認卡片列換卡都不會移地圖。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊：那份只動行程模式的 selection setter、blankTap、zoom 和 TripPanel core，focus() 在行程模式一開始就 return。跟 U77 有關：U77 要在卡片列上加垂直拖曳，方向判斷要確實鎖住，不然垂直撥的時候卡片列被帶動一點點，scrolled 變了 0.25 秒後也會呼叫 focus()。跟 U76 有關：d2aec97 之後剪貼簿膠囊在面板上緣 +8 那一帶，顯示的 8 秒內也會蓋住那一帶的圖釘，但那是暫時的，focus() 不用為它讓位。

### U74（P3・滑順）拉過最高或最低段時直接停死，沒有橡皮筋阻力

**畫面**：地圖首頁面板：往上拉過最高、往下拉過最低

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：超出段落後 30pt 內 1:1 跟手，再過去面板就完全不動，手感像撞牆。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：a1b57b1 的面板高度是 MapTab.swift:830 的 height，ec71aa2 已經改掉：面板實際高度改在 PanelLift.swift:18 的 LiftHeight 算（MapTab.swift:1029 套用），還是寫死 min(hi + 30, max(lo − 30, base + lift.y))，超過 30pt 就停死、30pt 內 1:1。同一條算式另外抄了三份：MapTab.swift:991 的 clamp(_:)（現在只拿來判斷 tallPull，MapTab.swift:1197）、MapTab.swift:1259 的 TopFade、TripPanel.swift:211-215 的 panelHeight()（給 fitCoords 算面板蓋住多少，TripPanel.swift:955）。LiftHeight 也被行程面板用（TripPanel.swift:277）。

**修法**：

原本的修法只改 clamp(_:)，在 ec71aa2 上已經沒有效果：面板畫多高是 LiftHeight 決定的，clamp 只用來判斷要不要換成直的清單。要把四個地方一起換成同一個函式，數字才會一致。

(1) PanelLift.swift 檔案最上面（Lift 前面）加一個不綁 actor 的小函式：
```swift
// 面板拉到的高度：段落之間 1:1；拉過最高、最低開始有阻力，越拉越重，最多再多 30（往上）、24（往下）
func panelBand(_ h: CGFloat, lo: CGFloat, hi: CGFloat) -> CGFloat {
    func rubber(_ x: CGFloat, _ l: CGFloat) -> CGFloat { l * (1 - 1 / (x / (2 * l) + 1)) }
    if h > hi { return hi + rubber(h - hi, 30) }
    if h < lo { return lo - rubber(lo - h, 24) }
    return h
}
```
(2) PanelLift.swift:18 改成 `content.frame(height: panelBand(base + lift.y, lo: lo, hi: hi), alignment: .top)`，11 行的註解改成「拉過最高、最低有橡皮筋阻力」。
(3) MapTab.swift:991 改成 `private func clamp(_ h: CGFloat) -> CGFloat { panelBand(h, lo: Self.lowH, hi: highT) }`。
(4) MapTab.swift:1259 改成 `let h = panelBand(base + lift.y, lo: lo, hi: hi)`，按鈕淡出才會跟面板同步。
(5) TripPanel.swift:214 改成 `return panelBand(base + lift.y, lo: hs.low, hi: hs.high)`。

因為 LiftHeight 是兩個面板共用的，行程面板也會一起有阻力，這樣手感一致。如果只想要首頁有，就給 LiftHeight 加一個 `var rubber = true` 參數，TripPanel.swift:277 傳 false，第 (5) 點也不要改。settle()（MapTab.swift:1202）和 settleSheet()（TripPanel.swift:443）都用手指原始位移，不受影響。

上限要注意的地方：首頁最高段面板上緣停在 ceiling = headY + 8（MapTab.swift:271），往上多出 8pt 以上就會壓到分類 chips。現在寫死的 +30 本來就會壓到 22pt；改成橡皮筋後手指拉 100pt 面板只多 19pt，壓到約 11pt，放開就彈回，比現在好。如果 Anthony 要求完全不能碰到 chips，首頁往上的上限要改成 8，那樣阻力會很重。

**模擬器驗收**：(1) 首頁面板拉到最高段，手指繼續往上拉 100pt，確認面板一直有在動、越拉越慢（大約多 19pt），放開彈回最高段，分類 chips 最多短暫被蓋到一點。(2) 最低段繼續往下拉 100pt，確認一樣有阻力、放開彈回。(3) 段落之間（最低拉到中間、中間拉到最高）確認還是 1:1 跟手，換段點跟 ec71aa2 一樣。(4) 從最高段的清單捲到頂再往下拉（ListPullDown 那條），確認面板照常 1:1 往下。(5) 行程模式的面板也做 (1)(2)，確認有一樣的阻力，加站卡框地圖的位置沒有跑掉。

**注意**：跟 fix-addcard-ec71aa2.md：那份把 TripPanel core 的 overlay 改成 ZStack(alignment: .bottom)，這裡只改 panelHeight() 和 LiftHeight 的算式，不碰版面，兩個可以一起進。fitCoords 用 panelHeight() 算面板蓋住多少，加站卡開著時用的是 cardH，不受影響。跟 U77：U77 新加的垂直拖曳也是呼叫 drag()，會自動吃到這裡的阻力，要先做或後做都可以。

### U75（P3・錯誤）「N 間還沒有地址」的數字和打開後的清單對不上

**畫面**：地圖首頁左下「N 間還沒有地址」→ NoAddressSheet

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：數字是 all.count − list.count，sheet 卻列 store.mine 全部沒座標的店。群組地圖寫 3 間，點開卻是自己的清單，甚至顯示「都在地圖上了」。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MapTab.swift:273 還是 `let missing = total - list.count`，total 是 MapTab.swift:78 的 all.count，list 是 MapTab.swift:66 加了 withExtra（抽中但被篩掉的店會多一根，數字就少算）又扣掉行程裡的站。按鈕在 MapTab.swift:291-299，只設 noAddr = true；MapTab.swift:376 開 NoAddressSheet()，而 MapTab.swift:1825 的清單是 store.mine 全部沒座標的店，沒看篩選也沒看群組。所以群組地圖寫 3 間、點開卻是自己全部的清單，或者顯示「都在地圖上了」的問題都還在。另外 NearbyHost 是 .equatable()（MapTab.swift:903-905 只比 total、headY、mapRect、list），數字算在它的 content 閉包裡，閉包只有那四樣變了才會重跑。

**修法**：

(1) MapTab.swift:66 下面加一行，直接數沒有座標的店；群組地圖只算自己的，因為只有自己的店能補地址：
```swift
let noAddrList = all.filter { ($0.lat == nil || $0.lng == nil) && (store.mapGroup == nil || store.isMine($0)) }
```
(2) MapTab.swift:273 改成 `let missing = noAddrList.count`。為了不被 NearbyHost 的相等判斷擋掉，NearbyHost（MapTab.swift:893）加 `let missing: Int`，== 那行加 `&& a.missing == b.missing`，MapTab.swift:271 建 NearbyHost 時傳 `missing: noAddrList.count`，閉包裡改用這個值。
(3) MapTab.swift:15 下面加 `@State private var noAddrIds: [String] = []`（noAddr 的 Bool 留著，不要改成 optional 綁 sheet，不然關的時候內容會先閃一下「都在地圖上了」）。MapTab.swift:291 改成 `Button { noAddrIds = noAddrList.map(\.id); noAddr = true }`，MapTab.swift:376 改成 `.sheet(isPresented: $noAddr) { NoAddressSheet(ids: noAddrIds) }`。
(4) NoAddressSheet（MapTab.swift:1819-1845）加 `let ids: [String]`，1825 改成 `let list = ids.compactMap { store.place($0) }.filter { $0.lat == nil || $0.lng == nil }`，這樣補完地址、查到座標的店會自己消失。再加 `.onChange(of: editing == nil && list.isEmpty) { _, done in if done { dismiss() } }`，要等編輯視窗關了才自動關，不會連 EditSheet 一起被收掉。
(5) 樣式照共通原則改成 ScrollView、candy 列、Color.bg，跟 U100、U84 一起做。

**模擬器驗收**：(1) 切到測試群組的地圖，確認膠囊上的數字等於點開後清單的筆數，清單只有自己存的店。(2) 回我的收藏，點一個分類 chip 篩選，確認數字跟著變，點開的清單也只有那個分類。(3) 在清單裡點一間補上地址存檔，等座標查到，確認那一列自己消失、膠囊數字少 1。(4) 補完最後一間，確認編輯視窗關掉後清單也自己關。(5) 抽一間抽到被篩選掉的店時，確認膠囊數字不會變少。

**注意**：跟 U76／d2aec97：剪貼簿膠囊現在在面板上緣 +8、右邊讓出 52pt（Onboard.swift:183、213），高約 52pt，正好蓋住左下「N 間還沒有地址」膠囊（面板上緣往上 10～46pt）8 秒，這段時間點不到它。這是規格決定的位置，這裡只是提醒，要不要讓剪貼簿膠囊在有這顆時再往上 46pt 由 Anthony 決定。跟 U84（c11）、U100（c13）：第 (5) 點的樣式重疊，三項一起排。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U76（P3・畫面）地圖首頁的剪貼簿膠囊位置寫死 104，壓到分類 chips 下緣（部分已修，下面只寫剩下的）

**畫面**：地圖首頁、地圖推進的店家頁：回前景時的剪貼簿膠囊

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：padding(.top, tab == 0 ? 104 : 6) 是寫死的，chips 下緣約在 110，觸控區到 118，膠囊壓到約 6pt（觸控區 14pt）。地圖推進店家頁時膠囊也還停在 104。行程模式不會出現膠囊；SearchField 和 Chip 高度寫死，字級不影響。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：d2aec97 把剪貼簿膠囊整個移位置了。FoodMapApp.swift:164-169 改成 .overlay(alignment: .bottom)，第 166 行加了 !TripMode.shared.on，行程模式整個不顯示。位置在 Onboard.swift:182-183：地圖首頁、mapPath 是空的、面板不在最高段時用 store.panelTop + 8，貼著面板上緣；推進店家頁（mapPath 不空）、其他分頁、最高段時用分頁列或按鈕列上方。Onboard.swift:213 在地圖首頁右邊讓出 52pt 給行程、定位兩顆。原本寫死 104、壓到 chips、推頁還停在 104、行程模式的問題都不存在了。行程模式不呼叫 clip.dismiss() 也沒關係，Onboard.swift:109-118 的計時 8 秒到了會自己收。新位置有一個副作用：在面板上緣 +8 那一帶，會蓋住左下「N 間還沒有地址」膠囊（MapTab.swift:289-299，面板上緣往上 10～46pt）。

**修法**：

剪貼簿膠囊的位置不要動，維持 Onboard.swift:182-183 的面板上緣 +8。要改的是 MapTab.swift:290-299 那顆「N 間還沒有地址」，剪貼簿膠囊顯示時先讓開。做法是做一個小 modifier，用 @State private var clip = ClipWatch.shared 讀 clip.showing，套上 .opacity(clip.showing ? 0 : 1)、.allowsHitTesting(!clip.showing)、.accessibilityHidden(clip.showing)，再加 .animation(.snappy, value: clip.showing)，然後掛在 MapTab.swift:291 那顆 Button 上。之所以用獨立 modifier 自己讀 ClipWatch，是因為這段在 NearbyHost 的 closure 裡，外面又包了 .equatable()（MapTab.swift:336），直接在 closure 裡讀 ClipWatch.shared.showing，不一定會觸發重畫。膠囊 8 秒收起，或按了貼上、按了 ✕ 之後，這顆會自己淡回來。這段跟 U75 改的是同一塊（MapTab.swift:273 的 missing 和 290-299），建議兩項一起做，U75 把 missing 換成 noAddr 計數之後，這個 modifier 照樣掛在同一顆按鈕上。這段跟 fix-addcard-ec71aa2.md 沒有重疊，那份只動行程模式的 Map selection、blankTap、pickAt 和 TripPanel 的 ZStack。模擬器測試的做法如下。先準備一間沒有座標的店，讓左下出現「N 間還沒有地址」，然後複製一個連結再回到地圖首頁，面板在中間段、最低段各試一次。膠囊顯示時左下那顆要淡掉，不能被蓋在底下。8 秒後或按 ✕ 之後，那顆要回來，而且點得到。

**模擬器驗收**：確認 d2aec97 的新位置就好：(1) 複製一個連結回地圖首頁（中間段、最低段各一次），確認膠囊貼在面板上緣上方，不擋分類 chips，右邊沒壓到行程、定位兩顆。(2) 面板拉到最高段，確認膠囊移到分類 chips 底下以外的位置（分頁列上方）。(3) 推進店家頁，確認膠囊在按鈕列上方。(4) 膠囊出現時按右上「行程」進行程模式，確認膠囊不見，8 秒後回首頁也不會再冒出來。(5) 有沒地址的店時，確認膠囊顯示期間左下那顆被蓋住，記下來給 Anthony 看要不要讓開。

**注意**：跟 U75 有交集：剪貼簿膠囊在地圖首頁會蓋住「N 間還沒有地址」膠囊約 8 秒，見 U75 的說明。跟 U107（c14，VoiceOver 太快消失）和 U69（c09，A4 規格已改）是同一個膠囊，位置不用再改。跟 fix-addcard-ec71aa2.md 沒有重疊。

**反方檢查補充**：原本那幾個問題在 ec71aa2 確實都不見了。膠囊不再寫死 104，地圖首頁改用 store.panelTop + 8（Onboard.swift:182-183），推進店家頁時改貼按鈕列，行程模式時 FoodMapApp.swift:166 整個藏起來，而且 ClipWatch.check 在 Onboard.swift:76 也擋了 !TripMode.shared.on，所以行程模式裡不會把一次複製默默吃掉。右邊讓開 52pt（Onboard.swift:213），行程、定位兩顆在 x 方向是 W-60 到 W-16，膠囊右緣在 W-68，不會壓到。不過搬家之後多了一個新的重疊，而且檢查員自己也看到了，只是把它丟成「記下來給 Anthony 看」，整項又判作廢，等於沒人會修。實際算一下：膠囊高約 52pt（✕ 是 44 再加上下各 4），底邊在面板上緣往上 8，所以佔面板上緣往上 8 到 60 這一段，左邊從 16 開始。「N 間還沒有地址」膠囊在 MapTab.swift:290-299，因為 HStack(alignment: .bottom)，底邊貼在面板上緣往上 10，高 36，佔 10 到 46，左邊也從 16 開始。這顆會整個被剪貼簿膠囊蓋掉，而且剪貼簿膠囊在上層會吃掉點擊，所以最少 8 秒內點不到，手指按著膠囊的時候計時會暫停，被擋的時間還會更長。這是位置改動造成的瑕疵，不是規格問題。A4 規定的是「面板上緣 +8」，而讓沒地址那顆在膠囊顯示時先讓開，並不違反這條規格，寫 Swift 的人照規格直接修就好，不需要 Anthony 決定。

### U77（P3・體驗）卡片列和大卡本體上下撥都不會動面板，能拉的只有頂部一行

**畫面**：地圖首頁中間段：卡片列、大卡本體

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：grip 只掛在橫條、titleRow 和 PickedCard 第一行。面積最大的卡片列和大卡本體往下撥都沒反應，DrawHistory 那一行也拉不動。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：PanelDrag 在 MapTab.swift:1273-1294，還是用 .gesture（排他）、minimumDistance 4，只掛在橫條（MapTab.swift:1004）、titleRow（1187）、PickedCard 第一行（1353）、新帳號卡（1093）和最高段沒店時的空白（1157）。中間段的卡片列（MapTab.swift:1098-1117）、大卡本體（MapTab.swift:1354-1394）和 DrawHistory（MapTab.swift:1338，Draw.swift:223-247 是橫的 ScrollView）都沒有掛，往下撥面板不會動。fe3e591、5048a9e 加的 ListPullDown 只處理最高段直的清單（MapTab.swift:1153），中間段沒受惠。可以參考的是行程面板在 ec71aa2 新加的備案拖曳 listPull（TripPanel.swift:417-440）：用 PullBox（PanelLift.swift:36-41）這種參考型的小盒子記「這次手勢判斷過了沒、接手了沒」，比 @GestureState 好用，因為 onChanged 裡讀得到也改得到。

**修法**：

(1) 不要用 @GestureState 決定方向，照 TripPanel.swift:417-440 的做法，NearbySheet 加 `@State private var vpull = PullBox()` 和 `@GestureState private var vpulling = false`，做一個同時手勢：
```swift
// 卡片列、大卡本體上的垂直拖曳：第一次動超過 10pt 時決定方向，直的才拉面板，橫的讓給捲動、點擊照常
private var cardPull: some Gesture {
    DragGesture(minimumDistance: 10, coordinateSpace: .global)
        .updating($vpulling) { _, s, _ in s = true }
        .onChanged { v in
            let b = vpull
            if !b.swift {
                guard !b.decided else { return }
                b.decided = true
                guard abs(v.translation.height) > abs(v.translation.width) * 1.2 else { return }
                b.swift = true
            }
            drag(-v.translation.height)
        }
        .onEnded { v in
            vpull.decided = false
            guard vpull.swift else { return }
            vpull.swift = false
            vpull.atTop = false; pulledAt = CACurrentMediaTime()
            settle(target(mp.stage) - v.predictedEndTranslation.height * 0.6, push: -v.predictedEndTranslation.height)
        }
}
```
再加 `.onChange(of: vpulling) { _, p in guard !p else { return }; vpull.decided = false; if vpull.swift { vpull.swift = false; released() } }`，手勢被系統取消時面板才不會停在半路。
(2) 掛的位置：卡片列 ScrollView（MapTab.swift:1109 的 .frame(height: 112) 後面）加 `.simultaneousGesture(cardPull)`；大卡本體不要直接重用 grip（grip 是排他的 .gesture，按在照片、導航、店家頁按鈕上會被按鈕吃掉），改成 PickedCard 多收一個 `var bodyPull: AnyGesture<Void>?`，在 MapTab.swift:1393 的 .candy(22) 後面掛 `.simultaneousGesture(bodyPull)`；DrawHistory（MapTab.swift:1338）也掛同一個。只換段，不做「往下拉 60pt 就關卡」，關卡維持只有 ✕。
(3) 要特別處理點擊：面板跟著手指 1:1 往下移，手指相對於卡片幾乎沒動，放開時 NavigationLink 可能還是會被當成點一下而推進店家頁。所以 NearbySheet 加 `@State private var pulledAt: CFTimeInterval = 0`（上面 onEnded 已經寫入），卡片列 MapTab.swift:1101 的 NavigationLink 改成 `Button { guard CACurrentMediaTime() - pulledAt > 0.3, !vpull.swift else { return }; store.mapPath.append(p) } label: { MapCard(...) }.buttonStyle(PressStyle { ReelCache.warm(p) })`；PickedCard 的照片（1356）、店家頁（1379）、導航（1371）也加同樣的 guard（從 NearbySheet 傳一個 `canTap: () -> Bool` 進去）。如果模擬器上確認放開不會誤觸，這一步可以省掉。
(4) 方向鎖住變成直的以後，橫的 ScrollView 可能還會被帶動幾點，不用 scrollDisabled 去擋（中途改它會取消手勢），可以接受。

**模擬器驗收**：(1) 中間段在卡片列上垂直往下撥，確認面板降到最低段；往上撥確認升到最高段。(2) 在卡片列上水平滑，確認照常換卡、面板不動。(3) 點一張卡，確認照常進店家頁；往下撥放開後，確認沒有誤進店家頁。(4) 點圖釘出大卡，在照片、店名、導航按鈕上往下撥，確認面板降段、大卡不會被關掉，也沒有開導航或進店家頁。(5) 抽一間抽兩次以上讓 DrawHistory 出現，在那一行往下撥確認面板會動，左右滑照常捲。(6) 撥到一半讓系統取消手勢（例如下拉通知中心），確認面板會停回某一段。

**注意**：跟 U74：新手勢走同一個 drag()、settle()，會一起吃到橡皮筋阻力，先後都可以。跟 U73：方向沒鎖好時卡片列會被帶動，scrolled 一變 0.25 秒後就呼叫 focus() 移地圖，所以 (1) 的方向鎖要做確實。跟 U50（c06）：PanelDrag 有 .swipeBackBlocked，新的同時手勢掛在面板裡面，面板本身已經在擋右滑返回的範圍內，不用再加。跟 fix-addcard-ec71aa2.md 沒有重疊，那份只動行程模式。

### U88（P3・滑順）「▶ 看影片」和分類膠囊沒跟著照片視差移動（有爭議，低優先）

**畫面**：店家頁照片區（往上捲時半速視差、往下拉放大）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：Stretchy 只對照片做半速 offset 和放大，兩顆膠囊在外面的 overlay 照正常速度走。往上捲時，照片從膠囊底下滑過去；下拉放大時，膠囊相對照片左右邊緣內縮。build 20 的分類標籤就有這個問題。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：PlaceDetail.swift:93-120 的結構跟 a1b57b1 一樣：Stretchy 只包照片（94-98），「看影片／看貼文」膠囊（100-113）和分類膠囊（114-119）還是掛在 Stretchy 外面。Stretchy 在 PlaceDetail.swift:495-508，只對 content 做 scaleEffect 和半速 offset。ec71aa2 只把返回、更多移到 safeAreaInset(.top) 並加了 TopShade（PlaceDetail.swift:43-47），沒動照片這段。info 區有 .candy(24) 的不透明白底（PlaceDetail.swift:169），往下沉的膠囊會被蓋住。

**修法**：

把兩個 overlay 搬進 Stretchy 的閉包，掛在 clipShape 後面（掛在前面會被圓角裁掉）。PlaceDetail.swift:93-120 整段換成：
```swift
private func photo(_ place: Place) -> some View {
    Stretchy(scroll: scroll) {
        Color.clear.aspectRatio(4 / 3, contentMode: .fit)
            .overlay { PlaceMedia(place: place) }
            .clipShape(.rect(cornerRadius: 28))
            .overlay(alignment: .bottomLeading) { sourceChip(place) }   // 原本 100-113 的內容抽成 @ViewBuilder 函式
            .overlay(alignment: .bottomTrailing) { catChip(place) }     // 原本 114-119
    }
}
```
offset 會連點擊區一起移，按鈕不用另外處理。下拉放大時膠囊的字會跟著放大一點，這是預期的。順帶一提：影片播放時 PlaceMedia 自己在右下有一顆靜音鈕（Reel.swift:20-35），跟分類膠囊疊在同一個角，分類膠囊又蓋在上面；搬的時候建議把分類膠囊改到 .topTrailing，或在 player 存在時往上讓 44pt。

**模擬器驗收**：開一間 IG Reel 來源、會播影片的測試店。往上捲約 200pt，錄影確認兩顆膠囊跟照片一起慢速移動、最後被 info 白卡和頂端 TopShade 蓋住，不會浮在照片外。往下拉放大，確認膠囊貼著照片左右下角，不往內縮。影片在播時確認右下的靜音鈕沒有被分類膠囊擋住，點得到。

**注意**：跟 U89 改的是同一段（PlaceDetail.swift:100-113），要一起做：先照 U88 把膠囊搬進 Stretchy，再在搬過去的 sourceChip 裡換成 U89 的判斷。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U89（P3・體驗）Google 地圖來源的店，照片上也寫「看貼文」

**畫面**：店家頁照片左下膠囊（來源是 Google 地圖、TikTok 等）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：只要網址不含 /reel/ 就顯示「看貼文」。Google 地圖連結點了開 Google 地圖，TikTok 影片也被寫成看貼文。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：PlaceDetail.swift:101-105 還是 `let reel = s.contains("/reel/") || s.contains("/reels/")`，不是 Reel 一律寫「看貼文」。這段在 a1b57b1 到 ec71aa2 之間沒改過。另外雲端存 Google 地圖來源時，source_url 是轉址後的網址（_shared/extract.ts:155-157 存 g.final），通常是 www.google.com/maps/place/…，不是 maps.app.goo.gl。

**修法**：

在 Place 加一個 computed property（放 Models.swift 的 Place 附近或 PlaceDetail.swift 檔尾都可以）：
```swift
extension Place {
    enum SourceKind { case video, post, maps, web }
    var sourceKind: SourceKind? {
        guard let s = source_url, !s.isEmpty, let u = URL(string: s), let h = u.host?.lowercased() else { return nil }
        let p = u.path.lowercased()
        if h.hasSuffix("instagram.com") { return p.contains("/reel/") || p.contains("/reels/") ? .video : .post }
        if h.hasSuffix("tiktok.com") { return .video }
        if h.hasSuffix("threads.net") || h.hasSuffix("threads.com") { return .post }
        if h == "maps.app.goo.gl" || h == "share.google" || h.hasPrefix("maps.google.")
            || (h == "goo.gl" && p.hasPrefix("/maps")) || (h.contains("google.") && p.hasPrefix("/maps")) { return .maps }
        return .web
    }
}
```
PlaceDetail.swift:101-105 改成用 `place.sourceKind` 決定文字：.video 寫「▶ 看影片」，.post 寫「看貼文」，.maps 寫「在 Google 地圖看」（可以加 map.fill 小圖示），.web 寫「看原文」。google.com/maps 這條一定要有，因為線上存的多半是轉址後的長網址。

**模擬器驗收**：準備三間測試店，source_url 分別是 https://www.google.com/maps/place/...、https://maps.app.goo.gl/xxxx、https://www.tiktok.com/@a/video/1。打開店家頁，前兩間膠囊要寫「在 Google 地圖看」，TikTok 那間要寫「▶ 看影片」；再開一間 instagram.com/p/ 的店確認還是「看貼文」。

**注意**：跟 U88 改同一段，要在 U88 搬好的 sourceChip 裡做。跟 U90 的用語要一致：U90 在小地圖右下加「Google 地圖 ↗」，這裡寫「在 Google 地圖看」，兩個都指 Google 地圖但打開的網址不同（這裡是來源原網址，U90 是用店名查詢），可以接受。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U90（P3・無障礙）小地圖點了會開 Google 地圖，但看不出來，也沒有按鈕語意

**畫面**：店家頁最下面的小地圖

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：小地圖用 .onTapGesture 開 place.mapsURL，VoiceOver 唸不出是按鈕，畫面上也沒有可以點的提示。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：PlaceDetail.swift:291-297 的小地圖還是 `.contentShape(.rect).onTapGesture { if let u = place.mapsURL { openURL(u) } }`，沒有按鈕特徵、沒有 accessibilityLabel，畫面上也沒有可點提示。ec71aa2 只在 MiniMap 的截圖 task 加了 450ms 延遲（PlaceDetail.swift:417 附近），跟點擊無關。

**修法**：

PlaceDetail.swift:291-297 換成：
```swift
private func map(_ place: Place, _ c: CLLocationCoordinate2D) -> some View {
    Button { if let u = place.mapsURL { openURL(u) } } label: {
        MiniMap(place: place, coord: c)
            .frame(height: 190).clipShape(.rect(cornerRadius: 24))
            .overlay(alignment: .bottomTrailing) {
                Text("Google 地圖 ↗").font(.footnote.weight(.heavy)).foregroundStyle(Color.ink)
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(.white.opacity(0.92), in: .capsule).padding(10)
            }
            .contentShape(.rect)
    }
    .buttonStyle(PressStyle())
    .accessibilityLabel("在 Google 地圖看 \(place.name)")
    .accessibilityHint("看評價和營業時間，會離開 Bitemap")
}
```
用 PressStyle 而不是 .plain，按下去有縮一下的回饋，跟同頁其他按鈕一樣。膠囊放右下，不會蓋到截圖左下的 Apple 地圖字樣。保留開 mapsURL，不要改成導航。

**模擬器驗收**：開一間有座標的測試店捲到最下面，確認小地圖右下有「Google 地圖 ↗」，按下去有縮放回饋並開 Google 地圖。用 Accessibility Inspector 檢查小地圖是一個 Button，標籤「在 Google 地圖看 店名」，提示是「看評價和營業時間，會離開 Bitemap」。

**注意**：跟 U89 的 Google 地圖用語相鄰，見 U89 說明。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U102（P3・體驗）抽一間設定的「怎麼抽」放在最下面，半高時看不到

**畫面**：長按 🎲 或點齒輪 → 抽一間設定（.medium）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：唯一能換玩法的地方（一間、三間挑一、轉盤），卻排在範圍、10 個分類、狀態、價位、三個開關之後，很多人不知道有轉盤。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Draw.swift 這段只在 640390a 把「全部」搬到範圍第一格、在底部加了分店說明。「怎麼抽」還是排在最後：Draw.swift:310-314 的 section("怎麼抽") 在範圍（:272）、分類、想去去過、價位、三個開關（:304-309）之後。面板在 MapTab.swift:360、ListTab.swift:112 都是 `.presentationDetents([.medium, .large])`，半高時看不到。

**修法**：

(1) 刪掉 Draw.swift:310-314 整個 `section("怎麼抽") { ... }`。
(2) 在 :271 的 DrawHistory 那行後面、:272 `section("範圍")` 前面插一行 `modePicker`。
(3) DrawPanel（:251 起）加 `@Namespace private var modeNS`，再在 :371 的 chip() 旁邊加：
```swift
private var modePicker: some View {
    let items: [(DrawPrefs.Mode, String)] = [(.one, "🎲 一間"), (.three, "🃏 三選一"), (.wheel, "🍩 轉盤")]
    return HStack(spacing: 0) {
        ForEach(items, id: \.0) { m, t in
            let on = drawer.prefs.mode == m
            Button { Haptic.tick(); withAnimation(.snappy) { drawer.prefs.mode = m } } label: {
                Text(t).font(.system(size: 15, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.8)
                    .foregroundStyle(on ? Color.white : Color.accent)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .background { if on { Capsule().fill(Color.accent).matchedGeometryEffect(id: "mode", in: modeNS) } }
                    .contentShape(.capsule)
            }
            .buttonStyle(PressStyle())
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }
    .background(Color.accent.opacity(0.13), in: .capsule)
}
```
原本寫的「Haptic.tick() 並用 PressStyle」要注意一點：PressStyle 要用不帶參數的 `PressStyle()`，不要用 `PressStyle(haptic: true)`，不然按下會先 Haptic.light 再 tick，震兩次。DrawPrefs.Mode 是 String 的 enum（Draw.swift:9），可以直接當 ForEach 的 id。做法跟分頁列（FoodMapApp.swift:323）的 matchedGeometryEffect 一樣。預設維持「一間」，不用改 DrawPrefs。
(4) 不要做成 emoji 28pt 的高卡，維持單行 44pt。

**模擬器驗收**：在地圖長按 🎲（或點旁邊的齒輪）打開設定，停在半高：確認第一屏、範圍上面就有三格「🎲 一間｜🃏 三選一｜🍩 轉盤」，點另一格時橘色底會滑過去、手機輕震一次（不是兩次）。收藏頁的齒輪打開也一樣。iPhone SE 上三格字不會被截掉。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批 U104 原本第 (3) 點在 ListTab 的 🎲，現在已經改成 Draw.swift 的 DiceChip（:179-218），跟這裡改的 DrawPanel 是不同 struct，不衝突。

### U132（P3・滑順）按「抽！」時面板還在往下收，前幾根跳動的圖釘被面板壓暗或擋住

**畫面**：地圖首頁 → 抽一間設定 →「抽！」（一間模式）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：dismiss() 和 go() 同一幀呼叫，.medium 面板約 0.35 秒才收完，前 2～3 次跳動和 🎲 轉動在面板底下。上半部的圖釘只是被壓暗，下半部的才看不到。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Draw.swift:351-354 的「抽！」還是同一幀先 dismiss() 再 go()，沒有延後也沒有改順序。MapTab.swift:358-361 的 .sheet(isPresented: $paneling) 沒有 onDismiss，go 直接接 draw()；MapTab.swift:435-436 的 hoppers 只用 shownRegion 篩過再 shuffled()，沒有先挑面板蓋不到的上半部；MapTab.swift:443-454 第一根在按下那一刻就跳。收藏頁 ListTab.swift:110-113 一樣是 go: { draw() }，抽中的 DrawStage（ListTab.swift:99-107）會在面板還沒收完時就出來。a1b57b1 到 ec71aa2 之間 Draw.swift 只改了面板說明文字和範圍順序（640390a），沒碰這段流程。

**修法**：

兩案還是交給 Anthony 看錄影決定，寫 Swift 的人先做 (b)，因為改動小、兩個分頁都能用同一招；如果 Anthony 覺得按下去要立刻有動靜，再換 (a)。不要寫死 Task.sleep(300ms)。

(b) 等面板收完才開始抽：
1. MapTab.swift:25 旁邊加 `@State private var pendingDraw = false`，MapTab.swift:358-359 改成：
```swift
.sheet(isPresented: $paneling, onDismiss: {
    // 從抽一間面板按「抽！」：等面板收完才開始跳，前幾根才不會被面板蓋住
    guard pendingDraw else { return }
    pendingDraw = false
    draw()
}) {
    DrawPanel(ctx: drawCtx(), go: { pendingDraw = true }, pickHistory: choose)
```
2. 收藏頁 ListTab.swift:10 旁邊同樣加 pendingDraw，ListTab.swift:110-111 用同樣寫法，go 改成 `{ pendingDraw = true }`，onDismiss 裡呼叫 draw()。
3. Draw.swift:351-353 的按鈕裡，dismiss() 前面加 `Haptic.light()`，讓手指離開那一刻有回饋（ChunkyStyle 本身的縮放照舊）。順序維持先 go() 設旗標、再 dismiss() 也可以，onDismiss 一定在收完之後才跑。
4. 只有按「抽！」會設旗標，所以按「完成」、往下拖關、從歷史紀錄選一間（Draw.swift:271）都不會誤抽。

(a) 不延後，改跳的順序（只動地圖分頁）：
1. MapTab.swift:401 改成 `private func draw(fromPanel: Bool = false)`，MapTab.swift:359 的 go 改成 `{ draw(fromPanel: true) }`。
2. MapTab.swift:436 算完 hoppers 之後加：
```swift
// 從面板進來：面板還在往下收，先跳畫面上半部（.medium 蓋不到）的，下半部排後面
let order: [Place] = fromPanel ? {
    let cut = mapRect.height * 0.45
    let y = { (p: Place) in pins.locate?(.init(latitude: p.lat!, longitude: p.lng!))?.y ?? .infinity }
    return hoppers.filter { y($0) < cut } + hoppers.filter { y($0) >= cut }
}() : Array(hoppers)
```
然後 MapTab.swift:444 的 `for p in hoppers` 改成 `for p in order`。用 pins.locate 換算螢幕位置，不要用緯度排，因為地圖有指南針可以轉方向（MapTab.swift:155）。
3. 收藏頁沒有圖釘可以排，(a) 對收藏頁無效，收藏頁仍要用 (b) 的做法。

**模擬器驗收**：長按地圖的 🎲（或點齒輪）開抽一間面板，模式選「一間」，按「抽！」並錄影，確認每一根跳動和 🎲 轉動都在面板收完之後看得到；PerfHUD 的「抽一間（開始）」應該落在面板收完之後（(b)）或第一根是畫面上半部的（(a)）。再做三次：按「完成」關面板、往下拖關面板、從歷史紀錄選一間，這三種都不能自己開始抽。收藏頁長按 🎲 開面板按「抽！」，抽中的卡片要等面板收完才出現。打開「減少動態」再按一次，確認直接選中、沒有卡住。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊，那份只動行程模式的 selection setter、blankTap、zoom 和 TripPanel。同一批其他項目也沒有碰 draw() 或 DrawPanel。

### U134（P3・滑順）「分享」要等 1200px 大圖下載完才跳選單，網路慢時按了沒反應

**畫面**：店家頁最下面的分享方塊、右上 ⋯ →「分享」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：share() 先 await 載大圖才 presentShare。大圖還沒出現或載入失敗時，最久可能等到 60 秒逾時。⋯ 選單裡的分享完全沒有回饋。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：PlaceDetail.swift:250-257 的 share() 還是在 Task 裡先 `await PhotoLoader.shared.load(u, 1200)` 才 presentShare(items)，大圖沒快取時要等下載或逾時。兩個入口 PlaceDetail.swift:86（⋯ 選單）和 PlaceDetail.swift:209（底部分享方塊）都直接呼叫 share(place)，兩處都沒有 Haptic，底部那顆是 PressStyle() 不帶震動（PlaceDetail.swift:216）。Nav.swift:42-49 的 presentShare 沒有擋重複開。Photo.swift:19-20 的 cached(_:_:) 和 anySize(_:) 是 nonisolated，可以在主執行緒同步呼叫。a1b57b1 到 ec71aa2 之間這段沒改過，Nav.swift、Photo.swift 也沒改。

**修法**：

1. PlaceDetail.swift:250-257 換成同步版本，不等網路：
```swift
// 分享：店名、地址、必點、地圖連結；封面照片手機裡已經有才附上（不等下載，網路慢時也立刻跳選單）
private func share(_ place: Place) {
    Haptic.light()
    var items: [Any] = [place.shareText]
    if let u = place.photoURL, let img = PhotoLoader.shared.cached(u, 1200) ?? PhotoLoader.shared.anySize(u) { items.append(img) }
    presentShare(items)
}
```
anySize 會拿這個網址載過最大的那張，店家頁封面通常已經載過，所以多數情況還是會附圖；地圖點圖釘時 MapTab.swift:544 也會預載 1200。shareText 已經有地圖連結（Nav.swift:32-38），沒圖時只分享文字也完整。
2. 防連點放在 Nav.swift:45 的 while 後面，兩個入口和行程分享（TripPanel.swift:1310）都受惠：
```swift
// 分享選單已經開著（連點兩下）：不要再疊一個
if top is UIActivityViewController { return }
```
3. Haptic.light() 已經寫在 share() 裡，底部方塊的 PressStyle() 就維持不帶震動，免得震兩次。

**模擬器驗收**：用 Network Link Conditioner 設 100% Loss，在收藏頁打開一間還沒進過的店（大圖沒載過），立刻按底部分享方塊，選單要馬上跳出、內容是文字加地圖連結；再從右上 ⋯ 按「分享」一次，一樣立刻跳出。關掉 Loss，等封面載完再按分享，這次要附照片。快速連點分享方塊兩下，只能出現一個分享選單，Xcode 主控台不能有「already presenting」警告。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。Nav.swift 的 presentShare 也被行程分享（TripPanel.swift:1310）使用，加的防連點只擋已經開著分享選單的情況，不影響它。同一批其他項目沒有碰分享。

### U136（P3・畫面）K4：訊息條蓋到「N 間還沒有地址」膠囊

**畫面**：地圖首頁（有「N 間還沒有地址」膠囊時出現 toast）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：訊息條在 panelTop + 8，膠囊在 +10，垂直幾乎 100% 重疊，左半段疊在膠囊上。訊息條在上層會攔下觸控，這段時間膠囊點不到。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：FoodMapApp.swift:114 和 FoodMapApp.swift:118 的訊息條在地圖首頁還是放在 store.panelTop + 8，ec71aa2 只多了「最高段改放分頁列上方」（d2aec97），中間段和最低段沒變。「N 間還沒有地址」膠囊在 MapTab.swift:289-298，36pt 高，跟行程、定位那排一起被 MapTab.swift:1058-1066 往上推 topH + 10，所以底邊在面板上緣 +10，跟訊息條（+8）上下幾乎完全重疊，訊息條左半段疊在膠囊上，而且訊息條在上層會吃掉觸控。另外 d2aec97 把剪貼簿膠囊也搬到同一個位置：Onboard.swift:182-183 的 pad 一樣是 panelTop + 8，Onboard.swift:213 右邊一樣讓 52，所以剪貼簿膠囊現在也會壓住「N 間還沒有地址」（它在有訊息條時會藏起來，FoodMapApp.swift:166，兩條不會互疊，但都會蓋到地址膠囊）。原修法第 (3) 點「用實際停的段位計算」在 ec71aa2 已經成立：MapTab.swift:1069-1071 的 panelTop 是用 target(mp.stage) 算的。

**修法**：

用「讓開」，不要「淡掉」。訊息條和剪貼簿膠囊要一起改，算法放同一處：
1. Store.swift:54 的 panelTop 下面加：
```swift
// 地圖首頁面板上緣左邊那顆「N 間還沒有地址」的高度（沒有就是 0）：訊息條、剪貼簿膠囊要疊在它上面
var panelChipH: CGFloat = 0
// 地圖首頁浮在面板上緣的東西（訊息條、剪貼簿膠囊）離底部多高
var mapFloatPad: CGFloat { panelTop + 8 + (panelChipH > 0 ? panelChipH + 8 : 0) }
```
2. MapTab.swift:298 的 `.buttonStyle(PressStyle())` 後面加量高度，膠囊消失時寫回 0：
```swift
.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if abs(store.panelChipH - h) > 0.5 { store.panelChipH = h } }
.onDisappear { store.panelChipH = 0 }
```
不需要原本說的 probe.foot，ec71aa2 的 PanelProbe（MapTab.swift:1268-1270）已經沒有 foot 這個欄位。
3. FoodMapApp.swift:118 的 onMap 分支 `store.panelTop + 8` 改成 `store.mapFloatPad`；Onboard.swift:183 的 onMap 分支也改成 `store.mapFloatPad`。兩邊原本就有 `.animation(.snappy(duration: 0.3), value: pad)`（FoodMapApp.swift:140、Onboard.swift:215），膠囊出現或消失時會滑過去，不用另外加動畫。
4. 結果是訊息條底邊在 +52、地址膠囊頂端在 +46，中間留 6pt；右邊的 52pt 讓位照舊，不會碰到行程、定位那欄。最高段 onMap 本來就是 false，不受影響。

**模擬器驗收**：用有沒地址店的測試帳號（地圖上要看到「N 間還沒有地址」），面板停在中間段，用 Debug 觸發一條訊息條，確認訊息條整條在地址膠囊上方、不重疊，而且這時點地址膠囊能打開「還沒有地址」清單。面板拖到最低段再觸發一次，結果一樣。複製一個網址回到 App 叫出剪貼簿膠囊，確認它也在地址膠囊上方、地址膠囊點得到。補完地址讓膠囊消失後再觸發訊息條，訊息條要回到面板上緣 +8（跟 ec71aa2 一樣）。中間段和最低段各截一張訊息條加地址膠囊同時出現的圖。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊：行程模式走 FoodMapApp.swift:116 的 onTrip 分支，剪貼簿膠囊在行程模式也不顯示（FoodMapApp.swift:166），這次只改 onMap 分支。跟規格變更有關：剪貼簿膠囊在 d2aec97 定成面板上緣 +8，這次只在有地址膠囊時才往上讓，沒有地址膠囊時位置完全照 d2aec97，不算推翻那個決定，但要讓 Anthony 知道剪貼簿膠囊也一起動了。

### U137（P3・滑順）K5：自己畫的藍點拖地圖時可能和地圖錯開

**畫面**：地圖首頁：快速甩地圖、慣性滑行、雙指縮放

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：藍點是蓋在地圖上的 SwiftUI 層，每次 onMapCameraChange(.continuous) 才重算位置，快速拖動或縮放時可能落後一幀，看起來在飄。飛到搜尋結果的動畫也會遇到。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：acd4471 沒有碰藍點。藍點還是 Map 外面另一層 SwiftUI：MapTab.swift:253-255 的 MyDotLayer（註解在 :251-252），用 MyDot.at（:2053）定位，MyDotLayer 本體在 :2076-2088。at 只在 :182-191 的 onMapCameraChange(frequency: .continuous) 裡呼叫 dot.refresh()（:188，refresh 本體 :2057-2060）才更新，快甩、慣性、縮放時仍可能比地圖慢一幀。:225-226 在 .task 裡設 dot.locate、先 refresh 一次，MyDot.track() 在 :2070 也呼叫 refresh()。Map 的 selection setter（:84-106）在 a45ce70 到 acd4471 多了行程模式的判斷（:88-104），但第一行擋泡泡和站號的 :85 還在。

**修法**：

這項先量再改，最後的取捨要 Anthony 決定。

1. 先在 120Hz 實機錄快甩、慣性滑行和雙指縮放，確認藍點錯開肉眼看得到。看不出來就結案，不改。

2. 真的會飄才改。不要拖動中隱藏（會閃），也不要改回 UserAnnotation（fba465a 為了發熱拿掉的）。在 Map content 的最後，也就是 MapTab.swift:171 的右括號（收掉 :124 的 `if trip.on {`）之後、:172 的右括號（收掉 Map content）之前加：
```swift
                    // 自己的位置：當成地圖標註畫，跟地圖同一幀移動（座標還是走 10 公尺才更新）
                    if let c = dot.coord {
                        Annotation("", coordinate: c, anchor: .center) {
                            MyDotView()
                                .opacity(trip.on && !trip.going ? 0.35 : 1)
                                .animation(.easeOut(duration: 0.25), value: trip.on && !trip.going)
                        }
                        .tag("me")
                        .annotationTitles(.hidden)
                    }
```
一定要加 `.tag("me")`，再把 MapTab.swift:85 改成：
```swift
                    if let id, id == "me" || (id.contains(",") && !id.hasPrefix("hit:")) || trip.marks.contains(where: { $0.id == id }) { return }
```
原因：沒 tag 的 Annotation 會被 MapKit 拿 id 當成選取送進 setter（:82-83 的註解就是在講這個）。有 tag 但不擋的話，首頁點到藍點會走 :105 的 pins.select("me")，所有圖釘先變淡一下，再被 picked() 的 :571-573 取消選取，大卡開著時還會把大卡關掉。行程模式雖然 acd4471 的 :95-98 也會擋掉（"me" 不是收藏也不是 hit:），但會多打一筆「地圖選取不是圖釘」，所以統一在 :85 擋。

3. 刪掉舊的那層和它的更新：MapTab.swift:251-255（註解、MyDotLayer 和它的 opacity、animation）；:188 的 dot.refresh()；:225-226 的 dot.locate 和 dot.refresh()（:224 的 pins.locate 要留）。MyDot（:2050-2074）拿掉 at（:2053）、locate（:2054）、refresh()（:2057-2060），track() 裡 :2070 的 refresh() 也刪掉，coord 和 last 留著。MyDotLayer（:2076-2088）整個刪掉，MyDotView（:2090 起）保持不變。

4. 代價要交給 Anthony：(甲) 藍點會照緯度跟圖釘排上下，被南邊的圖釘蓋住，推翻 0b66be2「藍點在圖釘上」的決定；(乙) 排行程時藍點會被南邊的站號蓋住，ac36167 為了不蓋站號才把藍點調淡，改成標註後可能不需要調淡；(丙) Map content 讀 dot.coord，MapTab 本體會在每走 10 公尺時重算一次，跟 5b5355c 減少整個地圖分頁重算的方向相反，要用 PerfHUD 的重算次數確認走路時沒有明顯增加。

**模擬器驗收**：模擬器 Features 的 Location 設 Freeway Drive，打開 PerfHUD，快速甩地圖、放手讓它慣性滑、雙指縮放，各錄一段看藍點有沒有跟地圖錯開（最後以 120Hz 實機為準）。有改的話再測：首頁點藍點不能讓圖釘一起變淡、不能出大卡、大卡開著時點藍點旁邊空白照舊；行程模式點藍點，浮層不能出現「地圖選取不是圖釘」，行為跟現在點藍點一樣（藍點現在不吃點擊，點下去等於點地圖空白，所以加站卡開著時會照點空白的規則收掉，這跟 acd4471 一致，不算退步）；排行程時藍點仍是淡的，出發中照常；PerfHUD 的地圖分頁重算次數在 Freeway Drive 下不能比 acd4471 多很多。

**注意**：fix-addcard (b) 已經做進 acd4471 的 setter（:88-104），這項只改第一行 :85，"me" 在進到行程那段之前就被擋掉，不會碰到 0.6 秒和「不是圖釘」的判斷。藍點本身 allowsHitTesting(false)，點到它時 :178-181 的 SpatialTapGesture 照樣跑 blankTap；pinNear（:704 起）只看收藏和搜尋結果，不看藍點，所以不會因此多等 650ms。同一批 U61 在 :182-191 的 continuous 回呼加一行，原本說放在 :188 的 dot.refresh() 前面；這項會刪掉 dot.refresh()，兩項都套時，U61 那行就放在 :187 的右括號之後、:189 的 pinFrame(proxy) 之前。perf-round1b.md 動的是鏡頭停下的回呼（:192-215）、FoodPin、PinBurst（4.F，:190 的 spot.at 那行保留），都沒碰藍點，不衝突；它 5.1 要在 continuous 回呼底下找 pinFrame、BurstSpot.at 的樣本，這項刪掉 dot.refresh() 後那個回呼少一個呼叫，量測基準要用同一版。fix-v11-acd4471.md（RowHold）只改 TripPanel，不重疊。
