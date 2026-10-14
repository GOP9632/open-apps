import SwiftUI

// 和網頁版同一個 Supabase 資料表（food.places），欄位名稱一樣
struct Place: Codable, Identifiable, Hashable {
    let id: String
    var owner: String?
    var name: String
    var branch: String?
    var address: String?
    var city: String?
    var district: String?
    var lat: Double?
    var lng: Double?
    var approx: Bool?
    var category: String?
    var cuisine: String?
    var price: Int?
    var meals: [String]?
    var hours: String?
    var status: String?
    var rating: Int?
    var note: String?
    var tags: [String]?
    var source_url: String?
    var photo: String?
    var dishes: [String]?
    var created_at: String?
    var updated_at: String?

    var cat: Cat { Cat.all[category ?? ""] ?? Cat.all["other"]! }
    var been: Bool { status == "been" }
    var photoURL: URL? { photo.flatMap { $0.isEmpty ? nil : URL(string: $0) } }
    var area: String { [normCity(city), district ?? ""].filter { !$0.isEmpty }.joined(separator: " · ") }
    var mapsURL: URL? {
        let q = [name, branch ?? "", address?.isEmpty == false ? address! : normCity(city)].filter { !$0.isEmpty }.joined(separator: " ")
        return URL(string: "https://www.google.com/maps/search/?api=1&query=" + (q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""))
    }
}

struct Cat {
    let key: String, name: String, emoji: String, color: Color
    // 跟網頁版 CATS 一樣的分類、圖示和顏色
    static let order = ["restaurant", "cafe", "bakery", "dessert", "snack", "brunch", "bar", "drink", "other"]
    static let all: [String: Cat] = [
        "restaurant": Cat(key: "restaurant", name: "餐廳", emoji: "🍴", color: Color(hex: 0xff7a45)),
        "cafe": Cat(key: "cafe", name: "咖啡廳", emoji: "☕", color: Color(hex: 0xa9744f)),
        "bakery": Cat(key: "bakery", name: "麵包店", emoji: "🥐", color: Color(hex: 0xe8a33d)),
        "dessert": Cat(key: "dessert", name: "甜點", emoji: "🍰", color: Color(hex: 0xf06595)),
        "snack": Cat(key: "snack", name: "小吃", emoji: "🥟", color: Color(hex: 0xf59f00)),
        "brunch": Cat(key: "brunch", name: "早午餐", emoji: "🥞", color: Color(hex: 0xfab005)),
        "bar": Cat(key: "bar", name: "酒吧", emoji: "🍸", color: Color(hex: 0x7950f2)),
        "drink": Cat(key: "drink", name: "飲料", emoji: "🧋", color: Color(hex: 0x20c997)),
        "other": Cat(key: "other", name: "其他", emoji: "📍", color: Color(hex: 0x868e96)),
    ]
}

let PRICES = [1: "$200 內", 2: "$200–500", 3: "$500–1000", 4: "$1000 以上"]

func normCity(_ c: String?) -> String {
    var s = (c ?? "").trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("臺") { s = "台" + s.dropFirst() }
    if s.hasSuffix("市") || s.hasSuffix("縣") { s = String(s.dropLast()) }
    return s.replacingOccurrences(of: "連江", with: "馬祖")
}

extension Color {
    init(hex: UInt32) { self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255) }
    // 網頁版的主色
    static let accent = Color(hex: 0xff6a2b)
    static let accent2 = Color(hex: 0xff3d6e)
    static let grad = LinearGradient(colors: [Color(hex: 0xff8a3d), Color(hex: 0xff5a3c), Color(hex: 0xff3d6e)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let bg = Color(light: 0xfbf7f2, dark: 0x121110)
    static let bg2 = Color(light: 0xf4eee6, dark: 0x1a1816)
    static let panel = Color(light: 0xffffff, dark: 0x1e1c1a)

    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(Color(hex: dark)) : UIColor(Color(hex: light)) })
    }
}

// 群組和滑卡：food.groups、group_members、group_places、swipe_rounds、swipes、profiles（叫 FoodGroup 是因為 SwiftUI 已經有 Group）
struct FoodGroup: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var invite_code: String
    var owner: String
    var created_at: String?
}
struct Member: Codable, Hashable { let group_id: String; let user_id: String }
struct GroupPlace: Codable, Hashable { let group_id: String; let place_id: String }
struct Round: Codable, Identifiable, Hashable {
    let id: String
    let group_id: String
    var created_by: String?
    var title: String
    var place_ids: [String]
    var created_at: String?
}
struct SwipeRow: Codable, Hashable { let round_id: String; var user_id: String; let place_id: String; var liked: Bool }
struct Profile: Codable, Hashable { let id: String; var name: String }

let MEALS: [(String, String)] = [("breakfast", "早餐"), ("lunch", "午餐"), ("tea", "下午茶"), ("dinner", "晚餐"), ("night", "宵夜")]

// 跟網頁版一樣：同一家的分店只算一家（去掉「XX店」「XX分店」後比對店名）
func brandOf(_ p: Place) -> String {
    func nk(_ s: String) -> String {
        var t = s.lowercased().precomposedStringWithCompatibilityMapping
        t = t.replacingOccurrences(of: #"[\s\-_.,，。、・·'’"「」『』()（）【】\[\]|｜/&＆!！?？~～:：#＃@]+"#, with: "", options: .regularExpression)
        return t.replacingOccurrences(of: #"(本店|總店|旗艦店)$"#, with: "", options: .regularExpression)
    }
    let stripped = p.name.replacingOccurrences(of: #"[\s・·\-–|｜(（]+([^\s・·\-–|｜(（]{1,12}?(?:分店|店|門市|館))[)）]?$"#, with: "", options: .regularExpression)
    let k = nk(stripped)
    return k.isEmpty ? nk(p.name) : k
}
