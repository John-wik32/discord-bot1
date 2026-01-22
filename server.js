// server.js (FIXED – copy-paste replace ENTIRE FILE)

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

/* ================= FIX ================= */
const uploadsDir = path.join(__dirname, 'uploads');
const schedulesDir = path.join(__dirname, 'schedules');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });
/* ====================================== */

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

let activeUsers = new Set();
setInterval(() => activeUsers.clear(), 30 * 60 * 1000);

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use((req, _, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  activeUsers.add(ip);
  next();
});

/* ================= DASHBOARD ================= */
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
/* ============================================ */

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

discordClient.once('ready', async () => {
  console.log(`✓ Bot logged in as ${discordClient.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName('post')
      .setDescription('Post media to a Discord channel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
  ];

  await rest.put(Routes.applicationCommands(discordClient.user.id), {
    body: commands.map(c => c.toJSON())
  });
});

discordClient.login(DISCORD_TOKEN);

/* ================= API ================= */
function auth(req, res, next) {
  const pwd = req.headers['x-dashboard-pwd'];
  if (pwd !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/health', (_, res) => res.json({ ok: true }));

app.get('/api/active-users', (_, res) => {
  res.json({ count: activeUsers.size });
});

app.get('/api/channels', auth, async (_, res) => {
  const out = [];
  for (const g of discordClient.guilds.cache.values()) {
    for (const c of g.channels.cache.values()) {
      if (c.isSendable?.() && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)) {
        out.push({ id: c.id, name: `#${c.name}`, guild: g.name });
      }
    }
  }
  res.json(out);
});

app.post('/api/upload', auth, upload.array('files', 10), (req, res) => {
  const files = req.files.map(f => path.join(uploadsDir, f.filename));
  res.json({ files });
});

async function sendPost(channelId, title, files) {
  const channel = await discordClient.channels.fetch(channelId);
  await channel.send({ content: title || '', files });
}

app.post('/api/send-now', auth, async (req, res) => {
  const { channelId, title, files } = req.body;
  await sendPost(channelId, title, files);
  files.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
  res.json({ ok: true });
});

app.post('/api/schedule', auth, (req, res) => {
  const id = `task-${Date.now()}`;
  fs.writeFileSync(path.join(schedulesDir, `${id}.json`), JSON.stringify({ ...req.body, id }));
  schedulePost({ ...req.body, id });
  res.json({ ok: true });
});

app.get('/api/schedules', auth, (_, res) => {
  const list = fs.readdirSync(schedulesDir).map(f =>
    JSON.parse(fs.readFileSync(path.join(schedulesDir, f), 'utf8'))
  );
  res.json(list);
});

/* ================= SCHEDULER ================= */
function schedulePost(data) {
  const t = new Date(data.scheduledTime);
  cron.schedule(`${t.getSeconds()} ${t.getMinutes()} ${t.getHours()} ${t.getDate()} ${t.getMonth() + 1} *`, async () => {
    await sendPost(data.channelId, data.title, data.files);
    data.files.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    fs.unlinkSync(path.join(schedulesDir, `${data.id}.json`));
  });
}

app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});
