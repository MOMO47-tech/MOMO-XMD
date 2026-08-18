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

const app = express();
const PORT = Number(process.env.PORT || 8000);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const pairingMutex = new Mutex();
const sessions = new Map();

const STATS_FILE = path.join(__dirname, 'stats.json');
const SESSION_REGISTRY_FILE = path.join(__dirname, 'session_registry.json');
const SESSION_PREFIX = 'MOMO-XMD~';
const REGISTRY_ORIGIN = process.env.SESSION_REGISTRY_ORIGIN === 'H' || process.env.HEROKU_APP_NAME ? 'H' : 'V';

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
        stats.totalPairings = (Number(stats.totalPairings) || 0) + 1;
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
    fs.writeFileSync(SESSION_REGISTRY_FILE, JSON.stringify(registry));
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

function cleanNumber(number) {
    return String(number || '').replace(/[^0-9]/g, '');
}

function updateSession(key, update) {
    const existing = sessions.get(key) || {};
    sessions.set(key, { ...existing, ...update, updatedAt: Date.now() });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/stats', (req, res) => res.json(getStats()));

app.get('/session-status/:key', (req, res) => {
    const s = sessions.get(req.params.key);
    if (!s) return res.status(404).json({ status: 'not_found' });
    res.json(s);
});

app.post('/pair', async (req, res) => {
    const number = cleanNumber(req.body?.number);
    if (!/^\d{8,15}$/.test(number)) return res.status(400).json({ success: false, error: 'Invalid number' });

    const release = await pairingMutex.acquire();
    const sessionKey = `momo_${Date.now()}`;
    const authDir = path.join(__dirname, `session_${sessionKey}`);
    
    try {
        fs.mkdirSync(authDir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        
        let version = [2, 3000, 1015901307];
        try {
            const latest = await fetchLatestBaileysVersion();
            if (Array.isArray(latest?.version)) version = latest.version;
        } catch (e) {}

        const sock = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu("Chrome"),
            connectTimeoutMs: 60_000
        });

        sessions.set(sessionKey, { status: 'connecting', number });

        let pairingCode = null;
        let codeRequested = false;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (up) => {
            const { connection, lastDisconnect, qr } = up;
            
            if (!codeRequested && !state.creds.registered) {
                codeRequested = true;
                try {
                    await delay(3000);
                    pairingCode = await sock.requestPairingCode(number);
                    if (pairingCode) {
                        updateSession(sessionKey, { status: 'awaiting_link', code: pairingCode });
                    }
                } catch (e) {
                    logger.error({ error: e.message }, 'Pairing code request error');
                }
            }

            if (connection === 'open') {
                const sessionId = createCompactSessionId();
                const registry = readSessionRegistry();
                registry[sessionId] = {
                    fullNumber: number,
                    files: exportAuthFiles(authDir),
                    createdAt: Date.now()
                };
                writeSessionRegistry(registry);
                incrementStats();
                
                const msg = `╭━━❐━⪼\n┇ ◉ SESSION LINKED ◉\n┇ \n┇ ◉ Session ID: ${sessionId}\n╰━━❑━⪼\n\n> Powered by MOMO-XMD\n> owner MOMO47`;
                try {
                    await sock.sendMessage(`${number}@s.whatsapp.net`, { text: msg });
                } catch (e) {}
                
                updateSession(sessionKey, { status: 'connected', sessionId });
                setTimeout(() => {
                    try { sock.end(); fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
                }, 15000);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
                if (code === DisconnectReason.restartRequired || code === 515) {
                    return;
                }
                if (code !== DisconnectReason.loggedOut && sessions.get(sessionKey)?.status !== 'connected') {
                    updateSession(sessionKey, { status: 'error', message: 'Connection closed' });
                    try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
                }
            }
        });

        // Wait up to 15 seconds for pairing code
        let wait = 0;
        while (!pairingCode && wait < 15) {
            await delay(1000);
            wait++;
            const current = sessions.get(sessionKey);
            if (current?.code) {
                pairingCode = current.code;
                break;
            }
        }

        if (pairingCode) {
            return res.json({ success: true, sessionKey });
        } else {
            try {
                pairingCode = await sock.requestPairingCode(number);
                if (pairingCode) {
                    updateSession(sessionKey, { status: 'awaiting_link', code: pairingCode });
                    return res.json({ success: true, sessionKey });
                }
            } catch (e) {}

            return res.status(500).json({ success: false, error: 'Could not generate pairing code. Please retry.' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    } finally {
        release();
    }
});

app.listen(PORT, () => logger.info(`Server started on port ${PORT}`));
