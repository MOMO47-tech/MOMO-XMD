const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');
const { Mutex } = require('async-mutex');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    delay
} = require('@whiskeysockets/baileys');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const PORT = Number(process.env.PORT || 8000);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const msgRetryCounterCache = new NodeCache();
const pairingMutex = new Mutex();
const sessions = new Map();
const STATS_FILE = path.join(__dirname, 'stats.json');
const SESSION_REGISTRY_FILE = path.join(__dirname, 'session_registry.json');
const SESSION_PREFIX = 'MOMO-XMD~';
const REGISTRY_ORIGIN = process.env.SESSION_REGISTRY_ORIGIN === 'H' || process.env.HEROKU_APP_NAME ? 'H' : 'V';
const CODE_TIMEOUT_MS = 60_000;
const LINK_TIMEOUT_MS = 5 * 60_000;
const MAX_CODE_ATTEMPTS = 3;
const MAX_RESTARTS = 2;

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

if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ totalPairings: 0 }));
}

function getStats() {
    try {
        let count = 0;
        if (fs.existsSync(SESSION_REGISTRY_FILE)) {
            const registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8'));
            count = Object.keys(registry).length;
        }
        let persistentCount = 0;
        if (fs.existsSync(STATS_FILE)) {
            const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            persistentCount = Number(stats.totalPairings || 0);
        }
        return { totalPairings: Math.max(count, persistentCount) };
    } catch (e) { return { totalPairings: 0 }; }
}

function incrementStats() {
    try {
        let stats = { totalPairings: 0 };
        if (fs.existsSync(STATS_FILE)) {
            stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
        const registry = readSessionRegistry();
        const registryCount = Object.keys(registry).length;
        stats.totalPairings = Math.max(registryCount, Number(stats.totalPairings || 0) + 1);
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
        return stats.totalPairings;
    } catch (e) { return 0; }
}

function readSessionRegistry() {
    try {
        if (!fs.existsSync(SESSION_REGISTRY_FILE)) return {};
        return JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8')) || {};
    } catch (error) { return {}; }
}

function writeSessionRegistry(registry) {
    const tempFile = `${SESSION_REGISTRY_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(registry));
    fs.renameSync(tempFile, SESSION_REGISTRY_FILE);
}

function createCompactSessionId() {
    const randomPart = Array.from({ length: 22 }, () => Math.floor(Math.random() * 36).toString(36))
        .join('').toUpperCase();
    return `${SESSION_PREFIX}${REGISTRY_ORIGIN}${randomPart}`;
}

function exportAuthFiles(authDir) {
    const files = {};
    const walk = (dir) => {
        for (const f of fs.readdirSync(dir)) {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) walk(p);
            else files[path.relative(authDir, p)] = fs.readFileSync(p).toString('base64');
        }
    };
    walk(authDir);
    return files;
}

function saveSessionRegistry(sessionId, authDir, number) {
    const registry = readSessionRegistry();
    registry[sessionId] = {
        fullNumber: number,
        files: exportAuthFiles(authDir),
        createdAt: Date.now()
    };
    writeSessionRegistry(registry);
}

function removeAuthFolder(dir, timeoutMs) {
    setTimeout(() => {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }, timeoutMs);
}

function cleanNumber(number) {
    return String(number || '').replace(/[^0-9]/g, '');
}

function maskNumber(number) {
    const s = String(number);
    return s.length > 7 ? `${s.slice(0, 3)}****${s.slice(-3)}` : s;
}

function updateSession(key, update) {
    const existing = sessions.get(key) || {};
    sessions.set(key, { ...existing, ...update, updatedAt: Date.now() });
}

function getDisconnectCode(error) {
    return error?.output?.statusCode || error?.statusCode;
}

function getDisconnectMessage(error) {
    return error?.message || 'unknown connection error';
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/session-registry/:sessionId', (req, res) => {
    try {
        const token = String(req.params.sessionId || '');
        const entry = readSessionRegistry()[token];
        if (!entry) return res.status(404).json({ error: 'Session ID not found' });
        res.json({ sessionId: token, fullNumber: entry.fullNumber, files: entry.files });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/session-registry/:sessionId', express.json({ limit: '10mb' }), (req, res) => {
    try {
        const token = String(req.params.sessionId || '');
        const files = req.body?.files;
        if (!files) return res.status(400).json({ error: 'No files' });
        const registry = readSessionRegistry();
        const existing = registry[token] || { fullNumber: 'owner', createdAt: Date.now() };
        registry[token] = { ...existing, files, updatedAt: Date.now() };
        writeSessionRegistry(registry);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/pair', async (req, res) => {
    const number = cleanNumber(req.body?.number);
    if (!/^\d{8,15}$/.test(number)) return res.status(400).json({ success: false, error: 'Invalid number' });

    const release = await pairingMutex.acquire();
    const sessionKey = `momo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const authDir = path.join(__dirname, `session_${sessionKey}`);
    let sock;
    let codeTimer;
    let linkTimer;
    let finished = false;
    let codeRequested = false;
    let restartCount = 0;
    let reconnectInProgress = false;
    let loginConfirmed = false;
    let pendingCredsSave = Promise.resolve();

    try {
        const strategies = [null, ...PROXY_LIST.sort(() => 0.5 - Math.random()).slice(0, 2)];
        let pairingSuccess = false;
        let lastStrategyError = null;

        for (const proxyUrl of strategies) {
            if (finished) break;
            const strategyName = proxyUrl ? 'Proxy' : 'Direct';
            logger.info({ sessionKey, strategy: strategyName }, 'Attempting strategy');

            try {
                fs.mkdirSync(authDir, { recursive: true });
                const auth = await useMultiFileAuthState(authDir);
                const { state, saveCreds } = auth;
                let version = [2, 2413, 51];

                sessions.set(sessionKey, {
                    status: 'connecting',
                    code: null,
                    sessionId: null,
                    number: maskNumber(number),
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });

                const markTerminalError = (message, errorCode = null, status = 'error') => {
                    if (finished) return;
                    finished = true;
                    if (codeTimer) clearTimeout(codeTimer);
                    if (linkTimer) clearTimeout(linkTimer);
                    updateSession(sessionKey, { status, errorCode, message });
                    try { sock?.end(undefined); } catch {}
                    removeAuthFolder(authDir, 30_000);
                };

                const completePairing = async (currentSock) => {
                    if (finished || currentSock !== sock) return;
                    finished = true;
                    if (codeTimer) clearTimeout(codeTimer);
                    if (linkTimer) clearTimeout(linkTimer);
                    await pendingCredsSave;
                    const sessionId = createCompactSessionId();
                    try {
                        saveSessionRegistry(sessionId, authDir, number);
                        fs.writeFileSync(path.join(authDir, 'deployer.txt'), number);
                    } catch (error) {
                        markTerminalError('Registry save failed');
                        return;
                    }
                    updateSession(sessionKey, { status: 'delivery_pending', message: 'Sending ID...' });
                    const recipientJid = `${number}@s.whatsapp.net`;
                    const inboxMessages = [`*⚡ Generating session...*`, sessionId, `╭━━❐━⪼\n┇ ◉ SESSION LINKED ◉\n┇ \n┇ ◉ Paste it as SESSION during deploy\n┇ \n┇ ◉ Session ID: ${sessionId}\n╰━━❑━⪼\n\n╭◆\n│\n│ ◆ OWNER : MOMO47\n│ \n│ ◆ NUMBER 1 : +255 760 298 574\n│ \n│ ◆ NUMBER 2 : +255 765 409 584\n│\n╰◆\n\n╭━━❐━⪼\n┇ ★ CHANNEL 1 :\n┇ https://whatsapp.com/channel/0029Vb8AYLf2f3EA8Y4qp63H\n┇\n┇ ★ CHANNEL 2 :\n┇ https://whatsapp.com/channel/0029VbDNET6KmCPShs9dyg1U\n┇\n┇ ★ CHANNEL 3 :\n┇ https://whatsapp.com/channel/0029VbDeRauAjPXFYDvO5e2D\n┇\n┇ ★ CHANNEL 4 :\n┇ https://whatsapp.com/channel/0029VbDYZ7LBVJky0TggGF2N\n╰━━❑━⪼\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`];
                    
                    let delivered = false;
                    for (let i = 0; i < 4 && !delivered; i++) {
                        try {
                            for (let j = 0; j < inboxMessages.length; j++) {
                                await currentSock.sendMessage(recipientJid, { text: inboxMessages[j] });
                                await delay(500);
                            }
                            delivered = true;
                        } catch { await delay(2000); }
                    }
                    if (delivered) {
                        updateSession(sessionKey, { status: 'connected', sessionId });
                        incrementStats();
                    } else {
                        updateSession(sessionKey, { status: 'delivery_failed' });
                    }
                    setTimeout(() => { try { currentSock.end(); } catch {}; removeAuthFolder(authDir, 10_000); }, 15_000);
                };

                const requestCode = async () => {
                    if (codeRequested || finished) return;
                    codeRequested = true;
                    try {
                        const code = await sock.requestPairingCode(number);
                        updateSession(sessionKey, { status: 'awaiting_link', code });
                        linkTimer = setTimeout(() => markTerminalError('Timeout', 408), LINK_TIMEOUT_MS);
                        pairingSuccess = true;
                    } catch (e) { throw e; }
                };

                const createSocket = () => {
                    const s = makeWASocket({
                        version,
                        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
                        browser: ["MOMO-XMD", "Chrome", "1.0.0"],
                        agent: getProxyAgent(proxyUrl),
                        printQRInTerminal: false,
                        logger: pino({ level: 'silent' }),
                        connectTimeoutMs: 60_000
                    });
                    s.ev.on('creds.update', () => { pendingCredsSave = saveCreds().catch(() => {}); });
                    s.ev.on('connection.update', async (up) => {
                        const { connection, lastDisconnect, qr, isNewLogin } = up;
                        if (connection === 'open') await completePairing(s);
                        if (qr && !codeRequested) await requestCode();
                        if (connection === 'close') {
                            const code = getDisconnectCode(lastDisconnect?.error);
                            if (!finished && (code === DisconnectReason.restartRequired || (code === 515))) {
                                await delay(500);
                                sock = createSocket();
                            } else if (!finished) {
                                markTerminalError('Connection closed');
                            }
                        }
                    });
                    return s;
                };

                sock = createSocket();
                codeTimer = setTimeout(() => requestCode(), 8_000);

                let wait = 0;
                while (!pairingSuccess && !finished && wait < 30) { await delay(1000); wait++; }
                if (pairingSuccess) return res.json({ success: true, sessionKey });
                
                try { sock?.end(); } catch {}; removeAuthFolder(authDir, 1000);
                codeRequested = false; finished = false;
            } catch (error) {
                lastStrategyError = error;
                try { sock?.end(); } catch {}; removeAuthFolder(authDir, 1000);
                codeRequested = false; finished = false;
            }
        }
        throw lastStrategyError || new Error('Failed');
    } catch (error) {
        updateSession(sessionKey, { status: 'error', message: error.message });
        return res.status(500).json({ success: false, error: error.message });
    } finally { release(); }
});

app.get('/stats', (req, res) => res.json(getStats()));
app.get('/session-status/:key', (req, res) => {
    const s = sessions.get(req.params.key);
    if (!s) return res.status(404).json({ status: 'not_found' });
    res.json(s);
});

app.listen(PORT, () => logger.info({ port: PORT }, 'Server started'));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
