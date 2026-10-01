#!/bin/sh
# Install/update a deb, AppImage, .app, dmg or zip while recording its method.
set -eu
if [ "$#" -lt 1 ]; then
  echo 'Usage: sh install-unix.sh PACKAGE [INSTALL_DIRECTORY]' >&2
  exit 1
fi
SOURCE=$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")
TARGET=${2:-}
WORK=$(mktemp -d)
MOUNTED=0
cleanup() {
  if [ "$MOUNTED" = 1 ]; then hdiutil detach "$WORK/mount" >/dev/null || true; fi
  rm -rf -- "$WORK"
}
trap cleanup EXIT HUP INT TERM

case "$(uname -s):$SOURCE" in
  Linux:*.deb)
    if [ -n "$TARGET" ]; then echo 'deb installation paths are managed by dpkg.' >&2; exit 1; fi
    if [ -f "$HOME/.local/opt/portal-console/.portal-console-install.json" ]; then
      echo 'A helper-installed AppImage was found. Update it with an AppImage or remove that installation before changing methods.' >&2
      exit 1
    fi
    echo "Detected method: linux-deb; previous version: $(dpkg-query -W -f='${Version}' portal-console 2>/dev/null || echo none)"
    sudo apt install "$SOURCE"
    exit 0
    ;;
  Linux:*.AppImage)
    METHOD=linux-appimage
    if [ -z "$TARGET" ] && [ "$(dpkg-query -W -f='${db:Status-Status}' portal-console 2>/dev/null || true)" = installed ]; then
      echo 'An installed deb package was found. Update it with a deb package instead of changing methods.' >&2
      exit 1
    fi
    TARGET=${TARGET:-"$HOME/.local/opt/portal-console"}
    LOG=${XDG_STATE_HOME:-"$HOME/.local/state"}/portal-console/install.log
    mkdir -p "$TARGET"
    cp "$SOURCE" "$WORK/portal-console.AppImage"
    chmod +x "$WORK/portal-console.AppImage"
    # Extract to run the bundled Node runtime without requiring FUSE at install time.
    (cd "$WORK" && ./portal-console.AppImage --appimage-extract >/dev/null)
    RUNTIME="$WORK/squashfs-root/portal-console-bin"
    RESOURCES="$WORK/squashfs-root/resources"
    ;;
  Darwin:*)
    TARGET=${TARGET:-"$HOME/Applications"}
    LOG="$HOME/Library/Logs/portal-console/install.log"
    METHOD=mac-app
    case "$SOURCE" in
      *.app) APP="$SOURCE" ;;
      *.zip)
        METHOD=mac-zip
        ditto -x -k "$SOURCE" "$WORK/source"
        APP="$WORK/source/portal-console.app"
        ;;
      *.dmg)
        METHOD=mac-dmg
        mkdir "$WORK/mount"
        hdiutil attach -readonly -nobrowse -mountpoint "$WORK/mount" "$SOURCE" >/dev/null
        MOUNTED=1
        APP="$WORK/mount/portal-console.app"
        ;;
      *) echo 'Expected a portal-console .app, dmg or zip.' >&2; exit 1 ;;
    esac
    if [ ! -x "$APP/Contents/MacOS/portal-console" ]; then echo 'Portal Console app not found.' >&2; exit 1; fi
    mkdir -p "$TARGET"
    TARGET="$TARGET/portal-console.app"
    RUNTIME="$APP/Contents/MacOS/portal-console"
    RESOURCES="$APP/Contents/Resources"
    ;;
  *) echo 'Unsupported OS or package type.' >&2; exit 1 ;;
esac

# Inspect old metadata using the new package's bundled runtime, never a system Node.
PREVIOUS=$(ELECTRON_RUN_AS_NODE=1 "$RUNTIME" -e '
  const fs=require("fs"), path=require("path");
  const [resources,target]=process.argv.slice(1);
  const module=require(path.join(resources,"app.asar/src/installation.js"));
  const build=JSON.parse(fs.readFileSync(path.join(resources,"build-info.json"),"utf8"));
  if(build.appId!==module.APP_ID) throw new Error("Invalid package");
  const previous=module.readInstallation(target);
  process.stdout.write(previous ? previous.method : "unrecorded");
' "$RESOURCES" "$TARGET")
echo "Installer method: $METHOD; previous method: $PREVIOUS"
case "$METHOD:$PREVIOUS" in
  linux-appimage:unrecorded|linux-appimage:linux-appimage|mac-*:unrecorded|mac-*:mac-*) ;;
  *) echo 'Use the existing installation method to update this location.' >&2; exit 1 ;;
esac

if [ "$METHOD" = linux-appimage ]; then
  cp "$SOURCE" "$TARGET/portal-console.AppImage.new"
  chmod +x "$TARGET/portal-console.AppImage.new"
  mv -f "$TARGET/portal-console.AppImage.new" "$TARGET/portal-console.AppImage"
  ELECTRON_RUN_AS_NODE=1 "$RUNTIME" "$RESOURCES/app.asar/src/install-record-cli.js" "$TARGET" "$METHOD" "$LOG"
  mkdir -p "$HOME/.local/bin"
  ln -sfn "$TARGET/portal-console.AppImage" "$HOME/.local/bin/portal-console"
else
  LEGACY_VERSION=''
  LEGACY_METHOD=''
  # Validate legacy manually copied app bundles before replacing an existing app.
  if [ -d "$TARGET" ] && [ "$PREVIOUS" = unrecorded ]; then
    ID=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$TARGET/Contents/Info.plist")
    if [ "$ID" != science.aperture.portalconsole ]; then echo 'Existing app has another bundle identifier.' >&2; exit 1; fi
    LEGACY_VERSION=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$TARGET/Contents/Info.plist")
    LEGACY_METHOD=mac-app
  fi
  STAGE="$TARGET.new.$$"
  BACKUP="$TARGET.previous.$$"
  ditto "$APP" "$STAGE"
  if [ -f "$TARGET/.portal-console-install.json" ]; then cp "$TARGET/.portal-console-install.json" "$STAGE/.portal-console-install.json"; fi
  ELECTRON_RUN_AS_NODE=1 "$STAGE/Contents/MacOS/portal-console" "$STAGE/Contents/Resources/app.asar/src/install-record-cli.js" "$STAGE" "$METHOD" '' "$LEGACY_VERSION" "$LEGACY_METHOD"
  if [ -e "$TARGET" ]; then mv "$TARGET" "$BACKUP"; fi
  if mv "$STAGE" "$TARGET"; then
    if [ -d "$BACKUP" ]; then rm -rf -- "$BACKUP"; fi
  else
    if [ -d "$BACKUP" ]; then mv "$BACKUP" "$TARGET"; fi
    exit 1
  fi
  mkdir -p "$(dirname -- "$LOG")"
  cat "$TARGET/.portal-console-install.json" >> "$LOG"
  printf '\n' >> "$LOG"
fi
echo "Installed to $TARGET; log: $LOG"
