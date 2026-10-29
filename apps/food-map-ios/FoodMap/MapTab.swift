import SwiftUI
import UIKit
import MapKit

// 首頁地圖：用 iPhone 內建的 Apple 地圖，收藏的店是食物圖釘；上面搜尋＋新增、篩選，下面「附近 N 間」一排卡片
struct MapTab: View {
    @Environment(Store.self) private var store
    // 一打開先框住所有收藏的店（不跳到目前位置），想看自己在哪按右下的定位鈕
    @State private var pos: MapCameraPosition = .region(MKCoordinateRegion(center: .init(latitude: 25.0418, longitude: 121.5436), latitudinalMeters: 9000, longitudinalMeters: 9000))
    // 選到哪根、抽一間的跳動：放在自己的物件裡，選圖釘時只有圖釘和下面的卡片重畫，整張地圖不用重算
    @State private var pins = PinState()
    @State private var loc = LocMgr.shared
    @State private var fitted = false
    @State private var adding = false
    @State private var noAddr = false
    @State private var scoping = false
    // 地圖現在看到的範圍（移動、縮放停下來才更新）；點卡片／圖釘造成的移動不算，免得下面的卡片一直換
    // 不放在 MapTab 自己的狀態：地圖每停一次就改，放這裡只有下面的面板跟著重算，整張地圖不用
    @State private var seenBox = SeenBox()
    private var shownRegion: MKCoordinateRegion? { seenBox.peek }
    @State private var selfMoved = false
    @State private var applied = Filter()   // 地圖畫的篩選，由 FilterSync 同步（body 不直接讀 store.mapF，收藏頁打字時背景地圖不重算）
    @State private var nearTask: Task<Void, Never>?   // 量測用 -landDefer：降落後晚 0.6 秒再換附近清單
    @Environment(\.displayScale) private var displayScale
    @Environment(\.dynamicTypeSize) private var dts
    @State private var spot = BurstSpot()
    @State private var drawer = Drawer.shared
    @State private var show: DrawShow?
    @State private var paneling = false
    // 泡泡：畫面上擠在一起（44pt 一格）的圖釘合成一顆，停下來才重算
    @State private var clusters: [PinCluster] = []
    @State private var hidden: Set<String> = []
    @State private var clusterTask: Task<Void, Never>?
    @State private var settleTask: Task<Void, Never>?      // 框地圖要修正時，泡泡晚一點重組的保險
    // 選到很遠的店：先拉遠再降落（第二段等第一段跑一陣子再開始）
    @State private var flyTask: Task<Void, Never>?
    // 地圖鋪滿整個畫面，鏡頭框的那塊：上面到搜尋列下緣，下面到「最低段面板上緣再上去 56」（Apple 標誌貼在這，HIG 要它停在
    // 可拉卡片最低位置上方、不跟著介面動）。開 App 量一次就不再變；進出行程、選圖釘都不改，不然整張地圖要重排（每次約 0.5 秒）
    // 面板停在中段時下面一截被蓋住：鏡頭動作都經過 aim()，把店放在看得到的那塊
    @State private var mapRect: CGRect = .zero
    @State private var dot = MyDot.shared
    @State private var headY: CGFloat = 0
    @State private var footY: CGFloat = 0
    // 鏡頭是自己移的（點圖釘、框收藏、邊距變了）：這段時間的鏡頭變動不算「手指拖地圖」
    @State private var quiet = CamQuiet()
    // 長按圖釘選「導航」但還沒選過用哪個地圖
    @State private var navAsk: Place?
    // 行程模式：同一張地圖變成某個行程（上面標題列、下面行程面板）
    @State private var trip = TripMode.shared
    @State private var tripStore = TripStore.shared
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.openURL) private var openURL

    // 抽一間不跟篩選：抽中被篩掉的店，那根圖釘還是要畫出來
    private func withExtra(_ l: [Place]) -> [Place] {
        guard let x = pins.extra, !l.contains(where: { $0.id == x }),
              let p = store.mapBase.first(where: { $0.id == x }), p.lat != nil, p.lng != nil else { return l }
        return l + [p]
    }

    private var points: [Place] { store.shown(applied, in: store.mapBase).filter { $0.lat != nil && $0.lng != nil } }

    var body: some View {
        let _ = Perf.shared.count("地圖")
        let _ = Flag.printChanges ? Self._printChanges() : ()   // 量測用 -printChanges：Console 印這次重算是哪個狀態變了
        let _ = Perf.shared.note("地圖重算")
        @Bindable var store = store
        // 篩選結果只算一次；有座標的店下面每個地方共用
        let base = store.mapBase
        let all = store.shown(applied, in: base)
        // 行程模式：這天已經排進去的店畫成號碼，不再畫一次圖釘
        let tripHide = tripHidden
        let list = withExtra(all.filter { $0.lat != nil && $0.lng != nil }).filter { !tripHide.contains($0.id) }
        // 行程模式搜尋：符合的收藏照常畫（不淡），被篩選篩掉的也補畫
        let found = trip.on && trip.searchOn ? trip.search.found : []
        let foundIds = Set(found.map(\.id))
        let extraFound = found.filter { f in f.lat != nil && f.lng != nil && !tripHide.contains(f.id) && !list.contains { $0.id == f.id } }
        let hits = trip.on && trip.searchOn ? trip.search.mapHits(found) : []
        // 第一次畫圖釘、換看誰的收藏：排好落下順序（由近到遠）
        let _ = pins.arm(store.mapGroup ?? "mine", list, from: store.here ?? (shownRegion ?? store.mapRegion).map { CLLocation(latitude: $0.center.latitude, longitude: $0.center.longitude) })
        // 篩選拿掉的，多畫 0.25 秒縮小淡掉
        let gone = pins.track(list)
        let _ = pins.cleared
        let gname = store.mapGroupName
        let total = all.count
        NavigationStack(path: $store.mapPath) {
          ZStack {
            MapReader { proxy in
                // 泡泡、行程站號沒有自己的 tag，MapKit 會拿它們的 id 當成可選：點泡泡放大後 sel 會變成「a,b」這種不是圖釘的 id，
                // 所有圖釘一起變淡又沒有大卡。泡泡的 id 是幾間店的 id 用逗號串起來（搜到的地點 hit: 開頭，本身也有逗號，要收）
                Map(position: $pos, selection: Binding(get: { pins.sel }, set: { id in
                    Perf.shared.note("地圖選取 \(id.map { String($0.prefix(8)) } ?? "nil")")   // 量測：MapKit 自己送來的選取
                    if let id, (id.contains(",") && !id.hasPrefix("hit:")) || trip.marks.contains(where: { $0.id == id }) { return }
                    // 行程模式：點空白交給 blankTap；MapKit 點圖釘後會晚一步（等「是不是點兩下」）送 nil，不能拿來收加站卡。
                    // 手指剛點過圖釘 0.6 秒內，晚到而且跟目前不同的選取也不聽。淡化的圖釘按鈕比 MapKit 的框小，點到框內按鈕外還是靠這裡開卡
                    if trip.on {
                        let dt = CACurrentMediaTime() - pins.tapAt
                        if id == nil || (dt < 0.6 && id != pins.sel) {
                            if dt < 2 { Perf.shared.mark("地圖選取略過 \(id.map { String($0.prefix(8)) } ?? "nil") \(Int(dt * 1000))ms") }
                            return
                        }
                        // 不是地圖上的收藏、也不是搜尋結果（關加站卡時 MapKit 偶爾送來別的 id）：不選，免得所有圖釘變淡
                        if let id, !id.hasPrefix("hit:"), !list.contains(where: { $0.id == id }), !extraFound.contains(where: { $0.id == id }) {
                            Perf.shared.mark("地圖選取不是圖釘 \(id.prefix(8))")
                            return
                        }
                        // 淡化的收藏圖釘框比畫出來的大，會蓋住旁邊的搜尋結果：手指其實比較靠近搜尋結果時，改選搜尋結果
                        if let id, let h = preferHit(id, hits: hits, list: list + extraFound, via: "地圖") {
                            pins.select(h)
                            return
                        }
                    } else if CACurrentMediaTime() - pins.tapAt < 0.6, id != pins.sel {
                        // 一般地圖也一樣：手指剛點過圖釘按鈕，MapKit 等完「是不是點兩下」才用手指的位置找圖釘，
                        // 那時地圖已經開始移（收鍵盤、飛過去），會找到旁邊那根或空白：一下選兩間、選了又被 nil 取消。按鈕選的為準
                        Perf.shared.mark("地圖選取略過 \(id.map { String($0.prefix(8)) } ?? "nil") \(Int((CACurrentMediaTime() - pins.tapAt) * 1000))ms")
                        return
                    }
                    pins.select(id)
                })) {
                    ForEach(list.filter { !hidden.contains($0.id) }) { p in
                        Annotation(p.name, coordinate: .init(latitude: p.lat!, longitude: p.lng!), anchor: .bottom) {
                            FoodPin(place: p, pins: pins, reduce: reduce, saver: gname == nil ? nil : p.owner.map { ($0, store.name($0)) })
                        }
                        .tag(p.id)
                        .annotationTitles(.hidden)
                    }
                    ForEach(gone) { p in
                        Annotation("", coordinate: .init(latitude: p.lat!, longitude: p.lng!), anchor: .bottom) { GonePin(place: p, reduce: reduce) }
                            .annotationTitles(.hidden)
                    }
                    ForEach(clusters) { c in
                        Annotation("", coordinate: .init(latitude: c.lat, longitude: c.lng), anchor: .center) {
                            ClusterBubble(c: c, reduce: reduce, pins: pins) { zoom(c) }
                        }
                        .annotationTitles(.hidden)
                    }
                    if trip.on {
                        ForEach(extraFound) { p in
                            Annotation(p.name, coordinate: .init(latitude: p.lat!, longitude: p.lng!), anchor: .bottom) {
                                FoodPin(place: p, pins: pins, reduce: reduce)
                            }
                            .tag(p.id)
                            .annotationTitles(.hidden)
                        }
                        // 這天的路線：每段用下一站的顏色，7pt 線加 13pt 白邊；還沒算好的段先畫同色虛線直線
                        ForEach(trip.segs) { s in
                            MapPolyline(coordinates: s.coords).stroke(Color.white.opacity(s.routed ? (s.faded ? 0.5 : 1) : 0), style: s.under)
                            MapPolyline(coordinates: s.coords).stroke(s.color.opacity(s.faded ? 0.3 : s.routed ? 1 : 0.85), style: s.style)
                        }
                        // 加站卡：前一站、這間、後一站的虛線
                        if let pv = trip.preview?.line {
                            MapPolyline(coordinates: pv.coords).stroke(pv.color, style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [9, 9]))
                        }
                        // 倒過來畫：好幾站疊在一起時，號碼小的在最上面
                        ForEach(Array(trip.marks.reversed())) { m in
                            Annotation("", coordinate: m.coord, anchor: .center) {
                                Button { tapMark(m.id) } label: { MarkView(m: m) }
                                    .buttonStyle(PressStyle())
                                    .accessibilityLabel("第 \(m.n) 站")
                            }
                            .annotationTitles(.hidden)
                        }
                        ForEach(hits) { h in
                            Annotation(h.name, coordinate: h.coord, anchor: .top) {
                                HitPin(hit: h) { pins.tap("hit:" + h.id) }
                                    .offset(y: -15)
                            }
                            .tag("hit:" + h.id)
                            .annotationTitles(.hidden)
                        }
                        if let pv = trip.preview {
                            Annotation("", coordinate: pv.at, anchor: .bottom) {
                                Text("新的第 \(pv.n) 站").font(.system(size: 12, weight: .heavy)).foregroundStyle(.white)
                                    .padding(.horizontal, 9).frame(height: 24)
                                    .background(pv.color, in: .capsule)
                                    .overlay(Capsule().strokeBorder(.white, lineWidth: 2))
                                    .fixedSize()
                                    .offset(y: pv.onPin ? -70 : -22)
                                    .transition(.scale(scale: 0.5).combined(with: .opacity))
                                    .allowsHitTesting(false)
                            }
                            .annotationTitles(.hidden)
                        }
                    }
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .mapControls { MapCompass() }
                .safeAreaPadding(.top, max(0, headY - mapRect.minY))
                .safeAreaPadding(.bottom, footY > 0 ? max(0, mapRect.maxY - footY) : 0)
                // 行程模式點地圖空白處：收掉加站卡、搜尋（點到圖釘不算）
                .simultaneousGesture(SpatialTapGesture(coordinateSpace: .global).onEnded { v in
                    pins.touch = (v.location, CACurrentMediaTime())
                    blankTap(near: trip.on && pinNear(v.location, hits: hits, list: list))
                }, including: trip.on ? .all : .subviews)
                .onMapCameraChange(frequency: .continuous) { _ in
                    // 手指拖地圖：下面那塊降到一行（停下來不自動彈回）
                    let now = CACurrentMediaTime()
                    if pos.positionedByUser { pins.camAt = now }
                    if !quiet.touched, pos.positionedByUser, now > quiet.until { quiet.touched = true }
                    // 新帳號的「收藏第一間店」卡不降（跟 NearbySheet 裡那張卡同一個條件）；找到一間自己的店就停，不每幀濾整份收藏
                    let empty = store.mapGroup == nil && !store.loading && !store.places.contains(where: { store.isMine($0) })
                    if !trip.on, !empty, pos.positionedByUser, now > quiet.until, now > MapPanel.shared.calmUntil, !MapPanel.shared.dragging {
                        MapPanel.shared.go(.low)
                    }
                    // 手指拖、縮放離開「只列這幾間」（不放進上面那個 if：剛點完泡泡的 calmUntil 會讓它退不出來）
                    if !trip.on, pos.positionedByUser, now > quiet.until {
                        seenBox.zoomed = nil
                        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
                    }
                    // 出發中：拖過地圖就亮「跟著我」，鏡頭被設回 region 就收掉
                    if trip.going, trip.offFollow != pos.positionedByUser { trip.offFollow = pos.positionedByUser }
                    dot.refresh()
                    pinFrame(proxy)
                    if let c = spot.coord, Date() < spot.until { spot.at = proxy.convert(c, to: .global) }
                }
                .onMapCameraChange { c in
                    let sp = Perf.begin("鏡頭停下"); defer { Perf.end("鏡頭停下", sp) }
                    trip.toScreen = { proxy.convert($0, to: .global) }
                    // 飛去遠的店降落了：記一筆，附近清單也換成這裡（不然卡片列還是原本那一帶，捲一下就把鏡頭拉回去）
                    let flying = quiet.flyTo != nil
                    var landed = false
                    if let t = quiet.flyTo, abs(c.region.center.latitude - t.lat) < c.region.span.latitudeDelta * 0.15,
                       abs(c.region.center.longitude - t.lng) < c.region.span.longitudeDelta * 0.15 {
                        quiet.flyTo = nil; landed = true
                    }
                    // 第二段還沒開始、或開始不到 0.4 秒的停下才算半空停下；手指拖的不算
                    let now = CACurrentMediaTime()
                    let midAir = flying && !landed && !pos.positionedByUser && (quiet.leg2 == 0 || now - quiet.leg2 < 0.4)
                    if flying {
                        let ms = Int((now - quiet.flyStart) * 1000)
                        Perf.shared.mark(landed ? "飛完（第 \(ms) ms）" : midAir ? "飛行中停下（第 \(ms) ms）" : "停下但沒對上終點（第 \(ms) ms）")
                    }
                    store.mapRegion = c.region
                    settleTask?.cancel()
                    if midAir && Flag.on("-noMidStop") { return }
                    // 行程框地圖停好量了一次、要再修正：這次先不重組泡泡，等修正完停好再做（只做一次、在最後的鏡頭上做）；
                    // 修正沒再停下來（幾乎沒動、被打斷）也會在 0.6 秒後補做
                    if let f = trip.afterFit {
                        trip.afterFit = nil
                        if f() {
                            settleTask = Task { try? await Task.sleep(for: .milliseconds(600)); if !Task.isCancelled { recluster(proxy) } }
                            return
                        }
                    }
                    // 量測用 -landDefer：降落後的附近清單和泡泡重組晚 0.6 秒，看降落的長幀是不是它們
                    if landed && Flag.on("-landDefer") {
                        selfMoved = false
                        seenBox.set(c.region, publish: false)
                        nearTask?.cancel()
                        nearTask = Task {
                            try? await Task.sleep(for: .milliseconds(600))
                            guard !Task.isCancelled else { return }
                            Perf.shared.mark("降落後補做")
                            seenBox.set(seenBox.peek, publish: !trip.on)
                            recluster(proxy)
                        }
                        return
                    }
                    // 量測用：只延後清單（-landDeferList）或只延後泡泡重組（-landDeferCluster）
                    if landed && (Flag.on("-landDeferList") || Flag.on("-landDeferCluster")) {
                        let lateList = Flag.on("-landDeferList"), lateCluster = Flag.on("-landDeferCluster")
                        selfMoved = false
                        seenBox.set(c.region, publish: !lateList && !trip.on)
                        if !lateCluster { recluster(proxy) }
                        nearTask?.cancel()
                        nearTask = Task {
                            try? await Task.sleep(for: .milliseconds(600))
                            guard !Task.isCancelled else { return }
                            Perf.shared.mark("降落後補做")
                            if lateList { seenBox.set(seenBox.peek, publish: !trip.on) }
                            if lateCluster { recluster(proxy) }
                        }
                        return
                    }
                    // 行程模式時下面的附近面板收著，不用跟著重算（離開行程時補一次）
                    if selfMoved && !landed { selfMoved = false } else { selfMoved = false; seenBox.set(c.region, publish: !trip.on) }
                    recluster(proxy)
                }
                .onChange(of: list.map(\.id)) { _, ids in
                    recluster(proxy)
                    // 選到的店被篩選或搜尋字篩掉：取消選取，大卡收起、其他圖釘恢復不透明
                    // 行程模式不管：那時的 sel 是加站卡在用，可能是 hit: 開頭的搜尋點，或 extraFound 裡不在 list 的店
                    // 抽一間還在跳（drawWin 還在）：等它跳完自己選中抽到的那間，這裡取消會把整次抽一間取消掉
                    if !trip.on, pins.drawWin == nil, let s = pins.sel, !s.hasPrefix("hit:"), !ids.contains(s) { pins.select(nil) }
                }
                .onChange(of: store.coachStep) { pinFrame(proxy) }
                // 選到一根圖釘：地圖移過去、放光圈（只有這個小觀察者看 sel，MapTab 本身不跟著重算）
                // 選到時不重算泡泡（會讓整張地圖重畫，點圖釘變慢）；地圖移完停下來時會重算
                .background { SelWatcher(pins: pins) { id in picked(id, list, proxy, hits: hits, extra: extraFound) } }
                .overlay { PinBurst(spot: spot) }
                // 長按圖釘的選單要知道圖釘在螢幕哪裡
                .task {
                    pins.locate = { c in proxy.convert(c, to: .global) }
                    dot.locate = { c in proxy.convert(c, to: .global) }
                    dot.refresh()
                }
                // 量測用：emoji 先畫成圖（-emojiImg）或只預熱（-emojiWarm）；沒加參數直接結束
                .task {
                    guard !EmojiArt.parts.isEmpty || EmojiArt.warmOnly else { return }
                    // 等落下播完（約 1.8 秒）；沒有店不會落下，最多等 10 秒
                    let t0 = CACurrentMediaTime()
                    while CACurrentMediaTime() - t0 < 10, pins.dropStart == 0 || CACurrentMediaTime() - pins.dropStart < 2 {
                        try? await Task.sleep(for: .milliseconds(250))
                        if Task.isCancelled { return }
                    }
                    EmojiArt.scale = displayScale
                    let es = Cat.order.compactMap { Cat.all[$0]?.emoji }
                    var list: [(String, CGFloat, EmojiArt.Part)] = []
                    for e in es { list.append((e, 21, .pin)) }
                    for e in es { list.append((e, 15, .bubble)) }
                    list.append(("🎲", EmojiArt.diceSize(dts), .dice))
                    if Flag.on("-perfOverlay") { print("[emoji] 🎲 舊算法 \(UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 15)) pt，新算法 \(EmojiArt.diceSize(dts)) pt，字級 \(dts)") }
                    await EmojiArt.warm(list)
                }
                // 行程模式：其他收藏縮小變淡（搜到的、正在看要不要加的那間照常）。
                // 地圖上的圖釘不會跟著 MapTab 重畫，所以交給 PinState，每根自己看
                .onChange(of: "\(trip.on)|\(foundIds.sorted().joined(separator: ","))", initial: true) {
                    quiet.hush()
                    pins.dimAll = trip.on
                    pins.bright = foundIds
                }
            }
            // 量在 ignoresSafeArea 裡面才是地圖真正鋪開的範圍（整個螢幕）；量在外面只拿到 safe area 那塊，上下邊距會各少算 62、34
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
                mapRect = r; trip.mapBottom = footY > 0 ? footY : r.maxY
                Perf.shared.note("地圖範圍變了 x=\(Int(r.minX)) y=\(Int(r.minY)) w=\(Int(r.width)) h=\(Int(r.height))")
                showGeo(r, footY)
            }
            .ignoresSafeArea()
            // 自己的位置：畫在地圖上面一層（地圖的標註會被南邊的圖釘蓋住）
            // 排行程時調淡（藍點畫在最上層，會蓋住站號）；出發中照常
            MyDotLayer(dot: dot)
                .opacity(trip.on && !trip.going ? 0.35 : 1)
                .animation(.easeOut(duration: 0.25), value: trip.on && !trip.going)
            // 搜尋列、卡片列、行程面板放在地圖上面另一層：它們的高度變了不會動到地圖
            Color.clear
            .allowsHitTesting(false)
            // 行程面板蓋在地圖上（標題列下面）；打開時從下面彈上來
            .overlay {
                if let tid = trip.tid {
                    TripPanel(tid: tid, pos: $pos).equatable()
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                ZStack(alignment: .top) {
                    if let tid = trip.tid {
                        TripTop(tid: tid)
                            .transition(.opacity)
                    }
                    // 一般地圖的搜尋列：行程模式時收起來但不拿掉（拿掉再建一次很慢）
                        // 「我的收藏 ▾」放在搜尋框最左邊（沒有群組就不放）；分類那排只剩分類
                        MapSearchBar(prompt: gname != nil ? "在群組裡找" : "今天想吃什麼？",
                                     lead: store.groups.isEmpty ? nil : { (busy: Bool) -> AnyView in AnyView(scopePill(gname, compact: busy)) },
                                     begin: beginTyping, add: { adding = true },
                                     // 按搜尋鍵（有字）：把符合的店框進看得到的那塊
                                     submit: { if !store.mapF.q.isEmpty { applied = store.mapF; frameShown() } })
                        .padding(.top, 6)
                        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { y in
                            guard !trip.on, abs(y - headY) > 0.5 else { return }
                            quiet.hush()
                            headY = y; trip.mapTop = y
                            showGeo(mapRect, footY)
                        }
                        .opacity(trip.on ? 0 : 1)
                        .frame(height: trip.on ? 0 : nil, alignment: .top)
                        .allowsHitTesting(!trip.on)
                        .accessibilityHidden(trip.on)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                // 下面那塊（三段）：行程模式時收起來但不拿掉（拿掉再建一次很慢）
                // 行程、定位兩顆浮在面板上緣，跟著面板上下；地圖邊距只在面板停在中間段時才跟著量
                // 「附近 N 間」在 NearbyHost 裡算：地圖停下來、面板上緣變了，只有這一塊重算
                NearbyHost(seen: seenBox, list: list, total: total, base: base.count, inGroup: store.mapGroup != nil, filter: applied, headY: headY, mapRect: mapRect) { near in
                    let missing = total - list.count
                NearbySheet(near: near, pins: pins, list: list, group: store.mapGroupName, draw: draw, panel: openPanel, choose: choose, dropKey: pins.dropKey, focus: focus,
                            endOnly: { withAnimation(.snappy) { seenBox.only = nil } }, frameAll: frameShown,
                            ceiling: headY + 8, top: AnyView(
                        VStack(alignment: .trailing, spacing: 10) {
                            // AI 在背景找剛新增的店
                            if store.pendingAdds.contains(where: { $0.state == .finding }) {
                                HStack(spacing: 8) {
                                    ProgressView().controlSize(.small).tint(.white)
                                    Text("找店中…").font(.footnote.weight(.heavy)).foregroundStyle(.white)
                                }
                                .padding(.horizontal, 14).frame(height: 36)
                                .background(Color(hex: 0x2a1a0a), in: .capsule)
                                .frame(maxWidth: .infinity)
                                .transition(.scale(scale: 0.6).combined(with: .opacity))
                            }
                            HStack(alignment: .bottom) {
                                // 沒有座標的店不會出現在地圖上，提醒一下，點了可以補地址
                                if missing > 0 {
                                    Button { noAddr = true } label: {
                                        Label("\(missing) 間還沒有地址", systemImage: "mappin.slash")
                                            .font(.footnote.weight(.heavy)).foregroundStyle(Color.ink)
                                            .padding(.horizontal, 12).frame(height: 36)
                                            .background(.white, in: .capsule).shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                                    }
                                    .buttonStyle(PressStyle())
                                }
                                Spacer()
                                VStack(spacing: 10) {
                                    // 行程：上次打開的行程還沒過期就直接進行程模式；過期或沒有就開「我的行程」
                                    Button { openTrip() } label: {
                                        VStack(spacing: 1) {
                                            Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill").font(.system(size: 17, weight: .bold))
                                            Text("行程").font(.system(size: 10, weight: .heavy))
                                        }
                                        .foregroundStyle(Color.accentDeep)
                                        .frame(width: 44, height: 50)
                                        .background(.white, in: .rect(cornerRadius: 14))
                                        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                                    }
                                    .buttonStyle(PressStyle(haptic: true))
                                    .accessibilityLabel("我的行程")
                                    Button {
                                        Haptic.light()
                                        // 程式移鏡頭：離開「只列這幾間」（跟 frameShown 一樣，U12 6(d)）
                                        seenBox.zoomed = nil
                                        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
                                        // 移到目前位置一次就好。不用 .userLocation：那會一直跟著走，位置一動整張地圖就每幀重畫，手機會燙
                                        if let l = loc.location ?? store.here {
                                            quiet.centered = true   // 以定位鈕為準，同步做完不再拉去 3 公里
                                            // 拉近到街道（已經比這更近就不動縮放）
                                            let near = MKCoordinateRegion(center: l.coordinate, latitudinalMeters: 1200, longitudinalMeters: 1200)
                                            let span = store.mapRegion.map { $0.span.latitudeDelta < near.span.latitudeDelta ? $0.span : near.span } ?? near.span
                                            withAnimation(.smooth(duration: 0.5)) { pos = .region(aim(MKCoordinateRegion(center: l.coordinate, span: span), grow: false)) }
                                        } else {
                                            withAnimation(.smooth(duration: 0.5)) { pos = .userLocation(fallback: pos) }
                                        }
                                    } label: { CircleIcon(icon: "location.fill") }
                                    .buttonStyle(PressStyle())
                                    .accessibilityLabel("我的位置")
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        .animation(.snappy, value: store.pendingAdds.map(\.state))
                    ), foot: setFoot)
                }
                .equatable()
                .offset(y: trip.on ? 60 : 0)
                .opacity(trip.on ? 0 : 1)
                .frame(height: trip.on ? 0 : nil, alignment: .top)
                .allowsHitTesting(!trip.on)
                .accessibilityHidden(trip.on)
            }
            // 打字時鍵盤不要把下面那塊頂上去（分頁列本來就留在鍵盤後面）
            .ignoresSafeArea(.keyboard, edges: .bottom)
            // 長按圖釘：背景變暗、圖釘放大，旁邊彈出「加進行程／導航／看店家」
            .overlay { PinMenu(pins: pins, list: list, act: pinAct) }
            // 抽 3 間的卡片、轉盤蓋在地圖上
            .overlay {
                DrawStage(show: $show, reroll: { avoid, n in
                    drawer.pick(store, drawer.candidates(store, drawCtx(), drawer.prefs), k: n, avoid: avoid)
                }, hop: { p in pins.hop(p.id) }, pick: { p in
                    drawer.record(store, p)
                    choose(p)
                })
            }
          }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: Place.self) { PlaceDetail(place: $0) }
            .tripDestinations()
        }
        .sheet(isPresented: $paneling) {
            DrawPanel(ctx: drawCtx(), go: { draw() }, pickHistory: choose)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $adding) { AddSheet() }
        .sheet(isPresented: $trip.listing) { TripsList().toastHost(bottom: 16).presentationDetents([.medium, .large]) }
        // 刪除行程：按下確定就回一般地圖，刪除在背景做（有復原）
        .confirmationDialog("刪除「\(trip.deleting?.title ?? "")」？每一站都會一起刪掉", isPresented: Binding(get: { trip.deleting != nil }, set: { if !$0 { trip.deleting = nil } }), titleVisibility: .visible, presenting: trip.deleting) { t in
            Button("刪除行程", role: .destructive) {
                trip.close()
                Task { try? await Task.sleep(for: .milliseconds(450)); tripStore.deleteWithUndo(t, store: store) }
            }
        }
        .confirmationDialog("用哪個地圖導航？", isPresented: Binding(get: { navAsk != nil }, set: { if !$0 { navAsk = nil } }), titleVisibility: .visible, presenting: navAsk) { p in
            ForEach(NavApp.allCases, id: \.self) { a in
                Button(a.name) { NavApp.saved = a; if let u = p.navURL(a) { openURL(u) } }
            }
        }
        .sheet(isPresented: $noAddr) { NoAddressSheet() }
        .sheet(isPresented: $scoping) { ScopeSheet().presentationDetents([.medium, .large]) }
        // 換看誰的收藏：重新框住那些店
        .onChange(of: store.mapGroup) { pins.select(nil); seenBox.only = nil; seenBox.zoomed = nil; fitted = false; fit() }
        .onAppear {
            loc.requestWhenInUseAuthorization()
            if store.here == nil { store.here = loc.location }
            // 第一次打開先把所有收藏的店框進畫面
            fit()
        }
        .background { FilterSync(tab: 0, live: true, get: { applied }, set: { applied = $0 }) }
        .onChange(of: list.count) { fit() }
        .onChange(of: store.loading) { _, l in if !l { centerIfEmpty() } }
        // 進出行程：「只列這幾間」一律退出。
        // 進行程：首頁選著的圖釘取消，不然那根維持放大帶店名、像一個站；
        // 離開行程：下面的附近面板補算一次地圖現在看的範圍（行程模式時沒跟著算）
        .onChange(of: trip.on) { _, on in
            seenBox.only = nil; seenBox.zoomed = nil
            if on {
                if trip.cand == nil { pins.select(nil); pins.drawn = nil }
            } else {
                seenBox.set(seenBox.peek, publish: true)
            }
        }
        // 拿到一次目前位置就好（剛允許定位也會馬上更新「附近」），不一直開著 GPS
        .task {
            do { for try await u in CLLocationUpdate.liveUpdates() { if let l = u.location { store.here = l; centerIfEmpty(); break } } } catch {}
        }
        // 鍵盤收起來（按搜尋、點地圖、捲面板）：首頁搜尋不算在打字了，面板回到打字前那段
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in endTyping() }
        // 藍點只在看地圖（或出發中）時更新；分頁交給 DotTracker 自己讀，換分頁時 MapTab 不用跟著重算
        .background { DotTracker() }
    }

    // 抽一間：照存好的設定抽（範圍、分類、價位…長按 🎲 改）。同一家的分店只算一次、抽中離你最近的那間；再抽一次不會抽到同一家
    private func draw() {
        MapPanel.shared.atLeastMid()
        // 跳的過程中再按一次：直接出結果
        if let win = pins.drawWin {
            pins.drawTask?.cancel(); pins.drawTask = nil; pins.drawWin = nil
            Haptic.success()
            pins.select(win)
            return
        }
        let pool = drawer.candidates(store, drawCtx(), drawer.prefs)
        guard !pool.isEmpty else {
            Haptic.warning()
            store.say("沒有符合的店，改一下條件")
            openPanel()
            return
        }
        drawer.spin += 1
        // 量「按下 → 骰子開始轉、第一根圖釘開始跳」；選中那一刻另外記「抽一間（抽中）」
        Perf.shared.mark("抽一間（開始）")
        let avoid = pins.sel.flatMap { store.place($0) }.map { Set([store.brand($0)]) } ?? []
        switch drawer.prefs.mode {
        case .three:
            Perf.shared.mark("抽 3 間")
            Haptic.light()
            show = DrawShow(mode: .three, places: drawer.pick(store, pool, k: 3, avoid: avoid))
        case .wheel:
            Haptic.light()
            show = DrawShow(mode: .wheel, places: drawer.pick(store, pool, k: 8, avoid: avoid))
        case .one:
            let drawnOne = drawer.pick(store, pool, k: 1, avoid: avoid).first
            // 量測用 -drawWin id1,id2：輪流抽中這幾間（在 store.mapBase 找：範圍是「地圖上看到的」時遠的店不在 pool 裡）
            let wins = Flag.value("-drawWin")?.split(separator: ",").map(String.init) ?? []
            let want = wins.isEmpty ? nil : wins[Flag.draws % wins.count]
            if want != nil { Flag.draws += 1 }
            guard let win = want.flatMap({ id in store.mapBase.first { $0.id == id && $0.lat != nil && $0.lng != nil } }) ?? drawnOne else { return }
            drawer.record(store, win)
            pins.drawn = win.id
            reveal(win)
            // 先讓地圖上 6–8 根圖釘輪流跳一下（按下去的那一刻第一根就跳），最後選中抽到的那根
            let shown = shownRegion.map { r in pool.filter { abs($0.lat! - r.center.latitude) <= r.span.latitudeDelta / 2 && abs($0.lng! - r.center.longitude) <= r.span.longitudeDelta / 2 } } ?? pool
            let canHop = shown.filter { $0.id != win.id && $0.id != pins.sel && !hidden.contains($0.id) }
            // -drawWin 時跳的固定成前 7 根，兩次量測一樣
            let hoppers = wins.isEmpty ? Array(canHop.shuffled().prefix(Int.random(in: 6...8))) : Array(canHop.sorted { $0.id < $1.id }.prefix(7))
            guard !reduce, !hoppers.isEmpty else {
                Haptic.success()
                Perf.shared.note("select 開始（抽中）")
                pins.select(win.id)
                return
            }
            pins.drawWin = win.id
            pins.drawTask = Task {
                for p in hoppers {
                    pins.hop(p.id)
                    Haptic.tick()
                    try? await Task.sleep(for: .seconds(0.15))
                    if Task.isCancelled { return }
                }
                try? await Task.sleep(for: .seconds(0.12))
                guard pins.drawWin == win.id else { return }
                pins.drawWin = nil; pins.drawTask = nil
                Haptic.success()
                Perf.shared.note("select 開始（抽中）")
                pins.select(win.id)
            }
        }
    }

    // 長按圖釘選單選了什麼
    private func pinAct(_ a: PinMenu.Act, _ p: Place) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { pins.menu = nil }
        let trips = TripStore.shared
        switch a {
        case .add where trip.on:
            withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) { trip.cand = TripCand(place: p) }
        case .add:
            Task {
                // 還沒讀過行程（第一次按）：先讀，免得多開一個新行程
                if !trips.loaded { await trips.load() }
                trips.addPlace(p, store: store)
            }
        case .trip(let s):
            trip.open(s.trip_id, focus: s.id, store: store)
        case .nav:
            if let n = NavApp.saved { if let u = p.navURL(n) { openURL(u) } } else { navAsk = p }
        case .open:
            store.mapPath.append(p)
        }
    }

    // 選中抽到的那間（被篩選篩掉的也畫出來）
    private func choose(_ p: Place) {
        guard store.mapBase.contains(where: { $0.id == p.id }), p.lat != nil, p.lng != nil else {
            store.say("這間不在現在的地圖上"); return
        }
        reveal(p)
        pins.drawn = p.id
        pins.select(p.id)
    }

    // 被篩選篩掉的店也要能畫出那根圖釘
    private func reveal(_ p: Place) {
        if !store.shown(applied, in: store.mapBase).contains(where: { $0.id == p.id }) { pins.extra = p.id }
    }

    private func openPanel() {
        Perf.shared.mark("抽一間面板")
        paneling = true
    }

    // 抽一間從哪些店抽：地圖現在看誰的收藏（不跟上面的篩選），地圖上看到的那些，距離從你的位置（沒有就地圖中心）算
    private func drawCtx() -> Drawer.Ctx {
        let base = store.mapBase
        let r = shownRegion ?? store.mapRegion
        let view = r.map { r in
            base.filter { p in
                guard let la = p.lat, let lo = p.lng else { return false }
                return abs(la - r.center.latitude) <= r.span.latitudeDelta / 2 && abs(lo - r.center.longitude) <= r.span.longitudeDelta / 2
            }
        }
        let center = r.map { CLLocation(latitude: $0.center.latitude, longitude: $0.center.longitude) }
        return Drawer.Ctx(base: base, view: view, ref: store.here ?? center, refIsCenter: store.here == nil, onMap: true)
    }

    // 選到一根圖釘之後：光圈、量測、地圖移過去（不改縮放）
    private func picked(_ id: String?, _ list: [Place], _ proxy: MapProxy, hits: [MapHit] = [], extra: [Place] = []) {
        // 行程模式：點收藏的圖釘或搜到的地點 → 下面換成加站卡（地圖由面板框住前後兩站）
        if trip.on {
            trip.pickAt = CACurrentMediaTime()
            guard let id else {
                if trip.cand != nil {
                    Perf.shared.mark("picked nil 收加站卡")
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { trip.cand = nil }
                }
                return
            }
            // 按到的是收藏圖釘的按鈕（淡化圖釘的按鈕比畫出來的大），手指其實在旁邊的搜尋圖示上：改選搜尋結果。
            // 地圖自己選的在 selection 那邊已經判斷過，這裡只管剛按下去的按鈕
            if CACurrentMediaTime() - pins.tapAt < 0.3, let h = preferHit(id, hits: hits, list: list + extra, via: "按鈕") {
                pins.select(h)
                return
            }
            var c: TripCand?
            if id.hasPrefix("hit:") { c = trip.search.hits.first { "hit:" + $0.id == id }.map { TripCand(hit: $0) } }
            else { c = store.place(id).map { TripCand(place: $0) } }
            guard let c, c != trip.cand else { return }
            Perf.shared.mark(id.hasPrefix("hit:") ? "點搜尋加站" : "點收藏加站")
            trip.endTyping()
            withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) { trip.cand = c }
            return
        }
        // 名單可能是上一輪的（抽中被篩掉的店剛補畫上去）：找不到再用現在的名單找；
        // 真的不是地圖上的店（淡出中的圖釘、沒想到的 id）就取消選取，不要停在「全部變淡、沒有大卡」
        guard let id, let p = list.first(where: { $0.id == id }) ?? currentList.first(where: { $0.id == id }) else {
            if id != nil { pins.select(nil) }
            return
        }
        Perf.shared.mark(pins.drawn == id ? "抽一間（抽中）" : "點圖釘")
        if Flag.on("-perfOverlay") { print("[perf] 選中 \(p.name) \(p.id)") }
        // 抽中、轉盤選中、從「抽過」點回的店如果在泡泡裡：先拆出這根，光圈和圖釘同一刻出現
        // （手指點圖釘點不到泡泡裡的店，不會走到這裡，一般點圖釘的路徑不受影響）
        if hidden.contains(id) { Perf.shared.mark("拆泡泡"); recluster(proxy) }
        // 下面那塊升到中間段顯示大卡片；接下來地圖移過去不算拖地圖
        quiet.hush()
        // 抽中、點到的不是「這裡有 N 間」那幾間：地圖要飛走，離開列出模式（跟 frameShown 一樣，U12 6(d)）；大卡蓋著，不用動畫
        if let o = seenBox.only, !o.contains(id) { seenBox.zoomed = nil; seenBox.only = nil }
        MapPanel.shared.go(.mid)
        Self.endHomeTyping()
        // 先把大卡片和店家頁要用的照片載好，點進去時第一幀就有
        if let u = p.photoURL { Task { _ = await PhotoLoader.shared.load(u, 400); _ = await PhotoLoader.shared.load(u, 1200) } }
        // 影片預載等地圖移完再開始（拿網址、建播放器在主執行緒，跟移地圖、飛過去搶會掉幀）；還選著這間才載
        if Flag.on("-noReelWarm") {
        } else if Flag.on("-reelNow") { ReelCache.warm(p) }
        else { Task { try? await Task.sleep(for: .milliseconds(850)); if pins.sel == p.id { ReelCache.warm(p) } } }
        let c = CLLocationCoordinate2D(latitude: p.lat!, longitude: p.lng!)
        if !reduce {
            spot.coord = c; spot.color = p.cat.color
            spot.at = proxy.convert(c, to: .global)
            spot.until = Date().addingTimeInterval(0.75)   // 光圈 0.7 秒畫完（PinBurst 的 keyframe），之後不用再追著地圖更新位置
            spot.shot += 1
        }
        selfMoved = true
        let cur = store.mapRegion ?? shownRegion
        let span = cur?.span ?? MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
        // 離畫面中心超過可見範圍的 60%：拉遠再降落；近的直接平移
        let far = cur.map { abs(c.latitude - $0.center.latitude) > $0.span.latitudeDelta * 0.6 || abs(c.longitude - $0.center.longitude) > $0.span.longitudeDelta * 0.6 } ?? false
        // 圖釘放在中段面板上面看得到那塊的中間（大卡比卡片列高一點，還是在大卡上面）
        let to = aim(MKCoordinateRegion(center: c, span: span), grow: false)
        Perf.shared.mark(String(format: "移地圖%@ %.2f,%.2f→%.2f,%.2f 寬%.2f", far ? "（遠）" : "", cur?.center.latitude ?? 0, cur?.center.longitude ?? 0,
                                to.center.latitude, to.center.longitude, span.latitudeDelta))
        flyTask?.cancel(); quiet.flyTo = nil
        if far && !reduce, let from = cur?.center {
            // 很遠的店：先拉遠到看得到兩地（至少 1.6 倍），再降落到那間（共約 0.8 秒）。
            // 兩段都寫進 pos（之前用鏡頭關鍵格動畫，抽中遠處的店時飛完鏡頭還停在原地）
            let dLat = abs(from.latitude - to.center.latitude), dLng = abs(from.longitude - to.center.longitude)
            let out = MKCoordinateRegion(center: .init(latitude: (from.latitude + to.center.latitude) / 2, longitude: (from.longitude + to.center.longitude) / 2),
                                         span: .init(latitudeDelta: min(max(span.latitudeDelta * 1.6, dLat * 1.3), 8), longitudeDelta: min(max(span.longitudeDelta * 1.6, dLng * 1.3), 8)))
            quiet.flyTo = (to.center.latitude, to.center.longitude)
            quiet.flyStart = CACurrentMediaTime(); quiet.leg2 = 0
            withAnimation(.easeIn(duration: 0.32)) { pos = .region(out) }
            flyTask = Task {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled, pins.sel == id else { quiet.flyTo = nil; return }
                selfMoved = true; quiet.leg2 = CACurrentMediaTime()
                withAnimation(.easeOut(duration: 0.5)) { pos = .region(to) }
            }
        } else {
            withAnimation(.smooth(duration: 0.55)) { pos = .region(to) }
        }
    }

    // Apple 標誌、法律資訊：最低段面板上緣再往上 10pt（HIG），左下固定再讓出 46pt 給「N 間還沒有地址」膠囊。
    // 面板只回報變大的值（鍵盤推高面板時不算），所以開 App 量到一次之後就不再變，地圖不會重排
    private func setFoot(_ lowTop: CGFloat) {
        let y = lowTop - 10 - 46
        guard !trip.on, abs(y - footY) > 0.5 else { return }
        quiet.hush()
        footY = y; trip.mapBottom = y
        showGeo(mapRect, y)
        if !fitted { fit() }
    }

    // PerfHUD 顯示：地圖鋪開的範圍（應該是整個螢幕）、鏡頭框的上緣、下緣（Apple 標誌在下緣上面約 11pt）
    private func showGeo(_ r: CGRect, _ foot: CGFloat) {
        Perf.shared.setGeo("地圖 \(Int(r.minX)),\(Int(r.minY)) \(Int(r.width))×\(Int(r.height))・框 \(Int(headY))–\(Int(foot))")
    }

    // 鏡頭框的是 headY…footY；面板停在中段時下面一截被蓋住。把 r 換算成要交給地圖的區域，
    // 讓 r 落在看得到的那塊（headY…中段上緣）：中心往南挪，grow 時緯度範圍跟著放大，整塊都塞得進去
    private func aim(_ r: MKCoordinateRegion, grow: Bool = true) -> MKCoordinateRegion {
        let mp = MapPanel.shared
        let vb = mp.stage != .low && mp.midTop > headY + 50 ? min(mp.midTop, footY) : footY
        let hf = footY - headY, hv = vb - headY
        guard hf > 50, hv > 50 else { return r }
        let lat = grow ? r.span.latitudeDelta * Double(hf / hv) : r.span.latitudeDelta
        let shift = Double((footY - vb) / 2 / hf) * lat
        return MKCoordinateRegion(center: .init(latitude: r.center.latitude - shift, longitude: r.center.longitude),
                                  span: .init(latitudeDelta: lat, longitudeDelta: r.span.longitudeDelta))
    }

    static var mapWidth: CGFloat {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.bounds.width }.first ?? 390
    }

    static var windowHeight: CGFloat {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.bounds.height }.first ?? 844
    }

    static var safeBottom: CGFloat {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.safeAreaInsets.bottom }.first ?? 0
    }

    private var currentList: [Place] {
        let hide = tripHidden
        return withExtra(store.shown(applied, in: store.mapBase).filter { $0.lat != nil && $0.lng != nil }).filter { !hide.contains($0.id) }
    }

    // 行程模式：這天已經排進行程的店（畫成號碼）
    private var tripHidden: Set<String> {
        guard let tid = trip.tid else { return [] }
        let days = tripStore.trip(tid)?.days ?? 1
        return Set(tripStore.stops(tid, day: min(trip.day, days)).compactMap(\.place_id))
    }

    // 右邊「行程」：上次打開的行程還沒過期就直接進行程模式；過期或沒有就開「我的行程」
    // 上次的行程已經被刪掉：當成沒有上次，直接開「我的行程」
    private func openTrip() {
        if let last = tripStore.lastOpened {
            if let t = tripStore.trip(last) {
                // 上次打開的還沒結束：直接進；已經過期（上個月的）就打開「我的行程」讓人挑或開新的
                if (t.end ?? .distantFuture) >= TripDate.today { trip.open(last, store: store); return }
            } else {
                tripStore.lastOpened = nil
            }
        }
        Perf.shared.mark("我的行程")
        trip.listing = true
    }

    // 地圖上的號碼：地圖飛過去、清單捲到那站
    private func tapMark(_ id: String) {
        guard !pins.moving else { Perf.shared.mark("地圖在動 不算點號碼"); return }
        trip.pickAt = CACurrentMediaTime()
        if trip.cand != nil { withAnimation(.snappy) { trip.cand = nil } }
        trip.tap(id)
        trip.scrollTo = id
    }

    // 點地圖空白處：等一下看是不是其實點到圖釘（圖釘的點擊可能晚一點才到）
    private func blankTap(near: Bool) {
        guard trip.on else { return }
        let t0 = CACurrentMediaTime()
        Task {
            // 點在圖釘附近：MapKit 的選取要等 0.3–0.55 秒（看是不是點兩下）才到，多等一下再判斷，不然會先把卡、搜尋收掉
            try? await Task.sleep(for: .milliseconds(near ? 650 : 180))
            // 點下去前後 0.22 秒內點過圖釘就不算點空白，用點下去當下的時間算：
            // 開第一張加站卡時主執行緒忙、這裡晚醒，也不會把剛開的卡當成點空白關掉
            guard trip.pickAt < t0 - 0.22 else { Perf.shared.mark("點空白略過"); return }
            trip.blank()
        }
    }

    // 首頁搜尋框還在打字：先收鍵盤，大卡和長按選單才不會躲在鍵盤後面（跟行程模式點圖釘的 trip.endTyping() 一樣）
    fileprivate static func endHomeTyping() {
        guard MapPanel.shared.typing else { return }
        Perf.shared.note("收首頁鍵盤")
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    // 點首頁搜尋框：面板降到最低段（躲在鍵盤後面），搜尋列到鍵盤之間全是地圖
    private func beginTyping() {
        let mp = MapPanel.shared
        guard !trip.on, !mp.typing else { return }
        Perf.shared.note("開始打字 面板 \(mp.stage)")
        mp.typing = true
        mp.beforeTyping = mp.stage
        mp.go(.low)          // 不要 go(.high)，會把地圖整塊蓋住
    }
    // 收鍵盤：本來在最低段就留著，不然回中段
    private func endTyping() {
        let mp = MapPanel.shared
        guard mp.typing else { return }
        Perf.shared.note("鍵盤收起 面板 \(mp.stage) 打字前 \(mp.beforeTyping)")
        mp.typing = false
        guard !trip.on, mp.stage == .low else { return }
        mp.go(mp.beforeTyping == .low ? .low : .mid)
    }

    // 行程模式：手指點的地方 MapKit 會不會選到圖釘（收藏、搜尋結果）。收藏的圖釘畫在座標點上面；
    // MapKit 判斷點到的範圍比畫出來的大（模擬器量到圖釘下面 33pt 還會選到），這裡抓寬一點
    private func pinNear(_ p: CGPoint, hits: [MapHit], list: [Place]) -> Bool {
        guard let f = pins.locate else { return false }
        for h in hits {
            if let q = f(h.coord), hypot(q.x - p.x, q.y - p.y) < 44 { return true }
        }
        for x in list {
            guard let la = x.lat, let lo = x.lng, let q = f(CLLocationCoordinate2D(latitude: la, longitude: lo)) else { continue }
            if abs(q.x - p.x) < 34, p.y < q.y + 36, p.y > q.y - 64 { return true }
        }
        return false
    }

    // 行程搜尋時 MapKit 自己選了一根收藏（不是按到圖釘的按鈕）：手指離某個搜尋結果圖示比離那根收藏近，就改選搜尋結果
    private func preferHit(_ id: String, hits: [MapHit], list: [Place], via: String) -> String? {
        guard !id.hasPrefix("hit:"), !hits.isEmpty else { return nil }
        guard let t = pins.touch, CACurrentMediaTime() - t.at < 1 else {
            Perf.shared.mark("\(via)選收藏 沒有手指位置")
            return nil
        }
        guard let f = pins.locate, let p = list.first(where: { $0.id == id }), let la = p.lat, let lo = p.lng,
              let q = f(CLLocationCoordinate2D(latitude: la, longitude: lo)) else { return nil }
        // 行程模式的收藏圖釘縮成 0.65 倍：圓心在座標點上面約 20；搜尋結果圖示的圓心就在座標點
        let dFav = hypot(q.x - t.p.x, q.y - 20 - t.p.y)
        var best: (id: String, d: CGFloat)?
        for h in hits {
            guard let c = f(h.coord) else { continue }
            let d = hypot(c.x - t.p.x, c.y - t.p.y)
            if d < (best?.d ?? .infinity) { best = (h.id, d) }
        }
        // 手指就在搜尋圖示的圓裡（15 內），或比收藏近而且 45 內：選搜尋結果
        let take = best.map { $0.d < 15 || ($0.d < dFav && $0.d < 45) } ?? false
        Perf.shared.mark("\(via)選收藏 離收藏\(Int(dFav)) 離搜尋\(best.map { Int($0.d) } ?? -1)\(take ? " → 改搜尋" : "")")
        guard take, let b = best else { return nil }
        return "hit:" + b.id
    }

    // 擠在一起的圖釘合成泡泡（選到的、抽中被篩掉的那根不合）：拆開的從泡泡飛回自己的位置，合起來的先飛進泡泡再收掉
    private func recluster(_ proxy: MapProxy) {
        let sp = Perf.begin("recluster"); defer { Perf.end("recluster", sp) }
        if pins.dropping {
            // 落下播完再算，不然一邊掉一邊合
            clusterTask?.cancel()
            pins.setMerge([:])
            let wait = max(0.05, 1.3 - (CACurrentMediaTime() - pins.dropStart))
            clusterTask = Task { try? await Task.sleep(for: .seconds(wait)); if !Task.isCancelled { recluster(proxy) } }
            return
        }
        // 格子釘在地圖上（不是螢幕上），大小只在縮放跨過 2 倍時才變：平移不會重組，縮放中也不會一直換人
        guard let r = store.mapRegion ?? shownRegion else { return }
        let cell = pow(2, ceil(log2(max(r.span.longitudeDelta / Double(Self.mapWidth) * 44, 1e-7))))
        var pts: [String: CGPoint] = [:]
        var cells: [String: [Place]] = [:]
        // 行程模式搜到的收藏不合進泡泡（要看得到）
        let keep: Set<String> = trip.on && trip.searchOn ? Set(trip.search.found.map(\.id)) : []
        for p in currentList {
            if let pt = proxy.convert(CLLocationCoordinate2D(latitude: p.lat!, longitude: p.lng!), to: .local) { pts[p.id] = pt }
            guard p.id != pins.sel, p.id != pins.extra, !keep.contains(p.id) else { continue }
            let y = log(tan(.pi / 4 + p.lat! * .pi / 360)) * 180 / .pi
            cells["\(Int((p.lng! / cell).rounded(.down))),\(Int((y / cell).rounded(.down)))", default: []].append(p)
        }
        // 同一群店剛好落在格子邊界兩側會變成兩顆，泡泡比格子大會疊在一起；單根圖釘也可能壓在泡泡上。
        // 螢幕上真的疊到的（照泡泡、圖釘實際的大小量）再合成一顆，直到沒有東西壓在泡泡上
        // 字典的順序不固定：每次開 App 換種子，同一次開 App 裡每建一個新字典（或字典長大換表）也會換。
        // 下面的合併是照順序吃的，不先排好，同一個畫面會合成不一樣的泡泡。大的先吃，一樣大照格子位置
        let order: [String] = cells.keys.sorted { a, b in
            let na = cells[a]?.count ?? 0, nb = cells[b]?.count ?? 0
            return na != nb ? na > nb : a < b
        }
        var items: [[Place]] = order.compactMap { cells[$0] }
        var sum: [CGPoint] = [], cnt: [Int] = []      // 每顆的螢幕點加總、個數（算中心）
        for g in items {
            var s = CGPoint.zero, n = 0
            for p in g { if let q = pts[p.id] { s.x += q.x; s.y += q.y; n += 1 } }
            sum.append(s); cnt.append(n)
        }
        // 泡泡：食物圖示＋家數，至少 46 寬、46 高，畫在中心；單根圖釘：44 的圓，在座標點上面（底部尖角 7）
        func box(_ k: Int) -> CGRect? {
            guard cnt[k] > 0 else { return nil }
            let c = CGPoint(x: sum[k].x / CGFloat(cnt[k]), y: sum[k].y / CGFloat(cnt[k]))
            if items[k].count >= 2 {
                let w = max(46, 40 + 11 * CGFloat(String(items[k].count).count))
                return CGRect(x: c.x - w / 2, y: c.y - 23, width: w, height: 46)
            }
            return CGRect(x: c.x - 22, y: c.y - 51, width: 44, height: 44)
        }
        var i = 0
        while i < items.count {
            // 只有泡泡會吃掉旁邊的（兩根單獨的圖釘靠近不合，交給格子）；吃了一個就重新量一次
            guard items[i].count >= 2, let a = box(i)?.insetBy(dx: -3, dy: -3),
                  let j = items.indices.first(where: { $0 != i && box($0).map { a.intersects($0) } == true }) else { i += 1; continue }
            items[i] += items[j]; sum[i].x += sum[j].x; sum[i].y += sum[j].y; cnt[i] += cnt[j]
            items.remove(at: j); sum.remove(at: j); cnt.remove(at: j)
            if j < i { i -= 1 }
        }
        let groups = items.filter { $0.count >= 2 }
        // 行程模式：泡泡落在某站號碼上就往外推開（號碼要看得到）
        let marks = trip.on ? trip.marks.compactMap { proxy.convert($0.coord, to: .local) } : []
        func aside(_ lat: Double, _ lng: Double) -> (Double, Double) {
            guard !marks.isEmpty, let b = proxy.convert(CLLocationCoordinate2D(latitude: lat, longitude: lng), to: .local) else { return (lat, lng) }
            guard let m = marks.min(by: { hypot($0.x - b.x, $0.y - b.y) < hypot($1.x - b.x, $1.y - b.y) }) else { return (lat, lng) }
            let d = hypot(b.x - m.x, b.y - m.y)
            guard d < 46 else { return (lat, lng) }
            let ux = d > 1 ? (b.x - m.x) / d : 0.7, uy = d > 1 ? (b.y - m.y) / d : -0.7
            let to = CGPoint(x: m.x + ux * 50, y: m.y + uy * 50)
            guard let c = proxy.convert(to, from: .local) else { return (lat, lng) }
            return (c.latitude, c.longitude)
        }
        let next = groups.map { g -> PinCluster in
            // 一樣多時照分類固定的順序（Cat.order）：字典順序不固定，不排的話泡泡的圖示和顏色會換
            let top = Dictionary(grouping: g, by: \.cat.key).sorted { a, b in
                if a.value.count != b.value.count { return a.value.count > b.value.count }
                return (Cat.order.firstIndex(of: a.key) ?? Cat.order.count) < (Cat.order.firstIndex(of: b.key) ?? Cat.order.count)
            }.prefix(2)
            let cats = top.map { $0.value[0].cat.color }
            let (la, ln) = aside(g.map { $0.lat! }.reduce(0, +) / Double(g.count), g.map { $0.lng! }.reduce(0, +) / Double(g.count))
            return PinCluster(id: g.map(\.id).sorted().joined(separator: ","), ids: g.map(\.id),
                              lat: la, lng: ln,
                              colors: cats.count > 1 ? cats : [cats[0], cats[0].opacity(0.75)],
                              emoji: top.first?.value[0].cat.emoji ?? "")
        }.sorted { $0.id < $1.id }
        let nextHidden = Set(groups.flatMap { $0.map(\.id) })
        // 推開的泡泡位置變了也要換（站換了、縮放了）；平移時的小誤差不算
        let moved = zip(next, clusters).contains { abs($0.lat - $1.lat) > 1e-5 || abs($0.lng - $1.lng) > 1e-5 }
        guard nextHidden != hidden || next.map(\.id) != clusters.map(\.id) || moved else { return }
        func at(_ c: PinCluster) -> CGPoint? { proxy.convert(CLLocationCoordinate2D(latitude: c.lat, longitude: c.lng), to: .local) }
        var from: [String: CGSize] = [:], to: [String: CGSize] = [:]
        for c in clusters {
            guard let b = at(c) else { continue }
            for id in c.ids where !nextHidden.contains(id) { if let p = pts[id] { from[id] = CGSize(width: b.x - p.x, height: b.y - p.y) } }
        }
        for c in next {
            guard let b = at(c) else { continue }
            for id in c.ids where !hidden.contains(id) { if let p = pts[id] { to[id] = CGSize(width: b.x - p.x, height: b.y - p.y) } }
        }
        clusterTask?.cancel()
        pins.flyFrom = reduce ? [:] : from
        if to.isEmpty {
            // 上一輪還沒合完就被這輪取代：飛到一半的圖釘用同一個彈簧回原位
            pins.setMerge([:])
            Perf.shared.mark("泡泡直接換")
            hidden = nextHidden; clusters = next
        } else {
            // 先拆開的馬上出來、沒變的泡泡留著；要合的先飛過去，0.33 秒後再換成泡泡
            hidden = hidden.intersection(nextHidden)
            clusters = clusters.filter { o in next.contains { $0.id == o.id } }
            pins.setMerge(to)
            clusterTask = Task {
                try? await Task.sleep(for: .milliseconds(reduce ? 200 : 330))
                guard !Task.isCancelled else { return }
                Perf.shared.mark("泡泡換上")
                hidden = nextHidden; clusters = next; pins.setMerge([:])
            }
        }
        Task { try? await Task.sleep(for: .milliseconds(500)); pins.flyFrom = [:] }
    }

    // 點泡泡：放大到框住這幾家；擠在一起拆不開的，卡片列改成只列這幾間
    private func zoom(_ c: PinCluster) {
        guard !pins.moving else { Perf.shared.mark("地圖在動 不算點泡泡"); return }
        // 行程裡點泡泡放大：不是點空白（不收加站卡、不收搜尋）
        if trip.on { trip.pickAt = CACurrentMediaTime() }
        Haptic.light()
        Perf.shared.mark("點泡泡 \(c.ids.count) 間")
        quiet.hush()
        MapPanel.shared.atLeastMid()
        if !trip.on { Self.endHomeTyping() }
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

    // 下面的卡片停在某間：那根圖釘跳一下；不在看得到的地方就平移過去（縮放不變，下面的卡片不換）
    // 選著一根時（大卡片）卡片列不在畫面上、行程模式時整塊藏著：都不動。
    // 卡片列換掉的那一下可能還會停在某張，這時候移地圖會把剛飛去遠處的鏡頭拉回來
    private func focus(_ id: String) {
        guard pins.sel == nil, !trip.on else { return }
        guard let p = currentList.first(where: { $0.id == id }), let la = p.lat, let lo = p.lng else { return }
        if !hidden.contains(id) { pins.hop(id) }
        guard let r = store.mapRegion ?? shownRegion else { return }
        // 圖釘在螢幕上哪裡：在搜尋列下面、面板上面、左右沒出界就不用動
        guard let pt = pins.locate?(.init(latitude: la, longitude: lo)) else { return }
        let bottom = MapPanel.shared.top > 0 ? MapPanel.shared.top : footY
        guard pt.y < headY + 50 || pt.y > bottom - 20 || pt.x < 30 || pt.x > Self.mapWidth - 30 else { return }
        selfMoved = true
        quiet.hush()
        Perf.shared.mark("卡片列移地圖")
        withAnimation(.smooth(duration: 0.45)) {
            pos = .region(aim(MKCoordinateRegion(center: .init(latitude: la, longitude: lo), span: r.span), grow: false))
        }
    }

    // 搜尋框最左邊的深色膠囊：現在看誰的收藏，點了換；群組時是頭像＋縮短的群組名，✕ 在膠囊裡（回到我的收藏）
    // compact：正在打字，只留兩個頭像和 ▾（✕ 讓給右邊的清除鈕），輸入框才有地方
    private func scopePill(_ gname: String?, compact: Bool = false) -> some View {
        HStack(spacing: 2) {
            Button { scoping = true } label: {
                HStack(spacing: 6) {
                    if let g = store.mapGroup {
                        HStack(spacing: -6) { ForEach(store.membersOf(g).prefix(compact ? 2 : 3), id: \.self) { Avatar(name: store.name($0), id: $0, size: 22) } }
                        if !compact { Text(Self.short(gname ?? "")).lineLimit(1) }
                    } else {
                        Text("我的收藏")
                    }
                    Image(systemName: "chevron.down").font(.caption2.weight(.heavy))
                }
                .foregroundStyle(.white)
                .padding(.leading, store.mapGroup == nil ? 12 : 7)
                .frame(height: 36).contentShape(.rect)
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel("地圖要看誰的收藏，現在是" + (gname ?? "我的收藏"))
            if store.mapGroup != nil && compact {
                Color.clear.frame(width: 8, height: 1)
            } else if store.mapGroup != nil {
                Button { withAnimation(.snappy) { store.mapGroup = nil } } label: {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                        .frame(width: 22, height: 22).background(.white.opacity(0.18), in: .circle)
                        .frame(width: 32, height: 36).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("回到我的收藏")
            } else {
                Color.clear.frame(width: 10, height: 1)
            }
        }
        .font(.subheadline.weight(.heavy)).foregroundStyle(.white)
        .frame(height: 36)
        .background(Color(hex: 0x2a1a0a), in: .capsule)
        .fixedSize()
    }

    // 群組名太長：膠囊裡只放前 4 個字
    private static func short(_ s: String) -> String { s.count > 4 ? String(s.prefix(4)) + "…" : s }

    // 教學第一步：量出那間店的圖釘在螢幕上的位置（圖釘的尖端就是店的座標）
    private func pinFrame(_ proxy: MapProxy) {
        guard store.coachStep == .pin, let p = store.coachPlace, let lat = p.lat, let lng = p.lng,
              let pt = proxy.convert(CLLocationCoordinate2D(latitude: lat, longitude: lng), to: .global) else { return }
        let r = CGRect(x: pt.x - 24, y: pt.y - 58, width: 48, height: 58)
        if store.coachFrames[.pin] != r { store.coachFrames[.pin] = r }
    }

    private func fit() {
        // 地圖下緣還沒量到：等面板回報（setFoot 會再叫一次），不然框好又因為換邊距重排一次
        guard footY > 0, !fitted else { return }
        // 等這一輪版面排好（收藏剛載完時卡片列才出來，中段變高）再框，鏡頭才知道中段面板蓋到哪
        Task {
            try? await Task.sleep(for: .milliseconds(120))
            guard !fitted else { return }
            quiet.hush()
            if let b = bounds { fitted = true; pos = .region(b); return }
            centerIfEmpty(animated: false)
        }
    }

    // 新帳號一間都沒有：拿到位置（或同步做完）時看目前位置附近約 3 公里（沒有就停在預設的台北市）；之後有店了再框收藏。
    // 只做一次，使用者自己動過鏡頭或按過定位鈕就不做
    private func centerIfEmpty(animated: Bool = true) {
        guard !fitted, !quiet.centered, !quiet.touched, footY > 0, !store.loading, bounds == nil,
              store.mine.isEmpty, store.mapGroup == nil, let h = store.here else { return }
        quiet.centered = true
        quiet.hush()
        let r = aim(MKCoordinateRegion(center: h.coordinate, latitudinalMeters: 3000, longitudinalMeters: 3000), grow: false)
        if animated { withAnimation(.smooth(duration: 0.5)) { pos = .region(r) } } else { pos = .region(r) }
    }

    // 框住所有收藏：落在搜尋列和中段面板之間（上下多留一點給圖釘的高度）
    private var bounds: MKCoordinateRegion? {
        let ps = points; guard !ps.isEmpty else { return nil }
        let la = ps.map { $0.lat! }, lo = ps.map { $0.lng! }
        return aim(MKCoordinateRegion(center: .init(latitude: (la.min()! + la.max()!) / 2, longitude: (lo.min()! + lo.max()!) / 2),
                                      span: .init(latitudeDelta: max(0.02, (la.max()! - la.min()!) * 1.3), longitudeDelta: max(0.02, (lo.max()! - lo.min()!) * 1.3))))
    }

    // 搜尋按 return、「看全部 N 間」：把符合的店框進看得到的那塊
    private func frameShown() {
        // 程式移鏡頭也要離開「只列這幾間」
        seenBox.zoomed = nil
        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
        quiet.hush()
        MapPanel.shared.go(.mid)          // 先換段，aim() 才會用中段上緣算
        guard let b = bounds else { Haptic.warning(); return }
        Perf.shared.mark("框搜尋結果 \(points.count) 間")
        withAnimation(.smooth(duration: 0.5)) { pos = .region(b) }
    }
}

// 地圖的搜尋框和分類籤：只有這一小塊建 store.mapF 的綁定。把綁定交給子畫面時 SwiftUI 會讀一次值，
// 讀的人就記下依賴（-printChanges 量到 MapTab 因此跟著收藏頁每打一個字重算）；放在這裡，MapTab 只看 FilterSync 給的 applied
private struct MapSearchBar: View {
    @Environment(Store.self) private var store
    let prompt: String
    let lead: ((Bool) -> AnyView)?
    let begin: () -> Void
    let add: () -> Void
    let submit: () -> Void
    var body: some View {
        @Bindable var store = store
        VStack(spacing: 8) {
            SearchField(text: $store.mapF.q, prompt: prompt, lead: lead, begin: begin) {
                AddButton { add() }.coachAnchor(.add)
            }
            .padding(.horizontal, 16)
            .onSubmit(of: .text) { submit() }
            FilterChips(f: $store.mapF, solid: true)
        }
    }
}

// MapTab 每次被重新建構（Root 重算）時不要再 new 一個 CLLocationManager：整個 App 共用一個
@MainActor enum LocMgr { static let shared = CLLocationManager() }

// 下面那排要放哪些店：地圖現在看到的範圍裡的店，由近到遠（沒開定位就從地圖中心算）
// 地圖現在看的範圍（手指移動、縮放停下來才更新）。peek 給 MapTab 的函式用（改了不重畫），
// shown 只有 NearbyHost 讀：地圖每停一次只重算下面的面板
@MainActor @Observable final class SeenBox {
    private(set) var shown: MKCoordinateRegion?
    @ObservationIgnored private(set) var peek: MKCoordinateRegion?
    var only: Set<String>?                          // 點了拆不開的泡泡：卡片列只列這幾間
    @ObservationIgnored var zoomed: String?         // 上一次點的泡泡；沒拖地圖又點同一顆，表示放大過了還是拆不開
    func set(_ r: MKCoordinateRegion?, publish: Bool) {
        peek = r
        guard publish, let r else { return }
        if let o = shown, o.center.latitude == r.center.latitude, o.center.longitude == r.center.longitude, o.span.latitudeDelta == r.span.latitudeDelta { return }
        shown = r
    }
}

// 下面面板的「附近 N 間」：在這一小層算，地圖停下來或面板上緣變了只有這裡和面板重算。
// MapTab 重算時，清單、版面都沒變就整個跳過（面板裡要的其他東西它自己會看）
struct NearbyHost<C: View>: View, Equatable {
    let seen: SeenBox
    let list: [Place]
    let total: Int
    let base: Int          // 篩選前有幾間（我的收藏或這個群組）
    let inGroup: Bool
    let filter: Filter
    let headY: CGFloat
    let mapRect: CGRect
    @ViewBuilder let content: (Nearby) -> C
    @Environment(Store.self) private var store

    nonisolated static func == (a: Self, b: Self) -> Bool {
        a.total == b.total && a.base == b.base && a.inGroup == b.inGroup && a.filter == b.filter
            && a.headY == b.headY && a.mapRect == b.mapRect && a.list == b.list
    }

    var body: some View {
        let _ = Perf.signposter.emitEvent("附近重算")
        let _ = Perf.shared.note("附近重算")
        let t0 = CACurrentMediaTime()
        let n = Nearby(list: list, here: store.here, region: visible, total: total, base: base, inGroup: inGroup, filter: filter, only: seen.only)
        let _ = Perf.shared.note(String(format: "附近算 %.2f ms，%ld 間", (CACurrentMediaTime() - t0) * 1000, n.places.count))
        content(n)
    }

    // 「附近」只算看得到的那塊：搜尋列下緣到面板上緣（停好的位置）
    private var visible: MKCoordinateRegion? {
        let bottom = MapPanel.shared.top
        guard let r = seen.shown, mapRect.height > 1, bottom > headY, headY > mapRect.minY else { return seen.shown }
        let t = (headY - mapRect.minY) / mapRect.height, b = min(1, (bottom - mapRect.minY) / mapRect.height)
        let north = r.center.latitude + r.span.latitudeDelta / 2
        let hi = north - r.span.latitudeDelta * Double(t), lo = north - r.span.latitudeDelta * Double(b)
        return MKCoordinateRegion(center: .init(latitude: (hi + lo) / 2, longitude: r.center.longitude),
                                  span: .init(latitudeDelta: max(hi - lo, 1e-6), longitudeDelta: r.span.longitudeDelta))
    }
}

struct Nearby {
    let title: String, subtitle: String, places: [Place]
    var short = ""                     // 小字放不下整句時的短句（放不下就不顯示，不出現「…」）
    var lead: String?                  // 「附近 」「這一帶 」「找到 」：後面接間數（數字會滾動）
    var clear = false                  // 篩選或搜尋沒結果：標題那行放「清除篩選」
    var more = 0                       // 只點分類、鏡頭內 0 間但別處有幾間（放「看全部 N 間」）
    var isOnly = false                 // 點拆不開的泡泡：只列那幾間

    init(list: [Place], here: CLLocation?, region: MKCoordinateRegion?, total: Int, base: Int, inGroup: Bool, filter: Filter, only: Set<String>? = nil) {
        // 先看篩選前有沒有店：群組或帳號本來就沒有店時，清除篩選也不會有結果
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
        if let only {
            let l = list.filter { only.contains($0.id) }
            // 篩選把那幾間都拿掉：退回一般的「附近 N 間」
            if !l.isEmpty {
                places = ref.map { r in l.sorted { r.distance(from: CLLocation(latitude: $0.lat!, longitude: $0.lng!)) < r.distance(from: CLLocation(latitude: $1.lat!, longitude: $1.lng!)) } } ?? l
                title = "這裡有 \(l.count) 間"; subtitle = "擠在同一處"; short = subtitle; isOnly = true
                return
            }
        }
        func inView(_ p: Place) -> Bool {
            guard let r = region else { return true }
            return abs(p.lat! - r.center.latitude) <= r.span.latitudeDelta / 2 && abs(p.lng! - r.center.longitude) <= r.span.longitudeDelta / 2
        }
        // 有搜尋字：符合的店全部列出，不管鏡頭在哪；只點分類：維持鏡頭內的「附近 N 間」
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

    // 目前的條件，例如「✓ 去過・🍜 餐廳・「拉麵」」
    static func cond(_ f: Filter) -> String {
        var parts: [String] = []
        if f.status == "want" { parts.append("♥ 想去") } else if f.status == "been" { parts.append("✓ 去過") }
        // -noEmoji 量測時 emoji 是空字串：不多一個開頭空格
        if let c = Cat.all[f.cat] { parts.append([c.emoji, c.name].filter { !$0.isEmpty }.joined(separator: " ")) }
        if !f.q.isEmpty { parts.append("「\(f.q)」") }
        return parts.joined(separator: "・")
    }
}

// 下面那塊：三段高度（一行／一排卡片／整份附近清單），拉橫條或標題那行換段，甩一下跳段。
// 拉的時候只有這塊重畫；地圖的邊距只在停好時才量（不然地圖每幀重排）
struct NearbySheet: View {
    let near: Nearby
    let pins: PinState
    let list: [Place]
    var group: String? = nil
    var draw: (() -> Void)? = nil
    var panel: () -> Void = {}
    var choose: (Place) -> Void = { _ in }
    var dropKey: String? = nil
    var focus: (String) -> Void = { _ in }
    var endOnly: () -> Void = {}                // 離開「只列這幾間」
    var frameAll: () -> Void = {}               // 「看全部 N 間」：把符合的店框進看得到的那塊
    var ceiling: CGFloat = 0                    // 拉到最高時面板上緣停在這（搜尋列下緣再下面一點，螢幕座標）
    var top: AnyView? = nil                     // 浮在面板上緣的東西（行程、定位兩顆），跟著面板上下
    var foot: (CGFloat) -> Void = { _ in }      // 回報最低段停好時的面板上緣（只報變大的），地圖拿來定下緣
    @State private var counted: Int?          // 圖釘落下時「附近 N 間」從 0 數上去
    @State private var scrolled: String?      // 卡片列停在哪一間
    @State private var cards = CardScroll()   // 卡片列：上次對過去的那間、手指有沒有在捲（不觀察，改了不重畫面板）
    @State private var mp = MapPanel.shared
    @State private var lift = Lift()            // 手指拉了多少（往上為正）：只有套高度那層每幀重畫
    @State private var tallPull: Bool?          // 拉的過程中跨過一半：換成直的清單（只在跨線時變）
    @State private var midH: CGFloat = 0        // 中間段的自然高度（卡片列或大卡片）
    @State private var bottomY: CGFloat = 0     // 面板內容下緣（螢幕座標）
    @State private var lowering = false         // 最高段清單捲到頂再往下拉過頭：放開時降一段
    @State private var listTouch = false        // 手指正在拉最高段的清單（甩過頭的回彈不算）
    @State private var topH: CGFloat = 0        // 浮在上緣那排（行程、定位）的高度
    @State private var highUsed = false         // 整份清單出現過就留著（不要拿掉再建）
    @State private var probe = PanelProbe()
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(Store.self) private var store

    private static let grabH: CGFloat = 23      // 橫條那塊（上 8、橫條 5、下 10）
    private static let lowH: CGFloat = 72       // 最低：橫條＋標題那行（🎲 有 44pt 高）
    private var midT: CGFloat { max(Self.lowH + 40, midH) }
    private var highT: CGFloat { ceiling > 0 && bottomY > 0 ? max(midT + 60, bottomY - ceiling) : midT + 60 }
    private func target(_ s: MapStage) -> CGFloat { s == .low ? Self.lowH : s == .mid ? midT : highT }
    private func clamp(_ h: CGFloat) -> CGFloat { min(highT + 30, max(Self.lowH - 30, h)) }

    var body: some View {
        let _ = Perf.shared.count("附近面板")
        // 選到的那間（點圖釘或抽中）：下面換成那間的大卡片
        // 行程模式時這塊藏著：選到收藏是給加站卡用的，這裡不跟著換大卡片、也不拆掉卡片列
        let picked = TripMode.shared.on ? nil : pins.sel.flatMap { id in list.first { $0.id == id } }
        let drawn = pins.drawn != nil && pins.drawn == pins.sel
        // 拉過中間和最高的一半：內容換成直的清單
        let tall = tallPull ?? (mp.stage == .high)
        VStack(spacing: 0) {
            Capsule().fill(Color.ink.opacity(0.15)).frame(width: 38, height: 5)
                .frame(maxWidth: .infinity).padding(.top, 8).padding(.bottom, 10)
                .modifier(grip)
                // VoiceOver：上下滑就能換段
                .accessibilityElement()
                .accessibilityLabel("附近清單")
                .accessibilityValue(mp.stage == .low ? "收起" : mp.stage == .mid ? "一排卡片" : "整份清單")
                .accessibilityAdjustableAction { d in
                    switch d {
                    case .increment: mp.go(mp.stage == .low ? .mid : .high)
                    case .decrement: mp.go(mp.stage == .high ? .mid : .low)
                    @unknown default: break
                    }
                }
            ZStack(alignment: .top) {
                mid(picked, drawn)
                    .fixedSize(horizontal: false, vertical: true)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { v in
                        let n = Self.grabH + v
                        guard abs(n - midH) > 0.5 else { return }
                        // 換成大卡片時面板跟著卡片一起彈上來
                        if midH == 0 || mp.dragging { midH = n } else { withAnimation(reduce ? .easeOut(duration: 0.25) : .spring(response: 0.45, dampingFraction: 0.68)) { midH = n } }
                    }
                    .opacity(tall ? 0 : 1)
                    .allowsHitTesting(!tall)
                    .accessibilityHidden(tall)
                if tall || highUsed {
                    high
                        .frame(height: max(0, highT - Self.grabH), alignment: .top)
                        .opacity(tall ? 1 : 0)
                        // 拉過一半清單淡出時，正在拉的手指不能被中斷
                        .allowsHitTesting(tall || mp.dragging)
                        .accessibilityHidden(!tall)
                        .onAppear { highUsed = true }
                }
            }
            .animation(.easeOut(duration: 0.18), value: tall)
        }
        .modifier(LiftHeight(lift: lift, base: target(mp.stage), lo: Self.lowH, hi: highT))
        .clipped()
        // 被裁掉的卡片列（最低段）不要還點得到
        .contentShape(.rect)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
            probe.top = r.minY
            if !mp.dragging, !TripMode.shared.on, abs(r.maxY - bottomY) > 0.5 { bottomY = r.maxY }
            report()
        }
        // 圖釘落下時，「附近 N 間」跟著從 0 往上數
        .task(id: dropKey) {
            // 同一次落下只數一次（離開行程模式、這排重新出現時不要再從 0 數）
            guard dropKey != nil, !reduce, pins.countedKey != dropKey else { return }
            pins.countedKey = dropKey
            let total = near.places.count
            guard total > 1 else { return }
            let steps = min(total, 20)
            for i in 0...steps {
                withAnimation(.snappy) { counted = total * i / steps }
                try? await Task.sleep(for: .milliseconds(40))
                if Task.isCancelled { break }
            }
            counted = nil
        }
        // 底下留位置給浮著的分頁列，底色一路鋪到螢幕最下面
        .padding(.bottom, 82)
        .background(UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26).fill(Color.bg)
            .shadow(color: .black.opacity(Flag.on("-noPanelShadow") ? 0 : 0.12), radius: Flag.on("-noPanelShadow") ? 0 : 12, y: -2).ignoresSafeArea(edges: .bottom))
        // 行程、定位兩顆：底邊貼著面板上緣再上去 10pt，跟著面板動（不佔面板的高度）
        // 先量出那排的高度，再整排往上推「高度＋10」（alignmentGuide 在這裡沒作用，按鈕會蓋在面板上）
        .overlay(alignment: .top) {
            if let top {
                top
                    .fixedSize(horizontal: false, vertical: true)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { v in if abs(v - topH) > 0.5 { topH = v } }
                    .offset(y: -(topH + 10))
                    // 快到最高時淡掉（跟著手指算，只有這層每幀重畫）
                    .modifier(TopFade(lift: lift, base: target(mp.stage), lo: Self.lowH, hi: highT, shown: topH > 0))
            }
        }
        // 訊息條貼著停好的面板上緣（Root 讀這個值）
        .onChange(of: target(mp.stage), initial: true) { _, v in
            if abs(store.panelTop - (v + 82)) > 0.5 { store.panelTop = v + 82 }
        }
        // 整份清單閒下來先建好（藏著），第一次拉到最高不用當場建、不會頓一下
        .task {
            try? await Task.sleep(for: .seconds(1.5))
            while mp.dragging { try? await Task.sleep(for: .milliseconds(300)) }
            if !Task.isCancelled, !highUsed, !Flag.on("-noHighPrebuild") { highUsed = true }
        }
    }

    // 中間段：選到的大卡片、新帳號的第一張卡，或標題＋一排卡片（最低段只露出最上面那行）
    private func mid(_ picked: Place?, _ drawn: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let p = picked {
                PickedCard(place: p, saver: group == nil ? nil : p.owner, drawn: drawn, draw: draw, panel: panel, pickHistory: choose, grip: grip) {
                    // 關掉大卡：下面的卡片列捲到這間
                    cards.focused = p.id; scrolled = p.id
                    pins.select(nil)
                }
                    .id(p.id)
                    .transition(.asymmetric(insertion: .offset(y: 44).combined(with: .opacity), removal: .opacity))
            } else if group == nil && store.mine.isEmpty && !store.loading {
                // 新帳號還沒有收藏：一張「收藏第一間店」大卡
                FirstPlaceCard().modifier(grip).transition(.opacity)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    titleRow
                    if !near.places.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) {
                                ForEach(near.places) { p in
                                    NavigationLink(value: p) { MapCard(place: p, on: false, saver: group == nil ? nil : p.owner) }.buttonStyle(PressStyle { ReelCache.warm(p) })
                                }
                            }
                            .scrollTargetLayout()
                            .padding(.horizontal, 16).padding(.bottom, 6)
                        }
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
                        .accessibilityHidden(mp.stage == .low)   // 最低段被裁掉的卡片列不唸
                        // 手指捲停在某張 0.25 秒：那根圖釘跳一下、地圖移過去
                        .task(id: scrolled) {
                            guard let id = scrolled, id != cards.focused else { return }
                            try? await Task.sleep(for: .milliseconds(250))
                            guard !Task.isCancelled, cards.finger || CACurrentMediaTime() - cards.fingerAt < 1.0 else { return }
                            cards.focused = id
                            focus(id)
                        }
                    }
                }
                .transition(.opacity)
            }
        }
        // 換成大卡片時從下面彈上來（有一點點回彈）
        .animation(reduce ? .easeOut(duration: 0.25) : .spring(response: 0.45, dampingFraction: 0.68), value: picked?.id)
    }

    // 最高段：標題＋直的附近清單，捲到頂再往下拉就把面板拉低
    private var high: some View {
        VStack(alignment: .leading, spacing: 10) {
            titleRow
            if near.places.isEmpty {
                // 沒有店：整塊空白也能拉
                VStack(alignment: .leading, spacing: 0) {
                    Text(near.subtitle).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                        .padding(.horizontal, 18)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .modifier(grip)
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(near.places) { p in
                            NavigationLink(value: p) { NearRow(place: p, saver: group == nil ? nil : p.owner) }.buttonStyle(PressStyle { ReelCache.warm(p) })
                        }
                    }
                    .padding(.horizontal, 16).padding(.top, 2).padding(.bottom, 16)
                    // 捲到頂再往下拉：面板跟著手指往下（清單不回彈），放開照面板的規則停段
                    .background(ListPullDown(name: "首頁", changed: { drag($0) }, ended: { up in settle(target(mp.stage) + up * 0.6, push: up) }))
                }
                // 備案（找不到底下的 UIScrollView 時）：拉過頭約 56pt，放開降到中間段；面板接手時不跑
                // 清單拉過頭有阻力，手指拉 56pt 畫面只動約 28pt，所以線畫在 28
                .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top < -28 } action: { _, past in
                    guard past, listTouch, !lowering, !mp.dragging else { return }
                    lowering = true
                    Haptic.light()
                }
                .onScrollPhaseChange { _, ph in
                    listTouch = ph == .interacting
                    guard lowering, ph != .interacting else { return }
                    lowering = false
                    mp.go(.mid)
                }
                // 只在直的清單真的看得到時擋（中間段時它以 opacity 0 先建好掛著）
                .swipeBackBlocked(tallPull ?? (mp.stage == .high))
            }
        }
    }

    // 「附近 51 間 由近到遠 ……… 🎲 抽一間」：整行都能拉
    private var titleRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            // 標題（群組名稱可能很長）先拿位置，小字不夠放就先截掉小字
            title.font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.8)
                .layoutPriority(1)
                .accessibilityActions {
                    if mp.stage != .high { Button("展開附近清單") { mp.go(mp.stage == .low ? .mid : .high) } }
                    if mp.stage != .low { Button("收起") { mp.go(.low) } }
                }
            // 整句放得下就整句，放不下換短句，連短句都放不下（群組名很長）就不顯示
            ViewThatFits(in: .horizontal) {
                Text(near.subtitle).lineLimit(1)
                Text(near.short).lineLimit(1)
                Color.clear.frame(width: 1, height: 1)
            }
            .font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.45))
            Spacer(minLength: 0)
            if near.isOnly {
                Button { endOnly() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink)
                        .frame(width: 32, height: 32).background(Color.ink.opacity(0.07), in: .circle)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("回到附近的店")
            }
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
                // 清除篩選（動作跟收藏頁的一樣，listF 就是 mapF）
                Button { Haptic.light(); withAnimation(.snappy) { store.mapF = Filter() } } label: {
                    Text("清除篩選").font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
                        .padding(.horizontal, 12).frame(height: 36).background(Color.accent.opacity(0.13), in: .capsule)
                        .frame(minHeight: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(.leading, 18).padding(.trailing, 12)
        .modifier(grip)
    }

    private var grip: PanelDrag {
        PanelDrag(changed: { up in drag(up) }, ended: { up in settle(target(mp.stage) + up * 0.6, push: up) }, released: released)
    }

    private func drag(_ up: CGFloat) {
        if !mp.dragging { mp.dragging = true }
        lift.y = up
        let t = clamp(target(mp.stage) + up) > (midT + highT) / 2
        if t != (tallPull ?? (mp.stage == .high)) { tallPull = t }
    }

    // 放開：停在最近的一段（甩得快就往甩的方向），換段輕震
    private func settle(_ now: CGFloat, push: CGFloat = 0) {
        guard mp.dragging else { return }
        let all: [MapStage] = [.low, .mid, .high]
        var pick = all.min { abs(target($0) - now) < abs(target($1) - now) }!
        // 往一個方向拉超過 60 就至少換一段（段距大時才不會彈回原位像沒反應）
        if pick == mp.stage, abs(push) > 60 {
            let i = all.firstIndex(of: mp.stage)! + (push > 0 ? 1 : -1)
            if all.indices.contains(i) { pick = all[i] }
        }
        mp.dragging = false
        mp.calmUntil = CACurrentMediaTime() + 0.8
        if pick != mp.stage { Haptic.light(); Perf.shared.note("面板 \(mp.stage) → \(pick)（拖放）") }
        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { mp.stage = pick; lift.y = 0; tallPull = nil }
        // 停好之後量一次地圖邊距（拉的過程中都沒量）
        Task { try? await Task.sleep(for: .milliseconds(80)); report() }
    }

    // 手勢被系統中斷（沒有 onEnded）：停在現在最近的那段
    private func released() {
        Task {
            await Task.yield()
            if mp.dragging { settle(target(mp.stage) + lift.y) }
        }
    }

    private func report() {
        guard !mp.dragging, !TripMode.shared.on else { return }
        // 最低段上緣：只取最大值。鍵盤把面板往上推時值會變小，不採用，地圖就不會因為鍵盤重排
        let grew = bottomY > 0 && bottomY - Self.lowH > mp.lowTop + 0.5
        if grew { mp.lowTop = bottomY - Self.lowH }
        // 中段上緣用算的（最低段下緣 − 中段高度），不受大卡、鍵盤影響（鏡頭 aim() 用）；先算好再通知地圖
        if mp.lowTop > 0 { mp.midTop = mp.lowTop + Self.lowH - midT }
        if grew { foot(mp.lowTop) }
        // 量測用 -holdTop（F3 對照，不加參數照舊）：選著店、停在中段時不更新面板上緣
        let hold = Flag.on("-holdTop") && mp.stage == .mid && pins.sel != nil
        if mp.stage != .high, !hold, probe.top > 0, abs(mp.top - probe.top) > 0.5 { mp.top = probe.top }
    }
}

extension NearbySheet {
    // 「附近 12 間」：數字變的時候滾動
    fileprivate var title: some View {
        let g = group.map { "\($0) · " } ?? ""
        let n = counted ?? near.places.count
        return (near.lead.map { Text(g + $0) + Text("\(n)") + Text(" 間") } ?? Text(g + near.title))
            .contentTransition(.numericText(value: Double(n)))
            .animation(.snappy, value: n)
    }
}

// 量到的位置：每幀都會變，放在不會觸發重畫的物件裡
// 行程、定位兩顆：面板快拉到最高時淡掉、不能按
private struct TopFade: ViewModifier {
    let lift: Lift
    let base: CGFloat
    let lo: CGFloat
    let hi: CGFloat
    let shown: Bool
    func body(content: Content) -> some View {
        let h = min(hi + 30, max(lo - 30, base + lift.y))
        let fade = min(1, max(0, (hi - h - 40) / 80))
        content
            .opacity(shown ? fade : 0)
            .allowsHitTesting(shown && fade > 0.5)
            .accessibilityHidden(fade < 0.5)
    }
}

private final class PanelProbe {
    var top: CGFloat = 0
}

// 卡片列的手指狀態：只有手指捲停的那張才移地圖（重新掛上、換清單時 SwiftUI 自己改 scrolled 不算）
private final class CardScroll {
    var focused: String?                 // 上一次已經讓地圖對過去的那間（關大卡自己捲過去的也算）
    var finger = false                   // 手指正在捲，或甩出去還在滑
    var fingerAt: CFTimeInterval = 0     // 手指最後一次捲的時間（放開、停下那一刻也算）
}

// 面板頂部（橫條、標題那行、大卡片最上面那行）的拖曳：往上拉為正；手勢被中斷時 released 收尾
struct PanelDrag: ViewModifier {
    var on = true
    var changed: (CGFloat) -> Void = { _ in }
    var ended: (CGFloat) -> Void = { _ in }       // 放開：預測會停的位移（往上為正）
    var released: () -> Void = {}
    @GestureState private var holding = false

    func body(content: Content) -> some View {
        content
            .contentShape(.rect)
            .gesture(DragGesture(minimumDistance: 4, coordinateSpace: .global)
                .updating($holding) { _, s, _ in s = true }
                .onChanged { changed(-$0.translation.height) }
                .onEnded { ended(-$0.predictedEndTranslation.height) }, including: on ? .all : .subviews)
            .onChange(of: holding) { _, h in if !h { released() } }
            .swipeBackBlocked(on)
    }
}

// 最高段清單的一列：64pt 照片、店名、分類・地區・想去/去過，右邊距離
private struct NearRow: View {
    @Environment(Store.self) private var store
    let place: Place
    var saver: String? = nil
    var body: some View {
        let _ = Perf.shared.count("附近列")
        HStack(spacing: 12) {
            PhotoView(place: place, px: 200).frame(width: 64, height: 64).clipShape(.rect(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                Text(meta).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
            }
            Spacer(minLength: 4)
            if let d = store.distance(place) {
                Text(fmtDistance(d)).font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent).monospacedDigit()
            }
        }
        .padding(10)
        .candy(18)
    }

    private var meta: String {
        var s = place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name
        if !place.area.isEmpty { s += "・" + place.area }
        if let saver { s += "・\(store.name(saver)) 收" } else { s += place.been ? "・✓ 去過" : "・♥ 想去" }
        return s
    }
}

// 選到一間時下面那張大卡：照片、店名、分類地區，導航和店家頁；抽中的還能再抽一次
struct PickedCard: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    let place: Place
    var saver: String? = nil
    var drawn = false
    var draw: (() -> Void)? = nil
    var panel: () -> Void = {}
    var pickHistory: (Place) -> Void = { _ in }
    var grip = PanelDrag(on: false)           // 地圖首頁：最上面那行也能拉面板
    let close: () -> Void
    @State private var askNav = false
    @State private var mp = MapPanel.shared

    var body: some View {
        let _ = Perf.shared.count("大卡")
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                // 最低段只露這一行：放店名（中段照舊是「離你 350 m」，店名在下面卡片裡）
                Text(mp.stage == .low ? place.name : top)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(Color.ink.opacity(mp.stage == .low ? 1 : 0.55)).lineLimit(1)
                Spacer(minLength: 0)
                if let draw {
                    DiceChip(text: drawn ? "再抽一次" : "抽一間", draw: draw, panel: panel)
                }
                Button(action: close) {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink)
                        .frame(width: 32, height: 32).background(Color.ink.opacity(0.07), in: .circle)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel("回到附近的店")
            }
            .padding(.leading, 18).padding(.trailing, 10)
            .modifier(grip)
            // 這次抽過的店，點一個回到那間（放在有 ✕、能拉的那行下面，最低段才看得到那行）
            if draw != nil { DrawHistory(tap: pickHistory).padding(.bottom, -2) }
            HStack(alignment: .top, spacing: 12) {
                // 點照片也進店家頁（照片飛過去）
                NavigationLink(value: place) {
                    PhotoView(place: place, px: 400).frame(width: 120, height: 120).clipShape(.rect(cornerRadius: 18))
                }
                .buttonStyle(PressStyle { ReelCache.warm(place) })
                .accessibilityLabel("\(place.name) 店家頁")
                VStack(alignment: .leading, spacing: 4) {
                    Text(place.name).font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(meta).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                    if let saver {
                        Text("\(store.name(saver)) 收").font(.system(size: 11.5, weight: .heavy)).foregroundStyle(.white)
                            .padding(.horizontal, 8).frame(height: 22).background(Avatar.color(saver), in: .capsule)
                    } else {
                        Badge(place: place).overlay(Capsule().strokeBorder(Color.sprPink.opacity(place.been ? 0 : 0.35)))
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        Button {
                            if let a = NavApp.saved { if let u = place.navURL(a) { openURL(u) } } else { askNav = true }
                        } label: {
                            Label("導航", systemImage: "location.fill").font(.subheadline.weight(.heavy)).foregroundStyle(.white)
                                .padding(.horizontal, 12).frame(height: 36).background(Color.accent, in: .capsule)
                                .frame(minHeight: 44).contentShape(.rect)
                        }
                        .buttonStyle(PressStyle())
                        NavigationLink(value: place) {
                            HStack(spacing: 3) { Text("店家頁"); Image(systemName: "chevron.right").font(.caption.weight(.heavy)) }
                                .font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
                                .padding(.horizontal, 12).frame(height: 36).background(Color.accent.opacity(0.13), in: .capsule)
                                .frame(minHeight: 44).contentShape(.rect)
                        }
                        .buttonStyle(PressStyle { ReelCache.warm(place) })
                    }
                }
                .frame(height: 120)
                Spacer(minLength: 0)
            }
            .padding(10)
            .candy(22)
            .padding(.horizontal, 16).padding(.bottom, 6)
        }
        .confirmationDialog("用哪個地圖導航？", isPresented: $askNav, titleVisibility: .visible) {
            ForEach(NavApp.allCases, id: \.self) { a in
                Button(a.name) { NavApp.saved = a; if let u = place.navURL(a) { openURL(u) } }
            }
        }
    }

    // 卡片上面一行：多遠、有幾間分店
    private var top: String {
        let n = store.branchesOf(place).count
        let s = [store.distance(place).map { "離你 " + fmtDistance($0) }, n > 1 ? "\(branchLabel(place))（\(n) 間分店）" : nil].compactMap { $0 }
        return s.isEmpty ? "選到的店" : s.joined(separator: " · ")
    }

    private var meta: String {
        var s = "\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)"
        if !place.area.isEmpty { s += " · " + place.area }
        if let pr = place.price, let t = PRICES[pr] { s += " · " + t }
        return s
    }
}

// 地圖上選到哪根圖釘、抽一間跳哪幾根
@MainActor @Observable final class PinState {
    private(set) var sel: String?
    // 取消選取的次數：MapTab 只看這個（不看 sel），取消時重畫一次，地圖才會真的放掉那根，再點同一根才有反應
    private(set) var cleared = 0
    var drawn: String?                  // 抽一間抽中的那間（還選著它時，按鈕變「再抽一次」）
    var extra: String?                  // 抽中但被篩選篩掉的店：照樣畫出圖釘（選別間就收掉）
    @ObservationIgnored var drawWin: String?     // 抽一間正在跳，最後會選中這根
    @ObservationIgnored var drawTask: Task<Void, Never>?
    // 每根圖釘自己的盒子（要飛進哪顆泡泡、抽一間跳一下）。整份不觀察：合併、跳的時候只有改到的那幾根重算，不是全部圖釘
    @ObservationIgnored private var boxes: [String: PinFX] = [:]
    @ObservationIgnored private var merging: Set<String> = []
    var menu: String?                            // 長按開了選單的那根
    @ObservationIgnored var longFired = false    // 長按剛開過選單（放開手指時不要當成點一下）
    // 手指移動、縮放地圖的最後一幀：兩指縮放放開時，手指底下的圖釘按鈕會收到「放開」，不能當成點一下
    @ObservationIgnored var camAt: CFTimeInterval = 0
    var moving: Bool { CACurrentMediaTime() - camAt < 0.12 }
    @ObservationIgnored var tapAt: CFTimeInterval = 0   // 手指最後點圖釘按鈕的時間（行程模式擋 MapKit 晚到的選取）
    @ObservationIgnored var touch: (p: CGPoint, at: CFTimeInterval)?   // 最後一次點地圖的位置（螢幕座標）、時間
    @ObservationIgnored var countedKey: String?  // 「附近 N 間」已經為這次落下數過了
    var dimAll = false                           // 行程模式：圖釘縮小變淡
    var bright: Set<String> = []                 // 行程模式搜到的：照常大小
    @ObservationIgnored var locate: ((CLLocationCoordinate2D) -> CGPoint?)?   // 地圖座標 → 螢幕位置

    // 圖釘落下（第一次畫圖釘、換看誰的收藏時播一次）：由近到遠，每根晚 0.025 秒，最多錯開 40 根，之後的直接淡入
    @ObservationIgnored private(set) var dropKey: String?
    @ObservationIgnored private(set) var dropStart: CFTimeInterval = 0
    @ObservationIgnored private var dropRank: [String: Int] = [:]
    // 篩選改變：新出現的彈一下、被篩掉的多畫 0.25 秒縮小淡掉
    @ObservationIgnored private var lastIds: Set<String> = []
    @ObservationIgnored private var lastList: [Place] = []
    @ObservationIgnored private var pop: Set<String> = []
    @ObservationIgnored private var popUntil: CFTimeInterval = 0
    @ObservationIgnored private var gone: [Place] = []
    @ObservationIgnored private var goneUntil: CFTimeInterval = 0
    // 從泡泡拆出來的圖釘：一開始在泡泡的位置（相對自己的螢幕位移），再彈回自己的位置
    @ObservationIgnored var flyFrom: [String: CGSize] = [:]

    var dropping: Bool { CACurrentMediaTime() - dropStart < 1.3 }

    // 畫面算名單時呼叫（還沒畫圖釘之前），換了名單就重新排落下順序
    func arm(_ key: String, _ list: [Place], from ref: CLLocation?) {
        guard dropKey != key, !list.isEmpty else { return }
        dropKey = key
        dropStart = CACurrentMediaTime()
        let order = ref.map { r in list.sorted { r.distance(from: CLLocation(latitude: $0.lat!, longitude: $0.lng!)) < r.distance(from: CLLocation(latitude: $1.lat!, longitude: $1.lng!)) } } ?? list
        dropRank = Dictionary(uniqueKeysWithValues: order.enumerated().map { ($1.id, $0) })
        lastIds = Set(list.map(\.id)); lastList = list
    }

    // 新收藏的店（AI 剛找到、同步回來多的）：圖釘下次出現時落下
    static var fresh: Set<String> = []

    // 這根什麼時候開始落下（fade：排在 40 根之後，直接淡入）；不用落下回 nil
    func drop(_ id: String) -> (at: CFTimeInterval, fade: Bool)? {
        if Self.fresh.remove(id) != nil { return (CACurrentMediaTime() + 0.15, false) }
        guard let r = dropRank[id], dropping else { return nil }
        return r < 40 ? (dropStart + Double(r) * 0.025, false) : (dropStart + 1.0, true)
    }

    func popping(_ id: String) -> Bool { CACurrentMediaTime() < popUntil && pop.contains(id) }

    // 名單變了（篩選、搜尋）：記下新出現的和被拿掉的；回傳還要多畫一下的那些
    func track(_ list: [Place]) -> [Place] {
        let ids = Set(list.map(\.id)), now = CACurrentMediaTime()
        if ids != lastIds {
            if !lastIds.isEmpty, !dropping {
                pop = ids.subtracting(lastIds); popUntil = now + 0.6
                let g = lastIds.subtracting(ids)
                gone = lastList.filter { g.contains($0.id) }; goneUntil = now + 0.3
            }
            lastIds = ids; lastList = list
        }
        return now < goneUntil ? gone : []
    }

    // 手指點圖釘：點到已經選著的那根也通知一次（例如加站卡關掉後再點同一根）
    private(set) var again = 0
    func tap(_ id: String) {
        guard !moving else { Perf.shared.mark("地圖在動 不算點圖釘"); return }
        Perf.shared.note("select 開始（點圖釘）")
        tapAt = CACurrentMediaTime()
        if sel == id { again += 1 } else { select(id) }
    }

    func fx(_ id: String) -> PinFX {
        if let b = boxes[id] { return b }
        let b = PinFX()
        boxes[id] = b
        return b
    }

    // 那根跳一下（抽一間輪流跳、卡片列停在那間）
    func hop(_ id: String) { fx(id).hop += 1 }

    // 要合進泡泡的圖釘往泡泡的位置飛過去並淡掉；不在名單裡的回原位
    func setMerge(_ to: [String: CGSize]) {
        for id in merging where to[id] == nil { boxes[id]?.to = nil }
        for (id, v) in to { let b = fx(id); if b.to != v { b.to = v } }
        merging = Set(to.keys)
    }

    func select(_ id: String?) {
        guard sel != id else { return }
        Perf.shared.note("sel \(sel.map { String($0.prefix(8)) } ?? "nil") → \(id.map { String($0.prefix(8)) } ?? "nil")")   // 量測：誰改了選取
        // 手動選別根或點空白處，就取消還在跳的抽一間
        if drawWin != nil, id != drawWin { drawTask?.cancel(); drawTask = nil; drawWin = nil }
        if extra != nil, id != extra { extra = nil }
        if id == nil { cleared += 1 }
        sel = id
    }
}

// 一根圖釘自己的動作：要往哪顆泡泡飛（nil：不用合）、抽一間時跳了幾下
@MainActor @Observable final class PinFX {
    var to: CGSize?
    var hop = 0
}

// 只有這個看不見的小東西看 sel；sel 變了才呼叫 MapTab 處理（移地圖、放光圈）
private struct SelWatcher: View {
    let pins: PinState
    let act: (String?) -> Void
    var body: some View {
        Color.clear.onChange(of: pins.sel) { _, id in act(id) }
            .onChange(of: pins.again) { act(pins.sel) }
            // 行程模式的加站卡換了一間：那根圖釘放大（收藏用店的 id，搜到的地點用 hit: 開頭）。
            // 加站卡關掉了（往下拖、✕、加好了、按「完成」離開行程）：圖釘也取消選取，再點同一根才會重新打開；
            // 離開行程時不取消的話，回到首頁會冒出那間的大卡片。放在這裡，MapTab 本身不用追蹤 cand
            .onChange(of: TripMode.shared.cand?.id) { old, now in
                // 量測浮層：加站卡關掉時記離最後點圖釘多久（太快關掉就是被誤關）
                if old != nil, now == nil {
                    let dt = CACurrentMediaTime() - pins.tapAt
                    Perf.shared.mark(dt < 10 ? "加站卡關掉 距點 \(Int(dt * 1000))ms" : "加站卡關掉")
                }
                let c = TripMode.shared.cand
                pins.select(c.map { $0.place != nil ? $0.id : "hit:" + $0.id })
            }
    }
}

// 圖釘的按下手感：手指一碰到就壓扁並輕震（不等放開）
private struct PinPress: ButtonStyle {
    let reduce: Bool
    var down: () -> Void = {}
    func makeBody(configuration c: Configuration) -> some View {
        c.label
            .scaleEffect(x: c.isPressed && !reduce ? 0.86 : 1, y: c.isPressed && !reduce ? 0.8 : 1, anchor: .bottom)
            .animation(c.isPressed ? .easeOut(duration: 0.07) : .spring(response: 0.25, dampingFraction: 0.55), value: c.isPressed)
            .onChange(of: c.isPressed) { _, d in if d { Haptic.light(); down() } }
    }
}

// 食物圖釘：分類顏色的圓、白邊、中間是分類的食物圖示，下面一個小尖角。
// 選到時：先壓扁一下再彈高放大、圖示換成封面照片、下面跳出店名、地上影子變寬、放一圈光和彩色糖粒；其他圖釘縮小變淡。
// 只動縮放、位移、透明度，不重建圖釘，地圖才順
struct FoodPin: View {
    let place: Place
    let pins: PinState             // 選到哪根、抽一間跳哪根；每根自己看，地圖不用整張重算
    let fx: PinFX                  // 這根要不要飛進泡泡、跳一下（只看自己的盒子）
    var reduce = false             // 減少動態：不壓扁、不放光圈糖粒，只淡入淡出
    var saver: (id: String, name: String)? = nil   // 群組地圖：右上角小頭像是誰收的（地圖圖釘裡拿不到環境，直接傳名字）
    @State private var sx: CGFloat = 1
    @State private var sy: CGFloat = 1
    @State private var lift: CGFloat = 0
    @State private var up = false
    @State private var hopping = false
    // 落下、彈出、從泡泡飛回來
    @State private var dy: CGFloat
    @State private var dOp: Double
    @State private var dsx: CGFloat
    @State private var dsy: CGFloat
    @State private var fly: CGSize
    @State private var dropAt: CFTimeInterval?
    @State private var dropFade: Bool

    init(place: Place, pins: PinState, reduce: Bool = false, saver: (id: String, name: String)? = nil) {
        self.place = place; self.pins = pins; self.reduce = reduce; self.saver = saver
        self.fx = pins.fx(place.id)
        let d = pins.drop(place.id), pop = pins.popping(place.id) && !reduce
        _dropAt = State(initialValue: d?.at)
        _dropFade = State(initialValue: d?.fade ?? false)
        _dy = State(initialValue: d != nil && !d!.fade && !reduce ? -40 : 0)
        _dOp = State(initialValue: d != nil ? 0 : 1)
        _dsx = State(initialValue: pop ? 1.3 : 1)
        _dsy = State(initialValue: pop ? 1.3 : 1)
        _fly = State(initialValue: reduce || pins.sel == place.id ? .zero : pins.flyFrom[place.id] ?? .zero)
    }

    var body: some View {
        let _ = Perf.shared.count("圖釘")
        let on = pins.sel == place.id
        // 選到的那根永遠不跟泡泡合、也不從泡泡飛（店名小牌子才會跟著圖釘）
        let merge = on ? nil : fx.to
        let faded = pins.sel != nil && !on && !hopping   // 別間被選到時變淡（只改透明度，76 根一起動也不吃力）
        let dim = pins.dimAll && !on && !hopping && !pins.bright.contains(place.id)   // 行程模式的其他收藏
        let hop = fx.hop
        // 自己接點擊：手指一按下就壓扁、輕震，放開就選中，不用等地圖確認「是不是點兩下放大」
        Button {
            // 長按開過選單：放開手指不算點一下
            if pins.longFired { pins.longFired = false; return }
            pins.tap(place.id)
        } label: { pin(on) }
            .buttonStyle(PinPress(reduce: reduce) { pins.longFired = false })
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                pins.longFired = true
                Haptic.medium()
                Perf.shared.mark("長按圖釘")
                MapTab.endHomeTyping()
                withAnimation(.spring(response: 0.32, dampingFraction: 0.72)) { pins.menu = place.id }
            })
            .accessibilityLabel(place.name)
            .accessibilityAction(named: "加進行程、導航") { withAnimation(.snappy) { pins.menu = place.id } }
            .accessibilityAddTraits(on ? .isSelected : [])
            // 地上的影子：選到時變寬變淡
            .background(alignment: .bottom) {
                Ellipse().fill(.black.opacity(0.28)).frame(width: 22, height: 7)
                    .scaleEffect(x: on ? 1.6 : 1, y: 1).opacity(on ? 0.55 : 1).offset(y: 3)
                    .animation(.smooth(duration: 0.3), value: on)
            }
            // 深色店名小牌子，從圖釘下面彈出來
            .overlay(alignment: .bottom) {
                ZStack {
                    if on {
                        Text(place.name).font(.system(size: 13, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
                            .padding(.horizontal, 9).frame(height: 24)
                            .background(Color(hex: 0x2a1a0a), in: .capsule)
                            .fixedSize()
                            .transition(reduce ? AnyTransition.opacity : AnyTransition.scale(scale: 0.4, anchor: .top).combined(with: .opacity))
                    }
                }
                .offset(y: 32)
                .animation(reduce ? .easeOut(duration: 0.25) : .spring(response: 0.38, dampingFraction: 0.55), value: on)
                .allowsHitTesting(false)
            }
            .opacity(faded ? 0.5 : dim ? 0.6 : 1)
            .animation(.snappy(duration: 0.25), value: faded)
            .scaleEffect(dim ? 0.65 : 1, anchor: .bottom)
            .animation(.easeInOut(duration: 0.3), value: dim)
            .scaleEffect(x: dsx, y: dsy, anchor: .bottom)
            .offset(x: fly.width + (merge?.width ?? 0), y: dy + fly.height + (merge?.height ?? 0))
            .opacity(dOp * (merge == nil ? 1 : 0))
            .animation(reduce ? .easeOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.85), value: merge)
            .onAppear {
                Perf.signposter.emitEvent("圖釘出現")
                if on { up = true; sx = 1.35; sy = 1.35; lift = -10 }
                arrive()
            }
            .onChange(of: on) { _, v in v ? select() : deselect() }
            .onChange(of: hop) {
                withAnimation(.spring(response: 0.22, dampingFraction: 0.5)) { hopping = true } completion: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { hopping = false }
                }
            }
    }

    // 剛出現：落下（壓扁再彈回）、淡入、篩選新出現的從 1.3 倍彈回、從泡泡飛回自己的位置
    private func arrive() {
        if let at = dropAt {
            dropAt = nil
            let wait = max(0, at - CACurrentMediaTime())
            if dropFade || reduce {
                withAnimation(.easeOut(duration: 0.2).delay(wait)) { dOp = 1 }
            } else {
                withAnimation(.easeIn(duration: 0.25).delay(wait)) { dy = 0; dOp = 1 } completion: {
                    withAnimation(.easeOut(duration: 0.06)) { dsx = 1.1; dsy = 0.8 } completion: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { dsx = 1; dsy = 1 }
                    }
                }
            }
        } else if dOp < 1 {
            withAnimation(.easeOut(duration: 0.2)) { dOp = 1; dy = 0 }
        }
        if dsx != 1 { withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { dsx = 1; dsy = 1 } }
        if fly != .zero { withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { fly = .zero } }
    }

    private func pin(_ on: Bool) -> some View {
        let c = place.cat.color
        let hs: CGFloat = hopping && !Flag.on("-noHopScale") ? 1.3 : 1
        return VStack(spacing: -3) {
            ZStack {
                Circle().fill(c)
                EmojiGlyph(e: place.cat.emoji, size: 21, part: .pin, use: !Flag.on("-emojiImgSel") || on)
                if on, place.photoURL != nil { PinPhoto(place: place) }
            }
            .frame(width: 44, height: 44)
            .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            .overlay(alignment: .topTrailing) {
                if let saver { Avatar(name: saver.name, id: saver.id, size: 20).offset(x: 6, y: -4) }
            }
            Triangle().fill(.white).frame(width: 14, height: 10).rotationEffect(.degrees(180))
        }
        .scaleEffect(x: sx * hs, y: sy * hs, anchor: .bottom)
        .offset(y: lift)
        .contentShape(.rect)
    }

    private func select() {
        up = true
        if reduce { withAnimation(.easeOut(duration: 0.25)) { sx = 1.35; sy = 1.35; lift = -10 }; return }
        // 手指按下時已經壓扁過了（PinPress），放開直接彈高放大（有回彈）
        withAnimation(.spring(response: 0.42, dampingFraction: 0.55)) { sx = 1.35; sy = 1.35; lift = -10 }
    }

    // 換選別間：這根縮回去時先縮過頭一點再彈回原大小
    private func deselect() {
        up = false
        if reduce { withAnimation(.easeOut(duration: 0.25)) { sx = 1; sy = 1; lift = 0 }; return }
        withAnimation(.easeIn(duration: 0.12)) { sx = 0.9; sy = 0.9; lift = 0 } completion: {
            guard !up else { return }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.5)) { sx = 1; sy = 1 }
        }
    }
}

// 圖釘裡的圓形封面照：照片載好才淡入，不會先閃一下
private struct PinPhoto: View {
    let place: Place
    @State private var img: UIImage?
    var body: some View {
        Color.clear.frame(width: 44, height: 44)
            .overlay { if let img { Image(uiImage: img).resizable().scaledToFill().transition(.opacity) } }
            .clipShape(.circle)
            .contentShape(.circle)
        .task(id: place.photo) {
            guard let u = place.photoURL else { return }
            if let c = PhotoLoader.shared.cached(u, 160) ?? PhotoLoader.shared.anySize(u) { img = c; return }
            let i = await PhotoLoader.shared.load(u, 160)
            Perf.shared.note("圖釘封面到"); withAnimation(.easeOut(duration: 0.25)) { img = i }
        }
    }
}

// 選到時放一次的光圈和糖粒，畫在整張地圖上面（不放在圖釘裡，才不會被圖釘的框切掉一半）
@Observable final class BurstSpot {
    var at: CGPoint?                     // 選到那根圖釘尖端在螢幕上的位置（地圖移動時跟著更新）
    var coord: CLLocationCoordinate2D?
    var color: Color = .accent
    var shot = 0
    var until = Date.distantPast         // 光圈放完前，地圖移動才需要更新位置
}

private struct PinBurst: View {
    let spot: BurstSpot
    private static let dots: [Color] = ([0xff4f9a, 0x2ed3a0, 0x4da3ff, 0xffd23f, 0xff8a00, 0x8a5cf6, 0xff4f9a, 0x2ed3a0, 0x4da3ff, 0xffd23f] as [UInt32]).map { Color(hex: $0) }

    var body: some View {
        let at = spot.at, color = spot.color
        GeometryReader { g in
            let o = g.frame(in: .global).origin
            Color.clear
                .keyframeAnimator(initialValue: -1.0, trigger: spot.shot) { v, t in
                    v.overlay {
                        if t >= 0, t < 1, let at {
                            // 圓頭的中心：一開始離尖端 29（還沒彈起），圖釘彈高放大後約 49（39＋抬高 10），跟著一起升上去
                            let rise = 29 + 20 * (1 - pow(1 - min(t / 0.36, 1), 3))
                            if Flag.on("-smallBurst") {
                                // 量測用：只畫 220×240 的小框（光圈、糖粒都在框內）
                                Canvas { ctx, _ in Self.draw(ctx, CGPoint(x: 110, y: 150 - rise), t, color) }
                                    .frame(width: 220, height: 240)
                                    .position(x: at.x - o.x, y: at.y - o.y - 30)
                            } else {
                                Canvas { ctx, _ in Self.draw(ctx, CGPoint(x: at.x - o.x, y: at.y - o.y - rise), t, color) }
                            }
                        }
                    }
                } keyframes: { _ in
                    // 圖釘彈起來的同時放（手指按下時已經壓扁過了）
                    KeyframeTrack {
                        MoveKeyframe(0.0)
                        LinearKeyframe(1.0, duration: 0.7)
                    }
                }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private static func draw(_ ctx: GraphicsContext, _ head: CGPoint, _ t: Double, _ color: Color) {
        // 光圈：以圓頭為中心，0.65 秒從 0.6 倍放大到 3.2 倍並淡掉
        let rt = min(t / 0.93, 1), re = 1 - pow(1 - rt, 3)
        let r = 30 * (0.6 + 2.6 * re)
        ctx.stroke(Path(ellipseIn: CGRect(x: head.x - r, y: head.y - r, width: r * 2, height: r * 2)),
                   with: .color(color.opacity(0.9 * (1 - rt))), lineWidth: 3)
        // 糖粒：從圓頭往四周噴出去 34–54pt，再往下掉、淡掉
        let e = 1 - pow(1 - t, 2)
        for i in 0..<Self.dots.count {
            let a = 2 * Double.pi * (Double(i) + 0.25) / Double(Self.dots.count)
            let d = 34 + 20 * (Double(i) * 0.618).truncatingRemainder(dividingBy: 1)
            let rr = 24 + d * e   // 從圓頭邊緣往外飛
            let p = CGPoint(x: head.x + cos(a) * rr, y: head.y + sin(a) * rr + 36 * t * t)
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3.5, y: p.y - 3.5, width: 7, height: 7)), with: .color(dots[i].opacity(1 - t)))
        }
    }
}

struct MapCard: View {
    @Environment(Store.self) private var store
    let place: Place, on: Bool
    var saver: String? = nil
    var body: some View {
        let _ = Perf.shared.count("卡片")
        HStack(spacing: 12) {
            PhotoView(place: place, px: 300).frame(width: 84, height: 84).clipShape(.rect(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.system(size: 16, weight: .heavy)).lineLimit(1).foregroundStyle(Color.ink)
                Text("\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(place.area.isEmpty ? "" : " · " + place.area)")
                    .font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                Spacer(minLength: 0)
                if let saver {
                    // 群組地圖：誰收的（那個人的顏色）
                    Text("\(store.name(saver)) 收").font(.system(size: 11.5, weight: .heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 8).frame(height: 22).background(Avatar.color(saver), in: .capsule)
                } else {
                    Badge(place: place).overlay(Capsule().strokeBorder(Color.sprPink.opacity(place.been ? 0 : 0.35)))
                }
            }
            .padding(.vertical, 4)
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(width: 270, height: 104)
        .candy(20)
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(on ? Color.accent : .clear, lineWidth: 2.5))
    }
}

// 還沒有地址的店：列出來，點一間就能補地址（存檔時會自己查座標）
struct NoAddressSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var editing: Place?

    var body: some View {
        let list = store.mine.filter { $0.lat == nil || $0.lng == nil }
        NavigationStack {
            List(list) { p in
                Button { editing = p } label: {
                    HStack(spacing: 12) {
                        PhotoView(place: p, px: 160).frame(width: 52, height: 52).clipShape(.rect(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.headline).foregroundStyle(Color.ink)
                            Text(p.address?.isEmpty == false ? "地址找不到位置，點一下改" : "點一下補地址").font(.caption).foregroundStyle(Color.ink.opacity(0.5))
                        }
                        Spacer()
                        Image(systemName: "pencil").foregroundStyle(Color.accent)
                    }
                }
            }
            .overlay { if list.isEmpty { ContentUnavailableView("都在地圖上了 🎉", systemImage: "map") } }
            .navigationTitle("還沒有地址").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("完成") { dismiss() } }
            .sheet(item: $editing) { EditSheet(place: $0) }
        }
    }
}

// 「地圖要看誰的收藏？」：我的收藏，或某個群組大家分享的店
struct ScopeSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    row(nil, "我的收藏", "\(store.mine.count) 間 · 只有你自己存的") { Image("Logo").resizable().frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 10)).frame(width: 56, alignment: .leading).accessibilityHidden(true) }
                    ForEach(store.groups) { g in
                        let mem = store.membersOf(g.id)
                        row(g.id, g.name, "\(store.placesIn(g.id).count) 間 · \(mem.count) 人") {
                            // 最多三個頭像疊在一起，固定 56 寬，不會壓到群組名稱
                            HStack(spacing: -11) { ForEach(mem.prefix(3), id: \.self) { Avatar(name: store.name($0), id: $0, size: 26) } }
                                .frame(width: 56, alignment: .leading)
                        }
                    }
                }
                .padding(16)
            }
            .background(Color.bg)
            .navigationTitle("地圖要看誰的收藏？").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("完成") { dismiss() } }
        }
    }

    private func row<I: View>(_ id: String?, _ title: String, _ sub: String, @ViewBuilder icon: () -> I) -> some View {
        let on = store.mapGroup == id
        return Button {
            Haptic.light()
            withAnimation(.snappy) { store.mapGroup = id }
            dismiss()
        } label: {
            HStack(spacing: 12) {
                icon()
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                    Text(sub).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                }
                Spacer()
                if on { Image(systemName: "checkmark").font(.system(size: 15, weight: .heavy)).foregroundStyle(Color.accent) }
            }
            .padding(14)
            .candy(18)
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(on ? Color.accent : .clear, lineWidth: 2.5))
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// 擠在一起的幾根圖釘合成的泡泡
struct PinCluster: Identifiable, Equatable {
    let id: String
    let ids: [String]
    let lat: Double, lng: Double
    let colors: [Color]
    var emoji = ""                 // 最多那一類的食物圖示（跟行程的站號長得不一樣）
}

// 泡泡：分類顏色的漸層、最多那類的食物圖示加家數，出現時彈一下；點了放大到框住這幾家。
// 行程模式：小灰「+N」（不搶站號的鋒頭）。樣式從 PinState 讀，地圖標註不會跟著 MapTab 重畫
private struct ClusterBubble: View {
    let c: PinCluster
    var reduce = false
    var pins: PinState? = nil
    let tap: () -> Void
    @State private var on = false
    var body: some View {
        let small = pins?.dimAll == true
        Button(action: tap) {
            if small {
                Text("+\(c.ids.count)").font(.system(size: 12, weight: .black)).foregroundStyle(Color(hex: 0x8f8170))
                    .frame(width: 30, height: 30)
                    .background(Color.white.opacity(0.85), in: .circle)
                    .overlay(Circle().strokeBorder(Color(hex: 0xd8c6ad), lineWidth: 2))
                    .frame(width: 44, height: 44)
                    .contentShape(.circle)
            } else {
                HStack(spacing: 2) {
                    if !c.emoji.isEmpty { EmojiGlyph(e: c.emoji, size: 15, part: .bubble) }
                    // 數字一定一行：emoji 換成圖時圖寬取整會比字寬一點，數字會被擠成兩行（47 變 4、7）
                    Text("\(c.ids.count)").font(.system(size: 17, weight: .black)).foregroundStyle(.white)
                        .lineLimit(1).fixedSize()
                }
                .padding(.horizontal, 9)
                .frame(minWidth: 46, minHeight: 46)
                .background(LinearGradient(colors: c.colors, startPoint: .topLeading, endPoint: .bottomTrailing), in: .capsule)
                .overlay(Capsule().strokeBorder(.white, lineWidth: 3))
                .shadow(color: .black.opacity(Flag.on("-noBubbleShadow") ? 0 : 0.25), radius: Flag.on("-noBubbleShadow") ? 0 : 4, y: 2)
                .contentShape(.capsule)
            }
        }
        .buttonStyle(PinPress(reduce: reduce))
        .scaleEffect(on || reduce ? 1 : 0.6)
        .opacity(on ? 1 : 0)
        .animation(.easeInOut(duration: 0.25), value: small)
        .onAppear {
            Perf.signposter.emitEvent("泡泡出現")
            withAnimation(reduce ? .easeOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.6)) { on = true }
        }
        .accessibilityLabel("\(c.ids.count) 間店，點了放大")
    }
}

// 被篩選拿掉的圖釘：縮到 0.4 倍並淡掉（MapKit 拿掉圖釘不會播動畫，所以另外畫一下）
private struct GonePin: View {
    let place: Place
    var reduce = false
    @State private var on = true
    var body: some View {
        PinGlyph(place: place)
            .scaleEffect(on || reduce ? 1 : 0.4, anchor: .bottom)
            .opacity(on ? 1 : 0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear { withAnimation(.easeIn(duration: 0.2)) { on = false } }
    }
}

// 地圖上自己的藍點。不用 MapKit 的 UserAnnotation：拉近到街道時，它的藍點一動整張地圖就每幀重畫
// （模擬器走路 CPU 30% 以上，手機會燙）。自己畫、走 10 公尺才移一次
@MainActor @Observable final class MyDot {
    static let shared = MyDot()
    var coord: CLLocationCoordinate2D?
    var at: CGPoint?                     // 在螢幕上的位置（地圖移動時跟著更新，只有藍點那層會重畫）
    @ObservationIgnored var locate: ((CLLocationCoordinate2D) -> CGPoint?)?
    @ObservationIgnored private var last: CLLocation?

    func refresh() {
        let p = coord.flatMap { locate?($0) }
        if p != at { at = p }
    }

    func track() async {
        do {
            for try await u in CLLocationUpdate.liveUpdates() {
                if Task.isCancelled { break }
                guard let l = u.location, l.horizontalAccuracy >= 0, l.horizontalAccuracy < 300 else { continue }
                if let p = last, p.distance(from: l) < 10 { continue }
                last = l
                coord = l.coordinate
                refresh()
            }
        } catch {}
    }
}

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

private struct MyDotLayer: View {
    let dot: MyDot
    var body: some View {
        GeometryReader { g in
            if let p = dot.at {
                let o = g.frame(in: .global).origin
                MyDotView().position(x: p.x - o.x, y: p.y - o.y)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

private struct MyDotView: View {
    private let blue = Color(red: 0.0, green: 0.48, blue: 1.0)
    var body: some View {
        Circle().fill(blue)
            .frame(width: 16, height: 16)
            .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
            .background(Circle().fill(blue.opacity(0.16)).frame(width: 44, height: 44))
            .allowsHitTesting(false)
            .accessibilityLabel("你的位置")
    }
}

// 量測用：emoji 先畫成圖，縮放旋轉時不用從字型重組字形（-emojiImg pin,bubble,dice 或 all；-emojiImgSel 只換選中那根；
// -emojiWarm 只預熱不換圖）。沒加參數時 parts 是空的，畫面一律走原本的文字。body 只查表，畫圖只在 warm()
@MainActor @Observable final class EmojiSlot { var img: UIImage? }

@MainActor enum EmojiArt {
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
    enum Part: String { case pin, bubble, dice }
    static let parts: Set<String> = {
        guard let v = Flag.value("-emojiImg") else { return Flag.on("-emojiImgSel") ? ["pin"] : [] }
        return v == "all" ? ["pin", "bubble", "dice"] : Set(v.split(separator: ",").map(String.init))
    }()
    static let warmOnly = Flag.on("-emojiWarm")
    static var scale: CGFloat = 3        // warm 前由 MapTab 用 displayScale 蓋掉
    static let pad: CGFloat = 4          // 四邊多畫一點，不切到
    private static var slots: [String: EmojiSlot] = [:]
    // 最大放大倍率：圖釘選中彈起約 1.43、泡泡彈出約 1.07、🎲 只旋轉
    static func zoom(_ p: Part) -> CGFloat { p == .pin ? 1.5 : p == .bubble ? 1.1 : 1 }

    static func slot(_ e: String, _ size: CGFloat) -> EmojiSlot {
        let k = "\(e)@\(Int((size * 100).rounded()))"
        if let s = slots[k] { return s }
        let s = EmojiSlot(); slots[k] = s; return s
    }
    static func img(_ e: String, _ size: CGFloat, _ p: Part) -> UIImage? { parts.contains(p.rawValue) ? slot(e, size).img : nil }
    static func render(_ e: String, _ size: CGFloat, _ p: Part) {
        let s = slot(e, size)
        guard !e.isEmpty, warmOnly || parts.contains(p.rawValue), s.img == nil else { return }
        let t = CACurrentMediaTime()
        let r = ImageRenderer(content: Text(e).font(.system(size: size)).padding(pad))
        r.scale = scale * (warmOnly ? 1 : zoom(p))
        let i = r.uiImage
        if Flag.on("-perfOverlay") { print("[emoji] 畫 \(e) \(p.rawValue) " + String(format: "%.1f ms", (CACurrentMediaTime() - t) * 1000)) }
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
