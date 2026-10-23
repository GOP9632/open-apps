import SwiftUI
import UIKit
import AuthenticationServices
import CryptoKit

// Apple／Google 登入用到的小工具：隨機字串、SHA256、Apple 登入視窗、網頁登入視窗

enum PKCE {
    // 隨機字串（Apple 的 nonce、Google 的 code_verifier 都用這個）
    static func random(_ n: Int = 48) -> String {
        let cs = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var g = SystemRandomNumberGenerator()
        return String((0..<n).map { _ in cs[Int(g.next() % UInt64(cs.count))] })
    }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // (code_verifier, code_challenge)：challenge = base64url(SHA256(verifier))
    static func make() -> (String, String) {
        let v = random(64)
        let d = Data(SHA256.hash(data: Data(v.utf8)))
        let c = d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return (v, c)
    }
}

@MainActor func keyWindow() -> UIWindow {
    let ws = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return ws.compactMap(\.keyWindow).first ?? ws.first?.windows.first ?? UIWindow()
}

// 使用者自己按了取消（Apple 視窗、網頁登入視窗）：不顯示錯誤
func isCancel(_ e: Error) -> Bool {
    if let a = e as? ASAuthorizationError, a.code == .canceled { return true }
    if let w = e as? ASWebAuthenticationSessionError, w.code == .canceledLogin { return true }
    return false
}

// 網頁登入視窗（Google、連結帳號）：用 Safari 已登入的帳號，一點就好
final class WebAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = WebAuth()
    private var session: ASWebAuthenticationSession?

    @MainActor func open(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<URL, Error>) in
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: "bitemap") { u, e in
                if let u { c.resume(returning: u) } else { c.resume(throwing: e ?? Supa.Fail(msg: "登入失敗")) }
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = false
            session = s
            if !s.start() { session = nil; c.resume(throwing: Supa.Fail(msg: "打不開登入頁，請再試一次")) }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { keyWindow() }
    }
}

// Apple 登入視窗（「我的 > 登入方式」連結 Apple 時用；登入畫面用官方的 SignInWithAppleButton）
final class AppleAuth: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    static let shared = AppleAuth()
    private var cont: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?
    private var ctrl: ASAuthorizationController?

    // 回傳 Apple 給的資料；nonce 是原始值（送給 Apple 的是它的 SHA256）
    @MainActor func run(nonce: String, scopes: [ASAuthorization.Scope] = []) async throws -> ASAuthorizationAppleIDCredential {
        let r = ASAuthorizationAppleIDProvider().createRequest()
        r.requestedScopes = scopes
        r.nonce = PKCE.sha256(nonce)
        let c = ASAuthorizationController(authorizationRequests: [r])
        c.delegate = self
        c.presentationContextProvider = self
        ctrl = c
        return try await withCheckedThrowingContinuation { k in
            cont = k
            c.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let a = authorization.credential as? ASAuthorizationAppleIDCredential { cont?.resume(returning: a) }
        else { cont?.resume(throwing: Supa.Fail(msg: "Apple 登入失敗")) }
        cont = nil; ctrl = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        cont?.resume(throwing: error)
        cont = nil; ctrl = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated { keyWindow() }
    }
}

extension ASAuthorizationAppleIDCredential {
    // Apple 只有第一次登入會給名字；中文名照「姓名」的順序
    var name: String? {
        guard let n = fullName else { return nil }
        let s = PersonNameComponentsFormatter.localizedString(from: n, style: .default).trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? nil : s
    }
    var token: String? { identityToken.flatMap { String(data: $0, encoding: .utf8) } }
}

// 登入方式的顯示名稱和圖示
enum LoginKind: String, CaseIterable {
    case email, apple, google
    var name: String { self == .email ? "Email" : self == .apple ? "Apple" : "Google" }
    var icon: String { self == .email ? "envelope.fill" : self == .apple ? "apple.logo" : "g.circle.fill" }
    var color: Color { self == .email ? .sprBlue : self == .apple ? .ink : .sprPink }
}

// Google 按鈕（白底、Google 的「G」）
struct GoogleButton: View {
    let busy: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text("G").font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundStyle(LinearGradient(colors: [Color(red: 0.26, green: 0.52, blue: 0.96), Color(red: 0.92, green: 0.26, blue: 0.21),
                                                             Color(red: 0.98, green: 0.74, blue: 0.02), Color(red: 0.2, green: 0.66, blue: 0.33)],
                                                    startPoint: .topLeading, endPoint: .bottomTrailing))
                Text(busy ? "登入中…" : "使用 Google 登入").font(.system(size: 17, weight: .semibold)).foregroundStyle(.black.opacity(0.85))
            }
            .frame(maxWidth: .infinity).frame(height: 52)
            .background(.white, in: .rect(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.black.opacity(0.15), lineWidth: 1))
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }
}
