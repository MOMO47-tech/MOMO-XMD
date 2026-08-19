const express = require('express');
const path = require('path');
process.env.PATH = path.join(__dirname, 'bin') + ':' + process.env.PATH;

const sessionId = String(process.env.SESSION_ID || process.env.SESSION || '').trim();

const app = express();
const port = Number(process.env.PORT || process.env.SERVER_PORT || 8000);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/healthz', (req, res) => {
    res.json({ 
        ok: true, 
        service: 'momo-xmd', 
        mode: sessionId ? 'bot+pairing' : 'pairing',
        uptime: process.uptime() 
    });
});

// Mount pairing router so that any hosting (Panel, VPS, Heroku, Linux, Bot Hosting) can access pairing and bot simultaneously
const pairingRouter = require('./pairing/server');
app.use('/', pairingRouter);

app.listen(port, '0.0.0.0', () => {
    console.log(`[MOMO-XMD Universal Launcher] Running on port ${port} | Session: ${sessionId ? 'Active' : 'Not Set'}`);
});

if (sessionId) {
    const { startBot } = require('./lib/bot');
    startBot().catch((error) => {
        console.error('[MOMO-XMD] Bot startup failed:', error);
    });
}
