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
        'alive', 'alwaysonline', 'antibug', 'anticall', 'autolikestatus', 'autoreact', 
        'autorecording', 'autosavestatus', 'autotyping', 'autoviewonce', 'autoviewstatus', 
        'blacklist', 'block', 'channel', 'chatbot', 'create', 'getpp', 'hidetag', 
        'listgroups', 'mode', 'owner', 'pairing', 'ping', 'repo', 'restart', 
        'runtime', 'setfont', 'setstatusemoj', 'tagall', 'tosgroup', 'tostatus', 
        'unblock', 'vpn', 'vps', 'vv'
    ].sort();

    const groupCommands = [
        'add', 'announcements', 'antibot', 'antigif', 'antigroupmention', 'antileft', 
        'antilink', 'antimention', 'antisticker', 'antitag', 'antiviewonce', 'antivirus', 
        'approve', 'close', 'demote', 'desc', 'goodbye', 'kick', 'kickall', 'link', 
        'listactive', 'listchat', 'listcode', 'listrequests', 'open', 'promote', 
        'reject', 'setgroupdesc', 'welcome'
    ].sort();

    const downloadCommands = [
        'image', 'play', 'song', 'tiktok', 'video'
    ].sort();

    const totalCommands = ownerCommands.length + groupCommands.length + downloadCommands.length;
    
    const renderList = (cmds) => cmds.map(c => `┇ ◆ ${c}`).join('\n');
    const chosenFooter = `\n> ❑ Powered by MOMO-XMD ❑\n> ❑ owner MOMO47 ❑`;

    return `- *MOMO-XMD MENU* 🚀
╭━━❐━⪼
┇ ❑ *PREFIX* - [ . ]
┇ ❑ *OWNER* - MOMO47
┇ ❑ *MODE* - ${mode}
┇ ❑ *PLATFORM* - ${platform}
┇ ❑ *COMMANDS* - ${totalCommands}
┇ ❑ *SPEED* - ${speed}
┇ ❑ *UPTIME* - ${uptime}
┇ ❑ *VERSION* - 4.8.0
┇ ❑ *RAM* - ${ram}
╰━━❑━⪼

👑 *OWNER COMMANDS*
╭━━❐━⪼
${renderList(ownerCommands)}
╰━━❑━⪼

👥 *GROUP COMMANDS*
╭━━❐━⪼
${renderList(groupCommands)}
╰━━❑━⪼

📥 *DOWNLOAD COMMANDS*
╭━━❐━⪼
${renderList(downloadCommands)}
╰━━❑━⪼

${chosenFooter}`;
};

module.exports = menuText;
