import SwiftUI

// 群組：跟朋友分享收藏，一起滑卡決定吃什麼（和網頁版同一份資料，網頁版的朋友也看得到）
struct GroupsTab: View {
    @Environment(Store.self) private var store
    @State private var path = NavigationPath()
    @State private var asking: Ask?
    @State private var text = ""
    @State private var starting: String?     // 正在開一輪的群組

    enum Ask: Identifiable { case create, join; var id: Self { self } }

    var body: some View {
        let _ = Perf.shared.count("群組")
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("群組").font(.system(size: 30, weight: .black)).foregroundStyle(Color.ink)
                        Spacer()
                        // 跟收藏頁一樣的橘色＋鈕，點了選建立或加入
                        Menu {
                            Button("建立群組", systemImage: "plus") { ask(.create) }
                            Button("輸入邀請碼", systemImage: "ticket") { ask(.join) }
                        } label: {
                            Image(systemName: "plus").font(.system(size: 21, weight: .heavy)).foregroundStyle(.white)
                                .frame(width: 42, height: 42)
                                .background(RoundedRectangle(cornerRadius: 42 * 0.32).fill(Color.accent).shadow(color: .accentDeep, radius: 0, y: 3))
                                .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                        }
                        .accessibilityLabel("新增群組")
                    }
                    .padding(.horizontal, 16)

                    if store.groups.isEmpty {
                        emptyCard.padding(.horizontal, 16)
                    }
                    ForEach(store.groups) { g in
                        GroupCard(group: g, open: { path.append(g) }, start: { quick(g) }, starting: starting == g.id)
                            .padding(.horizontal, 16)
                    }
                }
                .padding(.top, 8).padding(.bottom, 24)
            }
            .tabBarRoom()
            .background(Color.bg)
            .toolbarVisibility(.hidden, for: .navigationBar)
            .refreshable { await store.sync() }
            .navigationDestination(for: FoodGroup.self) { GroupView(gid: $0.id, path: $path) }
            .navigationDestination(for: Round.self) { RoundView(rid: $0.id) }
            .navigationDestination(for: Place.self) { PlaceDetail(place: $0) }
            .tripDestinations()
            .background { DepthReport(path: $path, tab: 2) }
            .onChange(of: store.groupJump) { jump() }
            .onAppear(perform: jump)
            .alert(asking == .join ? "輸入邀請碼" : "建立美食群組", isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } })) {
                TextField(asking == .join ? "朋友傳給你的 8 碼" : "例如：大學同學吃貨團", text: $text)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("取消", role: .cancel) {}
                Button(asking == .join ? "加入" : "建立") { go(asking) }
            }
        }
    }

    // 還沒有群組：甜甜圈＋兩顆厚按鈕
    private var emptyCard: some View {
        VStack(spacing: 14) {
            Image("Logo").resizable().frame(width: 96, height: 96).clipShape(.rect(cornerRadius: 26))
            Text("還沒有群組").font(.system(size: 20, weight: .black)).foregroundStyle(Color.ink)
            Text("建立一個群組邀朋友加入，或輸入朋友給你的邀請碼。大家的收藏放一起，滑卡決定吃什麼。")
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.6))
                .multilineTextAlignment(.center)
            HStack(spacing: 10) {
                Button { ask(.create) } label: { Text("建立群組").frame(maxWidth: .infinity) }
                    .buttonStyle(ChunkyStyle(radius: 14))
                Button { ask(.join) } label: { Text("輸入邀請碼").frame(maxWidth: .infinity) }
                    .buttonStyle(ChunkyStyle(color: .white, edge: .cardShadow, fg: .ink, radius: 14))
            }
        }
        .padding(20).frame(maxWidth: .infinity)
        .candy()
    }

    // 卡片上的「開始滑卡」：直接開一輪（預設條件），開好推進群組再推進滑卡
    private func quick(_ g: FoodGroup) {
        guard starting == nil else { return }
        Haptic.light()
        starting = g.id
        Task {
            if let r = await store.quickRound(g.id) { path = NavigationPath([g]); path.append(r) }
            starting = nil
        }
    }

    // 抽一間丟過來的：先打開群組，那一輪開好了再推進去
    private func jump() {
        guard let j = store.groupJump, let g = store.groups.first(where: { $0.id == j.gid }) else { return }
        store.groupJump = nil
        if let rid = j.rid, let r = store.rounds.first(where: { $0.id == rid }) {
            if path.count == 1 { path.append(r) } else { path = NavigationPath([g]); path.append(r) }
        } else {
            path = NavigationPath([g])
        }
    }

    // 不用程式讀剪貼簿（會跳「允許貼上」）：他在輸入框長按貼上整段邀請文字，go() 再從裡面抓 8 碼
    private func ask(_ a: Ask) {
        text = ""
        asking = a
    }

    private func go(_ a: Ask?) {
        guard let a else { return }
        let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let t = a == .join ? (FoodGroup.code(in: raw) ?? raw) : raw
        guard !t.isEmpty else { return }
        Task {
            if a == .create, let g = await store.createGroup(t) { path.append(g) }
            if a == .join, let gid = await store.join(t), let g = store.groups.first(where: { $0.id == gid }) { path.append(g) }
        }
    }
}

// 群組分頁的一張卡：頭像疊、群組名、人數店數，下面一行這輪滑卡的狀態，右下「開始滑卡」
struct GroupCard: View {
    @Environment(Store.self) private var store
    let group: FoodGroup
    let open: () -> Void
    let start: () -> Void
    var starting = false

    var body: some View {
        let mem = store.membersOf(group.id)
        let count = store.placesIn(group.id).count
        Button(action: open) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    // 固定寬度（最多 4 個，每個多露 24）：群組名在每張卡都從同一個位置開始
                    HStack(spacing: -10) {
                        ForEach(Array(mem.prefix(4)), id: \.self) { Avatar(name: store.name($0), id: $0, size: 34) }
                    }
                    .frame(width: 34 + 3 * 24, alignment: .leading)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(group.name).font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                        Text("\(mem.count) 人・\(count) 間店").font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                    }
                    Spacer(minLength: 0)
                }
                status(mem)
                    .padding(.trailing, 110)      // 右下留給「開始滑卡」
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .candy()
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .overlay(alignment: .bottomTrailing) {
            Button(action: start) {
                HStack(spacing: 5) {
                    if starting { ProgressView().controlSize(.small).tint(.white) } else { Image(systemName: "heart.fill").font(.system(size: 12, weight: .heavy)) }
                    Text("開始滑卡").font(.system(size: 15, weight: .heavy))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12).frame(height: 36)
                .background(Capsule().fill(Color.accent).shadow(color: .accentDeep, radius: 0, y: 3))
                .frame(minHeight: 44).contentShape(.rect)
            }
            .buttonStyle(PressStyle())
            .disabled(count == 0 || starting)
            .opacity(count == 0 ? 0.45 : 1)
            .padding(.trailing, 14).padding(.bottom, 12)
            .accessibilityLabel("在「\(group.name)」開始滑卡")
        }
    }

    // 最新那一輪：有配對就顯示配對幾間；還有人沒滑完就說誰還有幾張（自己優先）
    @ViewBuilder private func status(_ mem: [String]) -> some View {
        if let r = store.roundsOf(group.id).first {
            let hits = store.matches(r).filter(\.all).count
            let left = mem.map { u in (u, r.place_ids.count - Set(store.swipes.filter { $0.round_id == r.id && $0.user_id == u }.map(\.place_id)).count) }
                .filter { $0.1 > 0 }
            let who = left.first { $0.0 == store.me } ?? left.first
            HStack(spacing: 8) {
                if hits > 0 {
                    Text("配對 \(hits) 間").font(.caption.weight(.heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 10).frame(height: 24)
                        .background(Color.sprMint, in: .capsule)
                }
                if let who {
                    Text("這輪：\(who.0 == store.me ? "你" : store.name(who.0)) 還有 \(who.1) 張沒滑")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.65)).lineLimit(1)
                } else if hits == 0 {
                    Text("這輪大家都滑完了，沒有配對").font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.45)).lineLimit(1)
                }
            }
            .frame(minHeight: 24)
        } else {
            Text("還沒開始滑卡").font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.4))
                .frame(minHeight: 24)
        }
    }
}

struct Avatar: View {
    let name: String, id: String
    var size: CGFloat = 32
    static let colors: [UInt32] = [0xff7a45, 0xf06595, 0x7950f2, 0x4c6ef5, 0x15aabf, 0x20c997, 0x40c057, 0xfab005]
    // 每個人固定一個顏色（頭像、地圖上的「誰收的」標籤都用這個）
    static func color(_ id: String) -> Color { Color(hex: colors[id.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xffff } % colors.count]) }
    var body: some View {
        let first = name.trimmingCharacters(in: .whitespaces).first
        // 名字是 emoji（🪡）：白底放大 emoji、外圈用那個人的顏色（縮在深色小圓裡會像一條斜線）
        let emoji = first.map { c in c.unicodeScalars.contains { $0.properties.isEmojiPresentation } || (c.unicodeScalars.count > 1 && c.unicodeScalars.first?.properties.isEmoji == true) } ?? false
        Text(first.map { String($0).uppercased() } ?? "?")
            .font(.system(size: size * (emoji ? 0.6 : 0.42), weight: .bold)).foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(emoji ? Color.white : Avatar.color(id), in: .circle)
            .overlay(Circle().strokeBorder(emoji ? Avatar.color(id) : Color.bg, lineWidth: 2))
    }
}

struct GroupView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let gid: String
    @Binding var path: NavigationPath
    @State private var newRound = false
    @State private var picking = false
    @State private var leaving = false
    @State private var dropping: Round?
    @State private var starting = false

    var body: some View {
        if let g = store.groups.first(where: { $0.id == gid }) { content(g) }
        else { ContentUnavailableView("群組不見了", systemImage: "person.3") }
    }

    private func content(_ g: FoodGroup) -> some View {
        let mem = store.membersOf(gid), list = store.placesIn(gid), rounds = store.roundsOf(gid)
        let alone = mem.count < 2
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: -8) {
                    ForEach(mem, id: \.self) { Avatar(name: store.name($0), id: $0, size: 36) }
                    Spacer().frame(width: 18)
                    Text(mem.map { store.name($0) }.joined(separator: "、")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                    Spacer(minLength: 8)
                    // 地圖切成看這個群組的店（跟地圖上「我的收藏 ▾」選群組一樣）
                    Button { showOnMap() } label: {
                        Text("🗺 在地圖上看").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink)
                            .padding(.horizontal, 11).frame(height: 32)
                            .background(.white, in: .capsule)
                            .overlay(Capsule().strokeBorder(Color.cardShadow, lineWidth: 2))
                            .fixedSize()
                            .frame(minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle(haptic: true))
                    .disabled(list.isEmpty)
                    .accessibilityLabel("在地圖上看這個群組的店")
                }
                .padding(.horizontal, 16)

                HStack(spacing: 10) {
                    // 直接用預設條件開一輪（這一餐、離你近的 10 張），不用先填表
                    Button { quick() } label: {
                        HStack(spacing: 6) {
                            if starting { ProgressView().controlSize(.small).tint(.white) } else { Image(systemName: "heart.fill") }
                            Text("開始滑卡")
                        }
                        .frame(maxWidth: .infinity).frame(height: 44)
                    }
                    .buttonStyle(ChunkyStyle(radius: 16)).disabled(list.isEmpty || starting)
                    Button("調整條件") { newRound = true }
                        .font(.subheadline.weight(.heavy)).foregroundStyle(Color.accentDeep)
                        .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                        .buttonStyle(PressStyle())
                        .disabled(list.isEmpty)
                    ShareLink(item: g.inviteText) {
                        Label("邀請", systemImage: "person.badge.plus").frame(height: 44)
                    }
                    .buttonStyle(ChunkyStyle(color: .white, edge: .cardShadow, fg: .ink, radius: 16))
                }
                .padding(.horizontal, 16)

                // 只有自己一個人：滑卡要兩個人以上才會配對
                if alone {
                    Label("現在只有你一個人。邀朋友加入，大家都想吃的店才會配對成功。", systemImage: "person.2.fill")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.7))
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.sprYellow.opacity(0.25), in: .rect(cornerRadius: 16))
                        .padding(.horizontal, 16)
                }

                if !rounds.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("滑卡").font(.system(size: 20, weight: .black)).foregroundStyle(Color.ink).padding(.horizontal, 16)
                        ForEach(rounds) { r in
                            NavigationLink(value: r) { RoundRow(round: r) }.buttonStyle(PressStyle()).padding(.horizontal, 16)
                                .contextMenu {
                                    if store.canDelete(r) {
                                        Button("刪除這輪", systemImage: "trash", role: .destructive) { dropping = r }
                                    }
                                }
                        }
                    }
                }

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("群組裡的店").font(.system(size: 20, weight: .black)).foregroundStyle(Color.ink)
                    Text("\(list.count) 間").font(.headline).foregroundStyle(Color.accent)
                    Spacer()
                    Button { picking = true } label: {
                        Label("從收藏加入", systemImage: "plus").font(.system(size: 14, weight: .heavy)).foregroundStyle(Color.accentDeep)
                            .padding(.horizontal, 12).frame(height: 34)
                            .background(Color.accent.opacity(0.13), in: .capsule)
                            .frame(minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.horizontal, 16)

                if list.isEmpty {
                    VStack(spacing: 12) {
                        Text("還沒有店。把你收藏的店分享進來，大家就能一起滑卡。")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.6)).multilineTextAlignment(.center)
                        Button("從我的收藏加入") { picking = true }.buttonStyle(ChunkyStyle(radius: 14))
                    }
                    .padding(18).frame(maxWidth: .infinity)
                    .candy()
                    .padding(.horizontal, 16)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 16) {
                    ForEach(list) { p in
                        NavigationLink(value: p) { PlaceCard(place: p) }
                            .buttonStyle(PressStyle { ReelCache.warm(p) })
                            .contextMenu {
                                Button("從群組移除", systemImage: "minus.circle", role: .destructive) { Task { await store.unshare(gid, p.id) } }
                            }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.vertical, 12)
        }
        .background(Color.bg)
        .navigationTitle(g.name)
        .navigationBarTitleDisplayMode(.inline)
        .backButton()
        .toolbar {
            Menu {
                Text("邀請碼 \(g.invite_code)")
                Button(g.owner == store.me ? "刪除群組" : "退出群組", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { leaving = true }
            } label: { MoreIcon() }
                .accessibilityLabel("更多")
        }
        .confirmationDialog(g.owner == store.me ? "刪除「\(g.name)」？所有成員都會看不到這個群組。" : "退出「\(g.name)」？", isPresented: $leaving, titleVisibility: .visible) {
            Button(g.owner == store.me ? "刪除" : "退出", role: .destructive) { Task { await store.leave(g); dismiss() } }
        }
        .refreshable { await store.sync() }
        .confirmationDialog("刪除「\(dropping?.title ?? "")」？大家滑的紀錄和配對結果都會一起刪掉。", isPresented: Binding(get: { dropping != nil }, set: { if !$0 { dropping = nil } }), titleVisibility: .visible) {
            Button("刪除", role: .destructive) { if let r = dropping { Task { await store.deleteRound(r) } } }
        }
        .sheet(isPresented: $newRound) {
            NewRoundSheet(gid: gid) { r in newRound = false; path.append(r) }
        }
        .sheet(isPresented: $picking) { PickSheet(gid: gid) }
    }

    private func quick() {
        guard !starting else { return }
        Haptic.light()
        starting = true
        Task {
            if let r = await store.quickRound(gid) { path.append(r) }
            starting = false
        }
    }

    // 切到地圖分頁、看這個群組的店（地圖換群組時會自己框住那些店）
    private func showOnMap() {
        if TripMode.shared.on { TripMode.shared.close() }
        if !store.mapPath.isEmpty { store.mapPath = NavigationPath() }
        withAnimation(.snappy) { store.mapGroup = gid }
        store.tab = 0
    }
}

struct RoundRow: View {
    @Environment(Store.self) private var store
    let round: Round
    var body: some View {
        let left = store.todo(round).count, hits = store.matches(round).filter(\.all).count
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(round.title.isEmpty ? "一起決定吃什麼" : round.title).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                Text("\(round.place_ids.count) 張・" + (left > 0 ? "你還有 \(left) 張沒滑" : "你滑完了")).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
            }
            Spacer()
            if hits > 0 { Text("配對 \(hits) 間").font(.caption.weight(.heavy)).padding(.horizontal, 10).frame(height: 24).background(Color.sprMint, in: .capsule).foregroundStyle(.white) }
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Color.ink.opacity(0.3))
        }
        .padding(14)
        .candy(18)
    }
}

// 開一輪滑卡：跟網頁版一樣可以挑地區、分類、時段、預算、張數
struct NewRoundSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let gid: String
    let onStart: (Round) -> Void
    @State private var title = "一起決定吃什麼"
    @State private var cities: Set<String> = []
    @State private var cats: Set<String> = []
    @State private var meal = ""
    @State private var price = 0
    @State private var max = 15
    @State private var busy = false

    private var all: [Place] { store.placesIn(gid) }

    private var pool: [Place] {
        var l = all
        if !cities.isEmpty { l = l.filter { cities.contains(normCity($0.city)) } }
        if !cats.isEmpty { l = l.filter { cats.contains($0.category ?? "") } }
        if !meal.isEmpty { l = l.filter { ($0.meals ?? []).isEmpty || $0.meals!.contains(meal) } }
        if price > 0 { l = l.filter { ($0.price ?? 0) == 0 || $0.price! <= price } }
        // 同一家的分店只出一張卡，配對才不會分散在不同分店
        var seen = Set<String>()
        return store.nearFirst(l).filter { seen.insert(store.brand($0)).inserted }
    }

    var body: some View {
        let n = min(pool.count, max)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    TextField("這輪要決定什麼", text: $title)
                        .padding(14).background(Color.panel, in: .rect(cornerRadius: 14))
                    let cs = Array(Set(all.map { normCity($0.city) }.filter { !$0.isEmpty })).sorted()
                    if cs.count > 1 {
                        section("地區（不選＝全部）") { ForEach(cs, id: \.self) { c in Chip(text: c, on: cities.contains(c)) { cities.formSymmetricDifference([c]) } } }
                    }
                    section("分類（不選＝全部）") {
                        ForEach(Cat.order.filter { k in all.contains { $0.category == k } }, id: \.self) { k in
                            let c = Cat.all[k]!
                            Chip(text: "\(c.emoji) \(c.name)", on: cats.contains(k)) { cats.formSymmetricDifference([k]) }
                        }
                    }
                    section("時段") {
                        Chip(text: "不限", on: meal.isEmpty) { meal = "" }
                        ForEach(MEALS, id: \.0) { m in Chip(text: m.1, on: meal == m.0) { meal = m.0 } }
                    }
                    section("每人預算") {
                        ForEach([(0, "不限"), (1, "200 內"), (2, "500 內"), (3, "1000 內")], id: \.0) { v in Chip(text: v.1, on: price == v.0) { price = v.0 } }
                    }
                    section("最多幾張") {
                        ForEach([10, 15, 20, 30, 50], id: \.self) { v in Chip(text: "\(v)", on: max == v) { max = v } }
                    }
                }
                .padding(16)
            }
            .background(Color.bg)
            .safeAreaInset(edge: .bottom) {
                Button {
                    busy = true
                    Task {
                        let p = Array(pool.shuffled().prefix(max))
                        let f: [String: AnyCodable] = ["cities": .a(Array(cities)), "cats": .a(Array(cats)), "meal": .s(meal), "price": .i(price)]
                        if let r = await store.startRound(gid, title: title.trimmingCharacters(in: .whitespaces), pool: p, filters: f) { onStart(r) }
                        busy = false
                    }
                } label: {
                    Text(n > 0 ? "開始滑 \(n) 張" : "沒有符合條件的店").font(.headline).frame(maxWidth: .infinity).frame(height: 54)
                        .background(n > 0 ? AnyShapeStyle(Color.grad) : AnyShapeStyle(Color.gray.opacity(0.4)), in: .rect(cornerRadius: 16)).foregroundStyle(.white)
                }
                .buttonStyle(PressStyle()).disabled(n == 0 || busy)
                .padding(16).background(.bar)
            }
            .navigationTitle("開始滑卡").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("取消") { dismiss() } }
        }
    }

    private func section<C: View>(_ t: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            Flow(spacing: 8) { c() }
        }
    }
}

// 從我的收藏挑幾間分享到群組
struct PickSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let gid: String
    @State private var pick: Set<String> = []

    var body: some View {
        let list = store.mine.filter { !store.shared($0.id, gid) }
        NavigationStack {
            List(list) { p in
                Button {
                    Haptic.light()
                    pick.formSymmetricDifference([p.id])
                } label: {
                    HStack(spacing: 12) {
                        PhotoView(place: p, px: 160).frame(width: 54, height: 54).clipShape(.rect(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.headline).foregroundStyle(.primary)
                            Text("\(p.cat.emoji) \(p.area)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: pick.contains(p.id) ? "checkmark.circle.fill" : "circle").font(.title2)
                            .foregroundStyle(pick.contains(p.id) ? Color.accent : Color.secondary)
                    }
                }
            }
            .overlay { if list.isEmpty { ContentUnavailableView("你的收藏都已經在群組裡了", systemImage: "checkmark.circle") } }
            .navigationTitle("從我的收藏加入").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .topBarLeading) { if !list.isEmpty { Button("全選") { pick = Set(list.map(\.id)) } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(pick.isEmpty ? "加入" : "加入 \(pick.count) 間") { let ids = Array(pick); Task { await store.share(gid, ids) }; dismiss() }.disabled(pick.isEmpty)
                }
            }
        }
    }
}

// 一輪滑卡：先滑，滑完看結果；全員都想吃同一間就跳出「配對成功」
struct RoundView: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    let rid: String
    @State private var showResult = false
    @State private var detail: Place?
    @State private var match: Store.Match?
    @State private var dropping = false
    @State private var history: [String] = []
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if let r = store.rounds.first(where: { $0.id == rid }) { content(r) }
            else { ContentUnavailableView("這輪滑卡不見了", systemImage: "rectangle.stack") }
        }
        .navigationDestination(item: $detail) { PlaceDetail(place: $0) }
        .overlay { if let m = match { MatchView(match: m) { withAnimation(.snappy) { match = nil } } .transition(.opacity) } }
        // 朋友滑的結果每幾秒拿一次，有新配對就跳出來
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard let r = store.rounds.first(where: { $0.id == rid }) else { continue }
                let before = Set(store.matches(r).filter(\.all).map(\.id))
                await store.syncRound(r)
                if match == nil, let m = store.matches(r).first(where: { $0.all && !before.contains($0.id) }) { celebrate(m) }
            }
        }
    }

    private func content(_ r: Round) -> some View {
        let todo = store.todo(r)
        return VStack {
            if todo.isEmpty || showResult {
                results(r, done: todo.isEmpty)
            } else {
                let mem = store.membersOf(r.group_id)
                VStack(spacing: 8) {
                    SprinkleBar(progress: r.place_ids.isEmpty ? 0 : Double(r.place_ids.count - todo.count) / Double(r.place_ids.count))
                    HStack {
                        // 20 秒內在這一輪滑過的朋友：頭像旁邊三個點在跳
                        TimelineView(.periodic(from: .now, by: 2)) { t in
                            let live = Set(store.swipes.filter { $0.round_id == r.id && $0.user_id != store.me && ($0.at.map { t.date.timeIntervalSince($0) < 20 } ?? false) }.map(\.user_id))
                            HStack(spacing: 6) {
                                ForEach(mem, id: \.self) { u in
                                    Avatar(name: store.name(u), id: u, size: 28)
                                        .overlay(alignment: .bottomTrailing) { if live.contains(u) { TypingDots().offset(x: 10, y: 4) } }
                                        .padding(.trailing, live.contains(u) ? 10 : -14)
                                }
                            }
                            .padding(.trailing, 14)
                        }
                        Spacer()
                        Text("還有 \(todo.count) 張").font(.footnote.weight(.bold)).foregroundStyle(Color.ink.opacity(0.5))
                    }
                }
                .padding(.horizontal, 20).padding(.top, 6)
                SwipeDeck(deck: todo, onSwipe: { p, liked in
                    store.swipe(r, p.id, liked: liked)
                    history.append(p.id)
                    if liked, let m = store.matches(r).first(where: { $0.place.id == p.id }), m.all { celebrate(m) }
                }, onTap: { detail = $0 }, onUndo: history.isEmpty ? nil : { undo(r) })
            }
        }
        .background(Color.bg)
        .navigationTitle(r.title.isEmpty ? "一起決定吃什麼" : r.title)
        .navigationBarTitleDisplayMode(.inline)
        .backButton()
        .toolbar {
            if !todo.isEmpty { Button(showResult ? "繼續滑" : "看結果") { withAnimation(.snappy) { showResult.toggle() } } }
            if store.canDelete(r) {
                Menu {
                    Button("刪除這輪", systemImage: "trash", role: .destructive) { dropping = true }
                } label: { MoreIcon() }
                .accessibilityLabel("更多")
            }
        }
        .confirmationDialog("刪除這輪滑卡？大家滑的紀錄和配對結果都會一起刪掉。", isPresented: $dropping, titleVisibility: .visible) {
            Button("刪除", role: .destructive) { dismiss(); Task { await store.deleteRound(r) } }
        }
    }

    // 收回剛滑的那張：從紀錄刪掉，卡片回到最上面
    private func undo(_ r: Round) {
        guard let pid = history.popLast() else { return }
        Haptic.light()
        withAnimation(.snappy) { showResult = false }
        Task { await store.unswipe(r, pid) }
    }

    private func results(_ r: Round, done: Bool) -> some View {
        let all = store.matches(r), total = store.membersOf(r.group_id).count
        let swiped = Set(store.swipes.filter { $0.round_id == r.id }.map(\.user_id))
        let g = store.groups.first { $0.id == r.group_id }
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(done ? "你滑完了！" + (swiped.count < total ? "等其他人滑完，結果會自己更新。" : "大家都滑完了。") : "你還沒滑完，這是目前的結果。")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.6))
                    Spacer(minLength: 8)
                    if !history.isEmpty {
                        Button("↶ 收回上一張") { undo(r) }
                            .font(.subheadline.weight(.heavy)).foregroundStyle(Color.accentDeep)
                            .frame(minHeight: 44).contentShape(.rect)
                            .buttonStyle(PressStyle())
                    }
                }
                // 群組只有一個人不會有配對
                if total < 2, let g {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("邀朋友加入才會配對").font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink)
                        Text("配對是大家都想吃的店。把邀請連結傳給朋友，他們滑完結果就會出現。").font(.subheadline).foregroundStyle(Color.ink.opacity(0.6))
                        ShareLink(item: g.inviteText) { Label("邀請朋友", systemImage: "person.badge.plus").frame(maxWidth: .infinity) }
                            .buttonStyle(ChunkyStyle(radius: 14))
                    }
                    .padding(16)
                    .candy()
                }
                ForEach(all) { m in
                    Button { detail = store.branchesOf(m.place).first ?? m.place } label: {
                        HStack(spacing: 12) {
                            PhotoView(place: m.place, px: 160).frame(width: 58, height: 58).clipShape(.rect(cornerRadius: 12))
                            VStack(alignment: .leading, spacing: 5) {
                                Text(m.place.name).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                                HStack(spacing: -6) { ForEach(m.who, id: \.self) { Avatar(name: store.name($0), id: $0, size: 22) } }
                            }
                            Spacer(minLength: 4)
                            VStack(alignment: .trailing, spacing: 3) {
                                if m.all {
                                    Text("配對成功").font(.caption.weight(.heavy)).foregroundStyle(.white)
                                        .padding(.horizontal, 9).frame(height: 22)
                                        .background(Color.sprMint, in: .capsule)
                                }
                                Text("\(m.who.count)/\(total) 想吃").font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .candy(18, fill: m.all ? Color(light: 0xdcf7ec, dark: 0x163a2e) : .panel)
                        .contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(16)
        }
    }

    private func celebrate(_ m: Store.Match) {
        Haptic.success()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { match = m }
    }
}

struct MatchView: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    let match: Store.Match
    let close: () -> Void
    @State private var pop = false
    // 按讚的人從左右兩邊飛到中間撞在一起 → 愛心炸開 → 店家照片放大
    @State private var met = false
    @State private var heart = false
    @State private var burst = 0
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        ZStack {
            Color.black.opacity(0.75).ignoresSafeArea().onTapGesture(perform: close)
            VStack(spacing: 18) {
                PhotoView(place: match.place, px: 500).frame(width: 170, height: 170).clipShape(.circle)
                    .overlay(Circle().strokeBorder(Color.grad, lineWidth: 6))
                    .scaleEffect(pop ? 1 : 0.6)
                    .opacity(pop || reduce ? 1 : 0.4)
                Text("配對成功！").font(.system(size: 34, weight: .black)).foregroundStyle(.white)
                Text("大家都想吃 **\(match.place.name)**").foregroundStyle(.white.opacity(0.9))
                ZStack {
                    HStack(spacing: -8) {
                        ForEach(Array(match.who.enumerated()), id: \.element) { i, u in
                            Avatar(name: store.name(u), id: u, size: 36)
                                .offset(x: met || reduce ? 0 : (i % 2 == 0 ? -220 : 220))
                        }
                    }
                    Text("❤️").font(.system(size: 34))
                        .scaleEffect(heart ? 1 : 0.1).opacity(heart ? 1 : 0)
                        .offset(y: -34)
                    Confetti(shot: burst).allowsHitTesting(false)
                }
                Button { if let u = (store.branchesOf(match.place).first ?? match.place).navURL(NavApp.saved ?? .google) { openURL(u) } } label: {
                    Label("就去這間", systemImage: "location.fill").font(.headline).frame(width: 240, height: 52)
                        .background(.white, in: .capsule).foregroundStyle(.black)
                }
                Button(action: close) {
                    Text("繼續滑").font(.headline).foregroundStyle(.white).frame(width: 240, height: 48)
                        .overlay(Capsule().strokeBorder(.white.opacity(0.6), lineWidth: 1.5)).contentShape(.capsule)
                }
            }
        }
        .onAppear {
            if reduce { withAnimation(.easeOut(duration: 0.2)) { pop = true; heart = true }; Haptic.success(); return }
            withAnimation(.easeIn(duration: 0.45)) { met = true } completion: {
                Haptic.success()
                burst += 1
                withAnimation(.spring(response: 0.3, dampingFraction: 0.45)) { heart = true }
                withAnimation(.spring(response: 0.45, dampingFraction: 0.55)) { pop = true }
            }
        }
    }
}

// 正在滑的朋友：三個點輪流上下跳（每點差 0.15 秒、跳 3pt）
struct TypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        TimelineView(.animation(paused: reduce)) { t in
            let s = t.date.timeIntervalSinceReferenceDate
            HStack(spacing: 2.5) {
                ForEach(0..<3, id: \.self) { i in
                    Circle().fill(Color.ink.opacity(0.7)).frame(width: 4.5, height: 4.5)
                        .offset(y: reduce ? 0 : -3 * max(0, sin((s - Double(i) * 0.15) * 2 * .pi / 0.9)))
                }
            }
            .padding(.horizontal, 5).frame(height: 13)
            .background(.white, in: .capsule)
            .shadow(color: .black.opacity(0.15), radius: 2, y: 1)
        }
        .accessibilityLabel("正在滑")
    }
}

// 會自動換行的一排標籤
struct Flow: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            var s = v.sizeThatFits(.unspecified); s.width = Swift.min(s.width, w)
            if x > 0 && x + s.width > w { y += line + spacing; x = 0; line = 0 }
            x += s.width + spacing; line = Swift.max(line, s.height); widest = Swift.max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + line)
    }
    func placeSubviews(in b: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = b.minX, y = b.minY, line: CGFloat = 0
        for v in subviews {
            var s = v.sizeThatFits(.unspecified); s.width = Swift.min(s.width, b.width)
            if x > b.minX && x + s.width > b.maxX { y += line + spacing; x = b.minX; line = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; line = Swift.max(line, s.height)
        }
    }
}

extension FoodGroup {
    // 邀請連結：有裝 App 直接在 App 裡加入，沒裝就開網頁版
    var inviteLink: String { "https://anthony-apps.netlify.app/join?code=\(invite_code)" }
    var inviteText: String { "來加入我的美食群組「\(name)」，一起收藏、一起滑卡決定吃什麼 🍜\n\(inviteLink)\n邀請碼：\(invite_code)" }

    // 從一段文字找出 8 碼邀請碼（邀請連結、「邀請碼：XXXX」或只有碼本身）
    static func code(in s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        for p in [#"(?:join=|code=|邀請碼[：:]\s*)([A-Za-z0-9]{8})\b"#, #"^([A-Za-z0-9]{8})$"#] {
            if let r = try? NSRegularExpression(pattern: p), let m = r.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)), let g = Range(m.range(at: 1), in: t) { return String(t[g]) }
        }
        return nil
    }
}

extension Store {
    // 一鍵開一輪滑卡：時段＝現在這一餐、地區不限、離你近的排前面、最多 10 張。
    // 這一餐符合的不到 3 張就不看時段再算一次；同一家的分店只出一張
    @MainActor func quickRound(_ gid: String) async -> Round? {
        let meal = Drawer.meal().key
        func pool(_ m: String?) -> [Place] {
            var l = placesIn(gid)
            if let m { l = l.filter { ($0.meals ?? []).isEmpty || $0.meals!.contains(m) } }
            var seen = Set<String>()
            return nearFirst(l).filter { seen.insert(brand($0)).inserted }
        }
        var used: String? = meal
        var l = pool(meal)
        if l.count < 3 { used = nil; l = pool(nil) }
        guard !l.isEmpty else { say("群組裡還沒有店"); return nil }
        let f: [String: AnyCodable] = ["cities": .a([]), "cats": .a([]), "meal": .s(used ?? ""), "price": .i(0)]
        return await startRound(gid, title: "一起決定吃什麼", pool: Array(l.prefix(10)), filters: f)
    }
}

// 群組頁、配對結果頁右上的「⋯」：跟左上返回鍵同一套（深色、44pt），不吃橘色 tint
private struct MoreIcon: View {
    var body: some View {
        Image(systemName: "ellipsis").font(.system(size: 17, weight: .bold)).foregroundStyle(Color.ink)
            .frame(width: 44, height: 44).contentShape(.rect)
    }
}
