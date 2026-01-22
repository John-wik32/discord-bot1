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
    }
    
    .page {
      display: none;
    }
    
    .page.active {
      display: block;
    }
    
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      justify-content: center;
    }
    
    .tab-btn {
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      border: 2px solid white;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .tab-btn.active {
      background: white;
      color: #667eea;
    }
    
    .tab-btn:hover {
      transform: translateY(-2px);
    }
    
    .container {
      width: 100%;
      max-width: 700px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      margin: 0 auto;
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
    
    /* Schedules Page Styles */
    .schedules-list {
      max-height: 600px;
      overflow-y: auto;
    }
    
    .schedule-card {
      background: #f8f9ff;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      transition: all 0.3s;
    }
    
    .schedule-card:hover {
      border-color: #667eea;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    }
    
    .schedule-card.editing {
      border-color: #667eea;
      background: #fff;
    }
    
    .schedule-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 12px;
    }
    
    .schedule-title {
      font-weight: 600;
      color: #333;
      margin: 0;
      word-break: break-word;
    }
    
    .schedule-time {
      color: #666;
      font-size: 12px;
      margin-top: 4px;
    }
    
    .schedule-channel {
      color: #667eea;
      font-size: 13px;
      margin-top: 4px;
    }
    
    .schedule-files {
      margin-top: 12px;
      padding: 10px;
      background: white;
      border-radius: 4px;
      max-height: 150px;
      overflow-y: auto;
      font-size: 12px;
    }
    
    .schedule-file {
      padding: 6px 0;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .schedule-file:last-child {
      border-bottom: none;
    }
    
    .schedule-actions {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }
    
    .btn-edit, .btn-cancel, .btn-delete, .btn-save {
      padding: 8px 12px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn-edit {
      background: #667eea;
      color: white;
    }
    
    .btn-edit:hover {
      background: #5568d3;
    }
    
    .btn-delete {
      background: #ff4444;
      color: white;
    }
    
    .btn-delete:hover {
      background: #cc0000;
    }
    
    .btn-save {
      background: #28a745;
      color: white;
      grid-column: 1 / 3;
    }
    
    .btn-save:hover {
      background: #218838;
    }
    
    .btn-cancel {
      background: #999;
      color: white;
    }
    
    .btn-cancel:hover {
      background: #777;
    }
    
    .edit-fields {
      display: none;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
    }
    
    .edit-fields.show {
      display: block;
    }
    
    .edit-fields input {
      margin-bottom: 10px;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #999;
    }
    
    .empty-state p {
      font-size: 16px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="tabs">
    <button class="tab-btn active" onclick="switchPage('create')">📤 Create Post</button>
    <button class="tab-btn" onclick="switchPage('schedules')">📅 Active Schedules</button>
  </div>

  <div class="container">
    <div class="header">
      <h1>📢 Discord Media Poster</h1>
      <p>Post images & videos to Discord channels</p>
    </div>
    
    <!-- CREATE POST PAGE -->
    <div id="create" class="page active">
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
    
    <!-- SCHEDULES PAGE -->
    <div id="schedules" class="page">
      <div class="form-section">
        <div id="schedulesMessage" class="message"></div>
        <h2 style="margin-bottom: 20px; color: #333;">📅 Active Scheduled Posts</h2>
        <div class="schedules-list" id="schedulesList"></div>
        <div id="emptySchedules" class="empty-state">
          <p>No scheduled posts yet</p>
          <p style="font-size: 12px;">Create a scheduled post to see it here</p>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    const API_URL = window.location.origin;
    
    let selectedFiles = [];
    let isScheduling = false;
    let allSchedules = [];
    let currentPassword = '';
    
    const urlParams = new URLSearchParams(window.location.search);
    const urlPassword = urlParams.get('pwd');
    if (urlPassword) {
      document.getElementById('password').value = urlPassword;
      currentPassword = urlPassword;
    }
    
    // Tab switching
    function switchPage(page) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(page).classList.add('active');
      event.target.classList.add('active');
      
      if (page === 'schedules') {
        loadSchedules();
      }
    }
    
    // File upload handling
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
      currentPassword = pwd;
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
        
        setTimeout(() => loadSchedules(), 1000);
      } catch (err) {
        showMessage('Error: ' + err.message, 'error');
      } finally {
        document.getElementById('scheduleBtn').disabled = false;
      }
    });
    
    async function loadSchedules() {
      if (!currentPassword) {
        showSchedulesMessage('Please enter password first', 'info');
        return;
      }
      
      try {
        const res = await fetch(\`\${API_URL}/api/schedules\`, {
          headers: { 'x-dashboard-pwd': currentPassword }
        });
        
        if (!res.ok) throw new Error('Failed to load schedules');
        
        allSchedules = await res.json();
        renderSchedules();
      } catch (err) {
        showSchedulesMessage('Error loading schedules: ' + err.message, 'error');
      }
    }
    
    function renderSchedules() {
      const list = document.getElementById('schedulesList');
      const empty = document.getElementById('emptySchedules');
      
      if (allSchedules.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      
      empty.style.display = 'none';
      list.innerHTML = allSchedules.map(sched => \`
        <div class="schedule-card" id="card-\${sched.id}">
          <div class="schedule-header">
            <div>
              <h3 class="schedule-title" id="title-\${sched.id}">\${sched.title || 'Untitled'}</h3>
              <div class="schedule-time">⏰ \${new Date(sched.scheduledTime).toLocaleString()}</div>
              <div class="schedule-channel">📍 Channel ID: \${sched.channelId}</div>
            </div>
          </div>
          
          <div class="schedule-files" id="files-\${sched.id}">
            \${sched.files.map(f => \`<div class="schedule-file"><span>\${f.split('/').pop()}</span></div>\`).join('')}
          </div>
          
          <div class="edit-fields" id="edit-\${sched.id}">
            <label>New Title</label>
            <input type="text" class="edit-title" value="\${sched.title || ''}" placeholder="Update title">
          </div>
          
          <div class="schedule-actions">
            <button class="btn-edit" onclick="editSchedule('\${sched.id}')">✏️ Edit</button>
            <button class="btn-cancel" onclick="cancelEdit('\${sched.id}')" style="display:none;" id="cancel-\${sched.id}">Cancel</button>
            <button class="btn-save" onclick="saveSchedule('\${sched.id}')" style="display:none;" id="save-\${sched.id}">💾 Save</button>
            <button class="btn-delete" onclick="deleteSchedule('\${sched.id}')">🗑️ Delete</button>
          </div>
        </div>
      \`).join('');
    }
    
    function editSchedule(id) {
      const card = document.getElementById(\`card-\${id}\`);
      const editFields = document.getElementById(\`edit-\${id}\`);
      const editBtn = card.querySelector('.btn-edit');
      const saveBtn = document.getElementById(\`save-\${id}\`);
      const cancelBtn = document.getElementById(\`cancel-\${id}\`);
      
      card.classList.add('editing');
      editFields.classList.add('show');
      editBtn.style.display = 'none';
      saveBtn.style.display = 'block';
      cancelBtn.style.display = 'block';
    }
    
    function cancelEdit(id) {
      const card = document.getElementById(\`card-\${id}\`);
      const editFields = document.getElementById(\`edit-\${id}\`);
      const editBtn = card.querySelector('.btn-edit');
      const saveBtn = document.getElementById(\`save-\${id}\`);
      const cancelBtn = document.getElementById(\`cancel-\${id}\`);
      
      card.classList.remove('editing');
      editFields.classList.remove('show');
      editBtn.style.display = 'block';
      saveBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
    }
    
    async function saveSchedule(id) {
      const newTitle = document.querySelector(\`#edit-\${id} .edit-title\`).value;
      
      try {
        const res = await fetch(\`\${API_URL}/api/schedule/\${id}\`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-dashboard-pwd': currentPassword
          },
          body: JSON.stringify({ title: newTitle })
        });
        
        if (!res.ok) throw new Error('Failed to save');
        
        const idx = allSchedules.findIndex(s => s.id === id);
        if (idx !== -1) {
          allSchedul
