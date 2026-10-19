import SwiftUI
import MapKit

// 加一站：全螢幕搜尋。上面是你的收藏（含群組分享給你的店），下面是 Apple 地圖上的地點
// 按 ＋ 馬上變「✓ 第 N 站」，再按一次取消；搜到的餐廳、咖啡、麵包店多一顆「♥ 收藏」
enum AddFilter: String, CaseIterable, Identifiable {
    case route, sight, stay, cafe, dessert
    var id: String { rawValue }
    var label: String {
        switch self {
        case .route: return "🧭 順路"
        case .sight: return "🏛️ 景點"
        case .stay: return "🏨 住宿"
        case .cafe: return "☕ 咖啡"
        case .dessert: return "🍰 甜點"
        }
    }
    // 收藏要比對的分類（nil = 不限）
    var cats: Set<String>? {
        switch self {
        case .cafe: return ["cafe", "drink"]
        case .dessert: return ["dessert", "bakery"]
        default: return nil
        }
    }
    // 景點、住宿不列收藏（收藏都是吃的）
    var showsPlaces: Bool { self != .sight && self != .stay }
    // Apple 地圖的類別
    var poi: [MKPointOfInterestCategory]? {
        switch self {
        case .sight: return [.museum, .park, .amusementPark, .aquarium, .zoo, .theater, .nationalPark, .beach, .stadium, .movieTheater, .marina, .library]
        case .stay: return [.hotel]
        case .cafe: return [.cafe]
        case .dessert: return [.bakery]
        case .route: return nil
        }
    }
}

// 新站加在哪：最後、兩站中間（空檔推薦）、最前面（選住宿當起點）
enum AddSlot: Equatable {
    case end
    case between(Double, Double)
    case first
}

// 打開「加一站」：預設篩選、加在哪、順路只看哪一段（兩站的 id）
struct AddReq: Identifiable {
    let id = UUID()
    var filter: AddFilter? = .route
    var slot: AddSlot = .end
    var seg: [String]? = nil
}

// Apple 地圖搜到的一個地點
struct MapHit: Identifiable, Equatable {
    let id: String
    let name: String
    let address: String?
    let city: String?
    let district: String?
    let coord: CLLocationCoordinate2D
    let poi: String?

    init(_ m: MKMapItem) {
        let pm = m.placemark
        let c = pm.coordinate
        let n = m.name ?? pm.name ?? "地點"
        let t = pm.title ?? ""
        name = n
        coord = c
        poi = m.pointOfInterestCategory?.rawValue
        address = t.isEmpty || t == n ? nil : t
        city = pm.administrativeArea ?? pm.locality
        district = pm.administrativeArea != nil ? pm.locality : pm.subLocality
        id = n + String(format: "|%.5f,%.5f", c.latitude, c.longitude)
    }

    static func == (a: MapHit, b: MapHit) -> Bool { a.id == b.id }

    private static let foods: Set<String> = Set([MKPointOfInterestCategory.restaurant, .cafe, .bakery, .foodMarket, .brewery, .winery, .nightlife].map(\.rawValue))
    var food: Bool { poi.map { Self.foods.contains($0) } ?? false }
    var stay: Bool { poi == MKPointOfInterestCategory.hotel.rawValue }
    // 存進收藏時的分類
    var category: String {
        if poi == MKPointOfInterestCategory.cafe.rawValue { return "cafe" }
        if poi == MKPointOfInterestCategory.bakery.rawValue { return "bakery" }
        if poi == MKPointOfInterestCategory.nightlife.rawValue || poi == MKPointOfInterestCategory.brewery.rawValue || poi == MKPointOfInterestCategory.winery.rawValue { return "bar" }
        return "restaurant"
    }
}

// 這天的路線（實際道路或兩站直線），拿來算某個點離路線幾公尺
struct RouteNear {
    private struct P { var x: Double; var y: Double }
    private var lines: [[P]] = []
    private var lat0 = 0.0
    private var lng0 = 0.0
    private var kx = 111_320.0
    private(set) var center: CLLocationCoordinate2D?
    private(set) var radius: Double = 1500
    var isEmpty: Bool { lines.isEmpty }

    init() {}

    init(_ ls: [[CLLocationCoordinate2D]]) {
        let all = ls.flatMap { $0 }
        guard let f = all.first else { return }
        let la0 = f.latitude, ln0 = f.longitude
        let k = 111_320 * cos(la0 * .pi / 180)
        lat0 = la0; lng0 = ln0; kx = k
        lines = ls.filter { !$0.isEmpty }.map { l in l.map { P(x: ($0.longitude - ln0) * k, y: ($0.latitude - la0) * 110_540) } }
        let lats = all.map(\.latitude), lngs = all.map(\.longitude)
        let c = CLLocationCoordinate2D(latitude: (lats.max()! + lats.min()!) / 2, longitude: (lngs.max()! + lngs.min()!) / 2)
        center = c
        let cl = CLLocation(latitude: c.latitude, longitude: c.longitude)
        let far = all.map { cl.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude)) }.max() ?? 0
        radius = max(1000, far + 600)
    }

    func meters(_ c: CLLocationCoordinate2D) -> Double {
        let p = P(x: (c.longitude - lng0) * kx, y: (c.latitude - lat0) * 110_540)
        var best = Double.infinity
        for l in lines {
            if l.count == 1 { best = min(best, hypot(p.x - l[0].x, p.y - l[0].y)); continue }
            for i in 1..<l.count { best = min(best, Self.seg(p, l[i - 1], l[i])) }
        }
        return best
    }

    private static func seg(_ p: P, _ a: P, _ b: P) -> Double {
        let dx = b.x - a.x, dy = b.y - a.y
        let len = dx * dx + dy * dy
        if len == 0 { return hypot(p.x - a.x, p.y - a.y) }
        let t = max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
        let qx = a.x + t * dx, qy = a.y + t * dy
        return hypot(p.x - qx, p.y - qy)
    }
}

struct TripAddSheet: View {
    let tid: String
    let day: Int
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var trips = TripStore.shared
    @State private var router = TripRouter.shared
    @State private var q = ""
    @State private var filter: AddFilter?
    @State private var hits: [MapHit] = []
    @State private var searching = false
    @State private var near = RouteNear()
    @State private var dist: [String: Double] = [:]     // 收藏的店離路線幾公尺
    @State private var added: [String: String] = [:]    // 這次加的：收藏 id 或地點 id → 站 id（可以再按一次取消）
    @State private var saving: Set<String> = []         // 「♥ 收藏」存檔中
    @State private var cursor: Double?                  // 加在兩站中間時，上一個加的放在哪
    @FocusState private var typing: Bool
    let slot: AddSlot
    let seg: [String]?

    init(tid: String, day: Int, start: AddFilter? = .route, slot: AddSlot = .end, seg: [String]? = nil) {
        self.tid = tid; self.day = day; self.slot = slot; self.seg = seg
        _filter = State(initialValue: start)
    }

    var body: some View {
        let dayStops = trips.stops(tid, day: day)
        let mine = collection()
        let maps = mapHits(mine)
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    field
                    Button { dismiss() } label: {
                        Text("完成").font(.headline).foregroundStyle(Color.accentDeep)
                            .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(AddFilter.allCases) { f in
                            Chip(text: f.label, on: filter == f) {
                                Haptic.light()
                                withAnimation(.snappy) { filter = filter == f ? nil : f }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.horizontal, -16)
            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 8)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    if !mine.isEmpty {
                        header("你的收藏", count: mine.count)
                        ForEach(mine) { m in
                            placeRow(m.p, d: m.d, n: number(dayStops) { $0.place_id == m.p.id })
                        }
                    }
                    if !maps.isEmpty || searching {
                        header("地圖上的地點", count: maps.count, busy: searching).padding(.top, mine.isEmpty ? 0 : 10)
                        ForEach(maps) { h in
                            hitRow(h, n: number(dayStops) { s in added[h.id] == s.id })
                        }
                    }
                    if mine.isEmpty && maps.isEmpty && !searching { empty(dayStops) }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
                .animation(.snappy(duration: 0.25), value: mine.map(\.id))
                .animation(.snappy(duration: 0.25), value: maps.map(\.id))
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .background(Color.bg)
        .safeAreaInset(edge: .bottom, spacing: 0) { bar(dayStops.count) }
        .task(id: routeKey(dayStops)) { measure(dayStops) }
        .task(id: "\(q)|\(filter?.rawValue ?? "")|\(near.center?.latitude ?? 0)") { await search() }
        .onAppear { typing = true; Perf.shared.mark("打開加一站") }
        .task {
            try? await Task.sleep(for: .milliseconds(300))
            if !typing { typing = true }
        }
    }

    // 搜尋框（跟首頁同樣子，字 17pt，iPhone 點了不會放大）
    private var field: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("搜尋店名、景點、飯店", text: $q).font(.body).submitLabel(.search)
                .focused($typing)
                .autocorrectionDisabled()
            if !q.isEmpty {
                Button { q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary).frame(width: 44, height: 44).contentShape(.rect) }
                    .accessibilityLabel("清除")
            }
        }
        .padding(.leading, 16).padding(.trailing, 6)
        .frame(height: 52)
        .candy(18)
    }

    // ----- 收藏 -----

    struct Near: Identifiable {
        let p: Place
        let d: Double?
        var id: String { p.id }
    }

    private func collection() -> [Near] {
        guard filter?.showsPlaces ?? true else { return [] }
        let text = q.trimmingCharacters(in: .whitespaces)
        var l = store.places
        if let cs = filter?.cats { l = l.filter { cs.contains($0.category ?? "") } }
        if !text.isEmpty { l = l.filter { hay($0).localizedStandardContains(text) } }
        // 沒打字：順路 = 離路線 400 公尺內；咖啡、甜點 = 路線附近 3 公里內
        if text.isEmpty {
            guard filter != nil, !near.isEmpty else { return [] }
            let limit: Double = filter == .route ? 400 : 3000
            l = l.filter { (dist[$0.id] ?? .infinity) <= limit }
        }
        let out = l.map { Near(p: $0, d: dist[$0.id]) }
        return Array(out.sorted { ($0.d ?? .infinity) < ($1.d ?? .infinity) }.prefix(40))
    }

    private func hay(_ p: Place) -> String {
        [p.name, p.branch ?? "", p.address ?? "", p.city ?? "", p.district ?? "", p.cuisine ?? "", (p.tags ?? []).joined(separator: " ")].joined(separator: " ")
    }

    // 收藏裡已經有的（同名、80 公尺內）就不在地圖那區重複列
    private func mapHits(_ mine: [Near]) -> [MapHit] {
        let ps = mine.map(\.p)
        return hits.filter { h in
            !ps.contains { p in
                guard let la = p.lat, let ln = p.lng else { return false }
                let d = CLLocation(latitude: la, longitude: ln).distance(from: CLLocation(latitude: h.coord.latitude, longitude: h.coord.longitude))
                return d < 80 && (p.name.localizedStandardContains(h.name) || h.name.localizedStandardContains(p.name))
            }
        }
    }

    // ----- 路線：這天每段的實際道路（還沒算好就用兩站直線） -----

    private func routeKey(_ ss: [TripStop]) -> String {
        let a = ss.map { "\($0.id)\($0.mode ?? "")" }.joined(separator: ",")
        return a + "|\(router.legs.count)|\(store.places.count)"
    }

    private func measure(_ all: [TripStop]) {
        let mode = TravelMode(rawValue: trips.trip(tid)?.mode ?? "walk") ?? .walk
        // 空檔推薦打開的：只看那兩站中間那段
        let ss = seg.map { ids in all.filter { ids.contains($0.id) } } ?? all
        let cs = ss.compactMap { s in s.coord.map { (s, $0) } }
        var lines: [[CLLocationCoordinate2D]] = []
        if cs.count == 1 { lines = [[cs[0].1]] }
        for i in cs.indices.dropFirst() {
            let a = cs[i - 1].1, b = cs[i].1
            let m = TravelMode(rawValue: cs[i].0.mode ?? mode.rawValue) ?? mode
            lines.append(router.leg(a, b, m).coords ?? [a, b])
        }
        // 這天還沒有站：用目前位置
        if lines.isEmpty, let h = store.here { lines = [[h.coordinate]] }
        let n = RouteNear(lines)
        var d: [String: Double] = [:]
        for p in store.places {
            guard let la = p.lat, let ln = p.lng, !n.isEmpty else { continue }
            d[p.id] = n.meters(CLLocationCoordinate2D(latitude: la, longitude: ln))
        }
        near = n
        dist = d
    }

    // ----- Apple 地圖：打字就搜（停 0.35 秒才問），沒打字但選了景點／住宿／咖啡／甜點就列附近的 -----

    private func search() async {
        let text = q.trimmingCharacters(in: .whitespaces)
        let center = near.center ?? store.here?.coordinate
        if text.isEmpty && (filter?.poi == nil || center == nil) {
            withAnimation(.snappy) { hits = []; searching = false }
            return
        }
        if !text.isEmpty { try? await Task.sleep(for: .seconds(0.35)) }
        guard !Task.isCancelled else { return }
        searching = true
        var items: [MKMapItem] = []
        do {
            if text.isEmpty, let cats = filter?.poi, let c = center {
                let r = MKLocalPointsOfInterestRequest(center: c, radius: min(max(near.radius, 1200), 8000))
                r.pointOfInterestFilter = MKPointOfInterestFilter(including: cats)
                items = try await MKLocalSearch(request: r).start().mapItems
            } else {
                let r = MKLocalSearch.Request()
                r.naturalLanguageQuery = text
                r.resultTypes = [.pointOfInterest, .address]
                if let c = center {
                    let span = min(max(near.radius * 2, 3000), 40000)
                    r.region = MKCoordinateRegion(center: c, latitudinalMeters: span, longitudinalMeters: span)
                    // 只要這個範圍裡的（不然 Apple 會照手機所在地找，人在國外會搜到國外的店）
                    r.regionPriority = .required
                }
                if let cats = filter?.poi { r.pointOfInterestFilter = MKPointOfInterestFilter(including: cats) }
                items = try await MKLocalSearch(request: r).start().mapItems
            }
        } catch {
            items = []
        }
        guard !Task.isCancelled else { return }
        var seen: Set<String> = []
        // 離路線（沒有站就離目前位置）太遠的不要：至少 30 公里，路線很長就放寬
        let limit = max(30_000, near.radius * 3)
        let list = items.map(MapHit.init).filter { seen.insert($0.id).inserted && far($0) <= limit }
        let sorted = list.sorted { far($0) < far($1) }
        withAnimation(.snappy(duration: 0.25)) { hits = Array(sorted.prefix(30)); searching = false }
    }

    // 離路線（沒有路線就離目前位置）幾公尺
    private func far(_ h: MapHit) -> Double {
        if !near.isEmpty { return near.meters(h.coord) }
        guard let me = store.here else { return 0 }
        return me.distance(from: CLLocation(latitude: h.coord.latitude, longitude: h.coord.longitude))
    }

    // ----- 加、取消 -----

    // 在這天第幾站（沒加就 nil）
    private func number(_ ss: [TripStop], _ match: (TripStop) -> Bool) -> Int? {
        ss.firstIndex(where: match).map { $0 + 1 }
    }

    private func add(_ s: TripStop, key: String) {
        Haptic.light()
        Perf.shared.mark("加一站")
        let x = placed(s)
        added[key] = x.id
        trips.insert(x, store: store)
    }

    // 依「加在哪」改 pos：兩站中間的一個接一個往後排；最前面的放在第一站前面
    private func placed(_ s: TripStop) -> TripStop {
        var x = s
        switch slot {
        case .end:
            break
        case .between(let a, let b):
            let lo = cursor ?? a
            x.pos = (lo + b) / 2
            cursor = x.pos
        case .first:
            x.pos = (trips.stops(tid, day: day).first?.pos ?? 1) - 1
        }
        return x
    }

    // 這次加的才能再按一次取消；本來就在行程裡的回行程頁左滑刪
    private func cancel(_ key: String) {
        guard let sid = added[key], let s = trips.stops.first(where: { $0.id == sid }) else { return }
        Haptic.light()
        added[key] = nil
        trips.remove(s, dropTrip: false, store: store)
    }

    private func togglePlace(_ p: Place, n: Int?) {
        if n == nil { add(trips.makeStop(tid, day: day, place: p), key: p.id) }
        else if added[p.id] != nil { cancel(p.id) }
        else { Haptic.light() }
    }

    private func toggleHit(_ h: MapHit, n: Int?) {
        if n == nil { add(trips.makeStop(tid, day: day, hit: h), key: h.id) } else { cancel(h.id) }
    }

    // 搜到的餐廳存進收藏：還沒加進行程就一起加，存好後這站改成收藏的店
    private func love(_ h: MapHit) {
        guard !saving.contains(h.id) else { return }
        Haptic.success()
        saving.insert(h.id)
        if added[h.id] == nil { add(trips.makeStop(tid, day: day, hit: h), key: h.id) }
        let sid = added[h.id]
        var p = Place(id: UUID().uuidString.lowercased(), name: h.name)
        p.address = h.address; p.city = h.city; p.district = h.district
        p.lat = h.coord.latitude; p.lng = h.coord.longitude
        p.category = h.category; p.status = "want"
        Task { [p] in
            if let np = await store.create(p), let sid {
                trips.attach(sid, place: np, store: store)
                added[np.id] = sid
            }
            saving.remove(h.id)
        }
    }

    // ----- 畫面 -----

    private func header(_ t: String, count: Int, busy: Bool = false) -> some View {
        HStack(spacing: 6) {
            Text(t).font(.system(size: 15, weight: .heavy)).foregroundStyle(Color.ink)
            Text("\(count)").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.4)).contentTransition(.numericText())
            if busy { ProgressView().controlSize(.mini) }
            Spacer()
        }
        .padding(.top, 4)
    }

    private func placeRow(_ p: Place, d: Double?, n: Int?) -> some View {
        HStack(spacing: 12) {
            PhotoView(place: p, px: 160).frame(width: 52, height: 52).clipShape(.rect(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 3) {
                Text(p.name + (p.branch?.isEmpty == false ? " \(p.branch!)" : "")).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                Text(placeMeta(p, d: d)).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
            }
            Spacer(minLength: 4)
            AddToggle(n: n, locked: n != nil && added[p.id] == nil) { togglePlace(p, n: n) }
        }
        .padding(10)
        .candy(18)
        .transition(.opacity)
    }

    private func placeMeta(_ p: Place, d: Double?) -> String {
        var s: [String] = []
        if let d, !near.isEmpty, d < 2000 { s.append(d < 60 ? "就在路上" : "離路線 \(max(1, Int((d / 75).rounded()))) 分") }
        s.append("\(p.cat.emoji) \(p.cuisine?.isEmpty == false ? p.cuisine! : p.cat.name)")
        if !p.area.isEmpty { s.append(p.area) }
        if let o = p.owner, o != store.me { s.append("\(store.name(o)) 的收藏") }
        return s.joined(separator: " · ")
    }

    private func hitRow(_ h: MapHit, n: Int?) -> some View {
        let sid: String? = added[h.id]
        let stop: TripStop? = sid.flatMap { x in trips.stops.first(where: { $0.id == x }) }
        let loved: Bool = stop?.isPlace ?? false
        return HStack(spacing: 12) {
            Image(systemName: POI.icon(h.poi, kind: h.stay ? "stay" : "spot")).font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                .frame(width: 34, height: 34).background(h.food ? Color.accent : TripColor.side, in: .circle)
            VStack(alignment: .leading, spacing: 3) {
                Text(h.name).font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
                Text(hitMeta(h)).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
            }
            Spacer(minLength: 4)
            if h.food && !loved {
                Button { love(h) } label: {
                    Group {
                        if saving.contains(h.id) { ProgressView().controlSize(.mini) } else { Text("♥ 收藏") }
                    }
                    .font(.system(size: 12.5, weight: .heavy)).foregroundStyle(Color.sprPink)
                    .padding(.horizontal, 9).frame(height: 30)
                    .background(Color.sprPink.opacity(0.12), in: .capsule)
                    .frame(minHeight: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("存進收藏")
            }
            AddToggle(n: n, locked: false) { toggleHit(h, n: n) }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color.panel.opacity(0.7)))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color.ink.opacity(0.06)))
        .transition(.opacity)
    }

    private func hitMeta(_ h: MapHit) -> String {
        var s: [String] = []
        if let c = POI.name(h.poi) { s.append(c) }
        let d = far(h)
        if d > 0 { s.append((near.isEmpty ? "離你 " : "離路線 ") + fmtDistance(d)) }
        if s.isEmpty, let a = h.address { s.append(a) }
        return s.joined(separator: " · ")
    }

    @ViewBuilder private func empty(_ ss: [TripStop]) -> some View {
        VStack(spacing: 8) {
            Text(filter == .route && q.isEmpty ? "🧭" : "🔍").font(.system(size: 36))
            Text(emptyText(ss)).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.top, 50)
    }

    private func emptyText(_ ss: [TripStop]) -> String {
        if !q.isEmpty { return "找不到「\(q)」\n換個字試試看" }
        if filter == .route { return ss.isEmpty ? "打字搜尋店名、景點或飯店，\n或選上面的分類" : "路線附近 400 公尺內沒有你的收藏\n打字搜尋，或選上面的分類" }
        return "打字搜尋店名、景點或飯店"
    }

    // 底部深色條：「週六中山吃一圈・5 站」＋完成
    private func bar(_ n: Int) -> some View {
        let t = trips.trip(tid)
        let head = (t?.title ?? "行程") + ((t?.days ?? 1) > 1 ? "・第 \(day) 天" : "")
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(head).font(.system(size: 15, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
                Text("\(n) 站").font(.caption.weight(.bold)).foregroundStyle(.white.opacity(0.6))
                    .contentTransition(.numericText(value: Double(n)))
                    .animation(.snappy, value: n)
            }
            Spacer()
            Button { dismiss() } label: { Text("完成").frame(minWidth: 70) }
                .buttonStyle(ChunkyStyle())
        }
        .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 8)
        .background(Color.ink.ignoresSafeArea(edges: .bottom))
    }
}

// 每列右邊的 ＋：按了變綠色「✓ 第 N 站」，再按一次取消
private struct AddToggle: View {
    let n: Int?
    let locked: Bool
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 4) {
                Image(systemName: n == nil ? "plus" : "checkmark").font(.system(size: 14, weight: .heavy))
                if let n { Text("第 \(n) 站").font(.system(size: 13, weight: .heavy)).fixedSize() }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, n == nil ? 0 : 11)
            .frame(minWidth: 36, minHeight: 36)
            .background(n == nil ? Color.accent : Color.sprMint.opacity(locked ? 0.6 : 1), in: .capsule)
            .frame(minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: n)
        .accessibilityLabel(n.map { "已加，第 \($0) 站" } ?? "加進行程")
    }
}
