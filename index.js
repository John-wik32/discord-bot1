const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const upload = multer();

const PORT = process.env.PORT || 8000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

/* ---------------- CORS (CRITICAL FIX) ---------------- */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-admin-password"]
}));

app.use(express.json());

/* ---------------- HEALTH ---------------- */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* ---------------- AUTH ---------------- */
function auth(req, res, next) {
  const pw = req.headers["x-admin-password"];

  // DEBUG (VERY IMPORTANT)
  console.log("Received password:", pw);

  if (!pw || pw !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/* ---------------- DISCORD ---------------- */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let cachedChannels = [];

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guilds = await client.guilds.fetch();
  for (const [, guild] of guilds) {
    const g = await guild.fetch();
    const channels = await g.channels.fetch();
    channels.forEach(c => {
      if (c.isTextBased()) {
        cachedChannels.push({ id: c.id, name: `${g.name} / ${c.name}` });
      }
    });
  }

  console.log("Channels loaded:", cachedChannels.length);
});

client.login(DISCORD_TOKEN).catch(err =>
  console.error("Discord login failed:", err.message)
);

/* ---------------- API ---------------- */
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

/* ---------------- START ---------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
