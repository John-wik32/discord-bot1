const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const fetch = require("node-fetch");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin123";

console.log("🚀 Starting Discord Media Bot...");

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
setInterval(() => { activeUsers.clear(); }, 30 * 60 * 1000);

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

// DISCORD BOT SETUP
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const scheduledTasks = new Map();

discordClient.once("ready", () => {
  console.log(`✓ Bot online as ${discordClient.user.tag}`);
  console.log(`✓ Bot in ${discordClient.guilds.cache.size} guild(s)`);
});

discordClient.on("error", err => console.error("❌ Discord error:", err.message));

discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error("❌ Failed to login to Discord:", err.message);
});

// DASHBOARD HTML
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Discord Media Bot</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self';">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background:#0b1220; color:white; font-family:Arial; padding:20px; }
h1 { text-align:center; margin-bottom:20px; }
.container { max-width:700px; margin:0 auto; }
.tabs { display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
.tab-btn { padding:10px 20px; background:#667eea; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; }
.tab-btn.active { background:#5568d3; }
.tab-btn:hover { background:#5568d3; }
.panel { display:none; padding:20px; background:#1a2332; border-radius:8px; }
.panel.active { display:block; }
input, select { padding:10px; margin:8px 0; width:100%; border:1px solid #ccc; border-radius:4px; background:#222; color:white; }
button { padding:10px 20px; margin:5px 5px 5px 0; background:#667eea; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; }
button:hover { background:#5568d3; }
button.danger { background:#ff4444; }
button.danger:hover { background:#cc0000; }
button.success { background:#28a745; }
button.success:hover { background:#218838; }
.msg { padding:10px; margin:10px 0; border-radius:4px; }
.success { background:#28a745; color:white; }
.error { background:#ff4444; color:white; }
.schedule-item { background:#0b1220; padding:12px; margin:10px 0; border-radius:4px; border-left:4px solid #667eea; }
.schedule-item h4 { margin-bottom:5px; }
.schedule-item .time { font-size:12px; color:#aaa; }
.schedule-item .actions { margin-top:8px; display:flex; gap:5px; }
h3 { margin-bottom:15px; margin-top:0; }
</style>
</head>
<body>

<div class="container">
<h1>📢 Discord Media Bot</h1>

<div id="login" class="panel active">
  <h3>🔐 Login</h3>
  <input id="pass" type="password" placeholder="Dashboard password">
  <button onclick="login()">Login</button>
  <div id="loginMsg" class="msg" style="display:none;"></div>
</div>

<div id="dash" class="panel">
  <div class="tabs">
    <button class="tab-btn active" onclick="showTab('send')">📤 Send Media</button>
    <button class="tab-btn" onclick="showTab('scheduled')">📅 Scheduled</button>
    <button class="tab-btn" onclick="showTab('history')">📜 History</button>
    <button class="tab-btn" onclick="logout()">🚪 Logout</button>
  </div>

  <div id="send" class="panel active">
    <h3>📤 Send / Schedule Media</h3>
    <select id="channel" placeholder="Select channel">
      <option value="">Loading channels...</option>
    </select>
    <input id="title" placeholder="Post Title (optional)">
    <input id="minutes" type="number" placeholder="Minutes to wait (0 for now)" value="0">
    <input id="files" type="file" multiple>
    <button onclick="upload()" class="success">📤 Submit</button>
    <button onclick="clearForm()" style="background:#999;">🔄 Clear</button>
    <div id="uploadMsg" class="msg" style="display:none;"></div>
  </div>

  <div id="scheduled" class="panel">
    <h3>📅 Scheduled Posts</h3>
    <button onclick="loadSchedules()" style="margin-bottom:15px;">🔄 Refresh</button>
    <div id="scheduleList">Loading...</div>
  </div>

  <div id="history" class="panel">
    <h3>📜 Post History</h3>
    <div id="historyList" style="color:#aaa;">No history yet</div>
  </div>
</div>
</div>

<script>
const API = window.location.origin;
let currentPassword = "";
let postHistory = [];

function login() {
  currentPassword = document.getElementById("pass").value;
  fetch(API + "/api/test", { headers: { "x-dashboard-pwd": currentPassword } })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showMsg("loginMsg", "✓ Logged in!", "success");
        document.getElementById("login").classList.remove("active");
        document.getElementById("dash").classList.add("active");
        loadChannels();
        loadSchedules();
      } else {
        showMsg("loginMsg", "Wrong password", "error");
      }
    })
    .catch(() => showMsg("loginMsg", "Connection failed", "error"));
}

function loadChannels() {
  fetch(API + "/api/channels", { headers: { "x-dashboard-pwd": currentPassword } })
    .then(r => r.json())
    .then(d => {
      if (d.error) {
        showMsg("uploadMsg", "Error: " + d.error, "error");
      } else {
        const select = document.getElementById("channel");
        select.innerHTML = '<option value="">Select a channel...</option>' + 
          d.map(ch => '<option value="' + ch.id + '">' + ch.guild + ' - ' + ch.name + '</option>').join('');
      }
    })
    .catch(e => showMsg("uploadMsg", "Failed to load channels", "error"));
}

function logout() {
  currentPassword = "";
  document.getElementById("login").classList.add("active");
  document.getElementById("dash").classList.remove("active");
  document.getElementById("pass").value = "";
}

function showTab(tab) {
  document.querySelectorAll("#dash .panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(tab).classList.add("active");
  event.target.classList.add("active");
  
  if (tab === "scheduled") loadSchedules();
  if (tab === "history") showHistory();
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.innerHTML = text;
  el.className = "msg " + type;
  el.style.display = "block";
  if (type !== "error") setTimeout(() => el.style.display = "none", 5000);
}

function clearForm() {
  document.getElementById("title").value = "";
  document.getElementById("minutes").value = "0";
  document.getElementById("channel").value = "";
  document.getElementById("files").value = "";
}

function upload() {
  const title = document.getElementById("title").value;
  const minutes = document.getElementById("minutes").value || "0";
  const channel = document.getElementById("channel").value;
  const files = document.getElementById("files").files;

  if (!channel || files.length === 0) {
    showMsg("uploadMsg", "Select channel and files", "error");
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
    if (d.success) {
      showMsg("uploadMsg", "✓ " + d.message, "success");
      postHistory.unshift({ title: title || "(no title)", time: new Date().toLocaleString() });
      clearForm();
      loadSchedules();
    } else {
      showMsg("uploadMsg", "Error: " + (d.error || "Unknown"), "error");
    }
  })
  .catch(e => showMsg("uploadMsg", "Error: " + e.message, "error"));
}

function loadSchedules() {
  fetch(API + "/api/schedules", { headers: { "x-dashboard-pwd": currentPassword } })
    .then(r => r.json())
    .then(schedules => {
      const list = document.getElementById("scheduleList");
      if (!schedules || schedules.length === 0) {
        list.innerHTML = '<p style="color:#aaa;">No scheduled posts</p>';
        return;
      }
      list.innerHTML = schedules.map(s => {
        const time = new Date(s.sendAt).toLocaleString();
        return '<div class="schedule-item"><h4>' + (s.title || "Untitled") + '</h4><div class="time">⏰ ' + time + '</div><div class="actions"><button onclick="deleteSchedule(\'' + s.id + '\')" class="danger" style="padding:5px 10px;">🗑️ Delete</button></div></div>';
      }).join('');
    })
    .catch(e => document.getElementById("scheduleList").innerHTML = '<p style="color:red;">Error loading</p>');
}

function deleteSchedule(id) {
  if (!confirm("Delete this post?")) return;
  
  fetch(API + "/api/schedule/" + id, {
    method: "DELETE",
    headers: { "x-dashboard-pwd": currentPassword }
  })
  .then(r => r.json())
  .then(d => {
    showMsg("uploadMsg", "✓ Deleted!", "success");
    loadSchedules();
  })
  .catch(e => showMsg("uploadMsg", "Error deleting", "error"));
}

function showHistory() {
  const list = document.getElementById("historyList");
  if (postHistory.length === 0) {
    list.innerHTML = '<p style="color:#aaa;">No history yet</p>';
    return;
  }
  list.innerHTML = postHistory.map(h => 
    '<div class="schedule-item"><h4>' + h.title + '</h4><div class="time">⏰ ' + h.time + '</div></div>'
  ).join('');
}
</script>

</body>
</html>`);
});

// API Routes
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
  if (!channelId || !req.files || req.files.length === 0) {
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

app.get("/health", (req, res) => res.json({ status: "ok", bot: discordClient.readyAt ? "online" : "offline" }));

// Post scheduling function
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
      console.log(`✓ Post sent: ${title || "Untitled"}`);
    } catch (err) {
      console.error(`Error sending post:`, err.message);
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

// Load persisted schedules
function loadPersistedSchedules() {
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

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  setTimeout(() => loadPersistedSchedules(), 2000);
});
