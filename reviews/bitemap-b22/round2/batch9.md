# 第 2 輪第 9 批　P3：新增與分享、第一次使用、收藏頁、我的

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 17 項：U49 Email 表單在鍵盤出來時放不下，按 return 不會跳下一欄、U87 「沒找到」卡只能用同一段文字重試，提示叫人加上地區卻沒地方改、U92 手動新增成功只有震動，沒有訊息條也沒有亮框，之後才在奇怪時機亮、U93 分享選單卡片是系統毛玻璃加系統色，不是糖霜風格、U94 長按卡片的預覽可能露出方角或底色、U95 已經在收藏頁時再點「收藏」，不會捲回頂部、U96 通知小卡的說明文字被「已收藏」訊息條蓋住、U105 全新安裝時登入頁只有 Email，Apple／Google 晚一拍才冒出來把版面推開、U106 手指在滑輪播時自動換頁會搶走手勢；第 3 格回第 1 格會倒捲、U108 「我的」個人卡片直接顯示 Apple 隱藏信箱的亂碼地址、U110 按下刪除帳號後沒有進行中的提示，可以重複按、U111 展開「進階」後內容長在畫面下面，看起來像沒反應、U112 教學文案和實際行為對不上：「按＋新增一間」打開的是 IG 教學；「4 步」其實是 2～4 步；「略過」太小太淡、U115 「找店中」卡的光掃動畫在收藏頁藏著時也一直重畫（程式衛生）、U126 新增視窗只要剪貼簿有任何網址就不叫鍵盤，連很久以前複製的也一樣、U130 存檔時地址查不到位置也沒提示，店默默不在地圖上或停在舊位置、U133 收藏頁下拉更新：甜甜圈擠在標題下的窄縫，VoiceOver 也無法更新（有爭議）

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是逐批檢查時找到的：同一批或跨批有兩項以上改到同一段程式、照字面依序套會打架的地方，以及跟 V11、perf-round1b 重疊的地方。這一節的行號是 acd4471 的。
各項內文的寫法跟這裡衝突時照這裡。

### 合1　U106、U49、U19（第 5 批）

**位置**：Onboard.swift:222-258（LoginCarousel 整個 struct）

**問題**：三項改同一個 LoginCarousel。U106 把 222-258 的 page、TabView、.task 整段換掉；U49 要改的 232 行（art 的 scaleEffect 和 64/96 高度）和 241 行（108/140 外框）正好都在被換掉的範圍裡，U106 先套的話 U49 的第 4 步找不到那兩行，U49 先套的話 U106 的新程式又寫死 frame(height: 96) 和 140，把縮小蓋回去。第 5 批 U19 的第 (3) 點（P2，會比這批先做）在 224 後加 voiceOver、253 加 !voiceOver、255 加 UIAccessibility.isVoiceOverRunning、232 的插圖加 accessibilityHidden(true)，U106 的整段替換會把這些全部刪掉，VoiceOver 開著時輪播又會自己換頁。U49 的注意寫「跟同一批其他項目都沒有重疊」、U106 的注意沒提 U19，兩邊都漏了。另外 U19 原本的 .task(id: page) 有個小洞：VoiceOver 開著時 guard 直接 return，之後關掉 VoiceOver，page 沒變，task 不會重跑，輪播就停住，跟 U19 自己的驗收「關掉 VoiceOver 後恢復自動換頁」對不上。

**合併做法**：

順序是第 5 批 U19 先進，這批做的時候一次寫成合併版，不要分三次套。U49 只做它的第 1 到 3 步（LoginView），第 4 步改成直接用下面這版。合併後的 LoginCarousel（art(_:) 和 texts 不動，下面三個點照 U106 說的改用 shown）：
```swift
struct LoginCarousel: View {
    var small = false
    @State private var page: Int? = 0
    @State private var touching = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    private let texts = ["IG 看到想吃的，分享給 Bitemap", "收藏的店都在地圖上", "不知道吃什麼？抽一間"]

    var body: some View {
        let shown = (page ?? 0) % 3
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(0..<4, id: \.self) { i in
                        VStack(spacing: 12) {
                            art(i % 3).scaleEffect(small ? 0.67 : 1).frame(height: small ? 64 : 96)
                                .accessibilityHidden(true)
                            Text(texts[i % 3]).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.horizontal, 8)
                        .containerRelativeFrame(.horizontal)
                        .accessibilityHidden(i == 3)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $page)
            .onScrollPhaseChange { _, ph in
                touching = ph == .tracking || ph == .interacting || ph == .decelerating
                if ph == .idle, page == 3 {
                    var t = Transaction(); t.disablesAnimations = true
                    withTransaction(t) { page = 0 }
                }
            }
            .frame(height: small ? 108 : 140)
            // 三個點：原本 243-249，i == page 換成 i == shown，.animation 的 value 換成 shown
        }
        // voiceOver 放進 id：關掉 VoiceOver 時會重跑，輪播才接得下去
        .task(id: "\(page ?? 0)-\(touching)-\(voiceOver)") {
            guard !reduce, !voiceOver, !touching else { return }
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled, !UIAccessibility.isVoiceOverRunning else { return }
            withAnimation(.easeInOut(duration: 0.4)) { page = (page ?? 0) + 1 }
        }
    }
}
```
驗收要把三項的都跑：U49 的 SE 縮小、U106 的拖住不被搶和不倒捲、U19 的開 VoiceOver 停 10 秒不換頁而且插圖不唸，再加一條關掉 VoiceOver 後 2.5 秒內恢復自動換頁。

### 合2　U87、U126

**位置**：Edit.swift:73-86（AddSheet 的 .task）

**問題**：U87 第 (6) 點把 Edit.swift:75 改成 `if prefill.isEmpty, await ClipWatch.hasLink() {`，讓「補充再找」帶原文打開時不被剪貼簿提示攔住；U126 第 (3) 點把 73-86 整段 .task 換掉，新寫法沒有 prefill 判斷。U87 先做的話，U126 一換就把 prefill.isEmpty 刪掉，「補充再找」打開時又會冒出「剪貼簿有連結」提示，U87 驗收 (b) 的「沒有跳剪貼簿提示」就過不了。兩項的注意都沒提到對方。

**合併做法**：

不管誰先，最後的 .task 寫成這樣（U126 的版本加上 U87 的 prefill 條件；U87 原本那行的 return 不要留，鍵盤照 U126 一律叫）：
```swift
.task {
    // 帶原文來補充（U87）不提示；剪貼簿有沒處理過的連結才提示按「貼上」，鍵盤照叫
    if prefill.isEmpty, await ClipWatch.hasLink(), !ClipWatch.shared.isHandled {
        withAnimation(.snappy) { clip = true }
    }
    try? await Task.sleep(for: .milliseconds(350))
    focus = true
    for _ in 0..<4 {
        try? await Task.sleep(for: .milliseconds(150))
        if focus { break }
        focusFirstInput()
    }
}
```
另外第 4 批 U65 會把 AddSheet 的 18-69 包進 ScrollView，Edit.swift 的行號會整段往下移，這兩項做的時候照 `.task {` 和 `ClipWatch.hasLink()` 搜尋。

### 合3　U130、U92、U37（第 4 批）

**位置**：Edit.swift:204-215（EditSheet.save 的 Task）、Store.swift:566-577（add、create）

**問題**：三項改同一條存檔路徑。(a) U130 把 Edit.swift:212 的 `store.add(p)` 換成 `store.create(p)`，但 U92 把「已收藏 店名」訊息條放在 add() 裡（刻意不放 create，免得行程 ♥ 也跳），U130 一做，自己填存檔就再也不會跳「已收藏」，U92 的驗收和 U87 注意裡說的「自己填存好後會吃到 U92 的訊息條」都會失效，add() 也變成沒人呼叫。(b) 第 4 批 U37 會先做：它把 add、create、save 加上 err 參數，並把 save() 的 211-214 換成失敗時在表單裡顯示錯誤列加 Haptic.warning；U130 的整段替換只寫 `guard let saved else { return }`，會把 U37 的失敗處理整個刪掉，而且沒傳 err，失敗訊息又變回被 sheet 蓋住的訊息條。U92 的 (2) 把 add() 改寫成沒有 err 參數的版本，也會把 U37 加的參數蓋掉，Edit 那邊 `store.add(p) { why = $0 }` 就編不過。(c) U130 那行 `isNew ? await store.create(p) : (await store.save(p) ? p : nil)` 把 await 放在三元運算子右邊，Swift 跟 try 一樣不允許，會編不過。三項的注意都寫跟同批或其他項目沒有重疊。

**合併做法**：

順序：第 4 批 U37 先進；這批先做 U92，再做 U130，U130 照下面的合併版寫。
Store.swift（U37 的 err 參數加上 U92 的訊息和 markFresh）：
```swift
@MainActor func add(_ p: Place, err: ((String) -> Void)? = nil) async -> Bool {
    guard let back = await create(p, err: err) else { return false }
    say("已收藏 \(back.name)", icon: .check, place: back)
    return true
}

@MainActor func create(_ p: Place, err: ((String) -> Void)? = nil) async -> Place? {
    do {
        let d = try await Supa.write("POST", "places", body: p.row)
        let back = try JSONDecoder().decode([Place].self, from: d).first
        if let back { withAnimation(.snappy) { places.insert(back, at: 0) }; markFresh([back.id]) }
        saveCache()
        return back ?? p
    } catch { if let err { err(error.localizedDescription) } else { say("新增失敗：" + error.localizedDescription) }; return nil }
}
```
Edit.swift 的 save() 裡的 Task（U130 的定位判斷加上 U37 的失敗處理，新增成功時自己說「已收藏」，因為這裡要拿 create 回來的那筆給「改地址」用）：
```swift
Task { [p] in
    var p = p
    let need = p.lat == nil || old?.address != p.address || old?.city != p.city
    var lost = false
    if need {
        if let g = await Store.locate(p) {
            p.lat = g.coord.latitude; p.lng = g.coord.longitude; p.approx = g.approx
        } else if !(p.address ?? "").isEmpty || !(p.city ?? "").isEmpty {
            lost = true
            p.lat = nil; p.lng = nil; p.approx = nil
        }
    }
    var why: String?
    let saved: Place?
    if isNew { saved = await store.create(p, err: { why = $0 }) }
    else { saved = await store.save(p, err: { why = $0 }) ? p : nil }
    busy = false
    guard let saved else {
        // U37：沒存到就留在表單，錯誤列顯示在第一段上面
        let msg = why ?? "請再試一次"
        Haptic.warning()
        withAnimation(.snappy) { err = msg }
        AccessibilityNotification.Announcement("沒存到：\(msg)").post()
        return
    }
    if lost {
        Haptic.warning()
        let what = (saved.address ?? "").isEmpty ? (saved.city ?? "") : saved.address!
        store.say("存好了，但查不到「\(what)」的位置", action: ("改地址", {
            store.toast = nil
            store.reEdit = store.place(saved.id) ?? saved
        }))
    } else {
        Haptic.success()
        // U92：手動新增成功要有訊息條（add() 不再經過這裡）
        if isNew { store.say("已收藏 \(saved.name)", icon: .check, place: saved) }
    }
    dismiss(); done()
}
```
這樣 add() 只剩給別處用，留著沒關係。驗收要把 U92 的「自己填存檔後有已收藏訊息條、卡片亮框」、U130 的 A、B、C，和 U37 的斷網存檔錯誤列各跑一次。行程的 ♥ 還是走 create 不跳訊息條。

### 合4　U95、U31（第 4 批）

**位置**：ListTab.swift:12-13（@State）、ListTab.swift:25 的 ScrollView 和 :80 之後的 modifier

**問題**：第 4 批 U31 第 (5) 點已經在 ListTab 加 `@State private var pos = ScrollPosition(edge: .top)`，並在第 25 行的 ScrollView 掛 `.scrollPosition($pos)`。U95 第 (3) 點又加一次同名的 `@State private var pos` 和第二個 `.scrollPosition($pos)`，照寫會變成重複宣告，編不過。U95 的注意只寫跟 U96 不衝突，沒提 U31。

**合併做法**：

第 4 批先做，所以 U95 在 ListTab 只加 onChange，不要再加 @State 和 .scrollPosition，直接用 U31 那個 pos：
```swift
.onChange(of: store.retapList) { withAnimation(reduce ? nil : .snappy) { pos.scrollTo(edge: .top) } }
```
掛在 ScrollView 那串 modifier 上任何一處都可以。也可以更省：U95 的 TabBar 在 i == 1 時改成 `store.listTop &+= 1`，直接用 U31 的捲回頂部（分頁列看得到時 path 本來就是空的，U31 那行清 path 沒有副作用），Store 就不用加 retapList。GroupsTab 那邊 U31 沒動，照 U95 原本的 (4) 做。

### 合5　U96、U60（第 5 批）、U107（第 10 批）

**位置**：FoodMapApp.swift:110（訊息條條件）、FoodMapApp.swift:145-153（倒數 .task）

**問題**：U96 整個做法靠「倒數寫在 overlay 裡面的 .task(id: t)，小卡開著時訊息條沒掛上去，倒數就不會跑」。第 5 批 U60（P2，會先做）把這段倒數從訊息條拿出來，改成掛在 Root 的 `.task(id: store.toast)`，不管訊息條有沒有畫出來都會倒數；U60 也改了同一行 :110（加 `store.toastSheets == 0`）。U60 進去之後再照 U96 只改 :110，訊息條雖然藏著，倒數照跑，小卡回答完時 2.6 秒早就過了，訊息直接不見，U96 的「回答後訊息條才滑出來停 2.6 秒」就不成立。第 10 批 U107 的 (4) 又會改同一段倒數的起始秒數。U96 的注意沒提 U60。

**合併做法**：

順序是第 5 批 U60 先，第 9 批 U96 照下面改，第 10 批 U107 最後只改 left 的初始值。
(1) :110（U60 改過之後）合成：`if let t = store.toast, store.toastSheets == 0, !(store.askNotify && store.coach.isEmpty) {`
(2) U60 搬到 Root 的倒數迴圈裡加上小卡暫停：
```swift
while left > 0 {
    try? await Task.sleep(for: .milliseconds(100))
    if Task.isCancelled { return }
    // 手指按著、或通知小卡開著（訊息條藏著）時都不倒數
    if !store.toastHeld && !(store.askNotify && store.coach.isEmpty) { left -= 0.1 }
}
```
小卡開著時一秒都沒數，回答後就是完整的 2.6 秒，跟 U96 原本要的效果一樣。U60 的 ToastHostLayer（sheet 裡那條）不用加這個條件，小卡在 sheet 底下。

### 合6　U93、U03（第 1 批）

**位置**：BitemapShare/ShareViewController.swift:46

**問題**：U93 第 (4) 點把 46 行改成 `ok: line.hasPrefix("已收藏") || line.hasPrefix("之前收藏過")`；第 1 批 U03（P1，最先做）已經把同一行換成 `let v = ShareUpload.verdict(line)` 加 `finish(v == .failed ? ShareUpload.say(line) : line, ok: v != .failed, delay: ...)`，判斷一樣而且失敗時換成 Bitemap 的說法。U93 照寫會把 U03 的換字和延長的 2.5 秒刪掉。U93 的注意寫跟同批沒有共用程式，沒提 U03。

**合併做法**：

U93 的第 (4) 點不用做，46 行維持 U03 的寫法；U93 只改 101-116 的樣式。新的打勾和粉紅驚嘆號照讀 model.ok，U03 已經讓它在找不到店時是 false，驗收的「找不到店時不能出現打勾」照樣成立。

### 合7　U93

**位置**：BitemapShare/ShareTheme.swift（新檔）、FoodMap/Models.swift:77-79

**問題**：U93 第 (1) 點叫人在 ShareTheme.swift 宣告 `mint 0x2ED3A0`、`pink 0xFF4F9A`，第 (3) 點用 `Color.mint`、pink。SwiftUI 本身就有 Color.mint 和 Color.pink，在 extension 裡再宣告同名的 static，使用處很容易變成 ambiguous 編不過，就算編得過也可能拿到系統色。主 App 對應的名字是 sprMint（Models.swift:79）和 sprPink（:78）。

**合併做法**：

ShareTheme.swift 照主 App 的名字複製：`static let sprMint = Color(hex: 0x2ed3a0)`、`static let sprPink = Color(hex: 0xff4f9a)`，打勾用 `.stroke(Color.sprMint, ...)`，驚嘆號用 Color.sprPink。另外 ShareCard 是只有 `let model` 的 struct，打勾動畫的 t 要另外加 `@State private var t: CGFloat = 0`。

### 合8　U133、U66（第 4 批）、U95、U87

**位置**：ListTab.swift:86-88（onScrollPhaseChange 和 pull.go）、ListTab.swift:243-251（PullState.go）

**問題**：第 4 批 U66 把 PullState.go 改成 `go(_ work: () async -> Bool, failed: () -> Void = {})`，下拉那行改成帶 `failed: { store.saySyncFailed() }`。U133 新加的 VoiceOver 動作寫 `pull.go { await store.sync() }`，U66 之後還編得過（sync 回 Bool、failed 有預設值），但 VoiceOver 使用者更新失敗時什麼都不會說，跟手指下拉的行為不一樣。另外 U133 的注意寫「同一批項目裡沒有別項動 ListTab 的 ScrollView」不對：U95 在 :80 後面加 scrollPosition 和 onChange，U87 在 :89-95 的 sheet 後面再加一個 sheet，三項都接在同一串 modifier 上，只是位置不同，不會互相刪到。

**合併做法**：

U133 的兩處 accessibilityAction（ScrollView 上或改掛的標題 VStack 上）都寫成跟 U66 的下拉一樣：
```swift
.accessibilityAction(named: "重新整理") { pull.go({ await store.sync() }, failed: { store.saySyncFailed() }) }
```
U133 的注意那句改成「U95 和 U87 也在這串 modifier 上加東西，位置不同，照程式片段找」。

### 行號更正（acd4471）

- U92：現況和修法 (2) 都寫 TripPanel.swift:878 是 love() 呼叫 create() 的那行（標 ec71aa2）；ec71aa2 的 878 其實是 `Task { [p] in`。正確：acd4471 TripPanel.swift:890（`if let np = await store.create(p), ...`；ec71aa2 是 879）。love() 整段在 acd4471 是 880-895（ec71aa2 869-884，869 是註解）
- U133：現況和修法第 2 步都寫 ListTab.swift:46 是 PullDonut；46 其實是註解「// 下拉更新：甜甜圈跟著轉」。正確：ListTab.swift:47 `PullDonut(pull: pull)`（要拿掉的是這行）
- U115：寫 PendingCard 的 `@Environment(Store.self) private var store` 在 ListTab.swift:280；280 其實是 `let add: PendingAdd`。正確：ListTab.swift:279
- U87：寫 retryAdd 在 Store.swift:470-474。正確：Store.swift:469-473（func retryAdd 在 469，473 是右括號）

## 各項

### U49（P3・體驗）Email 表單在鍵盤出來時放不下，按 return 不會跳下一欄

**畫面**：登入頁 → 用 Email 登入／建立帳號（iPhone SE 最明顯）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：LoginView 沒有 ScrollView。鍵盤出來時所有機型的 Logo 都被推到狀態列底下；SE 上建立帳號鈕被蓋住一部分；每一欄按 return 都只收鍵盤、版面跳動，不會跳到下一欄。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MeTab.swift 從 a1b57b1 到 ec71aa2 沒改。LoginView 的 body（MeTab.swift:251-274）還是 VStack 加上下兩個 Spacer，沒有 ScrollView。emailForm（330-377）的三個輸入框（347、350、351）沒有 @FocusState，也沒有 submitLabel。Email 模式下輪播本來就會收起來（261-263），所以 (4) 的輪播只影響選登入方式那一頁。LoginCarousel 現在在 Onboard.swift:222，插圖高度在 232，整塊 140 在 241；插圖本身是寫死尺寸（Onboard.swift:264-308，像 52×90、190×92）。

**修法**：

1. LoginView 加：
```swift
@FocusState private var field: Field?
private enum Field { case name, email, pw }
```
2. body（251-274）改成下面這樣，253 和 269 的 Spacer 拿掉。minHeight 等於可用高度，內容預設置中，所以鍵盤沒出來時看起來跟現在一樣；鍵盤出來後可用高度變小，就能捲：
```swift
var body: some View {
    let compact = useEmail || store.pendingLink != nil
    GeometryReader { geo in
        ScrollView {
            VStack(spacing: 16) {
                Image("Logo").resizable().frame(width: compact ? 48 : 80, height: compact ? 48 : 80)
                    .clipShape(.rect(cornerRadius: compact ? 12 : 20))
                    .shadow(color: .cardShadow, radius: 0, y: 4)
                VStack(spacing: 2) {
                    Text("Bitemap").font(.system(size: compact ? 26 : 32, weight: .black)).foregroundStyle(Color.ink)
                    if !compact { Text("美食收藏").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink.opacity(0.5)) }
                }
                if !compact { LoginCarousel(small: geo.size.height < 700).transition(.opacity) }
                if compact { emailForm.transition(.move(edge: .trailing).combined(with: .opacity)) }
                else { choices.transition(.move(edge: .leading).combined(with: .opacity)) }
            }
            .padding(24)
            .frame(maxWidth: .infinity, minHeight: geo.size.height)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
    }
    .background(Color.bg)
    .onChange(of: signUp) { store.error = nil }
}
```
3. 輸入框（347、350、351）各自加上：
```swift
TextField("名字（朋友看到的）", text: $name).textContentType(.nickname)
    .focused($field, equals: .name).submitLabel(.next).onSubmit { field = .email }
TextField("Email", text: $email) /* 原本的修飾不動 */
    .focused($field, equals: .email).submitLabel(.next).onSubmit { field = .pw }
SecureField(signUp ? "密碼（至少 6 個字）" : "密碼", text: $pw) /* 原本的修飾不動 */
    .focused($field, equals: .pw).submitLabel(.go).onSubmit { if ready && !busy { go() } }
```
4. LoginCarousel（Onboard.swift:222）加 `var small = false`。因為插圖是寫死尺寸，只改外框高度會被裁掉或超出去，所以 232 要改成 `art(i).scaleEffect(small ? 0.67 : 1).frame(height: small ? 64 : 96)`，241 改成 `.frame(height: small ? 108 : 140)`。輪播是 A5 指定的，只能縮，不能拿掉。

**模擬器驗收**：用 iPhone SE（第 3 代）模擬器，進「用 Email 登入」，切到「建立帳號」。點名字欄叫出鍵盤：Logo 縮成 48pt，沒有被推到狀態列底下。名字欄按 return 跳到 Email，Email 按 return 跳到密碼，密碼欄的鍵盤按鍵顯示「前往」，欄位沒填齊時按了不會送出。鍵盤開著時往上捲，要捲得到「建立帳號」按鈕；往下拖可以收鍵盤。不要真的送出。回到選登入方式那一頁，輪播插圖縮小但完整可見，Apple、Google、Email 三顆按鈕都在畫面內。另外用 iPhone 16 Pro 模擬器看一次，沒有鍵盤時的版面要跟 ec71aa2 一樣置中。

**注意**：跟 fix-addcard-ec71aa2.md 和同一批其他項目都沒有重疊。

### U87（P3・體驗）「沒找到」卡只能用同一段文字重試，提示叫人加上地區卻沒地方改

**畫面**：收藏頁「沒找到」的 PendingCard

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：「重試」只是把原文再送一次，IG 連結找不到店時多半還是失敗。收藏碼失效時也只給重試，按了一樣沒用。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：ec71aa2 跟 a1b57b1 在這塊沒有實質改動。PendingAdd.State 還是 failed(String)（Store.swift:941），失敗只分成兩種寫法：雲端回非成功訊息時在 Store.swift:499 帶 inApp(msg)，丟例外時在 Store.swift:513 帶「收藏失敗：…」。inApp 在 Store.swift:518-522。收藏頁的 PendingCard 失敗時只有「重試」「自己填」和 ✕（ListTab.swift:305、316-328），重試就是 retryAdd 原文再送（Store.swift:470-474）。另外 quick-add 的門檻還在 index.ts:55：`text: rest.length > 15 ? rest : ""`，而且沒有網址時 rest 就是整段文字，所以只打一個 15 字以內的店名（例如「鼎泰豐 信義」）根本不會送去判讀，一定回「沒找到店家」。

**修法**：

(1) Store.swift:941 改成：
```swift
enum Kind: Equatable { case network, notFound, key }
enum State: Equatable { case finding, done([String]), failed(String, Kind) }
```
(2) Store.swift:486 的 `let (msg, rows)` 改成 `var (msg, rows)`，後面緊接著加一段：收藏碼失效多半是別台裝置換過碼、手機記的是舊的，App 自己就能重拿，不用叫人去「我的」：
```swift
if msg.contains("收藏碼") {
    let nk = try await Supa.rpc("quick_key", ["reset": .b(false)], as: String.self)
    if nk != k { quickKey = nk; (msg, rows) = try await Supa.quickAddJSON(key: nk, input: a.text) }
}
```
(3) Store.swift:499 改成 `set(.failed(Self.inApp(msg), Self.kind(msg)))`，Store.swift:513 改成 `set(.failed("收藏失敗：" + error.localizedDescription, .network))`。在 inApp（Store.swift:518）旁邊加：
```swift
private static func kind(_ m: String) -> PendingAdd.Kind {
    if m.contains("收藏碼") { return .key }
    if m.isEmpty || m.contains("沒找到店家") { return .notFound }
    return .network   // 雲端 catch 回的「收藏失敗：…」（index.ts:98）這類，重試有機會好
}
```
原本的修法把「其他訊息」也算進找不到，這樣伺服器暫時出錯也會叫人補地區，要改成歸到 .network。
(4) ListTab.swift:305 改成 `let failed: (msg: String, kind: PendingAdd.Kind)? = { if case .failed(let m, let k) = add.state { return (m, k) }; return nil }()`，308、311、312、316、332、335 這幾行把 `failed` 換成 `failed?.msg` 或照舊判斷 nil。316-328 的按鈕依 kind 分：.network 維持「重試」＋「自己填」＋✕；.notFound 主按鈕「補充再找」呼叫新的 refine()，「自己填」不變，「重試」縮成 44×44 的 arrow.clockwise 圖示鈕（accessibilityLabel「重試」），不然 iPhone SE 寬度塞不下四顆；.key 走到這裡代表 (2) 重拿也失敗，主按鈕改「去我的」設 `store.tab = 3`。
(5) PendingCard 加 `let refine: () -> Void`；ListTab.swift:12 下面加 `@State private var refine: PendingAdd?`；ListTab.swift:50 改成 `PendingCard(add: a, manual: { manual = a }, refine: { refine = a })`；ListTab.swift:89-95 那個 sheet 後面加 `.sheet(item: $refine) { a in AddSheet(prefill: a.text, been: a.been, rating: a.rating, replacing: a.id) }`。
(6) AddSheet（Edit.swift:4-14）目前沒有帶入原文的參數，要加明寫的 init，順便把輸入框先填好、尾巴補一個空白讓游標落在最後：
```swift
var prefill = ""
var replacing: UUID? = nil
init(prefill: String = "", been: Bool = false, rating: Int? = nil, replacing: UUID? = nil) {
    self.prefill = prefill; self.replacing = replacing
    _input = State(initialValue: prefill.isEmpty ? "" : prefill + " ")
    _been = State(initialValue: been); _rating = State(initialValue: rating)
}
```
Edit.swift:75 改成 `if prefill.isEmpty, await ClipWatch.hasLink() {`，有帶原文時不要被剪貼簿提示攔掉，直接叫鍵盤。Edit.swift:103 前面加 `if let replacing { store.dropAdd(replacing) }`，送出新的就把舊的失敗卡收掉，不然會留兩張。
(7) index.ts:55 一起改，不然補的短地區會被丟掉：`const keep = !url || rest.length > 15 || CITY_RE.test(rest) || /[區鄉鎮路街]/.test(rest);`，`extract({ url, text: keep ? rest : "" })`。沒網址時一律送，這也順便修好「只打短店名永遠找不到」。注意 repo 裡的 quick-add 不認 App 送的 `format: "json"`（index.ts:95 只回純文字），跟 App 預期的 JSON 版不一樣，改之前先確認線上部署的是哪一版，改完要重新部署。

**模擬器驗收**：(a) 斷網後在新增視窗貼一個 IG 連結送出，失敗卡要只有「重試」「自己填」和 ✕。(b) 改完 index.ts 之前先打「zzqq不存在」這種短字送出，可以直接拿到 notFound 卡（現在的門檻會讓它必定找不到）；確認主按鈕是「補充再找」，按下去開新增視窗、輸入框已填原文、游標在最後、沒有跳剪貼簿提示；補「台中」送出後舊卡消失、只剩一張新的找店中卡。(c) 部署新門檻後，只打「鼎泰豐 信義」要能找到。(d) 用 Debug 把 quickKey 改成一串 64 位亂碼再新增，要自動重拿收藏碼並成功，不出現「去我的」。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟 U92 相鄰：.notFound 的「自己填」走 EditSheet 的 isNew 存檔，存好後會吃到 U92 加的「已收藏」訊息條和亮框，兩項一起做沒有衝突。

### U92（P3・體驗）手動新增成功只有震動，沒有訊息條也沒有亮框，之後才在奇怪時機亮

**畫面**：自己填 → 存檔 → 回收藏頁

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：create() 只 insert，沒有 say 也沒有 markFresh，seenIds 也沒更新。下一次 sync 時 noteNew 把它當新店，在不相干的時間亮框、掉圖釘。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Store.swift:566 的 add() 還是只回 `await create(p) != nil`；create() 在 Store.swift:569-577，只 insert 和 saveCache，沒有 say、沒有 markFresh，seenIds 沒更新。下一次 sync 時 noteNew（Store.swift:441-446）會把這間當新店，在不相干的時候亮框、掉圖釘。EditSheet 存檔在 Edit.swift:198-216，isNew 時走 store.add（Edit.swift:212），成功只有 Haptic.success() 和關視窗（Edit.swift:214）。行程的 ♥ 收藏在 TripPanel.swift:869-884 的 love() 也呼叫 create()（878 行）。

**修法**：

(1) Store.swift:573 改成：
```swift
if let back { withAnimation(.snappy) { places.insert(back, at: 0) }; markFresh([back.id]) }
```
markFresh（Store.swift:448-458）本身就會把 id 併進 seenIds 並寫回 UserDefaults，不用另外處理。
(2) Store.swift:566 改成：
```swift
@MainActor func add(_ p: Place) async -> Bool {
    guard let back = await create(p) else { return false }
    say("已收藏 \(back.name)", icon: .check, place: back)
    return true
}
```
訊息不要放進 create()，TripPanel.swift:878 的 love() 也走 create()，它會把加站卡換成收藏的店，再跳訊息就重複了。add() 目前只有 Edit.swift:212 在用，所以 AddSheet 的「自己填」和收藏頁失敗卡的「自己填」（ListTab.swift:89-95）都會吃到。

**模擬器驗收**：用測試帳號在新增視窗按「自己填」，填一間測試店存檔。兩層視窗關掉後要看到「已收藏 店名」訊息條（左邊是勾勾），收藏頁最上面那張卡亮框；如果亮框 1.2 秒被關視窗的動畫吃掉看不到，要另外記下來。接著下拉更新，那張卡不能再亮一次。再進行程搜尋一間餐廳按 ♥，確認加站卡換成收藏的店，但不跳「已收藏」訊息條。

**注意**：跟 fix-addcard-ec71aa2.md 沒有直接衝突：那份改的是 TripPanel core 的 overlay 和 PinState 的 tapAt，這項只是讓 love() 經過的 create() 多做 markFresh，會把新 id 放進 PinState.fresh，行程裡那根新圖釘會有落下動畫。驗 fix-addcard 的加站卡時，♥ 收藏後的圖釘落下不能觸發「地圖選取略過」或「加站卡關掉」，可以順便看一下。跟 U87 相鄰，見 U87。

### U93（P3・畫面）分享選單卡片是系統毛玻璃加系統色，不是糖霜風格

**畫面**：IG → 分享 → Bitemap（分享擴充）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：這是 IG 收藏流程第一眼看到的 Bitemap，卻用 .regularMaterial、系統 ProgressView、Color.orange／red，外面還有一層 25% 黑遮罩。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：ShareViewController.swift 在 ec71aa2 只多了鎖淺色（第 13 行 overrideUserInterfaceStyle = .light）和依通知權限換文字（36-40 行），卡片樣式沒動：圖示和顏色在 101-105 行（checkmark.circle.fill 加 Color.orange／Color.red、系統 ProgressView），卡片底是 113 行的 .regularMaterial，外面 115 行還有 Color.black.opacity(0.25) 遮罩。另外 46 行的備援路徑把任何非空回應都當成功：`ok: !line.isEmpty`，雲端回「這篇貼文沒找到店家…」也會顯示成功的勾勾。

**修法**：

(1) 擴充的資料夾是 PBXFileSystemSynchronizedRootGroup（project.pbxproj:44），在 apps/food-map-ios/BitemapShare/ 新增 ShareTheme.swift 就會自動編進擴充，不用改 pbxproj。主 App 的 Color(hex:) 在 Models.swift:67、CheckShape 在 FoodMapApp.swift:266，都屬主 App target，複製一份進 ShareTheme.swift：Color(hex:)、bg 0xFFF8EE、cardShadow 0xF1DFC4、ink 0x2A1A0A、mint 0x2ED3A0、pink 0xFF4F9A、accent 0xFF8A00，以及 CheckShape。兩個 target 共用同一個檔要設 membership exception，比較麻煩，複製就好。已鎖淺色，不用做深色版。
(2) ShareViewController.swift:113 改成 `.background(RoundedRectangle(cornerRadius: 24).fill(Color.bg).shadow(color: .cardShadow, radius: 0, y: 4))`；115 行改成 `Color(hex: 0x2A1A0A).opacity(0.12)` 或拿掉，但 116 行的 `.contentShape(.rect)` 要留，備援路徑的「點一下就關」靠它。107-109 的文字加 `.foregroundStyle(Color.ink)`。
(3) 101-105 改成：還沒完成時用品牌色的轉圈（至少 `ProgressView().tint(Color.accent)`）；成功時用 `CheckShape().trim(from: 0, to: t).stroke(Color.mint, style: .init(lineWidth: 4, lineCap: .round, lineJoin: .round))` 放在 40×40，`onAppear { withAnimation(.easeOut(duration: 0.4)) { t = 1 } }`，model.done 變 true 那一幀就開始畫；失敗用 pink 的驚嘆號圓，不要黃底。40 行的 0.8 秒 delay 不要改長。
(4) 46 行順手修：`ok: line.hasPrefix("已收藏") || line.hasPrefix("之前收藏過")`，其他文字都算失敗，不然新的打勾動畫會出現在找不到店的時候。

**模擬器驗收**：在測試帳號下從 Safari 分享一個網址給 Bitemap，截分享卡：要是奶油底、實色下影、深咖啡字，打勾 0.4 秒內畫完、整張 0.8 秒後關掉，背後沒有灰黑遮罩。再開飛航模式分享一次，讓它走備援路徑，確認失敗是粉紅驚嘆號、點一下能關。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟同批其他項目沒有共用程式碼；跟 4a05adb 新加的通知文字（ShareViewController.swift:38-40）同一段，改圖示時不要動到那段判斷。

### U94（P3・畫面）長按卡片的預覽可能露出方角或底色

**畫面**：收藏頁長按卡片（contextMenu 浮起預覽）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：PlaceCard 是 22pt 圓角卡，contextMenu 沒指定預覽形狀，系統預設的矩形預覽可能露出四角的奶油底。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：ListTab.swift:59-62 的 NavigationLink 還是只有 .buttonStyle(PressStyle…) 和 .contextMenu，沒有指定預覽形狀；卡片本身是 ListTab.swift:206 的 .candy(22)。群組頁也一樣：GroupsTab.swift:335-339 的群組店卡用同一個 PlaceCard（圓角 22），GroupsTab.swift:299-304 的滑卡輪次列是 RoundRow，圓角在 GroupsTab.swift:404 的 .candy(18)，兩處都沒有 contextMenuPreview。a1b57b1 到 ec71aa2 之間這幾段只改了 PlaceCard 的店名、分店那兩行字，長按預覽完全沒動。

**修法**：

(1) 三個有 contextMenu 的圓角卡，都在 .buttonStyle 之後、.contextMenu 之前加一行預覽形狀，圓角要跟各自的 candy 一樣：
- ListTab.swift:60 和 :61 之間加 `.contentShape(.contextMenuPreview, .rect(cornerRadius: 22))`
- GroupsTab.swift:336 和 :337 之間（群組店卡）加 `.contentShape(.contextMenuPreview, .rect(cornerRadius: 22))`
- GroupsTab.swift:299 的 RoundRow 有 `.padding(.horizontal, 16)`，形狀要加在 padding 前面，不然預覽會把左右 16pt 的底色也框進去：改成 `NavigationLink(value: r) { RoundRow(round: r) }.buttonStyle(PressStyle()).contentShape(.contextMenuPreview, .rect(cornerRadius: 18)).padding(.horizontal, 16)`，後面的 .contextMenu 不動。
原本寫「同 TripsList.swift:116」要拿掉：那行是一般點擊用的 `.contentShape(.rect(cornerRadius: 22))`，TripsList 也沒有 contextMenu，照抄那行不一定會套到預覽，一定要寫明 `.contextMenuPreview`。卡片底下 4pt 的硬陰影在預覽裡會被切掉，這是可以接受的取捨。
(2) 刪除時延遲 300 到 450ms 這件事先不要做。ec71aa2 的卡片移除是 ListTab.swift:62 的縮小淡出，另外 ListTab.swift:209 的 DeleteMatch 跟訊息條 FoodMapApp.swift:122 的小照片有 matchedGeometryEffect，實際看起來是哪一種要先截圖確認，有兩段動畫打架再加延遲。

**模擬器驗收**：在收藏頁長按一張店卡，預覽浮起來時截圖，確認四個角是圓的、沒露出方角的奶油底；群組頁的群組店卡、「滑卡」底下的輪次列各長按截一張，輪次列的預覽左右不能多出 16pt 底色。只看預覽，不要按刪除或刪除這輪。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊（那份只動 MapTab、TripPanel）。跟 U100 同樣改 GroupsTab.swift，但 U100 改的是 PickSheet（GroupsTab.swift:495-533），位置不同，合併時注意行號會位移就好。

### U95（P3・體驗）已經在收藏頁時再點「收藏」，不會捲回頂部

**畫面**：收藏頁捲到很下面 → 再點分頁列的「收藏」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：TabBar 按下只設 store.tab = i，已在同一頁時沒有任何反應。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：FoodMapApp.swift:304-307 的 TabBar 按鈕還是只做 bounce[i] += 1 和 store.tab = i，已經在同一頁時什麼都不會發生。ListTab.swift:25 的 ScrollView 沒有 scrollPosition，GroupsTab.swift:16 也沒有。Store.swift:65-68 只有 tab 和 depth，沒有重按的計數。這段在 a1b57b1 到 ec71aa2 之間只多了 Perf 計數和 DepthReport，行為沒變。

**修法**：

(1) Store.swift:68 下面加兩個獨立的整數，不要用陣列：`var retapList = 0` 和 `var retapGroups = 0`。用陣列的話改 retap[2] 也會讓讀 retap[1] 的收藏頁重算，ec71aa2 這幾版一直在壓重算次數（Perf.count），分開比較乾淨。
(2) FoodMapApp.swift:304-307 改成：
```swift
Button {
    Perf.shared.mark("換分頁")
    bounce[i] += 1
    if store.tab == i {
        if i == 1 { store.retapList += 1 } else if i == 2 { store.retapGroups += 1 }
        return
    }
    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { store.tab = i }
}
```
原本修法說要加 Haptic.light()，這要拿掉：TabPress（FoodMapApp.swift:213-219）手指一按下就已經 Haptic.light()，再加一次會震兩下。
(3) ListTab.swift:12 下面加 `@State private var pos = ScrollPosition(edge: .top)`，在 ListTab.swift:80 的 `.scrollDismissesKeyboard(.immediately)` 後面接：
```swift
.scrollPosition($pos)
.onChange(of: store.retapList) { withAnimation(reduce ? nil : .snappy) { pos.scrollTo(edge: .top) } }
```
捲回頂部時 contentOffset 停在 0，不會變成負的，所以 ListTab.swift:85 的下拉甜甜圈不會被誤觸發。推進店家頁時分頁列本來就藏著（Store.swift:72 的 barHidden），不用管 path。
(4) 群組頁同一套：GroupsTab.swift:9 下面加 `@State private var pos = ScrollPosition(edge: .top)`，GroupsTab.swift:16 那個 ScrollView 的修飾子（GroupsTab.swift:45 的 .tabBarRoom() 附近）加 `.scrollPosition($pos)` 和 `.onChange(of: store.retapGroups) { withAnimation(.snappy) { pos.scrollTo(edge: .top) } }`。地圖和「我的」先不處理。

**模擬器驗收**：收藏頁捲到最底，再點分頁列的「收藏」，確認立刻捲回頂部、圖示照樣彈一下、只震一下，甜甜圈沒有轉也沒有觸發同步。群組頁加幾個群組後同樣測一次。從地圖點「收藏」要照舊只是換頁，不會順便捲動；回到收藏頁時位置要停在原本捲到的地方。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟 U96 都改 FoodMapApp.swift，但 U95 改 TabBar（:304-307），U96 改訊息條 overlay（:110），不會互相影響。

### U96（P3・畫面）通知小卡的說明文字被「已收藏」訊息條蓋住

**畫面**：收藏頁第一次新增 → 「存好時通知你？」小卡出現時

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：小卡還沒回答時，AI 回來的訊息條（底部 96pt）蓋在小卡的標題和說明上約 2.6 秒。按鈕在底部 32～84pt，不會被蓋，大字級時才有可能。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：訊息條的 overlay 在 FoodMapApp.swift:109-163，條件還是只有 FoodMapApp.swift:110 的 `if let t = store.toast`，小卡顯示時（FoodMapApp.swift:80-84 的 NotifyCard）照樣會冒出來，而且訊息條這層疊在小卡上面。d2aec97 只幫剪貼簿膠囊加了 `!store.askNotify`（FoodMapApp.swift:166），訊息條沒加。另外 ec71aa2 多了一個會叫出小卡的時機：Onboard.swift:22-25 的 askNotifyAfterShare，在 FoodMapApp.swift:58（打開 App 同步完）和 FoodMapApp.swift:192（切回前景）都會叫，剛好也是同步、存好訊息比較多的時候。

**修法**：

不用另外寫 pendingToast，把 FoodMapApp.swift:110 改成：
```swift
if let t = store.toast, !(store.askNotify && store.coach.isEmpty) {
```
這樣就自帶排隊效果：倒數計時是寫在這個 overlay 裡面的 `.task(id: t)`（FoodMapApp.swift:145-153），小卡開著時訊息條沒有掛上去，倒數就不會跑，store.toast 會一直留著。等 answerNotify（Onboard.swift:27-31）把 askNotify 設回 false，訊息條才滑出來、從頭算 2.6 秒。條件寫成跟小卡一樣的 `askNotify && coach.isEmpty`，教學還在跑時小卡不會出現，訊息條也不該被藏。
要知道的限制：小卡開著時如果連續 say() 兩次，只會留最後一則，這可以接受。帶「復原」的刪除訊息理論上會因為延後而錯過 4.2 秒的復原時間（Store.swift:598-600），但小卡開著時 FoodMapApp.swift:73-79 有一層半透明遮罩擋住點擊，不會在這時候刪東西，實際上碰不到。剪貼簿膠囊（FoodMapApp.swift:166）本來就等 toast == nil，所以順序會是小卡、訊息條、膠囊。不要用寫死的小卡高度去墊高訊息條，大字級時一定會算錯。

**模擬器驗收**：先刪掉 App 重裝（或 `xcrun simctl spawn booted defaults delete io.github.gop9632.foodmap notifyAsked`，並確認系統通知權限還是「尚未決定」），用測試帳號第一次新增一間店。小卡出現的這段時間內，畫面上不能有任何訊息條；按「先不要」後，訊息條才從下面滑出來並停約 2.6 秒，接著才可能出現剪貼簿膠囊。預設字級和 AX 大字級各截一張小卡的畫面確認沒被蓋。另外測分享選單收藏過（sharedOnce 為 true）再打開 App 的路徑，小卡跳出時同步帶來的訊息也要等回答完才出現。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。和 d2aec97 的剪貼簿膠囊條件（FoodMapApp.swift:166）是相容的，不用改那行。跟 U95 同檔案不同位置。

### U105（P3・滑順）全新安裝時登入頁只有 Email，Apple／Google 晚一拍才冒出來把版面推開

**畫面**：全新安裝 → 登入頁

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：providers 的初始值來自 UserDefaults，全新安裝時是空的，要等網路回來才插入約 170～190pt 的按鈕。離線時完全看不到 Apple 登入，而且不會重試。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Store.swift:95 還是 `var providers: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "providers") ?? [])`，全新安裝時是空的。登入頁的按鈕靠 MeTab.swift:280-281 判斷 providers 才顯示，:299 的 `.task { await store.loadProviders() }` 抓到後才用 Store.swift:388-392 的 withAnimation 插進來；離線時 Supa.providers()（Supa.swift:66-74）丟錯，loadProviders 直接 return，Apple 按鈕永遠不出現，也不會重試。這段 a1b57b1 到 ec71aa2 沒改（只是行號從 :89-90 移到 :94-95）。

**修法**：

(1) Store.swift:95 改成 `var providers: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "providers") ?? ["apple", "google"])`。
(2) :94 的註解改成「後台開了哪些登入方式：記在手機裡；全新安裝先當作 Apple、Google 都有，按鈕不會晚一拍才冒出來，後台真的沒開的那顆等網路回來再淡出」。
(3) Store.swift:388-392 的 loadProviders 不用改：後台回來的集合會含 email 等其他鍵，第一次一定跟預設值不同，會走 :390 的 `withAnimation(.snappy) { providers = p }`，少了哪顆就淡出那顆，正好是要的行為。
(4) 不要做骨架畫面。改之前先在 Supabase 後台確認 Google 登入有開；沒開的話全新安裝會看到 Google 按鈕先出現再淡掉，那就預設只放 apple。
(5) MeTab.swift:148 的 kinds 也讀 providers，但只在登入後的「我的」頁用，那時 loadProviders 早就跑過，不受影響。

**模擬器驗收**：在模擬器刪掉 App 重裝（或 Device > Erase），關掉 Mac 網路後打開：登入頁一開始就有 Apple、Google、Email 三顆，版面不會跳。接回網路重新打開，確認後台有開的按鈕都還在、沒開的會淡出。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊，同一批其他項目也沒碰 Store.swift:94-95。U107 也改 Store.swift，但是在 say()（:429）和刪收藏（:579-608），不同段。

### U106（P3・滑順）手指在滑輪播時自動換頁會搶走手勢；第 3 格回第 1 格會倒捲

**畫面**：登入頁三格輪播

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：.task(id: page) 只在 page 改變時重新計時，手指拖到一半時間到了，畫面就從手指底下被抽走。(page + 1) % 3 在 page 樣式的 TabView 裡會反向捲過第 2 格。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：輪播程式只是行號移動（d2aec97 在前面加了剪貼簿程式碼），內容跟 a1b57b1 一樣。LoginCarousel 在 Onboard.swift:221-258：:229-240 還是 page 樣式的 TabView，:252-257 的 `.task(id: page)` 只在 page 改變時重新計時，手指拖到一半時間到就被 `withAnimation { page = (page + 1) % 3 }` 搶走；第 3 格回第 1 格（:256）在 page TabView 裡會反向捲過第 2 格。

**修法**：

把 Onboard.swift:222-258 的 page 狀態、TabView 和 .task 換成可以知道「手指在不在」的 ScrollView，art(_:)（:260 起）不用動：
```swift
@State private var page: Int? = 0
@State private var touching = false

var body: some View {
    let shown = (page ?? 0) % 3
    VStack(spacing: 10) {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                // 第 4 格是第 1 格的複本：捲到它之後不帶動畫跳回第 1 格，看起來是一直往右轉
                ForEach(0..<4, id: \.self) { i in
                    VStack(spacing: 12) {
                        art(i % 3).frame(height: 96)
                        Text(texts[i % 3]).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, 8)
                    .containerRelativeFrame(.horizontal)
                    .accessibilityHidden(i == 3)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $page)
        .onScrollPhaseChange { _, ph in
            touching = ph == .tracking || ph == .interacting || ph == .decelerating
            if ph == .idle, page == 3 {
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { page = 0 }
            }
        }
        .frame(height: 140)
        // 下面三個點改用 shown 判斷（:243-249 的 i == page 換成 i == shown，.animation 的 value 也換成 shown）
    }
    // 手指碰著就不數；放開、換格後重新數 2.5 秒
    .task(id: "\(page ?? 0)-\(touching)") {
        guard !reduce, !touching else { return }
        try? await Task.sleep(for: .seconds(2.5))
        guard !Task.isCancelled else { return }
        withAnimation(.easeInOut(duration: 0.4)) { page = (page ?? 0) + 1 }
    }
}
```
重點：(1) 不要在 TabView 上掛 DragGesture(minimumDistance: 0) 偵測手指，常收不到 onEnded 會卡住。(2) onScrollPhaseChange 是 iOS 18 的 API，App 最低 iOS 18 可以用。(3) 不要停在第 3 格，A5 要求自動輪播。(4) 減少動態時照舊不自動換（guard !reduce）。

**模擬器驗收**：在登入頁用滑鼠按住輪播往左拖一半、停住超過 3 秒：畫面不會從手指下被抽走；放開後 2.5 秒才換下一格。讓它自己輪播一整圈：第 3 格之後是往右滑到第 1 格，不會倒捲經過第 2 格，下面的點也正確回到第一個。開「減少動態」時不會自己換。VoiceOver 只唸得到三格。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。要注意同一檔案的 ClipCapsule（Onboard.swift:209-211，d2aec97 新加的）和訊息條（FoodMapApp.swift:154-156）都正好用了這裡說不要用的 `simultaneousGesture(DragGesture(minimumDistance: 0))` 來判斷手指按著；如果 onEnded 沒來，held 會卡在 true，膠囊或訊息條就不會自己收。這跟 U107 改的計時是同一組變數，U107 的修法裡有一併處理的建議。

### U108（P3・畫面）「我的」個人卡片直接顯示 Apple 隱藏信箱的亂碼地址

**畫面**：我的 → 最上面個人卡片

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：MeTab.swift:135 顯示 xxxxx@privaterelay.appleid.com，同頁 :161 已經換成「隱藏的電子郵件」。使用者跳過取名時，預設名字也是那串亂碼。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MeTab.swift 和 Coach.swift 從 a1b57b1 到 ec71aa2 完全沒改。MeTab.swift:135 還是直接顯示 Supa.session?.user.email，MeTab.swift:161 才把 privaterelay 換成「隱藏的電子郵件」。原本的 Store.swift:215 往下移到 Store.swift:220，仍然拿 @ 前段當預設名字；Store.swift:345 的 needsName 會跳「你的名字」，但 FoodMapApp.swift:95 按「之後再說」就留著那串亂碼。

**修法**：

(1) MeTab.swift 加一個小函式，放在 kinds（:147）上面就好：
```swift
private func shownEmail(_ e: String?) -> String {
    guard let e, !e.isEmpty else { return "" }
    return e.contains("privaterelay.appleid.com") ? "隱藏的電子郵件" : e
}
```
(2) MeTab.swift:135 改成字串空的時候整行不出現：
```swift
let mail = shownEmail(Supa.session?.user.email)
if !mail.isEmpty {
    Text(mail).font(.caption).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1).truncationMode(.middle)
}
```
(3) MeTab.swift:161 改用同一個函式：`Text(shownEmail(e)).font(.caption).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1).truncationMode(.middle)`，兩處的字才會完全一樣。
(4) Store.swift:220 遇到隱藏信箱不要拿 @ 前段：
```swift
let mail = Supa.session?.user.email ?? ""
let first = mail.contains("privaterelay.appleid.com") ? "新朋友" : mail.components(separatedBy: "@")[0]
let p = Profile(id: me, name: first)
```
「新朋友」只是暫定字，Anthony 想換別的詞直接換。這段只管新帳號；之前已經寫進亂碼名字的舊帳號不會自己變，要靠他自己按「改名字」。

**模擬器驗收**：用開了「隱藏我的電子郵件」的測試 Apple ID 在模擬器登入一個全新帳號，「你的名字」那一步按「之後再說」。確認「我的」個人卡片第一行是「新朋友」、第二行是「隱藏的電子郵件」，跟下面「登入方式」Apple 那列的字一樣；群組成員裡看到的也是「新朋友」。再用一般 Email 帳號登入，確認第二行照常顯示完整信箱，太長時是中間省略。

**注意**：MeTab.swift 同一批還有 U110（:75-84、:118-120）、U111（:21、:64、:92-100）、U112（:33）要改，行號不重疊，但最好同一個 commit 一起改，免得行號互相跑掉。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U110（P3・體驗）按下刪除帳號後沒有進行中的提示，可以重複按

**畫面**：我的 → 進階 → 刪除帳號

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：確認後只開一個 Task，畫面不變，網路慢時要好幾秒。再按一次可能出現重複或互相矛盾的提示（「帳號已刪除」之後又跳「刪除失敗」）。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MeTab.swift 沒改過。MeTab.swift:119 按確定只開 `Task { await store.deleteAccount() }`，畫面沒變；MeTab.swift:75-84 的「登出」「刪除帳號」都沒有停用。Store.swift:531-538 的 deleteAccount() 沒有進行中的旗標，可以重入。中間多了 LaterDelete（Store.swift:419 signOut 會 clear），不影響這一項。

**修法**：

原本寫「deleteAccount() 開頭 guard 再設 true」，但 MeTab 是用 Task 呼叫，Task 要下一輪才開始跑，旗標不會在按確定那一幀就設好。改成把旗標和 Task 都收進 Store，按鈕直接呼叫同步的函式：
(1) Store.swift:90 附近（askName 旁邊）加一個被觀察的 `var deletingAccount = false`，不要加 @ObservationIgnored。
(2) Store.swift:531-538 換成：
```swift
@MainActor func deleteAccount() {
    guard !deletingAccount else { return }
    deletingAccount = true
    Task {
        defer { deletingAccount = false }
        do {
            try await Supa.write("POST", "rpc/delete_my_account", body: [String: AnyCodable]())
            signOut()
            UserDefaults.standard.removeObject(forKey: "coachDone")
            say("帳號已刪除")
        } catch { say("刪除失敗：" + error.localizedDescription) }
    }
}
```
(3) MeTab.swift:119 改成 `Button("刪除帳號", role: .destructive) { store.deleteAccount() }`，這樣按下那一幀旗標就是 true。
(4) MeTab.swift:80-84 的 Button 本體留著，只換 label，並加停用：
```swift
Button { killing = true } label: {
    HStack(spacing: 8) {
        if store.deletingAccount { ProgressView() }
        Text(store.deletingAccount ? "刪除中…" : "刪除帳號").font(.headline)
    }
    .foregroundStyle(.red)
    .frame(maxWidth: .infinity).frame(height: 50).candy(18).contentShape(.rect)
}
.buttonStyle(PressStyle())
.disabled(store.deletingAccount)
```
MeTab.swift:75-79 的「登出」也加 `.disabled(store.deletingAccount)`。不要停用整個 ScrollView。

**模擬器驗收**：不要真的刪帳號。在 Debug 暫時把 Store.swift 那行 Supa.write 換成 `try await Task.sleep(for: .seconds(3)); throw URLError(.timedOut)`，按「進階 > 刪除帳號 > 刪除帳號」：確認對話框一收，按鈕立刻變成轉圈加「刪除中…」，「登出」和「刪除帳號」都點不動；3 秒後只出現一次「刪除失敗」，兩顆按鈕恢復可以按。測完把假實作拿掉。

**注意**：跟 U111 都改 MeTab.swift 的進階區塊：U111 的捲動目標建議放在版本號（:92-100），不放在刪除帳號那顆，所以這裡換 label 不會動到 U111 的 id。如果 U111 最後還是把 .id 加在刪除帳號 Button 上，要加在 Button 本體，不要加在會換字的 Text 上。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U111（P3・體驗）展開「進階」後內容長在畫面下面，看起來像沒反應

**畫面**：我的 → 進階

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：「進階」本來就在頁面最下面。展開後 IG 捷徑、登出、刪除帳號都在折線以下，畫面不會自己捲過去。登出放進進階是 C2 的刻意設計，不要移回來。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：MeTab.swift 沒改過。MeTab.swift:21 的 ScrollView 外面沒有 ScrollViewReader，也沒有 scrollPosition；MeTab.swift:64 的 DisclosureGroup 只有 `$advanced.animation(.snappy)`，展開後不會捲。原本引用的 FoodMapApp.swift:332 現在是 FoodMapApp.swift:344（tabBarRoom 在底下留 76pt 給浮著的分頁列）。

**修法**：

原本建議把 .id 加在「刪除帳號」Button 上。這有兩個問題：onChange 觸發時進階的內容可能還沒長出來，第一次展開 scrollTo 找不到那個 id 就什麼都不做；而且對齊 .bottom 時那顆按鈕有可能剛好貼在浮動分頁列後面。改成拿一直都在、又排在刪除帳號下面的版本號當目標：
(1) MeTab.swift:21 的 ScrollView 外面包 `ScrollViewReader { proxy in ... }`，:104-123 那串 modifier 照舊掛在 ScrollView 上。
(2) MeTab.swift:92-100 的版本號 Text 最後加 `.id("meEnd")`。
(3) 在 ScrollView 上加：
```swift
.onChange(of: advanced) { _, on in
    guard on else { return }
    withAnimation(.snappy) { proxy.scrollTo("meEnd", anchor: .bottom) }
}
```
曲線跟 :64 的 `$advanced.animation(.snappy)` 一樣，展開和捲動同一幀開始。
(4) 實機上如果展開途中內容還沒長好、捲不到底，改用 iOS 18 的 `@State private var pos = ScrollPosition(edge: .top)` 加 `.scrollPosition($pos)`，onChange 裡改成 `withAnimation(.snappy) { pos.scrollTo(edge: .bottom) }`；或在內容的 onGeometryChange 裡，advanced 剛打開的那 0.5 秒內高度變了就補捲一次。

**模擬器驗收**：「我的」頁先捲到最底，再按「進階」：確認畫面跟著展開一起往下捲，IG 分享捷徑、登出、刪除帳號全部露出，刪除帳號沒有被浮動分頁列蓋住，版本號在最下面。在 iPhone SE 和 Pro Max 尺寸各試一次，收起再展開也要一樣。不要按登出和刪除帳號。

**注意**：跟 U110 改同一塊（MeTab.swift:75-84）：U110 會把刪除帳號的字換成「刪除中…」，所以這裡刻意不把 id 放在那顆按鈕上。U108、U112 也改 MeTab.swift，行號不重疊。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U112（P3・體驗）教學文案和實際行為對不上：「按＋新增一間」打開的是 IG 教學；「4 步」其實是 2～4 步；「略過」太小太淡

**畫面**：教學圈圈（Coach）、我的 > 再看一次教學

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：.add 那步寫「按＋新增一間」，點了卻出現全螢幕 IG 分享教學。我的頁寫「4 步」，但步數會變。「略過」是 footnote、ink 45%，點擊區很小。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Coach.swift 和 MeTab.swift 都沒改過。Coach.swift:18 還是「按＋新增一間」配「下一步」，但 Coach.swift:114 和 :121 點圈圈或按鈕都是 coachShowIG()，打開 IG 教學。MeTab.swift:33 還寫「4 步」，Coach.swift:39-42 的步數會在 2 到 4 之間變。Coach.swift:211 的「略過」還是 footnote、ink 0.45、沒有點擊區；IG 教學在 Coach.swift:272 也用同一個 Spotlight。

**修法**：

保留 Anthony 選的流程（.add 仍圈住＋，按＋或按鈕都進 IG 教學），只改文案和略過：
(1) Coach.swift:18 改成 `case .add: CoachText(title: "在 IG 看到想吃的店", body: "按分享選 Bitemap 就收好了；也可以按＋貼連結或打店名", button: "看怎麼從 IG 收")`。
(2) MeTab.swift:33 的副標改成「再看一次第一次打開的教學」。
(3) Coach.swift:211 改成：
```swift
Button(action: onSkip) {
    Text("略過").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink.opacity(0.6))
        .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
}
```
字型和 frame 要放在 label 裡，放在 Button 外面點擊區不會變大。Spotlight 是共用的，Coach.swift:272 的 IG 教學會一起變好。這一列會因為 44pt 變高一點，按鈕和提示字照舊靠右，不用另外調。

**模擬器驗收**：「我的 > 教學 > App 怎麼用」：確認副標是「再看一次第一次打開的教學」；走到 .add 那步，標題、內文和按鈕字都說 IG，按圈住的＋或按「看怎麼從 IG 收」都出現 IG 教學，看完回來接著下一步。在對話框和 IG 教學裡各點一次「略過」的邊緣，確認容易點到、字比計數器清楚。用 Accessibility Inspector 看略過的點擊區至少 44×44。

**注意**：跟 U113 的文案要一致：這裡寫「按＋貼連結或打店名」，U113 選 (a) 的話按鈕字也用「貼連結或打店名」。MeTab.swift:33 跟 U108、U110、U111 同檔不同行。跟 fix-addcard-ec71aa2.md 沒有重疊。

### U115（P3・滑順）「找店中」卡的光掃動畫在收藏頁藏著時也一直重畫（程式衛生）

**畫面**：在 App 內貼連結或按膠囊收藏後，停在地圖、群組或我的分頁等找店

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：PendingCard 用 TimelineView(.animation)，沒有 paused 條件。收藏頁啟動 1 秒後就預建好、以 opacity 0 掛著，所以在別的分頁等找店時，看不到的卡片照樣以刷新率重算 body。IG 分享走伺服器，不會產生這張卡。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：ListTab.swift 有改（DiceChip、DepthReport 等），但 PendingCard 沒動。ListTab.swift:336 還是 `TimelineView(.animation)`，沒有 paused；ListTab.swift:261 的 PullDonut 已經是 `.animation(paused: !pull.busy)`。FoodMapApp.swift:200-207 分頁開過就一直掛著、只用 opacity 0 藏，所以在別的分頁等找店時這張看不到的卡照樣每幀重算。

**修法**：

ListTab.swift:336 改成：
```swift
TimelineView(.animation(paused: store.tab != 1)) { t in
```
PendingCard 已經有 `@Environment(Store.self) private var store`（:280），可以直接讀。光的位置是用絕對時間算的（:337），切回收藏頁時會從正確的位置接著掃，不會跳。不要改成 repeatForever，這張卡有插入轉場又在 FlipCard 背面，容易捲進無限循環。可以順手考慮收藏頁推進店家頁時也停（`|| store.depth[1] > 0`），但那會讓每張找店卡多看 depth，不做也可以。

**模擬器驗收**：先在 TimelineView 的閉包裡暫加一行 `let _ = Perf.shared.count("找店卡光")`（5b5355c 的 PerfHUD 會顯示每個 view 重算幾次）。在地圖分頁用剪貼簿膠囊或＋貼一個測試連結收藏，找店的時候停在地圖、群組、我的：HUD 上「找店卡光」的次數不再增加；切回收藏頁才開始一直跳，光照常掃。也可以用 Instruments 的 SwiftUI 工具確認 PendingCard 的 body 不再每幀執行。測完拿掉那行 count。

**注意**：沒有。跟 fix-addcard-ec71aa2.md 和同一批其他項目都不碰同一段。

### U126（P3・體驗）新增視窗只要剪貼簿有任何網址就不叫鍵盤，連很久以前複製的也一樣

**畫面**：地圖或收藏頁按 ＋ 打開「新增店家」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：AddSheet 的 .task 只要 hasLink() 為真就不 focus，並顯示「剛複製的連結」。幾天前的新聞連結、膠囊已經處理過的連結都一樣，想直接打店名的人每次多點一下。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Edit.swift:73-86 的 .task 跟 a1b57b1 一樣：只要 ClipWatch.hasLink() 為真就設 clip = true 然後 return，不叫鍵盤。Edit.swift:30-33 的提示文字還是「剛複製的連結，按「貼上」就填好」。Edit.swift:26 的 PasteButton 只呼叫 markSeen() 和 dismiss()。Onboard.swift:65-155 的 ClipWatch 在 d2aec97 多了 skips、muteUntil、skip()，但沒有任何「這次複製已經處理過」的紀錄可以給新增視窗用；seen 在 show()（Onboard.swift:103-105）一顯示膠囊就寫入，所以不能拿來判斷。

**修法**：

(1) Onboard.swift:68 後面加一個獨立的紀錄，不要重用 seen 或 skips：
```swift
// 這次複製已經處理過（膠囊按了貼上或 ✕、新增視窗按了貼上）；新增視窗的提示看這個
@ObservationIgnored private var handled = UserDefaults.standard.integer(forKey: "clipHandled")
func markHandled() {
    handled = UIPasteboard.general.changeCount
    UserDefaults.standard.set(handled, forKey: "clipHandled")
}
var isHandled: Bool { UIPasteboard.general.changeCount == handled }
```
(2) 寫入點：skip()（Onboard.swift:123）第一行加 `markHandled()`；pasted()（Onboard.swift:142）第一行加 `markHandled()`；Edit.swift:26 改成 `Task { @MainActor in ClipWatch.shared.markSeen(); ClipWatch.shared.markHandled(); ClipWatch.shared.dismiss() }`。8 秒自己收起（Onboard.swift:117-118）不要寫，這樣「看到膠囊沒按，改按＋」這條路還會有提示。新增視窗的貼上不要去動 skips，維持 d2aec97 的設計（只有膠囊上的貼上才歸零）。
(3) Edit.swift:73-86 的 .task 改成不管剪貼簿都叫鍵盤，提示只在沒處理過時出現：
```swift
.task {
    // 剪貼簿有沒處理過的連結：提示按「貼上」，但鍵盤照叫（貼上鈕在輸入框正下方，鍵盤蓋不到）
    if await ClipWatch.hasLink(), !ClipWatch.shared.isHandled {
        withAnimation(.snappy) { clip = true }
    }
    try? await Task.sleep(for: .milliseconds(350))
    focus = true
    for _ in 0..<4 {
        try? await Task.sleep(for: .milliseconds(150))
        if focus { break }
        focusFirstInput()
    }
}
```
(4) Edit.swift:31 文字改成「剪貼簿有連結，按「貼上」就填好」，因為現在任何網址都會問，不一定是剛複製的。Edit.swift:13 的註解也跟著改。(5) 規格裡描述新增視窗剪貼簿行為的那一行（稽核時是第 34 行）一起改成「一律叫鍵盤，沒處理過的連結才顯示提示」。

**模擬器驗收**：用 `-clipSkips 0 -clipMuteUntil 0` 啟動。A：App 在背景時 pbcopy 一個網址，回到 App 出現膠囊後按 ✕，再按＋：鍵盤要自動出來，提示不出現，✕ 計數照常加 1。B：再換一個網址（一樣在背景時 pbcopy），膠囊出來後不要碰，等 8 秒收掉，再按＋：鍵盤出來，同時看到「剪貼簿有連結」提示。C：在 B 的新增視窗按貼上，關掉再按＋：沒有提示。D：剪貼簿放純文字（不是網址）按＋：鍵盤出來、沒提示。E：確認 PasteButton 在鍵盤出來後還看得到、按得到（iPhone SE 尺寸也要試）。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟 fix-list-round1c.md 的 G2a 有重疊的檔案和函式：G2a 要在 check()、skip()、pasted() 加 DEBUG print，這裡也在 skip() 和 pasted() 開頭加 markHandled()，兩邊都只是多一行，合併時注意不要互相蓋掉。G2a 的歸零測法明寫「新增視窗裡的貼上不歸零」，所以這項刻意不在 Edit.swift:26 動 skips，兩邊一致。A4 規格變更（任何網址都問、三次 ✕ 兩週不問）不受影響，因為 handled 是另一個 key，不會改到膠囊要不要出現。

### U130（P3・體驗）存檔時地址查不到位置也沒提示，店默默不在地圖上或停在舊位置

**畫面**：新增 → 自己填 → 存檔；店家頁 → 編輯 → 改地址 → 存檔

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：locate 回 nil 時照樣存檔、播成功震動。新店會默默進「還沒有地址」；本來有座標的店改了地址卻查不到，會停在舊位置，而且不會出現在任何清單，更難發現。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：Edit.swift:198-216 的 save() 跟 a1b57b1 一樣：Edit.swift:208 locate 回 nil 時什麼都不做，照樣存檔，Edit.swift:214 照樣 Haptic.success()。已有座標的店改了地址卻查不到，lat 和 lng 會留著舊值。Store.locate（Store.swift:739-752）在地址查不到時會退回用「城市＋店名」搜，所以只有店名也搜不到時才會回 nil。fillCoords 在 Store.swift:718-728，「還沒有地址」清單是 MapTab.swift:1818-1845 的 NoAddressSheet，它會對有地址的店顯示「地址找不到位置，點一下改」。

**修法**：

不要擋住存檔，也不要加確認框。(1) Store 加 `var reEdit: Place?`，FoodMapApp 的根畫面（例如 FoodMapApp.swift:84 的 overlay 後面）加 `.sheet(item: $store.reEdit) { EditSheet(place: $0) }`，給訊息條的「改地址」用；EditSheet 現在是從 PlaceDetail、NoAddressSheet、AddSheet、ListTab 各自開的，訊息條出現時原本的視窗已經關了，只能從根畫面重開。(2) Edit.swift:204-215 改成：
```swift
Task { [p] in
    var p = p
    let need = p.lat == nil || old?.address != p.address || old?.city != p.city
    var lost = false
    if need {
        if let g = await Store.locate(p) {
            p.lat = g.coord.latitude; p.lng = g.coord.longitude; p.approx = g.approx
        } else if !(p.address ?? "").isEmpty || !(p.city ?? "").isEmpty {
            lost = true
            // 改了地址卻查不到：不要停在舊位置，進「還沒有地址」，之後同步時 fillCoords 會再試
            p.lat = nil; p.lng = nil; p.approx = nil
        }
    }
    let saved: Place? = isNew ? await store.create(p) : (await store.save(p) ? p : nil)
    busy = false
    guard let saved else { return }
    if lost {
        Haptic.warning()
        let what = (saved.address ?? "").isEmpty ? (saved.city ?? "") : saved.address!
        store.say("存好了，但查不到「\(what)」的位置", action: ("改地址", {
            store.toast = nil
            store.reEdit = store.place(saved.id) ?? saved
        }))
    } else {
        Haptic.success()
    }
    dismiss(); done()
}
```
新增改用 store.create(p)（Store.swift 的 create 會回傳伺服器存好的那筆），重開時才拿得到正確的那間。復原 closure 一樣要自己 `store.toast = nil`。(3) 可選：地址有填、但 locate 回來的是 approx（地址查不到、靠店名找到的大概位置），也可以說一聲「地址查不到，先放在店名找到的位置」，避免放到別間分店；這是延伸，不是這項必做的。

**模擬器驗收**：注意 locate 查不到地址時會改用店名搜，所以「只把地址改成亂碼」通常會被店名救回來，不會出現提示。測試要用搜不到的店名。A（新增）：新增 > 自己填，店名填「Qxzvq 測試」、城市台北市、地址「亂碼巷 999 號」，存檔：視窗照常關掉、出現警告震動和「存好了，但查不到「亂碼巷 999 號」的位置」，按「改地址」會重開這間的編輯畫面；這間出現在地圖左下「N 間還沒有地址」裡。B（編輯）：先建一間有正確地址、在地圖上的測試店（店名一樣用搜不到的），再把地址改成亂碼存檔：要出現同樣的訊息條，圖釘從地圖上消失，改出現在「還沒有地址」。C（回歸）：地址正確的店照常存、成功震動、沒有訊息條；店名搜得到但地址打錯的，照現在的行為放到大概位置。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。跟同批其他項目沒有重疊。

### U133（P3・畫面）收藏頁下拉更新：甜甜圈擠在標題下的窄縫，VoiceOver 也無法更新（有爭議）

**畫面**：收藏分頁 → 在頂端往下拉

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：甜甜圈拉滿時上下各只溢出約 3pt，主要是位置不在拉開的空白裡，看起來擠。沒有 .refreshable，也沒有 accessibilityAction，VoiceOver 無法手動更新；群組頁和行程清單都可以。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：ListTab.swift:25 的 ScrollView 從 a1b57b1 到 ec71aa2 只改了標題那排（640390a 換成 DiceChip），下拉更新還是自己做的：ListTab.swift:85-88 用 onScrollGeometryChange 加 onScrollPhaseChange 觸發 pull.go，整個 ListTab.swift 沒有 .refreshable 也沒有 accessibilityAction。甜甜圈 PullDonut 還是放在 VStack 裡標題那排下面（ListTab.swift:46），閒置時高度 0（ListTab.swift:254-275），所以位置一樣擠在標題和下面內容中間。對照組 GroupsTab.swift:48、GroupsTab.swift:360、TripsList.swift:49 都有 .refreshable。

**修法**：

1. 必做：VoiceOver 能手動更新。在 ListTab.swift:88（onScrollPhaseChange 那段的右括號）後面加：
```swift
// VoiceOver 沒辦法下拉：給一個「重新整理」動作（不加原生 .refreshable，系統菊花會和甜甜圈一起出現）
.accessibilityAction(named: "重新整理") { pull.go { await store.sync() } }
```
pull.go 會把 busy 設成 true，甜甜圈和「更新中」的標籤會照常出現，等於有回饋。
如果 Accessibility Inspector 在 ScrollView 上看不到這個動作（SwiftUI 的 ScrollView 不一定被當成單一元素），改掛在標題那塊：ListTab.swift:29 的 VStack 後面加 `.accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader).accessibilityAction(named: "重新整理") { pull.go { await store.sync() } }`，VoiceOver 進收藏頁第一個摸到的就是它。
2. 可選，等截圖確認真的擠再做：甜甜圈搬到 ScrollView 的 .overlay(alignment: .top)。原本寫的 offset(y: pull.y / 2 − 20) 在 ec71aa2 上不對：PullDonut 閒置時外框高度是 0，圖會以外框頂端為中心，所以閒置時應該用 `.offset(y: pull.y / 2)` 才會在拉開的空白正中間。更新中（busy）放手後 pull.y 會回到 0，甜甜圈會疊在標題上，所以 VStack 最上面（ListTab.swift:27 之前）要留 `Color.clear.frame(height: pull.busy ? 40 : 0)` 撐開空間，並把 ListTab.swift:46 原本那個 PullDonut 拿掉。這一步會讓更新中整頁往下 40pt，跟現在甜甜圈在標題下面的感覺不同，做之前先給 Anthony 看。

**模擬器驗收**：開 Accessibility Inspector 對準收藏頁，確認 ScrollView（或改掛的標題）有「重新整理」動作，按下去 PerfHUD 或網路紀錄看得到 sync，甜甜圈轉一圈後收起。開 VoiceOver 實際用轉子選「重新整理」再確認一次。手指下拉放開時，畫面上只有甜甜圈，沒有系統菊花。有做第 2 步的話，下拉到一半和拉滿各截一張，甜甜圈要在拉開的空白正中間；放開後更新中，甜甜圈不能蓋到「我的收藏」。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同一批項目裡沒有別項動 ListTab 的 ScrollView。5048a9e 說的「list pull-down re-finds its scroll view」是 PanelLift 那套面板清單的下拉，不是收藏頁這個甜甜圈，兩邊不互相影響。
