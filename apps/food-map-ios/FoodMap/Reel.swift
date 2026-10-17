import SwiftUI
import AVFoundation
import Combine

// 店家頁上面那張大圖：IG Reel 就直接在這裡播（靜音、重複播放），右下角喇叭開聲音；不是影片就是照片
struct PlaceMedia: View {
    let place: Place
    @State private var video: URL?
    @State private var muted = true
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?

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
            guard maybeVideo, let src = place.source_url, let u = try? await Supa.reelVideo(src), !Task.isCancelled else { return }
            try? AVAudioSession.sharedInstance().setCategory(.ambient)
            let item = AVPlayerItem(url: u)
            let p = AVQueuePlayer()
            p.isMuted = muted
            looper = AVPlayerLooper(player: p, templateItem: item)
            video = u
            // 影片真的能播了才把照片換掉，不會先黑一下
            for await s in item.publisher(for: \.status).values {
                if s == .readyToPlay { p.play(); withAnimation(.easeOut(duration: 0.3)) { player = p }; break }
                if s == .failed { break }
            }
        }
        // 離開店家頁就停
        .onDisappear(perform: stop)
    }

    private func stop() {
        player?.pause()
        player = nil; looper = nil; video = nil
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
        v.pl.videoGravity = .resizeAspectFill
        v.pl.player = player
        return v
    }

    func updateUIView(_ v: V, context: Context) { v.pl.player = player }
}
