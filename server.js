// server.js
const express = require("express");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ===== EXPRESS =====
const publicDir = path.join(__dirname, "public");

app.use(express.json());
app.use(express.static(publicDir));

// Serve dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Health check (important for Koyeb)
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Start web server
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// ===== DISCORD BOT =====
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN not set");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`🤖 Bot online as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
