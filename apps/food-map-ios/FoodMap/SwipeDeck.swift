import SwiftUI

// 滑卡：右滑想吃、左滑跳過，點一下看店家。卡片先飛出去，飛完才通知外面（存檔在背景）
struct SwipeDeck: View {
    let deck: [Place]
    var onSwipe: (Place, Bool) -> Void
    var onTap: (Place) -> Void = { _ in }
    @State private var drag: CGSize = .zero
    @State private var busy = false

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                ForEach(Array(deck.prefix(3).enumerated()).reversed(), id: \.element.id) { i, p in
                    card(p, at: i)
                }
            }
            .frame(maxHeight: .infinity)
            .padding(.horizontal, 20).padding(.top, 8)

            HStack(spacing: 28) {
                RoundBtn(icon: "xmark", color: .red) { fling(false) }.accessibilityLabel("跳過")
                RoundBtn(icon: "heart.fill", color: .accent2) { fling(true) }.accessibilityLabel("想吃")
            }
            .padding(.bottom, 16)
        }
    }

    // 拆成獨立函式，避免編譯器型別推斷逾時
    @ViewBuilder
    private func card(_ p: Place, at i: Int) -> some View {
        let top = i == 0
        let likeOpacity: Double = top ? Double(max(0, drag.width / 80)) : 0
        let skipOpacity: Double = top ? Double(max(0, -drag.width / 80)) : 0
        let lift: CGFloat = i == 1 ? min(14, abs(drag.width) / 10) : 0
        let offset: CGSize = top ? CGSize(width: drag.width, height: drag.height * 0.35) : CGSize(width: 0, height: CGFloat(i) * 14 - lift)
        let grow: CGFloat = i == 1 ? min(0.05, abs(drag.width) / 2800) : 0
        let scale: CGFloat = top ? 1 : 1 - CGFloat(i) * 0.05 + grow
        let angle: Double = top ? Double(drag.width / 16) : 0
        SwipeCard(place: p)
            .overlay(alignment: .topLeading) { stamp("想吃", .green).opacity(likeOpacity).rotationEffect(.degrees(-12)).padding(24) }
            .overlay(alignment: .topTrailing) { stamp("跳過", .red).opacity(skipOpacity).rotationEffect(.degrees(12)).padding(24) }
            .offset(offset)
            .scaleEffect(scale)
            .rotationEffect(.degrees(angle))
            .onTapGesture { if top && !busy { onTap(p) } }
            .gesture(gesture, including: top ? .all : .subviews)
            .zIndex(Double(3 - i))
            .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.9)), removal: .identity))
    }

    private var gesture: some Gesture {
        DragGesture()
            .onChanged { if !busy { drag = $0.translation } }
            .onEnded { v in
                guard !busy else { return }
                let fast = abs(v.predictedEndTranslation.width) > 260
                if abs(v.translation.width) > 100 || fast { fling(v.translation.width > 0) }
                else { withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) { drag = .zero } }
            }
    }

    private func fling(_ like: Bool) {
        guard let top = deck.first, !busy else { return }
        busy = true
        UIImpactFeedbackGenerator(style: like ? .medium : .light).impactOccurred()
        // 飛出去的動畫真的結束才換下一張，不會閃
        withAnimation(.easeIn(duration: 0.28)) {
            drag = CGSize(width: like ? 700 : -700, height: drag.height + 40)
        } completion: {
            var t = Transaction(); t.disablesAnimations = true
            withTransaction(t) { drag = .zero; onSwipe(top, like) }
            busy = false
        }
    }

    private func stamp(_ t: String, _ c: Color) -> some View {
        Text(t).font(.system(size: 30, weight: .black)).foregroundStyle(c)
            .padding(.horizontal, 12).padding(.vertical, 4)
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(c, lineWidth: 4))
    }
}

struct SwipeCard: View {
    let place: Place
    var body: some View {
        Color.clear.aspectRatio(3 / 4.2, contentMode: .fit)
            .overlay { PhotoView(place: place, px: 1000) }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(place.name).font(.system(size: 28, weight: .heavy))
                    Text("\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(place.area.isEmpty ? "" : "・" + place.area)").font(.subheadline.weight(.semibold))
                    if let d = place.dishes, !d.isEmpty { Label("必點 " + d.prefix(3).joined(separator: "・"), systemImage: "star.fill").font(.subheadline.weight(.semibold)) }
                }
                .foregroundStyle(.white).padding(22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom))
            }
            .clipShape(.rect(cornerRadius: 28))
            .shadow(color: .black.opacity(0.18), radius: 18, y: 8)
            .contentShape(.rect(cornerRadius: 28))
    }
}

struct RoundBtn: View {
    let icon: String, color: Color, action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 26, weight: .bold)).foregroundStyle(color)
                .frame(width: 66, height: 66).background(Color.panel, in: .circle).shadow(color: .black.opacity(0.12), radius: 10, y: 4)
        }
        .buttonStyle(PressStyle())
    }
}
