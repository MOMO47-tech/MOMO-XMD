const config = require('./config');
const os = require('os');

const getRamBar = () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const percentage = Math.round((usedMem / totalMem) * 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage}%`;
};

const menuText = (pushname, uptime, speed, usage, mode) => {
    const platform = process.env.HEROKU_APP_NAME || process.env.DYNO ? "Heroku" : (process.env.PANEL ? "Panel" : "Linux");
    const ram = getRamBar();
    
    // Count total commands dynamically
    const ownerCommands = ['autoviewstatus', 'autolikestatus', 'setstatusemoj', 'autosavestatus', 'restart', 'update', 'setfont', 'chatbot', 'autorecordinng', 'autotyping', 'alwaysonline', 'owner', 'pairing', 'ping', 'repo', 'runtime', 'channel', 'mode', 'tagall', 'hidetag'];
    const groupCommands = ['add', 'antilink', 'antigroupmention', 'kick', 'promote', 'demote', 'welcome', 'goodbye', 'open', 'close', 'announcements'];
    const downloadCommands = ['play', 'song', 'video', 'tiktok', 'image'];
    const totalCommands = ownerCommands.length + groupCommands.length + downloadCommands.length + 5; // adding some extra base commands

    return `┌────────────────────
│ ❑ *MOMO-XMD*
│
│ ❑ *Prefix* : [ . ]
│ ❑ *Owner* : MOMO47
│ ❑ *Mode* : ${mode}
│ ❑ *Platform* : ${platform}
│ ❑ *Commands* : ${totalCommands}
│ ❑ *Speed* : ${speed}
│ ❑ *Uptime* : ${uptime}
│ ❑ *Version* : 4.7.0
│ ❑ *Usage* : ${usage}
│ ❑ *RAM* : ${ram}
└────────────────────

┌───[ *OWNER MENU* ]
│ ❑ autoviewstatus
│ ❑ autolikestatus
│ ❑ setstatusemoj
│ ❑ autosavestatus
│ ❑ restart
│ ❑ update
│ ❑ setfont
│ ❑ chatbot
│ ❑ autorecording
│ ❑ autotyping
│ ❑ alwaysonline
│ ❑ owner
│ ❑ pairing
│ ❑ ping
│ ❑ repo
│ ❑ runtime
│ ❑ channel
│ ❑ mode
│ ❑ tagall
│ ❑ hidetag
└────────────────────

┌───[ *GROUP MENU* ]
│ ❑ add
│ ❑ antilink
│ ❑ antigroupmention
│ ❑ kick
│ ❑ promote
│ ❑ demote
│ ❑ welcome
│ ❑ goodbye
│ ❑ open
│ ❑ close
│ ❑ announcements
└────────────────────

┌───[ *DOWNLOAD MENU* ]
│ ❑ play
│ ❑ song
│ ❑ video
│ ❑ tiktok
│ ❑ image
└────────────────────

*Powered by MOMO-XMD* 🚀
*Owner MOMO47* ☠️`;
};

module.exports = menuText;
