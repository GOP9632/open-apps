import AppKit
import SwiftUI

/// 「完整磁碟取用權限」。沒有的話，讀其他 App 的資料（~/Library/Containers 等）
/// macOS 會一直跳「Mop 想取用其他 App 的資料」，所以掃描時改成只看名稱、不進去算大小。
enum FullDiskAccess {
    private final class Cache: @unchecked Sendable {
        let lock = NSLock()
        var value = false
        var checkedAt = Date.distantPast
    }
    private static let cache = Cache()

    /// 有沒有權限。用讀不到也不會跳視窗的位置來試（系統的隱私權資料庫）。
    /// 結果記 5 秒，掃描時每個檔案都會問一次。
    static var isGranted: Bool {
        cache.lock.lock()
        defer { cache.lock.unlock() }
        if Date().timeIntervalSince(cache.checkedAt) < 5 { return cache.value }
        cache.value = probe()
        cache.checkedAt = Date()
        return cache.value
    }

    private static func probe() -> Bool {
        let tcc = Safety.library.appendingPathComponent("Application Support/com.apple.TCC/TCC.db")
        if let h = try? FileHandle(forReadingFrom: tcc) {
            try? h.close()
            return true
        }
        return false
    }

    static func recheck() -> Bool {
        cache.lock.lock()
        cache.checkedAt = .distantPast
        cache.lock.unlock()
        return isGranted
    }

    private static let protectedRoots = ["Containers", "Group Containers"].map {
        Safety.library.appendingPathComponent($0).path + "/"
    }

    /// 是不是別的 App 的容器（或裡面的東西）。容器資料夾本身的名稱可以列，內容不能讀。
    static func isOtherAppData(_ url: URL) -> Bool {
        let path = url.standardizedFileURL.path
        for root in protectedRoots where path.hasPrefix(root) {
            let name = path.dropFirst(root.count).split(separator: "/").first.map(String.init) ?? ""
            return !name.isEmpty && name != JunkScanner.ownBundleID
        }
        return false
    }

    /// 沒有權限時，這個位置的內容要跳過
    static func shouldSkipContents(_ url: URL) -> Bool {
        isOtherAppData(url) && !isGranted
    }

    static func openSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles") {
            NSWorkspace.shared.open(url)
        }
    }
}

/// 頁面頂端的提示條。有權限就不顯示。
struct FullDiskAccessBanner: View {
    @State private var granted = FullDiskAccess.isGranted

    var body: some View {
        Group {
            if !granted {
                HStack(spacing: 12) {
                    Image(systemName: "lock.shield").font(.title2)
                    // 不要用 fixedSize(vertical:)：HStack 可能給文字很窄的寬度，文字會長得非常高，
                    // 把整個視窗的內容撐到比視窗還高，側欄上下都被裁掉
                    VStack(alignment: .leading, spacing: 2) {
                        Text("打開「完整磁碟取用權限」，掃描就不會一直跳視窗").font(.callout.weight(.semibold))
                            .lineLimit(1).minimumScaleFactor(0.8)
                        Text("允許一次，之後不會再問。到系統設定把 Mop 的開關打開，再回來就好。沒打開時，其他 App 的資料只會列名稱、不算大小。")
                            .font(.caption).foregroundStyle(.white.opacity(0.75))
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button("打開系統設定") { FullDiskAccess.openSettings() }
                        .controlSize(.large)
                        .fixedSize()
                }
                .padding(14)
                .glassCard()
                .padding([.horizontal, .top], 16)
            }
        }
        .onAppear { granted = FullDiskAccess.recheck() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            granted = FullDiskAccess.recheck()
        }
    }
}
