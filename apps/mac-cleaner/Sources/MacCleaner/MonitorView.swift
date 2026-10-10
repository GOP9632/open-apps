import AppKit
import Charts
import SwiftUI

struct AppUsage: Identifiable {
    var id: String { key }
    let key: String          // .app 路徑或執行檔路徑
    let name: String
    var memory: UInt64
    var cpu: Double          // 百分比，多核心可以超過 100
    var isApp: Bool { key.hasSuffix(".app") }
}

struct HistoryPoint: Identifiable {
    let id: Int
    let value: Double
}

@MainActor
final class MonitorModel: ObservableObject {
    @Published var cpu: Double = 0
    @Published var cpuHistory: [HistoryPoint] = []
    @Published var memory: SystemStats.Memory?
    @Published var memoryHistory: [HistoryPoint] = []
    @Published var volume: (free: Int64, total: Int64, purgeable: Int64)?
    @Published var apps: [AppUsage] = []
    @Published var sortByCPU = false

    private var lastTicks: SystemStats.CPUTicks?
    private var lastSamples: [String: SystemStats.ProcessSample] = [:]
    private var lastSampleTime = Date()
    private var tick = 0
    private var loop: Task<Void, Never>?

    static let historyLength = 60   // 每 2 秒一筆，約 2 分鐘

    func start() {
        guard loop == nil else { return }
        loop = Task {
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    private func refresh() async {
        if let t = SystemStats.cpuTicks() {
            if let last = lastTicks, t.total > last.total {
                cpu = Double(t.busy - last.busy) / Double(t.total - last.total) * 100
                append(&cpuHistory, cpu)
            }
            lastTicks = t
        }
        if let m = SystemStats.memory() {
            memory = m
            append(&memoryHistory, Double(m.used) / Double(m.total) * 100)
        }
        volume = Self.readVolume()

        let samples = await Task.detached(priority: .utility) { SystemStats.sampleProcesses() }.value
        let now = Date()
        let elapsed = now.timeIntervalSince(lastSampleTime) * 1_000_000_000
        var list: [AppUsage] = []
        for (key, s) in samples {
            var cpu = 0.0
            if let prev = lastSamples[key], s.cpuNanos >= prev.cpuNanos, elapsed > 0, !lastSamples.isEmpty {
                cpu = Double(s.cpuNanos - prev.cpuNanos) / elapsed * 100
            }
            list.append(AppUsage(key: key, name: SystemStats.displayName(forGroup: key), memory: s.memory, cpu: cpu))
        }
        lastSamples = samples
        lastSampleTime = now
        apps = list
    }

    var topApps: [AppUsage] {
        let sorted = sortByCPU ? apps.sorted { $0.cpu > $1.cpu } : apps.sorted { $0.memory > $1.memory }
        return Array(sorted.prefix(12))
    }

    private func append(_ history: inout [HistoryPoint], _ value: Double) {
        tick += 1
        history.append(HistoryPoint(id: tick, value: value))
        if history.count > Self.historyLength { history.removeFirst(history.count - Self.historyLength) }
    }

    static func readVolume() -> (free: Int64, total: Int64, purgeable: Int64)? {
        let keys: Set<URLResourceKey> = [
            .volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey, .volumeTotalCapacityKey,
        ]
        guard let v = try? Safety.home.resourceValues(forKeys: keys),
              let important = v.volumeAvailableCapacityForImportantUsage,
              let total = v.volumeTotalCapacity else { return nil }
        let plain = Int64(v.volumeAvailableCapacity ?? 0)
        return (important, Int64(total), max(0, important - plain))
    }

    /// 請 App 正常結束（跟按 ⌘Q 一樣，沒存的東西 App 會先問你）。
    func quit(_ usage: AppUsage) -> Bool {
        let url = URL(fileURLWithPath: usage.key).standardizedFileURL
        let running = NSWorkspace.shared.runningApplications.filter { $0.bundleURL?.standardizedFileURL == url }
        guard !running.isEmpty else { return false }
        running.forEach { $0.terminate() }
        return true
    }
}

struct MonitorView: View {
    @ObservedObject var model: MonitorModel
    @State private var quitting: AppUsage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 16) {
                    cpuCard
                    memoryCard
                    diskCard
                }
                appsCard
            }
            .padding(20)
        }
        .navigationTitle("系統狀態")
        .onAppear { model.start() }
        .onDisappear { model.stop() }
        .confirmationDialog(
            "要結束「\(quitting?.name ?? "")」嗎？",
            isPresented: Binding(get: { quitting != nil }, set: { if !$0 { quitting = nil } }),
            presenting: quitting
        ) { app in
            Button("結束") { _ = model.quit(app) }
            Button("取消", role: .cancel) {}
        } message: { _ in
            Text("跟按 ⌘Q 一樣，有沒存的東西 App 會先問你。")
        }
    }

    private var cpuCard: some View {
        Card(title: "CPU", icon: "cpu") {
            Text("\(Int(model.cpu.rounded()))%").font(.system(size: 34, weight: .semibold)).monospacedDigit()
            Text(cpuHint).font(.caption).foregroundStyle(.secondary)
            Sparkline(points: model.cpuHistory, color: .blue)
        }
    }

    private var cpuHint: String {
        switch model.cpu {
        case ..<30: "很輕鬆"
        case ..<70: "有點忙"
        default: "很忙，看下面哪個 App 在用"
        }
    }

    private var memoryCard: some View {
        Card(title: "記憶體", icon: "memorychip") {
            if let m = model.memory {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(formatMemory(m.used)).font(.system(size: 34, weight: .semibold)).monospacedDigit()
                    Text("/ \(formatMemory(m.total))").foregroundStyle(.secondary)
                }
                Label(pressureText(m.pressure), systemImage: "circle.fill")
                    .font(.caption)
                    .foregroundStyle(pressureColor(m.pressure))
                Sparkline(points: model.memoryHistory, color: .purple)
                VStack(alignment: .leading, spacing: 2) {
                    row("App 使用", m.app)
                    row("系統固定", m.wired)
                    row("壓縮", m.compressed)
                    row("快取（隨時可讓出）", m.cached)
                    row("寫到磁碟的置換", m.swap)
                }
                .font(.caption)
            } else {
                Text("讀不到").foregroundStyle(.secondary)
            }
        }
    }

    private var diskCard: some View {
        Card(title: "磁碟", icon: "internaldrive") {
            if let v = model.volume {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(formatBytes(v.free)).font(.system(size: 34, weight: .semibold)).monospacedDigit()
                    Text("可用").foregroundStyle(.secondary)
                }
                ProgressView(value: Double(v.total - v.free), total: Double(max(v.total, 1)))
                Text("共 \(formatBytes(v.total))，已用 \(formatBytes(v.total - v.free))")
                    .font(.caption).foregroundStyle(.secondary)
                if v.purgeable > 0 {
                    Text("其中 \(formatBytes(v.purgeable)) 是 macOS 需要時會自己清掉的空間")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var appsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("最耗資源的 App").font(.headline)
                Spacer()
                Picker("排序", selection: $model.sortByCPU) {
                    Text("依記憶體").tag(false)
                    Text("依 CPU").tag(true)
                }
                .pickerStyle(.segmented)
                .frame(width: 200)
            }
            Text("想讓電腦順一點，最有效的是關掉用不到又很佔資源的 App。系統的程式讀不到，所以不會列出來。")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(model.topApps) { app in
                HStack(spacing: 10) {
                    if app.isApp {
                        Image(nsImage: NSWorkspace.shared.icon(forFile: app.key))
                            .resizable().frame(width: 22, height: 22)
                    } else {
                        Image(systemName: "gearshape").frame(width: 22, height: 22).foregroundStyle(.secondary)
                    }
                    Text(app.name).lineLimit(1)
                    Spacer()
                    Text(String(format: "CPU %.0f%%", app.cpu)).monospacedDigit()
                        .foregroundStyle(.secondary).frame(width: 80, alignment: .trailing)
                    Text(formatMemory(app.memory)).monospacedDigit().frame(width: 90, alignment: .trailing)
                    Button("結束") { quitting = app }
                        .disabled(!app.isApp || app.key.contains("MacCleaner") || app.key.contains("Mop.app"))
                        .controlSize(.small)
                }
                Divider()
            }
        }
        .padding(16)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12))
    }

    private func row(_ label: String, _ value: UInt64) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(formatMemory(value)).monospacedDigit()
        }
    }

    private func pressureText(_ level: Int) -> String {
        switch level {
        case 4: "記憶體吃緊，建議關掉一些 App"
        case 2: "記憶體偏緊"
        default: "記憶體壓力正常"
        }
    }

    private func pressureColor(_ level: Int) -> Color {
        switch level {
        case 4: .red
        case 2: .orange
        default: .green
        }
    }
}

func formatMemory(_ bytes: UInt64) -> String {
    ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .memory)
}

private struct Card<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon).font(.headline)
            content
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(16)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct Sparkline: View {
    let points: [HistoryPoint]
    let color: Color

    var body: some View {
        Chart(points) { p in
            AreaMark(x: .value("時間", p.id), y: .value("%", p.value))
                .foregroundStyle(color.opacity(0.15))
            LineMark(x: .value("時間", p.id), y: .value("%", p.value))
                .foregroundStyle(color)
        }
        .chartYScale(domain: 0...100)
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 50)
    }
}
