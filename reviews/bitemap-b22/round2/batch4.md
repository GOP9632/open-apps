# 第 2 輪第 4 批　P2：新增與分享、第一次使用、收藏頁、全 App

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 15 項：U18 新帳號允許定位後，地圖還停在台北（規格 A5 的 3 公里鏡頭沒發生）、U31 點通知不會帶到收藏頁或那間店，新店亮框也在背景就播完了、U32 按「自己填」後，原本貼的 IG 連結被丟掉、U34 按住訊息條會暫停倒數，真正刪除的計時卻不停，「復原」按了沒反應、U35 長按「3 間分店」卡片按刪除，只刪掉最近那間，卡片還在、U36 ChunkyStyle／PressStyle 停用時不變灰，按了沒反應像卡住、U37 存檔失敗的錯誤訊息被 sheet 蓋住看不到、U51 第一次登入後，定位權限、alert、教學圈圈同時疊出來、U52 通知小卡點旁邊就被當成永久拒絕，之後在 App 裡再也打不開通知、U53 教學每換一步，對話框先滑到畫面正中間停一下，再滑到目標旁、U54 換分頁時整張 MapTab 重算（build 22 新增的退步）、U59 C4 篩選共用後，一頁打字或點分類，藏在背景的另一頁跟著整頁重算、U64 自己填／編輯表單往下一滑就關，填好的欄位全丟，也沒確認、U65 新增視窗選了「去過」後，「AI 找店家並收藏」被鍵盤蓋住又收不掉鍵盤、U66 沒網路或同步失敗時完全沒提示，收藏頁下拉失敗看起來也像成功

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是對照 a10704d 重新整理、再由反方檢查過的：這批裡（或跟第 1 到 5 批其他項）有兩項以上改到同一段程式、照各項寫法依序套會打架的地方，以及跟 V11、perf-round1b、perf-round1c 重疊的地方。同一組衝突只在最後做到的那批寫完整寫法，前面那批留一條短的，說先守住什麼。行號是 a10704d 的。

各項內文已經吸收了舊的合併注意。內文裡還看得到的「第 N 批合 K」「合 N」是舊編號，已經作廢，內容都併進這裡了，不用回頭找。合併做法裡寫「某項的某句改成……」的，做的時候就照改過的那句。各項內文跟這裡衝突時照這裡。

### 合1　U51、U04（第 1 批）

**位置**：Store.swift:90-91（askName、needsName，U04 在 :91 下面加了 authSettling）、Store.swift:332-333（afterOAuth 開頭）、Store.swift:358-359（useOld 開頭）、Coach.swift:29-31（maybeStartCoach）、FoodMapApp.swift:65（.task 結束的右括號，U04 在它後面加了 onChange）、Onboard.swift:80-81（ClipWatch.check 的 guard）

**問題**：U51 還是 ec71aa2 時寫的，不知道第 1 批 U04 已經把它要的東西先做了一半。U04 已經在 Store.swift:91 下面加了 `var authSettling = false`，在 afterOAuth 和 useOld 開頭加了 `authSettling = true; defer { authSettling = false }`，把 maybeStartCoach 改成先擋 `pendingJoin == nil, !inviteOpened`，也在 FoodMapApp.swift:65 後面加了 `.onChange(of: store.askOld == nil && !store.askName && !store.authSettling)`。照 U51 字面依序套會打架。(1) 在 Store.swift:90 下面再宣告一次 authSettling，Store 會有兩個同名的儲存屬性，編不過；afterOAuth 開頭也會多一個 defer。(2) 把 Coach.swift:29-31 整段覆寫，會把 U04 的 `pendingJoin == nil, !inviteOpened` 拿掉，點邀請連結登入的人一加入群組，startCoach（Coach.swift:45）就把 tab 設回 0、開教學，U04 驗收第 2、5 點過不了。(3) 再掛一個條件一模一樣的 onChange，兩個會同時觸發，跟 U04 那個 Task 搶著跑。舊的合併注意裡有一種「takePendingJoin 回傳 Bool、.task 寫成 `if !(await …)`」的寫法，U04 沒有採用，已經作廢。

**合併做法**：

U51 在 U04 之後做，只做下面這些：
(1) 整條跳過。旗標、afterOAuth 和 useOld 的 defer 都是 U04 (1)(3)(4) 加好的。
(2) Coach.swift:29-31 不要整段覆寫，在 U04 的版本上把兩個 guard 併成一行，最後是：
```swift
    @MainActor func maybeStartCoach() {
        // 登入後的兩個問題答完才教（U51）；點邀請連結進來的這一輪先看群組，下次打開 App 再教（U04）
        guard askOld == nil, !askName, !authSettling, pendingJoin == nil, !inviteOpened else { return }
        if coach.isEmpty && !UserDefaults.standard.bool(forKey: "coachDone") { startCoach() }
    }
```
(3) 不要再加 onChange，把 U04 掛在 FoodMapApp.swift:65 `.task` 結束後面的那個改成：
```swift
                // Apple／Google 登入：流程跑完、兩個問題都答完的那一刻，才接邀請連結、開教學、看剪貼簿（不跟 alert 疊在一起）
                .onChange(of: store.askOld == nil && !store.askName && !store.authSettling) { _, free in
                    guard free else { return }
                    Task { await store.takePendingJoin(); store.maybeStartCoach(); ClipWatch.shared.check(store) }
                }
```
先 takePendingJoin 或先 maybeStartCoach 都擋得住教學：takePendingJoin 在 await join 之前就設好 inviteOpened，maybeStartCoach 在 pendingJoin 還在時也會被擋下。照上面的順序寫只是讓流程好讀。一定要守的是 ClipWatch.check 放在 maybeStartCoach 後面：startCoach 是同步把 coach 設成非空，ClipWatch 的 guard（Onboard.swift:80）看 coach.isEmpty，膠囊才不會跟教學疊在一起。.task 照 U04 的寫法不動：:58 的 sync 後面接 takePendingJoin，再來 maybeStartCoach。
(4) Onboard.swift:80 的 ClipWatch.check guard 照 U51 加 `!store.authSettling, store.askOld == nil, !store.askName`，U04 沒動這行。
(5) 照 U51 原文。
驗收：U04 的 1 到 8 點和 U51 的都要跑。另外確認兩件事：新 Apple 帳號從邀請連結登入，答完問題後停在群組頁，沒有教學暗底；不是從邀請進來的新帳號，答完問題後教學才出現，剪貼簿膠囊不跟 alert 同時出來。U51 的「注意」補一句：「第 1 批 U04 已經加了 authSettling、兩個 defer、maybeStartCoach 的邀請 guard 和 Root 的 onChange，這項照第 4 批的合併注意，U51 和 U04 那條在那上面擴充。」

### 合2　U59、U09（第 2 批）、U10（第 2 批）

**位置**：MapTab.swift:59（points）、MapTab.swift:65（第 2 批 U10 拆成 :65 base、:66 all）、MapTab.swift:358（NearbyHost 的呼叫）、MapTab.swift:586（reveal）、MapTab.swift:728（currentList）

**問題**：U59 本文把 U09 當成比它晚做，在「之後別批要配合的地方」寫「第 2 批 U09 拆 :65 時……給 NearbyHost 加 filter 參數時一律傳 applied」；實際上第 2 批先做，那時 applied 還不存在，所以做 U59 時 MapTab body 裡已經有 U10 寫好的 `let all = store.shown(store.mapF, in: base)` 和 NearbyHost 呼叫的 `filter: store.mapF`。U59 第 (2) 點只列了四處要換（:59 points、:65 all、:570 reveal、:712 currentList，後兩個是 3fc00de 行號，a10704d 是 :586、:728），沒列 NearbyHost 這個參數。照字面做完，MapTab body 還是在 NearbyHost 呼叫讀 store.mapF，在收藏頁打字時背景地圖照樣每個字重算，U59 驗收 1 過不了。

**合併做法**：

做 U59 第 (2) 點時，MapTab 裡讀共用篩選的地方一共五處，全部換成 applied（行號是 a10704d 的）：:59 points、U10 拆出來的那行 all（:66）、:586 reveal、:728 currentList，以及 :358 的 NearbyHost 參數。合起來是：
```swift
        let base = store.mapBase
        let all = store.shown(applied, in: base)
        // …
                NearbyHost(seen: seenBox, list: list, total: total, base: base.count, inGroup: store.mapGroup != nil, filter: applied, headY: headY, mapRect: mapRect) { near in
```
:65 的 `let base = store.mapBase` 不動。U59 決定不加的 `private var filter: Filter { … }` 計算屬性，如果 MapTab 裡有，整個刪掉，用到它的地方都改 applied。U10 的 .onSubmit 閉包、U09 清除篩選鈕裡的 store.mapF 都是在動作裡讀，不用換；SearchField 的 `$store.mapF.q`（:334）和 FilterChips 的 `$store.mapF`（:339）照 U59 原本說的，繼續綁共用篩選。做完在 MapTab.swift 搜 `store.mapF`，只能剩這兩個綁定，和 onSubmit、清除篩選鈕這種閉包裡的讀寫。U59 第 (2) 點的清單請補上 NearbyHost 這一處；「之後別批要配合的地方」和注意裡講 U09 的部分改成：「第 2 批已經先傳了 store.mapF，做這項時把它換成 applied」，U75 那句照留。

### 合3　U36、U38（第 3 批）、U66

**位置**：GroupsTab.swift:85-93（quick，U38 會加長；:84 是它的註解）、GroupsTab.swift:158-174（GroupCard 的「開始滑卡」膠囊，:169-171）、GroupsTab.swift:258、:266-277（GroupView 的「在地圖上看」、主按鈕、「調整條件」）、GroupsTab.swift:360（refreshable）

**問題**：U36 把 U38 當成之後才做（「之後幾批要照這裡的版本接：第 3 批 U38……」），但第 3 批先做。U38 做完後：(3) 把 quick(g)（:85-93）從 9 行改成十幾行，GroupCard 整段一開始就往下移，body 開頭又多了算 act、isNew 的幾行，所以 U36 寫的 GroupsTab 行號 :169、:171、:258、:273、:277、:476-479 全部往下移。:170 的 disabled 已經改成 `(count == 0 && isNew) || starting`，:171 的 opacity 照 U38「同理」也改成 `count == 0 && isNew ? 0.45 : 1`，U36 要搜的 `.opacity(count == 0 ? 0.45 : 1)` 字串對不到，容易漏刪；留著的話，停用時會被 dim 和這行 opacity 疊兩次，大約剩 0.2 的透明度（0.45 乘 0.45）。另外 U36 的說明把狀態叫 b、b.isNew，U38 本文和第 8 批的合併注意，U97、U120、U38 和 U36 那條用的都是 act、isNew，名字對不上。U66 (6) 的 GroupsTab.swift:360 也被 U38 和第 3 批 U62（:337-339 的 contextMenu 加長）往下推。

**合併做法**：

狀態變數一律用 U38 的名字 act 和 isNew，U36 說明裡的 b.isNew 讀成 isNew，不要另外再宣告 b。做 U36 第 (4) 點時照程式碼找，不要照行號。GroupCard 的膠囊（overlay 裡 Button(action: start) 那顆）最後是：
```swift
            .buttonStyle(PressStyle(dim: true))           // U36：變淡交給 PressBody
            .disabled((count == 0 && isNew) || starting)  // U38 的條件照留
```
這顆上面第 3 批留下的 `.opacity(…)` 不管寫成哪種條件，整行刪掉，不然停用時會淡兩次；padding 和 U38 改過的 accessibilityLabel 照留。GroupView：「🗺 在地圖上看」的 `.buttonStyle(PressStyle(haptic: true))` 改成 `PressStyle(haptic: true, dim: true)`，「調整條件」的 `.buttonStyle(PressStyle())` 改成 `PressStyle(dim: true)`，照 U36 原文。群組頁主按鈕是 ChunkyStyle(radius: 16)，照 U38 改過的 disabled（`(list.isEmpty && isNew) || starting`），不用加 opacity，ChunkyBody 會自己變灰。U36「之後幾批要照這裡的版本接」第一句裡 U38 的部分不用再做（第 3 批已經做了），U97、U120 的部分照留，到時一樣用 act、isNew。U36 驗收第 2 點的「0 張時變淡」改成在沒有進行中輪次（按鈕寫「開始滑卡」）時看。U66 (6) 的兩個 `.refreshable { await store.sync() }` 照字串找，:48 那個沒被推移，:360 那個會被 U38、第 3 批 U62 往下推。

### 合4　U36、U63（第 3 批）

**位置**：Theme.swift:13-43（U63 做完後 ChunkyStyle 是 :13-30、PressStyle 是 :32-45）、PlaceDetail.swift:163

**問題**：第 3 批 U63 會先做，走它「U36 還沒做」那條路：在 Theme.swift:17 下面加 `var haptic = false`、在 :26 的 .animation 後面加 .onChange，ChunkyStyle 從 :13-28 變成 :13-30，PressStyle 從 :30-43 變成 :32-45。U36 第 (1)(2) 點寫的是「Theme.swift:13-28 的 ChunkyStyle 整段換成」和「:30-43 的 PressStyle 整段換成」；照這兩個行號換，會在 ChunkyStyle 後面留下 U63 多出來的兩行和舊的右括號，PressStyle 也會少換到最後兩行，結果編不過。

**合併做法**：

做 U36 時，(1) 換的範圍是從 `struct ChunkyStyle: ButtonStyle {` 到它自己的右括號（U63 做完後是 Theme.swift:13-30），(2) 是從 `struct PressStyle: ButtonStyle {` 到它的右括號（U63 做完後是 :32-45），照結構換，不要照行號換。U36 (1) 的版本已經有 haptic 參數，名字和位置跟 U63 加的一樣（放在 radius 後面），而且多了 `&& on` 的判斷，停用時按下去不會震；U63 已經在 PlaceDetail.swift:163 加了 `haptic: true`，這裡不用再改。U36 驗收第 8 點照跑：店家頁那顆粉紅按鈕照常，按下去會輕震。

### 合5　U36、U65

**位置**：Edit.swift:47-60（AddSheet 主按鈕：:52 按鈕字、:57 PressStyle()、:58 disabled、:59 opacity、:60 animation）

**問題**：檢查員的 notes 把舊合1 拿掉了，可是這條在 a10704d 上還是會打架。U65 (1) 的範例寫「原本 :47-60 整段搬過來（empty、Button、disabled、opacity、animation 都不變）」，還把 `.buttonStyle(PressStyle())`、`.opacity(empty && !busy ? 0.45 : 1)`、`.animation(.easeOut(duration: 0.15), value: empty)` 列出來；U65 的注意只提 U64，完全沒提 U36。U36 (4)(5) 要把 :57 改成 PressStyle(dim: true)、刪掉 :59-60、:52 改字。同一批如果照編號先做 U36，再照 U65 的範例貼，opacity 會被貼回來，空白時淡兩次（0.45 再乘 0.45），:52 的「先貼上連結或打店名」也可能被換回舊字；反過來先做 U65，U36 寫的 :52、:57-60 行號全部對不上。U36 自己的修法裡有合併版，但做 U65 的人看不到。

**合併做法**：

先做 U65 的重排，再在搬進 safeAreaInset 的那段套 U36 (4)(5)，最後長成 U36 修法「同一批 U65 的合併」那份：Text 用 `busy ? "找店家中…" : empty ? "先貼上連結或打店名" : "AI 找店家並收藏"`，`.buttonStyle(PressStyle(dim: true))`、`.disabled(busy || empty)`，後面接 padding 和 `.background(Color.bg)`。U65 範例裡的 `.buttonStyle(PressStyle())`、`.opacity(empty && !busy ? 0.45 : 1)`、`.animation(...)` 三行不要照貼。U64 第 (5) 點的 interactiveDismissDisabled 加在重排後的 NavigationStack 上。U65 的注意補一句：同一批 U36 也改這顆按鈕，先做 U65 再套 U36，變淡交給 PressBody。驗收：在 U65 的新版面上跑 U36 驗收第 1 點，空白時按鈕只淡一次、字是「先貼上連結或打店名」，打一個字後恢復不淡，淡入淡出要順。

### 合6　U37、U63（第 3 批）

**位置**：Store.swift:543-576（U37 改的 save、add、create）、Store.swift:613-624（copyToMine）

**問題**：第 3 批 U63 會先把 copyToMine 最後改成 `if await create(n) != nil`，這樣第 9 批 U92 在 add() 裡加的「已收藏 X」就不會跟「已加到你的收藏」疊在一起。可是 U37 的修法寫「Store.swift:620 copyToMine 的 `if await add(n)` 不用改」，還把 :620 列成 add 的呼叫端；舊的合併注意裡也有一行要把那裡改成 `if await add(n) != nil {`。U63 做完之後那裡已經不是 add(n)，做 U37 的人如果把它改回 add，第 9 批 U92 做完後按「我也想去」又會先閃「已收藏 X」，再被「已加到你的收藏」蓋掉。

**合併做法**：

做 U37 時，copyToMine 保持 U63 的 `if await create(n) != nil { Haptic.success(); say("已加到你的收藏") }`，不要改回 add。U37 把 create 改成 `create(_ p: Place, err: ((String) -> Void)? = nil) async -> Place?`，err 預設 nil，copyToMine 不用傳 err，失敗時照樣說「新增失敗」，U63 的驗收第 4 步不受影響。U37 只改 Store.swift:543-576 那幾行，U63 是在 :613 前面插入 copying、copyKey，再換掉 copyToMine，兩邊不會撞到。U37 修法裡列的 add 呼叫端「Store.swift:620」劃掉，那裡現在呼叫的是 create。

### 合7　U34、U27（第 5 批）

**位置**：Trip.swift:534（註解）、Trip.swift:541-546（拿掉一站的 say 和復原 closure）、Trip.swift:547-551（等待）

**問題**：U34 第 (3) 點附了一份「想一起擋就把 :540-545 合成」的可選版本，在復原 closure 裡加「那天被拿掉就改到最後一天」；第 5 批 U27 卻判定 3fc00de 之後不用在這個 closure 改 s.day，兩邊說法相反。這組衝突的完整寫法放在第 5 批，因為 U27 在 U34 之後做。這批要先知道的是 U34 這一段做到哪裡為止。

**合併做法**：

U34 第 (3) 點拿掉一站那段只做它自己的部分：:541 的 say 前面加 `let msg = "已拿掉 \(s.name)"`，say 改用 msg；:542 拆成兩個 guard，失敗時 Haptic.warning() 加 store.say("已經刪掉了")；:548-550 的註解、sleep 和 while 換成 `await store.waitToastGone(msg)`；Trip.swift:534 的註解改「6 秒內」。修法 (3) 裡那份可選的合併版（`if let t = self.trip(s.trip_id), s.day > t.days` 那段）不要加，e7af2e1 的 `seconds: 6` 一定要留著。U34 注意裡「第 5 批 U27 也改 Trip.swift:540-545 拿掉一站的復原 closure，合併寫法在修法 (3)」那句作廢，U27 不改這個 closure。完整寫法見第 5 批的合併注意，U27 和 U34 那條。

### 合8　U59、U55（第 5 批）

**位置**：MapTab.swift:65-68（all、tripHide、list；第 2 批 U10 拆完之後是 :65-69）

**問題**：第 5 批 U55 第 (6) 點（選做）要把 MapTab.body 的 all 和 list 做成快取，key 寫的是 store.mapF。這組衝突的完整寫法放在第 5 批，因為 U55 在 U59 之後做。這批要先知道的是，U59 做完後 MapTab.body 不讀 store.mapF 這件事，之後 U55 的快取會靠它。

**合併做法**：

U59 照第 4 批的合併注意，U59、U09 和 U10 那條做完之後，MapTab.body 直接讀到的 store.mapF 只能剩 `$store.mapF.q`、`$store.mapF` 兩個綁定。U10 的 onSubmit 閉包和 U09 清除篩選鈕裡的 store.mapF 是在動作裡讀寫，照那條留著，不要改成 applied。U10 拆出來的 `let base = store.mapBase` 留在 body 裡。這批不用為 U55 加任何東西，Store 的 groupPlacesRev 也等第 5 批真的要做 (6) 時再加。完整寫法見第 5 批的合併注意，U55、U59、U09 和 U10 那條。

### 行號更正（a10704d）

- U59：修法 (3)「在 :115 DepthReport 那行下面加 `.background { FilterSync(tab: 1, applied: $applied) }`」（標 3fc00de，ListTab.swift 從 ec71aa2 到 a10704d 沒改），想指 `.background { DepthReport(path: $path, tab: 1) }` 那行。正確：ListTab.swift:116（:115 是註解「推頁、返回只讓 DepthReport 重算…」）
- U66：修法 (8)「:384 `loaded = true` 後面加一行 `return true`」（標 d95fd43，Trip.swift 到 a10704d 沒改），想指 loadNow 的 do 區塊最後那行 `loaded = true`。正確：Trip.swift:385（:384 是 `if nt != trips || ns != stops {` 那段的右括號）

## 各項

### U18（P2・規格落差）新帳號允許定位後，地圖還停在台北（規格 A5 的 3 公里鏡頭沒發生）

**畫面**：全新安裝 → 登入 → 地圖分頁（沒有收藏）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：fit() 的「新帳號用目前位置 3 公里」分支需要 store.here 有值，但 fit() 只在 onAppear、list.count、mapGroup 改變時跑。按「允許」之後位置才進來，不會再置中。這是規格 A5（第 47 行）的鏡頭要求沒做到，不是測試清單 3。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：3fc00de 還沒處理。fit() 在 MapTab.swift:990-1004，「新帳號用目前位置 3 公里」那段在 MapTab.swift:999-1002，還是只放在 fit() 裡；fit() 只會被 MapTab.swift:449（mapGroup 改變）、:454（onAppear）、:456（list.count 改變）、:681（setFoot 第一次量到下緣）叫到。拿第一筆位置的 .task 在 MapTab.swift:460-462，:461 只寫 store.here 就 break，不會再移鏡頭，所以新帳號按「允許」之後位置才進來，鏡頭還是停在台北。那段也沒看 store.loading、沒有動畫、沒管使用者有沒有自己動過鏡頭。最近的 commit 只動到旁邊：52a0b69 在 CamQuiet（MapPanel.swift:38-44）加了量測用的 flyStart、leg2（:41-42）；8559c3d 在連續鏡頭回呼裡加了 `if pos.positionedByUser { pins.camAt = now }`（MapTab.swift:187），都跟這項無關。行號對照：原本寫的 160／162 現在是 184／186，391 是 461，379／384／386 是 449／454／456，591 是 681，851-865 是 990-1004，定位鈕移鏡頭那幾行在 MapTab.swift:387-391。store.here 在 Store.swift:111。

**修法**：

(1) CamQuiet（MapPanel.swift:38-44，不是 @Observable，改它不會讓 MapTab 重算）在 :42 的 `var leg2` 後面加兩個欄位，52a0b69 加的 flyStart、leg2 照留：
```swift
var touched = false     // 使用者自己動過鏡頭
var centered = false    // 已經對準過目前位置（自動的 3 公里或使用者按了定位鈕）
```
第 6 批 U70 做了的話，這裡還會有它加的 `var wantHere = false`，名字不同，三個並存就好。

(2) MapTab.swift:184-194 的 onMapCameraChange(frequency: .continuous)，在 :187（8559c3d 加的 pins.camAt 那行）後面插一行：
```swift
if !quiet.touched, pos.positionedByUser, now > quiet.until { quiet.touched = true }
```
這一小段第 2 批 U12、U14，第 5 批 U61，第 7 批 U137 也都會改。全部合起來是下面這樣，沒做的項目那一行就不要加（8559c3d 的 camAt 那行一定要留，它擋的是兩指縮放放開時誤點圖釘）：
```swift
.onMapCameraChange(frequency: .continuous) { _ in
    // 手指拖地圖：下面那塊降到一行（停下來不自動彈回）
    let now = CACurrentMediaTime()
    if pos.positionedByUser { pins.camAt = now }                                            // 8559c3d 已有
    if !quiet.touched, pos.positionedByUser, now > quiet.until { quiet.touched = true }    // U18
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
    if trip.going, trip.offFollow != pos.positionedByUser { trip.offFollow = pos.positionedByUser }   // U61
    dot.refresh()          // U137 有做才刪
    pinFrame(proxy)
    if let c = spot.coord, Date() < spot.until { spot.at = proxy.convert(c, to: .global) }
}
```

(3) 在 fit()（MapTab.swift:990-1004）後面新增：
```swift
// 新帳號一間都沒有：拿到位置（或同步做完）時看目前位置附近約 3 公里；只做一次，使用者自己動過鏡頭或按過定位鈕就不做
private func centerIfEmpty(animated: Bool = true) {
    guard !fitted, !quiet.centered, !quiet.touched, !quiet.wantHere, footY > 0, !store.loading, bounds == nil,
          store.mine.isEmpty, store.mapGroup == nil, let h = store.here else { return }
    quiet.centered = true
    quiet.hush()
    let r = aim(MKCoordinateRegion(center: h.coordinate, latitudinalMeters: 3000, longitudinalMeters: 3000), grow: false)
    if animated { withAnimation(.smooth(duration: 0.5)) { pos = .region(r) } } else { pos = .region(r) }
}
```
`!quiet.wantHere` 是第 6 批 U70 的欄位：U70 還沒做就先拿掉這個條件，做 U70 時再補回來。不要因此把 fitted 設成 true，之後收藏了第一間，:456 的 list.count 改變時 fit() 才會去框收藏。footY > 0 是因為 aim()（MapTab.swift:691）要用到下緣，還沒量到就等 :681 setFoot 那次。

(4) fit() 的 MapTab.swift:999-1002（註解和 if 那三行）換成一行 `centerIfEmpty(animated: false)`，還是放在那個 Task 裡、:998 的 `if let b = bounds` 後面。這樣同一套條件也擋住「同步還沒跑完就先跳到目前位置」。

(5) MapTab.swift:461 改成：
```swift
do { for try await u in CLLocationUpdate.liveUpdates() { if let l = u.location { store.here = l; centerIfEmpty(); break } } } catch {}
```
並在 :456 的 `.onChange(of: list.count) { fit() }` 後面加：
```swift
.onChange(of: store.loading) { _, l in if !l { centerIfEmpty() } }
```

(6) 使用者自己按定位鈕就以定位鈕為準，同步做完不能再被拉去 3 公里。U70 還沒做的話，在 MapTab.swift:387 的 `if let l = loc.location ?? store.here {` 裡第一行加 `quiet.centered = true`；U70 做了（定位鈕那三行抽成 centerOn(_:)）就改放在 centerOn 的第一行，U70 的 `.onChange(of: store.here)` 照它原本的寫法即可（centerOn 已經會設 centered）。liveUpdates 是先寫 store.here、同一輪呼叫 centerIfEmpty，U70 的 onChange 要下一輪才跑，那時 wantHere 還是 true，centerIfEmpty 會被擋掉，鏡頭只會移一次。

**模擬器驗收**：(1) 模擬器刪掉 App 重裝，Features 的 Location 設成高雄的自訂座標（例如 22.6273, 120.3014），登入新的測試帳號，跳出定位詢問時按允許：鏡頭要在 0.5 秒內滑到高雄、大約 3 公里的範圍，而且落在搜尋列和中段面板之間。(2) 重來一次，這次按允許之前先用手指拖一下地圖，按允許後鏡頭不能被拉走。(3) 重來一次，按允許後馬上按右邊的定位鈕：鏡頭只滑一次（到街道範圍），之後同步做完也不能再跳去 3 公里。(4) 舊帳號（有收藏）刪掉 App 重裝再登入：只框收藏一次，不能先跳到目前位置再跳回來。(5) 新帳號在地圖上收藏第一間店後，鏡頭要改成框這間（list.count 那條照舊）。

**注意**：跟第 2 批 U12、U14，第 5 批 U61，第 7 批 U137 都改 MapTab.swift:184-194 那段連續鏡頭回呼，合併寫法已經寫在修法 (2)，內容不衝突，只是錨點會互相推移；U137 刪掉 dot.refresh() 之後別項不要再拿它當錨點。跟第 6 批 U70 都在「第一筆位置進來」時移鏡頭，也都在 CamQuiet 加欄位，做法見修法 (3) 的 wantHere 和 (6)。perf-round1b 要加的 flyStart、leg2 已經由 52a0b69 加進 CamQuiet（MapPanel.swift:41-42），照留。U15 已修：touched、centered 一定要放在 CamQuiet 這種不觸發重算的物件，不要用 MapTab 的 @State。新加的 .onChange(of: store.loading) 讓 MapTab 每次同步開始、結束各多重算一次，次數很少可以接受；想完全避免可以改放在 NearbySheet（它已經讀 store.loading），用閉包叫回 MapTab。

### U31（P2・體驗）點通知不會帶到收藏頁或那間店，新店亮框也在背景就播完了

**畫面**：收到「收藏好了」通知 → 點通知打開 App

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：AppDelegate 只有 willPresent，沒有 didReceive，點通知只會打開在上次的畫面。markFresh 不看分頁也不看前景狀態，1.2 秒亮框常常白播。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：還沒修，5d713ac、d95fd43 都沒碰這幾處。FoodMapApp.swift:368-382 的 AppDelegate 還是只有 willPresent（:381），沒有 userNotificationCenter(_:didReceive:)，點通知只會打開上次的畫面。兩份 ShareUpload.swift（FoodMap/ 和 BitemapShare/）建通知的 :66-71 沒放 userInfo，:66 還是 `let ok`（第 1 批 U03 還沒做）。Store.swift:448-457 的 markFresh 還是不看分頁、不看前景，立刻亮框、1.2 秒後收掉；分享在背景存好時 FoodMapApp.swift:67 收到 shareSaved 就 sync，noteNew（Store.swift:441-446）在背景把亮框播完。收藏頁的 path 還是 ListTab.swift:7 的 @State，深度由 DepthReport（ListTab.swift:429-434）回報到 store.depth。行號變動：5d713ac 在 FoodMapApp.swift:117-122 的訊息條 pad 多了兩行，:119 之後的行號比 3fc00de 再往下移 2 行：phase 的 onChange 從 :206-214 變成 :208-216（.active 在 :211-215，askNotifyAfterShare 在 :212），page() 從 :218-227 變成 :220-229，AppDelegate 從 :366-380 變成 :368-382，TabBar 的按鈕動作從 :322-325 變成 :324-327。:54 的 onChange(of: store.tab)、:55-65 的 .task、:60、:67 沒變。Store.swift 的 signOut 還在 :418-427，runAdd 呼叫 markFresh 在 :502。

**修法**：

不把收藏頁的 path 搬進 Store（3dd40e3 特地讓 body 不讀 path，搬進 @Observable 會把那次效能修正退回去），改用計數器讓收藏頁自己清 path、捲到頂。

(1) 兩份 ShareUpload.swift 都要改，兩份要保持一模一樣。第 1 批 U03 會先做，它把 :66 的 `let ok` 換成 `let v: Verdict`。U03 做完後，在 U03 的 c.body 那行後面加：
```swift
c.userInfo = ["kind": v == .saved ? "saved" : v == .dup ? "dup" : "failed"]
```
如果 U03 還沒做，先在 :69 和 :70 之間加 `c.userInfo = ["kind": ok ? "saved" : "failed"]`，做 U03 時再換成上面那行，不然 `ok` 不存在會編不過。

(2) Store 在 Store.swift:60 的 freshIds 旁邊加：
```swift
// 點通知要回收藏頁頂端時 +1（ListTab 看到就清 path、捲到最上面）
var listTop = 0
// 等著亮框的新店：前景、在收藏頁清單這一層才播
@ObservationIgnored var pendingFresh: Set<String> = []
// 冷啟動時 Root 還沒訂閱通知，先記著
static var openSavedPending = false
```
通知名稱只有 App 會用，放在 FoodMapApp.swift 檔尾（:382 後面）就好，不用動到兩份 ShareUpload.swift：
```swift
extension Notification.Name {
    static let openSaved = Notification.Name("bitemap.openSaved")
}
```

(3) FoodMapApp.swift:381 的 willPresent 下面加：
```swift
func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse) async {
    // 「收藏好了」「之前收藏過了」都在收藏裡，點了帶去收藏頁；「沒收藏到」照舊打開原本的畫面
    let kind = r.notification.request.content.userInfo["kind"] as? String
    guard kind == "saved" || kind == "dup" else { return }
    await MainActor.run {
        Store.openSavedPending = true
        NotificationCenter.default.post(name: .openSaved, object: nil)
    }
}
```
兩則合併注意對「之前收藏過了」要不要換頁寫法不一樣，這裡統一成三種值都帶、didReceive 收 saved 和 dup；只想讓「收藏好了」換頁就把 guard 改成 `kind == "saved"`。

(4) Root：
- FoodMapApp.swift:55 的 .task 第一行（:57 的 `await LaterDelete.flush` 前面）加 `if Store.openSavedPending { openSaved() }`。
- :67 的 shareSaved 那行後面加 `.onReceive(NotificationCenter.default.publisher(for: .openSaved)) { _ in openSaved() }`。
- :54 改成 `.onChange(of: store.tab) { _, t in opened.insert(t); store.flushFresh() }`。
- :211-215 的 `if p == .active {` 分支裡加一行 `store.flushFresh()`，U30 已經加在那裡的 askNotifyAfterShare（:60、:212）照留。
- 在 page()（:220-229）後面加：
```swift
private func openSaved() {
    Store.openSavedPending = false
    withAnimation(.snappy) { store.tab = 1 }
    store.listTop &+= 1
}
```

(5) ListTab：
- :12 後面加 `@State private var pos = ScrollPosition(edge: .top)`。
- :80 的 `.scrollDismissesKeyboard(.immediately)` 後面加 `.scrollPosition($pos)`。
- :116 的 DepthReport 那行後面加：
```swift
.onChange(of: store.listTop) {
    path = NavigationPath()
    withAnimation(reduce ? nil : .snappy) { pos.scrollTo(edge: .top) }
}
```
- DepthReport（:433）改成 `Color.clear.onChange(of: path.count) { _, n in store.depth[tab] = n; if n == 0 { store.flushFresh() } }`。其他分頁也用 DepthReport，但 flushFresh 自己會看 tab 和 depth[1]，多叫沒關係。
收藏頁還沒建過的話，切過去時 path 本來就是空的、在最上面，不用另外處理。

(6) markFresh 改成先排隊，Store.swift:448-457 整段換成：
```swift
func markFresh(_ ids: Set<String>) {
    seenIds.formUnion(ids)
    UserDefaults.standard.set(Array(seenIds), forKey: "seenIds")
    PinState.fresh.formUnion(ids)   // 地圖的落下動畫照舊
    pendingFresh.formUnion(ids)
    flushFresh()
}

// 前景、在收藏頁、而且在清單這一層（沒推進店家頁）才播亮框
func flushFresh() {
    guard !pendingFresh.isEmpty, UIApplication.shared.applicationState == .active, tab == 1, depth[1] == 0 else { return }
    let ids = pendingFresh; pendingFresh = []
    Task {
        try? await Task.sleep(for: .milliseconds(350))   // 等換頁動畫和捲到頂
        withAnimation(.snappy) { freshIds.formUnion(ids) }
        try? await Task.sleep(for: .seconds(1.2))
        withAnimation(.easeOut(duration: 0.4)) { freshIds.subtract(ids) }
    }
}
```
Store.swift:421 的 signOut 那行加上 `pendingFresh = []`。runAdd（Store.swift:502）在收藏頁按新增時 tab 本來就是 1，只是亮框晚 0.35 秒；從地圖新增的話改成切到收藏頁時才亮，這是想要的行為。

(7) 第 9 批 U95 做的時候，不要再宣告 pos、不要再加 `.scrollPosition`、不要加 retapList，TabBar（FoodMapApp.swift:324-327）的按鈕動作在 :327 前面加 `if store.tab == i { if i == 1 { store.listTop &+= 1 } else if i == 2 { store.retapGroups += 1 }; return }`，直接共用這裡的 listTop。

**模擬器驗收**：(1) App 切到背景、停在地圖分頁，用 xcrun simctl push booted <bundle id> payload.json 送一則 {"aps":{"alert":{"title":"收藏好了 🍩","body":"測試"}},"kind":"saved"} 的假通知，點它：要切到收藏頁、在最上面。(2) 先在收藏頁點進某間店家頁再切到背景，送同一則通知並點它：要回到清單頂層，不是停在店家頁。(3) 把 App 整個關掉再送一次、點它：冷啟動也要到收藏頁。(4) kind 改成 dup 再送一次，點了也要到收藏頁；改成 failed，點了不會換頁。(5) 停在地圖分頁時用測試帳號從 Safari 分享一間新店，等存好後切到收藏頁：那張新卡這時才亮框約 1 秒。測完把新店刪掉。(6) 做了 U95 之後，在收藏頁往下捲再點一次分頁列的「收藏」，要捲回最上面。

**注意**：第 1 批 U03 先做，它把 ShareUpload.swift:66 的 ok 換成 v，這項的 userInfo 要用 v 的寫法（修法 (1)）。第 9 批 U95 也在 ListTab 加 ScrollPosition 和捲到頂，只能留一份，U95 改用這裡的 pos 和 listTop（修法 (7)）。第 4 批 U32、U35 也改 ListTab.swift（U35 是 :61、:152-158），這項改的是 :12、:80、:116、:433 附近，不衝突，只是同一個檔案要一起合。已修的 U30 在 Root 的 .task（FoodMapApp.swift:60）和 phase .active（:212）加過 askNotifyAfterShare，加程式時要保留。3fc00de 的 toastFading 和 5d713ac 的 tripPad 都只讓 FoodMapApp.swift 後段的行號往下移，不影響這項的寫法。d95fd43 只改 TripsList.swift，跟這項沒有重疊。

### U32（P2・錯誤）按「自己填」後，原本貼的 IG 連結被丟掉

**畫面**：收藏頁「沒找到」卡 → 自己填；新增視窗 → 自己填

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：兩個「自己填」都用 Place(name: text 開頭是 http 就給空字串) 建店，source_url 沒帶。結果沒有看影片膠囊，「從 IG 收藏」不會打勾，剪貼簿比對也找不到。前面有字的「看看這家 https://…」整段會被當成店名。AddSheet 還沒送出就按自己填也一樣。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：ListTab.swift:89-95（「沒找到」卡的自己填）和 Edit.swift:89-95（新增視窗的自己填）都還是 `Place(id:, name: 開頭是 http 就給空字串)`，source_url 沒帶，前面有字的「看看這家 https://…」整段會變店名。EditSheet（Edit.swift:109-217）也還沒有來源連結欄位。Place 的 source_url 存檔欄位在 Store.swift:960（原本寫的 Store.swift:928）。

**修法**：

(1) 在 Edit.swift 檔案層級（例如第 219 行 extension Place 前面）加一個共用函式。不要取名叫 split：EditSheet 裡已經有 private func split(_:) -> [String]（Edit.swift:194-196），在 EditSheet 裡呼叫時會被同名的方法蓋掉，改叫 splitLink：
```swift
// 貼進來的字拆成第一個網址和其他文字：自己填時網址放來源連結，其他字當店名
func splitLink(_ s: String) -> (url: String?, rest: String) {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let d = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
          let m = d.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)),
          let r = Range(m.range, in: t),
          t[r].lowercased().hasPrefix("http") else { return (nil, t) }   // 只認 http(s) 開頭的，店名裡的「xx.tw」不算
    var rest = t; rest.removeSubrange(r)
    return (String(t[r]), rest.trimmingCharacters(in: .whitespacesAndNewlines))
}
```
(2) ListTab.swift:91 改成：
```swift
let (u, rest) = splitLink(a.text)
var p = Place(id: UUID().uuidString, name: rest)
p.source_url = u
```
Edit.swift:91 一樣，把 a.text 換成 input。PendingAdd.text 本來就留原文，不用改。
(3) EditSheet 在 Edit.swift:169-173 那個 Section 的「筆記」下面加：
```swift
TextField("來源連結（IG、網址）", text: str(\.source_url))
    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
```
Form 裡的 TextField 預設是 17pt，符合 16pt 以上。save()（Edit.swift:198-202）在 trim 店名那行後面加 `if p.source_url?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true { p.source_url = nil }`，清空時存 null 不存空字串。

**模擬器驗收**：新增視窗貼「看看這家 https://www.instagram.com/reel/test」後按自己填，確認店名欄是「看看這家」、來源連結欄是那個網址，然後按取消，不存。再只貼網址按自己填，確認店名欄空著、來源連結有網址。最後隨便打開一間測試帳號的店按編輯，確認看得到來源連結欄，用 Playwright 以外的方式（Xcode 的 View Debugger 或 Accessibility Inspector）確認字級 17pt，按取消不存。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批裡 U36 也改 Edit.swift，但在 AddSheet 的主按鈕（第 47-60 行），這項改第 89-95 行和 EditSheet，不衝突。U31、U35 也改 ListTab.swift 的其他行，要一起合。

### U34（P2・錯誤）按住訊息條會暫停倒數，真正刪除的計時卻不停，「復原」按了沒反應（部分已修，下面只寫剩下的）

**畫面**：長按卡片 → 刪除 → 訊息條「復原」；店家頁 → 更多 → 刪除

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：訊息條在 toastHeld 時暫停，deleteWithUndo 卻固定 4.2 秒就送出 DELETE。按住超過約 0.2 秒再按復原，guard 失敗直接 return：沒震動、沒提示，訊息條也不收。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：e7af2e1 改了一半。Store.swift:589-598 的「已刪除」訊息條改成停 6 秒（:598 `seconds: 6`），:599-602 的 Task 改成先睡 6.5 秒（slowToasts 時 20.5 秒），再用 `while toastHeld && toast?.hasPrefix("已刪除") == true` 等手指放開才送 DELETE；Trip.swift:540-549 的拿掉一站也照這樣改（:545 `seconds: 6`、:548-549），刪行程本來就是這個寫法（Trip.swift:447-460）。3fc00de 再讓訊息條時間到時先淡出 0.45 秒，淡出期間「復原」按了不算（FoodMapApp.swift:137、:162-166、:173）。所以「一直按住到 6.5 秒以後」現在救得回來，但原本指出的漏洞還在：倒數只在沒按住時扣（FoodMapApp.swift:156-161），按住 1 到 4 秒再放開，訊息條要到大約第 9 秒才收，可是刪除的 Task 在第 6.5 秒醒來時 toastHeld 已經是 false，就直接送出 DELETE；這時訊息條和「復原」都還在，按下去 Store.swift:590 的 guard 失敗直接 return，沒震動、沒提示、訊息條也不收。另外倒數是 60 次 100 毫秒的 sleep，主執行緒忙的時候會累積延遲，訊息條可能比固定的 6.5 秒晚收，同樣會出現「看得到復原但已經刪了」。Trip.swift:448（刪行程）和 :541（拿掉一站）的復原 guard 一樣是失敗就靜靜 return。Store.swift:579、Trip.swift:534 的註解還寫「4 秒內」。

**修法**：

不要照 e7af2e1 那樣「固定睡 6.5 秒再看手指有沒有按著」，改成等這條訊息條真的不見了才刪，按住、放開後剩下的秒數、slowToasts、主執行緒延遲、第 10 批 U107 的 VoiceOver 15 秒都一起解決。

(1) Store 在 say()（Store.swift:429-432）後面加一個共用的等待函式（U35 也會用）：
```swift
// 等這條訊息條真的收起來（倒數完並淡出、被別的訊息換掉、被點掉，或切到背景被 LaterDelete.flush 收掉）再多等 0.3 秒
func waitToastGone(_ msg: String) async {
    try? await Task.sleep(for: .seconds(1))
    while toast == msg { try? await Task.sleep(for: .milliseconds(200)) }
    try? await Task.sleep(for: .milliseconds(300))
}
```
3fc00de 的淡出期間 toast 還等於 msg、「復原」也已經按不了，所以等到 toast 變 nil 一定晚於最後一次能按復原的時間。

(2) Store.swift:589-602 改成（:604-609 送 DELETE、失敗放回、LaterDelete.remove 照舊）：
```swift
let msg = "已刪除 \(p.name)"
say(msg, icon: .trash, place: p, action: ("復原", { [weak self] in
    guard let self else { return }
    guard self.undoable.remove(p.id) != nil else { Haptic.warning(); self.say("已經刪掉了"); return }
    LaterDelete.remove("places", p.id)
    // 從訊息條左邊的小照片彈回原位
    withAnimation(.snappy(duration: 0.35)) {
        self.places.insert(p, at: min(at, self.places.count))
        self.groupPlaces += shares
        self.toast = nil; self.toastPlace = nil
    }
}), seconds: 6)
Task {
    // 等訊息條真的收起來才刪：「復原」還看得到就一定有用
    await waitToastGone(msg)
    guard undoable.remove(p.id) != nil, loggedIn else { return }
```
也就是拿掉 :600-602 的固定 sleep 和 toastHeld 迴圈，`seconds: 6` 留著。Store.swift:579 的註解改成「6 秒內」。

(3) Trip.swift 兩個刪除照同樣寫法：
- 刪行程：:447 前面加 `let msg = "已刪除「\(t.title)」"`，say 改用 msg；:448 改成 `guard let self else { return }` 加 `guard self.hiddenTrips.remove(t.id) != nil else { Haptic.warning(); store.say("已經刪掉了"); return }`；:458-460 的註解、sleep 和 while 換成 `await store.waitToastGone(msg)`。
- 拿掉一站：:540 前面加 `let msg = "已拿掉 \(s.name)"`；:541 同樣拆成兩個 guard，失敗時 Haptic.warning() 加 store.say("已經刪掉了")；:547-549 換成 `await store.waitToastGone(msg)`。Trip.swift:534 的註解改成「6 秒內」。
第 5 批 U27 原本要在拿掉一站的復原 closure 裡補「那天被拿掉了就改到最後一天」。3fc00de 加了拿掉一天（TripTop.swift:175-198），它會用「已拿掉第 N 天」把拿掉一站的訊息條換掉，同一支手機上已經不可能先拿掉那天再按復原；只剩群組裡別人同時拿掉那天的情況。想一起擋就把 :540-545 合成：
```swift
let msg = "已拿掉 \(s.name)"
store.say(msg, icon: .trash, action: ("復原", { [weak self] in
    guard let self else { return }
    guard self.hiddenStops.remove(s.id) != nil else { Haptic.warning(); store.say("已經刪掉了"); return }
    LaterDelete.remove("trip_stops", s.id)
    withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { self.stops.append(s); store.toast = nil }
    // 復原期間那天被拿掉了：改到現在的最後一天，update 會送 PATCH，伺服器那份也跟著改
    if let t = self.trip(s.trip_id), s.day > t.days {
        var y = s; y.day = t.days; y.pos = self.nextPos(t.id, t.days)
        self.update(y, store: store)
    }
    self.saveCache()
}), seconds: 6)
```

(4) LaterDelete.flush（Store.swift:1008）用前綴「已刪除」「已拿掉」收掉訊息條的寫法不用改：收掉後 waitToastGone 會結束，之後再送一次 DELETE 無害；signOut 有 loggedIn 擋著。

(5) 連續刪除合併成一條訊息仍然是加分項：現在第二次刪除的 say 會把第一條換掉，第一間救不回來，但會在第二條出來後約 1.3 秒照常送出，不會卡住。另外留意 Root 的 `.task(id: t)`（FoodMapApp.swift:154）是用訊息文字當 id，連刪兩間同名的店（例如同品牌兩間分店）時倒數不會重來，第二條只剩第一條沒用完的秒數；waitToastGone 一樣會等它收起來，所以不會刪錯，只是第二條停得比較短，要改可以另外排。

**模擬器驗收**：(1) 用 -uitestSlowToasts 啟動，在測試帳號的暫存店長按刪除，手指按住訊息條 25 秒再放開，接著按復原：店要回來，網路紀錄沒有送出 DELETE。(2) 不加 -uitestSlowToasts：刪一間暫存店，馬上按住訊息條 4 秒、放開，在訊息條還沒開始淡出前（放開後大約 2 秒內）按復原，要救得回來（3fc00de 現在這一步會失敗）。(3) 刪一間不按復原，等訊息條淡出消失後約 0.3 秒才看到 DELETE，下拉同步那間不會跑回來。(4) 在行程裡拿掉一站、刪一個測試行程，各照 (2) 的方式按住再放開後按復原，都要救得回來。(5) 淡出那 0.45 秒內按復原沒反應是 3fc00de 刻意的，不算失敗。(6) 刪 A 後馬上刪 B，A 要在 B 的訊息條出來後約 1.3 秒送出，之後 A 救不回來。

**注意**：跟同一批（第 4 批）的 U35 直接相關：deleteManyWithUndo 要用這裡的 waitToastGone 和同一套「已經刪掉了」提示，所以先做 U34 再做 U35。第 10 批 U107 的 (1)(2)(3) 用 toast didSet 加 commit 的另一套機制解同一件事，兩套並存會兩條路都送 DELETE；以這項的 waitToastGone 為準，U107 只做 (4)(5)(6)，它的 VoiceOver 15 秒 waitToastGone 會自己跟著等（e7af2e1 的固定 6.5 秒就跟不上，這也是要換掉的原因）。第 5 批 U27 也改 Trip.swift:540-545 拿掉一站的復原 closure，合併寫法在修法 (3)，記得保留 e7af2e1 加的 `seconds: 6`；3fc00de 已經加了拿掉一天（TripTop.swift:175-198），U27 本身的狀態要另外看。

### U35（P2・體驗）長按「3 間分店」卡片按刪除，只刪掉最近那間，卡片還在

**畫面**：收藏頁 → 長按有分店的卡片 → 刪除／改成去過

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：contextMenu 只對 g[0]（離你最近那間）動作，選單也沒寫是哪一間。刪完卡片變「2 間分店」，看起來像沒刪成功；「改成去過」也只改一間。build 10 就有這個問題。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：3fc00de 還沒處理，ListTab.swift 從 acd4471 之後完全沒改。ListTab.swift:61 的 contextMenu 還是只把 p（g[0]，離你最近那間）傳給 menu；ListTab.swift:151-158 的 menu(p) 只有「改成去過／改成想去」和「刪除」，都只動這一間，選單也沒寫是哪一間。Store.swift 也還沒有一次刪多間的函式。changed_regions 裡的 Store:574-599、580-609 是 e7af2e1 改了 deleteWithUndo（現在是 Store.swift:579-611）：訊息條停 6 秒（:598）、刪除改成固定睡 6.5 秒再等手指放開（:599-602），所以原本「加在第 580-609 行後面」的錨點現在是 :611 後面，新函式的等待方式也要跟 U34 一樣用 waitToastGone，不要照抄 e7af2e1 的寫法。branchLabel 在 Store.swift:972，PlaceCard 去掉分店名的寫法在 ListTab.swift:197。

**修法**：

這項要等 U34（同一批）先做，用到它加的 waitToastGone 和「已經刪掉了」提示。

(1) ListTab.swift:61 改成 `.contextMenu { if store.isMine(p) { menu(p, g.filter(store.isMine)) } }`。

(2) ListTab.swift:151-158 改成：
```swift
// 長按卡片：直接改想去／去過、刪除；有分店時寫出是哪一間，另外可以整家刪掉
@ViewBuilder private func menu(_ p: Place, _ g: [Place]) -> some View {
    let label = g.count > 1 ? branchLabel(p) : p.name
    Button(p.been ? "「\(label)」改成想去" : "「\(label)」改成去過", systemImage: p.been ? "heart" : "checkmark.circle") {
        var n = p; n.status = p.been ? "want" : "been"; if !n.been { n.rating = nil }
        Task { await store.save(n) }
    }
    Button("刪除「\(label)」", systemImage: "trash", role: .destructive) { store.deleteWithUndo(p) }
    if g.count > 1 {
        Button("刪除整家（\(g.count) 間分店）", systemImage: "trash.fill", role: .destructive) { store.deleteManyWithUndo(g) }
    }
}
```
「改成去過」不要套到全部分店。g 是篩選後看得到的分店，跟卡片上「N 間分店」的數字一致。

(3) Store.swift:611（deleteWithUndo 的結尾）後面加 deleteManyWithUndo：一次移除、一條訊息條、一次復原、一個 DELETE。不要用迴圈呼叫 deleteWithUndo，訊息條會互相蓋掉，只救得回最後一間。訊息條跟 deleteWithUndo 一樣停 6 秒：
```swift
@MainActor func deleteManyWithUndo(_ ps: [Place]) {
    guard ps.count > 1 else { if let p = ps.first { deleteWithUndo(p) }; return }
    let ids = Set(ps.map(\.id))
    let at = ps.map { p in (p, places.firstIndex { $0.id == p.id } ?? 0) }.sorted { $0.1 < $1.1 }
    let shares = groupPlaces.filter { ids.contains($0.place_id) }
    undoable.formUnion(ids)
    ids.forEach { LaterDelete.add("places", $0) }
    withAnimation(.snappy(duration: 0.35)) {
        places.removeAll { ids.contains($0.id) }
        groupPlaces.removeAll { ids.contains($0.place_id) }
    }
    let brand = ps[0].name.replacingOccurrences(of: branchLabel(ps[0]), with: "").trimmingCharacters(in: .whitespaces)
    let msg = "已刪除 \(brand)（\(ps.count) 間分店）"
    // place 給 ps[0]：卡片封面就是 g[0]，刪除時卡片會縮小飛到訊息條（DeleteMatch 用 place.id 配對）
    say(msg, icon: .trash, place: ps[0], action: ("復原", { [weak self] in
        guard let self else { return }
        guard ids.allSatisfy({ self.undoable.contains($0) }) else { Haptic.warning(); self.say("已經刪掉了"); return }
        self.undoable.subtract(ids)
        ids.forEach { LaterDelete.remove("places", $0) }
        withAnimation(.snappy(duration: 0.35)) {
            for (p, i) in at { self.places.insert(p, at: min(i, self.places.count)) }
            self.groupPlaces += shares
            self.toast = nil; self.toastPlace = nil
        }
    }), seconds: 6)
    Task {
        await waitToastGone(msg)   // U34 加的
        let go = ids.filter { undoable.remove($0) != nil }
        guard !go.isEmpty, loggedIn else { return }
        do { try await Supa.write("DELETE", "places", query: "id=in.(\(go.joined(separator: ",")))"); saveCache() }
        catch {
            withAnimation(.snappy) { for (p, i) in at where go.contains(p.id) { places.insert(p, at: min(i, places.count)) }; groupPlaces += shares }
            say("刪除失敗：" + error.localizedDescription)
        }
        go.forEach { LaterDelete.remove("places", $0) }
    }
}
```
訊息以「已刪除」開頭，LaterDelete.flush（Store.swift:1008）切到背景時一樣會收掉它並補送每一間。

**模擬器驗收**：(1) 用測試帳號長按一張有分店的卡片，只看選單文字：第一項寫「「○○店」改成去過」，有「刪除「○○店」」和「刪除整家（N 間分店）」，不要按刪除。(2) 長按一張只有一間的卡片：按鈕帶店名，沒有「刪除整家」。(3) 要測整家刪除時，先用測試帳號另外建兩間同品牌的暫存店，按「刪除整家（2 間分店）」，按住訊息條 3 秒再放開，接著按復原：兩間都回來、卡片還是「2 間分店」，網路紀錄沒有 DELETE。(4) 再刪一次整家不按復原，訊息條約 6 秒後淡出消失，之後只送出一個 `id=in.(…)` 的 DELETE，下拉同步兩間都不會跑回來。

**注意**：依賴同一批（第 4 批）的 U34：waitToastGone 和「已經刪掉了」提示是 U34 加的，要先做 U34。第 10 批 U107 的 (1)(2)(3) 不要做（理由見 U34），這裡的整家刪除也只走 waitToastGone，不要另外接 commit。同一批的 U31（ListTab.swift:12、:80、:116、:433）和 U32 也改 ListTab.swift 的其他行，不衝突，只是同一個檔案要一起合。

### U36（P2・體驗）ChunkyStyle／PressStyle 停用時不變灰，按了沒反應像卡住（部分已修，下面只寫剩下的）

**畫面**：新增視窗（還沒輸入時）；沒有店的群組頁「開始滑卡／調整條件／在地圖上看」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：自訂 ButtonStyle 在 .disabled 時不會自動變淡，這兩個樣式只讀 isPressed，顏色寫死。新增視窗空著時，大大的橘色「AI 找店家並收藏」按了什麼都沒發生。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：5d713ac、d95fd43 都沒有碰 Theme.swift、Edit.swift、GroupsTab.swift、MeTab.swift、Draw.swift、ListTab.swift、Login.swift、PlaceDetail.swift，這些檔案在 d95fd43 的行號跟 3fc00de 一樣。4a05adb 修好的新增視窗還在：Edit.swift:48 自己算 empty，:57 用 PressStyle()，:58 `.disabled(busy || empty)`，:59 `.opacity(empty && !busy ? 0.45 : 1)`，:60 淡入動畫；主按鈕字還是「AI 找店家並收藏」（:52）。Theme.swift:13-28 的 ChunkyStyle、:30-43 的 PressStyle 還是只讀 isPressed，停用時不會變淡。沒有店的群組頁一樣看起來像可以按：GroupsTab.swift:273「開始滑卡」（ChunkyStyle）、:258-259「在地圖上看」、:277-278「調整條件」（PressStyle）。各處手動變淡的位置：GroupsTab.swift:171、Draw.swift:375、TripPanel.swift:305 和 :312（TripPanel 在 5d713ac 只多了 :847 一行，這兩行沒移）、MeTab.swift:367。TripsList.swift 被 5d713ac、d95fd43 改過：行程卡的按鈕從 :68 移到 :92-93（`.buttonStyle(PressStyle())` 在 :93），SwipeToDelete 的 `.disabled(swiped)` 從 :345 移到 :382；5d713ac 在 SwipeToDelete 加了停在露出垃圾桶（:375 open、:384 收回用的 overlay、:388-396 垃圾桶 Button 用 `.buttonStyle(.plain)`），沒用 PressStyle、ChunkyStyle。TripPanel.swift:476 的站卡也包在同一個 SwipeToDelete 裡。

**修法**：

PressStyle 不能一律在停用時變淡：TripsList.swift:92-93 的行程卡和 TripPanel.swift:476 的 StopCard 都包在 SwipeToDelete 裡，滑動時會被 `.disabled(swiped)`（TripsList.swift:382），左滑時整張會變淡；ListTab.swift:403-404 新手清單做完的項目已經自己變灰加刪除線，GroupsTab.swift:476-479 已經用灰底表示停用，會淡兩次。所以做法是 ChunkyStyle 自動變淡，PressStyle 要明寫 dim 才變淡。下面行號都是 d95fd43 的。

(1) Theme.swift:13-28 的 ChunkyStyle 整段換成下面這份。這份已經把第 3 批 U63 要加的 haptic 參數併進來，放在 radius 後面，所以不管 U63 先做還是後做，做 U63 時只要在 PlaceDetail.swift:163 加 `haptic: true`，Theme.swift 不用再改：
```swift
struct ChunkyStyle: ButtonStyle {
    var color: Color = .accent
    var edge: Color = .accentDeep
    var fg: Color = .white
    var radius: CGFloat = 14
    var haptic = false   // 手指一按下就輕震（U63）
    func makeBody(configuration: Configuration) -> some View {
        ChunkyBody(c: configuration, color: color, edge: edge, fg: fg, radius: radius, haptic: haptic)
    }

    // 停用時自己變灰變淡（自訂樣式 disabled 時不會自動變淡，看起來像壞掉）
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

(2) Theme.swift:30-43 的 PressStyle 整段換成下面這份。這份已經把第 8 批 U120、U121 要的 scale、pressed 一起放進來，參數順序是 haptic、scale、onPress、dim、pressed。做 U120 時不要再把 PressStyle 整段換掉，直接用這份：
```swift
struct PressStyle: ButtonStyle {
    var haptic = false                   // 手指一按下就輕震（不等放開）
    var scale: CGFloat = 0.96            // 按住時縮多少；1＝自己不縮，交給外面一起縮（U120）
    var onPress: (() -> Void)? = nil     // 手指一按下就先做的事（例如先拿影片網址）
    var dim = false                      // 停用時變淡（自己用灰底、刪除線表示停用，或外面包著會暫時 disabled 的東西，就不要淡）
    var pressed: Binding<Bool>? = nil    // 按住、放開都回報，給外面整組一起縮用（U120）
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
現有的 `PressStyle(haptic: true)`、`PressStyle { ReelCache.warm(p) }`（ListTab.swift:60、GroupsTab.swift:336）、`PressStyle(haptic: true) { long = false }`（Draw.swift:218）都照樣編得過，尾隨閉包會對到 onPress。

(3) 同一個改動裡拿掉 ChunkyStyle 按鈕的手動變淡。請照程式碼搜尋刪，不要照行號：Draw.swift:375 `.opacity(n == 0 ? 0.4 : 1)`、TripPanel.swift:305 `.opacity(canSort ? 1 : 0.5)`、TripPanel.swift:312 `.opacity(base.isEmpty ? 0.5 : 1)`、MeTab.swift:367 `.opacity(busy || !ready ? 0.5 : 1)`。

(4) 要變淡的 PressStyle 改成明寫：GroupsTab.swift:169 改成 `.buttonStyle(PressStyle(dim: true))`，刪掉 :171 `.opacity(count == 0 ? 0.45 : 1)`，:170 的 disabled 先不動；GroupsTab.swift:258 改成 `.buttonStyle(PressStyle(haptic: true, dim: true))`；GroupsTab.swift:277 改成 `.buttonStyle(PressStyle(dim: true))`；Edit.swift:57 改成 `.buttonStyle(PressStyle(dim: true))`，:58 的 `.disabled(busy || empty)` 留著，刪掉 :59-60（PressBody 已經有 0.15 秒的淡入淡出；AddSheet 的 busy 從來沒被設成 true，效果跟現在一樣）。TripsList.swift:93 的行程卡、TripPanel.swift:476 裡 StopCard 的按鈕、ListTab.swift:403、GroupsTab.swift:479、Login.swift:136、MeTab.swift:180 維持不變淡。TripsList.swift:388-396 的垃圾桶（5d713ac，`.buttonStyle(.plain)`）和 d95fd43 在 TripsList.swift:54 的「復原」按鈕（預設樣式）都不用動。

(5) Edit.swift:52 改成 `Text(busy ? "找店家中…" : empty ? "先貼上連結或打店名" : "AI 找店家並收藏")`，empty 在 :48 已經有了。貼上提示 Edit.swift:30-33 要更醒目可以順手做。「貼上就送出」會跳過去過和星星的選擇，屬於流程改動，還是要先問 Anthony。

同一批 U65 的合併：U65 要把 Edit.swift:47-60 整段搬進 safeAreaInset。建議先做 U65 的重排，再在搬過去的那段套 (4)(5)。搬過去之後要長這樣，不要把 U65 範例裡的 `.opacity(empty && !busy ? 0.45 : 1)` 和 `.animation` 貼回來，不然空白時會淡兩次：
```swift
.safeAreaInset(edge: .bottom, spacing: 0) {
    let empty = input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    Button(action: go) {
        HStack(spacing: 8) {
            if busy { ProgressView().tint(.white) }
            Text(busy ? "找店家中…" : empty ? "先貼上連結或打店名" : "AI 找店家並收藏")
        }
        .font(.headline).frame(maxWidth: .infinity).frame(height: 54)
        .background(Color.grad, in: .rect(cornerRadius: 16)).foregroundStyle(.white)
    }
    .buttonStyle(PressStyle(dim: true))   // 變淡交給 PressBody，不要再加 .opacity、.animation
    .disabled(busy || empty)
    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
    .background(Color.bg)
}
```
.background(Color.bg) 在 PressStyle 外面，停用時只有按鈕變淡，底色條不會跟著淡。

之後幾批要照這裡的版本接：
第 3 批 U38、第 8 批 U97、U120 改群組卡片和群組頁的「開始滑卡」時，膠囊一律寫 `.buttonStyle(PressStyle(dim: true))`，不要再加 `.opacity(count == 0 ? 0.45 : 1)`。U38 依狀態換字、disabled 改成 `.disabled(count == 0 && b.isNew)`、讀出文字跟著字改；U97 只改 quick() 的 .new 分支，不要整個函式覆蓋；U97 還沒做之前 ProgressView 和 disabled 裡的 `|| starting` 先留著。U120 的 ZStack 裡卡片那顆用 `PressStyle(scale: 1, pressed: $down)`，膠囊那顆用上面 U38 改好的寫法，不要用 U120 片段裡的舊寫法。
第 6 批 U83 的「✨ 排順序」：fg 固定用 `Color.sprPurple.mix(with: .black, by: 0.2)`，不要依 canSort 換灰字，:305 的 opacity 這裡已經刪了；停用的樣子交給 ChunkyBody。模擬器上太淡就只調 ChunkyBody 停用時的 opacity（例如 0.6），不要在呼叫端再疊一層。
第 8 批 U100 的「從收藏加入」：寫成 `.buttonStyle(ChunkyStyle(radius: 16)).disabled(pick.isEmpty)`，不要自己換灰底和 edge。

要知道的行為變化：ChunkyStyle 自動變淡後，GroupsTab.swift:273 在 starting（轉圈）時也會變淡，MeTab.swift:295「用 Email 登入」在 Apple／Google 登入進行中（oauth != nil）也會變淡；GroupsTab.swift:169 改成 dim 後在 starting 時也會淡（原本只看 count == 0）。MeTab.swift:365-366 本來就是這樣，可以接受。

**模擬器驗收**：1. 打開新增視窗不輸入：主按鈕變淡、字是「先貼上連結或打店名」；打一個字後恢復成「AI 找店家並收藏」而且不淡，淡入淡出跟改前一樣順。2. 進一個沒有店的測試群組：「開始滑卡」變灰（飽和度也降）、「在地圖上看」「調整條件」變淡；群組分頁卡片上的「開始滑卡」在 0 張時變淡。3. 打開一個只有一站的測試行程：「✨ 排順序」只淡一次（跟改前差不多深淺，顏色偏灰）；空的那天「出發」也只淡一次。4. 抽一間設定面板在沒有符合的店時，「抽！」只淡一次。5. 在「我的行程」左滑一張行程卡、在行程面板左滑一張站卡：滑動時、滑一小段停在露出垃圾桶時，卡片都不會變淡；點卡片收回後照常可以點進去。6. 收藏頁新手清單做完的項目跟改前一樣，沒有多淡一層；群組開新一輪表單沒有符合的店時，灰底按鈕沒有再淡一層。7. 所有用 PressStyle 的按鈕按下去照樣縮一下，有 haptic 的照樣輕震，收藏卡片按下去照樣預載影片，🎲 長按放開不會誤抽。8. 店家頁（PlaceDetail.swift:163）那顆粉紅 ChunkyStyle 按鈕照常；U63 做過之後按下去會輕震。

**注意**：5d713ac、d95fd43 只改到 TripsList 的行號（行程卡按鈕 :92-93、.disabled(swiped) :382），沒有改這項要動的任何一行。5d713ac 的停在露出垃圾桶不會 disabled 卡片（swiped 在放開 0.35 秒後就回 false，收回靠 :384 的 overlay），PressStyle 預設不淡，這兩件事不衝突；垃圾桶和 d95fd43 的 sheet「復原」都不是 PressStyle。第 3 批 U63 也改 ChunkyStyle，haptic 參數已經併進 (1)，U63 只要改 PlaceDetail.swift:163。第 8 批 U120、U121 要的 PressStyle(scale:pressed:) 已經併進 (2)，U120 不要再整段換 PressStyle。第 3 批 U38、第 8 批 U97、U120 都改 GroupsTab 的「開始滑卡」（:158-174、:266-273），順序是 U36、U38 先做，再 U97，最後 U120，寫法見上面。同一批 U65 把 Edit.swift:47-60 搬進 safeAreaInset，先做 U65 再套這裡的 (4)(5)。第 6 批 U83（排順序淡紫底）和第 8 批 U100（從收藏加入）不要自己做停用色。第 10 批 U124 說「同一批的 U36」其實是第 4 批，而且 52a0b69 已經大改 DiceChip（Draw.swift:187-236），U124 要照片段找位置。第 5 批 U60 改訊息條、拿掉 d95fd43 在 TripsList.swift:47-66 加的 sheet 訊息條，沒動 .disabled(swiped)，PressStyle 預設不淡正好配合；同一批 U32 改 Edit.swift 的 EditSheet，不衝突。

### U37（P2・體驗）存檔失敗的錯誤訊息被 sheet 蓋住看不到

**畫面**：EditSheet（自己填、店家頁 → 編輯）按存檔失敗

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：失敗時用 say() 顯示，但訊息條在 Root 的 overlay，sheet 蓋在上面。從新增視窗進自己填時還隔了兩層。使用者只看到「存檔中…」變回「存檔」。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：還沒修。5d713ac、d95fd43 都沒碰 Edit.swift 和 Store.swift，行號跟 3fc00de 一樣。Edit.swift:198-216 的 save() 失敗時只把 busy 設回 false（:213），視窗不關也沒有任何提示；錯誤還是靠 Store.swift:560 的 say("沒存到：…") 和 :576 的 say("新增失敗：…")，Store.swift:544 找不到那間店時直接 return false，連訊息條都沒有。訊息條還是 Root 的 overlay（FoodMapApp.swift:110-183，5d713ac 在 pad 那段多兩行，比 3fc00de 往下移 2 行，底色在 :148），會被 sheet 蓋住。d95fd43 只替「我的行程」那張 sheet 在 TripsList.swift:47-66 另外放了一條訊息條，而且只顯示「已刪除「」開頭、有復原的訊息，EditSheet 沒有。從新增視窗進「自己填」（Edit.swift:89-94）一樣隔兩層 sheet。TripPanel.swift 多了一行 Perf mark（:847），所以呼叫 store.create／save 的地方從 :872、:1264 變成 :873、:1265。

**修法**：

(1) Store 不改回傳型別，多一個可選的錯誤回呼。行號是 d95fd43 的（Store.swift 從 ec71aa2 到 d95fd43 都沒變）：
- Store.swift:543 改成 `@discardableResult @MainActor func save(_ p: Place, err: ((String) -> Void)? = nil) async -> Bool {`
- Store.swift:544 改成 `guard let i = places.firstIndex(where: { $0.id == p.id }) else { err?("這間店已經不在收藏裡"); return false }`
- Store.swift:560 改成 `if let err { err(error.localizedDescription) } else { say("沒存到：" + error.localizedDescription) }`
- Store.swift:566 改成 `@MainActor func add(_ p: Place, err: ((String) -> Void)? = nil) async -> Bool { await create(p, err: err) != nil }`
- Store.swift:569 改成 `@MainActor func create(_ p: Place, err: ((String) -> Void)? = nil) async -> Place? {`，:576 的 catch 改成 `catch { if let err { err(error.localizedDescription) } else { say("新增失敗：" + error.localizedDescription) }; return nil }`
其他呼叫的地方都不用動：ListTab.swift:155、PlaceDetail.swift:145 和 :310、TripPanel.swift:873 和 :1265、Store.swift:509、:620、:701、:726。EditSheet 傳了 err 就不會另外發訊息條，關窗後也不會冒出一條過時的訊息。
add 維持回傳 Bool。合併注意裡有兩種寫法：第 4 批那份說做 U37 時就把 add 改成回傳 Place?，第 9 批那份讓 add 繼續回 Bool、U130 改由 EditSheet 直接呼叫 create。以第 9 批那份為準，這樣 Store.swift:620 copyToMine 的 `if await add(n)` 不用改，第 9 批 U92 只要在 add 裡加 say 就好。

(2) EditSheet：在 Edit.swift:117 `@State private var busy = false` 下面加 `@State private var err: String?`（同一批 U64 也在這附近加 @State，照這行找位置）。在 Edit.swift:121 的 `Form {` 和 :122 第一個 `Section {` 之間插入：
```swift
if let err {
    Section {
        Label { Text("沒存到：\(err)。資料還在，可以再按一次存檔") } icon: { Image(systemName: "exclamationmark.triangle.fill") }
            .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
            .padding(.horizontal, 16).padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.ink.opacity(0.92), in: .rect(cornerRadius: 18))
            .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
    }
    .transition(.move(edge: .top).combined(with: .opacity))
}
```
底色跟訊息條（FoodMapApp.swift:148）同款；原因可能兩行，用圓角 18 比膠囊好看。

(3) Edit.swift:198-216 的 save()：在 :199 `busy = true` 下面加 `withAnimation(.snappy) { err = nil }`。Task 裡 :211-214（從 `let ok: Bool` 到 `if ok { Haptic.success(); dismiss(); done() }`）換成：
```swift
            var why: String?
            let ok: Bool
            if isNew { ok = await store.add(p, err: { why = $0 }) } else { ok = await store.save(p, err: { why = $0 }) }
            busy = false
            if ok { Haptic.success(); dismiss(); done() }
            else {
                let msg = why ?? "請再試一次"
                Haptic.warning()
                withAnimation(.snappy) { err = msg }
                AccessibilityNotification.Announcement("沒存到：\(msg)").post()
            }
```
Haptic.warning() 已經有（Theme.swift:220）。存檔鈕（Edit.swift:180）在 busy 變回 false 後本來就可以再按，不用改。同一批 U32 會在 :201 後面加一行 source_url 的處理，先做 U32 的話這段往下一行，照程式碼找。

(4) 改任何欄位就清掉錯誤：在 Edit.swift:184 的 `.onAppear {` 前面加
```swift
        .onChange(of: place) { if err != nil { withAnimation(.snappy) { err = nil } } }
        .onChange(of: dishes) { if err != nil { withAnimation(.snappy) { err = nil } } }
        .onChange(of: tags) { if err != nil { withAnimation(.snappy) { err = nil } } }
```
Place 是 Hashable，可以直接給 onChange。save() 沒有改 `place` 這個 @State（它複製成 p），所以存檔本身不會把錯誤清掉。同一批 U64 也在 :184-187 這串加 interactiveDismissDisabled 和 confirmationDialog，都是加行，不會互相刪到。

順序：第 4 批照 U32、U64、U37 做，都是加行。EditSheet 不要加 .toastHost，也不要學 d95fd43 在 TripsList.swift:47-66 那樣自己疊一條訊息條，U37 不用等第 5 批 U60。之後第 9 批先做 U92 再做 U130，照 batch9 的合併版寫：Store.add 加 `say("已收藏 \(back.name)", icon: .check, place: back)` 並保留這裡的 err 參數；U130 把 Task 改成 `let saved: Place?`，新增走 `store.create(p, err: { why = $0 })`，修改走 `store.save(p, err: { why = $0 }) ? p : nil`（不要把 await 寫在三元運算子右邊，會編不過），`guard let saved else { … }` 裡面就是上面 else 那四行，不要改回只有 return；新增成功時 EditSheet 自己說「已收藏」。

**模擬器驗收**：1. 模擬器開飛航模式（或在 Mac 上關網路），打開一間測試店的編輯，改筆記後按存檔：視窗不關，第一段上面滑出深色錯誤列寫「沒存到：…資料還在，可以再按一次存檔」，有警告震動；關掉視窗後底下不會再冒出訊息條。2. 錯誤列出現時改任何一個欄位（店名、星等、必點、標籤都試），錯誤列收起。3. 恢復網路再按存檔，正常關窗、有成功震動。4. 斷網時從右上＋ 進「自己填」（兩層 sheet）填店名按存檔，一樣在自己填的視窗裡看到錯誤列，新增視窗不會跟著關。5. 開 VoiceOver 重做第 1 步，要唸出「沒存到」。6. 回歸：地圖收藏卡改星等、店家頁改想去／去過、朋友的店按「我也想去」這些沒傳 err 的地方，斷網失敗時仍然出現原本的訊息條；刪除一間店後的「復原」訊息條照 e7af2e1、3fc00de 的樣子停 6 秒、撐滿寬度。

**注意**：同一批 U32（Edit.swift :201 後加一行、:169-173 加來源連結欄）和 U64（:117 加 @State、:184-187 加 modifier）都改 EditSheet，都是加行，照 U32、U64、U37 的順序做，照程式碼找位置。第 9 批 U92、U130 改同一條存檔路徑（Store.add、create 和 save() 的 Task），照 batch9 的合併版做，保留這裡的 err 參數和失敗處理；第 4 批合併注意裡「add 改回傳 Place?」那個寫法不採用。第 5 批 U60、U64 的注意說 U37 要套 .toastHost、要先做 U60，那是錯的，U37 用表單裡的錯誤列，不用 toastHost，也不用等 U60。d95fd43 在 TripsList.swift:47-66 替「我的行程」sheet 自己疊了一條只認「已刪除「」開頭的訊息條，等於 U60 的一部分先做了；U60 之後如果改成共用的 toastHost，跟這項也不衝突，EditSheet 一樣不掛。5d713ac 只改訊息條的 pad（FoodMapApp.swift:119-122），讓 Root 訊息條的行號往下移 2 行，不影響這項。

### U51（P2・體驗）第一次登入後，定位權限、alert、教學圈圈同時疊出來

**畫面**：全新安裝 → Apple 登入 → 進地圖

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：loggedIn 一變 true：定位權限框馬上跳；sync 完教學變暗圈出＋，同一時間 afterOAuth 又跳「以前用 Email 註冊過嗎？」，隱藏信箱的人還會再跳「你的名字」。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Store.swift:332-347 的 afterOAuth 還是先在 :333 設 loggedIn = true、:334 await sync()，最後才在 :346 設 askOld 或 askName。Root 的 .task（FoodMapApp.swift:53-63）在 loggedIn 變 true 時就開跑，sync 完直接呼叫 maybeStartCoach（:57）；Coach.swift:29-31 只看 coach.isEmpty 和 coachDone，沒管 askOld、askName。兩個 alert 在 FoodMapApp.swift:86-102，定位權限照舊在 MapTab.swift:381 的 onAppear 要。這段 commit 只在 :55 加了 LaterDelete.flush、:58 加了 askNotifyAfterShare，順序問題沒動。另外 ClipWatch.check（FoodMapApp.swift:59，guard 在 Onboard.swift:80-81）只擋 coach，不擋 alert。

**修法**：

(1) Store.swift:90 下面加 `var authSettling = false`，要讓它被觀察，不要加 @ObservationIgnored。afterOAuth（Store.swift:332）第一行，也就是 :333 的 loggedIn = true 之前，加 `authSettling = true; defer { authSettling = false }`。
(2) Coach.swift:29-31 改成：
```swift
@MainActor func maybeStartCoach() {
    guard askOld == nil, !askName, !authSettling else { return }
    if coach.isEmpty && !UserDefaults.standard.bool(forKey: "coachDone") { startCoach() }
}
```
(3) FoodMapApp.swift:63 的 .task 結束後面加：
```swift
// 登入後的兩個問題答完，才開教學、看剪貼簿（不跟 alert 疊在一起）
.onChange(of: store.askOld == nil && !store.askName && !store.authSettling) { _, free in
    guard free else { return }
    store.maybeStartCoach()
    ClipWatch.shared.check(store)
}
```
(4) 這是 ec71aa2 才需要補的：ClipWatch.check 的 guard（Onboard.swift:80）加上 `!store.authSettling, store.askOld == nil, !store.askName`。教學延後以後 coach 是空的，剛裝好、手上剛好複製了 IG 連結的人，剪貼簿膠囊會跟「以前用 Email 註冊過嗎？」同時出來；(3) 的 onChange 會在問題答完後補看一次剪貼簿。
(5) 定位可以先照舊在 MapTab.swift:381 要；如果改成延到教學後，授權後要照 U18 重新置中。
keepNew（Store.swift:350-355）清掉 askOld 和設 askName = true 是在同一輪做的，條件不會中途短暫變成 true，不用另外處理。

**模擬器驗收**：先 xcrun simctl uninstall 把 App 刪掉再裝回來，在 Safari 複製一個 IG 網址，再用沒有資料的 Apple 測試帳號登入並錄影。確認定位權限框可以先出現，「以前用 Email 註冊過嗎？」答完以後（隱藏信箱的帳號連「你的名字」也答完以後），教學的暗底和圈圈才出現；這段時間剪貼簿膠囊不能冒出來。再用有資料的舊帳號重裝登入一次，確認沒有 alert，教學照常在同步完就出現。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批的 U53 也改 Coach.swift，不過 U51 只動 maybeStartCoach（:29-31），U53 動的是 startCoach 的 :46、CoachOverlay、Spotlight、Dim，可以一起套。(4) 改的是 A4 剪貼簿那段程式（d2aec97），只多加條件，不影響「連按三次 ✕ 兩週不問」的邏輯。

### U52（P2・體驗）通知小卡點旁邊就被當成永久拒絕，之後在 App 裡再也打不開通知

**畫面**：「存好時通知你？」小卡；我的 > 設定

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：點暗底呼叫 answerNotify(false)，寫入 notifyAsked=true，而且根本沒呼叫 requestAuthorization，所以 iOS 設定裡也找不到 Bitemap 的通知。按「先不要」的人也一樣沒地方改。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：FoodMapApp.swift:76 點暗底還是呼叫 answerNotify(false)；Onboard.swift:27-31 的 answerNotify 不管怎樣都寫 notifyAsked = true，傳 false 時也不叫 requestAuthorization。MeTab.swift 在這段 commit 完全沒改，:45-62 的「設定」只有「導航用」一列。ec71aa2 新加了 askNotifyAfterShare（Onboard.swift:22-25），開 App（FoodMapApp.swift:58）和每次回前景（:192）都會叫，它走 maybeAskNotify（Onboard.swift:11-19）的 notifyAsked guard，所以按過「先不要」的人不會被再問，原修法第 (4) 點現在已經成立。

**修法**：

(1) 「先不要」（Onboard.swift:44）維持 answerNotify(false)，之後永久不再自動跳（A5）。
(2) 點暗底改成只收起、3 天內不問。Onboard.swift:27 的 answerNotify 前面加：
```swift
// 點旁邊：只是現在不想看，3 天內不再跳（不算「先不要」，不寫 notifyAsked）
@MainActor func snoozeNotify() {
    UserDefaults.standard.set(Date().timeIntervalSince1970 + 3 * 86400, forKey: "notifyLater")
    withAnimation(.snappy) { askNotify = false }
}
```
FoodMapApp.swift:76 改成 `.onTapGesture { store.snoozeNotify() }`。延後的判斷一定要放進 maybeAskNotify 本身，Onboard.swift:12 改成：
`guard !UserDefaults.standard.bool(forKey: "notifyAsked"), !askNotify, Date().timeIntervalSince1970 >= UserDefaults.standard.double(forKey: "notifyLater") else { return }`
原修法只說「免得每次 startAdd 都跳」，在 ec71aa2 上不夠：askNotifyAfterShare 每次回前景都會叫，用過分享選單的人點暗底後一切回 App 就會再跳。
(3) 核心：在 MeTab.swift:61 的 Menu 結束之後、:62 的 } 之前加 `Divider().padding(.leading, 58)` 和 `NotifyRow()`。MeTab.swift 開頭加 `import UserNotifications`，NotifyRow 放在檔尾，自己讀權限，MeTab 本身不用跟著重算：
```swift
private struct NotifyRow: View {
    @State private var status: UNAuthorizationStatus?
    @Environment(\.scenePhase) private var phase
    @Environment(\.openURL) private var openURL
    var body: some View {
        Button(action: tap) {
            HStack(spacing: 12) {
                Image(systemName: "bell.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 34, height: 34).background(Color.sprPink, in: .rect(cornerRadius: 10))
                Text("找好時通知我").font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                Spacer()
                Text(label).font(.subheadline.weight(.semibold)).foregroundStyle(on ? Color.ink.opacity(0.5) : Color.accent)
            }
            .padding(.horizontal, 12).padding(.vertical, 11).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .disabled(on)
        .task { await load() }
        .onChange(of: phase) { _, p in if p == .active { Task { await load() } } }
    }
    private var on: Bool { status == .authorized || status == .provisional || status == .ephemeral }
    private var label: String { on ? "已打開 ✓" : status == .denied ? "到設定打開" : "打開" }
    private func load() async { status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus }
    private func tap() {
        if status == .denied {
            if let u = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(u) }
            return
        }
        UserDefaults.standard.set(true, forKey: "notifyAsked")
        Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]); await load() }
    }
}
```
(4) 不用再改：askNotifyAfterShare 已經會被 notifyAsked 擋下來，按過「先不要」的人不會因為分享又被問。

**模擬器驗收**：1. 刪掉 App 重裝（通知權限會跟著重設），看完 IG 教學按「我學會了」讓小卡出來，點暗底收起。切到背景再回來，小卡不能再跳。要測 3 天到期，可以用 xcrun simctl spawn booted defaults write <bundle id> notifyLater -float 0 改掉再回前景，小卡會再出現。
2. 到我的 > 設定，「找好時通知我」顯示「打開」，按下去跳系統權限框；允許後那列變成「已打開 ✓」。
3. 再重裝一次，從那列叫出系統框後按「不允許」，那列變成「到設定打開」，按了會開到 iOS 設定裡 Bitemap 的通知頁；在那裡打開後切回 App，那列自己變成「已打開 ✓」。
4. 重裝後在小卡按「先不要」，再用分享選單存一間、回到 App，小卡不能再跳；設定那列仍然顯示「打開」，可以要權限。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。U51 也改 FoodMapApp.swift 的 Root，但 U51 是在 :63 後面加 onChange，U52 改的是 :76，不同行。

### U53（P2・滑順）教學每換一步，對話框先滑到畫面正中間停一下，再滑到目標旁

**畫面**：第一次打開的教學圈圈（Coach）、IG 收藏教學

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：換步時 ready 判斷讓 rect 變 nil：洞瞬間消失、整片變暗，對話框滑到正中央，等 350～650ms 才滑到目標。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Coach.swift 在 a1b57b1 到 ec71aa2 之間完全沒改。Coach.swift:99 還是 `ready == step ? store.coachFrames[step] : nil`，:103-107 每換一步都先 ready = nil，再等 350 或 650ms；hole 是 nil 時對話框置中（:191）；Dim（:228-236）不是 Animatable；IGTutorial 的 Spotlight 還掛著 .id(step)（:275）。另外 startCoach 在 :46 把 coachFrames 整個清空，而加號（MapTab.swift:250）和分頁列（FoodMapApp.swift:330）的錨點只有位置變了才會重新量，剛裝好、本來就在地圖頁開教學時，「＋」那一步可能一直拿不到 frame。

**修法**：

(1) Coach.swift:46 的 `coachFrames = [:]` 改成只清會變的兩個：`coachFrames[.pin] = nil; coachFrames[.been] = nil`。加號和分頁列一直掛著，清掉以後不一定會再量到，下面「已經有值就直接用」就派不上用場。
(2) 更正原修法：它把 been 到 groups 同時列在「不換頁」和「會換頁」兩邊。.been 那步在店家頁，分頁列是藏著的（Store.swift:72 的 barHidden），退回地圖時分頁列會從下面滑回來，所以 been 到 groups 屬於會換頁。不換頁的只有 pin 到 add 和第一步。
(3) CoachOverlay 的 body（Coach.swift:97-109）改成：
```swift
if let step = store.coachStep, !store.showIG {
    let t = step.text
    // 同一頁、目標已經量好：直接用，跟 advanceCoach 同一個 withAnimation，洞和對話框從舊目標滑過去
    let moves = step == .been || step == .groups
    let direct = !moves && store.coachFrames[step] != nil
    let rect = (direct || ready == step) ? store.coachFrames[step] : nil
    Spotlight(rect: rect, waiting: rect == nil && ready != step, title: t.title, message: t.body,
              counter: "\(store.coachIndex + 1) / \(store.coach.count)", button: t.button, hint: t.hint,
              onTarget: { tapTarget(step) }, onButton: { tapButton(step) }, onSkip: { store.endCoach() })
    .task(id: step) {
        if direct { ready = step; return }
        ready = nil
        // 換頁：新位置連續兩次一樣才圈（每 50ms 看一次），最多等 800ms；量不到就照舊置中
        var last: CGRect?
        for _ in 0..<16 {
            try? await Task.sleep(for: .milliseconds(50))
            if Task.isCancelled { return }
            let r = store.coachFrames[step]
            if let r, r == last { break }
            last = r
        }
        withAnimation(.snappy) { ready = step }
    }
    .transition(.opacity)
}
```
(4) Spotlight（Coach.swift:126）加 `var waiting = false`，參數順序放在 rect 後面。bubble（:183-195）的 VStack 在 :194 的 .offset 後面加 `.opacity(waiting ? 0 : 1).scaleEffect(waiting ? 0.96 : 1).animation(.snappy(duration: 0.2), value: waiting)`。等待時只剩暗底，對話框不會先跑到中間。
(5) Dim 做成可以動畫。注意 hole 是 Optional，如果把 nil 當 .zero 去插值，洞會從左上角飛出來，所以改成不用 Optional。Spotlight 在 :141 改傳 `Dim(hole: hole ?? CGRect(x: g.size.width / 2, y: g.size.height / 2, width: 0, height: 0), radius: r)`，Dim（:228-236）改成：
```swift
struct Dim: Shape {
    var hole: CGRect
    var radius: CGFloat
    var animatableData: AnimatablePair<CGRect.AnimatableData, CGFloat> {
        get { AnimatablePair(hole.animatableData, radius) }
        set { hole.animatableData = newValue.first; radius = newValue.second }
    }
    func path(in r: CGRect) -> Path {
        var p = Path(r)
        if hole.width > 0 && hole.height > 0 { p.addRoundedRect(in: hole, cornerSize: CGSize(width: radius, height: radius), style: .continuous) }
        return p
    }
}
```
(6) IGTutorial：刪掉 Coach.swift:275 的 `.id(step)`，:272 改成 `Spotlight(rect: ready == step ? frames[step] : nil, waiting: ready != step, ...)`。IG 教學每一步都有面板滑上來，算換頁，沿用 :279-282 的等待就好。

**模擬器驗收**：用我的 > 「App 怎麼用」把教學從頭跑一次並錄影，包含第一步點圖釘、＋那步、IG 教學三步、去過、群組。確認 pin 到 add 時，洞和對話框直接從圖釘滑到＋，中間沒有整片變暗，對話框也沒有跑到畫面中央；進店家頁和退回群組那兩步，對話框先藏起來，等店家頁或分頁列停好才淡入，等待不超過 0.8 秒；IG 教學三步之間對話框不再整個重建閃一下。另外把 App 刪掉重裝、用空帳號登入（步驟只有＋和群組），確認第一步的＋有被圈到，不是置中沒有洞。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批的 U51 也改 Coach.swift，不過只動 maybeStartCoach（:29-31），跟這裡不同段落，可以一起套。

### U54（P2・滑順）換分頁時整張 MapTab 重算（build 22 新增的退步）

**畫面**：點下方分頁列切換任何分頁

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：為了藍點加了 .task(id: store.tab == 0 || trip.going)，id 在 body 裡算，MapTab 因此觀察 store.tab。在收藏、群組、我的之間切換，地圖不在畫面上也整個重跑。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MapTab.swift:393-397 還是 `.task(id: store.tab == 0 || trip.going)`，id 在 body 裡算，MapTab 因此追蹤 store.tab。MapTab body 其他地方都沒讀 store.tab，只有這裡，所以把它拿掉就能斷乾淨。MapTab.swift:60 已經有 Perf.shared.count("地圖") 可以量重算次數。

**修法**：

原修法說 DotTracker「直接讀單例」，但 Store 不是單例（它是 FoodMapApp.swift:7 的 @State；Store.shared 其實是 App Group 的 UserDefaults），要改用 @Environment。在 MapTab.swift 的 MyDot 後面（:1991 之後）加：
```swift
// 藍點只在看地圖（或出發中）時追蹤。自己一個小 view 讀分頁，換分頁時 MapTab 不用跟著重算
private struct DotTracker: View {
    @Environment(Store.self) private var store
    @State private var trip = TripMode.shared
    var body: some View {
        let on = store.tab == 0 || trip.going
        Color.clear.task(id: on) {
            guard on else { return }
            await MyDot.shared.track()
        }
    }
}
```
然後刪掉 MapTab.swift:393-397（註解和那個 .task），在 :392 的 .task 結束後加一行 `.background { DotTracker() }`。

**模擬器驗收**：用 -perfOverlay 啟動，先停在地圖，記下 PerfHUD 上「地圖」的重算次數；在收藏、群組、我的之間來回切 10 次，「地圖」的次數要完全不變（改前每切一次就加一次）；再從其他頁切回地圖 5 次，也不該因為換分頁而增加。藍點要照常：在地圖頁用 xcrun simctl location booted set 換個位置，藍點會移；切到收藏再換位置、切回地圖，藍點要跟上。最後比較改前改後和 build 20 的「換分頁」毫秒（規格測試 15）。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批的 U55 也改 MapTab body，但 U54 只刪 :393-397、加一行 .background，不會撞到。

### U59（P2・滑順）C4 篩選共用後，一頁打字或點分類，藏在背景的另一頁跟著整頁重算

**畫面**：收藏頁搜尋框打字（地圖在背景）；地圖打字、點分類、切想去／去過（收藏頁在背景）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：listF 直接讀寫 mapF，四個分頁一直掛著。收藏頁每打一個字，背景的 MapTab 就重算篩選、Nearby 排序、所有 Annotation；反過來，地圖打字時收藏頁的網格也重算。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：最近 8 個 commit 沒有改這件事。Store.swift:104-107 的 listF 還是直接 get/set mapF，兩頁共用同一份（Filter 在 Store.swift:946）。FoodMapApp.swift:218-226 的 page() 讓開過的分頁一直掛著，只用 opacity 藏起來。MapTab.swift:65 在 body 裡算 store.shown(store.mapF, in: store.mapBase)，ListTab.swift:19 也在 body 裡算 store.shown(store.listF)，所以不管在哪一頁打字或點分類，兩頁的 body 都會跟著重算，背景的地圖還會重排 Annotation 和附近清單（MapTab.swift:342 的 NearbyHost 拿到新的 list 就重算）。MapTab 其他讀 store.mapF 的地方：:59 points、:570 reveal、:712 currentList（recluster 在 :795 起用它）；搜尋框 :318、chips :323 是綁定。量次數的地方是 MapTab.swift:62「地圖」、ListTab.swift:16「收藏」。52a0b69 在 MapTab 加了很多量測碼，讓行號大幅位移，但沒有碰篩選。第 4 批 U54 還沒做：MapTab.swift:464-467 的 `.task(id: store.tab == 0 || trip.going)` 還在 body 裡讀 store.tab。

**修法**：

原本第 (2) 點寫的 `private var filter: Filter { store.tab == 0 ? store.mapF : applied }` 不採用：同一批 U54 的重點是讓 MapTab body 不再讀 store.tab，這個計算屬性會讓 body 透過 :65 又讀到 store.tab，換分頁時整張地圖重算，U54 等於白做。.task(id: store.mapF) 也不能直接放在 MapTab body 裡，id 是在 body 裡算的，一讀就被 Observation 記成依賴。所以改成 MapTab body 只讀自己的 applied，store.tab 和 store.mapF 只在一個小 view 裡讀，做法跟 ListTab.swift:429-434 的 DepthReport 一樣。這個寫法不管 U54 先做還是後做都成立。

(1) 新增一個小 view，放在 ListTab.swift:434 DepthReport 後面（或 Store.swift:946 Filter 旁邊）：
```swift
// 共用篩選的同步：只有這一小塊讀 store.mapF 和 store.tab。
// 分頁在背景時停字 350ms 才同步一次、不帶動畫；live 的那頁（地圖）在前景時也由這裡即時同步，body 就不用讀 store.mapF
struct FilterSync: View {
    let tab: Int
    var live = false
    @Binding var applied: Filter
    @Environment(Store.self) private var store
    var body: some View {
        Color.clear
            .onAppear { applied = store.mapF }
            .onChange(of: store.mapF) { old, f in
                guard live, store.tab == tab else { return }
                // 點分類、想去去過（chips 本來就包 withAnimation(.snappy)）照舊有動畫；打字不帶動畫
                if old.q == f.q { withAnimation(.snappy) { applied = f } } else { applied = f }
            }
            .onChange(of: store.tab) { old, new in
                // 離開這頁：停在離開當下的篩選；切回 live 的那頁：馬上對齊
                guard old == tab || (live && new == tab), applied != store.mapF else { return }
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { applied = store.mapF }
            }
            .task(id: store.mapF) {
                guard store.tab != tab, applied != store.mapF else { return }
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled, store.tab != tab else { return }
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { applied = store.mapF }
            }
    }
}
```

(2) MapTab：在 @State 區（例如 MapTab.swift:21 selfMoved 下面）加 `@State private var applied = Filter()   // 地圖畫的篩選，由 FilterSync 同步`。下面四處的 store.mapF 換成 applied：:59 points、:65 all、:570 reveal、:712 currentList。:712 一定要一起換，recluster（:795 起）用的是 currentList，跟 Map 畫的 list 不一致的話泡泡會算錯；:59 給 fit() 用，也一起換。搜尋框 :318 的 `$store.mapF.q` 和 chips :323 的 `$store.mapF` 照舊綁共用篩選。在 :456 `.onChange(of: list.count) { fit() }` 前面加 `.background { FilterSync(tab: 0, live: true, applied: $applied) }`。不要加 filter 那個計算屬性。

(3) ListTab：加 `@State private var applied = Filter()`，:19 改成 `let visible = store.shown(store.tab == 1 ? store.listF : applied)`，在 :115 DepthReport 那行下面加 `.background { FilterSync(tab: 1, applied: $applied) }`（live 用預設 false）。:54、:55 的 $store.listF 和 :72 清除篩選不用動。:122 的 drawCtx 只在按抽一間時才算，不在 body 裡，可以留著讀 store.listF。ListTab body 改完會讀 store.tab，每次換分頁會多重算一次收藏頁，這是切過去要的，可以接受。

(4) 切到收藏頁的第一幀：收藏頁在前景時直接讀 store.listF，第一幀一定是新結果。要注意的是 MeTab.swift:204-207 的 go()，它先設 listF 再馬上切分頁，ListTab.swift:66 的 `.animation(value: cards.map(\.id))` 會播一次換位動畫（改前也會播，不算退步）。如果要連這條也不播，在 :66 那行後面加 `.transaction(value: store.tab) { $0.animation = nil; $0.disablesAnimations = true }`，模擬器上確認有效再留。

之後別批要配合的地方：第 2 批 U09 拆 :65 時寫成 `let base = store.mapBase` 加 `let all = store.shown(applied, in: base)`；U09 給 NearbyHost（:342）加 filter 參數時一律傳 `applied`，不要傳 store.mapF，不然背景地圖又會跟著每個字重算。第 7 批 U75 加 missing 時照 batch4 合併注意的欄位順序（seen、list、total、base、inGroup、filter、missing、headY、mapRect）。

**模擬器驗收**：開 PerfHUD（「我的」版本號連點 5 下），看「地圖」（MapTab.swift:62）和「收藏」（ListTab.swift:16）的重算次數。1. 在收藏頁搜尋框連打 5 個字：「收藏」每個字加一，「地圖」在停字 350ms 後只加一次，不是加 5 次。2. 反過來在地圖打 5 個字、點兩個分類：「收藏」只在停手後加一次。3. 地圖點「咖啡」後馬上切到收藏頁：第一幀就只有咖啡，數字「N 間」也是咖啡的數量。4. 在收藏頁點「甜點」後馬上切回地圖：地圖第一眼就是甜點的圖釘和泡泡，泡泡數字跟圖釘一致。5. 從「我的」點某個分類的數字跳到收藏頁（MeTab 的 go()）：卡片是對的；看網格有沒有播換位動畫，決定要不要加第 (4) 點的 transaction。6. 在地圖打字時地圖本身即時篩（沒有 350ms 延遲），點分類 chip 時圖釘照舊有動畫，泡泡和圖釘一致。7. U54 做過的話，在收藏、群組、我的之間切換再切回地圖，「地圖」都不加；U54 還沒做時這條先不看。8. 登出再登入、教學（Coach）清掉篩選後，兩頁都回到沒篩選。

**注意**：同一批 U54 要讓 MapTab body 不讀 store.tab，所以這裡改成 live 版 FilterSync，不用 filter 計算屬性；U54 先做後做都可以，建議先做 U54。第 2 批 U09 也改 :65 和 NearbyHost（:342），filter 參數要傳 applied。第 7 批 U75 在 NearbyHost 加 missing，欄位順序照 batch4 合併注意。U59 注意裡寫的「同一批 U61」其實是第 5 批，U61 改 onMapCameraChange（:184-194），不重疊。fix-addcard 已經在 acd4471；52a0b69 在 MapTab 加的量測碼（:196-237、:796 等）跟這裡改的行不重疊，只是行號位移，照程式碼找。

### U64（P2・體驗）自己填／編輯表單往下一滑就關，填好的欄位全丟，也沒確認

**畫面**：新增 → 自己填；店家頁 ⋯ → 編輯；「N 間還沒有地址」→ 點一間

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：EditSheet 有十幾個欄位，是一般 .sheet，沒有 interactiveDismissDisabled，也沒有「要放棄修改嗎？」。單手捲表單時很容易一拉整張關掉。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Edit.swift:109-217 的 EditSheet 還是一般 sheet，NavigationStack（:120-183）沒有 interactiveDismissDisabled，取消（:178）直接 dismiss()，沒有放棄確認。dishes、tags（:115-116）一樣是 onAppear（:184-187）才填。叫它的地方有 Edit.swift:89-95、ListTab.swift:89-95、MapTab.swift:1843、PlaceDetail.swift:60。a1b57b1 之後 Edit.swift 只改了 AddSheet 的空白按鈕（:47-60），EditSheet 沒動。

**修法**：

都在 EditSheet 裡改，四個呼叫的地方不用動。
(1) :117 下面加：
```swift
@State private var base: (Place, String, String)?
@State private var quitting = false
// 打開時的樣子：dishes、tags 是 onAppear 才填的，要跟填好的字串比，不能拿 split 後的陣列比
private var dirty: Bool {
    guard let base else { return false }
    return place != base.0 || dishes != base.1 || tags != base.2
}
```
Place 是 Hashable（Models.swift:4），可以直接比。
(2) :184-187 的 onAppear 最後加 `if base == nil { base = (place, dishes, tags) }`。加 if 是因為 onAppear 可能跑兩次，第二次不能把改過的內容當成新的起點。
(3) :187 onAppear 後面加 `.interactiveDismissDisabled(dirty || busy)`。
(4) :178 改成 `ToolbarItem(placement: .cancellationAction) { Button("取消") { if dirty { quitting = true } else { dismiss() } } }`，並在 :175 的 Form 後面加：
```swift
.confirmationDialog("放棄這次的修改？", isPresented: $quitting, titleVisibility: .visible) {
    Button("放棄", role: .destructive) { dismiss() }
    Button("繼續編輯", role: .cancel) {}
}
```
已知的小地方：:190-192 的 str() 把清空的欄位寫成 ""，不是 nil，所以打了字又全刪掉，dirty 還是 true，會多問一次。不要為了這個改 str() 的 setter（存檔時 "" 和 nil 送出去意思可能不同），真的在意就在 dirty 裡比較前把那幾個字串欄位的 "" 當成 nil。
(5) AddSheet 只有一個輸入框，可以不做。要做就跟 U65 一起改，只在手打的內容不空時擋：`.interactiveDismissDisabled(!input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)`。

**模擬器驗收**：打開一間測試店的店家頁，⋯ 選編輯。1. 不改任何東西，往下拉：sheet 正常關掉，按取消也直接關，不跳確認。2. 改店名後往下拉：拉不掉。3. 按取消：跳「放棄這次的修改？」，選「繼續編輯」回到表單，內容還在；再按取消選「放棄」，關掉後店家頁還是原本的店名，沒有存檔。4. 只改必點欄位也要算改過。5. 按存檔時（busy）往下拉也拉不掉。6. 從新增點「自己填」，帶進來的店名不算改過，直接拉得掉。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批裡 U65 也改 Edit.swift，但它改的是 AddSheet（:16-97），U64 改 EditSheet（:109-217），不重疊；第 (5) 點 AddSheet 的擋拉要跟 U65 一起做。U60 的 .toastHost 之後如果套到 EditSheet（U37），加在 :187 這串 modifier 上就好，跟這裡不衝突。

### U65（P2・體驗）新增視窗選了「去過」後，「AI 找店家並收藏」被鍵盤蓋住又收不掉鍵盤

**畫面**：＋ → 新增店家：打店名、切到「去過」（SE／mini 最明顯）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：AddSheet 是沒有 ScrollView 的 VStack＋Spacer。輸入框是 axis: .vertical，按 Return 只會換行；切到去過還會多一列星星。SE 上用注音鍵盤時看不到送出鈕。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Edit.swift:17-70 的 AddSheet 還是 NavigationStack 裡一個 VStack 加 :67 的 Spacer，沒有 ScrollView，也沒有 scrollDismissesKeyboard。:20 的 TextField 還是 axis: .vertical、lineLimit(3...6)，按 Return 只換行。:38-46 切到去過會多一列星星，主按鈕在 :49-60。a1b57b1 之後只多了 :47-60 的空白時變淡，版面沒變。另外 result（:9）在整個檔案裡沒有被設過值，go()（:100-105）按下就 dismiss，:61-66 那塊和 :88 的「完成」其實不會出現。

**修法**：

(1) 把 :18-69 改成 ScrollView 包內容，主按鈕用 safeAreaInset 釘在下面（鍵盤出來時 safe area 會往上推，按鈕就在鍵盤上方）：
```swift
NavigationStack {
    ScrollView {
        VStack(alignment: .leading, spacing: 14) {
            // 原本 :19 說明文字、:20-22 輸入框、:23-36 貼上列、:38 StatusSwitch、:39-46 星星照搬
            // :61-66 的 result 也搬進來（目前不會出現，順手清掉也可以）
        }
        .padding(16)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(Color.bg)
    .safeAreaInset(edge: .bottom, spacing: 0) {
        // 原本 :47-60 整段搬過來（empty、Button、disabled、opacity、animation 都不變）
        let empty = input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        Button(action: go) { … 不變 … }
            .buttonStyle(PressStyle())
            .disabled(busy || empty)
            .opacity(empty && !busy ? 0.45 : 1)
            .animation(.easeOut(duration: 0.15), value: empty)
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
            .background(Color.bg)
    }
    // :73-95 的 .task、navigationTitle、toolbar、自己填的 sheet 都不動
}
```
:67 的 Spacer 拿掉。
(2) 不要用 ToolbarItemGroup(placement: .keyboard)，在這個 sheet 裡不可靠；也不要用 .onSubmit(go)，vertical 的 TextField 按 Return 不會觸發，而且會誤送。
(3) Return 只負責收鍵盤。原本寫「偵測到換行就刪掉」，這樣會把貼上的多行文字（例如分享來的「店名＋換行＋網址」）也一起吃掉換行。改成只在「剛好多打了一個換行」時才當成 Return：
```swift
.onChange(of: input) { old, new in
    // 手打 Return：只多了一個字而且是換行，就還原並收鍵盤；貼上的多行文字不動
    if new.count == old.count + 1, new.filter({ $0 == "\n" }).count == old.filter({ $0 == "\n" }).count + 1 {
        input = old; focus = false
    }
}
```
加在 :21 的 `.focused($focus)` 後面，也可以順手加 `.submitLabel(.done)` 讓鍵盤上的鍵顯示「完成」。

**模擬器驗收**：iPhone SE（第 3 代）模擬器，鍵盤切成注音。1. 打開新增視窗（＋），打一個店名，切到「去過」：「AI 找店家並收藏」整顆在鍵盤上方看得到，星星列也在，可以往上捲看到說明文字。2. 按 Return：沒有換行，鍵盤收起來，字還在。3. 在內容上往下拖：鍵盤跟著手指收。4. 用「貼上」貼一段有換行的文字：換行保留。5. 空白時按鈕還是變淡、按不下。不要按送出。6. 在 iPhone 16 Pro 上看一次版面沒有多出空白。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批的 U64 也改 Edit.swift，但 U64 改的是 EditSheet；U64 第 (5) 點如果要在 AddSheet 加 interactiveDismissDisabled，要加在這次重排後的 NavigationStack 上，兩項最好一起做。

### U66（P2・體驗）沒網路或同步失敗時完全沒提示，收藏頁下拉失敗看起來也像成功

**畫面**：任何分頁離線時；收藏頁下拉更新

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：syncNow 失敗只寫 self.error，四個分頁都不看它。收藏頁的下拉不管成敗都直接收起，行程讀取失敗只有 print。使用者以為朋友新加的店沒同步。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：ec71aa2 之後到 d95fd43 的 commit 都沒有做這一項。Store.swift 在這段只改了 :595 以後的刪收藏（e7af2e1），同步這段行號沒變：Store.swift:135 還是 `Task<Void, Never>?`，:186-192 的 sync() 和 :194-235 的 syncNow() 沒有回傳值，失敗只在 :232 寫 self.error。原修法寫的行號有兩個不對，ec71aa2 時就是這樣：換帳號的 guard 是 :216（不是 :219），`error = nil` 是 :230（不是 :233），catch 是 :231-234。ListTab.swift:87 的下拉還是 `pull.go { await store.sync() }`，PullState.go（ListTab.swift:243-250）不管成敗都直接收起甜甜圈。GroupsTab.swift:48 和 :360 的 .refreshable 也一樣。Store.swift:418-426 的 signOut() 還是沒清 error，訊息會留到 MeTab.swift:297 的登入畫面。行程那邊 Trip.swift:386-388 失敗也還是只有 print；TripStore 的 loading 在 Trip.swift:298，load() 在 :349-359。FoodMapApp.swift 的背景同步呼叫因為之前的 commit 往下移了：現在是 :58、:67、:214（原本寫 :56、:65、:194）。TripsList.swift 被 d95fd43 改過，.refreshable 從 :49 移到 :74。Haptic.warning() 在 Theme.swift:220，say() 在 Store.swift:429。

**修法**：

只在使用者自己下拉時回饋，背景同步一律不說話。行號都是 d95fd43 的。
(1) Store.swift:135 改成 `@ObservationIgnored private var syncing: Task<Bool, Never>?`。
(2) Store.swift:186-192 換成：
```swift
@discardableResult @MainActor func sync() async -> Bool {
    if let t = syncing { return await t.value }
    let t = Task { await syncNow() }
    syncing = t
    let ok = await t.value
    syncing = nil
    return ok
}
```
FoodMapApp.swift:58、:67、:214 和 Store.swift 裡其他 `await sync()`（:299、:309、:334、:414、:490、:698、:832、:840、:851）都因為有 @discardableResult 不用改。
(3) Store.swift:194 改成 `private func syncNow() async -> Bool`。:195 沒登入的 guard 和 :216 換帳號的 guard 都改成 `else { return true }`（沒有東西要提示）；:230 `error = nil` 後面加一行 `return true`；catch 那段（:231-234）改成：
```swift
} catch {
    self.error = error.localizedDescription
    if Supa.session == nil { loggedIn = false; return true }
    return false
}
```
(4) 在 Store.swift:429 的 say() 旁邊加一個共用的提示，下拉的地方都叫它：
```swift
// 使用者自己下拉更新卻沒同步到（背景同步失敗不說）
@MainActor func saySyncFailed() {
    Haptic.warning()
    say("沒連上網路，看的是上次存的資料")
}
```
(5) ListTab.swift:243-250 的 PullState.go 改成：
```swift
func go(_ work: @escaping () async -> Bool, failed: @escaping () -> Void = {}) {
    armed = false
    guard !busy else { return }
    withAnimation(.snappy) { busy = true }
    Task {
        let ok = await work()
        withAnimation(.easeIn(duration: 0.25)) { busy = false }
        // 等甜甜圈收完再說，不然訊息條和甜甜圈同時動
        if !ok { try? await Task.sleep(for: .seconds(0.25)); failed() }
    }
}
```
ListTab.swift:87 改成 `if ph != .interacting, pull.armed { pull.go({ await store.sync() }, failed: { store.saySyncFailed() }) }`。
(6) GroupsTab.swift:48 和 GroupsTab.swift:360 兩個 .refreshable 都改成 `.refreshable { if !(await store.sync()) { store.saySyncFailed() } }`。
(7) Store.swift:418 的 signOut() 第一行加 `error = nil`。
(8) 可以順手做，但要等第 5 批 U60 剩下的部分（toastHost）做完：Trip.swift:298 改成 `@ObservationIgnored private var loading: Task<Bool, Never>?`，:349-359 的 load 換成：
```swift
    @discardableResult func load(fresh: Bool = false) async -> Bool {
        if let t = loading {
            let ok = await t.value
            if !fresh { return ok }
            if let t2 = loading { return await t2.value }
        }
        let t = Task { await loadNow() }
        loading = t
        let ok = await t.value
        loading = nil
        return ok
    }
```
:361 改成 `private func loadNow() async -> Bool {`，:362 和 :368 的兩個 guard 改成 `else { return true }`，:384 `loaded = true` 後面加 `return true`，:386-388 的 catch 改成 `} catch { print("[trips] load_trips 失敗：\(error)"); return false }`。其他 `await trips.load()` 的地方（MapTab.swift:546、PinMenu.swift:50、PlaceDetail.swift:55、:239、Trip.swift:406、TripPanel.swift:59、:63、:66、:89、TripsList.swift:73）有 @discardableResult 不用改。TripsList.swift:74 改成 `.refreshable { if !(await trips.load()) { store.saySyncFailed() } }`。我的行程是 sheet，d95fd43 在 TripsList.swift:47-66 加的 sheet 訊息條只顯示「已刪除「」開頭的訊息，這條會被 sheet 蓋住看不到，所以 (8) 要等 U60 把 sheet 換成 toastHost（什麼訊息都顯示）之後再做。
註：日後做離線膠囊的話，是跟剪貼簿膠囊、訊息條共用面板上緣 +8 那個位置。

**模擬器驗收**：模擬器關掉 Mac 的網路（或用 Network Link Conditioner 設成 100% Loss）後：(1) 在收藏頁下拉超過 70 放開，確認甜甜圈轉一下收起後，才出現「沒連上網路，看的是上次存的資料」訊息條並震一下。(2) 群組頁、群組詳細頁下拉也一樣出現訊息。(3) 網路恢復後再下拉，不出現任何訊息。(4) 斷網時把 App 切到背景再回來（背景同步），不能出現訊息。(5) 斷網下拉失敗後到「我的」登出，登入畫面不能出現紅字錯誤。(6) 有做 (8) 的話：斷網時在我的行程（地圖右邊「行程」開的 sheet）下拉，訊息出現在 sheet 底部看得到；恢復網路再拉不出現。

**注意**：第 5 批 U60：d95fd43 在 TripsList.swift:47-66 加的 sheet 訊息條只顯示「已刪除「」開頭的訊息，第 (8) 點在我的行程下拉失敗的訊息會被 sheet 蓋住；要等 U60 剩下的部分把它換成 toastHost 之後再做 (8)。5d713ac 改了行程模式訊息條的位置（面板最高段時放進面板最上面那條），這項的訊息條是在收藏頁、群組頁、我的行程叫的，不在行程模式，不受影響。跟 fix-addcard-ec71aa2.md 沒有重疊。跟同批 U69 的剪貼簿膠囊都會在面板上緣附近出現，但這項只用既有的 say() 訊息條，不新增膠囊，剪貼簿膠囊看 store.toast == nil 會讓位，不衝突。
