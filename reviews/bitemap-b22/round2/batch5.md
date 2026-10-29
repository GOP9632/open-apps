# 第 2 輪第 5 批　P2：行程模式

每一項都對照最新程式重新確認過，判成已修好的另外有反方確認。每項開頭的「行號」寫它對的是哪一版：請用 round2/行號對照.md 換算到最新的 a10704d，或直接照修法裡引用的程式碼搜尋（以程式碼為準）。

這批 16 項：U13 選著圖釘進行程模式，那根保持放大、帶店名，像一個站、U19 VoiceOver 沒辦法切換面板段數、不能換站順序；輪播自動換頁會打斷朗讀、U20 最低段往上拉時清單不跟著出來，往下拉反而閃出清單、U21 最低段只有 20pt 細條能拉，站卡和按鈕上下推都沒反應、U22 加完一站，地圖整個跳回全天、面板升到中間，連續加站要一直重找、U23 「到了 ✓」按錯沒辦法復原，也不能跳過這站、U24 出發中上面同時有橘色「完成」和卡片上的「結束」，按錯就整個離開行程、U25 行程膠囊點了有選單，卻沒有任何「可以點」的記號、U26 「行程」直接進上次打開的行程，上個月過期的也一樣、U27 「＋ 加一天」按錯沒辦法拿掉那一天、U28 行程模式裡從店家頁「加進行程」，不會加進正在排的這一天、U29 多天行程默默加到最後一天，訊息條也沒寫哪一天、U55 行程模式點站號或點收藏加站時，整張 MapTab 跟著重算、U58 每算好一段路線，就在主執行緒重算所有收藏到路線的距離、U60 左滑刪除行程不先確認，「復原」訊息條又被 sheet 蓋住，6 秒後真的刪掉、U61 出發中拖一下地圖就沒有明顯的方法恢復跟隨，也沒有「回到我的位置」鈕

做完請把每一項的「模擬器驗收」一起交給模擬器。

## 合併注意（做這批之前先看）

下面是對照 a10704d 重新整理、再由反方檢查過的：這批裡（或跟第 1 到 5 批其他項）有兩項以上改到同一段程式、照各項寫法依序套會打架的地方，以及跟 V11、perf-round1b、perf-round1c 重疊的地方。同一組衝突只在最後做到的那批寫完整寫法，前面那批留一條短的，說先守住什麼。行號是 a10704d 的。

各項內文已經吸收了舊的合併注意。內文裡還看得到的「第 N 批合 K」「合 N」是舊編號，已經作廢，內容都併進這裡了，不用回頭找。合併做法裡寫「某項的某句改成……」的，做的時候就照改過的那句。各項內文跟這裡衝突時照這裡。

### 合1　U28、U22

**位置**：TripPanel.swift:846-850（add() 的「加到第 N 站」訊息條和復原 closure，:847 是 Perf.shared.mark("復原加站")）

**問題**：U28 搬進 TripMode.addCand 的版本是照 3fc00de 的 add() 抄的，復原 closure 裡少了 5d713ac 加的 Perf.shared.mark("復原加站")。照 U28 做完，TripPanel 的 add() 整段刪掉，這行記號就跟著不見了。5d713ac 加它，是為了在量測浮層看得出有沒有誤按到面板最上面那條訊息條的「復原」，U22 驗收 (5)「加完一站馬上按訊息條的復原」也要靠浮層看。U22 第 (1) 點改的那行升段，U28 已經自己拿掉，那部分沒問題。

**合併做法**：

U28 的 addCand 裡 store.say 那段改成下面這樣，其他照 U28：
```swift
        store.say("加到第 \(at + 1) 站", icon: .check, action: ("復原", {
            Perf.shared.mark("復原加站")
            TripStore.shared.remove(s, dropTrip: false, store: store)
            store.toast = nil
        }))
```
U22 第 (1) 點如果比 U28 先做，它改過的 add() 之後會整個被 U28 刪掉，不用另外搬。

### 合2　U23、U24、U60、U55、U28

**位置**：TripGo.swift:52-53、:59（GoCard 的「結束」）；FoodMapApp.swift:120-181（訊息條 overlay）；TripMode.swift:35、:44-45、:96；TripPanel.swift:677、:686-687（placeCand）

**問題**：照批內順序做，前面一項加的行會把後面一項「只寫行號、沒附原文」的地方推走。(1) U23 在 TripGo.swift:29、:30 後面加 TripAsked.remove（5 行）和 TripSkipped（17 行），:41 後面加 skip（1 行），GoCard 的「結束」整塊往下移 23 行；U24 寫的「TripGo.swift:52-53 換成」和「:59 的 .frame(height: 28)」沒附原文，照行號改會改到別的地方。(2) U23 在 FoodMapApp.swift:120 後面加 onGo 一行，U60 第 d 點寫「:123-181 整段換成 ToastBar」，照字面做會把 :123 的 pad 那行刪掉，又留下一個多的右括號（訊息條本體已經變成 :124-182）。(3) U23 在 TripMode.swift:35 後面加 goInset，U55 第 a 點的 :44-45、第 b 點的 :96 都往下移一行，第 b 點只給新的那行，沒給原文。(4) U28 把 TripPanel.swift:660-667 的 candAt 縮成一行，前面 U19、U20、U21 又加了不少行，U55 第 c、d 點寫的 :677、:686-687 早就不在原處。

**合併做法**：

這幾處一律照程式找，不要照行號。U24：改 GoCard 裡 `Text("結束").font(.caption.weight(.heavy))` 開頭那兩行，和 `.accessibilityLabel("結束出發")` 下面那排的 `.frame(height: 28)`（U23 做完後大約在 TripGo.swift:75-76、:82）。U60 第 d 點：onMap、onTrip、tripPad、U23 的 onGo、pad 這幾行都留著，換掉的是從 `HStack(spacing: 10) {` 到 `.onTapGesture { … }` 結束那一段，做完要跟 U60 附的「跟 U23 的合併版」一模一樣。U55 第 a 點換的是 `var preview: TripSeg?` 和 `var previewN: Int?` 那兩行；第 b 點改的是 close() 裡 `cand = nil; hot = nil; expand = nil; preview = nil; previewN = nil; moving = false` 那行，只拿掉 `previewN = nil`；第 c 點是 placeCand 開頭 guard 裡含 `mode.previewN = nil` 的那行，第 d 點是緊接在 `line.append(b)` 那行後面、寫 `mode.preview =` 和 `mode.previewN =` 的兩行。

### 合3　U13、U12（第 2 批）、perf-round1c.md 5.E

**位置**：MapTab.swift:473-474（.onChange(of: trip.on)）、MapTab.swift:22（nearTask 宣告）、MapTab.swift:225-251（-landDefer、-landDeferList、-landDeferCluster 量測分支）

**問題**：兩邊給的 onChange(of: trip.on) 合併版程式一樣，這部分沒問題。打架的是旁邊那句交代：第 2 批 U12 第 6(c) 點說「perf-round1b 4.E 正式採用時，才在 else 分支的 seenBox.set 前面加 nearTask?.cancel()」（還把 nearTask 寫成 MapTab.swift:148，其實宣告在 :22），U13 則說不要加。第 2 批先做，照 U12 那句加了的話，a10704d 的 -landDefer 和 -landDeferCluster 分支（:229-235、:245-251）nearTask 裡還有 recluster(proxy)，降落後 0.6 秒內按「完成」離開行程，延後的泡泡重組會被一起取消，泡泡停在沒重組的樣子。U13 的注意只提 perf-round1b 4.E，沒提 perf-round1c 5.E。（反方更正：結論對，但問題寫得太重，也漏了一處。第 2 批 U12 第 6(c) 點那句有前提：要等 perf-round1b 4.E「正式採用」才加 nearTask?.cancel()。第 2 批照字面做的時候這個前提還不成立，本來就不會加，所以「第 2 批先做，照 U12 那句加了的話」在第 2 批不會發生。會出事的只有量測 build：帶 -landDefer 或 -landDeferCluster 時，取消會把 MapTab.swift:234、:250 延後的 recluster(proxy) 一起丟掉。另外第 2 批舊的合併注意結尾也有同一句「如果 perf-round1b 4.E 的 nearTask 也採用，U13 說的 nearTask?.cancel() 放在 else 分支的 seenBox.set 前面」，而且把這句說成是 U13 講的，可是 U13 現在寫的剛好相反；第 2 批的合併注意重寫後，這句已經不在了。）

**合併做法**：

照 U13 做，不加 nearTask?.cancel()。batch2.md 裡 U12 有兩句要一起改。第一句是修法 6(c) 的「MapTab.swift:148 現在已經有 nearTask，不過只給量測用的 -landDefer 用；perf-round1b 4.E 正式採用時，才在 else 分支的 seenBox.set 前面加 nearTask?.cancel()」，換成：「nearTask 宣告在 MapTab.swift:22，目前只給 -landDefer、-landDeferList、-landDeferCluster 量測用，onChange(of: trip.on)（MapTab.swift:473-474）的 else 分支不要加 nearTask?.cancel()。量測分支的 nearTask 裡有 recluster(proxy)（:234、:250），取消會連泡泡重組一起丟掉。perf-round1c 5.E 正式做的時候，新分支 0.6 秒後的補做照它寫的用 `publish: !trip.on`，離開行程時由 else 分支自己補一次。SeenBox.set 遇到同一個範圍會在 :1040 直接 return，不會多算，所以也不需要 cancel。」第二句是 U12 注意裡的「4.E 的 nearTask 正式採用時才在 :458 的 else 分支加 cancel」，整句刪掉，改成「MapTab.swift:474 的 else 分支不加 nearTask?.cancel()，理由見 6(c)」。同一段注意裡的「（第 2 批合2）」改成「（第 2 批的合併注意，U09、U10、U12 和 perf-round1c 那條）」。「U10 的 frameShown 要加列出模式的退出（第 2 批合3）」改成「（見 6(d)）」，U10 修法 5 frameShown 註解裡的「合併注意 合3」也改成「U12 第 6(d) 點」。第 2 批的合併注意要加一條短的，items 寫 U12 和 U13（第 5 批），內容是：「U12 第 6(c) 點換掉 MapTab.swift:474 那行時，else 分支不加 nearTask?.cancel()，U12 注意裡叫你在 4.E 採用時加 cancel 的那句不要照做。完整理由見第 5 批的合併注意，U13、U12 和 perf-round1c.md 5.E 那條。」舊的第 2 批合併注意裡同一句已經拿掉，不用另外處理。U13 的注意裡把 perf-round1b 4.E 補成「perf-round1b 4.E 和 perf-round1c 5.E」。

### 合4　U55、U59（第 4 批）、U09（第 2 批）、U10（第 2 批）

**位置**：MapTab.swift:65-68（all、tripHide、list；第 2 批 U10 拆完之後是 :65-69 的 base、all、tripHide、list）、MapTab.swift:358（NearbyHost 呼叫）、Store.swift:22-27（places、placesRev、groupPlaces）

**問題**：U55 第 (6) 點（快取，第二步，選做）寫「key 用 store.mapF、store.mapGroup、store.placesRev、tripHidden、pins.extra，MapTab.swift:65-68 只查快取」。照 1 到 5 批的順序，做到這裡時第 2 批 U10 已經把 :65 拆成 base 和 all 兩行，第 4 批 U59 也已經讓 MapTab body 只讀自己的 @State applied，就是為了讓 body 不再讀 store.mapF。照 U55 原文用 store.mapF 當 key，body 又會追蹤共用篩選，收藏頁每打一個字背景地圖又整張重算，U59 白做，它的驗收 1、2 都過不了。另外還有兩個洞。第一，群組地圖的 mapBase 是 placesIn(gid)（Store.swift:816-818、:821），看的是 groupPlaces（Store.swift:27）；key 裡的 placesRev（Store.swift:22-24）只在 places 改時加一，朋友分享或收回一間（第 3 批 U62 的 unshare 也只改 groupPlaces）時 key 不變，快取會一直給舊的 all 和 list，群組地圖的圖釘不更新。第二，placesRev 是 @ObservationIgnored，U55 沒提 U10 拆出來的 base 要怎麼辦；如果把 base 也搬進快取、body 只拿版本號當 key，MapTab 根本不會因為收藏改變而重算去查快取。

**合併做法**：

U55 (1) 到 (4) 不受影響。第 (6) 點不做就不用管這條；真的要做時照下面：
(a) key 裡的篩選用 MapTab 自己的 applied（第 4 批 U59 加的 @State），不要用 store.mapF。MapTab.body 直接讀到的 store.mapF 只能剩 `$store.mapF.q`（:334）和 `$store.mapF`（:339）兩個綁定。U10 的 .onSubmit 閉包和 U09 清除篩選鈕裡的 store.mapF 是在動作裡讀寫，不算 body 讀，照第 4 批的合併注意，U59、U09 和 U10 那條留著，不要改成 applied，清除篩選一定要清 store.mapF。
(b) key 要多一個群組分享的版本號。照 Store.swift:22-24 的寫法，Store.swift:27 改成 `var groupPlaces: [GroupPlace] = [] { didSet { groupPlacesRev &+= 1 } }`，下面加 `@ObservationIgnored private(set) var groupPlacesRev = 0`。key 用 applied、store.mapGroup、store.placesRev、store.groupPlacesRev、tripHidden、pins.extra。
(c) 第 2 批 U10 拆出來的 `let base = store.mapBase` 留在 body 裡，不進快取。MapTab 要靠 body 讀這一行，收藏或群組分享改變時才會被 Observation 叫起來重算、去查快取。快取只存 all 和 list，沒命中時用這個 base 算 `store.shown(applied, in: base)`。NearbyHost（:358）的 total 用快取裡的 all.count，base 用這一行的 base.count，filter 照第 4 批傳 applied。
(d) 要換成查快取的是 U10、U59 改過的 all 那一行和下面的 list，照程式找，不要照 :65-68。
U55 的 (6) 請補一句：「第 4 批 U59 做過之後，key 裡的篩選一律是 applied；第 2 批 U10 拆出的 base 留在 body，不進快取；key 要加 groupPlacesRev。」
驗收：照 U59 驗收第 1 點再量一次「地圖」次數；再切到一個測試群組的地圖，讓另一個測試帳號分享一間有地址的店，App 切到背景再回來讓它同步，那根圖釘要出現；長按自己分享的店選「從群組移除」，圖釘要消失。

### 合5　U60、U34（第 4 批）、U107（第 10 批）

**位置**：Trip.swift:459-460（刪行程的固定等待）、Trip.swift:549-550（拿掉一站）、Store.swift:601-602（刪收藏）

**問題**：U60 第 e 點說倒數要只在 Root 跑一份的理由，是「Trip.swift:459 的真刪除只等固定 6.5 秒」；它的注意還交代第 10 批 U107「把有復原的停到 15 秒時，Trip.swift:459、:548 和 Store.swift:601 的固定 6.5 秒也要跟著拉長」。第 4 批 U34 會先做，把這三段固定 sleep 加 toastHeld 迴圈都換成 `await store.waitToastGone(msg)`，第 4 批 U34 的注意也已經定案 U107 只做 (4)(5)(6)。照 U60 那句去拉長，會在 waitToastGone 之外又加回固定等待，等於兩套機制都在等。

**合併做法**：

U60 的程式照寫：倒數只在 Root 跑一份還是對的，waitToastGone 看的是 store.toast，訊息條畫在 sheet 裡還是 Root 都一樣等。第 e 點的理由改成「sheet 和 Root 各自倒數的話，關 sheet 時 Root 那條會從頭再數，訊息條停得比說好的久」；注意裡給 U107 拉長固定 6.5 秒那句刪掉，改成「第 4 批 U34 做完後刪除跟著訊息條走，U107 把訊息條延長到 15 秒，不用動刪除那邊」。U60 驗收 3、5 照舊成立：放開前不會送 DELETE，訊息條消失後約 0.3 秒才送。

### 合6　U60、U66（第 4 批）

**位置**：TripsList.swift:74（`.refreshable { await trips.load() }`）、Trip.swift:298、Trip.swift:349-359（load）

**問題**：第 4 批 U66 第 (8) 點（我的行程下拉失敗要說一聲）寫明「要等第 5 批 U60 的 toastHost 做完」，所以第 4 批會跳過它；可是第 5 批 U60 只在注意裡說 (8) 要等它，沒交代做完要回頭補，(8) 會變成沒人做。

**合併做法**：

第 5 批做完 U60 之後接著做 U66 第 (8) 點：Trip.swift:298 和 :349-359、loadNow 照 U66 原文改成回傳 Bool；TripsList.swift:74 的 `.refreshable { await trips.load() }`（U60 第 f 點刪掉 :47-66 之後大約在 :54）改成 `.refreshable { if !(await trips.load()) { store.saySyncFailed() } }`，saySyncFailed 是 U66 第 (4) 點在第 4 批已經加的。U60 驗收加一條：網路關掉時在我的行程下拉，sheet 底部看得到失敗的訊息條。

### 合7　U27、U29

**位置**：TripTop.swift:200-206（addDay）、Trip.swift:617-642（add()）

**問題**：U27 的注意說「U29 讓加進行程不再一律落到最後一天，兩項一起做時空白的最後一天就不會變成預設落點」，這不對。U29 的 pickDay 在不順路、1.5 公里內也沒有站的時候，回的是「第一個空的天」；其他天都有站時，按錯加出來的那一天正好就是第一個空天，遠的店照樣會落進去。

**合併做法**：

程式不用改。U27 那句改成：U29 之後只有不順路的店會落到空天，按錯加的那天如果是唯一的空天，還是會被選到；6 秒內按訊息條的「復原」就沒事，過了 6 秒要用「第 N 天 ▾」選單拿掉。U29 驗收 (2)「加到第 2 天（第一個空天）」照舊。

### 合8　各項內文裡的舊編號（合1 到合12）

**位置**：U22、U23、U24、U28、U55、U58、U60、U61 的修法和注意裡寫「第 5 批合N」或「合N」的地方

**問題**：這批舊的合併注意已經整節換掉，16 項也都重寫過、把還有用的合併寫法吸收進去了。可是有十幾處內文還用舊編號引用它，而且新的合併注意也是從合1 開始編，同一個「合5」新舊指的是不同東西。舊的幾條裡有兩條照做會改壞：舊合6 的 pad 是 `min(TripMode.shared.panelH, 420) + 8`，會把 5d713ac 的 tripPad（FoodMapApp.swift:120）蓋掉；舊合5 復原時一律 TripAsked.remove，評過的站會再被問一次。

**合併做法**：

各項內文裡的「合N」一律當成舊編號，照下面對到現在的寫法，以各項的修法為準：
- 舊合1：U13 和第 2 批 U12。else 分支不加 nearTask?.cancel()，見這批合3。
- 舊合2：已過時。它寫的 `CACurrentMediaTime() - held.endedAt > 0.4` 跟現在 TripPanel.swift:482 的 `!held.justEnded` 等價（RowHold.swift:56），不用改。
- 舊合3：U19，和第 9 批的合併注意，U106、U49 和 U19 那條。
- 舊合4：U28 第 (3) 點（U22 注意裡「照第 5 批合4 的寫法」就是指這個）。
- 舊合5：不要照做。跳過的復原照 U23 的 skip()，只在跳過前沒問過時才 TripAsked.remove；U24 裡的「第 5 批合5」指的也是 U23 的 skip()。
- 舊合6：不要照做，pad 會蓋掉 tripPad。照 U60 的合併版，見這批合5、合6（U23 裡的「第 5 批合6」、U60 注意裡「batch5 合6 的合併版還是 min(…)」那句都以這兩條為準）。
- 舊合7：不要照做。拿掉一站的復原 closure 照這批合10（U27 和 U34），結尾要有 `seconds: 6`，day 那段不加。
- 舊合9：U61 驗收 (6)。
- 舊合10：U22 驗收 (4)。
- 舊合11：U22 已經改名 panToNew（U28 注意裡的「合11」）。
- 舊合12：各項注意已經更正，不用找（U22、U55、U58 注意裡的「合12」）。
跟第 6 批以後有關的合併，照那幾批自己的合併注意。

### 合9　U55、U58、U24、U25、U27、U23、U28

**位置**：TripTop.swift:37-42（.task(id: routeKey(t))）、TripTop.swift:464、:466、:482、:488（HitPin）、TripMode.swift:297-318（TripSearch.measure）

**問題**：跟檢查員第 1 條是同一類問題，但他沒有列到。照 1 到 5 批的順序，前面幾項加的行會把後面只寫行號的地方推走。TripTop 這邊：U24 把 :25-27 的「完成」換成 6 行的 if，又在 :30 後面加一行 animation，:30 以後的行號往下移 4 行；U25 把 :118 一行換成 8 行的 HStack，再多 7 行；U27 把 :200-206 的 addDay 7 行換成 27 行，再多 20 行。結果 U58 第 (2) 點寫的「TripTop.swift:37-42 換成」實際上在 :41-46，U55 第 (2) 點的 HitPin（:464、:466、:482、:488）大約在 :495、:497、:513、:519。TripMode 這邊：U23 在 :35 後面加 goInset（多 1 行），U28 在 :138 tap() 後面加 candAt 和 addCand（多 39 行），U55 第 a 點把 :44-45 兩行合成一行（少 1 行），所以 U58 第 (1) 點寫的「TripMode.swift:297-318 的 measure 整個換成」，實際上大約在 :336-357。U58 第 (2) 點沒有附原文，照行號改的話，會改到 searchKey 那個 task 的尾巴。

**合併做法**：

這幾處一律照程式找。U58 第 (2) 點換的是 TripTop 裡 `.task(id: routeKey(t)) {` 開頭、到 `mode.search.measure(…)` 下一行右括號結束的那 6 行，不要動上面 `.task(id: searchKey)` 那個。U58 第 (1) 點換的是 TripSearch 裡 `func measure(_ all: [TripStop], seg: [String]?, mode: TravelMode, store: Store) {` 整個函式，不是 TripMode class 裡 U28 新加的 candAt、addCand。U55 第 (2) 點在 `struct HitPin: View {` 裡拿掉 `let on: Bool`，在 `@State private var shown = false` 下面加那兩行。U58、U55 的「行號」那行補一句：「第 5 批前面的 U23、U24、U25、U27、U28 做完後，TripTop、TripMode 的行號已經移了，照引用的程式碼找。」

### 合10　U27、U34（第 4 批）

**位置**：Trip.swift:534（註解）、Trip.swift:541-546（拿掉一站的 say 和復原 closure）、Trip.swift:547-551（等待）、TripTop.swift:175-198（removeDay，:197 是它最後的 store.say）

**問題**：第 4 批 U34 第 (3) 點附了一份「想一起擋就把 :540-545 合成」的可選版本，把 U27 原本的「那天被拿掉就改到最後一天」放進復原 closure；U27 現在卻寫「3fc00de 之後不用在刪站復原 closure 改 s.day，U34 第 (3) 點只改自己的 guard 和等待」，兩邊說法相反。這批舊的合併注意裡還有一份要改 s.day 的 closure，結尾是 `}))`，沒有 e7af2e1 的 `seconds: 6`；第 4 批做完再照它貼一次，會把拿掉一站的訊息條改回預設 4 秒（FoodMapApp.swift:158），day 那段又被加回來。判斷是 U27 對：3fc00de 的拿掉一天最後一定會 store.say「已拿掉第 N 天」（TripTop.swift:197），把拿掉一站那條的「復原」換掉；有站的那天要先過確認框，也按不到底下的復原，同一支手機碰不到這個邊角。U34 說還剩群組裡別人同時拿掉那天的情況，可是那時那一站在伺服器上還沒刪，別人的拿掉一天會把它當成那天的站一起搬走並送 PATCH，這邊按復原後下次同步就會拿到伺服器上的天數；復原 closure 再自己送一次 update，反而會跟別人的 PATCH 搶。

**合併做法**：

不加 day 那段。第 4 批 U34 第 (3) 點做完後，Trip.swift 拿掉一站的 say 和等待就是最終版，做 U27 時不要再動它，也不要照這批舊的合併注意或 U34 修法 (3) 的可選版去改：
```swift
        let msg = "已拿掉 \(s.name)"
        store.say(msg, icon: .trash, action: ("復原", { [weak self] in
            guard let self else { return }
            guard self.hiddenStops.remove(s.id) != nil else { Haptic.warning(); store.say("已經刪掉了"); return }
            LaterDelete.remove("trip_stops", s.id)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { self.stops.append(s); store.toast = nil }
            self.saveCache()
        }), seconds: 6)
        Task {
            await store.waitToastGone(msg)
            guard hiddenStops.contains(s.id) else { return }
            // :552-559 送 DELETE、失敗放回照舊
```
Trip.swift:534 的註解是「6 秒內」。U27 只做它自己的 addDay()（TripTop.swift:200-206），removeDay 最後那行 store.say（TripTop.swift:197）不能拿掉，它就是擋住這個邊角的東西。U27 注意裡「跟第 4 批 U34 的合併」那句照留，它說的就是這裡的結論。

### 行號更正（a10704d）

- U29：現況寫「TripChooser.swift:76 呼叫 trips.add」（標 3fc00de；TripChooser 在 3fc00de 之後沒改），想指 row(t) 按下去的 `trips.add(place, to: t, made: false, store: store)`。:76 不是這行。正確：TripChooser.swift:63
- U13：驗收 (5) 寫「刪掉一站後按訊息條本身（Trip.swift:641 的 tap）回到行程」（標 d95fd43）。Trip.swift:641 是 add()「加到 X 第 N 站」那條訊息條的 tap，不是刪一站的；拿掉一站的訊息條沒有 tap，照這句做按了只會收掉訊息條。正確：Trip.swift:637-641（add() 的訊息條，tap 在 :641）；驗收 (5) 要改成：不在行程模式時從店家頁按「加進行程」，再點那條「加到 X 第 N 站」訊息條本身進行程。拿掉一站的訊息條在 Trip.swift:541-546，沒有 tap

## 各項

### U13（P2・錯誤）選著圖釘進行程模式，那根保持放大、帶店名，像一個站

**畫面**：地圖首頁：點圖釘開大卡 → 按右邊「行程」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：TripMode.open 把 cand 設成 nil，但 cand 本來就是 nil，所以 pins.sel 沒被清掉。進行程後那根收藏維持 1.35 倍加深色店名牌，下面卻沒有加站卡。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：5d713ac、d95fd43 沒有修這件事，MapTab.swift 和 TripMode.swift 在 3fc00de 之後都沒動。TripMode.swift:72-89 的 open() 在 :80 把 cand 設成 nil，但進來前 cand 本來就是 nil，所以 SelWatcher 的 `.onChange(of: TripMode.shared.cand == nil)`（MapTab.swift:1685-1687）不會觸發，pins.sel 沒被清。FoodPin 的 on 還是 true（MapTab.swift:1740），faded 和 dim 都把 on 排除（:1743、:1744），所以那根維持 1.35 倍（:1793、:1846-1851）加深色店名牌（:1769-1781）。下面的大卡因為 :1137 在行程模式時 picked 是 nil 而不見，加站卡也沒有。MapTab.swift:457-458 的 `.onChange(of: trip.on)` 還是只處理離開行程。進行程的入口：右邊「行程」鈕 openTrip（:724-731）、長按選單的 .trip（:549-550）、PlaceDetail.swift:229、Trip.swift:641（5d713ac 在 :536 加了一行 Perf 記號，原本的 :640 往下移一行）、TripsList.swift:110（d95fd43 加了確認和 delete()，enterTrip 從 :77 移到 :107-111），全部都經過 trip.open。d95fd43 的 TripsList.delete()（:99-104）刪正在排的行程時會叫 TripMode.close()，那是離開行程，走 onChange 的 else 分支，跟這項無關。

**修法**：

改 MapTab.swift:457-458。現在這兩行是：
```swift
        // 離開行程：下面的附近面板補算一次地圖現在看的範圍（行程模式時沒跟著算）
        .onChange(of: trip.on) { _, on in if !on { seenBox.set(seenBox.peek, publish: true) } }
```
整段換成：
```swift
        // 進行程：首頁選著的圖釘取消（不然那根維持放大帶店名、像一個站）；
        // 離開行程：下面的附近面板補算一次地圖現在看的範圍（行程模式時沒跟著算）
        .onChange(of: trip.on) { _, on in
            if on {
                if trip.cand == nil { pins.select(nil); pins.drawn = nil }
            } else {
                seenBox.set(seenBox.peek, publish: true)
            }
        }
```
不要放在 :273 那個 onChange：它看的字串含 foundIds，行程裡每次搜尋結果變都會跑，放在那裡會在使用者點了搜尋結果、picked 還沒把 cand 設好的那一下把選取清掉。

跟第 2 批 U12 的合併：U12 第 6(c) 點也要把這一行整個換掉。兩項都做的時候以下面這段為準，誰先做都一樣；U12 還沒做時不要加第一行，SeenBox（:1018-1027）還沒有 only、zoomed 這兩個欄位，會編不過：
```swift
        // 進出行程：「只列這幾間」一律退出（U12）。
        // 進行程：首頁選著的圖釘取消，不然那根維持放大帶店名、像一個站（U13）；
        // 離開行程：下面的附近面板補算一次地圖現在看的範圍（行程模式時沒跟著算）
        .onChange(of: trip.on) { _, on in
            seenBox.only = nil; seenBox.zoomed = nil
            if on {
                if trip.cand == nil { pins.select(nil); pins.drawn = nil }
            } else {
                seenBox.set(seenBox.peek, publish: true)
            }
        }
```
不要在 else 分支加 `nearTask?.cancel()`：nearTask（:22）是 -landDefer 量測用的，裡面除了 seenBox.set 還有 recluster(proxy)，取消會把延後的泡泡重組一起取消；而 SeenBox.set 遇到同一個範圍本來就直接 return（:1024），發佈兩次也不會多算。

在 d95fd43 上走一遍會發生什麼：pins.select(nil)（:1660-1667）會順便清 extra、取消還在跳的抽一間，cleared 加一讓 MapTab 多重算一次，只在進行程時剛好選著圖釘才發生，可以接受。SelWatcher 接著用 nil 呼叫 picked()（:593），因為 trip.on 已經是 true，走 :595-602 的行程分支：設一次 trip.pickAt，cand 本來就是 nil，所以不會打「picked nil 收加站卡」那筆，:278 的 onChange(of: trip.cand?.id) 也不會跑，不會記「加站卡關掉」。pins.select(nil) 直接改 PinState，不經過 Map 的 selection setter（:86 起），所以行程模式擋 nil 的那段（:90-95）擋不到它；MapKit 之後如果自己補送一個 nil，會被 :92 擋掉，最多在浮層多一行「地圖選取略過 nil」（兩秒內點過圖釘才記），不影響行為。pins.drawn = nil 是讓回首頁時 🎲 變回「抽一間」；就算不清，:1138 的 drawn 也因為 sel 是 nil 而為 false，這行是保險。按「完成」回首頁後大卡不會回來，這是預期行為。

**模擬器驗收**：(1) 地圖首頁點一根圖釘開大卡，按右邊「行程」：那根縮回、沒有店名牌，跟其他收藏一樣縮小變淡（0.65 倍、0.6 透明）。量測浮層不能出現「加站卡關掉」或「picked nil 收加站卡」。(2) 按 🎲 抽中一間後直接按「行程」：同上；之後按「完成」回首頁，沒有大卡，🎲 那顆是「抽一間」不是「再抽一次」。(3) 長按一根圖釘，在選單選「在行程裡」那一站進行程：同上，而且地圖照樣飛到那站。(4) 從店家頁的「在行程裡」進行程（PlaceDetail.swift:229）：同上。(5) 刪掉一站後按訊息條本身（Trip.swift:641 的 tap）回到行程：同上。(6) 選著一根圖釘時從右邊「行程」開我的行程（沒有上次的行程時才會開 sheet），點一個行程進去（TripsList.swift:110）：同上。(7) 回歸：行程裡點收藏圖釘、點搜尋結果圖示照常出加站卡，兩指縮放放開時手指下的圖釘不會被當成點一下，按「完成」回首頁不冒出大卡，附近面板有補算；在我的行程刪掉正在排的行程（d95fd43）也一樣回首頁、附近面板有補算。(8) U12 做過的話：在「只列這幾間」的狀態進行程再出來，清單回到一般的附近。

**注意**：5d713ac、d95fd43 跟這項沒有重疊：5d713ac 只改 SwipeToDelete 和訊息條位置，d95fd43 的 TripsList.delete() 走 TripMode.close()，進到這項 onChange 的 else 分支（補算附近），行為跟按「完成」一樣。第 2 批 U12 第 6(c) 點也把 MapTab.swift:458 整行換掉，兩項都做時用上面的合併版。perf-round1b 4.E 的 nearTask 在 52a0b69 以 -landDefer 量測參數的形式出現，這裡不要加 nearTask?.cancel()。U13 注意裡寫的「同一批 U72」其實在第 7 批，U72 在 zoom() 裡呼叫 pins.select(nil)，位置不同，不衝突。8559c3d 的 pins.moving 只擋 tap()，跟這裡無關。

### U19（P2・無障礙）VoiceOver 沒辦法切換面板段數、不能換站順序；輪播自動換頁會打斷朗讀

**畫面**：地圖面板三段、行程面板與站卡、登入頁輪播（VoiceOver 開著）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：最低段點圖釘或 🎲 可以回到中間段，但沒有任何非拖曳的方式到最高段的整份清單，也回不來。橫條是沒有 label 的 Capsule，最低段被裁掉的卡片列還會被唸出來。行程面板的把手沒有無障礙元素，換順序只能長按拖。登入輪播每 2.5 秒自動換頁。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：5d713ac、d95fd43 都沒有做這一項，四個部分都還在。MapTab.swift、MapPanel.swift、Onboard.swift、TripTop.swift 在 3fc00de 之後沒動，行號照舊；TripPanel.swift 在 5d713ac 只在 :847 多一行（加站的復原裡加 Perf 記號），所以 :847 以前的行號照舊，StopCard、MiniStop 往下移 1 行。
(1) 地圖面板：把手是沒有 label 的 Capsule（MapTab.swift:1142-1144）。titleRow（:1310-1329）和標題文字（:1313-1314）都沒有自訂動作。mid() 只有 .accessibilityHidden(tall)（:1156），最低段被裁掉的卡片列（:1239-1257 的橫向 ScrollView，:1250 是 .frame(height: 112)）沒藏。mp.go 在 MapPanel.swift:29-33。
(2) 行程面板：把手（TripPanel.swift:322-323）沒有無障礙元素。block() 的簽名在 :454，呼叫在 :449；StopCard 呼叫在 :480-491，:482 是 `guard drag.id == nil, !held.justEnded`，:491 是 `}, hold: rowHold(t, s, k: k))`。rowHold 在 :515，:517 一開始設 held.on。drop() 在 :561-594，算位置、清交通方式那段是 :572-591。StopCard 本體現在是 :1466-1534，hold 參數在 :1476，上面那排的手勢是 :1517 的 TapIf 和 :1518 的 RowHoldIf，:1519 是 StopEditor，這排沒有合成一個元素、也沒有自訂動作。MiniStop 在 cards() 的 :609-621，:614 是 `.modifier(RowHoldIf(hold: rowHoldX(t, s, k: k)))`；本體 :1690-1742 已經是合成元素（:1739-1740），但沒有自訂動作。settleSheet 在 :419-431。
(3) LoginCarousel（Onboard.swift:222-258）沒改：.task(id: page) 在 :252-257，只看減少動態（:253），插圖 art(i) 在 :232 沒藏。
(4) 行程標題列的摘要在 TripTop.swift:121，還是 .minimumScaleFactor(0.75)。
5d713ac 改了包著 StopCard 的 SwipeToDelete（TripsList.swift:367-437）：多了停在露出垃圾桶的 open 狀態、收回用的透明 overlay（:384）和有 accessibilityLabel("刪除") 的垃圾桶按鈕（:388-396），只有 dx < 0 時才出現；這些不影響這項要加的動作，原修法照樣套得上。

**修法**：

下面行號都是 d95fd43 的。

(1) 地圖面板（MapTab.swift）

把手：:1144 行 `.modifier(grip)` 後面接著加：
```swift
                .accessibilityElement()
                .accessibilityLabel("附近清單")
                .accessibilityValue(mp.stage == .low ? "收起" : mp.stage == .mid ? "一排卡片" : "整份清單")
                .accessibilityAdjustableAction { d in
                    switch d {
                    case .increment: mp.go(mp.stage == .low ? .mid : .high)
                    case .decrement: mp.go(mp.stage == .high ? .mid : .low)
                    @unknown default: break
                    }
                }
```
mp.go（MapPanel.swift:29-33）在已經是那段時什麼都不做，所以最高段再 increment、最低段再 decrement 都不會出事；升段時它會設 calmUntil（MapPanel.swift:31）。停好之後 MapTab.swift:1173-1177 的 onGeometryChange 會叫 report()，不用另外補。

標題的自訂動作：不要掛在 titleRow 的 HStack 上（裡面有 DiceChip 按鈕，HStack 本身不是一個元素），掛在標題文字上。:1314 行 `.layoutPriority(1)` 後面加：
```swift
                .accessibilityActions {
                    if mp.stage != .high { Button("展開附近清單") { mp.go(mp.stage == .low ? .mid : .high) } }
                    if mp.stage != .low { Button("收起") { mp.go(.low) } }
                }
```
最高段時中段那份 titleRow（:1237）在 :1156 的 accessibilityHidden(tall) 裡面，只會唸到 high 裡那一份（:1270），不會重複。

最低段的卡片列：:1250 行 `.frame(height: 112)` 後面加一行 `.accessibilityHidden(mp.stage == .low)`。只藏卡片列，標題那行在最低段還看得到，不能藏。這一行要跟第 2 批 U08、第 7 批 U77 合：U08 會把 :1248-1257 那串 modifier 整段換掉，照總表順序先做 U08，本項這行接在 U08 新版的 `.frame(height: 112)` 後面、`.task(id: scrolled)` 前面，U77 的 `.simultaneousGesture(cardPull)` 再接在本項這行後面。如果本項比 U08 先進，做 U08 時要把這行帶進新版，不要照 U08 原文整段貼。

(2) 行程面板（TripPanel.swift）

把手：:323 行 `.frame(maxWidth: .infinity).frame(height: strip ? 20 : 16)` 後面加：
```swift
                .accessibilityElement()
                .accessibilityLabel("行程面板")
                .accessibilityValue(mode.level == .low ? "站卡一排" : mode.level == .mid ? "一半" : "整份清單")
                .accessibilityAdjustableAction { d in
                    let all: [TripLevel] = [.low, .mid, .high]
                    let i = all.firstIndex(of: mode.level)! + (d == .increment ? 1 : d == .decrement ? -1 : 0)
                    guard all.indices.contains(i), all[i] != mode.level else { return }
                    Haptic.light()
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { mode.level = all[i]; lift.y = 0; pullList = false }
                }
```
歸零的寫法跟 settleSheet 的 :430 一樣。這裡不要叫 settleSheet，也不用叫同批 U20 新加的 pullChanged。

換順序。先把 drop() 裡算位置、清交通方式那段（:572-591）抽出來，給 drop() 和 VoiceOver 共用。在 drop() 的右大括號（:594）後面加：
```swift
    // 把 s 放到 order 裡它的位置：算新的 pos；前一站換了的站（拖的這站、原本在它後面的、現在在它後面的）交通方式回到自動。
    // drop() 和 VoiceOver 的「往前移／往後移」共用
    private func moved(_ s: TripStop, order: [TripStop], base: [TripStop]) -> TripStop {
        var s = s
        guard let i = order.firstIndex(where: { $0.id == s.id }) else { return s }
        let before = i > 0 ? order[i - 1].pos : nil
        let after = i + 1 < order.count ? order[i + 1].pos : nil
        switch (before, after) {
        case let (b?, a?): s.pos = (b + a) / 2
        case let (b?, nil): s.pos = b + 1
        case let (nil, a?): s.pos = a - 1
        default: break
        }
        s.mode = nil
        var reset: Set<String> = []
        if let k = base.firstIndex(where: { $0.id == s.id }), k + 1 < base.count { reset.insert(base[k + 1].id) }
        if i + 1 < order.count { reset.insert(order[i + 1].id) }
        for sid in reset where sid != s.id {
            if var x = trips.stops.first(where: { $0.id == sid }), x.mode != nil { x.mode = nil; trips.update(x, store: store) }
        }
        return s
    }

    // VoiceOver：往前、往後移一站（手指正拿著一站時不動）
    private func nudge(_ t: Trip, _ s: TripStop, by step: Int) {
        let base = trips.stops(t.id, day: min(mode.day, t.days))
        guard drag.id == nil, !held.on, let k = base.firstIndex(where: { $0.id == s.id }), base.indices.contains(k + step),
              let cur = trips.stops.first(where: { $0.id == s.id }) else { return }
        var order = base
        order.insert(order.remove(at: k), at: k + step)
        let x = moved(cur, order: order, base: base)
        Haptic.light()
        withAnimation(.snappy(duration: 0.28)) { trips.update(x, store: store) }
        AccessibilityNotification.Announcement("移到第 \(k + step + 1) 站").post()
    }
```
然後 drop() 的 :572-591 換成兩行（:592-593 的 Haptic 和 withAnimation 不動）：
```swift
        let base = trips.stops(t.id, day: d)
        if drag.to != drag.from { s = moved(s, order: drag.preview(base), base: base) }
```
跟原本的差別只有 order 裡找不到那站時照樣寫回 s，原本也是寫回，行為一樣。nudge 多擋 held.on：rowHold 在 began 一開始就設 held.on（:517），就算 begin() 因為清單在拉面板沒拿起，手指放開前也不讓 VoiceOver 動作插進來。

StopCard 的動作要掛在 StopCard 裡面，因為上面那排不是一個元素、外面又包了 SwipeToDelete。StopCard 在 :1476 行 `var hold: RowHold? = nil` 後面加：
```swift
    var moveUp: (() -> Void)? = nil      // VoiceOver「往前移」（第一站沒有）
    var moveDown: (() -> Void)? = nil    // VoiceOver「往後移」（最後一站沒有）
```
:1518 行 `.modifier(RowHoldIf(hold: V11.noHold ? nil : hold))` 後面加：
```swift
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { tap() }
            .accessibilityActions {
                if let moveUp { Button("往前移", action: moveUp) }
                if let moveDown { Button("往後移", action: moveDown) }
            }
```
`.accessibilityAction { tap() }` 把雙擊接到同一個 tap 閉包（含 :482 的 guard），雙擊照樣第一下飛過去、第二下展開。展開後的 StopEditor（:1519）在這排外面，照舊是分開的元素。

block() 要知道是不是最後一站：:454 的簽名最後加 `, last: Bool`，:449 的呼叫最後加 `, last: k == base.count - 1`。:480-491 的 StopCard 呼叫，把 :491 `}, hold: rowHold(t, s, k: k))` 改成：
```swift
                }, hold: rowHold(t, s, k: k),
                   moveUp: k > 0 ? { nudge(t, s, by: -1) } : nil,
                   moveDown: last ? nil : { nudge(t, s, by: 1) })
```
:482 的 guard 和 :491 的 rowHold 都留著。

MiniStop 本身已經是合成的元素（:1739-1740），動作直接在 cards() 裡從外面掛：:614 行 `.modifier(RowHoldIf(hold: rowHoldX(t, s, k: k)))` 後面加：
```swift
                        .accessibilityActions {
                            if k > 0 { Button("往前移") { nudge(t, s, by: -1) } }
                            if k < base.count - 1 { Button("往後移") { nudge(t, s, by: 1) } }
                        }
```

(3) 登入輪播（Onboard.swift）
:224 行後面加 `@Environment(\.accessibilityVoiceOverEnabled) private var voiceOver`。:252 改成 `.task(id: "\(page)-\(voiceOver)") {`（只看 page 的話，VoiceOver 開著時 task 直接 return，之後關掉 VoiceOver，page 沒變、task 不會重跑，輪播就一直停著）。:253 改成 `guard !reduce, !voiceOver else { return }`。:255 改成 `guard !Task.isCancelled, !UIAccessibility.isVoiceOverRunning else { return }`，等 2.5 秒中途才打開 VoiceOver 的也不會再換一頁（task 的閉包拿到的是舊的 view 值，這裡用 UIKit 的即時值；檔案第 2 行已經 import UIKit）。:232 改成 `art(i).frame(height: 96).accessibilityHidden(true)`。
第 9 批的 U106、U49 會把整個 LoginCarousel 換成 ScrollView 版，到時候直接用第 9 批「合1」那份合併版，裡面已經帶著這裡的 voiceOver、兩個 guard、插圖的 accessibilityHidden 和含 voiceOver 的 task id，不要照 U106 原文整段貼。

(4) TripTop.swift:121 的 `.minimumScaleFactor(0.75)` 改成 `0.9`，字級照規格不動。

**模擬器驗收**：用 Accessibility Inspector（或真機開 VoiceOver）。
地圖面板：把手做 increment、decrement，三段都能切，而且唸出「收起／一排卡片／整份清單」；最高段再 increment、最低段再 decrement 不會動。在「附近 N 間」上叫出動作選單，最低段只有「展開附近清單」，中段兩個都有，最高段只有「收起」。最低段往右滑不會唸到被裁掉的卡片，標題那行唸得到。
行程面板：把手同樣能切三段，唸「站卡一排／一半／整份清單」。中段每張站卡唸成一個元素，第一站只有「往後移」、最後一站只有「往前移」，中間的兩個都有；執行後號碼、地圖路線和時間跟著更新，會唸「移到第 N 站」，原本手動選過的交通方式在換過的站上回到自動，鏡頭不會跳回整天（有做 U22 的話）。雙擊站卡照常讓地圖飛過去，再雙擊才展開。最低段的小站卡也有同樣的動作。剛加完一站、訊息條還在時（面板最高段時它在面板最上面那條，5d713ac），把手照樣找得到、調得動。
關掉 VoiceOver 再用手指試一次：中段從站卡中間上下拖照常捲清單、長按 0.35 秒拿起拖曳換順序照舊（RowHold），左滑一小段停在露出垃圾桶、點垃圾桶刪、點卡片收回都照舊（5d713ac），滑到底照舊直接刪。
登入頁：開著 VoiceOver 停 10 秒，輪播不會自己換頁，插圖不會被唸；關掉 VoiceOver 後 2.5 秒內恢復自動換頁。
行程標題列的摘要字最小只縮到 0.9 倍。

**注意**：5d713ac：SwipeToDelete（TripsList.swift:367-437）多了停在露出垃圾桶的狀態，站卡停在露出垃圾桶時用 VoiceOver 的「往前移／往後移」，那張卡會帶著打開的狀態一起移（SwipeToDelete 跟著站的 id 走），點卡片就收回，不用另外處理；這項不動 SwipeToDelete。5d713ac 也讓行程面板最高段時的訊息條放進面板最上面那條（FoodMapApp.swift:120 的 tripPad），會疊在把手附近，VoiceOver 照樣能用左右滑找到把手，不衝突。d95fd43 只改「我的行程」，跟這項無關。
第 2 批 U08、第 7 批 U77：都改 MapTab.swift:1250 那個 .frame(height: 112) 附近，順序和寫法見 fix 第 (1) 點（先 U08，本項接在 U08 新版的 frame 後面，U77 再接在本項後面）。
第 6 批 U78：改同一個 StopCard 呼叫（:480-491）。不要照 U78 原文整段貼，那份還是 acd4471 的 AnyGesture 版本，也沒有 moveUp、moveDown，貼上去會把 VoiceOver 動作默默刪掉（參數預設 nil，編得過）。做法是只在 tap 閉包 :482 的 `guard drag.id == nil, !held.justEnded else { return }` 後面插 U78 的最高段 if，其他保留，結尾是 `}, hold: rowHold(t, s, k: k), moveUp: k > 0 ? { nudge(t, s, by: -1) } : nil, moveDown: last ? nil : { nudge(t, s, by: 1) })`；block() 的 last 參數和 :449 的 `last: k == base.count - 1` 都要留著。第 6 批合3 寫的 guard 是 `CACurrentMediaTime() - held.endedAt > 0.4`，d95fd43 已經寫成 `!held.justEnded`（RowHold.swift:56），照 d95fd43 的。
第 9 批 U106、U49：LoginCarousel 用第 9 批合1的合併版。
同批 U22：U22 也在 TripPanel 加一個小移鏡頭的函式，改名叫 panToNew，本項的 nudge 不動。
同批 U20、U21：本項把手的 adjustable 自己寫 mode.level 並把 lift、pullList 歸零，不用叫 pullChanged 或 settleSheet；抽 moved() 時不要動到 settleSheet（:419-431）。U21 改的是 cards() 外面的 :265-272，本項的 MiniStop 動作在 cards() 裡 :614 後面，不衝突。
第 6 批 U80：改 begin()（:548-554）、clearDrag()（:557-559）和 rowHold、rowHoldX 的 moved 閉包，本項改 drop() 的 :572-591、在 :594 後面加函式、在 rowHold 呼叫的參數後面加 moveUp／moveDown，行不重疊。

### U20（P2・滑順）最低段往上拉時清單不跟著出來，往下拉反而閃出清單（部分已修，下面只寫剩下的）

**畫面**：行程模式・面板最低段（站卡一排）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：換成清單的條件方向寫反了。build 22 是 strip = level == .low && pull >= −20；分支 5b5355c／bc0bc20 改成 pullDown（lift.y < −20），方向還是反的。結果往上拉時面板長高但裡面空白，要放開才淡入；往下拉超過 20pt 會閃出起點膠囊，再換回站卡。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：acd4471 之後 sheetDrag 沒有被改：TripPanel.swift:403-416，409 行還是 `let alt = mode.level == .low && (lift.y < -20 || lift.y > 40)`。往上拉那一半本來就好了：直的清單一直掛在站卡下面（ZStack 225-270，262-264 用透明度藏著），往上過 40pt pullList 變 true、strip（219）變 false，清單跟著出現。沒修的是往下拉：最低段往下拉超過 20pt strip 也變 false，起點那列（330 行 `frame(height: strip ? 0 : nil)`）撐開、站卡（265-269 的 `if strip`）被拿掉、清單閃一下，放開後 settleSheet（430）把 pullList 歸零又換回站卡。24 行的註解還寫著「往下拉超過 20」。9379b88 拿掉了清單上的 listPull 備案拖曳和 listPulling（acd4471 的 419-444、283-292），現在會改 lift.y 的只剩 sheetDrag 和 ListPullDown 的 changed（235），後者在最低段時清單 allowsHitTesting(false)（263）不會動。e7af2e1 在 280-289 加的 DayDrops overlay 會讀 strip（282、284），只在拖一站時看得到，跟這項無關。交叉淡入目前還是跨過 40pt 那一下靠 290 行的 `.animation(.snappy(duration: 0.25), value: strip)`，不是跟著手指。

**修法**：

必改。
(a) 在 settleSheet 的註解（418）前面加一個小函式，sheetDrag 和同批 U21 的 PanelPan 共用：
```swift
    // 拉面板的量（往上為正）：最低段往上拉超過 40 換成直的清單（跨過線才寫 @State，不是每幀）
    private func pullChanged(_ up: CGFloat) {
        lift.y = up
        let alt = mode.level == .low && up > 40
        if alt != pullList { pullList = alt }
    }
```
(b) sheetDrag 的 onChanged（406-411）換成：
```swift
            .onChanged { v in
                guard drag.id == nil else { return }
                pullChanged(-v.translation.height)
            }
```
這樣 409 行的 `lift.y < -20` 就沒了。onEnded（412-415）和 340-343 的取消處理不動，settleSheet 的 430 行本來就把 lift、pullList 一起歸零。
(c) 24 行的註解改成「最低段往上拉超過 40：換成直的清單（跨過線才改，不是每幀）」。
ListPullDown 的 changed（235）只在中段、最高段會動，不用改。原修法提到的 listPull（acd4471:435）已經被 9379b88 拿掉，不用管。

選做（跟著手指交叉淡入），要等同批 U21 第 (3) 點把站卡改成最低段一直掛著之後才能做。不要在 panel() 裡直接讀 lift.y，不然整個面板每幀重算。在 PanelLift.swift 的 LiftOffset（24-32）後面加一個只讀 lift 的小 modifier：
```swift
// 最低段往上拉：清單、站卡跟著手指淡入淡出（只有這層讀 lift，面板不用每幀重算）
struct PullFade: ViewModifier {
    let lift: Lift
    let on: Bool          // 跟著手指（清單：最低段；站卡：還沒換成清單）
    let out: Bool         // true 越拉越淡（站卡），false 越拉越清楚（清單）
    let range: CGFloat    // 拉多少點走完
    func body(content: Content) -> some View {
        let k = min(1, max(0, lift.y / range))
        content.opacity(on ? (out ? 1 - k : k) : (out ? 0 : 1))
    }
}
```
TripPanel.swift:262 清單的 `.opacity(strip ? 0 : 1)` 換成 `.modifier(PullFade(lift: lift, on: mode.level == .low, out: false, range: 80))`，263、264 不動。U21 新版站卡那段的 `.opacity(strip ? 1 : 0)` 換成 `.modifier(PullFade(lift: lift, on: strip, out: true, range: 40))`。
跟原修法不一樣的地方：原修法寫站卡的透明度是 1 減 lift/80，到 40pt 時還有一半，strip 一翻成 false 站卡就被拿掉，會跳一下。這裡站卡用 40，0 到 40pt 之間淡到 0，正好在 pullList 翻成 true 那一下消失；停到中段時站卡已經是 0，拿掉時不會閃。清單用 80，往上拉時跟著手指淡入。往下拉 lift.y 是負的，站卡一直是 1、清單一直是 0。

**模擬器驗收**：行程模式、面板在最低段。按住橫條往下拉 25 到 30pt：一直是站卡，起點膠囊不會冒出來，放開回到最低段。慢慢往上拉：過了大約 40pt 換成清單，放開時沒超過一段就回站卡，超過就停在中段而且是清單。中段、最高段拉橫條照舊換段，不會出現站卡。量測浮層的「行程面板」次數（TripPanel.swift:54）在拉的過程中只在跨過 40pt 那一下加 1。
有做選做的話：往上拉時站卡跟著手指變淡、清單跟著手指變清楚，停到中段時站卡不會閃一下；量測浮層的次數一樣只在跨過 40pt 時加 1。

**注意**：同批 U21：U21 的 PanelPan 要叫這裡的 pullChanged 和 settleSheet，兩項最好同一個 commit 做，不然 U21 會把往下拉也切清單的舊邏輯複製一份；選做的交叉淡入要 U21 第 (3) 點（站卡在最低段一直掛著）。
同批 U19：把手的 adjustable 自己把 lift、pullList 歸零，不用叫 pullChanged。
第 6 批 U81：它靠 pullList 讓結果框淡出，程式照寫，但它的說明「或往下拉過 20」要刪掉，驗收那句改成「在最低段往下拉一點再放手，結果框一直在，不會閃」；往上拉過 40pt（含 U21 從站卡、按鈕往上推）結果框照樣淡出。
fix-v11-acd4471.md 已經在 8559c3d、9379b88 進了，不碰 sheetDrag，沒有衝突。perf-round1b.md 沒有重疊。

### U21（P2・規格落差）最低段只有 20pt 細條能拉，站卡和按鈕上下推都沒反應

**畫面**：行程模式・最低段（站卡一排＋排順序／出發）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：規格 A2 要求面板頂部 44pt 都能拉。最低段的 head 只剩 20pt 橫條；站卡是橫向 ScrollView，按鈕也不會把上下拖交給面板。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：8559c3d 到 3fc00de 都沒有做這一項。最低段 head 還是只有 20pt 的橫條能拉：TripPanel.swift:322-323 `frame(height: strip ? 20 : 16)`，起點那列在 325-334 收成 0 高（330），sheetDrag 只掛在 head 上（337）。站卡是 cards()（598-635）裡的橫向 ScrollView；8559c3d 把 MiniStop 的長按換成 UIKit 的 RowHold（614 行 `.modifier(RowHoldIf(hold: rowHoldX(t, s, k: k)))`，rowHoldX 在 638-656），點一下是 613 行的 onTapGesture。RowHold 在手指移動超過 10pt 時就失敗（RowHold.swift:20），之後沒有任何手勢接上下拖，所以在站卡上往上推面板一樣不動。「✨ 排順序／出發」（actions() 296-317，按鈕在 300、307）是一般 Button。站卡現在是 265-269 的 `if strip { cards(...) }`，往上拉過 40pt 時整排被拿掉。ListPullDown（PanelLift.swift:43-200）只掛在直的清單上，橫向 ScrollView 遇到直的拖曳不會開始，站卡上用不了。settleSheet（419-431）可以直接共用。

**修法**：

一樣不要在橫向 ScrollView 上掛 SwiftUI 的 simultaneousGesture(DragGesture)：9379b88 剛因為這種 SwiftUI 拖曳讓清單的 pan 開不了，把 listPull 拿掉。

(1) PanelLift.swift 檔尾，258 行 `#endif`（TouchSpy 的 DEBUG 區塊）後面新增，不要放進 #if DEBUG 裡：
```swift
// 最低段在站卡、按鈕上往上推也能拉面板（規格 A2：面板上緣 44pt 都能拉）。
// 橫向 ScrollView 遇到直的拖曳不會開始捲，ListPullDown 接不到，所以自己掛一個 UIKit pan，只在偏直的方向開始。
// 跟 RowHold 一樣不同時辨識：pan 一成立，還在等的長按、點一下都會失敗
struct PanelPan: UIGestureRecognizerRepresentable {
    var canBegin: () -> Bool
    var changed: (CGFloat) -> Void      // 往上為正
    var ended: (CGFloat) -> Void        // 預測會停的位移，往上為正

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let g = UIPanGestureRecognizer()
        g.delegate = context.coordinator
        context.coordinator.canBegin = canBegin
        return g
    }

    func updateUIGestureRecognizer(_ g: UIPanGestureRecognizer, context: Context) { context.coordinator.canBegin = canBegin }

    func handleUIGestureRecognizerAction(_ g: UIPanGestureRecognizer, context: Context) {
        let dy = g.translation(in: nil).y
        switch g.state {
        case .began, .changed: changed(-dy)
        case .ended: ended(-(dy + g.velocity(in: nil).y * 0.2))
        case .cancelled, .failed: ended(0)
        default: break
        }
    }

    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var canBegin: () -> Bool = { true }
        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            guard let p = g as? UIPanGestureRecognizer, canBegin() else { return false }
            let v = p.velocity(in: nil)
            return abs(v.y) > abs(v.x) * 1.3
        }
    }
}
```
0.2 秒的速度換算跟 ListPullDown（PanelLift.swift:186）一樣。makeCoordinator(converter:) 的寫法跟 RowHold.swift:15 相同，RowHold 已經編得過，名稱不用再擔心。

(2) TripPanel.swift。在 settleSheet 的註解（418）前面、同批 U20 的 pullChanged 旁邊加：
```swift
    // 最低段在站卡、按鈕上往上推：拉面板（見 PanelLift.swift 的 PanelPan）
    private var stripPan: PanelPan {
        PanelPan(canBegin: { drag.id == nil && !held.on && mode.level == .low && mode.cand == nil },
                 changed: { pullChanged($0) }, ended: { settleSheet($0) })
    }
```
pullChanged 是 U20 加的，所以 U20 要先做或同一個 commit 做。

(3) 站卡在最低段要一直掛著，PanelPan 掛在站卡這層。265-269 換成：
```swift
                if mode.level == .low {
                    cards(t, base: base, order: order, plan: plan)
                        .background(Color.bg)
                        .gesture(stripPan)
                        .opacity(strip ? 1 : 0)
                        .accessibilityHidden(!strip)
                        .transition(.opacity)
                }
```
272 行改成 `if !base.isEmpty { actions(t, base: base).gesture(stripPan) }`。

跟原修法不一樣的兩點。第一，原修法把 PanelPan 掛在整個 ZStack（225-270）上，ZStack 裡還有中段、最高段的直清單；8559c3d、9379b88 才剛因為清單上多掛一個手勢讓清單的 pan 開不了改了兩輪，這裡只掛在最低段才有的站卡和按鈕那排上，直清單上面完全沒有新的手勢。第二，原修法在站卡上加 `.allowsHitTesting(strip)`，往上過 40pt 時 strip 一翻成 false，手指還按著的那層就不能點，PanelPan 有機會被取消、面板彈回去。這裡拿掉它：站卡只在最低段掛著，拉的過程中變透明但手指本來就在上面，停到中段就整個拿掉，停回最低段 strip 又是 true，不需要擋。拉的過程中 level 還是 .low，站卡留著只是變透明，淡入淡出照舊吃 290 行的 `.animation(.snappy(duration: 0.25), value: strip)`。這也正好是 U20 選做交叉淡入需要的前提；兩項都做的話，上面那行 `.opacity(strip ? 1 : 0)` 換成 U20 的 `.modifier(PullFade(lift: lift, on: strip, out: true, range: 40))`。

canBegin 擋 drag.id 和 held.on：RowHold 的 began 先設 held.on（640），再由 begin() 設 drag.id，長按拿起一站以後就不會搶；也擋 mode.cand，加站卡開著時面板本來就 allowsHitTesting(false)（115），兩道保險。不要把起點列加回最低段。

備案：如果模擬器上在「出發」上往上推、放開後按鈕還是被觸發（SwiftUI 的 Button 沒有被 UIKit 判失敗），加一個不觀察的小物件 `final class PanStamp { var at: CFTimeInterval = 0 }` 和 `@State private var panStamp = PanStamp()`，stripPan 的 ended 改成 `{ panStamp.at = CACurrentMediaTime(); settleSheet($0) }`，300、307 兩顆按鈕的動作閉包開頭加 `guard CACurrentMediaTime() - panStamp.at > 0.3 else { return }`，613 行改成 `.onTapGesture { if drag.id == nil, !held.justEnded, CACurrentMediaTime() - panStamp.at > 0.3 { mode.tap(s.id) } }`。

**模擬器驗收**：行程模式最低段：在小站卡上往上推，面板跟著手指升起，過 40pt 換成清單（站卡淡出），放開停在中段；手指一路沒放開時面板不會中途彈回。在「✨ 排順序」「出發」上往上推也一樣，而且放開後按鈕不會被觸發、不會開始出發。往上推一點點（不到一段）放開，回到最低段而且還是站卡。
8559c3d 修好的不能壞：左右滑站卡照常捲動，面板不動；輕點站卡地圖照常飛到那站；長按站卡 0.35 秒拿起來左右拖換順序時，手指上下晃面板也不動，放開後順序正確。
中段和最高段時這個手勢不能啟動：從站卡中間上下拖照常捲清單（9379b88 修好的），清單捲到頂往下拉照常交給 ListPullDown 降段。
加站卡開著時，在卡片下方往上推也不能動到面板。地圖上點號碼時站卡那排照常自動捲到那站（628-631）。

**注意**：同批 U20：共用 pullChanged、settleSheet，同一個 commit 做；本項第 (3) 點是 U20 選做交叉淡入的前提，兩項都做時站卡的透明度用 U20 的 PullFade。
第 6 批 U80：也在 PanelLift.swift 檔尾加 ScrollFinder、在 cards() 的 HStack（624 行的 padding 後面）掛 `.background(ScrollFinder(box: stripBox))`，跟本項的 PanelPan 和 265-272 不同行；本項讓 cards 在最低段拉的過程中一直掛著，對 ScrollFinder 沒有影響。
第 6 批 U79：改 cards() 裡 628-631 的 onChange(of: mode.hot)，本項不動那段；站卡停到中段時照舊被拿掉，回到最低段時 U79 的 initial 那次照樣捲到那站。
第 6 批 U81：PanelPan 也叫 pullChanged，所以從站卡、按鈕往上推過 40pt 時結果框一樣會淡出，U81 驗收可以加這一條。
同批 U19：MiniStop 的 accessibilityActions 掛在 cards() 裡 614 行後面，本項改的是 cards() 外面的 265-272，不衝突。
fix-v11-acd4471.md 已經在 8559c3d 進了：RowHold 的 delegate 對 shouldRecognizeSimultaneously 回傳 false（RowHold.swift:47），PanelPan 也不同時，兩個互斥（0.35 秒內先往上推，pan 先成立、長按失敗；長按先成立，held.on 和 drag.id 讓 canBegin 回傳 false），兩邊都不要改成同時。fix-addcard-ec71aa2.md 的 overlay ZStack（106-127）本項不碰。perf-round1b.md 沒有重疊。

### U22（P2・體驗）加完一站，地圖整個跳回全天、面板升到中間，連續加站要一直重找（部分已修，下面只寫剩下的）

**畫面**：行程模式・點收藏圖釘 → 加站卡 →「加進行程」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：add() 把最低段升到中間段（:745）。fitKey 一變（:136），地圖就 0.5 秒縮回框住整天。剛逛到的那一區被拉遠，一次加站鏡頭來回兩次。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：站卡那排自己捲到新站已經在 a45ce70 做好：TripPanel.swift:599 的 ScrollViewReader、610 的 .id(s.id)、628-631 看 mode.hot 在 80ms 後 scrollTo 置中，add() 在 856 設 mode.hot = s.id。另外兩點到 3fc00de 都還在。第一，857 行還是 `if mode.level == .low && !mode.searchOn { mode.level = .mid }`，最低段加完一站面板照樣升到中間段，接著 167-171 的 onChange(of: mode.level) 又跑一次 fit()。第二，881 行的 fitKey 還是「天＋這天所有站 id」，153 行一變就 fit()，加站、換順序都把鏡頭拉回整天；搜尋中走 fit()（893-933）裡 895 開始那條，改框搜尋結果加這天的站。855 行搜尋中加站後 folded = true 只收結果框，186 行的 onChange(of: resultKey) 遇到「路線附近」結果跟著路線變時照樣重框。
最近的 commit 有兩個會碰到這裡的判斷。e7af2e1 讓刪站的訊息條停 6 秒、等訊息條收起才真的送出刪除（Trip.swift:535-556）：站是立刻從 stops 拿掉（538），按「復原」時再 append 回來（543），刪除失敗也會加回來（554）。3fc00de 加了拿掉一天（TripTop.swift:175-198 的 removeDay）：拿掉第 1 天時第 2 天的站併進第 1 天，mode.day 還是 1，fitKey 的天沒變、站只多不少；拿掉第 2 天以後的，mode.day 換成前一天。
「加到第 N 站」訊息條在 846-849，MiniStop 吃 hot 高亮在 609，都已經有了。

**修法**：

站卡那排捲到新站已經在 a45ce70 做掉，原本第 (3) 段不用做。剩下三件，第 (2) 點因為 3fc00de 的拿掉一天要補條件，第 (3) 點補一個 onChange。

(1) 加完一站面板不要升段。刪掉 TripPanel.swift:857 那一行，852-858 變成：
```swift
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            mode.cand = nil
            // 從搜尋結果加的：結果框不再冒出來蓋住地圖（地圖上的結果還在，點搜尋框或換分類再打開）
            if mode.searchOn { mode.folded = true }
            mode.hot = s.id
        }
```
859 的 scrollTo 不動。空檔推薦加站時 851 行會先 clearSearch()，TripTop.swift:49-52 的 onChange(of: mode.searchOn) 照樣把面板放回中段、167-171 框整天，這是「空檔推薦用完就收起搜尋」的原本設計，不用動。

(2) 加站、換順序時鏡頭不跳。先把 881 行的 fitKey 改成把天數也放進去：
```swift
    private func fitKey(_ t: Trip, _ d: Int, _ base: [TripStop]) -> String { "\(d)/\(t.days)|" + base.map(\.id).joined(separator: ",") }
```
然後 152-153 這兩行：
```swift
        // 換天、加站、刪站：地圖 0.5 秒縮放到包住這天所有站
        .onChange(of: fitKey(d, base)) { fit(base, origin: origin, animated: true) }
```
換成：
```swift
        // 換天、刪站、移到別天、加減天數：0.5 秒框住這天。只多一站（加站、刪站後按復原）或只換順序：鏡頭不動，新站跑出畫面才小移一下
        .onChange(of: fitKey(t, d, base)) { old, new in
            let o = old.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
            let n = new.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
            let ids = { (p: [Substring]) -> [Substring] in p.count > 1 ? p[1].split(separator: ",") : [] }
            let oi = ids(o), ni = ids(n)
            if o.first == n.first && ni.count <= oi.count + 1 && Set(oi).isSubset(of: Set(ni)) {
                if let nid = ni.first(where: { !oi.contains($0) }) { panToNew(base.first { $0.id == String(nid) }?.coord) }
                return
            }
            fit(base, origin: origin, animated: true)
        }
```
跟原修法的差別有兩個。第一，fitKey 多了 t.days：3fc00de 的 removeDay 拿掉第 1 天時，第 2 天的站併進第 1 天，mode.day 還是 1，舊的站全部還在、只多不少，照原規則只會小移到其中一站，不會框整天；天數放進 key 以後，拿掉一天、加一天都會框整天。第二，多加 `ni.count <= oi.count + 1`：一次多出兩站以上（60-67 每 20 秒重讀行程時別人一口氣加了好幾站）就框整天，只有多一站才小移。判斷看的是「多出來的那站」不是 mode.hot，因為 20 秒重讀時 hot 可能是很久以前點的站。fitKey 只有 153 這一個地方在叫，簽名改了不會影響別處。

接著在 fitCoords 結束的那個 `}`（997）後面、flyTo 的註解（999）前面加 panToNew。名字不要叫 nudge：同批 U19 在 TripPanel 已經用 nudge(_:_:by:) 做 VoiceOver 換順序，兩個意思不同的多載容易改錯。
```swift
    // 新加的站不在看得到的那塊（上面那排、🔍 下面到面板上緣之間）：只平移到剛好看得到，不改縮放
    private func panToNew(_ c: CLLocationCoordinate2D?) {
        guard let c, !mode.going, let p = mode.toScreen?(c), let r = store.mapRegion else { return }
        let top = max(top0, mode.barBottom) + 12 + (mode.searchOn ? TripFind.height : 0) + 64   // 64：圖釘頭的高度
        let bot = top0 + size.height - settledHeight() - 24
        let w = MapTab.mapWidth
        guard bot > top else { return }
        let dy = p.y < top ? p.y - top : p.y > bot ? p.y - bot : 0
        let dx = p.x < 24 ? p.x - 24 : p.x > w - 24 ? p.x - (w - 24) : 0
        guard dy != 0 || dx != 0 else { return }
        let ft = Double(mode.mapBottom > mode.mapTop ? mode.mapTop : top0)
        let fb = Double(mode.mapBottom > mode.mapTop ? mode.mapBottom : top0 + size.height)
        var r2 = r
        r2.center.latitude -= Double(dy) / ((fb - ft) / r.span.latitudeDelta)
        r2.center.longitude += Double(dx) / (Double(w) / r.span.longitudeDelta)
        Perf.shared.mark("加站小移")
        withAnimation(.easeInOut(duration: 0.35)) { pos = .region(r2) }
    }
```
mode.toScreen、barBottom、mapTop、mapBottom 在 TripMode.swift:61-65，store.mapRegion 在 Store.swift:118，TripFind.height 在 TripTop.swift:276，MapTab.mapWidth 在 MapTab.swift:702，名字都對過 3fc00de。panToNew 被呼叫時 add() 已經在同一輪把 cand 設成 nil，面板也停在原本那段，所以 settledHeight() 是對的。

(3) 搜尋分類是「路線附近」時，加站會改路線、結果跟著變，186 行的 onChange(of: resultKey) 照樣 fit()，鏡頭一樣跳。186 行換成：
```swift
        .onChange(of: resultKey) {
            // 剛從結果加了一站（結果框收著）：路線變了結果跟著變，鏡頭不跟著重框
            guard !mode.folded else { return }
            fit(base, origin: origin, animated: true)
        }
        // 點搜尋框把收著的結果框打開：結果沒變也框一次，結果才不會被結果框蓋住
        .onChange(of: mode.folded) { _, f in if !f { fit(base, origin: origin, animated: true) } }
```
第二個 onChange 是這次新加的。原修法說點搜尋框時 folded 變回 false、resultKey 同一輪改變，所以會框；但點搜尋框（TripTop.swift:293）只把 folded 設回 false，結果沒變，resultKey 不會動，原本的驗收「再點一下搜尋框，這時才框一次」會過不了。換分類（TripTop.swift:333）時 folded 和結果都會變，兩個 onChange 各叫一次 fit()，算出來的範圍一樣，後面那次蓋掉前面，看起來是一次。fit() 開頭擋了 mode.cand == nil，點搜尋框時 cand 已經清成 nil。clearSearch（TripMode.swift:116-120）也會把 folded 設回 false，那時搜尋已經收起，fit() 走框這天的站，跟 TripTop.swift:49-52 升段後 167-171 那次是同一個範圍。

附帶的行為改變要知道：拖站換順序、按「✨ 排順序」也不再框整天，因為站沒變少；排順序前後站一樣，範圍本來就一樣。按加站訊息條的「復原」是站變少，會框整天；刪站後按「復原」是多一站，只會在畫面外時小移。

**模擬器驗收**：用測試行程，面板放在最低段，地圖放大到某一區。
(1) 連續點兩根測試收藏，每次按「加進行程」。確認面板留在最低段，地圖不會縮回整天（浮層不出現「框地圖修正」；新站在畫面外才出現「加站小移」），站卡那排自己捲到新站而且新站亮起來，「加到第 N 站」訊息條貼在面板上緣。
(2) 按 🔍 選「路線附近」，從結果加一站，確認鏡頭不跳、結果框收著；再點一下搜尋框，結果框打開，這時框一次。
(3) 長按站卡拖換順序（中段清單和最低段小卡都試），確認鏡頭不動。
(4) 換天、左滑刪一站，確認這兩種還是 0.5 秒框住整天；刪完 6 秒內按「復原」，鏡頭不重框，那站在畫面外才出現「加站小移」。
(5) 加完一站馬上按訊息條的「復原」，確認 0.5 秒框住整天。
(6) 三天的行程，第 1 天和第 2 天都有站，從「第 1 天 ▾」選「拿掉第 1 天」並確認，地圖 0.5 秒框住合併後的第 1 天；再到第 2 天選「拿掉第 2 天」，跳到第 1 天時也框整天。
(7) 從空檔推薦加一站，確認照原本設計收起搜尋、面板回中段。

**注意**：同批 U19：U19 在 TripPanel 加 nudge(_:_:by:)，這裡的小移函式叫 panToNew，不要再用 nudge。
同批 U28：如果把 add() 搬進 TripMode（addCand），857 那行升段不要跟著搬，搬過去的版本一樣要設 hot（站卡捲動靠它）；第 6 批 U82 照第 5 批合4 的寫法改在 TripMode 上。
第 6 批 U79：改 628-631 那個捲動的 onChange（改成看 hot 和 fly、加 initial），這裡靠它把站卡那排捲到新站，add() 照樣設 hot 就會觸發；這裡第 (1) 點讓面板留在最低段，站卡那排才看得到捲動。
第 6 批 U81：改 fit() 搜尋那條的 top（3fc00de 的 905）和 heights()（201-205），這裡改 152-153、186、881 和加 panToNew，不同行；panToNew 用 settledHeight()，U81 只改最高段的高度，最低段加站不受影響。
第 5 批合12 已經說明：U79、U81 是第 6 批，不是同一批。
fix-v11-acd4471.md 已經在 8559c3d 進了，154-158 的 fitTick onChange 現在用 held.on，就在這裡改的 152-153 下面，不同行；RowHold 放下時一樣走 drop()，站數不變，第 (2) 點不框整天。perf-round1b.md 沒有改到同樣的地方。fix-addcard-ec71aa2.md 已經進了，add() 在 844 已經記「加站」，不用再加量測。

### U23（P2・體驗）「到了 ✓」按錯沒辦法復原，也不能跳過這站

**畫面**：行程模式・出發（上方下一站卡片）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：「到了」按下就寫入 done_at、卡片滑到下一站，沒有訊息條也沒有復原。整個 App 也沒有單站「改回沒到」的地方。店沒開、想跳過時只能按「到了」，下一站時還會被問「剛吃完 X，好吃嗎？」。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：還沒修。5d713ac、d95fd43 都沒碰出發這塊；ec71aa2 之後 TripGo.swift 完全沒改。TripPanel.swift:1236-1248 的 arrive() 還是直接寫 done_at，沒有 store.say，也沒有復原；整個 App 只有 TripPanel.swift:1108（startGo 的 again，全部到過再出發）會清 done_at。GoCard 的「到了 ✓」在 TripGo.swift:84-91，沒有 contextMenu，GoCard 也只有 nav／arrived／close 三個 closure（TripGo.swift:40-42）；TripAsked（TripGo.swift:21-30）還是只有 has、add，沒有 remove。呼叫 GoCard 的地方在 TripPanel.swift:1194-1203（arrived 在 :1201），進度點在 :1197，「今天吃了 N 間」的 eaten 在 :1069。訊息條位置：5d713ac 把 FoodMapApp.swift:119-122 改成行程模式用 tripPad（:120），可是 onTrip（:119）要 !going，出發時還是走 :122 最後一段；行程模式 barHidden 是 true（Store.swift:72），bottomBar 平常是 0（PlaceDetail.swift:59 離開店家頁就歸零），所以 pad 是 96，訊息條在下面，不會被上面的 GoCard 蓋到。真正會撞的是下面的評分卡：goBottom 在 TripPanel.swift:1270-1281，RateCard 在 :1272-1279，到了的時候 askAbout（:1251-1255）常常會把它叫出來。

**修法**：

(1) 事後復原。TripPanel.swift:1236-1248 的 arrive() 整段換成下面兩個函式：
```swift
private func arrive(_ t: Trip, _ order: [TripStop], _ s: TripStop) {
    Haptic.success()
    Perf.shared.mark("到了")
    let oldRate = rate, oldFinished = finished
    var x = s; x.done_at = ISO8601DateFormatter().string(from: Date())
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { trips.update(x, store: store) }
    askAbout(before: s, order)
    // 最後一站：撒糖粒，也問最後那間好不好吃
    if order.allSatisfy({ $0.id == s.id || $0.done_at != nil }) {
        if s.isPlace { ask(s) }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { finished = true }
        party += 1
    }
    store.say("到了 \(s.name)", icon: .check, action: ("復原", { undoArrive(s, oldRate: oldRate, oldFinished: oldFinished) }))
}

// 「到了」「跳過」的復原：清掉 done_at，評分卡和完成卡放回按之前的樣子
private func undoArrive(_ s: TripStop, oldRate: String?, oldFinished: Bool, skipped: Bool = false, wasAsked: Bool = true) {
    Perf.shared.mark("復原到了")
    guard var y = TripStore.shared.stops.first(where: { $0.id == s.id }), y.done_at != nil else { store.toast = nil; return }
    y.done_at = nil
    if skipped { TripSkipped.remove(s.id); if !wasAsked { TripAsked.remove(s.id) } }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
        TripStore.shared.update(y, store: store)
        // 已經按「結束」離開出發（endGo 把 finished、rate 清掉了）就不要放回去，不然下次出發一開始就冒出評分卡
        if mode.going { finished = oldFinished; rate = oldRate }
    }
    pinged = nil
    store.toast = nil
}
```
跟原本修法的差別：rate 還是放回按之前的值，不直接設 nil，這樣原本開著的評分卡（例如按「導航到這站」時問的上一間）不會被一起關掉；party 不用倒扣。新加的是 `if mode.going`：使用者按了「到了」再按 GoCard 的「結束」，endGo()（TripPanel.swift:1127-1131）已經把 finished 設 false、rate 設 nil，這時復原只清 done_at，不把 rate 塞回去，理由跟第 6 批 U128 的 rated() 復原一樣。找不到那站（例如行程在這期間被刪了）時也把訊息條收掉，不會按了沒反應。最後一站時 DoneCard 會蓋滿畫面，但訊息條在 Root 的 overlay，疊在 DoneCard 上面按得到。

(2) 跳過這站（含第 5 批合5）。
- TripGo.swift:29（TripAsked.add 的右大括號）後面加：
```swift
    static func remove(_ id: String) {
        var l = UserDefaults.standard.stringArray(forKey: key) ?? []
        l.removeAll { $0 == id }
        UserDefaults.standard.set(l, forKey: key)
    }
```
第 6 批 U128 第 (1) 點就跳過，直接用這個 remove，不然會重複宣告。
- TripGo.swift:30（TripAsked 的右大括號）後面加：
```swift

// 出發時跳過的站（有 done_at 但沒去）：不算進「今天吃了 N 間」
enum TripSkipped {
    private static let key = "tripSkipped"
    static func has(_ id: String) -> Bool { (UserDefaults.standard.stringArray(forKey: key) ?? []).contains(id) }
    static func add(_ id: String) {
        var l = UserDefaults.standard.stringArray(forKey: key) ?? []
        guard !l.contains(id) else { return }
        l.append(id)
        UserDefaults.standard.set(Array(l.suffix(300)), forKey: key)
    }
    static func remove(_ id: String) {
        var l = UserDefaults.standard.stringArray(forKey: key) ?? []
        l.removeAll { $0 == id }
        UserDefaults.standard.set(l, forKey: key)
    }
}
```
- GoCard：TripGo.swift:41 `let arrived: () -> Void` 下面加 `let skip: () -> Void`。「到了 ✓」那顆的最後一個修飾 TripGo.swift:91（`.onChange(of: near, initial: true) { _, v in pulse = v }`）後面加：
```swift
                .contextMenu { Button("跳過這站", systemImage: "forward.end") { skip() } }
                .accessibilityAction(named: "跳過這站") { skip() }
```
- TripPanel.swift:1201 `arrived: { arrive(t, order, next) },` 下面加 `skip: { skip(t, order, next) },`。
- 在 (1) 的 undoArrive 後面加：
```swift
// 跳過這站（店沒開、不想去）：跟「到了」一樣往下一站，但不問這間好不好吃、不算進吃了幾間
private func skip(_ t: Trip, _ order: [TripStop], _ s: TripStop) {
    Haptic.light()
    Perf.shared.mark("跳過")
    let oldRate = rate, oldFinished = finished, wasAsked = TripAsked.has(s.id)
    TripAsked.add(s.id); TripSkipped.add(s.id)
    var x = s; x.done_at = ISO8601DateFormatter().string(from: Date())
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { trips.update(x, store: store) }
    askAbout(before: s, order)
    // 最後一站：跟 arrive() 一樣在同一個動作裡設 finished（U24 的保險才不會先 endGo），只是不問這間
    if order.allSatisfy({ $0.id == s.id || $0.done_at != nil }) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { finished = true }
        party += 1
    }
    store.say("跳過 \(s.name)", icon: .check, action: ("復原", { undoArrive(s, oldRate: oldRate, oldFinished: oldFinished, skipped: true, wasAsked: wasAsked) }))
}
```
合5 說的「復原時 TripAsked.remove」這裡改成只在跳過前沒問過時才拿掉（wasAsked），避免把之前真的評過的那站又放回去問一次。
- TripPanel.swift:1069 的 eaten 改成 `let eaten = order.filter { $0.isPlace && $0.done_at != nil && !TripSkipped.has($0.id) }.count`。
- TripPanel.swift:1108（startGo 的 again，全部到過再出發）的迴圈改成 `for s in base { var x = s; x.done_at = nil; TripSkipped.remove(s.id); trips.update(x, store: store) }`，原本修法漏了這點：不清的話，上一輪跳過、這一輪真的去吃的那間，「今天吃了 N 間」還是不算它。進度點（TripPanel.swift:1197）維持看 done_at，跳過的站也算走過了。

(3) 訊息條不要壓到下面的評分卡。
- TripMode.swift:35（panelH）下面加 `var goInset: CGFloat = 0          // 出發時下面評分卡上緣到安全區底的距離（訊息條貼在它上面）`。
- MapTab.swift:708（windowHeight 的右大括號）後面加：
```swift

    static var safeBottom: CGFloat {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.safeAreaInsets.bottom }.first ?? 0
    }
```
- TripPanel.swift:1279（RateCard 的 `.transition(.move(edge: .bottom).combined(with: .opacity))`）後面加：
```swift
            .onGeometryChange(for: CGFloat.self) { MapTab.windowHeight - $0.frame(in: .global).minY } action: { mode.goInset = max(0, $0 - MapTab.safeBottom) }
            .onDisappear { mode.goInset = 0 }
```
扣掉 safeBottom 是因為 Root 的訊息條 overlay 是從安全區底往上算 padding，原本修法提醒的「差一個 home indicator 高度」這樣就對齊了。
- FoodMapApp.swift:120（5d713ac 加的 tripPad）下面加一行 `let onGo = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.going`，:122 改成：
```swift
                let pad: CGFloat = onMap ? store.panelTop + 8 : onTrip ? tripPad : onGo ? max(24, TripMode.shared.goInset + 8) : (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
```
原本修法和第 5 批合6 寫的 onTrip 分支是 `min(TripMode.shared.panelH, 420) + 8`，那是 3fc00de 的寫法，5d713ac 已經換成 tripPad，一定要留 tripPad，不然面板最高段時訊息條又會浮回清單中間。如果第 5 批 U60 先做、這段換成 ToastBar，onGo 那行和 pad 這行照樣放在 ToastBar 前面，pad 傳給 ToastBar 的 bottom。

**模擬器驗收**：用測試行程出發。1. 按「到了 ✓」，底下出現「到了 店名」訊息條；按「復原」後卡片滑回這站、地圖號碼恢復、進度點變回空心。2. 到第二站按「到了」，跳出評分卡時，訊息條要在評分卡上面，沒有壓到星星和 ✕；按復原後評分卡維持按之前的樣子。在沒有評分卡的站按「到了」，訊息條貼在底部安全區上方約 24pt。3. 最後一站按「到了」出現撒糖粒的完成卡，從訊息條按復原，完成卡收掉、回到最後一站的出發卡，沒有被 U24 的保險直接結束出發。4. 按「到了」後馬上按出發卡的「結束」，訊息條移到行程面板上緣（面板在最高段時在面板最上面那條）；這時按「復原」，那站變回沒到，但再按「出發」時一開始不能冒出評分卡。5. 長按「到了 ✓」選「跳過這站」，訊息條寫「跳過 店名」；到下一站按「到了」時不會問「剛吃完 X，好吃嗎？」；走完後「今天吃了 N 間」不含跳過的那間。6. 跳過一站再按復原，之後真的按「到了」走過它，到下一站時要問這間好不好吃。7. 在最後一站選「跳過這站」，照樣出現完成卡。8. 全部到過再出發一次（again），之前跳過、這次按「到了」的那間要算進「今天吃了 N 間」。9. 開 VoiceOver，在「到了 ✓」上用動作選單找得到「跳過這站」。

**注意**：第 5 批合5、U24：TripAsked.remove 只在這裡加一次，第 6 批 U128 第 (1) 點跳過；skip() 在最後一站在同一個動作裡設 finished、party，U24 的 `.onChange(of: next == nil)` 不會誤觸；復原讓 next 變回非 nil 也不會觸發它。U24 改的是 TripGo.swift:52-53、:59，這裡改 :29-30、:41、:91，同一個 struct 不同行。第 6 批 U128 的 rated() 復原也寫 `if mode.going` 才放回 rate，兩邊一致；兩條訊息條先後出現時只會留最新那條。第 5 批合6、U60、第 7 批 U136、第 9 批 U96、第 10 批 U107：都改 FoodMapApp.swift 訊息條那段。pad 那行要用 5d713ac 的 tripPad（FoodMapApp.swift:120），合6 和 U60 第 (3) 點寫的 `min(TripMode.shared.panelH, 420) + 8` 已經過時；U136 只換 onMap 那段 `store.panelTop + 8`，不要整行覆寫，不然 onGo 分支會不見。跟 5d713ac：tripPad 只在 !going 時用，出發中不受影響；但「到了」或「跳過」的訊息條還在時按「結束」，訊息條會動畫移到 tripPad 的位置（面板最高段時在面板最上面那條），復原照樣按得到，不會壓在站卡的垃圾桶上。站卡左滑停在露出垃圾桶的新行為只在排行程時有，出發中看不到站卡清單，不衝突。跟 d95fd43：從「我的行程」刪掉正在排的行程會先 mode.close()（going 變 false），那時「已刪除」的訊息條會蓋掉「到了」那條；就算按得到舊的復原，undoArrive 找不到站也只會收掉訊息條。fix-addcard-ec71aa2.md 不碰出發，沒有重疊。剪貼簿膠囊在 TripMode.on 時本來就不出來，pad 加分支不影響它。

### U24（P2・體驗）出發中上面同時有橘色「完成」和卡片上的「結束」，按錯就整個離開行程

**畫面**：行程模式・出發

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：出發時標題列照樣有大顆橘色「完成」，會關掉整個行程模式；下面 GoCard 右上又有灰色小字「結束」，只結束出發。誤按「完成」會跳過最後的完成卡和評分；資料不會掉。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：最近 8 個 commit 都沒有碰到這件事。3fc00de 的 TripTop.swift:25-27 橘色「完成」還是沒有條件地顯示，只有 TripTop.swift:24 的 🔍 有 `!mode.going`。3fc00de 在 TripTop 加的是拿掉一天（TripTop.swift:17 的 dropDay、:66-73 的 confirmationDialog、:147-152 選單項目、:175-198 removeDay），跟標題列的「完成」無關。TripGo.swift 從 ec71aa2 到 3fc00de 完全沒改，GoCard 的「結束」在 TripGo.swift:51-57：caption、ink 0.55、膠囊 26 高，點擊範圍已經是 TripGo.swift:54 的 minWidth 44、minHeight 44，那排外框是 TripGo.swift:59 的 `.frame(height: 28)`。出發卡在 TripPanel.swift:126-129 是 `if mode.going, let next` 才出來，next 在 TripPanel.swift:101；endGo 在 TripPanel.swift:1126-1130；arrive() 在 TripPanel.swift:1235-1247，最後一站時 :1244 在同一個動作裡設 finished = true、:1245 party += 1；goMods 在 TripPanel.swift:1067-1100，最後一個修飾是 :1095-1099 的 confirmationDialog。TripTop 掛在 MapTab.swift:309-314 的 safeAreaInset 裡，結構沒變。

**修法**：

(1) 一定要做，可以單獨先做。

TripTop.swift:25-27 這三行換成出發時不顯示：
```swift
if !mode.going {
    Button { mode.close() } label: { Text("完成").frame(minHeight: 50) }
        .buttonStyle(ChunkyStyle(radius: 16))
        .accessibilityLabel("完成，回到地圖")
        .transition(.opacity)
}
```
在 TripTop.swift:30 的 `.padding(.top, 6)` 後面加一行 `.animation(.snappy(duration: 0.25), value: mode.going)`，這樣 :24 的 🔍、:128 的「第 N 天 ▾」和「完成」會一起淡出淡入。

GoCard 的「結束」只改外觀，TripGo.swift:54 的點擊範圍那行保留。TripGo.swift:52-53 換成：
```swift
Text("結束").font(.subheadline.weight(.heavy)).foregroundStyle(Color.ink.opacity(0.75))
    .padding(.horizontal, 14).frame(height: 32).background(Color.ink.opacity(0.08), in: .capsule)
```
TripGo.swift:59 那排的 `.frame(height: 28)` 改成 `.frame(height: 32)`，膠囊才不會凸出去。

拿掉「完成」之後要補一個保險：出發中如果 next 變成 nil 但 finished 還是 false（群組裡別人刪了剩下的站、另一台裝置把站都標成到了），TripPanel.swift:127 的出發卡不會出來，畫面上就沒有任何出口。在 TripPanel.swift:1099（goMods 裡 confirmationDialog 的右大括號）後面、:1100 goMods 結尾的右大括號前面加：
```swift
            // 出發中沒有下一站了（別人刪了站、別台裝置都標成到了），又不是自己按到最後一站：收掉出發，回到排行程
            .onChange(of: next == nil) { _, none in
                if none, mode.going, !finished { endGo() }
            }
```
自己按到最後一站時，arrive() 在 TripPanel.swift:1239 更新站、:1244 設 finished = true，都在同一個動作裡，onChange 跑的時候 finished 已經是 true，不會誤觸。

跟同批 U23 的合併（第 5 批合5）：U23 會加 skip()（跳過這站）。如果 U23 先做或後做，它的 skip() 在最後一站一定要照 arrive() 的 TripPanel.swift:1242-1246 寫，在同一個動作裡設 `finished = true`、`party += 1`，只是不呼叫 ask(s)；不然跳過最後一站時 next 變 nil、finished 還是 false，這裡的保險會直接 endGo，使用者看不到完成卡。U23 要加的 TripAsked.remove 放在 TripGo.swift:29 後面（TripGo.swift 沒變，行號照舊），第 6 批 U128 第 (1) 點就跳過不要再加一次。

跟同批 U61 的合併（第 5 批）：程式不用改，但 U61 驗收 (6)「出發中按『完成』離開行程再進來出發」做完這項就沒辦法照做。改成：出發中從行程膠囊選單「換行程」切到別的行程再切回來出發，一開始也不能有「跟著我」鈕。TripMode.open() 換行程時在 TripMode.swift:83 把 going 設成 false，結果一樣。注意 3fc00de 還沒有 offFollow，U61 本身還沒做。

(2) 想省垂直空間再做，內容不變：不要用 if 把整個 TripTop 拿掉，因為它身上掛著 barBottom 量測（TripTop.swift:32）、搜尋和路線的 task（:33-42）、鍵盤通知（:45-47）、搜尋收起和結果的 onChange（:49-56）、改名 alert（:57-64）、設定 sheet（:65）和 3fc00de 新加的拿掉一天確認框（:66-73）。改成出發時內容高度 0、opacity 0、allowsHitTesting(false)。膠囊選單裡的「分享」（TripTop.swift:100）出發時要另外留入口，例如放進 GoCard「結束」的旁邊。

**模擬器驗收**：在測試行程按「出發」，確認上方沒有橘色「完成」，🔍 和「第 N 天 ▾」也不在，只剩出發卡右上的「結束」膠囊，字比以前大、看得清楚，點膠囊邊緣也按得到。按「結束」後「完成」、🔍、「第 N 天 ▾」一起淡入回來。再出發一次，用另一台裝置（或直接改資料）把剩下還沒到的站刪掉，等行程面板 20 秒重讀一次，確認畫面自己回到排行程，不會卡在沒有出口的出發畫面。最後一次出發把每站都按「到了」，確認最後一站照樣出現完成卡和糖粒，沒有被保險提早收掉。如果 U23 已經做了，再測一次在最後一站按「跳過」，也要看到完成卡。

**注意**：跟同批（第 5 批）U23 都改 GoCard（TripGo.swift:33-98）：U23 加 skip 參數和「到了」的 contextMenu，這裡改 :52-53 和 :59，同一個檔案不同行，一起改時注意合併；U23 的 skip() 在最後一站要設 finished，寫法見 fix。跟第 6 批 U128 透過 U23 相關（TripAsked.remove 只加一次）。U128 和第 10 批 U131 也改 goMods 裡 DoneCard 那塊（TripPanel.swift:1073-1086），這裡加在 :1099 後面，不重疊。跟同批 U61 只差驗收步驟，見 fix。跟同批 U25 同一個檔案 TripTop.swift，這裡改 :25-30，U25 改 :118，不衝突；做 (2) 把 TripTop 收成 0 高時，U25 加的記號出發時也一起看不到，這是預期的。跟同批 U27 也在 TripTop.swift，但 3fc00de 已經做了拿掉一天（:66-73、:147-152、:175-198），U27 剩下的只改 :200-206，不衝突。跟第 10 批 U121 改膠囊的按壓效果（:110-114 的 Menu、:132 的 frame），不重疊。

### U25（P2・體驗）行程膠囊點了有選單，卻沒有任何「可以點」的記號

**畫面**：行程模式・上方深色行程膠囊

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：build 20 有 chevron.down，build 22 改成一排後拿掉了。設定、改名、分享、換行程、刪除全藏在點行程名這個沒有記號的地方，換行程只有這一條路。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：最近 8 個 commit 都沒有碰到膠囊上的記號。3fc00de 只在 dayMenu 加了「拿掉第 N 天」（TripTop.swift:147-152），還有拿掉一天的確認框（:66-73）。膠囊本身在 TripTop.swift:108-133：:110-113 的 Menu 只有一條深色 Capsule 當 label，:114 的 accessibilityLabel 已經寫了「行程選單」；名字和摘要在 :117-126 那個 `.allowsHitTesting(false).accessibilityHidden(true)` 的 VStack 裡，:118 還是只有 `Text(t.title)`，沒有任何看得出可以點的記號。設定、改名、分享、換行程、刪除照樣只有 :97-105 的 tripMenu 這一個入口。右邊「第 N 天 ▾」在 :128，用的是 chevron.down（:156）。

**修法**：

把 TripTop.swift:118 那一行（`Text(t.title).font(.system(size: 15, weight: .heavy)).foregroundStyle(.white).lineLimit(1)`）換成下面的 HStack，其他不動：
```swift
HStack(spacing: 4) {
    Text(t.title).font(.system(size: 15, weight: .heavy)).foregroundStyle(.white)
        .lineLimit(1).layoutPriority(1)
    // 這顆膠囊點了有選單（設定、改名、分享、換行程）：給一個看得出可以點的記號。
    // 用 ellipsis 不用 chevron，免得跟右邊「第 N 天 ▾」搞混
    Image(systemName: "ellipsis.circle.fill").font(.system(size: 12, weight: .bold))
        .foregroundStyle(.white.opacity(0.5)).fixedSize()
}
```
外層 VStack（TripTop.swift:117）已經在 :126 有 `.allowsHitTesting(false).accessibilityHidden(true)`，點到記號會落到底下 :110 的 Menu；VoiceOver 的說法已經在 :114 寫了「行程選單」，不用另外加。這項不用等別項。

**模擬器驗收**：用一個很長名字的測試行程（例如 30 個字），打開後確認名字被截成「…」但後面的 ⋯ 記號還在、右邊「第 N 天 ▾」也沒被擠掉，下面一行摘要照常。點名字、點記號、點膠囊空白處都會開行程選單（行程設定、改名稱、分享、換行程、刪除行程）；點「第 N 天 ▾」開的是換天選單（各天、＋ 加一天、多天時有「拿掉第 N 天」）。出發後膠囊照樣有記號，點了一樣開行程選單。

**注意**：跟同批（第 5 批）U24、U27 同一個檔案：U24 改 TripTop.swift:25-30，U27 剩下的只改 :200-206 的 addDay，這裡只改 :118，彼此不衝突。跟第 10 批 U121 都動行程膠囊：U121 在 :110-114 的 Menu 加按壓樣式、在 :132 的 `.frame(maxWidth: .infinity)` 後面加 scaleEffect，這裡改的是 :118 的文字，不重疊；兩項都做時按住膠囊，名字和 ⋯ 記號會一起縮，是想要的樣子。

### U26（P2・體驗）「行程」直接進上次打開的行程，上個月過期的也一樣

**畫面**：地圖首頁 → 右邊「行程」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：openTrip() 只檢查 lastOpened 還存在就直接 open。想排新行程的人一按就掉進舊行程。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：最近 8 個 commit 改了 MapTab 很多地方，但 openTrip() 本身沒變，只是又往下移到 MapTab.swift:724-731：lastOpened 的行程還在就直接 trip.open（:726），不看有沒有過期。按鈕在 MapTab.swift:372，上面 :371 的註解寫「上次打開的行程直接進行程模式」。Trip.swift:21 的 end、Trip.swift:148 的 TripDate.today 都還在。「加進行程」的預設行程是 Trip.swift:598-607 的 addPlace，靠 :601 的 active；active 在 Trip.swift:333-339，:337 讀 lastOpened 時已經會用 live() 濾掉過期的，所以過期時不清 lastOpened 也不會讓加進行程加錯。changed_regions 列的 acd4471 MapTab:599-607、670-677 跟 openTrip 無關。

**修法**：

MapTab.swift:724-731 的 openTrip() 換成只補過期這個缺口，不要換成 tripStore.active：
```swift
private func openTrip() {
    if let last = tripStore.lastOpened {
        if let t = tripStore.trip(last) {
            // 上次打開的還沒結束：直接進；已經過期（上個月的）就打開「我的行程」讓人挑或開新的
            if (t.end ?? .distantFuture) >= TripDate.today { trip.open(last, store: store); return }
        } else {
            tripStore.lastOpened = nil
        }
    }
    Perf.shared.mark("我的行程")
    trip.listing = true
}
```
MapTab.swift:371 的註解順手改成「行程：上次打開的行程還沒過期就直接進行程模式；過期或沒有就開『我的行程』」。

過期時 lastOpened 先不要清：Trip.swift:337 的 active 已經會略過過期的行程，清不清不影響「加進行程」，之後打開別的行程時 TripMode.swift:75 會自然覆蓋。這項不用等別項。

**模擬器驗收**：建一個測試行程，日期設成上個月，打開一次後按「完成」回地圖。按右邊「行程」，確認打開的是「我的行程」清單，不是那個舊行程（浮層會記「我的行程」，不會記「進行程」）。再把那個行程日期改成今天，或改成不排日期，按「行程」確認會直接進去。把那個行程刪掉（等 6 秒訊息條收掉）後再按，確認打開「我的行程」而且不會壞。

**注意**：跟這一批其他項目和其他批都沒有重疊。MapTab.swift 其他批改的地方（例如第 4 批 U54、U59，第 5 批 U61）都不在 :724-731。

### U27（P2・體驗）「＋ 加一天」按錯沒辦法拿掉那一天（部分已修，下面只寫剩下的）

**畫面**：行程模式・「第 1 天 ▾」選單

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：點了立刻 days+1 寫進伺服器，沒有復原，App 也沒有任何地方能減天數。結束日會往後推，之後加的店還會預設落到這個空白的最後一天。build 20 就有這個問題，搬進選單後更容易誤觸。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：3fc00de 把主要問題修掉了：「第 N 天 ▾」選單在多天時多了「拿掉第 N 天」（TripTop.swift:147-152），拿的是正在看的那天；那天沒站直接拿掉，有站先跳確認框（TripTop.swift:17 的 dropDay、:66-73 的 confirmationDialog），站會接到前一天後面（拿第 1 天時接到下一天後面），後面的天往前遞補，每站和行程都用 update 送 PATCH（TripTop.swift:175-198），最後說「已拿掉第 N 天」。所以按錯加了一天，現在有地方拿掉。

還沒做的是原修法 (1)：TripTop.swift:200-206 的 addDay() 還是 days+1、trips.update、切到新的那天，沒有訊息條也沒有復原，按錯了要自己去選單找「拿掉」。Trip.swift:616-621 的 add(_:to:made:) 照樣是「今天在行程裡就加到今天，不然加到最後一天」，所以沒發現多了一天時，之後加的店還是會落到空白的最後一天。

原修法的邊角（刪站復原期間那天被拿掉）在 3fc00de 上已經碰不到：removeDay 最後一定會 store.say（TripTop.swift:197），Store.swift:429-432 的 say 會把 toastAction 換掉，前一條「已拿掉 某店」的「復原」就按不到了，那站會照 e7af2e1 改過的 Trip.swift:546-559 時間到真的刪掉。有站的那天要拿掉時，確認框是模態的，蓋著訊息條，也按不到底下的復原。所以合併注意裡「在 Trip.swift 刪站的復原 closure 改 s.day 再 update」不用做。反過來說，removeDay 的那行 store.say 不能拿掉，它就是擋住這個邊角的東西。另外 e7af2e1 已經把刪站的復原改成停 6 秒（Trip.swift:545 的 `seconds: 6`），真的刪除改成等 6.5 秒、按著訊息條時繼續等（:548-549）。

**修法**：

只剩 addDay() 的訊息條和復原，不用等別項。TripTop.swift:200-206 的 addDay() 整個換成：
```swift
    private func addDay(_ t: Trip) {
        guard t.days < 14 else { return }
        Haptic.light()
        let back = min(mode.day, t.days)
        var x = t; x.days += 1
        let n = x.days, tid = t.id
        trips.update(x, store: store)
        withAnimation(.snappy) { mode.day = n; mode.cand = nil; mode.hot = nil }
        // 訊息條的復原晚幾秒才跑，TripTop 可能已經不在畫面上：用 shared 和先拿好的 store，不靠 view 裡的屬性
        let st = store
        store.say("加了第 \(n) 天", icon: .check, action: ("復原", {
            let ts = TripStore.shared, m = TripMode.shared
            guard var y = ts.trip(tid), y.days == n, n > 1 else { st.toast = nil; return }
            // 這幾秒內已經在新的那天放了站：不動，請他用選單拿（站會移到隔壁那天，不會刪掉）
            guard ts.stops(tid, day: n).isEmpty else { st.say("第 \(n) 天已經有店，要拿掉請用「第 \(n) 天 ▾」選單"); return }
            Haptic.light()
            y.days -= 1
            ts.update(y, store: st)
            withAnimation(.snappy) {
                if m.tid == tid {
                    if m.day >= n { m.day = min(back, y.days) }
                    m.cand = nil; m.hot = nil
                }
            }
            st.toast = nil
        }), seconds: 6)
    }
```
說明：復原不呼叫 3fc00de 的 removeDay(t, n)。removeDay 開頭的 `guard t.days > 1` 看的是傳進去的 t，復原 closure 手上的 t 是加之前的舊值（原本只有一天時 days 是 1），會直接 return，按了復原沒反應；而且 removeDay 會把站搬到隔壁那天，不適合當「復原」。復原只拿掉剛加、還是空的最後一天，所以不用處理遞補。訊息條停 6 秒，跟 e7af2e1 刪站、刪行程的復原一致。

原修法 (2)「選單加拿掉最後一天」不用做了，3fc00de 的 TripTop.swift:147-152 已經做得更完整（任何一天都能拿，有站會先問）。原修法的邊角處理和合併注意裡 Trip.swift 刪站復原 closure 改 s.day 的那段也不用做，原因見 evidence；第 4 批 U34 (3) 改那個 closure 時只做它自己的部分。

**模擬器驗收**：用 -uitestSlowToasts 啟動（訊息條停 20 秒，來得及操作）。在測試行程按「第 1 天 ▾」選「＋ 加一天」，確認畫面切到第 2 天並出現「加了第 2 天」訊息條，右邊有「復原」；按「復原」確認膠囊回到「第 1 天」，選單裡只剩第 1 天，也沒有「拿掉」那一項。再加一天，趁訊息條還在，在第 2 天加一站，再按「復原」，確認出現「第 2 天已經有店，要拿掉請用『第 2 天 ▾』選單」，天數沒變。接著驗 3fc00de 已經做的部分：在第 2 天打開選單選「拿掉第 2 天」，確認跳出確認框寫「這天的 1 站會移到第 1 天，不會刪掉」，按「拿掉這天」後那站接在第 1 天最後、天數回到 1，關掉 App 重開確認伺服器那份也一樣。最後測邊角：加成兩天，在第 2 天放一站再左滑刪掉它，趁「已拿掉 某店」訊息條還在時從選單「拿掉第 2 天」，確認訊息條換成「已拿掉第 2 天」、沒有那站的復原可以按，等 20 秒讓面板重讀，那站不會在任何一天冒出來。

**注意**：跟同批（第 5 批）U25、U24 同一個檔案 TripTop.swift：U25 改 :118，U24 改 :25-30，這裡只改 :200-206，不衝突。跟同批 U29 相關：U29 改 Trip.swift:616-621 的挑天邏輯，讓加進行程不再一律落到最後一天，兩項一起做時空白的最後一天就不會變成預設落點；檔案和行都不重疊。跟第 4 批 U34 的合併（原合併注意）：3fc00de 之後不用在刪站復原 closure（Trip.swift:540-545）改 s.day，U34 第 (3) 點只改自己的 guard 和等待；但 e7af2e1 已經把 :545-549 改成 `seconds: 6` 和按著時繼續等的迴圈，U34 換 waitToastGone 時要對照新的這幾行。換天或拿掉一天會讓 TripPanel 的 fitKey 的「天」那一段變，照同批 U22 的 onChange 規則還是會框整天，這是想要的行為。

### U28（P2・體驗）行程模式裡從店家頁「加進行程」，不會加進正在排的這一天

**畫面**：行程模式 → 加站卡「看店家」→ 店家頁「加進行程」

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：這顆按鈕走一般的 addPlace()：兩個以上行程時會先問「加到哪個行程？」；只有一個時加到今天或最後一天，不是加站卡算好的位置。返回後加站卡變成「已經在第 3 天」，使用者得自己拖回來。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：最近八個 commit 都沒有碰 PlaceDetail.swift，也沒有碰加站卡的 candAt 和 add()，這項還是原樣。PlaceDetail.swift:227-248 的 tripButton 先看 trips.stopOf(place:)（Trip.swift:342-347，任何還沒過期的行程），有就顯示「在行程裡」並打開那個行程；沒有就呼叫 trips.addPlace（Trip.swift:598-606），兩個以上行程會先問加到哪個，只有一個就照 Trip.swift:616-641 的 add() 加到今天或最後一天。加站卡用的 candAt 在 TripPanel.swift:660-667，add() 在 TripPanel.swift:836-860（:851 是空檔推薦用完收搜尋，:857 是 U22 要拿掉的升段那行），加站卡的「加進行程」在 :758、「加到最後」在 :764 呼叫 add()，placeCand（:681）和 addCard（:705）呼叫 candAt。TripMode 的 tap() 在 TripMode.swift:134-138。3fc00de 新加的 removeDay（TripTop.swift:175-198）拿掉一天時會把 mode.cand 清掉、mode.day 夾在新的天數裡，不影響這項；有「復原」的訊息條在 3fc00de 改成撐滿寬度、按鈕固定在右邊（FoodMapApp.swift:134-145），「加到第 N 站」那條會照新樣子顯示，不用另外處理。

**修法**：

(1) 把加站卡算位置和加站搬進 TripMode，加站卡和店家頁共用。在 TripMode.swift:134-138 的 tap() 後面、:139 class 結尾的右括號前面加：
```swift
    // 正在看的這間插在哪：空檔推薦、選住宿是固定位置，不然挑多走最少的；沒座標放最後
    func candAt(_ order: [TripStop], _ c: TripCand) -> (at: Int, extra: Double) {
        guard let co = c.coord else { return (order.count, 0) }
        if let s = slot {
            let i = TripInsert.at(order, slot: s)
            return (i, TripInsert.extra(order, co, at: i))
        }
        return TripInsert.best(order, co)
    }

    // 加站卡、店家頁（在地圖分頁排行程時）共用：加到目前這天，訊息條可以復原
    func addCand(_ c: TripCand, at i: Int? = nil, store: Store) {
        let trips = TripStore.shared
        guard let tid, let t = trips.trip(tid) else { return }
        let d = min(day, t.days)
        let order = trips.stops(t.id, day: d)
        let at = i ?? candAt(order, c).at
        var s: TripStop
        if let p = c.place { s = trips.makeStop(t.id, day: d, place: p) }
        else if let h = c.hit { s = trips.makeStop(t.id, day: d, hit: h) }
        else { return }
        s.pos = TripInsert.pos(order, at: at)
        Haptic.success()
        Perf.shared.mark("加站")
        trips.insert(s, store: store)
        store.say("加到第 \(at + 1) 站", icon: .check, action: ("復原", {
            TripStore.shared.remove(s, dropTrip: false, store: store)
            store.toast = nil
        }))
        // 空檔推薦只加一間：用完就收起搜尋
        if slot != nil { clearSearch() }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            cand = nil
            // 從搜尋結果加的：結果框先收起來（地圖上的結果還在，點搜尋框或換分類再打開）
            if searchOn { folded = true }
            hot = s.id
        }
        scrollTo = s.id
    }
```
這裡已經照 U22 的 (1) 拿掉 TripPanel.swift:857 的升段那行，U22 做的時候不用再找那行。TripPanel.swift:660-667 的 candAt 整段換成一行轉呼叫（placeCand 的 :681、addCard 的 :705 照舊叫它）：
```swift
    private func candAt(_ order: [TripStop], _ c: TripCand) -> (at: Int, extra: Double) { mode.candAt(order, c) }
```
TripPanel.swift:758 改成 `Button { mode.addCand(c, at: r.at, store: store) } label: {`，:764 改成 `smallButton("加到最後", icon: "arrow.down.to.line") { mode.addCand(c, at: order.count, store: store) }`，:836-860 的 add() 整段刪掉。

(2) PlaceDetail.swift:227-248 的 tripButton 整段換成下面這樣。跟最早的修法比多了兩件事：只有在地圖分頁才算「在排這個行程」（切到清單分頁時 TripMode.on 還是 true，從清單點進店家頁不該加進正在排的那天）；排行程時「在行程裡」只看目前這個行程，不然這間在別的行程裡時會一直顯示「在行程裡」、把人帶去別的行程，永遠加不進這一個。
```swift
    // 加進行程：在地圖分頁排行程時加進正在排的這一天（跟加站卡同一套）；不然只有一個進行中的行程就直接加，不然先問加到哪個。
    // 已經在行程裡就打開那個行程、捲到那一站（排行程時只看正在排的這個行程）
    @ViewBuilder private func tripButton(_ place: Place) -> some View {
        let m = TripMode.shared
        let planning = m.on && store.tab == 0
        let inTrip = planning ? m.tid.flatMap { tid in trips.stops(tid).first { $0.place_id == place.id } } : trips.stopOf(place: place.id)
        if let s = inTrip {
            Button { Haptic.light(); TripMode.shared.open(s.trip_id, focus: s.id, store: store) } label: {
                Label("在行程裡", systemImage: "checkmark").foregroundStyle(Color.sprMint.mix(with: .black, by: 0.15))
                    .modifier(TripBtnLook())
            }
            .buttonStyle(PressStyle())
            .transition(.scale(scale: 0.9).combined(with: .opacity))
        } else if planning {
            Button {
                // 從加站卡「看店家」進來的：沿用那張卡（空檔推薦的固定位置也一起）；不然當成新的一張
                let c = m.cand.flatMap { $0.id == place.id ? $0 : nil } ?? TripCand(place: place)
                m.addCand(c, store: store)
                store.mapPath = NavigationPath()   // 回地圖看到新號碼
            } label: {
                Label("加進這個行程", systemImage: "plus").foregroundStyle(Color.ink)
                    .modifier(TripBtnLook())
            }
            .buttonStyle(PressStyle())
        } else {
            Button {
                Task {
                    // 還沒讀過行程（第一次按）：先讀，免得多開一個新行程
                    if !trips.loaded { await trips.load() }
                    trips.addPlace(place, store: store)
                }
            } label: {
                Label("加進行程", systemImage: "plus").foregroundStyle(Color.ink)
                    .modifier(TripBtnLook())
            }
            .buttonStyle(PressStyle())
        }
    }
```
place 是頁面上選到的分店（PlaceDetail.swift:24），加進去的就是那間分店。原本修法的 `m.cand!` 改成 flatMap，不用強制解開。

(3) 第 6 批做 U82 時（要等這項先做）：slotFits 加在 TripMode 的 candAt 前面，`mode.search` 直接寫 `search`：
```swift
    // 空檔推薦、搜尋飯店當起點：只有那次搜尋找到的才固定位置，其他照順路算（U82）
    func slotFits(_ c: TripCand, _ s: AddSlot) -> Bool {
        switch s {
        case .end: return true
        case .first: return c.hit?.stay == true
        case .between: return search.found.contains { $0.id == c.id } || search.hits.contains { $0.id == c.id }
        }
    }
```
TripMode.candAt 的 `if let s = slot {` 改成 `if let s = slot, slotFits(c, s) {`，addCand 的 `if slot != nil { clearSearch() }` 改成 `if let s = slot, slotFits(c, s) { clearSearch() }`。TripPanel 不用加 slotFits，那層轉呼叫也不用動；U82 改 TripTop 的那點照原文，但 TripTop 的行號已經被 e7af2e1、3fc00de 推移，要照程式片段找。

**模擬器驗收**：在測試行程第 1 天點一根測試收藏開加站卡，按「看店家」，在店家頁按「加進這個行程」。確認不會跳出「加到哪個行程？」，畫面回到地圖，第 1 天多了新號碼，位置跟加站卡寫的插入位置一樣；訊息條是「加到第 N 站」，撐滿寬度、「復原」在最右邊，按了那站會拿掉。再試三種情況：這間已經在另一個行程裡時，店家頁要顯示「加進這個行程」而不是「在行程裡」；這間已經在目前這個行程裡時，顯示「在行程裡」，按了捲到那站；切到清單分頁點進同一間，按鈕要照舊是「加進行程」、走一般的加法。加站卡上的「加進行程」「加到最後」也各按一次，結果跟改前一樣，面板在最低段時加完不會升到中段。做完 U82 後再測：開著「搜尋飯店」時從店家頁加一間餐廳，要照順路插入，飯店搜尋不能被收掉。

**注意**：跟 U22（第 5 批）重疊最大：add() 搬進 TripMode 後，U22 的 (1) 拿掉升段已經寫在 addCand 裡；U22 的 (3) 靠 hot 讓站卡那排捲動，addCand 繼續設 hot；U22 的 nudge（合11 改名 panToNew）從 fitKey 的 onChange 觸發，店家頁加的站回到地圖也走同一條，不用另外處理。跟 U82（第 6 批，合4 和第 6 批合1）：U82 要改的 candAt 和 clearSearch 那行做完這項後都在 TripMode，照上面 (3) 改，一定要等這項先做。跟 U55（第 5 批）：U55 改 placeCand（TripPanel.swift:677、:686-687），placeCand 裡呼叫的 candAt 變成轉呼叫，兩邊不打架，誰先做都可以。跟 U29（第 5 批）：PlaceDetail 不在排行程時還是走 trips.addPlace，會吃到 U29 改的 add() 和 pickDay；排行程時改走 addCand，不經過 add()，兩項程式不重疊。fix-addcard-ec71aa2.md 已經做完，它在加站卡關掉時記的「加站卡關掉」在 addCand 把 cand 設成 nil 時也會出現，是正常的。

### U29（P2・體驗）多天行程默默加到最後一天，訊息條也沒寫哪一天

**畫面**：店家頁／長按圖釘「加進行程」、加到哪個行程？sheet

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：還沒開始或沒排日期的多天行程，一律加到 t.days（最後一天）。訊息條「加到 台南三日 第 4 站」沒有天數。move()（改到別的行程）也一樣。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：Trip.swift 只有 e7af2e1 改了刪一站的等待（Trip.swift:535-559），add() 沒動。Trip.swift:616-641 的 add() 在 :620 先設 `var day = t.days`，只有 :621 行程進行中才改成今天，所以還沒開始或沒排日期的多天行程一律加到最後一天；:636 的訊息條還是「加到 台南三日 第 N 站」，沒有天數；:640 停 6 秒、點了用 TripMode.open(t.id, focus: s.id) 打開。Trip.swift:663-669 的 move() 在 :665 一樣設 s.day = t.days，整個專案還是找不到任何呼叫 move 的地方。TripChooser.swift:50 的 row(t) 在 :54-61 組 meta，:76 呼叫 trips.add。3fc00de 加了拿掉一天（TripTop.swift:146-152 的選單、:175-198 的 removeDay），只改天數和站的 day，沒有碰 add()。

**修法**：

(1) 在 Trip.swift:615 的註解（add() 上面那行）前面加挑天的函式，不要寫成 private，TripChooser 會用到：
```swift
    // 挑加到第幾天：進行中的行程照今天；還沒開始或沒排日期時才跨天挑
    func pickDay(_ t: Trip, near c: CLLocationCoordinate2D?) -> Int {
        let today = TripDate.today
        if let st = t.start, st <= today, let n = Calendar.current.dateComponents([.day], from: st, to: today).day, n < t.days { return n + 1 }
        guard t.days > 1 else { return 1 }
        let days = Array(1...t.days)
        if let c {
            // 多繞 10 分鐘內、最順的那天。沒有任何座標的天要跳過：TripInsert.best 遇到這種天會回 0 公尺，空天會直接勝出
            var best: (day: Int, min: Int)?
            for d in days {
                let o = stops(t.id, day: d)
                guard o.contains(where: { $0.coord != nil }) else { continue }
                let m = TripInsert.minutes(TripInsert.best(o, c).extra, TripMath.dayMode(t, o))
                if m <= 10, m < (best?.min ?? .max) { best = (d, m) }
            }
            if let best { return best.day }
            // 都不順路：離新店最近的那站在 1.5 公里內，就放那天
            let here = CLLocation(latitude: c.latitude, longitude: c.longitude)
            let near = stops(t.id)
                .compactMap { s in s.coord.map { (day: s.day, m: here.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude))) } }
                .min { $0.m < $1.m }
            if let near, near.m <= 1500, days.contains(near.day) { return near.day }
        }
        // 再不行放第一個空的天，沒有空天才放最後一天
        return days.first { stops(t.id, day: $0).isEmpty } ?? t.days
    }

    // 給「加到哪個行程？」用：TripChooser 只 import SwiftUI，不用自己組座標
    func pickDay(_ t: Trip, place p: Place) -> Int {
        pickDay(t, near: p.lat.flatMap { la in p.lng.map { CLLocationCoordinate2D(latitude: la, longitude: $0) } })
    }
```
Trip.swift 已經 import CoreLocation 和 MapKit，TripInsert.minutes 在 TripMode.swift:194、TripMath.dayMode 在 TripMode.swift:210，同一個 module 直接用。

(2) add() 的 Trip.swift:619-623（`let today = TripDate.today` 到 `var s = makeStop(t.id, day: day, place: p)` 這五行）換成下面四行，:624-634 照舊。makeStop 先給第 1 天沒關係，pos 在 :631 會照新的那天重算：
```swift
        var s = makeStop(t.id, day: 1, place: p)
        let day = pickDay(t, near: s.coord)
        s.day = day
        let order = stops(t.id, day: day)
```

(3) Trip.swift:636 的訊息換成兩行，多天行程一律帶天數，一天的行程維持原本的文案：
```swift
        let dest = t.days > 1 ? "\(t.title) 第 \(day) 天" : t.title
        let msg = smooth ? "加到 \(dest) 第 \(n) 站・順路" : order.isEmpty ? "加到 \(dest)・第 1 站" : "加到 \(dest) 最後・第 \(n) 站"
```
:640 的 tap 用 TripMode.open(t.id, focus: s.id) 本來就會切到那站的那天（TripMode.swift:82 `if let s { day = s.day }`），不用改。

(4) Trip.swift:662-669 的 move()（含 :662 的註解）沒有人呼叫，直接刪掉。如果想留著，就把 :665 改成 `s.trip_id = t.id; s.day = pickDay(t, near: s.coord); s.pos = nextPos(t.id, s.day)`，:668 的訊息照 (3) 的寫法帶「第 N 天」。

(5) 選做：TripChooser.swift:61 `meta.append(n == 0 ? "還沒有站" : "\(n) 站")` 下面加一行，多天行程在選單上先看到會加到哪天：
```swift
        if t.days > 1 { meta.append("會加到第 \(trips.pickDay(t, place: place)) 天") }
```

**模擬器驗收**：在測試帳號建一個三天、沒排日期的測試行程：第 1 天放兩個中西區的站，第 3 天放一個安平的站，第 2 天空著；另外再留一個測試行程，讓「加進行程」會先問加到哪個。(1) 從中西區另一間店的店家頁按「加進行程」選這個行程，確認加到第 1 天，訊息條寫「加到 ○○ 第 1 天 第 N 站・順路」，撐滿寬度、「復原」在最右邊。(2) 從離所有站都超過 1.5 公里的店再加一次，確認加到第 2 天（第一個空天），不是第 3 天。(3) 點訊息條文字，確認行程打開在那一天、那一站。(4) 用一天的測試行程加一次，確認文案沒有「第 1 天」。(5) 有做選做 (5) 的話，「加到哪個行程？」裡三天那個行程要多一段「會加到第 N 天」，跟實際加進去的天一樣。(6) 在三天的行程裡用 3fc00de 的「拿掉第 2 天」把空天拿掉，再從遠的店加一次，確認加到最後一天、沒有當掉。測完把測試行程刪掉。

**注意**：跟 U28（第 5 批）：U28 讓店家頁在地圖分頁排行程時改走 TripMode.addCand，不經過 add()；不在排行程時才走 trips.addPlace，也就是這項改的地方，兩邊程式不重疊。跟 U34（第 4 批）：它原本要改的刪一站等待，e7af2e1 已經在 Trip.swift:546-551 改成等 6.5 秒、按著訊息條時繼續等，跟這項是同一個檔案的不同段落，不衝突。跟 U27（第 5 批）：3fc00de 已經加了拿掉一天（TripTop.swift:175-198），它會改站的 day 和 t.days；pickDay 每次都讀當下的 stops 和 t.days，不受影響。fix-addcard-ec71aa2.md 已做完，行程模式長按圖釘「加進行程」走加站卡，不會進 add()，不衝突。

### U55（P2・滑順）行程模式點站號或點收藏加站時，整張 MapTab 跟著重算（部分已修，下面只寫剩下的）

**畫面**：行程模式：點站號、點收藏（加站卡）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：MapTab body 直接讀 trip.cand、found、segs 等行程狀態，點一下就重跑：store.shown 過濾、withExtra、藏起來的 Nearby 距離排序、所有 Annotation diff。打字逐字重算那一項不成立（searchOn 會短路），已從範圍拿掉；trip.hot 是否真的被追蹤，要用 PerfHUD 或 Instruments 確認。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：之前做好的部分還在：附近面板在 NearbyHost 裡（MapTab.swift:342，型別用 Equatable 比 list），行程面板在 MapTab.swift:305 是 `.equatable()`。剩下的都沒做，最近的 commit 只在旁邊加量測：8559c3d 在 tapMark（MapTab.swift:734-740）加了 `guard !pins.moving`，在連續鏡頭回呼加 `pins.camAt`（:187），52a0b69 把點搜尋結果的記號分開（:615），都沒有減少 body 的追蹤。body 還是直接讀 trip.preview（:140、:164）、trip.hot（:146）、trip.cand（:154、:160、:167）、trip.previewN（:160），MapTab.swift:278-286 的 `.onChange(of: trip.cand?.id)` 也讓 MapTab 追蹤 cand（裡面有「加站卡關掉 距點 Nms」的記錄，:280-283）。SelWatcher 在 MapTab.swift:1677-1689，看 cand == nil 的 onChange 在 :1684-1686。點站號時 tapMark 改 trip.hot，整張重算一次；點收藏時 picked 在 :616 改 cand，接著 TripPanel 的 placeCand（TripPanel.swift:674-694）在 :686-687 分兩次寫 preview 和 previewN，整張再算兩次。placeCand 在面板大小變（TripPanel.swift:162）、candKey 變（:181）和卡片量到新高度（:785）時都會再叫，每次都重寫 preview、previewN。MarkView 在 TripPanel.swift:1417-1449（RowHold 進來後往前移了），HitPin 在 TripTop.swift:462-492，TripMode 的 preview、previewN 在 TripMode.swift:44-45，close() 清它們在 :96。store.shown（MapTab.swift:65）和 tripHidden（:716-720）每次重算都會跑。

**修法**：

(1) 站號自己看 hot。MapTab.swift:146 改成 `Button { tapMark(m.id) } label: { MarkView(m: m) }`。MarkView 的 TripPanel.swift:1419 `var hot = false` 換成下面兩行，其他不動（:1443、:1444、:1446 照樣讀 hot）：
```swift
    @State private var trip = TripMode.shared
    private var hot: Bool { trip.hot == m.id }
```
MarkView 只有 MapTab.swift:146 一個地方在用。

(2) 搜尋結果自己看 cand。MapTab.swift:154 改成 `HitPin(hit: h) { pins.tap("hit:" + h.id) }`。HitPin 把 TripTop.swift:464 的 `let on: Bool` 拿掉，在 :466 `@State private var shown = false` 下面加：
```swift
    @State private var mode = TripMode.shared
    private var on: Bool { mode.cand?.id == hit.id }
```
:482 和 :488 照樣讀 on，不用改。

(3) 加站卡的 onChange 搬進 SelWatcher。刪掉 MapTab.swift:278-286 整段 `.onChange(of: trip.cand?.id) { old, now in … }`。SelWatcher（MapTab.swift:1677-1689）整個換成下面這樣，原本 :1684-1686 看 `cand == nil` 的 onChange 合進來（cand 變 nil 時 select(nil) 一樣會跑，PinState.select 在 :1661 會略過相同的值）：
```swift
private struct SelWatcher: View {
    let pins: PinState
    let act: (String?) -> Void
    var body: some View {
        Color.clear.onChange(of: pins.sel) { _, id in act(id) }
            .onChange(of: pins.again) { act(pins.sel) }
            // 行程模式的加站卡換了一間：那根圖釘放大（收藏用店的 id，搜到的地點用 hit: 開頭）。
            // 加站卡關掉了（往下拖、✕、加好了、按「完成」離開行程）：圖釘也取消選取，再點同一根才會重新打開；
            // 離開行程時不取消的話，回到首頁會冒出那間的大卡片。放在這裡，MapTab 本身不用追蹤 cand
            .onChange(of: TripMode.shared.cand?.id) { old, now in
                // 量測浮層：加站卡關掉時記離最後點圖釘多久（太快關掉就是被誤關）
                if old != nil, now == nil {
                    let dt = CACurrentMediaTime() - pins.tapAt
                    Perf.shared.mark(dt < 10 ? "加站卡關掉 距點 \(Int(dt * 1000))ms" : "加站卡關掉")
                }
                let c = TripMode.shared.cand
                pins.select(c.map { $0.place != nil ? $0.id : "hit:" + $0.id })
            }
    }
}
```

(4) 虛線和「新的第 N 站」合成一個屬性，換一張加站卡 MapTab 只重算一次。Annotation 的座標和 MapPolyline 都得在 body 裡讀，換卡一定要重算一次，目標是從兩次以上降到一次。
a. TripMode.swift:44-45 兩行換成一行：
```swift
    var preview: CandPreview?        // 加站卡：虛線和「新的第 N 站」一起改，MapTab 只看這一個
```
在 TripMode.swift 檔尾加：
```swift
// 加站卡在地圖上要畫的東西：前一站、這間、後一站的虛線，和「新的第 N 站」牌子
struct CandPreview {
    let line: TripSeg?               // 行程還沒有站（或前後站沒座標）時沒有線
    let at: CLLocationCoordinate2D
    let n: Int
    let color: Color
    let onPin: Bool                  // 收藏圖釘：牌子要讓開圖釘
    // 跟上一次一樣就不用再寫（寫了 MapTab 會整張重算）
    func same(_ o: CandPreview?) -> Bool {
        guard let o else { return false }
        let a = line?.coords ?? [], b = o.line?.coords ?? []
        return n == o.n && onPin == o.onPin && at.latitude == o.at.latitude && at.longitude == o.at.longitude
            && a.count == b.count && zip(a, b).allSatisfy { $0.latitude == $1.latitude && $0.longitude == $1.longitude }
    }
}
```
TripMode.swift 已經 import SwiftUI 和 MapKit，TripSeg 在 TripPanel.swift:1394，同一個 module。
b. TripMode.swift:96 改成 `cand = nil; hot = nil; expand = nil; preview = nil; moving = false`。
c. TripPanel.swift:677 改成 `if mode.preview != nil { mode.preview = nil }`。
d. TripPanel.swift:686-687 兩行換成：
```swift
        let seg = line.count > 1 ? TripSeg(id: "cand", coords: line, color: TripColor.of(r.at), routed: false) : nil
        let pv = CandPreview(line: seg, at: co, n: r.at + 1, color: seg?.color ?? Color.accent, onPin: c.place != nil)
        // 面板大小、卡片高度變了會再叫一次：一樣就不寫，MapTab 不跟著重算
        if !pv.same(mode.preview) { mode.preview = pv }
```
後面 :689 的 `let cid = c.id, pts = line` 和框地圖的 Task 不動。
e. MapTab.swift:139-142 換成：
```swift
                        // 加站卡：前一站、這間、後一站的虛線
                        if let pv = trip.preview?.line {
                            MapPolyline(coordinates: pv.coords).stroke(pv.color, style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [9, 9]))
                        }
```
f. MapTab.swift:160-172 換成：
```swift
                        if let pv = trip.preview {
                            Annotation("", coordinate: pv.at, anchor: .bottom) {
                                Text("新的第 \(pv.n) 站").font(.system(size: 12, weight: .heavy)).foregroundStyle(.white)
                                    .padding(.horizontal, 9).frame(height: 24)
                                    .background(pv.color, in: .capsule)
                                    .overlay(Capsule().strokeBorder(.white, lineWidth: 2))
                                    .fixedSize()
                                    .offset(y: pv.onPin ? -70 : -22)
                                    .transition(.scale(scale: 0.5).combined(with: .opacity))
                                    .allowsHitTesting(false)
                            }
                            .annotationTitles(.hidden)
                        }
```
改完之後牌子跟虛線一樣，要等 TripPanel 的 onChange（:181）跑完 placeCand 才更新，換卡或關卡時牌子會晚一幀移動或消失，跟虛線同步，這是預期的。

(5) 原修法的 frozenNear 不用做：行程模式的附近面板已經由 NearbyHost 擋掉。

(6) all 和 list 的快取放第二步：key 用 store.mapF、store.mapGroup、store.placesRev、tripHidden、pins.extra，存在 @State 的普通 class（不觀察），MapTab.swift:65-68 只查快取。先量 (1) 到 (4) 的效果再決定要不要做。

**模擬器驗收**：行程模式用 -perfOverlay 開 PerfHUD，先記下「地圖」的次數。連點 10 次不同的站號（點之前讓地圖停好，8559c3d 之後地圖還在動時點號碼不算，浮層會記「地圖在動 不算點號碼」）：「地圖」次數要完全不變（改前每點一次加一），站號照樣放大 1.3 倍、清單捲到那站、最低段小卡也捲到那站、地圖飛過去。連點 10 根不同的收藏圖釘：每換一張加站卡「地圖」只能加 1（改前至少加 2），卡片、虛線、「新的第 N 站」牌子都要出現，牌子在圖釘上方。開著加站卡讓鍵盤收起來或把加站卡撐高（面板大小、卡片高度變）：「地圖」不能再加。搜尋時點 HitPin：放大 1.3 倍照舊，浮層記「點搜尋加站」。在空行程點收藏：沒有虛線，牌子是「新的第 1 站」、橘色。按 ✕ 或往下拖關卡：牌子和虛線一起消失、圖釘取消選取，浮層照樣出現「加站卡關掉 距點 Nms」。按「完成」離開行程：回到首頁不能冒出大卡片。同時比較改前改後的掉幀數。

**注意**：fix-addcard-ec71aa2.md 已做完，它在 cand 的 onChange 加的量測記錄現在跟著 (3) 搬進 SelWatcher，上面的程式已經包含。fix-v11-acd4471.md（RowHold）已經在 8559c3d、9379b88 做進去，MarkView 因此移到 TripPanel.swift:1417，上面已用新行號。跟 U28（第 5 批）：U28 把 candAt 改成轉呼叫 TripMode，placeCand 的 :681 照樣叫它，U55 改的是 :677、:686-687，不重疊，誰先做都可以。跟 U13（第 5 批）：U13 改 MapTab 的 onChange(of: trip.on)，它說進行程時「cand 的 onChange 不會跑、不會記加站卡關掉」，搬進 SelWatcher 後還是成立。跟 U117（第 6 批，合12 更正過不是同一批）：它改 MapTab.swift:178-183 的點擊手勢和 blankTap，跟這項的 :139-172、:278-286 不重疊。perf-round1b.md 附錄 A 的 S78 4「select(nil) 併同一個交易」指的就是 3fc00de 的 MapTab.swift:278-286 和 :1684-1686，U55 把它們合成 SelWatcher 裡的一個 onChange，之後要做 S78 4 就在那裡做。

### U58（P2・滑順）每算好一段路線，就在主執行緒重算所有收藏到路線的距離

**畫面**：進行程模式（路線一段一段算出的那幾秒）、換天、加站、換交通方式

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：TripTop 的 .task(id: routeKey) 只要不在出發中就跑 measure()，在主執行緒做 O(收藏數 × 路線點數)。剛進行程時每段路線回來（網路延遲加 150ms）就跑一次，正好撞上面板的 spring。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：沒有修。e7af2e1 拿掉了 TripTop 標題列下面的「第 N 天」投放區，3fc00de 加了拿掉一天的選單和確認框，只讓行號往前移，量測本身沒動。TripTop.swift:37-42 的 .task(id: routeKey(t)) 還是只要不在出發中就直接呼叫 mode.search.measure；measure（TripMode.swift:297-318）在主執行緒組路線、建 RouteNear（:310），再對 store.places 每一間算距離（:312-315），算完不管有沒有變都寫 near 和 dist（:316-317）。routeKey（TripTop.swift:84-92）含已經算好的段數（:87-90），每段路線回來 key 就變一次；foundKey 在 TripTop.swift:80-82，會跟著 near 變。measure 只有 TripTop.swift:41 一個地方在叫。背景建物件的寫法在專案裡已經有：Store.swift:270、Reel.swift:189（0486c4f 加的 build）。

**修法**：

(1) TripMode.swift:297-318 的 measure 整個換成 async 版：主執行緒只組路線和收藏座標，距離丟到背景算，值沒變就不寫。lines 是 var，丟進 Task.detached 前要先抄成 let，不然 Swift 會報「在並行程式碼裡參照捕捉的 var」，原本的修法漏了這點：
```swift
    func measure(_ all: [TripStop], seg: [String]?, mode: TravelMode, store: Store) async {
        let router = TripRouter.shared
        let ss = seg.map { ids in all.filter { ids.contains($0.id) } } ?? all
        let cs = ss.compactMap { s in s.coord.map { (s, $0) } }
        var lines: [[CLLocationCoordinate2D]] = []
        if cs.count == 1 { lines = [[cs[0].1]] }
        for i in cs.indices.dropFirst() {
            let a = cs[i - 1].1, b = cs[i].1
            // 跟行程面板同一套規則：選過照選的，行程預設不是走路就照行程，其他依距離
            let m = cs[i].0.mode.flatMap { TravelMode(rawValue: $0) } ?? (mode != .walk ? mode : .auto(a, b))
            lines.append(router.leg(a, b, m).coords ?? [a, b])
        }
        if lines.isEmpty, let h = store.here { lines = [[h.coordinate]] }
        let ls = lines
        let pts = store.places.compactMap { p in p.lat.flatMap { la in p.lng.map { (p.id, la, $0) } } }
        let t0 = CACurrentMediaTime()
        // 算距離不在主執行緒（收藏數乘路線點數，剛進行程時每段路線回來都要算）
        let (n, d) = await Task.detached(priority: .userInitiated) { () -> (RouteNear, [String: Double]) in
            let n = RouteNear(ls)
            var d: [String: Double] = [:]
            if !n.isEmpty { for (id, la, ln) in pts { d[id] = n.meters(CLLocationCoordinate2D(latitude: la, longitude: ln)) } }
            return (n, d)
        }.value
        if Task.isCancelled { return }
        Perf.shared.mark("路線距離 \(d.count) 間 \(Int((CACurrentMediaTime() - t0) * 1000))ms（背景）")
        // 值沒變就不寫，免得 foundKey、searchKey 跟著變
        guard d != dist || n.isEmpty != near.isEmpty || n.radius != near.radius || n.center?.latitude != near.center?.latitude else { return }
        near = n
        dist = d
    }
```
RouteNear（TripAdd.swift:86）是 struct，裡面只有 Double 和座標，專案是 Swift 5 模式，帶過去頂多是警告。

(2) TripTop.swift:37-42 換成加 200ms 防抖、改成 await：
```swift
        .task(id: routeKey(t)) {
            guard let t, !mode.going else { return }
            // 路線一段一段回來時 key 連續變：等 200ms 沒再變才量（task(id:) 換 key 會取消上一個）
            try? await Task.sleep(for: .milliseconds(200))
            if Task.isCancelled { return }
            let d = min(mode.day, t.days)
            // 傳行程預設；走路（＝自動）時每段依距離選，跟面板同一套
            await mode.search.measure(trips.stops(t.id, day: d), seg: mode.seg, mode: TravelMode(rawValue: t.mode) ?? .walk, store: store)
        }
```

(3) 不要在 measure 加 guard searchOn。routeKey 沒有含 searchOn，按 🔍 不會觸發量測，展開動畫第一幀就能動；量完 near 一變，foundKey（TripTop.swift:80-82）會自己重算，把「離路線 N 分」和排序補上。

**模擬器驗收**：進一個 5 站的測試行程，開 PerfHUD 看進入後前 3 秒的掉幀，要比改前少；浮層會記「路線距離 N 間 Xms（背景）」，出現的次數要少於路線段數（防抖有合併），而且路線都算好、沒再變以後不會再記。接著按 🔍 選「順路」，確認展開第一幀就開始動，結果稍後補上「離路線 N 分」和排序。再換某段的交通方式，確認會重算一次、結果跟著更新。最後在多天的測試行程用「第 N 天 ▾」選單換天、再用 3fc00de 的「拿掉第 N 天」拿掉一個有站的天：各只記一次「路線距離」，搜尋結果的「離路線 N 分」跟著新的那天更新。

**注意**：跟其他批次沒有程式重疊。合12 更正過：原本注意說「同一批的 U57」，U57 已經在 faae950 修好（總表附錄 A），不在任何一批，TripPanel 那份快取跟這裡互不影響。fix-addcard-ec71aa2.md 已做完，沒有重疊。TripTop.swift 的行號在 e7af2e1（拿掉標題列下面的投放區）和 3fc00de（拿掉一天的選單和確認框）之後都移了，其他改 TripTop 的項目（例如第 6 批 U82 第 (3) 點）要照程式片段找位置。

### U60（P2・錯誤）左滑刪除行程不先確認，「復原」訊息條又被 sheet 蓋住，6 秒後真的刪掉（部分已修，下面只寫剩下的）

**畫面**：我的行程（sheet）→ 卡片往左滑刪除

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：左滑過 40% 或甩一下就 deleteWithUndo。訊息條畫在 Root 的 overlay，被 sheet 蓋住或落在變暗層後面，點了只會關掉 sheet，按不到復原。

**行號**：d95fd43（見 行號對照.md 的「d95fd43 → a10704d」，只有 MapTab、Perf、Reel 有移動）

**現況**：d95fd43 做了一半，而且做法跟原修法不同。已經做到的：左滑刪行程會先問。TripsList.swift:89 的 SwipeToDelete 加了 `slideOut: false`，滑到底或點垃圾桶只會 `asking = t`（:90），卡片彈回原位（SwipeToDelete.delete() 在 :425-431，slideOut 是 false 時先 close() 再 onDelete()）；:67-70 跳「刪除「…」？每一站都會一起刪掉」，按「刪除行程」走 :99-104 的 delete(t)，刪的是正在排的行程時先 TripMode.close()、晚 0.45 秒再 deleteWithUndo，跟行程選單（MapTab.swift:435-439）一樣。所有行程都會問（不是只有群組行程），字也跟行程選單一樣，原修法第 (2) 點不用做了。sheet 裡也有「復原」了：TripsList.swift:47-66 在 TripsList 自己身上加了一個 overlay，只顯示開頭是「已刪除「」而且有 toastAction 的訊息。
還沒做到的：(a) Root 那條（FoodMapApp.swift:111-183）照樣畫，只是被 sheet 蓋著。行程模式把面板拉到最高段時，5d713ac 的 tripPad（FoodMapApp.swift:120）是 panelH - 56，訊息條會跑到 medium sheet 上面那塊變暗的地方，這時畫面上同時有兩條，上面那條點了只會關掉 sheet。(b) sheet 裡那條沒有按住暫停：DragGesture 設 store.toastHeld 的那段只在 Root 那條上（:172-174），按著 sheet 裡那條，Root 的倒數（:156-171）照數，Trip.swift:460 也不會多等。(c) sheet 裡那條不知道 Root 的 toastFading（FoodMapApp.swift:29-30 是 Root 的 @State）：時間到 Root 那條淡掉、原地擋 0.45 秒點擊，sheet 裡這條卻一直是全亮、:54 的「復原」沒擋，0.45 秒後直接滑走，晚一點點的點擊會落在底下的行程卡上，進到那個行程（3fc00de 想防的就是這個）。(d) 只顯示「已刪除「」開頭的訊息：sheet 開著時 Trip.swift:466 的「刪除失敗：…」、U66 第 (8) 點要加的下拉失敗訊息都還是被 sheet 蓋住。(e) overlay 掛在 TripsList 本身，Trip.swift:60 的推頁 TripsList 如果之後被用到，會跟 Root 那條同時出現兩條（目前 repo 裡沒有地方 push TripRoute.list，只有 GroupsTab.swift:52、ListTab.swift:98、MapTab.swift:426 註冊 destination）。
其他現況：「我的行程」sheet 還是 MapTab.swift:433 `.sheet(isPresented: $trip.listing) { TripsList().presentationDetents([.medium, .large]) }`。Store.swift:41 是 `@ObservationIgnored var toastHeld = false`。Root 的 overlay 現在是 :111-183：:112 `if let t = store.toast {`、:113 `let act = store.toastAction`、:116 onMap、:119 onTrip、:120 tripPad（5d713ac 新加）、:122 pad、:123-181 訊息條本體（:139 復原按鈕、:146-149 版面、:154 朗讀、:156-171 倒數、:172-174 按住、:175 透明度、:176-181 點一下）。剪貼簿 overlay 在 :185-189，:190 是 `.environment(\.toastNS, toastNS)`。刪行程的 deleteWithUndo 在 Trip.swift:436-471，訊息條 6 秒（:456），:459 等 6.5 秒、:460 按著時繼續等。

**修法**：

原修法第 (2) 點（群組行程才確認）已經被 d95fd43 用 slideOut: false 加上每個行程都問取代，不要做。TripsList.swift:12 的 asking、:67-70 的 confirmationDialog、:88-104 的 card() 和 delete() 都照 d95fd43 留著。剩下要做的是第 (1) 點：訊息條抽成共用元件，sheet 裡那條跟 Root 那條共用倒數、淡出、按住暫停，sheet 開著時 Root 那條先藏起來。d95fd43 自己在 TripsList 加的 overlay 要拿掉，換成下面的 toastHost。

a. Store.swift:41 `@ObservationIgnored var toastHeld = false` 下面加兩行（要被觀察，不能加 @ObservationIgnored）：
```swift
    var toastFading = false          // 訊息條時間到正在淡掉：Root 和 sheet 裡那條都看這個（原本是 Root 的 @State）
    var toastSheets = 0              // 掛了訊息條的 sheet 開著幾個：大於 0 時 Root 那條先藏起來
```
b. 刪掉 FoodMapApp.swift:29-30（toastFading 的註解和 `@State private var toastFading = false`），改用 store.toastFading。

c. 在 FoodMapApp.swift 檔尾加訊息條本體。這是 d95fd43 的 :123-181 搬出來（5d713ac、d95fd43 都沒改這段），倒數的 .task 不搬，朗讀改到 Root 的倒數裡只念一次，toastFading 改讀 store：
```swift
// 訊息條本體：Root 和 sheet 共用（倒數、淡出、朗讀只在 Root 跑一份）
struct ToastBar: View {
    let text: String
    let bottom: CGFloat
    var trailing: CGFloat = 0
    var ns: Namespace.ID?
    @Environment(Store.self) private var store
    var body: some View {
        let act = store.toastAction
        HStack(spacing: 10) {
            if let p = store.toastPlace {
                let photo = PhotoView(place: p, px: 120).frame(width: 30, height: 30).clipShape(.rect(cornerRadius: 8))
                if let ns { photo.matchedGeometryEffect(id: "del-" + p.id, in: ns) } else { photo }
            }
            if let i = store.toastIcon { ToastGlyph(icon: i).id(text) }
            VStack(alignment: .leading, spacing: 1) {
                Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(2)
                if store.toastTap != nil {
                    Text("按一下打開行程").font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6))
                }
            }
            .padding(.trailing, act == nil ? 0 : 4)
            if let act {
                // 有「復原」的訊息條撐滿寬度、按鈕固定在最右邊：店名長短不同，按鈕位置也不跑
                Spacer(minLength: 0)
                Button { if !store.toastFading { act.run() } } label: {
                    Text(act.label).font(.subheadline.weight(.heavy)).foregroundStyle(Color.sprYellow)
                        .padding(.horizontal, 10).frame(minWidth: 56, minHeight: 44).contentShape(.rect)
                }
                .padding(.trailing, -10)
            }
        }
        .frame(maxWidth: act == nil ? nil : .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.vertical, act == nil ? 11 : 3)
        .background(Color.ink.opacity(0.92), in: .capsule)
        .padding(.bottom, bottom).padding(.horizontal, 24).padding(.trailing, trailing)
        // 返回時從按鈕列上方滑到面板上緣，不是一格跳過去
        .animation(.snappy(duration: 0.3), value: bottom)
        .accessibilityAddTraits(.isButton)
        // 手指按著訊息條時暫停倒數（刪行程、刪一站、刪收藏的真刪除也會等）
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in if !store.toastHeld { store.toastHeld = true } }
            .onEnded { _ in store.toastHeld = false })
        // 時間到：淡掉但原地多擋 0.45 秒點擊，不會點到底下的東西
        .opacity(store.toastFading ? 0.011 : 1)
        .onTapGesture {
            guard !store.toastFading else { return }
            let tap = store.toastTap
            withAnimation(.snappy) { store.toast = nil; store.toastTap = nil }
            tap?()
        }
    }
}

extension View {
    // sheet 裡也看得到訊息條（復原按得到）；開著時 Root 那條先藏起來
    func toastHost(bottom: CGFloat = 16) -> some View { overlay(alignment: .bottom) { ToastHostLayer(bottom: bottom) } }
}

private struct ToastHostLayer: View {
    let bottom: CGFloat
    @Environment(Store.self) private var store
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.clear.allowsHitTesting(false)
            if let t = store.toast {
                ToastBar(text: t, bottom: bottom, ns: nil)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onAppear { store.toastSheets += 1 }
        .onDisappear { store.toastSheets -= 1 }
    }
}
```
sheet 裡傳 ns: nil，跨 sheet 的 matchedGeometryEffect 對不到，也沒意義。朗讀從訊息條的 onAppear 拿掉，是因為 sheet 關掉時 Root 那條會重新出現，放在 onAppear 會再念一次。

d. Root 的 overlay：FoodMapApp.swift:112 改成 `if let t = store.toast, store.toastSheets == 0 {`，刪掉 :113 `let act = store.toastAction`，:114-122 的註解、onMap、onTrip、tripPad、pad 照留（5d713ac 的 tripPad 不要動），:123-181 整段換成：
```swift
                ToastBar(text: t, bottom: pad, trailing: onMap ? 52 : 0, ns: toastNS)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
```

e. 倒數從訊息條拿出來，掛在 Root 上只跑一份。如果 sheet 和 Root 各自倒數，關 sheet 時 Root 那條會從頭再數，可是 Trip.swift:459 的真刪除只等固定 6.5 秒（按著才多等），訊息條還掛著「復原」時資料已經刪掉，按了沒用。在 FoodMapApp.swift:189 剪貼簿 overlay 的右括號後面、:190 `.environment(\.toastNS, toastNS)` 前面加：
```swift
        // 訊息條時間到自己收起來（不管畫在 Root 還是 sheet 裡，只倒數這一份）；手指按著時暫停
        .task(id: store.toast) {
            store.toastFading = false
            guard let t = store.toast else { return }
            AccessibilityNotification.Announcement(t).post()
            let act = store.toastAction
            var left: Double = Store.slowToasts ? 20 : (store.toastSeconds ?? (act == nil ? 2.6 : store.toastTap != nil ? 5 : 4))
            while left > 0 {
                try? await Task.sleep(for: .milliseconds(100))
                if Task.isCancelled { return }
                if !store.toastHeld { left -= 0.1 }
            }
            // 有「復原」的：先淡掉、原地多擋 0.45 秒點擊（想按「復原」剛好消失時，不會按到底下的按鈕）
            if act != nil {
                withAnimation(.easeOut(duration: 0.2)) { store.toastFading = true }
                try? await Task.sleep(for: .milliseconds(450))
                if Task.isCancelled { return }
            }
            withAnimation(.snappy) { if store.toast == t { store.toast = nil; store.toastAction = nil } }
            store.toastFading = false
        }
```
開頭先把 toastFading 歸零再 guard：淡出到一半被新的訊息或「復原」換掉時，新的那條不會留在半透明。

f. 拿掉 d95fd43 自己的 sheet 訊息條：刪掉 TripsList.swift:47-66（:47 的註解、:48-65 的 `.overlay(alignment: .bottom) { if let msg = store.toast, msg.hasPrefix("已刪除「") … }`、:66 的 `.animation(.snappy, value: store.toast)`）。改掛在 sheet 上，不要掛在 TripsList 本身（Trip.swift:60 的推頁 TripsList 時 Root 那條本來就看得到）：MapTab.swift:433 改成 `.sheet(isPresented: $trip.listing) { TripsList().toastHost(bottom: 16).presentationDetents([.medium, .large]) }`。EditSheet 不要加 toastHost（第 4 批 U37 用表單裡的錯誤列，不需要它）。

g. 配合 5d713ac 的「停在露出垃圾桶」：sheet 裡的訊息條貼在底部 16，會蓋住最下面那張卡右邊露出來的垃圾桶，剛好跟「復原」同一個位置。TripsList.swift:44 的 `.padding(.horizontal, 16).padding(.bottom, 30)` 改成 `.padding(.horizontal, 16).padding(.bottom, 80)`，最後一張卡可以捲到訊息條上面，不會只能隔著訊息條點垃圾桶。

跟其他批次的合併寫法（照順序做）：
同批 U23 改 pad 加 onGo 分支。5d713ac 已經把 onTrip 那段換成 tripPad，合起來要保留 tripPad，不能照 U23 原文用 `min(TripMode.shared.panelH, 420) + 8`：
```swift
            if let t = store.toast, store.toastSheets == 0 {          // U96 之後再加 , !(store.askNotify && store.coach.isEmpty)
                let onMap = …（照舊，:116）
                let onTrip = …（照舊，:119）
                let tripPad = TripMode.shared.panelH <= 420 ? TripMode.shared.panelH + 8 : TripMode.shared.panelH - 56   // 5d713ac
                let onGo = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.going   // U23
                let pad: CGFloat = onMap ? store.panelTop + 8 : onTrip ? tripPad : onGo ? max(24, TripMode.shared.goInset + 8) : (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
                ToastBar(text: t, bottom: pad, trailing: onMap ? 52 : 0, ns: toastNS)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
```
第 9 批 U96 要等這項做完：除了 :112 那行加條件，e 的倒數迴圈那行改成 `if !store.toastHeld && !(store.askNotify && store.coach.isEmpty) { left -= 0.1 }`，小卡開著時一秒都不數，回答後才從頭數完整的時間；ToastHostLayer 不用加這個條件。第 10 批 U107 第 (4) 點只改 e 那個 .task 裡的 `var left` 那行，合起來是 `var left: Double = Store.slowToasts ? 20 : (UIAccessibility.isVoiceOverRunning && act != nil) ? 15 : (store.toastSeconds ?? (act == nil ? 2.6 : store.toastTap != nil ? 5 : 4))`；batch10 合2 貼的整段 .task 沒有淡出那段，不要照它整段覆蓋，淡出和朗讀要留著。它第 (6) 點講的 DragGesture 在這項之後是 ToastBar 裡那段 simultaneousGesture。U107 把有「復原」的停到 15 秒時，Trip.swift:459、:548 和 Store.swift:601 的固定 6.5 秒也要跟著拉長，那是 U107 自己的事。第 7 批 U136 只把 pad 的 `store.panelTop + 8` 換成 `store.mapFloatPad`，不要整行覆寫，不然 tripPad 和 onGo 分支會不見。

**模擬器驗收**：用測試帳號建兩個自己的測試行程。1. 地圖右邊「行程」開我的行程（medium 高度），左滑刪一個測試行程、按「刪除行程」：sheet 底部出現「已刪除「…」」，撐滿寬度、「復原」在最右邊；按復原，行程回到原位，浮層沒有送出 DELETE。2. 先進另一個測試行程、把行程面板拉到最高段，再從標題列選單「換行程」開我的行程，刪掉不是正在排的那個：畫面上只能有 sheet 裡那一條，上面變暗的地圖區不能再浮一條。3. 按住 sheet 裡的訊息條超過 6 秒：倒數暫停、放開前不能送 DELETE，放開後繼續數。4. 等訊息條時間到開始淡掉的那 0.45 秒內點「復原」和點訊息條：都沒反應，也不能點到底下的行程卡（不會進行程、sheet 不會關）。5. 再刪一次，不按復原、直接把 sheet 往下拉掉：Root 那條接著出現，剩下的秒數接續（不是從頭重來），在它淡掉前按復原仍然有效；它消失後才送 DELETE。6. 開著 VoiceOver 刪一次再關 sheet：「已刪除…」只念一次。7. 刪掉正在排的那個行程：首頁離開行程模式（d95fd43 的行為照舊），訊息條在 sheet 裡。8. 讓清單長到超過 sheet，捲到最底：最後一張卡可以捲到訊息條上面；在訊息條還在時把某張卡左滑一小段停住，點垃圾桶是刪那張（會先問），不會按到上一筆的「復原」。9. 其他地方的訊息條（地圖首頁貼面板上緣 +8、行程模式貼行程面板、行程面板最高段時在面板最上面那條、店家頁貼按鈕列）位置、倒數、淡出跟改前一樣；刪收藏時照片縮到訊息條的動畫照舊；行程裡左滑刪一站、按住訊息條時刪除照樣會等。10. 開著 sheet 時複製一個網址：剪貼簿膠囊不能跟 sheet 裡的訊息條同時出現。不要真的刪群組行程。

**注意**：d95fd43：它在 TripsList.swift:47-66 加的 sheet 訊息條要整段拿掉，換成 toastHost；它的確認（:67-70）、slideOut: false（:89）和 delete()（:99-104）照留，原修法第 (2) 點作廢。5d713ac：(1) Root overlay 的 :120 多了 tripPad，第 d 點和跟 U23 的合併版都要保留它（行程面板最高段時訊息條放進面板最上面那條）；(2) 卡片左滑一小段會停在露出垃圾桶，sheet 底部的訊息條會蓋在最下面那張卡的垃圾桶上，所以加了第 g 點的底部留白；SwipeToDelete 的 .disabled(swiped) 搬到 TripsList.swift:382，這項沒動它。同批 U23（第 5 批，合6）改同一個 overlay 的 pad，照上面的合併版；U96（第 9 批）、U107（第 10 批）、U136（第 7 批）都要等這項先做，寫法照上面；batch5 合6 的合併版還是 `min(TripMode.shared.panelH, 420) + 8`，以這裡含 tripPad 的版本為準。U66（同一份清單）第 (8) 點要在我的行程下拉失敗時 say 一條訊息：d95fd43 的 sheet overlay 只顯示「已刪除「」開頭的，那條會被 sheet 蓋住，要等這項的 toastHost 做完才看得到。U37（第 4 批）不用 toastHost，也不用等這項。U36（第 4 批）PressStyle 預設不淡，是因為 SwipeToDelete 滑動時 .disabled(swiped)（現在在 TripsList.swift:382），這項沒動那行。U34（第 4 批）的「按住訊息條時刪除也要等」e7af2e1 已經做到，這項把按住的手勢搬進 ToastBar 後 sheet 裡按住也一樣會讓刪除等。fix-list-round1c.md 的「備案 B」（SwipeToDelete 換成 HSwipe）還沒做；如果之後做，要把 5d713ac 的 open、reveal 和 d95fd43 的 slideOut 一起搬過去。剪貼簿膠囊（FoodMapApp.swift:185-189）看 store.toast == nil，訊息條改到 sheet 裡時 store.toast 還是有值，照樣讓位。

### U61（P2・體驗）出發中拖一下地圖就沒有明顯的方法恢復跟隨，也沒有「回到我的位置」鈕

**畫面**：行程模式 → 出發（走路途中拖地圖看前面）

**問題（build 22 時的原始描述，行號是 a1b57b1 的）**：follow() 只在 !positionedByUser 時才移鏡頭，拖過地圖之後就一直不跟。行程模式下定位鈕又被藏起來。點站號其實能重設，但使用者不會知道。

**行號**：3fc00de（見 行號對照.md 的「3fc00de → a10704d」）

**現況**：沒有修。TripPanel.swift:1134-1148 的 follow() 在 :1143 還是 `guard !pos.positionedByUser, …` 才移鏡頭，centered 還是區域變數（:1136）。拖過地圖之後 positionedByUser 一直是 true，就不再跟。出發中畫面上方只有 GoCard（TripPanel.swift:126-129 的 overlay，goCard() 在 :1193），下面是 goBottom（:108-110），沒有回到自己位置的鈕；首頁的定位鈕（MapTab.swift:384-397）在 NearbySheet 上緣，行程模式時整塊藏起來（MapTab.swift:409-413）。TripPanel 在 MapTab.swift:305 是 `.equatable()`，TripPanel.swift:1322 的 == 只比 tid，不能在 TripPanel body 裡看 pos。最近的 commit 只動到旁邊：8559c3d 在連續鏡頭回呼（MapTab.swift:184-194）加了 :187 `if pos.positionedByUser { pins.camAt = now }`，給「地圖在動時不算點圖釘」用；e7af2e1 把換天投放區掛到面板最上面（TripPanel.swift:278-289 的 DayDrops），是 panel 的 overlay，不是出發卡那個 core 的 overlay；8559c3d 把 @GestureState holding 換成 TripPanel.swift:39 的 `@State private var held = RowHeld()`。startGo 在 :1102-1124（:1111 設 going、:1121-1123 沒位置時設 .userLocation），endGo 在 :1126-1130，goRegion 在 :1151-1160。

**修法**：

不能在 TripPanel body 裡看 pos.positionedByUser 來顯示按鈕（TripPanel 是 equatable，pos 變了不重畫），改成 TripMode 上一個被觀察的旗標，由 MapTab 的鏡頭回呼更新，按鈕做成只讀這個旗標的小 view。

(1) TripMode.swift:30 `var going = false                // 出發中` 下面加：
```swift
    var offFollow = false            // 出發中自己拖過地圖（鏡頭不跟了）：「跟著我」鈕看這個
```

(2) MapTab.swift:184-194 的 `.onMapCameraChange(frequency: .continuous)`：在 :188-190 那個 `if !trip.on, pos.positionedByUser, … { MapPanel.shared.go(.low) }` 結束之後、:191 的 `dot.refresh()` 前面加：
```swift
                    // 出發中：拖過地圖就亮「跟著我」，鏡頭被設回 region 就收掉
                    if trip.going, trip.offFollow != pos.positionedByUser { trip.offFollow = pos.positionedByUser }
```
這段回呼也有 U18（第 4 批）、U12 和 U14（第 2 批）、U137（第 7 批）要改，全部做完時合起來是：
```swift
                .onMapCameraChange(frequency: .continuous) { _ in
                    let now = CACurrentMediaTime()
                    if pos.positionedByUser { pins.camAt = now }   // 8559c3d 已經有
                    if !quiet.touched, pos.positionedByUser, now > quiet.until { quiet.touched = true }   // U18
                    // 手指拖地圖：下面那塊降到一行（U14：新帳號的「收藏第一間店」卡不降）
                    let empty = store.mapGroup == nil && store.mine.isEmpty && !store.loading
                    if !trip.on, !empty, pos.positionedByUser, now > quiet.until, now > MapPanel.shared.calmUntil, !MapPanel.shared.dragging {
                        MapPanel.shared.go(.low)
                    }
                    // U12：手指拖、縮放離開「只列這幾間」
                    if !trip.on, pos.positionedByUser, now > quiet.until {
                        seenBox.zoomed = nil
                        if seenBox.only != nil { withAnimation(.snappy) { seenBox.only = nil } }
                    }
                    if trip.going, trip.offFollow != pos.positionedByUser { trip.offFollow = pos.positionedByUser }   // U61
                    dot.refresh()          // U137 有做才刪
                    pinFrame(proxy)
                    if let c = spot.coord, Date() < spot.until { spot.at = proxy.convert(c, to: .global) }
                }
```
還沒做的那幾項就先不寫它那行，U61 這行一律放在 dot.refresh()（或它原本的位置）前面。

(3) TripPanel 加一個不被觀察的盒子，取代 follow() 的區域變數 centered。TripPanel.swift 檔尾（TripPanel 之外）加：
```swift
// 出發中鏡頭上次對準的位置（不被觀察，寫了不重畫）：follow() 和「跟著我」共用
final class FollowBox { var centered: CLLocation? }
```
TripPanel.swift:33 `@State private var goTop: CGFloat = 0` 下面加 `@State private var followBox = FollowBox()`。follow() 裡三處：:1136 `var centered = here          // 出發時已經移到這裡` 改成 `followBox.centered = here      // 出發時已經移到這裡`；:1143 換成下面兩行（順便把第 6 批 U70 合4 的修正一起放進來：出發那一刻還沒有位置時，第一筆位置一定移過去，出發前拖過地圖也一樣；有位置的情況行為不變，U70 還沒做也可以先這樣寫）：
```swift
                let first = followBox.centered == nil
                guard first || !pos.positionedByUser, followBox.centered.map({ $0.distance(from: l) >= 40 }) ?? true else { continue }
```
:1144 `centered = l` 改成 `followBox.centered = l`。

(4) follow() 結束的 :1148 後面加：
```swift
    // 「跟著我」：鏡頭回到目前位置。設成 region 後 positionedByUser 變回 false，follow() 自然接手；下一次 40 公尺從這裡算
    private func recenter() {
        guard let h = here else { return }
        followBox.centered = h
        withAnimation(.easeInOut(duration: 0.6)) { pos = .region(goRegion(h.coordinate)) }
    }
```
不要用 .userLocation，那樣 goRegion（:1151-1160）算好的位置（藍點放在 GoCard 和底部中間）會被蓋掉。

(5) 按鈕做成只讀 TripMode 的小 view，放在 TripPanel.swift 檔尾：
```swift
// 出發中拖過地圖才出現：按了鏡頭回到自己的位置、繼續跟（只有這顆看 offFollow，面板不跟著重畫）
struct FollowMeButton: View {
    @State private var mode = TripMode.shared
    let action: () -> Void
    var body: some View {
        ZStack {
            if mode.offFollow {
                Button(action: action) { CircleIcon(icon: "location.fill") }
                    .buttonStyle(PressStyle(haptic: true))   // 按下當幀就輕震，action 裡不要再震
                    .accessibilityLabel("跟著我")
                    .transition(.opacity.combined(with: .scale))
            }
        }
        .animation(.snappy(duration: 0.2), value: mode.offFollow)
    }
}
```
TripPanel.swift:127-129 現在是：
```swift
            if mode.going, let next {
                goCard(t, order: order, next: next, plan: plan).padding(.horizontal, 14).padding(.top, 6)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { goTop = $0 }
```
換成：
```swift
            if mode.going, let next {
                VStack(alignment: .trailing, spacing: 8) {
                    goCard(t, order: order, next: next, plan: plan)
                        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { goTop = $0 }
                    FollowMeButton { recenter() }
                }
                .padding(.horizontal, 14).padding(.top, 6)
```
:130 的 `} else if mode.searchOn && !mode.going {` 和後面不動。onGeometryChange 要留在 goCard 本身，不能量整個 VStack，不然按鈕出現時 goTop 變大，goRegion 會算錯中心；原本的 padding 只有上緣 6，量 goCard 的 maxY 跟原本一樣。

(6) 出發和結束都把旗標歸零：startGo 的 :1111 `withAnimation(...) { mode.going = true; mode.cand = nil }` 下面加 `mode.offFollow = false`；endGo 的 :1128 `withAnimation(...) { mode.going = false; finished = false; rate = nil }` 下面也加 `mode.offFollow = false`。

**模擬器驗收**：用測試行程按出發，模擬器 Features > Location 設成 City Run。(1) 一開始沒有「跟著我」鈕，藍點每走 40 公尺鏡頭跟一次。(2) 拖一下地圖：GoCard 下緣右側淡入「跟著我」，之後鏡頭不再跟。(3) 按「跟著我」：按下就輕震，鏡頭 0.6 秒移回藍點（位置和出發當下一樣在卡片和底部中間），按鈕淡出，接著繼續跟。(4) 按鈕出現、消失時 GoCard 和鏡頭中心不能跳。(5) 地圖停好後點地圖上的站號讓鏡頭飛過去：按鈕也要收掉（鏡頭被設回 region）。(6) 按「結束」再出發一次：一開始不能有按鈕；出發中從行程膠囊選單「換行程」切到別的行程再切回來出發，一開始也不能有按鈕（U24 做完後出發中已經沒有「完成」，所以不用「完成」測）。(7) 先把 Location 設成 None、拖一下地圖再按出發，接著改成 City Run：拿到第一筆位置時鏡頭要移過去。(8) 開 PerfHUD 確認拖地圖時 TripPanel 的重算次數沒有因為這顆按鈕增加；兩指縮放放開時手指剛好在站號上，不能算點了站號（8559c3d 的行為要照舊）。

**注意**：跟 U24（第 5 批，合9）：U24 拿掉出發中的「完成」，驗收 (6) 已經改成用「換行程」測，程式不用改。跟 U70（第 6 批，合4）：U70 拿掉 startGo 沒位置時的 .userLocation（TripPanel.swift:1121-1123），follow() 第一筆位置會被 positionedByUser 擋住；上面 (3) 已經把 first 的寫法放進來，U70 做的時候不用再改 follow()，只要補它自己的驗收。跟 U18（第 4 批）、U12 和 U14（第 2 批）、U137（第 7 批，第 2 批合12）：都改 MapTab.swift:184-194 這段連續鏡頭回呼，照 (2) 的合併版放，U137 刪掉 dot.refresh() 後 U61 那行放在 pinFrame(proxy) 前面。fix-v11-acd4471.md（RowHold）已經做完，TripPanel 多了 :39 的 held，跟這裡加的 followBox 不衝突；FollowBox、FollowMeButton 跟 RowHold.swift 的型別不同名。e7af2e1 的 DayDrops 是 panel 的 overlay（TripPanel.swift:278-289），這項改的是 core 的 `.overlay(alignment: .top)`（:126-130），不重疊。perf-round1b.md 動的是鏡頭停下的回呼（MapTab.swift:195 起），不是 continuous 那個，不衝突。
