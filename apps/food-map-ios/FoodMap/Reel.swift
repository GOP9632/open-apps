import SwiftUI
import AVFoundation
import Combine
import Network

// 店家頁上面那張大圖：IG Reel 就直接在這裡播（靜音、重複播放），右下角喇叭開聲音；不是影片就是照片
struct PlaceMedia: View {
    let place: Place
    @State private var muted = true
    @State private var player: AVPlayer?
    @State private var loop: NSObjectProtocol?

    var body: some View {
        ZStack {
            PhotoView(place: place, px: 1200)
            if let player {
                PlayerLayer(player: player).transition(.opacity)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if player != nil {
                Button {
                    muted.toggle()
                    player?.isMuted = muted
                    // 開聲音才佔用喇叭；靜音播放不會把你正在聽的音樂停掉
                    let t = CACurrentMediaTime()
                    try? AVAudioSession.sharedInstance().setCategory(muted ? .ambient : .playback)
                    if Flag.on("-perfOverlay") { print("[reel] 喇叭設聲音類別 \(Int((CACurrentMediaTime() - t) * 1000)) ms") }
                } label: {
                    Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 38, height: 38).background(.black.opacity(0.45), in: .circle)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel(muted ? "開聲音" : "關聲音")
                .padding(10)
            }
        }
        // 選圖釘、抽中、按下卡片時已經先拿網址並開始緩衝的話直接用；沒有就現在拿。拿不到就留著照片
        .task(id: place.id) {
            stop()
            guard ReelCache.maybeVideo(place), let src = place.source_url else { return }
            var u: URL, p: AVPlayer
            if let r = ReelCache.take(src) {
                u = r.0; p = r.1
                print("[reel] 用先緩衝好的播放器")
            } else {
                // 等推頁動畫跑完再去拿，不跟動畫搶
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
                guard let f = await ReelCache.url(src), !Task.isCancelled else { print("[reel] 這則沒有影片網址"); return }
                u = f; p = await ReelCache.build(f, .userInitiated)
            }
            print("[reel] 影片網址 \(u.host() ?? "")")
            // 設定聲音類別是同步跟系統要東西：放到背景做，不卡主執行緒（推頁那幾幀）
            await Task.detached { try? AVAudioSession.sharedInstance().setCategory(.ambient) }.value
            guard !Task.isCancelled else { return }
            // 先直接串流；6 秒還沒能播（IG 的伺服器有時不給串流），就整支下載到手機再播
            start(p)
            if !(await Self.waitReady(p)) {
                guard !Task.isCancelled else { return }
                print("[reel] 串流沒成功，改成先下載")
                p.pause(); p.replaceCurrentItem(with: nil)
                guard let local = await Self.download(u), !Task.isCancelled else { print("[reel] 下載失敗"); return }
                p = await ReelCache.build(local, .userInitiated)
                start(p)
                guard await Self.waitReady(p) else { return }
            }
            guard !Task.isCancelled else { p.pause(); return }
            print("[reel] 開始播放")
            withAnimation(.easeOut(duration: 0.3)) { player = p }
        }
        // 離開店家頁就停
        .onDisappear(perform: stop)
    }

    // 開始播：靜音、播完從頭再播
    private func start(_ p: AVPlayer) {
        if let loop { NotificationCenter.default.removeObserver(loop) }
        p.isMuted = muted
        loop = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: p.currentItem, queue: .main) { _ in
            p.seek(to: .zero); p.play()
        }
        p.play()
    }

    // 每 0.25 秒看一次能不能播（不靠 KVO），每 2 秒記一次狀態，最多等 6 秒
    private static func waitReady(_ p: AVPlayer, seconds: Double = 6) async -> Bool {
        let end = Date().addingTimeInterval(seconds)
        var n = 0
        while Date() < end, !Task.isCancelled {
            guard let item = p.currentItem else { return false }
            switch item.status {
            case .readyToPlay: return true
            case .failed: print("[reel] 播放失敗：\(item.error.map { "\($0)" } ?? "")"); return false
            default: break
            }
            n += 1
            if n % 8 == 0 {
                print("[reel] 等待中 status=\(item.status.rawValue) time=\(p.timeControlStatus.rawValue) wait=\(p.reasonForWaitingToPlay?.rawValue ?? "-") err=\(item.errorLog()?.events.last?.errorComment ?? "-")")
            }
            try? await Task.sleep(for: .milliseconds(250))
        }
        print("[reel] 等了 \(Int(seconds)) 秒還不能播")
        return false
    }

    // 整支影片下載到暫存資料夾（檔名要有 .mp4，播放器才認得）
    private static func download(_ u: URL) async -> URL? {
        var r = URLRequest(url: u)
        r.setValue(ReelCache.ua, forHTTPHeaderField: "User-Agent")
        r.timeoutInterval = 30
        guard let (tmp, res) = try? await URLSession.shared.download(for: r) else { return nil }
        print("[reel] 下載 \((res as? HTTPURLResponse)?.statusCode ?? 0) \(res.expectedContentLength / 1024) KB")
        let dst = FileManager.default.temporaryDirectory.appendingPathComponent("reel-\(abs(u.path.hashValue)).mp4")
        try? FileManager.default.removeItem(at: dst)
        do { try FileManager.default.moveItem(at: tmp, to: dst) } catch { return nil }
        return dst
    }

    private func stop() {
        player?.pause()
        if let loop { NotificationCenter.default.removeObserver(loop) }
        player = nil; loop = nil
        let loud = !muted
        muted = true
        // 開過聲音（喇叭切成 .playback）才要切回；新進來的頁 muted 本來就是 true，播之前會在背景設好 .ambient。
        // 第一次進店家頁同步設一次約 25ms，剛好卡在推頁那幾幀。不要改成非同步排佇列：會跟喇叭那下的 .playback 搶順序
        guard loud else { return }
        let t = CACurrentMediaTime()
        try? AVAudioSession.sharedInstance().setCategory(.ambient)
        if Flag.on("-perfOverlay") { print("[reel] stop 設聲音類別 \(Int((CACurrentMediaTime() - t) * 1000)) ms") }
    }
}

// IG 影片網址記在記憶體（網址裡 oe= 是到期時間，離到期還有 5 分鐘以上就重用）；
// 選到圖釘、抽中、按下卡片時先拿網址、建好播放器開始緩衝，進店家頁直接播
@MainActor enum ReelCache {
    private static var urls: [String: (url: URL, until: Date)] = [:]
    private static var finding: [String: Task<URL?, Never>] = [:]
    // 先緩衝好的播放器，最多留 2 個
    private static var ready: [(src: String, url: URL, player: AVPlayer)] = []
    nonisolated static let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

    static func maybeVideo(_ p: Place) -> Bool {
        guard let s = p.source_url, s.contains("instagram.com") else { return false }
        return s.contains("/reel/") || s.contains("/reels/") || s.contains("/p/")
    }

    static func url(_ src: String) async -> URL? {
        if let c = urls[src], c.until.timeIntervalSinceNow > 300 { return c.url }
        if let t = finding[src] { return await t.value }
        let t = Task<URL?, Never> {
            var u: URL?
            do { u = try await Supa.reelVideo(src) } catch { print("[reel] 雲端拿影片網址失敗：\(error)") }
            // 雲端被 IG 擋（伺服器的網路常被擋）就用手機自己的網路再找一次
            if u == nil { u = await ReelFinder.find(src); print("[reel] 手機自己找：\(u == nil ? "沒有" : "有")") }
            return u
        }
        finding[src] = t
        let u = await t.value
        finding[src] = nil
        if let u { urls[src] = (u, expiry(u)) }
        return u
    }

    // IG 網址的 oe= 是 16 進位的到期時間；看不懂就當 30 分鐘
    private static func expiry(_ u: URL) -> Date {
        if let oe = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "oe" })?.value,
           let t = UInt64(oe, radix: 16) { return Date(timeIntervalSince1970: Double(t)) }
        return Date().addingTimeInterval(1800)
    }

    static func warm(_ p: Place) {
        // 用行動網路（或省流量模式）不先載：IG 影片常常整支下載（一支十幾 MB），連點幾間手機就燙、也吃流量；點進店家頁才載
        guard !NetPath.shared.costly else { return }
        guard maybeVideo(p), let src = p.source_url, !ready.contains(where: { $0.src == src }) else { return }
        Task {
            guard let u = await url(src), !ready.contains(where: { $0.src == src }) else { return }
            // 建播放器不在主執行緒（建 asset、item 會占掉一兩幀，地圖還在動、大卡還在彈）
            let pl = await build(u)
            guard !ready.contains(where: { $0.src == src }) else {
                if Flag.on("-perfOverlay") { print("[reel] 重複建的，丟掉") }
                pl.replaceCurrentItem(with: nil); return
            }
            Perf.shared.note("影片預載好")
            ready.append((src, u, pl))
            if ready.count > 2 { ready.removeFirst().player.replaceCurrentItem(with: nil) }
        }
    }

    // 從背景執行緒帶回主執行緒（還沒播、只有這裡拿著）
    private final class Made: @unchecked Sendable {
        let player: AVPlayer
        init(_ p: AVPlayer) { player = p }
    }

    // 在背景建播放器（店家頁沒預載到時也一樣，不在推頁動畫尾巴卡主執行緒）
    static func build(_ u: URL, _ pr: TaskPriority = .utility) async -> AVPlayer {
        if Flag.on("-reelMain") { return player(u) }       // 量測用：照舊在主執行緒建
        return await Task.detached(priority: pr) { () -> Made in
            let t = Date()
            let m = Made(player(u))
            print("[reel] 建播放器 \(Int(Date().timeIntervalSince(t) * 1000)) ms，在主執行緒：\(pthread_main_np() != 0)")
            return m
        }.value.player
    }

    static func take(_ src: String) -> (URL, AVPlayer)? {
        guard let i = ready.firstIndex(where: { $0.src == src }) else { return nil }
        let r = ready.remove(at: i)
        guard urls[src].map({ $0.until.timeIntervalSinceNow > 60 }) ?? false else { return nil }
        return (r.url, r.player)
    }

    // 建播放器（還不播）：先緩衝 3 秒；用一般瀏覽器的 User-Agent 去拿影片（有些 CDN 不理 AVPlayer 預設的）
    nonisolated static func player(_ u: URL) -> AVPlayer {
        let asset = AVURLAsset(url: u, options: ["AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": ua]])
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 3
        let p = AVPlayer(playerItem: item)
        p.isMuted = true
        p.actionAtItemEnd = .none
        return p
    }
}

// 用 AVPlayerLayer 直接畫影片（填滿、沒有播放控制列）
struct PlayerLayer: UIViewRepresentable {
    let player: AVPlayer

    final class V: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var pl: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> V {
        let v = V()
        v.clipsToBounds = true
        v.isUserInteractionEnabled = false
        v.pl.videoGravity = .resizeAspectFill
        v.pl.player = player
        return v
    }

    func updateUIView(_ v: V, context: Context) { v.pl.player = player }
}

// 從 IG 連結找出可以直接播的 mp4（跟雲端的 reel-video 同一套找法）
enum ReelFinder {
    private static let ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"

    static func find(_ link: String) async -> URL? {
        guard let code = link.firstMatch(of: #/instagram\.com/(?:[\w.]+/)?(?:p|reels?|tv)/([\w-]+)/#)?.1 else { return nil }
        // embed 頁比較小先試；有版權音樂的 Reels embed 不給影片，改看 Reels 本頁
        for page in ["https://www.instagram.com/reel/\(code)/embed/captioned/", "https://www.instagram.com/reel/\(code)/"] {
            guard let pu = URL(string: page) else { continue }
            var r = URLRequest(url: pu)
            r.setValue(ua, forHTTPHeaderField: "User-Agent")
            r.timeoutInterval = 10
            guard let (d, res) = try? await URLSession.shared.data(for: r), (res as? HTTPURLResponse)?.statusCode == 200 else { continue }
            let html = String(decoding: d, as: UTF8.self)
            if let m = html.firstMatch(of: #/video_url\\*":\\*"(.*?)\\*"/#) ?? html.firstMatch(of: #/"video_versions":\[\{[^}]*?"url":"(.*?)"/#) {
                return URL(string: unescape(String(m.1)))
            }
        }
        return nil
    }

    // 頁面裡的 JSON 跳脫了好幾層：\\\/ 是 /、\\u0026 是 &
    private static func unescape(_ s: String) -> String {
        s.replacing(#/\\+//#, with: "/")
            .replacing(#/\\+u([0-9a-fA-F]{4})/#) { m in
                UInt32(m.1, radix: 16).flatMap { Unicode.Scalar($0) }.map { String(Character($0)) } ?? ""
            }
    }
}

// 現在的網路是不是行動網路或省流量模式
@MainActor final class NetPath {
    static let shared = NetPath()
    private(set) var costly = false
    private let monitor = NWPathMonitor()

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let c = path.isExpensive || path.isConstrained
            MainActor.assumeIsolated { self?.costly = c }
        }
        monitor.start(queue: .main)
    }
}
