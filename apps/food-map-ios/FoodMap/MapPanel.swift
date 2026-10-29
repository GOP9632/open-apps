import SwiftUI
import QuartzCore

// 地圖首頁下面那塊的三段高度：一行／一排卡片（預設）／整份附近清單
enum MapStage { case low, mid, high }

// 下面那塊現在停在哪段。只有 NearbySheet 在畫面裡看 stage；MapTab 在手勢、鏡頭的回呼裡改它，不會讓整張地圖重算
@MainActor @Observable final class MapPanel {
    static let shared = MapPanel()
    var stage: MapStage = .mid
    // 停好時面板上緣的螢幕位置（最高段不更新）：「附近」只算面板上面看得到的那塊
    var top: CGFloat = 0
    // 最低段停好時的面板上緣（只增不減，地圖下緣跟著它）、中段上緣（用算的）：鏡頭對準看得到的那塊用
    @ObservationIgnored var lowTop: CGFloat = 0
    @ObservationIgnored var midTop: CGFloat = 0
    // 手指正在拉：這時候不量地圖邊距（不然地圖每幀重排）
    @ObservationIgnored var dragging = false
    // 剛換過段：地圖還在滑（甩過的慣性）也不要馬上又降到一行
    @ObservationIgnored var calmUntil: CFTimeInterval = 0

    // 至少升到中間（點泡泡、抽一間）
    func atLeastMid() {
        guard stage == .low else { return }
        calmUntil = CACurrentMediaTime() + 0.8
        Haptic.light()
        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { stage = .mid }
    }

    func go(_ s: MapStage) {
        guard stage != s else { return }
        if s != .low { calmUntil = CACurrentMediaTime() + 0.8 }
        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { stage = s }
    }
}

// 鏡頭是自己移的（點圖釘、框收藏、邊距變了）：這段時間內的鏡頭變動不算「手指拖地圖」
// 不是 @Observable：每幀的鏡頭回呼讀它，不會讓 MapTab 重算
final class CamQuiet {
    var until: CFTimeInterval = 0
    func hush(_ s: Double = 1.0) { until = max(until, CACurrentMediaTime() + s) }
}
