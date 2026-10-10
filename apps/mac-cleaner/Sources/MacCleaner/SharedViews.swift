import AppKit
import SwiftUI

/// 動手前的預覽清單。只有按「移到垃圾桶」才會真的移動。
struct ConfirmTrashSheet: View {
    let items: [CleanItem]
    let onConfirm: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var total: Int64 { items.reduce(0) { $0 + $1.size } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("確定要把這 \(items.count) 個項目移到垃圾桶嗎？")
                .font(.title3.weight(.semibold))
            Text("共 \(formatBytes(total))。它們會先放在垃圾桶，後悔可以在垃圾桶裡按「放回原處」。")
                .foregroundStyle(.secondary)
            List(items) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name).lineLimit(1)
                        Text(item.displayPath).font(.caption).foregroundStyle(.secondary)
                            .lineLimit(1).truncationMode(.middle)
                    }
                    Spacer()
                    Text(formatBytes(item.size)).monospacedDigit().foregroundStyle(.secondary)
                }
            }
            .frame(minHeight: 260)
            HStack {
                Spacer()
                Button("取消", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("移到垃圾桶") {
                    dismiss()
                    onConfirm()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 620, height: 480)
    }
}

/// 清理完的結果，提醒要清空垃圾桶才會真的空出空間。
struct ResultBanner: View {
    let result: TrashResult
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).font(.title2)
                VStack(alignment: .leading, spacing: 4) {
                    Text("已把 \(result.movedCount) 個項目（\(formatBytes(result.freed))）移到垃圾桶")
                        .font(.headline)
                    Text("確認電腦和 App 都正常之後，清空垃圾桶才會真正空出空間。")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("打開垃圾桶") { Trasher.openTrash() }
                Button { onClose() } label: { Image(systemName: "xmark") }
                    .buttonStyle(.borderless)
            }
            if !result.failures.isEmpty {
                DisclosureGroup("\(result.failures.count) 個項目沒有移動") {
                    ForEach(Array(result.failures.enumerated()), id: \.offset) { _, f in
                        Text("• \(f.name)：\(f.reason)").font(.caption).textSelection(.enabled)
                    }
                }
                .foregroundStyle(.orange)
            }
        }
        .padding(12)
        .glassCard(cornerRadius: 12)
    }
}

struct ItemRow: View {
    @Binding var item: CleanItem
    var showPath = true

    var body: some View {
        HStack(spacing: 10) {
            Toggle("", isOn: $item.isSelected).labelsHidden()
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).lineLimit(1)
                if showPath {
                    Text(item.displayPath).font(.caption).foregroundStyle(.secondary)
                        .lineLimit(1).truncationMode(.middle)
                }
                if let explanation = item.explanation {
                    Text(explanation).font(.caption).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let note = item.note {
                    Text(note).font(.caption).foregroundStyle(.orange)
                }
            }
            Spacer()
            if let d = item.lastOpened {
                Text("上次打開 \(d.formatted(.relative(presentation: .named)))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Text(formatBytes(item.size)).monospacedDigit().frame(minWidth: 80, alignment: .trailing)
            Button {
                NSWorkspace.shared.activateFileViewerSelecting([item.url])
            } label: { Image(systemName: "magnifyingglass") }
                .buttonStyle(.borderless)
                .help("在 Finder 中顯示")
        }
    }
}

struct BottomBar: View {
    let selectedCount: Int
    let selectedSize: Int64
    let buttonTitle: String
    let action: () -> Void

    var body: some View {
        ZStack {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(selectedCount == 0 ? "還沒有勾選任何項目" : formatBytes(selectedSize))
                        .font(.title2.weight(.semibold)).monospacedDigit()
                    if selectedCount > 0 {
                        Text("已勾選 \(selectedCount) 個項目").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            BigRoundButton(title: buttonTitle, size: 78, disabled: selectedCount == 0, action: action)
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
    }
}

/// 仿 CleanMyMac 的模組首頁：大圖示、標題、說明、大圓形按鈕。
struct ScanPrompt: View {
    let icon: String
    let title: String
    let detail: String
    let buttonTitle: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            HeroIcon(systemName: icon)
            Text(title).font(.system(size: 30, weight: .bold))
            Text(detail).font(.title3).foregroundStyle(.white.opacity(0.75))
                .multilineTextAlignment(.center).frame(maxWidth: 520)
            Spacer()
            BigRoundButton(title: buttonTitle, action: action)
                .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
