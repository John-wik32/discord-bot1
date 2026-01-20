const { Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const https = require('https');

const app = express();

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

// --- CONFIG ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'defaultPassword';
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');
const QUEUE_FILE = path.join(__dirname, 'queue.json');
const LIBRARY_FILE = path.join(__dirname, 'library.json');
const TEMPLATES_FILE = path.join(__dirname, 'templates.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

// Initialize files
[SCHEDULE_FILE, QUEUE_FILE, LIBRARY_FILE, TEMPLATES_FILE, HISTORY_FILE].forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(file.includes('templates') ? [] : {}));
    }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

// --- UTILITIES ---
const saveHistory = (channelId, videoTitle, url, hasMedia, scheduledFor = null) => {
    try {
        const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8') || '{}');
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
    } catch (err) {
        console.error("History save error:", err);
    }
};

const getYouTubeThumbnail = (url) => {
    try {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    } catch (err) {}
    return null;
};

// --- SCHEDULER LOGIC ---
let schedulerActive = false;

const checkAndSendSchedules = async () => {
    if (schedulerActive || !client.user) return;
    schedulerActive = true;
    
    try {
        const data = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
        let tasks = JSON.parse(data || '[]');
        const now = Date.now();
        const remainingTasks = [];

        for (const task of tasks) {
            const taskTime = new Date(task.time).getTime();
            
            if (taskTime <= now) {
                try {
                    const channel = await client.channels.fetch(task.channelId);
                    if (!channel) continue;

                    const options = { content: task.content || '' };
                    
                    if (task.mediaBuffer && task.mediaFileName) {
                        options.files = [new AttachmentBuilder(Buffer.from(task.mediaBuffer, 'base64'), { name: task.mediaFileName })];
                    } else if (task.videoUrl) {
                        options.content += `\n${task.videoUrl}`;
                    }

                    await channel.send(options);
                    console.log(`✓ Scheduled post sent to #${channel.name}`);
                    saveHistory(task.channelId, task.content, task.videoUrl || task.mediaFileName, !!task.mediaBuffer);
                } catch (err) {
                    console.error("Scheduled post failed:", err.message);
                    remainingTasks.push(task);
                }
            } else {
                remainingTasks.push(task);
            }
        }
        
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(remainingTasks, null, 2));
    } catch (err) {
        console.error("Scheduler error:", err);
    } finally {
        schedulerActive = false;
    }
};

// Check queue for auto-play
const processQueue = async () => {
    try {
        const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8') || '{}');
        
        for (const guildId in queue) {
            const items = queue[guildId].filter(item => item.status === 'pending');
            
            if (items.length > 0) {
                const nextItem = items[0];
                try {
                    const channel = await client.channels.fetch(nextItem.channelId);
                    if (!channel) continue;

                    const options = { content: nextItem.message || nextItem.title };
                    
                    if (nextItem.mediaBuffer) {
                        options.files = [new AttachmentBuilder(Buffer.from(nextItem.mediaBuffer, 'base64'), { name: nextItem.fileName })];
                    } else if (nextItem.videoUrl) {
                        options.content += `\n${nextItem.videoUrl}`;
                    }

                    await channel.send(options);
                    nextItem.status = 'completed';
                    nextItem.sentAt = new Date().toISOString();
                    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
                    console.log(`✓ Queue item processed for guild ${guildId}`);
                } catch (err) {
                    console.error("Queue processing error:", err);
                }
            }
        }
    } catch (err) {
        console.error("Queue error:", err);
    }
};

setInterval(checkAndSendSchedules, 30000);
setInterval(processQueue, 60000);

// --- AUTH MIDDLEWARE ---
const checkAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
};

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', bot: client.user ? 'Online' : 'Offline' }));

app.get('/api/channels', checkAuth, async (req, res) => {
    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(ch => {
                if (ch.type === 0 && ch.isSendable?.()) {
                    channels.push({ 
                        id: ch.id, 
                        name: `${guild.name} - #${ch.name}`,
                        guildId: guild.id,
                        guildName: guild.name
                    });
                }
            });
        });
        res.json(channels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SEND IMMEDIATE POST
app.post('/api/post', checkAuth, upload.single('mediaFile'), async (req, res) => {
    try {
        const { channelId, postTitle, scheduleTime, videoUrl, templateId } = req.body;

        if (!channelId) return res.status(400).json({ error: 'Channel ID required' });

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Channel not found' });

        const content = postTitle || '';

        if (scheduleTime && scheduleTime.trim() !== '') {
            const scheduledDate = new Date(scheduleTime);
            if (scheduledDate <= new Date()) {
                return res.status(400).json({ error: 'Schedule time must be in future' });
            }

            const tasks = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8') || '[]');
            
            let mediaBuffer = null, mediaFileName = null;
            if (req.file) {
                mediaBuffer = req.file.buffer.toString('base64');
                mediaFileName = req.file.originalname;
            }

            tasks.push({
                channelId,
                content,
                time: scheduleTime,
                mediaBuffer,
                mediaFileName,
                videoUrl: videoUrl || null,
                createdAt: new Date().toISOString()
            });

            fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks, null, 2));
            return res.json({ success: true, scheduled: true, scheduledFor: scheduleTime });
        }

        // Send immediately
        const options = { content };
        if (req.file) {
            options.files = [new AttachmentBuilder(req.file.buffer, { name: req.file.originalname })];
        } else if (videoUrl) {
            options.content += `\n${videoUrl}`;
        }

        await channel.send(options);
        saveHistory(channelId, content, videoUrl || null, !!req.file);
        res.json({ success: true, scheduled: false });
    } catch (err) {
        console.error("Post error:", err);
        res.status(500).json({ error: err.message });
    }
});

// QUEUE ENDPOINTS
app.post('/api/queue/add', checkAuth, upload.single('mediaFile'), async (req, res) => {
    try {
        const { channelId, title, guildId, message, videoUrl } = req.body;
        const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8') || '{}');

        if (!queue[guildId]) queue[guildId] = [];

        let mediaBuffer = null, fileName = null;
        if (req.file) {
            mediaBuffer = req.file.buffer.toString('base64');
            fileName = req.file.originalname;
        }

        queue[guildId].push({
            id: Date.now(),
            channelId,
            title,
            message: message || '',
            mediaBuffer,
            fileName,
            videoUrl: videoUrl || null,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
        res.json({ success: true, queueLength: queue[guildId].length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/queue/:guildId', checkAuth, (req, res) => {
    try {
        const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8') || '{}');
        const items = queue[req.params.guildId] || [];
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/queue/:guildId/:id', checkAuth, (req, res) => {
    try {
        const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8') || '{}');
        const items = queue[req.params.guildId] || [];
        queue[req.params.guildId] = items.filter(i => i.id != req.params.id);
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LIBRARY ENDPOINTS
app.post('/api/library/save', checkAuth, upload.single('mediaFile'), async (req, res) => {
    try {
        const { title, category, videoUrl } = req.body;
        const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8') || '{}');

        if (!library.videos) library.videos = [];

        let mediaBuffer = null, fileName = null;
        if (req.file) {
            mediaBuffer = req.file.buffer.toString('base64');
            fileName = req.file.originalname;
        }

        library.videos.push({
            id: Date.now(),
            title,
            category: category || 'Uncategorized',
            mediaBuffer,
            fileName,
            videoUrl: videoUrl || null,
            thumbnail: getYouTubeThumbnail(videoUrl),
            savedAt: new Date().toISOString()
        });

        fs.writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2));
        res.json({ success: true, id: library.videos[library.videos.length - 1].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/library', checkAuth, (req, res) => {
    try {
        const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8') || '{}');
        const videos = library.videos || [];
        const sanitized = videos.map(v => ({
            id: v.id,
            title: v.title,
            category: v.category,
            hasMedia: !!v.mediaBuffer,
            videoUrl: v.videoUrl,
            thumbnail: v.thumbnail,
            savedAt: v.savedAt
        }));
        res.json(sanitized);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/library/:id', checkAuth, (req, res) => {
    try {
        const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8') || '{}');
        library.videos = (library.videos || []).filter(v => v.id != req.params.id);
        fs.writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TEMPLATES ENDPOINTS
app.post('/api/templates', checkAuth, async (req, res) => {
    try {
        const { name, before, after, category } = req.body;
        let templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8') || '[]');

        templates.push({
            id: Date.now(),
            name,
            before: before || '',
            after: after || '',
            category: category || 'General'
        });

        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
        res.json({ success: true, id: templates[templates.length - 1].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/templates', checkAuth, (req, res) => {
    try {
        const templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8') || '[]');
        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/templates/:id', checkAuth, (req, res) => {
    try {
        let templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8') || '[]');
        templates = templates.filter(t => t.id != req.params.id);
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SCHEDULED ENDPOINTS
app.get('/api/scheduled', checkAuth, (req, res) => {
    try {
        const tasks = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8') || '[]');
        const sanitized = tasks.map(t => ({
            time: t.time,
            content: t.content.substring(0, 100),
            hasMedia: !!t.mediaBuffer,
            createdAt: t.createdAt
        }));
        res.json(sanitized);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/scheduled/:index', checkAuth, (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const tasks = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8') || '[]');
        if (index < 0 || index >= tasks.length) return res.status(400).json({ error: 'Invalid index' });
        tasks.splice(index, 1);
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// HISTORY ENDPOINTS
app.get('/api/history', checkAuth, (req, res) => {
    try {
        const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8') || '{}');
        const entries = (history.entries || []).slice(-50).reverse();
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DISCORD BOT ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

client.once('ready', () => {
    console.log(`✓ Bot Online: ${client.user.tag}`);
    console.log(`✓ Serving ${client.guilds.cache.size} guild(s)`);
});

client.on('error', err => console.error('Discord error:', err));
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});

client.login(DISCORD_TOKEN);
