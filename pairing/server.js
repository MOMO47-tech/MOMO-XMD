const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { Mutex } = require('async-mutex');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = Number(process.env.PORT || 8000);
const logger = pino({ level: 'info' });
const pairingMutex = new Mutex();
const sessions = new Map();

const STATS_FILE = path.join(__dirname, 'stats.json');
const SESSION_REGISTRY_FILE = path.join(__dirname, 'session_registry.json');
const SESSION_PREFIX = 'MOMO-XMD~';
const REGISTRY_ORIGIN = process.env.SESSION_REGISTRY_ORIGIN === 'H' || process.env.HEROKU_APP_NAME ? 'H' : 'V';

// Ensure files exist with valid JSON
const initFile = (file, defaultContent) => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultContent));
    } else {
        try {
            JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            fs.writeFileSync(file, JSON.stringify(defaultContent));
        }
    }
};

initFile(STATS_FILE, { totalPairings: 0 });
initFile(SESSION_REGISTRY_FILE, {});

function getStats() {
    try {
        const registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8'));
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        return { totalPairings: Math.max(Object.keys(registry).length, Number(stats.totalPairings || 0)) };
    } catch (e) { return { totalPairings: 0 }; }
}

function incrementStats() {
    try {
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        stats.totalPairings = (Number(stats.totalPairings) || 0) + 1;
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
        return stats.totalPairings;
    } catch (e) { return 0; }
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
    const number = String(req.body?.number || '').replace(/[^0-9]/g, '');
    if (!/^\d{8,15}$/.test(number)) return res.status(400).json({ error: 'Invalid number format' });

    const release = await pairingMutex.acquire();
    const sessionKey = `momo_${Date.now()}`;
    const authDir = path.join(__dirname, `session_${sessionKey}`);
    
    try {
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        fs.mkdirSync(authDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            logger: logger,
            browser: Browsers.ubuntu("Chrome"),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            markOnlineOnConnect: false,
            syncFullHistory: false
        });

        sessions.set(sessionKey, { status: 'connecting', number });

        sock.ev.on('creds.update', saveCreds);

        let codeRequested = false;

        sock.ev.on('connection.update', async (up) => {
            const { connection, lastDisconnect } = up;
            
            if (!state.creds.registered && !codeRequested) {
                codeRequested = true;
                setTimeout(async () => {
                    try {
                        const code = await sock.requestPairingCode(number);
                        if (code) {
                            sessions.set(sessionKey, { ...sessions.get(sessionKey), status: 'awaiting_link', code });
                        }
                    } catch (e) {
                        sessions.set(sessionKey, { ...sessions.get(sessionKey), status: 'error', message: e.message });
                    }
                }, 3000);
            }

            if (connection === 'open') {
                const randomPart = Array.from({ length: 22 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase();
                const sessionId = `${SESSION_PREFIX}${REGISTRY_ORIGIN}${randomPart}`;
                
                // Export auth files
                const files = {};
                const walk = (dir) => {
                    for (const f of fs.readdirSync(dir)) {
                        const p = path.join(dir, f);
                        if (fs.statSync(p).isDirectory()) walk(p);
                        else files[path.relative(authDir, p)] = fs.readFileSync(p).toString('base64');
                    }
                };
                walk(authDir);

                const registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8'));
                registry[sessionId] = { fullNumber: number, files, createdAt: Date.now() };
                fs.writeFileSync(SESSION_REGISTRY_FILE, JSON.stringify(registry));
                incrementStats();
                
                const msg = `╭━━❐━⪼\n┇ ◉ SESSION LINKED ◉\n┇ \n┇ ◉ Session ID: ${sessionId}\n╰━━❑━⪼\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
                try {
                    await sock.sendMessage(sock.user.id, { text: msg });
                    await sock.sendMessage(`${number}@s.whatsapp.net`, { text: sessionId });
                    await sock.sendMessage(`${number}@s.whatsapp.net`, { text: msg });
                } catch (e) {}
                
                sessions.set(sessionKey, { ...sessions.get(sessionKey), status: 'connected', sessionId });
                setTimeout(() => {
                    try { sock.end(); fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
                }, 10000);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
                if (code !== DisconnectReason.loggedOut && sessions.get(sessionKey)?.status !== 'connected') {
                    sessions.set(sessionKey, { ...sessions.get(sessionKey), status: 'error', message: `Closed (${code})` });
                    try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
                }
            }
        });

        res.json({ success: true, sessionKey });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        release();
    }
});

// Basic health check for Heroku
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pairing server listening on port ${PORT}`);
});
