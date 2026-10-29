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

// 推頁用：我的行程（行程本身不是一頁，是首頁地圖的行程模式，見 TripMode）
enum TripRoute: Hashable {
    case list
}

extension View {
    func tripDestinations() -> some View {
        navigationDestination(for: TripRoute.self) { r in
            switch r {
            case .list: TripsList()
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

extension TravelMode {
    // 沒選過的段：直線 1.2 公里內走路，更遠開車。只看兩點座標，結果固定，路線不會換 key 一直重抓
    static func auto(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> TravelMode {
        CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude)) <= 1200 ? .walk : .drive
    }
    // 這段選過就照選的；行程預設是開車／捷運（舊資料）就照行程；其他（行程存的 "walk" 當成自動）依距離
    static func pick(_ t: Trip, _ s: TripStop?, from a: CLLocationCoordinate2D?, to b: CLLocationCoordinate2D?) -> TravelMode {
        if let r = s?.mode, let m = TravelMode(rawValue: r) { return m }
        if t.mode != "walk", let m = TravelMode(rawValue: t.mode) { return m }
        guard let a, let b else { return .walk }
        return auto(a, b)
    }
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
            ("monument", "building.columns.fill"), ("castle", "building.columns.fill"), ("fortress", "building.columns.fill"), ("planetarium", "sparkles"),
        ]
        return table.first { r.contains($0.0) }?.1 ?? "mappin"
    }
    // 站卡上的小標籤：不是收藏的站寫它是什麼（地標、博物館…），看不出來就寫「地點」（以前寫「其他行程」會被看成別的行程）
    static func label(_ s: TripStop) -> String { s.kind == "stay" ? "住宿" : name(s.poi) ?? "地點" }
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
            ("landmark", "地標"), ("monument", "紀念建築"), ("castle", "古蹟"), ("fortress", "古蹟"), ("planetarium", "天文館"),
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
    // 排過半夜：「隔天 1:27」「+3 天 1:27」（clock 只取餘數，看起來像當天凌晨）
    static func clockDay(_ m: Int) -> String {
        let d = m / 1440
        return (d <= 0 ? "" : d == 1 ? "隔天 " : "+\(d) 天 ") + clock(m)
    }
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

    // 正在存的筆數；存檔中讀回來的舊資料不能蓋掉剛改的
    @ObservationIgnored private var inflight = 0
    @ObservationIgnored private var rev = 0
    // 刪掉但還能復原（4 秒後才真的刪）
    @ObservationIgnored private var hiddenTrips: Set<String> = []
    @ObservationIgnored private var hiddenStops: Set<String> = []
    @ObservationIgnored private var loading: Task<Bool, Never>?
    // 這台手機剛建的行程、剛加的站（id → 什麼時候）：一分鐘內伺服器那份沒有也先留著，
    // 免得讀到存之前的舊資料就讓它從畫面上消失
    @ObservationIgnored private var recent: [String: Date] = [:]
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
        trips = []; stops = []; loaded = false
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

    // fresh：剛存完東西，正在讀的那份可能是存之前開始讀的（舊的），讀完再讀一次新的
    // 回傳有沒有讀到（下拉更新失敗時說一聲）
    @discardableResult func load(fresh: Bool = false) async -> Bool {
        if let t = loading {
            let ok = await t.value
            if !fresh { return ok }
            if let t2 = loading { return await t2.value }
        }
        let t = Task { await loadNow() }
        loading = t
        let ok = await t.value
        loading = nil
        return ok
    }

    private func loadNow() async -> Bool {
        guard Supa.session != nil else { return true }
        struct All: Decodable { var trips: [Trip]?; var stops: [TripStop]? }
        let r = rev
        do {
            let a = try await Supa.rpc("load_trips", [:], as: All.self)
            // 讀的途中自己又改了東西，這份是舊的，丟掉（存完會再讀一次）
            guard r == rev, inflight == 0, Supa.session != nil else { return true }
            var nt = (a.trips ?? []).filter { !hiddenTrips.contains($0.id) }
            var ns = (a.stops ?? []).filter { !hiddenStops.contains($0.id) && !hiddenTrips.contains($0.trip_id) }
            // 剛建、剛加還沒出現在伺服器那份的：留著本機的
            let now = Date()
            recent = recent.filter { now.timeIntervalSince($0.value) < 60 }
            let tids = Set(nt.map(\.id)), sids = Set(ns.map(\.id))
            for t in trips where recent[t.id] != nil && !tids.contains(t.id) { nt.insert(t, at: 0) }
            for s in stops where recent[s.id] != nil && !sids.contains(s.id) && nt.contains(where: { $0.id == s.trip_id }) { ns.append(s) }
            // 沒變就不重設，畫面不重畫；朋友新加的站淡入
            if nt != trips || ns != stops {
                withAnimation(.easeOut(duration: 0.3)) {
                    if nt != trips { trips = nt }
                    if ns != stops { stops = ns }
                }
                saveCache()
            }
            loaded = true
            return true
        } catch {
            print("[trips] load_trips 失敗：\(error)")
            return false
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
            // 存完之前就開始讀的那份不算（伺服器可能還沒有剛存的東西，套上去會讓剛建的行程、剛加的站不見）
            rev += 1
            saveCache()
            if inflight == 0 { await load(fresh: true) }
        }
    }

    @discardableResult
    func create(title: String, date: Date?, group: String?, store: Store?) -> Trip {
        let t = Trip(id: UUID().uuidString.lowercased(), owner: store?.me, group_id: group, title: title, start_date: date.map(TripDate.string),
                     days: 1, mode: "walk", created_at: nil, updated_at: ISO8601DateFormatter().string(from: Date()))
        withAnimation(.snappy) { trips.insert(t, at: 0) }
        recent[t.id] = Date()
        lastOpened = t.id
        let body: [String: AnyCodable] = ["id": .s(t.id), "title": .s(t.title), "start_date": opt(t.start_date), "days": .i(1), "mode": .s("walk"), "group_id": opt(group)]
        send(store, "行程沒建好：", undo: { self.recent[t.id] = nil; self.trips.removeAll { $0.id == t.id }; self.stops.removeAll { $0.trip_id == t.id } }) {
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

    // 刪整個行程：先從畫面拿掉，6 秒內可以復原（訊息條按著不放就一直能復原）
    func deleteWithUndo(_ t: Trip, store: Store) {
        let at = trips.firstIndex { $0.id == t.id } ?? 0
        let ss = stops(t.id)
        hiddenTrips.insert(t.id); rev += 1
        LaterDelete.add("trips", t.id)
        if lastOpened == t.id { lastOpened = nil }
        withAnimation(.snappy(duration: 0.35)) {
            trips.removeAll { $0.id == t.id }
            stops.removeAll { $0.trip_id == t.id }
        }
        saveCache()
        let msg = "已刪除「\(t.title)」"
        store.say(msg, icon: .trash, action: ("復原", { [weak self] in
            guard let self else { return }
            guard self.hiddenTrips.remove(t.id) != nil else { Haptic.warning(); store.say("已經刪掉了"); return }
            LaterDelete.remove("trips", t.id)
            withAnimation(.snappy(duration: 0.35)) {
                self.trips.insert(t, at: min(at, self.trips.count))
                self.stops += ss
                store.toast = nil
            }
            self.saveCache()
        }), seconds: 6)
        Task {
            // 等訊息條真的收起來才刪：「復原」還看得到就一定有用
            await store.waitToastGone(msg)
            guard hiddenTrips.contains(t.id) else { return }
            do { try await Supa.write("DELETE", "trips", query: "id=eq.\(t.id)"); hiddenTrips.remove(t.id) }
            catch {
                hiddenTrips.remove(t.id)
                withAnimation(.snappy) { trips.insert(t, at: min(at, trips.count)); stops += ss }
                store.say("刪除失敗：" + error.localizedDescription)
            }
            LaterDelete.remove("trips", t.id)
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
        recent[s.id] = Date()
        touch(s.trip_id)
        var body: [String: AnyCodable] = ["id": .s(s.id), "trip_id": .s(s.trip_id), "day": .i(s.day), "pos": .d(s.pos), "kind": .s(s.kind),
                                          "name": .s(s.name), "stay_min": .i(s.stay_min)]
        body["place_id"] = opt(s.place_id); body["address"] = opt(s.address); body["poi"] = opt(s.poi)
        body["lat"] = s.lat.map { AnyCodable.d($0) } ?? .null; body["lng"] = s.lng.map { AnyCodable.d($0) } ?? .null
        body["mode"] = opt(s.mode); body["fixed_time"] = opt(s.fixed_time)
        send(store, "這站沒加到：", undo: { self.recent[s.id] = nil; self.stops.removeAll { $0.id == s.id } }) {
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

    // 刪一站：先拿掉，6 秒內可以復原
    func deleteWithUndo(_ s: TripStop, store: Store) {
        Perf.shared.mark("拿掉一站")
        hiddenStops.insert(s.id); rev += 1
        LaterDelete.add("trip_stops", s.id)
        withAnimation(.snappy(duration: 0.3)) { stops.removeAll { $0.id == s.id } }
        saveCache()
        let msg = "已拿掉 \(s.name)"
        store.say(msg, icon: .trash, action: ("復原", { [weak self] in
            guard let self else { return }
            guard self.hiddenStops.remove(s.id) != nil else { Haptic.warning(); store.say("已經刪掉了"); return }
            LaterDelete.remove("trip_stops", s.id)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { self.stops.append(s); store.toast = nil }
            self.saveCache()
        }), seconds: 6)
        Task {
            // 等訊息條真的收起來才刪，跟刪行程一樣：「復原」還看得到就一定有用
            await store.waitToastGone(msg)
            guard hiddenStops.contains(s.id) else { return }
            do { try await Supa.write("DELETE", "trip_stops", query: "id=eq.\(s.id)"); hiddenStops.remove(s.id) }
            catch {
                hiddenStops.remove(s.id)
                withAnimation(.snappy) { stops.append(s) }
                store.say("刪除失敗：" + error.localizedDescription)
            }
            LaterDelete.remove("trip_stops", s.id)
            saveCache()
        }
    }

    // 復原「加進行程」：直接拿掉（剛為它建的空行程也一起刪）
    func remove(_ s: TripStop, dropTrip: Bool, store: Store) {
        recent[s.id] = nil
        withAnimation(.snappy) { stops.removeAll { $0.id == s.id } }
        let t = trip(s.trip_id)
        let empty = dropTrip && stops(s.trip_id).isEmpty
        if empty { recent[s.trip_id] = nil; withAnimation(.snappy) { trips.removeAll { $0.id == s.trip_id } } }
        send(store, "復原失敗：", undo: {
            self.stops.append(s)
            if empty, let t { self.trips.insert(t, at: 0) }
        }) {
            try await Supa.write("DELETE", "trip_stops", query: "id=eq.\(s.id)")
            if empty { try await Supa.write("DELETE", "trips", query: "id=eq.\(s.trip_id)") }
        }
    }

    // 「加到哪個行程？」正在問的那間（TripChooser 的 sheet 看這個）
    var choosing: Place?

    // 可以加的行程：今天的排第一，之後的依日期，沒排日期的接著；過去的不列
    var upcoming: [Trip] {
        let today = TripDate.today
        func rank(_ t: Trip) -> (Int, Date) {
            guard let s = t.start else { return (2, .distantFuture) }
            return s <= today ? (0, s) : (1, s)
        }
        return trips.filter { ($0.end ?? .distantFuture) >= today }
            .sorted { a, b in
                let x = rank(a), y = rank(b)
                if x.0 != y.0 { return x.0 < y.0 }
                if x.1 != y.1 { return x.1 < y.1 }
                return (a.updated_at ?? "") > (b.updated_at ?? "")
            }
    }

    // 店家頁、長按圖釘「加進行程」：只有一個還沒過期的行程而且就是進行中的那個 → 直接加；不然問加到哪個
    func addPlace(_ p: Place, store: Store) {
        Perf.shared.mark("加進行程")
        let list = upcoming
        if list.count == 1, let a = active, a.id == list[0].id {
            add(p, to: a, made: false, store: store)
        } else {
            Haptic.light()
            choosing = p
        }
    }

    // 「加到哪個行程？」最下面的「＋ 開新行程」
    func addToNew(_ p: Place, store: Store) {
        let t = create(title: "新行程", date: nil, group: nil, store: store)
        add(p, to: t, made: true, store: store)
    }

    // 挑加到第幾天：進行中的行程照今天；還沒開始或沒排日期時才跨天挑
    func pickDay(_ t: Trip, near c: CLLocationCoordinate2D?) -> Int {
        let today = TripDate.today
        if let st = t.start, st <= today, let n = Calendar.current.dateComponents([.day], from: st, to: today).day, n < t.days { return n + 1 }
        guard t.days > 1 else { return 1 }
        let days = Array(1...t.days)
        if let c {
            // 多繞 10 分鐘內、最順的那天。沒有任何座標的天要跳過：TripInsert.best 遇到這種天會回 0 公尺，空天會直接勝出
            var best: (day: Int, min: Int)?
            for d in days {
                let o = stops(t.id, day: d)
                guard o.contains(where: { $0.coord != nil }) else { continue }
                let m = TripInsert.minutes(TripInsert.best(o, c).extra, TripMath.dayMode(t, o))
                if m <= 10, m < (best?.min ?? .max) { best = (d, m) }
            }
            if let best { return best.day }
            // 都不順路：離新店最近的那站在 1.5 公里內，就放那天
            let here = CLLocation(latitude: c.latitude, longitude: c.longitude)
            let near = stops(t.id)
                .compactMap { s in s.coord.map { (day: s.day, m: here.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude))) } }
                .min { $0.m < $1.m }
            if let near, near.m <= 1500, days.contains(near.day) { return near.day }
        }
        // 再不行放第一個空的天，沒有空天才放最後一天
        return days.first { stops(t.id, day: $0).isEmpty } ?? t.days
    }

    // 給「加到哪個行程？」用：TripChooser 只 import SwiftUI，不用自己組座標
    func pickDay(_ t: Trip, place p: Place) -> Int {
        pickDay(t, near: p.lat.flatMap { la in p.lng.map { CLLocationCoordinate2D(latitude: la, longitude: $0) } })
    }

    // 加到指定的行程：今天在這個行程裡就加到今天那天，不然挑最順路的那天（pickDay）；插在多走最少的地方（多繞超過 10 分鐘就放最後）
    func add(_ p: Place, to t: Trip, made: Bool, store: Store) {
        choosing = nil
        lastOpened = t.id
        var s = makeStop(t.id, day: 1, place: p)
        let day = pickDay(t, near: s.coord)
        s.day = day
        let order = stops(t.id, day: day)
        var at = order.count
        var smooth = false
        if let c = s.coord, !order.isEmpty {
            let b = TripInsert.best(order, c)
            let tm = TripMath.dayMode(t, order)
            if TripInsert.minutes(b.extra, tm) <= 10 { at = b.at; smooth = true }
        }
        s.pos = TripInsert.pos(order, at: at)
        insert(s, store: store)
        Haptic.success()
        let n = at + 1
        // 停 6 秒：從店家頁加完按返回，回到地圖還看得到、點得到「打開行程」
        let dest = t.days > 1 ? "\(t.title) 第 \(day) 天" : t.title
        let msg = smooth ? "加到 \(dest) 第 \(n) 站・順路" : order.isEmpty ? "加到 \(dest)・第 1 站" : "加到 \(dest) 最後・第 \(n) 站"
        store.say(msg, icon: .check, action: ("復原", { [weak self] in
            self?.remove(s, dropTrip: made, store: store)
            store.toast = nil
        }), tap: { TripMode.shared.open(t.id, focus: s.id, store: store) }, seconds: 6)
    }

    // 整天換順序（幫我排順序、復原）：pos 依序改成 1、2、3…，只送有變的站。
    // 交通方式存在到達站上（從上一站怎麼來）：前一站換了，那段手動選的方式就不適用，清掉回到自動；
    // 復原（restore）時照快照把原本選的方式放回去
    func reorder(_ seq: [TripStop], store: Store?, restore: Bool = false) {
        let now = seq.compactMap { s in stops.first { $0.id == s.id } }.sorted { $0.pos < $1.pos }.map(\.id)
        withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
            for (i, s) in seq.enumerated() {
                guard let cur = stops.first(where: { $0.id == s.id }) else { continue }
                var x = cur
                x.pos = Double(i + 1)
                let np = i > 0 ? seq[i - 1].id : nil
                let oi = now.firstIndex(of: s.id) ?? 0
                let op = oi > 0 ? now[oi - 1] : nil
                if np != op { x.mode = restore ? s.mode : nil }
                if x != cur { update(x, store: store) }
            }
        }
    }

    private func touch(_ tid: String) {
        if let i = trips.firstIndex(where: { $0.id == tid }) { trips[i].updated_at = ISO8601DateFormatter().string(from: Date()) }
    }
}

func opt(_ v: String?) -> AnyCodable { v.map { AnyCodable.s($0) } ?? .null }
