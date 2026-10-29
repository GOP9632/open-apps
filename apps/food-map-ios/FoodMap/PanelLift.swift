import SwiftUI

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
