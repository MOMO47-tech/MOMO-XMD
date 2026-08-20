const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers,
    delay,
    jidDecode
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const { Boom } = require("@hapi/boom");
const axios = require("axios");
const config = require("../config");
const menuText = require("./menu");

const SESSION_DIR = path.join(__dirname, "../session");
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const DEFAULT_REGISTRY_ENDPOINTS = [
    "https://momo-xmd-pairing-4086f8388df8.herokuapp.com/session-registry/",
    "http://212.224.86.233:8000/session-registry/"
];

async function restoreSession(sessionId) {
    if (!sessionId) return null;
    const sessionPath = path.join(SESSION_DIR, "creds.json");
    
    for (const endpoint of DEFAULT_REGISTRY_ENDPOINTS) {
        try {
            const res = await axios.get(`${endpoint}${sessionId}`, { timeout: 10000 });
            if (res.data && res.data.files) {
                const files = res.data.files;
                for (const [relPath, base64] of Object.entries(files)) {
                    const fullPath = path.join(SESSION_DIR, relPath);
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(fullPath, Buffer.from(base64, "base64"));
                }
                return true;
            }
        } catch (e) {}
    }
    return fs.existsSync(sessionPath);
}

async function startBot() {
    const sessionId = process.env.SESSION_ID || config.sessionId;
    if (sessionId) await restoreSession(sessionId);

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: !sessionId,
        logger: pino({ level: "fatal" }),
        browser: ["MOMO-XMD", "Chrome", "120.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[BOT] Reconnecting...");
                setTimeout(startBot, 5000);
            } else {
                console.log("[BOT] Logged out. Delete session folder and restart.");
                process.exit(0);
            }
        } else if (connection === "open") {
            console.log("[BOT] Connected successfully! ☠️");
            const welcome = `*MOMO-XMD BOT IS ONLINE!* ☠️\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
            await sock.sendMessage(sock.user.id, { text: welcome });
        }
    });

    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            const type = Object.keys(msg.message)[0];
            const content = JSON.stringify(msg.message);
            const body = type === "conversation" ? msg.message.conversation : type === "extendedTextMessage" ? msg.message.extendedTextMessage.text : type === "imageMessage" ? msg.message.imageMessage.caption : type === "videoMessage" ? msg.message.videoMessage.caption : "";
            
            const prefix = config.prefix || ".";
            const isCmd = body.startsWith(prefix);
            const command = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : "";
            const args = body.trim().split(/ +/).slice(1);
            
            const isOwner = [config.ownerNumber, "255760298574", "255765409584"].some(num => from.includes(num));

            if (command === "menu") {
                await sock.sendMessage(from, { text: menuText(msg.pushName || "User", "Active", "Fast", "Normal", config.mode) }, { quoted: msg });
            }

            if (command === "ping") {
                await sock.sendMessage(from, { text: `*PONG!* 🚀\nLatency: ${Date.now() - msg.messageTimestamp * 1000}ms` }, { quoted: msg });
            }

            // ADD OTHER COMMANDS HERE OR LOAD FROM PLUGINS
        } catch (e) {
            console.error("[BOT] Message error:", e);
        }
    });

    return sock;
}

module.exports = { startBot };
