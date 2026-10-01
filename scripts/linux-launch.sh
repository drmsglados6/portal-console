#!/bin/sh
# Resolve /usr/bin's update-alternatives symlink and AppImage launch paths.
APP_DIR=$(CDPATH='' cd -- "$(dirname -- "$(readlink -f -- "$0")")" && pwd) || exit 1
EXECUTABLE="$APP_DIR/portal-console-bin"

# Allow packaged-runtime checks and explicit Node-mode invocations through.
if [ "${ELECTRON_RUN_AS_NODE:-}" = 1 ]; then
  exec "$EXECUTABLE" "$@"
fi

HEADLESS=0
for argument in "$@"; do
  case "$argument" in
    --headless|--preset-list) HEADLESS=1 ;;
  esac
done
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  HEADLESS=1
fi

if [ "$HEADLESS" = 1 ]; then
  export ELECTRON_RUN_AS_NODE=1
  exec "$EXECUTABLE" "$APP_DIR/resources/app.asar/src/headless-entry.js" "$@"
fi
# GTK 3 is available on supported Ubuntu versions and avoids GTK 4 theme issues.
exec "$EXECUTABLE" --gtk-version=3 "$@"
