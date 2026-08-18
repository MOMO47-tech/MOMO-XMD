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
    
    const ownerCommands = [
        'alwaysonline',
        'antibug',
        'autolikestatus',
        'autosavestatus',
        'autoviewonce',
        'autoviewstatus',
        'autorecording',
        'autotyping',
        'blacklist',
        'getpp',
        'block',
        'channel',
        'chatbot',
        'hidetag',
        'listgroups',
        'mode',
        'owner',
        'pair',
        'ping',
        'repo',
        'restart',
        'runtime',
        'setfont',
        'setstatusemoj',
        'tagall',
        'tostatus',
        'unblock',
        'vv'
    ].sort();

    const groupCommands = [
        'add',
        'alive',
        'announcements',
        'antibot',
        'antileft',
        'antigif',
        'antilink',
        'antimention',
        'antisticker',
        'antitag',
        'antivirus',
        'antiviewonce',
        'approve',
        'close',
        'demote',
        'goodbye',
        'kick',
        'kickall',
        'link',
        'listactive',
        'listchat',
        'listcode',
        'listrequests',
        'open',
        'promote',
        'reject',
        'welcome'
    ].sort();

    const downloadCommands = [
        'image',
        'play',
        'song',
        'tiktok',
        'video'
    ].sort();

	const totalCommands = ownerCommands.length + groupCommands.length + downloadCommands.length;
	
	const renderList = (cmds) => cmds.map(c => `│ ◆ ${c}`).join('\n');
	
    const symbols = ['❑', '◉', '★', '◆', '◇', '๏'];
    const s = symbols[Math.floor(Math.random() * symbols.length)];
    const chosenFooter = `> Powered by MOMO-XMD ${s}\n> owner MOMO47 ${s}`;

	return `- *MOMO-XMD MENU* 🚀
╭◆
    │   ❑ *Prefix* - [ . ]
    │   ❑ *Owner* - MOMO47
    │   ❑ *Mode* - ${mode}
    │   ❑ *Platform* - ${platform}
    │   ❑ *Commands* - ${totalCommands}
    │   ❑ *Speed* - ${speed}
    │   ❑ *Uptime* - ${uptime}
    │   ❑ *Version* - 4.8.0
    │   ❑ *RAM* - ${ram}
╰◆
 ❑❑❑

👑 *OWNER MENU*
╭◆
${renderList(ownerCommands)}
╰◆

👥 *GROUP MENU*
╭◆
${renderList(groupCommands)}
╰◆

📥 *DOWNLOAD MENU*
╭◆
${renderList(downloadCommands)}
╰◆

${chosenFooter}`;
};

module.exports = menuText;
