const http = require("http");
const { startBot } = require("./lib/bot");

const port = Number(process.env.PORT || 3000);
let botStatus = "starting";

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200);
    res.end(JSON.stringify({
      bot: "MOMO-XMD",
      status: botStatus,
      platform: process.env.DYNO ? "Heroku" : "Linux",
      time: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[MOMO-XMD] Health server listening on port ${port}`);

  startBot()
    .then(() => {
      botStatus = "connected";
      console.log("[MOMO-XMD] WhatsApp connection is open");
    })
    .catch((error) => {
      botStatus = "error";
      console.error("[MOMO-XMD BOT] fatal startup error:", error);
      process.exitCode = 1;
    });
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
