import SwiftUI

// 收藏頁：「我的收藏 N 間」＋新增、搜尋、篩選，下面兩欄方形照片卡
struct ListTab: View {
    @Environment(Store.self) private var store
    @State private var adding = false
    @State private var path: [Place] = []
    @State private var drawer = Drawer.shared
    @State private var show: DrawShow?
    @State private var paneling = false
    @State private var long = false

    var body: some View {
        @Bindable var store = store
        // 篩選結果一次算好（每打一個字只算一次）
        let visible = store.shown(store.listF)
        // 同一家的分店合成一張卡（最近的那間當封面）
        let groups = store.brands(visible)
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("我的收藏").font(.system(size: 30, weight: .black)).foregroundStyle(Color.ink)
                            Text("\(groups.count) 家").font(.headline).foregroundStyle(Color.accent)
                        }
                        Spacer()
                        // 抽一間：跟地圖同一份設定（長按改），這裡沒座標的店也抽得到；分店多的不會比較容易抽到，抽中離你最近的那間
                        if !store.mine.isEmpty {
                            Button {
                                if long { long = false; return }
                                draw()
                            } label: {
                                Text("🎲").font(.system(size: 22))
                                    .rotationEffect(.degrees(Double(drawer.spin) * 720))
                                    .animation(.easeOut(duration: 0.5), value: drawer.spin)
                                    .frame(width: 42, height: 42)
                                    .background(RoundedRectangle(cornerRadius: 42 * 0.32).fill(Color.accent.opacity(0.13)))
                                    .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                            }
                            .buttonStyle(PressStyle(haptic: true) { long = false })
                            .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                                long = true
                                Haptic.medium()
                                openPanel()
                            })
                            .accessibilityLabel("抽一間")
                            .accessibilityHint("長按改設定")
                        }
                        AddButton(size: 42) { adding = true }
                    }
                    .padding(.horizontal, 16)
                    StarterCard(open: { if let p = $0 { path = [p] } }, add: { adding = true })
                    SearchField(text: $store.listF.q, prompt: "搜尋店名、地區、料理、標籤").padding(.horizontal, 16)
                    if !store.mine.isEmpty { FilterChips(f: $store.listF) }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
                        ForEach(groups, id: \.first!.id) { g in
                            let p = g[0]
                            NavigationLink(value: p) { PlaceCard(place: p, branches: g) }
                                .buttonStyle(PressStyle { ReelCache.warm(p) })
                                .contextMenu { if store.isMine(p) { menu(p) } }
                        }
                    }
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
            .tabBarRoom()
            .background(Color.bg)
            .toolbarVisibility(.hidden, for: .navigationBar)
            .refreshable { await store.sync() }
            // 跟地圖、群組一樣用一般的推入（放大轉場會把從左邊滑回當成往下拉關閉）
            .navigationDestination(for: Place.self) { PlaceDetail(place: $0) }
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
        .onChange(of: path.count) { _, n in store.depth[1] = n }
        .onAppear(perform: markPaint)
        .onChange(of: store.places.count) { markPaint() }
    }

    // 收藏頁的抽一間：「地圖上看到的」在這裡當作全部，沒座標的店也算
    private var drawCtx: Drawer.Ctx { Drawer.Ctx(base: store.mine, view: nil, ref: store.here, refIsCenter: false, onMap: false) }

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

    // 長按卡片：直接改想去／去過、刪除
    @ViewBuilder private func menu(_ p: Place) -> some View {
        Button(p.been ? "改成想去" : "改成去過", systemImage: p.been ? "heart" : "checkmark.circle") {
            var n = p; n.status = p.been ? "want" : "been"; if !n.been { n.rating = nil }
            Task { await store.save(n) }
        }
        Button("刪除", systemImage: "trash", role: .destructive) { store.deleteWithUndo(p) }
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
            Text(branches.count > 1 ? place.name.replacingOccurrences(of: branchLabel(place), with: "").trimmingCharacters(in: .whitespaces) : place.name + (place.branch?.isEmpty == false ? " \(place.branch!)" : ""))
                .font(.system(size: 15, weight: .heavy)).lineLimit(1).foregroundStyle(Color.ink)
            Text(branches.count > 1
                 ? "📍 " + branches.map(branchLabel).joined(separator: "・")
                 : "\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(place.area.isEmpty ? "" : " · " + place.area)")
                .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
        }
        .padding(8).padding(.bottom, 4)
        .candy(22)
        .multilineTextAlignment(.leading)
    }
}

// 「收藏起步」：新朋友的四個小任務，照資料自己打勾，全部完成或按 ✕ 就收起來
struct StarterCard: View {
    @Environment(Store.self) private var store
    @AppStorage("starterHidden") private var hidden = false
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
        if !hidden && done < tasks.count && !mine.isEmpty {
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
                            Image(systemName: t.1 ? "checkmark.circle.fill" : "circle").font(.system(size: 20, weight: .bold))
                                .foregroundStyle(t.1 ? Color.sprMint : Color.ink.opacity(0.25))
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
            .padding(.horizontal, 16)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }
}
