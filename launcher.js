const express = require('express');
const path = require('path');
process.env.PATH = path.join(__dirname, 'bin') + ':' + process.env.PATH;

const sessionId = String(process.env.SESSION_ID || '').trim();

if (sessionId) {
    // One-click Heroku deployments with SESSION_ID run the actual bot.
    const { startBot } = require('./lib/bot');
    const app = express();
    const port = Number(process.env.PORT || 8000);

    app.get('/healthz', (req, res) => {
        res.json({ ok: true, service: 'momo-xmd-bot', uptime: process.uptime() });
    });

    app.listen(port, () => {
        console.log(`[MOMO-XMD] Bot health server listening on ${port}`);
    });

    startBot().catch((error) => {
        console.error('[MOMO-XMD] Bot startup failed:', error);
        process.exitCode = 1;
    });
} else {
    // The existing pairing deployment continues to work when no SESSION_ID is set.
    require('./pairing/server');
}
