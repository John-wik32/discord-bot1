// server.js — FULL FIXED FILE
// Replace your existing server.js entirely with this file (no external HTML files required)

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

console.log("🚀 Starting Discord Media Bot...");

// ----- Directories -----
const uploadsDir = path.join(__dirname, "uploads");
const schedulesDir = path.join(__dirname, "schedules");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });

// ----- Multer (for file uploads) -----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit per file

// ----- Express middleware -----
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));

// simple active users tracking
let activeUsers = new Set();
app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  activeUsers.add(ip);
  next();
});

// ----- Auth middleware -----
function authMiddleware(req, res, next) {
  const pwd = req.headers["x-dashboard-pwd"] || req.query.pwd;
  if (!pwd || pwd !== DASHBOARD_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ----- Discord client (only Guilds intent for sending posts) -----
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
discordClient.once("ready", () => {
  console.log(`✓ Bot online as ${discordClient.user.tag}`);
});
discordClient.on("error", (err) => console.error("❌ Discord error:", err?.message || err));
discordClient.login(DISCORD_TOKEN).catch((err) => {
  console.error("❌ Failed to login to Discord:", err?.message || err);
});

// ----- Scheduled tasks container -----
const scheduledTasks = new Map();

// ----- HTML served directly from server.js -----
// This is the full dashboard HTML (no external files). It binds event listeners after DOMContentLoaded.
const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Discord Media Bot — Dashboard</title>
<!-- Allow inline scripts/styles because this page is served from server.js -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial; background: linear-gradient(135deg,#667eea,#764ba2); color:#111; min-height:100vh; padding:20px; }
  .container { max-width:980px; margin:0 auto; }
  .card { background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,.25); }
  .header { background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; padding:18px; }
  .content { padding:18px; }
  .tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
  .tab-btn { padding:8px 12px; border-radius:6px; border:2px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:#fff; cursor:pointer; font-weight:700; }
  .tab-btn.active { background:#fff; color:#667eea; }
  .panel { display:none; padding-top:12px; }
  .panel.active { display:block; }
  input, select { width:100%; padding:10px; margin:8px 0; border-radius:6px; border:1px solid #ddd; }
  .file-upload { border:2px dashed #667eea; padding:14px; border-radius:8px; background:#fbfbff; cursor:pointer; }
  .file-list { margin-top:10px; max-height:160px; overflow:auto; }
  .file-item { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; margin-bottom:8px; background:#f4f6fb; border-radius:6px; }
  button.primary { background:#667eea; color:#fff; padding:10px 14px; border-radius:8px; border:none; cursor:pointer; font-weight:700; }
  button.ghost { background:#fff; border:1px solid #ddd; padding:10px 14px; border-radius:8px; cursor:pointer; }
  .msg { padding:10px; margin-top:10px; border-radius:6px; display:none; }
  .msg.show { display:block; }
  .msg.success { background:#dff0d8; color:#224d11; }
  .msg.error { background:#f8d7da; color:#5b1b1b; }
  .schedule-card { padding:10px; border-left:4px solid #667eea; margin-bottom:10px; background:#fbfbff; border-radius:6px; }
  footer { margin-top:12px; color:#eee; text-align:center; font-size:13px; }
</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:18px; font-weight:800;">Discord Media Bot</div>
          <div style="color:rgba(255,255,255,.95);">Active: <span id="userCount">0</span></div>
        </div>
        <div style="margin-top:6px; opacity:0.95;">Upload, send now, or schedule videos & images to Discord</div>
      </div>

      <div class="content">
        <!-- Login -->
        <div id="loginPanel" class="panel active">
          <h3>🔐 Dashboard Login</h3>
          <input id="dashPassword" type="password" placeholder="Dashboard password (from Koyeb experimental var)" />
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button id="btnLogin" class="primary">Login</button>
            <button id="btnHealth" class="ghost">Check Server</button>
          </div>
          <div id="loginMsg" class="msg" style="margin-top:12px;"></div>
        </div>

        <!-- Main -->
        <div id="mainPanel" class="panel">
          <div class="tabs" role="tablist">
            <button class="tab-btn active" data-tab="sendTab">📤 Create Post</button>
            <button class="tab-btn" data-tab="schedulesTab">📅 Scheduled</button>
            <button class="tab-btn" data-tab="historyTab">📜 History</button>
            <button id="btnLogout" class="tab-btn" style="background:#ff7b7b; color:#fff;">🚪 Logout</button>
          </div>

          <div id="sendTab" class="panel active">
            <h3>📤 Send / Schedule Media</h3>
            <label>Discord Channel</label>
            <select id="channelSelect"><option value="">-- load channels after login --</option></select>

            <label>Post Title (optional)</label>
            <input id="postTitle" type="text" placeholder="Optional title for the post">

            <label>Delay (minutes) — 0 = send now</label>
            <input id="delayMinutes" type="number" min="0" value="0">

            <label>Files (images & videos)</label>
            <div id="fileDrop" class="file-upload">Click or drop files here (multiple supported)
              <input id="fileInput" type="file" accept="image/*,video/*" multiple style="display:none" />
            </div>
            <div id="fileList" class="file-list"><div class="small">No files selected</div></div>

            <div style="margin-top:10px; display:flex; gap:8px;">
              <button id="btnSubmit" class="primary">Submit</button>
              <button id="btnClear" class="ghost">Clear</button>
            </div>

            <div id="uploadMsg" class="msg" style="margin-top:10px;"></div>
          </div>

          <div id="schedulesTab" class="panel">
            <h3>📅 Scheduled Posts</h3>
            <div style="display:flex; gap:8px; margin-bottom:10px;">
              <button id="btnRefreshSchedules" class="primary">Refresh</button>
              <button id="btnClearSchedules" class="ghost">Clear View</button>
            </div>
            <div id="schedulesList"><div class="small">Loading...</div></div>
          </div>

          <div id="historyTab" class="panel">
            <h3>📜 Post History</h3>
            <div id="historyList"><div class="small">No history yet</div></div>
          </div>
        </div>
      </div>
    </div>

    <footer>Running on port ${PORT} • Dashboard served from server.js</footer>
  </div>

<script>
(() => {
  const API = window.location.origin;
  let dashboardPwd = '';
  let selectedFiles = [];
  let history = [];

  // elements
  const loginPanel = document.getElementById('loginPanel');
  const mainPanel = document.getElementById('mainPanel');
  const loginMsg = document.getElementById('loginMsg');
  const btnLogin = document.getElementById('btnLogin');
  const btnHealth = document.getElementById('btnHealth');
  const btnLogout = document.getElementById('btnLogout');
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn')).filter(b => b.dataset.tab);
  const channelSelect = document.getElementById('channelSelect');
  const postTitle = document.getElementById('postTitle');
  const delayMinutes = document.getElementById('delayMinutes');
  const fileDrop = document.getElementById('fileDrop');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnClear = document.getElementById('btnClear');
  const uploadMsg = document.getElementById('uploadMsg');
  const schedulesList = document.getElementById('schedulesList');
  const btnRefreshSchedules = document.getElementById('btnRefreshSchedules');
  const historyList = document.getElementById('historyList');
  const userCountEl = document.getElementById('userCount');

  function showMsg(el, txt, type) {
    el.textContent = txt;
    el.className = 'msg show ' + (type || '');
  }
  function clearMsg(el) { el.className = 'msg'; el.textContent = ''; }

  function setActiveTab(tabId) {
    // hide panels under mainPanel
    ['sendTab','schedulesTab','historyTab'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    // remove active classes from tab buttons that have data-tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    // add active to the correct button and panel
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.dataset.tab === tabId);
    if (btn) btn.classList.add('active');
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');
  }

  function bindUI() {
    // tab buttons
    Array.from(document.querySelectorAll('.tab-btn')).forEach(b => {
      const t = b.dataset && b.dataset.tab;
      if (!t) return;
      b.addEventListener('click', () => {
        setActiveTab(t);
        if (t === 'schedulesTab') loadSchedules();
        if (t === 'historyTab') renderHistory();
      });
    });

    btnLogin.addEventListener('click', doLogin);
    btnHealth.addEventListener('click', () => {
      fetch(API + '/health').then(r => r.json()).then(d => showMsg(loginMsg, 'OK — ' + JSON.stringify(d), 'success')).catch(() => showMsg(loginMsg, 'Health failed', 'error'));
    });
    btnLogout.addEventListener('click', () => {
      dashboardPwd = '';
      loginPanel.classList.add('active');
      mainPanel.classList.remove('active');
      clearMsg(loginMsg);
    });

    fileDrop.addEventListener('click', () => fileInput.click());
    fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.style.borderColor = '#5568d3'; });
    fileDrop.addEventListener('dragleave', () => { fileDrop.style.borderColor = '#667eea'; });
    fileDrop.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    btnSubmit.addEventListener('click', submitUpload);
    btnClear.addEventListener('click', clearForm);
    btnRefreshSchedules.addEventListener('click', loadSchedules);
  }

  function handleFiles(files) {
    const arr = Array.from(files || []);
    arr.forEach(f => {
      if (!selectedFiles.some(s => s.name === f.name && s.size === f.size)) selectedFiles.push(f);
    });
    renderFileList();
  }

  function renderFileList() {
    if (!selectedFiles.length) { fileList.innerHTML = '<div class="small">No files selected</div>'; return; }
    fileList.innerHTML = selectedFiles.map((f, i) => {
      const sizeMB = (f.size / 1024 / 1024).toFixed(2);
      return '<div class="file-item"><div>' + escapeHtml(f.name) + ' — ' + sizeMB + ' MB</div><div><button data-i="' + i + '" class="ghost removeFile">Remove</button></div></div>';
    }).join('');
    Array.from(fileList.querySelectorAll('.removeFile')).forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-i'));
        selectedFiles.splice(i, 1);
        renderFileList();
      });
    });
  }

  function clearForm() {
    postTitle.value = '';
    delayMinutes.value = '0';
    selectedFiles = [];
    fileInput.value = '';
    renderFileList();
    clearMsg(uploadMsg);
  }

  function doLogin() {
    const pwd = document.getElementById('dashPassword').value.trim();
    if (!pwd) { showMsg(loginMsg, 'Enter password', 'error'); return; }
    fetch(API + '/api/test', { headers: { 'x-dashboard-pwd': pwd } })
      .then(r => r.json()).then(d => {
        if (d && d.success) {
          dashboardPwd = pwd;
          loginPanel.classList.remove('active');
          mainPanel.classList.add('active');
          clearMsg(loginMsg);
          setActiveTab('sendTab');
          loadChannels();
          loadSchedules();
          updateActiveUsers();
          renderHistory();
        } else {
          showMsg(loginMsg, 'Wrong password', 'error');
        }
      }).catch(() => showMsg(loginMsg, 'Connection failed', 'error'));
  }

  function loadChannels() {
    if (!dashboardPwd) return;
    fetch(API + '/api/channels', { headers: { 'x-dashboard-pwd': dashboardPwd } })
      .then(r => r.json()).then(list => {
        if (!Array.isArray(list)) { channelSelect.innerHTML = '<option value="">Error</option>'; return; }
        channelSelect.innerHTML = '<option value="">Select channel...</option>' + list.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.guild)} - ${escapeHtml(c.name)}</option>`).join('');
      }).catch(() => channelSelect.innerHTML = '<option value="">Error</option>');
  }

  function submitUpload() {
    if (!dashboardPwd) { showMsg(uploadMsg, 'Login first', 'error'); return; }
    const channelId = channelSelect.value;
    if (!channelId) { showMsg(uploadMsg, 'Select a channel', 'error'); return; }
    if (!selectedFiles.length) { showMsg(uploadMsg, 'Select files', 'error'); return; }
    const fd = new FormData();
    fd.append('title', postTitle.value || '');
    fd.append('minutes', delayMinutes.value || '0');
    fd.append('channelId', channelId);
    selectedFiles.forEach(f => fd.append('files', f));

    showMsg(uploadMsg, 'Uploading...', '');
    fetch(API + '/api/upload', { method: 'POST', headers: { 'x-dashboard-pwd': dashboardPwd }, body: fd })
      .then(r => r.json()).then(json => {
        if (json && json.success) {
          showMsg(uploadMsg, json.message || 'Scheduled', 'success');
          history.unshift({ title: postTitle.value || '(no title)', time: new Date().toLocaleString() });
          clearForm();
          loadSchedules();
          renderHistory();
        } else showMsg(uploadMsg, 'Error: ' + (json.error || 'Unknown'), 'error');
      }).catch(() => showMsg(uploadMsg, 'Upload failed', 'error'));
  }

  function loadSchedules() {
    if (!dashboardPwd) return;
    schedulesList.innerHTML = '<div class="small">Loading...</div>';
    fetch(API + '/api/schedules', { headers: { 'x-dashboard-pwd': dashboardPwd } })
      .then(r => r.json()).then(list => {
        if (!Array.isArray(list) || !list.length) { schedulesList.innerHTML = '<div class="small">No scheduled posts</div>'; return; }
        schedulesList.innerHTML = list.map(s => {
          const t = new Date(Number(s.sendAt || s.sendAt)).toLocaleString();
          const filesHtml = (s.files && s.files.length) ? s.files.map(f => `<div class="small">${escapeHtml(basename(f))}</div>`).join('') : '';
          return `<div class="schedule-card"><strong>${escapeHtml(s.title || 'Untitled')}</strong><div class="small">When: ${t}</div>${filesHtml}<div style="margin-top:8px;"><button data-id="${escapeHtml(s.id)}" class="ghost delete-sched">Delete</button></div></div>`;
        }).join('');
        // attach delete handlers
        Array.from(schedulesList.querySelectorAll('.delete-sched')).forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (!confirm('Delete this scheduled post?')) return;
            fetch(API + '/api/schedule/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'x-dashboard-pwd': dashboardPwd } })
              .then(r => r.json()).then(j => {
                if (j && j.success) { loadSchedules(); showMsg(uploadMsg, 'Deleted', 'success'); }
                else showMsg(uploadMsg, 'Delete failed', 'error');
              }).catch(() => showMsg(uploadMsg, 'Delete failed', 'error'));
          });
        });
      }).catch(() => schedulesList.innerHTML = '<div class="small">Failed to load</div>');
  }

  function renderHistory() {
    if (!history.length) { historyList.innerHTML = '<div class="small">No history yet</div>'; return; }
    historyList.innerHTML = history.map(h => `<div class="schedule-card"><strong>${escapeHtml(h.title)}</strong><div class="small">${escapeHtml(h.time)}</div></div>`).join('');
  }

  function updateActiveUsers() {
    fetch(API + '/api/active-users').then(r => r.json()).then(d => { userCountEl.textContent = d.count || 0; }).catch(() => {});
  }

  function escapeHtml(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function basename(p) { if (!p) return ''; const parts = p.split(/[\\/]/); return parts[parts.length-1]; }

  bindUI();
  renderFileList();
  setInterval(updateActiveUsers, 5000);
})();
</script>
</body>
</html>`;

// ----- Serve dashboard HTML directly from server.js -----
app.get("/", (req, res) => res.send(dashboardHtml));

// ----- API endpoints -----
// test endpoint
app.get("/api/test", authMiddleware, (req, res) => res.json({ success: true }));

// active users
app.get("/api/active-users", (req, res) => {
  res.json({ count: activeUsers.size });
});

// list channels
app.get("/api/channels", authMiddleware, async (req, res) => {
  try {
    if (!discordClient.readyAt) return res.status(503).json({ error: "Bot not ready" });
    const list = [];
    for (const guild of discordClient.guilds.cache.values()) {
      for (const ch of guild.channels.cache.values()) {
        // channel.isTextBased exists in v14 — use heuristic: type 0 = GUILD_TEXT, 5 = ANNOUNCEMENT in older code
        if (typeof ch.isTextBased === 'function' ? ch.isTextBased() : (ch.type === 0 || ch.type === 5)) {
          list.push({ id: ch.id, name: ch.name, guild: guild.name });
        }
      }
    }
    res.json(list);
  } catch (err) {
    console.error("list channels error:", err);
    res.status(500).json({ error: err.message });
  }
});

// upload & schedule
app.post("/api/upload", authMiddleware, upload.array("files", 20), (req, res) => {
  try {
    const { title, minutes, channelId } = req.body;
    if (!channelId || !req.files || req.files.length === 0) return res.status(400).json({ success: false, error: "Missing data" });

    const delay = Math.max(0, Number(minutes || 0)) * 60000;
    const sendAt = Date.now() + delay;
    const filePaths = req.files.map(f => path.join(uploadsDir, f.filename));
    const id = `task-${Date.now()}`;
    const data = { id, title: title || "", channelId, files: filePaths, sendAt };

    fs.writeFileSync(path.join(schedulesDir, id + ".json"), JSON.stringify(data));
    schedulePost(data);

    res.json({ success: true, message: delay === 0 ? "Posting now..." : "Scheduled!" });
  } catch (err) {
    console.error("upload error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// list schedules
app.get("/api/schedules", authMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(schedulesDir);
    const out = files.map(f => JSON.parse(fs.readFileSync(path.join(schedulesDir, f), "utf8")));
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete schedule
app.delete("/api/schedule/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  try {
    const fp = path.join(schedulesDir, `${id}.json`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (scheduledTasks.has(id)) { try { scheduledTasks.get(id).stop(); } catch (e) {} scheduledTasks.delete(id); }
    data.files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// health
app.get("/health", (req, res) => res.json({ status: "ok", bot: discordClient.readyAt ? "online" : "offline" }));

// ----- Scheduling function -----
function schedulePost(data) {
  const { id, sendAt, title, channelId, files } = data;
  const sendFn = async () => {
    try {
      if (!discordClient.readyAt) throw new Error("Bot not ready");
      const ch = await discordClient.channels.fetch(channelId);
      if (!ch || !(typeof ch.isTextBased === 'function' ? ch.isTextBased() : true)) throw new Error("Channel not sendable");
      const existingFiles = files.filter(f => fs.existsSync(f));
      if (existingFiles.length) {
        await ch.send({ content: title || "", files: existingFiles });
        existingFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
      } else {
        await ch.send(title || "(empty post)");
      }
      // remove schedule file
      try { fs.unlinkSync(path.join(schedulesDir, id + ".json")); } catch (e) {}
      scheduledTasks.delete(id);
      console.log("✓ Sent scheduled post:", id);
    } catch (err) {
      console.error("Error sending scheduled post:", err?.message || err);
    }
  };

  const delay = Math.max(0, sendAt - Date.now());
  if (delay <= 0) {
    sendFn();
  } else {
    const t = setTimeout(sendFn, delay);
    scheduledTasks.set(id, { stop: () => clearTimeout(t) });
  }
}

// ----- Load persisted schedules on startup -----
function loadPersistedSchedules() {
  try {
    const files = fs.readdirSync(schedulesDir);
    files.forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(schedulesDir, f), "utf8"));
        if (data.sendAt && data.sendAt > Date.now()) schedulePost(data);
        else { try { fs.unlinkSync(path.join(schedulesDir, f)); } catch (e) {} }
      } catch (err) {
        console.error("load schedule file error:", err);
      }
    });
  } catch (err) {
    console.error("loadPersistedSchedules error:", err);
  }
}

// ----- Start server -----
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  setTimeout(loadPersistedSchedules, 1200);
});
