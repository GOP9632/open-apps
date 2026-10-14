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

    private static func auth(_ path: String, _ body: [String: String]) async throws -> Session {
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/\(path)")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(body)
        let (d, res) = try await URLSession.shared.data(for: r)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else {
            let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
            let m = (j?["msg"] ?? j?["error_description"] ?? j?["message"]) as? String
            throw Fail(msg: m == "Invalid login credentials" ? "Email 或密碼不對" : (m ?? "登入失敗"))
        }
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
}
