import SwiftUI
import UIKit

// 長按 0.35 秒拿起一站、接著拖。用 UIKit 的長按：iOS 18 起在 ScrollView 裡用 SwiftUI 的
// .gesture(LongPress.sequenced(before: Drag(minimumDistance: 0)))，清單的 pan 會開不了
// （手指放在站卡上捲不動，往下拉也交不給面板）。
// 拿起前手指移動超過 10pt 長按就失敗，清單照常捲／接手；拿起那一刻 UIKit 讓清單的 pan 失敗（不會邊拖邊捲）。
// 被系統取消也一定有 .cancelled，不用 @GestureState 收尾
struct RowHold: UIGestureRecognizerRepresentable {
    var duration: TimeInterval = 0.35
    var began: (CGPoint) -> Void = { _ in }              // 拿起：手指位置（global）
    var moved: (CGSize, CGPoint) -> Void = { _, _ in }   // 拿起後的位移、手指位置（global）
    var ended: (Bool) -> Void = { _ in }                 // true 放開、false 被取消

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let g = UILongPressGestureRecognizer()
        g.minimumPressDuration = duration
        g.allowableMovement = 10
        g.delegate = context.coordinator
        return g
    }

    func updateUIGestureRecognizer(_ g: UILongPressGestureRecognizer, context: Context) {
        g.minimumPressDuration = duration
    }

    func handleUIGestureRecognizerAction(_ g: UILongPressGestureRecognizer, context: Context) {
        let p = context.converter.location(in: .global)
        switch g.state {
        case .began:
            context.coordinator.start = p
            began(p)
        case .changed:
            let s = context.coordinator.start
            moved(CGSize(width: p.x - s.x, height: p.y - s.y), p)
        case .ended: ended(true)
        case .cancelled, .failed: ended(false)
        default: break
        }
    }

    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var start: CGPoint = .zero
        // 不跟別的手勢同時：拿起時還在 possible 的清單 pan 會被 UIKit 判失敗
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { false }
    }
}

// 拿起中／剛放下（不是 @Observable，改它不會讓面板重畫）
@MainActor final class RowHeld {
    var on = false
    var endedAt: CFTimeInterval = 0
    // 長按拿起又放開：這一下不算點一下
    var justEnded: Bool { CACurrentMediaTime() - endedAt < 0.4 }
}

// 有給 hold 才掛長按（預設不掛）
struct RowHoldIf: ViewModifier {
    let hold: RowHold?
    @ViewBuilder func body(content: Content) -> some View {
        if let hold { content.gesture(hold) } else { content }
    }
}

// 診斷用（只有開發版）：啟動參數關掉站卡上的某個手勢，看清單從站卡上捲不動是誰擋的
enum V11 {
    static func off(_ arg: String) -> Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains(arg)
        #else
        return false
        #endif
    }
    static let noHold = off("-v11NoHold")
    static let noTap = off("-v11NoTap")
}

// on 為 false 時不掛點一下（診斷用）
struct TapIf: ViewModifier {
    let on: Bool
    let tap: () -> Void
    @ViewBuilder func body(content: Content) -> some View {
        if on { content.onTapGesture(perform: tap) } else { content }
    }
}
