const { Client, GatewayIntentBits, AttachmentBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();

// FIX: Changed to upload.array to handle multiple files and prevent 500 errors
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- CONFIG ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'defaultPassword';

// File Paths
const DATA_DIR = __dirname;
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const BRANDING_FILE = path.join(DATA_DIR, 'branding.json');
const RECURRING_FILE = path.join(DATA_DIR, 'recurring.json');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'suggestions.json');

// --- HELPER: SAFE FILE READ/WRITE ---
function safeRead(filePath, isArray = true) {
    if (!fs.existsSync(filePath)) {
        const initial = isArray ? '[]' : '{}';
        fs.writeFileSync(filePath, initial);
        return isArray ? [] : {};
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content || (isArray ? '[]' : '{}'));
    } catch (err) {
        return isArray ? [] : {};
    }
}

function safeWrite(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- DISCORD CLIENT ---
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
});

// --- REGISTER SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion')
        .addStringOption(opt => opt.setName('idea').setDescription('Your idea').setRequired(true))
        .addStringOption(opt => opt.setName('details').setDescription('Extra details'))
];

async function registerCommands() {
    if (!DISCORD_CLIENT_ID) return console.log("Missing DISCORD_CLIENT_ID, skipping slash command registration.");
    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
        console.log('✓ Slash Commands Registered');
    } catch (error) { console.error(error); }
}

client.once('ready', () => {
    console.log(`✓ Bot Online: ${client.user.tag}`);
    registerCommands();
});

// Slash Command Listener
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'suggest') {
        const idea = interaction.options.getString('idea');
        const details = interaction.options.getString('details') || '';
        const suggestions = safeRead(SUGGESTIONS_FILE);
        suggestions.push({ id: Date.now(), idea, details, userName: interaction.user.username, createdAt: new Date().toISOString() });
        safeWrite(SUGGESTIONS_FILE, suggestions);
        await interaction.reply({ content: '✓ Suggestion saved!', ephemeral: true });
    }
});

// --- AUTH MIDDLEWARE ---
const checkAuth = (req, res, next) => {
    if (req.headers['authorization'] !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });
    next();
};

// --- API ROUTES ---

// Channels
app.get('/api/channels', checkAuth, async (req, res) => {
    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(ch => {
                if (ch.type === 0) channels.push({ id: ch.id, name: `${guild.name} - #${ch.name}`, guildId: guild.id });
            });
        });
        res.json(channels);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Posting & Scheduling
app.post('/api/post', checkAuth, upload.array('mediaFile', 5), async (req, res) => {
    try {
        const { channelId, postTitle, scheduleTime, videoUrl } = req.body;

        if (scheduleTime) {
            const tasks = safeRead(SCHEDULE_FILE);
            tasks.push({
                channelId,
                content: postTitle,
                time: scheduleTime,
                videoUrl,
                mediaFiles: req.files ? req.files.map(f => ({ buffer: f.buffer.toString('base64'), name: f.originalname })) : []
            });
            safeWrite(SCHEDULE_FILE, tasks);
            return res.json({ success: true, scheduled: true });
        }

        const channel = await client.channels.fetch(channelId);
        const options = { content: postTitle || '' };
        if (videoUrl) options.content += `\n${videoUrl}`;
        if (req.files && req.files.length > 0) {
            options.files = req.files.map(f => new AttachmentBuilder(f.buffer, { name: f.originalname }));
        }

        await channel.send(options);
        
        // Update History
        const history = safeRead(HISTORY_FILE, false);
        if (!history.entries) history.entries = [];
        history.entries.push({ videoTitle: postTitle, sentAt: new Date().toISOString() });
        safeWrite(HISTORY_FILE, history);

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Templates
app.get('/api/templates', checkAuth, (req, res) => res.json(safeRead(TEMPLATES_FILE)));
app.post('/api/templates', checkAuth, (req, res) => {
    const temps = safeRead(TEMPLATES_FILE);
    temps.push({ id: Date.now(), ...req.body });
    safeWrite(TEMPLATES_FILE, temps);
    res.json({ success: true });
});

// Library
app.get('/api/library', checkAuth, (req, res) => res.json(safeRead(LIBRARY_FILE)));
app.post('/api/library/save', checkAuth, upload.array('mediaFile', 1), (req, res) => {
    const lib = safeRead(LIBRARY_FILE);
    lib.push({ id: Date.now(), title: req.body.title, category: req.body.category, videoUrl: req.body.videoUrl });
    safeWrite(LIBRARY_FILE, lib);
    res.json({ success: true });
});

// Suggestions
app.get('/api/suggestions', checkAuth, (req, res) => res.json(safeRead(SUGGESTIONS_FILE)));
app.delete('/api/suggestions/:id', checkAuth, (req, res) => {
    const filtered = safeRead(SUGGESTIONS_FILE).filter(s => s.id != req.params.id);
    safeWrite(SUGGESTIONS_FILE, filtered);
    res.json({ success: true });
});

// History & Analytics
app.get('/api/history', checkAuth, (req, res) => res.json(safeRead(HISTORY_FILE, false).entries || []));
app.get('/api/analytics', checkAuth, (req, res) => res.json(safeRead(ANALYTICS_FILE, false)));

// Recurring
app.get('/api/recurring', checkAuth, (req, res) => res.json(safeRead(RECURRING_FILE)));
app.post('/api/recurring/add', checkAuth, (req, res) => {
    const rec = safeRead(RECURRING_FILE);
    rec.push({ id: Date.now(), ...req.body });
    safeWrite(RECURRING_FILE, rec);
    res.json({ success: true });
});

// Scheduled List
app.get('/api/scheduled', checkAuth, (req, res) => res.json(safeRead(SCHEDULE_FILE)));
app.delete('/api/scheduled/:index', checkAuth, (req, res) => {
    const tasks = safeRead(SCHEDULE_FILE);
    tasks.splice(req.params.index, 1);
    safeWrite(SCHEDULE_FILE, tasks);
    res.json({ success: true });
});

// Health check for Koyeb
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
client.login(DISCORD_TOKEN);
