import AppKit
import SwiftUI

@main
struct MacCleanerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup("Mac 清理") {
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
    case junk, large, uninstall
    var id: String { rawValue }
    var title: String {
        switch self {
        case .junk: "系統垃圾"
        case .large: "大型檔案"
        case .uninstall: "解除安裝 App"
        }
    }
    var icon: String {
        switch self {
        case .junk: "trash.circle"
        case .large: "doc.circle"
        case .uninstall: "app.badge.checkmark"
        }
    }
}

struct ContentView: View {
    @State private var section: Page? = .junk
    @StateObject private var junk = JunkModel()
    @StateObject private var large = LargeFilesModel()
    @StateObject private var apps = UninstallModel()
    @State private var volume = DiskUsage.volume()

    var body: some View {
        NavigationSplitView {
            List(Page.allCases, selection: $section) { s in
                Label(s.title, systemImage: s.icon).tag(s)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200)
            .safeAreaInset(edge: .bottom) { DiskBar(volume: volume).padding(12) }
        } detail: {
            Group {
                switch section ?? .junk {
                case .junk: JunkView(model: junk)
                case .large: LargeFilesView(model: large)
                case .uninstall: UninstallView(model: apps)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .didMoveToTrash)) { _ in
                volume = DiskUsage.volume()
            }
        }
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
