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

    var body: some View {
        @Bindable var store = store
        Group {
            if store.loggedIn {
                ZStack {
                    page(0) { MapTab() }
                    page(1) { ListTab() }
                    page(2) { GroupsTab() }
                    page(3) { MeTab() }
                }
                .overlay(alignment: .bottom) {
                    if !store.barHidden {
                        TabBar().transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .animation(.snappy, value: store.barHidden)
                .onChange(of: store.tab) { _, t in opened.insert(t) }
                .task {
                    await store.sync()
                    store.maybeStartCoach()
                    // 第一個畫面出來、空閒一下之後，先把另外三頁建好，第一次點過去不會頓
                    try? await Task.sleep(for: .seconds(1))
                    opened.formUnion([1, 2, 3])
                }
                // 分享選單存好了：重新同步，剛存的店馬上出現
                .onReceive(NotificationCenter.default.publisher(for: .shareSaved)) { _ in Task { await store.sync() } }
                // 朋友傳來的邀請連結 https://anthony-apps.netlify.app/join?code=XXXX 直接在 App 裡加入
                .onOpenURL { url in
                    guard url.path.hasPrefix("/join"), let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { return }
                    Task { if await store.join(code) != nil { withAnimation(.snappy) { store.tab = 2 } } }
                }
                .overlay { CoachOverlay().ignoresSafeArea() }
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
                // 「加進行程」後點訊息條：換到別的行程
                .sheet(item: Binding(get: { TripStore.shared.picking }, set: { TripStore.shared.picking = $0 })) { r in
                    TripPickSheet(stopId: r.id).presentationDetents([.medium, .large])
                }
            } else {
                LoginView()
            }
        }
        // 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失
        .overlay(alignment: .bottom) {
            if let t = store.toast {
                let act = store.toastAction
                HStack(spacing: 10) {
                    if let p = store.toastPlace {
                        PhotoView(place: p, px: 120).frame(width: 30, height: 30).clipShape(.rect(cornerRadius: 8))
                            .matchedGeometryEffect(id: "del-" + p.id, in: toastNS)
                    }
                    if let i = store.toastIcon { ToastGlyph(icon: i).id(t) }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(t).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(2)
                        if store.toastTap != nil {
                            Text("按一下換別的行程").font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6))
                        }
                    }
                    .padding(.trailing, act == nil ? 0 : 4)
                    if let act {
                        Button(act.label) { act.run() }.font(.subheadline.weight(.heavy)).foregroundStyle(Color.sprYellow)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 11)
                .background(Color.ink.opacity(0.92), in: .capsule)
                .padding(.bottom, 96).padding(.horizontal, 24)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .accessibilityAddTraits(.isButton)
                .onAppear { AccessibilityNotification.Announcement(t).post() }
                .task(id: t) { try? await Task.sleep(for: .seconds(act == nil ? 2.6 : store.toastTap != nil ? 5 : 4)); withAnimation(.snappy) { if store.toast == t { store.toast = nil; store.toastAction = nil } } }
                .onTapGesture {
                    let tap = store.toastTap
                    withAnimation(.snappy) { store.toast = nil; store.toastTap = nil }
                    tap?()
                }
            }
        }
        .environment(\.toastNS, toastNS)
        .overlay { if bite { LaunchBite(on: $bite) } }
        // 手感量測浮層（「我的」版本號連點 5 下打開）
        .overlay { PerfHUD() }
        // 畫面上任何地方往右滑都能回上一頁（換分頁、推頁時把每個導覽都裝上）
        .task {
            Haptic.prepare()
            TouchClock.install()
            try? await Task.sleep(for: .seconds(1))
            TouchClock.install()
        }
        // 切回 App 時跟網頁版一樣重新同步一次
        // 憑證快到期就先在背景換好，接下來的請求不用等
        .onChange(of: phase) { _, p in if p == .active { Task { _ = try? await Supa.fresh(); await store.sync() } } }
    }

    // 四個分頁疊在一起，只顯示目前這個（切換不重建，捲到哪、地圖看到哪都留著）
    @ViewBuilder private func page<V: View>(_ i: Int, @ViewBuilder _ v: () -> V) -> some View {
        if opened.contains(i) || store.tab == i {
            v().opacity(store.tab == i ? 1 : 0)
                .offset(y: store.tab == i ? 0 : 8)
                // 換頁：新的一頁從下面 8pt 淡入往上（0.15 秒），舊的直接藏起來，不做兩頁同時畫的交叉淡入
                .animation(store.tab == i ? .easeOut(duration: 0.15) : nil, value: store.tab)
                .allowsHitTesting(store.tab == i)
                .accessibilityHidden(store.tab != i)
        }
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
        // 第一次打開就問能不能發通知（分享選單存好要靠通知告訴他）
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        return true
    }

    func application(_ app: UIApplication, handleEventsForBackgroundURLSession id: String, completionHandler: @escaping () -> Void) {
        guard id.hasPrefix(ShareUpload.prefix) else { completionHandler(); return }
        ShareUpload.shared.setFinished(id, completionHandler)
        ShareUpload.shared.session(id)
    }

    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }
}
