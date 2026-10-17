import SwiftUI
import UserNotifications

@main
struct FoodMapApp: App {
    @UIApplicationDelegateAdaptor private var delegate: AppDelegate
    @State private var store = Store()
    init() { _ = Store.launchedAt }

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
                }
                // 分享選單存好了：重新同步，剛存的店馬上出現
                .onReceive(NotificationCenter.default.publisher(for: .shareSaved)) { _ in Task { await store.sync() } }
                // 朋友傳來的邀請連結 https://anthony-apps.netlify.app/join?code=XXXX 直接在 App 裡加入
                .onOpenURL { url in
                    guard url.path.hasPrefix("/join"), let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { return }
                    Task { if await store.join(code) != nil { withAnimation(.snappy) { store.tab = 2 } } }
                }
                .overlay { CoachOverlay().ignoresSafeArea() }
                .fullScreenCover(isPresented: $store.showIG) { IGTutorial() }
            } else {
                LoginView()
            }
        }
        // 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失
        .overlay(alignment: .bottom) {
            if let t = store.toast {
                let act = store.toastAction
                HStack(spacing: 14) {
                    Text(t).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(2)
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
                .task(id: t) { try? await Task.sleep(for: .seconds(act == nil ? 2.6 : 4)); withAnimation(.snappy) { if store.toast == t { store.toast = nil; store.toastAction = nil } } }
                .onTapGesture { withAnimation(.snappy) { store.toast = nil } }
            }
        }
        // 手感量測浮層（「我的」版本號連點 5 下打開）
        .overlay { PerfHUD() }
        .task {
            Haptic.prepare()
            TouchClock.install()
            try? await Task.sleep(for: .seconds(1))
            TouchClock.install()
        }
        // 切回 App 時跟網頁版一樣重新同步一次
        .onChange(of: phase) { _, p in if p == .active { Task { await store.sync() } } }
    }

    // 四個分頁疊在一起，只顯示目前這個（切換不重建，捲到哪、地圖看到哪都留著）
    @ViewBuilder private func page<V: View>(_ i: Int, @ViewBuilder _ v: () -> V) -> some View {
        if opened.contains(i) || store.tab == i {
            v().opacity(store.tab == i ? 1 : 0)
                .allowsHitTesting(store.tab == i)
                .accessibilityHidden(store.tab != i)
        }
    }
}

// 下面浮著的深色分頁列，選到的那個是橘色膠囊
struct TabBar: View {
    @Environment(Store.self) private var store
    @Namespace private var ns
    private let items = [("地圖", "map.fill"), ("收藏", "heart.fill"), ("群組", "person.3.fill"), ("我的", "person.fill")]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items.indices, id: \.self) { i in
                let on = store.tab == i
                Button {
                    Haptic.light()
                    Perf.shared.mark("換分頁")
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { store.tab = i }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: items[i].1).font(.system(size: 17, weight: .bold))
                        if on { Text(items[i].0).font(.system(size: 15, weight: .heavy)).fixedSize() }
                    }
                    .foregroundStyle(on ? .white : .white.opacity(0.55))
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background {
                        if on { Capsule().fill(Color.accent).matchedGeometryEffect(id: "on", in: ns) }
                    }
                    .contentShape(.capsule)
                }
                .buttonStyle(PressStyle())
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
