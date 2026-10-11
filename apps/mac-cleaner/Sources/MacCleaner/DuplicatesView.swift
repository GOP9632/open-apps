import CryptoKit
import SwiftUI

// MARK: - 掃描

struct DuplicateGroup: Identifiable {
    let id = UUID()
    var files: [CleanItem]
    var fileSize: Int64 { files.first?.size ?? 0 }
    /// 可以省下的空間：同一組只留一份
    var wasted: Int64 { fileSize * Int64(max(files.count - 1, 0)) }
}

enum DuplicateScanner {
    static let minimumSize: Int64 = 1024 * 1024

    /// 先比大小，大小一樣再比開頭 64 KB，最後比整個檔案的 SHA-256。只讀不改。
    static func scan(progress: @escaping @Sendable (String) -> Void) -> [DuplicateGroup] {
        let keys: [URLResourceKey] = [
            .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey,
            .totalFileAllocatedSizeKey, .contentAccessDateKey, .creationDateKey,
        ]
        guard let e = FileManager.default.enumerator(
            at: Safety.home, includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants],
            errorHandler: { _, _ in true }
        ) else { return [] }

        var bySize: [Int64: [URL]] = [:]
        var counted = 0
        for case let url as URL in e {
            if Task.isCancelled { return [] }
            counted += 1
            if counted % 2000 == 0 { progress("已經看過 \(counted) 個檔案…") }
            if e.level == 1, LargeFileScanner.skipped.contains(url.lastPathComponent) {
                e.skipDescendants(); continue
            }
            if Safety.isProtected(url) { e.skipDescendants(); continue }
            guard let v = try? url.resourceValues(forKeys: Set(keys)),
                  v.isRegularFile == true, v.isSymbolicLink != true,
                  let size = v.fileSize, Int64(size) >= minimumSize else { continue }
            bySize[Int64(size), default: []].append(url)
        }

        let candidates = bySize.filter { $0.value.count > 1 }
        var groups: [DuplicateGroup] = []
        var checked = 0
        for (size, urls) in candidates {
            if Task.isCancelled { return [] }
            checked += 1
            progress("正在比對內容（\(checked)/\(candidates.count)）…")
            // 先用開頭分組，再用完整雜湊確認
            let byHead = Dictionary(grouping: urls) { hash($0, limit: 64 * 1024) ?? UUID().uuidString }
            for (_, sameHead) in byHead where sameHead.count > 1 {
                let byFull = Dictionary(grouping: sameHead) { hash($0, limit: nil) ?? UUID().uuidString }
                for (_, same) in byFull where same.count > 1 {
                    groups.append(makeGroup(same, size: size))
                }
            }
        }
        return groups.sorted { $0.wasted > $1.wasted }
    }

    /// 同一組裡最早建立的那份留著不勾，其他預設勾選。
    private static func makeGroup(_ urls: [URL], size: Int64) -> DuplicateGroup {
        let keys: Set<URLResourceKey> = [.creationDateKey, .contentAccessDateKey]
        let items = urls.map { url -> (CleanItem, Date) in
            let v = try? url.resourceValues(forKeys: keys)
            let item = CleanItem(url: url, name: url.lastPathComponent, size: size,
                                 isSelected: true, lastOpened: v?.contentAccessDate)
            return (item, v?.creationDate ?? .distantFuture)
        }
        .sorted { $0.1 < $1.1 }
        var files = items.map(\.0)
        files[0].isSelected = false
        files[0].note = "最早的一份，預設保留"
        return DuplicateGroup(files: files)
    }

    private static func hash(_ url: URL, limit: Int?) -> String? {
        guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? h.close() }
        var hasher = SHA256()
        var remaining = limit ?? Int.max
        while remaining > 0 {
            if Task.isCancelled { return nil }
            let chunk = (try? h.read(upToCount: min(1024 * 1024, remaining))) ?? nil
            guard let data = chunk, !data.isEmpty else { break }
            hasher.update(data: data)
            remaining -= data.count
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - 畫面

@MainActor
final class DuplicatesModel: ObservableObject {
    @Published var groups: [DuplicateGroup] = []
    @Published var isScanning = false
    @Published var hasScanned = false
    @Published var status = ""
    @Published var result: TrashResult?
    private var task: Task<Void, Never>?

    var selected: [CleanItem] { groups.flatMap { $0.files.filter(\.isSelected) } }

    func scan() {
        isScanning = true
        status = "準備中…"
        result = nil
        task = Task.detached(priority: .userInitiated) {
            let found = DuplicateScanner.scan { s in Task { @MainActor in self.status = s } }
            let cancelled = Task.isCancelled
            await MainActor.run {
                if !cancelled { self.groups = found }
                self.isScanning = false
                self.hasScanned = true
            }
        }
    }

    func cancel() { task?.cancel() }

    func clean() {
        // 安全措施：每一組至少要留一份，全勾的組不動
        var items: [CleanItem] = []
        var skipped = 0
        for g in groups {
            let chosen = g.files.filter(\.isSelected)
            if chosen.count == g.files.count { skipped += 1; continue }
            items += chosen
        }
        Task {
            var r = await Task.detached(priority: .userInitiated) { Trasher.moveToTrash(items) }.value
            if skipped > 0 {
                r.failures.append(("\(skipped) 組", "整組都勾了，為了至少留一份，這幾組沒有動"))
            }
            result = r
            for i in groups.indices {
                groups[i].files.removeAll { !FileManager.default.fileExists(atPath: $0.url.path) }
            }
            groups.removeAll { $0.files.count < 2 }
            NotificationCenter.default.post(name: .didMoveToTrash, object: nil)
        }
    }
}

struct DuplicatesView: View {
    @ObservedObject var model: DuplicatesModel
    @State private var confirming = false

    var body: some View {
        VStack(spacing: 0) {
            if model.isScanning {
                VStack(spacing: 16) {
                    HeroIcon(systemName: "doc.on.doc").symbolEffect(.pulse)
                    Text(model.status).monospacedDigit().foregroundStyle(.white.opacity(0.8))
                    Button("停止", action: model.cancel)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !model.hasScanned {
                ScanPrompt(
                    icon: "doc.on.doc",
                    title: "重複檔案",
                    detail: "在你的家目錄裡找出內容一模一樣的檔案（1 MB 以上）。每組會自動留下最早的那一份。",
                    buttonTitle: "掃描",
                    action: model.scan
                )
            } else {
                if let r = model.result {
                    ResultBanner(result: r) { model.result = nil }.padding([.horizontal, .top], 16)
                }
                if model.groups.isEmpty {
                    VStack(spacing: 12) {
                        HeroIcon(systemName: "checkmark", size: 120)
                        Text("沒有找到重複檔案").font(.title2.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach($model.groups) { $group in
                            Section {
                                ForEach($group.files) { $item in ItemRow(item: $item) }
                            } header: {
                                Text("\(group.files.count) 份相同的檔案，每份 \(formatBytes(group.fileSize))，可省 \(formatBytes(group.wasted))")
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
                BottomBar(
                    selectedCount: model.selected.count,
                    selectedSize: model.selected.reduce(0) { $0 + $1.size },
                    buttonTitle: "移除",
                    action: { confirming = true }
                )
            }
        }
        .navigationTitle("重複檔案")
        .toolbar {
            if model.hasScanned && !model.isScanning {
                Button("重新掃描", systemImage: "arrow.clockwise", action: model.scan)
            }
        }
        .sheet(isPresented: $confirming) {
            ConfirmTrashSheet(items: model.selected, onConfirm: model.clean)
        }
    }
}
