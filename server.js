// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ===== DIRECTORIES =====
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");

// Create folders if missing
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ===== EXPRESS SETUP =====
app.use(express.static(publicDir));
app.use(express.json());

// ===== FILE UPLOAD =====
const upload = multer({ dest: uploadsDir });

app.post("/upload", upload.array("videos"), (req, res) => {
  res.json({ success: true, files: req.files.map(f => f.filename) });
});

// ===== ROOT ROUTE =====
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ===== START WEB SERVER =====
app.listen(PORT, () => {
  console.log(`🌐 Web dashboard running on port ${PORT}`);
});

// ===== DISCORD BOT =====
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN missing");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`🤖 Bot online as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
