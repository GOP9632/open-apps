import UIKit
import SwiftUI
import UniformTypeIdentifiers
import UserNotifications

// 分享選單裡的 Bitemap：拿到 IG／網頁連結或一段文字，直接丟給雲端 AI 收藏，不用打開 App
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        // 跟主 App 一樣只有淺色（顏色都是照淺底配的，深色模式會深底深字）
        overrideUserInterfaceStyle = .light
        view.backgroundColor = .clear
        let host = UIHostingController(rootView: ShareCard(model: model))
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        Task { await run() }
    }

    private func run() async {
        guard let key = UserDefaults(suiteName: "group.io.github.gop9632.foodmap")?.string(forKey: "quickKey"), !key.isEmpty else {
            await finish("請先打開 Bitemap 登入一次", ok: false, delay: 2.5)
            return
        }
        guard let input = await sharedInput(), !input.isEmpty else {
            await finish("沒有讀到連結或文字", ok: false, delay: 2)
            return
        }
        // 交給背景上傳，馬上關掉分享選單；存好了會跳通知（ShareUpload.swift）
        do {
            try ShareUpload.shared.send(key: key, input: input)
            // 通知還沒開：存好了也跳不出通知，改說打開 App 就看得到；記一筆，下次打開 App 問要不要開通知
            let st = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            UserDefaults(suiteName: ShareUpload.group)?.set(true, forKey: "sharedOnce")
            await finish(st == .authorized || st == .provisional ? "收到了，存好會通知你" : "收到了，打開 Bitemap 就看得到", ok: true, delay: 0.8)
        } catch {
            // 背景上傳開不起來才在這裡等，最多 15 秒，點一下就關
            model.tapToClose = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
            do {
                let line = try await quickAdd(key: key, input: input)
                let v = ShareUpload.verdict(line)
                await finish(v == .failed ? ShareUpload.say(line) : line, ok: v != .failed, delay: v == .failed ? 2.5 : 1.5)
            } catch {
                await finish("收藏失敗：\(error.localizedDescription)", ok: false, delay: 2.5)
            }
        }
    }

    @MainActor private func finish(_ text: String, ok: Bool, delay: Double) async {
        model.text = text; model.ok = ok; model.done = true
        try? await Task.sleep(for: .seconds(delay))
        extensionContext?.completeRequest(returningItems: nil)
    }

    // 先找連結，沒有連結就拿文字（IG 分享通常給連結，有些 App 只給一段含網址的文字）
    private func sharedInput() async -> String? {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL { return u.absoluteString }
        }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let t = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                return t.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        return nil
    }

    // 跟 App 裡 Supa.quickAdd 同一個雲端函式
    private func quickAdd(key qk: String, input: String) async throws -> String {
        var r = URLRequest(url: URL(string: "https://ptocokzxpwwautnbbuup.supabase.co/functions/v1/quick-add")!)
        r.httpMethod = "POST"
        r.setValue("sb_publishable_p_eT8zA9iEEITNyUFslSpQ_BU62SO9n", forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(["key": qk, "input": input])
        r.timeoutInterval = 15
        let (d, res) = try await URLSession.shared.data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else { throw NSError(domain: "Bitemap", code: code, userInfo: [NSLocalizedDescriptionKey: "雲端暫時出錯（\(code)）"]) }
        return String(data: d, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}

@Observable final class ShareModel {
    var text = "收藏中…"
    var done = false
    var ok = true
    var tapToClose: (() -> Void)?
}

struct ShareCard: View {
    let model: ShareModel

    var body: some View {
        VStack(spacing: 14) {
            if model.done {
                Image(systemName: model.ok ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(model.ok ? Color.orange : Color.red)
            } else {
                ProgressView().controlSize(.large)
            }
            Text(model.text)
                .font(.headline)
                .multilineTextAlignment(.center)
        }
        .padding(28)
        .frame(maxWidth: 300)
        .background(.regularMaterial, in: .rect(cornerRadius: 24))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.25))
        .contentShape(.rect)
        .onTapGesture { model.tapToClose?() }
        .animation(.snappy, value: model.done)
    }
}
