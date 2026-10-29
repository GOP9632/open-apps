import SwiftUI
import UIKit

// 手指拖的過程中每幀都在變的量（拉面板、拖一站、往下拖加站卡）放在這個小物件裡：
// 只有套高度、位移的那一小層跟著重畫，面板裡面的站、清單不用每幀重算
// （之前放在整個行程面板的狀態裡，拉一下整個面板每幀重算，只有 15–20 fps）
@MainActor @Observable final class Lift {
    var y: CGFloat = 0
}

// 面板高度 = 停好的高度 + 手指拉的量（最多比最低再低 30、比最高再高 30）
struct LiftHeight: ViewModifier {
    let lift: Lift
    let base: CGFloat
    let lo: CGFloat
    let hi: CGFloat
    func body(content: Content) -> some View {
        content.frame(height: min(hi + 30, max(lo - 30, base + lift.y)), alignment: .top)
    }
}

// 跟著手指位移：on 為 false 時不動（只有被拖的那一個讀手指）
struct LiftOffset: ViewModifier {
    let lift: Lift
    var on = true
    var x = false
    func body(content: Content) -> some View {
        let v = on ? lift.y : 0
        content.offset(x: x ? v : 0, y: x ? 0 : v)
    }
}

// 清單捲到頂再往下拉：手指交給面板（1:1 跟手、清單不回彈），放開照面板規則停段。
// SwiftUI 的 ScrollView 拿不到手指位移、也停不掉回彈，所以找到底下的 UIScrollView，在它的 pan 上多掛一個 target（都是公開 API）。
// 找不到的話什麼都不做，退回舊的「拉過頭放開降一段」
struct ListPullDown: UIViewRepresentable {
    var on = true
    var changed: (CGFloat) -> Void        // 往上為正（同 PanelDrag）
    var ended: (CGFloat) -> Void          // 預測會停的位移，往上為正

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> Finder {
        let v = Finder()
        v.isUserInteractionEnabled = false
        let c = context.coordinator
        v.found = { [weak c] s in c?.attach(s) }
        return v
    }

    func updateUIView(_ v: Finder, context: Context) {
        // 每次更新換成新的閉包：拿到的面板高度、段落都是最新的
        context.coordinator.on = on
        context.coordinator.changed = changed
        context.coordinator.ended = ended
    }

    static func dismantleUIView(_ v: Finder, coordinator: Coordinator) { coordinator.detach() }

    final class Finder: UIView {
        var found: ((UIScrollView) -> Void)?
        override func didMoveToWindow() { super.didMoveToWindow(); find() }
        override func didMoveToSuperview() { super.didMoveToSuperview(); find() }
        // 往上找第一個直的 UIScrollView（最多 12 層，不會掛到別的捲動區）
        private func find() {
            var p = superview
            for _ in 0..<12 {
                guard let v = p else { return }
                if let s = v as? UIScrollView, s.contentSize.width <= s.bounds.width + 1 { found?(s); return }
                p = v.superview
            }
        }
    }

    @MainActor final class Coordinator: NSObject {
        var on = true
        var changed: (CGFloat) -> Void = { _ in }
        var ended: (CGFloat) -> Void = { _ in }
        private weak var scroll: UIScrollView?
        private var handing = false
        private var start: CGFloat = 0
        private var oldBounce = true

        func attach(_ s: UIScrollView) {
            guard scroll !== s else { return }
            detach()
            scroll = s
            s.panGestureRecognizer.addTarget(self, action: #selector(pan(_:)))
        }

        // 拉到一半清單被拿掉：照樣收尾（面板停段、lift 歸零），不然面板會停在半路
        func detach() {
            if handing {
                handing = false
                ended(0)
                scroll?.bounces = oldBounce
            }
            scroll?.panGestureRecognizer.removeTarget(self, action: #selector(pan(_:)))
            scroll = nil
        }

        @objc private func pan(_ g: UIPanGestureRecognizer) {
            guard let s = scroll else { return }
            let top = -s.adjustedContentInset.top
            let dy = g.translation(in: nil).y      // 螢幕座標：面板跟著往下動也不會抵銷
            switch g.state {
            case .began, .changed:
                if !handing {
                    guard on, dy > 0, g.velocity(in: nil).y > 0, s.contentOffset.y <= top + 0.5 else { return }
                    handing = true
                    // 一開始就在頂端：連起手那幾點一起算，第一幀就動；捲回頂端才接手的，從這裡起算
                    start = g.state == .began ? 0 : dy
                    oldBounce = s.bounces
                    s.bounces = false
                }
                s.contentOffset.y = top                // 釘在頂端：清單不回彈、不跟著捲
                changed(-(dy - start))
            case .ended, .cancelled, .failed:
                guard handing else { return }
                handing = false
                let v = g.state == .ended ? g.velocity(in: nil).y : 0
                ended(-(dy - start + v * 0.2))      // 約略等於 DragGesture 的 predictedEndTranslation
                // 等這次手勢處理完才把回彈改回來（UIScrollView 自己的處理可能在我們後面跑，馬上改回去它會補彈一下）
                DispatchQueue.main.async { [weak self, weak s] in
                    guard let self, let s else { return }
                    s.setContentOffset(CGPoint(x: s.contentOffset.x, y: -s.adjustedContentInset.top), animated: false)
                    s.bounces = self.oldBounce
                }
            default:
                break
            }
        }
    }
}
