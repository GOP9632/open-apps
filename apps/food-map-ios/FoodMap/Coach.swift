import SwiftUI

// 教學：畫面變暗，只把要按的那個東西圈起來，旁邊一個白色對話框
// 圈的位置一律從畫面上真的按鈕量出來（coachAnchor），不寫死座標，換手機尺寸、捲動、地圖移動都會跟著走

enum CoachStep: Hashable { case pin, add, been, groups }

struct CoachText {
    let title: String, body: String
    var button: String? = nil   // 有的話顯示按鈕；沒有就是要他點圈起來的東西
    var hint: String? = nil
}

extension CoachStep {
    var text: CoachText {
        switch self {
        case .pin: CoachText(title: "你的收藏都在地圖上 📍", body: "每個圖釘是一間你存的店。點一下看看。", hint: "點圖釘繼續")
        case .add: CoachText(title: "按＋新增一間", body: "貼 IG、Google 地圖連結，或直接打店名都可以。", button: "下一步")
        case .been: CoachText(title: "吃過了按「去過」", body: "順手給個星星，下次朋友問哪間好吃，翻一下就知道。", hint: "點「去過」繼續")
        case .groups: CoachText(title: "不知道吃什麼？", body: "到「群組」拉朋友一起滑卡，大家都想吃的就配對成功。", button: "開始收藏 🍩")
        }
    }
}

extension Store {
    var coachStep: CoachStep? { coachIndex < coach.count ? coach[coachIndex] : nil }

    // 第一次打開才自動跑；略過或看完都記住
    @MainActor func maybeStartCoach() {
        if coach.isEmpty && !UserDefaults.standard.bool(forKey: "coachDone") { startCoach() }
    }

    // 步驟看他現在有什麼：沒有地圖上的店就不教圖釘，一間都沒有就不教「去過」
    @MainActor func startCoach() {
        let own = mine
        let onMap = own.first { $0.lat != nil && $0.lng != nil }
        coachPlace = onMap ?? own.first
        var s: [CoachStep] = []
        if onMap != nil { s.append(.pin) }
        s.append(.add)
        if coachPlace != nil { s.append(.been) }
        s.append(.groups)
        // 回到地圖、清掉篩選，圖釘才一定看得到
        mapF = Filter(); mapGroup = nil
        mapPath = []; tab = 0
        coachFrames = [:]
        withAnimation(.snappy) { coachIndex = 0; coach = s }
    }

    @MainActor func advanceCoach() {
        Haptic.light()
        if coachStep == .been { mapPath = [] }
        guard coachIndex + 1 < coach.count else { endCoach(); return }
        withAnimation(.snappy) { coachIndex += 1 }
        if coachStep == .been, let p = coachPlace {
            // 進到那間店的店家頁，等畫面停好再量「去過」的位置
            coachFrames[.been] = nil
            mapPath = [p]
        }
    }

    @MainActor func endCoach() {
        if coachStep == .been { mapPath = [] }
        withAnimation(.snappy) { coach = []; coachIndex = 0 }
        UserDefaults.standard.set(true, forKey: "coachDone")
    }

    // ＋ 那一步：打開 IG 收藏教學，看完回來接著教
    @MainActor func coachShowIG() {
        igFromCoach = true
        showIG = true
    }
}

// 標記「這個就是教學要圈的東西」：把它在螢幕上的位置記到 store.coachFrames
struct CoachAnchor: ViewModifier {
    @Environment(Store.self) private var store
    let step: CoachStep
    var on = true
    func body(content: Content) -> some View {
        content.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
            if on && store.coachFrames[step] != r { store.coachFrames[step] = r }
        }
    }
}

extension View {
    func coachAnchor(_ step: CoachStep, on: Bool = true) -> some View { modifier(CoachAnchor(step: step, on: on)) }
}

// 整個 App 上面那層教學
struct CoachOverlay: View {
    @Environment(Store.self) private var store
    @State private var ready: CoachStep?

    var body: some View {
        if let step = store.coachStep, !store.showIG {
            let t = step.text
            Spotlight(rect: ready == step ? store.coachFrames[step] : nil, title: t.title, message: t.body,
                      counter: "\(store.coachIndex + 1) / \(store.coach.count)", button: t.button, hint: t.hint,
                      onTarget: { tapTarget(step) }, onButton: { tapButton(step) }, onSkip: { store.endCoach() })
            // 換步驟（換頁、推進店家頁）時等畫面停好才圈，框才不會圈在半路
            .task(id: step) {
                ready = nil
                try? await Task.sleep(for: .milliseconds(step == .been ? 650 : 350))
                withAnimation(.snappy) { ready = step }
            }
            .transition(.opacity)
        }
    }

    private func tapTarget(_ s: CoachStep) {
        switch s {
        case .add: store.coachShowIG()
        case .groups: store.endCoach(); withAnimation(.snappy) { store.tab = 2 }
        default: store.advanceCoach()
        }
    }

    private func tapButton(_ s: CoachStep) {
        if s == .add { store.coachShowIG() } else { store.advanceCoach() }
    }
}

// 變暗、挖一個洞、黃框一閃一閃、手指、對話框。rect 是螢幕座標（.global）；nil 就先只顯示對話框在中間
struct Spotlight: View {
    let rect: CGRect?
    let title: String, message: String, counter: String
    var button: String?
    var hint: String?
    var onTarget: () -> Void
    var onButton: () -> Void
    var onSkip: () -> Void
    var body: some View {
        GeometryReader { g in
            let o = g.frame(in: .global).origin
            let hole = rect?.offsetBy(dx: -o.x, dy: -o.y).insetBy(dx: -8, dy: -8)
            let r = hole.map { min(22, min($0.width, $0.height) / 2) } ?? 0
            ZStack(alignment: .topLeading) {
                // 暗色底挖一個洞：用一個「外框減掉洞」的形狀直接畫，不用遮罩合成，每一格都很省
                Dim(hole: hole, radius: r)
                    .fill(Color.black.opacity(0.62), style: FillStyle(eoFill: true))
                    .contentShape(.rect)
                    .onTapGesture {}

                if let hole {
                    RoundedRectangle(cornerRadius: r).strokeBorder(Color.sprYellow, lineWidth: 3)
                        .frame(width: hole.width, height: hole.height)
                        .offset(x: hole.minX, y: hole.minY)
                        .allowsHitTesting(false)
                    // 一閃一閃的外圈和手指自己管動畫，不會讓整層每一格重算
                    PulseRing(radius: r + 4)
                        .frame(width: hole.width + 8, height: hole.height + 8)
                        .offset(x: hole.minX - 4, y: hole.minY - 4)
                        .allowsHitTesting(false)
                    // 點圈起來的地方 = 照教學做了
                    Color.clear.contentShape(.rect(cornerRadius: r))
                        .frame(width: hole.width, height: hole.height)
                        .offset(x: hole.minX, y: hole.minY)
                        .onTapGesture(perform: onTarget)
                        .accessibilityLabel(title)
                        .accessibilityAddTraits(.isButton)
                    if button == nil {
                        Finger()
                            .offset(x: hole.maxX - 20, y: hole.maxY - 22)
                            .allowsHitTesting(false)
                    }
                }

                bubble(in: g.size, hole: hole)
            }
        }
        .ignoresSafeArea()
        // 教學開著時，朗讀只讀教學這層，不會跑到下面
        .accessibilityAddTraits(.isModal)
    }

    @ViewBuilder private func bubble(in size: CGSize, hole: CGRect?) -> some View {
        let w = min(size.width - 32, 360)
        let below = hole.map { $0.midY < size.height * 0.55 } ?? true
        let arrowX = hole.map { min(max($0.midX, 40), size.width - 40) } ?? size.width / 2
        let left = (size.width - w) / 2
        VStack(spacing: 0) {
            if hole != nil && below { arrow(x: arrowX - left, up: true) }
            card
            if hole != nil && !below { arrow(x: arrowX - left, up: false) }
        }
        .frame(width: w)
        .fixedSize(horizontal: false, vertical: true)
        .alignmentGuide(.top) { d in
            guard let hole else { return -(size.height - d.height) / 2 }
            return below ? -(hole.maxY + 22) : -(hole.minY - 22 - d.height)
        }
        .offset(x: left)
        .animation(.snappy, value: hole)
    }

    private func arrow(x: CGFloat, up: Bool) -> some View {
        Triangle().fill(.white).frame(width: 22, height: 11)
            .rotationEffect(.degrees(up ? 0 : 180))
            .frame(maxWidth: .infinity, alignment: .leading)
            .offset(x: x - 11)
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink)
            Text(message).font(.system(size: 15.5)).foregroundStyle(Color.ink.opacity(0.75)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                Text(counter).font(.footnote.weight(.bold)).foregroundStyle(Color.ink.opacity(0.45))
                Button("略過", action: onSkip).font(.footnote.weight(.bold)).foregroundStyle(Color.ink.opacity(0.45))
                Spacer()
                if let button {
                    Button(button, action: onButton).buttonStyle(ChunkyStyle(radius: 12))
                } else if let hint {
                    Text(hint).font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
                }
            }
            .padding(.top, 4)
        }
        .padding(18)
        .background(.white, in: .rect(cornerRadius: 22))
        .shadow(color: .black.opacity(0.25), radius: 16, y: 6)
    }
}

// 整個螢幕減掉洞（奇偶填色就會空出洞）
struct Dim: Shape {
    let hole: CGRect?
    let radius: CGFloat
    func path(in r: CGRect) -> Path {
        var p = Path(r)
        if let hole { p.addRoundedRect(in: hole, cornerSize: CGSize(width: radius, height: radius), style: .continuous) }
        return p
    }
}

struct PulseRing: View {
    let radius: CGFloat
    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.sprYellow, lineWidth: 3)
            .phaseAnimator([false, true]) { v, on in v.scaleEffect(on ? 1.18 : 1).opacity(on ? 0 : 0.8) } animation: { on in on ? .easeOut(duration: 0.9) : nil }
    }
}

struct Finger: View {
    var body: some View {
        Text("👆").font(.system(size: 34))
            .phaseAnimator([false, true]) { v, down in v.offset(y: down ? 6 : 0) } animation: { _ in .easeInOut(duration: 0.5) }
    }
}

// IG 收藏教學：畫一個像 IG 的畫面，一步一步圈出要按哪裡（紙飛機 → 下面的「分享」→ 分享選單裡的 Bitemap）
struct IGTutorial: View {
    @Environment(Store.self) private var store
    @State private var step = 0
    @State private var frames: [Int: CGRect] = [:]
    @State private var ready = -1

    private let texts: [(String, String)] = [
        ("在 IG 看到想吃的店", "按右邊的紙飛機（分享）。"),
        ("按下面一排的「分享」", "不是複製連結，是那顆往上箭頭的。"),
        ("選 Bitemap，就存好了 🎉", "店名、地址、照片、必點自動抓好，IG 不用關。第一次找不到的話按「更多」把它打開。"),
    ]

    var body: some View {
        ZStack {
            post
            if step >= 1 { igSheet.transition(.move(edge: .bottom)) }
            if step >= 2 { iosSheet.transition(.move(edge: .bottom)) }
            let t = texts[step]
            Spotlight(rect: ready == step ? frames[step] : nil, title: t.0, message: t.1, counter: "IG 收藏 \(step + 1)/3",
                      button: step == 2 ? "我學會了" : nil, hint: step == 2 ? nil : "點圈起來的地方",
                      onTarget: next, onButton: finish, onSkip: finish)
                .id(step)
        }
        .background(.white)
        // 面板滑上來停好才圈
        .task(id: step) {
            try? await Task.sleep(for: .milliseconds(step == 0 ? 300 : 450))
            withAnimation(.snappy) { ready = step }
        }
        .environment(\.colorScheme, .light)
    }

    private func next() {
        Haptic.light()
        if step < 2 { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { step += 1 } } else { finish() }
    }

    private func finish() {
        store.showIG = false
        if store.igFromCoach { store.igFromCoach = false; store.advanceCoach() }
    }

    private func mark(_ i: Int) -> some View {
        Color.clear.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frames[i] = $0 }
    }

    // 1. IG 貼文
    private var post: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Instagram").font(.system(size: 26, weight: .semibold, design: .serif))
                Spacer()
                Image(systemName: "heart"); Image(systemName: "paperplane").padding(.leading, 14)
            }
            .font(.system(size: 22)).padding(.horizontal, 16).padding(.vertical, 10)
            HStack(spacing: 10) {
                Circle().fill(LinearGradient(colors: [.sprYellow, .sprPink, .sprPurple], startPoint: .bottomLeading, endPoint: .topTrailing))
                    .frame(width: 34, height: 34).overlay(Text("🍜").font(.system(size: 17)))
                VStack(alignment: .leading, spacing: 0) {
                    Text("taipei.eats").font(.subheadline.weight(.semibold))
                    Text("台北市大安區").font(.caption)
                }
                Spacer()
                Image(systemName: "ellipsis")
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            LinearGradient(colors: [Color(hex: 0xffcf8a), Color(hex: 0xff8a00)], startPoint: .top, endPoint: .bottom)
                .aspectRatio(1, contentMode: .fit)
                .overlay(Text("🍜").font(.system(size: 120)))
                .overlay(alignment: .bottomTrailing) { Text("1/5").font(.caption.bold()).foregroundStyle(.white).padding(6).background(.black.opacity(0.5), in: .capsule).padding(10) }
            HStack(spacing: 16) {
                Image(systemName: "heart"); Image(systemName: "bubble.right")
                Image(systemName: "paperplane").padding(6).background { mark(0) }
                Spacer()
                Image(systemName: "bookmark")
            }
            .font(.system(size: 23)).padding(.horizontal, 10).padding(.vertical, 6)
            Text("**taipei.eats** 這碗湯頭濃到不行 🔥 必點：招牌拉麵、炙燒叉燒飯").font(.subheadline).padding(.horizontal, 14)
            Spacer()
        }
        .foregroundStyle(.black)
    }

    // 2. IG 自己的分享面板
    private var igSheet: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 18) {
                Capsule().fill(.gray.opacity(0.4)).frame(width: 40, height: 5).padding(.top, 8)
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.gray)
                    Text("搜尋").foregroundStyle(.gray)
                    Spacer()
                }
                .padding(10).background(Color(hex: 0xefefef), in: .rect(cornerRadius: 10)).padding(.horizontal, 16)
                HStack(spacing: 0) {
                    ForEach(["小美", "阿凱", "Ally", "Jason"], id: \.self) { n in
                        VStack(spacing: 6) {
                            Avatar(name: n, id: n, size: 58)
                            Text(n).font(.caption)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                Divider()
                HStack(alignment: .top, spacing: 0) {
                    igIcon("plus.circle", "加到限時動態")
                    igIcon("link", "複製連結")
                    igIcon("square.and.arrow.up", "分享").background { mark(1) }
                    igIcon("message", "訊息")
                    igIcon("ellipsis", "更多")
                }
                .padding(.horizontal, 8).padding(.bottom, 36)
            }
            .background(.white, in: UnevenRoundedRectangle(topLeadingRadius: 18, topTrailingRadius: 18))
            .shadow(color: .black.opacity(0.15), radius: 12, y: -2)
        }
        .background(Color.black.opacity(0.35).ignoresSafeArea())
        .ignoresSafeArea(edges: .bottom)
        .foregroundStyle(.black)
    }

    private func igIcon(_ s: String, _ t: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: s).font(.system(size: 20)).frame(width: 52, height: 52).background(Color(hex: 0xefefef), in: .circle)
            Text(t).font(.system(size: 11)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    // 3. iPhone 的分享選單
    private var iosSheet: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 8).fill(LinearGradient(colors: [Color(hex: 0xffcf8a), .accent], startPoint: .top, endPoint: .bottom))
                        .frame(width: 46, height: 46).overlay(Text("🍜"))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("taipei.eats 在 Instagram").font(.subheadline.weight(.semibold))
                        Text("instagram.com").font(.caption).foregroundStyle(.gray)
                    }
                    Spacer()
                    Image(systemName: "xmark.circle.fill").font(.title2).foregroundStyle(.gray.opacity(0.5))
                }
                .padding(.horizontal, 16).padding(.top, 18)
                Divider()
                HStack(alignment: .top, spacing: 0) {
                    shareApp(Image(systemName: "dot.radiowaves.left.and.right").foregroundStyle(.white), Color(hex: 0x3a8ef0), "AirDrop")
                    shareApp(Image(systemName: "message.fill").foregroundStyle(.white), Color(hex: 0x34c759), "訊息")
                    VStack(spacing: 6) {
                        Image("Logo").resizable().frame(width: 60, height: 60).clipShape(.rect(cornerRadius: 14))
                        Text("Bitemap").font(.system(size: 11.5))
                    }
                    .padding(4).background { mark(2) }
                    .frame(maxWidth: .infinity)
                    shareApp(Image(systemName: "note.text").foregroundStyle(.black.opacity(0.7)), Color(hex: 0xffe680), "備忘錄")
                    shareApp(Image(systemName: "ellipsis").foregroundStyle(.black.opacity(0.6)), Color(hex: 0xe5e5ea), "更多")
                }
                .padding(.horizontal, 6)
                VStack(spacing: 0) {
                    ForEach(["拷貝", "加入閱讀列表", "加入書籤"], id: \.self) { t in
                        Text(t).frame(maxWidth: .infinity, alignment: .leading).padding(14)
                        if t != "加入書籤" { Divider().padding(.leading, 14) }
                    }
                }
                .background(.white, in: .rect(cornerRadius: 12)).padding(.horizontal, 16).padding(.bottom, 36)
            }
            .background(Color(hex: 0xf2f2f7), in: UnevenRoundedRectangle(topLeadingRadius: 14, topTrailingRadius: 14))
        }
        .background(Color.black.opacity(0.3).ignoresSafeArea())
        .ignoresSafeArea(edges: .bottom)
        .foregroundStyle(.black)
    }

    private func shareApp(_ icon: some View, _ bg: Color, _ t: String) -> some View {
        VStack(spacing: 6) {
            icon.font(.system(size: 26)).frame(width: 60, height: 60).background(bg, in: .rect(cornerRadius: 14))
            Text(t).font(.system(size: 11.5)).lineLimit(1)
        }
        .padding(4)
        .frame(maxWidth: .infinity)
    }
}
