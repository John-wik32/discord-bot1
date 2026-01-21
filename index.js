const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const upload = multer();

const PORT = process.env.PORT || 8000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ---------- HEALTH ---------- */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ---------- AUTH (QUERY BASED – NO CORS ISSUES) ---------- */
function auth(req, res, next) {
  if (req.query.pw !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/* ---------- DISCORD ---------- */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let channelsCache = [];

client.once("ready", async () => {
  console.log("Discord logged in");

  channelsCache = [];
  const guilds = await client.guilds.fetch();

  for (const [, g] of guilds) {
    const guild = await g.fetch();
    const channels = await guild.channels.fetch();
    channels.forEach(c => {
      if (c.isTextBased()) {
        channelsCache.push({
          id: c.id,
          name: `${guild.name} / ${c.name}`
        });
      }
    });
  }

  console.log("Channels loaded:", channelsCache.length);
});

client.login(DISCORD_TOKEN).catch(console.error);

/* ---------- API ---------- */
app.get("/api/channels", auth, (req, res) => {
  res.json(channelsCache);
});

app.post("/api/post", auth, upload.none(), (req, res) => {
  res.json({ ok: true });
});

/* ---------- START ---------- */
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
