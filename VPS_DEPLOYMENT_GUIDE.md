# MOMO-XMD VPS na Termux Guide

MOMO-XMD ina pairing server pamoja na bot handoff ndani ya `launcher.js`. Baada ya user kukubali pairing code, server huanzisha bot yenyewe na hutuma ujumbe wa **CONNECTED**. User hapati Session ID wala hatakiwi kuweka credential kwenye Heroku, Render au Termux.

## Kuweka code kwenye VPS

```bash
ssh root@212.224.86.233
cd /root
if [ -d MOMO-XMD/.git ]; then
  cd MOMO-XMD
  git fetch origin main
  git checkout main
  git pull --ff-only origin main
else
  git clone --branch main https://github.com/MOMO47-tech/MOMO-XMD.git
  cd MOMO-XMD
fi
npm install --omit=dev
```

Anzisha kwa majaribio:

```bash
cd /root/MOMO-XMD
PORT=8000 NODE_ENV=production node launcher.js
```

Pairing page ni <http://212.224.86.233:8000/> na health endpoint ni <http://212.224.86.233:8000/health>.

## Kuweka service iendelee na PM2

```bash
sudo npm install -g pm2
cd /root/MOMO-XMD
PORT=8000 NODE_ENV=production pm2 start launcher.js --name MOMO-XMD
pm2 save
pm2 startup
pm2 status
pm2 logs MOMO-XMD
```

Kama service tayari ipo, tumia:

```bash
cd /root/MOMO-XMD
git pull --ff-only origin main
npm install --omit=dev
pm2 restart MOMO-XMD --update-env
```

## Termux

```bash
pkg update -y
pkg install nodejs git -y
cd /data/data/com.termux/files/home
if [ -d MOMO-XMD/.git ]; then
  cd MOMO-XMD
  git fetch origin main
  git checkout main
  git pull --ff-only origin main
else
  git clone --branch main https://github.com/MOMO47-tech/MOMO-XMD.git
  cd MOMO-XMD
fi
npm install --omit=dev
NODE_ENV=production PORT=8000 node launcher.js
```

Termux inahitaji kubaki online ili pairing server na bot viendelee kufanya kazi. Kama unatumia PM2 ndani ya Termux, unaweza kuanzisha `node launcher.js` kupitia process manager unayo tayari badala ya kuendesha command hiyo kila mara.

## Pairing na post-connect automation

1. Fungua pairing page ya VPS, Heroku pairing1, Heroku pairing2 au Render.
2. Weka namba ya WhatsApp kwenye ukurasa wa pairing na pata code.
3. Ingiza code ndani ya **WhatsApp → Linked Devices → Link a device → Link with phone number instead**.
4. Baada ya code kukubaliwa, pairing page itaonyesha hali ya connection na account itapokea **CONNECTED**.
5. Bot huanza kujibu commands mara moja. Follow ya channels nne na join ya group huendelea kwa background, hivyo hazicheleweshi CONNECTED wala command dispatcher.

## Pairing links

| Server | URL |
|---|---|
| Heroku pairing1 | <https://momo-xmd-pairing-4086f8388df8.herokuapp.com/> |
| Heroku pairing2 | <https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/> |
| Render | <https://momo-xmd-pairing.onrender.com/> |
| VPS | <http://212.224.86.233:8000/> |
| DuckDNS | <https://momo-xmd-pairing.duckdns.org/> |

## Troubleshooting

| Tatizo | Hatua ya kuchukua |
|---|---|
| `/health` inarudisha 404 | Service hiyo bado ina build ya zamani; redeploy kutoka `main` au `heroku-bot-deploy`. |
| Code haionekani | Kagua `pm2 logs MOMO-XMD` au server log, kisha jaribu pairing request mpya. |
| CONNECTED haifiki | Hakikisha process ina-run `node launcher.js`, si `node main.js`, na socket imefika `open`. |
| Bot haijibu command | Jaribu `.ping` baada ya CONNECTED na kagua kama PM2 ina process moja tu ya launcher. |
| Follow/join haijakamilika | Kagua logs za post-connect automation na permissions za account; tasks hizi hazipaswi kuzuia commands. |
| Code ya zamani imegoma | Futa pairing attempt iliyokwisha muda, kisha anza pairing mpya; usitafute Session ID. |

## Muhimu wa usalama

Usiweke namba, pairing code au credential kwenye GitHub, README, public log, au ujumbe wa kawaida. Pairing page hutumia cookie ya HttpOnly kwa status polling; auth handoff inabaki server-side.
