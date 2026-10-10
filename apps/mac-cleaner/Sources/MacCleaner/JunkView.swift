import SwiftUI

@MainActor
final class JunkModel: ObservableObject {
    @Published var categories: [JunkCategory] = []
    @Published var isScanning = false
    @Published var hasScanned = false
    @Published var result: TrashResult?

    var selected: [CleanItem] { categories.flatMap { $0.items.filter(\.isSelected) } }

    func scan() {
        isScanning = true
        result = nil
        Task {
            let found = await Task.detached(priority: .userInitiated) { JunkScanner.scan() }.value
            categories = found
            isScanning = false
            hasScanned = true
        }
    }

    func clean() {
        let items = selected
        Task {
            let r = await Task.detached(priority: .userInitiated) { Trasher.moveToTrash(items) }.value
            result = r
            NotificationCenter.default.post(name: .didMoveToTrash, object: nil)
            scan()
            result = r
        }
    }
}

struct JunkView: View {
    @ObservedObject var model: JunkModel
    @State private var confirming = false

    var body: some View {
        VStack(spacing: 0) {
            if model.isScanning {
                ProgressView("正在找可以清的垃圾…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !model.hasScanned {
                ScanPrompt(
                    icon: "sparkles",
                    title: "系統垃圾",
                    detail: "找出 App 快取、記錄檔、開發工具暫存和下載的安裝檔。掃描只會看，不會動任何東西。",
                    buttonTitle: "開始掃描",
                    action: model.scan
                )
            } else {
                if let r = model.result {
                    ResultBanner(result: r) { model.result = nil }.padding([.horizontal, .top], 16)
                }
                List {
                    ForEach($model.categories) { $cat in
                        CategorySection(category: $cat)
                    }
                }
                BottomBar(
                    selectedCount: model.selected.count,
                    selectedSize: model.selected.reduce(0) { $0 + $1.size },
                    buttonTitle: "預覽並清理…",
                    action: { confirming = true }
                )
            }
        }
        .navigationTitle("系統垃圾")
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

private struct CategorySection: View {
    @Binding var category: JunkCategory
    @State private var expanded = false

    private var allSelected: Bool { !category.items.isEmpty && category.items.allSatisfy(\.isSelected) }

    var body: some View {
        Section {
            DisclosureGroup(isExpanded: $expanded) {
                ForEach($category.items) { $item in
                    ItemRow(item: $item)
                }
            } label: {
                HStack(spacing: 10) {
                    Toggle("", isOn: Binding(
                        get: { allSelected },
                        set: { v in for i in category.items.indices { category.items[i].isSelected = v } }
                    ))
                    .labelsHidden()
                    .disabled(category.items.isEmpty)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(category.title).font(.headline)
                        Text(category.explanation).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if category.items.isEmpty {
                        Text("沒有找到").foregroundStyle(.secondary)
                    } else {
                        Text("\(formatBytes(category.selectedSize)) / \(formatBytes(category.totalSize))")
                            .monospacedDigit()
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }
}
