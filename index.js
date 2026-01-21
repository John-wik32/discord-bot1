const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123test';

// Debug: Log the admin password on startup
console.log('🔐 Admin password configured:', ADMIN_PASSWORD ? 'YES (length: ' + ADMIN_PASSWORD.length + ')' : 'NOT SET');
console.log('🤖 Discord token configured:', DISCORD_TOKEN ? 'YES' : 'NO');

// File paths
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure files exist
if (!fs.existsSync(SCHEDULE_FILE)) {
    fs.writeFileSync(SCHEDULE_FILE, '[]');
}
if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, '[]');
}

// Safe read/write
const readFile = (file) => {
    try {
        const data = fs.readFileSync(file, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
};

const writeFile = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Multer config - allow multiple files
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
const auth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    // Debug logging
    console.log('🔑 Auth attempt - Received:', authHeader ? '***' : 'none');
    
    if (!authHeader) {
        console.log('❌ No authorization header');
        return res.status(401).json({ error: 'No authorization header' });
    }
    
    if (authHeader !== ADMIN_PASSWORD) {
        console.log('❌ Password mismatch');
        console.log('   Expected:', ADMIN_PASSWORD);
        console.log('   Received:', authHeader);
        return res.status(403).json({ error: 'Invalid password' });
    }
    
    console.log('✅ Auth successful');
    next();
};

// Discord Client
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.once('ready', () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
    console.log(`✅ Servers: ${client.guilds.cache.size}`);
});

// Public health check (no auth required)
app.get('/health', (req, res) => res.json({ 
    status: 'ok', 
    bot: client.user ? 'online' : 'offline',
    authConfigured: !!ADMIN_PASSWORD,
    time: new Date().toISOString()
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get channels
app.get('/api/channels', auth, (req, res) => {
    console.log('📡 Fetching channels...');
    const channels = [];
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.forEach(ch => {
            if (ch.type === 0) { // Text channels only
                channels.push({
                    id: ch.id,
                    name: `${guild.name} - #${ch.name}`,
                    guildId: guild.id
                });
            }
        });
    });
    console.log(`📡 Found ${channels.length} channels`);
    res.json(channels);
});

// Send post immediately
app.post('/api/send', auth, upload.array('mediaFiles', 10), async (req, res) => {
    console.log('📤 Sending post...');
    try {
        const { channelId, message, videoUrl } = req.body;
        
        if (!channelId) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }

        // Validate at least one content type
        if (!message && !videoUrl && (!req.files || req.files.length === 0)) {
            return res.status(400).json({ error: 'Add message, video URL, or media files' });
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return res.status(400).json({ error: 'Channel not found' });
        }

        // Prepare message content
        let content = message || '';
        if (videoUrl) {
            content += (content ? '\n' : '') + videoUrl;
        }

        // Prepare attachments
        const options = { content };
        if (req.files && req.files.length > 0) {
            options.files = req.files.map(f => 
                new AttachmentBuilder(f.buffer, { name: f.originalname })
            );
            console.log(`📎 Attaching ${req.files.length} file(s)`);
        }

        // Send to Discord
        const sentMessage = await channel.send(options);
        console.log('✅ Post sent to Discord');

        // Save to history
        const history = readFile(HISTORY_FILE);
        history.push({
            id: sentMessage.id,
            channelId,
            message: message || '',
            videoUrl: videoUrl || '',
            filesCount: req.files ? req.files.length : 0,
            timestamp: new Date().toISOString(),
            sentAt: new Date().toISOString()
        });
        writeFile(HISTORY_FILE, history);

        res.json({ 
            success: true, 
            message: 'Post sent successfully!',
            messageId: sentMessage.id
        });
    } catch (err) {
        console.error('❌ Send error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Schedule post
app.post('/api/schedule', auth, upload.array('mediaFiles', 10), async (req, res) => {
    console.log('⏰ Scheduling post...');
    try {
        const { channelId, message, videoUrl, scheduleTime } = req.body;
        
        if (!channelId) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }

        if (!scheduleTime) {
            return res.status(400).json({ error: 'Schedule time is required' });
        }

        // Validate schedule time is in the future
        const scheduledDate = new Date(scheduleTime);
        const now = new Date();
        if (scheduledDate <= now) {
            return res.status(400).json({ error: 'Schedule time must be in the future' });
        }

        // Validate at least one content type
        if (!message && !videoUrl && (!req.files || req.files.length === 0)) {
            return res.status(400).json({ error: 'Add message, video URL, or media files' });
        }

        // Save scheduled post
        const schedule = readFile(SCHEDULE_FILE);
        const scheduledPost = {
            id: Date.now().toString(),
            channelId,
            message: message || '',
            videoUrl: videoUrl || '',
            scheduleTime: scheduledDate.toISOString(),
            files: req.files ? req.files.map(f => ({
                name: f.originalname,
                buffer: f.buffer.toString('base64'),
                type: f.mimetype
            })) : [],
            createdAt: new Date().toISOString(),
            status: 'scheduled'
        };

        schedule.push(scheduledPost);
        writeFile(SCHEDULE_FILE, schedule);

        console.log(`✅ Post scheduled for ${scheduledDate.toLocaleString()}`);

        res.json({ 
            success: true, 
            message: 'Post scheduled successfully!',
            scheduledFor: scheduledDate.toLocaleString(),
            postId: scheduledPost.id
        });
    } catch (err) {
        console.error('❌ Schedule error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get scheduled posts
app.get('/api/scheduled', auth, (req, res) => {
    const schedule = readFile(SCHEDULE_FILE);
    console.log(`📋 Returning ${schedule.length} scheduled posts`);
    res.json(schedule);
});

// Delete scheduled post
app.delete('/api/scheduled/:id', auth, (req, res) => {
    console.log(`🗑️ Deleting scheduled post ${req.params.id}`);
    const schedule = readFile(SCHEDULE_FILE);
    const filtered = schedule.filter(post => post.id !== req.params.id);
    writeFile(SCHEDULE_FILE, filtered);
    res.json({ success: true, message: 'Scheduled post deleted' });
});

// Get history
app.get('/api/history', auth, (req, res) => {
    const history = readFile(HISTORY_FILE);
    console.log(`📜 Returning ${history.length} history items`);
    res.json(history);
});

// Scheduler runner - checks every 30 seconds
async function runScheduler() {
    const schedule = readFile(SCHEDULE_FILE);
    const now = new Date();
    const remaining = [];
    const processed = [];

    console.log(`⏰ Checking ${schedule.length} scheduled posts...`);

    for (const task of schedule) {
        const taskTime = new Date(task.scheduleTime);
        
        if (taskTime <= now) {
            try {
                console.log(`🚀 Sending scheduled post: ${task.id}`);
                const channel = await client.channels.fetch(task.channelId);
                if (!channel) {
                    console.error(`❌ Channel ${task.channelId} not found`);
                    remaining.push(task);
                    continue;
                }

                // Prepare content
                let content = task.message || '';
                if (task.videoUrl) {
                    content += (content ? '\n' : '') + task.videoUrl;
                }

                // Prepare attachments
                const options = { content };
                if (task.files && task.files.length > 0) {
                    options.files = task.files.map(f => 
                        new AttachmentBuilder(Buffer.from(f.buffer, 'base64'), { 
                            name: f.name 
                        })
                    );
                }

                // Send to Discord
                await channel.send(options);
                console.log(`✅ Posted scheduled message: ${task.message || '(no message)'}`);

                // Save to history
                const history = readFile(HISTORY_FILE);
                history.push({
                    id: task.id,
                    channelId: task.channelId,
                    message: task.message || '',
                    videoUrl: task.videoUrl || '',
                    filesCount: task.files ? task.files.length : 0,
                    timestamp: task.scheduleTime,
                    sentAt: new Date().toISOString(),
                    scheduled: true
                });
                writeFile(HISTORY_FILE, history);

                processed.push(task.id);
            } catch (err) {
                console.error('❌ Failed to send scheduled post:', err.message);
                remaining.push(task);
            }
        } else {
            remaining.push(task);
        }
    }

    // Update schedule file with remaining posts
    if (processed.length > 0) {
        writeFile(SCHEDULE_FILE, remaining);
        console.log(`✅ Processed ${processed.length} scheduled posts`);
    }
}

// Run scheduler every 30 seconds
setInterval(runScheduler, 30000);

// Test endpoint
app.post('/api/test', auth, async (req, res) => {
    console.log('🧪 Test request...');
    try {
        const { channelId, message } = req.body;
        
        if (!channelId) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return res.status(400).json({ error: 'Channel not found' });
        }

        // Send test message
        await channel.send({
            content: `✅ Test message from bot!\n${message || 'Bot is working correctly!'}`
        });

        console.log('✅ Test message sent');

        res.json({ 
            success: true, 
            message: 'Test message sent successfully!' 
        });
    } catch (err) {
        console.error('❌ Test error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Debug endpoint to check auth
app.get('/api/debug-auth', (req, res) => {
    const authHeader = req.headers['authorization'];
    const matches = authHeader === ADMIN_PASSWORD;
    
    console.log('🔍 Debug auth check:');
    console.log('   Received:', authHeader ? '***' : 'none');
    console.log('   Expected:', ADMIN_PASSWORD ? '***' : 'none');
    console.log('   Matches:', matches);
    
    res.json({
        receivedAuth: authHeader ? '***' : 'none',
        expectedAuth: ADMIN_PASSWORD ? '***' : 'none',
        matches: matches,
        authHeaderLength: authHeader ? authHeader.length : 0,
        expectedLength: ADMIN_PASSWORD ? ADMIN_PASSWORD.length : 0,
        serverTime: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('========================================');
});

// Login to Discord with retry
async function loginToDiscord() {
    try {
        console.log('🔗 Logging into Discord...');
        await client.login(DISCORD_TOKEN);
    } catch (err) {
        console.error('❌ Failed to login to Discord:', err.message);
        console.log('🔄 Retrying in 10 seconds...');
        setTimeout(loginToDiscord, 10000);
    }
}

// Start Discord login
loginToDiscord();
