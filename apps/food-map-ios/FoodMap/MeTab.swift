import SwiftUI

struct MeTab: View {
    @Environment(Store.self) private var store
    @State private var renaming = false
    @State private var newName = ""
    @State private var resetting = false
    @State private var leaving = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        newName = store.me.map { store.name($0) } ?? ""; renaming = true
                    } label: {
                        HStack(spacing: 12) {
                            if let me = store.me { Avatar(name: store.name(me), id: me, size: 44) }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(store.me.map { store.name($0) } ?? "").font(.headline).foregroundStyle(.primary)
                                Text(Supa.session?.user.email ?? "").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("改名字").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Section {
                    LabeledContent("收藏", value: "\(store.mine.count) 間")
                    LabeledContent("去過", value: "\(store.mine.filter(\.been).count) 間")
                    LabeledContent("群組", value: "\(store.groups.count) 個")
                }
                Section {
                    if let k = store.quickKey {
                        Button("複製收藏碼", systemImage: "doc.on.doc") { UIPasteboard.general.string = k; store.say("已複製收藏碼") }
                        Button("換新的收藏碼", systemImage: "arrow.triangle.2.circlepath", role: .destructive) { resetting = true }
                    } else {
                        ProgressView()
                    }
                } header: { Text("IG 分享捷徑") } footer: {
                    Text("網頁版設定好的分享捷徑可以繼續用，不用改。換新的收藏碼之後，舊的捷徑就不能用了。")
                }
                Section("速度") {
                    LabeledContent("打開到看到卡片", value: store.firstPaintMs.map { "\($0) ms" } ?? "—")
                    LabeledContent("跟雲端同步一次", value: store.syncMs.map { "\($0) ms" } ?? "—")
                }
                Section { Button("登出", role: .destructive) { leaving = true } }
            }
            .navigationTitle("我的")
            .task { await store.loadQuickKey() }
            .alert("你的名字", isPresented: $renaming) {
                TextField("群組裡的朋友會看到這個名字", text: $newName)
                Button("取消", role: .cancel) {}
                Button("好") { let n = newName.trimmingCharacters(in: .whitespaces); if !n.isEmpty { Task { await store.rename(n) } } }
            }
            .confirmationDialog("換新的收藏碼？舊的分享捷徑會失效，要重新加入。", isPresented: $resetting, titleVisibility: .visible) {
                Button("換新的", role: .destructive) { Task { await store.resetQuickKey() } }
            }
            .confirmationDialog("要登出嗎？", isPresented: $leaving, titleVisibility: .visible) {
                Button("登出", role: .destructive) { store.signOut() }
            }
        }
    }
}

struct LoginView: View {
    @Environment(Store.self) private var store
    @State private var email = ""
    @State private var pw = ""
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("🍜").font(.system(size: 60))
            Text("美食收藏").font(.largeTitle.bold())
            Text("用網頁版同一個帳號登入").foregroundStyle(.secondary)
            VStack(spacing: 10) {
                TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("密碼", text: $pw).textContentType(.password)
            }
            .textFieldStyle(.roundedBorder).font(.body)
            if let e = store.error { Text(e).foregroundStyle(.red).font(.footnote) }
            Button {
                busy = true
                Task { await store.signIn(email.trimmingCharacters(in: .whitespaces), pw); busy = false }
            } label: {
                Text(busy ? "登入中…" : "登入").font(.headline).frame(maxWidth: .infinity).frame(height: 52)
                    .background(Color.grad, in: .rect(cornerRadius: 16)).foregroundStyle(.white)
            }
            .disabled(busy || email.isEmpty || pw.isEmpty)
            Spacer()
        }
        .padding(24)
        .background(Color.bg)
    }
}
