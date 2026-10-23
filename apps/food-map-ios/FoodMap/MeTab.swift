import SwiftUI
import AuthenticationServices

struct MeTab: View {
    static let version: String = {
        let i = Bundle.main.infoDictionary
        return "\(i?["CFBundleShortVersionString"] as? String ?? "")（\(i?["CFBundleVersion"] as? String ?? "")）"
    }()
    @Environment(Store.self) private var store
    @State private var renaming = false
    @State private var newName = ""
    @State private var resetting = false
    @State private var leaving = false
    @State private var advanced = false
    @State private var killing = false
    @State private var linking: String?
    @AppStorage("navApp") private var nav: NavApp?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("我的").font(.system(size: 30, weight: .black)).foregroundStyle(Color.ink).padding(.top, 8)
                    profile
                    // 三格數字點了直接去看：收藏、去過（收藏頁篩好）、群組
                    HStack(spacing: 10) {
                        stat("\(store.mine.count)", "收藏", .accent) { go(1, Filter()) }
                        stat("\(store.mine.filter(\.been).count)", "去過", .sprMint) { go(1, Filter(status: "been")) }
                        stat("\(store.groups.count)", "群組", .sprPurple) { go(2, nil) }
                    }
                    // 教學常駐在這：隨時可以再看一次
                    box("教學") {
                        row("App 怎麼用", "再看一次第一次打開的 4 步", "hand.tap.fill", .accent) { store.startCoach() }
                        Divider().padding(.leading, 58)
                        row("從 IG 收藏", "IG → 分享 → Bitemap，一步一步圈給你看", "camera.fill", .sprPink) {
                            store.igFromCoach = false; store.showIG = true
                        }
                    }
                    box("登入方式", footer: "連結之後，用哪一個登入都是同一個帳號、同樣的收藏。") {
                        ForEach(Array(kinds.enumerated()), id: \.offset) { i, k in
                            if i > 0 { Divider().padding(.leading, 58) }
                            loginRow(k)
                        }
                    }
                    box("設定") {
                        Menu {
                            Picker("導航用", selection: $nav) {
                                Text("每次問我").tag(NavApp?.none)
                                ForEach(NavApp.allCases, id: \.self) { Text($0.name).tag(NavApp?.some($0)) }
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "location.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                                    .frame(width: 34, height: 34).background(Color.accent, in: .rect(cornerRadius: 10))
                                Text("導航用").font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                                Spacer()
                                Text(nav?.name ?? "每次問我").font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
                                Image(systemName: "chevron.up.chevron.down").font(.caption.bold()).foregroundStyle(Color.ink.opacity(0.3))
                            }
                            .padding(.horizontal, 12).padding(.vertical, 11)
                        }
                    }
                    // 很少用到的收在「進階」（登出也在這）
                    DisclosureGroup(isExpanded: $advanced.animation(.snappy)) {
                        VStack(alignment: .leading, spacing: 16) {
                            box("IG 分享捷徑（網頁版用）", footer: "網頁版設定好的分享捷徑可以繼續用。換新的收藏碼之後，舊的捷徑就不能用了。App 裡的分享選單不受影響。") {
                                if let k = store.quickKey {
                                    row("複製收藏碼", nil, "doc.on.doc.fill", .sprBlue) { UIPasteboard.general.string = k; store.say("已複製收藏碼") }
                                    Divider().padding(.leading, 58)
                                    row("換新的收藏碼", nil, "arrow.triangle.2.circlepath", .sprPurple) { resetting = true }
                                } else {
                                    ProgressView().frame(maxWidth: .infinity).padding()
                                }
                            }
                            Button { leaving = true } label: {
                                Text("登出").font(.headline).foregroundStyle(Color.sprPink)
                                    .frame(maxWidth: .infinity).frame(height: 50).candy(18).contentShape(.rect)
                            }
                            .buttonStyle(PressStyle())
                            Button { killing = true } label: {
                                Text("刪除帳號").font(.headline).foregroundStyle(.red)
                                    .frame(maxWidth: .infinity).frame(height: 50).candy(18).contentShape(.rect)
                            }
                            .buttonStyle(PressStyle())
                        }
                        .padding(.top, 10)
                    } label: {
                        Text("進階").font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.ink.opacity(0.6))
                    }
                    .tint(Color.ink.opacity(0.6))
                    // 版本號；連點 5 下打開手感量測（只有 TestFlight 版）
                    Text("Bitemap \(Self.version)")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.35))
                        .frame(maxWidth: .infinity).padding(.top, 8)
                        .contentShape(.rect)
                        .onTapGesture(count: 5) {
                            guard Perf.allowed else { return }
                            Haptic.success()
                            Perf.shared.on.toggle()
                        }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .tabBarRoom()
            .background(Color.bg)
            .toolbarVisibility(.hidden, for: .navigationBar)
            .task { await store.loadQuickKey() }
            .task { await store.loadLogins() }
            .task { await store.loadProviders() }
            .alert("你的名字", isPresented: $renaming) {
                TextField("群組裡的朋友會看到這個名字", text: $newName)
                Button("取消", role: .cancel) {}
                Button("好") { let n = newName.trimmingCharacters(in: .whitespaces); if !n.isEmpty { Task { await store.rename(n) } } }
            }
            .confirmationDialog("換新的收藏碼？舊的分享捷徑會失效，要重新加入。", isPresented: $resetting, titleVisibility: .visible) {
                Button("換新的", role: .destructive) { Task { await store.resetQuickKey() } }
            }
            .confirmationDialog("刪除帳號？你的收藏、群組、滑卡紀錄都會一起刪掉，不能復原。", isPresented: $killing, titleVisibility: .visible) {
                Button("刪除帳號", role: .destructive) { Task { await store.deleteAccount() } }
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

    // 後台還沒開的登入方式不列（自己已經連了的照列）
    private var kinds: [LoginKind] {
        LoginKind.allCases.filter { k in k == .email || store.providers.contains(k.rawValue) || store.logins.contains { $0.provider == k.rawValue } }
    }

    // 一種登入方式：連了就寫信箱和「已連結」，Apple／Google 沒連就有「連結」按鈕
    private func loginRow(_ k: LoginKind) -> some View {
        let got = store.logins.first { $0.provider == k.rawValue }
        let loaded = !store.logins.isEmpty
        return HStack(spacing: 12) {
            Image(systemName: k.icon).font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                .frame(width: 34, height: 34).background(k.color, in: .rect(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(k.name).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                if let got, let e = got.email, !e.isEmpty {
                    Text(e.contains("privaterelay.appleid.com") ? "隱藏的電子郵件" : e).font(.caption).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                } else if got == nil, k == .email, loaded {
                    Text("沒有設密碼（網頁版要用的話，在網頁版按「忘記密碼」設一個）").font(.caption).foregroundStyle(Color.ink.opacity(0.5))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer()
            if got != nil {
                Label("已連結", systemImage: "checkmark.circle.fill").font(.caption.weight(.bold)).foregroundStyle(Color.sprMint)
            } else if k != .email && loaded {
                Button {
                    Haptic.light()
                    linking = k.rawValue
                    Task { await store.link(k.rawValue); linking = nil }
                } label: {
                    Text(linking == k.rawValue ? "連結中…" : "連結").font(.subheadline.weight(.heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 14).frame(height: 32).background(Color.accent, in: .capsule)
                        .frame(minHeight: 44).contentShape(.rect)
                }
                .buttonStyle(PressStyle())
                .disabled(linking != nil)
            } else if !loaded {
                ProgressView()
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
    }

    private func stat(_ n: String, _ t: String, _ c: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(n).font(.system(size: 26, weight: .black)).foregroundStyle(c)
                Text(t).font(.caption.weight(.bold)).foregroundStyle(Color.ink.opacity(0.5))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .candy(20)
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle(haptic: true))
        .accessibilityLabel("\(t) \(n)")
    }

    // 換到收藏頁（篩好）或群組頁
    private func go(_ tab: Int, _ f: Filter?) {
        Perf.shared.mark("換分頁")
        if let f { store.listF = f }
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { store.tab = tab }
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
    @State private var useEmail = false
    @State private var signUp = false
    @State private var name = ""
    @State private var email = ""
    @State private var pw = ""
    @State private var busy = false
    @State private var oauth: String?      // 正在用 Apple／Google 登入
    @State private var nonce = ""

    private var ready: Bool { !email.isEmpty && !pw.isEmpty && (!signUp || !name.trimmingCharacters(in: .whitespaces).isEmpty) }
    private var linkName: String? { store.pendingLink.flatMap { LoginKind(rawValue: $0)?.name } }

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image("Logo").resizable().frame(width: 80, height: 80).clipShape(.rect(cornerRadius: 20))
                .shadow(color: .cardShadow, radius: 0, y: 4)
            VStack(spacing: 2) {
                Text("Bitemap").font(.system(size: 32, weight: .black)).foregroundStyle(Color.ink)
                Text("美食收藏").font(.subheadline.weight(.bold)).foregroundStyle(Color.ink.opacity(0.5))
            }
            // 三格介紹（填 Email 時收起來，鍵盤才不會擠）
            if !useEmail && store.pendingLink == nil {
                LoginCarousel().transition(.opacity)
            }
            if useEmail || store.pendingLink != nil {
                emailForm.transition(.move(edge: .trailing).combined(with: .opacity))
            } else {
                choices.transition(.move(edge: .leading).combined(with: .opacity))
            }
            Spacer()
        }
        .padding(24)
        .background(Color.bg)
        .onChange(of: signUp) { store.error = nil }
    }

    // 三個登入方式：Apple、Google、Email
    private var choices: some View {
        VStack(spacing: 12) {
            Text("登入後開始收藏想吃的店").foregroundStyle(.secondary).padding(.bottom, 4)
            if store.providers.contains("apple") { apple }
            if store.providers.contains("google") {
                GoogleButton(busy: oauth == "google") {
                    store.error = nil
                    oauth = "google"
                    Task { await store.signInGoogle(); oauth = nil }
                }
                .disabled(oauth != nil)
            }
            Button {
                store.error = nil
                withAnimation(.snappy) { useEmail = true }
            } label: {
                Label("用 Email 登入", systemImage: "envelope.fill").frame(maxWidth: .infinity).frame(height: 52)
            }
            .buttonStyle(ChunkyStyle(radius: 14))
            .disabled(oauth != nil)
            if let e = store.error { Text(e).foregroundStyle(.red).font(.footnote).multilineTextAlignment(.center) }
        }
        .task { await store.loadProviders() }
    }

    private var apple: some View {
        VStack(spacing: 12) {
            SignInWithAppleButton(.signIn) { r in
                nonce = PKCE.random()
                r.requestedScopes = [.fullName, .email]
                r.nonce = PKCE.sha256(nonce)
            } onCompletion: { res in
                switch res {
                case .success(let a):
                    guard let c = a.credential as? ASAuthorizationAppleIDCredential else { return }
                    oauth = "apple"
                    let n = nonce
                    Task { await store.signInApple(c, nonce: n); oauth = nil }
                case .failure(let e):
                    if !isCancel(e) { store.error = e.localizedDescription }
                }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 52)
            .clipShape(.rect(cornerRadius: 14))
            .disabled(oauth != nil)
            .opacity(oauth == "apple" ? 0.6 : 1)
            Text("以前用 Email 註冊過？先用 Email 登入，再到「我的 > 登入方式」連結 Apple。")
                .font(.footnote).foregroundStyle(Color.ink.opacity(0.5)).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var emailForm: some View {
        VStack(spacing: 16) {
            if let linkName {
                Text("登入你原本的 Email 帳號，登入後會幫你連上 \(linkName)，以後按 \(linkName) 就能直接進來")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                    .multilineTextAlignment(.center).padding(12)
                    .frame(maxWidth: .infinity).background(Color.accent.opacity(0.12), in: .rect(cornerRadius: 14))
            } else {
                Text(signUp ? "建立帳號，開始收藏想吃的店" : "網頁版的帳號也可以直接登入").foregroundStyle(.secondary)
            }
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
            if !signUp {
                Button("忘記密碼？") {
                    let e = email.trimmingCharacters(in: .whitespaces)
                    if e.isEmpty { store.error = "先填 Email，再按忘記密碼" } else { Task { await store.recover(e) } }
                }
                .font(.footnote.weight(.bold)).foregroundStyle(Color.accent)
            }
            Button(action: go) {
                Text(busy ? (signUp ? "建立中…" : "登入中…") : (signUp ? "建立帳號" : "登入")).frame(maxWidth: .infinity).frame(height: 52)
            }
            .buttonStyle(ChunkyStyle(radius: 16))
            .disabled(busy || !ready)
            .opacity(busy || !ready ? 0.5 : 1)
            Button {
                store.error = nil
                store.pendingLink = nil
                withAnimation(.snappy) { useEmail = false; signUp = false }
            } label: {
                Label("其他登入方式", systemImage: "chevron.left").font(.footnote.weight(.bold)).foregroundStyle(Color.ink.opacity(0.55))
                    .frame(minHeight: 44).contentShape(.rect)
            }
        }
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
