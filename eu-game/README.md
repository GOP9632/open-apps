# 第 22 輪制裁：全班一致決

歐盟概論小組報告（EU Sanctions against Russia）的課堂連線遊戲。題目全部出自小組的 Canva 簡報（ROLE 01–04）。

- 同學加入：https://gop9632.github.io/open-apps/eu-game/
- 主持畫面：https://gop9632.github.io/open-apps/eu-game/host.html

## 怎麼玩

1. 主持人用電腦打開主持畫面、投影到大螢幕。畫面上有 QR code 和 4 位數房號。
2. 同學用手機掃 QR code（或打開網址輸入房號）、取暱稱入席，每個人會被分配一個歐盟會員國。
3. 主持人選「精華版／完整版」和每題秒數，按「開始遊戲」（或空白鍵）。之後每一步都按空白鍵前進。
4. 每題同學在手機上作答，答對越快分數越高，連續答對有連勝加分，最後一題分數 ×2。
5. 全班都答對（或棄權）就是「一致決通過」，只要有人答錯或沒作答就是「否決」。
6. 每人有一張「建設性棄權」卡：不得分、不扣分、連勝不斷，也不會擋下一致決。整場一次。
7. 最後兩題是全班投票（不計分），用簡報結尾的討論問題，方便接著讓同學發言。

小技巧：大廳裡點同學的名字可以請他離席（暱稱不當時用）。F 鍵切換全螢幕。主持畫面不小心重新整理，會出現「繼續上一場」。

## 技術

- 純靜態網頁，放在 GitHub Pages。
- 即時連線用 Supabase Realtime 的 broadcast 頻道（`eu-game-<房號>`），不寫資料庫。主持人的瀏覽器是裁判：計時、計分、廣播狀態；手機只送「入席」和「作答」。
- 共用 `ptocokzxpwwautnbbuup` 這個 Supabase 專案（和美食收藏同一個）。免費方案的專案一週沒有人用會自動暫停，暫停時遊戲會連不上：上課前到 Supabase 後台按 Restore。
- `vendor/`：supabase-js 2.109.0、qrcode-generator 1.4.4（MIT）。`flags/`：flag-icons 7.2.3 的 27 個會員國國旗（MIT）。
- 檔案：`index.html` 手機端、`host.html` 主持端、`data.js` 題目與國家、`common.js` 星空／星環／連線／彩帶、`style.css` 共用樣式。
