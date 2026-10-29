# 截圖問題根因與修法 G1–G9（多代理調查＋反方驗證，2026-10-29）

基準：Swift 分支 5b5355c（行號以該版為準）。每項先列調查結果，再列反方驗證；**反方給了更正時，以「最後修法」為準**。G9 是完整性審查找到的，沒有經過反方驗證。

## G1 深色模式文字看不見

### G1a（P0，反方確認）深色模式下背景變深，但字和很多按鈕顏色寫死，所以深底配深字

**證據**
- 截圖 t33：首頁面板背景變深，「這一帶 N 間」標題整行看不到。篩選籤（想去／去過／餐廳）和右側「行程」、定位鈕仍是白底
- 截圖 t34：行程面板「從第 1 站出發」、站名、時間、停留都看不到。🔍 方塊仍是白底
- 截圖 t35：店家頁資料卡的店名、地址、「去過」字、底部「加進行程」等字幾乎消失
- FoodMap/Models.swift:73-76 Color.bg / bg2 / panel / cardShadow 用 Color(light:dark:)，深色時變成 0x17110b / 0x2a2016 / 0x241b12 / 0x0d0905
- FoodMap/Models.swift:77 Color.ink = Color(hex: 0x2a1a0a) 固定深咖啡，不會變色
- FoodMap/Models.swift:85-87 Color(light:dark:) 用 UIColor 動態 provider，看 userInterfaceStyle 決定深淺
- FoodMap/ListTab.swift:29 「我的收藏」標題 foregroundStyle(Color.ink)；ListTab.swift:219 卡片店名 Color.ink
- FoodMap/PlaceDetail.swift:118 店名 Color.ink；PlaceDetail.swift:123、127 分店／地址資訊 Color.ink.opacity；PlaceDetail.swift:360 想去／去過切換沒選到那邊 Color.ink.opacity(0.45)；PlaceDetail.swift:375 卡片底 Color.panel（會變深）
- FoodMap/TripPanel.swift:326 「從第 1 站出發」Color.ink.opacity(0.75)；TripPanel.swift:1366 站名、1377 停留、1411-1413 時間都是 Color.ink
- FoodMap/MapTab.swift:1047 首頁面板標題（這一帶 N 間）Color.ink；MapTab.swift:1049 小字 Color.ink.opacity(0.45)
- FoodMap/Theme.swift:57 Chip solid 時背景 .white；Theme.swift:158 CircleIcon 背景 .white；MapTab.swift:290 「行程」鈕 .white；TripTop.swift:183 🔍 方塊 candy(fill: .white)
- 數量：Color.ink 在 17 個檔共 193 處，.white 在 21 個檔共 131 處，.black 88 處，Color(hex:) 48 處；會變色的只有 bg/bg2/panel/cardShadow 加上 GroupsTab.swift:674 一處
- FoodMap.xcodeproj/project.pbxproj:247-255、276-284 主 App 沒有 INFOPLIST_KEY_UIUserInterfaceStyle；全專案也沒有 preferredColorScheme 或 overrideUserInterfaceStyle

**根因**：色票只做了一半深色：背景類（bg/bg2/panel/cardShadow，加上 GroupsTab.swift:674）會跟著系統變深；字色 Color.ink 固定是深咖啡；白底按鈕和卡片寫死 .white（Theme.swift:56 Chip、Theme.swift:74 Badge、Theme.swift:158 CircleIcon、MapTab.swift:290、TripTop.swift:183 等）。另外有一小批字用 .primary／.secondary，會跟系統變白。App 沒有任何地方鎖淺色，只有 TripGo、Coach、PinMenu、SwipeDeck 這幾個局部加了 .environment(\.colorScheme, .light)，所以這幾個畫面在深色下是正常的，其他畫面就變成深底深字或白塊。

**最後修法**：
根因確認。建議用 G1b 的方法鎖淺色（只改 project.pbxproj，不動 Swift），不要在這個 build 做深色主題（原因見 G1e）。

**反方意見**：根因成立，我自己對過程式和截圖。Models.swift:73-76 的 bg/bg2/panel/cardShadow 用 Color(light:dark:)（Models.swift:85-87，UIColor 動態 provider 看 userInterfaceStyle）；Models.swift:77 Color.ink = Color(hex: 0x2a1a0a) 固定。ListTab.swift:29、219，PlaceDetail.swift:118、123、127、360、375，TripPanel.swift:326、1366、1377、1411，MapTab.swift:1047、1049，Theme.swift:158，MapTab.swift:290，TripTop.swift:183、222，FoodMapApp.swift:137、323 的內容都跟他寫的一樣。Color.ink 確實是 17 個檔共 193 處。截圖也對得上：t33 面板標題列整行看不到，篩選籤和行程／定位鈕是白塊；t34「從第 1 站出發」、站名、時間幾乎消失，🔍 是白底；t35 店名、地址和底部「加進行程」都消失，返回鍵和「⋯」是白底。
要更正的小地方：1) Chip 的白底在 Theme.swift:56，不是 57（57 是 overlay 描邊，58 才是 mix(with: .black) 的字色）。2) 用字邊界算，.white 是 21 個檔共 126 處，不是 131 處。3)「全部寫死」這個說法不完整。有一批字用系統語意色 .primary／.secondary／.tertiary，深色時會自動變白：Theme.swift:118 搜尋框放大鏡、SearchField 裡的 TextField、GroupsTab.swift:489、513-514、518，Edit.swift:19、41、239，MeTab.swift:279、338，TripTop.swift:261。所以 t33 的搜尋列（panel 底加系統白字）看得到。也就是說，現在深色模式下是三種東西混在一起：會變色的底、固定的 ink 字、會變色的系統字。這更說明不能靠零星修補，要嘛整個鎖淺色，要嘛整套重做。4) 深色膠囊（Color.ink 底配白字，例如搜尋列左邊的「我的收藏 ▾」、t34 的行程標題、分頁列）在深色下仍然看得清楚，問題只在 ink 被拿來當字色的地方。

**風險**：無（這項只是根因說明）。

**模擬器驗證**：模擬器切深色（xcrun simctl ui booted appearance dark）後，重拍 t33、t34、t35 和收藏頁 t30：每個字都要看得清楚，背景要跟淺色版 t00、t05、t15 一樣是奶油色，地圖是淺色。

### G1b（P0，反方確認）主 App 鎖淺色：在 Xcode 設定加 UIUserInterfaceStyle = Light

**證據**
- FoodMap.xcodeproj/project.pbxproj:239-266 FoodMap 目標 Debug（F00D0000000000000000000E）的 buildSettings，GENERATE_INFOPLIST_FILE = YES，用 INFOPLIST_KEY_* 產生 Info.plist
- FoodMap.xcodeproj/project.pbxproj:268-295 FoodMap 目標 Release（F00D0000000000000000000F）同上
- FoodMap/MapTab.swift:146 Map 的 .mapStyle(.standard(pointsOfInterest: .excludingAll)) 沒指定深淺，跟著系統走（t33 是深色地圖）
- FoodMap/PlaceDetail.swift:432、FoodMap/TripsList.swift:218 小地圖和行程縮圖的 MKMapSnapshotter 用 @Environment(\.colorScheme) 決定深淺
- FoodMap/Assets.xcassets/LaunchBg.colorset/Contents.json 啟動畫面背景有深色版 0x17110b；FoodMap/LaunchScreen.storyboard:28 用這個顏色
- 系統元件：GroupsTab.swift:21、MeTab.swift:46、PlaceDetail.swift:71 Menu；Draw.swift:289-291 Toggle；Edit.swift:121-146 Picker；MapTab.swift:346、352 confirmationDialog；FoodMapApp.swift:89、96 alert；Nav.swift:46 UIActivityViewController；GroupsTab.swift:279 ShareLink；MapTab.swift:339-358 多個 sheet
- FoodMap/TripGo.swift:95-96 用 Color.panel 再加 .environment(\.colorScheme, .light)，證明 SwiftUI 會照 colorScheme 解析 Color(light:dark:)，鎖淺色後 panel 等都會回到淺色值

**根因**：主 App 的 Info.plist 沒有 UIUserInterfaceStyle，iOS 預設跟系統深淺色走。

**最後修法**：
維持原修法：FoodMap.xcodeproj/project.pbxproj 第 255 行（Debug）和第 284 行（Release）的 INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait; 下面，各加一行 INFOPLIST_KEY_UIUserInterfaceStyle = Light;（用 tab 縮排）。改完跑 plutil -lint，build 後檢查產出的 Info.plist 有沒有 UIUserInterfaceStyle = Light。不動任何 Swift。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

只改 FoodMap.xcodeproj/project.pbxproj，不動 Swift：
1) 在 FoodMap 目標 Debug 區塊（第 255 行 INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait; 下面）加一行：
   INFOPLIST_KEY_UIUserInterfaceStyle = Light;
2) Release 區塊（第 284 行同一行下面）也加一樣的一行。
兩個都要加，否則 TestFlight（Release）不會生效。
這樣整個 App 的所有視窗 userInterfaceStyle 都是 light，會一起變淺色的有：SwiftUI 的 colorScheme（所以 Color.bg/bg2/panel/cardShadow、GroupsTab.swift:674 都用淺色值）、Map（MapTab.swift:146 不用改）、MKMapSnapshotter（scheme 會是 .light，快取 key 永遠是 "l"，不用改）、sheet、Menu、Toggle、Picker、alert、confirmationDialog、分享面板、鍵盤、啟動畫面。
不需要再加 .preferredColorScheme(.light)：它只管 SwiftUI 那一棵樹，管不到啟動畫面和 UIKit 自己開的視窗，Info.plist 這個比較完整。LaunchBg 的深色版可以留著，鎖了就不會用到。

</details>

**反方意見**：位置正確：pbxproj 第 239 行是 F00D…0E Debug、第 268 行是 F00D…0F Release，兩個都是 GENERATE_INFOPLIST_FILE = YES，INFOPLIST_KEY_UISupportedInterfaceOrientations 分別在第 255、284 行；主 App 沒有自己的 Info.plist 檔。INFOPLIST_KEY_UIUserInterfaceStyle 是 Xcode 正式的 build setting（Info 頁的 Appearance），值寫 Light。Info.plist 鎖淺色會作用到這個程序的所有 UIWindow，包括 Login.swift:29 keyWindow() 拿來開 UIActivityViewController（Nav.swift:46）的那個視窗，也包括 SwiftUI 的 colorScheme、Map（MapTab.swift:146）、sheet、Menu、alert、confirmationDialog、鍵盤和 LaunchScreen.storyboard:28 的 LaunchBg。PlaceDetail.swift:403、432 和 TripsList.swift:195、218 從環境讀 scheme，會固定拿到 .light，快取 key 也會固定。這個改法不違反專案規則：不用 KVC／私有 API，不改 Map 的 safe area 或大小，不影響效能，也跟按下就開始動的規則無關。375pt 小螢幕不受影響。規格裡沒有要求深色模式，只有 UX改版實作規格.md:11、31、117 提到「深色膠囊」，那是 Color.ink 底色，鎖淺色後完全不變。不加 .preferredColorScheme 的判斷也對。
補兩點：1) pbxproj 是純文字，要用 tab 縮排、行尾加分號。改完在 Mac 上跑 plutil -lint FoodMap.xcodeproj/project.pbxproj 確認格式沒壞。build 完可以用 plutil -p <build 出來的 .app>/Info.plist | grep UIUserInterfaceStyle 確認值真的寫進去了。Swift thread 只能做語法檢查，這一步是唯一能在送 TestFlight 前確認生效的方法。2) 這是產品取捨，夜間使用時地圖也會是亮的，要讓 Anthony 知道。

**風險**：這是 build setting 改動，不會影響編譯。使用者在系統設深色時這個 App 仍是亮的，這是刻意的取捨。啟動畫面在實機上有快取，舊截圖可能要重開機或重裝才會更新，驗收時不要誤判。

**模擬器驗證**：1) 模擬器切深色：xcrun simctl ui booted appearance dark。2) 刪掉 App 重裝（啟動畫面有快取），冷啟動看啟動畫面是奶油色。3) 依序看首頁三段（t00-t02）、行程面板（t05、t10、t11）、店家頁頂和底（t15、t20）、收藏頁（t30、t31）、群組（t23、t24）、我的（t25）、新增視窗（t32）：全部跟淺色版一樣，地圖是淺色。4) 打開店家頁「⋯」Menu、刪除確認、導航選擇的 confirmationDialog、抽一間設定的 Toggle、新增視窗鍵盤、分享到群組的分享面板：都是淺色。5) 切回淺色再看一次，外觀沒變。

### G1c（P3，反方確認）分享擴充（BitemapShare）沒鎖淺色，但目前深色下看得清楚

**證據**
- BitemapShare/ShareViewController.swift:107 卡片背景 .regularMaterial（系統材質，深淺色自己會變）
- BitemapShare/ShareViewController.swift:101-103 文字沒指定顏色，用系統 primary，深色時自動變白
- BitemapShare/ShareViewController.swift:97 圖示 Color.orange / Color.red，深淺都看得到
- BitemapShare/ShareViewController.swift:9-13 viewDidLoad 用 UIHostingController 包 ShareCard
- FoodMap.xcodeproj/project.pbxproj:304-306、328-330 BitemapShare 目標 Debug／Release，GENERATE_INFOPLIST_FILE = YES 加 INFOPLIST_FILE = BitemapShare-Info.plist
- BitemapShare-Info.plist 只有 NSExtension，沒有 UIUserInterfaceStyle
- 分享擴充沒有用到 Color.ink 或 Color.bg（ShareViewController.swift 沒有 import 主 App 的色票）

**根因**：分享擴充是獨立程序，主 App 的 Info.plist 設定管不到它。但它的卡片全用系統顏色（材質＋primary 文字），深色時是深灰卡白字，看得清楚，不算壞掉，只是跟主 App 鎖淺色後的風格不一致。

**最後修法**：
可選，只為了一致性。用最確定有效的寫法：在 BitemapShare/ShareViewController.swift 的 viewDidLoad() 裡、super.viewDidLoad() 下一行加：
    overrideUserInterfaceStyle = .light
（公開 UIKit API，子控制器 UIHostingController 會繼承，SwiftUI 的 colorScheme 就是 light）。
另一種是在 BitemapShare 的 Debug／Release buildSettings 加 INFOPLIST_KEY_UIUserInterfaceStyle = Light;，或在 BitemapShare-Info.plist 加 <key>UIUserInterfaceStyle</key><string>Light</string>。但分享擴充是否會照 Info.plist 這個鍵套用，我無法從程式確認（unknown），所以建議用 overrideUserInterfaceStyle，或兩個都加。

**反方意見**：有核對：ShareViewController.swift:9-19 的 viewDidLoad 用 UIHostingController 包 ShareCard；卡片用 .regularMaterial（107）、字沒指定顏色（101-103）、圖示是 Color.orange／Color.red（97），沒用到主 App 的色票，深色下看得清楚。BitemapShare-Info.plist 只有 NSExtension。主 App 的 Info.plist 管不到分享擴充，這點也對。分享擴充的畫面由宿主 App 遠端顯示，trait 可能從宿主那邊帶進來，所以只靠 Info.plist 的鍵是否生效確實不確定。建議用 overrideUserInterfaceStyle = .light 是對的：它是公開的 UIKit API，加在 super.viewDidLoad() 下面，子 UIHostingController 會繼承。這項不是 bug，只是風格統一，P3 合理；這個 build 不改也可以。

**風險**：改 Swift 只有一行，在 UIViewController 子類別裡用 overrideUserInterfaceStyle 不會編譯失敗。不改也不會出現看不見字的問題。

**模擬器驗證**：模擬器深色模式下，在 Safari 或備忘錄選一段網址按分享，選 Bitemap：「收藏中…」卡片是淺色材質、深色字；完成後的勾勾是橘色。淺色模式再試一次，外觀一樣。

### G1d（P3，反方確認）已經寫了 .environment(\.colorScheme, .light) 的 6 個地方：鎖淺色後先保留，不要拿掉

**證據**
- FoodMap/TripGo.swift:96、123、159
- FoodMap/Coach.swift:283
- FoodMap/PinMenu.swift:79
- FoodMap/SwipeDeck.swift:167
- FoodMap/TripsList.swift:183、195、218 和 FoodMap/PlaceDetail.swift:397、403、432 讀 colorScheme 決定截圖深淺和快取 key

**根因**：這些是之前個別修深色時加的局部鎖淺色。全域鎖淺色後它們變成多餘的，但沒有副作用：本來就是 light，再設一次 light 不會改變畫面，也不會多花效能。

**最後修法**：
這個 build 不要動它們，也不要動 TripThumb／MiniMap 的 scheme 判斷。理由：1) 拿掉沒有任何畫面上的好處；2) Swift thread 只能做語法檢查，改越多檔越容易第一次編譯失敗；3) 如果以後要做深色主題，這幾個地方本來就要維持淺色（教學氣泡、圖釘選單、滑卡、出發模式卡片），留著剛好。等以後清程式碼時再決定。

**反方意見**：6 個 .environment(\.colorScheme, .light) 都核對過：TripGo.swift:96、123、159，Coach.swift:283，PinMenu.swift:79，SwipeDeck.swift:167。它們都放在 background 後面，會套到整個卡片。全域鎖淺色後它們變成多餘，但沒有副作用，也不花效能。保留的理由（Swift thread 只能做語法檢查、改得越少越安全、以後做深色主題時這些本來就要維持淺色）都成立。PlaceDetail.swift:397/403/432 和 TripsList.swift:183/195/218 的 scheme 判斷保留也沒問題。

**風險**：無。

**模擬器驗證**：不用另外驗。G1b 的深色模式檢查中，順便看出發模式卡片（TripGo）、教學氣泡（Coach）、點圖釘的選單（PinMenu）、滑卡（SwipeDeck）都是淺色。

### G1e（P2，反方確認）如果不鎖淺色、改做一套深色主題：要改的範圍很大，這個 build 不建議做

**證據**
- Color.ink 共 193 處，分在 17 個檔：TripPanel 30、GroupsTab 24、MeTab 23、MapTab 18、ListTab 17、Draw 12、PlaceDetail 12、TripTop 12、Onboard 10、TripGo 10、TripsList 7 等
- Color.ink 同時被當成「深色膠囊底色」：FoodMapApp.swift:137 訊息條、TripTop.swift:183 和 222 選到時的底、ListTab.swift:213 照片上小膠囊、Draw.swift:613、619；規格 UX改版實作規格.md:31 和 117 也規定深色膠囊用 Color.ink
- FoodMapApp.swift:323 分頁列底色直接寫 Color(hex: 0x2a1a0a)，沒用 Color.ink
- 寫死 .white 當卡片／按鈕底、上面放 Color.ink 字：Theme.swift:57（Chip）、74（Badge）、158（CircleIcon）；MapTab.swift:276、290；Draw.swift:519；GroupsTab.swift:253、726、759；TripTop.swift:183、222、438；TripPanel.swift:1306、1331、1516；SwipeDeck.swift:164、178；Coach.swift:199、222、277、370、422；Login.swift:132
- 深色用 .mix(with: .black) 加深的字色：Theme.swift:58、PlaceDetail.swift:155、220、256（深底上會更暗）
- ChunkyStyle（Theme.swift:13-28）和 candy()（Theme.swift:7-9）本身是用 panel/cardShadow，深色可以沿用
- UX改版實作規格.md:11 規定外觀沿用甜甜圈糖霜，且要跟 Yaay（深紫夜色風）明顯不同

**根因**：Color.ink 一個名字有兩種用途：當「字的顏色」（深色時應變淺）和當「深色膠囊的底色」（深色時應維持深）。直接把 Color.ink 改成會變色，膠囊就會變淺底配白字，換成另一批看不見。另外有上百處寫死 .white 的底，深色時都得一個一個換。

**最後修法**：
不建議這個 build 做。若以後要做，步驟（範圍大，要分好幾次 PR）：
1) Models.swift:77 把 Color.ink 拆成兩個：inkText = Color(light: 0x2a1a0a, dark: 0xfff1dc)（字用）、inkFill = Color(hex: 0x2a1a0a)（深色膠囊底用，不變）。
2) 把上面列出來當底色用的 Color.ink（FoodMapApp.swift:137、TripTop.swift:183、222、ListTab.swift:213、Draw.swift:613、619 等）改成 inkFill，其餘約 180 處字色改成 inkText。
3) 上面列出的 .white 底色改成 Color.panel，或新增 Color.chip = Color(light: 0xffffff, dark: 0x3a2c1e)。
4) 所有 .mix(with: .black, by:) 的字色在深色時要改成 mix with white 或另訂色。
5) 分頁列 FoodMapApp.swift:323 在深色時要比背景亮，否則跟 bg 混在一起。
6) 每個畫面重新檢查對比，還要設計一套跟 Yaay 深紫夜色明顯不同的深色（例如巧克力甜甜圈深咖啡＋橘），這是設計工作，不是只改程式。
總共大約 300 多處、20 個檔，Swift thread 只能做語法檢查，一次大改很可能編譯失敗或漏改，風險高。

**反方意見**：範圍評估成立。最關鍵的觀察是 Color.ink 同時被當字色和深色膠囊底色，我核對過 FoodMapApp.swift:137、TripTop.swift:183、222、ListTab.swift:213、Draw.swift:613、619；規格 UX改版實作規格.md:31、117 也明確要求深色膠囊用 Color.ink 0.92。FoodMapApp.swift:323 寫死 Color(hex: 0x2a1a0a) 也對。不建議這個 build 做，同意。
要更正：1) Chip 白底在 Theme.swift:56，不是 57。2) PlaceDetail.swift:155 的 mix(with: .black) 是 ChunkyStyle 按鈕的邊色，不是字色；真正被加深的字色在 Theme.swift:58、PlaceDetail.swift:220、256。3) .white 用字邊界算是 126 處。4) 漏掉兩項：一是那批會自己變白的系統語意色（.primary／.secondary，例如 GroupsTab.swift:489、513-514、Edit.swift:19、41、MeTab.swift:279、338、Theme.swift:118），做深色主題時要決定是統一改成 inkText 還是保留系統色；二是 LaunchBg 的深色版 0x17110b 要跟新的深色 bg 對齊。整體結論不變：大約 300 處、20 個檔，要分好幾次 PR，還要先做設計，確保跟 Yaay 的深紫夜色風明顯不同。

**風險**：漏改一處就會出現深底深字或淺底白字；跟 Yaay 撞風格的風險；改動分散在 20 個檔，跟其他 G 項的修改容易衝突。

**模擬器驗證**：（只有真的做深色主題時才需要）深色模式下逐一截 t00-t35 每一張，用取色確認每段字和背景的對比度至少 4.5:1，深色膠囊（訊息條、行程標題、分頁列）在深底上仍看得出邊界。

### 反方補充（調查員漏掉的）
- UX改版實作規格.md 的測試清單 1–20 沒有深色模式這一項，所以 build 22 前一直沒抓到。建議加一條：系統切深色（xcrun simctl ui booted appearance dark）後，首頁、行程、店家頁、收藏頁、啟動畫面都要跟淺色版一樣。以後只要有人新加 Color(light:dark:) 或系統色，回歸測試就會抓到。
- FoodMap/Theme.swift:118、FoodMap/TripTop.swift:261、FoodMap/GroupsTab.swift:489、513-514、518、FoodMap/Edit.swift:19、41、239、FoodMap/MeTab.swift:279、338：這些字用 .primary／.secondary／.tertiary，深色時會變白，跟寫死的 Color.ink 混用。鎖淺色後就沒事；如果有人不鎖、只修 Color.ink，這幾處放在寫死 .white 的底上會變成白底白字。
- FoodMap/GroupsTab.swift:503 起的「從我的收藏加入」sheet 用系統 List 和 NavigationStack，深色時整頁是系統深色，跟其他糖霜畫面風格不一致。鎖淺色就會一起修好，但 G1b 的 sim_check 沒列這個 sheet，建議加進群組頁的檢查。
- FoodMap/TripChooser.swift:17 .presentationBackground(Color.bg) 是另一個會隨深色變色的 sheet 背景，調查員沒有列出。鎖淺色後正常，sim_check 可以順便看選行程的 sheet。
- FoodMap.xcodeproj/project.pbxproj 第 255、284 行：改 pbxproj 後 Swift thread 的語法檢查驗不到它。要在 Mac 上跑 plutil -lint，並檢查 build 出來的 Info.plist 有沒有 UIUserInterfaceStyle，否則 Release 少一行也不會發現（TestFlight 用的是 Release）。
- FoodMap/Assets.xcassets/AppIcon.appiconset 只有一張 universal 圖，沒有 iOS 18 的深色／染色版。UIUserInterfaceStyle 管不到主畫面圖示，使用者開深色主畫面時圖示由系統自動處理。這不是看不見字的問題，P3，可以另外排。

---

## G2 剪貼簿膠囊：任何網址都跳、蓋住地圖

### G2a（P1，反方要求修改）剪貼簿膠囊對任何網址都跳（IG、YouTube、新聞網站都問）：不跳「允許貼上」的前提下，iOS 沒有辦法看出是哪個網域

**證據**
- 截圖 t21、t22：IG 連結和 youtube.com 連結都出現同一條「剛複製了一個連結／按「貼上」收藏這間店」
- Onboard.swift:56 註解寫明只用 detectPatterns 看像不像網址，內容要等按系統「貼上」才拿得到
- Onboard.swift:66-74 check()：條件只有 changeCount 不同、沒開 sheet、hasLink() 為真，沒有網域過濾
- Onboard.swift:77-83 hasLink()：detectPatterns(for: [.probableWebURL]) 只回傳是或不是
- FoodMapApp.swift:56、FoodMapApp.swift:180-183：冷啟動時和每次回到 .active 都會呼叫 check()
- 規格 UX改版實作規格.md:29-30：要求 detectPatterns 判斷是網址後「才讀 string」，而且只認 instagram/threads/maps.app.goo.gl/google.com/maps/goo.gl/maps/share.google
- Apple 文件 UIPasteboard 總覽：hasStrings/hasURLs/types 和「Detecting patterns」這組方法可以用，不會通知使用者；讀內容的屬性或方法會通知
- Apple 文件 detectedPatterns(for:)（iOS 15+，key path 版）：只說有沒有對中，不給內容，所以不通知使用者
- Apple 文件 detectedValues(for:)（iOS 15+，可以拿到 \.probableWebURL 字串和 \.links）：會讓 App 拿到值，所以會通知使用者
- Apple 文件 detectValues(for:inItemSet:)（DetectionPattern 舊版，iOS 14-15）：Important 寫明呼叫時會通知使用者 App 讀了剪貼簿
- Apple 文件 UIPasteControl：iOS 16 以後用程式貼上（UIPasteboard.general.string）會跳提示要使用者同意，用這個按鈕貼上就不會

**根因**：同調查員：不跳「允許貼上」的公開 API 只回答「像不像網址」，拿不到網域；detectedValues 和 detectValues 能拿到網址，但文件寫明會通知使用者。規格第 29 行「是網址才讀 string」本身就會跳提示，在 App 裡修不掉。

**最後修法**：
保留 PasteButton 的做法。把「三次就永久關掉」改成「連按三次 ✕ 就兩週不問，並告訴使用者」，第 6 步不要做。只改 Onboard.swift 的 ClipWatch 和 ClipCapsule：
1) ClipWatch 加兩個屬性：
```swift
@ObservationIgnored private var skips = UserDefaults.standard.integer(forKey: "clipSkips")
@ObservationIgnored private var muteUntil = UserDefaults.standard.double(forKey: "clipMuteUntil")
func skip(_ store: Store) {
    skips += 1
    if skips >= 3 {
        skips = 0
        muteUntil = Date().timeIntervalSince1970 + 14 * 86400
        UserDefaults.standard.set(muteUntil, forKey: "clipMuteUntil")
        store.say("兩週內不再問；要收藏按右上「＋」")
    }
    UserDefaults.standard.set(skips, forKey: "clipSkips")
    dismiss()
}
```
2) check() 的 guard（Onboard.swift:68-69）加一個條件：`Date().timeIntervalSince1970 >= muteUntil`。
3) pasted()（Onboard.swift:108）開頭加 `skips = 0; UserDefaults.standard.set(0, forKey: "clipSkips")`。
4) ClipCapsule 的 ✕（Onboard.swift:157）改成 `Button { clip.skip(store) }`。8 秒自己收起不算一次。
5)（可選）hasLink()（Onboard.swift:77-83）改成不是 deprecated 的寫法：`(try? await UIPasteboard.general.detectedPatterns(for: [\.probableWebURL]))?.contains(\.probableWebURL) ?? false`。GroupsTab 照 G2f 刪掉，Edit.swift 是呼叫 hasLink()，不用動。
規格 A4 的「只認某些網域、已收藏不問、來源圖示、網址縮短」請 Anthony 改掉。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

結論：沒有既不跳提示、又只對美食連結出現的公開做法。真正分得出網域又不跳提示的入口是分享擴充（BitemapShare），它已經在了。建議保留 PasteButton 的做法，改成「不煩、不擋地圖」（位置見 G2b、文字見 G2c），另外在 Onboard.swift 的 ClipWatch 加一個連按 ✕ 三次就不再問的開關：
1) ClipWatch 加 `@ObservationIgnored private var skips = UserDefaults.standard.integer(forKey: "clipSkips")`，再加一個方法 `func skip() { skips += 1; UserDefaults.standard.set(skips, forKey: "clipSkips"); dismiss() }`。
2) check() 的 guard 加上 `skips < 3`（Onboard.swift:69）。
3) pasted() 開頭（Onboard.swift:109 之後）加 `skips = 0; UserDefaults.standard.set(0, forKey: "clipSkips")`。
4) ClipCapsule 的 ✕（Onboard.swift:157）從 `clip.dismiss()` 改成 `clip.skip()`。8 秒時間到自己收的不算一次。
5)（可選）想讓使用者自己再打開的話，在 MeTab 加一列「剛複製連結時提醒」，打開時把 clipSkips 設回 0。
6)（可選，降低舊連結也被問）Root 的 .onChange(of: phase) 在 p == .background 時存 `UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "clipLeft")`；check() 裡如果離開 App 超過 15 分鐘就不問，但要 `markSeen()`，不然下次回來還是會問。
另外要請 Anthony 改規格 A4：把「只認某些網域、已收藏不問、來源圖示、網址縮短、剛複製了一則 IG 貼文」改成「任何網址都問，但小而不擋，連按 ✕ 三次就不再問」。
不建議用 detectedValues：每次回到 App 都會跳系統提示，比現在更煩。

</details>

**反方意見**：根因對，我自己查過 Apple 文件：UIPasteboard 總覽寫 hasStrings、hasURLs、types、numberOfItems、itemSet(withPasteboardTypes:) 和 detect patterns 這一組不會通知使用者。detectedValues(for:)（iOS 15+）的 Discussion 原文是「Because this method gives the app access to the values it detects in the pasteboard, the system notifies the user」；detectValues(for:inItemSet:) 的 Important 也寫明會通知。所以「不跳提示」和「分得出網域」確實只能選一個。行號也對得上：Onboard.swift:55-56 註解、65-74 check()、77-83 hasLink()、FoodMapApp.swift:56、182，規格 29-31 行。

修法有兩個問題：
1）連按 ✕ 三次就永久不問（skips < 3，只有按貼上才歸零），會害到最該被問的人。最常按 ✕ 的情況正是新聞、YouTube 這類雜訊連結，按三次後之後複製 IG 也永遠不問，畫面上又沒有任何提示。第 5 步的 MeTab 開關被寫成「可選」，等於這個功能會悄悄消失。
2）第 6 步「離開 15 分鐘以上就不問」跟真實用法相反：在 IG 滑一陣子、複製、再滑 20 分鐘才回來，正是最常見的路徑。「同一次複製只問一次」靠的是 changeCount，已經能擋掉舊連結重複問，不需要再加時間判斷。
另外 hasLink() 用的 detectPatterns(for: Set<DetectionPattern>) 已列在 Apple 的 deprecated 清單，只會出 warning，可以順手換掉。

**風險**：三次就不再問之後，使用者可能忘了有這功能，所以需要 MeTab 的開關或 AddSheet 的提示（AddSheet 一直會提示）當退路。背景時間判斷要存在 UserDefaults，App 被系統關掉後冷啟動才讀得到。

**模擬器驗證**：模擬器上：1) `xcrun simctl pbcopy booted` 放入 https://news.pts.org.tw/article/1 → 切到主畫面再切回 → 膠囊出現（這次預期仍會出現）。2) 按 ✕，換一個網址再做一次，連續三次後第四次不再出現。3) 按一次「貼上」後 skips 歸零，下一次換網址又會出現。4) 全程不應出現系統的「允許貼上」提示。

### G2b（P2，反方要求修改）膠囊放在篩選籤正下方，蓋住籤的下緣和一整條地圖、圖釘

**證據**
- 截圖 t21、t22：膠囊（約 y 166–218pt）壓住篩選籤（約 y 137–171pt）的下緣，底下的粉紅圖釘也被蓋住一半
- FoodMapApp.swift:70-74：`.overlay(alignment: .top) { ClipCapsule().padding(.top, store.tab == 0 ? 104 : 6) }`，104 是寫死的數字，沒對齊籤那排
- Onboard.swift:146-148：兩行字加上 32pt 圓圖示和 44pt 高的 ✕，膠囊大約 52pt 高
- Onboard.swift:168：transition 從上面滑下來
- FoodMapApp.swift:112-161：toast 已經有「地圖分頁貼著面板上緣、右邊讓出行程／定位兩顆」的位置算法（第 116、138 行）
- Store.swift:51 panelTop 是 Store 上可以觀察的值（MapTab.swift:952 更新）

**根因**：同調查員：Root 用寫死的 top 104，把 52pt 高、整條寬的深色膠囊放在地圖頂端圖釘最密的地方。但 toast 的位置算法（FoodMapApp.swift:116、138）在面板最高段時本身就錯（會壓到籤），不能直接照抄。

**最後修法**：
照調查員第 1、2、4 步做：刪 FoodMapApp.swift:69-74，在 toast overlay 後面（162 行 `.environment(\.toastNS...` 之前）加 `.overlay(alignment: .bottom) { if store.loggedIn && clip.showing && store.coach.isEmpty && store.toast == nil && !TripMode.shared.on { ClipCapsule() } }`，transition 改成 `.move(edge: .bottom)`。
第 3 步改成下面這樣，用 MapPanel.shared.stage（@Observable）擋掉最高段：
```swift
// ClipCapsule.body 開頭
let low = store.tab == 0 && store.mapPath.isEmpty && store.panelTop > 0 && MapPanel.shared.stage != .high
...
.padding(.horizontal, 16)
.padding(.trailing, low ? 52 : 0)
.padding(.bottom, low ? store.panelTop + 8 : 96)
.animation(.snappy, value: store.panelTop)
```
最高段改放在 TabBar 上方（底部 96），那時候行程和定位兩顆已經淡掉，不用讓右邊。
文字一定要跟 G2c 的縮短一起改，不然 375pt 會截斷。
toast 也建議套同一個條件，FoodMapApp.swift:116 的 onMap 加上 `&& MapPanel.shared.stage != .high`。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

改成跟 toast 用同一個位置：地圖分頁時在面板上緣，其他分頁在底部 96pt。toast 出現時先讓 toast。這樣只改 Root 的 overlay 和 ClipCapsule，不動 Map 的 safe area 和大小，不會觸發重排。
1) FoodMapApp.swift:69-74：刪掉整段 `.overlay(alignment: .top) { if clip.showing ... ClipCapsule().padding(.top, ...) }`。
2) FoodMapApp.swift:161（toast 的 overlay 結束的 `}`）和 162（`.environment(\.toastNS, toastNS)`）之間加：
```swift
.overlay(alignment: .bottom) {
    if store.loggedIn && clip.showing && store.coach.isEmpty && store.toast == nil && !TripMode.shared.on {
        ClipCapsule()
    }
}
```
3) Onboard.swift 的 ClipCapsule.body：第 167 行 `.padding(.horizontal, 16)` 改成下面這樣（panelTop 在 ClipCapsule 裡讀，拖面板時只有膠囊重算，Root 不會）：
```swift
.padding(.horizontal, 16)
.padding(.trailing, onMap ? 52 : 0)
.padding(.bottom, onMap ? store.panelTop + 8 : 96)
```
body 開頭加 `let onMap = store.tab == 0 && store.mapPath.isEmpty && store.panelTop > 0`。
4) Onboard.swift:168 transition 改成 `.move(edge: .bottom).combined(with: .opacity)`。
5) 膠囊改小一點，配合 G2c 改成一行字：第 164 行 `.padding(.vertical, 4)` 改成 `.padding(.vertical, 2)`，第 159 行 ✕ 高度維持 44（點擊範圍），整條大約 48pt。

</details>

**反方意見**：根因對。FoodMapApp.swift:70-74 寫死 padding(.top, 104)。我量了 t21：每 1pt 約 1.49px，膠囊在 y≈167–218pt，籤那排在 y≈137–167pt，兩者剛好相接，「壓住籤的下緣」有點誇大，但下面那條地圖和粉紅圖釘確實被蓋住。搬到 Root 底部 overlay、不放進面板 top VStack 的方向是對的：MapTab.swift:945 會量 top VStack 的位置當 probe.foot，面板在中段時 setFoot（MapTab.swift:539-542）會改 footY，進而改 Map 的 safeAreaPadding（MapTab.swift:149），會觸發約 0.5 秒的重排。

修法照抄 toast 的位置算法，會出三個問題：
1）面板在最高段時會蓋住篩選籤。panelTop 是 target+82（MapTab.swift:952），最高段 highT = bottomY − ceiling，面板上緣大約在 y≈191pt（t02）。膠囊底邊在 191−8=183pt，往上約 52pt，正好壓在籤那排（137–173pt）甚至搜尋列上，比現在更糟。toast 本身也有同樣的問題（FoodMapApp.swift:138）。
2）右邊讓出 52pt 後，375pt 寬的手機標題會被截斷。內容固定寬度約 181pt（左邊距 8、圖示 32、四個間距 40、Spacer 4、貼上鈕約 57、✕ 36、右邊距 4），402pt 寬剩約 137pt，375pt 寬只剩約 110pt。「剛複製了一個連結」（subheadline heavy）約 124pt，在 375pt 上會截斷。
3）panelTop 只在面板停好時更新，拖的時候不會跟，而且改值沒有包在動畫裡，停好時膠囊會瞬間跳位。
另外「拖面板時只有膠囊重算」這句不成立，因為拖的時候 panelTop 根本不變。面板上緣左邊的「N 間還沒有地址」膠囊（MapTab.swift:271-279）在 8 秒內會被完全蓋住，調查員只當成小風險。

**風險**：跟 toast 搶同一個位置，所以設定成 toast 優先。8 秒倒數在膠囊藏起來時照樣在跑，可以接受。面板上緣附近也有「N 間還沒有地址」和「找店中」膠囊，跟現在的 toast 一樣會暫時疊在上面。規格寫「搜尋列下面」，這裡要請 Anthony 同意改位置。

**模擬器驗證**：t21 的情境（面板最低段）：放一個網址到剪貼簿，切出去再切回來 → 膠囊出現在面板上緣、行程和定位兩顆的左邊，篩選籤和頂端地圖完全露出來。面板拉到中段、最高段時，膠囊跟著面板上緣走。切到收藏、群組、我的分頁時，膠囊在 TabBar 上方，不壓到 TabBar。膠囊還在的時候觸發一個 toast（例如加進行程）→ 膠囊先藏起來，toast 收掉後如果 8 秒還沒到就再出現。按下「貼上」後膠囊收起，原處出現「找店中…」。

### G2c（P2，反方要求修改）文字和圖示跟規格不一樣，而且「收藏這間店」先假設了是店家

**證據**
- Onboard.swift:144-145：左邊固定是 link 圖示配橘色圓底，沒有規格說的 IG／Google 地圖／Threads 來源圖示
- Onboard.swift:147：標題「剛複製了一個連結」（規格要「剛複製了一則 IG 貼文」）
- Onboard.swift:148：副標「按「貼上」收藏這間店」，沒有規格要的「網址縮短一行」
- Onboard.swift:152-156：右邊是系統 PasteButton，顯示「貼上」，不是規格寫的橘色「收藏」
- 規格 UX改版實作規格.md:31

**根因**：在不讀剪貼簿的前提下，來源、網址、標題都拿不到（見 G2a），所以規格的「IG 貼文、來源小圖示、網址縮短」做不出來。按鈕一定要用系統的 PasteButton 才不會跳提示，它的字只能是系統的「貼上」。程式的標題已經不假設是 IG，這是對的；但副標「收藏這間店」對新聞、YouTube 連結來說是錯的，會讓人覺得 App 很笨。

**最後修法**：
Onboard.swift:147 改成 `Text("剛複製了連結").font(.subheadline.weight(.heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)`，約 93pt。
148 改成 `Text("想吃的店就按貼上").font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.8)`，約 92pt。
兩行在 375pt 加上右邊讓出 52pt 的情況下也放得下（約 110pt）。圖示維持 link，按鈕維持 PasteButton。164 行 vertical padding 維持 4 就好，高度是 ✕ 的 44pt 撐出來的，改成 2 只差 4pt。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

Onboard.swift:148 副標改成 `Text("想吃的店？按「貼上」收進來")`；第 147 行標題維持「剛複製了一個連結」。改成一行的話，刪掉第 148 行，第 147 行改成 `Text("剛複製了連結，是想吃的店嗎？")`，搭配 G2b 縮小高度。圖示維持通用的 link（不能假設來源）。按鈕維持 PasteButton，不要換成自己畫的「收藏」，不然按下去會跳「允許貼上」。規格 A4 的長相那一行要跟著改。

</details>

**反方意見**：根因對：拿不到來源，PasteButton 的字也改不了，而且 tint(Color.accent) 已經是橘色。副標「收藏這間店」對新聞、YouTube 連結來說是錯的。

建議的字放不下：「剛複製了連結，是想吃的店嗎？」14 個字，subheadline heavy 約 210pt。照 G2b 讓出右邊 52pt 之後，402pt 寬只剩約 137pt，375pt 寬只剩約 110pt，就算加 minimumScaleFactor(0.85) 也約 180pt，一定截斷。兩行版的副標「想吃的店？按「貼上」收進來」用 caption2 約 140pt，在兩種寬度下也都超過。

**風險**：PasteButton 的寬度由系統決定，可能因語系而變寬，副標要設 lineLimit(1) 並允許縮小（.minimumScaleFactor(0.85)）。

**模擬器驗證**：放一個 youtube.com 網址進剪貼簿，切出去再切回來 → 膠囊上的字沒有提到「店」或「IG」，而是在問是不是想吃的店。字是白色，在 Color.ink 0.92 底色上看得清楚，一行放得下，不會截斷（iPhone 17 寬度，扣掉 G2b 右邊讓出的 52pt）。

### G2d（P3，反方確認）「已收藏過的不問」：做不到事前不問，只能按了貼上之後才說「之前收藏過了」

**證據**
- 規格 UX改版實作規格.md:30「已經收藏過的同一個 source_url 不問」；測試清單 UX改版實作規格.md:136「複製已收藏的店的 IG 網址 → 不出現」
- Onboard.swift:108-116 pasted()：按了貼上，拿到字之後，才用 key() 比對 store.mine 的 source_url，對中就 toast「之前收藏過了」，不送 startAdd
- Onboard.swift:122-129 key()：比對前先去掉 query 和結尾的 /

**根因**：要知道是不是同一個 source_url，得先讀到網址，而讀網址會跳「允許貼上」（見 G2a）。所以只能退一步：先問，按了貼上才比對。測試清單第 2 條的後半段在現在的做法下一定不會過。

**最後修法**：
程式不用改，現在的退讓做法是合理的。要請 Anthony 把測試清單第 2 條後半段改成「複製已收藏的店的 IG 網址 → 膠囊會出現，按貼上後 toast『之前收藏過了』，不會重複收藏」。

**反方意見**：Onboard.swift:108-119 pasted() 是拿到字之後才用 key() 比對 store.mine 的 source_url，對中就 toast「之前收藏過了」；規格第 30 行和測試清單第 136 行（行號正確）在不讀剪貼簿的前提下做不到事前就不問。key() 會去掉 query、fragment、www. 和結尾的 /，比對合理。只差請 Anthony 改測試清單。

**風險**：store.mine 只包含自己的店；朋友群組裡有的店，還是會再收一次（這是預期的行為）。

**模擬器驗證**：拿一間已收藏、source_url 是 instagram.com/reel/XXX 的店，把 https://www.instagram.com/reel/XXX/?igsh=abc 放進剪貼簿，切出去再切回來 → 膠囊出現 → 按「貼上」→ toast「之前收藏過了」，收藏頁沒有多出「找店中」卡片。

### G2e（P3，反方確認）8 秒自己收、同一次複製只問一次、從上面滑下：已經照規格做了

**證據**
- Onboard.swift:91-100 show()：一出現就把 changeCount 存進 UserDefaults 的 clipSeen，同時開一個 8 秒的 Task 去呼叫 dismiss()
- Onboard.swift:66-70 check()：n != seen 才問，所以同一次複製只問一次，App 重開也記得
- Onboard.swift:132-135 sheetOpen：有 sheet 開著時不問；Onboard.swift:69 教學中、IG 教學、通知小卡、行程模式也不問
- FoodMapApp.swift:72 和 Onboard.swift:94：用 spring 動畫加 move(edge: .top) 和淡入出現

**根因**：這幾項都做到了。截圖 t21、t22 是兩次不同的複製（8:16、8:17），不是同一次複製重複出現。唯一的小瑕疵：冷啟動時 .task（FoodMapApp.swift:56）和 .onChange(.active)（FoodMapApp.swift:182）可能幾乎同時呼叫 check()，兩邊都通過 guard 後各呼叫一次 show()，結果只是 8 秒倒數重新開始，看起來沒有差別。

**最後修法**：
不用改。如果採用 G2b 改到底部，transition 要記得改成從下面出來（已經寫在 G2b 第 4 步）。

**反方意見**：show()（Onboard.swift:91-100）會存 clipSeen，同時開 8 秒的 Task；check() 用 n != seen 擋住同一次複製，App 重開也記得。小地方要更正：冷啟動時 .task 的 check()（FoodMapApp.swift:56）排在 `await store.sync()` 之後，跟 onChange(.active) 不是「幾乎同時」。就算兩邊都呼叫，結果也只是倒數重新開始，看不出差別。spring 動畫在 Onboard.swift:94，不是 FoodMapApp.swift:72。另有一點沒提到：8 秒倒數在手指按著膠囊時不會暫停（toast 有 toastHeld），伸手要按「貼上」的瞬間可能剛好收掉，列在 missed。

**風險**：無

**模擬器驗證**：放一個網址進剪貼簿，切出去再切回來 → 膠囊出現，不碰它，數 8 秒自己收起。再切出去切回來（沒有重新複製）→ 不會再出現。殺掉 App 冷啟動 → 也不會再出現。

### G2f（P2，反方要求修改）群組「輸入邀請碼」會用程式讀剪貼簿：剪貼簿有任何網址都會跳「允許貼上」，邀請文字卻對不到

**證據**
- GroupsTab.swift:108 註解說「不會跳允許貼上」，但第 114 行直接讀 `UIPasteboard.general.string`
- GroupsTab.swift:111-112：只用 detectPatterns(.probableWebURL) 判斷是網址，任何網址（例如剛複製的 IG 連結）都會往下讀
- Apple 文件 UIPasteControl：iOS 16 以後用程式讀 UIPasteboard.general.string 會跳提示要使用者同意
- GroupsTab.swift:793 inviteText 是多行文字（說明＋連結＋邀請碼）；Apple 文件說 probableWebURL 是「整串字就是一個網址」，所以朋友複製整段邀請文字時對不到，不會自動填
- GroupsTab.swift:796-802 FoodGroup.code(in:) 能從整段邀請文字抓出 8 碼
- GroupsTab.swift:55-60：邀請碼是在 alert 裡的 TextField 輸入

**根因**：這段的目的是幫忙自動填邀請碼，但判斷條件跟想要的內容對不起來：剪貼簿是 IG 或新聞網址時會讀（並跳系統提示，讀到後 code(in:) 又找不到碼）；剪貼簿是朋友傳來的整段邀請文字時反而不讀。而且這跟 A4 的「不跳允許貼上」原則衝突。

**最後修法**：
ask()：刪掉 107-108 行的註解和 110-116 行，只留 `text = ""; asking = a`。go() 整段改成：
```swift
private func go(_ a: Ask?) {
    guard let a else { return }
    let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let t = a == .join ? (FoodGroup.code(in: raw) ?? raw) : raw
    guard !t.isEmpty else { return }
    Task { ...原本兩行不變... }
}
```
code(in:) 的第一個 regex 抓 `code=XXXXXXXX`，所以就算貼進 alert 的 TextField 時換行被換成空白，也一樣抓得到。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

GroupsTab.swift ask(_:)：刪掉第 107-108 行的註解和第 110-116 行（guard 和整個 detectPatterns 區塊），只留 `text = ""; asking = a`。go(_:)（GroupsTab.swift:119 附近）把 `let t = text.trimmingCharacters(in: .whitespacesAndNewlines)` 改成：
```swift
let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
let t = a == .join ? (FoodGroup.code(in: raw) ?? raw) : raw
```
注意 a 是可選值，這兩行要放在 `guard ..., let a else { return }` 之後。這樣使用者在 TextField 長按貼上整段邀請文字（系統貼上不會跳提示），也能抓出 8 碼。另外，邀請連結本來就會走 onOpenURL（FoodMapApp.swift:63-66）直接加入。

</details>

**反方意見**：根因對：GroupsTab.swift:106-117 的 ask() 只用 detectPatterns(.probableWebURL) 判斷，然後在第 114 行直接讀 UIPasteboard.general.string，不是使用者自己按貼上，所以剪貼簿是任何外部網址都會跳「允許貼上」。inviteText（GroupsTab.swift:793）是多行文字，判斷不會對中。

修法的程式碼順序不對：go()（GroupsTab.swift:119-121）原本是 `let t = ...; guard !t.isEmpty, let a else { return }`，guard 本身要用到 t，所以不能照調查員說的「把兩行放在 guard 之後」，要拆成兩個 guard。

**風險**：少了「打開就自動填好」的方便，但原本這功能只在剪貼簿剛好是純邀請連結時才有用。

**模擬器驗證**：1) 剪貼簿放一個 IG 網址 → 群組分頁 → 輸入邀請碼 → 不會跳「允許貼上」，輸入框是空的。2) 剪貼簿放整段 inviteText → 在輸入框長按、貼上 → 按加入 → 用抓出來的 8 碼加入成功（用測試帳號）。3) 直接輸入 8 碼照樣能加入。

### G2g（P3，反方確認）新增視窗沒有照規格把連結直接填進輸入框，改成提示按「貼上」

**證據**
- 規格 UX改版實作規格.md:34：剪貼簿是指定連結時直接填進輸入框、不自動叫鍵盤
- Edit.swift:66-75 .task：ClipWatch.hasLink() 為真就顯示提示、不叫鍵盤，但不填內容
- Edit.swift:24-31：系統 PasteButton，按了才填，並 markSeen()，讓上方膠囊不會再問同一次複製
- Edit.swift:28-30 提示字「剛複製的連結，按「貼上」就填好」

**根因**：直接填就要用程式讀 string，會跳「允許貼上」（同 G2a），所以改成「不叫鍵盤＋提示按系統貼上」。這樣多按一下，但不會跳系統提示，而且鍵盤不會擋住。

**最後修法**：
不用改程式。要請 Anthony 把規格第 34 行改成「剪貼簿是網址 → 不叫鍵盤、在貼上鈕旁邊提示；按貼上才填入」。

**反方意見**：Edit.swift:66-75 的 .task 只呼叫 ClipWatch.hasLink()，不讀內容，是網址就顯示提示、不叫鍵盤；Edit.swift:24-31 PasteButton 按下才填，並呼叫 markSeen() 和 dismiss()。規格第 34 行「直接填進輸入框」要讀 string，會跳提示，所以現在的退讓是對的，請 Anthony 改規格就好。

**風險**：無

**模擬器驗證**：剪貼簿放一個 IG 網址 → 按「＋」開新增視窗 → 鍵盤不會自己跳出，貼上鈕旁邊有橘字提示；按貼上 → 輸入框填好網址、提示消失；關掉視窗再切出去切回來 → 上方膠囊不會為同一次複製再問。剪貼簿是普通文字時，鍵盤約 0.35 秒後自己出來。

### G2h（P3，反方要求修改）能不能用剪貼簿的 types（UTI）不跳提示分出來源 App：未驗證

**證據**
- Apple 文件 UIPasteboard 總覽：types、types(forItemSet:)、itemSet(withPasteboardTypes:)、hasURLs 都列在不會通知使用者的清單裡
- Onboard.swift:69 check() 目前只用 hasURLs || hasStrings

**根因**：不知道 IG、Threads、Google 地圖 App 複製連結時，會不會在剪貼簿寫進跟一般瀏覽器不同的 type（例如 public.url 有沒有，或某個 App 自己的 type）。如果會，就能不跳提示做到粗略的來源過濾；如果不會，這條路就走不通。沒有官方文件說明各 App 寫了哪些 type，所以不能下結論。

**最後修法**：
在 Onboard.swift:66 的 `let pb = UIPasteboard.general` 後面加（要分行）：
```swift
#if DEBUG
print("clip types", pb.types, pb.itemProviders.map(\.registeredTypeIdentifiers))
#endif
```
在真機上分別從 IG、Threads、Google 地圖、Safari、YouTube 複製連結後切回 App，看 Xcode console 的輸出，同時注意有沒有跳「允許貼上」。有穩定且是那幾個 App 獨有的 type，才拿來當加分條件。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

先量測，不要先改功能：在 ClipWatch.check()（Onboard.swift:66）的 guard 前面暫時加 `#if DEBUG print("clip types", UIPasteboard.general.types) #endif`，在真機上分別從 IG、Threads、Google 地圖、Safari、YouTube 複製連結後切回來，看 log。只有當 IG／Threads／Google 地圖的 types 有穩定且獨有的特徵時，才在 check() 加過濾；否則照 G2a 的做法。

</details>

**反方意見**：「沒有文件、要先量測」這個方向對；Apple 總覽確實把 types、types(forItemSet:)、itemSet(withPasteboardTypes:) 列在不會通知的清單裡。

但建議的除錯碼 `#if DEBUG print(...) #endif` 寫成一行在 Swift 是語法錯誤，#if 和 #endif 一定要各自換行。Swift thread 只能做語法檢查，第一次就會編不過。另外漏了一個能順便量的東西：總覽把 NSItemProvider.canLoadObject 列為不會通知，代表讀 itemProviders 本身應該不算讀內容，可以一起印出 registeredTypeIdentifiers；suggestedName 會不會跳提示沒有文件，要在真機上看。

**風險**：App 改版後可能隨時改寫入的 type，靠這個過濾很脆弱；就算有特徵，也只能當加分條件，不能當唯一條件。

**模擬器驗證**：這一項模擬器沒有 IG／Google 地圖 App，驗不了，要在 Anthony 的真機上看 Xcode console。

### 反方補充（調查員漏掉的）
- FoodMapApp.swift:116,138：toast 在面板最高段時，bottom padding 是 panelTop+8，會蓋在篩選籤上（t02 面板上緣約 191pt，籤在 137–173pt）。onTrip 有用 min(…,420) 夾住，onMap 沒有。G2b 照抄就會一起中，建議兩邊都加 `MapPanel.shared.stage != .high` 的判斷。
- Onboard.swift:79、GroupsTab.swift:111：用的是 detectPatterns(for: Set<UIPasteboard.DetectionPattern>)，Apple 已列為 deprecated（UIPasteboard Deprecated symbols 頁），要換成 `try await UIPasteboard.general.detectedPatterns(for: [\.probableWebURL])`。
- FoodMapApp.swift:72：現在的膠囊只看 store.tab == 0 就用 top 104，地圖分頁點進店家頁（mapPath 不是空的）時，會蓋在店家頁的照片和標題上。
- Onboard.swift:96-99：8 秒倒數在手指碰到膠囊時不會暫停（toast 用 store.toastHeld 暫停，FoodMapApp.swift:148、152-154），伸手要按「貼上」時可能剛好被收掉。可以比照 toast，用 simultaneousGesture(DragGesture(minimumDistance: 0)) 在按著時延後 hide。
- Onboard.swift:157-160：✕ 的點擊範圍是 36×44pt，寬度不到 44pt，又緊貼在 PasteButton 旁邊，容易按錯成「貼上」。建議 frame(width: 44, height: 44)。
- Onboard.swift:117-118：pasted() 拿到內容後，不管是 YouTube 還是新聞網址，都直接 startAdd，會白跑一次 AI 找店，還可能留下一張失敗的「找店中」卡。這時候已經讀到網址、知道網域了，可以對非 IG／Threads／Google 地圖的網址先 toast 問一聲，或標成「試試看」。
- Onboard.swift:61,87,92：clipSeen 存的是 changeCount，手機重開機後 changeCount 會重新算，可能剛好等於舊值，造成一次複製該問卻沒問。影響低，可以順便把系統開機時間一起存來比對。

---

## G3 行程交通方式預設走路，長距離變走路 7 小時、73 小時

### G3a（P1，反方要求修改）每段交通方式一律預設走路，跟距離無關（嘉義→雲林算成走路 7 小時 14 分）

**證據**
- t10.png：第 1→2 站顯示「🚶 走路 7 小時 14 分」，走路鈕亮著，第 2 站 18:14 到；t05.png 地圖上畫的是沿小路的走路路線
- Trip.swift:394、Trip.swift:398：TripStore.create 建行程時 mode 寫死 "walk"
- Trip.swift:16：Trip.mode 註解「新加的站預設怎麼過去」；整個 FoodMap 沒有任何地方改 Trip.mode（Trip.swift:410 的 update 只把原值送回去，TripsList.swift:308-310 的 save 只改 title/start_date/group_id）
- Trip.swift:456、Trip.swift:463：makeStop 新站 mode: nil → 用行程預設
- TripMode.swift:204：TripMath.mode = s.mode ?? t.mode ?? .walk，完全不看兩站距離
- TripMode.swift:212、TripMode.swift:225、TripMode.swift:230-236：第一段（目前位置→第 1 站）和回程段只用 t.mode
- TripPanel.swift:1503：LegRow 顯示的方式也是 to.mode ?? trip.mode
- TripsList.swift:157、TripsList.swift:198、TripsList.swift:221：行程清單卡片同樣用 b.mode ?? trip.mode
- TripRouter.swift:97-113：時間來自 MKDirections（walking/automobile），t10 沒有「約」字，所以 7 小時 14 分是 Apple 算出的真實走路路線，不是直線估
- TripRouter.swift:33-35、TripRouter.swift:49-61：路線快取 key 是「起點＋終點＋方式」，換方式只會多問一次新 key，舊的留在記憶體和 legs.json（TripRouter.swift:27），換回去不會重抓

**根因**：同原結論：Trip.mode 永遠是 "walk"，沒選過的段（stop.mode == nil）和第一段、回程都照抄 Trip.mode，完全不看距離。

**最後修法**：
大方向照原修法（Trip.swift 加 TravelMode.auto／pick，"walk" 當成自動），另外改這幾處：
- TripMath.mode 改成 `mode(_ t: Trip, _ s: TripStop, from a: CLLocationCoordinate2D?)` 以後，所有呼叫點都要一起改：TripMode.swift:212、234，TripPanel.swift:930 改 `TripMath.mode(t, b, from: ca)`，TripPanel.swift:1062，TripTop.swift:88 改 `TripMath.mode(t, b, from: ca)`，LegRow（TripPanel.swift:1503）改 `TripMath.mode(trip, to, from: from.coord)`。改完 grep `mode(t,` 和 `TripMath.mode(` 確認沒有漏掉。
- TripPanel.swift goMode（1061-1063）不要用 hereRounded。改成照計畫裡的那段：
```swift
private func goMode(_ t: Trip, _ order: [TripStop], _ s: TripStop) -> TravelMode {
    guard let i = order.firstIndex(where: { $0.id == s.id }) else { return .walk }
    if i == 0 { return .pick(t, nil, from: TripMath.origin(order, here: store.here), to: s.coord) }
    return TripMath.mode(t, s, from: order[i - 1].coord)
}
```
store.here 只設一次（MapTab.swift:363、372），所以結果固定，不會跟著移動一直變。goKey 照 G3e 改成從 goNeed 算。
- TripTop.swift:48 的 measure 可以照原修法改 TripMode.swift:294，也可以把參數改成直接傳 Trip，在裡面用 TripMath.mode。兩種寫法都要跟 TripTop.swift:88 用同一套規則。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

只改用戶端，不改資料庫的值（"walk" 當成「自動」）。
1) Trip.swift：在 enum TravelMode（第 66-73 行）後面加：
```swift
extension TravelMode {
    // 沒選過的段：直線 1.2 公里內走路，更遠開車；只看座標，結果固定，不會換 key 一直重抓
    static func auto(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> TravelMode {
        CLLocation(latitude: a.latitude, longitude: a.longitude)
            .distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude)) <= 1200 ? .walk : .drive
    }
    // 這段選過就照選的；行程預設是開車／捷運（舊資料）就照行程；其他依距離
    static func pick(_ t: Trip, _ s: TripStop?, from a: CLLocationCoordinate2D?, to b: CLLocationCoordinate2D?) -> TravelMode {
        if let r = s?.mode, let m = TravelMode(rawValue: r) { return m }
        if t.mode != "walk", let m = TravelMode(rawValue: t.mode) { return m }
        guard let a, let b else { return .walk }
        return auto(a, b)
    }
}
```
2) TripMode.swift TripMath：第 204 行改成 `static func mode(_ t: Trip, _ s: TripStop, from a: CLLocationCoordinate2D?) -> TravelMode { .pick(t, s, from: a, to: s.coord) }`；第 212 行改 `router.leg(a, b, i == 0 ? .pick(t, nil, from: a, to: b) : mode(t, s, from: a))`；第 225 行改 `router.leg(l, o, .pick(t, nil, from: l, to: o)).min`；needs（第 228-238 行）刪掉 `let tm`，第一段用 `.pick(t, nil, from: o, to: b)`、中間用 `mode(t, s, from: a)`、回程用 `.pick(t, nil, from: l, to: o)`。TripSearch.measure 第 294 行改 `let m = cs[i].0.mode.flatMap { TravelMode(rawValue: $0) } ?? (mode != .walk ? mode : .auto(a, b))`。
3) TripPanel.swift LegRow 第 1503 行改 `let m = TripMath.mode(trip, to, from: from.coord)`。goMode（第 1061-1063 行）改 `.pick(t, order.first?.id == s.id ? nil : s, from: hereRounded(), to: s.coord)`。
4) TripsList.swift 第 157、198、221 行的 `TravelMode(rawValue: b.mode ?? trip.mode) ?? .walk` 都換成 `TravelMode.pick(trip, b, from: a.coord, to: b.coord)`（198、221 行用各自的 a/b 變數）。
自動選的方式只由兩站座標決定，needKey（TripPanel.swift:792-794）跟著固定，.task(id:)（TripPanel.swift:175）不會因為重算而重跑，也不會重抓路線。

</details>

**反方意見**：根因對：Trip.swift:394、398 建行程寫死 "walk"；TripsList.swift:306-311 的 save 只改 title/start_date/group_id，App 裡沒有地方改 Trip.mode；TripMode.swift:204 `s.mode ?? t.mode`，212、225、230 第一段和回程只用 t.mode；TripRouter.swift:97-113 用 MKDirections，t10 的「走路 7 小時 14 分」沒有「約」，所以是真的走路路線（t05 地圖上那條沿山路的綠線）。快取 key 含方式（TripRouter.swift:33-35），換方式只會多抓一次，這也對。

修法有兩個地方會出事：
1) 「TripMath.mode( 只有 TripPanel.swift:1062 一個呼叫點」是錯的。還有 TripPanel.swift:930（gapCount 的 `TripMath.mode(t, b)`）和 TripTop.swift:88（routeKey 的 `TripMath.mode(t, b)`）。照原修法改簽名，這兩處會編譯失敗。TripTop.swift:88 如果沒改成同一套規則，routeKey 算的「已算好幾段」會跟 measure 用的 key 對不上，路線抓回來以後搜尋的「順路」距離不會重算。
2) goMode 改成 `.pick(t, 非第一站 ? s : nil, from: hereRounded(), to: s.coord)`，等於拿「現在位置到下一站」的距離來決定方式，而不是「上一站到這站」。出發模式下，開車開到離下一站 1.2 公里內，卡片會從「🚗 開車」跳成「🚶 走路」，跟面板上那段對不起來。goMode 也決定導航 App 用的方式（TripPanel.swift:1119 tripNavURL），所以導航會開成走路。hereRounded 每 100 公尺變一次，方式也會跟著來回跳，每跳一次就多一個新 key、多抓一次路線。

**風險**：已經存在的行程打開時，遠的段會從走路變成開車，每段第一次會多問一次 MKDirections（排隊一次一個，結果會快取）。測試行程畫面上的時間會整個變。TravelMode.pick 是 static，但 TripMath 有 @MainActor，從 LegRow body 呼叫沒問題。改了 TripMath.mode 的參數，所有呼叫點都要一起改，不然編譯會失敗（grep `TripMath.mode(`，目前只有 TripPanel.swift:1062）。

**模擬器驗證**：打開 TEST ux 行程：嘉義→雲林那段要亮開車鈕，顯示「🚗 開車 約 …」，幾秒後變成 Apple 算的開車時間（大約 1 小時內），第 2 站到達時間從 18:14 變成中午前後；地圖路線改成走省道。加兩間相距 1 公里內的店，中間那段要顯示走路。來回切換面板高度、離開再進行程，PerfHUD 不該出現新的同步或卡頓，路線也不會重畫閃一下。

### G3b（P1，反方確認）手動選的方式跟行程預設一樣時會存成 nil，改成自動選以後就分不出是使用者選的

**證據**
- TripPanel.swift:414：`x.mode = m.rawValue == t.mode ? nil : m.rawValue`，使用者按走路（等於行程預設 walk）會存 nil
- Trip.swift:38：TripStop.mode 註解「nil = 用行程預設」
- Trip.swift:501：update 只在 old.mode != s.mode 時送 mode

**根因**：原本的設計認為「跟行程預設一樣就不用記」。G3a 改成依距離自動選以後，nil 代表「自動」，使用者在一段長距離路上特地按走路，存下的會是 nil，下次重算又會變回開車，等於手動選的沒有被保留。

**最後修法**：
TripPanel.swift 第 414 行（block 裡 LegRow 的 pick closure）改成一律存明確值：`var x = s; x.mode = m.rawValue`。LegRow 第 1511 行的 `if x != m { pick(x) }` 不用改：自動選出開車時按走路會存 "walk"；自動選出走路時再按走路不會有反應，也沒有影響。要做「恢復自動」的話可以之後再加，這次先不做。

**反方意見**：TripPanel.swift:414 `x.mode = m.rawValue == t.mode ? nil : m.rawValue` 確實會把「走路」存成 nil。G3a 改成 nil 代表自動以後，長距離那段手動選的走路就留不住，所以 G3b 一定要跟 G3a 同一個 PR 上。修法改一行就好：`var x = s; x.mode = m.rawValue`。按下去 stops[i] 會在同一個 run loop 同步改掉（Trip.swift:494），那一幀按鈕就會亮，符合「按下就動」。要注意的是：這樣改完以後有明確值的段會變多，G3d（排順序以後方式套到別段）的影響會變大，G3d 也要一起修。

**風險**：以前按過走路的段在資料庫裡是 nil，改版後會被當成自動，長距離的會變開車。這是想要的結果，但跟使用者以前的選擇不完全一樣。

**模擬器驗證**：在嘉義→雲林那段（改版後自動是開車）按走路，按下那一幀走路鈕就要亮。按完成離開，再從行程清單打開，還是走路；殺掉 App 重開也還是走路。在 Supabase trip_stops 那一列看到 mode = 'walk'。

### G3c（P3，反方要求修改）長距離走路沒有任何提示，7 小時、73 小時照常顯示

**證據**
- t10.png：「🚶 走路 7 小時 14 分」用一般灰字顯示，沒有任何警告
- TripPanel.swift:1537-1541：LegRow.label 只寫方式和時間，沒有判斷距離或時間
- Trip.swift:145-148：TripDate.span 會照實寫出「73 小時」

**根因**：LegRow.label 不管時間多長都用同一種灰字。G3a 修好以後，這只剩「手動選走路」或「被排順序套錯」兩種情況會出現。

**最後修法**：
不要加按鈕，只改顏色加一小行字。TripPanel.swift LegRow.label 的 `else if let leg` 那支：條件改成 `m == .walk && !leg.approx && leg.min >= 90`（用 Apple 算出來的時間判斷，不用直線估的 meters）。符合時文字顏色改成 Color.accentDeep，下面加一行 `Text("走很久，可以改開車").font(.caption2.weight(.bold)).foregroundStyle(Color.accentDeep)`，兩行包進 `VStack(alignment: .leading, spacing: 1)`，不另外抓路線。深色模式要確認 accentDeep 在 Color.panel 上看得清楚。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

TripPanel.swift 的 LegRow.label，在 `else if let leg` 那支把 Text 包進 VStack(alignment: .leading, spacing: 2)，下面加：
```swift
if m == .walk, leg.meters > 3000 {
    Button { pick(.drive) } label: {
        Text("有點遠，改開車？").font(.caption.weight(.heavy)).foregroundStyle(Color.accentDeep)
            .frame(minHeight: 28).contentShape(.rect)
    }.buttonStyle(PressStyle())
}
```
用 leg.meters 判斷（直線估和真實路線都有這個值），不要另外去抓路線。走路時間的文字可以改用 Color.accentDeep，讓它更醒目。

</details>

**反方意見**：現在確實沒有提示（TripPanel.swift:1537-1541）。不過 G3a、G3b 修好以後，長距離還是走路的只剩兩種：使用者剛剛自己按了走路，或是 G3d 那種排順序後被套到別段的舊值。對第一種人，在剛按的走路旁邊立刻冒出「有點遠，改開車？」按鈕，等於否定他剛做的選擇，而且旁邊本來就有開車鈕，功能重複。另外用 leg.meters > 3000 判斷也不合適：3 公里走路大約 40 分鐘，在吃東西的行程裡很常見；Leg 是直線估的時候，meters 已經乘過 1.3（TripRouter.swift:44），比實際門檻更容易觸發。加第二行還會讓 LegRow 變高；RowDrag.shift 只用被拖那一站的 h（TripPanel.swift:1218-1221），各站高度不一樣時讓位會不準（gapHint 本來就有這個情況，不算新問題）。375pt 寬時，標籤大約只剩 157pt 可用（30+8+3×38+2×6+左右 padding 12×2）。「🚶 走路 73 小時 14 分」本身就快滿了，再加一行還可以，加在同一行一定會被截斷。

**風險**：LegRow 是一列 40pt 高，多一行字會變高，拖曳排序時要確認 RowDrag 的位置計算是不是用固定高度（沒查到，unknown）。版面要看 402pt 寬的時候，三顆鈕加長文字會不會被擠到。

**模擬器驗證**：在嘉義→雲林那段手動選走路：時間下面要出現「有點遠，改開車？」，按一下按下那一幀就切到開車，提示消失。1 公里內的走路段不出現提示。深色模式也看一次字有沒有看清楚。

### G3d（P2，反方要求修改）交通方式存在「到達站」上，排順序或拖曳後會套到另一段

**證據**
- Trip.swift:38：mode 存在 TripStop 上（從上一站怎麼來）
- Trip.swift:616-624：TripStore.reorder 只改 pos，不動 mode
- TripPanel.swift:495-522：drop 拖曳換位置只改 pos，不動 mode
- TripPanel.swift:906-918：sortDay 排順序呼叫 reorder

**根因**：「從上一站怎麼來」存在後面那站上。只要前一站換掉（排順序、拖曳、刪站、中間插站、換天），舊的選擇就會套到一段完全不同的路上。

**最後修法**：
Trip.swift TripStore.reorder 改成：
```swift
func reorder(_ seq: [TripStop], store: Store?, restore: Bool = false) {
    let now = seq.compactMap { s in stops.first { $0.id == s.id } }.sorted { $0.pos < $1.pos }.map(\.id)
    withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
        for (i, s) in seq.enumerated() {
            guard let cur = stops.first(where: { $0.id == s.id }) else { continue }
            var x = cur; x.pos = Double(i + 1)
            let np = i > 0 ? seq[i - 1].id : nil
            let oi = now.firstIndex(of: s.id) ?? 0
            let op = oi > 0 ? now[oi - 1] : nil
            if np != op { x.mode = restore ? s.mode : nil }
            if x != cur { update(x, store: store) }
        }
    }
}
```
TripPanel.swift sortDay 的復原 closure 改成 `reorder(old, store: store, restore: true)`。
drop：同一天換位置的那支，除了被拖的那站設 `s.mode = nil`，原本在它後面那站和現在在它後面那站，有 mode 的也要清成 nil（各 update 一次，最多三筆 PATCH）。
刪站和中間插站這次先不改，列成已知問題。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

Trip.swift TripStore.reorder：迴圈開始前先算 `let old = seq.sorted { $0.pos < $1.pos }.map(\.id)`。迴圈裡算新的前一站 `let np = i > 0 ? seq[i - 1].id : nil`，舊的前一站 `let oi = old.firstIndex(of: s.id); let op = (oi ?? 0) > 0 ? old[oi! - 1] : nil`。如果 `np != op`，就設 `x.mode = nil`，跟 pos 一起 update（同一次 update，一筆 PATCH）。TripPanel.swift drop：在 `drag.to != drag.from` 那支裡加 `s.mode = nil`。被移走那站原本後面那一站、和現在後面那一站的 mode 也應該清掉，但會多兩筆 update，可以先只清被拖的那站。

</details>

**反方意見**：根因對：mode 存在到達站上（Trip.swift:38），reorder（Trip.swift:616-624）和 drop（TripPanel.swift:497-522）只改 pos。但原修法有兩個問題：
1) reorder 也是「排順序」的復原（TripPanel.swift:919-920 `TripStore.shared.reorder(old, ...)`）。原修法用 `seq.sorted { $0.pos < $1.pos }` 來算舊順序，但復原時傳進來的 seq 是排之前的快照，pos 也是舊的，算出來的「舊順序」其實等於目標順序。結果 np == op，排順序時被清掉的手動方式在復原時救不回來。而且現在的寫法是 `if cur.pos != p { ... }` 才 update，只改 mode 不改 pos 的站會被跳過。
2) 會改到前一站的不只排順序和拖曳：刪掉一站（Trip.swift:513 deleteWithUndo，後面那站的前一站變了）、從中間插一站（Trip.swift:593-606 add 的順路插入、空檔推薦插在兩站中間）、移到別天或別的行程（TripPanel.swift:500-505、Trip.swift:627 move），後面那站留下的 mode 都會套到新的那段。原修法只處理了一部分。

**風險**：使用者排順序以後，手動選過的方式會被清掉，回到自動。這是比較合理的結果，但要讓使用者知道。

**模擬器驗證**：建三站 A（嘉義）、B（嘉義 500 公尺外）、C（台北）。B 段手動選走路，按「排順序」或把 B 拖到 C 後面：原本那段走路的設定不能出現在跨縣市那段，要變回自動（開車）。

### G3e（P3，反方確認）出發模式的下一站：路線 key 跟實際要抓的 key 用不同規則

**證據**
- TripPanel.swift:1061-1063：goMode 第一站用 t.mode，其他用 TripMath.mode
- TripPanel.swift:1065-1069：goNeed 用 goMode
- TripPanel.swift:1071-1073：goKey 用 next.mode ?? t.mode（第一站也用 next.mode）
- TripPanel.swift:980：`.task(id: goKey(t, next)) { if let k = goNeed(t, order, next) { router.need([k]) } }`

**根因**：task 的 id（goKey）和實際要抓的路線（goNeed）用不同規則挑方式。第一站有存 mode 的時候（例如排順序以後原本第 2 站變成第 1 站），兩邊會不一樣：換方式時 task 可能不會重跑，也可能白跑一次。

**最後修法**：
TripPanel.swift：goKey 改成直接從 goNeed 算，讓兩邊永遠一致：
```swift
private func goKey(_ t: Trip, _ order: [TripStop], _ next: TripStop?) -> String {
    goNeed(t, order, next).map { TripRouter.key($0.0, $0.1, $0.2) } ?? ""
}
```
第 980 行改成 `.task(id: goKey(t, order, next))`（order 在那裡本來就有）。搭配 G3a 改過的 goMode。

**反方意見**：TripPanel.swift:1071-1073 的 goKey 用 `next.mode ?? t.mode`，1061-1063 的 goMode 第一站用 t.mode，兩邊確實不一致。G3a 改完以後，goMode 會用自動選，goKey 還是寫死 walk，不一致會更明顯。修法（goKey 直接從 goNeed 算，980 行傳 order）沒問題，tuple 的 map 寫法也能編譯。這項要跟 G3a 更正過的 goMode 一起改，不然還是會出現 G3a 說的「跟著現在位置來回跳」。

**風險**：影響很小，只差在 task id 的字串。

**模擬器驗證**：按出發，下一站卡片寫「🚗 開車 … 到」，跟面板上那段的方式一致。模擬器改定位走 100 公尺以上，時間會更新一次，不會連續一直抓（PerfHUD 沒有多出的 mark）。

### G3f（P3，反方要求修改）其他地方還是只看行程預設：清單卡片寫「走路共」、分享連結、排順序省幾分、加站提示

**證據**
- TripsList.swift:141-146：行程卡片寫「\(m.verb)共 …」，m 是 trip.mode，混合方式時也寫「走路共」
- TripPanel.swift:1186、TripPanel.swift:1191-1197：分享的 Google 地圖連結 travelmode 用 t.mode
- TripPanel.swift:910-911、Trip.swift:259：排順序「省下 N 分」用 t.mode 的直線速度（走路 75 m/分）換算，長距離會寫出很大的數字
- TripPanel.swift:613、TripPanel.swift:636：加站卡片「插在第 N 站・多走 X 分」用 t.mode

**根因**：這幾個地方要一個代表方式，就直接拿 Trip.mode，而 Trip.mode 永遠是 walk。

**最後修法**：
TripsList meta 和分享的改法照原修法。sortDay（TripPanel.swift:910）改成看整天每段的平均直線距離：
```swift
let cs = base.compactMap(\.coord)
let avg = zip(cs, cs.dropFirst()).map { CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: CLLocation(latitude: $1.latitude, longitude: $1.longitude)) }.reduce(0, +) / Double(max(1, cs.count - 1))
let tm: TravelMode = t.mode != "walk" ? (TravelMode(rawValue: t.mode) ?? .walk) : avg <= 1200 ? .walk : .drive
```
Trip.swift:601（add）和 TripPanel.swift:613（addCard）用同一個算法，可以把它抽成 TripMath 的 static func dayMode(_ t: Trip, _ ss: [TripStop])，三個地方共用。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

TripsList.swift meta：`let m = TravelMode(rawValue: trip.mode) ?? .walk` 改成先看 pairs(ss) 的方式。全部一樣就寫「開車共／走路共」，不一樣就寫「交通共」。`let ms = Set(pairs(ss).map(\.2)); let verb = ms.count == 1 ? ms.first!.verb : "交通"`。TripPanel.swift share（第 1186 行）：這天有任一段（照 TripMath.mode 算）是開車就傳 .drive，不然傳 .walk。sortDay 第 910 行：tm 改成 `.pick(t, nil, from: base.first?.coord, to: base.last?.coord)`。addCard 第 613 行可以先不改。

</details>

**反方意見**：TripsList.swift:141-146 的「走路共」、TripPanel.swift:1186 分享連結、910 排順序、613 加站卡片都用 t.mode，這些都屬實。不過 sortDay 的修法 `.pick(t, nil, from: base.first?.coord, to: base.last?.coord)` 不對：第一站和最後一站的距離跟中間每段多遠沒有關係。繞一圈回到附近的行程會被判成走路，中間跨縣市那幾段還是用 75 m/分換算，照樣寫出很大的「省下 N 分」。另外他漏了 Trip.swift:601：add() 判斷要不要「順路」插在中間，也是用 t.mode 的走路速度。開車的行程因為這樣幾乎都被放到最後一站。

**風險**：都是顯示文字，不影響路線計算。

**模擬器驗證**：行程清單卡片上的 TEST ux 要寫「開車共 …」，不是「走路共 7 小時」。分享出去的連結打開 Google 地圖是開車模式。

### G3g（P3，反方要求修改）行程排到半夜以後時間會繞回去：顯示「1:27 結束」，不說是隔天

**證據**
- t34.png：標題「TEST ux 5 站・1:27 結束」（長距離走路把行程推過半夜）
- Trip.swift:143：TripDate.clock 用 `% 24` 把超過 24 小時的時間繞回去
- TripMode.swift:269-270：summary 用 clock 寫結束時間
- TripPanel.swift:1410、TripPanel.swift:1412、TripPanel.swift:1582：站卡的到達／離開時間也用 clock

**根因**：DayPlan 的分鐘數可以超過 1440（隔天），但 clock 只取除以 24 的餘數，畫面上看起來像當天凌晨。G3a 修好以後比較少發生，但站多或是手動選走路還是會遇到。

**最後修法**：
Trip.swift TripDate 加：
```swift
static func clockDay(_ m: Int) -> String {
    let d = m / 1440
    return (d <= 0 ? "" : d == 1 ? "隔天 " : "+\(d) 天 ") + clock(m)
}
```
TripMode.swift:269-270、TripPanel.swift:1412「到 …」、TripPanel.swift:1183 分享文字改用 clockDay。TripPanel.swift:1410 和 1582 的版面比較窄，維持 clock，在 row.arrive >= 1440 時把字改成 Color.accentDeep。clock 本身不要改。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

Trip.swift TripDate 加 `static func clockDay(_ m: Int) -> String { (m >= 1440 ? "隔天 " : "") + clock(m) }`。TripMode.swift:269-270 的 summary，和 TripPanel.swift:1412 的「到 …」改用 clockDay。TripPanel.swift:1410 的大字到達時間位置比較窄，維持 clock，另外在 row.arrive >= 1440 時把字改成 Color.accentDeep 提醒。不要直接改 clock 本身，因為它在很多窄的位置用到。

</details>

**反方意見**：根因屬實：Trip.swift:143 的 clock 用 % 24；t34 標題寫「5 站・1:27 結束」，TripCalc.plan（Trip.swift:167-188）的分鐘數沒有上限。但原修法只寫「隔天」。這次回報的就是雲林→台北走路 73 小時，結束時間是三天後，寫「隔天 1:27」還是錯的。另外 TripPanel.swift:1582（MiniStop）和 1183（分享文字）也用 clock，原修法沒有提到。標題膠囊是 lineLimit(1)、minimumScaleFactor(0.75)（TripTop.swift:119-120），在 375pt 寬會被縮小，但還放得下。

**風險**：「隔天 1:27 結束」比較長，標題膠囊小字可能被截斷，要在 402pt 寬檢查。

**模擬器驗證**：保留一段長距離手動走路，讓行程超過 24:00：標題要寫「5 站・隔天 1:27 結束」，最後一站時間是橘色。

### 反方補充（調查員漏掉的）
- TripPanel.swift:930（gapCount）和 TripTop.swift:88（routeKey）也呼叫 TripMath.mode(t, b)。G3a 改簽名卻沒列進去，會編譯失敗；TripTop.swift:88 規則不一致的話，搜尋的順路距離不會在路線抓回來以後重算。
- TripPanel.swift:1061-1063 / 1119：goMode 同時決定出發卡片文字和導航 App 的方式（tripNavURL）。G3a 原修法改成用現在位置判斷距離，開車開到離下一站 1.2 公里內會跳成走路，導航也會開成走路。
- Trip.swift:601：TripStore.add 判斷「順路插中間」用 t.mode 的走路速度（75 m/分），多繞的時間超過 10 分就放最後一站。跨縣市或開車的行程幾乎都只能加在最後。
- Trip.swift:513 deleteWithUndo、Trip.swift:593-606 add 中間插站、Trip.swift:627 move、TripPanel.swift:500-505 換天：這些也會讓後面那站的前一站換掉，留下的 mode 會套到新的那段（跟 G3d 同一個根因，原修法只處理排順序和拖曳）。
- Trip.swift:616-624 reorder 也被拿來做「排順序」的復原（TripPanel.swift:919-920）。G3d 原修法用 seq 的 pos 算舊順序，復原時算錯，手動選的方式救不回來。
- TripPanel.swift:1515：LegRow 沒選到的交通方式鈕用寫死的 Color.white 當背景。t34 深色模式下三顆白色膠囊很刺眼，跟其他深色元件不協調，應該改用會跟著深淺色變的面板色（例如 Color.panel 或 bg2）。
- TripsList.swift:103：行程卡片的「🚗 開車」標籤只在 trip.mode == "drive" 時出現，但 App 不會把 Trip.mode 存成 drive，所以這段永遠不會顯示。改成依距離自動選以後，應該改看各段實際用的方式（可以跟 G3f 的 Set(pairs) 一起算）。
- TripsList.swift:152-160 / 113：G3a 上線後第一次打開行程清單，所有一天行程裡的遠距離段都會換成 drive 的新 key，一次排一堆 MKDirections 請求進佇列。超過頻率限制時重試兩次就放進 failed（TripRouter.swift:76-83），整個 App 這次開著的期間都只會顯示「約」的直線估計。

---

## G4 最高段清單捲到頂往下拉，面板不跟手

### G4a（P1，反方要求修改）首頁最高段清單捲到頂往下拉：只有清單回彈，面板不跟手，放手才跳到中間段

**證據**
- /mnt/project-files/02_pulldown_strip.png：第 1→3 格清單內容往下彈（第一列和標題中間多出空隙），面板頂（橫條、「這一帶 85 間」那行）位置完全沒動；第 4 格放手後面板直接到中間段，第 5 格停好
- UX改版實作規格.md:102 A1 要求「捲到頂再往下拉＝把面板拉低（偵測 contentOffset ≤ 0 時把拖曳交給面板）」；測試清單 :148 第 12 項
- MapTab.swift:1027-1031 onScrollGeometryChange 只算一個 Bool（回彈超過 28pt），過線時只做 lowering = true 和 Haptic.light()，沒有寫 lift.y，所以手指拉的時候面板高度不變
- MapTab.swift:1032-1037 onScrollPhaseChange 等到不是 .interacting（放手）才 mp.go(.mid)：放手那一刻才整段跳，而且固定跳到 .mid，不看拉多遠、甩多快
- MapTab.swift:1059-1060 面板 1:1 跟手的 PanelDrag/drag()/settle() 只裝在橫條和 titleRow（MapTab.swift:883、1053），清單本身沒有接到這套
- MapTab.swift:1138-1154 PanelDrag 是 SwiftUI DragGesture；清單是 SwiftUI ScrollView，背後是 UIScrollView 的 panGestureRecognizer，兩者沒有任何連接，手指在清單上時只有 UIScrollView 在處理
- PanelLift.swift:15-18 LiftHeight 只讀 lift.y：只要把手指位移寫進 lift.y，就只有套高度那層每幀重畫（現成的省效能設計，可直接重用）
- MapTab.swift:888-897 high 清單高度固定為 highT - grabH，面板變矮只是下面被 clipped 裁掉，清單本身不重排

**根因**：同調查員：手指在最高段清單上時，只有清單底下 UIScrollView 的 pan 在處理，做橡皮筋回彈。onScrollGeometryChange（MapTab.swift:1027）只回報有沒有過 -28 這條線，不寫 lift.y。onScrollPhaseChange（:1032-1037）放手後才固定 mp.go(.mid)，這時清單的回彈動畫和面板的彈簧同時跑。面板 1:1 跟手的 PanelDrag 只裝在 grip（:886、:1056、:966、:975），清單上沒有。

**最後修法**：
採用 (a) ListPullDown（加在 PanelLift.swift，要 import UIKit），在調查員的程式上補這幾處：
(1) Coordinator 改成 `@MainActor final class Coordinator: NSObject`。
(2) Finder 除了 didMoveToWindow，也覆寫 didMoveToSuperview，兩邊都呼叫同一個 find()。find() 往上走最多 12 層，只接受 `s.contentSize.width <= s.bounds.width + 1` 的直向 UIScrollView。
(3) 在 pan 的 .ended/.cancelled 裡，先記下 `let v = ...`、`handing = false`，然後：
```swift
let up = -(dy - start + v * 0.2)
ended(up)
DispatchQueue.main.async { [weak s] in
    guard let s else { return }
    s.setContentOffset(CGPoint(x: s.contentOffset.x, y: -s.adjustedContentInset.top), animated: false) // 停掉慣性
    s.bounces = self.oldBounce
}
```
不要在同一個 callback 裡馬上把 bounces 改回去，這樣 target 的呼叫順序就不重要了。
(4) detach()：如果 handing 還是 true，先 `handing = false; ended(0)` 再把 bounces 改回去，確保 mp.dragging、lift.y 會歸零。

MapTab.swift NearbySheet.high：照調查員的寫法，在 LazyVStack 的 .padding(...) 後面加 `.background(ListPullDown(changed: { drag($0) }, ended: { up in settle(target(mp.stage) + up * 0.6, push: up) }))`，同時把 :1028 改成 `guard past, listTouch, !lowering, !mp.dragging else { return }`，讓舊的備案在接手時不會觸發，也不會在 settle 之後再 mp.go(.mid)。:903 改成 `.allowsHitTesting(tall || mp.dragging)` 可以保留，當作防呆。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

建議做法 (a)：用公開 API 找到清單底下的 UIScrollView，在它的 panGestureRecognizer 加一個 target，頂端往下拉時把手指位移寫進 lift.y、放開用速度交給現有的 settle()。

比較：
(a) UIScrollView.panGestureRecognizer.addTarget：superview、panGestureRecognizer、bounces、contentOffset、translation(in:)、velocity(in:) 全是公開 API，沒有 KVC。拿得到真的手指位移（1:1）和放手速度，也能關掉回彈、把 contentOffset 釘在頂端，清單不會跟面板一起動。缺點是要靠「SwiftUI ScrollView 底下是 UIScrollView」這件事（iOS 18 是這樣，SwiftUI-Introspect 也是這樣找）；找不到的話保留舊的過線邏輯當備案，不會壞。
(b) 只用 SwiftUI（onScrollGeometryChange 每幀回傳 contentOffset，用橡皮筋公式 f=(1-1/(x·0.55/d+1))·d 反推手指位移 x）：回彈停不掉，所以要嘛面板跟手、清單內容又多往下彈一段（兩個一起動），要嘛面板只動 x−f、橫條還是不跟手；係數是 UIKit 未公開的實作細節，換系統版本會偏；放手速度只能靠 onScrollPhaseChange 的 context（iOS 18 有沒有可靠的 velocity 我不確定）；放手後清單的回彈動畫仍然和面板彈簧疊在一起。不推薦。
(c) UIGestureRecognizerRepresentable（iOS 18 公開）掛一個同時辨識的 UIPanGestureRecognizer：拿得到位移和速度，但要停掉清單回彈還是得拿到 UIScrollView（從 delegate 的 otherGestureRecognizer.view 拿），等於 (a) 再多一層；SwiftUI 會不會讓你設 delegate、在 iOS 18 ScrollView 上同時辨識穩不穩，我沒辦法確定（unknown），第一次編譯和實機行為風險都比 (a) 大。

具體改法（範圍小，兩個檔）：

1) PanelLift.swift 最下面加一個共用的 ListPullDown（檔案已經 import SwiftUI，要再加 import UIKit；專案是 PBXFileSystemSynchronizedRootGroup，不用改 pbxproj）：
```swift
// 清單捲到頂再往下拉：手指交給面板（1:1），放開照面板規則停段。只用公開 API
struct ListPullDown: UIViewRepresentable {
    var on = true
    var changed: (CGFloat) -> Void        // 往上為正（同 PanelDrag）
    var ended: (CGFloat) -> Void          // 預測停的位移，往上為正
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> Finder {
        let v = Finder(); v.isUserInteractionEnabled = false
        let c = context.coordinator
        v.found = { [weak c] s in c?.attach(s) }
        return v
    }
    func updateUIView(_ v: Finder, context: Context) {
        context.coordinator.on = on
        context.coordinator.changed = changed   // 每次更新換成新的閉包，不會拿到舊的 ceiling
        context.coordinator.ended = ended
    }
    static func dismantleUIView(_ v: Finder, coordinator: Coordinator) { coordinator.detach() }

    final class Finder: UIView {
        var found: ((UIScrollView) -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil else { return }
            var p = superview
            while let v = p, !(v is UIScrollView) { p = v.superview }
            if let s = p as? UIScrollView { found?(s) }
        }
    }

    final class Coordinator: NSObject {
        var on = true
        var changed: (CGFloat) -> Void = { _ in }
        var ended: (CGFloat) -> Void = { _ in }
        private weak var scroll: UIScrollView?
        private var handing = false
        private var start: CGFloat = 0
        private var oldBounce = true
        func attach(_ s: UIScrollView) {
            guard scroll !== s else { return }
            detach(); scroll = s
            s.panGestureRecognizer.addTarget(self, action: #selector(pan(_:)))
        }
        func detach() {
            scroll?.panGestureRecognizer.removeTarget(self, action: #selector(pan(_:)))
            if handing { scroll?.bounces = oldBounce; handing = false }
            scroll = nil
        }
        @objc private func pan(_ g: UIPanGestureRecognizer) {
            guard let s = scroll else { return }
            let top = -s.adjustedContentInset.top
            let dy = g.translation(in: nil).y      // 螢幕座標：面板跟著動也不會抵銷
            switch g.state {
            case .began, .changed:
                if !handing {
                    guard on, dy > 0, g.velocity(in: nil).y > 0, s.contentOffset.y <= top + 0.5 else { return }
                    handing = true
                    start = g.state == .began ? 0 : dy   // 一開始就在頂端：連起手那幾點一起算，第一幀就動
                    oldBounce = s.bounces; s.bounces = false
                }
                s.contentOffset.y = top                // 釘在頂端：SwiftUI 重設 bounces 也不會回彈
                changed(-(dy - start))
            case .ended, .cancelled, .failed:
                guard handing else { return }
                handing = false
                s.bounces = oldBounce
                let v = g.state == .ended ? g.velocity(in: nil).y : 0
                ended(-(dy - start + v * 0.2))      // 約略等於 DragGesture 的 predictedEndTranslation
            default: break
            }
        }
    }
}
```

2) MapTab.swift NearbySheet.high（約 1019-1026 行）：在 LazyVStack 的 .padding(...) 後面加
```swift
.background(ListPullDown(changed: { drag($0) }, ended: { up in settle(target(mp.stage) + up * 0.6, push: up) }))
```
跟 grip（MapTab.swift:1060）同一套 drag()/settle()：放開停最近一段、拉超過 60 至少換一段、甩快往甩的方向、spring 0.38/0.82、換段輕震，都不用重寫。原本 1027-1037 的 lowering 邏輯可以先留著當備案：新做法把 contentOffset 釘在頂端，回彈不會超過 -28，舊邏輯自然不會觸發；找不到 UIScrollView 時就退回舊行為。

3) 同一個檔 NearbySheet.body 的 high 那段（MapTab.swift:890-891）：把 .allowsHitTesting(tall) 改成 .allowsHitTesting(tall || mp.dragging)。拉過一半時 tallPull 變 false，清單淡出；如果 SwiftUI 因此把底下 UIScrollView 設成不能互動，正在拉的手勢可能被中斷。mp.dragging 是 @ObservationIgnored，不會多出重畫，只會在 tallPull 變的那次 body 被讀到；settle 把 tallPull 設成 nil 時又重算一次，就會恢復。

效能：每個觸控事件只寫 lift.y（Lift 是 @Observable，只有 LiftHeight、TopFade 兩層讀它）；NearbySheet 的 body 只在 tallPull 跨過一半時重算 1～2 次；MapTab 不讀 lift，mp.dragging 是 @ObservationIgnored，所以 MapTab 不會每幀重算。拉的過程 report() 被 !mp.dragging 擋住，地圖的 safeAreaPadding 不會變，不會觸發 0.5 秒重排；停好後才量一次，跟現在拉橫條一樣。
既有手勢：中間段的橫向卡片是另一個 ScrollView，沒裝 ListPullDown，不受影響；Finder 從清單內容往上找，第一個碰到的就是直的那個 UIScrollView。沒有新增 SwiftUI DragGesture，所以不用另外加 .swipeBackBlocked()（清單本來就有 .swipeBackBlocked()，MapTab.swift:1038），地圖首頁是根頁面，也沒有返回手勢。

</details>

**反方意見**：根因對：連拍 /mnt/project-files/02_pulldown_strip.png 第 1→3 格只有清單內容往下彈（標題和第一列中間空隙變大），橫條和「這一帶 85 間」那行沒動，第 4 格才整塊跳到中間段，第 5 格停好。MapTab.swift:1027-1031 的 onScrollGeometryChange 只在回彈超過 28pt 時設 lowering 並輕震，沒有寫 lift.y。MapTab.swift:1032-1037 等手指放開才 mp.go(.mid)，而且固定跳 .mid，拉多遠、甩多快都不看。PanelDrag（MapTab.swift:1138-1154）是 SwiftUI DragGesture，跟清單底下 UIScrollView 的 pan 沒有接在一起。方向 (a) 我也同意：(b) 停不掉回彈，係數也是 UIKit 沒公開的；(c) 最後還是要拿到 UIScrollView。另外再補一個要排除的做法 (d)：在 ScrollView 上加 .simultaneousGesture(DragGesture)，iOS 18 已知會讓 ScrollView 不能捲，不能用。
要改的地方：
1) 行號差了 3 行左右：grip 在 MapTab.swift:886、1056（不是 883、1053），allowsHitTesting(tall) 在 :903（不是 890-891）。grip 也裝在 PickedCard（:966）和 FirstPlaceCard（:975）上，不只橫條和 titleRow。
2) 留著當備案的 lowering 會跟新的 settle 打架。SwiftUI 在 tallPull 跨線那次重算時，可能把 UIScrollView 的回彈設定改回去；只要有一個觸控事件讓 contentOffset 超過 -28，lowering 就會變 true。放手時新的 settle 已經挑好段落（例如 .low 或留在 .high），接著 onScrollPhaseChange 又跑 mp.go(.mid)，把結果蓋掉，面板會被拉回中間段。舊邏輯要加 !mp.dragging 擋住。
3) 放手時把 bounces 改回去的時機不保險。UIKit 沒有保證同一個 recognizer 的 target 照加入順序呼叫。如果我們的 target 比 UIScrollView 自己的 handlePan 先跑，UIScrollView 看到「在頂端、bounces=true、往下的速度」就會補做一次回彈，跟面板的彈簧疊在一起，又出現原本那種「跳一下」。
4) 拉到一半時 dismantleUIView 或 detach 被呼叫，只會把 bounces 改回去，不會呼叫 ended，結果 mp.dragging 一直是 true、lift.y 停在中間：之後 report() 全部被擋住，地圖拖動也不會自動降段。
5) Finder 只在 didMoveToWindow 找一次。如果 SwiftUI 是先把它放進視窗、之後才搬到 UIScrollView 底下，就會找不到。往上走也沒有限制，最壞可能掛到別的 UIScrollView 上。
6) Coordinator 建議標 @MainActor（Swift 5、iOS 18 目標，pbxproj:263、:214），跟 Perf.swift 的 TouchClock 一樣明確在主執行緒，Swift thread 語法檢查也比較穩。
7) 效能分析是對的：MapTab 不讀 lift，mp.dragging 是 @ObservationIgnored；NearbySheet 放在 Color.clear 那層的 safeAreaInset 裡（MapTab.swift:249），不會動到地圖的 safe area；report() 被 !mp.dragging 擋住，0.5 秒的重排只會在停好後發生一次，跟拉橫條一樣。橫向卡片、返回手勢不受影響。375pt 小螢幕和深淺色都跟這個改法無關。

**風險**：Finder 要靠「iOS 18 的 SwiftUI ScrollView 底下是 UIScrollView、從內容往上走得到」，這是現在的實作，不是 SwiftUI 的承諾；以後的 iOS 如果改了就找不到，會退回舊的過線行為，不會壞掉。這一版 Swift thread 只能做語法檢查，selector 和 @objc 要編譯過才算數（Coordinator 繼承 NSObject，Swift 5 模式下沒有 actor 隔離的警告）。v*0.2 只是約略等於 predictedEndTranslation，甩的手感可能要在實機調整係數。SwiftUI 在拉的過程中重算（tallPull 跨線）時可能把 bounces 設回 true，已經靠每次 changed 都把 contentOffset 釘在頂端擋住，但沒在實機確認過。

**模擬器驗證**：1. 首頁把面板拉到最高段，清單在頂端，手指按住慢慢往下拉約 120pt 不放手，連拍：從第一幀開始橫條和「這一帶 N 間」那行跟著手指往下，清單第一列和標題之間不會多出空隙（沒有回彈）。
2. 拉 40pt 慢慢放手 → 回到最高段；拉過最高到中間的一半再放手 → 停中間段；從頂端快速往下甩 → 至少到中間段，甩很大力可以到最低段。換段時輕震一次。
3. 先把清單捲到中間，同一個手勢往下捲回頂端再繼續拉 → 碰到頂端以後換成面板跟手。
4. 往上捲清單、甩動、捲到底的回彈，都和改之前一樣。
5. PerfHUD：一次拉放「重畫」那行只看到「附近面板」1～3 次，「地圖」不應該增加；掉幀數和拉橫條差不多。
6. 中間段的橫向卡片左右滑正常；拉過一半時清單淡出，手指仍然跟手、不會中斷。

### G4b（P1，反方要求修改）行程面板中段、最高段清單捲到頂往下拉，一樣不跟手，放手才降一段

**證據**
- UX改版實作規格.md:123 A2：「中間、最高兩段的清單捲到頂再往下拉就拉低面板（同 A1 的接手方式）。拖站卡換順序時不要觸發（drag.id != nil 時關掉）」；測試清單 :156 第 18 項
- TripPanel.swift:223-227 和首頁同一種寫法：onScrollGeometryChange 只看回彈有沒有超過 28pt，過線只設 lowering = true 再輕震，沒有寫 lift.y
- TripPanel.swift:228-237 放手後才 withAnimation 把 mode.level 往下一段（high→mid、mid→low），不看拉多遠、甩多快
- TripPanel.swift:360-383 會 1:1 跟手的 sheetDrag 只掛在 head()（TripPanel.swift:296），清單沒有接到
- TripPanel.swift:220、552 scrollDisabled(drag.id != nil)：拖站卡的時候 UIScrollView 本身就停用
- t10.png：行程最高段，清單只有 2 站、比畫面短，往下拉時也會走同樣的回彈路徑（模擬器沒有另外拍連拍，這點是從程式推論的）

**根因**：同 G4a：清單的 pan 被 UIScrollView 拿去做回彈，TripPanel.swift:223-237 只在過線時記一筆、放手才換段，lift.y 在拉的過程中都沒動；放手時清單回彈和面板彈簧同時跑。

**最後修法**：
共用 G4a 修好的 ListPullDown（含 async 改回 bounces、detach 時呼叫 ended(0)、@MainActor）。TripPanel.swift：
(1) 照調查員的寫法，把 :371-382 抽成 settleSheet(_ up:)，sheetDrag.onEnded 改成呼叫它。
(2) 在 :218 的 rows(...).padding(...) 後面加 `.background(ListPullDown(on: drag.id == nil, changed: { up in guard drag.id == nil else { return }; lift.y = up }, ended: { up in guard drag.id == nil else { lift.y = 0; return }; settleSheet(up) }))`。
(3) :224 改成 `guard past, listTouch, !lowering, drag.id == nil, lift.y == 0 else { return }`，接手時舊的備案就不會觸發。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

共用 G4a 加在 PanelLift.swift 的 ListPullDown。

1) TripPanel.swift 把 sheetDrag 的 .onEnded 內容（TripPanel.swift:371-382）抽成一個函式，讓兩個地方共用：
```swift
private func settleSheet(_ up: CGFloat) {
    let hs = heights()
    let now = settledHeight() + up * 0.6
    var pick: TripLevel = [(TripLevel.low, hs.low), (TripLevel.mid, hs.mid), (TripLevel.high, hs.high)].min { abs($0.1 - now) < abs($1.1 - now) }!.0
    if pick == mode.level, abs(up) > 60 {
        let all: [TripLevel] = [.low, .mid, .high]
        let i = all.firstIndex(of: mode.level)! + (up > 0 ? 1 : -1)
        if all.indices.contains(i) { pick = all[i] }
    }
    if pick != mode.level { Haptic.light() }
    withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { mode.level = pick; lift.y = 0; pullDown = false }
}
```
sheetDrag.onEnded 改成：`guard drag.id == nil else { lift.y = 0; return }; settleSheet(-v.predictedEndTranslation.height)`。

2) panel(...) 裡 ScrollView 的內容（TripPanel.swift:217-218，rows(...).padding(...) 後面）加：
```swift
.background(ListPullDown(on: drag.id == nil,
    changed: { up in guard drag.id == nil else { return }; lift.y = up },
    ended: { up in guard drag.id == nil else { lift.y = 0; return }; settleSheet(up) }))
```
223-237 的 lowering 程式先留著當備案，理由同 G4a。

效能：TripPanel 的 body 不讀 lift.y（panelHeight() 只在 fitCoords 用，TripPanel.swift:852），每幀只有 LiftHeight 那層重算，和現在拉橫條完全一樣。清單列的 onGeometryChange 每幀寫 mode.geo.rows（RowGeo 是 @ObservationIgnored，TripMode.swift:57），現在拉橫條也一樣，不會多出重畫。
既有手勢：拖站卡換順序是 LongPress 0.35 秒再接 Drag；拿起來後 drag.id != nil，scrollDisabled 讓 UIScrollView 的 pan 停用，加上 on: drag.id == nil 和 changed 裡的 guard，總共三層擋住，面板不會動。最低段是橫向站卡（strip），不在 ScrollView 裡，也沒裝 ListPullDown，不受影響。往下拉到最低段時清單會換成 strip、ScrollView 被拿掉，dismantleUIView 會呼叫 detach() 把 target 移掉、bounces 還原。返回手勢：行程模式在地圖首頁，沒有返回頁。

</details>

**反方意見**：根因對：TripPanel.swift:223-227 跟首頁同一套「過 -28 只記一筆」，:228-237 放手後才把 mode.level 降一段，不看位移和速度；sheetDrag（:360-383）只掛在 head()（:296）。:220 的 scrollDisabled(drag.id != nil) 確實會在拖站卡時停掉清單的 pan。:552 是最低段橫向站卡的 ScrollView，不是清單，引用時要分清楚。
要改的地方：
1) 跟 G4a 一樣，留著的舊 lowering 會在 settleSheet 之後再降一段：例如使用者拉了一點又放回 .high，結果被舊邏輯降到 .mid；從中段甩到最低段，舊邏輯也可能再跑一次動畫。要在 :224 加擋。TripPanel 沒有 mp.dragging，可以用 ListPullDown 接手中這件事來擋：changed 一進來就把一個 @State 的 `listPulling` 設成 true（只有開始和結束各變一次）；或者在 action 裡直接看 `lift.y != 0`（lift.y 只在 closure 裡讀，不會多出重畫）。
2) 跟首頁不一樣：行程面板的 ScrollView 高度沒有固定，面板變矮時 UIScrollView 本身每幀變矮、重新排版。這跟現在拉 head 的成本一樣，不算新增，但調查員說「和現在拉橫條完全一樣」只有在這個意義上成立。高度一直變的時候，釘在頂端的 contentOffset 不受影響。
3) 拉到一半時清單被拿掉（例如同步讓 mode.level 或 strip 改變），detach 不會收尾，lift.y 會停在中間；要用 G4a 第 (4) 點的 ended(0) 收尾。
4) settleSheet 是把原本的程式抽出來：原本用 mode.level 自己選 hs.low/mid/high，就等於 settledHeight()，所以沒問題。拖站卡那三層防護（scrollDisabled、on:、guard）是對的。

**風險**：settleSheet 是把原本的程式抽出來，要確認 heights()/settledHeight() 和原本 onEnded 算的是同一個值（原本是自己用 mode.level 選 hs.low/mid/high，等於 settledHeight()）。一進入接手模式，這個手勢就一直由面板接手到放開為止，中途往上推不會又變成捲清單；這是刻意簡化，要放開再捲。v*0.2 的係數同 G4a，需要在實機確認。

**模擬器驗證**：1. 行程模式，面板在最高段，清單在頂端，按住往下拉 → 從第一幀開始，橫條和「從第 1 站出發」跟著手指，清單不回彈；放手停在最近的一段，甩快可以直接到最低段。
2. 面板在中段一樣測：往下拉到最低段，清單換成橫向站卡，沒有閃爍或卡住。
3. 長按一站拿起來往下拖、拖到面板下緣 → 面板不動，只有那站跟著手指；放下後再拉清單，接手正常。
4. 從中段把清單往下拉一點，再推回上面超過起點 → 面板可以升到最高段，手不放開也不會卡住。
5. PerfHUD 拉的過程「重畫」只有行程面板 0～1 次。

### 反方補充（調查員漏掉的）
- MapTab.swift:1015-1018 最高段清單是空的時候（near.places.isEmpty），整段只有 titleRow 能拉，下面的「這一帶沒有收藏」和 Spacer 拉不動，捲到頂往下拉的規則在這裡沒辦法用。可以在那個 Text/Spacer 外面包一層 .modifier(grip)。P3
- MapTab.swift:1032-1037 舊路徑用 mp.go(.mid) 換段，繞過 settle()：沒有把 lift.y/tallPull 歸零，也不經過 settle 的 80ms report()。新做法上線後如果舊備案還會觸發，換段會跟 settle 的結果衝突，所以要加 !mp.dragging 擋住（已寫在 G4a 修法裡）。
- TripPanel.swift:224 同樣的問題，舊的 lowering 要用 lift.y == 0 或接手旗標擋住，不然放手後會被多降一段。
- MapTab.swift:1153、SwipeBack.swift:77 SwipeBackBlocked 用 onGeometryChange(frame in .global) 每幀寫 @State rect；最高段清單（MapTab.swift:1038）在面板移動時也會每幀寫。這是拉橫條時就有的成本，不是新增，但地圖首頁是根頁面沒有返回手勢，最高段清單上這個 .swipeBackBlocked() 其實可以拿掉，省掉拉的時候每幀那一次重算（要先確認群組地圖也是根頁面）。P3
- 調查員引用的 MapTab.swift 行號差了約 3 行（grip 實際在 :886/:1056，allowsHitTesting(tall) 在 :903）；grip 也裝在 PickedCard（:966）和 FirstPlaceCard（:975）。
- 規格 UX改版實作規格.md:102 寫的「用 onScrollGeometryChange 偵測 contentOffset ≤ 0 時把拖曳交給面板」，只用 SwiftUI 公開 API 做不到 1:1（拿不到手指位移、停不掉回彈）。改用 ListPullDown 等於偏離規格的建議做法，要在 PR 說明裡寫清楚理由，免得驗收時被當成沒照規格做。

---

## G5 Apple 地圖標誌和「法律資訊」浮在地圖中間

### G5a（P1，反方要求修改）Apple 標誌和「法律資訊」跟著中段面板定位：最低段浮在地圖中間，中段和最高段被面板蓋住（首頁、行程都一樣）

**證據**
- t00（首頁最低段）：標誌在 y≈865–885px（圖寬 600px 對 402pt，1pt≈1.49px），換算約 580–593pt。最低段面板上緣在 1025px≈687pt，中間空了大約 95pt
- t03（同一次開啟，中段）：面板上緣 850px≈570pt，標誌被面板蓋住看不到。t04（最低段）標誌又出現在同一個 580–593pt
- t11（行程最低段）：標誌一樣在 580–593pt，行程面板上緣約 1030px≈690pt。t05（行程中段，上緣約 479pt）和 t10（最高段）都被蓋住
- MapTab.swift:149 `.safeAreaPadding(.bottom, footY > 0 ? max(0, mapRect.maxY - footY) : 0)`：Map 的下邊距只看 footY，標誌和法律資訊就貼著這條邊距
- MapTab.swift:539-543 setFoot：`guard !trip.on, MapPanel.shared.stage == .mid, ...`，只在面板停在中段時更新 footY
- MapTab.swift:945 量到的 probe.foot 是面板上緣（overlay 頂端；.offset 不改 layout frame），經 MapTab.swift:1096-1099 report() 傳給 foot
- MapTab.swift:31-32、TripMode.swift:58-59 的註解：進出行程時故意不改地圖大小和邊距，所以行程模式沿用首頁中段的 footY
- Apple HIG Maps（developer.apple.com/design/human-interface-guidelines/maps，Help people see the Apple logo and legal link）原文：『It’s fine when parts of your interface temporarily cover the logo and link, but don’t cover these elements all the time』『Avoid causing the logo and link to move with your interface』『if your app lets people pull up a custom card from the bottom of the screen, place the Apple logo and legal link 10 points above the lowest resting position of the card』
- 面板高度：NearbySheet.lowH=72（MapTab.swift:870），加上 .padding(.bottom, 82)（MapTab.swift:935），首頁最低段上緣是 840−154≈686pt。TripPanel heights() 的 low=150（TripPanel.swift:189-192），行程最低段上緣約 690pt，兩者只差約 4pt
- 左下的「N 間還沒有地址」膠囊（MapTab.swift:254、271-279）在最低段時落在約 640–676pt，正好是改完後標誌要放的位置

**根因**：標誌放在 Map safe area 的左下角。safe area 的底邊是 874 −（mapRect.maxY − footY），footY 只在面板停在中段時量。mapRect 量錯成 840（G5c），所以底邊實際落在 footY＋34≈604，標誌在 580–593pt。中段（上緣 570）、最高段時標誌被面板蓋住；最低段（上緣 686）時標誌浮在面板上方約 95pt。行程模式為了避免重排沿用同一個邊距，所以行程最低段也一樣浮著。

**最後修法**：
跟 G5c 放在同一版，順序是先修 mapRect，再改 footY。
1) MapPanel.swift 的 class MapPanel 加 `@ObservationIgnored var lowTop: CGFloat = 0` 和 `@ObservationIgnored var midTop: CGFloat = 0`。
2) MapTab.swift NearbySheet.report()（1096-1100）改成：
```swift
private func report() {
    guard !mp.dragging, !TripMode.shared.on else { return }
    // 最低段上緣：只取最大值。鍵盤把面板往上推時值會變小，不採用，地圖就不會因為鍵盤重排
    if bottomY > 0, bottomY - Self.lowH > mp.lowTop + 0.5 { mp.lowTop = bottomY - Self.lowH; foot(mp.lowTop) }
    // 中段上緣用算的（最低段下緣 − 中段高度），不受大卡、鍵盤影響
    if mp.lowTop > 0 { mp.midTop = mp.lowTop + Self.lowH - max(Self.lowH + 40, midH) }
    if mp.stage != .high, probe.top > 0, abs(mp.top - probe.top) > 0.5 { mp.top = probe.top }
}
```
3) MapTab.swift setFoot（539-543）改成：
```swift
// Apple 標誌、法律資訊：最低段面板上緣再往上 10pt（HIG），左下固定再讓出 46pt 給「N 間還沒有地址」膠囊；開 App 只設一次
private func setFoot(_ lowTop: CGFloat) {
    let y = lowTop - 10 - 46
    guard !trip.on, abs(y - footY) > 0.5 else { return }
    quiet.hush()
    footY = y; trip.mapBottom = y
    if !fitted { fit() }
}
```
一律多留 46pt，不加 roomy 的 onChange，避免同步完成時再重排一次。代價是標誌離面板上緣約 56pt，仍在最低段面板上方，也不會跟右邊的行程、定位兩顆按鈕重疊。
4) 行程模式不另外設值：TripPanel 的 fitCoords、goRegion 讀 mode.mapBottom，會自動跟上。
5) 鏡頭動作必須跟 G5d 一起改。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

做法：地圖下邊距一律用『最低段面板上緣 − 10pt』，只在開 App 時設一次，之後不跟段落變；首頁和行程共用同一個值（兩邊最低段上緣只差 4pt），進出行程完全不改邊距。
1) MapPanel.swift 的 class MapPanel 加兩個不會觸發重畫的欄位：
   `@ObservationIgnored var lowTop: CGFloat = 0`（最低段停好時的面板上緣）
   `@ObservationIgnored var midTop: CGFloat = 0`（中段上緣，G5d 對準鏡頭時用）
2) MapTab.swift NearbySheet.report()（1096-1100）改成：
```swift
private func report() {
    guard !mp.dragging, !TripMode.shared.on else { return }
    // 地圖下邊距＝最低段停好時的面板上緣（bottomY 是面板內容下緣，不跟段落變）
    if bottomY > 0 { foot(bottomY - Self.lowH) }
    if mp.stage == .mid, probe.top > 0 { mp.midTop = probe.top }
    if mp.stage != .high, probe.top > 0, abs(mp.top - probe.top) > 0.5 { mp.top = probe.top }
}
```
（bottomY 在 916 行更新，同一個 closure 接著就呼叫 report()，順序沒問題）
3) MapTab.swift setFoot（539-543）拿掉 `stage == .mid` 條件，改成：
```swift
private func setFoot(_ lowTop: CGFloat) { MapPanel.shared.lowTop = lowTop; applyFoot() }
// Apple 標誌、法律資訊：最低段面板上緣再上去 10pt（HIG）；有沒地址的店時再讓開左下那顆膠囊（36＋10）
private func applyFoot() {
    let low = MapPanel.shared.lowTop
    guard low > 0, !trip.on else { return }
    let roomy = store.mapBase.contains { $0.lat == nil || $0.lng == nil }
    let y = low - 10 - (roomy ? 46 : 0)
    guard abs(y - footY) > 0.5 else { return }
    quiet.hush()
    footY = y; trip.mapBottom = y
    if !fitted { fit() }
}
```
4) body 裡 `.onChange(of: list.count) { fit() }`（367 行）旁邊加 `.onChange(of: store.mapBase.contains { $0.lat == nil || $0.lng == nil }) { applyFoot() }`。判斷看的是 mapBase，不看篩選後的清單，這樣按分類篩選時邊距不會跟著變。
5) 行程模式不用改：TripPanel 的 fitCoords、goRegion 都讀 mode.mapBottom（=footY），會自動用新的值。
如果想更簡單，第 3 步可以不判斷 roomy，一律多留 46pt，代價是標誌離面板約 56pt。

</details>

**反方意見**：大方向對：標誌位置看的是 Map 的 safe area 底邊，footY 只在中段量（MapTab.swift:539-543 有 `stage == .mid`），行程模式沿用（MapTab.swift:239、540 都有 `!trip.on`）。HIG 原文我也查過，跟他引的一樣（developer.apple.com/design/human-interface-guidelines/maps）：『place the Apple logo and legal link 10 points above the lowest resting position of the card』『don't cover these elements all the time』。預設停在中段，標誌一直被蓋著，這條確實違反 HIG。probe.foot 是面板上緣（MapTab.swift:945 量在 .offset 外面，offset 不改 layout frame），這點也對。

但根因有一句不對：他說標誌『貼著 footY』。中段 footY≈570pt，t00、t04、t11 的標誌底邊卻在約 593pt，比 footY 還低約 23pt。如果 mapRect 真的是 0…874，邊距是 874−570＝304，標誌不可能跑到 570 下面。只有一種算法對得上：mapRect.maxY 量到的是 840。這時邊距＝840−570＝270，地圖 safe area 底邊＝874−270＝604，標誌底邊 593，離底邊 11pt，正好是 MapKit 預設的間距。所以 G5c 是實際存在的錯，不是『可能』（見 G5c）。

修法有四個問題：
(1) 不能單獨上線，一定要跟 G5c 同一版。單上 G5a 時，邊距＝840−676＝164，safe area 底邊在 710，標誌落在 699 左右，永遠被最低段面板（686）蓋住，比現在更不合規。
(2) report() 每次版面變動都會呼叫，`foot(bottomY - Self.lowH)` 的 bottomY 會跟著鍵盤走。NearbySheet 放在 MapTab.swift:249 的 safeAreaInset(.bottom) 裡，沒有 `.ignoresSafeArea(.keyboard)`（全專案只有 FoodMapApp.swift:327 的分頁列、TripPanel.swift:65 有加）。點搜尋框鍵盤一出來，面板往上推，bottomY 變小，footY 跟著改，馬上重排一次約 0.5 秒；收鍵盤再重排一次。原本只在中段發生，照他的改法變成三段都會。
(3) roomy 的 onChange 在開 App 時很可能翻一次：mapBase 先空、同步完才有沒地址的店，同步要 0.4–2.5 秒，t00、t01 的 PerfHUD 都有記到。這一翻就是第二次 0.5 秒重排，剛好疊在圖釘落下的動畫上。
(4) midTop 直接拿 probe.top。中段顯示 PickedCard 時量到的是大卡上緣，鍵盤起來時又是更高的值，兩種都會把 midTop 弄髒。他在 risks 寫『midTop 量的是卡片列的中段』，跟這段程式的實際行為不符。

進出行程卡不卡：同意不是邊距造成的。分頁列是 overlay（FoodMapApp.swift:44-49），藏起來不改 safe area；headY、footY 都擋了 trip.on。J4 要另外查，可以看 TripPanel.swift:880-893 的 afterFit 補動（見 missed）。

**風險**：(1) 這個修法讓鏡頭框住的那塊往下延伸到最低段上緣，在預設的中段時下面約 110pt 被面板蓋住，所以框收藏、點圖釘這些鏡頭動作要一起改（G5d），不然圖釘會被中段面板蓋住。(2) 換邊距一定會觸發 Map 重排（約 0.5 秒）。改完之後只在開 App 第一次量到時發生一次，之後只有「有沒有沒地址的店」這件事改變時才會再發生。現在的程式反而每次中段內容高度一變就重排一次（G5b）。(3) 進出行程卡不卡：進出行程時改邊距一定會卡，等於在面板彈出的動畫中間加一次 0.5 秒重排，所以不要為行程另外設一個最低段的值。現在的程式和這個修法進出行程都不改邊距（setFoot、headY 都有 `!trip.on` 的條件），所以 J4（進行程約 3 秒後 5–6 幀 100–195ms）不是邊距造成的，原因要另外查，這裡不確定。(4) 標誌實際比算出來的位置低約 30pt（G5c）。如果這個落差在 Map 這一層，套用新值後標誌會掉到最低段面板底下，永遠被蓋住，所以要先照 G5c 驗證。(5) 訊息條（t04）和最高段面板會暫時蓋住標誌，HIG 允許這種暫時遮住。

**模擬器驗證**：首頁三段都截圖：最低段時標誌底邊大約在面板上緣上方 10pt，有沒地址的店時約 56pt，而且不和「行程」「定位」兩顆按鈕重疊（按鈕在右邊）；中段、最高段時被蓋住可以接受。拉面板時標誌不能跟著動。進行程後截行程最低段，標誌在行程面板上緣上方約 14pt。PerfHUD 量進行程、離開行程：數字不能比 build 22 差，進出時不能出現 0.5 秒左右的掉幀。在 Xcode 的 View Debugger 看 MKMapView 的 safeAreaInsets.bottom，應該是 874 減 (686−10)，約 198pt。

### G5b（P1，反方確認）面板在中段時內容高度一變（點圖釘換大卡、關掉大卡、附近清單變空），地圖邊距就跟著改，每次觸發約 0.5 秒的 Map 重排

**證據**
- MapTab.swift:539-543 setFoot：只要 stage == .mid、沒在拖、而且 y 跟 footY 差超過 0.5，就改 footY
- MapTab.swift:149 footY 直接決定 Map 的 safeAreaPadding(.bottom)
- MapTab.swift:945 量的是面板上緣 minY，面板高度一變就回報，接著 MapTab.swift:1096-1099 report() → foot(probe.foot) → setFoot
- MapTab.swift:518 點圖釘時先 MapPanel.shared.go(.mid)，面板內容換成 PickedCard。MapTab.swift:888-894 midH 跟著變（大卡：標題列 44＋卡片 120＋上下 padding 20＋6；卡片列：標題 44＋10＋112，兩種高度不一樣），所以中段上緣會移動
- MapTab.swift:31-32 註解：改地圖大小或邊距會讓整張地圖重排，每次約 0.5 秒
- 規格測試清單 15：『中間段時按「換分頁」「點圖釘」的 PerfHUD 數字不比 build 20 差』

**根因**：setFoot 拿「中段面板上緣」當地圖下邊距，而中段的高度是跟內容走的（midT = max(lowH+40, midH)）。所以每次在中段點圖釘（換成較高的大卡）、關掉大卡回到卡片列、或附近清單從有變空（只剩標題，midT 降到 112），上緣都會移動，footY 跟著變，Map 的 safe area 也跟著變，觸發一次很貴的重排，而且正好疊在點圖釘的鏡頭移動和大卡彈出的動畫上。

**最後修法**：
照 G5a 的修正版：footY 只看最低段上緣而且只取最大值，setFoot 不再看 stage。midTop 用算的，不再讀 probe.top。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

跟 G5a 同一個修法：report() 改成回報 `bottomY - Self.lowH`（最低段上緣，不受中段內容影響），setFoot 拿掉 stage == .mid 的條件。改完後 footY 只在開 App 時設一次，點圖釘、關大卡、清單變空都不會再動到 Map 的邊距。中段上緣另外存在 MapPanel.shared.midTop（@ObservationIgnored，不會觸發重畫），給 G5d 對準鏡頭用。

</details>

**反方意見**：MapTab.swift:539-543 只要停在中段就照 probe.foot 改 footY。MapTab.swift:888-894 midH 跟著內容走：PickedCard（標題列 44、照片 120 加 padding，抽中時還有 DrawHistory，見 MapTab.swift:1203-1222）跟卡片列（44＋10＋112）高度不同。MapTab.swift:518 點圖釘先 go(.mid)，大卡換上來、midH 變，onGeometryChange 拿到最終值，接著 report() → setFoot → footY 改 → Map 重排，剛好疊在 0.55 秒的平移和大卡彈出上。關大卡、附近清單變空（只剩標題，midT 降到 112）也一樣。另外一條他沒寫到的觸發：中段點搜尋框，鍵盤把面板推高，footY 改一次，收鍵盤再改一次。G5a 修正版用 max 鎖住最低段上緣，這幾條都會一起消失。

**風險**：如果只修 G5a、不修 G5d，點圖釘時鏡頭會把圖釘放在新框住那塊的正中間，比現在低，大卡比較高時可能被蓋住。

**模擬器驗證**：中段點三根不同的圖釘、關大卡、再點，看 PerfHUD「點圖釘」的毫秒數和「掉幀（2 秒內）」：不能出現 0.5 秒左右的重排或連續大於 100ms 的幀，數字要等於或好於 build 20。在 setFoot 裡暫時加 print，確認點圖釘時不會再被呼叫。

### G5c（P1，反方要求修改）標誌實際的位置比程式算的低約 30pt（差不多是 home indicator 的 34pt），地圖真正的下邊距和 footY、trip.mapBottom 對不上

**證據**
- t03 中段：面板上緣 850px≈570pt。訊息條下緣 835px≈560pt，跟 FoodMapApp.swift:138 的 `840 − (panelTop 270) − 8 = 562` 對得上，所以中段上緣（也就是 footY）約 570pt
- t04 同一次開啟：標誌在 580–593pt，比 footY 還低約 20pt。標誌應該在 safe area 裡面，所以推算地圖實際的 safe area 底邊約 600–604pt，大概比 footY 低 34pt
- MapTab.swift:149 邊距＝mapRect.maxY − footY。mapRect 是在 MapTab.swift:207-208 `.ignoresSafeArea()` 之後用 onGeometryChange 量的
- TripPanel.swift:862-863、1044-1045 行程框站、出發中的鏡頭都把 mode.mapBottom（=footY）當成鏡頭框住那塊的下緣

**根因**：MapTab.swift:208 的 onGeometryChange 接在 .ignoresSafeArea() 後面，量到的是還沒往外擴的 safe area 範圍（iPhone 17 約 y 62…840），不是地圖實際的 0…874。148、149 行的邊距各少算 62pt 和 34pt，地圖實際框住的那塊比 headY…footY 往上多 62、往下多 34。標誌因此掉到 footY 下方。同一個錯也讓「附近 N 間」的換算、行程框站的 ft、fb 一起偏。

**最後修法**：
只動 MapTab.swift 一處：把 208 行的 `.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { mapRect = $0; trip.mapBottom = footY > 0 ? footY : $0.maxY }` 搬到 207 行 `.ignoresSafeArea()` 的前面，也就是直接接在 MapReader { … } 的右括號後面。它就會量到地圖真正鋪開的 0…874，148、149 行、NearbyHost.visible、TripPanel 的 ft、fb 一次全部修好，不必另外加 mapMaxY。上線前暫時 print(mapRect) 確認是 (0,0,402,874)。這一版一定要跟 G5a、G5d 一起出：單修這一項的話，中段邊距會變成 304，最低段時標誌浮得更高（約 560pt）；而且 bounds 的 0.15 和 1.9、focus 的 0.38 和 −0.12 都是照舊的錯誤範圍調出來的。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

先量，再決定要不要改：在 MapTab.swift 208 行那個 onGeometryChange 的 action 裡暫時 print(mapRect)，同時用 Xcode View Debugger 看 MKMapView 的 frame 和 safeAreaInsets。
- 如果 mapRect.maxY 是 840：149 行改用 Map 自己的 frame 底邊。在 Map 上、`.safeAreaPadding` 之前加 `.onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { mapMaxY = $0 }`（mapMaxY 用 @State），149 行改成 `max(0, mapMaxY - footY)`。這只會在開 App 時量一次，不會多造成重排。
- 如果 maxY 是 874 但標誌還是偏低：G5a 的 applyFoot 裡固定再減一個量到的差值，並在旁邊註明。

</details>

**反方意見**：從『unknown』升級成實際存在。t03、t04 是同一次開啟，中段上緣 570pt（toast 的公式 FoodMapApp.swift:138 可以對得上）。標誌底邊在約 593pt，只有 mapRect.maxY＝840 才對得上（safe area 底邊 604，間距 11pt）。程式上的原因：MapTab.swift:207-208 先 `.ignoresSafeArea()` 再 `.onGeometryChange`。ignoresSafeArea 是把子 view 擺進擴大的範圍，它自己對外的 frame 還是 safe area 那塊，所以量到的大概是 (0, 62, 402, 778)，不是 (0, 0, 402, 874)。

這代表他漏了上緣：MapTab.swift:148 的上邊距是 headY − 62，鏡頭框住那塊的上緣在搜尋列底下約 62pt。下面幾個地方也一起偏了：
- NearbyHost.visible（MapTab.swift:797-798）用 mapRect 的 minY 和 height 換算，「附近 N 間」的範圍整個偏北。
- TripPanel.swift:862-863 的 ft、fb 跟實際框住的區域不合：上面差 62、下面差 34，高度差約 96pt。所以 rho≈0.8，TripPanel.swift:880-893 的 afterFit 幾乎每次都會補動一次鏡頭。

他的修法只另外量 mapMaxY 給 149 行用，148 行、NearbyHost、TripPanel 都沒修到。也不能固定減 34：iPhone SE 底下 safe area 是 0、上面是 20，差值隨機型不同。還有一點要量：如果外層 frame 會跟著鍵盤區縮，打字時 mapRect.maxY 會掉到 538，149 行的邊距變 0，進而重排。這要在模擬器確認。

**風險**：如果不先處理這一項就套用 G5a，標誌可能會掉到最低段面板底下，永遠看不到，反而比現在更不合 HIG。

**模擬器驗證**：套用 G5a 之後截首頁最低段：標誌底邊和面板上緣之間要有大約 10pt（有沒地址的店時約 56pt），不能被蓋住。行程模式點一站或按框住整天，看鏡頭停下後會不會再額外補動一次（afterFit 的修正）。修好之後補動應該很少見。

### G5d（P1，反方要求修改）地圖下邊距改成最低段之後，「框住收藏」、點圖釘、點泡泡、定位、卡片列帶鏡頭、遠距離飛行都要改成對準「看得到的那塊」，不然在中段時會把店放到面板底下

**證據**
- MapTab.swift:752-758 bounds 用固定的 hack：中心往南挪 0.15、緯度乘 1.9，假設鏡頭框住那塊的底邊在中段上緣
- 規格 A1：『框收藏（bounds）也照目前高度留空』，現在沒有照當下的段落算
- MapTab.swift:745 第一次 fit() 在 onAppear 執行，這時 footY 還是 0（邊距 0），之後量到 footY 再換邊距，等於多重排一次，鏡頭也會被重新套一次
- MapTab.swift:535 點圖釘 `pos = .region(center: c, ...)`：圖釘放在框住那塊的中心
- MapTab.swift:171-182 遠距離飛行的 KeyframeTrack centerCoordinate 直接飛到店的座標
- MapTab.swift:667-677 點泡泡放大 zoom()，以及 MapTab.swift:298-302 定位按鈕，都只是把中心放在目標上
- MapTab.swift:681-693 focus() 用 store.mapRegion 的比例（0.38、−0.12、0.42、0.12）判斷看不看得到；store.mapRegion 對應的是整張地圖還是只有 safe area 那塊，從程式看不出來
- MapTab.swift:795-803 NearbyHost.visible（附近 N 間）只用 seen.shown、mapRect、headY、MapPanel.shared.top，沒有用到 footY
- TripPanel.swift:852-870 行程 fitCoords 已經是用 ft/fb（mapTop/mapBottom）換算看得到的視窗，邊距變了會自動跟上

**根因**：Map 的 `.region` 會把區域塞進 safe area，也就是 headY 到 footY 這一塊。現在 footY 剛好是中段上緣，所以把中心放在店上面時，店會落在中段看得到那塊的中間，bounds 也只靠固定比例的 hack 撐住。G5a 把 footY 改成最低段上緣後，框住的那塊在中段時下面約 110pt 被面板蓋住，每個直接把中心放在目標上的鏡頭動作都會往下偏約 55pt，框收藏時最南邊的店可能被面板蓋住。行程模式的 fitCoords 本來就自己換算，不受影響。

**最後修法**：
照他的 aim() 寫，但 vb 改讀 G5a 修正版算出來的 MapPanel.shared.midTop（= lowTop + lowH − midT，不讀 probe.top）。另外：
- 748 行改成 `pos = .region(aim(MKCoordinateRegion(center: h.coordinate, latitudinalMeters: 3000, longitudinalMeters: 3000)))`。
- bounds、picked（535 和 534 的 Flight 目的地）、zoom、302 行定位、focus 照他列的改。
- focus 的判斷式 `pins.locate?(…)` 經過 optional chaining 會攤平成 CGPoint?，可以直接用 guard let。
- 三個改動（G5c 搬一行、G5a 的 report 和 setFoot、G5d 的 aim）放在同一個 commit。動到的函式都在 MapTab.swift 和 MapPanel.swift 兩個檔。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

在 MapTab.swift 加一個 helper，所有首頁的鏡頭動作都經過它。它把「要讓 r 落在 headY 到中段上緣那塊」換算成「要交給 Map 的區域」：
```swift
// 鏡頭框的那塊是 headY…footY（最低段上緣），中段時下面一截被面板蓋住：
// 中心往南挪、需要時把緯度範圍放大，讓 r 落在看得到的那塊（headY…中段上緣）
private func aim(_ r: MKCoordinateRegion, grow: Bool = true) -> MKCoordinateRegion {
    let mid = MapPanel.shared.midTop
    let vb = mid > headY + 50 ? min(mid, footY) : footY
    let hf = footY - headY, hv = vb - headY
    guard hf > 50, hv > 50 else { return r }
    let lat = grow ? r.span.latitudeDelta * Double(hf / hv) : r.span.latitudeDelta
    let shift = Double((footY - vb) / 2 / hf) * lat
    return MKCoordinateRegion(center: .init(latitude: r.center.latitude - shift, longitude: r.center.longitude),
                              span: .init(latitudeDelta: lat, longitudeDelta: r.span.longitudeDelta))
}
```
要套用的地方：
- bounds（752-758）：拿掉 `- 0.15` 和 `* 1.9`，改成中心＝南北中點、緯度範圍＝(max−min)×1.3（留圖釘的高度），回傳 `aim(...)`。fit()（745）在 `footY == 0` 時先 return，不要把 fitted 設成 true（G5a 的 applyFoot 量到後會補叫 fit()）。
- picked()（535）：`pos = .region(aim(MKCoordinateRegion(center: c, span: span), grow: false))`。flight（534）的目的地改成 `aim(...).center`：在 picked 裡先算好存進 Flight(lat:lng:)，這樣 171-182 行不用改。
- zoom()（674-676）：把原本的 region 包一層 `aim(...)`。
- 定位按鈕（302）：`pos = .region(aim(MKCoordinateRegion(center: l.coordinate, span: span), grow: false))`。
- focus()（684-692）：改用螢幕座標判斷看不看得到，不再看 region 比例：`guard let pt = pins.locate?(.init(latitude: la, longitude: lo)) else { return }; let bottom = MapPanel.shared.top > 0 ? MapPanel.shared.top : footY; guard pt.y < headY + 50 || pt.y > bottom - 20 || pt.x < 30 || pt.x > Self.mapWidth - 30 else { return }`，移動改成 `pos = .region(aim(MKCoordinateRegion(center: .init(latitude: la, longitude: lo), span: r.span), grow: false))`。
- 「附近 N 間」（NearbyHost.visible）和抽一間的範圍（drawCtx）都沒有讀 footY，先不要動。行程模式（TripPanel fitCoords、goRegion）也不用改。

</details>

**反方意見**：G5a 改了之後鏡頭動作必須跟著改，這點對；aim() 的數學我驗過也對：框住那塊中心比看得到那塊中心低 (F−V)/2，中心往南挪 (F−V)/2/hf×lat。問題有幾個：
(1) midTop 的來源會被大卡、鍵盤弄髒（見 G5a），要改用算的。
(2) 漏了 MapTab.swift:748（新帳號用目前位置框 3 公里）。304 行的 .userLocation 沒辦法包，可以接受。
(3) 停在最低段時按定位或點泡泡（atLeastMid 會升到中段）沒問題；但 focus() 在最低段時被卡片列觸發的機會很少，可以不管。
(4) MapKit 會照長寬比把 region 放大，實際的緯度範圍可能比要的大，shift 用要的 lat 算會偏小。行程那邊有 afterFit 量了再修，首頁沒有，誤差不大可以接受。
(5) 他說「附近 N 間」先不要動，但 G5c 改 mapRect 後 visible() 會自動變準，數字會變多或變少，屬於預期的修正，要在測試裡寫明。
(6) fit() 在 footY==0 時先 return 是對的。配合 G5a 修正版，setFoot 會補叫 fit()。

**風險**：(1) midTop 量的是卡片列的中段。點圖釘時面板會換成比較高的大卡，所以店會比大卡上緣略高一點點，不會被蓋住，可以接受。(2) 如果 store.mapRegion（onMapCameraChange 的 c.region）其實只代表 safe area 那塊，「附近 N 間」的換算現在就已經偏了，footY 改了還會再變一次。這點從程式看不出來，要靠模擬器確認。(3) 動到的函式比較多，但都是把原本的 MKCoordinateRegion 包一層 aim()，語法風險小。focus() 改用 pins.locate 那段要注意 Optional 的寫法。

**模擬器驗證**：重新開 App（中段）：所有收藏的店都在搜尋列到中段面板之間，最南邊那根不能被面板蓋住。中段點一根圖釘，圖釘要落在大卡上方看得到的那塊，大約在中間。點泡泡，展開後的圖釘都在中段面板上方。按定位，藍點在看得到那塊的中間。左右滑卡片列，被蓋住的店要移到看得到的地方，已經看得到的不要動。最低段時拖地圖、停下來，「這一帶 N 間」跟面板上方看得到的圖釘數要對得上，修改前後各數一次比較。最後回歸測試行程模式的框站、出發中鏡頭，表現要跟改之前一樣。

### 反方補充（調查員漏掉的）
- MapTab.swift:207-208：mapRect 的 onGeometryChange 接在 .ignoresSafeArea() 後面，連上緣也量錯（minY≈62）。148 行的上邊距少了約 62pt，鏡頭框住那塊的上緣跑到搜尋列底下（G5c 只看到下緣）
- MapTab.swift:249 safeAreaInset(.bottom) 的 NearbySheet 沒有 .ignoresSafeArea(.keyboard)：在中段點搜尋框，鍵盤把面板推高，setFoot（MapTab.swift:539-543）改 footY，Map 重排一次，收鍵盤再重排一次。標誌也跟著跳，違反 HIG『不要跟著介面動』
- TripPanel.swift:862-863、880-893：mode.mapTop、mapBottom 跟地圖實際框住的區域差約 96pt（上 62、下 34），rho≈0.8，afterFit 幾乎每次框站都會用 0.3 秒 snappy 再補動一次鏡頭。這可能跟 J4『進行程後連續幾幀 100ms 以上』有關，要量
- MapTab.swift:797-798 NearbyHost.visible 用錯的 mapRect（minY 62、height 778）換算看得到的那塊，「附近 N 間」的範圍偏北約 5% 螢幕高。G5c 改了之後數字會變，要列進驗收
- 可能的問題：如果 208 行量到的外層 frame 會跟著鍵盤縮，行程模式在 TripTop 🔍 打字時 149 行的邊距會變成 0，在行程裡也重排。程式註解說進出行程不改邊距，這條路徑沒被擋住，要在模擬器 print(mapRect) 確認
- MapTab.swift:748 新帳號用目前位置框 3 公里的鏡頭動作不在 G5d 的清單裡
- MapTab.swift:893、933 的註解說 foot 回報的是『上緣（含上面那排按鈕）』，實際 probe.foot 是面板上緣（MapTab.swift:945 在 .offset 外面量）。所以行程、定位兩顆按鈕和左下膠囊都在鏡頭框住的範圍裡，鏡頭置中的店可能被右下兩顆按鈕蓋住，註解也會誤導下一個修的人
- G5a 原修法的 roomy onChange（store.mapBase）會在同步完成時再觸發一次重排，跟圖釘落下的動畫疊在一起。建議固定多留 46pt，不要做成動態

---

## G6 收藏頁小齒輪與抽一間面板

### G6a（P2，反方要求修改）抽一間面板「符合 82 家」跟標題「86 間」對不起來：面板把同一家的分店算一家

**證據**
- t30：標題「我的收藏 86 間」，篩選是「全部」、搜尋空白
- t31：面板範圍「全部」、分類「全部」，底部「符合 82 家」
- ListTab.swift:19 visible = store.shown(store.listF)；ListTab.swift:31 標題顯示 visible.count（分店各算一間，註解在 ListTab.swift:30）
- ListTab.swift:144 收藏頁的 drawCtx：base = store.mine、onMap = false，所以沒座標的店也算進去（不是沒座標造成的差）
- Draw.swift:87 candidates 最後 return store.brands(l).map { $0[0] }：同一家的分店合成一家
- Draw.swift:251 DrawPanel 的 n = candidates(...).count；Draw.swift:322 顯示「符合 n 家」
- Draw.swift:105-109 「7 天內抽過的先跳過」只在 pick() 裡做，candidates 不扣，所以 82 不含這個因素
- Store.swift:644 brands() 依 brand() 分組；ListTab.swift:21-23 收藏頁的卡片也是照品牌合併，所以畫面上其實是 82 張卡

**根因**：同調查員：標題的 86 是照分店算的間數，面板的 82 是同一家分店合成一家後的家數，單位不同（「間」對「家」），畫面上也沒有說明。補一點：收藏頁的抽一間根本不看收藏頁的篩選（ListTab.swift:144 base = store.mine），所以篩了「咖啡」以後，標題會變成例如 12 間，面板還是 82 家。這個落差比分店造成的大，見漏掉的問題。

**最後修法**：
matching()、recentCount()、DrawPanel.body 的 all/pool/n/skip 照調查員寫的做。差別在 bottom(_ n: Int, _ total: Int, _ skip: Int)（Draw.swift:310）：小字不要塞在「抽！」左邊那欄，改成放在 HStack(spacing: 12)（Draw.swift:321）的上面，當成 VStack(spacing: 8) 裡獨立一行、跟面板一樣寬：
```swift
let notes = [total > n ? "分店算一家（共 \(total) 間）" : nil, skip > 0 ? "7 天內抽過的 \(skip) 家先跳過" : nil].compactMap { $0 }
if !notes.isEmpty {
    Text(notes.joined(separator: "・")).font(.caption.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5))
        .frame(maxWidth: .infinity, alignment: .leading).lineLimit(2).fixedSize(horizontal: false, vertical: true)
}
```
這樣「符合 82 家」和「抽！」那一行的版面完全不動。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

範圍小，只改 Draw.swift：
1) Drawer 裡把 candidates 拆成兩段：新加 func matching(_ store: Store, _ c: Ctx, _ p: DrawPrefs) -> [Place]，內容是現在 Draw.swift:63-86（return l）；candidates 改成 `store.brands(matching(store, c, p)).map { $0[0] }`。hint() 不用改。
2) Drawer 加一個公開函式（recentBrands 是 private，所以要寫在 class 裡面）：
```swift
func recentCount(_ store: Store, _ pool: [Place]) -> Int {
    let r = recentBrands(); return pool.filter { r.contains(store.brand($0)) }.count
}
```
3) DrawPanel.body（Draw.swift:250-251）改成：
```swift
let all = drawer.matching(store, ctx, p)
let pool = store.brands(all).map { $0[0] }
let n = pool.count
let skip = p.noRepeat ? drawer.recentCount(store, pool) : 0
```
Draw.swift:305 改成 bottom(n, all.count, skip)。
4) bottom(_ n: Int, _ total: Int, _ skip: Int)（Draw.swift:310）在「符合 n 家」那個 Text 外面包一層 VStack(alignment: .leading, spacing: 2)，下面加一行小字（.caption.weight(.semibold)、Color.ink.opacity(0.5)）：total > n 時顯示「分店算一家（共 \(total) 間）」；skip > 0 時接上「・7 天內抽過的 \(skip) 家先跳過」。兩個都沒有就不顯示。

</details>

**反方意見**：根因對：ListTab.swift:31 標題數的是 visible.count（分店各算一間），Draw.swift:87 candidates 回傳 store.brands(l).map { $0[0] }（同一家分店只算一家），面板在 Draw.swift:251 數的是後者。ListTab.swift:144 的 onMap=false，所以 Draw.swift:75 濾掉沒座標的那段不會跑；7 天不重複只在 pick()（Draw.swift:105-109）裡扣。我另外查了 Store.swift:145 shown()，篩選是空的時候結果就是 mine，所以 86 = mine.count，82 = brands(mine).count，正好也等於 ListTab.swift:21-23 卡片的張數。價位、這一餐在 t31 被擋住，看不到，這點調查員也說了。
修法的拆法（加 matching、加 recentCount、bottom 多傳兩個參數）可以編譯，也只有 Draw.swift:305 一處呼叫。問題在風險那段「左邊空間還放得下」不對：小字是 caption 大約 12pt，「分店算一家（共 86 間）」約 128pt，再接「・7 天內抽過的 1 家先跳過」總共約 270pt。可是左邊能用的寬度，在 402pt 的 medium 浮動 sheet 約 386−36−120−12 ≈ 218pt，375pt 只有約 190pt。兩段同時出現時一定會換成兩行，「符合 N 家」那一欄會被擠窄，底部列會高大約 32pt，不是 16pt。

**風險**：bottom() 簽名改了，Draw.swift 裡只有 :305 一處呼叫，不會影響其他檔。小字多一行，底部列會高大約 16pt，375pt 寬時「抽！」按鈕固定 120pt 寬，左邊空間還放得下。

**模擬器驗證**：收藏頁篩選選「全部」→ 點齒輪 → 範圍「全部」、分類「全部」、想去去過「都可以」、價位「不限」、這一餐關掉：底部要寫「符合 82 家」，下面小字「分店算一家（共 86 間）」，86 要跟標題一樣。抽一次並點卡片進店家頁（這樣才會記錄），再打開面板：「7 天不重複」開著時小字要多「7 天內抽過的 1 家先跳過」，關掉就消失。

### G6b（P1，反方要求修改）收藏頁打開抽一間面板 PerfHUD 280ms：兩個地方都 mark，看起來是第一次建 sheet（裡面還包一層 NavigationStack）太重

**證據**
- ListTab.swift:146-149 openPanel() 先 Perf.shared.mark("抽一間面板") 再 paneling = true
- Draw.swift:307 DrawPanel 的 .onAppear { Perf.shared.mark("抽一間面板") }，用同一個名字
- Perf.swift:45 pending 只有一格，第二次 mark 會蓋掉第一次；Perf.swift:85 只要放開比 mark 早不到 1 秒，都是從手指放開開始算
- Draw.swift:252-306 DrawPanel 裡多包一層 NavigationStack，加上 .navigationTitle、.toolbar 的完成鈕
- Draw.swift:251 每次 body 都重算 candidates（86 間做篩選、brands 分組、nearFirst 算距離排序），量不大
- Draw.swift:256-298 一次建約 25 個 Chip（各有 shadow）、3 個 Toggle、5 個 Flow 版面，再加 DrawHistory
- ListTab.swift:133-136 sheet 的 presentationDetents([.medium, .large])；MapTab.swift:339-342 地圖也是同一個 DrawPanel

**根因**：放開手指後大約 280ms 才出現 onAppear 之後的第一幀，可能的來源有：sheet 第一次建立（UIKit presentation、hosting controller、NavigationStack 和 iOS 26 的玻璃工具列）、約 25 個 Chip 和 5 個 Flow 的第一次版面計算，以及 paneling 讓整個 ListTab.body 重跑。哪一塊最重，現在的 PerfHUD 分不出來，因為 Perf.pending 只有一格（Perf.swift:20、:45），同一個 runloop 裡的兩次 mark 只會留下後一次。

**最後修法**：
第 1 步改成兩處小改：(a) Perf.swift 的 pending 改成陣列，同一幀裡的 mark 都留著。Perf.swift:20 改成 `@ObservationIgnored private var pending: [(name: String, at: CFTimeInterval)] = []`；mark()（:45）改成 `pending.append((name, CACurrentMediaTime()))`；stop()（:63）改成 `pending = []`；tick()（:82-90）把 `if let p = pending { pending = nil ... }` 改成 `let ps = pending; pending = []; for p in ps { ...原本內容... }`。(b) Draw.swift:307 改名成「抽一間面板內容」。這樣如果兩行毫秒數幾乎一樣，就是同一個 runloop 裡同步建 sheet 卡住；如果「抽一間面板」很小、「內容」很大，就是 sheet 晚一個 runloop 才建。
第 2 步（拿掉 NavigationStack、自己畫標題列）要等第 1 步量完、而且確定 sheet 建立是大頭才做。做的時候「完成」加 .buttonStyle(PressStyle())，標題加 .accessibilityAddTraits(.isHeader)。
第 3 步照調查員寫的。也可以考慮把 Draw.swift:255 的 DrawHistory 和 :288-293 的三個 Toggle 包成 LazyVStack 的後段。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

分兩步，都只改 Draw.swift 的 DrawPanel：
1) 先把量法分開：Draw.swift:307 改成 `.onAppear { Perf.shared.mark("抽一間面板內容") }`。ListTab.swift:147 和 MapTab.swift:478 不動。這樣 HUD 會分成兩行：「抽一間面板」= 放開到狀態改變後第一幀，「抽一間面板內容」= 放開到內容出現。如果「抽一間面板」這行也 200ms 以上，就是 sheet 在同一個 runloop 同步建的時候卡住主執行緒。
2) 拿掉 NavigationStack，改成自己畫標題列（版面一樣）。DrawPanel.body 改成：
```swift
VStack(spacing: 0) {
    HStack {
        Color.clear.frame(width: 60, height: 44)
        Spacer()
        Text("抽一間").font(.headline).foregroundStyle(Color.ink)
        Spacer()
        Button("完成") { dismiss() }.font(.body.weight(.semibold)).foregroundStyle(Color.accent)
            .frame(width: 60, height: 44)
    }
    .padding(.horizontal, 8).padding(.top, 8)
    ScrollView { /* 原本 VStack(alignment: .leading, spacing: 18) { ... }.padding(18) 整段不動 */ }
        .safeAreaInset(edge: .bottom, spacing: 0) { bottom(n) }
}
.background(Color.bg)
.presentationDragIndicator(.visible)
.onAppear { Perf.shared.mark("抽一間面板內容") }
```
刪掉 .navigationTitle、.navigationBarTitleDisplayMode、.toolbar 三行。
3) 如果改完「抽一間面板」還是超過 100ms，再試：把 Draw.swift:289-291 的三個 Toggle 搬到 section("怎麼抽") 下面（不在 medium 第一屏就可以晚一點畫），或把整個 ScrollView 內容改成 LazyVStack。只有 1、2 做完量過之後才做這步。

</details>

**反方意見**：量法的分析大致對：ListTab.swift:147 和 Draw.swift:307 都用同一個名字 mark，Perf.swift:85 兩次都是從手指放開開始算，所以 280 沒有灌水。另外有個旁證：280ms 比 iOS 26 sheet 滑上來的動畫（約 0.4 秒以上）短，所以 onAppear 不是在動畫結束時才觸發，比較像是在 sheet 開始滑之前。可見放開後大約 1/4 秒畫面沒動，這是真的。
但第 1 步的診斷方法沒效：Perf.swift:20 的 pending 只有一格，Perf.swift:45 的 mark 會直接蓋掉。如果 sheet 是在同一個 runloop 同步建好（這正是我們想抓的情況），「抽一間面板」在下一個 tick 之前就被「抽一間面板內容」蓋掉，HUD 只會出現一行，不會像 sim_check 寫的「記下兩行」。改名字解決不了這個問題。
另外，第 2 步拿掉 NavigationStack 會不會變快，是猜的：程式裡看不出哪一塊最重。拿掉之後還會少掉 iOS 26 原生的玻璃「完成」鈕（t31 右上角那顆），自己刻的標題列要補 .accessibilityAddTraits(.isHeader)，「完成」也要用 PressStyle 才符合按下就動的規則。
還有一個調查員沒提到的成本：paneling 是 ListTab 的 @State（ListTab.swift:10），一改就會讓整個 ListTab.body 重跑，包括 shown、brands、BrandCard、LazyVGrid 的 diff，以及 .animation(value: cards.map(\.id))。86 間應該不重，但它跟 sheet 的建立在同一幀。

**風險**：拿掉 NavigationStack 之後，標題列的樣式（字級、間距）要自己對齊，深色模式記得標題用 Color.ink。DrawPanel 裡沒有 NavigationLink，所以不會壞掉導覽。地圖和收藏頁共用 DrawPanel，兩邊會一起改。iOS 26 的 sheet 本來就會顯示拉桿，加 presentationDragIndicator(.visible) 不會出問題。不碰 Map 的 safe area 和大小。

**模擬器驗證**：開 PerfHUD，殺掉 App 重開，切到收藏頁：(a) 點齒輪，記下「抽一間面板」和「抽一間面板內容」兩行；(b) 關掉再點 4 次，各記一次。第一次目標 ≤ 120ms，之後 ≤ 60ms。在地圖面板點齒輪也照做一次，確認沒變慢。用模擬器錄影，一格一格看：放開手指後 1–2 幀內 sheet 要開始往上滑。完成鈕、往下拉關閉、「抽！」都還能用。

### G6c（P1，反方確認）收藏頁標題列的齒輪看起來像「篩選」，要做成跟地圖一樣的「🎲 抽一間」橘色膠囊加齒輪

**證據**
- t30：右上角依序是淡色方塊 🎲、淡色圓圈 slider 圖示、橘色 +；🎲 沒有文字，齒輪單獨看就是篩選圖示
- ListTab.swift:37-65 收藏頁自己刻的 🎲 方塊（42pt）和齒輪（slider.horizontal.3）；這兩顆跟地圖的膠囊是分開寫的
- Draw.swift:167-209 DiceChip：橘色膠囊「🎲 抽一間」加上同一顆齒輪，裡面已經處理好長按 0.35 秒和轉骰子；MapTab.swift:1052、:1208 地圖就是用這個
- ListTab.swift:28-34 「我的收藏」30pt black 跟「86 間」用 firstTextBaseline 排在同一行
- 規格 C3：收藏頁 🎲 旁邊加跟地圖一樣的小齒輪（開 DrawPanel）

**根因**：規格只說要「加小齒輪」，實作就在沒有文字的 🎲 方塊旁邊放了一個 slider 圖示。地圖的齒輪是緊貼在「🎲 抽一間」膠囊旁邊，一看就知道是抽一間的設定；收藏頁的 🎲 方塊看起來像裝飾，而且這個齒輪就在搜尋框和篩選列上面，大家自然會當成篩選。

**最後修法**：
只改 ListTab.swift 的 body 標題列（ListTab.swift:27-67）：
1) 把 ListTab.swift:37-65（if !store.mine.isEmpty { 🎲 Button ... 齒輪 Button }）整段換成：
```swift
if !store.mine.isEmpty {
    DiceChip(draw: draw, panel: openPanel)
}
```
（DiceChip 在 Draw.swift:167，長按、轉骰子、無障礙說明都已經包好了）
2) 375pt 寬放不下「我的收藏 86 間」＋膠囊＋齒輪＋＋。估算：可用寬度 375−32＝343；標題約 120、86 間約 45、DiceChip 約 147、+ 鈕 44、間距約 24，加起來約 380。所以把「86 間」移到標題下面。ListTab.swift:28 的 HStack(alignment: .firstTextBaseline, spacing: 8) 改成 VStack(alignment: .leading, spacing: 0)，標題那行加 `.lineLimit(1).minimumScaleFactor(0.8)`。外層 HStack（ListTab.swift:27）改成 HStack(spacing: 8)，Spacer() 改成 Spacer(minLength: 0)。改完約 120＋147＋44＋16＝327，375 寬放得下。
3) ListTab.swift:11 的 @State long 變成沒人用，可以刪，留著也能編譯。

**反方意見**：行號都對：ListTab.swift:37-65 是沒有文字的 🎲 方塊加 slider 齒輪，:66 是 AddButton，:28 是 firstTextBaseline 的 HStack。DiceChip 在 Draw.swift:167-209，MapTab.swift:1052 和 :1208 都在用，呼叫方式 DiceChip(draw: draw, panel: panel) 跟 ListTab 的 private func draw()/openPanel() 簽名一樣，可以直接傳。
我自己算的寬度：DiceChip 約 143pt（.fixedSize），AddButton 44，標題 120，「86 間」約 41，間距加起來約 24，總共約 372pt。402pt 機型可用寬度是 370、375pt 機型是 343，兩種都塞不下，所以「86 間」一定要移到標題下面，調查員的判斷是對的。移下去以後約 120+8+143+8+44 = 323，375pt 也放得下。換成 DiceChip 還順便修好一件事：ListTab.swift:42-43 原本的骰子旋轉沒檢查 reduce motion，DiceChip（Draw.swift:182）有檢查。
小提醒：「我的收藏」是固定 30pt、不會跟著字級放大，DiceChip 用 .subheadline 會放大。字放很大時標題要靠 minimumScaleFactor(0.8) 縮，最大的輔助字級還是可能擠爆，這部分建議只在 sim_check 加一張大字級截圖確認，不用改程式。

**風險**：標題區會變高（30pt 標題加 17pt 數字，大約 50pt，比原本的 44pt 高），下面整頁會往下推一點。DiceChip 的 PressStyle 按下時沒有輕震（原本收藏頁的 🎲 有），要一樣的話，在 Draw.swift:192 改成 PressStyle(haptic: true) { long = false }，地圖也會一起有輕震。字體調大（Dynamic Type）時膠囊會變寬，標題靠 minimumScaleFactor 縮小。

**模擬器驗證**：iPhone 17（402pt）和 iPhone SE／13 mini（375pt）都截收藏頁：右上角是橘色膠囊「🎲 抽一間」＋齒輪＋＋，都在同一行、沒有被截斷，「86 間」在「我的收藏」下面。點膠囊會抽（骰子轉），長按膠囊或點齒輪會打開抽一間面板。收藏 0 間時膠囊不出現，只剩＋。

### G6d（P3，反方要求修改）抽一間面板「範圍」：「全部」放第一個，不要單獨掉到第二行

**證據**
- t31：範圍第一行是「走路 800 m／騎車 3 km／開車 12 km」，「全部」單獨在第二行
- Draw.swift:256-262 section("範圍") 的順序：地圖上看到的（只有地圖）→ 走路 → 騎車 → 開車 → 全部
- Draw.swift:261 「全部」的選中條件是 p.scope == .all || (!ctx.onMap && p.scope == .view)
- GroupsTab.swift:767-790 Flow 排滿一行就換行；t31 量起來四顆加間距約 380pt，面板內容寬約 350pt

**根因**：同調查員：「全部」排在最後，四顆加起來約 374pt，比面板內容寬（約 350pt）還寬，Flow（GroupsTab.swift:767）就把最後一顆擠到下一行。

**最後修法**：
只做搬順序：Draw.swift:261 那行移到 section("範圍") 的第一行，其餘不動。不要為了排一行去改字串或 Chip 的 padding（Chip 在 Theme.swift:46 是全 App 共用的）。sim_check 改成：402pt 和 375pt 都是第一行「全部、走路、騎車」，第二行「開車 12 km」（375pt 可能連騎車也掉下去），「全部」要在第一顆而且是選中狀態。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

Draw.swift DrawPanel.body 的 section("範圍")（Draw.swift:256-262）把 :261 那行搬到第一個：
```swift
section("範圍") {
    chip("全部", p.scope == .all || (!ctx.onMap && p.scope == .view)) { drawer.prefs.scope = .all }
    if ctx.onMap { chip("地圖上看到的", p.scope == .view) { drawer.prefs.scope = .view } }
    chip("走路 800 m", ...)
    chip("騎車 3 km", ...)
    chip("開車 12 km", ...)
}
```
這樣就算還是排不下，掉到第二行的是「開車 12 km」，閱讀順序也是順的。想在 375pt 寬也排成一行，可以再把文字改短成「走路 800m」「騎車 3km」「開車 12km」（只改字串，不改 Chip）。

</details>

**反方意見**：把「全部」搬到 Draw.swift:256-262 的第一顆是對的，行號和選中條件（:261）也對。但兩個說法不對：(1)「文字改短（走路 800m 等）就能在 375pt 排成一行」：從 t31 量，膠囊寬約 全部 54、走路 100、騎車 94、開車 102，加 3 個 8pt 間距約 374pt。每顆少一個空格大約省 4pt，變成約 362pt，可是 402pt 的 medium 浮動 sheet 內容寬只有約 350pt（375pt 機型約 323pt）。連 iPhone 17 都排不成一行，375pt 更不可能。(2) 搬完以後在 402pt medium 還是會有一顆（開車 12 km）單獨掉到第二行，只是換了一顆。這可以接受（閱讀順序是對的），但 sim_check 要寫成預期就是這樣，不要讓測試者以為還是 bug。地圖那邊多了「地圖上看到的」，一定是兩行。

**風險**：地圖也共用這個面板，地圖的順序會變成「全部、地圖上看到的、走路…」。地圖的預設 scope 是 .view，選中的那顆會在第二個，不影響功能。

**模擬器驗證**：收藏頁點齒輪：範圍第一顆是「全部」而且是選中狀態；402pt 寬時「開車 12 km」可以掉到第二行，但「全部」不可以單獨一行。在地圖面板點齒輪：順序是全部、地圖上看到的、走路、騎車、開車，點每一顆，選中狀態和「符合 N 家」都要跟著變。

### 反方補充（調查員漏掉的）
- P2 ListTab.swift:144 + Store.swift:99-101：收藏頁的抽一間從 store.mine 抽，不看收藏頁的篩選（C4 之後 listF 就是 mapF）。篩了「咖啡」以後標題會變成例如 12 間，面板還是寫「符合 82 家」，抽出來也可能不是咖啡。這比分店造成的 4 間落差更讓人困惑。至少要在面板範圍那裡寫「從全部收藏抽，不看上面的篩選」，或者決定 base 改成 visible（ListTab.swift:19），這要 Anthony 決定。
- P3 Draw.swift:261 + Draw.swift:10、24：設定只有一份，地圖和收藏頁共用 Drawer.shared.prefs。收藏頁在 scope = .view 時也會把「全部」亮起來，使用者再點一下「全部」，scope 就變成 .all，地圖的抽一間也會悄悄從「地圖上看到的」變成全部收藏。收藏頁選「走路 800 m」同樣會改到地圖。面板上看不出這件事。
- P3 Perf.swift:20、:45、:82-83：pending 只有一格，同一個 runloop 裡的兩次 mark 只會留下後一次。所以 ListTab.swift:147 的「抽一間面板」常常根本不會出現，而且凡是會連續 mark 的動作，HUD 都會少行。
- P3 Perf.swift:85、:87：長按打開面板時（ListTab.swift:50-54、Draw.swift:193-197），mark 比手指放開早。這時 p.at - touchUp 是負數，一樣會通過 < 1 的判斷，DrawPanel onAppear 的那一次就從比 mark 晚的 touchUp 開始算，量出來的毫秒會偏小，甚至只剩幾毫秒，「按住 N」也會不準。條件應該加上 p.at >= touchUp。
- P3 ListTab.swift:10、:133：paneling 放在 ListTab 這一層的 @State，一打開或關掉面板，整個收藏頁的 body 就重跑（shown、brands、BrandCard、LazyVGrid diff），而且跟 sheet 的建立在同一幀，會加到按下那幀的成本。量完 G6b 第 1 步如果還不夠快，可以把 .sheet(isPresented:) 和 paneling 包成一個小的子 View/ViewModifier，把重跑的範圍縮小。
- P3 Draw.swift:322：「符合 n 家」的單位是「家」，標題（ListTab.swift:31）、地圖、「我的」都用「間」。G6a 的小字補上以後要全 App 統一說法：「家」是合併分店後的店家，「間」是個別分店，不然測試者還是會比對數字。

---

## G7 店家頁：返回後訊息條消失、捲下去返回鍵不見、進頁 118–191ms

### G7a（P3，反方要求修改）店家頁的訊息條沒有被底部按鈕列擋住，但位置是湊出來的，返回時會瞬間跳位

**證據**
- FoodMapApp.swift:116-118 onMap、onTrip 都要 store.mapPath.isEmpty，所以在店家頁兩個都是 false
- FoodMapApp.swift:138 店家頁時 .padding(.bottom, 96)，這是給分頁列用的數字
- PlaceDetail.swift:211-212 底部按鈕列高度 58 + 上 10 + 下 6 = 74pt（都從安全區底部算），訊息條底邊在 96pt，中間空 22pt，所以沒被擋
- PlaceDetail.swift:41 按鈕列是 .safeAreaInset(edge: .bottom)，不影響 Root 的 overlay
- Store.swift:67 barHidden 在店家頁為 true（分頁列藏起來），96 剛好沒東西可對齊
- FoodMapApp.swift:138-139 padding 的變化沒有 animation，mapPath.removeLast()（Store.swift:431）也沒有包 withAnimation，返回那一刻訊息條會從 96 直接跳到 panelTop+8
- t03/t04 只拍到地圖上的訊息條，沒有店家頁裡的訊息條截圖；t04 左下 PerfHUD（Perf.swift:149 padding 92）蓋住了最低段的訊息條左半邊

**根因**：Root 的訊息條只認得「地圖首頁」和「行程模式」兩種位置，其他情況一律離底 96pt。店家頁的按鈕列高 74pt，所以訊息條離它 22pt，沒有被擋，只是剛好躲開，沒有真的貼著按鈕列。按鈕列高度一改就會壓到。返回時位置從 96 換成面板上緣，中間沒有動畫，訊息條會瞬間跳上去。

**最後修法**：
照原修法做，只改一處：FoodMapApp.swift Root toast 的 pad 改成
```swift
let pad: CGFloat = onMap ? store.panelTop + 8 : onTrip ? min(TripMode.shared.panelH, 420) + 8 : (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
```
加上 store.barHidden 這個條件，分頁列有顯示時一律用 96，bottomBar 留著舊值也不會用錯。其餘照原本的：Store.swift 加 `var bottomBar: CGFloat = 0`；PlaceDetail.actions 加 onGeometryChange（值有變才寫）；body 加 `.onDisappear { store.bottomBar = 0 }`；`.animation(.snappy(duration: 0.3), value: pad)` 放在 `.transition` 前面。Root 只有在訊息條顯示時才會讀 bottomBar，推頁時多寫一次不會讓沒有訊息條的 Root 重算。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

1) Store.swift：在 panelTop 旁邊加 `var bottomBar: CGFloat = 0`（店家頁底部按鈕列的高度，0 = 沒有）。
2) PlaceDetail.swift 的 actions(_:branched:)：在 `.background(...)`（第 213 行）後面加
```swift
.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if abs(store.bottomBar - h) > 0.5 { store.bottomBar = h } }
```
然後在 body 的 `.onAppear` 旁邊加 `.onDisappear { store.bottomBar = 0 }`。
3) FoodMapApp.swift 的 Root toast overlay：在第 118 行後面加
```swift
let pad: CGFloat = onMap ? store.panelTop + 8 : onTrip ? min(TripMode.shared.panelH, 420) + 8 : store.bottomBar > 0 ? store.bottomBar + 8 : 96
```
第 138 行改成 `.padding(.bottom, pad)`，並在 `.padding(.trailing, …)` 後面、`.transition` 前面加 `.animation(.snappy(duration: 0.3), value: pad)`，返回時訊息條會滑到面板上緣，不會用跳的。onMap 擺在判斷的第一位，所以返回動畫還在跑、onDisappear 還沒觸發時，位置也已經是地圖的。

</details>

**反方意見**：行號和推論都對得上：FoodMapApp.swift:116-118 的 onMap、onTrip 在店家頁都是 false，所以走 138 行的 96；PlaceDetail.swift:211-212 按鈕列是 58+10+6=74pt（用 t15 量也大約 76pt），訊息條底邊離按鈕列約 20pt，沒有被擋。規格 B6 也寫「其他分頁照舊 96」，所以現在的行為是照規格做的，算不上 bug，比較像改善，P2 偏高。修法有一個漏洞：分頁是用 opacity 疊在一起（FoodMapApp.swift:184-192），不是真的移除，切走分頁時店家頁不會觸發 onDisappear。例如從收藏頁進店家頁、加進行程、點訊息條（TripMode.open 會切到 tab 0，但收藏頁的 path 不會清），store.bottomBar 會一直留著 74。之後到群組或我的分頁，分頁列是顯示的，訊息條卻用 82 而不是 96。分頁列高 64pt，所以不會壓到，但位置不一致。

**風險**：onDisappear 是在推頁或返回動畫結束後才觸發，這段時間裡 bottomBar 還留著舊值，但 onMap 和 onTrip 排在前面，所以不會用錯。群組頁或收藏頁推進店家頁時，返回後 bottomBar 歸 0，訊息條回到 96。.animation 只綁 pad，不會影響訊息條本身出現和消失的 transition。

**模擬器驗證**：開店家頁按「加進行程」（只有一個進行中的行程，會直接加），截圖量訊息條底邊到按鈕列上緣的距離，應該約 8pt，而且訊息條沒有壓到按鈕列。用 -uitestSlowToasts 讓訊息條停久一點，按「<」返回，連拍 3 張，訊息條應該從按鈕列上方平滑移到面板上緣，不是一格就跳過去。最低、中、最高三段面板都試一次。

### G7b（P2，反方確認）從店家頁返回後訊息條不見：程式裡找不到返回時會清掉訊息條的地方，最可能是 5 秒倒數到了

**證據**
- Trip.swift:609-612 加進行程的 say 同時帶了 action（復原）和 tap（打開行程）
- FoodMapApp.swift:144 有 action 又有 toastTap 的訊息條只停 5 秒（Store.slowToasts 時 20 秒）；倒數從訊息條出現就開始，在店家頁也照算
- FoodMapApp.swift:143-151 唯一的自動清除是倒數歸零；FoodMapApp.swift:155-159 點訊息條本身才會清
- grep 所有 `toast = nil`：Store.swift:588、Trip.swift:432/519/611、TripPanel.swift:754/921，全在「復原」的 closure 裡，返回不會觸發
- Store.swift:429-432 pop() 只做 mapPath.removeLast()，不碰 toast
- FoodMapApp.swift:112 訊息條 overlay 在 Root 的 Group 最外層，壓在 NavigationStack、分頁列和地圖面板上面，返回後不會被蓋住
- Trip.swift:484 insert 寫入失敗時，send 會呼叫 say("這站沒加到：…")（Trip.swift:381），訊息條會被換成錯誤訊息，不是消失
- 沒有截圖拍到「店家頁加進行程後的訊息條」：t15、t20 的 HUD 最新一筆是「進店家頁」，那兩筆「加進行程 69/54 ms」發生在進店家頁之前（長按圖釘選單加的，對應 t03、t04）

**根因**：靜態看程式，返回時沒有任何地方把 store.toast 設成 nil，訊息條也是疊在整個畫面最上層，返回後不會被蓋住。最可能的情況是：加進行程的訊息條只停 5 秒，模擬器操作（加、截圖、按返回、截圖）加起來超過 5 秒，回到首頁時已經自己收起來了。另一個可能是伺服器寫入失敗，訊息條被換成「這站沒加到」，但那會看到另一條訊息，不會什麼都沒有。目前沒有截圖可以分辨是哪一種，所以標 unknown。

**最後修法**：
照原本的做法（先加 print，再用 -uitestSlowToasts 重跑），另外補兩點。1) sim_check 先確認測試帳號「今天或之後的行程只有一個，而且就是 active」，不然會跳 TripChooser，看不到訊息條。2) 重跑時用 `-perfOverlay` 以外的設定再拍一次，或把面板拉到中段，避免 PerfHUD 蓋住最低段的訊息條，被誤判成消失。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

先查清楚，不先改行為：
1) FoodMapApp.swift Root toast 的 `.task(id: t)`：在第 150 行 withAnimation 前加 `print("[toast] 時間到收起：\(t)")`；在 `.onTapGesture` 開頭加 `print("[toast] 被點掉")`。
2) Store.swift 的 say()：開頭加 `print("[toast] 顯示：\(s)")`。
3) 用 -uitestSlowToasts 重跑一次。如果訊息條返回後還在，就是 5 秒倒數到了：把 Trip.swift:609 的 say 加上 `seconds: 6`，讓「加到 X 第 N 站」多停 1 秒，夠從店家頁返回再看到。現在的設計本來就是「返回後還在就繼續顯示到時間到」，不用另外寫。
4) 如果 20 秒模式下返回後還是立刻消失，把 log 貼回來，再從 log 看是誰清的（那就是真的 bug，要再追 `.task(id: t)` 是否因為 overlay 重建而被取消）。

</details>

**反方意見**：我也照著查了一遍，找不到返回時會清掉訊息條的路徑。所有 `toast = nil`（Store.swift:588、Trip.swift:432/519/611、TripPanel.swift:754/921）都在「復原」的 closure 裡。Store.pop（Store.swift:429-432）只做 removeLast。訊息條 overlay 掛在 Root 的 Group 最外層，返回時 identity 不會變，所以 `.task(id: t)` 不會被取消，也不會重新倒數。加進行程的訊息條同時帶 action 和 tap，只停 5 秒（FoodMapApp.swift:144），模擬器操作一輪很容易超過。HUD 證據也對：t15 的「加進行程」兩筆都在「進店家頁」之前，所以沒有截圖拍到從店家頁加的訊息條。另外兩種可能也可以排除。第一，PerfHUD 疊在訊息條上面（overlay 順序在後，Perf.swift:149 padding 92），t04 最低段時訊息條左半被蓋住，但右邊的「復原」還看得到，不會整條不見。第二，如果有兩個以上的行程，按「加進行程」會先跳選行程的 sheet（Trip.swift:574-582），沒選就返回的話本來就不會有訊息條，sim_check 要先確認只有一個進行中的行程。實際行為是一般的倒數，嚴重度可以從 P1 降到 P2。改成 seconds: 6 可以接受，Trip.swift:430 刪除行程也已經用 seconds: 6，有前例。

**風險**：只是加 print 和改一個秒數，風險很低。seconds 不要設太長，不然在地圖上會一直擋住面板上緣。

**模擬器驗證**：啟動參數加 -uitestSlowToasts，進店家頁按「加進行程」，1 秒內按「<」，截圖確認首頁面板上緣有「加到 … 第 N 站」。再拿掉 -uitestSlowToasts，加完等 3 秒再返回，訊息條應該還在，大約 6 秒時自己收起來。看 Xcode console 的 [toast] log 和畫面是否對得上。

### G7c（P1，反方要求修改）店家頁的返回鍵和「⋯」放在捲動內容裡，捲下去就跟著捲走

**證據**
- t15 店家頁頂有「<」和「⋯」；t20 捲到底兩顆都不見了，狀態列下面露出半速捲動的照片和「看貼文」、「餐廳」膠囊
- PlaceDetail.swift:27-29 ScrollView { VStack { top(place, mine: mine) … } }，top() 是捲動內容的第一列
- PlaceDetail.swift:66-83 top() 是返回鈕（CircleIcon）和 Menu
- PlaceDetail.swift:45 .toolbarVisibility(.hidden, for: .navigationBar)，沒有系統導覽列可以退回去用
- PlaceDetail.swift:16、43、456 已經有 ScrollY（只有大圖讀它），捲動時整頁不用重畫
- PlaceDetail.swift:459-471 Stretchy 往上捲時照片用一半速度，所以 t20 頂端會看到照片露出來

**根因**：返回鍵和「⋯」做成 ScrollView 裡 VStack 的第一列，所以跟著內容一起捲走。導覽列又藏起來了，捲下去以後只能用右滑返回。

**最後修法**：
只改 PlaceDetail.swift：刪掉 body 第 29 行的 `top(place, mine: mine)`；在第 41 行 bottom 的 safeAreaInset 後面加
```swift
.safeAreaInset(edge: .top, spacing: 0) {
    top(place, mine: mine)
        .padding(.horizontal, 14).padding(.bottom, 14)
        .background { TopShade(scroll: scroll) }
}
```
檔尾加 `private struct TopShade`（跟原本的一樣：on = scroll.y > 4，`Color.bg.opacity(on ? 1 : 0)`、陰影、`.ignoresSafeArea(edges: .top)`、`.animation(.easeOut(duration: 0.15), value: on)`）。不需要新的 DragGesture。sim_check 要拿 t15 疊圖比對，確認照片上緣位置沒有跑掉。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

只改 PlaceDetail.swift：
1) body 裡刪掉第 29 行 `top(place, mine: mine)`。
2) 在第 41 行 `.safeAreaInset(edge: .bottom…)` 後面加：
```swift
.safeAreaInset(edge: .top, spacing: 0) {
    top(place, mine: mine)
        .padding(.horizontal, 14).padding(.bottom, 6)
        .background { TopShade(scroll: scroll) }
}
```
3) top() 裡的 `.padding(.top, 4)` 保留。
4) 檔案最後加一個小 view（只有它讀 scroll.y，捲動時不會重算整頁）：
```swift
private struct TopShade: View {
    let scroll: ScrollY
    var body: some View {
        let on = scroll.y > 4
        Color.bg.opacity(on ? 1 : 0)
            .shadow(color: .black.opacity(on ? 0.08 : 0), radius: 8, y: 3)
            .ignoresSafeArea(edges: .top)
            .animation(.easeOut(duration: 0.15), value: on)
    }
}
```
onScrollGeometryChange（第 43 行）原本就用 contentOffset.y + contentInsets.top 算，加了上方 inset 以後，停著時 y 還是 0，Stretchy 不受影響。

</details>

**反方意見**：根因正確。PlaceDetail.swift:27-29 的 top() 是 ScrollView 裡 VStack 的第一列，加上 :45 把導覽列藏起來了，t20 捲到底兩顆按鈕都不見，狀態列下面露出半速捲動的照片（Stretchy :467 offset）。safeAreaInset(top) 加上 TopShade 這個做法可行。onScrollGeometryChange 用的是 contentOffset.y + contentInsets.top，contentInsets 已經包含新的 inset，停著時 y 還是 0，Stretchy 不受影響。有三處要修正。1) 原本 top 和照片之間有 VStack spacing 14，搬到 inset 以後只剩 `.padding(.bottom, 6)`，照片會往上移 8pt，不是「幾乎一樣」，要用 `.padding(.bottom, 14)` 才對得上 t15。2) TopShade 的 Color.bg 不透明時會吃掉觸控，在 bar 上拖動不會捲動內容。這跟系統導覽列一樣，可以接受，寫進 risks 就好。3) 深色模式下 CircleIcon 是白底（Theme.swift:158），配深色的 bar 很突兀，跟 G7e 也有關（見 G7e）。

**風險**：safeAreaInset(top) 會讓內容的起點往下移，位置和現在 top 在內容裡差不多，第一屏看起來幾乎一樣。往下拉放大照片時，照片從 bar 下面長出來；這時 y<0，底色是透明的，看得到。TopShade 每次捲動都會重算，但它只是一塊色塊，很便宜。CircleIcon 的底色寫死 .white（Theme.swift:158），深色模式下還是白色方塊，跟現在一樣。不用新的 DragGesture，所以不需要 .swipeBackBlocked()。

**模擬器驗證**：開店家頁，截圖確認「<」和「⋯」位置跟 t15 一樣。捲到底（像 t20）再截一張：兩顆還在頂端，後面有一條 Color.bg 底色加淡陰影，狀態列下面看不到照片和「看貼文」膠囊。捲回最上面，底色淡掉。往下拉（Stretchy）照片照樣放大。捲到底時按「<」能返回，按「⋯」能打開選單。深色模式也拍一張。

### G7d（P1，反方要求修改）進店家頁要 118–191ms 才出第一幀：整頁（含畫面外的小地圖和群組）一次建好，加上 onAppear 又觸發一次整頁重算，影片和地圖截圖也在推頁時開始

**證據**
- Perf.swift:82-88 時間是從手指放開（或 mark 當下）算到 mark 之後第一個 CADisplayLink tick；mark 在 PlaceDetail.swift:49 的 onAppear，所以量到的是從放開到 PlaceDetail 建好、排好版、送出第一幀
- t15 HUD「進店家頁 191 ms，按住 997」；t35 HUD「進店家頁 118 ms，按住 2」，前一筆是「換分頁」，表示是從收藏頁推的，地圖和清單兩條路都慢
- PlaceDetail.swift:27-36 ScrollView 裡是一般的 VStack（不是 Lazy），畫面外的 groups（Flow）和 MiniMap 也在第一幀就全部建好、排好版
- PlaceDetail.swift:48-51 onAppear 裡做 withAnimation { dishesIn = true }，dishesIn 是整頁的 @State，第一幀前會讓整個 PlaceDetail body 再算一次（PlaceDetail.swift:258-260 只有必點用到它）
- PlaceDetail.swift:424-436 MiniMap 在 onGeometryChange 拿到寬度後，馬上在主執行緒建 MKMapSnapshotter 並 start()，剛好落在推頁的第一幀或轉場中
- Reel.swift:38-55 如果按下時 ReelCache.warm 已經備好播放器（ReelCache.take 命中），就沒有那段 350ms 等待，直接在主執行緒呼叫 AVAudioSession.setCategory（Reel.swift:53，這是同步 IPC），再 start(p)，可能落在第一幀前
- Reel.swift:46-47 沒命中時先等 350ms，但等完之後的 setCategory 和插入 PlayerLayer 還是在轉場尾巴
- PlaceDetail.swift:47 trips 還沒讀過時，推頁那一刻就打 load_trips，讀完後 Trip.swift:360-363 用 withAnimation 換 trips/stops，地圖、行程面板、店家頁都會重畫，可能落在轉場中
- 已經做好的：照片第一幀用記憶體裡任何尺寸的縮圖（Photo.swift:94-97），解碼在背景（Photo.swift:69-74），所以照片解碼不是主因；小地圖已經是截圖，不是互動 Map（PlaceDetail.swift:299-305）
- 不確定：Root 讀 store.barHidden（FoodMapApp.swift:45、Store.swift:67），推頁時會重算 Root；MapTab（MapTab.swift:58 有 count("地圖")）會不會因為 $store.mapPath 也重算，從程式看不出來

**根因**：推頁時，SwiftUI 要在第一幀前把整頁 PlaceDetail 建好並排好版，包括使用者還看不到的群組 chips 和小地圖。onAppear 裡把 dishesIn 改成 true，又讓整頁 body 在同一輪再算一次。小地圖的 MKMapSnapshotter 和預載好的影片（AVAudioSession.setCategory、play）也都在推頁那幾幀的主執行緒上啟動。照片解碼和互動地圖都不是原因，這兩個已經處理過了。MapTab 有沒有跟著重算還不確定。模擬器量到的數字通常比真機高，要拿真機再比一次。

**最後修法**：
照順序做，每步都小。
1) 先量：PlaceDetail.body 開頭加 `let _ = Perf.shared.count("店家頁")`，ListTab.body 和 GroupsTab 的 body 開頭各加 `let _ = Perf.shared.count("收藏")`／`count("群組")`。推頁後看 HUD 的「重畫 …」各是幾次。
2) ListTab.swift:138：從 ListTab body 拿掉 `.onChange(of: path.count)`，在檔案裡加
```swift
private struct DepthReport: View { @Binding var path: NavigationPath; let tab: Int; @Environment(Store.self) private var store
  var body: some View { Color.clear.onChange(of: path.count) { _, n in store.depth[tab] = n } } }
```
再用 `.background { DepthReport(path: $path, tab: 1) }` 掛上去，讀 path 的地方就只剩這個小 view，ListTab 推頁時不會整個重算。GroupsTab.swift:52 照做（tab 2）。
3) PlaceDetail：dishesIn 搬進 `private struct DishChips`，照原修法的第 2 步。
4) MiniMap `.task(id: key)`：cache 沒命中時先 `try? await Task.sleep(for: .milliseconds(450))`，照原修法的第 1 步。
5) Reel.swift:53 只改成 `await Task.detached { try? AVAudioSession.sharedInstance().setCategory(.ambient) }.value`，不要把 350ms 搬到 take 前面，保留預先緩衝的效果。
6) PlaceDetail.swift:47 延後 400ms 再 load，照原修法的第 4 步。
LazyVStack 先不要動。sim_check 要分開記錄從地圖推和從收藏頁推的 ms，也要記 HUD 的重畫次數，再拿真機比一次。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

每步都小，可以分開編譯：
1) PlaceDetail.swift 的 MiniMap.body `.task(id: key)`：在 cache 命中那行（第 427 行）後面加
```swift
try? await Task.sleep(for: .milliseconds(450))
guard !Task.isCancelled else { return }
```
再建 MKMapSnapshotter.Options，地圖截圖等推頁動畫結束才開始。
2) PlaceDetail.swift：把 dishesIn 從整頁移到小 view。刪掉第 17 行 `@State private var dishesIn` 和第 50 行。dishes(_:) 改成回傳 `DishChips(d: d)`，新的 `private struct DishChips: View { let d: [String]; @State private var shown = false; @Environment(\.accessibilityReduceMotion) private var reduce; … }`，內容照搬原本的 VStack，dishesIn 改成 shown，最外層加 `.onAppear { if !shown { withAnimation { shown = true } } }`。這樣第二次重算只會算這一小塊。
3) Reel.swift 的 PlaceMedia `.task(id: place.id)`：把第 47-48 行的 350ms 等待搬到 `if let r = ReelCache.take(src)` 前面，兩條路都先等推頁做完。第 53 行改成 `await Task.detached { try? AVAudioSession.sharedInstance().setCategory(.ambient) }.value`，不在主執行緒做同步 IPC。
4) PlaceDetail.swift 第 47 行：`.task { try? await Task.sleep(for: .milliseconds(400)); if !trips.loaded { await trips.load() } }`。按「加進行程」時第 229 行會自己先 load，所以不會加錯行程。
5)（可選，風險較大，放最後）第 28 行 VStack 改成 LazyVStack(alignment: .leading, spacing: 14)，畫面外的群組和小地圖就不會在第一幀建。
6) 確認 MapTab 有沒有被推頁拖累：推頁後看 HUD 有沒有出現「重畫 地圖 N」。有的話再另外開一項處理，這次先不改。

</details>

**反方意見**：推頁時整頁一次建好、onAppear 又改 dishesIn 讓 body 再算一次，這兩點是對的（PlaceDetail.swift:28 是一般 VStack，:48-51 在 onAppear 裡改 @State）。但其他幾點證據不足，或修法效果有限。1) `.task` 的工作（MiniMap 的 snapshotter、PlaceMedia、trips.load）是在 onAppear 那次更新送出以後，才在主執行緒排隊執行。第一幀早就送出了，它們只會拖慢 HUD 的 CADisplayLink tick（Perf.swift:82-88），推頁動畫本身是 Core Animation 在跑，不太會被拖到。所以第 1、3、4 步主要是讓 HUD 的數字變好看，對「按下就動」幫助有限。2) 第 3 步把 350ms 等待搬到 ReelCache.take 前面，等於讓按下卡片時預先緩衝（PressStyle onPress → ReelCache.warm）的效果白做，影片一定晚 0.35 秒才播。真正花時間的只有同步的 setCategory，搬到背景就好，不用延後整條路徑。3) t15 和 t35 的店都是「看貼文」。maybeVideo 連 IG /p/ 都算（Reel.swift:137），所以影片路徑可能有跑，也可能沒跑，不能拿來當主因。4) 漏掉收藏頁那條路：ListTab.swift:138 `.onChange(of: path.count)` 在 body 裡讀了 path，每次推頁和返回，ListTab 整個 body 都會重算（store.shown、store.brands 會掃全部的店）。store.depth[1] 跟著變，又讓 Root 因為 barHidden 再重算一次。t35 是從收藏頁推的，這可能才是那 118ms 的大頭。GroupsTab.swift:52 也一樣。5) PlaceDetail 沒有 `Perf.shared.count`，HUD 看不到店家頁和收藏頁推頁時重算幾次，所以目前的分析只能猜。在模擬器要求低於 60ms 也不實際，應該跟其他推頁（例如群組頁）比，或拿真機比。

**風險**：第 1 步：第一次打開某間店，小地圖會晚約 0.45 秒才出現，期間是 bg2 底色加圖釘，而且在畫面外，看不到。第 2 步：DishChips 是新 struct，注意 Flow 和 Color.sprinkles 照搬，reduce 要自己從 Environment 讀。第 3 步：預載好的影片會晚 350ms 才開始播。Task.detached 裡呼叫 AVAudioSession 是公開 API，可以在背景執行緒用。第 5 步：LazyVStack 有時會在估計高度時讓捲動條跳一下，Stretchy 和 onScrollGeometryChange 要重測。

**模擬器驗證**：開 PerfHUD，從首頁附近清單、收藏頁各點進店家頁 5 次（包含一間 IG 影片的店、一間有必點的店），記下「進店家頁」的 ms，目標每次都低於 60ms，而且「掉幀（2 秒內）」是 0。推頁時連拍：放開手指後下一張畫面就要看到新頁開始滑進來。捲到底確認小地圖會出現。必點 chips 照樣依序彈出。影片店推進去約 0.4 秒後開始播。順便看 HUD 推頁後有沒有「重畫 地圖」，有的話回報。

### G7e（P1，反方要求修改）深色模式店家頁：店名、地址、去過等文字幾乎看不見（可能跟深色模式那組重複）

**證據**
- t35 深色店家頁：資料卡裡的店名、分店、地址、「去過」幾乎跟底色同色；只有粉紅「想去」和橘色「導航」看得清楚
- Models.swift:77 `static let ink = Color(hex: 0x2a1a0a)` 寫死深咖啡色，沒有深色版本
- Models.swift:74-76 bg、bg2、panel 都有深色版（0x17110b、0x2a2016、0x241b12）
- PlaceDetail.swift:118、123、127、202、251、275 文字都用 Color.ink
- FoodMapApp.swift:137、Onboard.swift:165、Draw.swift:613/619、ListTab.swift:213 把 Color.ink 當深色底（上面放白字）

**根因**：文字顏色 Color.ink 是寫死的深咖啡色，卡片底色 panel 在深色模式卻變成深咖啡，字和底幾乎一樣，等於看不見。這是全 App 的問題，店家頁剛好最明顯。

**最後修法**：
併到深色模式那組。如果這組要先處理，照這個做：1) Models.swift 加 `static let inkFixed = Color(hex: 0x2a1a0a)`，Color.ink 改成 `Color(light: 0x2a1a0a, dark: 0xf6ead8)`。2) 拿 ink 當深底的地方換成 inkFixed：FoodMapApp.swift:137、Onboard.swift:165、Draw.swift:613/619、ListTab.swift:213、TripTop.swift:222。3) 寫死 `.white` 底、上面放 ink 字的地方，`.white` 換成 `Color.panel`：Theme.swift:158 CircleIcon、Theme.swift:74、MapTab.swift:276/290、Draw.swift:519、GroupsTab.swift:253/759、Login.swift:132、SwipeDeck.swift:164/178、TripPanel.swift:1306/1331/1516。地圖上的浮層如果要在深色地圖上維持白底，就改用 inkFixed 字。改完 grep `\.white, in:` 和 `fill(\.white` 逐一確認，深淺色各截一張圖。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

1) Models.swift 第 77 行改成 `static let ink = Color(light: 0x2a1a0a, dark: 0xf6ead8)`，另外加 `static let inkFixed = Color(hex: 0x2a1a0a)`（永遠是深色，給深底用）。
2) 把拿 Color.ink 當深色底的地方換成 Color.inkFixed：FoodMapApp.swift:137（訊息條）、Onboard.swift:165、Draw.swift:613、Draw.swift:619、ListTab.swift:213。
3) 其他 Color.ink.opacity(0.06~0.18) 當淡底或分隔線的地方，深色時會變成淡亮色的薄底，可以不動。
如果深色模式那組已經在處理，以那邊的修法為準，這項不要重複改。

</details>

**反方意見**：根因正確：Models.swift:77 的 Color.ink 寫死深咖啡，:74-76 的 panel、bg 都有深色版，t35 的店名、地址、「去過」、「加進行程」和分享圖示都看不到。但修法會弄壞很多地方。很多地方用 Color.ink 當前景，底色寫死 `.white`。最直接的是 CircleIcon（Theme.swift:155-158）：店家頁的「<」和「⋯」是 Color.ink 圖示放在白底上，ink 在深色模式變成奶油色以後，這兩顆就變成白底白字，看不見。其他「白底配 ink 字」的地方：MapTab.swift:276、290，Draw.swift:519，GroupsTab.swift:253、759，Login.swift:132，SwipeDeck.swift:164、178，TripPanel.swift:1306、1331、1516，Theme.swift:74（Badge 沒去過時是白底）。TripTop.swift:222 也把 Color.ink 當選中的底色（上面放白字）。只 grep `background(Color.ink` 會漏掉這些。另外這項不屬於 G7 的範圍，應該併到深色模式那組，不要在這組改。

**風險**：Color.ink 有 192 處，大多是文字，換成會跟著深淺色變的顏色沒問題。真正的風險是漏掉「深底白字」的地方，深色時會變成淺底白字。改完要 grep `background(Color.ink` 和 `fill(Color.ink` 逐一確認。

**模擬器驗證**：深色模式開同一間店（t35 那間漢堡店），截圖確認店名、分店、類型地區、「去過」、地址、必點標題都讀得到。訊息條還是深底白字。淺色模式截圖跟 t15 一樣。

### 反方補充（調查員漏掉的）
- ListTab.swift:138 和 GroupsTab.swift:52：`.onChange(of: path.count)` 在 body 裡讀了 @State path，每次推頁和返回，ListTab 整個 body 都會重算（ListTab.swift:19-23 的 store.shown、store.brands 會掃全部的店）。接著 store.depth 變，Store.swift:67 barHidden 跟著變，Root 再重算一次。從收藏頁進店家頁的 118ms（t35）很可能有一部分是這個造成的。
- PlaceDetail.swift 沒有 `Perf.shared.count(...)`（Perf.swift:52-56 有這個功能），HUD 看不到店家頁和收藏頁推頁時重算了幾次，所以 G7d 的根因只能用猜的。應該先加上計數再改。
- Theme.swift:155-158 CircleIcon 底色寫死 `.white`，深色模式時店家頁的「<」和「⋯」是兩個亮白方塊（t35）。G7e 把 Color.ink 改成會跟著深淺色變的顏色以後，這兩顆會變成白底配奶油色圖示，看不見。
- TripMode.swift:75-76：在收藏頁或群組頁推出來的店家頁點訊息條「打開行程」，只會清 mapPath、切到 tab 0，收藏頁的 path 還留著店家頁（depth[1] 還是 1）。之後切回收藏頁，畫面還停在那間店家頁，分頁列也還是藏著。G7a 的 bottomBar 在這條路上也不會歸 0。
- Reel.swift:137 maybeVideo 把 IG 的 /p/ 貼文也當成可能是影片。t15、t35 這種「看貼文」的店，推頁時也會走 ReelCache.url 和 waitReady 的輪詢，分析進店家頁的 ms 數時要把這條路算進去。
- Perf.swift:149 PerfHUD 疊在訊息條上面（Root 的 overlay 順序在後），面板在最低段時會蓋住訊息條的左半邊（t04）。驗收「訊息條有沒有消失」時容易誤判。
- G7c 修法：top 搬到 safeAreaInset 以後，少了 VStack 的 14pt 間距（PlaceDetail.swift:28），照片會比 t15 往上移 8pt。inset 的下方 padding 要用 14。

---

## G8 圖釘：長按 384ms、點圖釘 47–153ms、沒選中卻其他圖釘變淡

### G8a（P3，反方確認）長按圖釘 384ms 是量法造成的：手指還按著時，Perf 從「上一次放開」開始算

**證據**
- t04 的 PerfHUD（最新的在最上面）依序是：加進行程 69ms 按住 2 → 長按圖釘 384ms → 加進行程 54ms 按住 1 → 長按圖釘 16ms → 長按圖釘 31ms。384 那次的前一個動作是點選單的「加進行程」，兩次之間不到 1 秒
- t03、t14：另外兩次長按是 16ms 和 31ms（它們前 1 秒內沒有放開過手指）
- MapTab.swift:1443-1447：LongPressGesture(minimumDuration: 0.35).onEnded 在長按成立的當下（手指還按著）呼叫 Perf.shared.mark("長按圖釘")，同一個 callback 裡就設 pins.menu，所以選單是長按成立那一幀開始彈
- Perf.swift:85：from = touchUp > 0 && p.at - touchUp < 1 ? touchUp : p.at，沒檢查手指是不是還按著。所以 touchUp 是上一次點擊的放開時間，不是這次的
- Perf.swift:87：只有 touchUp > touchDown 才顯示「按住 N」。384 那行沒有「按住」，表示 mark 當下手指還按著（touchDown 比 touchUp 晚），跟上面的推論對得起來
- Perf.swift:36-39：touched() 只記最後一次按下和放開的時間

**根因**：Perf.tick 決定從哪裡開始計時，只看「上次放開是否在 1 秒內」。長按的 mark 是在手指還按著時打的，所以抓到的是上一次點擊（選單的「加進行程」）的放開時間。算出來的 384ms ≈ 兩次點擊的間隔 + 0.35 秒按住時間 + 1 幀。選單本身是長按成立那一幀就開始動畫，另外兩次的 16ms、31ms 才是真實數字。

**最後修法**：
照原修法改 Perf.swift 的 tick(_:) 第 85 行（held 在 tick 裡算，不要搬到 mark()）。另外在 Perf.swift:125 的 TouchClock.touchesCancelled 補記一次放開：
```swift
override func touchesCancelled(_ t: Set<UITouch>, with e: UIEvent) {
    MainActor.assumeIsolated { Perf.shared.touched(false) }
    state = .failed
}
```

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

Perf.swift 的 tick(_:)，第 85 行改成：手指還按著時一律從 mark 當下算。
```swift
let held = touchDown > touchUp   // mark 當下手指還按著（長按成立、拖曳中）：從 mark 算
let from = !held && touchUp > 0 && p.at - touchUp < 1 ? touchUp : p.at
```
第 87 行的 press 字串不用動（它本來就要求 touchUp > touchDown）。只改這一行，不碰 MapTab。

</details>

**反方意見**：行號和推論都對。MapTab.swift:1443-1447 的 LongPressGesture(minimumDuration: 0.35).onEnded 是在長按成立、手指還按著的時候觸發，同一個 callback 裡就打 Perf.mark 並設 pins.menu。Perf.swift:85 的起算點只看「上次放開是不是在 1 秒內」，沒有管手指現在是不是還按著。t04 的 HUD 順序是：長按 31 → 長按 16 → 加進行程 54（按住 1）→ 長按 384 → 加進行程 69（按住 2）。按住 1–2ms 表示這是自動化腳本在點，選單的「加進行程」放開後約 30ms 就開始下一次長按，這樣 384 ≈ 間隔約 30 + 按住 350 + 1 幀，數字對得上。384 那行沒有「按住」，也符合 Perf.swift:87 的條件（mark 當下 touchDown 比 touchUp 晚）。修法要在 tick 裡判斷 held，不要在 mark() 裡記：SwiftUI Button 的 action 可能比視窗上 TouchClock 的 touchesEnded 更早跑，在 mark 當下判斷會把一般點擊誤判成還按著；到下一幀的 tick 時 touchUp 已經記好，判斷才準。補一個小漏洞：TouchClock.touchesCancelled（Perf.swift:125）沒有記放開時間，手指被系統取消時 touchDown 會一直比 touchUp 新，所以 held 會一直是 true，直到下一次正常放開。這段期間所有 mark 都會從 mark 當下算，數字偏小。

**風險**：其他在手指按著時打的 mark（例如 TripPanel.swift:490「拿起一站」）也會改成從 mark 算。這樣量才對，但數字會比 build 22 小，跟舊數據比較時要註明。

**模擬器驗證**：先點一下任何按鈕，1 秒內立刻長按一根圖釘：PerfHUD 的「長按圖釘」應該在 33ms 以內，而且沒有「按住」字樣。再錄影確認選單在按下約 0.35 秒時開始彈出。

### G8b（P1，反方要求修改）點泡泡放大後，MapKit 把泡泡當成「選中」，所有單顆圖釘變成半透明，卻沒有任何選中的圖釘或卡片

**證據**
- t01（8:12）：台灣全景，有 19/42/7/16 幾顆泡泡，PerfHUD 寫「點點看」（還沒有任何 mark），單顆圖釘是實的
- t14（8:14）：已經放大到台北，PerfHUD 只有一行「長按圖釘 31 ms」。也就是說，放大到台北的那個動作沒留下 mark：zoom()（MapTab.swift:667）本來就不打 Perf mark。這時所有單顆圖釘（大同、中山、內湖、新店一帶）已經是半透明，泡泡是實的，沒有店名小牌子，面板顯示「這一帶 21 間」
- t14 已經變淡，那時還沒按過「加進行程」（t03 的 HUD 順序是：長按 31 → 長按 16 → 加進行程 54）。所以不是加進行程造成的；t03、t04 只是同一個狀態一直留著
- MapTab.swift:80：Map(selection: Binding(get: { pins.sel }, set: { pins.select($0) }))，setter 收到什麼 id 都照收
- MapTab.swift:92-97：ForEach(clusters) 的泡泡 Annotation 沒有 .tag。PinCluster 是 Identifiable，id 是 String（MapTab.swift:629 用逗號串起各店 id，MapTab.swift:1746），型別剛好跟 selection 的 String? 一樣，ForEach 可能自動拿 id 當 tag，所以泡泡變成可以被 MapKit 選取
- MapTab.swift:514：picked() 裡 guard let p = list.first(where: { $0.id == id }) else { return }。泡泡的 id 不在 list 裡，所以直接 return：不打「點圖釘」mark、不開大卡、也不清掉 sel。這跟 HUD 沒有「點圖釘」那一行對得起來
- MapTab.swift:1433：faded = pins.sel != nil && !on && !hopping，所以 sel 只要不是 nil，所有單顆圖釘都會 opacity 0.5（MapTab.swift:1473）
- MapTab.swift:879：NearbySheet 的 picked 在 list 裡找不到 sel，就顯示附近清單，不顯示大卡
- MapTab.swift:1756-1790：ClusterBubble 不讀 sel，所以泡泡保持實心
- 排除掉的路線：長按不會改 sel（MapTab.swift:1438-1448 只設 longFired 和 menu）；pinAct(.add)（MapTab.swift:441-460）和 TripStore.addPlace（Trip.swift:571-580）都不碰 sel；離開行程時 cand 變 nil，MapTab.swift:202-205 會呼叫 pins.select(nil)，所以也不是行程殘留

**根因**：Map(selection:) 的 setter（MapTab.swift:80）什麼都收。泡泡、行程站號、淡出中的 GonePin 這幾個 ForEach 沒有明確 tag，MapKit 很可能拿它們的 id 當 tag。點泡泡時 Button 會放大地圖，等雙擊判斷失敗後，MapKit 又把 pins.sel 設成泡泡 id（例如「a,b」）。picked() 在 list 裡找不到就 return（:514），所以所有 FoodPin 都 faded（:1433、:1473），面板顯示附近清單（:879）。放大後 recluster 把那顆泡泡拿掉，MapKit 內部已經沒有選中的標註，一般地圖點空白處也不會送 nil（:151、:582），結果就卡在這個狀態。

**最後修法**：
先驗證：在 MapTab.swift:80 的 setter 裡暫時加 `Perf.shared.mark("選取 \(id ?? "nil")")`，從台灣全景點泡泡 42，看 HUD 有沒有出現帶逗號的 id。確認之後只改 MapTab.swift 兩處：
1) 第 80 行 setter 不收泡泡和站號（用逗號判斷，不受 recluster 時間影響）：
```swift
Map(position: $pos, selection: Binding(get: { pins.sel }, set: { id in
    // 泡泡的 id 是幾間店 id 用逗號串起來；行程站號是站的 id：都不是圖釘，不收
    if let id, id.contains(",") || trip.marks.contains(where: { $0.id == id }) { return }
    pins.select(id)
})) {
```
2) picked() 第 514 行照調查員的寫法保留 fallback（找不到就 pins.select(nil)，用 currentList）。它同時處理 GonePin 被選到和其他沒想到的 id，而且 cleared+1 會讓 MapTab 重畫，Map 會放掉 MapKit 內部的選取。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

範圍小，只改 MapTab.swift 兩個地方：
1) 第 80 行 Map 的 selection setter，只收真的圖釘和搜到的地點，泡泡、行程號碼的 id 一律不收：
```swift
Map(position: $pos, selection: Binding(get: { pins.sel }, set: { id in
    // 泡泡、行程號碼也會被 MapKit 當成可選（ForEach 自帶 id 當 tag）：不收
    if let id, clusters.contains(where: { $0.id == id }) || trip.marks.contains(where: { $0.id == id }) { return }
    pins.select(id)
})) {
```
（clusters 是 @State、trip 是 TripMode.shared，在 setter 裡讀不會讓 MapTab 多重算。）
2) 保險：picked()（第 514 行）找不到那間店時，一般地圖要把 sel 清掉，不要停在變淡狀態。用現算的 currentList，不要用捕捉到的 list：
```swift
guard let id, let p = list.first(where: { $0.id == id }) else {
    if let id, !currentList.contains(where: { $0.id == id }) { pins.select(nil) }
    return
}
```
（trip.on 的情況在上面已經先 return，碰不到這裡。）

</details>

**反方意見**：t14 時已經變淡，那時還沒按過加進行程，所以「不是加進行程造成的」這個推論成立。原始回報「從卡片加進行程之後才變淡」是看錯先後。我放大 t14 看過：所有單顆圖釘都是原尺寸、半透明（包括粉紅蛋糕那根），沒有縮到 0.65 倍，所以是 faded=0.5，不是行程模式的 dim。HUD 裡也沒有「點圖釘」，表示 sel 是一個不在 list 裡的 id，picked() 在 MapTab.swift:514 直接 return。可能的來源只有幾種：沒加 tag 的 ForEach 被 MapKit 拿 id 當 tag。泡泡（MapTab.swift:92）和行程站號（:115）是這種，還有調查員漏掉的 ForEach(gone)（:88，id 是被篩掉的店）。旁證：MapTab.swift:581 blankTap 的註解寫「圖釘的點擊可能晚一點才到」，PinState.cleared 的註解（:1286）也說要讓 MapTab 重畫，地圖才會放掉那根。這兩處都表示 MapKit 自己的選取會在 Button 之外另外送進 setter。不過「ForEach 會自動當 tag」還沒在實機證實，修之前應該先量。

修法 1 要改：用 clusters.contains 判斷會受時間影響。MapKit 的選取要等雙擊判斷失敗才送來，這時 recluster 的合併動畫可能已經把 clusters 換掉（:657-661），泡泡 id 就會漏過去。PinCluster.id 一定是 ≥2 個店 id 用逗號串起來的（:612、:629），直接看有沒有逗號比較穩，也不用讀 @State。修法 2 的 fallback 要保留，而且它更重要：select(nil) 會讓 cleared+1，MapTab 會重畫，Map 會跟著放掉 MapKit 內部的選取，連 GonePin 那條路也一起修好。調查員漏了一點：一般地圖不收空白處點擊（:151 只有 trip.on 才 .all，blankTap 在 :582 也直接 return），而被選中的泡泡在放大後 recluster 時就被拿掉了，MapKit 手上已經沒有選中的東西，點空白處不會送 nil。所以這個狀態其實要點一根圖釘再按 ✕ 才出得來，比他寫的「點空白處就恢復」嚴重。

**風險**：setter 擋掉之後，MapKit 內部可能還記得「泡泡被選中」，但 pins.sel 不變，畫面不受影響；點空白處時 MapKit 會送 nil，select(nil) 的 guard 會直接略過。第 2 點的 select(nil) 會讓 cleared 加 1、MapTab 多重畫一次，不過只在這種異常狀態才發生。行程模式點號碼也可能有同樣的問題（sel 變成站的 id，其他圖釘從 0.6 再淡到 0.5），修法 1 一起擋掉了。

**模擬器驗證**：修之前先重現：從台灣全景點一顆泡泡（例如 42）放大，看單顆圖釘是不是全部變半透明、面板是不是附近清單。修之後重做一次：單顆圖釘要維持不透明；接著點一根圖釘，要出現店名小牌子和大卡，其他圖釘變淡；點地圖空白處要全部恢復。行程模式點地圖上的站號，其他圖釘只能是 dim（0.6），不能再更淡。

### G8c（P2，反方要求修改）點圖釘 47–153ms：放開那一刻所有圖釘一起重算，遠的店還會讓整張 MapTab 重算

**證據**
- Perf.swift:85：「點圖釘」是從手指放開算到 mark 後第一幀；mark 打在 picked() 裡（MapTab.swift:515），picked 要等 sel 改變、SwiftUI 跑完一輪更新、SelWatcher 的 onChange（MapTab.swift:1374）才會被呼叫
- MapTab.swift:1385-1394：PinPress 在手指一碰到時（isPressed）就壓扁加輕震，所以「按下那幀就動」已經做到。量到的 47–153ms 是放開到選中彈起，壓扁不算在裡面
- MapTab.swift:1430、1433：每根 FoodPin 的 body 都讀 pins.sel（算 on 和 faded），選一根時畫面上所有 FoodPin（每根都是 MapKit 各自託管的 SwiftUI 視圖）都要重跑 body
- MapTab.swift:518-535：picked() 在同一輪裡還做了 MapPanel.go(.mid)、NearbySheet 換成 PickedCard（照片、DrawHistory）、PinBurst 光圈、移鏡頭
- MapTab.swift:534 加上 MapTab.swift:171：店離畫面中心超過範圍的 60% 時改 flight（@State，body 裡的 mapCameraKeyframeAnimator(trigger: flight) 有讀），整個 MapTab body（篩選、所有 Annotation 的 ForEach）都要重算；近的店只改 pos（MapTab.swift:535，綁定不會讓 body 重算）

**根因**：這是推測，還沒量。放開手指那一幀要做的事有：sel 改變後，看得到的 FoodPin 重跑 body（數量不多）；NearbySheet 換成 PickedCard 並用 spring 改 midH；從最低段點的話還要升面板；footY 改變，MapTab 重算、地圖下邊距重排（G8d）；遠的店還會因為 flight 讓 MapTab 再重算一次。47 和 153 的差別，最可能是有沒有碰到 footY 重排和 flight，照片預載不是原因。

**最後修法**：
1) 先不改程式，用現有的 HUD 量：PerfHUD 的「重畫 地圖 N・附近面板 M」。分別點近的店和遠的店、面板在中間段和最低段時各點 5 次，記下「點圖釘 X ms」和「地圖」有沒有 +1。
2) 先做 G8d（setFoot 選中時不更新），再量一次。這一項範圍最小，最可能直接把 153 那種情況壓下來。
3) 如果遠的店還是明顯比較慢，再討論 picked() 第 534 行要不要拿掉 flight（這是體驗上的取捨，要先問）。
4) 不要做原修法 3（延後照片預載），它沒有效果。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

先量再改，免得大改編譯失敗：
1) 在 MapTab.swift 的 FoodPin.body 開頭（第 1430 行前）暫時加一行 `let _ = Perf.shared.count("圖釘")`，PerfHUD 的「重畫」那行就會顯示每點一次有幾根圖釘、地圖重算了幾次。
2) 如果「地圖」只有遠的店才 +1，而且那次特別慢：picked() 第 534 行遠的店改走跟近的店一樣的 `withAnimation(.smooth(duration: 0.8)) { pos = .region(...) }`，先不用 flight 的拉遠再降落，看數字會不會降。
3) 如果「圖釘 N」很大而且是主要成本：把第 520-521 行的照片和影片預載往後延，改成 `Task { try? await Task.sleep(for: .milliseconds(120)); ... }`，不要搶選中那一幀。真正要讓圖釘不全部重算，得把 PinState 改成每根圖釘有自己的 on 旗標，範圍比較大，等數字證實再做。

</details>

**反方意見**：量法說明對：PinPress（MapTab.swift:1385-1394）是按下就壓扁，量到的是放開到選中那一幀。flight 是 @State，而且 body 有讀（:171），遠的店會讓整張 MapTab 重算，這點也對。不過有三處要改：(a) 修法 3 沒有用。PhotoLoader 是 actor（Photo.swift:5），load 本來就在背景跑，解碼也用 byPreparingThumbnail；ReelCache.warm（Reel.swift:164-172）比較重的部分也包在 Task 裡，沒有搶到選中那一幀。延 120ms 只會讓大卡照片比較晚出來。(b)「畫面上所有 FoodPin 都要重跑 body」講得太重。MapKit 只替看得到、而且沒被併進泡泡的標註建 SwiftUI 視圖，t14 的台北畫面只有 6 根左右單顆圖釘，FoodPin 的 body 很可能不是主要成本。(c) 漏了同一幀裡更貴的東西：G8d 的 footY 變化（MapTab 重算加上地圖 safe area 重排），還有從最低段點圖釘時 MapPanel.go(.mid)（:518）加上 NearbySheet 換成 PickedCard（PhotoView、DrawHistory、candy）。另外，MapTab.swift:58 的「地圖」和 :877 的「附近面板」計數本來就有，不用新加計數也能分辨。

**風險**：第 2 點會讓遠的店少了「先拉遠再降落」的動畫，屬於體驗上的取捨，要先問過再做。Perf.count 的測量行做完要拿掉（它只在 Perf.on 時記錄，不拿掉也不影響正式版效能）。

**模擬器驗證**：PerfHUD 開著：分別點一根靠近畫面中心的圖釘和一根很遠的圖釘（例如從台北點台中），各點 5 次，記下「點圖釘 X ms」和「重畫 地圖 N・圖釘 M」。改完同樣做一次，近的店要穩定在 33ms 左右，遠的店不能超過 50ms。

### G8d（P2，反方確認）選中／關掉圖釘時，面板高度變了，連帶改到地圖下邊距，觸發整張地圖重排

**證據**
- MapTab.swift:149：Map 的 .safeAreaPadding(.bottom, footY > 0 ? max(0, mapRect.maxY - footY) : 0)，footY 是 MapTab 的 @State
- MapTab.swift:539-543：setFoot 只檢查 stage == .mid、沒在拖、而且差超過 0.5，就設 footY = y（MapTab 重算 + 地圖下邊距改變）
- MapTab.swift:889-895：中間段的內容高度變了就用 spring 改 midH；MapTab.swift:913-917 的 onGeometryChange 接著呼叫 report()（MapTab.swift:1096-1100），再呼叫 foot(probe.foot)，也就是 setFoot
- 中間段有兩種高度：卡片列是標題那行 + 10 + 112pt（MapTab.swift:991）；PickedCard 有 DrawHistory、上面一行 44pt、120pt 照片加 10pt 內距、底部 6pt（MapTab.swift:1203-1258），兩者不一樣高
- 專案規則：改 Map 的 safe area 會觸發約 0.5 秒的重排

**根因**：setFoot 原本的用意是「中間段停好才量一次」，但中間段其實有兩種高度：附近卡片列和選中大卡。每次點圖釘（卡片列換成大卡）或按 ✕ 關大卡（換回卡片列），面板上緣就會移動，footY 跟著變，MapTab 整個重算，地圖下邊距也改了，等於每次選中、取消都付一次很貴的重排，而且就落在選中動畫的那幾幀。

**最後修法**：
照原修法：MapTab.swift:540 的 guard 加上 `pins.sel == nil`。另外補一個要在模擬器確認的情況：App 一打開面板就在最低段、footY 還是 0（從來沒在中間段停過）時就點圖釘，這時選中期間地圖不會留下邊距，被選的圖釘置中在整個螢幕。要確認它沒有被大卡蓋住，特別是 375×667 的小螢幕。

<details><summary>調查員原修法（已被反方更正，僅供參考）</summary>

只改 MapTab.swift 的 setFoot（第 539 行），選中圖釘時不更新地圖下邊距，讓它一直用卡片列的高度：
```swift
private func setFoot(_ y: CGFloat) {
    guard !trip.on, pins.sel == nil, MapPanel.shared.stage == .mid, !MapPanel.shared.dragging, abs(y - footY) > 0.5 else { return }
    ...
}
```
（setFoot 是在 onGeometryChange 的 action 裡呼叫，不在 body 裡，讀 pins.sel 不會讓 MapTab 多一個依賴。關掉大卡時 sel 已經是 nil，量到的是卡片列高度，跟原本的 footY 一樣，所以也不會變。）

</details>

**反方意見**：我照路徑走過一遍，都成立。NearbySheet 的 mid 高度變了，會在 :889-895 改 midH，LiftHeight 的 frame 跟著變。上緣那排的 onGeometryChange 接著更新 probe.foot（:932），report() 再呼叫 setFoot（:1096-1099、:314）。setFoot 只檢查 stage 和 dragging（:540），所以 footY 會跟著換，Map 的 safeAreaPadding 也跟著改（:149）。我算過兩種高度：卡片列是 44+10+112=166pt；PickedCard 是 44+8+(120+20)+6=198pt，有 DrawHistory 時再多約 52pt。所以每次選中或關掉，footY 會差 32 到 84pt。LiftHeight 不是 Animatable，onGeometryChange 只會拿到最後的值，所以是每次選中重排一次，不是每一幀都重排。setFoot 在 action 裡讀 pins.sel，不會讓 MapTab 多一個依賴。

**風險**：選中時大卡比卡片列高，地圖鏡頭仍然以「卡片列上緣」當下緣來置中，被選的圖釘會比可見區域的正中間稍微偏下（約差兩種高度差的一半），應該還看得到，要在模擬器確認沒被大卡蓋住。在 G8b 修好之前，如果 sel 卡在泡泡 id，footY 也會暫時不更新。

**模擬器驗證**：PerfHUD 開著：在中間段點一根圖釘，再按大卡的 ✕，重複 5 次。改前改後各看一次「掉幀（2 秒內）」和「重畫 地圖 N」，改後選中、關掉都不應該讓「地圖」+1，掉幀要變少。另外截圖確認選中的圖釘和店名小牌子沒有被大卡蓋住。

### 反方補充（調查員漏掉的）
- Perf.swift:125 TouchClock.touchesCancelled 沒有記放開時間：套用 G8a 的修法後，手指被系統取消時 held 會一直是 true，直到下一次正常放開；這段期間的 mark 都會從 mark 當下算，數字偏小。要補 Perf.shared.touched(false)。
- MapTab.swift:88 ForEach(gone) 的 GonePin 也沒有明確 tag，id 是剛被篩掉的店。在那 0.3 秒內點到它，同樣會讓 sel 停在一個不在 list 裡的店（MapTab.swift:514 直接 return），全部圖釘變淡。G8b 的 fallback 修法 2 才擋得住，修法 1 擋不到。
- MapTab.swift:151、MapTab.swift:582：一般地圖不收空白處點擊，blankTap 只在行程模式做事。被 MapKit 選中的泡泡在 recluster（MapTab.swift:657-661）被拿掉以後，點空白處不會送 nil，「全部變淡」的狀態只能點一根圖釘再按 ✕ 才解得開。調查員寫的「點空白處就恢復」不成立，這也是 G8b 應該維持 P1 的理由。
- MapTab.swift:629、MapTab.swift:612：PinCluster.id 一定是 ≥2 個店 id 用逗號串起來的。setter 用逗號判斷比 clusters.contains 穩，因為 MapKit 的選取要等雙擊判斷失敗才送來，這時合併動畫可能已經換掉 clusters（MapTab.swift:657）。
- Photo.swift:5 的 PhotoLoader 是 actor，預載本來就在背景跑，所以 G8c 的修法 3（延後照片預載 120ms）沒有效果，只會讓大卡照片比較晚出來。
- MapTab.swift:1203：PickedCard 在有抽籤紀錄時多一排 DrawHistory（Draw.swift:212-236，約 52pt），抽一間之後選中和取消的高度差最大，G8d 的重排在這個情況最明顯。驗收要包含「抽一間之後點 ✕」。

---

## G9 完整性審查（其他截圖問題）

### G9c（P1，未驗證）地圖泡泡互相疊在一起，數字被蓋住

**證據**
- t14.png／t03.png：台北「2」疊在另一顆「2」上，「5」「2」「6」三顆斜著疊成一串
- t01.png：全台縮放時新竹一帶「19」和「42」兩顆邊緣重疊
- MapTab.swift:601 格子大小約 44pt，格子固定在地圖座標上
- MapTab.swift:610-612 只按格子分組（同一格 ≥2 根就成一顆），沒有檢查隔壁格子的泡泡在螢幕上有多近
- MapTab.swift:628 泡泡放在組員的平均座標，隔壁兩格的平均點可能只差幾 pt
- MapTab.swift:1779-1786 泡泡最小 46×46，比格子還大

**根因**：分組用固定的地圖格子。同一群店剛好落在格子邊界兩側時，會變成兩顆泡泡，各放在自己組員的平均位置，兩顆很近。泡泡又比格子大（46pt 對 44pt），所以一定會疊在一起。

**最後修法**：
只改 MapTab.swift 的 recluster(_:)：把 612 行的 `let groups = cells.values.filter { $0.count >= 2 }` 換成先分組、再把螢幕上太近的合成一顆：
```swift
var gs = cells.values.filter { $0.count >= 2 }
// 格子邊界兩側各成一顆、在螢幕上疊在一起：合成一顆
func ctr(_ g: [Place]) -> CGPoint? {
    let ps = g.compactMap { pts[$0.id] }
    guard !ps.isEmpty else { return nil }
    return CGPoint(x: ps.map(\.x).reduce(0, +) / CGFloat(ps.count), y: ps.map(\.y).reduce(0, +) / CGFloat(ps.count))
}
var i = 0
while i < gs.count {
    var hit = false
    var j = i + 1
    while j < gs.count {
        if let a = ctr(gs[i]), let b = ctr(gs[j]), hypot(a.x - b.x, a.y - b.y) < 46 {
            gs[i] += gs[j]; gs.remove(at: j); hit = true
        } else { j += 1 }
    }
    if !hit { i += 1 }
}
let groups = gs
```
`pts` 在上面 607 行已經算好了，後面的 next／nextHidden／動畫都不用改。平移時兩點在螢幕上的距離不變，所以不會一直重組；recluster 只在鏡頭停下來時跑。

**風險**：泡泡變少、每顆的數字變大；縮放時合併的時機會在兩倍縮放之間多變一次。單獨一根圖釘貼著泡泡的情況這裡沒處理（可以之後把 30pt 內的單根也併進去）。

**模擬器驗證**：跟 t14 一樣看台北（大安、信義那一帶），還有 t01 全台縮放，截圖確認泡泡之間沒有重疊、每顆數字都完整；左右拖地圖停下來，泡泡不會重新合併或跳動；點一顆泡泡，放大後框住的店數等於泡泡上的數字。

### G9a（P2，未驗證）附近面板的小字「打開定位就會從你的位置排」永遠被截斷成「打開定位就會…」

**證據**
- t01.png、t03.png、t14.png、02_pulldown_strip.png 五格：標題後面都是「打開定位就會…」
- MapTab.swift:833 subtitle = "打開定位就會從你的位置排"（12 個字）
- MapTab.swift:1046-1049 標題 layoutPriority(1)，小字 lineLimit(1)，右邊還有 DiceChip（約 150pt）和齒輪，剩不到 6 個字的寬度
- 群組模式下標題還會多「群組名 · 」，小字更容易只剩「…」

**根因**：沒開定位時的提示句太長。這一行要同時放「這一帶 85 間」、提示句、🎲 抽一間和齒輪，提示句只剩約 5、6 個字的位置，所以每次都被截斷，使用者看不到完整的提示。

**最後修法**：
MapTab.swift：
1) struct Nearby（約 806 行）加一個欄位 `var short = ""`；在 833 行旁邊設定 `short = here != nil ? "由近到遠" : "從地圖中心排"`。
2) titleRow（1049 行）把 `Text(near.subtitle)...lineLimit(1)` 換成：
```swift
ViewThatFits(in: .horizontal) {
    Text(near.subtitle).lineLimit(1)
    Text(near.short).lineLimit(1)
    Color.clear.frame(width: 1, height: 1)
}
.font(.footnote.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.45))
```
放得下整句就顯示整句，放不下就換短句，連短句都放不下（群組名很長）就不顯示，不會出現「…」。

**風險**：ViewThatFits 會量好幾次，但只在這一行、標題變的時候才量，不影響拉面板（拉的時候只有 LiftHeight 那層重畫）。

**模擬器驗證**：關掉定位，看首頁中段、最低段、最高段標題那行：要嘛整句，要嘛「從地圖中心排」，不能有「…」。打開定位後要顯示「附近 N 間 由近到遠」。切成群組模式再看一次。

### G9b（P2，未驗證）行程🔍搜尋框的提示字被截斷，右邊的 ✕ 淡到幾乎看不到

**證據**
- t12.png：搜尋框顯示「搜尋景點、收藏，或直接點地圖…」，右邊的 ✕ 是很淡的橘色圓
- TripTop.swift:262 提示字 "搜尋景點、收藏，或直接點地圖上的店"（17 個字，17pt 的輸入框約只放得下 15、16 個字）
- TripTop.swift:276 ✕ 用 .foregroundStyle(.tertiary)，按鈕裡會吃到 App 的 tint（橘色），變成淺橘色、對比很低；它其實是「關掉搜尋」不是「清除文字」

**根因**：提示句比輸入框寬，被截掉了。✕ 用了 .tertiary 加上橘色 tint，在白底上幾乎看不見，看起來也像清除文字的鈕，不像關掉搜尋。

**最後修法**：
TripTop.swift 的 TripFind.field：
1) 262 行提示字改成 `"搜尋景點、收藏"`（「點地圖上的店」這件事 TripResults 空白時已經寫在 357 行的「打字搜尋，或選上面的分類」附近，可以把那句改成「打字搜尋、選分類，或直接點地圖上的店」）。
2) 276 行 `.foregroundStyle(.tertiary)` 改成 `.foregroundStyle(Color.ink.opacity(0.35))`。

**風險**：只改字和顏色，沒有風險。

**模擬器驗證**：進行程模式按🔍，截圖：提示字完整沒有「…」，✕ 是看得清楚的灰色；按 ✕ 會收起搜尋、面板回到中段。

### G9d（P2，未驗證）行程模式下自己的藍點蓋住站號；同一區好幾站疊成一顆，看不出是第幾站

**證據**
- t34.png：台北有第 3、4、5 站（粉紅、紫、藍圈）疊在一起，最上面那顆的號碼被藍點和光圈蓋住，三站號碼都看不到
- MapTab.swift:209-210 MyDotLayer 是疊在整張 Map 上面的一層（註解：故意畫在標註上面）
- MapTab.swift:1863-1870 MyDotView 是 16pt 藍點加 44pt 光圈，剛好比站號（40pt，TripPanel.swift:1303-1307）還大
- MapTab.swift:120-127 站號是一般 Annotation，ForEach 後面的會畫在前面的上面

**根因**：藍點為了不被南邊的圖釘蓋住，畫在地圖上方獨立的一層，所以行程模式下也蓋在站號上。站號在同一區、地圖拉遠時沒有錯開，只看得到最後一站。

**最後修法**：
1) MapTab.swift:210 改成 `MyDotLayer(dot: dot).opacity(trip.on && !trip.going ? 0.35 : 1)`，排行程時把藍點調淡（出發中照常）。也可以直接用 0 藏起來，因為面板最上面已經有「從目前位置出發」。
2)（可以之後再做）MapTab.swift:120 的 `ForEach(trip.marks)` 改成 `ForEach(trip.marks.reversed())`，這樣疊在一起時號碼小的畫在最上面，至少看得到這一區第一站是幾號。

**風險**：reversed() 只改畫的順序，點站號照常；藍點調淡後出發前比較難找到自己的位置，所以只在 trip.on && !trip.going 時調淡。

**模擬器驗證**：開深色或淺色都可以：建一個有 3 站在台北、2 站在嘉義的行程，拉到全台，截圖確認看得到站號（至少是最小的那號），而且藍點沒有蓋住；按「出發」後藍點恢復正常。

### G9e（P2，未驗證）新增視窗沒輸入東西時，「AI 找店家並收藏」看起來可以按，按了卻沒反應

**證據**
- t32.png：輸入框是空的，下面的大按鈕還是飽和的橘色漸層
- Edit.swift:47-56 按鈕用 PressStyle，背景寫死成 Color.grad、白字，56 行 .disabled(...) 只是讓它按不了，畫面沒有任何變化

**根因**：自己畫背景的按鈕在 disabled 時不會自動變淡（PressStyle 沒有讀 isEnabled），所以按了沒反應，看起來像壞掉。

**最後修法**：
Edit.swift 的 AddSheet.body：在 47 行 Button(action: go) 前面加 `let empty = input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty`，56 行 `.disabled(...)` 後面加 `.opacity(empty && !busy ? 0.45 : 1)`，並把 .disabled 改成用 `busy || empty`。

**風險**：沒有風險。

**模擬器驗證**：打開新增視窗：按鈕是淡的；打一個字或按「貼上」後立刻變成飽和橘色；清空又變淡。

### G9f（P2，未驗證）行程面板降到最低段後，地圖把第 2 站框到 🔍 底下

**證據**
- t11.png（放大看上方）：第 2 站圓圈頂到🔍白方塊下緣、被蓋住一點；中段（t05.png）同一個行程，第 2 站剛好在預計的位置（約 195pt）
- TripPanel.swift:846-871 fitCoords：最北那站應該放在 winTop＋64（約 195pt），實際約 141pt，差了約 55pt
- TripPanel.swift:875-899 afterFit 停好後會量一次、偏了就修，但最低段這次看起來沒有修
- MapTab.swift:164 鏡頭一停就呼叫 afterFit 並清掉，不管停下來的是不是這次要框的鏡頭

**根因**：還不確定。有兩個可能：(a) 跟 G5c 一樣，地圖實際的下邊距跟 trip.mapBottom 對不上，所以算出來的縮放比例偏大；(b) 換到最低段時前一次鏡頭動畫剛好停下，MapTab.swift:164 把 afterFit 用在舊的鏡頭上，量到的數字被 guard（rho、120pt）擋掉，這次就沒修。中段正常、最低段不正常，比較像 (b)。

**最後修法**：
先確認是哪一個，再修：
1) TripMode 加 `@ObservationIgnored var fitTarget: MKCoordinateRegion?`；TripPanel.fitCoords 設 pos 前寫 `mode.fitTarget = r`。
2) MapTab.swift:164 改成只有鏡頭真的停在目標附近才跑：
```swift
if let f = trip.afterFit, let t = trip.fitTarget,
   abs(c.region.center.latitude - t.center.latitude) < t.span.latitudeDelta * 0.25 {
    trip.afterFit = nil; f()
}
```
3) 如果改完最低段還是偏，就是 (a)，交給 G5c 一起修下邊距。

**風險**：如果條件太嚴，afterFit 可能永遠不跑（例如使用者剛好拖了地圖），但 TripPanel 裡本來就有 positionedByUser 的檢查，影響跟現在一樣。

**模擬器驗證**：用 t05 那個兩站行程（嘉義→雲林），從中段拉到最低段，等 1 秒截圖：第 2 站圓圈上緣跟🔍下緣之間至少有 20pt，第 1 站沒有被面板蓋住。最高→最低、清單下拉降段都各測一次。

### G9g（P3，未驗證）群組卡的群組名左右不齊；名字是 emoji 的成員，頭像看起來像一條斜線

**證據**
- t23.png：第一張卡 2 個頭像、群組名從約 x=152 開始；第二張 4 個頭像，群組名從約 x=225 開始
- GroupsTab.swift:143-145 頭像疊的寬度跟著人數變，沒有固定寬度
- t23.png、t24.png：藍色頭像裡是一根針形 emoji（🪡），縮在 14pt 白字裡看起來像斜線，t24 名單寫「🪡、劉嘉濬」
- GroupsTab.swift:215-216 頭像取名字第一個字，一律用 size×0.42 的白色粗體

**根因**：頭像疊沒有固定寬度，所以群組名跟著人數左右移。頭像把 emoji 當成一般文字的縮寫，用很小的字放在深色圓上，細長的 emoji 就像壞掉的圖。

**最後修法**：
1) GroupsTab.swift:143 的 `HStack(spacing: -10) {...}` 後面加 `.frame(width: 34 + 3 * 24, alignment: .leading)`（最多 4 個，每個多露 24pt）。
2) GroupsTab.swift:215 Avatar.body：
```swift
let first = name.trimmingCharacters(in: .whitespaces).first
let emoji = first?.unicodeScalars.first?.properties.isEmojiPresentation == true
Text(first.map { String($0).uppercased() } ?? "?")
    .font(.system(size: size * (emoji ? 0.6 : 0.42), weight: .bold)).foregroundStyle(.white)
    .frame(width: size, height: size)
    .background(emoji ? Color.white : Avatar.color(id), in: .circle)
    .overlay(Circle().strokeBorder(emoji ? Avatar.color(id) : Color.bg, lineWidth: 2))
```

**風險**：只有 1 個人的群組，群組名前面會多空一些；可以接受，或改成 `min(mem.count,4)` 算寬度、但這樣又會不齊。

**模擬器驗證**：群組分頁兩張卡的群組名左邊對齊；群組頁頭像那行，emoji 名字的人顯示成白底大 emoji 加彩色框。

### G9h（P3，未驗證）群組頁右上「⋯」是橘色圈圈加系統泡泡，跟同一頁的返回鍵、店家頁的「⋯」都不一樣

**證據**
- t24.png：左上返回是深色箭頭，右上是橘色「ellipsis.circle」外面又包一層系統圓泡泡（圈中圈）
- t15.png：店家頁的「⋯」是 CircleIcon（白色圓角方塊、深色字）
- GroupsTab.swift:354、GroupsTab.swift:609 label 用 Image(systemName: "ellipsis.circle")，吃到 App 的橘色 tint
- Theme.swift:152-160 BackButton 用深色 Color.ink 的箭頭

**根因**：群組頁和配對頁的工具列直接用系統的 ellipsis.circle 圖示，顏色吃 tint，形狀跟 App 自己的按鈕不同。

**最後修法**：
GroupsTab.swift:354 和 609 兩處 `label: { Image(systemName: "ellipsis.circle") }` 改成 `label: { Image(systemName: "ellipsis").font(.system(size: 17, weight: .bold)).foregroundStyle(Color.ink).frame(width: 44, height: 44).contentShape(.rect) }`，跟 BackButton 同一套。

**風險**：沒有風險。

**模擬器驗證**：進群組頁、配對結果頁，右上的「⋯」是深色、跟左上返回一樣大小；按了照樣出選單。

### G9i（P3，未驗證）收藏頁卡片的店名加分店名常被截斷（「家常飯朴老師 市民8…」）

**證據**
- t30.png：右下卡片「家常飯朴老師 市民8…」
- ListTab.swift:218-219 只有一間的店會把分店接在店名後面，同一行、lineLimit(1)
- ListTab.swift:221-222 第二行是「分類 · 地區」，地區跟分店常常重複

**根因**：兩欄卡片每張只有約 170pt 寬，店名加分店放一行常常放不下。第二行的地區跟分店的意思重疊，空間沒用好。

**最後修法**：
ListTab.swift PlaceCard.body：
1) 218 行單一分店時第一行只放 `place.name`，再加 `.minimumScaleFactor(0.85)`。
2) 221-222 行單一分店的第二行改成：有分店就放分店，沒有才放地區：`"\(place.cat.emoji) \(cuisine) · \(place.branch?.isEmpty == false ? place.branch! : place.area)"`。

**風險**：卡片少了「台北」這種地區字樣（分店名通常已經有地名）；多分店的卡片不受影響。

**模擬器驗證**：收藏頁捲一遍，店名都不出現「…」（特別長的店名可以縮小到 85%）；有分店的店，第二行看得到分店名。

### G9j（P3，未驗證）行程清單每一站店名旁邊都有「收藏」小標籤，沒有資訊又佔位置

**證據**
- t10.png、t05.png：「松山土窯羊肉 收藏」「福芳臺菜 收藏」每列都有
- TripPanel.swift:1366-1371 收藏的店一律加「收藏」膠囊，而且是 .fixedSize()，店名長的時候先被截掉的是店名
- 收藏的店本來就有照片和白卡、景點是虛線框（TripPanel.swift:1386-1393），標籤重複表達

**根因**：「收藏」標籤原本是用來跟景點、住宿區分，但卡片樣式已經分得出來，所以收藏的店每列都多一個沒用的標籤，還擠掉店名的寬度。

**最後修法**：
TripPanel.swift:1367 只有不是收藏的店才顯示標籤：把那段 `Text(stop.isPlace ? "收藏" : POI.label(stop))...fixedSize()` 包進 `if !stop.isPlace { Text(POI.label(stop))... }`，顏色固定用 TripColor.side 那組。

**風險**：如果 Anthony 想讓朋友加的店跟自己收藏的店看得出差別，這個標籤其實沒有做到（朋友加的已經有 16pt 頭像，TripPanel.swift:1374-1376）。

**模擬器驗證**：行程面板中段、最高段：收藏的店只有店名，景點、住宿還是有「景點」「住宿」小標籤；長店名能多顯示幾個字。

---

