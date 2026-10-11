import AppKit
import Foundation

// MARK: - 系統垃圾

struct JunkCategory: Identifiable {
    let id: String
    let title: String
    let explanation: String
    var items: [CleanItem]

    var totalSize: Int64 { items.reduce(0) { $0 + $1.size } }
    var selectedSize: Int64 { items.filter(\.isSelected).reduce(0) { $0 + $1.size } }
}

enum JunkScanner {
    /// 太小的項目不列出來，免得清單太長。
    static let minimumSize: Int64 = 512 * 1024
    static let ownBundleID = "io.github.gop9632.maccleaner"

    /// Apple 自己在用、清了沒好處或可能出問題的快取。
    static let skippedCacheNames: Set<String> = [
        "CloudKit", "GeoServices", "FamilyCircle", "PassKit", "familycircled",
        "com.crashlytics.data", ownBundleID,
    ]

    static func scan() -> [JunkCategory] {
        let running = RunningApps.bundleIDs()
        let lib = Safety.library
        var result: [JunkCategory] = []

        // App 快取
        var caches: [CleanItem] = []
        for url in DiskUsage.children(of: lib.appendingPathComponent("Caches")) {
            let name = url.lastPathComponent
            if name.hasPrefix("com.apple.") || skippedCacheNames.contains(name) { continue }
            if Task.isCancelled { return [] }
            let size = DiskUsage.size(of: url)
            guard size >= minimumSize else { continue }
            let isRunning = running.contains(name)
            let info = KnownCaches.info(for: name)
            let note: String? = isRunning ? "這個 App 正在執行，建議先關掉再清"
                : info.hasOfflineContent ? "可能有離線下載的內容，預設不勾" : nil
            caches.append(CleanItem(
                url: url, name: appName(forBundleID: name) ?? name, size: size,
                isSelected: !isRunning && !info.hasOfflineContent,
                note: note, explanation: info.explanation
            ))
        }
        result.append(JunkCategory(
            id: "caches", title: "App 快取",
            explanation: "App 為了開得快而存的暫存資料。清掉後 App 會自己重新建立，第一次開可能慢一點。",
            items: caches
        ))

        // 記錄檔
        var logs: [CleanItem] = []
        for url in DiskUsage.children(of: lib.appendingPathComponent("Logs")) {
            if url.lastPathComponent == "Mop" { continue }
            if Task.isCancelled { return [] }
            let size = DiskUsage.size(of: url)
            guard size >= minimumSize else { continue }
            logs.append(CleanItem(url: url, name: url.lastPathComponent, size: size, isSelected: true))
        }
        result.append(JunkCategory(
            id: "logs", title: "記錄檔",
            explanation: "App 和系統寫下的執行紀錄，只有除錯時用得到。",
            items: logs
        ))

        // 開發者暫存
        var dev: [CleanItem] = []
        let devFolders: [(String, String, Bool, String)] = [
            ("Library/Developer/Xcode/DerivedData", "Xcode 編譯暫存", true,
             "Xcode 編譯時產生的中間檔。清掉後下次編譯會比較久，不影響專案原始碼。"),
            ("Library/Developer/Xcode/iOS DeviceSupport", "iPhone 除錯支援檔", true,
             "接 iPhone 除錯時準備的系統檔。下次接上手機時 Xcode 會自動重新準備，要等幾分鐘。"),
            ("Library/Developer/CoreSimulator/Caches", "模擬器快取", true,
             "模擬器的暫存。模擬器裡裝的 App 和資料不在這裡，不受影響。"),
            (".npm/_cacache", "npm 下載快取", false,
             "npm 下載過的套件。專案裡已經裝好的不受影響，下次安裝時重新下載。"),
            (".gradle/caches", "Gradle 快取", false,
             "Gradle 下載的套件和編譯暫存。下次編譯時會重新下載，要等久一點。"),
        ]
        for (rel, label, eachChild, explanation) in devFolders {
            let base = Safety.home.appendingPathComponent(rel)
            guard FileManager.default.fileExists(atPath: base.path) else { continue }
            let targets = eachChild ? DiskUsage.children(of: base) : [base]
            for url in targets {
                if Task.isCancelled { return [] }
                let size = DiskUsage.size(of: url)
                guard size >= minimumSize else { continue }
                let name = url == base ? label : "\(label)：\(url.lastPathComponent)"
                dev.append(CleanItem(url: url, name: name, size: size, isSelected: true, explanation: explanation))
            }
        }
        result.append(JunkCategory(
            id: "dev", title: "開發者暫存",
            explanation: "寫程式的工具留下的暫存檔，需要時會重新產生。",
            items: dev
        ))

        // 下載的安裝檔
        var installers: [CleanItem] = []
        let downloads = Safety.home.appendingPathComponent("Downloads")
        for url in DiskUsage.children(of: downloads)
        where ["dmg", "pkg", "mpkg"].contains(url.pathExtension.lowercased()) {
            let size = DiskUsage.size(of: url)
            let opened = try? url.resourceValues(forKeys: [.contentAccessDateKey]).contentAccessDate
            installers.append(CleanItem(
                url: url, name: url.lastPathComponent, size: size, isSelected: false, lastOpened: opened
            ))
        }
        result.append(JunkCategory(
            id: "installers", title: "下載的安裝檔",
            explanation: "下載資料夾裡的 .dmg 和 .pkg。App 裝好之後通常就用不到了。預設不勾，請自己確認。",
            items: installers
        ))

        return result.map { cat in
            var c = cat
            c.items.sort { $0.size > $1.size }
            return c
        }
    }

    static func appName(forBundleID id: String) -> String? {
        guard id.contains("."),
              let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: id) else { return nil }
        return FileManager.default.displayName(atPath: url.path).replacingOccurrences(of: ".app", with: "")
    }
}

// MARK: - 大型檔案

enum LargeFileScanner {
    /// 掃大型檔案時整個略過的資料夾（家目錄底下的相對路徑）。
    static let skipped: Set<String> = ["Library", "Applications"]

    static func scan(minimumSize: Int64, progress: @escaping @Sendable (Int) -> Void) -> [CleanItem] {
        let keys: [URLResourceKey] = [
            .isRegularFileKey, .isPackageKey, .isSymbolicLinkKey,
            .totalFileAllocatedSizeKey, .fileAllocatedSizeKey, .contentAccessDateKey,
        ]
        guard let e = FileManager.default.enumerator(
            at: Safety.home, includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants],
            errorHandler: { _, _ in true }
        ) else { return [] }

        let homePath = Safety.home.path
        var found: [CleanItem] = []
        var counted = 0
        for case let url as URL in e {
            if Task.isCancelled { break }
            counted += 1
            if counted % 2000 == 0 { progress(counted) }

            if e.level == 1, skipped.contains(url.lastPathComponent) {
                e.skipDescendants()
                continue
            }
            if Safety.isProtected(url) {
                e.skipDescendants()
                continue
            }
            guard let v = try? url.resourceValues(forKeys: Set(keys)),
                  v.isRegularFile == true, v.isSymbolicLink != true else { continue }
            let size = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            guard size >= minimumSize, url.path.hasPrefix(homePath) else { continue }
            found.append(CleanItem(
                url: url, name: url.lastPathComponent, size: size,
                isSelected: false, lastOpened: v.contentAccessDate
            ))
        }
        return found.sorted { $0.size > $1.size }
    }
}

// MARK: - 解除安裝 App

struct InstalledApp: Identifiable, Hashable {
    var id: URL { url }
    let url: URL
    let name: String
    let bundleID: String?
    var size: Int64?
}

enum AppScanner {
    static func installedApps() -> [InstalledApp] {
        var apps: [InstalledApp] = []
        for folder in Safety.applicationFolders {
            for url in DiskUsage.children(of: folder) {
                if url.pathExtension == "app" {
                    if let app = makeApp(url) { apps.append(app) }
                } else if (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true {
                    // 像「/Applications/Adobe Photoshop/」這種包一層資料夾的
                    for inner in DiskUsage.children(of: url) where inner.pathExtension == "app" {
                        if let app = makeApp(inner) { apps.append(app) }
                    }
                }
            }
        }
        return apps.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private static func makeApp(_ url: URL) -> InstalledApp? {
        let id = Bundle(url: url)?.bundleIdentifier
        if let id, id.hasPrefix("com.apple.") { return nil }
        if id == JunkScanner.ownBundleID { return nil }
        let name = FileManager.default.displayName(atPath: url.path)
            .replacingOccurrences(of: ".app", with: "")
        return InstalledApp(url: url, name: name, bundleID: id, size: nil)
    }

    /// App 本體加上它留在 ~/Library 的殘留檔案。
    static func leftovers(for app: InstalledApp) -> [CleanItem] {
        let fm = FileManager.default
        let lib = Safety.library
        var urls: [URL] = []

        func add(_ rel: String) {
            let u = lib.appendingPathComponent(rel)
            if fm.fileExists(atPath: u.path) { urls.append(u) }
        }

        if let id = app.bundleID, !id.isEmpty {
            for rel in [
                "Application Support/\(id)", "Caches/\(id)", "Containers/\(id)",
                "Preferences/\(id).plist", "Saved Application State/\(id).savedState",
                "Logs/\(id)", "HTTPStorages/\(id)", "HTTPStorages/\(id).binarycookies",
                "WebKit/\(id)", "Application Scripts/\(id)",
            ] { add(rel) }

            for (folder, match) in [
                ("Preferences/ByHost", { (n: String) in n.hasPrefix(id + ".") }),
                ("LaunchAgents", { (n: String) in n.hasPrefix(id) && n.hasSuffix(".plist") }),
                ("Group Containers", { (n: String) in n.hasSuffix("." + id) || n == "group." + id }),
            ] as [(String, (String) -> Bool)] {
                for u in DiskUsage.children(of: lib.appendingPathComponent(folder)) where match(u.lastPathComponent) {
                    urls.append(u)
                }
            }
        }

        // 用 App 名稱命名的資料夾（名稱太短就不比對，避免誤判）
        if app.name.count >= 4 {
            for rel in ["Application Support/\(app.name)", "Caches/\(app.name)", "Logs/\(app.name)"] {
                add(rel)
            }
        }

        var seen = Set<String>()
        var items: [CleanItem] = [
            CleanItem(url: app.url, name: "\(app.name)（App 本體）",
                      size: app.size ?? DiskUsage.size(of: app.url), isSelected: true)
        ]
        seen.insert(app.url.path)
        for u in urls where !seen.contains(u.path) && Safety.reasonToRefuse(u) == nil {
            seen.insert(u.path)
            items.append(CleanItem(
                url: u, name: kindLabel(for: u), size: DiskUsage.size(of: u), isSelected: true,
                note: FullDiskAccess.shouldSkipContents(u) ? "沒有完整磁碟取用權限，算不出大小" : nil
            ))
        }
        return items
    }

    private static func kindLabel(for url: URL) -> String {
        let parts = url.path.components(separatedBy: "/Library/")
        let folder = parts.last?.split(separator: "/").first.map(String.init) ?? ""
        let label = [
            "Application Support": "App 資料",
            "Caches": "快取",
            "Containers": "App 容器資料",
            "Group Containers": "共用資料",
            "Preferences": "設定檔",
            "Saved Application State": "視窗狀態",
            "Logs": "記錄檔",
            "HTTPStorages": "網路暫存",
            "WebKit": "網頁暫存",
            "LaunchAgents": "背景啟動項目",
            "Application Scripts": "App 腳本",
        ][folder] ?? folder
        return "\(label)：\(url.lastPathComponent)"
    }
}
