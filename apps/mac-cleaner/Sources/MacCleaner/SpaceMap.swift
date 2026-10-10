import AppKit
import SwiftUI

// MARK: - 資料

final class SpaceNode: Identifiable {
    let id = UUID()
    let url: URL
    let name: String
    var size: Int64
    let isDirectory: Bool
    /// nil 代表還沒展開（太深）或是檔案
    var children: [SpaceNode]?
    weak var parent: SpaceNode?
    var isOther = false

    init(url: URL, name: String, size: Int64, isDirectory: Bool) {
        self.url = url
        self.name = name
        self.size = size
        self.isDirectory = isDirectory
    }

    var canOpen: Bool { isDirectory && !isOther && size > 0 }

    var pathFromRoot: [SpaceNode] {
        var list: [SpaceNode] = [self]
        var p = parent
        while let n = p { list.insert(n, at: 0); p = n.parent }
        return list
    }
}

/// 只保留畫面需要的層數，再深的等點進去時再掃，避免記憶體爆掉。
final class SpaceScanner: @unchecked Sendable {
    static let keepDepth = 4
    static let maxChildren = 120
    /// 掃整顆磁碟時避開會重複計算或不是真正檔案的位置
    static let skipped: Set<String> = ["/System/Volumes", "/Volumes", "/dev", "/private/var/vm", "/cores"]

    private let keys: Set<URLResourceKey> = [
        .isDirectoryKey, .isSymbolicLinkKey, .totalFileAllocatedSizeKey, .fileAllocatedSizeKey,
    ]
    private var counted = 0
    private let progress: @Sendable (Int) -> Void

    init(progress: @escaping @Sendable (Int) -> Void) {
        self.progress = progress
    }

    func scan(_ url: URL) -> SpaceNode {
        build(url, name: FileManager.default.displayName(atPath: url.path), depth: 0)
    }

    private func build(_ url: URL, name: String, depth: Int) -> SpaceNode {
        counted += 1
        if counted % 5000 == 0 { progress(counted) }

        guard let v = try? url.resourceValues(forKeys: keys), v.isSymbolicLink != true else {
            return SpaceNode(url: url, name: name, size: 0, isDirectory: false)
        }
        guard v.isDirectory == true else {
            let size = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            return SpaceNode(url: url, name: name, size: size, isDirectory: false)
        }
        let node = SpaceNode(url: url, name: name, size: 0, isDirectory: true)
        if Self.skipped.contains(url.path) || Task.isCancelled { return node }

        let kids = (try? FileManager.default.contentsOfDirectory(
            at: url, includingPropertiesForKeys: Array(keys), options: []
        )) ?? []
        var built: [SpaceNode] = []
        var total: Int64 = 0
        for k in kids {
            if Task.isCancelled { break }
            let child = build(k, name: k.lastPathComponent, depth: depth + 1)
            total += child.size
            if depth < Self.keepDepth { built.append(child) }
        }
        node.size = total
        if depth < Self.keepDepth {
            node.children = Self.compact(built, parent: node)
        }
        return node
    }

    /// 依大小排序，太多的小東西合成一個「其他」。
    static func compact(_ nodes: [SpaceNode], parent: SpaceNode) -> [SpaceNode] {
        var sorted = nodes.sorted { $0.size > $1.size }
        if sorted.count > maxChildren {
            let rest = sorted[maxChildren...]
            let other = SpaceNode(
                url: parent.url, name: "其他 \(rest.count) 個小項目",
                size: rest.reduce(0) { $0 + $1.size }, isDirectory: false)
            other.isOther = true
            sorted = Array(sorted.prefix(maxChildren)) + [other]
        }
        sorted.forEach { $0.parent = parent }
        return sorted
    }
}

// MARK: - 畫面狀態

@MainActor
final class SpaceModel: ObservableObject {
    @Published var root: SpaceNode?
    @Published var focus: SpaceNode?
    @Published var hovered: SpaceNode?
    @Published var isScanning = false
    @Published var scannedCount = 0
    @Published var result: TrashResult?
    @Published var revision = 0
    private var task: Task<Void, Never>?

    func scan(_ url: URL) {
        task?.cancel()
        isScanning = true
        scannedCount = 0
        result = nil
        let scanner = SpaceScanner { n in Task { @MainActor in self.scannedCount = n } }
        // 直接用 detached task，按「停止」時取消才傳得進掃描迴圈
        task = Task.detached(priority: .userInitiated) {
            let node = scanner.scan(url)
            let cancelled = Task.isCancelled
            await MainActor.run {
                if !cancelled {
                    self.root = node
                    self.focus = node
                }
                self.isScanning = false
            }
        }
    }

    func cancel() { task?.cancel() }

    func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = Safety.home
        panel.prompt = "掃描這裡"
        if panel.runModal() == .OK, let url = panel.url { scan(url) }
    }

    /// 點進一個資料夾。還沒掃到那麼深的話，就地補掃。
    func open(_ node: SpaceNode) {
        guard node.canOpen else { return }
        if node.children == nil {
            isScanning = true
            scannedCount = 0
            let url = node.url
            let scanner = SpaceScanner { n in Task { @MainActor in self.scannedCount = n } }
            task = Task.detached(priority: .userInitiated) {
                let fresh = scanner.scan(url)
                let cancelled = Task.isCancelled
                await MainActor.run {
                    if !cancelled {
                        node.children = fresh.children ?? []
                        node.children?.forEach { $0.parent = node }
                        self.focus = node
                    }
                    self.isScanning = false
                }
            }
        } else {
            focus = node
        }
        hovered = nil
    }

    func goUp() {
        if let p = focus?.parent { focus = p }
    }

    func trash(_ node: SpaceNode) {
        let item = CleanItem(url: node.url, name: node.name, size: node.size, isSelected: true)
        Task {
            let r = await Task.detached(priority: .userInitiated) { Trasher.moveToTrash([item]) }.value
            result = r
            if r.movedCount > 0, let parent = node.parent {
                parent.children?.removeAll { $0 === node }
                var p: SpaceNode? = parent
                while let n = p { n.size -= node.size; p = n.parent }
                revision += 1
            }
            NotificationCenter.default.post(name: .didMoveToTrash, object: nil)
        }
    }
}

// MARK: - 圓環圖

struct Segment {
    let node: SpaceNode
    let depth: Int      // 1 是最內圈
    let start: Double   // 弧度，0 在正上方，順時針
    let end: Double
    let color: Color
}

enum Sunburst {
    static let rings = 4

    static func segments(for focus: SpaceNode) -> [Segment] {
        var out: [Segment] = []
        guard focus.size > 0 else { return out }
        func walk(_ node: SpaceNode, depth: Int, start: Double, span: Double, hue: Double?) {
            guard depth <= rings, let kids = node.children, node.size > 0 else { return }
            var a = start
            for (i, kid) in kids.enumerated() {
                let s = span * Double(kid.size) / Double(node.size)
                defer { a += s }
                if s < 0.004 { continue }
                let h = hue ?? (Double(i) * 0.618).truncatingRemainder(dividingBy: 1)
                let color: Color
                if kid.isOther || !kid.isDirectory {
                    color = Color(white: 0.6 - Double(depth) * 0.04)
                } else {
                    color = Color(hue: h, saturation: 0.55 - Double(depth) * 0.07, brightness: 0.95 - Double(depth) * 0.05)
                }
                out.append(Segment(node: kid, depth: depth, start: a, end: a + s, color: color))
                walk(kid, depth: depth + 1, start: a, span: s, hue: h)
            }
        }
        walk(focus, depth: 1, start: 0, span: 2 * .pi, hue: nil)
        return out
    }

    static func radii(depth: Int, outer: Double) -> (Double, Double) {
        let inner0 = outer * 0.26
        let ring = (outer - inner0) / Double(rings)
        return (inner0 + ring * Double(depth - 1), inner0 + ring * Double(depth))
    }

    /// 回傳點到的區塊；點在中間圓圈回傳 nil 並把 center 設為 true。
    static func hit(_ p: CGPoint, size: CGSize, segments: [Segment]) -> (Segment?, Bool) {
        let c = CGPoint(x: size.width / 2, y: size.height / 2)
        let outer = min(size.width, size.height) / 2 - 8
        let dx = p.x - c.x, dy = p.y - c.y
        let r = (dx * dx + dy * dy).squareRoot()
        if r < radii(depth: 1, outer: outer).0 { return (nil, true) }
        var angle = atan2(dy, dx) + .pi / 2
        if angle < 0 { angle += 2 * .pi }
        for s in segments {
            let (ri, ro) = radii(depth: s.depth, outer: outer)
            if r >= ri, r < ro, angle >= s.start, angle < s.end { return (s, false) }
        }
        return (nil, false)
    }
}

struct SunburstView: View {
    @ObservedObject var model: SpaceModel
    let focus: SpaceNode

    var body: some View {
        let segs = Sunburst.segments(for: focus)
        GeometryReader { geo in
            let size = geo.size
            let outer = min(size.width, size.height) / 2 - 8
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            ZStack {
                Canvas { ctx, _ in
                    for s in segs {
                        let (ri, ro) = Sunburst.radii(depth: s.depth, outer: outer)
                        var path = Path()
                        path.addArc(center: c, radius: ro, startAngle: .radians(s.start - .pi / 2),
                                    endAngle: .radians(s.end - .pi / 2), clockwise: false)
                        path.addArc(center: c, radius: ri, startAngle: .radians(s.end - .pi / 2),
                                    endAngle: .radians(s.start - .pi / 2), clockwise: true)
                        path.closeSubpath()
                        let isHover = model.hovered === s.node
                        ctx.fill(path, with: .color(isHover ? s.color.opacity(0.65) : s.color))
                        ctx.stroke(path, with: .color(Color(nsColor: .windowBackgroundColor)), lineWidth: 1)
                    }
                    let r0 = Sunburst.radii(depth: 1, outer: outer).0
                    let circle = Path(ellipseIn: CGRect(x: c.x - r0, y: c.y - r0, width: r0 * 2, height: r0 * 2))
                    ctx.fill(circle, with: .color(Color(nsColor: .controlBackgroundColor)))
                }
                VStack(spacing: 2) {
                    let shown = model.hovered ?? focus
                    Text(shown.name).font(.headline).lineLimit(2).multilineTextAlignment(.center)
                    Text(formatBytes(shown.size)).font(.title3.weight(.semibold)).monospacedDigit()
                    if model.hovered == nil, focus.parent != nil {
                        Text("點這裡回上一層").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .frame(width: Sunburst.radii(depth: 1, outer: outer).0 * 1.6)
                .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .onContinuousHover { phase in
                switch phase {
                case .active(let p): model.hovered = Sunburst.hit(p, size: size, segments: segs).0?.node
                case .ended: model.hovered = nil
                }
            }
            .gesture(SpatialTapGesture().onEnded { v in
                let (seg, center) = Sunburst.hit(v.location, size: size, segments: segs)
                if center { model.goUp() } else if let seg, seg.node.canOpen { model.open(seg.node) }
            })
        }
    }
}

// MARK: - 頁面

struct SpaceMapView: View {
    @ObservedObject var model: SpaceModel
    @State private var confirmItem: SpaceNode?

    var body: some View {
        VStack(spacing: 0) {
            if model.isScanning {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("已經看過 \(model.scannedCount) 個項目…").monospacedDigit()
                    Button("停止", action: model.cancel)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let focus = model.focus {
                if let r = model.result {
                    ResultBanner(result: r) { model.result = nil }.padding([.horizontal, .top], 16)
                }
                breadcrumb(focus).padding(.horizontal, 16).padding(.top, 10)
                HStack(spacing: 0) {
                    SunburstView(model: model, focus: focus)
                        .id(model.revision)
                        .padding(12)
                        .frame(minWidth: 320, maxWidth: .infinity, maxHeight: .infinity)
                    Divider()
                    childList(focus).frame(width: 320)
                }
            } else {
                ScanPrompt(
                    icon: "chart.pie",
                    title: "空間地圖",
                    detail: "用圓環圖看哪個資料夾最佔空間。越外圈越深層，點一塊就鑽進去，點中間回上一層。只會讀取，不會動任何東西。",
                    buttonTitle: "掃描我的家目錄",
                    action: { model.scan(Safety.home) }
                )
            }
        }
        .navigationTitle("空間地圖")
        .toolbar {
            Button("選擇資料夾…", systemImage: "folder", action: model.chooseFolder)
                .disabled(model.isScanning)
            if model.root != nil && !model.isScanning {
                Button("重新掃描", systemImage: "arrow.clockwise") {
                    if let url = model.root?.url { model.scan(url) }
                }
            }
        }
        .sheet(item: Binding(
            get: { confirmItem.map { IdentifiedNode(node: $0) } },
            set: { confirmItem = $0?.node }
        )) { wrapped in
            let n = wrapped.node
            ConfirmTrashSheet(
                items: [CleanItem(url: n.url, name: n.name, size: n.size, isSelected: true)],
                onConfirm: { model.trash(n) }
            )
        }
    }

    private func breadcrumb(_ focus: SpaceNode) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(focus.pathFromRoot) { n in
                    if n !== focus.pathFromRoot.first { Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.secondary) }
                    Button(n.name) { model.focus = n }
                        .buttonStyle(.link)
                        .disabled(n === focus)
                }
            }
        }
    }

    private func childList(_ focus: SpaceNode) -> some View {
        List(focus.children ?? []) { n in
            HStack(spacing: 8) {
                Image(systemName: n.isOther ? "ellipsis.circle" : n.isDirectory ? "folder.fill" : "doc")
                    .foregroundStyle(n.isDirectory && !n.isOther ? Color.accentColor : .secondary)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(n.name).lineLimit(1)
                    Text(formatBytes(n.size)).font(.caption).foregroundStyle(.secondary).monospacedDigit()
                }
                Spacer()
                if !n.isOther {
                    Button { NSWorkspace.shared.activateFileViewerSelecting([n.url]) } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .buttonStyle(.borderless).help("在 Finder 中顯示")
                    let refusal = Safety.reasonToRefuse(n.url)
                    Button { confirmItem = n } label: { Image(systemName: "trash") }
                        .buttonStyle(.borderless)
                        .disabled(refusal != nil)
                        .help(refusal ?? "移到垃圾桶（會先讓你確認）")
                }
            }
            .padding(.vertical, 2)
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { model.open(n) }
            .background(model.hovered === n ? Color.accentColor.opacity(0.12) : .clear)
        }
    }
}

private struct IdentifiedNode: Identifiable {
    let node: SpaceNode
    var id: UUID { node.id }
}
