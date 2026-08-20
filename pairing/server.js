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
const msgRetryCounterCache = new NodeCache();
const pairingMutex = new Mutex();
const sessions = new Map();

const STATS_FILE = path.join(__dirname, 'stats.json');
const SESSION_REGISTRY_FILE = path.join(__dirname, 'session_registry.json');
const SESSION_PREFIX = 'MOMO-XMD~';
const REGISTRY_ORIGIN = process.env.SESSION_REGISTRY_ORIGIN === 'H' || process.env.HEROKU_APP_NAME ? 'H' : 'V';

const CODE_TIMEOUT_MS = 60_000;
const LINK_TIMEOUT_MS = 5 * 60_000;

if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ totalPairings: 0 }));
}

function getStats() {
    try {
        return { totalPairings: Object.keys(readSessionRegistry()).length };
    } catch {
        return { totalPairings: 0 };
    }
}

function incrementStats() {
    const stats = getStats();
    stats.totalPairings = Number(stats.totalPairings || 0) + 1;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
    return stats.totalPairings;
}

function readSessionRegistry() {
    try {
        if (!fs.existsSync(SESSION_REGISTRY_FILE)) return {};
        return JSON.parse(fs.readFileSync(SESSION_REGISTRY_FILE, 'utf8')) || {};
    } catch (error) {
        logger.warn({ error: error.message }, 'Could not read session registry');
        return {};
    }
}

function writeSessionRegistry(registry) {
    const tempFile = `${SESSION_REGISTRY_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(registry));
    fs.renameSync(tempFile, SESSION_REGISTRY_FILE);
}

function createCompactSessionId() {
    const randomPart = Array.from({ length: 22 }, () => Math.floor(Math.random() * 36).toString(36))
        .join('')
        .toUpperCase();
    return `${SESSION_PREFIX}${REGISTRY_ORIGIN}${randomPart}`;
}

function exportAuthFiles(authDir) {
    const files = {};
    const visit = (directory, relativeDirectory = '') => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolutePath = path.join(directory, entry.name);
            const relativePath = path.join(relativeDirectory, entry.name).split(path.sep).join('/');
            if (entry.isDirectory()) visit(absolutePath, relativePath);
            else files[relativePath] = fs.readFileSync(absolutePath).toString('base64');
        }
    };
    visit(authDir);
    return files;
}

function saveSessionRegistry(sessionId, authDir, number) {
    const files = exportAuthFiles(authDir);
    if (!files['creds.json']) throw new Error('Authenticated credentials were not written');
    const registry = readSessionRegistry();
    registry[sessionId] = { createdAt: Date.now(), number: maskNumber(number), files };
    writeSessionRegistry(registry);
}

function cleanNumber(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

function maskNumber(number) {
    return number.length > 4 ? `${number.slice(0, 3)}******${number.slice(-2)}` : 'unknown';
}

function getDisconnectCode(error) {
    return error?.output?.statusCode
        ?? error?.data?.statusCode
        ?? error?.statusCode
        ?? error?.code
        ?? null;
}

function getDisconnectMessage(error) {
    return error?.output?.payload?.message
        || error?.message
        || (error ? String(error) : 'Unknown disconnect');
}

function updateSession(sessionKey, patch) {
    const current = sessions.get(sessionKey) || {};
    sessions.set(sessionKey, { ...current, ...patch, updatedAt: Date.now() });
}

function removeAuthFolder(authDir, delayMs = 0) {
    setTimeout(() => {
        try {
            if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        } catch (error) {
            logger.warn({ error: error.message }, 'Could not remove temporary auth folder');
        }
    }, delayMs);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => {
    res.json({ ok: true, service: 'momo-xmd-pairing', uptime: process.uptime() });
});

app.get('/session-registry/:sessionId', (req, res) => {
    const token = String(req.params.sessionId || '');
    if (!new RegExp(`^${SESSION_PREFIX}[HV][A-Z0-9]{22}$`).test(token)) {
        return res.status(400).json({ error: 'Invalid Session ID format' });
    }
    const entry = readSessionRegistry()[token];
    if (!entry) return res.status(404).json({ error: 'Session ID not found or expired' });
    res.json({ sessionId: token, files: entry.files });
});

app.post('/pair', async (req, res) => {
    const number = cleanNumber(req.body?.number);
    if (!/^\d{8,15}$/.test(number)) {
        return res.status(400).json({
            success: false,
            error: 'Enter a valid WhatsApp number with country code, digits only.'
        });
    }

    const release = await pairingMutex.acquire();
    const sessionKey = `momo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const authDir = path.join(__dirname, `session_${sessionKey}`);
    let sock;
    let codeTimer;
    let linkTimer;
    let finished = false;
    let codeRequested = false;
    let loginConfirmed = false;
    let pendingCredsSave = Promise.resolve();

    const queueCredsSave = () => {
        pendingCredsSave = pendingCredsSave
            .catch(() => {})
            .then(() => saveCreds())
            .catch((error) => {
                logger.error({ sessionKey, error: error.message }, 'Could not persist WhatsApp credentials');
                throw error;
            });
        return pendingCredsSave;
    };

    const clearTimers = () => {
        if (codeTimer) clearTimeout(codeTimer);
        if (linkTimer) clearTimeout(linkTimer);
    };

    const closeSocket = (socket) => {
        try { socket?.end(undefined); } catch {}
    };

    let saveCreds;
    let state;
    let version = [2, 2413, 51];

    try {
        fs.mkdirSync(authDir, { recursive: true });
        const auth = await useMultiFileAuthState(authDir);
        state = auth.state;
        saveCreds = auth.saveCreds;

        try {
            const latest = await fetchLatestBaileysVersion();
            if (Array.isArray(latest?.version)) version = latest.version;
        } catch (error) {}

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
            clearTimers();
            updateSession(sessionKey, { status, errorCode, message });
            closeSocket(sock);
            removeAuthFolder(authDir, 30_000);
        };

        const completePairing = async (currentSock) => {
            if (finished || currentSock !== sock) return;
            finished = true;
            clearTimers();
            await pendingCredsSave;
            const sessionId = createCompactSessionId();
            try {
                saveSessionRegistry(sessionId, authDir, number);
            } catch (error) {
                markTerminalError('Session ID could not be saved.');
                return;
            }

            updateSession(sessionKey, { status: 'delivery_pending', sessionId });
            
            const recipientJid = `${number}@s.whatsapp.net`;
            const inboxMessages = [
                `*⚡ Generating session...*`,
                sessionId,
                `*MOMO-XMD CONNECTED SUCCESSFULLY!* ☠️\n\n*Session ID:*\n\n${sessionId}\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`
            ];

            try {
                for (const msg of inboxMessages) {
                    await currentSock.sendMessage(recipientJid, { text: msg });
                    await delay(1000);
                }
                updateSession(sessionKey, { status: 'connected', sessionId });
                incrementStats();
            } catch (e) {
                updateSession(sessionKey, { status: 'connected', sessionId });
            }

            setTimeout(() => {
                closeSocket(currentSock);
                removeAuthFolder(authDir, 10_000);
            }, 15_000);
        };

        const requestCode = async () => {
            if (codeRequested || finished) return;
            codeRequested = true;
            try {
                const code = await sock.requestPairingCode(number);
                updateSession(sessionKey, { status: 'awaiting_link', code });
                linkTimer = setTimeout(() => markTerminalError('Timeout', 408), LINK_TIMEOUT_MS);
            } catch (e) {
                markTerminalError(e.message);
            }
        };

        const createSocket = () => {
            const currentSock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                },
                browser: ["MOMO-XMD", "Chrome", "120.0.0"],
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                markOnlineOnConnect: true,
                syncFullHistory: false,
                connectTimeoutMs: 60_000,
                defaultQueryTimeoutMs: 60_000,
                keepAliveIntervalMs: 15_000
            });

            currentSock.ev.on('creds.update', () => {
                queueCredsSave().catch(() => {});
            });

            currentSock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (connection === 'open') await completePairing(currentSock);
                if (qr && !codeRequested) await requestCode();
                if (connection === 'close') {
                    const code = getDisconnectCode(lastDisconnect?.error);
                    if (!finished && (code === DisconnectReason.restartRequired || code === 515)) {
                        await delay(500);
                        sock = createSocket();
                    } else if (!finished) {
                        markTerminalError('Connection closed');
                    }
                }
            });
            return currentSock;
        };

        sock = createSocket();
        codeTimer = setTimeout(() => requestCode(), 10_000);
        return res.json({ success: true, sessionKey });
    } catch (error) {
        updateSession(sessionKey, { status: 'error', message: error.message });
        closeSocket(sock);
        removeAuthFolder(authDir, 30_000);
        return res.status(500).json({ success: false, error: error.message });
    } finally {
        release();
    }
});

app.get('/session-status/:key', (req, res) => {
    const session = sessions.get(req.params.key);
    if (!session) return res.status(404).json({ status: 'not_found' });
    res.json(session);
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`MOMO-XMD pairing server started on port ${PORT}`));
}

module.exports = app;
