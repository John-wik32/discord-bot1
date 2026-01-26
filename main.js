require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// --- DISCORD CLIENT (SAFE MODE) ---
// Removed "MessageContent" to prevent startup crashes
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// --- EXPRESS APP ---
const app = express();

// Only allow video files
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Only video files are allowed!'), false);
    }
};

const upload = multer({ dest: 'uploads/', fileFilter: fileFilter });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Keep Alive & Status
app.get('/', (req, res) => {
    res.send(`Bot Status: ${client.isReady() ? 'ONLINE ✅' : 'OFFLINE (Check Logs) ❌'}`);
});
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- ROUTES ---

// 1. Get Channels
app.get('/api/channels', (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    
    // If bot is not ready, we send 503.
    if (!client.isReady()) {
        console.log("Dashboard requested channels, but bot is not ready yet.");
        return res.status(503).json({ error: 'Bot is still starting up...' });
    }

    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                // Check if it's a text channel and we can write to it
                if (channel.type === ChannelType.GuildText && 
                    channel.permissionsFor(client.user)?.has('SendMessages')) {
                    channels.push({ id: channel.id, name: `${guild.name} - #${channel.name}` });
                }
            });
        });
        res.json(channels);
    } catch (error) {
        console.error("Channel Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. Send Video
app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const { channelId, title, description, mention } = req.body;
    const files = req.files;
    
    const cleanup = (f) => { if (f) f.forEach(file => fs.unlink(file.path, () => {})); };

    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        cleanup(files);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!client.isReady()) {
        cleanup(files);
        return res.status(503).json({ error: 'Bot is offline.' });
    }

    // Immediate success response to dashboard
    res.json({ success: true, message: 'Upload queued!' });

    // Background Process
    (async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');

            // Build Message
            let contentText = `**${title}**`;
            if (mention === 'everyone') contentText = `@everyone\n${contentText}`;
            else if (mention === 'here') contentText = `@here\n${contentText}`;
            
            if (description) contentText += `\n${description}`;

            const attachments = files.map(f => ({ attachment: f.path, name: f.originalname }));

            const message = await channel.send({
                content: contentText,
                files: attachments
            });

            // React (might fail depending on permissions, but safe to ignore)
            try { await message.react('🔥'); await message.react('👍'); } catch (e) {}

            console.log(`Posted to ${channel.name}`);
        } catch (error) {
            console.error('Upload Error:', error);
        } finally {
            cleanup(files);
        }
    })();
});

// 3. UNDO BUTTON
app.post('/api/delete-last', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const { channelId } = req.body;

    if (!client.isReady()) return res.status(503).json({ error: 'Bot is offline.' });

    try {
        const channel = await client.channels.fetch(channelId);
        const messages = await channel.messages.fetch({ limit: 20 });
        const lastBotMessage = messages.find(m => m.author.id === client.user.id);

        if (lastBotMessage) {
            await lastBotMessage.delete();
            return res.json({ success: true, message: 'Deleted last post.' });
        } else {
            return res.status(404).json({ error: 'No recent message found.' });
        }
    } catch (error) {
        console.error("Delete Error:", error);
        return res.status(500).json({ error: 'Failed to delete' });
    }
});

// --- ERROR LOGGING ---
client.on('error', (err) => {
    console.error("Discord Client Error:", err);
});

// --- START ---
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.login(DISCORD_TOKEN);

const server = app.listen(PORT, () => console.log(`Online on ${PORT}`));
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
