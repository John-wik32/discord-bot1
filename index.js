const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';

// File paths
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
    schedule: path.join(DATA_DIR, 'schedule.json'),
    history: path.join(DATA_DIR, 'history.json'),
    suggestions: path.join(DATA_DIR, 'suggestions.json'),
    library: path.join(DATA_DIR, 'library.json'),
    templates: path.join(DATA_DIR, 'templates.json'),
};

// Ensure all files exist
Object.values(FILES).forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, file.includes('history') ? '{"posts":[]}' : '[]');
    }
});

// Safe read/write
const readFile = (file) => {
    try {
        const data = fs.readFileSync(file, 'utf-8');
        return JSON.parse(data);
    } catch {
        return file.includes('history') ? { posts: [] } : [];
    }
};

const writeFile = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Multer config
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
const auth = (req, res, next) => {
    if (req.headers['authorization'] !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
};

// Discord Client
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.once('ready', () => {
    console.log(`✓ Bot Online: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    
    if (msg.content.startsWith('!suggest')) {
        const text = msg.content.slice(9).trim();
        if (!text) return msg.reply('Usage: `!suggest idea, details`');
        
        const [idea, ...rest] = text.split(',');
        const suggestions = readFile(FILES.suggestions);
        suggestions.push({
            id: Date.now(),
            idea: idea.trim(),
            details: rest.join(',').trim(),
            userName: msg.author.username,
            createdAt: new Date().toISOString()
        });
        writeFile(FILES.suggestions, suggestions);
        msg.reply(`✓ Suggestion saved: **${idea.trim()}**`);
    }
});

// Routes
app.get('/health', (req, res) => res.json({ status: 'ok', bot: client.user ? 'online' : 'offline' }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/channels', auth, (req, res) => {
    const channels = [];
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.forEach(ch => {
            if (ch.type === 0) {
                channels.push({
                    id: ch.id,
                    name: `${guild.name} - #${ch.name}`,
                    guildId: guild.id
                });
            }
        });
    });
    res.json(channels);
});

// Send post
app.post('/api/post', auth, upload.array('mediaFile', 5), async (req, res) => {
    try {
        const { channelId, postTitle, scheduleTime, videoUrl } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Channel required' });

        // Scheduling
        if (scheduleTime) {
            const schedule = readFile(FILES.schedule);
            schedule.push({
                id: Date.now(),
                channelId,
                postTitle: postTitle || '',
                videoUrl: videoUrl || '',
                time: scheduleTime,
                mediaFiles: req.files ? req.files.map(f => ({
                    name: f.originalname,
                    buffer: f.buffer.toString('base64')
                })) : [],
                createdAt: new Date().toISOString()
            });
            writeFile(FILES.schedule, schedule);
            return res.json({ success: true, message: 'Scheduled!' });
        }

        // Send immediately
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Channel not found' });

        const options = { content: postTitle || '' };
        if (videoUrl) options.content += `\n${videoUrl}`;
        if (req.files && req.files.length > 0) {
            options.files = req.files.map(f => new AttachmentBuilder(f.buffer, { name: f.originalname }));
        }

        await channel.send(options);

        // Save to history
        const history = readFile(FILES.history);
        history.posts.push({
            title: postTitle,
            time: new Date().toISOString(),
            channelId
        });
        writeFile(FILES.history, history);

        res.json({ success: true, message: 'Sent!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Scheduler runner
async function runScheduler() {
    const schedule = readFile(FILES.schedule);
    const now = new Date();
    const remaining = [];

    for (const task of schedule) {
        const taskTime = new Date(task.time);
        if (taskTime <= now) {
            try {
                const channel = await client.channels.fetch(task.channelId);
                const options = { content: task.postTitle || '' };
                if (task.videoUrl) options.content += `\n${task.videoUrl}`;
                if (task.mediaFiles && task.mediaFiles.length > 0) {
                    options.files = task.mediaFiles.map(m => 
                        new AttachmentBuilder(Buffer.from(m.buffer, 'base64'), { name: m.name })
                    );
                }
                await channel.send(options);
                console.log(`✓ Posted: ${task.postTitle}`);
            } catch (err) {
                console.error('Post failed:', err.message);
                remaining.push(task);
            }
        } else {
            remaining.push(task);
        }
    }
    writeFile(FILES.schedule, remaining);
}

setInterval(runScheduler, 30000);

// Get scheduled posts
app.get('/api/scheduled', auth, (req, res) => {
    res.json(readFile(FILES.schedule));
});

// Delete scheduled post
app.delete('/api/scheduled/:id', auth, (req, res) => {
    let schedule = readFile(FILES.schedule);
    schedule = schedule.filter(s => s.id != req.params.id);
    writeFile(FILES.schedule, schedule);
    res.json({ success: true });
});

// Suggestions
app.post('/api/suggestions', (req, res) => {
    const { idea, details, userName } = req.body;
    if (!idea) return res.status(400).json({ error: 'Idea required' });
    
    const suggestions = readFile(FILES.suggestions);
    suggestions.push({
        id: Date.now(),
        idea,
        details: details || '',
        userName: userName || 'Anonymous',
        createdAt: new Date().toISOString()
    });
    writeFile(FILES.suggestions, suggestions);
    res.json({ success: true, message: 'Thanks for the suggestion!' });
});

app.get('/api/suggestions', auth, (req, res) => {
    res.json(readFile(FILES.suggestions));
});

app.delete('/api/suggestions/:id', auth, (req, res) => {
    let suggestions = readFile(FILES.suggestions);
    suggestions = suggestions.filter(s => s.id != req.params.id);
    writeFile(FILES.suggestions, suggestions);
    res.json({ success: true });
});

// History
app.get('/api/history', auth, (req, res) => {
    const history = readFile(FILES.history);
    res.json(history.posts || []);
});

// Library
app.get('/api/library', auth, (req, res) => res.json(readFile(FILES.library)));
app.post('/api/library', auth, upload.single('mediaFile'), (req, res) => {
    const library = readFile(FILES.library);
    library.push({
        id: Date.now(),
        title: req.body.title,
        category: req.body.category || '',
        videoUrl: req.body.videoUrl || ''
    });
    writeFile(FILES.library, library);
    res.json({ success: true });
});

// Templates
app.get('/api/templates', auth, (req, res) => res.json(readFile(FILES.templates)));
app.post('/api/templates', auth, (req, res) => {
    const templates = readFile(FILES.templates);
    templates.push({
        id: Date.now(),
        name: req.body.name,
        before: req.body.before || '',
        after: req.body.after || ''
    });
    writeFile(FILES.templates, templates);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Server on port ${PORT}`);
});

client.login(DISCORD_TOKEN);
