import AppKit
import SwiftUI

// MARK: - 掃描：App 已經刪了，資料還留在 ~/Library

struct OrphanGroup: Identifiable {
    var id: String { bundleID }
    let bundleID: String
    var items: [CleanItem]
    var size: Int64 { items.reduce(0) { $0 + $1.size } }
    var selectedSize: Int64 { items.filter(\.isSelected).reduce(0) { $0 + $1.size } }
}

enum OrphanScanner {
    /// 會用 bundle ID 命名資料夾或檔案的位置
    static let folders = [
        "Application Support", "Caches", "Containers", "Preferences",
        "Saved Application State", "Logs", "HTTPStorages", "WebKit", "Application Scripts",
    ]

    /// 這些前綴是系統或共用元件，不是某個 App 自己的
    static let ignoredPrefixes = [
        "com.apple.", "group.com.apple.", "apple.", "io.github.gop9632.",
        "com.google.Keystone", "com.microsoft.autoupdate", "com.microsoft.shared",
        "org.sparkle-project.", "com.adobe.acc", "com.crashlytics",
    ]

    static func scan() -> [OrphanGroup] {
        let installed = AppScanner.installedApps().compactMap(\.bundleID).map { $0.lowercased() }
        let installedSet = Set(installed)
        // 公司前綴，例如 com.google、us.zoom：同一家還有 App 裝著，就不算殘留
        let vendors = Set(installed.map(vendor))
        let running = RunningApps.bundleIDs().map { $0.lowercased() }

        var found: [String: [URL]] = [:]
        for folder in folders {
            for url in DiskUsage.children(of: Safety.library.appendingPathComponent(folder)) {
                var name = url.lastPathComponent
                if name.hasSuffix(".plist") { name = String(name.dropLast(6)) }
                if name.hasSuffix(".savedState") { name = String(name.dropLast(11)) }
                if name.hasSuffix(".binarycookies") { name = String(name.dropLast(14)) }
                guard looksLikeBundleID(name) else { continue }
                let id = name.lowercased()
                if ignoredPrefixes.contains(where: { id.hasPrefix($0.lowercased()) }) { continue }
                if installedSet.contains(id) || installed.contains(where: { id.hasPrefix($0 + ".") }) { continue }
                if vendors.contains(vendor(id)) { continue }
                if running.contains(where: { $0 == id || id.hasPrefix($0 + ".") }) { continue }
                // 系統還找得到這個 App（可能裝在別的地方）就跳過
                if NSWorkspace.shared.urlForApplication(withBundleIdentifier: name) != nil { continue }
                if Safety.reasonToRefuse(url) != nil { continue }
                found[name, default: []].append(url)
            }
        }

        return found.map { id, urls in
            let items = urls.map { url in
                CleanItem(url: url, name: url.lastPathComponent, size: DiskUsage.size(of: url), isSelected: true,
                          note: FullDiskAccess.shouldSkipContents(url) ? "沒有完整磁碟取用權限，算不出大小" : nil,
                          explanation: "在「\(url.deletingLastPathComponent().lastPathComponent)」裡")
            }
            return OrphanGroup(bundleID: id, items: items.sorted { $0.size > $1.size })
        }
        .filter { $0.size > 0 || $0.items.contains { FullDiskAccess.shouldSkipContents($0.url) } }
        .sorted { $0.size > $1.size }
    }

    /// 像 com.company.app 這種反向網域名稱
    static func looksLikeBundleID(_ s: String) -> Bool {
        let parts = s.split(separator: ".")
        guard parts.count >= 3, !s.contains(" ") else { return false }
        return ["com", "org", "net", "io", "app", "dev", "co", "us", "jp", "tw", "de", "ru", "me", "cn"]
            .contains(parts[0].lowercased())
    }

    static func vendor(_ id: String) -> String {
        id.split(separator: ".").prefix(2).joined(separator: ".")
    }
}

// MARK: - 畫面

@MainActor
final class OrphansModel: ObservableObject {
    @Published var groups: [OrphanGroup] = []
    @Published var isScanning = false
    @Published var hasScanned = false
    @Published var result: TrashResult?

    var selected: [CleanItem] { groups.flatMap { $0.items.filter(\.isSelected) } }

    func scan() {
        isScanning = true
        result = nil
        Task {
            let found = await Task.detached(priority: .userInitiated) { OrphanScanner.scan() }.value
            groups = found
            isScanning = false
            hasScanned = true
        }
    }

    func clean() {
        let items = selected
        Task {
            let r = await Task.detached(priority: .userInitiated) { Trasher.moveToTrash(items) }.value
            result = r
            for i in groups.indices {
                groups[i].items.removeAll { !FileManager.default.fileExists(atPath: $0.url.path) }
            }
            groups.removeAll { $0.items.isEmpty }
            NotificationCenter.default.post(name: .didMoveToTrash, object: nil)
        }
    }
}

struct OrphansView: View {
    @ObservedObject var model: OrphansModel
    @State private var confirming = false

    var body: some View {
        VStack(spacing: 0) {
            if model.isScanning {
                VStack(spacing: 16) {
                    HeroIcon(systemName: "shippingbox").symbolEffect(.pulse)
                    Text("正在找已刪 App 留下的資料…").foregroundStyle(.white.opacity(0.8))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !model.hasScanned {
                ScanPrompt(
                    icon: "shippingbox",
                    title: "App 殘留檔",
                    detail: "App 拖到垃圾桶之後，設定檔、快取、資料常常還留在電腦裡。這裡找出那些 App 已經不在的殘留。同一家公司還有 App 裝著的，會略過不列。",
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
                        Text("沒有找到殘留檔").font(.title2.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach($model.groups) { $group in
                            OrphanSection(group: $group)
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
        .navigationTitle("App 殘留檔")
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

private struct OrphanSection: View {
    @Binding var group: OrphanGroup
    @State private var expanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            ForEach($group.items) { $item in ItemRow(item: $item) }
        } label: {
            HStack(spacing: 10) {
                Toggle(sources: $group.items, isOn: \.isSelected) { EmptyView() }
                    .labelsHidden()
                Image(systemName: "app.dashed").font(.title3).foregroundStyle(.white.opacity(0.7))
                VStack(alignment: .leading, spacing: 2) {
                    Text(group.bundleID).font(.headline)
                    Text("\(group.items.count) 個項目").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(formatBytes(group.size)).monospacedDigit()
            }
            .padding(.vertical, 4)
        }
    }
}
