const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- DATA ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  schedule: path.join(DATA_DIR, 'schedule.json'),
  history: path.join(DATA_DIR, 'history.json')
};

for (const f of Object.values(FILES)) {
  if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
}

const read = f => JSON.parse(fs.readFileSync(f));
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ---------- AUTH ----------
const auth = (req, res, next) => {
  if (req.headers.authorization !== ADMIN_PASSWORD)
    return res.status(403).json({ error: 'Unauthorized' });
  next();
};

// ---------- MULTER ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- DISCORD ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Discord connected as ${client.user.tag}`);
});

// 🔒 SAFE LOGIN (Koyeb will NOT fail)
client.login(DISCORD_TOKEN)
  .catch(err => console.error('Discord login failed:', err.message));

// ---------- HEALTH CHECK ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------- CHANNELS ----------
app.get('/api/channels', auth, (req, res) => {
  const channels = [];
  client.guilds.cache.forEach(g =>
    g.channels.cache.forEach(c => {
      if (c.type === 0) {
        channels.push({
          id: c.id,
          name: `${g.name} #${c.name}`
        });
      }
    })
  );
  res.json(channels);
});

// ---------- SEND / SCHEDULE ----------
app.post('/api/post', auth, upload.array('mediaFile', 5), async (req, res) => {
  const { channelId, postTitle, scheduleTime } = req.body;
  if (!channelId) return res.status(400).json({ error: 'Channel required' });

  // SCHEDULE
  if (scheduleTime) {
    const schedule = read(FILES.schedule);
    schedule.push({
      id: Date.now(),
      channelId,
      postTitle,
      time: scheduleTime,
      files: req.files.map(f => ({
        name: f.originalname,
        data: f.buffer.toString('base64')
      }))
    });
    write(FILES.schedule, schedule);
    return res.json({ success: true });
  }

  // SEND NOW
  const channel = await client.channels.fetch(channelId);
  await channel.send({
    content: postTitle || '',
    files: req.files.map(f =>
      new AttachmentBuilder(f.buffer, { name: f.originalname })
    )
  });

  const history = read(FILES.history);
  history.push({ title: postTitle, time: new Date().toISOString() });
  write(FILES.history, history);

  res.json({ success: true });
});

// ---------- SCHEDULER (FIXED SAME-DAY TIME) ----------
setInterval(async () => {
  let schedule = read(FILES.schedule);
  const now = new Date();
  const remaining = [];

  for (const s of schedule) {
    const sendTime = new Date(s.time.replace('T', ' ') + ':00');
    if (sendTime <= now) {
      try {
        const channel = await client.channels.fetch(s.channelId);
        await channel.send({
          content: s.postTitle || '',
          files: s.files.map(f =>
            new AttachmentBuilder(
              Buffer.from(f.data, 'base64'),
              { name: f.name }
            )
          )
        });
      } catch {
        remaining.push(s);
      }
    } else remaining.push(s);
  }

  write(FILES.schedule, remaining);
}, 30000);

// ---------- LIST ----------
app.get('/api/scheduled', auth, (req, res) => {
  res.json(read(FILES.schedule));
});

app.get('/api/history', auth, (req, res) => {
  res.json(read(FILES.history));
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
