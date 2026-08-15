# MOMO-XMD Heroku Deployment

## One-click deployment

Open the [MOMO-XMD Deploy to Heroku button](https://heroku.com/deploy?template=https://github.com/MOMO47-tech/MOMO-XMD). The Heroku form is intentionally limited to two user inputs: **App Name** and **SESSION_ID**. Enter the exact 32-character Session ID received after pairing, then click **Deploy app**.

A valid Session ID has this shape:

```text
MOMO-XMD~HXXXXXXXXXXXXXXXXXXXXXX
```

or:

```text
MOMO-XMD~VXXXXXXXXXXXXXXXXXXXXXX
```

The complete value is exactly 32 characters, including `MOMO-XMD~`. Do not add spaces, quotes, or backticks. The `H` or `V` marker lets the bot try the pairing registry that issued the Session ID first.

## Pairing and inbox delivery

1. Open the active [VPS pairing page](http://212.224.86.233:8000/) or [Heroku pairing page](https://momo-xmd-pairing-4086f8388df8.herokuapp.com/).
2. Enter the WhatsApp number with country code and digits only.
3. Enter the displayed pairing code in WhatsApp under **Linked Devices → Link a device → Link with phone number instead**.
4. After the device reaches **LINK SUCCESSFUL**, the page shows the 32-character Session ID and the paired WhatsApp account receives the same Session ID in its inbox.
5. Paste that Session ID into the only configuration field on the Heroku deploy form and deploy the bot.

The short Session ID is an opaque registry token. The pairing server stores the authenticated Baileys files behind that token, and the deployed bot retrieves them over HTTPS during startup. It is therefore not a truncated Base64 credential and must not be manually edited.

## Current pairing links

| Service | URL |
|---|---|
| VPS pairing | http://212.224.86.233:8000/ |
| Heroku pairing | https://momo-xmd-pairing-4086f8388df8.herokuapp.com/ |
| Custom domain | https://momo-xmd-pairing.duckdns.org/ |
