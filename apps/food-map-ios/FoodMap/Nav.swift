import SwiftUI
import UIKit

// 導航用哪個地圖：第一次按「導航」問一次，記住，之後在「我的」可以改
enum NavApp: String, CaseIterable {
    case apple, google
    var name: String { self == .apple ? "Apple 地圖" : "Google 地圖" }

    static var saved: NavApp? {
        get { UserDefaults.standard.string(forKey: "navApp").flatMap(NavApp.init) }
        set { UserDefaults.standard.set(newValue?.rawValue, forKey: "navApp") }
    }
}

extension Place {
    private var query: String { [name, branch ?? "", address?.isEmpty == false ? address! : normCity(city)].filter { !$0.isEmpty }.joined(separator: " ") }

    // Google 地圖的網址有裝 App 會直接開 App，沒裝就開網頁
    func navURL(_ app: NavApp) -> URL? {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        switch app {
        case .apple:
            if let lat, let lng { return URL(string: "https://maps.apple.com/?daddr=\(lat),\(lng)&q=\(name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") }
            return URL(string: "https://maps.apple.com/?daddr=\(q)")
        case .google:
            return URL(string: "https://www.google.com/maps/dir/?api=1&destination=\(q)")
        }
    }

    // 分享出去的文字：店名、地址、必點、地圖連結
    var shareText: String {
        var lines = [name + (branch?.isEmpty == false ? " \(branch!)" : "")]
        if let a = address, !a.isEmpty { lines.append(a) } else if !area.isEmpty { lines.append(area) }
        if let d = dishes, !d.isEmpty { lines.append("必點：" + d.prefix(4).joined(separator: "、")) }
        if let u = mapsURL { lines.append(u.absoluteString) }
        return lines.joined(separator: "\n")
    }
}

// 叫出 iPhone 的分享選單（文字＋封面照片一起分享）
@MainActor func presentShare(_ items: [Any]) {
    guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
    var top = root
    while let p = top.presentedViewController { top = p }
    let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
    vc.popoverPresentationController?.sourceView = top.view
    top.present(vc, animated: true)
}
