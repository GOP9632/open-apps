# 第 2 輪第 1 到 5 批：做完之後的審查和補修

每一批做完後，我對照規格逐項審了一次，每個發現再由另一位反方到程式裡推翻；這裡只留推翻不掉的。行號都是 72ac06e 的。各批審完就補一節進來。

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

**模擬器**：帶 -fakeMatch -fakeRound 開 App，進一輪滑卡後 1 秒內點分頁列的「地圖」：地圖上不能跳出配對畫面；切回群組分頁時配對畫面淡入、同時震一下。再一次：進一輪後切到收藏分頁打開新增框，等 2 秒關掉新增框，收藏分頁上不能跳配對畫面；切回群組才出來。Console 不能有「Attempt to present」。

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
