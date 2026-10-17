import Foundation
import Security

// 直接用 Supabase 的 REST API（不裝 SDK，編譯快、App 小）
// 網址和 publishable key 跟網頁版 config.js 一樣，本來就是公開用的
@MainActor enum Supa {
    static let url = URL(string: "https://ptocokzxpwwautnbbuup.supabase.co")!
    static let key = "sb_publishable_p_eT8zA9iEEITNyUFslSpQ_BU62SO9n"

    struct Session: Codable {
        var access_token: String
        var refresh_token: String
        var expires_at: Double?
        var user: User
    }
    struct User: Codable { let id: String; let email: String? }
    struct Fail: LocalizedError { let msg: String; var code = 0; var errorDescription: String? { msg } }

    // 登入憑證放在 iPhone 的鑰匙圈（舊版放在一般設定裡的，第一次讀到就搬過去）
    static var session: Session? = {
        if let d = Keychain.read() { return try? JSONDecoder().decode(Session.self, from: d) }
        guard let d = UserDefaults.standard.data(forKey: "food.session") else { return nil }
        Keychain.write(d); UserDefaults.standard.removeObject(forKey: "food.session")
        return try? JSONDecoder().decode(Session.self, from: d)
    }() {
        didSet { Keychain.write(session.flatMap { try? JSONEncoder().encode($0) }) }
    }
    // 同時好幾個請求都發現憑證過期，只換一次
    private static var refreshing: Task<Session, Error>?

    static func signIn(email: String, password: String) async throws {
        session = try await auth("token?grant_type=password", ["email": email, "password": password])
    }
    static func signOut() { session = nil }

    // 建立帳號（跟網頁版一樣把名字放在 user metadata）。
    // 回傳 true = 直接登入了；false = 要先到信箱點確認信
    static func signUp(email: String, password: String, name: String) async throws -> Bool {
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/signup")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password, "data": ["name": name]])
        let (d, res) = try await URLSession.shared.data(for: r)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw Fail(msg: message(d, "建立帳號失敗")) }
        if let s = try? JSONDecoder().decode(Session.self, from: d) { session = s; return true }
        return false
    }

    // 寄重設密碼的信（信裡的連結到網頁版設定新密碼）
    static func recover(email: String) async throws {
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/recover?redirect_to=https%3A%2F%2Fgop9632.github.io%2Fopen-apps%2Fapps%2Ffood-map%2F")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(["email": email])
        let (d, res) = try await URLSession.shared.data(for: r)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw Fail(msg: message(d, "寄信失敗，請稍後再試")) }
    }

    private static func message(_ d: Data, _ fallback: String) -> String {
        let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
        let m = (j?["msg"] ?? j?["error_description"] ?? j?["message"]) as? String ?? ""
        if m == "Invalid login credentials" { return "Email 或密碼不對" }
        if m.contains("already registered") { return "這個 Email 已經註冊過，請直接登入" }
        if m.contains("at least") && m.lowercased().contains("password") { return "密碼至少要 6 個字" }
        if m.contains("Email not confirmed") { return "還沒到信箱點確認信" }
        if m.lowercased().contains("invalid") && m.lowercased().contains("email") { return "Email 格式不對" }
        return m.isEmpty ? fallback : m
    }

    private static func auth(_ path: String, _ body: [String: String]) async throws -> Session {
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/\(path)")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(body)
        let (d, res) = try await URLSession.shared.data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else { throw Fail(msg: message(d, "登入失敗"), code: code) }
        return try JSONDecoder().decode(Session.self, from: d)
    }

    // 憑證快過期就換新的（跟網頁版的 supabase-js 一樣）
    // 換不到新憑證（太久沒開、在別處登出）就清掉，回到登入畫面
    static func fresh() async throws -> Session {
        guard let s = session else { throw Fail(msg: "請先登入") }
        guard let exp = s.expires_at, exp - Date().timeIntervalSince1970 < 60 else { return s }
        if let t = refreshing { return try await t.value }
        let t = Task { try await auth("token?grant_type=refresh_token", ["refresh_token": s.refresh_token]) }
        refreshing = t
        defer { refreshing = nil }
        do {
            let n = try await t.value
            session = n
            return n
        } catch let e as Fail where (400..<500).contains(e.code) {
            session = nil
            throw Fail(msg: "登入過期了，請重新登入")
        }
    }

    // PostgREST 查詢，例如 select("places", "select=*&order=created_at.desc")
    static func select<T: Decodable>(_ table: String, _ query: String, as: T.Type) async throws -> T {
        let s = try await fresh()
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/rest/v1/\(table)?\(query)")!)
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        r.setValue("food", forHTTPHeaderField: "Accept-Profile")
        r.cachePolicy = .reloadIgnoringLocalCacheData
        let (d, res) = try await URLSession.shared.data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else { throw Fail(msg: "讀取失敗（\(code)）" + (String(data: d, encoding: .utf8) ?? "")) }
        return try JSONDecoder().decode(T.self, from: d)
    }

    // 寫入：POST／PATCH／DELETE，回傳寫好的那幾筆（Prefer: return=representation）
    @discardableResult
    static func write(_ method: String, _ table: String, query: String = "", body: Encodable? = nil, upsert: Bool = false) async throws -> Data {
        let s = try await fresh()
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/rest/v1/\(table)\(query.isEmpty ? "" : "?" + query)")!)
        r.httpMethod = method
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        r.setValue("food", forHTTPHeaderField: "Content-Profile")
        r.setValue("food", forHTTPHeaderField: "Accept-Profile")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("return=representation" + (upsert ? ",resolution=merge-duplicates" : ""), forHTTPHeaderField: "Prefer")
        if let body { r.httpBody = try JSONEncoder().encode(AnyEnc(body)) }
        let (d, res) = try await URLSession.shared.data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
            throw Fail(msg: (j?["message"] as? String) ?? "存檔失敗（\(code)）")
        }
        return d
    }

    static func rpc<T: Decodable>(_ fn: String, _ args: [String: AnyCodable], as: T.Type) async throws -> T {
        let d = try await write("POST", "rpc/\(fn)", body: args)
        return try JSONDecoder().decode(T.self, from: d)
    }

    // IG Reel 的影片網址（IG 的網址會過期，所以每次打開店家頁都重新拿，不存）
    static func reelVideo(_ source: String) async throws -> URL? {
        let s = try await fresh()
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/functions/v1/reel-video")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(["url": source])
        r.timeoutInterval = 20
        let (d, res) = try await URLSession.shared.data(for: r)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        struct R: Decodable { let video: String? }
        return (try? JSONDecoder().decode(R.self, from: d))?.video.flatMap(URL.init(string:))
    }

    // 分享捷徑用的同一個雲端函式：貼一個連結或一段文字，AI 找出店家直接存好，回一行結果
    static func quickAdd(key qk: String, input: String) async throws -> String {
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/functions/v1/quick-add")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(["key": qk, "input": input])
        r.timeoutInterval = 60
        let (d, res) = try await URLSession.shared.data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else { throw Fail(msg: "雲端暫時出錯（\(code)），請再試一次") }
        return String(data: d, encoding: .utf8) ?? ""
    }
}

struct AnyEnc: Encodable {
    let v: Encodable
    init(_ v: Encodable) { self.v = v }
    func encode(to e: Encoder) throws { try v.encode(to: e) }
}

// 簡單的 JSON 值，用來組 PATCH 和 rpc 的內容
enum AnyCodable: Codable {
    case s(String), i(Int), d(Double), b(Bool), a([String]), o([String: AnyCodable]), null
    func encode(to e: Encoder) throws {
        var c = e.singleValueContainer()
        switch self {
        case .s(let v): try c.encode(v)
        case .i(let v): try c.encode(v)
        case .d(let v): try c.encode(v)
        case .b(let v): try c.encode(v)
        case .a(let v): try c.encode(v)
        case .o(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    init(from d: Decoder) throws { self = .null }
}

// 鑰匙圈：只存一筆登入憑證
enum Keychain {
    private static let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "io.github.gop9632.foodmap", kSecAttrAccount as String: "session"]

    static func read() -> Data? {
        var r: AnyObject?
        let st = SecItemCopyMatching(q.merging([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]) { $1 } as CFDictionary, &r)
        return st == errSecSuccess ? r as? Data : nil
    }

    static func write(_ d: Data?) {
        SecItemDelete(q as CFDictionary)
        guard let d else { return }
        SecItemAdd(q.merging([kSecValueData as String: d, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]) { $1 } as CFDictionary, nil)
    }
}
