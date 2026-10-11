#!/bin/bash
# 編譯並打包成 build/Mop.app
set -euo pipefail
cd "$(dirname "$0")"

if ! xcrun --find swift >/dev/null 2>&1; then
  echo "找不到 Swift。請先在終端機執行：xcode-select --install"
  exit 1
fi

swift build -c release
BIN_DIR="$(swift build -c release --show-bin-path)"
APP="build/Mop.app"
rm -rf build/MacCleaner.app   # 舊名字

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/MacCleaner" "$APP/Contents/MacOS/MacCleaner"
cp Info.plist "$APP/Contents/Info.plist"
if [ -f Resources/AppIcon.icns ]; then
  cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
fi
# 簽章要每次都一樣，macOS 才會記得你給過的權限（資料夾、完整磁碟取用）。
# 臨時簽章（--sign -）每次編譯身分都會變，系統會當成新的 App 重新問。
# 順序：環境變數 MOP_SIGN_IDENTITY → 鑰匙圈裡的 Apple Development 憑證 → 自建的「Mop Local Signing」→ 臨時簽章
IDENTITY="${MOP_SIGN_IDENTITY:-}"
if [ -z "$IDENTITY" ]; then
  IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | awk '/"Apple Development:/ {print $2; exit}')"
fi
if [ -z "$IDENTITY" ] && security find-identity -v -p codesigning 2>/dev/null | grep -q '"Mop Local Signing"'; then
  IDENTITY="Mop Local Signing"
fi
if [ -n "$IDENTITY" ]; then
  codesign --force --sign "$IDENTITY" --identifier io.github.gop9632.maccleaner "$APP" >/dev/null
  echo "簽章：$(codesign -dvv "$APP" 2>&1 | awk -F= '/^Authority/ {print $2; exit}')"
else
  codesign --force --sign - --identifier io.github.gop9632.maccleaner "$APP" >/dev/null
  echo "注意：找不到固定的簽章憑證，用臨時簽章。每次重新編譯後 macOS 都會重新問權限。"
fi

echo "完成：$(pwd)/$APP"
echo "打開它：open \"$(pwd)/$APP\""
