import SwiftUI
import UIKit
import MapKit

// 往右滑回上一頁：不只螢幕邊緣，畫面上任何地方往右滑都行（單手好按）。
// 做法：每個導覽多加一個橫向拖曳，接到系統「從邊緣滑回」同一個處理者，所以跟手的動畫、滑一半放開會彈回去，都是系統原生的。
// 手指一開始落在本身就能橫滑的東西上（橫向卡片列、地圖、滑卡、轉盤、滑桿）就不搶，讓它自己處理。
final class SwipeBackPan: UIPanGestureRecognizer, UIGestureRecognizerDelegate {
    weak var nav: UINavigationController?

    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard let nav, nav.viewControllers.count > 1, nav.transitionCoordinator == nil else { return false }
        let v = velocity(in: nav.view)
        // 往右、而且以橫向為主
        guard v.x > 0, abs(v.x) > abs(v.y) * 1.5 else { return false }
        let p = location(in: nav.view)
        // 邊緣那條交給系統原本的
        if p.x < 24 { return false }
        if SwipeBackBlock.contains(location(in: nil)) { return false }
        var hit = nav.view.hitTest(p, with: nil)
        while let h = hit, h !== nav.view {
            if h is MKMapView || h is UISlider { return false }
            if let s = h as? UIScrollView, s.isScrollEnabled, s.contentSize.width > s.bounds.width + 1 { return false }
            hit = h.superview
        }
        return true
    }

    // 按鈕、列表的點擊照常；垂直捲動先開始的話就不搶
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { false }
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

// 放在 Root：換分頁、推頁時（key 變了）把視窗裡每個導覽都裝上全畫面滑回
struct SwipeBackInstaller: UIViewControllerRepresentable {
    let key: [Int]
    func makeUIViewController(context: Context) -> Host { Host() }
    func updateUIViewController(_ vc: Host, context: Context) {
        DispatchQueue.main.async { vc.install() }
    }

    final class Host: UIViewController {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            install()
        }

        func install() {
            guard let root = view.window?.rootViewController else { return }
            var stack: [UIViewController] = [root]
            while let vc = stack.popLast() {
                if let nav = vc as? UINavigationController { attach(nav) }
                stack += vc.children
                if let p = vc.presentedViewController { stack.append(p) }
            }
        }

        private func attach(_ nav: UINavigationController) {
            guard let pop = nav.interactivePopGestureRecognizer,
                  !(nav.view.gestureRecognizers ?? []).contains(where: { $0 is SwipeBackPan }),
                  let targets = pop.value(forKey: "targets") else { return }
            let pan = SwipeBackPan()
            pan.setValue(targets, forKey: "targets")
            pan.nav = nav
            pan.delegate = pan
            pan.maximumNumberOfTouches = 1
            nav.view.addGestureRecognizer(pan)
        }
    }
}
