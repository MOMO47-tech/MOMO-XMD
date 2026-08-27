#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${MOMO_XMD_REMOTE_HOST:-root@212.224.86.233}"
REMOTE_DIR="${MOMO_XMD_REMOTE_DIR:-/root/MOMO-XMD}"
BRANCH="${MOMO_XMD_BRANCH:-main}"

printf 'Syncing MOMO-XMD on %s from branch %s...\n' "$REMOTE_HOST" "$BRANCH"
ssh -o StrictHostKeyChecking=accept-new "$REMOTE_HOST" "
  set -e
  if [ ! -d '$REMOTE_DIR/.git' ]; then
    mkdir -p \"$(dirname '$REMOTE_DIR')\"
    git clone --branch '$BRANCH' https://github.com/MOMO47-tech/MOMO-XMD.git '$REMOTE_DIR'
  fi
  cd '$REMOTE_DIR'
  git fetch origin '$BRANCH'
  git checkout '$BRANCH'
  git pull --ff-only origin '$BRANCH'
  npm install --omit=dev
  if command -v pm2 >/dev/null 2>&1; then
    if pm2 describe MOMO-XMD >/dev/null 2>&1; then
      pm2 restart MOMO-XMD --update-env
    else
      PORT=8000 NODE_ENV=production pm2 start launcher.js --name MOMO-XMD
      pm2 save
    fi
  else
    echo 'PM2 haipo; code imesync lakini launcher haikuanza moja kwa moja.'
  fi
"

printf 'MOMO-XMD sync completed. Pair kupitia pairing page; bot itaanza baada ya code kukubaliwa.\n'
