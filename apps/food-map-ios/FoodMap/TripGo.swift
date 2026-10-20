import SwiftUI
import MapKit

// 出發：地圖跟著目前位置，上面一張「下一站」卡片；到了就按「到了 ✓」換下一站
// 離開一間收藏的店時，下面跳小卡問好不好吃；全部到完撒糖粒

// 導航到某一站：用「我的」選的導航 App，交通方式跟這段一樣
func tripNavURL(_ c: CLLocationCoordinate2D, name: String, mode: TravelMode, app: NavApp) -> URL? {
    switch app {
    case .apple:
        let f = mode == .walk ? "w" : mode == .drive ? "d" : "r"
        let q = name.addingPercentEncoding(withAllowedCharacters: .queryValue) ?? ""
        return URL(string: "https://maps.apple.com/?daddr=\(c.latitude),\(c.longitude)&dirflg=\(f)&q=\(q)")
    case .google:
        let m = mode == .walk ? "walking" : mode == .drive ? "driving" : "transit"
        return URL(string: "https://www.google.com/maps/dir/?api=1&destination=\(c.latitude),\(c.longitude)&travelmode=\(m)")
    }
}

// 問過「好吃嗎」的站（關掉就不再問）
enum TripAsked {
    private static let key = "tripAsked"
    static func has(_ id: String) -> Bool { (UserDefaults.standard.stringArray(forKey: key) ?? []).contains(id) }
    static func add(_ id: String) {
        var l = UserDefaults.standard.stringArray(forKey: key) ?? []
        guard !l.contains(id) else { return }
        l.append(id)
        UserDefaults.standard.set(Array(l.suffix(300)), forKey: key)
    }
}

// 上方的「下一站」卡片
struct GoCard: View {
    let stop: TripStop
    let n: Int                 // 第幾站
    let total: Int
    let dots: [Bool]           // 每站到了沒
    let line: String           // 🚶 走路 6 分・13:10 到・比預定早 4 分
    let near: Bool             // 離這站 80 公尺內：「到了」變亮
    let nav: () -> Void
    let arrived: () -> Void
    let close: () -> Void
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("下一站・第 \(n) 站／共 \(total) 站").font(.caption.weight(.heavy)).foregroundStyle(Color.accentDeep)
                    .contentTransition(.numericText())
                Spacer()
                Button(action: close) {
                    Text("結束").font(.caption.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.55))
                        .padding(.horizontal, 10).frame(height: 26).background(Color.ink.opacity(0.07), in: .capsule)
                        .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("結束出發")
            }
            .frame(height: 28)
            HStack(spacing: 10) {
                if !stop.isPlace {
                    Image(systemName: POI.icon(stop.poi, kind: stop.kind)).font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 28, height: 28).background(TripColor.side, in: .circle)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(stop.name).font(.system(size: 20, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(line).font(.subheadline.weight(.bold)).foregroundStyle(Color.ink.opacity(0.6)).lineLimit(1)
                        .contentTransition(.numericText())
                }
            }
            // 進度點：到過的實心、下一站一圈、還沒到的灰
            HStack(spacing: 5) {
                ForEach(Array(dots.enumerated()), id: \.offset) { i, done in
                    Capsule().fill(done ? TripColor.of(i) : i == n - 1 ? Color.accent.opacity(0.35) : Color.ink.opacity(0.1))
                        .frame(width: i == n - 1 ? 22 : 8, height: 8)
                }
            }
            .animation(.snappy, value: n)
            HStack(spacing: 10) {
                Button(action: nav) {
                    Label("導航到這站", systemImage: "location.fill").font(.headline).frame(maxWidth: .infinity)
                }
                .buttonStyle(ChunkyStyle(color: .sprBlue, edge: Color.sprBlue.mix(with: .black, by: 0.2), radius: 16))
                Button(action: arrived) {
                    Text("到了 ✓").font(.headline).frame(maxWidth: .infinity)
                }
                .buttonStyle(ChunkyStyle(color: near ? .sprMint : Color.panel, edge: near ? Color.sprMint.mix(with: .black, by: 0.2) : .cardShadow,
                                         fg: near ? .white : .ink, radius: 16))
                .scaleEffect(near && pulse ? 1.04 : 1)
                .animation(near ? .easeInOut(duration: 0.7).repeatForever(autoreverses: true) : .default, value: pulse)
                .onChange(of: near, initial: true) { _, v in pulse = v }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22).fill(Color.panel).shadow(color: .black.opacity(0.16), radius: 12, y: 4))
        .environment(\.colorScheme, .light)
    }
}

// 下面的小卡：「剛吃完鷹流拉麵，好吃嗎？」＋五顆星
struct RateCard: View {
    let place: Place
    let rate: (Int) -> Void
    let close: () -> Void

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 10) {
                PhotoView(place: place, px: 160).frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 11))
                Text("剛吃完\(place.name)，好吃嗎？").font(.system(size: 15, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(2)
                Spacer(minLength: 0)
                Button(action: close) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.6))
                        .frame(width: 28, height: 28).background(Color.ink.opacity(0.07), in: .circle)
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel("不用了")
            }
            Stars(value: nil, size: 28, animated: true) { n in if let n { rate(n) } }
        }
        .padding(.leading, 14).padding(.trailing, 4).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 22).fill(Color.panel).shadow(color: .black.opacity(0.16), radius: 12, y: -2))
        .environment(\.colorScheme, .light)
    }
}

// 全部到完：撒糖粒＋「今天吃了 N 間！」
struct DoneCard: View {
    let eaten: Int
    let shot: Int
    var last: Place? = nil      // 最後一間收藏的店：順便問好不好吃
    var rate: (Int) -> Void = { _ in }
    let close: () -> Void
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(spacing: 10) {
            Text("🍩").font(.system(size: 44))
            Text(eaten > 0 ? "今天吃了 \(eaten) 間！" : "今天的行程走完了！").font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.ink)
            if let last {
                VStack(spacing: 4) {
                    Text("最後一間\(last.name)，好吃嗎？").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink.opacity(0.7))
                        .lineLimit(2).multilineTextAlignment(.center)
                    Stars(value: nil, size: 28, animated: true) { n in if let n { rate(n) } }
                }
                .padding(.top, 2)
                .transition(.opacity)
            }
            Button(action: close) { Text("好").frame(minWidth: 120) }
                .buttonStyle(ChunkyStyle())
        }
        .padding(.vertical, 20).padding(.horizontal, 30)
        .background(RoundedRectangle(cornerRadius: 26).fill(Color.panel).shadow(color: .black.opacity(0.2), radius: 16, y: 6))
        .overlay { Confetti(shot: shot).allowsHitTesting(false) }
        .scaleEffect(shown || reduce ? 1 : 0.6)
        .opacity(shown ? 1 : 0)
        .onAppear { withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { shown = true } }
        .environment(\.colorScheme, .light)
    }
}
