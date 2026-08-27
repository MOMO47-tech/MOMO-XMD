# MOMO-XMD Deployment Instructions

MOMO-XMD hutumia Node.js, `launcher.js`, pairing server ya Express na **server-side handoff**. User anapair WhatsApp kwenye pairing page; bot huanza baada ya connection bila user kupewa Session ID.

## Termux: mazingira ya sasa ya bot

Termux ndiyo mazingira yanayotumika kuendesha bot. Kwanza sakinisha Node.js na Git ndani ya Termux:

```bash
pkg update -y
pkg install nodejs git -y
cd "$HOME"
git clone https://github.com/MOMO47-tech/MOMO-XMD.git
cd MOMO-XMD
npm install --omit=dev
```

Anzisha launcher:

```bash
NODE_ENV=production PORT=8000 node launcher.js
```

Kwa Termux inayotakiwa kubaki ikiendelea, unaweza kutumia `tmux` au process manager uliyonayo. Kama `pm2` imewekwa:

```bash
npm install -g pm2
PORT=8000 NODE_ENV=production pm2 start launcher.js --name MOMO-XMD
pm2 save
pm2 logs MOMO-XMD
```

Script ya kusync updates iko kwenye `deploy_termux.sh`:

```bash
cd "$HOME/MOMO-XMD"
chmod +x deploy_termux.sh
./deploy_termux.sh
```

Health check ya Termux ni `http://127.0.0.1:8000/health`. Ili user wa nje afikie Termux, tumia tunnel au domain yako iliyo hai; usitumie IP ya VPS iliyokwisha muda.

## Pairing services

Pairing pages zinazotumika ni hizi:

| Service | Link |
|---|---|
| Heroku pairing 1 | <https://momo-xmd-pairing-4086f8388df8.herokuapp.com/> |
| Heroku pairing 2 | <https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/> |
| Render | <https://momo-xmd-pairing.onrender.com/> |
| Custom domain | <https://momo-xmd-pairing.duckdns.org/> |

Heroku na Render hutumia repository <https://github.com/MOMO47-tech/MOMO-XMD>, branch `main` au `heroku-bot-deploy`, Node.js buildpack, na Procfile yenye `web: node launcher.js`. Usiongeze `SESSION_ID` kwenye pairing deployment.

## Pairing ya user

1. Fungua pairing link yoyote iliyo hai.
2. Weka namba kwenye pairing page au tumia QR.
3. Kamilisha **WhatsApp → Linked Devices → Link a device**.
4. Browser itapoll status kupitia cookie ya HttpOnly; Session ID haionyeshwi.
5. Baada ya WhatsApp kukubali code, bot hutuma ujumbe wa **CONNECTED** kwanza.
6. Mara baada ya hapo bot huanza kujibu commands; kufuata channels nne na kujiunga group moja hufanyika background bila kuzuia CONNECTED au command handling.

## Kusync code mpya Termux

```bash
cd "$HOME/MOMO-XMD"
git fetch origin
git checkout main
git pull --ff-only origin main
npm install --omit=dev
```

Kama unatumia PM2:

```bash
PORT=8000 NODE_ENV=production pm2 restart MOMO-XMD --update-env
```

## Troubleshooting

| Tatizo | Hatua |
|---|---|
| Pairing code haionekani | Hakikisha page ina HTTP 200, refresh page na jaribu request mpya baada ya muda mfupi. |
| `Cannot GET /health` | Deployment ina build ya zamani; redeploy branch mpya ya repository. |
| `CONNECTED` haifiki | Kagua runtime logs na connection status; channel/group tasks hazipaswi kuzuia notification. |
| Bot haijibu command | Thibitisha socket imefika `open`, subiri CONNECTED, kisha jaribu `.ping`. |
| Channel/group haijaunganishwa | Kagua logs za post-connect automation na permissions za account. |
| Termux process inazimika | Weka Termux online, zima battery optimization kwa Termux, na tumia `pm2` au `tmux`. |
| Session imepotea | Pair tena kupitia pairing page; usitafute au kuomba Session ID. |

## Muhimu

Prefix ya bot ni `.` na jina la bot ni **MOMO-XMD**. Owner ni **MOMO47**. Commands za owner zinabaki owner-only; commands za group zinahitaji group admin. Pairing keys na auth files zinapaswa kubaki upande wa runtime na hazipaswi kutumwa kwenye browser, inbox, README au public responses.
