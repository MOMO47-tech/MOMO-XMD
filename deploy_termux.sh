#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_DIR="${MOMO_XMD_DIR:-$HOME/MOMO-XMD}"
# main is the canonical branch. Override with MOMO_XMD_BRANCH only when a
# deployment is intentionally pinned to another branch.
BRANCH="${MOMO_XMD_BRANCH:-main}"
PORT_NUMBER="${MOMO_XMD_PORT:-8000}"
PROCESS_NAME="${MOMO_XMD_PROCESS_NAME:-MOMO-XMD}"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Repository haipo kwenye $REPO_DIR"
  echo "Clone kwanza: git clone https://github.com/MOMO47-tech/MOMO-XMD.git \"$REPO_DIR\""
  exit 1
fi

cd "$REPO_DIR"
git fetch --prune origin "$BRANCH"
# Use an explicit remote ref. This avoids ambiguity when Termux has another
# remote (for example heroku/main) with the same branch name.
git checkout -B "$BRANCH" "origin/$BRANCH"
BUILD_VERSION="$(git rev-parse HEAD)"
echo "Code iliyochaguliwa: ${BUILD_VERSION:0:7} kwenye branch $(git branch --show-current)"
# ffmpeg-static is intentionally Render-only; remove any stale failed Android install.
rm -rf node_modules/ffmpeg-static
if command -v pkg >/dev/null 2>&1 && ! command -v ffmpeg >/dev/null 2>&1; then
  echo 'ffmpeg haipo Termux; na-install package ya Termux...'
  pkg install -y ffmpeg
fi
if command -v pkg >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo 'python3 haipo Termux; na-install kwa yt-dlp...'
  pkg install -y python
  if command -v python >/dev/null 2>&1 && [ ! -e "$PREFIX/bin/python3" ]; then
    ln -s "$(command -v python)" "$PREFIX/bin/python3"
  fi
fi
npm install --omit=dev --omit=optional

if command -v pm2 >/dev/null 2>&1; then
  # Recreate the process so an old PM2 entry pointing to another checkout or
  # branch cannot keep serving stale bot code after a successful git reset.
  if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
    pm2 delete "$PROCESS_NAME" >/dev/null 2>&1 || true
  fi
  PORT="$PORT_NUMBER" NODE_ENV=production SOURCE_VERSION="$BUILD_VERSION" pm2 start "$REPO_DIR/launcher.js" \
    --name "$PROCESS_NAME" --cwd "$REPO_DIR" --update-env
  pm2 save
  echo "MOMO-XMD ime-update na ku-reload kupitia PM2 kwenye Termux."
else
  LOG_FILE="$REPO_DIR/momo-xmd.log"
  PID_FILE="$REPO_DIR/momo-xmd.pid"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    sleep 2
  fi
  echo "PM2 haipo; naanzisha bot kwa nohup. Logs: $LOG_FILE"
  (cd "$REPO_DIR" && PORT="$PORT_NUMBER" NODE_ENV=production SOURCE_VERSION="$BUILD_VERSION" nohup node launcher.js >> "$LOG_FILE" 2>&1 & echo $! > "$PID_FILE")
  echo "Bot PID: $(cat "$PID_FILE")"
fi

HEALTH_URL="http://127.0.0.1:${PORT_NUMBER}/health"
printf '%s\n' "Health check baada ya kuanza: $HEALTH_URL"
health_ok=0
for attempt in $(seq 1 30); do
  if health_body=$(curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null); then
    printf '%s\n' "$health_body"
    health_ok=1
    break
  fi
  printf 'Launcher bado inaanza... (%s/30)\n' "$attempt"
  sleep 1
done
if [ "$health_ok" -eq 1 ]; then
  printf '%s\n' "MOMO-XMD health iko sawa."
else
  printf '%s\n' "Health check imeshindwa baada ya sekunde 30; angalia logs kwa: pm2 logs $PROCESS_NAME --lines 80 --nostream"
  exit 1
fi
printf '%s\n' "Pairing page ya Termux itategemea port na tunnel/domain uliyoisanidi." 
