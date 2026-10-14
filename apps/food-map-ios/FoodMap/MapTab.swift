import SwiftUI
import MapKit

// 地圖：用 iPhone 內建的 Apple 地圖（免費、不用額外載入函式庫），下面一排卡片，滑到哪張地圖就跟到哪間
struct MapTab: View {
    @Environment(Store.self) private var store
    // 一打開先框住所有收藏的店（不跳到目前位置），想看自己在哪按右上角的定位鈕
    @State private var pos: MapCameraPosition = .region(MKCoordinateRegion(center: .init(latitude: 25.0418, longitude: 121.5436), latitudinalMeters: 9000, longitudinalMeters: 9000))
    @State private var sel: String?
    @State private var loc = CLLocationManager()
    @State private var fitted = false

    private var points: [Place] { store.visible.filter { $0.lat != nil && $0.lng != nil } }

    var body: some View {
        // 有座標的店一次算好，下面每個地方共用
        let list = points
        NavigationStack {
            ZStack(alignment: .bottom) {
                Map(position: $pos, selection: $sel) {
                    UserAnnotation()
                    ForEach(list) { p in
                        Annotation(p.name, coordinate: .init(latitude: p.lat!, longitude: p.lng!), anchor: .bottom) {
                            Pin(place: p, on: sel == p.id)
                        }
                        .tag(p.id)
                        .annotationTitles(.hidden)
                    }
                }
                .mapControls { MapUserLocationButton(); MapCompass() }
                .onChange(of: sel) { _, id in
                    guard let p = list.first(where: { $0.id == id }) else { return }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.smooth(duration: 0.5)) { pos = .region(MKCoordinateRegion(center: .init(latitude: p.lat!, longitude: p.lng!), latitudinalMeters: 1500, longitudinalMeters: 1500)) }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(list) { p in
                            NavigationLink(value: p) { MapCard(place: p, on: sel == p.id) }.buttonStyle(PressStyle()).id(p.id)
                        }
                    }
                    .scrollTargetLayout()
                    .padding(.horizontal, 24)
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $sel, anchor: .center)
                .frame(height: 130)
                .padding(.bottom, 10)
            }
            .navigationDestination(for: Place.self) { PlaceDetail(place: $0) }
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
        .onAppear {
            loc.requestWhenInUseAuthorization()
            // 第一次打開先把所有收藏的店框進畫面
            fit()
        }
        .onChange(of: list.count) { fit() }
    }

    private func fit() {
        if !fitted, let b = bounds { fitted = true; pos = .region(b) }
    }

    private var bounds: MKCoordinateRegion? {
        let ps = points; guard !ps.isEmpty else { return nil }
        let la = ps.map { $0.lat! }, lo = ps.map { $0.lng! }
        return MKCoordinateRegion(center: .init(latitude: (la.min()! + la.max()!) / 2, longitude: (lo.min()! + lo.max()!) / 2),
                                  span: .init(latitudeDelta: max(0.02, (la.max()! - la.min()!) * 1.3), longitudeDelta: max(0.02, (lo.max()! - lo.min()!) * 1.3)))
    }
}

struct Pin: View {
    let place: Place, on: Bool
    var body: some View {
        PhotoView(place: place, px: 120)
            .frame(width: on ? 52 : 40, height: on ? 52 : 40)
            .clipShape(.circle)
            .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            .overlay(Circle().strokeBorder(place.cat.color, lineWidth: on ? 2 : 0).padding(-2))
            .shadow(color: .black.opacity(0.25), radius: 6, y: 3)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: on)
    }
}

struct MapCard: View {
    let place: Place, on: Bool
    var body: some View {
        HStack(spacing: 12) {
            PhotoView(place: place, px: 300).frame(width: 90, height: 110).clipShape(.rect(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.headline).lineLimit(2).foregroundStyle(.primary)
                Text("\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)").font(.caption).foregroundStyle(.secondary)
                Text(place.area).font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Badge(place: place)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(width: min(UIScreen.main.bounds.width * 0.84, 340), height: 130)
        .background(Color.panel, in: .rect(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(on ? Color.accent : .clear, lineWidth: 2))
        .shadow(color: .black.opacity(0.15), radius: 14, y: 6)
    }
}
