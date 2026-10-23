import SwiftUI
import MapKit

// 行程面板：蓋在首頁地圖下面（行程模式時），可以拉成三段高度
// 一半、全開：最上面一列是起點（目前位置／住宿）；每站一列（號碼、照片、名字、停留、時間），兩站之間一行交通；
// 長按拖曳換順序，拖到標題列下面露出的「第 N 天」就換天；清單捲到頂再往下拉＝面板降一段
// 最低：一排橫向站卡＋排順序／出發（地圖約占 65%）；長按站卡左右拖換順序
// 行程模式時分頁列藏起來（Store.barHidden），面板一路到底
// 點地圖上的收藏：面板換成「加站卡」，自動找最順的位置
struct TripPanel: View {
    let tid: String
    @Binding var pos: MapCameraPosition
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @Environment(\.openURL) private var openURL
    @State private var mode = TripMode.shared
    @State private var trips = TripStore.shared
    @State private var router = TripRouter.shared
    @State private var expanded: String?
    @State private var pull: CGFloat = 0
    @State private var drag = RowDrag()
    @State private var size: CGSize = .zero
    @State private var top0: CGFloat = 0            // 面板頂端在螢幕上的位置
    @State private var cardH: CGFloat = 224         // 加站卡量到的高度
    @State private var fitSeq = 0                   // 第幾次框地圖（停好後修正時，看是不是還是同一次）
    // 出發中：上面「下一站」卡片的下緣、下面那塊的上緣（螢幕座標），藍點要放在中間看得到的地方
    @State private var goTop: CGFloat = 0
    @State private var goBot: CGFloat = 0
    @State private var goSpan = 900.0 / 111_000     // 出發時鏡頭的緯度範圍（框鏡頭那塊），之後跟著走不再改
    @State private var cardPull: CGFloat = 0
    @State private var loving = false
    @State private var placed = false
    @State private var checked = false          // 行程找不到時，已經重新跟伺服器確認過
    // 拖曳手勢被系統取消時 onEnded 不會來（站卡那排會卡在拖到一半）：手勢一結束（含取消）就放下
    @GestureState private var holding = false
    @GestureState private var pulling = false   // 拉面板的手勢還在（被系統取消時把面板放回一段）
    @State private var lowering = false         // 清單捲到頂又往下拉過頭：放開就降一段
    @State private var listTouch = false        // 手指正在拉清單（甩過頭的回彈不算）
    // 出發
    @State private var me: CLLocation?          // 出發時的目前位置（只在 App 開著時更新）
    @State private var pinged: String?          // 已經為「快到了」震過的那站
    @State private var rate: String?            // 問「好吃嗎」的那站
    @State private var finished = false
    @State private var party = 0
    @State private var navAsk: TripStop?

    var body: some View {
        Group {
            if let t = trips.trip(tid) { content(t) } else { gone }
        }
        .task(id: tid) {
            await trips.load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                if Task.isCancelled { break }
                await trips.load()
            }
        }
        .onChange(of: phase) { _, p in if p == .active { Task { await trips.load() } } }
        // 打字時鍵盤不要把面板頂上去（面板本來就降到最低）
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    private var gone: some View {
        VStack(spacing: 10) {
            if trips.loaded && checked {
                Text("這個行程不見了").font(.headline).foregroundStyle(Color.ink)
                Text("可能被建立的人刪掉了").font(.subheadline).foregroundStyle(Color.ink.opacity(0.5))
                Button("回到地圖") {
                    if trips.lastOpened == tid { trips.lastOpened = nil }
                    mode.close()
                }
                .buttonStyle(ChunkyStyle(radius: 16))
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 24)
        .background(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28).fill(Color.bg).ignoresSafeArea(edges: .bottom))
        .frame(maxHeight: .infinity, alignment: .bottom)
        // 再跟伺服器確認一次（萬一是讀到舊資料）；真的不見才留著這個畫面
        .task { await trips.load(fresh: true); checked = true }
    }

    // ----- 版面 -----

    private func content(_ t: Trip) -> some View {
        let d = min(mode.day, t.days)
        let base = trips.stops(t.id, day: d)
        let order = drag.preview(base)
        let origin = TripMath.origin(order, here: store.here)
        let legs = TripMath.legs(t, order, origin: origin, router: router)
        let plan = TripCalc.plan(order, legs: legs.map { $0?.min }, backLeg: TripMath.backLeg(t, order, origin: origin, router: router))
        let next = order.first { $0.done_at == nil }
        let core = ZStack(alignment: .bottom) {
            Color.clear.allowsHitTesting(false)
            if mode.going {
                goBottom(order)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { goBot = $0 }
            } else if let c = mode.cand {
                addCard(t, c, order: order)
                    .id(c.id)
                    .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
            } else {
                panel(t, d: d, base: base, order: order, legs: legs, plan: plan)
                    .transition(.move(edge: .bottom))
            }
        }
        .overlay(alignment: .top) {
            if mode.going, let next {
                goCard(t, order: order, next: next, plan: plan).padding(.horizontal, 14).padding(.top, 6)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { goTop = $0 }
            } else if mode.searchOn && !mode.going {
                // 🔍 展開的搜尋框＋分類，下面是結果（正在看加站卡時先收起結果）
                VStack(spacing: 0) {
                    TripFind()
                    if mode.cand == nil {
                        TripResults().transition(.opacity.combined(with: .offset(y: -8)))
                    }
                }
                .transition(.opacity.combined(with: .offset(y: -8)))
            }
        }
        .animation(.snappy(duration: 0.22), value: mode.searchOn)
        .animation(.snappy(duration: 0.22), value: mode.searchOn && mode.cand == nil)
        return goMods(core, t, order: order, next: next)
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { top0 = $0 }
        // 地圖要畫的路線、號碼；上面標題列的「4 站・16:40 回」
        .onChange(of: pubKey(order, legs, origin: origin, plan: plan), initial: true) {
            mode.segs = TripMath.segs(order, origin: origin, legs: legs)
            mode.marks = TripMath.marks(order)
            mode.summary = TripMath.summary(order, plan: plan)
        }
        // 換天、加站、刪站：地圖 0.5 秒縮放到包住這天所有站
        .onChange(of: fitKey(d, base)) { fit(base, origin: origin, animated: true) }
        .onChange(of: mode.fitTick) {
            // 重新打開行程（店家頁「在行程裡」、訊息條）：不管之前拖到一半的狀態
            if !holding && drag.id != nil { drag = RowDrag(); mode.overDay = nil }
            fit(base, origin: origin, animated: true)
        }
        // 第一次量到大小（剛進行程模式）：0.5 秒縮放到這天的站（從店家頁進來的就飛到那站）
        .onChange(of: size) {
            // 大小變了（鍵盤收起來之類）：開著加站卡就重新框加站卡那段
            if placed, mode.cand != nil { placeCand(t, order); return }
            if placed { fit(base, origin: origin, animated: false); return }
            placed = true
            if mode.hot != nil { flyTo(mode.hot) } else { fit(base, origin: origin, animated: true) }
        }
        .onChange(of: mode.level) {
            guard mode.cand == nil else { return }
            // 展開著一站：地圖對準那站；不然框住這天的站
            if let e = expanded { flyTo(e) } else { fit(base, origin: origin, animated: true) }
        }
        .onChange(of: mode.fly) { flyTo(mode.hot) }
        .onChange(of: mode.day) { if mode.expand == nil { expanded = nil } }
        // 面板已經開著時又從店家頁「在行程裡」進來：展開那站
        .onChange(of: mode.expand) { _, e in
            guard let e else { return }
            mode.expand = nil
            Task { try? await Task.sleep(for: .milliseconds(30)); expandStop(e) }
        }
        // 正在看要不要加的店：算插在哪、地圖框住前後兩站和這間
        .onChange(of: candKey(order), initial: true) { placeCand(t, order) }
        .onChange(of: mode.sharing) { share(t) }
        .onChange(of: holding) { _, h in if !h && drag.id != nil { drop(t) } }
        // 拖一站時標題列下面露出「第 N 天」
        .onChange(of: drag.id != nil) { _, on in if mode.moving != on { mode.moving = on } }
        // 搜尋結果：地圖框住結果和這天的站
        .onChange(of: resultKey) { fit(base, origin: origin, animated: true) }
        .task(id: needKey(t, base, origin: origin)) { router.need(TripMath.needs(t, base, origin: origin)) }
        .onAppear {
            if let e = mode.expand { mode.expand = nil; expandStop(e) }
        }
    }

    private func pubKey(_ order: [TripStop], _ legs: [Leg?], origin: CLLocationCoordinate2D?, plan: DayPlan) -> String {
        let a = order.map { $0.id + ($0.done_at == nil ? "" : "✓") }.joined(separator: ",")
        let b = legs.map { l in "\(l?.min ?? -1)\(l?.line != nil ? "r" : "")" }.joined(separator: ",")
        return a + "|" + b + "|\(origin.map { "\($0.latitude),\($0.longitude)" } ?? "-")|\(plan.back ?? -1)|\(plan.rows.last?.leave ?? -1)"
    }

    // ----- 下面的面板 -----

    private func heights() -> (low: CGFloat, mid: CGFloat, high: CGFloat) {
        // 最低：把手 20＋站卡 74＋排順序／出發 56
        let h = max(size.height, 500)
        return (150, h * 0.5, h - 8)
    }

    private func settledHeight() -> CGFloat {
        let hs = heights()
        return mode.level == .low ? hs.low : mode.level == .mid ? hs.mid : hs.high
    }

    private func panelHeight() -> CGFloat {
        let hs = heights()
        let base: CGFloat = mode.level == .low ? hs.low : mode.level == .mid ? hs.mid : hs.high
        return min(hs.high + 30, max(hs.low - 30, base + pull))
    }

    private func panel(_ t: Trip, d: Int, base: [TripStop], order: [TripStop], legs: [Leg?], plan: DayPlan) -> some View {
        let strip = mode.level == .low && pull >= -20
        return VStack(spacing: 0) {
            head(t, base: base, d: d, strip: strip)
            if strip {
                cards(t, base: base, order: order, plan: plan)
                    .transition(.opacity)
            } else {
                ScrollViewReader { sp in
                    ScrollView {
                        rows(t, d: d, base: base, order: order, legs: legs, plan: plan)
                            .padding(.horizontal, 14).padding(.top, 2).padding(.bottom, 16)
                    }
                    .scrollDisabled(drag.id != nil)
                    // 捲到頂再往下拉約 56pt：放開時面板降一段（只在跨過那條線時通知，捲動時不會每幀重畫）
                    // 清單拉過頭有阻力，手指拉 56pt 畫面只動約 28pt，所以線畫在 28；甩過頭的回彈不算
                    .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top < -28 } action: { _, past in
                        guard past, listTouch, !lowering, drag.id == nil else { return }
                        lowering = true
                        Haptic.light()
                    }
                    .onScrollPhaseChange { _, ph in
                        listTouch = ph == .interacting
                        guard lowering, ph != .interacting else { return }
                        lowering = false
                        guard drag.id == nil else { return }
                        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) {
                            mode.level = mode.level == .high ? .mid : .low
                            pull = 0
                        }
                    }
                    .onChange(of: mode.scrollTo, initial: true) { _, id in
                        guard let id else { return }
                        mode.scrollTo = nil
                        Task { try? await Task.sleep(for: .seconds(0.35)); withAnimation(.snappy) { sp.scrollTo(id, anchor: .top) } }
                    }
                }
                .transition(.opacity)
            }
            // 這天還沒有站：不放「排順序／出發」，空白提示不會被蓋住
            if !base.isEmpty { actions(t, base: base) }
        }
        .frame(maxWidth: .infinity)
        .frame(height: panelHeight(), alignment: .top)
        .background(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28).fill(Color.bg)
            .shadow(color: .black.opacity(0.14), radius: 14, y: -2).ignoresSafeArea(edges: .bottom))
        .animation(.snappy(duration: 0.25), value: strip)
        // 停好的面板高度：訊息條貼在面板上面，不蓋住站卡（拉的過程中不更新）
        .onChange(of: settledHeight(), initial: true) { _, v in if abs(mode.panelH - v) > 0.5 { mode.panelH = v } }
    }

    // 面板最下面一排：✨ 幫我排順序、出發
    private func actions(_ t: Trip, base: [TripStop]) -> some View {
        let allDone = !base.isEmpty && base.allSatisfy { $0.done_at != nil }
        let canSort = base.filter(TripSort.movable).count >= 2
        return HStack(spacing: 8) {
            Button { sortDay(t, base) } label: {
                Text("✨ 排順序").font(.headline).lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity)
            }
            .buttonStyle(ChunkyStyle(color: .sprPurple, edge: Color.sprPurple.mix(with: .black, by: 0.25), radius: 18))
            .disabled(!canSort)
            .opacity(canSort ? 1 : 0.5)
            .accessibilityLabel("幫我排順序")
            Button { startGo(base, again: allDone) } label: {
                Label(allDone ? "重新出發" : "出發", systemImage: "location.north.fill").font(.headline).frame(maxWidth: .infinity)
            }
            .buttonStyle(ChunkyStyle(radius: 18))
            .disabled(base.isEmpty)
            .opacity(base.isEmpty ? 0.5 : 1)
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 4)
        .opacity(drag.id == nil ? 1 : 0)
        .animation(.snappy(duration: 0.2), value: drag.id == nil)
    }

    // 面板最上面：把手＋起點那列（一半、全開時），整塊都能拉；拖站卡換順序時不能拉
    private func head(_ t: Trip, base: [TripStop], d: Int, strip: Bool) -> some View {
        VStack(spacing: 0) {
            Capsule().fill(Color.ink.opacity(0.18)).frame(width: 40, height: 5)
                .frame(maxWidth: .infinity).frame(height: strip ? 20 : 16)
            if !strip {
                HStack(spacing: 0) {
                    startChip(t, d: d, base: base)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14).padding(.bottom, 4)
                .transition(.opacity)
            }
        }
        .contentShape(.rect)
        .gesture(sheetDrag, including: drag.id == nil ? .all : .subviews)
        .swipeBackBlocked()
        // 拉面板被系統取消（onEnded 不會來）：放回目前那段
        .onChange(of: pulling) { _, p in
            guard !p, pull != 0 else { return }
            withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { pull = 0 }
        }
    }

    // ----- 起點：目前位置或住宿 -----

    private func startChip(_ t: Trip, d: Int, base: [TripStop]) -> some View {
        let label: String
        if let first = base.first, first.kind == "stay" { label = "🏨 從" + first.name + "出發" }
        else if TripMath.origin(base, here: store.here) != nil { label = "🏠 從目前位置出發" }
        else { label = "📍 從第 1 站出發" }
        var names: Set<String> = []
        let stays = trips.stops(t.id).filter { $0.kind == "stay" && names.insert($0.name).inserted }
        return Menu {
            Button("🏠 從目前位置出發") { startHere(base) }
            ForEach(stays) { st in
                Button("🏨 " + st.name) { startAt(st, t, d: d, base: base) }
            }
            Button("🔍 搜尋飯店…") { mode.startSearch(.stay, slot: .first) }
        } label: {
            HStack(spacing: 4) {
                Text(label).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.4))
            }
            .font(.subheadline.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.75))
            .padding(.horizontal, 12).frame(height: 34)
            .background(Color.ink.opacity(0.06), in: .capsule)
            .frame(minHeight: 40).contentShape(.rect)
        }
        .accessibilityLabel("起點：" + label)
    }

    // 改從目前位置出發：第一站的住宿移到最後（晚上回飯店）
    private func startHere(_ base: [TripStop]) {
        Haptic.light()
        guard var f = base.first, f.kind == "stay", base.count > 1 else { return }
        f.pos = (base.last?.pos ?? 0) + 1
        withAnimation(.snappy) { trips.update(f, store: store) }
    }

    // 從某間住宿出發：這天有就移到最前面，沒有就複製一份放在最前面
    private func startAt(_ st: TripStop, _ t: Trip, d: Int, base: [TripStop]) {
        Haptic.light()
        let top = (base.first?.pos ?? 1) - 1
        if var x = base.first(where: { $0.id == st.id }) {
            guard base.first?.id != st.id else { return }
            x.pos = top
            withAnimation(.snappy) { trips.update(x, store: store) }
            return
        }
        let c = TripStop(id: UUID().uuidString.lowercased(), trip_id: t.id, day: d, pos: top, kind: "stay", place_id: nil, name: st.name,
                         address: st.address, lat: st.lat, lng: st.lng, poi: st.poi, stay_min: 0, mode: nil, fixed_time: nil, done_at: nil,
                         added_by: Supa.session?.user.id, created_at: nil, updated_at: nil)
        trips.insert(c, store: store)
    }

    // 拉面板：放開時停在最近的一段（甩得快就往甩的方向）
    // 用螢幕座標量：面板跟著手指動，用自己的座標量會抵銷掉，往下拉沒反應、甩的方向也會算反
    private var sheetDrag: some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .global)
            .updating($pulling) { _, st, _ in st = true }
            .onChanged { v in if drag.id == nil { pull = -v.translation.height } }
            .onEnded { v in
                guard drag.id == nil else { pull = 0; return }
                let hs = heights()
                let up = -v.predictedEndTranslation.height
                let now: CGFloat = (mode.level == .low ? hs.low : mode.level == .mid ? hs.mid : hs.high) + up * 0.6
                var pick: TripLevel = [(TripLevel.low, hs.low), (TripLevel.mid, hs.mid), (TripLevel.high, hs.high)].min { abs($0.1 - now) < abs($1.1 - now) }!.0
                // 段跟段距離很大（最高到中間三百多點）：往一個方向拉超過 60 就至少換一段，不會彈回原位像沒反應
                if pick == mode.level, abs(up) > 60 {
                    let all: [TripLevel] = [.low, .mid, .high]
                    let i = all.firstIndex(of: mode.level)! + (up > 0 ? 1 : -1)
                    if all.indices.contains(i) { pick = all[i] }
                }
                if pick != mode.level { Haptic.light() }
                withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { mode.level = pick; pull = 0 }
            }
    }

    // ----- 每一站（一半、全開） -----

    @ViewBuilder
    private func rows(_ t: Trip, d: Int, base: [TripStop], order: [TripStop], legs: [Leg?], plan: DayPlan) -> some View {
        if base.isEmpty {
            VStack(spacing: 8) {
                Text("🍩").font(.system(size: 40))
                Text("這天還沒有站").font(.headline).foregroundStyle(Color.ink)
                Text("點地圖上的收藏就能加進來，\n或在上面搜尋景點、飯店").font(.subheadline).foregroundStyle(Color.ink.opacity(0.5))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 24)
        }
        VStack(spacing: 0) {
            ForEach(Array(base.enumerated()), id: \.element.id) { k, s in
                let i = order.firstIndex { $0.id == s.id } ?? k
                block(t, s, k: k, i: i, prev: k > 0 ? base[k - 1] : nil, leg: k > 0 && i == k ? legs[i] : nil, row: i < plan.rows.count ? plan.rows[i] : nil)
            }
        }
    }

    private func block(_ t: Trip, _ s: TripStop, k: Int, i: Int, prev: TripStop?, leg: Leg?, row: DayPlan.Row?) -> some View {
        let dragging = drag.id == s.id
        return VStack(spacing: 0) {
            if let prev {
                LegRow(trip: t, from: prev, to: s, leg: leg, hidden: drag.id != nil) { m in
                    Haptic.light()
                    Perf.shared.mark("換交通方式")
                    var x = s; x.mode = m.rawValue == t.mode ? nil : m.rawValue
                    trips.update(x, store: store)
                } openMaps: { if let b = s.coord, let u = transitURL(prev.coord, b) { openURL(u) } }
                // 空檔推薦：下一站有固定時間、中間多出 1 小時以上
                if let row, row.wait >= 60, drag.id == nil {
                    gapHint(row.wait, count: gapCount(t, prev, s)) {
                        mode.startSearch(.route, slot: .between(prev.pos, s.pos), seg: [prev.id, s.id])
                    }
                }
            }
            // 展開時不能左滑刪（不然拉停留滑桿會被當成左滑）
            SwipeToDelete(enabled: drag.id == nil && expanded != s.id) {
                if expanded == s.id { expanded = nil }
                trips.deleteWithUndo(s, store: store)
            } content: {
                StopCard(stop: s, n: i + 1, row: row, open: expanded == s.id, me: store.me, hot: mode.hot == s.id, tap: {
                    // 第一下：地圖飛到這站；同一站再點一下才展開
                    if mode.hot == s.id {
                        Haptic.light()
                        if expanded == s.id { withAnimation(.snappy) { expanded = nil } } else { expandStop(s.id) }
                    } else {
                        mode.tap(s.id)
                        if expanded != nil { withAnimation(.snappy) { expanded = nil } }
                    }
                }, hold: AnyGesture(reorder(t, s, k: k).map { _ in () }))
            }
        }
        .id(s.id)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { if drag.id == nil { mode.geo.rows[s.id] = $0 } }
        .offset(y: dragging ? drag.dy : drag.shift(k))
        .scaleEffect(dragging ? 1.03 : 1)
        .shadow(color: .black.opacity(dragging ? 0.18 : 0), radius: 12, y: 6)
        .zIndex(dragging ? 10 : 0)
        .animation(dragging ? nil : .snappy(duration: 0.25), value: drag.shift(k))
        .transition(.asymmetric(insertion: .scale(scale: 0.9).combined(with: .opacity), removal: .opacity))
    }

    // 展開一站的編輯（停留多久、固定時間…）：面板拉到最高、捲到那站，整個編輯區都看得到，不被下面的按鈕蓋住
    private func expandStop(_ id: String) {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) {
            expanded = id
            if mode.level != .high { mode.level = .high }
        }
        mode.scrollTo = id
    }

    // 長按 0.35 秒拿起來，拖到別的位置放開；拖到上面的「第 N 天」放開就換天
    private func reorder(_ t: Trip, _ s: TripStop, k: Int) -> some Gesture {
        LongPressGesture(minimumDuration: 0.35)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
            .updating($holding) { _, st, _ in st = true }
            .onChanged { v in
                guard case .second(true, let g) = v else { return }
                if drag.id == nil { begin(s, k: k, size: mode.geo.rows[s.id]?.height ?? 80) }
                guard let g else { return }
                drag.dy = g.translation.height
                drag.retarget(mode.geo, base: trips.stops(t.id, day: min(mode.day, t.days)))
                overDay(g.location)
            }
            .onEnded { _ in drop(t) }
    }

    private func overDay(_ p: CGPoint) {
        let over = mode.geo.chips.first { $0.value.contains(p) }?.key
        if over != drag.overDay {
            drag.overDay = over
            mode.overDay = over
            if over != nil { Haptic.tick() }
        }
    }

    private func begin(_ s: TripStop, k: Int, size h: CGFloat) {
        Haptic.medium()
        Perf.shared.mark("拿起一站")
        // 「第 N 天」的位置等標題列下面那排出來再量（舊的可能是別的天數）
        mode.geo.chips = [:]
        withAnimation(.snappy(duration: 0.2)) { drag = RowDrag(id: s.id, from: k, to: k, h: h) }
    }

    private func drop(_ t: Trip) {
        mode.overDay = nil
        guard let id = drag.id, var s = trips.stops.first(where: { $0.id == id }) else { drag = RowDrag(); return }
        let d = min(mode.day, t.days)
        if let nd = drag.overDay, nd != d {
            s.day = nd; s.pos = trips.nextPos(t.id, nd)
            Haptic.success()
            withAnimation(.snappy) { trips.update(s, store: store); drag = RowDrag() }
            store.say("移到第 \(nd) 天", icon: .check)
            return
        }
        let base = trips.stops(t.id, day: d)
        let order = drag.preview(base)
        if drag.to != drag.from, let i = order.firstIndex(where: { $0.id == id }) {
            let before = i > 0 ? order[i - 1].pos : nil
            let after = i + 1 < order.count ? order[i + 1].pos : nil
            switch (before, after) {
            case let (b?, a?): s.pos = (b + a) / 2
            case let (b?, nil): s.pos = b + 1
            case let (nil, a?): s.pos = a - 1
            default: break
            }
        }
        Haptic.light()
        withAnimation(.snappy(duration: 0.28)) { trips.update(s, store: store); drag = RowDrag() }
    }

    // ----- 最低：一排橫向站卡 -----

    private func cards(_ t: Trip, base: [TripStop], order: [TripStop], plan: DayPlan) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if base.isEmpty {
                    Text("點地圖上的收藏就能加進來").font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                        .frame(height: 70).padding(.horizontal, 6)
                }
                ForEach(Array(base.enumerated()), id: \.element.id) { k, s in
                    let i = order.firstIndex { $0.id == s.id } ?? k
                    let dragging = drag.id == s.id
                    MiniStop(stop: s, n: i + 1, row: i < plan.rows.count ? plan.rows[i] : nil, hot: mode.hot == s.id)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { if drag.id == nil { mode.geo.cards[s.id] = $0 } }
                        .contentShape(.rect)
                        .onTapGesture { mode.tap(s.id) }
                        .gesture(reorderX(t, s, k: k))
                        .offset(x: dragging ? drag.dy : drag.shift(k))
                        .scaleEffect(dragging ? 1.06 : 1)
                        .shadow(color: .black.opacity(dragging ? 0.2 : 0), radius: 10, y: 5)
                        .zIndex(dragging ? 10 : 0)
                        .animation(dragging ? nil : .snappy(duration: 0.25), value: drag.shift(k))
                        .transition(.scale(scale: 0.8).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 4)
        }
        .scrollDisabled(drag.id != nil)
        .swipeBackBlocked()
        .frame(height: 74)
    }

    // 站卡長按拿起來左右拖：地圖上的號碼和路線跟著換
    private func reorderX(_ t: Trip, _ s: TripStop, k: Int) -> some Gesture {
        LongPressGesture(minimumDuration: 0.35)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
            .updating($holding) { _, st, _ in st = true }
            .onChanged { v in
                guard case .second(true, let g) = v else { return }
                if drag.id == nil { begin(s, k: k, size: (mode.geo.cards[s.id]?.width ?? 150) + 8) }
                guard let g else { return }
                drag.dy = g.translation.width
                drag.retargetX(mode.geo, base: trips.stops(t.id, day: min(mode.day, t.days)))
                overDay(g.location)
            }
            .onEnded { _ in drop(t) }
    }

    // ----- 加站卡：點了地圖上的收藏、或搜尋結果 -----

    private func candAt(_ order: [TripStop], _ c: TripCand) -> (at: Int, extra: Double) {
        guard let co = c.coord else { return (order.count, 0) }
        if let s = mode.slot {
            let i = TripInsert.at(order, slot: s)
            return (i, TripInsert.extra(order, co, at: i))
        }
        return TripInsert.best(order, co)
    }

    private func candKey(_ order: [TripStop]) -> String {
        (mode.cand?.id ?? "") + "|" + order.map(\.id).joined(separator: ",")
    }

    // 地圖上畫「前一站 → 這間 → 後一站」的虛線，框住這三個點
    private func placeCand(_ t: Trip, _ order: [TripStop]) {
        guard let c = mode.cand, let co = c.coord, stopOf(c, t) == nil else {
            if mode.preview != nil { mode.preview = nil; mode.previewN = nil }
            return
        }
        let r = candAt(order, c)
        var line: [CLLocationCoordinate2D] = []
        if r.at > 0, let a = order[r.at - 1].coord { line.append(a) }
        line.append(co)
        if r.at < order.count, let b = order[r.at].coord { line.append(b) }
        mode.preview = line.count > 1 ? TripSeg(id: "cand", coords: line, color: TripColor.of(r.at), routed: false) : nil
        mode.previewN = r.at + 1
        fitCoords(line, card: true, animated: true)
    }

    // 這間已經在這個行程裡：哪一站
    private func stopOf(_ c: TripCand, _ t: Trip) -> TripStop? {
        guard let p = c.place else { return nil }
        return trips.stops(t.id).first { $0.place_id == p.id }
    }

    private func addCard(_ t: Trip, _ c: TripCand, order: [TripStop]) -> some View {
        let r = candAt(order, c)
        let tm = TravelMode(rawValue: t.mode) ?? .walk
        let inTrip = stopOf(c, t)
        let n = r.at + 1
        return VStack(alignment: .leading, spacing: 12) {
            Capsule().fill(Color.ink.opacity(0.15)).frame(width: 38, height: 5).frame(maxWidth: .infinity)
            HStack(alignment: .top, spacing: 12) {
                Group {
                    if let p = c.place {
                        PhotoView(place: p, px: 300)
                    } else if let h = c.hit {
                        Image(systemName: POI.icon(h.poi, kind: h.stay ? "stay" : "spot")).font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(h.food ? Color.accent : TripColor.side)
                    }
                }
                .frame(width: 72, height: 72).clipShape(.rect(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 4) {
                    Text(c.name).font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(2)
                    Text(candMeta(c)).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                    if let s = inTrip {
                        Text(s.day == min(mode.day, t.days) ? "已經在第 \(order.firstIndex { $0.id == s.id }.map { $0 + 1 } ?? 0) 站" : "已經在第 \(s.day) 天")
                            .font(.subheadline.weight(.heavy)).foregroundStyle(Color.sprMint)
                    } else {
                        Text(where_(order, r.at, extra: r.extra, mode: tm)).font(.subheadline.weight(.heavy)).foregroundStyle(Color.accentDeep)
                            .contentTransition(.numericText())
                    }
                }
                Spacer(minLength: 0)
                Button { cancelCand() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink)
                        .frame(width: 32, height: 32).background(Color.ink.opacity(0.07), in: .circle)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel("不加")
            }
            if let s = inTrip {
                HStack(spacing: 10) {
                    Button {
                        Haptic.light()
                        mode.cand = nil
                        mode.day = s.day
                        mode.tap(s.id)
                    } label: { Text("看這站").frame(maxWidth: .infinity) }
                        .buttonStyle(ChunkyStyle(color: .panel, edge: .cardShadow, fg: .ink, radius: 16))
                    Button {
                        Haptic.light()
                        withAnimation(.snappy) { mode.cand = nil }
                        trips.deleteWithUndo(s, store: store)
                    } label: { Text("從行程拿掉").frame(maxWidth: .infinity) }
                        .buttonStyle(ChunkyStyle(color: .sprPink, edge: Color.sprPink.mix(with: .black, by: 0.2), radius: 16))
                }
            } else {
                Button { add(t, c, order: order, at: r.at) } label: {
                    Label("加進行程（第 \(n) 站）", systemImage: "plus").font(.headline).frame(maxWidth: .infinity)
                }
                .buttonStyle(ChunkyStyle(radius: 18))
                HStack(spacing: 8) {
                    if r.at != order.count && !order.isEmpty {
                        smallButton("加到最後", icon: "arrow.down.to.line") { add(t, c, order: order, at: order.count) }
                    }
                    if let p = c.place {
                        NavigationLink(value: p) {
                            smallLabel("看店家", icon: "fork.knife")
                        }
                        .buttonStyle(PressStyle())
                    } else if let h = c.hit, h.food {
                        smallButton(loving ? "收藏中…" : "♥ 收藏", icon: nil) { love(h) }
                            .disabled(loving)
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
        .background(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28).fill(Color.bg)
            .shadow(color: .black.opacity(0.14), radius: 14, y: -2).ignoresSafeArea(edges: .bottom))
        // 卡片實際多高（店名兩行、有營業時間時會比較高）：框地圖時讓開，量到不一樣就重框一次
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in
            guard abs(h - cardH) > 8 else { return }
            cardH = h
            placeCand(t, order)
        }
        .offset(y: cardPull)
        .gesture(DragGesture(minimumDistance: 8, coordinateSpace: .global)
            .onChanged { v in cardPull = max(0, v.translation.height) }
            .onEnded { v in
                if cardPull > 80 || v.predictedEndTranslation.height > 200 { cancelCand() }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { cardPull = 0 }
            })
    }

    private func smallLabel(_ text: String, icon: String?) -> some View {
        HStack(spacing: 5) {
            if let icon { Image(systemName: icon).font(.system(size: 12, weight: .heavy)) }
            Text(text).font(.subheadline.weight(.heavy))
        }
        .foregroundStyle(Color.ink.opacity(0.75))
        .frame(maxWidth: .infinity).frame(height: 40)
        .background(Color.ink.opacity(0.06), in: .rect(cornerRadius: 12))
        .frame(minHeight: 44).contentShape(.rect)
    }

    private func smallButton(_ text: String, icon: String?, run: @escaping () -> Void) -> some View {
        Button { Haptic.light(); run() } label: { smallLabel(text, icon: icon) }.buttonStyle(PressStyle())
    }

    private func candMeta(_ c: TripCand) -> String {
        if let p = c.place {
            var s = [p.been ? "✓ 去過" : "♥ 想去", "\(p.cat.emoji) \(p.cuisine?.isEmpty == false ? p.cuisine! : p.cat.name)"]
            if !p.area.isEmpty { s.append(p.area) }
            return s.joined(separator: " · ")
        }
        guard let h = c.hit else { return "" }
        return [POI.name(h.poi), h.address].compactMap { $0 }.joined(separator: " · ")
    }

    // 「插在第 2、3 站中間，只多走 4 分」；離很遠（搜到別的城市）就講多遠，不講幾千分
    private func where_(_ order: [TripStop], _ at: Int, extra: Double, mode m: TravelMode) -> String {
        if order.isEmpty { return "這天的第 1 站" }
        let spot = at >= order.count ? "加在最後" : at == 0 ? "加在最前面" : "插在第 \(at)、\(at + 1) 站中間"
        if extra > 15_000 { return "\(spot)，要多繞約 \(Int((extra / 1000).rounded())) 公里" }
        let more = "\(m.verb) \(TripDate.span(TripInsert.minutes(extra, m)))"
        return at > 0 && at < order.count ? "\(spot)，只多\(more)" : "\(spot)，多\(more)"
    }

    private func cancelCand() {
        Haptic.light()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { mode.cand = nil }
    }

    private func add(_ t: Trip, _ c: TripCand, order: [TripStop], at i: Int) {
        let d = min(mode.day, t.days)
        var s: TripStop
        if let p = c.place { s = trips.makeStop(t.id, day: d, place: p) }
        else if let h = c.hit { s = trips.makeStop(t.id, day: d, hit: h) }
        else { return }
        s.pos = TripInsert.pos(order, at: i)
        Haptic.success()
        Perf.shared.mark("加站")
        trips.insert(s, store: store)
        store.say("加到第 \(i + 1) 站", icon: .check, action: ("復原", {
            TripStore.shared.remove(s, dropTrip: false, store: store)
            store.toast = nil
        }))
        // 空檔推薦只加一間：用完就收起搜尋
        if mode.slot != nil { mode.clearSearch() }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            mode.cand = nil
            mode.hot = s.id
            if mode.level == .low && !mode.searchOn { mode.level = .mid }
        }
        mode.scrollTo = s.id
    }

    // 搜到的餐廳存進收藏：存好後這張卡換成收藏的店（再按加進行程）
    private func love(_ h: MapHit) {
        guard !loving else { return }
        Haptic.success()
        loving = true
        var p = Place(id: UUID().uuidString.lowercased(), name: h.name)
        p.address = h.address; p.city = h.city; p.district = h.district
        p.lat = h.coord.latitude; p.lng = h.coord.longitude
        p.category = h.category; p.status = "want"
        Task { [p] in
            if let np = await store.create(p), mode.cand?.hit?.id == h.id {
                withAnimation(.snappy) { mode.cand = TripCand(place: np) }
            }
            loving = false
        }
    }

    // ----- 地圖 -----

    private func fitKey(_ d: Int, _ base: [TripStop]) -> String { "\(d)|" + base.map(\.id).joined(separator: ",") }

    private var resultKey: String {
        guard mode.searchOn else { return "" }
        return mode.search.found.map(\.id).joined(separator: ",") + "|" + mode.search.hits.map(\.id).joined(separator: ",")
    }

    private func needKey(_ t: Trip, _ base: [TripStop], origin: CLLocationCoordinate2D?) -> String {
        TripMath.needs(t, base, origin: origin).map { TripRouter.key($0.0, $0.1, $0.2) }.joined(separator: ";")
    }

    // 把這天所有站框進「面板上面」那塊看得到的地圖
    private func fit(_ base: [TripStop], origin: CLLocationCoordinate2D?, animated: Bool) {
        guard mode.cand == nil, !mode.going else { return }
        if mode.searchOn {
            // 收藏可能遍布全台：只框路線 15 公里內的（都太遠就框最近的 3 間），地圖才不會一下拉到全台灣
            var ps = mode.search.found.filter { (mode.search.meters($0) ?? 0) <= 15_000 }
            if ps.isEmpty { ps = Array(mode.search.found.prefix(3)) }
            let found = ps.compactMap { p in p.lat.flatMap { la in p.lng.map { CLLocationCoordinate2D(latitude: la, longitude: $0) } } }
            let hits = mode.search.mapHits(mode.search.found).map(\.coord)
            guard !(found + hits).isEmpty else { return }
            // 長路線（雲林到台北）：全部框進來會縮到看見對岸。超過 40 公里就不框這天的站；
            // 結果本身也拉得很長，就只框現在看得到的那些（都不在畫面裡就框離畫面中心最近的 5 個）
            var res = found + hits
            let top = TripResults.height(mode) + 8
            let withStops = res + base.compactMap(\.coord)
            if Self.km(withStops) <= 40 { fitCoords(withStops, card: false, animated: animated, top: top); return }
            // 打字搜（台北101）：框排第一的那個和它 40 公里內的結果（其他同名的可能遠在對岸）
            if !mode.q.trimmingCharacters(in: .whitespaces).isEmpty, let a = (found.first ?? hits.first) {
                let ca = CLLocation(latitude: a.latitude, longitude: a.longitude)
                res = res.filter { ca.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude)) <= 40_000 }
                fitCoords(res, card: false, animated: animated, minSpan: 0.02, top: top)
                return
            }
            if Self.km(res) <= 40 { fitCoords(res, card: false, animated: animated, top: top); return }
            guard let r = store.mapRegion else { return }
            let inView = res.filter { abs($0.latitude - r.center.latitude) < r.span.latitudeDelta / 2 && abs($0.longitude - r.center.longitude) < r.span.longitudeDelta / 2 }
            let c = CLLocation(latitude: r.center.latitude, longitude: r.center.longitude)
            let pick = inView.isEmpty ? Array(res.sorted { c.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude)) < c.distance(from: CLLocation(latitude: $1.latitude, longitude: $1.longitude)) }.prefix(5)) : inView
            fitCoords(pick, card: false, animated: animated, minSpan: 0.02, top: top)
            return
        }
        var cs = base.compactMap(\.coord)
        if cs.isEmpty, let o = origin { cs = [o] }
        // 這天沒有站：回到目前位置；沒有定位就看整個台灣
        if cs.isEmpty, let h = store.here { cs = [h.coordinate] }
        if cs.isEmpty {
            let r = MKCoordinateRegion(center: .init(latitude: 23.7, longitude: 121.0), span: .init(latitudeDelta: 4.2, longitudeDelta: 3.2))
            if animated { withAnimation(.easeInOut(duration: 0.5)) { pos = .region(r) } } else { pos = .region(r) }
            return
        }
        fitCoords(cs, card: false, animated: animated)
    }

    // 這些點的範圍（南北、東西取大的，公里）
    private static func km(_ cs: [CLLocationCoordinate2D]) -> Double {
        guard let f = cs.first else { return 0 }
        let lats = cs.map(\.latitude), lngs = cs.map(\.longitude)
        return max((lats.max()! - lats.min()!) * 111, (lngs.max()! - lngs.min()!) * 111 * cos(f.latitude * .pi / 180))
    }

    private func fitCoords(_ cs: [CLLocationCoordinate2D], card: Bool, animated: Bool, minSpan: Double = 0.004, top: CGFloat = 12) {
        guard !cs.isEmpty, size.height > 0 else { return }
        let lats = cs.map(\.latitude), lngs = cs.map(\.longitude)
        let latR = max(minSpan, lats.max()! - lats.min()!)
        let lngR = max(minSpan, lngs.max()! - lngs.min()!)
        // 加站卡約 224 高；上面展開著搜尋框時也要避開；上緣不高過膠囊、🔍 那排
        let cover: CGFloat = card ? cardH : panelHeight()
        let pad = top + (mode.searchOn ? TripFind.height : 0)
        let winTop = max(top0, mode.barBottom) + pad
        let window = max(120, top0 + size.height - cover - winTop)
        // 圖釘畫在座標上面：最北那點上面要留圖釘的高度（加站卡還有「新的第 N 站」牌子）；
        // 號碼圓圈畫在座標正中間，最南那站下面也要留半顆再多一點
        let head: CGFloat = card ? 100 : 64
        let band = max(60, window - head - 36)
        let k = Double(band) / latR                                 // 每一度緯度幾點
        // 地圖框鏡頭的那塊（螢幕座標）；還沒量到就當成面板這塊
        let ft = Double(mode.mapBottom > mode.mapTop ? mode.mapTop : top0)
        let fb = Double(mode.mapBottom > mode.mapTop ? mode.mapBottom : top0 + size.height)
        let full = (fb - ft) / k                                    // 那塊的緯度範圍
        let mid = (lats.max()! + lats.min()!) / 2
        let winCenter = Double(winTop + head + band / 2)            // 座標要落在的那條帶子的中心（螢幕座標）
        let center = mid + (winCenter - (ft + fb) / 2) / k
        let r = MKCoordinateRegion(center: .init(latitude: center, longitude: (lngs.max()! + lngs.min()!) / 2),
                                   span: .init(latitudeDelta: full, longitudeDelta: lngR * 1.4))
        if animated { withAnimation(.easeInOut(duration: 0.5)) { pos = .region(r) } } else { pos = .region(r) }
        // 地圖停好後量一次：實際放得比算的大（點地圖圖釘那條路曾經大了 1.37 倍，圖釘跑到 🔍 底下）或偏了，就修正一次
        fitSeq += 1
        let seq = fitSeq
        Task {
            try? await Task.sleep(for: .milliseconds(animated ? 650 : 120))
            guard seq == fitSeq, !pos.positionedByUser, let f = mode.toScreen else { return }
            let hi = mid + latR / 2, lo = mid - latR / 2
            let lng = r.center.longitude
            guard let yHi = f(.init(latitude: hi, longitude: lng))?.y, let yLo = f(.init(latitude: lo, longitude: lng))?.y,
                  let yC = f(r.center)?.y, yLo > yHi else { return }
            let kAct = Double(yLo - yHi) / latR
            let rho = kAct / k
            let yMid = Double(yHi + yLo) / 2
            guard abs(rho - 1) > 0.04 || abs(yMid - winCenter) > 6 else { return }
            // 放太大才縮；放太小（東西向比較寬）不動縮放，只移中心
            let z = max(1, rho)
            let k2 = kAct / z
            let c2 = mid + (winCenter - Double(yC)) / k2
            let r2 = MKCoordinateRegion(center: .init(latitude: c2, longitude: lng),
                                        span: .init(latitudeDelta: r.span.latitudeDelta * z, longitudeDelta: r.span.longitudeDelta * z))
            withAnimation(.snappy(duration: 0.3)) { pos = .region(r2) }
        }
    }

    // 清單或地圖上點一站：地圖飛過去（放大到看得清楚附近）
    private func flyTo(_ id: String?) {
        guard let id, let c = trips.stops.first(where: { $0.id == id })?.coord else { return }
        fitCoords([c], card: false, animated: true, minSpan: 0.008)
    }

    // ----- 幫我排順序 -----

    private func sortDay(_ t: Trip, _ base: [TripStop]) {
        Haptic.light()
        Perf.shared.mark("幫我排順序")
        let n = base.filter(TripSort.movable).count
        if n > TripSort.maxStops { store.say("超過 \(TripSort.maxStops) 站，先移一些到別天再排"); return }
        let tm = TravelMode(rawValue: t.mode) ?? .walk
        guard let r = TripSort.best(base, origin: TripMath.origin(base, here: store.here), mode: tm), r.saved >= 3 else {
            store.say("已經很順了", icon: .check)
            return
        }
        let old = base
        expanded = nil
        trips.reorder(r.order, store: store)
        Haptic.success()
        store.say("省下 \(r.saved) 分", icon: .check, action: ("復原", {
            TripStore.shared.reorder(old, store: store)
            store.toast = nil
        }))
    }

    // ----- 空檔推薦 -----

    // 這段路 400 公尺內、還沒去過、不在這個行程裡的收藏有幾間
    private func gapCount(_ t: Trip, _ a: TripStop, _ b: TripStop) -> Int {
        guard let ca = a.coord, let cb = b.coord else { return 0 }
        let line = router.leg(ca, cb, TripMath.mode(t, b)).coords ?? [ca, cb]
        let near = RouteNear([line])
        let inTrip = Set(trips.stops(t.id).compactMap(\.place_id))
        return store.places.filter { p in
            guard p.status != "been", !inTrip.contains(p.id), let la = p.lat, let ln = p.lng else { return false }
            return near.meters(CLLocationCoordinate2D(latitude: la, longitude: ln)) <= 400
        }.count
    }

    private func gapHint(_ wait: Int, count: Int, open: @escaping () -> Void) -> some View {
        Button(action: open) {
            HStack(spacing: 8) {
                Color.clear.frame(width: 30, height: 1)
                Text(count > 0 ? "空出 \(TripDate.span(wait))，附近有 \(count) 間你想去的" : "空出 \(TripDate.span(wait))，順路找點吃的？")
                    .font(.footnote.weight(.heavy)).foregroundStyle(Color.accentDeep).lineLimit(2)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption.weight(.heavy)).foregroundStyle(Color.accentDeep.opacity(0.6))
            }
            .padding(.horizontal, 12).padding(.vertical, 8).frame(minHeight: 44)
            .background(Color.accent.opacity(0.1), in: .rect(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.accent.opacity(0.4), style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])))
        }
        .buttonStyle(PressStyle())
        .padding(.vertical, 2)
    }
    // ----- 出發 -----

    // 出發時的全畫面：全部到完的卡片、定位、路線、快到了輕震、選導航 App
    private func goMods<V: View>(_ v: V, _ t: Trip, order: [TripStop], next: TripStop?) -> some View {
        let eaten = order.filter { $0.isPlace && $0.done_at != nil }.count
        let near = nearNext(next)
        let ask = Binding(get: { navAsk != nil }, set: { if !$0 { navAsk = nil } })
        return v
            .overlay {
                if finished {
                    ZStack {
                        Color.black.opacity(0.25).ignoresSafeArea().onTapGesture { endGo() }
                        // 最後一間好不好吃，直接在這張卡上問（不另外疊一張評分卡在後面）
                        let last = rate.flatMap { id in order.first { $0.id == id } }.flatMap { $0.place_id }.flatMap { store.place($0) }
                        DoneCard(eaten: eaten, shot: party, last: last) { n in
                            if let id = rate, let last { rated(id, last, n) }
                        } close: {
                            if let id = rate { TripAsked.add(id) }
                            endGo()
                        }
                    }
                    .transition(.opacity)
                }
            }
            .task(id: mode.going) { await follow() }
            .task(id: goKey(t, next)) { if let k = goNeed(t, order, next) { router.need([k]) } }
            .onChange(of: near) { _, on in
                guard on, let next, pinged != next.id else { return }
                pinged = next.id
                Haptic.success()
            }
            .confirmationDialog("用哪個地圖導航？", isPresented: ask, titleVisibility: .visible, presenting: navAsk) { s in
                ForEach(NavApp.allCases, id: \.self) { a in
                    Button(a.name) { NavApp.saved = a; openNav(t, s, a) }
                }
            }
    }

    private func startGo(_ base: [TripStop], again: Bool) {
        Haptic.medium()
        Perf.shared.mark("出發")
        // 全部到過了：清掉「到了」重新走一次
        if again {
            for s in base { var x = s; x.done_at = nil; trips.update(x, store: store) }
        }
        expanded = nil
        pinged = nil
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { mode.going = true; mode.cand = nil }
        mode.clearSearch()
        if let h = here {
            // 拉近到街道（已經比這更近就不動縮放）
            goSpan = min(900.0 / 111_000, store.mapRegion?.span.latitudeDelta ?? 1)
            // 卡片還沒量到：等它出來再移
            Task {
                try? await Task.sleep(for: .seconds(0.05))
                withAnimation(.easeInOut(duration: 0.6)) { pos = .region(goRegion(h.coordinate)) }
            }
        } else {
            withAnimation(.easeInOut(duration: 0.6)) { pos = .userLocation(fallback: pos) }
        }
    }

    private func endGo() {
        Haptic.light()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { mode.going = false; finished = false; rate = nil }
        Task { try? await Task.sleep(for: .seconds(0.05)); mode.fitTick += 1 }
    }

    // 出發時才開定位（App 在前景時更新；不用背景定位）
    // 地圖不一直跟著你動畫（那樣整張地圖每幀重畫，走路時手機會燙）：走出 40 公尺才移一次；自己拖過地圖就不搶回來
    private func follow() async {
        guard mode.going else { return }
        var centered = here          // 出發時已經移到這裡
        do {
            for try await u in CLLocationUpdate.liveUpdates() {
                if Task.isCancelled || !mode.going { break }
                guard let l = u.location else { continue }
                // 走 10 公尺以上才更新（每次更新面板都要重算）
                if me.map({ $0.distance(from: l) >= 10 }) ?? true { me = l }
                guard !pos.positionedByUser, centered.map({ $0.distance(from: l) >= 40 }) ?? true else { continue }
                centered = l
                withAnimation(.easeInOut(duration: 0.6)) { pos = .region(goRegion(l.coordinate)) }
            }
        } catch {}
    }

    // 出發中的鏡頭：你的位置放在「下一站」卡片和下面那塊中間；緯度決定縮放（經度範圍給小一點）
    private func goRegion(_ c: CLLocationCoordinate2D) -> MKCoordinateRegion {
        let span = MKCoordinateSpan(latitudeDelta: goSpan, longitudeDelta: goSpan * 0.3)
        let ft = Double(mode.mapBottom > mode.mapTop ? mode.mapTop : top0)
        let fb = Double(mode.mapBottom > mode.mapTop ? mode.mapBottom : top0 + size.height)
        guard goBot > goTop, fb > ft else { return MKCoordinateRegion(center: c, span: span) }
        let k = (fb - ft) / goSpan                                   // 每一度緯度幾點
        let y = Double(goTop + goBot) / 2
        let lat = c.latitude + (y - (ft + fb) / 2) / k
        return MKCoordinateRegion(center: .init(latitude: lat, longitude: c.longitude), span: span)
    }

    private var here: CLLocation? { me ?? store.here }

    // 目前位置四捨五入到約 100 公尺，免得一直重算路線
    private func hereRounded() -> CLLocationCoordinate2D? {
        guard let h = here?.coordinate else { return nil }
        return CLLocationCoordinate2D(latitude: (h.latitude * 1000).rounded() / 1000, longitude: (h.longitude * 1000).rounded() / 1000)
    }

    private func goMode(_ t: Trip, _ order: [TripStop], _ s: TripStop) -> TravelMode {
        order.first?.id == s.id ? (TravelMode(rawValue: t.mode) ?? .walk) : TripMath.mode(t, s)
    }

    private func goNeed(_ t: Trip, _ order: [TripStop], _ next: TripStop?) -> (CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)? {
        guard mode.going, let next, let b = next.coord, let a = hereRounded() else { return nil }
        return (a, b, goMode(t, order, next))
    }

    private func goKey(_ t: Trip, _ next: TripStop?) -> String {
        guard mode.going, let next, let a = hereRounded(), let b = next.coord else { return "" }
        return TripRouter.key(a, b, TravelMode(rawValue: next.mode ?? t.mode) ?? .walk)
    }

    private func nearNext(_ next: TripStop?) -> Bool {
        guard mode.going, let c = next?.coord, let h = here else { return false }
        return h.distance(from: CLLocation(latitude: c.latitude, longitude: c.longitude)) < 80
    }

    private func goCard(_ t: Trip, order: [TripStop], next: TripStop, plan: DayPlan) -> some View {
        let i = order.firstIndex { $0.id == next.id } ?? 0
        let m = goMode(t, order, next)
        return GoCard(stop: next, n: i + 1, total: order.count, dots: order.map { $0.done_at != nil },
                      line: goLine(t, m: m, next: next, row: i < plan.rows.count ? plan.rows[i] : nil),
                      near: nearNext(next),
                      nav: { goNav(t, order, next) },
                      arrived: { arrive(t, order, next) },
                      close: { endGo() })
            .id(next.id)
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading).combined(with: .opacity)))
    }

    // 🚶 走路 6 分・13:10 到・比預定早 4 分
    private func goLine(_ t: Trip, m: TravelMode, next: TripStop, row: DayPlan.Row?) -> String {
        guard let a = hereRounded(), let b = next.coord else { return "\(m.emoji) \(m.verb)" }
        let leg = router.leg(a, b, m)
        let c = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let eta = (c.hour ?? 0) * 60 + (c.minute ?? 0) + leg.min
        var p = ["\(m.emoji) \(m.verb) \(leg.approx ? "約 " : "")\(TripDate.span(leg.min))", "\(TripDate.clock(eta)) 到"]
        // 排的是今天（或沒排日期）才比較跟預定差多少
        let today = t.start.map { s in (0..<t.days).contains { Calendar.current.isDate(TripDate.add(s, $0), inSameDayAs: Date()) } } ?? true
        // 差超過一小時（例如計畫 10:00 開始、現在才出發）就不顯示，免得一直跳「晚 173 分」
        if today, let row, abs(row.arrive - eta) <= 60 {
            let diff = row.arrive - eta
            p.append(abs(diff) < 2 ? "準時" : diff > 0 ? "比預定早 \(diff) 分" : "比預定晚 \(-diff) 分")
        }
        return p.joined(separator: "・")
    }

    private func goNav(_ t: Trip, _ order: [TripStop], _ next: TripStop) {
        Haptic.light()
        askAbout(before: next, order)
        if let a = NavApp.saved { openNav(t, next, a) } else { navAsk = next }
    }

    private func openNav(_ t: Trip, _ s: TripStop, _ app: NavApp) {
        guard let c = s.coord else { return }
        let order = trips.stops(t.id, day: s.day)
        if let u = tripNavURL(c, name: s.name, mode: goMode(t, order, s), app: app) { openURL(u) }
    }

    private func arrive(_ t: Trip, _ order: [TripStop], _ s: TripStop) {
        Haptic.success()
        Perf.shared.mark("到了")
        var x = s; x.done_at = ISO8601DateFormatter().string(from: Date())
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { trips.update(x, store: store) }
        askAbout(before: s, order)
        // 最後一站：撒糖粒，也問最後那間好不好吃
        if order.allSatisfy({ $0.id == s.id || $0.done_at != nil }) {
            if s.isPlace { ask(s) }
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { finished = true }
            party += 1
        }
    }

    // 離開上一間收藏的店：問好不好吃（自己的收藏才問，問過不再問）
    private func askAbout(before s: TripStop, _ order: [TripStop]) {
        guard let i = order.firstIndex(where: { $0.id == s.id }), i > 0 else { return }
        let prev = order[i - 1]
        if prev.done_at != nil { ask(prev) }
    }

    private func ask(_ s: TripStop) {
        guard s.isPlace, let pid = s.place_id, let p = store.place(pid), store.isMine(p), !TripAsked.has(s.id) else { return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { rate = s.id }
    }

    private func rated(_ id: String, _ p: Place, _ n: Int) {
        TripAsked.add(id)
        var x = p; x.status = "been"; x.rating = n
        Task { [x] in await store.save(x) }
        store.say("記下來了：\(p.name) \(n) 顆星", icon: .check)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { rate = nil }
    }

    @ViewBuilder private func goBottom(_ order: [TripStop]) -> some View {
        if !finished, let id = rate, let s = order.first(where: { $0.id == id }), let pid = s.place_id, let p = store.place(pid) {
            RateCard(place: p) { n in
                rated(id, p, n)
            } close: {
                TripAsked.add(id)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { rate = nil }
            }
            .padding(.horizontal, 14).padding(.bottom, 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // ----- 分享：文字版（日期、每站時間＋名字＋地址、Google 地圖多站網址） -----

    private func share(_ t: Trip) {
        var lines = [t.title]
        for d in 1...max(1, t.days) {
            let ss = trips.stops(t.id, day: d)
            guard !ss.isEmpty else { continue }
            let origin = TripMath.origin(ss, here: store.here)
            let plan = TripCalc.plan(ss, legs: TripMath.legs(t, ss, origin: origin, router: router).map { $0?.min }, backLeg: nil)
            lines.append("")
            var head = t.days > 1 ? "第 \(d) 天" : ""
            if let date = t.date(of: d) { head += (head.isEmpty ? "" : " ") + TripDate.label(date) }
            if !head.isEmpty { lines.append(head) }
            for (i, s) in ss.enumerated() {
                let time = i < plan.rows.count ? TripDate.clock(plan.rows[i].arrive) + " " : ""
                lines.append("\(i + 1). \(time)\(s.name)" + (s.address.map { "（\($0)）" } ?? ""))
            }
            if let u = googleDir(ss, mode: TravelMode(rawValue: t.mode) ?? .walk) { lines.append(u.absoluteString) }
        }
        presentShare([lines.joined(separator: "\n")])
    }

    private func googleDir(_ ss: [TripStop], mode: TravelMode) -> URL? {
        let cs = ss.compactMap(\.coord).prefix(10)
        guard cs.count >= 2 else { return nil }
        func p(_ c: CLLocationCoordinate2D) -> String { "\(c.latitude),\(c.longitude)" }
        let mid = cs.dropFirst().dropLast().map(p).joined(separator: "|")
        let tm = mode == .walk ? "walking" : mode == .drive ? "driving" : "transit"
        var s = "https://www.google.com/maps/dir/?api=1&origin=\(p(cs.first!))&destination=\(p(cs.last!))&travelmode=\(tm)"
        if !mid.isEmpty { s += "&waypoints=" + (mid.addingPercentEncoding(withAllowedCharacters: .queryValue) ?? mid) }
        return URL(string: s)
    }
}

// 拖曳中的狀態：拿起哪一站、從第幾個到第幾個、手指移了多少
struct RowDrag: Equatable {
    var id: String?
    var from = 0
    var to = 0
    var h: CGFloat = 0
    var dy: CGFloat = 0
    var overDay: Int?

    // 別的站要讓位：拿起的那站後面的先往上補，插進去的位置之後的往下讓
    func shift(_ k: Int) -> CGFloat {
        guard id != nil, k != from else { return 0 }
        let n = k > from ? k - 1 : k
        return (k > from ? -h : 0) + (n >= to ? h : 0)
    }

    // 地圖和號碼用的順序：拿起的那站插到目前的位置
    func preview(_ base: [TripStop]) -> [TripStop] {
        guard let id, let s = base.first(where: { $0.id == id }), to != from else { return base }
        var l = base.filter { $0.id != id }
        l.insert(s, at: min(max(0, to), l.count))
        return l
    }

    @MainActor mutating func retarget(_ geo: RowGeo, base: [TripStop]) {
        guard let id, let f = geo.rows[id] else { return }
        let center = f.midY + dy
        var t = 0
        for (k, s) in base.enumerated() where s.id != id {
            guard let r = geo.rows[s.id] else { continue }
            let mid = k > from ? r.midY - h : r.midY
            if mid < center { t += 1 }
        }
        if t != to { to = t; Haptic.tick() }
    }

    // 最低那排站卡：左右拖（dy 當成橫向移了多少）
    @MainActor mutating func retargetX(_ geo: RowGeo, base: [TripStop]) {
        guard let id, let f = geo.cards[id] else { return }
        let center = f.midX + dy
        var t = 0
        for (k, s) in base.enumerated() where s.id != id {
            guard let r = geo.cards[s.id] else { continue }
            let mid = k > from ? r.midX - h : r.midX
            if mid < center { t += 1 }
        }
        if t != to { to = t; Haptic.tick() }
    }
}

// 每列、每個「第 N 天」在螢幕上的位置（拖曳時算插到哪；不用觀察，改了不重畫）
final class RowGeo {
    var rows: [String: CGRect] = [:]
    var chips: [Int: CGRect] = [:]
    var cards: [String: CGRect] = [:]
}

struct TripSeg: Identifiable {
    let id: String
    let coords: [CLLocationCoordinate2D]
    let color: Color
    let routed: Bool
    var faded = false      // 出發後走過的路：變淡

    // 實際道路：7pt 實線＋13pt 白邊；還沒算好：同色虛線直線
    var style: StrokeStyle { routed ? StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round) : StrokeStyle(lineWidth: 5, lineCap: .round, dash: [0.5, 11]) }
    var under: StrokeStyle { StrokeStyle(lineWidth: routed ? 13 : 1, lineCap: .round, lineJoin: .round) }
}

struct TripMark: Identifiable {
    let id: String
    let n: Int
    let coord: CLLocationCoordinate2D
    let color: Color
    let place: Bool
    let icon: String
    var done = false       // 出發後到過的站：灰色勾勾
}

// 地圖上的站：收藏是 40pt 甜甜圈號碼（白底、粗彩色圈、數字同色）；景點、住宿是 28pt 小灰點
struct MarkView: View {
    let m: TripMark
    var hot = false
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        Group {
            if m.done {
                Image(systemName: "checkmark").font(.system(size: 13, weight: .black)).foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(TripColor.side.opacity(0.85), in: .circle)
                    .overlay(Circle().strokeBorder(.white, lineWidth: 2.5))
            } else if m.place {
                Text("\(m.n)").font(.system(size: 17, weight: .black)).foregroundStyle(m.color)
                    .contentTransition(.numericText())
                    .frame(width: 40, height: 40)
                    .background(.white, in: .circle)
                    .overlay(Circle().strokeBorder(m.color, lineWidth: 5))
            } else {
                Image(systemName: m.icon).font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(TripColor.side, in: .circle)
                    .overlay(Circle().strokeBorder(.white, lineWidth: 2.5))
            }
        }
        .shadow(color: .black.opacity(hot ? 0.35 : 0.22), radius: hot ? 6 : 3, y: 1)
        .scaleEffect(shown || reduce ? (hot ? 1.3 : 1) : 0.3)
        .animation(.snappy, value: m.n)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hot)
        .onAppear { withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) { shown = true } }
    }
}

// 列表裡的號碼：小一號的甜甜圈
struct NumberDonut: View {
    let n: Int, color: Color
    var side = false
    var body: some View {
        Text("\(n)").font(.system(size: 13, weight: .black)).foregroundStyle(side ? TripColor.side : color)
            .contentTransition(.numericText())
            .frame(width: 30, height: 30)
            .background(.white, in: .circle)
            .overlay(Circle().strokeBorder(side ? TripColor.side.opacity(0.6) : color, lineWidth: 3.5))
    }
}

// 一站：收藏的店有照片和白卡；景點、住宿是虛線框、小灰圖示
struct StopCard: View {
    @Environment(Store.self) private var store
    let stop: TripStop
    let n: Int
    let row: DayPlan.Row?
    let open: Bool
    let me: String?
    var hot = false        // 地圖上正放大的那站
    // 點一下展開、長按拿起來換順序：只放在上面那排，展開後的停留滑桿、開關不會被吃掉
    var tap: () -> Void = {}
    var hold: AnyGesture<Void> = AnyGesture(LongPressGesture(minimumDuration: 99).map { _ in () })

    var body: some View {
        let color = TripColor.of(n - 1)
        let place = stop.place_id.flatMap { store.place($0) }
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                NumberDonut(n: n, color: color, side: !stop.isPlace)
                if stop.isPlace {
                    Group {
                        if let place { PhotoView(place: place, px: 160) } else { Color.bg2.overlay { Text("🍽️").font(.system(size: 22)) } }
                    }
                    .frame(width: 46, height: 46).clipShape(.rect(cornerRadius: 12))
                } else {
                    Image(systemName: POI.icon(stop.poi, kind: stop.kind)).font(.system(size: 14, weight: .bold)).foregroundStyle(TripColor.side)
                        .frame(width: 30, height: 30).background(TripColor.side.opacity(0.14), in: .rect(cornerRadius: 9))
                }
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(stop.name).font(.system(size: stop.isPlace ? 16 : 15, weight: stop.isPlace ? .heavy : .bold)).foregroundStyle(Color.ink).lineLimit(1)
                        Text(stop.isPlace ? "收藏" : POI.label(stop)).font(.system(size: 10.5, weight: .heavy))
                            .padding(.horizontal, 6).frame(height: 18)
                            .background((stop.isPlace ? Color.accent : TripColor.side).opacity(0.14), in: .capsule)
                            .foregroundStyle(stop.isPlace ? Color.accentDeep : TripColor.side)
                            .fixedSize()
                    }
                    HStack(spacing: 5) {
                        if let a = stop.added_by, a != me {
                            Avatar(name: store.name(a), id: a, size: 16)
                        }
                        Text(TripDate.stay(stop.stay_min)).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                        if stop.fixed_time != nil {
                            Image(systemName: "pin.fill").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.accent)
                        }
                    }
                }
                Spacer(minLength: 4)
                times
            }
            .padding(12)
            .contentShape(.rect)
            .onTapGesture(perform: tap)
            .gesture(hold)
            if open { StopEditor(stop: stop, place: place, arrive: row?.arrive).padding(.horizontal, 12).padding(.bottom, 12) }
        }
        .background {
            if stop.isPlace {
                RoundedRectangle(cornerRadius: 20).fill(Color.panel).shadow(color: .cardShadow, radius: 0, y: 3)
            } else {
                RoundedRectangle(cornerRadius: 20).fill(Color.panel.opacity(0.6))
                    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(TripColor.side.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
            }
        }
        .overlay {
            if hot { RoundedRectangle(cornerRadius: 20).strokeBorder(TripColor.of(n - 1), lineWidth: 2.5).transition(.opacity) }
        }
        .animation(.snappy(duration: 0.2), value: hot)
        .padding(.vertical, 3)
    }

    @ViewBuilder private var times: some View {
        if let row {
            VStack(alignment: .trailing, spacing: 1) {
                Text(TripDate.clock(row.arrive)).font(.system(size: 16, weight: .heavy)).monospacedDigit()
                    .foregroundStyle(row.late > 0 ? Color.red : Color.ink)
                Text(row.late > 0 ? "會晚 \(row.late) 分" : "到 \(TripDate.clock(row.leave))").font(.caption2.weight(.bold)).monospacedDigit()
                    .foregroundStyle(row.late > 0 ? Color.red : Color.ink.opacity(0.45))
            }
            .contentTransition(.numericText())
            .animation(.snappy, value: row.arrive)
        }
    }
}

// 點一站展開：停留時間（15 分一格）、固定幾點到、看店家、拿掉
private struct StopEditor: View {
    @Environment(Store.self) private var store
    let stop: TripStop
    let place: Place?
    let arrive: Int?
    @State private var stay: Double = 60

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider().padding(.top, 10)
            HStack {
                Text("停留").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink)
                Spacer()
                Text(TripDate.stay(Int(stay))).font(.subheadline.weight(.heavy)).foregroundStyle(Color.accentDeep).monospacedDigit()
            }
            Slider(value: $stay, in: 0...360, step: 15) { editing in
                guard !editing, Int(stay) != stop.stay_min else { return }
                var s = stop; s.stay_min = Int(stay)
                TripStore.shared.update(s, store: store)
            }
            .tint(.accent)
            .swipeBackBlocked()
            .onChange(of: stay) { Haptic.tick() }
            Toggle(isOn: Binding(get: { stop.fixed_time != nil }, set: { on in
                Haptic.light()
                var s = stop
                if on { let m = ((arrive ?? 720) + 4) / 5 * 5; s.fixed_time = TripDate.time(m) } else { s.fixed_time = nil }
                withAnimation(.snappy) { TripStore.shared.update(s, store: store) }
            })) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("固定幾點到").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink)
                    Text("例如訂位、表演開始").font(.caption).foregroundStyle(Color.ink.opacity(0.45))
                }
            }
            .tint(.accent)
            if let m = stop.fixedMin {
                DatePicker("幾點到", selection: Binding(get: { Self.date(m) }, set: { d in
                    let c = Calendar.current.dateComponents([.hour, .minute], from: d)
                    var s = stop; s.fixed_time = TripDate.time((c.hour ?? 0) * 60 + (c.minute ?? 0))
                    TripStore.shared.update(s, store: store)
                }), displayedComponents: .hourAndMinute)
                .font(.subheadline.weight(.bold))
            }
            HStack(spacing: 10) {
                if let place {
                    NavigationLink(value: place) {
                        Label("看店家", systemImage: "fork.knife").font(.subheadline.weight(.heavy)).frame(maxWidth: .infinity).frame(height: 40)
                            .background(Color.accent.opacity(0.13), in: .rect(cornerRadius: 12)).foregroundStyle(Color.accentDeep)
                    }
                    .buttonStyle(PressStyle())
                }
                Button(role: .destructive) {
                    Haptic.light()
                    TripStore.shared.deleteWithUndo(stop, store: store)
                } label: {
                    Label("拿掉這站", systemImage: "trash").font(.subheadline.weight(.heavy)).frame(maxWidth: .infinity).frame(height: 40)
                        .background(Color.sprPink.opacity(0.12), in: .rect(cornerRadius: 12)).foregroundStyle(Color.sprPink)
                }
                .buttonStyle(PressStyle())
            }
        }
        .onAppear { stay = Double(stop.stay_min) }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    static func date(_ m: Int) -> Date {
        Calendar.current.date(bySettingHour: (m / 60) % 24, minute: m % 60, second: 0, of: Date()) ?? Date()
    }
}

// 兩站之間：「🚶 走路 8 分」＋三顆小切換，只改這一段
private struct LegRow: View {
    let trip: Trip
    let from: TripStop
    let to: TripStop
    let leg: Leg?
    let hidden: Bool
    let pick: (TravelMode) -> Void
    let openMaps: () -> Void

    var body: some View {
        let m = TravelMode(rawValue: to.mode ?? trip.mode) ?? .walk
        HStack(spacing: 8) {
            // 對齊號碼的虛線
            Rectangle().fill(.clear).frame(width: 30, height: 40)
                .overlay { Line().stroke(Color.ink.opacity(0.18), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [2, 5])) }
            label(m)
            Spacer(minLength: 4)
            HStack(spacing: 6) {
                ForEach(TravelMode.allCases, id: \.self) { x in
                    Button { if x != m { pick(x) } } label: {
                        Image(systemName: x.icon).font(.system(size: 12, weight: .bold))
                            .foregroundStyle(x == m ? Color.accentDeep : Color.ink.opacity(0.4))
                            .frame(width: 38, height: 28)
                            .background(x == m ? Color.accent.opacity(0.14) : Color.white, in: .capsule)
                            .overlay(Capsule().strokeBorder(x == m ? Color.accent : Color.ink.opacity(0.1), lineWidth: x == m ? 1.5 : 1))
                            .frame(minHeight: 40).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel(x.verb)
                    .accessibilityAddTraits(x == m ? .isSelected : [])
                }
            }
        }
        .padding(.horizontal, 12)
        .opacity(hidden ? 0.25 : 1)
    }

    @ViewBuilder private func label(_ m: TravelMode) -> some View {
        if let leg, leg.noTransit {
            Button(action: openMaps) {
                Text("🚇 開地圖看").font(.footnote.weight(.heavy)).foregroundStyle(Color.sprBlue)
                    .frame(minHeight: 40).contentShape(.rect)
            }
            .buttonStyle(PressStyle())
        } else if let leg {
            Text("\(m.emoji) \(m.verb) \(leg.approx ? "約 " : "")\(TripDate.span(leg.min))")
                .font(.footnote.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.6))
                .contentTransition(.numericText())
                .animation(.snappy, value: leg.min)
        } else {
            Text("\(m.emoji) \(m.verb)").font(.footnote.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.4))
        }
    }
}

private struct Line: Shape {
    func path(in r: CGRect) -> Path { Path { p in p.move(to: CGPoint(x: r.midX, y: r.minY)); p.addLine(to: CGPoint(x: r.midX, y: r.maxY)) } }
}

// 最低高度那排橫向站卡：號碼、小照片、名字、幾點到；景點、住宿是虛線卡
struct MiniStop: View {
    @Environment(Store.self) private var store
    let stop: TripStop
    let n: Int
    let row: DayPlan.Row?
    var hot = false

    var body: some View {
        let color = TripColor.of(n - 1)
        let place = stop.place_id.flatMap { store.place($0) }
        HStack(spacing: 8) {
            ZStack(alignment: .topLeading) {
                Group {
                    if stop.isPlace {
                        if let place { PhotoView(place: place, px: 120) } else { Color.bg2.overlay { Text("🍽️").font(.system(size: 16)) } }
                    } else {
                        Image(systemName: POI.icon(stop.poi, kind: stop.kind)).font(.system(size: 14, weight: .bold)).foregroundStyle(TripColor.side)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(TripColor.side.opacity(0.14))
                    }
                }
                .frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 10))
                NumberDonut(n: n, color: color, side: !stop.isPlace)
                    .scaleEffect(0.72)
                    .offset(x: -12, y: -12)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.name).font(.system(size: 14, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                if let row {
                    Text(TripDate.clock(row.arrive)).font(.caption.weight(.bold)).foregroundStyle(Color.ink.opacity(0.5))
                        .contentTransition(.numericText())
                }
            }
            .frame(maxWidth: 92, alignment: .leading)
        }
        .padding(.leading, 12).padding(.trailing, 10)
        .frame(height: 62)
        .background {
            if stop.isPlace {
                RoundedRectangle(cornerRadius: 18).fill(Color.panel).shadow(color: .cardShadow, radius: 0, y: 3)
            } else {
                RoundedRectangle(cornerRadius: 18).fill(Color.panel.opacity(0.6))
                    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(TripColor.side.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
            }
        }
        .overlay {
            if hot { RoundedRectangle(cornerRadius: 18).strokeBorder(color, lineWidth: 2.5) }
        }
        .animation(.snappy(duration: 0.2), value: hot)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("第 \(n) 站 \(stop.name)")
    }
}
