import SwiftUI

/// 仿 CleanMyMac：每個模組一組漸層底色，整個 App 用深色模式。
struct PageTheme {
    let top: Color
    let bottom: Color
    let glow: Color

    var background: some View {
        ZStack {
            LinearGradient(colors: [top, bottom], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [glow.opacity(0.45), .clear], center: .bottom, startRadius: 20, endRadius: 520)
        }
    }

    static func hex(_ v: UInt32) -> Color {
        Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

extension Page {
    var theme: PageTheme {
        switch self {
        case .smart: PageTheme(top: .hex(0x2B1055), bottom: .hex(0x7A1E62), glow: .hex(0xE0569B))
        case .junk: PageTheme(top: .hex(0x06382F), bottom: .hex(0x0E7558), glow: .hex(0x34D399))
        case .large: PageTheme(top: .hex(0x082F49), bottom: .hex(0x0E6E8C), glow: .hex(0x38BDF8))
        case .duplicates: PageTheme(top: .hex(0x083344), bottom: .hex(0x0F766E), glow: .hex(0x2DD4BF))
        case .monitor: PageTheme(top: .hex(0x3B1206), bottom: .hex(0x9A3412), glow: .hex(0xFB923C))
        case .uninstall: PageTheme(top: .hex(0x0F1A4D), bottom: .hex(0x2948B8), glow: .hex(0x60A5FA))
        case .orphans: PageTheme(top: .hex(0x172554), bottom: .hex(0x3730A3), glow: .hex(0x818CF8))
        case .space: PageTheme(top: .hex(0x1E1250), bottom: .hex(0x5B3CC4), glow: .hex(0xA78BFA))
        }
    }
}

private extension Color {
    static func hex(_ v: UInt32) -> Color { PageTheme.hex(v) }
}

extension View {
    /// 半透明的卡片底，疊在漸層上
    func glassCard(cornerRadius: CGFloat = 14) -> some View {
        background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius).stroke(Color.white.opacity(0.12)))
    }
}

/// CleanMyMac 招牌的大圓形按鈕
struct BigRoundButton: View {
    let title: String
    var size: CGFloat = 96
    var disabled = false
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [.white.opacity(0.35), .white.opacity(0.12)],
                                         startPoint: .top, endPoint: .bottom))
                Circle().stroke(Color.white.opacity(0.5), lineWidth: 1.5)
                Text(title).font(.system(size: size * 0.2, weight: .semibold)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.6).padding(.horizontal, 8)
            }
            .frame(width: size, height: size)
            .shadow(color: .white.opacity(hovering ? 0.45 : 0.2), radius: hovering ? 24 : 14)
            .scaleEffect(hovering && !disabled ? 1.04 : 1)
            .animation(.easeOut(duration: 0.15), value: hovering)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.45 : 1)
        .onHover { hovering = $0 }
    }
}

/// 模組首頁的大圖示
struct HeroIcon: View {
    let systemName: String
    var size: CGFloat = 170

    var body: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.08))
            Circle().stroke(Color.white.opacity(0.18), lineWidth: 1)
            Image(systemName: systemName)
                .font(.system(size: size * 0.42, weight: .light))
                .foregroundStyle(.white)
                .shadow(color: .white.opacity(0.4), radius: 18)
        }
        .frame(width: size, height: size)
    }
}
