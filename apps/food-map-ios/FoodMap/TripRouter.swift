import SwiftUI
import Observation
import MapKit

// 兩站之間的路：用 Apple 內建的 MKDirections 算（走路、開車有路線；捷運只拿時間）
// 結果依「起點＋終點＋交通方式」存在記憶體和手機裡；一次只問一個（Apple 有頻率限制）
// 還沒算好或算不出來：先用直線距離估，時間旁標「約」
struct Leg: Codable, Equatable {
    var min: Int
    var meters: Double
    var line: [[Double]]?        // 實際道路（[lat, lng]）；nil = 畫直線虛線
    var approx: Bool             // 直線估的
    var noTransit = false        // 拿不到大眾運輸時間 → 顯示「開地圖看」
}

@MainActor @Observable final class TripRouter {
    static let shared = TripRouter()
    private(set) var legs: [String: Leg] = [:]

    private struct Req { let key: String; let a: CLLocationCoordinate2D; let b: CLLocationCoordinate2D; let mode: TravelMode }
    @ObservationIgnored private var queue: [Req] = []
    @ObservationIgnored private var queued: Set<String> = []
    @ObservationIgnored private var failed: Set<String> = []
    @ObservationIgnored private var running = false
    @ObservationIgnored private var saving: Task<Void, Never>?

    private var file: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("legs.json") }

    init() {
        if let d = try? Data(contentsOf: file), let l = try? JSONDecoder().decode([String: Leg].self, from: d) { legs = l }
    }

    static func key(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D, _ m: TravelMode) -> String {
        String(format: "%.5f,%.5f>%.5f,%.5f|", a.latitude, a.longitude, b.latitude, b.longitude) + m.rawValue
    }

    // 有算好的就用，沒有就直線估（不會去問 Apple；要問用 need）
    func leg(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D, _ m: TravelMode) -> Leg {
        legs[Self.key(a, b, m)] ?? Self.estimate(a, b, m)
    }

    static func estimate(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D, _ m: TravelMode) -> Leg {
        let d = CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude)) * 1.3
        let wait: Double = m == .transit ? 8 : m == .drive ? 3 : 0
        return Leg(min: max(1, Int((d / m.mPerMin + wait).rounded())), meters: d, line: nil, approx: true)
    }

    // 這些段還沒算過就排進去，一個一個問
    func need(_ list: [(CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)]) {
        for (a, b, m) in list {
            let k = Self.key(a, b, m)
            guard legs[k] == nil, !failed.contains(k), !queued.contains(k) else { continue }
            // 同一個點（或幾乎同一個點）不用問
            if abs(a.latitude - b.latitude) < 0.00005 && abs(a.longitude - b.longitude) < 0.00005 {
                legs[k] = Leg(min: 0, meters: 0, line: nil, approx: false); continue
            }
            queued.insert(k)
            queue.append(Req(key: k, a: a, b: b, mode: m))
        }
        if !running && !queue.isEmpty { Task { await run() } }
    }

    private func run() async {
        running = true
        defer { running = false }
        while !queue.isEmpty {
            let r = queue.removeFirst()
            var tries = 0
            while true {
                do {
                    let l = try await Self.fetch(r)
                    withAnimation(.easeInOut(duration: 0.35)) { legs[r.key] = l }
                    break
                } catch let e as MKError where e.code == .loadingThrottled && tries < 2 {
                    // 問太快被擋：等一下再問
                    tries += 1
                    try? await Task.sleep(for: .seconds(4))
                } catch {
                    failed.insert(r.key)
                    if r.mode == .transit {
                        var l = Self.estimate(r.a, r.b, r.mode); l.noTransit = true
                        withAnimation(.easeInOut(duration: 0.35)) { legs[r.key] = l }
                    }
                    break
                }
            }
            queued.remove(r.key)
            save()
            try? await Task.sleep(for: .milliseconds(150))
        }
    }

    private static func fetch(_ r: Req) async throws -> Leg {
        let q = MKDirections.Request()
        q.source = MKMapItem(placemark: MKPlacemark(coordinate: r.a))
        q.destination = MKMapItem(placemark: MKPlacemark(coordinate: r.b))
        switch r.mode {
        case .walk: q.transportType = .walking
        case .drive: q.transportType = .automobile
        case .transit:
            q.transportType = .transit
            let eta = try await MKDirections(request: q).calculateETA()
            return Leg(min: max(1, Int((eta.expectedTravelTime / 60).rounded())), meters: eta.distance, line: nil, approx: false)
        }
        guard let route = try await MKDirections(request: q).calculate().routes.first else { throw MKError(.directionsNotFound) }
        let pl = route.polyline
        var cs = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: pl.pointCount)
        pl.getCoordinates(&cs, range: NSRange(location: 0, length: pl.pointCount))
        // 點太多就隔幾個取一個（頭尾一定留）
        let step = max(1, cs.count / 300)
        var pts: [[Double]] = stride(from: 0, to: cs.count, by: step).map { [cs[$0].latitude, cs[$0].longitude] }
        if let l = cs.last, step > 1 { pts.append([l.latitude, l.longitude]) }
        return Leg(min: max(1, Int((route.expectedTravelTime / 60).rounded())), meters: route.distance, line: pts, approx: false)
    }

    private func save() {
        saving?.cancel()
        let l = legs, f = file
        saving = Task.detached(priority: .utility) {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            try? JSONEncoder().encode(l).write(to: f, options: .atomic)
        }
    }
}

extension Leg {
    var coords: [CLLocationCoordinate2D]? { line.map { $0.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) } } }
}

// Apple 地圖的大眾運輸路線（捷運算不出時間時按「開地圖看」）
func transitURL(_ a: CLLocationCoordinate2D?, _ b: CLLocationCoordinate2D) -> URL? {
    let from = a.map { "saddr=\($0.latitude),\($0.longitude)&" } ?? ""
    return URL(string: "https://maps.apple.com/?\(from)daddr=\(b.latitude),\(b.longitude)&dirflg=r")
}
