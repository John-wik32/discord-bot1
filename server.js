const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const fetch = require('node-fetch');
const { Client, GatewayIntentBits, ChannelType, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin123';

console.log('🚀 Starting Discord Media Bot...');

if (!DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is required');
  process.exit(1);
}

const uploadsDir = path.join(__dirname, 'uploads');
const schedulesDir = path.join(__dirname, 'schedules');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

let activeUsers = new Set();
setInterval(() => { activeUsers.clear(); }, 30 * 60 * 1000);

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use((req, res, next) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  activeUsers.add(clientIp);
  next();
});

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve dashboard HTML
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Media Poster</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
    .top-bar { display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .active-users { background: rgba(255, 255, 255, 0.95); padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: 600; color: #667eea; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
    .active-users span { display: inline-block; width: 24px; height: 24px; background: #28a745; border-radius: 50%; text-align: center; line-height: 24px; color: white; font-weight: bold; margin-right: 8px; }
    .tabs { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px; }
    .tab-btn { padding: 12px 24px; font-size: 14px; font-weight: 600; border: 2px solid white; background: rgba(255, 255, 255, 0.2); color: white; border-radius: 6px; cursor: pointer; transition: all 0.3s; }
    .tab-btn.active { background: white; color: #667eea; }
    .tab-btn:hover { transform: translateY(-2px); }
    .page { display: none; }
    .page.active { display: block; }
    .container { width: 100%; max-width: 800px; background: white; border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2); overflow: hidden; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { font-size: 24px; margin-bottom: 5px; }
    .header p { opacity: 0.9; font-size: 14px; }
    .form-section { padding: 30px 20px; max-height: 70vh; overflow-y: auto; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; font-size: 14px; }
    input[type="text"], input[type="date"], input[type="time"], input[type="password"], select { width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px; font-family: inherit; transition: border-color 0.3s; }
    input:focus, select:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
    .file-upload { border: 2px dashed #667eea; border-radius: 6px; padding: 30px; text-align: center; cursor: pointer; background: #f8f9ff; transition: all 0.3s; }
    .file-upload:hover { border-color: #764ba2; background: #f0f2ff; }
    .file-upload input { display: none; }
    .file-list { margin-top: 15px; max-height: 150px; overflow-y: auto; }
    .file-item { background: #f5f5f5; padding: 8px 12px; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .file-item button { background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .file-item button:hover { background: #cc0000; }
    .button-group { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 25px; }
    button { padding: 12px 20px; font-size: 14px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; transition: all 0.3s; }
    .btn-send { background: #667eea; color: white; }
    .btn-send:hover:not(:disabled) { background: #5568d3; transform: translateY(-2px); box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4); }
    .btn-schedule { background: #764ba2; color: white; }
    .btn-schedule:hover:not(:disabled) { background: #654a8c; transform: translateY(-2px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .schedule-fields { display: none; padding: 15px; background: #f8f9ff; border-radius: 6px; margin: 15px 0; }
    .schedule-fields.show { display: block; }
    .message { padding: 15px; border-radius: 6px; margin-bottom: 20px; display: none; font-size: 14px; animation: slideIn 0.3s ease; }
    .message.show { display: block; }
    .message.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .message.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .message.info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
    .schedule-card { background: #f8f9ff; border: 2px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
    .schedule-card:hover { border-color: #667eea; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2); }
    .schedule-title { font-weight: 600; color: #333; margin: 0 0 4px 0; }
    .schedule-time { color: #666; font-size: 12px; }
    .schedule-files { margin-top: 10px; padding: 8px; background: white; border-radius: 4px; font-size: 12px; max-height: 100px; overflow-y: auto; }
    .schedule-file { padding: 4px 0; border-bottom: 1px solid #eee; }
    .schedule-file:last-child { border-bottom: none; }
    .schedule-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 12px; }
    .btn-small { padding: 8px 12px; font-size: 12px; border-radius: 4px; }
    .btn-edit { background: #667eea; color: white; }
    .btn-delete { background: #ff4444; color: white; }
    .btn-save { background: #28a745; color: white; grid-column: 1 / 3; }
    .btn-cancel { background: #999; color: white; }
    .edit-fields { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd; }
    .edit-fields.show { display: block; }
    .empty-state { text-align: center; padding: 40px 20px; color: #999; }
    @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="active-users"><span id="userCount">0</span>Active Users</div>
  </div>
  <div class="tabs">
    <button class="tab-btn active" onclick="switchPage('create')">📤 Create Post</button>
    <button class="tab-btn" onclick="switchPage('schedules')">📅 Scheduled Posts</button>
  </div>
  <div class="container">
    <div class="header">
      <h1>📢 Discord Media Poster</h1>
      <p>Post images & videos to Discord channels</p>
    </div>
    <div id="create" class="page active">
      <div class="form-section">
        <div id="message" class="message"></div>
        <form id="mediaForm">
          <div class="form-group"><label>Dashboard Password</label><input type="password" id="password" placeholder="Enter dashboard password"></div>
          <div class="form-group"><label>Discord Channel</label><select id="channel" required><option value="">Loading channels...</option></select></div>
          <div class="form-group"><label>Post Title (Optional)</label><input type="text" id="title" placeholder="What's this post about?"></div>
          <div class="form-group"><label>Upload Media Files</label><div class="file-upload" id="fileUpload"><div>Click or drag files here</div><div style="color: #999; font-size: 12px; margin-top: 5px;">PNG, JPG, GIF, MP4, MOV (up to 25MB each)</div><input type="file" id="fileInput" multiple accept="image/*,video/*"></div><div class="file-list" id="fileList"></div></div>
          <div class="schedule-fields" id="scheduleFields"><div class="form-group"><label>Date</label><input type="date" id="scheduleDate"></div><div class="form-group"><label>Time</label><input type="time" id="scheduleTime"></div></div>
          <div class="button-group"><button type="button" class="btn-send" id="sendNowBtn">📤 Send Now</button><button type="button" class="btn-schedule" id="scheduleBtn">⏰ Schedule</button></div>
        </form>
      </div>
    </div>
    <div id="schedules" class="page">
      <div class="form-section"><div id="schedulesMessage" class="message"></div><h2 style="margin-bottom: 20px; color: #333;">📅 All Scheduled Posts</h2><div id="schedulesList"></div><div id="emptySchedules" class="empty-state"><p>No scheduled posts yet</p></div></div>
    </div>
  </div>
  <script>
const API_URL = window.location.origin;
let selectedFiles = [];
let isScheduling = false;
let allSchedules = [];
let currentPassword = '';

function updateActiveUsers() {
  fetch(API_URL + '/api/active-users')
    .then(r => r.json())
    .then(d => {
      document.getElementById('userCount').textContent = d.count;
    })
    .catch(e => {});
}

updateActiveUsers();
setInterval(updateActiveUsers, 5000);

function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  event.target.classList.add('active');
  if (page === 'schedules') loadSchedules();
}

const fileUpload = document.getElementById('fileUpload');
const fileInput = document.getElementById('fileInput');

fileUpload.addEventListener('click', () => fileInput.click());
fileUpload.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileUpload.style.borderColor = '#764ba2';
});
fileUpload.addEventListener('dragleave', () => {
  fileUpload.style.borderColor = '#667eea';
});
fileUpload.addEventListener('drop', (e) => {
  e.preventDefault();
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
  document.getElementById('fileList').innerHTML = selectedFiles.map((file, idx) => {
    return '<div class="file-item"><span>' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + 'MB)</span><button type="button" onclick="removeFile(' + idx + ')">Remove</button></div>';
  }).join('');
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
    const res = await fetch(API_URL + '/api/channels', { headers: { 'x-dashboard-pwd': pwd } });
    if (res.status === 401) {
      showMessage('Invalid password', 'error');
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    
    const channels = await res.json();
    const select = document.getElementById('channel');
    select.innerHTML = '<option value="">Select a channel...</option>' + channels.map(ch => 
      '<option value="' + ch.id + '">' + ch.guild + ' - ' + ch.name + '</option>'
    ).join('');
  } catch (err) {
    showMessage('Failed to load channels: ' + err.message, 'error');
  }
}

document.getElementById('password').addEventListener('change', loadChannels);

document.getElementById('scheduleBtn').addEventListener('click', (e) => {
  e.preventDefault();
  isScheduling = !isScheduling;
  document.getElementById('scheduleFields').classList.toggle('show');
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
    
    const uploadRes = await fetch(API_URL + '/api/upload', {
      method: 'POST',
      headers: { 'x-dashboard-pwd': pwd },
      body: formData
    });
    
    if (!uploadRes.ok) throw new Error(await uploadRes.text());
    const uploadData = await uploadRes.json();
    
    showMessage('Sending to Discord...', 'info');
    
    const sendRes = await fetch(API_URL + '/api/send-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-pwd': pwd },
      body: JSON.stringify({ channelId, title, files: uploadData.files })
    });
    
    if (!sendRes.ok) throw new Error(await sendRes.text());
    
    showMessage('Post sent successfully!', 'success');
    selectedFiles = [];
    renderFileList();
    document.getElementById('mediaForm').reset();
  } catch (err) {
    showMessage('Error: ' + err.message, 'error');
  } finally {
    document.getElementById('sendNowBtn').disabled = false;
  }
});

let scheduleButtonSecondClick = false;
document.getElementById('scheduleBtn').addEventListener('click', async (e) => {
  if (scheduleButtonSecondClick && !isScheduling) {
    scheduleButtonSecondClick = false;
    
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
      
      const uploadRes = await fetch(API_URL + '/api/upload', {
        method: 'POST',
        headers: { 'x-dashboard-pwd': pwd },
        body: formData
      });
      
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const uploadData = await uploadRes.json();
      
      showMessage('Scheduling post...', 'info');
      
      const schedRes = await fetch(API_URL + '/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-pwd': pwd },
        body: JSON.stringify({
          channelId,
          title,
          files: uploadData.files,
          scheduledTime: new Date(date + 'T' + time).toISOString()
        })
      });
      
      if (!schedRes.ok) throw new Error(await schedRes.text());
      
      showMessage('Post scheduled successfully!', 'success');
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
  } else {
    scheduleButtonSecondClick = true;
  }
});

async function loadSchedules() {
  if (!currentPassword) {
    showSchedulesMessage('Please enter password first', 'info');
    return;
  }
  
  try {
    const res = await fetch(API_URL + '/api/schedules', { headers: { 'x-dashboard-pwd': currentPassword } });
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
  list.innerHTML = allSchedules.map(sched => {
    const time = new Date(sched.scheduledTime).toLocaleString();
    return '<div class="schedule-card" id="card-' + sched.id + '"><h3 class="schedule-title" id="title-' + sched.id + '">' + (sched.title || 'Untitled') + '</h3><div class="schedule-time">⏰ ' + time + '</div><div class="schedule-files">' + sched.files.map(f => '<div class="schedule-file">📄 ' + f.split('/').pop() + '</div>').join('') + '</div><div class="edit-fields" id="edit-' + sched.id + '"><label>New Title</label><input type="text" class="edit-title" value="' + (sched.title || '') + '" placeholder="Update title"></div><div class="schedule-actions"><button class="btn-small btn-edit" onclick="editSchedule(\'' + sched.id + '\')">✏️ Edit</button><button class="btn-small btn-cancel" onclick="cancelEdit(\'' + sched.id + '\')" style="display:none;" id="cancel-' + sched.id + '">Cancel</button><button class="btn-small btn-save" onclick="saveSchedule(\'' + sched.id + '\')" style="display:none;" id="save-' + sched.id + '">💾 Save</button><button class="btn-small btn-delete" onclick="deleteSchedule(\'' + sched.id + '\')">🗑️ Delete</button></div></div>';
  }).join('');
}

function editSchedule(id) {
  const card = document.getElementById('card-' + id);
  const editBtn = card.querySelector('.btn-edit');
  const saveBtn = document.getElementById('save-' + id);
  const cancelBtn = document.getElementById('cancel-' + id);
  const editFields = document.getElementById('edit-' + id);
  
  card.classList.add('editing');
  editFields.classList.add('show');
  editBtn.style.display = 'none';
  saveBtn.style.display = 'block';
  cancelBtn.style.display = 'block';
}

function cancelEdit(id) {
  const card = document.getElementById('card-' + id);
  const editBtn = card.querySelector('.btn-edit');
  const saveBtn = document.getElementById('save-' + id);
  const cancelBtn = document.getElementById('cancel-' + id);
  const editFields = document.getElementById('edit-' + id);
  
  card.classList.remove('editing');
  editFields.classList.remove('show');
  editBtn.style.display = 'block';
  saveBtn.style.display = 'none';
  cancelBtn.style.display = 'none';
}

async function saveSchedule(id) {
  const newTitle = document.querySelector('#edit-' + id + ' .edit-title').value;
  
  try {
    const res = await fetch(API_URL + '/api/schedule/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-pwd': currentPassword },
      body: JSON.stringify({ title: newTitle })
    });
    if (!res.ok) throw new Error('Failed to save');
    const idx = allSchedules.findIndex(s => s.id === id);
    if (idx !== -1) allSchedules[idx].title = newTitle;
    cancelEdit(id);
    document.getElementById('title-' + id).textContent = newTitle || 'Untitled';
    showSchedulesMessage('Schedule updated!', 'success');
  } catch (err) {
    showSchedulesMessage('Error: ' + err.message, 'error');
  }
}

async function deleteSchedule(id) {
  if (!confirm('Delete this scheduled post?')) return;
  
  try {
    const res = await fetch(API_URL + '/api/schedule/' + id, {
      method: 'DELETE',
      headers: { 'x-dashboard-pwd': currentPassword }
    });
    if (!res.ok) throw new Error('Failed to delete');
    allSchedules = allSchedules.filter(s => s.id !== id);
    renderSchedules();
    showSchedulesMessage('Schedule deleted!', 'success');
  } catch (err) {
    showSchedulesMessage('Error: ' + err.message, 'error');
  }
}

function showMessage(text, type) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.className = 'message show ' + type;
  if (type === 'success' || type === 'error') setTimeout(() => msg.classList.remove('show'), 5000);
}

function showSchedulesMessage(text, type) {
  const msg = document.getElementById('schedulesMessage');
  msg.textContent = text;
  msg.className = 'message show ' + type;
  if (type === 'success' || type === 'error') setTimeout(() => msg.classList.remove('show'), 5000);
}
  </script>
</body>
</html>`);
  }
});


const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
});

discordClient.once('ready', async () => {
  console.log(`✓ Bot logged in as ${discordClient.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('post')
        .setDescription('Post media to a Discord channel')
        .addChannelOption(option =>
          option.setName('channel').setDescription('Channel to post to').setRequired(true)
        )
    ];
    
    await rest.put(Routes.applicationCommands(discordClient.user.id), { body: commands.map(cmd => cmd.toJSON()) });
    console.log('✓ Slash commands registered');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

discordClient.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isCommand() && interaction.commandName === 'post') {
      const channel = interaction.options.getChannel('channel');
      
      if (!interaction.member.permissions.has('SEND_MESSAGES')) {
        return interaction.reply({ content: 'No permission', ephemeral: true });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('postModal')
        .setTitle('Post to ' + channel.name);
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('titleInput').setLabel('Post Title').setStyle(TextInputStyle.Short).setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('dateInput').setLabel('Schedule Date (YYYY-MM-DD)').setStyle(TextInputStyle.Short).setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('timeInput').setLabel('Schedule Time (HH:MM)').setStyle(TextInputStyle.Short).setRequired(false)
        )
      );
      
      discordClient.tempPostData = discordClient.tempPostData || {};
      discordClient.tempPostData[interaction.user.id] = {
        channelId: channel.id,
        channelName: channel.name
      };
      
      await interaction.showModal(modal);
    }
    
    if (interaction.isModalSubmit() && interaction.customId === 'postModal') {
      const title = interaction.fields.getTextInputValue('titleInput') || '';
      const schedDate = interaction.fields.getTextInputValue('dateInput') || '';
      const schedTime = interaction.fields.getTextInputValue('timeInput') || '';
      
      const postData = discordClient.tempPostData?.[interaction.user.id];
      if (!postData) {
        return interaction.reply({ content: 'Session expired', ephemeral: true });
      }
      
      const embed = new EmbedBuilder()
        .setColor('#667eea')
        .setTitle('📤 Upload Media')
        .setDescription(`**Channel:** <#${postData.channelId}>\n**Title:** ${title || '(none)'}\n\n📎 Attach files and click Send`)
        .addFields({ name: '⏰ Schedule', value: schedDate && schedTime ? `${schedDate} ${schedTime}` : 'Immediate' });
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('send_now_' + interaction.user.id).setLabel('📤 Send Now').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('schedule_post_' + interaction.user.id).setLabel('⏰ Schedule').setStyle(ButtonStyle.Secondary).setDisabled(!schedDate || !schedTime),
        new ButtonBuilder().setCustomId('cancel_post_' + interaction.user.id).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
      );
      
      discordClient.tempPostData[interaction.user.id] = { ...postData, title, schedDate, schedTime };
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    
    if (interaction.isButton()) {
      const buttonId = interaction.customId;
      const userId = interaction.user.id;
      
      if (!buttonId.includes(userId)) return;
      
      const postData = discordClient.tempPostData?.[userId];
      if (!postData) return interaction.reply({ content: 'Session expired', ephemeral: true });
      
      if (buttonId.startsWith('cancel_post_')) {
        delete discordClient.tempPostData[userId];
        return interaction.reply({ content: '❌ Cancelled', ephemeral: true });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      const attachments = Array.from(interaction.message.attachments.values());
      if (attachments.length === 0) {
        return interaction.editReply({ content: '❌ No files attached' });
      }
      
      try {
        if (buttonId.startsWith('send_now_')) {
          const channel = discordClient.channels.cache.get(postData.channelId);
          const files = [];
          
          for (const att of attachments) {
            const response = await fetch(att.url);
            const buffer = await response.buffer();
            const filePath = path.join(uploadsDir, `${Date.now()}-${att.name}`);
            fs.writeFileSync(filePath, buffer);
            files.push(filePath);
          }
          
          await channel.send({ content: postData.title || '', files });
          files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
          delete discordClient.tempPostData[userId];
          interaction.editReply({ content: '✅ Posted!' });
        }
        
        if (buttonId.startsWith('schedule_post_')) {
          const { schedDate, schedTime, title, channelId } = postData;
          if (!schedDate || !schedTime) return interaction.editReply({ content: '❌ Date/time required' });
          
          const taskId = `task-${Date.now()}`;
          const files = [];
          
          for (const att of attachments) {
            const response = await fetch(att.url);
            const buffer = await response.buffer();
            const filePath = path.join(uploadsDir, `${Date.now()}-${att.name}`);
            fs.writeFileSync(filePath, buffer);
            files.push(filePath);
          }
          
          const scheduledTime = new Date(`${schedDate}T${schedTime}`).toISOString();
          const schedData = { id: taskId, channelId, title, files, scheduledTime };
          fs.writeFileSync(path.join(schedulesDir, `${taskId}.json`), JSON.stringify(schedData));
          schedulePost(schedData);
          
          delete discordClient.tempPostData[userId];
          interaction.editReply({ content: `✅ Scheduled!` });
        }
      } catch (err) {
        console.error('Button error:', err);
        interaction.editReply({ content: '❌ Error: ' + err.message });
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
  }
});

discordClient.on('error', err => console.error('Discord error:', err));
discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error('Login error:', err.message);
});

const scheduledTasks = new Map();

function loadSchedules() {
  try {
    const files = fs.readdirSync(schedulesDir);
    files.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(schedulesDir, file), 'utf8'));
        if (new Date(data.scheduledTime) > new Date()) {
          schedulePost(data);
        } else {
          fs.unlinkSync(path.join(schedulesDir, file));
        }
      } catch (err) {
        console.error(`Error loading ${file}:`, err.message);
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
      try {
        await sendPostToDiscord(data.channelId, data.title, data.files);
        task.stop();
        scheduledTasks.delete(taskId);
        fs.unlinkSync(path.join(schedulesDir, `${taskId}.json`));
        data.files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
        console.log(`✓ Post executed: ${taskId}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
      }
    });
    scheduledTasks.set(taskId, task);
  } catch (err) {
    console.error(`Schedule error: ${err.message}`);
  }
}

async function sendPostToDiscord(channelId, title, filePaths) {
  const channel = await discordClient.channels.fetch(channelId);
  if (!channel || !channel.isSendable?.()) throw new Error('Channel not sendable');
  
  const attachments = filePaths.filter(f => fs.existsSync(f));
  if (attachments.length === 0) {
    await channel.send(title || 'Empty post');
  } else {
    await channel.send({ content: title || '', files: attachments });
  }
}

function authMiddleware(req, res, next) {
  const pwd = req.headers['x-dashboard-pwd'] || req.query.pwd;
  if (!pwd || pwd !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: discordClient.readyAt ? 'ready' : 'connecting' });
});

app.get('/api/active-users', (req, res) => {
  res.json({ count: activeUsers.size });
});

app.get('/api/channels', authMiddleware, async (req, res) => {
  try {
    if (!discordClient.readyAt) return res.status(503).json({ error: 'Bot not ready' });
    
    const channels = [];
    for (const guild of discordClient.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.isSendable?.() && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)) {
          channels.push({ id: channel.id, name: `#${channel.name}`, guild: guild.name });
        }
      }
    }
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedules', authMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(schedulesDir);
    const schedules = files.map(file => JSON.parse(fs.readFileSync(path.join(schedulesDir, file), 'utf8')));
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', authMiddleware, upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files' });
  const filePaths = req.files.map(f => path.join(uploadsDir, f.filename));
  res.json({ files: filePaths, count: filePaths.length });
});

app.post('/api/send-now', authMiddleware, async (req, res) => {
  const { channelId, title, files } = req.body;
  if (!channelId || !files || files.length === 0) return res.status(400).json({ error: 'Missing data' });
  
  try {
    await sendPostToDiscord(channelId, title, files);
    files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedule', authMiddleware, (req, res) => {
  const { channelId, title, files, scheduledTime } = req.body;
  if (!channelId || !files || !scheduledTime) return res.status(400).json({ error: 'Missing data' });
  
  const schedTime = new Date(scheduledTime);
  if (schedTime <= new Date()) return res.status(400).json({ error: 'Time must be future' });
  
  const taskId = `task-${Date.now()}`;
  const schedData = { id: taskId, channelId, title, files, scheduledTime };
  
  try {
    fs.writeFileSync(path.join(schedulesDir, `${taskId}.json`), JSON.stringify(schedData));
    schedulePost(schedData);
    res.json({ success: true, taskId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/schedule/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  
  try {
    const filePath = path.join(schedulesDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.title = title;
    fs.writeFileSync(filePath, JSON.stringify(data));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/schedule/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  try {
    const filePath = path.join(schedulesDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
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

app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  setTimeout(() => loadSchedules(), 3000);
});
