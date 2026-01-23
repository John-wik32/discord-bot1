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

// --- DISCORD CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// --- EXPRESS APP SETUP ---
const app = express();
const upload = multer({ dest: 'uploads/' }); // Temporary storage for uploads

// Middleware to parse JSON and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES ---

// 1. Get available channels (Protected)
app.get('/api/channels', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Fetch all text channels from all guilds the bot is in
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

// 2. Send Video (Protected)
app.post('/api/send', upload.array('videos', 5), async (req, res) => {
    const authHeader = req.headers.authorization;
    
    // cleanup helper
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
        if (!channel) {
            throw new Error('Channel not found');
        }

        // Prepare attachments
        const attachments = files.map(file => ({
            attachment: file.path,
            name: file.originalname
        }));

        // Send to Discord
        await channel.send({
            content: `**${title || 'New Video Upload'}**`,
            files: attachments
        });

        res.json({ success: true, message: 'Videos sent successfully!' });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send to Discord. Check file size limits or permissions.' });
    } finally {
        // Always clean up temp files
        cleanupFiles(files);
    }
});

// --- INITIALIZATION ---
client.once('ready', () => {
    console.log(`Discord Bot logged in as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);

app.listen(PORT, () => {
    console.log(`Dashboard running on port ${PORT}`);
});
