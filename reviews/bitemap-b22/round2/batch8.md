# 第 2 輪第 8 批　P3：群組與滑卡

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 10 項：U43 印章蓋了「想吃！」，放開卡片卻彈回來（規格 A19 的設定，交 Anthony 決定）、U97 「開始滑卡」要等網路回來才推頁、U98 配對畫面按鈕：「繼續滑」用錯字、「就去這間」沒問導航 App、震兩次、U99 收回上一張時卡片原地淡入，不是從滑走的那邊飛回來、U100 「從收藏加入」是系統 List，也沒有搜尋、U101 「調整條件」表單的預設值和一鍵開不一樣，取消也跑到右上、U103 群組卡片的狀態列在窄螢幕或朋友名字長時被截斷、U118 群組頁和滑卡頁還是系統導覽列，和店家頁的白方塊圓鈕不一致、U119 群組頁頭像沒有上限，人多時名字被擠掉、「在地圖上看」被推出畫面、U120 按住群組卡時卡片縮小，「開始滑卡」不動，看起來像兩層

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是逐批檢查時找到的：同一批或跨批有兩項以上改到同一段程式、照字面依序套會打架的地方，以及跟 V11、perf-round1b 重疊的地方。這一節的行號是 acd4471 的。
各項內文的寫法跟這裡衝突時照這裡。

### 合1　U97、U120、U38、U36

**位置**：GroupsTab.swift:39、:85-93、:125-175、:232、:266-273、:370-378

**問題**：U97 第 (5) 點要把 starting 和兩處 ProgressView（:161、:268）拿掉，可是同批 U120 的 GroupCard 新寫法還在用 starting：`.disabled(count == 0 || starting)`，膠囊內容也說照抄原本 :160-167（裡面就有 :161 的 ProgressView）。先套 U97 再套 U120，U120 那段編不過；先套 U120 再套 U97，U97 只講「拿掉 starting」，沒提 U120 新寫的那幾行。另外照總表第 1 節，第 3 批的 U38 和第 4 批的 U36 會先進去：U38 (4) 已經把膠囊改成依 act 換字和圖示、disabled 改成 `(count == 0 && isNew) || starting`、accessibilityLabel 跟著字改；U36 (4) 已經把 :169 改成 `PressStyle(dim: true)` 並刪掉 :171 的 `.opacity(count == 0 ? 0.45 : 1)`。U120 的片段照字面套，會把這三樣都改回 build 22 的樣子（固定寫「開始滑卡」、手動 opacity、按下不分狀態）。

**合併做法**：

順序：U36、U38（P2）先做，第 8 批裡先做 U97 再做 U120。U97 要一併刪掉 GroupCard 的 `var starting = false`（:130）、呼叫端 :39 的 `starting: starting == g.id`、群組分頁的 starting 狀態和 GroupView 的 `@State private var starting`（:232）。U120 的 ZStack 合併後寫成這樣：
```swift
ZStack(alignment: .bottomTrailing) {
    Button(action: open) { /* 原本 :136-155 的卡片內容，含 U38 改成 150 的 trailing padding 和 U103 的狀態列 */ }
        .buttonStyle(PressStyle(scale: 1, pressed: $down))
    Button(action: start) { /* U38 改過的膠囊：依 act 換圖示和字，圖示那格只放 Image，不再有 ProgressView */ }
        .buttonStyle(PressStyle(dim: true))
        .disabled(count == 0 && isNew)
        .padding(.trailing, 14).padding(.bottom, 12)
        .accessibilityLabel(/* U38 跟著文字改的那句 */)
}
.scaleEffect(down ? 0.96 : 1)
.animation(down ? .easeOut(duration: 0.08) : .spring(response: 0.25, dampingFraction: 0.7), value: down)
```
不要再加 `.opacity(count == 0 ? 0.45 : 1)`，dim 已經處理。群組頁主按鈕（:266-273）同理：ProgressView 拿掉，disabled 只留 U38 的 `isNew && list.isEmpty`。

### 合2　U120、U36

**位置**：Theme.swift:30-43

**問題**：U36（第 4 批）和 U120 都說「PressStyle 整段換成」。U36 換成帶 dim 參數、用 PressBody 讀 isEnabled 的版本；U120 換成帶 scale、pressed 的版本，裡面沒有 dim 也沒有 PressBody。照順序 U36 先進去，U120 再整段蓋掉，dim 參數就消失，U36 改過的 `PressStyle(dim: true)`（GroupsTab.swift:169、:277、Edit.swift:57）和 `PressStyle(haptic: true, dim: true)`（GroupsTab.swift:258）全部編不過。U120 的「注意」只提到 U121，沒有提 U36。

**合併做法**：

U120 不要整段換，改成在 U36 的版本上加兩個參數。合併後：
```swift
struct PressStyle: ButtonStyle {
    var haptic = false   // 手指一按下就輕震（不等放開）
    var scale: CGFloat = 0.96   // 按住時縮多少；1＝自己不縮，交給外面一起縮
    var onPress: (() -> Void)? = nil   // 手指一按下就先做的事（例如先拿影片網址）
    var dim = false      // 停用時變淡
    var pressed: Binding<Bool>? = nil   // 按住、放開都回報，給外面整組一起縮用
    func makeBody(configuration: Configuration) -> some View {
        PressBody(c: configuration, haptic: haptic, scale: scale, onPress: onPress, dim: dim, pressed: pressed)
    }

    private struct PressBody: View {
        let c: ButtonStyleConfiguration
        let haptic: Bool
        let scale: CGFloat
        let onPress: (() -> Void)?
        let dim: Bool
        let pressed: Binding<Bool>?
        @Environment(\.isEnabled) private var on
        var body: some View {
            c.label
                .scaleEffect(c.isPressed ? scale : 1)
                .opacity(dim && !on ? 0.45 : 1)
                .animation(c.isPressed ? .easeOut(duration: 0.08) : .spring(response: 0.25, dampingFraction: 0.7), value: c.isPressed)
                .animation(.easeOut(duration: 0.15), value: on)
                .onChange(of: c.isPressed) { _, down in
                    pressed?.wrappedValue = down
                    guard down else { return }
                    if haptic { Haptic.light() }
                    onPress?()
                }
        }
    }
}
```
參數順序 haptic、scale、onPress、dim、pressed，現有的 `PressStyle(haptic: true)`、`PressStyle { … }`、U36 的 `PressStyle(haptic: true, dim: true)`、U120 的 `PressStyle(scale: 1, pressed: $down)` 都編得過。U121 照用這一版。

### 合3　U97、U38

**位置**：GroupsTab.swift:85-93、:370-378、:808-822

**問題**：U38（第 3 批，先做）已經把兩個 quick 改成先看 roundAction，只有 .new 分支才用 starting 加 Task 去 await quickRound。U97 (5) 寫的是對原本 ec71aa2 版的 quick 整個換成同步呼叫，照字面套會把 U38 的 .resume、.result 分支蓋掉，又回到每按一次就開新輪。U97 把 quickRound 改成同步以後，U38 .new 分支裡的 `await store.quickRound` 也編不過。

**合併做法**：

U97 只改 U38 的 .new 分支，防連點的 guard 放在 switch 前面，三個分支都擋：
```swift
private func quick(_ g: FoodGroup) {
    guard path.isEmpty else { return }   // 連點兩下不要推兩次、開兩輪
    switch store.roundAction(g.id) {
    case .resume(let r, _), .result(let r):
        Haptic.light(); path = NavigationPath([g]); path.append(r)
    case .new:
        Haptic.light()
        if let r = store.quickRound(g.id) { path = NavigationPath([g]); path.append(r) }
    }
}
```
群組頁的 quick()（:370-378）一樣，guard 改成 `guard path.count == 1`，.new 分支 `if let r = store.quickRound(gid) { path.append(r) }`。U38 的 roundAction、liveRound 加在 quickRound 後面，U97 把 quickRound 拿掉 async 時不要動到它們。U97 本機先建的那輪 created_at 是 ISO8601 UTC 字串，U38 的 `r.at` 用 UTC 的 SwipeRow.fmt 取前 19 碼，剛開的那輪會被判成有效，行為正確。

### 合4　U98、U45

**位置**：GroupsTab.swift:553、:684-687、:728-731

**問題**：U45（第 3 批，先做）把 :553 的 `.overlay { … MatchView … }` 換成 `.fullScreenCover(item: $match)`，celebrate 改成 Haptic.success() 加不帶動畫的 withTransaction，「繼續滑」和遮罩改呼叫 leave() 淡出。U98 (1) 給的是 overlay 版的 :553 片段，照字面套會把 fullScreenCover 換回 overlay，返回鍵、右滑返回又能在配對畫面上按；U98 (4) 說刪 :685 的 Haptic.success()，那行在 U45 改過的 celebrate 裡還在第一行，要刪的是 U45 版的那行。U98、U45 兩邊的「注意」都沒有提到對方。

**合併做法**：

U98 套在 U45 上面，:553 合併成：
```swift
.fullScreenCover(item: $match) { m in
    let todoEmpty = store.rounds.first { $0.id == rid }.map { store.todo($0).isEmpty } ?? true
    MatchView(match: m, done: todoEmpty || showResult) {
        var t = Transaction(); t.disablesAnimations = true
        withTransaction(t) { match = nil }
    }
    .presentationBackground(.clear)
}
```
celebrate 只留 `var t = Transaction(); t.disablesAnimations = true; withTransaction(t) { match = m }`，不要 Haptic.success()。MatchView 第二顆按鈕保留 U45 的 `Button(action: leave)`，label 換成 U98 的 `Text(done ? "看結果" : "繼續滑")`，再加 `.buttonStyle(PressStyle())`。U98 (3) 的 confirmationDialog 掛在 U45 加了 `.opacity(shown ? 1 : 0)` 的那個 ZStack 上，放在 .opacity 後面。`let done` 要宣告在 `let close` 前面，尾隨閉包才會對到 close。

### 合5　U98、U118

**位置**：GroupsTab.swift:600-612

**問題**：U98 (5) 建議把 DEBUG 的「假配對」加在 RoundView 的 toolbar Menu（:606-611），可是同批 U118 (3) 會把 :602-612 整段 toolbar 刪掉，Menu 搬進 PageHeader 的 trailing。先做 U98 再做 U118，照 U118 的片段重寫 Menu 時假配對會被丟掉；先做 U118，U98 要加的位置已經不在了。另外這個 Menu 包在 `if store.canDelete(r)` 裡，用不是開這輪、也不是群組建立者的測試帳號時，⋯ 根本不出現，驗收找不到假配對。

**合併做法**：

先做 U98 再做 U118，U118 搬 Menu 時把假配對一起搬進 PageHeader：
```swift
if store.canDelete(r) {
    Menu {
        Button("刪除這輪", systemImage: "trash", role: .destructive) { dropping = true }
        #if DEBUG
        Button("假配對") { if let p = store.todo(r).first ?? r.place_ids.compactMap(store.place).first { celebrate(Store.Match(place: p, who: store.membersOf(r.group_id), all: true)) } }
        #endif
    } label: { CircleIcon(icon: "ellipsis") }
    .accessibilityLabel("更多")
}
```
U98 的模擬器驗收要寫明：用自己開的那輪測，⋯ 才會出現。

### 合6　U99、U44

**位置**：GroupsTab.swift:568-598、:619-624

**問題**：U44（第 3 批，先做）把 onSwipe（:593-597）改成多了 finishing 和延遲換結果頁，undo 的 :622 改成 `withAnimation(.snappy) { showResult = false; finishing = false }`。U99 (1) 的「:595 改成 history.append(.init(…)); returning = nil」對到的是 U44 改過的 onSwipe 裡的 `history.append(p.id)`；U99 (2) 把整個 undo 換掉，照字面套會把 U44 加的 `finishing = false` 刪掉，最後一張剛滑掉的 0.28 秒內按收回，finishing 會留在 true。U99 的「注意」只提到 U97、U98，沒有提 U44。

**合併做法**：

先 U44 再 U99。onSwipe 合併後：
```swift
SwipeDeck(deck: todo, onSwipe: { p, liked in
    let last = todo.count == 1
    if last { finishing = true }
    store.swipe(r, p.id, liked: liked)
    history.append(.init(id: p.id, like: liked)); returning = nil
    if last {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(280))
            withAnimation(.snappy) { finishing = false }
        }
    }
    if liked, let m = store.matches(r).first(where: { $0.place.id == p.id }), m.all { celebrate(m) }
}, onTap: { detail = $0 }, onUndo: history.isEmpty ? nil : { undo(r) }, returning: returning)
```
undo 合併後：
```swift
private func undo(_ r: Round) {
    guard let b = history.popLast() else { return }
    Haptic.light()
    returning = b
    var row: SwipeRow?
    withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { showResult = false; finishing = false; row = store.unswipeLocal(r, b.id) }
    if let row { Task { await store.unswipeRemote(r, row) } }
}
```
U99 (3) 說的「:569 的 if/else 換分支」在 U44 之後是 ZStack 裡的 `if showRes`，一樣是換分支，SwipeDeck 新建時 init 算 back 的做法照樣成立，只是會同時有 U44 的 opacity 淡入。

### 合7　U100、U75、U84

**位置**：MapTab.swift:1902-1928

**問題**：第 7 批的 U75 會先改 NoAddressSheet：加 `let ids: [String]`、把 :1908 的 list 改成 `ids.compactMap { store.place($0) }.filter { … }`，再加 `.onChange(of: editing == nil && list.isEmpty) { _, done in if done { dismiss() } }`，而且 U75 (5) 說樣式要跟 U100 一起做。U100 (3) 把整個 NavigationStack 換成新片段，片段裡沒有那個 onChange，照字面套會把 U75 的「補完最後一間自動關」刪掉。U100 的「注意」只提到 a45ce70 到 acd4471、V11、perf-round1b，沒有提 U75。

**合併做法**：

先 U75 再 U100。U100 換 NavigationStack 時保留 U75 改過的 `let list` 那行和 `let ids`，片段最後的 `.sheet(item: $editing) { EditSheet(place: $0) }` 後面補上 U75 的 `.onChange(of: editing == nil && list.isEmpty) { _, done in if done { dismiss() } }`。U84（第 10 批）第 3 步說 PickSheet、NoAddressSheet 照 U100、U75 做，不用再另外改。

### 合8　U103、U38

**位置**：GroupsTab.swift:149-150、:190-192

**問題**：U38（第 3 批，先做）把狀態列的 `.padding(.trailing, 110)` 改成 150。iPhone SE 上卡片 343pt、扣掉左右內距 32 和 150，狀態列只剩約 161pt；「這輪：你 還有 10 張沒滑」footnote 大約 170pt，就算沒有配對膠囊也放不下。U103 的 ViewThatFits 會自動退到第二句，功能沒問題，但 U103 的驗收寫「名字短的群組要顯示完整句」，在 SE 上做不到，模擬器會判成沒過。另外 U120 叫人照抄原本 :136-155 的卡片內容，要抄的是 U38 改成 150 以後的版本，不是 110。

**合併做法**：

U103 照 ViewThatFits 做法套，不用改程式。驗收改成：iPhone 16 上名字短要顯示完整句；iPhone SE 上至少顯示「X 剩 N 張」，字不壓到右下按鈕。U120 搬卡片內容時保留 150。

### 行號更正（acd4471）

- U100：(3) 寫「NoAddressSheet（MapTab.swift:1908-1925）的 NavigationStack 內容換成」和「:1907 的 let list = ... 不動」，現況又寫 :1922 是 ContentUnavailableView。實際上 :1907 是 `var body: some View {`，:1908 才是 let list；NavigationStack 從 :1909 開到 :1927；ContentUnavailableView 在 :1923。片段本身就含 NavigationStack 和 .sheet，照 1908-1925 換會把 let list 換掉，還留下 :1926-1927 的 .sheet 和右大括號。。正確：acd4471 MapTab.swift:1908 是 let list（不動），要整段換掉的是 MapTab.swift:1909-1927（NavigationStack 到它的右大括號），ContentUnavailableView 在 MapTab.swift:1923
- U100：說明寫「SearchField 用 Theme.swift:131-133 不帶 trailing 的 init」，:131 是空行，:132 才開始。正確：Theme.swift:132-134（extension SearchField where Trailing == EmptyView 的 init(text:prompt:)）
- U103：「把 GroupsTab.swift:190-192 換成」下面那段，片段最後有收 `if let who` 的右大括號，可是原本 :193 是 `} else if hits == 0 {`，照行號換會多一個右大括號，else 接不上，編不過。正確：GroupsTab.swift:190-192 換成片段時拿掉片段最後那個 `}`，讓 :193 的 `} else if hits == 0 {` 照舊收尾；或者說成換 :190-193，最後補回 `} else if hits == 0 {`
- U119：「把 GroupsTab.swift:244-248 換成下面這樣，:249-260 的按鈕原封不動接在後面」，可是片段的外層 HStack 已經自帶右大括號，按鈕寫在大括號裡面的註解位置；照字面只換 :244-248 再接原本的 :249-261，會多一個右大括號。正確：GroupsTab.swift:244-261 整段換成片段，把原本 :249-260 的「在地圖上看」按鈕放進片段註解那一行，:261 原本的右大括號由片段的右大括號取代，:262 的 .padding(.horizontal, 16) 不動

## 各項

### U43（P3・體驗）印章蓋了「想吃！」，放開卡片卻彈回來（規格 A19 的設定，交 Anthony 決定）

**畫面**：滑卡頁：拖到一半放開

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：拖過 50pt 就震一下、蓋印章，要 100pt 或甩夠快才送出。拖 60～99pt 放開，印章和震動說選好了，卡片卻彈回去。門檻是規格 A19 定的，這不算實作 bug。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：SwipeDeck.swift 從 a1b57b1 到 ec71aa2 沒改。SwipeDeck.swift:87-91 拖過 50pt 就震 Haptic.medium() 並把 armed 設好、印章實心蓋下去（:65、:68）；送出要 SwipeDeck.swift:95 的 100pt 或甩夠快，拖 60 到 99pt 放開會在 :96 彈回。左滑印章文字仍是「跳過」（SwipeDeck.swift:68、:136），按鈕的 accessibilityLabel 也是「跳過」（:40），規格 A19 寫的是「下次吧」。

**修法**：

門檻不改（照規格 A19 的 50 和 100pt），只讓預告和確定看得出差別，所以不需要 Anthony 決定門檻；只有印章文字要請 Anthony 確認。

(1) SwipeDeck.swift:14 下面加 `@State private var sure = false`（拖過 100pt）。

(2) card()（SwipeDeck.swift:54-77）裡加 `let ink = min(1, 0.5 + max(0, abs(drag.width) - 50) / 100)`，:65 和 :68 的 stamp(...) 後面、.rotationEffect 前面各加 `.opacity(ink)`。50pt 時 0.5，100pt 時 1。transition 的 opacity 會跟這個相乘，蓋下去的動畫照舊。

(3) onChanged（SwipeDeck.swift:85-92）在 :91 後面加
```swift
let over = abs(drag.width) > 100
if over != sure { sure = over; if over { Haptic.light() } }
```

(4) 重設：:96 的 `drag = .zero; armed = nil` 改成 `drag = .zero; armed = nil; sure = false`；:106 一樣加 `sure = false`。

(5) 回報規格落差：A19 左滑印章是「下次吧」，程式在 SwipeDeck.swift:68 和 :136 用「跳過」，:40 的 accessibilityLabel 和 :3 的註解也是。請 Anthony 決定要改程式還是改規格；要改的話四個地方一起換。

快甩送出（predictedEndTranslation 超過 260）不會經過 100pt，印章可能還是半透明就飛走，飛走的複本印章是實心的（:135-136），視覺上像「確定」，可以接受。

**模擬器驗收**：1. 在測試群組輪次往右拖 70pt 不放：「想吃！」印章半透明，有一下中等震動。2. 繼續拖過 100pt：印章變實心並再輕震一下。3. 拉回 70pt：印章變回半透明，再拉回 40pt 以內印章抬起；放開卡片彈回，沒有送出。4. 往左做一樣的測試，印章是「跳過」（或 Anthony 決定後的文字）。5. 拖過 100pt 放開送出，下一張再拖過 100pt 時一樣會震（sure 有重設）。

**注意**：跟 U42 都動到 gesture（SwipeDeck.swift:83-98）和 fling 的 :106：U43 改 onChanged 並在 :96、:106 加 sure = false，U42 改 onEnded 的 :94-95 和 fling 的參數，合併時保留雙方。跟 U41 同在 card()，U41 改 :70-72 的順序，不衝突。跟 fix-addcard-ec71aa2.md 無關。

### U97（P3・滑順）「開始滑卡」要等網路回來才推頁

**畫面**：群組卡片／群組頁按「開始滑卡」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：按下後轉小圈圈，等 POST swipe_rounds 回來（0.3～1 秒）才推進滑卡頁，卡組其實已在本機算好。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Store.swift:870-877 的 startRound 還是先 await POST swipe_rounds，回來才 rounds.insert。呼叫端 GroupsTab.swift:85-93（群組卡的 quick）和 GroupsTab.swift:370-378（群組頁的 quick）都是轉 ProgressView 等它回來才 path.append；NewRoundSheet 在 GroupsTab.swift:467-474 也一樣。Draw.swift:167 的「丟到群組投票」也呼叫 startRound。schema.sql 的 swipe_rounds.id 還是 `uuid primary key default gen_random_uuid()`，可以由用戶端帶 id。這幾段在 a1b57b1 到 ec71aa2 之間都沒改。

**修法**：

(1) Store.swift:133 下面加 `@ObservationIgnored private var roundReady: [String: Task<Bool, Never>] = [:]`。
(2) Store.swift:870-877 的 startRound 改成同步、先在本機建好：
```swift
@MainActor func startRound(_ gid: String, title: String, pool: [Place], filters: [String: AnyCodable]) -> Round? {
    guard let me else { return nil }
    let id = UUID().uuidString.lowercased()
    let r = Round(id: id, group_id: gid, created_by: me, title: title, place_ids: pool.map(\.id), created_at: ISO8601DateFormatter().string(from: .now))
    rounds.insert(r, at: 0)
    roundReady[id] = Task {
        defer { roundReady[id] = nil }
        do {
            let d = try await Supa.write("POST", "swipe_rounds", body: ["id": AnyCodable.s(id), "group_id": .s(gid), "title": .s(title), "filters": .o(filters), "place_ids": .a(pool.map(\.id))])
            if let s = try JSONDecoder().decode([Round].self, from: d).first, let i = rounds.firstIndex(where: { $0.id == id }) { rounds[i] = s }
            saveCache(); return true
        } catch {
            withAnimation(.snappy) { rounds.removeAll { $0.id == id }; swipes.removeAll { $0.round_id == id } }
            pendingSwipes.removeAll { $0.round_id == id }
            say("開不了這輪，請再試一次：" + error.localizedDescription); return false
        }
    }
    return r
}
```
本機那筆在 POST 成功前不要 saveCache，App 被關掉的話下次同步自然就消失。
(3) 原本修法漏了同步會把本機這輪蓋掉：Store.swift:172 的 `if s.rounds != rounds { rounds = s.rounds }` 會在 POST 還沒回來時把它刪掉，RoundView 就變成 GroupsTab.swift:550 的「這輪滑卡不見了」。而且 RoundView 每 5 秒的 syncRound（Store.swift:289-300）遇到新成員也會叫 sync()。改成：
```swift
let keepR = rounds.filter { roundReady[$0.id] != nil && !s.rounds.contains(where: { $0.id == $0.id }) }
let rs = keepR + s.rounds
if rs != rounds { rounds = rs }
```
（closure 裡第二個 $0 要改成具名參數，例如 `let keepR = rounds.filter { r in roundReady[r.id] != nil && !s.rounds.contains { $0.id == r.id } }`。）
(4) swipe（Store.swift:893-903）的 Task 開頭先等這輪建好：`if let ready = roundReady[r.id], await ready.value == false { pendingSwipes.removeAll { $0 == row }; return }`，失敗時 startRound 已經把這輪的 swipes 清掉了。unswipe（Store.swift:906-911）打 DELETE 前也要 `_ = await roundReady[r.id]?.value`，不然 DELETE 可能比 POST 先到。
(5) quickRound（GroupsTab.swift:808-822）拿掉 async，最後一行改成 `return startRound(…)`。GroupsTab.swift:85-93 改成直接 `Haptic.light(); if let r = store.quickRound(g.id) { path = NavigationPath([g]); path.append(r) }`；GroupsTab.swift:370-378 同樣改成直接 append。starting 和兩處 ProgressView（GroupsTab.swift:161、:268）可以拿掉；為了防連點兩下開出兩輪，quick 開頭留一個 `guard path.isEmpty`（群組卡）或 `guard path.count == 1`（群組頁）之類的檢查。NewRoundSheet 的 GroupsTab.swift:467-474 改成 `if let r = store.startRound(…) { onStart(r) }`，busy 可以拿掉。Draw.swift:167 把 await 拿掉即可，那裡本來就先 await share 才開這輪，順序不變。
(6) POST 失敗時 rounds 那筆被拿掉，RoundView 會顯示「不見了」。在 RoundView（GroupsTab.swift:547 的 body）加 `.onChange(of: store.rounds.contains { $0.id == rid }) { _, has in if !has { dismiss() } }`，自動退回群組頁，訊息條說明原因。deleteRound 那條本來就先 dismiss()，不會重複。

**模擬器驗收**：用 Network Link Conditioner 設 3G，在測試群組按群組卡上的「開始滑卡」，確認按下當下就推進滑卡頁、沒有轉圈；群組頁的「開始滑卡」和「自訂條件」那張 sheet 也各測一次。不要在真的群組滑。失敗路徑：改成 100% Loss 再按一次，應該先進滑卡頁，幾秒後自己退回群組頁並出現「開不了這輪」，群組頁不會留下那一輪。最後關掉 Link Conditioner、下拉同步一次，剛才成功開的那輪要還在、沒有重複。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟 U99 都動到 Store.swift:893-911（swipe、unswipe）：U99 要把 unswipe 拆成本機和網路兩段，網路那段要記得加這裡第 (4) 點的 `await roundReady[r.id]?.value`。跟 U98、U99 都在 RoundView 加東西（這裡加 onChange 自動退回），合併時注意。

### U98（P3・體驗）配對畫面按鈕：「繼續滑」用錯字、「就去這間」沒問導航 App、震兩次

**畫面**：配對成功動畫（MatchView）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：在最後一張或結果頁時配對，已經沒卡可滑，第二顆還寫「繼續滑」。「就去這間」沒有 PressStyle，沒選過導航 App 時直接開 Google。celebrate() 和撞頭像各震一次 success，再加上甩卡的 medium。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MatchView 在 GroupsTab.swift:690-743 沒改過：第二顆按鈕 GroupsTab.swift:728-731 寫死「繼續滑」；「就去這間」在 GroupsTab.swift:724-727，直接用 `NavApp.saved ?? .google`，沒選過導航 App 就開 Google，兩顆按鈕都沒有 buttonStyle。震動：celebrate() 在 GroupsTab.swift:685 先 Haptic.success()，MatchView 出現後 GroupsTab.swift:737（頭像撞在一起）又一次，reduce 分支 GroupsTab.swift:735 也是第二次。MatchView 是在 GroupsTab.swift:553 的 overlay 建出來的。

**修法**：

(1) MatchView 加 `let done: Bool`（放在 GroupsTab.swift:693 的 `let match` 下面）。GroupsTab.swift:553 改成：
```swift
.overlay { if let m = match {
    let todoEmpty = store.rounds.first { $0.id == rid }.map { store.todo($0).isEmpty } ?? true
    MatchView(match: m, done: todoEmpty || showResult) { withAnimation(.snappy) { match = nil } }.transition(.opacity)
} }
```
原本只看 todo 為空，但使用者停在結果頁（showResult 為 true）時朋友滑出配對也會跳，那時關掉一樣是回結果頁，所以也算 done。GroupsTab.swift:729 改成 `Text(done ? "看結果" : "繼續滑")`。
(2) 兩顆按鈕都加 `.buttonStyle(PressStyle())`，「就去這間」用 `PressStyle(haptic: true)`。
(3) MatchView 加 `@State private var askNav = false`，「就去這間」的 action 改成 `if let a = NavApp.saved { go(a) } else { askNav = true }`，加一個 `private func go(_ a: NavApp) { if let u = (store.branchesOf(match.place).first ?? match.place).navURL(a) { openURL(u) } }`。在 ZStack 上掛：
```swift
.confirmationDialog("用哪個地圖導航？", isPresented: $askNav, titleVisibility: .visible) {
    ForEach(NavApp.allCases, id: \.self) { a in Button(a.name) { NavApp.saved = a; go(a) } }
} message: { Text("之後可以在「我的」改") }
```
選項和文案跟 PlaceDetail.swift:61-65 一樣。不要先關掉慶祝畫面再問。
(4) 拿掉 celebrate() 裡 GroupsTab.swift:685 的 Haptic.success()。這樣一般情況只剩撞頭像那一下（:737），reduce 分支只剩 :735 那一下，雙震一起修好。手指甩卡的 medium（SwipeDeck.swift:102）在 0.45 秒前，保留。
(5) 原本 sim_test 寫的「Debug 假配對」在 ec71aa2 不存在，要嘛另外做，要嘛用兩台模擬器。建議順手在 RoundView 的 toolbar Menu（GroupsTab.swift:606-611）加一個只在 DEBUG 出現的項目：`#if DEBUG` `Button("假配對") { if let p = store.todo(r).first ?? r.place_ids.compactMap(store.place).first { celebrate(Store.Match(place: p, who: store.membersOf(r.group_id), all: true)) } }` `#endif`。

**模擬器驗收**：先 `xcrun simctl spawn booted defaults delete io.github.gop9632.foodmap navApp` 清掉導航設定。在測試群組的測試輪次用 DEBUG 的「假配對」叫出配對畫面（或用兩台模擬器登兩個測試帳號，同一間都往右滑）。確認只震一次；按「就去這間」先跳「用哪個地圖導航？」選單，慶祝畫面還在後面，選完才開地圖。再叫一次，這次直接開剛選的 App。在還有卡時第二顆寫「繼續滑」；切到「看結果」或滑完最後一張時寫「看結果」。兩顆按下去都有縮一下的回饋。開啟「減少動態效果」再測一次，也只震一次。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟 U99 都改 RoundView（GroupsTab.swift:536-688）：U98 改 :553 的 overlay 和 :685 的 celebrate，U99 改 :544 的 history、:593-597 的 onSwipe、:619-624 的 undo，位置不重疊，但同一個 struct，合併時注意。跟 U97 第 (6) 點也在 RoundView 加修飾子。

### U99（P3・滑順）收回上一張時卡片原地淡入，不是從滑走的那邊飛回來

**畫面**：滑卡頁按 ↶ 上一張

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：unswipe 後卡片用預設的 insertion 轉場，在原地淡入放大，空間的連續感斷掉。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：SwipeDeck.swift 在 a1b57b1 到 ec71aa2 之間完全沒改：SwipeDeck.swift:76 的卡片進場還是 `.opacity.combined(with: .scale(scale: 0.9))`，原地淡入放大。RoundView 的 history 在 GroupsTab.swift:544 只存 id（[String]），沒存往哪邊滑。undo 在 GroupsTab.swift:619-624 是先 withAnimation 把 showResult 關掉，再開一個 Task 呼叫 Store.swift:906-911 的 unswipe；unswipe 裡雖然有先拿掉 swipe 再打 API，但它在 Task 裡，跟按鈕不是同一個 transaction，所以卡片插回來的動畫跟收回動作是分開的。

**修法**：

(1) 方向存在 RoundView 的 history 就好（RoundView 不會因為切結果頁重建，結果頁按收回也拿得到）。在 SwipeDeck 裡加 `struct Back: Equatable { let id: String; let like: Bool }`；GroupsTab.swift:544 改成 `@State private var history: [SwipeDeck.Back] = []`，再加 `@State private var returning: SwipeDeck.Back?`。GroupsTab.swift:595 改成 `history.append(.init(id: p.id, like: liked)); returning = nil`。
(2) Store.swift:906-911 的 unswipe 拆成兩個：
```swift
@MainActor func unswipeLocal(_ r: Round, _ pid: String) -> SwipeRow? {
    guard let me, let row = swipes.first(where: { $0.round_id == r.id && $0.user_id == me && $0.place_id == pid }) else { return nil }
    swipes.removeAll { $0 == row }; pendingSwipes.removeAll { $0 == row }
    return row
}
@MainActor func unswipeRemote(_ r: Round, _ row: SwipeRow) async {
    do { try await Supa.write("DELETE", "swipes", query: "round_id=eq.\(r.id)&user_id=eq.\(row.user_id)&place_id=eq.\(row.place_id)"); saveCache() }
    catch { swipes.append(row); say("收回失敗：" + error.localizedDescription) }
}
```
GroupsTab.swift:619-624 的 undo 改成：
```swift
private func undo(_ r: Round) {
    guard let b = history.popLast() else { return }
    Haptic.light()
    returning = b
    var row: SwipeRow?
    withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { showResult = false; row = store.unswipeLocal(r, b.id) }
    if let row { Task { await store.unswipeRemote(r, row) } }
}
```
(3) SwipeDeck 加 `var returning: Back? = nil` 和 `@State private var back: CGFloat`。原本修法只寫了 insertion 轉場，這在「從結果頁按收回」時不會動：那時整個 SwipeDeck 是新插進來的（GroupsTab.swift:569 的 if/else 換分支），子視圖的 transition 不會跑。所以要兩種情況分開處理：
- 牌組本來就在畫面上（按 ↶ 上一張）：SwipeDeck.swift:76 改成 `.transition(top && returning?.id == p.id && !reduce ? .asymmetric(insertion: .offset(x: returning!.like ? 600 : -600), removal: .identity) : .asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.9)), removal: .identity))`。
- 從結果頁回來（SwipeDeck 新建）：寫一個 init，`_back = State(initialValue: (returning != nil && deck.first?.id == returning?.id) ? (returning!.like ? 600 : -600) : 0)`，ZStack 加 `.onAppear { if back != 0 { withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { back = 0 } } }`。SwipeDeck.swift:57 的最上面那張 offset 寬度改成 `drag.width + back`，SwipeDeck.swift:61 的角度改成 `(drag.width + back) / 16`，飛回來時會帶一點歪。State 的初始值只在第一次建立時用，所以不會影響第一種情況。reduce motion 時 back 一律給 0。
GroupsTab.swift:593 傳 `returning: returning` 進 SwipeDeck。
(4) 不要改 drag，那會讓現在最上面那張先被推出畫面。

**模擬器驗收**：在測試群組的測試輪次往右甩一張，按 ↶，確認卡片從右邊飛回最上面；往左甩一張再按 ↶，要從左邊飛回來。接著把最後一張滑完進結果頁，按「↶ 收回上一張」，滑卡畫面出來時那張也要從剛才甩出去的那邊飛回來，不是原地淡入。開「減少動態效果」再按一次，應該只淡入。連續快速甩三張再連按三次 ↶，每張都從各自的方向回來。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟 U97 都動 Store.swift:893-911：unswipeRemote 打 DELETE 前要加 U97 第 (4) 點的 `_ = await roundReady[r.id]?.value`。另外 swipe 的 POST 如果還在路上就被收回，POST 可能比 DELETE 晚到，伺服器會留下那筆，這是 ec71aa2 原本就有的競態，U97 的排隊不會解掉它；要處理的話 unswipeRemote 先等該筆 swipe 的 Task 結束。跟 U98 同在 RoundView，位置不重疊。

### U100（P3・畫面）「從收藏加入」是系統 List，也沒有搜尋

**畫面**：群組頁 →「從收藏加入」（PickSheet）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：違反規格共通原則「不要系統 List 樣式」；B3 沒列到 PickSheet，所以漏掉了。收藏一兩百間時只能往下捲，「取消」「全選」擠在左上，「加入」在右上，單手按不到。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：GroupsTab.swift 在 ec71aa2 到 acd4471 之間沒有改，MapTab.swift 的 NoAddressSheet 那段也沒改，只是行號因為前面加了程式往後移。PickSheet 在 GroupsTab.swift:495-533（:496 struct）：:503 的清單是 store.mine 原順序，沒有照距離排；:505 還是系統 List，沒有搜尋；「取消」「全選」在 :525-526 擠在左上，「加入」在 :527-529 右上；空狀態是 :522 的 ContentUnavailableView。NoAddressSheet 在 MapTab.swift:1901-1928（:1902 struct），:1910 也是 List，:1922 是 ContentUnavailableView。

**修法**：

(1) PickSheet（GroupsTab.swift:496-533）整個換成下面這版。清單改成 ScrollView 加 LazyVStack、奶油底，最近的排前面，最上面一列是搜尋框和「全選／取消全選」，全選只作用在過濾後的清單，底部放全寬的主按鈕：
```swift
struct PickSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let gid: String
    @State private var pick: Set<String> = []
    @State private var q = ""

    var body: some View {
        let all = store.nearFirst(store.mine.filter { !store.shared($0.id, gid) })
        let key = q.trimmingCharacters(in: .whitespaces)
        let list = key.isEmpty ? all : all.filter { $0.name.localizedCaseInsensitiveContains(key) || $0.area.localizedCaseInsensitiveContains(key) || ($0.branch ?? "").localizedCaseInsensitiveContains(key) }
        let allOn = !list.isEmpty && list.allSatisfy { pick.contains($0.id) }
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10) {
                    if !all.isEmpty {
                        HStack(spacing: 8) {
                            SearchField(text: $q, prompt: "搜尋店名、地區")
                            if !list.isEmpty {
                                Button(allOn ? "取消全選" : "全選") {
                                    Haptic.light()
                                    if allOn { pick.subtract(list.map(\.id)) } else { pick.formUnion(list.map(\.id)) }
                                }
                                .font(.subheadline.weight(.heavy)).foregroundStyle(Color.accentDeep)
                                .frame(minWidth: 44, minHeight: 44)
                            }
                        }
                    }
                    ForEach(list) { p in row(p) }
                    if list.isEmpty {
                        Text(all.isEmpty ? "你的收藏都已經在群組裡了" : "沒有符合「\(key)」的店")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.6))
                            .frame(maxWidth: .infinity).padding(.vertical, 28).candy(16)
                    }
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.immediately)
            .background(Color.bg)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !all.isEmpty {
                    Button { let ids = Array(pick); Task { await store.share(gid, ids) }; dismiss() } label: {
                        Text(pick.isEmpty ? "選要加入的店" : "加入 \(pick.count) 間").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(ChunkyStyle(color: pick.isEmpty ? Color.gray.opacity(0.4) : .accent, edge: pick.isEmpty ? .clear : .accentDeep, radius: 16))
                    .disabled(pick.isEmpty)
                    .padding(.horizontal, 16).padding(.vertical, 10).background(Color.bg)
                }
            }
            .navigationTitle("從我的收藏加入").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
        }
    }

    private func row(_ p: Place) -> some View {
        let on = pick.contains(p.id)
        return Button {
            Haptic.light()
            pick.formSymmetricDifference([p.id])
        } label: {
            HStack(spacing: 12) {
                PhotoView(place: p, px: 160).frame(width: 54, height: 54).clipShape(.rect(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    Text("\(p.cat.emoji) \(p.cat.name)\(p.area.isEmpty ? "" : "・" + p.area)")
                        .font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.title2)
                    .foregroundStyle(on ? Color.accent : Color.secondary)
            }
            .padding(10).candy(16).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
```
說明：SearchField 用 Theme.swift:131-133 不帶 trailing 的 init；ChunkyStyle（Theme.swift:13-17）可以傳 color 和 edge，沒選的時候換成灰底、拿掉下緣，比照 NewRoundSheet（GroupsTab.swift:476-477）看得出不能按。勾選的狀態在搜尋換字時會保留，底部數字算的是全部勾過的，這是刻意的。分類 chip 先不加。
(2) 原本修法說「取消靠往下滑關閉」，這點修正：已經勾了一堆再不小心往下滑，選的東西會無聲消失，所以左上「取消」留著，拿掉的只有左上的「全選」和右上的「加入」。想更保險可以在 NavigationStack 後面加 `.interactiveDismissDisabled(!pick.isEmpty)`，勾了東西就只能按取消或加入離開，這點給 Anthony 決定，先不加。
(3) NoAddressSheet（MapTab.swift:1908-1925）的 NavigationStack 內容換成下面這段，「完成」留在右上，清單通常很短，不加搜尋：
```swift
NavigationStack {
    ScrollView {
        LazyVStack(spacing: 10) {
            ForEach(list) { p in
                Button { editing = p } label: {
                    HStack(spacing: 12) {
                        PhotoView(place: p, px: 160).frame(width: 52, height: 52).clipShape(.rect(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                            Text(p.address?.isEmpty == false ? "地址找不到位置，點一下改" : "點一下補地址").font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "pencil").foregroundStyle(Color.accent)
                    }
                    .padding(10).candy(16).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
            }
            if list.isEmpty {
                Text("都在地圖上了 🎉").font(.headline).foregroundStyle(Color.ink)
                    .frame(maxWidth: .infinity).padding(.vertical, 28).candy(16)
            }
        }
        .padding(16)
    }
    .background(Color.bg)
    .navigationTitle("還沒有地址").navigationBarTitleDisplayMode(.inline)
    .toolbar { Button("完成") { dismiss() } }
    .sheet(item: $editing) { EditSheet(place: $0) }
}
```
:1907 的 `let list = ...` 不動。

**模擬器驗收**：在測試群組按「從收藏加入」，確認是奶油底加圓角小卡、不是系統 List，有開定位時最近的店排在前面。搜尋一個店名或地區，清單有跟著過濾；按「全選」只勾到過濾後那幾間，按鈕字變成「取消全選」，再按一次只取消那幾間。底部按鈕沒勾時是灰底「選要加入的店」、按不下去，勾了以後變成「加入 N 間」、數字正確、單手按得到。勾幾間後按左上「取消」，sheet 關掉、群組沒有多店。搜尋一串對不到的字，看到「沒有符合「…」的店」卡。不要真的按加入。地圖左下「N 間還沒有地址」那張 sheet 也打開看一次樣式，點一列能進編輯。字級開到 xxxLarge 看搜尋列和全選鈕沒有擠壞。

**注意**：GroupsTab.swift 這次的 a45ce70 到 acd4471 沒改，fix-v11-acd4471.md、perf-round1b.md 也都沒碰 PickSheet。NoAddressSheet 在 MapTab.swift 檔尾，a45ce70 到 acd4471 加的程式都在前段（:84-105、:178-181、:220、:235-240、:543-559、:688-737、:848、:1512-1513、:1574），fix-v11 的 TouchSpy 掛在 ListPullDown，perf-round1b 4.A 的 EmojiArt 放在 MapTab.swift 檔尾，跟 NoAddressSheet 是不同 struct，合併時只是行號位移，照程式片段搜尋就好。跟 U94 同在 GroupsTab.swift，不同 struct。若同時做 U122，SearchField 的高度改 minHeight 也會套到這裡的搜尋框，沒有衝突。

### U101（P3・畫面）「調整條件」表單的預設值和一鍵開不一樣，取消也跑到右上

**畫面**：群組頁 →「調整條件」（NewRoundSheet）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：預設是「時段不限、15 張」，一鍵開是「這一餐、10 張」；這一餐不到 3 家時一鍵開會自動放寬時段。「取消」用預設擺位，跑到右上。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：a1b57b1 到 ec71aa2 之間 NewRoundSheet 完全沒動（GroupsTab.swift 的 diff 只改了邀請碼、頭像、⋯ 圖示）。GroupsTab.swift:417 還是 `@State private var meal = ""`，:419 還是 `max = 15`；:470 照樣 `pool.shuffled().prefix(max)` 隨機挑；:480 底部還是 `.background(.bar)`；:483 的「取消」還是 `.toolbar { Button("取消") ... }` 沒指定 placement，會跑到右上。一鍵開的 quickRound 在 GroupsTab.swift:808-820，用的是這一餐、最多 10 張，:818 不到 3 家就放寬時段，跟表單預設對不起來。

**修法**：

(1) GroupsTab.swift:483 改成 `.toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }`，取消就會回到左上。
(2) GroupsTab.swift:417 改成 `@State private var meal = Drawer.meal().key`，:419 改成 `@State private var max = 10`。接著在 :482 的 `.navigationTitle("開始滑卡")` 後面加一行 `.onAppear { if pool.count < 3 { meal = "" } }`，這一餐篩出來（分店合併後）不到 3 家就退回「不限」，跟 quickRound 在 :818 的判斷一樣。只在 onAppear 做一次，之後使用者自己點時段就不再改它。按「開始」時 :471 的 filters 直接用 meal，所以退回後送出去的也會是空字串，跟一鍵開一致。
(3) 要不要把 :470 的 `pool.shuffled().prefix(max)` 改成跟一鍵開一樣取最近的前 N 張（pool 在 :424-433 已經是 nearFirst 排好的），仍然交給 Anthony 決定；隨機是刻意跟網頁版 nrPool 一致。
(4) 選做：:480 的 `.background(.bar)` 換成 `.background(Color.panel)`，跟抽一間面板底部（Draw.swift:363）同一種實色底。

**模擬器驗收**：在測試群組點「調整條件」：確認時段預設亮的是現在這一餐（例如晚上 8 點是晚餐）、最多幾張亮 10、「取消」在左上。再找一個這一餐符合不到 3 家的測試群組打開，確認時段自動停在「不限」。不要按「開始滑」。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊（那份只動 MapTab 的地圖選取、blankTap、zoom 和 TripPanel）。同一批的 U103 也改 GroupsTab.swift，但改的是 GroupCard（:125-201），跟 NewRoundSheet（:409-493）不同段，不會打架。

### U103（P3・畫面）群組卡片的狀態列在窄螢幕或朋友名字長時被截斷

**畫面**：群組分頁的群組卡片（有配對、又有人還沒滑完）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：status 的 padding(.trailing, 110) 讓出位置給「開始滑卡」，按鈕不會壓到文字，但空間太窄。375 寬或名字長時，「這輪：X 還有 N 張沒滑」會被截掉，偏偏這是 B3 要的重點資訊。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupCard 在 4a05adb 只把頭像疊改成固定寬度（GroupsTab.swift:142），狀態列沒動。GroupsTab.swift:149-150 還是 `status(mem).padding(.trailing, 110)`；:191-192 的「這輪：X 還有 N 張沒滑」還是 `.lineLimit(1)`，名字長或 375 寬就會被截掉；配對膠囊（:185-189）也在同一列擠空間。「開始滑卡」仍是 :158-175 的 overlay。

**修法**：

保留 B3 版面，不要把「開始滑卡」搬進卡片的 Button（會變成按鈕包按鈕）。把 GroupsTab.swift:190-192 換成：
```swift
if let who {
    let name = who.0 == store.me ? "你" : store.name(who.0)
    ViewThatFits(in: .horizontal) {
        Text("這輪：\(name) 還有 \(who.1) 張沒滑")
        Text("\(name) 剩 \(who.1) 張")
        Text("還有人剩 \(who.1) 張")
    }
    .font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.65)).lineLimit(1)
}
```
多放第三個短句，是因為名字本身很長時第二句也可能放不下，最後一句保證「剩幾張」一定看得到。如果比較想要簡單做法，也可以只把 :192 的 `.lineLimit(1)` 改成 `.lineLimit(2)`，但兩行會把卡片撐高，和「開始滑卡」對齊會變。把配對膠囊移到群組名那一列的做法要先問 Anthony。

**模擬器驗收**：iPhone SE（3rd）和 iPhone 16 模擬器，在有配對、朋友名字較長（例如 10 個字以上）的測試群組截群組卡，確認看得到「剩 N 張」，而且字不會壓到右下的「開始滑卡」。名字短的群組要顯示完整句「這輪：X 還有 N 張沒滑」。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批 U101 也在 GroupsTab.swift，但改的是 NewRoundSheet，不同段。

### U118（P3・畫面）群組頁和滑卡頁還是系統導覽列，和店家頁的白方塊圓鈕不一致

**畫面**：群組頁（GroupView）、滑卡頁（RoundView）頂部

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：小號系統字標題、橘色系統文字鈕「看結果／繼續滑」；在 iOS 26 SDK 下 toolbar 按鈕還會被包成 Liquid Glass 圓泡。⋯ 圖示已在 4a05adb 改成 MoreIcon，這項只追剩下的整條頂部樣式。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupsTab.swift:346-356 群組頁還是 .navigationTitle(g.name)、.navigationBarTitleDisplayMode(.inline)、.backButton() 加系統 .toolbar，右上 ⋯ 是 Menu 包 MoreIcon。GroupsTab.swift:600-612 滑卡頁一樣，「看結果／繼續滑」還是 toolbar 裡的系統文字 Button（:605）。a1b57b1 到 ec71aa2 這兩段只有 4a05adb 把 ⋯ 換成 MoreIcon（GroupsTab.swift:825-831），整條頂部的樣式沒動。Theme.swift 這段完全沒改過，CircleIcon 在 Theme.swift:152-161，BackButton 和 backButton() 在 Theme.swift:163-181。店家頁的頂列在 3dd40e3 改成 .safeAreaInset(edge: .top)（PlaceDetail.swift:43-47），top() 本身在 PlaceDetail.swift:74-91。

**修法**：

(1) Theme.swift 在 CircleIcon（:152-161）後面加共用的頂列，做法照抄 PlaceDetail.swift:74-91 的 top()：
```swift
// 群組、配對頁最上面一排：跟店家頁同一套白方塊圓鈕。返回在左，標題接在後面，右邊放各頁自己的鈕
struct PageHeader<Trailing: View>: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let title: String
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(spacing: 10) {
            Button { store.pop(dismiss) } label: { CircleIcon(icon: "chevron.left") }
                .buttonStyle(PressStyle()).accessibilityLabel("返回")
            Text(title).font(.system(size: 22, weight: .black)).foregroundStyle(Color.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            trailing
        }
        .padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 8)
        .background(Color.bg)
    }
}
```
標題我改成靠左接在返回鈕後面，不放正中間：滑卡頁右邊會有「看結果」膠囊加 ⋯，比左邊寬很多，放在剩下空間的中間看起來會歪。
(2) GroupView：刪掉 GroupsTab.swift:348 的 .navigationBarTitleDisplayMode、:349 的 .backButton()、:350-356 整段 .toolbar，在 :346 的 .background(Color.bg) 後面接：
```swift
.toolbarVisibility(.hidden, for: .navigationBar)
.safeAreaInset(edge: .top, spacing: 0) {
    PageHeader(title: g.name) {
        Menu {
            Text("邀請碼 \(g.invite_code)")
            Button(g.owner == store.me ? "刪除群組" : "退出群組", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { leaving = true }
        } label: { CircleIcon(icon: "ellipsis") }
        .accessibilityLabel("更多")
    }
}
```
.navigationTitle(g.name) 可以留著，不會顯示。這些 modifier 要加在 content(g) 裡面，不要加在 body 那層，這樣「群組不見了」那個 ContentUnavailableView 還保有系統返回鈕。
(3) RoundView：同樣刪掉 GroupsTab.swift:602-612 的 .navigationBarTitleDisplayMode、.backButton()、.toolbar，在 :600 的 .background(Color.bg) 後面接：
```swift
.toolbarVisibility(.hidden, for: .navigationBar)
.safeAreaInset(edge: .top, spacing: 0) {
    PageHeader(title: r.title.isEmpty ? "一起決定吃什麼" : r.title) {
        HStack(spacing: 6) {
            if !todo.isEmpty {
                Button { withAnimation(.snappy) { showResult.toggle() } } label: {
                    Text(showResult ? "繼續滑" : "看結果").font(.subheadline.weight(.heavy)).foregroundStyle(Color.accentDeep)
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(Color.accent.opacity(0.13), in: .capsule)
                        .frame(minHeight: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
            }
            if store.canDelete(r) {
                Menu {
                    Button("刪除這輪", systemImage: "trash", role: .destructive) { dropping = true }
                } label: { CircleIcon(icon: "ellipsis") }
                .accessibilityLabel("更多")
            }
        }
    }
}
```
膠囊的底色要寫在 label 裡（跟 GroupsTab.swift:313-319「從收藏加入」同一種寫法），寫在 Button 外面的話按下時只有字縮、底不縮。
(4) 收尾：改完後 MoreIcon（GroupsTab.swift:825-831）和 BackButton、backButton()（Theme.swift:163-181）都沒人用了，一起刪掉。
(5) 右滑返回不用另外處理：Nav.swift:75-90 已經在導覽列藏起來時把邊緣和整頁右滑的手勢搶回來，店家頁就是靠這個。

**模擬器驗收**：iOS 26 模擬器進測試群組、它的滑卡頁（滑卡中和看結果兩種狀態）、店家頁，各截一張頂部，比對返回鈕和 ⋯ 是同一顆白方塊，頂列沒有 Liquid Glass 圓泡。按住返回會縮，放開回上一頁。從左邊緣和畫面中間往右滑都能回上一頁，在滑卡牌上往右滑要是滑卡不是返回。群組頁往下拉更新還能用，轉圈出現在頂列下面。按「看結果」「繼續滑」會切換，膠囊按住會縮。在 iPhone SE 尺寸確認滑卡牌沒有被頂列擠得太小。最後刪掉一個群組，確認「群組不見了」那頁還有系統返回鈕。

**注意**：跟 U121 重疊：群組頁和滑卡頁的 ⋯ Menu 會搬進 PageHeader 的 trailing，U121 要加的按壓手感也要套在這兩顆新的上面，建議 U118 先做、U121 再一起套。跟 U119 改的是同一個 GroupView.content，但一個在頂列、一個在頭像那行，不衝突。跟 fix-addcard-ec71aa2.md 沒有重疊（那份只動 MapTab 和 TripPanel）。

### U119（P3・畫面）群組頁頭像沒有上限，人多時名字被擠掉、「在地圖上看」被推出畫面

**畫面**：群組頁最上面一行（成員多、375pt 寬）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：外層 HStack(spacing: −8) 把負間距也套到名字和按鈕上，頭像也沒有 prefix。6 人時名字只剩 2～3 字，8 人幾乎只剩「…」，9 人以上按鈕被推出畫面或裁掉。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupsTab.swift:244-261 跟 a1b57b1 一模一樣：外層 HStack(spacing: -8)，:245 ForEach(mem) 沒有 prefix，:246 還是 Spacer().frame(width: 18)。4a05adb 只改了群組分頁卡片的頭像（GroupsTab.swift:138-142 固定寬度、prefix(4)），群組頁裡面這行沒改。

**修法**：

把 GroupsTab.swift:244-248 換成下面這樣，:249-260 的「在地圖上看」按鈕原封不動接在後面：
```swift
HStack(spacing: 10) {
    // 最多 4 個頭像，多的人收成一顆「+N」（跟群組分頁的卡片一樣最多 4 個）
    HStack(spacing: -8) {
        ForEach(Array(mem.prefix(4)), id: \.self) { Avatar(name: store.name($0), id: $0, size: 36) }
        if mem.count > 4 {
            Text("+\(mem.count - 4)").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.6))
                .frame(width: 36, height: 36)
                .background(Color.bg2, in: .circle)
                .overlay(Circle().strokeBorder(Color.bg, lineWidth: 2))
        }
    }
    Text(mem.map { store.name($0) }.joined(separator: "、")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
    Spacer(minLength: 0)
    // 原本 :249-260 的「🗺 在地圖上看」按鈕
}
```
Spacer().frame(width: 18) 刪掉，外層已經有 10 的間距；原本的 Spacer(minLength: 8) 改成 minLength 0，因為間距已經算進去。按鈕本身有 .fixedSize()，名字會先被截成「…」，按鈕不會再被推出去。375 寬估算：4 顆頭像加 +N 約 148pt，按鈕約 117pt，名字還剩 50pt 左右。

**模擬器驗收**：在 375 寬模擬器（iPhone SE）分別開 3 人、6 人、9 人以上的測試群組截頂部那行：3 人時沒有「+N」；6 人時是 4 顆頭像加「+2」；9 人時是「+5」。每一種「🗺 在地圖上看」都完整、點得到，名字太長時被截成「…」。

**注意**：跟 U118 改的是同一個 GroupView.content(g)，U118 在 ScrollView 外面加頂列，這項只改裡面第一行，可以分開套。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U120（P3・滑順）按住群組卡時卡片縮小，「開始滑卡」不動，看起來像兩層

**畫面**：群組分頁的群組卡片（按住卡片時）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：「開始滑卡」是加在卡片 Button 外面的 overlay，按住時卡片縮 0.96，膠囊不動，相對位置偏約 7pt。膠囊沒有凸出卡外。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupsTab.swift:135-157 卡片是一顆 Button，套 PressStyle()；GroupsTab.swift:158-174「開始滑卡」還是掛在卡片 Button 外面的 .overlay(alignment: .bottomTrailing)，所以按住卡片時只有卡片縮 0.96，膠囊不動。Theme.swift:30-43 的 PressStyle 沒改過，只有 haptic 和 onPress 兩個參數，onPress 只在按下那一刻叫一次，沒有放開的通知，也沒有 scale 參數。

**修法**：

(1) Theme.swift:30-43 的 PressStyle 加兩個參數，其他用到 PressStyle 的地方行為不變：
```swift
struct PressStyle: ButtonStyle {
    var haptic = false   // 手指一按下就輕震（不等放開）
    var scale: CGFloat = 0.96   // 按住時縮多少；1＝自己不縮，交給外面一起縮
    var onPress: (() -> Void)? = nil   // 手指一按下就先做的事（例如先拿影片網址）
    var pressed: Binding<Bool>? = nil   // 按住、放開都回報，給外面整組一起縮用
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(configuration.isPressed ? .easeOut(duration: 0.08) : .spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, down in
                pressed?.wrappedValue = down
                guard down else { return }
                if haptic { Haptic.light() }
                onPress?()
            }
    }
}
```
原本的修法說要「加一個按壓回呼」，但 onPress 已經存在而且只管按下，所以改成加一個 pressed 綁定。pressed 一定要放在 onPress 後面：現在有 PressStyle { long = false }（Draw.swift:203）、PressStyle { ReelCache.warm(p) }（ListTab.swift:60、GroupsTab.swift:336、MapTab.swift:1101）這種尾隨閉包寫法，要讓它們繼續對到 onPress。
(2) GroupCard（GroupsTab.swift:125-175）加 `@State private var down = false`，body 改成用 ZStack 包兩顆按鈕，整組一起縮：
```swift
ZStack(alignment: .bottomTrailing) {
    Button(action: open) { /* 原本 :136-155 的卡片內容 */ }
        .buttonStyle(PressStyle(scale: 1, pressed: $down))
    Button(action: start) { /* 原本 :160-167 的膠囊 */ }
        .buttonStyle(PressStyle())
        .disabled(count == 0 || starting)
        .opacity(count == 0 ? 0.45 : 1)
        .padding(.trailing, 14).padding(.bottom, 12)
        .accessibilityLabel("在「\(group.name)」開始滑卡")
}
.scaleEffect(down ? 0.96 : 1)
.animation(down ? .easeOut(duration: 0.08) : .spring(response: 0.25, dampingFraction: 0.7), value: down)
```
:157 的 .buttonStyle(PressStyle()) 和 :158 的 .overlay 一起拿掉。單獨按「開始滑卡」時卡片的 isPressed 不會變，所以只有膠囊自己縮。

**模擬器驗收**：群組分頁按住一張群組卡不放：卡片和「開始滑卡」一起縮，相對位置不變，放開一起彈回並打開群組。單獨按住「開始滑卡」：只有膠囊縮，放開開一輪。按住卡片後往上捲：卡片要彈回、不打開。店數 0 的群組，膠囊變淡、按不下去，按卡片照樣能開。另外隨便點幾個原本用 PressStyle { ... } 的地方（收藏卡、抽一間膠囊）確認手感沒變。

**注意**：跟 U121 共用這次加的 PressStyle(scale:pressed:)：U121 的 TripTop 行程膠囊要用同一招讓名字、摘要、第 N 天一起縮，所以 U120 要先做。兩項改的都是 Theme.swift 的 PressStyle，參數都有預設值，不衝突。跟 fix-addcard-ec71aa2.md 沒有重疊。
