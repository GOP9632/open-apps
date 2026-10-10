#!/bin/sh
# 把首頁（index.html 和 apps.json）部署到 Netlify：https://anthony-apps.netlify.app
set -e
cd "$(dirname "$0")"
tmp=$(mktemp -d)
cp index.html apps.json "$tmp"/
netlify deploy --prod --dir "$tmp" --site 44664c1f-accc-4176-b28e-bd110b2ff437
rm -rf "$tmp"
