# MOMO-XMD Pairing Deployment

Pairing service ya sasa inaendeshwa kupitia `launcher.js` na `pairing/server.js`. Inapokea namba kwenye pairing page, inatengeneza pairing code, na baada ya code kukubaliwa huhifadhi auth state upande wa server kisha huanzisha bot moja kwa moja.

## Runtime

```bash
npm install
NODE_ENV=production PORT=8000 node launcher.js
```

Procfile ya production ni:

```text
web: node launcher.js
```

## User flow

User anafungua pairing page, anaweka namba, anapokea code, na anaiingiza kwenye **WhatsApp → Linked Devices**. Baada ya pairing kukubaliwa, page hufuatilia hali kwa cookie ya HttpOnly na huonyesha connected status. Hakuna Session ID inayotumwa kwa browser, inbox au deployment form.

## Live pairing pages

| Server | URL |
|---|---|
| Heroku pairing1 | <https://momo-xmd-pairing-4086f8388df8.herokuapp.com/> |
| Heroku pairing2 | <https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/> |
| Render | <https://momo-xmd-pairing.onrender.com/> |

## Health checks

```text
GET /health
GET /healthz
GET /stats
```

`/health` na `/healthz` zinarudisha hali ya service. `/stats` inaonyesha pairing count ya service bila kuonyesha namba, auth path au Session ID.

## Post-connect behavior

`CONNECTED` hutumwa mara tu socket ya bot inapofunguka. Kazi za kufuata channels nne na kujiunga group moja zinaanzishwa kwa background baada ya notification hiyo, kwa hiyo hazipaswi kuzuia command dispatcher. Baada ya connected, owner anaweza kujaribu `.ping`, `.menu` na commands nyingine kulingana na permissions.

## Deployment note

Tumia repository <https://github.com/MOMO47-tech/MOMO-XMD> na branch `main` au `heroku-bot-deploy`. Heroku, Render na Termux zinapaswa ku-run `node launcher.js`; usitumie `node main.js` kwa flow hii ya sasa. Usiongeze `SESSION_ID` kwenye environment variables ya pairing deployment.
