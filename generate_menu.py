def to_bold(text):
    bold_map = {
        'a': '𝐚', 'b': '𝐛', 'c': '𝐜', 'd': '𝐝', 'e': '𝐞', 'f': '𝐟', 'g': '𝐠', 'h': '𝐡', 'i': '𝐢', 'j': '𝐣', 'k': '𝐤', 'l': '𝐥', 'm': '𝐦',
        'n': '𝐧', 'o': '𝐨', 'p': '𝐩', 'q': '𝐪', 'r': '𝐫', 's': '𝐬', 't': '𝐭', 'u': '𝐮', 'v': '𝐯', 'w': '𝐰', 'x': '𝐱', 'y': '𝐲', 'z': '𝐳',
        'A': '𝐀', 'B': '𝐁', 'C': '𝐂', 'D': '𝐃', 'E': '𝐄', 'F': '𝐅', 'G': '𝐆', 'H': '𝐇', 'I': '𝐈', 'J': '𝐉', 'K': '𝐊', 'L': '𝐋', 'M': '𝐌',
        'N': '𝐍', 'O': '𝐎', 'P': '𝐏', 'Q': '𝐐', 'R': '𝐑', 'S': '𝐒', 'T': '𝐓', 'U': '𝐔', 'V': '𝐕', 'W': '𝐖', 'X': '𝐗', 'Y': '𝐘', 'Z': '𝐙',
        '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗'
    }
    return "".join(bold_map.get(c, c) for c in text)

owner_menu = [
    "autoviewstatus", "autolikestatus", "setstatus emoj", "autosavestatus", "restart", "update",
    "setfont", "chatbot", "autorecording", "autotyping", "alwaysonline", "owner", "pairing",
    "ping", "repo", "runtime", "channel", "mode", "tagall", "hidetag"
]

group_menu = [
    "add", "antilink", "antigroupmention", "kick", "promote", "demote", "welcome", "goodbye",
    "open", "close", "announcements"
]

download_menu = ["play", "song", "video", "tiktok"]

menu = f"""const config = require('./config');

const toBold = (text) => {{
    const boldMap = {{
        'a': '𝐚', 'b': '𝐛', 'c': '𝐜', 'd': '𝐝', 'e': '𝐞', 'f': '𝐟', 'g': '𝐠', 'h': '𝐡', 'i': '𝐢', 'j': '𝐣', 'k': '𝐤', 'l': '𝐥', 'm': '𝐦',
        'n': '𝐧', 'o': '𝐨', 'p': '𝐩', 'q': '𝐪', 'r': '𝐫', 's': '𝐬', 't': '𝐭', 'u': '𝐮', 'v': '𝐯', 'w': '𝐰', 'x': '𝐱', 'y': '𝐲', 'z': '𝐳',
        'A': '𝐀', 'B': '𝐁', 'C': '𝐂', 'D': '𝐃', 'E': '𝐄', 'F': '𝐅', 'G': '𝐆', 'H': '𝐇', 'I': '𝐈', 'J': '𝐉', 'K': '𝐊', 'L': '𝐋', 'M': '𝐌',
        'N': '𝐍', 'O': '𝐎', 'P': '𝐏', 'Q': '𝐐', 'R': '𝐑', 'S': '𝐒', 'T': '𝐓', 'U': '𝐔', 'V': '𝐕', 'W': '𝐖', 'X': '𝐗', 'Y': '𝐘', 'Z': '𝐙',
        '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗'
    }};
    return text.split('').map(c => boldMap[c] || c).join('');
}};

const menuText = (pushname, uptime, speed, usage, mode) => {{
    const platform = process.env.HEROKU_APP_NAME || process.env.DYNO ? "Heroku" : (process.env.PANEL ? "Panel" : "Linux");
    return `┏▣ ◈ {to_bold("MOMO-XMD")} ◈
┃ {to_bold("OWNER")} : {to_bold("MOMO47")}
┃ {to_bold("PLATFORM")} : ${{toBold(platform)}}
┃ {to_bold("MODE")} : ${{toBold(mode)}}
┃ {to_bold("VERSION")} : {to_bold("4.7.0")}
┃ {to_bold("SPEED")} : ${{speed}}
┃ {to_bold("USAGE")} : ${{usage}}
┗▣

┏▣ ◈ {to_bold("OWNER MENU")} ◈
{chr(10).join(f"│➽ {to_bold(cmd)}" for cmd in owner_menu)}
┗▣

┏▣ ◈ {to_bold("GROUP MENU")} ◈
{chr(10).join(f"│➽ {to_bold(cmd)}" for cmd in group_menu)}
┗▣

┏▣ ◈ {to_bold("DOWNLOAD MENU")} ◈
{chr(10).join(f"│➽ {to_bold(cmd)}" for cmd in download_menu)}
┗▣

*{to_bold("Powered by MOMO-XMD")}* 🚀

*{to_bold("Owner MOMO47")}* ☠️`;
}};

module.exports = menuText;
"""

with open("lib/menu.js", "w") as f:
    f.write(menu)
