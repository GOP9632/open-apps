import SwiftUI
import MapKit

// 店家頁：自己的店可以改想去／去過、星等、分享到群組、編輯、刪除；朋友的店只能看
struct PlaceDetail: View {
    let place: Place
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(Store.self) private var store
    @State private var editing = false
    @State private var deleting = false

    var body: some View {
        // 永遠顯示最新的那份（剛改的狀態、別台裝置改的都會跟上）
        let place = store.place(self.place.id) ?? self.place
        let mine = store.isMine(place)
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

                if mine { mineBox(place) }
                else if let o = place.owner { Label("\(store.name(o)) 的收藏", systemImage: "person.crop.circle").font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, 16) }

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
                    // 地圖本身不接手勢（避免跟捲動打架），上面疊一層透明的來接「點一下開 Google 地圖」
                    .overlay { Color.clear.contentShape(.rect).onTapGesture { if let u = place.mapsURL { openURL(u) } } }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 30)
        }
        .background(Color.bg)
        .ignoresSafeArea(edges: .top)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            if mine {
                Menu {
                    Button("編輯", systemImage: "pencil") { editing = true }
                    Button("刪除", systemImage: "trash", role: .destructive) { deleting = true }
                } label: { Image(systemName: "ellipsis.circle.fill").symbolRenderingMode(.hierarchical).font(.title2) }
                .accessibilityLabel("更多")
            }
        }
        .sheet(isPresented: $editing) { EditSheet(place: place) }
        .confirmationDialog("刪除「\(place.name)」？", isPresented: $deleting, titleVisibility: .visible) {
            Button("刪除", role: .destructive) { dismiss(); Task { await store.delete(place) } }
        }
    }

    // 自己的店：想去／去過、星等、分享到哪些群組
    private func mineBox(_ place: Place) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("狀態", selection: Binding(get: { place.status ?? "want" }, set: { v in
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                var p = place; p.status = v
                if v == "want" { p.rating = nil }
                Task { await store.save(p) }
            })) {
                Text("想去").tag("want")
                Text("去過").tag("been")
            }
            .pickerStyle(.segmented)
            if place.been {
                HStack {
                    Text("好吃嗎？").font(.subheadline.weight(.semibold))
                    Spacer()
                    Stars(value: place.rating) { r in var p = place; p.rating = r; Task { await store.save(p) } }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
            if !store.groups.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("分享到群組").font(.subheadline.weight(.semibold))
                    Flow(spacing: 8) {
                        ForEach(store.groups) { g in
                            let on = store.shared(place.id, g.id)
                            Chip(text: (on ? "✓ " : "") + g.name, on: on) {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                Task { if on { await store.unshare(g.id, place.id) } else { await store.share(g.id, [place.id]) } }
                            }
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(Color.panel, in: .rect(cornerRadius: 18))
        .padding(.horizontal, 16)
        .animation(.snappy, value: place.been)
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
