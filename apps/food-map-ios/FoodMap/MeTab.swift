import SwiftUI

struct MeTab: View {
    @Environment(Store.self) private var store
    var body: some View {
        NavigationStack {
            List {
                Section("這是 Swift 試用版") {
                    Text("資料跟網頁版是同一份，這裡只看不改。想比較手感時，同一件事在網頁版和這裡各做一次。").font(.subheadline)
                }
                Section("量測") {
                    LabeledContent("打開到看到卡片", value: store.firstPaintMs.map { "\($0) ms" } ?? "—")
                    LabeledContent("跟雲端同步一次", value: store.syncMs.map { "\($0) ms" } ?? "—")
                    LabeledContent("收藏數", value: "\(store.places.count)")
                }
                Section { Button("登出", role: .destructive) { store.signOut() } }
            }
            .navigationTitle("我的")
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
