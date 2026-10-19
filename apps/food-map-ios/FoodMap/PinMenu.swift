import SwiftUI
import MapKit

// 長按地圖上的圖釘：背景變暗、那根圖釘放大 1.15 倍，旁邊彈出糖霜選單（加進行程／導航／看店家）
// 不用系統的 contextMenu（會跳出一大張預覽），選單從圖釘的位置彈出來
struct PinMenu: View {
    enum Act { case add, trip(TripStop), nav, open }

    let pins: PinState
    let list: [Place]
    let act: (Act, Place) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduce

    private let w: CGFloat = 230
    private let h: CGFloat = 214

    var body: some View {
        let p = pins.menu.flatMap { id in list.first { $0.id == id } }
        GeometryReader { g in
            let o = g.frame(in: .global).origin
            ZStack(alignment: .topLeading) {
                if let p, let la = p.lat, let ln = p.lng, let at = pins.locate?(CLLocationCoordinate2D(latitude: la, longitude: ln)) {
                    let x = at.x - o.x, y = at.y - o.y
                    let below = y + 14 + h < g.size.height - 24
                    let cx = min(max(x, w / 2 + 16), g.size.width - w / 2 - 16)
                    let cy = below ? y + 14 + h / 2 : y - 64 - h / 2
                    Color.black.opacity(0.32)
                        .ignoresSafeArea()
                        .contentShape(.rect)
                        .onTapGesture { close() }
                        .transition(.opacity)
                    MenuPin(place: p)
                        .scaleEffect(1.15, anchor: .bottom)
                        .position(x: x, y: y - 25.5)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                    card(p)
                        .frame(width: w)
                        .position(x: cx, y: cy)
                        .transition(reduce ? AnyTransition.opacity : AnyTransition.scale(scale: 0.4, anchor: below ? .top : .bottom).combined(with: .opacity))
                }
            }
            .frame(width: g.size.width, height: g.size.height)
        }
        // 選單沒開時整層不擋手指
        .allowsHitTesting(pins.menu != nil)
        .task(id: pins.menu) {
            // 先把行程讀好，按「加進行程」才知道要加到哪一個
            guard pins.menu != nil, !TripStore.shared.loaded else { return }
            await TripStore.shared.load()
        }
    }

    private func close() {
        Haptic.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { pins.menu = nil }
    }

    private func card(_ p: Place) -> some View {
        let s = TripStore.shared.stopOf(place: p.id)
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.name).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                Text("\(p.cat.emoji) \(p.area.isEmpty ? p.cat.name : p.area)").font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)
            if let s {
                row("checkmark.circle.fill", "在行程裡，打開看", tint: .sprMint) { act(.trip(s), p) }
            } else {
                row("point.topleft.down.to.point.bottomright.curvepath.fill", "加進行程", tint: .accentDeep) { act(.add, p) }
            }
            Divider().padding(.leading, 52)
            row("location.fill", "導航", tint: .sprBlue) { act(.nav, p) }
            Divider().padding(.leading, 52)
            row("fork.knife", "看店家", tint: .ink) { act(.open, p) }
        }
        .padding(.bottom, 4)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color.panel).shadow(color: .black.opacity(0.22), radius: 16, y: 6))
        .environment(\.colorScheme, .light)
    }

    private func row(_ icon: String, _ text: String, tint: Color, run: @escaping () -> Void) -> some View {
        Button {
            Haptic.light()
            run()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 15, weight: .bold)).foregroundStyle(tint).frame(width: 24)
                Text(text).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                Spacer()
            }
            .padding(.horizontal, 16)
            .frame(height: 48)
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
    }
}

// 圖釘的樣子（分類顏色的圓＋食物圖示＋白色小尖角），選單打開時畫在變暗的背景上面
struct MenuPin: View {
    let place: Place
    var body: some View {
        VStack(spacing: -3) {
            ZStack {
                Circle().fill(place.cat.color)
                Text(place.cat.emoji).font(.system(size: 21))
            }
            .frame(width: 44, height: 44)
            .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            Triangle().fill(.white).frame(width: 14, height: 10).rotationEffect(.degrees(180))
        }
        .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
    }
}
