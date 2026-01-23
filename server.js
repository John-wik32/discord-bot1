const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin123";

if (!DISCORD_TOKEN) {
  console.error("❌ ERROR: DISCORD_TOKEN is required");
  process.exit(1);
}

// Setup directories
const uploadsDir = path.join(__dirname, "uploads");
const schedulesDir = path.join(__dirname, "schedules");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });

// Setup multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

let activeUsers = new Set();
setInterval(() => activeUsers.clear(), 30 * 60 * 1000);

// Middleware
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use((req, res, next) => {
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  activeUsers.add(clientIp);
  next();
});

// Auth middleware
function authMiddleware(req, res, next) {
  const pwd = req.headers["x-dashboard-pwd"];
  if (!pwd || pwd !== DASHBOARD_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// Discord bot setup
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const scheduledTasks = new Map();

discordClient.once("ready", () => {
  console.log(`✓ Bot online as ${discordClient.user.tag}`);
});

discordClient.on("error", err => console.error("❌ Discord error:", err.message));

discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error("❌ Failed to login to Discord:", err.message);
});

// Serve dashboard HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// API routes
app.get("/api/test", authMiddleware, (req, res) => res.json({ success: true }));

app.get("/api/channels", authMiddleware, async (req, res) => {
  try {
    if (!discordClient.readyAt) return res.status(503).json({ error: "Bot not ready" });
    const channels = [];
    for (const guild of discordClient.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.isTextBased() && channel.permissionsFor(guild.members.me).has("SendMessages")) {
          channels.push({ id: channel.id, name: `#${channel.name}`, guild: guild.name });
        }
      }
    }
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload", authMiddleware, upload.array("files", 10), (req, res) => {
  const { title, minutes, channelId } = req.body;
  if (!channelId || !req.files || req.files.length === 0)
    return res.status(400).json({ success: false, error: "Missing data" });

  const delay = Math.max(0, Number(minutes || 0)) * 60000;
  const sendAt = Date.now() + delay;
  const filePaths = req.files.map(f => path.join(uploadsDir, f.filename));
  const taskId = `task-${Date.now()}`;
  const schedData = { id: taskId, title, channelId, files: filePaths, sendAt };

  try {
    fs.writeFileSync(path.join(schedulesDir, `${taskId}.json`), JSON.stringify(schedData));
    schedulePost(schedData);
    res.json({ success: true, message: delay === 0 ? "Posting now..." : "Scheduled!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/schedules", authMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(schedulesDir);
    const schedules = files.map(f => JSON.parse(fs.readFileSync(path.join(schedulesDir, f), "utf8")));
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/schedule/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  try {
    const filePath = path.join(schedulesDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (scheduledTasks.has(id)) { scheduledTasks.get(id).stop(); scheduledTasks.delete(id); }
    data.files.forEach(f => { try { fs.unlinkSync(f); } catch {} });
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/health", (req, res) => res.json({ status: "ok", bot: discordClient.readyAt ? "online" : "offline" }));

// Schedule a post
function schedulePost(data) {
  const { id, sendAt, title, channelId, files } = data;

  const sendNow = async () => {
    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) throw new Error("Channel not sendable");

      const attachments = files.filter(f => fs.existsSync(f));
      await channel.send({ content: title || "", files: attachments });
      attachments.forEach(f => { try { fs.unlinkSync(f); } catch {} });
      fs.unlinkSync(path.join(schedulesDir, `${id}.json`));
      scheduledTasks.delete(id);
      console.log(`✓ Post sent: ${title || "Untitled"}`);
    } catch (err) { console.error("Error sending post:", err.message); }
  };

  const delay = Math.max(0, sendAt - Date.now());
  if (delay <= 0) sendNow();
  else {
    const timeout = setTimeout(sendNow, delay);
    scheduledTasks.set(id, { stop: () => clearTimeout(timeout) });
  }
}

// Load persisted schedules
function loadPersistedSchedules() {
  try {
    const files = fs.readdirSync(schedulesDir);
    files.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(schedulesDir, file), "utf8"));
        if (new Date(data.sendAt) > Date.now()) schedulePost(data);
        else fs.unlinkSync(path.join(schedulesDir, file));
      } catch (err) { console.error(`Error loading ${file}:`, err.message); }
    });
  } catch (err) { console.error("Error loading schedules:", err.message); }
}

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  setTimeout(loadPersistedSchedules, 2000);
});
