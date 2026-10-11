# 美食收藏

對標 Yaay：在 IG 看到想吃的店，貼上連結就收藏起來，放到地圖上、依地區和分類整理，還能跟朋友一起滑卡決定吃什麼。

網址：https://gop9632.github.io/open-apps/apps/food-map/

## 功能

- **一鍵導入**：貼上 IG Reels／貼文、Threads、TikTok、Google 地圖連結，或直接貼貼文文字、丟截圖，AI 找出店名、地址、分類、價位、時段。IG 貼文有地點標記時，直接用它的座標。
- **地圖**：依咖啡廳、餐廳、麵包店等分類顯示，可依縣市篩選、看離我多遠、一鍵 Google 地圖導航。
- **分類**：縣市（台北、桃園、台中…）、分類、想去／去過、評分、筆記、標籤、搜尋。
- **美食群組**：建立群組、用連結或邀請碼找朋友加入，把收藏分享進群組，也能把朋友的店收進自己的清單。
- **滑卡配對**：在群組開一輪，每個人各自左滑右滑，大家都想吃的店即時跳出「配對成功」。
- **抽一間**：選地區、分類、時段、預算，或「附近 3 公里」，抽一間；最近抽過的會先跳過。
- 其他：Android 可以從 IG 直接「分享」到這個 app（先加到主畫面）、匯出／匯入備份、離線也打得開。

沒接雲端時是「只存在這台裝置」模式：收藏、地圖、抽籤都能用，AI 導入要自己在「我的」填 Groq key（只能貼文字或截圖）。

## 接上雲端

多人登入、群組、滑卡要一個共用資料庫，用 [Supabase](https://supabase.com) 免費方案。設定一次就好，大約 10 分鐘。

所有資料表都放在獨立的 `food` schema，所以**可以直接用你現有的 Supabase 專案**。免費方案同時只能有 2 個專案在運作，不用另外開新的。不會動到原本 `public` 裡的資料表和觸發器。要注意的是登入帳號會和那個專案的其他 app 共用。

1. **選專案**：用現有的專案就好。如果想要獨立一個，到 supabase.com → New project，Region 選 Northeast Asia (Tokyo) 或 Singapore。
2. **建資料表**：左邊 SQL Editor → New query → 把 [`supabase/schema.sql`](supabase/schema.sql) 整份貼上 → Run，看到 Success 就好。重跑也沒關係。
3. **開放 food schema**：Project Settings → Data API → Exposed schemas，加上 `food` → Save。
4. **讓註冊不用收信**：Authentication → Sign In / Providers → Email，把 **Confirm email** 關掉 → Save。免費方案一小時只能寄幾封信，朋友註冊會卡住。如果現有的專案還需要收信確認，這步可以跳過，朋友註冊後去信箱點確認信就好。
5. **部署「抓店家」功能**：
   - 左邊 Edge Functions → Deploy a new function → Via Editor。
   - 函式名稱填 `extract`，把 [`supabase/functions/extract/index.ts`](supabase/functions/extract/index.ts) 整份貼上，取代原本的範例 → Deploy function。
   - 到 [console.groq.com/keys](https://console.groq.com/keys) 建一把免費 key（gsk_ 開頭）。
   - 回 Supabase：Edge Functions → Secrets → 新增 `GROQ_API_KEY`，值貼剛剛那把 key → Save。
6. **把網址和 key 填進 app**：Project Settings → API Keys，複製 **Publishable key**（sb_publishable_ 開頭）；Project URL 在專案首頁或 Data API（https://xxxx.supabase.co）。填進 [`config.js`](config.js) 後推上 GitHub。
   - 想先試試看：打開 app →「我的」→「進階：雲端設定」貼上這兩個值，只對那台裝置有效。

做完之後，打開網址會先要求登入，建帳號、建群組、按「邀請好友」把連結傳到 LINE 就可以了。

## 檔案

- `index.html`：版面與樣式
- `app.js`：全部程式（資料層、導入、地圖、群組、滑卡、抽籤）
- `config.js`：雲端設定
- `supabase/schema.sql`：food schema 的資料表、權限（RLS）、加入群組、即時同步
- `supabase/functions/extract/index.ts`：讀 IG／TikTok／Google 地圖／一般網頁，交給 Groq 找店家

## 技術

- 地圖：Leaflet + OpenStreetMap 圖資；地址轉座標用 OpenStreetMap Nominatim（免費，台灣門牌常常只對到巷或路，會標「大概位置」，可以在地圖上點修正）。
- AI：Groq 免費模型，文字用 `openai/gpt-oss-120b`，截圖用 `meta-llama/llama-4-scout-17b-16e-instruct`，可在 Supabase Secrets 用 `GROQ_TEXT_MODEL`、`GROQ_VISION_MODEL` 換。
- IG：用搜尋引擎爬蟲的方式讀公開貼文的說明文字和地點標記，不需要登入。私人帳號讀不到，IG 改版也可能失效，這時改貼文字即可。
