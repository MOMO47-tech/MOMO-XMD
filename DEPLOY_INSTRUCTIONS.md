# MOMO-XMD Deployment Instructions

MOMO-XMD hutumia Node.js, `launcher.js`, pairing server ya Express, na **server-side handoff**. User anapair WhatsApp kwenye pairing page; bot huanza baada ya connection bila user kupewa Session ID.

## VPS pairing server

```bash
cd /root
 git clone https://github.com/MOMO47-tech/MOMO-XMD.git
cd MOMO-XMD
npm install
PORT=8000 NODE_ENV=production node launcher.js
```

Kwa service ya kudumu, tumia process manager:

```bash
npm install -g pm2
cd /root/MOMO-XMD
PORT=8000 NODE_ENV=production pm2 start launcher.js --name MOMO-XMD
pm2 save
pm2 startup
```

Pairing page ya VPS ni <http://212.224.86.233:8000/>. Health check ni:

```text
http://212.224.86.233:8000/health
```

## Heroku

1. Unganisha app na repository <https://github.com/MOMO47-tech/MOMO-XMD>.
2. Chagua branch `heroku-bot-deploy` au `main`.
3. Tumia Node.js buildpack na Procfile iliyopo kwenye repository.
4. Start command ni `node launcher.js` kupitia Procfile.
5. Usiongeze `SESSION_ID`; pairing server na bot hutumia handoff ya server-side.
6. Thibitisha `https://YOUR-HOST/health` inarudisha `{"ok":true}`.

Pairing2 ya Heroku: <https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/>.

## Render

1. Tengeneza Web Service kutoka repository <https://github.com/MOMO47-tech/MOMO-XMD>.
2. Tumia branch inayotaka ku-deploy, kwa kawaida `main`.
3. Build command: `npm install`.
4. Start command: `node launcher.js`.
5. Usiongeze `SESSION_ID` au kuomba credential kwa user.
6. Thibitisha endpoint ya health baada ya deploy.

Render pairing page: <https://momo-xmd-pairing.onrender.com/>.

## Pairing ya user

1. Fungua moja ya pairing links zilizo kwenye README.
2. Weka namba kwenye pairing page, au tumia QR.
3. Kamilisha **WhatsApp → Linked Devices → Link a device**.
4. Browser itaonyesha hali ya pairing kupitia cookie ya HttpOnly, si credential ya WhatsApp.
5. Bot itaanza yenyewe, itatuma **CONNECTED**, kisha itajaribu kufuata channels nne na kujiunga na group iliyowekwa kwenye config.

## KataBAMP/Termux

```bash
pkg update -y
pkg install nodejs git -y
cd /data/data/com.termux/files/home
git clone https://github.com/MOMO47-tech/MOMO-XMD.git
cd MOMO-XMD
npm install
NODE_ENV=production PORT=8000 node launcher.js
```

## Kusync code mpya

```bash
cd /root/MOMO-XMD
git fetch origin
git checkout main
git pull --ff-only origin main
npm install
pm2 restart MOMO-XMD --update-env
```

## Troubleshooting

| Tatizo | Hatua |
|---|---|
| Pairing code haionekani | Hakikisha pairing page ina HTTP 200 na jaribu baada ya sekunde chache. |
| `Cannot GET /health` | Deployment ina build ya zamani; redeploy branch mpya ya repository. |
| `CONNECTED` haifiki | Kagua logs za runtime na connection status; optional channel/group tasks hazipaswi kuzuia notification. |
| Bot haijibu command | Thibitisha kuwa socket imefika `open`, kisha jaribu `.ping`; commands za owner zinahitaji owner account. |
| Channel/group haijaunganishwa | Kagua permissions za account na logs za post-connect automation. |
| Session imepotea | Pair tena kupitia pairing page; usitafute au kuomba credential ya Session ID. |

## Muhimu

Prefix ya bot ni `.` na jina la bot ni **MOMO-XMD**. Owner ni **MOMO47**. Commands za owner zinabaki owner-only; commands za group zinahitaji group admin. Pairing keys na auth files zinapaswa kubaki upande wa server na hazipaswi kutumwa kwenye browser, inbox, README au logs za public response.
