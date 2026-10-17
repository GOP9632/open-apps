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
                            FoodPin(place: p, on: sel == p.id, saver: gname == nil ? nil : p.owner.map { ($0, store.name($0)) })
                        }
                        .tag(p.id)
                        .annotationTitles(.hidden)
                    }
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .mapControls { MapCompass() }
                .onMapCameraChange(frequency: .continuous) { _ in pinFrame(proxy) }
                .onMapCameraChange { c in
                    if selfMoved { selfMoved = false } else { shownRegion = c.region }
                }
                .onChange(of: store.coachStep) { pinFrame(proxy) }
                .onChange(of: sel) { _, id in
                    guard let p = list.first(where: { $0.id == id }) else { return }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    // 只把地圖移到那間，不改縮放
                    selfMoved = true
                    let span = shownRegion?.span ?? MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
                    withAnimation(.smooth(duration: 0.5)) { pos = .region(MKCoordinateRegion(center: .init(latitude: p.lat!, longitude: p.lng!), span: span)) }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 8) {
                    SearchField(text: $store.mapF.q, prompt: gname.map { "在「\($0)」裡找" } ?? "今天想吃什麼？") {
                        AddButton { adding = true }.coachAnchor(.add)
                    }
                    .padding(.horizontal, 16)
                    if !store.groups.isEmpty { scopePill(gname) }
                    FilterChips(f: $store.mapF)
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
                    NearbySheet(near: near, sel: $sel, group: gname)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Capsule().fill(Color.ink.opacity(0.15)).frame(width: 38, height: 5).frame(maxWidth: .infinity).padding(.top, 8)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text((group.map { "\($0) · " } ?? "") + near.title).font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                Text(near.subtitle).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.45))
            }
            .padding(.horizontal, 18)
            if !near.places.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(near.places) { p in
                            NavigationLink(value: p) { MapCard(place: p, on: sel == p.id, saver: group == nil ? nil : p.owner) }.buttonStyle(PressStyle()).id(p.id)
                        }
                    }
                    .scrollTargetLayout()
                    .padding(.horizontal, 16).padding(.bottom, 6)
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $sel, anchor: .center)
                .frame(height: 112)
            }
        }
        // 底下留位置給浮著的分頁列，底色一路鋪到螢幕最下面
        .padding(.bottom, 82)
        .background(UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26).fill(Color.bg).shadow(color: .black.opacity(0.12), radius: 12, y: -2).ignoresSafeArea(edges: .bottom))
    }
}

// 食物圖釘：分類顏色的圓、白邊、中間是分類的食物圖示，下面一個小尖角
struct FoodPin: View {
    let place: Place, on: Bool
    var saver: (id: String, name: String)? = nil   // 群組地圖：右上角小頭像是誰收的（地圖圖釘裡拿不到環境，直接傳名字）
    var body: some View {
        let c = place.cat.color
        VStack(spacing: -3) {
            Text(place.cat.emoji).font(.system(size: on ? 26 : 21))
                .frame(width: on ? 54 : 44, height: on ? 54 : 44)
                .background(c, in: .circle)
                .overlay(Circle().strokeBorder(.white, lineWidth: 3))
                .overlay(alignment: .topTrailing) {
                    if let saver { Avatar(name: saver.name, id: saver.id, size: 20).offset(x: 6, y: -4) }
                }
            Triangle().fill(.white).frame(width: 14, height: 10).rotationEffect(.degrees(180))
        }
        .shadow(color: .black.opacity(0.25), radius: 5, y: 3)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: on)
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
