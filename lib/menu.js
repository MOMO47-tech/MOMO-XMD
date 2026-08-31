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
  const body = [bold(heading), bold(top)];
  for (const row of rows) body.push(bold(row));
  body.push(bold(bottom));
  body.push('> Powered by MOMO47');
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

  const head = section(
    '🚀 MOMO-XMD MENU',
    '╭━━❖━⪼',
    [
      '┇❑ prefix - [ . ]',
      `┇❑ owner - MOMO47`,
      `┇❑ mode - ${mode}`,
      `┇❑ platform - ${platform}`,
      '┇❑ commands - 57',
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
    [
      '│◇ online', '│◇ antibug', '│◇ autolikestatus', '│◇ autorecording',
      '│◇ autosavestatus', '│◇ autotyping', '│◇ autoviewonce', '│◇ autoviewstatus',
      '│◇ blacklist', '│◇ block', '│◇ channel', '│◇ chatbot', '│◇ getpp',
      '│◇ hidetag', '│◇ mode', '│◇ owner', '│◇ pair', '│◇ ping', '│◇ repo',
      '│◇ restart', '│◇ runtime', '│◇ setfont', '│◇ setstatus emoji', '│◇ tagall',
      '│◇ tostatus', '│◇ unblock', '│◇ vv', '│◇ vv2'
    ],
    '╰◆',
    '✦'
  );

  const group = section(
    '👥 GROUP MENU',
    '╭━━❐━⪼',
    [
      '┇๏ add', '┇๏ announcements', '┇๏ antibot', '┇๏ antigif', '┇๏ antilink',
      '┇๏ antimention', '┇๏ antisticker', '┇๏ antitag', '┇๏ antiviewonce',
      '┇๏ antivirus', '┇๏ approve', '┇๏ close', '┇๏ demote', '┇๏ goodbye',
      '┇๏ kick', '┇๏ kickall', '┇๏ link', '┇๏ listactive', '┇๏ listcode',
      '┇๏ listrequests', '┇๏ open', '┇๏ promote', '┇๏ reject', '┇๏ welcome'
    ],
    '╰━━❑━⪼',
    '❑'
  );

  const download = section(
    '📥 DOWNLOAD MENU',
    '╭━━◈━⪼',
    ['┇★ image', '┇★ play', '┇★ song', '┇★ tiktok', '┇★ video'],
    '╰━━◈━⪼',
    '❖'
  );

  return [head, '❑ ❑ ❑', owner, group, download].join('\n\n');
};

module.exports = menuText;
module.exports.ramBar = ramBar;
module.exports.menuText = menuText;
