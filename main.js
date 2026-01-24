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

// --- EXPRESS APP ---
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Keep Alive / Health Check
app.get('/', (req, res) => {
    res.send(`Bot Status: ${client.isReady() ? 'ONLINE ✅' : 'STARTING ⏳'}`);
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- ROUTES ---

// Get Channels (With "Bot Ready" Check)
app.get('/api/channels', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // CRITICAL FIX: Check if bot is ready
    if (!client.isReady()) {
        return res.status(503).json({ error: 'Bot is waking up... try again in 10 seconds.' });
    }

    try {
        const channels = [];
        // Refresh cache to ensure we see new channels
        await client.guilds.fetch(); 
        
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                // Check for Text Channels and Write Permissions
                if (channel.type === ChannelType.GuildText && 
                    channel.permissionsFor(client.user)?.has('SendMessages')) {
                    channels.push({
                        id: channel.id,
                        name: `${guild.name} - #${channel.name}`
                    });
                }
            });
        });
        
        if (channels.length === 0) {
             return res.status(404).json({ error: 'No channels found. Is the bot in a server?' });
        }

        res.json(channels);
    } catch (error) {
        console.error("Channel Fetch Error:", error);
        res.status(500).json({ error: 'Failed to fetch channels. Check bot logs.' });
    }
});

// Send Video (Fire & Forget)
app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const authHeader = req.headers.authorization;
    const { channelId, title } = req.body;
    const files = req.files;

    const cleanupFiles = (f) => { if (f) f.forEach(file => fs.unlink(file.path, () => {})); };

    if (authHeader !== DASHBOARD_PASSWORD) {
        cleanupFiles(files);
        return res.status(401).json({ error: 'Invalid Password' });
    }

    if (!channelId || !files || files.length === 0) {
        cleanupFiles(files);
        return res.status(400).json({ error: 'Missing data' });
    }

    if (!client.isReady()) {
        cleanupFiles(files);
        return res.status(503).json({ error: 'Bot is offline. Please wait.' });
    }

    // Immediate Response
    res.json({ success: true, message: 'Processing upload...' });

    // Background Process
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
            console.log(`Sent videos to ${channel.name}`);
        } catch (error) {
            console.error('Upload Error:', error);
        } finally {
            cleanupFiles(files);
        }
    })();
});

// --- START ---
client.once('ready', () => {
    console.log(`✅ Discord Bot logged in as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
