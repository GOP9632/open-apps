# Bitemap 修正清單 第 1 輪（build 22 驗收，2026-10-29）

來源：模擬器截圖 24 張＋滑順量測兩批，每項都由多代理讀 Swift 分支 5b5355c 找根因，再由反方逐項驗證。行號以 5b5355c 為準，改之前在 HEAD 重新定位。
詳細修法（含程式碼、反方更正、模擬器驗證步驟）：
- 截圖問題 G1–G9：`reviews/bitemap-b22/shots-G1-G9.md`
- 卡頓 J1–J6：`reviews/bitemap-b22/perf-J1-J6.md`
（在分支 claude/project-thread-rvvtf4：`git fetch origin claude/project-thread-rvvtf4 && git show FETCH_HEAD:reviews/bitemap-b22/shots-G1-G9.md`）
遇到「調查員原修法」和「最後修法」不同時，照「最後修法」做。

建議照下面順序，一批一個 commit，每批都在模擬器驗過再做下一批。

## 1. 地圖底邊與鏡頭（P1，MapTab.swift＋MapPanel.swift，同一個 commit）
- G5c：MapTab.swift:208 的 onGeometryChange 接在 `.ignoresSafeArea()` 後面，量到的是 y 62…840，不是 0…874。所以上邊距少算 62、下邊距少算 34，Apple 標誌掉到 footY 下面，「附近 N 間」範圍偏北，行程框站的 rho 約 0.8，afterFit 幾乎每次都補動鏡頭。修法：把它搬到 ignoresSafeArea 前面，先 print 確認是 (0,0,402,874)。
- G5a＋G5b：footY 改成「最低段面板上緣 −10 −46」，開 App 只設一次，只取最大值（鍵盤不會改到）。這樣就不會在點圖釘、關大卡、鍵盤彈起時觸發 0.5 秒重排，也符合 HIG：標誌放在可拉卡片最低停靠位置上方 10pt。行程模式沿用同一個值。
- G5d：新增 aim()，框收藏、點圖釘、點泡泡、定位、卡片列帶鏡頭、新帳號 3 公里這幾個鏡頭動作都經過它，店才會落在看得到的那塊，不會被中段面板蓋住。
- 這批同時修掉 G8d（選中圖釘時重排）。J4、G9f 的 afterFit 補動可能也會跟著減少，做完要重量。

## 2. 清單往下拉要跟手（P1，PanelLift.swift、MapTab NearbySheet.high、TripPanel）
- G4a、G4b：用公開 API 找到清單底下的 UIScrollView，在它的 panGestureRecognizer 加 target（ListPullDown）。手指在頂端往下拉時寫 lift.y，面板 1:1 跟手；放手交給現有的 settle()／settleSheet()。反方補的幾點都要做：@MainActor、didMoveToSuperview 也要找、放手後 async 再把 bounces 改回去、detach 時呼叫 ended(0)、舊的 lowering 備案在接手時要擋掉。

## 3. 行程交通方式（P1，Trip.swift、TripMode.swift、TripPanel.swift、TripTop.swift、TripsList.swift）
- G3a：沒選過的段依直線距離自動選，1.2 公里內走路，更遠開車。TripMath.mode 的所有呼叫點都要一起改，包括 TripPanel:930、TripTop:88。goMode 不要用目前位置判斷。
- G3b：手動選的方式一律存明確值。G3d：前一站換掉時清掉那段的 mode，reorder 加 restore 參數給復原用。
- G3c：走路 90 分以上，文字改橘色並加一行小字（不加按鈕）。G3f：清單卡片和分享用實際方式，排順序、加站用 dayMode。G3g：時間超過 24:00 要寫「隔天」或「+N 天」。

## 4. 卡頓（P1，依 perf-J1-J6.md，每項先做步驟 0 量測）
- J1 行程面板從最低往上拉（現在約 30fps）：清單出現過就留著，照 NearbySheet 的 highUsed 做法，不要放手才建；gapCount 搬出 body；修 size 互相放大。
- J2 拿起一站後第一次移動停約 0.8 秒：先修 RowDrag.retarget 的門檻 bug（手指沒動也會換位），「第 N 天」那排一直掛著。
- J3 縮小放手分群 117–185ms：PinState.mergeTo 拆成每根圖釘一個小盒子（PinMerge），並補 cancel 漏清。
- J4 進行程結束 7 幀 48–65ms：先做第 1 批，再照文件改 fitCoords 的 k（把經度算進去），afterFit 修正時這次 settle 不做重工作。
- J5 加站卡往下拖開頭 80–117ms：加站卡底下的行程面板一直掛著（if/else 改成疊放＋透明度），另外擋掉 250ms 後的 focus() 連鎖。
- J6 快甩不頓，這項通過。

## 5. 圖釘與泡泡
- G8b（P1）：點泡泡放大後，所有圖釘變半透明，卻沒有選中任何一根，而且點空白處回不來。Map selection 的 setter 不收帶逗號的泡泡 id 和站號；picked() 找不到店時 select(nil)。先用 mark 證實。
- G9c（P1）：泡泡互相疊住、數字被蓋。recluster 分組後，螢幕上距離小於 46pt 的合成一顆。
- G9d（P2）：行程模式藍點蓋住站號。排行程時藍點調淡，站號倒序畫。
- G8a（量法）：「長按圖釘 384ms」不是真的慢，Perf 把 0.35 秒按住時間算進去了。Perf.tick 手指還按著時從 mark 起算，touchesCancelled 也要記放開。pending 改成陣列（G6b）。

## 6. 收藏頁與抽一間
- G6c（P1）：收藏頁的齒輪被當成篩選。標題列改用地圖同一顆「🎲 抽一間」膠囊（DiceChip）加齒輪，「86 間」移到標題下面，375pt 寬也放得下。
- G6b（P1）：面板 280ms 才開。先把 Perf pending 改成陣列分開量；確定是建 sheet 太重，再拿掉 NavigationStack，自己畫標題列（完成鈕用 PressStyle）。
- G6a（P2）：「符合 82 家」對不上「86 間」，因為分店算一家。面板底部加一行全寬小字說明。
- 收藏頁抽一間不看收藏頁的篩選（ListTab:144 base = store.mine），篩了咖啡還是從 82 家抽。建議 base 改成目前畫面上的清單（P2）。
- G6d（P3）：範圍的「全部」放第一顆。

## 7. 店家頁
- G7c（P1）：返回鍵和「⋯」在捲動內容裡，捲下去就不見。改放 safeAreaInset(top)，捲動後加底色（TopShade），bottom padding 14。
- G7d（P1）：進店家頁 118–238ms。先加 Perf.count；ListTab 和 GroupsTab 的 onChange(path.count) 搬到小 view（DepthReport）；dishesIn 搬進 DishChips；小地圖截圖延 450ms；setCategory 搬到背景；trips.load 延 400ms。
- G7b（P3）：返回後訊息條不見，是 5 秒倒數到了，沒有被誤清。加進行程的 say 改 6 秒。
- G7a（P3）：店家頁的訊息條貼在底部按鈕列上方，返回時用動畫移到面板上緣。

## 8. 剪貼簿膠囊（P1–P2，Onboard.swift、FoodMapApp.swift、GroupsTab.swift）
- G2a：不跳「允許貼上」又要分辨網域，用 Apple 公開 API 做不到，文件寫明讀內容就會通知使用者。所以保留 PasteButton，任何網址都問。連按三次 ✕ 就兩週不問，並 toast 告訴使用者。
- G2b：膠囊從頂端 104 移到面板上緣（右邊讓出 52）；最高段時改放分頁列上方。toast 在最高段也一樣不要壓到篩選籤。
- G2c：文字改成「剛複製了連結」／「想吃的店就按貼上」。
- 補充：手指碰到膠囊時 8 秒倒數暫停；✕ 改 44×44。
- G2f（P2）：群組「輸入邀請碼」直接讀 UIPasteboard.string，有網址就會跳「允許貼上」。拿掉這段，改成在 go() 裡從貼上的整段邀請文字抓 8 碼。

## 9. 小修（P2–P3）
- G9a：附近面板小字永遠截成「打開定位就會…」，改用 ViewThatFits 加短句。
- G9b：行程搜尋框提示字縮短，✕ 改成看得清楚的灰色。
- G9e：新增視窗空白時「AI 找店家並收藏」要變淡。
- G9g：群組卡頭像疊固定寬度；emoji 名字的頭像用白底大 emoji。
- G9h：群組頁「⋯」改成跟返回鍵同一套樣式。
- G9i：收藏卡店名不要接分店名，分店放第二行。
- 分享卡：還沒開通知時，「存好會通知你」改成「收到了，打開 Bitemap 就看得到」；第一次分享成功後，下次開 App 問通知（maybeAskNotify）。分享卡 1 秒自己關、不能取消是設計如此（背景上傳），不改。

## 已完成／不用改
- G1 深色模式：bc0bc20 已鎖淺色，模擬器驗過。
- G9j「收藏」小標籤：是 3cd81f9 刻意加的，不動。

## 模擬器驗收
每批做完，照詳細文件裡各項的「模擬器驗證」測，另外重跑測試清單 1–20 裡相關的項目，量 PerfHUD。第 1 批動到鏡頭，要截首頁三段、行程三段，確認 Apple 標誌在最低段面板上方，而且框收藏、點圖釘時店沒有被面板蓋住。
