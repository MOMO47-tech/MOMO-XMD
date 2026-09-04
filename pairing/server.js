const express = require('express');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { Mutex } = require('async-mutex');
const { configured: supabaseConfigured, saveSession, restoreSession } = require('../lib/session-store');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/health', '/healthz'], (_req, res) => {
    res.json({ ok: true, service: 'momo-xmd-pairing', uptime: process.uptime() });
});

const PORT = Number(process.env.PORT || 8000);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const setupMutex = new Mutex();
const sessions = new Map();
let startPairedBot = null;

const setPairedBotStarter = (starter) => {
    startPairedBot = typeof starter === 'function' ? starter : null;
};

const PROXY_LIST = String(process.env.PAIRING_PROXIES || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

function getProxyAgent(proxyUrl) {
    if (!proxyUrl) return undefined;
    try {
        if (proxyUrl.startsWith('socks')) return new SocksProxyAgent(proxyUrl);
        if (proxyUrl.startsWith('https')) return new HttpsProxyAgent(proxyUrl);
        return new HttpProxyAgent(proxyUrl);
    } catch (error) {
        logger.warn({ error: error.message }, 'Ignoring invalid pairing proxy');
        return undefined;
    }
}

function closeSocket(sock) {
    try {
        if (sock && typeof sock.end === 'function') sock.end();
    } catch (_) {}
}

function removeAuthDir(authDir) {
    try {
        if (authDir && fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
        }
    } catch (error) {
        logger.warn({ error: error.message }, 'Could not remove temporary auth directory');
    }
}

function normalizeNumber(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

function updateSession(key, data) {
    const current = sessions.get(key);
    if (current) {
        sessions.set(key, { ...current, ...data, updatedAt: Date.now() });
    }
}

function getPairingKeyFromCookie(req) {
    const cookieHeader = String(req.headers.cookie || '');
    const match = cookieHeader.match(/(?:^|;\s*)momo_pairing_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

function publicSession(session) {
    const safeFields = ['status', 'code', 'message', 'attempt', 'reconnect', 'botStarted'];
    return safeFields.reduce((result, field) => {
        if (session && session[field] !== undefined) result[field] = session[field];
        return result;
    }, {});
}

function getStats() {
    const statsFile = path.join(__dirname, 'stats.json');
    try {
        return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    } catch (_) {
        return { total_pairings: 0, active_sessions: 0 };
    }
}

function incrementStats() {
    const statsFile = path.join(__dirname, 'stats.json');
    const stats = getStats();
    stats.total_pairings = Number(stats.total_pairings || 0) + 1;
    try {
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (error) {
        logger.warn({ error: error.message }, 'Could not write pairing statistics');
    }
}

function statusCodeFromDisconnect(lastDisconnect) {
    return lastDisconnect?.error?.output?.statusCode
        || lastDisconnect?.error?.data?.statusCode
        || lastDisconnect?.error?.statusCode;
}

function getBotStarter() {
    if (startPairedBot) return startPairedBot;
    try {
        const { startBot } = require('../lib/bot');
        return (authDir) => startBot({ authDir, sessionId: null });
    } catch (error) {
        logger.error({ error: error.message }, 'No bot starter is available for server-side handoff');
        return null;
    }
}

async function startBotFromAuth(sessionKey, authDir, persistentKey) {
    if (supabaseConfigured() && persistentKey) {
        try {
            await saveSession(persistentKey, authDir);
            logger.info({ persistentKey: persistentKey.slice(0, 18) }, 'Persisted paired auth to Supabase');
        } catch (error) {
            logger.error({ error: error.message }, 'Could not persist paired auth to Supabase');
            updateSession(sessionKey, { status: 'error', message: 'Pairing succeeded but auth could not be persisted.' });
            removeAuthDir(authDir);
            return;
        }
    }
    const starter = getBotStarter();
    if (!starter) {
        updateSession(sessionKey, {
            status: 'error',
            message: 'Pairing succeeded, but the bot starter is unavailable.'
        });
        removeAuthDir(authDir);
        return;
    }

    try {
        // The pairing page must not wait for the long-lived WhatsApp socket.
        // startBot() intentionally reconnects forever, so awaiting it leaves the
        // browser stuck in bot_starting even after the pairing code succeeded.
        const botPromise = Promise.resolve(starter(authDir, persistentKey));
        updateSession(sessionKey, { status: 'connected', botStarted: true });
        void botPromise.catch(error => {
            logger.error({ error: error.message }, 'Server-side bot startup failed');
            updateSession(sessionKey, {
                status: 'error',
                message: `Bot startup failed: ${error.message}`
            });
            removeAuthDir(authDir);
        });
    } catch (error) {
        logger.error({ error: error.message }, 'Server-side bot startup failed');
        updateSession(sessionKey, {
            status: 'error',
            message: `Bot startup failed: ${error.message}`
        });
        removeAuthDir(authDir);
    }
}

async function runPairingAttempt({ sessionKey, number, proxyUrl, attempt }) {
    const authDir = path.join(__dirname, `temp_${sessionKey}_${attempt}`);
    let sock = null;
    let settled = false;
    let pairingOpened = false;
    let codeRequested = false;
    let reconnectCount = 0;
    let timeoutHandle = null;

    const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        closeSocket(sock);
    };

    return new Promise(async (resolve, reject) => {
        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            resolve(result);
        };

        const fail = (error) => {
            if (settled) return;
            settled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            closeSocket(sock);
            removeAuthDir(authDir);
            reject(error instanceof Error ? error : new Error(String(error)));
        };

        let state;
        let saveCreds;
        try {
            ({ state, saveCreds } = await useMultiFileAuthState(authDir));
        } catch (error) {
            fail(error);
            return;
        }

        let version = [2, 2413, 51];
        try {
            const latest = await fetchLatestBaileysVersion();
            if (Array.isArray(latest?.version)) version = latest.version;
        } catch (error) {
            logger.warn({ error: error.message }, 'Using fallback Baileys version for pairing');
        }

        const requestCode = async () => {
            if (settled || pairingOpened || codeRequested || !sock) return;
            codeRequested = true;
            try {
                await delay(1200);
                const code = await sock.requestPairingCode(number);
                if (!code) throw new Error('WhatsApp returned an empty pairing code');
                updateSession(sessionKey, {
                    status: 'awaiting_link',
                    code,
                    attempt,
                    proxy: proxyUrl ? 'enabled' : 'direct'
                });
                logger.info({ sessionKey, attempt }, 'Pairing code generated');
            } catch (error) {
                codeRequested = false;
                updateSession(sessionKey, {
                    status: 'code_error',
                    message: error.message,
                    attempt
                });
                if (reconnectCount < 2 && !settled && !pairingOpened) {
                    reconnectCount += 1;
                    updateSession(sessionKey, {
                        status: 'reconnecting',
                        reconnect: reconnectCount,
                        message: `Retrying pairing connection (${reconnectCount}/2)`
                    });
                    closeSocket(sock);
                    await delay(1000 * reconnectCount);
                    if (!settled && !pairingOpened) createSocket();
                } else {
                    fail(error);
                }
            }
        };

        const handleUpdate = async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'connecting' || qr) {
                void requestCode();
            }

            if (connection === 'open') {
                if (pairingOpened || settled) return;
                pairingOpened = true;
                updateSession(sessionKey, { status: 'paired', attempt });
                try {
                    await saveCreds();
                    await sock.sendMessage(`${number}@s.whatsapp.net`, {
                        text: '*⚡ MOMO-XMD inaunganishwa...*'
                    });
                } catch (error) {
                    logger.warn({ error: error.message }, 'Could not send pairing progress message');
                }

                incrementStats();
                updateSession(sessionKey, {
                    status: 'bot_starting',
                    code: undefined,
                    sessionId: undefined
                });
                closeSocket(sock);

                // Keep the auth directory: the bot uses it for the server-side handoff.
                void startBotFromAuth(sessionKey, authDir, `wa_${number}`);
                finish({ success: true, authDir });
                return;
            }

            if (connection === 'close' && !pairingOpened && !settled) {
                const code = statusCodeFromDisconnect(lastDisconnect);
                const linkedIdentity = Boolean(state?.creds?.me?.id || state?.creds?.me?.jid);

                // WhatsApp can close the short-lived pairing socket with 503 just
                // after the user accepts the code. If the auth state already has
                // a linked identity, hand it to the bot instead of discarding it
                // and asking the user to pair a second time.
                if (linkedIdentity) {
                    pairingOpened = true;
                    try {
                        await saveCreds();
                    } catch (error) {
                        logger.warn({ error: error.message }, 'Could not save linked auth after pairing socket close');
                    }
                    incrementStats();
                    updateSession(sessionKey, {
                        status: 'bot_starting',
                        attempt,
                        code: undefined,
                        sessionId: undefined,
                        message: `Linked auth detected after WhatsApp close (${code || 'unknown'}); starting bot`
                    });
                    closeSocket(sock);
                    void startBotFromAuth(sessionKey, authDir, `wa_${number}`);
                    finish({ success: true, authDir });
                    return;
                }

                const retryable = code === DisconnectReason.restartRequired
                    || code === DisconnectReason.timedOut
                    || code === 515
                    || code === 408
                    || code === 428
                    || code === 502
                    || code === 503
                    || code === 504;
                if (retryable && reconnectCount < 2) {
                    reconnectCount += 1;
                    codeRequested = false;
                    updateSession(sessionKey, {
                        status: 'reconnecting',
                        reconnect: reconnectCount,
                        message: `WhatsApp reconnect (${reconnectCount}/2)`
                    });
                    closeSocket(sock);
                    await delay(1000 * reconnectCount);
                    if (!settled && !pairingOpened) createSocket();
                } else {
                    fail(new Error(`WhatsApp connection closed${code ? ` (${code})` : ''}`));
                }
            }
        };

        function createSocket() {
            if (settled || pairingOpened) return;
            try {
                sock = makeWASocket({
                    version,
                    auth: {
                        creds: state.creds,
                        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                    },
                    browser: ['Mac OS', 'Safari', '17.4.1'],
                    agent: getProxyAgent(proxyUrl),
                    printQRInTerminal: false,
                    logger: pino({ level: 'silent' }),
                    connectTimeoutMs: 60_000,
                    defaultQueryTimeoutMs: 60_000,
                    markOnlineOnConnect: true
                });
                sock.ev.on('creds.update', saveCreds);
                sock.ev.on('connection.update', handleUpdate);
                void requestCode();
            } catch (error) {
                fail(error);
            }
        }

        timeoutHandle = setTimeout(() => {
            fail(new Error('Pairing request timed out after 120 seconds'));
        }, 120_000);

        createSocket();
    });
}

async function runPairing(sessionKey, number) {
    const strategies = [null, ...PROXY_LIST.sort(() => 0.5 - Math.random()).slice(0, 2)];
    let lastError = new Error('All pairing strategies failed');

    for (let index = 0; index < strategies.length; index += 1) {
        const proxyUrl = strategies[index];
        try {
            const result = await runPairingAttempt({
                sessionKey,
                number,
                proxyUrl,
                attempt: index + 1
            });
            if (result?.success) return;
        } catch (error) {
            lastError = error;
            logger.warn({ sessionKey, attempt: index + 1, error: error.message }, 'Pairing strategy failed');
        }
    }

    updateSession(sessionKey, { status: 'error', message: lastError.message });
}

// Allow users to open the pairing URL directly in a browser. The actual
// pairing request remains POST-only and is called by the page JavaScript.
app.get('/pair', (_req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/pair', async (req, res) => {
    const number = normalizeNumber(req.body?.number);
    if (number.length < 8 || number.length > 15) {
        return res.status(400).json({ success: false, error: 'Valid WhatsApp number required' });
    }

    let sessionKey;
    const release = await setupMutex.acquire();
    try {
        sessionKey = `momo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sessions.set(sessionKey, {
            status: 'starting',
            number,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    } finally {
        release();
    }

    // Keep the opaque pairing key server-side. The browser receives only an
    // HttpOnly cookie and never receives a WhatsApp SESSION_ID or session key.
    res.setHeader('Set-Cookie', `momo_pairing_token=${encodeURIComponent(sessionKey)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);
    void runPairing(sessionKey, number);
    return res.status(202).json({ success: true });
});

app.get('/session-status', (req, res) => {
    const sessionKey = getPairingKeyFromCookie(req);
    const session = sessionKey ? sessions.get(sessionKey) : null;
    if (!session) return res.status(404).json({ status: 'not_found' });
    return res.json(publicSession(session));
});

// Backward-compatible internal route. It never exposes number, auth paths, or
// SESSION_ID fields, but the current UI uses the cookie-only route above.
app.get('/session-status/:key', (req, res) => {
    const session = sessions.get(req.params.key);
    if (!session) return res.status(404).json({ status: 'not_found' });
    return res.json(publicSession(session));
});

app.get('/stats', (_req, res) => res.json(getStats()));

// Public-safe counter: expose only aggregate user count, never phone numbers,
// pairing keys, auth paths, or session details.
app.get('/public-stats', (_req, res) => {
    const stats = getStats();
    return res.json({ users: Number(stats.total_pairings || 0) });
});

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        logger.info({ port: PORT }, 'MOMO-XMD pairing server started');
    });
}

module.exports = app;
module.exports.setPairedBotStarter = setPairedBotStarter;
