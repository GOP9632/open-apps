import SwiftUI
import UIKit
import MapKit

// 往右滑回上一頁：不只螢幕邊緣，畫面上任何地方往右滑都行（單手好按）。
// iOS 26 起系統本身就有「從畫面中間滑回」（interactiveContentPopGestureRecognizer），這裡只是把它打開、
// 並且在手指一開始落在本身就能橫滑的東西上（橫向卡片列、地圖、滑卡、轉盤、滑桿）時不搶，讓它自己處理。
// 只用公開的 API；iOS 18–25 只有系統原本的「從左邊緣滑回」。
enum SwipeBack {
    // 系統的滑回剛開始（自己畫的備用滑回就不要再退一次）
    @MainActor static var lastBegan: Date?
    @MainActor static var recentlyBegan: Bool { lastBegan.map { Date().timeIntervalSince($0) < 1 } ?? false }

    @MainActor static func shouldBegin(_ g: UIGestureRecognizer, nav: UINavigationController) -> Bool {
        let ok = decide(g, nav: nav)
        if ok { lastBegan = Date() }
        return ok
    }

    @MainActor private static func decide(_ g: UIGestureRecognizer, nav: UINavigationController) -> Bool {
        print("[swipeback] 判斷：\(nav.viewControllers.count) 頁")
        guard nav.viewControllers.count > 1 else { print("[swipeback] 不回：第一頁"); return false }
        guard nav.transitionCoordinator == nil else { print("[swipeback] 不回：正在換頁"); return false }
        if let pan = g as? UIPanGestureRecognizer {
            let v = pan.velocity(in: nav.view)
            // 往右、而且以橫向為主
            guard v.x > 0, abs(v.x) > abs(v.y) * 1.5 else { print("[swipeback] 不回：方向 \(Int(v.x)),\(Int(v.y))"); return false }
        }
        let p = g.location(in: nil)
        if SwipeBackBlock.contains(p) { print("[swipeback] 不回：手指在自己橫滑的區塊"); return false }
        // 蓋在地圖上面的面板：SwiftUI 畫的東西 hitTest 常常直接穿過去打到底下的地圖，所以面板自己登記「這裡可以滑回」
        let over = SwipeBackAllow.contains(p)
        var hit = nav.view.hitTest(g.location(in: nav.view), with: nil)
        while let h = hit, h !== nav.view {
            if h is MKMapView, !over { print("[swipeback] 不回：地圖"); return false }
            if h is UISlider { print("[swipeback] 不回：滑桿"); return false }
            if let s = h as? UIScrollView, s.isScrollEnabled, s.contentSize.width > s.bounds.width + 1 {
                print("[swipeback] 不回：橫向捲動 \(s.contentSize.width)>\(s.bounds.width)")
                return false
            }
            hit = h.superview
        }
        print("[swipeback] 回上一頁")
        return true
    }
}

// SwiftUI 自己畫的橫向拖曳（滑卡、轉盤）不是 UIKit 的捲動元件，從外面認不出來，所以自己登記位置
@MainActor enum SwipeBackBlock {
    private static var rects: [UUID: CGRect] = [:]
    static func set(_ id: UUID, _ r: CGRect?) { rects[id] = r }
    static func contains(_ p: CGPoint) -> Bool { rects.values.contains { $0.contains(p) } }
}

// 蓋在地圖上的面板、卡片：在這裡往右滑要回上一頁（不是拖地圖）
@MainActor enum SwipeBackAllow {
    private static var rects: [UUID: CGRect] = [:]
    static func set(_ id: UUID, _ r: CGRect?) { rects[id] = r }
    static func contains(_ p: CGPoint) -> Bool { rects.values.contains { $0.contains(p) } }
}

private struct SwipeBackAllowed: ViewModifier {
    @State private var id = UUID()
    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { SwipeBackAllow.set(id, $0) }
            .onDisappear { SwipeBackAllow.set(id, nil) }
    }
}

private struct SwipeBackBlocked: ViewModifier {
    var on = true
    @State private var id = UUID()
    @State private var rect: CGRect?
    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { rect = $0; SwipeBackBlock.set(id, on ? $0 : nil) }
            .onChange(of: on) { SwipeBackBlock.set(id, on ? rect : nil) }
            .onDisappear { SwipeBackBlock.set(id, nil) }
    }
}

extension View {
    // 這塊自己要橫向拖曳：在這裡往右滑不會回上一頁
    func swipeBackBlocked(_ on: Bool = true) -> some View { modifier(SwipeBackBlocked(on: on)) }
    // 這塊蓋在地圖上：在這裡往右滑回上一頁，不拖地圖
    func swipeBackAllowed() -> some View { modifier(SwipeBackAllowed()) }
}
