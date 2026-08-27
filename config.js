'use strict';

const fs = require('fs');
const path = require('path');

const env = {};
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
            const [key, ...parts] = line.split('=');
            if (key && parts.length) env[key.trim()] = parts.join('=').trim();
        });
    }
} catch (_) {}

const envValue = (key, fallback = '') => process.env[key] || env[key] || fallback;
const detectHost = () => {
    if (process.env.HEROKU_APP_NAME || process.env.DYNO) return 'Heroku';
    if (process.env.PANEL || process.env.PTERODACTYL) return 'Panel';
    if (process.env.RENDER_SERVICE_ID || process.env.RENDER) return 'Render';
    if (process.env.KATABAMP) return 'Katabamp';
    return 'Linux';
};

module.exports = {
    botName: 'MOMO-XMD',
    botVersion: '4.8.0',
    prefix: '.',
    ownerName: 'MOMO47',
    ownerNumber: '255760298574',
    ownerNumber2: '255765409584',
    botOwner: '255760298574@s.whatsapp.net',
    botOwner2: '255765409584@s.whatsapp.net',

    channelLink: 'https://whatsapp.com/channel/0029Vb8AYLf2f3EA8Y4qp63H',
    supportChannel: 'https://whatsapp.com/channel/0029VbDNET6KmCPShs9dyg1U',
    githubRepo: 'https://github.com/MOMO47-tech/MOMO-XMD',
    botLogo: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663874475539/RSbhzJESktSFdAiD.jpg',

    pairing: {
        server1: 'https://momo-xmd-pairing-4086f8388df8.herokuapp.com/',
        server2: 'https://momo-xmd-pairing2-fd35d1ed19df.herokuapp.com/',
        vps: 'http://212.224.86.233:8000',
        render: 'https://momo-xmd-pairing.onrender.com/',
        domain: 'https://momo-xmd-pairing.duckdns.org/',
        port: 'http://212.224.86.233:8000'
    },

    heroku: {
        app1: 'momo-xmd-pairing1',
        app2: 'momo-xmd-pairing2'
    },

    sessionId: envValue('SESSION_ID'),
    mode: envValue('MODE', 'public'),
    plugins: 382,
    host: envValue('HOST', detectHost()),

    autoFollowChannels: envValue(
        'AUTO_FOLLOW_CHANNELS',
        '0029Vb8AYLf2f3EA8Y4qp63H,0029VbDNET6KmCPShs9dyg1U,0029VbDeRauAjPXFYDvO5e2D,0029VbDYZ7LBVJky0TggGF2N'
    ).split(',').map(value => value.trim()).filter(Boolean),
    autoJoinGroupInvite: envValue('AUTO_JOIN_GROUP_INVITE', 'F5SgWtRKwr74Bfii6cVg0f'),

    developers: ['255760298574', '255765409584'],
    openaiApiKey: envValue('OPENAI_API_KEY'),
    openaiApiBase: envValue('OPENAI_API_BASE', 'https://api.openai.com/v1'),
    stickerAuthor: 'MOMO XMD',
    stickerPackName: 'MOMO XMD BOT',

    panelPrices: `┏▣ ◈ *MOMO47 INC.* ◈
┃
┃ *ᴘᴀɴᴇʟ ᴘʀɪᴄᴇs*
┃ ★ 1GB ➜ 2,000 Tsh
┃ ★ 2GB ➜ 5,000 Tsh
┃ ★ 3GB ➜ 8,000 Tsh
┃ ★ 4GB ➜ 10,000 Tsh
┃ ★ 5GB ➜ 13,000 Tsh
┃ ★ 6GB ➜ 15,000 Tsh
┃ ★ 7GB ➜ 20,000 Tsh
┃ ★ 8GB ➜ 23,000 Tsh
┃ ★ 9GB ➜ 25,000 Tsh
┃ ★ 10GB ➜ 30,000 Tsh
┃ ★ UNLIMITED ➜ 30,000 Tsh
┃ ★ ADMIN ➜ DM ME
┃
┃ *ᴅᴜʀᴀᴛɪᴏɴ ᴘʀɪᴄᴇs*
┃ ★ PANEL 3 DAYS ➜ 2,000 Tsh
┃ ★ PANEL 1 WEEK ➜ 5,000 Tsh
┃ ★ PANEL 1 MONTH ➜ 10,000 Tsh
┃ ★ UNLIMITED ➜ 15,000 Tsh
┃ ★ ADMIN PANEL ➜ 20,000 Tsh
┗▣
📩 DM: wa.me/255760298574`,

    vpnPrices: `┏▣ ◈ *MOMO XMD VPN* ◈
┃
┃ *Vᴘɴ Fɪʟᴇ Pʀɪᴄᴇs*
┃ ★ VPN 3 DAYS ➜ 2,000 Tsh
┃ ★ VPN 1 WEEK ➜ 5,000 Tsh
┃ ★ VPN 1 MONTH ➜ 10,000 Tsh
┃
┃ 📩 Kujipatia VPN File DM: wa.me/255760298574
┃ 🔹 DOWNLOAD MOVIES
┃ 🔹 NYIMBO ZENYE KASI
┃ 🔹 TIKTOK PASIPO MTANDAO
┃ 🔹 INSTAGRAM PASIPO MTANDAO
┃ 🔹 FACEBOOK PASIPO MTANDAO
┗▣`
};
