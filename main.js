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

// 25MB is the standard limit for non-boosted servers. 
// Change to 50 * 1024 * 1024 or higher if your server is boosted.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; 

// --- SETUP & CLEANUP ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Clean uploads folder on startup to remove stale files
fs.readdir(uploadDir, (err, files) => {
    if (err) return;
    for (const file of files) {
        fs.unlink(path.join(uploadDir, file), () => {});
    }
    console.log('Cleared temp upload folder.');
});

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// --- EXPRESS APP ---
const app = express();
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: MAX_FILE_SIZE_BYTES } // Multer will throw error if too big
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES ---

// 1. Get Channels
app.get('/api/channels', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

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

// 2. Send Video (With Size Error Handling)
app.post('/api/send', (req, res) => {
    // We use a custom wrapper around upload.array to catch File Size errors
    const uploadMiddleware = upload.array('videos', 5);

    uploadMiddleware(req, res, async (err) => {
        const authHeader = req.headers.authorization;
        
        // Helper to delete files
        const cleanupFiles = (files) => {
            if (!files) return;
            files.forEach(file => fs.unlink(file.path, () => {}));
        };

        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: `File too large! Max limit is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` });
            }
            return res.status(500).json({ error: err.message });
        } else if (err) {
            return res.status(500).json({ error: 'Unknown upload error' });
        }

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
                content: `**${title || 'New Video'}**`,
                files: attachments
            });

            res.json({ success: true, message: 'Videos sent successfully!' });

        } catch (error) {
            console.error('Discord Error:', error);
            res.status(500).json({ error: 'Failed to send to Discord.' });
        } finally {
            cleanupFiles(files);
        }
    });
});

// --- START ---
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.login(DISCORD_TOKEN);
app.listen(PORT, () => console.log(`Dashboard on port ${PORT}`));
