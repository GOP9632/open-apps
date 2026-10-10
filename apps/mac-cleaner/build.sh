#!/bin/bash
# 編譯並打包成 build/MacCleaner.app
set -euo pipefail
cd "$(dirname "$0")"

if ! xcrun --find swift >/dev/null 2>&1; then
  echo "找不到 Swift。請先在終端機執行：xcode-select --install"
  exit 1
fi

swift build -c release
BIN_DIR="$(swift build -c release --show-bin-path)"
APP="build/MacCleaner.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/MacCleaner" "$APP/Contents/MacOS/MacCleaner"
cp Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP" >/dev/null

echo "完成：$(pwd)/$APP"
echo "打開它：open \"$(pwd)/$APP\""
