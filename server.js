const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

/* ================= FILE SYSTEM ================= */

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/* ================= SECURITY (CSP FIX) ================= */

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});

/* ================= EXPRESS ================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "public")));

/* ✅ FIX 404 ROOT */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const upload = multer({ dest: uploadsDir });

/* ================= DISCORD BOT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.login(DISCORD_TOKEN)
  .then(() => console.log("🤖 Discord bot logged in"))
  .catch(err => console.error("❌ Discord login failed:", err.message));

/* ================= AUTH ================= */

function auth(req, res, next) {
  if (req.headers["x-dashboard-pwd"] !== DASHBOARD_PASSWORD) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

/* ================= API ================= */

app.get("/api/active-users", (req, res) => {
  res.json({ count: 1 });
});

app.get("/api/channels", auth, async (req, res) => {
  try {
    const channels = [];
    client.guilds.cache.forEach(guild => {
      guild.channels.cache
        .filter(c => c.isTextBased())
        .forEach(c => {
          channels.push({
            id: c.id,
            name: c.name,
            guild: guild.name
          });
        });
    });
    res.json(channels);
  } catch {
    res.status(500).send("Failed to load channels");
  }
});

app.post("/api/upload", auth, upload.array("files"), (req, res) => {
  res.json({
    files: req.files.map(f => `/uploads/${f.filename}`)
  });
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});
