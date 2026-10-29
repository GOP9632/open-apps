import SwiftUI

// 新增：貼 IG 連結或店名，雲端 AI 找出店家直接存好；找不到再自己填
struct AddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var busy = false
    @State private var manual = false
    @State private var been = false
    @State private var rating: Int?
    @State private var clip = false        // 剪貼簿裡有連結（不讀內容，按「貼上」才填）
    @FocusState private var focus: Bool

    var body: some View {
        NavigationStack {
            // 內容可以捲、主按鈕釘在下面：鍵盤出來時按鈕跟著在鍵盤上方（SE 切到「去過」多一列星星也看得到）
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("貼上 IG／Threads／Google 地圖連結，或直接打店名，AI 會找出店家幫你存好。").font(.subheadline).foregroundStyle(.secondary)
                    TextField("連結或店名", text: $input, axis: .vertical)
                        .lineLimit(3...6).focused($focus)
                        .submitLabel(.done)
                        // 手打 Return：只多了一個字而且是換行，就還原並收鍵盤；貼上的多行文字不動
                        .onChange(of: input) { old, new in
                            if new.count == old.count + 1, new.filter({ $0 == "\n" }).count == old.filter({ $0 == "\n" }).count + 1 {
                                input = old; focus = false
                            }
                        }
                        .padding(14).background(Color.panel, in: .rect(cornerRadius: 14))
                    HStack {
                        PasteButton(payloadType: String.self) { s in
                            if let t = s.first { input = t }
                            Task { @MainActor in ClipWatch.shared.markSeen(); ClipWatch.shared.dismiss() }
                            withAnimation(.snappy) { clip = false }
                        }
                        .buttonBorderShape(.capsule).labelStyle(.titleAndIcon)
                        if clip {
                            Text("剛複製的連結，按「貼上」就填好").font(.footnote.weight(.bold)).foregroundStyle(Color.accentDeep)
                                .lineLimit(2).transition(.opacity)
                        }
                        Spacer()
                        Button("自己填") { manual = true }.font(.subheadline.weight(.semibold))
                    }
                    // 已經吃過的店也能收：選「去過」，順手給星星（跟店家頁一樣的粉紅／薄荷切換）
                    StatusSwitch(been: $been.animation(.snappy))
                    if been {
                        HStack {
                            Text("好吃嗎？").font(.subheadline).foregroundStyle(.secondary)
                            Spacer()
                            Stars(value: rating, size: 22) { rating = $0 }
                        }
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.bg)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                // 還沒輸入：按鈕變淡、字改成提示（變淡交給 PressBody，不要再加 .opacity、.animation）
                let empty = input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                Button(action: go) {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(.white) }
                        Text(busy ? "找店家中…" : empty ? "先貼上連結或打店名" : "AI 找店家並收藏")
                    }
                    .font(.headline).frame(maxWidth: .infinity).frame(height: 54)
                    .background(Color.grad, in: .rect(cornerRadius: 16)).foregroundStyle(.white)
                }
                .buttonStyle(PressStyle(dim: true))
                .disabled(busy || empty)
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
                .background(Color.bg)
            }
            // 等視窗彈上來（約 0.35 秒）再叫鍵盤，兩個動畫不搶。
            // 在視窗裡 SwiftUI 的 focus 有時不生效，就直接叫最上層畫面裡的輸入框接手
            .task {
                // 剪貼簿是連結：不叫鍵盤，提示按「貼上」（直接讀剪貼簿會跳「允許貼上」）
                if await ClipWatch.hasLink() {
                    withAnimation(.snappy) { clip = true }
                    return
                }
                try? await Task.sleep(for: .milliseconds(350))
                focus = true
                for _ in 0..<4 {
                    try? await Task.sleep(for: .milliseconds(150))
                    if focus { break }
                    focusFirstInput()
                }
            }
            .navigationTitle("新增店家").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("取消") { dismiss() } }
            .sheet(isPresented: $manual) {
                EditSheet(place: {
                    // 貼的網址放來源連結，其他字當店名
                    let (u, rest) = splitLink(input)
                    var p = Place(id: UUID().uuidString, name: rest)
                    p.source_url = u
                    if been { p.status = "been"; p.rating = rating }
                    return p
                }(), isNew: true) { dismiss() }
            }
        }
        // 打了字就不能往下一拉就關（取消照常）
        .interactiveDismissDisabled(!input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    // 按下去視窗就關：AI 在背景找，收藏頁上面有一張「找店中」卡、地圖上有一個膠囊，找到會翻成真的卡
    private func go() {
        focus = false
        Haptic.light()
        let t = input.trimmingCharacters(in: .whitespacesAndNewlines)
        // 把邀請訊息貼進新增框：直接加入並打開群組，不走找店
        if t.contains("anthony-apps.netlify.app/join") || t.contains("邀請碼"), let c = FoodGroup.code(in: t) {
            Task { await store.openInvite(c) }
            dismiss()
            return
        }
        store.startAdd(t, been: been, rating: been ? rating : nil)
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
    @State private var err: String?
    @State private var base: (Place, String, String)?
    @State private var quitting = false
    // 打開時的樣子：dishes、tags 是 onAppear 才填的，要跟填好的字串比，不能拿 split 後的陣列比
    private var dirty: Bool {
        guard let base else { return false }
        return norm(place) != norm(base.0) || dishes != base.1 || tags != base.2
    }
    // 打了字又刪掉、時段點開又關掉，不算改過（Place.row 本來就把 nil 存成空字串，存檔內容不變）
    private func norm(_ p: Place) -> Place {
        var p = p
        let ks: [WritableKeyPath<Place, String?>] = [\.branch, \.cuisine, \.city, \.district, \.address, \.hours, \.note, \.source_url]
        for k in ks where p[keyPath: k]?.isEmpty == true { p[keyPath: k] = nil }
        if p.meals?.isEmpty == true { p.meals = nil }
        return p
    }

    var body: some View {
        NavigationStack {
            Form {
                // 存檔失敗：訊息條在 sheet 底下看不到，直接寫在表單最上面
                if let err {
                    Section {
                        Label { Text("沒存到：\(err)。資料還在，可以再按一次存檔") } icon: { Image(systemName: "exclamationmark.triangle.fill") }
                            .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 16).padding(.vertical, 11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.ink.opacity(0.92), in: .rect(cornerRadius: 18))
                            .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
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
                    TextField("來源連結（IG、網址）", text: str(\.source_url))
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                }
            }
            .confirmationDialog("放棄這次的修改？", isPresented: $quitting, titleVisibility: .visible) {
                Button("放棄", role: .destructive) { dismiss() }
                Button("繼續編輯", role: .cancel) {}
            }
            .scrollContentBackground(.hidden).background(Color.bg)
            .navigationTitle(isNew ? "自己填" : "編輯").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { if dirty { quitting = true } else { dismiss() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "存檔中…" : "存檔", action: save).disabled(busy || place.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        // 改任何欄位就收掉錯誤列
        .onChange(of: place) { if err != nil { withAnimation(.snappy) { err = nil } } }
        .onChange(of: dishes) { if err != nil { withAnimation(.snappy) { err = nil } } }
        .onChange(of: tags) { if err != nil { withAnimation(.snappy) { err = nil } } }
        .onAppear {
            dishes = (place.dishes ?? []).joined(separator: "、")
            tags = (place.tags ?? []).joined(separator: "、")
            // onAppear 可能跑兩次：第二次不能把改過的內容當成新的起點
            if base == nil { base = (place, dishes, tags) }
        }
        // 改過（或正在存）就不能往下一拉就關，要按取消、確認放棄
        .interactiveDismissDisabled(dirty || busy)
    }

    private func str(_ kp: WritableKeyPath<Place, String?>) -> Binding<String> {
        Binding(get: { place[keyPath: kp] ?? "" }, set: { place[keyPath: kp] = $0 })
    }

    private func split(_ s: String) -> [String] {
        s.components(separatedBy: CharacterSet(charactersIn: "、,，/\n")).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    private func save() {
        busy = true
        withAnimation(.snappy) { err = nil }
        var p = place
        p.name = p.name.trimmingCharacters(in: .whitespaces)
        if p.source_url?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true { p.source_url = nil }   // 清空時存 null
        p.dishes = split(dishes); p.tags = split(tags)
        let old = store.place(p.id)
        Task { [p] in
            var p = p
            // 地址改了（或本來沒座標）就重新查座標，地圖上才會在對的位置
            // 沒有地址也沒有座標：用店名＋城市找大概位置
            if (p.lat == nil || old?.address != p.address || old?.city != p.city), let g = await Store.locate(p) {
                p.lat = g.coord.latitude; p.lng = g.coord.longitude; p.approx = g.approx
            }
            var why: String?
            let ok: Bool
            if isNew { ok = await store.add(p, err: { why = $0 }) } else { ok = await store.save(p, err: { why = $0 }) }
            busy = false
            if ok { Haptic.success(); dismiss(); done() }
            else {
                let msg = why ?? "請再試一次"
                Haptic.warning()
                withAnimation(.snappy) { err = msg }
                AccessibilityNotification.Announcement("沒存到：\(msg)").post()
            }
        }
    }
}

// 貼進來的字拆成第一個網址和其他文字：自己填時網址放來源連結，其他字當店名
func splitLink(_ s: String) -> (url: String?, rest: String) {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let d = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
          let m = d.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)),
          let r = Range(m.range, in: t),
          t[r].lowercased().hasPrefix("http") else { return (nil, t) }   // 只認 http(s) 開頭的，店名裡的「xx.tw」不算
    var rest = t; rest.removeSubrange(r)
    return (String(t[r]), rest.trimmingCharacters(in: .whitespacesAndNewlines))
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
