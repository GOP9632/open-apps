import AppKit
import Foundation

struct CleanItem: Identifiable, Hashable {
    let id = UUID()
    let url: URL
    var name: String
    var size: Int64
    var isSelected: Bool
    var note: String? = nil
    var lastOpened: Date? = nil

    /// 顯示用的路徑，家目錄換成 ~
    var displayPath: String {
        let home = Safety.home.path
        let p = url.path
        return p.hasPrefix(home) ? "~" + p.dropFirst(home.count) : p
    }
}

func formatBytes(_ bytes: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
}

enum DiskUsage {
    private static let keys: Set<URLResourceKey> = [
        .isDirectoryKey, .isSymbolicLinkKey, .totalFileAllocatedSizeKey, .fileAllocatedSizeKey,
    ]

    /// 檔案或資料夾實際佔用的空間。讀不到的檔案就略過。
    static func size(of url: URL) -> Int64 {
        guard let v = try? url.resourceValues(forKeys: keys) else { return 0 }
        if v.isSymbolicLink == true { return 0 }
        if v.isDirectory != true {
            return Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
        }
        var total: Int64 = 0
        guard let e = FileManager.default.enumerator(
            at: url, includingPropertiesForKeys: Array(keys), options: [],
            errorHandler: { _, _ in true }
        ) else { return 0 }
        for case let f as URL in e {
            if Task.isCancelled { break }
            guard let rv = try? f.resourceValues(forKeys: keys),
                  rv.isDirectory != true, rv.isSymbolicLink != true else { continue }
            total += Int64(rv.totalFileAllocatedSize ?? rv.fileAllocatedSize ?? 0)
        }
        return total
    }

    static func volume() -> (free: Int64, total: Int64)? {
        let keys: Set<URLResourceKey> = [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey]
        guard let v = try? Safety.home.resourceValues(forKeys: keys),
              let free = v.volumeAvailableCapacityForImportantUsage,
              let total = v.volumeTotalCapacity else { return nil }
        return (free, Int64(total))
    }

    /// 子項目（不含隱藏檔）。讀不到就回傳空陣列。
    static func children(of url: URL) -> [URL] {
        (try? FileManager.default.contentsOfDirectory(
            at: url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        )) ?? []
    }
}

struct TrashResult {
    var movedCount = 0
    var freed: Int64 = 0
    var failures: [(name: String, reason: String)] = []
}

enum Trasher {
    static let logURL = Safety.library
        .appendingPathComponent("Application Support/MacCleaner/清理紀錄.log")

    /// 把項目移到垃圾桶。每個項目都會再過一次安全門。
    static func moveToTrash(_ items: [CleanItem]) -> TrashResult {
        var result = TrashResult()
        var log: [String] = []
        let stamp = ISO8601DateFormatter().string(from: Date())
        for item in items {
            if let reason = Safety.reasonToRefuse(item.url) {
                result.failures.append((item.name, "已略過：\(reason)"))
                continue
            }
            do {
                var out: NSURL?
                try FileManager.default.trashItem(at: item.url, resultingItemURL: &out)
                result.movedCount += 1
                result.freed += item.size
                log.append("\(stamp)\t\(item.url.path)\t→\t\(out?.path ?? "垃圾桶")")
            } catch {
                result.failures.append((item.name, error.localizedDescription))
            }
        }
        appendLog(log)
        return result
    }

    private static func appendLog(_ lines: [String]) {
        guard !lines.isEmpty else { return }
        let fm = FileManager.default
        try? fm.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let text = lines.joined(separator: "\n") + "\n"
        if let h = try? FileHandle(forWritingTo: logURL) {
            h.seekToEndOfFile()
            h.write(Data(text.utf8))
            try? h.close()
        } else {
            try? text.write(to: logURL, atomically: true, encoding: .utf8)
        }
    }

    static func openTrash() {
        NSWorkspace.shared.open(Safety.home.appendingPathComponent(".Trash"))
    }
}

enum RunningApps {
    static func bundleIDs() -> Set<String> {
        Set(NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier))
    }
}
