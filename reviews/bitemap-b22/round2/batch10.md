# 第 2 輪第 10 批　P3：全 App（無障礙、觸控區、對比、共通元件）

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 10 項：U84 規格共通原則沒有套到 16 項以外的畫面，還留著 iOS 預設樣式、U91 星等對 VoiceOver 不會唸出目前幾顆星、U104 滑卡疊卡對 VoiceOver 很亂；收藏頁 🎲 不管減少動態、U107 訊息條和剪貼簿膠囊對 VoiceOver 使用者太快消失，「復原」來不及按、U121 用 Menu 做的按鈕按下時沒有縮放和輕震、U122 動態字體沒有上限，固定高度的膠囊、搜尋框、卡片在大字時會爆框、U123 薄荷綠、金黃底配白字對比太低、U124 幾顆按鈕的觸控區小於 44pt、U125 切到「我的」時大標題位置跳約 4pt、U131 自訂的暗底浮層對 VoiceOver 不是對話框，雙指 Z 關不掉

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是逐批檢查時找到的：同一批或跨批有兩項以上改到同一段程式、照字面依序套會打架的地方，以及跟 V11、perf-round1b 重疊的地方。這一節的行號是 acd4471 的。
各項內文的寫法跟這裡衝突時照這裡。

### 合1　U107、U34、U35

**位置**：Store.swift:589-608、Trip.swift:457-470、Trip.swift:546-557

**問題**：第 4 批的 U34（P2，會比這批早做）已經把刪收藏的固定 sleep 換成 waitToastGone(msg)，等訊息條真的不見才送 DELETE；U35 的 deleteManyWithUndo 也用同一個函式；U34 第 (3) 點還建議 Trip.swift 的刪行程、拿掉一站照做。U107 第 (1)(2)(3) 點用另一套做法（toast 的 didSet 觸發 toastCommit）解同一件事，它要搬的「Store.swift:598-607 的 Task { try? await Task.sleep(...) }」在 U34 做完後已經不存在。照字面套，寫 Swift 的人會找不到錨點；如果只把 deleteWithUndo 改成 commit，U35 的整家刪除還在輪詢，兩套並存；同一個刪除兩套都留著就會送兩次 DELETE。U107 的「注意」完全沒提 U34、U35。

**合併做法**：

保留 U34 的做法，U107 第 (1)(2)(3) 點不要做。先確認 Trip.swift 兩個刪除已經照 U34 (3) 改好：刪行程把 :459-460 的 sleep 和 toastHeld 迴圈換成 `await store.waitToastGone("已刪除「\(t.title)」")`，拿掉一站把 :547 換成 `await store.waitToastGone("已拿掉 \(s.name)")`；還沒改的話就照 U34 (3) 補，不要改用 commit。waitToastGone 是看 `toast == msg` 輪詢的，所以 U107 第 (4) 點的 VoiceOver 15 秒、手指按著、slowToasts 都會自動跟著等，復原一定是真的。LaterDelete.flush 收掉訊息條後會再送一次 DELETE，U34 的注意已經說明無害；signOut 有 `loggedIn` 守衛。U107 這項只剩 (4)(5)(6) 要做，模擬器驗收照舊可以用（刪 A 後馬上刪 B，A 會在 B 的訊息條出來後約 0.3 秒送出）。

### 合2　U107、U60、U96

**位置**：FoodMapApp.swift:145-156

**問題**：第 5 批的 U60 會把訊息條的倒數 .task 從 :145-153 搬到 Root 的 `.task(id: store.toast)`（:170 的 .environment 前面），:154-156 的 DragGesture 搬進新的 ToastBar。U107 第 (4) 點寫的「FoodMapApp.swift:146」做完 U60 後已經不在原處，第 (6) 點講的 DragGesture 也換了地方。另外第 9 批的 U96 是靠「倒數寫在訊息條 overlay 裡，小卡開著時訊息條沒掛上去就不會倒數」，U60 把倒數搬出來之後這個前提不成立，小卡開著時訊息條藏著照樣倒數；U107 要改的正是這一段。

**合併做法**：

U107 第 (4) 點改在 U60 搬出來的那個 .task 上，順手把 U96 要的「小卡開著不倒數」寫進迴圈：
```swift
.task(id: store.toast) {
    guard let t = store.toast else { return }
    let act = store.toastAction
    var left: Double = Store.slowToasts ? 20 : (UIAccessibility.isVoiceOverRunning && act != nil) ? 15 : (store.toastSeconds ?? (act == nil ? 2.6 : store.toastTap != nil ? 5 : 4))
    while left > 0 {
        try? await Task.sleep(for: .milliseconds(100))
        if Task.isCancelled { return }
        // 手指按著、或通知小卡蓋著（U96 把訊息條藏起來）時不倒數
        if !store.toastHeld && !(store.askNotify && store.coach.isEmpty) { left -= 0.1 }
    }
    withAnimation(.snappy) { if store.toast == t { store.toast = nil; store.toastAction = nil } }
}
```
第 (6) 點講的訊息條 DragGesture 在 U60 之後是 ToastBar 裡那段 simultaneousGesture，說法一樣，只是位置換了。

### 合3　U107

**位置**：Onboard.swift:103-120、Store.swift:100

**問題**：U107 第 (5) 點建議把 Onboard.swift:115 改成 `if !held && Store.shared?.toast == nil`，但 Store.shared 是 App Group 的 UserDefaults（Store.swift:100 `static let shared = UserDefaults(suiteName: ...)`），不是 Store 物件，這行編不過。

**合併做法**：

用括號裡的備案，由呼叫端把 store 傳進來。check(_ store:) 本來就拿得到 store：Onboard.swift:84 改成 `show(n, store)`，show 改成：
```swift
private func show(_ n: Int, _ store: Store) {
    seen = n
    UserDefaults.standard.set(n, forKey: "clipSeen")
    held = false
    Perf.shared.mark("剪貼簿膠囊（已按 ✕ \(skips) 次）")
    withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { showing = true }
    AccessibilityNotification.Announcement("剛複製了連結，想吃的店就按貼上").post()
    hide?.cancel()
    hide = Task {
        var left = UIAccessibility.isVoiceOverRunning ? 20.0 : 8.0
        while left > 0 {
            try? await Task.sleep(for: .milliseconds(100))
            if Task.isCancelled { return }
            // 訊息條在的時候膠囊藏著（FoodMapApp.swift:166），不倒數
            if !held && store.toast == nil { left -= 0.1 }
        }
        Perf.shared.mark("剪貼簿膠囊自己收起")
        dismiss()
    }
}
```

### 合4　U121、U120、U36

**位置**：Theme.swift:30-43

**問題**：U121 的行程膠囊和「導航用」要用 U120（第 8 批）加的 PressStyle(scale:pressed:)。但第 4 批的 U36 會先把 PressStyle 整段換成 PressBody 加 `dim` 參數；U120 的程式是照原本的 PressStyle 寫的整段替換，照抄會把 dim 和 PressBody 刪掉，U36 加的 `PressStyle(dim: true)`、`PressStyle(haptic: true, dim: true)`（GroupsTab.swift:169、:258、:277，Edit.swift:57）就編不過。U120 和 U121 的注意都沒提 U36。

**合併做法**：

做 U120 時不要整段照抄，改成兩邊合併，參數順序 haptic、scale、onPress、dim、pressed，U36、U120、U121 的呼叫全部都對得上：
```swift
struct PressStyle: ButtonStyle {
    var haptic = false
    var scale: CGFloat = 0.96          // U120：1＝自己不縮，交給外面一起縮
    var onPress: (() -> Void)? = nil
    var dim = false                    // U36：停用時變淡
    var pressed: Binding<Bool>? = nil  // U120：按住、放開都回報
    func makeBody(configuration: Configuration) -> some View {
        PressBody(c: configuration, haptic: haptic, scale: scale, onPress: onPress, dim: dim, pressed: pressed)
    }
    private struct PressBody: View {
        let c: ButtonStyleConfiguration
        let haptic: Bool, scale: CGFloat
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

### 合5　U121、U52

**位置**：MeTab.swift:46-62

**問題**：第 4 批的 U52 會在 MeTab.swift:61「導航用」Menu 的右大括號後面、:62 前面插入 Divider 和 NotifyRow。U121 要在這顆 Menu 上加 `.menuStyle(.button).buttonStyle(...)`，如果照「MeTab.swift:46-61」接在 box 內最後一個元素後面，會掛到 NotifyRow 上而不是 Menu。另外 NotifyRow 是同一個 box 裡等寬的整列，用的是 PressStyle()（縮 0.96），U121 卻建議導航用這列縮 0.98，同一個框裡上下兩列手感不一樣。

**合併做法**：

U121 的 modifier 直接接在 Menu 的右大括號（原本 :61）後面，在 U52 的 `Divider().padding(.leading, 58)` 之前：`} .menuStyle(.button).buttonStyle(PressStyle(haptic: true, scale: 0.98))`，label 在 :60 的 padding 後面補 .contentShape(.rect)。U52 的 NotifyRow 一起改成 `.buttonStyle(PressStyle(scale: 0.98))`，兩列縮的幅度一致。

### 合6　U131、U52

**位置**：FoodMapApp.swift:73-84

**問題**：U131 第 (3) 點讓通知小卡的雙指 Z 呼叫 `store.answerNotify(false)`，驗收 D 也寫「等於按先不要」。但第 4 批的 U52 會把 :76 點暗底改成 `store.snoozeNotify()`（3 天內不再跳、不寫 notifyAsked），理由就是「隨手關掉」不該算永久拒絕，只有按「先不要」才是。雙指 Z 是關掉的手勢，照 U131 寫會讓 VoiceOver 使用者一關就永久不再被問。

**合併做法**：

U131 第 (3) 點的 escape 改成 `.accessibilityAction(.escape) { store.snoozeNotify() }`，跟點暗底做一樣的事；暗底 :75-77 的 accessibilityHidden 加在 U52 改過的那串上就好。驗收 D 改成：「雙指 Z 跟點暗底一樣，小卡收起、3 天內不再自動跳，『我的』裡的通知列還能打開」。

### 合7　U124、U06、U122

**位置**：MapTab.swift:884-918、Theme.swift:109-130

**問題**：第 2 批的 U06 會先改 scopePill 和 SearchField：scopePill 多一個 compact 參數，打字時 ✕ 換成 `Color.clear.frame(width: 8)`；SearchField 的 lead 變成閉包，而且有 lead 時不放放大鏡。U124 第 (2) 點的理由「往右多出的 8pt 落在膠囊和放大鏡之間那 10pt」和驗收「放大鏡右邊點下去照樣能打字」在 U06 之後都不成立，膠囊右邊直接就是輸入框。U124 寫的是 ec71aa2 原樣的 scopePill，沒提 U06。

**合併做法**：

U124 照做，但 ✕ 的 36 寬加點擊區只改 U06 留下的非 compact 分支，compact 分支的 Color.clear(8) 不動；:885 的 spacing 4 兩種狀態共用。往右撐出的 8pt 還是在 SearchField 的 10pt 間距裡，不會蓋到輸入框。驗收改成「膠囊右緣外 10pt 以外點下去能開始打字；打字中（compact）膠囊不能有 ✕ 的點擊區」。U122 的 SearchField minHeight 改在 U06 重寫後的 SearchField 上，找 `.frame(height: 52)` 那行。

### 合8　U122、perf-round1b

**位置**：FoodMapApp.swift:16、Draw.swift:178-218、MapTab.swift:201-205（perf 4.A 預熱 .task）

**問題**：U122 的注意說有了 xxxLarge 上限，perf 4.A 的 🎲 可以「照原樣一起套」，這不對。4.A 在 DiceChip 用 `@ScaledMetric(relativeTo: .subheadline) var dice`，它讀 SwiftUI 環境，會被 U122 的上限夾住；但預熱清單用 `UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 15)`，讀的是系統字級，不受 SwiftUI 的 dynamicTypeSize 影響。系統開到輔助使用的大字時，預熱畫的是 AX 大小的 🎲，DiceChip 查的是 xxxLarge 大小，slot 的鑰匙對不上；`.onChange(of: dice)` 只在變動時補畫，第一次出現不會跑，所以 🎲 會一直退回 Text，4.A 在這些使用者身上沒有效果。

**合併做法**：

兩項都做的話，4.A 預熱清單那行改成用同一個上限算：
```swift
let cat = min(UIApplication.shared.preferredContentSizeCategory, .extraExtraExtraLarge)   // 跟 FoodMapApp 的 dynamicTypeSize 上限一致
list.append(("🎲", UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 15, compatibleWith: UITraitCollection(preferredContentSizeCategory: cat)), .dice))
```
U122 的上限如果之後改，這裡要一起改。perf 回歸測試的「最大字級 🎲 大小對」要在 AX5 下確認走的是圖（Console 有預熱完成、Inspector 看到 Image），不是只看大小。

### 合9　U123、U88

**位置**：PlaceDetail.swift:114-119

**問題**：第 7 批的 U88 會把照片右下的分類膠囊（:114-119）搬進 Stretchy 閉包，抽成 catChip(place)，還建議改放 .topTrailing。U123 第 (5) 點寫的「PlaceDetail.swift:115 的 .foregroundStyle(.white)」做完 U88 後在 catChip 裡，行號不對；U123 的注意沒提 U88。

**合併做法**：

U123 第 (5) 點改在 catChip(place) 裡那個 Text 的 `.foregroundStyle(.white)`，換成 `.foregroundStyle(place.cat.fg)`，白色描邊照留。U88 如果把膠囊改到 .topTrailing，驗收截圖的位置跟著改成右上。

### 合10　U84、U75、U100

**位置**：MapTab.swift:1902-1929

**問題**：U84 第 (3) 點說「NoAddressSheet 照 U75 的修法」，但 U75 只改資料來源（ids、onChange 自動關），它的第 (5) 點又說樣式「跟 U100、U84 一起做」，兩邊互相推。真正有 NoAddressSheet 新版畫面程式的是 U100 第 (3) 點。U75 和 U100 都整段重寫 NoAddressSheet 的 body，照各自寫法依序套，後套的會把先套的覆蓋掉。

**合併做法**：

NoAddressSheet 用 U100 (3) 的畫面，換上 U75 的資料來源和自動關閉，U84 這邊不用再改：
```swift
struct NoAddressSheet: View {
    let ids: [String]                       // U75
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var editing: Place?
    var body: some View {
        let list = ids.compactMap { store.place($0) }.filter { $0.lat == nil || $0.lng == nil }   // U75
        NavigationStack {
            ScrollView { /* U100 (3) 的 LazyVStack 整段 */ }
            .background(Color.bg)
            .navigationTitle("還沒有地址").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("完成") { dismiss() } }
            .sheet(item: $editing) { EditSheet(place: $0) }
            .onChange(of: editing == nil && list.isEmpty) { _, done in if done { dismiss() } }   // U75
        }
    }
}
```

### 合11　U131

**位置**：Draw.swift:383-413

**問題**：U131 第 (2) 點在 DrawStage 用 `if vo { ... }` 加關閉鈕，但只有第 (1) 點說要在 PinMenu 宣告 vo，DrawStage 沒有這個屬性，照寫編不過。

**合併做法**：

DrawStage 在 :389 的 reduce 下面也加 `@Environment(\.accessibilityVoiceOverEnabled) private var vo`。

### 合12　U104、U107、U122、U124、U102、U106、U09、U36

**位置**：batch10.md 各項「注意」

**問題**：有四處把別批的項目寫成「同一批」：U104 說「同一批 U102」，U102 在第 7 批；U107 說「同一批 U106」，U106 在第 9 批；U122 說「跟同批 U09」，U09 在第 2 批；U124 說「同一批的 U36」，U36 在第 4 批。照總表順序這幾項在做第 10 批時都已經進去了，寫成同一批會讓人以為要一起排。

**合併做法**：

把「同一批」改成實際的批次，並說明它們已先做：U09 的「清除篩選」鈕這時已在 titleRow，U122 直接找它的 frame(height: 36) 改 minHeight；U36 已移除 Draw.swift:357 的 opacity，U124 改 DiceChip 時照片段搜尋即可。

### 行號更正（acd4471）

- U122：MapTab.swift:1191「的 ScrollView 是 frame(height: 112)」（標 acd4471）。正確：MapTab.swift:1189 是 .frame(height: 112)；:1191 是 .task(id: scrolled)
- U107：Store.swift:598-599「刪收藏固定 sleep 4.2 秒」、Store.swift:598-607 的 Task（ec71aa2，此檔未改）。正確：Store.swift:599 是 Task {、:600 是 sleep 4.2 秒；整個 Task 是 Store.swift:599-608（:598 是復原 closure 的結尾）
- U107：Onboard.swift:107 的 withAnimation { showing = true }、:118 的 Perf「8 秒」文字。正確：Onboard.swift:108 是 withAnimation(...) { showing = true }（:107 是 Perf.mark）；「剪貼簿膠囊 8 秒收起」的 Perf.mark 在 Onboard.swift:117，:118 是 dismiss()
- U91：Store.swift:552「save 一開頭就同步寫回 places」。正確：Store.swift:548 `places[i] = p` 才是同步寫回；:552 是伺服器回來後 decode 再寫回的那段
- U84：MeTab.swift:345-352「的輸入框是 .roundedBorder」。正確：MeTab.swift:353 `.textFieldStyle(.roundedBorder).font(.body)`；345-352 是 VStack 和三個輸入框本身
- U131：TripPanel.swift:1091 的 .transition（ec71aa2）。正確：ec71aa2 的 .transition(.opacity) 在 :1092，換算後是 acd4471 TripPanel.swift:1103；ec71aa2 :1091 是 ZStack 的右大括號（acd4471 :1102）
- U131：Draw.swift:470「DrawCards 只能往下拖關」。正確：Draw.swift:469 的 .gesture(DragGesture()...onEnded {...})

## 各項

### U84（P3・畫面）規格共通原則沒有套到 16 項以外的畫面，還留著 iOS 預設樣式

**畫面**：自己填／編輯（EditSheet）、行程設定（TripForm）、登入 Email 表單、從收藏加入、還沒有地址清單

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：C5 的 AddSheet 用粉紅／薄荷切換，按自己填進 EditSheet 又變回系統分段控制器，字也不同（「去過了」和「✓ 去過」）。TripForm、PickSheet、NoAddressSheet 是系統灰底分組。按鈕是繼承 accent 的橘色系統文字鈕，不是藍色。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Edit.swift:131-135 的 EditSheet 狀態還是系統分段 Picker，字是「想去／去過了」；AddSheet（Edit.swift:38）用的是 StatusSwitch（PlaceDetail.swift:316）。TripsList.swift:267-283 的 TripForm 沒有 scrollContentBackground(.hidden)，是系統灰底分組。MeTab.swift:340-344 登入 Email 表單的登入／建立帳號是系統分段 Picker，:345-352 的輸入框是 .roundedBorder。PickSheet（GroupsTab.swift:496）、NoAddressSheet（MapTab.swift:1819）還是預設 List。這段期間 Edit.swift 只改了 AddSheet 的按鈕淡化（4a05adb），TripsList.swift 只改了 TripCard／TripThumb 的交通方式。

**修法**：

照順序做：
（1）Edit.swift:131-135 的 Picker 換成：
```swift
StatusSwitch(been: Binding(get: { place.status == "been" },
                           set: { b in place.status = b ? "been" : "want"; if !b { place.rating = nil } }).animation(.snappy))
    .listRowBackground(Color.clear)
    .listRowInsets(EdgeInsets())
```
StatusSwitch 吃的是 Bool，place.status 是字串，所以要包一層 Binding；取消去過時清 rating 的行為照舊。:136 的「好吃嗎？」那列不動。:175 已經有 .scrollContentBackground(.hidden).background(Color.bg)，不用再加。
（2）TripForm：在 TripsList.swift:283（Form 的結尾大括號）和 :284 的 .navigationTitle 中間加 `.scrollContentBackground(.hidden).background(Color.bg)`。原本說每個 Section 要加 listRowBackground(Color.panel) 才跟 EditSheet 一致，其實 EditSheet 也沒加；bc0bc20 鎖了淺色以後系統列底就是白色，跟 Color.panel 一樣，所以不用加。
（3）登入 Email 表單（MeTab.swift:340-352）：分段 Picker 換成兩顆 Chip(solid: true) 或仿 StatusSwitch 的兩格切換（中性色，不要用粉紅薄荷）；輸入框拿掉 .roundedBorder，改成 `.padding(.horizontal, 14).frame(height: 50).background(Color.panel, in: .rect(cornerRadius: 14))` 加一圈 Color.ink.opacity(0.1) 的邊，字維持 .body。PickSheet 照 U100、NoAddressSheet 照 U75 的修法。AddSheet 和 NewRoundSheet 的 PressStyle 漸層符合規格，不用改。

**模擬器驗收**：打開新增，按自己填，確認狀態是粉紅「♥ 想去」和薄荷「✓ 去過」的切換，切到去過會出現星星，切回想去星星清掉，存檔後店家頁顯示正確狀態。打開一間店按編輯，同樣檢查。打開我的行程按 ＋，確認是奶油底、白色分組。行程設定（從行程標題列進去）也是奶油底。登出後打開 Email 登入表單，確認登入／建立帳號切換和輸入框不是系統樣式。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。第 3 步的 PickSheet 和 NoAddressSheet 分別是 U100 和 U75，要跟那兩項一起做，不要重複改。U85 如果順便改 TripForm 的預設名稱（TripsList.swift:307），跟這項改的是同一個 struct 的不同行，不衝突。

### U91（P3・無障礙）星等對 VoiceOver 不會唸出目前幾顆星

**畫面**：店家頁「好吃嗎？」、新增／編輯視窗、行程吃完評分卡

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：五顆星是五個獨立按鈕，只有「N 顆星」標籤，沒有選取狀態也沒有整體的值。用在 Edit.swift:43、136，PlaceDetail.swift:137，TripGo.swift:119、145。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Stars 元件在 Edit.swift:226-273，五顆星各自是 Button，只有 `.accessibilityLabel("\(i) 顆星")`（Edit.swift:248），沒有整體的值、沒有選取狀態。用到的地方在 ec71aa2 是 Edit.swift:43、Edit.swift:140、PlaceDetail.swift:145、TripGo.swift:119、TripGo.swift:145（PlaceDetail 的行號從 137 移到 145）。這段在 a1b57b1 到 ec71aa2 之間沒改。

**修法**：

在 Stars 裡改一次。原本修法的第 (2) 點在新程式碼上不成立：TripGo 兩處傳的 value 永遠是 nil，回呼又是 `if let n { rate(n) }`，點了就送出、卡片收掉，所以 isSelected 永遠是 false，「點同一顆可取消」也是錯的提示。改成：
(1) Stars 加一個參數 `var oneShot = false`，TripGo.swift:119 和 145 傳 `oneShot: true`。
(2) Edit.swift:236 的 body 改成：
```swift
var body: some View {
    let v = lit ?? value ?? 0
    let pop = animated && !reduce
    let row = HStack(spacing: 0) { /* 原本 240-252 的 ForEach，只把 248 改成 */
        // .accessibilityLabel(oneShot ? "給 \(i) 顆星" : "\(i) 顆星")
    }
    .onAppear { shown = true }
    if oneShot {
        row.accessibilityElement(children: .contain).accessibilityLabel("好吃嗎")
    } else {
        row.accessibilityElement(children: .ignore)
            .accessibilityLabel("好吃程度")
            .accessibilityValue(value.map { "\($0) 顆星" } ?? "未評分")
            .accessibilityAdjustableAction { dir in
                let cur = value ?? 0
                let n: Int
                switch dir {
                case .increment: n = min(cur + 1, 5)
                case .decrement: n = max(cur - 1, 0)
                @unknown default: return
                }
                guard n != cur else { return }
                run?.cancel(); lit = nil
                Haptic.tick(); set(n == 0 ? nil : n)
            }
    }
}
```
調整時直接呼叫 set，不走逐顆亮的動畫。PlaceDetail 的 set 走 store.save，save 一開頭就同步寫回 places（Store.swift:552），所以 VoiceOver 唸新值不用等網路。

**模擬器驗收**：用 Accessibility Inspector 只檢查店家頁「好吃嗎？」那排：要是一個元素，標籤「好吃程度」、值「N 顆星」或「未評分」，有 adjustable 特徵；不要實際調整（會寫進收藏）。再開行程的吃完評分卡（TripGo），確認還是五個按鈕、標籤「給 N 顆星」，沒有「點同一顆可取消」的提示。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟同批其他項目也沒有共用程式碼。

### U104（P3・無障礙）滑卡疊卡對 VoiceOver 很亂；收藏頁 🎲 不管減少動態（部分已修，下面只寫剩下的）

**畫面**：滑卡頁卡片；收藏頁 🎲

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：三張疊卡都會被唸出來，最上面那張沒有按鈕特徵和提示，也沒有想吃／跳過的動作；點兩下多半還是能進店家頁。收藏頁 🎲 每次轉 720°，沒檢查 reduceMotion。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：收藏頁的 🎲 已經修好：640390a 把 ListTab 自己那顆 🎲 拿掉，改用共用的 DiceChip（ListTab.swift:41），而 DiceChip 有讀減少動態（Draw.swift:184），轉動是 `rotationEffect(.degrees(reduce ? 0 : Double(drawer.spin) * 720))`（Draw.swift:193）。滑卡的部分沒動：SwipeDeck.swift 這段 a1b57b1 到 ec71aa2 沒有 diff，card()（:53-77）裡 SwipeCard 沒有任何 accessibility 修飾，三張都會被唸；:73 只有 onTapGesture；:29 的 FlyingCard 也沒有 accessibilityHidden。

**修法**：

(1) SwipeDeck.swift:62 的 `SwipeCard(place: p)` 後面、印章 overlay（:64）前面先接 `.accessibilityElement(children: .combine)`，這樣「想吃！」「跳過」印章不會被併進去唸。
(2) 在 :73 `.onTapGesture { if top { onTap(p) } }` 後面加：
```swift
.accessibilityHidden(!top)
.accessibilityAddTraits(top ? .isButton : [])
.accessibilityHint(top ? "點兩下看店家" : "")
.accessibilityAction { if top { onTap(p) } }
.accessibilityAction(named: "想吃") { if top { fling(true) } }
.accessibilityAction(named: "跳過") { if top { fling(false) } }
```
比原本的修法多加一個不具名的 `.accessibilityAction`：原本「點兩下多半能進店家頁」是靠 onTapGesture 碰運氣，明寫預設動作才穩。fling() 本來就取 deck.first，從動作呼叫沒問題。
(3) SwipeDeck.swift:29 改成 `FlyingCard(f: f) { ... }.zIndex(10).allowsHitTesting(false).accessibilityHidden(true)`。
(4) 原本第 (3) 點（收藏頁 🎲 不管減少動態）已經做好，刪掉。

**模擬器驗收**：在滑卡頁開 Accessibility Inspector（或 VoiceOver）：只有最上面那張卡能被選到，唸得出店名、有「按鈕」和「點兩下看店家」，動作清單裡有「想吃」「跳過」；只檢查不要執行。後面兩張和飛走中的卡都選不到。收藏頁的部分：設定開「減少動態」後在收藏頁按「🎲 抽一間」，確認骰子不轉（已修，順便確認）。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批 U102 改 Draw.swift 的 DrawPanel，這裡已修的部分在 Draw.swift 的 DiceChip，不同 struct，不衝突。

### U107（P3・無障礙）訊息條和剪貼簿膠囊對 VoiceOver 使用者太快消失，「復原」來不及按

**畫面**：全域訊息條（刪除後的復原、加進行程等）、剪貼簿膠囊

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：toast 只停 2.6～6 秒，剪貼簿膠囊出現時沒有任何公告。只延長時間不夠：刪收藏固定 4.2 秒、刪行程 6.5 秒就真的刪，延長後的「復原」會變成按了沒用的假按鈕。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：5048a9e 加了 LaterDelete（Store.swift:982-1022），切到背景或下次打開會補送等著的刪除，但真正刪除仍是固定時間，跟訊息條沒有綁在一起：刪收藏 Store.swift:598-599 固定 sleep 4.2 秒；拿掉一站 Trip.swift:546-547 固定 4.2 秒；刪行程 Trip.swift:457-460 是 6.5 秒加上「按著訊息條就等」。訊息條本身會因為手指按著暫停（FoodMapApp.swift:145-152 的 toastHeld），Debug 的 slowToasts 也會停 20 秒，這時刪收藏、拿掉一站在 4.2 秒就已經送出，「復原」變成按了沒用。VoiceOver 時訊息條沒有延長（:146）。剪貼簿膠囊 show()（Onboard.swift:103-121）仍然沒有公告，固定 8 秒。

**修法**：

(1) 讓真正刪除跟著訊息條走。Store.swift 加：
```swift
// 訊息條收起或被新訊息取代時要做的事（例如真的送出刪除）；按了復原就不會做
@ObservationIgnored var toastCommit: (() -> Void)?
func commitToast() { let c = toastCommit; toastCommit = nil; c?() }
```
Store.swift:34 改成 `var toast: String? { didSet { if toast == nil { commitToast() } } }`（這個類別的 places 在 :22 已經用 didSet，@Observable 可以這樣寫）。say()（:429-432）加參數 `commit: (() -> Void)? = nil`，第一行改成 `commitToast(); toastCommit = commit`。
(2) 三個刪除把固定 sleep 換成 commit：刪收藏把 Store.swift:598-607 的 `Task { try? await Task.sleep(...) ... }` 搬進 say(... , commit: { [weak self] in guard let self, self.undoable.remove(p.id) != nil, self.loggedIn else { return }; Task { 原本 do/catch 和 LaterDelete.remove } })。刪行程 Trip.swift:457-470 同樣搬進 commit，守衛 `guard self.hiddenTrips.contains(t.id)`，:459-460 的 sleep 和等 toastHeld 的迴圈整段拿掉。拿掉一站 Trip.swift:546-556 同樣搬，守衛 `hiddenStops.contains(s.id)`。復原的 closure 原本就先把 id 從 undoable、hiddenTrips、hiddenStops 拿掉再設 toast = nil，所以之後觸發的 commit 會直接 return，不用另外清。
(3) LaterDelete.flush（Store.swift:1006）在切到背景時會設 `store.toast = nil`，改完後會觸發 commit 再送一次 DELETE；DELETE 重送沒有副作用，但想乾淨就在那行前面加 `store.toastCommit = nil`。signOut（Store.swift:418）開頭也加 `toastCommit = nil`，免得登出時觸發。
(4) 再延長：FoodMapApp.swift:146 改成 `var left: Double = Store.slowToasts ? 20 : (UIAccessibility.isVoiceOverRunning && act != nil) ? 15 : (store.toastSeconds ?? (act == nil ? 2.6 : store.toastTap != nil ? 5 : 4))`。有了 (1)，延長或手指按著多久，復原都是真的。
(5) 剪貼簿：Onboard.swift:107 的 `withAnimation { showing = true }` 後面加 `AccessibilityNotification.Announcement("剛複製了連結，想吃的店就按貼上").post()`；:111 改成 `var left = UIAccessibility.isVoiceOverRunning ? 20.0 : 8.0`，:118 的 Perf 文字一起改掉「8 秒」。另外膠囊在有訊息條時是藏著的（FoodMapApp.swift:166 的 `store.toast == nil`），但倒數照跑，VoiceOver 下訊息條停 15 秒就會把膠囊的時間吃掉；:115 的條件建議改成 `if !held && Store.shared?.toast == nil`（或由 Root 傳進來），訊息條在時不倒數。
(6) Onboard.swift:209-211 和 FoodMapApp.swift:154-156 用 DragGesture(minimumDistance: 0) 判斷按著，onEnded 偶爾收不到會卡住；有了 commit 之後卡住的後果只是訊息條不收，不會誤刪，可以先不動，但 show()（:106）和 say()（:430）每次都會重設 held，算是有保底。

**模擬器驗收**：開 VoiceOver，在測試帳號刪一間暫存店：訊息條要唸出來而且停約 15 秒；第 10 秒按「復原」，店回到原位，Perf 浮層或 Supabase log 看不到這筆 DELETE。再刪一次、不按復原，等訊息條收起後才送出 DELETE。關掉 VoiceOver 測：刪 A 後馬上刪 B，A 在 B 的訊息條出來時就送出；按住訊息條 10 秒再放開按復原，店也回得來。行程和拿掉一站各做一次。複製一個網址再切回 App，VoiceOver 要唸「剛複製了連結」，膠囊停約 20 秒。過程中不要把 App 切到背景，那會走 LaterDelete 直接送出。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊（那份不碰訊息條、Trip.swift 的刪除）。要注意 TripPanel.swift:502、:757、:1611 和 TripsList.swift:65、MapTab.swift:368 都會呼叫這兩個 deleteWithUndo，改的是函式內部，呼叫端不用動。剪貼簿的規格變更（任何網址都問、三次 ✕ 兩週不問）不受影響：自己收起本來就不算 ✕（Onboard.swift:123-134）。同一批 U106 提到的 DragGesture(minimumDistance: 0) 問題跟這裡的 held 是同一組，見 (6)。

### U121（P3・滑順）用 Menu 做的按鈕按下時沒有縮放和輕震（部分已修，下面只寫剩下的）

**畫面**：群組分頁右上＋、店家頁 ⋯、行程膠囊與「第 N 天」、行程起點膠囊、我的→導航用

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：這些 Menu 沒套 buttonStyle，和收藏頁的 AddButton、店家頁返回鈕手感不一致；群組＋和收藏＋長得一樣，一個會縮、一個不會。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：行程起點膠囊已經在 5048a9e 改成一般 Button 加 confirmationDialog，TripPanel.swift:354-365 已套 PressStyle(haptic: true)，這一顆解決了。其他幾顆還是沒套 buttonStyle 的 Menu：群組分頁＋在 GroupsTab.swift:22-31，店家頁 ⋯ 在 PlaceDetail.swift:79-88，行程膠囊在 TripTop.swift:110-135（Menu 的 label 只有底下那條 Capsule，名字和摘要是疊在上面、allowsHitTesting(false) 的 HStack），第 N 天在 TripTop.swift:138-161，我的頁導航用在 MeTab.swift:46-61（MeTab.swift 沒改過）。4a05adb 另外多了兩顆 toolbar 裡的 ⋯ Menu（GroupsTab.swift:351-355、:607-610），一樣沒有按壓手感。

**修法**：

(1) 先在實機改群組＋一顆驗證：GroupsTab.swift:31 的 .accessibilityLabel 前面加 `.menuStyle(.button).buttonStyle(PressStyle(haptic: true))`，確認按住時會縮、會震，選單動畫正常。label 已經有 frame(minWidth: 44, minHeight: 44).contentShape(.rect)，不用再補。
(2) 沒問題再套到：PlaceDetail.swift:87 的 ⋯ Menu、TripTop.swift:159 的第 N 天 Menu（在 .fixedSize() 前面加）、MeTab.swift:46-61 的導航用（label 在 :60 的 padding 後面要補 .contentShape(.rect)，整行才都按得到；整行寬度縮 0.96 會很明顯，建議用 U120 加的參數寫 PressStyle(haptic: true, scale: 0.98)）。U118 做完後群組頁、滑卡頁的 ⋯ 會在 PageHeader 裡，也一起套。
(3) TripTop 行程膠囊不要照原本寫的「把文字 HStack 搬進 Menu 的 label」：那個 HStack 裡有第 N 天這個 Menu，Menu 不能放進另一個 Menu 的 label；把第 N 天留在外面的話，按住時膠囊縮、第 N 天不縮，又變成 U120 那種兩層。改用 U120 加的 pressed 綁定，結構不用動。TripTop 加 `@State private var capDown = false`，TripTop.swift:112-116 的 Menu 加 `.menuStyle(.button).buttonStyle(PressStyle(haptic: true, scale: 1, pressed: $capDown))`，:134 的 .frame(maxWidth: .infinity) 後面接：
```swift
.scaleEffect(capDown ? 0.96 : 1)
.animation(capDown ? .easeOut(duration: 0.08) : .spring(response: 0.25, dampingFraction: 0.7), value: capDown)
```
這樣按膠囊時底、名字、摘要、第 N 天一起縮；按第 N 天時只有它自己用 PressStyle 縮。
(4) 起點膠囊已完成，不用做。
(5) isPressed 對 Menu 沒反應時的退路：第一條是在 label 上用 @GestureState 加 simultaneousGesture(DragGesture(minimumDistance: 0)) 自己縮，但要確認這個手勢不會吃掉開選單的點擊；第二條是照 5048a9e 起點膠囊的做法，改成一般 Button 加 confirmationDialog（群組＋也可以改成真的 AddButton）。

**模擬器驗收**：依序按住群組分頁右上的＋、店家頁 ⋯、群組頁和滑卡頁的 ⋯（U118 做完後）、行程膠囊、第 N 天、我的頁「導航用」：按住時就縮並輕震，放開才開選單，選單動畫和位置正常。行程膠囊按住時名字、摘要、第 N 天要一起縮；按住第 N 天只有它縮。選單開著時點外面關掉，按鈕要彈回原大小、不卡在縮小狀態。起點膠囊確認一次按住會縮會震、按著往下拉面板會跟著走（5048a9e 的行為不能被改壞）。

**注意**：依賴 U120：TripTop 膠囊和 MeTab 的 scale 0.98 都要用 U120 加的 PressStyle(scale:pressed:)，U120 要先做。跟 U118 重疊：群組頁、滑卡頁的 ⋯ 會搬進 PageHeader，這兩顆的按壓手感在 U118 之後套。跟 fix-addcard-ec71aa2.md 沒有重疊（TripTop.swift 不在那份裡）。

### U122（P3・無障礙）動態字體沒有上限，固定高度的膠囊、搜尋框、卡片在大字時會爆框

**畫面**：全 App（字級調大或輔助使用的更大字體）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：約一半字體會跟著放大，卻塞在固定高度的框裡：Chip、DiceChip 是 36、SearchField 是 52、MapCard 是 270×104。整個 App 沒有 dynamicTypeSize 上限。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：ec71aa2 到 acd4471 只改了 MapTab.swift 和 TripPanel.swift，這項引用的其他檔案行號都沒變。FoodMapApp.swift:16 還是 Root().environment(store).tint(.accent)，整個 FoodMap 資料夾搜不到 dynamicTypeSize。固定高度都還在：Chip 在 Theme.swift:55 frame(height: 36)，DiceChip 在 Draw.swift:198，SearchField 在 Theme.swift:127 frame(height: 52)，行程搜尋框 TripTop.swift:284 frame(height: 52)，MapCard 在 MapTab.swift:1895 frame(width: 270, height: 104)，會跟著放大的 caption 在 :1880-1881。地圖搜尋框左邊的 scopePill 在 MapTab.swift:898、:915，固定 36。篩選列變高時更新地圖 inset 已經在 MapTab.swift:283-288 用 onGeometryChange 處理。另外原本列的看影片膠囊 PlaceDetail.swift:106 用的是 .system(size: 15) 固定字級，不會跟著放大，不需要改。

**修法**：

(1) FoodMapApp.swift:16 改成：
```swift
Root().environment(store).tint(.accent).dynamicTypeSize(...DynamicTypeSize.xxxLarge)
```
LoginView 是 Root 裡的分支（FoodMapApp.swift:105），訊息條、剪貼簿膠囊、PerfHUD 也掛在 Root 上，全部涵蓋。這是環境值，Root 底下開的 sheet 和 fullScreenCover 會繼承，逐一打開確認，沒繼承的才在它的根 view 補同一行。系統的 alert、confirmationDialog、Menu 是 UIKit 畫的，不受這個上限影響，這是預期的。
(2) 有了 xxxLarge 上限，subheadline 最大約 21pt、body 約 23pt，36 和 52 的框其實塞得下，下面改成 minHeight 只是保險：
- Theme.swift:55 Chip：`.padding(.horizontal, 14).frame(height: 36)` 改成 `.padding(.horizontal, 14).frame(minHeight: 36)`。
- Draw.swift:198 DiceChip：`.padding(.horizontal, 14).frame(height: 36)` 改成 `.padding(.horizontal, 14).frame(minHeight: 36)`。
- Theme.swift:127 SearchField：`.frame(height: 52)` 改成 `.frame(minHeight: 52)`。
- TripTop.swift:284 行程搜尋框：`.frame(height: 52)` 改成 `.frame(minHeight: 52)`。
PlaceDetail.swift:106 看影片膠囊不用改，字是固定 15pt。地圖搜尋框左邊的 scopePill（MapTab.swift:898、:915）維持固定 36，不要改，理由見 U124。
(3) MapCard（MapTab.swift:1895）先不改高度：店名是固定 16pt、Badge 是固定 22 高，會變大的只有 :1880-1881 那行 caption，上限內估計剛好塞得下；而且這排卡片的高度跟地圖面板的版面綁在一起（:1191 的 ScrollView 是 frame(height: 112)），卡片變高會牽動面板。先看截圖，有裁字再在 :1881 的 `.lineLimit(1)` 後面加 `.minimumScaleFactor(0.85)`，還不夠才把 :1895 改成 `.frame(width: 270).frame(minHeight: 104)`，同時要一起調 :1191 的 112。
(4) 地圖 inset 已經由 MapTab.swift:283-288 處理，不用另外做，截圖時確認圖釘沒有被變高的篩選列蓋住就好。

**模擬器驗收**：模擬器的「更大字體」分別開到 xxxLarge 和 AX5（最大），兩種截圖要長得一樣，證明上限有效。截地圖首頁（搜尋列、篩選列、附近卡片列）、收藏頁（含抽一間膠囊）、群組卡、店家頁、行程搜尋框、登入頁、抽一間設定面板（sheet），確認沒有裁字、膠囊沒有爆框，地圖上方的圖釘沒有被篩選列蓋住。另外在 AX5 下打開加站卡和群組的「從收藏加入」sheet，確認 sheet 也有繼承上限。

**注意**：跟 U124：scopePill 要維持固定 36（A1 指定的外觀），這項不要把它改成 minHeight，上限內 subheadline 21pt 塞得進 36。跟 U123：兩項都改 Theme.swift 的 Chip，這項改 :55 的高度，U123 改 :58 的字色，不衝突。跟 perf-round1b.md：3.1 改的是 Draw.swift:127-132 的日期快取，跟 :198 不同區塊；4.A（看實驗結果才做）會在 DiceChip 加 `@ScaledMetric(relativeTo: .subheadline) var dice` 並換掉 :193 的 🎲，也不碰 :198，而且有了這裡的上限，ScaledMetric 也只會放大到 xxxLarge，emoji 圖預先畫的倍率不用再加大，兩邊可以照原樣一起套。fix-v11-acd4471.md 只改 TripPanel 和 ListPullDown，不重疊。跟同批 U09：U09 在 titleRow 新加的「清除篩選」鈕也是 frame(height: 36)，兩項一起做時可以順手改成 minHeight。跟 U100：SearchField 改 minHeight 會一起套到 PickSheet 新加的搜尋框，沒有衝突。

### U123（P3・無障礙）薄荷綠、金黃底配白字對比太低

**畫面**：收藏卡「✓ 去過」、配對膠囊、店家頁分類膠囊、選中的 chip

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：sprMint 配白字約 1.9:1，bakery／brunch 約 2.1:1，Badge 字又只有 11.5pt，陽光下讀不出來。小吃分類也是 sprMint。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Theme.swift 沒改過：Badge 在 Theme.swift:71-75，去過時 sprMint 底配白字、字 11.5pt。Models.swift:47-50 分類顏色沒變，小吃還是 sprMint（0x2ed3a0，白字約 1.9:1），麵包 0xe8a200 約 2.2:1，早午餐 0xf5a300 約 2.1:1。配對膠囊仍是 sprMint 底白字：GroupsTab.swift:186-188、:400、:665-667。店家頁分類膠囊在 PlaceDetail.swift:115-116（白字疊 place.cat.color）。a1b57b1 的 Draw.swift:278 那顆「去過、4 星以上」現在在 Draw.swift:294，經由 :371-373 的 chip() 走共用的 Chip，選中時字色是 Theme.swift:58 的 .white。StatusSwitch 的去過段在 PlaceDetail.swift:329 和 :352，選中時一樣白字。

**修法**：

Cat.all 和圖釘、糖粒、照片漸層的顏色都不動，只改「白字疊在亮底上」的地方，字改 Color.ink（對亮底約 7.7～8.8:1）。
(1) Models.swift 的 Cat（:40-55）加一個字色：
```swift
// 選中時疊在分類色上的字：亮色底（麵包、小吃、早午餐、飲料）用深色字，其他用白字
var fg: Color { ["bakery", "snack", "brunch", "drink"].contains(key) ? .ink : .white }
```
飲料 0x1fbf8f 白字也只有約 2.4:1，原本漏了，一起加。
(2) Theme.swift 的 Chip（:46-65）加 `var onFg: Color = .white`，:58 改成 `.foregroundStyle(on ? onFg : solid ? color.mix(with: .black, by: 0.3) : color)`。FilterChips 的 :91「✓ 去過」加 `onFg: .ink`，:94 加 `onFg: c.fg`。Draw.swift:371 的 chip() 加一個 `onFg: Color = .white` 參數傳給 Chip，:286 傳 `onFg: c.fg`，:294 傳 `onFg: .ink`。
(3) Badge：Theme.swift:72 字改 12.5，:75 改成 `.foregroundStyle(place.been ? Color.ink : Color.sprPink)`。
(4) 配對膠囊：GroupsTab.swift:186、:400、:665 的 `.foregroundStyle(.white)` 改成 `.foregroundStyle(Color.ink)`。
(5) 店家頁分類膠囊：PlaceDetail.swift:115 的 `.foregroundStyle(.white)` 改成 `.foregroundStyle(place.cat.fg)`，白色描邊留著。
(6) StatusSwitch：PlaceDetail.swift:352 改成 `.foregroundStyle(on ? (v ? Color.ink : .white) : Color.ink.opacity(0.45))`。16pt heavy 不算大字，要 4.5:1。
(7) 順便（原本沒列到，可另排）：沒選中的 Chip 字色也很淡。非 solid 的（收藏頁篩選列、抽一間面板）是原色字疊 13% 同色底，薄荷綠約 1.7:1、麵包約 1.9:1，比選中的更差；solid 的 mix 0.3 對白底薄荷綠約 3.8:1。兩種都改成 `color.mix(with: .black, by: 0.45)` 約 5:1 起跳。SwiftUI 的 mix 預設用感知色彩空間，實際數字以 Accessibility Inspector 量的為準。
另外提醒兩件不在這項範圍的事：「♥ 想去」的粉紅字對白底約 3.1:1、StatusSwitch 想去段粉紅底白字也一樣，那是品牌色的決定；MapTab.swift:1802-1803 群組地圖上「誰收的」膠囊是白字疊 Avatar 顏色，其中 0xfab005、0x20c997 這幾色也偏低。

**模擬器驗收**：截收藏卡「✓ 去過 4★」、地圖附近卡的 Badge、群組卡「配對 N 間」、群組頁滑卡列的配對膠囊、配對結果頁「配對成功」、小吃和麵包、早午餐、飲料分類的店家頁（照片右下分類膠囊）、店家頁去過段選中、地圖和收藏頁選中小吃／去過的篩選籤、抽一間面板選中「去過、4 星以上」。用 Accessibility Inspector 的對比檢查確認都 ≥4.5:1，圖釘和照片漸層顏色沒變。

**注意**：跟 U122：兩項都改 Theme.swift 的 Chip（U122 改 :55 高度，這項改 :58 字色）和 Badge 附近，行不重疊。跟 U118：U118 會改 RoundView 的頂列，不碰 :665-667 的配對成功膠囊，不衝突。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U124（P3・無障礙）幾顆按鈕的觸控區小於 44pt

**畫面**：地圖搜尋列的群組膠囊、收藏頁與地圖面板的抽一間齒輪、行程面板起點列與交通方式膠囊

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：scopePill 的 ✕ 只有 32×36，又緊貼換群組那一塊，容易點錯。收藏頁齒輪（C3 新加）和 DiceChip 齒輪（build 20 就是）是 40×44。行程起點列 minHeight 40，交通方式膠囊寬 38。

**行號**：acd4471（見 行號對照.md 的「acd4471 → a10704d」）

**現況**：這幾處在 ec71aa2 到 acd4471 之間都沒動到。scopePill 在 MapTab.swift:884-918：主鈕 label 是 :898 `.frame(height: 36).contentShape(.rect)`，✕ 是 :906 `.frame(width: 32, height: 36).contentShape(.rect)`，兩顆之間 :885 `HStack(spacing: 2)`，外層 :915 `.frame(height: 36)`。scopePill 是當 lead 放進 SearchField（Theme.swift:116-127，HStack spacing 10、高 52），沒有 clipShape。DiceChip 齒輪在 Draw.swift:213 `.frame(width: 40, height: 44)`，外層 :187 `HStack(spacing: 6)`，地圖（MapTab.swift:1263、:1423）和收藏頁（ListTab.swift:41）共用這顆。行程起點列 TripPanel.swift:366 還是 `.frame(minHeight: 40)`。交通方式膠囊在 LegRow（TripPanel.swift:1640 起）：:1657 `HStack(spacing: 6)`、:1662 `.frame(width: 38, height: 28)`、:1665 `.frame(minHeight: 40)`；對齊號碼的虛線 :1653 高 40；「🚇 開地圖看」:1681 也是 minHeight 40。

**修法**：

(1) scopePill 主鈕（MapTab.swift:898）外觀維持 A1 指定的 36pt，只把點擊區上下各撐 4pt。原本寫的 contentShape(.rect.inset(by: -4)) 有問題：inset 是四邊一起撐，左右也多 4pt，主鈕和 ✕ 的點擊區會蓋過中間的間距。:898 改成：
```swift
                .frame(height: 36)
                .padding(.vertical, 4).contentShape(.rect).padding(.vertical, -4)   // 點擊區上下各多 4pt＝44，排版和外觀還是 36
```
(2) ✕（MapTab.swift:906）改成：
```swift
                    .frame(width: 36, height: 36)
                    .padding(.vertical, 4).padding(.trailing, 8).contentShape(.rect).padding(.vertical, -4).padding(.trailing, -8)
```
點擊區變成 44×44，往右多出的 8pt 落在 SearchField 裡膠囊和放大鏡之間那 10pt 的間距（Theme.swift:116），不會蓋到主鈕。:885 的 `HStack(spacing: 2)` 改成 `HStack(spacing: 4)`，當作兩顆之間不可點的間距。✕ 只加寬 4pt 不是 40：375 寬、群組模式下搜尋框裡的輸入區已經很窄，膠囊不要再多佔。不要直接寫 minHeight 44，會跟 :915 外層的 frame(height: 36) 衝突。
(3) DiceChip 齒輪：Draw.swift:213 改成 `.frame(width: 44, height: 44).contentShape(.rect)`，同時把 :187 的 `HStack(spacing: 6)` 改成 `HStack(spacing: 4)`，看得到的間距維持 8pt，整顆只多 2pt。地圖面板和收藏頁一次修好。（Draw.swift:237「抽過」那排小照片也是 40×44，不在這項範圍，要一起改就照同樣寫法。）
(4) 行程起點列：TripPanel.swift:366 改成 `.frame(minHeight: 44).contentShape(.rect)`。面板高度是 heights()（TripPanel.swift:204-208）算死的，頂列多 4pt 只會讓下面清單少 4pt，不影響停段。
(5) 交通方式膠囊：TripPanel.swift:1665 改成 `.frame(minWidth: 44, minHeight: 44).contentShape(.rect)`，外觀 :1662 的 38×28 不動；:1657 的 `HStack(spacing: 6)` 改成 `HStack(spacing: 0)`，三顆之間看得到的間距還是 6pt，整組從 126 變 132。:1653 對齊號碼的虛線 `Rectangle().fill(.clear).frame(width: 30, height: 40)` 高度改成 44，不然虛線上下會斷 2pt。:1681「🚇 開地圖看」改成 `.frame(minHeight: 44).contentShape(.rect)`。站列的位置是量出來的（TripPanel.swift:521 寫進 mode.geo.rows），LegRow 變高不用改拖曳換順序的算法。

**模擬器驗收**：用 Xcode View Debugger 量 scopePill 主鈕和 ✕、DiceChip 齒輪、起點列、交通方式三顆、「開地圖看」的點擊區都 ≥44pt，並確認 scopePill 看起來仍是 36pt 高。實際點：scopePill 上緣外 3pt 點下去要打開換群組；主鈕和 ✕ 中間那 4pt 點了沒反應；✕ 右邊外側 5pt 點下去要回到我的收藏；放大鏡右邊點下去照樣能打字。375 寬（iPhone SE）群組模式下搜尋框還能打字、placeholder 沒被擠掉。地圖面板和收藏頁的 🎲 和齒輪間距看起來跟改前一樣。行程面板：起點列點得開選單；交通方式三顆都點得到、虛線沒有斷；375 寬時「🚶 走路 1 小時 30 分」這種長字和三顆膠囊排得下；拖站卡換順序照舊（如果 RowHold 已經套了，用 fix-v11 的 V11c 驗）。

**注意**：fix-addcard-ec71aa2.md 已經做進 acd4471，不用再管。跟 fix-v11-acd4471.md（RowHold）沒有邏輯衝突：RowHold 改 TripPanel.swift:158、:508-517、:540-556、:1493、:1535，這項改 TripPanel.swift:366 和 LegRow（:1653-1681），LegRow 不是 StopCard，不受 RowHold 影響；但先套 RowHold 的話 LegRow 的行號會往後移幾行，請照程式片段搜尋。RowHold 的 began 還是用 mode.geo.rows 算拿起的高度，列變高不影響。跟 perf-round1b.md 有同一個 struct 要合：它在 DiceChip 加 `@ScaledMetric … dice`（Draw.swift:178 附近）、:190 前加「抽一間：骰子」的 mark、把 :193 換成 emoji 圖、:218 後加 onChange，這項改的是同一個 DiceChip 的 :187 spacing 和 :213 齒輪 frame，行不重疊，但先套 perf 的話 :187、:213 會往後移，照片段搜尋。U122 那邊已經講好 scopePill 維持固定 36、不改 minHeight。同一批的 U36 也改 Draw.swift（:357，DrawPanel 的按鈕）和 TripPanel.swift（:307、:314），跟這裡的行不重疊。

### U125（P3・畫面）切到「我的」時大標題位置跳約 4pt（部分已修，下面只寫剩下的）

**畫面**：分頁列在收藏／群組和我的之間切換

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：收藏和群組的標題和 42～44pt 的按鈕在同一個 HStack，行高 44；「我的」只有一個 Text，約 36pt 高，標題中心高了約 4pt。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：ListTab.swift:28-36 在 640390a／4a05adb 改成「標題＋下面一行 N 間」的 VStack，整個標題區約 58pt 高，比 44pt 的按鈕還高，所以標題頂端直接貼在 padding(.top, 8) 那裡，跟 MeTab.swift:23 的「我的」（Text 自己 padding(.top, 8)）同高。GroupsTab.swift:18-19 沒改，標題（約 36pt）還是在 44pt 高的 HStack 裡置中，頂端多了約 4pt。也就是說，收藏和我的之間已經不跳了，現在變成群組這頁比另外兩頁低約 4pt，從收藏切到群組、從群組切到我的都會跳。MeTab.swift:22 的 VStack spacing 仍是 16，另外兩頁是 14。

**修法**：

原本的修法（MeTab.swift:23 加 frame(minHeight: 44)）在 ec71aa2 上不要套：那樣會讓「我的」往下 4pt，變成跟收藏頁對不齊，等於把跳動搬到收藏和我的之間。改成動群組頁：GroupsTab.swift:18 的 `HStack {` 改成 `HStack(alignment: .top) {`，讓「群組」標題頂端也貼在 8pt，跟收藏、我的一樣。＋鈕會跟著上移約 4pt，和標題頂端對齊，看起來沒問題。可選：ListTab.swift:28 也改成 `HStack(alignment: .top, spacing: 8)`，這樣收藏頁的抽一間和＋鈕也貼頂，三頁右上角按鈕的位置會一致（現在收藏頁按鈕因為標題區 58pt 置中，比群組頁低約 7pt）。MeTab.swift:22 的 spacing 16 改 14 只影響標題以下的內容，順手一致即可，不影響這個問題。共用 PageHeader 仍是可選的重構。

**模擬器驗收**：同一台模擬器、同一個捲動位置（最上面），收藏、群組、我的三頁各截一張，三張疊在一起比對：三個大標題的頂端要在同一條線上（差 1pt 以內）。改之前先截一組當對照，應該只看到群組那張低約 4pt；如果實際量到收藏頁也不同高，代表字型行高跟估的不一樣，以截圖為準再調。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟同批其他項目也沒有重疊。

### U131（P3・無障礙）自訂的暗底浮層對 VoiceOver 不是對話框，雙指 Z 關不掉

**畫面**：VoiceOver 開著：PinMenu、抽 3 間／轉盤、通知小卡、全部到完

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：這些浮層靠沒有標籤的暗底 onTapGesture 關閉，沒有 isModal；全專案都沒有 escape 動作，焦點會跑到後面的地圖。PinMenu 卡片本身也沒有關閉鈕，最該先修。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：全專案只有 Coach.swift:175 有 isModal，沒有任何 accessibilityAction(.escape)。PinMenu.swift 沒改：PinMenu.swift:27-31 的暗底只有 onTapGesture，卡片（:59-80）只有加進行程、導航、看店家三列，沒有關閉。VoiceOver 可以從 MapTab.swift:1612 的自訂動作「加進行程、導航」打開它。DrawStage 在 Draw.swift:383-413（行號從 359 移過來，內容沒變），暗底在 :394-396，DrawCards 只能往下拖關（:470），DrawWheel（:609 起）沒有關閉。通知小卡的暗底在 FoodMapApp.swift:73-79，卡片在 :80-84。DoneCard 的暗底和卡片在 TripPanel.swift:1081-1091。

**修法**：

原本的修法要修正一點：PinMenu.swift:21 和 Draw.swift:392 的外層 ZStack 是一直掛在畫面上的（選單沒開時只是空的），isModal 不能加在外層，不然選單關著時也可能把 VoiceOver 困住。要加在 `if let` 裡面、只有開著時才存在的那一層。
(1) PinMenu：PinMenu.swift:27-31 的暗底加 `.accessibilityHidden(true)`，:32-36 的 MenuPin 也加 `.accessibilityHidden(true)`。:37 的 card(p) 後面加 `.accessibilityElement(children: .contain).accessibilityAddTraits(.isModal).accessibilityAction(.escape) { close() }.onAppear { AccessibilityNotification.ScreenChanged(nil).post() }`（焦點會落在第一個元素，也就是店名）。不要把三個子view包成新的 ZStack，那會讓它們各自的 transition 失效。加 `@Environment(\.accessibilityVoiceOverEnabled) private var vo`，card 裡 :75 看店家那列後面加 `if vo { Divider().padding(.leading, 52); row("xmark", "取消", tint: .ink) { close() } }`。注意 :15 的 `h` 是寫死的 214，拿來算卡片放上面還是下面（:24、:26），多一列後要改成計算屬性 `vo ? 263 : 214`，不然卡片會超出畫面。
(2) DrawStage：Draw.swift:394-396 的暗底加 `.accessibilityHidden(true)`。:397-404 的 Group 後面、:405 的 .id 前面加 `.accessibilityElement(children: .contain).accessibilityAddTraits(.isModal).accessibilityAction(.escape) { close() }`，再加 `.overlay(alignment: .topTrailing) { if vo { Button { close() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("關閉") } }`，讓 VoiceOver 有看得到的關閉鈕（抽 3 間和轉盤本來都沒有）。出現時一樣發 ScreenChanged。
(3) 通知小卡：FoodMapApp.swift:75-77 的暗底加 `.accessibilityHidden(true)`；:82 的 NotifyCard() 加 `.accessibilityElement(children: .contain).accessibilityAddTraits(.isModal).accessibilityAction(.escape) { store.answerNotify(false) }`。
(4) DoneCard：TripPanel.swift:1082 的暗底加 `.accessibilityHidden(true)`；:1081 的 ZStack 在 :1091 的 .transition 前加 `.accessibilityElement(children: .contain).accessibilityAddTraits(.isModal).accessibilityAction(.escape) { if let id = rate { TripAsked.add(id) }; endGo() }`，跟「好」按鈕做的事一樣。
(5) 順序建議：先 PinMenu 和 DrawStage（沒有關閉鈕的），再補通知小卡和 DoneCard。

**模擬器驗收**：開 VoiceOver（模擬器用 Accessibility Inspector 或實機）。A：在收藏圖釘上用轉輪選「加進行程、導航」打開 PinMenu：焦點要落在店名，往右滑只會在選單裡打轉、不會跑到後面的地圖；最後一個是「取消」；雙指 Z 手勢關得掉。B：VoiceOver 關掉時長按圖釘，選單樣子跟 ec71aa2 一樣、沒有多出取消列，貼近畫面下緣的圖釘選單位置也正確；VoiceOver 開著時，貼近下緣的圖釘選單不能超出畫面。C：抽 3 間和轉盤各開一次，焦點不跑出去、右上有「關閉」、雙指 Z 關得掉。D：通知小卡用雙指 Z 等於按「先不要」。E：行程出發走完，DoneCard 雙指 Z 等於按「好」。F：選單都關掉之後，VoiceOver 要能正常移到地圖和面板上的元素（確認沒有把 isModal 掛在常駐的外層）。

**注意**：跟 fix-addcard-ec71aa2.md 沒有直接衝突：fix-addcard 不改 PinMenu.swift，但它的驗收第 6 項（長按圖釘選「加進行程」要出卡）和第 8 項（VoiceOver 在行程模式點圖釘）會經過 PinMenu，改完這項後要重跑那兩項。跟 U128 重疊在 TripPanel.swift 的 DoneCard ZStack：escape 要跟 close 一致（TripAsked.add 加 endGo），兩項一起改。fix-addcard 的 (a) 也改 TripPanel.swift，行號會移動，請以 goMods() 裡的 `if finished` 區塊找位置。
