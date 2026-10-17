import SwiftUI
import Observation
import CoreLocation
import MapKit

// 存在手機裡的那一份（下次打開先畫這份，不用等網路）
struct Snapshot: Codable {
    var places: [Place] = []
    var groups: [FoodGroup] = []
    var members: [Member] = []
    var groupPlaces: [GroupPlace] = []
    var rounds: [Round] = []
    var swipes: [SwipeRow] = []
    var profiles: [Profile] = []
}

// 資料：上次讀到的先從手機裡拿出來畫（開 app 不用等網路），再到背景跟雲端同步
// 改資料一律「畫面先變、背景存檔」，存失敗才改回來並告訴你
@MainActor @Observable final class Store {
    var places: [Place] = [] { didSet { branchMemo = [:]; hay = [:] } }
    var groups: [FoodGroup] = []
    var members: [Member] = []
    var groupPlaces: [GroupPlace] = []
    var rounds: [Round] = []
    var swipes: [SwipeRow] = []
    var profiles: [String: Profile] = [:]

    var loggedIn = Supa.session != nil
    var error: String?
    var toast: String?
    // 訊息右邊的按鈕（例如刪除後的「復原」）
    var toastAction: (label: String, run: () -> Void)?
    // 訊息左邊畫出來的勾勾或垃圾桶；刪除時還有那間的小照片（卡片縮小飛過去）
    var toastIcon: ToastIcon?
    var toastPlace: Place?
    // 新增時 AI 在背景找店（收藏頁上面一張「找店中」卡、地圖上一個膠囊）
    var pendingAdds: [PendingAdd] = []
    // 剛出現的新店（回到前景同步到的、AI 剛找到的）：卡片亮框 1 秒
    var freshIds: Set<String> = []
    // 看過哪些店（存在手機裡），同步回來多出來的就是新的
    @ObservationIgnored private var seenIds: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "seenIds") ?? [])
    var loading = false
    // 分頁：0 地圖（打開就在這）、1 收藏、2 群組、3 我的
    var tab = 0
    // 地圖頁的店家頁（教學要能直接帶他進某一間）；其他分頁回報自己往裡走了幾層，走進去就收起下面的分頁列
    var mapPath: [Place] = []
    var depth = [0, 0, 0, 0]
    // 抽一間丟到群組投票：群組頁直接打開這個群組（開好那一輪再推進去）
    var groupJump: GroupJump?
    var barHidden: Bool { tab == 0 ? !mapPath.isEmpty : depth[tab] > 0 }

    // 教學（Coach.swift）：在真的畫面上把要按的東西圈起來
    var coach: [CoachStep] = []
    var coachIndex = 0
    var coachPlace: Place?
    var coachFrames: [CoachStep: CGRect] = [:]
    var showIG = false
    var igFromCoach = false
    // 收藏碼同時放進 App Group，讓分享選單裡的 Bitemap 不用打開 App 也能收藏
    var quickKey: String? {
        didSet { Store.shared?.set(quickKey, forKey: "quickKey") }
    }
    static let shared = UserDefaults(suiteName: "group.io.github.gop9632.foodmap")

    // 篩選：收藏頁和地圖各有一份，互不影響
    var listF = Filter()
    var mapF = Filter()
    // 地圖看誰的收藏：nil = 我的收藏，否則是某個群組（只記這次打開，重開 App 回到我的收藏）
    var mapGroup: String?
    // 目前位置（地圖頁拿到就放這），分店「由近到遠」用
    var here: CLLocation?
    @ObservationIgnored private var brandCache: [String: String] = [:]
    // 分店清單：places 沒變就不重算（店家頁每次畫都要用）
    @ObservationIgnored private var branchMemo: [String: [Place]] = [:]
    // 搜尋用的字串：每家店算一次（店名、分店、地址、料理、備註、標籤串起來），places 變了才重算
    @ObservationIgnored private var hay: [String: String] = [:]
    // 地圖現在看到的範圍（地圖頁停下來時更新），同步完先把這範圍裡的圖釘照片解碼好
    @ObservationIgnored var mapRegion: MKCoordinateRegion?
    @ObservationIgnored private var warming: Task<Void, Never>?
    // 雲端還沒有 load_all（一次拿全部）就走舊的 7 個請求，這次開 App 不再試
    @ObservationIgnored private var noLoadAll = false
    // 刪掉但還能復原的店（幾秒後才真的刪）
    @ObservationIgnored private var undoable: Set<String> = []

    // 量測：從 App 啟動到收藏頁畫出卡片花多久
    static let launchedAt = Date()
    var firstPaintMs: Int?
    var syncMs: Int?
    var syncVia = ""

    // 剛滑的卡還在存的時候，同步回來的舊資料不能把它蓋掉（不然卡片會跳回來）
    @ObservationIgnored private var pendingSwipes: [SwipeRow] = []
    // 同時只跑一次同步（打開 App 和切回前景常常一起來）
    @ObservationIgnored private var syncing: Task<Void, Never>?

    private var cacheFile: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("snapshot.json") }

    init() {
        if loggedIn, let d = try? Data(contentsOf: cacheFile), let s = try? JSONDecoder().decode(Snapshot.self, from: d) { apply(s) }
    }

    var me: String? { Supa.session?.user.id }
    func isMine(_ p: Place) -> Bool { p.owner == me }
    var mine: [Place] { places.filter(isMine) }
    func place(_ id: String) -> Place? { places.first { $0.id == id } }
    func name(_ uid: String) -> String { profiles[uid]?.name ?? "?" }

    // 收藏頁和地圖只放自己的店；朋友的店只在群組裡看
    func shown(_ f: Filter, in base: [Place]? = nil) -> [Place] {
        (base ?? mine).filter { p in
            (f.cat.isEmpty || p.category == f.cat) && (f.status.isEmpty || p.status == f.status) &&
            (f.q.isEmpty || haystack(p).localizedStandardContains(f.q))
        }
    }

    private func haystack(_ p: Place) -> String {
        if let h = hay[p.id] { return h }
        let h = [p.name, p.branch ?? "", p.address ?? "", p.city ?? "", p.district ?? "", p.cuisine ?? "", p.note ?? "", (p.tags ?? []).joined(separator: " ")].joined(separator: " ")
        hay[p.id] = h
        return h
    }

    private func apply(_ s: Snapshot) {
        // 剛刪掉、還能復原的店，雲端還沒真的刪，同步回來不能讓它又冒出來
        let ps = undoable.isEmpty ? s.places : s.places.filter { !undoable.contains($0.id) }
        // 沒變的就不要重設，畫面才不會整個重畫
        if ps != places { places = ps }
        if s.groups != groups { groups = s.groups }
        if s.members != members { members = s.members }
        if s.groupPlaces != groupPlaces { groupPlaces = s.groupPlaces }
        if s.rounds != rounds { rounds = s.rounds }
        let sw = s.swipes + pendingSwipes.filter { p in !s.swipes.contains { $0.round_id == p.round_id && $0.user_id == p.user_id && $0.place_id == p.place_id } }
        if sw != swipes { swipes = sw }
        let pr = Dictionary(s.profiles.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        if pr != profiles { profiles = pr }
    }

    private func saveCache() {
        let s = Snapshot(places: places, groups: groups, members: members, groupPlaces: groupPlaces, rounds: rounds, swipes: swipes, profiles: Array(profiles.values))
        let f = cacheFile
        DispatchQueue.global(qos: .utility).async { try? JSONEncoder().encode(s).write(to: f, options: .atomic) }
    }

    // 跟網頁版 loadAll 一樣：收藏、群組、成員、分享、滑卡輪次一起讀，再讀名字和滑卡紀錄
    @MainActor func sync() async {
        if let t = syncing { return await t.value }
        let t = Task { await syncNow() }
        syncing = t
        await t.value
        syncing = nil
    }

    private func syncNow() async {
        guard loggedIn, let me else { return }
        loading = true; defer { loading = false }
        let t = Date()
        do {
            _ = try await Supa.fresh()
            var s = Snapshot()
            if let all = await loadAll() { s = all; syncVia = "load_all" } else {
                syncVia = "7 個請求"
                async let pl = Supa.select("places", "select=*&order=created_at.desc,id", as: [Place].self)
                async let gr = Supa.select("groups", "select=*&order=created_at,id", as: [FoodGroup].self)
                async let gm = Supa.select("group_members", "select=group_id,user_id&order=group_id,user_id", as: [Member].self)
                async let gp = Supa.select("group_places", "select=group_id,place_id&order=group_id,place_id", as: [GroupPlace].self)
                async let rd = Supa.select("swipe_rounds", "select=id,group_id,created_by,title,place_ids,created_at&order=created_at.desc,id&limit=50", as: [Round].self)
                (s.places, s.groups, s.members, s.groupPlaces, s.rounds) = try await (pl, gr, gm, gp, rd)
                let ids = Array(Set([me] + s.members.map(\.user_id) + s.places.compactMap(\.owner))).sorted()
                let rids = s.rounds.map(\.id)
                async let pr = Supa.select("profiles", "select=id,name&id=in.(\(ids.joined(separator: ",")))&order=id", as: [Profile].self)
                async let sw = Store.loadSwipes(rids)
                (s.profiles, s.swipes) = try await (pr, sw)
            }
            // 同步途中登出或換帳號，就不要把舊資料寫回來
            guard loggedIn, Supa.session?.user.id == me else { return }
            apply(s)
            if profiles[me] == nil {
                // 帳號比美食收藏早建（和其他 app 共用的 Supabase），補一筆名字
                let p = Profile(id: me, name: (Supa.session?.user.email ?? "").components(separatedBy: "@")[0])
                try? await Supa.write("POST", "profiles", body: p, upsert: true)
                profiles[me] = p
            }
            saveCache()
            warmPhotos()
            noteNew()
            if quickKey == nil { await loadQuickKey() }
            syncMs = Int(Date().timeIntervalSince(t) * 1000)
            error = nil
        } catch {
            self.error = error.localizedDescription
            if Supa.session == nil { loggedIn = false }
        }
    }

    // 雲端的 load_all：一個請求拿回全部（收藏、群組、成員、分享、最近 50 輪、滑卡紀錄、名字）
    // 雲端還沒有這個函式（404、找不到函式）就回 nil 走舊的；其他錯誤也走舊的，下次再試
    private func loadAll() async -> Snapshot? {
        guard !noLoadAll else { return nil }
        struct All: Decodable {
            var places: [Place]?, groups: [FoodGroup]?, members: [Member]?, group_places: [GroupPlace]?
            var rounds: [Round]?, swipes: [SwipeRow]?, profiles: [Profile]?
        }
        do {
            let a = try await Supa.rpc("load_all", [:], as: All.self)
            return Snapshot(places: a.places ?? [], groups: a.groups ?? [], members: a.members ?? [], groupPlaces: a.group_places ?? [],
                            rounds: a.rounds ?? [], swipes: a.swipes ?? [], profiles: a.profiles ?? [])
        } catch let e as Supa.Fail where e.code == 404 || e.msg.contains("Could not find the function") {
            noLoadAll = true
            return nil
        } catch {
            print("[sync] load_all 失敗，改用舊的：\(error)")
            return nil
        }
    }

    // 同步完在背景把看得到的店（自己的、群組的）照片先抓進手機（不解碼，同時最多 4 張）；
    // 地圖現在範圍裡的圖釘照片另外先解碼，滑地圖時就不用等
    private func warmPhotos() {
        let shared = Set(groupPlaces.map(\.place_id))
        let urls = places.filter { isMine($0) || shared.contains($0.id) }.compactMap(\.photoURL)
        let pins = mapRegion.map { r in
            mapBase.filter { p in
                guard let la = p.lat, let lo = p.lng else { return false }
                return abs(la - r.center.latitude) <= r.span.latitudeDelta / 2 && abs(lo - r.center.longitude) <= r.span.longitudeDelta / 2
            }.compactMap(\.photoURL)
        } ?? []
        warming?.cancel()
        warming = Task.detached(priority: .utility) {
            await Store.each(pins) { _ = await PhotoLoader.shared.load($0, 160) }
            await Store.each(urls) { await PhotoLoader.shared.prefetch($0, small: true) }
        }
    }

    // 同時最多跑 4 個
    nonisolated private static func each(_ us: [URL], _ f: @escaping @Sendable (URL) async -> Void) async {
        await withTaskGroup(of: Void.self) { g in
            var it = us.makeIterator()
            for _ in 0..<4 { if let u = it.next() { g.addTask { await f(u) } } }
            while await g.next() != nil {
                if Task.isCancelled { g.cancelAll(); return }
                if let u = it.next() { g.addTask { await f(u) } }
            }
        }
    }

    // 滑卡頁每幾秒只拿這一輪的滑卡紀錄和成員（不用整份重抓），有新朋友加入才整份同步
    @MainActor func syncRound(_ r: Round) async {
        do {
            async let sw = Supa.select("swipes", "select=round_id,user_id,place_id,liked,created_at&round_id=eq.\(r.id)&order=user_id,place_id", as: [SwipeRow].self)
            async let gm = Supa.select("group_members", "select=group_id,user_id&group_id=eq.\(r.group_id)&order=user_id", as: [Member].self)
            let (s, m) = try await (sw, gm)
            let keep = pendingSwipes.filter { p in p.round_id == r.id && !s.contains { $0.user_id == p.user_id && $0.place_id == p.place_id } }
            let nsw = (swipes.filter { $0.round_id != r.id } + s + keep).sorted { ($0.round_id, $0.user_id, $0.place_id) < ($1.round_id, $1.user_id, $1.place_id) }
            if nsw != swipes { swipes = nsw }
            let nm = (members.filter { $0.group_id != r.group_id } + m).sorted { ($0.group_id, $0.user_id) < ($1.group_id, $1.user_id) }
            if nm != members { members = nm }
            if m.contains(where: { profiles[$0.user_id] == nil }) { await sync() }
        } catch {}
    }

    private static func loadSwipes(_ rids: [String]) async throws -> [SwipeRow] {
        if rids.isEmpty { return [] }
        return try await Supa.select("swipes", "select=round_id,user_id,place_id,liked,created_at&round_id=in.(\(rids.joined(separator: ",")))&order=round_id,user_id,place_id", as: [SwipeRow].self)
    }

    @MainActor func signIn(_ email: String, _ pw: String) async {
        do { try await Supa.signIn(email: email, password: pw); loggedIn = true; error = nil; await sync() }
        catch { self.error = error.localizedDescription }
    }

    // 建好帳號就直接登入，並用他填的名字建 profile（朋友在群組裡看到的名字）
    @MainActor func signUp(_ email: String, _ pw: String, _ name: String) async -> Bool {
        do {
            guard try await Supa.signUp(email: email, password: pw, name: name) else {
                error = nil; say("帳號建好了，請到信箱點確認信再回來登入"); return false
            }
            if let me = Supa.session?.user.id {
                let p = Profile(id: me, name: name)
                try? await Supa.write("POST", "profiles", body: p, upsert: true)
                profiles[me] = p
            }
            loggedIn = true; error = nil; await sync(); return true
        } catch { self.error = error.localizedDescription; return false }
    }

    @MainActor func signOut() {
        Supa.signOut(); loggedIn = false
        undoable = []; pendingSwipes = []
        apply(Snapshot()); quickKey = nil
        mapPath = []; depth = [0, 0, 0, 0]; tab = 0; coach = []; listF = Filter(); mapF = Filter()
        try? FileManager.default.removeItem(at: cacheFile)
    }

    @MainActor func say(_ s: String, icon: ToastIcon? = nil, place: Place? = nil, action: (label: String, run: () -> Void)? = nil) {
        withAnimation(.snappy(duration: 0.35)) { toast = s; toastAction = action; toastIcon = icon; toastPlace = place }
    }

    // 同步回來多了新店：卡片亮框、圖釘下次出現時落下
    private func noteNew() {
        let ids = Set(mine.map(\.id))
        let new = seenIds.isEmpty ? [] : ids.subtracting(seenIds)
        if !new.isEmpty { markFresh(new) }
        if ids != seenIds { seenIds = ids; UserDefaults.standard.set(Array(ids), forKey: "seenIds") }
    }

    func markFresh(_ ids: Set<String>) {
        seenIds.formUnion(ids)
        UserDefaults.standard.set(Array(seenIds), forKey: "seenIds")
        PinState.fresh.formUnion(ids)
        withAnimation(.snappy) { freshIds.formUnion(ids) }
        Task {
            try? await Task.sleep(for: .seconds(1.2))
            withAnimation(.easeOut(duration: 0.4)) { freshIds.subtract(ids) }
        }
    }

    // ----- 新增：AI 在背景找店，視窗先關 -----

    func startAdd(_ text: String, been: Bool, rating: Int?) {
        let a = PendingAdd(text: text, been: been, rating: rating)
        withAnimation(.snappy) { pendingAdds.insert(a, at: 0) }
        Task { await runAdd(a.id) }
    }

    func retryAdd(_ id: UUID) {
        guard let i = pendingAdds.firstIndex(where: { $0.id == id }) else { return }
        withAnimation(.snappy) { pendingAdds[i].state = .finding }
        Task { await runAdd(id) }
    }

    func dropAdd(_ id: UUID) { withAnimation(.snappy) { pendingAdds.removeAll { $0.id == id } } }

    private func runAdd(_ id: UUID) async {
        guard let a = pendingAdds.first(where: { $0.id == id }) else { return }
        func set(_ st: PendingAdd.State) {
            if let i = pendingAdds.firstIndex(where: { $0.id == id }) { withAnimation(.snappy) { pendingAdds[i].state = st } }
        }
        do {
            let k: String
            if let quickKey { k = quickKey } else { k = try await Supa.rpc("quick_key", ["reset": .b(false)], as: String.self); quickKey = k }
            let before = Set(places.map(\.id))
            let (msg, rows) = try await Supa.quickAddJSON(key: k, input: a.text)
            var new = rows.filter { !before.contains($0.id) }
            if new.isEmpty, msg.hasPrefix("已收藏") {
                // 雲端回的不是 JSON（舊版）：整份同步再看多了哪幾間
                await sync()
                new = mine.filter { !before.contains($0.id) }
            } else if !new.isEmpty {
                withAnimation(.snappy) { places.insert(contentsOf: new, at: 0) }
                saveCache()
            }
            guard msg.hasPrefix("已收藏") || !new.isEmpty else {
                // 全部都之前收藏過：卡片收掉，訊息說一聲
                if msg.hasPrefix("之前收藏過") { Haptic.light(); dropAdd(id); say(msg); return }
                Haptic.warning(); set(.failed(Self.inApp(msg))); return
            }
            Haptic.success()
            markFresh(Set(new.map(\.id)))
            set(.done(new.map(\.id)))
            say(msg.isEmpty ? "已收藏" : msg, icon: .check)
            Task {
                try? await Task.sleep(for: .seconds(1.6))
                dropAdd(id)
            }
            for var p in new where a.been { p.status = "been"; p.rating = a.rating; await save(p) }
            await fillCoords(new.map(\.id))
        } catch {
            Haptic.warning()
            set(.failed("收藏失敗：" + error.localizedDescription))
        }
    }

    // 雲端的訊息是寫給分享捷徑的（「打開美食收藏貼上店名」），在 App 裡新增時換成 App 裡的說法
    private static func inApp(_ m: String) -> String {
        if m.isEmpty || m.contains("沒找到店家") { return "找不到這間店。加上地區或分店名再試一次，或按「自己填」" }
        if m.contains("收藏碼") { return "收藏碼失效了，請到「我的」重新產生後再試" }
        return m
    }

    // 忘記密碼：寄重設密碼的信
    @MainActor func recover(_ email: String) async {
        do { try await Supa.recover(email: email); error = nil; say("已寄出重設密碼的信，請到信箱收信") }
        catch { self.error = error.localizedDescription }
    }

    // 刪除帳號：收藏、群組、滑卡紀錄、名字和帳號本身都刪掉
    @MainActor func deleteAccount() async {
        do {
            try await Supa.write("POST", "rpc/delete_my_account", body: [String: AnyCodable]())
            signOut()
            UserDefaults.standard.removeObject(forKey: "coachDone")
            say("帳號已刪除")
        } catch { say("刪除失敗：" + error.localizedDescription) }
    }

    // ----- 收藏 -----

    // 改一間店（想去／去過、星等、編輯都走這裡）
    @discardableResult @MainActor func save(_ p: Place) async -> Bool {
        guard let i = places.firstIndex(where: { $0.id == p.id }) else { return false }
        let old = places[i]
        var p = p
        p.updated_at = ISO8601DateFormatter().string(from: Date())
        places[i] = p
        do {
            let d = try await Supa.write("PATCH", "places", query: "id=eq.\(p.id)", body: p.row)
            // 伺服器回來的那筆只有 updated_at 不同就不寫回去（不然整個 App 會在動畫中途再重算一次）
            if let back = try? JSONDecoder().decode([Place].self, from: d).first, let j = places.firstIndex(where: { $0.id == p.id }) {
                var same = back; same.updated_at = places[j].updated_at
                if same != places[j] { places[j] = back }
            }
            saveCache()
            return true
        } catch {
            if let j = places.firstIndex(where: { $0.id == p.id }) { places[j] = old }
            say("沒存到：" + error.localizedDescription)
            return false
        }
    }

    // 手動新增一間（沒有連結時用）
    @MainActor func add(_ p: Place) async -> Bool {
        do {
            let d = try await Supa.write("POST", "places", body: p.row)
            if let back = try JSONDecoder().decode([Place].self, from: d).first { withAnimation(.snappy) { places.insert(back, at: 0) } }
            saveCache()
            return true
        } catch { say("新增失敗：" + error.localizedDescription); return false }
    }

    // 先從畫面拿掉，4 秒內按「復原」就放回去，沒按才真的刪
    @MainActor func deleteWithUndo(_ p: Place) {
        let at = places.firstIndex { $0.id == p.id } ?? 0
        let shares = groupPlaces.filter { $0.place_id == p.id }
        undoable.insert(p.id)
        withAnimation(.snappy(duration: 0.35)) {
            places.removeAll { $0.id == p.id }
            groupPlaces.removeAll { $0.place_id == p.id }
        }
        say("已刪除 \(p.name)", icon: .trash, place: p, action: ("復原", { [weak self] in
            guard let self, self.undoable.remove(p.id) != nil else { return }
            // 從訊息條左邊的小照片彈回原位
            withAnimation(.snappy(duration: 0.35)) {
                self.places.insert(p, at: min(at, self.places.count))
                self.groupPlaces += shares
                self.toast = nil; self.toastPlace = nil
            }
        }))
        Task {
            try? await Task.sleep(for: .seconds(4.2))
            guard undoable.remove(p.id) != nil, loggedIn else { return }
            do { try await Supa.write("DELETE", "places", query: "id=eq.\(p.id)"); saveCache() }
            catch {
                withAnimation(.snappy) { places.insert(p, at: min(at, places.count)); groupPlaces += shares }
                say("刪除失敗：" + error.localizedDescription)
            }
        }
    }

    // 朋友的店：「我也想去」複製一份成自己的收藏
    @MainActor func copyToMine(_ p: Place) async {
        var n = Place(id: UUID().uuidString, name: p.name)
        n.branch = p.branch; n.address = p.address; n.city = p.city; n.district = p.district
        n.lat = p.lat; n.lng = p.lng; n.approx = p.approx; n.category = p.category; n.cuisine = p.cuisine
        n.price = p.price; n.meals = p.meals; n.hours = p.hours; n.dishes = p.dishes; n.tags = p.tags
        n.photo = p.photo; n.source_url = p.source_url; n.status = "want"
        if await add(n) {
            Haptic.success()
            say("已加到你的收藏")
        }
    }

    // ----- 分店：同一家店的多個地點（一篇 IG 常列好幾間分店），清單和滑卡都算一家 -----

    func brand(_ p: Place) -> String {
        let k = p.id + "|" + p.name
        if let b = brandCache[k] { return b }
        let b = brandOf(p)
        brandCache[k] = b
        return b
    }

    func distance(_ p: Place) -> Double? {
        guard let here, let lat = p.lat, let lng = p.lng else { return nil }
        return here.distance(from: CLLocation(latitude: lat, longitude: lng))
    }

    // 由近到遠，沒座標的排最後；不知道位置就照原本順序
    func nearFirst(_ l: [Place]) -> [Place] {
        guard here != nil else { return l }
        return l.enumerated().sorted { a, b in
            switch (distance(a.element), distance(b.element)) {
            case let (x?, y?): x < y
            case (.some, nil): true
            case (nil, .some): false
            default: a.offset < b.offset
            }
        }.map(\.element)
    }

    // 依店家分組，保留原本順序；每組最近的分店排第一
    func brands(_ l: [Place]) -> [[Place]] {
        var order: [String] = [], g: [String: [Place]] = [:]
        for p in l {
            let k = brand(p)
            if g[k] == nil { order.append(k) }
            g[k, default: []].append(p)
        }
        return order.map { nearFirst(g[$0]!) }
    }

    // 同一家的所有分店（自己的店在自己的收藏裡找；朋友的店在同一個人的收藏裡找）
    func branchesOf(_ p: Place) -> [Place] {
        let k = brand(p)
        let mk = (p.owner ?? "") + "|" + k
        if let m = branchMemo[mk] { return m }
        let r = nearFirst(places.filter { $0.owner == p.owner && brand($0) == k })
        branchMemo[mk] = r
        return r
    }

    // 這間是不是已經在我的收藏（同名同分店）
    func alreadyMine(_ p: Place) -> Bool { mine.contains { $0.name == p.name && ($0.branch ?? "") == (p.branch ?? "") } }

    @MainActor func delete(_ p: Place) async {
        let before = places, shares = groupPlaces
        withAnimation(.snappy) {
            places.removeAll { $0.id == p.id }
            groupPlaces.removeAll { $0.place_id == p.id }
        }
        do { try await Supa.write("DELETE", "places", query: "id=eq.\(p.id)"); saveCache() }
        catch { places = before; groupPlaces = shares; say("刪除失敗：" + error.localizedDescription) }
    }

    // 貼連結或店名 → 雲端 AI 找出店家直接存好（跟 IG 分享捷徑同一個功能）
    // been = true：收藏的是已經去過的店，存好後直接標成去過（rating 可以是 nil）
    @MainActor func quickAdd(_ input: String, been: Bool = false, rating: Int? = nil) async -> String {
        do {
            let k: String
            if let quickKey { k = quickKey } else { k = try await Supa.rpc("quick_key", ["reset": .b(false)], as: String.self); quickKey = k }
            let before = Set(mine.map(\.id))
            let r = try await Supa.quickAdd(key: k, input: input)
            // 結果一回來就先回報，同步、標去過、補座標都在背景做
            Task {
                await sync()
                let new = mine.filter { !before.contains($0.id) }
                for var p in new {
                    if been { p.status = "been"; p.rating = rating; await save(p) }
                }
                await fillCoords(new.map(\.id))
            }
            return r.isEmpty ? "收藏失敗，請再試一次" : r
        } catch { return "收藏失敗：" + error.localizedDescription }
    }

    @MainActor func resetQuickKey() async {
        do { quickKey = try await Supa.rpc("quick_key", ["reset": .b(true)], as: String.self); say("已換新的收藏碼，請重新加入分享捷徑") }
        catch { say("換收藏碼失敗：" + error.localizedDescription) }
    }

    @MainActor func loadQuickKey() async {
        if quickKey == nil { quickKey = try? await Supa.rpc("quick_key", ["reset": .b(false)], as: String.self) }
    }

    // 有地址但沒有座標的店，用 iPhone 內建的地址查詢補上，地圖上才看得到
    @MainActor func fillCoords(_ only: [String]? = nil) async {
        for p in mine where p.lat == nil && !(p.address ?? "").isEmpty && (only == nil || only!.contains(p.id)) {
            if let c = await Store.geocode(p) {
                var n = p; n.lat = c.latitude; n.lng = c.longitude; n.approx = false
                await save(n)
            }
        }
    }

    static func geocode(_ p: Place) async -> CLLocationCoordinate2D? {
        let q = [normCity(p.city), p.district ?? "", p.address ?? ""].joined(separator: " ").trimmingCharacters(in: .whitespaces)
        return try? await CLGeocoder().geocodeAddressString(q).first?.location?.coordinate
    }

    @MainActor func rename(_ name: String) async {
        guard let me else { return }
        let old = profiles[me]
        profiles[me] = Profile(id: me, name: name)
        do { try await Supa.write("PATCH", "profiles", query: "id=eq.\(me)", body: ["name": AnyCodable.s(name)]); say("已更新") }
        catch { profiles[me] = old; say(error.localizedDescription) }
    }

    // ----- 群組 -----

    func placesIn(_ gid: String) -> [Place] {
        let ids = Set(groupPlaces.filter { $0.group_id == gid }.map(\.place_id))
        return places.filter { ids.contains($0.id) }
    }
    // 地圖現在要畫的店：我的收藏，或選的群組裡大家分享的店
    var mapBase: [Place] { mapGroup.map(placesIn) ?? mine }
    var mapGroupName: String? { mapGroup.flatMap { g in groups.first { $0.id == g }?.name } }

    func membersOf(_ gid: String) -> [String] { members.filter { $0.group_id == gid }.map(\.user_id) }
    func roundsOf(_ gid: String) -> [Round] { rounds.filter { $0.group_id == gid } }
    func shared(_ pid: String, _ gid: String) -> Bool { groupPlaces.contains { $0.group_id == gid && $0.place_id == pid } }

    @MainActor func createGroup(_ name: String) async -> FoodGroup? {
        do {
            let d = try await Supa.write("POST", "groups", body: ["name": AnyCodable.s(name)])
            let g = try JSONDecoder().decode([FoodGroup].self, from: d).first
            await sync()
            return g
        } catch { say("建立失敗：" + error.localizedDescription); return nil }
    }

    @MainActor func join(_ code: String) async -> String? {
        do {
            let gid = try await Supa.rpc("join_group", ["code": .s(code)], as: String.self)
            await sync()
            say("加入「\(groups.first { $0.id == gid }?.name ?? "群組")」了 🎉")
            return gid
        } catch { say("加入失敗：" + error.localizedDescription); return nil }
    }

    @MainActor func leave(_ g: FoodGroup) async {
        guard let me else { return }
        do {
            if g.owner == me { try await Supa.write("DELETE", "groups", query: "id=eq.\(g.id)") }
            else { try await Supa.write("DELETE", "group_members", query: "group_id=eq.\(g.id)&user_id=eq.\(me)") }
            await sync()
        } catch { say(error.localizedDescription) }
    }

    @MainActor func share(_ gid: String, _ ids: [String]) async {
        let rows = ids.filter { !shared($0, gid) }.map { GroupPlace(group_id: gid, place_id: $0) }
        guard !rows.isEmpty else { return }
        groupPlaces += rows
        do { try await Supa.write("POST", "group_places", body: rows); saveCache() }
        catch { groupPlaces.removeAll { rows.contains($0) }; say("分享失敗：" + error.localizedDescription) }
    }

    @MainActor func unshare(_ gid: String, _ pid: String) async {
        let row = GroupPlace(group_id: gid, place_id: pid)
        groupPlaces.removeAll { $0 == row }
        do { try await Supa.write("DELETE", "group_places", query: "group_id=eq.\(gid)&place_id=eq.\(pid)"); saveCache() }
        catch { groupPlaces.append(row); say("失敗：" + error.localizedDescription) }
    }

    // ----- 滑卡 -----

    @MainActor func startRound(_ gid: String, title: String, pool: [Place], filters: [String: AnyCodable]) async -> Round? {
        do {
            let d = try await Supa.write("POST", "swipe_rounds", body: ["group_id": AnyCodable.s(gid), "title": .s(title), "filters": .o(filters), "place_ids": .a(pool.map(\.id))])
            guard let r = try JSONDecoder().decode([Round].self, from: d).first else { return nil }
            rounds.insert(r, at: 0)
            return r
        } catch { say("失敗：" + error.localizedDescription); return nil }
    }

    // 刪掉一輪滑卡（連同大家滑的紀錄、配對結果）；開這輪的人和群組建立者能刪
    func canDelete(_ r: Round) -> Bool { r.created_by == me || groups.first { $0.id == r.group_id }?.owner == me }

    @MainActor func deleteRound(_ r: Round) async {
        let before = rounds, sw = swipes
        withAnimation(.snappy) {
            rounds.removeAll { $0.id == r.id }
            swipes.removeAll { $0.round_id == r.id }
        }
        do { try await Supa.write("DELETE", "swipe_rounds", query: "id=eq.\(r.id)"); saveCache() }
        catch { rounds = before; swipes = sw; say("刪除失敗：" + error.localizedDescription) }
    }

    // 先換下一張，存檔在背景跑，滑起來才不會卡
    @MainActor func swipe(_ r: Round, _ pid: String, liked: Bool) {
        guard let me else { return }
        let row = SwipeRow(round_id: r.id, user_id: me, place_id: pid, liked: liked)
        swipes.append(row); pendingSwipes.append(row)
        Task {
            do { try await Supa.write("POST", "swipes", body: row, upsert: true) }
            catch { swipes.removeAll { $0 == row }; say("沒存到，請再滑一次：" + error.localizedDescription) }
            pendingSwipes.removeAll { $0 == row }
            saveCache()
        }
    }

    // 「上一張」：收回自己剛滑的那張
    @MainActor func unswipe(_ r: Round, _ pid: String) async {
        guard let me, let row = swipes.first(where: { $0.round_id == r.id && $0.user_id == me && $0.place_id == pid }) else { return }
        withAnimation(.snappy) { swipes.removeAll { $0 == row } }
        do { try await Supa.write("DELETE", "swipes", query: "round_id=eq.\(r.id)&user_id=eq.\(me)&place_id=eq.\(pid)"); saveCache() }
        catch { swipes.append(row); say("收回失敗：" + error.localizedDescription) }
    }

    struct Match: Identifiable { let place: Place; let who: [String]; let all: Bool; var id: String { place.id } }

    // 跟網頁版一樣：每間店幾個人想吃，全員都想吃就是配對成功
    func matches(_ r: Round) -> [Match] {
        let mem = membersOf(r.group_id)
        let sw = swipes.filter { $0.round_id == r.id && $0.liked }
        return r.place_ids.compactMap { id in
            guard let p = place(id) else { return nil }
            let who = sw.filter { $0.place_id == id }.map(\.user_id)
            return Match(place: p, who: who, all: mem.count > 1 && who.count == mem.count)
        }
        .sorted { $0.who.count > $1.who.count }
    }

    func todo(_ r: Round) -> [Place] {
        let done = Set(swipes.filter { $0.round_id == r.id && $0.user_id == me }.map(\.place_id))
        return r.place_ids.filter { !done.contains($0) }.compactMap { self.place($0) }
    }
}

enum ToastIcon: Equatable { case check, trash }

struct PendingAdd: Identifiable, Equatable {
    let id = UUID()
    var text: String
    var been: Bool
    var rating: Int?
    var state: State = .finding
    enum State: Equatable { case finding, done([String]), failed(String) }
}

struct Filter: Equatable {
    var q = ""
    var cat = ""
    var status = ""
    var on: Bool { !cat.isEmpty || !status.isEmpty }
}

extension Place {
    // 寫回資料庫的欄位（不含 id、owner、created_at；資料庫裡文字欄位不能是空值，所以用空字串）
    var row: [String: AnyCodable] {
        func s(_ v: String?) -> AnyCodable { .s(v ?? "") }
        return [
            "name": .s(name), "branch": s(branch), "address": s(address), "city": s(city), "district": s(district),
            "lat": lat.map { AnyCodable.d($0) } ?? .null, "lng": lng.map { AnyCodable.d($0) } ?? .null, "approx": .b(approx ?? false),
            "category": .s(category ?? "restaurant"), "cuisine": s(cuisine), "price": price.map { AnyCodable.i($0) } ?? .null,
            "meals": .a(meals ?? []), "hours": s(hours), "status": .s(status ?? "want"), "rating": rating.map { AnyCodable.i($0) } ?? .null,
            "note": s(note), "tags": .a(tags ?? []), "dishes": .a(dishes ?? []), "source_url": s(source_url), "photo": photo.map { AnyCodable.s($0) } ?? .null,
            "updated_at": .s(updated_at ?? ISO8601DateFormatter().string(from: Date())),
        ]
    }
}

// 分店的名字：分店欄位、店名後面的「XX店」、區、縣市、地址開頭
// 店名結尾的分店名（例如「・台北復北店」）；只編譯一次
private let branchRE = try! NSRegularExpression(pattern: #"[\s・·\-–|｜(（]+([^\s・·\-–|｜(（]{1,12}?(?:分店|店|門市|館))[)）]?$"#)

func branchLabel(_ p: Place) -> String {
    if let b = p.branch, !b.isEmpty { return b }
    if let m = branchRE.firstMatch(in: p.name, range: NSRange(p.name.startIndex..., in: p.name)),
       let g = Range(m.range(at: 1), in: p.name) { return String(p.name[g]) }
    if let d = p.district, !d.isEmpty { return d }
    let c = normCity(p.city); if !c.isEmpty { return c }
    if let a = p.address, !a.isEmpty { return String(a.prefix(10)) }
    return "分店"
}

func fmtDistance(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: m < 10000 ? "%.1f km" : "%.0f km", m / 1000) }
