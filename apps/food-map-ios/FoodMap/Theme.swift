import SwiftUI

// 甜甜圈糖霜風格的共用元件：白色圓角卡片（底下一條奶油色厚影子）、會往下壓的厚按鈕、彩色篩選膠囊

extension View {
    // 白卡片：大圓角，影子是往下 4pt 的實色（像糖霜底下那圈麵包）
    func candy(_ r: CGFloat = 22, fill: Color = .panel) -> some View {
        background(RoundedRectangle(cornerRadius: r).fill(fill).shadow(color: .cardShadow, radius: 0, y: 4))
    }
}

// 厚按鈕：底下一條深色邊，按下去整顆往下沉
struct ChunkyStyle: ButtonStyle {
    var color: Color = .accent
    var edge: Color = .accentDeep
    var fg: Color = .white
    var radius: CGFloat = 14
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(fg)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(RoundedRectangle(cornerRadius: radius).fill(color).shadow(color: edge, radius: 0, y: configuration.isPressed ? 1 : 4))
            .offset(y: configuration.isPressed ? 3 : 0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// 篩選膠囊：選到的是實色白字，沒選到的是淡色底配同色字
struct Chip: View {
    let text: String, on: Bool
    var color: Color = .accent
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(text).font(.subheadline.weight(.heavy))
                .padding(.horizontal, 14).frame(height: 36)
                .background(on ? color : color.opacity(0.13), in: .capsule)
                .foregroundStyle(on ? .white : color)
                .shadow(color: on ? color.mix(with: .black, by: 0.2) : .clear, radius: 0, y: 3)
                .frame(minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// 想去／去過的小標籤：想去是白底粉紅字，去過是薄荷綠底白字加星等
struct Badge: View {
    let place: Place
    var body: some View {
        Text(place.been ? "✓ 去過" + (place.rating.map { " \($0)★" } ?? "") : "♥ 想去")
            .font(.system(size: 11.5, weight: .heavy))
            .padding(.horizontal, 8).frame(height: 22)
            .background(place.been ? Color.sprMint : .white, in: .capsule)
            .foregroundStyle(place.been ? .white : Color.sprPink)
    }
}

// 地圖和收藏頁都用的篩選列（各自一份篩選）：全部、想去、去過、各分類。「全部」會把想去／去過也清掉
struct FilterChips: View {
    @Binding var f: Filter
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Chip(text: "全部", on: !f.on) { tap { f.status = ""; f.cat = "" } }
                Chip(text: "♥ 想去", on: f.status == "want", color: .sprPink) { tap { f.status = f.status == "want" ? "" : "want" } }
                Chip(text: "✓ 去過", on: f.status == "been", color: .sprMint) { tap { f.status = f.status == "been" ? "" : "been" } }
                ForEach(Cat.order, id: \.self) { k in
                    let c = Cat.all[k]!
                    Chip(text: "\(c.emoji) \(c.name)", on: f.cat == k, color: c.color) { tap { f.cat = f.cat == k ? "" : k } }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
        }
    }

    private func tap(_ g: () -> Void) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.snappy) { g() }
    }
}

// 圓角搜尋框
struct SearchField<Trailing: View>: View {
    @Binding var text: String
    let prompt: String
    @ViewBuilder var trailing: () -> Trailing
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(prompt, text: $text).font(.body).submitLabel(.search)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary).frame(width: 44, height: 44).contentShape(.rect) }
                    .accessibilityLabel("清除")
            }
            trailing()
        }
        .padding(.leading, 16).padding(.trailing, 6)
        .frame(height: 52)
        .candy(18)
    }
}

extension SearchField where Trailing == EmptyView {
    init(text: Binding<String>, prompt: String) { self.init(text: text, prompt: prompt, trailing: { EmptyView() }) }
}

// 橘色＋鈕（新增一間）
struct AddButton: View {
    var size: CGFloat = 40
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "plus").font(.system(size: size * 0.5, weight: .heavy)).foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(RoundedRectangle(cornerRadius: size * 0.32).fill(Color.accent).shadow(color: .accentDeep, radius: 0, y: 3))
                .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel("新增店家")
    }
}

// 店家頁左上返回、右上更多用的白色圓鈕
struct CircleIcon: View {
    let icon: String
    var body: some View {
        Image(systemName: icon).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.ink)
            .frame(width: 44, height: 44)
            .background(.white, in: .rect(cornerRadius: 14))
            .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
    }
}

// 糖粒進度條：已經滑過的部分是一段一段彩色糖粒
struct SprinkleBar: View {
    let progress: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.bg2)
                HStack(spacing: 0) {
                    ForEach(0..<24, id: \.self) { i in Color.sprinkles[i % Color.sprinkles.count] }
                }
                .frame(width: g.size.width)
                .mask(alignment: .leading) { Capsule().frame(width: max(0, g.size.width * progress)) }
            }
        }
        .frame(height: 8)
        .animation(.snappy, value: progress)
    }
}

struct Triangle: Shape {
    func path(in r: CGRect) -> Path {
        Path { p in p.move(to: CGPoint(x: r.midX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY)); p.closeSubpath() }
    }
}
