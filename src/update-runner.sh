#!/bin/sh
# Runs from a temporary directory, independently of the app being replaced.
set -eu
PARENT=$1 METHOD=$2 PACKAGE=$3 TARGET=$4 HELPER=$5 WORK=$6 LOG=$7 EXPECTED=$8
STAGE=''
mkdir -p "$(dirname -- "$LOG")"
finish() {
  status=$?
  if [ -n "$STAGE" ]; then rm -f -- "$STAGE"; fi
  if [ "$status" -eq 0 ]; then
    echo 'Update complete. Start pconsole again.' | tee -a "$LOG"
    rm -rf -- "$WORK"
  else
    echo "Update failed ($status). Details: $LOG" >&2
    cat "$LOG" >&2
  fi
}
trap finish EXIT
echo "Updating Portal Console ($METHOD). Other Portal Console windows should be closed." | tee -a "$LOG"
: > "$WORK/started"
attempt=0
while [ "$PARENT" -gt 0 ] && kill -0 "$PARENT" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then echo 'Application did not close; update cancelled.' >> "$LOG"; exit 1; fi
  sleep 1
done
if command -v sha256sum >/dev/null 2>&1; then ACTUAL=$(sha256sum "$PACKAGE")
else ACTUAL=$(shasum -a 256 "$PACKAGE"); fi
if [ "${ACTUAL%% *}" != "$EXPECTED" ]; then echo 'SHA-256 verification failed.' >> "$LOG"; exit 1; fi
case "$METHOD" in
  linux-deb)
    sudo apt-get install -y "$PACKAGE" >> "$LOG" 2>&1
    ;;
  linux-appimage)
    sh "$HELPER" "$PACKAGE" "$TARGET" >> "$LOG" 2>&1
    ;;
  linux-appimage-portable)
    STAGE=$(mktemp "${TARGET}.update.XXXXXX")
    cp "$PACKAGE" "$STAGE"
    chmod +x "$STAGE"
    mv -f -- "$STAGE" "$TARGET"
    STAGE=''
    ;;
  mac-app|mac-dmg|mac-zip)
    sh "$HELPER" "$PACKAGE" "$(dirname -- "$TARGET")" >> "$LOG" 2>&1
    ;;
  *) echo "Unsupported update method: $METHOD" >> "$LOG"; exit 1 ;;
esac
