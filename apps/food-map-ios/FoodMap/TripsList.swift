import SwiftUI
import UIKit
import MapKit

// 我的行程（從地圖右邊「行程」或行程模式的「換行程」打開的 sheet）：
// 今天的最上面 → 之後的 → 還沒排日期的 → 過去的收在最下面；點一個就在首頁地圖進那個行程
struct TripsList: View {
    @Environment(Store.self) private var store
    @State private var trips = TripStore.shared
    @State private var adding = false
    @State private var showPast = false

    var body: some View {
        let today = TripDate.today
        let all = trips.trips
        let now = all.filter { t in t.start.map { $0 <= today && (t.end ?? $0) >= today } ?? false }
        let next = all.filter { ($0.start ?? .distantPast) > today }.sorted { ($0.start ?? today) < ($1.start ?? today) }
        let open = all.filter { $0.start == nil }
        let past = all.filter { ($0.end ?? .distantFuture) < today }.sorted { ($0.start ?? today) > ($1.start ?? today) }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("我的行程").font(.system(size: 30, weight: .black)).foregroundStyle(Color.ink)
                    Spacer()
                    AddButton(size: 44) { Haptic.light(); adding = true }.accessibilityLabel("新增行程")
                }
                .padding(.top, 20)
                if all.isEmpty { empty }
                ForEach(now + next + open) { t in card(t, today: now.contains(t)) }
                if !past.isEmpty {
                    Button { withAnimation(.snappy) { showPast.toggle() } } label: {
                        HStack {
                            Text("去過的行程（\(past.count)）").font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.6))
                            Spacer()
                            Image(systemName: "chevron.down").font(.caption.bold()).foregroundStyle(Color.ink.opacity(0.4)).rotationEffect(.degrees(showPast ? 180 : 0))
                        }
                        .frame(minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(PressStyle())
                    if showPast { ForEach(past) { t in card(t, today: false).opacity(0.75) } }
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 30)
        }
        .background(Color.bg)
        .toolbarVisibility(.hidden, for: .navigationBar)
        .sheet(isPresented: $adding) { TripForm(trip: nil) { t in enterTrip(t) } }
        .task { await trips.load() }
        .refreshable { await trips.load() }
        .onAppear { Perf.shared.mark("我的行程") }
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Text("🗺️").font(.system(size: 44))
            Text("還沒有行程").font(.headline).foregroundStyle(Color.ink)
            Text("在店家頁按「加進行程」，或按右上 ＋ 開一個新的").font(.subheadline).foregroundStyle(Color.ink.opacity(0.5)).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
        .candy(24)
    }

    private func card(_ t: Trip, today: Bool) -> some View {
        SwipeToDelete(enabled: t.owner == nil || t.owner == store.me) {
            trips.deleteWithUndo(t, store: store)
        } content: {
            Button { Haptic.light(); enterTrip(t) } label: { TripCard(trip: t, today: today) }
                .buttonStyle(PressStyle())
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }

    // 關掉這張 sheet，首頁地圖變成這個行程
    private func enterTrip(_ t: Trip) {
        let mode = TripMode.shared
        mode.listing = false
        mode.open(t.id, store: store)
    }
}

// 行程卡片：上面路線縮圖，下面標題、日期、站數、交通總時間、群組
struct TripCard: View {
    @Environment(Store.self) private var store
    let trip: Trip
    let today: Bool
    @State private var trips = TripStore.shared
    @State private var router = TripRouter.shared

    var body: some View {
        let ss = trips.stops(trip.id)
        let spots = ss.filter { !$0.isPlace && $0.kind != "stay" }.count
        VStack(alignment: .leading, spacing: 0) {
            if ss.contains(where: { $0.coord != nil }) {
                TripThumb(trip: trip, stops: ss).frame(height: 120).clipped()
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(trip.title).font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                Text(meta(ss, spots: spots)).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                HStack(spacing: 6) {
                    if today { tag("今天", .accent) }
                    if let g = trip.group_id {
                        tag("👥 " + (store.groups.first { $0.id == g }?.name ?? "群組"), .sprPurple)
                    } else if pairs(ss).contains(where: { $0.2 == .drive }) {
                        tag("🚗 開車", .sprBlue); tag("只有我", Color(hex: 0x9a8a7a))
                    } else {
                        tag("只有我", Color(hex: 0x9a8a7a))
                    }
                }
            }
            .padding(14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.panel)
        .clipShape(.rect(cornerRadius: 22))
        .background(RoundedRectangle(cornerRadius: 22).fill(Color.panel).shadow(color: .cardShadow, radius: 0, y: 4))
        .contentShape(.rect(cornerRadius: 22))
        .task(id: legsKey(ss)) {
            // 一天的行程才在卡片上寫交通總時間，那些段先問好
            if trip.days == 1, ss.count > 1, ss.count <= 15 { router.need(pairs(ss)) }
        }
    }

    private func tag(_ t: String, _ c: Color) -> some View {
        Text(t).font(.system(size: 12, weight: .heavy)).padding(.horizontal, 9).frame(height: 24)
            .background(c.opacity(0.14), in: .capsule).foregroundStyle(c.mix(with: .black, by: 0.15))
    }

    // 9/20 週六・4 站・走路共 35 分；多天：10/3–10/4・2 天・11 站（4 個景點・1 間住宿）
    private func meta(_ ss: [TripStop], spots: Int) -> String {
        let stays = Set(ss.filter { $0.kind == "stay" }.map(\.name)).count
        var parts: [String] = []
        if let s = trip.start {
            parts.append(trip.days > 1 ? "\(TripDate.short(s))–\(TripDate.short(trip.end ?? s))" : TripDate.label(s))
        } else {
            parts.append("還沒排日期")
        }
        if trip.days > 1 { parts.append("\(trip.days) 天") }
        var side: [String] = []
        if spots > 0 { side.append("\(spots) 個景點") }
        if stays > 0 { side.append("\(stays) 間住宿") }
        parts.append("\(ss.count) 站" + (!side.isEmpty && trip.days > 1 ? "（\(side.joined(separator: "・"))）" : ""))
        if trip.days == 1 && ss.count > 1 {
            // 每段都一樣就寫「開車共／走路共」，混著用寫「交通共」
            let ms = Set(pairs(ss).map(\.2))
            let verb = ms.count == 1 ? ms.first!.verb : "交通"
            let t = total(ss)
            parts.append("\(verb)共 \(t.approx ? "約 " : "")\(TripDate.span(t.min))")
        }
        return parts.joined(separator: "・")
    }

    // 跟行程頁用同一份路線（站和站之間；還沒算過的段排進去問 Apple，算好卡片跟著更新）
    private func pairs(_ ss: [TripStop]) -> [(CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)] {
        var out: [(CLLocationCoordinate2D, CLLocationCoordinate2D, TravelMode)] = []
        for d in 1...max(1, trip.days) {
            let l = ss.filter { $0.day == d }.sorted { $0.pos < $1.pos }
            for (a, b) in zip(l, l.dropFirst()) {
                guard let ca = a.coord, let cb = b.coord else { continue }
                out.append((ca, cb, TravelMode.pick(trip, b, from: ca, to: cb)))
            }
        }
        return out
    }

    private func legsKey(_ ss: [TripStop]) -> String {
        guard trip.days == 1 else { return "" }
        return ss.map { s in s.id + "\(s.pos)" + (s.mode ?? "") }.joined(separator: ",")
    }

    private func total(_ ss: [TripStop]) -> (min: Int, approx: Bool) {
        var sum = 0, approx = false
        for (a, b, m) in pairs(ss) {
            let l = router.leg(a, b, m)
            sum += l.min
            if l.approx { approx = true }
        }
        return (sum, approx)
    }
}

// 路線縮圖：截一張地圖（不是每張卡開一個地圖），每段用下一站的顏色畫線、站點畫小圈；存在記憶體
struct TripThumb: View {
    let trip: Trip
    let stops: [TripStop]
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var scale
    @State private var width: CGFloat = 0
    @State private var img: UIImage?
    @State private var router = TripRouter.shared
    private static let cache = NSCache<NSString, UIImage>()

    private var day1: [TripStop] {
        let d = stops.contains { $0.day == 1 } ? 1 : (stops.map(\.day).min() ?? 1)
        return stops.filter { $0.day == d && $0.coord != nil }.sorted { $0.pos < $1.pos }
    }
    private var key: String {
        day1.map { "\($0.id)\($0.pos)\($0.mode ?? "-")" }.joined() + "@\(Int(width))\(scheme == .dark ? "d" : "l")" + (allRouted ? "r" : "")
    }
    private var allRouted: Bool {
        zip(day1, day1.dropFirst()).allSatisfy { a, b in router.legs[TripRouter.key(a.coord!, b.coord!, .pick(trip, b, from: a.coord, to: b.coord))] != nil }
    }

    var body: some View {
        Color.bg2
            .overlay { if let img { Image(uiImage: img).resizable().scaledToFill().transition(.opacity) } }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .task(id: key) { await draw() }
    }

    private func draw() async {
        guard width > 0, !day1.isEmpty else { return }
        if let c = Self.cache.object(forKey: key as NSString) { img = c; return }
        let pts = day1.map { $0.coord! }
        let lats = pts.map(\.latitude), lngs = pts.map(\.longitude)
        let span = MKCoordinateSpan(latitudeDelta: max(0.004, (lats.max()! - lats.min()!) * 1.6), longitudeDelta: max(0.004, (lngs.max()! - lngs.min()!) * 1.4))
        let o = MKMapSnapshotter.Options()
        o.region = MKCoordinateRegion(center: .init(latitude: (lats.max()! + lats.min()!) / 2, longitude: (lngs.max()! + lngs.min()!) / 2), span: span)
        o.size = CGSize(width: width, height: 120)
        o.pointOfInterestFilter = .excludingAll
        o.traitCollection = UITraitCollection(traitsFrom: [UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light), UITraitCollection(displayScale: scale)])
        guard let snap = try? await MKMapSnapshotter(options: o).start(), !Task.isCancelled else { return }
        let segs: [([CLLocationCoordinate2D], UIColor)] = zip(day1, day1.dropFirst()).enumerated().map { i, ab in
            let l = router.leg(ab.0.coord!, ab.1.coord!, .pick(trip, ab.1, from: ab.0.coord, to: ab.1.coord))
            return (l.coords ?? [ab.0.coord!, ab.1.coord!], UIColor(TripColor.of(i + 1)))
        }
        let k = key
        let out = UIGraphicsImageRenderer(size: o.size, format: { let f = UIGraphicsImageRendererFormat(); f.scale = scale; return f }()).image { ctx in
            snap.image.draw(at: .zero)
            let c = ctx.cgContext
            c.setLineCap(.round); c.setLineJoin(.round)
            for (line, color) in segs {
                let ps = line.map { snap.point(for: $0) }
                guard let f = ps.first else { continue }
                c.beginPath(); c.move(to: f); ps.dropFirst().forEach { c.addLine(to: $0) }
                c.setStrokeColor(UIColor.white.cgColor); c.setLineWidth(7); c.strokePath()
                c.beginPath(); c.move(to: f); ps.dropFirst().forEach { c.addLine(to: $0) }
                c.setStrokeColor(color.cgColor); c.setLineWidth(4); c.strokePath()
            }
            for (i, s) in day1.enumerated() {
                let p = snap.point(for: s.coord!)
                let r: CGFloat = s.isPlace ? 7 : 5
                let rect = CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)
                c.setFillColor(UIColor.white.cgColor); c.fillEllipse(in: rect)
                c.setStrokeColor((s.isPlace ? UIColor(TripColor.of(i)) : UIColor(TripColor.side)).cgColor)
                c.setLineWidth(3); c.strokeEllipse(in: rect.insetBy(dx: 1.5, dy: 1.5))
            }
        }
        Self.cache.setObject(out, forKey: k as NSString)
        withAnimation(.easeOut(duration: 0.2)) { img = out }
    }
}

// 新行程／改行程：名稱、日期（可不選）、掛在哪個群組（或只有我）
struct TripForm: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let trip: Trip?
    var onCreate: ((Trip) -> Void)? = nil
    @State private var title = ""
    @State private var hasDate = false
    @State private var date = Date()
    @State private var group: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("名稱") {
                    TextField(defaultTitle, text: $title).font(.system(size: 17))
                }
                Section {
                    Toggle("排日期", isOn: $hasDate.animation(.snappy))
                    if hasDate { DatePicker("日期", selection: $date, displayedComponents: .date).environment(\.locale, Locale(identifier: "zh_TW")) }
                }
                Section {
                    Picker("誰可以一起排", selection: $group) {
                        Text("只有我").tag(String?.none)
                        ForEach(store.groups) { g in Text("👥 " + g.name).tag(String?.some(g.id)) }
                    }
                } footer: {
                    Text(group == nil ? "只有你看得到" : "群組裡的人都看得到、都能一起改")
                }
            }
            .navigationTitle(trip == nil ? "新行程" : "行程設定").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(trip == nil ? "建立" : "完成") {
                        guard !saving else { return }
                        saving = true
                        // 中文輸入法還沒選字的那段要先收進來（不然「TEST trip」可能只存到「TES」）
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                        Task { try? await Task.sleep(for: .milliseconds(60)); save() }
                    }
                    .fontWeight(.bold)
                }
            }
            .onAppear {
                guard let t = trip else { return }
                title = t.title; group = t.group_id
                if let s = t.start { hasDate = true; date = s }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var defaultTitle: String { hasDate ? "\(TripDate.weekday(date))的行程" : "新行程" }

    private func save() {
        let name = title.trimmingCharacters(in: .whitespaces).isEmpty ? defaultTitle : title.trimmingCharacters(in: .whitespaces)
        Haptic.light()
        if var t = trip {
            t.title = name; t.start_date = hasDate ? TripDate.string(date) : nil; t.group_id = group
            TripStore.shared.update(t, store: store)
        } else {
            let t = TripStore.shared.create(title: name, date: hasDate ? date : nil, group: group, store: store)
            onCreate?(t)
        }
        dismiss()
    }
}

// 診斷用（只有開發版）：啟動參數 -b8NoSwipe 把左滑刪除整個關掉，看清單捲不動是不是它擋的
private let swipeOff: Bool = {
    #if DEBUG
    return ProcessInfo.processInfo.arguments.contains("-b8NoSwipe")
    #else
    return false
    #endif
}()

// 往左滑刪除（有復原）：滑超過 4 成放開就刪；滑一小段放開停在露出垃圾桶，點垃圾桶才刪、點卡片收回（跟系統清單一樣）。
// 上下捲動照常
struct SwipeToDelete<C: View>: View {
    var enabled = true
    let onDelete: () -> Void
    @ViewBuilder let content: () -> C
    @State private var dx: CGFloat = 0
    @State private var horizontal: Bool?
    @State private var w: CGFloat = 300
    @State private var open = false           // 停在露出垃圾桶
    // 正在左滑（和放開後一下下）：裡面的按鈕／連結不要被當成點了一下
    @State private var swiped = false
    private static var reveal: CGFloat { 84 }

    var body: some View {
        content()
            .disabled(swiped)
            // 露出垃圾桶時點卡片：只收回，不算點卡片
            .overlay { if open { Color.clear.contentShape(.rect).onTapGesture { close() } } }
            .offset(x: dx)
            .background(alignment: .trailing) {
                if dx < 0 {
                    Button(action: delete) {
                        Image(systemName: "trash.fill").font(.system(size: 20, weight: .bold)).foregroundStyle(.white)
                            .frame(width: max(0, -dx)).frame(maxHeight: .infinity)
                            .background(Color.sprPink, in: .rect(cornerRadius: 22))
                            .scaleEffect(-dx > w * 0.4 ? 1 : 0.9)
                    }
                    .buttonStyle(.plain)
                    .allowsHitTesting(open)
                    .accessibilityLabel("刪除")
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { w = max($0, 1) }
            .onChange(of: enabled) { _, on in if !on, open { close() } }
            .simultaneousGesture(DragGesture(minimumDistance: 18).onChanged { v in
                if horizontal == nil { horizontal = abs(v.translation.width) > abs(v.translation.height) * 1.3 }
                guard horizontal == true else { return }
                if !swiped { swiped = true }
                let was = -dx > w * 0.4
                dx = min(0, (open ? -Self.reveal : 0) + v.translation.width)
                if (-dx > w * 0.4) != was { Haptic.tick() }
            }
            .onEnded { v in
                defer { horizontal = nil }
                guard horizontal == true else { return }
                Task { try? await Task.sleep(for: .seconds(0.35)); swiped = false }
                let end = (open ? -Self.reveal : 0) + v.predictedEndTranslation.width
                if -dx > w * 0.4 || end < -w {
                    delete()
                } else if -dx > 44 || end < -Self.reveal {
                    open = true
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { dx = -Self.reveal }
                } else {
                    close()
                }
            }, including: enabled && !swipeOff ? .all : .subviews)
    }

    private func delete() {
        open = false
        withAnimation(.easeIn(duration: 0.18)) { dx = -w - 40 }
        onDelete()
        Task { try? await Task.sleep(for: .seconds(0.4)); dx = 0 }
    }

    private func close() {
        open = false
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { dx = 0 }
    }
}
