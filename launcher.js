const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { startBot } = require('./lib/bot');
const config = require('./lib/config');
const { configured: supabaseConfigured, listSessions, restoreSession } = require('./lib/session-store');

process.on('unhandledRejection', error => {
    console.error('[PROCESS] Unhandled promise rejection:', error?.stack || error);
});
process.on('uncaughtException', error => {
    console.error('[PROCESS] Uncaught exception:', error?.stack || error);
});

const app = express();

const hasAuthState = (directory) => {
    try {
        return Boolean(directory && fs.existsSync(path.join(directory, 'creds.json')));
    } catch (_) {
        return false;
    }
};

const findPersistedAuthDir = () => {
    const candidates = [path.join(__dirname, 'session')];
    try {
        for (const name of fs.readdirSync(__dirname)) {
            if (name.startsWith('auth_')) candidates.push(path.join(__dirname, name));
        }
    } catch (_) {}
    try {
        for (const name of fs.readdirSync(path.join(__dirname, 'pairing'))) {
            if (name.startsWith('temp_')) candidates.push(path.join(__dirname, 'pairing', name));
        }
    } catch (_) {}
    return candidates
        .filter(hasAuthState)
        .sort((left, right) => {
            try { return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs; } catch (_) { return 0; }
        })[0] || null;
};
const port = process.env.PORT || 8000;
console.log(`[LAUNCHER] build=${process.env.SOURCE_VERSION || process.env.HEROKU_SLUG_COMMIT || 'unknown'} node=${process.version}`);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'pairing/public')));

// Pairing API routes
const pairingServer = require('./pairing/server');
if (typeof pairingServer.setPairedBotStarter === 'function') {
    pairingServer.setPairedBotStarter((authDir, persistentKey) => startBot({ authDir, sessionId: null, sessionKey: persistentKey }));
}
app.use('/', pairingServer);

const startBotWithRetry = (options, label) => {
    startBot(options).catch(error => {
        console.error(`[BOT START ERROR]${label ? ` ${label}` : ''}:`, error);
        if (error?.code === 'WHATSAPP_LOGGED_OUT') {
            console.warn('[LAUNCHER] WhatsApp session is logged out; keeping pairing server online for a new pair.');
            return;
        }
        setTimeout(() => startBotWithRetry(options, label), 15000).unref?.();
    });
};

const sessionDirectoryFor = (sessionKey) => {
    const digest = crypto.createHash('sha256').update(String(sessionKey)).digest('hex').slice(0, 16);
    return path.join(__dirname, `session_${digest}`);
};

const restoreAllSupabaseSessions = async () => {
    const keys = await listSessions();
    if (!keys.length) {
        console.log('[LAUNCHER] Supabase has no paired auth. Use the web interface to pair.');
        return;
    }

    console.log(`[LAUNCHER] Restoring ${keys.length} paired user session(s) from Supabase`);
    for (const sessionKey of keys) {
        const authDir = sessionDirectoryFor(sessionKey);
        try {
            const restored = await restoreSession(sessionKey, authDir);
            if (!restored) {
                console.warn(`[LAUNCHER] Skipping ${sessionKey.slice(0, 18)}...: no valid creds.json`);
                continue;
            }
            console.log(`[LAUNCHER] Restoring paired auth from Supabase (${sessionKey.slice(0, 18)}...)`);
            startBotWithRetry({ authDir, sessionId: null, sessionKey }, `Supabase session ${sessionKey.slice(0, 18)}...`);
            // Stagger socket handshakes so a restart does not open every
            // WhatsApp connection at the exact same instant.
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
            console.error(`[LAUNCHER] Could not restore ${sessionKey.slice(0, 18)}...:`, error?.message || error);
        }
    }
};

app.listen(port, '0.0.0.0', () => {
    console.log(`[MOMO-XMD Universal Launcher] Running on port ${port}`);
    
    const sessionId = process.env.SESSION_ID || config.sessionId;
    const persistedAuthDir = findPersistedAuthDir();
    if (sessionId) {
        console.log('[LAUNCHER] Starting bot with existing session...');
        startBotWithRetry({}, 'existing session');
    } else if (supabaseConfigured()) {
        restoreAllSupabaseSessions().catch(err => console.error('[BOT START ERROR] Supabase restore:', err));
    } else if (persistedAuthDir) {
        console.log(`[LAUNCHER] Restoring paired auth from ${persistedAuthDir}`);
        startBotWithRetry({ authDir: persistedAuthDir, sessionId: null }, 'local paired auth');
    } else {
        console.log('[LAUNCHER] No paired auth found. Use the web interface to pair; bot will start automatically after linking.');
    }
});
