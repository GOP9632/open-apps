import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass
import os

// 手感量測（「我的」最下面的版本號連點 5 下打開）：
// 手指放開 → 狀態改變後的第一幀，花了幾毫秒；過去 2 秒掉了幾幀。
// 主要動作也打 os_signpost，接上 Mac 用 Instruments 看得到
@MainActor @Observable final class Perf {
    static let shared = Perf()
    static let signposter = OSSignposter(subsystem: "io.github.gop9632.foodmap", category: "tap")

    var on = false { didSet { on ? start() : stop() } }
    private(set) var lines: [String] = []
    private(set) var hitches = 0

    @ObservationIgnored private var touchDown: CFTimeInterval = 0
    @ObservationIgnored private var touchUp: CFTimeInterval = 0
    @ObservationIgnored private var pending: (name: String, at: CFTimeInterval)?
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private var last: CFTimeInterval = 0
    @ObservationIgnored private var drops: [CFTimeInterval] = []

    // 只在開發版和 TestFlight 出現，App Store 版不會有
    static var allowed: Bool {
        #if DEBUG
        return true
        #else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        #endif
    }

    func touched(_ down: Bool) {
        let t = CACurrentMediaTime()
        if down { touchDown = t } else { touchUp = t }
    }

    // 狀態改變的地方呼叫（點圖釘、換分頁、推店家頁、想去/去過、篩選），等下一幀畫出來再算時間
    func mark(_ name: String) {
        Self.signposter.emitEvent("tap", "\(name, privacy: .public)")
        guard on else { return }
        pending = (name, CACurrentMediaTime())
    }

    private func start() {
        guard link == nil else { return }
        let l = CADisplayLink(target: Proxy(self), selector: #selector(Proxy.tick(_:)))
        l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        l.add(to: .main, forMode: .common)
        link = l; last = 0; drops = []; hitches = 0
    }

    private func stop() {
        link?.invalidate(); link = nil; pending = nil
    }

    fileprivate func tick(_ l: CADisplayLink) {
        let now = l.timestamp
        let frame = max(l.targetTimestamp - l.timestamp, 1.0 / 120)
        if last > 0, now - last > frame * 1.5 { drops.append(now) }
        last = now
        drops.removeAll { now - $0 > 2 }
        if hitches != drops.count { hitches = drops.count }
        if let p = pending {
            pending = nil
            // 從手指放開算；如果放開比狀態改變早超過 1 秒（例如自動觸發），就從狀態改變算
            let from = touchUp > 0 && p.at - touchUp < 1 ? touchUp : p.at
            let ms = Int((CACurrentMediaTime() - from) * 1000)
            let press = touchUp > touchDown && touchDown > 0 && p.at - touchUp < 1 ? "，按住 \(Int((touchUp - touchDown) * 1000))" : ""
            lines.insert("\(p.name) \(ms) ms\(press)", at: 0)
            if lines.count > 6 { lines.removeLast() }
        }
    }

    // CADisplayLink 會強引用 target，用一個小物件轉手，關掉時不會留著
    private final class Proxy: NSObject {
        weak var perf: Perf?
        init(_ p: Perf) { perf = p }
        @objc func tick(_ l: CADisplayLink) { MainActor.assumeIsolated { perf?.tick(l) } }
    }
}

// 整個視窗的手指按下/放開時間（不攔截、不影響任何點擊）
final class TouchClock: UIGestureRecognizer, UIGestureRecognizerDelegate {
    static func install() {
        guard let w = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first,
              !(w.gestureRecognizers ?? []).contains(where: { $0 is TouchClock }) else { return }
        let g = TouchClock(target: nil, action: nil)
        g.cancelsTouchesInView = false
        g.delaysTouchesBegan = false
        g.delaysTouchesEnded = false
        g.delegate = g
        w.addGestureRecognizer(g)
    }

    override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent) {
        MainActor.assumeIsolated {
            Perf.shared.touched(true)
        }
    }

    override func touchesEnded(_ t: Set<UITouch>, with e: UIEvent) {
        MainActor.assumeIsolated { Perf.shared.touched(false) }
        state = .failed
    }

    override func touchesCancelled(_ t: Set<UITouch>, with e: UIEvent) { state = .failed }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { true }
}

// 左下角的小浮層：最近幾次的毫秒數、掉幀數
struct PerfHUD: View {
    @Environment(Store.self) private var store
    @State private var perf = Perf.shared
    var body: some View {
        if perf.on {
            VStack(alignment: .leading, spacing: 2) {
                Text("掉幀（2 秒內）\(perf.hitches)").foregroundStyle(perf.hitches > 0 ? Color.sprYellow : .white)
                // 上次同步花多久、用的是一次拿全部（load_all）還是舊的 7 個請求
                if let ms = store.syncMs { Text("同步 \(ms) ms（\(store.syncVia)）") }
                ForEach(Array(perf.lines.enumerated()), id: \.offset) { Text($0.element) }
                if perf.lines.isEmpty { Text("點點看，這裡會顯示毫秒數") }
            }
            .font(.system(size: 12, weight: .bold, design: .monospaced)).foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(.black.opacity(0.75), in: .rect(cornerRadius: 10))
            .allowsHitTesting(false)
            // 放在分頁列上面一點的左下角，不擋返回鍵和上面的按鈕；不收點擊（再連點版本號 5 下關掉）
            .padding(.bottom, 92).padding(.leading, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            .accessibilityHidden(true)
        }
    }
}
