const os = require('os');

const ramBar = () => {
  const total = os.totalmem();
  const used = total - os.freemem();
  const percent = Math.round((used / total) * 100);
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${percent}%`;
};

const menuText = (pushname = '', uptime = '0s', speed = '0.000 ms', mode = 'public') => {
  const platform = process.env.HEROKU_APP_NAME || process.env.DYNO
    ? 'Heroku'
    : process.env.PANEL
      ? 'Panel'
      : process.env.KATABAMP
        ? 'Katabamp'
        : 'Linux';

  return `- *𝙼𝙾𝙼𝙾-𝚇𝙼𝙳 𝙼𝙴𝙽𝚄* 🚀
╭◆
    │   ❑ *𝙿𝚛𝚎𝚏𝚒𝚡* - [ . ]
    │   ❑ *𝙾𝚠𝚗𝚎𝚛* - 𝙼𝙾𝙼𝙾47
    │   ❑ *𝙼𝚘𝚍𝚎* - 𝚙𝚞𝚋𝚕𝚒𝚌
    │   ❑ *𝙿𝚕𝚊𝚝𝚏𝚘𝚛𝚖* - ${platform}
    │   ❑ *𝙲𝚘𝚖𝚖𝚊𝚗𝚍𝚜* - 57
    │   ❑ *𝚂𝚙𝚎𝚎𝚍* - ${speed}
    │   ❑ *𝚄𝚙𝚝𝚒𝚖𝚎* - ${uptime}
    │   ❑ *𝚅𝚎𝚛𝚜𝚒𝚘𝚗* - 4.8.0
    │   ❑ *𝚁𝙰𝙼* - ${ramBar()}
╰◆
 ❑❑❑

👑 *𝙾𝚆𝙽𝙴𝚁 𝙼𝙴𝙽𝚄*
╭◆
│ ◆ 𝚘𝚗𝚕𝚒𝚗𝚎
│ ◆ 𝚊𝚗𝚝𝚒𝚋𝚞𝚐
│ ◆ 𝚊𝚞𝚝𝚘𝚕𝚒𝚔𝚎𝚜𝚝𝚊𝚝𝚞𝚜
│ ◆ 𝚊𝚞𝚝𝚘𝚛𝚎𝚌𝚘𝚛𝚍𝚒𝚗𝚐
│ ◆ 𝚊𝚞𝚝𝚘𝚜𝚊𝚟𝚎𝚜𝚝𝚊𝚝𝚞𝚜
│ ◆ 𝚊𝚞𝚝𝚘𝚝𝚢𝚙𝚒𝚗𝚐
│ ◆ 𝚊𝚞𝚝𝚘𝚟𝚒𝚎𝚠𝚘𝚗𝚌𝚎
│ ◆ 𝚊𝚞𝚝𝚘𝚟𝚒𝚎𝚠𝚜𝚝𝚊𝚝𝚞𝚜
│ ◆ 𝚋𝚕𝚊𝚌𝚔𝚕𝚒𝚜𝚝
│ ◆ 𝚋𝚕𝚘𝚌𝚔
│ ◆ 𝚌𝚑𝚊𝚗𝚗𝚎𝚕
│ ◆ 𝚌𝚑𝚊𝚝𝚋𝚘𝚝
│ ◆ 𝚐𝚎𝚝𝚙𝚙
│ ◆ 𝚑𝚒𝚍𝚎𝚝𝚊𝚐
│ ◆ 𝚖𝚘𝚍𝚎
│ ◆ 𝚘𝚠𝚗𝚎𝚛
│ ◆ 𝚙𝚊𝚒𝚛
│ ◆ 𝚙𝚒𝚗𝚐
│ ◆ 𝚛𝚎𝚙𝚘
│ ◆ 𝚛𝚎𝚜𝚝𝚊𝚛𝚝
│ ◆ 𝚛𝚞𝚗𝚝𝚒𝚖𝚎
│ ◆ 𝚜𝚎𝚝𝚏𝚘𝚗𝚝
│ ◆ 𝚜𝚎𝚝𝚜𝚝𝚊𝚝𝚞𝚜 𝚎𝚖𝚘𝚓
│ ◆ 𝚝𝚊𝚐𝚊𝚕𝚕
│ ◆ 𝚝𝚘𝚜𝚝𝚊𝚝𝚞𝚜
│ ◆ 𝚞𝚗𝚋𝚕𝚘𝚌𝚔
│ ◆ 𝚟𝚟
│ ◆ 𝚟𝚟𝟸
╰◆

👥 *𝙶𝚁𝙾𝚄𝙿 𝙼𝙴𝙽𝚄*
╭◆
│ ◆ 𝚊𝚍𝚍
│ ◆ 𝚊𝚗𝚗𝚘𝚞𝚗𝚌𝚎𝚖𝚎𝚗𝚝𝚜
│ ◆ 𝚊𝚗𝚝𝚒𝚋𝚘𝚝
│ ◆ 𝚊𝚗𝚝𝚒𝚐𝚒𝚏
│ ◆ 𝚊𝚗𝚝𝚒𝚕𝚒𝚗𝚔
│ ◆ 𝚊𝚗𝚝𝚒𝚖𝚎𝚗𝚝𝚒𝚘𝚗
│ ◆ 𝚊𝚗𝚝𝚒𝚜𝚝𝚒𝚌𝚔𝚎𝚛
│ ◆ 𝚊𝚗𝚝𝚒𝚝𝚊𝚐
│ ◆ 𝚊𝚗𝚝𝚒𝚟𝚒𝚎𝚠𝚘𝚗𝚌𝚎
│ ◆ 𝚊𝚗𝚝𝚒𝚟𝚒𝚛𝚞𝚜
│ ◆ 𝚊𝚙𝚙𝚛𝚘𝚟𝚎
│ ◆ 𝚌𝚕𝚘𝚜𝚎
│ ◆ 𝚍𝚎𝚖𝚘𝚝𝚎
│ ◆ 𝚐𝚘𝚘𝚍𝚋𝚢𝚎
│ ◆ 𝚔𝚒𝚌𝚔
│ ◆ 𝚔𝚒𝚌𝚔𝚊𝚕𝚕
│ ◆ 𝚕𝚒𝚗𝚔
│ ◆ 𝚕𝚒𝚜𝚝𝚊𝚌𝚝𝚒𝚟𝚎
│ ◆ 𝚕𝚒𝚜𝚝𝚌𝚘𝚍𝚎
│ ◆ 𝚕𝚒𝚜𝚝𝚛𝚎𝚚𝚞𝚎𝚜𝚝𝚜
│ ◆ 𝚘𝚙𝚎𝚗
│ ◆ 𝚙𝚛𝚘𝚖𝚘𝚝𝚎
│ ◆ 𝚛𝚎𝚓𝚎𝚌𝚝
│ ◆ 𝚠𝚎𝚕𝚌𝚘𝚖𝚎
╰◆

📥 *𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 𝙼𝙴𝙽𝚄*
╭◆
│ ◆ 𝚒𝚖𝚊𝚐𝚎
│ ◆ 𝚙𝚕𝚊𝚢
│ ◆ 𝚜𝚘𝚗𝚐
│ ◆ 𝚝𝚒𝚔𝚝𝚘𝚔
│ ◆ 𝚟𝚒𝚍𝚎𝚘
╰◆

> 𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 *MOMO47*`;
};

module.exports = menuText;
module.exports.ramBar = ramBar;
module.exports.menuText = menuText;
