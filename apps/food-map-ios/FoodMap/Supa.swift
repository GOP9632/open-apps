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

    // ----- Apple／Google 登入（不裝 SDK：Apple 用系統的 Sign in with Apple，Google 走 Supabase 的網頁登入＋PKCE）-----

    static let callback = "bitemap://login-callback"

    // 後台開了哪些登入方式（{"external":{"apple":true,"google":false,…}}）；還沒開的按鈕先不顯示
    static func providers() async throws -> Set<String> {
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/settings")!)
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.cachePolicy = .reloadIgnoringLocalCacheData
        let (d, _) = try await URLSession.shared.data(for: r)
        let j = try JSONSerialization.jsonObject(with: d) as? [String: Any]
        let ex = j?["external"] as? [String: Any] ?? [:]
        return Set(ex.compactMap { k, v in (v as? Bool) == true ? k : nil })
    }

    // Apple：拿 Apple 給的 id_token 換 Supabase 的登入憑證（nonce 是沒雜湊過的原始值）
    static func signInApple(idToken: String, nonce: String) async throws {
        session = try await auth("token?grant_type=id_token", ["provider": "apple", "id_token": idToken, "nonce": nonce])
    }

    // Google：開 Supabase 的登入頁（裡面轉去 Google），回到 bitemap://login-callback?code=… 再換憑證
    static func signInGoogle() async throws {
        let (verifier, challenge) = PKCE.make()
        var c = URLComponents(string: "\(url.absoluteString)/auth/v1/authorize")!
        c.queryItems = [.init(name: "provider", value: "google"), .init(name: "redirect_to", value: callback),
                        .init(name: "code_challenge", value: challenge), .init(name: "code_challenge_method", value: "s256")]
        let back = try await WebAuth.shared.open(c.url!)
        let ac = try code(back)
        session = try await auth("token?grant_type=pkce", ["auth_code": ac, "code_verifier": verifier])
    }

    // 已登入時再連一個 Google：跟 Supabase 拿連結用的網址，一樣開網頁，回來換憑證（還是同一個帳號）
    static func linkGoogle() async throws {
        let s = try await fresh()
        let (verifier, challenge) = PKCE.make()
        var c = URLComponents(string: "\(url.absoluteString)/auth/v1/user/identities/authorize")!
        c.queryItems = [.init(name: "provider", value: "google"), .init(name: "redirect_to", value: callback),
                        .init(name: "skip_http_redirect", value: "true"),
                        .init(name: "code_challenge", value: challenge), .init(name: "code_challenge_method", value: "s256")]
        var r = URLRequest(url: c.url!)
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        let (d, res) = try await URLSession.shared.data(for: r)
        let code0 = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code0 == 200 else { throw Fail(msg: message(d, "連結失敗"), code: code0) }
        struct R: Decodable { let url: String }
        guard let u = URL(string: try JSONDecoder().decode(R.self, from: d).url) else { throw Fail(msg: "連結失敗") }
        let back = try await WebAuth.shared.open(u)
        let ac = try code(back)
        session = try await auth("token?grant_type=pkce", ["auth_code": ac, "code_verifier": verifier])
    }

    // 已登入時再連一個 Apple：用 Apple 給的 id_token，帶 link_identity（不用開網頁）
    static func linkApple(idToken: String, nonce: String) async throws {
        let s = try await fresh()
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/token?grant_type=id_token")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["provider": "apple", "id_token": idToken, "nonce": nonce, "link_identity": true] as [String: Any])
        let (d, res) = try await URLSession.shared.data(for: r)
        let code0 = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code0 == 200 else { throw Fail(msg: message(d, "連結失敗"), code: code0) }
        if let n = try? JSONDecoder().decode(Session.self, from: d) { session = n }
    }

    // 這個帳號連了哪些登入方式（email／apple／google）和各自的信箱
    static func identities() async throws -> [(provider: String, email: String?)] {
        let s = try await fresh()
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/user")!)
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        r.cachePolicy = .reloadIgnoringLocalCacheData
        let (d, res) = try await URLSession.shared.data(for: r)
        let code0 = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code0 == 200 else { throw Fail(msg: message(d, "讀不到登入方式"), code: code0) }
        let j = try JSONSerialization.jsonObject(with: d) as? [String: Any]
        let ids = j?["identities"] as? [[String: Any]] ?? []
        return ids.compactMap { i -> (provider: String, email: String?)? in
            guard let p = i["provider"] as? String else { return nil }
            return (p, (i["identity_data"] as? [String: Any])?["email"] as? String ?? i["email"] as? String)
        }
    }

    // 名字寫進帳號資料（跟 Email 註冊時一樣放在 user metadata 的 name）
    static func setName(_ name: String) async throws {
        let s = try await fresh()
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/auth/v1/user")!)
        r.httpMethod = "PUT"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["data": ["name": name]])
        let (d, res) = try await URLSession.shared.data(for: r)
        let code0 = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code0 == 200 else { throw Fail(msg: message(d, "存名字失敗"), code: code0) }
    }

    // bitemap://login-callback?code=…（失敗時是 error_description，可能在 ? 或 # 後面）
    private static func code(_ back: URL) throws -> String {
        let c = URLComponents(url: back, resolvingAgainstBaseURL: false)
        var items = c?.queryItems ?? []
        if let f = c?.fragment { items += URLComponents(string: "?" + f)?.queryItems ?? [] }
        if let v = items.first(where: { $0.name == "code" })?.value { return v }
        let e = items.first { $0.name == "error_description" }?.value ?? items.first { $0.name == "error" }?.value ?? ""
        throw Fail(msg: message(Data(), "登入失敗", raw: e.replacingOccurrences(of: "+", with: " ")))
    }

    private static func message(_ d: Data, _ fallback: String, raw: String? = nil) -> String {
        let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
        let m = raw ?? (j?["msg"] ?? j?["error_description"] ?? j?["message"]) as? String ?? ""
        let ec = j?["error_code"] as? String ?? ""
        if ec == "identity_already_exists" || m.contains("already linked") || m.contains("already exists") && m.lowercased().contains("identity") {
            return "這個帳號已經連在另一個 Bitemap 帳號上了"
        }
        if ec == "manual_linking_disabled" || m.lowercased().contains("manual linking") { return "帳號連結還沒開放，請稍後再試" }
        if ec == "provider_disabled" || m.contains("provider is not enabled") || m.contains("Unsupported provider") { return "這個登入方式還沒開放，請先用 Email 登入" }
        if m.lowercased().contains("nonce") { return "Apple 登入驗證失敗，請再試一次" }
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
        // 剩不到 10 分鐘就先換（回到前景時也會在背景先換好），請求不用等換憑證
        guard let exp = s.expires_at, exp - Date().timeIntervalSince1970 < 600 else { return s }
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
        } catch where exp - Date().timeIntervalSince1970 > 30 {
            // 提早換沒換成（網路不好），舊的還能用就先用
            return s
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
            throw Fail(msg: (j?["message"] as? String) ?? "存檔失敗（\(code)）", code: code)
        }
        return d
    }

    static func rpc<T: Decodable>(_ fn: String, _ args: [String: AnyCodable], as: T.Type) async throws -> T {
        let d = try await write("POST", "rpc/\(fn)", body: args)
        return try JSONDecoder().decode(T.self, from: d)
    }

    // IG Reel 的影片網址（IG 的網址會過期，ReelCache 記到期前 5 分鐘）
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
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        print("[reel] reel-video \(code) \(String(decoding: d.prefix(160), as: UTF8.self))")
        guard code == 200 else { return nil }
        struct R: Decodable { let video: String? }
        return (try? JSONDecoder().decode(R.self, from: d))?.video.flatMap(URL.init(string:))
    }

    // App 裡的新增：一樣的雲端函式，多帶 format:"json"，直接回存好的那幾筆（不用整份重新同步）
    // 回傳（訊息、存好的店）；雲端回的不是 JSON 就只有訊息
    static func quickAddJSON(key qk: String, input: String) async throws -> (String, [Place]) {
        var r = URLRequest(url: URL(string: "\(url.absoluteString)/functions/v1/quick-add")!)
        r.httpMethod = "POST"
        r.setValue(key, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(["key": qk, "input": input, "format": "json"])
        r.timeoutInterval = 60
        let (d, res) = try await URLSession.shared.data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        struct R: Decodable { let message: String?; let places: [Place]? }
        if let j = try? JSONDecoder().decode(R.self, from: d), j.message != nil || j.places != nil {
            return (j.message ?? "", j.places ?? [])
        }
        guard code == 200 else { throw Fail(msg: "雲端暫時出錯（\(code)），請再試一次") }
        return (String(data: d, encoding: .utf8) ?? "", [])
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
