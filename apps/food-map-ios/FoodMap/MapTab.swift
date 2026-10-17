import SwiftUI
import MapKit

// 首頁地圖：用 iPhone 內建的 Apple 地圖，收藏的店是食物圖釘；上面搜尋＋新增、篩選，下面「附近 N 間」一排卡片
struct MapTab: View {
    @Environment(Store.self) private var store
    // 一打開先框住所有收藏的店（不跳到目前位置），想看自己在哪按右下的定位鈕
    @State private var pos: MapCameraPosition = .region(MKCoordinateRegion(center: .init(latitude: 25.0418, longitude: 121.5436), latitudinalMeters: 9000, longitudinalMeters: 9000))
    @State private var sel: String?
    @State private var loc = CLLocationManager()
    @State private var here: CLLocation?
    @State private var fitted = false
    @State private var adding = false
    @State private var noAddr = false

    private var points: [Place] { store.shown(store.mapF).filter { $0.lat != nil && $0.lng != nil } }

    var body: some View {
        @Bindable var store = store
        // 有座標的店一次算好，下面每個地方共用
        let list = points
        let all = store.shown(store.mapF)
        let near = Nearby(list: list, here: here, total: all.count)
        let missing = all.count - list.count
        NavigationStack(path: $store.mapPath) {
            MapReader { proxy in
                Map(position: $pos, selection: $sel) {
                    UserAnnotation()
                    ForEach(list) { p in
                        Annotation(p.name, coordinate: .init(latitude: p.lat!, longitude: p.lng!), anchor: .bottom) {
                            FoodPin(place: p, on: sel == p.id)
                        }
                        .tag(p.id)
                        .annotationTitles(.hidden)
                    }
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .mapControls { MapCompass() }
                .onMapCameraChange(frequency: .continuous) { _ in pinFrame(proxy) }
                .onChange(of: store.coachStep) { pinFrame(proxy) }
                .onChange(of: sel) { _, id in
                    guard let p = list.first(where: { $0.id == id }) else { return }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.smooth(duration: 0.5)) { pos = .region(MKCoordinateRegion(center: .init(latitude: p.lat!, longitude: p.lng!), latitudinalMeters: 1500, longitudinalMeters: 1500)) }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 8) {
                    SearchField(text: $store.mapF.q, prompt: "今天想吃什麼？") {
                        AddButton { adding = true }.coachAnchor(.add)
                    }
                    .padding(.horizontal, 16)
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
                    NearbySheet(near: near, sel: $sel)
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: Place.self) { PlaceDetail(place: $0) }
        }
        .sheet(isPresented: $adding) { AddSheet() }
        .sheet(isPresented: $noAddr) { NoAddressSheet() }
        .onAppear {
            loc.requestWhenInUseAuthorization()
            here = loc.location
            // 第一次打開先把所有收藏的店框進畫面
            fit()
        }
        .onChange(of: list.count) { fit() }
        // 拿到一次目前位置就好（剛允許定位也會馬上更新「附近」），不一直開著 GPS
        .task {
            do { for try await u in CLLocationUpdate.liveUpdates() { if let l = u.location { here = l; break } } } catch {}
        }
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

// 下面那排要放哪些店、標題怎麼寫：1.2 公里內叫「附近」，附近沒有就列最近的 10 間，沒開定位就照收藏順序
struct Nearby {
    let title: String, subtitle: String, places: [Place]

    init(list: [Place], here: CLLocation?, total: Int) {
        guard !list.isEmpty else {
            title = total == 0 ? "還沒有收藏" : "地圖上還沒有店"
            subtitle = total == 0 ? "按右上角＋新增第一間" : "有地址的店會自己出現在地圖上"
            places = []
            return
        }
        guard let here else {
            title = "你的收藏 \(list.count) 間"; subtitle = "打開定位就能看附近的店"; places = list
            return
        }
        let sorted = list.map { ($0, here.distance(from: CLLocation(latitude: $0.lat!, longitude: $0.lng!))) }.sorted { $0.1 < $1.1 }
        let close = sorted.filter { $0.1 <= 1200 }.map(\.0)
        if close.isEmpty {
            title = "離你最近"; subtitle = "附近 1.2 公里沒有收藏的店"; places = Array(sorted.prefix(10).map(\.0))
        } else {
            title = "附近 \(close.count) 間"; subtitle = "走路 15 分鐘內"; places = close
        }
    }
}

struct NearbySheet: View {
    let near: Nearby
    @Binding var sel: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Capsule().fill(Color.ink.opacity(0.15)).frame(width: 38, height: 5).frame(maxWidth: .infinity).padding(.top, 8)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(near.title).font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink)
                Text(near.subtitle).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.45))
            }
            .padding(.horizontal, 18)
            if !near.places.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(near.places) { p in
                            NavigationLink(value: p) { MapCard(place: p, on: sel == p.id) }.buttonStyle(PressStyle()).id(p.id)
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
    var body: some View {
        let c = place.cat.color
        VStack(spacing: -3) {
            Text(place.cat.emoji).font(.system(size: on ? 26 : 21))
                .frame(width: on ? 54 : 44, height: on ? 54 : 44)
                .background(c, in: .circle)
                .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            Triangle().fill(.white).frame(width: 14, height: 10).rotationEffect(.degrees(180))
        }
        .shadow(color: .black.opacity(0.25), radius: 5, y: 3)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: on)
    }
}

struct MapCard: View {
    let place: Place, on: Bool
    var body: some View {
        HStack(spacing: 12) {
            PhotoView(place: place, px: 300).frame(width: 84, height: 84).clipShape(.rect(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.system(size: 16, weight: .heavy)).lineLimit(1).foregroundStyle(Color.ink)
                Text("\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(place.area.isEmpty ? "" : " · " + place.area)")
                    .font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.55)).lineLimit(1)
                Spacer(minLength: 0)
                Badge(place: place).overlay(Capsule().strokeBorder(Color.sprPink.opacity(place.been ? 0 : 0.35)))
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
