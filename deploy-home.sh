#!/bin/sh
# 把首頁（index.html、apps.json、圖示和 manifest）部署到 Netlify：https://anthony-apps.netlify.app
set -e
cd "$(dirname "$0")"
tmp=$(mktemp -d)
cp index.html apps.json _redirects site.webmanifest icon.svg apple-touch-icon.png icon-192.png icon-512.png "$tmp"/
netlify deploy --prod --dir "$tmp" --site 44664c1f-accc-4176-b28e-bd110b2ff437
rm -rf "$tmp"
