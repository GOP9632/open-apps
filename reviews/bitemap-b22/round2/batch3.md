# 第 2 輪第 3 批　P2：群組與滑卡

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 9 項：U38 「開始滑卡」不管這輪滑完沒有都開新的一輪，票被拆散、U40 剪貼簿膠囊把邀請連結當成店去找、U41 滑卡時卡片不在手指底下，往右拖一路往下沉，飛走時往右下俯衝、U42 甩出去的卡先頓一下才加速飛走、U44 最後一張沒飛完就換成結果頁，切換時版面先擠再跳、U45 配對成功畫面蓋不住導覽列，返回鍵和「看結果」還能按、U50 藏起來的分頁登記的「不准右滑返回」區域一直有效，別的分頁右滑返回失效、U62 移除朋友分享的店，當下看起來成功，下次同步又冒回來、U63 「我也想去」連按兩下會存成兩間，按下時也沒有震動

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是對照 a10704d 重新整理、再由反方檢查過的：這批裡（或跟第 1 到 5 批其他項）有兩項以上改到同一段程式、照各項寫法依序套會打架的地方，以及跟 V11、perf-round1b、perf-round1c 重疊的地方。同一組衝突只在最後做到的那批寫完整寫法，前面那批留一條短的，說先守住什麼。行號是 a10704d 的。

各項內文已經吸收了舊的合併注意。內文裡還看得到的「第 N 批合 K」「合 N」是舊編號，已經作廢，內容都併進這裡了，不用回頭找。合併做法裡寫「某項的某句改成……」的，做的時候就照改過的那句。各項內文跟這裡衝突時照這裡。

### 合1　U40、U04（第 1 批）

**位置**：Store.swift:837-844（U04 在 join() 前面加了 openInvite）、Onboard.swift:146-147、FoodMapApp.swift:68-72、Edit.swift:100-105、GroupsTab.swift:805-823

**問題**：第 1 批的 U04 已經對照 d95fd43 重寫，而且會先做。它在 Store.swift:837 的 join() 前面加了 `@MainActor func openInvite(_ code: String) async`（join 成功後設 groupJump、切到群組分頁），join() 開頭先把碼 trim 再 lowercased，已經在群組裡就說「你已經在「X」裡了」並回傳 gid；FoodMapApp.swift:68-72 的 .onOpenURL 也被它搬到最外層 Group，改走 setPendingJoin 和 takePendingJoin。U40 本文還是 ec71aa2 時寫的，有四個地方會打架。第一，(1) 要在 GroupsTab.swift:822 後面的 extension Store 再寫一份同步的 openInvite，裡面用 caseInsensitiveCompare 判斷是不是成員，是的話什麼都不說。Swift 允許只差在 async 的同名函式並存，所以兩份會一起編過，不會有任何警告；Onboard 的 pasted() 是同步函式，會選到 U40 那份，貼上自己已經在的群組時不會出現「你已經在「X」裡了」，跟 U04 驗收第 4、8 步的說法不一致。正因為編得過，這個錯不會被發現。第二，(2) 在同步的 pasted() 裡直接寫 `store.openInvite(c)`，換成 U04 那份要包在 Task 裡 await。第三，(3) 要改的 FoodMapApp.swift:69 在 U04 之後已經不在原位；如果把 openInvite 或 join 塞進 U04 新的 onOpenURL，沒登入時雲端會回「加入失敗：請先登入」，pendingJoin 等於白做。第四，(4) 寫「在 Edit.swift:100 的 go() 裡加同一段判斷」，可是 go()（Edit.swift:100-105）裡沒有 t，只有 @State 的 input，照字面編不過；而且 :102 已經有一個 Haptic.light()，判斷裡如果再震一次，會震兩下。U04「要等別項的地方」給 U40 (4) 的那行也有同樣的 t 的問題。舊的合併注意給過一個同步版 openInvite、join 裡用 caseInsensitiveCompare 的合併程式，跟 U04 最後定的寫法不同，已經作廢。

**合併做法**：

U40 (1) 整條不做，Store 裡只留 U04 加在 Store.swift:837 join() 前面那份 async 的 openInvite，也不要動 U04 改好的 join() 開頭（trim 加 lowercased 再比，rpc 傳同一個 c）。U40 那份同步版就算照抄進 GroupsTab.swift:822 後面的 extension Store 也不會報錯，可是 Onboard 會走到沒有「你已經在「X」裡了」的那份，所以一定不能加。U40 注意裡「跟 U38 加在同一個 extension Store，小心不要互相覆蓋」也就不用管了。
(2) 在 Onboard.swift:146 的 guard 後面、:147 `let k = Self.key(t)` 前面插入：
```swift
        // 朋友的邀請連結或整段邀請訊息：不當成店去找，直接加入或打開那個群組
        if t.contains("anthony-apps.netlify.app/join") || t.contains("邀請碼"), let c = FoodGroup.code(in: t) {
            Haptic.light()
            Task { await store.openInvite(c) }
            return
        }
```
膠囊要 store.loggedIn 才會出現（Onboard.swift:80），所以這裡直接 openInvite 就好，不用走 pendingJoin。ClipWatch 是 @MainActor 類別，這個 Task 編得過。
(3) 整條不做。點邀請連結開 App 的路由由 U04 處理（onOpenURL 在最外層 Group，走 setPendingJoin 和 takePendingJoin），不要把 openInvite 或 join 放進新的 onOpenURL，沒登入時雲端會回「請先登入」。
(4) 選配。要做的話，Edit.swift:100-105 的 go() 整個換成下面這樣，Haptic 只在開頭震一次，邀請那段裡面不要再震：
```swift
    private func go() {
        focus = false
        Haptic.light()
        let t = input.trimmingCharacters(in: .whitespacesAndNewlines)
        // 把邀請訊息貼進新增框：直接加入並打開群組，不走找店
        if t.contains("anthony-apps.netlify.app/join") || t.contains("邀請碼"), let c = FoodGroup.code(in: t) {
            Task { await store.openInvite(c) }
            dismiss()
            return
        }
        store.startAdd(t, been: been, rating: been ? rating : nil)
        dismiss()
    }
```
U04「要等別項的地方」裡給 U40 的寫法以這裡為準。
驗收：U40 第 1、3、4 步照舊。第 2 步的預期改成：直接打開那個群組，訊息條說「你已經在「X」裡了」，Xcode console 沒有 join_group 的請求。第 5 步（從 Safari 點邀請連結）照留，現在測的是 U04 的 onOpenURL 那條路，已經是成員時結果要跟 U04 驗收第 4 步一樣。

### 合2　U38、U36（第 4 批）

**位置**：GroupsTab.swift:133-134（GroupCard 的 mem、count）、GroupsTab.swift:158-174（GroupCard 的「開始滑卡」膠囊，:169-171）、GroupsTab.swift:240、:266-273（GroupView 的主按鈕）

**問題**：第 4 批 U36 第 (4) 點也改這兩顆按鈕（PressStyle 加 dim、刪掉 :171 的 opacity），而且它的說明把狀態叫 b、b.isNew，跟 U38 本文的 act、isNew 對不上。U36 加的 dim 參數要到第 4 批才有。這組衝突的完整寫法放在第 4 批，因為做到 U36 的時候 U38 已經做好了。這批要先知道的是變數名字，和這批能寫到哪裡。

**合併做法**：

U38 照本文做，狀態變數就叫 act 和 isNew（isNew 是 act 為 .new 時的 Bool）：GroupCard 在 body 開頭、:133-134 的 mem、count 後面算；GroupView 在 :240 那行 `let mem = …, list = …, rounds = …` 後面用同樣的名字再算一次。不要改叫 b，第 8 批的合併注意，U97、U120、U38 和 U36 那條也是用 act、isNew。這批還沒有 PressStyle 的 dim 參數，膠囊照舊寫 `.buttonStyle(PressStyle())`，不要寫 `PressStyle(dim: true)`，會編不過。:170 改成 `.disabled((count == 0 && isNew) || starting)`，:171 照 U38「同理」改成 `.opacity(count == 0 && isNew ? 0.45 : 1)`，這行第 4 批 U36 會整行刪掉。群組頁主按鈕 :273 的 disabled 也只在 isNew 時看 list.isEmpty。完整寫法見第 4 批的合併注意，U36、U38 和 U66 那條。

### 合3　U63、U36（第 4 批）

**位置**：Theme.swift:13-28（ChunkyStyle）、PlaceDetail.swift:163

**問題**：第 4 批 U36 會把 ChunkyStyle、PressStyle 整段換掉，換上去的版本已經帶 haptic 參數。U63 在這批先做，所以走它「U36 還沒做」那條路，會讓 Theme.swift 多兩行，第 4 批的行號跟著移。這組衝突的完整寫法放在第 4 批，因為做到 U36 的時候 U63 已經做好了。

**合併做法**：

U63 照它「U36 還沒做」那一段做：Theme.swift:17 下面加 `var haptic = false`，:26 的 .animation 後面加 .onChange，PlaceDetail.swift:163 加 `haptic: true`。參數名就叫 haptic、放在 radius 後面，第 4 批 U36 的版本也是這個名字和位置，所以 PlaceDetail.swift:163 之後不用再改。U63 裡「U36 已經做了」那份整段的 ChunkyStyle，這批不要貼。完整寫法見第 4 批的合併注意，U36 和 U63 那條。

### 合4　U63、U37（第 4 批）

**位置**：Store.swift:613-624（copyToMine）

**問題**：第 4 批 U37 的本文寫「Store.swift:620 copyToMine 的 `if await add(n)` 不用改」，還把 :620 列成 add 的呼叫端，可是 U63 在這批就會把那裡改成直接呼叫 create(n)。這組衝突的完整寫法放在第 4 批，因為做到 U37 的時候 U63 已經做好了。

**合併做法**：

U63 照本文做，copyToMine 最後一定是 `if await create(n) != nil { Haptic.success(); say("已加到你的收藏") }`，直接呼叫 create()，不要用 add()。完整寫法見第 4 批的合併注意，U37 和 U63 那條。

### 行號更正（a10704d）

- U38：修法 (1) 寫 Models.swift:117（標 ec71aa2）是 `private static let fmt`；ec71aa2 的 :117 換到 a10704d 是 Models.swift:121，那是 DateFormatter 閉包裡的內容。正確：Models.swift:120 `private static let fmt: DateFormatter = {`
- U62：修法 (2) 後面寫分享 chip 那一區只在 mine 時才出現（PlaceDetail.swift:32，標 ec71aa2）；:32 其實是 details(place)。正確：PlaceDetail.swift:33 `if mine && !store.groups.isEmpty { groups(place) }`

## 各項

### U38（P2・體驗）「開始滑卡」不管這輪滑完沒有都開新的一輪，票被拆散

**畫面**：群組分頁卡片右下／群組頁主按鈕「開始滑卡」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：卡片寫著「這輪：你 還有 5 張沒滑」，旁邊的「開始滑卡」卻一律 quickRound 開新輪，朋友那邊多出一輪同名的。這是規格 B3／B4 沒考慮到已有未完成的輪次，要跟 Anthony 說明是規格變更。連按不會重複開輪，starting 已經擋住了。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupsTab.swift 從 a1b57b1 到 ec71aa2 的改動只有頭像固定寬度、emoji 頭像、「⋯」圖示、Perf 計數和 DepthReport，滑卡邏輯沒動。群組分頁卡片的 quick(g)（GroupsTab.swift:85-93）和群組頁的 quick()（GroupsTab.swift:370-378）都一律呼叫 quickRound 開新輪；GroupCard 的狀態那行（GroupsTab.swift:178-202）拿 roundsOf(group.id).first，不管多久以前都寫「這輪：…」；按鈕文字固定是「開始滑卡」（GroupsTab.swift:162、:269）。Round 模型（Models.swift:100-107）有 created_at 但沒有可以直接用的日期。

**修法**：

這是規格 B3／B4 沒考慮到的情況，要跟 Anthony 說明這是規格變更（「開始滑卡」在有進行中的輪次時會變成繼續）。

(1) 日期：Models.swift:117 的 `private static let fmt` 拿掉 private；Round（Models.swift:106 後面）加
```swift
var at: Date? { created_at.flatMap { $0.count >= 19 ? SwipeRow.fmt.date(from: String($0.prefix(19))) : nil } }
```

(2) 判斷集中在一個地方，加在 GroupsTab.swift:822 quickRound 後面（同一個 extension Store 裡）：
```swift
enum RoundAction { case resume(Round, Int), result(Round), new }
// 12 小時內開的最新那輪算有效；我還有卡就繼續，我滑完但別人還沒就看結果，其他情況開新的一輪
func roundAction(_ gid: String) -> RoundAction {
    guard let r = roundsOf(gid).first else { return .new }
    if let at = r.at, Date().timeIntervalSince(at) > 12 * 3600 { return .new }
    let mine = todo(r).count
    if mine > 0 { return .resume(r, mine) }
    let othersLeft = membersOf(gid).contains { u in u != me && r.place_ids.count > Set(swipes.filter { $0.round_id == r.id && $0.user_id == u }.map(\.place_id)).count }
    return othersLeft ? .result(r) : .new
}
func liveRound(_ gid: String) -> Round? {
    guard let r = roundsOf(gid).first else { return nil }
    if let at = r.at, Date().timeIntervalSince(at) > 12 * 3600 { return nil }
    return r
}
```
created_at 是 nil 的（剛開、還沒同步）當成有效。大家都滑完的那輪走 .new，因為狀態那行已經寫了「這輪大家都滑完了」或配對數，再按就該開新的一輪。

(3) 群組分頁 quick(g)（GroupsTab.swift:85-93）改成先看狀態，(a)(b) 不用等網路，按下那一幀就推頁：
```swift
private func quick(_ g: FoodGroup) {
    switch store.roundAction(g.id) {
    case .resume(let r, _), .result(let r):
        Haptic.light(); path = NavigationPath([g]); path.append(r)
    case .new:
        guard starting == nil else { return }
        Haptic.light()
        starting = g.id
        Task {
            if let r = await store.quickRound(g.id) { path = NavigationPath([g]); path.append(r) }
            starting = nil
        }
    }
}
```
群組頁 quick()（GroupsTab.swift:370-378）同樣寫法，(a)(b) 直接 `Haptic.light(); path.append(r)`。結果頁不用另外做：RoundView 在 todo 是空的時候本來就顯示 results(done: true)（GroupsTab.swift:569-570），推同一輪就是看結果。

(4) 按鈕文字：GroupCard（GroupsTab.swift:158-174）在 body 開頭取 `let act = store.roundAction(group.id)`，:162 依狀態寫「繼續滑 N 張」、「看結果」、「開始滑卡」，圖示 .resume 用 heart.fill、.result 用 checkmark.circle.fill。卡片上空間有限，所以用「繼續滑 N 張」而不是「繼續滑（剩 N 張）」，並把 :150 的 `.padding(.trailing, 110)` 改成 150，不然狀態那行會被按鈕壓住。:170 的 disabled 改成 `.disabled((count == 0 && isNew) || starting)`（isNew 是 act 為 .new），:171 的 opacity 同理；:173 accessibilityLabel 跟著文字改。群組頁的主按鈕（GroupsTab.swift:266-273）是整列寬，可以寫完整的「繼續滑（剩 N 張）」，:273 的 disabled 一樣只在 .new 時看 list.isEmpty。

(5) 狀態那行（GroupsTab.swift:179）的 `if let r = store.roundsOf(group.id).first` 改成 `if let r = store.liveRound(group.id)`；else 分支（:198-201）在 roundsOf 不是空的時候寫「上一輪結束了，開新的一輪吧」，沒有輪次才寫「還沒開始滑卡」。

想強制開新的一輪就走「調整條件」（GroupsTab.swift:274），不用改。

**模擬器驗收**：1. 在測試群組按「開始滑卡」開一輪，滑 1 張就返回：群組分頁卡片按鈕變「繼續滑 9 張」、群組頁主按鈕變「繼續滑（剩 9 張）」，按了立刻回到同一輪（看 RoundRow 清單沒有多出一輪）。2. 把那輪自己滑完、另一個測試帳號還沒滑：按鈕變「看結果」，按了進結果頁。3. 兩個帳號都滑完：按鈕回到「開始滑卡」，狀態寫「這輪大家都滑完了」或配對數，按了才開新的一輪。4. 用 Supabase 把那輪的 created_at 改成 13 小時前再下拉同步：狀態改寫「上一輪結束了…」，按鈕是「開始滑卡」。5. 狀態那行和按鈕在 iPhone SE 寬度不重疊。6. 按「調整條件」仍然一定開新的一輪。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同批 U40 會用 store.groupJump 和 GroupsTab 的 jump()（GroupsTab.swift:96-104）打開群組，U38 只改 quick 兩個函式和 GroupCard，兩者都改 path 但時機不同，不衝突。Draw.swift:159-171 的「丟到群組投票」也一律開新輪，不在這項範圍內，但規格變更跟 Anthony 說明時可以一併提。

### U40（P2・體驗）剪貼簿膠囊把邀請連結當成店去找

**畫面**：複製朋友的邀請訊息 → 回 App → 頂部剪貼簿膠囊按「貼上」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：這和 K3 是不同的根因：問題在按下去之後。pasted() 直接 startAdd，跑「找店中」再失敗，本來一鍵就能加入群組的機會變成一筆錯誤。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Onboard.swift 改了很多（d2aec97 的連按三次 ✕ 兩週不問、膠囊移到面板上緣），但 pasted()（Onboard.swift:142-155）在 guard（:146）之後還是只比對收藏，然後 :154 一律 store.startAdd(t, …)，邀請連結仍然被送去「找店中」。依規格變更 A4 任何網址都會跳膠囊，邀請連結也一定會跳，所以這條路現在更常走到。另外 FoodMapApp.swift:67-70 的 onOpenURL 有處理 /join?code=，但只加入後切到群組分頁，不會打開那個群組，已經是成員時也會再呼叫一次 join。

**修法**：

(1) 在 GroupsTab.swift:822 quickRound 後面（extension Store 裡）加一個共用函式：
```swift
// 朋友的邀請：已經在群組裡就直接打開，還沒加入就先加入再打開
@MainActor func openInvite(_ code: String) {
    func open(_ gid: String) {
        groupJump = GroupJump(gid: gid, rid: nil)
        withAnimation(.snappy) { tab = 2 }
    }
    if let g = groups.first(where: { $0.invite_code.caseInsensitiveCompare(code) == .orderedSame }) { open(g.id); return }
    Task { if let gid = await join(code) { open(gid) } }
}
```
join() 成功時自己會說「加入「…」了 🎉」，失敗會說「加入失敗：…」（Store.swift:835-842），不用另外處理。GroupsTab 的 jump()（GroupsTab.swift:96-104）會在 onChange 或 onAppear 時把群組推上去。

(2) Onboard.swift:146 的 guard 後面、:147 `let k = Self.key(t)` 前面插入：
```swift
// 朋友的邀請連結或整段邀請訊息：不當成店去找
if t.contains("anthony-apps.netlify.app/join") || t.contains("邀請碼"), let c = FoodGroup.code(in: t) {
    Haptic.light()
    store.openInvite(c)
    return
}
```
FoodGroup.code(in:) 已經涵蓋 code=、join=、邀請碼：（GroupsTab.swift:798）。:143-144 把 ✕ 次數歸零放在前面沒問題，按貼上本來就算有在用。

(3) 順手：FoodMapApp.swift:69 改成 `store.openInvite(code)`，點邀請連結開 App 也會直接進到那個群組，已經是成員時不再多打一次 join。

(4) 選配：AddSheet 的 go()（Edit.swift:100-105）有人把邀請訊息貼進新增框也會走 startAdd，可以加同一段判斷，改成 `store.openInvite(c); dismiss(); return`。

**模擬器驗收**：1. 用另一個測試帳號建的群組，複製整段邀請訊息（含連結和邀請碼）回 App，膠囊出現後按貼上：直接切到群組分頁並打開那個群組，出現「加入「…」了 🎉」，收藏頁沒有「找店中」卡。2. 再複製一次同一段回 App 按貼上：不再呼叫加入，直接打開那個群組。3. 只複製邀請連結那一行，結果一樣。4. 複製一個 IG 店家連結按貼上，仍然走「找店中」。5. 在 Safari 點邀請連結開 App，直接進到那個群組。

**注意**：跟 fix-addcard-ec71aa2.md 無關（膠囊在行程模式不出現，Onboard.swift:80）。跟 U39 共用 FoodGroup.code(in:)，不衝突。跟 U38 都動到 GroupsTab 的 extension Store 和 path：U40 走 groupJump 加 jump()，U38 改 quick()，加在同一個 extension 時注意不要互相覆蓋。

### U41（P2・滑順）滑卡時卡片不在手指底下，往右拖一路往下沉，飛走時往右下俯衝

**畫面**：滑卡頁（RoundView）拖最上面那張

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：modifier 順序是 offset → scale → rotation，旋轉繞的是原本的中心。拖 150pt 時卡片比手指低約 24pt。飛走複本出畫面時多掉約 145pt。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：SwipeDeck.swift 從 a1b57b1 到 ec71aa2 完全沒改（git diff 是空的），行號不變。SwipeDeck.swift:70-72 仍是 .offset(offset).scaleEffect(scale).rotationEffect(.degrees(angle))，FlyingCard 的 SwipeDeck.swift:137-138 仍是 .offset(at).rotationEffect(...)，旋轉繞原本的中心，拖 150pt 時卡片往下沉約 24pt。

**修法**：

只換順序，軸心維持預設中心：
- SwipeDeck.swift:70-72 改成
```swift
.scaleEffect(scale)
.rotationEffect(.degrees(angle))
.offset(offset)
```
- SwipeDeck.swift:137-138 改成
```swift
.rotationEffect(.degrees(Double(at.width / 16)))
.offset(at)
```
不要用 anchor .bottom，卡片會跑到手指前面約 40pt，飛走時像骨牌倒下。

補充原本修法沒提到的一點：:70-72 這串是三張卡共用的，不只最上面那張。後面兩張的 offset 是 (0, 14 或 28)、旋轉 ±3°、縮 0.95 或 0.9，換順序後位置差不到 1pt，看不出來，不用另外處理。改完確認放開那一幀，飛走複本（起點 at = (from.width, from.height × 0.35)、角度 from.width ÷ 16）和拖曳中的卡完全重疊。

**模擬器驗收**：在測試群組的輪次慢慢往右拖約 150pt 不放開，確認卡片中心跟著手指、沒有往下沉；往左拖一樣。放開讓它飛走，用模擬器慢動作錄影看放手那一幀複本和原卡沒有跳動。後面兩張疊卡的位置跟改之前一樣。

**注意**：跟 U42 都改 FlyingCard（SwipeDeck.swift:137-141），要一起改：U41 換 :137-138 的順序，U42 換 :140 的動畫，合起來見 U42 的修法。跟 U43 同在 card()（SwipeDeck.swift:54-77），U41 改 :70-72，U43 改 :65、:68 的印章，不衝突。跟 fix-addcard-ec71aa2.md 無關。

### U42（P2・滑順）甩出去的卡先頓一下才加速飛走

**畫面**：滑卡頁：快速甩卡、按下方 ❤️／✕

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：放開後 FlyingCard 一律從速度 0 開始 easeIn 0.26 秒，手指每秒上千 pt 的速度斷掉。另外方向用 translation 判斷：先往左拖一點再往右甩，卡會往左飛。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：SwipeDeck.swift 從 a1b57b1 到 ec71aa2 沒改。SwipeDeck.swift:95 方向仍用 v.translation.width > 0；Flying（SwipeDeck.swift:17-20）沒有速度；FlyingCard 的 SwipeDeck.swift:139-141 一律 withAnimation(.easeIn(duration: 0.26)) 從速度 0 開始。

**修法**：

(1) SwipeDeck.swift:94-95 改成
```swift
let fast = abs(v.predictedEndTranslation.width) > 260
let dir = fast ? v.predictedEndTranslation.width > 0 : v.translation.width > 0
if abs(v.translation.width) > 100 || fast { fling(dir, vel: v.velocity) }
```

(2) SwipeDeck.swift:19 改成 `let place: Place, from: CGSize, like: Bool, vel: CGSize`。fling（SwipeDeck.swift:100）改成 `private func fling(_ like: Bool, vel: CGSize = .zero)`，:104 改成 `flying.append(Flying(place: top, from: drag, like: like, vel: vel))`。下方 ✕ 和 ❤️ 按鈕（:40、:41）呼叫不用改，自動傳 .zero。

(3) FlyingCard（SwipeDeck.swift:127-142）加 `@Environment(\.accessibilityReduceMotion) private var reduce`，:139-141 改成
```swift
.opacity(reduce && gone ? 0 : 1)
.onAppear {
    let dist = (f.like ? 700 : -700) - f.from.width
    // 只接手指往飛走方向的速度；手指往回時從 0 開始，不要先倒退再飛
    let v0 = f.vel == .zero ? 0 : max(0, Double(f.vel.width / dist))
    let anim: Animation = reduce ? .easeOut(duration: 0.2)
        : f.vel == .zero ? .easeOut(duration: 0.28)
        : .interpolatingSpring(duration: 0.26, bounce: 0, initialVelocity: v0)
    withAnimation(anim) { gone = true } completion: { done() }
}
```
reduceMotion 時 at 不要變：:133 改成 `let at = gone && !reduce ? to : CGSize(width: f.from.width, height: f.from.height * 0.35)`，只淡出。

原本修法要修正的一點：initialVelocity = vel.width ÷ (to.width − from.width) 帶正負號這件事是對的，但要夾在 0 以上。拖過 100pt 後手指慢慢往回、在 110pt 放開時，dir 是右、速度卻是負的，直接帶進彈簧卡片會先往左倒退再飛走。interpolatingSpring(duration:bounce:initialVelocity:) 是 iOS 17 起的 API，iOS 18+ 可以用。旋轉由 at.width 算出來，自然跟位移走同一條動畫。

**模擬器驗收**：1. 在測試群組輪次快速往右甩一張，用模擬器慢動作（Debug 的 Slow Animations）錄影，放手第一幀就延續手指速度，沒有先頓一下。2. 先往左拖約 40pt 再快速往右甩，卡片往右飛、印章是「想吃！」、送出的是想吃。3. 往右拖過 110pt 後往回帶一點再放開，卡片往右飛，不會先往左退。4. 按下方 ❤️ 和 ✕，卡片 easeOut 飛走。5. 打開「減少動態效果」，滑出去只淡出。

**注意**：跟 U41 都改 FlyingCard：U41 把 :137-138 換成 .rotationEffect 在前、.offset(at) 在後，U42 改 :133 和 :139-141，合起來是 `.rotationEffect(.degrees(Double(at.width / 16))).offset(at).opacity(reduce && gone ? 0 : 1).onAppear { … }`。跟 U43 都改 gesture 的 onEnded（:93-97）和 fling 的 :106：U43 要在 :96 和 :106 多重設一個狀態，合併時兩邊都保留。另外 U42 讓快甩的方向改看 predictedEndTranslation，如果手指在右邊蓋了「想吃！」印章後往左甩，拖曳中的卡印章寫想吃，飛走的複本寫跳過（看 f.like），這是對的結果，但 U43 調印章時可以知道會有這種一閃。跟 fix-addcard-ec71aa2.md 無關。

### U44（P2・滑順）最後一張沒飛完就換成結果頁，切換時版面先擠再跳

**畫面**：滑卡頁：滑掉最後一張；按右上「看結果／繼續滑」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：RoundView 在 VStack 裡用 if/else 切滑卡和結果，飛走複本跟著 SwipeDeck 被拿掉，最後一張沒有完整的飛走動畫。淡出的那塊還佔著空間，結果頁會先被擠到下半截。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupsTab.swift:568-598 還是 `VStack { if todo.isEmpty || showResult { results } else { 頭部 + SwipeDeck } }`。從 a1b57b1 到 ec71aa2，RoundView 只有 609 的 ⋯ 換成 MoreIcon，這段沒動。SwipeDeck.swift:100-109 的 fling 把飛走的複本放進 SwipeDeck 自己的 @State flying，然後在 withAnimation(.spring) 裡呼叫 onSwipe。FlyingCard（SwipeDeck.swift:139-141）要 0.26 秒才飛完。最後一張滑掉時 todo 變空，569 的條件馬上成立，SwipeDeck 整個被拿掉，複本也跟著消失。VStack 裡新舊兩支同時存在的那段時間，結果頁會被擠到下半截。

**修法**：

1. RoundView 在 GroupsTab.swift:540 附近加 `@State private var finishing = false`。

2. 593-597 的 onSwipe 改成：
```swift
SwipeDeck(deck: todo, onSwipe: { p, liked in
    // 最後一張：等飛走的複本飛完（FlyingCard 0.26 秒）再換結果頁
    let last = todo.count == 1
    if last { finishing = true }
    store.swipe(r, p.id, liked: liked)
    history.append(p.id)
    if last {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(280))
            withAnimation(.snappy) { finishing = false }
        }
    }
    if liked, let m = store.matches(r).first(where: { $0.place.id == p.id }), m.all { celebrate(m) }
}, onTap: { detail = $0 }, onUndo: history.isEmpty ? nil : { undo(r) })
```
原修法寫的是「store.swipe 之後如果 todo 空了」，可是閉包裡的 todo 是這次 body 算出來的，也就是滑之前的清單，所以要用 `todo.count == 1` 判斷這張是不是最後一張，不然就重新呼叫 `store.todo(r).isEmpty`。finishing 跟 swipe 在同一次更新裡設，結果頁的條件從頭到尾都不會先成立，所以不用另外包一層不帶動畫的 Transaction。onSwipe 本來就在 fling 的 withAnimation(.spring) 裡，而 finishing 本身不會改變畫面。

3. 568-569 改成：
```swift
let showRes = (todo.isEmpty && !finishing) || showResult
return ZStack {
    if showRes {
        results(r, done: todo.isEmpty).transition(.opacity)
    } else {
        VStack {   // 原本 572-597 的頭部和 SwipeDeck 原封不動搬進來
            ...
        }
        .transition(.opacity)
    }
}
```
內層 VStack 保留預設 spacing，滑卡的版面就跟現在一樣。600 之後的 background、navigationTitle、backButton、toolbar 直接接在 ZStack 後面，不用改。605 的「看結果／繼續滑」本來就是 withAnimation(.snappy)，換成 ZStack 之後也會變成原地交叉淡入。

4. undo 的 622 改成 `withAnimation(.snappy) { showResult = false; finishing = false }`。

**模擬器驗收**：在測試群組開一輪，滑到剩 1 張，最後一張用手甩和按愛心各試一次，錄影確認卡片完整飛出畫面（約 0.26 秒）後結果頁才淡入，而且結果頁從頂端開始，不會先擠在下半截再跳上去。接著按右上「看結果」和「繼續滑」各一次，確認是在原地淡入淡出。在結果頁按「↶ 收回上一張」，滑卡要回來，中間不能閃一下結果頁。兩人群組裡另一個人先按想吃，自己最後一張也按想吃，配對畫面要照常跳出來。

**注意**：跟 U45 改的是同一個 RoundView。U44 改 content()（568-598）和 undo（622），U45 改 553 和 celebrate（684-687），位置不重疊，可以一起套。最後一張剛好配對成功時，U45 的全螢幕配對畫面會先出來，結果頁在底下換好，順序沒有問題。跟 U50 的關係：SwipeDeck.swift:35 的 swipeBackBlocked 會多掛 0.28 秒再加淡出的時間，拿掉時 onDisappear 照樣會取消登記，沒有影響。跟 fix-addcard-ec71aa2.md 無關。

### U45（P2・畫面）配對成功畫面蓋不住導覽列，返回鍵和「看結果」還能按

**畫面**：配對成功動畫（MatchView）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：MatchView 是 RoundView 自己的 overlay，導覽列畫在上面：標題和橘色的「看結果」浮在慶祝畫面上，還按得到。按返回鍵會在慶祝途中直接 pop 掉。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupsTab.swift:553 還是 `.overlay { if let m = match { MatchView(...) } }`，MatchView 是 RoundView 自己的 overlay，導覽列畫在它上面。604-612 的「看結果」和 ⋯ 選單、603 的 .backButton()（Theme.swift:164-180 的 BackButton，按了就 dismiss()）在配對畫面上都看得到也按得到。ec71aa2 只把 ⋯ 換成深色 44pt 的 MoreIcon（609、825-831），問題本身沒變。另外 iOS 26 從畫面中間右滑返回（SwipeBack.swift）在配對畫面上也一樣能用。ec71aa2 裡也沒有 Debug 用的假配對資料可以觸發（整個 FoodMap 只有 Store.swift:922 會建 Match）。

**修法**：

建議選 (a)。(b) 擋不住右滑返回，因為 .backButton() 只是把系統的返回鍵換掉，從左邊緣滑回和 iOS 26 從畫面中間滑回都還在，要另外擋；而且還得改 Theme.swift 共用的 BackButton。

(a) 的做法：
1. 553 改成：
```swift
.fullScreenCover(item: $match) { m in
    MatchView(match: m) {
        var t = Transaction(); t.disablesAnimations = true
        withTransaction(t) { match = nil }
    }
    .presentationBackground(.clear)
}
```
2. celebrate（684-687）改成：
```swift
private func celebrate(_ m: Store.Match) {
    Haptic.success()
    var t = Transaction(); t.disablesAnimations = true
    withTransaction(t) { match = m }   // 關掉系統往上滑的轉場，由 MatchView 自己淡入
}
```
3. MatchView（690 起）加 `@State private var shown = false`，703 的最外層 ZStack 加 `.opacity(shown ? 1 : 0)`，734 的 onAppear 開頭加 `withAnimation(.easeOut(duration: 0.2)) { shown = true }`。704 點遮罩和 728「繼續滑」都改成呼叫 leave()：
```swift
private func leave() {
    withAnimation(.easeOut(duration: 0.2)) { shown = false } completion: { close() }
}
```
這樣關掉的時候也是淡出，不會因為 dismiss 不帶動畫就一下子被切掉。

Store 是用 environment 傳下來的，fullScreenCover 的內容會繼承，MatchView 的 @Environment(Store.self) 不用另外補。555-563 的輪詢本來就只在 match == nil 時呼叫 celebrate，不用改。

**模擬器驗收**：ec71aa2 沒有可以直接觸發的「Debug 假配對資料」。有兩個做法：一是用兩人測試群組，另一個帳號先對某間按想吃，自己再按想吃；二是先加一個 #if DEBUG 的啟動參數（例如 -fakeMatch，在 RoundView 的 onAppear 拿 store.matches(r).first 呼叫 celebrate）。觸發之後確認：配對畫面從最上緣蓋到最下緣，看不到標題、返回鍵、「看結果」和 ⋯；點左上角原本返回鍵的位置、從左邊緣右滑、從畫面中間右滑（iOS 26）都不會 pop；配對畫面是淡入，不是從下面滑上來；按「繼續滑」或點遮罩時是淡出，底下的滑卡位置沒有跳動。

**注意**：跟 U44 改的是同一個 RoundView，但行數不重疊，詳見 U44。跟 fix-addcard-ec71aa2.md 無關。

### U50（P2・錯誤）藏起來的分頁登記的「不准右滑返回」區域一直有效，別的分頁右滑返回失效

**畫面**：收藏／群組分頁的店家頁、群組頁（iOS 26 全畫面右滑返回）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：SwipeBackBlocked 只在 onDisappear 時取消登記，但 Root.page 用 opacity 0 藏分頁，不會觸發 onDisappear。地圖面板的 high 清單在中間段就以 opacity 0 掛著登記擋區（中間段是預設狀態），PanelDrag、SwipeDeck、行程面板也一樣。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：3fc00de 還沒修。SwipeBack.swift 從 ec71aa2 到 3fc00de 沒改，:71-81 的 SwipeBackBlocked 還是只在 :79 的 onDisappear 取消登記；:62-69 的 SwipeBackAllowed 還是沒有任何地方用。Root.page 現在在 FoodMapApp.swift:218-227（3fc00de 的訊息條改動讓它往後挪了 18 行），還是用 :220 的 opacity 0 加 :224 的 allowsHitTesting(false) 藏分頁，不會觸發 onDisappear。MapTab.swift:1214-1218 會在 1.5 秒後把最高段清單先建好（highUsed = true），所以 :1157-1165 的 high 一直以 opacity 0 掛著，:1304 的 `.swipeBackBlocked()` 一直登記著面板上緣往下的一大塊。其他還掛著的擋區：MapTab.swift:1429（PanelDrag）、SwipeDeck.swift:35、TripPanel.swift:338、633、1572、TripTop.swift:341、Draw.swift:652。8559c3d 的 RowHold、9379b88 拿掉 listPull、e7af2e1 的換天投放區、3fc00de 的拿掉一天，都沒有新增或拿掉 swipeBackBlocked，只是讓 TripPanel、TripTop 的行號挪動。

**修法**：

1. SwipeBack.swift:60（SwipeBackAllow 結束的 `}`）後面加一個環境值，寫法照 ListTab.swift:229 的 @Entry：
```swift
// 這一頁所在的分頁是不是正在顯示（Root.page 用 opacity 藏分頁，不會觸發 onDisappear）
extension EnvironmentValues { @Entry var tabActive = true }
```

2. SwipeBack.swift:71-81 的 SwipeBackBlocked 整段換成：
```swift
private struct SwipeBackBlocked: ViewModifier {
    var on = true
    @Environment(\.tabActive) private var active
    @State private var id = UUID()
    @State private var rect: CGRect?
    func body(content: Content) -> some View {
        let live = on && active
        content
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { rect = $0; SwipeBackBlock.set(id, live ? $0 : nil) }
            .onChange(of: live) { _, v in SwipeBackBlock.set(id, v ? rect : nil) }
            .onDisappear { SwipeBackBlock.set(id, nil) }
    }
}
```
onChange 用兩個參數的寫法，直接拿新值，不靠閉包裡抓到的 live。SwipeBackAllowed（:62-69）在 3fc00de 還是沒人用，可以不改；之後有人用到時照同樣寫法加 active。

3. FoodMapApp.swift:220 的 `v().opacity(store.tab == i ? 1 : 0)` 改成：
```swift
            v().environment(\.tabActive, store.tab == i)
                .opacity(store.tab == i ? 1 : 0)
```
環境值要掛在 v() 上，分頁裡面的面板、行程面板、滑卡、轉盤、站卡的停留時間滑桿都會吃到，TripPanel、TripTop、SwipeDeck、Draw 本身不用改。

4. MapTab.swift:1304 的 `.swipeBackBlocked()` 改成 `.swipeBackBlocked(tallPull ?? (mp.stage == .high))`。這跟 :1140 決定 high 要不要顯示的 tall 是同一個判斷；tall 是 body 裡的區域變數，high（:1268）讀不到，但 tallPull（:1115）和 mp（:1113）都是同一個 struct 的 @State，可以直接讀。原清單寫 `mp.stage == .high`，拉到一半跨線時清單已經淡入、擋區卻還沒開，所以多看 tallPull。這一步是保險：跨分頁的問題第 1 到 3 步就解決了，這一步是讓地圖分頁自己停在中間段時不要掛著看不見的擋區。

**模擬器驗收**：用 iOS 26 模擬器測，因為從畫面中間滑回只有 iOS 26 才有。1. 地圖面板停在中間段，等 2 秒讓最高段清單預先建好（不用拉上去），切到收藏頁，點進任一間店家頁，從畫面下半部（原本地圖面板那一帶）的中間往右滑，要能返回。Xcode console 不能出現「[swipeback] 不回：手指在自己橫滑的區塊」，要出現「[swipeback] 回上一頁」。2. 在地圖開一個行程進到行程模式（面板停在中間段），切到收藏頁進店家頁，從畫面下半部中間往右滑，一樣要能返回。3. 群組頁開一輪滑卡停在滑卡畫面，切到收藏頁進店家頁，從畫面正中間往右滑，要能返回。4. 回到群組頁，在滑卡上往右拖，還是在拖卡、不會返回。5. 回到行程模式，在站卡的停留時間滑桿上往右拖，還是在拖滑桿。6. 回到地圖，把面板拉到最高段，點清單裡一間店進店家頁再返回，面板照舊停在最高段；在最高段清單上往右滑不會觸發返回。

**注意**：第 3 批 U44：SwipeDeck.swift:35 的擋區在結果頁淡入時會多掛一下，拿掉時照樣取消登記，不衝突。第 2 批 U46 到 U48 的轉盤：Draw.swift:652（原清單寫 :634）的 swipeBackBlocked 透過共用 modifier 生效，那幾項改 :648 附近的 wheel 時不用動它。第 7 批 U77：新的同時手勢掛在面板裡，面板本身已經被 PanelDrag（MapTab.swift:1429）擋住右滑返回，不用再加。第 5、6 批行程模式改 TripPanel、TripTop 時，:338、:633、:1572 和 TripTop.swift:341 的 swipeBackBlocked 留著就好。第 9 批 U115 想在別的分頁停掉找店卡的動畫，可以順便改讀這裡的 tabActive，不讀也可以。這項沒有合併注意。

### U62（P2・錯誤）移除朋友分享的店，當下看起來成功，下次同步又冒回來

**畫面**：群組頁 → 長按別人分享的店卡 →「從群組移除」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：group_places 的刪除規則是 added_by = auth.uid()。刪別人的那筆，RLS 讓 PostgREST 回 200 加空陣列，App 以為成功。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：GroupsTab.swift:337-339 的 contextMenu 還是不分是誰分享的，一律顯示「從群組移除」。Store.swift:861-866 的 unshare 先從 groupPlaces 拿掉，Supa.write 沒丟錯就當成功，不看回傳。schema.sql:197-198 的刪除規則仍是 added_by = auth.uid()，Supa.swift:248 有送 return=representation，所以被 RLS 擋時回 200 加空陣列。這段在 a1b57b1 之後沒改過（GroupsTab 的 diff 只動了邀請碼、頭像和 ⋯ 鈕）。

**修法**：

不用改 schema。schema.sql:194-196 的新增規則保證分享的人就是店主，所以「是不是我的店」就等於「是不是我分享的」。
(1) GroupsTab.swift:337-339 改成：
```swift
.contextMenu {
    // 只有分享的人能收回（跟店家頁 PlaceDetail.swift:26 一樣用 isMine 判斷）
    if store.isMine(p) {
        Button("從群組移除", systemImage: "minus.circle", role: .destructive) { Task { await store.unshare(gid, p.id) } }
    } else {
        Text("只有分享的人可以移除")
    }
}
```
(2) 保險：Store.swift:861-866 改成看回傳：
```swift
@MainActor func unshare(_ gid: String, _ pid: String) async {
    let row = GroupPlace(group_id: gid, place_id: pid)
    groupPlaces.removeAll { $0 == row }
    do {
        let d = try await Supa.write("DELETE", "group_places", query: "group_id=eq.\(gid)&place_id=eq.\(pid)")
        // 被 RLS 擋掉時 PostgREST 回 200 加空陣列：放回去並說明
        if (try? JSONSerialization.jsonObject(with: d) as? [Any])?.isEmpty == true {
            if !groupPlaces.contains(row) { groupPlaces.append(row) }
            say("只有分享的人可以移除")
            return
        }
        saveCache()
    } catch { groupPlaces.append(row); say("失敗：" + error.localizedDescription) }
}
```
PlaceDetail.swift:281 的分享 chip 也走 unshare，但那一區只在 mine 時才出現（:32），不受影響。

**模擬器驗收**：在測試群組裡：1. 長按朋友分享的店，選單沒有「從群組移除」，只有一行灰字「只有分享的人可以移除」。2. 長按自己分享的測試店，選單有「從群組移除」；這一步只看，不要按。3. 保險那段可以用 Xcode 下斷點，把 unshare 的回傳換成 "[]"，確認店卡放回去並跳「只有分享的人可以移除」。

**注意**：跟 fix-addcard-ec71aa2.md 和同一批其他項目都沒有重疊。

### U63（P2・錯誤）「我也想去」連按兩下會存成兩間，按下時也沒有震動

**畫面**：群組頁或地圖看群組 → 朋友的店家頁 →「♥ 我也想去」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：按鈕直接 Task { copyToMine }，要等 POST 回來才插入 places。等待的 0.3～0.7 秒裡按鈕看起來還能按，alreadyMine 還是 false，第二下又 POST 一次。ChunkyStyle 有下沉動畫，但沒有震動，成功回饋要等網路。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：3fc00de 還沒修。PlaceDetail.swift:158-163 還是只看 store.alreadyMine(place)，按鈕是 :162 的 `Button { Task { await store.copyToMine(place) } }`，:163 用 ChunkyStyle。Store.swift:613-624 的 copyToMine（e7af2e1 在 :598-602 讓刪店訊息條停 6 秒，所以比 ec71aa2 的 :611-622 往後挪 2 行）沒有任何防連按，:620 呼叫 add(n)，要等 :569-577 的 create() 把 POST 送回來才 insert 進 places，:676 的 alreadyMine 在這段時間一直是 false。Theme.swift:13-28 的 ChunkyStyle 只有下沉動畫，沒有震動。最近 8 個 commit 都沒碰這幾段，3fc00de 改的訊息條也不影響「已加到你的收藏」這種沒有按鈕的訊息。

**修法**：

(1) Store.swift:613（copyToMine 的註解）前面加被觀察的集合。key 要跟 alreadyMine（:676）用同一套（同名同分店），不要用 p.id：兩個朋友都收了同一間，各自的 id 不同，用 id 擋不住。
```swift
    // 「我也想去」送出中（同名同分店）：防連按，按下就先顯示已在收藏
    var copying: Set<String> = []
    func copyKey(_ p: Place) -> String { p.name + "|" + (p.branch ?? "") }
```

(2) Store.swift:614-624 的 copyToMine 整段換成下面這樣。最後改成直接呼叫 create()，這是第 3 批合6 的寫法：第 9 批 U92 會讓 add() 成功時說「已收藏 X」，copyToMine 如果還走 add()，同一幀會被這裡的「已加到你的收藏」蓋掉。
```swift
    @MainActor func copyToMine(_ p: Place) async {
        let k = copyKey(p)
        guard !alreadyMine(p), copying.insert(k).inserted else { return }
        defer { copying.remove(k) }
        var n = Place(id: UUID().uuidString, name: p.name)
        n.branch = p.branch; n.address = p.address; n.city = p.city; n.district = p.district
        n.lat = p.lat; n.lng = p.lng; n.approx = p.approx; n.category = p.category; n.cuisine = p.cuisine
        n.price = p.price; n.meals = p.meals; n.hours = p.hours; n.dishes = p.dishes; n.tags = p.tags
        n.photo = p.photo; n.source_url = p.source_url; n.status = "want"
        // 直接用 create()：add() 只留給手動新增（Edit.swift:212）
        if await create(n) != nil {
            Haptic.success()
            say("已加到你的收藏")
        }
    }
```
成功時 create() 在 :573 已經先把新店 insert 進 places，defer 才把 key 拿掉，所以畫面不會閃回「我也想去」；失敗時 create() 會說「新增失敗」，key 拿掉後按鈕回來，可以再按。

(3) PlaceDetail.swift:158 改成 `if store.alreadyMine(place) || store.copying.contains(store.copyKey(place)) {`，按下去當幀就顯示「已在你的收藏 ✓」。

(4) 震動：不要改用 PressStyle(haptic: true)，那會把粉紅厚按鈕的外觀換掉。讓 ChunkyStyle 多一個 haptic 參數，放在 radius 後面，呼叫順序 color、edge、radius、haptic 才對得上。PlaceDetail.swift:163 改成 `.buttonStyle(ChunkyStyle(color: .sprPink, edge: Color.sprPink.mix(with: .black, by: 0.2), radius: 14, haptic: true))`。Theme.swift 看第 4 批 U36 做了沒有：
- U36 還沒做：Theme.swift:17 下面加 `var haptic = false   // 手指一按下就輕震`，:26 的 .animation 後面加 `.onChange(of: configuration.isPressed) { _, down in if down && haptic { Haptic.light() } }`。
- U36 已經做了，或之後 U36 要把 ChunkyStyle 整段換掉時，最後一律長這樣（第 3 批合5、第 4 批合9）：
```swift
struct ChunkyStyle: ButtonStyle {
    var color: Color = .accent
    var edge: Color = .accentDeep
    var fg: Color = .white
    var radius: CGFloat = 14
    var haptic = false   // 手指一按下就輕震
    func makeBody(configuration: Configuration) -> some View {
        ChunkyBody(c: configuration, color: color, edge: edge, fg: fg, radius: radius, haptic: haptic)
    }
    private struct ChunkyBody: View {
        let c: ButtonStyleConfiguration
        let color: Color, edge: Color, fg: Color
        let radius: CGFloat
        let haptic: Bool
        @Environment(\.isEnabled) private var on
        var body: some View {
            let down = c.isPressed && on
            c.label
                .font(.headline).foregroundStyle(fg)
                .padding(.horizontal, 16).frame(minHeight: 44)
                .background(RoundedRectangle(cornerRadius: radius).fill(color).shadow(color: edge, radius: 0, y: on && !down ? 4 : 1))
                .offset(y: down ? 3 : 0)
                .saturation(on ? 1 : 0.2).opacity(on ? 1 : 0.5)
                .animation(.spring(response: 0.2, dampingFraction: 0.7), value: c.isPressed)
                .animation(.easeOut(duration: 0.15), value: on)
                .onChange(of: c.isPressed) { _, d in if d && haptic && on { Haptic.light() } }
        }
    }
}
```
新參數預設 false，全 App 其他 ChunkyStyle 不受影響。成功後 copyToMine 裡的 Haptic.success() 保留。

(5) 原清單第 (4) 點的樂觀插入不用做：有了 copying，按下當幀就已經顯示已收藏。真的要做的話，暫存 Place 的 owner 要設成 store.me（不然 isMine、mine 都不算），成功時用回來的那筆替換，不要再 insert 一次；失敗時拿掉並 say。

**模擬器驗收**：用測試帳號在測試群組裡打開朋友的店（自己還沒收過的）。1. 快速連點兩下「♥ 我也想去」：放開立刻變「已在你的收藏 ✓」，第二下按不到；訊息條只出現一次「已加到你的收藏」，不會先閃「已收藏 X」。2. 回收藏頁確認只多一間，狀態是想去。3. 找兩個朋友都收過的同一間店，從其中一個朋友的店家頁按「我也想去」，馬上切到另一個朋友的同一間，按鈕已經是「已在你的收藏 ✓」。4. 用 Network Link Conditioner 把網路關掉再試另一間：先顯示已在收藏，失敗後跳「新增失敗」，按鈕回到「♥ 我也想去」，可以再按。5. 模擬器沒有震動，震動要在真機上確認：手指一按下就輕震一下，成功時再一次成功震動。測完把剛複製的測試店刪掉。

**注意**：第 4 批 U36：兩項都改 Theme.swift:13-28 的 ChunkyStyle，誰先做都要收斂成上面那份帶 haptic 的 ChunkyBody，haptic 放在 radius 後面（第 3 批合5、第 4 批合9）。第 9 批 U92：這裡把 copyToMine 改成直接呼叫 create()，U92「add() 只剩 Edit.swift:212 在用」的前提才成立；U92 在 create() 加的 markFresh 也會套到複製過來的店，這是對的（第 3 批合6）。跟 V11、fix-addcard 沒有重疊。
