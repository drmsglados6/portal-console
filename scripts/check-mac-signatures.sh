#!/bin/bash
set -eu
APP=$1
ZIP=$2
DMG=$3
WORK=$(mktemp -d)
MOUNTED=0
cleanup() {
  if [ "$MOUNTED" = 1 ]; then hdiutil detach "$WORK/mount" >/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=2 "$APP" 2>&1
ditto -x -k "$ZIP" "$WORK/zip"
codesign --verify --deep --strict --verbose=2 "$WORK/zip/portal-console.app"
mkdir "$WORK/mount"
hdiutil attach -readonly -nobrowse -mountpoint "$WORK/mount" "$DMG" >/dev/null
MOUNTED=1
codesign --verify --deep --strict --verbose=2 "$WORK/mount/portal-console.app"
echo 'Unpacked app, ZIP and DMG signatures are structurally valid.'
echo 'This is ad-hoc signing, not Developer ID signing or Apple notarization.'
