# MOMO-XMD pairing2 diagnosis — 2026-08-27

## Evidence

- Live pairing UI: https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/
- Heroku log stream showed repeated polling for session `momo_1787857541375_omdv0n`.
- Direct status response after the user's pairing attempt:

```json
{"status":"error","number":"255765409584","createdAt":1787857541375,"updatedAt":1787857571119,"code":"KFAFGQEQ","attempt":1,"proxy":"direct","reconnect":1,"message":"WhatsApp connection closed (503)"}
```

## Code observations

- `pairing/server.js` currently treats only 515, 408, restartRequired, and timedOut as retryable; 503 is not retryable, so it immediately marks the session as error.
- On `connection === 'open'`, the pairing server calls `saveCreds()`, sends the progress message, closes the pairing socket, and starts the bot asynchronously from the temporary auth directory.
- `lib/bot.js` sends the connected notice to `sock.user.id` directly. Older working code normalized this to `sock.user.id.split(':')[0] + '@s.whatsapp.net'`, which is safer for a linked-device JID.
- `lib/bot.js` awaits post-connect channel/group operations before sending the CONNECTED message; these operations can delay or throw in some Baileys builds.
- `launcher.js` correctly registers `setPairedBotStarter((authDir) => startBot({ authDir, sessionId: null }))` before mounting the pairing server.

## Immediate diagnosis

The observed attempt failed before reaching the handoff because WhatsApp returned status 503 and the retry policy did not include 503. A separate robustness issue can suppress/delay the CONNECTED message after a successful handoff: the notification target should be normalized and post-connect follow/join actions should be best-effort and not block readiness/notification.

Do not change menu/command content or pairing UI while fixing this flow.
