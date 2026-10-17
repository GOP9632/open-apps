import Foundation
import UserNotifications

// 分享選單收藏：交給 iPhone 的背景下載上傳服務送到雲端，分享選單馬上關，存好再跳通知
// 這個檔案在 App 和分享擴充各放一份（BitemapShare/ShareUpload.swift 內容相同），誰收到結果誰發通知
final class ShareUpload: NSObject, URLSessionDataDelegate {
    static let group = "group.io.github.gop9632.foodmap"
    static let prefix = "io.github.gop9632.foodmap.share."
    static let shared = ShareUpload()

    // 每個背景 session 的工作編號都從 1 開始，所以用「session 代號#編號」當 key
    private var data: [String: Data] = [:]
    private var sessions: [String: URLSession] = [:]
    // App 被叫醒處理背景結果時，系統給的「處理完了」回呼
    private var finished: [String: () -> Void] = [:]
    private let lock = NSLock()

    func setFinished(_ id: String, _ f: @escaping () -> Void) {
        lock.lock(); finished[id] = f; lock.unlock()
    }

    private func key(_ s: URLSession, _ t: URLSessionTask) -> String { "\(s.configuration.identifier ?? "")#\(t.taskIdentifier)" }

    // 分享擴充用：把要收藏的內容寫到共用資料夾，開一個背景上傳
    func send(key: String, input: String) throws {
        let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) ?? FileManager.default.temporaryDirectory
        let file = dir.appendingPathComponent("share-\(UUID().uuidString).json")
        try JSONEncoder().encode(["key": key, "input": input]).write(to: file)
        var r = URLRequest(url: URL(string: "https://ptocokzxpwwautnbbuup.supabase.co/functions/v1/quick-add")!)
        r.httpMethod = "POST"
        r.setValue("sb_publishable_p_eT8zA9iEEITNyUFslSpQ_BU62SO9n", forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let t = session(Self.prefix + UUID().uuidString).uploadTask(with: r, fromFile: file)
        t.taskDescription = file.path
        t.resume()
    }

    // 同一個代號重建 session，系統才會把結果交回來
    @discardableResult func session(_ id: String) -> URLSession {
        lock.lock(); defer { lock.unlock() }
        if let s = sessions[id] { return s }
        let c = URLSessionConfiguration.background(withIdentifier: id)
        c.sharedContainerIdentifier = Self.group
        c.sessionSendsLaunchEvents = true
        c.timeoutIntervalForRequest = 90
        let s = URLSession(configuration: c, delegate: self, delegateQueue: nil)
        sessions[id] = s
        return s
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive d: Data) {
        lock.lock(); data[key(session, dataTask), default: Data()].append(d); lock.unlock()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock(); let d = data.removeValue(forKey: key(session, task)) ?? Data(); lock.unlock()
        if let p = task.taskDescription { try? FileManager.default.removeItem(atPath: p) }
        let code = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        let line = String(data: d, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let ok = error == nil && code == 200 && !line.isEmpty
        let c = UNMutableNotificationContent()
        c.title = ok ? "Bitemap 收藏好了 🍩" : "Bitemap 沒收藏到"
        c.body = ok ? line : (error.map { "網路有問題：\($0.localizedDescription)" } ?? "雲端暫時出錯（\(code)），請再分享一次")
        c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
        DispatchQueue.main.async { NotificationCenter.default.post(name: .shareSaved, object: nil) }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        let id = session.configuration.identifier ?? ""
        lock.lock(); let f = finished.removeValue(forKey: id); sessions[id] = nil; lock.unlock()
        // 先告訴系統處理完了，再關掉這個 session
        DispatchQueue.main.async { f?(); session.finishTasksAndInvalidate() }
    }
}

extension Notification.Name {
    static let shareSaved = Notification.Name("bitemap.shareSaved")
}
