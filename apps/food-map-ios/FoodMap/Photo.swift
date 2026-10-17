import SwiftUI
import UIKit

// 照片：抓過的存在記憶體和磁碟（URLCache），在背景縮成顯示大小再解碼，滑動時主執行緒不用做事
actor PhotoLoader {
    static let shared = PhotoLoader()
    // NSCache 本身可以多執行緒讀寫
    private nonisolated(unsafe) let mem = NSCache<NSString, UIImage>()
    // 每個網址載過最大的那張：要的尺寸還沒有時先拿它頂著，不會先出現色塊
    private nonisolated(unsafe) let best = NSCache<NSString, UIImage>()
    private var running: [String: Task<UIImage?, Never>] = [:]
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.urlCache = URLCache(memoryCapacity: 30 << 20, diskCapacity: 300 << 20)
        c.requestCachePolicy = .returnCacheDataElseLoad
        return URLSession(configuration: c)
    }()

    nonisolated func cached(_ url: URL, _ px: CGFloat) -> UIImage? { mem.object(forKey: "\(url.absoluteString)@\(Int(px))" as NSString) }
    nonisolated func anySize(_ url: URL) -> UIImage? { best.object(forKey: url.absoluteString as NSString) }

    // 雲端每張照片另存一張 480px 小圖（…/<uuid>.jpg → …/<uuid>_s.jpg）；舊照片可能還沒有，失敗就記下來，這次開 App 不再試
    private var noSmall: Set<String> = []

    // 只有存在我們自己雲端（Supabase Storage）的照片才有小圖
    private func trySmall(_ u: URL) -> Bool {
        u.host()?.hasSuffix("supabase.co") == true && u.path.contains("/storage/") && !noSmall.contains(u.absoluteString)
    }

    nonisolated static func small(_ u: URL) -> URL {
        guard var c = URLComponents(url: u, resolvingAgainstBaseURL: false) else { return u }
        let ext = (c.path as NSString).pathExtension
        c.path = String(c.path.dropLast(ext.isEmpty ? 0 : ext.count + 1)) + "_s.jpg"
        return c.url ?? u
    }

    // 只抓進磁碟快取、不解碼（同步完在背景先把照片載好，之後打開就是讀手機裡的）
    func prefetch(_ url: URL, small want: Bool) async {
        let u = want && trySmall(url) ? Self.small(url) : url
        let r = URLRequest(url: u)
        if session.configuration.urlCache?.cachedResponse(for: r) != nil { return }
        let ok = await fetch(r) != nil
        if !ok, u != url { noSmall.insert(url.absoluteString); _ = await fetch(URLRequest(url: url)) }
    }

    private func fetch(_ r: URLRequest) async -> Data? {
        guard let (d, res) = try? await session.data(for: r) else { return nil }
        guard (res as? HTTPURLResponse)?.statusCode == 200 else {
            // 404 也可能被快取，下次雲端補了小圖會拿不到，清掉
            session.configuration.urlCache?.removeCachedResponse(for: r)
            return nil
        }
        return d
    }

    // 拿照片的原始資料：500px 以下先拿小圖，沒有就拿原圖
    private func data(_ url: URL, _ px: CGFloat) async -> Data? {
        if px <= 500, trySmall(url) {
            if let d = await fetch(URLRequest(url: Self.small(url))) { return d }
            noSmall.insert(url.absoluteString)
        }
        return await fetch(URLRequest(url: url))
    }

    func load(_ url: URL, _ px: CGFloat) async -> UIImage? {
        let k = "\(url.absoluteString)@\(Int(px))"
        if let i = mem.object(forKey: k as NSString) { return i }
        if let t = running[k] { return await t.value }
        let t = Task<UIImage?, Never> {
            guard let d = await data(url, px), let img = UIImage(data: d) else { return nil }
            let scale = px / max(img.size.width, img.size.height)
            let size = scale < 1 ? CGSize(width: img.size.width * scale, height: img.size.height * scale) : img.size
            return await img.byPreparingThumbnail(ofSize: size) ?? img
        }
        running[k] = t
        let img = await t.value
        running[k] = nil
        if let img {
            mem.setObject(img, forKey: k as NSString)
            let bk = url.absoluteString as NSString
            let side = { (i: UIImage) in max(i.size.width, i.size.height) * i.scale }
            if best.object(forKey: bk).map({ side($0) < side(img) }) ?? true { best.setObject(img, forKey: bk) }
        }
        return img
    }
}

struct PhotoView: View {
    let place: Place
    var px: CGFloat = 600
    @State private var img: UIImage?

    // 記憶體裡有（這個尺寸，或別處載過的其他尺寸）就在第一幀直接畫出來
    init(place: Place, px: CGFloat = 600) {
        self.place = place; self.px = px
        _img = State(initialValue: place.photoURL.flatMap { PhotoLoader.shared.cached($0, px) ?? PhotoLoader.shared.anySize($0) })
    }

    var body: some View {
        // 大小跟外面給的框一樣；照片填滿時超出框的部分裁掉，也不會擋到上面的按鈕
        //（以前照片比框高，看不到的那截蓋住店家頁左上角的返回鍵，按了沒反應）
        LinearGradient(colors: [place.cat.color, place.cat.color.opacity(0.75)], startPoint: .topLeading, endPoint: .bottomTrailing)
            .overlay { Text(place.cat.emoji).font(.system(size: 40)) }
            .overlay {
                if let img {
                    Image(uiImage: img).resizable().scaledToFill().transition(.opacity)
                }
            }
            .clipped()
            .contentShape(.rect)
        .task(id: place.photo) {
            guard let u = place.photoURL else { img = nil; return }
            if let c = PhotoLoader.shared.cached(u, px) { img = c; return }
            if img == nil { img = PhotoLoader.shared.anySize(u) }
            let i = await PhotoLoader.shared.load(u, px)
            // 已經有一張頂著就直接換成清楚的（不淡入）；原本是色塊才淡入
            if img != nil { img = i ?? img } else { withAnimation(.easeOut(duration: 0.2)) { img = i } }
        }
    }
}
