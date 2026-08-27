# MOMO-XMD Heroku Deployment

MOMO-XMD sasa hutumia **server-side pairing handoff**. User anaunganisha WhatsApp kwenye pairing page, kisha runtime ya bot huanza kwenye server moja kwa moja. **Usiombe, usinakili, na usiweke Session ID yoyote kwenye Heroku.**

## Heroku pairing flow

1. Fungua pairing page ya Heroku: <https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/>.
2. Weka namba ya WhatsApp ikiwa na country code na digits pekee.
3. Chagua pairing code au QR, kisha kamilisha hatua ya **Linked Devices** ndani ya WhatsApp.
4. Ukiona pairing imefanikiwa, server itaanzisha bot yenyewe. Browser hupokea cookie ya muda ya kufuatilia hali tu; haipokei credential ya WhatsApp.
5. Subiri ujumbe wa **CONNECTED**, kisha jaribu `.ping` au `.menu`. Bot itajaribu kufuata channels nne na kujiunga na group lililowekwa kwenye config kwa background.

## Current pairing links

| Service | URL |
|---|---|
| Heroku pairing2 | <https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/> |
| Render pairing | <https://momo-xmd-pairing.onrender.com/> |
| VPS pairing | <http://212.224.86.233:8000/> |
| Custom domain | <https://momo-xmd-pairing.duckdns.org/> |

## Deploying the bot runtime on Heroku

Heroku app ya bot inapaswa ku-deploy kutoka repository <https://github.com/MOMO47-tech/MOMO-XMD> na branch `heroku-bot-deploy` au `main`, kulingana na branch iliyochaguliwa kwenye app settings. Tumia Node.js buildpack na Procfile ya repository; usiongeze `SESSION_ID` kama config var kwa flow hii mpya.

Baada ya deploy, angalia health endpoint:

```text
https://YOUR-PAIRING-HOST/health
```

Jibu linalotarajiwa linaanza na `{"ok":true}`. Kama Heroku bado inarudisha `Cannot GET /health`, app haijachukua build mpya na inahitaji redeploy ya branch iliyochaguliwa.

## Security note

Pairing key, auth files na credentials hubaki upande wa server. Ujumbe wa connected na command responses haupaswi kuwa na Session ID. Ukiona Session ID kwenye browser, inbox au log ya public response, simamisha deployment hiyo na tumia pairing server iliyopo kwenye `pairing/server.js`.
