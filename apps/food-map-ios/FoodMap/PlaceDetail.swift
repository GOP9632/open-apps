import SwiftUI
import MapKit

// 店家頁（這個試用版只看不改，資料一樣跟網頁版同步）
struct PlaceDetail: View {
    let place: Place
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Color.clear.aspectRatio(4 / 4.2, contentMode: .fit)
                    .overlay { PhotoView(place: place, px: 1200) }
                    .overlay(alignment: .bottomLeading) {
                        VStack(alignment: .leading, spacing: 6) {
                            Badge(place: place)
                            Text(place.name).font(.system(size: 28, weight: .heavy))
                            if let b = place.branch, !b.isEmpty { Text(b).font(.headline).opacity(0.85) }
                            Text([ "\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)", place.area, place.price.flatMap { PRICES[$0] } ?? "" ].filter { !$0.isEmpty }.joined(separator: "・"))
                                .font(.subheadline.weight(.semibold)).opacity(0.9)
                        }
                        .foregroundStyle(.white).padding(20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom))
                    }
                    .clipped()

                HStack(spacing: 10) {
                    Act(icon: "location.fill", text: "導航", primary: true) { if let u = place.mapsURL { openURL(u) } }
                    if let s = place.source_url, let u = URL(string: s), !s.isEmpty {
                        Act(icon: s.contains("instagram") ? "play.fill" : "arrow.up.right.square", text: s.contains("instagram") ? "看影片" : "原始貼文") { openURL(u) }
                    }
                    ShareLink(item: place.mapsURL ?? URL(string: "https://maps.google.com")!) { ActLabel(icon: "square.and.arrow.up", text: "分享") }
                        .buttonStyle(PressStyle())
                }
                .padding(.horizontal, 16)

                if let d = place.dishes, !d.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("必點", systemImage: "star.fill").font(.headline).foregroundStyle(Color.accent)
                        FlowRow(items: d)
                    }
                    .padding(.horizontal, 16)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Label(place.address?.isEmpty == false ? place.address! : (place.area.isEmpty ? "沒有地址" : place.area), systemImage: "mappin.and.ellipse")
                    if let h = place.hours, !h.isEmpty { Label(h, systemImage: "clock") }
                    if let n = place.note, !n.isEmpty { Label(n, systemImage: "text.bubble") }
                }
                .font(.subheadline).padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.panel, in: .rect(cornerRadius: 18))
                .padding(.horizontal, 16)

                if let lat = place.lat, let lng = place.lng {
                    let c = CLLocationCoordinate2D(latitude: lat, longitude: lng)
                    Map(initialPosition: .region(MKCoordinateRegion(center: c, latitudinalMeters: 700, longitudinalMeters: 700))) {
                        Marker(place.name, coordinate: c).tint(place.cat.color)
                    }
                    .frame(height: 190).clipShape(.rect(cornerRadius: 18)).allowsHitTesting(false)
                    .onTapGesture { if let u = place.mapsURL { openURL(u) } }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 30)
        }
        .background(Color.bg)
        .ignoresSafeArea(edges: .top)
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}

struct Act: View {
    let icon: String, text: String
    var primary = false
    let action: () -> Void
    var body: some View { Button(action: action) { ActLabel(icon: icon, text: text, primary: primary) }.buttonStyle(PressStyle()) }
}

struct ActLabel: View {
    let icon: String, text: String
    var primary = false
    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 18, weight: .semibold))
            Text(text).font(.caption.weight(.semibold))
        }
        .frame(maxWidth: .infinity).frame(height: 62)
        .background(primary ? AnyShapeStyle(Color.grad) : AnyShapeStyle(Color.panel), in: .rect(cornerRadius: 16))
        .foregroundStyle(primary ? .white : .primary)
    }
}

struct FlowRow: View {
    let items: [String]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { Text($0).font(.subheadline.weight(.semibold)).padding(.horizontal, 12).frame(height: 32).background(Color.accent.opacity(0.12), in: .capsule).foregroundStyle(Color.accent) }
            }
        }
    }
}
