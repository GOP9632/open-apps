import SwiftUI
import UIKit
import MapKit

// 行程模式：首頁地圖的一個狀態，不是另一頁。
// 打開行程時同一張地圖、同一個鏡頭：上面換成行程的標題列、下面換成行程面板，地圖畫這天的路線和號碼，
// 其他收藏照樣在地圖上（縮小、變淡），點一根就問要不要加進來、插在哪裡最順

enum TripLevel { case low, mid, high }

// 正在看要不要加進行程的那間：收藏的店，或搜到的地點
struct TripCand: Equatable {
    var place: Place?
    var hit: MapHit?
    var id: String { place?.id ?? hit?.id ?? "" }
    var name: String { place.map { $0.name + ($0.branch?.isEmpty == false ? " \($0.branch!)" : "") } ?? hit?.name ?? "" }
    var coord: CLLocationCoordinate2D? {
        if let p = place, let la = p.lat, let ln = p.lng { return CLLocationCoordinate2D(latitude: la, longitude: ln) }
        return hit?.coord
    }
    static func == (a: TripCand, b: TripCand) -> Bool { a.id == b.id }
}

@MainActor @Observable final class TripMode {
    static let shared = TripMode()

    var tid: String?                 // 開著哪個行程；nil = 一般地圖
    var day = 1
    var level: TripLevel = .mid
    var going = false                // 出發中
    // 面板算好、地圖要畫的
    var segs: [TripSeg] = []
    var marks: [TripMark] = []
    var summary = ""                 // 「4 站・16:40 回」
    var panelH: CGFloat = 0          // 下面面板停好時的高度（訊息條貼在它上面）
    var hot: String?                 // 地圖上放大的那站（清單點了一下）
    var fly = 0                      // 要地圖飛到 hot 那站
    var fitTick = 0                  // 要地圖重新框住這天的站
    var expand: String?              // 打開時展開哪一站（店家頁「在行程裡」進來）
    var scrollTo: String?
    var overDay: Int?                // 拖一站到上面「第 N 天」
    var moving = false               // 正在拖一站：標題列下面露出「第 N 天」可以放
    var cand: TripCand?
    var preview: TripSeg?            // 加站卡：前一站 → 這間 → 後一站 的虛線
    var previewN: Int?               // 「新的第 3 站」
    // 搜尋（在同一張地圖上）
    var q = ""
    var filter: AddFilter?
    var finding = false              // 按了 🔍：標題列下面展開搜尋框＋分類（✕ 或點地圖收回）
    var typing = false
    var slot: AddSlot?               // 空檔推薦、選住宿當起點：加的位置固定
    var seg: [String]?               // 空檔推薦：順路只看那兩站中間
    var listing = false              // 「我的行程」sheet
    var deleting: Trip?              // 問「刪除行程？」（對話框放在地圖那層，按了馬上離開行程模式）
    var sharing = 0
    @ObservationIgnored var pickAt: CFTimeInterval = 0   // 剛點了地圖上的圖釘、號碼（點空白處要分得出來）
    @ObservationIgnored let geo = RowGeo()
    // 地圖框鏡頭用的那塊（螢幕座標的上下緣）。進出行程時地圖大小、邊距不變（變了整張地圖要重排，很卡），
    // 所以面板框站時要自己換算；0 = 還沒量到，就當成面板那塊
    @ObservationIgnored var mapTop: CGFloat = 0
    @ObservationIgnored var barBottom: CGFloat = 0     // 上面那排（膠囊、🔍、完成）的下緣，螢幕座標
    @ObservationIgnored var toScreen: ((CLLocationCoordinate2D) -> CGPoint?)?   // 地圖上的點在螢幕哪裡（MapTab 給的）
    @ObservationIgnored var afterFit: (() -> Bool)?    // 框地圖後，鏡頭停好時量一次、需要就修正（回傳有沒有修）
    @ObservationIgnored var mapBottom: CGFloat = 0
    let search = TripSearch()

    var on: Bool { tid != nil }
    var searchOn: Bool { finding || typing || !q.isEmpty || filter != nil }

    // 進行程模式：切到地圖分頁、回到地圖最上層，同一張地圖變成這個行程
    func open(_ id: String, focus f: String? = nil, store: Store) {
        Perf.shared.mark("進行程")
        let trips = TripStore.shared
        trips.lastOpened = id
        if !store.mapPath.isEmpty { store.mapPath = NavigationPath() }
        if store.tab != 0 { store.tab = 0 }
        let s = f.flatMap { x in trips.stops.first { $0.id == x } }
        clearSearch()
        cand = nil; hot = f; expand = f; scrollTo = f; moving = false
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
            if let s { day = s.day } else if tid != id { day = 1 }
            if tid != id { going = false }
            tid = id
            level = .mid
        }
        fitTick += 1
        if f != nil { fly += 1 }
    }

    // 右上「完成」：回一般地圖，鏡頭不動
    func close() {
        Haptic.light()
        Perf.shared.mark("離開行程")
        clearSearch()
        cand = nil; hot = nil; expand = nil; preview = nil; previewN = nil; moving = false
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
            tid = nil; going = false; segs = []; marks = []
        }
    }

    // 空檔推薦、搜尋飯店：直接打開搜尋並選好分類
    func startSearch(_ f: AddFilter?, slot s: AddSlot? = nil, seg g: [String]? = nil) {
        Haptic.light()
        cand = nil
        slot = s; seg = g
        withAnimation(.snappy) { finding = true; filter = f; level = .low }
    }

    // 收鍵盤（不靠 @FocusState，見 TripTop）
    func endTyping() {
        typing = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    func clearSearch() {
        if typing { endTyping() }
        q = ""; filter = nil; slot = nil; seg = nil; finding = false
        search.clear()
    }

    // 點地圖空白處：先收掉加站卡，再收掉搜尋
    func blank() {
        if cand != nil {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { cand = nil }
        } else if searchOn {
            // 跟搜尋框的 ✕ 一樣：收起搜尋、面板回到一半
            withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) { clearSearch(); level = .mid }
        }
    }

    // 地圖上的號碼或清單點一下：地圖飛到那站
    func tap(_ sid: String) {
        Haptic.light()
        hot = sid
        fly += 1
    }
}

// 插在哪最順：試插在每兩站中間（含最前、最後），用直線距離算多走多少，挑最少的
enum TripInsert {
    private static func d(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double {
        CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
    }

    // (插在 order 的第幾個前面 0…count, 多走幾公尺)
    static func best(_ order: [TripStop], _ c: CLLocationCoordinate2D) -> (at: Int, extra: Double) {
        let cs = order.map(\.coord)
        guard !order.isEmpty else { return (0, 0) }
        var best = (at: order.count, extra: Double.infinity)
        for i in 0...order.count {
            // 從住宿出發：不插在住宿前面
            if i == 0 && order.first?.kind == "stay" { continue }
            let a: CLLocationCoordinate2D? = i > 0 ? cs[i - 1] : nil
            let b: CLLocationCoordinate2D? = i < order.count ? cs[i] : nil
            let x: Double
            if let a, let b { x = d(a, c) + d(c, b) - d(a, b) }
            else if let a { x = d(a, c) }
            else if let b { x = d(c, b) }
            else { continue }
            if x < best.extra - 1 { best = (i, x) }
        }
        return best.extra == .infinity ? (order.count, 0) : best
    }

    // 插在第幾個前面時多走幾公尺（「加到最後」也要寫多走多少）
    static func extra(_ order: [TripStop], _ c: CLLocationCoordinate2D, at i: Int) -> Double {
        let a: CLLocationCoordinate2D? = i > 0 && i - 1 < order.count ? order[i - 1].coord : nil
        let b: CLLocationCoordinate2D? = i < order.count ? order[i].coord : nil
        if let a, let b { return max(0, d(a, c) + d(c, b) - d(a, b)) }
        if let a { return d(a, c) }
        if let b { return d(c, b) }
        return 0
    }

    // 插在第 i 個前面的 pos
    static func pos(_ order: [TripStop], at i: Int) -> Double {
        if order.isEmpty { return 1 }
        if i <= 0 { return order[0].pos - 1 }
        if i >= order.count { return order[order.count - 1].pos + 1 }
        return (order[i - 1].pos + order[i].pos) / 2
    }

    // 空檔推薦（兩站中間）、選住宿（最前面）：位置是固定的
    static func at(_ order: [TripStop], slot: AddSlot) -> Int {
        switch slot {
        case .end: return order.count
        case .first: return 0
        case .between(_, let b): return order.firstIndex { $0.pos >= b } ?? order.count
        }
    }

    static func minutes(_ m: Double, _ mode: TravelMode) -> Int { max(1, Int((m * 1.3 / mode.mPerMin).rounded())) }
}

// 行程的路線計算（面板、標題列、分享都用）
@MainActor enum TripMath {
    // 第一站是住宿：從住宿出發；不然目前位置離第一站 30 公里內才當起點
    static func origin(_ order: [TripStop], here: CLLocation?) -> CLLocationCoordinate2D? {
        if order.first?.kind == "stay" { return nil }
        guard let here, let f = order.first(where: { $0.coord != nil })?.coord else { return nil }
        return here.distance(from: CLLocation(latitude: f.latitude, longitude: f.longitude)) < 30_000 ? here.coordinate : nil
    }

    // 從 a 到 s 這段怎麼去：選過照選的，沒選過依距離（1.2 公里內走路，更遠開車）
    static func mode(_ t: Trip, _ s: TripStop, from a: CLLocationCoordinate2D?) -> TravelMode { .pick(t, s, from: a, to: s.coord) }

    // 一整天大概怎麼移動（排順序省幾分、加站順不順路用）：每段平均直線距離 1.2 公里內算走路
    static func dayMode(_ t: Trip, _ ss: [TripStop]) -> TravelMode {
        if t.mode != "walk", let m = TravelMode(rawValue: t.mode) { return m }
        let cs = ss.compactMap(\.coord)
        guard cs.count > 1 else { return .walk }
        let sum = zip(cs, cs.dropFirst()).map { CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: CLLocation(latitude: $1.latitude, longitude: $1.longitude)) }.reduce(0, +)
        return sum / Double(cs.count - 1) <= 1200 ? .walk : .drive
    }

    // legs[i] = 到第 i 站的那段（第 0 站從起點來）
    static func legs(_ t: Trip, _ order: [TripStop], origin: CLLocationCoordinate2D?, router: TripRouter) -> [Leg?] {
        order.enumerated().map { i, s in
            guard let b = s.coord else { return nil }
            let a: CLLocationCoordinate2D? = i == 0 ? origin : order[i - 1].coord
            guard let a else { return nil }
            return router.leg(a, b, i == 0 ? .pick(t, nil, from: a, to: b) : mode(t, s, from: a))
        }
    }

    // 一天結束回到哪：目前位置出發就回目前位置；從住宿出發就回住宿
    static func backTo(_ order: [TripStop], origin: CLLocationCoordinate2D?) -> CLLocationCoordinate2D? {
        if let origin { return origin }
        guard order.count > 1, let f = order.first, f.kind == "stay", order.last?.kind != "stay" else { return nil }
        return f.coord
    }

    static func backLeg(_ t: Trip, _ order: [TripStop], origin: CLLocationCoordinate2D?, router: TripRouter) -> Int? {
        guard let o = backTo(order, origin: origin), let l = order.last?.coord else { return nil }
        return router.leg(l, o, .pick(t, nil, from: l, to: o)).min
    }

    static func needs(_ t: Trip, _ base: [TripStop], origin: CLLocationCoordinate2D?) -> [(CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)] {
        var out: [(CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)] = []
        for (i, s) in base.enumerated() {
            guard let b = s.coord else { continue }
            if i == 0 { if let o = origin { out.append((o, b, .pick(t, nil, from: o, to: b))) } }
            else if let a = base[i - 1].coord { out.append((a, b, mode(t, s, from: a))) }
        }
        if let o = backTo(base, origin: origin), let l = base.last?.coord { out.append((l, o, .pick(t, nil, from: l, to: o))) }
        return out
    }

    static func plan(_ t: Trip, _ order: [TripStop], here: CLLocation?, router: TripRouter) -> DayPlan {
        let o = origin(order, here: here)
        let ls = legs(t, order, origin: o, router: router)
        return TripCalc.plan(order, legs: ls.map { $0?.min }, backLeg: backLeg(t, order, origin: o, router: router))
    }

    static func segs(_ order: [TripStop], origin: CLLocationCoordinate2D?, legs: [Leg?]) -> [TripSeg] {
        var out: [TripSeg] = []
        for (i, s) in order.enumerated() {
            guard let b = s.coord else { continue }
            let a: CLLocationCoordinate2D? = i == 0 ? origin : order[i - 1].coord
            guard let a else { continue }
            let line = legs[i]?.coords
            out.append(TripSeg(id: (i == 0 ? "o" : order[i - 1].id) + ">" + s.id, coords: line ?? [a, b], color: TripColor.of(i), routed: line != nil, faded: s.done_at != nil))
        }
        return out
    }

    static func marks(_ order: [TripStop]) -> [TripMark] {
        order.enumerated().compactMap { i, s in
            guard let c = s.coord else { return nil }
            return TripMark(id: s.id, n: i + 1, coord: c, color: TripColor.of(i), place: s.isPlace, icon: POI.icon(s.poi, kind: s.kind), done: s.done_at != nil)
        }
    }

    // 「4 站・16:40 回」
    static func summary(_ order: [TripStop], plan: DayPlan) -> String {
        guard !order.isEmpty else { return "還沒有站" }
        var p = ["\(order.count) 站"]
        if let b = plan.back { p.append("\(TripDate.clockDay(b)) 回") }
        else if let l = plan.rows.last { p.append("\(TripDate.clockDay(l.leave)) 結束") }
        return p.joined(separator: "・")
    }
}

// 行程模式的搜尋：收藏（含群組分享的）＋ Apple 地圖的地點；結果同時畫在地圖上
@MainActor @Observable final class TripSearch {
    var hits: [MapHit] = []
    var found: [Place] = []           // 符合的收藏（搜尋結果和地圖上的圖釘共用）
    var busy = false
    private(set) var near = RouteNear()
    private(set) var dist: [String: Double] = [:]     // 收藏的店離路線幾公尺

    func clear() { if !hits.isEmpty { hits = [] }; if !found.isEmpty { found = [] }; busy = false }

    // 這天的路線（還沒算好就用兩站直線）；空檔推薦只看那兩站中間
    func measure(_ all: [TripStop], seg: [String]?, mode: TravelMode, store: Store) {
        let router = TripRouter.shared
        let ss = seg.map { ids in all.filter { ids.contains($0.id) } } ?? all
        let cs = ss.compactMap { s in s.coord.map { (s, $0) } }
        var lines: [[CLLocationCoordinate2D]] = []
        if cs.count == 1 { lines = [[cs[0].1]] }
        for i in cs.indices.dropFirst() {
            let a = cs[i - 1].1, b = cs[i].1
            // 跟行程面板同一套規則：選過照選的，行程預設不是走路就照行程，其他依距離
            let m = cs[i].0.mode.flatMap { TravelMode(rawValue: $0) } ?? (mode != .walk ? mode : .auto(a, b))
            lines.append(router.leg(a, b, m).coords ?? [a, b])
        }
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

    private func hay(_ p: Place) -> String {
        [p.name, p.branch ?? "", p.address ?? "", p.city ?? "", p.district ?? "", p.cuisine ?? "", (p.tags ?? []).joined(separator: " ")].joined(separator: " ")
    }

    // 符合的收藏（有座標的），離路線近的先
    func places(_ q: String, _ filter: AddFilter?, store: Store) -> [Place] {
        guard filter?.showsPlaces ?? true else { return [] }
        let text = q.trimmingCharacters(in: .whitespaces)
        var l = store.places.filter { $0.lat != nil && $0.lng != nil }
        if let cs = filter?.cats { l = l.filter { cs.contains($0.category ?? "") } }
        if !text.isEmpty { l = l.filter { hay($0).localizedStandardContains(text) } }
        // 沒打字：順路 = 離路線 400 公尺內；咖啡、甜點 = 路線附近 3 公里內
        if text.isEmpty {
            guard filter != nil, !near.isEmpty else { return [] }
            let limit: Double = filter == .route ? 400 : 3000
            l = l.filter { (dist[$0.id] ?? .infinity) <= limit }
        }
        return Array(merged(l.sorted { (dist[$0.id] ?? .infinity) < (dist[$1.id] ?? .infinity) }, store: store).prefix(40))
    }

    func meters(_ p: Place) -> Double? { dist[p.id] }

    // 同一間店好幾個人都收了（名字一樣、300 公尺內）：只列一列，留自己收的那筆，記下還有誰收
    private(set) var also: [String: [String]] = [:]   // 留下那筆的 id → 其他收的人

    private func merged(_ ps: [Place], store: Store) -> [Place] {
        var kept: [Place] = []
        var more: [String: [String]] = [:]
        for p in ps {
            let n = Self.norm(p.name)
            let i = kept.firstIndex { k in
                guard let a = k.lat, let b = k.lng, let c = p.lat, let d = p.lng, Self.norm(k.name) == n, !n.isEmpty else { return false }
                return CLLocation(latitude: a, longitude: b).distance(from: CLLocation(latitude: c, longitude: d)) < 300
            }
            guard let i else { kept.append(p); continue }
            var drop = p
            if store.isMine(p) && !store.isMine(kept[i]) {
                drop = kept[i]
                more[p.id] = more.removeValue(forKey: drop.id) ?? []
                kept[i] = p
            }
            if let o = drop.owner { more[kept[i].id, default: []].append(o) }
        }
        if more != also { also = more }
        return kept
    }

    // 收藏裡已經有的（名字一樣或互相包含，不管大小寫、重音、空白；300 公尺內）不再畫成地圖地點
    func mapHits(_ ps: [Place]) -> [MapHit] {
        let mine = ps.compactMap { p -> (String, CLLocation)? in
            guard let la = p.lat, let ln = p.lng else { return nil }
            return (Self.norm(p.name), CLLocation(latitude: la, longitude: ln))
        }
        return hits.filter { h in
            let n = Self.norm(h.name)
            let c = CLLocation(latitude: h.coord.latitude, longitude: h.coord.longitude)
            return !mine.contains { m in
                !n.isEmpty && !m.0.isEmpty && (m.0.contains(n) || n.contains(m.0)) && m.1.distance(from: c) < 300
            }
        }
    }

    // 「Le Park Café」=「le park cafe」、「臺北」=「台北」：比對店名用
    static func norm(_ s: String) -> String {
        s.replacingOccurrences(of: "臺", with: "台").folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
            .unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(String.init).joined()
    }

    // 離路線（沒有路線就離目前位置）幾公尺
    func far(_ h: MapHit, here: CLLocation?) -> Double {
        if !near.isEmpty { return near.meters(h.coord) }
        let ref = here ?? viewCenter.map { CLLocation(latitude: $0.latitude, longitude: $0.longitude) }
        guard let ref else { return 0 }
        return ref.distance(from: CLLocation(latitude: h.coord.latitude, longitude: h.coord.longitude))
    }

    // 這天還沒有站、也沒有定位：用地圖現在看的地方當搜尋中心（不然會搜到全台灣）
    @ObservationIgnored private var viewCenter: CLLocationCoordinate2D?
    @ObservationIgnored private var poiCache: [String: [MKMapItem]] = [:]   // 長路線分段找過的類別

    // Apple 地圖：打字就搜（停 0.35 秒才問），沒打字但選了景點／住宿／咖啡／甜點就列路線附近的
    func run(_ q: String, _ filter: AddFilter?, here: CLLocation?, view: MKCoordinateRegion?) async {
        let text = q.trimmingCharacters(in: .whitespaces)
        viewCenter = view?.center
        let center = near.center ?? here?.coordinate ?? view?.center
        if text.isEmpty && (filter?.poi == nil || center == nil) {
            withAnimation(.snappy) { hits = []; busy = false }
            return
        }
        if !text.isEmpty { try? await Task.sleep(for: .seconds(0.35)) }
        guard !Task.isCancelled else { return }
        busy = true
        // 同時不限範圍再找一次（「台北101」「協同街80號」在路線範圍外也找得到；像門牌的另外用地址查）
        async let wideItems = wide(text, filter: filter, near: center)
        var items: [MKMapItem] = []
        do {
            if text.isEmpty, let cats = filter?.poi, near.radius > 8000 {
                // 長路線（雲林到台北）：只找中間點 8 公里內常常是空的；沿路平均取幾個點分頭找。
                // Apple 每分鐘只讓 app 查 50 次：最多 5 個點，同一條路線同一類找過就直接用上次的
                let ck = "\(filter?.rawValue ?? "")|\(near.center?.latitude ?? 0),\(near.center?.longitude ?? 0)|\(Int(near.length))"
                if let hit = poiCache[ck] { items = hit } else {
                    let n = min(5, max(2, Int(near.length / 15_000) + 1))
                    let spacing = near.length / Double(n - 1)
                    items = await Self.pois(cats, at: near.samples(n), radius: min(10_000, max(4000, spacing / 2 + 1000)))
                    if !items.isEmpty {
                        if poiCache.count > 12 { poiCache.removeAll() }
                        poiCache[ck] = items
                    }
                }
            } else if text.isEmpty, let cats = filter?.poi, let c = center {
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
        let extra = await wideItems
        guard !Task.isCancelled else { return }
        var seen: Set<String> = []
        let limit = max(30_000, near.radius * 3)
        // 名字對得上打的字（或是門牌）排前面，再照遠近；範圍外的只留名字對得上的
        let key = Self.norm(text)
        let addr = Self.isAddress(text)
        let match = { (h: MapHit) in !key.isEmpty && (Self.norm(h.name).contains(key) || (addr && h.poi == nil)) }
        // 名字完全一樣排最前，其次開頭一樣（「台北101」要排在「台北101時尚婚紗館」前面），再來是名字裡有
        let tier = { (h: MapHit) -> Int in
            guard match(h) else { return 3 }
            let n = Self.norm(h.name)
            return n == key ? 0 : n.hasPrefix(key) ? 1 : 2
        }
        let list = items.map(MapHit.init).filter { seen.insert($0.id).inserted && far($0, here: here) <= limit }
        let more = extra.map(MapHit.init).filter { seen.insert($0.id).inserted && (far($0, here: here) <= limit || (match($0) && far($0, here: here) <= 400_000)) }
        let ranked = (list + more).map { (h: $0, m: tier($0), d: far($0, here: here)) }
            .sorted { ($0.m, $0.d) < ($1.m, $1.d) }.map { $0.h }
        // 同一間店 Apple 有時給兩筆（座標差一點點）：同名、150 公尺內只留一筆
        var kept: [MapHit] = []
        for h in ranked {
            let c = CLLocation(latitude: h.coord.latitude, longitude: h.coord.longitude)
            if kept.contains(where: { $0.name == h.name && c.distance(from: CLLocation(latitude: $0.coord.latitude, longitude: $0.coord.longitude)) < 150 }) { continue }
            kept.append(h)
        }
        let sorted = kept
        withAnimation(.snappy(duration: 0.25)) { hits = Array(sorted.prefix(20)); busy = false }
    }

    // 門牌：路名＋號、巷、弄、段，或「80 Main St」
    static func isAddress(_ s: String) -> Bool {
        s.rangeOfCharacter(from: .decimalDigits) != nil
            && s.range(of: "[路街段巷弄號号]|大道|^\\d+\\s+\\p{L}", options: .regularExpression) != nil
    }

    // 上面那次只要路線附近的（不然人在國外會搜到國外的店），所以範圍外的地標、門牌會被濾掉；
    // 這次範圍只當參考。像門牌的另外用地址查詢（geocoder）和只找地址的搜尋各查一次
    private func wide(_ text: String, filter: AddFilter?, near c: CLLocationCoordinate2D?) async -> [MKMapItem] {
        guard !text.isEmpty else { return [] }
        let addr = filter?.poi == nil && Self.isAddress(text)
        async let geo = Self.geocode(addr ? text : "", near: c)
        let r = MKLocalSearch.Request()
        r.naturalLanguageQuery = text
        r.resultTypes = addr ? .address : [.pointOfInterest, .address]
        if let c { r.region = MKCoordinateRegion(center: c, latitudinalMeters: 60_000, longitudinalMeters: 60_000) }
        if let cats = filter?.poi { r.pointOfInterestFilter = MKPointOfInterestFilter(including: cats) }
        var found = (try? await MKLocalSearch(request: r).start().mapItems) ?? []
        if addr, found.isEmpty {
            r.resultTypes = [.pointOfInterest, .address]
            found = (try? await MKLocalSearch(request: r).start().mapItems) ?? []
        }
        let pms = await geo
        return pms.filter { $0.location != nil }.map { MKMapItem(placemark: MKPlacemark(placemark: $0)) } + found
    }

    // 好幾個點同時找某幾類地點，合在一起（找不到的點就算了）
    private nonisolated static func pois(_ cats: [MKPointOfInterestCategory], at cs: [CLLocationCoordinate2D], radius: Double) async -> [MKMapItem] {
        await withTaskGroup(of: [MKMapItem].self) { g in
            for c in cs {
                g.addTask {
                    let r = MKLocalPointsOfInterestRequest(center: c, radius: radius)
                    r.pointOfInterestFilter = MKPointOfInterestFilter(including: cats)
                    return (try? await MKLocalSearch(request: r).start().mapItems) ?? []
                }
            }
            var all: [MKMapItem] = []
            for await l in g { all += l }
            return all
        }
    }

    private nonisolated static func geocode(_ text: String, near c: CLLocationCoordinate2D?) async -> [CLPlacemark] {
        guard !text.isEmpty else { return [] }
        let hint = c.map { CLCircularRegion(center: $0, radius: 50_000, identifier: "trip") }
        return (try? await CLGeocoder().geocodeAddressString(text, in: hint, preferredLocale: Locale(identifier: "zh_TW"))) ?? []
    }
}
