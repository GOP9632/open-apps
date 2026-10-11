import AppKit
import SwiftUI

/// 開發用：設了環境變數 MOP_SNAPSHOT=/某個/路徑.png 時，啟動後把 Mop 自己的視窗存成圖片。
/// 只截 Mop 自己的視窗，不需要螢幕錄影權限；沒設環境變數就完全不作用。
/// MOP_PAGE=junk 之類可以指定開哪一頁，MOP_SNAPSHOT_QUIT=1 存完就結束。
enum DebugSnapshot {
    static var path: String? { ProcessInfo.processInfo.environment["MOP_SNAPSHOT"] }
    static var initialPage: Page? { ProcessInfo.processInfo.environment["MOP_PAGE"].flatMap(Page.init(rawValue:)) }

    static func scheduleIfRequested() {
        guard let path, !path.isEmpty else { return }
        // MOP_WINDOW=920x620 可以指定視窗內容大小，用來測小視窗
        if let size = ProcessInfo.processInfo.environment["MOP_WINDOW"]?.split(separator: "x").compactMap({ Double($0) }),
           size.count == 2 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                guard let w = NSApp.windows.first(where: \.isVisible) else { return }
                let frame = w.frameRect(forContentRect: NSRect(x: 0, y: 0, width: size[0], height: size[1]))
                w.setFrame(NSRect(origin: w.frame.origin, size: frame.size), display: true)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            capture(to: URL(fileURLWithPath: path))
            if ProcessInfo.processInfo.environment["MOP_SNAPSHOT_QUIT"] == "1" { NSApp.terminate(nil) }
        }
    }

    private static func capture(to url: URL) {
        guard let window = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil }),
              let view = window.contentView?.superview ?? window.contentView else { return }
        let fitting = window.contentView?.fittingSize ?? .zero
        print("視窗 \(window.frame.size)，內容 \(window.contentLayoutRect.size)，內容最小 \(fitting)，螢幕可用 \(window.screen?.visibleFrame.size ?? .zero)")
        // 新版 macOS 的側欄是玻璃材質，這種截法畫不出來（會是一片白），
        // 側欄改看下面 report(_:frame:) 印出來的位置
        guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
    }

    /// 除錯時印出某個元件在視窗裡的位置（y 從視窗內容頂端往下算）
    static func report(_ name: String, frame: CGRect) {
        guard path != nil else { return }
        print("\(name)：y \(Int(frame.minY)) 到 \(Int(frame.maxY))")
    }
}

extension View {
    /// 只有設了 MOP_SNAPSHOT 才會印位置，平常不作用
    @ViewBuilder func debugFrame(_ name: String) -> some View {
        if DebugSnapshot.path != nil {
            onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { DebugSnapshot.report(name, frame: $0) }
        } else {
            self
        }
    }
}
