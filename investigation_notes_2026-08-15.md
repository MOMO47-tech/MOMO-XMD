# MOMO-XMD Investigation Notes — 2026-08-15

## Heroku app `xmd` diagnosis

Heroku API showed app `xmd` exists and has `SESSION_ID` present. Dyno `web.1` is up and runs `node launcher.js`. Logs show:

- `[SESSION] Compact Session ID restored successfully`
- `MOMO-XMD Bot is now online!`
- `[ONLINE] Connected notification sent to owner 255760298574@s.whatsapp.net on attempt 1.`

The older app `momo-xmd-pairing` has no `SESSION_ID` and remains pairing-only. This proves the deployed bot app starts successfully and reaches WhatsApp connection-open. The likely inbox-delivery mismatch is that the notification is sent only to `ownerNumber` `255760298574`, while the user also uses `255765409584`. Incoming `.menu` attempts were not visible in the current log sample, so command receipt needs logging and both owner recipients should be supported.

Source: Heroku API and Logplex stream queried on 2026-08-15. App URL: https://xmd-b81c070dbf01.herokuapp.com/.
