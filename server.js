const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin123';

console.log('🚀 Starting Discord Media Bot...');
console.log(`📝 DISCORD_TOKEN: ${DISCORD_TOKEN ? '✓ Set' : '✗ Missing'}`);
console.log(`🔐 DASHBOARD_PASSWORD: ${DASHBOARD_PASSWORD}`);

if (!DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN environment variable is required');
  process.exit(1);
}

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const schedulesDir = path.join(__dirname, 'schedules');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ===== SERVE FRONTEND =====
const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Media Poster</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .container {
      width: 100%;
      max-width: 600px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 24px;
      margin-bottom: 5px;
    }
    
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    
    .form-section {
      padding: 30px 20px;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #333;
      font-size: 14px;
    }
    
    input[type="text"],
    input[type="date"],
    input[type="time"],
    input[type="password"],
    select {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.3s;
    }
    
    input[type="text"]:focus,
    input[type="date"]:focus,
    input[type="time"]:focus,
    input[type="password"]:focus,
    select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .file-upload {
      position: relative;
      border: 2px dashed #667eea;
      border-radius: 6px;
      padding: 30px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: #f8f9ff;
    }
    
    .file-upload:hover {
      border-color: #764ba2;
      background: #f0f2ff;
    }
    
    .file-upload input[type="file"] {
      display: none;
    }
    
    .file-upload-text {
      color: #667eea;
      font-weight: 600;
      margin-bottom: 5px;
    }
    
    .file-upload-subtext {
      color: #999;
      font-size: 12px;
    }
    
    .file-list {
      margin-top: 15px;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .file-item {
      background: #f5f5f5;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    
    .file-item button {
      background: #ff4444;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    
    .file-item button:hover {
      background: #cc0000;
    }
    
    .button-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 25px;
    }
    
    button {
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .btn-send {
      background: #667eea;
      color: white;
      grid-column: 1;
    }
    
    .btn-send:hover:not(:disabled) {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }
    
    .btn-schedule {
      background: #764ba2;
      color: white;
      grid-column: 2;
    }
    
    .btn-schedule:hover:not(:disabled) {
      background: #654a8c;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(118, 75, 162, 0.4);
    }
    
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .schedule-fields {
      display: none;
      padding: 15px;
      background: #f8f9ff;
      border-radius: 6px;
      margin-top: 15px;
      margin-bottom: 15px;
    }
    
    .schedule-fields.show {
      display: block;
    }
    
    .schedule-fields .form-group {
      margin-bottom: 12px;
    }
    
    .message {
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
      display: none;
      font-size: 14px;
      animation: slideIn 0.3s ease;
    }
    
    .message.show {
      display: block;
    }
    
    .message.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .message.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .message.info {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📢 Discord Media Poster</h1>
      <p>Post images & videos to Discord channels</p>
    </div>
    
    <div class="form-section">
      <div id="message" class="message"></div>
      
      <form id="mediaForm">
        <div class="form-group">
          <label>Dashboard Password</label>
          <input type="password" id="password" placeholder="Enter dashboard password">
        </div>
        
        <div class="form-group">
          <label>Discord Channel</label>
          <select id="channel" required>
            <option value="">Loading channels...</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Post Title (Optional)</label>
          <input type="text" id="title" placeholder="What's this post about?">
        </div>
        
        <div class="form-group">
          <label>Upload Media Files</label>
          <div class="file-upload" id="fileUpload">
            <div class="file-upload-text">Click or drag files here</div>
            <div class="file-upload-subtext">Supported: PNG, JPG, GIF, MP4, MOV, WebM (up to 25MB each)</div>
            <input type="file" id="fileInput" multiple accept="image/*,video/*">
          </div>
          <div class="file-list" id="fileList"></div>
        </div>
        
        <div class="schedule-fields" id="scheduleFields">
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="scheduleDate">
          </div>
          <div class="form-group">
            <label>Time</label>
            <input type="time" id="scheduleTime">
          </div>
        </div>
        
        <div class="button-group">
          <button type="button" class="btn-send" id="sendNowBtn">📤 Send Now</button>
          <button type="button" class="btn-schedule" id="scheduleBtn">⏰ Schedule</button>
        </div>
      </form>
    </div>
  </div>
  
  <script>
    const API_URL = window.location.origin;
    
    let selectedFiles = [];
    let isScheduling = false;
    
    const urlParams = new URLSearchParams(window.location.search);
    const urlPassword = urlParams.get('pwd');
    if (urlPassword) {
      document.getElementById('password').value = urlPassword;
    }
    
    const fileUpload = document.getElementById('fileUpload');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    
    fileUpload.addEventListener('click', () => fileInput.click());
    
    fileUpload.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUpload.style.borderColor = '#764ba2';
      fileUpload.style.background = '#efe5ff';
    });
    
    fileUpload.addEventListener('dragleave', () => {
      fileUpload.style.borderColor = '#667eea';
      fileUpload.style.background = '#f8f9ff';
    });
    
    fileUpload.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUpload.style.borderColor = '#667eea';
      fileUpload.style.background = '#f8f9ff';
      handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    function handleFiles(files) {
      Array.from(files).forEach(file => {
        if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
          selectedFiles.push(file);
        }
      });
      renderFileList();
    }
    
    function renderFileList() {
      fileList.innerHTML = selectedFiles.map((file, idx) => \`
        <div class="file-item">
          <span>\${file.name} (\${(file.size / 1024 / 1024).toFixed(2)}MB)</span>
          <button type="button" onclick="removeFile(\${idx})">Remove</button>
        </div>
      \`).join('');
    }
    
    function removeFile(idx) {
      selectedFiles.splice(idx, 1);
      renderFileList();
    }
    
    async function loadChannels() {
      const pwd = document.getElementById('password').value;
      if (!pwd) {
        showMessage('Please enter the dashboard password', 'info');
        return;
      }
      
      try {
        const res = await fetch(\`\${API_URL}/api/channels\`, {
          headers: { 'x-dashboard-pwd': pwd }
        });
        
        if (res.status === 401) {
          showMessage('Invalid password', 'error');
          return;
        }
        
        if (!res.ok) throw new Error(await res.text());
        
        const channels = await res.json();
        const select = document.getElementById('channel');
        
        if (channels.length === 0) {
          select.innerHTML = '<option value="">No channels found. Check bot permissions.</option>';
          return;
        }
        
        select.innerHTML = '<option value="">Select a channel...</option>' + channels.map(ch => 
          \`<option value="\${ch.id}">\${ch.guild} - \${ch.name}</option>\`
        ).join('');
      } catch (err) {
        showMessage('Failed to load channels: ' + err.message, 'error');
      }
    }
    
    document.getElementById('password').addEventListener('change', loadChannels);
    
    document.getElementById('scheduleBtn').addEventListener('click', (e) => {
      e.preventDefault();
      if (isScheduling) {
        isScheduling = false;
        document.getElementById('scheduleFields').classList.remove('show');
      } else {
        isScheduling = true;
        document.getElementById('scheduleFields').classList.add('show');
      }
    });
    
    document.getElementById('sendNowBtn').addEventListener('click', async (e) => {
      e.preventDefault();
      
      const pwd = document.getElementById('password').value;
      const channelId = document.getElementById('channel').value;
      const title = document.getElementById('title').value;
      
      if (!pwd || !channelId || selectedFiles.length === 0) {
        showMessage('Please fill in all fields and select files', 'error');
        return;
      }
      
      try {
        document.getElementById('sendNowBtn').disabled = true;
        showMessage('Uploading files...', 'info');
        
        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('files', file));
        
        const uploadRes = await fetch(\`\${API_URL}/api/upload\`, {
          method: 'POST',
          headers: { 'x-dashboard-pwd': pwd },
          body: formData
        });
        
        if (!uploadRes.ok) throw new Error(await uploadRes.text());
        const uploadData = await uploadRes.json();
        
        showMessage('Sending to Discord...', 'info');
        
        const sendRes = await fetch(\`\${API_URL}/api/send-now\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dashboard-pwd': pwd
          },
          body: JSON.stringify({
            channelId,
            title,
            files: uploadData.files
          })
        });
        
        if (!sendRes.ok) throw new Error(await sendRes.text());
        
        showMessage('✓ Post sent successfully!', 'success');
        selectedFiles = [];
        renderFileList();
        document.getElementById('mediaForm').reset();
      } catch (err) {
        showMessage('Error: ' + err.message, 'error');
      } finally {
        document.getElementById('sendNowBtn').disabled = false;
      }
    });
    
    document.getElementById('scheduleBtn').addEventListener('click', async (e) => {
      if (isScheduling) return;
      
      e.preventDefault();
      
      const pwd = document.getElementById('password').value;
      const channelId = document.getElementById('channel').value;
      const title = document.getElementById('title').value;
      const date = document.getElementById('scheduleDate').value;
      const time = document.getElementById('scheduleTime').value;
      
      if (!pwd || !channelId || !date || !time || selectedFiles.length === 0) {
        showMessage('Please fill in all fields and select files', 'error');
        return;
      }
      
      try {
        document.getElementById('scheduleBtn').disabled = true;
        showMessage('Uploading files...', 'info');
        
        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('files', file));
        
        const uploadRes = await fetch(\`\${API_URL}/api/upload\`, {
          method: 'POST',
          headers: { 'x-dashboard-pwd': pwd },
          body: formData
        });
        
        if (!uploadRes.ok) throw new Error(await uploadRes.text());
        const uploadData = await uploadRes.json();
        
        showMessage('Scheduling post...', 'info');
        
        const schedRes = await fetch(\`\${API_URL}/api/schedule\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dashboard-pwd': pwd
          },
          body: JSON.stringify({
            channelId,
            title,
            files: uploadData.files,
            scheduledTime: new Date(\`\${date}T\${time}\`).toISOString()
          })
        });
        
        if (!schedRes.ok) throw new Error(await schedRes.text());
        
        showMessage('✓ Post scheduled successfully!', 'success');
        selectedFiles = [];
        renderFileList();
        document.getElementById('mediaForm').reset();
        document.getElementById('scheduleFields').classList.remove('show');
        isScheduling = false;
      } catch (err) {
        showMessage('Error: ' + err.message, 'error');
      } finally {
        document.getElementById('scheduleBtn').disabled = false;
      }
    });
    
    function showMessage(text, type) {
      const msg = document.getElementById('message');
      msg.textContent = text;
      msg.className = \`message show \${type}\`;
      
      if (type === 'success' || type === 'error') {
        setTimeout(() => msg.classList.remove('show'), 5000);
      }
    }
    
    if (urlPassword) {
      loadChannels();
    }
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.send(dashboardHTML);
});

// Discord Bot Setup
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

discordClient.once('ready', () => {
  console.log(`✓ Discord bot logged in as ${discordClient.user.tag}`);
  console.log(`✓ Bot has access to ${discordClient.guilds.cache.size} guild(s)`);
});

discordClient.on('error', err => console.error('Discord bot error:', err));
discordClient.on('warn', msg => console.warn('Discord bot warn:', msg));

discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error('Failed to login to Discord:', err.message);
  console.error('Check that DISCORD_TOKEN is valid and the bot has not been revoked');
});

// Scheduler Map - in-memory task storage
const scheduledTasks = new Map();

// Load persisted schedules on startup
function loadSchedules() {
  try {
    const files = fs.readdirSync(schedulesDir);
    console.log(`Loading ${files.length} scheduled posts...`);
    
    files.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(schedulesDir, file), 'utf8'));
        const taskId = data.id;
        const now = new Date();
        const schedTime = new Date(data.scheduledTime);
        
        if (schedTime > now) {
          schedulePost(data);
          console.log(`✓ Loaded scheduled post: ${taskId}`);
        } else {
          fs.unlinkSync(path.join(schedulesDir, file));
        }
      } catch (err) {
        console.error(`Error loading schedule ${file}:`, err.message);
      }
    });
  } catch (err) {
    console.error('Error loading schedules:', err.message);
  }
}

function schedulePost(data) {
  const taskId = data.id;
  const schedTime = new Date(data.scheduledTime);
  
  const cronExpression = `${schedTime.getSeconds()} ${schedTime.getMinutes()} ${schedTime.getHours()} ${schedTime.getDate()} ${schedTime.getMonth() + 1} *`;
  
  try {
    const task = cron.schedule(cronExpression, async () => {
      console.log(`⏰ Executing scheduled post: ${taskId}`);
      try {
        await sendPostToDiscord(data.channelId, data.title, data.files);
        task.stop();
        scheduledTasks.delete(taskId);
        fs.unlinkSync(path.join(schedulesDir, `${taskId}.json`));
        data.files.forEach(f => {
          try { fs.unlinkSync(f); } catch (e) {}
        });
        console.log(`✓ Scheduled post executed: ${taskId}`);
      } catch (err) {
        console.error(`✗ Error executing scheduled post ${taskId}:`, err.message);
      }
    });
    
    scheduledTasks.set(taskId, task);
  } catch (err) {
    console.error(`Error scheduling post ${taskId}:`, err.message);
  }
}

async function sendPostToDiscord(channelId, title, filePaths) {
  try {
    const channel = await discordClient.channels.fetch(channelId);
    
    if (!channel) {
      throw new Error('Channel not found');
    }
    
    if (!channel.isSendable?.()) {
      throw new Error('Channel is not sendable (check bot permissions)');
    }
    
    const attachments = filePaths.filter(f => fs.existsSync(f));
    
    if (attachments.length === 0) {
      await channel.send(title || 'Empty post');
    } else {
      await channel.send({
        content: title || '',
        files: attachments
      });
    }
    
    return true;
  } catch (err) {
    console.error('Error sending to Discord:', err);
    throw err;
  }
}

// ===== API ENDPOINTS =====

// Auth middleware
function authMiddleware(req, res, next) {
  const pwd = req.headers['x-dashboard-pwd'] || req.query.pwd;
  if (!pwd || pwd !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Health check endpoint (no auth)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    bot: discordClient.readyAt ? 'ready' : 'connecting',
    timestamp: new Date().toISOString()
  });
});

// Get available Discord channels
app.get('/api/channels', authMiddleware, async (req, res) => {
  try {
    if (!discordClient.readyAt) {
      return res.status(503).json({ error: 'Discord bot not ready yet. Try again in a few seconds.' });
    }
    
    const channels = [];
    const guilds = discordClient.guilds.cache;
    
    if (guilds.size === 0) {
      return res.status(400).json({ error: 'Bot is not in any Discord servers' });
    }
    
    for (const guild of guilds.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.isSendable?.() && 
            (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)) {
          channels.push({
            id: channel.id,
            name: `#${channel.name}`,
            guild: guild.name
          });
        }
      }
    }
    
    res.json(channels);
  } catch (err) {
    console.error('Error fetching channels:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload media
app.post('/api/upload', authMiddleware, upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  const filePaths = req.files.map(f => path.join(uploadsDir, f.filename));
  res.json({ files: filePaths, count: filePaths.length });
});

// Send immediately
app.post('/api/send-now', authMiddleware, async (req, res) => {
  const { channelId, title, files } = req.body;
  
  if (!channelId || !files || files.length === 0) {
    return res.status(400).json({ error: 'Missing channelId or files' });
  }
  
  try {
    await sendPostToDiscord(channelId, title, files);
    
    files.forEach(f => {
      try { fs.unlinkSync(f); } catch (e) {}
    });
    
    res.json({ success: true, message: 'Post sent!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Schedule post
app.post('/api/schedule', authMiddleware, (req, res) => {
  const { channelId, title, files, scheduledTime } = req.body;
  
  if (!channelId || !files || !scheduledTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const schedTime = new Date(scheduledTime);
  if (schedTime <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }
  
  const taskId = `task-${Date.now()}`;
  const schedData = { id: taskId, channelId, title, files, scheduledTime };
  
  try {
    fs.writeFileSync(path.join(schedulesDir, `${taskId}.json`), JSON.stringify(schedData));
    schedulePost(schedData);
    res.json({ success: true, taskId, message: 'Post scheduled!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  Discord Media Bot - Server Running     ║`);
  console.log(`╠════════════════════════════════════════╣`);
  console.log(`║  Port: ${PORT}                            ║`);
  console.log(`║  Dashboard: http://localhost:${PORT}        ║`);
  console.log(`║  Health: http://localhost:${PORT}/health   ║`);
  console.log(`║  Waiting for Discord bot to connect...  ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  
  setTimeout(() => loadSchedules(), 3000);
});
