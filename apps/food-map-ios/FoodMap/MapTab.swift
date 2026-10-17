import SwiftUI
import MapKit

// 首頁地圖：用 iPhone 內建的 Apple 地圖，收藏的店是食物圖釘；上面搜尋＋新增、篩選，下面「附近 N 間」一排卡片
struct MapTab: View {
    @Environment(Store.self) private var store
    // 一打開先框住所有收藏的店（不跳到目前位置），想看自己在哪按右下的定位鈕
    @State private var pos: MapCameraPosition = .region(MKCoordinateRegion(center: .init(latitude: 25.0418, longitude: 121.5436), latitudinalMeters: 9000, longitudinalMeters: 9000))
    @State private var sel: String?
    @State private var loc = CLLocationManager()
    @State private var fitted = false
    @State private var adding = false
    @State private var noAddr = false
    @State private var scoping = false
    // 地圖現在看到的範圍（移動、縮放停下來才更新）；點卡片／圖釘造成的移動不算，免得下面的卡片一直換
    @State private var shownRegion: MKCoordinateRegion?
    @State private var selfMoved = false
    // 抽一間抽中的那間（還選著它時，按鈕變「再抽一次」）
    @State private var drawn: String?
    // 抽一間時跳一下的圖釘（每跳一次加一）
    @State private var hops: [String: Int] = [:]
    @State private var drawing = false
    @State private var spot = BurstSpot()
    @Environment(\.accessibilityReduceMotion) private var reduce

    private var points: [Place] { store.shown(store.mapF, in: store.mapBase).filter { $0.lat != nil && $0.lng != nil } }

    var body: some View {
        @Bindable var store = store
        // 有座標的店一次算好，下面每個地方共用
        let list = points
        let all = store.shown(store.mapF, in: store.mapBase)
        let gname = store.mapGroupName
        let near = Nearby(list: list, here: store.here, region: shownRegion, selected: sel, total: all.count)
        let missing = all.count - list.count
        NavigationStack(path: $store.mapPath) {
            MapReader { proxy in
                Map(position: $pos, selection: $sel) {
                    UserAnnotation()
                    ForEach(list) { p in
                        Annotation(p.name, coordinate: .init(latitude: p.lat!, longitude: p.lng!), anchor: .bottom) {
                            FoodPin(place: p, on: sel == p.id, dim: sel != nil && sel != p.id, hop: hops[p.id] ?? 0, reduce: reduce, saver: gname == nil ? nil : p.owner.map { ($0, store.name($0)) })
                        }
                        .tag(p.id)
                        .annotationTitles(.hidden)
                    }
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .mapControls { MapCompass() }
                .onMapCameraChange(frequency: .continuous) { _ in
                    pinFrame(proxy)
                    if let c = spot.coord, Date() < spot.until { spot.at = proxy.convert(c, to: .global) }
                }
                .onMapCameraChange { c in
                    if selfMoved { selfMoved = false } else { shownRegion = c.region }
                }
                .onChange(of: store.coachStep) { pinFrame(proxy) }
                .onChange(of: sel) { _, id in
                    guard let p = list.first(where: { $0.id == id }) else { return }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    Perf.shared.mark(drawn == id ? "抽一間" : "點圖釘")
                    // 光圈和糖粒：記下那根圖釘在螢幕上的位置，地圖移動的這一小段時間跟著更新
                    if !reduce {
                        let c = CLLocationCoordinate2D(latitude: p.lat!, longitude: p.lng!)
                        spot.coord = c; spot.color = p.cat.color
                        spot.at = proxy.convert(c, to: .global)
                        spot.until = Date().addingTimeInterval(0.9)
                        spot.shot += 1
                    }
                    // 只把地圖移到那間，不改縮放
                    selfMoved = true
                    let span = shownRegion?.span ?? MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
                    withAnimation(.smooth(duration: 0.55)) { pos = .region(MKCoordinateRegion(center: .init(latitude: p.lat!, longitude: p.lng!), span: span)) }
                }
                .overlay { PinBurst(spot: spot) }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 8) {
                    SearchField(text: $store.mapF.q, prompt: gname.map { "在「\($0)」裡找" } ?? "今天想吃什麼？") {
                        AddButton { adding = true }.coachAnchor(.add)
                    }
                    .padding(.horizontal, 16)
                    if !store.groups.isEmpty { scopePill(gname) }
                    FilterChips(f: $store.mapF, solid: true)
                }
                .padding(.top, 6)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(alignment: .trailing, spacing: 10) {
                    HStack {
                        // 沒有座標的店不會出現在地圖上，提醒一下，點了可以補地址
                        if missing > 0 {
                            Button { noAddr = true } label: {
                                Label("\(missing) 間還沒有地址", systemImage: "mappin.slash")
                                    .font(.footnote.weight(.heavy)).foregroundStyle(Color.ink)
                                    .padding(.horizontal, 12).frame(height: 36)
                                    .background(.white, in: .capsule).shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                            }
                            .buttonStyle(PressStyle())
                        }
                        Spacer()
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            withAnimation(.smooth(duration: 0.5)) { pos = .userLocation(fallback: pos) }
                        } label: { CircleIcon(icon: "location.fill") }
                        .buttonStyle(PressStyle())
                        .accessibilityLabel("我的位置")
                    }
                    .padding(.horizontal, 16)
                    NearbySheet(near: near, sel: $sel, group: gname, picked: sel.flatMap { id in list.first { $0.id == id } }, drawn: drawn != nil && drawn == sel) { draw(near) }
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: Place.self) { PlaceDetail(place: $0) }
        }
        .sheet(isPresented: $adding) { AddSheet() }
        .sheet(isPresented: $noAddr) { NoAddressSheet() }
        .sheet(isPresented: $scoping) { ScopeSheet().presentationDetents([.medium, .large]) }
        // 換看誰的收藏：重新框住那些店
        .onChange(of: store.mapGroup) { sel = nil; fitted = false; fit() }
        .onAppear {
            loc.requestWhenInUseAuthorization()
            if store.here == nil { store.here = loc.location }
            // 第一次打開先把所有收藏的店框進畫面
            fit()
        }
        .onChange(of: list.count) { fit() }
        // 拿到一次目前位置就好（剛允許定位也會馬上更新「附近」），不一直開著 GPS
        .task {
            do { for try await u in CLLocationUpdate.liveUpdates() { if let l = u.location { store.here = l; break } } } catch {}
        }
    }

    // 搜尋框下面的深色膠囊：現在看誰的收藏，點了換；群組時旁邊有 ✕ 回到我的收藏
    // 抽一間：從地圖現在看到的店裡抽（跟著篩選和群組），同一家的分店只算一次、抽中離你最近的那間；再抽一次不會抽到同一家
    private func draw(_ near: Nearby) {
        guard !drawing else { return }
        var pool = store.brands(near.places).map { $0[0] }
        if pool.count > 1, let cur = sel.flatMap({ id in pool.first { $0.id == id } }) {
            pool.removeAll { store.brand($0) == store.brand(cur) }
        }
        guard let win = pool.randomElement() else { return }
        drawn = win.id
        // 先讓地圖上 6–8 根圖釘輪流跳一下，最後選中抽到的那根
        let hoppers = near.places.filter { $0.id != win.id && $0.id != sel }.shuffled().prefix(Int.random(in: 6...8))
        guard !reduce, !hoppers.isEmpty else {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            sel = win.id
            return
        }
        drawing = true
        Task {
            for p in hoppers {
                hops[p.id, default: 0] += 1
                UISelectionFeedbackGenerator().selectionChanged()
                try? await Task.sleep(for: .seconds(0.15))
            }
            try? await Task.sleep(for: .seconds(0.12))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            sel = win.id
            drawing = false
        }
    }

    private func scopePill(_ gname: String?) -> some View {
        HStack(spacing: 8) {
            Button { scoping = true } label: {
                HStack(spacing: 8) {
                    if let g = store.mapGroup {
                        HStack(spacing: -6) { ForEach(store.membersOf(g).prefix(4), id: \.self) { Avatar(name: store.name($0), id: $0, size: 22) } }
                        Text("\(gname ?? "") · \(store.placesIn(g).count) 間").lineLimit(1)
                    } else {
                        Text("我的收藏")
                    }
                    Image(systemName: "chevron.down").font(.caption.weight(.heavy))
                }
                .font(.subheadline.weight(.heavy)).foregroundStyle(.white)
                .padding(.horizontal, 14).frame(height: 36)
                .background(Color(hex: 0x2a1a0a), in: .capsule)
                .frame(minHeight: 44).contentShape(.rect)
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel("地圖要看誰的收藏，現在是" + (gname ?? "我的收藏"))
            if store.mapGroup != nil {
                Button { withAnimation(.snappy) { store.mapGroup = nil } } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink)
                        .frame(width: 36, height: 36).background(.white, in: .circle).shadow(color: .black.opacity(0.12), radius: 4, y: 1)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel("回到我的收藏")
            }
            Spacer()
        }
        .padding(.horizontal, 16)
    }

    // 教學第一步：量出那間店的圖釘在螢幕上的位置（圖釘的尖端就是店的座標）
    private func pinFrame(_ proxy: MapProxy) {
        guard store.coachStep == .pin, let p = store.coachPlace, let lat = p.lat, let lng = p.lng,
              let pt = proxy.convert(CLLocationCoordinate2D(latitude: lat, longitude: lng), to: .global) else { return }
        let r = CGRect(x: pt.x - 24, y: pt.y - 58, width: 48, height: 58)
        if store.coachFrames[.pin] != r { store.coachFrames[.pin] = r }
    }

    private func fit() {
        if !fitted, let b = bounds { fitted = true; pos = .region(b) }
    }

    private var bounds: MKCoordinateRegion? {
        let ps = points; guard !ps.isEmpty else { return nil }
        let la = ps.map { $0.lat! }, lo = ps.map { $0.lng! }
        // 下面有一排卡片蓋住，框的時候往下多留一點
        return MKCoordinateRegion(center: .init(latitude: (la.min()! + la.max()!) / 2 - (la.max()! - la.min()!) * 0.15, longitude: (lo.min()! + lo.max()!) / 2),
                                  span: .init(latitudeDelta: max(0.02, (la.max()! - la.min()!) * 1.9), longitudeDelta: max(0.02, (lo.max()! - lo.min()!) * 1.3)))
    }
}

// 下面那排要放哪些店：地圖現在看到的範圍裡的店，由近到遠（沒開定位就從地圖中心算）；點到的那間一定在
struct Nearby {
    let title: String, subtitle: String, places: [Place]

    init(list: [Place], here: CLLocation?, region: MKCoordinateRegion?, selected: String?, total: Int) {
        guard !list.isEmpty else {
            title = total == 0 ? "還沒有收藏" : "地圖上還沒有店"
            subtitle = total == 0 ? "按右上角＋新增第一間" : "有地址的店會自己出現在地圖上"
            places = []
            return
        }
        let center = region.map { CLLocation(latitude: $0.center.latitude, longitude: $0.center.longitude) }
        let ref = here ?? center
        func inView(_ p: Place) -> Bool {
            guard let r = region else { return true }
            return abs(p.lat! - r.center.latitude) <= r.span.latitudeDelta / 2 && abs(p.lng! - r.center.longitude) <= r.span.longitudeDelta / 2
        }
        var l = list.filter(inView)
        if let selected, !l.contains(where: { $0.id == selected }), let p = list.first(where: { $0.id == selected }) { l.append(p) }
        if let ref {
            l = l.map { ($0, ref.distance(from: CLLocation(latitude: $0.lat!, longitude: $0.lng!))) }.sorted { $0.1 < $1.1 }.map(\.0)
        }
        places = l
        if l.isEmpty {
            title = "這一帶沒有收藏"; subtitle = "把地圖拉遠一點看看"
        } else {
            title = (here != nil ? "附近 " : "這一帶 ") + "\(l.count) 間"
            subtitle = here != nil ? "由近到遠" : "打開定位就會從你的位置排"
        }
    }
}

struct NearbySheet: View {
    let near: Nearby
    @Binding var sel: String?
    var group: String? = nil
    // 選到的那間（點圖釘或抽中）：下面換成那間的大卡片
    var picked: Place? = nil
    var drawn = false
    var draw: (() -> Void)? = nil
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Capsule().fill(Color.ink.opacity(0.15)).frame(width: 38, height: 5).frame(maxWidth: .infinity).padding(.top, 8)
            if let p = picked {
                PickedCard(place: p, saver: group == nil ? nil : p.owner, drawn: drawn, draw: draw) { sel = nil }
                    .id(p.id)
                    .transition(.asymmetric(insertion: .offset(y: 44).combined(with: .opacity), removal: .opacity))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text((group.map { "\($0) · " } ?? "") + near.title).font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                        Text(near.subtitle).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.45)).lineLimit(1)
                        Spacer(minLength: 0)
                        if let draw, !near.places.isEmpty {
                            Chip(text: "🎲 抽一間", on: true, action: draw)
                                .fixedSize()
                                .accessibilityHint("從地圖上的店隨機挑一間")
                        }
                    }
                    .padding(.leading, 18).padding(.trailing, 12)
                    if !near.places.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) {
                                ForEach(near.places) { p in
                                    NavigationLink(value: p) { MapCard(place: p, on: false, saver: group == nil ? nil : p.owner) }.buttonStyle(PressStyle())
                                }
                            }
                            .scrollTargetLayout()
                            .padding(.horizontal, 16).padding(.bottom, 6)
                        }
                        .scrollTargetBehavior(.viewAligned)
                        .frame(height: 112)
                    }
                }
                .transition(.opacity)
            }
        }
        // 換成大卡片時從下面彈上來（有一點點回彈）
        .animation(reduce ? .easeOut(duration: 0.25) : .spring(response: 0.45, dampingFraction: 0.68), value: picked?.id)
        // 底下留位置給浮著的分頁列，底色一路鋪到螢幕最下面
        .padding(.bottom, 82)
        .background(UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26).fill(Color.bg).shadow(color: .black.opacity(0.12), radius: 12, y: -2).ignoresSafeArea(edges: .bottom))
    }
}

// 選到一間時下面那張大卡：照片、店名、分類地區，導航和店家頁；抽中的還能再抽一次
struct PickedCard: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    let place: Place
    var saver: String? = nil
    var drawn = false
    var draw: (() -> Void)? = nil
    let close: () -> Void
    @State private var askNav = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(top).font(.system(size: 15, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                Spacer(minLength: 0)
                if let draw {
                    Chip(text: drawn ? "🎲 再抽一次" : "🎲 抽一間", on: true, action: draw).fixedSize()
                }
                Button(action: close) {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.ink)
                        .frame(width: 32, height: 32).background(Color.ink.opacity(0.07), in: .circle)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel("回到附近的店")
            }
            .padding(.leading, 18).padding(.trailing, 10)
            HStack(alignment: .top, spacing: 12) {
                PhotoView(place: place, px: 400).frame(width: 120, height: 120).clipShape(.rect(cornerRadius: 18))
                VStack(alignment: .leading, spacing: 4) {
                    Text(place.name).font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(meta).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                    if let saver {
                        Text("\(store.name(saver)) 收").font(.system(size: 11.5, weight: .heavy)).foregroundStyle(.white)
                            .padding(.horizontal, 8).frame(height: 22).background(Avatar.color(saver), in: .capsule)
                    } else {
                        Badge(place: place).overlay(Capsule().strokeBorder(Color.sprPink.opacity(place.been ? 0 : 0.35)))
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        Button {
                            if let a = NavApp.saved { if let u = place.navURL(a) { openURL(u) } } else { askNav = true }
                        } label: {
                            Label("導航", systemImage: "location.fill").font(.subheadline.weight(.heavy)).foregroundStyle(.white)
                                .padding(.horizontal, 12).frame(height: 36).background(Color.accent, in: .capsule)
                                .frame(minHeight: 44).contentShape(.rect)
                        }
                        .buttonStyle(PressStyle())
                        NavigationLink(value: place) {
                            HStack(spacing: 3) { Text("店家頁"); Image(systemName: "chevron.right").font(.caption.weight(.heavy)) }
                                .font(.subheadline.weight(.heavy)).foregroundStyle(Color.accent)
                                .padding(.horizontal, 12).frame(height: 36).background(Color.accent.opacity(0.13), in: .capsule)
                                .frame(minHeight: 44).contentShape(.rect)
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .frame(height: 120)
                Spacer(minLength: 0)
            }
            .padding(10)
            .candy(22)
            .padding(.horizontal, 16).padding(.bottom, 6)
        }
        .confirmationDialog("用哪個地圖導航？", isPresented: $askNav, titleVisibility: .visible) {
            ForEach(NavApp.allCases, id: \.self) { a in
                Button(a.name) { NavApp.saved = a; if let u = place.navURL(a) { openURL(u) } }
            }
        }
    }

    // 卡片上面一行：多遠、有幾間分店
    private var top: String {
        let n = store.branchesOf(place).count
        let s = [store.distance(place).map { "離你 " + fmtDistance($0) }, n > 1 ? "\(branchLabel(place))（\(n) 間分店）" : nil].compactMap { $0 }
        return s.isEmpty ? "選到的店" : s.joined(separator: " · ")
    }

    private var meta: String {
        var s = "\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)"
        if !place.area.isEmpty { s += " · " + place.area }
        if let pr = place.price, let t = PRICES[pr] { s += " · " + t }
        return s
    }
}

// 食物圖釘：分類顏色的圓、白邊、中間是分類的食物圖示，下面一個小尖角。
// 選到時：先壓扁一下再彈高放大、圖示換成封面照片、下面跳出店名、地上影子變寬、放一圈光和彩色糖粒；其他圖釘縮小變淡。
// 只動縮放、位移、透明度，不重建圖釘，地圖才順
struct FoodPin: View {
    let place: Place, on: Bool
    var dim = false                // 別間被選到時縮小變淡
    var hop = 0                    // 抽一間時每加一就跳一下
    var reduce = false             // 減少動態：不壓扁、不放光圈糖粒，只淡入淡出
    var saver: (id: String, name: String)? = nil   // 群組地圖：右上角小頭像是誰收的（地圖圖釘裡拿不到環境，直接傳名字）
    @State private var sx: CGFloat = 1
    @State private var sy: CGFloat = 1
    @State private var lift: CGFloat = 0
    @State private var up = false
    @State private var hopping = false

    var body: some View {
        let c = place.cat.color
        let faded = dim && !hopping
        VStack(spacing: -3) {
            ZStack {
                Circle().fill(c)
                Text(place.cat.emoji).font(.system(size: 21))
                if on, place.photoURL != nil { PinPhoto(place: place) }
            }
            .frame(width: 44, height: 44)
            .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            .overlay(alignment: .topTrailing) {
                if let saver { Avatar(name: saver.name, id: saver.id, size: 20).offset(x: 6, y: -4) }
            }
            Triangle().fill(.white).frame(width: 14, height: 10).rotationEffect(.degrees(180))
        }
        .scaleEffect(x: sx * (hopping ? 1.3 : 1), y: sy * (hopping ? 1.3 : 1), anchor: .bottom)
        .offset(y: lift)
        // 地上的影子：選到時變寬變淡
        .background(alignment: .bottom) {
            Ellipse().fill(.black.opacity(0.28)).frame(width: 22, height: 7)
                .scaleEffect(x: on ? 1.6 : 1, y: 1).opacity(on ? 0.55 : 1).offset(y: 3)
                .animation(.smooth(duration: 0.3), value: on)
        }
        // 深色店名小牌子，從圖釘下面彈出來
        .overlay(alignment: .bottom) {
            ZStack {
                if on {
                    Text(place.name).font(.system(size: 13, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
                        .padding(.horizontal, 9).frame(height: 24)
                        .background(Color(hex: 0x2a1a0a), in: .capsule)
                        .fixedSize()
                        .transition(reduce ? AnyTransition.opacity : AnyTransition.scale(scale: 0.4, anchor: .top).combined(with: .opacity))
                }
            }
            .offset(y: 32)
            .animation(reduce ? .easeOut(duration: 0.25) : .spring(response: 0.38, dampingFraction: 0.55), value: on)
            .allowsHitTesting(false)
        }
        .scaleEffect(faded ? 0.82 : 1, anchor: .bottom)
        .opacity(faded ? 0.5 : 1)
        .animation(.snappy(duration: 0.25), value: faded)
        .onAppear { if on { up = true; sx = 1.35; sy = 1.35; lift = -10 } }
        .onChange(of: on) { _, v in v ? select() : deselect() }
        .onChange(of: hop) {
            withAnimation(.spring(response: 0.22, dampingFraction: 0.5)) { hopping = true } completion: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { hopping = false }
            }
        }
    }

    private func select() {
        up = true
        if reduce { withAnimation(.easeOut(duration: 0.25)) { sx = 1.35; sy = 1.35; lift = -10 }; return }
        // 先壓扁，再彈高放大（有回彈）
        withAnimation(.easeOut(duration: 0.09)) { sx = 0.82; sy = 0.78 } completion: {
            guard up else { return }
            withAnimation(.spring(response: 0.42, dampingFraction: 0.55)) { sx = 1.35; sy = 1.35; lift = -10 }
        }
    }

    // 換選別間：這根縮回去時先縮過頭一點再彈回原大小
    private func deselect() {
        up = false
        if reduce { withAnimation(.easeOut(duration: 0.25)) { sx = 1; sy = 1; lift = 0 }; return }
        withAnimation(.easeIn(duration: 0.12)) { sx = 0.9; sy = 0.9; lift = 0 } completion: {
            guard !up else { return }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.5)) { sx = 1; sy = 1 }
        }
    }
}

// 圖釘裡的圓形封面照：照片載好才淡入，不會先閃一下
private struct PinPhoto: View {
    let place: Place
    @State private var img: UIImage?
    var body: some View {
        Color.clear.frame(width: 44, height: 44)
            .overlay { if let img { Image(uiImage: img).resizable().scaledToFill().transition(.opacity) } }
            .clipShape(.circle)
            .contentShape(.circle)
        .task(id: place.photo) {
            guard let u = place.photoURL else { return }
            if let c = PhotoLoader.shared.cached(u, 160) { img = c; return }
            let i = await PhotoLoader.shared.load(u, 160)
            withAnimation(.easeOut(duration: 0.25)) { img = i }
        }
    }
}

// 選到時放一次的光圈和糖粒，畫在整張地圖上面（不放在圖釘裡，才不會被圖釘的框切掉一半）
@Observable final class BurstSpot {
    var at: CGPoint?                     // 選到那根圖釘尖端在螢幕上的位置（地圖移動時跟著更新）
    var coord: CLLocationCoordinate2D?
    var color: Color = .accent
    var shot = 0
    var until = Date.distantPast         // 光圈放完前，地圖移動才需要更新位置
}

private struct PinBurst: View {
    let spot: BurstSpot
    private static let dots: [Color] = ([0xff4f9a, 0x2ed3a0, 0x4da3ff, 0xffd23f, 0xff8a00, 0x8a5cf6, 0xff4f9a, 0x2ed3a0, 0x4da3ff, 0xffd23f] as [UInt32]).map { Color(hex: $0) }

    var body: some View {
        let at = spot.at, color = spot.color
        GeometryReader { g in
            let o = g.frame(in: .global).origin
            Color.clear
                .keyframeAnimator(initialValue: -1.0, trigger: spot.shot) { v, t in
                    v.overlay {
                        if t >= 0, t < 1, let at {
                            // 圓頭的中心：圖釘高 51、圓心離底 29，放大 1.35 倍後約 39，再抬高 10
                            Canvas { ctx, _ in Self.draw(ctx, CGPoint(x: at.x - o.x, y: at.y - o.y - 49), t, color) }
                        }
                    }
                } keyframes: { _ in
                    // 等圖釘壓扁完（0.09 秒）彈起來的那一刻才放
                    KeyframeTrack {
                        MoveKeyframe(-1.0)
                        LinearKeyframe(-1.0, duration: 0.09)
                        LinearKeyframe(0.0, duration: 0.001)
                        LinearKeyframe(1.0, duration: 0.7)
                    }
                }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private static func draw(_ ctx: GraphicsContext, _ head: CGPoint, _ t: Double, _ color: Color) {
        // 光圈：以圓頭為中心，0.65 秒從 0.6 倍放大到 3.2 倍並淡掉
        let rt = min(t / 0.93, 1), re = 1 - pow(1 - rt, 3)
        let r = 30 * (0.6 + 2.6 * re)
        ctx.stroke(Path(ellipseIn: CGRect(x: head.x - r, y: head.y - r, width: r * 2, height: r * 2)),
                   with: .color(color.opacity(0.9 * (1 - rt))), lineWidth: 3)
        // 糖粒：從圓頭往四周噴出去 34–54pt，再往下掉、淡掉
        let e = 1 - pow(1 - t, 2)
        for i in 0..<Self.dots.count {
            let a = 2 * Double.pi * (Double(i) + 0.25) / Double(Self.dots.count)
            let d = 34 + 20 * (Double(i) * 0.618).truncatingRemainder(dividingBy: 1)
            let rr = 24 + d * e   // 從圓頭邊緣往外飛
            let p = CGPoint(x: head.x + cos(a) * rr, y: head.y + sin(a) * rr + 36 * t * t)
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3.5, y: p.y - 3.5, width: 7, height: 7)), with: .color(dots[i].opacity(1 - t)))
        }
    }
}

struct MapCard: View {
    @Environment(Store.self) private var store
    let place: Place, on: Bool
    var saver: String? = nil
    var body: some View {
        HStack(spacing: 12) {
            PhotoView(place: place, px: 300).frame(width: 84, height: 84).clipShape(.rect(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.system(size: 16, weight: .heavy)).lineLimit(1).foregroundStyle(Color.ink)
                Text("\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(place.area.isEmpty ? "" : " · " + place.area)")
                    .font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                Spacer(minLength: 0)
                if let saver {
                    // 群組地圖：誰收的（那個人的顏色）
                    Text("\(store.name(saver)) 收").font(.system(size: 11.5, weight: .heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 8).frame(height: 22).background(Avatar.color(saver), in: .capsule)
                } else {
                    Badge(place: place).overlay(Capsule().strokeBorder(Color.sprPink.opacity(place.been ? 0 : 0.35)))
                }
            }
            .padding(.vertical, 4)
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(width: 270, height: 104)
        .candy(20)
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(on ? Color.accent : .clear, lineWidth: 2.5))
    }
}

// 還沒有地址的店：列出來，點一間就能補地址（存檔時會自己查座標）
struct NoAddressSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var editing: Place?

    var body: some View {
        let list = store.mine.filter { $0.lat == nil || $0.lng == nil }
        NavigationStack {
            List(list) { p in
                Button { editing = p } label: {
                    HStack(spacing: 12) {
                        PhotoView(place: p, px: 160).frame(width: 52, height: 52).clipShape(.rect(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.headline).foregroundStyle(Color.ink)
                            Text(p.address?.isEmpty == false ? "地址找不到位置，點一下改" : "點一下補地址").font(.caption).foregroundStyle(Color.ink.opacity(0.5))
                        }
                        Spacer()
                        Image(systemName: "pencil").foregroundStyle(Color.accent)
                    }
                }
            }
            .overlay { if list.isEmpty { ContentUnavailableView("都在地圖上了 🎉", systemImage: "map") } }
            .navigationTitle("還沒有地址").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("完成") { dismiss() } }
            .sheet(item: $editing) { EditSheet(place: $0) }
        }
    }
}

// 「地圖要看誰的收藏？」：我的收藏，或某個群組大家分享的店
struct ScopeSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    row(nil, "我的收藏", "\(store.mine.count) 間 · 只有你自己存的") { Image("Logo").resizable().frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 10)).accessibilityHidden(true) }
                    ForEach(store.groups) { g in
                        let mem = store.membersOf(g.id)
                        row(g.id, g.name, "\(store.placesIn(g.id).count) 間 · \(mem.count) 人") {
                            HStack(spacing: -10) { ForEach(mem.prefix(3), id: \.self) { Avatar(name: store.name($0), id: $0, size: 28) } }
                                .frame(width: 40, alignment: .leading)
                        }
                    }
                }
                .padding(16)
            }
            .background(Color.bg)
            .navigationTitle("地圖要看誰的收藏？").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("完成") { dismiss() } }
        }
    }

    private func row<I: View>(_ id: String?, _ title: String, _ sub: String, @ViewBuilder icon: () -> I) -> some View {
        let on = store.mapGroup == id
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.snappy) { store.mapGroup = id }
            dismiss()
        } label: {
            HStack(spacing: 12) {
                icon()
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                    Text(sub).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                }
                Spacer()
                if on { Image(systemName: "checkmark").font(.system(size: 15, weight: .heavy)).foregroundStyle(Color.accent) }
            }
            .padding(14)
            .candy(18)
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(on ? Color.accent : .clear, lineWidth: 2.5))
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
