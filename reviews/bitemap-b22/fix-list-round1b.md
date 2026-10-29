# Bitemap 第 1 輪補充修正（對照 fe3e591 模擬器結果，2026-10-29）

來源：fe3e591 模擬器結果（首頁往下拉 B1–B7 過；A1 抽一間仍不飛；B8 行程清單往下拉不動）。每項先由調查員讀 fe3e591 找根因，再由兩位反方分別攻擊「原因」和「修法」，下面是合併後的最後版本。行號都以 fe3e591 為準。
卡頓 sample（s1、s2、s5–s8）的逐段分析另外一份，做完會放在同一個資料夾。

結案、不用改：
- ✕ 關大卡「重畫 地圖」+1：是 `pins.cleared` 刻意讓 Map 放掉選取（MapTab.swift:75、PinState），維持。只要 ✕ 那一下沒有長幀就好。
- 行程按「完成」冒出抽一間面板：模擬器自己點到的。
- Apple 標誌在框下緣上方約 18pt（預期 11）：差的是 MapKit 自己的邊距，標誌仍在最低段面板和左下膠囊上方、拉面板不動，符合 HIG，不改。

建議順序：A1 → B8 → P4，一項一個 commit。A1 和 B8 都先加 log 讓模擬器證實原因，可以和修法放在同一個 build。

---

## A1 抽一間抽到遠的店，地圖不飛過去（P1）

### 原因
遠距離鏡頭只靠 `.mapCameraKeyframeAnimator(trigger: flight)`（MapTab.swift:172-184），picked() 的 :543 不寫 `pos`。首頁其他鏡頭動作（定位 :309/:311、近的店 :544、泡泡 :706、卡片列 :727、框收藏 :787/:790）都寫 pos，只有這條沒有。這條從 4b58936（建置 15）就這樣寫，找不到任何一次模擬器看過它真的飛過去的紀錄，所以不是第 1 批弄壞的。6691fad 擋掉的 focus() 只是旁路，主路徑沒變，所以還是不動。

keyframe 到底是「沒觸發」還是「跑完被 binding 的舊 pos（宜蘭）套回」，Apple 文件沒寫，只能用下面的 log 分。不管哪一種，修法都一樣：讓鏡頭最後一定由 pos 決定。

### 第 0 步：一行實驗（可以跟正式修法同一個 build 先試）
把 :543 換成：
```swift
if far && !reduce { quiet.flying = true; withAnimation(.smooth(duration: 0.8)) { pos = .region(to) } }
```
換了就飛 → 原因確定是「keyframe 不寫 pos」。順便看 continuous 回呼的 camera.distance 中途有沒有變大：沒有變大，就證實 MapKit 不會自己拉遠，所以正式修法要自己做拉遠那段。

### 正式修法：拿掉 keyframe，兩段都寫 pos，拉遠那段停下時不算「停好」
1) MapPanel.swift:37-42 的 CamQuiet 換成：
```swift
final class CamQuiet {
    var until: CFTimeInterval = 0
    var flying = false      // 飛去遠的店還沒停（降落停下時在量測浮層記一筆「飛完」）
    var fly = 0             // 遠的店第二段（降落）的票號：換別間、按定位／泡泡、框收藏就作廢
    var climbUntil: CFTimeInterval = 0   // 這時間之前停下的是第一段（拉遠），還在半空，不算停好
    func hush(_ s: Double = 1.0) { until = max(until, CACurrentMediaTime() + s) }
    // 別的鏡頭動作接手：還沒降落的那段作廢，也不記「飛完」
    func stopFly() { fly += 1; flying = false; climbUntil = 0 }
}
```

2) MapTab.swift 刪掉：:30-31 的註解和 `@State private var flight: Flight?`；:172-184 的註解和整段 `.mapCameraKeyframeAnimator(trigger: flight) { ... }`；:1793-1797 的註解和 `struct Flight`。

3) MapTab.swift:163-171 的 onEnd 換成（拉遠那段停下只記位置就 return：不換附近、不重算泡泡、不記「飛完」；放在 afterFit 後面，行程不受影響）：
```swift
.onMapCameraChange { c in
    trip.toScreen = { proxy.convert($0, to: .global) }
    if let f = trip.afterFit { trip.afterFit = nil; f() }
    // 飛去遠的店：第一段（拉遠）停下或被降落接手，還在半空
    if !trip.on, !pos.positionedByUser, CACurrentMediaTime() < quiet.climbUntil {
        store.mapRegion = c.region
        return
    }
    if quiet.flying {
        quiet.flying = false
        Perf.shared.mark(String(format: "飛完 %.3f,%.3f", c.region.center.latitude, c.region.center.longitude))
    }
    // 行程模式時下面的附近面板收著，不用跟著重算（離開行程時補一次）
    if selfMoved { selfMoved = false } else { seenBox.set(c.region, publish: !trip.on) }
    store.mapRegion = c.region
    recluster(proxy)
}
```

4) picked() :536-544 換成：
```swift
selfMoved = true
quiet.stopFly()   // 前一趟還沒降落的作廢
let cur = store.mapRegion ?? shownRegion
let span = cur?.span ?? MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
// 離畫面中心超過可見範圍的 60%：拉遠再降落；近的直接平移
let far = cur.map { abs(c.latitude - $0.center.latitude) > $0.span.latitudeDelta * 0.6 || abs(c.longitude - $0.center.longitude) > $0.span.longitudeDelta * 0.6 } ?? false
// 圖釘放在中段面板上面看得到那塊的中間（大卡比卡片列高一點，還是在大卡上面）
let to = aim(MKCoordinateRegion(center: c, span: span), grow: false)
guard far, !reduce, let from = cur else {
    withAnimation(.smooth(duration: 0.55)) { pos = .region(to) }
    return
}
// 很遠的店：先拉遠到同時看得到這裡和那間（至少 1.6 倍），再降落。兩段都寫 pos：鏡頭只聽 pos
// 換了城市：降落後「附近 N 間」跟著換成那裡（不設 selfMoved）
selfMoved = false
let dLat: Double = abs(to.center.latitude - from.center.latitude)
let dLng: Double = abs(to.center.longitude - from.center.longitude)
let outLat: Double = min(20, max(span.latitudeDelta * 1.6, dLat * 1.3 + span.latitudeDelta))
let outLng: Double = min(20, max(span.longitudeDelta * 1.6, dLng * 1.3 + span.longitudeDelta))
let midLat: Double = (from.center.latitude + to.center.latitude) / 2
let midLng: Double = (from.center.longitude + to.center.longitude) / 2
let out = aim(MKCoordinateRegion(center: .init(latitude: midLat, longitude: midLng),
                                 span: MKCoordinateSpan(latitudeDelta: outLat, longitudeDelta: outLng)), grow: false)
let ticket = quiet.fly
quiet.flying = true
quiet.climbUntil = CACurrentMediaTime() + 0.7     // 第一段約 0.4 秒停，降落約 1.0 秒停，中間切開
quiet.hush(1.5)
withAnimation(.easeInOut(duration: 0.4)) { pos = .region(out) }
Task {
    try? await Task.sleep(for: .milliseconds(400))
    // 換了別間、按了定位／泡泡、手指拖了地圖、進了行程：不降落
    guard quiet.fly == ticket, !pos.positionedByUser, !trip.on else {
        if quiet.fly == ticket { quiet.stopFly() }
        return
    }
    withAnimation(.easeInOut(duration: 0.6)) { pos = .region(to) }
}
```
（全部拆成有型別的 let，避免 type-check 逾時。拉遠範圍從固定 1.6 倍改成「框得住兩端」，跨縣市時飛行中段是縣市級地圖，不是空白圖磚；兩地近時退回 1.6 倍；上限 20 度防極遠。降落後附近清單換成那個城市，這是評審決定的體驗：飛到別的城市後，關掉大卡還看到原城市的卡片列不合理。）

5) 其他首頁寫 pos 的地方各加一行 `quiet.stopFly()`：定位鈕 :303 `Haptic.light()` 下一行；zoom() :699 `Haptic.light()` 下一行；fit() 的 Task 裡 :786 `quiet.hush()` 下一行。（focus() 有 :715 的 `guard pins.sel == nil`，飛行中走不到，不用加。）

### 模擬器
重現與證實（改之前或第 0 步）：
- 地圖拉到宜蘭街道級（畫面 1–3 公里寬）。DrawPanel 範圍「全部」、模式「一間」，用分類或價位讓只有台北那間符合。三條入口分開記：地圖上 🎲（有跳圖釘，約 1.1 秒後選中）、DrawPanel 的「抽」（先 dismiss 再 go）、DrawPanel 的歷史（Draw.swift:255，sheet 還蓋著時就選中）。
- 舊版的「飛完」mark 有漏洞：keyframe 沒跑時 flying 會一直留著，下一次手拖停下才記一筆。只採用「抽一間（抽中）」之後 1 秒內出現的。
- 暫時 print：picked :543 前印 far/cur/to；keyframe closure 內印 from→to；continuous 回呼印 center 和 distance；onEnd 印 center 和 `pos.region?.center`。判讀：沒有 KF → 沒觸發；KF 目標是台北、cam 走到台北後又跳回宜蘭 → 跑完被套回；KF 目標是宜蘭 → closure 讀到舊值。

驗修好（套正式修法）：
1. 三條入口各 5 次：先拉遠到看得到宜蘭和台北，再降落到台北；HUD 最後一行「飛完 25.0xx,121.5xx」，抽中後 1–1.2 秒內出現一次；台北那根圖釘在搜尋列下面、大卡上面。
2. 暫時在 climb 那個 return 前印 `CLIMB-END`：每趟最多 1 次，約在 0.4 秒；之後只有一次 END。飛行中台北的圖釘不會先合成泡泡再拆開。「重畫 地圖」從抽中到飛完最多 +1（降落後的分群）。
3. 關大卡後卡片列是台北的店，「附近 N 間」是台北的數字。
4. 回歸：近的圖釘照樣 0.55 秒平移；飛行中手指拖地圖 → 不降落；飛行中點另一根 → 只飛新的那根；飛行中按定位 → 停在定位、沒有「飛完」；飛行中按「行程」→ 進行程後不被拉走，行程框整天照常只動 1 次；減少動態 → 直接平移；地圖 geo 行維持「0,0 402×874・框 180–630」。

---

## B8 行程直清單在頂端往下拉，面板不動（P1）

### 原因（範圍確定，機制要 log 證實）
只要 ListPullDown 已經接上清單的 UIScrollView 而且 on 是 true，就算 .began 那一下 guard 沒過，手指繼續往下拉時清單回彈、contentOffset 變負，下一個 .changed 一定會接手，面板一定會動（PanelLift.swift:109）。「抓橫條拉得動」又排除了 on=false 和 lift 那條路（sheetDrag 寫的是同一個 lift.y）。所以「面板完全不動」只剩三種：
- (a) Finder 沒接上，而且之後不會再找：PanelLift.swift:62-72 只在 didMoveToWindow／didMoveToSuperview 找一次，還要通過 `contentSize.width <= bounds.width + 1`，不過就放棄。
- (b) 接上的不是使用者在拉的那個 UIScrollView，或那個實體後來被換掉。
- (c) UIScrollView 的 pan 根本沒開始。

(a)(b) 機率最高；(c) 很低，因為 build 22 的舊備案「放手才降一段」出現過（要靠 pan 開始才會觸發），列上的手勢之後沒改。首頁和行程在程式上找不到寬度判斷會不同的地方，所以 (a) 的確切機制是推測。

最快的判斷：**fe3e591 上行程清單在頂端往下拉約 100pt 後放手，面板有沒有降一段？** 有降 → (a)/(b)；沒降 → (c)，那 Finder 怎麼改都沒用。請模擬器順便回答這一題。

### 修法（不管是 (a) 還是 (b)，這版都修得到）
1) PanelLift.swift 的 Finder：拿掉寬度判斷（Finder 在清單「內容」裡，往上第一個 UIScrollView 就是清單本身）；layoutSubviews 和每次 updateUIView 都在下一輪補找（attach 有 `guard scroll !== s`，同一個不會重掛；不在排版當中 attach/detach）；加 name 和 DEBUG log。
```swift
struct ListPullDown: UIViewRepresentable {
    var on = true
    var name = ""                         // log 用：「首頁」「行程」
    var changed: (CGFloat) -> Void        // 往上為正（同 PanelDrag）
    var ended: (CGFloat) -> Void          // 預測會停的位移，往上為正

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> Finder {
        let v = Finder()
        v.isUserInteractionEnabled = false
        v.name = name
        let c = context.coordinator
        c.name = name
        v.found = { [weak c] s in c?.attach(s) }
        return v
    }

    func updateUIView(_ v: Finder, context: Context) {
        context.coordinator.on = on
        context.coordinator.changed = changed
        context.coordinator.ended = ended
        // 掛載那一刻清單可能還沒排好：排好後再補找（同一個不會重掛）
        DispatchQueue.main.async { [weak v] in v?.find() }
    }

    static func dismantleUIView(_ v: Finder, coordinator: Coordinator) { coordinator.detach() }

    final class Finder: UIView {
        var found: ((UIScrollView) -> Void)?
        var name = ""
        override func didMoveToWindow() { super.didMoveToWindow(); find() }
        override func didMoveToSuperview() { super.didMoveToSuperview(); find() }
        override func layoutSubviews() {
            super.layoutSubviews()
            DispatchQueue.main.async { [weak self] in self?.find() }
        }
        // 只能放在「直的」ScrollView 的內容裡：往上第一個 UIScrollView 就是清單本身
        // （不再看 contentSize/bounds：掛載當下可能還沒定，判斷失敗就永遠接不上）
        func find() {
            guard window != nil else { return }
            var p = superview
            var chain: [String] = []
            for _ in 0..<12 {
                guard let v = p else { break }
                if let s = v as? UIScrollView { found?(s); return }
                chain.append("\(type(of: v))")
                p = v.superview
            }
            #if DEBUG
            print("[pull] \(name) 找不到 UIScrollView：\(chain.joined(separator: " > "))")
            #endif
        }
    }
    // Coordinator：加 `var name = ""`；attach 後 DEBUG 印
    //   "[pull] \(name) 接上清單 id=\(ObjectIdentifier(s)) b=\(s.bounds.size) cs=\(s.contentSize) inset=\(s.adjustedContentInset.top)"
    // pan 的 .began 印 on、dy、vy、contentOffset.y、top、ObjectIdentifier(g.view!)；
    // 變成 handing 那一刻印「接手」並 Perf.shared.mark("清單接手面板")。其餘照舊。
}
```

2) TripPanel.swift:215-221：rows 先包一層再掛。rows() 是 @ViewBuilder，空白那天是兩個子 view，.background 會掛兩份 ListPullDown，接上以後放手會 settleSheet 兩次（從最高段一次掉到最低），回彈也可能一直被關掉。
```swift
ScrollView {
    // rows 是 @ViewBuilder（空白那天是兩個子 view）：先包一層，不然 background 會掛兩份
    VStack(spacing: 0) {
        rows(t, d: d, base: base, order: order, legs: legs, plan: plan)
    }
    .padding(.horizontal, 14).padding(.top, 2).padding(.bottom, 16)
    // 捲到頂再往下拉：面板跟著手指往下（清單不回彈），放開照面板的規則停段；拖站換順序時不接手
    .background(ListPullDown(on: drag.id == nil, name: "行程",
                             changed: { up in guard drag.id == nil else { return }; lift.y = up },
                             ended: { up in guard drag.id == nil else { lift.y = 0; return }; settleSheet(up) }))
}
.scrollDisabled(drag.id != nil)
```
MapTab.swift:1073 只補 `name: "首頁"`。

3) 不要把 StopCard 的 `.gesture(hold)` 改成 simultaneousGesture。如果 log 顯示是 (c)，先確認從站卡上能不能正常捲清單，再另外處理。

### 模擬器
- 先回答「放手後面板有沒有降一段」。
- Console 過濾 `[pull]`：開行程要有一行「行程 接上清單」，每次開面板只一行；沒有就看「找不到」那行印出的祖先鏈斷在哪。拉的時候有 began、接手，HUD 出現「清單接手面板」。
- B8：8 站以上、中段、清單在頂端，慢慢往下拉 100pt，面板 1:1 跟手、清單不回彈；放手停最低；拉不到 60 放手彈回中段；最高段重做降到中段，甩快直接到最低。2 站（內容比清單短）也要能拉。先往下捲再甩回頂端繼續拉，要在中途接手、不跳。
- 空白的一天：中段往下拉 150pt 到最低；最高段往下拉 150pt 只降到中段；放手後清單往上拉過頭還會回彈；log 只有一行接上。
- 不能壞：長按 0.35 秒拿起一站拖換順序（拖到清單底部面板高度不變，不出現「清單接手面板」）；左滑刪除；點站卡飛過去、再點展開；最低段站卡橫滑；從最低往上拉換成清單；抓橫條拉面板。
- 首頁 B1–B7 全部重跑（Finder 改了，首頁也受影響），log 有一行「首頁 接上清單」，tall 0↔1 來回不重複接。
- PerfHUD：拉的過程「重畫 行程面板」只在開始和結束多一兩次，不能每幀。

---

## P4 行程加站卡沒框進那間（P2，先證實再大改）

fe3e591 沒回報這項，不確定有沒有重測。換算本身（框 180–630、加站卡上緣 = top0 + size.height − cardH ≈ 587–616、fb 用 630）兩位都確認沒錯。目前唯一說得通的程式路徑：

- 加站卡高度和上一張的 cardH 差超過 8（TripPanel.swift:703-707，大多是店名一行／兩行互換），或開著搜尋時點結果讓鍵盤收起、size 改變（:149；picked 每次都會呼叫 trip.endTyping()），一兩幀內會再叫一次 placeCand → fitCoords，連發兩段 0.5 秒的 `pos = .region`。
- MapTab.swift:166 不管停下的是哪一段都把 afterFit 拿出來跑。若被打斷的那段送出了 onEnd（未證實），afterFit 用起飛中的鏡頭量，算出錯的 r2 蓋掉正確的目標，之後沒人再修。
- 另一個照設計不框的情況：已經排在「別天」的店，地圖上仍是一般圖釘（tripHidden 只藏這天），點了卡上寫「已經在第 N 天」，鏡頭不動。驗收時要記下卡上寫什麼，這種不算 bug。

### 現在就做（安全）：一張卡只框一次
- TripPanel 加 `@State private var candFit: Task<Void, Never>?`
- placeCand 的 guard else 分支加 `candFit?.cancel(); candFit = nil`
- :616 `fitCoords(line, card: true, animated: true)` 換成：
```swift
let cid = c.id
candFit?.cancel()
candFit = Task {
    try? await Task.sleep(for: .milliseconds(40))
    guard !Task.isCancelled, mode.cand?.id == cid else { return }
    fitCoords(line, card: true, animated: true)    // 這時 cardH 已經是這張卡量到的高度
}
```
（preview/previewN 照舊立刻設，只有鏡頭晚 40ms 起步。高度回呼、size 回呼再叫 placeCand 時會取消還沒跑的那次。）

### 加 log 證實，證實了再做 A
- fitCoords 算完 r 後印 `FIT #seq t= card= cardH= top0= H= ft= fb= winTop= window= wc= ctr=`（Int 用 %ld）。
- afterFit 裡印 `AF #seq/fitSeq age= yC= x= rho= yMid= wc=`，修正前印 `AF FIX`。
- MapTab onEnd 開頭印 `CAM END t= ctr= pending=`；pending=0 且有 preview 時印三點的螢幕 y（SETTLED）。
- addCard 印 `CARD h / old` 和卡片上緣 y。placeCand 的 guard 失敗印原因（沒座標／已在第 N 天）。
- 測：(1) 連點兩根店名一行的圖釘（應該只有一行 FIT）；(2) 一行、兩行店名交替點；(3) 開搜尋、鍵盤開著點結果；(4) 點 A 後 0.2 秒內點 B。
- 判讀：只有 (2)(3)(4) 重現，而且看到「FIT 兩行 → 0.1 秒內 CAM END pending=1 → AF age≈0.0x → AF FIX」→ 證實。(1) 也重現、只有一行 FIT、AF 的 yC≈405 → 原因在別處，回報 log 給評審。

A（證實後才做）：afterFit 改回傳 Bool，`false` 表示停下的不是這次的鏡頭、放回去等下一次。要點：
- TripMode.swift:63 `@ObservationIgnored var afterFit: (() -> Bool)?`；close() 加 `afterFit = nil`。
- MapTab.swift:166：`if let f = trip.afterFit { trip.afterFit = nil; if !f(), trip.afterFit == nil { trip.afterFit = f } }`
- fitCoords 閉包：開頭 `guard mode.on, seq == fitSeq, !pos.positionedByUser, let f = mode.toScreen else { return true }`；超過 2 秒 return true；`age < 0.3`（animated 時）或 r.center 離鏡頭框中心 (ft+fb)/2、地圖寬一半太遠就 return false；門檻第一版放寬到 120，量到正常到站的偏差後收緊到「實測 + 16」；運算拆成有型別的 let；TripPanel 檔頭加 `import QuartzCore`。
- 回歸重點：進行程、換天、點站、搜尋結果框圖時 HUD 都不能出現「框站補動」（A 會讓原本被 120pt 防呆丟掉的提早量測變成真的補動，若出現代表整天框圖的換算本身有偏差，要回報，不能讓 A 補掉）。按「完成」後首頁第一個 CAM END pending 必須是 0。
