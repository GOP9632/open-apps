import AppKit
import SwiftUI

@MainActor
final class UninstallModel: ObservableObject {
    @Published var apps: [InstalledApp] = []
    @Published var selection: InstalledApp.ID?
    @Published var leftovers: [CleanItem] = []
    @Published var isLoadingApps = false
    @Published var isLoadingLeftovers = false
    @Published var result: TrashResult?
    @Published var search = ""

    var selectedApp: InstalledApp? { apps.first { $0.id == selection } }
    var chosen: [CleanItem] { leftovers.filter(\.isSelected) }
    var filtered: [InstalledApp] {
        search.isEmpty ? apps : apps.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    func loadApps() {
        guard !isLoadingApps else { return }
        isLoadingApps = true
        Task {
            let list = await Task.detached { AppScanner.installedApps() }.value
            apps = list
            isLoadingApps = false
            // 大小慢慢算，算好一個就更新一個
            for app in list {
                let size = await Task.detached(priority: .utility) { DiskUsage.size(of: app.url) }.value
                if let i = apps.firstIndex(where: { $0.id == app.id }) { apps[i].size = size }
            }
        }
    }

    func select(_ id: InstalledApp.ID?) {
        selection = id
        leftovers = []
        guard let app = selectedApp else { return }
        isLoadingLeftovers = true
        Task {
            let found = await Task.detached { AppScanner.leftovers(for: app) }.value
            if selection == app.id { leftovers = found }
            isLoadingLeftovers = false
        }
    }

    func isRunning(_ app: InstalledApp) -> Bool {
        guard let id = app.bundleID else { return false }
        return RunningApps.bundleIDs().contains(id)
    }

    func uninstall() {
        guard let app = selectedApp else { return }
        let items = chosen
        Task {
            let r = await Task.detached(priority: .userInitiated) { Trasher.moveToTrash(items) }.value
            result = r
            NotificationCenter.default.post(name: .didMoveToTrash, object: nil)
            if !FileManager.default.fileExists(atPath: app.url.path) {
                apps.removeAll { $0.id == app.id }
                selection = nil
                leftovers = []
            } else {
                select(app.id)
            }
        }
    }
}

struct UninstallView: View {
    @ObservedObject var model: UninstallModel
    @State private var confirming = false

    var body: some View {
        // 不用 HSplitView：它的最小寬度加上側欄會把整個視窗內容擠出畫面
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                TextField("搜尋 App", text: $model.search)
                    .textFieldStyle(.roundedBorder)
                    .padding(10)
                List(model.filtered, selection: Binding(get: { model.selection }, set: { model.select($0) })) { app in
                    HStack {
                        Image(nsImage: NSWorkspace.shared.icon(forFile: app.url.path))
                            .resizable().frame(width: 24, height: 24)
                        Text(app.name).lineLimit(1)
                        Spacer()
                        Text(app.size.map(formatBytes) ?? "…").font(.caption).foregroundStyle(.secondary)
                    }
                    .tag(app.id)
                }
                .overlay { if model.isLoadingApps { ProgressView() } }
            }
            .frame(width: 280)

            Divider()

            detail.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle("解除安裝 App")
        .onAppear { if model.apps.isEmpty { model.loadApps() } }
        .sheet(isPresented: $confirming) {
            ConfirmTrashSheet(items: model.chosen, onConfirm: model.uninstall)
        }
    }

    @ViewBuilder private var detail: some View {
        VStack(spacing: 0) {
            if let r = model.result {
                ResultBanner(result: r) { model.result = nil }.padding([.horizontal, .top], 16)
            }
            if let app = model.selectedApp {
                HStack(spacing: 12) {
                    Image(nsImage: NSWorkspace.shared.icon(forFile: app.url.path))
                        .resizable().frame(width: 48, height: 48)
                    VStack(alignment: .leading) {
                        Text(app.name).font(.title2.weight(.semibold))
                        Text(app.bundleID ?? "沒有 Bundle ID").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(16)
                if model.isRunning(app) {
                    Label("這個 App 正在執行，請先結束它再移除。", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange).padding(.horizontal, 16)
                }
                if model.isLoadingLeftovers {
                    ProgressView("正在找殘留檔案…").frame(maxHeight: .infinity)
                } else {
                    List($model.leftovers) { $item in ItemRow(item: $item) }
                }
                BottomBar(
                    selectedCount: model.chosen.count,
                    selectedSize: model.chosen.reduce(0) { $0 + $1.size },
                    buttonTitle: "預覽並移除…",
                    action: { confirming = true }
                )
                .disabled(model.isRunning(app))
            } else {
                Text("從左邊選一個 App，會列出它本體和留在電腦裡的殘留檔案。Apple 內建的 App 不會出現在這裡。")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(40)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}
