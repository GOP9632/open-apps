import SwiftUI

// 新增：貼 IG 連結或店名，雲端 AI 找出店家直接存好；找不到再自己填
struct AddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var busy = false
    @State private var result: String?
    @State private var manual = false
    @State private var been = false
    @State private var rating: Int?
    @FocusState private var focus: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("貼上 IG／Threads／Google 地圖連結，或直接打店名，AI 會找出店家幫你存好。").font(.subheadline).foregroundStyle(.secondary)
                TextField("連結或店名", text: $input, axis: .vertical)
                    .lineLimit(3...6).focused($focus)
                    .padding(14).background(Color.panel, in: .rect(cornerRadius: 14))
                HStack {
                    PasteButton(payloadType: String.self) { s in if let t = s.first { input = t } }
                        .buttonBorderShape(.capsule).labelStyle(.titleAndIcon)
                    Spacer()
                    Button("自己填") { manual = true }.font(.subheadline.weight(.semibold))
                }
                // 已經吃過的店也能收：選「去過」，順手給星星
                Picker("", selection: $been.animation(.snappy)) {
                    Text("想去").tag(false)
                    Text("去過了").tag(true)
                }
                .pickerStyle(.segmented)
                if been {
                    HStack {
                        Text("好吃嗎？").font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        Stars(value: rating, size: 22) { rating = $0 }
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
                Button(action: go) {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(.white) }
                        Text(busy ? "找店家中…" : "AI 找店家並收藏")
                    }
                    .font(.headline).frame(maxWidth: .infinity).frame(height: 54)
                    .background(Color.grad, in: .rect(cornerRadius: 16)).foregroundStyle(.white)
                }
                .buttonStyle(PressStyle())
                .disabled(busy || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if let result {
                    Text(result).font(.body.weight(.semibold))
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.accent.opacity(0.1), in: .rect(cornerRadius: 14))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                Spacer()
            }
            .padding(16)
            .background(Color.bg)
            // 等視窗彈上來（約 0.35 秒）再叫鍵盤，兩個動畫不搶。
            // 在視窗裡 SwiftUI 的 focus 有時不生效，就直接叫最上層畫面裡的輸入框接手
            .task {
                try? await Task.sleep(for: .milliseconds(350))
                focus = true
                for _ in 0..<4 {
                    try? await Task.sleep(for: .milliseconds(150))
                    if focus { break }
                    focusFirstInput()
                }
            }
            .navigationTitle("新增店家").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button(result == nil ? "取消" : "完成") { dismiss() } }
            .sheet(isPresented: $manual) {
                EditSheet(place: {
                    var p = Place(id: UUID().uuidString, name: input.hasPrefix("http") ? "" : input)
                    if been { p.status = "been"; p.rating = rating }
                    return p
                }(), isNew: true) { dismiss() }
            }
        }
    }

    // 按下去視窗就關：AI 在背景找，收藏頁上面有一張「找店中」卡、地圖上有一個膠囊，找到會翻成真的卡
    private func go() {
        focus = false
        Haptic.light()
        store.startAdd(input.trimmingCharacters(in: .whitespacesAndNewlines), been: been, rating: been ? rating : nil)
        dismiss()
    }
}

// 編輯（新增時也用這個）：欄位跟網頁版一樣
struct EditSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var place: Place
    var isNew = false
    var done: () -> Void = {}
    @State private var dishes = ""
    @State private var tags = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("店名（必填）", text: $place.name)
                    TextField("分店", text: str(\.branch))
                    Picker("分類", selection: Binding(get: { place.category ?? "restaurant" }, set: { place.category = $0 })) {
                        ForEach(Cat.order, id: \.self) { k in Text("\(Cat.all[k]!.emoji) \(Cat.all[k]!.name)").tag(k) }
                    }
                    TextField("料理（例如：拉麵、韓式）", text: str(\.cuisine))
                }
                Section {
                    Picker("狀態", selection: Binding(get: { place.status ?? "want" }, set: { place.status = $0; if $0 != "been" { place.rating = nil } })) {
                        Text("想去").tag("want")
                        Text("去過了").tag("been")
                    }
                    .pickerStyle(.segmented)
                    if place.status == "been" {
                        HStack {
                            Text("好吃嗎？")
                            Spacer()
                            Stars(value: place.rating, size: 22) { place.rating = $0 }
                        }
                    }
                }
                Section("地點") {
                    TextField("縣市", text: str(\.city))
                    TextField("區", text: str(\.district))
                    TextField("地址", text: str(\.address), axis: .vertical)
                }
                Section {
                    Picker("每人預算", selection: Binding(get: { place.price ?? 0 }, set: { place.price = $0 == 0 ? nil : $0 })) {
                        Text("不填").tag(0)
                        ForEach(1...4, id: \.self) { Text(PRICES[$0]!).tag($0) }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("時段")
                        Flow(spacing: 8) {
                            ForEach(MEALS, id: \.0) { m in
                                Chip(text: m.1, on: (place.meals ?? []).contains(m.0)) {
                                    var a = place.meals ?? []
                                    if let i = a.firstIndex(of: m.0) { a.remove(at: i) } else { a.append(m.0) }
                                    place.meals = a
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    TextField("營業時間", text: str(\.hours))
                }
                Section {
                    TextField("必點（用、隔開）", text: $dishes)
                    TextField("標籤（用、隔開）", text: $tags)
                    TextField("筆記", text: str(\.note), axis: .vertical)
                }
            }
            .scrollContentBackground(.hidden).background(Color.bg)
            .navigationTitle(isNew ? "自己填" : "編輯").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "存檔中…" : "存檔", action: save).disabled(busy || place.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .onAppear {
            dishes = (place.dishes ?? []).joined(separator: "、")
            tags = (place.tags ?? []).joined(separator: "、")
        }
    }

    private func str(_ kp: WritableKeyPath<Place, String?>) -> Binding<String> {
        Binding(get: { place[keyPath: kp] ?? "" }, set: { place[keyPath: kp] = $0 })
    }

    private func split(_ s: String) -> [String] {
        s.components(separatedBy: CharacterSet(charactersIn: "、,，/\n")).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    private func save() {
        busy = true
        var p = place
        p.name = p.name.trimmingCharacters(in: .whitespaces)
        p.dishes = split(dishes); p.tags = split(tags)
        let old = store.place(p.id)
        Task { [p] in
            var p = p
            // 地址改了（或本來沒座標）就重新查座標，地圖上才會在對的位置
            // 沒有地址也沒有座標：用店名＋城市找大概位置
            if (p.lat == nil || old?.address != p.address || old?.city != p.city), let g = await Store.locate(p) {
                p.lat = g.coord.latitude; p.lng = g.coord.longitude; p.approx = g.approx
            }
            let ok: Bool
            if isNew { ok = await store.add(p) } else { ok = await store.save(p) }
            busy = false
            if ok { Haptic.success(); dismiss(); done() }
        }
    }
}

extension Place {
    init(id: String, name: String) {
        self.init(id: id, owner: nil, name: name, branch: nil, address: nil, city: nil, district: nil, lat: nil, lng: nil, approx: nil, category: "restaurant", cuisine: nil, price: nil, meals: nil, hours: nil, status: "want", rating: nil, note: nil, tags: nil, source_url: nil, photo: nil, dishes: nil, created_at: nil, updated_at: nil)
    }
}

// 去過之後給幾顆星（點同一顆可以取消）
struct Stars: View {
    let value: Int?
    var size: CGFloat = 26
    var animated = false     // 店家頁：出現時五顆星依序彈出，點第 N 顆時 1 到 N 依序亮起
    let set: (Int?) -> Void
    @State private var lit: Int?
    @State private var shown = false
    @State private var run: Task<Void, Never>?
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        let v = lit ?? value ?? 0
        let pop = animated && !reduce
        HStack(spacing: 0) {
            ForEach(1...5, id: \.self) { i in
                Button { tap(i) } label: {
                    Image(systemName: i <= v ? "star.fill" : "star")
                        .font(.system(size: size)).foregroundStyle(i <= v ? Color(hex: 0xfab005) : .secondary)
                        .scaleEffect(lit == i ? 1.25 : 1)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(i) 顆星")
                .scaleEffect(pop && !shown ? 0.2 : 1)
                .opacity(animated && !shown ? 0 : 1)
                .animation(pop ? .spring(response: 0.3, dampingFraction: 0.55).delay(Double(i - 1) * 0.04) : .easeOut(duration: 0.2), value: shown)
            }
        }
        .onAppear { shown = true }
    }

    private func tap(_ i: Int) {
        let n = value == i ? nil : i
        guard animated, !reduce, let n else { Haptic.light(); set(n); return }
        Haptic.light()
        run?.cancel()
        run = Task {
            for k in 1...n {
                withAnimation(.spring(response: 0.22, dampingFraction: 0.5)) { lit = k }
                if k > 1 { Haptic.tick() }
                try? await Task.sleep(for: .milliseconds(40))
                if Task.isCancelled { return }
            }
            set(n)
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) { lit = nil }
        }
    }
}

// 叫最上層畫面（現在開著的視窗）裡第一個輸入框接手鍵盤
@MainActor func focusFirstInput() {
    guard let w = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return }
    var top = w.rootViewController
    while let p = top?.presentedViewController { top = p }
    func find(_ v: UIView) -> UIView? {
        if v is UITextView || v is UITextField { return v }
        for s in v.subviews { if let f = find(s) { return f } }
        return nil
    }
    if let root = top?.view, let input = find(root) { input.becomeFirstResponder() }
}
