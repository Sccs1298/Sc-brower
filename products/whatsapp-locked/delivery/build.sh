#!/bin/sh
# Assemble the customer page into <repo>/out/members/ (page, fonts, PDFs, videos, video posters), ready to upload.
set -e
R="$(cd "$(dirname "$0")/../../.." && pwd)"; O="$R/out/members"; mkdir -p "$O"
cp "$R/products/whatsapp-locked/delivery/members.html" "$O/index.html"
cp "$R/docs/Heebo-400.woff2" "$R/docs/Heebo-800.woff2" "$O/"
cp "$R/out/guide.pdf" "$R/out/bonus-parents.pdf" "$O/"
i=1
for v in v1-whatsapp v2-scams v3-gmail v4-instagram v5-phone v6-passwords; do
  cp "$R/out/videos/$v.mp4" "$O/"
  ffmpeg -v error -y -ss 6 -i "$R/out/videos/$v.mp4" -frames:v 1 -vf scale=540:-2 -q:v 5 "$O/p$i.jpg"
  i=$((i+1))
done
du -sh "$O"
