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
    static func begin(_ n: StaticString) -> OSSignpostIntervalState { signposter.beginInterval(n, id: signposter.makeSignpostID()) }
    static func end(_ n: StaticString, _ s: OSSignpostIntervalState) { signposter.endInterval(n, s) }

    var on = false { didSet { on ? start() : stop() } }
    private(set) var lines: [String] = []
    private(set) var hitches = 0
    private(set) var renders = ""                   // 「重畫 地圖 2・行程面板 5」：2 秒內每個大畫面重算了幾次
    private(set) var geo = ""                       // 地圖量到的範圍、鏡頭框的上下緣（模擬器截圖對照用）

    @ObservationIgnored private var touchDown: CFTimeInterval = 0
    @ObservationIgnored private var touchUp: CFTimeInterval = 0
    // 同一幀裡打了好幾個記號（例如按下去建畫面、畫面出現）：每個都留著，分開算
    @ObservationIgnored private var pending: [(name: String, at: CFTimeInterval)] = []
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private var last: CFTimeInterval = 0
    @ObservationIgnored private var drops: [CFTimeInterval] = []
    @ObservationIgnored private var bodies: [String: [CFTimeInterval]] = [:]
    @ObservationIgnored private var shownAt: CFTimeInterval = 0
    @ObservationIgnored private var tickedAt: CFTimeInterval = 0   // 上一次 tick 真正跑完的時間（l.timestamp 是 vsync，主執行緒卡住時比 tick 真正跑的時候早）
    @ObservationIgnored private var firstAfter: (name: String, at: CFTimeInterval)?   // 量測：手指按下或放開後主執行緒送出的第一幀

    // 量測用：只印到 Console、不上浮層（body 裡寫 let _ = Perf.shared.note("附近重算")）
    func note(_ s: String) {
        guard on else { return }
        print(String(format: "[perf] %.3f 記號 ", CACurrentMediaTime()) + s)
    }

    // 只在開發版、模擬器和 TestFlight 出現，App Store 版不會有
    static var allowed: Bool {
        #if DEBUG || targetEnvironment(simulator)
        return true
        #else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        #endif
    }

    func touched(_ down: Bool) {
        let t = CACurrentMediaTime()
        if down { touchDown = t } else { touchUp = t }
        guard on else { return }
        firstAfter = (down ? "按下" : "放開", t)
        print(String(format: "[perf] %.3f 手指", t) + (down ? "按下" : "放開"))
    }

    // 狀態改變的地方呼叫（點圖釘、換分頁、推店家頁、想去/去過、篩選），等下一幀畫出來再算時間
    func mark(_ name: String) {
        Self.signposter.emitEvent("tap", "\(name, privacy: .public)")
        guard on else { return }
        note(name)
        pending.append((name, CACurrentMediaTime()))
    }

    func setGeo(_ s: String) { if s != geo { geo = s } }

    // 大畫面的 body 開頭呼叫（let _ = Perf.shared.count("地圖")）：拖面板、縮放時哪個畫面在一直重算
    func count(_ name: String) {
        guard on else { return }
        bodies[name, default: []].append(CACurrentMediaTime())
    }

    private func start() {
        guard link == nil else { return }
        let l = CADisplayLink(target: Proxy(self), selector: #selector(Proxy.tick(_:)))
        l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        l.add(to: .main, forMode: .common)
        link = l; last = 0; drops = []; hitches = 0
    }

    private func stop() {
        link?.invalidate(); link = nil; pending = []; firstAfter = nil
    }

    fileprivate func tick(_ l: CADisplayLink) {
        let now = l.timestamp
        let frame = max(l.targetTimestamp - l.timestamp, 1.0 / 120)
        if last > 0, now - last > frame * 1.5 {
            drops.append(now)
            // 這一幀裡各畫面重算了幾次（body 開頭有 count 的才算），從上一次 tick 跑完算起
            let since = tickedAt
            let n = bodies.compactMap { (k, v) -> String? in
                let c = v.filter { $0 >= since }.count
                return c > 0 ? "\(k) \(c)" : nil
            }.sorted().joined(separator: "・")
            print(String(format: "[perf] 掉幀 %.0f ms（%.3f 到 %.3f）", (now - last) * 1000, last, now) + (n.isEmpty ? "" : "　重算 " + n))
        }
        if let f = firstAfter {
            firstAfter = nil
            // 用現在的時間算，不用 l.timestamp（那是這一幀開始的時間，可能比手指還早）
            print("[perf] 手指" + f.name + String(format: "後第一幀 %.0f ms", (CACurrentMediaTime() - f.at) * 1000))
        }
        last = now
        drops.removeAll { now - $0 > 2 }
        if hitches != drops.count { hitches = drops.count }
        // 重畫次數每 0.5 秒更新一次浮層（浮層自己不要每幀重畫）
        if now - shownAt > 0.5 {
            shownAt = now
            let t = CACurrentMediaTime()
            for k in bodies.keys { bodies[k]?.removeAll { t - $0 > 2 } }
            let s = bodies.filter { !$0.value.isEmpty }.sorted { $0.key < $1.key }.map { "\($0.key) \($0.value.count)" }.joined(separator: "・")
            let r = s.isEmpty ? "" : "重畫 " + s
            if r != renders { renders = r }
        }
        let ps = pending
        pending = []
        for p in ps {
            // 從手指放開算；如果放開比狀態改變早超過 1 秒（例如自動觸發），就從狀態改變算。
            // 手指還按著（長按成立、拖曳中）也從狀態改變算：不然會抓到上一次點擊的放開時間，把按住的時間算進去
            // （在下一幀才判斷：按鈕的動作可能比視窗收到放開還早跑）
            let held = touchDown > touchUp
            let from = !held && touchUp > 0 && p.at >= touchUp && p.at - touchUp < 1 ? touchUp : p.at
            let ms = Int((CACurrentMediaTime() - from) * 1000)
            let press = touchUp > touchDown && touchDown > 0 && p.at - touchUp < 1 ? "，按住 \(Int((touchUp - touchDown) * 1000))" : ""
            lines.insert("\(p.name) \(ms) ms\(press)", at: 0)
            print("[perf] " + lines[0])
            if lines.count > 6 { lines.removeLast() }
        }
        tickedAt = CACurrentMediaTime()
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

    // 被系統取消（例如拉出通知中心）也算放開，不然之後都會被當成手指還按著
    override func touchesCancelled(_ t: Set<UITouch>, with e: UIEvent) {
        MainActor.assumeIsolated { Perf.shared.touched(false) }
        state = .failed
    }

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
                if !perf.renders.isEmpty { Text(perf.renders) }
                if !perf.geo.isEmpty { Text(perf.geo) }
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

// 量測用的啟動參數：只有開發版和模擬器讀得到（正式版一律沒有）
enum Flag {
    #if DEBUG || targetEnvironment(simulator)
    static let args = ProcessInfo.processInfo.arguments
    #else
    static let args: [String] = []
    #endif
    private static let set = Set(args)
    static func on(_ name: String) -> Bool { set.contains(name) }
    static func value(_ name: String) -> String? {      // 帶值的，例如 -drawWin id1,id2
        guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
    @MainActor static var draws = 0                       // -drawWin 輪流用
}

// 量測／驗收用 -shareVerdictTest：把雲端會回的幾種字串餵給分享結果的判斷，印出通知標題和內文
extension ShareUpload {
    static func selfTest() {
        let cases = ["這篇貼文沒找到店家，可以打開美食收藏貼上店名", "已收藏：A\n之前收藏過：B", "之前收藏過：X",
                     "收藏碼已失效，請到美食收藏「我的」重新加入分享捷徑", "沒有收到連結，請從 IG 貼文按分享再選這個捷徑", "收藏失敗：boom", ""]
        for line in cases {
            let v = verdict(line)
            let title = v == .saved ? "收藏好了 🍩" : v == .dup ? "之前收藏過了" : "Bitemap 沒收藏到"
            let body = v != .failed ? line : say(line)
            print("[share] 「\(line.replacingOccurrences(of: "\n", with: "⏎"))」→ \(title)｜\(body.replacingOccurrences(of: "\n", with: "⏎"))｜App 內：\(say(line, inApp: true))")
        }
    }
}
