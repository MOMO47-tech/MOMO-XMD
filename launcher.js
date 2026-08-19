const express = require('express');
const path = require('path');
const fs = require('fs');
const { startBot } = require('./lib/bot');
const config = require('./lib/config');

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'pairing/public')));

// Pairing API routes
const pairingServer = require('./pairing/server');
app.use('/', pairingServer);

app.listen(port, '0.0.0.0', () => {
    console.log(`[MOMO-XMD Universal Launcher] Running on port ${port}`);
    
    const sessionId = process.env.SESSION_ID || config.sessionId;
    if (sessionId) {
        console.log('[LAUNCHER] Starting bot with existing session...');
        startBot().catch(err => console.error('[BOT START ERROR]:', err));
    } else {
        console.log('[LAUNCHER] No Session ID found. Use the web interface to pair.');
    }
});
