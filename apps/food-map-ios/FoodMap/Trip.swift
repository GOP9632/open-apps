import SwiftUI
import Observation
import CoreLocation
import MapKit

// 路線規劃：行程存雲端（food.trips、food.trip_stops），可以掛在群組上大家一起排
// 美食是主角：收藏的店有照片和彩色號碼；景點（spot）、住宿（stay）只是配角，只存在行程裡

struct Trip: Codable, Identifiable, Hashable {
    let id: String
    var owner: String?
    var group_id: String?
    var title: String
    var start_date: String?      // yyyy-MM-dd，沒排日期是 nil
    var days: Int
    var mode: String             // walk / drive / transit：新加的站預設怎麼過去
    var created_at: String?
    var updated_at: String?

    var start: Date? { TripDate.date(start_date) }
    var end: Date? { start.map { TripDate.add($0, days - 1) } }
    func date(of day: Int) -> Date? { start.map { TripDate.add($0, day - 1) } }
}

struct TripStop: Codable, Identifiable, Hashable {
    let id: String
    var trip_id: String
    var day: Int
    var pos: Double
    var kind: String             // place 收藏的店 / spot 景點活動 / stay 住宿
    var place_id: String?
    var name: String
    var address: String?
    var lat: Double?
    var lng: Double?
    var poi: String?             // Apple 的 MKPointOfInterestCategory，拿來挑小圖示
    var stay_min: Int
    var mode: String?            // 從上一站怎麼來；nil = 用行程預設
    var fixed_time: String?      // HH:mm:ss，固定幾點到
    var done_at: String?
    var added_by: String?
    var created_at: String?
    var updated_at: String?

    var isPlace: Bool { kind == "place" }
    var coord: CLLocationCoordinate2D? { lat.flatMap { la in lng.map { CLLocationCoordinate2D(latitude: la, longitude: $0) } } }
    // 固定時間換成一天的第幾分鐘
    var fixedMin: Int? { fixed_time.flatMap(TripDate.minutes) }
}

// 推頁用：我的行程、某個行程（focus = 打開時捲到哪一站）
enum TripRoute: Hashable {
    case list
    case trip(String, focus: String?)
}

extension View {
    // 三個分頁的導覽都要認得行程的頁面（店家頁的「✓ 在行程裡」在哪個分頁都會推）
    func tripDestinations() -> some View {
        navigationDestination(for: TripRoute.self) { r in
            switch r {
            case .list: TripsList()
            case .trip(let id, let focus): TripPage(tid: id, focus: focus)
            }
        }
    }
}

enum TravelMode: String, CaseIterable {
    case walk, drive, transit
    var icon: String { self == .walk ? "figure.walk" : self == .drive ? "car.fill" : "tram.fill" }
    var emoji: String { self == .walk ? "🚶" : self == .drive ? "🚗" : "🚇" }
    var verb: String { self == .walk ? "走路" : self == .drive ? "開車" : "捷運" }
    // 算不出路線時的直線估計速度（每分鐘幾公尺）
    var mPerMin: Double { self == .walk ? 75 : self == .drive ? 500 : 300 }
}

// 每站的顏色：依順序輪流用糖粒色（號碼、路線都用這個）
enum TripColor {
    static let list: [Color] = [.accent, .sprMint, .sprBlue, .sprPink, .sprPurple, Color(hex: 0xe8a200)]
    static func of(_ i: Int) -> Color { list[((i % list.count) + list.count) % list.count] }
    static let side = Color(hex: 0x9a8a7a)
}

// 景點類別 → 小圖示和中文
enum POI {
    static func icon(_ raw: String?, kind: String) -> String {
        if kind == "stay" { return "bed.double.fill" }
        let r = (raw ?? "").lowercased()
        let table: [(String, String)] = [
            ("museum", "building.columns.fill"), ("hotel", "bed.double.fill"), ("park", "tree.fill"), ("beach", "beach.umbrella.fill"),
            ("theater", "theatermasks.fill"), ("movie", "film.fill"), ("store", "bag.fill"), ("library", "books.vertical.fill"),
            ("zoo", "pawprint.fill"), ("aquarium", "fish.fill"), ("stadium", "sportscourt.fill"), ("amusement", "ferriswheel"),
            ("nightlife", "music.note"), ("cafe", "cup.and.saucer.fill"), ("bakery", "birthday.cake.fill"), ("restaurant", "fork.knife"),
            ("airport", "airplane"), ("train", "tram.fill"), ("transit", "tram.fill"), ("parking", "parkingsign"), ("landmark", "building.columns.fill"),
            ("campground", "tent.fill"), ("marina", "sailboat.fill"), ("nationalpark", "mountain.2.fill"), ("winery", "wineglass.fill"),
        ]
        return table.first { r.contains($0.0) }?.1 ?? "mappin"
    }
    static func label(_ s: TripStop) -> String { s.kind == "stay" ? "住宿" : "其他行程" }
    // 搜尋結果上的類別小字（Apple 給的是英文代號）
    static func name(_ raw: String?) -> String? {
        let r = (raw ?? "").lowercased()
        guard !r.isEmpty else { return nil }
        let table: [(String, String)] = [
            ("nationalpark", "國家公園"), ("amusement", "遊樂園"), ("museum", "博物館"), ("hotel", "住宿"), ("park", "公園"), ("beach", "海灘"),
            ("theater", "劇場"), ("movie", "電影院"), ("library", "圖書館"), ("zoo", "動物園"), ("aquarium", "水族館"), ("stadium", "體育場"),
            ("nightlife", "夜生活"), ("cafe", "咖啡廳"), ("bakery", "麵包甜點"), ("restaurant", "餐廳"), ("foodmarket", "市場"), ("brewery", "酒吧"),
            ("winery", "酒莊"), ("store", "商店"), ("airport", "機場"), ("train", "車站"), ("transit", "車站"), ("parking", "停車場"),
            ("marina", "碼頭"), ("campground", "露營地"), ("university", "學校"), ("school", "學校"), ("hospital", "醫院"),
        ]
        return table.first { r.contains($0.0) }?.1
    }
}

enum TripDate {
    private static let fmt: DateFormatter = {
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f
    }()
    static let week = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"]
    static func date(_ s: String?) -> Date? { s.flatMap { fmt.date(from: String($0.prefix(10))) } }
    static func string(_ d: Date) -> String { fmt.string(from: d) }
    static func add(_ d: Date, _ n: Int) -> Date { Calendar.current.date(byAdding: .day, value: n, to: d) ?? d }
    static func weekday(_ d: Date) -> String { week[Calendar.current.component(.weekday, from: d) - 1] }
    // 9/20 週六
    static func label(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.month, .day], from: d)
        return "\(c.month ?? 0)/\(c.day ?? 0) \(weekday(d))"
    }
    static func short(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.month, .day], from: d)
        return "\(c.month ?? 0)/\(c.day ?? 0)"
    }
    static var today: Date { Calendar.current.startOfDay(for: Date()) }
    // "14:00:00" → 840
    static func minutes(_ s: String) -> Int? {
        let p = s.split(separator: ":")
        guard p.count >= 2, let h = Int(p[0]), let m = Int(p[1]) else { return nil }
        return h * 60 + m
    }
    static func time(_ m: Int) -> String { String(format: "%02d:%02d:00", (m / 60) % 24, m % 60) }
    // 一天的第幾分鐘 → 12:05
    static func clock(_ m: Int) -> String { String(format: "%d:%02d", ((m / 60) % 24 + 24) % 24, ((m % 60) + 60) % 60) }
    // 95 → 1 小時 35 分
    static func span(_ m: Int) -> String {
        if m < 60 { return "\(max(m, 1)) 分" }
        return m % 60 == 0 ? "\(m / 60) 小時" : "\(m / 60) 小時 \(m % 60) 分"
    }
    static func stay(_ m: Int) -> String {
        if m == 0 { return "路過" }
        if m % 60 == 0 { return "停留 \(m / 60) 小時" }
        if m > 60 && m % 30 == 0 { return "停留 \(m / 60).5 小時" }
        return "停留 \(span(m))"
    }
}

// 一天的時間表：全部在 App 端算，不存
struct DayPlan {
    struct Row { var arrive: Int; var leave: Int; var late: Int; var wait = 0 }   // wait：早到要等幾分（下一站有固定時間）
    var rows: [Row] = []
    var depart: Int = 600       // 從起點出發
    var back: Int?              // 回到起點
}

enum TripCalc {
    // legs[i] = 第 i 站「從前一站過來」要幾分鐘（legs[0] = 從起點到第一站，沒有起點就是 nil）
    static func plan(_ stops: [TripStop], legs: [Int?], backLeg: Int?) -> DayPlan {
        var p = DayPlan()
        guard let first = stops.first else { return p }
        let firstArrive = first.fixedMin ?? 600
        p.depart = firstArrive - (legs.first.flatMap { $0 } ?? 0)
        var t = firstArrive
        for (i, s) in stops.enumerated() {
            var arrive = t
            if i > 0 { arrive = t + (legs[i] ?? 0) }
            var late = 0, wait = 0
            // 固定時間的站：早到就等到那個時間；會遲到就照算出來的時間，標紅「會晚 N 分」
            if let f = s.fixedMin, i > 0 {
                late = max(0, arrive - f)
                if late == 0 { wait = f - arrive; arrive = f }
            }
            let leave = arrive + s.stay_min
            p.rows.append(.init(arrive: arrive, leave: leave, late: late, wait: wait))
            t = leave
        }
        if let b = backLeg { p.back = t + b }
        return p
    }
}

// 幫我排順序：同一天、沒有固定時間的站重排；起點、住宿、有固定時間的站不動
// 用直線距離：先最近的先去，再用 2-opt 把交叉的路解開（12 站以內，幾毫秒算完）
enum TripSort {
    static let maxStops = 12

    static func movable(_ s: TripStop) -> Bool { s.fixedMin == nil && s.coord != nil && s.kind != "stay" }

    // 新順序＋省下幾分；沒得排回 nil
    static func best(_ stops: [TripStop], origin: CLLocationCoordinate2D?, mode: TravelMode) -> (order: [TripStop], saved: Int)? {
        var slots: [Int] = []
        for (i, s) in stops.enumerated() where movable(s) && !(origin == nil && i == 0) { slots.append(i) }
        guard slots.count >= 2, slots.count <= maxStops else { return nil }

        func d(_ a: CLLocationCoordinate2D?, _ b: CLLocationCoordinate2D?) -> Double {
            guard let a, let b else { return 0 }
            return CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
        }
        func cost(_ seq: [TripStop]) -> Double {
            var total = 0.0
            var prev = origin
            for s in seq {
                guard let c = s.coord else { continue }
                total += d(prev, c)
                prev = c
            }
            return total
        }
        func build(_ perm: [Int]) -> [TripStop] {
            var seq = stops
            for (k, slot) in slots.enumerated() { seq[slot] = stops[perm[k]] }
            return seq
        }

        // 最近的先去
        var left = slots
        var perm: [Int] = []
        var seq = stops
        for slot in slots {
            let before = seq[..<slot].last { $0.coord != nil }
            let from: CLLocationCoordinate2D? = before?.coord ?? origin
            var pick = left[0]
            var near = Double.infinity
            for j in left {
                let x = d(from, stops[j].coord)
                if x < near { near = x; pick = j }
            }
            perm.append(pick)
            left.removeAll { $0 == pick }
            seq[slot] = stops[pick]
        }

        // 2-opt：把一段倒過來比較短就換
        var best = cost(build(perm))
        var better = true
        var rounds = 0
        while better && rounds < 60 {
            better = false
            rounds += 1
            for i in 0..<(perm.count - 1) {
                for j in (i + 1)..<perm.count {
                    var c = perm
                    c[i...j].reverse()
                    let x = cost(build(c))
                    if x < best - 1 { best = x; perm = c; better = true }
                }
            }
        }
        let old = cost(stops)
        let saved = Int(((old - best) * 1.3 / mode.mPerMin).rounded())
        return (build(perm), saved)
    }
}

// ----- 資料：打開「行程」或按「加進行程」才讀，之後快取在手機 -----

@MainActor @Observable final class TripStore {
    static let shared = TripStore()

    private(set) var trips: [Trip] = []
    private(set) var stops: [TripStop] = []
    var loaded = false
    // 剛加進行程的那一站：點訊息條可以換到別的行程
    var picking: PickReq?
    struct PickReq: Identifiable { let id: String }

    // 正在存的筆數；存檔中讀回來的舊資料不能蓋掉剛改的
    @ObservationIgnored private var inflight = 0
    @ObservationIgnored private var rev = 0
    // 刪掉但還能復原（4 秒後才真的刪）
    @ObservationIgnored private var hiddenTrips: Set<String> = []
    @ObservationIgnored private var hiddenStops: Set<String> = []
    @ObservationIgnored private var loading: Task<Void, Never>?
    // 最近打開的行程（「加進行程」預設加到這個）
    @ObservationIgnored var lastOpened: String? = UserDefaults.standard.string(forKey: "tripLast") {
        didSet { UserDefaults.standard.set(lastOpened, forKey: "tripLast") }
    }

    private struct Cache: Codable { var trips: [Trip]; var stops: [TripStop] }
    private var cacheFile: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("trips.json") }

    init() {
        if let d = try? Data(contentsOf: cacheFile), let c = try? JSONDecoder().decode(Cache.self, from: d) { trips = c.trips; stops = c.stops }
    }

    func reset() {
        trips = []; stops = []; loaded = false; picking = nil
        hiddenTrips = []; hiddenStops = []; lastOpened = nil
        try? FileManager.default.removeItem(at: cacheFile)
    }

    private func saveCache() {
        let c = Cache(trips: trips, stops: stops)
        let f = cacheFile
        DispatchQueue.global(qos: .utility).async { try? JSONEncoder().encode(c).write(to: f, options: .atomic) }
    }

    // ----- 讀 -----

    func trip(_ id: String) -> Trip? { trips.first { $0.id == id } }
    func stops(_ tid: String) -> [TripStop] { stops.filter { $0.trip_id == tid } }
    func stops(_ tid: String, day: Int) -> [TripStop] { stops.filter { $0.trip_id == tid && $0.day == day }.sorted { $0.pos < $1.pos } }

    // 進行中：今天的行程 → 最近打開的（還沒過期）→ 最近改過的（還沒過期）
    var active: Trip? {
        let today = TripDate.today
        if let t = trips.first(where: { t in t.start.map { $0 <= today && (t.end ?? $0) >= today } ?? false }) { return t }
        func live(_ t: Trip) -> Bool { (t.end ?? .distantFuture) >= today }
        if let id = lastOpened, let t = trip(id), live(t) { return t }
        return trips.filter(live).max { ($0.updated_at ?? "") < ($1.updated_at ?? "") }
    }

    // 這間店在哪個行程裡（還沒過期的優先）
    func stopOf(place pid: String) -> TripStop? {
        let today = TripDate.today
        let hits = stops.filter { $0.place_id == pid }
        return hits.first { s in trip(s.trip_id).map { ($0.end ?? .distantFuture) >= today } ?? false }
    }

    func load() async {
        if let t = loading { return await t.value }
        let t = Task { await loadNow() }
        loading = t
        await t.value
        loading = nil
    }

    private func loadNow() async {
        guard Supa.session != nil else { return }
        struct All: Decodable { var trips: [Trip]?; var stops: [TripStop]? }
        let r = rev
        do {
            let a = try await Supa.rpc("load_trips", [:], as: All.self)
            // 讀的途中自己又改了東西，這份是舊的，丟掉（存完會再讀一次）
            guard r == rev, inflight == 0, Supa.session != nil else { return }
            let nt = (a.trips ?? []).filter { !hiddenTrips.contains($0.id) }
            let ns = (a.stops ?? []).filter { !hiddenStops.contains($0.id) && !hiddenTrips.contains($0.trip_id) }
            // 沒變就不重設，畫面不重畫；朋友新加的站淡入
            if nt != trips || ns != stops {
                withAnimation(.easeOut(duration: 0.3)) {
                    if nt != trips { trips = nt }
                    if ns != stops { stops = ns }
                }
                saveCache()
            }
            loaded = true
        } catch {
            print("[trips] load_trips 失敗：\(error)")
        }
    }

    // ----- 寫：畫面先變，背景存，失敗改回來並說一聲 -----

    private func send(_ store: Store?, _ fail: String, undo: @escaping () -> Void, _ op: @escaping () async throws -> Void) {
        inflight += 1; rev += 1
        saveCache()
        Task {
            do { try await op() }
            catch {
                withAnimation(.snappy) { undo() }
                store?.say(fail + error.localizedDescription)
            }
            inflight -= 1
            saveCache()
            if inflight == 0 { await load() }
        }
    }

    @discardableResult
    func create(title: String, date: Date?, group: String?, store: Store?) -> Trip {
        let t = Trip(id: UUID().uuidString.lowercased(), owner: store?.me, group_id: group, title: title, start_date: date.map(TripDate.string),
                     days: 1, mode: "walk", created_at: nil, updated_at: ISO8601DateFormatter().string(from: Date()))
        withAnimation(.snappy) { trips.insert(t, at: 0) }
        lastOpened = t.id
        let body: [String: AnyCodable] = ["id": .s(t.id), "title": .s(t.title), "start_date": opt(t.start_date), "days": .i(1), "mode": .s("walk"), "group_id": opt(group)]
        send(store, "行程沒建好：", undo: { self.trips.removeAll { $0.id == t.id }; self.stops.removeAll { $0.trip_id == t.id } }) {
            try await Supa.write("POST", "trips", body: body)
        }
        return t
    }

    func update(_ t: Trip, store: Store?) {
        guard let i = trips.firstIndex(where: { $0.id == t.id }) else { return }
        let old = trips[i]
        var n = t; n.updated_at = ISO8601DateFormatter().string(from: Date())
        trips[i] = n
        let body: [String: AnyCodable] = ["title": .s(t.title), "start_date": opt(t.start_date), "days": .i(t.days), "mode": .s(t.mode), "group_id": opt(t.group_id)]
        send(store, "沒存到：", undo: { if let j = self.trips.firstIndex(where: { $0.id == t.id }) { self.trips[j] = old } }) {
            try await Supa.write("PATCH", "trips", query: "id=eq.\(t.id)", body: body)
        }
    }

    // 刪整個行程：先從畫面拿掉，4 秒內可以復原
    func deleteWithUndo(_ t: Trip, store: Store) {
        let at = trips.firstIndex { $0.id == t.id } ?? 0
        let ss = stops(t.id)
        hiddenTrips.insert(t.id); rev += 1
        withAnimation(.snappy(duration: 0.35)) {
            trips.removeAll { $0.id == t.id }
            stops.removeAll { $0.trip_id == t.id }
        }
        saveCache()
        store.say("已刪除「\(t.title)」", icon: .trash, action: ("復原", { [weak self] in
            guard let self, self.hiddenTrips.remove(t.id) != nil else { return }
            withAnimation(.snappy(duration: 0.35)) {
                self.trips.insert(t, at: min(at, self.trips.count))
                self.stops += ss
                store.toast = nil
            }
            self.saveCache()
        }))
        Task {
            try? await Task.sleep(for: .seconds(4.2))
            guard hiddenTrips.contains(t.id) else { return }
            do { try await Supa.write("DELETE", "trips", query: "id=eq.\(t.id)"); hiddenTrips.remove(t.id) }
            catch {
                hiddenTrips.remove(t.id)
                withAnimation(.snappy) { trips.insert(t, at: min(at, trips.count)); stops += ss }
                store.say("刪除失敗：" + error.localizedDescription)
            }
            saveCache()
        }
    }

    // 新的一站：加在那天最後
    func makeStop(_ tid: String, day: Int, place p: Place) -> TripStop {
        TripStop(id: UUID().uuidString.lowercased(), trip_id: tid, day: day, pos: nextPos(tid, day), kind: "place", place_id: p.id,
                 name: p.name + (p.branch?.isEmpty == false ? " \(p.branch!)" : ""), address: p.address?.isEmpty == false ? p.address : nil,
                 lat: p.lat, lng: p.lng, poi: nil, stay_min: p.category == "cafe" || p.category == "dessert" || p.category == "drink" ? 45 : 60,
                 mode: nil, fixed_time: nil, done_at: nil, added_by: Supa.session?.user.id, created_at: nil, updated_at: nil)
    }

    // 從 Apple 地圖搜到的地點：景點活動是 spot、飯店是 stay，只存在行程裡
    func makeStop(_ tid: String, day: Int, hit h: MapHit) -> TripStop {
        TripStop(id: UUID().uuidString.lowercased(), trip_id: tid, day: day, pos: nextPos(tid, day), kind: h.stay ? "stay" : "spot", place_id: nil,
                 name: h.name, address: h.address, lat: h.coord.latitude, lng: h.coord.longitude, poi: h.poi, stay_min: h.stay ? 0 : h.food ? 60 : 90,
                 mode: nil, fixed_time: nil, done_at: nil, added_by: Supa.session?.user.id, created_at: nil, updated_at: nil)
    }

    // 搜到的餐廳按了「♥ 收藏」：這站改成收藏的店
    func attach(_ sid: String, place p: Place, store: Store?) {
        guard var s = stops.first(where: { $0.id == sid }) else { return }
        s.kind = "place"; s.place_id = p.id
        withAnimation(.snappy) { update(s, store: store) }
    }

    func nextPos(_ tid: String, _ day: Int) -> Double { (stops(tid, day: day).last?.pos ?? 0) + 1 }

    func insert(_ s: TripStop, store: Store?) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { stops.append(s) }
        touch(s.trip_id)
        var body: [String: AnyCodable] = ["id": .s(s.id), "trip_id": .s(s.trip_id), "day": .i(s.day), "pos": .d(s.pos), "kind": .s(s.kind),
                                          "name": .s(s.name), "stay_min": .i(s.stay_min)]
        body["place_id"] = opt(s.place_id); body["address"] = opt(s.address); body["poi"] = opt(s.poi)
        body["lat"] = s.lat.map { AnyCodable.d($0) } ?? .null; body["lng"] = s.lng.map { AnyCodable.d($0) } ?? .null
        body["mode"] = opt(s.mode); body["fixed_time"] = opt(s.fixed_time)
        send(store, "這站沒加到：", undo: { self.stops.removeAll { $0.id == s.id } }) {
            try await Supa.write("POST", "trip_stops", body: body)
        }
    }

    // 改一站（停留時間、固定時間、交通方式、換順序、換天）：只送改到的欄位
    func update(_ s: TripStop, store: Store?) {
        guard let i = stops.firstIndex(where: { $0.id == s.id }) else { return }
        let old = stops[i]
        guard old != s else { return }
        stops[i] = s
        touch(s.trip_id)
        var body: [String: AnyCodable] = [:]
        if old.day != s.day { body["day"] = .i(s.day) }
        if old.pos != s.pos { body["pos"] = .d(s.pos) }
        if old.trip_id != s.trip_id { body["trip_id"] = .s(s.trip_id) }
        if old.stay_min != s.stay_min { body["stay_min"] = .i(s.stay_min) }
        if old.mode != s.mode { body["mode"] = opt(s.mode) }
        if old.fixed_time != s.fixed_time { body["fixed_time"] = opt(s.fixed_time) }
        if old.done_at != s.done_at { body["done_at"] = opt(s.done_at) }
        if old.kind != s.kind { body["kind"] = .s(s.kind) }
        if old.place_id != s.place_id { body["place_id"] = opt(s.place_id) }
        if old.name != s.name { body["name"] = .s(s.name) }
        send(store, "沒存到：", undo: { if let j = self.stops.firstIndex(where: { $0.id == s.id }) { self.stops[j] = old } }) {
            try await Supa.write("PATCH", "trip_stops", query: "id=eq.\(s.id)", body: body)
        }
    }

    // 刪一站：先拿掉，4 秒內可以復原
    func deleteWithUndo(_ s: TripStop, store: Store) {
        hiddenStops.insert(s.id); rev += 1
        withAnimation(.snappy(duration: 0.3)) { stops.removeAll { $0.id == s.id } }
        saveCache()
        store.say("已拿掉 \(s.name)", icon: .trash, action: ("復原", { [weak self] in
            guard let self, self.hiddenStops.remove(s.id) != nil else { return }
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { self.stops.append(s); store.toast = nil }
            self.saveCache()
        }))
        Task {
            try? await Task.sleep(for: .seconds(4.2))
            guard hiddenStops.contains(s.id) else { return }
            do { try await Supa.write("DELETE", "trip_stops", query: "id=eq.\(s.id)"); hiddenStops.remove(s.id) }
            catch {
                hiddenStops.remove(s.id)
                withAnimation(.snappy) { stops.append(s) }
                store.say("刪除失敗：" + error.localizedDescription)
            }
            saveCache()
        }
    }

    // 復原「加進行程」：直接拿掉（剛為它建的空行程也一起刪）
    func remove(_ s: TripStop, dropTrip: Bool, store: Store) {
        withAnimation(.snappy) { stops.removeAll { $0.id == s.id } }
        let t = trip(s.trip_id)
        let empty = dropTrip && stops(s.trip_id).isEmpty
        if empty { withAnimation(.snappy) { trips.removeAll { $0.id == s.trip_id } } }
        send(store, "復原失敗：", undo: {
            self.stops.append(s)
            if empty, let t { self.trips.insert(t, at: 0) }
        }) {
            try await Supa.write("DELETE", "trip_stops", query: "id=eq.\(s.id)")
            if empty { try await Supa.write("DELETE", "trips", query: "id=eq.\(s.trip_id)") }
        }
    }

    // 店家頁「加進行程」：有進行中的行程就加到最後一天最後一站，沒有就建一個新的
    func addPlace(_ p: Place, store: Store) {
        Perf.shared.mark("加進行程")
        var made = false
        let t: Trip
        if let a = active { t = a } else { t = create(title: "新行程", date: nil, group: nil, store: store); made = true }
        let s = makeStop(t.id, day: t.days, place: p)
        insert(s, store: store)
        Haptic.success()
        let n = stops(t.id, day: t.days).count
        store.say("加到 \(t.title)・第 \(n) 站", icon: .check, action: ("復原", { [weak self] in
            self?.remove(s, dropTrip: made, store: store)
            store.toast = nil
        }), tap: { [weak self] in self?.picking = PickReq(id: s.id) })
    }

    // 整天換順序（幫我排順序、復原）：pos 依序改成 1、2、3…，只送有變的站
    func reorder(_ seq: [TripStop], store: Store?) {
        withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
            for (i, s) in seq.enumerated() {
                guard let cur = stops.first(where: { $0.id == s.id }) else { continue }
                let p = Double(i + 1)
                if cur.pos != p { var x = cur; x.pos = p; update(x, store: store) }
            }
        }
    }

    // 換到別的行程（訊息條點下去選的）
    func move(_ sid: String, to t: Trip, store: Store) {
        guard var s = stops.first(where: { $0.id == sid }) else { return }
        s.trip_id = t.id; s.day = t.days; s.pos = nextPos(t.id, t.days)
        update(s, store: store)
        lastOpened = t.id
        store.say("改到 \(t.title)・第 \(stops(t.id, day: t.days).count) 站", icon: .check)
    }

    private func touch(_ tid: String) {
        if let i = trips.firstIndex(where: { $0.id == tid }) { trips[i].updated_at = ISO8601DateFormatter().string(from: Date()) }
    }
}

func opt(_ v: String?) -> AnyCodable { v.map { AnyCodable.s($0) } ?? .null }
