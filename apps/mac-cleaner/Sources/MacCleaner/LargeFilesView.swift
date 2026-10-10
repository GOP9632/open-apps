import SwiftUI

@MainActor
final class LargeFilesModel: ObservableObject {
    @Published var items: [CleanItem] = []
    @Published var isScanning = false
    @Published var hasScanned = false
    @Published var checkedCount = 0
    @Published var threshold: Int64 = 100 * 1024 * 1024
    @Published var result: TrashResult?
    private var task: Task<Void, Never>?

    static let thresholds: [Int64] = [50, 100, 500, 1024].map { $0 * 1024 * 1024 }

    var selected: [CleanItem] { items.filter(\.isSelected) }

    func scan() {
        isScanning = true
        checkedCount = 0
        let min = threshold
        // 直接用 detached task，按「停止」時取消才傳得進掃描迴圈
        task = Task.detached(priority: .userInitiated) {
            let found = LargeFileScanner.scan(minimumSize: min) { n in
                Task { @MainActor in self.checkedCount = n }
            }
            let cancelled = Task.isCancelled
            await MainActor.run {
                if !cancelled { self.items = found }
                self.isScanning = false
                self.hasScanned = true
            }
        }
    }

    func cancel() { task?.cancel() }

    func clean() {
        let chosen = selected
        Task {
            let r = await Task.detached(priority: .userInitiated) { Trasher.moveToTrash(chosen) }.value
            let chosenURLs = Set(chosen.map(\.url))
            items.removeAll { chosenURLs.contains($0.url) && !FileManager.default.fileExists(atPath: $0.url.path) }
            result = r
            NotificationCenter.default.post(name: .didMoveToTrash, object: nil)
        }
    }
}

struct LargeFilesView: View {
    @ObservedObject var model: LargeFilesModel
    @State private var confirming = false

    var body: some View {
        VStack(spacing: 0) {
            if model.isScanning {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("已經看過 \(model.checkedCount) 個檔案…").monospacedDigit()
                    Button("停止", action: model.cancel)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !model.hasScanned {
                ScanPrompt(
                    icon: "externaldrive",
                    title: "大型檔案",
                    detail: "在你的家目錄裡找出很大的檔案（會略過系統資料庫和雲端資料夾）。macOS 可能會問能不能讀「桌面」「文件」「下載」，請按允許。找到的檔案預設都不勾。",
                    buttonTitle: "開始掃描",
                    action: model.scan
                )
            } else {
                if let r = model.result {
                    ResultBanner(result: r) { model.result = nil }.padding([.horizontal, .top], 16)
                }
                if model.items.isEmpty {
                    Text("沒有找到超過 \(formatBytes(model.threshold)) 的檔案")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List($model.items) { $item in ItemRow(item: $item) }
                }
                BottomBar(
                    selectedCount: model.selected.count,
                    selectedSize: model.selected.reduce(0) { $0 + $1.size },
                    buttonTitle: "預覽並移到垃圾桶…",
                    action: { confirming = true }
                )
            }
        }
        .navigationTitle("大型檔案")
        .toolbar {
            Picker("至少", selection: $model.threshold) {
                ForEach(LargeFilesModel.thresholds, id: \.self) { Text("大於 \(formatBytes($0))").tag($0) }
            }
            .disabled(model.isScanning)
            if model.hasScanned && !model.isScanning {
                Button("重新掃描", systemImage: "arrow.clockwise", action: model.scan)
            }
        }
        .sheet(isPresented: $confirming) {
            ConfirmTrashSheet(items: model.selected, onConfirm: model.clean)
        }
    }
}
