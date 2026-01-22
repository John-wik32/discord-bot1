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

if (!DISCORD_TOKEN) {
  console.error('ERROR: DISCORD_TOKEN environment variable is required');
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
const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Discord Bot Setup
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

discordClient.once('ready', () => {
  console.log(`✓ Discord bot logged in as ${discordClient.user.tag}`);
});

discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error('Failed to login to Discord:', err.message);
});

// Scheduler Map - in-memory task storage
const scheduledTasks = new Map();

// Load persisted schedules on startup
function loadSchedules() {
  const files = fs.readdirSync(schedulesDir);
  files.forEach(file => {
    const data = JSON.parse(fs.readFileSync(path.join(schedulesDir, file), 'utf8'));
    const taskId = data.id;
    
    // Calculate seconds until scheduled time
    const now = new Date();
    const schedTime = new Date(data.scheduledTime);
    
    if (schedTime > now) {
      schedulePost(data);
    } else {
      // Clean up expired schedule
      fs.unlinkSync(path.join(schedulesDir, file));
    }
  });
}

function schedulePost(data) {
  const taskId = data.id;
  const schedTime = new Date(data.scheduledTime);
  
  const cronExpression = `${schedTime.getSeconds()} ${schedTime.getMinutes()} ${schedTime.getHours()} ${schedTime.getDate()} ${schedTime.getMonth() + 1} *`;
  
  const task = cron.schedule(cronExpression, async () => {
    console.log(`Executing scheduled post: ${taskId}`);
    await sendPostToDiscord(data.channelId, data.title, data.files);
    
    // Clean up
    task.stop();
    scheduledTasks.delete(taskId);
    fs.unlinkSync(path.join(schedulesDir, `${taskId}.json`));
    data.files.forEach(f => {
      try { fs.unlinkSync(f); } catch (e) {}
    });
  });
  
  scheduledTasks.set(taskId, task);
}

async function sendPostToDiscord(channelId, title, filePaths) {
  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel.isSendable()) throw new Error('Channel is not sendable');
    
    const attachments = filePaths.filter(f => fs.existsSync(f));
    
    if (attachments.length === 0) {
      await channel.send(title || 'Empty post');
    } else if (attachments.length === 1) {
      await channel.send({
        content: title,
        files: [attachments[0]]
      });
    } else {
      // Send multiple files as attachments
      await channel.send({
        content: title,
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
  if (pwd !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Get available Discord channels
app.get('/api/channels', authMiddleware, async (req, res) => {
  try {
    if (!discordClient.readyAt) {
      return res.status(503).json({ error: 'Discord bot not ready' });
    }
    
    const channels = [];
    const guilds = discordClient.guilds.cache;
    
    for (const guild of guilds.values()) {
      for (const channel of guild.channels.cache.values()) {
        if ((channel.isSendable && channel.type === ChannelType.GuildText) ||
            channel.type === ChannelType.GuildAnnouncement) {
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
    
    // Clean up uploaded files
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: discordClient.readyAt ? 'ready' : 'connecting' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setTimeout(() => loadSchedules(), 2000);
});
