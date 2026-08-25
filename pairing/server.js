const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { Mutex } = require('async-mutex');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 8000);
const logger = pino({ level: 'info' });
const mutex = new Mutex();
const sessions = new Map();

const PROXY_LIST = [
    "http://hfhlmfza:mbljtr3cnwzm@31.59.20.176:6754",
    "http://hfhlmfza:mbljtr3cnwzm@31.56.127.193:7684",
    "http://hfhlmfza:mbljtr3cnwzm@45.38.107.97:6014",
    "http://hfhlmfza:mbljtr3cnwzm@198.105.121.200:6462",
    "http://hfhlmfza:mbljtr3cnwzm@64.137.96.74:6641",
    "http://hfhlmfza:mbljtr3cnwzm@198.23.243.226:6361",
    "http://hfhlmfza:mbljtr3cnwzm@38.154.185.97:6370",
    "http://hfhlmfza:mbljtr3cnwzm@84.247.60.125:6095",
    "http://hfhlmfza:mbljtr3cnwzm@142.111.67.146:5611",
    "http://hfhlmfza:mbljtr3cnwzm@191.96.254.138:6185"
];

function getProxyAgent(proxyUrl) {
    if (!proxyUrl) return null;
    try {
        if (proxyUrl.startsWith('socks')) return new SocksProxyAgent(proxyUrl);
        if (proxyUrl.startsWith('https')) return new HttpsProxyAgent(proxyUrl);
        return new HttpProxyAgent(proxyUrl);
    } catch (e) { return null; }
}

const STATS_FILE = path.join(__dirname, 'stats.json');
const getStats = () => {
    try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
    catch { return { total_pairings: 0, active_sessions: 0 }; }
};
const incrementStats = () => {
    const stats = getStats();
    stats.total_pairings++;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
};

const REGISTRY_DIR = path.join(__dirname, 'session-registry');
if (!fs.existsSync(REGISTRY_DIR)) fs.mkdirSync(REGISTRY_DIR, { recursive: true });

function saveSessionRegistry(sessionId, authDir, number) {
    const files = {};
    const readDir = (dir, base = '') => {
        fs.readdirSync(dir).forEach(file => {
            const fullPath = path.join(dir, file);
            const relPath = path.join(base, file);
            if (fs.statSync(fullPath).isDirectory()) readDir(fullPath, relPath);
            else files[relPath] = fs.readFileSync(fullPath).toString('base64');
        });
    };
    readDir(authDir);
    fs.writeFileSync(path.join(REGISTRY_DIR, `${sessionId}.json`), JSON.stringify({ number, files }));
}

app.get('/session-registry/:id', (req, res) => {
    const p = path.join(REGISTRY_DIR, `${req.params.id}.json`);
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).json({ error: 'Not found' });
});

app.post('/pair', async (req, res) => {
    const release = await mutex.acquire();
    try {
        let { number } = req.body;
        if (!number) return res.status(400).json({ success: false, error: 'Number required' });
        number = number.replace(/[^0-9]/g, '');
        
        const sessionKey = `momo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        sessions.set(sessionKey, { status: 'connecting', number });

        const strategies = [null, ...PROXY_LIST.sort(() => 0.5 - Math.random()).slice(0, 2)];
        let lastStrategyError = null;

        for (const proxyUrl of strategies) {
            let sock = null;
            let codeRequested = false;
            let finished = false;
            let pairingSuccess = false;
            const authDir = path.join(__dirname, `temp_${sessionKey}`);
            
            try {
                const { state, saveCreds } = await useMultiFileAuthState(authDir);
                let version = [2, 2413, 51];
                try {
                    const latest = await fetchLatestBaileysVersion();
                    if (Array.isArray(latest?.version)) version = latest.version;
                } catch (error) {}
                
                const createSocket = () => {
                    const s = makeWASocket({
                        version,
                        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
                        browser: ["Mac OS", "Safari", "17.4.1"],
                        agent: getProxyAgent(proxyUrl),
                        printQRInTerminal: false,
                        logger: pino({ level: 'silent' }),
                        connectTimeoutMs: 60_000,
                        markOnlineOnConnect: true
                    });

                    s.ev.on('creds.update', saveCreds);
                    s.ev.on('connection.update', async (up) => {
                        const { connection, lastDisconnect, qr } = up;
                        if (connection === 'open') {
                            finished = true;
                            pairingSuccess = true;
                            const sessionId = `MOMO-XMD~${Buffer.from(Math.random().toString()).toString('hex').slice(0, 12).toUpperCase()}`;
                            saveSessionRegistry(sessionId, authDir, number);
                            
                            const recipientJid = `${number}@s.whatsapp.net`;
                            const inboxMessages = [
                                `*⚡ Generating session...*`,
                                sessionId,
                                `*MOMO-XMD CONNECTED SUCCESSFULLY!* ☠️\n\n*Session ID:*\n\n${sessionId}\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`
                            ];
                            
                            for (const msg of inboxMessages) {
                                await s.sendMessage(recipientJid, { text: msg });
                                await delay(1000);
                            }
                            
                            updateSession(sessionKey, { status: 'connected', sessionId });
                            incrementStats();
                            setTimeout(() => { try { s.end(); } catch {}; fs.rmSync(authDir, { recursive: true, force: true }); }, 10000);
                        }
                        if (qr && !codeRequested) {
                            codeRequested = true;
                            const code = await s.requestPairingCode(number);
                            updateSession(sessionKey, { status: 'awaiting_link', code });
                        }
                        if (connection === 'close') {
                            const code = lastDisconnect?.error?.output?.statusCode;
                            if (!finished && (code === DisconnectReason.restartRequired || code === 515)) {
                                sock = createSocket();
                            } else if (!finished) {
                                finished = true;
                            }
                        }
                    });
                    // Pairing-code mode does not always emit a QR update. Request the
                    // code after the socket has had a moment to initialize instead of
                    // waiting for `qr`, while keeping the existing guard against duplicates.
                    if (!state.creds.registered) {
                        setTimeout(async () => {
                            if (codeRequested || finished) return;
                            try {
                                codeRequested = true;
                                const code = await s.requestPairingCode(number);
                                updateSession(sessionKey, { status: 'awaiting_link', code });
                            } catch (error) {
                                codeRequested = false;
                                updateSession(sessionKey, { status: 'error', message: error.message });
                            }
                        }, 2500);
                    }
                    return s;
                };

                sock = createSocket();
                // Return immediately so the browser can poll while WhatsApp obtains the code.
                return res.json({ success: true, sessionKey });
            } catch (error) {
                lastStrategyError = error;
                try { sock?.end(); } catch {}; fs.rmSync(authDir, { recursive: true, force: true });
            }
        }
        throw lastStrategyError || new Error('All strategies failed');
    } catch (error) {
        updateSession(sessionKey, { status: 'error', message: error.message });
        return res.status(500).json({ success: false, error: error.message });
    } finally { release(); }
});

function updateSession(key, data) {
    const s = sessions.get(key);
    if (s) sessions.set(key, { ...s, ...data, updatedAt: Date.now() });
}

app.get('/session-status/:key', (req, res) => {
    const s = sessions.get(req.params.key);
    if (!s) return res.status(404).json({ status: 'not_found' });
    res.json(s);
});

app.get('/stats', (req, res) => res.json(getStats()));

if (require.main === module) {
    app.listen(PORT, () => console.log(`MOMO-XMD pairing server started on port ${PORT}`));
}

module.exports = app;
