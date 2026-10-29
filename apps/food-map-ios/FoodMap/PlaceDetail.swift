import SwiftUI
import MapKit

// 店家頁：4:3 圓角照片（看影片放在照片上）、白色資料卡（想去／去過切換）、彩色必點；導航、行程、分享固定在最下面
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
    @State private var scroll = ScrollY()
    @State private var trips = TripStore.shared
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        let _ = Perf.shared.count("店家頁")
        let _ = Perf.shared.note("店家頁重算")
        // 永遠顯示最新的那份（剛改的狀態、別台裝置改的都會跟上）
        let base = store.place(self.place.id) ?? self.place
        let place = picked.flatMap { store.place($0) } ?? base
        let branches = store.branchesOf(base)
        let mine = store.isMine(place)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                photo(place)
                info(place, mine: mine, branches: branches)
                if let d = place.dishes, !d.isEmpty { dishes(d) }
                details(place)
                if mine && !store.groups.isEmpty { groups(place) }
                if let lat = place.lat, let lng = place.lng { map(place, CLLocationCoordinate2D(latitude: lat, longitude: lng)) }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 20)
        }
        // 導航、加進行程、分享固定在最下面，捲到哪都按得到（單手大拇指剛好）
        .safeAreaInset(edge: .bottom, spacing: 0) { actions(place, branched: branches.count > 1) }
        // 返回、更多固定在最上面，捲下去也按得到；捲動後才墊一條底色（只有 TopShade 跟著捲動重畫）。
        // 下面留 14：跟原本在內容裡時和照片之間的間距一樣，照片位置不變
        .safeAreaInset(edge: .top, spacing: 0) {
            top(place, mine: mine)
                .padding(.horizontal, 14).padding(.bottom, 14)
                .background { TopShade(scroll: scroll) }
        }
        // 往下拉超過頂端時大圖放大、往上滑時大圖慢一半（只有大圖跟著重畫）
        .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, y in scroll.y = y }
        .background(Color.bg)
        .toolbarVisibility(.hidden, for: .navigationBar)
        // 先在背景讀行程，按「加進行程」時就知道要加到哪（等推頁動畫跑完再讀，讀完換資料不落在轉場裡；按鈕自己也會先讀）
        .task {
            try? await Task.sleep(for: .milliseconds(400))
            if !Task.isCancelled, !trips.loaded { await trips.load() }
        }
        .onAppear { Perf.shared.mark("進店家頁") }
        // 離開店家頁：訊息條不用再讓開按鈕列
        .onDisappear { store.bottomBar = 0 }
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

    private func back() { store.pop(dismiss) }

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
        Stretchy(scroll: scroll) {
            Color.clear.aspectRatio(4 / 3, contentMode: .fit)
                .overlay { PlaceMedia(place: place) }
                .clipShape(.rect(cornerRadius: 28))
                // 分類標籤跟喇叭放在同一層：往上捲的半速視差、往下拉的放大都一起動，兩個的間距不會變
                .overlay(alignment: .bottomTrailing) {
                    Text("\(place.cat.emoji) \(place.cat.name)").font(.footnote.weight(.heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 11).frame(height: 30).background(place.cat.color, in: .capsule)
                        .overlay(Capsule().strokeBorder(.white, lineWidth: 2))
                        // 點標籤本身什麼都不做：不讓點擊穿到下面去切喇叭（喇叭的點擊框貼在標籤上緣）
                        .contentShape(.capsule).onTapGesture {}
                        .padding(14)
                }
        }
            // 看影片／看貼文：照片左下的黑色膠囊
            .overlay(alignment: .bottomLeading) {
                if let s = place.source_url, let u = URL(string: s), !s.isEmpty {
                    // 只有 IG Reels 是影片，其他貼文叫「看貼文」
                    let reel = s.contains("/reel/") || s.contains("/reels/")
                    Button { openURL(u) } label: {
                        Text(reel ? "▶ 看影片" : "看貼文").font(.system(size: 15, weight: .heavy)).foregroundStyle(.white)
                            .padding(.horizontal, 14).frame(height: 36)
                            .background(.black.opacity(0.55), in: .capsule)
                            .frame(minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                    .padding(10)
                }
            }
    }

    private func info(_ place: Place, mine: Bool, branches: [Place]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                // 換分店：店名往上推出、新的從下面進來
                Text(place.name).font(.system(size: 26, weight: .black)).foregroundStyle(Color.ink)
                    .id(place.id).transition(.push(from: .bottom))
                if branches.count > 1 {
                    branchChips(branches, on: place.id)
                } else if let b = place.branch, !b.isEmpty {
                    Text(b).font(.headline).foregroundStyle(Color.ink.opacity(0.7))
                }
                let meta = [place.cuisine ?? "", place.area, place.price.flatMap { PRICES[$0] } ?? ""].filter { !$0.isEmpty }
                if !meta.isEmpty {
                    Text(meta.joined(separator: " · ")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                        .contentTransition(.interpolate)
                }
            }
            if mine {
                StatusToggle(place: place)
                if place.been {
                    HStack {
                        Text("好吃嗎？").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink)
                        Spacer()
                        Stars(value: place.rating, animated: true) { r in var p = place; p.rating = r; Task { await store.save(p) } }
                    }
                    // 切到去過：星星列展開，五顆星依序彈出
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
                if store.alreadyMine(place) || store.copying.contains(store.copyKey(place)) {
                    Label("已在你的收藏", systemImage: "checkmark").font(.subheadline.weight(.heavy)).foregroundStyle(Color.sprMint)
                        .frame(maxWidth: .infinity).frame(height: 44)
                } else {
                    Button { Task { await store.copyToMine(place) } } label: { Text("♥ 我也想去").frame(maxWidth: .infinity) }
                        .buttonStyle(ChunkyStyle(color: .sprPink, edge: Color.sprPink.mix(with: .black, by: 0.2), radius: 14, haptic: true))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .candy(24)
        .animation(reduce ? .easeOut(duration: 0.2) : .easeOut(duration: 0.3), value: place.been)
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
                            withAnimation(.snappy) { picked = b.id }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(.top, 2)
    }

    // 最下面固定的一排：導航（主按鈕，1.4 份寬）、加進行程／在行程裡（白底，1 份）、分享（只有圖示的方塊）
    private func actions(_ place: Place, branched: Bool) -> some View {
        GeometryReader { g in
            let rest = max(0, g.size.width - 54 - 16)
            HStack(spacing: 8) {
                Button {
                    if let a = NavApp.saved { if let u = place.navURL(a) { openURL(u) } } else { askNav = true }
                } label: {
                    Label(branched ? "導航到\(branchLabel(place))" : "導航", systemImage: "location.fill")
                        .font(.system(size: 17, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity).frame(height: 54)
                }
                .buttonStyle(ChunkyStyle(color: .accent, edge: .accentDeep, radius: 18))
                .frame(width: rest * 1.4 / 2.4)
                tripButton(place)
                    .frame(width: rest / 2.4)
                Button { share(place) } label: {
                    Image(systemName: "square.and.arrow.up").font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink)
                        .frame(width: 54, height: 54)
                        .background(RoundedRectangle(cornerRadius: 18).fill(Color.panel).shadow(color: .cardShadow, radius: 0, y: 4))
                        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color.cardShadow, lineWidth: 2.5))
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("分享")
            }
        }
        .frame(height: 58)
        .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)
        .background(Color.bg.shadow(color: .black.opacity(0.08), radius: 8, y: -3).ignoresSafeArea(edges: .bottom))
        // 訊息條貼著按鈕列上緣（值有變才寫，推頁時不讓沒訊息條的畫面重算）
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if abs(store.bottomBar - h) > 0.5 { store.bottomBar = h } }
    }

    // 加進行程：只有一個進行中的行程就直接加在最順的位置，不然先問加到哪個；已經在行程裡就打開那個行程、捲到那一站
    @ViewBuilder private func tripButton(_ place: Place) -> some View {
        if let s = trips.stopOf(place: place.id) {
            Button { Haptic.light(); TripMode.shared.open(s.trip_id, focus: s.id, store: store) } label: {
                Label("在行程裡", systemImage: "checkmark").foregroundStyle(Color.sprMint.mix(with: .black, by: 0.15))
                    .modifier(TripBtnLook())
            }
            .buttonStyle(PressStyle())
            .transition(.scale(scale: 0.9).combined(with: .opacity))
        } else {
            Button {
                Task {
                    // 還沒讀過行程（第一次按）：先讀，免得多開一個新行程
                    if !trips.loaded { await trips.load() }
                    trips.addPlace(place, store: store)
                }
            } label: {
                Label("加進行程", systemImage: "plus").foregroundStyle(Color.ink)
                    .modifier(TripBtnLook())
            }
            .buttonStyle(PressStyle())
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

    private func dishes(_ d: [String]) -> some View { DishChips(d: d) }

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

// 店家頁的想去／去過：存回收藏。「去過」是教學第三步要圈的地方
struct StatusToggle: View {
    @Environment(Store.self) private var store
    let place: Place

    var body: some View {
        StatusSwitch(been: Binding(get: { place.been }, set: { b in
            Perf.shared.mark("想去/去過")
            var p = place; p.status = b ? "been" : "want"
            if !b { p.rating = nil }
            Task { await store.save(p) }
        }), coach: store.coachStep == .been && store.coachPlace?.id == place.id && store.tab == 0)
    }
}

// 想去／去過切換的樣子：想去是粉紅、去過是薄荷綠，色塊滑到另一邊（新增視窗也用這個）
struct StatusSwitch: View {
    @Binding var been: Bool
    var coach = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Namespace private var ns
    @State private var burst = 0

    init(been: Binding<Bool>) { _been = been }
    init(been: Binding<Bool>, coach: Bool) { _been = been; self.coach = coach }

    var body: some View {
        HStack(spacing: 6) {
            seg("♥ 想去", false, .sprPink)
            seg("✓ 去過", true, .sprMint)
                .overlay { Confetti(shot: burst).allowsHitTesting(false) }
                .coachAnchor(.been, on: coach)
        }
        .padding(5)
        .background(Color.bg2, in: .rect(cornerRadius: 16))
        // 色塊滑到另一邊
        .animation(reduce ? .easeOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.8), value: been)
    }

    private func seg(_ t: String, _ v: Bool, _ c: Color) -> some View {
        let on = been == v
        return Button {
            guard !on else { return }
            Haptic.medium()
            if v && !reduce { burst += 1 }
            been = v
        } label: {
            Text(t).font(.system(size: 16, weight: .heavy))
                .frame(maxWidth: .infinity).frame(height: 42)
                .background {
                    if on { RoundedRectangle(cornerRadius: 12).fill(c).matchedGeometryEffect(id: "seg", in: ns) }
                }
                .foregroundStyle(on ? .white : Color.ink.opacity(0.45))
                .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// 店家頁最下面「加進行程／在行程裡」：白底、淡色粗框、底下一條奶油色影子
private struct TripBtnLook: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 16, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity).frame(height: 54)
            .background(RoundedRectangle(cornerRadius: 18).fill(Color.panel).shadow(color: .cardShadow, radius: 0, y: 4))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color.cardShadow, lineWidth: 2.5))
            .contentShape(.rect)
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
                // 換分店：新舊截圖交叉淡入
                if let img { Image(uiImage: img).resizable().scaledToFill().id(ObjectIdentifier(img)).transition(.opacity) }
            }
            // 圖釘尖端對準店的位置（畫面正中央）；換分店時從上面掉到新位置
            .overlay {
                PinGlyph(place: place)
                    .keyframeAnimator(initialValue: PinDrop(), trigger: "\(coord.latitude),\(coord.longitude)") { v, d in
                        v.scaleEffect(x: d.sx, y: d.sy, anchor: .bottom).offset(y: d.y)
                    } keyframes: { _ in
                        KeyframeTrack(\.y) { MoveKeyframe(-40); CubicKeyframe(0, duration: 0.25) }
                        KeyframeTrack(\.sx) { MoveKeyframe(1); LinearKeyframe(1, duration: 0.25); LinearKeyframe(1.1, duration: 0.06); SpringKeyframe(1, duration: 0.3, spring: .init(response: 0.3, dampingRatio: 0.5)) }
                        KeyframeTrack(\.sy) { MoveKeyframe(1); LinearKeyframe(1, duration: 0.25); LinearKeyframe(0.8, duration: 0.06); SpringKeyframe(1, duration: 0.3, spring: .init(response: 0.3, dampingRatio: 0.5)) }
                    }
                    .offset(y: -25)
            }
            .clipped()
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .task(id: key) {
                guard width > 0 else { return }
                if let c = Self.cache.object(forKey: key as NSString) { Perf.shared.note("小地圖用快取"); withAnimation(.easeOut(duration: 0.2)) { img = c }; return }
                // 第一次截圖等推頁動畫跑完再開始（在畫面外，晚一點出現看不到）；換分店時已經有舊圖，不用等
                if img == nil {
                    try? await Task.sleep(for: .milliseconds(450))
                    guard !Task.isCancelled else { return }
                }
                Perf.shared.note("小地圖開始截圖")
                let o = MKMapSnapshotter.Options()
                o.region = MKCoordinateRegion(center: coord, latitudinalMeters: 700, longitudinalMeters: 700)
                o.size = CGSize(width: width, height: 190)
                o.pointOfInterestFilter = .excludingAll
                o.traitCollection = UITraitCollection(traitsFrom: [UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light), UITraitCollection(displayScale: scale)])
                guard let snap = try? await MKMapSnapshotter(options: o).start(), !Task.isCancelled else { return }
                Self.cache.setObject(snap.image, forKey: key as NSString)
                Perf.shared.note("小地圖截圖到")
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

// 必點：第一次出現時從 0.6 倍依序彈到原大（跟推頁同時開始）。
// 「彈出來了沒」放在這一小塊裡：onAppear 改它只重算這塊，不讓整個店家頁在第一幀前再算一次
private struct DishChips: View {
    let d: [String]
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("必點").font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink)
            Flow(spacing: 8) {
                ForEach(Array(d.enumerated()), id: \.offset) { i, t in
                    let c = Color.sprinkles[i % Color.sprinkles.count]
                    Text(t).font(.subheadline.weight(.heavy)).padding(.horizontal, 12).frame(height: 34)
                        .background(c.opacity(0.15), in: .capsule).foregroundStyle(c.mix(with: .black, by: 0.15))
                        .scaleEffect(shown || reduce ? 1 : 0.6)
                        .opacity(shown ? 1 : 0)
                        .animation(reduce ? .easeOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.6).delay(Double(i) * 0.04), value: shown)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .candy(24)
        .onAppear { if !shown { withAnimation { shown = true } } }
    }
}

// 返回、更多那一排的底：停在頂端時透明（跟原本一樣），捲下去才墊上底色和淡陰影，蓋住往上捲的照片
private struct TopShade: View {
    let scroll: ScrollY
    var body: some View {
        let on = scroll.y > 4
        Color.bg.opacity(on ? 1 : 0)
            .shadow(color: .black.opacity(on ? 0.08 : 0), radius: 8, y: 3)
            .ignoresSafeArea(edges: .top)
            .animation(.easeOut(duration: 0.15), value: on)
    }
}

// 店家頁捲到哪（只有大圖看它，捲動時整頁不用重畫）
@Observable final class ScrollY { var y: CGFloat = 0 }

// 大圖：往下拉超過頂端時以底部為錨點放大，往上滑時用一半的速度捲
private struct Stretchy<C: View>: View {
    let scroll: ScrollY
    let content: C
    @State private var h: CGFloat = 360
    @Environment(\.accessibilityReduceMotion) private var reduce
    init(scroll: ScrollY, @ViewBuilder content: () -> C) { self.scroll = scroll; self.content = content() }
    var body: some View {
        let y = reduce ? 0 : scroll.y
        content
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h = max($0, 1) }
            .scaleEffect(y < 0 ? 1 - y / h : 1, anchor: .bottom)
            .offset(y: y > 0 ? min(y, h) * 0.5 : 0)
    }
}

// 小地圖圖釘落下：位移和壓扁
struct PinDrop { var y: CGFloat = 0; var sx: CGFloat = 1; var sy: CGFloat = 1 }
