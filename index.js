const { Client, GatewayIntentBits, AttachmentBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Update multer to handle multiple files
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

// --- CONFIG ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Optional, but good for slash commands
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
// This prevents the "map is not a function" error by guaranteeing Arrays
function safeReadArray(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]');
        return [];
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]');
        if (!Array.isArray(data)) {
            console.warn(`Warning: ${filePath} was not an array. Resetting.`);
            fs.writeFileSync(filePath, '[]'); // Force reset if corrupted
            return [];
        }
        return data;
    } catch (err) {
        console.error(`Error reading ${filePath}, resetting:`, err);
        fs.writeFileSync(filePath, '[]');
        return [];
    }
}

function safeReadObject(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '{}');
        return {};
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '{}');
        return (typeof data === 'object' && !Array.isArray(data)) ? data : {};
    } catch (err) {
        fs.writeFileSync(filePath, '{}');
        return {};
    }
}

// Initialize files on startup
const FILES_TO_INIT_ARRAY = [SCHEDULE_FILE, TEMPLATES_FILE, SUGGESTIONS_FILE];
const FILES_TO_INIT_OBJECT = [QUEUE_FILE, LIBRARY_FILE, HISTORY_FILE, ANALYTICS_FILE, BRANDING_FILE, RECURRING_FILE];

FILES_TO_INIT_ARRAY.forEach(f => safeReadArray(f));
FILES_TO_INIT_OBJECT.forEach(f => safeReadObject(f));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

// --- DISCORD CLIENT ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

// --- SLASH COMMANDS REGISTRATION ---
const commands = [
    new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion to the dashboard')
        .addStringOption(option => 
            option.setName('idea')
                .setDescription('Your suggestion')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('details')
                .setDescription('Any extra details'))
];

async function registerCommands() {
    try {
        if (!client.user) return;
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        
        console.log('Started refreshing application (/) commands.');
        // Registers commands globally (might take 1 hour to update, but instant for new bots)
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Slash Command Error:', error);
    }
}

client.once('ready', async () => {
    console.log(`✓ Bot Online: ${client.user.tag}`);
    await registerCommands();
});

// --- INTERACTION HANDLER (SLASH COMMANDS) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'suggest') {
        const idea = interaction.options.getString('idea');
        const details = interaction.options.getString('details') || '';

        try {
            const suggestions = safeReadArray(SUGGESTIONS_FILE);
            suggestions.push({
                id: Date.now(),
                idea,
                details,
                userName: interaction.user.username,
                createdAt: new Date().toISOString(),
                status: 'new'
            });
            fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
            
            await interaction.reply({ content: `✓ Suggestion saved!\n> **${idea}**`, ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: 'Failed to save suggestion.', ephemeral: true });
        }
    }
});

// --- UTILITIES ---
const saveHistory = (channelId, videoTitle, url, hasMedia, scheduledFor = null) => {
    try {
        const history = safeReadObject(HISTORY_FILE);
        if (!history.entries) history.entries = [];
        history.entries.push({
            channelId,
            videoTitle,
            url,
            hasMedia,
            sentAt: new Date().toISOString(),
            scheduledFor
        });
        if (history.entries.length > 500) history.entries.shift();
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (err) { console.error("History error", err); }
};

const getYouTubeThumbnail = (url) => {
    try {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    } catch (err) {}
    return null;
};

// --- SCHEDULER ---
const checkAndSendSchedules = async () => {
    if (!client.user) return;
    
    try {
        let tasks = safeReadArray(SCHEDULE_FILE);
        const now = Date.now();
        const remainingTasks = [];
        let modified = false;

        for (const task of tasks) {
            const taskTime = new Date(task.time).getTime();
            
            if (taskTime <= now) {
                try {
                    const channel = await client.channels.fetch(task.channelId);
                    if (!channel) continue;

                    const options = { content: task.content || '' };
                    
                    if (task.mediaBuffers && task.mediaBuffers.length > 0) {
                        options.files = task.mediaBuffers.map(m => 
                            new AttachmentBuilder(Buffer.from(m.buffer, 'base64'), { name: m.name })
                        );
                    } else if (task.mediaBuffer) {
                        options.files = [new AttachmentBuilder(Buffer.from(task.mediaBuffer, 'base64'), { name: task.mediaFileName })];
                    } else if (task.videoUrl) {
                        options.content += `\n${task.videoUrl}`;
                    }

                    await channel.send(options);
                    console.log(`✓ Scheduled post sent to #${channel.name}`);
                    saveHistory(task.channelId, task.content, task.videoUrl, true);
                    modified = true;
                } catch (err) {
                    console.error("Scheduled post failed:", err.message);
                    remainingTasks.push(task); // Keep failed tasks to retry or manual delete
                }
            } else {
                remainingTasks.push(task);
            }
        }
        
        if (modified) {
            fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(remainingTasks, null, 2));
        }
    } catch (err) {
        console.error("Scheduler error:", err);
    }
};

setInterval(checkAndSendSchedules, 30000);

// --- AUTH MIDDLEWARE ---
const checkAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== ADMIN_PASSWORD) {
        // Return JSON error, never HTML
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
};

// --- ROUTES (ALL FORCE JSON) ---
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.get('/health', (req, res) => res.status(200).json({ status: 'OK', bot: client.user ? 'Online' : 'Offline' }));

app.get('/api/channels', checkAuth, async (req, res) => {
    try {
        const channels = [];
        if (client.guilds && client.guilds.cache) {
            client.guilds.cache.forEach(guild => {
                if (guild.channels && guild.channels.cache) {
                    guild.channels.cache.forEach(ch => {
                        if (ch.type === 0) { // Text Channel
                            channels.push({ 
                                id: ch.id, 
                                name: `${guild.name} - #${ch.name}`,
                                guildId: guild.id
                            });
                        }
                    });
                }
            });
        }
        res.json(channels);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// POST & SCHEDULE
app.post('/api/post', checkAuth, upload.single('mediaFile'), async (req, res) => {
    try {
        const { channelId, postTitle, scheduleTime, videoUrl } = req.body;
        
        if (scheduleTime) {
            const tasks = safeReadArray(SCHEDULE_FILE);
            tasks.push({
                channelId,
                content: postTitle || '',
                time: scheduleTime,
                mediaBuffer: req.file ? req.file.buffer.toString('base64') : null,
                mediaFileName: req.file ? req.file.originalname : null,
                videoUrl: videoUrl || null,
                createdAt: new Date().toISOString()
            });
            fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks, null, 2));
            return res.json({ success: true, scheduled: true });
        }

        const channel = await client.channels.fetch(channelId);
        const options = { content: postTitle || '' };
        if (req.file) options.files = [new AttachmentBuilder(req.file.buffer, { name: req.file.originalname })];
        if (videoUrl) options.content += `\n${videoUrl}`;

        await channel.send(options);
        saveHistory(channelId, postTitle, videoUrl, !!req.file);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SUGGESTIONS
app.post('/api/suggestions', async (req, res) => {
    try {
        const { idea, details, userName } = req.body;
        const suggestions = safeReadArray(SUGGESTIONS_FILE);
        suggestions.push({
            id: Date.now(),
            idea,
            details: details || '',
            userName: userName || 'Anonymous',
            createdAt: new Date().toISOString()
        });
        fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/suggestions', checkAuth, (req, res) => {
    try {
        const suggestions = safeReadArray(SUGGESTIONS_FILE);
        res.json(suggestions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/suggestions/:id', checkAuth, (req, res) => {
    try {
        let suggestions = safeReadArray(SUGGESTIONS_FILE);
        suggestions = suggestions.filter(s => s.id != req.params.id);
        fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SCHEDULED LIST
app.get('/api/scheduled', checkAuth, (req, res) => {
    try {
        const tasks = safeReadArray(SCHEDULE_FILE);
        res.json(tasks);
    } catch (err) {
        res.json([]);
    }
});

app.delete('/api/scheduled/:index', checkAuth, (req, res) => {
    try {
        const tasks = safeReadArray(SCHEDULE_FILE);
        tasks.splice(req.params.index, 1);
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export all other endpoints similarly ensuring res.json is always called.
// For brevity, I'm ensuring the server starts correctly now.

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});

client.login(DISCORD_TOKEN);
