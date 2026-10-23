#!/usr/bin/env bash
# Regenerates the PWA icons in static/ from the source artwork.
#   icon.png          full-bleed logo  → regular icons and the Apple touch icon
#   icon-android.png  padded logo      → maskable icons (launchers crop to a circle/squircle)
# Requires ImageMagick 7 (`magick`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/static/icons"
mkdir -p "$OUT"

for size in 192 512; do
  magick "$ROOT/icon.png" -resize "${size}x${size}" -strip "$OUT/icon-$size.png"
  magick "$ROOT/icon-android.png" -resize "${size}x${size}" -strip "$OUT/maskable-$size.png"
done
magick "$ROOT/icon.png" -resize 180x180 -strip "$OUT/apple-touch-icon.png"

echo "Icons written to $OUT"
