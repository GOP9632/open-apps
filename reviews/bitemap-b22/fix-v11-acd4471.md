# V11：最高段從站卡中間拖，清單完全不捲（acd4471）

對照程式：acd4471。行號都是 acd4471 的。

## 判讀（從程式碼看，還沒在機器上證實）

- 交通列能捲、站卡不能，所以擋住的是站卡自己身上的手勢，不是整份清單的 listPull。listPull（TripPanel.swift:241）掛在包住所有列的 VStack 上，交通列一樣有它，卻照樣能捲。
- 站卡比交通列多三個手勢：
  1. `.onTapGesture(perform: tap)`（TripPanel.swift:1534）
  2. `.gesture(hold)`（TripPanel.swift:1535）。hold 就是 reorder()（TripPanel.swift:541）：`LongPressGesture(0.35).sequenced(before: DragGesture(minimumDistance: 0))`，用 `.gesture` 掛，不是 simultaneous。
  3. SwipeToDelete 的 `.simultaneousGesture(DragGesture(minimumDistance: 18), including: .all)`（TripsList.swift:347-366）
- **主嫌是第 2 個 `.gesture(hold)`。** iOS 18 起 SwiftUI 手勢底下是 UIKit 手勢。在 ScrollView 裡用 `.gesture` 掛「長按接拖曳（最小距離 0）」，手指一按下它就開始追蹤，清單的 pan 開不了。補充2（fix-list-round1c.md）B8 的調查員就預測過這件事，當時的主修法 RowHold 還沒做。
- 「行程面板重畫有跳」也對得上。hold 的 `.updating($holding)` 一按下，就把 TripPanel 的 `@GestureState holding` 設成 true，放開再設回 false，整個面板因此重算兩次。交通列沒有這個手勢，所以不會跳。
- HUD 那行「清單沒接手 行程 on=true y=35/0 v=358」，是 UIScrollView 的 pan 有開始才會記的（PanelLift.swift:166-170）。所以那行應該是從交通列拖的那一次：清單停在 35 往下拉，不在頂端，「沒接手」是正常的。如果從站卡拖時完全沒有任何「清單…」字樣，就表示 pan 根本沒開始，跟上面的判讀一致。
- 次嫌是 SwipeToDelete 的 simultaneous DragGesture(18)。listPull 應該不是，因為交通列一樣有它。
- 是不是 ec71aa2 之前就壞，程式碼看不出來：站卡的 `.gesture(hold)` 從 build 18 就在，但 ec71aa2 在外層多掛了 listPull，兩個疊在一起的行為只有機器上才看得出來。不管是哪一種，修法都一樣。

## 修法（同一版做完）

### 1. 站卡長按改成 UIKit 長按（RowHold）

照 fix-list-round1c.md B8「主修法」第 1 點和「調查員原文的修法」第 1–3 (d) 段，對到 acd4471 的位置：

- 新檔 `FoodMap/RowHold.swift`：整段照抄補充2的寫法（RowHold、RowHeld、RowHoldIf）。
- StopCard，TripPanel.swift:1493：
  ```swift
      var hold: RowHold? = nil
  ```
- TripPanel.swift:1535，`.gesture(hold)` 改成：
  ```swift
              .modifier(RowHoldIf(hold: hold))
  ```
  `.onTapGesture(perform: tap)` 照舊放在它前面。
- TripPanel 本體加 `@State private var held = RowHeld()`。
- TripPanel.swift:158 改成：
  ```swift
              if !held.on && !holding && drag.id != nil { clearDrag(); mode.overDay = nil }
  ```
- TripPanel.swift:508-517，StopCard 的 tap 開頭加一行，`hold:` 改成 rowHold：
  ```swift
                  StopCard(stop: s, n: i + 1, row: row, open: expanded == s.id, me: store.me, hot: mode.hot == s.id, tap: {
                      // 長按拿起又放開，不算點一下
                      guard drag.id == nil, CACurrentMediaTime() - held.endedAt > 0.4 else { return }
                      // …原本的內容不變…
                  }, hold: rowHold(t, s, k: k))
  ```
- TripPanel.swift:540-556，reorder() 換成 rowHold()。a45ce70 那個「慢慢拉、停一下不算拿起」的判斷要留著，放在 began 裡：
  ```swift
      // 長按 0.35 秒拿起來，拖到別的位置放開；拖到上面的「第 N 天」放開就換天（UIKit 長按，見 RowHold.swift）
      private func rowHold(_ t: Trip, _ s: TripStop, k: Int) -> RowHold {
          RowHold(began: { _ in
              // 正在把清單往下拉成拉面板：慢慢拉、停一下也不算長按拿起
              guard drag.id != nil || (!pull.swift && !pull.uikit) else { return }
              held.on = true
              if drag.id == nil { begin(s, k: k, size: (mode.geo.rows[s.id]?.height ?? 80) - (mode.geo.gaps[s.id] ?? 0)) }
          }, moved: { d, p in
              guard drag.id == s.id else { return }
              // 位移只寫進 dragY（只有被拖的那列跟著動）；插到哪變了才改 drag
              dragY.y = d.height
              let to = drag.target(mode.geo, base: trips.stops(t.id, day: min(mode.day, t.days)), dy: dragY.y)
              if to != drag.to { drag.to = to; Haptic.tick() }
              overDay(t, p)
          }, ended: { _ in
              held.on = false
              held.endedAt = CACurrentMediaTime()
              if drag.id != nil { drop(t) }   // 放開或被取消都放下
          })
      }
  ```
- `@GestureState holding` 和 `.onChange(of: holding)`（:187）都留著，最低段的 reorderX 還在用。

為什麼這樣就會捲：UIKit 長按在成立前，手指只要移動超過 10pt 就失敗，清單的 pan 照常開始（跟 UITableView 的長按一樣）。長按成立的那一刻，因為 delegate 的 shouldRecognizeSimultaneously 回傳 false，還在 possible 的清單 pan 會被 UIKit 判失敗，拖站時清單不會跟著捲。這是同步發生的，不用等 scrollDisabled 下一次 render。

編不過的話（CoordinateSpaceConverter 或 `context.converter.location(in: .global)` 名稱不對）有臨時方案：把 :1535 改成 `.simultaneousGesture(hold)`，再加補充2 B8 第 4 點的 freeze（begin() 同步停掉清單的 pan，clearDrag() 打開）。

### 2. 同一版加 DEBUG 啟動參數，一輪就分得出是誰擋住

寫法照 `-uitestSlowToasts`（Store.swift:42-45），只在 Debug 版有效：

- `-b8NoSwipe`：TripPanel.swift:504 的 SwipeToDelete 改成 `enabled: !noSwipe && drag.id == nil && expanded != s.id`。
- `-v11NoListPull`：TripPanel.swift:241 改成 `including: (drag.id == nil && !noListPull) ? .all : .subviews`。
- TouchSpy：照補充2 B8「診斷」那段（驗證員版，有 `MainActor.assumeIsolated` 和 `import UIKit.UIGestureRecognizerSubclass`），掛在 ListPullDown.attach。手指一按下記「觸」，移動 25pt 時記「動25 pan=狀態」和這根手指收到的所有手勢與狀態。

### 3. 最低段橫排

MiniStop 用的是同一個寫法：TripPanel.swift:636 的 `.gesture(reorderX(t, s, k: k))`，reorderX 在 :660。這次請模擬器順便測從小卡上左右捲。也捲不動的話用同一招改：RowHold 取 `d.width`，換算位置用 targetX。

## 模擬器驗收（用測試行程，8 站，最高段）

- V11a：從站卡中間（店名上）往上、往下各拖一次，清單要跟手捲。HUD 不能出現「拿起一站」，面板也不能跳。從交通列拖照舊能捲。
- V11b：清單捲到頂，從站卡中間往下拉，面板要跟著手指往下（HUD 出現「清單接手 行程」或「清單接手 備案」都可以）。放手後照面板的規則停段。
- V11c：長按站卡 0.35 秒拿起，上下拖：站卡跟手，清單不捲。放開後換順序，接著把順序換回來。
- V11d：拿起後拖到上方「第 N 天」放開會換天，接著換回來。
- V11e：站卡左滑刪除照舊：刪測試行程的一站，再按復原。
- V11f：點一下站卡，地圖飛過去；再點一下才展開。長按拿起、放開後 0.4 秒內點不算（不會展開）。
- V11g：清單在頂端時，從站卡上慢慢往下拉、中途停一下（a45ce70 那項），不能拿起一站。
- V11h：最低段，從小卡上左右捲。

V11a 沒過的話，再依序帶 `-b8NoSwipe`、`-v11NoListPull` 各跑一次 V11a，附上 Xcode console 裡 `[B8]` 開頭的「觸」「動25」那兩行。這樣就看得出這根手指被哪個手勢拿走。
