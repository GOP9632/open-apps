import SwiftUI

// 收藏頁：和網頁版一樣的兩欄卡片、搜尋、分類和想去／去過篩選
struct ListTab: View {
    @Environment(Store.self) private var store
    @Namespace private var zoom

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    chips
                    Text("\(store.visible.count) 間").font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 16)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 16) {
                        ForEach(store.visible) { p in
                            NavigationLink(value: p) { PlaceCard(place: p) }
                                .buttonStyle(PressStyle())
                                .matchedTransitionSource(id: p.id, in: zoom) { $0.clipShape(.rect(cornerRadius: 18)) }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
            .background(Color.bg)
            .navigationTitle("美食收藏")
            .searchable(text: $store.q, prompt: "搜尋店名、地區、料理、標籤")
            .refreshable { await store.sync() }
            .navigationDestination(for: Place.self) { p in
                PlaceDetail(place: p).navigationTransition(.zoom(sourceID: p.id, in: zoom))
            }
            .overlay { if store.places.isEmpty && store.loading { ProgressView() } }
        }
        .onAppear(perform: markPaint)
        .onChange(of: store.places.count) { markPaint() }
    }

    private func markPaint() {
        if store.firstPaintMs == nil, !store.places.isEmpty {
            store.firstPaintMs = Int(Date().timeIntervalSince(Store.launchedAt) * 1000)
        }
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Chip(text: "想去", on: store.status == "want") { toggle(\.status, "want") }
                Chip(text: "去過", on: store.status == "been") { toggle(\.status, "been") }
                Divider().frame(height: 20)
                Chip(text: "全部", on: store.cat.isEmpty) { store.cat = "" }
                ForEach(Cat.order, id: \.self) { k in
                    let c = Cat.all[k]!
                    Chip(text: "\(c.emoji) \(c.name)", on: store.cat == k) { toggle(\.cat, k) }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func toggle(_ kp: ReferenceWritableKeyPath<Store, String>, _ v: String) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.snappy) { store[keyPath: kp] = store[keyPath: kp] == v ? "" : v }
    }
}

struct Chip: View {
    let text: String, on: Bool, action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(text).font(.subheadline.weight(.semibold))
                .padding(.horizontal, 13).frame(height: 34)
                .background(on ? AnyShapeStyle(Color.grad) : AnyShapeStyle(Color.panel), in: .capsule)
                .foregroundStyle(on ? .white : .primary)
                .overlay(Capsule().strokeBorder(.black.opacity(on ? 0 : 0.08)))
        }
        .buttonStyle(PressStyle())
    }
}

struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct PlaceCard: View {
    let place: Place
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Color.clear.aspectRatio(4 / 5, contentMode: .fit)
                .overlay { PhotoView(place: place, px: 500) }
                .overlay(alignment: .topLeading) { Badge(place: place).padding(9) }
                .clipShape(.rect(cornerRadius: 18))
                .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
            Text(place.name + (place.branch?.isEmpty == false ? " \(place.branch!)" : ""))
                .font(.system(size: 15.5, weight: .bold)).lineLimit(2).foregroundStyle(.primary)
            Text("\(place.cat.emoji) \(place.cuisine?.isEmpty == false ? place.cuisine! : place.cat.name)\(place.area.isEmpty ? "" : " · " + place.area)")
                .font(.system(size: 12.5)).foregroundStyle(.secondary).lineLimit(1)
            if let d = place.dishes, !d.isEmpty {
                Text("必點 " + d.prefix(3).joined(separator: "・")).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.accent).lineLimit(1)
            }
        }
        .multilineTextAlignment(.leading)
    }
}

struct Badge: View {
    let place: Place
    var body: some View {
        Text(place.been ? "去過" + (place.rating.map { " ★\($0)" } ?? "") : "想去")
            .font(.system(size: 12, weight: .bold))
            .padding(.horizontal, 9).frame(height: 24)
            .background(place.been ? Color(hex: 0x2f9e44).opacity(0.92) : Color.white.opacity(0.92), in: .capsule)
            .foregroundStyle(place.been ? .white : .black)
    }
}
