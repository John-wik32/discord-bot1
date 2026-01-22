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

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')).catch(() => {
    res.send('Dashboard not found. Make sure public/index.html exists.');
  });
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
    console.error('Error registering commands:', error.message);
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
      discordClient.tempPostData[interaction.user.id] = { channelId: channel.id, channelName: channel.name };
      
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

discordClient.on('error', err => console.error('❌ Discord error:', err.message));
discordClient.on('warn', msg => console.warn('⚠️ Discord warn:', msg));

discordClient.login(DISCORD_TOKEN).catch(err => {
  console.error('❌ Failed to login:', err.message);
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
