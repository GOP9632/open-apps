import Foundation

/// 常見快取的白話說明。key 是 ~/Library/Caches 底下的資料夾名稱。
struct CacheInfo {
    let explanation: String
    /// 裡面可能有離線下載的內容（音樂、聊天圖片等）。這類預設不勾。
    var hasOfflineContent = false
}

enum KnownCaches {
    static let byName: [String: CacheInfo] = [
        // 開發工具
        "Homebrew": CacheInfo(explanation: "Homebrew 下載的安裝包。已經裝好的程式不在這裡，不受影響；重裝或升級同一個套件時會重新下載。"),
        "pip": CacheInfo(explanation: "Python 的 pip 下載的套件包。已裝好的套件不受影響，之後安裝會重新下載。"),
        "pnpm": CacheInfo(explanation: "pnpm 的套件下載暫存。專案不受影響，之後安裝會重新下載。"),
        "Yarn": CacheInfo(explanation: "Yarn 的套件下載暫存。專案不受影響，之後安裝會重新下載。"),
        "node-gyp": CacheInfo(explanation: "編譯 Node.js 套件用的標頭檔，需要時會自動重新下載。"),
        "typescript": CacheInfo(explanation: "TypeScript 編輯器功能用的型別暫存，會自動重建。"),
        "ms-playwright": CacheInfo(explanation: "Playwright 自動化測試下載的瀏覽器。清掉後下次跑測試會重新下載，檔案很大。"),
        "go-build": CacheInfo(explanation: "Go 語言的編譯暫存，下次編譯會重建，第一次會慢一點。"),
        "CocoaPods": CacheInfo(explanation: "CocoaPods 下載的套件暫存。專案不受影響，之後安裝會重新下載。"),
        "org.swift.swiftpm": CacheInfo(explanation: "Swift 套件下載暫存。專案不受影響，之後編譯會重新下載。"),
        "JetBrains": CacheInfo(explanation: "JetBrains IDE（例如 IntelliJ、PyCharm）的索引暫存。重開專案時會重新建立索引，會慢一陣子。"),
        "com.microsoft.VSCode": CacheInfo(explanation: "VS Code 的暫存資料。設定和擴充功能不在這裡，不受影響。"),
        "claude-cli-nodejs": CacheInfo(explanation: "Claude Code 指令列工具的暫存和除錯紀錄。設定和對話紀錄不在這裡，不受影響。"),
        "Cypress": CacheInfo(explanation: "Cypress 測試工具的程式本體。清掉後要重新安裝 Cypress 才能再跑測試。"),
        "com.docker.docker": CacheInfo(explanation: "Docker Desktop 的暫存。你的映像檔和容器不在這裡，不受影響。"),

        // 瀏覽器
        "Google": CacheInfo(explanation: "Chrome 等 Google 軟體的網頁快取。書籤、密碼、登入狀態不在這裡；網站第一次開會慢一點。"),
        "com.google.Chrome": CacheInfo(explanation: "Chrome 的網頁快取。書籤、密碼、登入狀態不受影響。"),
        "com.microsoft.edgemac": CacheInfo(explanation: "Edge 的網頁快取。書籤、密碼、登入狀態不受影響。"),
        "Microsoft Edge": CacheInfo(explanation: "Edge 的網頁快取。書籤、密碼、登入狀態不受影響。"),
        "Firefox": CacheInfo(explanation: "Firefox 的網頁快取。書籤、密碼、登入狀態不受影響。"),
        "BraveSoftware": CacheInfo(explanation: "Brave 的網頁快取。書籤、密碼、登入狀態不受影響。"),
        "com.brave.Browser": CacheInfo(explanation: "Brave 的網頁快取。書籤、密碼、登入狀態不受影響。"),
        "company.thebrowser.Browser": CacheInfo(explanation: "Arc 的網頁快取。書籤、密碼、登入狀態不受影響。"),
        "com.operasoftware.Opera": CacheInfo(explanation: "Opera 的網頁快取。書籤、密碼、登入狀態不受影響。"),

        // 溝通、工作
        "com.tinyspeck.slackmacgap": CacheInfo(explanation: "Slack 的圖片和網頁暫存。訊息存在雲端，不受影響。"),
        "com.hnc.Discord": CacheInfo(explanation: "Discord 的圖片暫存。訊息存在雲端，不受影響。"),
        "us.zoom.xos": CacheInfo(explanation: "Zoom 的暫存。錄影檔不在這裡，不受影響。"),
        "com.microsoft.teams2": CacheInfo(explanation: "Teams 的暫存。訊息存在雲端，不受影響。"),
        "notion.id": CacheInfo(explanation: "Notion 的暫存。頁面存在雲端，不受影響。"),
        "com.figma.Desktop": CacheInfo(explanation: "Figma 的暫存。設計檔存在雲端，不受影響。"),
        "com.getdropbox.dropbox": CacheInfo(explanation: "Dropbox 程式本身的暫存。你同步的檔案不在這裡，不受影響。"),
        "com.microsoft.Word": CacheInfo(explanation: "Word 的暫存。你的文件不在這裡，不受影響。"),
        "com.microsoft.Excel": CacheInfo(explanation: "Excel 的暫存。你的檔案不在這裡，不受影響。"),
        "com.microsoft.Powerpoint": CacheInfo(explanation: "PowerPoint 的暫存。你的檔案不在這裡，不受影響。"),
        "Blender": CacheInfo(explanation: "Blender 的預覽和著色器暫存。清掉後第一次打開會慢一點，.blend 專案檔不受影響。"),
        "Adobe": CacheInfo(explanation: "Adobe App 的暫存。你的作品檔不在這裡，不受影響。"),
        "com.openai.chat": CacheInfo(explanation: "ChatGPT App 的暫存。對話存在雲端，不受影響。"),
        "com.anthropic.claudefordesktop": CacheInfo(explanation: "Claude App 的暫存。對話存在雲端，不受影響。"),

        // 可能有離線內容
        "com.spotify.client": CacheInfo(
            explanation: "Spotify 的音樂暫存，也可能包含你下載的離線歌曲。清掉不會壞，但離線歌曲要重新下載。",
            hasOfflineContent: true),
        "jp.naver.line.mac": CacheInfo(
            explanation: "LINE 的圖片和檔案暫存。很舊的聊天圖片如果伺服器已過期，清掉後可能就看不到了。",
            hasOfflineContent: true),
        "ru.keepcoder.Telegram": CacheInfo(
            explanation: "Telegram 看過的圖片和影片暫存。清掉後舊訊息的圖片和影片要重新從網路載入。",
            hasOfflineContent: true),
        "com.netease.163music": CacheInfo(
            explanation: "網易雲音樂的暫存，可能包含離線歌曲。清掉要重新下載。",
            hasOfflineContent: true),
        "com.tencent.QQMusicMac": CacheInfo(
            explanation: "QQ 音樂的暫存，可能包含離線歌曲。清掉要重新下載。",
            hasOfflineContent: true),
        "com.kkbox.KKBOX": CacheInfo(
            explanation: "KKBOX 的暫存，可能包含離線歌曲。清掉要重新下載。",
            hasOfflineContent: true),
    ]

    static let unknown = "沒有這個項目的說明。照 Apple 的規定，放在快取資料夾的東西 App 要能自己重建，清了通常沒事；不放心就先不勾。"

    static func info(for folderName: String) -> CacheInfo {
        if let info = byName[folderName] { return info }
        if folderName.hasSuffix(".ShipIt") || folderName.hasSuffix("-updater") {
            return CacheInfo(explanation: "App 自動更新時下載的更新檔。更新裝好之後就用不到了。")
        }
        return CacheInfo(explanation: unknown)
    }
}
