const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers,
    delay,
    jidDecode,
    normalizeMessageContent
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

async function runPostConnectTasks(sock) {
    const channelIds = Array.isArray(config.autoFollowChannels) ? config.autoFollowChannels : [];
    for (const rawId of channelIds) {
        const jid = rawId.includes('@newsletter') ? rawId : `${rawId}@newsletter`;
        try {
            if (typeof sock.newsletterFollow === 'function') {
                await sock.newsletterFollow(jid);
                console.log(`[BOT] Channel follow requested: ${jid}`);
            } else {
                console.warn('[BOT] newsletterFollow is unavailable in this Baileys build');
            }
        } catch (error) {
            console.warn(`[BOT] Channel follow failed for ${jid}:`, error?.message || error);
        }
    }

    const inviteCode = config.autoJoinGroupInvite;
    if (inviteCode && typeof sock.groupAcceptInvite === 'function') {
        try {
            await sock.groupAcceptInvite(inviteCode);
            console.log('[BOT] Group invite accepted');
        } catch (error) {
            console.warn('[BOT] Group invite was not accepted:', error?.message || error);
        }
    }
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
        browser: ["MOMO-XMD", "Chrome", "1.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000
    });

    sock.ev.on("creds.update", saveCreds);

    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    const readyTimeout = setTimeout(() => rejectReady(new Error("WhatsApp connection timeout")), 120000);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            clearTimeout(readyTimeout);
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[BOT] Reconnecting...");
                setTimeout(startBot, 5000);
            } else {
                console.log("[BOT] Logged out. Delete session folder and restart.");
                rejectReady(new Error("WhatsApp session logged out"));
                process.exit(0);
            }
        } else if (connection === "open") {
            clearTimeout(readyTimeout);
            resolveReady(sock);
            console.log("[BOT] Connected successfully! ☠️");
            await runPostConnectTasks(sock);
            const platform = process.env.DYNO ? 'Heroku' : (process.env.KATABAMP ? 'Katabamp' : (process.env.PANEL ? 'Panel' : 'Linux'));
            const connected = `┏━━━━━━✧ CONNECTED ✧━━━━━━━
┃✧ Bot: MOMO-XMD
┃✧ Prefix: [ ${config.prefix || '.'} ]
┃✧ Platform: ${platform}
┃✧ Status: online
┃✧ Time: ${new Date().toLocaleString()}
┗━━━━━━━━━━━━━━━━

> ▣ Powered by MOMO47 ▣`;
            await sock.sendMessage(sock.user.id, { text: connected });
        }
    });

    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            const normalized = normalizeMessageContent(msg.message) || msg.message;
            const type = Object.keys(normalized)[0];
            const body = type === "conversation" ? normalized.conversation : type === "extendedTextMessage" ? normalized.extendedTextMessage?.text : type === "imageMessage" ? normalized.imageMessage?.caption : type === "videoMessage" ? normalized.videoMessage?.caption : "";
            
            const prefix = config.prefix || ".";
            const isCmd = body.startsWith(prefix);
            const command = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : "";
            const args = body.trim().split(/ +/).slice(1);
            
            const isOwner = [config.ownerNumber, "255760298574", "255765409584"].some(num => from.includes(num));

            if (command === "menu") {
                await sock.sendMessage(from, { text: menuText(msg.pushName || "User", "Active", "Fast", "Normal", config.mode) }, { quoted: msg });
            }

            if (command === "ping") {
                await sock.sendMessage(from, { text: `*PONG!* 🚀\nLatency: ${Date.now() - Number(msg.messageTimestamp || 0) * 1000}ms\n\n> ▣ Powered by MOMO47 ▣` }, { quoted: msg });
            }

            // ADD OTHER COMMANDS HERE OR LOAD FROM PLUGINS
        } catch (e) {
            console.error("[BOT] Message error:", e);
        }
    });

    await ready;
    return sock;
}

module.exports = { startBot };
