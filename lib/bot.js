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
    const content = Array.isArray(lines) ? lines.join("\n│ ") : lines;
    return `╭◆\n│ ◆ ${title}\n│\n│ ${content}\n╰◆\n\n> 𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝙼𝙾𝙼𝙾47 ◇`;
};

const numberJid = (value) => {
    const number = String(value || "").replace(/[^0-9]/g, "");
    return number ? `${number}@s.whatsapp.net` : null;
};

const commandFooter = () => `\n\n> ❑ Powered by MOMO47 ❑`;
const formatBox = (content, type = "arched", symbol = "◆") => {
    const lines = String(content).split("\n");
    return `╭◆\n${lines.map(line => `│ ${symbol} ${line}`).join("\n")}\n╰◆${commandFooter()}`;
};

const COMMAND_STYLES = {
  autoviewstatus: { help: ['╭━━❐━⪼', '┇◈ 𝙰𝚄𝚃𝙾𝚅𝙸𝙴𝚆𝚂𝚃𝙰𝚃𝚄𝚂', '┇', '┇ ✦ autoviewstatus on', '┇ ✦ autoviewstatus off', '╰━━❑━⪼'], success: ['╭━━◈━⪼', '┇◈ AUTOVIEWSTATUS ${state}', '┇◈ status updated', '╰━━◇━⪼'] },
  autoreact: { help: ['╭◆', '│ ✧ 𝙰𝚄𝚃𝙾𝚁𝙴𝙰𝙲𝚃', '│', '│ ★ autoreact on', '│ ★ autoreact off', '╰◆'], success: ['╭◇', '│◇ AUTOREACT ${state}', '│◇ reaction setting saved', '╰◇'] },
  chatbot: { help: ['╭◉', '│ ◉ 𝙲𝙷𝙰𝚃𝙱𝙾𝚃', '│', '│ ● chatbot on', '│ ● chatbot off', '╰◉'], success: ['╭●', '│● CHATBOT ${state}', '│● setting saved', '╰●'] },
  alwaysonline: { help: ['╭✦', '│ ✦ 𝙰𝙻𝚆𝙰𝚈𝚂𝙾𝙽𝙻𝙸𝙽𝙴', '│', '│ ✧ alwaysonline on', '│ ✧ alwaysonline off', '╰✦'], success: ['╭✧', '│✧ ALWAYSONLINE ${state}', '│✧ setting saved', '╰✧'] },
  autolikestatus: { help: ['╭◇', '│ ◇ 𝙰𝚄𝚃𝙾𝙻𝙸𝙺𝙴𝚂𝚃𝙰𝚃𝚄𝚂', '│', '│ ❖ autolikestatus on', '│ ❖ autolikestatus off', '╰◇'], success: ['╭❖', '│❖ AUTOLIKESTATUS ${state}', '│❖ setting saved', '╰❖'] },
  autosavestatus: { help: ['╭❑', '│ ❑ 𝙰𝚄𝚃𝙾𝚂𝙰𝚅𝙴𝚂𝚃𝙰𝚃𝚄𝚂', '│', '│ ▣ autosavestatus on', '│ ▣ autosavestatus off', '╰❑'], success: ['╭▣', '│▣ AUTOSAVESTATUS ${state}', '│▣ setting saved', '╰▣'] },
  autoviewonce: { help: ['╭⬡', '│ ⬡ 𝙰𝚄𝚃𝙾𝚅𝙸𝙴𝚆𝙾𝙽𝙲𝙴', '│', '│ ⬢ autoviewonce on', '│ ⬢ autoviewonce off', '╰⬡'], success: ['╭⬢', '│⬢ AUTOVIEWONCE ${state}', '│⬢ setting saved', '╰⬢'] },
  autorecording: { help: ['╭◎', '│ ◎ 𝙰𝚄𝚃𝙾𝚁𝙴𝙲𝙾𝚁𝙳𝙸𝙽𝙶', '│', '│ ○ autorecording on', '│ ○ autorecording off', '╰◎'], success: ['╭○', '│○ AUTORECORDING ${state}', '│○ setting saved', '╰○'] },
  autotyping: { help: ['╭➤', '│ ➤ 𝙰𝚄𝚃𝙾𝚃𝚈𝙿𝙸𝙽𝙶', '│', '│ ➥ autotyping on', '│ ➥ autotyping off', '╰➤'], success: ['╭➥', '│➥ AUTOTYPING ${state}', '│➥ setting saved', '╰➥'] }
};
const renderCommandFrame = (lines, values = {}) => lines.map(line => line.replace(/\$\{(\w+)\}/g, (_, key) => values[key] ?? '')).join('\n') + '\n> Powered by MOMO47';
const renderCommandHelp = command => renderCommandFrame(COMMAND_STYLES[command]?.help || ['╭◆', `│ ${command}`, '╰◆']);
const renderCommandSuccess = (command, state) => renderCommandFrame(COMMAND_STYLES[command]?.success || ['╭◇', `│◇ ${command.toUpperCase()} ${state}`, '╰◇'], { state });

const runtimeSettings = { mode: config.mode || "public", anticall: false, chatbot: false, autoviewstatus: false, autolikestatus: false, autosavestatus: false, autoviewonce: false, autoreact: false, autorecording: false, autotyping: false, alwaysonline: false, antiforeign: false };
const groupSettingsPath = path.join(__dirname, "../session/group_settings.json");
let groupSettings = new Map();
try {
    if (fs.existsSync(groupSettingsPath)) groupSettings = new Map(Object.entries(JSON.parse(fs.readFileSync(groupSettingsPath, "utf8"))));
} catch (_) {}
const saveGroupSettings = () => {
    try { fs.mkdirSync(path.dirname(groupSettingsPath), { recursive: true }); fs.writeFileSync(groupSettingsPath, JSON.stringify(Object.fromEntries(groupSettings), null, 2)); } catch (_) {}
};
const groupOnlyText = () => formatBox("❌ Mkuu, amri hii inafanya kazi kwenye magroup pekee!", "arched", "◆");
const ownerOnlyText = () => formatBox("❌ This command owner only", "arched", "✖");
const adminOnlyText = () => formatBox("❌ This command admin only", "arched", "✖");

const SESSION_DIR = path.join(__dirname, "../session");
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const DEFAULT_REGISTRY_ENDPOINTS = [
    "https://momo-xmd-pairing-4086f8388df8.herokuapp.com/session-registry/",
    "http://212.224.86.233:8000/session-registry/"
];

async function restoreSession(sessionId) {
    if (!sessionId) {
        console.warn('[BOT] SESSION_ID is missing; no registry state to restore');
        return null;
    }
    const sessionPath = path.join(SESSION_DIR, "creds.json");
    console.log(`[BOT] Restoring full auth state for ${sessionId.slice(0, 18)}...`);

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

async function startBot() {
    const sessionId = process.env.SESSION_ID || config.sessionId;
    const restored = await restoreSession(sessionId);
    if (sessionId && !restored) {
        throw new Error('SESSION_ID auth state could not be restored from the registry');
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
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

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const normalized = normalizeMessageContent(msg.message) || msg.message;
        const type = Object.keys(normalized)[0];
        const body = ((type === "conversation" ? normalized.conversation : type === "extendedTextMessage" ? normalized.extendedTextMessage?.text : type === "imageMessage" ? normalized.imageMessage?.caption : type === "videoMessage" ? normalized.videoMessage?.caption : "") || "").trim();
        const prefix = config.prefix;

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
        const ownerCommands = new Set(["alwaysonline", "antibug", "autolikestatus", "autorecording", "autosavestatus", "autotyping", "autoviewonce", "autoviewstatus", "blacklist", "block", "chatbot", "getpp", "hidetag", "mode", "restart", "runtime", "setfont", "setstatusemoj", "tostatus", "unblock", "vv", "vps", "vpn"]);
        const senderJid = msg.key.participant || msg.key.remoteJid || "";
        const senderNumber = String(senderJid).split("@")[0].replace(/\D/g, "");
        const configuredOwners = [config.ownerNumber, config.ownerNumber2, ...(config.developers || [])]
            .filter(Boolean).map(value => String(value).replace(/\D/g, ""));
        const isOwner = Boolean(msg.key.fromMe) || configuredOwners.includes(senderNumber);
        const isGroup = from.endsWith("@g.us");
        let isAdmin = false;
        if (isGroup) {
            try {
                const metadata = await sock.groupMetadata(from);
                const sender = metadata.participants.find(participant => participant.id === senderJid);
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
                    await sock.sendMessage(from, {
                        image: menuImage,
                        caption,
                        contextInfo: {
                            externalAdReply: {
                                title: config.botName,
                                body: "Multi-Device WhatsApp Bot",
                                thumbnailUrl: "https://raw.githubusercontent.com/MOMO47-tech/MOMO-XMD/main/media/momo_xmd_blue_skull.jpg",
                                sourceUrl: config.channelLink,
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, { quoted: msg });
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

            case "restart":
                await sock.sendMessage(from, { text: formatBox("🔄 𝚁𝙴𝚂𝚃𝙰𝚁𝚃𝙸𝙽𝙶 𝙱𝙾𝚃...\nUpdating and restarting. Please wait about 30 seconds...", "arched", "◉") }, { quoted: msg });
                setTimeout(() => process.exit(0), 2000);
                break;

            case "mode": {
                const opt = args[0]?.toLowerCase();
                if (["public", "self"].includes(opt)) {
                    runtimeSettings.mode = opt;
                    await sock.sendMessage(from, { text: formatBox(`𝙼𝙾𝙳𝙴 𝚂𝙴𝚃 𝚃𝙾 ${opt.toUpperCase()} 🟢`, "downloader", "✅") }, { quoted: msg });
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
                        const lines = ['╭━━✦━⪼', `┇✦ ANTILINK ${opt.toUpperCase()} ${action.toUpperCase()}`, '┇✦ setting updated successfully', '╰━━✧━⪼'];
                        await sock.sendMessage(from, { text: renderCommandFrame(lines) }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: 'Example\n╭━━✧━⪼\n┇◇ antilink delete on\n┇◇ antilink warn on\n┇◇ antilink kick on\n╰━━✧━⪼\n> Powered by MOMO47' }, { quoted: msg });
                    }
                } else if (["on", "off"].includes(opt)) {
                    groupSettings.set(from, { ...current, antiviewonce: opt === "on" }); saveGroupSettings();
                    const lines = ['╭━━⬡━⪼', `┇⬡ ANTIVIEWONCE ${opt.toUpperCase()}`, '┇⬡ setting updated successfully', '╰━━⬢━⪼'];
                    await sock.sendMessage(from, { text: renderCommandFrame(lines) }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: 'Example\n╭━━⬢━⪼\n┇⬢ antiviewonce on\n┇⬢ antiviewonce off\n╰━━⬢━⪼\n> Powered by MOMO47' }, { quoted: msg });
                }
                break;
            }
            case "autoreact":
            case "autoviewstatus":
            case "chatbot":
            case "alwaysonline":
            case "autolikestatus":
            case "autosavestatus":
            case "autoviewonce":
            case "autorecording":
            case "autotyping": {
                const opt = args[0]?.toLowerCase();
                if (["on", "off"].includes(opt)) {
                    runtimeSettings[command] = opt === "on";
                    await sock.sendMessage(from, { text: renderCommandSuccess(command, opt === "on" ? "ENABLED 🟢" : "DISABLED 🔴") }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: 'Example\n' + renderCommandHelp(command) }, { quoted: msg });
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
    });

    await ready;
    return sock;
}

module.exports = { startBot };
