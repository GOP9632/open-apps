import SwiftUI

// 滑卡：右滑想吃、左滑跳過，點一下看店家。滑出去的那張交給飛走的複本自己飛，下一張馬上可以拖（手快可以連續滑）
struct SwipeDeck: View {
    let deck: [Place]
    var onSwipe: (Place, Bool) -> Void
    var onTap: (Place) -> Void = { _ in }
    // 有值就顯示「↶ 上一張」，收回自己剛滑的那張
    var onUndo: (() -> Void)? = nil
    @State private var drag: CGSize = .zero
    // 正在飛走的卡（複本），飛完自己消失
    @State private var flying: [Flying] = []
    // 拖過門檻的一半：印章蓋下去（true 想吃、false 跳過）
    @State private var armed: Bool?
    @Environment(\.accessibilityReduceMotion) private var reduce

    struct Flying: Identifiable {
        let id = UUID()
        let place: Place, from: CGSize, like: Bool
    }

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                ForEach(Array(deck.prefix(3).enumerated()).reversed(), id: \.element.id) { i, p in
                    card(p, at: i)
                }
                ForEach(flying) { f in
                    FlyingCard(f: f) { flying.removeAll { $0.id == f.id } }.zIndex(10).allowsHitTesting(false)
                }
            }
            .frame(maxHeight: .infinity)
            .padding(.horizontal, 20).padding(.top, 8)
            // 滑卡自己要左右拖：在卡片上往右滑不會回上一頁
            .swipeBackBlocked()

            HStack(spacing: 28) {
                RoundBtn(icon: "arrow.uturn.backward", color: Color.ink.opacity(onUndo == nil ? 0.2 : 0.6), size: 50) { onUndo?() }
                    .disabled(onUndo == nil).accessibilityLabel("上一張")
                RoundBtn(icon: "xmark", color: .sprPink) { fling(false) }.accessibilityLabel("跳過")
                Button { fling(true) } label: {
                    Image(systemName: "heart.fill").font(.system(size: 32, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 78, height: 78).background(Color.accent, in: .circle).shadow(color: .accentDeep, radius: 0, y: 4)
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("想吃")
            }
            .padding(.bottom, 16)
        }
    }

    // 拆成獨立函式，避免編譯器型別推斷逾時
    @ViewBuilder
    private func card(_ p: Place, at i: Int) -> some View {
        let top = i == 0
        let lift: CGFloat = i == 1 ? min(14, abs(drag.width) / 10) : 0
        let offset: CGSize = top ? CGSize(width: drag.width, height: drag.height * 0.35) : CGSize(width: 0, height: CGFloat(i) * 14 - lift)
        let grow: CGFloat = i == 1 ? min(0.05, abs(drag.width) / 2800) : 0
        let scale: CGFloat = top ? 1 : 1 - CGFloat(i) * 0.05 + grow
        // 後面兩張歪一點，像一疊隨手放的卡
        let angle: Double = top ? Double(drag.width / 16) : (i == 1 ? -3 : 3)
        SwipeCard(place: p)
            // 印章：拖過一半時從 1.6 倍蓋下去，拖回來就抬起淡掉
            .overlay(alignment: .topLeading) {
                if top && armed == true { stamp("想吃！", .sprMint).rotationEffect(.degrees(-12)).padding(24).transition(stampIn) }
            }
            .overlay(alignment: .topTrailing) {
                if top && armed == false { stamp("跳過", .sprPink).rotationEffect(.degrees(12)).padding(24).transition(stampIn) }
            }
            .offset(offset)
            .scaleEffect(scale)
            .rotationEffect(.degrees(angle))
            .onTapGesture { if top { onTap(p) } }
            .gesture(gesture, including: top ? .all : .subviews)
            .zIndex(Double(3 - i))
            .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.9)), removal: .identity))
    }

    private var stampIn: AnyTransition {
        reduce ? .opacity : .asymmetric(insertion: .scale(scale: 1.6).combined(with: .opacity), removal: .scale(scale: 1.15).combined(with: .opacity))
    }

    private var gesture: some Gesture {
        DragGesture()
            .onChanged {
                drag = $0.translation
                let side: Bool? = drag.width > 50 ? true : drag.width < -50 ? false : nil
                if side != armed {
                    if side != nil { Haptic.medium() }
                    withAnimation(.easeOut(duration: 0.15)) { armed = side }
                }
            }
            .onEnded { v in
                let fast = abs(v.predictedEndTranslation.width) > 260
                if abs(v.translation.width) > 100 || fast { fling(v.translation.width > 0) }
                else { withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) { drag = .zero; armed = nil } }
            }
    }

    private func fling(_ like: Bool) {
        guard let top = deck.first else { return }
        like ? Haptic.medium() : Haptic.light()
        // 這張交給飛走的複本，從手指放開的位置接著飛
        flying.append(Flying(place: top, from: drag, like: like))
        var t = Transaction(); t.disablesAnimations = true
        withTransaction(t) { drag = .zero; armed = nil }
        // 下一張用彈簧從歪歪的位置轉正、放大到最上面，馬上可以拖
        withAnimation(.spring(response: 0.3, dampingFraction: 0.78)) { onSwipe(top, like) }
    }

    private func stamp(_ t: String, _ c: Color) -> some View { Stamp(text: t, color: c) }
}

// 想吃！／跳過 的印章
struct Stamp: View {
    let text: String, color: Color
    var body: some View {
        let c = color, t = text
        return Text(t).font(.system(size: 32, weight: .black)).foregroundStyle(c)
            .padding(.horizontal, 14).padding(.vertical, 4)
            .background(.white.opacity(0.9), in: .rect(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(c, lineWidth: 4))
    }
}

// 飛走的那張：出現就往旁邊飛出去，飛完通知移除
private struct FlyingCard: View {
    let f: SwipeDeck.Flying
    let done: () -> Void
    @State private var gone = false
    var body: some View {
        let to = CGSize(width: f.like ? 700 : -700, height: f.from.height * 0.35 + 40)
        let at = gone ? to : CGSize(width: f.from.width, height: f.from.height * 0.35)
        SwipeCard(place: f.place)
            .overlay(alignment: .topLeading) { if f.like { Stamp(text: "想吃！", color: .sprMint).rotationEffect(.degrees(-12)).padding(24) } }
            .overlay(alignment: .topTrailing) { if !f.like { Stamp(text: "跳過", color: .sprPink).rotationEffect(.degrees(12)).padding(24) } }
            .offset(at)
            .rotationEffect(.degrees(Double(at.width / 16)))
            .onAppear {
                withAnimation(.easeIn(duration: 0.26)) { gone = true } completion: { done() }
            }
    }
}

// 白邊卡片：上面照片，下面白色資料條
struct SwipeCard: View {
    let place: Place
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.aspectRatio(1, contentMode: .fit)
                .overlay { PhotoView(place: place, px: 1000) }
                .clipShape(.rect(cornerRadius: 22))
            VStack(alignment: .leading, spacing: 5) {
                Text(place.name).font(.system(size: 24, weight: .black)).foregroundStyle(Color.ink).lineLimit(1)
                Text("\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(place.area.isEmpty ? "" : " · " + place.area)")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                if let d = place.dishes, !d.isEmpty {
                    Text("必點 " + d.prefix(3).joined(separator: "・")).font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent).lineLimit(1)
                }
            }
            .padding(.horizontal, 8).padding(.top, 12).padding(.bottom, 6)
        }
        .padding(10)
        .background(.white, in: .rect(cornerRadius: 30))
        .shadow(color: .black.opacity(0.14), radius: 16, y: 8)
        .contentShape(.rect(cornerRadius: 30))
        .environment(\.colorScheme, .light)
    }
}

struct RoundBtn: View {
    let icon: String, color: Color
    var size: CGFloat = 66
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: size * 0.4, weight: .heavy)).foregroundStyle(color)
                .frame(width: size, height: size).background(.white, in: .circle).shadow(color: .cardShadow, radius: 0, y: 4)
        }
        .buttonStyle(PressStyle())
    }
}
