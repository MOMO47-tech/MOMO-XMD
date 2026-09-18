const os = require('os');

const ramBar = () => {
  const total = os.totalmem();
  const used = total - os.freemem();
  const percent = Math.round((used / total) * 100);
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${percent}%`;
};

const bold = value => `*${value}*`;
const section = (heading, top, rows, bottom, footerSymbol) => {
  const body = [bold(top), bold(`│ ${heading}`)];
  for (const row of rows) body.push(bold(row));
  body.push(bold(bottom));
  body.push(`> ${footerSymbol} Powered by MOMO47 ${footerSymbol}`);
  return body.join('\n');
};

const menuText = (pushname = '', uptime = '0s', speed = '0.000 ms', mode = 'public') => {
  const platform = process.env.HEROKU_APP_NAME || process.env.DYNO
    ? 'Heroku'
    : process.env.PANEL
      ? 'Panel'
      : process.env.KATABAMP
        ? 'Katabamp'
        : 'Linux';

  const ownerRows = [
    '│◇ antibug', '│◇ antidelete', '│◇ antispam', '│◇ alive', '│◇ autoread', '│◇ autolikestatus', '│◇ autorecording', '│◇ autosavestatus', '│◇ autotyping', '│◇ autoviewonce', '│◇ autoviewstatus', '│◇ blacklist', '│◇ block', '│◇ channel', '│◇ chatbot', '│◇ create', '│◇ file', '│◇ getpp', '│◇ hack', '│◇ hidetag', '│◇ join [group link]', '│◇ left', '│◇ leave', '│◇ listgroups', '│◇ location', '│◇ mode', '│◇ online', '│◇ owner', '│◇ pair', '│◇ ping', '│◇ repo', '│◇ restart', '│◇ runtime', '│◇ say', '│◇ setfont', '│◇ setpp', '│◇ setstatus emoji', '│◇ tagall', '│◇ togif', '│◇ tosgroup', '│◇ tostatus', '│◇ tosticker', '│◇ tovideo', '│◇ unblock', '│◇ vv', '│◇ vv2'
  ].sort((a, b) => a.localeCompare(b));
  const groupRows = [
    '┇๏ add', '┇๏ addbadwords', '┇๏ announcements', '┇๏ antibadwords', '┇๏ antibot', '┇๏ antigif', '┇๏ antilink', '┇๏ antimention', '┇๏ antileft', '┇๏ antinsfw', '┇๏ antisticker', '┇๏ antitag', '┇๏ antiviewonce', '┇๏ antivirus', '┇๏ approve', '┇๏ close', '┇๏ delete', '┇๏ demote', '┇๏ desc', '┇๏ getgcname', '┇๏ getgcprofile', '┇๏ goodbye', '┇๏ kick', '┇๏ kickall', '┇๏ grouplink', '┇๏ listactive', '┇๏ listcode', '┇๏ listrequests', '┇๏ open', '┇๏ promote', '┇๏ reject', '┇๏ setdesc', '┇๏ tosgroup', '┇๏ welcome'
  ].sort((a, b) => a.localeCompare(b));
  const logoRows = ['hacker', 'cyber', 'neon', 'fire', 'gold', 'royal', 'luxury', 'esport', 'graffiti', 'minimal', 'wolf', 'skull', 'galaxy', 'glitch', 'samurai', 'lion', 'crown', 'lightning', 'matrix', 'diamond', 'tech', 'retro', 'racing', 'music', 'space'].map(name => `┇✿ ${name} [name]`).sort((a, b) => a.localeCompare(b));
  const downloadRows = ['image', 'play', 'song', 'tiktok', 'video'].map(name => `┇★ ${name}`).sort((a, b) => a.localeCompare(b));
  const commandCount = ownerRows.length + groupRows.length + logoRows.length + downloadRows.length;

  const head = section(
    '🚀 MOMO-XMD MENU',
    '╭━━❖━⪼',
    [
      '┇❑ prefix - [ . ]',
      `┇❑ owner - MOMO47`,
      `┇❑ mode - ${mode}`,
      `┇❑ platform - ${platform}`,
      `┇❑ commands - ${commandCount}`,
      `┇❑ speed - ${speed}`,
      `┇❑ uptime - ${uptime}`,
      '┇❑ version - 4.8.0',
      `┇❑ ram - ${ramBar()}`
    ],
    '╰━━❖━⪼',
    '◈'
  );

  const owner = section(
    '👑 OWNER MENU',
    '╭◆',
    ownerRows,
    '╰◆',
    '✦'
  );

  const group = section(
    '👥 GROUP MENU',
    '╭━━❐━⪼',
    groupRows,
    '╰━━❑━⪼',
    '❑'
  );

  const download = section(
    '📥 DOWNLOAD MENU',
    '╭━━◈━⪼',
    downloadRows,
    '╰━━◈━⪼',
    '❖'
  );

  const logo = section(
    '🎨 LOGO MENU',
    '╭━━✿━⪼',
    logoRows,
    '╰━━✿━⪼',
    '✿'
  );

  return [head, '❑ ❑ ❑', owner, group, logo, download].join('\n\n');
};

module.exports = menuText;
module.exports.ramBar = ramBar;
module.exports.menuText = menuText;
