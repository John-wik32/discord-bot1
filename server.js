const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin";

const publicDir = path.join(__dirname, "public");
const dataFile = path.join(__dirname, "data.json");
const uploadsDir = path.join(__dirname, "uploads");

// ensure folders / files
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]");

const upload = multer({ dest: uploadsDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

// ===== AUTH =====
app.post("/login", (req, res) => {
  if (req.body.password === DASHBOARD_PASSWORD) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false });
});

// ===== UPLOAD + SCHEDULE =====
app.post("/upload", upload.array("files"), (req, res) => {
  const { title, minutes } = req.body;
  const delay = Math.max(1, Number(minutes || 0)) * 60000;

  const data = JSON.parse(fs.readFileSync(dataFile));
  const entry = {
    id: Date.now(),
    title,
    files: req.files.map(f => f.filename),
    sendAt: Date.now() + delay
  };

  data.push(entry);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

  res.json({ success: true });
});

// ===== VIEW SCHEDULES =====
app.get("/schedules", (_, res) => {
  res.json(JSON.parse(fs.readFileSync(dataFile)));
});

// ===== DASHBOARD =====
app.get("/", (_, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", (_, res) => res.send("OK"));

app.listen(PORT, () => {
  console.log(`🌐 Dashboard running on ${PORT}`);
});

// ===== DISCORD BOT =====
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN missing");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`🤖 Bot online: ${client.user.tag}`);
});

setInterval(async () => {
  let data = JSON.parse(fs.readFileSync(dataFile));
  const now = Date.now();

  const toSend = data.filter(d => d.sendAt <= now);
  data = data.filter(d => d.sendAt > now);

  for (const item of toSend) {
    console.log("📤 Sending:", item.title);
    // sending logic placeholder
  }

  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}, 15000);

client.login(TOKEN);
