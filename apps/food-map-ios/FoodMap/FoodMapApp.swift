import SwiftUI
import UserNotifications

@main
struct FoodMapApp: App {
    @UIApplicationDelegateAdaptor private var delegate: AppDelegate
    @State private var store = Store()
    init() {
        _ = Store.launchedAt
        // 捲動區裡的按鈕一按就縮（不等系統確認是不是要捲動）；拖著捲動時按鈕照樣會取消
        UIScrollView.appearance().delaysContentTouches = false
    }

    var body: some Scene {
        WindowGroup {
            Root().environment(store).tint(.accent)
        }
    }
}

struct Root: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    // 去過的分頁才建（第一次打開只建地圖），之後留著，切回來還在原來的位置
    @State private var opened: Set<Int> = [0]
    @State private var myName = ""
    // 刪除時卡片縮小飛到訊息條（卡片和訊息條左邊的小照片共用）
    @Namespace private var toastNS
    // 冷啟動：啟動畫面的甜甜圈咬一口再放大淡掉（減少動態時不播）
    @State private var bite = !UIAccessibility.isReduceMotionEnabled
    @State private var clip = ClipWatch.shared

    var body: some View {
        let _ = Perf.shared.count("App")
        let _ = Flag.printChanges ? Self._printChanges() : ()   // 量測用 -printChanges：Console 印這次重算是哪個狀態變了
        let _ = Perf.shared.note("App 重算")
        Group {
            if store.loggedIn {
                prompts(events(tabs))
            } else {
                LoginView()
            }
        }
        // 朋友傳來的邀請連結 https://anthony-apps.netlify.app/join?code=XXXX：沒登入也先記著，登入、問完問題才加入
        .onOpenURL { url in
            guard url.path.hasPrefix("/join"), let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { return }
            store.setPendingJoin(code)
            Task { await store.takePendingJoin() }
        }
        // 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失
        .overlay(alignment: .bottom) { toastLayer }
        // 剛複製了連結：在面板上緣（其他分頁在分頁列上方）浮一條膠囊問要不要收。訊息條優先，有訊息條時先藏著
        .overlay(alignment: .bottom) {
            if clip.showing && store.loggedIn && store.coach.isEmpty && store.toast == nil && !store.askNotify && !TripMode.shared.on {
                ClipCapsule()
            }
        }
        // 訊息條時間到自己收起來（不管畫在 Root 還是 sheet 裡，只倒數這一份）；手指按著時暫停
        .task(id: store.toast) { await toastCountdown() }
        .environment(\.toastNS, toastNS)
        .overlay { if bite { LaunchBite(on: $bite) } }
        // 手感量測浮層（「我的」版本號連點 5 下打開）
        .overlay { PerfHUD() }
        // 畫面上任何地方往右滑都能回上一頁（換分頁、推頁時把每個導覽都裝上）
        .task {
            Haptic.prepare()
            _ = NetPath.shared      // 先開始看網路（行動網路時不先載影片）
            TouchClock.install()
            #if targetEnvironment(simulator)
            // 模擬器測試工具連點不到 5 下：啟動參數 -perfOverlay 直接打開浮層
            if ProcessInfo.processInfo.arguments.contains("-perfOverlay") { Perf.shared.on = true }
            #endif
            try? await Task.sleep(for: .seconds(1))
            TouchClock.install()
        }
        // 切回 App 時跟網頁版一樣重新同步一次
        // 憑證快到期就先在背景換好，接下來的請求不用等
        .onChange(of: phase) { _, p in
            // 切走：等著復原的刪除馬上送出（不然被關掉就漏送，下次打開又跑回來）
            if p == .background { LaterDelete.flush(store) }
            if p == .active {
                store.flushFresh()
                store.askNotifyAfterShare()
                ClipWatch.shared.check(store)
                Task { _ = try? await Supa.fresh(); await store.sync() }
            }
        }
    }

    // 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失（sheet 開著時畫在 sheet 裡，這裡先藏起來）
    @ViewBuilder private var toastLayer: some View {
        if let t = store.toast, store.toastSheets == 0 {
            // 地圖首頁（不在行程、沒點進店家頁）：貼著下面那塊的上緣，右邊讓開行程、定位兩顆；其他分頁照舊
            // 面板拉到最高段時上緣在篩選籤附近：改放分頁列上方，不壓到籤
            let onMap = store.tab == 0 && store.mapPath.isEmpty && store.panelTop > 0 && !TripMode.shared.on && MapPanel.shared.stage != .high
            // 行程模式（還沒出發）：貼著行程面板的上緣，不蓋住站卡。面板拉到最高時放進面板最上面那條（把手、起點那排），
            // 不浮在清單中間：蓋在站卡右邊時，想點垃圾桶、交通方式會按到訊息條上的「復原」
            let onTrip = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.on && !TripMode.shared.going && TripMode.shared.panelH > 0
            let tripPad: CGFloat = TripMode.shared.panelH <= 420 ? TripMode.shared.panelH + 8 : TripMode.shared.panelH - 56
            // 出發中：貼著下面的評分卡上緣（沒有評分卡時貼底），不被它蓋住
            let onGo = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.going
            let goPad: CGFloat = max(24, TripMode.shared.goInset + 8)
            // 店家頁（分頁列藏著）：貼著底部按鈕列；分頁列有顯示時一律 96（bottomBar 留著舊值也不會用錯）
            let barPad: CGFloat = (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
            let pad: CGFloat = onMap ? store.panelTop + 8 : onTrip ? tripPad : onGo ? goPad : barPad
            ToastBar(text: t, bottom: pad, trailing: onMap ? 52 : 0, ns: toastNS)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // 訊息條的倒數：Root 和 sheet 裡那條共用這一份（sheet 和 Root 各自倒數的話，關 sheet 時 Root 那條會從頭再數，停得比說好的久）
    private func toastCountdown() async {
        store.toastFading = false
        guard let t = store.toast else { return }
        AccessibilityNotification.Announcement(t).post()
        let act = store.toastAction
        var left: Double = Store.slowToasts ? 20 : (store.toastSeconds ?? (act == nil ? 2.6 : store.toastTap != nil ? 5 : 4))
        while left > 0 {
            try? await Task.sleep(for: .milliseconds(100))
            if Task.isCancelled { return }
            if !store.toastHeld { left -= 0.1 }
        }
        // 有「復原」的：先淡掉、原地多擋 0.45 秒點擊（想按「復原」剛好消失時，不會按到底下的按鈕）
        if act != nil {
            withAnimation(.easeOut(duration: 0.2)) { store.toastFading = true }
            try? await Task.sleep(for: .milliseconds(450))
            if Task.isCancelled { return }
        }
        withAnimation(.snappy) { if store.toast == t { store.toast = nil; store.toastAction = nil } }
        store.toastFading = false
    }

    // 登入後的畫面拆成三段（分頁、事件、彈出的卡和問題）：整串接在 body 裡，Release 建置時編譯器在合理時間內推不出型別
    private var covered: Bool { store.menuCover || store.drawCover }
    private var authFree: Bool { store.askOld == nil && !store.askName && !store.authSettling }

    // 四個分頁和分頁列
    private var tabs: some View {
        ZStack {
            page(0) { MapTab() }
            page(1) { ListTab() }
            page(2) { GroupsTab() }
            page(3) { MeTab() }
        }
        .overlay(alignment: .bottom) {
            if !store.barHidden && !store.menuCover && !store.drawCover {
                TabBar().transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: store.barHidden)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: covered)
        // 加進行程：兩個以上的行程時問加到哪個
        .tripChooser()
        .onChange(of: store.tab) { _, t in opened.insert(t); store.flushFresh() }
        .task {
            if Flag.on("-shareVerdictTest") { ShareUpload.selfTest() }
            // 點「收藏好了」通知冷啟動：先到收藏頁
            if Store.openSavedPending { openSaved() }
            // 上次刪了、還沒送出就被關掉的：先補送完再同步（不然同步回來那筆又出現）
            await LaterDelete.flush(store)?.value
            await store.sync()
            await store.takePendingJoin()
            store.maybeStartCoach()
            store.askNotifyAfterShare()
            ClipWatch.shared.check(store)
            // 第一個畫面出來、空閒一下之後，先把另外三頁建好，第一次點過去不會頓
            try? await Task.sleep(for: .seconds(1))
            opened.formUnion([1, 2, 3])
        }
    }

    // 登入流程、分享、通知帶來的事件
    private func events<V: View>(_ v: V) -> some View {
        v
            // Apple／Google 登入：流程跑完、兩個問題都答完的那一刻，才接邀請連結、開教學、看剪貼簿（不跟 alert 疊在一起）
            .onChange(of: authFree) { _, free in
                guard free else { return }
                Task { await store.takePendingJoin(); store.maybeStartCoach(); ClipWatch.shared.check(store) }
            }
            // 分享選單存好了：重新同步，剛存的店馬上出現
            .onReceive(NotificationCenter.default.publisher(for: .shareSaved)) { _ in Task { await store.sync() } }
            // 點了「收藏好了」「之前收藏過了」通知：到收藏頁最上面
            .onReceive(NotificationCenter.default.publisher(for: .openSaved)) { _ in openSaved() }
    }

    // 教學、問通知、登入後的兩個問題
    private func prompts<V: View>(_ v: V) -> some View {
        @Bindable var store = store
        return v
            .overlay { CoachOverlay().ignoresSafeArea() }
            // 問通知前的小卡（教學跑完才出來）
            .overlay {
                if store.askNotify && store.coach.isEmpty {
                    Color.black.opacity(0.25).ignoresSafeArea()
                        .onTapGesture { store.snoozeNotify() }
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .bottom) {
                if store.askNotify && store.coach.isEmpty {
                    NotifyCard().transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            // 剛用 Apple／Google 登入、帳號是空的：可能以前用 Email 註冊過
            .alert("以前用 Email 註冊過嗎？", isPresented: Binding(get: { store.askOld != nil }, set: { _ in }),
                   presenting: store.askOld) { p in
                Button("有，登入舊帳號") { Task { await store.useOld() } }
                Button("沒有，這是新帳號", role: .cancel) { store.keepNew() }
            } message: { p in
                Text("這個帳號還是空的。以前的收藏在 Email 帳號裡：登入那個帳號，會幫你把 \(LoginKind(rawValue: p)?.name ?? p) 連過去，以後按 \(LoginKind(rawValue: p)?.name ?? p) 就能直接進去。")
            }
            .alert("你的名字", isPresented: $store.askName) {
                TextField("群組裡的朋友會看到這個名字", text: $myName)
                Button("之後再說", role: .cancel) {}
                Button("好") {
                    let n = myName.trimmingCharacters(in: .whitespaces)
                    if !n.isEmpty { Task { await store.setMyName(n) } }
                }
            } message: {
                Text("Apple 沒有給名字，填一個朋友認得的（之後可以在「我的」改）")
            }
            .fullScreenCover(isPresented: $store.showIG) { IGTutorial() }
    }

    // 四個分頁疊在一起，只顯示目前這個（切換不重建，捲到哪、地圖看到哪都留著）
    @ViewBuilder private func page<V: View>(_ i: Int, @ViewBuilder _ v: () -> V) -> some View {
        if opened.contains(i) || store.tab == i {
            v().environment(\.tabActive, store.tab == i)
                .opacity(store.tab == i ? 1 : 0)
                .offset(y: store.tab == i ? 0 : 8)
                // 換頁：新的一頁從下面 8pt 淡入往上（0.15 秒），舊的直接藏起來，不做兩頁同時畫的交叉淡入
                .animation(store.tab == i ? .easeOut(duration: 0.15) : nil, value: store.tab)
                .allowsHitTesting(store.tab == i)
                .accessibilityHidden(store.tab != i)
        }
    }

    private func openSaved() {
        Store.openSavedPending = false
        withAnimation(.snappy) { store.tab = 1 }
        store.listTop &+= 1
    }
}

// 分頁按鈕：按下圖示縮到 0.85 並輕震；放開（按到了）由上面的 keyframe 彈到 1.15 再回 1
private struct TabPress: ButtonStyle {
    func makeBody(configuration c: Configuration) -> some View {
        c.label
            .scaleEffect(c.isPressed ? 0.85 : 1)
            .animation(c.isPressed ? .easeOut(duration: 0.08) : nil, value: c.isPressed)
            .onChange(of: c.isPressed) { _, d in if d { Haptic.light() } }
    }
}

// 冷啟動：跟啟動畫面同一個甜甜圈，先咬一口（0.25 秒）再放大淡掉（0.35 秒）；底下的地圖已經畫好，點擊直接穿過
private struct LaunchBite: View {
    @Binding var on: Bool
    @State private var bite: CGFloat = 0
    @State private var gone = false
    var body: some View {
        ZStack {
            Color("LaunchBg")
            Image("Logo").resizable().frame(width: 100, height: 100).clipShape(.rect(cornerRadius: 24))
                .mask {
                    Rectangle().overlay(alignment: .topTrailing) {
                        Circle().frame(width: bite * 2, height: bite * 2).offset(x: bite * 0.45, y: -bite * 0.45).blendMode(.destinationOut)
                    }
                    .compositingGroup()
                }
                .scaleEffect(gone ? 2.2 : 1)
        }
        .ignoresSafeArea()
        .opacity(gone ? 0 : 1)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear {
            withAnimation(.easeOut(duration: 0.25)) { bite = 30 } completion: {
                withAnimation(.easeIn(duration: 0.35)) { gone = true } completion: { on = false }
            }
        }
    }
}

// 訊息條左邊的勾勾（已收藏）、垃圾桶（已刪除）：0.25 秒畫出來
private struct ToastGlyph: View {
    let icon: ToastIcon
    @State private var t: CGFloat = 0
    var body: some View {
        Group {
            if icon == .check { CheckShape().trim(from: 0, to: t).stroke(Color.sprMint, style: .init(lineWidth: 3, lineCap: .round, lineJoin: .round)) }
            else { TrashShape().trim(from: 0, to: t).stroke(Color.sprYellow, style: .init(lineWidth: 2.2, lineCap: .round, lineJoin: .round)) }
        }
        .frame(width: 18, height: 18)
        .onAppear { withAnimation(.easeOut(duration: 0.25)) { t = 1 } }
        .accessibilityHidden(true)
    }
}

struct CheckShape: Shape {
    func path(in r: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: r.minX + r.width * 0.1, y: r.midY + r.height * 0.05))
            p.addLine(to: CGPoint(x: r.minX + r.width * 0.4, y: r.maxY - r.height * 0.15))
            p.addLine(to: CGPoint(x: r.maxX - r.width * 0.05, y: r.minY + r.height * 0.2))
        }
    }
}

private struct TrashShape: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        return Path { p in
            // 蓋子、把手、桶身、兩條線
            p.move(to: CGPoint(x: r.minX + w * 0.1, y: r.minY + h * 0.22)); p.addLine(to: CGPoint(x: r.maxX - w * 0.1, y: r.minY + h * 0.22))
            p.move(to: CGPoint(x: r.minX + w * 0.38, y: r.minY + h * 0.22)); p.addLine(to: CGPoint(x: r.minX + w * 0.38, y: r.minY + h * 0.08))
            p.addLine(to: CGPoint(x: r.maxX - w * 0.38, y: r.minY + h * 0.08)); p.addLine(to: CGPoint(x: r.maxX - w * 0.38, y: r.minY + h * 0.22))
            p.move(to: CGPoint(x: r.minX + w * 0.2, y: r.minY + h * 0.3)); p.addLine(to: CGPoint(x: r.minX + w * 0.27, y: r.maxY - h * 0.05))
            p.addLine(to: CGPoint(x: r.maxX - w * 0.27, y: r.maxY - h * 0.05)); p.addLine(to: CGPoint(x: r.maxX - w * 0.2, y: r.minY + h * 0.3))
            p.move(to: CGPoint(x: r.minX + w * 0.42, y: r.minY + h * 0.42)); p.addLine(to: CGPoint(x: r.minX + w * 0.42, y: r.maxY - h * 0.2))
            p.move(to: CGPoint(x: r.maxX - w * 0.42, y: r.minY + h * 0.42)); p.addLine(to: CGPoint(x: r.maxX - w * 0.42, y: r.maxY - h * 0.2))
        }
    }
}

// 下面浮著的深色分頁列，選到的那個是橘色膠囊
struct TabBar: View {
    @Environment(Store.self) private var store
    @Namespace private var ns
    // 放開時圖示彈到 1.15 再回 1
    @State private var bounce = [0, 0, 0, 0]
    private let items = [("地圖", "map.fill"), ("收藏", "heart.fill"), ("群組", "person.3.fill"), ("我的", "person.fill")]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items.indices, id: \.self) { i in
                let on = store.tab == i
                Button {
                    Perf.shared.mark("換分頁")
                    bounce[i] += 1
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { store.tab = i }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: items[i].1).font(.system(size: 17, weight: .bold))
                            .keyframeAnimator(initialValue: 1.0, trigger: bounce[i]) { v, s in v.scaleEffect(s) } keyframes: { _ in
                                KeyframeTrack {
                                    MoveKeyframe(0.85)
                                    CubicKeyframe(1.15, duration: 0.12)
                                    SpringKeyframe(1, duration: 0.3, spring: .init(response: 0.3, dampingRatio: 0.5))
                                }
                            }
                        if on { Text(items[i].0).font(.system(size: 15, weight: .heavy)).fixedSize() }
                    }
                    .foregroundStyle(on ? .white : .white.opacity(0.55))
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background {
                        if on { Capsule().fill(Color.accent).matchedGeometryEffect(id: "on", in: ns) }
                    }
                    .contentShape(.capsule)
                }
                .buttonStyle(TabPress())
                .accessibilityLabel(items[i].0)
                .accessibilityAddTraits(on ? .isSelected : [])
                .coachAnchor(.groups, on: i == 2)
            }
        }
        .padding(6)
        .background(Color(hex: 0x2a1a0a), in: .capsule)
        .shadow(color: .black.opacity(0.25), radius: 14, y: 6)
        .padding(.horizontal, 20)
        .padding(.bottom, 4)
        .ignoresSafeArea(.keyboard)
    }
}

extension View {
    // 分頁最上層的捲動內容，底下留位置給浮著的分頁列
    func tabBarRoom() -> some View { safeAreaPadding(.bottom, 76) }
}

// 分享選單的背景收藏做完時，系統會叫醒 App 交結果；也負責在 App 開著時照樣跳通知
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ app: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // 不在一打開就問通知：IG 教學看完、第一次新增時才問（Onboard.swift 的 maybeAskNotify）
        return true
    }

    func application(_ app: UIApplication, handleEventsForBackgroundURLSession id: String, completionHandler: @escaping () -> Void) {
        guard id.hasPrefix(ShareUpload.prefix) else { completionHandler(); return }
        ShareUpload.shared.setFinished(id, completionHandler)
        ShareUpload.shared.session(id)
    }

    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }

    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse) async {
        // 「收藏好了」「之前收藏過了」都在收藏裡，點了帶去收藏頁；「沒收藏到」照舊打開原本的畫面
        let kind = r.notification.request.content.userInfo["kind"] as? String
        Flag.log("[notify] 點了通知 kind=\(kind ?? "nil")")
        guard kind == "saved" || kind == "dup" else { return }
        await MainActor.run {
            Store.openSavedPending = true
            NotificationCenter.default.post(name: .openSaved, object: nil)
        }
    }
}

extension Notification.Name {
    static let openSaved = Notification.Name("bitemap.openSaved")
}

// 訊息條本體：Root 和 sheet 共用（倒數、淡出、朗讀只在 Root 跑一份）
struct ToastBar: View {
    let text: String
    let bottom: CGFloat
    var trailing: CGFloat = 0
    var ns: Namespace.ID?
    @Environment(Store.self) private var store
    var body: some View {
        let act = store.toastAction
        HStack(spacing: 10) {
            if let p = store.toastPlace {
                let photo = PhotoView(place: p, px: 120).frame(width: 30, height: 30).clipShape(.rect(cornerRadius: 8))
                if let ns { photo.matchedGeometryEffect(id: "del-" + p.id, in: ns) } else { photo }
            }
            if let i = store.toastIcon { ToastGlyph(icon: i).id(text) }
            VStack(alignment: .leading, spacing: 1) {
                Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(2)
                if store.toastTap != nil {
                    Text("按一下打開行程").font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6))
                }
            }
            .padding(.trailing, act == nil ? 0 : 4)
            if let act {
                // 有「復原」的訊息條撐滿寬度、按鈕固定在最右邊：店名長短不同，按鈕位置也不跑
                Spacer(minLength: 0)
                Button { if !store.toastFading { act.run() } } label: {
                    Text(act.label).font(.subheadline.weight(.heavy)).foregroundStyle(Color.sprYellow)
                        .padding(.horizontal, 10).frame(minWidth: 56, minHeight: 44).contentShape(.rect)
                }
                .padding(.trailing, -10)
            }
        }
        .frame(maxWidth: act == nil ? nil : .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.vertical, act == nil ? 11 : 3)
        .background(Color.ink.opacity(0.92), in: .capsule)
        .padding(.bottom, bottom).padding(.horizontal, 24).padding(.trailing, trailing)
        // 返回時從按鈕列上方滑到面板上緣，不是一格跳過去
        .animation(.snappy(duration: 0.3), value: bottom)
        .accessibilityAddTraits(.isButton)
        // 手指按著訊息條時暫停倒數（刪行程、刪一站、刪收藏的真刪除也會等）
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in if !store.toastHeld { store.toastHeld = true } }
            .onEnded { _ in store.toastHeld = false })
        // 時間到：淡掉但原地多擋 0.45 秒點擊，不會點到底下的東西
        .opacity(store.toastFading ? 0.011 : 1)
        .onTapGesture {
            guard !store.toastFading else { return }
            let tap = store.toastTap
            withAnimation(.snappy) { store.toast = nil; store.toastTap = nil }
            tap?()
        }
    }
}

extension View {
    // sheet 裡也看得到訊息條（復原按得到）；開著時 Root 那條先藏起來
    func toastHost(bottom: CGFloat = 16) -> some View { overlay(alignment: .bottom) { ToastHostLayer(bottom: bottom) } }
}

private struct ToastHostLayer: View {
    let bottom: CGFloat
    @Environment(Store.self) private var store
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.clear.allowsHitTesting(false)
            if let t = store.toast {
                ToastBar(text: t, bottom: bottom, ns: nil)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // 帶動畫：Root 那條照它的轉場從下面滑進、滑出，不會在 sheet 收完時一下子冒出來
        .onAppear { withAnimation(.snappy(duration: 0.3)) { store.toastSheets += 1 } }
        .onDisappear { withAnimation(.snappy(duration: 0.3)) { store.toastSheets -= 1 } }
    }
}
