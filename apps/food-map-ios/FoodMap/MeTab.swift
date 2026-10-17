import SwiftUI

struct MeTab: View {
    @Environment(Store.self) private var store
    @State private var renaming = false
    @State private var newName = ""
    @State private var resetting = false
    @State private var leaving = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("我的").font(.system(size: 30, weight: .black)).foregroundStyle(Color.ink).padding(.top, 8)
                    profile
                    HStack(spacing: 10) {
                        stat("\(store.mine.count)", "收藏", .accent)
                        stat("\(store.mine.filter(\.been).count)", "去過", .sprMint)
                        stat("\(store.groups.count)", "群組", .sprPurple)
                    }
                    // 教學常駐在這：隨時可以再看一次
                    box("教學") {
                        row("App 怎麼用", "再看一次第一次打開的 4 步", "hand.tap.fill", .accent) { store.startCoach() }
                        Divider().padding(.leading, 58)
                        row("從 IG 收藏", "IG → 分享 → Bitemap，一步一步圈給你看", "camera.fill", .sprPink) {
                            store.igFromCoach = false; store.showIG = true
                        }
                    }
                    box("IG 分享捷徑", footer: "網頁版設定好的分享捷徑可以繼續用，不用改。換新的收藏碼之後，舊的捷徑就不能用了。") {
                        if let k = store.quickKey {
                            row("複製收藏碼", nil, "doc.on.doc.fill", .sprBlue) { UIPasteboard.general.string = k; store.say("已複製收藏碼") }
                            Divider().padding(.leading, 58)
                            row("換新的收藏碼", nil, "arrow.triangle.2.circlepath", .sprPink) { resetting = true }
                        } else {
                            ProgressView().frame(maxWidth: .infinity).padding()
                        }
                    }
                    box("速度") {
                        HStack { Text("打開到看到卡片"); Spacer(); Text(store.firstPaintMs.map { "\($0) ms" } ?? "—").foregroundStyle(Color.ink.opacity(0.5)) }.padding(14)
                        Divider().padding(.leading, 14)
                        HStack { Text("跟雲端同步一次"); Spacer(); Text(store.syncMs.map { "\($0) ms" } ?? "—").foregroundStyle(Color.ink.opacity(0.5)) }.padding(14)
                    }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                    Button("登出") { leaving = true }
                        .font(.headline).foregroundStyle(Color.sprPink)
                        .frame(maxWidth: .infinity).frame(height: 50).candy(18)
                        .buttonStyle(PressStyle())
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .tabBarRoom()
            .background(Color.bg)
            .toolbarVisibility(.hidden, for: .navigationBar)
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

    private var profile: some View {
        Button {
            newName = store.me.map { store.name($0) } ?? ""; renaming = true
        } label: {
            HStack(spacing: 12) {
                if let me = store.me { Avatar(name: store.name(me), id: me, size: 52) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.me.map { store.name($0) } ?? "").font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.ink)
                    Text(Supa.session?.user.email ?? "").font(.caption).foregroundStyle(Color.ink.opacity(0.5))
                }
                Spacer()
                Text("改名字").font(.caption.weight(.bold)).foregroundStyle(Color.accent)
            }
            .padding(14)
            .candy(22)
        }
        .buttonStyle(PressStyle())
    }

    private func stat(_ n: String, _ t: String, _ c: Color) -> some View {
        VStack(spacing: 2) {
            Text(n).font(.system(size: 26, weight: .black)).foregroundStyle(c)
            Text(t).font(.caption.weight(.bold)).foregroundStyle(Color.ink.opacity(0.5))
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
        .candy(20)
    }

    private func box<C: View>(_ title: String, footer: String? = nil, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink).padding(.leading, 4)
            VStack(spacing: 0) { c() }.candy(20)
            if let footer { Text(footer).font(.caption).foregroundStyle(Color.ink.opacity(0.5)).padding(.horizontal, 4) }
        }
    }

    private func row(_ t: String, _ sub: String?, _ icon: String, _ c: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 34, height: 34).background(c, in: .rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(t).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                    if let sub { Text(sub).font(.caption).foregroundStyle(Color.ink.opacity(0.5)) }
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Color.ink.opacity(0.3))
            }
            .padding(.horizontal, 12).padding(.vertical, 11)
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
    }
}

struct LoginView: View {
    @Environment(Store.self) private var store
    @State private var signUp = false
    @State private var name = ""
    @State private var email = ""
    @State private var pw = ""
    @State private var busy = false

    private var ready: Bool { !email.isEmpty && !pw.isEmpty && (!signUp || !name.trimmingCharacters(in: .whitespaces).isEmpty) }

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image("Logo").resizable().frame(width: 96, height: 96).clipShape(.rect(cornerRadius: 24))
                .shadow(color: .cardShadow, radius: 0, y: 4)
            Text("美食收藏").font(.system(size: 32, weight: .black)).foregroundStyle(Color.ink)
            Text(signUp ? "建立帳號，開始收藏想吃的店" : "網頁版的帳號也可以直接登入").foregroundStyle(.secondary)
            Picker("", selection: $signUp.animation(.snappy)) {
                Text("登入").tag(false)
                Text("建立帳號").tag(true)
            }
            .pickerStyle(.segmented)
            VStack(spacing: 10) {
                if signUp {
                    TextField("名字（朋友看到的）", text: $name).textContentType(.nickname)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField(signUp ? "密碼（至少 6 個字）" : "密碼", text: $pw).textContentType(signUp ? .newPassword : .password)
            }
            .textFieldStyle(.roundedBorder).font(.body)
            if let e = store.error { Text(e).foregroundStyle(.red).font(.footnote) }
            Button(action: go) {
                Text(busy ? (signUp ? "建立中…" : "登入中…") : (signUp ? "建立帳號" : "登入")).frame(maxWidth: .infinity).frame(height: 52)
            }
            .buttonStyle(ChunkyStyle(radius: 16))
            .disabled(busy || !ready)
            .opacity(busy || !ready ? 0.5 : 1)
            Spacer()
        }
        .padding(24)
        .background(Color.bg)
        .onChange(of: signUp) { store.error = nil }
    }

    private func go() {
        busy = true
        let e = email.trimmingCharacters(in: .whitespaces)
        Task {
            if signUp {
                // 要先收確認信的話，切回登入讓他收完信直接登入
                if !(await store.signUp(e, pw, name.trimmingCharacters(in: .whitespaces))) && store.error == nil { signUp = false }
            } else {
                await store.signIn(e, pw)
            }
            busy = false
        }
    }
}
