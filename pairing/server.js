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
const MAX_CODE_ATTEMPTS = 3;
const MAX_RESTARTS = 2;

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
        
        // Return whichever is higher to ensure it never goes down
        return { totalPairings: Math.max(count, persistentCount) };
    } catch (e) {
        return { totalPairings: 0 };
    }
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
    } catch (e) {
        return 0;
    }
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
    // 9-character prefix + origin marker + 22 random uppercase base36 chars = 32 chars.
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
    registry[sessionId] = { createdAt: Date.now(), number: maskNumber(number), fullNumber: number, files };
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
app.use('/media', express.static(path.join(__dirname, '..', 'media')));

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
    res.json({ sessionId: token, fullNumber: entry.fullNumber, files: entry.files });
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
    let restartCount = 0;
    let reconnectInProgress = false;
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
            logger.info({ version, isLatest: latest?.isLatest }, 'Using WhatsApp Web version');
        } catch (error) {
            logger.warn({ error: error.message, version }, 'Could not fetch latest WhatsApp Web version; using fallback');
        }

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
                logger.error({ sessionKey, error: error.message }, 'Could not save compact Session ID registry');
                updateSession(sessionKey, {
                    status: 'error',
                    errorCode: 'SESSION_REGISTRY_FAILED',
                    message: 'Pairing completed but Session ID could not be saved. Please generate a new code.'
                });
                closeSocket(currentSock);
                removeAuthFolder(authDir, 30_000);
                return;
            }
            updateSession(sessionKey, {
                status: 'delivery_pending',
                message: 'Device linked. Sending Session ID to your WhatsApp inbox...'
            });
            logger.info({ sessionKey, sessionIdLength: sessionId.length }, 'WhatsApp pairing completed; inbox delivery pending');

            const recipientJid = `${number}@s.whatsapp.net`;
            // Send exactly three separate WhatsApp messages. The Session ID and every
            // URL are deliberately plain text; only the headings/instructions use bold.
                        const inboxMessages = [
                `*⚡ Generating session...*`,
                sessionId,
                `╭━━━━━━━━━━━━━━━━━━━━━━╮
┃ ✦ 🟢 SESSION LINKED ✦
┃ ✦ Paste it as SESSION during deploy.
┃ ✦ Session ID: ${sessionId}
┃ ✦ OWNER: MOMO47
┃ ✦ +255 760 298 574
┃ ✦ +255 765 409 584
┃ ✦ Channel 1: https://whatsapp.com/channel/0029Vb8AYLf2f3EA8Y4qp63H
┃ ✦ Channel 2: https://whatsapp.com/channel/0029VbDNET6KmCPShs9dyg1U
┃ ✦ Channel 3: https://whatsapp.com/channel/0029VbDeRauAjPXFYDvO5e2D
┃ ✦ Channel 4: https://whatsapp.com/channel/0029VbDYZ7LBVJky0TggGF2N
╰━━━━━━━━━━━━━━━━━━━━━━╯
❑❑❑`
            ];

            let inboxDelivered = false;
            let sentMessageCount = 0;
            let lastInboxError;
            for (let attempt = 1; attempt <= 4 && !inboxDelivered; attempt++) {
                try {
                    if (attempt > 1) await delay(2000);
                    while (sentMessageCount < inboxMessages.length) {
                        const messageIndex = sentMessageCount;
                        const messagePayload = { text: inboxMessages[messageIndex] };

                        // Only the third message gets the real clickable deploy button.
                        // Message 2 remains the raw Session ID with no wrapper text.
                        if (messageIndex === 2) {
                            messagePayload.footer = 'MOMO-XMD • MOMO47';
                            messagePayload.templateButtons = [
                                {
                                    index: 1,
                                    urlButton: {
                                        displayText: 'DEPLOY TO HEROKU',
                                        url: 'https://heroku.com/deploy?template=https://github.com/MOMO47-tech/MOMO-XMD'
                                    }
                                }
                            ];
                        }

                        await currentSock.sendMessage(recipientJid, messagePayload);
                        sentMessageCount += 1;
                        if (sentMessageCount < inboxMessages.length) await delay(450);
                    }
                    inboxDelivered = true;
                    updateSession(sessionKey, {
                        status: 'connected',
                        sessionId,
                        message: 'Session ID delivered in three WhatsApp inbox messages.'
                    });
                    logger.info({ sessionKey, recipientJid, attempt, messageCount: sentMessageCount }, 'Session ID delivered in three separate WhatsApp inbox messages');
                } catch (error) {
                    lastInboxError = error;
                    logger.warn({ sessionKey, recipientJid, attempt, sentMessageCount, error: error.message }, 'Session inbox message delivery attempt failed');
                }
            }
            if (inboxDelivered) {
                const totalPairings = incrementStats();
                logger.info({ sessionKey, totalPairings }, 'Completed pairing is included in the truthful server user counter');
            }
            if (!inboxDelivered) {
                updateSession(sessionKey, {
                    status: 'delivery_failed',
                    errorCode: 'INBOX_DELIVERY_FAILED',
                    message: 'WhatsApp linked, but Session ID delivery to the inbox failed. Please retry pairing.'
                });
                logger.error({ sessionKey, recipientJid, error: lastInboxError?.message }, 'Session ID could not be delivered to WhatsApp inbox');
            }

            // Let the authenticated socket flush its final key updates before cleanup.
            setTimeout(() => {
                closeSocket(currentSock);
                removeAuthFolder(authDir, 30_000);
            }, 15_000);
        };

        const reconnectAfterPair = async (currentSock, code, message) => {
            if (finished || reconnectInProgress) return;
            if (restartCount >= MAX_RESTARTS) {
                markTerminalError(`WhatsApp requested too many restarts (${code}). Generate a new code and retry.`, code);
                return;
            }

            reconnectInProgress = true;
            restartCount += 1;
            updateSession(sessionKey, {
                status: 'restarting',
                errorCode: code,
                message: 'WhatsApp accepted the code and is restarting the companion connection.'
            });
            logger.info({ sessionKey, code, restartCount, message }, 'Reconnecting after WhatsApp pairing restart');

            try {
                // The 515 close can arrive immediately after pair-success. Wait for all
                // creds.update callbacks already queued by Baileys to finish before loading
                // the same auth state into the replacement socket.
                await delay(150);
                await pendingCredsSave;
                closeSocket(currentSock);
                if (finished) return;
                sock = createSocket();
            } catch (error) {
                markTerminalError(`Could not restart the linked session: ${error.message}`, code);
            } finally {
                reconnectInProgress = false;
            }
        };

        const requestCode = async () => {
            if (codeRequested || finished || state.creds.registered) return;
            codeRequested = true;
            let lastError;
            for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS && !finished; attempt++) {
                try {
                    const code = await sock.requestPairingCode(number);
                    if (!code) throw new Error('WhatsApp returned an empty pairing code');
                    updateSession(sessionKey, { status: 'awaiting_link', code, codeAttempts: attempt });
                    logger.info({ sessionKey, attempt }, 'Pairing code generated');
                    linkTimer = setTimeout(() => {
                        if (finished) return;
                        markTerminalError('Pairing code expired before WhatsApp completed the link. Generate a new code and try again.', 408, 'timeout');
                    }, LINK_TIMEOUT_MS);
                    return;
                } catch (error) {
                    lastError = error;
                    logger.warn({ sessionKey, attempt, error: error.message }, 'Pairing-code request failed');
                    if (attempt < MAX_CODE_ATTEMPTS && !finished) await delay(3_000 * attempt);
                }
            }
            if (!finished) {
                markTerminalError(`Could not request a pairing code: ${lastError?.message || 'unknown error'}`);
            }
        };

        const handleConnectionUpdate = async (currentSock, update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;
            if (currentSock !== sock && connection !== 'close') return;

            if (connection) {
                logger.info({ sessionKey, number: maskNumber(number), connection, isNewLogin: Boolean(isNewLogin) }, 'Baileys connection state');
                if (connection === 'connecting') updateSession(sessionKey, { status: 'connecting' });
                if (connection === 'open') updateSession(sessionKey, { status: 'open' });
            }

            if (isNewLogin) {
                loginConfirmed = true;
                updateSession(sessionKey, {
                    status: 'restarting',
                    message: 'WhatsApp accepted the pairing code; finishing secure login.'
                });
                logger.info({ sessionKey }, 'WhatsApp reported a new login');
            }

            if (qr && !state.creds.registered && !codeRequested) {
                await requestCode();
            }

            if (connection === 'open') {
                await completePairing(currentSock);
                return;
            }

            if (connection === 'close') {
                const code = getDisconnectCode(lastDisconnect?.error);
                const message = getDisconnectMessage(lastDisconnect?.error);
                const paired = loginConfirmed || Boolean(state.creds.registered || state.creds.me?.id);
                logger.warn({ sessionKey, number: maskNumber(number), code, message, paired }, 'Baileys connection closed');

                // 515 is WhatsApp's normal post-pair restart signal. 408 can also be
                // emitted after pair-success when the old registration socket expires.
                if (!finished && (code === DisconnectReason.restartRequired || (code === DisconnectReason.connectionLost && paired))) {
                    await reconnectAfterPair(currentSock, code, message);
                    return;
                }

                if (!finished) {
                    const status = code === DisconnectReason.timedOut || code === 408 ? 'timeout' : 'error';
                    markTerminalError(
                        status === 'timeout'
                            ? 'WhatsApp connection timed out before the device finished linking. Generate a new code and retry.'
                            : `WhatsApp connection closed (${code ?? 'unknown'}): ${message}`,
                        code,
                        status
                    );
                }
            }
        };

        const createSocket = () => {
            const currentSock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                },
                // Baileys 7 normalizes this canonical Ubuntu/Chrome descriptor for the
                // strict companion_hello pairing request.
                browser: Browsers.ubuntu('Chrome'),
                printQRInTerminal: false,
                logger,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                msgRetryCounterCache,
                connectTimeoutMs: 60_000,
                defaultQueryTimeoutMs: 60_000,
                keepAliveIntervalMs: 15_000
            });

            currentSock.ev.on('creds.update', () => {
                queueCredsSave().catch(() => {});
            });
            currentSock.ev.on('connection.update', (update) => {
                handleConnectionUpdate(currentSock, update).catch((error) => {
                    logger.error({ sessionKey, error: error.message, stack: error.stack }, 'Unhandled connection.update error');
                    markTerminalError(`Pairing handler failed: ${error.message}`);
                });
            });
            return currentSock;
        };

        sock = createSocket();
        // Safety fallback in case a future Baileys build does not emit qr promptly.
        codeTimer = setTimeout(() => requestCode(), 10_000);

        return res.json({ success: true, sessionKey });
    } catch (error) {
        logger.error({ sessionKey, error: error.message, stack: error.stack }, 'Pairing setup failed');
        updateSession(sessionKey, { status: 'error', message: error.message });
        closeSocket(sock);
        removeAuthFolder(authDir, 30_000);
        return res.status(500).json({ success: false, error: error.message, sessionKey });
    } finally {
        release();
    }
});

app.get('/stats', (req, res) => res.json(getStats()));

app.get('/session-status/:key', (req, res) => {
    const session = sessions.get(req.params.key);
    if (!session) return res.status(404).json({ status: 'not_found' });
    res.json({
        status: session.status,
        code: session.code,
        sessionId: session.sessionId,
        message: session.message,
        errorCode: session.errorCode,
        updatedAt: session.updatedAt
    });
});

app.listen(PORT, () => logger.info({ port: PORT }, 'MOMO-XMD pairing server started'));

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
