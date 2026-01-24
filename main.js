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

// 1. Favicon Fix
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 2. Keep Alive
app.get('/', (req, res) => {
    res.send('Bot is online.');
});

// --- ROUTES ---

// Get Channels
app.get('/api/channels', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                if (channel.type === ChannelType.GuildText && channel.permissionsFor(client.user).has('SendMessages')) {
                    channels.push({ id: channel.id, name: `${guild.name} - #${channel.name}` });
                }
            });
        });
        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Send Video (The Fixed Version)
app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const authHeader = req.headers.authorization;
    const { channelId, title } = req.body;
    const files = req.files;

    // Helper to delete files
    const cleanupFiles = (f) => {
        if (!f) return;
        f.forEach(file => fs.unlink(file.path, () => {}));
    };

    // 1. Validation
    if (authHeader !== DASHBOARD_PASSWORD) {
        cleanupFiles(files);
        return res.status(401).json({ error: 'Invalid Password' });
    }

    if (!channelId || !files || files.length === 0) {
        cleanupFiles(files);
        return res.status(400).json({ error: 'Missing data' });
    }

    // 2. FAST RESPONSE (Prevents 504 Timeout)
    // We tell the browser "Success" immediately, then do the work.
    res.json({ success: true, message: 'Upload received! Sending to Discord in background...' });

    // 3. Background Processing
    (async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');

            const attachments = files.map(file => ({
                attachment: file.path,
                name: file.originalname
            }));

            // This takes time, but the user is already happy
            await channel.send({
                content: `**${title || 'New Video Upload'}**`,
                files: attachments
            });

            console.log(`Successfully sent ${files.length} videos to ${channel.name}`);

        } catch (error) {
            console.error('Background Upload Failed:', error);
            // Since we already told the user "Success", we can't notify them on the dashboard anymore.
            // But the bot logs will show the error.
        } finally {
            cleanupFiles(files);
        }
    })();
});

// --- START ---
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.login(DISCORD_TOKEN);
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
