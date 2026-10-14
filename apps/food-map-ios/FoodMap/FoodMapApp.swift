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
                    GroupsTab().tabItem { Label("群組", systemImage: "person.3") }.tag(2)
                    MeTab().tabItem { Label("我的", systemImage: "person") }.tag(3)
                }
                .task { await store.sync() }
            } else {
                LoginView()
            }
        }
        // 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失
        .overlay(alignment: .bottom) {
            if let t = store.toast {
                Text(t).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 11)
                    .background(.black.opacity(0.82), in: .capsule)
                    .padding(.bottom, 96).padding(.horizontal, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: t) { try? await Task.sleep(for: .seconds(2.6)); withAnimation(.snappy) { if store.toast == t { store.toast = nil } } }
                    .onTapGesture { withAnimation(.snappy) { store.toast = nil } }
            }
        }
        // 切回 App 時跟網頁版一樣重新同步一次
        .onChange(of: phase) { _, p in if p == .active { Task { await store.sync() } } }
    }
}
