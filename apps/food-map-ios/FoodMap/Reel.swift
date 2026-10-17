import SwiftUI
import AVFoundation
import Combine

// 店家頁上面那張大圖：IG Reel 就直接在這裡播（靜音、重複播放），右下角喇叭開聲音；不是影片就是照片
struct PlaceMedia: View {
    let place: Place
    @State private var video: URL?
    @State private var muted = true
    @State private var player: AVPlayer?
    @State private var loop: NSObjectProtocol?

    private var maybeVideo: Bool {
        guard let s = place.source_url, s.contains("instagram.com") else { return false }
        return s.contains("/reel/") || s.contains("/reels/") || s.contains("/p/")
    }

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
                    try? AVAudioSession.sharedInstance().setCategory(muted ? .ambient : .playback)
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
        // 每次打開都重新拿影片網址（IG 的網址會過期）；拿不到就留著照片
        .task(id: place.id) {
            stop()
            guard maybeVideo, let src = place.source_url else { return }
            // 等推頁動畫跑完再去拿，不跟動畫搶
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            var u: URL?
            do { u = try await Supa.reelVideo(src) } catch { print("[reel] 雲端拿影片網址失敗：\(error)") }
            // 雲端被 IG 擋（伺服器的網路常被擋）就用手機自己的網路再找一次
            if u == nil, !Task.isCancelled { u = await ReelFinder.find(src); print("[reel] 手機自己找：\(u == nil ? "沒有" : "有")") }
            guard let u, !Task.isCancelled else { print("[reel] 這則沒有影片網址"); return }
            print("[reel] 影片網址 \(u.host() ?? "")")
            try? AVAudioSession.sharedInstance().setCategory(.ambient)
            let item = AVPlayerItem(url: u)
            let p = AVPlayer(playerItem: item)
            p.isMuted = muted
            p.actionAtItemEnd = .none
            // 播完從頭再播
            loop = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { _ in
                p.seek(to: .zero); p.play()
            }
            video = u
            p.play()
            // 影片可以播了才把照片換掉，不會先黑一下
            for await st in item.publisher(for: \.status).values {
                if st == .readyToPlay { print("[reel] 開始播放"); withAnimation(.easeOut(duration: 0.3)) { player = p }; break }
                if st == .failed { print("[reel] 播放失敗：\(item.error.map { "\($0)" } ?? "")"); break }
            }
        }
        // 離開店家頁就停
        .onDisappear(perform: stop)
    }

    private func stop() {
        player?.pause()
        if let loop { NotificationCenter.default.removeObserver(loop) }
        player = nil; loop = nil; video = nil
        muted = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient)
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
