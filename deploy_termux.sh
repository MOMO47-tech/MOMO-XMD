#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_DIR="${MOMO_XMD_DIR:-$HOME/MOMO-XMD}"
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
npm install --omit=dev

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
    PORT="$PORT_NUMBER" NODE_ENV=production pm2 restart "$PROCESS_NAME" --update-env
  else
    PORT="$PORT_NUMBER" NODE_ENV=production pm2 start launcher.js --name "$PROCESS_NAME"
  fi
  pm2 save
  echo "MOMO-XMD imeanzishwa kupitia PM2 kwenye Termux."
else
  echo "PM2 haipo; code imesync. Anzisha sasa:"
  echo "PORT=$PORT_NUMBER NODE_ENV=production node launcher.js"
fi

printf '%s\n' "Health check baada ya kuanza: http://127.0.0.1:${PORT_NUMBER}/health"
printf '%s\n' "Pairing page ya Termux itategemea port na tunnel/domain uliyoisanidi." 
