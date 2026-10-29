# perf-round1c：E1–E7 判讀與 4.A–G 建議（對 d95fd43）

來源：模擬器 thread 量的 E1–E7（52a0b69 量測 build，e7af2e1 上重跑）。兩位分析員各自判讀，再分三組由反方逐項推翻。下面寫的是推翻之後留下來的結論；分析員原本的說法被推翻的地方，在各項的「更正」裡寫明。

行號：MapTab.swift、Perf.swift、Reel.swift 從 e7af2e1 到 d95fd43，只有 MapTab.swift:614 改了一行，行號照用。

## 1. 結論

### 1.1 能確定的

- 3.1 到 3.3 都已經在 e7af2e1 裡：Draw.swift:127、:135，Supa.swift:265-270，Reel.swift:186-195。
- 背景建播放器有效。Console 印「建播放器 4 ms，在主執行緒：false」；-reelMain 時主執行緒有 8 個 player 樣本，基準是 0。
- E4 兩種入口都沒有等 surface，034e6b5 那 90 個 semwait 沒重現，這條線收掉。
- perf-round1b 假設的「emoji 字形載入是主執行緒最大一塊」沒有重現。s1b 的 loadPartAtIndex、CopyGlyphPath 全是 0 到 1。s2b 只有 E1 第一次遠飛有 25 個，E3 重跑基準是 0。重跑也是重新啟動，所以這比較像跨啟動的快取第一次沒命中，或第一次飛到這區時 MapKit 在載地名字形，不是「每次啟動一次」（推論）。

### 1.2 還不能下結論的

- s1b 同條件重複的雜訊很大。冷的最長幀 5 次是 83、83、97、183、198，busy 是 198、417、363、365。-emojiImg all 的 60、73、95 排名檢定單邊 p 約 0.07，不夠。
- s2b「基準降落幀 122 到 140」的來源對不上。results 裡能確定是基準的降落幀只有 E1 的 2025:127。140 是 -noMidStop 那次的最長，132 是 -noSpin 的最長，都不是基準。所以 A 和 E 用的對照組其實只有 1 次。
- E1 的 busy 198 和最長幀 198 剛好一樣，可能抄錯，要回頭看原始檔。
- 每一幀落在哪個事件，都是從錄影推的。錄影時間軸上「飛完約 1950–2000」，浮層記的是「飛完（第 1386–1425 ms）」，兩者起點不同，對不起來。xctrace 沒錄到。
- Anthony 最在意的「按下那一幀就開始動」完全沒量到。長幀都從第一個動作幀起算。浮層上的「點圖釘 N ms」「飛完 X ms」也沒轉述。

### 1.3 建議一覽

| 項 | 建議 | 改外觀或時機 | 要問 Anthony |
|---|---|---|---|
| H1 掉幀和手指時間印到 Console | 下一版就做 | 不改 | 不用 |
| A emoji 換成預畫的圖 | 再量（加 -noEmoji 對照） | 改外觀（渲染方式） | 量完成立才問，附截圖 |
| A' 只預熱 | 不做 | | |
| B 拿掉 850ms 預載延後 | 先問，再補量 s2b | 改時機 | 要 |
| C 面板影子 | 不做 | | |
| D 半空停下不重組泡泡 | 現在不做，H1 進去後順便看 | 改外觀 | 有證據才問 |
| E 降落後清單晚 0.6 秒換 | 再量（清單、泡泡拆開量） | 改時機 | 量完成立才問 |
| F PinBurst 縮小框 | 先看現成檔案 | 不改（照程式算） | 不用 |
| G setCategory | 先加量測，幾 ms 以上就改 stop() | 不改 | 不用 |
| G InsetLayoutComputer | 先看現成檔案 | 還不知道 | 看結果 |
| G 外觀類（變淡、店名牌、拉遠、drawingGroup） | 不動 | | |

現在只有 B 需要 Anthony 決定。A、E 要等第 4 節重量完，數字成立才問。

## 2. 下一版 Swift 要做的（只動量測，看不出差別）

都只在 -perfOverlay 或連點版本號打開浮層時才會多印 Console；正式版連浮層都打不開（Perf.swift:32-38）。

### 2.1 H1：掉幀、手指、記號印到 Console（Perf.swift）

1. :29 下面加：
   ```swift
   @ObservationIgnored private var firstAfter: (name: String, at: CFTimeInterval)?   // 量測：手指按下或放開後主執行緒送出的第一幀
   // 量測用：只印到 Console、不上浮層（body 裡寫 let _ = Perf.shared.note("附近重算")）
   func note(_ s: String) {
       guard on else { return }
       print(String(format: "[perf] %.3f 記號 ", CACurrentMediaTime()) + s)
   }
   ```
2. :40-43 的 touched 改成：
   ```swift
   func touched(_ down: Bool) {
       let t = CACurrentMediaTime()
       if down { touchDown = t } else { touchUp = t }
       guard on else { return }
       firstAfter = (down ? "按下" : "放開", t)
       print(String(format: "[perf] %.3f 手指", t) + (down ? "按下" : "放開"))
   }
   ```
3. :48 的 `guard on else { return }` 後面加 `note(name)`。
4. :75 改成：
   ```swift
   if last > 0, now - last > frame * 1.5 {
       drops.append(now)
       print(String(format: "[perf] 掉幀 %.0f ms（%.3f 到 %.3f）", (now - last) * 1000, last, now))
   }
   if let f = firstAfter {
       firstAfter = nil
       // 用現在的時間算，不用 l.timestamp（那是這一幀開始的時間，可能比手指還早）
       print("[perf] 手指" + f.name + String(format: "後第一幀 %.0f ms", (CACurrentMediaTime() - f.at) * 1000))
   }
   ```
   掉幀全部印（超過 1.5 幀），不要只印 50ms 以上：25 到 50ms 的兩三幀頓也要看得到，事後 grep 再篩。
5. :98 的 lines.insert 後面加 `print("[perf] " + lines[0])`，浮層那行「點圖釘 N ms」也進 Console。

CADisplayLink 的 timestamp 和 CACurrentMediaTime 是同一個時基，可以直接對。

### 2.2 記號

- Reel.swift:175 的 append 前加 `Perf.shared.note("影片預載好")`。
- MapTab.swift:1877 改成 `Perf.shared.note("圖釘封面到"); withAnimation(.easeOut(duration: 0.25)) { img = i }`。
- MapTab.swift:1045 加一行 `let _ = Perf.shared.note("附近重算")`，原本的 signpost 留著。
- Photo.swift:117 先不加，清單捲動時會洗版。
- MapTab.swift:2218 的 `print("[emoji] 預熱完成")` 不要改成只在 on 時印；沒加 -perfOverlay 時也要等這行。

### 2.3 Reel 量測

- Reel.swift:174 改成下面這樣，才分得出是 PlaceMedia 多建了一支，還是兩個 warm 同時拿網址、後建的被丟掉：
  ```swift
  guard !ready.contains(where: { $0.src == src }) else {
      if Flag.on("-perfOverlay") { print("[reel] 重複建的，丟掉") }
      pl.replaceCurrentItem(with: nil); return
  }
  ```
- Reel.swift:124 和 :26 前後量毫秒數（:26 是按喇叭那一下，剛好在手指按下那一幀）：
  ```swift
  let t = CACurrentMediaTime()
  try? AVAudioSession.sharedInstance().setCategory(.ambient)
  if Flag.on("-perfOverlay") { print("[reel] stop 設聲音類別 \(Int((CACurrentMediaTime() - t) * 1000)) ms") }
  ```
  :26 照樣包，文字改成「喇叭設聲音類別」。

### 2.4 E 拆開量的分支（MapTab.swift）

-landDefer 把附近清單和泡泡重組一起延後，分不出是哪個。在 :237 的右括號後面、:238 之前加：

```swift
// 量測用：只延後清單（-landDeferList）或只延後泡泡重組（-landDeferCluster）
if landed && (Flag.on("-landDeferList") || Flag.on("-landDeferCluster")) {
    let lateList = Flag.on("-landDeferList"), lateCluster = Flag.on("-landDeferCluster")
    selfMoved = false
    seenBox.set(c.region, publish: !lateList && !trip.on)
    if !lateCluster { recluster(proxy) }
    nearTask?.cancel()
    nearTask = Task {
        try? await Task.sleep(for: .milliseconds(600))
        guard !Task.isCancelled else { return }
        Perf.shared.mark("降落後補做")
        if lateList { seenBox.set(seenBox.peek, publish: !trip.on) }
        if lateCluster { recluster(proxy) }
    }
    return
}
```

### 2.5 工具（apps/food-map-ios/tools/sampletree.py）

加一個 `--all` 參數：:62 現在只選主執行緒，加了 --all 就列出每個執行緒在 CA::Transaction::commit、CA::Context::commit_transaction、CA::Layer 底下的樣本數和執行緒名字（給 H2 用）。這是量測工具，不是 App 程式，模擬器 thread 在 Mac 上自己改也可以。

## 3. 不用重量，先看現成檔案和錄影（模擬器 thread）

1. 從 E1、E2、E3、E5、E6 的錄影讀浮層：s1b 每組的「點圖釘 X ms」，s2b 每組的「飛完（第 N ms） X ms」，-landDefer 那次的「降落後補做 X ms」。錄影裡看不到浮層就跳過，等第 4 節。
2. 說明「降落幀基準 122 到 140」是哪幾次、什麼參數；E1 的 busy 198 有沒有抄錯。
3. 5.1 補丁對現成檔：
   - E1 s2b 和「對照不遠 s2b」：`loadPartAtIndex 'TFontHandler::CopyGlyphPath' ApplyVariationsToGlyph`。上層是 VectorKit／MapKit 就結案（地名字形，A' 管不到）。上層是 FoodPin、ClusterBubble、DiceChip 才另外做重現實驗（第 4 節 M7）。
   - E2 s1b 冷不加、-emojiImg all，E1 s2b、E3 -emojiImg all：`CABackingStoreUpdate_ CTFontDrawGlyphs CGContextDrawImage FoodPin ClusterBubble`，看換圖省掉的是哪一塊。
   - E2 s1b 冷和 E1 s2b：`InsetLayoutComputer`，看是 MapTab.swift:309 的上方 inset 還是 :338 的面板。
   - E1 s1b 和 E7 -smallBurst：`_display madvise`，比非字形部分（F）。
   - 任一檔：`vSepConvolve make_cgimage`，看模糊是哪個 view 的（C 已經不做，只是順便知道）。
4. 2.5 的 --all 對 E1 s2b、E2 s1b 冷各跑一次，看同時在提交 CA 的是 VectorKit、AVFoundation 還是 SwiftUI。
5. sampletree 對 E2 不加參數的冷、熱各跑一次，列出主執行緒樣本差最多的前 10 個函式（H5）。注意冷的那次地圖從全台平移到嘉義，熱的幾乎不用移，差別可能是移得遠造成的。

## 4. 重量（2.1–2.4 進去之後）

共同規則：

- 每組至少 5 次，幾組交錯跑，每次 terminate 再 launch，等 Console 出現「[emoji] 預熱完成」才動手。
- 整輪開始前先不計地飛一次遠的，讓跨啟動的圖磚快取先熱起來；之後每次照樣重新啟動。
- 報的是：對上記號的那筆掉幀（飛完、降落後補做、點圖釘）、超過 50ms 的掉幀次數、「手指按下後第一幀」「手指放開後第一幀」。每項報中位數和範圍，不要再用整段最長幀。
- 錄影照錄。錄影有空檔但 Console 沒掉幀，就是靜止畫面或 render server 慢。

| 代號 | 量什麼 | 怎麼量 | 怎麼判 |
|---|---|---|---|
| M1（A） | emoji 換圖省的是不是畫字 | s2b 遠飛冷，和 s1b 冷，各三組交錯：不加、-emojiImg all、-noEmoji | all 和 -noEmoji 都比基準低（各 4 次以上），才算是 emoji 文字的成本，照 A 的做法截圖給 Anthony 看。只有 all 低、-noEmoji 沒低，表示省下的不是畫字，回第 3 節找原因 |
| M2（E） | 降落那幀是清單還是泡泡重組 | s2b 遠飛冷，三組交錯：不加、-landDeferList、-landDeferCluster | -landDeferList 有 4 次以上「飛完」那筆掉幀 ≤ 70ms，才問 Anthony 要不要做 4.E。只有 -landDeferCluster 降，成本在泡泡重組，回頭看 A，不延後泡泡 |
| M3（H4） | 按下那一幀 | s1b 冷、熱，s2b 按 🎲，各 5 次 | 「按下後第一幀」「放開後第一幀」超過 33ms 的次數多，排在 A、E 前面處理 |
| M4（H5） | 冷比熱貴是不是第一次的成本 | 熱的那次改點一根在螢幕上離中心和冷的那根差不多遠的圖釘，讓平移距離一樣；冷熱各 5 次交錯 | 對齊後冷還是明顯比熱貴，再看第 3 節第 5 點是哪些函式 |
| M5（B） | 預載提早會不會搶降落 | s2b 遠飛，加不加 -reelNow 各 3 次；Wi-Fi 下 -reelNow 點有 Reel 的店，300ms 內點大卡進店家頁 | 降落幀和降落後圖磚空白時間沒變差；「建播放器」行數減「重複建的，丟掉」行數不大於 1 |
| M6（D） | 半空重組貴不貴 | 不另外跑，看 M1、M2 的紀錄 | 「飛行中停下」記號後 100ms 內，5 次裡有 2 次以上掉幀超過 50ms，再用 -noMidStop 和不加交錯各 3 次，同時比 mutex 數。沒有就結案 |
| M7（H2、H3） | 降落後約 900ms 那幀、第一次遠飛的字形 | -drawWin 選兩個沒飛過的縣市，各飛第一次，再重飛同一地區一次 | 看降落後 1.5 秒內的掉幀，前面最近的記號是「圖釘封面到」還是「影片預載好」。量完清掉 drawRecent |
| M8（G） | setCategory | 推有 Reel 的店家頁冷、熱各 3 次，開聲音再離開 3 次 | 「設聲音類別」常常幾 ms 以上，就做 G 的 stop() 改法 |

E8（實機 Instruments）還是要做，等 M1 成立再排，因為要在實機上也看得到才值得改外觀。

## 5. 各項判讀

### A. emoji 換成預畫的圖：再量

- 照 perf-round1b 4.A 的觸發條件，四條都不成立：HVF 本來就沒東西可降、熱的不高（基準 65，all 熱 80）、E1 沒對上長幀、E8 沒做。
- 有一個沒料到的訊號：全部換圖讓長幀變短，但字形那幾支本來就是 0，所以省下的是別的。兩位分析員推的機制是「新出現的圖釘、泡泡要用 CPU 把文字畫進 layer」。反方指出：真是這樣，-noEmoji 應該至少跟 all 一樣省，但 s1b 冷的 -noEmoji 只量 1 次，最長 108、busy 341，沒有比較好。所以 M1 一定要加 -noEmoji 對照。
- 更正：分析員建議把 EmojiSlot 改成不觀察的普通類別，讓已經在畫面上的圖釘維持文字。不要這樣改。圖釘的 body 在選中時一定會重算（MapTab.swift:1831），到那時讀到 slot 有圖，就會剛好在按下那一幀從 Text 換成 Image，這正是 -emojiImgSel 的情況（中位 127，比基準還差）。現在 MapTab.swift:2182 的 @Observable 寫法比較好：換圖發生在預熱那 2 到 3 秒，不在點的那一幀。
- 成立之後的上線改法：MapTab.swift:2186-2189 預設改成三種都換，留 -emojiText 切回文字對照。Flag.args 在正式版是空陣列（Perf.swift:176），走三種都換。預熱完換圖那一下如果量到卡頓，把預熱提早到圖釘出現之前，不要讓圖釘留著文字。
- 預熱本身要量：MapTab.swift:2206 的 ImageRenderer 前後印毫秒。總共 19 張（9 種圖釘、9 種泡泡、1 個 🎲）。

### A'. 只預熱不換圖：不做

s1b 本來就沒有字形載入，沒東西可省；-emojiWarm 量 1 次最長 150、busy 423，沒有變好。s2b 那 25 個要等第 3 節第 3 點看是誰的。啟動後約 2 秒會在主執行緒陸續畫二十幾張圖，那時剛好在拖地圖可能有小頓（推論）。

### B. 拿掉 850ms 預載延後：要問 Anthony

- 長幀數字撐不起「沒變差」：E6 每組 1 次，-reelNow 最長 97、不加 83，都在雜訊內。撐住的是程式：warm 在主執行緒只做幾個檢查和開一個 Task（Reel.swift:166-171），拿網址、解 JSON、建播放器都在背景（Supa.swift:270-283、Reel.swift:187-194）。所以提早 warm 照程式看只多不到 1ms 的主執行緒工作（推論，沒量過）。
- 更正：另一位分析員說「很快點進去的人本來就有預載」不對。按下才開始拿網址，推頁後 .task 馬上 take（Reel.swift:42），網址多半還沒回來，拿不到，PlaceMedia 會睡 350ms 再自己建一支（Reel.swift:47-50）。
- 代價：warm 開的 Task 換別間時不會取消（Reel.swift:170），Wi-Fi 下快速連點，每一間都會打一次 reel-video 雲端函式；雲端被 IG 擋的時候，手機還會自己去抓 IG 的兩個頁面（Reel.swift:149、:243-249）。現在的 850ms 剛好把 0.85 秒內就換掉的店擋掉。行動網路不受影響（Reel.swift:168 本來就不先載）。
- MapTab.swift:632 的註解「等地圖移完再開始」對遠飛已經不成立：飛完在 1386 到 1425ms，850ms 本來就在半空。
- 改法（Anthony 同意後）：MapTab.swift:633-635 改成
  ```swift
  if Flag.on("-noReelWarm") {
  } else if Flag.on("-reelWait") { Task { try? await Task.sleep(for: .milliseconds(850)); if pins.sel == p.id { ReelCache.warm(p) } } }
  else { ReelCache.warm(p) }
  ```
  :632 的註解改成現在的情況（拿網址、建播放器都在背景）。合併前跑 M5。
- Anthony 不同意的話：維持 850ms，只在 :635 的條件加 `&& store.mapPath.isEmpty`（已經進店家頁就不再 warm 一次），畫面和時機都不變。
- 我的建議：做。主執行緒是中性的，影片早一點出來，多用的流量只在 Wi-Fi 下快速連點時才有。

### C. 面板影子改成上緣條：不做

-noPanelShadow 和 -noBubbleShadow 的開關確實把 opacity 和 radius 一起設成 0（MapTab.swift:1196、:2094），實驗有效。-noPanelShadow 時 vSepConvolve 是 10，比基準 6、7 還多，觸發條件「降到 0」不成立。上緣條自己也是 radius 12 的模糊，一樣幫不上。上限本來就小（4 秒累計 4 到 10 個樣本）。更正：分析員列的候選 Draw.swift:379、:546 是抽一間的設定面板和抽卡那疊卡，s1b 時不在畫面上；比較可能的是跟著面板上下的行程和定位兩顆（MapTab.swift:380、Theme.swift:159），推論。

### D. 半空停下不重組泡泡：現在不做，M6 順便看

更正：分析員用「-noMidStop 沒讓最長幀變好」推論半空重組不是問題，指標用錯了。半空停下約在錄影第 900ms，E1 有位置的長幀只有 568、2025、2905，-noMidStop 的 140 沒寫位置，所以「半空那一幀長不長」其實沒量到。但也沒有數字說它貴，而且 4.D 會改畫面（第二段降落途中會是一堆沒合起來的圖釘，落地才合成泡泡），所以現在不做。MapTab.swift:214 的 -noMidStop 留著。

### E. 降落後清單晚 0.6 秒換：再量

- -landDefer 那次降落幀 43（基準只有 E1 的 127 一次），方向支持「降落那幀是我們觸發的」，但只有 1 次。
- 「長幀往後移 0.6 秒」對不上：2260:57 落在降落後約 300ms，不是 600ms。
- -landDefer 同時延後清單（:233）和 recluster（:234），4.E 只延後清單。-emojiImg all 沒延後任何東西，降落幀也降到 72。如果成本大致可以相加（推論，各 1 次），只延後清單能省的在 30ms 以內。所以先跑 M2。
- 更正：另一位分析員判「現在就做」，並在 PinState.select(nil) 加 onClear 去補做清單。不要這樣做：降落後 0.6 秒內按 ✕（MapTab.swift:1227-1228）或點地圖空白處（:107），清單重建會擠進按下那一幀，違反「按下那一幀就要開始動」。他寫的「離開行程時 :449 照舊 publish」也不對，離開行程那行是 :458；later() 0.6 秒後一律 publish: true，沒有再看一次 !trip.on。
- M2 成立後的改法：照 4.E 原文，在 :239 前面加 `landed && pins.sel != nil && !trip.on` 的分支，publish: false，0.6 秒後用 `publish: !trip.on` 補。0.6 秒內關卡時卡片列要不要捲到抽中那間，先照 perf-round1b 第 6 節的降落回歸測；出錯了，「關卡時補做（關卡那一幀變重）」或「縮短 0.6 秒」都要問 Anthony。
- 會看得出：降落後 0.6 秒內把面板拉到最高段，會看到舊地區的清單再換掉；0.6 秒內關大卡，會短暫看到舊地區的卡片列。

### F. PinBurst 縮成小框：先看現成檔案

更正：分析員說觸發條件「三條都沒成立」，其實只有 madvise 有數字（s1b 基準 1，-smallBurst 0），_display 非字形部分和 backboardd 都沒量。外觀照 e7af2e1 重算過：小框原點 (at.x-o.x-110, at.y-o.y-150)，圓頭在框內 (110, 150-rise)，rise 29 到 49，光圈最大半徑 96 加線寬一半，最上緣在 3.5，糖粒最低約 207、左右在 110±82 以內，都在 220×240 裡，畫面應該一樣（要錄影逐幀比光圈最大、糖粒最低那幾幀確認）。動畫只有 0.7 秒，模擬器上不太會少掉長幀；真正的成本是實機 GPU，要 E8 看。第 3 節第 3 點的數字支持的話，不用問 Anthony 就可以做：MapTab.swift:1905-1912 只留 :1907-1909 的小框，全螢幕 Canvas 用 -bigBurst 切回對照，draw()（:1927）旁註明框是 220×240、圓頭在 (110, 150-rise)，以後改半徑、糖粒距離或 rise 要跟著重算。

### G. 其他

- setCategory：2.3 先量。常常幾 ms 以上就改 stop()（Reel.swift:119-125），順序、聲音都不變：
  ```swift
  private func stop() {
      player?.pause()
      if let loop { NotificationCenter.default.removeObserver(loop) }
      player = nil; loop = nil
      let loud = !muted
      muted = true
      // 開過聲音（:26 切成 .playback）才要切回；新進來的頁 muted 本來就是 true，播之前 :54 會設好
      if loud { try? AVAudioSession.sharedInstance().setCategory(.ambient) }
  }
  ```
  整個 App 只有 Reel.swift:26、:54、:124 碰 AVAudioSession。不要改成非同步再排佇列，會牽涉 .ambient 蓋掉 .playback 的順序問題。
- InsetLayoutComputer：第 3 節第 3 點，數字 6、19、15，各 1 次，上限 4 秒累計 8 到 27ms。
- 外觀類（變淡、店名牌、拉遠幅度、🎲 旋轉、跳釘、drawingGroup）：-noHopScale、-noSpin 都只量 1 次，只能說「沒看到成本」；其他沒量過。會改外觀、又沒有省到的證據，不動。

### H. 新發現

- H2 主執行緒等 CA 的鎖：__psynch_mutexwait 不在 sampletree 的 IDLE 清單（tools/sampletree.py:8），所以算忙。s2b 35 個，23 個上層是 MapKit 圖釘狀態更新（MKAnnotationContainerView _performStateUpdatesIfNeeded）在等 CA commit 的鎖。查出拿鎖的是誰，我們能動的也只有「少在降落那一刻改 Map 的 annotation」，就是 E、D 在做的事，所以 H2 只幫 E 判斷，不會自己產生修法。更正：「-emojiImg all 那次 mutex 只有 2」是 s1b 的數字，不能拿 s2b 去比。
- 降落後約 900ms 那幀（E1 2905:198、E3 2880:288 靜止空白）：很可能是同一種東西。那時選中的 spring、PinBurst、大卡升起都播完了，錄影只在畫面有變時才寫一幀（推論）。也可能是第一次飛到新地區，圖釘封面照片陸續到、各自淡入（MapTab.swift:1873-1877）。M7 用記號分。要是之後真的要讓預載等降落，寫成最多再等 1.5 秒（quiet.flyTo 只有對上終點時才清掉，MapTab.swift:201-204，沒對上會一直等），而且這也是改時機，要問 Anthony。
- H5 冷比熱貴：混了「第一次建畫面」和「地圖移得遠」，現在分不開，M4 對齊平移距離再看。預熱大卡這類修法現在談太早。

## 6. 第 3 節的結果（模擬器讀 52a0b69 現成檔，2026-10-29 17:35Z）

更正和更新，第 4 節照跑，判讀照這裡：

- **基準降落幀是 83，不是 122 到 140。** 那個範圍混了 E1 127、-noHopScale 122、-noMidStop 140。E3 基準降落附近最長是 83（1960ms），只有 1 次。所以 -emojiImg pin 97、all 72、-landDefer 43 都要跟 83 比，A 在降落幀上幾乎看不出差別，只剩 -landDefer 的 43 明顯低。E1 s1b busy 198 沒抄錯。
- **浮層的「飛完 X ms」量不到降落那一下（都是 3 到 6）。** 推論：onMapCameraChange 是在 MapKit 自己的逐幀回呼裡跑的，Perf 的 tick 緊接在同一幀，SwiftUI 的更新和 CA 提交還沒做。所以 M1、M2 一律看 H1 印的「掉幀」那幾行，不要看浮層的「飛完」。
- **「降落後補做 82 ms」是真的成本。** 它是從 Task 打的記號，下一個 tick 在 SwiftUI 更新和提交之後，所以 82ms 就是附近清單加泡泡重組一起做的那一幀。這是目前找到最大的一塊單幀成本。也表示只延後（4.E 原樣）是把 80ms 的卡頓搬到 0.6 秒後，不是拿掉。M2 拆開量之後，修法要往「變便宜」或「拆到不同幀」走：哪一塊貴就先處理哪一塊（清單重建或泡泡重組），兩塊分在相鄰兩幀做也是選項。這只差一兩幀，看不出時機改變（推論，量完再確認）。M2 請同時記「降落後補做」那筆掉幀。
- **字形重畫是我們的 emoji，不是地名。** loadPart、CopyGlyph 的上層是某個 CALayer 用 CGDisplayList 在 CPU 上重畫字形；-emojiImg all 讓 s2b 的 ripc_DrawGlyphs 從 39 降到 7、CABackingStoreUpdate_ 從 81 降到 30，所以畫的是 -emojiImg 換掉的那幾種 emoji（推論：MapKit 把 SwiftUI 標註畫進 layer 的 backing store，縮放時重新點陣化）。s1b 冷沒有省。所以 A 只在 s2b 遠飛（很多新圖釘、泡泡一起出現）有 CPU 上的證據，M1 以 s2b 為主。
- **F 結案，不做**：E7 -smallBurst 的 _display 是 203，比不加的 131 還多，縮小框沒有省到。
- **C 結案，不做**：vSepConvolve、make_cgimage 都在 RenderBox 的 apply_blur 底下，沒有 App 的 frame。
- **H2 的另一個提交者是 SwiftUI.AsyncRenderer**（s2b 47 個樣本，s1b 冷 7 個），沒有 VectorKit、AVFoundation 的執行緒在提交 CA。App 裡沒有 drawingGroup 或 rendersAsynchronously；用到 Canvas 的有 PinBurst（MapTab.swift:1924、:1928）和 Draw.swift:813，另有 4 個 TimelineView。M7 看 mutexwait 多的那幾幀時，順便記當時有沒有 PinBurst 在播。
- **InsetLayoutComputer**：沒有 App 的 frame，分不出 :309 還是 :338，先不追。
- **H5 冷比熱貴**：沒有單一熱點，多的是 Swift metadata 第一次查表、SwiftUI 圖第一次建、VectorKit。浮層「點圖釘」冷的是 86 到 148ms，熱的是 43 到 67ms。M3、M4 量完，冷的「放開後第一幀」如果常常超過 100ms，再考慮開 App 後在空檔先建一次大卡（改時機，要問 Anthony）。

## 7. M1 到 M8 和 emoji 對照截圖（2026-10-29 18:05Z）

數字在模擬器的回報裡，結論：

- 按下那一幀沒問題（13 到 22ms）。重的是放開後狀態改變的那幾幀：選店那一幀（s1b 點圖釘冷中位 94，88 到 117；s2b 抽中前一幀 58 到 68）、第一次進店家頁（99 到 251，之後 54 到 83）、降落時附近清單（48 到 57）。這三個另外追了成本，修法另寫。
- A：s1b 成立（all 5 次都 ≤90，-noEmoji 4 次比基準低），s2b 不成立。對照截圖看到一個要先修的問題（下面）。
- B：M5 降落沒變差（飛完 47，不加 54），沒有重複建播放器，可以問 Anthony。
- E：成本在附近清單，不在泡泡重組；照原樣延後只是把 33 到 60ms 搬到 0.6 秒後，整段最長沒降，所以先不問，改追怎麼讓它變便宜。
- D、H2、H3、H5 結案：半空停下後 100ms 內沒有超過 50ms；降落後約 900ms 那幀沒重現；冷熱差多半是平移距離。
- G setCategory：每次啟動後第一次進店家頁 25ms，照第 5 節 G 改 stop()，不用問。

### emoji 換圖的泡泡數字折成兩行

-emojiImg all 時，泡泡的家數會折成兩行（47 變成上 4 下 7，21、16、61 也一樣），全台和降落後都有。推論：圖是用 3.3 倍畫的，點數寬度經過像素取整後比文字寬一點點；地圖標註的大小在第一次排版（還是文字）時就定了，換成圖之後數字拿到的寬度比它要的少一點，Text 就折行。改法（只影響 -emojiImg，不加參數時畫面不變）：

MapTab.swift:2105（ClusterBubble 的數字）改成：

```swift
                    Text("\(c.ids.count)").font(.system(size: 17, weight: .black)).foregroundStyle(.white)
                        .lineLimit(1).fixedSize()
```

A 正式上線時，EmojiGlyph（MapTab.swift:2246）和 Draw.swift:203 的 Image 也要固定成跟文字一樣的點數大小，不要靠圖的像素大小：在 EmojiArt.render 用 `UIFont.systemFont(ofSize: size)` 量 `(e as NSString).size(withAttributes:)` 存進 slot，顯示時 `.resizable().interpolation(.high).frame(width:height:)`。

修好後補拍（同一根圖釘、同一個泡泡，左右兩版同樣狀態）：兩位數和三位數（如果有）的泡泡、同一間店選中彈到最高、行程模式變淡的圖釘和小泡泡、減少動態、最大字級的 🎲。深色不用拍，App 鎖淺色。
