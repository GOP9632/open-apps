import AppKit
import SwiftUI

@main
struct MacCleanerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup("Mop") {
            ContentView()
                .frame(minWidth: 920, minHeight: 620)
        }
        .windowResizability(.contentMinSize)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // 用 `swift run` 直接跑時也要像一般 App 一樣出現在前面
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

enum Page: String, CaseIterable, Identifiable {
    case smart, junk, large, duplicates, monitor, uninstall, orphans, space
    var id: String { rawValue }
    var title: String {
        switch self {
        case .smart: "智慧掃描"
        case .junk: "系統垃圾"
        case .large: "大型檔案"
        case .duplicates: "重複檔案"
        case .orphans: "App 殘留檔"
        case .monitor: "系統狀態"
        case .uninstall: "解除安裝 App"
        case .space: "空間地圖"
        }
    }
    var icon: String {
        switch self {
        case .smart: "sparkles"
        case .junk: "trash"
        case .large: "doc"
        case .duplicates: "doc.on.doc"
        case .orphans: "shippingbox"
        case .monitor: "gauge.with.dots.needle.67percent"
        case .uninstall: "square.grid.2x2"
        case .space: "chart.pie"
        }
    }

    /// 側欄分組，跟 CleanMyMac 一樣把功能歸到幾個模組底下
    static let groups: [(title: String, pages: [Page])] = [
        ("清理", [.junk, .large, .duplicates]),
        ("效能", [.monitor]),
        ("應用程式", [.uninstall, .orphans]),
        ("空間", [.space]),
    ]
}

struct ContentView: View {
    @State private var section: Page? = .smart
    @StateObject private var junk = JunkModel()
    @StateObject private var large = LargeFilesModel()
    @StateObject private var apps = UninstallModel()
    @StateObject private var monitor = MonitorModel()
    @StateObject private var space = SpaceModel()
    @StateObject private var duplicates = DuplicatesModel()
    @StateObject private var orphans = OrphansModel()
    @State private var volume = DiskUsage.volume()

    private var page: Page { section ?? .smart }

    var body: some View {
        NavigationSplitView {
            List(selection: $section) {
                Label(Page.smart.title, systemImage: Page.smart.icon).tag(Page.smart)
                ForEach(Page.groups, id: \.title) { group in
                    Section(group.title) {
                        ForEach(group.pages) { p in
                            Label(p.title, systemImage: p.icon).tag(p)
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 190, ideal: 210)
            .safeAreaInset(edge: .bottom) { DiskBar(volume: volume).padding(12) }
        } detail: {
            ZStack {
                page.theme.background.ignoresSafeArea()
                VStack(spacing: 0) {
                    // 會掃描檔案的頁面，沒有完整磁碟取用權限時在頂端提示
                    if page != .monitor { FullDiskAccessBanner() }
                    Group {
                        switch page {
                        case .smart: SmartCareView(junk: junk, go: { section = $0 })
                        case .monitor: MonitorView(model: monitor)
                        case .space: SpaceMapView(model: space)
                        case .junk: JunkView(model: junk)
                        case .large: LargeFilesView(model: large)
                        case .uninstall: UninstallView(model: apps)
                        case .duplicates: DuplicatesView(model: duplicates)
                        case .orphans: OrphansView(model: orphans)
                        }
                    }
                }
                .foregroundStyle(.white)
            }
            .animation(.easeInOut(duration: 0.25), value: page)
            .toolbarBackground(.hidden, for: .windowToolbar)
            .onReceive(NotificationCenter.default.publisher(for: .didMoveToTrash)) { _ in
                volume = DiskUsage.volume()
            }
        }
        .preferredColorScheme(.dark)
    }
}

extension Notification.Name {
    static let didMoveToTrash = Notification.Name("didMoveToTrash")
}

struct DiskBar: View {
    let volume: (free: Int64, total: Int64)?

    var body: some View {
        if let v = volume, v.total > 0 {
            VStack(alignment: .leading, spacing: 4) {
                Text("磁碟還剩 \(formatBytes(v.free))").font(.callout.weight(.medium))
                ProgressView(value: Double(v.total - v.free), total: Double(v.total))
                Text("共 \(formatBytes(v.total))").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
