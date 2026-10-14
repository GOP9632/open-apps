import SwiftUI

// 滑卡手感測試：拿你自己的收藏來滑，右滑想吃、左滑跳過。只是試手感，不會存到雲端、不會影響群組
struct SwipeTab: View {
    @Environment(Store.self) private var store
    @State private var deck: [Place] = []
    @State private var liked: [Place] = []
    @State private var drag: CGSize = .zero

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                ZStack {
                    if deck.isEmpty {
                        VStack(spacing: 12) {
                            Text("🎉").font(.system(size: 50))
                            Text("滑完了！想吃 \(liked.count) 間").font(.title3.bold())
                            Button("再滑一次") { reset() }.buttonStyle(.borderedProminent)
                        }
                    }
                    ForEach(Array(deck.prefix(3).enumerated()).reversed(), id: \.element.id) { i, p in
                        card(p, at: i)
                    }
                }
                .frame(maxHeight: .infinity)
                .padding(.horizontal, 20).padding(.top, 8)

                HStack(spacing: 28) {
                    RoundBtn(icon: "xmark", color: .red) { fling(false) }
                    RoundBtn(icon: "heart.fill", color: .accent2) { fling(true) }
                }
                .padding(.bottom, 16)
            }
            .background(Color.bg)
            .navigationTitle("滑卡（手感測試）")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear { if deck.isEmpty && liked.isEmpty { reset() } }
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
            .gesture(gesture, including: top ? .all : .subviews)
            .zIndex(Double(3 - i))
    }

    private var gesture: some Gesture {
        DragGesture()
            .onChanged { drag = $0.translation }
            .onEnded { v in
                let fast = abs(v.predictedEndTranslation.width) > 260
                if abs(v.translation.width) > 100 || fast { fling(v.translation.width > 0) }
                else { withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) { drag = .zero } }
            }
    }

    private func fling(_ like: Bool) {
        guard let top = deck.first else { return }
        UIImpactFeedbackGenerator(style: like ? .medium : .light).impactOccurred()
        withAnimation(.easeIn(duration: 0.28)) { drag = CGSize(width: like ? 700 : -700, height: drag.height + 40) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
            if like { liked.append(top) }
            var t = Transaction(); t.disablesAnimations = true
            withTransaction(t) { drag = .zero; deck.removeFirst() }
        }
    }

    private func reset() { deck = store.mine.shuffled(); liked = [] }

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
