const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const upload = multer();

const PORT = process.env.PORT || 8000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

/* -------------------- CORS (REQUIRED FOR KOYEB) -------------------- */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-admin-password"]
}));

app.use(express.json());

/* -------------------- HEALTH CHECK -------------------- */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* -------------------- AUTH -------------------- */
function auth(req, res, next) {
  const pw = req.headers["x-admin-password"];

  console.log("AUTH HEADER:", pw); // DEBUG LOG

  if (!pw || pw !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/* -------------------- DISCORD BOT -------------------- */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let cachedChannels = [];

client.once("ready", async () => {
  console.log(`Discord logged in as ${client.user.tag}`);

  cachedChannels = [];

  const guilds = await client.guilds.fetch();
  for (const [, guildRef] of guilds) {
    const guild = await guildRef.fetch();
    const channels = await guild.channels.fetch();

    channels.forEach(ch => {
      if (ch.isTextBased()) {
        cachedChannels.push({
          id: ch.id,
          name: `${guild.name} / ${ch.name}`
        });
      }
    });
  }

  console.log("Channels loaded:", cachedChannels.length);
});

client.login(DISCORD_TOKEN)
  .then(() => console.log("Discord login success"))
  .catch(err => console.error("Discord login failed:", err.message));

/* -------------------- API ROUTES -------------------- */
app.get("/api/channels", auth, (req, res) => {
  res.json(cachedChannels);
});

app.get("/api/history", auth, (req, res) => {
  res.json([]);
});

app.get("/api/scheduled", auth, (req, res) => {
  res.json([]);
});

app.post("/api/post", auth, upload.any(), async (req, res) => {
  res.json({ ok: true });
});

/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
