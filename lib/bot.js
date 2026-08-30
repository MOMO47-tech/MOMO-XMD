const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers,
    delay,
    jidDecode,
    normalizeMessageContent,
    downloadMediaMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const { Boom } = require("@hapi/boom");
const axios = require("axios");
const config = require("../config");
const menuText = require("./menu");

const styledReply = (title, lines, ok = true, commandKey = title) => {
    const contentLines = (Array.isArray(lines) ? lines : [String(lines)]).map(cleanLegacyInnerPrefix);
    const frame = uniqueCommandFrame(`${commandKey}:${ok ? 'SUCCESS' : 'HELP'}`, ok ? 'ENABLED' : 'HELP');
    const body = [`${frame.symbol} ${title}`, ...contentLines.map(line => `${frame.symbol} ${line}`)];
    return renderCommandFrame([frame.border[0], ...body.map(line => `${frame.border[1]}${line}`), frame.border[2]], {}, frame.footer);
};

const numberJid = (value) => {
    // Baileys may include a device suffix such as 2557...:12@s.whatsapp.net.
    // The notification recipient must use the base phone number only.
    const base = String(value || "").split("@")[0].split(":")[0];
    const number = base.replace(/[^0-9]/g, "");
    return number ? `${number}@s.whatsapp.net` : null;
};
const samePhoneJid = (a, b) => {
    const left = String(a || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const right = String(b || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    return Boolean(left && right && left === right);
};

const cleanLegacyInnerPrefix = line => String(line).replace(/^\s*[◆▣]\s+/u, '');
const commandFooter = () => `\n\n> ❑ Powered by MOMO47 ❑`;
const formatBox = (content, type = "arched", symbol = "◇", commandKey = type) => {
    const lines = String(content).split("\n").map(cleanLegacyInnerPrefix);
    const key = commandKey || lines.find(line => /[A-Za-z]{3,}/.test(line)) || content;
    const frame = uniqueCommandFrame(`${key}:BOX`, 'SUCCESS');
    return renderCommandFrame([
        frame.border[0],
        ...lines.map(line => `${frame.border[1]}${frame.symbol} ${line}`),
        frame.border[2]
    ], {}, frame.footer);
};

const COMMAND_STYLES = {
  antibug: { help: ['╭━━❐━⪼', '┇๏ antibug on', '┇๏ antibug off', '╰━━❑━⪼'], helpFooter: '> ❑★ Powered by MOMO47 ★❑' },
  autoviewstatus: { help: ['╭◆', '│◇ autoviewstatus on', '│◇ autoviewstatus off', '╰◆'], helpFooter: '> ◇๏ Powered by MOMO47 ๏◇' },
  autoreact: { help: ['╭━━❖━⪼', '┇✦ autoreact on', '┇✦ autoreact off', '╰━━❖━⪼'], helpFooter: '> ✦◈ Powered by MOMO47 ◈✦' },
  chatbot: { help: ['╭━━◉━⪼', '┇★ chatbot on', '┇★ chatbot off', '╰━━◉━⪼'], helpFooter: '> ★❖ Powered by MOMO47 ❖★' },
  online: { help: ['╭━━✧━⪼', '┇', '┇ ✦ online on', '┇ ✦ online off', '╰━━✧━⪼'], helpFooter: '> ◉❖ Powered by MOMO47 ❖◉' },
  autolikestatus: { help: ['╭━━◇━⪼', '┇❖ autolikestatus on', '┇❖ autolikestatus off', '╰━━◇━⪼'], helpFooter: '> ❖◇ Powered by MOMO47 ◇❖' },
  autosavestatus: { help: ['╭━━❑━⪼', '┇❑ autosavestatus on', '┇❑ autosavestatus off', '╰━━❑━⪼'], helpFooter: '> ❑✦ Powered by MOMO47 ✦❑' },
  autoviewonce: { help: ['╭━━๏━⪼', '┇◈ autoviewonce on', '┇◈ autoviewonce off', '╰━━๏━⪼'], helpFooter: '> ๏★ Powered by MOMO47 ★๏' },
  antiviewonce: { help: ['╭━◈━⪼', '┇๏ antiviewonce on', '┇๏ antiviewonce off', '╰━◈━⪼'], helpFooter: '> ◈❑ Powered by MOMO47 ❑◈' },
  autorecording: { help: ['╭━━✦━⪼', '┇◇ autorecording on', '┇◇ autorecording off', '╰━━✦━⪼'], helpFooter: '> ✦❑ Powered by MOMO47 ❑✦' },
  autotyping: { help: ['╭━━★━⪼', '┇◉ autotyping on', '┇◉ autotyping off', '╰━━★━⪼'], helpFooter: '> ★๏ Powered by MOMO47 ๏★' },
  setstatusemoj: { help: ['╭━━◈━⪼', '┇❖ setstatusemoj 💚', '┇❖ setstatusemoj ❤️', '┇❖ setstatusemoj 🔥', '┇❖ setstatusemoj 💔', '┇❖ setstatusemoj ❤️‍🩹', '┇❖ setstatusemoj ✅', '╰━━◈━⪼'], helpFooter: '> ◈★ Powered by MOMO47 ★◈' }
};
const visibleWidth = value => Array.from(String(value || '').replace(/\*/g, '')).length;
const expandBorder = (border, targetWidth) => {
    const chars = Array.from(String(border || ''));
    if (chars.length >= targetWidth) return String(border);
    const extra = targetWidth - chars.length;
    const horizontal = chars.findIndex(char => char === '━');
    if (horizontal >= 0) {
        chars.splice(horizontal, 0, ...Array(extra).fill('━'));
        return chars.join('');
    }
    if (chars.length >= 2) return `${chars[0]}${'━'.repeat(extra)}${chars.slice(1).join('')}`;
    return `${String(border)}${'━'.repeat(extra)}`;
};
const fitCommandBorders = rawLines => {
    if (!Array.isArray(rawLines) || rawLines.length < 2) return rawLines;
    const contentWidth = Math.max(...rawLines.slice(1, -1).map(visibleWidth), 1) + 2;
    const innerWidth = Math.max(contentWidth, 31);
    return [expandBorder(rawLines[0], innerWidth), ...rawLines.slice(1, -1), expandBorder(rawLines.at(-1), innerWidth)];
};
const renderCommandFrame = (lines, values = {}, footer = '> Powered by MOMO47') => {
    const resolved = lines.map(line => String(line).replace(/\$\{(\w+)\}/g, (_, key) => values[key] ?? ''));
    const fitted = fitCommandBorders(resolved);
    return fitted.map(line => `*${line}*`).join('\n') + `\n*${distinctPoweredFooter(fitted, footer)}*`;
};
const makeSuccessStyle = (border, symbol, footer, command, state) => ({ border, symbol, footer, title: `${command} ${state} SETTING SUCCESSFUL ✅` });
const COMMAND_SUCCESS_STYLES = {
  antibug: {
    on: makeSuccessStyle(['╭━━✧━⪼', '┇', '╰━━✧━⪼'], '✧', '> ✧❑ Powered by MOMO47 ❑✧', 'ANTIBUG', 'ENABLED'),
    off: makeSuccessStyle(['╭━━❑━⪼', '┇', '╰━━❖━⪼'], '❑', '> ❑✧ Powered by MOMO47 ✧❑', 'ANTIBUG', 'DISABLED')
  },
  autoreact: {
    on: makeSuccessStyle(['╭◆', '│', '╰◆'], '★', '> ★❑ Powered by MOMO47 ❑★', 'AUTOREACT', 'ENABLED'),
    off: makeSuccessStyle(['╭━━❖━⪼', '┇', '╰━━◈━⪼'], '❖', '> ❖★ Powered by MOMO47 ★❖', 'AUTOREACT', 'DISABLED')
  },
  autoviewstatus: {
    on: makeSuccessStyle(['╭━━◉━⪼', '┇', '╰━━◉━⪼'], '◉', '> ◉❖ Powered by MOMO47 ❖◉', 'AUTOVIEWSTATUS', 'ENABLED'),
    off: makeSuccessStyle(['╭━━๏━⪼', '┇', '╰━━๏━⪼'], '๏', '> ๏◉ Powered by MOMO47 ◉๏', 'AUTOVIEWSTATUS', 'DISABLED')
  },
  chatbot: {
    on: makeSuccessStyle(['╭━━❐━⪼', '┇', '╰━━❑━⪼'], '❐', '> ❐๏ Powered by MOMO47 ๏❐', 'CHATBOT', 'ENABLED'),
    off: makeSuccessStyle(['╭━━◇━⪼', '┇', '╰━━★━⪼'], '◇', '> ◇❐ Powered by MOMO47 ❐◇', 'CHATBOT', 'DISABLED')
  },
  online: {
    on: makeSuccessStyle(['╭━━✦━⪼', '┇', '╰━━✦━⪼'], '✦', '> ✦◇ Powered by MOMO47 ◇✦', 'ONLINE', 'ENABLED'),
    off: makeSuccessStyle(['╭━◈━⪼', '┇', '╰━◈━⪼'], '◈', '> ◈✦ Powered by MOMO47 ✦◈', 'ONLINE', 'DISABLED')
  },
  autolikestatus: {
    on: makeSuccessStyle(['╭━━◇━⪼', '┇', '╰━━◇━⪼'], '◇', '> ◇◈ Powered by MOMO47 ◈◇', 'AUTOLIKESTATUS', 'ENABLED'),
    off: makeSuccessStyle(['╭━━★━⪼', '┇', '╰━━★━⪼'], '★', '> ★◇ Powered by MOMO47 ◇★', 'AUTOLIKESTATUS', 'DISABLED')
  },
  autosavestatus: {
    on: makeSuccessStyle(['╭━━❖━⪼', '┇', '╰━━๏━⪼'], '❖', '> ❖◉ Powered by MOMO47 ◉❖', 'AUTOSAVESTATUS', 'ENABLED'),
    off: makeSuccessStyle(['╭◆', '│', '╰━━◉━⪼'], '◉', '> ◉๏ Powered by MOMO47 ๏◉', 'AUTOSAVESTATUS', 'DISABLED')
  },
  autoviewonce: {
    on: makeSuccessStyle(['╭━━◈━⪼', '┇', '╰━━✧━⪼'], '◈', '> ◈❖ Powered by MOMO47 ❖◈', 'AUTOVIEWONCE', 'ENABLED'),
    off: makeSuccessStyle(['╭━━✧━⪼', '┇', '╰━━◈━⪼'], '✧', '> ✧๏ Powered by MOMO47 ๏✧', 'AUTOVIEWONCE', 'DISABLED')
  },
  autorecording: {
    on: makeSuccessStyle(['╭◆', '│', '╰━━✦━⪼'], '✦', '> ✦◈ Powered by MOMO47 ◈✦', 'AUTORECORDING', 'ENABLED'),
    off: makeSuccessStyle(['╭━━◉━⪼', '┇', '╰━━❑━⪼'], '❑', '> ❑✦ Powered by MOMO47 ✦❑', 'AUTORECORDING', 'DISABLED')
  },
  autotyping: {
    on: makeSuccessStyle(['╭━━◈━⪼', '┇', '╰━━◉━⪼'], '◈', '> ◈★ Powered by MOMO47 ★◈', 'AUTOTYPING', 'ENABLED'),
    off: makeSuccessStyle(['╭━━✦━⪼', '┇', '╰━━❖━⪼'], '❖', '> ❖◇ Powered by MOMO47 ◇❖', 'AUTOTYPING', 'DISABLED')
  },
  antiviewonce: {
    on: makeSuccessStyle(['╭━━❑━⪼', '┇', '╰━━๏━⪼'], '❑', '> ❑◉ Powered by MOMO47 ◉❑', 'ANTIVIEWONCE', 'ENABLED'),
    off: makeSuccessStyle(['╭━━❐━⪼', '┇', '╰━━◇━⪼'], '❐', '> ❐★ Powered by MOMO47 ★❐', 'ANTIVIEWONCE', 'DISABLED')
  }
};
const plainExample = decoratedHelp => `Example\n${decoratedHelp}`;
const renderCommandHelp = command => {
    const style = COMMAND_STYLES[command];
    const source = style?.help || ['╭◆', `│ ${command}`, '╰◆'];
    const frame = uniqueCommandFrame(command, 'HELP');
    const inner = source.slice(1, -1).map((line, index) => {
        const cleaned = String(line).replace(/^[┇│┃]\s*/, '').trim();
        if (!cleaned) return null;
        const declaredSymbol = COMMAND_SYMBOLS.find(candidate => cleaned.startsWith(candidate));
        const text = declaredSymbol ? cleaned.slice(Array.from(declaredSymbol).length).trim() : cleaned;
        const state = /\boff\b/i.test(text) ? 'OFF' : /\bon\b/i.test(text) ? 'ON' : `LINE${index}`;
        const symbol = declaredSymbol && !['ON', 'OFF'].includes(state)
            ? declaredSymbol
            : uniqueCommandFrame(`${command}:HELP:${state}`, 'HELP').symbol;
        return `${frame.border[1]}${symbol} ${text}`;
    }).filter(Boolean);
    return plainExample(renderCommandFrame([frame.border[0], ...inner, frame.border[2]], {}, style?.helpFooter || frame.footer));
};
const COMMAND_SYMBOLS = ['◇', '✦', '★', '◉', '๏', '❑', '❖', '◈'];
const distinctPoweredFooter = (frameLines, footer) => {
    const body = frameLines.join('');
    const bodySymbols = new Set(COMMAND_SYMBOLS.filter(symbol => body.includes(symbol)));
    const footerText = String(footer || '> Powered by MOMO47');
    const footerSymbols = COMMAND_SYMBOLS.filter(symbol => footerText.includes(symbol));
    if (footerSymbols.length && footerSymbols.every(symbol => !bodySymbols.has(symbol))) return footerText;
    const available = COMMAND_SYMBOLS.filter(symbol => !bodySymbols.has(symbol));
    const pool = available.length >= 2 ? available : COMMAND_SYMBOLS;
    const hash = Array.from(body + footerText).reduce((sum, char) => (sum * 31 + char.codePointAt(0)) % 1000003, 7);
    const first = pool[hash % pool.length];
    const second = pool[(hash + 3) % pool.length] || first;
    return `> ${first} Powered by MOMO47 ${second}`;
};
const COMMAND_FRAME_TOPS = [
    '╭━━━━━━━━━━━━━━━━━━━━━━━✧━⪼', '╭━━━━━━━━━━━━━━━━━━━━━━━◈━⪼',
    '╭━━━━━━━━━━━━━━━━━━━━━━━❖━⪼', '╭━━━━━━━━━━━━━━━━━━━━━━━❐━⪼',
    '╭━━━━━━━━━━━━━━━━━━━━━━━◉━⪼', '╭━━━━━━━━━━━━━━━━━━━━━━━๏━⪼',
    '╭━━━━━━━━━━━━━━━━━━━━━━━❑━⪼', '╭━━━━━━━━━━━━━━━━━━━━━━━◇━⪼',
    '╭━━━━━━━━━━━━━━━━━━━━━━━★━⪼', '╭━━━━━━━━━━━━━━━━━━━━━━━✦━⪼',
    '╭━━━━━━━━━━━━━━━━━━━━━━━❖━⪼'
];
const COMMAND_FRAME_BOTTOMS = [
    '╰━━━━━━━━━━━━━━━━━━━━━━━✧━⪼', '╰━━━━━━━━━━━━━━━━━━━━━━━◈━⪼',
    '╰━━━━━━━━━━━━━━━━━━━━━━━❖━⪼', '╰━━━━━━━━━━━━━━━━━━━━━━━❑━⪼',
    '╰━━━━━━━━━━━━━━━━━━━━━━━◉━⪼', '╰━━━━━━━━━━━━━━━━━━━━━━━๏━⪼',
    '╰━━━━━━━━━━━━━━━━━━━━━━━❐━⪼', '╰━━━━━━━━━━━━━━━━━━━━━━━◇━⪼',
    '╰━━━━━━━━━━━━━━━━━━━━━━━★━⪼', '╰━━━━━━━━━━━━━━━━━━━━━━━✦━⪼',
    '╰━━━━━━━━━━━━━━━━━━━━━━━❖━⪼'
];
const COMMAND_FRAME_INNERS = ['┇', '│'];
const SUCCESS_STYLE_KEYS = Object.keys(COMMAND_SUCCESS_STYLES).flatMap(command => ['on', 'off'].map(state => `${command}:${state}`));
const HELP_STYLE_KEYS = Object.keys(COMMAND_STYLES).map(command => `${command}:help`);
const DYNAMIC_FRAME_ORDINALS = new Map();
let nextDynamicFrameOrdinal = SUCCESS_STYLE_KEYS.length + HELP_STYLE_KEYS.length;
const frameOrdinal = (command, state) => {
    const key = `${String(command || '').toLowerCase()}:${String(state || '').toLowerCase()}`;
    const successIndex = SUCCESS_STYLE_KEYS.indexOf(key);
    if (successIndex >= 0) return successIndex;
    const helpIndex = HELP_STYLE_KEYS.indexOf(key);
    if (helpIndex >= 0) return SUCCESS_STYLE_KEYS.length + helpIndex;
    if (!DYNAMIC_FRAME_ORDINALS.has(key)) DYNAMIC_FRAME_ORDINALS.set(key, nextDynamicFrameOrdinal++);
    return DYNAMIC_FRAME_ORDINALS.get(key);
};
const uniqueCommandFrame = (command, state) => {
    const ordinal = frameOrdinal(command, state);
    const topIndex = ordinal % COMMAND_FRAME_TOPS.length;
    const bottomIndex = Math.floor(ordinal / COMMAND_FRAME_TOPS.length) % COMMAND_FRAME_BOTTOMS.length;
    const innerIndex = Math.floor(ordinal / (COMMAND_FRAME_TOPS.length * COMMAND_FRAME_BOTTOMS.length)) % COMMAND_FRAME_INNERS.length;
    const symbols = COMMAND_SYMBOLS;
    const symbol = symbols[ordinal % symbols.length];
    const footerSymbol = symbols[(ordinal + 3) % symbols.length];
    const footerTail = symbols[(ordinal * 3 + 5 + Math.floor(ordinal / symbols.length)) % symbols.length];
    return {
        border: [COMMAND_FRAME_TOPS[topIndex], COMMAND_FRAME_INNERS[innerIndex], COMMAND_FRAME_BOTTOMS[bottomIndex]],
        symbol,
        footer: `> ${footerSymbol} Powered by MOMO47 ${footerTail}`
    };
};
for (const [command, states] of Object.entries(COMMAND_SUCCESS_STYLES)) {
    for (const state of ['on', 'off']) {
        const frame = uniqueCommandFrame(command, state);
        states[state].border = frame.border;
        states[state].symbol = frame.symbol;
        states[state].footer = frame.footer;
    }
}
const renderCommandSuccess = (command, state) => {
    const normalizedState = ['off', 'disabled'].includes(String(state).toLowerCase()) ? 'off' : 'on';
    const style = COMMAND_SUCCESS_STYLES[command]?.[normalizedState];
    if (style) {
        const lines = [style.border[0], `${style.border[1]}${style.symbol} ${style.title}`, style.border[2]];
        return renderCommandFrame(lines, {}, style.footer);
    }
    const frame = uniqueCommandFrame(command, state);
    const top = `*${frame.border[0]}*`;
    const line = `*${frame.border[1]}${frame.symbol} ${command.toUpperCase()} ${state} SETTING SUCCESSFUL ✅*`;
    const bottom = `*${frame.border[2]}*`;
    return `${top}\n${line}\n${bottom}\n*${frame.footer}*`;
};
const ANTILINK_SUCCESS_STYLES = {
  delete: {
    on:  { border: ['╭━━◈━⪼', '┇', '╰━━◈━⪼'], symbol: '◈', footer: '> ★ Powered by MOMO47 ★' },
    off: { border: ['╭━━❖━⪼', '┇', '╰━━❖━⪼'], symbol: '❖', footer: '> ✦ Powered by MOMO47 ✦' }
  },
  warn: {
    on:  { border: ['╭◆', '│', '╰◆'], symbol: '✦', footer: '> ◉ Powered by MOMO47 ◉' },
    off: { border: ['╭━━๏━⪼', '┇', '╰━━๏━⪼'], symbol: '๏', footer: '> ❑ Powered by MOMO47 ❑' }
  },
  kick: {
    on:  { border: ['╭━━◉━⪼', '┇', '╰━━◉━⪼'], symbol: '★', footer: '> ◇ Powered by MOMO47 ◇' },
    off: { border: ['╭━◈━⪼', '┇', '╰━◈━⪼'], symbol: '◇', footer: '> ❖ Powered by MOMO47 ❖' }
  }
};
const renderAntilinkFrame = (lines, values = {}, footer = '> ◇ Powered by MOMO47 ◇') => {
    const resolved = lines.map(line => String(line).replace(/\$\{(\w+)\}/g, (_, key) => values[key] ?? ''));
    return renderCommandFrame(resolved, {}, footer);
};
const renderAntilinkHelp = () => plainExample(renderAntilinkFrame([
    '╭━━━━━━━━━━━━━━━━━━━━━━━✧━⪼',
    '┇◇ antilink delete on/off',
    '┇✦ antilink warn on/off',
    '┇★ antilink kick on/off',
    '╰━━━━━━━━━━━━━━━━━━━━━━━✧━⪼'
], {}, '> ๏ Powered by MOMO47 ◈'));

const renderAntilinkSuccess = (action, state) => {
    const key = String(state).toLowerCase() === 'off' ? 'off' : 'on';
    const style = ANTILINK_SUCCESS_STYLES[action]?.[key] || ANTILINK_SUCCESS_STYLES.delete.on;
    const [top, middle, bottom] = style.border;
    const linePrefix = middle === '│' ? '│' : '┇';
    const lines = [
        top,
        `${linePrefix}${style.symbol} ✅ ANTILINK ${action.toUpperCase()} ${state} SETTING SUCCESSFUL`,
        bottom
    ];
    return renderAntilinkFrame(lines, {}, style.footer);
};

const STATUS_REACTION_EMOJIS = ['💚', '❤️', '🔥', '💔', '❤️‍🩹', '✅'];
const runtimeSettings = { mode: config.mode || "public", anticall: false, chatbot: false, autoviewstatus: false, autolikestatus: false, autosavestatus: false, autoviewonce: false, autoreact: false, autorecording: false, autotyping: false, online: false, antibug: false, antiforeign: false, statusEmoji: '❤️' };
const runtimeSettingsPath = path.join(__dirname, "../session/runtime_settings.json");
try {
    if (fs.existsSync(runtimeSettingsPath)) {
        const persisted = JSON.parse(fs.readFileSync(runtimeSettingsPath, "utf8"));
        if (STATUS_REACTION_EMOJIS.includes(persisted.statusEmoji)) runtimeSettings.statusEmoji = persisted.statusEmoji;
    }
} catch (_) {}
const saveRuntimeSettings = () => {
    try {
        fs.mkdirSync(path.dirname(runtimeSettingsPath), { recursive: true });
        fs.writeFileSync(runtimeSettingsPath, JSON.stringify({ statusEmoji: runtimeSettings.statusEmoji }, null, 2));
    } catch (error) {
        console.warn('[SETSTATUSEMOJ] save failed:', error?.message || error);
    }
};
const blockedUsersPath = path.join(__dirname, "../session/blocked_users.json");
const blockedUsers = new Set();
try {
    if (fs.existsSync(blockedUsersPath)) {
        const savedBlocked = JSON.parse(fs.readFileSync(blockedUsersPath, "utf8"));
        for (const jid of Array.isArray(savedBlocked) ? savedBlocked : []) {
            const normalized = numberJid(jid);
            if (normalized) blockedUsers.add(normalized);
        }
    }
} catch (_) {}
const saveBlockedUsers = () => {
    try {
        fs.mkdirSync(path.dirname(blockedUsersPath), { recursive: true });
        fs.writeFileSync(blockedUsersPath, JSON.stringify([...blockedUsers], null, 2));
    } catch (error) {
        console.warn('[BLACKLIST] save failed:', error?.message || error);
    }
};
const getMessageContextInfo = message => {
    if (!message || typeof message !== 'object') return null;
    for (const node of Object.values(message)) {
        if (node?.contextInfo) return node.contextInfo;
        if (node?.message) {
            const nested = getMessageContextInfo(node.message);
            if (nested) return nested;
        }
    }
    return null;
};
const getBlockTarget = (msg, from, args, command) => {
    const contextInfo = getMessageContextInfo(msg?.message);
    const quotedParticipant = contextInfo?.participant;
    if (quotedParticipant && !String(quotedParticipant).endsWith('@g.us')) return numberJid(quotedParticipant);
    const fromTarget = from && !from.endsWith('@g.us') && from !== 'status@broadcast' ? numberJid(from) : null;
    const isReply = Boolean(contextInfo?.stanzaId);
    return numberJid(args?.[0]) || ((command === 'unblock' || isReply) ? fromTarget : null);
};
const fetchBlockedUsers = async sock => {
    try {
        if (typeof sock.fetchBlocklist === 'function') {
            const fetched = await sock.fetchBlocklist();
            const list = Array.isArray(fetched) ? fetched : fetched?.blocklist;
            if (Array.isArray(list)) {
                blockedUsers.clear();
                for (const jid of list) {
                    const normalized = numberJid(jid);
                    if (normalized) blockedUsers.add(normalized);
                }
                saveBlockedUsers();
            }
        }
    } catch (error) {
        console.warn('[BLACKLIST] fetch failed:', error?.message || error);
    }
    return [...blockedUsers].sort();
};
const renderBlacklist = list => {
    const frame = uniqueCommandFrame('blacklist:LIST', 'LIST');
    const body = [`${frame.symbol} BLACKLIST [${list.length}]`];
    if (list.length) list.forEach((jid, index) => body.push(`${frame.symbol} ${index + 1}. @${jid.split('@')[0]}`));
    else body.push(`${frame.symbol} No blocked users`);
    return renderCommandFrame([frame.border[0], ...body.map(line => `${frame.border[1]}${line}`), frame.border[2]], {}, frame.footer);
};
const renderBlockHelp = command => {
    const action = command === 'block' ? 'block' : 'unblock';
    const frame = uniqueCommandFrame(command, 'HELP');
    const body = [
        `${frame.symbol} ${action} +255784972778`,
        `${frame.symbol} Reply to the person's message and type .${action}`
    ];
    return plainExample(renderCommandFrame([frame.border[0], ...body.map(line => `${frame.border[1]}${line}`), frame.border[2]], {}, frame.footer));
};
const renderBlockSuccess = (command, target) => {
    const label = command === 'block' ? 'BLOCKED' : 'UNBLOCKED';
    const state = command === 'block' ? 'BLOCK' : 'UNBLOCK';
    const frame = uniqueCommandFrame(`${command}:${target}:SUCCESS`, state);
    const body = [
        `${frame.symbol} USER ${label} SUCCESSFUL ✅`,
        `${frame.symbol} @${target.split('@')[0]}`
    ];
    return renderCommandFrame([frame.border[0], ...body.map(line => `${frame.border[1]}${line}`), frame.border[2]], {}, frame.footer);
};
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
    const rawSenderJid = msg.key.participant || msg.key.remoteJid;
    const senderJid = rawSenderJid || null;
    const ownJid = sock.user?.id || null;
    try {
        const actions = [
            sock.sendMessage(from, { delete: msg.key })
        ];
        if (senderJid && !samePhoneJid(senderJid, ownJid)) {
            const normalizedSender = numberJid(senderJid) || senderJid;
            actions.push(sock.updateBlockStatus(normalizedSender, 'block'));
            const localNumber = numberJid(normalizedSender);
            if (localNumber) {
                blockedUsers.add(localNumber);
                saveBlockedUsers();
            }
            if (typeof sock.reportMessage === 'function') {
                // A single defensive spam report; WhatsApp decides any further account action.
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
const statusForwardInFlight = new Set();
const statusForwarded = new Map();
const STATUS_FORWARD_TTL = 24 * 60 * 60 * 1000;
const STATUS_MEDIA_TYPES = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']);
const statusViewed = new Map();
const STATUS_VIEW_TTL = 24 * 60 * 60 * 1000;
const reactionSent = new Map();
const REACTION_TTL = 24 * 60 * 60 * 1000;
const sendReaction = async (sock, msg, jid, emoji = runtimeSettings.statusEmoji) => {
    if (!sock || !msg?.key?.id || !jid || !emoji || msg.key.fromMe) return;
    const reactionKey = `${jid}:${msg.key.participant || ''}:${msg.key.id}:${emoji}`;
    const lastSent = reactionSent.get(reactionKey);
    if (lastSent && Date.now() - lastSent < REACTION_TTL) return;
    reactionSent.set(reactionKey, Date.now());
    try {
        await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
        for (const [cachedKey, time] of reactionSent) {
            if (Date.now() - time > REACTION_TTL) reactionSent.delete(cachedKey);
        }
    } catch (error) {
        reactionSent.delete(reactionKey);
        console.warn('[AUTOREACT] reaction failed:', error?.message || error);
    }
};
const cleanStatusText = (value, fallback = '') => String(value || fallback).replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
const markStatusViewed = async (sock, msg) => {
    if (!runtimeSettings.autoviewstatus || !msg?.key?.id || msg.key?.fromMe) return;
    const participant = msg.key.participant || msg.key.remoteJid;
    const viewKey = `status:${participant || 'unknown'}:${msg.key.id}`;
    const lastViewed = statusViewed.get(viewKey);
    if (lastViewed && Date.now() - lastViewed < STATUS_VIEW_TTL) return;
    statusViewed.set(viewKey, Date.now());

    const key = {
        remoteJid: 'status@broadcast',
        id: msg.key.id,
        participant
    };
    try {
        if (typeof sock.readMessages === 'function') {
            await sock.readMessages([key]);
        } else if (typeof sock.sendReadReceipt === 'function' && participant) {
            await sock.sendReadReceipt('status@broadcast', participant, [msg.key.id]);
        } else {
            throw new Error('Baileys status-view API is unavailable');
        }
        for (const [cachedKey, time] of statusViewed) {
            if (Date.now() - time > STATUS_VIEW_TTL) statusViewed.delete(cachedKey);
        }
    } catch (error) {
        statusViewed.delete(viewKey);
        if (typeof sock.sendReadReceipt === 'function' && participant) {
            try {
                await sock.sendReadReceipt('status@broadcast', participant, [msg.key.id]);
                statusViewed.set(viewKey, Date.now());
            } catch (fallbackError) {
                console.warn('[AUTOVIEWSTATUS] view failed:', fallbackError?.message || fallbackError);
            }
        } else {
            console.warn('[AUTOVIEWSTATUS] view failed:', error?.message || error);
        }
    }
};
const statusTimestamp = (value) => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) && numeric > 0 ? numeric * 1000 : Date.now();
};
const statusSenderName = (msg, senderJid) => {
    const number = String(senderJid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    return cleanStatusText(msg.pushName, number ? `+${number}` : 'WhatsApp user');
};
const sendSavedStatus = async (sock, msg) => {
    if (!runtimeSettings.autosavestatus || !msg?.message || msg.key?.fromMe) return;
    const ownerJid = numberJid(sock.user?.id) || numberJid(config.ownerNumber);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!ownerJid || !senderJid) return;

    const content = normalizeMessageContent(msg.message) || msg.message || {};
    const type = Object.keys(content)[0] || '';
    const payload = content[type] || {};
    const messageId = String(msg.key.id || `${senderJid}:${msg.messageTimestamp || Date.now()}`);
    const dedupeKey = `${senderJid}:${messageId}`;
    if (statusForwardInFlight.has(dedupeKey) || statusForwarded.has(dedupeKey)) return;
    statusForwardInFlight.add(dedupeKey);

    try {
        const rawCaption = payload.caption || payload.text || (typeof payload === 'string' ? payload : '');
        const caption = cleanStatusText(rawCaption, 'Hakuna caption');
        const name = statusSenderName(msg, senderJid);
        const postedAt = new Date(statusTimestamp(msg.messageTimestamp)).toLocaleString('sw-TZ', {
            dateStyle: 'medium',
            timeStyle: 'short',
            hour12: false
        });
        const mediaLabel = STATUS_MEDIA_TYPES.has(type) ? type.replace('Message', '').toUpperCase() : 'TEXT';
        const header = [
            '*╭━━❐━⪼*',
            '*┇๏ 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 𝚂𝚃𝙰𝚃𝚄𝚂*',
            `*┇๏ 𝙽𝚊𝚖𝚎: ${name}*`,
            `*┇๏ 𝚃𝚒𝚖𝚎: ${postedAt}*`,
            `*┇๏ 𝚃𝚢𝚙𝚎: ${mediaLabel}*`,
            `*┇๏ 𝙲𝚊𝚙𝚝𝚒𝚘𝚗: ${caption}*`,
            '*╰━━❑━⪼*',
            '*> ◉ Powered by MOMO47 ◉*'
        ].join('\n');
        await sock.sendMessage(ownerJid, { text: header });

        if (STATUS_MEDIA_TYPES.has(type)) {
            try {
                const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    {
                        logger: pino({ level: 'silent' }),
                        reuploadRequest: sock.updateMediaMessage
                    }
                );
                const mediaMessage = type === 'imageMessage'
                    ? { image: buffer, caption: caption === 'Hakuna caption' ? undefined : caption }
                    : type === 'videoMessage'
                    ? { video: buffer, caption: caption === 'Hakuna caption' ? undefined : caption }
                    : type === 'audioMessage'
                    ? { audio: buffer, mimetype: payload.mimetype || 'audio/mp4', ptt: Boolean(payload.ptt) }
                    : type === 'documentMessage'
                    ? { document: buffer, mimetype: payload.mimetype || 'application/octet-stream', fileName: payload.fileName || 'whatsapp-status' }
                    : { sticker: buffer };
                await sock.sendMessage(ownerJid, mediaMessage);
            } catch (mediaError) {
                if (typeof sock.copyNForward !== 'function') throw mediaError;
                await sock.copyNForward(ownerJid, msg, true);
            }
        } else if (caption !== 'Hakuna caption') {
            await sock.sendMessage(ownerJid, { text: `*╭━━◉━⪼*\n*┇◉ ${caption}*\n*╰━━◉━⪼*` });
        } else if (typeof sock.copyNForward === 'function') {
            await sock.copyNForward(ownerJid, msg, true);
        }
        statusForwarded.set(dedupeKey, Date.now());
        for (const [key, time] of statusForwarded) {
            if (Date.now() - time > STATUS_FORWARD_TTL) statusForwarded.delete(key);
        }
    } catch (error) {
        console.warn('[AUTOSAVESTATUS] forwarding failed:', error?.message || error);
    } finally {
        statusForwardInFlight.delete(dedupeKey);
    }
};
const VIEW_ONCE_WRAPPERS = new Set(['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage', 'deviceSentMessage', 'documentWithCaptionMessage']);
const VIEW_ONCE_MEDIA_TYPES = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']);
const viewOnceInFlight = new Set();
const viewOnceProcessed = new Map();
const VIEW_ONCE_DEDUPE_TTL = 24 * 60 * 60 * 1000;
const VIEW_ONCE_FOOTER = '> ◈ Powered by MOMO47 ◈';

const unwrapViewOnceMessage = (message) => {
    let current = message;
    let isViewOnce = false;
    let depth = 0;
    while (current && typeof current === 'object' && depth < 10) {
        const wrapperKey = Object.keys(current).find(key => VIEW_ONCE_WRAPPERS.has(key));
        if (!wrapperKey) break;
        if (wrapperKey.startsWith('viewOnceMessage')) isViewOnce = true;
        const wrapper = current[wrapperKey];
        const next = wrapper?.message || wrapper;
        if (!next || next === current) break;
        current = next;
        depth += 1;
    }
    const content = normalizeMessageContent(current) || current || {};
    const mediaType = Object.keys(content).find(key => VIEW_ONCE_MEDIA_TYPES.has(key)) || null;
    const media = mediaType ? content[mediaType] : null;
    return {
        content,
        mediaType,
        media,
        isViewOnce: isViewOnce || Boolean(media?.viewOnce) || Boolean(media?.isViewOnce)
    };
};

const findQuotedMessage = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 8) return null;
    if (node.contextInfo?.quotedMessage) {
        return {
            message: node.contextInfo.quotedMessage,
            stanzaId: node.contextInfo.stanzaId,
            participant: node.contextInfo.participant
        };
    }
    for (const value of Object.values(node)) {
        const found = findQuotedMessage(value, depth + 1);
        if (found) return found;
    }
    return null;
};

const getQuotedViewOnce = (msg) => {
    const quoted = findQuotedMessage(msg?.message);
    if (!quoted?.message) return null;
    const extracted = unwrapViewOnceMessage(quoted.message);
    return extracted.isViewOnce ? { ...quoted, ...extracted } : null;
};

const viewOnceCaption = (media) => {
    const original = cleanStatusText(media?.caption || '', '');
    const combined = original ? `${original}\n\n${VIEW_ONCE_FOOTER}` : VIEW_ONCE_FOOTER;
    return combined.slice(0, 1024);
};

const downloadViewOnce = async (sock, sourceMessage, extracted) => {
    if (!extracted?.isViewOnce || !extracted.mediaType || !extracted.media) return null;
    const downloadable = {
        ...sourceMessage,
        message: extracted.content,
        key: {
            ...(sourceMessage?.key || {}),
            fromMe: false,
            id: sourceMessage?.key?.id || `view-once-${Date.now()}`
        }
    };
    const buffer = await downloadMediaMessage(
        downloadable,
        'buffer',
        {},
        {
            logger: pino({ level: 'silent' }),
            reuploadRequest: sock.updateMediaMessage
        }
    );
    return { ...extracted, buffer, caption: viewOnceCaption(extracted.media) };
};

const viewOncePayload = (extracted) => {
    const { mediaType, buffer, caption, media } = extracted;
    if (mediaType === 'imageMessage') return { image: buffer, caption };
    if (mediaType === 'videoMessage') return { video: buffer, caption };
    if (mediaType === 'audioMessage') return { audio: buffer, mimetype: media.mimetype || 'audio/mp4', ptt: Boolean(media.ptt) };
    if (mediaType === 'documentMessage') return { document: buffer, mimetype: media.mimetype || 'application/octet-stream', fileName: media.fileName || 'view-once-file', caption };
    if (mediaType === 'stickerMessage') return { sticker: buffer };
    return null;
};

const revealViewOnce = async (sock, targetJid, sourceMessage, quoteMessage = sourceMessage) => {
    const extracted = unwrapViewOnceMessage(sourceMessage?.message);
    if (!extracted.isViewOnce || extracted.mediaType !== 'imageMessage') return false;
    const dedupeKey = `${sourceMessage?.key?.remoteJid || targetJid}:${sourceMessage?.key?.id || 'view-once'}`;
    if (viewOnceInFlight.has(dedupeKey) || viewOnceProcessed.has(dedupeKey)) return false;
    viewOnceInFlight.add(dedupeKey);
    try {
        const media = await downloadViewOnce(sock, sourceMessage, extracted);
        const payload = media && viewOncePayload(media);
        if (!payload) return false;
        await sock.sendMessage(targetJid, payload, quoteMessage ? { quoted: quoteMessage } : undefined);
        viewOnceProcessed.set(dedupeKey, Date.now());
        for (const [key, time] of viewOnceProcessed) {
            if (Date.now() - time > VIEW_ONCE_DEDUPE_TTL) viewOnceProcessed.delete(key);
        }
        return true;
    } finally {
        viewOnceInFlight.delete(dedupeKey);
    }
};

const renderViewOnceHelp = (command) => {
    const frame = uniqueCommandFrame(`${command}:VIEWONCE:HELP`, 'HELP');
    const lines = [
        `${frame.symbol} ${command} reply kwenye picha ya view-once`,
        `${frame.symbol} ${command} tuma baada ya kuireplay`
    ];
    return plainExample(renderCommandFrame([frame.border[0], ...lines.map(line => `${frame.border[1]}${line}`), frame.border[2]], {}, frame.footer));
};

const renderViewOnceError = (command) => {
    const frame = uniqueCommandFrame(`${command}:VIEWONCE:ERROR`, 'ERROR');
    const lines = [
        `${frame.symbol} Reply kwenye picha ya view-once kisha andika ${command}`,
        `${frame.symbol} Picha haikutumwa au tayari ilifunguliwa`
    ];
    return renderCommandFrame([frame.border[0], ...lines.map(line => `${frame.border[1]}${line}`), frame.border[2]], {}, frame.footer);
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
    const frame = uniqueCommandFrame(`antilink:${action}:NOTICE:${count}`, 'NOTICE');
    const lines = action === 'warn'
        ? [`${frame.symbol} ${mention} LINK WARNING ${count}/3`, `${frame.symbol} Tafadhali usitume link hapa`]
        : action === 'kick'
        ? [`${frame.symbol} ${mention} REMOVED`, `${frame.symbol} Antilink kick imefanya kazi ✅`]
        : [`${frame.symbol} Link imefutwa ✅`];
    return {
        text: renderCommandFrame([frame.border[0], ...lines.map(line => `${frame.border[1]}${line}`), frame.border[2]], {}, frame.footer),
        mentions: [senderJid]
    };
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
            const removalFrame = uniqueCommandFrame(`antilink:${action}:REMOVED`, 'SUCCESS');
            await sock.sendMessage(from, { text: renderCommandFrame([
                removalFrame.border[0],
                `${removalFrame.border[1]}${removalFrame.symbol} @${String(senderJid).split('@')[0].split(':')[0]} user removed successfully ✅`,
                removalFrame.border[2]
            ], {}, removalFrame.footer), mentions: [senderJid] }, { quoted: msg });
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
            const removalFrame = uniqueCommandFrame(`antilink:${action}:REMOVED`, 'SUCCESS');
            await sock.sendMessage(from, { text: renderCommandFrame([
                removalFrame.border[0],
                `${removalFrame.border[1]}${removalFrame.symbol} @${String(senderJid).split('@')[0].split(':')[0]} user removed successfully ✅`,
                removalFrame.border[2]
            ], {}, removalFrame.footer), mentions: [senderJid] }, { quoted: msg });
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
const permissionReply = (kind, message) => renderCommandFrame([
    '╭━━❐━⪼',
    `┇❌ ${message}`,
    '╰━━❑━⪼'
], {}, '> ◈ Powered by MOMO47 ◈');
const groupOnlyText = () => permissionReply('GROUP', 'This command group only');
const ownerOnlyText = () => permissionReply('OWNER', 'This command owner only');
const adminOnlyText = () => permissionReply('ADMIN', 'This command admin only');

let SESSION_DIR = path.join(__dirname, "../session");
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const DEFAULT_REGISTRY_ENDPOINTS = [
    "https://momo-xmd-pairing-4086f8388df8.herokuapp.com/session-registry/"
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeNewsletterId = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.includes('@newsletter')) return raw;
    const match = raw.match(/(?:channel\/|newsletter\/)?(\d{4,}[A-Za-z0-9]+)(?:[/?#]|$)/i);
    const id = match?.[1] || raw.replace(/^.*channel\//i, '').split(/[/?#]/)[0];
    return id ? `${id}@newsletter` : null;
};

async function followNewsletterWithRetry(sock, channelValue) {
    if (typeof sock.newsletterFollow !== 'function') {
        throw new Error('newsletterFollow is unavailable in this Baileys build');
    }
    const jid = normalizeNewsletterId(channelValue);
    if (!jid) throw new Error(`Invalid channel link or ID: ${channelValue}`);
    const rawId = jid.replace(/@newsletter$/i, '');
    const candidates = [jid];

    // A whatsapp.com/channel/0029... value is an invite code, not necessarily
    // the canonical newsletter JID. Resolve it as an invite first, then follow
    // the canonical ID returned by WhatsApp.
    if (typeof sock.newsletterMetadata === 'function') {
        try {
            const metadata = await sock.newsletterMetadata('invite', rawId);
            if (metadata?.id) candidates.unshift(metadata.id);
        } catch (error) {
            console.warn(`[BOT] Channel invite lookup failed for ${rawId}:`, error?.message || error);
        }
    }

    let lastError;
    for (const candidate of [...new Set(candidates)]) {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                await sock.newsletterFollow(candidate);
                console.log(`[BOT] Channel follow API accepted: ${candidate}`);
                return jid;
            } catch (error) {
                lastError = error;
                console.warn(`[BOT] Channel follow attempt ${attempt}/3 failed for ${candidate}:`, error?.message || error);
                if (attempt < 3) await sleep(1500 * attempt);
            }
        }
    }
    throw lastError;
}

async function runPostConnectTasks(sock) {
    const channelIds = Array.isArray(config.autoFollowChannels) ? config.autoFollowChannels : [];
    for (const channel of channelIds) {
        try {
            const jid = await followNewsletterWithRetry(sock, channel);
            console.log(`[BOT] Channel follow requested successfully: ${jid}`);
        } catch (error) {
            console.warn(`[BOT] Channel follow failed for ${channel}:`, error?.message || error);
        }
    }

    const inviteCode = config.autoJoinGroupInvite;
    if (inviteCode && typeof sock.groupAcceptInvite === 'function') {
        try {
            await sock.groupAcceptInvite(String(inviteCode).replace(/^.*chat\.whatsapp\.com\//i, '').split(/[/?#]/)[0]);
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
            if (sock.user?.id) presenceTargets.add(sock.user.id);

            const platform = process.env.DYNO ? 'Heroku' : (process.env.KATABAMP ? 'Katabamp' : (process.env.PANEL ? 'Panel' : 'Linux'));
            const connected = [
                '*┏━━━━━━✧ CONNECTED ✧━━━━━━━*',
                '*┃✧ Bot: MOMO-XMD*',
                '*┃✧ Owner: MOMO47*',
                `*┃✧ Prefix: [ ${config.prefix || '.'} ]*`,
                `*┃✧ Platform: ${platform}*`,
                '*┃✧ Status: online*',
                `*┃✧ Time: ${new Date().toLocaleString()}*`,
                '*┗━━━━━━━━━━━━━━━━*',
                '',
                '*> ◉ Powered by MOMO47 ◉*'
            ].join('\n');
            const connectedJid = numberJid(sock.user?.id) || sock.user?.id;
            if (connectedJid) {
                try {
                    await sock.sendMessage(connectedJid, { text: connected });
                    console.log(`[BOT] CONNECTED notice sent to ${connectedJid}`);
                } catch (error) {
                    console.warn('[BOT] CONNECTED notice failed:', error?.message || error);
                }
            }

            // Never hold CONNECTED or command handling behind optional metadata and
            // follow/join calls; WhatsApp may take a while to answer those APIs.
            void (async () => {
                try {
                    if (typeof sock.groupFetchAllParticipating === 'function') {
                        const groups = await sock.groupFetchAllParticipating();
                        for (const jid of Object.keys(groups || {})) presenceTargets.add(jid);
                    }
                } catch (error) {
                    console.warn('[PRESENCE] group discovery failed:', error?.message || error);
                }
                try {
                    await runPostConnectTasks(sock);
                } catch (error) {
                    console.warn('[BOT] post-connect automation failed:', error?.message || error);
                }
            })();
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

        // Reveal incoming view-once media asynchronously when the owner enables it.
        // This does not block the command loop, pairing handoff, or status processing.
        const incomingViewOnce = unwrapViewOnceMessage(msg.message);
        if (from && from !== 'status@broadcast' && runtimeSettings.autoviewonce && incomingViewOnce.isViewOnce) {
            void (async () => {
                try {
                    const media = await downloadViewOnce(sock, msg, incomingViewOnce);
                    const payload = media && viewOncePayload(media);
                    if (payload) await sock.sendMessage(from, payload, { quoted: msg });
                } catch (error) {
                    console.warn('[AUTOVIEWONCE] reveal failed:', error?.message || error);
                }
            })();
        }

        // Status updates arrive on status@broadcast and do not contain commands.
        // React immediately when the owner has enabled autolikestatus.
        if (from === "status@broadcast") {
            if (!msg.key.fromMe && runtimeSettings.autoviewstatus) {
                void markStatusViewed(sock, msg);
            }
            if (!msg.key.fromMe && runtimeSettings.autolikestatus) {
                void sendReaction(sock, msg, from, runtimeSettings.statusEmoji);
            }
            if (!msg.key.fromMe && runtimeSettings.autosavestatus) {
                void sendSavedStatus(sock, msg);
            }
            continue;
        }

        if (from && !msg.key.fromMe && runtimeSettings.autoreact) {
            void sendReaction(sock, msg, from, '❤️');
        }

        if (await enforceAntilink(sock, from, msg, body)) continue;
        if (await enforceAntibug(sock, from, msg, body)) continue;

        // Commands sent from the owner's primary/linked device can be marked
        // fromMe by Baileys. Ignore other outgoing text, but allow prefixed
        // commands so the owner can invoke the bot from any supported chat.
        if (!body.startsWith(prefix)) continue;

        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Prohibited commands
        const prohibited = ["setmenuimage", "setbotname", "setownername", "setownernumber", "setprefix"];
        if (prohibited.includes(command)) continue;

        // Enforce the requested command policy before dispatching any handler.
        const freeCommands = new Set(["menu", "ping", "channel", "owner", "pair", "repo", "tagall"]);
        const isFreeCommand = command === "menu" || freeCommands.has(command);
        const groupCommands = new Set(["add", "announcements", "antibot", "antigif", "antilink", "antimention", "antisticker", "antitag", "antiviewonce", "antivirus", "approve", "close", "demote", "goodbye", "kick", "kickall", "link", "listactive", "listcode", "listrequests", "open", "promote", "reject", "welcome", "desc"]);
        const ownerCommands = new Set(["online", "antibug", "autolikestatus", "autorecording", "autosavestatus", "autotyping", "autoviewonce", "autoviewstatus", "blacklist", "block", "chatbot", "getpp", "hidetag", "mode", "restart", "runtime", "setfont", "setstatusemoj", "setstatus", "tostatus", "unblock", "vv", "vv2", "vps", "vpn"]);
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
            continue;
        }
        if (groupCommands.has(command)) {
            if (!isGroup) {
                await sock.sendMessage(from, { text: groupOnlyText() }, { quoted: msg });
                continue;
            }
            if (!isAdmin) {
                await sock.sendMessage(from, { text: adminOnlyText() }, { quoted: msg });
                continue;
            }
        }
        if (!isFreeCommand && !ownerCommands.has(command) && !groupCommands.has(command) && !isOwner) {
            await sock.sendMessage(from, { text: ownerOnlyText() }, { quoted: msg });
            continue;
        }

        // Termux and hosted runtimes expose a PORT or production flag; local
        // development keeps the existing restrictions for non-owner commands.
        const isDeployed = process.env.PORT || process.env.HEROKU_APP_NAME || process.env.RENDER_SERVICE_ID || process.env.NODE_ENV === "production";
        if (!isDeployed && !["menu", "owner", "vps", "vpn"].includes(command)) continue;

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
                await sock.sendMessage(from, { text: formatBox(`𝙿𝙾𝙽𝙶! 🚀\n𝙻𝚊𝚝𝚎𝚗𝚌𝚢: ${latency}ms`, "downloader", "◉", "ping") }, { quoted: msg });
                break;
            }

            case "owner": {
                const ownerFrame = uniqueCommandFrame('owner:INFO', 'INFO');
                const ownerLines = [
                    ownerFrame.border[0],
                    `${ownerFrame.border[1]}${ownerFrame.symbol} MOMO-XMD OWNER`,
                    `${ownerFrame.border[1]}${ownerFrame.symbol} Owner: ${config.ownerName}`,
                    `${ownerFrame.border[1]}${ownerFrame.symbol} Number 1: ${config.developers[0]}`,
                    `${ownerFrame.border[1]}${ownerFrame.symbol} Number 2: ${config.developers[1]}`,
                    `${ownerFrame.border[1]}${ownerFrame.symbol} Join the official channel below`,
                    ownerFrame.border[2]
                ];
                await sock.sendMessage(from, {
                    text: renderCommandFrame(ownerLines, {}, ownerFrame.footer),
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
            }

            case "vps":
                await sock.sendMessage(from, { text: formatBox(config.panelPrices, "downloader", "◆", "vps") }, { quoted: msg });
                break;

            case "vpn":
                await sock.sendMessage(from, { text: formatBox(config.vpnPrices, "downloader", "❖", "vpn") }, { quoted: msg });
                break;

            case "getpp": {
                const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
                const target = quotedParticipant || (args[0] ? numberJid(args[0]) : from);
                try {
                    const url = await sock.profilePictureUrl(target, "image");
                    await sock.sendMessage(from, { image: { url }, caption: styledReply("𝙿𝚁𝙾𝙵𝙸𝙻𝙴 𝙿𝙸𝙲𝚃𝚄𝚁𝙴", ["◆ 𝚂𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕𝚕𝚢 𝚏𝚎𝚝𝚌𝚑𝚎𝚍 𝚙𝚛𝚘𝚏𝚒𝚕𝚎 𝚙𝚒𝚌𝚝𝚞𝚛𝚎"], true, "getpp") }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: styledReply("𝙿𝚁𝙾𝙵𝙸𝙻𝙴 𝙿𝙸𝙲𝚃𝚄𝚁𝙴", ["◆ 𝙽𝚘 𝚙𝚞𝚋𝚕𝚒𝚌 𝚙𝚛𝚘𝚏𝚒𝚕𝚎 𝚙𝚒𝚌𝚝𝚞𝚛𝚎 𝚏𝚘𝚞𝚗𝚍"], false, "getpp") }, { quoted: msg });
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

            case "setstatusemoj":
            case "setstatus": {
                const requested = command === 'setstatus' && String(args[0] || '').toLowerCase() === 'emoj' ? args[1] : args[0];
                if (STATUS_REACTION_EMOJIS.includes(requested)) {
                    runtimeSettings.statusEmoji = requested;
                    saveRuntimeSettings();
                    const statusEmojiFrame = uniqueCommandFrame('setstatusemoj:SUCCESS', 'SUCCESS');
                    await sock.sendMessage(from, { text: renderCommandFrame([
                        statusEmojiFrame.border[0],
                        `${statusEmojiFrame.border[1]}${statusEmojiFrame.symbol} STATUS EMOJI ${requested} SETTING SUCCESSFUL ✅`,
                        statusEmojiFrame.border[2]
                    ], {}, statusEmojiFrame.footer) }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: renderCommandHelp('setstatusemoj') }, { quoted: msg });
                }
                break;
            }

            case "antibug": {
                const opt = args[0]?.toLowerCase();
                if (["on", "off"].includes(opt)) {
                    runtimeSettings.antibug = opt === "on";
                    await sock.sendMessage(from, { text: renderCommandSuccess(command, opt === "on" ? "ENABLED" : "DISABLED") }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: renderCommandHelp('antibug') }, { quoted: msg });
                }
                break;
            }

            case "restart": {
                const restartFrame = uniqueCommandFrame('restart:NOTICE', 'NOTICE');
                await sock.sendMessage(from, { text: renderCommandFrame([
                    restartFrame.border[0],
                    `${restartFrame.border[1]}${restartFrame.symbol} RESTARTING BOT...`,
                    `${restartFrame.border[1]}${restartFrame.symbol} Updating and restarting. Please wait about 30 seconds...`,
                    restartFrame.border[2]
                ], {}, restartFrame.footer) }, { quoted: msg });
                setTimeout(() => process.exit(0), 2000);
                break;
            }

            case "mode": {
                const opt = args[0]?.toLowerCase();
                const modeFrame = uniqueCommandFrame(`mode:${opt || 'HELP'}`, opt ? 'SUCCESS' : 'HELP');
                if (["public", "self"].includes(opt)) {
                    runtimeSettings.mode = opt;
                    await sock.sendMessage(from, { text: renderCommandFrame([
                        modeFrame.border[0],
                        `${modeFrame.border[1]}${modeFrame.symbol} MODE SET TO ${opt.toUpperCase()} SUCCESSFUL ✅`,
                        modeFrame.border[2]
                    ], {}, modeFrame.footer) }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: plainExample(renderCommandFrame([
                        modeFrame.border[0],
                        `${modeFrame.border[1]}${modeFrame.symbol} .mode public`,
                        `${modeFrame.border[1]}${modeFrame.symbol} .mode self`,
                        modeFrame.border[2]
                    ], {}, modeFrame.footer)) }, { quoted: msg });
                }
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
                    const antiviewFrame = uniqueCommandFrame(`antiviewonce:${opt}`, opt.toUpperCase());
                    await sock.sendMessage(from, { text: renderCommandFrame([
                        antiviewFrame.border[0],
                        `${antiviewFrame.border[1]}${antiviewFrame.symbol} ANTIVIEWONCE ${opt.toUpperCase()} SETTING SUCCESSFUL ✅`,
                        antiviewFrame.border[2]
                    ], {}, antiviewFrame.footer) }, { quoted: msg });
                } else {
                        const antiviewHelpFrame = uniqueCommandFrame('antiviewonce:HELP', 'HELP');
                        await sock.sendMessage(from, { text: plainExample(renderCommandFrame([
                            antiviewHelpFrame.border[0],
                            `${antiviewHelpFrame.border[1]}${antiviewHelpFrame.symbol} antiviewonce on`,
                            `${antiviewHelpFrame.border[1]}${antiviewHelpFrame.symbol} antiviewonce off`,
                            antiviewHelpFrame.border[2]
                        ], {}, antiviewHelpFrame.footer)) }, { quoted: msg });
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
                            // Apply the new state to every known inbox/group immediately;
                            // the one-second heartbeat keeps it active while the setting is on.
                            for (const jid of presenceTargets) void sendAutomationPresence(sock, jid);
                            if (from && !presenceTargets.has(from)) void sendAutomationPresence(sock, from);
                        }
                    }
                    await sock.sendMessage(from, { text: renderCommandSuccess(command, opt === "on" ? "ENABLED" : "DISABLED") }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: renderCommandHelp(command) }, { quoted: msg });
                }
                break;
            }
            case "vv":
            case "vv2": {
                const quotedViewOnce = getQuotedViewOnce(msg);
                if (!quotedViewOnce) {
                    await sock.sendMessage(from, { text: renderViewOnceHelp(command) }, { quoted: msg });
                    break;
                }
                const target = command === 'vv2' ? (numberJid(sock.user?.id) || numberJid(config.ownerNumber) || from) : from;
                try {
                    const revealed = await revealViewOnce(sock, target, {
                        key: {
                            remoteJid: msg.key.remoteJid,
                            id: quotedViewOnce.stanzaId || `quoted-${Date.now()}`,
                            participant: quotedViewOnce.participant
                        },
                        message: quotedViewOnce.message
                    }, command === 'vv' ? msg : undefined);
                    if (!revealed) {
                        await sock.sendMessage(from, { text: renderViewOnceError(command) }, { quoted: msg });
                    }
                } catch (error) {
                    console.warn(`[${command.toUpperCase()}] view-once reveal failed:`, error?.message || error);
                    await sock.sendMessage(from, { text: renderViewOnceError(command) }, { quoted: msg });
                }
                break;
            }

            case "blacklist": {
                const list = await fetchBlockedUsers(sock);
                const mentions = list.filter(jid => jid.endsWith('@s.whatsapp.net'));
                await sock.sendMessage(from, { text: renderBlacklist(list), mentions }, { quoted: msg });
                break;
            }

            case "block":
            case "unblock": {
                const target = getBlockTarget(msg, from, args, command);
                if (!target) {
                    await sock.sendMessage(from, { text: renderBlockHelp(command) }, { quoted: msg });
                    break;
                }
                try {
                    const action = command === "block" ? "block" : "unblock";
                    await sock.updateBlockStatus(target, action);
                    if (action === 'block') blockedUsers.add(target);
                    else blockedUsers.delete(target);
                    saveBlockedUsers();
                    await sock.sendMessage(from, { text: renderBlockSuccess(command, target), mentions: [target] }, { quoted: msg });
                } catch (error) {
                    console.warn(`[${command.toUpperCase()}] failed:`, error?.message || error);
                    const blockFailureFrame = uniqueCommandFrame(`${command}:FAILED`, 'FAILED');
                    await sock.sendMessage(from, { text: renderCommandFrame([
                        blockFailureFrame.border[0],
                        `${blockFailureFrame.border[1]}${blockFailureFrame.symbol} USER ${command === 'block' ? 'BLOCK' : 'UNBLOCK'} FAILED ❌`,
                        blockFailureFrame.border[2]
                    ], {}, blockFailureFrame.footer) }, { quoted: msg });
                }
                break;
            }

            case "desc": {
                if (!from.endsWith("@g.us")) { await sock.sendMessage(from, { text: groupOnlyText() }, { quoted: msg }); break; }
                const meta = await sock.groupMetadata(from);
                await sock.sendMessage(from, { text: formatBox(meta.desc || "𝙽𝚘 𝚍𝚎𝚜𝚌𝚛𝚒𝚙𝚝𝚒𝚘𝚗", "downloader", "◆", "groupdesc") }, { quoted: msg });
                break;
            }

            case "channel":
            case "repo": {
                const text = command === "repo" ? "◉ *MOMO-XMD REPOSITORY*\n\n★ *Repo:* https://github.com/MOMO47-tech/MOMO-XMD\n★ *Owner:* MOMO47\n★ *Status:* Public" : "◉ *MOMO-XMD OFFICIAL CHANNEL* 📢\n\n★ Follow the official MOMO-XMD channel for updates.";
                await sock.sendMessage(from, { text: formatBox(text, "downloader", "◉", command) }, { quoted: msg });
                break;
            }

            case "clear":
                if (!config.developers.includes(msg.key.remoteJid.split('@')[0])) continue;
                if (fs.existsSync(SESSION_DIR)) {
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                    const clearFrame = uniqueCommandFrame('clear:SUCCESS', 'SUCCESS');
                    await sock.sendMessage(from, { text: renderCommandFrame([
                        clearFrame.border[0],
                        `${clearFrame.border[1]}${clearFrame.symbol} SESSION CLEARED RESTARTING SUCCESSFUL ✅`,
                        clearFrame.border[2]
                    ], {}, clearFrame.footer) }, { quoted: msg });
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
