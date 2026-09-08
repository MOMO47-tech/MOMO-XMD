const fs = require('fs');
const b = fs.readFileSync('lib/bot.js', 'utf8');
for (const s of ['const styledReply =', 'const formatBox =', 'const uniqueCommandFrame =', 'const COMMAND_FRAME_TOPS =', 'const COMMAND_FRAME_BOTTOMS =']) {
  if (!b.includes(s)) throw new Error(`missing ${s}`);
}
for (const s of ['setting saved', '✅ ✅']) {
  if (b.includes(s)) throw new Error(`forbidden ${s}`);
}
console.log('ALL_COMMAND_STYLE_ROUTING_OK');
