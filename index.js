const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Configure multer for larger file uploads (Discord max is 25MB)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

// --- CONFIG ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'defaultPassword';
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');

// Initialize Schedule File if missing
if (!fs.existsSync(SCHEDULE_FILE)) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([]));
}

app.use(cors());
app.use(express.json());
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

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
                    if (!channel) {
                        console.error(`Channel ${task.channelId} not found`);
                        continue;
                    }

                    const options = { content: task.content || '' };
                    
                    if (task.mediaBuffer && task.mediaFileName) {
                        options.files = [new AttachmentBuilder(Buffer.from(task.mediaBuffer, 'base64'), { name: task.mediaFileName })];
                    }

                    await channel.send(options);
                    console.log(`✓ Scheduled post sent to #${channel.name}`);
                } catch (err) {
                    console.error("Scheduled post failed:", err.message);
                    remainingTasks.push(task); // Keep failed tasks for retry
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

// Check every 30 seconds for better responsiveness
setInterval(checkAndSendSchedules, 30000);

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
                if (ch.type === 0 && ch.isSendable()) { // Text channels only
                    channels.push({ 
                        id: ch.id, 
                        name: `${guild.name} - #${ch.name}`,
                        guildId: guild.id
                    });
                }
            });
        });
        res.json(channels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/post', checkAuth, upload.single('mediaFile'), async (req, res) => {
    try {
        const { channelId, postTitle, scheduleTime } = req.body;

        if (!channelId) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }

        // Validate channel exists
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return res.status(400).json({ error: 'Channel not found' });
        }

        if (scheduleTime) {
            // Validate datetime
            const scheduledDate = new Date(scheduleTime);
            if (scheduledDate <= new Date()) {
                return res.status(400).json({ error: 'Schedule time must be in the future' });
            }

            const tasks = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8') || '[]');
            
            let mediaBuffer = null;
            let mediaFileName = null;
            
            if (req.file) {
                mediaBuffer = req.file.buffer.toString('base64');
                mediaFileName = req.file.originalname;
            }

            tasks.push({
                channelId,
                content: postTitle || '',
                time: scheduleTime,
                mediaBuffer,
                mediaFileName,
                createdAt: new Date().toISOString()
            });

            fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks, null, 2));
            return res.json({ 
                success: true, 
                scheduled: true,
                scheduledFor: scheduleTime 
            });
        }

        // Send immediately
        const options = { content: postTitle || '' };
        if (req.file) {
            options.files = [new AttachmentBuilder(req.file.buffer, { name: req.file.originalname })];
        }

        await channel.send(options);
        res.json({ success: true, scheduled: false });
    } catch (err) {
        console.error("Post error:", err);
        res.status(500).json({ error: err.message });
    }
});

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
        
        if (index < 0 || index >= tasks.length) {
            return res.status(400).json({ error: 'Invalid index' });
        }

        tasks.splice(index, 1);
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks, null, 2));
        res.json({ success: true });
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
