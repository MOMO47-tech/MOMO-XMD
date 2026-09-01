const express = require('express');
const path = require('path');
const fs = require('fs');
const { startBot } = require('./lib/bot');
const config = require('./lib/config');
const { configured: supabaseConfigured, listSessions, restoreSession } = require('./lib/session-store');

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
        setTimeout(() => startBotWithRetry(options, label), 15000).unref?.();
    });
};

app.listen(port, '0.0.0.0', () => {
    console.log(`[MOMO-XMD Universal Launcher] Running on port ${port}`);
    
    const sessionId = process.env.SESSION_ID || config.sessionId;
    const persistedAuthDir = findPersistedAuthDir();
    if (sessionId) {
        console.log('[LAUNCHER] Starting bot with existing session...');
        startBotWithRetry({}, 'existing session');
    } else if (persistedAuthDir) {
        console.log(`[LAUNCHER] Restoring paired auth from ${persistedAuthDir}`);
        startBotWithRetry({ authDir: persistedAuthDir, sessionId: null }, 'local paired auth');
    } else if (supabaseConfigured()) {
        listSessions().then(async (keys) => {
            if (!keys.length) {
                console.log('[LAUNCHER] Supabase has no paired auth. Use the web interface to pair.');
                return;
            }
            // One socket is started per deployment. Keep the newest persisted
            // account active; additional accounts remain safely stored.
            const sessionKey = process.env.SUPABASE_SESSION_KEY || keys[0];
            const authDir = path.join(__dirname, 'session');
            await restoreSession(sessionKey, authDir);
            console.log(`[LAUNCHER] Restoring paired auth from Supabase (${sessionKey.slice(0, 18)}...)`);
            startBotWithRetry({ authDir, sessionId: null, sessionKey }, 'Supabase session');
        }).catch(err => console.error('[BOT START ERROR]:', err));
    } else {
        console.log('[LAUNCHER] No paired auth found. Use the web interface to pair; bot will start automatically after linking.');
    }
});
