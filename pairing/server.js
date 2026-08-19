const express = require('express');
const path = require('path');
const fs = require('fs');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Semaphore } = require('await-semaphore');

const app = express();
const port = process.env.PORT || 8000;
const pairingMutex = new Semaphore(5); // Limit concurrent pairing attempts

const logger = pino({ level: 'silent' });
const sessions = new Map();

const SESSION_REGISTRY_FILE = path.join(__dirname, 'sessions.json');
const STATS_FILE = path.join(__dirname, 'stats.json');
const SESSION_PREFIX = 'MOMO-XMD~';
const REGISTRY_ORIGIN = 'REG_';

const USER_AGENTS = [
    ['Ubuntu', 'Chrome', '120.0.0.0'],
    ['Macintosh', 'Chrome', '121.0.0.0'],
    ['Windows', 'Chrome', '122.0.0.0']
];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/pair', async (req, res) => {
    const number = String(req.body?.number || '').replace(/[^0-9]/g, '');
    if (!/^\d{8,15}$/.test(number)) return res.status(400).json({ error: 'Invalid number format' });

    const release = await pairingMutex.acquire();
    const sessionKey = `momo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // Use a local directory instead of /tmp for better Heroku stability
    const authDir = path.join(__dirname, 'temp_sessions', sessionKey);
    
    try {
        if (!fs.existsSync(path.join(__dirname, 'temp_sessions'))) {
            fs.mkdirSync(path.join(__dirname, 'temp_sessions'), { recursive: true });
        }
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
        }
        fs.mkdirSync(authDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            logger: logger,
            browser: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: false
        });

        sessions.set(sessionKey, { status: 'connecting', number });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (up) => {
            const { connection, lastDisconnect } = up;
            
            if (connection === 'open') {
                const randomPart = Array.from({ length: 22 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase();
                const sessionId = `${SESSION_PREFIX}${randomPart}`;
                
                const files = {};
                const walk = (dir) => {
                    if (!fs.existsSync(dir)) return;
                    for (const f of fs.readdirSync(dir)) {
                        const p = path.join(dir, f);
                        if (fs.statSync(p).isDirectory()) walk(p);
                        else files[path.relative(authDir, p)] = fs.readFileSync(p).toString('base64');
                    }
                };
                walk(authDir);

                try {
                    let registry = {};
                    if (fs.existsSync(SESSION_REGISTRY_FILE)) {
                        try { registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8') || '{}'); } catch (e) {}
                    }
                    registry[sessionId] = { fullNumber: number, files, createdAt: Date.now() };
                    fs.writeFileSync(SESSION_REGISTRY_FILE, JSON.stringify(registry));
                    
                    let stats = { totalPairings: 0, linkedNumbers: [] };
                    if (fs.existsSync(STATS_FILE)) {
                        try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8') || '{ "totalPairings": 0, "linkedNumbers": [] }'); } catch (e) {}
                    }
                    if (!stats.linkedNumbers.includes(number)) {
                        stats.linkedNumbers.push(number);
                        stats.totalPairings = stats.linkedNumbers.length;
                    }
                    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
                } catch (e) {
                    console.error('[REGISTRY ERROR]:', e);
                }

                sessions.set(sessionKey, { status: 'linked', sessionId });
                setTimeout(() => {
                    try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
                    sock.end();
                }, 5000);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;
                if (code !== DisconnectReason.loggedOut && sessions.get(sessionKey)?.status !== 'linked') {
                    // Handle unexpected closure
                }
            }
        });

        // Request pairing code
        setTimeout(async () => {
            try {
                if (!sock.authState.creds.registered) {
                    await delay(3000);
                    const code = await sock.requestPairingCode(number);
                    if (code) {
                        const current = sessions.get(sessionKey) || {};
                        sessions.set(sessionKey, { ...current, status: 'awaiting_link', code });
                    }
                }
            } catch (e) {
                console.error('[PAIRING CODE ERROR]:', e);
                const current = sessions.get(sessionKey) || {};
                sessions.set(sessionKey, { ...current, status: 'error', message: e.message });
            }
        }, 2000);

        res.json({ sessionKey });

    } catch (err) {
        console.error('[API ERROR]:', err);
        res.status(500).json({ error: 'Failed to initialize pairing' });
    } finally {
        release();
    }
});

app.get('/api/status/:key', (req, res) => {
    const session = sessions.get(req.params.key);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
});

app.get('/api/stats', (req, res) => {
    if (fs.existsSync(STATS_FILE)) {
        res.sendFile(STATS_FILE);
    } else {
        res.json({ totalPairings: 0 });
    }
});

app.listen(port, () => {
    console.log(`[PAIRING SERVER] Running on port ${port}`);
});
