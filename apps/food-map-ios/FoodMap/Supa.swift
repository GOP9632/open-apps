import Foundation

// 直接用 Supabase 的 REST API（不裝 SDK，編譯快、App 小）
// 網址和 publishable key 跟網頁版 config.js 一樣，本來就是公開用的
enum Supa {
    static let url = URL(string: "https://ptocokzxpwwautnbbuup.supabase.co")!
    static let key = "sb_publishable_p_eT8zA9iEEITNyUFslSpQ_BU62SO9n"

    struct Session: Codable {
        var access_token: String
        var refresh_token: String
        var expires_at: Double?
        var user: User
    }
    struct User: Codable { let id: String; let email: String? }
    struct Fail: LocalizedError { let msg: String; var errorDescription: String? { msg } }

    static var session: Session? = {
        guard let d = UserDefaults.standard.data(forKey: "food.session") else { return nil }
        return try? JSONDecoder().decode(Session.self, from: d)
    }() {
        didSet { UserDefaults.standard.set(session.flatMap { try? JSONEncoder().encode($0) }, forKey: "food.session") }
    }

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
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw Fail(msg: message(d, "登入失敗")) }
        return try JSONDecoder().decode(Session.self, from: d)
    }

    // 憑證快過期就換新的（跟網頁版的 supabase-js 一樣）
    static func fresh() async throws -> Session {
        guard var s = session else { throw Fail(msg: "請先登入") }
        if let exp = s.expires_at, exp - Date().timeIntervalSince1970 < 60 {
            s = try await auth("token?grant_type=refresh_token", ["refresh_token": s.refresh_token])
            session = s
        }
        return s
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
