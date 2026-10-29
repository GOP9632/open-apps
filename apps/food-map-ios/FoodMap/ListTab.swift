import SwiftUI

// 收藏頁：「我的收藏 N 間」＋新增、搜尋、篩選，下面兩欄方形照片卡
struct ListTab: View {
    @Environment(Store.self) private var store
    @State private var adding = false
    @State private var path = NavigationPath()
    @State private var drawer = Drawer.shared
    @State private var show: DrawShow?
    @State private var paneling = false
    @State private var pull = PullState()
    @State private var manual: PendingAdd?
    @State private var pos = ScrollPosition(edge: .top)
    @State private var applied = Filter()   // 收藏頁在背景時畫的篩選，由 FilterSync 同步（地圖打字時這頁不用每個字重算）
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        let _ = Perf.shared.count("收藏")
        @Bindable var store = store
        // 篩選結果一次算好（每打一個字只算一次）
        let visible = store.shown(store.tab == 1 ? store.listF : applied)
        // 同一家的分店合成一張卡（最近的那間當封面）
        let groups = store.brands(visible)
        // 同一家用品牌當 id：換封面分店時卡片不會整張重建
        let cards = groups.map { BrandCard(id: store.brand($0[0]), g: $0) }
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    // 375pt 寬也要放得下標題＋「🎲 抽一間」＋齒輪＋＋：間數放到標題下面
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("我的收藏").font(.system(size: 30, weight: .black)).foregroundStyle(Color.ink)
                                .lineLimit(1).minimumScaleFactor(0.8)
                            // 跟地圖、「我的」一樣算間數（同一家的分店在這裡合成一張卡，但數字照分店算）
                            Text("\(visible.count) 間").font(.headline).foregroundStyle(Color.accent)
                                .contentTransition(.numericText(value: Double(visible.count)))
                                .animation(.snappy, value: visible.count)
                        }
                        Spacer(minLength: 0)
                        // 抽一間：跟地圖同一顆膠囊、同一份設定（長按或點齒輪改）；從上面篩選後的店抽，沒座標的也抽得到；
                        // 分店多的不會比較容易抽到，抽中離你最近的那間
                        if !store.mine.isEmpty {
                            DiceChip(draw: draw, panel: openPanel)
                        }
                        AddButton(size: 42) { adding = true }
                    }
                    .padding(.horizontal, 16)
                    // 下拉更新：甜甜圈跟著轉
                    PullDonut(pull: pull)
                    // AI 正在找的店：一張「找店中」卡，找到就翻成真的卡
                    ForEach(store.pendingAdds) { a in
                        PendingCard(add: a, manual: { manual = a }).padding(.horizontal, 16)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    StarterCard(open: { if let p = $0 { path = NavigationPath([p]) } }, add: { adding = true })
                    SearchField(text: $store.listF.q, prompt: "搜尋店名、地區、料理、標籤").padding(.horizontal, 16)
                    if !store.mine.isEmpty { FilterChips(f: $store.listF) }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
                        ForEach(cards) { c in
                            let g = c.g, p = g[0]
                            NavigationLink(value: p) { PlaceCard(place: p, branches: g, del: true, fresh: store.freshIds.contains(p.id)) }
                                .buttonStyle(PressStyle { ReelCache.warm(p) })
                                .contextMenu { if store.isMine(p) { menu(p, g.filter(store.isMine)) } }
                                .transition(reduce ? .opacity : .asymmetric(insertion: .push(from: .top), removal: .scale(scale: 0.8).combined(with: .opacity)))
                        }
                    }
                    // 篩選、搜尋改變：卡片移到新位置，被篩掉的縮小淡掉
                    .animation(reduce ? .easeOut(duration: 0.2) : .snappy(duration: 0.3), value: cards.map(\.id))
                    .padding(.horizontal, 16)
                    if visible.isEmpty && !store.loading {
                        if store.mine.isEmpty { empty } else {
                            VStack(spacing: 12) {
                                Text("沒有符合的店").font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                                Button("清除篩選") { withAnimation(.snappy) { store.listF = Filter() } }.buttonStyle(ChunkyStyle(radius: 14))
                            }
                            .frame(maxWidth: .infinity).padding(.top, 40)
                        }
                    }
                }
                .padding(.top, 8).padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.immediately)
            .scrollPosition($pos)
            .tabBarRoom()
            .background(Color.bg)
            .toolbarVisibility(.hidden, for: .navigationBar)
            // 自己做的下拉更新（甜甜圈照拉的距離轉，拉過 70 輕震，放開就同步）
            .onScrollGeometryChange(for: CGFloat.self) { -($0.contentOffset.y + $0.contentInsets.top) } action: { _, y in pull.moved(y) }
            .onScrollPhaseChange { _, ph in
                if ph != .interacting, pull.armed { pull.go({ await store.sync() }, failed: { store.saySyncFailed() }) }
            }
            .sheet(item: $manual) { a in
                EditSheet(place: {
                    // 貼的網址放來源連結，其他字當店名
                    let (u, rest) = splitLink(a.text)
                    var p = Place(id: UUID().uuidString, name: rest)
                    p.source_url = u
                    if a.been { p.status = "been"; p.rating = a.rating }
                    return p
                }(), isNew: true) { store.dropAdd(a.id) }
            }
            // 跟地圖、群組一樣用一般的推入（放大轉場會把從左邊滑回當成往下拉關閉）
            .navigationDestination(for: Place.self) { PlaceDetail(place: $0) }
            .tripDestinations()
            .overlay { if store.mine.isEmpty && store.loading { ProgressView() } }
            // 抽中的卡片蓋在收藏頁上，點卡片進店家頁
            .overlay {
                DrawStage(show: $show, reroll: { avoid, n in
                    drawer.pick(store, drawer.candidates(store, drawCtx, drawer.prefs), k: n, avoid: avoid)
                }, pick: { p in
                    drawer.record(store, p)
                    path.append(p)
                })
            }
            .sheet(isPresented: $adding) { AddSheet() }
            .sheet(isPresented: $paneling) {
                DrawPanel(ctx: drawCtx, go: { draw() }, pickHistory: { path.append($0) })
                    .presentationDetents([.medium, .large])
            }
        }
        // 推頁、返回只讓 DepthReport 重算（body 裡讀 path 的話整個收藏頁都會跟著重算）
        .background { DepthReport(path: $path, tab: 1) }
        .background { FilterSync(tab: 1, applied: $applied) }
        // 點「收藏好了」通知：回到清單頂層、捲到最上面
        .onChange(of: store.listTop) {
            path = NavigationPath()
            withAnimation(reduce ? nil : .snappy) { pos.scrollTo(edge: .top) }
        }
        .onAppear(perform: markPaint)
        .onChange(of: store.places.count) { markPaint() }
    }

    // 收藏頁的抽一間：從上面搜尋、篩選後看得到的店抽（篩了咖啡就只抽咖啡）；「地圖上看到的」在這裡當作全部，沒座標的店也算
    private var drawCtx: Drawer.Ctx { Drawer.Ctx(base: store.shown(store.listF), view: nil, ref: store.here, refIsCenter: false, onMap: false) }

    private func openPanel() {
        Perf.shared.mark("抽一間面板")
        paneling = true
    }

    private func draw() {
        let pool = drawer.candidates(store, drawCtx, drawer.prefs)
        guard !pool.isEmpty else {
            Haptic.warning()
            store.say("沒有符合的店，改一下條件")
            openPanel()
            return
        }
        drawer.spin += 1
        let m = drawer.prefs.mode
        Perf.shared.mark(m == .three ? "抽 3 間" : "抽一間")
        let ps = drawer.pick(store, pool, k: m == .three ? 3 : m == .wheel ? 8 : 1)
        guard !ps.isEmpty else { return }
        show = DrawShow(mode: m, places: ps)
    }

    private func markPaint() {
        if store.firstPaintMs == nil, !store.places.isEmpty {
            store.firstPaintMs = Int(Date().timeIntervalSince(Store.launchedAt) * 1000)
        }
    }

    // 長按卡片：直接改想去／去過、刪除；有分店時寫出是哪一間，另外可以整家刪掉（g 是篩選後看得到的分店，跟卡片上「N 間分店」一致）
    @ViewBuilder private func menu(_ p: Place, _ g: [Place]) -> some View {
        let label = g.count > 1 ? branchLabel(p) : p.name
        Button(p.been ? "「\(label)」改成想去" : "「\(label)」改成去過", systemImage: p.been ? "heart" : "checkmark.circle") {
            var n = p; n.status = p.been ? "want" : "been"; if !n.been { n.rating = nil }
            Task { await store.save(n) }
        }
        Button("刪除「\(label)」", systemImage: "trash", role: .destructive) { store.deleteWithUndo(p) }
        if g.count > 1 {
            Button("刪除整家（\(g.count) 間分店）", systemImage: "trash.fill", role: .destructive) { store.deleteManyWithUndo(g) }
        }
    }

    // 還沒有收藏：教他怎麼開始
    private var empty: some View {
        VStack(spacing: 14) {
            Image("Logo").resizable().frame(width: 110, height: 110).clipShape(.rect(cornerRadius: 28))
                .shadow(color: .cardShadow, radius: 0, y: 5)
            Text("還沒有收藏").font(.system(size: 22, weight: .black)).foregroundStyle(Color.ink)
            Text("在 IG 看到想吃的店，分享給 Bitemap 就存好了。\n也可以直接貼連結或打店名。")
                .font(.subheadline).foregroundStyle(Color.ink.opacity(0.6)).multilineTextAlignment(.center)
            Button { adding = true } label: { Label("新增一間", systemImage: "plus").frame(maxWidth: 240) }
                .buttonStyle(ChunkyStyle(radius: 16))
            Button { store.igFromCoach = false; store.showIG = true } label: { Label("從 IG 收藏怎麼用", systemImage: "camera.fill").frame(maxWidth: 240) }
                .buttonStyle(ChunkyStyle(color: .white, edge: .cardShadow, fg: .sprPink, radius: 16))
        }
        .frame(maxWidth: .infinity).padding(.top, 36)
    }
}

struct PlaceCard: View {
    let place: Place
    var branches: [Place] = []
    var del = false        // 收藏頁：刪除時這張卡縮小飛到下面的訊息條
    var fresh = false      // 剛出現的新店：亮框 1 秒
    @Environment(\.toastNS) private var ns
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Color.clear.aspectRatio(1, contentMode: .fit)
                .overlay { PhotoView(place: place, px: 500) }
                .overlay(alignment: .topLeading) { Badge(place: place).shadow(color: .black.opacity(0.12), radius: 3, y: 1).padding(8) }
                .overlay(alignment: .bottomTrailing) {
                    if branches.count > 1 {
                        Text("\(branches.count) 間分店").font(.system(size: 11.5, weight: .heavy)).foregroundStyle(.white)
                            .padding(.horizontal, 8).frame(height: 22).background(Color.ink.opacity(0.75), in: .capsule).padding(8)
                    }
                }
                .clipShape(.rect(cornerRadius: 16))
                .padding(.bottom, 4)
            // 店名一行（分店不接在後面，常被截成「…市民8…」）；分店放第二行，沒有分店才放地區
            Text(branches.count > 1 ? place.name.replacingOccurrences(of: branchLabel(place), with: "").trimmingCharacters(in: .whitespaces) : place.name)
                .font(.system(size: 15, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.85).foregroundStyle(Color.ink)
            let spot = place.branch?.isEmpty == false ? place.branch! : place.area
            Text(branches.count > 1
                 ? "📍 " + branches.map(branchLabel).joined(separator: "・")
                 : "\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(spot.isEmpty ? "" : " · " + spot)")
                .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
        }
        .padding(8).padding(.bottom, 4)
        .candy(22)
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Color.accent, lineWidth: 3).opacity(fresh ? 1 : 0))
        .multilineTextAlignment(.leading)
        .modifier(DeleteMatch(id: del ? place.id : nil, ns: ns))
    }
}

// 收藏頁一張卡：同一家的分店合起來，品牌當 id
private struct BrandCard: Identifiable {
    let id: String
    let g: [Place]
}

// 刪除：卡片和訊息條左邊的小照片接在一起（matchedGeometry）
private struct DeleteMatch: ViewModifier {
    let id: String?
    let ns: Namespace.ID?
    func body(content: Content) -> some View {
        if let id, let ns { content.matchedGeometryEffect(id: "del-" + id, in: ns) } else { content }
    }
}

extension EnvironmentValues {
    @Entry var toastNS: Namespace.ID? = nil
}

// 下拉更新的狀態（只有甜甜圈看它，捲動時收藏頁不用重畫）
@MainActor @Observable final class PullState {
    var y: CGFloat = 0
    var busy = false
    @ObservationIgnored var armed = false

    func moved(_ v: CGFloat) {
        y = max(0, v)
        if !busy, !armed, y > 70 { armed = true; Haptic.light() }
    }

    func go(_ work: @escaping () async -> Bool, failed: @escaping () -> Void = {}) {
        armed = false
        guard !busy else { return }
        withAnimation(.snappy) { busy = true }
        Task {
            let ok = await work()
            withAnimation(.easeIn(duration: 0.25)) { busy = false }
            // 等甜甜圈收完再說，不然訊息條和甜甜圈同時動
            if !ok { try? await Task.sleep(for: .seconds(0.25)); failed() }
        }
    }
}

private struct PullDonut: View {
    let pull: PullState
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        let p = min(pull.y / 70, 1)
        ZStack {
            if pull.busy || p > 0.05 {
                TimelineView(.animation(paused: !pull.busy)) { t in
                    let spin = pull.busy && !reduce ? t.date.timeIntervalSinceReferenceDate * 360 : Double(pull.y) * 4
                    Image("Logo").resizable().frame(width: 34, height: 34).clipShape(.circle)
                        .rotationEffect(.degrees(spin))
                }
                .scaleEffect(pull.busy ? 1 : 0.4 + 0.6 * p)
                .opacity(pull.busy ? 1 : p)
                .transition(.scale(scale: 0.2).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: pull.busy ? 40 : 0)
        .accessibilityLabel(pull.busy ? "更新中" : "")
    }
}

// AI 找店中：連結或店名，光每 1.2 秒掃過一次；找到翻成真的卡，失敗變提示色給「重試」「自己填」
private struct PendingCard: View {
    @Environment(Store.self) private var store
    let add: PendingAdd
    let manual: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        let found: Place? = { if case .done(let ids) = add.state { return ids.first.flatMap { store.place($0) } }; return nil }()
        FlipCard(angle: found == nil ? 180 : 0) {
            if let p = found {
                HStack(spacing: 12) {
                    PhotoView(place: p, px: 200).frame(width: 56, height: 56).clipShape(.rect(cornerRadius: 14))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(p.name).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                        Text("已收藏 \(p.cat.emoji) \(p.area)").font(.caption.weight(.bold)).foregroundStyle(Color.sprMint)
                    }
                    Spacer()
                }
                .padding(12).frame(maxWidth: .infinity).candy(20)
            }
        } back: {
            back
        }
        .animation(reduce ? nil : .easeInOut(duration: 0.45), value: found?.id)
    }

    @ViewBuilder private var back: some View {
        let failed: String? = { if case .failed(let m) = add.state { return m }; return nil }()
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text(failed == nil ? "🔎" : "😵").font(.system(size: 26))
                    .frame(width: 56, height: 56).background(Color.bg2, in: .rect(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 3) {
                    Text(failed == nil ? "找店中…" : "沒找到").font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                    Text(failed ?? add.text).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            if failed != nil {
                HStack(spacing: 10) {
                    Button("重試") { Haptic.light(); store.retryAdd(add.id) }
                        .buttonStyle(ChunkyStyle(radius: 12))
                    Button("自己填") { manual() }
                        .buttonStyle(ChunkyStyle(color: .white, edge: .cardShadow, fg: .accent, radius: 12))
                    Button { store.dropAdd(add.id) } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.4))
                            .frame(width: 44, height: 44).contentShape(.rect)
                    }
                    .accessibilityLabel("不收了")
                }
                .font(.subheadline.weight(.heavy))
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20).fill(failed == nil ? Color.panel : Color.sprYellow.opacity(0.25)).shadow(color: .cardShadow, radius: 0, y: 4))
        // 光掃過去（每 1.2 秒一次）
        .overlay {
            if failed == nil && !reduce {
                TimelineView(.animation) { t in
                    let ph = t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.2) / 1.2
                    GeometryReader { g in
                        LinearGradient(colors: [.clear, .white.opacity(0.55), .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: g.size.width * 0.35)
                            .offset(x: -g.size.width * 0.35 + (g.size.width * 1.35) * ph)
                    }
                }
                .clipShape(.rect(cornerRadius: 20))
                .allowsHitTesting(false)
            }
        }
    }
}

// 「收藏起步」：新朋友的四個小任務，照資料自己打勾，全部完成或按 ✕ 就收起來
struct StarterCard: View {
    @Environment(Store.self) private var store
    @AppStorage("starterHidden") private var hidden = false
    // 四項都完成：撒糖粒，1.2 秒後整張收起
    @State private var party = 0
    @State private var seen = false   // 這次打開看過還沒完成的卡（完成時才播收起，不會一閃不見）
    let open: (Place?) -> Void
    let add: () -> Void

    var body: some View {
        let mine = store.mine
        let tasks: [(String, Bool, () -> Void)] = [
            ("從 IG 收藏第一間", mine.contains { ($0.source_url ?? "").contains("instagram.com") }, { store.igFromCoach = false; store.showIG = true }),
            ("標一間去過，給星星", mine.contains { $0.been && $0.rating != nil }, { open(mine.first { !$0.been } ?? mine.first) }),
            ("收藏 10 間", mine.count >= 10, add),
            ("邀一個朋友進群組", store.groups.contains { store.membersOf($0.id).count >= 2 }, { withAnimation(.snappy) { store.tab = 2 } }),
        ]
        let done = tasks.filter { $0.1 }.count
        Group {
        if !hidden && (done < tasks.count || seen) && !mine.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("收藏起步：完成 \(done) / \(tasks.count)").font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                    Spacer()
                    Button { withAnimation(.snappy) { hidden = true } } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink.opacity(0.4)).frame(width: 44, height: 32).contentShape(.rect)
                    }
                    .accessibilityLabel("收起收藏起步")
                }
                SprinkleBar(progress: Double(done) / Double(tasks.count))
                ForEach(tasks.indices, id: \.self) { i in
                    let t = tasks[i]
                    Button(action: t.2) {
                        HStack(spacing: 10) {
                            // 完成時勾勾一筆畫出來
                            ZStack {
                                Circle().strokeBorder(Color.ink.opacity(t.1 ? 0 : 0.25), lineWidth: 2)
                                Circle().fill(Color.sprMint).scaleEffect(t.1 ? 1 : 0.3).opacity(t.1 ? 1 : 0)
                                CheckShape().trim(from: 0, to: t.1 ? 1 : 0)
                                    .stroke(.white, style: .init(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
                                    .padding(5)
                            }
                            .frame(width: 22, height: 22)
                            .animation(.easeOut(duration: 0.3), value: t.1)
                            Text(t.0).font(.system(size: 15, weight: .bold)).foregroundStyle(t.1 ? Color.ink.opacity(0.4) : Color.ink)
                                .strikethrough(t.1, color: Color.ink.opacity(0.3))
                            Spacer()
                            if !t.1 { Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Color.ink.opacity(0.3)) }
                        }
                        .frame(minHeight: 36).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                    .disabled(t.1)
                    .accessibilityAddTraits(t.1 ? .isSelected : [])
                }
            }
            .padding(14)
            .candy(20)
            .overlay { Confetti(shot: party).allowsHitTesting(false) }
            .padding(.horizontal, 16)
            .transition(.opacity.combined(with: .move(edge: .top)))
            .onAppear { if done < tasks.count { seen = true } }
        }
        }
        .onChange(of: done) { old, n in
                guard n == tasks.count, old < n, !hidden else { return }
                party += 1
                Haptic.success()
                Task {
                    try? await Task.sleep(for: .seconds(1.2))
                    withAnimation(.snappy) { hidden = true }
                }
        }
    }
}

// 分頁推了幾層 → store.depth（分頁列藏不藏）。只有這一小塊讀 path，推頁時收藏頁、群組頁本身不用重算
struct DepthReport: View {
    @Binding var path: NavigationPath
    let tab: Int
    @Environment(Store.self) private var store
    var body: some View { Color.clear.onChange(of: path.count) { _, n in store.depth[tab] = n; if n == 0 { store.flushFresh() } } }
}

// 共用篩選的同步：只有這一小塊讀 store.mapF 和 store.tab。
// 分頁在背景時停字 350ms 才同步一次、不帶動畫；live 的那頁（地圖）在前景時也由這裡即時同步，body 就不用讀 store.mapF
struct FilterSync: View {
    let tab: Int
    var live = false
    @Binding var applied: Filter
    @Environment(Store.self) private var store
    var body: some View {
        Color.clear
            .onAppear { applied = store.mapF }
            .onChange(of: store.mapF) { old, f in
                guard live, store.tab == tab else { return }
                // 點分類、想去去過（chips 本來就包 withAnimation(.snappy)）照舊有動畫；打字不帶動畫
                if old.q == f.q { withAnimation(.snappy) { applied = f } } else { applied = f }
            }
            .onChange(of: store.tab) { old, new in
                // 離開這頁：停在離開當下的篩選；切回 live 的那頁：馬上對齊
                guard old == tab || (live && new == tab), applied != store.mapF else { return }
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { applied = store.mapF }
            }
            .task(id: store.mapF) {
                guard store.tab != tab, applied != store.mapF else { return }
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled, store.tab != tab else { return }
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { applied = store.mapF }
            }
    }
}
