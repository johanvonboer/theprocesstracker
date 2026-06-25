#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src-tauri/gen/android/app/build/outputs/native-debug-symbols/release"
TMP="$(mktemp -d)"

trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/arm64-v8a" "$TMP/armeabi-v7a" "$OUT"

cp "$ROOT/src-tauri/target/aarch64-linux-android/release/libtheprocesstracker_lib.so" "$TMP/arm64-v8a/"
cp "$ROOT/src-tauri/target/armv7-linux-androideabi/release/libtheprocesstracker_lib.so" "$TMP/armeabi-v7a/"

cd "$TMP"
zip -r "$OUT/native-debug-symbols.zip" arm64-v8a armeabi-v7a

echo "Symbols: $OUT/native-debug-symbols.zip"
