const express = require("express");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin";

const publicDir = path.join(__dirname, "public");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

// auth middleware
app.use((req, res, next) => {
  if (req.path === "/login") return next();
  if (req.headers["x-dashboard-pass"] === DASHBOARD_PASSWORD) return next();
  next();
});

// login endpoint
app.post("/login", (req, res) => {
  if (req.body.password === DASHBOARD_PASSWORD) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false });
});

// serve site
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// health check
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

client.login(TOKEN);
