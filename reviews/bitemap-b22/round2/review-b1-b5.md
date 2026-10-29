# 第 2 輪第 1 到 5 批：做完之後的審查和補修

每一批做完後，我對照規格逐項審了一次，每個發現再由另一位反方到程式裡推翻；這裡只留推翻不掉的。行號都是 72ac06e 的（dabe07a 只改了 GroupsTab.swift，其他檔案行號一樣）。各批審完就補一節進來。

第 3 批那 4 項已經做成 dabe07a，我逐行對過，跟這裡寫的一樣。下面第 1、2、4 批和滑順第 4 輪的 R 項可以一起做，都不用問 Anthony（R4-3 只要模擬器錄影，先不用改程式）。

第 5 批的 R5-1、R5-2 在最後一節，也都不用問 Anthony。

## 第 3 批（f62e434、ccc1d96）

9 項都做全了，-fakeRound 只有開發版和模擬器讀得到，不加參數時行為不變。審出 4 個問題，都要修，都不用問 Anthony。

### R3-1 配對畫面會蓋到別的分頁上（U45 改成 fullScreenCover 帶出來的回歸，要修）

**原因**：Root.page 用 opacity 藏分頁（FoodMapApp.swift 的 page(i)），藏著的群組分頁不會觸發 onDisappear，所以 RoundView 每 5 秒的輪詢（GroupsTab.swift:604-611）在地圖、收藏分頁也照跑。以前配對畫面是 overlay，畫在藏著的群組分頁裡，看不到；現在 :590 是 fullScreenCover，是整個視窗層級的呈現，人在地圖分頁時朋友一滑出配對，全螢幕的「配對成功」就會蓋在地圖上。別的分頁開著 sheet 時（例如新增框），推論它會等 sheet 關掉的那一刻蓋上去。

**修法**：RoundView 讀第 3 批 U50 加的 tabActive，群組分頁藏著時先把配對留著，回到群組分頁再跳。

GroupsTab.swift:577 `@State private var match: Store.Match?` 下面加：
```swift
    @State private var held: Store.Match?      // 群組分頁藏著時來的配對：回到群組分頁再跳
    @Environment(\.tabActive) private var tabActive
```
:747-751 的 celebrate 換成：
```swift
    private func celebrate(_ m: Store.Match) {
        // 群組分頁藏著（Root.page 用 opacity 藏）：fullScreenCover 會蓋到別的分頁上，先留著，回到群組分頁再跳
        guard tabActive else { held = m; return }
        Haptic.success()
        var t = Transaction(); t.disablesAnimations = true
        withTransaction(t) { match = m }   // 關掉系統往上滑的轉場，由 MatchView 自己淡入
    }
```
:595 的 `.presentationBackground(.clear)` 和下一行的 `}` 之後（fullScreenCover 結束、-fakeMatch 那個 .task 之前）加：
```swift
        .onChange(of: tabActive) { _, on in
            if on, match == nil, let m = held { held = nil; celebrate(m) }
        }
```
:610 改成 `if match == nil, held == nil, let m = store.matches(r).first(where: { $0.all && !before.contains($0.id) }) { celebrate(m) }`。

震動跟著畫面：以前在別的分頁會先震一下、什麼都看不到，現在回到群組分頁、配對畫面出來時才震。這是跟著修 bug，不用另外問。

**模擬器**（作廢，滑卡時分頁列是藏著的，改照下面 R3-1b）：帶 -fakeMatch -fakeRound 開 App，進一輪滑卡後 1 秒內點分頁列的「地圖」：地圖上不能跳出配對畫面；切回群組分頁時配對畫面淡入、同時震一下。再一次：進一輪後切到收藏分頁打開新增框，等 2 秒關掉新增框，收藏分頁上不能跳配對畫面；切回群組才出來。Console 不能有「Attempt to present」。

### R3-1b 朋友滑出配對時，配對畫面還是會蓋到別的分頁（R3-1 的修法在輪詢那條路沒效，要修）

**模擬器回報**（3a839aa）：上面 R3-1 的驗收步驟做不到，是我寫錯了。滑卡畫面裡分頁列本來就藏著（Store.swift:80 的 `depth[tab] > 0`），按不到「地圖」。真的會在滑卡開著時離開群組分頁的路，主要是點「收藏好了」「之前收藏過了」通知（FoodMapApp.swift:395-401 → :182 → :237-239 設 `store.tab = 1`）。另一條是從店家頁「加進行程」後返回滑卡，6 秒內點訊息條（Trip.swift:676-679 → TripMode.swift:78）。

**原因**（兩位反方都推翻不了）：celebrate 在 GroupsTab.swift:768 讀 `@Environment(\.tabActive)`。呼叫它的每 5 秒輪詢（:623-631）和 -fakeMatch（:617-621）都是 `.task`，在 RoundView 出現那一刻開始跑，抓的是當時那份 RoundView struct 的複本。@Environment 的值存在 struct 裡，SwiftUI 之後只把新值寫進下次要算 body 的那一份，不會改 closure 手上那份；@State（match、held）透過共用的儲存讀，才是最新值。

所以輪詢裡讀到的 tabActive 永遠是進這輪那一刻的 true，guard 每次都過，人在收藏頁時朋友滑出配對，全螢幕「配對成功」照樣蓋上去，held 從來不會被設上。反過來也有一條（推論）：按「開始滑卡」後等網路的那段時間（:93-95）先切到別的分頁，RoundView 在藏著的群組分頁裡出現，輪詢抓到的就永遠是 false，回到群組盯著滑卡時，朋友的配對會一直被留著不跳。

證據：SwiftUI 的 Environment 是 @frozen struct，wrappedValue 是 @inlinable，直接讀存在自己身上的值（Swift Forums「Reverse-Engineering SwiftUI」的 swiftinterface、OpenSwiftUI 的 Environment.swift）；Swift Forums「Behavior of environment values inside task」（2025-07-30）有人實測過：.task 開始後改 colorScheme，task 裡看不到，改 @State 看得到。onChange(of:initial:_:) 的 closure 每次重做（Apple 文件原文），所以 :613 那條「回到群組再跳」本身是對的，只是 held 永遠等不到。滑卡的 closure（:664-677）也是每次重做，沒問題。我掃過整個專案 38 個值型別的 @Environment，會改變看得到的行為的只有這一處。

**修法**（不用問 Anthony，這是讓 R3-1 真的生效）：

(1) GroupsTab.swift:766-772 的 celebrate 換成：
```swift
    private func celebrate(_ m: Store.Match) {
        // 群組分頁藏著（Root.page 用 opacity 藏）：fullScreenCover 會蓋到別的分頁上，先留著，回到群組分頁再跳。
        // 讀 store.tab、不讀 tabActive：輪詢和 -fakeMatch 的 .task 用的是進這頁那一刻的 self，
        // @Environment 的值存在 struct 裡，那份複本之後不會更新；store 是 class，讀到的是現在的分頁。
        // 2 = 群組分頁（FoodMapApp.swift:141），RoundView 只在群組分頁推進來（GroupsTab.swift:50）
        guard store.tab == 2 else { held = m; Flag.log("[R3-1] 先留著 \(m.place.name) tab=\(store.tab) env=\(tabActive)"); return }
        Flag.log("[R3-1] 跳出 \(m.place.name) tab=\(store.tab) env=\(tabActive)")
        Haptic.success()
        var t = Transaction(); t.disablesAnimations = true
        withTransaction(t) { match = m }   // 關掉系統往上滑的轉場，由 MatchView 自己淡入
    }
```
:593 的 `@Environment(\.tabActive)` 和 :613 的 onChange 都留著（onChange 的 closure 是新的，靠它在回到群組時放出留著的配對）。:593 的註解改成「只拿來觸發下面的 onChange；.task 裡讀到的是舊值，要不要跳看 store.tab」。:614 加一行記號：
```swift
            if on, match == nil, let m = held { Flag.log("[R3-1] 回到群組，放出留著的配對"); held = nil; celebrate(m) }
```

(2) 被取消後不要再往下跑。`try? await Task.sleep` 被取消時會馬上丟錯、被 try? 吞掉，接著照樣 celebrate、震一下、再打一次雲端（模擬器說「返回後 fake 配對取消了」，其實只是畫面跳不出來）。輪詢 :625 換成：
```swift
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
```
-fakeMatch 那個 .task（:616-621）整段換成（順便加驗收用的等待秒數，不帶 -fakeMatchAfter 時跟現在一樣等 1 秒）：
```swift
        // 驗收用 -fakeMatch：進來就跳一次配對畫面（沒有配對就拿第一張當配對）
        // -fakeMatchAfter 12：進來 12 秒才跳，留時間點通知離開群組分頁（驗 R3-1）；-fakeMatchAway：1 秒後自己走「點了收藏好了通知」那條路
        .task {
            guard Flag.on("-fakeMatch"), let r = store.rounds.first(where: { $0.id == rid }) else { return }
            let wait = Flag.value("-fakeMatchAfter").flatMap { Double($0) } ?? 1
            Flag.log("[R3-1] 假配對 \(wait) 秒後跳")
            if Flag.on("-fakeMatchAway") {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                NotificationCenter.default.post(name: .openSaved, object: nil)
            }
            do { try await Task.sleep(for: .seconds(wait)) } catch { Flag.log("[R3-1] 假配對取消"); return }
            if let m = store.matches(r).first ?? store.todo(r).first.map({ Store.Match(place: $0, who: store.membersOf(r.group_id), all: true) }) { celebrate(m) }
        }
```

(3) 驗收用的 Console 記號（只有開發版、模擬器印，不用開 -perfOverlay）。Perf.swift 的 enum Flag 裡，`static let printChanges` 那行下面加：
```swift
    // 驗收用的 Console 記號：只有開發版、模擬器印，正式版這行編不進去
    static func log(_ s: @autoclosure () -> String) {
        #if DEBUG || targetEnvironment(simulator)
        print(s())
        #endif
    }
```
FoodMapApp.swift:397 `let kind = …` 下一行加 `Flag.log("[notify] 點了通知 kind=\(kind ?? "nil")")`（專案是 Swift 5 模式、沒有預設 MainActor，didReceive 裡直接叫得到）。MatchView 的 `.onAppear {`（GroupsTab.swift:821）第一行加 `Flag.log("[R3-1] 配對畫面出現 tab=\(store.tab)")`。

**模擬器**（iPhone 17，一次 build 就夠：記號裡的 env= 就是對照組，B 版印出「先留著 tab=1 env=true」就代表舊的 guard 在那一刻會直接跳出來）。

準備：
1. 在 Mac 建 ~/r31.json：`{"aps":{"alert":{"title":"R3-1 test","body":"tap me"},"sound":"default"},"kind":"saved"}`。
2. 通知權限：「我的」→「找好時通知我」那一列寫「打開」就點它、系統問時按「允許」；寫「已打開 ✓」就不用動。只寫 App 自己的設定，不動收藏。
3. 管線先驗：App 停在地圖分頁，另開一個終端機跑 `xcrun simctl push booted io.github.gop9632.foodmap ~/r31.json`。預期上方出橫幅，點了切到收藏頁最上面，Console 有 `[notify] 點了通知 kind=saved`。沒有橫幅或點了沒反應，就改用下面的備案。
4. 群組卡片的按鈕要寫「開始滑卡」才開始（寫「繼續滑」「看結果」代表推進來的是雲端那一輪，換一個群組）。

A. 人在收藏頁時先留著：帶 `-fakeRound -fakeMatch -fakeMatchAfter 12` 開 App，按「開始滑卡」，Console 出現「假配對 12.0 秒後跳」就跑 push、點橫幅（或先排好 `(sleep 4; xcrun simctl push booted io.github.gop9632.foodmap ~/r31.json) &`）。停在收藏頁等到滿 15 秒：收藏頁上沒有「配對成功」；Console 只多一行 `[R3-1] 先留著 … tab=1 env=…`，沒有「跳出」「配對畫面出現」「假配對取消」，也沒有「Attempt to present」。截圖，並記下 env= 是 true 還是 false。
B. 回到群組才跳：點分頁列的「群組」。配對畫面原地淡入，Console 依序是「回到群組，放出留著的配對」「跳出 … tab=2」「配對畫面出現 tab=2」，各 1 行。關掉配對畫面再等 15 秒，不會再跳。（真機每跳一次配對會震兩下：celebrate 一下、愛心爆開一下，原本就是這樣；要確認的是在收藏頁時「跳出」「配對畫面出現」都是 0 行。）
C. 一直在滑卡畫面：同樣參數重開、進一輪不動，約 12 秒直接跳出，Console 只有「跳出 … tab=2」，沒有「先留著」。再拿掉 -fakeMatchAfter 開一次，約 1 秒跳出，跟以前一樣。
D. 推頁會取消（可選）：12 秒內點最上面那張卡進店家頁，Console 馬上有「假配對取消」，店家頁上不跳；返回後重新出現「假配對 12.0 秒後跳」。店家頁上不要按「加進行程」。
備案（第 3 步的橫幅點不到時）：改帶 `-fakeRound -fakeMatch -fakeMatchAway -fakeMatchAfter 3`，進一輪 1 秒後 App 自己走 openSaved 切到收藏頁，再 3 秒才配對；預期同 A、B。
判讀：A 印 env=true 而且沒有跳出，就是修好了，也證明舊寫法會出錯。如果 A 印的是 env=false，代表我對舊值的推論不成立、3a839aa 本來就沒事，這個修法也沒有壞處，照實回報即可。收尾不用清：假的一輪只在手機記憶體裡，通知只是橫幅。

### R3-2 群組頁主按鈕「繼續滑（剩 N 張）」放不下（U38，要修）

**原因**：規格寫「群組頁的主按鈕是整列寬，可以寫完整的」，這個前提錯了。:288-308 的 HStack 裡還有「調整條件」（約 60pt）和「邀請」（約 97pt），主按鈕在 393pt 寬的手機上只剩約 184pt，扣掉 ChunkyStyle 的左右 16 和愛心圖示，文字只剩約 126pt；「繼續滑（剩 9 張）」用 headline 約 139pt，會折成兩行（外面是 44pt 高）。這是我規格的錯。

**修法**：主按鈕跟卡片一樣寫「繼續滑 N 張」（GroupCard.label），並把這顆按鈕拆成小 view（見 R3-3）。用 R3-3 的 QuickButton 就同時修好；它的 Text 是 `Text(GroupCard.label(act)).lineLimit(1).minimumScaleFactor(0.85)`。推論（字寬估算）：「繼續滑 10 張」約 98pt，375pt 寬的 SE 上不用縮也放得下。

**模擬器**：iPhone 17 和 iPhone SE（第 3 代）各一次，-fakeRound 開一輪 10 張、滑 1 張返回群組頁：主按鈕是一行「繼續滑 9 張」，沒有折行或「…」。再看自己還沒滑的「繼續滑 10 張」。

### R3-3 群組頁每滑一張就可能整頁重算（U38 的 act 讀了 swipes，要修）

**原因**：:263 在 GroupView.content 裡呼叫 `store.roundAction(gid)`，它經 todo(r) 讀 store.swipes。改之前 GroupView.content 沒有讀 swipes。從群組頁進滑卡時 GroupView 還在導覽堆疊下面，推論每滑一張（store.swipe 改 swipes）它整個 content（店卡格子、輪次列表）都可能重算，剛好跟卡片飛走同一幀。拆出去以後行為完全一樣，所以直接做，不用先量。

**修法**：GroupsTab.swift 的 GroupView 後面（找 `private func quick()` 所在的 struct 結束之後，任何檔案層級的位置都可以）加：
```swift
// 群組頁的主按鈕（開始滑卡／繼續滑 N 張／看結果）：只有這顆讀 roundAction（會讀 swipes），
// 滑卡時每滑一張，底下的群組頁不用整頁重算
private struct QuickButton: View {
    @Environment(Store.self) private var store
    let gid: String
    let empty: Bool
    let starting: Bool
    let action: () -> Void
    var body: some View {
        let act = store.roundAction(gid)
        let isNew: Bool = { if case .new = act { return true } else { return false } }()
        Button(action: action) {
            HStack(spacing: 6) {
                if starting { ProgressView().controlSize(.small).tint(.white) } else { Image(systemName: GroupCard.icon(act)) }
                Text(GroupCard.label(act)).lineLimit(1).minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity).frame(height: 44)
        }
        .buttonStyle(ChunkyStyle(radius: 16)).disabled((empty && isNew) || starting)
    }
}
```
:291-298（`Button { quick() } label: {` 到 `.buttonStyle(ChunkyStyle(radius: 16)).disabled((list.isEmpty && isNew) || starting)`）換成：
```swift
                    QuickButton(gid: gid, empty: list.isEmpty, starting: starting) { quick() }
```
刪掉 :263-264 的 `let act = …` 和 `let isNew …`（content 裡沒有別的地方用到）。quick() 在按下時才呼叫 roundAction，不用改。GroupCard（:140）本來就在 status 裡讀 swipes，不用動。

**模擬器**：從群組頁進一輪，連滑 5 張，主按鈕回來時字對；群組頁的開始、繼續、看結果三種狀態各按一次。

### R3-4 「上一輪結束了，開新的一輪吧」在 375pt 寬會被截（U38，要修）

**原因**：:157 `.padding(.trailing, 150)` 讓狀態那行在 375pt 寬只剩約 161pt，:220 這句約 169pt，會變成「上一輪結束了，開新的一…」。這句只在沒有進行中的一輪時出現，那時按鈕寫「開始滑卡」，用改之前的 110 就夠；150 只有「繼續滑 N 張」需要。

**修法**：:141 `let isNew …` 下面加：
```swift
        let wide: Bool = { if case .resume = act { return true } else { return false } }()   // 只有「繼續滑 N 張」比較寬
```
:156-157 改成：
```swift
                status(mem)
                    .padding(.trailing, wide ? 150 : 110)      // 右下留給按鈕：「繼續滑 N 張」要 150，「開始滑卡／看結果」110 就夠
```
「開始滑卡」和「看結果」的版面跟這批改之前一樣，不用改字。

**模擬器**：iPhone SE（第 3 代），用 -fakeRound 開一輪再刪掉（或等它超過 12 小時），群組卡片狀態那行要完整顯示「上一輪結束了，開新的一輪吧」；有進行中的一輪時「繼續滑 N 張」不能壓到狀態那行。

## 第 1 批（0f3900a）

3 項都做全了。審出的 3 點都不用改程式：分類標籤上緣點擊穿到喇叭那點 f62e434 已經修了；Release 編不過那點 465709d 已經修了；U02 (3) 要補的測試清單那一條，我已經直接加進共用資料夾的 UX改版實作規格.md 第 1 批第 4 項。

## 第 2 批（f0f0bf3）

12 項都做全了。審出 6 點要修。

### R2-1 有篩選時「再抽一次」整次被取消（U07 帶出來的回歸）

**原因**：抽一間不跟篩選，所以有篩選時抽中的常是 pins.extra。大卡是被篩掉的 A 時按「再抽一次」：draw() 先 reveal(B)，把 extra 換成 B，MapTab 重算後 list 裡沒有 A 了，:276 的 onChange 就 select(nil)。PinState.select 會順手把跳動取消、把 extra 清掉，結果大卡收起、B 沒選中，可是「抽過」已經記了 B。U07 之前只是跳動那一秒大卡先消失，最後還是會選中 B。

**修法**：MapTab.swift:276 換成：
```swift
                    // 抽一間還在跳（drawWin 還在）：等它跳完自己選中抽到的那間，這裡取消會把整次抽一間取消掉
                    if !trip.on, pins.drawWin == nil, let s = pins.sel, !s.hasPrefix("hit:"), !ids.contains(s) { pins.select(nil) }
```
drawWin 是 @ObservationIgnored，在 onChange 閉包裡讀不會多觀察東西。

**模擬器**：點「☕ 咖啡」chip，🎲 設成「一間」，-drawWin 接兩間不是咖啡的店 id（逗號隔開）。按 🎲 抽中第一間，再按大卡上的「再抽一次」：圖釘跳完大卡換成第二間，Console 有第二筆「抽一間（抽中）」。開「減少動態效果」再做一次，也要正常。

### R2-2 打字時點圖釘，大卡躲在鍵盤後面；長按選單被鍵盤蓋住（U16 帶出來的回歸）

**原因**：U16 讓面板打字時留在鍵盤後面（:446 的 ignoresSafeArea(.keyboard)），可是首頁打字時點圖釘、點泡泡、長按圖釘都不會收鍵盤。點圖釘時 picked() 把面板升到中段，中段大卡的上緣差不多就在鍵盤上緣，所以大卡整張看不到（SE 只露一行）。長按選單量的高度也把鍵盤那塊算進去，畫面下半的圖釘選單往下彈，「看店家」落在鍵盤後面。行程模式點圖釘時已經會收鍵盤（trip.endTyping()），首頁沒有。

**修法**：跟行程模式一樣，點圖釘、點泡泡、長按圖釘時先收鍵盤。這是修回歸，不用問。MapTab 的 beginTyping（:815）前面加：
```swift
    // 首頁搜尋框還在打字：先收鍵盤，大卡和長按選單才不會躲在鍵盤後面（跟行程模式點圖釘的 trip.endTyping() 一樣）
    fileprivate static func endHomeTyping() {
        guard MapPanel.shared.typing else { return }
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
```
三個呼叫：
- picked() 的 :679 `MapPanel.shared.go(.mid)` 後面加 `Self.endHomeTyping()`。先換段再收鍵盤，keyboardWillHide 觸發 endTyping 時 stage 已經是 .mid，會直接 return。
- zoom() 的 :997 `MapPanel.shared.atLeastMid()` 後面加 `if !trip.on { Self.endHomeTyping() }`。
- FoodPin 長按的 :2002 `withAnimation(.spring(response: 0.32, dampingFraction: 0.72)) { pins.menu = place.id }` 前面加 `MapTab.endHomeTyping()`。

一般地圖點空白處不會收鍵盤（:184 的 SpatialTapGesture 在非行程模式不收），這次不加；U16 驗收 (2)(3) 的「點地圖收鍵盤」改成按搜尋鍵（框裡沒字）收。

**模擬器**：iPhone 17 和 SE，⌘K 叫出軟體鍵盤。(1) 搜尋框打「咖」，等面板降到最低段，點一根圖釘：鍵盤收起，大卡停在中段。(2) 打字中長按畫面下半的一根圖釘：鍵盤先收，整張選單看得到。(3) 打字中點一顆泡泡：鍵盤收起，泡泡照常放大或列出。

### R2-3 拖地圖每一幀都濾一次整份收藏（U14，小）

MapTab.swift:194 只換這一行（後面的 if 不動）：
```swift
                    // 新帳號的「收藏第一間店」卡不降（跟 NearbySheet 裡那張卡同一個條件）；找到一間自己的店就停，不每幀濾整份收藏
                    let empty = store.mapGroup == nil && !store.loading && !store.places.contains(where: { store.isMine($0) })
```
跟原本的 `store.mine.isEmpty` 等價（mine 就是 places.filter(isMine)），不改行為。

### R2-4 有群組的帳號沒打字時少了放大鏡（U06，小）

規格的程式碼寫「有 lead 就不放放大鏡」，跟同一項「保留 A1 的預設樣子，只在正在打字時收小」和驗收「沒選群組時搜尋框長相跟 ec71aa2 一樣」矛盾，是我規格的錯，以驗收為準。Theme.swift:156 換成：
```swift
            if let lead { lead(busy) }
            // 有「我的收藏 ▾」時，只有打字中才拿掉放大鏡讓出位置；沒打字照 A1 的樣子
            if lead == nil || !busy { Image(systemName: "magnifyingglass").foregroundStyle(.secondary) }
```
**模擬器**：有群組的帳號，地圖搜尋框沒打字時是「我的收藏 ▾」加放大鏡，跟 ec71aa2 一樣；點進去打字時膠囊收小、放大鏡不見；收鍵盤、清空文字後放大鏡回來。

### R2-5 列出「這裡有 N 間」時按定位鈕，面板沒退出（U12，小）

MapTab.swift:417 定位鈕的 `Haptic.light()` 後面加：
```swift
                                        // 程式移鏡頭：離開「只列這幾間」（跟 frameShown 一樣，U12 6(d)）
                                        seenBox.zoomed = nil
                                        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
```

### R2-6 列出「這裡有 N 間」時抽一間飛到別處，關大卡後面板還寫「這裡有 N 間」（U12，小）

跟 U12 6(d) 替 frameShown 加退出的理由一樣：地圖飛走了，面板不能還列那幾間。picked() 的 :678 `quiet.hush()` 後面加：
```swift
        // 抽中、點到的不是「這裡有 N 間」那幾間：地圖要飛走，離開列出模式（跟 frameShown 一樣，U12 6(d)）；大卡蓋著，不用動畫
        if let o = seenBox.only, !o.contains(id) { seenBox.zoomed = nil; seenBox.only = nil }
```
抽中的是列表裡那幾間之一時（U11 會先把它拆出泡泡），照舊留在列出模式。

**模擬器（R2-5、R2-6）**：兩間座標相同的店，點泡泡進「這裡有 2 間」。(1) 按定位鈕：面板換回「附近 N 間」。(2) 再進一次，🎲 設「一間」範圍「全部」，-drawWin 接別的城市的一間，按 🎲，降落後按 ✕：面板是那一帶的「附近 N 間」。(3) -drawWin 換成列表裡那兩間之一：先拆出泡泡、選中，關大卡後回到「這裡有 2 間」。

## 第 4 批（ec814cb）

15 項都做全了。審出 4 點，R4-1、R4-2、R4-4 要修，R4-3 先讓模擬器錄影。

### R4-1 換分頁時收藏頁白算（U59 的寫法帶出來的）

**原因**：ListTab.swift:21 `store.shown(store.tab == 1 ? store.listF : applied)` 讓收藏頁的 body 依賴 store.tab。(a) 在地圖、群組、我的之間換頁，收藏頁每次都整頁重算一次，算出來跟上次一樣，剛好落在按分頁那一幀（U54 才剛為了同樣原因把 MapTab 讀的 store.tab 拿掉）。(b) 收藏頁在前景時打字，applied 不會更新（FilterSync 的 live 是 false），離開收藏頁那一下先用舊的 applied 算一次、帶著換頁的 spring 播卡片轉場，onChange 對齊後再算一次。

**修法**：ListTab 的 :15 `@Environment(\.accessibilityReduceMotion) private var reduce` 下面加：
```swift
    @Environment(\.tabActive) private var front   // Root.page() 給的「收藏頁在前景」：只有進出收藏頁時才變
```
:21 換成：
```swift
        let visible = store.shown(front ? store.listF : applied)
```
FilterSync 的 :464-474（兩個 onChange）換成：
```swift
            .onChange(of: store.mapF) { old, f in
                guard store.tab == tab else { return }
                // 收藏頁在前景時 body 讀 listF、不讀 applied：順手對齊，離開時才不用再算一次
                guard live else { applied = f; return }
                // 點分類、想去去過（chips 本來就包 withAnimation(.snappy)）照舊有動畫；打字不帶動畫
                if old.q == f.q { withAnimation(.snappy) { applied = f } } else { applied = f }
            }
            .onChange(of: store.tab) { old, new in
                // 離開這頁：停在離開當下的篩選；切進這頁也先對齊（地圖馬上畫新的；收藏頁 body 讀 listF，這裡只是讓離開時不用再算）
                guard old == tab || new == tab, applied != store.mapF else { return }
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { applied = store.mapF }
            }
```
地圖那頁（live）的條件原本是 `old == tab || (live && new == tab)`，對它來說跟新的一樣，行為不變。FilterSync 是小 view，照舊讀 store.tab 沒關係。

**模擬器**（-perfOverlay，開 App 等 1 秒讓四頁建好）：(1) 地圖→群組→我的→地圖，「收藏」計數一次都不加。(2) 在收藏頁搜尋框打 3 個字再點地圖分頁：「收藏」每個字加 1，切出去那一下只加 1（改前加 2）。(3) 地圖點「咖啡」後 350ms 內點收藏分頁再點回地圖：切進、切出各加 1。(4) 第 4 批 U59 驗收 1 到 8 重跑。

### R4-2 地圖按搜尋鍵框結果時，可能框到改字之前那批店（U59，小）

**原因**：:353 的 onSubmit 呼叫 frameShown()，它用的 points 讀 applied，applied 要等下一輪更新才變。英文鍵盤按搜尋鍵時如果剛好套用自動修正，文字改變和送出在同一個事件裡，會框到舊的那批或直接震一下說找不到。

**修法**：MapTab.swift:353 換成：
```swift
                            .onSubmit(of: .text) { if !store.mapF.q.isEmpty { applied = store.mapF; frameShown() } }
```

**模擬器**：英文鍵盤打 piza，不點建議字，直接按「搜尋」：鏡頭框的是修正後那批，跟圖釘一致。

### R4-3 別頁改篩選後切到收藏頁，舊卡還在淡出、間數疊成「21 間」（U59 (4)，錄影確認，要修）

**錄影結果**（149b223，不加參數）：(a) 地圖點「咖啡」後約半秒切到收藏：舊卡還在淡出約 10 幀，「N 間」從 2 滾到 0，「沒有符合的店／清除篩選」跟舊卡疊了好幾幀。(b) 從「我的」點「去過 2」：一進來舊咖啡卡才開始縮小淡出，「N 間」從 11 滾到 2，中間好幾幀疊成「21 間」，兩張去過的卡從下面滑上來約 12 幀才定住。

**原因**：收藏頁藏著時畫的是 applied（背景同步要停 350ms，「我的」那條是切過來那一刻才改 listF），切進來那一下 front 變 true、改畫 listF，卡片和間數在同一次更新裡改變。這次更新是 Root 換分頁的 `withAnimation(.spring)`，所以 :71 的 `.animation(…, value: cards.map(\.id))` 和間數的 `.animation(.snappy, value: visible.count)` 都把它當成篩選改變來播。

**修法**：這是一進來看到舊內容和疊字，不是新的樣子，直接修，不用問 Anthony。ListTab.swift 的 ScrollView 裡那個 VStack，在 :83 `.padding(.top, 8).padding(.bottom, 24)` 後面加一行（行號是 fccc58f 的）：
```swift
                // 切進收藏頁那一下：卡片、間數、篩選籤直接是新的樣子（不要跟著換分頁的 spring 播篩選動畫）；在收藏頁裡點籤、打字照舊有動畫
                .transaction(value: front) { $0.animation = nil; $0.disablesAnimations = true }
```
只有 front 改變的那次更新會被拿掉動畫；整頁淡入、往上 8pt 是 Root.page() 掛在外面的，不受影響。在收藏頁裡點籤、打字、清除篩選時 front 沒變，動畫照舊。

**模擬器**：照錄 (a)(b) 兩種再錄一次慢放：第一幀起就只有篩好的卡，間數直接是新數字（沒有「21」那種疊字），「沒有符合的店」不會跟舊卡疊在一起；整頁照舊從下面 8pt 淡入。回歸：在收藏頁裡點「想去」「去過」、打字、按「清除篩選」，卡片照舊移位、縮小淡出，間數照舊滾動。

### R4-4 編輯表單打字又刪掉、時段點開又關掉，會被當成改過（U64，小）

**原因**：Edit.swift:139-142 的 dirty 直接比整個 Place。欄位清空後存的是 ""（不是原本的 nil），時段點開又關掉會把 nil 變成 []，所以什麼都沒改卻不能往下滑關掉，按取消還要多確認一次。

**修法**：Edit.swift:139-142 換成：
```swift
    private var dirty: Bool {
        guard let base else { return false }
        return norm(place) != norm(base.0) || dishes != base.1 || tags != base.2
    }
    // 打了字又刪掉、時段點開又關掉，不算改過（Place.row 本來就把 nil 存成空字串，存檔內容不變）
    private func norm(_ p: Place) -> Place {
        var p = p
        let ks: [WritableKeyPath<Place, String?>] = [\.branch, \.cuisine, \.city, \.district, \.address, \.hours, \.note, \.source_url]
        for k in ks where p[keyPath: k]?.isEmpty == true { p[keyPath: k] = nil }
        if p.meals?.isEmpty == true { p.meals = nil }
        return p
    }
```
（Place 的這幾個欄位在 Models.swift:8-24 都是 `String?`，meals 是 `[String]?`。）

**模擬器**：沒填分店的店按編輯，在「分店」打一個字再刪掉，按取消直接關、往下滑也能關；時段點一個再點掉，一樣；真的改了店名，按取消要跳確認框、往下滑關不掉。

## 滑順第 4 輪（67b2858）

第 2、3、4 節都做全了，量測行也都在。兩點小整理，外觀和時機都不變：

### R1d-1 🎲 的大小每讀一次就問一次 UIKit

DiceChip 的 dice 每次 body 都讀兩次，每次都 new 一個 trait collection 去查字型。同一個字級只要問一次。MapTab.swift:2447-2450 換成：
```swift
    // DiceChip 的字型是 .subheadline：同一個字級下 UIKit 的 subheadline 是幾 pt，🎲 就畫幾 pt。
    // 同一個字級只問一次：DiceChip 的 body 每次跟著面板、大卡重算都會讀 dice 兩次
    private static var diceCache: [DynamicTypeSize: CGFloat] = [:]
    static func diceSize(_ d: DynamicTypeSize) -> CGFloat {
        if let v = diceCache[d] { return v }
        let v = UIFont.preferredFont(forTextStyle: .subheadline,
                                     compatibleWith: UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(d))).pointSize
        diceCache[d] = v
        return v
    }
```
EmojiArt 是 @MainActor，跟 :2459 的 slots 同樣寫法。

### R1d-2 沒開 -emojiImg 時，換字級也會在主執行緒畫一張用不到的 🎲 圖

Draw.swift 的 `.onChange(of: dice) { EmojiArt.render("🎲", dice, .dice) }` 沒看開關，render 也只看 `s.img == nil`，正式版換字級時會白畫一張（舊問題）。MapTab.swift:2471 換成：
```swift
        guard !e.isEmpty, warmOnly || parts.contains(p.rawValue), s.img == nil else { return }
```
跟 warm 的過濾一樣，加 -emojiImg 或 -emojiWarm 時行為不變。

**模擬器**：只加 -perfOverlay，到設定把字級拉到 AX5 再切回 App，Console 不能出現「[emoji] 畫 🎲 dice」；加 -emojiImg dice 重跑 M14 (2)，🎲 還是圖。

## 第 5 批（72ac06e）

16 項和開頭的合併注意（合1 到合10）都做全了，滑順第 4 輪的改動和量測行也都還在（逐行對過 67b2858、465709d 加的每一行）。審出 2 個小問題，都要修，都不用問 Anthony。下面的行號在 a5eef80 還是一樣。

commit 訊息有幾句跟實際行為不一樣，模擬器請照 batch5.md 各項的「模擬器驗收」做，不要照 commit 訊息：
- U13：commit 寫「進行程時選著的圖釘保持放大、像站一樣有名字」，那是原本的錯。修好後是進行程時取消選取（加站卡開著時除外），離開行程時「這裡有 N 間」回到原樣。
- U19：commit 寫「上移／下移」，程式和規格都是「往前移／往後移」，VoiceOver 要找的是後者。
- U24：commit 寫「到最後一站會自己結束」。實際上自己按到最後一站會出現完成卡；只有別人刪了站、或別台裝置標成到了，讓下一站不見時，才自動結束出發。
- U21 順便看：「出發」「✨ 排順序」兩顆按鈕外面多包了一層 UIKit 的拖曳手勢。按下那一幀要有壓下的樣子，往上推再放開不能開始出發。

### R5-1 關掉「我的行程」後，地圖上的訊息條一下子冒出來（U60 帶出來的，要修）

**原因**：FoodMapApp.swift:480-481 的 `.onAppear { store.toastSheets += 1 }`、`.onDisappear { store.toastSheets -= 1 }` 沒有動畫，而 Root 的訊息條只看 :91 的 `store.toastSheets == 0` 決定畫不畫。U60 之前，Root 那條一直畫在 sheet 下面，sheet 往下滑時它是被慢慢露出來的；現在 sheet 收完才叫 onDisappear，Root 那條沒有動畫可播，就直接冒出來。打開 sheet 時也一樣，Root 那條在 sheet 還沒蓋到之前就瞬間不見。程式照規格寫，錯在我規格的設計。

**修法**：FoodMapApp.swift:480-481 換成：
```swift
        .onAppear { withAnimation(.snappy(duration: 0.3)) { store.toastSheets += 1 } }
        .onDisappear { withAnimation(.snappy(duration: 0.3)) { store.toastSheets -= 1 } }
```
Root 那條就照它現有的 transition 從下面滑進、滑出。只有 Root 的 toastLayer 讀 toastSheets，sheet 裡那條、倒數（:58 只看 toast）、剩下的秒數和「復原」都不受影響。這是把我們自己弄出來的跳動修回滑順，不用問 Anthony。

**模擬器**：用 -uitestSlowToasts 啟動。在「我的行程」左滑刪一個測試行程、按「刪除行程」，sheet 底部出現「已刪除「…」」後把 sheet 往下拉掉。錄影一格一格看：Root 那條是從下面滑進來，不是突然冒出來；剩下的秒數接著數，淡掉前按「復原」仍然有效（復原後確認測試行程回來）。再打開「我的行程」一次，Root 那條是滑出去，不是瞬間不見。

### R5-2 評分卡量高度那行多一個 Swift 6 並行警告（編得過，小）

TripPanel.swift:1388 的 onGeometryChange 在量的那個閉包裡讀了 MainActor 的 `MapTab.windowHeight`，會多一個「can not be referenced from a Sendable closure」警告（Swift 6 模式會變成錯誤）。把算式搬進 action，結果完全一樣：
```swift
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { y in mode.goInset = max(0, MapTab.windowHeight - y - MapTab.safeBottom) }
```
**模擬器**：建置後 Issue navigator 裡 TripPanel.swift 這一行沒有那個警告。照 U23 驗收 (3) 走一次：出發、到第二站按「到了 ✓」跳出評分卡，「到了 …」訊息條貼在評分卡上緣上方約 8pt，沒壓到星星和 ✕；評分卡收掉後訊息條回到離底 24pt。

### 第 5 批模擬器結果（584e384，Debug 版）

- **R5-1 通過。** 錄影 R5-1b_small.mp4 我一格一格看過（10 fps 截圖）：拉掉 sheet 時，sheet 裡那條跟著 sheet 往下走；sheet 收完約 0.4 秒後 Root 那條從下面滑上來，倒數接著原本的數，畫面上沒有同時兩條。按「復原」後訊息條滑出淡掉，測試行程回來。sheet 收完到 Root 那條出現之間有約 0.4 秒沒有訊息條，這是 onDisappear 要等 sheet 收完才叫，屬於預期，不改。
- **U23 (3) 通過。** 「到了 …」訊息條下緣在評分卡上緣上方約 9pt，沒壓到星星和 ✕；評分卡收掉後回到離底約 24pt（三張截圖看過）。「復原」在訊息條還在時按，Console 印「清掉 done_at」，回到第 3 站的站卡、那站不打勾、DB 的 done_at 是 null。上次 Release 版的失敗是等訊息條收掉才點，不是 bug。
- **R5-2** 的建置警告還沒回報，下次建置時一起看。
- 測完 DB 只剩 Anthony 的「測試」。
