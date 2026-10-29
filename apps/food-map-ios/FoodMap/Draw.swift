import SwiftUI
import UIKit
import CoreLocation

// 抽一間的設定：存在手機裡，下次照樣用（長按 🎲 或點旁邊的小齒輪打開面板改）
struct DrawPrefs: Codable, Equatable {
    enum Scope: Codable, Equatable, Hashable { case view, near(Double), all }
    enum Status: String, Codable, CaseIterable { case any, want, beenGood }
    enum Mode: String, Codable, CaseIterable { case one, three, wheel }
    var scope: Scope = .view
    var cats: Set<String> = []        // 空的 = 全部分類
    var status: Status = .any
    var prices: Set<Int> = []         // 空的 = 不限；沒標價位的店照樣抽得到
    var mealNow = false
    var noRepeat = true               // 7 天內抽過的先跳過
    var weighted = true               // 越近、越久沒去越容易抽到
    var mode: Mode = .one

    static let walk = 800.0, ride = 3000.0, drive = 12000.0
}

// 抽一間：設定、這次開 App 抽過的店、7 天內抽過哪幾家；地圖和收藏頁共用一份
@MainActor @Observable final class Drawer {
    static let shared = Drawer()

    var prefs: DrawPrefs {
        didSet { if let d = try? JSONEncoder().encode(prefs) { UserDefaults.standard.set(String(decoding: d, as: UTF8.self), forKey: "drawPrefs") } }
    }
    // 這次開 App 抽中的店（新的在前，最多 10 家）
    private(set) var history: [String] = []
    // 按一次就加一：🎲 轉兩圈
    var spin = 0

    init() {
        let s = UserDefaults.standard.string(forKey: "drawPrefs") ?? ""
        prefs = (try? JSONDecoder().decode(DrawPrefs.self, from: Data(s.utf8))) ?? DrawPrefs()
    }

    // 從哪些店抽：base 是地圖（我的收藏或群組）或收藏頁的全部；view 是地圖現在看到的那些（收藏頁沒有）
    struct Ctx {
        var base: [Place]
        var view: [Place]?
        var ref: CLLocation?          // 算距離的起點：目前位置，沒有就是地圖中心
        var refIsCenter = false
        var onMap = true              // 地圖上只抽有座標的店
    }

    // 現在是哪一餐
    static func meal(_ d: Date = Date()) -> (key: String, name: String) {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        let m = (c.hour ?? 12) * 60 + (c.minute ?? 0)
        switch m {
        case 300..<630: return ("breakfast", "早餐")
        case 630..<840: return ("lunch", "午餐")
        case 840..<1020: return ("tea", "下午茶")
        case 1020..<1260: return ("dinner", "晚餐")
        default: return ("night", "宵夜")
        }
    }

    // 符合條件的店：同一家的分店只算一家，留離你最近的那間
    func candidates(_ store: Store, _ c: Ctx, _ p: DrawPrefs) -> [Place] {
        store.brands(matching(store, c, p)).map { $0[0] }
    }

    // 符合條件的每一間（分店各算一間；面板說明「分店算一家（共 N 間）」用）
    func matching(_ store: Store, _ c: Ctx, _ p: DrawPrefs) -> [Place] {
        var l: [Place]
        switch p.scope {
        case .view: l = c.onMap ? (c.view ?? c.base) : c.base
        case .near(let m):
            if let r = c.ref {
                l = c.base.filter { q in
                    guard let la = q.lat, let lo = q.lng else { return false }
                    return r.distance(from: CLLocation(latitude: la, longitude: lo)) <= m
                }
            } else { l = c.base }
        case .all: l = c.base
        }
        if c.onMap { l = l.filter { $0.lat != nil && $0.lng != nil } }
        if !p.cats.isEmpty { l = l.filter { p.cats.contains($0.cat.key) } }
        switch p.status {
        case .want: l = l.filter { !$0.been }
        case .beenGood: l = l.filter { $0.been && ($0.rating ?? 0) >= 4 }
        case .any: break
        }
        if !p.prices.isEmpty { l = l.filter { $0.price.map { p.prices.contains($0) } ?? true } }
        if p.mealNow {
            let k = Self.meal().key
            l = l.filter { ($0.meals ?? []).isEmpty || $0.meals!.contains(k) }
        }
        return l
    }

    // 一家都不符合時：拿掉哪個條件剩最多家
    func hint(_ store: Store, _ c: Ctx, _ p: DrawPrefs) -> (label: String, n: Int, fix: DrawPrefs)? {
        var opts: [(String, DrawPrefs)] = []
        if p.scope != .all { var q = p; q.scope = .all; opts.append(("範圍", q)) }
        if !p.cats.isEmpty { var q = p; q.cats = []; opts.append(("分類", q)) }
        if p.status != .any { var q = p; q.status = .any; opts.append(("想去／去過", q)) }
        if !p.prices.isEmpty { var q = p; q.prices = []; opts.append(("價位", q)) }
        if p.mealNow { var q = p; q.mealNow = false; opts.append(("這一餐", q)) }
        return opts.map { ($0.0, candidates(store, c, $0.1).count, $0.1) }.filter { $0.1 > 0 }.max { $0.1 < $1.1 }
    }

    // 從 pool 抽 k 家（不同品牌）。avoid：這次不要的品牌（「再抽一次」不抽剛剛那家）
    func pick(_ store: Store, _ pool: [Place], k: Int, avoid: Set<String> = []) -> [Place] {
        var l = pool.filter { !avoid.contains(store.brand($0)) }
        if l.isEmpty { l = pool }
        if prefs.noRepeat {
            let recent = recentBrands()
            let fresh = l.filter { !recent.contains(store.brand($0)) }
            if fresh.isEmpty, !l.isEmpty { store.say("7 天內都抽過了，這次不排除") } else { l = fresh }
        }
        var w = l.map { prefs.weighted ? weight(store, $0) : 1 }
        var out: [Place] = []
        while out.count < k, !l.isEmpty {
            var x = Double.random(in: 0..<max(w.reduce(0, +), 1e-9))
            var i = 0
            while i < l.count - 1, x >= w[i] { x -= w[i]; i += 1 }
            out.append(l.remove(at: i)); w.remove(at: i)
        }
        return out
    }

    // 權重 = 距離 × 等待：近的、收藏很久還沒去的比較容易抽到
    private func weight(_ store: Store, _ p: Place) -> Double {
        let dist = store.distance(p).map { 1 / (1 + $0 / 1000 / 2) } ?? 1
        guard !p.been else { return dist }
        let days = Self.day.date(from: String((p.created_at ?? "").prefix(10))).map { Date().timeIntervalSince($0) / 86400 } ?? 0
        return dist * (1 + min(max(days, 0), 90) / 90)
    }
    private static let day: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    // 真的抽中（選了那間）才記：這次開 App 的紀錄、7 天不重複
    func record(_ store: Store, _ p: Place) {
        history.removeAll { $0 == p.id }
        history.insert(p.id, at: 0)
        if history.count > 10 { history.removeLast() }
        var r = recent()
        r[store.brand(p)] = Date().timeIntervalSince1970
        UserDefaults.standard.set(r, forKey: "drawRecent")
    }

    private func recent() -> [String: Double] {
        let now = Date().timeIntervalSince1970
        return (UserDefaults.standard.dictionary(forKey: "drawRecent") as? [String: Double] ?? [:]).filter { now - $0.value < 7 * 86400 }
    }
    private func recentBrands() -> Set<String> { Set(recent().keys) }

    // 這些店裡 7 天內抽過的有幾家（面板小字用）
    func recentCount(_ store: Store, _ pool: [Place]) -> Int {
        let r = recentBrands()
        return pool.filter { r.contains(store.brand($0)) }.count
    }

    // 抽中的丟到群組投票：當下就切到群組頁，分享和開一輪在背景跑
    func vote(_ store: Store, _ gid: String, _ ps: [Place]) {
        Perf.shared.mark("群組投票")
        Haptic.success()
        store.groupJump = GroupJump(gid: gid, rid: nil)
        withAnimation(.snappy) { store.tab = 2 }
        Task {
            await store.share(gid, ps.filter(store.isMine).map(\.id))
            if let r = await store.startRound(gid, title: "抽一間：今天吃哪間？", pool: ps, filters: [:]) {
                store.groupJump = GroupJump(gid: gid, rid: r.id)
            }
        }
    }
}

// 群組頁要直接打開的群組（和那一輪）
struct GroupJump: Equatable { let gid: String; let rid: String? }

// 🎲 抽一間的膠囊：點一下照設定抽、長按 0.35 秒（或點旁邊的小齒輪）打開設定
struct DiceChip: View {
    var text = "抽一間"
    let draw: () -> Void
    let panel: () -> Void
    @State private var drawer = Drawer.shared
    @State private var long = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        HStack(spacing: 6) {
            Button {
                if long { long = false; return }
                draw()
            } label: {
                HStack(spacing: 5) {
                    Text("🎲").rotationEffect(.degrees(reduce ? 0 : Double(drawer.spin) * 720))
                        .animation(.easeOut(duration: 0.5), value: drawer.spin)
                    Text(text)
                }
                .font(.subheadline.weight(.heavy)).foregroundStyle(.white)
                .padding(.horizontal, 14).frame(height: 36)
                .background(Color.accent, in: .capsule)
                .frame(minHeight: 44).contentShape(.rect)
            }
            // 每次按下先清掉上一次的長按記號
            .buttonStyle(PressStyle(haptic: true) { long = false })
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                long = true
                Haptic.medium()
                panel()
            })
            .accessibilityHint("照你的設定隨機挑一間，長按改設定")
            Button(action: panel) {
                Image(systemName: "slider.horizontal.3").font(.system(size: 14, weight: .heavy)).foregroundStyle(Color.accent)
                    .frame(width: 36, height: 36).background(Color.accent.opacity(0.13), in: .circle)
                    .frame(width: 40, height: 44).contentShape(.rect)
            }
            .buttonStyle(PressStyle(haptic: true))
            .accessibilityLabel("抽一間的設定")
        }
        .fixedSize()
    }
}

// 這次開 App 抽過的店：一排圓形小照片，點一個就回到那間（抽過 2 家以上才出現）
struct DrawHistory: View {
    @Environment(Store.self) private var store
    @State private var drawer = Drawer.shared
    let tap: (Place) -> Void
    var body: some View {
        let ps = drawer.history.compactMap { store.place($0) }
        if ps.count >= 2 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Text("抽過").font(.caption.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.45))
                    ForEach(ps) { p in
                        Button { Haptic.light(); tap(p) } label: {
                            PhotoView(place: p, px: 120).frame(width: 32, height: 32).clipShape(.circle)
                                .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                                .frame(width: 40, height: 44).contentShape(.rect)
                        }
                        .buttonStyle(PressStyle())
                        .accessibilityLabel(p.name)
                    }
                }
                .padding(.horizontal, 18)
            }
            .transition(.opacity)
        }
    }
}

// 長按 🎲 打開的設定面板：範圍、分類、狀態、價位、這一餐、不重複、加權、模式；底部即時顯示符合幾家
struct DrawPanel: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var drawer = Drawer.shared
    let ctx: Drawer.Ctx
    let go: () -> Void
    var pickHistory: ((Place) -> Void)? = nil

    var body: some View {
        @Bindable var drawer = drawer
        let p = drawer.prefs
        let all = drawer.matching(store, ctx, p)
        let pool = store.brands(all).map { $0[0] }
        let n = pool.count
        // 全部都抽過時 pick 不排除，就不說跳過
        let recent = p.noRepeat ? drawer.recentCount(store, pool) : 0
        let skip = recent < n ? recent : 0
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let pickHistory { DrawHistory { pickHistory($0); dismiss() }.padding(.horizontal, -18) }
                    section("範圍") {
                        chip("全部", p.scope == .all || (!ctx.onMap && p.scope == .view)) { drawer.prefs.scope = .all }
                        if ctx.onMap { chip("地圖上看到的", p.scope == .view) { drawer.prefs.scope = .view } }
                        chip("走路 800 m", p.scope == .near(DrawPrefs.walk)) { drawer.prefs.scope = .near(DrawPrefs.walk) }
                        chip("騎車 3 km", p.scope == .near(DrawPrefs.ride)) { drawer.prefs.scope = .near(DrawPrefs.ride) }
                        chip("開車 12 km", p.scope == .near(DrawPrefs.drive)) { drawer.prefs.scope = .near(DrawPrefs.drive) }
                    }
                    if case .near = p.scope, ctx.refIsCenter || ctx.ref == nil {
                        Text(ctx.ref == nil ? "沒開定位，抽全部" : "沒開定位，從地圖中心算").font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).padding(.top, -10)
                    }
                    section("分類") {
                        chip("全部", p.cats.isEmpty) { drawer.prefs.cats = [] }
                        ForEach(Cat.order, id: \.self) { k in
                            let c = Cat.all[k]!
                            chip("\(c.emoji) \(c.name)", p.cats.contains(k), color: c.color) {
                                if p.cats.contains(k) { drawer.prefs.cats.remove(k) } else { drawer.prefs.cats.insert(k) }
                            }
                        }
                    }
                    section("想去／去過") {
                        chip("都可以", p.status == .any) { drawer.prefs.status = .any }
                        chip("想去的", p.status == .want, color: .sprPink) { drawer.prefs.status = .want }
                        chip("去過、4 星以上", p.status == .beenGood, color: .sprMint) { drawer.prefs.status = .beenGood }
                    }
                    section("價位") {
                        chip("不限", p.prices.isEmpty) { drawer.prefs.prices = [] }
                        ForEach(1...4, id: \.self) { i in
                            chip(PRICES[i] ?? "", p.prices.contains(i)) {
                                if p.prices.contains(i) { drawer.prefs.prices.remove(i) } else { drawer.prefs.prices.insert(i) }
                            }
                        }
                    }
                    VStack(spacing: 4) {
                        Toggle("只抽適合這一餐的（現在是\(Drawer.meal().name)）", isOn: $drawer.prefs.mealNow)
                        Toggle("7 天內抽過的先跳過", isOn: $drawer.prefs.noRepeat)
                        Toggle("越近、越久沒去越容易抽到", isOn: $drawer.prefs.weighted)
                    }
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink).tint(.accent)
                    section("怎麼抽") {
                        chip("🎲 一間", p.mode == .one) { drawer.prefs.mode = .one }
                        chip("🃏 三間挑一", p.mode == .three) { drawer.prefs.mode = .three }
                        chip("🍩 轉盤", p.mode == .wheel) { drawer.prefs.mode = .wheel }
                    }
                }
                .padding(18)
            }
            .background(Color.bg)
            .navigationTitle("抽一間").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("完成") { dismiss() } }
            .safeAreaInset(edge: .bottom, spacing: 0) { bottom(n, all.count, skip) }
        }
        // 跟按下去那一刻的「抽一間面板」分開記：兩行差不多＝建 sheet 卡住；這行大很多＝內容晚一輪才建
        .onAppear { Perf.shared.mark("抽一間面板內容") }
    }

    // n：符合幾家（分店算一家）；total：分店各算一間共幾間；skip：7 天內抽過、這次先跳過的家數
    private func bottom(_ n: Int, _ total: Int, _ skip: Int) -> some View {
        VStack(spacing: 8) {
            if n == 0, let h = drawer.hint(store, ctx, drawer.prefs) {
                HStack {
                    Text("把「\(h.label)」拿掉就有 \(h.n) 家").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink.opacity(0.7))
                    Spacer()
                    Button("拿掉") { Haptic.light(); withAnimation(.snappy) { drawer.prefs = h.fix } }
                        .font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }
            // 「符合 82 家」跟收藏頁的「86 間」單位不一樣：說清楚（獨立一行，不擠「抽！」那排）
            let notes = [total > n ? "分店算一家（共 \(total) 間）" : nil, skip > 0 ? "7 天內抽過的 \(skip) 家先跳過" : nil].compactMap { $0 }
            if !notes.isEmpty {
                Text(notes.joined(separator: "・")).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                    .frame(maxWidth: .infinity, alignment: .leading).lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 12) {
                (Text("符合 ") + Text("\(n)").foregroundStyle(Color.accent) + Text(" 家"))
                    .font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink)
                    .contentTransition(.numericText(value: Double(n)))
                    .animation(.snappy, value: n)
                Spacer()
                Button {
                    dismiss()
                    go()
                } label: { Text("抽！").font(.system(size: 18, weight: .heavy)).frame(width: 120, height: 48) }
                .buttonStyle(ChunkyStyle(radius: 16))
                .disabled(n == 0)
                .opacity(n == 0 ? 0.4 : 1)
            }
        }
        .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 8)
        .background(Color.panel.shadow(.drop(color: .black.opacity(0.08), radius: 8, y: -2)), ignoresSafeAreaEdges: .bottom)
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 14, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.5))
            Flow { c() }
        }
    }

    private func chip(_ t: String, _ on: Bool, color: Color = .accent, _ act: @escaping () -> Void) -> some View {
        Chip(text: t, on: on, color: color) { Haptic.tick(); withAnimation(.snappy) { act() } }
    }
}

// 抽出來的結果蓋在畫面上：卡片（一間或三間）或甜甜圈轉盤
struct DrawShow: Identifiable, Equatable {
    let id = UUID()
    var mode: DrawPrefs.Mode
    var places: [Place]
}

struct DrawStage: View {
    @Binding var show: DrawShow?
    // 換掉沒鎖的：給要排除的品牌和張數，回新的幾家
    let reroll: (Set<String>, Int) -> [Place]
    var hop: ((Place) -> Void)? = nil
    let pick: (Place) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        ZStack {
            if let s = show {
                Color.black.opacity(0.35).ignoresSafeArea()
                    .onTapGesture { close() }
                    .transition(.opacity)
                Group {
                    if s.mode == .wheel {
                        DrawWheel(places: s.places, pick: { p in pick(p); close() })
                    } else {
                        DrawCards(places: Binding(get: { show?.places ?? [] }, set: { show?.places = $0 }),
                                  one: s.mode == .one, reroll: reroll, hop: hop, pick: { p in pick(p); close() }, close: close)
                    }
                }
                .id(s.id)
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: show?.id)
    }

    private func close() { withAnimation(.easeOut(duration: 0.2)) { show = nil } }
}

// 抽 3 間：卡片從按鈕飛出來攤成扇形，一張一張翻開；可以鎖住喜歡的、換掉其他的、丟到群組投票
struct DrawCards: View {
    @Environment(Store.self) private var store
    @Binding var places: [Place]
    var one = false
    let reroll: (Set<String>, Int) -> [Place]
    var hop: ((Place) -> Void)?
    let pick: (Place) -> Void
    let close: () -> Void
    @State private var out = false
    @State private var up: Set<String> = []
    @State private var locked: Set<String> = []
    @State private var chosen: String?
    @State private var burst = 0
    @State private var drag: CGFloat = 0
    @State private var askGroup = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                // 中間那張最大、疊在最上面；旁邊兩張小一點、斜斜壓在後面（露出大半，點得到）
                ForEach(Array(places.enumerated()), id: \.element.id) { i, p in
                    let mid = Double(places.count - 1) / 2, k = Double(i) - mid
                    let w = cardW(center: k == 0)
                    card(p, w: w, lockLeft: k < 0)
                        .rotationEffect(.degrees(out && chosen == nil ? k * 5 : 0))
                        .offset(x: out ? CGFloat(k) * sideX : 0, y: out ? CGFloat(abs(k)) * 18 : 420)
                        .scaleEffect(out ? (chosen == p.id ? 1.05 : 1) : 0.3)
                        .opacity(chosen == nil || chosen == p.id ? 1 : 0)
                        .offset(y: chosen == p.id ? 300 : 0)
                        .zIndex(chosen == p.id ? 2 : k == 0 ? 1 : 0)
                }
            }
            .frame(height: cardH(cardW(center: true)) + 24)
            .overlay { Confetti(shot: burst).allowsHitTesting(false) }
            HStack(spacing: 10) {
                if one {
                    pill("🎲 再抽一次", "arrow.clockwise") { swap() }
                } else {
                    pill("換掉沒鎖的", "arrow.triangle.2.circlepath") { swap() }
                        .disabled(locked.count >= places.count)
                    if !store.groups.isEmpty {
                        pill("丟到群組投票", "person.3.fill") {
                            if store.groups.count == 1 { send(store.groups[0].id) } else { askGroup = true }
                        }
                    }
                }
            }
            .opacity(chosen == nil ? 1 : 0)
            Text(one ? "點卡片看這間" : "點一張就選它，鎖頭可以留著不換").font(.caption.weight(.bold)).foregroundStyle(.white.opacity(0.85))
                .opacity(chosen == nil ? 1 : 0)
        }
        .offset(y: max(drag, 0))
        .gesture(DragGesture().onChanged { drag = $0.translation.height }.onEnded { v in
            if v.translation.height > 80 { close() } else { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { drag = 0 } }
        })
        .confirmationDialog("丟到哪個群組投票？", isPresented: $askGroup, titleVisibility: .visible) {
            ForEach(store.groups) { g in Button(g.name) { send(g.id) } }
        }
        .task { await deal(places.map(\.id)) }
    }

    // 卡片大小跟螢幕寬度走：一張時大一點；三張時中間約 0.44 個螢幕寬，旁邊兩張小一點、整張留在螢幕裡
    private var screenW: CGFloat { MapTab.mapWidth }
    private func cardW(center: Bool) -> CGFloat {
        if places.count == 1 { return min(230, screenW * 0.58) }
        return center ? min(176, screenW * 0.44) : min(148, screenW * 0.37)
    }
    private func cardH(_ w: CGFloat) -> CGFloat { w - 16 + 78 }
    // 旁邊那張的外緣（含轉 5 度後翹出去的角、上面的鎖頭）離螢幕邊至少 12pt
    private var sideX: CGFloat {
        let w: CGFloat = cardW(center: false)
        let h: CGFloat = cardH(w)
        let tilt: CGFloat = sin(CGFloat.pi * 5 / 180)
        let half: CGFloat = screenW / 2
        return half - w / 2 - 12 - h / 2 * tilt
    }

    // 鎖頭放在露出來的那一角：左邊那張放左上，其他放右上（中間那張壓在旁邊兩張的內側角上）
    private func card(_ p: Place, w: CGFloat, lockLeft: Bool) -> some View {
        FlipCard(angle: up.contains(p.id) ? 0 : 180) {
            VStack(alignment: .leading, spacing: 5) {
                PhotoView(place: p, px: 600).frame(width: w - 16, height: w - 16).clipShape(.rect(cornerRadius: 14))
                Text(p.name).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(p.cat.emoji) \(p.cuisine?.isEmpty == false ? p.cuisine! : p.cat.name)\(p.area.isEmpty ? "" : " · " + p.area)")
                    .font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(8)
            .frame(width: w, height: cardH(w))
            .background(Color.panel, in: .rect(cornerRadius: 16))
            .overlay(alignment: lockLeft ? .topLeading : .topTrailing) {
                if !one {
                    Button {
                        Haptic.tick()
                        withAnimation(.snappy) { if locked.contains(p.id) { locked.remove(p.id) } else { locked.insert(p.id) } }
                    } label: {
                        Image(systemName: locked.contains(p.id) ? "lock.fill" : "lock.open.fill").font(.system(size: 12, weight: .heavy))
                            .foregroundStyle(locked.contains(p.id) ? .white : Color.ink.opacity(0.6))
                            .frame(width: 28, height: 28).background(locked.contains(p.id) ? Color.accent : .white.opacity(0.9), in: .circle)
                            .frame(width: 44, height: 44).contentShape(.rect)
                    }
                    .accessibilityLabel(locked.contains(p.id) ? "解鎖" : "鎖住，換的時候留著")
                }
            }
        } back: {
            RoundedRectangle(cornerRadius: 16).fill(Color.grad)
                .overlay { Text("🍩").font(.system(size: 44)) }
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.white, lineWidth: 3))
                .frame(width: w, height: cardH(w))
        }
        .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
        .onTapGesture {
            guard chosen == nil, up.contains(p.id) else { return }
            Haptic.medium()
            withAnimation(reduce ? .easeOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.8)) { chosen = p.id }
            // 馬上選（推店家頁、地圖選中），卡片的動畫在關掉時一起淡出
            pick(p)
        }
        .accessibilityLabel(up.contains(p.id) ? p.name : "還沒翻開")
        .accessibilityAddTraits(.isButton)
    }

    private func pill(_ t: String, _ icon: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Label(t, systemImage: icon).font(.subheadline.weight(.heavy)).foregroundStyle(Color.ink)
                .padding(.horizontal, 14).frame(height: 40).background(.white, in: .capsule)
                .frame(minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(PressStyle(haptic: true))
    }

    // 飛出來 → 每隔 0.12 秒翻一張（輕震、對應的圖釘跳一下）→ 最後一張翻完撒糖粒
    private func deal(_ ids: [String]) async {
        if !out {
            if reduce { withAnimation(.easeOut(duration: 0.2)) { out = true } }
            else { withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { out = true } }
            try? await Task.sleep(for: .milliseconds(reduce ? 0 : 200))
        }
        for (i, id) in ids.enumerated() {
            if i > 0 { try? await Task.sleep(for: .milliseconds(120)) }
            guard !Task.isCancelled else { return }
            withAnimation(reduce ? .easeOut(duration: 0.2) : .easeInOut(duration: 0.3)) { _ = up.insert(id) }
            Haptic.tick()
            if let p = places.first(where: { $0.id == id }) { hop?(p) }
        }
        try? await Task.sleep(for: .milliseconds(300))
        if !reduce { burst += 1 }
        Haptic.success()
    }

    private func swap() {
        let keep = places.filter { locked.contains($0.id) }
        let n = places.count - keep.count
        guard n > 0 else { return }
        Perf.shared.mark(one ? "抽一間" : "抽 3 間")
        let new = reroll(Set(places.map(store.brand)), n)
        guard !new.isEmpty else { store.say("沒有別家可以換了"); return }
        var i = 0
        places = places.map { (p: Place) -> Place in
            if locked.contains(p.id) || i >= new.count { return p }
            defer { i += 1 }
            return new[i]
        }
        let fresh = places.map(\.id).filter { !up.contains($0) }
        Task { await deal(fresh) }
    }

    private func send(_ gid: String) {
        Drawer.shared.vote(store, gid, places)
        close()
    }
}

// 翻牌：角度 180 是背面、0 是正面，翻到一半換面
struct FlipCard<F: View, B: View>: View, Animatable {
    var angle: Double
    let front: F
    let back: B
    init(angle: Double, @ViewBuilder front: () -> F, @ViewBuilder back: () -> B) {
        self.angle = angle; self.front = front(); self.back = back()
    }
    var animatableData: Double { get { angle } set { angle = newValue } }
    var body: some View {
        ZStack {
            if angle < 90 { front } else { back.scaleEffect(x: -1) }
        }
        .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
    }
}

// 甜甜圈轉盤：最多 8 家，拖著轉（放開會滑一陣子）或點中間「轉」；停下指到的那間就是今天吃的
struct DrawWheel: View {
    @Environment(Store.self) private var store
    let places: [Place]
    let pick: (Place) -> Void
    @State private var angle = 0.0          // 順時針轉了幾弧度
    @State private var run: Task<Void, Never>?
    @State private var lastIdx = -1
    @State private var dragLast: (a: Double, t: CFTimeInterval)?
    @State private var vel = 0.0
    @State private var won: String?
    @State private var burst = 0
    @Environment(\.accessibilityReduceMotion) private var reduce
    private let size: CGFloat = 300
    // 每格不同顏色（相鄰的分得出來）；分類看格子裡的食物圖示
    private static let colors: [Color] = [.accent, .sprPink, .sprBlue, .sprMint, .sprPurple, Color(hex: 0xe8a200), Color(hex: 0x1fbf8f), Color(hex: 0xff4f9a).mix(with: .accent, by: 0.5)]

    private var seg: Double { 2 * .pi / Double(max(places.count, 1)) }

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                wheel.rotationEffect(.radians(angle))
                    .frame(width: size, height: size)
                    .contentShape(.circle)
                    .gesture(spinDrag)
                    .swipeBackBlocked()
                Button(action: spinRandom) {
                    Text(won == nil ? "轉" : "🎉").font(.system(size: 26, weight: .black)).foregroundStyle(.white)
                        .frame(width: 92, height: 92).background(Color.ink, in: .circle)
                        .overlay(Circle().strokeBorder(.white, lineWidth: 4))
                }
                .buttonStyle(PressStyle(haptic: true))
                .accessibilityLabel("轉轉盤")
                // 上面的指針
                Triangle().fill(Color.ink).frame(width: 26, height: 22)
                    .rotationEffect(.degrees(180))
                    .overlay(Triangle().stroke(.white, lineWidth: 2.5).rotationEffect(.degrees(180)))
                    .offset(y: -size / 2 - 4)
                Confetti(shot: burst).allowsHitTesting(false).offset(y: -size / 2 + 30)
            }
            .frame(width: size, height: size)
            .coordinateSpace(.named("wheel"))
            Text(won.flatMap { id in places.first { $0.id == id }?.name } ?? "拖著轉，或點中間")
                .font(.system(size: 17, weight: .heavy)).foregroundStyle(.white)
                .contentTransition(.opacity)
        }
        .onAppear { Perf.shared.mark("轉盤"); lastIdx = index }
        .onDisappear { run?.cancel() }
    }

    private var wheel: some View {
        ZStack {
            ForEach(Array(places.enumerated()), id: \.element.id) { i, p in
                let a0 = Double(i) * seg, mid = a0 + seg / 2
                Slice(start: a0, end: a0 + seg, inner: 0.3)
                    .fill(Self.colors[i % Self.colors.count])
                    .overlay(Slice(start: a0, end: a0 + seg, inner: 0.3).stroke(.white, lineWidth: 3))
                    .scaleEffect(won == p.id ? 1.06 : 1)
                    .animation(.spring(response: 0.3, dampingFraction: 0.45), value: won)
                // 食物圖示和店名，沿著半徑方向排
                HStack(spacing: 4) {
                    Text(p.cat.emoji).font(.system(size: 18))
                    Text(p.name).font(.system(size: 12.5, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
                        .frame(width: size * 0.26, alignment: .leading)
                }
                .rotationEffect(.radians(mid - .pi / 2))
                .offset(x: CGFloat(sin(mid)) * size * 0.32, y: -CGFloat(cos(mid)) * size * 0.32)
            }
        }
        .frame(width: size, height: size)
        .contentShape(.circle)
    }

    // 指針指到第幾格
    private var index: Int {
        let a = (-angle).truncatingRemainder(dividingBy: 2 * .pi)
        return min(Int((a < 0 ? a + 2 * .pi : a) / seg), places.count - 1)
    }

    private func tick() {
        let i = index
        if i != lastIdx { lastIdx = i; Haptic.tick() }
    }

    private var spinDrag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named("wheel"))
            .onChanged { v in
                guard won == nil else { return }
                run?.cancel()
                let a = Double(atan2(v.location.x - size / 2, -(v.location.y - size / 2)))
                let now = CACurrentMediaTime()
                if let l = dragLast {
                    var d = a - l.a
                    if d > .pi { d -= 2 * .pi } else if d < -.pi { d += 2 * .pi }
                    angle += d
                    let dt = max(now - l.t, 1.0 / 240)
                    vel = 0.6 * (d / dt) + 0.4 * vel
                    tick()
                }
                dragLast = (a, now)
            }
            .onEnded { _ in
                dragLast = nil
                guard won == nil else { return }
                // 放開時接著轉，摩擦約 3 rad/s²；甩太慢就停在原地
                if abs(vel) > 1.5 { coast(vel) }
                vel = 0
            }
    }

    private func coast(_ v0: Double) {
        run?.cancel()
        run = Task { @MainActor in
            var w = v0, t = CACurrentMediaTime()
            while abs(w) > 0.08, !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(8))
                let now = CACurrentMediaTime(), dt = now - t; t = now
                let nw = w - (w > 0 ? 1 : -1) * 3 * dt
                if nw * w <= 0 { break }
                w = nw
                angle += w * dt
                tick()
            }
            if !Task.isCancelled { finish() }
        }
    }

    // 點中間：先照設定（加權、不重複）挑好中哪格，再轉 2–4 圈停在那格（2.5 秒，越轉越慢）
    private func spinRandom() {
        guard won == nil, !places.isEmpty else { return }
        run?.cancel()
        let w = Drawer.shared.pick(store, places, k: 1).first.flatMap { p in places.firstIndex { $0.id == p.id } } ?? Int.random(in: 0..<places.count)
        let target = -(Double(w) + 0.5 + Double.random(in: -0.3...0.3)) * seg
        var d = (target - angle).truncatingRemainder(dividingBy: 2 * .pi)
        if d < 0 { d += 2 * .pi }
        let total = d + 2 * .pi * Double(Int.random(in: 2...3))
        let start = angle, dur = reduce ? 0.6 : 2.5
        run = Task { @MainActor in
            let t0 = CACurrentMediaTime()
            while !Task.isCancelled {
                let u = min((CACurrentMediaTime() - t0) / dur, 1)
                angle = start + total * (1 - pow(1 - u, 3))
                tick()
                if u >= 1 { break }
                try? await Task.sleep(for: .milliseconds(8))
            }
            if !Task.isCancelled { finish() }
        }
    }

    private func finish() {
        let p = places[index]
        won = p.id
        Haptic.success()
        if !reduce { burst += 1 }
        Task {
            try? await Task.sleep(for: .milliseconds(400))
            pick(p)
        }
    }
}

// 甜甜圈的一格（start、end 從正上方順時針量，弧度）
struct Slice: Shape {
    var start: Double, end: Double, inner: CGFloat
    func path(in r: CGRect) -> Path {
        let c = CGPoint(x: r.midX, y: r.midY), R = min(r.width, r.height) / 2, ri = R * inner
        // Path 的角度從 3 點鐘方向起算，所以減 90°
        let a0 = Angle.radians(start - .pi / 2), a1 = Angle.radians(end - .pi / 2)
        var p = Path()
        p.addArc(center: c, radius: R, startAngle: a0, endAngle: a1, clockwise: false)
        p.addArc(center: c, radius: ri, startAngle: a1, endAngle: a0, clockwise: true)
        p.closeSubpath()
        return p
    }
}

// 彩色糖粒：shot 一變就從中間噴出去再往下掉（0.7 秒）
struct Confetti: View {
    let shot: Int
    private static let dots: [Color] = ([0xff4f9a, 0x2ed3a0, 0x4da3ff, 0xffd23f, 0xff8a00, 0x8a5cf6] as [UInt32]).map { Color(hex: $0) }
    var body: some View {
        Color.clear
            .keyframeAnimator(initialValue: -1.0, trigger: shot) { v, t in
                v.overlay {
                    if t >= 0, t < 1 {
                        Canvas { ctx, s in
                            let c = CGPoint(x: s.width / 2, y: s.height / 2), e = 1 - pow(1 - t, 2)
                            for i in 0..<16 {
                                let a = 2 * Double.pi * (Double(i) + 0.3) / 16
                                let d = 70 + 60 * (Double(i) * 0.618).truncatingRemainder(dividingBy: 1)
                                let p = CGPoint(x: c.x + cos(a) * d * e, y: c.y + sin(a) * d * e + 60 * t * t)
                                ctx.fill(Path(roundedRect: CGRect(x: p.x - 4, y: p.y - 2, width: 8, height: 4), cornerRadius: 2),
                                         with: .color(Self.dots[i % Self.dots.count].opacity(1 - t)))
                            }
                        }
                    }
                }
            } keyframes: { _ in
                KeyframeTrack { MoveKeyframe(0.0); LinearKeyframe(1.0, duration: 0.7) }
            }
            .accessibilityHidden(true)
    }
}
