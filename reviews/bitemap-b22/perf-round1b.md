# perf-round1b：點圖釘、抽一間的效能補充（對 ec71aa2）

材料是 034e6b5 的模擬器取樣（s1b 點一根圖釘、s2b 按 🎲 抽一間）和驗證過的分析。行號都是 ec71aa2 的。不碰 fix-addcard-ec71aa2.md 改的地方（selection setter、blankTap、zoom()、MapTab.swift:213、TripPanel 的 overlay）。

## 1. 先講結論

1. 主執行緒最大的一塊是 CA commit 時用 CPU 把 emoji 字形重畫進 layer：s1b 印出來的 CABackingStoreUpdate_ 那支 63 個樣本（約 85 到 90ms，其中走 HVF 的 56 個），s2b 是 loadPartAtIndex 葉節點 52 個（約 70 到 74ms；印出來的 CA commit 那支只展開到 CopyGlyphPath 41，另一條 commit 43 沒展開），都是 4 秒累計，不能扣到某一幀。s1b 的葉節點 loadPartAtIndex 是 62，比那支的 56 多，至少 6 個在別條沒印出的路徑上。
2. 是哪個 layer、第一次載入還是每幀用新倍率重畫，樹上看不出來；「選中、跳動的圖釘 emoji」只是推論。
3. 也不知道它擠在一兩幀還是攤在彈簧的幾十幀；攤開的話每幀不到 1.5ms，改掉只省 CPU、長幀不會少。
4. s2b 另有 ApplyVariationsToGlyph 5 個。它是 TrueType 可變字型（SF 的字重）的路徑，彩色 emoji 不走這裡，所以比較像一般文字也在重組字形（推論），emoji 改成圖管不到這一塊。
5. s2b 長幀合計 955ms，在忙最多 686ms，至少有 269ms 的長幀時間主執行緒沒有「在忙」樣本（前提是取樣窗蓋住整段）：可能卡在被 sampletree 當成閒置的等待裡（這仍然是主執行緒卡住）、render server 慢，或畫面沒變。
6. s2b 第 2 段扣掉長幀只剩 4 幀、平均 20ms，很像大多靜止，187、173、133 不一定是卡頓。
7. s1b 的 InsetLayoutComputer 30 個（約 41 到 43ms）可能是第二大塊我們的成本（MapTab.swift:239 或 :268 的 .safeAreaInset），沒確認。
8. ec71aa2 已在背景建播放器，但拿網址、解 JSON 還在主執行緒，850ms 延後（MapTab.swift:546）還在；泡泡合併也改了，基準要重量。
9. 所以先出一個量測 build，加三個不改外觀和時機的小修，其他等數字。

讀數字：1 個樣本約 1.35 到 1.43ms。冷啟動第一次和第二次分開記，每個設定量兩次，差不到 15 個樣本當雜訊，浮層每次都開。

## 2. 量測用 build

Release 模擬器 build（034 的樣本是最佳化過的），OTHER_LDFLAGS 加 `-Wl,-no_deduplicate`，讓 `<deduplicated_symbol>`（s1b 20、s2b 10）現出真名。沒加參數時行為和 ec71aa2 一樣。

### 2.1 Flag

Perf.swift 檔尾：

```swift
// 量測用的啟動參數：只有開發版和模擬器讀得到
enum Flag {
    #if DEBUG || targetEnvironment(simulator)
    static let args = ProcessInfo.processInfo.arguments
    #else
    static let args: [String] = []
    #endif
    private static let set = Set(args)
    static func on(_ name: String) -> Bool { set.contains(name) }
    static func value(_ name: String) -> String? {      // 帶值的，例如 -drawWin
        guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
    @MainActor static var draws = 0                       // -drawWin 輪流用
}
```

Perf 類別裡（Perf.swift:11 下面）加：

```swift
static func begin(_ n: StaticString) -> OSSignpostIntervalState { signposter.beginInterval(n, id: signposter.makeSignpostID()) }
static func end(_ n: StaticString, _ s: OSSignpostIntervalState) { signposter.endInterval(n, s) }
```

### 2.2 參數

| 參數 | 關掉或換掉什麼 | 要分辨什麼 |
|---|---|---|
| `-emojiImg pin,bubble,dice` 或 `all` | 那幾種換成先畫好的圖（4.A） | HVF 是不是它們 |
| `-emojiImgSel` | 只有選中那根用圖 | 是不是選中那根的放大 |
| `-emojiWarm` | 只預熱，不換圖 | 預熱能不能消掉第一次載入 |
| `-noEmoji` | 分類 emoji 和 🎲 變空字串（只找來源） | HVF 是不是全來自我們 |
| `-noHopScale`、`-noSpin` | 跳釘不放大、🎲 不轉 | 各佔多少 |
| `-drawWin id1,id2` | 輪流抽中這幾間，跳的固定成前 7 根 | A/B 兩邊一樣 |
| `-noMidStop` | 飛遠時的半空停下不重組泡泡、不換清單 | 半空合泡泡佔多少 |
| `-landDefer` | 降落後的清單和 recluster 晚 0.6 秒 | 降落的長幀是不是我們觸發的 |
| `-reelMain` | 播放器照 034 在主執行緒建（3.3） | ec71aa2 的改法有沒有效 |
| `-noReelWarm`、`-reelNow` | 不預載；不等 850ms | 預載剩多少成本；拿掉延後會不會變差 |
| `-noPanelShadow`、`-noBubbleShadow` | 面板底板、泡泡不畫影子 | vSepConvolve 是誰 |
| `-smallBurst` | PinBurst 縮成 220×240（4.F） | _display 非字形的 19 個、madvise 是不是它 |

### 2.3 要改的地方

- 4.A 的 EmojiArt 整段放進來，連同「要換的地方」那幾處（圖釘、泡泡、🎲 和預熱的 .task）一起改，-emojiImg、-emojiWarm、-noSpin 和 🎲 的 -noEmoji 才有作用。沒加參數時 parts 是空的、預熱直接 return，畫面一律走原本的 Text。
- Models.swift 的 Cat（:40-41）加同名參數的 init：`self.emoji = Flag.on("-noEmoji") ? "" : emoji`，其他欄位照填。
- MapTab.swift:1678 的 `return VStack` 前加 `let hs: CGFloat = hopping && !Flag.on("-noHopScale") ? 1.3 : 1`，:1691 改成 `.scaleEffect(x: sx * hs, y: sy * hs, anchor: .bottom)`。
- 抽一間，MapTab.swift:430 換成：
  ```swift
  let drawnOne = drawer.pick(store, pool, k: 1, avoid: avoid).first
  // 在 store.mapBase 找：範圍是「地圖上看到的」時遠的店不在 pool 裡
  let wins = Flag.value("-drawWin")?.split(separator: ",").map(String.init) ?? []
  let want = wins.isEmpty ? nil : wins[Flag.draws % wins.count]
  if want != nil { Flag.draws += 1 }
  guard let win = want.flatMap({ id in store.mapBase.first { $0.id == id && $0.lat != nil && $0.lng != nil } }) ?? drawnOne else { return }
  ```
  :436 換成：
  ```swift
  let canHop = shown.filter { $0.id != win.id && $0.id != pins.sel && !hidden.contains($0.id) }
  let hoppers = wins.isEmpty ? Array(canHop.shuffled().prefix(Int.random(in: 6...8))) : Array(canHop.sorted { $0.id < $1.id }.prefix(7))
  ```
  pick 照跑，成本一樣。record() 會記進 7 天不重複，量完清掉 drawRecent。店的 id：:539 後加 `if Flag.on("-perfOverlay") { print("[perf] 選中 \(p.name) \(p.id)") }`。
- 入口：Draw.swift:190 前加 `Perf.shared.mark("抽一間：骰子")`，Draw.swift:353 前加 `Perf.shared.mark("抽一間：面板")`。
- 飛行：CamQuiet（MapPanel.swift:38-42）加 `var flyStart: CFTimeInterval = 0`、`var leg2: CFTimeInterval = 0`。MapTab.swift:570 後加 `quiet.flyStart = CACurrentMediaTime(); quiet.leg2 = 0`，:575 改成 `selfMoved = true; quiet.leg2 = CACurrentMediaTime()`。鏡頭停下的回呼（:170-193）：開頭加 `let sp = Perf.begin("鏡頭停下"); defer { Perf.end("鏡頭停下", sp) }`，:173 前加 `let flying = quiet.flyTo != nil`，:177 的 mark 拿掉，:179 前加：
  ```swift
  // 第二段還沒開始、或開始不到 0.4 秒的停下才算半空停下；手指拖的不算
  let now = CACurrentMediaTime()
  let midAir = flying && !landed && !pos.positionedByUser && (quiet.leg2 == 0 || now - quiet.leg2 < 0.4)
  if flying {
      let ms = Int((now - quiet.flyStart) * 1000)
      Perf.shared.mark(landed ? "飛完（第 \(ms) ms）" : midAir ? "飛行中停下（第 \(ms) ms）" : "停下但沒對上終點（第 \(ms) ms）")
  }
  ```
  :180 後加 `if midAir && Flag.on("-noMidStop") { return }`。:190 前加 `if landed && Flag.on("-landDefer")` 的分支：寫法同 4.E，但 0.6 秒後連 `recluster(proxy)` 一起做、先 `Perf.shared.mark("降落後補做")`，最後 return。如果「停下但沒對上終點」出現在第 800ms 左右，表示降落沒對上 15% 容差，本身就要修。
- 其他記號：recluster（:662）包 `Perf.begin("recluster")`；:753、:762 前 mark「泡泡直接換」「泡泡換上」；FoodPin、ClusterBubble 的 onAppear（:1643、:1945）開頭各打 `Perf.signposter.emitEvent`（圖釘出現、泡泡出現），NearbyHost.body（:905）開頭用 `let _ = Perf.signposter.emitEvent("附近重算")`（body 是 ViewBuilder，要寫 let _）。
- 影片，MapTab.swift:546 換成：
  ```swift
  if Flag.on("-noReelWarm") {
  } else if Flag.on("-reelNow") { ReelCache.warm(p) }
  else { Task { try? await Task.sleep(for: .milliseconds(850)); if pins.sel == p.id { ReelCache.warm(p) } } }
  ```
- 影子：:1055 的 shadow 在 -noPanelShadow 時 opacity 和 radius 都給 0，:1937 用 -noBubbleShadow 同樣做。:1755 用 `if Flag.on("-smallBurst") { 4.F 的小框 } else { 原本的 Canvas }`。

### 2.4 實驗

共同做法：每輪 `simctl terminate` 再 `simctl launch booted <bundle id> -perfOverlay <參數>`，固定位置；起點是首頁地圖、中段面板、沒選圖釘。「冷」是開 App 等落完 3 秒（換圖時等 Console 的「[emoji] 預熱完成」）後第一次，「熱」是同次啟動第二次。先開 `sample $(pgrep -x FoodMap) 4 1 -mayDie -file x.txt` 和 `simctl io booted recordVideo`，約 0.5 秒後動手。

E1 基準（不加參數，同時錄 5.3 的 xctrace）。s1b 點一根近的圖釘（浮層「移地圖」沒有「（遠）」）；s2b 用 `-drawWin <遠的店>` 按 titleRow 的 🎲（要有「移地圖（遠）」和「飛完」）。比在忙、字形那支、loadPartAtIndex、ApplyVariations、InsetLayoutComputer、ReelCache.player、Supa.reelVideo、長幀。loadPartAtIndex 集中在一兩幀，4.A 會少掉長幀、排第一；攤開、每幀不到 1.5ms，4.A 只省 CPU、往後排。

E2 s1b 的 emoji 來源。同一根近的圖釘，四組（不加、`-noEmoji`、`-emojiImg all`、`-emojiImgSel`），冷熱各一次（熱：關大卡，點另一根同分類的近圖釘），比 loadPartAtIndex、字形那支、madvise、mutexwait。
- -noEmoji 沒降：不是分類 emoji，看 5.1 的其他路徑。
- -noEmoji 有降、熱的本來就低：第一次載入，-emojiWarm 冷的確認後做 A'。
- 熱的也高、-emojiImg all 也降：每次縮放都重畫，做 A。
- -emojiImgSel 接近 all：成本在選中那根；接近不加參數：在別根、大卡 meta（:1363、:1411）或卡片列（:1797），後兩處 A 不管。-emojiImgSel 換圖那刻可能多一次交叉淡入，只影響量測。

E3 s2b 的字形來源。同一個 -drawWin，五組（不加、`-noHopScale`、`-noSpin`、`-emojiImg pin`、`-emojiImg all`），比 HVF、CopyGlyphPath 那支、ApplyVariations。前兩組降的是跳釘、🎲 的份量；-emojiImg pin 消得掉跳釘那份，A 才有用。ApplyVariations 留著的候選是泡泡家數（:1931）放大、店名牌從 0.4 倍彈出（:1624-1632），還有量測浮層的粗體等寬字（Perf.swift:157，浮層每次都開，A/B 兩邊一樣）。再用 `-drawWin A,B` 做第二趟（先抽遠的 A，關大卡，再抽起點附近的 B）：第二趟 HVF 還在是每個新倍率都重組，接近 0 是第一次載入。

E4 入口。同一個 -drawWin，一次按 🎲，一次從設定面板按「抽！」，比 __semwait_signal、SurfacePool、長幀。只有面板那次等 surface，是收 sheet 和 draw 擠在同一幀；都沒有，上一輪那 90 個比較可能跟飛行改法有關（推論；fe3 可能飛回原地、沒降落到新地區，這和飛行方式本身分不開）。不管結果都不延後 draw。

E5 降落。先看浮層有沒有「飛行中停下（第 300 多 ms）」、「飛完」第幾 ms；再 `-noMidStop`、`-landDefer` 各一次，比第 1 段尾和降落後的長幀、SwiftUI 圖更新（034 約 95）。

E6 影片。Wi-Fi，每輪點這次沒點過、有 IG Reel 的店。四組：不加、`-reelMain`、`-noReelWarm`、`-reelNow`，比主執行緒的 ReelCache.player、Supa.reelVideo、Console 的「在主執行緒：false」、選中後 0.8 到 1.5 秒的長幀；同次再點第二間，看是否只有第一次貴。不加參數接近 0、-reelMain 約 16，ec71aa2 有效；主執行緒還留著 AVFoundation 樣本，可能是初始化內部會同步回主執行緒（推論，要看那幾個樣本的上層）。

E7 影子和光圈。`-noPanelShadow`、`-noBubbleShadow`、`-smallBurst` 各量一次 s1b，比 vSepConvolve（034 是 5、6）、_display 非字形部分、madvise。

E8 實機。A 上線前用實機 Instruments 看 HVF，實機很小就不值得問 Anthony。

## 3. 現在就可以做的小修

不改外觀和時機，不碰行動網路不預載（Reel.swift:168）。

### 3.1 Drawer.weight 的日期快取

Draw.swift:130 每間店每次都用 DateFormatter 解析。:127-132 換成：

```swift
@ObservationIgnored private var born: [String: Date?] = [:]   // 解析過的 created_at 日期

private func weight(_ store: Store, _ p: Place) -> Double {
    let dist = store.distance(p).map { 1 / (1 + $0 / 1000 / 2) } ?? 1
    guard !p.been else { return dist }
    let k = String((p.created_at ?? "").prefix(10))
    let d: Date?
    if let hit = born[k] { d = hit } else { d = Self.day.date(from: k); born.updateValue(d, forKey: k) }
    let days = d.map { Date().timeIntervalSince($0) / 86400 } ?? 0
    return dist * (1 + min(max(days, 0), 90) / 90)
}
```

用 updateValue 才記得住「解析不出來」。預期上限：第二次以後按，weight 從 3 個降到 0 到 1 個（store.distance 還在），也就是少 2 到 3 個樣本，按下那幀省約 3 到 4ms；那幀本來不是長幀，只算整潔。

### 3.2 拿影片網址的請求和解 JSON 移出主執行緒

Supa 是 @MainActor，Reel.swift:145 的 Task 繼承主執行緒，所以 reelVideo 的 3 個樣本在主執行緒解 JSON（Supa.swift:278-279）。Supa.swift:7、:8 加 `nonisolated`，:265-280 拆兩段，憑證留在主執行緒：

```swift
static func reelVideo(_ source: String) async throws -> URL? {
    let token = try await fresh().access_token
    return try await reelVideoRequest(source, token: token)
}
// Swift 5 模式下在背景執行緒池跑（以後開 NonisolatedNonsendingByDefault 要加 @concurrent）
nonisolated private static func reelVideoRequest(_ source: String, token: String) async throws -> URL? {
    // 原本 :267-279，Authorization 用傳進來的 token
}
```

預期上限：每支新影片主執行緒少約 3 個樣本（約 4ms）。

### 3.3 店家頁自己建的播放器也搬到背景

沒預載到時 Reel.swift:50、:63 還在主執行緒建 AVPlayer。:50 在推頁開始後先睡 350ms（:47）再等拿網址，所以落在推頁動畫尾巴或剛結束（推論，要看網址有沒有快取）；:63 是串流 6 秒沒成功後的備案，跟推頁無關，只是一起改。Made（Reel.swift:181）旁邊加：

```swift
static func build(_ u: URL, _ pr: TaskPriority = .utility) async -> AVPlayer {
    if Flag.on("-reelMain") { return player(u) }       // 量測用：照 034 在主執行緒建
    return await Task.detached(priority: pr) { () -> Made in
        let t = CACurrentMediaTime()
        let m = Made(player(u))
        print("[reel] 建播放器 \(Int((CACurrentMediaTime() - t) * 1000)) ms，在主執行緒：\(pthread_main_np() != 0)")
        return m
    }.value.player
}
```

Reel.swift:173 改成 `let pl = await build(u)`，:174 的 else 先 `pl.replaceCurrentItem(with: nil)`（重複的那支馬上停止緩衝），:175 放 pl。:50 改成 `u = f; p = await ReelCache.build(f, .userInitiated)`，:63 改成 `p = await ReelCache.build(local, .userInitiated)`。

預期上限：沒預載到的店，進店家頁後少一次主執行緒建播放器（034 預載那條是 16 個，約 22 到 23ms，可能只有這次啟動第一次這麼貴）。驗證看 Console 和 Time Profiler 的執行緒，不要用主執行緒上打的 signpost。

## 4. 看實驗結果再決定的修法

### A. emoji 換成預先畫好的圖

觸發條件：E2 或 E3 的 -emojiImg 讓 HVF 降 40 個以上、熱的也高，E1 顯示擠在長幀裡（或 Anthony 想省 CPU），E8 實機也看得到，Anthony 看過截圖。放 MapTab.swift 檔尾（不開新檔，免改 pbxproj）：

```swift
// emoji 先畫成圖，縮放旋轉時不用從字型重組字形。body 只查表，畫圖只在 warm()；沒畫好照舊用文字
@MainActor @Observable final class EmojiSlot { var img: UIImage? }

@MainActor enum EmojiArt {
    enum Part: String { case pin, bubble, dice }
    static let parts: Set<String> = {          // 上線時預設改成三種都有
        guard let v = Flag.value("-emojiImg") else { return Flag.on("-emojiImgSel") ? ["pin"] : [] }
        return v == "all" ? ["pin", "bubble", "dice"] : Set(v.split(separator: ",").map(String.init))
    }()
    static let warmOnly = Flag.on("-emojiWarm")
    static var scale: CGFloat = 3        // warm 前由 MapTab 用 displayScale 蓋掉
    static let pad: CGFloat = 4          // 四邊多畫一點，不切到
    private static var slots: [String: EmojiSlot] = [:]
    static func zoom(_ p: Part) -> CGFloat { p == .pin ? 1.5 : p == .bubble ? 1.1 : 1 }   // 最大放大倍率

    static func slot(_ e: String, _ size: CGFloat) -> EmojiSlot {
        let k = "\(e)@\(Int((size * 100).rounded()))"
        if let s = slots[k] { return s }
        let s = EmojiSlot(); slots[k] = s; return s
    }
    static func img(_ e: String, _ size: CGFloat, _ p: Part) -> UIImage? { parts.contains(p.rawValue) ? slot(e, size).img : nil }
    static func render(_ e: String, _ size: CGFloat, _ p: Part) {
        let s = slot(e, size)
        guard !e.isEmpty, s.img == nil else { return }
        let r = ImageRenderer(content: Text(e).font(.system(size: size)).padding(pad))
        r.scale = scale * (warmOnly ? 1 : zoom(p))
        let i = r.uiImage
        if !warmOnly { s.img = i }
    }
    // 畫一張睡 50ms（超過一幀），不擠在同一幀
    static func warm(_ list: [(String, CGFloat, Part)]) async {
        for (e, size, p) in list where warmOnly || parts.contains(p.rawValue) {
            if Task.isCancelled { return }
            render(e, size, p)
            try? await Task.sleep(for: .milliseconds(50))
        }
        print("[emoji] 預熱完成")
    }
}

struct EmojiGlyph: View {
    let e: String, size: CGFloat, part: EmojiArt.Part
    var use = true
    var body: some View {
        if use, let i = EmojiArt.img(e, size, part) {
            Image(uiImage: i).interpolation(.high).padding(-EmojiArt.pad)
        } else {
            Text(e).font(.system(size: size))
        }
    }
}
```

要換的地方：
- 圖釘 MapTab.swift:1681：`EmojiGlyph(e: place.cat.emoji, size: 21, part: .pin, use: !Flag.on("-emojiImgSel") || on)`（念法由 :1611 決定，不變）。
- 泡泡 :1930：`if !c.emoji.isEmpty { EmojiGlyph(e: c.emoji, size: 15, part: .bubble) }`（念法在 :1946）。
- 🎲：DiceChip（Draw.swift:178）加 `@ScaledMetric(relativeTo: .subheadline) private var dice: CGFloat = 15`，:193 換成下面這段（:194 不動），:218 後加 `.onChange(of: dice) { EmojiArt.render("🎲", dice, .dice) }` 換字級時補畫。
  ```swift
  Group {
      if let i = EmojiArt.img("🎲", dice, .dice) {
          // 念法跟原本一樣；Anthony 要只念「抽一間」就改 .accessibilityHidden(true)
          Image(uiImage: i).interpolation(.high).padding(-EmojiArt.pad).accessibilityLabel(Text("🎲"))
      } else {
          Text(Flag.on("-noEmoji") ? "" : "🎲")
      }
  }
  .rotationEffect(.degrees(reduce || Flag.on("-noSpin") ? 0 : Double(drawer.spin) * 720))
  ```
- 預熱：MapTab 加 `@Environment(\.displayScale) private var displayScale`，:201-205 的 .task 後面再加一個：
  ```swift
  .task {
      guard !EmojiArt.parts.isEmpty || EmojiArt.warmOnly else { return }
      // 等落下播完（約 1.8 秒，:1470、:1663-1665）；沒有店不會落下（:1455），最多等 10 秒
      let t0 = CACurrentMediaTime()
      while CACurrentMediaTime() - t0 < 10, pins.dropStart == 0 || CACurrentMediaTime() - pins.dropStart < 2 {
          try? await Task.sleep(for: .milliseconds(250))
          if Task.isCancelled { return }
      }
      EmojiArt.scale = displayScale
      let es = Cat.order.compactMap { Cat.all[$0]?.emoji }
      // 型別寫明，不要用 + 串 tuple 陣列（型別推斷可能太慢或推不出 .dice）
      var list: [(String, CGFloat, EmojiArt.Part)] = []
      for e in es { list.append((e, 21, .pin)) }
      for e in es { list.append((e, 15, .bubble)) }
      list.append(("🎲", UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 15), .dice))
      await EmojiArt.warm(list)
  }
  ```

倍率：用「螢幕倍率乘最大放大倍率」畫，放到最大仍是縮小顯示，不會糊。螢幕倍率在 MapTab 讀，Annotation 裡拿不到環境值（:1563）。選中 spring（:1700）衝到約 1.39，PinPress（:1549-1550）回彈再多約 2.5%，相乘約 1.43，跳釘最高約 1.35，圖釘取 1.5；泡泡彈出加回彈約 1.07，取 1.1；🎲 只旋轉，取 1。全部不到 1MB。

A'（只預熱）：熱的本來就低時做，parts 留空、warmOnly 預設打開，外觀不變。預熱能不能讓 layer 命中字形快取是推論，用 -emojiWarm 確認。

預期上限：s1b 字形那支 63 個（其中 HVF 56 個；別條路徑上的 loadPartAtIndex 至少 6 個要看 5.1）、s2b 的 HVF 52 個（4 秒累計），layer 還是要重畫，只是畫圖比組字形便宜，不會全部歸零；ApplyVariations 不動。如果 E1 顯示樣本是攤開的，長幀數不變，只省 CPU。店家頁 PinGlyph（PlaceDetail.swift:442）、選單 MenuPin（PinMenu.swift:107）可以一起換。

### B. 850ms 的預載延後

觸發條件：E6 的 -reelNow 沒讓選中那幾幀變差。這會改預載時機、少掉「很快換別間就不預載」，要先問 Anthony；同意就把 :546 改成直接 `ReelCache.warm(p)`。預期：主執行緒成本不變，預載早 0.85 秒，進店家頁時緩衝較多。

從程式推出、還沒量過的風險：850ms 內點進店家頁，PlaceMedia 用 take（Reel.swift:42）拿走或自己建一支，850ms 一到 pins.sel 還是這間，又建第二支。E6 時試一次。網址第一次拿到就記在記憶體，第二次 warm 不會再打 reel-video，所以要看的是同一間出現兩次「[reel] 建播放器」（3.3 加的那行）；有的話就在 :546 的條件加 `store.mapPath.isEmpty`，時機不變。

### C. 面板影子改成固定高度的上緣條

觸發條件：-noPanelShadow 讓 vSepConvolve 降到 0。:1055 改成（底色不透明，會蓋住上緣條下緣）：

```swift
.background(alignment: .top) {
    ZStack(alignment: .top) {
        UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26).fill(Color.bg)
            .frame(height: 60).shadow(color: .black.opacity(0.12), radius: 12, y: -2)
        UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26).fill(Color.bg)
    }
    .ignoresSafeArea(edges: .bottom)
}
```

留 `-panelShadowOld` 切回原寫法對照。預期上限是 vSepConvolve 那 5 個；整層用 CPU 重畫的話上緣條照樣每幀模糊，不保證有效。畫面要一樣，看得出差別先問 Anthony。

### D. 飛行途中的停下不重組泡泡

觸發條件：E5 有「飛行中停下」，-noMidStop 讓長幀明顯下降。把那行的條件改成只看 midAir（用第二段開始時間判斷，降落那次一定照常處理）。畫面會變（不在半空先合再拆），先錄 A/B 給 Anthony 看。預期上限是少一次先合再拆，數字看 E5。

### E. 降落時附近清單晚 0.6 秒再換

觸發條件：-landDefer 讓長幀跟著往後移約 0.6 秒。MapTab 加 `@State private var nearTask: Task<Void, Never>?`，:191 改成：

```swift
if landed && pins.sel != nil {
    // 大卡蓋著清單：晚 0.6 秒再換，不跟降落、泡泡重組擠在同一幀
    selfMoved = false
    seenBox.set(c.region, publish: false)
    nearTask?.cancel()
    nearTask = Task { try? await Task.sleep(for: .milliseconds(600)); if !Task.isCancelled { seenBox.set(seenBox.peek, publish: !trip.on) } }
} else if selfMoved && !landed { selfMoved = false } else { selfMoved = false; seenBox.set(c.region, publish: !trip.on) }
```

預期上限：降落那幾幀少一次藏著的清單重建，總樣本不會少多少。

### F. PinBurst 縮成小框

觸發條件：-smallBurst 讓 _display 非字形部分、madvise 或 backboardd 明顯下降。:1755 換成（光圈最上緣 3.5、糖粒最下緣 218.5，都在框內）：

```swift
Canvas { ctx, _ in Self.draw(ctx, CGPoint(x: 110, y: 150 - rise), t, color) }
    .frame(width: 220, height: 240)
    .position(x: at.x - o.x, y: at.y - o.y - 30)
```

預期上限是那 19 個加 madvise 8 個，畫面不變。spot.at 的寫入門檻不做，省不到。

### G. 其他等量測的

- Reel.swift:124 的 stop() 每次 .task 開頭（:39）都同步 setCategory。取樣推頁看得到才改，而且要和 Reel.swift:26 的 .playback 排同一個佇列，不然 .ambient 可能蓋掉 .playback。
- InsetLayoutComputer：先用 5.1 確認是 :268 的面板（升降的 spring 每幀重量）還是 :239 的搜尋列。
- 變淡、店名牌、拉遠幅度、🎲 旋轉、跳釘、.drawingGroup() 牽涉外觀，要動先問 Anthony。

## 5. 量測方法

### 5.1 sampletree 補丁（不用重量）

在 Anthony 的 Mac 上對 s1b、s2b 的原始 sample 檔跑；sampletree 在 apps/food-map-ios/tools/sampletree.py（repo 根目錄沒有 tools/），本來就只讀 main-thread 那段（apps/food-map-ios/tools/sampletree.py:62）。下面的指令都在 apps/food-map-ios/tools/ 裡跑。檔尾加：

```python
# 補丁：印出指定名字的上層呼叫鏈和子樹；名字後加 @函式庫 只看那個函式庫
sys.setrecursionlimit(10000)
def hit(n, key):
    name, _, lib = key.partition('@')
    return name in n.name and (not lib or lib in n.lib)
def chains(n, path, key, acc):
    path = path + [n]
    if hit(n, key) and n.busy > 0:
        acc[' < '.join(f'{p.name[:70]} [{p.lib}]' for p in reversed(path[-14:-1]))] += n.busy
        return
    for k in n.kids:
        chains(k, path, key, acc)
def sub(n, key, depth, found=False):
    on = found or hit(n, key)
    show = on and n.busy >= 2
    if show:
        print('  ' * depth + f'{n.busy:6d} {n.name[:110]}  [{n.lib}]')
    for k in n.kids:
        sub(k, key, depth + (1 if show else 0), on)
for key in sys.argv[2:]:
    acc = collections.Counter()
    chains(main, [], key, acc)
    print(f'\n==== {key}：{sum(acc.values())} 個樣本，上層（由近到遠）')
    for c, v in acc.most_common(6):
        print(f'  {v:5d}  {c}')
    print(f'---- {key} 底下')
    sub(main, key, 1)
```

```
python3 sampletree.py s1b.txt '<deduplicated_symbol>@FoodMap' InsetLayoutComputer 'closure #6 in closure #1 in closure #1 in closure #5' loadPartAtIndex 'TFontHandler::CopyGlyphPath' FPFontCopyGlyphPath __psynch_mutexwait vSepConvolve madvise 'ReelCache.player'
python3 sampletree.py s2b.txt '<deduplicated_symbol>@FoodMap' 'DiceChip.body' ApplyVariationsToGlyph loadPartAtIndex SurfacePool __semwait_signal __psynch_mutexwait vSepConvolve
```

要看：被合併的是誰；哪個 inset；closure #6 底下有沒有 pinFrame、BurstSpot.at.setter（有才確認是 MapTab.swift:160）；loadPartAtIndex 另外 6 個以上在哪；mutexwait 等誰的鎖；vSepConvolve 在誰底下。

### 5.2 嚴格的閒置定義

```
sed "s/^IDLE = .*/IDLE = ('__CFRunLoopServiceMachPort',)/" sampletree.py > st_strict.py
python3 st_strict.py s2b.txt
```

新的「在忙」減 480，就是 runloop 睡覺以外的等待；有幾十到上百個，那 269ms 有一部分是主執行緒在等。直接 grep 原始檔要先切出主執行緒：`awk '/Thread_.*main-thread/{f=1;print;next} /^ *[0-9]+ Thread_/{f=0} f' s2b.txt > main.txt`。

### 5.3 signpost 加 xctrace

```
xcrun xctrace record --template 'Time Profiler' --instrument os_signpost --attach $(pgrep -x FoodMap) --time-limit 8s --output s.trace
xcrun xctrace export --input s.trace --toc
```

照 toc 匯出 time-profile 和 os-signpost，跑 `python3 apps/food-map-ios/tools/stalls.py tp.xml 25`，把停頓對上 2.3 加的記號，回答 loadPartAtIndex 的時間分布、每個長幀時主執行緒在做什麼。Time Profiler 只記在 CPU 上的樣本，主執行緒在等不會有段落，要配合 5.2 看。浮層的毫秒數（Perf.swift:86-96）量不到 render server。

### 5.4 錄影和 render server

每個長幀對錄影，看該動的東西有沒有停住；沒東西該動就不是卡頓。同時 `sample $(pgrep -f 'CoreSimulator.*backboardd' | head -1) 4 1 -file bbd.txt`。也要問清楚那份幀清單怎麼量；如果看畫面有沒有變，靜止會被算成長幀。

## 6. 回歸測試

- 沒加啟動參數時和 ec71aa2 一樣；按下那一幀圖釘開始壓扁、🎲 開始轉、第一根開始跳。
- 抽一間分布不變，7 天不重複照舊，created_at 空白的店也抽得到；憑證過期時拿影片網址照常先換。
- 點圖釘等 1 秒進店家頁有「用先緩衝好的播放器」；馬上進、串流失敗改下載（Reel.swift:58-65）也能播；連點三間 ready 最多 2 個；行動網路下沒有 reel-video 請求；群組、收藏頁的卡片照樣預載。
- emoji：動作和時間不變；靜止、選中、跳最高、變淡、泡泡、🎲（轉時和停下）截圖放大比對，含深色和減少動態；封面照照樣蓋住 emoji；新帳號沒店時預熱 10 秒內結束；最大字級 🎲 大小對、換字級會補畫；VoiceOver 念法不變。
- 降落：抽中的店原本在泡泡裡，降落後看得到那根和店名牌；每次有「飛完」；飛到一半拖地圖，停下後泡泡照常重組；降落後 0.6 秒內關大卡，卡片列捲到抽中那間（:1113），最高段清單是新地區，捲卡片列不會把鏡頭拉回原地。
- 面板三段和拖面板時上緣影子一樣；光圈和糖粒沒被切掉。

## 附錄 A：上一輪修法在 ec71aa2 的狀態

| 項目 | 狀態 | 位置、還差什麼 |
|---|---|---|
| S12 A 實驗開關 | 部分 | 只有 -perfOverlay，第 2 節補上 |
| S12 B 跳釘每根一個盒子 | 已做 | MapTab.swift:1495-1526；要同條件再量才算驗收 |
| S12 C ReelCache 離開主執行緒 | 部分，做法不同 | 建播放器在背景（Reel.swift:173-184）；網址和 JSON、店家頁自己建的還在主執行緒（3.2、3.3）；850ms 還在（4.B） |
| S12 D、E、F、G | 沒做 | 3.1、4.A、4.F；G 看 E2 冷熱的 conformance |
| S56 一.1 target、targetX | 已做 | TripPanel.swift:1356-1385，還沒用 s6 驗 |
| S56 一.2 到一.5、二.3 | 沒做 | block 仍讀 drag（TripPanel.swift:478-525）；numericText（:734 等六處、TripTop.swift:124）；影子（:521、:632、:1450）；scaleEffect 順序（:518-520、:629-631）；底板（:277-279） |
| S56 二.4 | 部分 | F6(b) 已做（TripPanel.swift:966-967） |
| S78 1、2 | 已做 | TripPanel.swift:104-123、MapTab.swift:997；開卡那幾幀還沒量 |
| S78 3 cardLift | 做法不同 | TripPanel.swift:798-800、:181 |
| S78 4 select(nil) 併同一個交易 | 沒做 | 附條件；MapTab.swift:213-216（fix-addcard 也改）、:1537-1539 |
| s7 J3 mergeTo 拆盒子 | 已做 | MapTab.swift:1506-1510 等 |

ec71aa2 另外做了加站卡框地圖晚 40ms（TripPanel.swift:695-698）和泡泡吃掉疊到的東西（MapTab.swift:684-712）。

## 附錄 B：仍然值得做的順序

1. 量測 build 和 5.1、5.2（不用重量，先做）。
2. 小修 3.1 到 3.3，可以跟量測 build 一起做。
3. E1 到 E3、E8，決定 A 或 A'（A 要 Anthony 看截圖）。
4. E5 決定 D、E（D 改畫面，先問）。
5. E6 決定 B（改預載時機，先問）。
6. E7 決定 C、F。
7. E4 只為弄清楚上一輪的 semwait。
8. S56 另外用 s6 量；4.G 等量到再設計。
