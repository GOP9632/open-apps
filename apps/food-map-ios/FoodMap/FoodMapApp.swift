import SwiftUI

@main
struct FoodMapApp: App {
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

    var body: some View {
        Group {
            if store.loggedIn {
                TabView(selection: Bindable(store).tab) {
                    ListTab().tabItem { Label("收藏", systemImage: "heart") }.tag(0)
                    MapTab().tabItem { Label("地圖", systemImage: "map") }.tag(1)
                    SwipeTab().tabItem { Label("滑卡", systemImage: "rectangle.stack") }.tag(2)
                    MeTab().tabItem { Label("我的", systemImage: "person") }.tag(3)
                }
                .task { await store.sync() }
            } else {
                LoginView()
            }
        }
        // 切回 App 時跟網頁版一樣重新同步一次
        .onChange(of: phase) { _, p in if p == .active { Task { await store.sync() } } }
    }
}
