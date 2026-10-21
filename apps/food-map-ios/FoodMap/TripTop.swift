import SwiftUI
import UIKit
import MapKit

// 行程模式的標題列：深色膠囊（行程名稱、「4 站・16:40 回」，點了是設定選單）＋ 橘色「完成」
// 下面是搜尋框，再下面一排「第 1 天」「第 2 天」「＋」（取代一般地圖的群組＋分類那排，高度不變）
// 搜尋時那排換成「順路／景點／住宿／咖啡／甜點」
struct TripTop: View {
    let tid: String
    @Environment(Store.self) private var store
    @State private var mode = TripMode.shared
    @State private var trips = TripStore.shared
    @State private var router = TripRouter.shared
    @State private var renaming = false
    @State private var newTitle = ""
    @State private var setting = false

    var body: some View {
        let t = trips.trip(tid)
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                if let t { capsule(t) } else { Spacer() }
                Button { mode.close() } label: { Text("完成").frame(minWidth: 50) }
                    .buttonStyle(ChunkyStyle(radius: 16))
                    .accessibilityLabel("完成，回到地圖")
            }
            .padding(.horizontal, 16)
            if let t, !mode.going {
                field
                    .padding(.horizontal, 16)
                ZStack {
                    if mode.searchOn {
                        filters.transition(.opacity)
                    } else {
                        dayRow(t).transition(.opacity)
                    }
                }
                .frame(height: 44)
                .animation(.snappy(duration: 0.2), value: mode.searchOn)
                .task(id: searchKey) {
                    guard mode.searchOn else { return }
                    await mode.search.run(mode.q, mode.filter, here: store.here, view: store.mapRegion)
                }
                .task(id: routeKey(t)) {
                    let d = min(mode.day, t.days)
                    mode.search.measure(trips.stops(t.id, day: d), seg: mode.seg, mode: TravelMode(rawValue: t.mode) ?? .walk, store: store)
                }
            }
        }
        .padding(.top, 6)
        // 鍵盤收起來（捲結果、按搜尋、點地圖）：不算在打字了；沒打字也沒選分類就等於離開搜尋
        // （這裡的輸入框在地圖的 safeAreaInset 裡，@FocusState 收不到焦點變化，所以直接看鍵盤）
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            if mode.typing { mode.typing = false }
        }
        // 搜尋收起來（不管是 ✕、點地圖空白處、還是收鍵盤）：面板回到一半
        .onChange(of: mode.searchOn) { _, on in
            guard !on, mode.level == .low, !mode.going, mode.cand == nil else { return }
            withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) { mode.level = .mid }
        }
        // 符合的收藏：搜尋結果和地圖上的圖釘共用
        .onChange(of: foundKey, initial: true) {
            mode.search.found = mode.searchOn ? mode.search.places(mode.q, mode.filter, store: store) : []
        }
        .alert("行程名稱", isPresented: $renaming) {
            TextField("名稱", text: $newTitle)
            Button("取消", role: .cancel) {}
            Button("好") {
                let n = newTitle.trimmingCharacters(in: .whitespaces)
                if !n.isEmpty, var x = trips.trip(tid) { x.title = n; trips.update(x, store: store) }
            }
        }
        .sheet(isPresented: $setting) { if let t { TripForm(trip: t) } }
    }

    // 點搜尋框（還沒打字）：馬上換成分類那排、面板降到最低，下面露出搜尋結果框
    private func beginTyping() {
        TripMode.shared.pickAt = CACurrentMediaTime()
        guard !mode.typing else { return }
        Perf.shared.mark("行程搜尋")
        withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) {
            mode.typing = true
            mode.cand = nil
            mode.level = .low
        }
    }

    private var searchKey: String {
        "\(mode.searchOn)|\(mode.q)|\(mode.filter?.rawValue ?? "")|\(mode.search.near.center?.latitude ?? 0)"
    }

    private var foundKey: String {
        "\(mode.searchOn)|\(mode.q)|\(mode.filter?.rawValue ?? "")|\(mode.search.near.center?.latitude ?? 0)|\(mode.search.near.radius)|\(store.places.count)"
    }

    private func routeKey(_ t: Trip) -> String {
        let ss = trips.stops(t.id, day: min(mode.day, t.days))
        let routed = zip(ss, ss.dropFirst()).filter { a, b in
            guard let ca = a.coord, let cb = b.coord else { return false }
            return router.legs[TripRouter.key(ca, cb, TripMath.mode(t, b))] != nil
        }.count
        return ss.map { "\($0.id)\($0.mode ?? "")" }.joined(separator: ",") + "|\(mode.seg?.joined() ?? "")|\(routed)|\(store.places.count)"
    }

    // ----- 深色膠囊：點了是選單 -----

    private func capsule(_ t: Trip) -> some View {
        Menu {
            Button("行程設定", systemImage: "slider.horizontal.3") { setting = true }
            Button("改名稱", systemImage: "pencil") { newTitle = t.title; renaming = true }
            Button("分享", systemImage: "square.and.arrow.up") { mode.sharing += 1 }
            Button("換行程", systemImage: "list.bullet") { mode.listing = true }
            if t.owner == nil || t.owner == store.me {
                Button("刪除行程", systemImage: "trash", role: .destructive) { mode.deleting = t }
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill").font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.accent)
                VStack(alignment: .leading, spacing: 1) {
                    Text(t.title).font(.system(size: 16, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
                    Text(mode.summary).font(.caption.weight(.bold)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                        .contentTransition(.numericText())
                        .animation(.snappy, value: mode.summary)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.down").font(.caption.weight(.heavy)).foregroundStyle(.white.opacity(0.6))
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Color(hex: 0x2a1a0a), in: .capsule)
            .contentShape(.capsule)
        }
        .accessibilityLabel("\(t.title)，\(mode.summary)，行程選單")
    }

    // ----- 搜尋框 -----

    private var field: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("搜尋景點、收藏，或直接點地圖上的店", text: $mode.q).font(.body).submitLabel(.search)
                .autocorrectionDisabled()
                .onSubmit { mode.endTyping() }
                // 焦點變化有時晚到：手指一點就先換畫面（只接在輸入框上，✕ 不算）
                .simultaneousGesture(TapGesture().onEnded {
                    beginTyping()
                })
            if mode.searchOn {
                Button {
                    Haptic.light()
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) {
                        mode.clearSearch()
                        mode.cand = nil
                        mode.level = .mid
                    }
                } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary).frame(width: 44, height: 44).contentShape(.rect) }
                    .accessibilityLabel("關掉搜尋")
            }
        }
        .padding(.leading, 16).padding(.trailing, 6)
        .frame(height: 52)
        .candy(18)
    }

    // 搜尋時：分類（不用打字也能用）
    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(AddFilter.allCases) { f in
                    Chip(text: f.label, on: mode.filter == f, solid: true) {
                        Haptic.light()
                        withAnimation(.snappy) {
                            mode.filter = mode.filter == f ? nil : f
                            mode.cand = nil
                            if mode.level != .low { mode.level = .low }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .swipeBackBlocked()
    }

    // ----- 第 N 天 -----

    private func dayRow(_ t: Trip) -> some View {
        let d = min(mode.day, t.days)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(1...max(1, t.days), id: \.self) { n in dayChip(n, on: n == d) }
                if t.days < 14 {
                    Button {
                        Haptic.light()
                        var x = t; x.days += 1
                        trips.update(x, store: store)
                        withAnimation(.snappy) { mode.day = x.days; mode.cand = nil; mode.hot = nil }
                    } label: {
                        Text("＋").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.6))
                            .frame(width: 40, height: 34)
                            .background(.white, in: .capsule)
                            .overlay(Capsule().strokeBorder(Color.ink.opacity(0.1)))
                            .frame(minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel("加一天")
                }
                startChip(t, d: d)
            }
            .padding(.horizontal, 16)
        }
        .swipeBackBlocked()
    }

    private func dayChip(_ n: Int, on: Bool) -> some View {
        let over = mode.overDay == n && !on
        return Button {
            guard !on else { return }
            Haptic.light()
            Perf.shared.mark("換天")
            withAnimation(.snappy) { mode.day = n; mode.cand = nil; mode.hot = nil }
        } label: {
            Text("第 \(n) 天").font(.subheadline.weight(.heavy))
                .padding(.horizontal, 14).frame(height: 34)
                .background(on ? Color.ink : over ? Color.accent.opacity(0.25) : .white, in: .capsule)
                .overlay(Capsule().strokeBorder(over ? Color.accent : on ? .clear : Color.ink.opacity(0.1), lineWidth: over ? 2 : 1))
                .foregroundStyle(on ? .white : Color.ink)
                .shadow(color: .black.opacity(on ? 0 : 0.08), radius: 4, y: 1)
                .scaleEffect(over ? 1.12 : 1)
                .frame(minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { mode.geo.chips[n] = $0 }
        .animation(.snappy, value: over)
    }

    // ----- 起點：目前位置或住宿 -----

    private func startChip(_ t: Trip, d: Int) -> some View {
        let base = trips.stops(t.id, day: d)
        let first = base.first
        let label: String
        if let first, first.kind == "stay" { label = "🏨 " + first.name }
        else if TripMath.origin(base, here: store.here) != nil { label = "🏠 目前位置出發" }
        else { label = "📍 從第 1 站出發" }
        var names: Set<String> = []
        let stays = trips.stops(t.id).filter { $0.kind == "stay" && names.insert($0.name).inserted }
        return Menu {
            Button("🏠 從目前位置出發") { startHere(base) }
            ForEach(stays) { st in
                Button("🏨 " + st.name) { startAt(st, t, d: d, base: base) }
            }
            Button("🔍 搜尋飯店…") { mode.startSearch(.stay, slot: .first) }
        } label: {
            Text(label).font(.footnote.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.7)).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 34)
                .background(.white, in: .capsule).overlay(Capsule().strokeBorder(Color.ink.opacity(0.1)))
                .shadow(color: .black.opacity(0.08), radius: 4, y: 1)
                .frame(minHeight: 44).contentShape(.rect)
        }
        .accessibilityLabel("起點：" + label)
    }

    // 改從目前位置出發：第一站的住宿移到最後（晚上回飯店）
    private func startHere(_ base: [TripStop]) {
        Haptic.light()
        guard var f = base.first, f.kind == "stay", base.count > 1 else { return }
        f.pos = (base.last?.pos ?? 0) + 1
        withAnimation(.snappy) { trips.update(f, store: store) }
    }

    // 從某間住宿出發：這天有就移到最前面，沒有就複製一份放在最前面
    private func startAt(_ st: TripStop, _ t: Trip, d: Int, base: [TripStop]) {
        Haptic.light()
        let top = (base.first?.pos ?? 1) - 1
        if var x = base.first(where: { $0.id == st.id }) {
            guard base.first?.id != st.id else { return }
            x.pos = top
            withAnimation(.snappy) { trips.update(x, store: store) }
            return
        }
        let c = TripStop(id: UUID().uuidString.lowercased(), trip_id: t.id, day: d, pos: top, kind: "stay", place_id: nil, name: st.name,
                         address: st.address, lat: st.lat, lng: st.lng, poi: st.poi, stay_min: 0, mode: nil, fixed_time: nil, done_at: nil,
                         added_by: Supa.session?.user.id, created_at: nil, updated_at: nil)
        trips.insert(c, store: store)
    }
}

// 搜尋結果：搜尋框下面最多露 4 列（不是全螢幕），同樣的結果也畫在地圖上；點一列就是加站卡
struct TripResults: View {
    @Environment(Store.self) private var store
    @State private var mode = TripMode.shared

    static let rowH: CGFloat = 62

    // 結果框的高度（地圖框住結果時要避開）
    @MainActor static func height(_ mode: TripMode) -> CGFloat {
        let n = mode.search.found.count + mode.search.mapHits(mode.search.found).count
        return n == 0 ? 56 : CGFloat(min(n, 4)) * rowH + 16
    }

    var body: some View {
        let mine = mode.search.found
        let maps = mode.search.mapHits(mine)
        let empty = mine.isEmpty && maps.isEmpty
        VStack(spacing: 0) {
            if empty {
                HStack(spacing: 8) {
                    if mode.search.busy { ProgressView().controlSize(.small) }
                    Text(emptyText).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(2)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14).frame(minHeight: 48)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(mine) { p in placeRow(p) }
                        ForEach(maps) { h in hitRow(h) }
                    }
                    .padding(.vertical, 4)
                }
                .scrollDismissesKeyboard(.immediately)
                .frame(height: CGFloat(min(mine.count + maps.count, 4)) * Self.rowH + 8)
                .overlay(alignment: .topTrailing) {
                    if mode.search.busy { ProgressView().controlSize(.mini).padding(8) }
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: 20).fill(Color.bg).shadow(color: .black.opacity(0.14), radius: 10, y: 3))
        .padding(.horizontal, 16).padding(.top, 4)
        .animation(.snappy(duration: 0.25), value: mine.map(\.id))
        .animation(.snappy(duration: 0.25), value: maps.map(\.id))
    }

    private var emptyText: String {
        let q = mode.q.trimmingCharacters(in: .whitespaces)
        if mode.search.busy { return "搜尋中…" }
        if !q.isEmpty { return "找不到「\(q)」，換個字試試看" }
        if mode.filter == .route { return "路線附近 400 公尺內沒有你的收藏" }
        if mode.filter != nil { return "附近沒有找到" }
        return "打字搜尋，或選上面的分類"
    }

    private func pick(_ c: TripCand) {
        Haptic.light()
        mode.endTyping()
        withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) { mode.cand = c }
    }

    private func placeRow(_ p: Place) -> some View {
        Button { pick(TripCand(place: p)) } label: {
            HStack(spacing: 12) {
                PhotoView(place: p, px: 120).frame(width: 42, height: 42).clipShape(.rect(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name + (p.branch?.isEmpty == false ? " \(p.branch!)" : "")).font(.system(size: 15, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(placeMeta(p)).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "plus.circle.fill").font(.system(size: 22)).foregroundStyle(Color.accent)
            }
            .padding(.horizontal, 12).frame(height: Self.rowH).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
    }

    private func placeMeta(_ p: Place) -> String {
        var s: [String] = []
        if let d = mode.search.meters(p), d < 2000 { s.append(d < 60 ? "就在路上" : "離路線 \(max(1, Int((d / 75).rounded()))) 分") }
        s.append("\(p.cat.emoji) \(p.cuisine?.isEmpty == false ? p.cuisine! : p.cat.name)")
        if let o = p.owner, o != store.me { s.append("\(store.name(o)) 的收藏") }
        if let os = mode.search.also[p.id], !os.isEmpty {
            s.append("也在" + os.map { store.name($0) }.joined(separator: "、") + "的收藏")
        }
        return s.joined(separator: " · ")
    }

    private func hitRow(_ h: MapHit) -> some View {
        Button { pick(TripCand(hit: h)) } label: {
            HStack(spacing: 12) {
                Image(systemName: POI.icon(h.poi, kind: h.stay ? "stay" : "spot")).font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 34, height: 34).background(Color(hex: 0x2a1a0a), in: .circle)
                    .frame(width: 42)
                VStack(alignment: .leading, spacing: 2) {
                    Text(h.name).font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(hitMeta(h)).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "plus.circle.fill").font(.system(size: 22)).foregroundStyle(Color.ink.opacity(0.35))
            }
            .padding(.horizontal, 12).frame(height: Self.rowH).contentShape(.rect)
        }
        .buttonStyle(PressStyle())
    }

    private func hitMeta(_ h: MapHit) -> String {
        var s: [String] = []
        if let c = POI.name(h.poi) { s.append(c) }
        let d = mode.search.far(h, here: store.here)
        if d > 0 { s.append((mode.search.near.isEmpty ? "離你 " : "離路線 ") + fmtDistance(d)) }
        if s.isEmpty, let a = h.address { s.append(a) }
        return s.joined(separator: " · ")
    }
}

// 地圖上搜到的地點：30pt 深色圓＋名字
struct HitPin: View {
    let hit: MapHit
    let on: Bool
    let tap: () -> Void
    @State private var shown = false

    var body: some View {
        Button(action: tap) {
            VStack(spacing: 3) {
                Image(systemName: POI.icon(hit.poi, kind: hit.stay ? "stay" : "spot")).font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(Color(hex: 0x2a1a0a), in: .circle)
                    .overlay(Circle().strokeBorder(.white, lineWidth: 2.5))
                    .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                Text(hit.name).font(.system(size: 11, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    .padding(.horizontal, 6).frame(height: 18)
                    .background(.white.opacity(0.92), in: .capsule)
                    .frame(maxWidth: 120)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .scaleEffect(on ? 1.3 : 1, anchor: .top)
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .scaleEffect(shown ? 1 : 0.3)
        .opacity(shown ? 1 : 0)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: on)
        .onAppear { withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { shown = true } }
        .accessibilityLabel(hit.name)
    }
}
