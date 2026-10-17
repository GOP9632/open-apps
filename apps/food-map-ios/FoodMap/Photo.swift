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

    func load(_ url: URL, _ px: CGFloat) async -> UIImage? {
        let k = "\(url.absoluteString)@\(Int(px))"
        if let i = mem.object(forKey: k as NSString) { return i }
        if let t = running[k] { return await t.value }
        let t = Task<UIImage?, Never> {
            guard let (d, _) = try? await session.data(from: url), let img = UIImage(data: d) else { return nil }
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
