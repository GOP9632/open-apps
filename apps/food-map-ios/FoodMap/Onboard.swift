import SwiftUI
import UIKit
import UserNotifications

// 第一次打開的順序：不在啟動時就問通知，等真的需要（IG 教學看完、第一次新增）再問；
// 剪貼簿剛複製了連結就問要不要收；登入頁的三格介紹；沒有收藏時地圖下面的「收藏第一間店」

// ----- 通知：先跳自己的小卡說明，按「好」才叫系統 -----

extension Store {
    @MainActor func maybeAskNotify(after: Double = 0.6) {
        guard !UserDefaults.standard.bool(forKey: "notifyAsked"), !askNotify else { return }
        Task {
            let s = await UNUserNotificationCenter.current().notificationSettings()
            guard s.authorizationStatus == .notDetermined else { return }
            try? await Task.sleep(for: .seconds(after))
            withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { askNotify = true }
        }
    }

    @MainActor func answerNotify(_ yes: Bool) {
        UserDefaults.standard.set(true, forKey: "notifyAsked")
        withAnimation(.snappy) { askNotify = false }
        if yes { UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in } }
    }
}

struct NotifyCard: View {
    @Environment(Store.self) private var store

    var body: some View {
        VStack(spacing: 14) {
            Image("Logo").resizable().frame(width: 56, height: 56).clipShape(.rect(cornerRadius: 14))
            Text("存好時通知你？").font(.system(size: 21, weight: .black)).foregroundStyle(Color.ink)
            Text("從 IG 分享過來的店，找好時會通知你一聲").font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.ink.opacity(0.6)).multilineTextAlignment(.center)
            HStack(spacing: 10) {
                Button { store.answerNotify(false) } label: {
                    Text("先不要").font(.headline).foregroundStyle(Color.ink.opacity(0.6))
                        .frame(maxWidth: .infinity).frame(height: 52).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                Button { store.answerNotify(true) } label: {
                    Text("好").frame(maxWidth: .infinity).frame(height: 52)
                }
                .buttonStyle(ChunkyStyle(radius: 16))
            }
        }
        .padding(20)
        .candy(28, fill: .bg)
        .padding(.horizontal, 16).padding(.bottom, 12)
    }
}

// ----- 剪貼簿：剛複製了連結就在面板上緣浮一條膠囊問要不要收 -----
// 只用 detectPatterns 看「像不像網址」（不會跳「允許貼上」），內容要等他按系統的「貼上」才拿得到。
// 所以看不出是 IG 還是新聞網址：任何網址都問一次，但連按三次 ✕ 就兩週不問

@MainActor @Observable final class ClipWatch {
    static let shared = ClipWatch()
    var showing = false
    @ObservationIgnored private var seen = UserDefaults.standard.integer(forKey: "clipSeen")
    @ObservationIgnored private var hide: Task<Void, Never>?
    // 連按幾次 ✕（按一次貼上就歸零）；三次就兩週不問，到這個時間（秒）為止
    @ObservationIgnored private var skips = UserDefaults.standard.integer(forKey: "clipSkips")
    @ObservationIgnored private var muteUntil = UserDefaults.standard.double(forKey: "clipMuteUntil")
    // 手指碰著膠囊：8 秒倒數先停（伸手要按貼上時不會剛好收掉）
    @ObservationIgnored var held = false

    // 回到前景時看一次；同一次複製只問一次（changeCount 記在手機裡）
    func check(_ store: Store) {
        let pb = UIPasteboard.general
        let n = pb.changeCount
        guard store.loggedIn, store.coach.isEmpty, !store.showIG, !store.askNotify, !TripMode.shared.on,
              n != seen, Date().timeIntervalSince1970 >= muteUntil, !Self.sheetOpen, pb.hasURLs || pb.hasStrings else { return }
        Task {
            guard await Self.hasLink(), UIPasteboard.general.changeCount == n else { return }
            show(n)
        }
    }

    // 剪貼簿裡像不像網址（不讀內容）
    nonisolated static func hasLink() async -> Bool {
        await withCheckedContinuation { c in
            UIPasteboard.general.detectPatterns(for: [.probableWebURL]) { r in
                if case .success(let s) = r { c.resume(returning: s.contains(.probableWebURL)) } else { c.resume(returning: false) }
            }
        }
    }

    // 這次複製已經處理過（膠囊問過、新增視窗貼過）
    func markSeen() {
        seen = UIPasteboard.general.changeCount
        UserDefaults.standard.set(seen, forKey: "clipSeen")
    }

    private func show(_ n: Int) {
        seen = n
        UserDefaults.standard.set(n, forKey: "clipSeen")
        held = false
        withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { showing = true }
        hide?.cancel()
        hide = Task {
            var left = 8.0
            while left > 0 {
                try? await Task.sleep(for: .milliseconds(100))
                if Task.isCancelled { return }
                if !held { left -= 0.1 }
            }
            dismiss()
        }
    }

    // 按 ✕：連三次就兩週不問，並說一聲（8 秒自己收起不算）
    func skip(_ store: Store) {
        skips += 1
        if skips >= 3 {
            skips = 0
            muteUntil = Date().timeIntervalSince1970 + 14 * 86400
            UserDefaults.standard.set(muteUntil, forKey: "clipMuteUntil")
            store.say("兩週內不再問；要收藏按右上「＋」")
        }
        UserDefaults.standard.set(skips, forKey: "clipSkips")
        dismiss()
    }

    func dismiss() {
        hide?.cancel()
        if showing { withAnimation(.snappy) { showing = false } }
    }

    // 按了「貼上」：收過的店說一聲，沒收過就走「找店中」
    func pasted(_ text: String?, store: Store) {
        skips = 0
        UserDefaults.standard.set(0, forKey: "clipSkips")
        dismiss()
        guard let t = text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return }
        let k = Self.key(t)
        if store.mine.contains(where: { $0.source_url.map(Self.key) == k }) {
            Haptic.light()
            store.say("之前收藏過了", icon: .check)
            return
        }
        Haptic.light()
        store.startAdd(t, been: false, rating: nil)
    }

    // 比對用：去掉 ?igsh= 之類的參數和結尾的 /
    static func key(_ s: String) -> String {
        guard var c = URLComponents(string: s.trimmingCharacters(in: .whitespacesAndNewlines)), let h = c.host else { return s }
        c.query = nil; c.fragment = nil
        let host = h.lowercased().replacingOccurrences(of: "www.", with: "")
        var path = c.path
        while path.hasSuffix("/") { path.removeLast() }
        return host + path
    }

    // 有 sheet、全螢幕畫面開著時不打擾
    private static var sheetOpen: Bool {
        let w = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        return w?.rootViewController?.presentedViewController != nil
    }
}

// 位置跟訊息條一樣：地圖首頁貼著面板上緣（右邊讓開行程、定位兩顆），面板拉到最高時和其他分頁在分頁列上方，店家頁貼著按鈕列。
// 不擋篩選籤和頂端的地圖。面板上緣在這裡讀，換段時只有膠囊重算
struct ClipCapsule: View {
    @Environment(Store.self) private var store
    @State private var clip = ClipWatch.shared
    @State private var panel = MapPanel.shared

    var body: some View {
        let onMap = store.tab == 0 && store.mapPath.isEmpty && store.panelTop > 0 && panel.stage != .high
        let pad: CGFloat = onMap ? store.panelTop + 8 : (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
        HStack(spacing: 10) {
            Image(systemName: "link").font(.system(size: 14, weight: .heavy)).foregroundStyle(.white)
                .frame(width: 32, height: 32).background(Color.accent, in: .circle)
            // 看不出是不是店家的連結：不說「這間店」，問他是不是想吃的
            VStack(alignment: .leading, spacing: 1) {
                Text("剛複製了連結").font(.subheadline.weight(.heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)
                Text("想吃的店就按貼上").font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.8)
            }
            Spacer(minLength: 4)
            // 系統的貼上按鈕：按了才讀剪貼簿，不會跳「允許貼上」
            PasteButton(payloadType: String.self) { s in
                let t = s.first
                Task { @MainActor in clip.pasted(t, store: store) }
            }
            .buttonBorderShape(.capsule).labelStyle(.titleOnly).tint(Color.accent)
            Button { clip.skip(store) } label: {
                Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(.white.opacity(0.6))
                    .frame(width: 44, height: 44).contentShape(.rect)
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel("不要")
        }
        .padding(.leading, 8).padding(.trailing, 2).padding(.vertical, 4)
        .background(Color.ink.opacity(0.92), in: .capsule)
        .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in if !clip.held { clip.held = true } }
            .onEnded { _ in clip.held = false })
        .padding(.horizontal, 16)
        .padding(.trailing, onMap ? 52 : 0)
        .padding(.bottom, pad)
        .animation(.snappy(duration: 0.3), value: pad)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

// ----- 登入頁：三格自動輪播（每 2.5 秒換一格，可以手滑；減少動態時不自動換） -----

struct LoginCarousel: View {
    @State private var page = 0
    @Environment(\.accessibilityReduceMotion) private var reduce
    private let texts = ["IG 看到想吃的，分享給 Bitemap", "收藏的店都在地圖上", "不知道吃什麼？抽一間"]

    var body: some View {
        VStack(spacing: 10) {
            TabView(selection: $page) {
                ForEach(0..<3, id: \.self) { i in
                    VStack(spacing: 12) {
                        art(i).frame(height: 96)
                        Text(texts[i]).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, 8)
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 140)
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    Capsule().fill(i == page ? Color.accent : Color.ink.opacity(0.18))
                        .frame(width: i == page ? 18 : 7, height: 7)
                }
            }
            .animation(.snappy, value: page)
            .accessibilityHidden(true)
        }
        // 每換一格（自己換或手滑）重新數 2.5 秒
        .task(id: page) {
            guard !reduce else { return }
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.4)) { page = (page + 1) % 3 }
        }
    }

    @ViewBuilder private func art(_ i: Int) -> some View {
        switch i {
        case 0:
            // 手機＋分享
            HStack(spacing: 18) {
                RoundedRectangle(cornerRadius: 12).fill(Color.panel)
                    .frame(width: 52, height: 90)
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.ink.opacity(0.8), lineWidth: 3))
                    .overlay(Text("🍜").font(.system(size: 26)))
                Image(systemName: "arrow.right").font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.35))
                Image(systemName: "square.and.arrow.up").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 52, height: 52).background(Color.accent, in: .rect(cornerRadius: 14))
            }
        case 1:
            // 地圖上幾根食物圖釘
            ZStack {
                RoundedRectangle(cornerRadius: 16).fill(Color(hex: 0xeef3e2)).frame(width: 190, height: 92)
                Path { p in
                    p.move(to: CGPoint(x: 0, y: 60)); p.addLine(to: CGPoint(x: 190, y: 34))
                    p.move(to: CGPoint(x: 70, y: 0)); p.addLine(to: CGPoint(x: 110, y: 92))
                }
                .stroke(.white, lineWidth: 6).frame(width: 190, height: 92)
                .clipShape(.rect(cornerRadius: 16))
                pin("🍜", .accent).offset(x: -55, y: -6)
                pin("☕️", .sprMint).offset(x: 8, y: -16)
                pin("🍰", .sprPink).offset(x: 60, y: 2)
            }
        default:
            // 🎲＋卡片
            HStack(spacing: -14) {
                card("🍣").rotationEffect(.degrees(-10))
                Text("🎲").font(.system(size: 40)).zIndex(1).offset(y: -6)
                card("🍕").rotationEffect(.degrees(10))
            }
        }
    }

    private func pin(_ e: String, _ c: Color) -> some View {
        VStack(spacing: -3) {
            Text(e).font(.system(size: 16)).frame(width: 34, height: 34).background(c, in: .circle)
                .overlay(Circle().strokeBorder(.white, lineWidth: 2.5))
            Triangle().fill(c).frame(width: 10, height: 8).rotationEffect(.degrees(180))
        }
    }

    private func card(_ e: String) -> some View {
        RoundedRectangle(cornerRadius: 12).fill(Color.panel).frame(width: 58, height: 74)
            .shadow(color: .cardShadow, radius: 0, y: 3)
            .overlay(Text(e).font(.system(size: 28)))
    }
}

// ----- 沒有收藏的新帳號：地圖下面那塊換成「收藏第一間店」 -----

struct FirstPlaceCard: View {
    @Environment(Store.self) private var store
    @State private var adding = false

    var body: some View {
        VStack(spacing: 12) {
            Image("Logo").resizable().frame(width: 64, height: 64).clipShape(.rect(cornerRadius: 16))
                .shadow(color: .cardShadow, radius: 0, y: 3)
            Text("收藏第一間店").font(.system(size: 20, weight: .black)).foregroundStyle(Color.ink)
            HStack(spacing: 10) {
                Button {
                    store.igFromCoach = false
                    store.showIG = true
                } label: {
                    Text("從 IG 收藏怎麼用").font(.subheadline.weight(.heavy)).foregroundStyle(Color.ink)
                        .frame(maxWidth: .infinity).frame(height: 48).candy(16, fill: .white).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                Button { adding = true } label: {
                    Text("貼上連結").frame(maxWidth: .infinity).frame(height: 48)
                }
                .buttonStyle(ChunkyStyle(radius: 16))
            }
        }
        .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 6)
        .sheet(isPresented: $adding) { AddSheet() }
    }
}
