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

if (!DISCORD_TOKEN) {
    console.error("CRITICAL ERROR: DISCORD_TOKEN is missing in environment variables.");
    process.exit(1);
}

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
    const status = client.isReady() ? 'ONLINE ✅' : 'CONNECTING ⏳';
    res.send(`Bot Status: ${status} | Ping: ${client.ws.ping}ms`);
});

// --- API ROUTES ---

// 1. Get Channels
app.get('/api/channels', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!client.isReady()) {
        // Attempt to trigger a login retry if stuck
        console.log("API access attempted while bot is offline. Checking connection...");
        return res.status(503).json({ error: 'Bot is waking up... Please wait.' });
    }

    try {
        const channels = [];
        
        // Force a fetch if cache is surprisingly empty (Cold Boot fix)
        if (client.guilds.cache.size === 0) {
            console.log("Cache empty, forcing guild fetch...");
            await client.guilds.fetch();
        }

        client.guilds.cache.forEach(guild => {
            if (!guild) return;
            guild.channels.cache.forEach(channel => {
                if (channel && channel.type === ChannelType.GuildText && 
                    channel.permissionsFor(client.user)?.has('SendMessages')) {
                    channels.push({
                        id: channel.id,
                        name: `${guild.name} - #${channel.name}`
                    });
                }
            });
        });
        
        // Sort channels alphabetically for better UX
        channels.sort((a, b) => a.name.localeCompare(b.name));
        res.json(channels);
    } catch (error) {
        console.error("Error fetching channels:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. Send Video
app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const authHeader = req.headers.authorization;
    const { channelId, title } = req.body;
    const files = req.files;

    const cleanupFiles = (f) => { if (f) f.forEach(file => fs.unlink(file.path, () => {})); };

    if (authHeader !== DASHBOARD_PASSWORD || !client.isReady()) {
        cleanupFiles(files);
        return res.status(403).json({ error: 'Forbidden or Bot Offline' });
    }

    res.json({ success: true, message: 'Upload received! Processing in background...' });

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

// --- ROBUST LOGIN LOGIC ---
const startBot = async () => {
    try {
        console.log("Attempting to log in...");
        await client.login(DISCORD_TOKEN);
    } catch (error) {
        console.error("Login Failed:", error.message);
        console.log("Retrying in 5 seconds...");
        setTimeout(startBot, 5000);
    }
};

client.once('ready', () => console.log(`Discord Bot logged in as ${client.user.tag}`));

// Auto-Reconnect if connection drops
client.on('error', error => {
    console.error("Discord Client Error:", error);
    // Discord.js auto-reconnects, but if it fails completely, we can restart process
});

// Anti-Crash logic
process.on('unhandledRejection', (reason) => console.log('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.log('Uncaught Exception:', err));

// Start Server FIRST, then Bot
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    startBot(); // Start bot login after server is up
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
