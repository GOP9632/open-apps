import SwiftUI
import MapKit

// 店家頁：大張圓角照片、白色資料卡（想去／去過切換）、三顆彩色按鈕、彩色必點
// 自己的店可以改想去／去過、星等、分享到群組、編輯、刪除；朋友的店只能看
struct PlaceDetail: View {
    let place: Place
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(Store.self) private var store
    @State private var editing = false
    @State private var deleting = false
    @State private var askNav = false
    // 選到的分店（預設是點進來的那間）；想去／去過、導航、地址都跟著它
    @State private var picked: String?

    var body: some View {
        // 永遠顯示最新的那份（剛改的狀態、別台裝置改的都會跟上）
        let base = store.place(self.place.id) ?? self.place
        let place = picked.flatMap { store.place($0) } ?? base
        let branches = store.branchesOf(base)
        let mine = store.isMine(place)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                top(place, mine: mine)
                photo(place)
                info(place, mine: mine, branches: branches)
                actions(place, branched: branches.count > 1)
                if let d = place.dishes, !d.isEmpty { dishes(d) }
                details(place)
                if mine && !store.groups.isEmpty { groups(place) }
                if let lat = place.lat, let lng = place.lng { map(place, CLLocationCoordinate2D(latitude: lat, longitude: lng)) }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 30)
        }
        .background(Color.bg)
        .toolbarVisibility(.hidden, for: .navigationBar)
        .onAppear { Perf.shared.mark("進店家頁") }
        .sheet(isPresented: $editing) { EditSheet(place: place) }
        .confirmationDialog("用哪個地圖導航？", isPresented: $askNav, titleVisibility: .visible) {
            ForEach(NavApp.allCases, id: \.self) { a in
                Button(a.name) { NavApp.saved = a; if let u = place.navURL(a) { openURL(u) } }
            }
        } message: { Text("之後可以在「我的」改") }
        .confirmationDialog("刪除「\(place.name)」？", isPresented: $deleting, titleVisibility: .visible) {
            Button("刪除", role: .destructive) { back(); store.deleteWithUndo(place) }
        }
    }

    // 回上一頁：地圖分頁的頁面記在 store.mapPath，直接從那裡退一頁（dismiss 在地圖那邊沒反應）
    private func back() {
        Perf.shared.mark("返回")
        if store.tab == 0, !store.mapPath.isEmpty { store.mapPath.removeLast() } else { dismiss() }
    }

    // 上面一排：返回、更多（不壓在照片上）
    private func top(_ place: Place, mine: Bool) -> some View {
        HStack {
            Button { back() } label: { CircleIcon(icon: "chevron.left") }
                .buttonStyle(PressStyle()).accessibilityLabel("返回")
            Spacer()
            Menu {
                if mine {
                    Button("編輯", systemImage: "pencil") { editing = true }
                    Button("刪除", systemImage: "trash", role: .destructive) { deleting = true }
                } else if let o = place.owner {
                    Text("\(store.name(o)) 的收藏")
                }
                Button("分享", systemImage: "square.and.arrow.up") { share(place) }
            } label: { CircleIcon(icon: "ellipsis") }
            .accessibilityLabel("更多")
        }
        .padding(.top, 4)
    }

    private func photo(_ place: Place) -> some View {
        Color.clear.aspectRatio(1, contentMode: .fit)
            .overlay { PlaceMedia(place: place) }
            .clipShape(.rect(cornerRadius: 28))
            .overlay(alignment: .bottomLeading) {
                Text("\(place.cat.emoji) \(place.cat.name)").font(.footnote.weight(.heavy)).foregroundStyle(.white)
                    .padding(.horizontal, 11).frame(height: 30).background(place.cat.color, in: .capsule)
                    .overlay(Capsule().strokeBorder(.white, lineWidth: 2)).padding(14)
            }
    }

    private func info(_ place: Place, mine: Bool, branches: [Place]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.system(size: 26, weight: .black)).foregroundStyle(Color.ink)
                if branches.count > 1 {
                    branchChips(branches, on: place.id)
                } else if let b = place.branch, !b.isEmpty {
                    Text(b).font(.headline).foregroundStyle(Color.ink.opacity(0.7))
                }
                let meta = [place.cuisine ?? "", place.area, place.price.flatMap { PRICES[$0] } ?? ""].filter { !$0.isEmpty }
                if !meta.isEmpty { Text(meta.joined(separator: " · ")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)) }
            }
            if mine {
                StatusToggle(place: place)
                if place.been {
                    HStack {
                        Text("好吃嗎？").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink)
                        Spacer()
                        Stars(value: place.rating) { r in var p = place; p.rating = r; Task { await store.save(p) } }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            } else if let o = place.owner {
                HStack(spacing: 8) {
                    Avatar(name: store.name(o), id: o, size: 26)
                    Text("\(store.name(o)) 的收藏").font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.6))
                    Spacer()
                    Badge(place: place)
                }
                // 朋友的店：一鍵加進自己的收藏
                if store.alreadyMine(place) {
                    Label("已在你的收藏", systemImage: "checkmark").font(.subheadline.weight(.heavy)).foregroundStyle(Color.sprMint)
                        .frame(maxWidth: .infinity).frame(height: 44)
                } else {
                    Button { Task { await store.copyToMine(place) } } label: { Text("♥ 我也想去").frame(maxWidth: .infinity) }
                        .buttonStyle(ChunkyStyle(color: .sprPink, edge: Color.sprPink.mix(with: .black, by: 0.2), radius: 14))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .candy(24)
        .animation(.snappy(duration: 0.28), value: place.been)
    }

    // 同一家的分店：由近到遠，📍 是現在選的這間
    private func branchChips(_ branches: [Place], on id: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(branches.count) 間分店" + (store.here != nil ? "・由近到遠" : "")).font(.caption.weight(.bold)).foregroundStyle(Color.ink.opacity(0.45))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(branches) { b in
                        let d = store.distance(b).map { " " + fmtDistance($0) } ?? ""
                        Chip(text: (b.id == id ? "📍 " : "") + branchLabel(b) + d, on: b.id == id, color: .accent) {
                            Haptic.light()
                            withAnimation(.snappy(duration: 0.28)) { picked = b.id }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(.top, 2)
    }

    private func actions(_ place: Place, branched: Bool) -> some View {
        HStack(spacing: 10) {
            Button {
                if let a = NavApp.saved { if let u = place.navURL(a) { openURL(u) } } else { askNav = true }
            } label: { ActLabel(icon: "location.fill", text: branched ? "導航到\(branchLabel(place))" : "導航") }
                .buttonStyle(ChunkyStyle(color: .accent, edge: .accentDeep, radius: 18))
            if let s = place.source_url, let u = URL(string: s), !s.isEmpty {
                // 只有 IG Reels 是影片，其他貼文叫「看貼文」
                let reel = s.contains("/reel/") || s.contains("/reels/")
                Button { openURL(u) } label: { ActLabel(icon: reel ? "play.fill" : "doc.richtext", text: reel ? "看影片" : "看貼文") }
                    .buttonStyle(ChunkyStyle(color: .sprPink, edge: Color.sprPink.mix(with: .black, by: 0.2), radius: 18))
            }
            Button { share(place) } label: { ActLabel(icon: "square.and.arrow.up", text: "分享") }
                .buttonStyle(ChunkyStyle(color: .sprBlue, edge: Color.sprBlue.mix(with: .black, by: 0.2), radius: 18))
        }
    }

    // 分享：店名、地址、必點、地圖連結，加上封面照片
    private func share(_ place: Place) {
        Task {
            var items: [Any] = [place.shareText]
            if let u = place.photoURL, let img = await PhotoLoader.shared.load(u, 1200) { items.append(img) }
            presentShare(items)
        }
    }

    private func dishes(_ d: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("必點").font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink)
            Flow(spacing: 8) {
                ForEach(Array(d.enumerated()), id: \.offset) { i, t in
                    let c = Color.sprinkles[i % Color.sprinkles.count]
                    Text(t).font(.subheadline.weight(.heavy)).padding(.horizontal, 12).frame(height: 34)
                        .background(c.opacity(0.15), in: .capsule).foregroundStyle(c.mix(with: .black, by: 0.15))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .candy(24)
    }

    private func details(_ place: Place) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(place.address?.isEmpty == false ? place.address! : (place.area.isEmpty ? "沒有地址" : place.area), systemImage: "mappin.and.ellipse")
            if let h = place.hours, !h.isEmpty { Label(h, systemImage: "clock") }
            if let n = place.note, !n.isEmpty { Label(n, systemImage: "text.bubble") }
        }
        .font(.subheadline).foregroundStyle(Color.ink)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .candy(24)
    }

    private func groups(_ place: Place) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("分享到群組").font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
            Flow(spacing: 8) {
                ForEach(store.groups) { g in
                    let on = store.shared(place.id, g.id)
                    Chip(text: (on ? "✓ " : "") + g.name, on: on, color: .sprPurple) {
                        Haptic.light()
                        Task { if on { await store.unshare(g.id, place.id) } else { await store.share(g.id, [place.id]) } }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .candy(24)
    }

    private func map(_ place: Place, _ c: CLLocationCoordinate2D) -> some View {
        // 截一張地圖圖片（不建一整個可互動的地圖，推頁時不會頓）；點一下開 Google 地圖
        MiniMap(place: place, coord: c)
            .frame(height: 190).clipShape(.rect(cornerRadius: 24))
            .contentShape(.rect)
            .onTapGesture { if let u = place.mapsURL { openURL(u) } }
    }
}

// 想去／去過切換：想去是粉紅、去過是薄荷綠。「去過」是教學第三步要圈的地方
struct StatusToggle: View {
    @Environment(Store.self) private var store
    let place: Place

    var body: some View {
        HStack(spacing: 6) {
            seg("♥ 想去", "want", .sprPink)
            seg("✓ 去過", "been", .sprMint)
                .coachAnchor(.been, on: store.coachStep == .been && store.coachPlace?.id == place.id && store.tab == 0)
        }
        .padding(5)
        .background(Color.bg2, in: .rect(cornerRadius: 16))
    }

    private func seg(_ t: String, _ v: String, _ c: Color) -> some View {
        let on = (place.status ?? "want") == v
        return Button {
            guard !on else { return }
            Haptic.medium()
            Perf.shared.mark("想去/去過")
            var p = place; p.status = v
            if v == "want" { p.rating = nil }
            Task { await store.save(p) }
        } label: {
            Text(t).font(.system(size: 16, weight: .heavy))
                .frame(maxWidth: .infinity).frame(height: 42)
                .background(on ? c : .clear, in: .rect(cornerRadius: 12))
                .foregroundStyle(on ? .white : Color.ink.opacity(0.45))
                .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
        .animation(.snappy(duration: 0.28), value: on)
    }
}

struct ActLabel: View {
    let icon: String, text: String
    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 19, weight: .bold))
            Text(text).font(.system(size: 13, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, -8)
        .frame(maxWidth: .infinity).frame(height: 64)
    }
}

// 店家頁最下面的小地圖：MKMapSnapshotter 截圖，用「座標＋寬度＋深淺色」存在記憶體，第二次打開馬上有
struct MiniMap: View {
    let place: Place
    let coord: CLLocationCoordinate2D
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var scale
    @State private var width: CGFloat = 0
    @State private var img: UIImage?

    private static let cache = NSCache<NSString, UIImage>()
    private var key: String { "\(coord.latitude),\(coord.longitude)@\(Int(width))\(scheme == .dark ? "d" : "l")" }

    var body: some View {
        Color.bg2
            .overlay {
                if let img { Image(uiImage: img).resizable().scaledToFill().transition(.opacity) }
            }
            // 圖釘尖端對準店的位置（畫面正中央）
            .overlay { PinGlyph(place: place).offset(y: -25) }
            .clipped()
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .task(id: key) {
                guard width > 0 else { return }
                if let c = Self.cache.object(forKey: key as NSString) { img = c; return }
                let o = MKMapSnapshotter.Options()
                o.region = MKCoordinateRegion(center: coord, latitudinalMeters: 700, longitudinalMeters: 700)
                o.size = CGSize(width: width, height: 190)
                o.pointOfInterestFilter = .excludingAll
                o.traitCollection = UITraitCollection(traitsFrom: [UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light), UITraitCollection(displayScale: scale)])
                guard let snap = try? await MKMapSnapshotter(options: o).start(), !Task.isCancelled else { return }
                Self.cache.setObject(snap.image, forKey: key as NSString)
                withAnimation(.easeOut(duration: 0.2)) { img = snap.image }
            }
    }
}

// 不能點的圖釘（店家頁小地圖用）：分類顏色的圓、白邊、食物圖示、下面小尖角
struct PinGlyph: View {
    let place: Place
    var body: some View {
        VStack(spacing: -3) {
            Text(place.cat.emoji).font(.system(size: 21))
                .frame(width: 44, height: 44)
                .background(place.cat.color, in: .circle)
                .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            Triangle().fill(.white).frame(width: 14, height: 10).rotationEffect(.degrees(180))
        }
        .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
    }
}
