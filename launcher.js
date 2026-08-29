const express = require('express');
const path = require('path');
const fs = require('fs');
const { startBot } = require('./lib/bot');
const config = require('./lib/config');

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
    pairingServer.setPairedBotStarter((authDir) => startBot({ authDir, sessionId: null }));
}
app.use('/', pairingServer);

app.listen(port, '0.0.0.0', () => {
    console.log(`[MOMO-XMD Universal Launcher] Running on port ${port}`);
    
    const sessionId = process.env.SESSION_ID || config.sessionId;
    const persistedAuthDir = findPersistedAuthDir();
    if (sessionId) {
        console.log('[LAUNCHER] Starting bot with existing session...');
        startBot().catch(err => console.error('[BOT START ERROR]:', err));
    } else if (persistedAuthDir) {
        console.log(`[LAUNCHER] Restoring paired auth from ${persistedAuthDir}`);
        startBot({ authDir: persistedAuthDir, sessionId: null })
            .catch(err => console.error('[BOT START ERROR]:', err));
    } else {
        console.log('[LAUNCHER] No paired auth found. Use the web interface to pair; bot will start automatically after linking.');
    }
});
