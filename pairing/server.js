const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { Semaphore } = require('await-semaphore');

const router = express.Router();
const semaphore = new Semaphore(1);
const sessions = new Map();

const SESSION_REGISTRY_FILE = path.join(__dirname, 'sessions.json');
const STATS_FILE = path.join(__dirname, 'stats.json');
const SESSION_PREFIX = 'MOMO-XMD~';

// Highly stable browser fingerprint mimicking a real MacOS Chrome instance
const TRUSTED_BROWSER = Browsers.ubuntu("Chrome");

// Middleware and static files are handled by launcher.js

async function getStats() {
    if (fs.existsSync(STATS_FILE)) {
        try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) { return { totalPairings: 0, linkedNumbers: [] }; }
    }
    return { totalPairings: 0, linkedNumbers: [] };
}

router.get('/stats', async (req, res) => {
    const stats = await getStats();
    res.json(stats);
});

router.get('/session-registry/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    if (fs.existsSync(SESSION_REGISTRY_FILE)) {
        try {
            const registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8') || '{}');
            if (registry[sessionId]) {
                return res.json(registry[sessionId]);
            }
        } catch (e) {}
    }
    res.status(404).json({ error: 'Session not found' });
});

router.post('/pair', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Number is required' });

    const sessionKey = `momo_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const authDir = path.join(__dirname, 'temp_sessions', sessionKey);
    
    try {
        if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();
        
        const logger = pino({ level: 'silent' });
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            version,
            printQRInTerminal: false,
            logger: logger,
            browser: TRUSTED_BROWSER,
            connectTimeoutMs: 100000, // Increased timeout for slow cloud handshakes
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            // Enhanced stealth options
            options: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
            }
        });

        sessions.set(sessionKey, { status: 'connecting', number, sock });

        sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', async (up) => {
    const { connection, lastDisconnect, qr } = up;
    console.log(`[SESSION: ${sessionKey}] Status: ${connection}`);

    if (connection === 'open') {
                const randomPart = Array.from({ length: 22 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase();
                const sessionId = `${SESSION_PREFIX}${randomPart}`;
                
                // Collect session files
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

                // Update registry
                let registry = {};
                if (fs.existsSync(SESSION_REGISTRY_FILE)) {
                    try { registry = JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8') || '{}'); } catch (e) {}
                }
                registry[sessionId] = { fullNumber: number, files, createdAt: Date.now() };
                fs.writeFileSync(SESSION_REGISTRY_FILE, JSON.stringify(registry));
                
                // Update stats
                let stats = await getStats();
                if (!stats.linkedNumbers.includes(number)) {
                    stats.linkedNumbers.push(number);
                    stats.totalPairings = stats.linkedNumbers.length;
                    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
                }

                sessions.set(sessionKey, { status: 'linked', sessionId });
                console.log(`[SESSION: ${sessionKey}] ✅ LINKED SUCCESSFULLY: ${number}`);
                
                // Cleanup socket after successful link
                await delay(5000);
                sock.logout();
                fs.rmSync(authDir, { recursive: true, force: true });
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`[SESSION: ${sessionKey}] ❌ CLOSED. Reason: ${reason}`);
                
                if (reason !== DisconnectReason.loggedOut && sessions.get(sessionKey)?.status !== 'linked') {
                    const current = sessions.get(sessionKey) || {};
                    sessions.set(sessionKey, { ...current, status: 'error', message: 'Connection failed. Please try again.' });
                }
            }
        });

        // Request pairing code with a slight delay to ensure socket is ready
        setTimeout(async () => {
            try {
                if (!sock.authState.creds.registered) {
                    await delay(5000);
                    console.log(`[SESSION: ${sessionKey}] Requesting pairing code for: ${number}`);
                    const code = await sock.requestPairingCode(number);
                    if (code) {
                        const current = sessions.get(sessionKey) || {};
                        sessions.set(sessionKey, { ...current, status: 'awaiting_link', code });
                        console.log(`[SESSION: ${sessionKey}] Code generated: ${code}`);
                    }
                }
            } catch (e) {
                console.error(`[SESSION: ${sessionKey}] ❌ Pairing code request failed:`, e.message);
                const current = sessions.get(sessionKey) || {};
                sessions.set(sessionKey, { ...current, status: 'error', message: e.message });
            }
        }, 3000);

        res.json({ sessionKey });

    } catch (err) {
        console.error('[SERVER ERROR]:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/session-status/:sessionKey', (req, res) => {
    const session = sessions.get(req.params.sessionKey);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({
        status: session.status,
        code: session.code,
        sessionId: session.sessionId,
        message: session.message
    });
});

router.get('/reset', (req, res) => {
    try {
        sessions.clear();
        const tempDir = path.join(__dirname, 'temp_sessions');
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        res.json({ success: true, message: 'All sessions and temp files cleared.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
