const express = require("express");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");

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
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2)
    );
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

                result[relative] =
                    fs.readFileSync(full).toString("base64");
            }
        }
    }

    walk(dir);

    return result;
}

/*
|--------------------------------------------------------------------------
| HOME
|--------------------------------------------------------------------------
*/

router.get("/", (req, res) => {
    res.json({
        success: true,
        service: "MOMO-XMD Pairing Server",
        status: "online",
        pairing: "POST /pair",
        statusEndpoint: "GET /session-status/:sessionKey",
        registry: "GET /session-registry/:sessionId"
    });
});

/*
|--------------------------------------------------------------------------
| STATS
|--------------------------------------------------------------------------
*/

router.get("/stats", (req, res) => {
    const stats = loadJson(STATS_FILE, {
        totalPairings: 0,
        linkedNumbers: []
    });

    res.json(stats);
});

/*
|--------------------------------------------------------------------------
| SESSION REGISTRY
|--------------------------------------------------------------------------
*/

router.get(
    "/session-registry/:sessionId",
    (req, res) => {

        const registry =
            loadJson(REGISTRY_FILE, {});

        const session =
            registry[req.params.sessionId];

        if (!session) {
            return res.status(404).json({
                error: "Session not found"
            });
        }

        return res.json(session);
    }
);

router.post(
    "/session-registry/:sessionId",
    (req, res) => {
        const sessionId = req.params.sessionId;
        const { files } = req.body;
        if (!files) {
            return res.status(400).json({ error: "No files provided" });
        }
        const registry = loadJson(REGISTRY_FILE, {});
        registry[sessionId] = {
            fullNumber: sessionId,
            files,
            createdAt: Date.now()
        };
        saveJson(REGISTRY_FILE, registry);
        return res.json({ success: true });
    }
);

/*
|--------------------------------------------------------------------------
| CREATE PAIRING
|--------------------------------------------------------------------------
*/

router.post("/pair", async (req, res) => {

    const number = cleanNumber(req.body?.number);

    if (!number) {
        return res.status(400).json({
            success: false,
            error: "Number is required"
        });
    }

    if (number.length < 8 || number.length > 15) {
        return res.status(400).json({
            success: false,
            error: "Invalid phone number"
        });
    }

    const sessionKey =
        `momo_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

    const authDir =
        path.join(SESSION_DIR, sessionKey);

    console.log(
        `[PAIRING] Starting session ${sessionKey}`
    );

    console.log(
        `[PAIRING] Number: ${number}`
    );

    sessions.set(sessionKey, {
        status: "starting",
        number,
        createdAt: Date.now()
    });

    try {

        fs.mkdirSync(
            authDir,
            { recursive: true }
        );

        const {
            state,
            saveCreds
        } = await useMultiFileAuthState(authDir);

        const logger = pino({
            level: "silent"
        });

        /*
         * IMPORTANT:
         * Do NOT call fetchLatestBaileysVersion().
         *
         * Heroku and VPS must use the same installed
         * Baileys version.
         */

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

                keys:
                    makeCacheableSignalKeyStore(
                        state.keys,
                        logger
                    )
            },

            logger,

            printQRInTerminal: false,

            browser:
                ["Ubuntu", "Chrome", "20.0.04"],

            markOnlineOnConnect: true,

            connectTimeoutMs: 120000,

            defaultQueryTimeoutMs: 120000,

            keepAliveIntervalMs: 15000,

            syncFullHistory: false,

            generateHighQualityLinkPreview: false
        });

        sessions.set(
            sessionKey,
            {
                status: "connecting",
                number,
                sock,
                authDir,
                createdAt: Date.now()
            }
        );

        sock.ev.on(
            "creds.update",
            saveCreds
        );

        /*
        |--------------------------------------------------------------------------
        | CONNECTION
        |--------------------------------------------------------------------------
        */

        sock.ev.on(
            "connection.update",
            async (update) => {

                const {
                    connection,
                    lastDisconnect
                } = update;

                if (connection) {
                    console.log(
                        `[PAIRING:${sessionKey}] connection=${connection}`
                    );
                }

                /*
                |--------------------------------------------------------------------------
                | SUCCESSFUL LINK
                |--------------------------------------------------------------------------
                */

                if (connection === "open") {

                    console.log(
                        `[PAIRING:${sessionKey}] WhatsApp connected`
                    );

                    try {

                        await saveCreds();

                        /*
                         * Give creds.update time to finish.
                         */

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    2000
                                )
                        );

                        const files =
                            collectFiles(authDir);

                        const sessionId =
                            SESSION_PREFIX +
                            Buffer.from(
                                JSON.stringify({
                                    v: 1,
                                    n: number,
                                    t: Date.now(),
                                    k: sessionKey
                                })
                            )
                                .toString("base64")
                                .replace(/=+$/g, "");

                        /*
                        |--------------------------------------------------------------------------
                        | SAVE SESSION
                        |--------------------------------------------------------------------------
                        */

                        const registry =
                            loadJson(
                                REGISTRY_FILE,
                                {}
                            );

                        registry[sessionId] = {
                            fullNumber: number,
                            files,
                            createdAt: Date.now()
                        };

                        saveJson(
                            REGISTRY_FILE,
                            registry
                        );

                        /*
                        |--------------------------------------------------------------------------
                        | STATS
                        |--------------------------------------------------------------------------
                        */

                        const stats =
                            loadJson(
                                STATS_FILE,
                                {
                                    totalPairings: 0,
                                    linkedNumbers: []
                                }
                            );

                        if (
                            !stats.linkedNumbers.includes(
                                number
                            )
                        ) {
                            stats.linkedNumbers.push(
                                number
                            );
                        }

                        stats.totalPairings =
                            stats.linkedNumbers.length;

                        saveJson(
                            STATS_FILE,
                            stats
                        );

                        sessions.set(
                            sessionKey,
                            {
                                status: "linked",
                                number,
                                sessionId,
                                createdAt: Date.now()
                            }
                        );

                        console.log(
                            `[PAIRING:${sessionKey}] LINKED SUCCESSFULLY`
                        );

                        console.log(
                            `[PAIRING:${sessionKey}] Session ID: ${sessionId}`
                        );

                        /*
                         * Keep socket alive briefly.
                         * Do NOT logout.
                         */

                        setTimeout(
                            () => {

                                try {
                                    sock.end(
                                        undefined
                                    );
                                } catch {}

                                /*
                                 * IMPORTANT:
                                 * We do not delete registry.
                                 *
                                 * The saved session is what
                                 * the Heroku bot restores.
                                 */

                                try {
                                    if (
                                        fs.existsSync(
                                            authDir
                                        )
                                    ) {
                                        fs.rmSync(
                                            authDir,
                                            {
                                                recursive: true,
                                                force: true
                                            }
                                        );
                                    }
                                } catch {}

                            },
                            10000
                        );

                    } catch (error) {

                        console.error(
                            `[PAIRING:${sessionKey}] SAVE ERROR`,
                            error
                        );

                        sessions.set(
                            sessionKey,
                            {
                                status: "error",
                                number,
                                message:
                                    error.message
                            }
                        );
                    }
                }

                /*
                |--------------------------------------------------------------------------
                | CONNECTION CLOSED
                |--------------------------------------------------------------------------
                */

                if (connection === "close") {

                    const reason =
                        lastDisconnect
                            ?.error
                            ?.output
                            ?.statusCode;

                    console.log(
                        `[PAIRING:${sessionKey}] CLOSED reason=${reason}`
                    );

                    const current =
                        sessions.get(
                            sessionKey
                        );

                    if (
                        current?.status !==
                        "linked"
                    ) {

                        sessions.set(
                            sessionKey,
                            {
                                ...current,
                                status: "error",
                                message: `Connection closed (${reason})`
                            }
                        );
                    }
                }
            }
        );

        /*
        |--------------------------------------------------------------------------
        | REQUEST REAL WHATSAPP PAIRING CODE
        |--------------------------------------------------------------------------
        */

        // Request code after socket establishes connection (4 seconds delay)
        setTimeout(
            async () => {
                try {
                    if (sessions.get(sessionKey)?.status === "error") {
                        return;
                    }
                    if (sock.authState.creds.registered) {
                        return;
                    }
                    console.log(`[PAIRING:${sessionKey}] Requesting real WhatsApp pairing code for ${number}`);
                    const code = await sock.requestPairingCode(number);
                    if (!code) {
                        throw new Error("WhatsApp did not return a pairing code");
                    }
                    sessions.set(
                        sessionKey,
                        {
                            status: "awaiting_link",
                            number,
                            code,
                            sock,
                            authDir,
                            createdAt: Date.now()
                        }
                    );
                    console.log(`[PAIRING:${sessionKey}] REAL CODE: ${code}`);
                } catch (error) {
                    console.error(`[PAIRING:${sessionKey}] CODE ERROR:`, error?.message || error);
                    sessions.set(
                        sessionKey,
                        {
                            status: "error",
                            message: error.message
                        }
                    );
                }
            },
            4000
        );

        /*
        |--------------------------------------------------------------------------
        | RETURN SESSION KEY
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            sessionKey,
            status: "starting"
        });

    } catch (error) {

        console.error(
            "[PAIRING SERVER ERROR]",
            error
        );

        sessions.set(
            sessionKey,
            {
                status: "error",
                message: error.message
            }
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/*
|--------------------------------------------------------------------------
| SESSION STATUS
|--------------------------------------------------------------------------
*/

router.get(
    "/session-status/:sessionKey",
    (req, res) => {

        const session =
            sessions.get(
                req.params.sessionKey
            );

        if (!session) {
            return res.status(404).json({
                success: false,
                error: "Session not found"
            });
        }

        return res.json({
            success: true,
            status: session.status,
            code: session.code || null,
            sessionId:
                session.sessionId || null,
            message:
                session.message || null
        });
    }
);

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

router.get("/health", (req, res) => {

    res.json({
        success: true,
        service: "MOMO-XMD Pairing",
        status: "online",
        time: Date.now()
    });
});

module.exports = router;

if (require.main === module) {
    const express = require('express');
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
