require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https'); // Used for self-pinging

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// --- DISCORD CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// --- EXPRESS APP SETUP ---
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. FAVICON FIX (Stops the 404 error) ---
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- 2. KEEP ALIVE ENDPOINT (For Uptime Robots) ---
app.get('/', (req, res) => {
    res.send('Bot is running! Go to /index.html to use the dashboard.');
});

// --- ROUTES ---

// Get available channels
app.get('/api/channels', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                if (channel.type === ChannelType.GuildText && channel.permissionsFor(client.user).has('SendMessages')) {
                    channels.push({
                        id: channel.id,
                        name: `${guild.name} - #${channel.name}`
                    });
                }
            });
        });
        res.json(channels);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Send Video
app.post('/api/send', upload.array('videos', 5), async (req, res) => {
    const authHeader = req.headers.authorization;
    
    const cleanupFiles = (files) => {
        if (!files) return;
        files.forEach(file => fs.unlink(file.path, () => {}));
    };

    if (authHeader !== DASHBOARD_PASSWORD) {
        cleanupFiles(req.files);
        return res.status(401).json({ error: 'Invalid Password' });
    }

    const { channelId, title } = req.body;
    const files = req.files;

    if (!channelId || !files || files.length === 0) {
        cleanupFiles(files);
        return res.status(400).json({ error: 'Missing channel or files' });
    }

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

        res.json({ success: true, message: 'Videos sent successfully!' });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send to Discord.' });
    } finally {
        cleanupFiles(files);
    }
});

// --- 3. ANTI-CRASH (Prevents bot from dying on small errors) ---
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
    // Do not exit the process
});

process.on('uncaughtException', (err) => {
    console.log('Uncaught Exception:', err);
    // Do not exit the process
});

// --- INITIALIZATION ---
client.once('ready', () => {
    console.log(`Discord Bot logged in as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);

app.listen(PORT, () => {
    console.log(`Dashboard running on port ${PORT}`);
});
