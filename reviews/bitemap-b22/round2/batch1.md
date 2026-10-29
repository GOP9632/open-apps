# 第 2 輪第 1 批　P1：三個會讓人以為壞掉的錯誤

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 3 項：U02 分類標籤蓋住影片的喇叭（開聲音）鈕、U03 沒找到店也通知「Bitemap 收藏好了 🍩」，內文還寫舊名「美食收藏」、U04 未登入時邀請碼直接被丟掉；已登入加入後也不會打開那個群組

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是對照 a10704d 重新整理、再由反方檢查過的：這批裡（或跟第 1 到 5 批其他項）有兩項以上改到同一段程式、照各項寫法依序套會打架的地方，以及跟 V11、perf-round1b、perf-round1c 重疊的地方。同一組衝突只在最後做到的那批寫完整寫法，前面那批留一條短的，說先守住什麼。行號是 a10704d 的。

各項內文已經吸收了舊的合併注意。內文裡還看得到的「第 N 批合 K」「合 N」是舊編號，已經作廢，內容都併進這裡了，不用回頭找。合併做法裡寫「某項的某句改成……」的，做的時候就照改過的那句。各項內文跟這裡衝突時照這裡。

### 合1　U03、U31（第 4 批）

**位置**：FoodMap/ShareUpload.swift:66-69、BitemapShare/ShareUpload.swift:66-69

**問題**：舊合2 還成立，U03 的修法沒有吸收。U03 還是寫「兩份 ShareUpload.swift 的 :66-69 換成」下面三行，可是 a10704d 的 :67 是 `let c = UNMutableNotificationContent()`，給的三行裡沒有它。照字面整段換掉，後面的 c.title、c.body、:70 的 c.sound、:71 的 add 都找不到 c，兩個 target 都編不過。第 4 批 U31 (1) 要「在 U03 的 c.body 那行後面」加 userInfo，也是以 c 還在為前提。

**合併做法**：

只換 :66、:68、:69，:67 留著。兩份換完的 :64-70 應該是：
```swift
        let code = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        let line = String(data: d, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let v: Verdict = error == nil && code == 200 ? Self.verdict(line) : .failed
        let c = UNMutableNotificationContent()
        c.title = v == .saved ? "收藏好了 🍩" : v == .dup ? "之前收藏過了" : "Bitemap 沒收藏到"
        c.body = v != .failed ? line : error.map { "網路有問題：\($0.localizedDescription)" } ?? (code == 200 ? Self.say(line) : "雲端暫時出錯（\(code)），請再分享一次")
        c.sound = .default
```
第 4 批做 U31 時，在 c.body 和 c.sound 中間加它 (1) 的那行 `c.userInfo = ["kind": v == .saved ? "saved" : v == .dup ? "dup" : "failed"]`。U31 已經照 U03 的 v 重寫過，第 4 批舊的合併注意裡有一個把 dup 歸成 saved 的寫法，新版已經拿掉，以 U31 本文為準。

### 合2　U04、U40（第 3 批）

**位置**：Store.swift:837-844（U04 加在 join() 前面的 openInvite 和改過的 join()）、FoodMapApp.swift:68-72

**問題**：第 3 批的 U40 本文還是 ec71aa2 時寫的：它自己又寫了一份同步的 openInvite，還要改 FoodMapApp.swift:69 的 onOpenURL，跟 U04 打架。這組衝突的完整寫法放在第 3 批，因為做到 U40 的時候 U04 已經做好了，合併寫法才套得上。這批要先知道的是，U40 會直接沿用 U04 做出來的東西，所以 U04 這幾處要照本文做對。另外 U04「要等別項的地方」裡給 U40 (4) 的那行（`Task { await store.openInvite(c) }; dismiss(); return`）照字面放進 Edit.swift 的 go() 會編不過，因為 go() 裡沒有 t。

**合併做法**：

U04 照本文做，這三件事不要改：openInvite 寫成 `@MainActor func openInvite(_ code: String) async`，放在 Store.swift:837 的 join() 前面；join() 開頭先 trim 再 lowercased，比對和 rpc 用同一個 c；.onOpenURL 搬到最外層 Group，裡面只做 setPendingJoin 和 takePendingJoin。這批不用動 Onboard.swift 和 Edit.swift。U04「要等別項的地方」和「注意」裡講 U40 的那幾句，以第 3 批的合併注意，U40 和 U04 那條為準，完整寫法見那一條。

### 合3　U04、U51（第 4 批）

**位置**：Store.swift:91（needsName 下面）、Store.swift:332-333（afterOAuth 開頭）、Store.swift:358-359（useOld 開頭）、Coach.swift:29-31（maybeStartCoach）、FoodMapApp.swift:65（.task 結束的右括號）

**問題**：第 4 批的 U51 本文是 ec71aa2 時寫的，完全沒提 U04：照字面做會再宣告一次 authSettling、把 U04 的 maybeStartCoach guard 整段蓋掉、再掛一個條件一模一樣的 onChange。這組衝突的完整寫法放在第 4 批，因為做到 U51 的時候 U04 已經做好了。這批要先知道的是，U51 會直接在 U04 加的名字和那一個 onChange 上面擴充，所以這些名字和位置不能改。

**合併做法**：

U04 照本文做，名字和位置不要改：Store.swift:91 下面的 authSettling（要被觀察，不要加 @ObservationIgnored）；afterOAuth 和 useOld 開頭各一行 `authSettling = true; defer { authSettling = false }`；maybeStartCoach 的 `guard pendingJoin == nil, !inviteOpened`；FoodMapApp.swift:65 後面只掛一個 onChange。takePendingJoin 維持 U04 的寫法，不回傳 Bool，.task 也不要寫成 `if !(await …)`。U04「要等別項的地方」裡講 U51 的那段跟最後的寫法一致，可以照著理解。完整寫法見第 4 批的合併注意，U51 和 U04 那條。

### 合4　U03

**位置**：BitemapShare/ShareViewController.swift:13、:37-40（U03 注意引用的 bc0bc20 改動）

**問題**：舊合9 還成立。U03 的「注意」還寫「同批 U05 的 bc0bc20 也改過 ShareViewController.swift」，但第 1 批只有 U02、U03、U04，U05 是總表附錄 A 已經修好的項目。內容沒錯（第 13 行 overrideUserInterfaceStyle、第 37-40 行通知狀態在 a10704d 都對得上），只是寫 Swift 的人會在這批找不到 U05。

**合併做法**：

把 U03 注意裡的「同批 U05」改成「已修好的 U05（總表附錄 A）」，其他照留。

### 合5　U02、U04

**位置**：batch1.md U02 修法第一句和注意（引用「第 1 批合1」「第 7 批合8」「第 10 批合9」）、U04 修法開頭（「第 1 批合5 到合8、第 4 批合6、第 6 批合7」）、U04 (4)(6)(7) 括號裡的舊編號、U04 注意（「第 1 批合5、第 3 批合2」「第 1 批合7、合8，第 4 批合6」「第 6 批合7」）

**問題**：第 1 批的合併注意重寫過，舊的合1、合4 到合8 都拿掉了；第 3 批、第 4 批的合併注意也重寫過，編號都變了。可是 U02 和 U04 本文還用舊編號引用。U02 寫「這項照第 1 批合1 的寫法做」，現在第 1 批沒有那條（U02、U88 的處理已經寫進 U02 本文）。U04 注意叫人看「第 3 批合2」，那裡原本的同步版 openInvite 寫法已經作廢。寫 Swift 的人照編號回頭找，會找不到，或是找到內容不相干的那一條，很可能又照舊寫法寫一個同步的 openInvite。

**合併做法**：

U02 修法第一句改成「喇叭和分類標籤一起處理（第 7 批的合併注意，U88、U89、U02 和 U123 那條有同樣說明）」，不要再指第 1 批合1。U02 注意裡的「（第 1 批合1、第 7 批合8）」改成「（第 7 批的合併注意，U88、U89、U02 和 U123 那條）」，「（第 7 批合8、第 10 批合9）」改成「（第 7 批的合併注意，U88、U89、U02 和 U123 那條，以及第 10 批的合併注意，U123 和 U88 那條）」。U04 修法開頭改成「已經把舊的第 1 批、第 4 批合併注意裡跟邀請連結、教學有關的幾條，和第 6 批的合併注意，U129 和 U04 那條併進來，舊的那幾條不用再找」。U04 (4)、(6)、(7) 括號裡的「第 1 批合7」「第 1 批合8」「第 4 批合6」都是已經換掉的舊合併注意，只當背景，不用回頭找。U04 注意裡的「（第 1 批合5、第 3 批合2）」改成「（第 3 批的合併注意，U40 和 U04 那條）」；「（第 1 批合7、合8，第 4 批合6）」改成「（第 4 批的合併注意，U51 和 U04 那條）」；「（第 6 批合7）」改成「（第 6 批的合併注意，U129 和 U04 那條）」。

### 合6　U03、U93（第 9 批）

**位置**：BitemapShare/ShareViewController.swift:46；batch1.md U03 注意

**問題**：舊合4 被拿掉以後，第 1 批裡就沒有任何地方提醒 U93 (4) 會蓋掉 U03 在 :46 換好的 verdict 加 say。U03 的注意只寫了 U05 和 4a05adb，沒提 U93。第 9 批的合併注意，U93 和 U03 那條有寫要跳過，所以照第 9 批的合併注意做不會出事。可是在第 1 批做完 U03 的人，從 U03 這邊看不到這件事，之後如果有人只看 U93 本文，失敗時又會顯示雲端的舊字「打開美食收藏貼上店名」。

**合併做法**：

U03 注意最後補一句：「第 9 批 U93 (4) 也改 ShareViewController.swift:46，U03 做完後那一點跳過，判斷交給 ShareUpload.verdict（第 9 批的合併注意，U93 和 U03 那條）；U93 (1) 到 (3) 只改 :101-116 的樣式，照做。」

### 合7　U02

**位置**：Reel.swift:36（a10704d）、Reel.swift:71；batch1.md「行號更正（acd4471）」U02 那條

**問題**：U02 本文和舊的行號更正都說要改「:34 的 .padding(10)」，還特地說「:35 是 if 區塊結尾的 }」。這在 3fc00de 是對的，但 a10704d 在 :26-28 多了 setCategory 計時那兩行，現在 :34 是按鈕 label 結尾的 `}`，:35 是 accessibilityLabel，.padding(10) 在 :36；U02 說的「:69 的 withAnimation」現在是 :71。這兩件事不會打架，可是 U02 那句「不是 :35，要改的是 :34」放在 a10704d 上剛好指錯行，跟這次要求的「行號一律寫 a10704d」也不一致。

**合併做法**：

U02 (1) 改寫成「Reel.swift:20 的 .overlay(alignment: .bottomTrailing) 不動，把 :36 的 `.padding(10)`（緊接在 :35 accessibilityLabel 後面）換成兩行」，withAnimation 寫 :71。刪掉「原清單寫 :35，3fc00de 的 :35 是 if 區塊結尾的 }」那句，行號更正（acd4471）裡 U02 那條也一起拿掉。

### 行號更正（a10704d）

- U03：修法寫「兩份 ShareUpload.swift 的 :66-69 換成」三行（行號標 ec71aa2，ShareUpload.swift 到 a10704d 沒變），但 :67 是 `let c = UNMutableNotificationContent()`，不在那三行裡。正確：FoodMap/ShareUpload.swift:66（let ok）和 :68-69（c.title、c.body）換掉，:67 留著；BitemapShare/ShareUpload.swift:66、:68-69 一樣

## 各項

### U02（P1・錯誤）分類標籤蓋住影片的喇叭（開聲音）鈕

**畫面**：店家頁：IG Reel 自動播放時照片右下角

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：B1 把分類標籤搬到照片右下（PlaceDetail.swift:106-111，allowsHitTesting(false)），PlaceMedia 的喇叭也在右下（Reel.swift:20），喇叭幾乎整顆被「🍜 拉麵」蓋住，看不到開聲音的鈕，點標籤其實是在切聲音。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：3fc00de 還沒修。Reel.swift:20-36 的喇叭還是 .overlay(alignment: .bottomTrailing)，:34 還是 .padding(10)；PlaceDetail.swift:114-119 的分類標籤還掛在 Stretchy（:94-98）外面的右下角，padding 14、allowsHitTesting(false)，兩個照樣疊在一起，點標籤其實是穿過去切聲音。acd4471 之後 Reel.swift 只有 0486c4f 把建播放器搬到背景（:50、:63 改呼叫 ReelCache.build，:187-196 新增 build）和 52a0b69 加的量測參數（:188 的 -reelMain），喇叭的位置沒有動。PlaceDetail.swift 從 ec71aa2 到 3fc00de 完全沒改，Stretchy 還在 :495-508，往上捲時 :506 讓照片只走一半。e7af2e1、3fc00de 改的是訊息條和行程的天數，8559c3d、9379b88 改的是站卡手勢，都沒有碰到這兩段。

**修法**：

這項照第 1 批合1 的寫法做，喇叭和分類標籤一起處理。

(1) 搬喇叭：Reel.swift:20 的 .overlay(alignment: .bottomTrailing) 不動，把 :34 的 `.padding(10)` 換成下面兩行（原清單寫 :35，3fc00de 的 :35 是 if 區塊結尾的 `}`，要改的是 :34）：
```swift
                .padding(.trailing, 11).padding(.bottom, 48)
                .transition(.opacity)
```
38pt 的黑圓外面包了 44pt 的點擊框，所以 trailing 11 會讓黑圓右緣離照片右邊 14，跟分類標籤右緣對齊；bottom 48 讓黑圓底離照片底 51，分類標籤上緣離底 44（padding 14 加高度 30），中間留大約 7pt。:69 的 withAnimation 會讓喇叭跟影片一起淡入。不要照最早的寫法搬到右上角：返回、更多兩顆用 safeAreaInset 釘在頁面最上面（PlaceDetail.swift:43-47），照片一往上捲，右上角就鑽到「更多」和 TopShade 底下，點到的會是「更多」。

(2) 同時把分類標籤搬進 Stretchy：PlaceDetail.swift:114-119 這整段 `.overlay(alignment: .bottomTrailing) { … }` 從 Stretchy 外面拿掉，改接在 Stretchy 閉包裡 :97 的 `.clipShape(.rect(cornerRadius: 28))` 後面，:94-98 變成：
```swift
        Stretchy(scroll: scroll) {
            Color.clear.aspectRatio(4 / 3, contentMode: .fit)
                .overlay { PlaceMedia(place: place) }
                .clipShape(.rect(cornerRadius: 28))
                // 分類標籤跟喇叭放在同一層：往上捲的半速視差、往下拉的放大都一起動，兩個的間距不會變
                .overlay(alignment: .bottomTrailing) {
                    Text("\(place.cat.emoji) \(place.cat.name)").font(.footnote.weight(.heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 11).frame(height: 30).background(place.cat.color, in: .capsule)
                        .overlay(Capsule().strokeBorder(.white, lineWidth: 2)).padding(14)
                        .allowsHitTesting(false)
                }
        }
```
為什麼一定要一起搬：喇叭在 PlaceMedia 裡，PlaceMedia 包在 Stretchy 裡面，往上捲時被 :506 的 offset 拉回一半；標籤原本掛在 Stretchy 外面，走全速。只搬喇叭的話，頁面往上捲大約 14pt，標籤就會壓到喇叭上。搬進去以後兩個在同一個座標系。:99-113 的「看影片／看貼文」這次先留在 Stretchy 外面，交給第 7 批 U88。

(3) 做完以後 PlaceDetail.swift 這段的行號會變：分類標籤移到大約 :98-104，看影片膠囊的 overlay 往後挪一行，原本 :114-119 那段沒了。PR 註明 B1 漏考慮 build 10 的 Reel 喇叭，並在測試清單第 4 項加一條「Reel 播放時喇叭看得到、點得到，點分類標籤不會切聲音，往上捲、往下拉都不會被標籤蓋住」。

**模擬器驗收**：打開一間 IG Reel 來源的店，等影片自動播放。1. 喇叭淡入，出現在右下分類標籤正上方，整顆看得到，右緣跟標籤右緣對齊，中間有一點空隙；點喇叭會切聲音，圖示在 speaker.slash.fill 和 speaker.wave.2.fill 之間換。2. 點分類標籤本身，聲音不會切。3. 把頁面慢慢往上捲到照片快捲出去，整段過程標籤都不會壓到喇叭，喇叭也沒有跑到上面返回／更多那排底下。4. 在頁面頂端往下拉讓大圖放大，喇叭和標籤跟著照片一起放大、一起移動，不重疊。5. 換一間不是影片的店，只看到分類標籤在右下，位置跟以前一樣。6. 打開「減少動態」再看一次，照片不做視差，喇叭和標籤照樣不重疊。

**注意**：第 7 批 U88：U88 的 catChip 那一半已經在這裡做掉了，U88 只搬「看影片／看貼文」（sourceChip），最後那句「把分類膠囊改到 .topTrailing，或在 player 存在時往上讓 44pt」整句不要做，不然標籤會疊回喇叭上；U88 驗收裡「靜音鈕沒有被分類膠囊擋住」留著當這項的回歸測試（第 1 批合1、第 7 批合8）。第 7 批 U89 照原本說的在 U88 搬好的 sourceChip 裡改。第 10 批 U123 (5) 要改的分類標籤 `.foregroundStyle(.white)` 在這項做完後已經搬進 Stretchy 閉包（大約 PlaceDetail.swift:100），請照內容找，不要照 :115 找（第 7 批合8、第 10 批合9）。跟 V11、fix-addcard 沒有重疊。

### U03（P1・錯誤）沒找到店也通知「Bitemap 收藏好了 🍩」，內文還寫舊名「美食收藏」

**畫面**：IG 分享到 Bitemap 後的系統通知／分享卡

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：quick-add 純文字模式不管成功失敗都回 200 加一行字，ShareUpload 只看 code==200 且有字就用成功標題。「這篇貼文沒找到店家」「收藏碼失效」「沒有收到連結」「收藏失敗」都變成「收藏好了」，使用者以為存好，貼文就丟了。內文還是舊名「美食收藏」和「分享捷徑」。備援路徑 ShareViewController.swift:40 也用成功樣式顯示。

**行號**：ec71aa2（見 行號對照.md 的「ec71aa2 → a10704d」）

**現況**：FoodMap/ShareUpload.swift:64-69 和 BitemapShare/ShareUpload.swift:64-69（兩份內容一樣）還是只看 error == nil、code == 200、line 不是空的就用「Bitemap 收藏好了 🍩」，而 quick-add/index.ts:45、47、51、61、98 的失敗字串都是 200 回傳，所以「這篇貼文沒找到店家，可以打開美食收藏貼上店名」照樣變成收藏好了，內文仍是舊名「美食收藏」「分享捷徑」。備援路徑從原本的 :40 移到 ShareViewController.swift:45-46，一樣只看 line 是不是空的就給成功樣式。Store.swift:517-522 的 inApp 也還是 private，只給 App 內新增用（Store.swift:499）。

**修法**：

這一輪只改判斷和文案，failedShares／失敗 PendingCard 另排。專案用的是 synchronized group（project.pbxproj:43-44），一個檔案沒辦法同時屬於兩個 target，所以共用判斷就直接寫在兩份 ShareUpload.swift 的檔尾（兩份保持一模一樣，檔頭第 5 行本來就這樣要求）：
```swift
extension ShareUpload {
    enum Verdict { case saved, dup, failed }
    // 雲端回的那一行是寫給網頁版捷徑的，開頭是「已收藏」才算存到（含「已收藏：A\n之前收藏過：B」）
    static func verdict(_ line: String) -> Verdict {
        if line.hasPrefix("已收藏") { return .saved }
        if line.hasPrefix("之前收藏過") { return .dup }
        return .failed
    }
    // 失敗訊息換成 Bitemap 的說法；雲端字串不改，網頁版捷徑還在用
    static func say(_ m: String, inApp: Bool = false) -> String {
        if m.isEmpty || m.contains("沒找到店家") { return inApp ? "找不到這間店，加上地區再試，或自己填" : "這篇貼文沒找到店家，打開 Bitemap 貼上店名試試" }
        if m.contains("收藏碼") { return inApp ? "收藏碼失效了，請到「我的」重新產生後再試" : "收藏碼失效了，打開 Bitemap 登入一次再分享" }
        if m.contains("沒有收到連結") { return "沒有收到連結，請從 IG 貼文按分享再選 Bitemap" }
        return m
    }
}
```
兩份 ShareUpload.swift 的 :66-69 換成：
```swift
let v: Verdict = error == nil && code == 200 ? Self.verdict(line) : .failed
c.title = v == .saved ? "收藏好了 🍩" : v == .dup ? "之前收藏過了" : "Bitemap 沒收藏到"
c.body = v != .failed ? line : error.map { "網路有問題：\($0.localizedDescription)" } ?? (code == 200 ? Self.say(line) : "雲端暫時出錯（\(code)），請再分享一次")
```
ShareViewController.swift:46 換成：
```swift
let v = ShareUpload.verdict(line)
await finish(v == .failed ? ShareUpload.say(line) : line, ok: v != .failed, delay: v == .failed ? 2.5 : 1.5)
```
Store.swift:518-522 的 inApp 內容改成 `ShareUpload.say(m, inApp: true)`（呼叫點 Store.swift:499 不用動）。原修法說要補「收藏碼不對」一句，其實 contains("收藏碼") 已經同時接住「收藏碼不對」和「收藏碼已失效」，真正要補的只有「沒有收到連結」。較理想的長期做法還是請求帶 format:json、依 places 判斷（App 內已經用 Supa.quickAddJSON，Store.swift:486）。

**模擬器驗收**：專案沒有測試 target，在 #if DEBUG 裡加一個 PerfHUD 按鈕或啟動參數，把「這篇貼文沒找到店家，可以打開美食收藏貼上店名」「已收藏：A\n之前收藏過：B」「之前收藏過：X」「收藏碼已失效，請到美食收藏「我的」重新加入分享捷徑」「沒有收到連結，請從 IG 貼文按分享再選這個捷徑」「收藏失敗：boom」六個字串餵進 verdict 和 say，確認標題分別是沒收藏到、收藏好了、之前收藏過了、沒收藏到、沒收藏到、沒收藏到，內文不再出現「美食收藏」「捷徑」。再實際從 Safari 分享一個沒有店名的網頁給 Bitemap，通知標題要是「Bitemap 沒收藏到」。

**注意**：跟 fix-addcard-ec71aa2.md 沒有重疊。同批 U05 的 bc0bc20 也改過 ShareViewController.swift（第 13 行 overrideUserInterfaceStyle、第 37-40 行通知狀態），只是行號往下移，不衝突；4a05adb 在 :40 加的「收到了，打開 Bitemap 就看得到」是送出當下的訊息，跟這裡改的結果通知是兩回事，不用動。

### U04（P1・錯誤）未登入時邀請碼直接被丟掉；已登入加入後也不會打開那個群組

**畫面**：朋友點邀請連結（anthony-apps.netlify.app/join?code=…）開 App：未登入的登入頁／已登入

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：.onOpenURL 掛在 if store.loggedIn 分支裡（FoodMapApp.swift:63-66），登入頁沒人接。新朋友裝好 App 再點一次連結，登入後不會加入群組，也沒有提示。這是群組最重要的入口。已登入時 join 成功只做 tab=2，群組分頁可能停在別的群組。已經是成員時也照樣說「加入了 🎉」。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：還沒修，5d713ac、d95fd43 都沒碰邀請流程。FoodMapApp.swift:68-72 的 .onOpenURL 還掛在 :39 的 if store.loggedIn 分支裡，:106-108 的 else 只有 LoginView()，登入頁收不到邀請連結；:71 加入成功只做 store.tab = 2，沒設 groupJump。Store.swift:837-844 的 join() 沒先查自己是不是已經在群組裡，照樣說「加入「X」了 🎉」，也沒把碼轉小寫。Store.swift:332-347 的 afterOAuth、:350-355 的 keepNew、:358-365 的 useOld、:418-427 的 signOut、Coach.swift:29-31 的 maybeStartCoach、MeTab.swift:279 的登入頁文字、GroupsTab.swift:54-55、:96-104、:119 都跟 3fc00de 一樣。5d713ac 只在 FoodMapApp.swift:117-122 的訊息條 pad 多了兩行，這項用到的 :39 到 :110 行號都沒變，只有訊息條 overlay 從 :111-181 變成 :111-183。

**修法**：

這項在第 1 批先做。下面已經把第 1 批合5 到合8、第 4 批合6、第 6 批合7 的合併寫法併進來，旗標直接用第 4 批 U51 會用的名字 authSettling。跟原清單和合併注意不同的地方有兩個，後面會說明。行號都是 d95fd43 的（這項用到的地方跟 3fc00de 一樣）。

(1) Store.swift:91（needsName）下面加三個屬性：
```swift
    // 邀請連結的碼：還沒登入、或登入後的問題還沒答完時先記著（存在手機裡，App 被關掉也不會丟）
    var pendingJoin: String? = UserDefaults.standard.string(forKey: "pendingJoin")
    // Apple／Google 登入後的流程還沒走完（afterOAuth 還在跑，或按了「有，登入舊帳號」正要登出）：不接邀請，第 4 批 U51 的教學也看這個
    var authSettling = false
    // 這次啟動處理過邀請：這一輪不自動開教學，下次打開 App 再教
    @ObservationIgnored var inviteOpened = false
```
pendingJoin 和 authSettling 要被觀察（登入頁文字和 Root 的 onChange 會讀），不要加 @ObservationIgnored。

(2) Store.swift:837 的 join() 前面加三個函式，join() 本身改成先正規化、先查是不是已經在群組裡：
```swift
    @MainActor func setPendingJoin(_ c: String?) {
        pendingJoin = c
        if let c { UserDefaults.standard.set(c, forKey: "pendingJoin") } else { UserDefaults.standard.removeObject(forKey: "pendingJoin") }
    }

    // 邀請連結：登入好、Apple／Google 的流程跑完、「以前用 Email 註冊過嗎？」和「你的名字」都答完才加入
    // （不然按「有，登入舊帳號」時，空帳號已經進了群組，清不掉，舊帳號也連不過去）
    @MainActor func takePendingJoin() async {
        guard loggedIn, !authSettling, askOld == nil, !askName, let code = pendingJoin else { return }
        setPendingJoin(nil)
        inviteOpened = true
        await openInvite(code)
    }

    // 加入（已經在群組就不打雲端）後切到群組分頁並打開那個群組；第 3 批 U40 的剪貼簿膠囊也用這個
    @MainActor func openInvite(_ code: String) async {
        guard let gid = await join(code) else { return }
        groupJump = GroupJump(gid: gid, rid: nil)
        withAnimation(.snappy) { tab = 2 }
    }

    @MainActor func join(_ code: String) async -> String? {
        // 雲端用 lower(trim(code)) 查，這裡也一樣，貼成大寫的碼才比得到
        let c = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let g = groups.first(where: { $0.invite_code.lowercased() == c }) { say("你已經在「\(g.name)」裡了"); return g.id }
        do {
            let gid = try await Supa.rpc("join_group", ["code": .s(c)], as: String.self)
            await sync()
            say("加入「\(groups.first { $0.id == gid }?.name ?? "群組")」了 🎉")
            return gid
        } catch { say("加入失敗：" + error.localizedDescription); return nil }
    }
```
groupJump 的寫法跟 Draw.swift:169-170 一樣；GroupsTab.swift:54 的 onChange 和 :55 的 onAppear 會呼叫 :96-104 的 jump() 把群組推出來，群組分頁還沒建也接得到。GroupsTab.swift:119 手動輸入邀請碼也走 join()，已經是成員時會直接打開，不再說加入了。

(3) Store.swift:332 afterOAuth 的第一行（:333 的 loggedIn = true 前面）加：
```swift
        authSettling = true; defer { authSettling = false }
```
authSettling 一定要在 loggedIn 之前設，這樣登入後分支第一次出現時 Root 的 onChange 條件就是 false。

(4) Store.swift:358 useOld 的第一行（:359 的 guard 前面）也加同一行 `authSettling = true; defer { authSettling = false }`。這是合併注意沒寫到的：(6) 的 onChange 看的是 askOld 變回 nil，useOld 在 :360 就把 askOld 清掉，接著 :363 還要等雲端清空帳號才登出，這段時間 onChange 會以為問題答完了，把空帳號加進群組。第 4 批合6 的 onChange 寫法也有同一個洞，這行一起補掉。defer 跟 :364 的 signOut() 在同一輪執行，登入後分支那時已經拿掉了，不會再觸發。

(5) keepNew（:350-355）不用改，不要加原清單的 `Task { await takePendingJoin() }`，(6) 的 onChange 會接手。signOut（:418-427）不要清 pendingJoin，只在 :426 那行後面加 `inviteOpened = false`。按「有，登入舊帳號」之後 pendingJoin 還在，用 Email 登入舊帳號時 Root 的 .task 會接手，加入的是舊帳號。

(6) FoodMapApp.swift：
- 把 :68-72（註解和 .onOpenURL）整段拿掉，改掛在最外層 Group 上，也就是 :109 的 `}` 後面、:110 訊息條註解前面：
```swift
        // 朋友傳來的邀請連結 https://anthony-apps.netlify.app/join?code=XXXX：沒登入也先記著，登入、問完問題才加入
        .onOpenURL { url in
            guard url.path.hasPrefix("/join"), let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { return }
            store.setPendingJoin(code)
            Task { await store.takePendingJoin() }
        }
```
不要在這裡直接呼叫 openInvite 或 join：沒登入時雲端會回「請先登入」。
- .task 裡 :58 的 `await store.sync()` 後面、:59 的 `store.maybeStartCoach()` 前面加一行 `await store.takePendingJoin()`。
- :65 .task 結束的 `}` 後面（:66 分享選單註解前面）加：
```swift
                // Apple／Google 登入：流程跑完、兩個問題都答完的那一刻才接邀請連結
                .onChange(of: store.askOld == nil && !store.askName && !store.authSettling) { _, free in
                    guard free else { return }
                    Task { await store.takePendingJoin() }
                }
```
這是跟原清單和第 1 批合7 不同的第二個地方：原本是在 afterOAuth 的 defer 和 keepNew 各丟一個 Task 去加入，但 takePendingJoin 要擋 askName（第 4 批合6），隱藏信箱的人答完「你的名字」以後就沒有人再叫它了。改成一個 onChange，Email 登入時條件一開始就是 true、不會觸發，由 .task 接；Apple／Google 時從 false 變 true 才觸發。第 4 批 U51 要加的就是這個 onChange，到時候在同一個地方擴充就好。

(7) 加入了就不在這一輪開教學（第 1 批合8）。Coach.swift:29-31 改成：
```swift
    @MainActor func maybeStartCoach() {
        // 點邀請連結進來的：先讓他看到群組，教學下次打開 App 再跑（coachDone 還沒寫，下次的 .task 會補）
        guard pendingJoin == nil, !inviteOpened else { return }
        if coach.isEmpty && !UserDefaults.standard.bool(forKey: "coachDone") { startCoach() }
    }
```
Email 登入時 takePendingJoin 在 await join 之前就設好 inviteOpened，緊接著的 maybeStartCoach 會停；Apple／Google 登入時 .task 跑到 maybeStartCoach 時 pendingJoin 還在，也會停。這樣不需要第 4 批合6 的 Bool 回傳值和 `if !(await …)` 寫法。

(8) 登入頁 MeTab.swift:279 改成 `Text(store.pendingJoin != nil ? "登入後會幫你加入朋友的群組" : "登入後開始收藏想吃的店").foregroundStyle(.secondary).padding(.bottom, 4)`。可選：登入頁加一個貼邀請碼的入口，用 GroupsTab.swift:796 的 FoodGroup.code(in:) 解析後呼叫 setPendingJoin。

要等別項的地方：第 3 批 U40 做的時候不要再寫自己的 openInvite，(2) 的 Onboard 那段改成 `Haptic.light(); Task { await store.openInvite(c) }; return`，(4) 改成 `Task { await store.openInvite(c) }; dismiss(); return`，(3) 整條跳過。第 4 批 U51 做的時候：(1) 的旗標和 afterOAuth 的 defer 已經有了，跳過；(2) 的 guard 跟這裡的併成一行 `guard askOld == nil, !askName, !authSettling, pendingJoin == nil, !inviteOpened else { return }`；(3) 不要再加第二個 onChange，把這裡 onChange 裡那行改成 `Task { await store.takePendingJoin(); store.maybeStartCoach(); ClipWatch.shared.check(store) }`。第 6 批 U129 的 TripStore.load 放在 :57 和 :58 中間，跟這裡加在 :58 後面的那行可以一起進。

**模擬器驗收**：先 xcrun simctl uninstall 把 App 刪掉再裝回來，確定 coachDone 是空的。1. 不登入，跑 xcrun simctl openurl booted "https://anthony-apps.netlify.app/join?code=測試碼"（模擬器如果開到 Safari，就在網頁上按「打開 App」），登入頁那行字要變成「登入後會幫你加入朋友的群組」。2. 用 Email 登入測試帳號，要自動加入、切到群組分頁並推進那個群組頁，訊息條說「加入「X」了 🎉」，畫面上沒有教學的暗底和圈圈。3. 殺掉 App 再打開，不會又加入、不會又跳群組，這次教學才出現。4. 已登入時再開同一個連結，把碼改成大寫再開一次，兩次都顯示「你已經在「X」裡了」並打開那個群組，Xcode console 不能有 join_group 的請求。5. 登出，再用全新的 Apple 測試帳號從邀請連結走一次：跳「以前用 Email 註冊過嗎？」時還不能加入、也沒有教學；選「沒有，這是新帳號」之後才加入並停在群組頁。6. 再用另一個全新 Apple 帳號從邀請連結進來，這次選「有，登入舊帳號」，在登出前不能出現「加入了」；用 Email 登入舊帳號後，加入的是舊帳號，雲端那個空的 Apple 帳號有被清掉。7. 如果有 Apple 隱藏信箱的測試帳號，確認「你的名字」答完或按「之後再說」以後才跳「加入了」。8. 在群組分頁的「輸入邀請碼」貼一個自己已經在裡面的碼，直接打開那個群組並說「你已經在「X」裡了」。

**注意**：第 3 批 U40：同一件事寫了兩份，U40 改用這裡的 openInvite，U40 (3) 跳過（第 1 批合5、第 3 批合2）。第 4 批 U51：旗標統一叫 authSettling，onChange 只留一個，maybeStartCoach 的 guard 併成一行（第 1 批合7、合8，第 4 批合6）；第 4 批合6 的 onChange 在 useOld 時會誤觸發，這裡的 (4) 已經補上。第 4 批 U51 (4) 改的 ClipWatch.check guard（Onboard.swift:80-81）跟這裡不重疊。第 6 批 U129：同一個 .task，TripStore.load 放在 :57 和 :58 中間（第 6 批合7）。3fc00de 和 5d713ac 改的訊息條（FoodMapApp.swift:111-183，5d713ac 在 :119-122 加了 tripPad）跟這裡沒有重疊，onOpenURL 掛在 :109 之後、:110 訊息條 overlay 之前就好。d95fd43 只改 TripsList.swift，跟邀請流程無關。
