# 滑順第 5 輪第二份：選店、降落、推頁返回（T3、T4、T6）和殘影量測

> **2026-10-29 22:29Z Anthony 說先暫停：這份寫好存著，還沒交給 Swift。** 下次繼續時先確認分支頭還是不是 347906f，再交。T7、T8 的設計也停在一半（workflow 可以從快取接著跑）。

這份接在第一份（T1、T2，已在 347906f）後面。每題一位設計、兩位反方從不同角度推翻、一位照反方修訂；移到 347906f 時又各有兩位反方逐條核對過，結果寫在每題的「移植」裡。

## 先看這裡

- **照順序做：T3 → T4 → T6 → D。** 每段「原文」都是套完前面各項之後的樣子，我照這個順序實際套過一遍：每段原文在當下都只出現一次，六個檔案的括號都平衡，套完的結果跟我手上的完整檔案一字不差。標題裡的行號是 347906f 的，套了前面幾項之後會往後移，以原文為準。
- **完整檔案**：套完全部 51 項的六個檔案放在本分支 `reviews/bitemap-b22/perf-round1e-part2-files/`（MapTab、Perf、FoodMapApp、ListTab、PlaceDetail、MapPanel）。分支頭還是 347906f 的話，可以拿來整檔對照；分支頭已經改過這幾個檔就不要整檔覆蓋，照下面各項改。
- **都不用先問 Anthony。** T3、T6 看不出差別。T4 有三個「可能看得出」的差別（卡頓搬到按下那一幀、淡出的舊卡、照片晚一點淡入），先量 T4 的 (3) R1、R3、R5，數字回來我再拿去問他。D 只在 -dumpPins 時有作用。
- **每個新行為都有對照開關**：T3 -oldPinSel；T4 -liveHidden（量測用 -hiddenWait）；T6 -rootBar、-rootTabs、-mapRectX、-mapPathRead；D -dumpPins。不加任何參數就是新的行為。
- **量測要加的開關**：347906f 已經有 T1、T2。T3、T4 的量測整輪加 `-noPinPair -mapSelAll`，分群和 MapKit 的選取才跟 72ac06e 一樣，預期數字才對得上。T6 的量測加 `-noPinPair`，不然嘉義那兩根會合成「2」，點不到松山。各題的模擬器段落開頭都有寫。
- **T5 不上**（省不到 1ms）。**T7（點在圖釘旁邊要等 0.5 秒）、T8（第一次開店家頁預熱）在第三份交**，不用等它們，這份可以先做。
- **D 是給 U13(6) 殘影用的量測**：從「我的行程」sheet 進行程時，選著的那根偶爾留下一根點不到、跟著地圖走、離開行程才消失的放大圖釘。模擬器重現時加 -dumpPins，就能看到 MapKit 實際掛著哪些大頭針 view。

## T3 選店時 80 多根圖釘全部重算（圖釘各看自己的盒子）

**摘要**

72ac06e 裡每根 FoodPin 的 body 都直接讀 pins.sel（MapTab.swift:1985、:1988），所以每次選店，活著的 80 到 85 根圖釘都整根重算，其中大多是已經合進泡泡、不在地圖內容裡卻還活著的 view。修法是：PinFX 加 on，PinState 加 hasSel，select() 只改舊的和新的兩個盒子，FoodPin.body 改讀 fx.on，變淡抽成只讀 hasSel 的 PinFade；另外附 -oldPinSel 對照開關，再加三處只做量測的記錄。外觀和時機都不變，不用問 Anthony。重算次數的預期有把握：A 換 B 的「圖釘」從 80 降到 2–4。能省多少時間是推論：照「點圖釘 N ms」推，A 換 B 最多省約 16ms，很可能過不了 1 幀門檻。判定改看 A 換 B 10 筆的「點圖釘 N ms」中位，N 比 O 低 17ms 以上才上。要不要花一次建置量 F1，由 coordinator 決定；也可以先在模擬器上現在裝的 build 取樣，不用建置（見 sim 八）。

**看得出的差別**

無。下面這些都跟原本一樣：
- 選中那根放大、換成封面照、店名彈出、影子變寬。
- 其他圖釘 0.25 秒變淡到一半。
- 行程模式其他收藏縮小變淡。
- VoiceOver 的「已選取」。

用的值、動畫曲線和修飾順序都沒變。sel、hasSel 和兩個盒子都在 select() 的同一次呼叫裡改，推論 SwiftUI 會在同一輪更新處理，所以按下去還是同一幀開始動。

新加的「tick 實際跑在」這種 Console 行，以及「圖釘建」「變淡」兩個計數，都只在開了 -perfOverlay 時才有。不用問 Anthony。

**對照開關**

-oldPinSel：加了這個參數，FoodPin.body 會照舊直接讀 pins.sel。
- on 用 `pins.sel == place.id`，恢復原本 :1985 的讀取。
- 傳給 PinFade 的 faded，由 FoodPin.body 先用 `pins.sel != nil && other` 算好，恢復原本 :1988 的讀取。PinFade 收到不是 nil 的 faded，就不會讀 hasSel，因為 `??` 的右邊是 autoclosure。

所以每次 sel 一改，活著的圖釘都會整根重算，跟 72ac06e 一樣。盒子的 on 和 hasSel 照常更新，只是沒有畫面讀它們，外觀不受影響。

O 組跟 72ac06e 只差兩樣：多了一層 PinFade，以及新加的量測行。這兩樣 N、O 兩組都有，所以比較是公平的。這個開關只在模擬器和開發版有作用，因為 Flag 在正式版讀不到啟動參數。

**移植到 347906f**

- 第 9 處不做：347906f 的綁定開頭已經印「地圖選取 <id>」。
- 量測 N、O 整輪加 -noPinPair -mapSelAll，讓分群和 MapKit 選取都跟 72ac06e 一樣，四到六節的預期數字不用改。
- 七-4「圖釘建」改成只看沒有「地圖」計數的那幾筆，基準改成「分群」那行的標註數。
- 回歸第 3 條照 T1 改寫（加 -noPinPair），加 16–18 三條 T2 的路。
- 「圖釘建」那行的註解照上面改。

### 改動

#### T3-1　MapTab.swift（347906f 第 1927 行起）

**位置**：72ac06e:MapTab.swift:1797，PinState（:1796 `@MainActor @Observable final class PinState {`）的第一個屬性 `    private(set) var sel: String?` 之後、:1798 `    // 取消選取的次數：…` 之前

**原文**：
```swift
    private(set) var sel: String?
```

**改成**：
```swift
    private(set) var sel: String?
    // 有沒有選著任何一根：只在「沒選」和「有選」之間切換時才改（A 換 B 不變）。圖釘的變淡只看這個（PinFade）
    private(set) var hasSel = false
    // sel 的不觀察副本：fx() 建新盒子時讀，不讓呼叫它的地方（FoodPin.init）多記一個依賴
    @ObservationIgnored private var selQuiet: String?
```

**理由**：hasSel 是變淡唯一要看的東西，只在沒選和有選之間切換，A 換 B 時不會被寫，其他圖釘的變淡就不會跟著重算。selQuiet 給 fx() 建新盒子時用：fx() 從 FoodPin.init 呼叫，直接讀 sel 會在呼叫它的地方多記一個依賴（減少動態時 :1980 的 `reduce || pins.sel == place.id` 會短路、本來不讀 sel），用不觀察的副本避開。

#### T3-2　MapTab.swift（347906f 第 2063 行起）

**位置**：72ac06e:MapTab.swift:1880-1885，搜尋 `    func fx(_ id: String) -> PinFX {`

**原文**：
```swift
    func fx(_ id: String) -> PinFX {
        if let b = boxes[id] { return b }
        let b = PinFX()
        boxes[id] = b
        return b
    }
```

**改成**：
```swift
    func fx(_ id: String) -> PinFX {
        if let b = boxes[id] { return b }
        // 盒子是第一次用到才建：選的時候還沒建盒子的那根，建的時候照目前的選取設好 on
        let b = PinFX(on: selQuiet == id)
        boxes[id] = b
        return b
    }
```

**理由**：盒子是懶建的，會有「先選了某根，它的盒子才建」的情況，例如抽中藏在泡泡裡、從沒畫過的店，或抽中被篩掉的店（extra）。新盒子照目前的選取設 on，那根一畫出來就是放大的（:2038 onAppear 的 `if on { … }`）。hop()（:1888）、setMerge()（:1893）也經過 fx()，一樣適用。

#### T3-3　MapTab.swift（347906f 第 2086 行起）

**位置**：72ac06e:MapTab.swift:1902-1904，select() 的最後三行，搜尋 `        if id == nil { cleared += 1 }`

**原文**：
```swift
        if id == nil { cleared += 1 }
        sel = id
    }
```

**改成**：
```swift
        if id == nil { cleared += 1 }
        // 每根圖釘只看自己盒子的 on：這裡只改舊的那根和新的那根（還沒建的盒子由 fx() 照 selQuiet 設）。
        // 搜到的地點（hit: 開頭）沒有 FoodPin 也沒有盒子，不用改。sel 只有這裡會改，盒子才不會跟它不同步
        if let old = sel, let b = boxes[old], b.on { b.on = false }
        if let id, let b = boxes[id], !b.on { b.on = true }
        selQuiet = id
        // 先比較再寫：@Observable 的 setter 值一樣也會通知，不擋的話 A 換 B 會讓每根的 PinFade 重算
        if hasSel != (id != nil) { hasSel = id != nil }
        sel = id
    }
```

**理由**：換選別根時只寫兩個盒子，A 換 B 只有兩根圖釘失效。hasSel 先比較再寫，A 換 B 時完全不碰它。所有呼叫 select() 的地方（點圖釘 tap()、Map 選取綁定 :107/:111、抽中 :522/:562/:578、choose :612、行程加站卡 SelWatcher :1930、取消 :276/:484/:500/:669/:1407）都經過這裡；hit: 開頭的 id 沒有盒子，`boxes[id]` 是 nil 就跳過，hasSel 照樣變 true，收藏圖釘全部變淡，跟原本一樣。全部寫入在同一次呼叫裡，SwiftUI 在同一輪更新處理。

#### T3-4　MapTab.swift（347906f 第 2091 行起）

**位置**：72ac06e:MapTab.swift:1907-1911，搜尋 `// 一根圖釘自己的動作：要往哪顆泡泡飛`

**原文**：
```swift
// 一根圖釘自己的動作：要往哪顆泡泡飛（nil：不用合）、抽一間時跳了幾下
@MainActor @Observable final class PinFX {
    var to: CGSize?
    var hop = 0
}
```

**改成**：
```swift
// 一根圖釘自己的動作：要往哪顆泡泡飛（nil：不用合）、抽一間時跳了幾下、是不是選中的那根
@MainActor @Observable final class PinFX {
    var to: CGSize?
    var hop = 0
    // 選中的是不是這根：PinState.select 只改舊的、新的那兩個盒子，換選別根時只有這兩根圖釘整根重算
    var on = false
    init(on: Bool = false) { self.on = on }
}
```

**理由**：每根圖釘有自己的「選中與否」，FoodPin.body 只看自己的盒子。init 的參數有預設值，原本的 `PinFX()` 照樣能用（整個專案只有 :1882 一處）。@Observable 的屬性可以在 init 裡指定；`var to: CGSize?` 不給初值、類別另寫 init 的寫法，Store.swift:33 `var error: String?` 加 :160 `init()` 已經編得過。

#### T3-5　MapTab.swift（347906f 第 2164 行起）

**位置**：72ac06e:MapTab.swift:1980 `        _fly = State(initialValue: reduce || pins.sel == place.id ? .zero : pins.flyFrom[place.id] ?? .zero)` 的下一行、:1981 init 的右括號 `    }` 之前

**原文**：
```swift
        _fly = State(initialValue: reduce || pins.sel == place.id ? .zero : pins.flyFrom[place.id] ?? .zero)
```

**改成**：
```swift
        _fly = State(initialValue: reduce || pins.sel == place.id ? .zero : pins.flyFrom[place.id] ?? .zero)
        // 量測：標註內容被重建（FoodPin.init 跑）幾次。MapTab 重算（「地圖」計數，例如 mapSync 對回、重新分群）本來就會讓 Map 內容裡沒合進泡泡的每根跑一次，那段不算；
        // 沒有「地圖」計數的那段，選店時還接近這個根數，才表示上一行讀 pins.sel 讓標註內容跟著重建，F1 碰不到那塊
        Perf.shared.count("圖釘建")
```

**理由**：只加量測。「圖釘」計數只在 body 開頭，看不到 init 跑幾次；:1980 照舊讀 sel，如果它讓 Map 每次選店都重建約 80 根標註內容，那份成本 F1 拿不掉，要分得出來。這時所有 stored property 都已經指定好；init 本來就在 MainActor 上（:1972 呼叫了 @MainActor 的 pins.fx），count 在 Perf.on 是 false 時直接 return，正式版看不出差別。

#### T3-6　MapTab.swift（347906f 第 2169 行起）

**位置**：72ac06e:MapTab.swift:1985-1989，FoodPin.body 開頭、`        let _ = Perf.shared.count("圖釘")`（:1984）的下一行起，搜尋 `        let on = pins.sel == place.id`

**原文**：
```swift
        let on = pins.sel == place.id
        // 選到的那根永遠不跟泡泡合、也不從泡泡飛（店名小牌子才會跟著圖釘）
        let merge = on ? nil : fx.to
        let faded = pins.sel != nil && !on && !hopping   // 別間被選到時變淡（只改透明度，76 根一起動也不吃力）
        let dim = pins.dimAll && !on && !hopping && !pins.bright.contains(place.id)   // 行程模式的其他收藏
```

**改成**：
```swift
        // 選中的是不是這根：只看自己的盒子（PinState.select 只改舊的、新的那兩個），換選別根時其他圖釘不用重算。
        // 量測對照 -oldPinSel：照舊直接讀 pins.sel（每次選店，活著的圖釘全部整根重算）
        let oldSel = Flag.on("-oldPinSel")
        let on = oldSel ? pins.sel == place.id : fx.on
        // 選到的那根永遠不跟泡泡合、也不從泡泡飛（店名小牌子才會跟著圖釘）
        let merge = on ? nil : fx.to
        // 別間被選到時變淡：「有沒有選著」交給 PinFade 讀 pins.hasSel（只改透明度，76 根一起動也不吃力）
        let other = !on && !hopping
        let fadedOld: Bool? = oldSel ? (pins.sel != nil && other) : nil   // -oldPinSel：照舊在這裡讀 pins.sel
        let dim = pins.dimAll && !on && !hopping && !pins.bright.contains(place.id)   // 行程模式的其他收藏
```

**理由**：不加參數時 body 不讀 sel，只讀 fx.on、fx.to、fx.hop、pins.dimAll、pins.bright。用到 on 的地方都不用動：pin(on)（:1996，含 PinPhoto、EmojiGlyph 的 use）、accessibilityAddTraits(.isSelected)（:2006）、影子和店名的 animation(value: on)、onAppear 的 `if on`（:2038）、`.onChange(of: on) { … select() : deselect() }`（:2041）。行程模式的 dim 照舊在這裡算。加了 -oldPinSel，三元運算子只走 `pins.sel == place.id` 和 `pins.sel != nil && other` 那邊，原本 :1985、:1988 的兩個讀取真的恢復；fadedOld 先算好，修飾鏈裡只剩一個 .modifier，減輕型別推斷。:1972 `self.fx = pins.fx(place.id)` 和 :1980 讀 pins.sel 算 _fly 都不動。

#### T3-7　MapTab.swift（347906f 第 2213 行起）

**位置**：72ac06e:MapTab.swift:2028-2031，overlay 店名那段（:2014-2027）的右括號之後、`.scaleEffect(x: dsx, y: dsy, anchor: .bottom)`（:2032）之前，搜尋 `            .opacity(faded ? 0.5 : dim ? 0.6 : 1)`

**原文**：
```swift
            .opacity(faded ? 0.5 : dim ? 0.6 : 1)
            .animation(.snappy(duration: 0.25), value: faded)
            .scaleEffect(dim ? 0.65 : 1, anchor: .bottom)
            .animation(.easeInOut(duration: 0.3), value: dim)
```

**改成**：
```swift
            // 變淡、行程模式縮小：原本這裡的四行搬進 PinFade（位置、順序、動畫都不變）
            .modifier(PinFade(pins: pins, other: other, dim: dim, faded: fadedOld))
```

**理由**：四行原樣搬進 PinFade，在修飾鏈裡的位置不變，兩個 animation(value:) 包住的範圍也一樣（content 就是上面那一串）。N、O 兩組都走這一層，對照只差依賴。

#### T3-8　MapTab.swift（347906f 第 2294 行起）

**位置**：72ac06e:MapTab.swift:2107（FoodPin 結構的右括號）之後、:2109 `// 圖釘裡的圓形封面照：照片載好才淡入，不會先閃一下` 之前，前後各留一行空行

**原文**：
```swift
// 圖釘裡的圓形封面照：照片載好才淡入，不會先閃一下
```

**改成**：
```swift
// 圖釘的變淡、行程模式的縮小（原本在 FoodPin.body 的那四行，位置、順序、動畫都沒變）。
// 只有這一小層讀 pins.hasSel：從沒選變有選（或反過來）時，每根圖釘只重算這層；
// 換選別根時 hasSel 不變，只有舊的、新的那兩根因為 other 變了才重算。做法跟 TopFade 讀 lift 一樣
private struct PinFade: ViewModifier {
    let pins: PinState
    let other: Bool          // 不是選中的那根、也沒在跳（FoodPin 算好傳進來）
    let dim: Bool            // 行程模式的其他收藏：縮小變淡（FoodPin 算好傳進來）
    var faded: Bool? = nil   // 量測對照 -oldPinSel：FoodPin 照舊用 pins.sel 算好的；nil 才讀 hasSel
    func body(content: Content) -> some View {
        let _ = Perf.shared.count("變淡")
        let f = faded ?? (pins.hasSel && other)
        content
            .opacity(f ? 0.5 : dim ? 0.6 : 1)
            .animation(.snappy(duration: 0.25), value: f)
            .scaleEffect(dim ? 0.65 : 1, anchor: .bottom)
            .animation(.easeInOut(duration: 0.3), value: dim)
    }
}

// 圖釘裡的圓形封面照：照片載好才淡入，不會先閃一下
```

**理由**：整個 App 只有這一層讀 hasSel，`hasSel && other` 等於原本的 `sel != nil && !on && !hopping`。`??` 的右邊是 autoclosure，-oldPinSel 時完全不讀 hasSel。FoodPin 第二次跑 body（onChange 改 sx、sy、lift）時這層的四個欄位都沒變，SwiftUI 比對相等就跳過，所以「變淡」不會跟著「圖釘」多算。開頭的「變淡」計數讓掉幀那行看得到這層跑了幾次。body(content:) 裡先寫 let 再接 content 的寫法跟 TopFade（:1616-1630）一樣；private 的型別用在 internal 的 FoodPin.body 裡，前面已有 PinPress、PinPhoto。

#### T3-10　Perf.swift（347906f 第 130 行起）

**位置**：72ac06e:Perf.swift:126-128，tick() 裡 `for p in ps { … }` 的最後一行和右括號，接著 `        tickedAt = CACurrentMediaTime()`

**原文**：
```swift
            if lines.count > 6 { lines.removeLast() }
        }
        tickedAt = CACurrentMediaTime()
```

**改成**：
```swift
            if lines.count > 6 { lines.removeLast() }
        }
        // 量測：這個 tick 真正跑的時間。now 是 vsync 時間，主執行緒卡住時 tick 晚跑，晚的那段不算在掉幀毫秒數裡。
        // 只在這一幀掉了、或剛結算記號時印；結算記號但沒掉幀時，順便印這段的重算次數（不然會漏掉）
        if !ps.isEmpty || drops.last == now {
            let ran = CACurrentMediaTime()
            var s = String(format: "[perf] 　tick 實際跑在 %.3f（比 %.3f 晚 %.0f ms）", ran, now, (ran - now) * 1000)
            if drops.last != now {
                let since = tickedAt
                let n = bodies.compactMap { (k, v) -> String? in
                    let c = v.filter { $0 >= since }.count
                    return c > 0 ? "\(k) \(c)" : nil
                }.sorted().joined(separator: "・")
                if !n.isEmpty { s += "　重算 " + n }
            }
            print(s)
        }
        tickedAt = CACurrentMediaTime()
```

**理由**：只加量測（tick 只在 Perf.on 時跑）。掉幀毫秒數是 vsync 相減，主執行緒在最後一個 vsync 之後還忙約 20ms 的那段看不到；這行印出 tick 真正跑的時間，s1b、s2b 也能算「select 開始 → tick 實際跑」。`drops.last == now` 只有這一幀掉了才成立（:88 append 的就是 now）。結算記號但沒掉幀時補印重算次數：72ac06e 的 s2b 15 次裡有 11 次掉幀那行沒有重算（M9-M10 檔第 38、281 行，摘要第 717、737–773 行），因為記號和計數被一個晚跑、沒算掉幀的 tick 結算掉了。計數寫法照 :90-94，算到 tickedAt 更新之前，不會跟下一筆重複。ps、drops、bodies、tickedAt 都是 tick() 裡看得到的。

**模擬器**

一、build 和參數
- 照 perf-round1d 第 5 節：Release 模擬器 60Hz，加 -Wl,-no_deduplicate 和 -perfOverlay。每次 terminate 再 launch；先不計地遠飛一次，等「清單掛上 首頁」之後 2.5 秒才動手。
- N＝`-perfOverlay -noPinPair -mapSelAll -drawWin 851d1dd0-16f3-4b11-aca5-1ccef40085b3`。
- 後面兩個是 347906f 的對照開關，N、O 整輪都加。-noPinPair：分群跟 72ac06e 一樣，只有泡泡會吃旁邊的；嘉義那兩根照舊疊著，台北縮放的 5 根、🎲 跳哪幾根也跟 M9 一樣。-mapSelAll：MapKit 晚到的第二次選取照聽（T1 預設會擋），s1b 才會跟 M9 一樣選兩次，下面 s1b 的數字（O 約 169）才對得上。這一輪不量 T2 的「2」泡泡，也不量 T1 的擋法。
- s1b 點之前的截圖要看得到嘉義兩根疊在一起，不是「2」泡泡；Console 不應該有「地圖選取略過」「地圖選取對回」。不對就表示開關沒生效，先報回來。
- O＝N 再加 `-oldPinSel`。
- 順序是 N O N O N O N O N O，各 5 次。

二、每次開 App 依序做
1. s1b 冷：用全台鏡頭（跟 M13-1 同一個），點之前先截圖，再點嘉義那兩根疊在一起的地方（跟 M9 一樣）。
2. 等 1.5 秒，按 ✕ 關大卡。再等 1 秒，按 🎲（s2b，抽中 Mercer Brunch）。等「飛完」之後再過 1 秒。
3. 按 ✕ 關大卡，縮放到 M9 量 A 換 B 時的台北市區（寬約 0.07，畫面上約 5 根單獨圖釘），點之前截圖並報根數。
   - 這次沿用 M9 的 5 根縮放，不是 perf-round1d 第 5 節原本要的 20 根以上，這樣才能跟 72ac06e 的 M9 對照。
   - 先點 ED’s Diner：這一下是「沒選→有選（暖）」，另外報。
   - 等 1.5 秒，點白寶奶奶港式菠蘿包，算 A 換 B ①。
   - 再等 1.5 秒，點 ED’s Diner，算 A 換 B ②。
4. 找得到才做，只報不判：往內放大到畫面上有 20 根以上單獨圖釘的縮放，截圖並報根數。大卡開著，在兩根單獨圖釘之間來回點兩下，算 A 換 B ③④。

每組合計：s1b 5 筆、s2b 5 筆、暖 5 筆、A 換 B ①② 10 筆。③④ 另計。

三、每一下要報
- 原始 Console：從那一下的「手指按下」（s2b 從按 🎲 的手指按下）到之後 1 秒，包括新的「tick 實際跑在」，以及本來就有的「地圖選取 <id>」「sel X → Y」這兩種行。T3 第 9 處沒有做：347906f 在同一個位置已經印「地圖選取 <id>」。
- (a) 對上記號的「點圖釘 N ms」。s2b 改報「select 開始（抽中）」到結算「抽一間（抽中）」那個 tick 的「tick 實際跑在」，中間差幾 ms。
- (b) 對上記號的那筆掉幀的毫秒數；沒有掉幀就寫 0。
- (c) 重算次數，從掉幀那行抄。沒有掉幀，或掉幀那行沒有重算時，從結算記號那個 tick 的「tick 實際跑在」那行抄。
- (d) 「移地圖 … 寬」那行的寬度。A 換 B 的寬度跟 0.07 差超過 0.01 的那筆另外標出來。
- s1b 多報兩個數：「地圖選取 <另一根>」到第二個「點圖釘」差幾 ms，以及到結算它的 tick 實際跑差幾 ms。

四、判定
- 只比同一輪的 N 和 O，不拿 72ac06e 的數字當基準。
- 看 A 換 B ①② 的 10 筆「點圖釘 N ms」，N 的中位比 O 低 17ms 以上才上。這是把 perf-round1d 第 6 節的「掉幀中位低 1 幀」，換成「點圖釘 N ms 中位低 1 幀」，理由見 diagnosis 第 6 點。掉幀毫秒數照報，只當旁證。
- s1b、s2b、暖、③④ 只報不判。
- O 組的計數同時用來檢查對照開關：A 換 B 的「圖釘」約 80、s2b 約 85、s1b 約 169。對不上，就表示對照沒有恢復成 72ac06e，先報回來再判。

五、預期的重算次數（從程式推得出來，先對這個）
- A 換 B：N 是「圖釘 2–4・變淡 2・大卡 1・附近面板 1」。O 是「圖釘 約 80（78–86，看這次開 App 活著幾根）・變淡 2・大卡 1・附近面板 1」。O 的「變淡」只算 faded 真的變了的那兩根。
- 暖的沒選→有選：N 是「圖釘 1–2」加約 80 次「變淡」。O 的「圖釘」和「變淡」都約 80。
- s2b：N 的「圖釘」5 以下，「變淡」約 85。O 的「圖釘」和「變淡」都約 85。地圖 1、大卡 3、附近面板 3，兩組都跟 72ac06e 一樣。
- s1b：N 的「圖釘」3–7，「變淡」約 87。O 的「圖釘」約 169，「變淡」約 87。地圖 1、大卡 4、附近列 1、附近面板 4，兩組都跟 72ac06e 一樣。
- 「圖釘建」兩組應該差不多，照實報。
- 同一個建置也帶 T4：大卡、附近面板、附近列不跟 72ac06e 比，只比 N 和 O。藏著的整份清單會晚一點才換，附近列可能比 72ac06e 少，要等「補換卡片列」「補換整份清單」那一下才補上；這兩種記號落在那一段 1 秒內的，另外標出來。

六、預期的時間（推論）
- A 換 B：72ac06e 的「點圖釘 N ms」是 53/52/53/50/51（中位 52）。F1 最多省約 16ms（diagnosis 第 7 點），所以推論 N 的中位落在 36 到 52 之間，O 約 52。很可能過不了 17ms 門檻。
- s1b：N 少掉第二次選取的約 82 次整根重算，第一次選取的約 84 根也只剩 PinFade，推論省得比 A 換 B 多。只報不判。
- s2b：每根從整根重算換成只跑 PinFade，推論省得比 s1b 少。只報不判。

七、判讀分支
1. N 的 A 換 B「圖釘」還在 80 左右：表示重算不是 body 讀 sel 造成的。推論是標註內容被重建，又被比對成不相等；看「圖釘建」是不是也約 80。這時不要上，把那幾行報給我。
2. N 的 A 換 B「圖釘」5 以上，但遠小於 80：把那幾行原始 Console 報回來。
3. N 的 A 換 B「變淡」十幾到 80：表示 hasSel 在 A 換 B 時被寫了，或 PinFade 被別的東西帶著重算，報給我。「變淡」是 3 或 4：照實報，不算失敗（推論：同一間店有兩個活著的 view）。
4. 「圖釘建」只拿沒有「地圖」計數的那幾筆來判（通常是 A 換 B、暖）。有「地圖」計數的（s1b、s2b 拆泡泡、取消選取）是 MapTab 重算，Map 本來就會重跑沒合進泡泡的每根標註內容，這幾筆照報、不拿來判。基準是點下去之前最後一行「分群 … M 個（泡泡 K）」：標註數約 M−K（選著店時再加 1），M、K 跟著報。
   - 是 0：init 不在選取的路徑上，perf-round1d 第 6 節的那個推測可以排除。
   - 接近這個標註數：表示 init 讀 pins.sel 讓 Map 每次選店都重建標註內容，這塊 F1 碰不到，報給我當下一個候選。
   - 介於中間：把那幾行原始 Console 報給我。
5. 「圖釘」降到 2–4，但「點圖釘 N ms」中位差不到 17ms：照規則不上，把 10 筆數字和取樣結果報給我。

八、取樣（不用改程式）
取樣那次開 App 不算進上面的筆數，因為 sample 會拖慢 App。
- 可以先在模擬器上現在裝的 build 做，不用建置（只加 -perfOverlay；如果是 347906f，再加 -noPinPair，台北那幾根才不會合成泡泡；報回來時寫明是哪個 commit），結果報回來後，由 coordinator 決定要不要花一次建置做 F1。這一輪也在 10 次之後，N、O 各多開一次做。
- 做法照 perf-round1d 第 5 節 M12：
  - 照第二段第 3 步縮放到台北市區，點 ED’s Diner 開大卡，等 1.5 秒。
  - 終端機打 `sample $(pgrep -x FoodMap) 4 1 -mayDie -file ab_O.txt`（N 組存成 ab_N.txt；沒帶 T3 的 build 照 commit 存，例如 ab_347.txt）。
  - 按 Enter 後 4 秒內，依序點白寶奶奶、ED’s Diner、白寶奶奶，每下隔約 1.2 秒。
- 用 sampletree --all 只看主執行緒，報下面每一類的樣本數：
  - 總數；
  - 閒著的（最上面是 mach_msg 或 __CFRunLoopServiceMachPort）；
  - 堆疊裡有 FoodPin 的；
  - 有 PickedCard 的；
  - 有 NearbySheet 或 NearbyHost 的；
  - 有 MKMapView、MKMapCamera 或 setRegion 的；
  - 有 MKAnnotationContainerView 或 _UIHostingView 的；
  - 再列出忙的樣本裡最多的前 15 個函式。
- 判讀：
  - 帶 FoodPin 的樣本只算到 body 本身，body 之後各個修飾的圖更新不會帶 FoodPin 的符號，所以這是圖釘成本的下限，不拿它單獨決定 F1 上不上。
  - O 減 N 的 FoodPin 樣本，約是 F1 在 body 上省下的。
  - 忙的樣本裡最大的那一類，就是 A 換 B 裡至少 35ms 不是圖釘的那塊，報給我決定下一步。

**回歸**

N 和 O 都要過下面 1 到 13 條，兩組外觀必須一樣。
1. 一般點圖釘：手指按下就壓扁並輕震。放開後那根彈高放大、換成封面照、店名小牌子彈出、影子變寬；其他圖釘 0.25 秒變淡到一半。
2. 大卡開著直接點另一根：舊的先縮過頭再彈回、店名收起、變淡；新的放大、不淡；其他維持淡。來回點 5 次都要對。
3. 嘉義疊在一起的那兩根（這條另外加 -noPinPair 開；不加的話 T2 會把這兩根合成一顆「2」，點了只會放大地圖）：點下去之後，選中的是手指按下時壓扁、輕震的那根，它放大、有店名，另一根是淡的。Console 只有一行「sel … → 那根」；MapKit 晚到的另一根會記成「地圖選取略過」，不會變成第二行 sel。VoiceOver 只讀得到一根「已選取」；換選別根以後，舊的那根不再讀「已選取」。
4. 按 ✕ 關大卡，或點地圖空白處：全部回到不透明，選中那根縮回。之後再點同一根要有反應。
5. 🎲 抽一間：
- 6 到 8 根輪流跳；選著別根時，正在跳的那根暫時不淡。最後抽中的那根放大。
- 跳的時候再按一次，要直接出結果。
- 抽中藏在泡泡裡的店：那根拆出來，一出現就是放大、帶店名。
- 抽中被篩選篩掉的店（extra）：也要畫出來並放大，選別根時收掉。
6. 抽 3 間、轉盤、從「抽過」點回（choose）：選中的那根放大，其他變淡。
7. 沒選的時候，卡片列停在某間，那根要跳一下。
8. 泡泡：選著一根時縮放，讓旁邊的圖釘合進泡泡再拆出來，拆出來的要是淡的；選中那根一直不合進去。沒選時，拆出來的不淡。
9. 篩選把選著的店篩掉：取消選取，其他恢復。換看誰的收藏（群組）也一樣，群組地圖右上角的小頭像照舊。
10. 行程模式：
- 沒選時進行程：其他收藏縮小到 0.65 倍、透明度 0.6。
- 選著店時進行程：那根照舊。
- 點收藏圖釘開加站卡：那根放大，其他變淡。
- 點搜尋結果（hit: 開頭）：所有收藏圖釘變淡，搜尋圖示放大。
- 加站卡換一間：舊的縮回，新的放大。
- 關加站卡：全部恢復，再點同一根會重開。
- 行程搜尋時：搜到的收藏照常大小；被篩掉但搜到的（extraFound）也能選中並放大。
- 離開行程回首頁：不會冒出大卡。
11. 長按圖釘：選單和 MenuPin 照舊，放開手指不算點一下。
12. 冷開時，落下動畫還沒播完就點圖釘：落下、選中都要對。
13. 打開減少動態：選中只淡入淡出，變淡照舊。

量測面：
14. M10 降落、小幅平移這兩段沒有改選取，重算次數要跟 72ac06e 一樣（不算新加的「圖釘建」「變淡」）。
15. 不加 -perfOverlay 時，Console 不會出現「tick 實際跑在」，也不會記「圖釘建」「變淡」。原因：Perf.on 是 false 時 count、note 直接 return，tick 也根本不跑。
16.（不加 -noPinPair）選著一根時縮放，讓兩根單獨圖釘合成「2」再拆開：拆出來的兩根是淡的；選中的那根不會跟旁邊的單根合成「2」。
17.（不加 -noPinPair）🎲 抽中「2」裡的那間（可用 -drawWin 指定）：那根一拆出來就是放大、帶店名；另一根變回單獨圖釘，是淡的。
18.（不加 -noPinPair）沒選時進行程，再按「完成」離開：其他收藏從 0.65 倍長回原大小（PinFade 的 dim 動畫），約 60ms 後重新分群，疊到的單根合成「2」。長大和飛進泡泡不打架，N、O 看起來一樣。

**風險**

1. 盒子跟 sel 不同步。
- 規則：每個盒子的 on，一定等於「sel 是不是這間」。
- 現在一定同步：sel 是 private(set)，只有 select() 會改；select() 同時改舊、新兩個盒子；還沒建的盒子，由 fx() 照 selQuiet 建。
- 以後改 PinState 的人要守住這條規則，程式註解裡有寫。

2. ViewModifier 能不能被觀察。PinFade 只在 body(content:) 裡讀 hasSel，跟 TopFade（:1616-1630）讀 lift.y 是同一種寫法，專案在 :1385 已經在用。

3. 型別檢查。這邊只做過 -parse，型別錯要等 Mac 建置才知道。要注意下面幾處：
- PinFX 的 init(on:)：@Observable 屬性在 init 裡指定。Store.swift:33 的 `var error: String?` 加 :160 的 `init()` 是同一種寫法的先例。
- private 的 PinFade 用在 internal 的 FoodPin 裡：前面已有 PinPress、PinPhoto 這樣用。
- Perf.swift 新加的那段，用到的 ps、drops、bodies、tickedAt 都在 tick() 裡看得到。
- fadedOld 先算好，修飾鏈裡只剩一個 .modifier，減輕型別推斷的負擔。

4. 動畫時機（推論不變）。所有寫入都在 select() 的同一次呼叫裡，選中那根放大、其他變淡、大卡換上，都在同一輪更新。回歸第 1、2 條會驗這點。

5. 省多少時間。重算次數有把握，時間只是推論：上限約 16ms，很可能不到 1 幀。不到就照規則不上，新加的量測行可以留著。

6. 新加的量測行。
- 只在 -perfOverlay（Perf.on）時有作用。
- 之後每一次量測的 Console 都會多出「tick 實際跑在」這種行；MapTab 重算時，掉幀那行也會多「圖釘建」。
- 分析腳本要能忽略這些新行；跟以前的數字比時，不要把它們算進去。

7. s1b 一下選兩間：347906f 的 T1（PinState.mapLate）已經擋掉 MapKit 晚到的第二次選取，不再是另案。這一輪量測加 -mapSelAll，是為了讓 O 組跟 72ac06e 一樣有兩次選取、數字對得上。

8. 另案（推論）：每次點擊在 select 之前都有約 22ms 的空檔。A 換 B 扣掉按住時間是 22–23ms，s1b 是 24–42ms。可能是模擬器的點擊工具或觸控處理造成的，它直接灌進每一筆掉幀數字，值得另外查。

9. 另案（推論）：被 :113 拿掉的圖釘 view 還活著。F1 讓它們不再跟著選取重算，但沒有讓它們釋放；以後要再省，可能要查為什麼它們沒有被釋放。

**診斷（給想看細節的人）**

1. 讀取點。
- 72ac06e:MapTab.swift:1985 是 `let on = pins.sel == place.id`，:1988 是 `let faded = pins.sel != nil && !on && !hopping`。
- PinState 宣告成 `@MainActor @Observable final class PinState`（:1796），sel 是被觀察的屬性（:1797 `private(set) var sel: String?`），只有 select()（:1897-1904）會改它。
- 所以每根 FoodPin 的 body 都依賴 sel。sel 一變，就整根重跑 :1990-2046 那一串：Button、PinPress、LongPressGesture、accessibility、background 影子、overlay 店名、兩層 scaleEffect、offset、三個 onChange。
- 每根圖釘自己的盒子 PinFX（:1908-1911）只有 `to`、`hop`，沒有記「是不是選中的那根」。

2. 量到的次數，以及重算的是哪些 view。
- A 換 B 五次都是「圖釘 80・大卡 1・附近面板 1」（M9AB-M10平移 檔第 8、21、30、40、50 行），當時畫面上只有 5 根單獨圖釘。s2b 是「圖釘 85」（M9-M10 檔第 84、131、180 行），s1b 是「圖釘 169」（第 17、67、116、165、213 行）。
- :113 `ForEach(list.filter { !hidden.contains($0.id) })` 已經把合進泡泡的圖釘從 Map 內容拿掉。
- M13-1 截圖的全台鏡頭（五次一樣）只有 3 根單獨圖釘，加上 61、6、16 三顆泡泡，共 86 間。s2b 選取時鏡頭是寬 2.32 的全台縮放（M9-M10 檔第 30 行），計數卻還是「圖釘 85」。
- 推論：冷開時要等落下動畫播完才合泡泡（:872-878 `if pins.dropping { … clusterTask = Task { … } return }`），所以 86 根 FoodPin 都建過。後來被 :113 拿掉的那些 view 沒有釋放（是 MapKit 還是 SwiftUI 留著它們，目前分不出來），而且還在看 sel。
- 所以每次 sel 一變，重算的是活著的約 80 到 85 根，跟畫面上看得到幾根無關。題目的推論是「Map 對沒藏進泡泡的 Annotation 都會重算」，但對不上 s2b 的資料，上面這個推論比較合。

3. 這 80 次不是 MapTab 重算帶出來的。
- A 換 B 那幾段沒有「地圖」計數，也沒有「地圖重算」記號（M9AB 檔第 3-13 行），所以是 FoodPin.body 自己讀 sel 造成的。
- 反過來，MapTab 重算時圖釘也不會全部重跑。M10 小幅平移那筆是「卡片 5・圖釘 2・地圖 1・附近列 6・附近面板 1」（M9AB 檔第 67 行）；h3 飛完那筆是「圖釘 2・地圖 1・大卡 1・附近列 6・附近面板 1」（M9-M10 檔第 623 行）。
- 推論：FoodPin.init（:1970-1981，包括讀 pins.sel 的 :1980）重建出來的值比對相等，不會讓 body 重跑。所以只要 body 不讀 sel，A 換 B 就只剩舊的和新的兩根會重算。
- init 在選店時到底跑幾次，現在量不到（count 只放在 body 開頭），所以這次加「圖釘建」計數。

4. 選中和取消的那兩根會多跑一次 body。
- :2041 是 `.onChange(of: on) { _, v in v ? select() : deselect() }`。select() 在 :2095 改 `sx = 1.35; sy = 1.35; lift = -10`，deselect() 在 :2102 改 `sx = 0.9; sy = 0.9; lift = 0`。
- pin(on) 在 :2086-2087 讀 sx、sy、lift。pin(on) 是 :1996 Button 的 label，在 body 裡建，所以這兩根在同一段裡各會再跑一次 body。
- 推論 72ac06e 的數字可以這樣拆：A 換 B 的 80＝活著 78 根＋舊、新兩根各多 1 次；s1b 的 169＝83＋A 多 1 次＋83＋A、B 各多 1 次。
- 所以 F1 之後，A 換 B 的「圖釘」預期是 2 到 4，不是剛好 2。PinFade 的四個欄位在第二次 body 時沒有變，SwiftUI 比對相等就會跳過，所以「變淡」還是 2。

5. s1b 的 169 是兩次選取。
- 15 次都只有一筆「select 開始（點圖釘）」（:1875 的 tap() 印的）。接著 37 到 46ms 內有兩筆「點圖釘／選中」，是兩間不同的店。例如 M9-M10 檔第 6-16 行：福芳臺菜在 .274，松山土窯羊肉在 .314，第二筆前面沒有「select 開始」。
- 推論：第二筆來自 Map 的 selection 綁定（:90-111）。一般模式下它直接走 :111 `pins.select(id)`；只有行程模式才擋「0.6 秒內晚到、又跟目前不一樣」的選取（:94-99）。
- 347906f 的綁定開頭本來就印「地圖選取 <id>」（MapTab.swift:93）；T1 的 PinState.mapLate（:113）也已經擋掉這第二次選取，所以這一輪量測要加 -mapSelAll 才跟 72ac06e 一樣有兩次。

6. 掉幀毫秒數量不到 F1 要省的時間，所以判定改看「點圖釘 N ms」。下面是 A 換 B 五次逐行對時間的結果（M9AB 檔）：
- 掉幀開始到「select 開始」是 41/28/28/28/28ms（例如第 8 行的 .783 到第 3 行的 .824）。第一次按住 18ms（第 9 行），其他按住 6ms，扣掉按住時間後都是 22–23ms。74 那筆比其他筆多出來的就是按住時間，F1 碰不到這段。
- 掉幀結尾只比「點圖釘」記號晚 6–8ms（.849→.857、.520→.527、.236→.242、.818→.825、.767→.774）。
- 同一個 tick 印的「點圖釘 53/52/53/50/51 ms」（第 9、22、31、41、51 行）是 72ac06e:Perf.swift:121-122 算的「手指放開到這個 tick 真正跑」：`let from = !held && touchUp > 0 && … ? touchUp : p.at`、`let ms = Int((CACurrentMediaTime() - from) * 1000)`。換算下來，tick 在掉幀結尾之後約 20ms 才真正跑（53−33、52−32、53−31、50−30、51−29）。重算次數也是算到這個時候（Perf.swift:90 `let since = tickedAt`，在 :128 更新）。
- 掉幀毫秒數是兩個 vsync 時間相減（Perf.swift:85 `let now = l.timestamp`、:95）。推論：工作就算提早結束，只要沒有早過那個 vsync，這個數字就不會變。F1 如果只省 20ms 以內，掉幀那行可能完全看不出來。
- 「點圖釘 N ms」從手指放開算起，不含按住時間，也不會被截掉尾巴。72ac06e 五次只差 3ms（50 到 53）。

7. F1 最多能省多少（推論）。
- 原本是用 s1b 減 s2b 的掉幀中位（92 對 68）推出一根 0.25ms。但這 24ms 全部在 select 之前。掉幀開始到 select 開始：s1b 的 n1–n5 是 26/46/45/43/43（中位 43），s2b 是 13/20/17/19/19（中位 19）。select 開始到掉幀結尾：s1b 是 39/42/50/57/50，s2b 是 63/47/55/49/46，中位 50 對 49。
- s1b 第二次選取 15 次都落在掉幀結尾之後，或在同一毫秒（例如第 14 行的 .314，對第 17 行結尾的 .298）。
- 改用「點圖釘 N ms」來推：
  - s1b 是 65/69/77/71/77（M9-M10 檔第 18、68、117、166、214 行，中位 71）。裡面有兩次選取、169 次圖釘、大卡 4、附近面板 4、地圖 1、附近列 1、附近重算、兩次移地圖，而且是冷的。
  - A 換 B 中位 52，只有 80 次圖釘、大卡 1、附近面板 1、一次移地圖。
  - 假設 s1b 圖釘以外的工作不比 A 換 B 少，多出來的 89 次圖釘最多花 19ms，一根最多約 0.21ms。
  - A 換 B 少算 76 到 78 根，最多省約 16ms；A 換 B 那 52ms 裡，至少約 35ms 不是圖釘。
- 結論：重算次數會降是有把握的，但時間很可能過不了 17ms 門檻。

8. 為什麼要拆出 PinFade。
- 變淡要知道「有沒有選著」。從沒選變成有選時，每根都得變淡，這部分省不掉；但 A 換 B 時，「有沒有選著」根本沒變。
- 改成讀一個只在兩種狀態之間切換的 hasSel，而且只讓一個小 ViewModifier 讀它。這樣 A 換 B 時其他圖釘連這一層都不動；沒選→有選時，每根也只跑這一層，不是整根。
- ViewModifier 在 body(content:) 裡讀 @Observable 屬性，專案裡已有先例：TopFade（:1616-1630）讀 `lift.y`，用在 :1385；Lift 是 PanelLift.swift:8 的 `@MainActor @Observable final class Lift`。

9. 其他讀 sel 的地方都不受影響（逐一核過）。
- SelWatcher（:1918 `onChange(of: pins.sel)`、:1919 `pins.again`）照舊靠 sel 觸發。
- 行程模式的加站卡經由 :1930 `pins.select(c.map { $0.place != nil ? $0.id : "hit:" + $0.id })` 走 select()。TripCand.id 對收藏店就是 place.id（TripMode.swift:15 `var id: String { place?.id ?? hit?.id ?? "" }`），盒子對得上。
- 下面這些地方都只讀 sel，也都不讀新加的東西：Map selection 綁定的 get（:90）、NearbySheet（:1305-1306）、-holdTop（:1598）、recluster（:889）、focus（:1019）、draw()（:535、:556）、picked() 裡的 Task（:685、:714）、onChange(list)（:276）。
- 會改選取的地方都經過 select()，盒子會一起改：Map 綁定（:107、:111）、抽中（:522、:562、:578）、choose（:612）、:654、取消（:276、:484、:500、:669、:1407）。抽中被篩掉的店時，reveal()（:616-618）先設 extra 再 select，那根的盒子由 select() 或 fx() 設好。
- ClusterBubble（:2315-2356）只讀 `pins?.dimAll`（:2322）；GonePin（:2359-2371）不讀 pins；PinMenu.swift 只讀 pins.menu、pins.locate（:19、:23）。其他檔案都沒有讀 .sel。HitPin（TripTop.swift:497、:502）看的是 `mode.cand?.id`。

10. 判定條件字面上沒有達到，照樣寫的理由。
- perf-round1d.md 第 6 節 F1 寫「那筆的『圖釘』次數接近畫面上的根數，我就寫程式」，量到的是 80 對 5。第 5 節原本要的是「畫面上 20 根以上單獨圖釘的縮放」，M9 實際量的畫面只有 5 根。
- 照樣寫的理由：A 換 B 沒有地圖重算（第 3 點），所以這 80 次都是 FoodPin.body 自己讀 sel 造成的，這個修法連畫面外、藏著的那些一起拿掉。
- 上不上，照 -oldPinSel 交錯量的結果決定。

## T4 降落、平移停下時重建看不到的清單（附近列 6、卡片 5）

**摘要**

問題：降落、平移停下時附近清單換了一批店，看不到的兩塊也跟著拆掉重建。一塊是開 App 1.5 秒後就藏著建好、opacity 0 的最高段清單（附近列 6），另一塊是最低段被裁掉的中段卡片列（卡片 5）。

修法：NearbySheet 用一個不觀察的 HiddenRows 記住這兩塊畫哪一批店，看不到的時候沿用上一批。附近清單換了 0.9 秒後，等畫面上沒有東西在動、手指也不在螢幕上，先補換卡片列，0.1 秒後補換整份清單。要等的東西有：地圖、泡泡彈簧、拉面板、捲卡片列或清單、抽一間跳圖釘、轉盤、長按選單、換段彈簧。要露出來那一刻（換段、從最低段開始拉、拉過一半、從最高段收到最低段、關大卡）當場換成最新的；如果那次只是補換、附近清單本身沒變，就不加動畫。對照開關是 -liveHidden。

預期（推論）：
- 降落那筆從中位 50 降到接近 -noHighPrebuild（0/33/0/0/0）。
- 平移停下那筆少掉「卡片 5・附近列 6」，約 30–35ms，還剩 75–90ms（不在這題）。
- 停下或降落後約 0.9–1.3 秒，多一到兩筆補換，各約 20–35ms，落在畫面靜止的時候。

看得到的內容一律是最新的，但有三個可能看得出的差別：卡頓在 1 秒空窗內搬到按下那一幀、淡出的舊卡、照片晚一點淡入（見 visible），要量完再問 Anthony。

**看得出的差別（要量完才問 Anthony）**

看得到的內容：無。任何時候看得到的卡片列和整份清單都是最新的一批，包括原本漏掉的「從最高段直接收到最低段」（點搜尋框、VoiceOver 的「收起」）那約 0.25 秒的收合。換段、從最低段開始拉面板、拉過一半、VoiceOver 換段、標題的「展開附近清單」、關大卡讓卡片列重新出現時都當場換。只是補換時，換的那一下不加動畫；現在那時候早就換好了，畫面本來也不會動。標題的「附近 N 間」、圖釘落下時從 0 數上去、搜尋時的「找到 N 間」都照舊即時。

但有三個可能看得出來的差別，要先量 R1、R3、R5，再連同數字問 Anthony：

(1) 卡頓搬到按下那一幀（時機）。附近清單在看不到時換了之後、補換之前，有一段空窗：平移停下後約 1.1–1.3 秒、降落或選店後約 0.9–1.1 秒。空窗內先讓它露出來，重建就落在露出來那一幀：
- 從最低段拉面板、在最低段按 🎲 或點泡泡、VoiceOver 往上換段、收鍵盤回中段：那一幀要建卡片列（推論 5 張約 15ms，可能多掉 1 幀）。
- 拉過一半到最高段：那一幀要建整份清單的 6 列（推論約 18ms，可能多掉 1 幀）。
現在這些重建在降落、停下那一幀就做完了；平移停下那一幀同時圖釘正在飛進泡泡。

(2) 淡出中的舊卡。同一個空窗裡，在最低段點拆不開的泡泡，或點一根圖釘選店，面板升起時卡片列照舊有淡入淡出，但正在淡出的那幾張是平移前的那批，現在是平移後的那批。推論只在面板剛升起的頭 0.1–0.2 秒，而且大半被面板邊緣切掉。淡入的新卡跟現在一樣。

(3) 照片晚一點淡入。前 6 張卡片、前 8 列的照片，在換清單那一刻就在背景開始載，跟現在一樣早。卡片列停在第 7 張以後、或整份清單之前捲到下面，而且在補換前就露出來時，那幾張照片可能比現在晚一點淡入（推論多半讀快取，晚幾十 ms，0.2 秒的淡入一樣）。

另一個做法沒採用，因為它看得出來：拖地圖讓面板降到最低段那一刻，讓正在收合的卡片列維持舊的那批，可以再省掉 M10 拖到一半那筆的「卡片 1」。代價是收合那 0.3 秒裡卡片列不會換成新的一批（現在會），推論也省不到 1 幀，不建議問。

**對照開關**

-liveHidden：加了就恢復 72ac06e 的行為。

- HiddenRows.take 一律回傳最新的附近清單，看不到的列照舊每次跟著拆掉重建。
- stale 永遠是 false、swaps 永遠是 0，所以 drag() 不會多叫面板重算，兩行 `.animation(nil, value:)` 也不起作用。
- catchUpHidden 一開始就 return：不預載照片，也不補換。

剩下的差別都不影響畫面，推論都在 0.1ms 以下，可以拿來交錯量：
- 每次鏡頭回呼多寫一個不觀察的 pins.camAny。
- 泡泡換上時寫 pins.clusterAt。
- 整份清單換捲動狀態時寫 probe 的兩個值。
- 附近清單每換一次，就建一個馬上結束的 task，並比一次 [Place]。
- 拉過一半時多一行量測記號（沒開量測不印）。

-noHighPrebuild（72ac06e:MapTab.swift:1396）原封不動，照舊是「藏著的最高段清單不預建」的量測開關。加了它時整份清單一直算看得到、不會凍住，可以跟不加、-liveHidden 三組一起交錯量。

另外新增一個量測用的 -hiddenWait <ms>：附近清單換了之後，等幾 ms 才開始補換（不加是 900，正式版讀不到啟動參數）。只用在 sim (5)，不是對照開關。

**移植到 347906f**

兩位反方逐條核對 347906f（搜尋列拆成 MapSearchBar、T1、T2 都在），露出來的每一條路和 hiddenBusy 讀的每個值都還成立。改了兩處：
- T4-21（新加）：MapPanel.go 收到最低段也設 calmUntil。原本只有升段才設，點搜尋框、VoiceOver「收起」收到最低段時，補換可能落在收合彈簧中間。
- T4-9 的 hiddenBusy：cards.finger、probe.listMoving 跟手指一樣只信 5 秒。卡片列還在滑時被大卡換掉，就收不到停下的回呼，之後補換會一直不做。
- 兩處註解的行號改成不寫行號（「FoodMapApp.swift 裡 Root 的 .task」）。
- -liveHidden 恢復的是 347906f 的行為。

### 改動

#### T4-1　MapTab.swift（347906f 第 197 行起）

**位置**：72ac06e:MapTab.swift:190-191（MapTab 的 .onMapCameraChange(frequency: .continuous) 裡），搜尋 `if pos.positionedByUser { pins.camAt = now }`（:220 也有一行 `let now = CACurrentMediaTime()`，所以兩行一起找）

**原文**：
```swift
                    let now = CACurrentMediaTime()
                    if pos.positionedByUser { pins.camAt = now }
```

**改成**：
```swift
                    let now = CACurrentMediaTime()
                    pins.camAny = now   // 鏡頭最後一次在動（手指拖、甩、程式移、飛都算）：附近面板等它停了才補換看不到的清單
                    if pos.positionedByUser { pins.camAt = now }
```

**理由**：補換要等鏡頭真的停下來，程式飛過去也算。camAt 只在 positionedByUser 時更新（:191），s2b 抽中時附近清單就換過一次（M9-M10 Console 第 83 行 3142250.615「附近算 0.02 ms，10 間」），飛完在 1.35 秒後（第 96 行），只看 camAt 的話補換會落在飛行途中。

#### T4-2　MapTab.swift（347906f 第 1079 行起）

**位置**：72ac06e:MapTab.swift:972（recluster 裡 to.isEmpty 那段），搜尋 `Perf.shared.mark("泡泡直接換")`

**原文**：
```swift
            Perf.shared.mark("泡泡直接換")
```

**改成**：
```swift
            Perf.shared.mark("泡泡直接換")
            pins.clusterAt = CACurrentMediaTime()   // 新泡泡正要彈出來：附近面板補換看不到的清單時避開
```

**理由**：新泡泡 onAppear 用 spring(response 0.35, damping 0.6) 彈出來（:2350-2352），約 0.4 秒才停；補換要等它停。只寫一個不觀察的欄位。

#### T4-3　MapTab.swift（347906f 第 1089 行起）

**位置**：72ac06e:MapTab.swift:982（recluster 的 clusterTask 裡），搜尋 `Perf.shared.mark("泡泡換上")`

**原文**：
```swift
                Perf.shared.mark("泡泡換上")
```

**改成**：
```swift
                Perf.shared.mark("泡泡換上")
                pins.clusterAt = CACurrentMediaTime()   // 新泡泡正要彈出來：附近面板補換看不到的清單時避開
```

**理由**：同上。M10 平移 Console 第 64、68 行：停下 730.657、泡泡換上 731.098（停下後 0.44 秒），補換最早在停下後 0.9 秒，跟彈簧結束只差一兩幀，所以另外等泡泡換上後 0.5 秒。

#### T4-4　MapTab.swift（347906f 第 1941 行起）

**位置**：72ac06e:MapTab.swift:1811（PinState 裡），搜尋 `var moving: Bool { CACurrentMediaTime() - camAt < 0.12 }`

**原文**：
```swift
    var moving: Bool { CACurrentMediaTime() - camAt < 0.12 }
```

**改成**：
```swift
    var moving: Bool { CACurrentMediaTime() - camAt < 0.12 }
    // 鏡頭最後一次動的時間（手指拖、甩出去還在滑、程式移、飛過去都算）、泡泡最後一次換上的時間（彈出來的彈簧約 0.4 秒）：
    // 附近面板補換看不到的清單前看這兩個，地圖在動、泡泡在彈就先不換。不觀察，每幀寫也不會讓畫面重算
    @ObservationIgnored var camAny: CFTimeInterval = 0
    @ObservationIgnored var clusterAt: CFTimeInterval = 0
```

**理由**：新增上面三處寫的欄位。moving（擋點圖釘、點泡泡）照舊只看 camAt。

#### T4-5　MapTab.swift（347906f 第 1419 行起）

**位置**：72ac06e:MapTab.swift:1289（NearbySheet 的 @State），搜尋 `@State private var highUsed = false`

**原文**：
```swift
    @State private var highUsed = false         // 整份清單出現過就留著（不要拿掉再建）
```

**改成**：
```swift
    @State private var highUsed = false         // 整份清單出現過就留著（不要拿掉再建）
    // 看不到的部分（藏著的整份清單、最低段被裁掉的卡片列）畫哪一批店：看不到時附近清單換了也不跟著換，
    // 閒下來或要露出來時才換成最新的（-liveHidden：照舊每次都跟著換）
    @State private var lagHigh = HiddenRows()
    @State private var lagCards = HiddenRows()
    @State private var freshHigh = 0            // +1：整份清單換成最新的一批（閒下來補換）
    @State private var freshCards = 0           // +1：卡片列換成最新的一批（閒下來補換、從最低段開始拉面板）
```

**理由**：兩塊各一個 HiddenRows（不觀察的 class，在 body 裡記，寫法跟 :1290 PanelProbe、CardScroll 一樣），加兩個會讓面板重算一次的計數。

#### T4-6　MapTab.swift（347906f 第 1438 行起）

**位置**：72ac06e:MapTab.swift:1308（NearbySheet.body），搜尋 `let tall = tallPull ?? (mp.stage == .high)`（只有這一行是 let tall）

**原文**：
```swift
        let tall = tallPull ?? (mp.stage == .high)
```

**改成**：
```swift
        let tall = tallPull ?? (mp.stage == .high)
        // 看不到的部分這一次畫哪一批店（附近清單換了時，看不到的列不用拆掉重建）：
        // 整份清單：拉到最高段（或拉過一半）、還沒預建、附近沒有店時跟著最新的；
        // 卡片列：中段看得到、手指在拉面板、選著店（卡片列不在畫面上）、附近沒有店時跟著最新的。
        // 剛收起來或換了一種藏法 0.45 秒內（面板收合、中段淡入淡出時還看得到）、閒下來補換、從最低段開始拉面板時也換成最新的
        let highShown = tall || !highUsed || near.places.isEmpty
        let cardsShown = picked != nil || mp.dragging || (!tall && mp.stage != .low) || near.places.isEmpty
        let highRows = lagHigh.take(near.places, shown: highShown, fresh: freshHigh)
        // 卡片列有兩種藏法：被整份清單蓋住（tall）、最低段被裁掉。從最高段直接收到最低段時中段會淡入、面板收合時看得到，也算剛收起來
        let cardRows = lagCards.take(near.places, shown: cardsShown, fresh: freshCards, scene: tall ? 1 : 0)
```

**理由**：修法的核心。看得到的條件跟畫面一致：整份清單 :1339 `.opacity(tall ? 1 : 0)`；卡片列在 tall 時 opacity 0（:1333），最低段被裁掉（:1349，卡片列上緣在 23＋44＋10＝77pt，比 lowH 72 低）。scene 補上反方一指出的缺口：最高段→最低段（:820 beginTyping 的 go(.low)、:1508 標題的「收起」）時卡片列一直算看不到，沒有寬限，收合那約 0.25 秒會畫出舊卡。「附近沒有店」當作看得到，有沒有卡片列（中段高度、mp.midTop）照即時的走。兩個 Bool 先算成 let，減輕這條很長的 body 的型別推斷。

#### T4-7　MapTab.swift（347906f 第 1455 行起）

**位置**：72ac06e:MapTab.swift:1325，搜尋 `mid(picked, drawn)`

**原文**：
```swift
                mid(picked, drawn)
```

**改成**：
```swift
                mid(picked, drawn, cardRows)
```

**理由**：把卡片列要畫的那批傳進去。

#### T4-8　MapTab.swift（347906f 第 1466 行起）

**位置**：72ac06e:MapTab.swift:1336-1337，搜尋 `if tall || highUsed {` 和下一行的 `high`

**原文**：
```swift
                if tall || highUsed {
                    high
```

**改成**：
```swift
                if tall || highUsed {
                    high(highRows)
```

**理由**：high 改成函式（見 :1458）。-noHighPrebuild 和 :1396 的預建 .task 都沒動。

#### T4-9　MapTab.swift（347906f 第 1526 行起）

**位置**：72ac06e:MapTab.swift:1396-1401（body 最後的預建 .task 結尾、body 的右括號、mid 的宣告），搜尋 `if !Task.isCancelled, !highUsed, !Flag.on("-noHighPrebuild") { highUsed = true }` 到 `private func mid(_ picked: Place?, _ drawn: Bool) -> some View {`

**原文**：
```swift
            if !Task.isCancelled, !highUsed, !Flag.on("-noHighPrebuild") { highUsed = true }
        }
    }

    // 中間段：選到的大卡片、新帳號的第一張卡，或標題＋一排卡片（最低段只露出最上面那行）
    private func mid(_ picked: Place?, _ drawn: Bool) -> some View {
```

**改成**：
```swift
            if !Task.isCancelled, !highUsed, !Flag.on("-noHighPrebuild") { highUsed = true }
        }
        // 看不到的部分閒下來補換成最新的一批（附近清單又換了，這個 task 會被取消、從頭等）
        .task(id: near.places) { await catchUpHidden() }
    }

    // 看不到的部分補換成最新的一批：附近清單最後一次換了 0.9 秒後，畫面上沒有東西在動、手指也不在螢幕上才換。
    // 卡片列和整份清單分兩次換（中間隔 0.1 秒），一幀不要做太多
    private func catchUpHidden() async {
        guard !Flag.on("-liveHidden") else { return }
        guard lagCards.stale || lagHigh.stale else { return }
        // 照片先在背景載好（跟卡片、列自己載的同樣大小）：補換之前就露出來時，照片跟現在一樣早就有
        let cardPhotos: [URL] = lagCards.stale ? near.places.prefix(6).compactMap(\.photoURL) : []
        let hiPhotos: [URL] = lagHigh.stale ? near.places.prefix(8).compactMap(\.photoURL) : []
        if !cardPhotos.isEmpty || !hiPhotos.isEmpty {
            Task {
                for u in cardPhotos { _ = await PhotoLoader.shared.load(u, 300) }
                for u in hiPhotos { _ = await PhotoLoader.shared.load(u, 200) }
            }
        }
        // 量測用 -hiddenWait 600：換清單後等幾 ms 才開始補換（不加是 900）
        let wait = Flag.value("-hiddenWait").flatMap { Int($0) } ?? 900
        try? await Task.sleep(for: .milliseconds(wait))
        for step in 0..<2 {
            while !Task.isCancelled, hiddenBusy() {
                try? await Task.sleep(for: .milliseconds(200))
            }
            guard !Task.isCancelled else { return }
            if step == 0, lagCards.stale {
                Perf.shared.mark("補換卡片列")
                freshCards += 1
                try? await Task.sleep(for: .milliseconds(100))
            } else if step == 1, lagHigh.stale {
                Perf.shared.mark("補換整份清單")
                freshHigh += 1
            }
        }
    }

    // 補換先等一下的情況：拉面板、圖釘落下、抽一間一根根跳、轉盤或 3 張卡蓋著、長按選單、手指按著或剛放開 0.3 秒內、
    // 卡片列或整份清單在捲或還在滑、地圖 0.4 秒內動過、泡泡剛換上 0.5 秒內（彈出來的彈簧）、換段的彈簧還沒停
    private func hiddenBusy() -> Bool {
        let now = CACurrentMediaTime()
        let touch = Perf.shared
        if mp.dragging || pins.dropping || pins.drawWin != nil || pins.menu != nil || store.drawCover { return true }
        // 手指時間由 TouchClock 記（FoodMapApp.swift 裡 Root 的 .task 一律裝上），沒開量測也準；按著超過 5 秒當成漏了放開，不再等
        if touch.fingerDown && now - touch.touchedAt < 5 { return true }
        if now - touch.touchedAt < 0.3 { return true }
        // 捲到一半被拿掉（例如卡片列還在滑時點圖釘換成大卡）就收不到停下的回呼，finger、listMoving 會一直是 true：跟手指一樣只信 5 秒
        if cards.finger && now - cards.fingerAt < 5 { return true }
        if probe.listMoving && now - probe.listAt < 5 { return true }
        if now - max(pins.camAny, cards.fingerAt, probe.listAt) < 0.4 { return true }
        if now - pins.clusterAt < 0.5 { return true }
        return now < mp.calmUntil
    }

    // 中間段：選到的大卡片、新帳號的第一張卡，或標題＋一排卡片（最低段只露出最上面那行）
    private func mid(_ picked: Place?, _ drawn: Bool, _ rows: [Place]) -> some View {
```

**理由**：閒下來補換。task(id:) 每次清單換了就重來，等於防抖；Place 是 Hashable（Models.swift:4），[Place] 可以當 id，而且整份比（「去過」改了也算換）。閉包搬成函式（反方一），減輕 body 的型別推斷。等待條件合併兩位反方：抽一間在跳（:1802 drawWin）、轉盤或 3 張卡（Draw.swift:433 → Store.swift:83 drawCover）、長按選單（:1807 menu）、手指（Perf 新加的兩個值）、卡片列（:1639-1640）、整份清單（PanelProbe 新加的兩個值）、泡泡彈簧（clusterAt）。每個條件一個 if，不用一長串 ||，型別推斷比較快。照片在換清單那一刻就在背景開始載（PhotoLoader 是 actor，會合併同一張正在載的，Photo.swift:65-68；PhotoView 的 init 先讀記憶體快取，載好的第一幀就畫出來）。-hiddenWait 只是量測用的等待時間（正式版讀不到，一律 900）。:1417 的 `if !near.places.isEmpty` 刻意不改，卡片列在不在照即時清單決定。

#### T4-10　MapTab.swift（347906f 第 1550 行起）

**位置**：72ac06e:MapTab.swift:1420（卡片列的 LazyHStack 裡），搜尋 `ForEach(near.places) { p in` 而且下一行是 `NavigationLink(value: p) { MapCard(`（:1473 也有一行一樣的，那行下一行是 NearRow）

**原文**：
```swift
                                ForEach(near.places) { p in
                                    NavigationLink(value: p) { MapCard(
```

**改成**：
```swift
                                // 最低段被裁掉、被整份清單蓋住時是上一批（rows）：看不到的卡片不跟著拆掉重建
                                ForEach(rows) { p in
                                    NavigationLink(value: p) { MapCard(
```

**理由**：只換 ForEach 的資料。ForEach 還是 LazyHStack 的直接子項，lazy、.scrollTargetLayout()、.scrollPosition(id: $scrolled)、.onScrollPhaseChange、.task(id: scrolled) 都沒動。

#### T4-11　MapTab.swift（347906f 第 1568 行起）

**位置**：72ac06e:MapTab.swift:1438，搜尋 `.frame(height: 112)`（整個檔案只有這一行），插在它下面、`.accessibilityHidden(mp.stage == .low)` 上面

**原文**：
```swift
                        .frame(height: 112)
```

**改成**：
```swift
                        .frame(height: 112)
                        // 附近清單沒變、只是把藏著的上一批補成最新的那一下（例如跟換段同時）不要動畫：露出來的第一幀就是新的一批，跟現在一樣
                        .animation(nil, value: lagCards.swaps)
```

**理由**：露出來多半是 withAnimation 換段（go、atLeastMid、settle）造成的，同一個交易裡換資料，卡片會淡入淡出；現在那時候早就換好了，不會動。swaps 只在「附近清單這次沒變、只是補換」時加 1，所以看得到時正常換清單、或換段和換清單同一下（例如在最低段點拆不開的泡泡，:997 atLeastMid ＋ :1007 snappy）照舊帶著那次的動畫。

#### T4-12　MapTab.swift（347906f 第 1588 行起）

**位置**：72ac06e:MapTab.swift:1458，搜尋 `private var high: some View {`

**原文**：
```swift
    private var high: some View {
```

**改成**：
```swift
    private func high(_ rows: [Place]) -> some View {
```

**理由**：接收整份清單要畫的那批。:1460 的 titleRow、:1461 `if near.places.isEmpty`、:1464 near.subtitle 照舊讀即時的 near，所以「附近 N 間」、落下時從 0 數上去都不受影響。

#### T4-13　MapTab.swift（347906f 第 1603 行起）

**位置**：72ac06e:MapTab.swift:1473（最高段 LazyVStack 裡），搜尋 `ForEach(near.places) { p in` 而且下一行是 `NavigationLink(value: p) { NearRow(`

**原文**：
```swift
                        ForEach(near.places) { p in
                            NavigationLink(value: p) { NearRow(
```

**改成**：
```swift
                        // 藏著時是上一批（rows）：看不到的列不跟著拆掉重建
                        ForEach(rows) { p in
                            NavigationLink(value: p) { NearRow(
```

**理由**：只換 ForEach 的資料。ForEach 還是 LazyVStack 的直接子項，ListPullDown（:1479）、onScrollGeometryChange、onScrollPhaseChange 都沒動。

#### T4-14　MapTab.swift（347906f 第 1619 行起）

**位置**：72ac06e:MapTab.swift:1489（整份清單的 .onScrollPhaseChange 裡），搜尋 `listTouch = ph == .interacting`

**原文**：
```swift
                    listTouch = ph == .interacting
```

**改成**：
```swift
                    listTouch = ph == .interacting
                    // 補換看不到的卡片列時避開：清單正在捲、甩出去還在滑（listTouch 只算手指拉著）
                    probe.listMoving = ph != .idle
                    probe.listAt = CACurrentMediaTime()
```

**理由**：停在最高段捲清單時卡片列被蓋住、可能是舊的，補換卡片列不要落在清單甩出去還在滑的時候（UIScrollView 的減速靠主執行緒推）。寫在不觀察的 PanelProbe，不會讓面板重算。

#### T4-15　MapTab.swift（347906f 第 1625 行起）

**位置**：72ac06e:MapTab.swift:1495，搜尋 `.swipeBackBlocked(tallPull ?? (mp.stage == .high))`

**原文**：
```swift
                .swipeBackBlocked(tallPull ?? (mp.stage == .high))
```

**改成**：
```swift
                .swipeBackBlocked(tallPull ?? (mp.stage == .high))
                // 附近清單沒變、只是把藏著的上一批補成最新的那一下（換到最高段、拉過一半）不要動畫：露出來的第一幀就是新的一批
                .animation(nil, value: lagHigh.swaps)
```

**理由**：跟卡片列同一個理由。拉過一半那一下帶著 :1346 `.animation(.easeOut(duration: 0.18), value: tall)`，換段帶著 go 的彈簧，列不能跟著播插入動畫；整份清單外層的 `.opacity(tall ? 1 : 0)` 在這個修飾符外面，0.18 秒的淡入照舊。

#### T4-16　MapTab.swift（347906f 第 1687 行起）

**位置**：72ac06e:MapTab.swift:1557（drag 的第一行），搜尋 `if !mp.dragging { mp.dragging = true }`

**原文**：
```swift
        if !mp.dragging { mp.dragging = true }
```

**改成**：
```swift
        if !mp.dragging {
            mp.dragging = true
            // 從最低段開始拉：被裁掉的卡片列再拉高約 5pt 就露出來，還是上一批就先換成最新的。
            // 整份清單（和從最高段往下拉時的卡片列）要拉過一半才看得到：那時 tallPull 變了、take() 當場換，不在按下那一幀多做 6 列
            if mp.stage == .low, lagCards.stale {
                Perf.shared.note("開始拉面板 補換卡片列")
                freshCards += 1
            }
        }
```

**理由**：mp.dragging 不觀察，lift 只讓 LiftHeight 重畫，從最低段往上拉時 NearbySheet 不會自己重算，所以只有這一種要在這裡叫它重算。兩位反方都指出原本連整份清單也換，會把 6 列（推論約 18ms）塞進按下那一幀，沒有必要：拉過一半時 :1560 改 tallPull（@State），那次 body 的 shown 就是 true。中段時卡片列一直是最新的；最高段往下拉時，卡片列要等 tallPull 變 false 才露出來，那次 body 的 shown 因為 mp.dragging 已經是 true。PanelDrag 和 ListPullDown 都經過 drag()。

#### T4-17　MapTab.swift（347906f 第 1690 行起）

**位置**：72ac06e:MapTab.swift:1560（drag 的最後一行），搜尋 `if t != (tallPull ?? (mp.stage == .high)) { tallPull = t }`

**原文**：
```swift
        if t != (tallPull ?? (mp.stage == .high)) { tallPull = t }
```

**改成**：
```swift
        if t != (tallPull ?? (mp.stage == .high)) {
            Perf.shared.note(t ? "拉過一半 往上" : "拉過一半 往下")
            tallPull = t
        }
```

**理由**：只多一行量測記號（加不加參數都一樣，沒開量測時 note 直接 return），模擬器才找得到跨線那一筆掉幀。

#### T4-18　MapTab.swift（347906f 第 1762 行起）

**位置**：72ac06e:MapTab.swift:1632-1634，搜尋 `private final class PanelProbe {`

**原文**：
```swift
private final class PanelProbe {
    var top: CGFloat = 0
}
```

**改成**：
```swift
private final class PanelProbe {
    var top: CGFloat = 0
    // 整份清單正在捲（手指拉著、甩出去還在滑）、最後一次換捲動狀態的時間：補換看不到的卡片列時避開
    var listMoving = false
    var listAt: CFTimeInterval = 0
}
```

**理由**：上面 :1489 寫的兩個值。

#### T4-19　MapTab.swift（347906f 第 1770 行起）

**位置**：72ac06e:MapTab.swift:1641（`private final class CardScroll` 的右括號）之後，搜尋 `var fingerAt: CFTimeInterval = 0     // 手指最後一次捲的時間`，加在它下一行的 `}` 之後

**原文**：
```swift
    var fingerAt: CFTimeInterval = 0     // 手指最後一次捲的時間（放開、停下那一刻也算）
}
```

**改成**：
```swift
    var fingerAt: CFTimeInterval = 0     // 手指最後一次捲的時間（放開、停下那一刻也算）
}

// 看不到的一塊（藏著的整份清單、最低段被裁掉的卡片列）現在畫哪一批店。不觀察：在 body 裡記，改了不會讓面板重算。
// 看不到時附近清單換了（降落、地圖停下），這塊先沿用上一批（不然看不到的列也要拆掉重建）；閒下來或要露出來時才換成最新的
private final class HiddenRows {
    private(set) var rows: [Place]?          // 現在畫的那批（nil：還沒畫過）
    private(set) var stale = false           // 畫的是上一批（跟最新的附近清單不一樣）
    private(set) var swaps = 0               // 附近清單沒變、只是把上一批補成最新的次數：這一下不要動畫
    private var on = false                   // 上一次算的時候看不看得到
    private var scene = 0                    // 上一次是哪種藏法（卡片列：1＝被整份清單蓋住，0＝其他）
    private var offAt: CFTimeInterval = 0    // 從看得到變成看不到、或換了一種藏法的時間
    private var tick = 0                     // 上次看到的 fresh（變了就換成最新的）
    private var last: [Place]?               // 上一次拿到的最新清單：看這次附近清單有沒有換

    // 這一次要畫哪一批：看得到、剛收起來或換了藏法不到 0.45 秒（面板 0.38 秒的彈簧收合、中段 0.18 秒的淡入淡出時還看得到）、
    // fresh 變了（閒下來補換、從最低段開始拉面板）、還沒畫過，就是最新的；不然沿用上一批。-liveHidden：一律最新的（照舊）
    func take(_ latest: [Place], shown: Bool, fresh: Int, scene s: Int = 0) -> [Place] {
        let now = CACurrentMediaTime()
        if (on && !shown) || s != scene { offAt = now }
        on = shown
        scene = s
        let changed = last != latest
        last = latest
        let live = Flag.on("-liveHidden") || shown || now - offAt < 0.45 || fresh != tick || rows == nil
        tick = fresh
        if live {
            // 附近清單這次沒變、只是把藏著的上一批補成最新的（例如跟換段同一下）：記一次，這一下不要動畫。
            // 這次附近清單也換了（例如在最低段點拆不開的泡泡）：不記，照現在一樣讓這次的動畫帶著換
            if stale, !changed { swaps += 1 }
            rows = latest
        }
        stale = rows != latest
        return rows ?? latest
    }
}
```

**理由**：同樣的輸入呼叫兩次結果一樣（第二次 stale 已經是 false、on 和 scene 沒變），body 重跑不會出錯，也不會造成重算迴圈。changed 讓「換段和換清單同一下」照舊帶動畫，只有純補換才關動畫，比原本一律關動畫更接近現在。Array 的 == 在同一份儲存時直接回 true，不同份才逐個比 Place，推論每次 body 多的比較在 0.1ms 以下。Flag 沒綁 actor（Perf.swift:200 起的 enum Flag），可以在這裡呼叫。0.45 秒是收合時間：spring(response 0.38, damping 0.82) 推算約 0.27 秒過零點，卡片列在約 0.25 秒時完全收進去；中段淡入淡出 0.18 秒。

#### T4-20　Perf.swift（347906f 第 57 行起）

**位置**：72ac06e:Perf.swift:48-54（func touched 的結尾）之後、:56 `// 狀態改變的地方呼叫` 之前，搜尋 `print(String(format: "[perf] %.3f 手指", t) + (down ? "按下" : "放開"))` 和下一行的 `    }`

**原文**：
```swift
        print(String(format: "[perf] %.3f 手指", t) + (down ? "按下" : "放開"))
    }
```

**改成**：
```swift
        print(String(format: "[perf] %.3f 手指", t) + (down ? "按下" : "放開"))
    }

    // 手指現在有沒有按在螢幕上、最後一次按下或放開的時間。TouchClock 在 FoodMapApp.swift 裡 Root 的 .task 一律裝上，
    // touched() 在 guard on 之前就記時間，所以沒開量測浮層、正式版也準。附近面板補換看不到的清單前看這個
    var fingerDown: Bool { touchDown > touchUp }
    var touchedAt: CFTimeInterval { max(touchDown, touchUp) }
```

**理由**：反方二：補換不要撞上手指剛按下、還沒移動的那一幀（原本 risks 1）。touchDown、touchUp 是 @ObservationIgnored private（Perf.swift:21-22），在 class 裡加計算屬性讀得到；@Observable 不管計算屬性。量測行都沒動。

#### T4-21　MapPanel.swift（347906f 第 36 行起）

**位置**：MapPanel.go()（347906f MapPanel.swift:36）

**原文**：
```swift
        if s != .low { calmUntil = CACurrentMediaTime() + 0.8 }
```

**改成**：
```swift
        // 收到最低段也記：附近面板補換看不到的清單時要等這段彈簧停（鏡頭回呼的 go(.low) 只在還沒到最低段時做，不受影響）
        calmUntil = CACurrentMediaTime() + 0.8
```

**理由**：移植時兩位反方都確認：go(.low) 原本不設 calmUntil，點搜尋框、VoiceOver「收起」收到最低段時，hiddenBusy 只靠手指 0.3 秒擋，補換可能落在收合彈簧和鍵盤升起中間。calmUntil 只有鏡頭回呼和 hiddenBusy 在讀；已經在最低段時鏡頭回呼的 go(.low) 本來就不做事，其他升段的路都會自己重設，所以除了補換多等一下，行為不變。

**模擬器**

整輪加 `-noPinPair -mapSelAll`（347906f 有 T1、T2；加了分群和 MapKit 選取才跟 72ac06e 一樣）。

共同做法照 perf-round1d 第 5 節：
- Release 模擬器（-Wl,-no_deduplicate）、-perfOverlay。
- 每次 terminate 再 launch，先飛一次遠的不計，等「清單掛上 首頁」後 2.5 秒才動手。
- 除了 R3、R6，中途都不要拉到最高段。
- 每一次都報原始 Console，不只報中位數。每次報窗口裡所有掉幀行的最長一筆、毫秒加總、42ms 以上的筆數，每組報中位。
- 「補換卡片列 N ms」「補換整份清單 N ms」那行不要用：Perf.swift:121 對手指放開後 1 秒內的記號從放開算起，可能接近 1000。一律看緊接在「記號 補換…」後面的掉幀行；沒有掉幀行就記 0（25ms 以下，Perf.swift:87）。

(1) M10 降落：不加、-liveHidden、-noHighPrebuild 三組交錯，各 5 次（n L p n L p…，共 15 次開 App）。
每次固定：s1b（全台點嘉義）→ 等 3 秒 → ✕ → 等 3 秒 → 🎲（-drawWin Mercer Brunch 的 id）→ 飛完後等 3 秒。
窗口從按 ✕ 到飛完後 2.5 秒。列出每一個「補換」記號離 ✕、抽一間（開始）、select 開始（抽中）、飛完各幾秒。
- (a) 飛完那筆：不加預期沒有「附近列」，只剩「大卡 1・附近面板 1」，毫秒接近 -noHighPrebuild（72ac06e 是 0/33/0/0/0）。-liveHidden 應該跟 72ac06e 不加一樣（44–52，附近列 6）。
- (b) 補換那筆：不加在飛完後約 0.9–1.1 秒有「記號 補換整份清單」，後面那筆掉幀（如果有）應該是「附近列 ≤6・附近面板 1・大卡 1」，推論 20–35ms。這段不應該有「補換卡片列」，因為選著店。不加在 s1b 後約 1.1 秒、✕ 後約 0.9–1.2 秒還各有一次補換整份清單，也要記下時間；這些都不能落在「抽一間（開始）」到「select 開始」之間。-liveHidden 和 -noHighPrebuild 兩組都不應該有任何補換記號。
- (c) 補換前後 300ms 內的其他記號：72ac06e 降落後 1 秒內沒有泡泡換上，泡泡在飛行中停下後就換好了（原始 Console 第 43、47 行）。要看的是「影片預載好」，它在飛完後 0.02–0.61 秒（第 53、102、345 行）；補換整份清單應該在它之後。報補換那筆前後 300ms 內有沒有「影片預載好」「地圖重算」或其他記號。
- (d) 錄影：不加、-liveHidden 各 3 次，60fps，從飛完前 0.3 秒錄到飛完後 1.5 秒。逐幀看 -liveHidden 那組降落那筆（約 50ms）有沒有東西停住，例如地圖標籤淡入、照片淡入、大卡；也看不加那組補換那一刻有沒有任何東西在動。看不出來就照實寫「降落那筆的好處只在 Console 上」。
判定，五條都過才算過：
- ① 不加 5 次飛完那筆都沒有附近列，中位比 -liveHidden 低 17ms 以上。
- ② 補換那筆 5 次中位 ≤33ms，而且沒有一次 ≥42ms。
- ③ 窗口最長一筆的中位比 -liveHidden 低至少 1 幀。
- ④ 錄影裡補換那一刻畫面上沒有東西在動。
- ⑤ -noHighPrebuild 那組沒有補換記號。
有一條不過就先不上，把原始 Console 報回來。下一步照 perf-round1c 和 perf-round1d 第 6 節的方向，改成拆到不同幀或讓它變便宜（照第幾列認列）。

(2) M10 小幅平移：不加、-liveHidden 交錯，各 5 次。
每次：s2b 降落後等 3 秒 → ✕ → 等 3 秒（✕ 會改面板上緣、換清單，不加那組會補換一次）→ 用跟點擊同一套自動工具，從畫面中間往左拖 100pt，起點、終點、時間都固定，放開時帶同樣的速度讓地圖滑一下 → 等 3 秒。
窗口從手指按下到停下後 2.5 秒，另外附上 ✕ 之後 3 秒內的補換記號。每次報兩筆「附近算 N 間」，以及有沒有「泡泡換上／泡泡直接換」。兩組只比 N 相差 3 間以內的那幾次，湊不滿 5 次就補跑。72ac06e 那 1 次的等待時間不同，不要拿 113 直接比。
- (a) 拖到一半那筆（約 38 間）：兩組應該一樣是「卡片 1・附近面板 2」。卡片列收合時還看得到，照設計照舊跟著換。
- (b) 停下那筆（約 50 間加地圖重算）：不加應該沒有「卡片」和「附近列」，只剩「圖釘・地圖・附近面板」；-liveHidden 照舊有「卡片 5・附近列 6」。推論少約 30–35ms（2 幀），還剩約 75–90ms，是 MapTab、圖釘和 MapKit，不在這題。
- (c) 補換兩筆：停下後約 1.1–1.3 秒有「補換卡片列」，重算約「卡片 5・附近面板 1」；再過 0.1–0.3 秒有「補換整份清單」，重算約「附近列 6・附近面板 1」。報兩筆各多長、離停下幾秒、離「泡泡換上」幾秒（應該 ≥0.5 秒）。錄影看補換那一刻泡泡、地圖、面板是不是都停了。
判定：
- 停下那筆不加的中位比 -liveHidden 低 17ms 以上。
- 兩筆補換各自 5 次中位 ≤33ms，沒有一次 ≥42ms。
- 窗口最長一筆不加的中位不高於 -liveHidden。

(3) 露出來那一刻和閒下來的條件：不加、-liveHidden 各 3 次，60fps 錄影，用同一個起始畫面。
- R1：平移停下後 0.3 秒內抓標題那行，把面板拉到中段。含「開始拉面板 補換卡片列」的那筆掉幀（沒有掉幀行記 0）只應該有「卡片 N・附近面板 1」，不應該有「附近列」。錄影：卡片列露出來的第一幀就是新的那批，順序跟 -liveHidden 一樣，沒有淡入。判定：不加 3 次的中位不能比 -liveHidden 多 17ms 以上，超過就把那幾行報回來（這是 visible (1)）。
- R2：平移停下後 0.3 秒內，在最低段按 🎲（一間模式、-drawWin）。報含「抽一間（開始）」那筆掉幀和重算次數，跟 -liveHidden 對照。卡片列升上來時已經是新的那批，沒有淡入淡出，接著照常跳圖釘。
- R3：降落後 0.3 秒內，把大卡最上面那行往上拉到最高段。開始拉那筆不應該有「附近列」，「附近列 6」要出現在含「拉過一半 往上」的那筆。清單第一幀就是台北那批，沒有嘉義的店，列沒有插入動畫。判定同 R1，看跨線那筆。
- R4：打開 VoiceOver，平移停下後 0.5 秒內在橫條上往上滑一次（increment）。卡片列唸出來的是新的那批。
- R5：平移停下後 0.3 秒內，在最低段點一顆拆不開的泡泡（只列這幾間）。錄影對照：兩組都要有換成那幾間的淡入淡出；不加那組淡出的是平移前的卡，-liveHidden 是平移後的卡（visible (2)），看不看得出來照實寫。同一個情境改成點一根單獨的圖釘（選店），再錄一次。
- R6：停在最高段，從清單進店家頁按「去過」再返回，0.5 秒內點搜尋框，讓面板從最高段直接收到最低段。錄影看收合時卡片列的內容，兩組都要是最新的。
- R7：✕ 後 0.4–0.6 秒按 🎲（-drawWin，跳的根數固定）。不加那組在「抽一間（開始）」到「select 開始（抽中）」之間不能有補換記號，跳的圖釘不能頓。
- R8：降落後 0.5 秒內按大卡的「再抽一次」。判定同 R7。
- R9：平移讓面板降到最低段，停下後 0.5 秒內按 🎲（轉盤模式），轉盤出來就按「轉」。轉盤轉的時候不能有補換記號，轉盤不能頓。
- R10：平移停下後 0.5 秒內把面板拉到中段，接著連續左右滑卡片列 2 秒。「補換整份清單」要等手指停、卡片列停下 0.4 秒後才出現；滑的時候跟 -liveHidden 比，不能多一筆掉幀。

(4) M9 s1b（不加 5 次）：那筆的「附近列 1」應該變成 0，毫秒不應該變差。select 後約 1.1 秒會有一次「補換整份清單」，看它後面那行掉幀，重算的附近列約 1。

(5) 選做：R1、R3 和 (2) 再跑一輪，不加和加 -hiddenWait 600 交錯各 3 次。看補換能不能提早、把 visible (1) 的空窗縮小，又不撞到泡泡換上（平移時 clusterAt 那條仍會等到泡泡換上後 0.5 秒）。

**回歸**

- 開 App：圖釘落下時「附近 N 間」從 0 數到 N；1.5 秒後藏著建好整份清單，第一次拉到最高段不會頓；加 -noHighPrebuild 時照舊只有拉到最高段才建。
- 拉面板：從橫條、標題那行、大卡最上面那行拉，三段都停得對；甩一下會跳段；拉過一半時整份清單淡入、拉回來淡出，列沒有插入動畫。最高段清單捲到頂再往下拉，面板跟著手指，放開照規則停段；找不到 UIScrollView 時的備案（拉過頭放開降一段）照舊。
- 從最高段直接到最低段（點搜尋框、VoiceOver 標題的「收起」）：收合時卡片列是最新的。
- 卡片列：手指捲停在某張 0.25 秒，那根圖釘跳一下、地圖移過去；降落、補換造成的資料換掉不會移地圖。關大卡在中段、最低段各試一次，卡片列都捲到那間。
- 右滑返回：中段、最低段時清單區域不擋右滑；最高段時會擋；從最高段進店家頁再右滑返回照常。
- 停在最高段，從清單進店家頁、按「去過」再返回，那一列馬上變「✓ 去過」。被蓋住的卡片列在約 1 秒後補換，而且不會在捲清單時補換。
- VoiceOver：橫條上下滑換段；標題那行的「展開附近清單」「收起」；最低段時卡片列不唸，中段時藏著的清單不唸。
- 搜尋：點搜尋框面板降到最低段，打字時「找到 N 間」即時更新；停打約 1 秒會補換一次（看不到）；收鍵盤回中段，卡片列是最新結果而且沒有淡入。
- 點拆不開的泡泡（只列這幾間）和 ✕ 回到附近：卡片列換內容的 snappy 動畫照舊。平移停下 1 秒內在最低段點時，淡出的是平移前的卡，見 visible (2)。
- 在最低段改篩選分類：標題即時更新，拉上來是新的結果。
- 抽一間三種模式（一間、轉盤、3 張卡）：跳圖釘、轉盤轉、3 張卡開著的時候都沒有補換記號；結束後約 1 秒才補換。
- 長按圖釘開選單時沒有補換記號。
- 進出行程模式：回到首頁時面板是最新的清單。
- 換看誰的收藏（群組）：圖釘重新落下、重新數數字，清單是那個群組的店。
- 平移到沒有店的地方（最低段）：標題是「這一帶沒有收藏」，拉上來中段高度正確（沒有空的卡片列）；再平移回有店的地方一切正常。點店、飛過去、框搜尋結果的鏡頭位置都跟 72ac06e 一樣（mp.midTop 沒變）。
- 照片：平移後 1 秒內拉上面板，前幾張卡片的照片第一幀就有，不是先出現色塊再淡入。
- 加 -liveHidden 整套跑一次，行為跟 72ac06e 完全一樣，Console 裡沒有任何「補換」「開始拉面板 補換卡片列」記號。

**風險**

1. 補換那一筆是新的長幀，推論 20–35ms，落在換清單後約 0.9–1.3 秒、畫面停下來的時候。perf-round1d 4.E 的「降落後補做」中位 33、最多 60，但那次連算清單、泡泡重組都搬過去；這次只搬看不到的列。用 sim (1)(2) 的判定把關，不過就不上。
2. visible (1)：換清單後、補換前就露出來時，重建落在露出來那一幀，也就是按下那一幀。從最低段拉面板那一幀多建 5 張卡（推論約 15ms），拉過一半那一幀多建 6 列（推論約 18ms）。可以用 -hiddenWait 600 量能不能縮小空窗；之後也可以跟 perf-round1d 第 6 節的「照第幾列認列」一起用，讓露出來那次重建變便宜。
3. 收合有 0.45 秒寬限，所以拖地圖讓面板降下那一幀（M10 的 45ms）的「卡片 1」不會省掉。那筆本來也不是看不到的清單造成的。要省得改拖地圖時更新 mp.top 的時機，會改「附近 N 間」更新的時間，要問 Anthony，不在這題。
4. 照片預載：看不到時換了清單，背景會先載前 6 張卡片（300px）和前 8 列（200px），PhotoLoader 會合併同一張正在載的。連續平移很多次時，會多載一些後來沒用到的照片；用行動網路時也一樣會載。現在藏著的列一建好也會載前幾列，推論量差不多。
5. `.animation(nil, value:)` 靠 SwiftUI 的交易語意關掉那一下的插入動畫。R1–R3 的錄影如果還看得到淡入，就改成 `.transaction(value: lagCards.swaps) { $0.animation = nil }`（另一行用 lagHigh.swaps）再試，推論效果相同。
6. 補換時 NearbySheet 會重算一次。選著店時 PickedCard 也會跟著重跑（它的閉包每次都不相等），所以降落後那次補換會多「大卡 1」。
7. HiddenRows 在 body 裡改（不觀察的 class），跟 PinState.arm、CardScroll 是同一種寫法；同樣的輸入結果一樣，不會造成重算迴圈。每次 body 多四次 [Place] 比較；同一份陣列直接判定相等，推論在 0.1ms 以下。
8. 手指時間有兩個漏洞：
 - TouchClock 裝在 key window，鍵盤在另一個 window，打字時的觸碰看不到，所以停打約 1 秒後的補換可能剛好撞上下一個字。72ac06e 每打一個字都會重建看不到的那兩塊，所以推論不會比現在差。
 - 系統取消手勢、卻沒送 touchesCancelled 時，fingerDown 可能一直是 true。hiddenBusy 只信它 5 秒，之後照常補換。
9. 等待條件是一條一條列出來的。之後新加的動畫如果沒有寫進 hiddenBusy，補換可能撞上它。
10. 降落那筆的好處可能只在 Console 上：飛完記號在鏡頭停下時打（:208-218），之後沒有泡泡換上，推論畫面多半是靜止的。看得出的好處主要在平移停下那筆，那一幀圖釘正開始飛進泡泡（:976-977）。sim (1)(d) 用錄影確認，看不出來就照實跟 Anthony 說。
11. 沒有跑過 swiftc，只在 scratch 副本套用過，確認 20 處原文在 72ac06e 各只出現一次、括號平衡。可能的編譯點：
 - `.task(id: near.places)` 需要 [Place] 是 Equatable（Place 是 Hashable）。
 - `compactMap(\.photoURL)` 用 key path。
 - HiddenRows 是 file-private class，放在 private @State（跟 CardScroll 一樣）。
 - catchUpHidden、hiddenBusy 是 View 的方法；iOS 18 SDK 的 View 是 @MainActor，所以讀 Perf.shared、pins、store、改 @State 都在主執行緒。
 - `max(_:_:_:)` 傳三個 CFTimeInterval。
 - `Flag.value(...).flatMap { Int($0) }`。
 - HiddenRows.take 的參數標籤 scene 和內部名稱 s，跟屬性 scene 不衝突。
12. 行程模式時面板整塊藏著，這次沒把它算成「看不到」，行程裡換清單照舊會重建，跟現在一樣。
13. 在最低段選店或點拆不開的泡泡時，卡片列那塊是用淡出移除或換掉的，SwiftUI 淡出時畫的是移除前最後一次的內容。所以在 1 秒的空窗裡，淡出的是舊卡，見 visible (2)；要完全一樣只能讓最低段的卡片列一直跟著最新的，那就省不到「卡片 5」。

**診斷（給想看細節的人）**

1. 降落那筆就是藏著的清單在重建。M9-M10 原始 Console 裡，不加的 5 次「飛完」那筆都是「重算 大卡 1・附近列 6・附近面板 1」，分別是 50/52/50/44/49ms（第 51、100、149、197、246 行），例如第 51 行「掉幀 50 ms（3142571.717 到 3142571.767）　重算 大卡 1・附近列 6・附近面板 1」。同一筆的「附近算 0.14–0.21 ms，66 間」表示算清單本身不到 1ms。-noHighPrebuild 5 次只有 p2 有一筆 33（第 344 行「重算 大卡 1・附近面板 1」），其他四次沒有掉幀行（Perf.swift:87 超過 1.5 幀才印）。NearRow 只用在最高段清單（72ac06e:MapTab.swift:1474 `NavigationLink(value: p) { NearRow(...`），所以「附近列 6」全部來自藏著的那份。成本（推論）：從「附近重算」到掉幀結束，不加的 n1 是 571.740 到 571.767，共 27ms（第 49、51 行）；-noHighPrebuild 的 p2 是 278.374 到 278.383，共 9ms（第 341、344 行）。所以 6 列約 18ms。

2. 看不到也重建的原因。:1336-1344 是 `if tall || highUsed { high ... .opacity(tall ? 1 : 0)`，:1393-1397 的 .task 在開 App 1.5 秒後設 `highUsed = true`，之後一直掛著。:1338 的 `.frame(height: max(0, highT - Self.grabH), alignment: .top)` 給了它真的高度，所以 :1471-1473 的 `ScrollView { LazyVStack(spacing: 10) { ForEach(near.places) { p in` 照樣把可視範圍裡約 6 列建出來，opacity 0 不影響版面。near 是 NearbyHost 傳進來的 let（:1173 `let n = Nearby(...)`、:1175 `content(n)`）。降落時 :269 `seenBox.set(c.region, publish: !trip.on)` 改了 shown，NearbyHost 重算。嘉義換台北時 id 全換，6 列 NearRow 全部拆掉重建；每列有 :1671 的 64pt PhotoView、兩行字、距離和 :1682 的 .candy(18)。

3. 平移（M9AB-M10平移 原始 Console）。
- 拖到一半（第 59–61 行）：「附近算 0.11 ms，38 間」，掉幀 45「重算 卡片 1・附近面板 2」。原因是拖地圖時 :195-196 會 `MapPanel.shared.go(.low)`；換段和面板上緣在同一幀變了（:1352-1356 onGeometryChange → report() 的 :1599 `mp.top = probe.top` → NearbyHost.visible 在 :1180 讀 MapPanel.shared.top）。這筆沒有附近列，那時卡片列正在收合、還看得到，所以不是看不到的清單造成的。這次照設計維持原樣。
- 停下（第 64–67 行）：「附近算 0.21 ms，50 間」加上地圖重算，掉幀 113「重算 卡片 5・圖釘 2・地圖 1・附近列 6・附近面板 1」。最低段的高度是 lowH 72（:1295），:1349 `.clipped()` 把下面裁掉。中段內容由 :1326 `.fixedSize(horizontal: false, vertical: true)` 照自然高度排，卡片列上緣在 23＋44＋10＝77pt（Draw.swift:216 DiceChip `.frame(minHeight: 44)`），整排被裁掉，LazyHStack（:1419）卻照水平可視範圍換上新的 5 張。:1439 的 `.accessibilityHidden(mp.stage == .low)` 也說明最低段的卡片列本來就當作看不到。
- 可省的量（推論）：地圖重算在 730.684，到掉幀結束 730.747 還有 63ms；看不到的兩塊約 30–35ms（6 列約 18ms，5 張卡推論約 15ms）。其餘是 :270 recluster 改了 MapTab 的 @State（:976-977）、圖釘和 MapKit，不在這題。

4. 哪一筆看得出來（推論）。「飛完」記號是在鏡頭停下的回呼裡打的（:208-218）。72ac06e 降落後沒有泡泡換上（泡泡在飛行中停下後就換好了：第 43 行在第 47 行之前，n2 第 92 行在第 96 行之前），飛完後只有「影片預載好」（第 53、102、345 行）。所以降落那 50ms 多半落在靜止的畫面上，好處可能只在 Console 上，要錄影確認。平移停下那筆的同一幀，recluster 開始讓圖釘飛進泡泡（:976-977 setMerge），0.44 秒後泡泡換上（第 68 行），卡頓會吃掉這段動畫的開頭，看得出的好處主要在這裡。另外，打字搜尋、改篩選時每次附近清單一換，72ac06e 都會重建這兩塊看不到的部分；這次改成等閒下來合併成一次補換（推論打字會輕一點）。

5. 做法比較，選 (b')。
- (a) Equatable 子 view：只有 Equatable 的邊界包住整個 ScrollView 加 LazyVStack／LazyHStack 時，lazy 才確定不變。如果放在 lazy stack 裡面當 ForEach 的外層，SwiftUI 會不會照樣按可視範圍展開，沒有文件保證；而且 .scrollTargetLayout() 要直接看到每一張卡才能 viewAligned 對齊，所以不能這樣放。邊界放在 ScrollView 外面的話，.scrollPosition(id: $scrolled)、.onScrollPhaseChange、.task(id: scrolled)、ListPullDown 的閉包、onScrollGeometryChange、.swipeBackBlocked 全部要搬進新的 struct，帶十幾個參數和 Binding。== 回 true 時舊的 struct 留著，舊閉包抓的是舊的 NearbySheet 副本。看不到時也要即時的輸入（tallPull、stage）只要漏寫一個，就會留下一小塊舊的 UI。沒有編譯器的情況下風險高，多省的只有藏著那塊的 view 描述不重跑，推論不到 1 幀（s1b 的 -noHighPrebuild 中位 90 對不加 92）。
- (b) @State 快照加 onChange：onChange 在 body 之後才跑，在裡面改 @State 會讓 NearbySheet 再跑一次，選著店時 PickedCard 也會跟著重跑。露出來那一下也要靠第二輪才換新，同一幀做不做得完沒有文件保證。
- (b')：在 body 裡直接算這一次要畫哪一批，記在不觀察的 HiddenRows（跟 CardScroll、PanelProbe 同樣放在 @State）。只有一輪 body，ForEach 還是 LazyVStack／LazyHStack 的直接子項，lazy、.scrollTargetLayout()、.scrollPosition、ListPullDown、swipeBackBlocked、accessibility 一行都不動，只換 ForEach 的資料。

6. 補換的時機。s2b 抽中時附近清單就換過一次（第 82-83 行 3142250.615「附近算 0.02 ms，10 間」），飛完在 1.35 秒後（第 96 行）。pins.camAt 只在 positionedByUser 時更新（:191），程式飛的時候不會變，所以另外記 camAny。平移停下 730.657，泡泡換上 731.098，彈簧 spring(0.35, 0.6)（:2350-2352）約 0.4 秒才停，所以另外記 clusterAt，補換要等泡泡換上後 0.5 秒。動畫和手勢只有一部分有「停了沒」的訊號：
- 抽一間跳圖釘：pins.drawWin（:565 設、:575 清）。
- 轉盤或 3 張卡：store.drawCover（Draw.swift:433 設，存在 Store.swift:83；轉盤用 Draw.swift:663 TimelineView 每幀算）。
- 長按選單：pins.menu（:1807）。
- 換段彈簧：mp.calmUntil（MapPanel.go、atLeastMid、settle 都設 +0.8 秒）。
- 卡片列：cards.finger、fingerAt（:1639-1640）。
- 整份清單：:1489 只有 listTouch（只算手指拉著），所以 PanelProbe 加 listMoving、listAt。
- 手指：Perf.touched（Perf.swift:48-50）在 guard on 之前就記 touchDown／touchUp，FoodMapApp.swift:67 一律裝 TouchClock，所以新增 fingerDown、touchedAt。
預估補換的時間點（推論）：
- 平移停下：補換卡片列在約 1.1 秒（等到泡泡換上後 0.5 秒），補換整份清單在約 1.2 秒。
- 降落：飛完後約 0.9 秒補換整份清單；選著店時卡片列一直是最新的，不用補。
- s1b：鏡頭移 0.55 秒，再等 0.4 秒，約 1.1 秒。

7. 露出來的路逐條核對（看得到的永遠是最新的）：
- 換段：stage 有被觀察，body 當場跑，shown 跟著新的 stage 算。從看得到變看不到時開 0.45 秒寬限，面板收合約 0.25 秒、中段淡出 0.18 秒都在裡面。從最高段直接到最低段（:820、:1508）是 scene 那條補上的。
- 從最低段開始拉：mp.dragging 不觀察，lift 只讓 LiftHeight 重畫（:1348），所以 drag() 第一次要用 freshCards 叫面板重算一次。
- 拉過一半：:1560 改 tallPull（@State），整份清單或卡片列（dragging）當場換。
- VoiceOver 的 adjustable（:1318-1323）和標題的「展開附近清單」都走 mp.go。
- 關大卡：選著店時卡片列不在畫面上，算看得到，一直跟著最新的，按 ✕ 重新建出來時是最新的，:1404-1407 捲到這間照舊。
- 「附近 N 間」：titleRow 和 title（:1611-1617）照舊讀即時的 near。
- counted 從 0 數上去：.task(id: dropKey) 沒動。
- highUsed 預建：還沒建時算看得到；1.5 秒那一刻從看得到變看不到，在寬限內，用最新的一批建。-noHighPrebuild（:1396）沒動。
- 動畫：只有純補換（附近清單這次沒變）才加 swaps、用 `.animation(nil, value:)` 關掉列的插入動畫。換段和換清單同一下時照舊帶著那次的交易。
- 剩下的例外寫在 visible (2)：卡片列那塊被 if/else 用淡出移除時（選店），SwiftUI 畫的是移除前最後一次的內容。

8. 反方的事實逐條核對過：數字、行號和兩份原始 Console 一致；Place 是 Codable、Identifiable、Hashable（Models.swift:4），photoURL 是 URL?（:32）；PhotoLoader 是 actor，會合併正在載的同一張（Photo.swift:65-68），PhotoView 的 init 先讀記憶體快取；Flag.on 沒綁 actor（Perf.swift:200-207）；MapPanel 的 dragging、calmUntil 是 @ObservationIgnored。

## T6 推店家頁、返回時整個 App 和地圖跟著重算（M11）

**摘要**

推店家頁、返回時 Root 會重算，因為 Root 讀了 store.barHidden（Store.swift:80）。barHidden 在地圖分頁看 mapPath，在收藏分頁看 DepthReport 寫的 depth。Root 一重算，MapTab、ListTab 就被當成新值整頁重算，fccc58f 的 -printChanges 已經印出 MapTab: @self、ListTab: @self。大卡那條路還多兩個原因：MapTab 自己在 body 裡建 $store.mapPath；UIKit 推頁的視差把地圖的 global x 推到 -121，mapRect 變了，MapTab、附近面板、大卡又算一次。

修法有三項：
- 分頁列抽成 TabChrome、訊息條抽成 ToastLayer，Root 不再讀 barHidden。
- mapPath 只在 MapNav 讀。
- mapRect 不記 x。

四個分頁另外包一層只比 index 的 TabRoot。它只在換分頁這類 Root 重算時有作用，另外用 M11e 判。原修法的「店家頁照 place 比 Equatable」被 Console 推翻，這輪拿掉。

預期推頁那筆只剩店家頁、分頁列、地圖導覽，大卡 0–2 次。省下的時間都是推論：大卡熱的推頁約省 20–28ms（1–2 幀）；收藏卡推頁、兩條路的返回各約省 1 幀（10–20ms）。

**看得出的差別**

無。這幾項都只是讓不用變的東西不要重算。分頁列、訊息條、教學、剪貼簿膠囊的位置和動畫時機都照舊，推頁、返回的畫面也一樣。分頁列在按下那一個 update 就開始滑，跟以前同一刻。唯一的不同在量測浮層：推頁時 PerfHUD 的「地圖 x,y」不再出現 -121。這些不用問 Anthony。

**對照開關**

每個修法都有對照開關，加了就恢復成 72ac06e 的行為：
- -rootBar：Root 照原本的式子讀 barHidden、menuCover、drawCover，以及訊息條位置用到的值。推店家頁、返回、進出行程、長按選單、抽卡時，Root 會跟以前一樣重算。對應 TabChrome、ToastLayer 和刪掉 covered 這幾項。
- -rootTabs：四個分頁照舊在 Root 的 body 裡直接建，Root 一重算，MapTab、收藏頁就整頁重算。這個開關只在 Root 重算時有差（換分頁、訊息條出現或消失、教學、剪貼簿膠囊、問通知、登入流程）。推店家頁、返回時 Root 已經不重算，所以 M11 要跟 -rootBar 一起加才看得到差別。對應 TabRoot。
- -mapRectX：mapRect 照舊記整個 global frame，推頁視差讓 x 變了，MapTab、附近面板、大卡就會重算。
- -mapPathRead：MapTab 的 body 照 72ac06e 建 $store.mapPath，再建一個不放進畫面的 NavigationStack(path:)，MapTab 照舊跟著 mapPath 重算。對應 MapNav。

M11 要完全回到舊行為，四個一起加：-rootBar -rootTabs -mapRectX -mapPathRead。原修法的 -detailAlways 跟著 5a 一起拿掉了。

找重算原因用現有的 -printChanges（fccc58f，只印、不改行為），不另開 -why。新加的計數「分頁列」「地圖導覽」，和記號「分頁列重算」「地圖導覽重算」「收藏重算」「小地圖出現／消失」，不管加不加參數都會出現。

**移植到 347906f**

- 原規格的改動 1、2（-printChanges 那幾行）分支上已經有，跳過，所以從 T6-3 開始。
- 三位反方核對 347906f（R5-1 的 toastSheets 動畫、R3-1b 的配對輪詢讀 store.tab、57bb766 的 .transaction(value: front)、T1、T2、T3、T4）：回歸 1–12 條逐條對過，沒找到會被弄壞的；編譯面也沒找到問題。
- 只改一處：T6-12 那行註解原本寫 72ac06e 的行號，改成描述內容。

### 改動

#### T6-3　FoodMapApp.swift（347906f 第 36 行起）

**位置**：:35（Root.body）`        let _ = Perf.shared.note("App 重算")` 之後、:36 `        Group {` 之前。分支頭是 :36 之後；fccc58f 那行 printChanges 在 count 和 note 中間，不動。

**原文**：
```swift
        let _ = Perf.shared.note("App 重算")
```

**改成**：
```swift
        let _ = Perf.shared.note("App 重算")
        // 量測用 -rootBar：照舊讓 Root 讀分頁列藏不藏、訊息條位置那些值（推店家頁、返回、進出行程、長按選單時 Root 跟著重算）
        let _ = Flag.on("-rootBar") ? oldReads() : ()
```

**理由**：-rootBar 是「Root 不讀 barHidden」這一項的對照開關，對應下面 TabChrome、ToastLayer 和刪掉 covered 那幾項。原修法這裡的 -why 那行刪掉，改用現有的 -printChanges。

#### T6-4　FoodMapApp.swift（347906f 第 51 行起）

**位置**：:50 `        .overlay(alignment: .bottom) { toastLayer }`（上一行 :49 是註解「// 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失」）

**原文**：
```swift
        .overlay(alignment: .bottom) { toastLayer }
```

**改成**：
```swift
        .overlay(alignment: .bottom) { ToastLayer(ns: toastNS) }
```

**理由**：訊息條算位置時要讀 mapPath、barHidden、bottomBar，這幾個值推頁、返回時都會變。搬到自己的 view 以後，訊息條開著時推頁也不會讓 Root 重算。

#### T6-5　FoodMapApp.swift（347906f 第 90 行起）

**位置**：:89–:108（toastLayer 整段）

**原文**：
```swift
    // 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失（sheet 開著時畫在 sheet 裡，這裡先藏起來）
    @ViewBuilder private var toastLayer: some View {
        if let t = store.toast, store.toastSheets == 0 {
            // 地圖首頁（不在行程、沒點進店家頁）：貼著下面那塊的上緣，右邊讓開行程、定位兩顆；其他分頁照舊
            // 面板拉到最高段時上緣在篩選籤附近：改放分頁列上方，不壓到籤
            let onMap = store.tab == 0 && store.mapPath.isEmpty && store.panelTop > 0 && !TripMode.shared.on && MapPanel.shared.stage != .high
            // 行程模式（還沒出發）：貼著行程面板的上緣，不蓋住站卡。面板拉到最高時放進面板最上面那條（把手、起點那排），
            // 不浮在清單中間：蓋在站卡右邊時，想點垃圾桶、交通方式會按到訊息條上的「復原」
            let onTrip = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.on && !TripMode.shared.going && TripMode.shared.panelH > 0
            let tripPad: CGFloat = TripMode.shared.panelH <= 420 ? TripMode.shared.panelH + 8 : TripMode.shared.panelH - 56
            // 出發中：貼著下面的評分卡上緣（沒有評分卡時貼底），不被它蓋住
            let onGo = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.going
            let goPad: CGFloat = max(24, TripMode.shared.goInset + 8)
            // 店家頁（分頁列藏著）：貼著底部按鈕列；分頁列有顯示時一律 96（bottomBar 留著舊值也不會用錯）
            let barPad: CGFloat = (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
            let pad: CGFloat = onMap ? store.panelTop + 8 : onTrip ? tripPad : onGo ? goPad : barPad
            ToastBar(text: t, bottom: pad, trailing: onMap ? 52 : 0, ns: toastNS)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
```

**改成**：
```swift
    // 量測用 -rootBar：拆出去之前 Root 讀的那些值（分頁列藏不藏搬到 TabChrome，訊息條位置搬到 ToastLayer）。
    // 照原本的式子（含短路）讀一遍、結果丟掉：讀了 Root 就跟以前一樣在推店家頁、返回、進出行程、長按選單時重算。不加參數不會呼叫
    private func oldReads() {
        _ = !store.barHidden && !store.menuCover && !store.drawCover
        _ = store.menuCover || store.drawCover
        guard store.toast != nil, store.toastSheets == 0 else { return }
        let onMap = store.tab == 0 && store.mapPath.isEmpty && store.panelTop > 0 && !TripMode.shared.on && MapPanel.shared.stage != .high
        let onTrip = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.on && !TripMode.shared.going && TripMode.shared.panelH > 0
        let tripPad: CGFloat = TripMode.shared.panelH <= 420 ? TripMode.shared.panelH + 8 : TripMode.shared.panelH - 56
        let onGo = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.going
        let goPad: CGFloat = max(24, TripMode.shared.goInset + 8)
        let barPad: CGFloat = (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
        let _: CGFloat = onMap ? store.panelTop + 8 : onTrip ? tripPad : onGo ? goPad : barPad
    }
```

**理由**：toastLayer 的內容原封搬到下面的 ToastLayer。這裡只留給 -rootBar 用的 oldReads()：照 :145、:149、:150 和 :91–:104 原本的式子讀，加了參數時 Root 讀的值跟 72ac06e 一樣。原修法把訊息條那段改成無條件讀，會比以前多讀幾個值，這版改掉了。

#### T6-6　FoodMapApp.swift（347906f 第 135 行起）

**位置**：:133 `    private var covered: Bool { store.menuCover || store.drawCover }`（:132 是註解「// 登入後的畫面拆成三段…」，:134 是 authFree）

**原文**：
```swift
    private var covered: Bool { store.menuCover || store.drawCover }
```

**改成**：
（整段刪掉，什麼都不放）

**理由**：covered 只給 :150 的動畫用。那個動畫搬進 TabChrome 以後，在 TabChrome 裡自己算。

#### T6-7　FoodMapApp.swift（347906f 第 138 行起）

**位置**：:136–:150（tabs 的開頭，到 `.animation(.spring(response: 0.3, dampingFraction: 0.85), value: covered)`）

**原文**：
```swift
    // 四個分頁和分頁列
    private var tabs: some View {
        ZStack {
            page(0) { MapTab() }
            page(1) { ListTab() }
            page(2) { GroupsTab() }
            page(3) { MeTab() }
        }
        .overlay(alignment: .bottom) {
            if !store.barHidden && !store.menuCover && !store.drawCover {
                TabBar().transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: store.barHidden)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: covered)
```

**改成**：
```swift
    // 四個分頁和分頁列。分頁列藏不藏（推店家頁、返回、進出行程會變）只有 TabChrome 讀，Root 本身不用跟著重算
    private var tabs: some View {
        TabChrome {
            ZStack {
                page(0) { MapTab() }
                page(1) { ListTab() }
                page(2) { GroupsTab() }
                page(3) { MeTab() }
            }
        }
```

**理由**：Root 在推頁、返回時重算，根源就是它讀了 barHidden。分頁列的 overlay 和兩個 .animation 搬進 TabChrome 以後，順序和包住的範圍都跟原本一樣，兩個動畫照舊包住整個分頁區。:151–:168 的註解、.tripChooser()、.onChange、.task 都不動，直接接在 TabChrome { … } 後面。

#### T6-8　FoodMapApp.swift（347906f 第 226 行起）

**位置**：:224–:227（page 的開頭，到 `            v().environment(\.tabActive, store.tab == i)`）

**原文**：
```swift
    // 四個分頁疊在一起，只顯示目前這個（切換不重建，捲到哪、地圖看到哪都留著）
    @ViewBuilder private func page<V: View>(_ i: Int, @ViewBuilder _ v: () -> V) -> some View {
        if opened.contains(i) || store.tab == i {
            v().environment(\.tabActive, store.tab == i)
```

**改成**：
```swift
    // 四個分頁疊在一起，只顯示目前這個（切換不重建，捲到哪、地圖看到哪都留著）。
    // 分頁本身包在 TabRoot 裡（tabRoot）：Root 重算（換分頁、訊息條、教學…）時分頁不跟著整頁重算，外面這幾個看 store.tab 的修飾照舊跟著換
    @ViewBuilder private func page<V: View>(_ i: Int, @ViewBuilder _ v: @escaping @MainActor () -> V) -> some View {
        if opened.contains(i) || store.tab == i {
            tabRoot(i, v).environment(\.tabActive, store.tab == i)
```

**理由**：Root 重算時（換分頁、訊息條出現或消失、教學、剪貼簿膠囊）不再重建分頁。看 store.tab 的那幾個修飾（:228–:233 的 opacity、offset、animation、allowsHitTesting、accessibilityHidden）照舊留在外面，:228–:235 都不動。

#### T6-9　FoodMapApp.swift（347906f 第 238 行起）

**位置**：:235 page 的右括號 `    }`（前兩行是 `                .accessibilityHidden(store.tab != i)` 和 `        }`）之後、:237 `    private func openSaved() {` 之前

**原文**：
```swift

    private func openSaved() {
```

**改成**：
```swift

    // 量測用 -rootTabs：照舊在 Root 的 body 裡直接建分頁（Root 每次重算，MapTab、收藏頁都跟著整頁重算）。
    // 只在 Root 重算時有差（換分頁、訊息條出現或消失、教學、剪貼簿膠囊…）；推店家頁、返回時 Root 已經不重算，M11 要跟 -rootBar 一起加
    @ViewBuilder private func tabRoot<V: View>(_ i: Int, _ v: @escaping @MainActor () -> V) -> some View {
        if Flag.on("-rootTabs") { v() } else { TabRoot(i: i, make: v).equatable() }
    }

    private func openSaved() {
```

**理由**：這是 TabRoot 的對照開關。加了 -rootTabs，就跟 72ac06e 一樣在 Root 的 body 裡建分頁。

#### T6-10　FoodMapApp.swift（347906f 第 242 行起）

**位置**：:242 Root 的右括號 `}`（前兩行是 openSaved 的 `        store.listTop &+= 1` 和 `    }`）之後、:244 註解「// 分頁按鈕：按下圖示縮到 0.85 並輕震；放開（按到了）由上面的 keyframe 彈到 1.15 再回 1」之前

**原文**：
```swift
        store.listTop &+= 1
    }
}
```

**改成**：
```swift
        store.listTop &+= 1
    }
}

// 一個分頁的根（MapTab()、ListTab()、GroupsTab()、MeTab()）：Root 重算（換分頁、訊息條出現或消失、教學、剪貼簿膠囊…）時不要把整個分頁也跟著重算。
// -printChanges 量到 Root 每重算一次，MapTab、ListTab 就印「@self changed.」整頁重算；推論是 @State 的初始值
// （PinState()、SeenBox()、PullState()…）每建一次就多 new 一份，SwiftUI 比對新舊時當成不一樣（GroupsTab 的 @State 都是值，就沒跟著算）。
// 分頁沒有從 Root 拿任何參數；它要的東西（store、自己的 @State、環境）變了，SwiftUI 會自己叫它重算，tabActive 這種環境值也照樣傳得進去。
// 這層只比 i：分頁在這層第一次出現時才建，之後 Root 重算不會再建。以後要從 Root 傳參數給分頁，要一起放進 == 比，不然改了不會生效
private struct TabRoot<V: View>: View, Equatable {
    let i: Int
    let make: @MainActor () -> V
    nonisolated static func == (a: Self, b: Self) -> Bool { a.i == b.i }
    var body: some View { make() }
}

// 分頁列：只有這一層讀 barHidden（推店家頁、返回、進出行程會變）、menuCover、drawCover。
// 以前在 Root 的 body 裡讀，推頁、返回時整個 Root 跟著重算（Root 一重算，MapTab、收藏頁也整頁重算）。
// content 是 Root 建好的四個分頁：這層因為分頁列重算時原封不動交回去，分頁不會跟著重算。
// 兩個 .animation 照舊包住整個分頁區（分頁列藏起來、出現那一刻，分頁裡同時發生的變化也照舊帶同一個動畫）。
// -printChanges 不加在這裡：泛型的型別名會把四個分頁的整串型別印成一行，太長；看「分頁列重算」記號就好
private struct TabChrome<Content: View>: View {
    @Environment(Store.self) private var store
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        let _ = Perf.shared.count("分頁列")
        let _ = Perf.shared.note("分頁列重算")
        let covered = store.menuCover || store.drawCover
        content
            .overlay(alignment: .bottom) {
                if !store.barHidden && !covered {
                    TabBar().transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.snappy, value: store.barHidden)
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: covered)
    }
}

// 存檔失敗之類的訊息，從下面浮出來，幾秒後自己消失（sheet 開著時畫在 sheet 裡，這裡先藏起來）。
// 位置要看 mapPath、面板上緣、分頁列藏了沒、店家頁按鈕列多高，推店家頁、返回時會變：只有這一層讀，Root 不用跟著重算。
// 內容是 Root 原本的 toastLayer 原封搬過來，只把 toastNS 改成傳進來的 ns
private struct ToastLayer: View {
    let ns: Namespace.ID
    @Environment(Store.self) private var store
    var body: some View {
        if let t = store.toast, store.toastSheets == 0 {
            // 地圖首頁（不在行程、沒點進店家頁）：貼著下面那塊的上緣，右邊讓開行程、定位兩顆；其他分頁照舊
            // 面板拉到最高段時上緣在篩選籤附近：改放分頁列上方，不壓到籤
            let onMap = store.tab == 0 && store.mapPath.isEmpty && store.panelTop > 0 && !TripMode.shared.on && MapPanel.shared.stage != .high
            // 行程模式（還沒出發）：貼著行程面板的上緣，不蓋住站卡。面板拉到最高時放進面板最上面那條（把手、起點那排），
            // 不浮在清單中間：蓋在站卡右邊時，想點垃圾桶、交通方式會按到訊息條上的「復原」
            let onTrip = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.on && !TripMode.shared.going && TripMode.shared.panelH > 0
            let tripPad: CGFloat = TripMode.shared.panelH <= 420 ? TripMode.shared.panelH + 8 : TripMode.shared.panelH - 56
            // 出發中：貼著下面的評分卡上緣（沒有評分卡時貼底），不被它蓋住
            let onGo = store.tab == 0 && store.mapPath.isEmpty && TripMode.shared.going
            let goPad: CGFloat = max(24, TripMode.shared.goInset + 8)
            // 店家頁（分頁列藏著）：貼著底部按鈕列；分頁列有顯示時一律 96（bottomBar 留著舊值也不會用錯）
            let barPad: CGFloat = (store.barHidden && store.bottomBar > 0) ? store.bottomBar + 8 : 96
            let pad: CGFloat = onMap ? store.panelTop + 8 : onTrip ? tripPad : onGo ? goPad : barPad
            ToastBar(text: t, bottom: pad, trailing: onMap ? 52 : 0, ns: ns)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
```

**理由**：新增三個小 view：
- TabRoot：只比 index 的 Equatable 殼，讓 Root 重算時四個分頁不跟著重算，只在換分頁這類情況有作用，用 M11e 判。
- TabChrome：唯一讀 barHidden、menuCover、drawCover 的一層，多了「分頁列」計數和「分頁列重算」記號。
- ToastLayer：:90–:107 原封搬過來，只把 toastNS 改成傳進來的 ns；ToastBar 的 ns 是 Namespace.ID?，傳 Namespace.ID 會自動轉成 Optional。

#### T6-11　MapTab.swift（347906f 第 61 行起）

**位置**：:61 `    private var points: [Place] { store.shown(applied, in: store.mapBase).filter { $0.lat != nil && $0.lng != nil } }` 之後、:63 `    var body: some View {` 之前（分支頭同樣是 :61、:63）

**原文**：
```swift
    private var points: [Place] { store.shown(applied, in: store.mapBase).filter { $0.lat != nil && $0.lng != nil } }
```

**改成**：
```swift
    private var points: [Place] { store.shown(applied, in: store.mapBase).filter { $0.lat != nil && $0.lng != nil } }

    // 量測用 -mapPathRead：照 72ac06e 在 MapTab 的 body 裡建 $store.mapPath，也建一個 NavigationStack(path:)（只建、不放進畫面）。
    // 不確定以前是建 Binding 還是建 NavigationStack 時讀了 mapPath，兩個都照做，MapTab 就照舊跟著推頁、返回重算。不加參數不會呼叫
    private func oldPathRead() {
        @Bindable var store = store
        _ = NavigationStack(path: $store.mapPath) { EmptyView() }
    }
```

**理由**：這是 MapNav 的對照開關，照反方二的意見改過，能真的恢復舊行為：72ac06e 的 Binding 和 NavigationStack 都在 MapTab.body 裡建，兩個都可能讀 mapPath，這裡兩個都照做。只建 Binding 的話，萬一以前是 NavigationStack 讀的，-mapPathRead 就恢復不了，M11d 會錯把需要的 MapNav 拿掉。

#### T6-12　MapTab.swift（347906f 第 87 行起）

**位置**：:85 `        NavigationStack(path: $store.mapPath) {`（上一行是 :84 `        let total = all.count`，下一行是 :86 `          ZStack {`；分支頭在 :86）

**原文**：
```swift
        NavigationStack(path: $store.mapPath) {
```

**改成**：
```swift
        // 量測用 -mapPathRead：照 72ac06e 讓 MapTab 自己讀 mapPath（推店家頁、返回時整個 MapTab 跟著重算）
        let _ = Flag.on("-mapPathRead") ? oldPathRead() : ()
        // 推店家頁、返回：只有 MapNav 這一小層讀 mapPath，MapTab 本身（篩選、整張地圖的圖釘、面板）不跟著重算。
        // 下面整個 ZStack（連同 toolbarVisibility、navigationDestination、tripDestinations）是 MapNav 的內容；sheet、confirmationDialog 掛在 MapNav 外面，位置跟以前掛在 NavigationStack 上一樣
        MapNav {
```

**理由**：這是 perf-round1d 第 6 節的 MapNav。:86–:461（ZStack，和掛在它上面的 :459–:461 toolbarVisibility、navigationDestination、tripDestinations）原封不動變成 MapNav 的內容，仍在 NavigationStack 裡面。:462 的右括號、:463 起的 sheet 和 confirmationDialog 都不動，改成掛在 MapNav 上，在畫面樹裡的位置一樣。

#### T6-13　MapTab.swift（347906f 第 334 行起）

**位置**：:316–:320 `            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in` 那一段（上一行 :315 是註解「// 量在 ignoresSafeArea 裡面才是地圖真正鋪開的範圍…」，下一行 :321 是 `            .ignoresSafeArea()`；分支頭在 :324–:328）

**原文**：
```swift
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
                mapRect = r; trip.mapBottom = footY > 0 ? footY : r.maxY
                Perf.shared.note("地圖範圍變了 x=\(Int(r.minX)) y=\(Int(r.minY)) w=\(Int(r.width)) h=\(Int(r.height))")
                showGeo(r, footY)
            }
```

**改成**：
```swift
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
                Perf.shared.note("地圖範圍變了 x=\(Int(r.minX)) y=\(Int(r.minY)) w=\(Int(r.width)) h=\(Int(r.height))")
                // 推店家頁時 UIKit 把底下這頁往左推 0.3 個畫面（視差，x 變 -121），推完離開畫面又回 0；上下範圍都沒變。
                // mapRect 只拿來算地圖的上下邊距（MapReader 裡那兩行 safeAreaPadding）、「附近」看得到的那塊（NearbyHost.visible 只看 minY、高度）
                // 和 trip.mapBottom（maxY），x 不記：推頁、返回時 MapTab、附近面板、大卡不用重算。量測用 -mapRectX：照舊整個 frame 都記
                let v = Flag.on("-mapRectX") ? r : CGRect(x: 0, y: r.minY, width: r.width, height: r.height)
                guard v != mapRect else { return }
                mapRect = v; trip.mapBottom = footY > 0 ? footY : v.maxY
                showGeo(v, footY)
            }
```

**理由**：推頁的視差只改 x，而 x 沒有地方用，所以不記 x。這樣推頁那一刻（第 14 行 .810）和推完那一下（第 25 行 .314）的地圖重算、附近重算，以及附近面板、大卡各 1 次都會消失。「地圖範圍變了」量測行照印，看得到 x=-121 之後不再接地圖重算。加了 -mapRectX 時，onGeometryChange 只在 r 變了才呼叫，guard 永遠擋不到，跟 72ac06e 一樣。

#### T6-14　MapTab.swift（347906f 第 1261 行起）

**位置**：:1131 的註解 `// MapTab 每次被重新建構（Root 重算）時不要再 new 一個 CLLocationManager：整個 App 共用一個` 的前面（:1129 是 MapTab 的右括號、:1130 空行；分支頭中間多了 MapSearchBar，這行註解在 :1171，一樣放在它前面）

**原文**：
```swift
// MapTab 每次被重新建構（Root 重算）時不要再 new 一個 CLLocationManager
```

**改成**：
```swift
// 地圖分頁的 NavigationStack：只有這一小層建 $store.mapPath。用 @Bindable 建 Binding 時會讀一次 mapPath，讀的那一層就記下依賴
// （08292cf 拆搜尋框時量到的同一件事）；以前建在 MapTab 的 body 裡，推店家頁、返回時整個 MapTab 跟著重算。
// content 是 MapTab 建好的地圖頁：這層因為 mapPath 重算時原封不動交回去，裡面的地圖、面板不會跟著重算。想法跟 ListTab 的 DepthReport 一樣。
// -printChanges 不加在這裡：泛型的型別名會把整個地圖頁的型別印成一行，太長；看「地圖導覽重算」記號就好
private struct MapNav<Content: View>: View {
    @Environment(Store.self) private var store
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        let _ = Perf.shared.count("地圖導覽")
        let _ = Perf.shared.note("地圖導覽重算")
        @Bindable var store = store
        NavigationStack(path: $store.mapPath) { content }
    }
}

// MapTab 每次被重新建構（Root 重算）時不要再 new 一個 CLLocationManager
```

**理由**：只有這一小層依賴 mapPath。多了「地圖導覽」計數和「地圖導覽重算」記號，量的時候看得到它重算了幾次。跟原修法的差別是不收 path 參數：對照開關改由 MapTab 的 oldPathRead() 讀。

#### T6-15　MapTab.swift（347906f 第 1432 行起）

**位置**：:1302（NearbySheet.body）`        let _ = Perf.shared.count("附近面板")` 之後、:1303 註解「// 選到的那間（點圖釘或抽中）：下面換成那間的大卡片」之前（分支頭是 :1342 之後）

**原文**：
```swift
        let _ = Perf.shared.count("附近面板")
```

**改成**：
```swift
        let _ = Perf.shared.count("附近面板")
        let _ = Flag.printChanges ? Self._printChanges() : ()   // 量測用 -printChanges：Console 印這次重算是哪個狀態變了
```

**理由**：用來證實附近面板是被 mapRect 帶著重建的（會印 NearbySheet: @self changed.），也用來確認改完以後推頁時不再出現這一行。原修法的 -why 改成現有的 -printChanges。

#### T6-16　MapTab.swift（347906f 第 1839 行起）

**位置**：:1709（PickedCard.body）`        let _ = Perf.shared.count("大卡")` 之後、:1710 `        VStack(alignment: .leading, spacing: 8) {` 之前（分支頭是 :1749 之後）

**原文**：
```swift
        let _ = Perf.shared.count("大卡")
```

**改成**：
```swift
        let _ = Perf.shared.count("大卡")
        let _ = Flag.printChanges ? Self._printChanges() : ()   // 量測用 -printChanges：Console 印這次重算是哪個狀態變了
```

**理由**：用來找出大卡在返回時那兩次、推頁時另一次的原因（推論是 _openURL），下一輪照結果拆「導航」鈕。

#### T6-17　ListTab.swift（347906f 第 19 行起）

**位置**：:18 `        let _ = Perf.shared.count("收藏")` 的下一行，原本 :19 `        @Bindable var store = store` 之前。分支頭沒有 :19 那行，改放在 :19 count 和 :20 `let _ = Flag.printChanges ? …` 之後。

**原文**：
```swift
        let _ = Perf.shared.count("收藏")
        let _ = Flag.printChanges ? Self._printChanges() : ()   // 量測用 -printChanges：Console 印這次重算是哪個狀態變了
```

**改成**：
```swift
        let _ = Perf.shared.count("收藏")
        let _ = Flag.printChanges ? Self._printChanges() : ()   // 量測用 -printChanges：Console 印這次重算是哪個狀態變了
        let _ = Perf.shared.note("收藏重算")   // 量測：有時間戳，推頁、返回、換分頁時對得上時間
```

**理由**：反方二要求的時間錨點。收藏頁原本只有計數、沒有時間，分不出它落在哪個時間點；有了這個記號，就能跟「App 重算」「分頁列重算」「店家頁重算」對時間。

#### T6-18　PlaceDetail.swift（347906f 第 436 行起）

**位置**：:435（MiniMap）`            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }` 之後、:436 `            .task(id: key) {` 之前（分支頭是 :436、:437）

**原文**：
```swift
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
```

**改成**：
```swift
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            // 量測：小地圖掛上、拆掉的時候（熱的推頁印兩次「小地圖用快取」，看是不是拆掉再掛上）
            .onAppear { Perf.shared.note("小地圖出現 \(key)") }
            .onDisappear { Perf.shared.note("小地圖消失") }
```

**理由**：只加量測行。用來證實修正後的推論：熱的兩次「用快取」是同一個 key，原因是 MiniMap 被拆掉再掛上，或建了兩份，不是寬度量了兩次。

#### T6-19　PlaceDetail.swift（347906f 第 439 行起）

**位置**：:438（MiniMap 的 .task）`                if let c = Self.cache.object(forKey: key as NSString) { Perf.shared.note("小地圖用快取");`（分支頭是 :439）

**原文**：
```swift
                if let c = Self.cache.object(forKey: key as NSString) { Perf.shared.note("小地圖用快取"); withAnimation(.easeOut(duration: 0.2)) { img = c }; return }
```

**改成**：
```swift
                if let c = Self.cache.object(forKey: key as NSString) { Perf.shared.note("小地圖用快取 \(key)"); withAnimation(.easeOut(duration: 0.2)) { img = c }; return }
```

**理由**：只讓量測行多印 key，確認熱的兩行是同一個 key。

#### T6-20　PlaceDetail.swift（347906f 第 445 行起）

**位置**：:444 `                Perf.shared.note("小地圖開始截圖")`（下一行 :445 是 `                let o = MKMapSnapshotter.Options()`；分支頭是 :445）

**原文**：
```swift
                Perf.shared.note("小地圖開始截圖")
```

**改成**：
```swift
                Perf.shared.note("小地圖開始截圖 \(key)")
```

**理由**：同上：對照冷的那次截圖用的 key，和熱的命中快取時的 key。

**模擬器**

整輪加 `-noPinPair`（不然嘉義那兩根合成「2」，點不到松山）。

共同條件：Release 模擬器 60Hz、-perfOverlay，照 M11 的做法：松山土窯羊肉、Wi-Fi，每次 terminate 再 launch，先不計地遠飛一次，等「清單掛上 首頁」後 2.5 秒再動手。報的時候每一筆都附原始 Console。

一、先找原因（M11c-why，每組 1 次 launch，不看時間）
分兩組：(甲) -printChanges；(乙) -printChanges -rootBar -rootTabs -mapRectX -mapPathRead。
每組的步驟：地圖點松山，按大卡「店家頁」，等 2 秒，返回；等 2 秒再進一次，再返回。接著切到收藏，點同一間的卡，返回；再進一次，再返回。
要報的：下面這些記號前後緊接的 _printChanges 行，和那幾筆掉幀行：「App 重算」「地圖重算」「地圖導覽重算」「分頁列重算」「收藏重算」「店家頁重算」「地圖範圍變了」「進店家頁」「返回」「小地圖出現／消失／用快取」。_printChanges 的格式像「Root: \Store.<computed 0x… (Int)> changed.」「MapTab: @self changed.」「PlaceDetail: _dismiss changed.」。分頁列（TabChrome）、地圖導覽（MapNav）沒有 printChanges，只看記號。
(乙) 的預期：
- 「App 重算」前有一行 Root。格式照 R4-1 第 70、180 行推：大卡那條路是「\Store.<computed … (NavigationPath)>」，收藏卡那條路是「(Array<Int>)」。
- 接著是「MapTab: @self changed.」。大卡那條路如果印成「@self, \Store.<computed … (NavigationPath)> changed.」，就證實 MapTab 以前也跟著 mapPath 重算。
- 還有一行「ListTab: @self changed.」。
- 「地圖範圍變了 x=-121」之後有「MapTab: _mapRect changed.」「NearbySheet: @self changed.」「PickedCard: @self changed.」。
(甲) 的預期：推頁、返回時沒有 Root、MapTab、ListTab、NearbySheet 的行；「地圖範圍變了 x=-121」和推完的「x=0」後面不接「地圖重算」；每次推頁、返回各有一次「分頁列重算」，大卡那條路另有一次「地圖導覽重算」。PlaceDetail、PickedCard 還剩的行，照第四段決定下一步。

二、主量測（M11c）
不開 -printChanges（印字會拖慢）。「不加」跟「全舊」（-rootBar -rootTabs -mapRectX -mapPathRead）交錯跑：不加、全舊、不加、全舊…。大卡、收藏卡兩條路，每組每條路 5 次 launch。
每次 launch：冷的進，等 2 秒，返回；再做 3 次「等 2 秒，熱的進，等 2 秒，返回」。這樣每組每條路有冷的 5 筆、熱的 15 筆、返回 20 筆。
要報的：
- 推頁：那一筆的「進店家頁 N ms」；放開到之後 600ms 內的每一行掉幀（含重算次數）和記號；「影片 start」「影片開始播」有沒有落在推頁那筆掉幀裡（時間不晚於那筆的結尾就算）；大卡那條路「地圖範圍變了 x=0」前後 50ms 內的行和掉幀。
- 返回：含「返回」記號的那筆掉幀，加上之後 300ms 內的掉幀，報合計 ms。「返回 0 ms」那一行在工作開始前就印了，不用報。
- 收藏卡那條路：從「分頁列重算」（不加）或「App 重算」（全舊）到下一次「店家頁重算」或那筆掉幀結束，差幾 ms。
預期計數（不加）：
- 大卡進：店家頁約 4、分頁列 1、地圖導覽 1，大卡 0–2。沒有 App、地圖、收藏、附近面板，也沒有「地圖重算」「附近重算」「附近算」記號。「地圖範圍變了 x=-121」和推完的「x=0」照印，但後面不接地圖重算。
- 大卡返回：店家頁 0–1、分頁列 1、地圖導覽 1，大卡 0–2。
- 收藏卡進：店家頁約 4、分頁列 1，沒有收藏、App、地圖。「分頁列重算」出現在「進店家頁」之後，就是以前「App 重算」的位置。
- 收藏卡返回：店家頁 0–1、分頁列 1。
預期計數（全舊）：只比 M11 原有的六個名字，要跟 M11 一樣。
- 大卡進：App 1・地圖 2・大卡 2・店家頁 4・收藏 1・附近面板 1。
- 大卡返回：App 1・地圖 1・大卡 2・店家頁 1・收藏 1。
- 收藏卡進：App 1・地圖 1・店家頁 4・收藏 1。
- 收藏卡返回：App 1・地圖 1・店家頁 1・收藏 1。
不一樣就表示開關沒接好，先報給我。新計數「分頁列」1–2、「地圖導覽」等於地圖的次數（推論：大卡進 2、返回 1，收藏卡 1），只報不判。
預期時間（推論，見診斷第八段）：
- 大卡熱的推頁：「進店家頁」82–85 → 約 57–65。大卡冷的推頁少的毫秒數跟熱的差不多。
- 大卡返回：51–79 → 少 10–20ms。
- 收藏卡熱的推頁 83–98、返回 114–166：各少 10–20ms。收藏卡返回時，從「返回」到以前「App 重算」那 48–85ms 不變。
- 推完那一下（x=0 前後 50ms）34ms 以上的掉幀：全舊約 3/10（M11），不加應該更少。
影片：中位數分「全部」和「排除影片落在推頁那筆的」兩種各報一次；兩種結論不一樣時，以排除的為準。
判定（逐項判，冷的只報不判）：
(a) TabChrome＋ToastLayer（Root 不讀 barHidden）和 (b) mapRect 不記 x：都是結構改動，沒有新的 ==。計數照上面的預期消失，而且不加的熱推頁中位、返回中位都沒有比全舊慢 5ms 以上，就留。各自貢獻多少看第三段。
(c) MapNav：看第三段的 -mapPathRead。
(d) TabRoot：不在 M11 判（推頁、返回時 Root 已經不重算），看第五段。

三、歸因（M11d，只量熱的）
每次 launch 只跑一組：先冷的進、返回一次不計，再熱的進、返回 3 次。每一組都跟不加交錯。
- (1) -rootBar -rootTabs，兩條路各 1 次 launch：推頁、返回都多出 App 1・地圖 1・收藏 1；大卡那條路的「地圖導覽」也多 1。
- (2) -mapRectX，只跑大卡：推頁多出地圖 1・附近面板 1・大卡 1・地圖導覽 1 和「附近重算」，推完 0.5 秒的 x=0 那一下再一次。
- (3) -mapPathRead，只跑大卡：推頁、返回各多出「地圖 1」，就留 MapNav。沒多出，表示 MapTab 本來就不跟著 mapPath 重算，MapNav 就拿掉：刪 oldPathRead 和 MapNav，:85 改回 `        NavigationStack(path: $store.mapPath) {`，並把那幾行報給我。另外看不加那組：「地圖導覽重算」後面如果接著「圖釘」「附近面板」計數或「附近重算」記號，也報給我（推論：存起來的 content 被判成不一樣）。
- (4) 選做：只加 -rootBar，兩條路：預期只多 App 1，量的是 Root 本身多貴。

四、照 (甲) 的 -printChanges 決定下一輪（下一輪我寫程式）
- PlaceDetail 第 2–4 次、推完那次、返回那次，如果印「_dismiss changed.」或「_openURL changed.」：把讀這兩個環境值的地方拆成小 view，包括返回鈕 :77、刪除後返回 :68，以及用 openURL 的 :64、:114、:203、:315。
- 如果只印「PlaceDetail: @self changed.」（沒有 @identity、_dismiss、_openURL）：再加只比 place 的 DetailPage 殼和 -detailAlways，用反方一給的寫法。
- 同一次推頁有兩次以上「@self, @identity …」：表示這頁被建了兩份，殼擋不住，把那幾行報給我。
- PickedCard 印「_openURL changed.」：把「導航」鈕拆成小 view，範圍是 :1749–:1756，連同 :1705 的 askNav 和 :1773–:1777 的 confirmationDialog。
- 印別的原因，就把那幾行給我。

五、換分頁（M11e，判 TabRoot）
步驟：地圖 → 收藏 → 群組 → 我的 → 地圖，每次切完等 2 秒，跑 5 輪。不加跟 -rootTabs 交錯，另外兩組各加 -printChanges 跑 1 輪。
要報的：每個「換分頁」記號之後 300ms 內的掉幀（含重算次數），和 -printChanges 那一輪「App 重算」後面的行。
預期：
- 不加時，每次「App 重算」之後都沒有「MapTab: @self」「ListTab: @self」。
- 離開、回到地圖那兩下，可能還有「MapTab: _openURL changed.」（R4-1 第 182、214 行；推論是地圖分頁的 tabActive 變了，TabRoot 擋不住）。進出收藏那兩下有「ListTab: _front changed.」（分支頭的 ListTab 讀 tabActive）。
- 所以只拿收藏→群組、群組→我的這兩下判：不加時這兩下都沒有「地圖」，群組→我的也沒有「收藏」；加 -rootTabs 時每一下都有「MapTab: @self」和「地圖 1」。
- 「地圖範圍變了」後面接的 _mapRect、_headY 重算，不算在 TabRoot 頭上。
判定：收藏→群組、群組→我的兩下合起來，每組 10 筆，看掉幀 ms 的中位，沒掉幀記 0。
- -printChanges 照預期，而且中位比 -rootTabs 低 1 幀以上：留。
- 計數照預期少了、時間沒有變差（差 5ms 以內）但不到 1 幀：也留，並報數字。理由是 U54 的驗收要求在收藏、群組、我的之間切換時「地圖」次數不變，現在靠 Root 重算還在跑。
- 「MapTab: @self」還在，或時間變差：拿掉 TabRoot。page 改回 `            v().environment(\.tabActive, store.tab == i)`，刪掉 tabRoot 和 TabRoot。

六、小地圖（不看時間）
看熱的推頁那幾行。如果兩行「小地圖用快取」的 key 一樣，中間夾著「小地圖消失」「小地圖出現」，就證實是拆掉再掛上。如果只有一次「出現」卻有兩次「用快取」，或兩個 key 不一樣，把那幾行報給我。

**回歸**

不加參數，照下面走一遍（可以同時開 -perfOverlay 看計數）：
1. 分頁列：
- 地圖點圖釘，按大卡「店家頁」或點大卡照片，分頁列往下滑走（snappy）。按返回、從左邊緣滑回、在畫面中間往右滑回（iOS 26），分頁列都要滑回來。
- 收藏卡、群組裡的店、群組滑卡結果的店推店家頁，也一樣。
- 長按圖釘開選單、抽 3 間或轉盤開著時，分頁列滑下去（spring），關掉要滑回來。
- 長按圖釘選「看店家」進店家頁再返回，分頁列只在回到地圖首頁時出現。
- 進行程模式時分頁列藏起來；行程面板從下面彈上來、標題列淡入、下面那塊淡出往下，這幾個動畫都跟改之前一樣。離開行程時反過來。
2. 訊息條：
- 位置：地圖首頁貼著面板上緣，右邊讓開行程和定位兩顆；面板拉到最高時在分頁列上方；行程模式貼行程面板，出發中貼評分卡；店家頁貼在按鈕列上方。
- 訊息條還在時推店家頁、返回，訊息條要從面板上緣滑到按鈕列上方再滑回來，不是跳過去。
- 「我的行程」sheet 開著時，Root 那條藏著、sheet 裡那條出現；開關 sheet 時 Root 那條滑進滑出（149b223），倒數不重來。
- 收藏頁長按刪除時，卡片縮小飛進訊息條左邊的小照片，按「復原」會回來；手指按住訊息條時倒數暫停。
3. 教學從頭跑一次：圈圖釘、帶進店家頁、圈「去過」、回地圖，每一步的分頁列和對話框位置都照舊。
4. 剪貼簿膠囊：複製一個連結再回到 App。膠囊在地圖首頁貼著面板上緣，進店家頁貼按鈕列，其他分頁在分頁列上方；有訊息條時先藏著。
5. 清 mapPath 的地方：
- 先在地圖推一個店家頁，再切到群組按「在地圖上看」，回到地圖時要是首頁，分頁列在。
- 店家頁按「加進這個行程」，回地圖看得到新號碼；按「在行程裡」會打開行程。
6. 深連結：沒登入、已登入各開一次 https://anthony-apps.netlify.app/join?code=…，登入、問完問題後要打開那個群組。點「收藏好了」通知要到收藏頁最上面（U31；收藏頁包在 TabRoot 裡也要收到 listTop）。
7. 店家頁：
- 改想去／去過、星等、換分店，畫面要馬上跟著變。
- 刪除後回上一頁，並且能復原。
- 停在最高段清單時進店家頁，按「去過」再返回，那一列要馬上變「✓ 去過」。
8. 地圖：
- 推店家頁再返回，鏡頭、泡泡、「附近 N 間」、上下邊距（Apple 標誌的位置）都沒變。
- 回來後拖地圖、點圖釘、抽一間都照常。
- 附近面板拉到最高段時推店家頁再返回，也一樣。
- 行程模式框站的範圍（用 trip.mapBottom）照舊。
9. 換分頁：
- 每個分頁的捲動位置、地圖鏡頭都留著；新的一頁從下面 8pt 淡入（0.15 秒）。
- 在收藏頁打字後切回地圖，馬上是新的篩選。
- 在地圖頁時藍點會跟著位置動，切走再切回也跟得上。
- 在收藏、群組、我的之間來回切 10 次，PerfHUD 的「地圖」次數不變（U54 的驗收）。
10. 群組：
- 在別的分頁時朋友配對成功，回到群組分頁才跳配對畫面（分支頭的 RoundView 讀 tabActive，包了 TabRoot 也要收得到）。
- 在滑卡、轉盤上往右滑不會回上一頁；切到別的分頁後，那些區域不擋別頁的右滑返回（U50）。
11. 登出再登入：四個分頁重新建好，地圖沒有殘留的店家頁，分頁列在。
12. 在「我的」改導航要用哪個地圖之後，大卡、店家頁、長按圖釘的「導航」都要用新的那個。

**風險**

1. TabRoot 只比 i。以後要從 Root 傳參數給分頁，要一起放進 ==，不然改了不會生效（註解有寫）。
我查過 MapTab、ListTab、GroupsTab、MeTab 的 body，沒有靠 Root 重算來刷新、又不被觀察的值。MapTab 不被觀察的讀法只有三種：pins.arm 只在第一次和換群組時作用；pins.track 的 GonePin 會自己淡掉；store.mapRegion 和 seenBox.peek 只給 arm 用。
環境值（tabActive、toastNS、openURL）穿過 EquatableView 照樣往下傳。
2. TabChrome 和 MapNav 都把上一層建好的內容存起來，原封不動交回去。Root 在 store.tab、opened 變時照舊會重算、重建 TabChrome；MapTab 自己的東西變了，照舊會重建 MapNav，所以內容不會是舊的。MapNav 的 content 裡有閉包，這是 perf-round1d 第 6 節同一個疑慮，第三段寫了遇到時要報的條件。
3. 訊息條換到 ToastLayer 以後，matchedGeometryEffect 用的還是 Root 的 toastNS。推論沒有差別，但「刪除卡片飛進訊息條」要回歸看一次。
4. -rootBar 照原本的式子讀那些值，但 view 的結構是新的，TabChrome、ToastLayer 還在。M11 沒有訊息條，拿它當對照仍然有效。
5. -mapPathRead 會在 MapTab 的 body 裡多建一個不放進畫面的 NavigationStack。推論 SwiftUI 的 view 建構子沒有副作用。如果編不過、出警告，或量測時出現怪事，把 oldPathRead 裡建 NavigationStack 那一行拿掉、只留建 Binding，並在報告裡寫明。
6. mapRect 不記 x 以後，唯一的差別是量測浮層的「地圖 x,y」推頁時不再顯示 -121。
7. 編譯面（Swift 5，沒有預設 MainActor）：
- TabRoot 的 nonisolated == 只讀 Int 的 let，跟 NearbyHost（MapTab.swift:1164）同一種寫法。
- page 的閉包改成 @escaping @MainActor，跟 TabRoot(i:make:) 對得上。
- MapNav、TabChrome 是泛型容器，在 init 裡就呼叫 content()。
寫 Swift 的 Claude 只能跑 -parse，型別錯要等 Mac 建置才知道。最可能出問題的是 TabRoot 的閉包型別，和 oldPathRead 裡 NavigationStack 的型別推斷。Root 的 tabs 如果出現「unable to type-check this expression in reasonable time」，就把 TabChrome 裡的 ZStack 抽成 private var pages: some View。在分支頭上改完以後，MapTab body 的 `@Bindable var store = store` 已經沒有地方用到 $store，留著不影響（頂多一個警告），不要順手刪。
8. 這次沒處理的：
- 店家頁、大卡因為環境值或換頁本身而重算的那幾次（等 -printChanges）。
- 收藏卡返回時，從「返回」到以前「App 重算」那 48–85ms。
- 影片 start、開始播有時落在推頁那筆裡。
- 小地圖拆掉再掛上（只影響小地圖自己）。
9. 預估省下的時間是從 Console 的時間差推出來的：大卡熱的推頁約 1–2 幀，其他約 1 幀。模擬器量出來不到，就照判定拿掉對應的項目。

**診斷（給想看細節的人）**

一、版本、行號、要改在哪一版
1. 行號一律是 72ac06e 的。題目寫的 MapTab.swift:81、:306 是舊版：72ac06e 的 `NavigationStack(path: $store.mapPath) {` 在 :85，`.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in` 在 :316。scratchpad 的 MapTab_72ac06e.swift 跟 git show 用 diff 比過，一字不差。「第 N 行」指 /mnt/project-files/M11_72ac06e_原始Console.txt；「R4-1 第 N 行」指 /mnt/project-files/R4-1_printChanges_fccc58f_原始Console.txt。
2. 分支頭是 08292cf，比 72ac06e 多 8 個 commit，程式要加在分支頭。每一項附的原文片段在分支頭都 grep 得到，行號往後移：
- FoodMapApp.swift 全部 +1（fccc58f 在 :34、:35 中間加了 printChanges 那行）。
- MapTab.swift：:61、:63 不變；:85→:86、:316→:324，:1131 那行註解→:1171，:1302→:1342，:1709→:1749。
- ListTab.swift：:18→:19。
- PlaceDetail.swift：:435→:436、:438→:439、:444→:445。
-printChanges 已經有了（Perf.swift:213 和四個 body），這份不另開參數。

二、Root（App 重算）為什麼在推頁、返回時重算
1. Root.body 讀 store.barHidden：72ac06e:FoodMapApp.swift:145 `if !store.barHidden && !store.menuCover && !store.drawCover {`、:149 `.animation(.snappy, value: store.barHidden)`。barHidden 是計算屬性，見 Store.swift:80 `var barHidden: Bool { tab == 0 ? (!mapPath.isEmpty || TripMode.shared.tid != nil) : depth[tab] > 0 }`。所以 Root 在地圖分頁時跟著 mapPath 重算，在收藏分頁時跟著 depth 重算。
2. 大卡進：大卡的「店家頁」是 MapTab.swift:1757 的 `NavigationLink(value: place) {`，經過 :85 的 NavigationStack，在按下的那一個 update 就 append 到 store.mapPath。第 3–7 行依序是 .672 手指放開、.674 App 重算、.676 地圖重算、.695 店家頁重算，Root 在店家頁建出來之前就重算了。返回走 PlaceDetail.swift:72 `private func back() { store.pop(dismiss) }`，再到 Store.swift:483 `if tab == 0, !mapPath.isEmpty { mapPath.removeLast() } else { dismiss() }`，對應第 64、67、68 行的 .741 返回、.742 App 重算、.744 地圖重算。
3. 收藏卡進：ListTab.swift:61 的 `NavigationLink(value: p)` 改的是 ListTab 自己的 `@State private var path`（:7），store 沒變。ListTab.swift:451 的 DepthReport `Color.clear.onChange(of: path.count) { _, n in store.depth[tab] = n; … }` 要等店家頁 onAppear 之後才寫 depth[1]，所以 Root 晚一拍：第 402–405 行依序是 .504 進店家頁、.505 店家頁重算、.507 App 重算、.508 地圖重算。返回時 tab 是 1，store.pop 走 dismiss()；DepthReport 要等 UIKit 開始退頁、path 更新後才寫 depth[1] = 0（推論）。「返回」到「App 重算」隔了 48–85ms，見第 499/503 行（.490→.572），以及 509/514、518/523、527/532、536/541、561/566、585/590、612/617、638/643 行。
4. 訊息條開著時，FoodMapApp.swift:94–:103 的 toastLayer 還會讀 store.mapPath、barHidden、bottomBar。bottomBar 由 PlaceDetail.swift:227 在推頁時寫，:60 在離開時歸零，所以那時推頁、返回也會讓 Root 重算。M11 沒有訊息條。
5. 拆走 barHidden 和 toastLayer 以後，Root.body 剩下的讀取如下，推頁、返回時都不變：
- :37 loggedIn。
- :53 clip.showing、store.coach、store.toast、askNotify、TripMode.shared.on。
- :58 store.toast（.task 的 id）。
- :60 bite。
- prompts：:192、:199 的 askNotify、coach，:204 askOld，:211 askName，:221 showIG。
- events 的 authFree：:134 的 askOld、askName、authSettling。
- page：:226–:233 的 opened、store.tab。
所以 Root 推頁、返回時不會再重算（推論；(甲) 的 -printChanges 在推頁、返回時不該出現「Root:」那一行）。

三、地圖（MapTab）推頁時的兩次
1. 第一次是推頁 .676、返回 .744，還有收藏卡那條路的每一次。兩個原因疊在同一個 update 裡：
(a) Root 重算時，FoodMapApp.swift:139 `page(0) { MapTab() }` 建了新的 MapTab 值，MapTab 被當成不一樣，整頁重算。這點現在有直接證據：R4-1 第 180–184 行換分頁時先印「Root: \Store.<computed … (Int)> changed.」，接著「App 重算」，之後緊接「MapTab: @self, _openURL changed.」和「ListTab: @self changed.」；第 201–205、212–216 行也一樣。
為什麼 @self 不相等是推論：MapTab 的 @State 初始值裡有四個每次都 new 的物件，分別是 :11 `@State private var pins = PinState()`、:19 `SeenBox()`、:26 `BurstSpot()`、:45 `CamQuiet()`（:1131 的註解也寫了「MapTab 每次被重新建構（Root 重算）」）。GroupsTab 也每次被 Root 重建，但它的 @State 全是值（GroupsTab.swift:6–9），它 body 開頭的「群組」計數（:14）在 M11 一次都沒出現。
收藏卡那條路 mapPath 完全沒變，推頁、返回共 18 次，都是 App 重算後 0–2ms 就地圖重算。推頁見第 404/405、422/423、440/441、465/466、483/484、553/554、577/578、603/604、629/630 行；返回見第 503/504、514/515、523/524、532/533、541/542、566/567、590/591、617/618、643/644 行。
(b) 大卡那條路還有 mapPath 這個原因：:85 在 MapTab 的 body 裡用 @Bindable 建 $store.mapPath。08292cf 拆搜尋框時量到的是同一件事：R4-1 第 21 行在收藏頁打字時印出「MapTab: \Store.<computed … (Filter)> changed.」，那時 MapTab 的 body 建了 $store.mapF 的綁定。08292cf 的註解（分支頭 ListTab.swift:457、:477，MapTab.swift:1149）也寫了「把 Binding 交給子畫面時 SwiftUI 會讀一次值，讀的會記成上一層的依賴」。
所以推論 MapTab 也跟著 mapPath 重算。它跟 Root 在同一個 update，Console 分不出來。如果只拿掉 Root 的讀取，MapTab 推頁時還是會因為 mapPath 重算，所以要 MapNav。(乙) 的 -printChanges 如果印出「MapTab: @self, \Store.<computed … (NavigationPath)> changed.」，就證實了這點。
2. 第二次是推頁 .811，來自 MapTab.swift:316–:317 的 `.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in mapRect = r; …`。UIKit 推頁時把底下那頁往左推 0.3 個畫面做視差（402×0.3≈121），global frame 只有 x 變，見第 14 行 .810「地圖範圍變了 x=-121 y=0 w=402 h=874」。
mapRect 是 MapTab 的 @State，body 在 :181、:182、:373 讀它，所以 .811 地圖重算。NearbyHost 的 ==（:1166）有比 mapRect，結果不相等，所以 .812 附近重算（「附近算 0.02 ms，10 間」），NearbySheet 也跟著重算（附近面板 1）。
推完約 0.5 秒，底下那頁離開畫面，x 回到 0（第 25–29 行 .314–.316），又多一次地圖重算和附近重算。10 次大卡推頁裡，有 3 次光這一下就掉 34–40ms（第 213–218、260–265、291–297 行）。
mapRect 的 x 和寬度沒有地方用：上下邊距只用 minY、maxY（:181、:182）；NearbyHost.visible 只用 minY、height（:1181–:1182）；trip.mapBottom 用 maxY（:317）；x 只出現在 showGeo（:735–:737，只寫量測浮層）。

四、收藏（ListTab）為什麼在地圖推頁時也重算
原因跟三.1(a) 一樣。FoodMapApp.swift:140 `page(1) { ListTab() }` 每次重建時，ListTab.swift:11 `@State private var pull = PullState()` 都會 new 一份（PullState 是 class，見 :249），推論因此被判成不相等。R4-1 第 184、205、216 行直接印出「ListTab: @self changed.」。ListTab 雖然讀 store.tab（:21），但推頁時 tab 沒變，沒有別的原因。

五、大卡 2
1. 推頁那筆其中一次：三.2 的 mapRect 讓 NearbySheet 重算，NearbySheet.mid（:1404）重建 PickedCard。參數裡的 draw、panel、pickHistory、close 都是閉包，比不出相等，所以 PickedCard 重跑。M9 A 換 B 的「大卡 1・附近面板 1」是同一種情況。
2. 推頁的另一次和返回的兩次：返回那筆沒有附近面板，也沒有附近重算，所以不是從 NearbySheet 來的。MapTab 重算也到不了 PickedCard：NearbyHost 相等時整塊跳過（:438 `.equatable()`），.676 那次就沒有附近重算。
PickedCard 自己讀的值有 mp.stage（:1713）、store.here（:1783 的 distance）、store.places（branchesOf），推頁、返回時都不變。剩下的是環境值 `@Environment(\.openURL) private var openURL`（:1696）。
R4-1 顯示，上游有環境值變了時，openURL 也會被當成變了：MapTab 只在地圖分頁的 tabActive 變的那兩次多印 _openURL（第 182 行地圖→群組、第 214 行我的→地圖），群組→我的那次（第 203 行）就沒有。
推論：NavigationStack 在推頁、退頁時改了根頁面的某個環境值，PickedCard 因為讀 openURL 跟著重算；NearbySheet 沒讀 openURL，所以沒有。這要用 -printChanges 證實（會印「PickedCard: _openURL changed.」）。這輪不改。

六、店家頁 4 次（PlaceDetail.swift）
1. 第 1 次是建這一頁（MapTab.swift:460、ListTab.swift:103 的 navigationDestination），這次是必要的。
2. 第 2 次在 onAppear 之前。冷的跟第 1 次差 84ms（第 7–8 行 .695→.779），中間是整頁第一次排版、照片、PlaceMedia、MiniMap、DishChips；熱的差 11ms（第 36–37 行）。
3. 第 3 次在 onAppear 之後 0–1ms（:58 `.onAppear { Perf.shared.mark("進店家頁") }`；第 9、12 行）。
4. 第 4 次再晚一點。大卡那條路晚 6–10ms（第 13 行 .798；熱的第 42 行 .854）。收藏卡那條路晚 19–29ms，中間夾著 App、地圖、收藏重算（第 403–406 行等）。
5. 另外推完約 0.5 秒還有一次：大卡是第 26 行 .314，排在 .315 地圖重算之前；收藏卡是第 431 行，進店家頁後 0.53 秒。返回時也有一次：大卡是第 69 行，在 App 之後 23ms；收藏卡是第 502 行，在返回後 13ms、App 之前。
6. 這幾次都不是 Root、地圖或收藏重算帶出來的。證據有兩個：
- 大卡那條路 .811 MapTab 重算、重建了 navigationDestination 之後，店家頁沒有跟著重算（第 14–17 行；下一次店家頁重算在第 26 行）。
- 收藏卡那條路，App、地圖、收藏重算夾在第 3、4 次店家頁中間，店家頁還是 4 次，跟大卡那條路一樣。
所以原修法的 5a（推論 NavigationStack 重建這頁的值、ScrollY() 每次 new 一份被當成不一樣）在 Console 裡找不到支持，這輪拿掉。
7. 剩下三種可能（推論）：
(a) 換頁時環境值換了。店家頁讀 `@Environment(\.openURL)`（:8）和 `@Environment(\.dismiss)`（:9），跟五.2 是同一種情況。
(b) 這一頁被建了兩份。這時 -printChanges 除了第一次以外，還會再印 @identity。
(c) NavigationStack 重建了這頁的值。這時只會印 @self。
-printChanges 分得出這三種，決策見 sim 第四段。
8. 子 view 自己的狀態不會讓店家頁重算：
- MiniMap 的 width、img（:410–:411）。
- PlaceMedia 的 player（Reel.swift:10、:79）。
- DishChips 的 shown（:477、:496）。
- Stretchy 的 h（:519）。
- ScrollY（:50、:513），只有 TopShade、Stretchy 讀。
按鈕列在 :227 寫 store.bottomBar，但店家頁的 body 不讀它。:54–:56 的 trips.load() 要等 400ms 才跑。
9. 小地圖：熱的每次推頁都印兩行「小地圖用快取」（第 39/41、123/125、196/198、275/277、359/361、419/424、438/442、462/467、481/485 行），冷的每次開 App 都只截一張圖（「小地圖開始截圖」在第 24、106、182、259、342、409、558、582、608、635 行）。
NSCache（:413）裡只有截過的那一個 key。如果熱的兩次 key 不同，一定有一次沒命中，會印「小地圖開始截圖」，但 Console 裡沒有。所以兩次是同一個 key，原修法說的「寬度先後量到兩個值」不成立。
`.task(id: key)`（:436）用同一個 id 又跑了一次，推論是 MiniMap 在推頁時被拆掉再掛上，或者建了兩份。這只讓 MiniMap 自己多跑一次（img 設兩次同一張圖），不影響店家頁的重算次數。key 和「小地圖出現／消失」兩個記號可以證實。
10. 影片：「影片 start」「影片開始播」有幾次落在推頁那筆掉幀裡。熱的是第 131–134、367–370、426–429、469–472 行；冷的第 19–20、178–179、256–257 行剛好落在掉幀結尾。那是 PlaceMedia 自己在做事（Reel.swift:65–:66 的 start、:78–:79 建 PlayerLayer），不是店家頁重算。這屬於 perf-round1d 第 6 節的「冷的推頁還剩的那塊」，這份不改，但量的時候要標出來。
11. 照片（推論，不在這次範圍）：收藏卡冷的推頁是 140–194ms，比大卡冷的 98–184ms 慢。地圖那條路在選圖釘時已經先載好 400、1200 的照片（MapTab.swift:681），收藏卡那條路沒有。

七、附近面板 1 和附近重算
這兩個就是三.2 的 mapRect 造成的。附近列沒有出現，表示清單內容沒變。

八、能省多少（推論，從 Console 的時間差估）
1. 熱的推頁，從放開到第一次店家頁重算：大卡 13–20ms（第 32/36、113/117、189/193、268/272、349/353 行），收藏卡 4–5ms（第 412/414、433/435、455/457、476/478 行）。多出來的 9–15ms 是 Root、MapTab、ListTab 重算，加上地圖那條路自己的推頁工作，分不開。
2. 第 3 次到第 4 次店家頁之間：收藏卡 19–29ms（第 403/406、421/425、439/443、464/468、482/486、552/555、576/579、602/605、628/631 行），大卡 6–10ms（第 12/13、40/42、90/91、124/126、171/172、197/199、249/250、276/278、326/327、360/362 行）。所以 App＋地圖＋收藏約 11–21ms，大約 1 幀。
3. mapRect 那段：熱的從「地圖範圍變了 x=-121」到那筆掉幀結束是 11–13ms（第 43/49、127/134、200/206、279/285、363/370 行；其中兩次含影片 start）。
4. 結論：大卡熱的推頁約省 20–28ms，「進店家頁」從 82–85 降到約 57–65（1–2 幀）。收藏卡推頁、兩條路的返回各約省 10–20ms（約 1 幀）。收藏卡返回時，從「返回」到以前「App 重算」那 48–85ms（推論是 UIKit 退頁、收藏頁重新掛上）這次沒動。

## D 殘影量測 -dumpPins（U13(6)）

**為什麼**：選著一根圖釘，按「行程」開「我的行程」sheet，再點一個行程進去。偶爾會留下一根放大、有照片和店名牌的圖釘：跟著地圖走、點不到、按「完成」離開行程才消失。Console 顯示 sel 已經是 nil、之後也沒有 MapKit 送來的選取，所以不是選取邏輯錯，是畫面上多了一個 view。-noPinPair、-clusterCheck 各一次都沒重現，不能排除 T2。要先知道殘影是誰才修得準。

**做什麼**：加 -dumpPins 時，進行程當下、2 秒後，離開行程當下、2 秒後，各把 MapKit 掛著的每個大頭針 view 印一行：標題、螢幕位置、透明度、是否藏起來、是否選著、MapKit 還認不認得它（tracked）、外層 view 的型別。不加參數什麼都不做，印的行走 Flag.log（開發版、模擬器才印）。

### 改動

#### D-1　MapTab.swift（347906f 第 512 行起）

**位置**：MapTab.body 的 .onChange(of: trip.on)（347906f MapTab.swift:512–518）

**原文**：
```swift
        .onChange(of: trip.on) { _, on in
            seenBox.only = nil; seenBox.zoomed = nil
            if on {
                if trip.cand == nil { pins.select(nil); pins.drawn = nil }
            } else {
                seenBox.set(seenBox.peek, publish: true)
            }
        }
```

**改成**：
```swift
        .onChange(of: trip.on) { _, on in
            seenBox.only = nil; seenBox.zoomed = nil
            if on {
                if trip.cand == nil { pins.select(nil); pins.drawn = nil }
            } else {
                seenBox.set(seenBox.peek, publish: true)
            }
            // 量測（-dumpPins）：U13(6) 進行程後偶爾留一根點不到的放大圖釘。列出 MapKit 真的掛著的大頭針 view，看殘影是誰
            if Flag.on("-dumpPins") {
                PinDump.run(on ? "進行程當下" : "離開行程當下")
                Task { try? await Task.sleep(for: .seconds(2)); PinDump.run(on ? "進行程 2 秒後" : "離開行程 2 秒後") }
            }
        }
```

**理由**：只加量測，-dumpPins 才有作用（Flag 正式版讀不到啟動參數）。進出行程各印兩次：當下一次、2 秒後一次（sheet 收完、分群跑完）。

#### D-2　Perf.swift（347906f 第 1 行起）

**位置**：檔案開頭的 import（347906f Perf.swift:1–4）

**原文**：
```swift
import SwiftUI
import UIKit
```

**改成**：
```swift
import SwiftUI
import UIKit
import MapKit
```

**理由**：PinDump 要用 MKMapView、MKAnnotationView。

#### D-3　Perf.swift（347906f 第 227 行起）

**位置**：enum Flag 的右括號之後、`// 量測／驗收用 -shareVerdictTest` 註解之前（347906f Perf.swift:225–247 那段之後）

**原文**：
```swift
// 量測／驗收用 -shareVerdictTest：把雲端會回的幾種字串餵給分享結果的判斷，印出通知標題和內文
```

**改成**：
```swift
// 量測（-dumpPins）：列出地圖上 MapKit 掛著的每個大頭針 view（標題、螢幕位置、透明度、選著沒、MapKit 還認不認得它、外層是誰）。
// 找 U13(6) 那種「跟著地圖走、點不到、離開行程才消失」的殘影：tracked=0 表示 MapKit 已經不認得這個 view 了
@MainActor enum PinDump {
    static func run(_ why: String) {
        let win = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        guard let win, let map = find(win) else { Flag.log("[pins] \(why) 找不到地圖"); return }
        let sel: [String] = map.selectedAnnotations.map { a in (a.title ?? nil) ?? "?" }
        var views: [MKAnnotationView] = []
        collect(map, into: &views)
        Flag.log("[pins] \(why) annotations \(map.annotations.count) views \(views.count) selected \(sel)")
        for v in views {
            let t: String = (v.annotation?.title ?? nil) ?? "-"
            let tracked: Bool = v.annotation.map { map.view(for: $0) === v } ?? false
            let f: CGRect = v.convert(v.bounds, to: nil)
            let box: String = v.superview.map { String(describing: type(of: $0)) } ?? "nil"
            let a: String = String(format: "%.2f", Double(v.alpha))
            Flag.log("[pins]   \(t) x=\(Int(f.minX)) y=\(Int(f.minY)) w=\(Int(f.width)) h=\(Int(f.height)) a=\(a) hidden=\(v.isHidden) sel=\(v.isSelected) tracked=\(tracked) in=\(box)")
        }
    }
    private static func find(_ v: UIView) -> MKMapView? {
        if let m = v as? MKMapView { return m }
        for s in v.subviews { if let m = find(s) { return m } }
        return nil
    }
    private static func collect(_ v: UIView, into out: inout [MKAnnotationView]) {
        for s in v.subviews {
            if let a = s as? MKAnnotationView { out.append(a) }
            collect(s, into: &out)
        }
    }
}

// 量測／驗收用 -shareVerdictTest：把雲端會回的幾種字串餵給分享結果的判斷，印出通知標題和內文
```

**理由**：只在 -dumpPins 時被叫到，印的行走 Flag.log（開發版、模擬器才印）。從 key window 往下找 MKMapView，再遞迴收所有 MKAnnotationView；每個印一行。tracked 用 map.view(for:) 比對：MapKit 還管著的 view 會是同一個物件。

**模擬器**：照 U13(6) 的步驟（選著一根，按「行程」開 sheet，medium 和 large 各試，再點行程進去），加 `-dumpPins -perfOverlay`，冷開做 5 次。每次報：有沒有殘影、殘影那根的店名，和「[pins] 進行程 2 秒後」那一段的全部行。有殘影的那次另外報「離開行程 2 秒後」那段。重點看殘影那根的標題有沒有出現兩行（一行 tracked=true、一行 tracked=false），以及它的 sel、a、in。出現殘影的話，再加 -noPinPair 冷開 5 次比。

**回歸**：不加 -dumpPins 時 Console 不會有 [pins] 行，進出行程照常。
