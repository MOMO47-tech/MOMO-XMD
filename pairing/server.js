const express = require("express");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    delay
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");
const { HttpProxyAgent } = require("http-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

const PROXY_LIST = [
    "http://hfhlmfza:mbljtr3cnwzm@31.59.20.176:6754",
    "http://hfhlmfza:mbljtr3cnwzm@31.56.127.193:7684",
    "http://hfhlmfza:mbljtr3cnwzm@45.38.107.97:6014",
    "http://hfhlmfza:mbljtr3cnwzm@198.105.121.200:6462",
    "http://hfhlmfza:mbljtr3cnwzm@64.137.96.74:6641",
    "http://hfhlmfza:mbljtr3cnwzm@198.23.243.226:6361",
    "http://hfhlmfza:mbljtr3cnwzm@38.154.185.97:6370",
    "http://hfhlmfza:mbljtr3cnwzm@84.247.60.125:6095",
    "http://hfhlmfza:mbljtr3cnwzm@142.111.67.146:5611",
    "http://hfhlmfza:mbljtr3cnwzm@191.96.254.138:6185"
];

function getProxyAgent(proxyUrl) {
    if (!proxyUrl) return null;
    try {
        if (proxyUrl.startsWith('socks')) return new SocksProxyAgent(proxyUrl);
        if (proxyUrl.startsWith('https')) return new HttpsProxyAgent(proxyUrl);
        return new HttpProxyAgent(proxyUrl);
    } catch (e) {
        return null;
    }
}

const router = express.Router();
const sessions = new Map();

const SESSION_DIR = path.join(__dirname, "temp_sessions");
const REGISTRY_FILE = path.join(__dirname, "sessions.json");
const STATS_FILE = path.join(__dirname, "stats.json");
const SESSION_PREFIX = "MOMO-XMD~";

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function cleanNumber(number) {
    return String(number || "").replace(/\D/g, "");
}

function loadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function collectFiles(dir) {
    const result = {};
    function walk(current) {
        if (!fs.existsSync(current)) return;
        for (const name of fs.readdirSync(current)) {
            const full = path.join(current, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full);
            } else {
                const relative = path.relative(dir, full);
                result[relative] = fs.readFileSync(full).toString("base64");
            }
        }
    }
    walk(dir);
    return result;
}

router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

router.get("/stats", (req, res) => {
    const stats = loadJson(STATS_FILE, { totalPairings: 0, linkedNumbers: [] });
    res.json(stats);
});

router.get("/session-registry/:sessionId", (req, res) => {
    const registry = loadJson(REGISTRY_FILE, {});
    const session = registry[req.params.sessionId];
    if (!session) return res.status(404).json({ error: "Session not found" });
    return res.json(session);
});

router.post("/session-registry/:sessionId", (req, res) => {
    const sessionId = req.params.sessionId;
    const { files } = req.body;
    if (!files) return res.status(400).json({ error: "No files provided" });
    const registry = loadJson(REGISTRY_FILE, {});
    registry[sessionId] = { fullNumber: sessionId, files, createdAt: Date.now() };
    saveJson(REGISTRY_FILE, registry);
    return res.json({ success: true });
});

router.post("/pair", async (req, res) => {
    const number = cleanNumber(req.body?.number);
    if (!number) return res.status(400).json({ success: false, error: "Number is required" });
    
    const sessionKey = `momo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const authDir = path.join(SESSION_DIR, sessionKey);

    console.log(`[PAIRING] Starting session ${sessionKey} for ${number}`);
    sessions.set(sessionKey, { status: "starting", number, createdAt: Date.now() });

    res.json({ success: true, sessionKey, status: "starting" });

    (async () => {
        // Strategy: [Direct, Proxy1, Proxy2]
        const strategies = [null, PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)], PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)]];
        let lastError = null;

        for (const proxy of strategies) {
            if (sessions.get(sessionKey)?.status === "linked") break;
            
            const strategyDir = path.join(authDir, proxy ? 'proxy' : 'direct');
            if (fs.existsSync(strategyDir)) fs.rmSync(strategyDir, { recursive: true, force: true });
            fs.mkdirSync(strategyDir, { recursive: true });

            try {
                console.log(`[STRATEGY] ${sessionKey} using: ${proxy || 'Direct Connection'}`);
                const { state, saveCreds } = await useMultiFileAuthState(strategyDir);
                
                let version;
                try {
                    const fetched = await fetchLatestBaileysVersion();
                    version = fetched.version;
                } catch (e) {
                    version = [2, 3000, 1015901307];
                }

                const sock = makeWASocket({
                    version,
                    auth: {
                        creds: state.creds,
                        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
                    },
                    logger: pino({ level: "silent" }),
                    printQRInTerminal: false,
                    // RESTORED BROWSER IDENTITY FROM SKULL VERSION
                    browser: ["MOMO-XMD", "Chrome", "1.0.0"],
                    agent: getProxyAgent(proxy),
                    markOnlineOnConnect: true,
                    connectTimeoutMs: 60000,
                    defaultQueryTimeoutMs: 60000,
                    keepAliveIntervalMs: 15000,
                    syncFullHistory: false
                });

                sessions.set(sessionKey, { status: "connecting", number, sock, authDir: strategyDir, createdAt: Date.now() });

                sock.ev.on("creds.update", saveCreds);

                sock.ev.on("connection.update", async (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    
                    if (connection === "open") {
                        console.log(`[PAIRING:${sessionKey}] WhatsApp connected!`);
                        try {
                            await saveCreds();
                            await delay(5000);
                            const files = collectFiles(strategyDir);
                            const sessionId = SESSION_PREFIX + Buffer.from(JSON.stringify({ v: 1, n: number, t: Date.now(), k: sessionKey })).toString("base64").replace(/=+$/g, "");

                            const registry = loadJson(REGISTRY_FILE, {});
                            registry[sessionId] = { fullNumber: number, files, createdAt: Date.now() };
                            saveJson(REGISTRY_FILE, registry);

                            const stats = loadJson(STATS_FILE, { totalPairings: 0, linkedNumbers: [] });
                            if (!stats.linkedNumbers.includes(number)) stats.linkedNumbers.push(number);
                            stats.totalPairings = (stats.totalPairings || 0) + 1;
                            saveJson(STATS_FILE, stats);

                            sessions.set(sessionKey, { status: "linked", number, sessionId, createdAt: Date.now() });
                            
                            try {
                                const welcome = `*MOMO-XMD CONNECTED SUCCESSFULLY!* ☠️\n\n*Session ID:*\n\n${sessionId}\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
                                await sock.sendMessage(sock.user.id, { text: welcome });
                            } catch (e) {}

                            setTimeout(() => {
                                try { sock.end(undefined); } catch {}
                                try { fs.rmSync(strategyDir, { recursive: true, force: true }); } catch {}
                            }, 10000);
                        } catch (e) {
                            console.error(`[PAIRING:${sessionKey}] Save error:`, e);
                        }
                    }

                    if (connection === "close") {
                        const reason = lastDisconnect?.error?.output?.statusCode;
                        if (reason === DisconnectReason.restartRequired || reason === 515) {
                            // Handled by the loop or background logic if needed
                        }
                    }
                });

                // Wait for socket to stabilize then request code
                await delay(8000);
                if (sessions.get(sessionKey)?.status === "linked") break;

                console.log(`[PAIRING:${sessionKey}] Requesting code for ${number}...`);
                const code = await sock.requestPairingCode(number);
                if (code) {
                    sessions.set(sessionKey, { status: "awaiting_link", number, code, sock, authDir: strategyDir, createdAt: Date.now() });
                    console.log(`[PAIRING:${sessionKey}] REAL CODE: ${code}`);
                    break;
                }
            } catch (err) {
                console.error(`[PAIRING:${sessionKey}] Strategy failed (${proxy || 'Direct'}): ${err.message}`);
                lastError = err.message;
                try { fs.rmSync(strategyDir, { recursive: true, force: true }); } catch {}
                if (err.message.includes('Connection') || err.message.includes('Timed out')) continue;
                else break;
            }
        }

        if (sessions.get(sessionKey)?.status !== "awaiting_link" && sessions.get(sessionKey)?.status !== "linked") {
            sessions.set(sessionKey, { status: "error", message: lastError || "Failed to generate code" });
        }
    })();
});

router.get("/session-status/:sessionKey", (req, res) => {
    const session = sessions.get(req.params.sessionKey);
    if (!session) return res.status(404).json({ success: false, error: "Session not found" });
    return res.json({
        success: true,
        status: session.status,
        code: session.code || null,
        sessionId: session.sessionId || null,
        message: session.message || null
    });
});

router.get("/health", (req, res) => {
    res.json({ success: true, service: "MOMO-XMD Pairing", status: "online", time: Date.now() });
});

module.exports = router;

if (require.main === module) {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/', router);
    const port = process.env.PORT || 8000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`[MOMO-XMD Pairing Standalone] Running on port ${port}`);
    });
}
