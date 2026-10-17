import SwiftUI

// 滑卡：右滑想吃、左滑跳過，點一下看店家。卡片先飛出去，飛完才通知外面（存檔在背景）
struct SwipeDeck: View {
    let deck: [Place]
    var onSwipe: (Place, Bool) -> Void
    var onTap: (Place) -> Void = { _ in }
    // 有值就顯示「↶ 上一張」，收回自己剛滑的那張
    var onUndo: (() -> Void)? = nil
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
                RoundBtn(icon: "arrow.uturn.backward", color: Color.ink.opacity(onUndo == nil ? 0.2 : 0.6), size: 50) { onUndo?() }
                    .disabled(onUndo == nil || busy).accessibilityLabel("上一張")
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
        let likeOpacity: Double = top ? Double(max(0, drag.width / 80)) : 0
        let skipOpacity: Double = top ? Double(max(0, -drag.width / 80)) : 0
        let lift: CGFloat = i == 1 ? min(14, abs(drag.width) / 10) : 0
        let offset: CGSize = top ? CGSize(width: drag.width, height: drag.height * 0.35) : CGSize(width: 0, height: CGFloat(i) * 14 - lift)
        let grow: CGFloat = i == 1 ? min(0.05, abs(drag.width) / 2800) : 0
        let scale: CGFloat = top ? 1 : 1 - CGFloat(i) * 0.05 + grow
        // 後面兩張歪一點，像一疊隨手放的卡
        let angle: Double = top ? Double(drag.width / 16) : (i == 1 ? -3 : 3)
        SwipeCard(place: p)
            .overlay(alignment: .topLeading) { stamp("想吃！", .sprMint).opacity(likeOpacity).rotationEffect(.degrees(-12)).padding(24) }
            .overlay(alignment: .topTrailing) { stamp("跳過", .sprPink).opacity(skipOpacity).rotationEffect(.degrees(12)).padding(24) }
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
        like ? Haptic.medium() : Haptic.light()
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
        Text(t).font(.system(size: 32, weight: .black)).foregroundStyle(c)
            .padding(.horizontal, 14).padding(.vertical, 4)
            .background(.white.opacity(0.9), in: .rect(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(c, lineWidth: 4))
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
