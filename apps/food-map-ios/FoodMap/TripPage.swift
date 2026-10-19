import SwiftUI
import MapKit

// 排行程頁：上面地圖、下面可以拉的面板（只露標題／一半／幾乎全螢幕）
// 每站一列：彩色號碼、照片、名字、停留多久、幾點到幾點走；兩站之間可以換走路／開車／捷運
// 長按一站拖曳換順序：拖的時候地圖上的號碼和路線馬上跟著換；拖到上面的「第 N 天」就換到那天
struct TripPage: View {
    let tid: String
    var focus: String? = nil
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @Environment(\.openURL) private var openURL
    @State private var trips = TripStore.shared
    @State private var router = TripRouter.shared
    @State private var day = 1
    @State private var expanded: String?
    @State private var pos: MapCameraPosition = .automatic
    @State private var level: Level = .mid
    @State private var pull: CGFloat = 0
    @State private var drag = RowDrag()
    @State private var geo = RowGeo()
    @State private var renaming = false
    @State private var newTitle = ""
    @State private var setting = false
    @State private var deleting = false
    @State private var focused = false
    @State private var size: CGSize = .zero
    @State private var adding = false
    // 出發
    @State private var going = false
    @State private var me: CLLocation?          // 出發時的目前位置（只在 App 開著時更新）
    @State private var pinged: String?          // 已經為「快到了」震過的那站
    @State private var rate: String?            // 問「好吃嗎」的那站
    @State private var finished = false
    @State private var party = 0
    @State private var navAsk: TripStop?

    enum Level { case low, mid, high }

    var body: some View {
        Group {
            if let t = trips.trip(tid) { content(t) } else { gone }
        }
        .toolbarVisibility(.hidden, for: .navigationBar)
        .task(id: tid) {
            trips.lastOpened = tid
            await trips.load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                if Task.isCancelled { break }
                await trips.load()
            }
        }
        .onChange(of: phase) { _, p in if p == .active { Task { await trips.load() } } }
        .onAppear { Perf.shared.mark("進行程") }
    }

    private var gone: some View {
        VStack(spacing: 14) {
            HStack {
                Button { store.pop(dismiss) } label: { CircleIcon(icon: "chevron.left") }.buttonStyle(PressStyle())
                Spacer()
            }
            Spacer()
            if trips.loaded { ContentUnavailableView("這個行程不見了", systemImage: "map", description: Text("可能被建立的人刪掉了")) }
            else { ProgressView() }
            Spacer()
        }
        .padding(16)
        .background(Color.bg)
    }

    // ----- 版面 -----

    private func content(_ t: Trip) -> some View {
        let d = min(day, t.days)
        let base = trips.stops(t.id, day: d)
        let order = drag.preview(base)
        let origin = originOf(order)
        let legs = legsOf(t, order, origin: origin)
        let plan = TripCalc.plan(order, legs: legs.map { $0?.min }, backLeg: backLeg(t, order, origin: origin))
        let segs = segsOf(t, order, origin: origin, legs: legs)
        let marks = marksOf(order)
        let next = order.first { $0.done_at == nil }
        let core = ZStack(alignment: .bottom) {
            TripMap(pos: $pos, segs: segs, marks: marks)
                .ignoresSafeArea()
            if !going {
                panel(t, d: d, base: base, order: order, legs: legs, plan: plan)
                    .transition(.move(edge: .bottom))
                actions(t, base: base)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                goBottom(order)
            }
        }
        let top = core.overlay(alignment: .top) {
            VStack(spacing: 10) {
                header(t, d: d, order: order, plan: plan)
                if going, let next { goCard(t, order: order, next: next, plan: plan).padding(.horizontal, 14) }
            }
        }
        return goMods(top, t, order: order, next: next)
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
        // 換天、加站、刪站：地圖 0.5 秒縮放到包住這天所有站
        .onChange(of: fitKey(d, base)) { fit(base, origin: origin, animated: true) }
        .onChange(of: size) { fit(base, origin: origin, animated: false) }
        .onChange(of: level) { fit(base, origin: origin, animated: true) }
        .task(id: needKey(t, base, origin: origin)) { router.need(needs(t, base, origin: origin)) }
        .onAppear { openFocus(t) }
        .alert("行程名稱", isPresented: $renaming) {
            TextField("名稱", text: $newTitle)
            Button("取消", role: .cancel) {}
            Button("好") {
                let n = newTitle.trimmingCharacters(in: .whitespaces)
                if !n.isEmpty, var x = trips.trip(tid) { x.title = n; trips.update(x, store: store) }
            }
        }
        .sheet(isPresented: $setting) { TripForm(trip: t) }
        .fullScreenCover(isPresented: $adding) { TripAddSheet(tid: t.id, day: d).environment(store) }
        .confirmationDialog("刪除「\(t.title)」？每一站都會一起刪掉", isPresented: $deleting, titleVisibility: .visible) {
            Button("刪除行程", role: .destructive) { store.pop(dismiss); trips.deleteWithUndo(t, store: store) }
        }
    }

    private func header(_ t: Trip, d: Int, order: [TripStop], plan: DayPlan) -> some View {
        HStack(spacing: 8) {
            Button { store.pop(dismiss) } label: { CircleIcon(icon: "chevron.left") }
                .buttonStyle(PressStyle()).accessibilityLabel("返回")
            Button { newTitle = t.title; renaming = true } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.title).font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(subtitle(t, d: d, order: order, plan: plan)).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                        .contentTransition(.numericText())
                }
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .background(.white, in: .rect(cornerRadius: 16))
                .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
            }
            .buttonStyle(PressStyle())
            .accessibilityHint("改名稱")
            Button { share(t) } label: { CircleIcon(icon: "square.and.arrow.up") }
                .buttonStyle(PressStyle()).accessibilityLabel("分享")
            Menu {
                Button("行程設定", systemImage: "slider.horizontal.3") { setting = true }
                Button("改名稱", systemImage: "pencil") { newTitle = t.title; renaming = true }
                if t.owner == nil || t.owner == store.me {
                    Button("刪除行程", systemImage: "trash", role: .destructive) { deleting = true }
                }
            } label: { CircleIcon(icon: "ellipsis") }
            .accessibilityLabel("更多")
        }
        .padding(.horizontal, 14).padding(.top, 4)
        .environment(\.colorScheme, .light)
    }

    // 9/20 週六・11:40 出發・回到 16:40
    private func subtitle(_ t: Trip, d: Int, order: [TripStop], plan: DayPlan) -> String {
        var p: [String] = []
        if let date = t.date(of: d) { p.append(TripDate.label(date)) } else if t.days > 1 { p.append("第 \(d) 天") }
        guard !order.isEmpty else { p.append("還沒有站"); return p.joined(separator: "・") }
        p.append("\(TripDate.clock(plan.depart)) 出發")
        if let b = plan.back { p.append("回到 \(TripDate.clock(b))") }
        else if let l = plan.rows.last { p.append("\(TripDate.clock(l.leave)) 結束") }
        return p.joined(separator: "・")
    }

    // ----- 下面的面板 -----

    private func heights() -> (low: CGFloat, mid: CGFloat, high: CGFloat) {
        let h = max(size.height, 500)
        return (176, h * 0.52, h - 76)
    }

    private func panelHeight() -> CGFloat {
        let hs = heights()
        let base: CGFloat = level == .low ? hs.low : level == .mid ? hs.mid : hs.high
        return min(hs.high + 30, max(hs.low - 30, base + pull))
    }

    private func panel(_ t: Trip, d: Int, base: [TripStop], order: [TripStop], legs: [Leg?], plan: DayPlan) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                Capsule().fill(Color.ink.opacity(0.18)).frame(width: 40, height: 5).padding(.top, 8)
                dayChips(t, d: d)
            }
            .padding(.bottom, 6)
            .contentShape(.rect)
            .gesture(sheetDrag)
            ScrollViewReader { sp in
                ScrollView {
                    rows(t, d: d, base: base, order: order, legs: legs, plan: plan)
                        .padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 120)
                }
                .scrollDisabled(drag.id != nil)
                .onChange(of: focused) { _, f in
                    guard f, let id = focus else { return }
                    Task { try? await Task.sleep(for: .seconds(0.35)); withAnimation(.snappy) { sp.scrollTo(id, anchor: .center) } }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: panelHeight(), alignment: .top)
        .background(Color.bg, in: UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
        .shadow(color: .black.opacity(0.14), radius: 14, y: -2)
        .ignoresSafeArea(edges: .bottom)
    }

    // 面板最下面一排：＋ 加一站（之後還有幫我排順序、出發）
    private func actions(_ t: Trip, base: [TripStop]) -> some View {
        let allDone = !base.isEmpty && base.allSatisfy { $0.done_at != nil }
        return HStack(spacing: 10) {
            Button {
                Haptic.light()
                Perf.shared.mark("按加一站")
                adding = true
            } label: {
                Label("加一站", systemImage: "plus").font(.headline).frame(maxWidth: .infinity)
            }
            .buttonStyle(ChunkyStyle(color: .panel, edge: .cardShadow, fg: .ink, radius: 18))
            .accessibilityLabel("加一站")
            Button { startGo(base, again: allDone) } label: {
                Label(allDone ? "重新出發" : "出發", systemImage: "location.north.fill").font(.headline).frame(maxWidth: .infinity)
            }
            .buttonStyle(ChunkyStyle(radius: 18))
            .disabled(base.isEmpty)
            .opacity(base.isEmpty ? 0.5 : 1)
        }
        .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 6)
        .background {
            LinearGradient(colors: [Color.bg.opacity(0), Color.bg], startPoint: .top, endPoint: .init(x: 0.5, y: 0.35))
                .ignoresSafeArea(edges: .bottom)
                .allowsHitTesting(false)
        }
        .opacity(drag.id == nil ? 1 : 0)
        .animation(.snappy(duration: 0.2), value: drag.id == nil)
    }

    // 拉面板：放開時停在最近的一段（甩得快就往甩的方向）
    private var sheetDrag: some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { v in pull = -v.translation.height }
            .onEnded { v in
                let hs = heights()
                let now: CGFloat = (level == .low ? hs.low : level == .mid ? hs.mid : hs.high) - v.predictedEndTranslation.height * 0.6
                let pick: Level = [(Level.low, hs.low), (Level.mid, hs.mid), (Level.high, hs.high)].min { abs($0.1 - now) < abs($1.1 - now) }!.0
                if pick != level { Haptic.light() }
                withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { level = pick; pull = 0 }
            }
    }

    private func dayChips(_ t: Trip, d: Int) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(1...max(1, t.days), id: \.self) { n in dayChip(n, on: n == d) }
                if t.days < 14 {
                    Button {
                        Haptic.light()
                        var x = t; x.days += 1
                        trips.update(x, store: store)
                        withAnimation(.snappy) { day = x.days }
                    } label: {
                        Text("＋ 加一天").font(.subheadline.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.55))
                            .padding(.horizontal, 12).frame(height: 34)
                            .background(Color.bg2, in: .capsule)
                            .frame(minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                }
                if store.here != nil {
                    Text("🏠 目前位置出發").font(.footnote.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.7))
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(.white, in: .capsule).overlay(Capsule().strokeBorder(Color.ink.opacity(0.1)))
                }
            }
            .padding(.horizontal, 14)
        }
    }

    private func dayChip(_ n: Int, on: Bool) -> some View {
        let over = drag.overDay == n && n != day
        return Button {
            guard n != day else { return }
            Haptic.light()
            Perf.shared.mark("換天")
            withAnimation(.snappy) { day = n; expanded = nil }
        } label: {
            Text("第 \(n) 天").font(.subheadline.weight(.heavy))
                .padding(.horizontal, 14).frame(height: 34)
                .background(on ? Color.ink : over ? Color.accent.opacity(0.25) : .white, in: .capsule)
                .overlay(Capsule().strokeBorder(over ? Color.accent : on ? .clear : Color.ink.opacity(0.1), lineWidth: over ? 2 : 1))
                .foregroundStyle(on ? .white : Color.ink)
                .scaleEffect(over ? 1.12 : 1)
                .frame(minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { geo.chips[n] = $0 }
        .animation(.snappy, value: over)
    }

    // ----- 每一站 -----

    @ViewBuilder
    private func rows(_ t: Trip, d: Int, base: [TripStop], order: [TripStop], legs: [Leg?], plan: DayPlan) -> some View {
        if base.isEmpty {
            VStack(spacing: 8) {
                Text("🍩").font(.system(size: 40))
                Text("這天還沒有站").font(.headline).foregroundStyle(Color.ink)
                Text("按下面的「＋ 加一站」，或到店家頁按「加進行程」").font(.subheadline).foregroundStyle(Color.ink.opacity(0.5))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 30)
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
            }
            SwipeToDelete(enabled: drag.id == nil) {
                if expanded == s.id { expanded = nil }
                trips.deleteWithUndo(s, store: store)
            } content: {
                StopCard(stop: s, n: i + 1, row: row, open: expanded == s.id, me: store.me)
                    .contentShape(.rect)
                    .onTapGesture {
                        Haptic.light()
                        withAnimation(.snappy) { expanded = expanded == s.id ? nil : s.id }
                    }
                    .gesture(reorder(t, s, k: k))
            }
        }
        .id(s.id)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { if drag.id == nil { geo.rows[s.id] = $0 } }
        .offset(y: dragging ? drag.dy : drag.shift(k))
        .scaleEffect(dragging ? 1.03 : 1)
        .shadow(color: .black.opacity(dragging ? 0.18 : 0), radius: 12, y: 6)
        .zIndex(dragging ? 10 : 0)
        .animation(dragging ? nil : .snappy(duration: 0.25), value: drag.shift(k))
        .transition(.asymmetric(insertion: .scale(scale: 0.9).combined(with: .opacity), removal: .opacity))
    }

    // 長按 0.35 秒拿起來，拖到別的位置放開；拖到上面的「第 N 天」放開就換天
    private func reorder(_ t: Trip, _ s: TripStop, k: Int) -> some Gesture {
        LongPressGesture(minimumDuration: 0.35)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
            .onChanged { v in
                guard case .second(true, let g) = v else { return }
                if drag.id == nil { begin(s, k: k) }
                guard let g else { return }
                drag.dy = g.translation.height
                drag.retarget(geo, base: trips.stops(t.id, day: min(day, t.days)))
                let over = geo.chips.first { $0.value.contains(g.location) }?.key
                if over != drag.overDay { drag.overDay = over; if over != nil { Haptic.tick() } }
            }
            .onEnded { _ in drop(t) }
    }

    private func begin(_ s: TripStop, k: Int) {
        Haptic.medium()
        Perf.shared.mark("拿起一站")
        let h = geo.rows[s.id]?.height ?? 80
        withAnimation(.snappy(duration: 0.2)) { drag = RowDrag(id: s.id, from: k, to: k, h: h) }
    }

    private func drop(_ t: Trip) {
        guard let id = drag.id, var s = trips.stops.first(where: { $0.id == id }) else { drag = RowDrag(); return }
        let d = min(day, t.days)
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

    // ----- 地圖 -----

    private func originOf(_ order: [TripStop]) -> CLLocationCoordinate2D? {
        // 目前位置離第一站 30 公里內才當起點（人在台北排台南的行程就不算）
        guard let here = store.here, let f = order.first(where: { $0.coord != nil })?.coord else { return nil }
        return here.distance(from: CLLocation(latitude: f.latitude, longitude: f.longitude)) < 30_000 ? here.coordinate : nil
    }

    private func mode(_ t: Trip, _ s: TripStop) -> TravelMode { TravelMode(rawValue: s.mode ?? t.mode) ?? .walk }

    // legs[i] = 到第 i 站的那段（第 0 站從起點來）
    private func legsOf(_ t: Trip, _ order: [TripStop], origin: CLLocationCoordinate2D?) -> [Leg?] {
        order.enumerated().map { i, s in
            guard let b = s.coord else { return nil }
            let a: CLLocationCoordinate2D? = i == 0 ? origin : order[i - 1].coord
            guard let a else { return nil }
            return router.leg(a, b, i == 0 ? (TravelMode(rawValue: t.mode) ?? .walk) : mode(t, s))
        }
    }

    private func backLeg(_ t: Trip, _ order: [TripStop], origin: CLLocationCoordinate2D?) -> Int? {
        guard let o = origin, let l = order.last?.coord else { return nil }
        return router.leg(l, o, TravelMode(rawValue: t.mode) ?? .walk).min
    }

    private func needs(_ t: Trip, _ base: [TripStop], origin: CLLocationCoordinate2D?) -> [(CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)] {
        var out: [(CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)] = []
        let tm = TravelMode(rawValue: t.mode) ?? .walk
        for (i, s) in base.enumerated() {
            guard let b = s.coord else { continue }
            if i == 0 { if let o = origin { out.append((o, b, tm)) } }
            else if let a = base[i - 1].coord { out.append((a, b, mode(t, s))) }
        }
        if let o = origin, let l = base.last?.coord { out.append((l, o, tm)) }
        return out
    }

    private func needKey(_ t: Trip, _ base: [TripStop], origin: CLLocationCoordinate2D?) -> String {
        needs(t, base, origin: origin).map { TripRouter.key($0.0, $0.1, $0.2) }.joined(separator: ";")
    }

    private func segsOf(_ t: Trip, _ order: [TripStop], origin: CLLocationCoordinate2D?, legs: [Leg?]) -> [TripSeg] {
        var out: [TripSeg] = []
        for (i, s) in order.enumerated() {
            guard let b = s.coord else { continue }
            let a: CLLocationCoordinate2D? = i == 0 ? origin : order[i - 1].coord
            guard let a else { continue }
            let leg = legs[i]
            let line = leg?.coords
            out.append(TripSeg(id: (i == 0 ? "o" : order[i - 1].id) + ">" + s.id, coords: line ?? [a, b], color: TripColor.of(i), routed: line != nil, faded: s.done_at != nil))
        }
        return out
    }

    private func marksOf(_ order: [TripStop]) -> [TripMark] {
        order.enumerated().compactMap { i, s in
            guard let c = s.coord else { return nil }
            return TripMark(id: s.id, n: i + 1, coord: c, color: TripColor.of(i), place: s.isPlace, icon: POI.icon(s.poi, kind: s.kind), done: s.done_at != nil)
        }
    }

    private func fitKey(_ d: Int, _ base: [TripStop]) -> String { "\(d)|" + base.map(\.id).joined(separator: ",") }

    // 把這天所有站框進「面板上面」那塊看得到的地圖
    private func fit(_ base: [TripStop], origin: CLLocationCoordinate2D?, animated: Bool) {
        var cs = base.compactMap(\.coord)
        if cs.isEmpty, let o = origin { cs = [o] }
        guard !cs.isEmpty, size.height > 0 else { return }
        let lats = cs.map(\.latitude), lngs = cs.map(\.longitude)
        let latR = max(0.004, lats.max()! - lats.min()!)
        let lngR = max(0.004, lngs.max()! - lngs.min()!)
        let top: CGFloat = 80
        let window = max(120, size.height - panelHeight() - top)
        let k = Double(window * 0.72) / latR                         // 每一度緯度幾點
        let full = Double(size.height) / k                          // 整張地圖的緯度範圍
        let mid = (lats.max()! + lats.min()!) / 2
        let winCenter = Double(top + window / 2)                    // 看得到那塊的中心離頂端幾點
        let center = mid + (winCenter - Double(size.height) / 2) / k
        let r = MKCoordinateRegion(center: .init(latitude: center, longitude: (lngs.max()! + lngs.min()!) / 2),
                                   span: .init(latitudeDelta: full, longitudeDelta: lngR * 1.4))
        if animated { withAnimation(.easeInOut(duration: 0.5)) { pos = .region(r) } } else { pos = .region(r) }
    }

    private func openFocus(_ t: Trip) {
        guard !focused, let f = focus, let s = trips.stops.first(where: { $0.id == f }) else { return }
        day = min(s.day, t.days)
        expanded = f
        focused = true
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
                        DoneCard(eaten: eaten, shot: party) { endGo() }
                    }
                    .transition(.opacity)
                }
            }
            .task(id: going) { await follow() }
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
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { going = true }
        withAnimation(.easeInOut(duration: 0.6)) { pos = .userLocation(fallback: pos) }
    }

    private func endGo() {
        Haptic.light()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { going = false; finished = false; rate = nil }
        if let t = trips.trip(tid) {
            let base = trips.stops(t.id, day: min(day, t.days))
            Task { try? await Task.sleep(for: .seconds(0.05)); fit(base, origin: originOf(base), animated: true) }
        }
    }

    // 出發時才開定位（App 在前景時更新；不用背景定位）
    private func follow() async {
        guard going else { return }
        do {
            for try await u in CLLocationUpdate.liveUpdates() {
                if Task.isCancelled || !going { break }
                if let l = u.location { me = l }
            }
        } catch {}
    }

    private var here: CLLocation? { me ?? store.here }

    // 目前位置四捨五入到約 100 公尺，免得一直重算路線
    private func hereRounded() -> CLLocationCoordinate2D? {
        guard let h = here?.coordinate else { return nil }
        return CLLocationCoordinate2D(latitude: (h.latitude * 1000).rounded() / 1000, longitude: (h.longitude * 1000).rounded() / 1000)
    }

    private func goMode(_ t: Trip, _ order: [TripStop], _ s: TripStop) -> TravelMode {
        order.first?.id == s.id ? (TravelMode(rawValue: t.mode) ?? .walk) : mode(t, s)
    }

    private func goNeed(_ t: Trip, _ order: [TripStop], _ next: TripStop?) -> (CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)? {
        guard going, let next, let b = next.coord, let a = hereRounded() else { return nil }
        return (a, b, goMode(t, order, next))
    }

    private func goKey(_ t: Trip, _ next: TripStop?) -> String {
        guard going, let next, let a = hereRounded(), let b = next.coord else { return "" }
        return TripRouter.key(a, b, TravelMode(rawValue: next.mode ?? t.mode) ?? .walk)
    }

    private func nearNext(_ next: TripStop?) -> Bool {
        guard going, let c = next?.coord, let h = here else { return false }
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
        if today, let row {
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

    @ViewBuilder private func goBottom(_ order: [TripStop]) -> some View {
        if let id = rate, let s = order.first(where: { $0.id == id }), let pid = s.place_id, let p = store.place(pid) {
            RateCard(place: p) { n in
                TripAsked.add(id)
                var x = p; x.status = "been"; x.rating = n
                Task { [x] in await store.save(x) }
                store.say("記下來了：\(p.name) \(n) 顆星", icon: .check)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { rate = nil }
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
            let origin = originOf(ss)
            let plan = TripCalc.plan(ss, legs: legsOf(t, ss, origin: origin).map { $0?.min }, backLeg: nil)
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
}

// 每列、每個「第 N 天」在螢幕上的位置（拖曳時算插到哪；不用觀察，改了不重畫）
final class RowGeo {
    var rows: [String: CGRect] = [:]
    var chips: [Int: CGRect] = [:]
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

// 地圖：每段用下一站的顏色，7pt 線加 13pt 白邊；還沒算好的段先畫同色虛線直線
struct TripMap: View {
    @Binding var pos: MapCameraPosition
    let segs: [TripSeg]
    let marks: [TripMark]

    var body: some View {
        Map(position: $pos) {
            UserAnnotation()
            ForEach(segs) { s in
                MapPolyline(coordinates: s.coords).stroke(Color.white.opacity(s.routed ? (s.faded ? 0.5 : 1) : 0), style: s.under)
                MapPolyline(coordinates: s.coords).stroke(s.color.opacity(s.faded ? 0.3 : s.routed ? 1 : 0.85), style: s.style)
            }
            ForEach(marks) { m in
                Annotation("", coordinate: m.coord, anchor: .center) { MarkView(m: m) }
                    .annotationTitles(.hidden)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls { MapCompass() }
    }
}

// 地圖上的站：收藏是 40pt 甜甜圈號碼（白底、粗彩色圈、數字同色）；景點、住宿是 28pt 小灰點
private struct MarkView: View {
    let m: TripMark
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
        .shadow(color: .black.opacity(0.22), radius: 3, y: 1)
        .scaleEffect(shown || reduce ? 1 : 0.3)
        .animation(.snappy, value: m.n)
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
            if open { StopEditor(stop: stop, place: place, arrive: row?.arrive) }
        }
        .padding(12)
        .background {
            if stop.isPlace {
                RoundedRectangle(cornerRadius: 20).fill(Color.panel).shadow(color: .cardShadow, radius: 0, y: 3)
            } else {
                RoundedRectangle(cornerRadius: 20).fill(Color.panel.opacity(0.6))
                    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(TripColor.side.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
            }
        }
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
