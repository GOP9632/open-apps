# 第 2 輪第 2 批　P2：地圖首頁、抽一間、店家頁

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 12 項：U06 群組地圖時搜尋框被擠到幾乎沒寬度，打字看不到字、U07 選到的店被篩掉後大卡消失，其他圖釘卻一直半透明、U08 關掉大卡後，地圖自己飛回很久以前捲到的那張卡、U09 篩選或搜尋沒結果時，面板寫「還沒有收藏・按右上角＋新增第一間」、U10 搜尋結果只列目前鏡頭內的店，地圖不會帶你去看符合的店、U11 抽中的店在泡泡裡時，光圈打在泡泡上，圖釘晚半秒才冒出來、U12 座標完全相同的幾間店永遠是泡泡，點了也拆不開、U14 最低段只是中間段裁剩一行：選到店時沒店名、抽過兩間後那行拉不動、空帳號拖一下大卡被裁、U16 打字時面板被鍵盤頂上來，地圖只剩一條，面板下方還空 82pt、U17 長按圖釘選單和抽一間的暗底蓋不住分頁列，「看店家」可能被擋、U46 轉盤靠 Task.sleep(8ms) 推角度，沒對齊螢幕刷新，轉起來一頓一頓、U47 轉盤拖住不動再放開還會自己轉，用力甩會轉十幾秒

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是對照 a10704d 重新整理、再由反方檢查過的：這批裡（或跟第 1 到 5 批其他項）有兩項以上改到同一段程式、照各項寫法依序套會打架的地方，以及跟 V11、perf-round1b、perf-round1c 重疊的地方。同一組衝突只在最後做到的那批寫完整寫法，前面那批留一條短的，說先守住什麼。行號是 a10704d 的。

各項內文已經吸收了舊的合併注意。內文裡還看得到的「第 N 批合 K」「合 N」是舊編號，已經作廢，內容都併進這裡了，不用回頭找。合併做法裡寫「某項的某句改成……」的，做的時候就照改過的那句。各項內文跟這裡衝突時照這裡。

### 合1　U06、U16、U10

**位置**：Theme.swift:109-130（SearchField）、MapTab.swift:334-338（首頁 SearchField 呼叫）

**問題**：三項都改這兩段。U16 修法 (2) 和 U10 修法 4 已經寫好合併版，可是 U06 的修法和注意完全沒提到 U16、U10。如果有人先照 U16「只做這一項」的寫法做，之後再照 U06 字面把 SearchField 整個換成 U06 的版本，begin 參數和 U16 掛在 TextField 上的手勢會一起被刪掉，點搜尋框時面板不會降段；首頁呼叫照 U06 只改 lead 那一行還好，但 U06 給的 SearchField 沒有 begin，呼叫裡的 begin: beginTyping 會編不過。（反方更正：原 note 想的情境是先照 U16「只做這一項」再照 U06 整段換，可是批內順序是 U06 在前、U16 在後，U16 修法 (2) 也已經寫好「先 U06 再這項」的合併版，照順序做不會出現 begin 編不過或手勢被刪掉。真正會出事的是夾在中間的 U10：批內順序是 U06、U07、U08、U09、U10、U11、U12、U14、U16。U10 修法 4 那句「如果同批 U06、U16 先做……不要加兩次」以為 U16 會比它早做，其實做 U10 時 U16 還沒做，所以 U10 會照常在 MapTab.swift:338 的 .padding(.horizontal, 16) 後面加一行 onSubmit。之後做 U16 時，修法 (2) 叫你把「MapTab.swift:318-322」（3fc00de 行號，換到 a10704d 是 :334-338）換成帶 onSubmit 的合併版，這五行不包含 U10 剛加的那一行，照字面換完會掛兩個 .onSubmit(of: .text)。編得過，但按一次搜尋鍵 frameShown 可能跑兩次，浮層多一筆「框搜尋結果」，U10 驗收 (2) 會看起來怪。U06 的注意完全沒提 U10、U16 這點倒是對的。）

**合併做法**：

照批內順序做。做 U06 時照它自己的修法：Theme.swift:109-130 的 SearchField 換成 U06 的版本，MapTab.swift:335 的 lead 換成 `{ busy in AnyView(scopePill(gname, compact: busy)) }` 閉包。做 U10 時，照它修法 4 在 MapTab.swift:338 的 .padding(.horizontal, 16) 後面加 `.onSubmit(of: .text) { if !store.mapF.q.isEmpty { frameShown() } }`，這時 U16 還沒做，U10 修法 4 最後那句不適用。做 U16 時，SearchField 照它修法 (2) 的合併版整段換：TextField 只留一個 simultaneousGesture，同一個點擊裡先設 typing 再呼叫 begin?()。首頁呼叫要從 MapTab.swift:334 一路換到 U10 加的那行 onSubmit（原本 :338 的下一行）為止，換完整段只能有一個 .onSubmit(of: .text)，不要只換 U16 寫的那五行。U06 的注意請補一句：「同批 U10 會在這個呼叫的 .padding 後面加 onSubmit，U16 會接著改 SearchField 和這個呼叫，到時照 U16 修法 (2) 的合併版做，不要再照這裡的 SearchField 整段換。」U10 修法 4 最後那句改成：「U16 在這項之後做，到時照 U16 修法 (2) 把整個呼叫連這行 onSubmit 一起換掉，onSubmit 只留一個。」

### 合2　U09、U10、U12、perf-round1c

**位置**：MapTab.swift:65、:358（NearbyHost 呼叫）、:1047-1064（NearbyHost，body 在 :1060-1064）、:1078-1110（Nearby）、:1123（NearbySheet 的 focus）、:1339-1342（titleRow）

**問題**：U10 和 U12 已經把三項的合併版寫進各自的修法，但還有三個洞。第一，U09 自己的修法 1 到 4 還是 acd4471 時的完整寫法，批內照 U09、U10 的順序套，U09 先在 NearbyHost 加 base、inGroup、filter，U10 修法 2 又叫你在 let total 下面加同樣三個欄位，會變成重複宣告編不過；U09 的 cond 也沒處理 -noEmoji 時 emoji 是空字串，U10 的版本才有。第二，a10704d 的 NearbyHost.body 多了一行 `let _ = Perf.shared.note("附近重算")`（:1062，perf-round1c 2.2 的量測記號），U10 修法 2「:1044-1047 的 body 換成」給的程式只有 signpost 和 content 兩行，U09 給的更是只剩 content，照字面整段換會把這行刪掉，量測 build 的 Console 就看不到「附近重算」；U12 第 4 點只改 content 那一行，不會刪。第三，U09 自己的驗收 (2) 還寫搜尋沒結果時標題是「沒有符合的店」，跟 U10 (3) 的「找不到「…」」衝突，U10、U12 都說要改，U09 本身沒改。（反方更正：三個洞都成立。U09 的修法還是 acd4471 時的完整寫法，U10 修法 2 又加同樣三個欄位，所以會重複宣告。U10 修法 2 給的 body 只有 signpost 和 content，會把 a10704d:1062 的 Perf.shared.note("附近重算") 刪掉。U09 驗收 (2) 跟 U10 (3) 也確實衝突。不過 resolution 給的 NearbyHost.body 直接寫了 `only: seen.only`，這要等 U12 第 1 點在 SeenBox 加了 only、第 3 點讓 Nearby.init 有 only 參數之後才編得過。resolution 只叫你補 U12 第 3 到 5 點，沒有提到第 1 點，而且批內 U10 和 U12 中間還隔著 U11。照它的程式在做 U10 時一次貼上，會編不過（SeenBox 沒有 only）。另外 issue 裡引用的「:1044-1047」是 3fc00de 的行號，a10704d 是 :1060-1064。）

**合併做法**：

U09 的修法 1 到 4 不要單獨照做，直接照 U10 修法 1 到 7 一次貼（裡面已經有 U09 的 base、inGroup、filter、clear、cond 和清除篩選鈕，cond 也處理了 -noEmoji 時 emoji 是空字串）。NearbyHost.body（MapTab.swift:1060-1064）做 U10 時只改 :1063 那一行，:1061 的 signpost 和 :1062 的 note 都不要動：
```swift
    var body: some View {
        let _ = Perf.signposter.emitEvent("附近重算")
        let _ = Perf.shared.note("附近重算")      // a10704d 已經有（perf-round1c 2.2），留著
        content(Nearby(list: list, here: store.here, region: visible, total: total, base: base, inGroup: inGroup, filter: filter))
    }
```
做到 U12 時，先照它第 1 點在 SeenBox 加 only、zoomed，第 2 點換 zoom()，再照第 3 到 5 點「跟 U09、U10 一起做時」的寫法補 isOnly、only 分支、endOnly 和 ✕。這時才在 :1063 的 content(Nearby(...)) 最後補 `, only: seen.only`，同樣只動這一行。最後把 U10 修法 5 frameShown 開頭那兩行註解打開（U12 第 6(d) 點）。U09 只留它的驗收，(2) 改成照 U10 (3)：標題寫「找不到「那串字」」、小字「換個字試試」、右邊有清除篩選。U10 修法 2 的 body 範例請補上 note 那一行，或改成「只改 content 那一行」。

### 合3　U46

**位置**：Draw.swift:763（spinRandom 的 `let start = angle, dur = reduce ? 0.6 : 2.5`）

**問題**：舊的合5 還成立。U46 第 3 點新增的方法叫 start(_:)，第 4 點只叫你把 spinRandom 的 run = Task 迴圈（:764-774）換成 start(Spin(...))，沒提到上一行 :763。spinRandom 裡的區域常數 start 是 Double，會遮住同名的方法，start(Spin(...)) 編不過（cannot call value of non-function type 'Double'）。U47 不碰 spinRandom，只有 U46 自己會撞。

**合併做法**：

做 U46 第 4 點時，:763 一起改成 `let dur = reduce ? 0.6 : 2.5`（起點已經用 from: angle 傳進 Spin，不需要 start 這個常數）。spinRandom 改完是：
```swift
    private func spinRandom() {
        guard won == nil, spin == nil, !places.isEmpty else { return }
        run?.cancel()
        let w = Drawer.shared.pick(store, places, k: 1).first.flatMap { p in places.firstIndex { $0.id == p.id } } ?? Int.random(in: 0..<places.count)
        let target = -(Double(w) + 0.5 + Double.random(in: -0.3...0.3)) * seg
        var d = (target - angle).truncatingRemainder(dividingBy: 2 * .pi)
        if d < 0 { d += 2 * .pi }
        let total = d + 2 * .pi * Double(Int.random(in: 2...3))
        let dur = reduce ? 0.6 : 2.5
        start(Spin(from: angle, total: total, t0: Self.now(), dur: dur, cubic: true))
    }
```
不想動 :763 的話，就把 U46 第 3 點的方法改名成 runSpin(_:)，coast 裡的呼叫跟著改。

### 合4　U09、U10、U59（第 4 批）

**位置**：MapTab.swift:65（U10 拆成 :65 base、:66 all）、MapTab.swift:358（NearbyHost 呼叫）

**問題**：第 4 批 U59 會把 MapTab 讀共用篩選的地方換成它自己的 @State applied。U59 本文以為 U09 比它晚做，叫 U09 給 NearbyHost 加 filter 參數時一開始就傳 applied；可是第 2 批先做，這時 applied 還不存在。這組衝突的完整寫法放在第 4 批，因為做到 U59 的時候 U09、U10 都已經做好了。

**合併做法**：

做 U10 時照它的修法寫：:65 拆成 `let base = store.mapBase` 和 `let all = store.shown(store.mapF, in: base)`，:358 的 NearbyHost 呼叫傳 `filter: store.mapF`。不要為了配合 U59 先寫 applied（還沒宣告，會編不過），也不要在 MapTab 加 `private var filter: Filter { … }` 這種計算屬性。第 4 批做 U59 時再把這兩處換成 applied，完整寫法見第 4 批的合併注意，U59、U09 和 U10 那條。

### 合5　U10、U55（第 5 批）、U59（第 4 批）

**位置**：MapTab.swift:65-66（U10 拆出的 base、all）

**問題**：第 5 批 U55 第 (6) 點（選做）要把 MapTab.body 的 all 和 list 做成快取，那時第 4 批 U59 已經把篩選換成 applied。這組衝突的完整寫法放在第 5 批，因為做到 U55 的時候 U10、U59 都已經做好了。這批要先知道的只有 U10 拆出來的 base 那一行之後還要用。

**合併做法**：

U10 拆出來的 `let base = store.mapBase` 要一直留在 MapTab.body 裡，之後不管做不做快取都不要搬走：MapTab 靠 body 讀這一行，收藏或群組分享改變時才會重算，NearbyHost 的 base 也用它的 count。完整寫法見第 5 批的合併注意，U55、U59、U09 和 U10 那條。

### 合6　U12、U13（第 5 批）

**位置**：MapTab.swift:473-474（.onChange(of: trip.on) 的 else 分支）；batch2.md 裡 U12 的修法 6(c) 和注意

**問題**：U12 的修法 6(c) 和注意都說 perf 4.E 正式採用時，要在 MapTab.swift:474 的 else 分支加 nearTask?.cancel()。第 5 批 U13 決定不加：量測分支的 nearTask 裡有 recluster(proxy)，取消會連泡泡重組一起丟掉。U12 比 U13 早做，從第 2 批看不到這件事。

**合併做法**：

U12 第 6(c) 點換掉 MapTab.swift:474 那行時，else 分支不加 nearTask?.cancel()，U12 注意裡叫你在 4.E 採用時加 cancel 的那句不要照做。U12 注意裡的「（第 2 批合2）」指的是這批的合併注意，U09、U10、U12 和 perf-round1c 那條；「U10 的 frameShown 要加列出模式的退出（第 2 批合3）」照 U12 第 6(d) 點做，U10 修法 5 frameShown 註解裡的「合併注意 合3」也是指 U12 第 6(d) 點。完整理由見第 5 批的合併注意，U13、U12 和 perf-round1c.md 5.E 那條。

### 行號更正（a10704d）

- U09：修法 2「:982-984 的 == 換成」（acd4471），想指 NearbyHost 的 == 函式。正確：MapTab.swift:1056-1058（acd4471 是 :981-983；照 982-984 換會留下一行重複的函式開頭）
- U09：修法 2「:986-988 的 body 換成」（acd4471），想指 NearbyHost.body。正確：MapTab.swift:1060-1064（acd4471 是 :985-987；a10704d 的 body 多了 :1061 signpost 和 :1062 Perf.shared.note 兩行，只改 :1063 的 content）
- U09：修法 3「Nearby（MapTab.swift:1001-1035）」和「在 Nearby 的 init 後面（:1034 的 } 之前）加 cond」（acd4471），想指 Nearby struct 的結尾。正確：Nearby 是 MapTab.swift:1078-1110，init 在 :1109 結束，cond 加在 :1110 的右括號前面（:1112 起已經是 NearbySheet 的註解）
- U09：注意「首頁最高段清單（:1227）也用 ListPullDown」（acd4471）。正確：MapTab.swift:1306（.background(ListPullDown(name: "首頁", ...))；acd4471 是 :1228）
- U11：注意「在 MapTab.swift:631-633」和「4.B 改的是 :631-633」（3fc00de），想指 picked() 裡 -noReelWarm、-reelNow、850ms 預載那三行。正確：3fc00de 是 :633-635，a10704d 是 MapTab.swift:649-651。perf-round1c 5.B（Anthony 還沒決定）改的就是這三行和 :648 的註解，都在 U11 插入點 :642 之後，不衝突
- U11：現況「:634-639 直接放光圈」和修法 2「光圈畫在店的座標上（:634-639）」（3fc00de）。正確：3fc00de 是 :637-642，a10704d 是 MapTab.swift:653-658（if !reduce { spot.coord … spot.shot += 1 }）
- U12：修法 6(c)「MapTab.swift:148 現在已經有 nearTask」（3fc00de），:148 其實是站號的 accessibilityLabel。正確：nearTask 宣告在 MapTab.swift:22，-landDefer、-landDeferList 用它的地方在 :228-229、:244-245

## 各項

### U06（P2・錯誤）群組地圖時搜尋框被擠到幾乎沒寬度，打字看不到字

**畫面**：地圖首頁搜尋列，看群組收藏時（iPhone SE／mini 最嚴重）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：scopePill 用 fixedSize 塞進 SearchField 的 lead（頭像、5 字群組名、▾、✕）。393 寬時輸入框約剩 47pt，375 寬約剩 29pt，打字完全看不到；內容還可能把＋推出框。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MapTab.swift:248-249 仍把 scopePill 當 lead 塞進 SearchField；scopePill（MapTab.swift:804-838）還是頭像最多 3 個、群組名、▾、32pt 寬的 ✕，最後 .fixedSize()；MapTab.swift:841 的 short() 仍是 5 個字。Theme.swift:109-130 的 SearchField 有 lead 時照樣放放大鏡，打字後再多一顆 44pt 的清除鈕，加上 AddButton，窄螢幕輸入框幾乎沒寬度。4a05adb 改的「頭像疊固定寬」是 GroupsTab 的 GroupCard，不是這顆膠囊。

**修法**：

保留 A1 的預設樣子，只在正在打字時收小。打字狀態放在 SearchField 自己裡面，不要放 MapTab 的 @State（會讓整張地圖分頁重算，5b5355c 才剛把這種重算拿掉），也不要用 @FocusState（safeAreaInset 裡收不到焦點變化）。做法照 TripTop.swift:270 的 simultaneousGesture(TapGesture) 和 TripTop.swift:55 的 keyboardWillHide。
Theme.swift:109-130 的 SearchField 改成：
```swift
var lead: ((Bool) -> AnyView)? = nil   // 參數：正在打字
@ViewBuilder var trailing: () -> Trailing
@State private var typing = false
var body: some View {
    let busy = typing || !text.isEmpty
    HStack(spacing: 10) {
        if let lead { lead(busy) } else { Image(systemName: "magnifyingglass").foregroundStyle(.secondary) }
        TextField(prompt, text: $text).font(.body).submitLabel(.search)
            .simultaneousGesture(TapGesture().onEnded { if !typing { withAnimation(.snappy) { typing = true } } })
        // 清除鈕、trailing() 照舊
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
        if typing { withAnimation(.snappy) { typing = false } }
    }
    // padding、frame、candy 照舊
}
```
有 lead 時就不放放大鏡。ListTab.swift:54 沒用 lead，不受影響。MapTab.swift:249 改成 `lead: store.groups.isEmpty ? nil : { busy in AnyView(scopePill(gname, compact: busy)) }`。scopePill 加 compact 參數：compact 且 store.mapGroup != nil 時，頭像只放 prefix(2)、不放群組名 Text，✕ 那顆換成 Color.clear.frame(width: 8)（右邊已有清除鈕），accessibilityLabel 不變。MapTab.swift:841 的 short() 改成 4 個字。窄螢幕想更保險可以在非打字時用 ViewThatFits 退成「頭像＋▾＋✕」。粗算 SE（375 寬）打字時：框內 329 扣掉收小的膠囊約 70、清除鈕 44、＋ 44 和三個間距，輸入框約 140pt，≥ 120 的驗收做得到。

**模擬器驗收**：iPhone SE（第 3 代）模擬器切到測試群組的地圖，點搜尋框時膠囊在同一幀縮成兩個頭像加 ▾、✕ 消失；打 6 個中文字，字都看得到、＋沒被推出框（PerfHUD 或 Accessibility Inspector 量輸入框寬 ≥ 120pt）。收鍵盤後清空文字，膠囊回到頭像、4 字群組名、▾、✕ 的樣子。iPhone 16 再做一次。也確認「我的收藏」（沒選群組）時搜尋框長相跟 ec71aa2 一樣。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊：那份改的是行程模式的 Map selection、blankTap 和 TripPanel，這裡只動首頁搜尋列（行程模式時它是 opacity 0）。這裡只是照抄 TripTop 的打字偵測寫法，不碰 TripTop 本身，也不碰 trip.pickAt。同批 U07 會在搜尋文字把選到的店篩掉時取消選取，兩者行為一致，沒有衝突。

### U07（P2・錯誤）選到的店被篩掉後大卡消失，其他圖釘卻一直半透明

**畫面**：地圖首頁：大卡開著時點分類 chip 或打搜尋字

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：NearbySheet 用 pins.sel 去 list 找 picked，找不到就換回卡片列，但 pins.sel 沒清掉。FoodPin 的 faded 讓剩下的圖釘一直維持 50% 透明。清掉篩選後，大卡又會自己跳回來。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：acd4471 到 3fc00de 的 8 個 commit 都沒有碰這條路，問題還在。NearbySheet 在 MapTab.swift:1137 還是拿 pins.sel 去 list 找 picked，找不到就顯示卡片列，但 pins.sel 沒有清掉。MapTab.swift:242 的 .onChange(of: list.map(\.id)) 還是只做 recluster(proxy)。「不認得的選取就取消」在 picked() 的 MapTab.swift:621-623，只在 pins.sel 改變時由 SelWatcher（MapTab.swift:1681）呼叫，篩選或搜尋字改了不會觸發。FoodPin 在 MapTab.swift:1743 用 pins.sel != nil 算 faded，MapTab.swift:1783 依它把其他圖釘設成 0.5 透明，所以剩下的圖釘一直半透明，清掉篩選後大卡又會冒回來。Map selection setter 的行程分支（MapTab.swift:90-106，其中 :96-100 是「不是地圖上的收藏也不是搜尋結果就不選」）只管行程模式、只擋 MapKit 送進來的選取，非行程模式在 :107 直接 pins.select(id)。最近幾個 commit 在 MapTab 動的是：52a0b69 的量測參數（:22 nearTask、:196-237 鏡頭停下回呼裡的 midAir、-noMidStop、-landDefer，:796 recluster 的 signpost）、8559c3d 的 pins.moving（:187、:1573-1575、:1638），e7af2e1、3fc00de 的復原訊息條和拿掉一天只改 FoodMapApp、Store、Trip、TripTop、TripPanel，跟這項都沒有關係。

**修法**：

只改一行，在 MapTab.swift:242。把這一行：
```swift
                .onChange(of: list.map(\.id)) { recluster(proxy) }
```
換成：
```swift
                .onChange(of: list.map(\.id)) { _, ids in
                    recluster(proxy)
                    // 選到的店被篩選或搜尋字篩掉：取消選取，大卡收起、其他圖釘恢復不透明
                    // 行程模式不管：那時的 sel 是加站卡在用，可能是 hit: 開頭的搜尋點，或 extraFound 裡不在 list 的店
                    if !trip.on, let s = pins.sel, !s.hasPrefix("hit:"), !ids.contains(s) { pins.select(nil) }
                }
```
說明：行程模式的不明選取已經由 MapTab.swift:96-100 處理，這裡用 !trip.on 守著，不會把加站卡收掉。抽中被篩掉的店（pins.extra）由 withExtra（MapTab.swift:53-57）併進 list，所以不會被誤清；reveal（MapTab.swift:569-571）先設 extra 再 select，list 先帶到那間，onChange 看到的 ids 已經有它。取消後 SelWatcher（MapTab.swift:1681）會呼叫 picked(nil)，非行程模式在 MapTab.swift:621-623 直接 return，不會多移地圖。PinState.select（MapTab.swift:1660-1667）在 nil 時會把 cleared 加一，MapTab 跟著重算一次，這是原本點空白關卡就會走的路，沒有多的成本。FoodPin 不用改。
要一起做的：同批的 U08。這項取消選取後卡片列會重新掛上，沒有 U08 的話，這條路也會讓地圖飛回很久以前捲到的那張卡。U08 不用等這項，這項最好跟 U08 同一次進。

**模擬器驗收**：在一般地圖（不在行程裡）測，開 PerfHUD 浮層。(1) 點一根咖啡店圖釘開大卡，再點「甜點」chip：大卡收起、換回卡片列，剩下的圖釘恢復不透明；再點「全部」清掉篩選，大卡不會自己跳回來。(2) 大卡開著時在搜尋框打一個不符合那間店的字，大卡一樣收起；刪掉字後大卡不會回來。(3) 長按 🎲 設成「一間」，抽中一間被目前篩選篩掉的店（可以用啟動參數 -drawWin 加那間的 id 固定抽中），大卡要留著，那根圖釘也要在；接著再點一個別的分類 chip，大卡還是留著。(4) 大卡開著時從店家頁把那間店刪掉（有復原的那條訊息條），回到地圖時大卡要收起、圖釘不透明；按復原後店回來，但大卡不會自己再開。(5) 回歸：進行程模式點收藏圖釘出加站卡，切篩選或打搜尋字，加站卡不能被收掉；行程搜尋點搜尋結果出加站卡，切篩選也不能收掉。(6) 回歸：兩指縮放後放開在圖釘上，不能當成點圖釘（8559c3d 的行為），也不能因為這項多出取消選取。

**注意**：跟同批（第 2 批）的 U08 要一起做，理由寫在修法裡。跟同批 U10 有互動但不衝突：搜尋字改了 list 會跟著變，打一個不符合大卡那間的字就會觸發這項收卡，這是 U10 和這項都想要的；U10 的 frameShown 只移鏡頭，不改 list。跟同批 U12 不衝突，篩選拿掉列出模式裡的店時，Nearby 會自己退回一般清單。perf-round1b 的量測 build 已經由 52a0b69 做進 3fc00de，-landDefer 和 nearTask 在鏡頭停下回呼的 MapTab.swift:224-237，跟 :242 只是相鄰，nearTask 裡的 recluster 不會改 list，兩邊不會互相觸發。fix-addcard-ec71aa2.md 早就在 acd4471，它改的是 MapTab.swift:86-107 的 selection setter 和 MapTab.swift:278-286 的 onChange(of: trip.cand?.id)，這項有 !trip.on 守著，不會互相觸發。fix-v11-acd4471.md 的 RowHold 已經由 8559c3d、9379b88 做進來，只動 TripPanel.swift、RowHold.swift、PanelLift.swift，MapTab 只多了 pins.moving，跟這項沒有重疊。merge_notes 沒有這項的條目。

### U08（P2・錯誤）關掉大卡後，地圖自己飛回很久以前捲到的那張卡

**畫面**：地圖首頁：滑卡片列 → 拖地圖到別區 → 點圖釘 → 點空白處關卡

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：卡片列 ScrollView 只在沒選店時存在，重新掛上時 .task(id: scrolled) 會用舊值再 focus 一次，地圖被拉回舊位置。會觸發的路徑：點地圖空白處關卡、切換群組（:352）、行程加站卡關掉（:1312）、從卡片列進店家頁再返回。從一根圖釘換到另一根不會觸發。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：NearbySheet 的卡片列在 acd4471 到 3fc00de 之間沒有改（52a0b69 只動了 MapTab.swift:1195-1196 面板陰影的 -noPanelShadow），問題還在。卡片列的 ScrollView 只在沒選店時才建（MapTab.swift:1224 的 if let p = picked 的 else 分支，ScrollView 在 :1239-1257），scrolled 和 skip 還是 NearbySheet 的 @State（MapTab.swift:1111-1112），重新掛上時 .task(id: scrolled)（MapTab.swift:1252-1257）會用舊的 scrolled 再跑一次 focus。focus（MapTab.swift:925-940）的 guard pins.sel == nil, !trip.on（:926）在關大卡之後擋不住，因為 sel 已經是 nil；它只在圖釘跑出可見範圍時才移地圖（:933），所以「拖到別區再關卡」還是會飛回去。會觸發的路：點地圖空白處關卡（一般地圖的 selection setter 在 MapTab.swift:107 直接 pins.select(id) 收到 nil）、切群組（MapTab.swift:449）、從卡片列進店家頁再返回（.task 會重跑）、拖到沒有店的地方（near.places 變空，:1238 把 ScrollView 拿掉）再拖回來。行程加站卡關掉那條不會觸發，因為行程模式時 picked 一律是 nil（:1137）。關大卡時的 skip 寫在 MapTab.swift:1227。8559c3d、9379b88 的站卡手勢只改 TripPanel、RowHold、PanelLift，PanelLift 的 TouchSpy（PanelLift.swift:202-257，只在 DEBUG）掛在 ListPullDown.attach，首頁只有最高段直的清單（MapTab.swift:1289）用 ListPullDown，不是這裡橫的卡片列。

**修法**：

全部改在 NearbySheet（MapTab.swift），不用等別項。

1. MapTab.swift:1111-1112 這兩行：
```swift
    @State private var scrolled: String?      // 卡片列停在哪一間
    @State private var skip: String?          // 自己捲過去的（關掉大卡），不用再移地圖
```
換成：
```swift
    @State private var scrolled: String?      // 卡片列停在哪一間
    @State private var cards = CardScroll()   // 卡片列：上次對過去的那間、手指有沒有在捲（不觀察，改了不重畫面板）
```

2. 在 PanelProbe（MapTab.swift:1409-1411）後面加一個不觀察的小類別：
```swift
// 卡片列的手指狀態：只有手指捲停的那張才移地圖（重新掛上、換清單時 SwiftUI 自己改 scrolled 不算）
private final class CardScroll {
    var focused: String?                 // 上一次已經讓地圖對過去的那間（關大卡自己捲過去的也算）
    var finger = false                   // 手指正在捲，或甩出去還在滑
    var fingerAt: CFTimeInterval = 0     // 手指最後一次捲的時間（放開、停下那一刻也算）
}
```

3. MapTab.swift:1227 關大卡的那行：
```swift
                    skip = p.id; scrolled = p.id
```
改成：
```swift
                    cards.focused = p.id; scrolled = p.id
```

4. MapTab.swift:1248-1257 這段：
```swift
                        .scrollTargetBehavior(.viewAligned)
                        .scrollPosition(id: $scrolled, anchor: .leading)
                        .frame(height: 112)
                        // 停在某張 0.25 秒：那根圖釘跳一下、地圖移過去
                        .task(id: scrolled) {
                            guard let id = scrolled else { return }
                            if id == skip { skip = nil; return }
                            try? await Task.sleep(for: .milliseconds(250))
                            if !Task.isCancelled { focus(id) }
                        }
```
換成下面這段。第 5 批 U19、第 7 批 U77 要加的那兩行，位置已經留好（合併注意 合10）：
```swift
                        .scrollTargetBehavior(.viewAligned)
                        .scrollPosition(id: $scrolled, anchor: .leading)
                        // 只有手指捲過才算；停下來那一刻也記（viewAligned 對齊時 scrolled 跟 phase 會同時變）
                        // 程式自己捲（關大卡、重新掛上）不是 interacting 或 decelerating，不算
                        .onScrollPhaseChange { old, ph in
                            let f = ph == .interacting || ph == .decelerating
                            // 手指重新開始捲：停回同一張也要對過去
                            if ph == .interacting && old != .interacting && old != .decelerating { cards.focused = nil }
                            if f || old == .interacting || old == .decelerating { cards.fingerAt = CACurrentMediaTime() }
                            cards.finger = f
                        }
                        .frame(height: 112)
                        // 第 5 批 U19：.accessibilityHidden(mp.stage == .low) 接在這裡
                        // 第 7 批 U77：.simultaneousGesture(cardPull) 接在這裡（做之前先看 conflicts 裡 9379b88 的提醒）
                        // 手指捲停在某張 0.25 秒：那根圖釘跳一下、地圖移過去
                        .task(id: scrolled) {
                            guard let id = scrolled, id != cards.focused else { return }
                            try? await Task.sleep(for: .milliseconds(250))
                            guard !Task.isCancelled, cards.finger || CACurrentMediaTime() - cards.fingerAt < 1.0 else { return }
                            cards.focused = id
                            focus(id)
                        }
```
如果 U19 或 U77 比這項先做，做這項時要把它們加在 .frame(height: 112) 後面的那一行搬進新版同一個位置，不要整段貼上把它們刪掉。

為什麼這樣寫：focused 和 fingerAt 放在不觀察的 CardScroll，跟 PanelProbe 同一種寫法，捲動換階段不會讓整個 NearbySheet 重算（MapTab.swift:1134 的 Perf 計數「附近面板」不會變多）。除了「最後一次換階段離現在不到 1 秒」，還多看 cards.finger，手指按著慢慢拖超過 1 秒、中途 scrolled 改了的情況也不會漏。MapTab.swift:1298 那個 onScrollPhaseChange 是最高段直的清單，不要動，新的這個掛在橫的卡片列上。focus（MapTab.swift:925-940）不用改，:926 的 guard 留著。onScrollPhaseChange 的兩個參數版本 iOS 18 就有，CACurrentMediaTime 這個檔案本來就在用。

**模擬器驗收**：開 PerfHUD 浮層，在一般地圖（不在行程裡）測。(1) 卡片列用手指滑到第 3 張，等地圖對過去（浮層有「卡片列移地圖」或那根跳一下），把地圖拖到別區，點一根圖釘開大卡，再點地圖空白處關卡：地圖不動，浮層 2 秒內不能多一筆「卡片列移地圖」。(2) 同樣滑到第 3 張後拖走地圖，點卡片列的一張進店家頁再返回，地圖不動。(3) 滑到第 3 張後拖走地圖，切到別的群組再切回來，地圖只做 fit，不能再跳回第 3 張。(4) 滑到第 3 張後把地圖拖到沒有收藏的地方（面板寫「這一帶沒有收藏」），再拖回有店的另一區，地圖不能自己跳回第 3 張。(5) 跟 U07 一起驗：滑到第 3 張後拖走地圖，點一根咖啡店圖釘開大卡，再點「甜點」chip 讓大卡被篩掉收起，地圖不能飛回第 3 張。(6) 回歸：手指滑卡片列停在一張圖釘在畫面外的店，0.25 秒後地圖照舊平移過去；手指按著慢慢拖超過 1 秒再放開，停下的那張也要對過去；大卡按 ✕ 關掉後卡片列捲到那間，地圖不動；關卡後再用手指捲走又捲回那間，地圖要對過去。(7) 效能：來回滑卡片列 10 張，浮層「附近面板」的計數跟 3fc00de 比不能明顯變多。

**注意**：跟同批（第 2 批）U07 要一起做，U07 取消選取後卡片列會重新掛上，沒有這項就會多一條飛回舊卡的路。跟同批 U12 有互動：列出模式把卡片列換成「這裡有 N 間」，換清單時 scrolled 被 SwiftUI 改掉，有這項的手指條件就不會移地圖；U12 的退出條件看的是 pos.positionedByUser，focus 是程式移地圖，不會誤觸退出。跟同批 U10 有互動但不衝突：搜尋時卡片列會列出畫面外的店，手指捲到那張時 focus 會把地圖移過去，這是想要的。跟同批 U14 不衝突：U14 改 PickedCard 本體，這項只改 MapTab.swift:1227 傳給 PickedCard 的關卡 closure 和卡片列。第 5 批 U19、第 7 批 U77 都要在 .frame(height: 112) 後面加一行，合法寫在修法第 4 點（合併注意 合10）。第 7 批 U77 還要注意兩件事：9379b88 已經把 PullBox 縮成只有 uikit（PanelLift.swift:36-38），U77 的 cardPull 用到的 swift、decided、atTop 都不在了；而且 9379b88 的結論是 iOS 18 上在清單內容掛 SwiftUI 拖曳會讓清單自己的 pan 開不了（PanelLift.swift:34-35 的註解），U77 掛在橫的卡片列上的 simultaneousGesture 可能讓卡片列左右滑不動，做第 7 批時要重新評估；U77 如果最後不加那一行，這項不受影響。U77 還會在 MapTab.swift:1225 的 PickedCard 呼叫加 bodyPull 參數，跟這項改的 :1227 在同一個呼叫裡，照參數名稱找位置。fix-v11-acd4471.md 的 RowHold 已經由 8559c3d、9379b88 做進來，只動 TripPanel、RowHold、PanelLift，TouchSpy 只掛在首頁最高段直的清單（MapTab.swift:1289），沒有重疊。perf-round1b 的量測 build 已經在 52a0b69：-landDefer 讓降落後的附近清單晚 0.6 秒才換（MapTab.swift:224-237），換清單時 SwiftUI 改 scrolled 不是手指捲，有這項之後不會因此移地圖。fix-addcard-ec71aa2.md 只動行程模式，沒有重疊。

### U09（P2・錯誤）篩選或搜尋沒結果時，面板寫「還沒有收藏・按右上角＋新增第一間」

**畫面**：地圖首頁面板標題（篩選、搜尋、群組沒有店時）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：Nearby 收到的 total 是篩選後的數量。有 50 間收藏、只是選了沒結果的條件，也會說「還沒有收藏」。群組沒有店時也是同一句。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：a45ce70、653c8d1、acd4471 在 MapTab.swift 改的是 selection setter（:84-105）、blankTap 和 pinNear、preferHit（:688-737）、zoom（:848）、PinState 的 tapAt、touch（:1512-1513），都沒碰到這項的程式。MapTab.swift:1006-1012 的 Nearby.init 還是只看 total：list 空的時候 total == 0 就寫「還沒有收藏／按右上角＋新增第一間」。total 是 MapTab.swift:78 的 all.count，而 all（:63）是 store.shown(store.mapF, in: store.mapBase)，已經套過篩選和搜尋字（Store.swift:150-155），所以有 50 間收藏、只是條件沒結果，還是會說「還沒有收藏」，群組沒有店時也一樣。NearbyHost（:972-999）只收 list、total，==（:982-984）也只比 total、headY、mapRect、list。titleRow（:1249-1268）沒有清除篩選鈕，:1262-1264 只有 🎲。最高段沒有店時那塊在 :1210-1219，顯示的是 near.subtitle（原修法寫的 :1130-1138 是自動換算錯了，那裡在 acd4471 是「附近 N 間」數字滾動的 .task）。另外 NearbySheet 的 title（:1321-1327）在群組時會在 near.title 前面加「群組名 · 」。ListTab.swift:71-72 有現成的「沒有符合的店」和「清除篩選」。

**修法**：

1. MapTab.swift:63 那行 `let all = store.shown(store.mapF, in: store.mapBase)` 換成下面兩行，把 mapBase 先存起來：
```swift
let base = store.mapBase
let all = store.shown(store.mapF, in: base)
```
body 裡沒有別的叫 base 的變數（:530 的 base 在另一個函式裡），不會撞名。

2. NearbyHost（MapTab.swift:972-999）在 `let total: Int`（:975）下面加三個欄位，順序要跟 :299 的呼叫一致：
```swift
let base: Int          // 篩選前有幾間（我的收藏或這個群組）
let inGroup: Bool
let filter: Filter
```
:982-984 的 == 換成下面這樣。一定要把新欄位加進來，不然只換條件、清單一直是空的時候，NearbyHost 會整個被跳過，小字不會跟著換：
```swift
nonisolated static func == (a: Self, b: Self) -> Bool {
    a.total == b.total && a.base == b.base && a.inGroup == b.inGroup && a.filter == b.filter
        && a.headY == b.headY && a.mapRect == b.mapRect && a.list == b.list
}
```
:986-988 的 body 換成：
```swift
var body: some View {
    content(Nearby(list: list, here: store.here, region: visible, total: total, base: base, inGroup: inGroup, filter: filter))
}
```
MapTab.swift:299 換成：
```swift
NearbyHost(seen: seenBox, list: list, total: total, base: base.count, inGroup: store.mapGroup != nil, filter: store.mapF, headY: headY, mapRect: mapRect) { near in
```

3. Nearby（MapTab.swift:1001-1035）在 :1004 `var lead` 下面加 `var clear = false    // 篩選或搜尋沒結果：標題那行放「清除篩選」`。:1006-1012 的 init 開頭和 guard 換成下面這段（guard 後面 :1013 起照舊）。判斷順序是先看篩選前有沒有店：群組或帳號本來就沒有店時，按清除篩選也不會有結果，所以 base == 0 要先判斷。群組那句原修法寫「群組裡還沒有店」，但 :1324 會在前面自動加「群組名 · 」，變成「吃貨團 · 群組裡還沒有店」很囉嗦，所以改成「還沒有店」：
```swift
init(list: [Place], here: CLLocation?, region: MKCoordinateRegion?, total: Int, base: Int, inGroup: Bool, filter: Filter) {
    guard !list.isEmpty else {
        if base == 0 && inGroup { title = "還沒有店"; subtitle = "在店家頁按「分享到群組」加進來" }
        else if base == 0 { title = "還沒有收藏"; subtitle = "按右上角＋新增第一間" }
        else if (filter.on || !filter.q.isEmpty) && total == 0 {
            title = "沒有符合的店"; subtitle = Self.cond(filter); clear = true
        } else { title = "地圖上還沒有店"; subtitle = "有地址的店會自己出現在地圖上" }
        short = subtitle
        places = []
        return
    }
```
在 Nearby 的 init 後面（:1034 的 } 之前）加：
```swift
// 目前的條件，例如「✓ 去過・🍜 餐廳・「拉麵」」
static func cond(_ f: Filter) -> String {
    [f.status == "want" ? "♥ 想去" : f.status == "been" ? "✓ 去過" : nil,
     Cat.all[f.cat].map { "\($0.emoji) \($0.name)" },
     f.q.isEmpty ? nil : "「\(f.q)」"].compactMap { $0 }.joined(separator: "・")
}
```
Filter.cat 是 String、Cat.all 是 [String: Cat]（Models.swift:44），f.cat 空字串時查不到，會自動略過。short 設成跟 subtitle 一樣，titleRow 的 ViewThatFits（:1255-1259）放不下就整個不顯示，不會出現「…」。

4. titleRow（MapTab.swift:1262-1264）的 🎲 那格換成下面這段。清單空的時候 🎲 本來就不顯示，位置是空的：
```swift
if let draw, !list.isEmpty {
    DiceChip(draw: draw, panel: panel)
} else if near.clear {
    Button { Haptic.light(); withAnimation(.snappy) { store.mapF = Filter() } } label: {
        Text("清除篩選").font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
            .padding(.horizontal, 12).frame(height: 36).background(Color.accent.opacity(0.13), in: .capsule)
            .frame(minHeight: 44).contentShape(.rect)
    }
    .buttonStyle(PressStyle())
}
```
動作跟 ListTab.swift:72 一樣（Store.swift:104-107 的 listF 就是 mapF）。最高段沒有店時那塊（:1210-1219）顯示 near.subtitle，也就是目前的條件，不用另外改。🎲 的隱藏邏輯不改。

**模擬器驗收**：(1) 有收藏的帳號在地圖首頁點「✓ 去過」，再點一個沒有店的分類，確認面板標題寫「沒有符合的店」，小字是目前條件，右邊有「清除篩選」；按下去條件清掉、卡片列回來。拉到最高段也看得到條件那行。(2) 搜尋框打一串對不到的字，同樣出現「沒有符合的店」和清除鈕，小字有「「那串字」」。(3) 切到一個沒有店的群組，標題是「群組名 · 還沒有店」，沒有清除鈕。(4) 新帳號照舊是「收藏第一間店」那張卡（MapTab.swift:1173），拉到最高段是「還沒有收藏」。(5) 篩選中只換條件、清單一直是空的（例如從一個沒店的分類換到另一個沒店的分類），小字要跟著換，用來確認 NearbyHost 的 == 有加新欄位。(6) 收藏全部沒有地址但沒開篩選時，還是寫「地圖上還沒有店」。

**注意**：跟 U10、U12 改的是同一個 Nearby.init、NearbyHost 和 titleRow 的同一格，建議三項一起做，一次把 Nearby 的參數加齊（base、inGroup、filter、only）；U10 的「找不到「q」」就是這裡 filtered 分支在 q 不空時的文案，兩邊要合成一個分支。perf-round1b.md 第 101 行要在 NearbyHost.body 開頭加 `let _ = Perf.signposter.emitEvent("附近重算")`（它寫的 :905 是舊行號，acd4471 是 :986），合的時候那行放在 body 第一行，下面接這裡改過的 content(Nearby(...))。fix-v11-acd4471.md 的 TouchSpy 掛在 ListPullDown.attach，首頁最高段清單（:1227）也用 ListPullDown，但這項沒動那段，不衝突。a45ce70 到 acd4471 改的 MapTab 區塊都不在這裡。若同時做 U122，這裡新加的清除篩選鈕的 frame(height: 36) 可以一起改成 minHeight，跟 Chip 一致。

### U10（P2・體驗）搜尋結果只列目前鏡頭內的店，地圖不會帶你去看符合的店

**畫面**：地圖首頁：搜尋列打店名

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：Nearby 永遠只算 seen() 範圍內。人在台南搜台北的店，面板只說「這一帶沒有收藏」，符合的圖釘在畫面外。完全對不到時還會說「還沒有收藏」。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：acd4471 到 3fc00de 都沒有碰這一塊，問題還在，而且它依賴的 U09 也還沒做。Nearby.init 在 MapTab.swift:1066-1092，參數還是 (list, here, region, total)，:1079 一律 list.filter(inView)，搜尋字不空也只算鏡頭內，結果就是「這一帶沒有收藏」；完全對不到時落到 :1067-1071，寫「還沒有收藏」。region 來自 NearbyHost.visible（MapTab.swift:1050-1058）。NearbyHost 在 MapTab.swift:1031-1059，== 在 :1040-1042，body 在 :1044-1047，其中 :1045 的 Perf.signposter.emitEvent("附近重算") 是 52a0b69 加的（perf-round1b 那行已經進來）。呼叫在 MapTab.swift:342，total 是 :80 的 all.count，all 在 :65。首頁搜尋框是 MapTab.swift:318-322 的 SearchField，Theme.swift:119 的 TextField 只有 .submitLabel(.search)，按 return 沒有任何動作。bounds 在 MapTab.swift:1007-1012，aim() 在 :691-701，MapPanel.go 在 MapPanel.swift:29-33（同步改 stage，aim 馬上看得到中段）。titleRow 在 MapTab.swift:1310-1329，:1323-1325 只有 🎲。NearbySheet 的 focus 參數在 :1106、ceiling 在 :1107，呼叫在 :344-345。最近的 commit 裡只有 52a0b69 在 NearbyHost.body 加了 signpost，其他都沒碰。

**修法**：

這項要跟同批的 U09 一起做（U09 的 base、inGroup、filter 參數這裡直接用，下面的程式已經把 U09 的部分寫進去，兩項照這份一次貼完）。同批 U12 的部分標成「U12 做了才加」，U12 不做也編得過。

1. MapTab.swift:65（U09 第 1 點）：
```swift
        let all = store.shown(store.mapF, in: store.mapBase)
```
換成：
```swift
        let base = store.mapBase
        let all = store.shown(store.mapF, in: base)
```
body 裡沒有別的叫 base 的變數。

2. NearbyHost（MapTab.swift:1031-1059）。在 :1034 的 `let total: Int` 下面加：
```swift
    let base: Int          // 篩選前有幾間（我的收藏或這個群組）
    let inGroup: Bool
    let filter: Filter
```
:1040-1042 的 == 換成（一定要把新欄位加進來，不然只換條件、清單一直是空的時候整個被跳過）：
```swift
    nonisolated static func == (a: Self, b: Self) -> Bool {
        a.total == b.total && a.base == b.base && a.inGroup == b.inGroup && a.filter == b.filter
            && a.headY == b.headY && a.mapRect == b.mapRect && a.list == b.list
    }
```
:1044-1047 的 body 換成（:1045 的 signpost 留著，放第一行）：
```swift
    var body: some View {
        let _ = Perf.signposter.emitEvent("附近重算")
        content(Nearby(list: list, here: store.here, region: visible, total: total, base: base, inGroup: inGroup, filter: filter))
    }
```
U12 做了才在最後多傳 `, only: seen.only`。
MapTab.swift:342 換成：
```swift
                NearbyHost(seen: seenBox, list: list, total: total, base: base.count, inGroup: store.mapGroup != nil, filter: store.mapF, headY: headY, mapRect: mapRect) { near in
```

3. Nearby（MapTab.swift:1061-1093）整個換成：
```swift
struct Nearby {
    let title: String, subtitle: String, places: [Place]
    var short = ""                     // 小字放不下整句時的短句（放不下就不顯示，不出現「…」）
    var lead: String?                  // 「附近 」「這一帶 」「找到 」：後面接間數（數字會滾動）
    var clear = false                  // U09：篩選或搜尋沒結果，標題那行放「清除篩選」
    var more = 0                       // U10：只點分類、鏡頭內 0 間但別處有幾間（放「看全部 N 間」）
    // U12 做了才加：var isOnly = false

    init(list: [Place], here: CLLocation?, region: MKCoordinateRegion?, total: Int, base: Int, inGroup: Bool, filter: Filter) {
        guard !list.isEmpty else {
            if base == 0 && inGroup { title = "還沒有店"; subtitle = "在店家頁按「分享到群組」加進來" }
            else if base == 0 { title = "還沒有收藏"; subtitle = "按右上角＋新增第一間" }
            else if (filter.on || !filter.q.isEmpty) && total == 0 {
                if filter.q.isEmpty { title = "沒有符合的店"; subtitle = Self.cond(filter) }
                else { title = "找不到「\(filter.q)」"; subtitle = "換個字試試" }
                clear = true
            } else { title = "地圖上還沒有店"; subtitle = "有地址的店會自己出現在地圖上" }
            short = subtitle
            places = []
            return
        }
        let center = region.map { CLLocation(latitude: $0.center.latitude, longitude: $0.center.longitude) }
        let ref = here ?? center
        // U12 做了才在這裡插它第 3(c) 點的 if let only { ... return }
        func inView(_ p: Place) -> Bool {
            guard let r = region else { return true }
            return abs(p.lat! - r.center.latitude) <= r.span.latitudeDelta / 2 && abs(p.lng! - r.center.longitude) <= r.span.longitudeDelta / 2
        }
        // 有搜尋字：符合的店全部列出，不管鏡頭在哪；只點分類：照規格維持鏡頭內的「附近 N 間」
        let searching = !filter.q.isEmpty
        var l = searching ? list : list.filter(inView)
        if let ref {
            l = l.map { ($0, ref.distance(from: CLLocation(latitude: $0.lat!, longitude: $0.lng!))) }.sorted { $0.1 < $1.1 }.map(\.0)
        }
        places = l
        if l.isEmpty {
            title = "這一帶沒有收藏"; subtitle = "把地圖拉遠一點看看"
            if filter.on { more = list.count }      // 只點分類：鏡頭內 0 間但別處有
        } else if searching {
            lead = "找到 "
            title = "找到 \(l.count) 間"
            subtitle = here != nil ? "由近到遠" : "從地圖中心排"
            short = subtitle
        } else {
            lead = here != nil ? "附近 " : "這一帶 "
            title = lead! + "\(l.count) 間"
            subtitle = here != nil ? "由近到遠" : "打開定位就會從你的位置排"
            short = here != nil ? "由近到遠" : "從地圖中心排"
        }
    }

    // U09：目前的條件，例如「✓ 去過・🍜 餐廳・「拉麵」」
    static func cond(_ f: Filter) -> String {
        [f.status == "want" ? "♥ 想去" : f.status == "been" ? "✓ 去過" : nil,
         Cat.all[f.cat].map { [$0.emoji, $0.name].filter { !$0.isEmpty }.joined(separator: " ") },
         f.q.isEmpty ? nil : "「\(f.q)」"].compactMap { $0 }.joined(separator: "・")
    }
}
```
cond 跟 U09 原文差一點：52a0b69 讓 Cat 在 -noEmoji 量測參數下 emoji 是空字串（Models.swift:42-45），所以 emoji 和名稱用 filter 再 join，不會多一個開頭空格。Cat.all 現在在 Models.swift:48。

4. 按 return 才重框。直接在 MapTab.swift:322 的 `.padding(.horizontal, 16)` 後面加（.onSubmit 會往下套到 SearchField 裡的 TextField，不用改 Theme.swift）：
```swift
                            .onSubmit(of: .text) { if !store.mapF.q.isEmpty { frameShown() } }
```
如果同批 U06、U16 先做（合併注意 合1），首頁 SearchField 的呼叫會換成合1 的版本，那版最後一行已經是這個 onSubmit，不要加兩次。

5. 在 bounds（MapTab.swift:1007-1012）後面、:1013 MapTab 結尾的 } 前面加：
```swift
    // 搜尋按 return、「看全部 N 間」：把符合的店框進看得到的那塊
    private func frameShown() {
        // U12 做了才加下面兩行（合併注意 合3）：程式移鏡頭也要離開「只列這幾間」
        // seenBox.zoomed = nil
        // if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
        quiet.hush()
        MapPanel.shared.go(.mid)          // 先換段，aim() 才會用中段上緣算
        guard let b = bounds else { Haptic.warning(); return }
        Perf.shared.mark("框搜尋結果 \(points.count) 間")
        withAnimation(.smooth(duration: 0.5)) { pos = .region(b) }
    }
```
這裡不設 selfMoved，停好之後 seenBox 會照常更新。不要搬 TripPanel 的 fitCoords，那是算行程面板和加站卡高度的，首頁要用 aim()。定位鈕（MapTab.swift:384-397）也是程式移鏡頭，U12 做了之後要不要在那裡也清 only，請寫 Swift 的人一起決定。

6. NearbySheet 參數：在 MapTab.swift:1106 的 `var focus` 後面加（U12 做了的話，它的 endOnly 放在 focus 和 frameAll 中間，memberwise init 的順序要跟宣告一樣）：
```swift
    var frameAll: () -> Void = {}               // 「看全部 N 間」：把符合的店框進看得到的那塊
```
MapTab.swift:344 的呼叫在 `focus: focus,` 後面接 `frameAll: frameShown,`（U12 做了是 `focus: focus, endOnly: { withAnimation(.snappy) { seenBox.only = nil } }, frameAll: frameShown,`），:345 的 `ceiling: headY + 8, ...` 照舊。

7. titleRow（MapTab.swift:1322-1325）這段：
```swift
            Spacer(minLength: 0)
            if let draw, !list.isEmpty {
                DiceChip(draw: draw, panel: panel)
            }
```
換成：
```swift
            Spacer(minLength: 0)
            // U12 做了才在這裡放它的 ✕（if near.isOnly { ... }）
            // 「看全部」放在 if let draw 外面：more > 0 時 list 不是空的，🎲 也會在
            if near.more > 0 {
                Button { Haptic.light(); frameAll() } label: {
                    Text("看全部 \(near.more) 間").font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
                        .padding(.horizontal, 12).frame(height: 36).background(Color.accent.opacity(0.13), in: .capsule)
                        .frame(minHeight: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
            }
            if let draw, !list.isEmpty {
                DiceChip(draw: draw, panel: panel)
            } else if near.clear {
                // U09：清除篩選（動作跟 ListTab 的一樣，listF 就是 mapF）
                Button { Haptic.light(); withAnimation(.snappy) { store.mapF = Filter() } } label: {
                    Text("清除篩選").font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
                        .padding(.horizontal, 12).frame(height: 36).background(Color.accent.opacity(0.13), in: .capsule)
                        .frame(minHeight: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
            }
```
NearbySheet 的 title（MapTab.swift:1382-1388）不用改：lead 是「找到 」時會顯示「找到 N 間」，數字照樣滾動。

順序：U09 和這項同一次做；U12 同一次做就把上面標「U12 做了才加」的地方一起補上，晚做也可以之後再補。

**模擬器驗收**：(1) 把地圖移到台南，搜尋框打一間在台北的測試店名，打字途中地圖不能動，面板標題寫「找到 1 間」並列出那張卡。(2) 按鍵盤的搜尋鍵，面板到中段，地圖從按下那一幀開始平滑框到台北那間（在中段面板上面看得到），浮層有「框搜尋結果 1 間」。(3) 打一串對不到的字，標題寫「找不到「那串字」」、小字「換個字試試」，右邊有「清除篩選」，按了條件清掉、卡片列回來（這條取代 U09 原本驗收 (2) 的「沒有符合的店」）。(4) 清掉搜尋字，標題回到「附近 N 間」，只算鏡頭內。(5) 在台南只點一個只有台北才有的分類，標題「這一帶沒有收藏」右邊出現「看全部 N 間」，旁邊 🎲 也還在；按「看全部」框過去；點分類時地圖不能自己跑。(6) U09 一起驗：點「✓ 去過」再點一個沒有店的分類，標題「沒有符合的店」、小字是目前條件、右邊有「清除篩選」；從一個沒店的分類換到另一個沒店的分類，小字要跟著換（確認 NearbyHost 的 == 有加新欄位）；切到沒有店的群組，標題是「群組名 · 還沒有店」，沒有清除鈕。(7) 跟 U07 一起驗：大卡開著時打一個不符合那間的字，大卡收起；打一個符合的字再按搜尋鍵，大卡留著、地圖框住結果。(8) iPhone SE 寬度：群組名很長、鏡頭內 0 間、只點分類時，「看全部」和 🎲 同時在，標題可以縮小但不能整個看不到，按鈕不能疊在一起。(9) U16 也做了的話：從最低段開始那一輪用點地圖收鍵盤，要留在最低段；按搜尋鍵（有字）升到中段是這項要的行為。(10) U12 也做了的話：列出模式時按搜尋鍵框結果，面板要回到一般清單。

**注意**：跟同批（第 2 批）U09 要同一次做，修法已經把 U09 的 base、inGroup、filter、clear、cond 和清除篩選鈕寫進去，U09 的驗收 (2) 改成跟這項 (3) 一致。跟同批 U12：Nearby.init、NearbyHost.body、NearbySheet 參數、titleRow 都是同一塊，判斷順序是空清單、only、搜尋、附近，修法裡標了 U12 要插的位置；U12 的「只列這幾間」遇到這項的 frameShown 要退出（合併注意 合3），定位鈕要不要也退出請寫 Swift 的人決定。跟同批 U06、U16：首頁 SearchField 的呼叫三項都改，照合併注意 合1 一次寫，onSubmit 只留一個；U16 的驗收要照合4 改寫。跟同批 U07：打字會讓 list 變，大卡那間被篩掉時 U07 會收卡，是想要的行為。跟同批 U08：搜尋結果不套 region 後，手指捲卡片列會用 focus 把畫面外的圖釘拉進來，這是想要的，U08 不受影響。perf-round1b 的 NearbyHost.body signpost 已經由 52a0b69 做進來（MapTab.swift:1045），修法照留。第 10 批 U122 會把清除篩選鈕的 frame(height: 36) 改成 minHeight，做到時直接改這裡新加的鈕。fix-addcard-ec71aa2.md 沒有重疊（行程搜尋是 TripTop 另一個框）。merge_notes 裡 U34、U35、U36、U19、U49、U60、U75、U84、U96、U100、U103、U106、U107、U132 那些條目講的是別批別的檔案，跟這項沒有關係。

### U11（P2・滑順）抽中的店在泡泡裡時，光圈打在泡泡上，圖釘晚半秒才冒出來

**畫面**：地圖首頁：🎲 抽一間（一間、三間挑一、轉盤）、DrawHistory 點小照片

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：被合進泡泡的店在 hidden 裡，不會畫成 FoodPin。picked() 先在座標放 PinBurst 再平移，要等鏡頭停下 recluster 才拆出那根，抽中的高潮那一幀沒有落在圖釘上。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：picked() 的非行程分支在 acd4471 到 3fc00de 只有 52a0b69 加了量測用的程式，沒有處理這項，問題還在。MapTab.swift:621-624 找到店之後，:625 記「抽一間（抽中）」或「點圖釘」，:626 是 52a0b69 加的 -perfOverlay 印出，:634-639 直接放光圈、:641-667 移地圖，沒有處理那根在泡泡裡的情況。泡泡裡的店在 hidden（MapTab.swift:30），:109 的 ForEach(list.filter { !hidden.contains($0.id) }) 不畫它，要等鏡頭停下 onMapCameraChange 在 :240 呼叫 recluster 才拆出來。recluster（MapTab.swift:795）在 :814 已經把 pins.sel 和 pins.extra 排除在格子外，:838-845 又會把疊到的再合成一顆。抽一間（:516、:531 的 pins.select）、三間挑一和轉盤（:416-421 的 DrawStage pick 呼叫 choose，choose 在 :559-566）、DrawHistory（:429 的 DrawPanel 和 :1225 PickedCard 的 pickHistory: choose）都會走到 picked。FoodPin 對選中那根刻意不套 flyFrom（:1736）也不跟泡泡合（:1741-1742）。52a0b69 另外在 recluster 加了 signpost（:796）和「泡泡直接換」（:887）、「泡泡換上」（:897）兩個浮層記號，在 FoodPin 出現時發「圖釘出現」事件（:1792），又加了 -drawWin（:500-505）可以固定抽中哪一間，這些剛好拿來驗這項。8559c3d 的 pins.moving 只擋手指點圖釘、點泡泡、點站號（:1638、:906、:735），抽一間這幾條路是直接 select，不受影響。

**修法**：

1. MapTab.swift:626 這行：
```swift
        if Flag.on("-perfOverlay") { print("[perf] 選中 \(p.name) \(p.id)") }
```
後面（:627 的註解「下面那塊升到中間段…」前面）加：
```swift
        // 抽中、轉盤選中、從「抽過」點回的店如果在泡泡裡：先拆出這根，光圈和圖釘同一刻出現
        // （手指點圖釘點不到泡泡裡的店，不會走到這裡，一般點圖釘的路徑不受影響）
        if hidden.contains(id) { Perf.shared.mark("拆泡泡"); recluster(proxy) }
```
放在 :625 的 mark 後面：perf-round1b 量「按下到抽中」用的就是 :625 這個 mark，放後面才不會把 recluster 的成本算進去，跟之前的基準可以直接比；recluster 自己的時間會出現在 :796 的「recluster」signpost 區間裡。放在 :626 的 -perfOverlay 印出後面或前面都可以，這裡寫後面，讓量測印出的時間點跟 3fc00de 一樣。
recluster 的兩個分支都會同步把這根從 hidden 拿掉（:888 的 hidden = nextHidden，或 :891 的 hidden.intersection(nextHidden)），因為 :814 已經排除 pins.sel，nextHidden 一定跟 hidden 不同，會通過 :871 的 guard，也會在 :882 取消上一輪還沒做完的 clusterTask，所以舊的合併不會把它又藏回去。下一幀那根就畫出來；剩下的店如果要重新合，晚 0.33 秒換成新泡泡，可以接受。抽一間落下動畫還在播時（pins.dropping，:797-803）recluster 會延後，這種情況很少，不另外處理。飛很遠時半空停下的那次鏡頭停下回呼也會 recluster（:240），sel 照樣被 :814 排除，不會又被合回去。

2. 不要讓剛拆出的 sel 套 flyFrom。光圈畫在店的座標上（:634-639），選中那根如果從泡泡飛過來，光圈會比圖釘先到，反而又對不上；:1741 的註解也說明選中那根不飛是為了店名牌跟著圖釘。:1736 和 :1742 維持不改，那根直接在原位彈出來，跟光圈同一刻。

不用等別項，第 2 批照任何順序做都可以。

**模擬器驗收**：在模擬器跑，啟動參數加 -perfOverlay，開 PerfHUD 浮層，Instruments 開 os_signpost（類別 tap）。(1) 一般地圖縮小到有泡泡、不要開任何篩選，挑一間在泡泡裡的店，用啟動參數 -drawWin 加那間的 id 固定抽中它（MapTab.swift:500-505），長按 🎲 設成「一間」再按 🎲。錄影確認光圈放出來的同一幀，那根圖釘就在光圈中間彈起來；浮層順序是「抽一間（抽中）」、「拆泡泡」，通常緊接著「泡泡直接換」；Instruments 裡「圖釘出現」事件和 recluster 區間都在抽中後的第一幀內。(2) 不加 -drawWin，同樣條件用三間挑一、轉盤各選一次在泡泡裡的店，結果一樣。(3) 抽過兩間以上後，從大卡上面的「抽過」點回一間在泡泡裡的店。(4) 用 -drawWin 抽中很遠、在泡泡裡的店（浮層有「移地圖（遠）」），飛行過程中那根要一直在，降落後（浮層「飛完（第 N ms）」）不能又被合進泡泡。(5) 回歸：一般點一根不在泡泡裡的圖釘，浮層不能出現「拆泡泡」，點圖釘的反應時間跟 3fc00de 一樣；兩指縮放放開在圖釘上不算點（8559c3d）；行程模式點圖釘不受影響。(6) 有篩選時用 -drawWin 抽中一間被篩掉的店，那間是 pins.extra、本來就不在泡泡裡，不能出現「拆泡泡」。

**注意**：perf-round1b 的量測 build（第 2.3 節，影片那條的 -noReelWarm、-reelNow，飛行記號 flyStart、leg2，recluster 的 signpost）已經由 52a0b69 做進 3fc00de，在 MapTab.swift:631-633、:660、:665、:796，修法的行號已經含這些，不用再推；perf-round1b 4.B 如果之後採用，改的是 :631-633，在這項插入點之後，不衝突（合併注意 合13）。跟同批（第 2 批）U12 都碰泡泡，但 U12 改 zoom()（MapTab.swift:905 起），這項改 picked()，互不影響。跟同批 U07 不衝突：U07 改 :242 的 onChange，也會呼叫 recluster，兩邊各自觸發。第 7 批 U71、U132 改 draw()（MapTab.swift:477-533）和 DrawPanel，choose() 和 picked() 不動，沒有重疊。fix-v11-acd4471.md 的 RowHold 已經由 8559c3d、9379b88 做進來，只動 TripPanel、RowHold、PanelLift；8559c3d 在 MapTab 加的 pins.moving 只擋手指點擊，不影響這項。fix-addcard-ec71aa2.md 早就在 acd4471，它在 picked() 改的是行程分支（MapTab.swift:595-617），這項只動非行程分支 :626 之後。merge_notes 裡第 6 批「同批」寫法、U98 和 U118 那兩條跟這項沒有關係。

### U12（P2・體驗）座標完全相同的幾間店永遠是泡泡，點了也拆不開

**畫面**：地圖首頁：點分群泡泡

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：經緯度完全相同的店（定位到同一點、同一個地址）在 recluster 的格子演算法下，怎麼放大都拆不開。點泡泡也只會放大到同一個範圍，畫面不變。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：還沒修。3fc00de 的 zoom() 在 MapTab.swift:904-920，最近的 commit 只在最前面加了一行 `guard !pins.moving else { Perf.shared.mark("地圖在動 不算點泡泡"); return }`（:906，8559c3d 加的：兩指縮放放開時手指底下的泡泡不算被點），後面跟 acd4471 一樣：行程模式記 trip.pickAt（:908），然後一律把鏡頭框到這群店的範圍，跨度最小 0.003（:918）。recluster 的格子在 :807、:816，座標相同的店永遠落在同一格，:837-845 又會把螢幕上疊到的合成一顆，所以拆不開的泡泡點了只會框回同一個範圍，畫面不變。SeenBox（:1018-1027）沒有 only，Nearby.init（:1066-1093）沒有「只列這幾間」的分支，titleRow（:1310-1329）沒有 ✕。NearbyHost.body（:1044-1047）已經有 52a0b69 照 perf-round1b 加的 `Perf.signposter.emitEvent("附近重算")`（:1045），content 那行在 :1046。:449 的 onChange(of: store.mapGroup)、:458 的 onChange(of: trip.on) 都跟 acd4471 一樣。一般地圖點空白照舊沒有處理：:180-183 的 SpatialTapGesture 在非行程模式是 including: .subviews，blankTap（:743-754）第一行 guard trip.on。e7af2e1、3fc00de 改的是訊息條和拿掉一天，9379b88 改的是 TripPanel，都沒碰到這幾段。

**修法**：

1. SeenBox（MapTab.swift:1018-1027）在 :1020 的 peek 後面加兩個欄位。only 會被觀察，但只有 NearbyHost 讀，改了不會讓整張地圖重算；zoomed 不觀察：
```swift
    var only: Set<String>?                          // 點了拆不開的泡泡：卡片列只列這幾間
    @ObservationIgnored var zoomed: String?         // 上一次點的泡泡；沒拖地圖又點同一顆，表示放大過了還是拆不開
```

2. zoom()（MapTab.swift:904-920，含 :904 的註解）整段換成下面這段。8559c3d 加的 guard !pins.moving 一定要留在第一行：地圖還在動時點到的不算點泡泡，也不能被當成「又點了一次」而進列出模式。
```swift
    // 點泡泡：放大到框住這幾家；擠在一起拆不開的，卡片列改成只列這幾間
    private func zoom(_ c: PinCluster) {
        guard !pins.moving else { Perf.shared.mark("地圖在動 不算點泡泡"); return }
        // 行程裡點泡泡放大：不是點空白（不收加站卡、不收搜尋）
        if trip.on { trip.pickAt = CACurrentMediaTime() }
        Haptic.light()
        Perf.shared.mark("點泡泡 \(c.ids.count) 間")
        quiet.hush()
        MapPanel.shared.atLeastMid()
        let ps = currentList.filter { c.ids.contains($0.id) }
        guard !ps.isEmpty else { return }
        let la = ps.map { $0.lat! }, lo = ps.map { $0.lng! }
        // 擠在同一處（約 50 m 內），或同一顆泡泡連點兩次、中間沒拖地圖（放大過還是同一顆）：再放大也拆不開
        let tight = la.max()! - la.min()! < 0.0005 && lo.max()! - lo.min()! < 0.0005
        let again = seenBox.zoomed == c.id
        seenBox.zoomed = c.id
        if !trip.on, tight || again {
            Perf.shared.mark("泡泡列出 \(ps.count) 間")
            withAnimation(.snappy) { seenBox.only = Set(ps.map(\.id)) }
        }
        withAnimation(.smooth(duration: 0.5)) {
            pos = .region(aim(MKCoordinateRegion(center: .init(latitude: (la.min()! + la.max()!) / 2, longitude: (lo.min()! + lo.max()!) / 2),
                                                 span: .init(latitudeDelta: max(0.003, (la.max()! - la.min()!) * 2.6), longitudeDelta: max(0.003, (lo.max()! - lo.min()!) * 2.2)))))
        }
    }
```
判斷拆不開不要用「store.mapRegion 的經度跨度 ≤ 這次要框的 1.2 倍」：store.mapRegion 是整張全螢幕地圖的範圍，要框的範圍只落在搜尋列到面板之間，aim() 又會把緯度放大，面板停中段時很容易超過 1.2 倍，永遠判不到。所以用「同一顆泡泡（PinCluster 的 id 是排序過的店 id 串起來，:863，同一群店一定一樣）沒拖地圖又被點一次」：第一次點照樣放大，放大後還是同一顆，第二次點就進列出模式。PinCluster.id 是穩定的，這個判斷可靠。
第 7 批 U72 如果一起做，把上面那行 `if trip.on { trip.pickAt = CACurrentMediaTime() }` 換成下面這兩行，位置還是在 guard 後面：
```swift
        // 行程裡點泡泡放大：不是點空白（不收加站卡、不收搜尋）。首頁大卡開著時點泡泡：先取消選取（U72）
        if trip.on { trip.pickAt = CACurrentMediaTime() } else { pins.select(nil) }
```
U72 先做、這項後做的話，照上面整段換時記得把 U72 的 else 留著。兩項其實互相需要：大卡開著時點拆不開的泡泡，沒有 U72 先取消選取，列出模式會被大卡蓋住看不到。

3. Nearby（MapTab.swift:1061-1093），只做這一項時：
(a) :1064 的 lead 後面加 `var isOnly = false                // 點拆不開的泡泡：只列那幾間`。
(b) :1066 的 init 改成 `init(list: [Place], here: CLLocation?, region: MKCoordinateRegion?, total: Int, only: Set<String>? = nil) {`。
(c) :1074 的 `let ref = here ?? center` 後面、:1075 的 func inView 前面加下面這段（要在 ref 之後，排序要用 ref）：
```swift
        if let only {
            let l = list.filter { only.contains($0.id) }
            if !l.isEmpty {
                places = ref.map { r in l.sorted { r.distance(from: CLLocation(latitude: $0.lat!, longitude: $0.lng!)) < r.distance(from: CLLocation(latitude: $1.lat!, longitude: $1.lng!)) } } ?? l
                title = "這裡有 \(l.count) 間"; subtitle = "擠在同一處"; short = subtitle; isOnly = true
                return
            }
        }
```
篩選把那幾間都拿掉時 l 是空的，會自己退回一般的「附近 N 間」。
同批的 U09、U10 一起做時（建議一起做），Nearby 一次寫成下面這樣，判斷順序是空清單（U09，q 不空時用 U10 的文案）、only（這項）、搜尋（U10）、附近：
```swift
struct Nearby {
    let title: String, subtitle: String, places: [Place]
    var short = ""
    var lead: String?
    var clear = false      // U09
    var more = 0           // U10
    var isOnly = false     // U12

    init(list: [Place], here: CLLocation?, region: MKCoordinateRegion?, total: Int, base: Int, inGroup: Bool, filter: Filter, only: Set<String>? = nil) {
        guard !list.isEmpty else {
            if base == 0 && inGroup { title = "還沒有店"; subtitle = "在店家頁按「分享到群組」加進來" }
            else if base == 0 { title = "還沒有收藏"; subtitle = "按右上角＋新增第一間" }
            else if (filter.on || !filter.q.isEmpty) && total == 0 {
                if filter.q.isEmpty { title = "沒有符合的店"; subtitle = Self.cond(filter) }
                else { title = "找不到「\(filter.q)」"; subtitle = "換個字試試" }
                clear = true
            } else { title = "地圖上還沒有店"; subtitle = "有地址的店會自己出現在地圖上" }
            short = subtitle
            places = []
            return
        }
        let center = region.map { CLLocation(latitude: $0.center.latitude, longitude: $0.center.longitude) }
        let ref = here ?? center
        if let only { /* 上面 3(c) 那段照抄 */ }
        func inView(_ p: Place) -> Bool { /* 照舊 */ }
        let searching = !filter.q.isEmpty
        var l = searching ? list : list.filter(inView)
        /* 以下照 U10 第 1 點 */
    }
    static func cond(_ f: Filter) -> String { /* U09 */ }
}
```
U09 的模擬器驗收 (2) 跟著改成「標題寫「找不到「那串字」」、小字「換個字試試」、右邊有清除篩選」，跟 U10 (3) 一致。

4. NearbyHost.body（MapTab.swift:1044-1047）：:1045 的 signposter 是 52a0b69 照 perf-round1b 加的，已經在了，留著；只把 :1046 改成
```swift
        content(Nearby(list: list, here: store.here, region: visible, total: total, only: seen.only))
```
跟 U09、U10 一起做時改成 `content(Nearby(list: list, here: store.here, region: visible, total: total, base: base, inGroup: inGroup, filter: filter, only: seen.only))`。

5. NearbySheet 加退出的 ✕：
(a) MapTab.swift:1106 的 `var focus: (String) -> Void = { _ in }` 後面加 `var endOnly: () -> Void = {}`。U10 一起做時，它的 `var frameAll: () -> Void = {}` 接在 endOnly 後面。
(b) titleRow 在 MapTab.swift:1322 的 `Spacer(minLength: 0)` 後面、:1323 的 `if let draw, !list.isEmpty {` 前面加：
```swift
            if near.isOnly {
                Button { endOnly() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink)
                        .frame(width: 32, height: 32).background(Color.ink.opacity(0.07), in: .circle)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("回到附近的店")
            }
```
跟 U09、U10 一起做時，titleRow 從 :1322 起寫成：
```swift
Spacer(minLength: 0)
if near.isOnly { /* 上面這顆 ✕ */ }
if near.more > 0 { /* U10 的「看全部 N 間」 */ }
if let draw, !list.isEmpty {
    DiceChip(draw: draw, panel: panel)
} else if near.clear { /* U09 的「清除篩選」 */ }
```
「看全部」要放在 if let draw 外面：more > 0 時 list 不是空的，🎲 會同時出現。
(c) MapTab.swift:344 的 NearbySheet 呼叫，在行尾的 `focus: focus,` 後面、:345 的 `ceiling: headY + 8` 前面加 `endOnly: { withAnimation(.snappy) { seenBox.only = nil } },`（參數順序要跟宣告順序一樣）。U10 一起做時寫成 `focus: focus, endOnly: { withAnimation(.snappy) { seenBox.only = nil } }, frameAll: frameShown, ceiling: headY + 8, ...`。

6. 其他退出：
(a) 手指拖或縮放地圖：MapTab.swift:190 的右括號（go(.low) 那個 if 結束）後面、:191 的 dot.refresh() 前面加：
```swift
                    // 手指拖、縮放地圖：離開「只列這幾間」，下次點泡泡重新算
                    if !trip.on, pos.positionedByUser, now > quiet.until {
                        seenBox.zoomed = nil
                        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
                    }
```
不放進原本那個 if 裡，因為那個 if 還要過 calmUntil（atLeastMid 會設 0.8 秒），剛點完泡泡馬上拖會退不出來。zoom 和 focus 自己移鏡頭時 positionedByUser 是 false，而且有 quiet.hush，不會誤退。同批 U14、第 4 批 U18、第 5 批 U61、第 7 批 U137 也改這一段（:184-194），有一起做的話整段寫成：
```swift
                .onMapCameraChange(frequency: .continuous) { _ in
                    // 手指拖地圖：下面那塊降到一行（停下來不自動彈回）
                    let now = CACurrentMediaTime()
                    if pos.positionedByUser { pins.camAt = now }          // 8559c3d，已經在 :187
                    if !quiet.touched, pos.positionedByUser, now > quiet.until { quiet.touched = true }   // U18（第 4 批）
                    // U14：新帳號的「收藏第一間店」卡不降
                    let empty = store.mapGroup == nil && store.mine.isEmpty && !store.loading
                    if !trip.on, !empty, pos.positionedByUser, now > quiet.until, now > MapPanel.shared.calmUntil, !MapPanel.shared.dragging {
                        MapPanel.shared.go(.low)
                    }
                    // U12：手指拖、縮放離開「只列這幾間」
                    if !trip.on, pos.positionedByUser, now > quiet.until {
                        seenBox.zoomed = nil
                        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
                    }
                    if trip.going, trip.offFollow != pos.positionedByUser { trip.offFollow = pos.positionedByUser }   // U61（第 5 批）
                    dot.refresh()          // U137（第 7 批）有做才刪
                    pinFrame(proxy)
                    if let c = spot.coord, Date() < spot.until { spot.at = proxy.convert(c, to: .global) }
                }
```
還沒做的那幾項，它們的行先不要加。
(b) 換群組：MapTab.swift:449 改成 `.onChange(of: store.mapGroup) { pins.select(nil); seenBox.only = nil; seenBox.zoomed = nil; fitted = false; fit() }`。
(c) 進出行程：MapTab.swift:458 只做這一項時改成 `.onChange(of: trip.on) { _, on in seenBox.only = nil; seenBox.zoomed = nil; if !on { seenBox.set(seenBox.peek, publish: true) } }`。第 5 批 U13 也要整行換掉 :458，不管誰先做，最後都寫成：
```swift
        // 進出行程：「只列這幾間」一律退出（U12）。
        // 進行程：首頁選著的圖釘取消，不然那根維持放大帶店名、像一個站（U13）；
        // 離開行程：下面的附近面板補算一次地圖現在看的範圍（行程模式時沒跟著算）
        .onChange(of: trip.on) { _, on in
            seenBox.only = nil; seenBox.zoomed = nil
            if on {
                if trip.cand == nil { pins.select(nil); pins.drawn = nil }
            } else {
                seenBox.set(seenBox.peek, publish: true)
            }
        }
```
MapTab.swift:148 現在已經有 nearTask，不過只給量測用的 -landDefer 用；perf-round1b 4.E 正式採用時，才在 else 分支的 seenBox.set 前面加 nearTask?.cancel()。
(d) U10 做了之後，它新加的 frameShown 也是程式移鏡頭，開頭要加兩行退出，不然列出模式時按搜尋鍵，地圖跑走了面板還寫「這裡有 2 間」：
```swift
private func frameShown() {
    seenBox.zoomed = nil
    if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
    quiet.hush()
    // 以下照 U10
}
```
定位鈕（MapTab.swift:384-394）也是程式移鏡頭，列出模式時按了不會退出；要不要在那裡也清，請寫 Swift 的人決定，建議照 (d) 一樣清。

不要做的：原修法的「點空白處就退出」不做，一般地圖沒有點空白的處理，要做得把 :183 的 including 改成 .all，一般地圖不要跟著開。「讓第一張的圖釘跳一下」拿掉，那幾根都在泡泡裡沒畫出來。面板維持 atLeastMid，不升到最高段。行程模式不在這項範圍，zoom 裡用 !trip.on 擋掉，泡泡照舊放大。spiderfy 只當備案。

**模擬器驗收**：(1) 測試帳號準備兩間座標完全相同的店（同一個地址），一般地圖縮到它們合成泡泡，等地圖停好再點泡泡：浮層有「點泡泡 2 間」和「泡泡列出 2 間」，面板停在中段，標題「這裡有 2 間」，小字「擠在同一處」，卡片列只有這兩張，右邊有 ✕。(2) 按 ✕ 回到「附近 N 間」；再點一次泡泡後用手指拖地圖，也要退回；再點一次泡泡後用兩指縮放，也要退回。(3) 準備三間相距約 30 m 的店，點泡泡一次就進列出模式。(4) 找一顆放大一次後還是同一顆的泡泡（浮層兩次「點泡泡 N 間」間數一樣），等地圖停好、不拖地圖再點一次，要進列出模式；中間拖過地圖再點，只會放大不會列出。地圖還在動時點泡泡，浮層會出現「地圖在動 不算點泡泡」，這次不算數，也不能因此進列出模式。(5) 列出模式時切群組、打開行程再關掉，都要回到一般清單；U10 做了之後，列出模式時在搜尋框打字按搜尋鍵框結果，也要回到一般清單。(6) 列出模式時手指捲卡片列，地圖可以對過去，但不能因此退出列出模式。(7) 回歸：一般相距較遠的泡泡點了照舊放大拆開，不會進列出模式。(8) 行程模式點泡泡照舊放大、加站卡不收，浮層不出現「泡泡列出」。(9) 回歸 8559c3d：兩指縮放時手指放開的位置剛好在泡泡上，不算點泡泡、不放大。(10) U72 一起做時：先點一根圖釘開大卡，再點拆不開的泡泡，大卡要收掉、看得到「這裡有 N 間」。

**注意**：第 2 批 U09、U10 跟這項改同一個 Nearby.init、NearbyHost.body、NearbySheet 的參數和 titleRow 右邊那格，要照上面的合併版一起做（第 2 批合2）；U10 的 frameShown 要加列出模式的退出（第 2 批合3）。第 2 批 U14、第 4 批 U18、第 5 批 U61、第 7 批 U137 都改 MapTab.swift:184-194 的連續鏡頭回呼，照 6(a) 的合併順序寫；8559c3d 在那裡多了 :187 的 pins.camAt，要留著。第 5 批 U13 跟這項都整行換掉 :458，照 6(c) 的合併版。第 7 批 U72 改 zoom() 開頭那行，照第 2 點的寫法合，而且 guard !pins.moving 一定要在最前面。perf-round1b 的 NearbyHost signposter 已經在 52a0b69 進去（:1045），不用再加；4.E 的 nearTask 正式採用時才在 :458 的 else 分支加 cancel。同批 U07：篩選拿掉列出模式的店時 Nearby 會自己退回一般清單。同批 U08：它的手指條件讓卡片列換卡時不會移地圖，U08 的 focus 是程式移鏡頭，不會觸發這項的退出。同批 U11 改 picked()，這項改 zoom()，互不影響。跟 fix-v11-acd4471.md、9379b88 的 RowHold 沒有重疊，那些只動 TripPanel.swift 和 RowHold.swift。

### U14（P2・體驗）最低段只是中間段裁剩一行：選到店時沒店名、抽過兩間後那行拉不動、空帳號拖一下大卡被裁

**畫面**：地圖首頁面板最低段（拖地圖自動降下），含沒有收藏的新帳號

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：最低段固定 72pt，就是 mid() 從上面裁。(1) 選著圖釘時露出的是「離你 350 m」那行，沒有店名。(2) 抽過 2 間以上時，第一行是 DrawHistory，沒有 ✕ 和 grip，只有上緣約 23pt 的橫條能拉。(3) 空帳號拖一下地圖就降段，FirstPlaceCard 只露出約七成的 Logo。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：三點都還在。(1) 空帳號：MapTab.swift:188 的 `if !trip.on, pos.positionedByUser, now > quiet.until, now > MapPanel.shared.calmUntil, !MapPanel.shared.dragging {` 手指拖地圖就 go(.low)，條件沒有排除新帳號；前一行 :187 是 8559c3d 新加的 `if pos.positionedByUser { pins.camAt = now }`。FirstPlaceCard 的條件在 :1232（group == nil && store.mine.isEmpty && !store.loading），卡片本身在 Onboard.swift:314-341，最上面是 64pt 的 Logo（Onboard.swift:320），最低段 lowH 還是 72（MapTab.swift:1127），扣掉橫條 23 只露出約 49pt，Logo 被裁掉一截。(2) 抽過兩間以上：PickedCard 第一行還是 :1479 的 `if draw != nil { DrawHistory(tap: pickHistory).padding(.top, -2) }`，DrawHistory 在 Draw.swift:240-265，兩間以上才畫，是橫捲的 ScrollView，沒有 grip 也沒有 ✕；有 grip 和 ✕ 的那行在 :1480-1494，被擠到第二行。(3) 選著店時：第一行文字是 :1481 的 Text(top)，內容在 :1545-1549（離你 350 m、分店數），沒有店名，店名在下面卡片裡（:1503），最低段看不到。最近的 commit 只在 :187 加了 camAt 那行、Draw.swift 前面多了幾行（DrawHistory 從 :223 移到 :240，內容沒改），PickedCard 本體跟 acd4471 一樣；e7af2e1、3fc00de 都沒碰。

**修法**：

(a) 空帳號不自動降段：MapTab.swift:188 換成下面兩行（:187 的 pins.camAt 那行留在前面不動）：
```swift
                    let empty = store.mapGroup == nil && store.mine.isEmpty && !store.loading   // 「收藏第一間店」卡，跟 :1232 同一個條件
                    if !trip.on, !empty, pos.positionedByUser, now > quiet.until, now > MapPanel.shared.calmUntil, !MapPanel.shared.dragging {
```
這是規格 A1（拖地圖自動降段）沒考慮到的例外，要回報 Anthony。
同批 U12、第 4 批 U18、第 5 批 U61、第 7 批 U137 也改 :184-194 這一段，有一起做的話整段寫成下面這樣，還沒做的那幾項，它們的行先不要加：
```swift
                .onMapCameraChange(frequency: .continuous) { _ in
                    // 手指拖地圖：下面那塊降到一行（停下來不自動彈回）
                    let now = CACurrentMediaTime()
                    if pos.positionedByUser { pins.camAt = now }          // 8559c3d，已經在 :187
                    if !quiet.touched, pos.positionedByUser, now > quiet.until { quiet.touched = true }   // U18（第 4 批）
                    // U14：新帳號的「收藏第一間店」卡不降
                    let empty = store.mapGroup == nil && store.mine.isEmpty && !store.loading
                    if !trip.on, !empty, pos.positionedByUser, now > quiet.until, now > MapPanel.shared.calmUntil, !MapPanel.shared.dragging {
                        MapPanel.shared.go(.low)
                    }
                    // U12：手指拖、縮放離開「只列這幾間」
                    if !trip.on, pos.positionedByUser, now > quiet.until {
                        seenBox.zoomed = nil
                        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
                    }
                    if trip.going, trip.offFollow != pos.positionedByUser { trip.offFollow = pos.positionedByUser }   // U61（第 5 批）
                    dot.refresh()          // U137（第 7 批）有做才刪
                    pinFrame(proxy)
                    if let c = spot.coord, Date() < spot.until { spot.at = proxy.convert(c, to: .global) }
                }
```

(b) PickedCard（MapTab.swift:1463-1542）：把 :1479 的 `if draw != nil { DrawHistory(tap: pickHistory).padding(.top, -2) }`（連同 :1478 的註解）搬到 :1494 `.modifier(grip)` 後面、:1495 照片那個 HStack 前面，padding 改成 `.padding(.bottom, -2)`，讓最上面一行永遠是有 grip 和 ✕ 的那行：
```swift
            .padding(.leading, 18).padding(.trailing, 10)
            .modifier(grip)
            // 這次抽過的店，點一個回到那間（放在有 ✕、能拉的那行下面，最低段才看得到那行）
            if draw != nil { DrawHistory(tap: pickHistory).padding(.bottom, -2) }
            HStack(alignment: .top, spacing: 12) {
```
不要直接在橫捲的 DrawHistory 上加排他的 grip，橫捲和往下拉會搶手勢。第 7 批 U77 要在這排掛有方向鎖的同時手勢，做 U77 時掛在搬過來之後的這一行：`if draw != nil { DrawHistory(tap: pickHistory).padding(.bottom, -2).simultaneousGesture(bodyPull) }`，bodyPull 用非 Optional 的 `var bodyPull: AnyGesture<DragGesture.Value>`，寫法照第 7 批合7。

(c) 最低段露出店名：PickedCard 在 :1474 的 `@State private var askNav = false` 後面加 `@State private var mp = MapPanel.shared`，:1481 改成
```swift
                Text(mp.stage == .low ? place.name : top)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(Color.ink.opacity(mp.stage == .low ? 1 : 0.55)).lineLimit(1)
```
只換字，不用 if 拿掉或另做 lowRow，符合 gotchas（heavy chrome 一直掛著，只用 opacity／allowsHitTesting 切換）。stage 在放開手指停好時才換，所以字是停在最低段之後才換，可以接受。讀 mp.stage 的是 PickedCard 自己，換段時只有大卡重算，不會讓 MapTab.body 重算，跟 U15 的要求不衝突。

**模擬器驗收**：(1) 新測試帳號（沒有收藏、不在群組）在地圖首頁拖地圖，面板停在中段，「收藏第一間店」卡的 Logo 完整；有收藏的帳號拖地圖照舊降到最低段。(2) 有收藏的帳號點一根圖釘開大卡後拖地圖，面板降到最低段，那一行看得到店名和 ✕，按 ✕ 關卡、拉那行可以把面板拉回中段。(3) 抽一間抽兩次以上，大卡最上面那行是距離、🎲、✕，「抽過」那排在它下面、照片上面；拖地圖降到最低段後，那行還拉得動、✕ 按得到，「抽過」那排橫捲照常。(4) 中段時第一行照舊是「離你 350 m」，不重複店名。(5) 回歸 8559c3d：兩指縮放放開時手指在圖釘上，不會選到那根。

**注意**：第 7 批 U77 要在 DrawHistory 上掛 bodyPull，要先做這項再做 U77，掛在搬過去之後的那一行（第 7 批合7、第 2 批合11）。同批 U12、第 4 批 U18、第 5 批 U61、第 7 批 U137 都改 MapTab.swift:184-194 的連續鏡頭回呼，照 (a) 的合併順序寫；8559c3d 在 :187 加的 pins.camAt 要留著（第 2 批合12）。同批 U15：PickedCard 讀 mp.stage 只會讓大卡重算，不要改成在 MapTab.body 讀。同批 U08 改的是 NearbySheet 傳給 PickedCard 的關卡 closure（:1225-1229）和卡片列，這項改 PickedCard 本體和 :188，不衝突。跟 fix-addcard-ec71aa2.md、fix-v11-acd4471.md 沒有重疊。(a) 是規格 A1 的例外，要回報 Anthony。

### U16（P2・體驗）打字時面板被鍵盤頂上來，地圖只剩一條，面板下方還空 82pt（部分已修，下面只寫剩下的）

**畫面**：地圖首頁：點搜尋框打字

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：NearbySheet 在 safeAreaInset(.bottom) 裡沒有忽略鍵盤，被整個推到鍵盤上面；分頁列留在鍵盤後面，空出 82pt 奶油色。中間段時 setFoot 還會把這個位移寫進地圖邊距，鍵盤開關一次地圖就重排一次。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：已修好的只有第 (4) 點：report()（MapTab.swift:1368-1377）只在最低段上緣變大時才更新 lowTop、才叫 foot（:1370-1375），鍵盤一開一關地圖不會重排。其他還在：bottom safeAreaInset（MapTab.swift:338-411）的容器沒有 .ignoresSafeArea(.keyboard)，NearbySheet 還是被整個頂到鍵盤上面；面板底下的 .padding(.bottom, 82)（:1194）在鍵盤上方留出一塊奶油色，分頁列因為 FoodMapApp.swift:356 忽略鍵盤，留在鍵盤後面。首頁搜尋框 SearchField（Theme.swift:109-130）沒有任何打字偵測，lead 還是 AnyView?（:113），面板也不會降段；MapTab.swift:318-321 的呼叫也還是舊的。鍵盤把面板頂上去時，probe.top 會被寫進 mp.top（MapTab.swift:1174、:1376），NearbyHost.visible（:1050-1058）就只算搜尋列到鍵盤上那一小條，打字時「附近 N 間」會掉到只剩幾間。MapPanel.swift:8-34 沒有 typing 欄位。行程模式那邊：TripPanel 已經忽略鍵盤（TripPanel.swift:68），搜尋結果在 TripPanel 上緣的 overlay（TripPanel.swift:126-140），TripTop 自己聽 keyboardWillHide（TripTop.swift:45-47），點輸入框用 simultaneousGesture 記打字（TripTop.swift:287-296、:305-307）。最近的 commit（含 e7af2e1、3fc00de）都沒碰 SearchField、MapPanel 和這個 safeAreaInset。

**修法**：

(1) 讓面板留在鍵盤後面：在 MapTab.swift:411（bottom safeAreaInset 的右大括號）後面、:412 的註解和 :413 的 `.overlay { PinMenu(...) }` 前面加一行：
```swift
            // 打字時鍵盤不要把下面那塊頂上去（分頁列本來就留在鍵盤後面）
            .ignoresSafeArea(.keyboard, edges: .bottom)
```
top inset（搜尋列）不受影響；TripPanel 那層（:303-308）本來就忽略鍵盤，行為不變。PinMenu、DrawStage 兩個 overlay 放在它後面，維持原樣。改完 NearbySheet 的 bottomY（:1175）和 mp.top 都不會再因為鍵盤變動，「附近 N 間」縮水也一起解掉。

(2) 用點擊記打字，不用 @FocusState（跟 TripTop.swift:287-307 一樣）。
只做這一項（U06 還沒做）時：Theme.swift:113 的 `var lead: AnyView? = nil` 後面、:114 的 trailing 前面加 `var begin: (() -> Void)? = nil            // 點輸入框開始打字（要放在 trailing 前面，尾隨閉包才不會壞）`，:119 的 TextField 後面接 `.simultaneousGesture(TapGesture().onEnded { begin?() })`。:132-134 的 EmptyView 版 init 不用改，預設就是 nil。MapTab.swift:318-321 改成：
```swift
                            SearchField(text: $store.mapF.q, prompt: gname != nil ? "在群組裡找" : "今天想吃什麼？",
                                        lead: store.groups.isEmpty ? nil : AnyView(scopePill(gname)),
                                        begin: beginTyping) {
                                AddButton { adding = true }.coachAnchor(.add)
                            }
```
同批 U06 一起做時，先 U06 再這項，TextField 只留一個手勢，SearchField 整個寫成：
```swift
struct SearchField<Trailing: View>: View {
    @Binding var text: String
    let prompt: String
    var lead: ((Bool) -> AnyView)? = nil      // U06：參數是「正在打字」
    var begin: (() -> Void)? = nil            // U16：點輸入框開始打字（要放在 trailing 前面）
    @ViewBuilder var trailing: () -> Trailing
    @State private var typing = false
    var body: some View {
        let busy = typing || !text.isEmpty
        HStack(spacing: 10) {
            if let lead { lead(busy) } else { Image(systemName: "magnifyingglass").foregroundStyle(.secondary) }
            TextField(prompt, text: $text).font(.body).submitLabel(.search)
                // 同一個點擊做兩件事：膠囊收小（U06）、地圖面板降段（U16）
                .simultaneousGesture(TapGesture().onEnded {
                    if !typing { withAnimation(.snappy) { typing = true } }
                    begin?()
                })
            // 清除鈕、trailing() 照舊
        }
        .padding(.leading, lead == nil ? 16 : 8).padding(.trailing, 6)
        .frame(height: 52)
        .candy(18)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            if typing { withAnimation(.snappy) { typing = false } }
        }
    }
}
```
首頁呼叫（MapTab.swift:318-322）寫成下面這樣，最後一行是 U10 的 onSubmit，U10 做了才加：
```swift
SearchField(text: $store.mapF.q, prompt: gname != nil ? "在群組裡找" : "今天想吃什麼？",
            lead: store.groups.isEmpty ? nil : { busy in AnyView(scopePill(gname, compact: busy)) },
            begin: beginTyping) {
    AddButton { adding = true }.coachAnchor(.add)
}
.padding(.horizontal, 16)
.onSubmit(of: .text) { if !store.mapF.q.isEmpty { frameShown() } }
```
U06 的 typing 留在 SearchField 裡、這項的 typing 放在 MapPanel，兩份各管各的。第 10 批 U122 會把 SearchField 的 `.frame(height: 52)` 改成 minHeight，改在合併後的這一版上。

(3) 狀態放在 MapPanel，而且要用 @ObservationIgnored，免得 MapTab 跟著重算。MapPanel.swift:19 的 calmUntil 後面加：
```swift
    // 首頁搜尋框正在打字：打字前停在哪段（收鍵盤時回去）
    @ObservationIgnored var typing = false
    @ObservationIgnored var beforeTyping: MapStage = .mid
```
MapTab 在 blankTap（MapTab.swift:743-754）後面加兩個函式：
```swift
    // 點首頁搜尋框：面板降到最低段（躲在鍵盤後面），搜尋列到鍵盤之間全是地圖
    private func beginTyping() {
        let mp = MapPanel.shared
        guard !trip.on, !mp.typing else { return }
        mp.typing = true
        mp.beforeTyping = mp.stage
        mp.go(.low)          // 不要 go(.high)，會把地圖整塊蓋住
    }
    // 收鍵盤：本來在最低段就留著，不然回中段
    private func endTyping() {
        let mp = MapPanel.shared
        guard mp.typing else { return }
        mp.typing = false
        guard !trip.on, mp.stage == .low else { return }
        mp.go(mp.beforeTyping == .low ? .low : .mid)
    }
```
在 MapTab.swift:460-462 那個拿目前位置的 .task 後面（:463 藍點那個 .task 的註解前面）加：
```swift
        // 鍵盤收起來（按搜尋、點地圖、捲面板）：首頁搜尋不算在打字了，面板回到打字前那段
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in endTyping() }
```
TripTop.swift:45 也聽同一個通知，但它只改 TripMode.typing；這裡有 guard mp.typing，兩邊不會互相干擾。收鍵盤時本來就在最低段的話留在最低段，比較不會讓人覺得面板自己跳起來。U10 做了之後，按搜尋鍵（有字）時 frameShown 會先 go(.mid)，endTyping 看到已經不是 .low 就直接 return，順序反過來最後也是中段，不用另外處理。
不要在 MapTab.body 讀 mp.stage 或 mp.typing，不然同批 U15 修好的地方會退回去。

(4) 不用再做，report() 只取最大值已經擋住了（MapTab.swift:1370-1375）。

**模擬器驗收**：iPhone 15 模擬器，先按 ⌘K 叫出軟體鍵盤（接著硬體鍵盤時不會有 keyboardWillHide，面板會停在最低段回不來）。(1) 面板停在中段時點首頁搜尋框打「咖啡」：面板滑到最低段、躲在鍵盤後面，鍵盤上方沒有奶油色空白，搜尋列到鍵盤上緣之間看得到圖釘跟著搜尋字變。打開 PerfHUD，「框 headY–footY」的數字在鍵盤開關前後都一樣。(2) 點地圖收鍵盤，面板回到中段，「附近 N 間」恢復成正常範圍的數字。U10 還沒做時，按鍵盤的搜尋鍵收鍵盤也一樣回中段；U10 做了之後，搜尋框有字時按搜尋鍵會框結果並升到中段，這是 U10 要的行為。(3) 先把面板拉到最低段，再點搜尋框打字，然後用點地圖收鍵盤（不要按搜尋鍵），收鍵盤後要留在最低段。(4) 面板在最高段時點搜尋框，面板降到最低段；收鍵盤回中段。(5) 進行程模式按 🔍 打字，面板和搜尋結果的行為跟 3fc00de 一樣（面板降最低、結果框在上緣、鍵盤不頂面板）。(6) 打字中長按圖釘開選單，選單照常出現在圖釘旁邊。

**注意**：同批 U06 也改 SearchField 和首頁那一個呼叫，要先 U06 再這項，照 (2) 的合併版，TextField 只留一個手勢（第 2 批合1）。同批 U10 的 onSubmit 跟這項的 keyboardWillHide 程式不打架，但驗收要照上面 (2)、(3) 分開寫（第 2 批合4）。同批 U15：typing、beforeTyping 一定要 @ObservationIgnored，也不要在 MapTab.body 讀 mp.stage。同批 U17：PinMenu 的 GeometryReader 掛在這個新 modifier 後面，鍵盤收著時 g.size.height 不變，U17 的 -76 照樣成立。第 10 批 U122 改 SearchField 的高度，改在合併後的版本上。跟 fix-addcard-ec71aa2.md 沒有直接衝突：(1) 加的 .ignoresSafeArea(.keyboard) 也會套到同一層的 TripPanel overlay（MapTab.swift:303-308），TripPanel.swift:68 本來就忽略鍵盤。跟 fix-v11-acd4471.md、最近的 RowHold 沒有重疊。

### U17（P2・錯誤）長按圖釘選單和抽一間的暗底蓋不住分頁列，「看店家」可能被擋

**畫面**：地圖首頁：長按靠近面板的圖釘（最低段最明顯）；抽 3 間／轉盤疊在地圖或收藏頁上

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：PinMenu 和 DrawStage 掛在分頁內容裡，分頁列是 Root 的 overlay，所以它還亮著、按得到；切走再回來，選單或遮罩還留著。PinMenu 判斷往下彈時只留 24pt。面板在最低段時，離分頁列約 190～230pt 的圖釘一長按，「看店家」最多被擋 40pt。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：還沒修，5d713ac、d95fd43 都沒碰 PinMenu.swift、Draw.swift、MapTab.swift、ListTab.swift、Store.swift、Onboard.swift。PinMenu.swift:24 還是 `let below = y + 14 + h < g.size.height - 24`。PinMenu 和 DrawStage 還是掛在分頁內容裡（MapTab.swift:413、:415-422；ListTab.swift:101-108），分頁列還是 Root 的 overlay（FoodMapApp.swift:46-51），選單或抽卡開著時照樣亮著、按得到。整個 App 只有 FoodMapApp.swift:54 有 .onChange(of: store.tab)，只記 opened，沒有人清 pins.menu 或 show。Draw.swift:166-170 的 vote()（丟到群組投票）會在抽卡開著時把 store.tab 改成 2；其他切分頁的路還有 Coach.swift:115、FoodMapApp.swift:71、GroupsTab.swift:385、ListTab.swift:367、MeTab.swift:207、TripMode.swift:77。Store.swift:72 的 barHidden 還是計算屬性。DrawStage 在 Draw.swift:401-431（:407 reduce、:427 animation）。5d713ac 只在 FoodMapApp.swift:117-122 的訊息條 pad 多了兩行（:120 的 tripPad），所以 3fc00de 的 pad 那行從 :120 變成 :122，tabBarRoom 從 :362 變成 :364；:46-54 沒動。剪貼簿膠囊 Onboard.swift:183 沒變。

**修法**：

(a) PinMenu.swift:24 改成 `let below = y + 14 + h < g.size.height - 76`，76 和 tabBarRoom（FoodMapApp.swift:364）一致。放不下時本來就會走 :26 的往上彈，不用另外處理。

(b) 換分頁時把選單和抽卡清掉，不帶動畫。直接寫在 PinMenu 和 DrawStage 裡，不要加在 MapTab.body，避免 MapTab 多觀察東西：
- PinMenu：:12 的 reduce 後面加 `@Environment(Store.self) private var store`；:46 的 `.allowsHitTesting(pins.menu != nil)` 後面、:47 的 `.task(id: pins.menu)` 前面加
```swift
        // 換分頁（點分頁列、教學、丟到群組投票…）：選單直接收掉，回來不會還開著
        .onChange(of: store.tab) { if pins.menu != nil { pins.menu = nil } }
```
- DrawStage（Draw.swift:401-431）：:407 的 reduce 後面加 `@Environment(Store.self) private var store`；:427 的 `.animation(.easeOut(duration: 0.2), value: show?.id)` 後面加
```swift
        // 換分頁：抽卡、轉盤直接收掉（丟到群組投票會在開著時切到群組頁）
        .onChange(of: store.tab) { if show != nil { show = nil } }
```
這樣 MapTab 和 ListTab 兩邊的抽卡都會清到，Draw.swift:170 丟到群組那條路也一起處理掉。

(c) 選單或抽卡開著時讓分頁列滑下去。barHidden 是計算屬性，而且訊息條（FoodMapApp.swift:122）和剪貼簿膠囊（Onboard.swift:183）都用 `store.barHidden && store.bottomBar > 0` 算位置，硬塞進 barHidden 會讓它們拿到店家頁留下的舊 bottomBar。所以另外開兩個旗標：
- Store.swift:72 的 barHidden 後面加
```swift
    // 長按圖釘的選單、抽卡／轉盤開著：分頁列先滑下去（不放進 barHidden，訊息條、剪貼簿膠囊照舊算位置）
    var menuCover = false
    var drawCover = false
```
- PinMenu 在 (b) 加的 onChange 後面再加 `.onChange(of: pins.menu != nil) { _, v in store.menuCover = v }`。
- DrawStage 在 (b) 加的 onChange 後面再加 `.onChange(of: show != nil) { _, v in store.drawCover = v }`。
- FoodMapApp.swift:47 改成 `if !store.barHidden && !store.menuCover && !store.drawCover {`，:51 的 `.animation(.snappy, value: store.barHidden)` 後面加 `.animation(.spring(response: 0.3, dampingFraction: 0.85), value: store.menuCover || store.drawCover)`，彈簧參數和 PinMenu 開關選單的一樣（PinMenu.swift:56），看起來會同時動。
用兩個旗標是為了避免兩邊寫同一個 Bool 時互相蓋掉。(b) 清掉 menu 或 show 時，這兩個 onChange 會跟著把旗標設回 false，不用另外清。訊息條在地圖首頁用 store.panelTop 算位置（FoodMapApp.swift:116、:122），其他分頁分頁列滑下去時訊息條照舊停在 96，不受影響。

**模擬器驗收**：(1) 面板放最低段，長按離分頁列大約 200pt 的圖釘，「看店家」整列要在分頁列原本位置的上方，分頁列跟著選單一起滑下去。中段也試一次。點暗處關選單，分頁列滑回來。(2) 在收藏頁按 🎲 抽 3 間，分頁列要藏起來；關掉抽卡，分頁列回來。地圖首頁按住 🎲 選轉盤也試一次。(3) 在抽卡裡按「丟到群組投票」跳到群組頁，分頁列要出現；再切回地圖和收藏頁，不能留著暗底或卡片。(4) 打開選單時，從程式切分頁的路（例如教學走到群組那一步、用邀請連結打開 App）也要把選單清乾淨、分頁列回來。(5) 選單開著時刪一間店剛好跳出有「復原」的訊息條（或先刪一間再馬上長按圖釘），訊息條位置照舊、復原照樣按得到。(6) 行程模式長按圖釘選「加進行程」照樣出加站卡（fix-addcard 的驗收第 6 點）。

**注意**：同批 U16：U16 加的 .ignoresSafeArea(.keyboard) 放在 PinMenu overlay 前面（MapTab.swift:411 後面），鍵盤收著時 PinMenu 的 g.size.height 不變，(a) 的 -76 照樣成立。第 10 批 U131 也改 PinMenu 和 DrawStage（暗底加 accessibilityHidden、卡片加 isModal、DrawStage 加 vo 環境變數），可以疊加；U131 寫的 Draw.swift 行號是 ec71aa2 的，DrawStage 現在往下移了 18 行，照 struct DrawStage 搜尋，兩項加的 @Environment 都放在 reduce 後面。fix-addcard-ec71aa2.md 的驗收第 6 點會經過 PinMenu：行程模式時 barHidden 本來就是 true，(c) 的旗標在那裡看不出差別；(b) 只在換分頁時清 pins.menu，不影響加站卡。5d713ac 只在 FoodMapApp.swift:120 加 tripPad、改 :122 的 pad，這項不改那行，只讓 (c) 引用的行號往下移 2 行；行程模式分頁列本來就藏著，跟它的訊息條新位置不衝突。d95fd43 只改 TripsList.swift（我的行程的確認框和 sheet 裡的訊息條），不碰這兩個浮層，不衝突。

### U46（P2・滑順）轉盤靠 Task.sleep(8ms) 推角度，沒對齊螢幕刷新，轉起來一頓一頓

**畫面**：抽一間 → 🍩 轉盤（點中間轉、甩轉盤後的慣性）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：spinRandom 的角度已經用 CACurrentMediaTime 算，但更新時機靠 MainActor 上的 Task.sleep(8ms)，沒有對齊 display link。剛起轉時每格角度誤差最大，可能偏約 10°；減速尾段在 120Hz 下會漏格或重複格。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：從 a1b57b1 到 ec71aa2，Draw.swift 的轉盤這段沒有改，只是上面的 DrawPanel 多了內容，整段往下移了 24 行。spinRandom 在 Draw.swift:737-757，角度用時間算（749-750），但更新時機靠 753 的 `Task.sleep(for: .milliseconds(8))`。coast 在 719-734，一樣靠 724 的 8ms sleep。每格輕震靠 688-691 的 tick() 逐次比 angle。專案有開 CADisableMinimumFrameDurationOnPhone（FoodMap.xcodeproj/project.pbxproj:249、279），ProMotion 會跑 120Hz，8ms 的 sleep 對不上刷新。

**修法**：

原修法 (1) 把 spinRandom 改成 withAnimation(.timingCurve) 加 completion，套在現在的程式上有三個問題。第一，withAnimation 會讓 angle 的值馬上變成終點，轉到一半用手指去抓的話（spinDrag 695-709 現在會 run?.cancel()，讓轉盤停在當下的角度），轉盤會整個跳到終點。第二，635 的按鈕只擋 won == nil，轉的途中再點一次，會從終點再開一次動畫。第三，animation 的 completion 沒辦法取消，656 的 onDisappear 只會取消 run，所以關掉遮罩後 completion 還是會呼叫 finish() 然後 pick。因此建議改成跟 (3) 一樣：自動轉和放手滑行都用 TimelineView 從時間算角度，走同一條路。

1. DrawWheel 在 Draw.swift:613-617 附近加：
```swift
// 點中間轉、放手滑行共用：角度用時間算，畫面跟著螢幕刷新取樣
struct Spin: Equatable {
    let from: Double, total: Double, t0: TimeInterval, dur: Double, cubic: Bool
    func angle(_ now: TimeInterval) -> Double {
        let u = min(max((now - t0) / dur, 0), 1)
        return from + total * (cubic ? 1 - pow(1 - u, 3) : 1 - pow(1 - u, 2))
    }
}
@State private var spin: Spin?
private static func now() -> TimeInterval { Date.now.timeIntervalSinceReferenceDate }
```
2. 630 的 `wheel.rotationEffect(.radians(angle))` 改成下面這樣，631-634 的 frame、contentShape、gesture、swipeBackBlocked 接在 TimelineView 後面，不用動：
```swift
TimelineView(.animation(paused: spin == nil)) { tl in
    let a = spin?.angle(tl.date.timeIntervalSinceReferenceDate) ?? angle
    wheel.rotationEffect(.radians(a))
        // 每跨一格輕震一下（拖、自動轉、滑行都走這裡）
        .onChange(of: slot(a)) { Haptic.tick() }
}
```
683-686 的 index 抽成 `private func slot(_ a: Double) -> Int`（算法不變），index 改回傳 `slot(angle)`。688-691 的 tick()、615 的 lastIdx、655 的 `lastIdx = index`、706 的 tick() 都拿掉，不然拖的時候會震兩次。
3. 加一個共用的開始和收尾：
```swift
private func start(_ s: Spin) {
    run?.cancel()
    spin = s
    run = Task { @MainActor in
        try? await Task.sleep(for: .seconds(s.dur))
        guard !Task.isCancelled else { return }
        angle = s.from + s.total; spin = nil
        finish()
    }
}
```
睡多久只決定什麼時候收尾。終點角度是公式算的，而且兩種曲線到終點時速度都是 0，所以不會跳。656 的 onDisappear 會取消 run，關掉遮罩之後就不會再 finish。
4. spinRandom 的迴圈（746-756）換成 `start(Spin(from: angle, total: total, t0: Self.now(), dur: dur, cubic: true))`，738 的 guard 加上 `spin == nil`。
5. coast（719-734）整段換掉。摩擦一樣是 3 rad/s²，等減速的軌跡剛好是 1-(1-u)² 的曲線：
```swift
private func coast(_ v0: Double) {
    let v = min(max(v0, -15), 15)          // U47：最多約 6 圈、5 秒
    start(Spin(from: angle, total: v * abs(v) / 6, t0: Self.now(), dur: abs(v) / 3, cubic: false))
}
```
6. spinDrag 的 onChanged（696-697）把 `run?.cancel()` 換成下面兩行，抓住正在轉的轉盤就停在當下，跟 ec71aa2 的行為一樣：
```swift
guard won == nil else { return }
if let s = spin { angle = s.angle(Self.now()); spin = nil; run?.cancel() }
```
7. 次要：TimelineView 每一格都會重算 content，可以把 659-680 的 wheel 抽成 `struct WheelFace: View, Equatable`（只吃 places、won、size），省掉每格重建 8 個 Slice 和文字的工。

**模擬器驗收**：先在模擬器驗行為：點中間轉 3 次，每次都停在事先挑好的那格，停下時不會跳一下；轉到一半用手指按住，轉盤停在當下的位置，不會跳；轉的途中再點中間沒有反應；轉的途中點遮罩關掉，之後不會冒出店家頁或 PickedCard。順不順要在 ProMotion 實機上用 Instruments 的 Animation Hitches 錄：點中間轉 3 次、手甩 3 次，起轉和尾段都沒有 hitch，而且每跨一格震一次。

**注意**：U46、U47、U48 都改 DrawWheel，要一起套，不然就照 U46、U47、U48 的順序套。U46 新的 coast() 已經把 U47 第 3 點的 ±15 放進去了。U46 拿掉了 tick()，所以 U47 改 onChanged 時不用再呼叫 tick()。U46 的 start() 收尾時呼叫 finish()，U48 改的是 finish() 本身和 onDisappear，onDisappear 要同時取消 run（U46）和 leaving（U48）。跟 fix-addcard-ec71aa2.md 無關。

### U47（P2・錯誤）轉盤拖住不動再放開還會自己轉，用力甩會轉十幾秒

**畫面**：抽一間 → 轉盤：用手指拖轉

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：vel 只在 onChanged 更新，手指停住後還是最後的速度，停一下再放開照樣轉走。v0 沒有上限，劃過中心附近時角速度會灌到 30～40 rad/s。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Draw.swift:693-717 跟 a1b57b1 一樣。705 的 vel 只在 onChanged 更新，710-716 的 onEnded 直接拿最後的 vel，大於 1.5 就 coast，所以手指停住再放開照樣會轉走。698 用 atan2 算角度，手指劃過圓心附近，移動一小段角度就變很多；704 的 dt 下限是 1/240 秒，705 的速度沒有上限。719-734 的 coast 也沒有把 v0 夾住（722 直接 `var w = v0`）。

**修法**：

1. onEnded（710-716）改成：
```swift
.onEnded { _ in
    // 手指停住超過 0.06 秒才放開：當作停下來，不甩
    if let l = dragLast, CACurrentMediaTime() - l.t > 0.06 { vel = 0 }
    dragLast = nil
    guard won == nil else { return }
    if abs(vel) > 1.5 { coast(vel) }   // 慢慢放手停在原地是刻意的，不要改成 finish()
    vel = 0
}
```
2. onChanged 的 698-708 改成：
```swift
let dx = v.location.x - size / 2, dy = v.location.y - size / 2
let a = Double(atan2(dx, -dy))
let now = CACurrentMediaTime()
// 離圓心太近，角度變化太敏感：只記位置，不轉也不算速度
guard hypot(dx, dy) >= size * 0.15 else { dragLast = (a, now); return }
if let l = dragLast {
    var d = a - l.a
    if d > .pi { d -= 2 * .pi } else if d < -.pi { d += 2 * .pi }
    angle += d
    let dt = max(now - l.t, 1.0 / 240)
    vel = 0.6 * min(max(d / dt, -20), 20) + 0.4 * vel
}
dragLast = (a, now)
```
有套 U46 的話，這段要寫在 U46 第 6 點「抓住正在轉的就停下」那兩行後面，而且不用再呼叫 tick()。只套 U47 的話，706 的 tick() 保留在 `angle += d` 後面。
3. coast 把 v0 夾在 ±15：有套 U46 的話已經寫在 U46 新的 coast() 裡了。只套 U47 的話，把 722 改成 `var w = min(max(v0, -15), 15), t = CACurrentMediaTime()`。

**模擬器驗收**：在模擬器開轉盤，拖一格到指針下，停 0.5 秒再放開，轉盤不能動。拖著、放開時手還在動，轉盤要滑一段。手指從轉盤一邊快速劃過圓心到另一邊，轉速不能暴衝。用力甩一次，5 秒內停下（約 6 圈以內），停下後照常揭曉。

**注意**：跟 U46 改的是同一段 spinDrag 和 coast，套用順序見 U46。U46 已經拿掉 tick()，這裡的 onChanged 就不用再呼叫。跟 fix-addcard-ec71aa2.md 無關。
