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

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// --- EXPRESS APP SETUP ---
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fix for Favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health Check / Wake up endpoint
app.get('/', (req, res) => {
    res.send(`Bot Status: ${client.isReady() ? 'ONLINE ✅' : 'CONNECTING ⏳'}`);
});

// --- API ROUTES ---

// 1. Get Channels (Optimized for speed)
app.get('/api/channels', (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!client.isReady()) {
        return res.status(503).json({ error: 'Bot is waking up...' });
    }

    try {
        const channels = [];
        // Use cache only for instant response to avoid 504 timeouts
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                if (channel.type === ChannelType.GuildText && 
                    channel.permissionsFor(client.user)?.has('SendMessages')) {
                    channels.push({
                        id: channel.id,
                        name: `${guild.name} - #${channel.name}`
                    });
                }
            });
        });
        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. Send Video (Fire-and-Forget to prevent Gateway Timeouts)
app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const authHeader = req.headers.authorization;
    const { channelId, title } = req.body;
    const files = req.files;

    const cleanupFiles = (f) => { if (f) f.forEach(file => fs.unlink(file.path, () => {})); };

    if (authHeader !== DASHBOARD_PASSWORD || !client.isReady()) {
        cleanupFiles(files);
        return res.status(403).json({ error: 'Forbidden or Bot Offline' });
    }

    // RESPOND IMMEDIATELY to prevent the 504 error
    res.json({ success: true, message: 'Upload received! Processing in background...' });

    // Handle the Discord upload in the background
    (async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');

            const attachments = files.map(file => ({
                attachment: file.path,
                name: file.originalname
            }));

            await channel.send({
                content: `**${title || 'New Video Upload'}**`,
                files: attachments
            });
            console.log(`Successfully sent videos to ${channel.name}`);
        } catch (error) {
            console.error('Background Upload Failed:', error);
        } finally {
            cleanupFiles(files);
        }
    })();
});

// Anti-Crash logic
process.on('unhandledRejection', (reason) => console.log('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.log('Uncaught Exception:', err));

// --- INITIALIZATION ---
client.once('ready', () => console.log(`Discord Bot logged in as ${client.user.tag}`));
client.login(DISCORD_TOKEN);

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Increase server timeouts for large file handling
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
