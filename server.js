const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cron = require("node-cron");
const fetch = require("node-fetch");
const { Client, GatewayIntentBits, ChannelType, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin123";

console.log("🚀 Starting Discord Media Bot...");

if (!DISCORD_TOKEN) {
  console.error("❌ ERROR: DISCORD_TOKEN is required");
  process.exit(1);
}

const uploadsDir = path.join(__dirname, "uploads");
const schedulesDir = path.join(__dirname, "schedules");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

let activeUsers = new Set();
setInterval(() => { activeUsers.clear(); }, 30 * 60 * 1000);

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

app.use((req, res, next) => {
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  activeUsers.add(clientIp);
  next();
});

// DASHBOARD ROUTE
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Discord Media Bot</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self';">
<style>
body { background:#0b1220; color:white; font-family:Arial; padding:20px; margin:0; }
h1 { text-align:center; }
button { padding:10px 15px; margin:5px; background:#667eea; color:white; border:none; border-radius:4px; cursor:pointer; }
button:hover { background:#5568d3; }
.panel { display:none; }
.panel.active { display:block; }
input { padding:8px; margin:5px 0; width:100%; max-width:300px; border:1px solid #ccc; border-radius:4px; }
.container { max-width:600px; margin:0 auto; }
pre { background:#1a2332; padding:10px; border-radius:4px; overflow-x:auto; }
</style>
</head>
<body>

<div class="container">
<h1>📢 Discord Media Bot</h1>

<div id="login" class="panel active">
  <h3>Login</h3>
  <input id="pass" type="password" placeholder="Dashboard password">
  <button onclick="login()">Login</button>
  <p id="msg" style="color:red;"></p>
</div>

<div id="dash" class="panel">
  <button onclick="show('send')">📤 Send / Schedule</button>
  <button onclick="show('view')">📅 View Schedules</button>
  <button onclick="logout()">Logout</button>

  <div id="send" class="panel active">
    <h3>Upload Media</h3>
    <input id="title" placeholder="Post Title"><br>
    <input id="minutes" type="number" placeholder="Minutes to wait (0 for now)"><br>
    <input id="channel" type="text" placeholder="Channel ID" style="width:100%;"><br>
    <input id="files" type="file" multiple><br>
    <button onclick="upload()">📤 Submit</button>
    <pre id="result"></pre>
  </div>

  <div id="view" class="panel">
    <h3>Scheduled Posts</h3>
    <button onclick="loadSchedules()">Refresh</button>
    <pre id="list">Loading...</pre>
  </div>
</div>
</div>

<script>
const API = window.location.origin;
let currentPassword = "";

function login() {
  currentPassword = document.getElementById("pass").value;
  fetch(API + "/api/test", { headers: { "x-dashboard-pwd": currentPassword } })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        document.getElementById("login").classList.remove("active");
        document.getElementById("dash").classList.add("active");
      } else {
        document.getElementById("msg").innerText = "Wrong password";
      }
    })
    .catch(() => document.getElementById("msg").innerText = "Connection failed");
}

function logout() {
  currentPassword = "";
  document.getElementById("login").classList.add("active");
  document.getElementById("dash").classList.remove("active");
  document.getElementById("pass").value = "";
}

function show(id) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  if (id === "view") loadSchedules();
}

function upload() {
  const title = document.getElementById("title").value;
  const minutes = document.getElementById("minutes").value || 0;
  const channel = document.getElementById("channel").value;
  const files = document.getElementById("files").files;

  if (!title || !channel || files.length === 0) {
    document.getElementById("result").innerText = "Fill all fields";
    return;
  }

  const fd = new FormData();
  fd.append("title", title);
  fd.append("minutes", minutes);
  fd.append("channelId", channel);
  for (const f of files) fd.append("files", f);

  fetch(API + "/api/upload", {
    method: "POST",
    headers: { "x-dashboard-pwd": currentPassword },
    body: fd
  })
  .then(r => r.json())
  .then(d => {
    document.getElementById("result").innerText = JSON.stringify(d, null, 2);
    if (d.success) {
      document.getElementById("title").value = "";
      document.getElementById("minutes").value = "";
      document.getElementById("channel").value = "";
      document.getElementById("files").value = "";
    }
  })
  .catch(e => document.getElementById("result").innerText = "Error: " + e.message);
}

function loadSchedules() {
  fetch(API + "/api/schedules", { headers: { "x-dashboard-pwd": currentPassword } })
    .then(r => r.json())
    .then(d => document.getElementById("list").innerText = JSON.stringify(d, null, 2))
    .catch(e => document.getElementById("list").innerText = "Error: " + e.message);
}
</script>

</body>
</html>`);
});

// API Routes
function authMiddleware(req, res, next) {
  const pwd = req.headers["x-dashboard-pwd"];
  if (!pwd || pwd !== DASHBOARD_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/api/test", authMiddleware, (req, res) => {
  res.json({ success: true });
});

app.get("/api/channels", authMiddleware, async (req, res) => {
  try {
    if (!discordClient.readyAt) return res.status(503).json({ error: "Bot not ready" });
    
    const channels = [];
    for (const guild of discordClient.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.isSendable?.() && (channel.type === 0 || channel.type === 5)) {
          channels.push({ id: channel.id, name: `#${channel.name}`, guild: guild.name });
        }
      }
    }
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload", authMiddleware, upload.array("files", 10), async (req, res) => {
  const { title, minutes, channelId } = req.body;
  if (!title || !channelId || !req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: "Missing data" });
  }

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
    const schedules = files.map(file => JSON.parse(fs.readFileSync(path.join(schedulesDir, file), "utf8")));
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
    
    if (scheduledTasks.has(id)) {
      scheduledTasks.get(id).stop();
      scheduledTasks.delete(id);
    }
    
    data.files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
    fs.unlinkSync(filePath);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/active-users", (req, res) => res.json({ count: activeUsers.size }));

// Discord Bot
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
});

// Discord Bot
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
});

const scheduledTasks = new Map();

discordClient.once("ready", async () => {
  console.log(`✓ Bot logged in as ${discordClient.user.tag}`);
  console.log(`✓ Bot in ${discordClient.guilds.cache.size} guild(s)`);
});

discordClient.on("error", err => console.error("❌ Discord error:", err.message));
discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error("❌ Failed to login:", err.message);
});

discordClient.once("ready", async () => {
  console.log(`✓ Bot logged in as ${discordClient.user.tag}`);
  
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName("post")
        .setDescription("Post media to Discord")
        .addChannelOption(option => option.setName("channel").setDescription("Channel").setRequired(true))
    ];
    await rest.put(Routes.applicationCommands(discordClient.user.id), { body: commands.map(cmd => cmd.toJSON()) });
    console.log("✓ Slash commands registered");
  } catch (error) {
    console.error("Error registering commands:", error.message);
  }
});

discordClient.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand() && interaction.commandName === "post") {
    const channel = interaction.options.getChannel("channel");
    if (!interaction.member.permissions.has("SEND_MESSAGES")) {
      return interaction.reply({ content: "No permission", ephemeral: true });
    }
    
    const modal = new ModalBuilder().setCustomId("postModal").setTitle("Post to " + channel.name);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("titleInput").setLabel("Title").setStyle(TextInputStyle.Short).setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("minutesInput").setLabel("Minutes (0 for now)").setStyle(TextInputStyle.Short).setRequired(false)
      )
    );
    
    discordClient.tempPostData = discordClient.tempPostData || {};
    discordClient.tempPostData[interaction.user.id] = { channelId: channel.id };
    
    await interaction.showModal(modal);
  }
  
  if (interaction.isModalSubmit() && interaction.customId === "postModal") {
    const title = interaction.fields.getTextInputValue("titleInput") || "";
    const minutes = interaction.fields.getTextInputValue("minutesInput") || "0";
    
    const postData = discordClient.tempPostData?.[interaction.user.id];
    if (!postData) return interaction.reply({ content: "Session expired", ephemeral: true });
    
    const embed = new EmbedBuilder()
      .setColor("#667eea")
      .setTitle("📤 Upload Media")
      .setDescription(`**Title:** ${title || "(none)"}\n📎 Attach files`);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("send_" + interaction.user.id).setLabel("Send").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cancel_" + interaction.user.id).setLabel("Cancel").setStyle(ButtonStyle.Danger)
    );
    
    discordClient.tempPostData[interaction.user.id] = { ...postData, title, minutes };
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
  
  if (interaction.isButton()) {
    const buttonId = interaction.customId;
    const userId = interaction.user.id;
    
    if (!buttonId.includes(userId)) return;
    
    const postData = discordClient.tempPostData?.[userId];
    if (!postData) return interaction.reply({ content: "Session expired", ephemeral: true });
    
    if (buttonId.startsWith("cancel_")) {
      delete discordClient.tempPostData[userId];
      return interaction.reply({ content: "❌ Cancelled", ephemeral: true });
    }
    
    if (buttonId.startsWith("send_")) {
      await interaction.deferReply({ ephemeral: true });
      
      const attachments = Array.from(interaction.message.attachments.values());
      if (attachments.length === 0) {
        return interaction.editReply({ content: "❌ No files attached" });
      }
      
      try {
        const files = [];
        for (const att of attachments) {
          const response = await fetch(att.url);
          const buffer = await response.buffer();
          const filePath = path.join(uploadsDir, `${Date.now()}-${att.name}`);
          fs.writeFileSync(filePath, buffer);
          files.push(filePath);
        }
        
        const delay = Math.max(0, Number(postData.minutes || 0)) * 60000;
        const taskId = `task-${Date.now()}`;
        const schedData = { id: taskId, title: postData.title, channelId: postData.channelId, files, sendAt: Date.now() + delay };
        
        fs.writeFileSync(path.join(schedulesDir, `${taskId}.json`), JSON.stringify(schedData));
        schedulePost(schedData);
        delete discordClient.tempPostData[userId];
        
        interaction.editReply({ content: delay === 0 ? "✅ Posted!" : "✅ Scheduled!" });
      } catch (err) {
        interaction.editReply({ content: "❌ Error: " + err.message });
      }
    }
  }
});

discordClient.on("error", err => console.error("❌ Discord error:", err.message));
discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error("❌ Failed to login:", err.message);
});

function schedulePost(data) {
  const { id, sendAt, title, channelId, files } = data;
  
  const sendNow = async () => {
    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel || !channel.isSendable?.()) throw new Error("Channel not sendable");
      
      const attachments = files.filter(f => fs.existsSync(f));
      if (attachments.length === 0) {
        await channel.send(title || "Empty post");
      } else {
        await channel.send({ content: title || "", files: attachments });
      }
      
      files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
      fs.unlinkSync(path.join(schedulesDir, `${id}.json`));
      scheduledTasks.delete(id);
      console.log(`✓ Post sent: ${id}`);
    } catch (err) {
      console.error(`Error sending ${id}:`, err.message);
    }
  };
  
  const now = Date.now();
  const delay = Math.max(0, sendAt - now);
  
  if (delay <= 0) {
    sendNow();
  } else {
    const timeout = setTimeout(sendNow, delay);
    scheduledTasks.set(id, { stop: () => clearTimeout(timeout) });
  }
}

// Load persisted schedules on startup
function loadSchedules() {
  try {
    const files = fs.readdirSync(schedulesDir);
    files.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(schedulesDir, file), "utf8"));
        if (new Date(data.sendAt) > new Date()) {
          schedulePost(data);
        } else {
          fs.unlinkSync(path.join(schedulesDir, file));
        }
      } catch (err) {
        console.error(`Error loading ${file}:`, err.message);
      }
    });
  } catch (err) {
    console.error("Error loading schedules:", err.message);
  }
}

app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  setTimeout(() => loadSchedules(), 2000);
});
