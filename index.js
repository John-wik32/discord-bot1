const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- CONFIG ---
const PORT = process.env.PORT || 8000; // Koyeb uses this
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- DISCORD BOT SETUP ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel]
});

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.login(DISCORD_TOKEN);

// --- EXPRESS DASHBOARD SETUP ---
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves your HTML/CSS/JS

// Auth Middleware
const checkAuth = (req, res, next) => {
    if (req.headers['authorization'] !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Wrong Password' });
    }
    next();
};

// API: Get Channels
app.get('/api/channels', checkAuth, async (req, res) => {
    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache
                .filter(ch => ch.type === 0) // Text channels
                .forEach(ch => {
                    channels.push({ id: ch.id, name: `${guild.name} - #${ch.name}` });
                });
        });
        res.json(channels);
    } catch (err) {
        res.status(500).json({ error: "Failed to load channels" });
    }
});

// API: Post Message
app.post('/api/post', checkAuth, upload.single('mediaFile'), async (req, res) => {
    const { channelId, postTitle } = req.body;
    const file = req.file;

    try {
        const channel = await client.channels.fetch(channelId);
        const options = { content: postTitle || "" };

        if (file) {
            const attachment = new AttachmentBuilder(file.buffer, { name: file.originalname });
            options.files = [attachment];
        }

        await channel.send(options);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard running on port ${PORT}`);
});