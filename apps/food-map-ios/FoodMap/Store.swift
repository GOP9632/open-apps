import SwiftUI
import Observation

// 資料：上次讀到的先從手機裡拿出來畫（開 app 不用等網路），再到背景跟雲端同步
@Observable final class Store {
    var places: [Place] = []
    var loggedIn = Supa.session != nil
    var error: String?
    var loading = false
    var tab = 0

    // 篩選（和網頁版收藏頁一樣）
    var q = ""
    var cat = ""
    var status = ""

    // 量測：從 App 啟動到收藏頁畫出卡片花多久
    static let launchedAt = Date()
    var firstPaintMs: Int?
    var syncMs: Int?

    private var cacheFile: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("places.json") }

    init() {
        if loggedIn, let d = try? Data(contentsOf: cacheFile), let p = try? JSONDecoder().decode([Place].self, from: d) { places = p }
    }

    var mine: [Place] { places.filter { $0.owner == Supa.session?.user.id } }

    var visible: [Place] {
        places.filter { p in
            (cat.isEmpty || p.category == cat) && (status.isEmpty || p.status == status) &&
            (q.isEmpty || [p.name, p.branch ?? "", p.address ?? "", p.city ?? "", p.district ?? "", p.cuisine ?? "", p.note ?? "", (p.tags ?? []).joined(separator: " ")].joined(separator: " ").localizedCaseInsensitiveContains(q))
        }
    }

    @MainActor func sync() async {
        guard loggedIn else { return }
        loading = true; defer { loading = false }
        let t = Date()
        do {
            let p = try await Supa.select("places", "select=*&order=created_at.desc,id", as: [Place].self)
            if p != places { places = p }
            try? JSONEncoder().encode(p).write(to: cacheFile)
            syncMs = Int(Date().timeIntervalSince(t) * 1000)
            error = nil
        } catch {
            self.error = error.localizedDescription
            if Supa.session == nil { loggedIn = false }
        }
    }

    @MainActor func signIn(_ email: String, _ pw: String) async {
        do { try await Supa.signIn(email: email, password: pw); loggedIn = true; error = nil; await sync() }
        catch { self.error = error.localizedDescription }
    }

    @MainActor func signOut() {
        Supa.signOut(); loggedIn = false; places = []; try? FileManager.default.removeItem(at: cacheFile)
    }
}
