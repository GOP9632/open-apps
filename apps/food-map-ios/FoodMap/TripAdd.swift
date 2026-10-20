import SwiftUI
import MapKit

// 行程模式搜尋用的：分類、加在哪、Apple 地圖的地點、離路線多遠（搜尋本身在 TripMode.swift 的 TripSearch）
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
