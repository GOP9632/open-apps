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
    var haptic = false   // 手指一按下就輕震（不等放開）
    var onPress: (() -> Void)? = nil   // 手指一按下就先做的事（例如先拿影片網址）
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(configuration.isPressed ? .easeOut(duration: 0.08) : .spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, down in
                guard down else { return }
                if haptic { Haptic.light() }
                onPress?()
            }
    }
}

// 篩選膠囊：選到的是實色白字，沒選到的是淡色底配同色字
struct Chip: View {
    let text: String, on: Bool
    var color: Color = .accent
    // 疊在地圖上：沒選的也是不透明白底、字加深，看得清楚
    var solid = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(text).font(.subheadline.weight(.heavy))
                .padding(.horizontal, 14).frame(height: 36)
                .background(on ? color : solid ? .white : color.opacity(0.13), in: .capsule)
                .overlay(Capsule().strokeBorder(!on && solid ? color.opacity(0.35) : .clear, lineWidth: 1.5))
                .foregroundStyle(on ? .white : solid ? color.mix(with: .black, by: 0.3) : color)
                .shadow(color: on ? color.mix(with: .black, by: 0.2) : solid ? .black.opacity(0.12) : .clear, radius: on ? 0 : 4, y: on ? 3 : 2)
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
    var solid = false
    // 排在最前面的東西（地圖頁的「看誰的收藏」），跟分類放同一排，不另外佔一排
    var lead: AnyView? = nil
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let lead { lead }
                Chip(text: "全部", on: !f.on, solid: solid) { tap { f.status = ""; f.cat = "" } }
                Chip(text: "♥ 想去", on: f.status == "want", color: .sprPink, solid: solid) { tap { f.status = f.status == "want" ? "" : "want" } }
                Chip(text: "✓ 去過", on: f.status == "been", color: .sprMint, solid: solid) { tap { f.status = f.status == "been" ? "" : "been" } }
                ForEach(Cat.order, id: \.self) { k in
                    let c = Cat.all[k]!
                    Chip(text: "\(c.emoji) \(c.name)", on: f.cat == k, color: c.color, solid: solid) { tap { f.cat = f.cat == k ? "" : k } }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
        }
    }

    private func tap(_ g: () -> Void) {
        Haptic.light()
        Perf.shared.mark("篩選")
        withAnimation(.snappy) { g() }
    }
}

// 圓角搜尋框
struct SearchField<Trailing: View>: View {
    @Binding var text: String
    let prompt: String
    // 放在最左邊的東西（地圖頁的「我的收藏 ▾」膠囊）
    var lead: AnyView? = nil
    @ViewBuilder var trailing: () -> Trailing
    var body: some View {
        HStack(spacing: 10) {
            if let lead { lead }
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(prompt, text: $text).font(.body).submitLabel(.search)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary).frame(width: 44, height: 44).contentShape(.rect) }
                    .accessibilityLabel("清除")
            }
            trailing()
        }
        .padding(.leading, lead == nil ? 16 : 8).padding(.trailing, 6)
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

// 有導覽列的頁面（群組、配對）左上角的返回鍵：跟店家頁一樣只有箭頭、深色，按了回上一頁
struct BackButton: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        Button { Perf.shared.mark("返回"); dismiss() } label: {
            Image(systemName: "chevron.left").font(.system(size: 17, weight: .bold)).foregroundStyle(Color.ink)
                .frame(width: 44, height: 44).contentShape(.rect)
        }
        .accessibilityLabel("返回")
    }
}

extension View {
    // 換掉系統的藍色「〈 上一頁」，整個 App 的返回鍵長一樣（從左邊滑回照樣可以）
    func backButton() -> some View {
        navigationBarBackButtonHidden(true)
            .toolbar { ToolbarItem(placement: .topBarLeading) { BackButton() } }
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
        // 進度用彈簧長到新長度
        .animation(.spring(response: 0.45, dampingFraction: 0.65), value: progress)
    }
}

struct Triangle: Shape {
    func path(in r: CGRect) -> Path {
        Path { p in p.move(to: CGPoint(x: r.midX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY)); p.closeSubpath() }
    }
}

// 震動：共用幾個先準備好的產生器（每次現建一個、沒先 prepare，第一下會晚）
@MainActor enum Haptic {
    private static let lightGen = UIImpactFeedbackGenerator(style: .light)
    private static let mediumGen = UIImpactFeedbackGenerator(style: .medium)
    private static let noteGen = UINotificationFeedbackGenerator()
    private static let tickGen = UISelectionFeedbackGenerator()

    static func prepare() { lightGen.prepare(); mediumGen.prepare(); noteGen.prepare(); tickGen.prepare() }
    static func light() { lightGen.impactOccurred(); lightGen.prepare() }
    static func medium() { mediumGen.impactOccurred(); mediumGen.prepare() }
    static func success() { noteGen.notificationOccurred(.success); noteGen.prepare() }
    static func warning() { noteGen.notificationOccurred(.warning); noteGen.prepare() }
    static func tick() { tickGen.selectionChanged(); tickGen.prepare() }
}
