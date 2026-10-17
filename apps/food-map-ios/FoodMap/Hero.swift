import SwiftUI
import UIKit

// 卡片長大變成店家頁：推頁照常（從左邊滑回才不會被當成往下拉），另外在最上層疊一張照片，
// 從卡片上的位置飛到店家頁大圖的位置；返回時如果那張卡還在畫面上就飛回去
@MainActor @Observable final class Hero {
    static let shared = Hero()

    // 正在飛的那張（沒在飛就是 nil）
    private(set) var flying: String?
    private(set) var img: UIImage?
    private(set) var rect: CGRect = .zero
    private(set) var radius: CGFloat = 16
    // 飛的時候先藏起真的照片（店家頁大圖、卡片上那張）
    private(set) var hiding: String?

    // 畫面上每張卡片照片的位置（不觸發重畫）：店 id → [哪張卡: (分頁, 位置, 圓角)]
    @ObservationIgnored private var spots: [String: [UUID: (tab: Int, rect: CGRect, radius: CGFloat)]] = [:]
    @ObservationIgnored private var down: (at: CGPoint, time: CFTimeInterval)?
    // 進店家頁時是從哪張卡飛過來的、店家頁大圖現在在哪（返回時用）
    @ObservationIgnored private var source: (id: String, tab: Int, rect: CGRect, radius: CGFloat)?
    @ObservationIgnored private var detail: (id: String, rect: CGRect)?
    @ObservationIgnored private var landedPage: String?

    func touchDown(_ p: CGPoint) { down = (p, CACurrentMediaTime()) }

    func report(_ id: String, _ key: UUID, tab: Int, rect: CGRect, radius: CGFloat) {
        spots[id, default: [:]][key] = (tab, rect, radius)
    }
    func forget(_ id: String, _ key: UUID) {
        spots[id]?[key] = nil
        if spots[id]?.isEmpty == true { spots[id] = nil }
    }

    // 店家頁量到大圖的最終位置：剛按過（1 秒內）同一分頁上這間的卡片，就從那張卡飛過來
    func land(_ place: Place, tab: Int, target: CGRect) {
        detail = (place.id, target)
        guard landedPage != place.id else { return }
        landedPage = place.id
        guard let d = down, CACurrentMediaTime() - d.time < 1, let s = pickSpot(place.id, tab: tab, near: d.at),
              let u = place.photoURL, let im = PhotoLoader.shared.anySize(u) else { return }
        down = nil
        source = (place.id, tab, s.rect, s.radius)
        fly(place.id, im, from: s.rect, s.radius, to: target, 28)
    }

    // 店家頁捲動時更新大圖位置（返回時從這裡飛回去）
    func detailMoved(_ id: String, _ r: CGRect) { if detail?.id == id { detail = (id, r) } }

    // 按返回：原卡片還在畫面上就飛回去；回傳 false 就照一般返回
    func flyBack(_ place: Place, tab: Int) {
        defer { landedPage = nil }
        guard let s = source, s.id == place.id, s.tab == tab, let d = detail, d.id == place.id,
              let cur = spots[place.id]?.values.first(where: { $0.tab == tab && $0.rect.intersects(s.rect.insetBy(dx: -40, dy: -40)) }),
              Self.screen.intersects(cur.rect), Self.screen.intersects(d.rect),
              let u = place.photoURL, let im = PhotoLoader.shared.anySize(u) else { source = nil; return }
        source = nil
        fly(place.id, im, from: d.rect, 28, to: cur.rect, cur.radius)
    }

    // 從左邊滑回（不是按返回鍵）：不飛，下次進來重新算
    func left(_ id: String) { if landedPage == id { landedPage = nil } }

    private func fly(_ id: String, _ im: UIImage, from: CGRect, _ r0: CGFloat, to: CGRect, _ r1: CGFloat) {
        img = im; rect = from; radius = r0; flying = id; hiding = id
        let reduce = UIAccessibility.isReduceMotionEnabled
        withAnimation(reduce ? .easeOut(duration: 0.2) : .spring(response: 0.38, dampingFraction: 0.86)) {
            rect = to; radius = r1
        } completion: { [weak self] in
            guard let self, self.flying == id else { return }
            self.flying = nil; self.hiding = nil; self.img = nil
        }
    }

    private func pickSpot(_ id: String, tab: Int, near p: CGPoint) -> (rect: CGRect, radius: CGFloat)? {
        let l = (spots[id] ?? [:]).values.filter { $0.tab == tab && Self.screen.intersects($0.rect) }
        if let hit = l.first(where: { $0.rect.insetBy(dx: -8, dy: -8).contains(p) }) { return (hit.rect, hit.radius) }
        // 按的是旁邊的按鈕（例如大卡上的「店家頁」）：用離手指最近的那張
        return l.min { dist($0.rect, p) < dist($1.rect, p) }.map { ($0.rect, $0.radius) }
    }
    private func dist(_ r: CGRect, _ p: CGPoint) -> CGFloat { hypot(r.midX - p.x, r.midY - p.y) }

    static var screen: CGRect {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.bounds }.first ?? CGRect(x: 0, y: 0, width: 400, height: 900)
    }
}

extension EnvironmentValues {
    // 這個畫面在第幾個分頁（卡片和店家頁對得上才飛）
    @Entry var heroTab: Int = 0
}

// 卡片上的照片：記下自己在螢幕上的位置；飛的時候先藏起來
private struct HeroSource: ViewModifier {
    let place: Place
    let radius: CGFloat
    @Environment(\.heroTab) private var tab
    @State private var key = UUID()
    @State private var hero = Hero.shared

    func body(content: Content) -> some View {
        content
            .opacity(hero.hiding == place.id ? 0 : 1)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
                Hero.shared.report(place.id, key, tab: tab, rect: r, radius: radius)
            }
            .onDisappear {
                let id = place.id, k = key
                // 卡片關掉的同時推頁（抽到的卡），晚一點再忘掉位置
                Task { try? await Task.sleep(for: .seconds(1)); Hero.shared.forget(id, k) }
            }
    }
}

extension View {
    func heroSource(_ place: Place, radius: CGFloat) -> some View { modifier(HeroSource(place: place, radius: radius)) }
}

// 最上層飛來飛去的那張照片（不擋點擊）
struct HeroLayer: View {
    @State private var hero = Hero.shared
    var body: some View {
        if hero.flying != nil, let img = hero.img {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: hero.rect.width, height: hero.rect.height)
                .clipShape(.rect(cornerRadius: hero.radius))
                .position(x: hero.rect.midX, y: hero.rect.midY)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}
