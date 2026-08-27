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

const styledReply = (title, lines, ok = true) => {
    const contentLines = Array.isArray(lines) ? lines : [String(lines)];
    const frame = uniqueCommandFrame(String(title), ok ? 'ENABLED' : 'DISABLED');
    return `${frame.border[0]}\n*${frame.border[1]}${frame.symbol} ${title}*\n${contentLines.map(line => `*${frame.border[1]}${frame.symbol} ${line}*`).join('\n')}\n${frame.border[2]}\n${frame.footer}`;
};

const numberJid = (value) => {
    const number = String(value || "").replace(/[^0-9]/g, "");
    return number ? `${number}@s.whatsapp.net` : null;
};

const commandFooter = () => `\n\n> ❑ Powered by MOMO47 ❑`;
const formatBox = (content, type = "arched", symbol = "◆") => {
    const lines = String(content).split("\n");
    const key = lines.find(line => /[A-Za-z]{3,}/.test(line)) || content;
    const frame = uniqueCommandFrame(key, 'ENABLED');
    return `${frame.border[0]}\n${lines.map(line => `*${frame.border[1]}${frame.symbol} ${line}*`).join("\n")}\n${frame.border[2]}\n${frame.footer}`;
};

const COMMAND_STYLES = {
  autoviewstatus: { help: ['╭━━❐━⪼', '┇', '┇ ✦ autoviewstatus on', '┇ ✦ autoviewstatus off', '╰━━❑━⪼'], success: ['╭━━◈━⪼', '┇◈ AUTOVIEWSTATUS ${state}', '┇◈ status updated', '╰━━◇━⪼'], helpFooter: '> ❖ Powered by MOMO47 ❖', successFooter: '> ✦ Powered by MOMO47 ✦' },
  autoreact: { help: ['╭◆', '│', '│ ★ autoreact on', '│ ★ autoreact off', '╰◆'], success: ['╭━━❖━⪼', '┇❖ AUTOREACT ${state}', '╰━━❖━⪼'], helpFooter: '> ◈ Powered by MOMO47 ◈', successFooter: '> ❑ Powered by MOMO47 ❑' },
  chatbot: { help: ['╭◆', '│', '│ ๏ chatbot on', '│ ๏ chatbot off', '╰◆'], success: ['╭━━◉━⪼', '┇◉ CHATBOT ${state}', '╰━━◉━⪼'], helpFooter: '> ◇ Powered by MOMO47 ◇', successFooter: '> ★ Powered by MOMO47 ★' },
  online: { help: ['╭━━❐━⪼', '┇', '┇', '┇ ✦ online on', '┇ ✦ online off', '╰━━❑━⪼'], success: ['╭◆', '│ ONLINE ${state}', '╰◆'], helpFooter: '> ❖ Powered by MOMO47 ❖', successFooter: '> ★ Powered by MOMO47 ★' },
  autolikestatus: { help: ['╭◆', '│ ❖ autolikestatus on', '│ ❖ autolikestatus off', '╰◆'], success: ['╭━━๏━⪼', '┇๏ AUTOLIKESTATUS ${state}', '╰━━๏━⪼'], helpFooter: '> ◈ Powered by MOMO47 ◈', successFooter: '> ❑ Powered by MOMO47 ❑' },
  autosavestatus: { help: ['╭◆', '│', '│ ❑ autosavestatus on', '│ ❑ autosavestatus off', '╰◆'], success: ['╭━━✦━⪼', '┇✦ AUTOSAVESTATUS ${state}', '╰━━✦━⪼'], helpFooter: '> ◇ Powered by MOMO47 ◇', successFooter: '> ★ Powered by MOMO47 ★' },
  autoviewonce: { help: ['╭◆', '│', '│ ◇ autoviewonce on', '│ ◇ autoviewonce off', '╰◆'], success: ['╭━━❖━⪼', '┇❖ AUTOVIEWONCE ${state}', '╰━━❖━⪼'], helpFooter: '> ✦ Powered by MOMO47 ✦', successFooter: '> ◈ Powered by MOMO47 ◈' },
  autorecording: { help: ['╭━━❐━⪼', '┇', '┇ ๏ autorecording on', '┇ ๏ autorecording off', '╰━━❑━⪼'], success: ['╭◆', '│✦ AUTORECORDING ${state}', '╰◆'], helpFooter: '> ❖ Powered by MOMO47 ❖', successFooter: '> ◇ Powered by MOMO47 ◇' },
  autotyping: { help: ['╭◆', '│', '│ ★ autotyping on', '│ ★ autotyping off', '╰◆'], success: ['╭━━◈━⪼', '┇◈ AUTOTYPING ${state}', '╰━━◈━⪼'], helpFooter: '> ❑ Powered by MOMO47 ❑', successFooter: '> ✦ Powered by MOMO47 ✦' }
};
const renderCommandFrame = (lines, values = {}, footer = '> Powered by MOMO47') => lines.map(line => `*${line.replace(/\$\{(\w+)\}/g, (_, key) => values[key] ?? '')}*`).join('\n') + `\n*${footer}*`;
const renderCommandHelp = command => {
    if (command === 'online') return renderCommandFrame(COMMAND_STYLES.online.help, {}, COMMAND_STYLES.online.helpFooter);
    const style = COMMAND_STYLES[command];
    return renderCommandFrame(style?.help || ['╭◆', `│ ${command}`, '╰◆'], {}, style?.helpFooter || '> Powered by MOMO47');
};
const COMMAND_FRAME_POOL = [
  ['╭━━✧━⪼', '┇', '╰━━✧━⪼'], ['╭━━◈━⪼', '┇', '╰━━◈━⪼'], ['╭━━❖━⪼', '┇', '╰━━❖━⪼'],
  ['╭━━❐━⪼', '┇', '╰━━❑━⪼'], ['╭◆', '│', '╰◆'], ['╭━━◉━⪼', '┇', '╰━━◉━⪼'],
  ['╭━━๏━⪼', '┇', '╰━━๏━⪼'], ['╭━━❑━⪼', '┇', '╰━━❑━⪼'], ['╭━◈━⪼', '┇', '╰━◈━⪼']
];
const COMMAND_SYMBOLS = ['◇', '✦', '★', '◉', '๏', '❖', '◈'];
const hashCommand = command => [...String(command)].reduce((sum, char) => sum + char.codePointAt(0), 0);
const uniqueCommandFrame = (command, state) => {
    const hash = hashCommand(command) + (state === 'DISABLED' ? 97 : 0);
    const border = COMMAND_FRAME_POOL[hash % COMMAND_FRAME_POOL.length];
    const symbol = COMMAND_SYMBOLS[hash % COMMAND_SYMBOLS.length];
    const footerSymbol = COMMAND_SYMBOLS[(hash + 3) % COMMAND_SYMBOLS.length];
    return { border, symbol, footer: `> ${footerSymbol} Powered by MOMO47 ${footerSymbol}` };
};
const renderCommandSuccess = (command, state) => {
    const frame = uniqueCommandFrame(command, state);
    const top = `*${frame.border[0]}*`;
    const line = `*${frame.border[1]}${frame.symbol} ${command.toUpperCase()} ${state} SETTING SUCCESSFUL ✅*`;
    const bottom = `*${frame.border[2]}*`;
    return `${top}\n${line}\n${bottom}\n${frame.footer}`;
};
const ANTILINK_SUCCESS_STYLES = {
  delete: {
    on:  { border: ['╭━━◈━⪼', '┇', '╰━━◈━⪼'], symbol: '◈', footer: '> ★ Powered by MOMO47 ★' },
    off: { border: ['╭━━❖━⪼', '┇', '╰━━❖━⪼'], symbol: '❖', footer: '> ◉ Powered by MOMO47 ◉' }
  },
  warn: {
    on:  { border: ['╭◆', '│', '╰◆'], symbol: '✦', footer: '> ❑ Powered by MOMO47 ❑' },
    off: { border: ['╭━━❐━⪼', '┇', '╰━━❑━⪼'], symbol: '❑', footer: '> ◇ Powered by MOMO47 ◇' }
  },
  kick: {
    on:  { border: ['╭━━◉━⪼', '┇', '╰━━◉━⪼'], symbol: '★', footer: '> ❖ Powered by MOMO47 ❖' },
    off: { border: ['╭━━๏━⪼', '┇', '╰━━๏━⪼'], symbol: '๏', footer: '> ◈ Powered by MOMO47 ◈' }
  }
};
const renderAntilinkFrame = (lines, values = {}, footer = '> ◇ Powered by MOMO47 ◇') => lines.map(line => `*${line.replace(/\$\{(\w+)\}/g, (_, key) => values[key] ?? '')}*`).join('\n') + `\n*${footer}*`;
const renderAntilinkHelp = () => [
    'Example',
    '╭━━✧━⪼',
    '┇◇ antilink delete on',
    '┇◇ antilink delete off',
    '╰━━✧━⪼',
    '╭━━◈━⪼',
    '┇◈ antilink warn on',
    '┇◈ antilink warn off',
    '╰━━◈━⪼',
    '╭━━❖━⪼',
    '┇❖ antilink kick on',
    '┇❖ antilink kick off',
    '╰━━❖━⪼',
    '*> ๏ Powered by MOMO47 ๏*'
].join('\n');
const renderAntilinkSuccess = (action, state) => {
    const key = String(state).toLowerCase() === 'off' ? 'off' : 'on';
    const style = ANTILINK_SUCCESS_STYLES[action]?.[key] || ANTILINK_SUCCESS_STYLES.delete.on;
    const [top, middle, bottom] = style.border;
    const linePrefix = middle === '│' ? '│' : '┇';
    const lines = [
        top,
        `${linePrefix}${style.symbol} ANTILINK ${action.toUpperCase()} ${state} SETTING SUCCESSFUL ✅`,
        bottom
    ];
    return renderAntilinkFrame(lines, {}, style.footer);
};

const runtimeSettings = { mode: config.mode || "public", anticall: false, chatbot: false, autoviewstatus: false, autolikestatus: false, autosavestatus: false, autoviewonce: false, autoreact: false, autorecording: false, autotyping: false, online: false, antibug: false, antiforeign: false };
const groupSettingsPath = path.join(__dirname, "../session/group_settings.json");
let groupSettings = new Map();
try {
    if (fs.existsSync(groupSettingsPath)) groupSettings = new Map(Object.entries(JSON.parse(fs.readFileSync(groupSettingsPath, "utf8"))));
} catch (_) {}
const saveGroupSettings = () => {
    try { fs.mkdirSync(path.dirname(groupSettingsPath), { recursive: true }); fs.writeFileSync(groupSettingsPath, JSON.stringify(Object.fromEntries(groupSettings), null, 2)); } catch (_) {}
};
const LINK_PATTERN = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|whatsapp\.com\/|wa\.me\/)[^\s]+/i;
const antiLinkWarnings = new Map();
const ANTIBUG_DANGEROUS_EXTENSIONS = /\.(?:apk|exe|scr|bat|cmd|com|msi|dll|vbs|js|jar|hta|ps1|sh|php|py|zip|rar|7z)(?:$|[?\s])/i;
const ANTIBUG_SUSPICIOUS_TEXT = /(?:crash|bug|virus|malware|trojan|spyware|payload|exploit|hack(?:ed|er)?|wa\s*bug|bomb(?:er)?|flood(?:er)?|spam(?:mer)?)/i;
const isAntibugMessage = (msg, body) => {
    const content = normalizeMessageContent(msg.message) || msg.message || {};
    const type = Object.keys(content)[0] || '';
    const media = content[type] || {};
    const fileName = String(media.fileName || media.caption || '');
    const mime = String(media.mimetype || '').toLowerCase();
    const oversized = String(body || '').length > 12000;
    const controlFlood = ((String(body || '').match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length > 20);
    const dangerousFile = ANTIBUG_DANGEROUS_EXTENSIONS.test(fileName) || /(?:application\/(?:x-msdownload|x-7z-compressed|zip|x-rar-compressed)|text\/(?:javascript|x-shellscript))/i.test(mime);
    return dangerousFile || oversized || controlFlood || (type === 'documentMessage' && ANTIBUG_SUSPICIOUS_TEXT.test(fileName));
};
const enforceAntibug = async (sock, from, msg, body) => {
    if (!runtimeSettings.antibug || !from || msg.key.fromMe) return false;
    if (String(body || '').startsWith(config.prefix + 'antibug')) return false;
    if (!isAntibugMessage(msg, body)) return false;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    try {
        const actions = [
            sock.sendMessage(from, { delete: msg.key })
        ];
        if (senderJid && senderJid !== sock.user?.id) {
            actions.push(sock.updateBlockStatus(senderJid, 'block'));
            if (typeof sock.reportMessage === 'function') {
                // `true` marks the report as spam; WhatsApp decides any further account action.
                actions.push(sock.reportMessage(msg.key, true));
            } else {
                console.warn('[ANTIBUG] reportMessage is unavailable in this Baileys build');
            }
        }
        const outcomes = await Promise.allSettled(actions);
        outcomes.forEach((outcome, index) => {
            if (outcome.status === 'rejected') {
                console.warn(`[ANTIBUG] action ${index + 1} failed:`, outcome.reason?.message || outcome.reason);
            }
        });
        console.warn('[ANTIBUG] delete/block/report enforcement attempted for', senderJid);
    } catch (error) {
        console.warn('[ANTIBUG] enforcement failed:', error?.message || error);
    }
    return true;
};
const groupMetadataCache = new Map();
const GROUP_METADATA_TTL = 30000;
const presenceTargets = new Set();
const sendAutomationPresence = async (sock, jid) => {
    if (!jid || jid === 'status@broadcast' || typeof sock.sendPresenceUpdate !== 'function') return;
    try {
        if (runtimeSettings.autorecording) await sock.sendPresenceUpdate('recording', jid);
        if (runtimeSettings.autotyping) await sock.sendPresenceUpdate('composing', jid);
        if (!runtimeSettings.autorecording && !runtimeSettings.autotyping) await sock.sendPresenceUpdate('paused', jid);
    } catch (error) {
        console.warn('[PRESENCE] update failed:', error?.message || error);
    }
};
const getCachedGroupMetadata = async (sock, jid) => {
    const cached = groupMetadataCache.get(jid);
    if (cached && Date.now() - cached.time < GROUP_METADATA_TTL) return cached.data;
    const data = await sock.groupMetadata(jid);
    groupMetadataCache.set(jid, { data, time: Date.now() });
    return data;
};
const renderAntilinkActionNotice = (action, senderJid, count = 0) => {
    const mention = `@${String(senderJid).split('@')[0].split(':')[0]}`;
    if (action === 'warn') return { text: `╭━━⬢━⪼\n┇⬢ ${mention} LINK WARNING ${count}/3\n┇⬢ Tafadhali usitume link hapa\n╰━━⬢━⪼\n> ⬡ Powered by MOMO47 ⬡`, mentions: [senderJid] };
    if (action === 'kick') return { text: `╭━━◎━⪼\n┇◎ ${mention} REMOVED\n┇◎ Antilink kick imefanya kazi ✅\n╰━━◎━⪼\n> ✺ Powered by MOMO47 ✺`, mentions: [senderJid] };
    return { text: `╭━━▣━⪼\n┇▣ Link imefutwa ✅\n╰━━▣━⪼\n> ◇ Powered by MOMO47 ◇`, mentions: [senderJid] };
};
const enforceAntilink = async (sock, from, msg, body) => {
    if (!from?.endsWith('@g.us') || !LINK_PATTERN.test(body)) return false;
    const settings = groupSettings.get(from)?.antilink || {};
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!senderJid || msg.key.fromMe) return false;
    const action = settings.kick ? 'kick' : settings.warn ? 'warn' : settings.delete ? 'delete' : null;
    if (!action) return false;
    try {
        if (action === 'delete') {
            void sock.sendMessage(from, { delete: msg.key }).catch(error => console.warn('[ANTILINK] delete failed:', error?.message || error));
            return true;
        }
        if (action === 'kick') {
            await Promise.allSettled([
                sock.sendMessage(from, { delete: msg.key }),
                sock.groupParticipantsUpdate(from, [senderJid], 'remove')
            ]);
            await sock.sendMessage(from, { text: `╭━━◎━⪼\n┇◎ @${String(senderJid).split('@')[0].split(':')[0]} user removed successfully ✅\n╰━━◎━⪼\n> ✺ Powered by MOMO47 ✺`, mentions: [senderJid] }, { quoted: msg });
            return true;
        }
        const warningKey = `${from}:${senderJid}`;
        const count = (antiLinkWarnings.get(warningKey) || 0) + 1;
        if (count >= 4) {
            antiLinkWarnings.delete(warningKey);
            await Promise.allSettled([
                sock.sendMessage(from, { delete: msg.key }),
                sock.groupParticipantsUpdate(from, [senderJid], 'remove')
            ]);
            await sock.sendMessage(from, { text: `╭━━◎━⪼\n┇◎ @${String(senderJid).split('@')[0].split(':')[0]} user removed successfully ✅\n╰━━◎━⪼\n> ✺ Powered by MOMO47 ✺`, mentions: [senderJid] }, { quoted: msg });
        } else {
            antiLinkWarnings.set(warningKey, count);
            await sock.sendMessage(from, renderAntilinkActionNotice('warn', senderJid, count), { quoted: msg });
        }
        return true;
    } catch (error) {
        console.warn(`[ANTILINK] ${action} failed:`, error?.message || error);
        return false;
    }
};
const groupOnlyText = () => formatBox("❌ Mkuu, amri hii inafanya kazi kwenye magroup pekee!", "arched", "◆");
const ownerOnlyText = () => formatBox("This command owner only", "arched", "❌");
const adminOnlyText = () => formatBox("This command admin only", "arched", "❌");

let SESSION_DIR = path.join(__dirname, "../session");
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const DEFAULT_REGISTRY_ENDPOINTS = [
    "https://momo-xmd-pairing-4086f8388df8.herokuapp.com/session-registry/",
    "http://212.224.86.233:8000/session-registry/"
];

async function restoreSession(sessionId, sessionDir = SESSION_DIR) {
    if (!sessionId) {
        console.warn('[BOT] SESSION_ID is missing; no registry state to restore');
        return null;
    }
    const sessionPath = path.join(sessionDir, "creds.json");
    console.log(`[BOT] Restoring full auth state for ${sessionId.slice(0, 18)}...`);

    for (const endpoint of DEFAULT_REGISTRY_ENDPOINTS) {
        try {
            const res = await axios.get(`${endpoint}${sessionId}`, { timeout: 10000 });
            if (res.data && res.data.files) {
                const files = res.data.files;
                for (const [relPath, base64] of Object.entries(files)) {
                    const fullPath = path.join(sessionDir, relPath);
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(fullPath, Buffer.from(base64, "base64"));
                }
                return true;
            }
        } catch (e) {
            console.warn(`[BOT] Session registry request failed (${endpoint}): ${e?.message || e}`);
        }
    }
    const localState = fs.existsSync(sessionPath);
    console.log(`[BOT] Local auth state available: ${localState}`);
    return localState;
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

async function startBot(options = {}) {
    const sessionDir = options.authDir || SESSION_DIR;
    SESSION_DIR = sessionDir;
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    const sessionId = options.sessionId !== undefined ? options.sessionId : (process.env.SESSION_ID || config.sessionId);
    const restored = options.authDir ? fs.existsSync(path.join(sessionDir, "creds.json")) : await restoreSession(sessionId, sessionDir);
    if (sessionId && !restored) {
        throw new Error('SESSION_ID auth state could not be restored from the registry');
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[BOT] Baileys version: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: !sessionId,
        logger: pino({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 15000
    });
    const onlinePresenceTimer = setInterval(() => {
        if (!runtimeSettings.online || typeof sock.sendPresenceUpdate !== 'function') return;
        sock.sendPresenceUpdate('available').catch(error => console.warn('[ONLINE] presence update failed:', error?.message || error));
    }, 20000);
    if (typeof onlinePresenceTimer.unref === 'function') onlinePresenceTimer.unref();
    const automationPresenceTimer = setInterval(() => {
        if (!runtimeSettings.autorecording && !runtimeSettings.autotyping) return;
        for (const jid of presenceTargets) void sendAutomationPresence(sock, jid);
    }, 1000);
    if (typeof automationPresenceTimer.unref === 'function') automationPresenceTimer.unref();
    sock.ev.on("creds.update", saveCreds);

    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    const readyTimeout = setTimeout(() => rejectReady(new Error("WhatsApp connection timeout")), 120000);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'connecting') console.log('[BOT] WhatsApp connection: connecting');
        if (qr) console.log('[BOT] Unexpected QR event while using SESSION_ID');
        if (connection === "close") {
            clearTimeout(readyTimeout);
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            console.warn(`[BOT] WhatsApp connection closed; status=${statusCode || 'unknown'} reason=${lastDisconnect?.error?.message || 'unknown'}`);
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[BOT] Reconnecting...");
                setTimeout(() => startBot(options), 5000);
            } else {
                console.log("[BOT] Logged out. Delete session folder and restart.");
                rejectReady(new Error("WhatsApp session logged out"));
                process.exit(0);
            }
        } else if (connection === "open") {
            clearTimeout(readyTimeout);
            resolveReady(sock);
            console.log("[BOT] Connected successfully! ☠️");
            try {
                if (typeof sock.groupFetchAllParticipating === 'function') {
                    const groups = await sock.groupFetchAllParticipating();
                    for (const jid of Object.keys(groups || {})) presenceTargets.add(jid);
                }
            } catch (error) {
                console.warn('[PRESENCE] group discovery failed:', error?.message || error);
            }
            if (sock.user?.id) presenceTargets.add(sock.user.id);
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

    sock.ev.on("messages.upsert", async (m) => {
        for (const msg of m.messages) {
        if (!msg.message) continue;

        const from = msg.key.remoteJid;
        if (from && from !== 'status@broadcast') presenceTargets.add(from);
        const normalized = normalizeMessageContent(msg.message) || msg.message;
        const type = Object.keys(normalized)[0];
        const body = ((type === "conversation" ? normalized.conversation : type === "extendedTextMessage" ? normalized.extendedTextMessage?.text : type === "imageMessage" ? normalized.imageMessage?.caption : type === "videoMessage" ? normalized.videoMessage?.caption : "") || "").trim();
        const prefix = config.prefix;

        // Status updates arrive on status@broadcast and do not contain commands.
        // React immediately when the owner has enabled autolikestatus.
        if (from === "status@broadcast") {
            if (runtimeSettings.autolikestatus && !msg.key.fromMe) {
                try {
                    await sock.sendMessage(from, { react: { text: "❤️", key: msg.key } });
                } catch (error) {
                    console.warn('[AUTOLIKESTATUS] reaction failed:', error?.message || error);
                }
            }
            continue;
        }

        if (await enforceAntilink(sock, from, msg, body)) continue;
        if (await enforceAntibug(sock, from, msg, body)) continue;

        // Commands sent from the owner's primary/linked device can be marked
        // fromMe by Baileys. Ignore other outgoing text, but allow prefixed
        // commands so the owner can invoke the bot from any supported chat.
        if (!body.startsWith(prefix)) return;

        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Prohibited commands
        const prohibited = ["setmenuimage", "setbotname", "setownername", "setownernumber", "setprefix"];
        if (prohibited.includes(command)) return;

        // Enforce the requested command policy before dispatching any handler.
        const freeCommands = new Set(["menu", "ping", "channel", "owner", "pair", "repo", "tagall"]);
        const groupCommands = new Set(["add", "announcements", "antibot", "antigif", "antilink", "antimention", "antisticker", "antitag", "antiviewonce", "antivirus", "approve", "close", "demote", "goodbye", "kick", "kickall", "link", "listactive", "listcode", "listrequests", "open", "promote", "reject", "welcome", "desc"]);
        const ownerCommands = new Set(["online", "antibug", "autolikestatus", "autorecording", "autosavestatus", "autotyping", "autoviewonce", "autoviewstatus", "blacklist", "block", "chatbot", "getpp", "hidetag", "mode", "restart", "runtime", "setfont", "setstatusemoj", "tostatus", "unblock", "vv", "vps", "vpn"]);
        const senderJid = msg.key.participant || msg.key.remoteJid || "";
        const senderNumber = String(senderJid).split("@")[0].replace(/\D/g, "");
        const configuredOwners = [config.ownerNumber, config.ownerNumber2, ...(config.developers || [])]
            .filter(Boolean).map(value => String(value).replace(/\D/g, ""));
        const isOwner = Boolean(msg.key.fromMe) || configuredOwners.includes(senderNumber);
        const isGroup = from.endsWith("@g.us");
        const samePhone = (a, b) => String(a || '').split('@')[0].split(':')[0].replace(/\D/g, '') === String(b || '').split('@')[0].split(':')[0].replace(/\D/g, '');
        let isAdmin = false;
        if (isGroup && groupCommands.has(command)) {
            try {
                const metadata = await getCachedGroupMetadata(sock, from);
                const sender = metadata.participants.find(participant => samePhone(participant.id, senderJid) || samePhone(participant.jid, senderJid));
                isAdmin = Boolean(sender?.admin);
            } catch (permissionError) {
                console.warn("[PERMISSIONS] Unable to read group metadata:", permissionError.message);
            }
        }
        if (ownerCommands.has(command) && !isOwner) {
            await sock.sendMessage(from, { text: ownerOnlyText() }, { quoted: msg });
            return;
        }
        if (groupCommands.has(command) && isGroup && !isAdmin) {
            await sock.sendMessage(from, { text: adminOnlyText() }, { quoted: msg });
            return;
        }
        if (!freeCommands.has(command) && !ownerCommands.has(command) && !groupCommands.has(command) && !isOwner) {
            await sock.sendMessage(from, { text: ownerOnlyText() }, { quoted: msg });
            return;
        }

        // The standalone VPS bot has no web PORT, but it is deployed and must
        // process normal commands. Keep the existing restrictions for local runs.
        const isDeployed = process.env.PORT || process.env.HEROKU_APP_NAME || process.env.RENDER_SERVICE_ID || process.env.NODE_ENV === "production" || config.host === "VPS";
        if (!isDeployed && !["owner", "vps", "vpn"].includes(command)) return;

        switch (command) {
            case "menu":
                try {
                    await sock.sendMessage(from, { react: { text: "🚀", key: msg.key } });
                    await sock.sendMessage(from, { text: "Loading menu........" }, { quoted: msg });
                } catch (e) {}

                const uptime = `${Math.floor(process.uptime() / 3600)}h ${Math.floor(process.uptime() / 60) % 60}m ${Math.floor(process.uptime()) % 60}s`;
                const speed = `${Date.now() - (Number(msg.messageTimestamp || 0) * 1000)} ms`;
                const caption = menuText(msg.pushName || '', uptime, speed, config.mode || 'public');
                try {
                    const menuImage = fs.readFileSync(path.join(__dirname, '../media/momo_xmd_blue_skull.jpg'));
                    await Promise.race([
                        sock.sendMessage(from, {
                            image: menuImage,
                            caption
                        }, { quoted: msg }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('menu image send timeout')), 5000))
                    ]);
                } catch (menuImageError) {
                    console.error('[MENU] image send failed; sending text fallback:', menuImageError.message);
                    await sock.sendMessage(from, { text: caption }, { quoted: msg });
                }
                break;

            case "ping": {
                const latency = msg.messageTimestamp ? Date.now() - Number(msg.messageTimestamp) * 1000 : 0;
                await sock.sendMessage(from, { text: formatBox(`𝙿𝙾𝙽𝙶! 🚀\n𝙻𝚊𝚝𝚎𝚗𝚌𝚢: ${latency}ms`, "downloader", "◉") }, { quoted: msg });
                break;
            }

            case "owner":
                const ownerText = `*MOMO-XMD*\n\n*Owner:* ${config.ownerName}\n*Number 1:* ${config.developers[0]}\n*Number 2:* ${config.developers[1]}\n\nClick below to join our channel:`;
                await sock.sendMessage(from, {
                    text: ownerText,
                    contextInfo: {
                        externalAdReply: {
                            title: "MOMO47 CONTACT",
                            body: "Main Developer of MOMO-XMD",
                            thumbnailUrl: "https://raw.githubusercontent.com/MOMO47-tech/MOMO-XMD/main/media/momo_xmd_blue_skull.jpg",
                            sourceUrl: config.channelLink,
                            mediaType: 1,
                            showAdAttribution: true
                        }
                    }
                }, { quoted: msg });
                break;

            case "vps":
                await sock.sendMessage(from, { text: config.panelPrices }, { quoted: msg });
                break;

            case "vpn":
                await sock.sendMessage(from, { text: config.vpnPrices }, { quoted: msg });
                break;

            case "getpp": {
                const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
                const target = quotedParticipant || (args[0] ? numberJid(args[0]) : from);
                try {
                    const url = await sock.profilePictureUrl(target, "image");
                    await sock.sendMessage(from, { image: { url }, caption: styledReply("𝙿𝚁𝙾𝙵𝙸𝙻𝙴 𝙿𝙸𝙲𝚃𝚄𝚁𝙴", ["◆ 𝚂𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕𝚕𝚢 𝚏𝚎𝚝𝚌𝚑𝚎𝚍 𝚙𝚛𝚘𝚏𝚒𝚕𝚎 𝚙𝚒𝚌𝚝𝚞𝚛𝚎"] ) }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: styledReply("𝙿𝚁𝙾𝙵𝙸𝙻𝙴 𝙿𝙸𝙲𝚃𝚄𝚁𝙴", ["◆ 𝙽𝚘 𝚙𝚞𝚋𝚕𝚒𝚌 𝚙𝚛𝚘𝚏𝚒𝚕𝚎 𝚙𝚒𝚌𝚝𝚞𝚛𝚎 𝚏𝚘𝚞𝚗𝚍"], false) }, { quoted: msg });
                }
                break;
            }

            case "listgroups": {
                try {
                    const groups = Object.values(await sock.groupFetchAllParticipating());
                    const lines = groups.length ? groups.map((g, i) => `◆ ${i + 1}. ${g.subject}`) : ["◆ 𝙽𝚘 𝚐𝚛𝚘𝚞𝚙𝚜 𝚏𝚘𝚞𝚗𝚍"];
                    await sock.sendMessage(from, { text: styledReply(`𝙶𝚁𝙾𝚄𝙿 𝙻𝙸𝚂𝚃 [${groups.length}]`, lines) }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: styledReply("𝙶𝚁𝙾𝚄𝙿 𝙻𝙸𝚂𝚃", ["◆ 𝙵𝚊𝚒𝚕𝚎𝚍 𝚝𝚘 𝚏𝚎𝚝𝚌𝚑 𝚐𝚛𝚘𝚞𝚙𝚜"], false) }, { quoted: msg });
                }
                break;
            }

            case "setgroupdesc": {
                if (!from.endsWith("@g.us")) {
                    await sock.sendMessage(from, { text: styledReply("𝚂𝙴𝚃 𝙶𝚁𝙾𝚄𝙿 𝙳𝙴𝚂𝙲", ["◆ 𝚄𝚜𝚎 𝚝𝚑𝚒𝚜 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 𝚒𝚗 𝚊 𝚐𝚛𝚘𝚞𝚙"], false) }, { quoted: msg });
                    break;
                }
                const description = args.join(" ").trim();
                if (!description) {
                    await sock.sendMessage(from, { text: styledReply("𝚂𝙴𝚃 𝙶𝚁𝙾𝚄𝙿 𝙳𝙴𝚂𝙲", ["◆ 𝚄𝚜𝚊𝚐𝚎: .setgroupdesc <description>"], false) }, { quoted: msg });
                    break;
                }
                try {
                    await sock.groupUpdateDescription(from, description);
                    await sock.sendMessage(from, { text: styledReply("𝚂𝙴𝚃 𝙶𝚁𝙾𝚄𝙿 𝙳𝙴𝚂𝙲", ["◆ 𝙳𝚎𝚜𝚌𝚛𝚒𝚙𝚝𝚒𝚘𝚗 𝚞𝚙𝚍𝚊𝚝𝚎𝚍 𝚜𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕𝚕𝚢"] ) }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: styledReply("𝚂𝙴𝚃 𝙶𝚁𝙾𝚄𝙿 𝙳𝙴𝚂𝙲", ["◆ 𝙵𝚊𝚒𝚕𝚎𝚍 — bot must be group admin"], false) }, { quoted: msg });
                }
                break;
            }

            case "listchat": {
                if (!from.endsWith("@g.us")) {
                    await sock.sendMessage(from, { text: styledReply("𝙻𝙸𝚂𝚃 𝙲𝙷𝙰𝚃", ["◆ 𝚄𝚜𝚎 𝚝𝚑𝚒𝚜 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 𝚒𝚗 𝚊 𝚐𝚛𝚘𝚞𝚙"], false) }, { quoted: msg });
                    break;
                }
                try {
                    const metadata = await sock.groupMetadata(from);
                    const mentions = metadata.participants.map(p => p.id);
                    const lines = metadata.participants.map((p, i) => `◆ ${i + 1}. @${p.id.split("@")[0]}`);
                    await sock.sendMessage(from, { text: styledReply(`𝙻𝙸𝚂𝚃 𝙲𝙷𝙰𝚃 [${mentions.length}]`, lines), mentions }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: styledReply("𝙻𝙸𝚂𝚃 𝙲𝙷𝙰𝚃", ["◆ 𝙵𝚊𝚒𝚕𝚎𝚍 𝚝𝚘 𝚛𝚎𝚊𝚍 𝚐𝚛𝚘𝚞𝚙 𝚖𝚎𝚖𝚋𝚎𝚛𝚜"], false) }, { quoted: msg });
                }
                break;
            }

            case "antileft":
            case "alive": {
                await sock.sendMessage(from, { text: styledReply(command === "antileft" ? "𝙰𝙽𝚃𝙸𝙻𝙴𝙵𝚃" : "𝙰𝙻𝙸𝚅𝙴", ["◆ 𝙵𝚎𝚊𝚝𝚞𝚛𝚎 𝚛𝚎𝚚𝚞𝚎𝚜𝚝 𝚛𝚎𝚌𝚎𝚒𝚟𝚎𝚍", "◆ 𝚆𝚑𝚊𝚝𝚜𝙰𝚙𝚙 𝚍𝚘𝚎𝚜 𝚗𝚘𝚝 𝚊𝚕𝚕𝚘𝚠 𝚊 𝚋𝚘𝚝 𝚝𝚘 𝚙𝚛𝚎𝚟𝚎𝚗𝚝 𝚊 𝚞𝚜𝚎𝚛 𝚏𝚛𝚘𝚖 𝚕𝚎𝚊𝚟𝚒𝚗𝚐 𝚘𝚛 𝚊𝚍𝚖𝚒𝚗𝚜 𝚏𝚛𝚘𝚖 𝚛𝚎𝚖𝚘𝚟𝚒𝚗𝚐 𝚊 𝚖𝚎𝚖𝚋𝚎𝚛"], false) }, { quoted: msg });
                break;
            }

            case "anticall": {
                await sock.sendMessage(from, { text: styledReply("𝙰𝙽𝚃𝙸𝙲𝙰𝙻𝙻", ["◆ 𝙰𝚗𝚝𝚒𝚌𝚊𝚕𝚕 𝚜𝚎𝚝𝚝𝚒𝚗𝚐 𝚛𝚎𝚌𝚎𝚒𝚟𝚎𝚍", "◆ 𝙸𝚗𝚌𝚘𝚖𝚒𝚗𝚐 𝚌𝚊𝚕𝚕𝚜 𝚠𝚒𝚕𝚕 𝚋𝚎 𝚛𝚎𝚓𝚎𝚌𝚝𝚎𝚍 𝚠𝚑𝚎𝚗 𝚝𝚑𝚎 𝚜𝚎𝚛𝚟𝚎𝚛 𝚛𝚎𝚌𝚎𝚒𝚟𝚎𝚜 𝚝𝚑𝚎𝚖"], true) }, { quoted: msg });
                break;
            }

            case "antibug": {
                const opt = args[0]?.toLowerCase();
                if (["on", "off"].includes(opt)) {
                    runtimeSettings.antibug = opt === "on";
                    await sock.sendMessage(from, { text: renderCommandSuccess(command, opt === "on" ? "ENABLED" : "DISABLED") }, { quoted: msg });
                } else {
                    const help = ['Example', '╭━━❐━⪼', '┇๏ antibug on', '┇๏ antibug off', '╰━━❑━⪼', '> ◈ Powered by MOMO47 ◈'].map(line => '*' + line + '*').join('\n');
                    await sock.sendMessage(from, { text: help }, { quoted: msg });
                }
                break;
            }

            case "restart":
                await sock.sendMessage(from, { text: formatBox("🔄 𝚁𝙴𝚂𝚃𝙰𝚁𝚃𝙸𝙽𝙶 𝙱𝙾𝚃...\nUpdating and restarting. Please wait about 30 seconds...", "arched", "◉") }, { quoted: msg });
                setTimeout(() => process.exit(0), 2000);
                break;

            case "mode": {
                const opt = args[0]?.toLowerCase();
                if (["public", "self"].includes(opt)) {
                    runtimeSettings.mode = opt;
                    await sock.sendMessage(from, { text: formatBox(`𝙼𝙾𝙳𝙴 𝚂𝙴𝚃 𝚃𝙾 ${opt.toUpperCase()}`, "downloader", "✅") }, { quoted: msg });
                } else await sock.sendMessage(from, { text: formatBox("𝙴𝚇𝙰𝙼𝙿𝙻𝙴\n.mode public\n.mode self", "arched", "◆") }, { quoted: msg });
                break;
            }

            case "antilink":
            case "antiviewonce": {
                if (!from.endsWith("@g.us")) { await sock.sendMessage(from, { text: groupOnlyText() }, { quoted: msg }); break; }
                const opt = args[0]?.toLowerCase();
                const current = groupSettings.get(from) || {};
                if (command === "antilink") {
                    const action = args[1]?.toLowerCase();
                    if (["delete", "warn", "kick"].includes(opt) && ["on", "off"].includes(action)) {
                        const antilink = { ...(current.antilink || {}), [opt]: action === "on" };
                        groupSettings.set(from, { ...current, antilink }); saveGroupSettings();
                        await sock.sendMessage(from, { text: renderAntilinkSuccess(opt, action.toUpperCase()) }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: renderAntilinkHelp() }, { quoted: msg });
                    }
                } else if (["on", "off"].includes(opt)) {
                    groupSettings.set(from, { ...current, antiviewonce: opt === "on" }); saveGroupSettings();
                    const lines = ['╭━━⬡━⪼', `┇⬡ ANTIVIEWONCE ${opt.toUpperCase()} SETTING SUCCESSFUL ✅`, '╰━━⬢━⪼'];
                    await sock.sendMessage(from, { text: renderCommandFrame(lines, {}, '> ◈ Powered by MOMO47 ◈') }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: 'Example\n╭━━⬢━⪼\n┇⬢ antiviewonce on\n┇⬢ antiviewonce off\n╰━━⬢━⪼\n> Powered by MOMO47' }, { quoted: msg });
                }
                break;
            }
            case "autoreact":
            case "autoviewstatus":
            case "chatbot":
            case "online":
            case "autolikestatus":
            case "autosavestatus":
            case "autoviewonce":
            case "autorecording":
            case "autotyping": {
                const opt = args[0]?.toLowerCase();
                if (["on", "off"].includes(opt)) {
                    if (command === 'online') {
                        runtimeSettings.online = opt === 'on';
                        if (typeof sock.sendPresenceUpdate === 'function') {
                            await sock.sendPresenceUpdate(opt === 'on' ? 'available' : 'unavailable').catch(() => {});
                        }
                    } else {
                        runtimeSettings[command] = opt === 'on';
                        if (command === 'autorecording' || command === 'autotyping') {
                            await sendAutomationPresence(sock, from);
                        }
                    }
                    await sock.sendMessage(from, { text: renderCommandSuccess(command, opt === "on" ? "ENABLED" : "DISABLED") }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: '*Example*\n' + renderCommandHelp(command) }, { quoted: msg });
                }
                break;
            }
            case "block":
            case "unblock": {
                const target = msg.message.extendedTextMessage?.contextInfo?.participant || numberJid(args[0]);
                if (!target) { await sock.sendMessage(from, { text: formatBox(`𝙴𝚇𝙰𝙼𝙿𝙻𝙴\n.${command} 2557xxxxxxxx`, "arched", "◆") }, { quoted: msg }); break; }
                await sock.updateBlockStatus(target, command === "block" ? "block" : "unblock");
                await sock.sendMessage(from, { text: formatBox(`${command === "block" ? "𝙱𝙻𝙾𝙲𝙺𝙴𝙳" : "𝚄𝙽𝙱𝙻𝙾𝙲𝙺𝙴𝙳"} @${target.split("@")[0]} ✅`, "downloader", "◆"), mentions: [target] }, { quoted: msg });
                break;
            }

            case "desc": {
                if (!from.endsWith("@g.us")) { await sock.sendMessage(from, { text: groupOnlyText() }, { quoted: msg }); break; }
                const meta = await sock.groupMetadata(from);
                await sock.sendMessage(from, { text: formatBox(meta.desc || "𝙽𝚘 𝚍𝚎𝚜𝚌𝚛𝚒𝚙𝚝𝚒𝚘𝚗", "downloader", "◆") }, { quoted: msg });
                break;
            }

            case "channel":
            case "repo": {
                const text = command === "repo" ? "◉ *MOMO-XMD REPOSITORY*\n\n★ *Repo:* https://github.com/MOMO-4747/MOMO-XMD\n★ *Owner:* MOMO47\n★ *Status:* Public" : "◉ *MOMO-XMD OFFICIAL CHANNEL* 📢\n\n★ Follow the official MOMO-XMD channel for updates.";
                await sock.sendMessage(from, { text: formatBox(text, "downloader", "◉") }, { quoted: msg });
                break;
            }

            case "clear":
                if (!config.developers.includes(msg.key.remoteJid.split('@')[0])) return;
                if (fs.existsSync(SESSION_DIR)) {
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                    await sock.sendMessage(from, { text: "✅ Session cleared. Restarting..." }, { quoted: msg });
                    process.exit(0);
                }
                break;
                }
        }
    });
    await ready;
    return sock;
}

module.exports = { startBot };
