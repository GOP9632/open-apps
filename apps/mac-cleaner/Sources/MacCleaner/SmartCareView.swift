import SwiftUI

/// 仿 CleanMyMac 的「智慧掃描」：一個按鈕看完垃圾、效能、空間，再一鍵清理。
@MainActor
final class SmartCareModel: ObservableObject {
    @Published var memory: SystemStats.Memory?
    @Published var volume: (free: Int64, total: Int64)?
    @Published var heaviest: (name: String, memory: UInt64)?

    func refreshStatus() {
        memory = SystemStats.memory()
        volume = DiskUsage.volume()
        Task {
            let samples = await Task.detached(priority: .utility) { SystemStats.sampleProcesses() }.value
            if let top = samples.max(by: { $0.value.memory < $1.value.memory }) {
                heaviest = (SystemStats.displayName(forGroup: top.key), top.value.memory)
            }
        }
    }
}

struct SmartCareView: View {
    @ObservedObject var junk: JunkModel
    let go: (Page) -> Void
    @StateObject private var model = SmartCareModel()
    @State private var confirming = false

    private var started: Bool { junk.isScanning || junk.hasScanned }

    var body: some View {
        VStack(spacing: 0) {
            if junk.isScanning {
                VStack(spacing: 18) {
                    Spacer()
                    HeroIcon(systemName: "sparkles")
                        .symbolEffect(.pulse)
                    Text("正在檢查你的 Mac…").font(.system(size: 26, weight: .bold))
                    Text("找垃圾檔、看記憶體和磁碟狀態").foregroundStyle(.white.opacity(0.7))
                    ProgressView().controlSize(.large)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !junk.hasScanned {
                ScanPrompt(
                    icon: "sparkles",
                    title: "歡迎使用 Mop",
                    detail: "按一下掃描，看看你的 Mac 有多少垃圾可以清、記憶體和磁碟狀態如何。掃描只會看，不會動任何東西。",
                    buttonTitle: "掃描",
                    action: start
                )
            } else {
                results
            }
        }
        .navigationTitle("智慧掃描")
        .sheet(isPresented: $confirming) {
            ConfirmTrashSheet(items: junk.selected, onConfirm: junk.clean)
        }
    }

    private func start() {
        junk.scan()
        model.refreshStatus()
    }

    private var results: some View {
        VStack(spacing: 22) {
            if let r = junk.result {
                ResultBanner(result: r) { junk.result = nil }.padding(.horizontal, 24)
            }
            Spacer()
            Text("掃描完成").font(.system(size: 30, weight: .bold))
            Text("這是你的 Mac 現在的狀況").foregroundStyle(.white.opacity(0.7))

            HStack(spacing: 16) {
                tile(
                    icon: "trash", title: "清理",
                    value: formatBytes(junk.selected.reduce(0) { $0 + $1.size }),
                    detail: "可以安全清掉的垃圾",
                    button: "檢視細項", page: .junk
                )
                tile(
                    icon: "gauge.with.dots.needle.67percent", title: "效能",
                    value: pressureText,
                    detail: model.heaviest.map { "最佔記憶體：\($0.name) \(formatMemory($0.memory))" } ?? "記憶體使用狀況",
                    button: "看系統狀態", page: .monitor
                )
                tile(
                    icon: "internaldrive", title: "空間",
                    value: model.volume.map { formatBytes($0.free) } ?? "—",
                    detail: "磁碟剩餘空間",
                    button: "看空間地圖", page: .space
                )
            }
            .padding(.horizontal, 24)

            Spacer()
            HStack(spacing: 40) {
                Button("重新掃描", action: start).buttonStyle(.borderless).foregroundStyle(.white.opacity(0.8))
                BigRoundButton(title: "清理", disabled: junk.selected.isEmpty) { confirming = true }
                Button("檢視細項") { go(.junk) }.buttonStyle(.borderless).foregroundStyle(.white.opacity(0.8))
            }
            .padding(.bottom, 28)
        }
    }

    private var pressureText: String {
        switch model.memory?.pressure {
        case 4: "吃緊"
        case 2: "偏緊"
        case .some: "良好"
        case nil: "—"
        }
    }

    private func tile(icon: String, title: String, value: String, detail: String, button: String, page: Page) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon).font(.headline)
            Text(value).font(.system(size: 30, weight: .semibold)).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(detail).font(.callout).foregroundStyle(.white.opacity(0.7))
                .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button(button) { go(page) }
                .buttonStyle(.bordered)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .glassCard(cornerRadius: 18)
    }
}
