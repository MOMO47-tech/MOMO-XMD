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
    Browsers,
    delay
} = require('@whiskeysockets/baileys');

const logger = pino({ level: 'silent' });
const pairingMutex = new Mutex();
const sessions = new Map();

const STATS_FILE = path.join(__dirname, 'stats.json');
const SESSION_REGISTRY_FILE = path.join(__dirname, 'session_registry.json');
const SESSION_PREFIX = 'MOMO-XMD~';
const REGISTRY_ORIGIN = process.env.SESSION_REGISTRY_ORIGIN === 'H' || process.env.HEROKU_APP_NAME ? 'H' : 'V';

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const initFile = (file, defaultContent) => {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(defaultContent));
        }
    } catch (e) {}
};

initFile(STATS_FILE, { totalPairings: 0 });
initFile(SESSION_REGISTRY_FILE, {});

const router = express.Router();
router.use(express.static(path.join(__dirname, 'public')));
router.use(express.json());

router.get('/stats', (req, res) => {
    try {
        const registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8') || '{}');
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8') || '{"totalPairings":0}');
        res.json({ totalPairings: Math.max(Object.keys(registry).length, Number(stats.totalPairings || 0)) });
    } catch (e) { res.json({ totalPairings: 0 }); }
});

router.get('/session-status/:key', (req, res) => {
    const s = sessions.get(req.params.key);
    if (!s) return res.status(404).json({ status: 'not_found' });
    res.json(s);
});

router.post('/pair', async (req, res) => {
    const number = String(req.body?.number || '').replace(/[^0-9]/g, '');
    if (!/^\d{8,15}$/.test(number)) return res.status(400).json({ error: 'Invalid number format' });

    const release = await pairingMutex.acquire();
    const sessionKey = `momo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const authDir = path.join('/tmp', `session_${sessionKey}`);
    
    try {
        if (fs.existsSync(authDir)) {
            try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
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
            browser: Browsers.ubuntu("Chrome"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false
        });

        sessions.set(sessionKey, { status: 'connecting', number });

        sock.ev.on('creds.update', saveCreds);

        // Faster code request logic
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
                sessions.set(sessionKey, { ...current, status: 'error', message: e.message || 'Could not generate code' });
            }
        }, 2000);

        sock.ev.on('connection.update', async (up) => {
            const { connection, lastDisconnect } = up;
            
            if (connection === 'open') {
                const randomPart = Array.from({ length: 22 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase();
                const sessionId = `${SESSION_PREFIX}${REGISTRY_ORIGIN}${randomPart}`;
                
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
                    const registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8') || '{}');
                    registry[sessionId] = { fullNumber: number, files, createdAt: Date.now() };
                    fs.writeFileSync(SESSION_REGISTRY_FILE, JSON.stringify(registry));
                    
                    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8') || '{"totalPairings":0}');
                    stats.totalPairings = (Number(stats.totalPairings) || 0) + 1;
                    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
                } catch (e) {}
                
                const msg = `╭━━❐━⪼\n┇ ◉ SESSION LINKED ◉\n┇ \n┇ ◉ Session ID: ${sessionId}\n╰━━❑━⪼\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
                try {
                    if (sock.user?.id) await sock.sendMessage(sock.user.id, { text: msg });
                    await sock.sendMessage(`${number}@s.whatsapp.net`, { text: sessionId });
                    await sock.sendMessage(`${number}@s.whatsapp.net`, { text: msg });
                } catch (e) {}
                
                const current = sessions.get(sessionKey) || {};
                sessions.set(sessionKey, { ...current, status: 'connected', sessionId });
                setTimeout(() => {
                    try { sock.end(); fs.rmSync(authDir, { recursive: true, force: true }); } catch (e) {}
                }, 5000);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
                const current = sessions.get(sessionKey);
                if (code !== DisconnectReason.loggedOut && current?.status !== 'connected') {
                    sessions.set(sessionKey, { ...current, status: 'error', message: `Disconnected (${code})` });
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

router.get('/health', (req, res) => res.status(200).send('OK'));

if (require.main === module) {
    const app = express();
    const PORT = Number(process.env.PORT || 8000);
    app.use('/', router);
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Pairing server listening on port ${PORT}`);
    });
} else {
    module.exports = router;
}
