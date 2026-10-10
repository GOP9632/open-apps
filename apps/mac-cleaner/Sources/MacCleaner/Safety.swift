import Foundation

/// 安全門：任何東西要移到垃圾桶之前都要先過這裡。
/// 規則寫死在程式裡，掃描結果、使用者勾選都不能繞過。
enum Safety {
    static let home: URL = FileManager.default.homeDirectoryForCurrentUser.standardizedFileURL
    static let library: URL = home.appendingPathComponent("Library")

    /// 家目錄底下絕對不碰的位置（含裡面所有東西）。
    static let protectedInHome: [String] = [
        "Library/Keychains",
        "Library/Mobile Documents",           // iCloud 雲碟
        "Library/CloudStorage",               // Dropbox、Google Drive、OneDrive
        "Library/Mail",
        "Library/Messages",
        "Library/Photos",
        "Library/Calendars",
        "Library/Accounts",
        "Library/Cookies",
        "Library/Safari",
        "Library/Application Support/AddressBook",
        "Library/Application Support/MobileSync",   // iPhone 備份
        "Library/Application Support/CallHistoryDB",
        "Library/Application Support/Mop",          // 自己的清理紀錄
        "Library/Group Containers/group.com.apple",
        "Library/Containers/com.apple",
        "Pictures/Photos Library.photoslibrary",
        ".ssh",
        ".gnupg",
        ".Trash",
    ]

    static let applicationFolders: [URL] = [
        URL(fileURLWithPath: "/Applications"),
        home.appendingPathComponent("Applications"),
    ]

    /// 把路徑整理成絕對、無 `..`、父資料夾的捷徑已解開的樣子。
    /// 項目本身如果是捷徑（symlink），只會移動捷徑，不會跟過去。
    static func canonical(_ url: URL) -> URL {
        let std = url.standardizedFileURL
        let parent = std.deletingLastPathComponent().resolvingSymlinksInPath()
        return parent.appendingPathComponent(std.lastPathComponent)
    }

    static func isInside(_ path: String, _ base: String) -> Bool {
        path == base || path.hasPrefix(base.hasSuffix("/") ? base : base + "/")
    }

    static func isProtected(_ url: URL) -> Bool {
        let path = canonical(url).path
        for rel in protectedInHome {
            let base = home.appendingPathComponent(rel).path
            // "group.com.apple" 這種前綴規則：同名開頭的都算
            if rel.hasSuffix("com.apple") {
                if path.hasPrefix(base) { return true }
            } else if isInside(path, base) {
                return true
            }
        }
        return false
    }

    /// 回傳 nil 代表可以移到垃圾桶；否則回傳拒絕的原因。
    static func reasonToRefuse(_ url: URL) -> String? {
        let target = canonical(url)
        let path = target.path
        let fm = FileManager.default

        guard fm.fileExists(atPath: path) || isSymlink(target) else {
            return "檔案已經不在了"
        }

        // 1. /Applications 或 ~/Applications 裡的非 Apple App
        for folder in applicationFolders {
            let base = folder.resolvingSymlinksInPath().path
            if isInside(path, base) {
                guard target.pathExtension == "app" else { return "應用程式資料夾裡只允許移除 .app" }
                if let id = Bundle(url: target)?.bundleIdentifier, id.hasPrefix("com.apple.") {
                    return "這是 Apple 內建的 App"
                }
                return nil
            }
        }

        // 2. 家目錄底下，至少要在第二層以下
        let homePath = home.path
        guard isInside(path, homePath), path != homePath else {
            return "這個位置不在你的家目錄裡，屬於系統範圍"
        }
        let relative = String(path.dropFirst(homePath.count + 1))
        let depth = relative.split(separator: "/").count
        if depth < 2 {
            return "這是家目錄的第一層資料夾"
        }
        if relative.hasPrefix("Library/"), depth < 3 {
            return "這是資料庫（Library）的第一層資料夾"
        }
        if isProtected(target) {
            return "這是受保護的個人資料（例如密碼、雲端、郵件、照片）"
        }
        return nil
    }

    static func isSymlink(_ url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true
    }
}
