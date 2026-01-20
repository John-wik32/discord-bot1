const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- CONFIG ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- WEB SERVER SETUP ---
app.use(cors());
app.use(express.json());

// Points exactly to your 'public' folder
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Force the root URL to load your index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Health check for Koyeb
app.get('/health', (req, res) => res.status(200).send('OK'));

// --- DISCORD BOT SETUP ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// API: Get Channels
app.get('/api/channels', async (req, res) => {
    if (req.headers['authorization'] !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });
    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache
                .filter(ch => ch.type === 0) 
                .forEach(ch => channels.push({ id: ch.id, name: `${guild.name} - #${ch.name}` }));
        });
        res.json(channels);
    } catch (err) {
        res.status(500).json({ error: "Failed to load channels" });
    }
});

// Start everything
client.once('ready', () => console.log(`✅ Bot Online: ${client.user.tag}`));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 UI live on port ${PORT}`));
client.login(DISCORD_TOKEN);
