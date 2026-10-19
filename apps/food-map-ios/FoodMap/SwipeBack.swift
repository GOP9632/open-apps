import SwiftUI
import UIKit
import MapKit

// 往右滑回上一頁：不只螢幕邊緣，畫面上任何地方往右滑都行（單手好按）。
// iOS 26 起系統本身就有「從畫面中間滑回」（interactiveContentPopGestureRecognizer），這裡只是把它打開、
// 並且在手指一開始落在本身就能橫滑的東西上（橫向卡片列、地圖、滑卡、轉盤、滑桿）時不搶，讓它自己處理。
// 只用公開的 API；iOS 18–25 只有系統原本的「從左邊緣滑回」。
enum SwipeBack {
    @MainActor static func shouldBegin(_ g: UIGestureRecognizer, nav: UINavigationController) -> Bool {
        guard nav.viewControllers.count > 1, nav.transitionCoordinator == nil else { return false }
        if let pan = g as? UIPanGestureRecognizer {
            let v = pan.velocity(in: nav.view)
            // 往右、而且以橫向為主
            guard v.x > 0, abs(v.x) > abs(v.y) * 1.5 else { return false }
        }
        if SwipeBackBlock.contains(g.location(in: nil)) { return false }
        var hit = nav.view.hitTest(g.location(in: nav.view), with: nil)
        while let h = hit, h !== nav.view {
            if h is MKMapView || h is UISlider { return false }
            if let s = h as? UIScrollView, s.isScrollEnabled, s.contentSize.width > s.bounds.width + 1 { return false }
            hit = h.superview
        }
        return true
    }
}

// SwiftUI 自己畫的橫向拖曳（滑卡、轉盤）不是 UIKit 的捲動元件，從外面認不出來，所以自己登記位置
@MainActor enum SwipeBackBlock {
    private static var rects: [UUID: CGRect] = [:]
    static func set(_ id: UUID, _ r: CGRect?) { rects[id] = r }
    static func contains(_ p: CGPoint) -> Bool { rects.values.contains { $0.contains(p) } }
}

private struct SwipeBackBlocked: ViewModifier {
    @State private var id = UUID()
    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { SwipeBackBlock.set(id, $0) }
            .onDisappear { SwipeBackBlock.set(id, nil) }
    }
}

extension View {
    // 這塊自己要橫向拖曳：在這裡往右滑不會回上一頁
    func swipeBackBlocked() -> some View { modifier(SwipeBackBlocked()) }
}
