# MOMO-XMD Auto-Follow Changes

## Marekebisho yaliyofanywa

`lib/bot.js` sasa husafisha channel URL au channel ID kuwa newsletter JID, hujaribu follow mara tatu kwa delay ikiwa WhatsApp haijajibu vizuri, na huendelea na group invite bila query-string ya link.

Ujumbe wa connection umetengenezwa utumie newline halisi ili uonekane kama box yenye mistari tofauti kwenye WhatsApp:

*┏━━━━━━✧ CONNECTED ✧━━━━━━━*
*┃✧ Bot: MOMO-XMD*
*┃✧ Owner: MOMO47*
*┃✧ Prefix: [ . ]*
*┃✧ Platform: Linux*
*┃✧ Status: online*
*┃✧ Time: 8/29/2026, 10:04:04 PM*
*┗━━━━━━━━━━━━━━━━*

*> ◉ Powered by MOMO47 ◉*

## Configuration

Channel IDs nne na group invite code ziko kwenye `config.js`. Zinaweza pia kubadilishwa kwa environment variables `AUTO_FOLLOW_CHANNELS` na `AUTO_JOIN_GROUP_INVITE`.

## Muhimu kuhusu maana ya follow

Automation hii inajaribu kufanya account ya bot iliyounganishwa ifollow channels na ijiunge na group. Haiwezi kumlazimisha mtu mwingine anayepair code ku-follow channels kwenye account yake bila WhatsApp/user confirmation. Kama lengo ni user huyo mwenyewe kufollow, bot inapaswa kumtumia links hizi ili azifungue na kubonyeza Follow mwenyewe.

## Usalama

Archive iliyotolewa haijumuishi `auth_*` session credentials wala pairing session state. Usishiriki mafaili hayo hadharani, kwa sababu yanaweza kutoa access kwa WhatsApp session iliyounganishwa.
